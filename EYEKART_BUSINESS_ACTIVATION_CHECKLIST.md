# EYEKART — BUSINESS ACTIVATION CHECKLIST
**Executive Operational & Commercial Onboarding Runbook**  
**Legal Entity:** EYE KART HEALTHCARE LIMITED (Company No: PVT-8LU79RXX • Inc. 5 May 2022)  
**Customer-Facing Location:** Corner Plaza Building, 4th Floor, Westlands, Nairobi, Kenya  
**Customer-Facing Email:** Eyekarthealthcare@gmail.com  
**Target Commercial Go-Live:** September 2026  
**Audience:** Executive Committee, Head of Finance, Chief Medical Officer, Operations Director & DevOps Lead  
**Classification:** Authoritative Commercial Release Document  

---

## 1. Executive Briefing & Business Source of Truth

The EyeKart software platform has passed the Release Candidate 1 (RC1) acceptance audit. The software codebase is complete, secure, and regression-tested. This document serves as the operational roadmap for **EYE KART HEALTHCARE LIMITED** leadership to execute the external business activations necessary to transition the platform from sandbox demonstration to live commercial trade.

### Critical Business Invariants:
1. **Maintain Distinction Between Legal & Customer-Facing Details:**
   - Legal Entity: `EYE KART HEALTHCARE LIMITED`, Company No: `PVT-8LU79RXX`, Inc: `5 May 2022`.
   - Customer-Facing Address: `Corner Plaza Building, 4th Floor, Westlands, Nairobi, Kenya`.
   - Customer-Facing Contact: `Eyekarthealthcare@gmail.com`.
   - *Rule:* Never use the 2022 registered-office address from statutory documents as the customer store address.
2. **KRA Registration ≠ Live eTIMS Integration:**
   - EyeKart's KRA taxpayer registration and active Company Income Tax obligation are legally confirmed.
   - Live eTIMS integration with KRA's Virtual Sales Control Unit (VSCU) is **not** currently live and represents an uncompleted external activation track.
3. **Prohibition on Invention:**
   - Telephone numbers, WhatsApp lines, doctor names, branch networks, and courier partner contracts must **not** be invented. Items awaiting business owner provision are explicitly flagged below.

---

## 2. Track 1: Financial & Payment Rail Activation (Safaricom M-PESA)
*Responsible Officer: Head of Finance & Lead DevOps Engineer*

### Action 1.1: Register Commercial Paybill / Buy Goods Till
- [ ] **Step 1:** Prepare corporate KYC package:
  - EYE KART HEALTHCARE LIMITED Certificate of Incorporation (`PVT-8LU79RXX`)
  - CR12 Form (dated within the last 90 days)
  - KRA PIN Certificate for the company and all directors
  - National ID / Passport copies for all company directors
  - Bank Account Mandate Letter for settlement bank (e.g., NCBA, Stanbic, or KCB)
- [ ] **Step 2:** Submit application via the Safaricom Business Portal.
- [ ] **Step 3:** Receive assigned Commercial Paybill Number and Operator Credentials.

### Action 1.2: Activate Safaricom Daraja 2.0 Live Developer Account
- [ ] **Step 1:** Log into `https://daraja.safaricom.co.ke` with organizational credentials.
- [ ] **Step 2:** Create application named `EyeKart Production Commerce`.
- [ ] **Step 3:** Attach the commercial Paybill number to the Daraja application.
- [ ] **Step 4:** Complete Safaricom Go-Live security questionnaire.
- [ ] **Step 5:** Safaricom issues live credentials:
  - `MPESA_CONSUMER_KEY`
  - `MPESA_CONSUMER_SECRET`
  - `MPESA_PASSKEY`
  - `MPESA_SHORTCODE`
- [ ] **Step 6:** Submit EyeKart production static IP address to Safaricom for webhook IP whitelisting.

### Action 1.3: Configure Production Environment Variables
- [ ] **Step 1:** In production server `.env`, update the following keys:
  ```ini
  MPESA_ENVIRONMENT=LIVE
  MPESA_SHORTCODE=your_live_shortcode
  MPESA_CONSUMER_KEY=your_live_consumer_key
  MPESA_CONSUMER_SECRET=your_live_consumer_secret
  MPESA_PASSKEY=your_live_passkey
  MPESA_CALLBACK_URL=https://api.eyekart.ke/api/webhooks/mpesa
  ```
- [ ] **Step 2:** Execute live KSh 1.00 test transaction and verify webhook processing.

---

## 3. Track 2: Fiscal & Tax Regulatory Compliance (KRA eTIMS)
*Responsible Officer: Chief Financial Officer & Senior Backend Engineer*

> [!IMPORTANT]
> **KRA REGISTRATION ≠ LIVE eTIMS INTEGRATION**  
> Having an active KRA tax certificate confirms corporate registration and Company Income Tax obligations. It does not connect the software to KRA's eTIMS fiscal servers. The steps below are required to establish live electronic tax invoice transmission.

### Action 2.1: Onboard eTIMS Virtual Sales Control Unit (VSCU)
- [ ] **Step 1:** Access `https://etims.kra.go.ke` using EyeKart's KRA PIN credentials.
- [ ] **Step 2:** Select integration type: **System-to-System / Virtual Sales Control Unit (VSCU)**.
- [ ] **Step 3:** Contract an approved KRA third-party technical integrator or register EyeKart's client application.
- [ ] **Step 4:** Obtain official KRA Control Unit Device ID and cryptographic signing keys.

### Action 2.2: Deploy eTIMS Middleware & Verify Fiscal Invoicing
- [ ] **Step 1:** Install eTIMS client daemon or API integration adapter on production backend.
- [ ] **Step 2:** Verify that every transaction calculates the mandatory 16% VAT-inclusive component:
  $$\text{VAT} = \text{Total} \times \frac{16}{116}$$
