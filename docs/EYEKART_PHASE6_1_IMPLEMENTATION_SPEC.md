# EYEKART — PHASE 6.1 IMPLEMENTATION SPECIFICATION
## Production Backend Foundation Architecture & Integration Blueprint
**Authoritative Engineering Directive & System Specification**  
**Version:** 1.0  
**Date:** September 15, 2026  
**Status:** COMPLETE & AUTHORITATIVE  
**Classification:** `PASS — PHASE 6.1 PRODUCTION BACKEND FOUNDATION COMPLETE`  

---

## 1. EXECUTIVE SUMMARY & OBJECTIVE

Phase 6.1 establishes the first production backend foundation for the EyeKart Optical Commerce Platform. The objective of this phase is to execute the critical architectural transition:

$$\text{Client-Authoritative Demo State} \longrightarrow \text{Server-Authoritative Foundation}$$

### Absolute Invariants Enforced:
1. **0% Stitch Visual Drift:** All 23 Stitch HTML panels and CSS styles remain 100% frozen and unmodified.
2. **Real Production Primitives:** Node.js v24 Fastify service connected to PostgreSQL 18.4 via connection pooling (`pg.Pool`), enforcing memory-hard password hashing (crypto.scrypt), stateful session revocation in database, server-authoritative catalog pricing, and append-only audit logging.
3. **Graceful Degradation & Non-Destructive Adapter:** The existing `EyeKartStore` local state engine remains completely functional. The newly introduced `EyeKartApiAdapter` acts as an asynchronous bridge, ensuring zero disruptions if the backend service is offline.

---

## 2. BACKEND RUNTIME ARCHITECTURE

The backend is implemented as a modular monolith running on port 3001, distinct from the static frontend server running on port 3000:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER (PORT 3000)                      │
│   Stitch Approved Panels • Tailwind CSS • Three.js • MediaPipe FaceMesh│
│   EyeKartStore (Local State) ◄──► EyeKartApiAdapter (Network Bridge)   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ HTTPS / CORS with Credentials
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    FASTIFY API BACKEND (PORT 3001)                     │
│  - Security Headers (nosniff, SAMEORIGIN, X-XSS-Protection)            │
│  - Sliding Window Rate Limiter (5 requests / 60s for Auth)             │
│  - Cookie Parser & Session Resolution Middleware                       │
│  - Role-Based Authorization Guard (requireRole('ADMIN'))               │
│  - Centralized Sanitized Error Handler (zero leak of stack/SQL)        │
└──────────────┬─────────────────────┬───────────────────┬───────────────┘
               │                     │                   │
               ▼                     ▼                   ▼
┌─────────────────────────┐  ┌───────────────┐  ┌────────────────────────┐
│   AUTH & IDENTITY SRV   │  │  CATALOG SRV  │  │   PRICING ENGINE SRV   │
│ - scrypt password hash  │  │ - Canonical   │  │ - Authoritative frame  │
│ - 32-byte crypto tokens │  │   SKU catalog │  │ - Lens index surcharges│
│ - Session revocation    │  │ - EK-902 safe-│  │ - 16% Kenya VAT        │
│ - Strip password_hash   │  │   guard lock  │  │ - Discard client total │
└──────────────┬──────────┘  └───────┬───────┘  └──────────┬─────────────┘
               │                     │                     │
               ▼                     ▼                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 POSTGRESQL 18 RELATIONAL DATABASE (PORT 5433)          │
│   users • roles • sessions • categories • collections • products       │
│             product_variants • audit_logs (append-only)                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. CORE DOMAINS IMPLEMENTED

### 3.1 Identity & Real Authentication
- Self-registration is restricted strictly to the `CUSTOMER` role. Any client payload attempting to inject `role: 'ADMIN'` or `role: 'OPTOMETRIST'` is rejected with `400 Bad Request` and logged as `PRIVILEGE_ESCALATION_ATTEMPT`.
- Passwords are encrypted using OWASP-compliant `crypto.scrypt` with a unique 16-byte random salt and memory-hard parameters ($N=16384, r=8, p=1$).
- Active sessions are identified by cryptographically random 32-byte tokens (`crypto.randomBytes(32)`), stored as SHA-256 hashes in the database.
- Logging out immediately invalidates the database session row (`is_revoked = TRUE`), preventing token replay.

### 3.2 Canonical Catalog & EK-902 Safeguard
- Products are queried authoritatively from PostgreSQL.
- The EK-902 source conflict is explicitly preserved:
  `source_conflict: "EK-902 SOURCE CONFLICT — BUSINESS CONFIRMATION REQUIRED"`
  `price: 18500.00`
  `compare_at_price: null` (explicitly unverified).
- No guesses or fabricated prices are tolerated.

### 3.3 Server-Authoritative Pricing Foundation
- The endpoint `POST /api/pricing/quote` takes line items and computes the authoritative subtotal, lens index fees, coating surcharges, 16% Kenya VAT, and grand total.
- Any client-submitted `totalPrice` or `framePrice` is explicitly ignored and flagged in the returned calculation breakdown.

### 3.4 Append-Only Audit Logging
- Security events (`USER_REGISTERED`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `PRIVILEGE_ESCALATION_ATTEMPT`) are written to the `audit_logs` table.
- All metadata is scrubbed by `sanitizeAuditMetadata()` to ensure passwords, tokens, and secrets are never persisted in logs.

---

## 4. FRONTEND ADAPTER INTEGRATION

The frontend API adapter is defined in `assets/js/eyekart-api-adapter.js` and loaded non-destructively by `assets/js/eyekart-store.js`.
- Provides asynchronous methods (`checkHealth`, `getProducts`, `getProductBySku`, `calculateAuthoritativeQuote`, `register`, `login`, `logout`, `getCurrentUser`).
- Does not modify any existing synchronous methods on `EyeKartStore`.
- If the backend server is unreachable, the adapter fails gracefully without throwing unhandled exceptions, preserving full demo and offline capabilities.
