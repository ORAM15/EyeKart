/**
 * EyeKart Backend Server Entry Point
 * Phase 6.1 Production Backend Foundation
 */
const config = require('./config/env');
const { buildApp } = require('./app');
const { checkConnection } = require('./db/pool');
const { runMigrations } = require('./db/schema');
const { seed } = require('./db/seed');

async function start() {
  console.info('============================================================');
  console.info('EYEKART — PRODUCTION BACKEND FOUNDATION');
  console.info(`Environment: ${config.env} | Node: ${process.version}`);
  console.info('============================================================');

  // 1. Verify Database Connectivity
  try {
    const dbStatus = await checkConnection();
    console.info(`[DB Connected] PostgreSQL ready on ${config.db.host}:${config.db.port} (${dbStatus.database})`);
  } catch (err) {
    console.error('[DB Fatal] Could not connect to PostgreSQL:', err.message);
    process.exit(1);
  }

  // 2. Run Migrations & Seed
  try {
    await runMigrations();
    await seed();
  } catch (err) {
    console.error('[DB Fatal] Migration or Seeding failed:', err.message);
    process.exit(1);
  }

  // 3. Start Fastify HTTP Server
  const app = buildApp({ logger: config.env === 'development' });

  try {
    const address = await app.listen({ port: config.port, host: config.host });
    console.info(`[Server Ready] EyeKart API listening at ${address}`);
    console.info(`[Endpoints Active] Health: ${address}/api/health`);
    console.info(`[Endpoints Active] Catalog: ${address}/api/products`);
    console.info(`[Endpoints Active] Auth: ${address}/api/auth/login`);
  } catch (err) {
    console.error('[Server Fatal] Could not bind port:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { start };
