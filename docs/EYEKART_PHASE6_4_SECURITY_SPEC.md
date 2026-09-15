# EyeKart — Phase 6.4: Operational Security, Inventory Integrity & RBAC Specification
**Version:** 1.0  
**Domain:** Security Architecture / Data Protection / Concurrency Integrity  

---

## 1. Threat Model & Concurrency Protection

Phase 6.4 introduces operational and scheduling state. Key threat vectors and mitigations include:

### 1.1 Insecure Direct Object References (IDOR)
- **Threat**: Customer A views Customer B's fulfillment tracking or appointment dossier by guessing or iterating UUIDs.
- **Mitigation**: `getFulfillmentByOrderId` and `getAppointmentById` compare the entity's `user_id` against the authenticated session `req.user.id`. Any mismatch for customer accounts yields HTTP 403 Forbidden (`FORBIDDEN_TRACKING_ACCESS` / `FORBIDDEN_APPOINTMENT_ACCESS`).

### 1.2 Race Conditions & Double-Booking
- **Threat**: Two customers simultaneously click to book the same appointment slot, resulting in a dual booking.
- **Mitigation**: Slot booking uses PostgreSQL row-level locks (`SELECT ... FOR UPDATE`). The first transaction claims the slot and marks `is_available = FALSE`; the second transaction encounters the lock, detects availability has changed, and returns HTTP 409 Conflict (`SLOT_ALREADY_BOOKED`).

### 1.3 Inventory Overselling & Negative Stock
- **Threat**: Rapid concurrent checkouts exhaust stock, causing negative inventory.
- **Mitigation**: `reserveStock` locks product rows with `SELECT ... FOR UPDATE`. The database enforces `CHECK (reserved_stock >= 0 AND stock >= reserved_stock)`. Transactions exceeding available stock immediately fail with HTTP 400 (`INSUFFICIENT_STOCK`).

### 1.4 Client-Side Operational Spoofing
- **Threat**: A customer sends a request attempting to assign themselves an appointment practitioner or force `status = 'DELIVERED'` on an order.
- **Mitigation**:
  - `practitioner_name` is strictly derived from the clinic's authoritative slot record. Client attempts to assign practitioner identity are rejected with HTTP 403 (`FORBIDDEN_PRACTITIONER_ASSIGNMENT`).
  - Fulfillment transitions require server-verified roles (`STORE_STAFF`, `LAB_TECH`, `ADMIN`). Customer requests to mutate fulfillment return HTTP 403 (`FORBIDDEN_OPERATIONAL_ACTION`).

---

## 2. Audit Trail & Secret Scrubbing

All operational actions emit append-only entries into `audit_logs`:
- `FULFILLMENT_CREATED`
- `FULFILLMENT_TRANSITIONED`
- `INVENTORY_RESERVED`
- `INVENTORY_RELEASED`
- `INVENTORY_ALLOCATED`
- `APPOINTMENT_BOOKED`
- `APPOINTMENT_CANCELLED`
- `APPOINTMENT_RESCHEDULED`

All audit payloads are scrubbed of session tokens, passwords, and sensitive credentials.
