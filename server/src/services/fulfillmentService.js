/**
 * EyeKart Phase 6.4 Operational Fulfillment Service
 * Manages fulfillment lifecycle, optical & payment gating integration,
 * role-based operational transitions, and customer tracking telemetry.
 */
const { query } = require('../db/pool');
const { logAuditEvent } = require('./auditService');
const { allocateStock, releaseStock } = require('./inventoryService');

const FULFILLMENT_STATES = {
  PENDING: 'PENDING',
  ELIGIBLE: 'ELIGIBLE',
  PROCESSING: 'PROCESSING',
  PRODUCTION: 'PRODUCTION',
  QUALITY_CHECK: 'QUALITY_CHECK',
  PACKED: 'PACKED',
  DISPATCHED: 'DISPATCHED',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

const LEGAL_FULFILLMENT_TRANSITIONS = {
  PENDING: ['ELIGIBLE', 'CANCELLED'],
  ELIGIBLE: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PRODUCTION', 'CANCELLED'],
  PRODUCTION: ['QUALITY_CHECK', 'CANCELLED'],
  QUALITY_CHECK: ['PACKED', 'PRODUCTION', 'CANCELLED'],
  PACKED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: []
};

const STAGE_METADATA = {
  PENDING: { number: 1, title: 'Order Confirmed — Awaiting Fulfillment Clearance' },
  ELIGIBLE: { number: 2, title: 'Fulfillment Cleared — Queued for Workshop Allocation' },
  PROCESSING: { number: 3, title: 'CNC German Diamond Bevel Surfacing Queued' },
  PRODUCTION: { number: 4, title: 'Anti-Reflective & Hydrophobic Vacuum Coating in Progress' },
  QUALITY_CHECK: { number: 6, title: 'Clinical Diopter & Axis QA Inspection' },
  PACKED: { number: 8, title: 'Luxury Atelier Casing & Wax Seal Packaged' },
  DISPATCHED: { number: 9, title: 'Handed Over to Westlands Central Lab Express Dispatch' },
  DELIVERED: { number: 10, title: 'White-Glove Handover & Delivery Complete' },
  COMPLETED: { number: 10, title: 'Order Completed & Archival Record Stored' },
  CANCELLED: { number: 0, title: 'Fulfillment Cancelled' }
};

// RBAC mappings for fulfillment transitions
const ROLE_TRANSITION_PERMISSIONS = {
  LAB_TECH: ['PROCESSING', 'PRODUCTION', 'QUALITY_CHECK'],
  STORE_STAFF: ['ELIGIBLE', 'PACKED', 'DISPATCHED', 'DELIVERED', 'COMPLETED'],
  OPTOMETRIST: ['QUALITY_CHECK'],
  ADMIN: ['PENDING', 'ELIGIBLE', 'PROCESSING', 'PRODUCTION', 'QUALITY_CHECK', 'PACKED', 'DISPATCHED', 'DELIVERED', 'COMPLETED', 'CANCELLED']
};

function isValidFulfillmentTransition(fromState, toState) {
  if (fromState === toState) return true;
  const allowed = LEGAL_FULFILLMENT_TRANSITIONS[fromState] || [];
  return allowed.includes(toState);
}

function isRoleAuthorizedForTargetState(role, targetState) {
  if (role === 'ADMIN') return true;
  const allowedStates = ROLE_TRANSITION_PERMISSIONS[role] || [];
  return allowedStates.includes(targetState);
}

/**
 * Generate unique tracking number (e.g. EK-TRK-XXXXX)
 */
async function generateUniqueTrackingNumber() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const num = 'EK-TRK-' + Math.floor(10000 + Math.random() * 90000);
    const check = await query(`SELECT id FROM fulfillments WHERE tracking_number = $1`, [num]);
    if (check.rows.length === 0) return num;
  }
  return 'EK-TRK-' + Date.now().toString().slice(-6);
}

/**
 * Create a fulfillment for an order
 */
