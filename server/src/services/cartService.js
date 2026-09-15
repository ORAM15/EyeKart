/**
 * EyeKart Phase 6.2 Cart Service
 * Server-authoritative shopping cart management.
 * Validates SKU, variant, quantity, and recomputes all totals server-side.
 */
const { query } = require('../db/pool');
const { getProductBySku } = require('./catalogService');
const { calculateAuthoritativeQuote } = require('./pricingService');
const { logAuditEvent } = require('./auditService');

/**
 * Get or create active cart for a user (or guest session)
 */
async function getOrCreateCart(userId, sessionId = null) {
  if (userId) {
    const existing = await query(
      `SELECT * FROM carts WHERE user_id = $1 AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (existing.rows.length > 0) {
      return existing.rows[0];
    }
    const created = await query(
      `INSERT INTO carts (user_id, status) VALUES ($1, 'ACTIVE') RETURNING *`,
      [userId]
    );
    return created.rows[0];
  }

  // Guest Cart
  if (sessionId) {
    const existing = await query(
      `SELECT * FROM carts WHERE session_id = $1 AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
      [sessionId]
    );
    if (existing.rows.length > 0) {
      return existing.rows[0];
    }
    const created = await query(
      `INSERT INTO carts (session_id, status) VALUES ($1, 'ACTIVE') RETURNING *`,
      [sessionId]
    );
    return created.rows[0];
  }

  // Ephemeral guest cart without session ID
  const created = await query(
    `INSERT INTO carts (status) VALUES ('ACTIVE') RETURNING *`
  );
  return created.rows[0];
}

/**
 * Get cart with server-recomputed authoritative items and totals
 */
async function getCartDetails(cartId, userId = null) {
  const cartRes = await query(`SELECT * FROM carts WHERE id = $1`, [cartId]);
  if (cartRes.rows.length === 0) {
    return null;
  }
  const cart = cartRes.rows[0];

  // Optional cross-user protection if user_id is set on cart
  if (userId && cart.user_id && cart.user_id !== userId) {
    const err = new Error('Unauthorized access to cart');
    err.statusCode = 403;
    err.code = 'FORBIDDEN_CART_ACCESS';
    throw err;
  }

  const itemsRes = await query(
    `SELECT ci.id, ci.cart_id, ci.sku, ci.variant, ci.qty, ci.lens_config, ci.created_at, ci.updated_at,
            p.name, p.base_price, p.gallery, p.material, p.dimensions, p.category_id, p.is_active
     FROM cart_items ci
     JOIN products p ON ci.sku = p.sku
     WHERE ci.cart_id = $1
     ORDER BY ci.created_at ASC`,
    [cartId]
  );

  const rawItems = itemsRes.rows;
  if (rawItems.length === 0) {
    return {
      id: cart.id,
      userId: cart.user_id,
      status: cart.status,
      items: [],
      subtotal: 0,
      vat: 0,
      deliveryFee: 0,
      total: 0,
      itemCount: 0
    };
  }

  // Use authoritative pricing calculation
  const quoteItems = rawItems.map(it => ({
    sku: it.sku,
    variant: it.variant,
    qty: it.qty,
    lensConfig: it.lens_config
  }));

  const quote = await calculateAuthoritativeQuote(quoteItems);

  // Combine DB item metadata with quote results
  const items = rawItems.map((it, idx) => {
    const qIt = quote.items[idx];
    return {
      id: it.id,
      cartId: it.cart_id,
      sku: it.sku,
      name: it.name,
      variant: it.variant,
      qty: it.qty,
      framePrice: qIt.authoritativeFramePrice,
      lensPrice: qIt.authoritativeLensPrice,
      totalPrice: qIt.authoritativeItemTotal,
      lensConfig: it.lens_config,
      productSnapshot: {
        category: it.category_id,
        material: it.material,
        dimensions: it.dimensions,
        image: Array.isArray(it.gallery) && it.gallery.length > 0 ? it.gallery[0] : null
      },
      createdAt: it.created_at
    };
  });

  return {
    id: cart.id,
    userId: cart.user_id,
    status: cart.status,
    items,
    subtotal: quote.subtotal,
    vat: quote.vat,
    deliveryFee: quote.deliveryFee,
    total: quote.total,
    itemCount: items.reduce((sum, it) => sum + it.qty, 0)
  };
}

/**
 * Add an item to cart (strictly validates SKU, variant, quantity)
 */
