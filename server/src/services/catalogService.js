/**
 * Canonical Product & Catalog Service
 * Authoritative Server-Side Catalog Engine
 */
const { query } = require('../db/pool');
const { logAuditEvent } = require('./auditService');

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

async function getAdminProducts({ limit = 50, offset = 0, search = null } = {}) {
  const cleanLimit = Math.min(Math.max(1, parseInt(limit || 50, 10)), 100);
  const cleanOffset = Math.max(0, parseInt(offset || 0, 10));

  const whereClauses = [];
  const params = [];

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    whereClauses.push(`(sku ILIKE $${params.length} OR name ILIKE $${params.length} OR brand ILIKE $${params.length})`);
  }

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countRes = await query(`SELECT COUNT(*) as total FROM products ${whereStr}`, params);
  const total = parseInt(countRes.rows[0]?.total || 0, 10);

  params.push(cleanLimit);
  const limitIndex = params.length;
  params.push(cleanOffset);
  const offsetIndex = params.length;

  const res = await query(`
    SELECT sku, name, brand, category_id, collection_id, gender, shape, material,
           base_price, compare_at_price, stock, reserved_stock,
           (stock - reserved_stock) as available_stock,
           is_active, gallery, asset_3d, asset_vto, created_at, updated_at
    FROM products
    ${whereStr}
    ORDER BY sku ASC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `, params);

  return {
    products: res.rows.map(row => ({
      ...row,
      basePrice: parseFloat(row.base_price),
      compareAtPrice: row.compare_at_price ? parseFloat(row.compare_at_price) : null,
      stock: parseInt(row.stock, 10),
      reservedStock: parseInt(row.reserved_stock, 10),
      availableStock: parseInt(row.available_stock, 10)
    })),
    total,
    limit: cleanLimit,
    offset: cleanOffset
  };
}

async function updateProduct(sku, updates, { actorId, actorRole, ipAddress } = {}) {
  if (actorRole !== 'ADMIN') {
    const err = new Error('Privilege required to update product catalog.');
    err.statusCode = 403;
    err.code = 'UNAUTHORIZED_CATALOG_UPDATE';
    throw err;
  }

  if (!sku || typeof sku !== 'string') {
    const err = new Error('Valid SKU is required.');
    err.statusCode = 400;
    err.code = 'INVALID_SKU';
    throw err;
  }

  const cleanSku = sku.trim().toUpperCase();

  // Check product exists
  const checkRes = await query(`SELECT * FROM products WHERE sku = $1`, [cleanSku]);
  if (checkRes.rows.length === 0) {
    const err = new Error(`Product '${cleanSku}' not found.`);
    err.statusCode = 404;
    err.code = 'PRODUCT_NOT_FOUND';
    throw err;
  }

  // Prevent direct tampering of stock/reserved_stock through product updates
  if (updates.stock !== undefined || updates.reserved_stock !== undefined || updates.reservedStock !== undefined) {
    const err = new Error('Inventory stock cannot be modified via catalog product endpoint. Use /api/admin/inventory/adjust.');
    err.statusCode = 400;
    err.code = 'DIRECT_STOCK_MUTATION_PROHIBITED';
    throw err;
  }

  const allowedFields = {
    name: 'name',
    brand: 'brand',
    categoryId: 'category_id',
    collectionId: 'collection_id',
    gender: 'gender',
    shape: 'shape',
    material: 'material',
    basePrice: 'base_price',
    compareAtPrice: 'compare_at_price',
    isActive: 'is_active',
    gallery: 'gallery',
    asset3D: 'asset_3d',
    assetVTO: 'asset_vto'
  };

  const setClauses = [];
  const params = [];

  for (const [key, col] of Object.entries(allowedFields)) {
    const val = updates[key] !== undefined ? updates[key] : (updates[col] !== undefined ? updates[col] : undefined);
    if (val !== undefined) {
      if (key === 'basePrice') {
        const num = parseFloat(val);
        if (isNaN(num) || num < 0) {
          const err = new Error('Base price must be a non-negative number in KES.');
          err.statusCode = 400;
          err.code = 'INVALID_PRICE';
          throw err;
        }
        params.push(num);
      } else if (key === 'compareAtPrice') {
        if (val === null || val === '') {
          params.push(null);
        } else {
          const num = parseFloat(val);
          if (isNaN(num) || num < 0) {
            const err = new Error('Compare-at price must be a non-negative number in KES.');
            err.statusCode = 400;
            err.code = 'INVALID_COMPARE_AT_PRICE';
            throw err;
          }
          params.push(num);
        }
      } else if (key === 'isActive') {
        params.push(Boolean(val));
      } else if (key === 'gallery') {
        params.push(Array.isArray(val) ? val : [String(val)]);
      } else {
        params.push(typeof val === 'string' ? val.trim() : val);
      }
      setClauses.push(`${col} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    const err = new Error('No valid fields provided for update.');
    err.statusCode = 400;
    err.code = 'NO_FIELDS_TO_UPDATE';
    throw err;
  }

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(cleanSku);
  const skuIndex = params.length;

  const updateRes = await query(
    `UPDATE products SET ${setClauses.join(', ')} WHERE sku = $${skuIndex} RETURNING *`,
    params
  );

  const updatedProduct = updateRes.rows[0];

  await logAuditEvent({
    actorId,
    actorRole,
    ipAddress,
    action: 'PRODUCT_UPDATED',
    entity: 'Product',
    entityId: cleanSku,
    metadata: {
      sku: cleanSku,
      updatedFields: Object.keys(updates)
    }
  });

  return updatedProduct;
}

module.exports = {
  getAllProducts,
  getProductBySku,
  getAllCategories,
  getAllCollections,
  getAdminProducts,
  updateProduct
};
