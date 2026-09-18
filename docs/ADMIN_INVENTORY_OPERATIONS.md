# EyeKart Phase 7: Admin, Inventory & Operational Control Hardening

**EyeKart Healthcare Limited — Nairobi, Kenya**  
**Customer-facing Atelier & Central Laboratory:** Corner Plaza Building, 4th Floor, Westlands, Nairobi, Kenya  
**Customer-facing Support:** Eyekarthealthcare@gmail.com  
**Engineering Checkpoint:** Phase 7 Implementation Complete

---

## 1. Executive Summary & Operational Scope

Phase 7 hardens the internal operations, catalog governance, and inventory control plane of the EyeKart healthcare and optical-commerce platform. It ensures that administrative actors, store operators, and optical technicians can safely manage products, physical inventory, and customer orders without data corruption, overselling, unauthorized privilege escalation, or leakage of sensitive authentication credentials.

### Core Hardening Pillars
1. **Administrative RBAC & Privilege Lockdown:** Universal enforcement of the authoritative `ADMIN` role on `/api/admin/*` endpoints. Client-side role claims and non-admin identities (`CUSTOMER`, `STAFF`, `STORE_STAFF`, `LAB_TECH`, `OPTOMETRIST`) are rejected with `403 Forbidden`.
2. **Product Catalog Operational Integrity:** Guaranteed SKU immutability, server-authoritative price validation in Kenyan Shillings ($\text{KES} \ge 0$), and strict prevention of mass assignment. Direct mutation of inventory counts via product endpoints is prohibited.
3. **Inventory Hardening & Stock Adjustment:** Atomic row-level locking (`SELECT ... FOR UPDATE`), duplicate reservation idempotency, mandatory operational audit reasons ($\ge 3$ characters), and strict invariant checks prohibiting negative stock or stock falling below active reservations.
4. **Database-Level Invariant Constraints:** PostgreSQL check constraints enforcing non-negative stock (`chk_products_stock_nonneg`), non-negative reservations (`chk_products_reserved_stock`), and positive reservation quantities (`chk_inv_res_qty_pos`).
5. **Order State Control & Clinical Gating Integration:** State machine validation with terminal state immutability. Orders cannot enter `PROCESSING` or `COMPLETED` states without verified payment and approved optical prescriptions.
6. **Fulfillment Integrity:** Inactive orders (cancelled or expired) are strictly blocked from entering fulfillment workflows (`INACTIVE_ORDER_FULFILLMENT_BLOCKED`).
7. **Admin Visibility & Data Minimization:** Bounded pagination ($1 \le \text{limit} \le 100$) across order and customer queries. Sensitive authentication credentials (`password_hash`, reset tokens, session salts) are omitted from responses.

---

## 2. Admin RBAC & Role Enforcement Matrix

All administrative operations are mounted under `/api/admin/*` and guarded by `requireRole('ADMIN')` middleware.

