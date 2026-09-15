/**
 * Health Check Route
 * GET /api/health
 */
const { checkConnection } = require('../db/pool');
const config = require('../config/env');

async function healthRoutes(fastify, options) {
  fastify.get('/api/health', async (req, reply) => {
    try {
      const dbStatus = await checkConnection();
      return reply.send({
        status: 'ok',
        service: 'EyeKart Production API Foundation',
        version: '1.0.0',
        environment: config.env,
        database: {
          connected: dbStatus.connected,
          name: dbStatus.database,
          engine: 'PostgreSQL'
        },
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      return reply.status(503).send({
        status: 'degraded',
        service: 'EyeKart Production API Foundation',
        database: {
          connected: false,
          error: 'Database connection failed'
        },
        timestamp: new Date().toISOString()
      });
    }
  });
}

module.exports = healthRoutes;