async function addItemToCart(cartId, { sku, variant, qty = 1, lensConfig = null }) {
  if (!sku || typeof sku !== 'string') {
    const err = new Error('A valid product SKU is required.');
    err.statusCode = 400;
    err.code = 'INVALID_SKU';
    throw err;
  }

  const cleanSku = sku.trim().toUpperCase();
  const product = await getProductBySku(cleanSku);
  if (!product) {
    const err = new Error(`Product with SKU '${cleanSku}' not found in canonical catalog.`);
    err.statusCode = 400;
    err.code = 'PRODUCT_NOT_FOUND';
    throw err;
  }

  const parsedQty = parseInt(qty, 10);
  if (isNaN(parsedQty) || parsedQty < 1 || parsedQty > 100) {
    const err = new Error('Quantity must be an integer between 1 and 100.');
    err.statusCode = 400;
    err.code = 'INVALID_QUANTITY';
    throw err;
  }

  const cleanVariant = (variant && typeof variant === 'string') ? variant.trim() : 'Standard';

  // Check if identical item (sku + variant + same lensConfig) exists
  const existingItems = await query(
    `SELECT id, qty, lens_config FROM cart_items WHERE cart_id = $1 AND sku = $2 AND variant = $3`,
    [cartId, cleanSku, cleanVariant]
  );

  let match = null;
  for (const row of existingItems.rows) {
    if (JSON.stringify(row.lens_config || null) === JSON.stringify(lensConfig || null)) {
      match = row;
      break;
    }
  }

  if (match) {
    const newQty = match.qty + parsedQty;
    await query(`UPDATE cart_items SET qty = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [newQty, match.id]);
  } else {
    await query(
      `INSERT INTO cart_items (cart_id, sku, variant, qty, lens_config)
       VALUES ($1, $2, $3, $4, $5)`,
      [cartId, cleanSku, cleanVariant, parsedQty, lensConfig ? JSON.stringify(lensConfig) : null]
    );
  }

  await query(`UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [cartId]);
  return getCartDetails(cartId);
}

/**
 * Update cart item quantity
 */
async function updateCartItemQty(cartId, itemId, qty) {
  const parsedQty = parseInt(qty, 10);
  if (isNaN(parsedQty)) {
    const err = new Error('Quantity must be a valid integer.');
    err.statusCode = 400;
    err.code = 'INVALID_QUANTITY';
    throw err;
  }

  const itemCheck = await query(`SELECT id FROM cart_items WHERE id = $1 AND cart_id = $2`, [itemId, cartId]);
  if (itemCheck.rows.length === 0) {
    const err = new Error('Cart item not found.');
    err.statusCode = 404;
    err.code = 'ITEM_NOT_FOUND';
    throw err;
  }

  if (parsedQty <= 0) {
    await query(`DELETE FROM cart_items WHERE id = $1`, [itemId]);
  } else {
    await query(`UPDATE cart_items SET qty = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [parsedQty, itemId]);
  }

  await query(`UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [cartId]);
  return getCartDetails(cartId);
}

/**
 * Remove an item from cart
 */
async function removeCartItem(cartId, itemId) {
  const res = await query(`DELETE FROM cart_items WHERE id = $1 AND cart_id = $2 RETURNING id`, [itemId, cartId]);
  if (res.rows.length === 0) {
    const err = new Error('Cart item not found.');
    err.statusCode = 404;
    err.code = 'ITEM_NOT_FOUND';
    throw err;
  }
  await query(`UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [cartId]);
  return getCartDetails(cartId);
}

/**
 * Clear all items from cart
 */
async function clearCart(cartId) {
  await query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);
  await query(`UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [cartId]);
  return getCartDetails(cartId);
}

/**
 * Controlled Guest Cart merge into Customer Cart
 */
async function mergeGuestCart(userId, guestItems = []) {
  if (!userId) {
    const err = new Error('User authentication required for cart merge.');
    err.statusCode = 401;
    throw err;
  }

  const cart = await getOrCreateCart(userId);
  if (Array.isArray(guestItems) && guestItems.length > 0) {
    for (const item of guestItems) {
      if (item && item.sku) {
        try {
          await addItemToCart(cart.id, {
            sku: item.sku,
            variant: item.variant || 'Standard',
            qty: item.qty || 1,
            lensConfig: item.lensConfig || null
          });
        } catch (e) {
          console.warn('[Cart Merge] Skipping invalid item during merge:', item.sku, e.message);
        }
      }
    }
  }

  return getCartDetails(cart.id, userId);
}

module.exports = {
  getOrCreateCart,
  getCartDetails,
  addItemToCart,
  updateCartItemQty,
  removeCartItem,
  clearCart,
  mergeGuestCart
};
