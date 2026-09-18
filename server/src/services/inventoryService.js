/**
 * EyeKart Phase 5 Inventory Reservation & Allocation Service
 * Manages atomic inventory reservations, available stock calculations,
 * transactional stock allocation, and restock releases on cancellation.
 */
const { query, getPool } = require('../db/pool');
const { logAuditEvent } = require('./auditService');

/**
 * Get server-authoritative inventory metrics for a product SKU
 */
async function getInventory(sku) {
  const res = await query(
    `SELECT sku, name, stock, COALESCE(reserved_stock, 0) AS reserved_stock 
     FROM products WHERE sku = $1`,
    [sku]
  );

  if (res.rows.length === 0) {
    const err = new Error(`Product with SKU '${sku}' not found.`);
    err.statusCode = 404;
    err.code = 'PRODUCT_NOT_FOUND';
    throw err;
  }

  const p = res.rows[0];
  const stock = parseInt(p.stock, 10);
  const reserved = parseInt(p.reserved_stock, 10);
  const available = Math.max(0, stock - reserved);

  return {
    sku: p.sku,
    name: p.name,
    stock,
    reserved,
    available
  };
}

/**
 * Atomically reserve stock for an order's line items within a transaction.
 * Accepts an optional callerClient to participate in an outer transaction boundary.
 */
async function reserveStock({ orderId, items, client: callerClient = null, actorId = null, actorRole = 'SYSTEM', ipAddress = null }) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return { success: true, reservations: [] };
  }

  const pool = getPool();
  const client = callerClient || await pool.connect();
  const isOwnClient = !callerClient;
  const reservations = [];

  try {
    if (isOwnClient) {
      await client.query('BEGIN');
    }

    for (const item of items) {
      const sku = item.sku;
      const qty = parseInt(item.qty || 1, 10);

      if (isNaN(qty) || qty <= 0) {
        const err = new Error(`Invalid reservation quantity for SKU '${sku}'. Must be a positive integer.`);
        err.statusCode = 400;
        err.code = 'INVALID_QUANTITY';
        throw err;
      }

      if (qty > 100) {
        const err = new Error(`Quantity for SKU '${sku}' exceeds maximum allowable limit of 100.`);
        err.statusCode = 400;
        err.code = 'EXCESSIVE_QUANTITY';
        throw err;
      }

      // Check for existing active reservation for this order and SKU (Idempotency)
      if (orderId) {
        const existingRes = await client.query(
          `SELECT * FROM inventory_reservations
           WHERE order_id = $1 AND sku = $2 AND status = 'RESERVED'`,
          [orderId, sku]
        );
        if (existingRes.rows.length > 0) {
          reservations.push(existingRes.rows[0]);
          continue;
        }
      }

      // Lock row to prevent race conditions & overselling
      const prodRes = await client.query(
        `SELECT sku, name, stock, COALESCE(reserved_stock, 0) AS reserved_stock 
         FROM products WHERE sku = $1 FOR UPDATE`,
        [sku]
      );

      if (prodRes.rows.length === 0) {
        const err = new Error(`Product SKU '${sku}' not found.`);
        err.statusCode = 404;
        err.code = 'PRODUCT_NOT_FOUND';
        throw err;
      }

      const prod = prodRes.rows[0];
      const stock = parseInt(prod.stock, 10);
      const reserved = parseInt(prod.reserved_stock, 10);
      const available = stock - reserved;

      if (available < qty) {
        const err = new Error(`Insufficient inventory for SKU '${sku}'. Available: ${Math.max(0, available)}, Requested: ${qty}`);
        err.statusCode = 400;
        err.code = 'INSUFFICIENT_STOCK';
        throw err;
      }

      // Increment reserved_stock atomically
      await client.query(
        `UPDATE products 
         SET reserved_stock = reserved_stock + $1, updated_at = CURRENT_TIMESTAMP 
         WHERE sku = $2`,
        [qty, sku]
      );

      // Record reservation row
      const resRow = await client.query(
        `INSERT INTO inventory_reservations (order_id, sku, qty, status) 
         VALUES ($1, $2, $3, 'RESERVED') 
         RETURNING *`,
        [orderId || null, sku, qty]
      );
      reservations.push(resRow.rows[0]);
    }

    if (isOwnClient) {
      await client.query('COMMIT');
    }
  } catch (err) {
    if (isOwnClient) {
      await client.query('ROLLBACK').catch(() => {});
    }
    throw err;
  } finally {
    if (isOwnClient) {
      client.release();
    }
  }

  // Audit event
  await logAuditEvent({
    actorId,
    actorRole,
    ipAddress,
    action: 'INVENTORY_RESERVED',
    entity: 'Inventory',
    entityId: orderId,
    metadata: {
      orderId,
      itemCount: items.length,
      reservedItems: items.map(i => ({ sku: i.sku, qty: i.qty }))
    }
  });

  return { success: true, reservations };
}

