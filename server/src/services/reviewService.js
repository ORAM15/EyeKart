/**
 * EyeKart Phase 6.3 Optometrist Review Service
 * Manages clinical prescription review workflows, role verification,
 * decision immutability, and clinical order status synchronization.
 */
const { query } = require('../db/pool');
const { logAuditEvent } = require('./auditService');
const { RX_STATES } = require('./prescriptionService');

/**
 * Enforce optometrist role verification
 */
function verifyReviewerRole(role) {
  if (role !== 'OPTOMETRIST' && role !== 'ADMIN') {
    const err = new Error('Access denied. Only licensed Optometrists or Administrators can perform clinical prescription reviews.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN_REVIEWER_ROLE';
    throw err;
  }
}

/**
 * Get Optometrist Review Queue
 */
async function getReviewQueue({ status = RX_STATES.PENDING_OPTOMETRIST_REVIEW, limit = 50, offset = 0 } = {}) {
  let whereClause = `WHERE p.status = $1`;
  let params = [status];

  if (status === 'ALL') {
    whereClause = `WHERE p.status IN ('PENDING_OPTOMETRIST_REVIEW', 'SUBMITTED', 'CLARIFICATION_REQUIRED', 'APPROVED', 'REJECTED')`;
    params = [];
  }

  const listSql = `
    SELECT 
      p.id,
      p.user_id,
      p.order_id,
      p.current_revision,
      p.status,
      p.prescription_mode,
      p.source,
      p.notes AS customer_notes,
      p.created_at,
      p.updated_at,
      u.full_name AS customer_name,
      u.email AS customer_email,
      u.phone AS customer_phone,
      r.od_sph, r.od_cyl, r.od_axis, r.od_add,
      r.os_sph, r.os_cyl, r.os_axis, r.os_add,
      r.pd, r.patient_note,
      o.order_number
    FROM prescriptions p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN prescription_revisions r ON p.id = r.prescription_id AND p.current_revision = r.revision_number
    LEFT JOIN orders o ON p.order_id = o.id
    ${whereClause}
    ORDER BY p.updated_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const countSql = `SELECT COUNT(*) FROM prescriptions p ${whereClause}`;

  const [itemsRes, countRes] = await Promise.all([
    query(listSql, [...params, limit, offset]),
    query(countSql, params)
  ]);

  return {
    items: itemsRes.rows,
    total: parseInt(countRes.rows[0].count, 10),
    limit,
    offset
  };
}

/**
 * Optometrist Approves Prescription
 */
async function approvePrescription({
  prescriptionId,
  reviewerId,
  reviewerRole,
  reviewerName,
  notes = '',
  ipAddress = null
}) {
  verifyReviewerRole(reviewerRole);

  const rxRes = await query(`SELECT * FROM prescriptions WHERE id = $1`, [prescriptionId]);
  if (rxRes.rows.length === 0) {
    const err = new Error('Prescription not found.');
    err.statusCode = 404;
    err.code = 'PRESCRIPTION_NOT_FOUND';
    throw err;
  }
  const rx = rxRes.rows[0];

  if (rx.status === RX_STATES.APPROVED) {
    const err = new Error('Prescription is already approved.');
    err.statusCode = 400;
    err.code = 'ALREADY_APPROVED';
    throw err;
  }

  if (rx.status !== RX_STATES.PENDING_OPTOMETRIST_REVIEW && rx.status !== RX_STATES.SUBMITTED) {
    const err = new Error(`Cannot approve prescription in state '${rx.status}'. Only pending prescriptions may be approved.`);
    err.statusCode = 400;
    err.code = 'ILLEGAL_PRESCRIPTION_STATE_TRANSITION';
    throw err;
  }

  // 1. Record immutable review event
  const reviewRes = await query(
    `INSERT INTO prescription_reviews (
      prescription_id, revision_number,
      reviewer_id, reviewer_role, reviewer_name,
      action, notes
    ) VALUES ($1, $2, $3, $4, $5, 'APPROVE', $6)
    RETURNING *`,
    [
      rx.id,
      rx.current_revision,
      reviewerId,
      reviewerRole,
      reviewerName,
      notes || 'Prescription parameters clinically verified and approved for laboratory surfacing.'
    ]
  );
  const review = reviewRes.rows[0];

  // 2. Update prescription status
  const updatedRxRes = await query(
    `UPDATE prescriptions 
     SET status = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2 
     RETURNING *`,
    [RX_STATES.APPROVED, rx.id]
  );
  const updatedRx = updatedRxRes.rows[0];

  // 3. Synchronize linked order
  if (rx.order_id) {
    await query(
      `UPDATE orders 
       SET prescription_status = 'APPROVED',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [rx.order_id]
    );
  }

  // 4. Clinical Audit Log
  await logAuditEvent({
    actorId: reviewerId,
    actorRole: reviewerRole,
    ipAddress,
    action: 'PRESCRIPTION_APPROVED',
    entity: 'Prescription',
    entityId: rx.id,
    metadata: {
      revision: rx.current_revision,
      reviewerName,
      orderId: rx.order_id
    }
  });

  return {
    prescription: updatedRx,
    review
  };
}

/**
 * Optometrist Rejects Prescription
 */
