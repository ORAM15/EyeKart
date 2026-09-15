# EYEKART — BUSINESS SOURCE OF TRUTH & DISCREPANCY RECONCILIATION AUDIT
**Authoritative Business Truth, Legal Separation & Repository Conflict Audit**  
**Entity:** EYE KART HEALTHCARE LIMITED (Nairobi, Kenya)  
**Date:** September 15, 2026  
**Auditor:** Senior Product Completion Engineer, Principal Full-Stack Engineer, Clinical QA Lead & Security Architect  
**Classification:** Authoritative Commercial Baseline Document  

---

## 1. Executive Summary & Authoritative Source of Truth

EyeKart is a genuine commercial enterprise operating in Kenya. Based on verified company incorporation, registry documentation, and direct instructions from the business owner, the authoritative business source of truth is established and structured below.

### The Two Mandatory Pillars of Business Information:

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ 1. LEGAL / REGISTRATION INFORMATION (Incorporation & Registry Baseline)               │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ Legal Entity Name:      EYE KART HEALTHCARE LIMITED                                   │
│ Company Number:          PVT-8LU79RXX                                                 │
│ Date of Incorporation:   5 May 2022                                                   │
│ Corporate Registrar:     Business Registration Service (BRS), Republic of Kenya        │
│ Tax Authority:           Kenya Revenue Authority (KRA)                                │
│ Confirmed Tax Status:    Active Company Income Tax Obligation                         │
│ Historical Registered:   Address on 2022 documents is legal incorporation record ONLY  │
└───────────────────────────────────────────────────────────────────────────────────────┘
                                           ▲
                                           │ STRICT SEPARATION
                                           │ (DO NOT CONFLATE)
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ 2. CURRENT CUSTOMER-FACING BUSINESS INFORMATION (Provided by Business Owner)          │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ Customer-Facing Location: Corner Plaza Building, 4th Floor,                           │
│                          Westlands, Nairobi, Kenya                                    │
│ Customer-Facing Email:   Eyekarthealthcare@gmail.com                                  │
│ Trading Brand:           EyeKart                                                      │
│ Customer Contact Status: Authorized for customer website and store communications    │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Operational Constraints & Invariants

### Invariant 1: Strict Separation of Legal vs. Customer-Facing Addresses
The registered-office address recorded on the company's 5 May 2022 incorporation documents is a historical legal registration record. It must **never** be automatically treated as the current customer-facing store or clinic location, nor used in customer checkout, delivery, or retail communications. Conversely, the current customer-facing location (`Corner Plaza Building, 4th Floor, Westlands, Nairobi, Kenya`) must not overwrite or erase historical statutory registration records.

### Invariant 2: Prohibition on Inventing Business Information
No member of the engineering team or software system may invent:
- Additional clinic branch locations.
- Clinician or optometrist personal names or council registration numbers.
- Telephone or WhatsApp customer support numbers.
- Operational retail or clinical opening hours.
- Third-party courier logistics partner names.
- Live Safaricom Daraja M-PESA Paybill or Till numbers.

Any such values discovered in the repository from earlier development phases are strictly classified as **unconfirmed developmental test placeholders** and are cataloged herein for formal business reconciliation.

### Invariant 3: KRA Registration ≠ Live eTIMS Integration

```
========================================================================================
                      CRITICAL FISCAL & REGULATORY DISTINCTION:
                     KRA REGISTRATION ≠ LIVE eTIMS INTEGRATION
========================================================================================
```

The verified KRA documentation confirms:
1. EYE KART HEALTHCARE LIMITED is an officially registered corporate taxpayer with the Kenya Revenue Authority.
2. The company holds an active **Company Income Tax** obligation.

**What the KRA documentation DOES NOT establish:**
- It does **not** prove that EyeKart has a live electronic Tax Invoice Management System (eTIMS) integration.
- It does **not** prove that the website backend transmits real-time fiscalized invoices to KRA servers.
- It does **not** prove that a Virtual Sales Control Unit (VSCU) or Online Sales Control Unit (OSCU) device has been configured or connected.
- It does **not** by itself establish the company's VAT registration status on the KRA portal (VAT registration is a separate statutory tax obligation under the VAT Act, distinct from the base Company Income Tax obligation).

