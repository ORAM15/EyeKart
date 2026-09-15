# EYEKART — PHASE 5.1 DISCOVERY REPORT
## OPTICAL OPERATIONS, PRESCRIPTION VERIFICATION & FULFILLMENT WORKFLOW
**Authoritative Architectural Audit & Reality Gate**  
**Version:** 1.0  
**Date:** September 14, 2026  
**Status:** COMPLETE & AUTHORITATIVE  
**Classification:** `PARTIAL — OPTICAL WORKFLOW COMPLETE — PRODUCTION BACKEND/RBAC REQUIRED`

---

## 1. EXECUTIVE SUMMARY & VERDICT

The EyeKart Optical Commerce Platform has completed comprehensive discovery for **Phase 5.1 (Optical Operations, Prescription Verification & Fulfillment Workflow)**.

Following the successful completion of Phase 5.0 (Checkout, Payment & Order Lifecycle), this phase focuses strictly on the operational optical-business pipeline:
$$\begin{aligned}
\text{Customer Order} &\longrightarrow \text{Prescription State Evaluation} \\
&\longrightarrow \text{Optometrist Review Queue} \\
&\longrightarrow \text{Clinical Action (Approve / Reject / Request Clarification)} \\
&\longrightarrow \text{Optical Processing & Lens Edging Gate} \\
&\longrightarrow \text{Quality Control (28-Point Centration & Power Audit)} \\
&\longrightarrow \text{Dispatch & Courier Fulfillment}
\end{aligned}$$

### Absolute Reality Gate Declaration:
> [!WARNING]
> **CLINICAL & AUTHORIZATION REALITY NOTICE:**  
> The EyeKart platform is a client-orchestrated optical commerce architecture served locally via `python serve.py`.  
> - **Optometrist & Role Enforcement:** `DEMO / CLIENT-SIDE ROLE SIMULATION`. No production server-side Role-Based Access Control (RBAC) exists.  
> - **Clinical Diagnosis & Review:** The platform validates data formatting (ranges, required fields, CYL/AXIS mathematical relationships). It **DOES NOT** perform autonomous medical diagnosis. Clinical approvals are recorded as workflow state events with named staff identities (`Dr. Kevin Omondi, MCOptom, OCK #0512` and `Dr. Farida Maina, OD, OCK #0482`).  
> - **Insurance EDI Rails:** `DEMO / SIMULATION`. Mentions of "CarePay Live Gateway" and "Smart Applications EDI" are client-side UI labels.  
> - **Fulfillment Telemetry:** Simulated lab stages and courier dispatch cycles.  
> - **Certified Classification:** `PARTIAL — OPTICAL WORKFLOW COMPLETE — PRODUCTION BACKEND/RBAC REQUIRED`.

---

## 2. THE 20 DISCOVERY POINTS

### 1. Current Prescription Data Model
- **Source:** `assets/js/eyekart-store.js` (`EyeKartStore.state.prescription`).
- **Structure:**
  ```javascript
  prescription: {
    mode: "manual", // 'manual' | 'upload' | 'whatsapp' | 'no_rx' | 'saved'
    type: "manual",
    verificationStatus: "USER_ENTERED", // 'USER_ENTERED' | 'PENDING_OPTOMETRIST_REVIEW' | 'PENDING_SUBMISSION' | 'PLANO_NO_RX' | 'OPTOMETRIST_VERIFIED'
    od: { sph: "-2.25", cyl: "-0.50", axis: "175", add: "+1.25" },
    os: { sph: "-2.00", cyl: "-0.75", axis: "005", add: "+1.25" },
    pd: 63,
    verified: false
  }
  ```
- **Integrity:** The model maintains strict separation between Right Eye (OD) and Left Eye (OS), captures Pupillary Distance (PD), and tracks a distinct `verificationStatus` property.

### 2. Current Prescription States
- `USER_ENTERED`: Customer manually populated refractive values. The prescription is **unverified** and must not appear clinically approved.
- `PENDING_OPTOMETRIST_REVIEW`: Uploaded slip, scanned medical record, or high astigmatism case awaiting clinical review.
- `PENDING_SUBMISSION`: Customer opted to provide prescription post-checkout via WhatsApp or direct atelier drop-in.
- `PLANO_NO_RX`: Non-corrective fashion or blue-light screen defense lenses with zero dioptric power.
- `OPTOMETRIST_VERIFIED`: Inspected and approved by a licensed optometrist.

