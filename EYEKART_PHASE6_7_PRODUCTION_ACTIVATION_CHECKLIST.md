# EYEKART — PRODUCTION ACTIVATION CHECKLIST
**Phase:** 6.7 Readiness & Activation  
**Version:** 1.0  
**Target Architecture:** Fastify + PostgreSQL + Daraja Live + S3/R2 + KRA eTIMS + Fargo Courier  
**Document Authority:** Senior Integration QA Architect & Production Readiness Engineer  

---

## 1. Safaricom M-PESA Daraja Production Activation

The application currently runs against `MpesaDarajaProvider` in `SANDBOX` mode with mock transports. To activate live transactions, complete the following steps:

### 1.1 Daraja Developer Portal Go-Live
- [ ] Log in to Safaricom Developer Portal (`https://developer.safaricom.co.ke`).
- [ ] Submit "Go Live" request for EyeKart Kenya entity.
- [ ] Specify shortcode type:
  - **Paybill:** Standard C2B / STK Push with account number (e.g. Order Number).
  - **Till Number (Buy Goods):** Storefront retail till.
- [ ] Receive Production Consumer Key & Production Consumer Secret.
- [ ] Generate Production Passkey via the Safaricom portal.

### 1.2 Webhook & Callback Infrastructure
- [ ] Deploy production Fastify backend under verified TLS/HTTPS domain (e.g., `https://api.eyekart.ke`).
- [ ] Register HTTPS Callback URL: `https://api.eyekart.ke/api/webhooks/mpesa`.
- [ ] Verify reverse proxy (Nginx / Cloudflare) allows incoming POST requests from Safaricom IP ranges (`196.201.214.0/24`, `196.201.213.0/24`, etc.).
- [ ] Configure `MPESA_WEBHOOK_SECRET` in environment variables for HMAC header verification if Safaricom webhook signing is enabled.

### 1.3 Environment Variable Configuration
```ini
MPESA_ENVIRONMENT=LIVE
MPESA_CONSUMER_KEY=<production_consumer_key>
MPESA_CONSUMER_SECRET=<production_consumer_secret>
MPESA_PASSKEY=<production_passkey>
MPESA_SHORTCODE=<production_business_shortcode>
MPESA_CALLBACK_URL=https://api.eyekart.ke/api/webhooks/mpesa
```

---

## 2. Secure Document & Object Storage Activation

The application defaults to `LocalStorageProvider` for development and sandbox validation. For multi-instance high-availability production, activate `S3StorageProvider` (AWS S3 or Cloudflare R2):

### 2.1 Bucket Provisioning & Security Policies
- [ ] Provision AWS S3 bucket in `af-south-1` (Cape Town) or Cloudflare R2: `eyekart-production-documents`.
- [ ] **Block Public Access:** Ensure 100% public access block is turned ON. All document access MUST flow through presigned URLs generated server-authoritatively with IDOR verification.
- [ ] **Default Encryption:** Enable AES-256 or AWS KMS (`aws:kms`) server-side encryption.
- [ ] **CORS Policy:** Configure CORS allowing HTTP `PUT` from `https://eyekart.ke` with allowed headers `Content-Type`.
- [ ] **IAM Policy:** Attach least-privilege IAM user or ECS task role:
  - `s3:PutObject`
  - `s3:GetObject`
  - `s3:DeleteObject`
  - Scope strictly to `arn:aws:s3:::eyekart-production-documents/*`.

### 2.2 Environment Configuration
```ini
STORAGE_PROVIDER=S3
S3_BUCKET=eyekart-production-documents
S3_REGION=af-south-1
S3_ACCESS_KEY_ID=<iam_access_key_id>
S3_SECRET_ACCESS_KEY=<iam_secret_access_key>
```

---

## 3. Transactional Notifications Activation (SMS & Email)

The application currently routes notifications through `TestNotificationProvider`. To activate customer-facing white-glove communication:

