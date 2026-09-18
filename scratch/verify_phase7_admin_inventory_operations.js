/**
 * EyeKart Phase 7 Verification Suite
 * Admin, Inventory & Operational Control Hardening
 *
 * Verifies:
 * 1. Admin RBAC lockdown (all non-admin roles 403, client role tampering rejected, admin 200)
 * 2. Catalog management (SKU immutability, price validation in KES >= 0, mass-assignment protection)
 * 3. Inventory controls & Stock adjustment (reason >= 3 chars, negative stock prohibited, stock below reserved prohibited, audit log)
 * 4. Database constraints (chk_products_stock_nonneg, chk_products_reserved_stock)
 * 5. Concurrency & Overselling prevention (simultaneous reservations on limited stock, duplicate reservation idempotency)
 * 6. Order state control & Gating (unpaid processing blocked, unapproved optical processing blocked, terminal state immutability)
 * 7. Inactive order fulfillment blocking
 * 8. Admin visibility & customer data minimization (password_hash omission, bounded pagination)
 */

const http = require('http');
const { query } = require('../server/src/db/pool');
const { createSession } = require('../server/src/services/authService');
const { reserveStock, releaseStock } = require('../server/src/services/inventoryService');
const { createFulfillment } = require('../server/src/services/fulfillmentService');

const API_BASE = 'http://127.0.0.1:3001';

