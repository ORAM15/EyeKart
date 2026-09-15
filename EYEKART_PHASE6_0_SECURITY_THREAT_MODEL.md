# EYEKART — SECURITY THREAT MODEL & RISK ASSIGNMENT
## Phase 6.0 Threat Model & Attack Surface Analysis
**Authoritative Security Architecture Directive**  
**Version:** 1.0  
**Date:** September 15, 2026  
**Status:** COMPLETE & AUTHORITATIVE  
**Classification:** `PASS — SECURITY THREAT MODEL COMPLETE`  

---

## 1. EXECUTIVE SUMMARY & THREAT MATRIX

This document details the exhaustive threat model for the EyeKart Optical Commerce Platform, contrasting the current client-side demonstration architecture against the required production security posture.

In its current state, EyeKart operates with zero server trust boundaries: the browser client computes all prices, holds order state in `localStorage`, simulates payment completion, and toggles optometrist roles locally. In a real-world deployment, this attack surface would expose financial, medical, biometric, and identity assets to severe compromise.

---

## 2. EXHAUSTIVE THREAT EVALUATION

### 2.1 XSS (Cross-Site Scripting)
- **Attack Surface:** User-supplied inputs rendered in DOM: customer name, delivery address, gate instructions, prescription notes, and search queries across 23 Stitch panels.
- **Current Exposure:** High risk in demo mode if an untrusted string is injected into `localStorage` and rendered via `innerHTML`. In `eyekart-store.js` and `eyekart-runtime.js`, multiple DOM injections use template literals.
- **Production Mitigation:**
  1. Content Security Policy (CSP) header: `default-src 'self'; script-src 'self' 'nonce-...' https://cdn.tailwindcss.com; object-src 'none'; base-uri 'self'`.
  2. Context-aware output encoding (HTML entity encoding) for all dynamic strings.
  3. DOMPurify sanitization before rendering rich clinical or customer text notes.
  4. Migration from raw `innerHTML` to typed DOM text node assignment (`textContent`).

### 2.2 CSRF (Cross-Site Request Forgery)
- **Attack Surface:** Authenticated state-changing endpoints: `/api/v1/orders`, `/api/v1/payments/mpesa/stk-push`, `/api/v1/optometry/reviews`.
- **Current Exposure:** None in demo mode (no server API exists). High risk if basic cookies are introduced without defenses.
- **Production Mitigation:**
  1. Authentication cookies configured with `SameSite=Strict; Secure; HttpOnly`.
  2. Double-submit CSRF tokens or custom request headers (`X-CSRF-Token`, `X-Requested-With`) verified on all mutating routes (`POST`, `PUT`, `PATCH`, `DELETE`).

### 2.3 IDOR (Insecure Direct Object Reference)
- **Attack Surface:** Object identifiers in routes: `/api/v1/orders/:orderId`, `/api/v1/prescriptions/:id`, `/api/v1/clinical-reports/:id`.
- **Current Exposure:** Critical in client runtime: any order or prescription in `localStorage` can be viewed or mutated by changing query parameters (`?sku=...`, `?orderId=...`).
- **Production Mitigation:**
  1. UUIDv4 / ULID identifiers instead of sequential autoincrement IDs.
  2. Authoritative object ownership verification in database queries:
     `SELECT * FROM orders WHERE id = $1 AND (user_id = $auth_user_id OR $auth_user_role = 'ADMIN');`
  3. Strict optometry access verification: only attending optometrists assigned to the patient or clinic can view clinical dossiers.

### 2.4 Privilege Escalation
- **Attack Surface:** User role switching between `CUSTOMER`, `OPTOMETRIST`, `ADMIN`, `LAB_TECH`.
- **Current Exposure:** Complete exposure: in demo mode, role switching is a simple client-side function call or URL parameter simulation.
- **Production Mitigation:**
  1. Immutable role claims embedded within cryptographically signed JWTs or server-side session stores.
  2. Strict server-side RBAC middleware (`requireRole('OPTOMETRIST')`) on all administrative and clinical routes.
  3. Optometrist identities verified against the official ODBK / OCK council registry prior to granting clinician permissions.

