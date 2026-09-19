# EyeKart Clinical Appointments, Clinic Scheduling & Optical Operations

## 1. Overview & Operational Mission

EyeKart Healthcare Limited operates physical clinical eye examination and optical care centers in Nairobi, Kenya. Our flagship facility is located at:

**Corner Plaza Building, 4th Floor**  
**Westlands, Nairobi, Kenya**  
**Official Digital Portal**: `https://eyekart.ke`  
**Official Clinical Contact**: `Eyekarthealthcare@gmail.com`

The Phase 9 architecture hardens the complete operational scheduling and optical workflow domain. It provides strict guarantees against double-booking, enforces server-side access controls (RBAC & IDOR), standardizes Kenyan mobile identities, ensures timezone correctness under East Africa Time (`Africa/Nairobi` / UTC+03:00), and unifies appointment lifecycle events with Phase 8 transactional notifications and audit logging.

---

## 2. Domain Entities & Database Schema

### `clinics`
Represents physical EyeKart clinical branches.
- `id`: UUID primary key.
- `name`: VARCHAR (e.g. `"Westlands Central Clinic"`).
- `address`: TEXT (e.g. `"Corner Plaza, 4th Floor, Westlands, Nairobi"`).
- `phone`, `email`: Branch contact details.
- `timezone`: VARCHAR (Default `'Africa/Nairobi'`).
- `is_active`: BOOLEAN.

### `appointment_slots`
Represents pre-configured or generated clinical appointment slots allocated to optometrists/practitioners.
- `id`: UUID primary key.
- `clinic_id`: FK to `clinics.id`.
- `practitioner_id`: Practitioner identifier (e.g. `"PRACT-01"`).
- `practitioner_name`: Server-authoritative name of the optometrist (e.g. `"Dr. Miriam Ouma"`).
- `start_time`: TIMESTAMPTZ (inclusive start).
- `end_time`: TIMESTAMPTZ (exclusive end).
- `is_available`: BOOLEAN flag indicating real-time availability.
- `timezone`: VARCHAR (Default `'Africa/Nairobi'`).
- Constraint `chk_slot_time_order`: `CHECK (end_time > start_time)`.

### `appointments`
Represents patient bookings and clinical encounter records.
- `id`: UUID primary key.
- `booking_reference`: Unique public human-readable reference (`APT-YYYY-XXXXX`).
- `user_id`: FK to `users.id` (Customer account owner).
- `clinic_id`: FK to `clinics.id`.
- `slot_id`: FK to `appointment_slots.id`.
- `appointment_type_id`: FK to `appointment_types.id` (e.g. `'signature_28_point'`).
- `practitioner_id`, `practitioner_name`: Derived authoritatively from the selected slot.
- `start_time`, `end_time`: TIMESTAMPTZ.
- `timezone`: VARCHAR (Default `'Africa/Nairobi'`).
- `status`: Lifecycle state with constraint `chk_appointment_status`:
  `CHECK (status IN ('BOOKED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED', 'EXPIRED'))`.
- `patient_name`: VARCHAR (Trimmed, required).
- `patient_phone`: VARCHAR (Normalized Kenyan mobile format, e.g. `+2547XXXXXXXX`).
- `patient_email`: VARCHAR (Optional, lowercase).
- `national_id`: VARCHAR (Optional Kenyan ID / Passport).
- `notes`: TEXT (Clinical notes or patient request context).
- `cancellation_reason`: TEXT (Reason recorded upon cancellation).
- `cancelled_at`: TIMESTAMPTZ.
- `confirmed_at`: TIMESTAMPTZ (Recorded when optometrist or staff confirms).
- `completed_at`: TIMESTAMPTZ (Recorded when examination concludes).
- `reminder_sent_at`: TIMESTAMPTZ (Recorded when reminder notification is dispatched).
- `idempotency_key`: VARCHAR unique identifier for booking requests.
- Unique Index `uq_active_appointment_slot`:
  `UNIQUE (slot_id) WHERE slot_id IS NOT NULL AND status IN ('BOOKED', 'CONFIRMED')`.
- Unique Index `uq_appointments_idemp`:
  `UNIQUE (idempotency_key) WHERE idempotency_key IS NOT NULL`.

---

## 3. Lifecycle State Machine & Transition Rules

EyeKart appointments transition across deterministic states:

