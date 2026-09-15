/**
 * EyeKart Phase 6.4 Appointment API Routes
 * Manages timezone-safe clinical exam booking, availability queries,
 * cancellation, and atomic slot rescheduling.
 */
const { 
  getAvailableSlots, 
  bookAppointment, 
  cancelAppointment, 
  rescheduleAppointment, 
  getAppointmentById, 
  listCustomerAppointments 
} = require('../services/appointmentService');
const { requireAuth } = require('../middleware/auth');

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
      notes 
    } = req.body || {};

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
      actorRole: req.user.role,
      ipAddress: req.ip
    });

    return reply.status(201).send({
      success: true,
      message: 'Appointment booked successfully.',
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

  // 4. GET /api/appointments/:id - Get specific appointment (Strict IDOR protection)
  fastify.get('/api/appointments/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const appointment = await getAppointmentById(id, req.user.id, req.user.role);
    return reply.send({
      success: true,
      appointment
    });
  });

  // 5. POST /api/appointments/:id/cancel - Cancel appointment and release slot
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

  // 6. POST /api/appointments/:id/reschedule - Atomically reschedule to new slot
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

  // 7. Reject arbitrary client updates to ownership or practitioner
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
      error: 'Direct appointment mutations are disabled. Please use cancel or reschedule endpoints.',
      code: 'MUTATION_NOT_SUPPORTED'
    });
  });
}

module.exports = appointmentRoutes;