### 2.5 Price Tampering
- **Attack Surface:** Line-item frame price, lens diopter index surcharge, hydrophobic coating addons, VAT, and cart totals submitted during checkout.
- **Current Exposure:** Total vulnerability: `EyeKartStore.placeOrder()` directly accepts client-calculated `item.totalPrice` and `order.total` from JavaScript memory and stores it in `localStorage`.
- **Production Mitigation:**
  1. Zero trust in client pricing. Client sends only `{ sku, variantId, qty, lensConfig }`.
  2. Authoritative price recalculation service computes subtotal, index tiers, coating addons, VAT, and shipping from PostgreSQL tables.
  3. Order creation transaction asserts that calculated total matches the authorized payment sum before settlement.

### 2.6 Order Tampering
- **Attack Surface:** Modifying items, quantities, prescription snapshots, or shipping destinations of an existing order.
- **Current Exposure:** In demo mode, orders in `localStorage` are fully mutable via browser console.
- **Production Mitigation:**
  1. Orders become strictly immutable once transitioned to `CONFIRMED` or `LAB_SURFACING`.
  2. Any cancellation or item modification requires an explicit transactional event that triggers inventory restock and financial refund ledgers.
  3. State transition state machine prevents invalid state skips (e.g. jumping directly from `PENDING` to `DELIVERED`).

### 2.7 Prescription Access & Clinical Data Leakage
- **Attack Surface:** Refractive values (OD/OS Sphere, Cylinder, Axis, Add), Pupillary Distance (PD), uploaded prescription slips, diagnostic OCT / fundus images.
- **Current Exposure:** All prescription values are stored unencrypted in plaintext JSON in browser `localStorage`.
- **Production Mitigation:**
  1. Field-level encryption (AES-256-GCM) for clinical parameters in the database.
  2. Prescription uploads stored in private S3 buckets with server-side KMS encryption.
  3. Access restricted to time-limited (15-minute) pre-signed URLs generated strictly for authenticated patients or verified attending clinicians.
  4. Comprehensive access logging complying with the Kenya Data Protection Act 2019 and HIPAA security rules.

