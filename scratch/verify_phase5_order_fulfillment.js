/**
 * EyeKart Phase 5 Verification Suite: Production Orders, Checkout & Fulfillment Hardening
 * 
 * Verifies all 20 security, transactional, and architectural requirements:
 * 1. Legal order transitions (CREATED -> PAYMENT_PENDING -> PAID -> PROCESSING -> COMPLETED)
 * 2. Illegal transition rejection (terminal states immutable; backward transitions blocked)
 * 3. Customer order ownership & scoping (GET /api/orders returns only user's orders)
 * 4. IDOR protection across view, cancel, status, fulfillment eligibility, and tracking
 * 5. Server-authoritative pricing (ignores client totals, recalculates from canonical catalog)
 * 6. Invalid quantity rejection (<= 0, > 100, non-integer)
 * 7. Unknown SKU rejection (non-existent SKU rejected)
 * 8. Inventory reservation on order creation (reserved_stock incremented, reservation status = RESERVED)
 * 9. Atomic transaction rollback on insufficient stock (no orphan order created on reservation failure)
 * 10. Payment success reconciliation & stock allocation (RESERVED -> ALLOCATED, physical stock decremented)
 * 11. Payment failure safety (no allocation, retry allowed)
 * 12. Payment expiration safety (reserved stock released)
 * 13. Cancellation safety (releasing RESERVED stock; physical restock if already ALLOCATED)
 * 14. Payment retry safety (new payment attempt reuses existing reservation, no duplicate reservation)
 * 15. Duplicate callback safety (idempotent callback prevents double allocation)
 * 16. Optical prescription fulfillment gating (custom prescription orders blocked until optometrist approval)
 * 17. Unpaid fulfillment gating (unpaid orders blocked from entering fulfillment)
 * 18. Historical order item snapshot immutability (catalog price mutation does not affect historical orders)
 * 19. Concurrent / race-sensitive inventory safety (row-locking protects against race conditions)
 * 20. Existing 3D/VTO and Stitch UI regression check
 * 
 * Plus: Administrative order management validation (GET /api/admin/orders)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { query, getClient } = require('../server/src/db/pool');
const { createSession } = require('../server/src/services/authService');
const {
  ORDER_STATES,
  LEGAL_ORDER_TRANSITIONS,
  isValidOrderTransition,
  updateOrderStatus,
  cancelOrder,
  createOrderFromQuote
} = require('../server/src/services/orderService');
const {
  reserveStock,
  allocateStock,
  releaseStock
} = require('../server/src/services/inventoryService');
const {
  createFulfillment,
  transitionFulfillment,
  getFulfillmentByOrderId,
  FULFILLMENT_STATES
} = require('../server/src/services/fulfillmentService');
const { checkOrderFulfillmentEligibility } = require('../server/src/services/gatingService');
const { handleDemoWebhook } = require('../server/src/services/webhookService');

const API_BASE = 'http://127.0.0.1:3001';

async function runPhase5Verification() {
  console.log('============================================================');
  console.log('EYEKART PHASE 5: PRODUCTION ORDERS & FULFILLMENT HARDENING');
  console.log('VERIFICATION & FORENSIC AUDIT SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function recordPass(title) {
    passed++;
    console.log(`[PASS] ${title}`);
  }

  function recordFail(title, err) {
    failed++;
    console.error(`[FAIL] ${title}:`, err.message || err);
  }

  // --- Session & Test User Setup ---
  const custRes = await query(`SELECT id, email, phone, role, full_name FROM users WHERE role = 'CUSTOMER' ORDER BY email ASC LIMIT 2`);
  const adminRes = await query(`SELECT id, email, phone, role, full_name FROM users WHERE role = 'ADMIN' LIMIT 1`);
  const optomRes = await query(`SELECT id, email, phone, role, full_name FROM users WHERE role = 'OPTOMETRIST' LIMIT 1`);
  const staffRes = await query(`SELECT id, email, phone, role, full_name FROM users WHERE role = 'STORE_STAFF' LIMIT 1`);

  if (custRes.rows.length < 2 || !adminRes.rows.length || !optomRes.rows.length || !staffRes.rows.length) {
    throw new Error('Database lacks required test roles (at least 2 CUSTOMERs, 1 ADMIN, 1 OPTOMETRIST, 1 STORE_STAFF required).');
  }

  const custA = custRes.rows[0];
  const custB = custRes.rows[1];
  const adminUser = adminRes.rows[0];
  const optomUser = optomRes.rows[0];
  const staffUser = staffRes.rows[0];

  const sessionCustA = await createSession(custA.id, '127.0.0.1', 'Phase5-Verifier');
  const sessionCustB = await createSession(custB.id, '127.0.0.1', 'Phase5-Verifier');
  const sessionAdmin = await createSession(adminUser.id, '127.0.0.1', 'Phase5-Verifier');
  const sessionOptom = await createSession(optomUser.id, '127.0.0.1', 'Phase5-Verifier');
  const sessionStaff = await createSession(staffUser.id, '127.0.0.1', 'Phase5-Verifier');

  const tokenA = sessionCustA.rawToken;
  const tokenB = sessionCustB.rawToken;
  const tokenAdmin = sessionAdmin.rawToken;
  const tokenOptom = sessionOptom.rawToken;
  const tokenStaff = sessionStaff.rawToken;

  // Reset inventory for test SKUs to clean state
  await query(`UPDATE products SET stock = 50, reserved_stock = 0 WHERE sku IN ('EK-804', 'EK-102')`);
  await query(`DELETE FROM inventory_reservations WHERE sku IN ('EK-804', 'EK-102')`);

  // Helper to create an authoritative order via API
  async function apiCreateOrder(token, sku = 'EK-804', qty = 1, extra = {}) {
    // 1. Get quote
    const quoteRes = await fetch(`${API_BASE}/api/checkout/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        items: [{ sku, qty }],
        deliveryOption: extra.deliveryOption || 'STANDARD_NAIROBI'
      })
    });
    const quoteData = await quoteRes.json();
    assert.strictEqual([200, 201].includes(quoteRes.status), true, `Quote generation failed: ${JSON.stringify(quoteData)}`);
    const quote = quoteData.quote || quoteData;

    // 2. Post order
    const orderRes = await fetch(`${API_BASE}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        quoteId: quote.quoteId || quote.id,
        items: quote.items,
        deliveryAddress: {
          county: 'Nairobi',
          estate: 'Kilimani',
          street: 'Argwings Kodhek Rd',
          landmark: 'Yaya Centre'
        },
        gateProtocol: {
          estateGateName: 'Gate A',
          requiresPasscode: false
        },
        prescriptionSnapshot: extra.prescriptionSnapshot || null
      })
    });
    const orderData = await orderRes.json();
    assert.strictEqual(orderRes.status, 201, `Order creation failed: ${JSON.stringify(orderData)}`);
    return orderData.order;
  }

  // =========================================================================
  // REQUIREMENT 1: Legal Order Transitions
  // =========================================================================
  try {
    const legalSeq = ['CREATED', 'PAYMENT_PENDING', 'PAID', 'PROCESSING', 'COMPLETED'];
    for (let i = 0; i < legalSeq.length - 1; i++) {
      const from = legalSeq[i];
      const to = legalSeq[i + 1];
      assert.strictEqual(
        isValidOrderTransition(from, to),
        true,
        `Expected ${from} -> ${to} to be valid`
      );
    }
    assert.strictEqual(isValidOrderTransition('CREATED', 'CANCELLED'), true);
    assert.strictEqual(isValidOrderTransition('PAYMENT_PENDING', 'CANCELLED'), true);
    assert.strictEqual(isValidOrderTransition('PAYMENT_PENDING', 'EXPIRED'), true);
    assert.strictEqual(isValidOrderTransition('PROCESSING', 'CANCELLED'), true);
    recordPass('1. Legal order transitions validated across canonical lifecycle');
  } catch (err) {
    recordFail('1. Legal order transitions', err);
  }

  // =========================================================================
  // REQUIREMENT 2: Illegal Transition Rejection
  // =========================================================================
  try {
    assert.strictEqual(isValidOrderTransition('COMPLETED', 'PROCESSING'), false);
    assert.strictEqual(isValidOrderTransition('COMPLETED', 'CREATED'), false);
    assert.strictEqual(isValidOrderTransition('CANCELLED', 'PAID'), false);
    assert.strictEqual(isValidOrderTransition('EXPIRED', 'PAID'), false);
    assert.strictEqual(isValidOrderTransition('PAYMENT_PENDING', 'CREATED'), false); // strictly forbidden backward mutation

    // Test runtime rejection
    const testOrder = await apiCreateOrder(tokenA, 'EK-804', 1);
    await updateOrderStatus(testOrder.id, 'PAYMENT_PENDING', 'ADMIN');
    
    let caught = false;
    try {
      await updateOrderStatus(testOrder.id, 'CREATED', 'ADMIN');
    } catch (e) {
      caught = true;
      assert.strictEqual(['ILLEGAL_ORDER_TRANSITION', 'ILLEGAL_ORDER_STATE_TRANSITION'].includes(e.code), true);
    }
    assert.strictEqual(caught, true, 'Backward transition PAYMENT_PENDING -> CREATED should be rejected');
    recordPass('2. Illegal transitions & backward mutations strictly rejected');
  } catch (err) {
    recordFail('2. Illegal transition rejection', err);
  }

  // =========================================================================
  // REQUIREMENT 3: Customer Order Ownership & Scoping
  // =========================================================================
  try {
    const orderA = await apiCreateOrder(tokenA, 'EK-804', 1);
    const orderB = await apiCreateOrder(tokenB, 'EK-804', 1);

    const listResA = await fetch(`${API_BASE}/api/orders`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const listDataA = await listResA.json();
    assert.strictEqual(listResA.status, 200);
    const orderIdsA = listDataA.orders.map(o => o.id);
    assert.strictEqual(orderIdsA.includes(orderA.id), true, 'Customer A must see own order');
    assert.strictEqual(orderIdsA.includes(orderB.id), false, 'Customer A must NEVER see Customer B order in list');

    const listResB = await fetch(`${API_BASE}/api/orders`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const listDataB = await listResB.json();
    assert.strictEqual(listResB.status, 200);
    const orderIdsB = listDataB.orders.map(o => o.id);
    assert.strictEqual(orderIdsB.includes(orderB.id), true, 'Customer B must see own order');
    assert.strictEqual(orderIdsB.includes(orderA.id), false, 'Customer B must NEVER see Customer A order in list');

    recordPass('3. Customer order listing strictly scoped to authenticated owner');
  } catch (err) {
    recordFail('3. Customer order ownership & scoping', err);
  }

  // =========================================================================
  // REQUIREMENT 4: IDOR Protection on View, Cancel, Status, Fulfillment, Tracking
  // =========================================================================
  try {
    const targetOrder = await apiCreateOrder(tokenA, 'EK-804', 1);

    // 1. GET /api/orders/:id (Customer B attempting to read Customer A's order)
    const viewRes = await fetch(`${API_BASE}/api/orders/${targetOrder.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.strictEqual(viewRes.status, 403, 'Customer B should get 403 reading Customer A order');

    // 2. POST /api/orders/:id/cancel (Customer B attempting to cancel Customer A's order)
    const cancelRes = await fetch(`${API_BASE}/api/orders/${targetOrder.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`
      },
      body: JSON.stringify({ reason: 'Malicious cancellation attempt' })
    });
    assert.strictEqual(cancelRes.status, 403, 'Customer B should get 403 cancelling Customer A order');

    // 3. PATCH /api/orders/:id/status (Customer attempting operational state mutation)
    const statusRes = await fetch(`${API_BASE}/api/orders/${targetOrder.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ status: 'COMPLETED' })
    });
    assert.strictEqual(statusRes.status, 403, 'Customer should get 403 mutating order status directly');

    // 4. GET /api/orders/:id/fulfillment-eligibility (Customer B querying Customer A)
    const eligRes = await fetch(`${API_BASE}/api/orders/${targetOrder.id}/fulfillment-eligibility`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.strictEqual(eligRes.status, 403, 'Customer B should get 403 querying fulfillment eligibility for Customer A order');

    // 5. GET /api/orders/:id/tracking (Customer B querying Customer A)
    const trackRes = await fetch(`${API_BASE}/api/orders/${targetOrder.id}/tracking`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.strictEqual(trackRes.status, 403, 'Customer B should get 403 accessing tracking for Customer A order');

    recordPass('4. IDOR strictly blocked across order view, cancel, status, eligibility, and tracking');
  } catch (err) {
    recordFail('4. IDOR protection', err);
  }

  // =========================================================================
  // REQUIREMENT 5: Server-Authoritative Pricing
  // =========================================================================
  try {
    // Attempt quote with tampered client totals and unit prices
    const quoteRes = await fetch(`${API_BASE}/api/checkout/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        items: [{ sku: 'EK-804', qty: 2, price: 1, subtotal: 2, total: 2 }],
        total: 10
      })
    });
    const quoteData = await quoteRes.json();
    assert.strictEqual([200, 201].includes(quoteRes.status), true);
    const quote = quoteData.quote || quoteData;

    const prodRes = await query(`SELECT base_price FROM products WHERE sku = 'EK-804'`);
    const canonicalPrice = parseFloat(prodRes.rows[0].base_price);
    const expectedSubtotal = canonicalPrice * 2;
    const expectedTotal = expectedSubtotal + (quote.deliveryFee || 0);

    assert.strictEqual(parseFloat(quote.subtotal), expectedSubtotal, 'Subtotal must match canonical DB price * qty');
    assert.strictEqual(parseFloat(quote.total), expectedTotal, 'Total must include canonical shipping and canonical subtotal');
    recordPass('5. Server-authoritative pricing strictly enforced (client totals ignored)');
  } catch (err) {
    recordFail('5. Server-authoritative pricing', err);
  }

  // =========================================================================
  // REQUIREMENT 6: Invalid Quantity Rejection (<= 0, > 100, non-integer)
  // =========================================================================
  try {
    // 0 qty
    const zeroRes = await fetch(`${API_BASE}/api/checkout/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ items: [{ sku: 'EK-804', qty: 0 }] })
    });
    assert.strictEqual(zeroRes.status, 400);

    // Negative qty
    const negRes = await fetch(`${API_BASE}/api/checkout/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ items: [{ sku: 'EK-804', qty: -5 }] })
    });
    assert.strictEqual(negRes.status, 400);

    // Excessive qty (> 100)
    const excessRes = await fetch(`${API_BASE}/api/checkout/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ items: [{ sku: 'EK-804', qty: 101 }] })
    });
    assert.strictEqual(excessRes.status, 400);

    // Decimal qty
    const decimalRes = await fetch(`${API_BASE}/api/checkout/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ items: [{ sku: 'EK-804', qty: 1.5 }] })
    });
    assert.strictEqual(decimalRes.status, 400);

    recordPass('6. Invalid quantities (<= 0, > 100, non-integer) strictly rejected with 400');
  } catch (err) {
    recordFail('6. Invalid quantity rejection', err);
  }

  // =========================================================================
  // REQUIREMENT 7: Unknown SKU Rejection
  // =========================================================================
  try {
    const unknownRes = await fetch(`${API_BASE}/api/checkout/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ items: [{ sku: 'NON_EXISTENT_SKU_9999', qty: 1 }] })
    });
    assert.strictEqual(unknownRes.status, 400);
    const data = await unknownRes.json();
    assert.strictEqual(data.code, 'INVALID_CHECKOUT_ITEMS');
    recordPass('7. Unknown / non-existent SKU strictly rejected with 400');
  } catch (err) {
    recordFail('7. Unknown SKU rejection', err);
  }

  // =========================================================================
  // REQUIREMENT 8: Inventory Reservation on Order Creation
  // =========================================================================
  try {
    const beforeProd = await query(`SELECT stock, reserved_stock FROM products WHERE sku = 'EK-804'`);
    const beforeReserved = beforeProd.rows[0].reserved_stock;

    const order = await apiCreateOrder(tokenA, 'EK-804', 2);

    const afterProd = await query(`SELECT stock, reserved_stock FROM products WHERE sku = 'EK-804'`);
    assert.strictEqual(
      afterProd.rows[0].reserved_stock,
      beforeReserved + 2,
      'Product reserved_stock must increment by exactly ordered quantity'
    );

    const resCheck = await query(
      `SELECT * FROM inventory_reservations WHERE order_id = $1 AND sku = 'EK-804'`,
      [order.id]
    );
    assert.strictEqual(resCheck.rows.length, 1);
    assert.strictEqual(resCheck.rows[0].qty, 2);
    assert.strictEqual(resCheck.rows[0].status, 'RESERVED');
    recordPass('8. Inventory reserved atomically on order creation (status=RESERVED, reserved_stock incremented)');
  } catch (err) {
    recordFail('8. Inventory reservation on order creation', err);
  }

  // =========================================================================
  // REQUIREMENT 9: Atomic Transaction Rollback on Insufficient Stock
  // =========================================================================
  try {
    // Set EK-102 stock to 1, reserved_stock to 0
    await query(`UPDATE products SET stock = 1, reserved_stock = 0 WHERE sku = 'EK-102'`);
    await query(`DELETE FROM inventory_reservations WHERE sku = 'EK-102'`);

    // Attempt to create quote and order for 5 units (exceeding stock)
    const quoteRes = await fetch(`${API_BASE}/api/checkout/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ items: [{ sku: 'EK-102', qty: 5 }] })
    });
    // Checkout quote pre-validates stock
    assert.strictEqual(quoteRes.status, 400, 'Quote should fail on insufficient stock');

    // Now test directly at orderService.createOrderFromQuote level using an artificially high qty
    // to verify database rollback prevents orphan order rows
    const countBefore = await query(`SELECT count(*) FROM orders`);
    let orderCreateFailed = false;
    try {
      await createOrderFromQuote({
        userId: custA.id,
        items: [{ sku: 'EK-102', qty: 5, price: 10000, name: 'Artisan Square Acetate' }],
        deliveryAddress: 'Argwings Kodhek Rd, Kilimani, Nairobi'
      });
    } catch (e) {
      orderCreateFailed = true;
      assert.strictEqual(e.code, 'INSUFFICIENT_STOCK');
    }
    assert.strictEqual(orderCreateFailed, true, 'createOrderFromQuote must reject insufficient stock');

    const countAfter = await query(`SELECT count(*) FROM orders`);
    assert.strictEqual(
      parseInt(countBefore.rows[0].count, 10),
      parseInt(countAfter.rows[0].count, 10),
      'No orphan order row may exist after inventory reservation failure'
    );
    recordPass('9. Atomic transaction rollback prevents orphan orders on insufficient stock');
  } catch (err) {
    recordFail('9. Atomic transaction rollback', err);
  }

  // =========================================================================
  // REQUIREMENT 10: Payment Success Reconciliation & Stock Allocation
  // =========================================================================
  try {
    await query(`UPDATE products SET stock = 20, reserved_stock = 0 WHERE sku = 'EK-804'`);
    const order = await apiCreateOrder(tokenA, 'EK-804', 1);

    // Initiate payment
    const payRes = await fetch(`${API_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        orderId: order.id,
        phone: '0712345678',
        provider: 'DEMO'
      })
    });
    const payData = await payRes.json();
    assert.strictEqual(payRes.status, 200);
    const attemptId = payData.attempt ? payData.attempt.id : payData.attemptId;

    // Simulate success confirmation via demo endpoint
    const confRes = await fetch(`${API_BASE}/api/payments/demo/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        attemptId,
        outcome: 'SUCCESS'
      })
    });
    assert.strictEqual(confRes.status, 200);

    // Check order state
    const orderCheck = await query(`SELECT status, payment_status FROM orders WHERE id = $1`, [order.id]);
    assert.strictEqual(orderCheck.rows[0].payment_status, 'SUCCESS');
    assert.strictEqual(['PAID', 'PROCESSING'].includes(orderCheck.rows[0].status), true);

    // Check reservation converted to ALLOCATED
    const resCheck = await query(`SELECT status FROM inventory_reservations WHERE order_id = $1`, [order.id]);
    assert.strictEqual(resCheck.rows[0].status, 'ALLOCATED');

    // Check physical stock decremented and reserved_stock restored to 0
    const prodCheck = await query(`SELECT stock, reserved_stock FROM products WHERE sku = 'EK-804'`);
    assert.strictEqual(prodCheck.rows[0].stock, 19, 'Physical stock must be decremented by 1');
    assert.strictEqual(prodCheck.rows[0].reserved_stock, 0, 'reserved_stock must be 0 after allocation');

    recordPass('10. Payment success reconciles order and transitions inventory to ALLOCATED');
  } catch (err) {
    recordFail('10. Payment success reconciliation', err);
  }

  // =========================================================================
  // REQUIREMENT 11: Payment Failure Safety
  // =========================================================================
  try {
    const order = await apiCreateOrder(tokenA, 'EK-804', 1);
    const payRes = await fetch(`${API_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        orderId: order.id,
        phone: '0712345678',
        provider: 'DEMO'
      })
    });
    const payData = await payRes.json();
    const attemptId = payData.attempt ? payData.attempt.id : payData.attemptId;

    // Trigger failure callback
    const confRes = await fetch(`${API_BASE}/api/payments/demo/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        attemptId,
        outcome: 'FAILED'
      })
    });
    assert.strictEqual(confRes.status, 200);

    // Order payment_status should be FAILED
    const orderCheck = await query(`SELECT payment_status FROM orders WHERE id = $1`, [order.id]);
    assert.strictEqual(orderCheck.rows[0].payment_status, 'FAILED');

    // Reservation should remain RESERVED (retry permitted before expiry)
    const resCheck = await query(`SELECT status FROM inventory_reservations WHERE order_id = $1`, [order.id]);
    assert.strictEqual(resCheck.rows[0].status, 'RESERVED');

    // New payment attempt is allowed
    const retryRes = await fetch(`${API_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        orderId: order.id,
        phone: '0712345678',
        provider: 'DEMO'
      })
    });
    assert.strictEqual(retryRes.status, 200, 'Payment retry must succeed after failure');
    recordPass('11. Payment failure maintains reservation and permits customer retry');
  } catch (err) {
    recordFail('11. Payment failure safety', err);
  }

  // =========================================================================
  // REQUIREMENT 12: Payment Expiration Safety
  // =========================================================================
  try {
    const beforeProd = await query(`SELECT reserved_stock FROM products WHERE sku = 'EK-804'`);
    const initialReserved = beforeProd.rows[0].reserved_stock;

    const order = await apiCreateOrder(tokenA, 'EK-804', 1);
    const midProd = await query(`SELECT reserved_stock FROM products WHERE sku = 'EK-804'`);
    assert.strictEqual(midProd.rows[0].reserved_stock, initialReserved + 1);

    // Release stock simulating expiration
    await releaseStock({ orderId: order.id, actorRole: 'SYSTEM' });

    const finalProd = await query(`SELECT reserved_stock FROM products WHERE sku = 'EK-804'`);
    assert.strictEqual(finalProd.rows[0].reserved_stock, initialReserved, 'Reserved stock must be released on expiry');

    const resCheck = await query(`SELECT status FROM inventory_reservations WHERE order_id = $1`, [order.id]);
    assert.strictEqual(resCheck.rows[0].status, 'RELEASED');
    recordPass('12. Payment expiration releases reserved inventory back to available pool');
  } catch (err) {
    recordFail('12. Payment expiration safety', err);
  }

  // =========================================================================
  // REQUIREMENT 13: Cancellation Safety (RESERVED and ALLOCATED Restock)
  // =========================================================================
  try {
    // 13A: Cancel order while RESERVED
    const orderReserved = await apiCreateOrder(tokenA, 'EK-804', 1);
    const cancelRes = await fetch(`${API_BASE}/api/orders/${orderReserved.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ reason: 'Changed my mind before payment' })
    });
    assert.strictEqual(cancelRes.status, 200);
    const resA = await query(`SELECT status FROM inventory_reservations WHERE order_id = $1`, [orderReserved.id]);
    assert.strictEqual(resA.rows[0].status, 'RELEASED');

    // 13B: Cancel order after payment ALLOCATED (physical restock)
    const orderPaid = await apiCreateOrder(tokenA, 'EK-804', 2);
    // Allocate stock
    await allocateStock({ orderId: orderPaid.id, actorRole: 'ADMIN' });
    const stockAfterAlloc = await query(`SELECT stock FROM products WHERE sku = 'EK-804'`);

    // Admin cancels paid order
    await cancelOrder(orderPaid.id, adminUser.id, 'ADMIN', 'Order cancelled post-payment by Admin');
    const stockAfterCancel = await query(`SELECT stock FROM products WHERE sku = 'EK-804'`);
    assert.strictEqual(
      stockAfterCancel.rows[0].stock,
      stockAfterAlloc.rows[0].stock + 2,
      'Physical stock must be restocked by exactly 2 units on cancellation of ALLOCATED order'
    );
    recordPass('13. Order cancellation releases reserved stock and restocks physical units if allocated');
  } catch (err) {
    recordFail('13. Cancellation safety', err);
  }

  // =========================================================================
  // REQUIREMENT 14: Payment Retry Safety (Single Active Reservation)
  // =========================================================================
  try {
    const order = await apiCreateOrder(tokenA, 'EK-804', 1);

    // Attempt 1
    await fetch(`${API_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ orderId: order.id, paymentMethod: 'MPESA', phoneNumber: '0712345678' })
    });

    // Attempt 2
    await fetch(`${API_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ orderId: order.id, paymentMethod: 'MPESA', phoneNumber: '0798765432' })
    });

    // Ensure there is exactly 1 reservation for this order
    const reservations = await query(`SELECT * FROM inventory_reservations WHERE order_id = $1`, [order.id]);
    assert.strictEqual(reservations.rows.length, 1, 'Payment retries must NOT create duplicate reservations');
    recordPass('14. Payment retry safely reuses single reservation without double-counting');
  } catch (err) {
    recordFail('14. Payment retry safety', err);
  }

  // =========================================================================
  // REQUIREMENT 15: Duplicate Callback Safety (No Double Allocation)
  // =========================================================================
  try {
    const order = await apiCreateOrder(tokenA, 'EK-804', 1);
    const payRes = await fetch(`${API_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ orderId: order.id, phone: '0712345678', provider: 'DEMO' })
    });
    const payData = await payRes.json();
    const attemptId = payData.attempt ? payData.attempt.id : payData.attemptId;

    // Confirmation 1
    await fetch(`${API_BASE}/api/payments/demo/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ attemptId, outcome: 'SUCCESS' })
    });
    const stockAfterFirst = (await query(`SELECT stock FROM products WHERE sku = 'EK-804'`)).rows[0].stock;

    // Confirmation 2 (Duplicate)
    await fetch(`${API_BASE}/api/payments/demo/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ attemptId, outcome: 'SUCCESS' })
    });
    const stockAfterSecond = (await query(`SELECT stock FROM products WHERE sku = 'EK-804'`)).rows[0].stock;

    assert.strictEqual(stockAfterFirst, stockAfterSecond, 'Duplicate callback must not double-decrement physical stock');
    recordPass('15. Duplicate payment callback is strictly idempotent with zero double-allocation');
  } catch (err) {
    recordFail('15. Duplicate callback safety', err);
  }

  // =========================================================================
  // REQUIREMENT 16: Optical Prescription Fulfillment Gating
  // =========================================================================
  try {
    // Create an order requiring prescription review
    const rxOrder = await apiCreateOrder(tokenA, 'EK-804', 1, {
      prescriptionSnapshot: {
        sphereOD: -2.50,
        cylinderOD: -0.75,
        axisOD: 180,
        sphereOS: -2.25,
        pd: 63
      }
    });

    // Mark paid
    await query(`UPDATE orders SET payment_status = 'SUCCESS', status = 'PAID' WHERE id = $1`, [rxOrder.id]);

    // Check fulfillment eligibility before optometrist review
    const eligPending = await checkOrderFulfillmentEligibility(rxOrder.id, custA.id, 'CUSTOMER');
    assert.strictEqual(eligPending.fulfillmentEligible, false, 'Optical order must not be eligible before Rx approval');
    assert.strictEqual(eligPending.status, 'BLOCKED_PRESCRIPTION_PENDING');

    // Attempting createFulfillment must fail with 400
    let fFailed = false;
    try {
      await createFulfillment({
        orderId: rxOrder.id,
        actorId: staffUser.id,
        actorRole: 'STORE_STAFF'
      });
    } catch (e) {
      fFailed = true;
      assert.strictEqual(e.code, 'OPTICAL_GATE_BLOCKED');
    }
    assert.strictEqual(fFailed, true, 'createFulfillment must reject unapproved optical prescription');

    // Optometrist approves prescription
    await query(`UPDATE orders SET prescription_status = 'APPROVED' WHERE id = $1`, [rxOrder.id]);

    const eligApproved = await checkOrderFulfillmentEligibility(rxOrder.id, custA.id, 'CUSTOMER');
    assert.strictEqual(eligApproved.fulfillmentEligible, true, 'Optical order must be eligible after Rx approval + payment');

    // Now fulfillment creation succeeds
    const fulfill = await createFulfillment({
      orderId: rxOrder.id,
      actorId: staffUser.id,
      actorRole: 'STORE_STAFF'
    });
    assert.strictEqual(fulfill.status, 'ELIGIBLE');
    recordPass('16. Optical prescription fulfillment gate strictly enforced before workshop clearance');
  } catch (err) {
    recordFail('16. Prescription-required fulfillment gating', err);
  }

  // =========================================================================
  // REQUIREMENT 17: Fulfillment Prerequisite Enforcement (Unpaid Orders Blocked)
  // =========================================================================
  try {
    const unpaidOrder = await apiCreateOrder(tokenA, 'EK-804', 1);

    const elig = await checkOrderFulfillmentEligibility(unpaidOrder.id, custA.id, 'CUSTOMER');
    assert.strictEqual(elig.fulfillmentEligible, false, 'Unpaid order must not be eligible for fulfillment');
    assert.strictEqual(elig.status, 'BLOCKED_UNPAID');

    let createBlocked = false;
    try {
      await createFulfillment({
        orderId: unpaidOrder.id,
        actorId: staffUser.id,
        actorRole: 'STORE_STAFF'
      });
    } catch (e) {
      createBlocked = true;
      assert.strictEqual(e.code, 'UNPAID_ORDER_FULFILLMENT_BLOCKED');
    }
    assert.strictEqual(createBlocked, true, 'createFulfillment must block unpaid orders');
    recordPass('17. Fulfillment strictly blocks unpaid orders (UNPAID_ORDER_FULFILLMENT_BLOCKED)');
  } catch (err) {
    recordFail('17. Fulfillment prerequisite enforcement', err);
  }

  // =========================================================================
  // REQUIREMENT 18: Historical Order Item Snapshot Immutability
  // =========================================================================
  try {
    const order = await apiCreateOrder(tokenA, 'EK-804', 1);
    const orderItems = await query(`SELECT * FROM order_items WHERE order_id = $1`, [order.id]);
    const originalPrice = parseFloat(orderItems.rows[0].unit_price);
    const originalName = orderItems.rows[0].title;

    // Mutate the catalog product price and title
    await query(`UPDATE products SET base_price = 999999, name = 'MUTATED CATALOG TITLE' WHERE sku = 'EK-804'`);

    // Re-query order items
    const orderItemsAfter = await query(`SELECT * FROM order_items WHERE order_id = $1`, [order.id]);
    assert.strictEqual(parseFloat(orderItemsAfter.rows[0].unit_price), originalPrice, 'Historical unit_price must not change');
    assert.strictEqual(orderItemsAfter.rows[0].title, originalName, 'Historical item title must not change');

    // Restore catalog product
    await query(`UPDATE products SET base_price = 14500, name = 'Veloce Titanium Aviator' WHERE sku = 'EK-804'`);
    recordPass('18. Historical order item snapshot remains completely immutable across catalog changes');
  } catch (err) {
    recordFail('18. Historical order item snapshot immutability', err);
  }

  // =========================================================================
  // REQUIREMENT 19: Concurrent / Race-Sensitive Inventory Safety
  // =========================================================================
  try {
    // Set EK-102 stock to 1, reserved_stock to 0
    await query(`UPDATE products SET stock = 1, reserved_stock = 0 WHERE sku = 'EK-102'`);
    await query(`DELETE FROM inventory_reservations WHERE sku = 'EK-102'`);

    // Trigger two concurrent order creations for the single available unit
    const results = await Promise.allSettled([
      apiCreateOrder(tokenA, 'EK-102', 1),
      apiCreateOrder(tokenB, 'EK-102', 1)
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const rejections = results.filter(r => r.status === 'rejected');

    assert.strictEqual(successes.length, 1, 'Exactly one concurrent order creation must succeed');
    assert.strictEqual(rejections.length, 1, 'Exactly one concurrent order creation must be rejected');

    const finalProd = await query(`SELECT stock, reserved_stock FROM products WHERE sku = 'EK-102'`);
    assert.strictEqual(finalProd.rows[0].stock, 1);
    assert.strictEqual(finalProd.rows[0].reserved_stock, 1, 'reserved_stock must be exactly 1, preventing over-reservation');
    recordPass('19. Concurrent inventory safety guarantees no race-condition over-reservation');
  } catch (err) {
    recordFail('19. Concurrent inventory safety', err);
  }

  // =========================================================================
  // ADMINISTRATIVE ORDER MANAGEMENT VALIDATION
  // =========================================================================
  try {
    // 1. Admin accesses GET /api/admin/orders
    const adminOrdersRes = await fetch(`${API_BASE}/api/admin/orders?limit=10&offset=0`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    assert.strictEqual(adminOrdersRes.status, 200);
    const adminData = await adminOrdersRes.json();
    assert.strictEqual(adminData.success, true);
    assert.strictEqual(Array.isArray(adminData.orders), true);
    assert.strictEqual(typeof adminData.total, 'number');

    // 2. Customer forbidden from GET /api/admin/orders
    const custForbiddenRes = await fetch(`${API_BASE}/api/admin/orders`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.strictEqual(custForbiddenRes.status, 403, 'Customer must be blocked from admin order endpoints');

    recordPass('20a. Administrative order management endpoint validated with strict RBAC');
  } catch (err) {
    recordFail('20a. Admin order management', err);
  }

  // =========================================================================
  // REQUIREMENT 20: 3D / VTO & Stitch UI Regression Check
  // =========================================================================
  try {
    const rootDir = path.resolve(__dirname, '..');
    const cinematic3dPath = path.join(rootDir, 'assets/js/eyekart-cinematic-3d.js');
    const threeStudioPath = path.join(rootDir, 'assets/js/three-studio.js');
    const vtoEnginePath = path.join(rootDir, 'assets/js/vto-engine.js');
    const premiumCssPath = path.join(rootDir, 'assets/css/eyekart-premium.css');
    const homepageHtmlPath = path.join(rootDir, 'Stitch/stitch_eyekart_optical_commerce_platform/eyekart_grand_optical_homepage/code.html');

    assert.strictEqual(fs.existsSync(cinematic3dPath), true, 'eyekart-cinematic-3d.js missing');
    assert.strictEqual(fs.existsSync(threeStudioPath), true, 'three-studio.js missing');
    assert.strictEqual(fs.existsSync(vtoEnginePath), true, 'vto-engine.js missing');
    assert.strictEqual(fs.existsSync(premiumCssPath), true, 'eyekart-premium.css missing');
    assert.strictEqual(fs.existsSync(homepageHtmlPath), true, 'homepage code.html missing');

    const cinematicContent = fs.readFileSync(cinematic3dPath, 'utf8');
    assert.strictEqual(cinematicContent.includes('EyeKartCinematic3D'), true);

    const premiumCss = fs.readFileSync(premiumCssPath, 'utf8');
    assert.strictEqual(premiumCss.includes('eyekart-hero-canvas-stage'), true);

    // Check Stitch panels exist
    const stitchDir = path.join(rootDir, 'Stitch', 'stitch_eyekart_optical_commerce_platform');
    assert.strictEqual(fs.existsSync(stitchDir), true, 'Stitch panels directory must exist');
    const panels = fs.readdirSync(stitchDir);
    assert.strictEqual(panels.length >= 20, true, 'At least 20 Stitch panels must remain preserved');

    // Verify frontend HTTP server responds
    const feRes = await fetch('http://127.0.0.1:3000/');
    assert.strictEqual(feRes.status, 200);
    const feHtml = await feRes.text();
    assert.strictEqual(feHtml.includes('EyeKart'), true);

    recordPass('20. Existing 3D/VTO and Stitch UI regression check: 100% preserved and operational');
  } catch (err) {
    recordFail('20. 3D/VTO and Stitch UI regression', err);
  }

  // --- Summary ---
  console.log('\n============================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase5Verification().catch(err => {
  console.error('Fatal execution error in Phase 5 verification suite:', err);
  process.exit(1);
});