/**
 * Release reserved or restock allocated stock (e.g. upon order cancellation or expiry)
 */
async function releaseStock({ orderId, actorId = null, actorRole = 'SYSTEM', ipAddress = null }) {
  const pool = getPool();
  const client = await pool.connect();
  const released = [];

  try {
    await client.query('BEGIN');

    // 1. Release active RESERVED stock (restores reserved_stock counter)
    const activeRes = await client.query(
      `SELECT * FROM inventory_reservations WHERE order_id = $1 AND status = 'RESERVED' FOR UPDATE`,
      [orderId]
    );

    for (const r of activeRes.rows) {
      await client.query(
        `UPDATE products 
         SET reserved_stock = GREATEST(0, reserved_stock - $1), updated_at = CURRENT_TIMESTAMP 
         WHERE sku = $2`,
        [r.qty, r.sku]
      );

      const updated = await client.query(
        `UPDATE inventory_reservations 
         SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 RETURNING *`,
        [r.id]
      );
      released.push(updated.rows[0]);
    }

    // 2. Restock ALLOCATED items (if a paid order was cancelled prior to dispatch)
    const allocatedRes = await client.query(
      `SELECT * FROM inventory_reservations WHERE order_id = $1 AND status = 'ALLOCATED' FOR UPDATE`,
      [orderId]
    );

    for (const r of allocatedRes.rows) {
      await client.query(
        `UPDATE products 
         SET stock = stock + $1, updated_at = CURRENT_TIMESTAMP 
         WHERE sku = $2`,
        [r.qty, r.sku]
      );

      const updated = await client.query(
        `UPDATE inventory_reservations 
         SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 RETURNING *`,
        [r.id]
      );
      released.push(updated.rows[0]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  if (released.length > 0) {
    await logAuditEvent({
      actorId,
      actorRole,
      ipAddress,
      action: 'INVENTORY_RELEASED',
      entity: 'Inventory',
      entityId: orderId,
      metadata: { orderId, releasedCount: released.length }
    });
  }

  return { success: true, released };
}

/**
 * Permanently allocate and deduct physical inventory (e.g. upon payment verification / lab dispatch)
 * Strictly idempotent: subsequent invocations find 0 RESERVED rows and do not double-decrement.
 */
async function allocateStock({ orderId, actorId = null, actorRole = 'SYSTEM', ipAddress = null }) {
  const pool = getPool();
  const client = await pool.connect();
  const allocated = [];

  try {
    await client.query('BEGIN');

    const activeRes = await client.query(
      `SELECT * FROM inventory_reservations WHERE order_id = $1 AND status = 'RESERVED' FOR UPDATE`,
      [orderId]
    );

    for (const r of activeRes.rows) {
      await client.query(
        `UPDATE products 
         SET stock = GREATEST(0, stock - $1), 
             reserved_stock = GREATEST(0, reserved_stock - $1), 
             updated_at = CURRENT_TIMESTAMP 
         WHERE sku = $2`,
        [r.qty, r.sku]
      );

      const updated = await client.query(
        `UPDATE inventory_reservations 
         SET status = 'ALLOCATED', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1 RETURNING *`,
        [r.id]
      );
      allocated.push(updated.rows[0]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  if (allocated.length > 0) {
    await logAuditEvent({
      actorId,
      actorRole,
      ipAddress,
      action: 'INVENTORY_ALLOCATED',
      entity: 'Inventory',
      entityId: orderId,
      metadata: { orderId, allocatedCount: allocated.length }
    });
  }

  return { success: true, allocated };
}

/**
 * Administrative stock adjustment with row-level locking, invariant enforcement, and audit trail
 */
async function adjustStock({ sku, delta = null, newStock = null, reason = null, actorId = null, actorRole = 'ADMIN', ipAddress = null }) {
  if (actorRole !== 'ADMIN') {
    const err = new Error('Access denied. Only Administrators can perform stock adjustments.');
    err.statusCode = 403;
    err.code = 'UNAUTHORIZED_INVENTORY_ADJUSTMENT';
    throw err;
  }

  if (!sku || typeof sku !== 'string') {
    const err = new Error('A valid product SKU is required.');
    err.statusCode = 400;
    err.code = 'INVALID_SKU';
    throw err;
  }
  const cleanSku = sku.trim().toUpperCase();

  if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
    const err = new Error('A clear operational reason (minimum 3 characters) is required for stock adjustments.');
    err.statusCode = 400;
    err.code = 'MISSING_ADJUSTMENT_REASON';
    throw err;
  }

  if (delta !== null && delta !== undefined) {
    if (typeof delta !== 'number' || !Number.isInteger(delta)) {
      const err = new Error('Stock delta must be an integer.');
      err.statusCode = 400;
      err.code = 'INVALID_STOCK_DELTA';
      throw err;
    }
  } else if (newStock !== null && newStock !== undefined) {
    if (typeof newStock !== 'number' || !Number.isInteger(newStock)) {
      const err = new Error('New stock value must be an integer.');
      err.statusCode = 400;
      err.code = 'INVALID_STOCK_VALUE';
      throw err;
    }
  } else {
    const err = new Error('Either delta or newStock must be provided for stock adjustment.');
    err.statusCode = 400;
    err.code = 'MISSING_STOCK_INPUT';
    throw err;
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Row lock product to serialize adjustments and prevent race conditions
    const prodRes = await client.query(
      `SELECT sku, name, stock, COALESCE(reserved_stock, 0) AS reserved_stock
       FROM products WHERE sku = $1 FOR UPDATE`,
      [cleanSku]
    );

    if (prodRes.rows.length === 0) {
      await client.query('ROLLBACK');
      const err = new Error(`Product with SKU '${cleanSku}' not found.`);
      err.statusCode = 404;
      err.code = 'PRODUCT_NOT_FOUND';
      throw err;
    }

    const currentStock = parseInt(prodRes.rows[0].stock, 10);
    const reservedStock = parseInt(prodRes.rows[0].reserved_stock, 10);

    let targetStock = currentStock;
    if (delta !== null && delta !== undefined) {
      targetStock = currentStock + delta;
    } else {
      targetStock = newStock;
    }

    // Invariant 1: Resulting stock cannot be negative
    if (targetStock < 0) {
      await client.query('ROLLBACK');
      const err = new Error(`Stock adjustment would result in negative inventory (${targetStock}). Current stock is ${currentStock}.`);
      err.statusCode = 400;
      err.code = 'NEGATIVE_STOCK_PROHIBITED';
      throw err;
    }

    // Invariant 2: Resulting physical stock cannot drop below active reserved stock
    if (targetStock < reservedStock) {
      await client.query('ROLLBACK');
      const err = new Error(`Stock adjustment (${targetStock}) cannot be less than active reserved stock (${reservedStock}). Cannot oversell reserved orders.`);
      err.statusCode = 400;
      err.code = 'STOCK_BELOW_RESERVED_PROHIBITED';
      throw err;
    }

    await client.query(
      `UPDATE products
       SET stock = $1, updated_at = CURRENT_TIMESTAMP
       WHERE sku = $2`,
      [targetStock, cleanSku]
    );

    await client.query('COMMIT');

    const availableStock = targetStock - reservedStock;

    // Operational audit trail
    await logAuditEvent({
      actorId,
      actorRole,
      ipAddress,
      action: 'INVENTORY_ADJUSTED',
      entity: 'Product',
      entityId: cleanSku,
      metadata: {
        sku: cleanSku,
        previousStock: currentStock,
        newStock: targetStock,
        delta: targetStock - currentStock,
        reservedStock,
        availableStock,
        reason: reason.trim()
      }
    });

    return {
      success: true,
      sku: cleanSku,
      name: prodRes.rows[0].name,
      previousStock: currentStock,
      newStock: targetStock,
      delta: targetStock - currentStock,
      reservedStock,
      availableStock,
      reason: reason.trim()
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getInventory,
  reserveStock,
  releaseStock,
  allocateStock,
  adjustStock
};
