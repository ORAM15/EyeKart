/**
 * EyeKart Phase 6.3 Optometrist Review Routes
 * Clinical workspace endpoints strictly gated to licensed Optometrist and Admin roles.
 */
const { 
  getReviewQueue, 
  approvePrescription, 
  rejectPrescription, 
  requestClarification 
} = require('../services/reviewService');
const { requireAuth, requireRole } = require('../middleware/auth');

async function optometristRoutes(fastify, options) {
  // Optometrist role required for all clinical review endpoints
  const clinicalGuards = [requireAuth, requireRole(['OPTOMETRIST', 'ADMIN'])];

  // 1. GET /api/optometrist/prescriptions - Fetch Clinical Review Queue
  fastify.get('/api/optometrist/prescriptions', { preHandler: clinicalGuards }, async (req, reply) => {
    const status = req.query.status || 'PENDING_OPTOMETRIST_REVIEW';
    const limit = parseInt(req.query.limit || 50, 10);
    const offset = parseInt(req.query.offset || 0, 10);

    const queue = await getReviewQueue({ status, limit, offset });
    return reply.send({
      success: true,
      queue: queue.items,
      total: queue.total,
      limit: queue.limit,
      offset: queue.offset
    });
  });

  // 2. POST /api/optometrist/prescriptions/:id/approve - Approve Prescription
  fastify.post('/api/optometrist/prescriptions/:id/approve', { preHandler: clinicalGuards }, async (req, reply) => {
    const { id } = req.params;
    const { notes } = req.body || {};

    const result = await approvePrescription({
      prescriptionId: id,
      reviewerId: req.user.id,
      reviewerRole: req.user.role,
      reviewerName: req.user.full_name || req.user.fullName || 'Development Optometrist (TEST ONLY)',
      notes: notes || 'Prescription clinically verified and approved.',
      ipAddress: req.ip
    });

    return reply.send({
      success: true,
      message: 'Prescription approved. Order cleared for laboratory surfacing.',
      prescription: result.prescription,
      review: result.review
    });
  });

  // 3. POST /api/optometrist/prescriptions/:id/reject - Reject Prescription
  fastify.post('/api/optometrist/prescriptions/:id/reject', { preHandler: clinicalGuards }, async (req, reply) => {
    const { id } = req.params;
    const { notes, reason } = req.body || {};

    const result = await rejectPrescription({
      prescriptionId: id,
      reviewerId: req.user.id,
      reviewerRole: req.user.role,
      reviewerName: req.user.full_name || req.user.fullName || 'Development Optometrist (TEST ONLY)',
      notes: notes || reason,
      ipAddress: req.ip
    });

    return reply.send({
      success: true,
      message: 'Prescription rejected by clinical reviewer.',
      prescription: result.prescription,
      review: result.review
    });
  });

  // 4. POST /api/optometrist/prescriptions/:id/clarification - Request Customer Clarification
  fastify.post('/api/optometrist/prescriptions/:id/clarification', { preHandler: clinicalGuards }, async (req, reply) => {
    const { id } = req.params;
    const { notes, reason, clarificationRequest } = req.body || {};

    const result = await requestClarification({
      prescriptionId: id,
      reviewerId: req.user.id,
      reviewerRole: req.user.role,
      reviewerName: req.user.full_name || req.user.fullName || 'Development Optometrist (TEST ONLY)',
      notes: notes || reason || clarificationRequest,
      ipAddress: req.ip
    });

    return reply.send({
      success: true,
      message: 'Clinical clarification requested from customer.',
      prescription: result.prescription,
      review: result.review
    });
  });
}

module.exports = optometristRoutes;