| Endpoint | Method | Permitted Roles | Non-Admin Response | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/api/admin/audit-logs` | `GET` | `ADMIN` | `403 Forbidden` | Paginated operational audit logs |
| `/api/admin/orders` | `GET` | `ADMIN` | `403 Forbidden` | Platform-wide orders overview with filters |
| `/api/admin/orders/:id` | `GET` | `ADMIN` | `403 Forbidden` | Detailed order timeline, fulfillments & events |
| `/api/admin/orders/:id/status` | `PATCH` | `ADMIN` | `403 Forbidden` | Operational status advancement with optical/payment gating |
| `/api/admin/orders/:id/cancel` | `POST` | `ADMIN` | `403 Forbidden` | Administrative order cancellation with inventory release |
| `/api/admin/products` | `GET` | `ADMIN` | `403 Forbidden` | Full product catalog with stock & reservation metrics |
| `/api/admin/products/:sku` | `PATCH` | `ADMIN` | `403 Forbidden` | Safe catalog updates (pricing, active state, descriptions) |
| `/api/admin/inventory/adjust` | `POST` | `ADMIN` | `403 Forbidden` | Explicit stock adjustment with mandatory audit reason |
| `/api/admin/customers` | `GET` | `ADMIN` | `403 Forbidden` | Sanitized customer accounts listing (no password hashes) |

### Anti-Spoofing Protections
- Client-supplied headers (`x-user-role`, `role`, `x-role`) are discarded.
- The user's role is loaded directly from the database during session resolution in `resolveSession()`.
- Unauthenticated requests receive `401 Unauthorized`; authenticated non-admin tokens receive `403 Forbidden`.

---

## 3. Product Catalog Operational Integrity

Catalog management via `/api/admin/products/:sku` enforces data integrity rules to protect canonical pricing and product definitions:

- **SKU Immutability:** The SKU parameter in the URL route is the sole authoritative key. The request body cannot mutate or re-key an existing product's SKU.
- **Price Validation:** `basePrice` must be a valid non-negative number in KES (`basePrice >= 0`). Sub-zero pricing is rejected with `400 INVALID_PRICE`.
- **Compare-At Price Validation:** If provided, `compareAtPrice` must be $\ge 0$.
- **Mass-Assignment Guard:** Attempting to modify `stock`, `reserved_stock`, or `reservedStock` via the product catalog patch route is rejected with `400 DIRECT_STOCK_MUTATION_PROHIBITED`. Inventory changes must route through `/api/admin/inventory/adjust` or the checkout reservation pipeline.
- **Audit Logging:** Every catalog update logs a `PRODUCT_UPDATED` record in `audit_logs` capturing actor identity, IP, SKU, and modified fields.

---

## 4. Inventory Hardening & Stock Adjustments

### Stock Adjustment Endpoint (`POST /api/admin/inventory/adjust`)
Operators can adjust inventory using either a relative `delta` or an absolute `newStock` target:

```json
{
  "sku": "EK-001",
  "delta": 5,
  "reason": "Routine atelier inventory restock from Nairobi central laboratory"
}
```

### Safety Invariants & Checks
1. **Mandatory Operational Rationale:** `reason` must be a string of at least 3 characters (`400 MISSING_ADJUSTMENT_REASON`).
2. **Integer Values:** `delta` and `newStock` must be valid integers (`400 INVALID_STOCK_DELTA` / `400 INVALID_STOCK_VALUE`).
3. **Negative Stock Prohibited:** Resulting stock cannot be negative (`400 NEGATIVE_STOCK_PROHIBITED`).
4. **Reserved Stock Protection:** Resulting stock cannot fall below active customer reservations (`400 STOCK_BELOW_RESERVED_PROHIBITED`). If 15 units are currently reserved for pending orders, adjusting total stock below 15 is rejected to prevent overselling paid/pending commitments.
5. **Row-Level Serialization:** Every adjustment executes inside a PostgreSQL transaction using `SELECT ... FROM products WHERE sku = $1 FOR UPDATE`, serializing concurrent adjustments.
6. **Audit Trail:** Adjustments generate `INVENTORY_ADJUSTED` audit logs with previous stock, new stock, delta, and the operator's operational reason.

### PostgreSQL Check Constraints
The database schema enforces table-level invariants:
```sql
ALTER TABLE products ADD CONSTRAINT chk_products_reserved_stock CHECK (reserved_stock >= 0);
ALTER TABLE products ADD CONSTRAINT chk_products_stock_nonneg CHECK (stock >= 0);
ALTER TABLE inventory_reservations ADD CONSTRAINT chk_inv_res_qty_pos CHECK (qty > 0);
```

---

## 5. Concurrency & Overselling Prevention

### Row-Level Locking & Reservation Idempotency
During checkout, `reserveStock()` locks target products with `SELECT ... FOR UPDATE`:
```sql
SELECT sku, stock, COALESCE(reserved_stock, 0) AS reserved_stock 
FROM products 
WHERE sku = $1 
FOR UPDATE;
```
- Available stock is computed as $\text{available} = \text{stock} - \text{reserved\_stock}$.
- If $\text{available} < \text{requested\_qty}$, the transaction rolls back and returns `409 INSUFFICIENT_STOCK`.
- **Duplicate Reservation Idempotency:** If a reservation record for the same `orderId` + `sku` already exists with status `RESERVED`, the service returns the existing reservation without incrementing `reserved_stock` a second time.
- **Concurrent Contention:** When two concurrent requests compete for the last available unit of inventory, row-level locking guarantees that exactly one transaction succeeds while the second fails gracefully with `409 INSUFFICIENT_STOCK`.

---

## 6. Order Operational State Control & Gating

### Legal Order State Machine
```
CREATED --------> PAYMENT_PENDING ------> PAID -------> PROCESSING ------> COMPLETED
   |                     |                  |               |
   +----> CANCELLED <----+                  +---> CANCELLED +---> CANCELLED
   |                     |
   +----> EXPIRED <------+
