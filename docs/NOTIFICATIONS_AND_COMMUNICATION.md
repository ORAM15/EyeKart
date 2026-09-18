# EyeKart Healthcare Limited — Notifications, Communication & Event Delivery Hardening

## 1. Notification Architecture & Event Dispatch Pipeline

EyeKart Healthcare Limited (Nairobi, Kenya) operates a mission-critical optical commerce and clinical healthcare platform. Communications to customers, clinicians, and operational staff must satisfy high reliability, transaction atomicity, clinical privacy, and strict channel delivery guarantees.

### Event Dispatch Pipeline
```
[ Business Event / Workflow ]
   (Order Placed, M-PESA Confirmed, Prescription Approved, Appointment Booked, etc.)
                │
                ▼
┌──────────────────────────────────────────────┐
│  Atomic DB Transaction (BEGIN ... COMMIT)    │
│  1. Business mutations (orders, payments)    │
│  2. INSERT INTO notifications (PENDING)      │
│  3. INSERT INTO notification_outbox (UNSENT) │
└───────────────────────┬──────────────────────┘
                        │ (Post-Commit Dispatch or Outbox Poller)
                        ▼
┌──────────────────────────────────────────────┐
│        notificationService.js                │
│  • Preference & Mandatory Check              │
│  • Data Minimization & Payload Sanitization   │
│  • Idempotency Key Evaluation                │
│  • Delivery State Transition: PROCESSING     │
└───────────────────────┬──────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────┐
│         Channel Provider Router              │
│  ┌───────────────┬──────────────┬──────────┐ │
│  │ EmailProvider │ SmsProvider  │ WhatsApp │ │
│  └───────┬───────┴──────┬───────┴────┬─────┘ │
└──────────┼──────────────┼────────────┼───────┘
           │              │            │
           ▼              ▼            ▼
     SES / SMTP       Africa's     Meta Cloud
     (or DISABLED)    Talking      API
```

When an event occurs within a service (`orderService`, `webhookService`, `paymentService`, `prescriptionService`, `reviewService`, `fulfillmentService`, `appointmentService`, `authService`), the notification record is persisted in the same ACID database transaction via `enqueueOutbox({ client, ... })`. If the business transaction aborts or rolls back, no phantom notification is dispatched. Once committed, the notification is processed immediately asynchronously, or reclaimed by the background outbox worker (`processOutbox`) using `FOR UPDATE SKIP LOCKED`.

---

## 2. Supported Channels & Provider Abstraction

EyeKart implements an extensible, provider-agnostic abstraction rooted in the base class `NotificationProvider` (`server/src/services/notification/NotificationProvider.js`).

### Channels
1. **`EMAIL`**: Transactional email for order confirmations, optical prescription reviews, tracking links, and account security.
2. **`SMS`**: High-priority mobile notifications for M-PESA payment receipts, dispatch alerts, and clinic appointment updates, formatted to canonical Kenyan standards (`+254` / `254XXXXXXXXX`).
3. **`WHATSAPP`**: Direct conversational updates via WhatsApp Business API / Meta Cloud API for real-time customer status updates.

### Provider Abstraction Interface
Every provider subclass extends `NotificationProvider` and implements:
- `send({ recipient, subject, body, metadata })`: Returns `{ success, providerRef, error, failureCategory, isRetryable }`.
- `validateRecipient(recipient)`: Channel-specific validation (RFC 5322 regex for emails, E.164 Kenyan prefix validator for SMS/WhatsApp).
- `isConfigured()`: Boolean flag indicating whether production credentials exist in the environment.

### Production Implementations
- **`EmailProvider`**: Supports AWS SES / SMTP. When unconfigured, deterministically returns `{ success: false, failureCategory: 'PROVIDER_DISABLED', isRetryable: false }`.
- **`SmsProvider`**: Supports Africa's Talking / Twilio SMS gateways. Validates Kenyan mobile MSISDNs (`2547XXXXXXXX` or `2541XXXXXXXX`).
- **`WhatsAppProvider`**: Supports Meta Cloud API. Validates Kenyan phone recipients and delivers templated messages.

---

## 3. Test Provider Specification & Local Verification

For CI/CD pipelines, local developer environments, and automated regression suites, EyeKart supplies `TestNotificationProvider` (`server/src/services/notification/TestNotificationProvider.js`).

### Capabilities:
- **In-Memory Capture**: Captures all outgoing dispatches without sending live external network packets:
  - `getDispatches()` / `getDispatchesByRecipient(recipient)` / `getDispatchesByChannel(channel)`.
- **Failure Simulation**: Allows deterministic fault injection for testing retry policies and backoff behavior:
  - `simulateFailure({ channel, category, error, remainingCount })`.
- **Configurable Availability**: Can simulate offline or disabled provider scenarios via `setConfigured(boolean)`.
- **Zero Data Leakage**: Dispatches are stored in memory and can be cleared between test cases using `clear()`.

---

## 4. Transactional Outbox Pattern & Reliability Guarantees

