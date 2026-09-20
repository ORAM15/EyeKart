# EyeKart Phase 10: Product Catalog, Optical Configuration & Prescription-Commerce Hardening

## 1. Executive Summary

EyeKart Healthcare Limited (Corner Plaza Building, 4th Floor, Westlands, Nairobi, Kenya) operates a high-integrity optical commerce and omnichannel healthcare platform. Phase 10 establishes a server-authoritative product catalog, optical configuration validation engine, and tamper-proof prescription-commerce workflows.

This hardening guarantees that client applications cannot manipulate pricing, select invalid variants, order incompatible high-index lenses, bypass active product lifecycle constraints, or access other patients' confidential clinical prescriptions.

---

## 2. Server-Authoritative Catalog & Anti-Tampering Architecture

### 2.1 Server-Enforced Pricing
All selling prices, promotional discounts, variant deltas, lens option surcharges, coatings, and VAT (16% inclusive Kenya standard) are calculated authoritatively by `pricingService.js` and `opticalConfigService.js`. Any client-submitted totals, subtotals, or item totals are strictly discarded and logged.

### 2.2 SKU Immutability & Validation
- **SKU Immutability**: Once created, product SKUs are immutable. Any attempt to modify a product SKU via administrative updates is deterministically rejected with `400 SKU_IMMUTABLE`.
- **Arbitrary SKU Rejection**: Any cart addition, quote request, or order creation referencing a non-existent SKU is rejected with `404 PRODUCT_NOT_FOUND`.
- **Direct Stock Mutation Prohibition**: Product inventory (`stock` and `reserved_stock`) cannot be altered via product catalog endpoints; modifications must flow through `/api/admin/inventory/adjust` with audit logging, rejecting direct tampering with `400 DIRECT_STOCK_MUTATION_PROHIBITED`.

---

## 3. Product Lifecycle Management

| Lifecycle State | Active Catalog (`GET /api/products`) | Cart Addition | Checkout Quote | Stock Reservation | Order Placement |
|:---|:---:|:---:|:---:|:---:|:---:|
| **Active** (`is_active = TRUE`) | Included | Allowed | Allowed | Allowed | Allowed |
| **Inactive / Archived** (`is_active = FALSE`) | Excluded | Rejected (`400 PRODUCT_INACTIVE`) | Rejected (`400 PRODUCT_INACTIVE`) | Rejected (`400 PRODUCT_INACTIVE`) | Rejected (`400 PRODUCT_INACTIVE`) |

When a product is deactivated, it is immediately pruned from the canonical customer catalog. Any existing cart items referencing this deactivated SKU are rejected upon quote generation, stock reservation, or order checkout, preventing stale or archived inventory from being purchased. Reactivating the product restores purchasing capabilities seamlessly.

---

## 4. Product Variant Integrity

Variants are validated against the `product_variants` database table.
- Valid variants apply their authoritative `price_delta` to the frame base price.
- If a product defines variants, submitting an unknown or unapproved variant name is rejected with `400 INVALID_VARIANT`.
- Default/Standard frames with no variants defined only accept `Standard` or null variants.

---

## 5. Optical Lens Configuration & Pricing Schedule

> [!IMPORTANT]
> **BUSINESS AUTHORITY & SOURCE OF TRUTH AUDIT NOTICE**:
> - **Frame Base Prices** (e.g. EK-902, EK-804): **VERIFIED BUSINESS FACT / CANONICAL REPOSITORY CATALOG** (`assets/js/catalog-data.js`, `server/src/db/seed.js`).
> - **Optical Options & Surcharges** (Lens types, indices, coatings, and fees): **CONFIGURATION REQUIRED / ENGINEERING DEFAULTS (UNVERIFIED)**.
>   These values originated in development scaffolding (`pricingService.js`, `lens-configurator-engine.js`) and are **NOT** confirmed commercial contracts of EyeKart Healthcare Limited.
>   Formal business-owner commercial sign-off is required before production launch.
> - **Trademark & Efficacy Claims**: Commercial claims (such as "Crizal-Grade" or "Diamond Hard-Coat") are unverified third-party trademarks or marketing labels and have been reclassified as backward-compatibility aliases.

Lens configurations are evaluated against the following engineering configuration defaults:

