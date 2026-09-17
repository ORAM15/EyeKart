/**
 * EyeKart Phase 5 Checkout Service
 * Generates authoritative checkout quotes, validates SKU existence,
 * checks inventory availability, and calculates delivery fees.
 * Client totalPrice, vat, and subtotal are explicitly ignored.
 */
const crypto = require('crypto');
const { getCartDetails } = require('./cartService');
const { calculateAuthoritativeQuote } = require('./pricingService');
const { query } = require('../db/pool');

// In-memory quote cache (TTL: 15 minutes)
const QUOTE_CACHE = new Map();

function cleanExpiredQuotes() {
  const now = Date.now();
  for (const [id, q] of QUOTE_CACHE.entries()) {
    if (q.expiresAt < now) {
      QUOTE_CACHE.delete(id);
    }
  }
}

/**
 * Generate server-authoritative checkout quote
 */
async function generateCheckoutQuote({ userId = null, cartId = null, items = [], deliveryOption = 'STANDARD_NAIROBI' }) {
  let quoteItems = [];

  if (cartId) {
    const cartData = await getCartDetails(cartId, userId);
    if (!cartData || !Array.isArray(cartData.items) || cartData.items.length === 0) {
      const err = new Error('Cannot generate checkout quote for an empty or nonexistent cart.');
      err.statusCode = 400;
      err.code = 'EMPTY_CART';
      throw err;
    }
    quoteItems = cartData.items.map(it => ({
      sku: it.sku,
      variant: it.variant || 'Standard',
      qty: parseInt(it.qty || 1, 10),
      lensConfig: it.lensConfig || null
    }));
  } else if (Array.isArray(items) && items.length > 0) {
    // Quote from direct items (e.g. Buy Now or direct checkout)
    quoteItems = items.map(it => {
      const rawQty = it.qty;
      if (rawQty === undefined || rawQty === null || typeof rawQty !== 'number' || !Number.isInteger(rawQty) || rawQty <= 0) {
        const err = new Error(`Invalid item quantity for SKU '${it.sku}'. Must be a positive integer.`);
        err.statusCode = 400;
        err.code = 'INVALID_QUANTITY';
        throw err;
      }
      if (rawQty > 100) {
        const err = new Error(`Quantity for SKU '${it.sku}' exceeds maximum limit of 100.`);
        err.statusCode = 400;
        err.code = 'EXCESSIVE_QUANTITY';
        throw err;
      }
      return {
        sku: String(it.sku || '').trim(),
        variant: it.variant || 'Standard',
        qty: rawQty,
        lensConfig: it.lensConfig || null
      };
    });
  } else {
    const err = new Error('A valid cartId or items array is required to generate a checkout quote.');
    err.statusCode = 400;
    err.code = 'INVALID_CHECKOUT_INPUT';
    throw err;
  }

  // Pre-validate inventory availability for all items
  for (const it of quoteItems) {
    const prodRes = await query(
      `SELECT sku, name, stock, COALESCE(reserved_stock, 0) as reserved_stock 
       FROM products WHERE sku = $1`,
      [it.sku]
    );
    if (prodRes.rows.length === 0) {
      const err = new Error(`Product with SKU '${it.sku}' not found in canonical catalog.`);
      err.statusCode = 400;
      err.code = 'INVALID_CHECKOUT_ITEMS';
      throw err;
    }

    const prod = prodRes.rows[0];
    const available = prod.stock - prod.reserved_stock;
    if (available < it.qty) {
      const err = new Error(`Insufficient inventory for SKU '${it.sku}'. Available: ${Math.max(0, available)}, Requested: ${it.qty}`);
      err.statusCode = 400;
      err.code = 'INSUFFICIENT_STOCK';
      throw err;
    }
  }

  // Calculate authoritative pricing
  const calc = await calculateAuthoritativeQuote(quoteItems);

  // Authoritative delivery fee calculation
  let deliveryFee = 0;
  let deliveryLabel = 'Complimentary Westlands & Greater Nairobi Courier';
  if (deliveryOption === 'EXPRESS_SAMEDAY') {
    deliveryFee = 500;
    deliveryLabel = 'Priority Same-Day Express Courier (Nairobi)';
  }

  const subtotal = calc.subtotal;
  // VAT-inclusive pricing: extract VAT component from subtotal (Kenya 16% standard)
  const vat = Math.round(subtotal * 16 / 116 * 100) / 100;
  const total = subtotal + deliveryFee;

  const quoteId = 'QTE-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15-minute TTL

  const quote = {
    id: quoteId,
    quoteId,
    userId: userId || null,
    cartId: cartId || null,
    items: calc.items.map(it => ({
      sku: it.sku,
      name: it.name,
      variant: it.variant,
      qty: it.qty,
      lensConfig: it.lensConfig || null,
      framePrice: it.authoritativeFramePrice,
      lensPrice: it.authoritativeLensPrice,
      totalPrice: it.authoritativeItemTotal
    })),
    itemCount: calc.items.length,
    subtotal,
    vat,
    vatNote: 'VAT included (16%)',
    deliveryOption,
    deliveryFee,
    deliveryLabel,
    total,
    currency: 'KES',
    expiresAt,
    createdAt: new Date().toISOString()
  };

  cleanExpiredQuotes();
  QUOTE_CACHE.set(quoteId, quote);

  return quote;
}

/**
 * Retrieve cached quote by ID
 */
function getQuoteById(quoteId) {
  cleanExpiredQuotes();
  if (!quoteId || !QUOTE_CACHE.has(quoteId)) return null;
  const q = QUOTE_CACHE.get(quoteId);
  if (q.expiresAt < Date.now()) {
    QUOTE_CACHE.delete(quoteId);
    return null;
  }
  return q;
}

module.exports = {
  generateCheckoutQuote,
  getQuoteById
};
