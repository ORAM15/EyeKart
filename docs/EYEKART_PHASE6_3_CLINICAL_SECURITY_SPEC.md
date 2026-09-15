# EyeKart — Phase 6.3: Clinical Data Security & Access Control Specification
**Version:** 1.0  
**Domain:** Security Architecture / RBAC / Data Integrity  

---

## 1. Threat Model & Attack Vectors

The optical commerce clinical workflow introduces sensitive customer biometric and refractive data. EyeKart implements defense-in-depth against key attack vectors:

### 1.1 Insecure Direct Object References (IDOR)
- **Threat**: Customer A accesses or modifies Customer B's prescription by changing the prescription ID in API calls (`GET /api/prescriptions/:id` or `POST /api/prescriptions/:id/clarification`).
- **Mitigation**: The backend strictly verifies that `prescription.user_id === req.user.id`. Any unauthorized access attempt yields HTTP 403 Forbidden (`FORBIDDEN_PRESCRIPTION_ACCESS`), except for authenticated staff with the server-verified role `OPTOMETRIST` or `ADMIN`.

### 1.2 Privilege Escalation & Self-Approval
- **Threat**: A customer attempts to self-approve their prescription, self-reject, or access the optometrist review queue.
- **Mitigation**: All clinical endpoints under `/api/optometrist/*` require the server-verified role `OPTOMETRIST` or `ADMIN`. Client role assertions in headers or JWT claims are ignored; roles are resolved exclusively from server-side database sessions.

### 1.3 Reviewer Identity Spoofing
- **Threat**: An attacker submits a request attempting to supply a fake reviewer ID or doctor name (`reviewer_name: "Dr. Real Doctor"`).
- **Mitigation**: Review records derive `reviewer_id` and `reviewer_name` exclusively from the authenticated session user object (`req.user`). Any payload fields attempting to inject reviewer identity are ignored or rejected.

### 1.4 Review Timestamp Tampering
- **Threat**: An attacker attempts to backdate or forge an approval timestamp.
- **Mitigation**: The database column `created_at` uses PostgreSQL default `CURRENT_TIMESTAMP`. Reviews are immutable and append-only; updates and deletions are not permitted.

### 1.5 Clinical Parameter Tampering via Arbitrary Mutations
- **Threat**: A customer sends a `PATCH /api/prescriptions/:id` with `{ status: "APPROVED" }`.
- **Mitigation**: Arbitrary PATCH endpoints reject attempts to manipulate status or reviewer metadata with HTTP 403 Forbidden (`FORBIDDEN_STATUS_MODIFICATION`).

---

## 2. Optometrist Test Account Governance

- **Designation**: Optometrist accounts in test environments are explicitly marked:
  - Account: `dev-optom@eyekart.test`
  - Display Name: `Development Optometrist (TEST ONLY)`
- **Policy**: Under no circumstances should real clinician names, Kenya Optometrists and Optical Centers Board (OCK) registration numbers, or NHS PINs be seeded into development or staging environments.
- **Production Readiness**: Real clinician onboarding requires verified professional credentials and explicit business sign-off.

---

## 3. Data Protection & Regulatory Disclaimers

> [!NOTE]
> - **Regulatory Compliance**: This software is not certified as an Electronic Health Record (EHR) system. No claims of Kenya Data Protection Act (DPA) healthcare certification, HIPAA compliance, or MOH medical device clearance are made.
> - **Document Retention**: Prescription upload storage and long-term medical data retention rules are marked `BUSINESS CONFIRMATION REQUIRED`.