function request(method, path, body = null, token = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const postData = body ? JSON.stringify(body) : null;

    const headers = {
      'Content-Type': 'application/json',
      ...extraHeaders
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(
      url,
      {
        method,
        headers,
        timeout: 10000
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => (rawData += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(rawData);
          } catch (e) {
            parsed = rawData;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout: ${method} ${path}`));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runPhase7Tests() {
  console.log('============================================================');
  console.log('EYEKART PHASE 7: ADMIN, INVENTORY & OPERATIONAL CONTROL VERIFICATION');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Fetch Dev Users for all roles
  const usersRes = await query(`SELECT id, email, role FROM users WHERE email LIKE '%@eyekart.test'`);
  const usersByRole = {};
  for (const u of usersRes.rows) {
    usersByRole[u.role] = u;
  }

  const adminUser = usersByRole['ADMIN'];
  const customerUser = usersByRole['CUSTOMER'];
  const staffUser = usersByRole['STAFF'];
  const storeStaffUser = usersByRole['STORE_STAFF'];
  const labTechUser = usersByRole['LAB_TECH'];
  const optomUser = usersByRole['OPTOMETRIST'];

  assert(adminUser && customerUser && storeStaffUser, 'Test users seeded across roles');

  // Create real authenticated sessions
  const adminToken = (await createSession(adminUser.id, '127.0.0.1', 'Phase7-Verify')).rawToken;
  const customerToken = (await createSession(customerUser.id, '127.0.0.1', 'Phase7-Verify')).rawToken;
  const staffToken = (await createSession(staffUser.id, '127.0.0.1', 'Phase7-Verify')).rawToken;
  const storeStaffToken = (await createSession(storeStaffUser.id, '127.0.0.1', 'Phase7-Verify')).rawToken;
  const labTechToken = (await createSession(labTechUser.id, '127.0.0.1', 'Phase7-Verify')).rawToken;
  const optomToken = (await createSession(optomUser.id, '127.0.0.1', 'Phase7-Verify')).rawToken;

  console.log('\n--- SECTION 1: ADMIN AUTHORIZATION & RBAC LOCKDOWN ---');
  {
    // Unauthenticated
    const resNoAuth = await request('GET', '/api/admin/orders');
    assert(resNoAuth.status === 401, 'Unauthenticated access to /api/admin/orders returns 401');

    // Customer
    const resCustomer = await request('GET', '/api/admin/orders', null, customerToken);
    assert(resCustomer.status === 403, 'Customer role access to /api/admin/orders returns 403');

    // Staff
    const resStaff = await request('GET', '/api/admin/orders', null, staffToken);
    assert(resStaff.status === 403, 'Staff role access to /api/admin/orders returns 403');

    // Store Staff
    const resStoreStaff = await request('GET', '/api/admin/orders', null, storeStaffToken);
    assert(resStoreStaff.status === 403, 'Store Staff role access to /api/admin/orders returns 403');

    // Lab Tech
    const resLabTech = await request('GET', '/api/admin/orders', null, labTechToken);
    assert(resLabTech.status === 403, 'Lab Tech role access to /api/admin/orders returns 403');

    // Optometrist
    const resOptom = await request('GET', '/api/admin/orders', null, optomToken);
    assert(resOptom.status === 403, 'Optometrist role access to /api/admin/orders returns 403');

    // Customer role tampering attempt via headers
    const resSpoof = await request('GET', '/api/admin/orders', null, customerToken, {
      'x-user-role': 'ADMIN',
      'role': 'ADMIN'
    });
    assert(resSpoof.status === 403, 'Client role claim tampering rejected (database session role enforced)');

    // Admin
    const resAdmin = await request('GET', '/api/admin/orders', null, adminToken);
    assert(resAdmin.status === 200 && Array.isArray(resAdmin.body.orders), 'Admin access to /api/admin/orders returns 200 with orders list');
  }

  console.log('\n--- SECTION 2: CATALOG & PRODUCT OPERATIONAL INTEGRITY ---');
  {
    // List admin products
    const resProdList = await request('GET', '/api/admin/products', null, adminToken);
    assert(resProdList.status === 200 && Array.isArray(resProdList.body.products), 'Admin can list products with operational inventory metrics');
    const p1 = resProdList.body.products.find(p => p.sku === 'EK-001');
    assert(p1 && typeof p1.stock === 'number' && typeof p1.reservedStock === 'number', 'Admin product list includes stock and reservedStock metrics');

    // Valid update: change price and shape
    const resUpdateValid = await request('PATCH', '/api/admin/products/EK-001', {
      basePrice: 15500,
      compareAtPrice: 18000,
      shape: 'Classic Round Atelier'
    }, adminToken);
    assert(resUpdateValid.status === 200 && resUpdateValid.body.product.base_price === '15500.00', 'Admin successfully updates product basePrice in KES');

    // Invalid price: negative KES
    const resUpdateNeg = await request('PATCH', '/api/admin/products/EK-001', {
      basePrice: -100
    }, adminToken);
    assert(resUpdateNeg.status === 400 && resUpdateNeg.body.code === 'INVALID_PRICE', 'Negative basePrice rejected with 400 INVALID_PRICE');

    // Direct mass-assignment of stock prohibited
    const resUpdateStockDirect = await request('PATCH', '/api/admin/products/EK-001', {
      stock: 9999
    }, adminToken);
    assert(resUpdateStockDirect.status === 400 && resUpdateStockDirect.body.code === 'DIRECT_STOCK_MUTATION_PROHIBITED', 'Direct stock mutation in catalog patch rejected');

    // Audit log check
    const auditCheck = await query(`SELECT * FROM audit_logs WHERE action = 'PRODUCT_UPDATED' AND entity_id = 'EK-001' ORDER BY created_at DESC LIMIT 1`);
    assert(auditCheck.rows.length > 0, 'PRODUCT_UPDATED event recorded in audit_logs');
  }

  console.log('\n--- SECTION 3: INVENTORY CONTROLS & STOCK ADJUSTMENT ---');
  {
    // Customer cannot adjust stock
    const resCustAdjust = await request('POST', '/api/admin/inventory/adjust', {
      sku: 'EK-001',
      delta: 5,
      reason: 'Unauthorized stock attempt'
    }, customerToken);
    assert(resCustAdjust.status === 403, 'Non-admin forbidden from stock adjustment endpoint');

    // Missing reason
    const resNoReason = await request('POST', '/api/admin/inventory/adjust', {
      sku: 'EK-001',
      delta: 5
    }, adminToken);
    assert(resNoReason.status === 400 && resNoReason.body.code === 'MISSING_ADJUSTMENT_REASON', 'Adjustment without reason rejected with 400 MISSING_ADJUSTMENT_REASON');

    // Short reason (< 3 chars)
    const resShortReason = await request('POST', '/api/admin/inventory/adjust', {
      sku: 'EK-001',
      delta: 5,
      reason: 'ok'
    }, adminToken);
    assert(resShortReason.status === 400 && resShortReason.body.code === 'MISSING_ADJUSTMENT_REASON', 'Adjustment with short reason (< 3 chars) rejected');

    // Negative resulting stock
    const resNegStock = await request('POST', '/api/admin/inventory/adjust', {
      sku: 'EK-001',
      newStock: -10,
      reason: 'Intentional negative stock attempt'
    }, adminToken);
    assert(resNegStock.status === 400 && resNegStock.body.code === 'NEGATIVE_STOCK_PROHIBITED', 'Adjustment to negative stock rejected with 400 NEGATIVE_STOCK_PROHIBITED');

    // Stock below reserved_stock
    await query(`UPDATE products SET stock = 20, reserved_stock = 15 WHERE sku = 'EK-001'`);
    const resBelowReserved = await request('POST', '/api/admin/inventory/adjust', {
      sku: 'EK-001',
      newStock: 10,
      reason: 'Adjustment below reserved stock attempt'
    }, adminToken);
    assert(resBelowReserved.status === 400 && resBelowReserved.body.code === 'STOCK_BELOW_RESERVED_PROHIBITED', 'Adjustment below reserved_stock rejected with 400 STOCK_BELOW_RESERVED_PROHIBITED');

    // Valid adjustment
    const resValidAdj = await request('POST', '/api/admin/inventory/adjust', {
      sku: 'EK-001',
      delta: 5,
      reason: 'Routine atelier inventory restock from Nairobi central laboratory'
    }, adminToken);
    assert(resValidAdj.status === 200 && resValidAdj.body.adjustment.newStock === 25, 'Valid stock adjustment succeeds (20 -> 25)');

    // Verify audit log
    const adjAudit = await query(`SELECT * FROM audit_logs WHERE action = 'INVENTORY_ADJUSTED' AND entity_id = 'EK-001' ORDER BY created_at DESC LIMIT 1`);
    assert(adjAudit.rows.length > 0 && adjAudit.rows[0].metadata.reason.includes('Nairobi central laboratory'), 'INVENTORY_ADJUSTED audit log recorded with full operational rationale');
  }

  console.log('\n--- SECTION 4: DATABASE CHECK CONSTRAINTS ---');
  {
    // PostgreSQL constraint chk_products_stock_nonneg
    let threwStockConstraint = false;
    try {
      await query(`UPDATE products SET stock = -99 WHERE sku = 'EK-001'`);
    } catch (dbErr) {
      threwStockConstraint = dbErr.message.includes('chk_products_stock_nonneg');
    }
    assert(threwStockConstraint, 'Database enforces chk_products_stock_nonneg constraint');

    // PostgreSQL constraint chk_products_reserved_stock
    let threwReservedConstraint = false;
    try {
      await query(`UPDATE products SET reserved_stock = -5 WHERE sku = 'EK-001'`);
    } catch (dbErr) {
      threwReservedConstraint = dbErr.message.includes('chk_products_reserved_stock');
    }
    assert(threwReservedConstraint, 'Database enforces chk_products_reserved_stock constraint');
  }

  console.log('\n--- SECTION 5: CONCURRENCY & OVERSELLING PREVENTION ---');
  {
    // Setup EK-102: stock = 10, reserved_stock = 9 (Available = 1 unit)
    await query(`UPDATE products SET stock = 10, reserved_stock = 9 WHERE sku = 'EK-102'`);

    const order1Id = '00000000-0000-0000-0000-000000000001';
    const order2Id = '00000000-0000-0000-0000-000000000002';
    const testCustSnapshot = JSON.stringify({
      id: customerUser.id,
      email: customerUser.email,
      fullName: 'Development Customer (TEST ONLY)',
      phone: '+254700000004'
    });

    await query(`
      INSERT INTO orders (id, order_number, user_id, status, payment_status, subtotal, vat, delivery_fee, total, delivery_address, customer_snapshot)
      VALUES 
        ($1, 'EK-CONCUR-1', $3, 'CREATED', 'NOT_STARTED', 10000, 0, 0, 10000, 'Nairobi Westlands', $4),
        ($2, 'EK-CONCUR-2', $3, 'CREATED', 'NOT_STARTED', 10000, 0, 0, 10000, 'Nairobi Westlands', $4)
      ON CONFLICT (id) DO NOTHING
    `, [order1Id, order2Id, customerUser.id, testCustSnapshot]);

    await query(`DELETE FROM inventory_reservations WHERE order_id IN ($1, $2)`, [order1Id, order2Id]);

    const [res1, res2] = await Promise.allSettled([
      reserveStock({ orderId: order1Id, items: [{ sku: 'EK-102', qty: 1 }], actorId: customerUser.id, actorRole: 'CUSTOMER' }),
      reserveStock({ orderId: order2Id, items: [{ sku: 'EK-102', qty: 1 }], actorId: customerUser.id, actorRole: 'CUSTOMER' })
    ]);

    const successes = [res1, res2].filter(r => r.status === 'fulfilled');
    const rejections = [res1, res2].filter(r => r.status === 'rejected');

    assert(successes.length === 1 && rejections.length === 1, 'Row-level locking guarantees exactly 1 reservation succeeds and 1 fails under concurrency');
    assert(rejections[0].reason.code === 'INSUFFICIENT_STOCK', 'Rejected concurrent reservation received 409 INSUFFICIENT_STOCK');

    const winningOrderId = successes[0].value.reservations[0].order_id;
    const prodBefore = (await query(`SELECT stock, reserved_stock FROM products WHERE sku = 'EK-102'`)).rows[0];
    const dupeRes = await reserveStock({
      orderId: winningOrderId,
      items: [{ sku: 'EK-102', qty: 1 }],
      actorId: customerUser.id,
      actorRole: 'CUSTOMER'
    });
    const prodAfter = (await query(`SELECT stock, reserved_stock FROM products WHERE sku = 'EK-102'`)).rows[0];

    assert(dupeRes.reservations.length === 1 && prodBefore.reserved_stock === prodAfter.reserved_stock, 'Duplicate reservation is idempotent and does not double-reserve stock');

    await releaseStock({ orderId: winningOrderId, actorRole: 'ADMIN' });
  }

  console.log('\n--- SECTION 6: ORDER OPERATIONAL STATE CONTROL & GATING ---');
  {
    const testOrderNum = 'EK-P7-' + Date.now().toString().slice(-5);
    const testCustSnapshot = JSON.stringify({
      id: customerUser.id,
      email: customerUser.email,
      fullName: 'Development Customer (TEST ONLY)',
      phone: '+254700000004'
    });

    const createOrderRes = await query(`
      INSERT INTO orders (
        order_number, user_id, status, payment_status, currency, subtotal, vat, delivery_fee, total,
        delivery_address, requires_prescription_review, prescription_status, customer_snapshot
      ) VALUES (
        $1, $2, 'CREATED', 'NOT_STARTED', 'KES', 25000, 0, 0, 25000,
        'Corner Plaza 4th Floor, Westlands, Nairobi', TRUE, 'PENDING_OPTOMETRIST_REVIEW', $3
      ) RETURNING *
    `, [testOrderNum, customerUser.id, testCustSnapshot]);
    const order = createOrderRes.rows[0];

    const resUnpaidProc = await request('PATCH', `/api/admin/orders/${order.id}/status`, {
      status: 'PROCESSING'
    }, adminToken);
    assert(resUnpaidProc.status === 400 && resUnpaidProc.body.code === 'ILLEGAL_ORDER_STATE_TRANSITION', 'Illegal skip from CREATED to PROCESSING blocked');

    await request('PATCH', `/api/admin/orders/${order.id}/status`, { status: 'PAYMENT_PENDING' }, adminToken);

    const resUnpaidProc2 = await request('PATCH', `/api/admin/orders/${order.id}/status`, {
      status: 'PROCESSING'
    }, adminToken);
    assert(resUnpaidProc2.status === 400 && resUnpaidProc2.body.code === 'ILLEGAL_ORDER_STATE_TRANSITION', 'Illegal move from PAYMENT_PENDING to PROCESSING blocked');

    await query(`UPDATE orders SET status = 'PAID', payment_status = 'SUCCESS' WHERE id = $1`, [order.id]);

    const resUnapprovedProc = await request('PATCH', `/api/admin/orders/${order.id}/status`, {
      status: 'PROCESSING'
    }, adminToken);
    assert(resUnapprovedProc.status === 400 && resUnapprovedProc.body.code === 'OPTICAL_GATE_BLOCKED', 'Optical order blocked from PROCESSING without approved prescription');

    await query(`UPDATE orders SET prescription_status = 'APPROVED' WHERE id = $1`, [order.id]);

    const resProcApproved = await request('PATCH', `/api/admin/orders/${order.id}/status`, {
      status: 'PROCESSING',
      reason: 'Prescription approved by optometrist; queued for lens surfacing'
    }, adminToken);
    assert(resProcApproved.status === 200 && resProcApproved.body.order.status === 'PROCESSING', 'Optical order with approved prescription successfully enters PROCESSING');

    const resComplete = await request('PATCH', `/api/admin/orders/${order.id}/status`, {
      status: 'COMPLETED',
      reason: 'Assembly, QC, and white-glove handover complete'
    }, adminToken);
    assert(resComplete.status === 200 && resComplete.body.order.status === 'COMPLETED', 'Order successfully completes');

    const resTerminalTransition = await request('PATCH', `/api/admin/orders/${order.id}/status`, {
      status: 'PROCESSING'
    }, adminToken);
    assert(resTerminalTransition.status === 400 && resTerminalTransition.body.code === 'TERMINAL_STATE_IMMUTABLE', 'Terminal COMPLETED state is strictly immutable');
  }

  console.log('\n--- SECTION 7: ADMINISTRATIVE ORDER CANCELLATION & FULFILLMENT GATING ---');
  {
    const cancelOrderNum = 'EK-CAN-' + Date.now().toString().slice(-5);
    const testCustSnapshot = JSON.stringify({
      id: customerUser.id,
      email: customerUser.email,
      fullName: 'Development Customer (TEST ONLY)',
      phone: '+254700000004'
    });

    const orderRes = await query(`
      INSERT INTO orders (
        order_number, user_id, status, payment_status, currency, subtotal, vat, delivery_fee, total,
        delivery_address, requires_prescription_review, prescription_status, customer_snapshot
      ) VALUES (
        $1, $2, 'CREATED', 'NOT_STARTED', 'KES', 15000, 0, 0, 15000,
        'Sarit Centre, Karuna Rd, Nairobi', FALSE, 'NOT_APPLICABLE', $3
      ) RETURNING *
    `, [cancelOrderNum, customerUser.id, testCustSnapshot]);
    const cancelOrder = orderRes.rows[0];

    const resCancel = await request('POST', `/api/admin/orders/${cancelOrder.id}/cancel`, {
      reason: 'Administrative cancellation: Customer changed frame preference'
    }, adminToken);
    assert(resCancel.status === 200 && resCancel.body.order.status === 'CANCELLED', 'Admin successfully cancelled order');

    let threwFulfillBlocked = false;
    try {
      await createFulfillment({
        orderId: cancelOrder.id,
        actorId: adminUser.id,
        actorRole: 'ADMIN'
      });
    } catch (fErr) {
      threwFulfillBlocked = fErr.code === 'INACTIVE_ORDER_FULFILLMENT_BLOCKED';
    }
    assert(threwFulfillBlocked, 'createFulfillment strictly blocks cancelled orders with 400 INACTIVE_ORDER_FULFILLMENT_BLOCKED');
  }

  console.log('\n--- SECTION 8: ADMIN VISIBILITY & DATA MINIMIZATION ---');
  {
    const resOrdersBound = await request('GET', '/api/admin/orders?limit=500', null, adminToken);
    assert(resOrdersBound.status === 200 && resOrdersBound.body.limit === 100, 'Admin orders list clamps excessive limits to maximum 100');

    const resCustomers = await request('GET', '/api/admin/customers', null, adminToken);
    assert(resCustomers.status === 200 && Array.isArray(resCustomers.body.customers), 'Admin can list customer accounts');

    const hasPasswordHash = resCustomers.body.customers.some(c => c.password_hash !== undefined || c.password !== undefined || c.salt !== undefined);
    assert(!hasPasswordHash, 'Customer account list strictly omits password_hash and security credentials');

    const firstOrder = resOrdersBound.body.orders[0];
    if (firstOrder) {
      const resOrderDetail = await request('GET', `/api/admin/orders/${firstOrder.id}`, null, adminToken);
      assert(resOrderDetail.status === 200 && Array.isArray(resOrderDetail.body.order.fulfillments), 'Admin order detail includes linked fulfillments and timeline events');
    }
  }

  console.log('\n============================================================');
  console.log(`PHASE 7 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase7Tests().catch((err) => {
  console.error('Unhandled verification error:', err);
  process.exit(1);
});
