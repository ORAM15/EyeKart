/**
 * Health Check Route
 * GET /api/health
 */
const { checkConnection } = require('../db/pool');
const { getStorageProvider } = require('../services/storage');
const config = require('../config/env');

async function healthRoutes(fastify, options) {
  // 1. Liveness Probe: GET /health and GET /api/health
  // Indicates process is alive and responding.
  const handleLiveness = async (req, reply) => {
    const uptime = Math.floor(process.uptime());
    return reply.status(200).send({
      status: 'ok',
      uptime,
      uptimeSeconds: uptime,
      timestamp: new Date().toISOString()
    });
  };

  fastify.get('/health', handleLiveness);
  fastify.get('/api/health', handleLiveness);

  // 2. Readiness Probe: GET /ready and GET /api/ready
  // Verifies runtime dependencies (PostgreSQL, Storage) are available for serving production traffic.
  const handleReadiness = async (req, reply) => {
    const checks = {
      database: { status: 'error' },
      storage: { status: 'error' }
    };

    let isDbHealthy = false;
    try {
      const start = Date.now();
      const dbStatus = await checkConnection();
      const latencyMs = Date.now() - start;
      if (dbStatus && dbStatus.connected) {
        checks.database = { status: 'ok', latencyMs };
        isDbHealthy = true;
      } else {
        checks.database = { status: 'error', error: 'Database disconnected' };
      }
    } catch (err) {
      checks.database = { status: 'error', error: 'Database connection failed' };
    }

    let isStorageHealthy = false;
    try {
      const sp = getStorageProvider();
      if (!config.isProd || sp.isConfigured) {
        checks.storage = { status: 'ok', provider: sp.name };
        isStorageHealthy = true;
      } else {
        checks.storage = { status: 'error', error: 'Cloud storage unconfigured' };
      }
    } catch (err) {
      checks.storage = { status: 'error', error: 'Storage initialization failed' };
    }

    const isReady = isDbHealthy && isStorageHealthy;
    const statusCode = isReady ? 200 : 503;

    return reply.status(statusCode).send({
      ready: isReady,
      status: isReady ? 'ready' : 'unavailable',
      checks,
      timestamp: new Date().toISOString()
    });
  };

  fastify.get('/ready', handleReadiness);
  fastify.get('/api/ready', handleReadiness);
}

module.exports = healthRoutes;