```
                  ┌──────────────┐
                  │    BOOKED    │◄────────── Initial Customer Booking
                  └──────┬───────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌───────────────┐ ┌───────────────┐ ┌───────────┐
│   CONFIRMED   │ │   CANCELLED   │ │  NO_SHOW  │
└───────┬───────┘ └───────────────┘ └─────┬─────┘
        │                ▲                │
        ├────────────────┘                │ (Optional cancellation)
        │                                 ▼
        ▼                           ┌───────────┐
┌───────────────┐                   │ CANCELLED │
│   COMPLETED   │                   └───────────┘
└───────────────┘
  (Terminal)
```

### Transition Specifications:
1. **`BOOKED`**: Initial state after patient reserves an available slot.
   - Legal transitions: `CONFIRMED`, `CANCELLED`, `NO_SHOW`, `EXPIRED`.
2. **`CONFIRMED`**: Optometrist or clinic staff validates schedule / readiness.
   - Legal transitions: `COMPLETED`, `CANCELLED`, `NO_SHOW`.
3. **`COMPLETED`**: Consultation and examination concluded.
   - Legal transitions: **None** (Terminal).
4. **`CANCELLED`**: Cancelled by patient or clinic staff. Slot is freed.
   - Legal transitions: **None** (Terminal).
5. **`NO_SHOW`**: Patient failed to arrive within the clinic appointment window. Slot is released for walk-ins.
   - Legal transitions: `CANCELLED` (or Terminal).
6. **`RESCHEDULED`**: Slot swap operation. Old slot is freed, new slot claimed, appointment status resets to `CONFIRMED`.
   - Legal transitions: **None** (Terminal).
7. **`EXPIRED`**: Slot unconfirmed within business threshold.
   - Legal transitions: **None** (Terminal).

---

## 4. Concurrency Controls & Double-Booking Prevention

To eliminate any possibility of double-booking under concurrent web traffic or multi-terminal clinic staff operations:

1. **Application-Level Row Lock (`SELECT FOR UPDATE`)**:
   - When booking or rescheduling, the backend begins a PostgreSQL transaction and acquires an exclusive row lock on `appointment_slots`:
     ```sql
     SELECT * FROM appointment_slots WHERE id = $1 FOR UPDATE;
     ```
   - If `is_available` is false, or if another active booking exists on the slot, the transaction aborts with `409 SLOT_ALREADY_BOOKED`.
2. **Database-Level Partial Unique Index**:
   - Even if concurrent threads race past application locks, PostgreSQL enforces:
     ```sql
     CREATE UNIQUE INDEX uq_active_appointment_slot 
     ON appointments (slot_id) 
     WHERE slot_id IS NOT NULL AND status IN ('BOOKED', 'CONFIRMED');
     ```
   - Any simultaneous insert attempting to claim the slot raises constraint violation `23505`, which is cleanly caught and returned as HTTP `409` conflict.
3. **Atomic Slot State Mutation**:
   - Upon booking: `UPDATE appointment_slots SET is_available = FALSE WHERE id = $1`.
   - Upon cancellation or no-show: `UPDATE appointment_slots SET is_available = TRUE WHERE id = $1`.
   - Upon rescheduling: Old slot marked `is_available = TRUE`, new slot marked `is_available = FALSE` in a single ACID transaction.

---

## 5. Idempotency Mechanisms

1. **Booking Idempotency**:
   - Clients supply an idempotency key via the `X-Idempotency-Key` header or request body.
   - The backend checks `appointments.idempotency_key`. If matched, it returns HTTP `200` with `{ idempotentHit: true, appointment: ... }` without creating duplicate appointments or re-dispatching booking notifications.
   - The database enforces `uq_appointments_idemp` to prevent duplicate concurrent inserts.
2. **Reminder Deduplication**:
   - `appointments.reminder_sent_at` records the exact timestamp of dispatch.
   - Subsequent calls to `/api/appointments/:id/remind` check this timestamp; if already set and `force` is false, the request returns `{ idempotentHit: true, message: "Reminder already sent" }`.

---

## 6. Timezone Architecture

- **Canonical Timezone**: `Africa/Nairobi` (East Africa Time / EAT / UTC+03:00).
- **Database Storage**: All timestamps (`start_time`, `end_time`, `created_at`, `confirmed_at`, `completed_at`, `reminder_sent_at`) are persisted in UTC (`TIMESTAMPTZ`).
- **Date Queries**: Slot availability and operational schedule queries filter using `(start_time AT TIME ZONE 'Africa/Nairobi')::date`.
- **Display Formatting**: Queries and API responses supply `date_eat` (`YYYY-MM-DD`) and `time_eat` (`HH:MI AM`) to ensure the user interface renders accurate local appointment times without client-side timezone drift.

