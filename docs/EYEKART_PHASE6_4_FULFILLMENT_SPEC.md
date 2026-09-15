# EyeKart — Phase 6.4: Production Fulfillment & Order Tracking Specification
**Version:** 1.0  
**Authority:** Operational Commerce Backend  
**Classification:** Operational & Delivery Architecture (Simulated Logistics)

---

## 1. Operational Overview & Disclaimers

> [!CAUTION]
> **Internal Operational Architecture — Simulated Logistics Only**:
> 1. EyeKart coordinates operational order assembly, laboratory edging workflows, and customer delivery tracking internally.
> 2. This platform **DOES NOT** integrate live external courier APIs (e.g. Fargo Courier, G4S, DHL) or live telematics.
> 3. Courier tracking numbers (`EK-TRK-XXXXX`), vehicle registration (`Electric Moto Transporter #EK-E12`), and driver dispatches are explicitly designated **DEMO / SIMULATED**.
> 4. Physical delivery SLAs, courier agreements, and warehouse dispatch schedules are marked:
>    `BUSINESS CONFIRMATION REQUIRED`.

---

## 2. Server-Authoritative Fulfillment Data Models

### 2.1 `fulfillments`
Primary relational table capturing the operational state of order fulfillment:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE`
- `status VARCHAR(32) NOT NULL DEFAULT 'PENDING'`  
  *Allowed values:* `PENDING`, `ELIGIBLE`, `PROCESSING`, `PRODUCTION`, `QUALITY_CHECK`, `PACKED`, `DISPATCHED`, `DELIVERED`, `COMPLETED`, `CANCELLED`
- `tracking_number VARCHAR(64) UNIQUE NOT NULL`
- `carrier VARCHAR(64) NOT NULL DEFAULT 'Westlands Central Lab Express Dispatch (DEMO)'`
- `rider_name VARCHAR(128) DEFAULT 'Westlands Central Lab Dispatch'`
- `rider_phone VARCHAR(32) DEFAULT '+254 700 918 274'`
- `vehicle_reg VARCHAR(32) DEFAULT 'Electric Moto Transporter #EK-E12'`
- `shipping_address TEXT NOT NULL`
- `notes TEXT`
- `dispatched_at TIMESTAMPTZ`
- `delivered_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
- `updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
- `CONSTRAINT uq_order_fulfillment UNIQUE (order_id)`

### 2.2 `fulfillment_events`
Append-only immutable operational timeline:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `fulfillment_id UUID NOT NULL REFERENCES fulfillments(id) ON DELETE CASCADE`
- `from_status VARCHAR(32)`
- `to_status VARCHAR(32) NOT NULL`
- `stage_title VARCHAR(128) NOT NULL`
- `stage_number INTEGER NOT NULL DEFAULT 1`
- `actor_id UUID REFERENCES users(id) ON DELETE SET NULL`
- `actor_role VARCHAR(32) NOT NULL`
- `actor_name VARCHAR(128)`
- `note TEXT`
- `metadata JSONB DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`

### 2.3 `inventory_reservations`
Atomic reservation tracking:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `order_id UUID REFERENCES orders(id) ON DELETE SET NULL`
- `sku VARCHAR(64) NOT NULL REFERENCES products(sku)`
- `qty INTEGER NOT NULL CHECK (qty > 0)`
- `status VARCHAR(32) NOT NULL DEFAULT 'RESERVED'` (`RESERVED`, `ALLOCATED`, `RELEASED`)
- `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
- `updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`

---

## 3. Strict Fulfillment Gating Enforcement

Before an order can have a fulfillment created or be released into production (`ELIGIBLE` / `PROCESSING`), the server strictly verifies two gates:

### 3.1 Payment Gate
- The order must have `payment_status === 'SUCCESS'` or `status === 'PAID'`.
- Unpaid orders (`PAYMENT_PENDING`, `FAILED`, `INITIATED`) cannot bypass fulfillment rules. Attempts return HTTP 400 (`UNPAID_ORDER_FULFILLMENT_BLOCKED`).

### 3.2 Optical Clinical Gate
- **Frame-Only Orders**: Automatically bypass the clinical gate (`prescriptionRequired: false`, `status: ELIGIBLE_FRAME_ONLY`).
- **Custom Lens Orders**: Strictly require `prescription_status === 'APPROVED'`. If pending, in clarification, or rejected, fulfillment creation is blocked with HTTP 400 (`OPTICAL_GATE_BLOCKED`).

---

## 4. Operational API Surface

| Method | Endpoint | Auth / Role | Purpose |
|---|---|---|---|
| `GET` | `/api/orders/:id/fulfillment` | `CUSTOMER` (Own) / Staff | Retrieve full fulfillment record |
| `GET` | `/api/orders/:id/tracking` | `CUSTOMER` (Own) / Staff | Retrieve customer tracking timeline & courier details |
| `POST` | `/api/fulfillments` | `STORE_STAFF`, `LAB_TECH`, `ADMIN` | Initialize fulfillment for an eligible order |
| `POST` | `/api/fulfillments/:id/transition` | `STORE_STAFF`, `LAB_TECH`, `ADMIN` | Advance state machine to next operational stage |
| `GET` | `/api/products/:sku/inventory` | Public / Auth | Query server-authoritative stock metrics |
| `PATCH` | `/api/fulfillments/:id` | Forbidden | Direct status modification by client is blocked (403) |
