/**
 * EyeKart Phase 5 Order Service
 * Manages atomic order creation from authoritative quotes, immutable historical product snapshots,
 * strict state machine transitions, IDOR security, and state-aware cancellations.
 */
const { query, getPool } = require('../db/pool');
const { getQuoteById, generateCheckoutQuote } = require('./checkoutService');
const { clearCart } = require('./cartService');
const { logAuditEvent } = require('./auditService');
const { checkIdempotency, saveIdempotency } = require('./idempotencyService');
const { reserveStock, releaseStock, allocateStock } = require('./inventoryService');

const ORDER_STATES = {
  CREATED: 'CREATED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAID: 'PAID',
  PROCESSING: 'PROCESSING',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED'
};

const LEGAL_ORDER_TRANSITIONS = {
  CREATED: ['PAYMENT_PENDING', 'CANCELLED', 'EXPIRED'],
  PAYMENT_PENDING: ['PAID', 'CANCELLED', 'EXPIRED'],
  PAID: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'CANCELLED'],
  CANCELLED: [], // Terminal
  COMPLETED: [], // Terminal
  EXPIRED: []    // Terminal
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
 * Create order from an authoritative quote inside an atomic transaction
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
  prescriptionId = null,
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

  // 2. Validate and normalize delivery address
  let formattedAddress = deliveryAddress;
  if (typeof deliveryAddress === 'object' && deliveryAddress !== null) {
    formattedAddress = [
      deliveryAddress.street,
      deliveryAddress.estate,
      deliveryAddress.landmark,
      deliveryAddress.county
    ].filter(Boolean).join(', ');
  }
  if (!formattedAddress || typeof formattedAddress !== 'string' || formattedAddress.trim().length < 5) {
    const err = new Error('A complete delivery address is required (minimum 5 characters).');
    err.statusCode = 400;
    err.code = 'INVALID_DELIVERY_ADDRESS';
    throw err;
  }

  let formattedGate = gateProtocol;
  if (typeof gateProtocol === 'object' && gateProtocol !== null) {
    formattedGate = JSON.stringify(gateProtocol);
  }

  // 3. Resolve Authoritative Quote
  let quote = null;
  if (quoteId) {
    quote = getQuoteById(quoteId);
  }
  if (!quote) {
    // Generate fresh quote from cart or direct items
    quote = await generateCheckoutQuote({ userId, cartId, items });
  }

  if (!quote || !quote.items || quote.items.length === 0) {
    const err = new Error('Cannot create an order with zero items.');
    err.statusCode = 400;
    err.code = 'EMPTY_ORDER_ITEMS';
    throw err;
  }

  // Currency validation: EyeKart strictly operates in KES
  if (quote.currency && quote.currency.toUpperCase() !== 'KES') {
    const err = new Error(`EyeKart only supports orders in 'KES' currency. Provided: '${quote.currency}'.`);
    err.statusCode = 400;
    err.code = 'INVALID_CURRENCY';
    throw err;
  }

  // 3b. Validate and link Prescription if provided
  let targetPrescriptionId = prescriptionId;
  if (!targetPrescriptionId && prescriptionSnapshot && (prescriptionSnapshot.id || prescriptionSnapshot.prescriptionId)) {
    targetPrescriptionId = prescriptionSnapshot.id || prescriptionSnapshot.prescriptionId;
  }
  if (!targetPrescriptionId && quote.items) {
    for (const it of quote.items) {
      const cfg = it.lensConfig || it.lens_config;
      if (cfg && (cfg.prescriptionId || cfg.linkedRxId)) {
        targetPrescriptionId = cfg.prescriptionId || cfg.linkedRxId;
        break;
      }
    }
  }

  let linkedPrescription = null;
  if (targetPrescriptionId) {
    const rxCheck = await query(`SELECT * FROM prescriptions WHERE id::text = $1`, [targetPrescriptionId]);
    if (rxCheck.rows.length === 0) {
      const err = new Error('Referenced prescription not found.');
      err.statusCode = 404;
      err.code = 'PRESCRIPTION_NOT_FOUND';
      throw err;
    }
    linkedPrescription = rxCheck.rows[0];
    if (actorRole !== 'ADMIN' && linkedPrescription.user_id !== userId) {
      const err = new Error('Access denied. Cannot associate an order with another customer\'s prescription.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_PRESCRIPTION_ACCESS';
      throw err;
    }
  }

  // 4. Determine Clinical Review Requirement
  const requiresPrescriptionReview = Boolean(
    linkedPrescription ||
    (prescriptionSnapshot !== null && prescriptionSnapshot !== undefined) ||
    quote.items.some(it => {
      const cfg = it.lensConfig || it.lens_config;
      if (!cfg) return false;
      const mode = String(cfg.prescriptionMode || cfg.prescription_mode || '').toLowerCase();
      return mode && mode !== 'no_rx' && mode !== 'plano';
    })
  );

  let initialPrescriptionStatus = 'NOT_APPLICABLE';
  if (requiresPrescriptionReview) {
    if (linkedPrescription && linkedPrescription.status === 'APPROVED') {
      initialPrescriptionStatus = 'APPROVED';
    } else {
      initialPrescriptionStatus = 'PENDING_OPTOMETRIST_REVIEW';
    }
  }
  const orderNumber = await generateUniqueOrderNumber();

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

  // 5. ATOMIC TRANSACTION: Order Insertion + Items + Stock Reservation + Cart Conversion
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 5a. Insert Order record
    const orderRes = await client.query(
      `INSERT INTO orders (
        order_number, user_id, cart_id, status, payment_status, currency,
        subtotal, vat, delivery_fee, total, delivery_address, gate_protocol,
        customer_snapshot, requires_prescription_review, prescription_status,
        prescription_snapshot, tracking
      ) VALUES ($1, $2, $3, 'CREATED', 'NOT_STARTED', 'KES', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        orderNumber,
        userId,
        cartId || null,
        quote.subtotal,
        quote.vat,
        quote.deliveryFee,
        quote.total,
        formattedAddress.trim(),
        formattedGate ? formattedGate.trim() : null,
        JSON.stringify(customerSnapshot),
        requiresPrescriptionReview,
        initialPrescriptionStatus,
        prescriptionSnapshot ? JSON.stringify(prescriptionSnapshot) : null,
        JSON.stringify(initialTracking)
      ]
    );
    const order = orderRes.rows[0];

    // 5b. Fetch real product details from database and insert immutable order items
    const savedItems = [];
    for (const it of quote.items) {
      const prodRes = await client.query(`SELECT * FROM products WHERE sku = $1`, [it.sku]);
      const product = prodRes.rows[0];
      const productSnapshot = product ? {
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        category_id: product.category_id,
        shape: product.shape,
        material: product.material,
        dimensions: product.dimensions,
        base_price: Number(product.base_price),
        compare_at_price: product.compare_at_price ? Number(product.compare_at_price) : null,
        gallery: product.gallery
      } : (it.productSnapshot || {});

      const itemRes = await client.query(
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
          JSON.stringify(productSnapshot)
        ]
      );
      savedItems.push(itemRes.rows[0]);
    }

    // 5c. Atomically reserve inventory within the same transaction
    await reserveStock({
      orderId: order.id,
      items: quote.items.map(it => ({ sku: it.sku, qty: it.qty || 1 })),
      client, // Participating in the atomic transaction
      actorId: userId,
      actorRole,
      ipAddress
    });

    // 5d. Clear cart and mark converted if cartId was provided
    if (cartId) {
      await client.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);
      await client.query(`UPDATE carts SET status = 'CONVERTED', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [cartId]);
    }

    // 5e. Atomically link prescription to order if applicable
    if (targetPrescriptionId) {
      await client.query(
        `UPDATE prescriptions SET order_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND order_id IS NULL`,
        [order.id, targetPrescriptionId]
      );
    }

    await client.query('COMMIT');

    const fullOrder = {
      ...order,
      items: savedItems
    };

    // 6. Audit log & Idempotency persistence
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

    if (idempotencyKey) {
      await saveIdempotency(idempotencyKey, userId, '/api/orders', { quoteId, deliveryAddress }, 201, fullOrder);
    }

    return fullOrder;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieve a specific order with strict IDOR access control
 */
