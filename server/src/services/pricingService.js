/**
 * Authoritative Server-Side Pricing Engine
 * Computes frame price, lens index surcharges, coatings, and VAT.
 * Strictly ignores and rejects client-submitted totals.
 */
const { getProductBySku } = require('./catalogService');

const LENS_INDEX_PRICING = {
  '1.50': 0,
  '1.56': 2400,
  '1.60': 4800,
  '1.67': 8200,
  '1.74': 14500
};

const LENS_TYPE_PRICING = {
  'Single Vision': 0,
  'Digital Single Vision': 0,
  'Blue Defense Plano': 1800,
  'Office Near-Variable': 6500,
  'Digital Free-Form Progressive': 12500
};

const COATING_PRICING = {
  'BlueShield 420nm': 1800,
  'BlueShield UV420 High-Energy Filter': 1800,
  'Anti-Glare AR': 1500,
  'Crizal-Grade Hydrophobic Anti-Glare': 1500,
  'Diamond Hard-Coat Scratch Armour': 1400
};

/**
 * Calculate authoritative quote for a list of cart/order items
 */
async function calculateAuthoritativeQuote(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Pricing calculation requires a non-empty array of items');
  }

  let subtotal = 0;
  let computedItems = [];

  for (const item of items) {
    if (!item.sku) throw new Error('Each item must specify a valid SKU');
    const product = await getProductBySku(item.sku);
    if (!product) throw new Error(`Product with SKU '${item.sku}' not found in canonical catalog`);

    const qty = parseInt(item.qty || 1, 10);
    if (isNaN(qty) || qty < 1 || qty > 100) {
      throw new Error(`Invalid quantity for SKU '${item.sku}'`);
    }

    // Authoritative frame price
    let framePrice = product.price;

    // Check variant delta if variant specified
    if (item.variant) {
      const matchedVariant = product.variants.find(v => v.name.toLowerCase() === String(item.variant).toLowerCase());
      if (matchedVariant) {
        framePrice += parseFloat(matchedVariant.priceDelta || 0);
      }
    }

    // Authoritative lens price calculation
    let lensPrice = 0;
    const cfg = item.lensConfig;
    if (cfg && typeof cfg === 'object') {
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
      variant: item.variant || 'Standard',
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
    items: computedItems
  };
}

module.exports = {
  calculateAuthoritativeQuote,
  LENS_INDEX_PRICING,
  LENS_TYPE_PRICING,
  COATING_PRICING
};
