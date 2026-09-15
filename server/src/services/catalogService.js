/**
 * Canonical Product & Catalog Service
 * Authoritative Server-Side Catalog Engine
 */
const { query } = require('../db/pool');

async function getAllProducts() {
  const res = await query(`
    SELECT p.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', v.id,
            'name', v.name,
            'colorHex', v.color_hex,
            'skuSuffix', v.sku_suffix,
            'priceDelta', v.price_delta
          )
        ) FILTER (WHERE v.id IS NOT NULL), '[]'
      ) AS variants
    FROM products p
    LEFT JOIN product_variants v ON p.sku = v.sku AND v.is_active = TRUE
    WHERE p.is_active = TRUE
    GROUP BY p.sku
    ORDER BY p.sku ASC
  `);

  return res.rows.map(row => ({
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    categoryId: row.category_id,
    collectionId: row.collection_id,
    gender: row.gender,
    shape: row.shape,
    material: row.material,
    price: parseFloat(row.base_price),
    compareAtPrice: row.compare_at_price ? parseFloat(row.compare_at_price) : null,
    dimensions: row.dimensions,
    weight: row.weight,
    stock: row.stock,
    sourceConflict: row.source_conflict,
    sourceConflictDetails: row.source_conflict_details,
    gallery: row.gallery,
    prescriptionCompatibility: row.prescription_compatibility,
    asset3D: row.asset_3d,
    assetVTO: row.asset_vto,
    variants: row.variants
  }));
}

async function getProductBySku(sku) {
  if (!sku || typeof sku !== 'string') return null;
  const cleanSku = sku.trim().toUpperCase();

  const res = await query(`
    SELECT p.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', v.id,
            'name', v.name,
            'colorHex', v.color_hex,
            'skuSuffix', v.sku_suffix,
            'priceDelta', v.price_delta
          )
        ) FILTER (WHERE v.id IS NOT NULL), '[]'
      ) AS variants
    FROM products p
    LEFT JOIN product_variants v ON p.sku = v.sku AND v.is_active = TRUE
    WHERE p.sku = $1 AND p.is_active = TRUE
    GROUP BY p.sku
  `, [cleanSku]);

  if (res.rows.length === 0) return null;
  const row = res.rows[0];

  return {
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    categoryId: row.category_id,
    collectionId: row.collection_id,
    gender: row.gender,
    shape: row.shape,
    material: row.material,
    price: parseFloat(row.base_price),
    compareAtPrice: row.compare_at_price ? parseFloat(row.compare_at_price) : null,
    dimensions: row.dimensions,
    weight: row.weight,
    bridge: row.bridge,
    temple: row.temple,
    lensWidth: row.lens_width,
    lensHeight: row.lens_height,
    pantoscopicAngle: row.pantoscopic_angle,
    baseCurve: row.base_curve,
    frameTotalWidth: row.frame_total_width,
    stock: row.stock,
    sourceConflict: row.source_conflict,
    sourceConflictDetails: row.source_conflict_details,
    gallery: row.gallery,
    prescriptionCompatibility: row.prescription_compatibility,
    asset3D: row.asset_3d,
    assetVTO: row.asset_vto,
    variants: row.variants
  };
}

async function getAllCategories() {
  const res = await query(`SELECT id, name, slug, description FROM categories ORDER BY name ASC`);
  return res.rows;
}

async function getAllCollections() {
  const res = await query(`SELECT id, name, description FROM collections ORDER BY name ASC`);
  return res.rows;
}

module.exports = {
  getAllProducts,
  getProductBySku,
  getAllCategories,
  getAllCollections
};
