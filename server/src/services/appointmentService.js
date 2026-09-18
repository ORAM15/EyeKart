/**
 * EyeKart Phase 6.4 Appointment Service
 * Manages timezone-safe scheduling (EAT UTC+03:00 / Africa/Nairobi),
 * atomic double-booking prevention, cancellation, and atomic slot rescheduling.
 */
const { query, getPool } = require('../db/pool');
const { logAuditEvent } = require('./auditService');
const notificationService = require('./notification/notificationService');

const APPOINTMENT_STATES = {
  BOOKED: 'BOOKED',
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
  RESCHEDULED: 'RESCHEDULED'
};

const LEGAL_APPOINTMENT_TRANSITIONS = {
  BOOKED: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: ['CANCELLED'],
  RESCHEDULED: []
};

function isValidAppointmentTransition(fromState, toState) {
  if (fromState === toState) return false;
  const allowed = LEGAL_APPOINTMENT_TRANSITIONS[fromState] || [];
  return allowed.includes(toState);
}

/**
 * Generate unique booking reference (e.g. APT-2026-XXXXX)
 */
async function generateUniqueBookingReference() {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const num = `APT-${year}-` + Math.floor(10000 + Math.random() * 90000);
    const check = await query(`SELECT id FROM appointments WHERE booking_reference = $1`, [num]);
    if (check.rows.length === 0) return num;
  }
  return `APT-${year}-` + Date.now().toString().slice(-5);
}

/**
 * Query available appointment slots for a clinic and date
 */
async function getAvailableSlots({ clinicId, date = null }) {
  let whereClause = `WHERE s.is_available = TRUE AND s.start_time >= CURRENT_TIMESTAMP`;
  const params = [];

  if (clinicId) {
    params.push(clinicId);
    whereClause += ` AND s.clinic_id = $${params.length}`;
  }

  if (date) {
    // Filter by date string (YYYY-MM-DD) in Africa/Nairobi timezone
    params.push(date);
    whereClause += ` AND (s.start_time AT TIME ZONE 'Africa/Nairobi')::date = $${params.length}::date`;
  }

  const sql = `
    SELECT 
      s.id,
      s.clinic_id,
      c.name AS clinic_name,
      c.address AS clinic_address,
      s.practitioner_id,
      s.practitioner_name,
      s.start_time,
      s.end_time,
      s.timezone,
      to_char(s.start_time AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM-DD') AS date_eat,
      to_char(s.start_time AT TIME ZONE 'Africa/Nairobi', 'HH12:MI AM') AS time_eat
    FROM appointment_slots s
    JOIN clinics c ON s.clinic_id = c.id
    ${whereClause}
    ORDER BY s.start_time ASC
  `;

  const res = await query(sql, params);
  return res.rows;
}

/**
 * Book an appointment with atomic database row lock to prevent double booking
 */