```

### Transition Gating Rules
- **Terminal State Immutability:** Orders in `COMPLETED`, `CANCELLED`, or `EXPIRED` are immutable. Any attempt to transition out of a terminal state is rejected with `400 TERMINAL_STATE_IMMUTABLE`.
- **Payment Gate on Processing:** Orders cannot transition to `PROCESSING` unless paid (`payment_status === 'SUCCESS'` or `status === 'PAID'`). Unpaid attempts return `400 UNPAID_ORDER_PROCESSING_BLOCKED`.
- **Optical Gate on Processing:** If an order requires prescription review (`requires_prescription_review === true`), it cannot enter `PROCESSING` unless `prescription_status === 'APPROVED'`. Unapproved attempts return `400 OPTICAL_GATE_BLOCKED`. Frame-only (plano) orders (`requires_prescription_review === false`) bypass the clinical review requirement.
- **Payment & Optical Gate on Completion:** Transitioning to `COMPLETED` requires verified payment and prescription approval (if applicable).
- **Automatic Stock Allocation on Completion:** Moving an order to `COMPLETED` automatically calls `allocateStock()` to convert `RESERVED` allocations into `ALLOCATED` physical inventory.
- **Stock Release on Cancellation:** Administrative cancellation via `POST /api/admin/orders/:id/cancel` or updating status to `CANCELLED` releases reservations back to available inventory and records an audit log.

---

## 7. Fulfillment Integrity & Inactive Order Blocking

Fulfillment operations in `fulfillmentService.js` integrate tightly with the order state machine:
- **Inactive Order Gate:** `createFulfillment()` checks order status. If an order is `CANCELLED` or `EXPIRED`, initialization is rejected with `400 INACTIVE_ORDER_FULFILLMENT_BLOCKED`.
- **Transition Gate:** `transitionFulfillment()` verifies that the underlying order has not been cancelled or expired prior to advancing stages.

---

## 8. Admin Visibility & Data Minimization

### Order Listing (`GET /api/admin/orders`)
- **Bounded Pagination:** Request parameter `limit` is clamped to $[1, 100]$. Excessive limits (e.g. `limit=500`) are clamped to 100.
- **Status Filtering:** Validated against `ORDER_STATES`. Invalid filters return `400 INVALID_ORDER_STATUS_FILTER`.
- **Customer Snapshot Sanitization:** Returns customer names, email, and phone numbers while strictly omitting authentication credentials.

### Customer Listing (`GET /api/admin/customers`)
- **Data Minimization:** Explicitly selects only safe operational fields:
  ```sql
  SELECT id, email, full_name, phone, role, is_active, created_at, updated_at FROM users ...
  ```
- **Zero Credential Exposure:** Columns `password_hash`, reset tokens, and session token hashes are never queried or transmitted over the wire.

---

## 9. Verification & Test Evidence

The Phase 7 verification suite (`scratch/verify_phase7_admin_inventory_operations.js`) executes 39 automated assertions covering all operational and security boundaries:

```
============================================================
EYEKART PHASE 7: ADMIN, INVENTORY & OPERATIONAL CONTROL VERIFICATION
============================================================

  [PASS] Test users seeded across roles