- [ ] **Step 3:** Verify that generated electronic invoices contain:
  - EYE KART HEALTHCARE LIMITED KRA PIN
  - Control Unit Serial Number
  - KRA Fiscal Signature & QR Code URL
- [ ] **Step 4:** Conduct live test transaction and verify invoice reflection on KRA portal.

---

## 4. Track 3: Clinical Staffing & Optometrist Operations
*Responsible Officer: Chief Medical Officer / Clinical Lead*

### Action 3.1: Optometrist Credentialing & Review Roster
- [ ] **Step 1:** Confirm that participating clinicians hold active practice licenses from the Optometrists Association of Kenya (OAK) or Ministry of Health.
- [ ] **Step 2:** Provision named practitioner accounts in the EyeKart database (replacing test fixtures).
- [ ] **Step 3:** Assign database role `OPTOMETRIST` to each licensed clinician.

### Action 3.2: Clinical Review Workflow & SLA Protocols
- [ ] **Step 1:** Establish operating hours for clinical review queue.
- [ ] **Step 2:** Implement mandatory Review SLA:
  - *Standard Prescriptions:* Review and approval within **2 operational hours**.
  - *Complex Diopters:* Review within **4 operational hours**.
- [ ] **Step 3:** Train optometrists on the three clinical actions:
  - **Approve:** Optical diopters, axis, and PD clinically sound; signs off for CNC surfacing.
  - **Clarify:** Clinical ambiguity detected; enters patient clarification notes; patient submits Revision 2.
  - **Reject:** Unsafe parameters for selected frame; logs medical justification.
- [ ] **Step 4:** Reinforce safety invariant: Optical orders **cannot be manufactured or glazed without explicit optometrist sign-off**.

---

## 5. Track 4: Physical Inventory & Atelier Stock Intake
*Responsible Officer: Operations Director & Optical Lab Manager*

### Action 5.1: Corner Plaza Building Frame Stock Intake
- [ ] **Step 1:** Receive physical frame inventory at Corner Plaza Building, 4th Floor, Westlands.
- [ ] **Step 2:** Audit physical quantities against the 13 canonical SKUs:
  - EK-101, EK-102 (Reconciled @ KSh 11,200), EK-103, EK-201, EK-202, EK-301, EK-302, EK-801, EK-802, EK-803, EK-804 (Reconciled @ KSh 13,800), EK-805, EK-902 (Anchored @ KSh 18,500).
- [ ] **Step 3:** Barcode tag all physical units with corresponding SKU and variant suffixes (`-GLD`, `-OBS`, `-TOR`, `-PLT`).
- [ ] **Step 4:** Executive Committee decision: Resolve business confirmation on EK-902 (confirm baseline retail price of KSh 18,500.00).
- [ ] **Step 5:** Run inventory synchronization script to update live database `products.stock` counts.

### Action 5.2: Optical Laboratory Tooling & Blanks Inventory
- [ ] **Step 1:** Stock certified CR-39, 1.56, 1.60, 1.67, and 1.74 semi-finished lens blanks.
- [ ] **Step 2:** Calibrate CNC patternless edger to match frame tracer blueprints for all 13 canonical frames.
- [ ] **Step 3:** Train lab technicians on operating the EyeKart Fulfillment workspace:
  - `ELIGIBLE` -> `PROCESSING` -> `PRODUCTION` -> `QUALITY_CHECK` -> `PACKED`.

---

## 6. Track 5: Courier Logistics & Customer Communications
*Responsible Officer: Operations Director & Customer Care Lead*

### Action 6.1: Courier Logistics Decision & Service Agreement
- [ ] **Step 1:** Executive decision: Confirm courier fulfillment model (dedicated in-house motorcycle rider vs. contracted commercial courier).
- [ ] **Step 2:** Establish delivery SLA zones:
  - *Zone 1 (Express Nairobi):* Westlands, Kilimani, Karen, Muthaiga, Gigiri, CBD — **within 24 hrs of lab completion**.
  - *Zone 2 (Greater Nairobi Metro):* Kiambu, Ruiru, Athi River, Rongai — **24–48 hours**.
- [ ] **Step 3:** Implement secure delivery verification:
  - 4-digit SMS Delivery PIN generated upon rider dispatch; customer provides PIN to rider upon physical handover.

### Action 6.2: Customer Support & Concierge Setup
- [ ] **Step 1:** Setup customer care communications:
  - Primary Contact Email: `Eyekarthealthcare@gmail.com`
  - Business owner to provide official customer service telephone number.
  - Business owner to provide official WhatsApp Business number.
- [ ] **Step 2:** Clarify Clinic Location Architecture:
  - Confirm whether in-person eye exams take place exclusively at **Corner Plaza Building, 4th Floor, Westlands**, or across multiple partner branches.
- [ ] **Step 3:** Synchronize physical appointment calendars with database `appointment_slots` table.

---

## 7. Operational Readiness Checklist Sign-Off

| Track | Lead Executive | Target Completion Date | Executive Sign-off |
| :--- | :--- | :---: | :---: |
| **Track 1: M-PESA Live Rails** | Head of Finance | Day 5 | `[   ]` |
| **Track 2: KRA eTIMS Tax** | Chief Financial Officer | Day 7 | `[   ]` |
| **Track 3: Optometrist Roster** | Chief Medical Officer | Day 3 | `[   ]` |
| **Track 4: Physical Inventory** | Operations Director | Day 6 | `[   ]` |
| **Track 5: Courier Logistics** | Operations Director | Day 8 | `[   ]` |
| **FINAL GO-LIVE AUTHORIZATION** | **Chief Executive Officer** | **Day 10** | `[   ]` |
