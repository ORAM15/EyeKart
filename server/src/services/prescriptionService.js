/**
 * EyeKart Phase 6.3 Prescription Service
 * Manages clinical optical prescriptions, refractive parameter validation,
 * immutable revision history, and patient ownership boundaries.
 */
const { query } = require('../db/pool');
const { logAuditEvent } = require('./auditService');

const RX_STATES = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  PENDING_OPTOMETRIST_REVIEW: 'PENDING_OPTOMETRIST_REVIEW',
  CLARIFICATION_REQUIRED: 'CLARIFICATION_REQUIRED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

const LEGAL_RX_TRANSITIONS = {
  DRAFT: ['SUBMITTED', 'PENDING_OPTOMETRIST_REVIEW'],
  SUBMITTED: ['PENDING_OPTOMETRIST_REVIEW'],
  PENDING_OPTOMETRIST_REVIEW: ['APPROVED', 'REJECTED', 'CLARIFICATION_REQUIRED'],
  CLARIFICATION_REQUIRED: ['SUBMITTED', 'PENDING_OPTOMETRIST_REVIEW'],
  APPROVED: [],
  REJECTED: []
};

function isValidRxTransition(fromState, toState) {
  if (fromState === toState) return true;
  const allowed = LEGAL_RX_TRANSITIONS[fromState] || [];
  return allowed.includes(toState);
}

/**
 * Validate refractive inputs (SPH, CYL, AXIS, ADD, PD)
 */
function validateRefractiveValues(values = {}) {
  const od_sph = Number(values.od_sph ?? values.odSph ?? 0);
  const od_cyl = Number(values.od_cyl ?? values.odCyl ?? 0);
  const od_axis = (values.od_axis !== undefined && values.od_axis !== null && values.od_axis !== '') 
    ? Number(values.od_axis) 
    : (values.odAxis !== undefined && values.odAxis !== null && values.odAxis !== '') 
      ? Number(values.odAxis) 
      : null;
  const od_add = (values.od_add !== undefined && values.od_add !== null && values.od_add !== '')
    ? Number(values.od_add)
    : (values.odAdd !== undefined && values.odAdd !== null && values.odAdd !== '')
      ? Number(values.odAdd)
      : null;

  const os_sph = Number(values.os_sph ?? values.osSph ?? 0);
  const os_cyl = Number(values.os_cyl ?? values.osCyl ?? 0);
  const os_axis = (values.os_axis !== undefined && values.os_axis !== null && values.os_axis !== '') 
    ? Number(values.os_axis) 
    : (values.osAxis !== undefined && values.osAxis !== null && values.osAxis !== '') 
      ? Number(values.osAxis) 
      : null;
  const os_add = (values.os_add !== undefined && values.os_add !== null && values.os_add !== '')
    ? Number(values.os_add)
    : (values.osAdd !== undefined && values.osAdd !== null && values.osAdd !== '')
      ? Number(values.osAdd)
      : null;

  const pd = Number(values.pd ?? 63.0);

  // SPH bounds (-20.00 to +20.00)
  if (isNaN(od_sph) || od_sph < -20.0 || od_sph > 20.0) {
    const err = new Error('OD Sphere must be between -20.00 and +20.00 diopters.');
    err.statusCode = 400;
    err.code = 'INVALID_SPHERE';
    throw err;
  }
  if (isNaN(os_sph) || os_sph < -20.0 || os_sph > 20.0) {
    const err = new Error('OS Sphere must be between -20.00 and +20.00 diopters.');
    err.statusCode = 400;
    err.code = 'INVALID_SPHERE';
    throw err;
  }

  // CYL bounds (-10.00 to +10.00)
  if (isNaN(od_cyl) || od_cyl < -10.0 || od_cyl > 10.0) {
    const err = new Error('OD Cylinder must be between -10.00 and +10.00 diopters.');
    err.statusCode = 400;
    err.code = 'INVALID_CYLINDER';
    throw err;
  }
  if (isNaN(os_cyl) || os_cyl < -10.0 || os_cyl > 10.0) {
    const err = new Error('OS Cylinder must be between -10.00 and +10.00 diopters.');
    err.statusCode = 400;
    err.code = 'INVALID_CYLINDER';
    throw err;
  }

  // CYL requires AXIS rule
  if (Math.abs(od_cyl) > 0.0001) {
    if (od_axis === null || isNaN(od_axis) || !Number.isInteger(od_axis) || od_axis < 1 || od_axis > 180) {
      const err = new Error('OD Cylinder requires an Axis integer between 1 and 180 degrees.');
      err.statusCode = 400;
      err.code = 'CYL_REQUIRES_AXIS';
      throw err;
    }
  }

  if (Math.abs(os_cyl) > 0.0001) {
    if (os_axis === null || isNaN(os_axis) || !Number.isInteger(os_axis) || os_axis < 1 || os_axis > 180) {
      const err = new Error('OS Cylinder requires an Axis integer between 1 and 180 degrees.');
      err.statusCode = 400;
      err.code = 'CYL_REQUIRES_AXIS';
      throw err;
    }
  }

  // ADD bounds (+0.50 to +4.00)
  if (od_add !== null) {
    if (isNaN(od_add) || od_add < 0.5 || od_add > 4.0) {
      const err = new Error('OD Add must be between +0.50 and +4.00 diopters.');
      err.statusCode = 400;
      err.code = 'INVALID_ADD';
      throw err;
    }
  }
  if (os_add !== null) {
    if (isNaN(os_add) || os_add < 0.5 || os_add > 4.0) {
      const err = new Error('OS Add must be between +0.50 and +4.00 diopters.');
      err.statusCode = 400;
      err.code = 'INVALID_ADD';
      throw err;
    }
  }

  // PD bounds (50.00 to 75.00)
  if (isNaN(pd) || pd < 50.0 || pd > 75.0) {
    const err = new Error('Pupillary Distance (PD) must be between 50.00mm and 75.00mm.');
    err.statusCode = 400;
    err.code = 'INVALID_PD';
    throw err;
  }

  return {
    od_sph,
    od_cyl,
    od_axis: Math.abs(od_cyl) > 0.0001 ? od_axis : null,
    od_add,
    os_sph,
    os_cyl,
    os_axis: Math.abs(os_cyl) > 0.0001 ? os_axis : null,
    os_add,
    pd
  };
}

