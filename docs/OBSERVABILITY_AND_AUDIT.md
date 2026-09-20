# EyeKart Production Observability, Audit & Reliability Architecture

## 1. Overview & Operational Mission

EyeKart Healthcare Limited operates a healthcare-regulated optical commerce platform in Nairobi, Kenya:

**EyeKart Healthcare Limited**  
**Corner Plaza Building, 4th Floor**  
**Westlands, Nairobi, Kenya**  
**Official Digital Portal**: `https://eyekart.ke`  
**Official Operational Contact**: `Eyekarthealthcare@gmail.com`  

The Phase 11 architecture hardens production observability, security auditing, database resilience, external provider degradation management, and transactional outbox reliability. It provides deterministic traceability across HTTP requests, background outbox workers, clinical events, and administrative actions while strictly safeguarding healthcare data and sensitive customer credentials.

> **Operational Status**: **IMPLEMENTED LOCALLY / NOT DEPLOYED**  
> All observability mechanisms, redaction pipelines, audit querying, database transactions, readiness diagnostics, and outbox failure controls are fully implemented, verified, and active in the codebase. Production deployment and real-world external APM/monitoring ingestion remain pending production infrastructure provisioning.

---

## 2. Status Taxonomy

Throughout this document and the EyeKart operational specifications, components and capabilities are categorized according to the following strict classification:

- **`IMPLEMENTED`**: Fully developed, tested, and active in the local repository codebase.
- **`CONFIGURATION REQUIRED`**: Implemented in code, but requires runtime environment credentials or configuration flags (e.g. AWS S3 production bucket, live M-PESA Daraja credentials, SendGrid/Africa's Talking API keys).
- **`NOT IMPLEMENTED`**: Out of scope or deferred by architecture mandate.
- **`PRODUCTION DEPENDENCY`**: External third-party infrastructure, cloud network ingress, or operational telemetry pipelines (e.g. centralized Datadog/Prometheus agent, production load balancer, managed PostgreSQL cluster).

---

## 3. Structured Application Logging Architecture

EyeKart utilizes a production-grade asynchronous structured logging pipeline built upon Fastify and Pino, complemented by a dedicated application logger utility (`server/src/utils/logger.js`).

### 3.1 Log Format & Fields
All log records are emitted as structured JSON containing standard operational fields:
- `level`: Normalized severity (`debug`, `info`, `warn`, `error`).
- `time`: Millisecond-precision epoch timestamp.
- `reqId`: Fastify internal request identifier.
- `correlationId`: Distributed correlation token propagated across services.
- `method` & `url`: Request routing context.
- `durationMs`: Total server processing latency in milliseconds.
- `actorId` & `actorRole`: Authenticated actor context (or `'anonymous'`).
- `err`: Structured error context (when handling exceptions).

### 3.2 Correlation ID & Request Tracing
- **Propagation**: EyeKart accepts incoming correlation IDs via `x-correlation-id` or `x-request-id` HTTP headers.
- **Generation**: If neither header is supplied by client or upstream ingress, a cryptographically secure UUID (`req_...`) is generated.
- **Header Reflection**: Fastify emits both `x-request-id` and `x-correlation-id` in every HTTP response via the `onSend` lifecycle hook.
- **Async Context**: The correlation ID is carried into service layers, database operations, transactional outbox records, and audit events.

### 3.3 Zero Sensitive Data Leakage & Redaction
Fastify and the logger utility strictly redact sensitive data patterns using recursive masking (`[REDACTED]`):
- Headers: `authorization`, `cookie`, `x-api-key`, `set-cookie`.
- Authentication secrets: `password`, `currentPassword`, `newPassword`, `password_hash`, `token`, `refreshToken`, `salt`.
- Payment & Commercial secrets: `passkey`, `consumerSecret`, `apiKey`, `cardNumber`, `cvv`, `pin`, `mpesa_passkey`.
- Personal Clinical Identifiers: Raw national ID or unmasked sensitive health conditions in debug logs.

---

## 4. Comprehensive Audit Event System

EyeKart records high-integrity, tamper-evident audit records into the `audit_logs` PostgreSQL table via `server/src/services/auditService.js`.

### 4.1 Schema Definition
- `id`: UUID primary key.
- `actor_id`: UUID of the acting user (NULL for system/unauthenticated events).
- `actor_role`: Role string (`CUSTOMER`, `STAFF`, `OPTOMETRIST`, `ADMIN`, `SYSTEM`, or `UNAUTHENTICATED`).
- `ip_address`: Client IP address.
- `user_agent`: HTTP User-Agent string (truncated to 500 chars).
- `action`: Authoritative uppercase action identifier.
- `entity`: Target domain entity (`USER`, `ORDER`, `PRESCRIPTION`, `APPOINTMENT`, `INVENTORY`, `PAYMENT`, `NOTIFICATION`, `SECURITY`).
- `entity_id`: Identifier of the impacted resource.
- `correlation_id`: Distributed correlation token linking the audit entry to HTTP requests and outbox dispatches.
- `metadata`: Sanitized JSONB payload.
- `created_at`: TIMESTAMPTZ.

### 4.2 Database Indexes
- `idx_audit_logs_actor`: `(actor_id, created_at DESC)`
- `idx_audit_logs_action`: `(action, created_at DESC)`
- `idx_audit_correlation_id`: `(correlation_id)`
- `idx_audit_entity_time`: `(entity, created_at DESC)`

### 4.3 Audit Action Taxonomy
The audit log covers critical domain lifecycles:
1. **Authentication & Access**:
   - `USER_REGISTERED`, `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILED`, `AUTH_LOGOUT`, `AUTH_PROFILE_UPDATED`, `PASSWORD_CHANGED`, `PASSWORD_CHANGE_FAILED`, `AUTHORIZATION_FAILURE`.
2. **Orders & Commerce**:
   - `ORDER_CREATED`, `ORDER_STATUS_UPDATED`, `ORDER_CANCELLED`, `ORDER_VERIFICATION_ATTEMPT`.
3. **Clinical & Prescriptions**:
   - `PRESCRIPTION_UPLOADED`, `PRESCRIPTION_MANUAL_ENTRY`, `PRESCRIPTION_VERIFIED`, `PRESCRIPTION_REJECTED`, `CLINICAL_REVIEW_DISPATCHED`.
4. **Appointments & Scheduling**:
   - `APPOINTMENT_BOOKED`, `APPOINTMENT_CONFIRMED`, `APPOINTMENT_CANCELLED`, `APPOINTMENT_COMPLETED`, `APPOINTMENT_RESCHEDULED`.
5. **Inventory & Admin**:
   - `STOCK_ADJUSTMENT`, `PRODUCT_UPDATED`, `PRODUCT_PRICING_UPDATED`.
6. **Payments & Financial**:
   - `PAYMENT_INITIATED`, `PAYMENT_CALLBACK_RECEIVED`, `PAYMENT_VERIFIED`, `PAYMENT_FAILED`.
7. **Notifications & Outbox**:
   - `NOTIFICATION_CREATED`, `NOTIFICATION_DISPATCHED`, `NOTIFICATION_FAILED`, `NOTIFICATION_EXHAUSTED`.

### 4.4 Audit Data Minimization
All metadata passed to `logAuditEvent` passes through `sanitizeAuditMetadata`:
- Strict key denylist prevents storing `password`, `secret`, `token`, `cvv`, `cardNumber`, `mpesa_passkey`.
- Value strings exceeding 500 characters are safely truncated to prevent log injection or bloated storage.
- Raw health records and prescription attachments are stored by reference (ID) only; raw optical medical files are never serialized into `audit_logs.metadata`.

---

## 5. Error Observability & Diagnostic Handling

The centralized error handler (`server/src/middleware/errorHandler.js`) guarantees security, predictability, and machine-readable semantics:

### 5.1 Consistent Error Response Structure
All client-facing error payloads conform to:
```json
{
  "success": false,
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Safe human-readable explanation",
    "details": null
  },
  "requestId": "req_12345678",
  "correlationId": "req_12345678"
}
```

### 5.2 Error Classification Matrix
- **400 Bad Request / Validation**: `VALIDATION_ERROR`, `BAD_REQUEST`, `CONSTRAINT_VIOLATION` (PostgreSQL `23514`), `FOREIGN_KEY_VIOLATION` (PostgreSQL `23503`).
- **401 Unauthorized**: `AUTHENTICATION_REQUIRED`, `INVALID_CREDENTIALS`.
- **403 Forbidden**: `AUTHORIZATION_DENIED`, `ROLE_MISMATCH`, `ACCESS_FORBIDDEN`.
- **404 Not Found**: `NOT_FOUND`, `RESOURCE_NOT_FOUND`.
- **409 Conflict**: `DUPLICATE_RESOURCE` (PostgreSQL `23505`), `CONFLICT`.
- **503 Service Unavailable**: `DATABASE_DEADLOCK` (PostgreSQL `40P01`), `DATABASE_UNAVAILABLE` (PostgreSQL `57P01` or connection reset), `PROVIDER_UNAVAILABLE` / `PROVIDER_DISABLED`.
- **500 Internal Server Error**: `INTERNAL_SERVER_ERROR`. In production environments (`NODE_ENV=production`), generic internal error details are masked as `"An unexpected internal error occurred"`.

---

## 6. Dependency & Readiness Diagnostics

EyeKart implements decoupled **Liveness** and **Readiness** diagnostic probes conforming to cloud-native container orchestrator specifications.

### 6.1 Liveness Probe (`GET /health` & `GET /api/health`)
- **Purpose**: Fast process liveness verification. Verifies that the Node.js event loop is responsive.
- **Checks**: Process uptime (`uptimeSeconds`), node environment, process memory consumption (`rss`, `heapUsed`, `heapTotal`).
- **Response**: HTTP 200 `{"status": "ok", "uptime": 120.4, "timestamp": "..."}`.

### 6.2 Readiness Probe (`GET /ready` & `GET /api/ready`)
- **Purpose**: Deep dependency readiness verification before routing traffic.
- **Dependencies Evaluated**:
  1. **Database**: Executes a ping query (`SELECT 1`), measures round-trip latency (`latencyMs`), and captures connection pool metrics (`totalCount`, `idleCount`, `waitingCount`).
  2. **Storage**: Verifies storage provider readiness without exposing bucket secrets or signed tokens.
  3. **Configuration**: Verifies essential runtime configuration presence (cookie secret, DB target) without credential exposure.
  4. **Transactional Outbox**: Inspects outbox queue readiness and queries current pending notification counts.
- **Status Codes**: Returns HTTP 200 when all dependencies are operational; returns HTTP 503 if any critical dependency fails (e.g. database unreachable or pool exhausted).

---

## 7. Database Resilience & Transaction Management

Located in `server/src/db/pool.js`, the database subsystem is fortified against connection exhaustion, query deadlocks, and partial failure states.

### 7.1 Connection Pool Monitoring
- Function `getPoolMetrics()` provides real-time pool metrics:
  - `totalCount`: Number of allocated PostgreSQL client connections.
  - `idleCount`: Available connections waiting in pool.
  - `waitingCount`: Queued connection requests waiting for a client.

### 7.2 Safe Transaction Helper (`withTransaction`)
The `withTransaction(callback)` pattern guarantees atomic transaction isolation:
```javascript
const result = await withTransaction(async (client) => {
  await client.query('UPDATE inventory SET stock = stock - 1 WHERE id = $1', [itemId]);
  await client.query('INSERT INTO order_items ...', [...]);
  return { success: true };
});
```
- Automatically executes `BEGIN`.
- If the callback succeeds, executes `COMMIT`.
- If any error is thrown, automatically triggers `ROLLBACK` before rethrowing.
- Always releases the connection back to the pool in a `finally` block, preventing connection leaks.

---

## 8. External Provider Degradation & Reliability

EyeKart interacts with external services (M-PESA Daraja, SMS providers, WhatsApp Business API, Cloud Storage). To protect platform availability against external latency or outages:

1. **Provider Isolation**: External calls are wrapped in defensive timeouts and try/catch handlers.
2. **Provider Classification**: Failures are mapped to structured operational errors (`PROVIDER_UNAVAILABLE`, `PROVIDER_DISABLED`).
3. **Graceful Degradation**: If an SMS or WhatsApp notification provider fails, the notification is enqueued in the transactional outbox with exponential backoff rather than failing the core clinical or commerce HTTP request.
4. **Zero Unconfigured Network Traffic**: In development and test environments, notification services default to `TestNotificationProvider` to guarantee deterministic local execution without network side-effects.

---

## 9. Transactional Outbox & Event Reliability

Located in `server/src/services/notification/notificationService.js`, the outbox system guarantees at-least-once notification delivery:

### 9.1 Outbox States & Lifecycle
- `PENDING`: Enqueued in the database atomically within the business transaction.
- `PROCESSING`: Claimed by an outbox worker lock.
- `COMPLETED`: Acknowledged by the external delivery provider.
- `FAILED`: Delivery attempt failed; scheduled for retry.

### 9.2 Bounded Retries & Exponential Backoff
- Outbox workers implement a 3-attempt bounded retry ceiling.
- Exponential backoff interval: `retry_count^2 * 30` seconds.

### 9.3 Notification Exhaustion Tracking
- When `retry_count` reaches maximum allowed attempts (3), the outbox status transitions permanently to `FAILED`.
- The worker immediately records a high-priority `NOTIFICATION_EXHAUSTED` audit log event with the recipient, channel, and error reason, triggering administrative alert visibility.

### 9.4 Outbox Health & Metrics
- The `getOutboxMetrics()` function returns real-time queue distribution:
  ```json
  {
    "counts": { "PENDING": 2, "PROCESSING": 0, "COMPLETED": 45, "FAILED": 1 },
    "oldestPending": "2026-09-20T18:00:00.000Z",
    "total": 48
  }
  ```

---

## 10. Administrative Audit & Outbox Oversight Endpoints

Strictly gated behind `requireRole('ADMIN')`, the administrative control plane provides privileged operational insights:

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/admin/audit-logs` | `GET` | `ADMIN` | Paginated query supporting multi-dimensional filters: `action`, `entity`, `entityId`, `actorId`, `actorRole`, `correlationId`, `startDate`, `endDate`. |
| `/api/admin/audit-logs/stats` | `GET` | `ADMIN` | Returns total event count, top actions distribution, and actor role distribution. |
| `/api/admin/notifications/outbox` | `GET` | `ADMIN` | Returns real-time outbox counts (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`) and oldest pending timestamp. |