To prevent dual-write anomalies (e.g., an order being created but the notification failing, or a notification being sent before the order transaction commits):

1. **Transactional Insertion (`enqueueOutbox`)**:
   - Both `notifications` and `notification_outbox` tables receive rows inside the caller's database transaction (`client.query(...)`).
   - If the caller rolls back, the notification and outbox entries are discarded.
2. **Outbox State Machine (`notification_outbox.status`)**:
   - `UNSENT`: Initial state waiting for dispatch worker.
   - `SENT`: Dispatched successfully; deleted or archived.
   - `DEAD_LETTER`: Exhausted maximum retry attempts (capped at 3).
3. **Concurrency-Safe Worker (`processOutbox`)**:
   - Selects pending outbox records using `FOR UPDATE SKIP LOCKED` to allow multiple concurrent server instances without duplicate dispatches or locking contention.

---

## 5. Delivery State Machine & Terminal Transitions

All notification entities transition through a strict state machine validated by `NotificationProvider.isValidTransition(from, to)`.

```
                    ┌───────────┐
                    │  PENDING  │
                    └─────┬─────┘
                          │
                          ▼
                   ┌──────────────┐
     ┌────────────►│  PROCESSING  ├────────────┐
     │             └──────┬───────┘            │
     │                    │                    │
     │ (Retryable         ▼                    ▼
     │  Failure)     ┌─────────┐          ┌─────────┐
     └───────────────┤ FAILED  │          │  SENT   │ (Terminal)
                     └────┬────┘          └─────────┘
                          │
                          ▼ (Exhausted attempts)
                     ┌───────────┐
                     │ CANCELLED │ (Terminal)
                     └───────────┘
```

### Transition Matrix
- `PENDING` -> `PROCESSING`, `CANCELLED`
- `PROCESSING` -> `SENT`, `FAILED`
- `FAILED` -> `PROCESSING` (on retry), `CANCELLED` (terminal failure)
- `SENT` -> *(None, terminal state)*
- `CANCELLED` -> *(None, terminal state)*

Attempting an invalid state transition (e.g., transitioning from `SENT` back to `PROCESSING`) throws an `Invalid notification state transition` error.

---

## 6. Idempotency Key Design & Duplicate Prevention

To eliminate duplicate customer notifications caused by network retries, M-PESA webhook retries, or concurrent workers:

### Key Structure
`idempotencyKey = ${templateId}:${resourceId}:${channel}:${recipient}`

Example: `ORDER_CREATED:EK-2026-0001:EMAIL:customer@example.com`

### Database Enforcement
- The `notifications` table has a `UNIQUE (idempotency_key)` index.
- If a duplicate dispatch is attempted with the same idempotency key, `notificationService` intercepts the collision or catches PostgreSQL error code `23505`, loads the existing notification record, and returns `{ notification: existing, idempotentHit: true }` without triggering a duplicate provider dispatch.

---

## 7. Retry Policy, Exponential Backoff & Dead-Letter Handling

### Retry Rules
- **Maximum Attempts**: 3 attempts total.
- **Exponential Backoff Formula**:
  `backoffMs = 1000 * 2^(attempt - 1)` (1s for attempt 1, 2s for attempt 2, 4s for attempt 3).
- **Scheduled Next Attempt**: `next_retry_at = CURRENT_TIMESTAMP + backoffMs`.

### Dead-Letter Isolation
When `attempt_count >= max_attempts`, the notification is marked `FAILED`, the outbox entry transitions to `DEAD_LETTER`, and further retries are ceased. An alert log is emitted for operations oversight.

---

## 8. Error Classification (Transient vs Permanent)

Failures returned by providers or internal pipeline stages are classified into standard categories (`FAILURE_CATEGORIES`):

| Category | Description | Retryable? |
|---|---|:---:|
| `PROVIDER_DISABLED` | Provider not configured with credentials in environment | No |
| `INVALID_RECIPIENT` | Malformed email address or non-Kenyan phone number | No |
| `INVALID_CHANNEL` | Channel not supported | No |
| `INVALID_TEMPLATE` | Unknown template ID | No |
| `PERMANENT_PROVIDER_ERROR` | Upstream provider 4xx reject (e.g. invalid sender ID) | No |
| `TEMPORARY_PROVIDER_ERROR` | Upstream provider 5xx or connection reset | Yes |
| `PROVIDER_TIMEOUT` | Gateway HTTP/network timeout (> 10s) | Yes |
| `RATE_LIMITED` | Upstream provider 429 Too Many Requests | Yes |

Only transient errors schedule a retry. Permanent errors immediately terminate the delivery attempt to conserve provider quota and prevent poison loops.

---

## 9. Security, Privacy & Sensitive Optical/Medical Data Minimization

In compliance with Kenyan Data Protection Act (DPA 2019) and healthcare confidentiality standards:

1. **Strict Field Exclusion**:
   - Customer passwords, plaintext tokens, JWT secrets, payment card CVVs, and raw bank credentials are NEVER included in notification payloads or templates.