**Current Codebase Reality:**
The software architecture contains the mathematical and visual foundations for 16% VAT-inclusive quotes and ETR-style certificates. However, the active backend provider is `TestFiscalizationProvider.js`, which operates in **explicit simulation mode** with the marker:
`DEMO / TEST FISCALIZATION MARKER — ZERO CONTACT WITH KRA PORTAL`.
Live eTIMS compliance remains an external business activation requiring KRA VSCU software/middleware integration.

---

## 3. Exhaustive Repository Conflict & Discrepancy Audit

The repository was comprehensively audited to identify all instances where placeholder, unconfirmed, or conflicting business data exist:

### Discrepancy 1: Legal Entity Name & Typography
- **Authoritative Business Truth:** `EYE KART HEALTHCARE LIMITED` (Note space between EYE and KART; all uppercase in registry).
- **Current Repository State:**
  - Milestone reports and docs used `EyeKart Healthcare Limited` (single-word EyeKart).
  - Stitch HTML (`eyekart_kra_etr_tax_invoice_clinical_ophthalmic_certificate/code.html` line 85) displays `EyeKart Kenya Ltd`.
- **Classification:** Minor textual drift in legacy artifacts and frozen HTML.
- **Reconciliation Action:** All authoritative project documentation, database legal tables, and system baselines are updated to `EYE KART HEALTHCARE LIMITED`. The frozen Stitch HTML displays `EyeKart Kenya Ltd` as a legacy design artifact, superseded at runtime by the authoritative legal entity.

### Discrepancy 2: Company Registration Number
- **Authoritative Business Truth:** `PVT-8LU79RXX` (Incorporated 5 May 2022).
- **Current Repository State:** Unrecorded in historical codebase files.
- **Reconciliation Action:** Recorded in `server/src/config/businessAuthority.js`, `assets/js/business-authority.js`, and all system inventories.

### Discrepancy 3: Physical Location & Clinic Branches
- **Authoritative Business Truth:** `Corner Plaza Building, 4th Floor, Westlands, Nairobi, Kenya`. (Only one physical customer-facing location has been confirmed by the business owner).
- **Current Repository State:**
  - `server/src/db/seed.js` lines 823–856 seeds **four (4) clinics**:
    1. `westlands`: *Westlands Square Flagship & Central Lab, 2nd Floor, Ring Rd Parklands*
    2. `sarit_centre`: *Sarit Centre Atelier, Ground Floor, New Wing, Karuna Rd, Westlands*
    3. `junction_mall`: *The Junction Mall Atelier, 1st Floor, Ngong Road*
    4. `village_market`: *Village Market Suite, Courtyard Level, Limuru Road, Gigiri*
  - `assets/js/booking-engine.js` hardcodes `Sarit Centre Precision Clinic`.
  - Stitch HTML (`eyekart_clinic_appointment_28_point_eye_exam_booking/code.html`) contains visual cards for Sarit Centre, Westlands Square, Junction Mall, and Village Market.
- **Classification:** **MAJOR BUSINESS CONFLICT / DEVELOPMENT PLACEHOLDER**.
- **Reconciliation Action:**
  - The 4 seeded clinics were created as developmental test fixtures in Phase 6.4 to test multi-clinic scheduling logic and concurrency.
  - They are **NOT** approved commercial branches.
  - The business owner must decide whether EyeKart operates exclusively out of **Corner Plaza Building, 4th Floor, Westlands**, or whether these additional locations represent planned physical branches.
  - Until confirmed, `Corner Plaza Building, 4th Floor, Westlands` is the sole authoritative customer-facing business location.

### Discrepancy 4: Customer-Facing Email Address
- **Authoritative Business Truth:** `Eyekarthealthcare@gmail.com`.
- **Current Repository State:**
  - `EYEKART_BUSINESS_ACTIVATION_CHECKLIST.md` referenced `concierge@eyekart.ke`.
  - `EYEKART_PHASE6_5_EXTERNAL_INTEGRATION_READINESS.md` referenced `atelier@eyekart.ke`.
  - Stitch HTML (`eyekart_kra_etr_tax_invoice.../code.html` line 98) displays `billing@eyekart.co.ke • clinic@eyekart.co.ke`.
  - `assets/js/eyekart-store.js` uses demo email `z.kamau@eyekart.ke`.
