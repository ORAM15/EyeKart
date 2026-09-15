/**
 * EyeKart Phase 6.2 Checkout Service
 * Generates authoritative checkout quotes and delivery valuations.
 * Client totalPrice, vat, and subtotal are explicitly ignored.
 */
const crypto = require('crypto');
const { getCartDetails } = require('./cartService');
const { calculateAuthoritativeQuote } = require('./pricingService');

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
  let cartData = null;

  if (cartId) {
    cartData = await getCartDetails(cartId, userId);
    if (!cartData || cartData.items.length === 0) {
      const err = new Error('Cannot generate checkout quote for an empty or nonexistent cart.');
      err.statusCode = 400;
      err.code = 'EMPTY_CART';
      throw err;
    }
  } else if (Array.isArray(items) && items.length > 0) {
    // Quote from direct items (e.g. immediate Buy Now or test payloads)
    const quoteItems = items.map(it => ({
      sku: it.sku,
      variant: it.variant || 'Standard',
      qty: it.qty || 1,
      lensConfig: it.lensConfig || null
    }));
    const calc = await calculateAuthoritativeQuote(quoteItems);
    cartData = {
      subtotal: calc.subtotal,
      vat: calc.vat,
      total: calc.total,
      items: calc.items.map(it => ({
        ...it,
        lensConfig: it.lensConfig || null,
        framePrice: it.authoritativeFramePrice,
        lensPrice: it.authoritativeLensPrice,
        totalPrice: it.authoritativeItemTotal,
        productSnapshot: {
          category: 'eyeglasses',
          material: 'Titanium / Acetate',
          dimensions: '51-19-145'
        }
      }))
    };
  } else {
    const err = new Error('A valid cartId or items array is required to generate a checkout quote.');
    err.statusCode = 400;
    err.code = 'INVALID_CHECKOUT_INPUT';
    throw err;
  }

  // Authoritative delivery fee calculation
  let deliveryFee = 0;
  let deliveryLabel = 'Complimentary Westlands & Greater Nairobi Courier';
  if (deliveryOption === 'EXPRESS_SAMEDAY') {
    deliveryFee = 500;
    deliveryLabel = 'Priority Same-Day Express Courier (Nairobi)';
  }

  const subtotal = cartData.subtotal;
  // VAT-inclusive pricing: extract VAT component from already-inclusive prices
  const vat = Math.round(subtotal * 16 / 116 * 100) / 100;
  const total = subtotal + deliveryFee; // Total = subtotal + delivery (VAT already included in prices)

  const quoteId = 'QTE-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15-minute TTL

  const quote = {
    quoteId,
    userId: userId || null,
    cartId: cartId || null,
    items: cartData.items,
    itemCount: cartData.items.length,
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
