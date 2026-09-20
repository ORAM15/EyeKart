/**
 * Optical Configuration & Lens Validation Service
 * 
 * ============================================================
 * SOURCE OF TRUTH & BUSINESS AUTHORITY AUDIT CLASSIFICATION
 * ============================================================
 * 
 * 1. FRAME BASE PRICES:
 *    CLASSIFICATION: VERIFIED BUSINESS FACT (Canonical Repository Catalog)
 *    SOURCE: assets/js/catalog-data.js, server/src/db/seed.js
 * 
 * 2. LENS OPTIONS & SURCHARGES (Lens Types, Indices, Coatings):
 *    CLASSIFICATION: CONFIGURATION REQUIRED / ENGINEERING DEFAULTS (UNVERIFIED)
 *    SOURCE: Scaffolding defaults inherited from pricingService.js / lens-configurator-engine.js.
 *    NOTE: These prices (e.g. 1800, 6500, 12500 KES) are engineering configuration defaults,
 *    NOT verified EyeKart Healthcare Limited commercial contracts. Formal commercial sign-off
 *    by the business owner is required before production freeze.
 * 
 * 3. PRESCRIPTION COMPATIBILITY BOUNDS (sphMin, sphMax, cylMax, supportsHighIndex):
 *    CLASSIFICATION: ENGINEERING VALIDATION PARAMETERS (CLINICAL REVIEW REQUIRED)
 *    SOURCE: catalog-data.js frame schema scaffolding.
 *    NOTE: These thresholds are engineering validation limits to prevent mechanical mounting
 *    errors; they are NOT verified medical safety protocols signed off by licensed Kenyan optometrists.
 * 
 * 4. TERMINOLOGY & CLAIMS:
 *    All unverified medical or third-party trademark claims (e.g. "Crizal-Grade", "Diamond Hard-Coat")
 *    are reclassified as engineering aliases. Neutral optical descriptors are the primary standard.
 */

const OPTICAL_CONFIG_AUDIT = {
  framePricing: {
    status: 'VERIFIED_CANONICAL_CATALOG',
    source: 'assets/js/catalog-data.js & database seed'
  },
  lensPricing: {
    status: 'CONFIGURATION_REQUIRED',
    source: 'ENGINEERING_DEFAULT_UNVERIFIED',
    isVerifiedBusinessFact: false,
    note: 'Surcharges are engineering configuration defaults. Production requires business confirmation.'
  },
  prescriptionCompatibility: {
    status: 'CLINICAL_VALIDATION_REQUIRED',
    source: 'ENGINEERING_BOUNDS_SCAFFOLDING',
    isVerifiedClinicalProtocol: false,
    note: 'Refractive limits are structural frame bounds, awaiting clinical protocol verification.'
  }
};

const LENS_TYPES = {
  'Single Vision': { price: 0, requiresPrescription: true, classification: 'ENGINEERING_DEFAULT' },
  'Digital Single Vision': { price: 0, requiresPrescription: true, classification: 'ENGINEERING_DEFAULT' },
  'Blue Defense Plano': { price: 1800, requiresPrescription: false, classification: 'ENGINEERING_DEFAULT' },
  'Office Near-Variable': { price: 6500, requiresPrescription: true, classification: 'ENGINEERING_DEFAULT' },
  'Digital Free-Form Progressive': { price: 12500, requiresPrescription: true, classification: 'ENGINEERING_DEFAULT' }
};

const LENS_INDICES = {
  '1.50': { price: 0, minIndex: 1.50, classification: 'ENGINEERING_DEFAULT' },
  '1.56': { price: 2400, minIndex: 1.56, classification: 'ENGINEERING_DEFAULT' },
  '1.60': { price: 4800, minIndex: 1.60, classification: 'ENGINEERING_DEFAULT' },
  '1.67': { price: 8200, minIndex: 1.67, classification: 'ENGINEERING_DEFAULT' },
  '1.74': { price: 14500, minIndex: 1.74, requiresHighIndexSupport: true, classification: 'ENGINEERING_DEFAULT' }
};

