/**
 * EyeKart Phase 6.2 Order Service
 * Manages order creation from authoritative quotes, immutable snapshots, IDOR security, and cancellation.
 */
const crypto = require('crypto');
const { query } = require('../db/pool');
const { getQuoteById, generateCheckoutQuote } = require('./checkoutService');
const { clearCart } = require('./cartService');
const { logAuditEvent } = require('./auditService');
const { checkIdempotency, saveIdempotency } = require('./idempotencyService');

const ORDER_STATES = {
  CREATED: 'CREATED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAID: 'PAID',
  PROCESSING: 'PROCESSING',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED'
};

const LEGAL_ORDER_TRANSITIONS = {
  CREATED: ['PAYMENT_PENDING', 'CANCELLED'],
  PAYMENT_PENDING: ['PAID', 'CREATED', 'CANCELLED'],
  PAID: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'CANCELLED'],
  CANCELLED: [], // Terminal
  COMPLETED: []  // Terminal
};

function isValidOrderTransition(fromState, toState) {
  if (fromState === toState) return true;
  const allowed = LEGAL_ORDER_TRANSITIONS[fromState] || [];
  return allowed.includes(toState);
}

/**
 * Generate unique order number (e.g. EK-NBI-XXXXX)
 */
async function generateUniqueOrderNumber() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const num = 'EK-NBI-' + Math.floor(10000 + Math.random() * 90000);
    const check = await query(`SELECT id FROM orders WHERE order_number = $1`, [num]);
    if (check.rows.length === 0) {
      return num;
    }
  }
  return 'EK-NBI-' + Date.now().toString().slice(-6);
}

/**
 * Create order from an authoritative quote
 */