- **Classification:** **RESOLVED BY BUSINESS OWNER**.
- **Reconciliation Action:**
  - `Eyekarthealthcare@gmail.com` is established as the official customer-facing email address.
  - Configured in `businessAuthority.js` for both server and client.
  - Stitch HTML emails (`billing@eyekart.co.ke`) are recognized as frozen design placeholders.

### Discrepancy 5: Telephone & WhatsApp Support Numbers
- **Authoritative Business Truth:** **NO OFFICIAL TELEPHONE OR WHATSAPP NUMBERS HAVE BEEN PROVIDED.** (Must NOT be invented).
- **Current Repository State:**
  - `server/src/db/seed.js` seeds:
    - `+254 700 393 527` (Westlands Flagship)
    - `+254 700 393 528` (Sarit Centre)
    - `+254 700 393 529` (Junction Mall)
    - `+254 700 393 530` (Village Market)
  - `fulfillmentService.js` references dispatch rider phone `+254 700 918 274`.
  - Stitch HTML displays `+254 700 393 527`.
- **Classification:** **DEVELOPMENT PLACEHOLDERS ONLY**.
- **Reconciliation Action:**
  - All phone numbers in the database and code are marked `(TEST ONLY)`.
  - No real customer communications should use these numbers.
  - The business owner must supply the official telephone and WhatsApp support lines prior to public launch.

### Discrepancy 6: Optometrist Clinician Names & Credentials
- **Authoritative Business Truth:** **NO REAL CLINICIAN NAMES HAVE BEEN ASSIGNED.** (Must NOT be invented).
- **Current Repository State:**
  - `server/src/db/seed.js` seeds:
    - `Dr. Farida Maina, OD (TEST ONLY)`
    - `Dr. Kevin Omondi, MCOptom (TEST ONLY)`
    - `Dr. Amina Patel, OD (TEST ONLY)`
    - `Dr. David Kiprop, OD (TEST ONLY)`
  - `assets/js/booking-engine.js` references `Dr. Farida Onyango (Council #281)`.
- **Classification:** **DEVELOPMENT PLACEHOLDERS ONLY**.
- **Reconciliation Action:**
  - Confirmed as synthetic names used exclusively to verify the clinical review queue, diopter approval, and appointment slot booking state machines.
  - Real, credentialed optometrists registered with the Optometrists Association of Kenya (OAK) must be onboarded with their actual names and medical council numbers before real patient examinations take place.

### Discrepancy 7: Logistics & Courier Partnerships
- **Authoritative Business Truth:** **NO COURIER SERVICE AGREEMENT HAS BEEN CONFIRMED.** (Must NOT be invented).
- **Current Repository State:**
  - Previous markdown documents suggested Sendy, Fargo Courier, or an in-house electric motorcycle fleet.
- **Classification:** **UNCONFIRMED OPERATIONAL PROPOSAL**.
- **Reconciliation Action:**
  - The 10-stage fulfillment state machine operates independently of the third-party carrier.
  - The business owner must confirm whether doorstep delivery will be executed by an internal rider or a contracted commercial courier.

### Discrepancy 8: Safaricom M-PESA Merchant Identifiers
- **Authoritative Business Truth:** **NO LIVE COMMERCIAL PAYBILL OR TILL NUMBER ASSIGNED YET.**
- **Current Repository State:**
  - Codebase uses Safaricom Sandbox Shortcode `174379`.
  - Previous docs mentioned hypothetical `89XXXX`.
- **Classification:** **UNCONFIGURED LIVE CREDENTIAL**.
- **Reconciliation Action:**
  - Live Paybill must be provisioned via the Safaricom Daraja Go-Live process.
  - The sandbox configuration remains active for safe testing until live keys are issued.

### Discrepancy 9: KRA Tax Identification Numbers
- **Authoritative Business Truth:** EyeKart has an active KRA PIN and active Company Income Tax obligation. KRA Registration ≠ Live eTIMS.
- **Current Repository State:**
  - Stitch HTML (`code.html` line 90) displays placeholder PIN: `P051289410Z`.
  - `TaxFiscalizationService.js` falls back to placeholder PIN `P051234567Z`.
  - `TestFiscalizationProvider.js` generates mock eTIMS serials: `KRA-ETIMS-SANDBOX-XXXXXX`.
- **Classification:** **PLACEHOLDER TAX NUMBERS IN TEST HARNESS**.
- **Reconciliation Action:**
  - Real company KRA PIN will be configured via `.env` (`KRA_PIN=...`) once live eTIMS middleware is onboarded.
  - The placeholder numbers in Stitch HTML remain frozen as design artifacts.

