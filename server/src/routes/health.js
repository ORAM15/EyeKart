/**
 * Health & Readiness Check Routes
 * Phase 11 Production Observability & Dependency Diagnostics
 *
 * Liveness Probe:  GET /health and GET /api/health
 * Readiness Probe: GET /ready and GET /api/ready
 */
const { checkConnection, getPoolMetrics, query } = require('../db/pool');
const { getStorageProvider } = require('../services/storage');
const config = require('../config/env');

async function healthRoutes(fastify, options) {
  // 1. Liveness Probe: GET /health and GET /api/health
  // Verifies the Node.js event loop and Fastify listener are alive.
  const handleLiveness = async (req, reply) => {
    const uptime = Math.floor(process.uptime());
    const memUsage = process.memoryUsage();
    return reply.status(200).send({
      status: 'ok',
      uptime,
      uptimeSeconds: uptime,
      memory: {
        rssMb: Math.round(memUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024)
      },
      memoryRssMb: Math.round(memUsage.rss / 1024 / 1024),
      timestamp: new Date().toISOString()
    });
  };

  fastify.get('/health', handleLiveness);
  fastify.get('/api/health', handleLiveness);

  // 2. Readiness Probe: GET /ready and GET /api/ready
  // Non-destructively verifies all required production dependencies can serve traffic.
  const handleReadiness = async (req, reply) => {
    const checks = {
      database: { status: 'error' },
      storage: { status: 'error' },
      configuration: { status: 'error' },
      outbox: { status: 'error' }
    };

    // Check A: Database connectivity & pool metrics
    let isDbHealthy = false;
    try {
      const start = Date.now();
      const dbStatus = await checkConnection();
      const latencyMs = Date.now() - start;
      if (dbStatus && dbStatus.connected) {
        const poolMetrics = getPoolMetrics();
        checks.database = {
          status: 'ok',
          latencyMs,
          pool: {
            total: poolMetrics.totalCount,
            idle: poolMetrics.idleCount,
            waiting: poolMetrics.waitingCount
          }
        };
        isDbHealthy = true;
      } else {
        checks.database = { status: 'error', error: 'Database disconnected' };
      }
    } catch (err) {
      checks.database = { status: 'error', error: 'Database connection failed' };
    }

    // Check B: Storage provider readiness
    let isStorageHealthy = false;
    try {
      const sp = getStorageProvider();
      if (!config.isProd || sp.isConfigured) {
        checks.storage = { status: 'ok', provider: sp.name };
        isStorageHealthy = true;
      } else {
        checks.storage = { status: 'error', error: 'Storage unconfigured for production' };
      }
    } catch (err) {
      checks.storage = { status: 'error', error: 'Storage initialization failed' };
    }

    // Check C: Runtime configuration validation
    let isConfigHealthy = false;
    try {
      const hasCookieSecret = Boolean(config.session?.cookieSecret);
      const hasDbTarget = Boolean(config.db?.connectionString || config.db?.host);
      if (hasCookieSecret && hasDbTarget) {
        checks.configuration = {
          status: 'ok',
          environment: config.env
        };
        isConfigHealthy = true;
      } else {
        checks.configuration = { status: 'error', error: 'Essential configuration missing' };
      }
    } catch (err) {
      checks.configuration = { status: 'error', error: 'Configuration check error' };
    }

    // Check D: Outbox subsystem health
    let isOutboxHealthy = false;
    if (isDbHealthy) {
      try {
        const outboxRes = await query(`SELECT COUNT(*) as pending FROM notification_outbox WHERE status = 'PENDING'`);
        checks.outbox = {
          status: 'ok',
          pendingCount: parseInt(outboxRes.rows[0]?.pending || '0', 10)
        };
        isOutboxHealthy = true;
      } catch (err) {
        checks.outbox = { status: 'error', error: 'Outbox query failed' };
      }
    } else {
      checks.outbox = { status: 'error', error: 'Database unavailable' };
    }

    const isReady = isDbHealthy && isStorageHealthy && isConfigHealthy && isOutboxHealthy;
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