### 2.8 Credential Theft & Brute Force
- **Attack Surface:** Login endpoints, password reset flows, customer account credential storage.
- **Current Exposure:** None currently (no credentials stored). High risk if basic passwords are implemented poorly.
- **Production Mitigation:**
  1. Passwords hashed using Argon2id with recommended OWASP memory and iteration parameters (`m=65536, t=3, p=4`).
  2. Progressive rate limiting on login routes (max 5 failed attempts per IP / account per 15 minutes) enforced by Redis.
  3. Multi-Factor Authentication (MFA) via SMS OTP (Africa's Talking) mandatory for optometrist and admin roles.

### 2.9 Webhook Spoofing
- **Attack Surface:** Publicly reachable callback endpoint for Safaricom Daraja M-PESA STK push results (`/api/v1/webhooks/daraja`).
- **Current Exposure:** High risk in future if public endpoint accepts unverified JSON payloads claiming payment success.
- **Production Mitigation:**
  1. IP subnet filtering: allow incoming webhook traffic exclusively from Safaricom public IP ranges.
  2. Cryptographic signature verification using HMAC-SHA256 with a pre-shared secret key.
  3. Mutual TLS (mTLS) where supported by the payment gateway partner.

### 2.10 Replay Attacks
- **Attack Surface:** Re-submitting intercepted M-PESA callback payloads or re-triggering checkout payment requests.
- **Current Exposure:** None in demo; critical in production.
- **Production Mitigation:**
  1. Strict idempotency keys: database uniqueness constraint on `checkout_request_id` and `mpesa_receipt_number`.
  2. Timestamp validation: reject any webhook payload whose generation timestamp deviates by more than 300 seconds from server clock.
  3. Nonce verification in client checkout sessions.

### 2.11 Payment Manipulation & Fraud
- **Attack Surface:** Falsifying payment confirmation, claiming fake M-PESA transaction IDs (e.g. `SFA91028X4`), or manipulating currency codes.
- **Current Exposure:** In demo mode, `mpesa-service.js` generates dummy receipts and confirms payment unconditionally.
- **Production Mitigation:**
  1. Orders are only marked `CONFIRMED` when an authenticated Daraja callback is processed or an active STK push query verifies settlement.
  2. Direct validation of receipt format against Safaricom 10-character alphanumeric transaction pattern.
  3. Real-time reconciliation: transaction amount returned in callback must match the order total down to the cent (`KES 23,200.00`).

### 2.12 File Upload Abuse
- **Attack Surface:** Prescription slip upload (images/PDFs) and clinical diagnostic dossier uploads.
- **Current Exposure:** Uploads are currently client-side file objects or mock URLs.
- **Production Mitigation:**
  1. Client uploads directly to private S3 via pre-signed `PUT` URLs; server never accepts raw file streams.
  2. Strict MIME type sniffing and whitelist: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
  3. Maximum file size enforced at 10 MB in S3 upload policy.
  4. Asynchronous anti-malware scanning (ClamAV) triggered on S3 object creation before marking file accessible.

### 2.13 Session Theft & Hijacking
- **Attack Surface:** Stealing authentication tokens or cookies via network sniffing or cross-site script access.
- **Current Exposure:** In demo mode, `localStorage` has zero session security and is accessible to any script on the origin.
- **Production Mitigation:**
  1. JWT access tokens stored strictly in memory; refresh tokens stored in `HttpOnly; Secure; SameSite=Strict` cookies.
  2. Cryptographic token rotation on every refresh request with automatic invalidation of the entire token family upon reuse detection.
  3. TLS 1.3 mandatory with HSTS (`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`).

### 2.14 Rate Abuse & DoS
- **Attack Surface:** Spamming M-PESA STK pushes (SMS charges & SIM flooding), automated inventory locking, scraping catalog and clinical endpoints.
- **Current Exposure:** Demo mode allows unlimited loop calls to `mpesa-service.js`.
- **Production Mitigation:**
  1. Cloudflare WAF rate limiting at the edge (max 100 requests / min per IP).
  2. Redis-backed token bucket rate limiting on STK push initiation (max 3 pushes per phone number per hour).
  3. Inventory lock reservations automatically expire after 10 minutes if payment is not initiated.

---

## 3. THREAT MITIGATION SUMMARY MATRIX

| Threat | Risk Level | Target Asset | Architectural Defense |
| :--- | :--- | :--- | :--- |
| **Price Tampering** | Critical (P0) | Revenue & Ledger | Authoritative server price engine; reject client totals |
| **Payment Spoofing** | Critical (P0) | Financial Settlement | Safaricom HMAC signature validation, IP whitelist, Daraja Query fallback |
| **Prescription Breach** | High (P0) | Patient PII / Medical | Field-level AES-256-GCM encryption, private S3, signed URLs |
| **Privilege Escalation**| High (P0) | Clinical / Admin Control| Signed JWT claims, server RBAC middleware, OCK registration check |
| **IDOR** | High (P0) | Customer Orders / Dossiers| UUIDv4 keys, mandatory tenant/ownership SQL predicates |
| **XSS** | High (P1) | Session & DOM Integrity | Strict CSP, textContent binding, DOMPurify on notes |
| **CSRF** | Medium (P1) | Mutating API Routes | SameSite=Strict cookies, anti-CSRF request headers |
| **Upload Abuse** | Medium (P1) | Infrastructure / Security| Pre-signed S3 URLs, MIME sniffing, 10MB limit, ClamAV scan |
| **Replay Attacks** | High (P0) | Payment Callbacks | Unique constraint on CheckoutRequestID, 300s window |
| **Rate Abuse / SIM Spam**| Medium (P1) | M-PESA API Quotas | Redis token bucket rate limiter (3 STK / hr per phone) |

---

## 4. CONCLUSION

Implementing these mitigations transforms EyeKart from an untrusted client demo into a hardened, regulatory-compliant optical commerce platform capable of safely handling real financial transactions, private biometric try-on feeds, and sensitive clinical records.
