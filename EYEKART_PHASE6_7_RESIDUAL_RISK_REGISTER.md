# EYEKART — RESIDUAL RISK REGISTER & THREAT MITIGATION MATRIX
**Phase:** 6.7 Validation & Activation Readiness  
**Version:** 1.0  
**Authority:** Senior Security Reviewer & Backend Reliability Engineer  
**Scope:** Payment Rails, Document Storage, External Integrations, and Optical Operations  

---

## 1. Risk Assessment Framework

Risks are evaluated using standard OWASP / NIST likelihood and impact criteria:
* **Likelihood (L):** 1 (Rare), 2 (Unlikely), 3 (Possible), 4 (Likely), 5 (Almost Certain)
* **Impact (I):** 1 (Insignificant), 2 (Minor), 3 (Moderate), 4 (Major), 5 (Catastrophic)
* **Risk Score (R):** $R = L \times I$ (Low: 1–6, Medium: 8–12, High: 15–25)

---

## 2. Threat & Vulnerability Matrix

| ID | Threat / Risk Scenario | Pre L | Pre I | Pre R | Implemented Architectural Mitigation | Post L | Post I | Post R | Status |
|---|---|:---:|:---:|:---:|---|:---:|:---:|:---:|:---:|
| **SEC-01** | **Amount & Price Tampering**<br>Adversary alters price in client request payload or submits nominal payment (e.g. KES 10 instead of KES 25,000). | 5 | 5 | **25** | Server-authoritative pricing engine calculates order total exclusively from database. Payment initiation enforces `Math.abs(requestedAmount - authoritativeAmount) < 0.01`. Webhook ingress re-verifies amount against order total before advancing order to `PAID`. | 1 | 5 | **5** | **MITIGATED** |
| **SEC-02** | **Cross-Customer Payment Hijacking**<br>Customer B initiates payment or manipulates order status of Customer A. | 4 | 4 | **16** | Strict actor verification in `MpesaDarajaProvider.initiatePayment`. Only the authenticated order owner (`order.user_id === actorId`) or an authenticated `ADMIN` role is authorized. Cross-customer calls rejected with `403 FORBIDDEN_ORDER_ACCESS`. | 1 | 4 | **4** | **MITIGATED** |
| **SEC-03** | **Prescription Document IDOR**<br>Customer B requests download of Customer A's sensitive clinical prescription or ID document. | 4 | 5 | **20** | Row-level authorization in `GET /api/storage/documents/:id/download`. Validates `doc.user_id === req.user.id` or verifies caller possesses clinical role (`OPTOMETRIST`, `ADMIN`, `LAB_TECH`). Rejects unauthorized calls with `403 IDOR_FORBIDDEN`. | 1 | 5 | **5** | **MITIGATED** |
| **SEC-04** | **Directory & Path Traversal Attack**<br>Attacker injects `../../etc/passwd` or `..\..\win.ini` into upload or download object keys to read/write arbitrary files. | 4 | 5 | **20** | `LocalStorageProvider._resolveSafePath()` resolves absolute path and asserts `resolvedPath.startsWith(uploadDir + path.sep)`. Ingress route strictly rejects object keys containing `..`, leading slashes, or Windows drive prefixes (`400 PATH_TRAVERSAL_DETECTED`). | 1 | 5 | **5** | **MITIGATED** |
| **SEC-05** | **Webhook Concurrency Race Condition**<br>Safaricom dispatches two identical callbacks simultaneously, causing double state transitions or duplicate fulfillment records. | 4 | 4 | **16** | Atomic transaction locking in `webhookService.js`. Executes `SELECT ... FOR UPDATE OF pa`. The first transaction acquires row lock; subsequent transaction waits, reads terminal `SUCCESS` state, and exits immediately with `{ duplicate: true }`. | 1 | 4 | **4** | **MITIGATED** |
| **SEC-06** | **Replay Attacks & Delayed Callbacks**<br>Malicious replay of valid past webhook callback to trigger unintended state changes. | 4 | 4 | **16** | Webhook ingress enforces single-use M-PESA receipt verification (`uq_payment_attempts_mpesa_receipt` unique constraint) and timestamp replay analysis (age >300s flagged). | 1 | 4 | **4** | **MITIGATED** |
| **SEC-07** | **Unapproved Clinical Optical Fulfillment**<br>Optical eyewear produced or shipped without licensed optometrist prescription approval. | 3 | 5 | **15** | Server-authoritative optical gate in `fulfillmentService.createFulfillment()`. Orders with `requires_prescription_review: true` are strictly blocked from fulfillment unless `prescription_status === 'APPROVED'`. Pending, Clarify, or Rejected prescriptions trigger `400 OPTICAL_GATE_BLOCKED`. | 1 | 5 | **5** | **MITIGATED** |
| **SEC-08** | **MIME Type Spoofing & Malicious Uploads**<br>Attacker uploads executable binary (`.exe`, `.sh`, `.bat`) disguised as a prescription document. | 4 | 5 | **20** | Strict MIME type whitelist (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`). File headers and content-type validated. Executable types rejected with `400 INVALID_MIME_TYPE`. 10MB file size ceiling enforced. | 1 | 5 | **5** | **MITIGATED** |
| **REL-01** | **Daraja Gateway Outage / Network Timeout**<br>Safaricom Daraja API becomes temporarily unreachable or times out during STK push. | 4 | 3 | **12** | Explicit AbortController timeout handling (15,000ms ceiling) in `DarajaClient.js`. Network failures captured gracefully as `DARAJA_TIMEOUT` / `504` without crashing Fastify server or leaking stack traces. | 2 | 3 | **6** | **MONITORED** |
| **REL-02** | **KRA eTIMS Outage or Slow Fiscalization**<br>External tax portal latency blocks customer checkout or order confirmation. | 4 | 3 | **12** | Asynchronous decoupled fiscalization architecture. Tax calculation is performed locally and authoritatively at 16%; fiscalization invoice synchronization is queued asynchronously, isolating customer checkout latency. | 2 | 3 | **6** | **MONITORED** |
| **SEC-09** | **Live Production Secret Leakage**<br>API keys or database credentials accidentally committed or exposed in client bundles. | 3 | 5 | **15** | Strict environment variable separation (`.env` in `.gitignore`). Fastify server never echoes API secrets in error responses or logs. API adapter in browser runs purely as an HTTP client without bundled cloud secrets. | 1 | 5 | **5** | **MITIGATED** |

---

## 3. Operational Incident Response Runbook

### Incident Scenario A: Webhook Callback Ingress Failure
* **Symptom:** Customers report payment deducted on M-PESA, but order remains in `PENDING` state.
* **Diagnosis Steps:**
  1. Inspect `audit_logs` table for `action = 'PAYMENT_SUCCEEDED'` or `action = 'SECURITY_ALERT_PAYMENT_TAMPERING'`.
  2. Query `payment_attempts` by `phone_number` or `order_id` to inspect `status` and `checkout_request_id`.
  3. Verify Nginx/Fastify ingress logs for POST requests to `/api/webhooks/mpesa`.
* **Remediation Action:**
  * Execute STK Push query via `MpesaDarajaProvider.queryPayment({ checkoutRequestId })`.
  * If Daraja returns `ResultCode: 0`, reconcile the payment attempt manually or trigger automated reconciliation job.

### Incident Scenario B: Optical Review Gating Alert
* **Symptom:** Warehouse attempts to pick/surface an order but receives `OPTICAL_GATE_BLOCKED`.
* **Diagnosis Steps:**
  1. Inspect `orders.prescription_status`.
  2. If status is `PENDING` or `CLARIFY`, verify if customer has uploaded a revised Rx or optometrist has completed clinical review.
* **Remediation Action:**
  * Direct customer to `eyekart_prescription_validation_studio_optical_clarification_flow` to provide clear prescription details.
  * Once optometrist clicks `Approve`, order automatically unblocks for fulfillment.