---

## 4. Comprehensive Business Data Matrix

| Domain | Business Source of Truth | Current Repo Value | Conflict Status | Action Required |
| :--- | :--- | :--- | :---: | :--- |
| **Legal Entity Name** | `EYE KART HEALTHCARE LIMITED` | `EyeKart Healthcare Limited` / `EyeKart Kenya Ltd` | Minor Textual | Update documentation and database legal entity baselines. |
| **Company Number** | `PVT-8LU79RXX` | *None (missing)* | Missing in Repo | Recorded in `businessAuthority.js` and system inventory. |
| **Incorporation Date** | `5 May 2022` | *None (missing)* | Missing in Repo | Recorded in `businessAuthority.js` and system inventory. |
| **Customer Location** | Corner Plaza Building, 4th Floor, Westlands, Nairobi | 4 seeded clinics (Westlands Sq, Sarit, Junction, Village Mkt) | **CONFLICT** | Establish Corner Plaza as sole verified address; request branch clarification. |
| **Customer Email** | `Eyekarthealthcare@gmail.com` | `atelier@eyekart.ke`, `concierge@eyekart.ke`, `billing@eyekart.co.ke` | **CONFLICT** | Set `Eyekarthealthcare@gmail.com` as active customer-facing email. |
| **Customer Phone** | *Not provided (Do not invent)* | `+254 700 393 527` | Placeholder | Request official phone number from business owner. |
| **WhatsApp Support** | *Not provided (Do not invent)* | *None* | Pending Business | Request official WhatsApp line from business owner. |
| **Optometrist Names** | *Not provided (Do not invent)* | 4 synthetic doctor names (`TEST ONLY`) | Placeholder | Onboard real licensed clinicians before public go-live. |
| **Courier Partner** | *Not provided (Do not invent)* | Speculative (Sendy/Fargo) | Unconfirmed | Request business decision on delivery fulfillment model. |
| **M-PESA Paybill** | *Not provided (Do not invent)* | Sandbox `174379` | Sandbox Only | Complete Safaricom Daraja KYC to receive live Paybill. |
| **KRA Tax Status** | Active Income Tax Registration; **NOT** live eTIMS | Mock eTIMS provider (`TestFiscalizationProvider`) | **CLARIFIED** | KRA registration confirmed; live eTIMS remains an external requirement. |

---

## 5. Formal Reconciliation Items for the Business Owner

The following three specific business decisions are formally requested from the business owner to finalize the commercial configuration:

### Decision Item 1: Clinic Locations Architecture
- **Question:** Does EyeKart currently operate exclusively from **Corner Plaza Building, 4th Floor, Westlands, Nairobi**, or are there active physical branches or partner ateliers at Sarit Centre, The Junction Mall, or Village Market?
- **Recommendation:** If Corner Plaza is currently the sole operational location, we should update the appointment booking engine to display **Corner Plaza Building, 4th Floor, Westlands** as the active clinic hub.

### Decision Item 2: Customer Care Telephone & WhatsApp Line
- **Question:** What is the official telephone number and WhatsApp business number to be displayed to customers on the website for concierge assistance, appointment queries, and delivery coordination?
- **Recommendation:** Provide one primary mobile/landline number and one WhatsApp Business line to replace all development placeholders.

### Decision Item 3: Live eTIMS Integration Vendor
- **Question:** Has EyeKart engaged an authorized KRA eTIMS integration vendor (or acquired a Virtual Sales Control Unit / Online Sales Control Unit) for real-time fiscal transmission, or will physical ETR machine receipts be issued at Corner Plaza during the initial phase?
- **Recommendation:** Acknowledge that KRA corporate registration is complete, and schedule eTIMS software integration as an external post-incorporation track.

---

## 6. Verification & Frozen Stitch Safeguard Notice

```
========================================================================================
STITCH FREEZE INTEGRITY NOTICE:
All 23 Stitch UI panels remain 100% hash-identical (SHA-256 baseline verified).
No HTML files have been modified.
All business source-of-truth updates are applied strictly via external configuration
modules (server/src/config/businessAuthority.js and assets/js/business-authority.js),
database seed updates, and authoritative documentation.
========================================================================================
```