async function getOrderById(orderId, userId, userRole) {
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

  // IDOR Protection: Must be the order owner OR a privileged role
  const isPrivileged = (userRole === 'ADMIN' || userRole === 'STORE_STAFF' || userRole === 'LAB_TECH' || userRole === 'OPTOMETRIST');
  if (order.user_id !== userId && !isPrivileged) {
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
 * List orders for the authenticated customer (Strictly scoped to requesting customer)
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
 * List all orders across the platform (Admin & Operations oversight)
 */
async function listAllOrders({ limit = 20, offset = 0, status = null, paymentStatus = null, search = null } = {}) {
  const cleanLimit = Math.min(Math.max(1, parseInt(limit || 20, 10)), 100);
  const cleanOffset = Math.max(0, parseInt(offset || 0, 10));

  if (status && !Object.values(ORDER_STATES).includes(status)) {
    const err = new Error(`Invalid status filter: '${status}'. Allowed values: ${Object.values(ORDER_STATES).join(', ')}`);
    err.statusCode = 400;
    err.code = 'INVALID_ORDER_STATUS_FILTER';
    throw err;
  }

  const whereClauses = [];
  const params = [];

  if (status) {
    params.push(status);
    whereClauses.push(`o.status = $${params.length}`);
  }

  if (paymentStatus) {
    params.push(paymentStatus);
    whereClauses.push(`o.payment_status = $${params.length}`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    whereClauses.push(`(o.order_number ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length})`);
  }

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countRes = await query(
    `SELECT COUNT(DISTINCT o.id) as total FROM orders o JOIN users u ON o.user_id = u.id ${whereStr}`,
    params
  );
  const total = parseInt(countRes.rows[0]?.total || 0, 10);

  params.push(cleanLimit);
  const limitIndex = params.length;
  params.push(cleanOffset);
  const offsetIndex = params.length;

  const ordersRes = await query(
    `SELECT o.*, 
            u.full_name as customer_name,
            u.email as customer_email,
            u.phone as customer_phone,
            COUNT(oi.id) as item_count,
            COALESCE(json_agg(oi.*) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
     FROM orders o
     JOIN users u ON o.user_id = u.id
     LEFT JOIN order_items oi ON o.id = oi.order_id
     ${whereStr}
     GROUP BY o.id, u.full_name, u.email, u.phone
     ORDER BY o.created_at DESC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    params
  );

  return {
    orders: ordersRes.rows,
    total,
    limit: cleanLimit,
    offset: cleanOffset
  };
}

/**
 * Cancel order with strict state machine validation and inventory release
 */
async function cancelOrder(orderId, userId, userRole, reason = null, ipAddress = null) {
  const order = await getOrderById(orderId, userId, userRole);

  // Terminal state guards
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

  if (order.status === ORDER_STATES.EXPIRED) {
    const err = new Error('Expired orders cannot be cancelled.');
    err.statusCode = 400;
    err.code = 'ORDER_ALREADY_EXPIRED';
    throw err;
  }

  // Processing state guard: Customers cannot unilaterally cancel custom orders undergoing lab surfacing
  if (order.status === ORDER_STATES.PROCESSING && userRole !== 'ADMIN') {
    const err = new Error('Orders currently undergoing laboratory surfacing cannot be self-cancelled. Please contact the Westlands Atelier.');
    err.statusCode = 400;
    err.code = 'CANNOT_CANCEL_PROCESSING_ORDER';
    throw err;
  }

  if (!isValidOrderTransition(order.status, ORDER_STATES.CANCELLED)) {
    const err = new Error(`Illegal order state transition from '${order.status}' to 'CANCELLED'.`);
    err.statusCode = 400;
    err.code = 'ILLEGAL_ORDER_STATE_TRANSITION';
    throw err;
  }

  const cancelReason = reason || 'Customer requested order cancellation prior to laboratory processing.';
  const cancelTime = new Date();

  // If payment was SUCCESS, note refund queue status (safely clarifying that live automated refunds require live M-PESA API credentials)
  let refundMetadata = null;
  if (order.payment_status === 'SUCCESS') {
    refundMetadata = {
      refundStatus: 'REFUND_PENDING_MANUAL',
      refundNote: 'Simulated refund record queued. Live financial reversal requires provisioned Safaricom Daraja B2C credentials.',
      refundAmount: Number(order.total)
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

  // Release reserved inventory or restock physical units
  try {
    await releaseStock({
      orderId: order.id,
      actorId: userId,
      actorRole: userRole,
      ipAddress
    });
  } catch (stockErr) {
    console.warn('[Order Service] Warning: Failed to release stock on order cancel:', stockErr.message);
  }

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
 * Privileged order status update with state machine validation and row-level locking
 */
async function updateOrderStatus(orderId, newStatus, userRole, stageInfo = null, actorId = null, ipAddress = null, reason = null) {
  // Optometrists review prescriptions; only ADMIN and STORE_STAFF update operational order status
  if (userRole !== 'ADMIN' && userRole !== 'STORE_STAFF') {
    const err = new Error('Privilege required to update operational order status.');
    err.statusCode = 403;
    err.code = 'UNAUTHORIZED_ORDER_UPDATE';
    throw err;
  }

  if (!Object.values(ORDER_STATES).includes(newStatus)) {
    const err = new Error(`Invalid target order status: '${newStatus}'.`);
    err.statusCode = 400;
    err.code = 'INVALID_ORDER_STATUS';
    throw err;
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const orderRes = await client.query(
      `SELECT * FROM orders WHERE id::text = $1 OR order_number = $1 FOR UPDATE`,
      [orderId]
    );

    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      const err = new Error('Order not found.');
      err.statusCode = 404;
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    const order = orderRes.rows[0];

    // Terminal state protection: Cannot transition OUT of COMPLETED, CANCELLED, or EXPIRED
    if ([ORDER_STATES.COMPLETED, ORDER_STATES.CANCELLED, ORDER_STATES.EXPIRED].includes(order.status) && order.status !== newStatus) {
      await client.query('ROLLBACK');
      const err = new Error(`Cannot transition order from terminal state '${order.status}'.`);
      err.statusCode = 400;
      err.code = 'TERMINAL_STATE_IMMUTABLE';
      throw err;
    }

    // Legal state transition verification
    if (!isValidOrderTransition(order.status, newStatus)) {
      await client.query('ROLLBACK');
      const err = new Error(`Illegal order state transition from '${order.status}' to '${newStatus}'.`);
      err.statusCode = 400;
      err.code = 'ILLEGAL_ORDER_STATE_TRANSITION';
      throw err;
    }

    // Gating for PROCESSING:
    if (newStatus === ORDER_STATES.PROCESSING) {
      const isPaid = (order.payment_status === 'SUCCESS' || order.status === 'PAID');
      if (!isPaid) {
        await client.query('ROLLBACK');
        const err = new Error('Cannot move unpaid order to PROCESSING. Payment must be confirmed.');
        err.statusCode = 400;
        err.code = 'UNPAID_ORDER_PROCESSING_BLOCKED';
        throw err;
      }
      if (order.requires_prescription_review && order.prescription_status !== 'APPROVED') {
        await client.query('ROLLBACK');
        const err = new Error(`Optical order cannot move to PROCESSING without approved prescription. Current prescription status is '${order.prescription_status}'.`);
        err.statusCode = 400;
        err.code = 'OPTICAL_GATE_BLOCKED';
        throw err;
      }
    }

    // Gating for COMPLETED:
    if (newStatus === ORDER_STATES.COMPLETED) {
      const isPaid = (order.payment_status === 'SUCCESS' || order.status === 'PAID' || order.status === 'PROCESSING');
      if (!isPaid) {
        await client.query('ROLLBACK');
        const err = new Error('Cannot complete an unpaid order. Payment must be confirmed.');
        err.statusCode = 400;
        err.code = 'UNPAID_ORDER_COMPLETION_BLOCKED';
        throw err;
      }
      if (order.requires_prescription_review && order.prescription_status !== 'APPROVED') {
        await client.query('ROLLBACK');
        const err = new Error(`Cannot complete optical order without approved prescription. Current prescription status is '${order.prescription_status}'.`);
        err.statusCode = 400;
        err.code = 'OPTICAL_GATE_BLOCKED';
        throw err;
      }
    }

    const updatedRes = await client.query(
      `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [newStatus, order.id]
    );

    // If cancelled via updateOrderStatus, release stock
    if (newStatus === ORDER_STATES.CANCELLED) {
      await releaseStock({ orderId: order.id, actorId, actorRole: userRole, ipAddress });
    } else if (newStatus === ORDER_STATES.COMPLETED) {
      await allocateStock({ orderId: order.id, actorId, actorRole: userRole, ipAddress });
    }

    await client.query('COMMIT');

    await logAuditEvent({
      actorId,
      actorRole: userRole,
      ipAddress,
      action: 'ORDER_STATUS_UPDATED',
      entity: 'Order',
      entityId: order.id,
      metadata: {
        previousStatus: order.status,
        newStatus,
        orderNumber: order.order_number,
        reason
      }
    });

    return updatedRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  ORDER_STATES,
  LEGAL_ORDER_TRANSITIONS,
  isValidOrderTransition,
  createOrderFromQuote,
  getOrderById,
  listCustomerOrders,
  listAllOrders,
  cancelOrder,
  updateOrderStatus
};
