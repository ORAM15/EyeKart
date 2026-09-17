# EyeKart Healthcare Limited — Phase 6: Customer Accounts & Clinical Prescription Security

**Location**: Nairobi, Kenya  
**Facility**: Corner Plaza Building, 4th Floor, Westlands, Nairobi, Kenya  
**Contact**: eyekarthealthcare@gmail.com  
**Repository**: EyeKart  
**Branch**: `main`  
**Classification**: Production Architecture & Security Specification  

---

## 1. Executive Summary & Clinical Governance

EyeKart provides an integrated optical-commerce platform supporting physical frame discovery, precision digital lens configuration, virtual try-on (VTO), and clinical prescription fulfillment for patients in Kenya. 

Clinical optical prescriptions represent **Protected Health Information (PHI)** and legally regulated medical records under Kenyan healthcare frameworks. The Phase 6 architecture strictly enforces zero-trust boundaries between consumer e-commerce interactions and licensed optometric clinical review.

Under no circumstances does EyeKart automate medical diagnosis, manufacture synthetic doctor identities, or expose patient diopter parameters across tenant boundaries.

---

## 2. Role-Based Access Control (RBAC) Matrix

EyeKart enforces server-authoritative role verification at both middleware (`requireRole`) and service layers. Client-supplied role headers or payload fields are unconditionally rejected.

| Role | Account Management | Upload Rx Scans | Create/Edit Draft Rx | Submit Rx | Review Clinical Queue | Approve / Reject Rx | Fulfill Optical Orders | System Audit Oversight |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`CUSTOMER`** | Own profile only | Yes (Private) | Yes (Draft only) | Yes | **BLOCKED (403)** | **BLOCKED (403)** | **BLOCKED (403)** | None |
| **`STORE_STAFF`** | Own profile only | No | No | No | **BLOCKED (403)** | **BLOCKED (403)** | Frame dispatch only | Operational logs |
| **`LAB_TECH`** | Own profile only | No | No | No | **BLOCKED (403)** | **BLOCKED (403)** | Surfacing / QA only | Laboratory telemetry |
| **`OPTOMETRIST`** | Own profile only | No | No | No | **AUTHORIZED** | **AUTHORIZED** | QA diopter clearance | Clinical audit logs |
| **`ADMIN`** | System-wide | Yes | System-level | Yes | **AUTHORIZED** | **AUTHORIZED** | Full override | Full immutable audit trail |

---

## 3. Threat Model & IDOR Mitigation

### 3.1 Insecure Direct Object Reference (IDOR) Hardening
- **Prescription Retrieval (`GET /api/prescriptions/:id`)**: The server checks `prescription.user_id === req.user.id`. Requests from other authenticated customers are immediately aborted with `403 FORBIDDEN_PRESCRIPTION_ACCESS`. Diopter metrics and clinical notes are strictly inaccessible across tenant accounts.
- **Medical Document Linking (`stored_documents`)**: When attaching a scanned prescription document via `documentId`, the service verifies `stored_documents.user_id === req.user.id`. Cross-customer document injection fails with `403 FORBIDDEN_DOCUMENT_ACCESS`.
- **Order ↔ Prescription Association (`POST /api/orders`)**: When creating an order with a linked `prescriptionId`, the order creation service validates `prescription.user_id === req.user.id`. Attempts by Customer B to attach Customer A's prescription are blocked with `403 FORBIDDEN_PRESCRIPTION_ACCESS`.

### 3.2 Privilege Escalation & Profile Integrity
- **Role Tampering (`PATCH /api/me`)**: Any client payload attempting to modify `role` (e.g. `{ role: 'ADMIN' }` or `{ role: 'OPTOMETRIST' }`) is rejected with `400 UNAUTHORIZED_ROLE_MODIFICATION` and logged as a security alert to `audit_logs`.
- **Immutable Fields**: Fields critical to identity and cryptographic validation (`id`, `email`, `password_hash`, `is_active`) cannot be updated via `PATCH /api/me`. Attempts trigger `400 IMMUTABLE_FIELD_MODIFICATION`.
- **Password Changes (`POST /api/auth/change-password`)**: Validates current password using `scrypt` hashing before allowing updates. Enforces minimum 8-character length.

### 3.3 Status & Reviewer Identity Spoofing Protection
- Clients are strictly barred from updating prescription review status directly. `PATCH /api/prescriptions/:id` with `{ status: 'APPROVED' }` returns `403 FORBIDDEN_STATUS_MODIFICATION`.
- Injections of reviewer IDs or names return `403 FORBIDDEN_REVIEWER_SPOOF`. Reviewer credentials originate solely from verified session tokens of authenticated `OPTOMETRIST` or `ADMIN` staff.

---

## 4. Prescription Lifecycle & Immutability Engine

