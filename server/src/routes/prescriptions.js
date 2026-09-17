/**
 * EyeKart Phase 6.3 Prescription Management Routes
 * Customer-facing endpoints for prescription lifecycle management,
 * IDOR isolation, and strict state transition enforcement.
 */
const { 
  createPrescription, 
  updateDraftPrescription,
  deleteDraftPrescription,
  submitPrescription, 
  respondToClarification, 
  getPrescriptionById, 
  listUserPrescriptions 
} = require('../services/prescriptionService');
const { requireAuth } = require('../middleware/auth');

async function prescriptionRoutes(fastify, options) {
  // 1. POST /api/prescriptions - Create a new prescription
  fastify.post('/api/prescriptions', { preHandler: requireAuth }, async (req, reply) => {
    const { 
      orderId, 
      prescriptionMode, 
      source, 
      values, 
      patientNote, 
      autoSubmit,
      documentId 
    } = req.body || {};

    const rx = await createPrescription({
      userId: req.user.id,
      orderId,
      prescriptionMode,
      source,
      values,
      patientNote,
      autoSubmit: Boolean(autoSubmit),
      documentId,
      ipAddress: req.ip
    });

    return reply.status(201).send({
      success: true,
      message: 'Prescription created successfully.',
      prescription: rx
    });
  });

  // 2. GET /api/prescriptions - List customer's own prescriptions
  fastify.get('/api/prescriptions', { preHandler: requireAuth }, async (req, reply) => {
    const prescriptions = await listUserPrescriptions(req.user.id);
    return reply.send({
      success: true,
      prescriptions,
      count: prescriptions.length
    });
  });

  // 3. GET /api/prescriptions/:id - Get specific prescription (Strict IDOR protection)
  fastify.get('/api/prescriptions/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const prescription = await getPrescriptionById(id, req.user.id, req.user.role);
    return reply.send({
      success: true,
      prescription
    });
  });

  // 4. POST /api/prescriptions/:id/submit - Submit prescription for Optometrist Review
  fastify.post('/api/prescriptions/:id/submit', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const prescription = await submitPrescription({
      prescriptionId: id,
      userId: req.user.id,
      userRole: req.user.role,
      ipAddress: req.ip
    });
    return reply.send({
      success: true,
      message: 'Prescription submitted to clinical review queue.',
      prescription
    });
  });

  // 5. POST /api/prescriptions/:id/clarification - Resubmit revised values (Creates Revision N + 1)
  fastify.post('/api/prescriptions/:id/clarification', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const { values, patientNote } = req.body || {};

    const updatedRx = await respondToClarification({
      prescriptionId: id,
      userId: req.user.id,
      userRole: req.user.role,
      values,
      patientNote,
      ipAddress: req.ip
    });

    return reply.send({
      success: true,
      message: 'Clarified prescription revision submitted to clinical review queue.',
      prescription: updatedRx
    });
  });

  // 6. PUT /api/prescriptions/:id - Update draft prescription values/notes/document
  fastify.put('/api/prescriptions/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const { values, patientNote, documentId } = req.body || {};

    const updatedRx = await updateDraftPrescription({
      prescriptionId: id,
      userId: req.user.id,
      userRole: req.user.role,
      values,
      patientNote,
      documentId,
      ipAddress: req.ip
    });

    return reply.send({
      success: true,
      message: 'Draft prescription updated successfully.',
      prescription: updatedRx
    });
  });

  // 7. DELETE /api/prescriptions/:id - Delete draft prescription
  fastify.delete('/api/prescriptions/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params;
    const result = await deleteDraftPrescription({
      prescriptionId: id,
      userId: req.user.id,
      userRole: req.user.role,
      ipAddress: req.ip
    });

    return reply.send(result);
  });

  // 8. Block arbitrary PATCH status mutations & reviewer spoofing
  fastify.patch('/api/prescriptions/:id', { preHandler: requireAuth }, async (req, reply) => {
    const body = req.body || {};
    if (body.status !== undefined) {
      return reply.status(403).send({
        success: false,
        error: 'Direct modification of prescription status is forbidden. Transitions must follow the authorized clinical review workflow.',
        code: 'FORBIDDEN_STATUS_MODIFICATION'
      });
    }

    if (body.reviewerId !== undefined || body.reviewer_id !== undefined || body.reviewerName !== undefined || body.reviewer_name !== undefined) {
      return reply.status(403).send({
        success: false,
        error: 'Optometrist reviewer identity is server-authoritative and cannot be assigned by client requests.',
        code: 'FORBIDDEN_REVIEWER_SPOOF'
      });
    }

    return reply.status(400).send({
      success: false,
      error: 'Arbitrary updates to prescriptions are disabled to maintain clinical integrity.',
      code: 'MUTATION_NOT_SUPPORTED'
    });
  });
}

module.exports = prescriptionRoutes;
