# EYEKART — PHASE 6.1 SECURITY SPECIFICATION
## Security Architecture, Cryptography & Threat Defense Controls
**Authoritative Security Reference**  
**Version:** 1.0  
**Date:** September 15, 2026  
**Status:** COMPLETE & AUTHORITATIVE  

---

## 1. CRYPTOGRAPHIC PRIMITIVES & PASSWORD HASHING

### 1.1 Memory-Hard Password Hashing (scrypt)
- **Algorithm:** Node.js native `crypto.scrypt`
- **Salt:** 16-byte cryptographically secure random bytes generated via `crypto.randomBytes(16)` per user.
- **Parameters:**
  - CPU/Memory Cost ($N$): $16384$ ($2^{14}$)
  - Block Size ($r$): $8$
  - Parallelization ($p$): $1$
  - Key Length: $64$ bytes
- **Serialized Format:** `$scrypt$N=16384,r=8,p=1$<salt_hex>$<derived_key_hex>`
- **Verification:** Constant-time comparison via `crypto.timingSafeEqual` to eliminate timing attack vectors.

### 1.2 Session Token Security
- **Token Generation:** 32 bytes of cryptographically secure random entropy (`crypto.randomBytes(32).toString('hex')`).
- **Storage in Database:** Hashed using SHA-256 before storage (`token_hash`). A compromised database dump yields zero active session credentials.
- **Session Revocation:** On logout, `sessions.is_revoked` is immediately updated to `TRUE`.
- **Transmission:** Transported via HTTP-only cookie with `SameSite=Lax; Path=/` and `Authorization: Bearer <token>` fallback for cross-origin API clients.

---

## 2. ROLE-BASED ACCESS CONTROL (RBAC) & AUTHORIZATION

### 2.1 Server-Side Enforcement
- The client browser is **never trusted** to declare its own role.
- Roles are strictly tied to the verified user account in the PostgreSQL `users` table.
- Self-registration is strictly hardcoded to `CUSTOMER`. Any registration payload supplying `role: 'ADMIN'` or `role: 'OPTOMETRIST'` is rejected with `400 Bad Request` (`UNAUTHORIZED_ROLE_ASSIGNMENT`) and triggers a security audit event.
- Access to administrative routes (e.g. `/api/admin/audit-logs`) is guarded by `requireRole('ADMIN')`. If an authenticated customer accesses this route, the server returns `403 Forbidden` (`FORBIDDEN`).

---

## 3. THREAT MITIGATION MATRIX (PHASE 6.1 CONTROLS)

| Attack Vector | Vulnerability Addressed | Phase 6.1 Technical Defense |
| :--- | :--- | :--- |
| **Price Tampering** | Client manipulation of order total | `POST /api/pricing/quote` recalculates all line items from catalog; client `totalPrice` is discarded. |
| **Privilege Escalation** | Client switching local role to ADMIN | Role claims rejected in registration; session middleware queries role strictly from database. |
| **Brute-Force Login** | Credential stuffing on login | Sliding-window in-memory rate limiter restricts auth endpoints to 5 attempts per 60s per IP (`429`). |
| **Credential Theft** | Password hashes exposed in API responses | `sanitizeUser()` strictly strips `password_hash` from all user objects before serialization. |
| **Secret Leaks in Logs**| Passwords or tokens appearing in audit logs | `sanitizeAuditMetadata()` recursively scrubs forbidden keys (`password`, `token`, `secret`, `pin`). |
| **Information Disclosure**| Stack traces and SQL queries leaked on error | Centralized `errorHandler` maps uncaught exceptions to generic safe messages without internal paths. |
| **Session Hijacking** | Intercepted session tokens replayed after logout| Database session rows have `is_revoked` flag checked on every request; logout invalidates the token. |
| **Clickjacking / MIME Sniffing**| Malicious iframing or MIME confusion | Fastify `onSend` hook injects `X-Frame-Options: SAMEORIGIN` and `X-Content-Type-Options: nosniff`. |

---

## 4. AUDIT & TELEMETRY INTEGRITY

All security-critical actions are recorded in the PostgreSQL `audit_logs` table:
- `USER_REGISTERED`: Records new account creation and actor ID.
- `LOGIN_SUCCESS`: Records successful authentication and role.
- `LOGIN_FAILED`: Records failed login attempts with IP address and attempted email.
- `LOGOUT`: Records session invalidation.
- `PRIVILEGE_ESCALATION_ATTEMPT`: Records attempts to supply unauthorized roles during registration.
