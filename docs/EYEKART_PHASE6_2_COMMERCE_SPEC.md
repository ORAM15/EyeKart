# EyeKart Phase 6.2 — Production Commerce Specification
## Cart, Checkout, and Order Lifecycle Foundation (Version 1.0)

---

## 1. Scope & System Authority

Phase 6.2 transitions the EyeKart commerce journey (`Product → Cart → Checkout → Order → Payment Attempt → Payment State → Order Confirmation`) from client-side simulation to a **server-authoritative commerce backend**.

```
   ┌─────────────────────────────────────────────────────────────┐
   │                     UNTRESTED CLIENT                        │
   │  Stitch UI • LocalStorage • Client Totals Discarded         │
   └──────────────────────────────┬──────────────────────────────┘
                                  │ Intent Payload
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                 SERVER-AUTHORITATIVE COMMERCE               │
   │  Fastify API • PostgreSQL 18.4 • scrypt Auth                │
   │  - Validates SKU & Variant existence                        │
   │  - Enforces positive integer quantities (1 <= qty <= 100)  │
   │  - Authoritative Pricing: Base Frame + Lens Add-ons + VAT   │
   │  - Discards client-submitted subtotal, total, and VAT       │
   │  - Immutable Order Snapshots                                │
   │  - Payment State Machine & Idempotency Protection           │
   └─────────────────────────────────────────────────────────────┘
```

---

## 2. Server-Authoritative Entities

### 2.1 Shopping Cart & Cart Items
- **Cart (`carts`)**:
  - Bound to authenticated `user_id` or tracked via `session_id`.
  - State: `ACTIVE`, `CONVERTED`, `MERGED`, `ABANDONED`.
  - Only one active cart per authenticated user at any time.
- **Cart Items (`cart_items`)**:
  - Requires foreign key to canonical `products(sku)`.
  - Validates active variant attributes.
  - Server recalculates line-item prices (`framePrice + lensPrice * qty`).

### 2.2 Checkout Quotes
- Quotes are generated via `POST /api/checkout/quote`.
- Captures:
  - `subtotal`: Sum of authoritative item prices.
  - `vat`: Standard Kenya 16% VAT (`subtotal * 0.16`).
  - `deliveryFee`: Free Nairobi standard courier (`0 KES`) or priority express (`500 KES`).
  - `total`: Authoritative grand total (`subtotal + vat + deliveryFee`).
  - `quoteId`: Unique time-stamped quote token with 15-minute TTL.

### 2.3 Immutable Order Snapshots
- Orders created via `POST /api/orders` from a valid checkout quote.
- Freezes immutable point-in-time commerce data into `order_items`:
  - `sku`, `name`, `variant`, `qty`.
  - `frame_price`, `lens_price`, `total_price`.
  - Complete lens configuration (lens type, optical index, coatings, prescription mode).
  - Product specifications snapshot (material, dimensions, category, image).
- Future catalog updates or price changes will **never** alter existing order history.

---

## 3. Order & Payment Consistency

1. **Order Creation:** Orders start in `CREATED` status with `payment_status = 'NOT_STARTED'`.
2. **Payment Attempt:** When payment is initiated, order moves to `PAYMENT_PENDING` and payment attempt to `INITIATED`.
3. **Payment Success:** On payment `SUCCESS`, order transitions to `PAID` (or `PROCESSING` if frame-only/pre-verified, or `PRESCRIPTION_REVIEW` if clinical review is required).
4. **Payment Failure:** If payment `FAILED` or was `CANCELLED`, order remains `PAYMENT_PENDING`, payment status is set to `FAILED`, and cart items remain preserved.
5. **Idempotency:** Repeated requests with the same `Idempotency-Key` return the cached response without creating duplicate orders or duplicate payment attempts.

---

## 4. API Endpoints

| Method | Route | Auth | Purpose |
|---|---|:---:|---|
| `GET` | `/api/cart` | Optional | Fetch current authoritative cart and calculated totals |
| `POST` | `/api/cart/items` | Optional | Add item (validates SKU, variant, quantity) |
| `PUT` | `/api/cart/items/:id` | Optional | Update quantity (removes if qty <= 0) |
| `DELETE` | `/api/cart/items/:id` | Optional | Remove item from cart |
| `DELETE` | `/api/cart` | Optional | Clear active cart |
| `POST` | `/api/cart/merge` | Required | Controlled merge of guest items into customer cart |
| `POST` | `/api/checkout/quote` | Optional | Compute server-authoritative checkout quote with locked totals |
| `POST` | `/api/orders` | Required | Create immutable order from quote (supports Idempotency-Key) |
| `GET` | `/api/orders` | Required | List authenticated user's orders |
| `GET` | `/api/orders/:id` | Required | Get order details with IDOR protection |
| `POST` | `/api/orders/:id/cancel` | Required | Cancel order (enforces legal state transitions) |
| `POST` | `/api/payments/demo/initiate` | Required | Initiate simulated STK push (deterministic outcome) |
| `POST` | `/api/payments/demo/transition` | Required | Transition payment state within legal state machine |