async function createFulfillment({
  orderId,
  actorId,
  actorRole = 'STORE_STAFF',
  actorName = 'Operations Staff',
  notes = null,
  ipAddress = null
}) {
  // Customers are strictly forbidden from creating fulfillments
  if (actorRole === 'CUSTOMER') {
    const err = new Error('Access denied. Customers cannot initialize fulfillment records.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN_CUSTOMER_ACTION';
    throw err;
  }

  // 1. Fetch authoritative order
  const orderRes = await query(`SELECT * FROM orders WHERE id::text = $1 OR order_number = $1`, [orderId]);
  if (orderRes.rows.length === 0) {
    const err = new Error('Order not found.');
    err.statusCode = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }
  const order = orderRes.rows[0];

  // 2. Check if fulfillment already exists for this order
  const existingFulfill = await query(`SELECT * FROM fulfillments WHERE order_id = $1`, [order.id]);
  if (existingFulfill.rows.length > 0) {
    const err = new Error('Fulfillment record already exists for this order.');
    err.statusCode = 409;
    err.code = 'FULFILLMENT_ALREADY_EXISTS';
    throw err;
  }

  // 3. PAYMENT GATE: Unpaid orders CANNOT enter fulfillment
  const isPaid = (order.payment_status === 'SUCCESS' || order.status === 'PAID');
  if (!isPaid) {
    const err = new Error('Cannot initiate fulfillment for an unpaid order. Payment must be verified.');
    err.statusCode = 400;
    err.code = 'UNPAID_ORDER_FULFILLMENT_BLOCKED';
    throw err;
  }

  // 4. OPTICAL GATE: Custom lens orders require prescription approval
  let initialStatus = FULFILLMENT_STATES.PENDING;
  if (order.requires_prescription_review) {
    if (order.prescription_status !== 'APPROVED') {
      const err = new Error(`Optical order requires prescription approval before fulfillment. Current prescription status is '${order.prescription_status}'.`);
      err.statusCode = 400;
      err.code = 'OPTICAL_GATE_BLOCKED';
      throw err;
    }
    // Prescription is approved + Paid -> automatically ELIGIBLE
    initialStatus = FULFILLMENT_STATES.ELIGIBLE;
  } else {
    // Frame-only order + Paid -> automatically ELIGIBLE
    initialStatus = FULFILLMENT_STATES.ELIGIBLE;
  }

  const trackingNumber = await generateUniqueTrackingNumber();
  const stageInfo = STAGE_METADATA[initialStatus] || { number: 1, title: 'Fulfillment Initiated' };

  // 5. Insert fulfillment record
  const fulfillRes = await query(
    `INSERT INTO fulfillments (
      order_id, status, tracking_number, shipping_address, notes
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *`,
    [order.id, initialStatus, trackingNumber, order.delivery_address, notes]
  );
  const fulfillment = fulfillRes.rows[0];

  // 6. Record initial fulfillment event
  await query(
    `INSERT INTO fulfillment_events (
      fulfillment_id, from_status, to_status, stage_title, stage_number,
      actor_id, actor_role, actor_name, note
    ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8)`,
    [
      fulfillment.id,
      initialStatus,
      stageInfo.title,
      stageInfo.number,
      actorId || null,
      actorRole,
      actorName,
      notes || 'Fulfillment initialized and verified against payment & optical gates.'
    ]
  );

  // 7. Audit log
  await logAuditEvent({
    actorId,
    actorRole,
    ipAddress,
    action: 'FULFILLMENT_CREATED',
    entity: 'Fulfillment',
    entityId: fulfillment.id,
    metadata: {
      orderId: order.id,
      orderNumber: order.order_number,
      trackingNumber,
      status: initialStatus
    }
  });

  return fulfillment;
}

/**
 * Transition a fulfillment to a new state (with strict RBAC and state machine)
 */
async function transitionFulfillment({
  fulfillmentId,
  targetState,
  actorId,
  actorRole = 'STORE_STAFF',
  actorName = 'Staff Operator',
  note = null,
  ipAddress = null
}) {
  // Customer role is forbidden
  if (actorRole === 'CUSTOMER') {
    const err = new Error('Access denied. Customers cannot modify fulfillment states.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN_CUSTOMER_ACTION';
    throw err;
  }

  // 1. Fetch current fulfillment
  const fRes = await query(`SELECT * FROM fulfillments WHERE id::text = $1 OR tracking_number = $1`, [fulfillmentId]);
  if (fRes.rows.length === 0) {
    const err = new Error('Fulfillment record not found.');
    err.statusCode = 404;
    err.code = 'FULFILLMENT_NOT_FOUND';
    throw err;
  }
  const fulfillment = fRes.rows[0];

  // 2. Enforce RBAC on target state
  if (!isRoleAuthorizedForTargetState(actorRole, targetState)) {
    const err = new Error(`Role '${actorRole}' is not authorized to transition fulfillment to '${targetState}'.`);
    err.statusCode = 403;
    err.code = 'UNAUTHORIZED_ROLE_FOR_TRANSITION';
    throw err;
  }

  // 3. Validate state machine transition
  if (!isValidFulfillmentTransition(fulfillment.status, targetState)) {
    const err = new Error(`Illegal fulfillment state transition from '${fulfillment.status}' to '${targetState}'.`);
    err.statusCode = 400;
    err.code = 'ILLEGAL_FULFILLMENT_TRANSITION';
    throw err;
  }

  // 4. Determine timestamps and stage info
  const stageInfo = STAGE_METADATA[targetState] || { number: 5, title: `Advanced to ${targetState}` };
  let dispatchedAt = fulfillment.dispatched_at;
  let deliveredAt = fulfillment.delivered_at;

  if (targetState === FULFILLMENT_STATES.DISPATCHED && !dispatchedAt) {
    dispatchedAt = new Date().toISOString();
  }
  if (targetState === FULFILLMENT_STATES.DELIVERED && !deliveredAt) {
    deliveredAt = new Date().toISOString();
  }

  // 5. Update fulfillment row
  const updatedFRes = await query(
    `UPDATE fulfillments 
     SET status = $1, 
         dispatched_at = $2, 
         delivered_at = $3, 
         updated_at = CURRENT_TIMESTAMP 
     WHERE id = $4 
     RETURNING *`,
    [targetState, dispatchedAt, deliveredAt, fulfillment.id]
  );
  const updatedFulfillment = updatedFRes.rows[0];

  // 6. Record immutable event
  await query(
    `INSERT INTO fulfillment_events (
      fulfillment_id, from_status, to_status, stage_title, stage_number,
      actor_id, actor_role, actor_name, note
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      fulfillment.id,
      fulfillment.status,
      targetState,
      stageInfo.title,
      stageInfo.number,
      actorId || null,
      actorRole,
      actorName,
      note || `Fulfillment advanced to ${targetState}`
    ]
  );

  // 7. Synchronize inventory upon completion / dispatch / cancellation
  if (targetState === FULFILLMENT_STATES.DISPATCHED || targetState === FULFILLMENT_STATES.COMPLETED) {
    await allocateStock({ orderId: fulfillment.order_id, actorId, actorRole, ipAddress });
  } else if (targetState === FULFILLMENT_STATES.CANCELLED) {
    await releaseStock({ orderId: fulfillment.order_id, actorId, actorRole, ipAddress });
  }

  // 8. Synchronize order tracking
  await query(
    `UPDATE orders 
     SET status = CASE 
       WHEN $1 = 'DELIVERED' OR $1 = 'COMPLETED' THEN 'COMPLETED'
       WHEN $1 = 'CANCELLED' THEN 'CANCELLED'
       ELSE 'PROCESSING'
     END,
     tracking = jsonb_set(
       COALESCE(tracking, '{}'::jsonb),
       '{stage}', to_jsonb($1::text)
     ),
     updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2`,
    [targetState, fulfillment.order_id]
  );

  // 9. Audit log
  await logAuditEvent({
    actorId,
    actorRole,
    ipAddress,
    action: 'FULFILLMENT_TRANSITIONED',
    entity: 'Fulfillment',
    entityId: fulfillment.id,
    metadata: {
      orderId: fulfillment.order_id,
      fromStatus: fulfillment.status,
      toStatus: targetState,
      actorName
    }
  });

  return updatedFulfillment;
}

/**
 * Retrieve fulfillment and events for an order (with strict IDOR protection)
 */
async function getFulfillmentByOrderId(orderId, userId = null, userRole = 'CUSTOMER') {
  // 1. Resolve order
  const orderRes = await query(
    `SELECT id, order_number, user_id, status, payment_status, 
            requires_prescription_review, prescription_status, 
            delivery_address, gate_protocol, tracking
     FROM orders 
     WHERE id::text = $1 OR order_number = $1`,
    [orderId]
  );

  if (orderRes.rows.length === 0) {
    const err = new Error('Order not found.');
    err.statusCode = 404;
    err.code = 'ORDER_NOT_FOUND';
    throw err;
  }
  const order = orderRes.rows[0];

  // 2. IDOR Protection: Customers may only view their own order fulfillment
  const isPrivileged = (userRole === 'ADMIN' || userRole === 'STORE_STAFF' || userRole === 'LAB_TECH' || userRole === 'OPTOMETRIST');
  if (!isPrivileged && userId && order.user_id !== userId) {
    const err = new Error('Access denied. You do not have permission to view fulfillment details for this order.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN_TRACKING_ACCESS';
    throw err;
  }

  // 3. Resolve fulfillment
  const fRes = await query(`SELECT * FROM fulfillments WHERE order_id = $1`, [order.id]);
  const fulfillment = fRes.rows[0] || null;

  let events = [];
  if (fulfillment) {
    const evRes = await query(
      `SELECT * FROM fulfillment_events WHERE fulfillment_id = $1 ORDER BY created_at ASC`,
      [fulfillment.id]
    );
    events = evRes.rows;
  }

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    fulfillment,
    events,
    tracking: {
      carrier: fulfillment?.carrier || 'Westlands Central Lab Express Dispatch (DEMO)',
      trackingNumber: fulfillment?.tracking_number || null,
      status: fulfillment?.status || 'AWAITING_FULFILLMENT',
      riderName: fulfillment?.rider_name || 'Westlands Central Lab Dispatch',
      riderPhone: fulfillment?.rider_phone || '+254 700 918 274',
      vehicleReg: fulfillment?.vehicle_reg || 'Electric Moto Transporter #EK-E12',
      shippingAddress: order.delivery_address,
      gateProtocol: order.gate_protocol,
      dispatchedAt: fulfillment?.dispatched_at,
      deliveredAt: fulfillment?.delivered_at,
      events
    }
  };
}

module.exports = {
  FULFILLMENT_STATES,
  LEGAL_FULFILLMENT_TRANSITIONS,
  STAGE_METADATA,
  isValidFulfillmentTransition,
  createFulfillment,
  transitionFulfillment,
  getFulfillmentByOrderId
};
