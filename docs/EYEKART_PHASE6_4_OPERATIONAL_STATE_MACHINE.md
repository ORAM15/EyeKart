# EyeKart — Phase 6.4: Operational State Machines Specification
**Version:** 1.0  
**Domain:** Fulfillment & Appointment Lifecycle State Machines  

---

## 1. Fulfillment State Machine

The fulfillment lifecycle tracks optical laboratory edging, assembly, quality checks, and dispatch:

```mermaid
stateDiagram-v2
    [*] --> PENDING: Order Placed
    PENDING --> ELIGIBLE: Paid & Optical Gate Cleared
    ELIGIBLE --> PROCESSING: Workshop Allocation
    PROCESSING --> PRODUCTION: German CNC Edging / Surfacing
    PRODUCTION --> QUALITY_CHECK: Clinical Diopter Inspection
    QUALITY_CHECK --> PACKED: Casing & Wax Seal
    QUALITY_CHECK --> PRODUCTION: Rework Required
    PACKED --> DISPATCHED: Moto Courier Handover
    DISPATCHED --> DELIVERED: White-Glove Handover
    DELIVERED --> COMPLETED: Customer Verified (Terminal)
    
    PENDING --> CANCELLED: Order Cancelled
    ELIGIBLE --> CANCELLED: Order Cancelled
    PROCESSING --> CANCELLED: Order Cancelled
    PRODUCTION --> CANCELLED: Order Cancelled
    QUALITY_CHECK --> CANCELLED: Order Cancelled
    PACKED --> CANCELLED: Order Cancelled
    DISPATCHED --> CANCELLED: Order Cancelled
    CANCELLED --> [*]: Terminal State
```

### 1.1 Role Gating on State Transitions

| Target State | Permitted Roles | Notes |
|---|---|---|
| `ELIGIBLE` | `STORE_STAFF`, `ADMIN` | Cleared from payment/optical gate |
| `PROCESSING` | `LAB_TECH`, `ADMIN` | Lab workshop job queued |
| `PRODUCTION` | `LAB_TECH`, `ADMIN` | Active optical surfacing / coating |
| `QUALITY_CHECK` | `LAB_TECH`, `OPTOMETRIST`, `ADMIN` | Verifies prescription diopter tolerances |
| `PACKED` | `STORE_STAFF`, `LAB_TECH`, `ADMIN` | Cased in luxury packaging |
| `DISPATCHED` | `STORE_STAFF`, `ADMIN` | Handed to delivery courier |
| `DELIVERED` | `STORE_STAFF`, `ADMIN` | Handover confirmation |
| `COMPLETED` | `STORE_STAFF`, `ADMIN` | Terminal closure |
| `CANCELLED` | `ADMIN` | Administrative cancellation |

Attempts by `CUSTOMER` to transition fulfillment or by unauthorized roles (e.g. `STORE_STAFF` trying `PRODUCTION`) are rejected with HTTP 403 (`UNAUTHORIZED_ROLE_FOR_TRANSITION` / `FORBIDDEN_OPERATIONAL_ACTION`).

---

## 2. Appointment State Machine

```mermaid
stateDiagram-v2
    [*] --> BOOKED: Customer Reserves Slot
    BOOKED --> CONFIRMED: Clinic Confirms Schedule
    CONFIRMED --> COMPLETED: Examination Conducted (Terminal)
    BOOKED --> CANCELLED: Customer / Staff Cancels (Slot Released)
    CONFIRMED --> CANCELLED: Customer / Staff Cancels (Slot Released)
    BOOKED --> NO_SHOW: Patient Failed to Arrive
    CONFIRMED --> NO_SHOW: Patient Failed to Arrive
    BOOKED --> RESCHEDULED: Atomic Slot Swap
    CONFIRMED --> RESCHEDULED: Atomic Slot Swap
    CANCELLED --> [*]: Terminal State
    COMPLETED --> [*]: Terminal State
```

### 2.1 Transition Safeguards
- Re-cancelling a `CANCELLED` appointment is rejected.
- Moving from `COMPLETED` or `CANCELLED` to `BOOKED` is rejected with HTTP 400 (`ILLEGAL_APPOINTMENT_TRANSITION`).
- Rescheduling an already `CANCELLED` or `COMPLETED` appointment is rejected.
