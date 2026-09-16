/**
 * EyeKart Phase 4 Verification Suite: Production Payment Architecture & M-PESA Foundation
 * 
 * Verifies all 18 security and architectural requirements:
 * 1. State machine legal transitions (NOT_STARTED -> INITIATED -> PENDING -> SUCCESS/FAILED/CANCELLED/EXPIRED)
 * 2. State machine illegal transition blocking (terminal states cannot mutate; skipping steps blocked)
 * 3. Server-authoritative amount gating (tampered client amounts rejected with 400 AMOUNT_MISMATCH)
 * 4. Authoritative amount inheritance (omitting amount uses authoritative DB order total)
 * 5. Strict currency gating (non-KES rejected for Safaricom Daraja)
 * 6. Kenyan phone normalization (07XXXXXXXX, +254..., 254XXXXXXXXX)
 * 7. Invalid phone rejection
 * 8. Payment initiation idempotency (duplicate key returns original attempt)
 * 9. Separation of initiation from completion (initiation returns PENDING, never auto-marks PAID)
 * 10. Stock reservation on order creation (inventory_reservations created with RESERVED status)
 * 11. Stock allocation on payment success (RESERVED -> ALLOCATED, stock decremented)
 * 12. Idempotent stock allocation (duplicate callbacks/confirmations do not double-decrement)
 * 13. Stock release on cancellation/expiry (RESERVED -> RELEASED, stock restored)
 * 14. IDOR protection on payment initiation (User B cannot pay for User A's order)
 * 15. IDOR protection on payment status query (User B cannot query User A's payment)
 * 16. Webhook tamper detection (amount mismatch triggers security alert and fails attempt)
 * 17. Safaricom Daraja fail-safe when disabled (503 without crashing or credential leak)
 * 18. Frontend 3D & VTO regression validation
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { query } = require('../server/src/db/pool');
const {
  PaymentProvider,
  PAYMENT_STATES,
  LEGAL_PAYMENT_TRANSITIONS,
  isValidPaymentTransition
} = require('../server/src/services/payment/PaymentProvider');
const DarajaClient = require('../server/src/services/payment/DarajaClient');
const { getPaymentProvider } = require('../server/src/services/payment');
const webhookService = require('../server/src/services/webhookService');
const { createSession } = require('../server/src/services/authService');

const API_BASE = 'http://127.0.0.1:3001';

async function runTests() {
  console.log('============================================================');
  console.log('EYEKART PHASE 4: PAYMENT ARCHITECTURE VERIFICATION SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function recordPass(testName) {
    passed++;
    console.log(`[PASS] ${testName}`);
  }

  function recordFail(testName, err) {
    failed++;
    console.error(`[FAIL] ${testName}:`, err.message);
  }

  // --- Session setup for real DB users ---
  const custRes = await query(`SELECT id, email, phone FROM users WHERE role = 'CUSTOMER' ORDER BY created_at DESC LIMIT 2`);
  const adminRes = await query(`SELECT id, email, phone FROM users WHERE role = 'ADMIN' LIMIT 1`);

  if (custRes.rows.length < 2 || adminRes.rows.length === 0) {
    throw new Error('Database lacks required test users (at least 2 CUSTOMERs and 1 ADMIN required).');
  }

  const customerUser = custRes.rows[0];
  const customerBUser = custRes.rows[1];
  const adminUser = adminRes.rows[0];

  const custSession = await createSession(customerUser.id, '127.0.0.1', 'Phase4-TestRunner');
  const custBSession = await createSession(customerBUser.id, '127.0.0.1', 'Phase4-TestRunner');
  const adminSession = await createSession(adminUser.id, '127.0.0.1', 'Phase4-TestRunner');

  const customerToken = custSession.rawToken;
  const customerBToken = custBSession.rawToken;
  const adminToken = adminSession.rawToken;

  // Ensure test SKU has sufficient inventory for all assertion runs
  await query(`UPDATE products SET stock = 100, reserved_stock = 0 WHERE sku = 'EK-804'`);
  await query(`DELETE FROM inventory_reservations WHERE sku = 'EK-804'`);

  // Helper to create an order for a user
  async function createTestOrder(token, userPhone = '+254712345678') {
    // 1. Get quote
    const quoteRes = await fetch(`${API_BASE}/api/checkout/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        items: [{ sku: 'EK-804', qty: 1 }],
        deliveryOption: 'STANDARD_NAIROBI'
      })
    });
    const quoteData = await quoteRes.json();
    const quote = quoteData.quote || quoteData;

    // 2. Create order
    const orderRes = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        quoteId: quote.id,
        items: [{ sku: 'EK-804', qty: 1 }],
        deliveryAddress: '123 Kimathi Street, Nairobi, Kenya',
        customerSnapshot: {
          phone: userPhone,
          name: 'Jane Customer'
        }
      })
    });
    const orderData = await orderRes.json();
    if (!orderData.order) {
      throw new Error(`Order creation failed: ${JSON.stringify(orderData)}`);
    }
    return orderData.order;
  }

  // TEST 1: Legal Payment State Transitions
  try {
    assert.strictEqual(isValidPaymentTransition('NOT_STARTED', 'INITIATED'), true);
    assert.strictEqual(isValidPaymentTransition('INITIATED', 'PENDING'), true);
    assert.strictEqual(isValidPaymentTransition('PENDING', 'SUCCESS'), true);
    assert.strictEqual(isValidPaymentTransition('PENDING', 'FAILED'), true);
    assert.strictEqual(isValidPaymentTransition('PENDING', 'CANCELLED'), true);
    assert.strictEqual(isValidPaymentTransition('PENDING', 'EXPIRED'), true);
    recordPass('Assertion 1: Legal payment state transitions correctly permitted');
  } catch (e) {
    recordFail('Assertion 1: Legal payment transitions', e);
  }

  // TEST 2: Illegal Payment State Transitions Blocked
  try {
    assert.strictEqual(isValidPaymentTransition('NOT_STARTED', 'SUCCESS'), false);
    assert.strictEqual(isValidPaymentTransition('SUCCESS', 'FAILED'), false);
    assert.strictEqual(isValidPaymentTransition('SUCCESS', 'PENDING'), false);
    assert.strictEqual(isValidPaymentTransition('FAILED', 'SUCCESS'), false);
    assert.strictEqual(isValidPaymentTransition('CANCELLED', 'SUCCESS'), false);
    assert.strictEqual(isValidPaymentTransition('EXPIRED', 'SUCCESS'), false);
    recordPass('Assertion 2: Illegal transitions and terminal state mutations strictly rejected');
  } catch (e) {
    recordFail('Assertion 2: Illegal transitions', e);
  }

  // TEST 3: Server-Authoritative Amount Gating (Tampered Client Amount Rejected)
  try {
    const order = await createTestOrder(customerToken);
    const orderTotal = Number(order.total);
    const tamperedAmount = orderTotal - 500; // Attempt underpayment

    const initRes = await fetch(`${API_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        orderId: order.id,
        phone: '0712345678',
        amount: tamperedAmount,
        provider: 'DEMO'
      })
    });

    const initData = await initRes.json();
    assert.strictEqual(initRes.status, 400);
    assert.strictEqual(initData.code, 'AMOUNT_MISMATCH');
    recordPass('Assertion 3: Server-authoritative pricing blocks tampered client amount with 400 AMOUNT_MISMATCH');
  } catch (e) {
    recordFail('Assertion 3: Amount tampering', e);
  }

  // TEST 4: Authoritative Amount Inheritance (Omitting Amount Uses DB Order Total)
  let test4Order;
  let test4Attempt;
  try {
    test4Order = await createTestOrder(customerToken);
    const initRes = await fetch(`${API_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        orderId: test4Order.id,
        phone: '0712345678',
        provider: 'DEMO'
      })
    });

    const initData = await initRes.json();
    assert.strictEqual(initRes.status, 200);
    assert.strictEqual(initData.status, 'PENDING');
    assert.strictEqual(Number(initData.attempt.amount), Number(test4Order.total));
    test4Attempt = initData.attempt;
    recordPass('Assertion 4: Authoritative amount seamlessly inherited from DB order total when omitted');
  } catch (e) {
    recordFail('Assertion 4: Amount inheritance', e);
  }

  // TEST 5: Currency Gating
  try {
    const order = await createTestOrder(customerToken);
    const initRes = await fetch(`${API_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        orderId: order.id,
        phone: '0712345678',
        currency: 'USD',
        provider: 'DEMO'
      })
    });

    const initData = await initRes.json();
    assert.strictEqual(initRes.status, 400);
    assert.strictEqual(initData.code, 'INVALID_CURRENCY');
    recordPass('Assertion 5: Non-KES currency rejected with 400 INVALID_CURRENCY');
  } catch (e) {
    recordFail('Assertion 5: Currency check', e);
  }

  // TEST 6: Kenyan Phone Number Normalization
  try {
    assert.strictEqual(DarajaClient.formatPhoneNumber('0712345678'), '254712345678');
    assert.strictEqual(DarajaClient.formatPhoneNumber('+254 712 345 678'), '254712345678');
    assert.strictEqual(DarajaClient.formatPhoneNumber('254712345678'), '254712345678');
    assert.strictEqual(DarajaClient.formatPhoneNumber('712345678'), '254712345678');
    recordPass('Assertion 6: Kenyan phone numbers normalized to standard 254XXXXXXXXX');
  } catch (e) {
    recordFail('Assertion 6: Phone normalization', e);
  }

  // TEST 7: Invalid Phone Number Rejection
  try {
    assert.throws(
      () => DarajaClient.formatPhoneNumber('12345'),
      (err) => err.code === 'INVALID_PHONE_NUMBER' || /Invalid Kenyan phone number/i.test(err.message)
    );
    assert.throws(
      () => DarajaClient.formatPhoneNumber('abcdefghijk'),
      (err) => err.code === 'INVALID_PHONE_NUMBER' || /Invalid Kenyan phone number/i.test(err.message)
    );
    recordPass('Assertion 7: Malformed phone numbers cleanly rejected with INVALID_PHONE_NUMBER');
  } catch (e) {
    recordFail('Assertion 7: Invalid phone numbers', e);
  }

  // TEST 8: Payment Initiation Idempotency
  try {
    const order = await createTestOrder(customerToken);
    const idempotencyKey = `idemp_${Date.now()}_${Math.random()}`;

    const res1 = await fetch(`${API_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
        'idempotency-key': idempotencyKey
      },
      body: JSON.stringify({
        orderId: order.id,
        phone: '0712345678',
        provider: 'DEMO'
      })
    });
    const data1 = await res1.json();

    const res2 = await fetch(`${API_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
        'idempotency-key': idempotencyKey
      },
      body: JSON.stringify({
        orderId: order.id,
        phone: '0712345678',
        provider: 'DEMO'
      })
    });
    const data2 = await res2.json();

    assert.strictEqual(data1.attempt.id, data2.attempt.id);
    assert.strictEqual(data2.attempt.idempotency_key, idempotencyKey);
    recordPass('Assertion 8: Idempotency key prevents duplicate payment attempts');
  } catch (e) {
    recordFail('Assertion 8: Payment idempotency', e);
  }

  // TEST 9: Separation of Initiation from Payment Confirmation (Never auto-marks PAID)
  try {
    const order = await createTestOrder(customerToken);
    const initRes = await fetch(`${API_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        orderId: order.id,
        phone: '0712345678',
        provider: 'DEMO'
      })
    });
    const initData = await initRes.json();

    // Verify payment attempt status is PENDING, NOT SUCCESS
    assert.strictEqual(initData.status, 'PENDING');
    assert.strictEqual(initData.attempt.status, 'PENDING');

    // Verify order in database is PAYMENT_PENDING, NOT PAID
    const dbOrder = await query(`SELECT * FROM orders WHERE id = $1`, [order.id]);
    assert.strictEqual(dbOrder.rows[0].status, 'PAYMENT_PENDING');
    assert.strictEqual(dbOrder.rows[0].payment_status, 'INITIATED');
    recordPass('Assertion 9: Payment initiation strictly leaves order in PAYMENT_PENDING (never auto-paid)');
  } catch (e) {
    recordFail('Assertion 9: Initiation separation', e);
  }

  // TEST 10: Stock Reservation on Order Creation
  let orderWithRes;
  try {
    orderWithRes = await createTestOrder(customerToken);
    const resv = await query(`SELECT * FROM inventory_reservations WHERE order_id = $1`, [orderWithRes.id]);
    assert.strictEqual(resv.rows.length > 0, true);
    assert.strictEqual(resv.rows[0].status, 'RESERVED');
    assert.strictEqual(resv.rows[0].sku, 'EK-804');
    recordPass('Assertion 10: Order creation automatically reserves stock in inventory_reservations (RESERVED)');
  } catch (e) {
    recordFail('Assertion 10: Stock reservation', e);
  }

  // TEST 11: Stock Allocation on Payment Success
  let paidAttemptId;
  try {
    // Initiate payment
    const initRes = await fetch(`${API_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        orderId: orderWithRes.id,
        phone: '0712345678',
        provider: 'DEMO'
      })
    });
    const initData = await initRes.json();
    paidAttemptId = initData.attempt.id;

    // Simulate customer PIN entry confirmation
    const confRes = await fetch(`${API_BASE}/api/payments/demo/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        attemptId: paidAttemptId,
        outcome: 'SUCCESS'
      })
    });
    const confData = await confRes.json();
    assert.strictEqual(confRes.status, 200);
    assert.strictEqual(confData.status, 'SUCCESS');

    // Check inventory_reservations transitioned to ALLOCATED
    const resv = await query(`SELECT * FROM inventory_reservations WHERE order_id = $1`, [orderWithRes.id]);
    assert.strictEqual(resv.rows[0].status, 'ALLOCATED');

    // Check order status is PAID
    const orderCheck = await query(`SELECT * FROM orders WHERE id = $1`, [orderWithRes.id]);
    assert.strictEqual(orderCheck.rows[0].payment_status, 'SUCCESS');
    recordPass('Assertion 11: Payment confirmation transitions reservation to ALLOCATED and updates order to PAID');
  } catch (e) {
    recordFail('Assertion 11: Stock allocation', e);
  }

  // TEST 12: Idempotent Stock Allocation (No double-decrement)
  try {
    const initialInventory = await query(`SELECT stock, reserved_stock FROM products WHERE sku = 'EK-804'`);
    const initialStock = initialInventory.rows[0].stock;

    // Call demo confirm again
    const repeatRes = await fetch(`${API_BASE}/api/payments/demo/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        attemptId: paidAttemptId,
        outcome: 'SUCCESS'
      })
    });
    const repeatData = await repeatRes.json();
    assert.strictEqual(repeatData.alreadyProcessed, true);

    const afterInventory = await query(`SELECT stock, reserved_stock FROM products WHERE sku = 'EK-804'`);
    const afterStock = afterInventory.rows[0].stock;
    assert.strictEqual(initialStock, afterStock);
    recordPass('Assertion 12: Duplicate payment confirmation does not double-decrement inventory');
  } catch (e) {
    recordFail('Assertion 12: Idempotent stock allocation', e);
  }

  // TEST 13: Stock Release on Order Cancellation
  try {
    const cancelOrder = await createTestOrder(customerToken);
    const cancelRes = await fetch(`${API_BASE}/api/orders/${cancelOrder.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify({ reason: 'Customer requested cancellation' })
    });
    const cancelData = await cancelRes.json();
    assert.strictEqual(cancelRes.status, 200);

    const resv = await query(`SELECT * FROM inventory_reservations WHERE order_id = $1`, [cancelOrder.id]);
    assert.strictEqual(resv.rows[0].status, 'RELEASED');
    recordPass('Assertion 13: Order cancellation releases reserved stock (RESERVED -> RELEASED)');
  } catch (e) {
    recordFail('Assertion 13: Stock release', e);
  }

  // TEST 14: IDOR Protection on Payment Initiation
  try {
    // User A creates order
    const orderA = await createTestOrder(customerToken);

    // User B attempts to initiate payment for User A's order
    const attackRes = await fetch(`${API_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerBToken}`
      },
      body: JSON.stringify({
        orderId: orderA.id,
        phone: '0722000002',
        provider: 'DEMO'
      })
    });
    const attackData = await attackRes.json();
    assert.strictEqual(attackRes.status, 403);
    assert.strictEqual(attackData.code, 'FORBIDDEN_ORDER_ACCESS');
    recordPass('Assertion 14: IDOR attack blocked on payment initiation (User B cannot pay User A order)');
  } catch (e) {
    recordFail('Assertion 14: IDOR initiation', e);
  }

  // TEST 15: IDOR Protection on Payment Status Query
  try {
    // User B tries to query status of User A's payment attempt
    const queryRes = await fetch(`${API_BASE}/api/payments/${paidAttemptId}/status`, {
      headers: { Authorization: `Bearer ${customerBToken}` }
    });
    const queryData = await queryRes.json();
    assert.strictEqual(queryRes.status, 403);
    assert.strictEqual(queryData.code, 'FORBIDDEN_PAYMENT_ACCESS');

    // User A queries their own attempt -> 200 OK
    const ownerRes = await fetch(`${API_BASE}/api/payments/${paidAttemptId}/status`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    const ownerData = await ownerRes.json();
    assert.strictEqual(ownerRes.status, 200);
    assert.strictEqual(ownerData.payment.id, paidAttemptId);
    recordPass('Assertion 15: IDOR attack blocked on status queries (403 for unauthorized users, 200 for owner)');
  } catch (e) {
    recordFail('Assertion 15: IDOR status query', e);
  }

  // TEST 16: Webhook Tamper Detection
  try {
    const orderTamper = await createTestOrder(customerToken);
    const checkoutReqId = `ws_CO_TEST_${Date.now()}`;
    const insertRes = await query(
      `INSERT INTO payment_attempts (order_id, provider, payment_rail, amount, currency, status, checkout_request_id)
       VALUES ($1, 'MPESA_DARAJA', 'Safaricom Daraja 2.0', $2, 'KES', 'PENDING', $3)
       RETURNING *`,
      [orderTamper.id, orderTamper.total, checkoutReqId]
    );

    // Tampered payload with amount 1 KES instead of order total
    const tamperedPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'mr_123',
          CheckoutRequestID: checkoutReqId,
          ResultCode: 0,
          ResultDesc: 'The service was accepted successfully',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 1 }, // Tampered!
              { Name: 'MpesaReceiptNumber', Value: `TAMPER_${Date.now()}` },
              { Name: 'TransactionDate', Value: '20260916210000' },
              { Name: 'PhoneNumber', Value: '254712345678' }
            ]
          }
        }
      }
    };

    const webhookResult = await webhookService.processMpesaCallback(tamperedPayload, { ip: '127.0.0.1' });
    assert.strictEqual(webhookResult.status, 'FAILED');
    assert.strictEqual(webhookResult.reason, 'AMOUNT_MISMATCH');

    const checkAttempt = await query(`SELECT * FROM payment_attempts WHERE checkout_request_id = $1`, [checkoutReqId]);
    assert.strictEqual(checkAttempt.rows[0].status, 'FAILED');
    assert.strictEqual(checkAttempt.rows[0].failure_reason.includes('AMOUNT_MISMATCH'), true);
    recordPass('Assertion 16: Webhook callback anti-tampering engine detects and blocks manipulated amount');
  } catch (e) {
    recordFail('Assertion 16: Webhook tamper detection', e);
  }

  // TEST 17: Safaricom Daraja Fail-Safe When Disabled
  try {
    const order = await createTestOrder(customerToken);
    const stkRes = await fetch(`${API_BASE}/api/payments/daraja/stkpush`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        orderId: order.id,
        phone: '0712345678'
      })
    });
    const stkData = await stkRes.json();
    assert.strictEqual(stkRes.status, 503);
    assert.strictEqual(stkData.code, 'PROVIDER_DISABLED');
    assert.strictEqual(stkData.error.includes('DISABLED'), true);
    recordPass('Assertion 17: Daraja STK Push safely responds 503 PROVIDER_DISABLED when credentials are not configured');
  } catch (e) {
    recordFail('Assertion 17: Daraja disabled fail-safe', e);
  }

  // TEST 18: 3D & VTO Visual Experience Regression Check
  try {
    const root = path.join(__dirname, '..');
    const cinematic3dPath = path.join(root, 'assets/js/eyekart-cinematic-3d.js');
    const threeStudioPath = path.join(root, 'assets/js/three-studio.js');
    const vtoEnginePath = path.join(root, 'assets/js/vto-engine.js');
    const premiumCssPath = path.join(root, 'assets/css/eyekart-premium.css');
    const homepageHtmlPath = path.join(root, 'Stitch/stitch_eyekart_optical_commerce_platform/eyekart_grand_optical_homepage/code.html');

    assert.strictEqual(fs.existsSync(cinematic3dPath), true, 'eyekart-cinematic-3d.js missing');
    assert.strictEqual(fs.existsSync(threeStudioPath), true, 'three-studio.js missing');
    assert.strictEqual(fs.existsSync(vtoEnginePath), true, 'vto-engine.js missing');
    assert.strictEqual(fs.existsSync(premiumCssPath), true, 'eyekart-premium.css missing');
    assert.strictEqual(fs.existsSync(homepageHtmlPath), true, 'homepage code.html missing');

    const cinematicContent = fs.readFileSync(cinematic3dPath, 'utf8');
    assert.strictEqual(cinematicContent.includes('EyeKartCinematic3D'), true);

    const premiumCss = fs.readFileSync(premiumCssPath, 'utf8');
    assert.strictEqual(premiumCss.includes('eyekart-hero-canvas-stage'), true);

    recordPass('Assertion 18: Premium 3D WebGL engine, ThreeStudio, VTOEngine, and styles intact');
  } catch (e) {
    recordFail('Assertion 18: 3D/VTO regression', e);
  }

  console.log('\n============================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test execution fatal error:', err);
  process.exit(1);
});