### 3.1 SMS Provider (Africa's Talking / Twilio)
- [ ] Register Alphanumeric Sender ID `EyeKart` with the Communications Authority of Kenya (CAK) via provider portal.
- [ ] Provision API Key and Username.
- [ ] Verify template variable bindings (Order Number, Amount, M-PESA Receipt Number).
```ini
NOTIFICATION_SMS_PROVIDER=AFRICASTALKING
AT_USERNAME=eyekart
AT_API_KEY=<africastalking_api_key>
AT_SENDER_ID=EyeKart
```

### 3.2 Transactional Email (Postmark / SendGrid / AWS SES)
- [ ] Configure DNS records on `eyekart.ke`:
  - **SPF:** `v=spf1 include:sendgrid.net ~all`
  - **DKIM:** CNAME keys verified.
  - **DMARC:** `v=DMARC1; p=reject; rua=mailto:dmarc@eyekart.ke`
- [ ] Verify high-reputation dedicated IP or luxury domain sending address: `concierge@eyekart.ke`.
```ini
NOTIFICATION_EMAIL_PROVIDER=POSTMARK
POSTMARK_SERVER_TOKEN=<postmark_token>
EMAIL_FROM=EyeKart Atelier Concierge <concierge@eyekart.ke>
```

---

## 4. Courier & Fulfillment Logistics Activation

The application currently simulates tracking numbers and waybills via `TestCourierProvider`.

### 4.1 Courier API Setup (Fargo Courier / Wells Fargo)
- [ ] Establish corporate merchant account with Fargo Courier Kenya.
- [ ] Obtain API authentication credentials and Central Nairobi Hub origin code (`WESTLANDS-01`).
- [ ] Configure automatic waybill creation hook when order transitions to `PACKED`.
```ini
COURIER_PROVIDER=FARGO
FARGO_API_KEY=<fargo_api_key>
FARGO_ACCOUNT_NUMBER=<fargo_account_num>
FARGO_ORIGIN_HUB=NBO-WESTLANDS-01
```

---

## 5. KRA / eTIMS Electronic Fiscalization Activation

The application enforces a deterministic 16% VAT calculation and simulation boundary via `TestFiscalizationProvider`.

### 5.1 KRA eTIMS VSCU / OSCU Certification
- [ ] Obtain KRA Taxpayer PIN and registered eTIMS device serial number.
- [ ] Register for eTIMS Virtual Sales Control Unit (VSCU) API access.
- [ ] Configure tax rates: Standard 16% VAT, Exempt (optical corrective lenses under VAT Act schedule if applicable).
- [ ] Ensure fiscal invoice QR code URL points to live KRA portal (`https://itax.kra.go.ke/...`).
```ini
ETIMS_ENVIRONMENT=LIVE
ETIMS_TAX_PIN=A001234567Z
ETIMS_VSCU_URL=https://etims-api.kra.go.ke
ETIMS_VSCU_KEY=<kra_vscu_security_key>
```

---

## 6. Pre-Flight Production Readiness Checklist Summary

| Domain | Action Required | Status |
|---|---|---|
| **Fastify API** | Node.js production mode (`NODE_ENV=production`), cluster mode or containerized deployment | Ready |
| **PostgreSQL** | Connection pooling tuned (`max: 20`), SSL enforced (`sslmode=require`), automated backups active | Ready |
| **Secrets Management** | Zero `.env` files committed, secrets injected via AWS Secrets Manager or HashiCorp Vault | Ready |
| **CORS & Headers** | Restricted to `https://eyekart.ke`, Helmet security headers active | Ready |
| **Stitch Visuals** | 23 / 23 templates frozen and SHA-256 verified | Verified |
| **Anti-Tampering** | Server-authoritative order total and phone number gating active | Certified |
| **Idempotency** | Webhook row lock serialization (`SELECT ... FOR UPDATE`) active | Certified |
| **Clinical Rx Gating**| Optical orders cannot fulfill without `APPROVED` prescription status | Certified |