---

## 11. Verification Matrix

The Phase 11 hardening suite is verified via `scratch/verify_phase11_observability_reliability.js`:

| # | Test Area | Assertion Description | Target Result |
| :--- | :--- | :--- | :--- |
| 1 | Request Tracing | Fastify generates or reflects correlation IDs in response headers | PASS |
| 2 | Log Redaction | Sensitive keys (passwords, tokens, API keys) are masked with `[REDACTED]` | PASS |
| 3 | Request Lifecycle | Request duration, actor context, and route logged on completion | PASS |
| 4 | Authentication Audit | Success, failure, logout, registration, and password change audited | PASS |
| 5 | Authorization Audit | 403 Forbidden emits `AUTHORIZATION_FAILURE` audit event | PASS |
| 6 | Data Minimization | Metadata sanitization strips secrets and truncates long strings | PASS |
| 7 | Error Sanitization | Machine-readable codes returned; internal details masked in production | PASS |
| 8 | Database Errors | PostgreSQL `23505` mapped to 409, `23514` to 400 with safe messages | PASS |
| 9 | Database Transactions | `withTransaction` commits on success and rolls back atomically on error | PASS |
| 10 | Liveness Diagnostics | `/health` returns 200 with uptime and memory usage metrics | PASS |
| 11 | Readiness Diagnostics | `/ready` evaluates DB, pool metrics, storage, config, and outbox | PASS |
| 12 | Readiness Failure | `/ready` returns 503 without leaking credentials on DB failure | PASS |
| 13 | Provider Degradation | External provider failures classified safely without crashing process | PASS |
| 14 | Outbox Exhaustion | Failed retries record `NOTIFICATION_EXHAUSTED` audit event | PASS |
| 15 | Admin Audit Querying | Multi-dimensional filtering (`action`, `actorRole`, `correlationId`) | PASS |
| 16 | Admin Outbox Metrics | Outbox queue counts accessible to ADMIN role and blocked for others | PASS |
| 17 | Historical Regressions | Phase 4 through Phase 10 + 3D/VTO regression suites pass 100% | PASS |