/**
 * Create a new prescription with initial revision (Revision 1)
 */
async function createPrescription({
  userId,
  orderId = null,
  prescriptionMode = 'USER_ENTERED',
  source = 'MANUAL_ENTRY',
  values = {},
  patientNote = null,
  documentId = null,
  autoSubmit = false,
  ipAddress = null
}) {
  if (!userId) {
    const err = new Error('Authentication required to create a prescription.');
    err.statusCode = 401;
    err.code = 'AUTHENTICATION_REQUIRED';
    throw err;
  }

  // Validate parameters
  const validatedValues = validateRefractiveValues(values);

  // If orderId is provided, verify ownership
  if (orderId) {
    const orderCheck = await query(`SELECT user_id FROM orders WHERE id::text = $1 OR order_number = $1`, [orderId]);
    if (orderCheck.rows.length === 0) {
      const err = new Error('Referenced order does not exist.');
      err.statusCode = 404;
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }
    if (orderCheck.rows[0].user_id !== userId) {
      const err = new Error('Cannot attach prescription to an order belonging to another customer.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }
  }

  // If documentId is provided, verify ownership
  if (documentId) {
    const docCheck = await query(`SELECT user_id FROM stored_documents WHERE id::text = $1`, [documentId]);
    if (docCheck.rows.length === 0) {
      const err = new Error('Referenced medical document does not exist.');
      err.statusCode = 404;
      err.code = 'DOCUMENT_NOT_FOUND';
      throw err;
    }
    if (docCheck.rows[0].user_id !== userId) {
      const err = new Error('Cannot attach a medical document belonging to another customer.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_DOCUMENT_ACCESS';
      throw err;
    }
  }

  const initialStatus = autoSubmit ? RX_STATES.PENDING_OPTOMETRIST_REVIEW : RX_STATES.DRAFT;

  // Insert master prescription record
  const rxRes = await query(
    `INSERT INTO prescriptions (
      user_id, order_id, current_revision, status, prescription_mode, source, notes, document_id
    ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7)
    RETURNING *`,
    [userId, orderId || null, initialStatus, prescriptionMode, source, patientNote || null, documentId || null]
  );
  const rx = rxRes.rows[0];

  // Insert Revision 1
  const revRes = await query(
    `INSERT INTO prescription_revisions (
      prescription_id, revision_number,
      od_sph, od_cyl, od_axis, od_add,
      os_sph, os_cyl, os_axis, os_add,
      pd, patient_note, author_id
    ) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      rx.id,
      validatedValues.od_sph,
      validatedValues.od_cyl,
      validatedValues.od_axis,
      validatedValues.od_add,
      validatedValues.os_sph,
      validatedValues.os_cyl,
      validatedValues.os_axis,
      validatedValues.os_add,
      validatedValues.pd,
      patientNote || null,
      userId
    ]
  );
  const rev1 = revRes.rows[0];

  // If linked to order and autoSubmit, update order status
  if (orderId && autoSubmit) {
    await query(
      `UPDATE orders 
       SET prescription_status = 'PENDING_OPTOMETRIST_REVIEW',
           prescription_snapshot = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify({ rxId: rx.id, revision: 1, values: validatedValues }), orderId]
    );
  }

  await logAuditEvent({
    actorId: userId,
    actorRole: 'CUSTOMER',
    ipAddress,
    action: 'PRESCRIPTION_CREATED',
    entity: 'Prescription',
    entityId: rx.id,
    metadata: {
      orderId,
      status: initialStatus,
      revision: 1
    }
  });

  return {
    ...rx,
    currentRevision: rev1,
    revisions: [rev1],
    reviews: []
  };
}

/**
 * Submit prescription to Optometrist Review queue
 */
async function submitPrescription({ prescriptionId, userId, userRole = 'CUSTOMER', ipAddress = null }) {
  const rxRes = await query(`SELECT * FROM prescriptions WHERE id = $1`, [prescriptionId]);
  if (rxRes.rows.length === 0) {
    const err = new Error('Prescription not found.');
    err.statusCode = 404;
    err.code = 'PRESCRIPTION_NOT_FOUND';
    throw err;
  }
  const rx = rxRes.rows[0];

  // IDOR protection
  if (userRole !== 'ADMIN' && rx.user_id !== userId) {
    const err = new Error('Access denied. You do not own this prescription.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN_PRESCRIPTION_ACCESS';
    throw err;
  }

  if (rx.status !== RX_STATES.DRAFT && rx.status !== RX_STATES.SUBMITTED) {
    const err = new Error(`Prescription cannot be submitted from status '${rx.status}'.`);
    err.statusCode = 400;
    err.code = 'ILLEGAL_PRESCRIPTION_STATE_TRANSITION';
    throw err;
  }

  const updatedRes = await query(
    `UPDATE prescriptions 
     SET status = $1, updated_at = CURRENT_TIMESTAMP 
     WHERE id = $2 
     RETURNING *`,
    [RX_STATES.PENDING_OPTOMETRIST_REVIEW, rx.id]
  );
  const updatedRx = updatedRes.rows[0];

  // Update linked order if exists
  if (updatedRx.order_id) {
    await query(
      `UPDATE orders 
       SET prescription_status = 'PENDING_OPTOMETRIST_REVIEW',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [updatedRx.order_id]
    );
  }

  await logAuditEvent({
    actorId: userId,
    actorRole: userRole,
    ipAddress,
    action: 'PRESCRIPTION_SUBMITTED',
    entity: 'Prescription',
    entityId: rx.id,
    metadata: {
      fromStatus: rx.status,
      toStatus: RX_STATES.PENDING_OPTOMETRIST_REVIEW
    }
  });

  return updatedRx;
}

/**
 * Resubmit prescription clarification (creates Revision N + 1)
 */
async function respondToClarification({
  prescriptionId,
  userId,
  userRole = 'CUSTOMER',
  values = {},
  patientNote = null,
  ipAddress = null
}) {
  const rxRes = await query(`SELECT * FROM prescriptions WHERE id = $1`, [prescriptionId]);
  if (rxRes.rows.length === 0) {
    const err = new Error('Prescription not found.');
    err.statusCode = 404;
    err.code = 'PRESCRIPTION_NOT_FOUND';
    throw err;
  }
  const rx = rxRes.rows[0];

  // IDOR protection
  if (userRole !== 'ADMIN' && rx.user_id !== userId) {
    const err = new Error('Access denied. You do not own this prescription.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN_PRESCRIPTION_ACCESS';
    throw err;
  }

  if (rx.status !== RX_STATES.CLARIFICATION_REQUIRED) {
    const err = new Error(`Prescription is not awaiting clarification. Current status is '${rx.status}'.`);
    err.statusCode = 400;
    err.code = 'ILLEGAL_PRESCRIPTION_STATE_TRANSITION';
    throw err;
  }

  // Validate new values
  const validatedValues = validateRefractiveValues(values);
  const nextRevisionNumber = rx.current_revision + 1;

  // Insert Revision N + 1
  const revRes = await query(
    `INSERT INTO prescription_revisions (
      prescription_id, revision_number,
      od_sph, od_cyl, od_axis, od_add,
      os_sph, os_cyl, os_axis, os_add,
      pd, patient_note, author_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      rx.id,
      nextRevisionNumber,
      validatedValues.od_sph,
      validatedValues.od_cyl,
      validatedValues.od_axis,
      validatedValues.od_add,
      validatedValues.os_sph,
      validatedValues.os_cyl,
      validatedValues.os_axis,
      validatedValues.os_add,
      validatedValues.pd,
      patientNote || null,
      userId
    ]
  );
  const newRevision = revRes.rows[0];

  // Update prescription record to PENDING_OPTOMETRIST_REVIEW
  const updatedRxRes = await query(
    `UPDATE prescriptions 
     SET current_revision = $1,
         status = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING *`,
    [nextRevisionNumber, RX_STATES.PENDING_OPTOMETRIST_REVIEW, rx.id]
  );
  const updatedRx = updatedRxRes.rows[0];

  // Update linked order if exists
  if (updatedRx.order_id) {
    await query(
      `UPDATE orders 
       SET prescription_status = 'PENDING_OPTOMETRIST_REVIEW',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [updatedRx.order_id]
    );
  }

  await logAuditEvent({
    actorId: userId,
    actorRole: userRole,
    ipAddress,
    action: 'PRESCRIPTION_CLARIFICATION_SUBMITTED',
    entity: 'Prescription',
    entityId: rx.id,
    metadata: {
      previousRevision: rx.current_revision,
      newRevision: nextRevisionNumber
    }
  });

  return {
    ...updatedRx,
    currentRevision: newRevision
  };
}

/**
 * Retrieve a prescription by ID with IDOR protection
 */
async function getPrescriptionById(prescriptionId, userId, userRole = 'CUSTOMER') {
  const rxRes = await query(`SELECT * FROM prescriptions WHERE id = $1`, [prescriptionId]);
  if (rxRes.rows.length === 0) {
    const err = new Error('Prescription not found.');
    err.statusCode = 404;
    err.code = 'PRESCRIPTION_NOT_FOUND';
    throw err;
  }
  const rx = rxRes.rows[0];

  // IDOR Protection: Customers may only access their own prescriptions
  const isPrivileged = (userRole === 'ADMIN' || userRole === 'OPTOMETRIST' || userRole === 'STAFF');
  if (!isPrivileged && rx.user_id !== userId) {
    const err = new Error('Access denied. You do not have permission to view this prescription.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN_PRESCRIPTION_ACCESS';
    throw err;
  }

  // Fetch revisions ordered by revision_number
  const revsRes = await query(
    `SELECT * FROM prescription_revisions WHERE prescription_id = $1 ORDER BY revision_number ASC`,
    [rx.id]
  );

  // Fetch review history
  const reviewsRes = await query(
    `SELECT * FROM prescription_reviews WHERE prescription_id = $1 ORDER BY created_at ASC`,
    [rx.id]
  );

  const currentRevision = revsRes.rows.find(r => r.revision_number === rx.current_revision) || revsRes.rows[revsRes.rows.length - 1];

  return {
    ...rx,
    currentRevision,
    revisions: revsRes.rows,
    reviews: reviewsRes.rows
  };
}

/**
 * List prescriptions for a customer
 */
async function listUserPrescriptions(userId) {
  const rxRes = await query(
    `SELECT p.*, r.od_sph, r.od_cyl, r.od_axis, r.od_add, r.os_sph, r.os_cyl, r.os_axis, r.os_add, r.pd, r.patient_note
     FROM prescriptions p
     LEFT JOIN prescription_revisions r ON p.id = r.prescription_id AND p.current_revision = r.revision_number
     WHERE p.user_id = $1
     ORDER BY p.created_at DESC`,
    [userId]
  );
  return rxRes.rows;
}

/**
 * Update a draft prescription (Allowed ONLY when status is DRAFT)
 */
async function updateDraftPrescription({
  prescriptionId,
  userId,
  userRole = 'CUSTOMER',
  values = {},
  patientNote = null,
  documentId = null,
  ipAddress = null
}) {
  const rxRes = await query(`SELECT * FROM prescriptions WHERE id = $1`, [prescriptionId]);
  if (rxRes.rows.length === 0) {
    const err = new Error('Prescription not found.');
    err.statusCode = 404;
    err.code = 'PRESCRIPTION_NOT_FOUND';
    throw err;
  }
  const rx = rxRes.rows[0];

  if (userRole !== 'ADMIN' && rx.user_id !== userId) {
    const err = new Error('Access denied. You do not own this prescription.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN_PRESCRIPTION_ACCESS';
    throw err;
  }

  // Approved, Submitted, or Under-Review prescriptions are IMMUTABLE
  if (rx.status !== RX_STATES.DRAFT) {
    const err = new Error(`Only draft prescriptions can be modified. Prescriptions in '${rx.status}' are immutable.`);
    err.statusCode = 400;
    err.code = 'CANNOT_MUTATE_NON_DRAFT_PRESCRIPTION';
    throw err;
  }

  const validatedValues = validateRefractiveValues(values);

  let cleanDocId = rx.document_id;
  if (documentId !== undefined) {
    if (documentId !== null) {
      const docCheck = await query(`SELECT user_id FROM stored_documents WHERE id::text = $1`, [documentId]);
      if (docCheck.rows.length === 0) {
        const err = new Error('Referenced medical document does not exist.');
        err.statusCode = 404;
        err.code = 'DOCUMENT_NOT_FOUND';
        throw err;
      }
      if (docCheck.rows[0].user_id !== userId) {
        const err = new Error('Cannot attach a medical document belonging to another customer.');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_DOCUMENT_ACCESS';
        throw err;
      }
      cleanDocId = documentId;
    } else {
      cleanDocId = null;
    }
  }

  // Update Revision 1
  const revRes = await query(
    `UPDATE prescription_revisions
     SET od_sph = $1, od_cyl = $2, od_axis = $3, od_add = $4,
         os_sph = $5, os_cyl = $6, os_axis = $7, os_add = $8,
         pd = $9, patient_note = COALESCE($10, patient_note)
     WHERE prescription_id = $11 AND revision_number = 1
     RETURNING *`,
    [
      validatedValues.od_sph,
      validatedValues.od_cyl,
      validatedValues.od_axis,
      validatedValues.od_add,
      validatedValues.os_sph,
      validatedValues.os_cyl,
      validatedValues.os_axis,
      validatedValues.os_add,
      validatedValues.pd,
      patientNote,
      rx.id
    ]
  );
  const updatedRev = revRes.rows[0];

  const updatedRxRes = await query(
    `UPDATE prescriptions
     SET notes = COALESCE($1, notes),
         document_id = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING *`,
    [patientNote, cleanDocId, rx.id]
  );
  const updatedRx = updatedRxRes.rows[0];

  await logAuditEvent({
    actorId: userId,
    actorRole: userRole,
    ipAddress,
    action: 'PRESCRIPTION_DRAFT_UPDATED',
    entity: 'Prescription',
    entityId: rx.id
  });

  return {
    ...updatedRx,
    currentRevision: updatedRev
  };
}

/**
 * Delete a draft prescription (Only permitted in DRAFT state)
 */
async function deleteDraftPrescription({ prescriptionId, userId, userRole = 'CUSTOMER', ipAddress = null }) {
  const rxRes = await query(`SELECT * FROM prescriptions WHERE id = $1`, [prescriptionId]);
  if (rxRes.rows.length === 0) {
    const err = new Error('Prescription not found.');
    err.statusCode = 404;
    err.code = 'PRESCRIPTION_NOT_FOUND';
    throw err;
  }
  const rx = rxRes.rows[0];

  if (userRole !== 'ADMIN' && rx.user_id !== userId) {
    const err = new Error('Access denied. You do not own this prescription.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN_PRESCRIPTION_ACCESS';
    throw err;
  }

  if (rx.status !== RX_STATES.DRAFT) {
    const err = new Error(`Only draft prescriptions can be deleted. Prescriptions in status '${rx.status}' cannot be deleted.`);
    err.statusCode = 400;
    err.code = 'CANNOT_DELETE_ACTIVE_PRESCRIPTION';
    throw err;
  }

  await query(`DELETE FROM prescriptions WHERE id = $1`, [rx.id]);

  await logAuditEvent({
    actorId: userId,
    actorRole: userRole,
    ipAddress,
    action: 'PRESCRIPTION_DRAFT_DELETED',
    entity: 'Prescription',
    entityId: rx.id
  });

  return { success: true, message: 'Draft prescription deleted successfully.' };
}

module.exports = {
  RX_STATES,
  LEGAL_RX_TRANSITIONS,
  isValidRxTransition,
  validateRefractiveValues,
  createPrescription,
  updateDraftPrescription,
  deleteDraftPrescription,
  submitPrescription,
  respondToClarification,
  getPrescriptionById,
  listUserPrescriptions
};
