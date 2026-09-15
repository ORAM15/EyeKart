# EyeKart — Phase 6.6: Integration Test Matrix & Evidence
## Complete Verification Coverage across Categories A through Q
### Version 1.0 — Test Evidence Record

---

## 1. Test Suite Overview

- **Test Suite**: `scratch/verify_phase6_6.js` & `scratch/verify_phase6_6_cdp.js`
- **Evidence Artifact**: `scratch/phase6_6_test_evidence.json`
- **Execution Mode**: Deterministic / Offline / Sandbox First
- **Total Assertions**: 57 API/Backend assertions + 10 Edge CDP Browser assertions
- **Pass Rate**: 100% (67 / 67 Passed, 0 Failed)

---

## 2. Category-by-Category Assertion Matrix

| # | Category | Assertion Description | Status | Evidence / Verification Method |
|---|---|---|---|---|
| 1 | **Category A** | Fastify `/api/health` responds with 200 OK | **PASS** | HTTP GET `/api/health` returns `{ status: 'ok' }` |
| 2 | **Category A** | Database reports connected: true to PostgreSQL (`eyekart_dev`) | **PASS** | Database pool query check confirms active connection |
| 3 | **Category B** | `payment_attempts` has `checkout_request_id` column | **PASS** | PostgreSQL `information_schema.columns` query |
| 4 | **Category B** | `payment_attempts` has `merchant_request_id` column | **PASS** | PostgreSQL `information_schema.columns` query |
| 5 | **Category B** | `payment_attempts` has `mpesa_receipt_number` column | **PASS** | PostgreSQL `information_schema.columns` query |
| 6 | **Category B** | `payment_attempts` has `phone_number` column | **PASS** | PostgreSQL `information_schema.columns` query |
| 7 | **Category B** | `payment_attempts` has `callback_received_at` column | **PASS** | PostgreSQL `information_schema.columns` query |
| 8 | **Category B** | Index `idx_payment_attempts_checkout_req` exists | **PASS** | `pg_indexes` query confirms index presence |
| 9 | **Category B** | Unique index `uq_payment_attempts_mpesa_receipt` exists | **PASS** | `pg_indexes` query confirms unique conditional index |
| 10 | **Category B** | `stored_documents` table exists with required columns | **PASS** | `information_schema.columns` confirms table definition |
| 11 | **Category C** | `PaymentProvider` defaults to `DISABLED` environment | **PASS** | Instance check confirms `environment === 'DISABLED'` |
| 12 | **Category C** | Reports `isLive=false` and `isSandbox=false` when disabled | **PASS** | Property assertions on base class instance |
| 13 | **Category C** | Abstract `initiatePayment()` throws implementation error | **PASS** | Method invocation throws typed error |
| 14 | **Category C** | Abstract `queryPayment()` throws implementation error | **PASS** | Method invocation throws typed error |
| 15 | **Category D** | `DarajaClient` throws `DARAJA_DISABLED` when disabled | **PASS** | `getAccessToken()` throws error code `DARAJA_DISABLED` |
| 16 | **Category D** | `formatPhoneNumber` converts `07...` to `2547...` | **PASS** | Sanitization assertion `0712345678` -> `254712345678` |
| 17 | **Category D** | `formatPhoneNumber` sanitizes `+254` spaces | **PASS** | Sanitization assertion `+254 712 345 678` -> `254712345678` |
| 18 | **Category D** | `formatPhoneNumber` preserves `254...` | **PASS** | Idempotency assertion on Kenyan format |
| 19 | **Category D** | `DarajaClient` retrieves token via mock transport | **PASS** | Mock transport returns OAuth token and caches it |
| 20 | **Category D** | `DarajaClient` initiates STK Push via mock transport | **PASS** | Mock transport dispatches and returns `CheckoutRequestID` |
| 21 | **Category E** | `MpesaDarajaProvider` rejects tampered underpayment | **PASS** | Throws `AMOUNT_MISMATCH` when client sends KES 1000 for KES 38500 order |
| 22 | **Category E** | `MpesaDarajaProvider` rejects non-KES currency | **PASS** | Throws `INVALID_CURRENCY` when client attempts USD transaction |
| 23 | **Category E** | Dispatches STK Push with authoritative order total | **PASS** | Inserts attempt with database `order.total` and returns checkout ID |
| 24 | **Category E** | `payment_attempts` recorded in `PENDING` state | **PASS** | Database verification confirms row status `PENDING` |
| 25 | **Category F** | Webhook processes valid callback and advances to `SUCCESS` | **PASS** | Ingress of standard Daraja payload updates status to `SUCCESS` |
| 26 | **Category F** | Order status advanced to `PAID` upon callback | **PASS** | Database query verifies `orders.payment_status = 'SUCCESS'` and `status = 'PAID'` |
| 27 | **Category F** | Duplicate webhook callback returns HTTP 200 without replay | **PASS** | Ingress of identical callback returns `duplicate: true`, status 200 |
| 28 | **Category G** | Webhook detects amount tampering and rejects callback | **PASS** | Callback with KES 100 on KES 25000 order triggers `AMOUNT_MISMATCH` |
| 29 | **Category G** | Tampered attempt updated to `FAILED` with security alert | **PASS** | Database query verifies attempt status `FAILED` and order held |
| 30 | **Category G** | Webhook handles non-zero ResultCode (e.g. 1032 cancellation)| **PASS** | Callback with `ResultCode: 1032` marks attempt and order `FAILED` |
| 31 | **Category H** | `LocalStorageProvider` generates valid upload intent | **PASS** | Returns `objectKey`, `uploadToken`, and 15-minute expiry |
| 32 | **Category H** | `LocalStorageProvider` writes file buffer to disk | **PASS** | File buffer written into `uploads/` directory |
| 33 | **Category H** | `LocalStorageProvider` retrieves saved file buffer | **PASS** | Read buffer matches original test PDF binary content |
| 34 | **Category H** | `S3StorageProvider` reports unconfigured safely | **PASS** | `isConfigured` returns false when keys are missing |
| 35 | **Category I** | Customer B denied access to Customer A document (IDOR) | **PASS** | IDOR check blocks unauthorized customer (HTTP 403) |
| 36 | **Category I** | Optometrist granted access to document for clinical review | **PASS** | Role-based check permits `OPTOMETRIST` role |
| 37 | **Category J** | `TestNotificationProvider` captures SMS internally | **PASS** | SMS captured in memory; zero live SMS dispatched |
| 38 | **Category J** | `TestNotificationProvider` captures Email internally | **PASS** | Email captured in memory; zero live Email dispatched |
| 39 | **Category K** | `TestCourierProvider` generates simulated waybill | **PASS** | Generates `EK-FARGO-XXXXX` with `isSimulation: true` |
| 40 | **Category K** | `TestCourierProvider` tracks shipment milestones | **PASS** | Milestone query returns status and history |
| 41 | **Category L** | `TaxFiscalizationService` returns explicit `DEMO/TEST` marker | **PASS** | Returns `DEMO / TEST FISCALIZATION MARKER` with zero KRA call |
| 42 | **Category L** | Computes authoritative 16% Kenyan VAT breakdown | **PASS** | Verified $Taxable = Total / 1.16$ and $VAT = Total - Taxable$ |
| 43 | **Category M** | `EyeKartApiAdapter` contains `initiateDarajaStkPush` | **PASS** | AST / Source inspection verifies method declaration |
| 44 | **Category M** | `EyeKartApiAdapter` contains `queryDarajaPayment` | **PASS** | AST / Source inspection verifies method declaration |
| 45 | **Category M** | `EyeKartApiAdapter` contains `createStorageUploadIntent` | **PASS** | AST / Source inspection verifies method declaration |
| 46 | **Category M** | `EyeKartApiAdapter` contains `confirmStorageUpload` | **PASS** | AST / Source inspection verifies method declaration |
| 47 | **Category M** | `EyeKartApiAdapter` contains `getDocumentDownloadUrl` | **PASS** | AST / Source inspection verifies method declaration |
| 48 | **Category N** | `.env.example` defaults `MPESA_ENVIRONMENT` to `DISABLED` | **PASS** | Text assertion on `.env.example` |
| 49 | **Category N** | `.env.example` defaults `STORAGE_PROVIDER` to `LOCAL` | **PASS** | Text assertion on `.env.example` |
| 50 | **Category N** | `.env.example` defaults `NOTIFICATION_PROVIDER` to `TEST` | **PASS** | Text assertion on `.env.example` |
| 51 | **Category N** | `.gitignore` protects `.env` from repository commit | **PASS** | Text assertion on `.gitignore` |
| 52 | **Category N** | `.gitignore` protects `uploads/` from repository commit | **PASS** | Text assertion on `.gitignore` |
| 53 | **Category O** | All 23 Stitch HTML panels 100% hash-identical | **PASS** | SHA256 checksum comparison against prebuild inventory |
| 54 | **Category P** | Frontend static server responsive on port 3000 | **PASS** | HTTP GET `http://127.0.0.1:3000/` responds successfully |
| 55 | **Category Q** | Fulfillment gate strictly blocks UNPAID order | **PASS** | `createFulfillment()` throws `ORDER_UNPAID` error |
| 56 | **Category Q** | Order `payment_status` verified `SUCCESS` after webhook | **PASS** | Database check confirms status updated by webhook |
| 57 | **Category Q** | Fulfillment clearance unlocked upon verified payment | **PASS** | `createFulfillment()` succeeds and returns tracking number |

