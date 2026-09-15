# EyeKart — Phase 6.4: Clinic Appointments & Scheduling Specification
**Version:** 1.0  
**Authority:** Clinical Scheduling Architecture  
**Timezone Baseline:** East Africa Time (EAT, UTC+03:00 / Africa/Nairobi)

---

## 1. System Scope & Clinical Boundaries

> [!CAUTION]
> **Clinical Appointment Scheduling Only — Non-Diagnostic System**:
> 1. EyeKart manages appointment booking and practitioner calendar slots across Nairobi ateliers.
> 2. This platform **DOES NOT** integrate external hospital information systems (e.g. Aga Khan, Nairobi Hospital EMRs) or automate clinical diagnostics.
> 3. Practitioner identities in development/test are strictly designated: **`TEST ONLY`** (e.g. `Dr. Kevin Omondi, MCOptom (TEST ONLY)`).
> 4. Physical room numbers, diagnostic equipment calibration schedules, and practitioner leave policies are marked:
>    `CLINICAL CONFIRMATION REQUIRED`.

---

## 2. Server-Authoritative Appointment Data Models

### 2.1 `clinics`
- `id VARCHAR(64) PRIMARY KEY` (`westlands`, `sarit_centre`, `junction_mall`, `village_market`)
- `name VARCHAR(128) NOT NULL`
- `lead_clinician VARCHAR(128)`
- `address TEXT NOT NULL`
- `phone VARCHAR(32)`
- `timezone VARCHAR(32) NOT NULL DEFAULT 'Africa/Nairobi'`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`

### 2.2 `appointment_types`
- `id VARCHAR(64) PRIMARY KEY` (`signature_28_point`, `pediatric_myopia`, `contact_lens_corneal`, `rapid_refraction`)
- `name VARCHAR(128) NOT NULL`
- `duration_minutes INTEGER NOT NULL DEFAULT 45`
- `price NUMERIC(12, 2) NOT NULL DEFAULT 3500.00`
- `rebate_percentage NUMERIC(5, 2) NOT NULL DEFAULT 100.00`
- `description TEXT`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`

### 2.3 `appointment_slots`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE`
- `practitioner_id UUID REFERENCES users(id) ON DELETE SET NULL`
- `practitioner_name VARCHAR(128)`
- `start_time TIMESTAMPTZ NOT NULL`
- `end_time TIMESTAMPTZ NOT NULL`
- `timezone VARCHAR(32) NOT NULL DEFAULT 'Africa/Nairobi'`
- `is_available BOOLEAN NOT NULL DEFAULT TRUE`
- `CONSTRAINT uq_clinic_slot UNIQUE (clinic_id, start_time)`

### 2.4 `appointments`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `booking_reference VARCHAR(64) UNIQUE NOT NULL` (`APT-2026-XXXXX`)
- `user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT`
- `clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT`
- `slot_id UUID REFERENCES appointment_slots(id) ON DELETE SET NULL`
- `appointment_type_id VARCHAR(64) NOT NULL REFERENCES appointment_types(id)`
- `practitioner_name VARCHAR(128)`
- `start_time TIMESTAMPTZ NOT NULL`
- `end_time TIMESTAMPTZ NOT NULL`
- `timezone VARCHAR(32) NOT NULL DEFAULT 'Africa/Nairobi'`
- `status VARCHAR(32) NOT NULL DEFAULT 'BOOKED'` (`BOOKED`, `CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`, `RESCHEDULED`)
- `patient_name VARCHAR(128) NOT NULL`
- `patient_phone VARCHAR(32) NOT NULL`
- `patient_email VARCHAR(255)`
- `national_id VARCHAR(64)`
- `notes TEXT`
- `cancellation_reason TEXT`
- `cancelled_at TIMESTAMPTZ`
- `rescheduled_from_id UUID REFERENCES appointments(id) ON DELETE SET NULL`

---

## 3. Double-Booking Protection & Atomic Rescheduling

### 3.1 Double-Booking Prevention
When a slot is booked:
1. The transaction executes `SELECT * FROM appointment_slots WHERE id = $1 FOR UPDATE`.
2. If `is_available` is false or a concurrent appointment is active, transaction rolls back and returns HTTP 409 Conflict (`SLOT_ALREADY_BOOKED`).
3. If valid, the slot is marked `is_available = FALSE` and the appointment is committed atomically.

### 3.2 Atomic Rescheduling
When an appointment is rescheduled:
1. Both the current appointment and the target new slot are locked with `FOR UPDATE`.
2. Old slot is released (`is_available = TRUE`).
3. New slot is claimed (`is_available = FALSE`).
4. Appointment is updated with new slot time and practitioner in a single transaction.
5. Zero orphaned or double-held slots are possible.

---

## 4. Appointment API Surface

| Method | Endpoint | Auth / Role | Purpose |
|---|---|---|---|
| `GET` | `/api/appointments/availability` | Public / Auth | Query available slots by clinic & date |
| `POST` | `/api/appointments` | Authenticated Customer | Book an available appointment slot |
| `GET` | `/api/appointments` | Authenticated Customer | List customer's own appointments |
| `GET` | `/api/appointments/:id` | `CUSTOMER` (Own) / Staff | Retrieve appointment details (IDOR protected) |
| `POST` | `/api/appointments/:id/cancel` | `CUSTOMER` (Own) / Staff | Cancel appointment & release slot |
| `POST` | `/api/appointments/:id/reschedule` | `CUSTOMER` (Own) / Staff | Atomically reschedule appointment |