const COATINGS = {
  // Neutralized standard descriptions
  'Anti-Glare AR': { price: 1500, classification: 'ENGINEERING_DEFAULT' },
  'BlueShield 420nm': { price: 1800, classification: 'ENGINEERING_DEFAULT' },
  'BlueShield UV420 High-Energy Filter': { price: 1800, classification: 'ENGINEERING_DEFAULT' },
  'Crizal-Grade Hydrophobic Anti-Glare': { price: 1500, classification: 'ENGINEERING_DEFAULT_ALIAS', note: 'Third-party trademark alias retained for backward compatibility' },
  'Diamond Hard-Coat Scratch Armour': { price: 1400, classification: 'ENGINEERING_DEFAULT_ALIAS', note: 'Marketing label alias retained for backward compatibility' }
};

/**
 * Validate product variant against authoritative product variants
 */
function validateVariant(product, variant) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];

  // If variant is not provided or explicitly 'Standard'
  if (!variant || variant === 'Standard') {
    if (variants.length > 0) {
      const match = variants.find(v => (v.name || '').toLowerCase() === 'standard');
      if (match) {
        return {
          name: match.name,
          skuSuffix: match.skuSuffix || match.sku_suffix || '',
          priceDelta: parseFloat(match.priceDelta || match.price_delta || 0)
        };
      }
    }
    return { name: 'Standard', skuSuffix: '', priceDelta: 0 };
  }

  const cleanVariant = String(variant).trim();

  if (variants.length > 0) {
    const match = variants.find(v => 
      (v.name || '').toLowerCase() === cleanVariant.toLowerCase() ||
      (v.skuSuffix || v.sku_suffix || '').toLowerCase() === cleanVariant.toLowerCase()
    );
    if (!match) {
      const err = new Error(`Variant '${cleanVariant}' is invalid for product '${product.sku}'.`);
      err.statusCode = 400;
      err.code = 'INVALID_VARIANT';
      throw err;
    }
    return {
      name: match.name,
      skuSuffix: match.skuSuffix || match.sku_suffix || '',
      priceDelta: parseFloat(match.priceDelta || match.price_delta || 0)
    };
  }

  // If product has no variants defined, only 'Standard' is accepted
  if (cleanVariant.toLowerCase() !== 'standard') {
    const err = new Error(`Variant '${cleanVariant}' is not valid for product '${product.sku}'.`);
    err.statusCode = 400;
    err.code = 'INVALID_VARIANT';
    throw err;
  }

  return { name: 'Standard', skuSuffix: '', priceDelta: 0 };
}

/**
 * Validate refractive powers against frame compatibility limits
 */
function validateRefractivePowers(compatibility = {}, powers = {}) {
  if (!compatibility || typeof compatibility !== 'object') return;

  const { sphMin, sphMax, cylMax } = compatibility;
  const { od_sph, os_sph, od_cyl, os_cyl } = powers;

  for (const [key, val] of Object.entries({ od_sph, os_sph })) {
    if (val !== undefined && val !== null && val !== '') {
      const num = Number(val);
      if (isNaN(num)) {
        const err = new Error(`Invalid sphere value '${val}' for ${key}.`);
        err.statusCode = 400;
        err.code = 'INVALID_PRESCRIPTION_DATA';
        throw err;
      }
      if (sphMin !== undefined && num < Number(sphMin)) {
        const err = new Error(`Refractive sphere ${num} exceeds minimum limit (${sphMin}) for this frame.`);
        err.statusCode = 400;
        err.code = 'REFRACTIVE_POWER_OUT_OF_RANGE';
        throw err;
      }
      if (sphMax !== undefined && num > Number(sphMax)) {
        const err = new Error(`Refractive sphere ${num} exceeds maximum limit (${sphMax}) for this frame.`);
        err.statusCode = 400;
        err.code = 'REFRACTIVE_POWER_OUT_OF_RANGE';
        throw err;
      }
    }
  }

  for (const [key, val] of Object.entries({ od_cyl, os_cyl })) {
    if (val !== undefined && val !== null && val !== '') {
      const num = Number(val);
      if (isNaN(num)) {
        const err = new Error(`Invalid cylinder value '${val}' for ${key}.`);
        err.statusCode = 400;
        err.code = 'INVALID_PRESCRIPTION_DATA';
        throw err;
      }
      if (cylMax !== undefined) {
        const limit = Math.abs(Number(cylMax));
        if (Math.abs(num) > limit) {
          const err = new Error(`Refractive cylinder ${num} exceeds maximum limit (${cylMax}) for this frame.`);
          err.statusCode = 400;
          err.code = 'REFRACTIVE_POWER_OUT_OF_RANGE';
          throw err;
        }
      }
    }
  }
}