```
 [ Customer Creates ] ──────────► [ DRAFT ]
                                     │
                        (Submit / Auto-Submit)
                                     │
                                     ▼
                   [ PENDING_OPTOMETRIST_REVIEW ]
                                     │
               ┌─────────────────────┼─────────────────────┐
               │                     │                     │
          (Approves)            (Rejects)           (Clarification)
               │                     │                     │
               ▼                     ▼                     ▼
          [ APPROVED ]          [ REJECTED ]    [ CLARIFICATION_REQUIRED ]
               │                     │                     │
          (Terminal)            (Terminal)                 │
          (Clears Lens                               (Customer Revises
           Surfacing)                                 Values N + 1)
                                                           │
                                                           ▼
                                            [ PENDING_OPTOMETRIST_REVIEW ]
```

### 4.1 State Machine Transition Rules
1. **`DRAFT`**:
   - Customer can update diopters, notes, and attached documents in place (`PUT /api/prescriptions/:id`).
   - Customer can delete the prescription (`DELETE /api/prescriptions/:id`).
   - Revision number is fixed at 1.
2. **`PENDING_OPTOMETRIST_REVIEW`**:
   - Enters clinical review queue.
   - Prescription becomes strictly immutable. Direct edits and deletions are rejected with `400 CANNOT_MUTATE_NON_DRAFT_PRESCRIPTION` and `400 CANNOT_DELETE_ACTIVE_PRESCRIPTION`.
3. **`CLARIFICATION_REQUIRED`**:
   - Triggered when optometrist requests additional details or pupil verification.
   - Customer submits revised parameters via `POST /api/prescriptions/:id/clarification`.
   - Automatically generates **Revision N + 1** in `prescription_revisions` table, preserving the full audit trail of prior values.
   - Prescription state transitions back to `PENDING_OPTOMETRIST_REVIEW`.
4. **`APPROVED`**:
   - Clinical review verified and sealed by licensed optometrist.
   - Automatically synchronizes `orders.prescription_status = 'APPROVED'`.
   - Unlocks the optical fulfillment gate for CNC laboratory diamond surfacing.
   - Terminal state: cannot be edited, deleted, or reopened.
5. **`REJECTED`**:
   - Clinical rejection requires mandatory clinical notes ($\ge 3$ characters).
   - Order remains blocked from optical fulfillment.

---

## 5. Refractive Parameter Boundaries

EyeKart validates all optical input parameters before persistence:

- **OD / OS Sphere (`od_sph`, `os_sph`)**: Between `-20.00` and `+20.00` diopters.
- **OD / OS Cylinder (`od_cyl`, `os_cyl`)**: Between `-10.00` and `+10.00` diopters.
- **Astigmatic Axis (`od_axis`, `os_axis`)**: When cylinder is non-zero, integer axis between `1` and `180` degrees is mandatory (`CYL_REQUIRES_AXIS`).
- **Near Addition (`od_add`, `os_add`)**: Between `+0.50` and `+4.00` diopters.
- **Pupillary Distance (`pd`)**: Between `40.0` and `80.0` mm.

---

## 6. Integration Status & Production Boundary Disclosure

| Subsystem | Architectural State | Production Boundary / Real-World Status |
| :--- | :--- | :--- |
| **M-PESA / Daraja Payments** | Fully implemented & verified | Live Safaricom production passkey & consumer secrets unprovisioned. In development, responds with mock/sandbox telemetry. |
| **Medical Document Storage** | Fully implemented & verified | Operating on local encrypted storage engine with HMAC presigned download tickets. AWS S3 driver ready for production toggle. |
| **Corporate Optical Insurance Pre-Auth** | **DEMO ONLY / NOT IMPLEMENTED** | In-browser simulated modal (`eyekart_corporate_optical_insurance_claim_pre_authorization`). Zero database tables; no live connectivity to Kenyan insurers (Jubilee, APA, Britam, NHIF). |
| **Sendy / Courier Dispatch** | Architectural foundation | Express moto-rider dispatch tracking telemetry simulated; live Sendy/G4S logistics API unprovisioned. |
| **KRA Electronic Tax (eTIMS)** | In-memory tax calculator | Standard Kenyan 16% VAT computed server-authoritatively; physical KRA fiscal device/API connection unactivated. |
| **Optometrist Credentials** | Test role implementation | Licensed optometrist accounts for testing are marked with `(TEST ONLY)`; real clinical board registration numbers (KCO) unactivated. |

---

## 7. Verification Results

Automated regression and security validation executed on Node.js v24.14.1 / PostgreSQL:

- **Phase 6 Account & Prescription Suite (`verify_phase6_account_prescription.js`)**: **76/76 PASS** (100%)
- **Phase 5 Production Orders & Fulfillment Suite (`verify_phase5_order_fulfillment.js`)**: **21/21 PASS** (100%)
- **Phase 4 Payment Architecture Suite (`verify_phase4_payment_architecture.js`)**: **18/18 PASS** (100%)
- **Phase 3/CDP 3D & VTO Visual Experience Suite (`verify_premium_3d_experience.js`)**: **18/18 PASS** (100%)