### 5.1 Lens Types
| Lens Type | Configured Fee (KES) | Source Status | Requires Clinical Prescription | Description |
|:---|:---:|:---:|:---:|:---|
| `Single Vision` | KES 0 | ENGINEERING DEFAULT | Yes | Monofocal corrective lenses |
| `Digital Single Vision` | KES 0 | ENGINEERING DEFAULT | Yes | Monofocal lenses |
| `Blue Defense Plano` | KES 1,800 | CONFIGURATION REQUIRED | No (Non-Rx) | Non-corrective blue-light filtering lenses |
| `Office Near-Variable` | KES 6,500 | CONFIGURATION REQUIRED | Yes | Intermediate & reading occupational lenses |
| `Digital Free-Form Progressive` | KES 12,500 | CONFIGURATION REQUIRED | Yes | Progressive multi-focal lenses |

*Unknown lens types are rejected with `400 INVALID_LENS_TYPE`.*

### 5.2 Lens Indices & High-Index Compatibility
| Lens Index | Configured Fee (KES) | Source Status | Minimum Index | Compatibility Rule |
|:---|:---:|:---:|:---:|:---|
| `1.50` | KES 0 | ENGINEERING DEFAULT | 1.50 | Standard index |
| `1.56` | KES 2,400 | CONFIGURATION REQUIRED | 1.56 | Mid-index |
| `1.60` | KES 4,800 | CONFIGURATION REQUIRED | 1.60 | High-index |
| `1.67` | KES 8,200 | CONFIGURATION REQUIRED | 1.67 | Ultra-thin high-index |
| `1.74` | KES 14,500 | CONFIGURATION REQUIRED | 1.74 | Ultra-high index; requires `supportsHighIndex = true` on frame |

- **High-Index 1.74 Compatibility Gate**: High-index 1.74 requires specific frame bevel depth. If a user selects 1.74 on a frame where `prescription_compatibility.supportsHighIndex !== true`, the request is rejected with `400 INCOMPATIBLE_HIGH_INDEX`.

### 5.3 Optical Coatings
| Coating Name | Configured Fee (KES) | Source Status | Feature Set |
|:---|:---:|:---:|:---|
| `Anti-Glare AR` | KES 1,500 | CONFIGURATION REQUIRED | Anti-reflective coating |
| `BlueShield 420nm` | KES 1,800 | CONFIGURATION REQUIRED | Blue-light filter |
| `BlueShield UV420 High-Energy Filter` | KES 1,800 | CONFIGURATION REQUIRED | UV and blue-light filter |
| `Crizal-Grade Hydrophobic Anti-Glare` | KES 1,500 | UNVERIFIED ALIAS | Hydrophobic anti-reflective coating |
| `Diamond Hard-Coat Scratch Armour` | KES 1,400 | UNVERIFIED ALIAS | Scratch-resistant hard coating |

*Unknown coating names are rejected with `400 INVALID_LENS_COATING`.*

---

## 6. Refractive Power Range Compatibility Validation

> [!IMPORTANT]
> **CLINICAL VALIDATION NOTICE**:
> The `sphMin`, `sphMax`, and `cylMax` values defined on frames in the catalog are **ENGINEERING VALIDATION PARAMETERS (SCAFFOLDING)** designed to prevent mechanical edge-mounting errors. They are **NOT** verified clinical safety thresholds approved by licensed Kenyan optometrists.

Frames in the EyeKart catalog specify optical boundaries in `prescription_compatibility`:
- `sphMin`: Minimum allowable spherical refractive power (e.g. -10.00 D)
- `sphMax`: Maximum allowable spherical refractive power (e.g. +6.00 D)
- `cylMax`: Maximum allowable cylindrical astigmatism power (e.g. -4.00 D)

When submitting lens configurations with prescription values or checking out with a linked prescription, powers are evaluated:
$$\text{sphMin} \le \text{od\_sph}, \text{os\_sph} \le \text{sphMax}$$
$$|\text{od\_cyl}|, |\text{os\_cyl}| \le |\text{cylMax}|$$

Any power exceeding the frame's boundary is rejected with `400 REFRACTIVE_POWER_OUT_OF_RANGE`.

---

## 7. Prescription-Commerce Integration & Customer Ownership (IDOR)

### 7.1 Cross-Customer IDOR Protection
When an order references a `prescriptionId` or `prescriptionSnapshot`:
- The system authoritatively queries `prescriptions WHERE id = $1`.
- If the prescription belongs to a different customer and the caller is not an `ADMIN`, the order creation is blocked with `403 FORBIDDEN_PRESCRIPTION_ACCESS`.