### 3. Current OD/OS Fields
- **Ocular Lanes:**
  - **OD (Oculus Dexter / Right Eye):** `sph` (Sphere), `cyl` (Cylinder), `axis` (Axis angle), `add` (Near reading addition).
  - **OS (Oculus Sinister / Left Eye):** `sph`, `cyl`, `axis`, `add`.
- **Biometric Centration:** Total Binocular PD (54mm–74mm), Monocular PD (Mono OD / Mono OS: e.g. 31.5mm / 32.0mm).
- **Extended Atelier Biometrics (Clinical Report):** Fitting cross height, pantoscopic tilt ($8.5^\circ$), corneal vertex distance (12.0mm), frame wrap ($5.0^\circ$).

### 4. Current Validation Logic
- **Astigmatism Gate (`lens-configurator-engine.js`):**
  If `CYL != "0.00"` and `CYL != ""`, a valid `AXIS` integer between $1^\circ$ and $180^\circ$ is mandatory. Missing or out-of-range axis blocks cart progression and highlights the input.
- **Transposition Algorithm (`EyeKartStore.transposePrescription()`):**
  $$\text{New SPH} = \text{SPH} + \text{CYL}, \quad \text{New CYL} = -\text{CYL}, \quad \text{New AXIS} = (\text{AXIS} + 90) \pmod{180}$$
  Original values remain preserved; derived/transposed formats are displayed non-destructively.

### 5. Current Prescription Persistence
- **Storage:** Persisted to browser `localStorage` under `eyekart_store_state_v1_1`.
- **Sanitization:** `EyeKartStore._saveState()` validates structure before writing to prevent script injection or corrupt payloads. Survives hard page reloads and tab closures.

### 6. Current Order Linkage
- Deep-cloned in `EyeKartStore.placeOrder()`:
  - `newOrder.prescriptionSnapshot`: Cloned snapshot of the customer's prescription at the moment of payment.
  - `newOrder.items[...].lensConfig.prescription`: Itemized prescription bound to the specific frame/lens assembly.
- Order snapshot is immutable; future mutations to `state.prescription` do not alter historical orders.

### 7. Current Optometrist UI
- Located in Stitch panel `eyekart_clinical_examination_report_precision_diopter_summary/code.html` (Route: `clinical-report`).
- Displays attending clinician (`Dr. Kevin Omondi, MCOptom, OCK #0512`), 28-point evaluation across 4 pillars, refractive diopter table, SPH/CYL transpose toggle, and official OCK digital verification token `9482-OCK-2024`.

### 8. Current Patient UI
- Located in `eyekart_customer_account_orders_prescriptions_management/code.html` (Route: `my-account`).
- Displays the "Clinical Prescriptions Vault" tab with active OD/OS table, dual pupillometer visual ruler, Dr. Farida Maina OD attestation, and prescription application controls.

