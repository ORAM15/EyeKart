/**
 * Authoritative Server-Side Pricing Engine
 * Computes frame price, lens index surcharges, coatings, and VAT.
 * Strictly ignores and rejects client-submitted totals.
 */
const { getProductBySku } = require('./catalogService');
const {
  validateVariant,
  validateLensConfig,
  LENS_TYPES,
  LENS_INDICES,
  COATINGS
} = require('./opticalConfigService');

const LENS_INDEX_PRICING = Object.fromEntries(
  Object.entries(LENS_INDICES).map(([k, v]) => [k, v.price])
);

const LENS_TYPE_PRICING = Object.fromEntries(
  Object.entries(LENS_TYPES).map(([k, v]) => [k, v.price])
);

const COATING_PRICING = Object.fromEntries(
  Object.entries(COATINGS).map(([k, v]) => [k, v.price])
);

/**
 * Calculate authoritative quote for a list of cart/order items
 */
async function calculateAuthoritativeQuote(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('Pricing calculation requires a non-empty array of items');
    err.statusCode = 400;
    err.code = 'EMPTY_ITEMS_ARRAY';
    throw err;
  }

  let subtotal = 0;
  let computedItems = [];

  for (const item of items) {
    if (!item.sku) {
      const err = new Error('Each item must specify a valid SKU');
      err.statusCode = 400;
      err.code = 'INVALID_SKU';
      throw err;
    }

    const product = await getProductBySku(item.sku);
    if (!product) {
      const err = new Error(`Product with SKU '${item.sku}' not found in canonical catalog`);
      err.statusCode = 400;
      err.code = 'PRODUCT_NOT_FOUND';
      throw err;
    }

    const qty = parseInt(item.qty || 1, 10);
    if (isNaN(qty) || qty < 1 || qty > 100) {
      const err = new Error(`Invalid quantity for SKU '${item.sku}'`);
      err.statusCode = 400;
      err.code = 'INVALID_QUANTITY';
      throw err;
    }

    // Validate variant and apply price delta
    const validatedVariant = validateVariant(product, item.variant);
    const framePrice = product.price + validatedVariant.priceDelta;

    // Validate lens config if provided
    let lensPrice = 0;
    const cfg = item.lensConfig;
    if (cfg && typeof cfg === 'object') {
      validateLensConfig(product, cfg);

      const indexFee = LENS_INDEX_PRICING[cfg.index] !== undefined ? LENS_INDEX_PRICING[cfg.index] : 0;
      const typeFee = LENS_TYPE_PRICING[cfg.lensType] !== undefined ? LENS_TYPE_PRICING[cfg.lensType] : 0;
      let coatingsFee = 0;
      if (Array.isArray(cfg.coatings)) {
        for (const c of cfg.coatings) {
          if (COATING_PRICING[c] !== undefined) {
            coatingsFee += COATING_PRICING[c];
          }
        }
      }
      lensPrice = indexFee + typeFee + coatingsFee;
    }

    const itemTotal = (framePrice + lensPrice) * qty;
    subtotal += itemTotal;

    computedItems.push({
      sku: product.sku,
      name: product.name,
      variant: validatedVariant.name || item.variant || 'Standard',
      qty,
      lensConfig: item.lensConfig || null,
      authoritativeFramePrice: framePrice,
      authoritativeLensPrice: lensPrice,
      authoritativeItemTotal: itemTotal,
      clientSubmittedTotalIgnored: item.totalPrice !== undefined ? item.totalPrice : null
    });
  }

  // Authoritative VAT Calculation — VAT-inclusive pricing (Kenya 16% standard)
  // All EyeKart selling prices include VAT. Extract the VAT component for transparency.
  // VAT component = VAT-inclusive subtotal × 16 / 116
  const vat = Math.round(subtotal * 16 / 116 * 100) / 100;
  const deliveryFee = 0; // Standard Nairobi Express
  const total = subtotal + deliveryFee; // Total = subtotal (VAT already included in prices)

  return {
    subtotal,
    vat,
    vatNote: 'VAT included (16%)',
    deliveryFee,
    total,
    currency: 'KES',
    itemCount: computedItems.length,
    items: computedItems,
    pricingSource: {
      frame: 'VERIFIED_CANONICAL_CATALOG',
      opticalConfiguration: 'CONFIGURATION_REQUIRED_ENGINEERING_DEFAULT',
      taxEngine: 'STATUTORY_KENYA_VAT_16_INCLUSIVE'
    }
  };
}

module.exports = {
  calculateAuthoritativeQuote,
  LENS_INDEX_PRICING,
  LENS_TYPE_PRICING,
  COATING_PRICING
};