/**
 * Authoritatively validate an optical lens configuration
 */
function validateLensConfig(product, lensConfig) {
  if (!lensConfig) return null;
  if (typeof lensConfig !== 'object' || Array.isArray(lensConfig)) {
    const err = new Error('Lens configuration must be a valid object.');
    err.statusCode = 400;
    err.code = 'INVALID_LENS_CONFIG';
    throw err;
  }

  const { lensType, index, coatings, prescriptionMode, od_sph, os_sph, od_cyl, os_cyl } = lensConfig;

  // 1. Lens Type validation
  if (lensType !== undefined && lensType !== null) {
    if (!LENS_TYPES[lensType]) {
      const err = new Error(`Invalid lens type '${lensType}'. Allowed: ${Object.keys(LENS_TYPES).join(', ')}`);
      err.statusCode = 400;
      err.code = 'INVALID_LENS_TYPE';
      throw err;
    }
  }

  // 2. Lens Index validation
  if (index !== undefined && index !== null) {
    const strIndex = String(index).trim();
    if (!LENS_INDICES[strIndex]) {
      const err = new Error(`Invalid lens index '${strIndex}'. Allowed: ${Object.keys(LENS_INDICES).join(', ')}`);
      err.statusCode = 400;
      err.code = 'INVALID_LENS_INDEX';
      throw err;
    }

    // High Index 1.74 compatibility check
    if (strIndex === '1.74') {
      const rxCompat = product?.prescriptionCompatibility || product?.prescription_compatibility || {};
      if (rxCompat.supportsHighIndex !== true) {
        const err = new Error(`Frame '${product?.sku || 'UNKNOWN'}' does not support high-index 1.74 lenses.`);
        err.statusCode = 400;
        err.code = 'INCOMPATIBLE_HIGH_INDEX';
        throw err;
      }
    }
  }

  // 3. Lens Coatings validation
  if (coatings !== undefined && coatings !== null) {
    if (!Array.isArray(coatings)) {
      const err = new Error('Coatings must be an array of valid coating names.');
      err.statusCode = 400;
      err.code = 'INVALID_LENS_COATING';
      throw err;
    }
    for (const c of coatings) {
      if (!COATINGS[c]) {
        const err = new Error(`Invalid lens coating '${c}'. Allowed: ${Object.keys(COATINGS).join(', ')}`);
        err.statusCode = 400;
        err.code = 'INVALID_LENS_COATING';
        throw err;
      }
    }
  }

  // 4. Refractive Power Range Check
  const rxCompat = product?.prescriptionCompatibility || product?.prescription_compatibility || {};
  validateRefractivePowers(rxCompat, { od_sph, os_sph, od_cyl, os_cyl });

  return true;
}

/**
 * Determine whether a lens configuration or product requires a prescription
 */
function isPrescriptionRequired(lensConfig) {
  if (!lensConfig || typeof lensConfig !== 'object') return false;
  const mode = String(lensConfig.prescriptionMode || lensConfig.prescription_mode || '').toLowerCase();
  if (mode === 'plano' || mode === 'no_rx') return false;
  if (lensConfig.lensType === 'Blue Defense Plano') return false;
  if (lensConfig.lensType && LENS_TYPES[lensConfig.lensType]?.requiresPrescription) return true;
  if (mode === 'prescription' || mode === 'rx') return true;
  return false;
}

module.exports = {
  OPTICAL_CONFIG_AUDIT,
  LENS_TYPES,
  LENS_INDICES,
  COATINGS,
  validateVariant,
  validateLensConfig,
  validateRefractivePowers,
  isPrescriptionRequired
};
