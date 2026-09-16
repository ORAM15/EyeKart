/**
 * PostgreSQL Connection Pool
 * EyeKart Phase 6.1 Database Foundation
 */
const { Pool } = require('pg');
const config = require('../config/env');

let pool = null;

function getPool() {
  if (!pool) {
    const poolConfig = {
      max: config.db.max || 20,
      idleTimeoutMillis: config.db.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.db.connectionTimeoutMillis || 5000
    };

    if (config.db.connectionString) {
      poolConfig.connectionString = config.db.connectionString;
    } else {
      poolConfig.host = config.db.host;
      poolConfig.port = config.db.port;
      poolConfig.user = config.db.user;
      poolConfig.password = config.db.password;
      poolConfig.database = config.db.database;
    }

    if (config.db.ssl) {
      poolConfig.ssl = config.db.ssl;
    }

    pool = new Pool(poolConfig);

    pool.on('error', (err) => {
      console.error('[EyeKart DB Pool] Unexpected error on idle client:', err.message);
    });
  }
  return pool;
}

async function query(text, params) {
  const p = getPool();
  const start = Date.now();
  try {
    const res = await p.query(text, params);
    const duration = Date.now() - start;
    if (config.env === 'development' && duration > 50) {
      console.debug('[EyeKart DB] Executed query in', duration, 'ms');
    }
    return res;
  } catch (err) {
    console.error('[EyeKart DB Error] Query failed:', err.message);
    throw err;
  }
}

async function checkConnection() {
  const p = getPool();
  const client = await p.connect();
  try {
    const res = await client.query('SELECT 1 AS connected, current_database() AS db, version() AS ver');
    return {
      connected: true,
      database: res.rows[0].db,
      version: res.rows[0].ver
    };
  } finally {
    client.release();
  }
}

async function getClient() {
  const p = getPool();
  return p.connect();
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  getClient,
  query,
  checkConnection,
  closePool
};