### 9. Current Clinical Report UI
- Panel `eyekart_clinical_examination_report_precision_diopter_summary/code.html`:
  - Patient dossier: Wanjiku Muthoni (#EK-NRB-1904).
  - Diagnostic imaging gallery: ZEISS Clarus 500 ultra-widefield fundus, Heidelberg Spectralis OCT cross-section, corneal wavefront topography, and infrared meibography.
  - Prescribed optical build: 1.67 Aspheric Digital Surfacing with BlueShield UV420.

### 10. Current Order Fulfillment States
- Formal 10-Stage Optical Lifecycle (`eyekart_order_confirmation_live_nairobi_courier_tracking/code.html`):
  1. `CONFIRMED`: Order & M-PESA STK Payment Confirmed
  2. `PRESCRIPTION_REVIEW`: Digital Prescription Clearance
  3. `LAB_SURFACING`: German CNC Free-Form Lens Edging
  4. `VACUUM_COATING`: Crizal-Grade Hydrophobic & UV420 Vacuum Coating
  5. `QA_CLINICAL`: Dual Laser Pupillometer Alignment & QA (28-point inspection)
  6. `ULTRASONIC_CLEANING`: Ultrasonic Cleaning & Hand-Buffing
  7. `CASING_SEAL`: Atelier Casing & Tamper-Evident Security Seal
  8. `DISPATCHED`: Handed to Dedicated Nairobi Express Rider
  9. `OUT_FOR_DELIVERY`: Out for Final Delivery to Destination
  10. `DELIVERED`: Delivered & In-Person Custom Fitting

### 11. Current Admin Order Workflow
- No separate backend administrative panel exists in the approved Stitch design.
- Operational management is conducted through the centralized store (`EyeKartStore`), account dossier, and clinical report interfaces.

### 12. Current Audit Logging
- Orders contain `lifecycleHistory: [...]`.
- Each record stores `{ status, timestamp, note }`.
- Cancellations log reason and simulated refund status.
- Operational status updates append chronological audit events.

### 13. Current Insurance Workflow
- Panels `eyekart_corporate_optical_insurance_claim_pre_authorization` and `eyekart_claim_approved_electronic_pre_auth_letter_modal`.
- Simulates pre-auth code generation (`JUB-OPT-2025-XXXXX`) and approval vouchers for Jubilee, AAR, APA, Britam.
- Reality: Explicitly classified as `APPROVED_DEMO`. No live CarePay EDI gateway.

### 14. Current Authorization Model
- Pure client-side single-session simulation. No server-side session cookies, tokens, or JWTs.

### 15. Current Role Model
- Roles: `CUSTOMER`, `OPTOMETRIST`, `ADMIN`, `STAFF`.
- Classified as `DEMO / CLIENT-SIDE ROLE SIMULATION`.

### 16. Existing Privacy Protections
- Zero biometric persistence (guaranteed in Phase 4.2). No facial landmarks, 3D meshes, or webcam frames are stored.
- Sensitive financial secrets (passwords, CVVs, M-PESA PINs) are never persisted.

### 17. Existing PII Storage
- `localStorage` key `eyekart_store_state_v1_1` contains customer name, email, phone, delivery address, and refractive formulas.

### 18. Existing Clinical-Data Exposure
- Prescriptions are stored in client-side `localStorage` in plaintext JSON format.

### 19. Existing Blockers
- No backend database (PostgreSQL/Redis) for cross-device multi-tenant data storage.
- No live Safaricom Daraja 2.0 API credentials.
- No live CarePay / insurance EDI gateway endpoint.
- No physical CNC laboratory machine telemetry integration.

### 20. Exact Scope That Can Safely Be Implemented
1. **Prescription Review Workflow:** Establish formal transitions:
   `PENDING_REVIEW` $\to$ Optometrist Inspect $\to$ `APPROVED` / `REJECTED` (with reason) / `CLARIFICATION_REQUESTED` (with note).
2. **Order Fulfillment Gating:** Optical orders requiring prescription review are blocked from entering lab processing until approved. Frame-only purchases bypass prescription review.
3. **Optometrist Review Action Wiring:** Make existing review actions functional in `eyekart_clinical_examination_report_precision_diopter_summary` and `EyeKartStore`, recording attending clinician identity (`Dr. Kevin Omondi, MCOptom, OCK #0512`).
4. **Customer Order Status Visibility:** Customer account views dynamically reflect operational stages ("Prescription review pending", "Approved for Lab Surfacing", "Lens Edging in Progress", "Ready for Dispatch").
5. **Operational Audit Trail:** Chronological event logging on all status transitions with actor, timestamp, previous state, and new state.
6. **0% Stitch Visual Drift:** Absolute visual freeze maintained across all templates.

---

## 3. SUMMARY DISCOVERY TABLE

| Domain | Discovery State | Current Reality | Phase 5.1 Action |
| :--- | :--- | :--- | :--- |
| **Prescription Model** | Stored in Store & Cart | Separates OD/OS, PD, and verificationStatus | Formalize clinical review schema |
| **Prescription Verification** | Fragmented flags | USER_ENTERED not distinguished from APPROVED | Enforce clinical honesty gate |
| **Optometrist Actions** | Static Stitch buttons | Approve/Reject buttons not wired to store | Wire functional review handlers |
| **Fulfillment Gating** | Unlinked order state | Optical orders could show processed without Rx clearance | Enforce Rx approval gate on lab processing |
| **Frame-Only Orders** | No custom rule | Frame-only orders could be held unnecessarily | Allow direct bypass to processing |
| **Audit Logging** | Superficial history | Only simple status strings logged | Append rich audit events with actor & notes |
| **Customer Visibility** | In-flight card hardcoded | Customer sees static dummy text | Reactively reflect operational state |
| **Visual Freeze** | Approved Stitch design | 23 immutable templates | 0% visual drift; zero DOM restructuring |

---

## 4. CONCLUSION & GATE APPROVAL

Phase 5.1 Discovery is complete. The prescription model, operational lifecycle, fulfillment gating rules, and clinical review boundaries have been rigorously established without modifying application code. Proceeding to implementation behind the approved, visually frozen Stitch templates.