async function createOrderFromQuote({
  userId,
  quoteId = null,
  cartId = null,
  items = null,
  deliveryAddress,
  gateProtocol = null,
  customerSnapshot = {},
  prescriptionSnapshot = null,
  idempotencyKey = null,
  actorRole = 'CUSTOMER',
  ipAddress = null
}) {
  if (!userId) {
    const err = new Error('User authentication required to create an order.');
    err.statusCode = 401;
    err.code = 'AUTHENTICATION_REQUIRED';
    throw err;
  }

  // 1. Idempotency Check
  if (idempotencyKey) {
    const idemp = await checkIdempotency(idempotencyKey, userId, '/api/orders');
    if (idemp.hit) {
      return idemp.body;
    }
  }

  // 2. Validate input requirements
  if (!deliveryAddress || typeof deliveryAddress !== 'string' || deliveryAddress.trim().length < 5) {
    const err = new Error('A complete delivery address is required.');
    err.statusCode = 400;
    err.code = 'INVALID_DELIVERY_ADDRESS';
    throw err;
  }

  // 3. Resolve Authoritative Quote
  let quote = null;
  if (quoteId) {
    quote = getQuoteById(quoteId);
  }
  if (!quote) {
    // Generate fresh quote
    quote = await generateCheckoutQuote({ userId, cartId, items });
  }

  if (!quote || !quote.items || quote.items.length === 0) {
    const err = new Error('Cannot create an order with zero items.');
    err.statusCode = 400;
    err.code = 'EMPTY_ORDER_ITEMS';
    throw err;
  }

  // 4. Determine Clinical Review Requirement
  const requiresPrescriptionReview = (prescriptionSnapshot !== null && prescriptionSnapshot !== undefined) || quote.items.some(it => {
    const cfg = it.lensConfig || it.lens_config;
    if (!cfg) return false;
    const mode = String(cfg.prescriptionMode || cfg.prescription_mode || '').toLowerCase();
    return mode && mode !== 'no_rx' && mode !== 'plano';
  });

  const initialPrescriptionStatus = requiresPrescriptionReview ? 'PENDING_OPTOMETRIST_REVIEW' : 'NOT_APPLICABLE';
  const orderNumber = await generateUniqueOrderNumber();

  // Initial tracking payload
  const initialTracking = {
    stage: "CONFIRMED",
    stageNumber: 1,
    stageTitle: requiresPrescriptionReview
      ? "Stage 1 of 10: Clinical Review Queued"
      : "Stage 1 of 10: Order Confirmed (Frame Only — Cleared for Assembly)",
    riderName: "Westlands Central Lab Dispatch",
    riderPhone: "+254 700 918 274",
    vehicleReg: "Electric Moto Transporter #EK-E12",
    etaMinutes: 45,
    routeText: "Packaging at Westlands Atelier"
  };

  // 5. Insert Order
  const orderRes = await query(
    `INSERT INTO orders (
      order_number, user_id, cart_id, status, payment_status, currency,
      subtotal, vat, delivery_fee, total, delivery_address, gate_protocol,
      customer_snapshot, requires_prescription_review, prescription_status,
      prescription_snapshot, tracking
    ) VALUES ($1, $2, $3, 'CREATED', 'NOT_STARTED', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *`,
    [
      orderNumber,
      userId,
      cartId || null,
      quote.currency || 'KES',
      quote.subtotal,
      quote.vat,
      quote.deliveryFee,
      quote.total,
      deliveryAddress.trim(),
      gateProtocol ? gateProtocol.trim() : null,
      JSON.stringify(customerSnapshot),
      requiresPrescriptionReview,
      initialPrescriptionStatus,
      prescriptionSnapshot ? JSON.stringify(prescriptionSnapshot) : null,
      JSON.stringify(initialTracking)
    ]
  );
  const order = orderRes.rows[0];

  // 6. Insert Order Items (Immutable Snapshots)
  const savedItems = [];
  for (const it of quote.items) {
    const itemRes = await query(
      `INSERT INTO order_items (
        order_id, sku, name, variant, qty, frame_price, lens_price, total_price, lens_config, product_snapshot
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        order.id,
        it.sku,
        it.name,
        it.variant || 'Standard',
        it.qty || 1,
        it.framePrice !== undefined ? it.framePrice : (it.authoritativeFramePrice || 0),
        it.lensPrice !== undefined ? it.lensPrice : (it.authoritativeLensPrice || 0),
        it.totalPrice !== undefined ? it.totalPrice : (it.authoritativeItemTotal || 0),
        it.lensConfig ? JSON.stringify(it.lensConfig) : null,
        JSON.stringify(it.productSnapshot || {})
      ]
    );
    savedItems.push(itemRes.rows[0]);
  }

  // 7. Clear Cart if cartId provided
  if (cartId) {
    await clearCart(cartId);
    await query(`UPDATE carts SET status = 'CONVERTED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [cartId]);
  }

  // 8. Log Audit Event
  await logAuditEvent({
    actorId: userId,
    actorRole,
    ipAddress,
    action: 'ORDER_CREATED',
    entity: 'Order',
    entityId: order.id,
    metadata: {
      orderNumber: order.order_number,
      total: order.total,
      currency: order.currency,
      itemCount: savedItems.length
    }
  });

  const fullOrder = {
    ...order,
    items: savedItems
  };

  // 9. Save Idempotency
  if (idempotencyKey) {
    await saveIdempotency(idempotencyKey, userId, '/api/orders', { quoteId, deliveryAddress }, 201, fullOrder);
  }

  return fullOrder;
}

/**
 * Retrieve a specific order with IDOR protection
 */
async function getOrderById(orderId, userId, userRole) {
  // Support lookup by UUID id or human order_number (e.g. EK-NBI-XXXXX)
  const orderRes = await query(
    `SELECT * FROM orders WHERE id::text = $1 OR order_number = $1`,
    [orderId]
  );

  if (orderRes.rows.length === 0) {
    const err = new Error(`Order '${orderId}' not found.`);
    err.statusCode = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }

  const order = orderRes.rows[0];

  // IDOR Protection: Must be order owner OR an ADMIN
  if (order.user_id !== userId && userRole !== 'ADMIN') {
    const err = new Error('You do not have permission to access this order.');
    err.statusCode = 403;
    err.code = 'UNAUTHORIZED_ORDER_ACCESS';
    throw err;
  }

  const itemsRes = await query(`SELECT * FROM order_items WHERE order_id = $1`, [order.id]);
  const attemptsRes = await query(`SELECT * FROM payment_attempts WHERE order_id = $1 ORDER BY created_at DESC`, [order.id]);

  return {
    ...order,
    items: itemsRes.rows,
    paymentAttempts: attemptsRes.rows
  };
}

/**
 * List orders for the authenticated customer
 */
async function listCustomerOrders(userId, { limit = 20, offset = 0 } = {}) {
  const ordersRes = await query(
    `SELECT o.*, 
            COUNT(oi.id) as item_count,
            COALESCE(json_agg(oi.*) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
     FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     WHERE o.user_id = $1
     GROUP BY o.id
     ORDER BY o.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return ordersRes.rows;
}

/**
 * Cancel order with strict state machine validation
 */
async function cancelOrder(orderId, userId, userRole, reason = null, ipAddress = null) {
  const order = await getOrderById(orderId, userId, userRole);

  // Validate State Machine: Cannot cancel COMPLETED or already CANCELLED orders
  if (order.status === ORDER_STATES.COMPLETED) {
    const err = new Error('Completed orders cannot be cancelled.');
    err.statusCode = 400;
    err.code = 'ORDER_CANNOT_BE_CANCELLED';
    throw err;
  }

  if (order.status === ORDER_STATES.CANCELLED) {
    const err = new Error('Order is already cancelled.');
    err.statusCode = 400;
    err.code = 'ORDER_ALREADY_CANCELLED';
    throw err;
  }

  const cancelReason = reason || 'Customer requested order cancellation prior to laboratory processing.';
  const cancelTime = new Date();

  // If payment was SUCCESS, flag demo refund notice
  let refundMetadata = null;
  if (order.payment_status === 'SUCCESS') {
    refundMetadata = {
      refundStatus: 'REFUND_PENDING_DEMO',
      refundNote: '[DEMO PAYMENT] Simulated refund queued. Live financial rail requires production Safaricom integration.',
      refundAmount: order.total
    };
  }

  const updatedRes = await query(
    `UPDATE orders 
     SET status = 'CANCELLED',
         cancelled_at = $1,
         cancel_reason = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING *`,
    [cancelTime, cancelReason, order.id]
  );

  await logAuditEvent({
    actorId: userId,
    actorRole: userRole,
    ipAddress,
    action: 'ORDER_CANCELLED',
    entity: 'Order',
    entityId: order.id,
    metadata: {
      orderNumber: order.order_number,
      reason: cancelReason,
      refundMetadata
    }
  });

  return {
    ...updatedRes.rows[0],
    refundMetadata
  };
}

/**
 * Admin order status update
 */
async function updateOrderStatus(orderId, newStatus, userRole, stageInfo = null) {
  if (userRole !== 'ADMIN' && userRole !== 'OPTOMETRIST' && userRole !== 'STORE_STAFF') {
    const err = new Error('Privilege required to update order status.');
    err.statusCode = 403;
    err.code = 'UNAUTHORIZED_ORDER_UPDATE';
    throw err;
  }

  const orderRes = await query(`SELECT * FROM orders WHERE id::text = $1 OR order_number = $1`, [orderId]);
  if (orderRes.rows.length === 0) {
    const err = new Error('Order not found.');
    err.statusCode = 404;
    throw err;
  }

  const order = orderRes.rows[0];
  if (!isValidOrderTransition(order.status, newStatus)) {
    const err = new Error(`Illegal order state transition from '${order.status}' to '${newStatus}'.`);
    err.statusCode = 400;
    err.code = 'ILLEGAL_ORDER_STATE_TRANSITION';
    throw err;
  }

  const updatedRes = await query(
    `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
    [newStatus, order.id]
  );

  return updatedRes.rows[0];
}

module.exports = {
  ORDER_STATES,
  LEGAL_ORDER_TRANSITIONS,
  isValidOrderTransition,
  createOrderFromQuote,
  getOrderById,
  listCustomerOrders,
  cancelOrder,
  updateOrderStatus
};
