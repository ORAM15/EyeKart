# EYEKART — PHASE 6.5: BUSINESS INPUT & CREDENTIAL MATRIX
## Production Integration Prerequisite Register (Version 1.0)

---

## 1. Executive Summary

Live third-party external integrations cannot be activated purely through software engineering. They require official corporate credentials, regulatory accreditations, commercial partner agreements, and legal documentation.

This matrix provides the exhaustive register of every business input required from EyeKart ownership before live services can be provisioned.

**Classification Legend**:
- `AVAILABLE`: Present and verified in current configuration.
- `MISSING`: Required for production; not yet provided.
- `OPTIONAL`: Enhances operations but does not block basic go-live.
- `REQUIRES BUSINESS CONFIRMATION`: Requires strategic or commercial decision by owners.
- `REQUIRES EXTERNAL PROVIDER APPROVAL`: Blocked pending external third-party KYC or technical vetting.

---

## 2. Business Input & Credential Register

### 2.1 Corporate & Legal Foundation
| Identifier / Requirement | Description | Status | Dependency / Action Owner |
|---|---|:---:|---|
| **Registered Business Name** | EyeKart Optical Kenya Limited (or Atelier trading name) | `REQUIRES BUSINESS CONFIRMATION` | EyeKart Legal / Owners |
| **Certificate of Incorporation** | Official registrar of companies registration number | `MISSING` | Required for Safaricom & KRA KYC |
| **CR12 Document** | Official list of directors and shareholders ($< 90$ days old) | `MISSING` | Required for Safaricom Merchant KYC |
| **Business Bank Account** | Dedicated commercial bank account for settlement | `MISSING` | Required for M-PESA settlement linkage |
| **Data Protection Registration** | Office of Data Protection Commissioner (ODPC) Certificate | `REQUIRES EXTERNAL PROVIDER APPROVAL` | Mandatory under Kenya Data Protection Act |

---

### 2.2 Safaricom M-PESA / Daraja 2.0 Integration
| Identifier / Requirement | Description | Status | Dependency / Action Owner |
|---|---|:---:|---|
| **Business Shortcode** | Official Paybill Number or Buy Goods Till Number | `MISSING` | Safaricom Corporate KYC Approval |
| **Daraja Portal Account** | Registered account on `developer.safaricom.co.ke` | `MISSING` | EyeKart Tech / Business Admin |
| **Consumer Key (Live)** | OAuth 2.0 client identifier for production Daraja | `REQUIRES EXTERNAL PROVIDER APPROVAL` | Safaricom Daraja Production Vetting |
| **Consumer Secret (Live)** | OAuth 2.0 client secret for production Daraja | `REQUIRES EXTERNAL PROVIDER APPROVAL` | Safaricom Daraja Production Vetting |
| **Online Passkey** | Cryptographic secret for generating STK Push Password | `REQUIRES EXTERNAL PROVIDER APPROVAL` | Generated in Daraja portal upon go-live |
| **B2C / Reversal Initiator** | Username authorized to initiate refunds/reversals | `MISSING` | Required for automated order refunds |
| **Initiator Security Credential** | RSA encrypted password for initiator operations | `MISSING` | Generated using Safaricom Public Cert |
| **Public HTTPS Webhook URL** | Whitelisted endpoint for receiving STK callbacks | `REQUIRES BUSINESS CONFIRMATION` | Requires production domain (`api.eyekart.ke`) |

---

### 2.3 Kenya Revenue Authority (eTIMS) Fiscalization
| Identifier / Requirement | Description | Status | Dependency / Action Owner |
|---|---|:---:|---|
| **Company KRA PIN** | 11-character corporate tax identifier (e.g. `P05...`) | `MISSING` | KRA Corporate Registration |
| **Tax Compliance Certificate** | Valid KRA TCC for corporate eligibility | `MISSING` | EyeKart Finance |
| **eTIMS Integration Option** | Choice: Physical OSCU Box vs Virtual VSCU Server vs API | `REQUIRES BUSINESS CONFIRMATION` | EyeKart Finance / Operations |
| **Control Unit Serial Number** | Hardware/Virtual Control Unit device serial identifier | `REQUIRES EXTERNAL PROVIDER APPROVAL` | Issued by KRA / Accredited Vendor |
| **Cryptographic Signing Key** | Private key / certificate used to sign fiscal invoices | `REQUIRES EXTERNAL PROVIDER APPROVAL` | Loaded into OSCU / VSCU device |
| **eTIMS Technical API Key** | Client credential if using KRA Online eTIMS API | `MISSING` | KRA eTIMS Developer Access |

