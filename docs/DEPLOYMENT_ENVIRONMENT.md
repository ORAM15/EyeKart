# EyeKart Production Runtime & Deployment Environment Specification
**Document Version**: 2.0 (Phase 2B Hardened)  
**Target Platform**: EyeKart Optical Commerce & Clinical Healthcare  
**Legal Entity**: EYE KART HEALTHCARE LIMITED (Nairobi, Kenya)  

---

## 1. Overview & Architecture Topologies

EyeKart supports two conventional production deployment topologies:

### Topology A: Unified Reverse-Proxy Origin (Recommended)
- A reverse proxy (e.g. Nginx, AWS ALB, Cloudflare) handles SSL termination on `https://eyekart.co.ke`.
- `/api/*`, `/health`, `/ready` are reverse-proxied to Fastify on `http://127.0.0.1:3001`.
- Static frontend panels and assets are served directly via reverse proxy or CDN.
- `eyekart-api-adapter.js` automatically uses relative paths (`''`), eliminating cross-origin CORS overhead and sharing secure cookies seamlessly.

### Topology B: Decoupled Origin Architecture
- Backend is deployed on an API subdomain (e.g. `https://api.eyekart.co.ke`).
- Frontend is deployed on a CDN or static web host (e.g. `https://eyekart.co.ke`).
- `window.EYEKART_CONFIG = { API_BASE: 'https://api.eyekart.co.ke' }` is injected into frontend runtime.
- Fastify strictly validates incoming `Origin` against `CORS_ORIGIN`.

---

## 2. Environment Variables by Category

### Category 1: SERVER & RUNTIME
| Variable | Purpose | Required | Example | Secret? | Dev Behavior | Prod Behavior |
| :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `NODE_ENV` | Runtime mode | Yes | `production` | No | Defaults to `development`. | Must be `production`. Enables strict security, opaque 500 errors, secure cookies. |
| `PORT` | HTTP port | No | `3001` | No | Defaults to `3001`. | Binds to specified port (or container default). |
| `HOST` | Network interface | No | `0.0.0.0` | No | Defaults to `127.0.0.1`. | Defaults to `0.0.0.0` in production for container/cloud ingress. |
| `TRUST_PROXY` | Reverse proxy trust | No | `true` | No | Defaults to `false`. | Defaults to `true` in production to extract real client IP from `X-Forwarded-For`. |
| `LOG_LEVEL` | Fastify log level | No | `info` | No | `debug` | `info` (redacting auth headers, cookies, passwords). |
| `SHUTDOWN_TIMEOUT_MS` | Graceful shutdown timeout | No | `10000` | No | `10000` (10s) | `10000` (10s). Forces process termination if hung. |

---

### Category 2: DATABASE (POSTGRESQL)
| Variable | Purpose | Required | Example | Secret? | Dev Behavior | Prod Behavior |
| :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `DATABASE_URL` | Full managed PostgreSQL URI | Yes* | `postgres://user:pass@ep-corp.rds.amazonaws.com:5432/eyekart_prod?sslmode=require` | **YES** | Optional (falls back to discrete params). | Preferred for cloud databases (AWS RDS, Neon, Supabase). |
| `DB_HOST` | Database server host | Yes* | `rds.eyekart.internal` | No | Defaults to `127.0.0.1`. | Required if `DATABASE_URL` is omitted. |
| `DB_PORT` | Database server port | No | `5432` | No | Defaults to `5432`. | Defaults to `5432`. |
| `DB_NAME` | Database name | Yes* | `eyekart_prod` | No | Defaults to `eyekart_dev`. | Required if `DATABASE_URL` is omitted. |
| `DB_USER` | Database username | Yes* | `eyekart_app` | No | Defaults to `postgres`. | Required if `DATABASE_URL` is omitted. |
| `DB_PASSWORD` | Database password | Yes* | `StrongSecretPass123!` | **YES** | Defaults to empty string. | Required if `DATABASE_URL` is omitted. |
| `DB_SSL` | Enable database TLS | Yes | `true` | No | Defaults to `false`. | Set to `true`, `require`, or `verify-full`. |
| `DB_SSL_CA` | Trusted CA bundle inline PEM | No | `-----BEGIN CERTIFICATE-----\n...` | No | None. | Verifies server certificate against trusted CA. |
| `DB_SSL_CA_PATH` | Trusted CA bundle file path | No | `/etc/ssl/certs/rds-ca-bundle.pem` | No | None. | Reads CA bundle from secure container mount. |
| `DB_SSL_INSECURE_SKIP_VERIFY` | Temporary bypass for self-signed DB | No | `false` | No | False. | Must remain `false` in production. Loud warning if enabled. |
| `DB_POOL_MAX` | Max pool connections | No | `20` | No | Defaults to `20`. | Sized to workload and DB instance limits. |
| `DB_IDLE_TIMEOUT_MS` | Idle client timeout | No | `30000` | No | 30,000 ms. | 30,000 ms. |
| `DB_CONNECTION_TIMEOUT_MS` | Connection acquisition timeout | No | `5000` | No | 5,000 ms. | 5,000 ms. Fails fast if DB pool is exhausted. |