async function bookAppointment({
  userId,
  clinicId,
  slotId,
  appointmentTypeId = 'signature_28_point',
  patientName,
  patientPhone,
  patientEmail = null,
  nationalId = null,
  notes = null,
  actorRole = 'CUSTOMER',
  ipAddress = null
}) {
  if (!userId) {
    const err = new Error('Authentication required to book an appointment.');
    err.statusCode = 401;
    err.code = 'AUTHENTICATION_REQUIRED';
    throw err;
  }

  if (!patientName || !patientPhone) {
    const err = new Error('Patient name and phone number are required.');
    err.statusCode = 400;
    err.code = 'INVALID_PATIENT_DETAILS';
    throw err;
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock slot row FOR UPDATE to prevent race conditions
    const slotRes = await client.query(
      `SELECT * FROM appointment_slots WHERE id = $1 FOR UPDATE`,
      [slotId]
    );

    if (slotRes.rows.length === 0) {
      const err = new Error('Selected appointment slot not found.');
      err.statusCode = 404;
      err.code = 'SLOT_NOT_FOUND';
      throw err;
    }

    const slot = slotRes.rows[0];

    if (!slot.is_available) {
      const err = new Error('This appointment slot has already been booked. Please select another time slot.');
      err.statusCode = 409;
      err.code = 'SLOT_ALREADY_BOOKED';
      throw err;
    }

    // 2. Check for any active appointment using this slot
    const dupCheck = await client.query(
      `SELECT id FROM appointments 
       WHERE slot_id = $1 AND status IN ('BOOKED', 'CONFIRMED') 
       FOR UPDATE`,
      [slot.id]
    );

    if (dupCheck.rows.length > 0) {
      const err = new Error('Concurrent booking conflict: this slot was just reserved.');
      err.statusCode = 409;
      err.code = 'SLOT_ALREADY_BOOKED';
      throw err;
    }

    // 3. Mark slot as unavailable
    await client.query(
      `UPDATE appointment_slots SET is_available = FALSE WHERE id = $1`,
      [slot.id]
    );

    // 4. Generate unique reference and insert appointment
    const bookingReference = await generateUniqueBookingReference();
    const aptRes = await client.query(
      `INSERT INTO appointments (
        booking_reference, user_id, clinic_id, slot_id, appointment_type_id,
        practitioner_id, practitioner_name, start_time, end_time, timezone,
        status, patient_name, patient_phone, patient_email, national_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'BOOKED', $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        bookingReference,
        userId,
        slot.clinic_id,
        slot.id,
        appointmentTypeId,
        slot.practitioner_id,
        slot.practitioner_name, // Derived authoritatively from slot, client cannot spoof practitioner
        slot.start_time,
        slot.end_time,
        slot.timezone || 'Africa/Nairobi',
        patientName.trim(),
        patientPhone.trim(),
        patientEmail ? patientEmail.trim() : null,
        nationalId ? nationalId.trim() : null,
        notes ? notes.trim() : null
      ]
    );
    const appointment = aptRes.rows[0];

    await client.query('COMMIT');

    // Audit log
    await logAuditEvent({
      actorId: userId,
      actorRole,
      ipAddress,
      action: 'APPOINTMENT_BOOKED',
      entity: 'Appointment',
      entityId: appointment.id,
      metadata: {
        bookingReference,
        clinicId: slot.clinic_id,
        practitionerName: slot.practitioner_name,
        startTime: slot.start_time
      }
    });

    // Notify patient of booking
    try {
      const clinicRes = await query(`SELECT name FROM clinics WHERE id = $1`, [slot.clinic_id]);
      const clinic = clinicRes.rows[0];
      await notificationService.notifyAppointmentBooked({ appointment, clinic });
    } catch {}

    return appointment;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cancel an appointment and release its slot
 */
async function cancelAppointment({
  appointmentId,
  userId,
  userRole = 'CUSTOMER',
  actorRole = null,
  reason = 'Customer requested cancellation',
  ipAddress = null
}) {
  const role = actorRole || userRole || 'CUSTOMER';
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const aptRes = await client.query(
      `SELECT * FROM appointments WHERE id::text = $1 OR booking_reference = $1 FOR UPDATE`,
      [appointmentId]
    );

    if (aptRes.rows.length === 0) {
      const err = new Error('Appointment not found.');
      err.statusCode = 404;
      err.code = 'APPOINTMENT_NOT_FOUND';
      throw err;
    }

    const apt = aptRes.rows[0];

    // IDOR Protection: Customers may only cancel their own appointments
    const isPrivileged = (role === 'ADMIN' || role === 'STORE_STAFF' || role === 'OPTOMETRIST');
    if (!isPrivileged && apt.user_id !== userId) {
      const err = new Error('Access denied. You do not have permission to cancel this appointment.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_APPOINTMENT_ACCESS';
      throw err;
    }

    if (!isValidAppointmentTransition(apt.status, APPOINTMENT_STATES.CANCELLED)) {
      const err = new Error(`Cannot cancel appointment in state '${apt.status}'.`);
      err.statusCode = 400;
      err.code = 'ILLEGAL_APPOINTMENT_TRANSITION';
      throw err;
    }

    // 1. Release slot if linked
    if (apt.slot_id) {
      await client.query(
        `UPDATE appointment_slots SET is_available = TRUE WHERE id = $1`,
        [apt.slot_id]
      );
    }

    // 2. Update appointment to CANCELLED
    const updatedRes = await client.query(
      `UPDATE appointments 
       SET status = 'CANCELLED', 
           cancellation_reason = $1, 
           cancelled_at = CURRENT_TIMESTAMP, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [reason, apt.id]
    );
    const updatedApt = updatedRes.rows[0];

    await client.query('COMMIT');

    await logAuditEvent({
      actorId: userId,
      actorRole: role,
      ipAddress,
      action: 'APPOINTMENT_CANCELLED',
      entity: 'Appointment',
      entityId: apt.id,
      metadata: {
        bookingReference: apt.booking_reference,
        reason
      }
    });

    // Notify patient of cancellation
    try {
      const recipient = apt.patient_phone || apt.patient_email;
      const channel = apt.patient_phone ? 'SMS' : 'EMAIL';
      if (recipient) {
        notificationService.sendTransactionalNotification({
          userId: apt.user_id,
          recipient,
          channel,
          templateId: 'APPOINTMENT_CANCELLED',
          payload: {
            bookingReference: apt.booking_reference,
            reason
          },
          resourceId: apt.id,
          ipAddress
        }).catch(() => {});
      }
    } catch {}

    return updatedApt;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Atomically reschedule an appointment: releases old slot and reserves new slot
 */
async function rescheduleAppointment({
  appointmentId,
  newSlotId,
  userId,
  userRole = 'CUSTOMER',
  actorRole = null,
  ipAddress = null
}) {
  const role = actorRole || userRole || 'CUSTOMER';
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock appointment
    const aptRes = await client.query(
      `SELECT * FROM appointments WHERE id::text = $1 OR booking_reference = $1 FOR UPDATE`,
      [appointmentId]
    );

    if (aptRes.rows.length === 0) {
      const err = new Error('Appointment not found.');
      err.statusCode = 404;
      err.code = 'APPOINTMENT_NOT_FOUND';
      throw err;
    }

    const apt = aptRes.rows[0];

    // IDOR Protection
    const isPrivileged = (role === 'ADMIN' || role === 'STORE_STAFF' || role === 'OPTOMETRIST');
    if (!isPrivileged && apt.user_id !== userId) {
      const err = new Error('Access denied. You do not have permission to reschedule this appointment.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN_APPOINTMENT_ACCESS';
      throw err;
    }

    // Validate state
    if (apt.status === APPOINTMENT_STATES.CANCELLED || apt.status === APPOINTMENT_STATES.COMPLETED) {
      const err = new Error(`Cannot reschedule an appointment in status '${apt.status}'.`);
      err.statusCode = 400;
      err.code = 'ILLEGAL_APPOINTMENT_TRANSITION';
      throw err;
    }

    // 2. Lock and validate new slot
    const newSlotRes = await client.query(
      `SELECT * FROM appointment_slots WHERE id = $1 FOR UPDATE`,
      [newSlotId]
    );

    if (newSlotRes.rows.length === 0) {
      const err = new Error('Target appointment slot not found.');
      err.statusCode = 404;
      err.code = 'SLOT_NOT_FOUND';
      throw err;
    }

    const newSlot = newSlotRes.rows[0];

    if (!newSlot.is_available) {
      const err = new Error('Target appointment slot is no longer available.');
      err.statusCode = 409;
      err.code = 'SLOT_ALREADY_BOOKED';
      throw err;
    }

    // 3. Release old slot
    if (apt.slot_id) {
      await client.query(
        `UPDATE appointment_slots SET is_available = TRUE WHERE id = $1`,
        [apt.slot_id]
      );
    }

    // 4. Claim new slot
    await client.query(
      `UPDATE appointment_slots SET is_available = FALSE WHERE id = $1`,
      [newSlot.id]
    );

    // 5. Update appointment record atomically
    const updatedAptRes = await client.query(
      `UPDATE appointments 
       SET clinic_id = $1,
           slot_id = $2,
           practitioner_id = $3,
           practitioner_name = $4,
           start_time = $5,
           end_time = $6,
           status = 'CONFIRMED',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [
        newSlot.clinic_id,
        newSlot.id,
        newSlot.practitioner_id,
        newSlot.practitioner_name,
        newSlot.start_time,
        newSlot.end_time,
        apt.id
      ]
    );
    const updatedApt = updatedAptRes.rows[0];

    await client.query('COMMIT');

    await logAuditEvent({
      actorId: userId,
      actorRole: role,
      ipAddress,
      action: 'APPOINTMENT_RESCHEDULED',
      entity: 'Appointment',
      entityId: apt.id,
      metadata: {
        bookingReference: apt.booking_reference,
        previousSlotId: apt.slot_id,
        newSlotId: newSlot.id,
        newStartTime: newSlot.start_time
      }
    });

    return updatedApt;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get appointment by ID or reference (with IDOR protection)
 */
async function getAppointmentById(id, userId = null, userRole = 'CUSTOMER') {
  const sql = `
    SELECT 
      a.*,
      c.name AS clinic_name,
      c.address AS clinic_address,
      t.name AS appointment_type_name,
      t.duration_minutes,
      t.price,
      to_char(a.start_time AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM-DD') AS date_eat,
      to_char(a.start_time AT TIME ZONE 'Africa/Nairobi', 'HH12:MI AM') AS time_eat
    FROM appointments a
    JOIN clinics c ON a.clinic_id = c.id
    JOIN appointment_types t ON a.appointment_type_id = t.id
    WHERE a.id::text = $1 OR a.booking_reference = $1
  `;

  const res = await query(sql, [id]);
  if (res.rows.length === 0) {
    const err = new Error('Appointment not found.');
    err.statusCode = 404;
    err.code = 'APPOINTMENT_NOT_FOUND';
    throw err;
  }

  const apt = res.rows[0];

  const isPrivileged = (userRole === 'ADMIN' || userRole === 'STORE_STAFF' || userRole === 'OPTOMETRIST');
  if (!isPrivileged && userId && apt.user_id !== userId) {
    const err = new Error('Access denied. You do not have permission to view this appointment.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN_APPOINTMENT_ACCESS';
    throw err;
  }

  return apt;
}

/**
 * List customer appointments
 */
async function listCustomerAppointments(userId) {
  const sql = `
    SELECT 
      a.*,
      c.name AS clinic_name,
      c.address AS clinic_address,
      t.name AS appointment_type_name,
      to_char(a.start_time AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM-DD') AS date_eat,
      to_char(a.start_time AT TIME ZONE 'Africa/Nairobi', 'HH12:MI AM') AS time_eat
    FROM appointments a
    JOIN clinics c ON a.clinic_id = c.id
    JOIN appointment_types t ON a.appointment_type_id = t.id
    WHERE a.user_id = $1
    ORDER BY a.start_time DESC
  `;

  const res = await query(sql, [userId]);
  return res.rows;
}

module.exports = {
  APPOINTMENT_STATES,
  LEGAL_APPOINTMENT_TRANSITIONS,
  isValidAppointmentTransition,
  getAvailableSlots,
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  getAppointmentById,
  listCustomerAppointments
};