---

## 3. Edge CDP Browser Runtime Evaluation Matrix

| Check | Runtime Expression | Result | Status |
|---|---|---|---|
| Browser Store | `typeof window.EyeKartStore !== 'undefined'` | `true` | **PASS** |
| API Adapter Bridge | `typeof window.EyeKartApiAdapter !== 'undefined'` | `true` | **PASS** |
| STK Push Method | `typeof window.EyeKartApiAdapter.initiateDarajaStkPush === 'function'` | `true` | **PASS** |
| STK Query Method | `typeof window.EyeKartApiAdapter.queryDarajaPayment === 'function'` | `true` | **PASS** |
| Storage Intent Method | `typeof window.EyeKartApiAdapter.createStorageUploadIntent === 'function'` | `true` | **PASS** |
| Storage Confirm Method| `typeof window.EyeKartApiAdapter.confirmStorageUpload === 'function'` | `true` | **PASS** |
| Document Download | `typeof window.EyeKartApiAdapter.getDocumentDownloadUrl === 'function'` | `true` | **PASS** |
| Document List | `typeof window.EyeKartApiAdapter.getStoredDocuments === 'function'` | `true` | **PASS** |
| Client-Side Health | `await window.EyeKartApiAdapter.checkHealth()` | `{ ok: true, status: 200, data: { status: 'ok' } }` | **PASS** |
| Console Telemetry | Uncaught exceptions during CDP navigation | `0 errors` | **PASS** |