*\*Note: Either `DATABASE_URL` or discrete parameters (`DB_HOST`, `DB_NAME`, `DB_USER`) must be provided.*

---

### Category 3: OBJECT STORAGE (AWS S3 & CLOUDFLARE R2)
| Variable | Purpose | Required | Example | Secret? | Dev Behavior | Prod Behavior |
| :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `STORAGE_PROVIDER` | Storage backend driver | Yes | `S3` | No | Defaults to `LOCAL`. | Must be `S3`. `LOCAL` is rejected with fatal error. |
| `S3_BUCKET` | Medical document bucket | Yes | `eyekart-medical-documents-prod` | No | None. | Required. Private bucket with AES256 encryption. |
| `S3_REGION` | Storage region | Yes | `af-south-1` | No | Defaults to `af-south-1`. | Required (`auto` for Cloudflare R2). |
| `S3_ACCESS_KEY_ID` | Storage access key | Yes | `AKIAIOSFODNN7EXAMPLE` | **YES** | None. | Required IAM / R2 credential. |
| `S3_SECRET_ACCESS_KEY` | Storage secret key | Yes | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` | **YES** | None. | Required IAM / R2 credential. |
| `S3_ENDPOINT` | Custom endpoint URL | No | `https://<account-id>.r2.cloudflarestorage.com` | No | None. | Required when using Cloudflare R2 or MinIO. |
| `S3_FORCE_PATH_STYLE` | Path-style addressing | No | `false` | No | False. | Set `true` only for MinIO or legacy S3 buckets. |
| `S3_PRESIGNED_EXPIRY_SECONDS`| URL expiration time | No | `900` | No | 900s (15m). | 900s (15m). Enforces short-lived private access. |

---

### Category 4: AUTHENTICATION & SECRETS
| Variable | Purpose | Required | Example | Secret? | Dev Behavior | Prod Behavior |
| :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `SESSION_SECRET` | Auth session token HMAC key | Yes | `prod_crypto_session_secret_32_chars_min!` | **YES** | Insecure default allowed. | **FAIL-FAST**: Must be >= 32 chars and non-default. |
| `COOKIE_SECRET` | Cookie signing secret | Yes | `prod_crypto_cookie_secret_32_chars_min!` | **YES** | Insecure default allowed. | **FAIL-FAST**: Must be >= 32 chars and non-default. |
| `SESSION_TTL_HOURS` | Session lifetime | No | `24` | No | Defaults to 24 hours. | Defaults to 24 hours. |

---

### Category 5: CORS (CROSS-ORIGIN RESOURCE SHARING)
| Variable | Purpose | Required | Example | Secret? | Dev Behavior | Prod Behavior |
| :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `CORS_ORIGIN` | Allowed HTTP frontend origins | Yes | `https://eyekart.co.ke,https://www.eyekart.co.ke` | No | Defaults to localhost (port 3000). | **FAIL-FAST**: Must be explicitly defined without localhost. |

---

### Category 6: APPLICATION & RATE LIMITING
| Variable | Purpose | Required | Example | Secret? | Dev Behavior | Prod Behavior |
| :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `AUTH_RATE_LIMIT_MAX` | Max auth attempts per window | No | `5` | No | Defaults to 5 requests. | Configurable brute-force threshold. |
| `AUTH_RATE_LIMIT_WINDOW_MS`| Rate limit sliding window | No | `60000` | No | Defaults to 60,000 ms (1m). | Configurable sliding window in milliseconds. |

---

## 3. Operational Health & Readiness Probes

### Liveness Probe (`GET /health` and `GET /api/health`)
- **Use Case**: Kubernetes liveness probe, AWS ALB target health check, Docker healthcheck.
- **Expected Status**: `200 OK`
- **Response Format**:
  ```json
  {
    "status": "ok",
    "uptimeSeconds": 142,
    "timestamp": "2026-09-16T05:00:00.000Z"
  }
  ```

### Readiness Probe (`GET /ready` and `GET /api/ready`)
- **Use Case**: Kubernetes readiness probe, zero-downtime rolling deployment traffic gate.
- **Checks**:
  - PostgreSQL live connectivity (`SELECT 1`).
  - Storage provider initialization (`isConfigured === true`).
- **Expected Status**: `200 OK` when dependencies are operational; `503 Service Unavailable` if degraded.
- **Response Format**:
  ```json
  {
    "status": "ready",
    "checks": {
      "database": "ok",
      "storage": "ok"
    },
    "timestamp": "2026-09-16T05:00:00.000Z"
  }
  ```

---

## 4. Deployment Lifecycle Commands

```bash
# 1. Install Production Dependencies
npm --prefix server ci --only=production

# 2. Execute Explicit Database Migrations (Run as deployment step)
node server/src/db/schema.js

# 3. (Optional) Run Explicit Database Seeding (Initial setup only)
node server/src/db/seed.js

# 4. Start Production Server
NODE_ENV=production node server/src/server.js
```