async function rejectPrescription({
  prescriptionId,
  reviewerId,
  reviewerRole,
  reviewerName,
  notes,
  ipAddress = null
}) {
  verifyReviewerRole(reviewerRole);

  if (!notes || typeof notes !== 'string' || notes.trim().length < 3) {
    const err = new Error('A clear clinical explanation is required when rejecting a prescription.');
    err.statusCode = 400;
    err.code = 'REJECTION_REASON_REQUIRED';
    throw err;
  }

  const rxRes = await query(`SELECT * FROM prescriptions WHERE id = $1`, [prescriptionId]);
  if (rxRes.rows.length === 0) {
    const err = new Error('Prescription not found.');
    err.statusCode = 404;
    err.code = 'PRESCRIPTION_NOT_FOUND';
    throw err;
  }
  const rx = rxRes.rows[0];

  if (rx.status === RX_STATES.REJECTED) {
    const err = new Error('Prescription is already rejected.');
    err.statusCode = 400;
    err.code = 'ALREADY_REJECTED';
    throw err;
  }

  if (rx.status !== RX_STATES.PENDING_OPTOMETRIST_REVIEW && rx.status !== RX_STATES.SUBMITTED) {
    const err = new Error(`Cannot reject prescription in state '${rx.status}'. Only pending prescriptions may be rejected.`);
    err.statusCode = 400;
    err.code = 'ILLEGAL_PRESCRIPTION_STATE_TRANSITION';
    throw err;
  }

  // 1. Record immutable review event
  const reviewRes = await query(
    `INSERT INTO prescription_reviews (
      prescription_id, revision_number,
      reviewer_id, reviewer_role, reviewer_name,
      action, notes
    ) VALUES ($1, $2, $3, $4, $5, 'REJECT', $6)
    RETURNING *`,
    [
      rx.id,
      rx.current_revision,
      reviewerId,
      reviewerRole,
      reviewerName,
      notes.trim()
    ]
  );
  const review = reviewRes.rows[0];

  // 2. Update prescription status
  const updatedRxRes = await query(
    `UPDATE prescriptions 
     SET status = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2 
     RETURNING *`,
    [RX_STATES.REJECTED, rx.id]
  );
  const updatedRx = updatedRxRes.rows[0];

  // 3. Synchronize linked order
  if (rx.order_id) {
    await query(
      `UPDATE orders 
       SET prescription_status = 'REJECTED',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [rx.order_id]
    );
  }

  // 4. Clinical Audit Log
  await logAuditEvent({
    actorId: reviewerId,
    actorRole: reviewerRole,
    ipAddress,
    action: 'PRESCRIPTION_REJECTED',
    entity: 'Prescription',
    entityId: rx.id,
    metadata: {
      revision: rx.current_revision,
      reviewerName,
      reason: notes.trim(),
      orderId: rx.order_id
    }
  });

  return {
    prescription: updatedRx,
    review
  };
}

/**
 * Optometrist Requests Clarification from Customer
 */
async function requestClarification({
  prescriptionId,
  reviewerId,
  reviewerRole,
  reviewerName,
  notes,
  ipAddress = null
}) {
  verifyReviewerRole(reviewerRole);

  if (!notes || typeof notes !== 'string' || notes.trim().length < 3) {
    const err = new Error('Clinical clarification instructions are required.');
    err.statusCode = 400;
    err.code = 'CLARIFICATION_NOTES_REQUIRED';
    throw err;
  }

  const rxRes = await query(`SELECT * FROM prescriptions WHERE id = $1`, [prescriptionId]);
  if (rxRes.rows.length === 0) {
    const err = new Error('Prescription not found.');
    err.statusCode = 404;
    err.code = 'PRESCRIPTION_NOT_FOUND';
    throw err;
  }
  const rx = rxRes.rows[0];

  if (rx.status !== RX_STATES.PENDING_OPTOMETRIST_REVIEW && rx.status !== RX_STATES.SUBMITTED) {
    const err = new Error(`Cannot request clarification for prescription in state '${rx.status}'. Only pending prescriptions may be placed on hold for clarification.`);
    err.statusCode = 400;
    err.code = 'ILLEGAL_PRESCRIPTION_STATE_TRANSITION';
    throw err;
  }

  // 1. Record immutable review event
  const reviewRes = await query(
    `INSERT INTO prescription_reviews (
      prescription_id, revision_number,
      reviewer_id, reviewer_role, reviewer_name,
      action, notes
    ) VALUES ($1, $2, $3, $4, $5, 'REQUEST_CLARIFICATION', $6)
    RETURNING *`,
    [
      rx.id,
      rx.current_revision,
      reviewerId,
      reviewerRole,
      reviewerName,
      notes.trim()
    ]
  );
  const review = reviewRes.rows[0];

  // 2. Update prescription status
  const updatedRxRes = await query(
    `UPDATE prescriptions 
     SET status = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2 
     RETURNING *`,
    [RX_STATES.CLARIFICATION_REQUIRED, rx.id]
  );
  const updatedRx = updatedRxRes.rows[0];

  // 3. Synchronize linked order
  if (rx.order_id) {
    await query(
      `UPDATE orders 
       SET prescription_status = 'CLARIFICATION_REQUIRED',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [rx.order_id]
    );
  }

  // 4. Clinical Audit Log
  await logAuditEvent({
    actorId: reviewerId,
    actorRole: reviewerRole,
    ipAddress,
    action: 'PRESCRIPTION_CLARIFICATION_REQUESTED',
    entity: 'Prescription',
    entityId: rx.id,
    metadata: {
      revision: rx.current_revision,
      reviewerName,
      notes: notes.trim(),
      orderId: rx.order_id
    }
  });

  return {
    prescription: updatedRx,
    review
  };
}

module.exports = {
  getReviewQueue,
  approvePrescription,
  rejectPrescription,
  requestClarification
};
