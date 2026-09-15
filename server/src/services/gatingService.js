/**
 * EyeKart Phase 6.3 Optical Fulfillment Gating Service
 * Evaluates whether an optical order is cleared for laboratory surfacing, edging,
 * and assembly based on authoritative prescription review status.
 */
const { query } = require('../db/pool');

/**
 * Check whether an order is authoritatively eligible for fulfillment
 */
async function checkOrderFulfillmentEligibility(orderId, userId = null, userRole = 'CUSTOMER') {
  const orderRes = await query(
    `SELECT id, order_number, user_id, status, payment_status, 
            requires_prescription_review, prescription_status, created_at
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

  // IDOR Protection: Customers may only query their own order fulfillment status
  const isPrivileged = (userRole === 'ADMIN' || userRole === 'OPTOMETRIST' || userRole === 'STAFF');
  if (!isPrivileged && userId && order.user_id !== userId) {
    const err = new Error('Access denied. You do not have permission to view fulfillment details for this order.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  // 1. Frame-only orders (no prescription required)
  if (!order.requires_prescription_review) {
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      prescriptionRequired: false,
      prescriptionStatus: 'NOT_APPLICABLE',
      fulfillmentEligible: true,
      status: 'ELIGIBLE_FRAME_ONLY',
      clearedAt: order.created_at,
      notes: 'Frame-only order (plano / demo lenses). Bypasses optical prescription gating.'
    };
  }

  // 2. Prescription required orders
  const rxStatus = order.prescription_status;

  if (rxStatus === 'APPROVED') {
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      prescriptionRequired: true,
      prescriptionStatus: 'APPROVED',
      fulfillmentEligible: true,
      status: 'CLEARED_FOR_LAB_SURFACING',
      notes: 'Prescription approved by licensed optometrist. Order authoritatively cleared for laboratory surfacing.'
    };
  }

  if (rxStatus === 'REJECTED') {
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      prescriptionRequired: true,
      prescriptionStatus: 'REJECTED',
      fulfillmentEligible: false,
      status: 'BLOCKED_CLINICAL_REJECTION',
      blockingReason: 'Prescription rejected by optometrist. Review notes required before fulfillment.'
    };
  }

  if (rxStatus === 'CLARIFICATION_REQUIRED') {
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      prescriptionRequired: true,
      prescriptionStatus: 'CLARIFICATION_REQUIRED',
      fulfillmentEligible: false,
      status: 'BLOCKED_CLARIFICATION_REQUIRED',
      blockingReason: 'Clinical clarification requested by optometrist. Customer revision required before fulfillment.'
    };
  }

  // Default: Pending review / unverified
  return {
    orderId: order.id,
    orderNumber: order.order_number,
    prescriptionRequired: true,
    prescriptionStatus: rxStatus || 'PENDING_OPTOMETRIST_REVIEW',
    fulfillmentEligible: false,
    status: 'BLOCKED_PRESCRIPTION_PENDING',
    blockingReason: 'Prescription review pending optometrist clearance'
  };
}

module.exports = {
  checkOrderFulfillmentEligibility
};
