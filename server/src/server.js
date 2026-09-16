/**
 * EyeKart Backend Server Entry Point
 * Phase 2B Production Runtime & Deployment Foundation
 */
const config = require('./config/env');
const { buildApp } = require('./app');
const { checkConnection, closePool } = require('./db/pool');
const { runMigrations } = require('./db/schema');
const { seed } = require('./db/seed');

let activeApp = null;
let isShuttingDown = false;

async function shutdown(signal = 'MANUAL') {
  if (isShuttingDown) {
    console.warn(`[Server] Shutdown already in progress. Ignoring duplicate ${signal} signal.`);
    return;
  }
  isShuttingDown = true;
  console.info(`[Server] Initiating graceful shutdown (signal: ${signal})...`);

  // Force exit timer if active requests hang
  const timeoutMs = config.server?.shutdownTimeoutMs || 10000;
  const forceExitTimer = setTimeout(() => {
    console.error(`[Server Fatal] Graceful shutdown timed out after ${timeoutMs}ms. Forcing exit.`);
    if (typeof process.exit === 'function') {
      process.exit(1);
    }
  }, timeoutMs);
  forceExitTimer.unref();

  try {
    // 1. Close Fastify HTTP server (stops accepting new connections, drains existing requests)
    if (activeApp) {
      console.info('[Server] Closing Fastify HTTP listener...');
      await activeApp.close();
      activeApp = null;
      console.info('[Server] Fastify listener closed.');
    }

    // 2. Close PostgreSQL connection pool
    console.info('[Server] Closing PostgreSQL connection pool...');
    await closePool();
    console.info('[Server] PostgreSQL connection pool closed.');

    console.info('[Server] Graceful shutdown completed cleanly.');
    if (signal !== 'MANUAL' && typeof process.exit === 'function') {
      process.exit(0);
    }
  } catch (err) {
    console.error('[Server Fatal] Error encountered during shutdown:', err.message);
    if (typeof process.exit === 'function') {
      process.exit(1);
    }
  }
}

async function start() {
  console.info('============================================================');
  console.info('EYEKART — PRODUCTION BACKEND FOUNDATION');
  console.info(`Environment: ${config.env} | Node: ${process.version}`);
  console.info(`Proxy Trust: ${config.server?.trustProxy} | Host: ${config.host}:${config.port}`);
  console.info('============================================================');

  // 1. Verify Database Connectivity
  try {
    const dbStatus = await checkConnection();
    const dbTarget = config.db.connectionString ? '[Managed URI]' : `${config.db.host}:${config.db.port}`;
    console.info(`[DB Connected] PostgreSQL ready on ${dbTarget} (${dbStatus.database})`);
  } catch (err) {
    console.error('[DB Fatal] Could not connect to PostgreSQL:', err.message);
    process.exit(1);
  }

  // 2. Run Migrations & Seed
  try {
    // In production, migrations should be executed explicitly or via --migrate flag
    const explicitMigrateFlag = process.argv.includes('--migrate');
    if (!config.isProd || explicitMigrateFlag) {
      await runMigrations();
    } else {
      console.info('[DB Production] Production mode active: Automatic schema migration skipped. Run migrations via deployment script.');
    }

    // In production, database seeding is strictly skipped to protect customer data
    const explicitSeedFlag = process.argv.includes('--seed');
    if (!config.isProd || explicitSeedFlag) {
      if (config.isProd && explicitSeedFlag) {
        console.warn('[DB Warning] Explicit --seed flag detected in production mode. Executing database seeding...');
      }
      await seed();
    } else {
      console.info('[DB Production] Production mode active: Automatic database seeding skipped.');
    }
  } catch (err) {
    console.error('[DB Fatal] Migration or Seeding failed:', err.message);
    process.exit(1);
  }

  // 3. Start Fastify HTTP Server
  const app = buildApp({ logger: config.env === 'development' });
  activeApp = app;

  try {
    const address = await app.listen({ port: config.port, host: config.host });
    console.info(`[Server Ready] EyeKart API listening at ${address}`);
    console.info(`[Endpoints Active] Liveness:  ${address}/health (and ${address}/api/health)`);
    console.info(`[Endpoints Active] Readiness: ${address}/ready (and ${address}/api/ready)`);
    console.info(`[Endpoints Active] Catalog:   ${address}/api/products`);
    console.info(`[Endpoints Active] Auth:      ${address}/api/auth/login`);
  } catch (err) {
    console.error('[Server Fatal] Could not bind port:', err.message);
    process.exit(1);
  }

  // 4. Register Signal Handlers for Graceful Shutdown
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return app;
}

if (require.main === module) {
  start();
}

module.exports = { start, shutdown };