2. **Clinical Optical Data Minimization**:
   - Notifications concerning prescriptions (e.g., `PRESCRIPTION_APPROVED`, `PRESCRIPTION_CLARIFICATION_REQUIRED`) convey status and reference IDs only.
   - Specific refractive optical values (Sphere, Cylinder, Axis, Add, PD) are NEVER transmitted over unencrypted SMS or open email subjects. Customers must view their clinical records within the authenticated portal.
3. **Header Injection Protection (CRLF Prevention)**:
   - Email subjects, recipient addresses, and header fields are sanitized by stripping `\r` and `\n` characters before dispatch to prevent SMTP header splitting and Bcc spam injection.
4. **HTML Escaping**:
   - All interpolated variables in HTML email templates are sanitized through an entity escaping function (`escapeHtml`) preventing XSS in email clients.

---

## 10. Customer Ownership, IDOR Protection & RBAC

### Customer Notification Routes
- `GET /api/notifications`: Returns the authenticated customer's notifications.
- Filtered strictly by `user_id = req.user.id`.
- IDOR Protection: A customer attempting to supply or query another user's ID receives only their own records.
- Paginated with bounded limits (`limit <= 50`).

### Admin Operational Routes
- `GET /api/admin/notifications`: System-wide notification audit log.
- RBAC Enforcement: Guarded by `requireRole('ADMIN')`. Non-admin users (customers, optometrists) receive `403 Forbidden`.
- Filterable by `channel`, `status`, `templateId`, and `dateRange`.

### Rate Limiting
- Notification API endpoints are protected by `RateLimiter(60, 60000)` (60 requests per minute per IP/user).

---

## 11. Communication Preferences & Mandatory Enforcement

### Preference Matrix (`notification_preferences` table)
Customers can manage channel preferences (email, SMS, WhatsApp) and opt-out of marketing communications via:
- `GET /api/notifications/preferences`
- `PATCH /api/notifications/preferences`

### Mandatory Transactional Enforcement
Transactional, clinical, and security notifications **CANNOT** be disabled by customers:
- Order lifecycle (`ORDER_CREATED`, `ORDER_CONFIRMED`, `ORDER_CANCELLED`, `ORDER_PROCESSING`, `ORDER_SHIPPED`, `ORDER_DELIVERED`)
- Payment receipts (`PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `PAYMENT_EXPIRED`, `REFUND_PROCESSED`)
- Prescription reviews (`PRESCRIPTION_SUBMITTED`, `PRESCRIPTION_APPROVED`, `PRESCRIPTION_REJECTED`, `PRESCRIPTION_CLARIFICATION_REQUIRED`)
- Clinic appointments (`APPOINTMENT_BOOKED`, `APPOINTMENT_CANCELLED`, `APPOINTMENT_REMINDER`)
- Account security (`ACCOUNT_CREATED`, `PASSWORD_CHANGED`, `PASSWORD_RESET_REQUEST`)

Attempting to update preferences to disable mandatory categories returns a `400 Bad Request` with code `CANNOT_DISABLE_MANDATORY_NOTIFICATIONS`.

---

## 12. External Provider Configuration & Production Deployment Checklist

When transitioning from test/disabled mode to live Kenyan production:

### 1. Environment Variables Configuration
Set the following production environment variables:
```bash
# Email (AWS SES / SMTP)
NOTIFICATION_EMAIL_ENABLED=true
SMTP_HOST=email-smtp.eu-west-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=AKIAxxxxxxxxxxxx
SMTP_PASS=xxxxxxxxxxxxxxxxxxxx
NOTIFICATION_EMAIL_FROM="EyeKart Healthcare <eyekarthealthcare@gmail.com>"

# SMS (Africa's Talking / Kenya Gateway)
NOTIFICATION_SMS_ENABLED=true
AT_API_KEY=xxxxxxxxxxxxxxxxxxxx
AT_USERNAME=eyekart
AT_SENDER_ID=EYEKART

# WhatsApp (Meta Cloud API)
NOTIFICATION_WHATSAPP_ENABLED=true
WHATSAPP_API_TOKEN=EAABxxxxxxxxxxxxxxxxxxxx
WHATSAPP_PHONE_NUMBER_ID=1000xxxxxxxxxxx
WHATSAPP_TEMPLATE_NAMESPACE=eyekart_healthcare
```

### 2. Provider Disabled Fallback Verification
Ensure that if credentials are unset or invalid, the system logs an operational warning and safely stores the notification with `failureCategory: 'PROVIDER_DISABLED'` without crashing or returning fake `SENT` states.

### 3. Outbox Poller Activation
Start the background outbox worker in your process manager (PM2 / Kubernetes worker pod):
```javascript
// Schedule outbox processing every 5 seconds
setInterval(async () => {
  await notificationService.processOutbox(50);
}, 5000);
```

### 4. Verification Check
Run the Phase 8 end-to-end verification suite:
```bash
node scratch/verify_phase8_notifications.js
```
Confirm that all 28/28 test assertions and existing regression suites pass with zero errors.