### 7.2 Prescription Lifecycle State Enforcement
- **REJECTED Prescriptions**: Attempting to checkout with a rejected prescription is blocked with `400 PRESCRIPTION_REJECTED` ("Cannot checkout with a rejected prescription. Please submit a valid prescription or book an eye test.").
- **ARCHIVED Prescriptions**: Attempting to checkout with an expired/archived prescription is blocked with `400 PRESCRIPTION_ARCHIVED`.
- **APPROVED Prescriptions**: Immediate clearance into fulfillment with `prescription_status = 'APPROVED'`.
- **Pending / Unreviewed Prescriptions**: Order is created with `prescription_status = 'PENDING_OPTOMETRIST_REVIEW'` and routed to clinical review.

---

## 8. Historical Snapshot Immutability

To guarantee legal, financial, and clinical auditability:
1. **Clinical Prescription Snapshot**: When an order is placed, an immutable `prescription_snapshot` is stored in `orders.prescription_snapshot`, capturing the exact revision, patient name, doctor, clinic, powers (SPH, CYL, AXIS, ADD), and PD at the instant of purchase. Subsequent updates or revisions to the prescription table never alter existing historical orders.
2. **Product Snapshot**: Every item in `order_items` stores an immutable `product_snapshot` JSONB capturing SKU, title, brand, dimensions, material, shape, base price, and prescription compatibility. Future catalog edits do not mutate completed or past orders.

---

## 9. Private Object Storage for Medical Documents

Prescription document uploads are handled by `server/src/routes/storage.js` and `server/src/services/storage/`:
- Upload intents validate MIME types (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`) and limit file size to 10MB.
- Document paths and URLs are unguessable UUID-based keys.
- All file retrieval and signed download URL generation require authenticated sessions.
- Strict IDOR controls ensure non-clinical customers cannot view or stream documents belonging to other users (`403 IDOR_FORBIDDEN`).

---

## 10. Concurrency Controls & Row Locking

Limited-edition frames and high-traffic releases are protected against race conditions and overselling:
- In `inventoryService.reserveStock`, product rows are locked using:
  ```sql
  SELECT sku, name, stock, is_active, COALESCE(reserved_stock, 0) AS reserved_stock
  FROM products WHERE sku = $1 FOR UPDATE;
  ```
- Concurrent checkout requests for the final available stock unit are serialized. Exactly one checkout acquires the lock, reserves the item, and commits. Competing concurrent requests fail deterministically with `400 INSUFFICIENT_STOCK`.
- Database check constraints (`chk_products_stock_nonneg`, `chk_products_reserved_stock`, `chk_inv_res_qty_pos`, `chk_cart_items_qty`, `chk_order_items_qty`, `chk_order_items_total_price`) guarantee database consistency.

---

## 11. Checkout Idempotency Persistence

`orderService.createOrderFromQuote` integrates with `idempotencyService.js`:
- Supports both `idempotency-key` and `x-idempotency-key` HTTP headers.
- Checks existing idempotency keys before transaction initiation.
- Persists the committed order representation via `saveIdempotency(...)` immediately after `COMMIT`.
- Retries return the exact cached order with status 201/200 without creating duplicate orders or double-reserving inventory.

---

## 12. Verification & Regression Coverage

The complete verification suite (`scratch/verify_phase10_catalog_optical_commerce.js`) exercises 48 assertions covering:
- 41 Phase 10 specific assertions (catalog retrieval, anti-tampering, SKU immutability, variant validation, optical pricing, lens compatibility, refractive power limits, prescription IDOR, rejection/archival gates, private documents, row locking, and idempotency).
- 7 Full Project Regression Suites (Actual Baseline Counts):
  - Phase 4: Payment Architecture Regression (18/18 assertions)
  - Phase 5: Order & Fulfillment Regression (21/21 assertions)
  - Phase 6: Account & Prescription Lifecycle Regression (76/76 assertions)
  - Phase 7: Admin & Inventory Operations Regression (39/39 assertions)
  - Phase 8: Notification & Event Delivery Regression (28/28 assertions)
  - Phase 9: Appointment & Clinical Operations Regression (44/44 assertions)
  - Premium 3D / VTO Experience Regression (18/18 assertions)