---

### 2.4 Cloud Document & Object Storage
| Identifier / Requirement | Description | Status | Dependency / Action Owner |
|---|---|:---:|---|
| **Cloud Storage Provider** | Selection: AWS S3 (Cape Town `af-south-1`) vs Cloudflare R2 | `REQUIRES BUSINESS CONFIRMATION` | Infrastructure Architect |
| **Storage Bucket Name** | Dedicated private bucket (e.g. `eyekart-prescriptions-prod`) | `MISSING` | Cloud Provisioning |
| **Storage Access Key ID** | IAM programmatic access key with restricted S3 policy | `MISSING` | Cloud Administrator |
| **Storage Secret Access Key** | IAM secret key for presigned URL generation | `MISSING` | Cloud Administrator |
| **Bucket Retention Policy** | Policy for archiving or purging expired medical images | `REQUIRES BUSINESS CONFIRMATION` | Compliance / Clinical Director |

---

### 2.5 Transactional Messaging (SMS & Email)
| Identifier / Requirement | Description | Status | Dependency / Action Owner |
|---|---|:---:|---|
| **SMS Provider Account** | Africa's Talking, Twilio, or Infobip merchant account | `MISSING` | EyeKart Operations |
| **Alphanumeric Sender ID** | Registered sender name: `EYEKART` with CAK approval | `REQUIRES EXTERNAL PROVIDER APPROVAL` | Communications Authority of Kenya (CAK) |
| **SMS API Key** | Production programmatic token for SMS dispatch | `MISSING` | SMS Gateway Portal |
| **Email Delivery Account** | Resend, Postmark, or SendGrid production account | `MISSING` | EyeKart Operations |
| **Sender Domain Verification** | SPF, DKIM, DMARC records for `atelier@eyekart.ke` | `REQUIRES BUSINESS CONFIRMATION` | DNS Administrator |

---

### 2.6 Logistics & Delivery Integration
| Identifier / Requirement | Description | Status | Dependency / Action Owner |
|---|---|:---:|---|
| **Logistics Provider Agreement** | Commercial contract: Sendy, Glovo Business, or Fargo | `REQUIRES BUSINESS CONFIRMATION` | EyeKart Operations / Logistics |
| **Courier API Credentials** | Client ID & API Token for automated dispatch | `REQUIRES EXTERNAL PROVIDER APPROVAL` | Logistics Provider Portal |
| **Pickup Depot Address** | Default central lab dispatch address in Westlands | `AVAILABLE` | Seeded in schema (`westlands`) |
| **Proof of Delivery Protocol** | Policy: OTP code vs digital signature vs ID photo | `REQUIRES BUSINESS CONFIRMATION` | Operations Director |

---

### 2.7 Clinical & Regulatory Governance
| Identifier / Requirement | Description | Status | Dependency / Action Owner |
|---|---|:---:|---|
| **Lead Clinician License** | Optometrists Council of Kenya (OCK) registration number | `MISSING` | Required on clinical examination reports |
| **Pharmacy & Poisons Board** | Medical device / ophthalmic appliance dispensary license | `REQUIRES EXTERNAL PROVIDER APPROVAL` | PPB Kenya Regulatory Clearance |
| **Insurance Underwriter Contracts**| EDI adjudication agreements with CarePay, Jubilee, AAR | `BLOCKED BY BUSINESS INPUT` | Corporate Health Insurance Deals |

---

### 2.8 Production Domain & Infrastructure
| Identifier / Requirement | Description | Status | Dependency / Action Owner |
|---|---|:---:|---|
| **Registered Apex Domain** | Purchase of `eyekart.ke` or approved production domain | `REQUIRES BUSINESS CONFIRMATION` | Domain Registrar (KeNIC / Cloudflare) |
| **Managed TLS Certificate** | Wildcard SSL certificate (`*.eyekart.ke`) | `MISSING` | Let's Encrypt / Cloudflare Edge |
| **Managed PostgreSQL Host** | Production managed database (e.g. AWS RDS / Neon / Supabase) | `MISSING` | Infrastructure Provisioning |
