/**
 * EyeKart Phase 5 Optical Fulfillment Gating Service
 * Evaluates whether an optical order is authoritatively cleared for laboratory surfacing,
 * edging, and assembly based on payment verification and licensed optometrist prescription review.
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
  const isPrivileged = (userRole === 'ADMIN' || userRole === 'OPTOMETRIST' || userRole === 'STORE_STAFF' || userRole === 'LAB_TECH');
  if (!isPrivileged && userId && order.user_id !== userId) {
    const err = new Error('Access denied. You do not have permission to view fulfillment details for this order.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  // 1. Cancelled Order Check
  if (order.status === 'CANCELLED') {
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      fulfillmentEligible: false,
      status: 'BLOCKED_ORDER_CANCELLED',
      blockingReason: 'Order has been cancelled. Fulfillment is aborted.'
    };
  }

  // 2. Expired Order Check
  if (order.status === 'EXPIRED') {
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      fulfillmentEligible: false,
      status: 'BLOCKED_ORDER_EXPIRED',
      blockingReason: 'Order has expired without payment confirmation.'
    };
  }

  // 3. Payment Gate Check: Unpaid orders are strictly blocked from fulfillment
  const isPaid = (order.payment_status === 'SUCCESS' || order.status === 'PAID' || order.status === 'PROCESSING' || order.status === 'COMPLETED');
  if (!isPaid) {
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      fulfillmentEligible: false,
      status: 'BLOCKED_UNPAID',
      blockingReason: 'Order payment is pending. Verified payment is strictly required before fulfillment clearance.'
    };
  }

  // 4. Frame-only orders (no prescription review required)
  if (!order.requires_prescription_review) {
    return {
      orderId: order.id,
      orderNumber: order.order_number,
      prescriptionRequired: false,
      prescriptionStatus: 'NOT_APPLICABLE',
      fulfillmentEligible: true,
      status: 'ELIGIBLE_FRAME_ONLY',
      clearedAt: order.created_at,
      notes: 'Frame-only order (plano / demo lenses). Bypasses optical prescription review and cleared for assembly.'
    };
  }

  // 5. Prescription-dependent orders: Clinical gate
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
      blockingReason: 'Prescription rejected by licensed optometrist. Clinical review notes must be resolved before fulfillment.'
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

  // Default: Pending optometrist review
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