--- SECTION 1: ADMIN AUTHORIZATION & RBAC LOCKDOWN ---
  [PASS] Unauthenticated access to /api/admin/orders returns 401
  [PASS] Customer role access to /api/admin/orders returns 403
  [PASS] Staff role access to /api/admin/orders returns 403
  [PASS] Store Staff role access to /api/admin/orders returns 403
  [PASS] Lab Tech role access to /api/admin/orders returns 403
  [PASS] Optometrist role access to /api/admin/orders returns 403
  [PASS] Client role claim tampering rejected (database session role enforced)
  [PASS] Admin access to /api/admin/orders returns 200 with orders list

--- SECTION 2: CATALOG & PRODUCT OPERATIONAL INTEGRITY ---
  [PASS] Admin can list products with operational inventory metrics
  [PASS] Admin product list includes stock and reservedStock metrics
  [PASS] Admin successfully updates product basePrice in KES
  [PASS] Negative basePrice rejected with 400 INVALID_PRICE
  [PASS] Direct stock mutation in catalog patch rejected
  [PASS] PRODUCT_UPDATED event recorded in audit_logs

--- SECTION 3: INVENTORY CONTROLS & STOCK ADJUSTMENT ---
  [PASS] Non-admin forbidden from stock adjustment endpoint
  [PASS] Adjustment without reason rejected with 400 MISSING_ADJUSTMENT_REASON
  [PASS] Adjustment with short reason (< 3 chars) rejected
  [PASS] Adjustment to negative stock rejected with 400 NEGATIVE_STOCK_PROHIBITED
  [PASS] Adjustment below reserved_stock rejected with 400 STOCK_BELOW_RESERVED_PROHIBITED
  [PASS] Valid stock adjustment succeeds (20 -> 25)
  [PASS] INVENTORY_ADJUSTED audit log recorded with full operational rationale

--- SECTION 4: DATABASE CHECK CONSTRAINTS ---
  [PASS] Database enforces chk_products_stock_nonneg constraint
  [PASS] Database enforces chk_products_reserved_stock constraint

--- SECTION 5: CONCURRENCY & OVERSELLING PREVENTION ---
  [PASS] Row-level locking guarantees exactly 1 reservation succeeds and 1 fails under concurrency
  [PASS] Rejected concurrent reservation received 409 INSUFFICIENT_STOCK
  [PASS] Duplicate reservation is idempotent and does not double-reserve stock

--- SECTION 6: ORDER OPERATIONAL STATE CONTROL & GATING ---
  [PASS] Illegal skip from CREATED to PROCESSING blocked
  [PASS] Illegal move from PAYMENT_PENDING to PROCESSING blocked
  [PASS] Optical order blocked from PROCESSING without approved prescription
  [PASS] Optical order with approved prescription successfully enters PROCESSING
  [PASS] Order successfully completes
  [PASS] Terminal COMPLETED state is strictly immutable

--- SECTION 7: ADMINISTRATIVE ORDER CANCELLATION & FULFILLMENT GATING ---
  [PASS] Admin successfully cancelled order
  [PASS] createFulfillment strictly blocks cancelled orders with 400 INACTIVE_ORDER_FULFILLMENT_BLOCKED

--- SECTION 8: ADMIN VISIBILITY & DATA MINIMIZATION ---
  [PASS] Admin orders list clamps excessive limits to maximum 100
  [PASS] Admin can list customer accounts
  [PASS] Customer account list strictly omits password_hash and security credentials
  [PASS] Admin order detail includes linked fulfillments and timeline events

============================================================
PHASE 7 VERIFICATION COMPLETE: 39 PASSED, 0 FAILED
============================================================
```

### Full Regression Test Summary
- **Phase 7 Admin & Inventory Suite:** 39/39 Passed (`verify_phase7_admin_inventory_operations.js`)
- **Phase 6 Accounts & Prescriptions Suite:** 76/76 Passed (`verify_phase6_account_prescription.js`)
- **Phase 5 Orders & Fulfillment Suite:** 21/21 Passed (`verify_phase5_order_fulfillment.js`)
- **Phase 4 Payment Architecture Suite:** 18/18 Passed (`verify_phase4_payment_architecture.js`)
- **Premium 3D WebGL & VTO Suite:** 18/18 Passed (`verify_premium_3d_experience.js`)
- **Total Assertions Verified Across System:** **172 Passed, 0 Failed, 0 Regressions.**
