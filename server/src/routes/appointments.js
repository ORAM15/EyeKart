/**
 * EyeKart Phase 9 Appointment API Routes
 * Manages timezone-safe clinical exam booking, availability queries,
 * customer self-service cancellation and atomic slot rescheduling,
 * and operational workflows (confirm, complete, no-show, remind)
 * with strict RBAC and IDOR enforcement.
 */
const {
  getAvailableSlots,
  bookAppointment,
  confirmAppointment,
  completeAppointment,
  markNoShow,
  sendAppointmentReminder,
  cancelAppointment,
  rescheduleAppointment,
  getAppointmentById,
  listCustomerAppointments,
  listOperationalAppointments
} = require('../services/appointmentService');
const { requireAuth, requireRole } = require('../middleware/auth');

const OPERATIONAL_ROLES = ['ADMIN', 'OPTOMETRIST', 'STORE_STAFF'];

async function appointmentRoutes(fastify, options) {
  // 1. GET /api/appointments/availability - Query available slots (Public / Customer)
  fastify.get('/api/appointments/availability', async (req, reply) => {
    const { clinicId, date } = req.query || {};
    const slots = await getAvailableSlots({ clinicId, date });
    return reply.send({
      success: true,
      count: slots.length,
      slots
    });
  });

  // 2. POST /api/appointments - Book appointment (Authenticated Customer)
  fastify.post('/api/appointments', { preHandler: requireAuth }, async (req, reply) => {
    const {
      clinicId,
      slotId,
      appointmentTypeId,
      patientName,
      patientPhone,
      patientEmail,
      nationalId,
      notes,
      idempotencyKey: bodyIdempKey
    } = req.body || {};

    const idempotencyKey = req.headers['x-idempotency-key'] || bodyIdempKey || null;

    // Customer cannot alter ownership: user_id is strictly req.user.id
    const appointment = await bookAppointment({
      userId: req.user.id,
      clinicId,
      slotId,
      appointmentTypeId: appointmentTypeId || 'signature_28_point',
      patientName: patientName || req.user.full_name,
      patientPhone: patientPhone || req.user.phone || '+254700000000',
      patientEmail: patientEmail || req.user.email,
      nationalId,
      notes,
      idempotencyKey,
      actorRole: req.user.role,
      ipAddress: req.ip
    });

    const statusCode = appointment.idempotentHit ? 200 : 201;
    return reply.status(statusCode).send({
      success: true,
      idempotentHit: Boolean(appointment.idempotentHit),
      message: appointment.idempotentHit
        ? 'Existing appointment retrieved via idempotency.'
        : 'Appointment booked successfully.',
      appointment
    });
  });

  // 3. GET /api/appointments - List customer's own appointments
  fastify.get('/api/appointments', { preHandler: requireAuth }, async (req, reply) => {
    const appointments = await listCustomerAppointments(req.user.id);
    return reply.send({
      success: true,
      count: appointments.length,
      appointments
    });
  });

  // 4. GET /api/appointments/operational & /api/admin/appointments - Operational schedule list
  const operationalListHandler = async (req, reply) => {
    const { clinicId, practitionerId, status, date, limit, offset } = req.query || {};
    const result = await listOperationalAppointments({
      clinicId,
      practitionerId,
      status,
      date,
      limit,
      offset
    });
    return reply.send({
      success: true,
      ...result
    });
  };

  fastify.get('/api/appointments/operational', { preHandler: requireRole(OPERATIONAL_ROLES) }, operationalListHandler);
  fastify.get('/api/admin/appointments', { preHandler: requireRole(OPERATIONAL_ROLES) }, operationalListHandler);

  // 5. GET /api/appointments/:id - Get specific appointment (Strict IDOR protection)
  fastify.get('/api/appointments/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const appointment = await getAppointmentById(id, req.user.id, req.user.role);
    return reply.send({
      success: true,
      appointment
    });
  });

  // 6. POST /api/appointments/:id/cancel - Cancel appointment and release slot
  fastify.post('/api/appointments/:id/cancel', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const { reason } = req.body || {};

    const cancelledApt = await cancelAppointment({
      appointmentId: id,
      userId: req.user.id,
      userRole: req.user.role,
      reason,
      ipAddress: req.ip
    });

    return reply.send({
      success: true,
      message: 'Appointment cancelled and slot released.',
      appointment: cancelledApt
    });
  });

  // 7. POST /api/appointments/:id/reschedule - Atomically reschedule to new slot
  fastify.post('/api/appointments/:id/reschedule', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const { newSlotId } = req.body || {};

    if (!newSlotId) {
      return reply.status(400).send({
        success: false,
        error: 'Target newSlotId is required to reschedule an appointment.',
        code: 'MISSING_NEW_SLOT_ID'
      });
    }

    const rescheduledApt = await rescheduleAppointment({
      appointmentId: id,
      newSlotId,
      userId: req.user.id,
      userRole: req.user.role,
      ipAddress: req.ip
    });

    return reply.send({
      success: true,
      message: 'Appointment rescheduled successfully.',
      appointment: rescheduledApt
    });
  });

  // 8. POST /api/appointments/:id/confirm - Confirm appointment (Operational / Clinical Staff)
  fastify.post('/api/appointments/:id/confirm', { preHandler: requireRole(OPERATIONAL_ROLES) }, async (req, reply) => {
    const { id } = req.params;
    const { notes } = req.body || {};

    const confirmedApt = await confirmAppointment({
      appointmentId: id,
      staffId: req.user.id,
      staffRole: req.user.role,
      notes,
      ipAddress: req.ip
    });

    return reply.send({
      success: true,
      message: 'Appointment confirmed successfully.',
      appointment: confirmedApt
    });
  });

  // 9. POST /api/appointments/:id/complete - Complete appointment (Operational / Clinical Staff)
  fastify.post('/api/appointments/:id/complete', { preHandler: requireRole(OPERATIONAL_ROLES) }, async (req, reply) => {
    const { id } = req.params;
    const { notes } = req.body || {};

    const completedApt = await completeAppointment({
      appointmentId: id,
      staffId: req.user.id,
      staffRole: req.user.role,
      notes,
      ipAddress: req.ip
    });

    return reply.send({
      success: true,
      message: 'Appointment marked as completed.',
      appointment: completedApt
    });
  });

  // 10. POST /api/appointments/:id/no-show - Mark appointment NO_SHOW (Operational / Clinical Staff)
  fastify.post('/api/appointments/:id/no-show', { preHandler: requireRole(OPERATIONAL_ROLES) }, async (req, reply) => {
    const { id } = req.params;
    const { notes } = req.body || {};

    const updatedApt = await markNoShow({
      appointmentId: id,
      staffId: req.user.id,
      staffRole: req.user.role,
      notes,
      ipAddress: req.ip
    });

    return reply.send({
      success: true,
      message: 'Appointment marked as NO_SHOW.',
      appointment: updatedApt
    });
  });

  // 11. POST /api/appointments/:id/remind - Send appointment reminder (Operational / Clinical Staff)
  fastify.post('/api/appointments/:id/remind', { preHandler: requireRole(OPERATIONAL_ROLES) }, async (req, reply) => {
    const { id } = req.params;
    const { force } = req.body || {};

    const result = await sendAppointmentReminder({
      appointmentId: id,
      staffId: req.user.id,
      staffRole: req.user.role,
      force: Boolean(force),
      ipAddress: req.ip
    });

    return reply.send({
      success: true,
      message: result.idempotentHit
        ? 'Reminder already sent previously (idempotent skipped).'
        : 'Appointment reminder dispatched successfully.',
      idempotentHit: result.idempotentHit,
      appointment: result.appointment
    });
  });

  // 12. Reject arbitrary client updates to ownership or practitioner
  fastify.patch('/api/appointments/:id', { preHandler: requireAuth }, async (req, reply) => {
    const body = req.body || {};
    if (body.user_id !== undefined || body.userId !== undefined) {
      return reply.status(403).send({
        success: false,
        error: 'Client cannot alter appointment ownership.',
        code: 'FORBIDDEN_OWNERSHIP_CHANGE'
      });
    }
    if (body.practitioner_name !== undefined || body.practitionerName !== undefined || body.practitioner_id !== undefined) {
      return reply.status(403).send({
        success: false,
        error: 'Practitioner assignment is server-authoritative and derived from clinic schedule.',
        code: 'FORBIDDEN_PRACTITIONER_ASSIGNMENT'
      });
    }
    return reply.status(400).send({
      success: false,
      error: 'Direct appointment mutations are disabled. Please use cancel, reschedule, or staff workflow endpoints.',
      code: 'MUTATION_NOT_SUPPORTED'
    });
  });
}

module.exports = appointmentRoutes;