---

## 7. Role-Based Access Control (RBAC) & IDOR Protection

| Endpoint | Method | Allowed Roles | Access Rules / IDOR Protection |
| :--- | :--- | :--- | :--- |
| `/api/appointments/availability` | `GET` | Public / Customer / Staff | Returns future available slots; excludes booked/locked slots. |
| `/api/appointments` | `POST` | `CUSTOMER`, `ADMIN`, `STORE_STAFF` | Authenticated; ownership is anchored to `req.user.id`. |
| `/api/appointments` | `GET` | Authenticated Customer | Returns only the customer's own appointments. |
| `/api/appointments/:id` | `GET` | Owner or Staff | IDOR check: Non-staff can only view their own appointments (`403 FORBIDDEN`). |
| `/api/appointments/:id/cancel` | `POST` | Owner or Staff | IDOR check: Non-staff can only cancel their own appointments (`403 FORBIDDEN`). |
| `/api/appointments/:id/reschedule`| `POST` | Owner or Staff | IDOR check: Non-staff can only reschedule their own appointments (`403 FORBIDDEN`). |
| `/api/appointments/:id/confirm` | `POST` | `ADMIN`, `OPTOMETRIST`, `STORE_STAFF` | Customer calls rejected with `403 FORBIDDEN`. |
| `/api/appointments/:id/complete`| `POST` | `ADMIN`, `OPTOMETRIST`, `STORE_STAFF` | Customer calls rejected with `403 FORBIDDEN`. |
| `/api/appointments/:id/no-show` | `POST` | `ADMIN`, `OPTOMETRIST`, `STORE_STAFF` | Customer calls rejected with `403 FORBIDDEN`. |
| `/api/appointments/:id/remind`  | `POST` | `ADMIN`, `OPTOMETRIST`, `STORE_STAFF` | Customer calls rejected with `403 FORBIDDEN`. |
| `/api/appointments/operational` | `GET` | `ADMIN`, `OPTOMETRIST`, `STORE_STAFF` | Customer calls rejected with `403 FORBIDDEN`. |
| `/api/admin/appointments`       | `GET` | `ADMIN`, `OPTOMETRIST`, `STORE_STAFF` | Customer calls rejected with `403 FORBIDDEN`. |
| `/api/appointments/:id` (PATCH) | `PATCH`| None | Arbitrary client mutations rejected with `400/403`. |

---

## 8. Transactional Notification Integration

Appointments are wired to Phase 8's transactional notification engine (`notificationService`):

1. **`APPOINTMENT_CREATED`**:
   - Dispatched immediately upon successful booking commit.
   - Sent via SMS and Email to the patient.
   - Payload: `{ bookingReference, patientName, clinicName, clinicLocation, startTime }`.
2. **`APPOINTMENT_CONFIRMED`**:
   - Dispatched when staff confirms or patient reschedules.
   - Payload: `{ bookingReference, clinicName, clinicLocation, startTime }`.
3. **`APPOINTMENT_CANCELLED`**:
   - Dispatched when appointment is cancelled.
   - Payload: `{ bookingReference, reason }`.
4. **`APPOINTMENT_REMINDER`**:
   - Dispatched 24h prior to appointment or via staff trigger.
   - Payload: `{ bookingReference, clinicName, clinicLocation, startTime }`.

---

## 9. Audit Logging & Compliance Traceability

Every appointment lifecycle event creates a permanent record in `audit_logs`:
- `APPOINTMENT_BOOKED`: Logs patient ID, booking reference, clinic ID, practitioner, and start time.
- `APPOINTMENT_CONFIRMED`: Logs confirming staff ID and role.
- `APPOINTMENT_COMPLETED`: Logs completing optometrist/staff ID.
- `APPOINTMENT_CANCELLED`: Logs cancellation reason and initiator.
- `APPOINTMENT_RESCHEDULED`: Logs previous slot ID and new slot ID.
- `APPOINTMENT_NO_SHOW`: Logs staff ID and failure to arrive.
- `APPOINTMENT_REMINDER_SENT`: Logs dispatch timestamp and delivery channel.
