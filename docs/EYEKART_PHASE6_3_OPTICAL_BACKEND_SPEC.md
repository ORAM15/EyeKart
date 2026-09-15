# EyeKart — Phase 6.3: Production Optical & Clinical Backend Specification
**Version:** 1.0  
**Authority:** Optical Commerce Platform  
**Compliance Classification:** Optical Commerce Workflow (Non-Diagnostic)

---

## 1. Executive Summary & Clinical Safety Boundaries

> [!CAUTION]
> **Optical Commerce Workflow Only — Not a Medical Diagnosis System**:
> 1. EyeKart manages optical commerce prescriptions for the sole purpose of custom ophthalmic lens surfacing, edging, and assembly.
> 2. This platform **DOES NOT** diagnose ophthalmic pathologies, compute physiological refractive corrections, or operate as an autonomous AI clinical decision engine.
> 3. Zero claims of HIPAA compliance, Kenya Data Protection Act (DPA) healthcare compliance, or Ministry of Health (MOH) medical record certification are made or implied.
> 4. Optometrist reviewer identities in development and test environments are strictly designated: **`DEMO / TEST OPTOMETRIST`** (e.g., `dev-optom@eyekart.test`). No real-world medical clinician names or registration numbers (e.g., OCK numbers) are used in production records without explicit written business confirmation.
> 5. Document upload storage and long-term clinical retention policies are deferred and marked `BUSINESS CONFIRMATION REQUIRED`.

---

## 2. Server-Authoritative Optical Data Models

Phase 6.3 establishes three relational tables within PostgreSQL 18.4:

### 2.1 `prescriptions` (Master Entity)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `order_id UUID REFERENCES orders(id) ON DELETE SET NULL`
- `current_revision INTEGER NOT NULL DEFAULT 1`
- `status VARCHAR(32) NOT NULL DEFAULT 'DRAFT'`  
  *Allowed values:* `DRAFT`, `SUBMITTED`, `PENDING_OPTOMETRIST_REVIEW`, `CLARIFICATION_REQUIRED`, `APPROVED`, `REJECTED`
- `prescription_mode VARCHAR(32) NOT NULL DEFAULT 'USER_ENTERED'`  
  *Allowed values:* `USER_ENTERED`, `UPLOAD`, `WHATSAPP`, `PLANO_NO_RX`
- `source VARCHAR(64) NOT NULL DEFAULT 'MANUAL_ENTRY'`
- `notes TEXT`
- `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
- `updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`

### 2.2 `prescription_revisions` (Immutable Historical Snapshots)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE`
- `revision_number INTEGER NOT NULL`
- `od_sph NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
- `od_cyl NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
- `od_axis INTEGER CHECK (od_axis IS NULL OR (od_axis >= 1 AND od_axis <= 180))`
- `od_add NUMERIC(5, 2)`
- `os_sph NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
- `os_cyl NUMERIC(5, 2) NOT NULL DEFAULT 0.00`
- `os_axis INTEGER CHECK (os_axis IS NULL OR (os_axis >= 1 AND os_axis <= 180))`
- `os_add NUMERIC(5, 2)`
- `pd NUMERIC(5, 2) NOT NULL DEFAULT 63.00`
- `patient_note TEXT`
- `author_id UUID REFERENCES users(id) ON DELETE SET NULL`
- `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
- `CONSTRAINT uq_rx_revision UNIQUE (prescription_id, revision_number)`

### 2.3 `prescription_reviews` (Immutable Optometrist Decision Log)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE`
- `revision_number INTEGER NOT NULL`
- `reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT`
- `reviewer_role VARCHAR(32) NOT NULL DEFAULT 'OPTOMETRIST'`
- `reviewer_name VARCHAR(128) NOT NULL`
- `action VARCHAR(32) NOT NULL` (`APPROVE`, `REJECT`, `REQUEST_CLARIFICATION`)
- `notes TEXT`
- `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`

---

## 3. Server-Side Clinical Input Validation

All optical values sent by the client are strictly validated on the server before database insertion:

| Parameter | Allowed Range | Precision | Validation Rule / Error Code |
|---|---|---|---|
| **Sphere (OD / OS SPH)** | -20.00 to +20.00 D | 0.25 D step recommended | Reject if out of bounds (`INVALID_SPHERE`) |
| **Cylinder (OD / OS CYL)** | -10.00 to +10.00 D | 0.25 D step recommended | Reject if out of bounds (`INVALID_CYLINDER`) |
| **Axis (OD / OS AXIS)** | 1 to 180 deg | Integer only | **Mandatory if CYL != 0** (`CYL_REQUIRES_AXIS`) |
| **Reading Add (ADD)** | +0.50 to +4.00 D | Optional | Reject if out of bounds (`INVALID_ADD`) |
| **Pupillary Distance (PD)** | 50.00 to 75.00 mm | 0.5 mm | Default 63.00 mm; Reject if outside 50-75 (`INVALID_PD`) |

---

## 4. API Endpoints

### 4.1 Customer Prescriptions (`server/src/routes/prescriptions.js`)
- `POST /api/prescriptions`: Create draft or auto-submitted prescription
- `GET /api/prescriptions`: List customer's own prescriptions
- `GET /api/prescriptions/:id`: Retrieve prescription with revision history (IDOR protected)
- `POST /api/prescriptions/:id/submit`: Submit prescription to optometrist queue
- `POST /api/prescriptions/:id/clarification`: Respond to clarification request (creates Revision N + 1)
- `PATCH /api/prescriptions/:id`: Direct status changes & reviewer spoofing are blocked (403 Forbidden)

### 4.2 Optometrist Clinical Review (`server/src/routes/optometrist.js`)
*All endpoints require authenticated session with role `OPTOMETRIST` or `ADMIN`.*
- `GET /api/optometrist/prescriptions`: List pending review queue
- `POST /api/optometrist/prescriptions/:id/approve`: Clinically approve prescription
- `POST /api/optometrist/prescriptions/:id/reject`: Clinically reject prescription (requires note)
- `POST /api/optometrist/prescriptions/:id/clarification`: Request clarification (requires note)

### 4.3 Optical Fulfillment Gating (`server/src/routes/orders.js`)
- `GET /api/orders/:id/fulfillment-eligibility`: Check whether order is cleared for lab surfacing

---

## 5. Audit Logging Events

The following append-only clinical audit events are generated with non-sensitive metadata:
- `PRESCRIPTION_CREATED`
- `PRESCRIPTION_SUBMITTED`
- `PRESCRIPTION_APPROVED`
- `PRESCRIPTION_REJECTED`
- `PRESCRIPTION_CLARIFICATION_REQUESTED`
- `PRESCRIPTION_CLARIFICATION_SUBMITTED`
