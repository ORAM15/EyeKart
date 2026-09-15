# EyeKart Phase 6.2 — Security & IDOR Safeguards Specification
## Authorization, Idempotency, and Pricing Integrity (Version 1.0)

---

## 1. Threat Model & Mitigations

### 1.1 Insecure Direct Object References (IDOR)
- **Threat:** A malicious customer tries to inspect or cancel another customer's order by changing the URL/payload order ID (`GET /api/orders/:id` or `POST /api/orders/:id/cancel`).
- **Mitigation:**
  - `getOrderById()` compares `order.user_id` against `req.user.id`.
  - If they do not match AND `req.user.role !== 'ADMIN'`, the request is aborted with HTTP 403 (`UNAUTHORIZED_ORDER_ACCESS`).
  - Cross-user cart access is similarly blocked (`FORBIDDEN_CART_ACCESS`).

### 1.2 Price & Total Manipulation
- **Threat:** Malicious client modifies `totalPrice`, `subtotal`, `framePrice`, or `vat` in the POST body to purchase expensive optical frames for KSh 1.
- **Mitigation:**
  - Client-supplied prices and totals are completely discarded.
  - The server pulls `base_price` and variant deltas directly from PostgreSQL `products` and `product_variants`.
  - Lens indices, lens types, and coatings are priced strictly from authoritative server configuration tables.
  - VAT is computed at 16% on the server.

### 1.3 Quantity & Input Manipulation
- **Threat:** Client sends negative quantities (`qty: -5`), non-integers, or zero to manipulate cart totals.
- **Mitigation:**
  - Server strictly enforces `INTEGER` quantities between 1 and 100.
  - Non-existent SKUs are rejected with HTTP 400 (`PRODUCT_NOT_FOUND`).

### 1.4 Arbitrary Order Status Mutation
- **Threat:** Client attempts to set their own order to `PAID` or `COMPLETED` by sending a direct `PATCH /api/orders/:id/status`.
- **Mitigation:**
  - Status updates are protected by `requireRole(['ADMIN', 'OPTOMETRIST', 'STORE_STAFF'])`.
  - Ordinary customers receive HTTP 403 Forbidden.

### 1.5 Duplicate Requests & Double-Clicking
- **Threat:** Rapid double-clicks on "Place Order" or network retries create two distinct orders or duplicate payment charges.
- **Mitigation:**
  - Orders and payment endpoints check the `Idempotency-Key` header.
  - If the key exists and is within its 24-hour TTL, the cached response is returned without creating duplicate database rows.

### 1.6 Sensitive Data Sanitization
- **Threat:** Passwords, session tokens, or API credentials leak into responses or audit logs.
- **Mitigation:**
  - Passwords hashed using `crypto.scrypt`.
  - Session tokens stored as SHA-256 digests.
  - Password hashes, database credentials, and session tokens are stripped from all API outputs and scrubbed from audit metadata.
