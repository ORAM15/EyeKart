# EYEKART — DATA OWNERSHIP & CLASSIFICATION MATRIX
## Phase 6.0 Entity Governance & Boundary Audit
**Authoritative Data Architecture Directive**  
**Version:** 1.0  
**Date:** September 15, 2026  
**Status:** COMPLETE & AUTHORITATIVE  
**Classification:** `PASS — DATA OWNERSHIP MATRIX COMPLETE`  

---

## 1. EXECUTIVE SUMMARY

This matrix defines the authoritative data ownership, security classification, read/write boundaries, and storage lifecycle for all thirty-two (32) entities identified within the EyeKart Optical Commerce Platform.

### Core Governance Principles:
1. **Zero Client Authority on Finances:** Prices, taxes, surcharges, and order totals are strictly server-owned.
2. **Clinical Data Privacy:** Prescriptions and clinical examination notes are classified as sensitive personal health data requiring field-level encryption, restricted optometrist access, and immutable audit logs.
3. **Biometric Ephemerality:** Face meshes, eye landmarks, and camera streams are classified as transient client memory and must never be captured in persistent storage.

---

## 2. COMPREHENSIVE DATA OWNERSHIP MATRIX

The table below classifies each entity across ten (10) required architectural criteria:

| Entity Name | Current Source of Truth | Required Production Source | Client Readable? | Client Writable? | Server Only? | Sensitive? | PII? | Clinical? | Payment? | Audit Req? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Product** | `catalog-data.js` | PostgreSQL `products` table | YES | NO | NO | NO | NO | NO | NO | YES |
| **Variant** | `catalog-data.js` | PostgreSQL `product_variants` | YES | NO | NO | NO | NO | NO | NO | YES |
| **Category** | `catalog-data.js` | PostgreSQL `categories` table | YES | NO | NO | NO | NO | NO | NO | NO |
| **Collection** | `catalog-data.js` | PostgreSQL `collections` | YES | NO | NO | NO | NO | NO | NO | NO |
| **Customer** | `localStorage` (user) | PostgreSQL `users` table | YES (own) | Controlled | NO | YES | YES | NO | NO | YES |
| **Guest Customer** | `localStorage` | Redis session / Order snapshot | YES (own) | Controlled | NO | YES | YES | NO | NO | YES |
| **Address** | `localStorage` | PostgreSQL `user_addresses` | YES (own) | YES (own) | NO | YES | YES | NO | NO | YES |
| **Cart** | `localStorage` (cart) | Redis cache / PostgreSQL `carts`| YES (own) | Controlled | NO | NO | NO | NO | NO | NO |
| **Cart Item** | `localStorage` (items) | PostgreSQL `cart_items` | YES (own) | Controlled | NO | NO | NO | NO | NO | NO |
| **Wishlist** | `localStorage` (wishlist) | PostgreSQL `wishlists` | YES (own) | YES (own) | NO | NO | NO | NO | NO | NO |
| **Comparison** | `localStorage` (compare) | Client LocalStorage / Session | YES | YES | NO | NO | NO | NO | NO | NO |
| **Prescription** | `localStorage` (prescription) | PostgreSQL `prescriptions` (AES-256) | YES (own/Dr) | Controlled | NO | YES | YES | YES | NO | YES |
| **Prescription Revision** | `localStorage` (history) | PostgreSQL `prescription_revisions` | YES (own/Dr) | NO (Server) | YES | YES | YES | YES | NO | YES |
| **Optometrist** | Hardcoded UI text | PostgreSQL `optometrist_profiles` | YES (public) | NO (Admin) | NO | NO | YES | YES | NO | YES |
| **Appointment** | `localStorage` (appointments)| PostgreSQL `appointments` | YES (own/Dr) | Controlled | NO | YES | YES | YES | NO | YES |
| **Order** | `localStorage` (orders) | PostgreSQL `orders` (ACID) | YES (own/Admin)| Controlled | NO | YES | YES | YES | YES | YES |
| **Order Item** | `localStorage` (orders.items) | PostgreSQL `order_items` | YES (own/Admin)| NO (Server) | NO | NO | NO | NO | YES | YES |
| **Lens Configuration** | `lens-configurator-engine.js` | PostgreSQL `lens_configurations` | YES | Controlled | NO | NO | NO | YES | YES | YES |
| **Payment** | `mpesa-service.js` (DEMO) | PostgreSQL `payments` (Daraja) | YES (own/Admin)| NO (Server) | YES | YES | NO | NO | YES | YES |
| **Payment Attempt** | `mpesa-service.js` timer | PostgreSQL `payment_attempts` | YES (own) | NO (Server) | YES | YES | NO | NO | YES | YES |
| **Payment Receipt** | `mpesa-service.js` mock | PostgreSQL `payment_receipts` | YES (own/Admin)| NO (Server) | NO | YES | NO | NO | YES | YES |
| **Refund** | `eyekart-store.js` cancel | PostgreSQL `refunds` (Daraja B2C) | YES (own/Admin)| NO (Server) | YES | YES | NO | NO | YES | YES |
| **Fulfillment** | `eyekart-store.js` stages | PostgreSQL `fulfillments` / WMS | YES (own/Staff)| NO (Server) | NO | NO | NO | NO | NO | YES |
| **Fulfillment Stage** | `eyekart-store.js` (1-10) | PostgreSQL `fulfillment_stages` | YES | NO (Staff) | NO | NO | NO | NO | NO | YES |
| **Delivery** | `mpesa-service.js` telemetry | PostgreSQL `deliveries` / 3PL API | YES (own/Rider)| NO (Server) | NO | YES | YES | NO | NO | YES |
| **Audit Event** | `orders.lifecycleHistory` | PostgreSQL `audit_logs` (Append) | NO (Admin) | NO (Server) | YES | YES | NO | NO | NO | YES |
| **Insurance Claim** | `eyekart-store.js` insurance | PostgreSQL `insurance_claims` | YES (own/Admin)| Controlled | NO | YES | YES | YES | YES | YES |
| **Preauthorization** | `eyekart-store.js` preauth | PostgreSQL `preauthorizations` | YES (own/Admin)| NO (Server) | NO | YES | YES | YES | YES | YES |
| **Blog / CMS content** | Static Stitch HTML | Headless CMS / PostgreSQL `cms` | YES (public) | NO (Admin) | NO | NO | NO | NO | NO | NO |
| **Media Asset** | Local `assets/` & CDN | S3 / GCS Object Storage + CDN | YES (public) | NO (Admin) | NO | NO | NO | NO | NO | NO |
| **Coupon** | MISSING (None) | PostgreSQL `discount_coupons` | YES (validate) | NO (Admin) | NO | NO | NO | NO | YES | YES |
| **Inventory** | `catalog-data.js` (static) | PostgreSQL `inventory_items` | YES (avail qty)| NO (Server) | NO | NO | NO | NO | NO | YES |

---

## 3. DOMAIN ANALYSIS & PRIVILEGE ENFORCEMENT

### 3.1 Public Catalog Domain (Products, Variants, Categories, Media)
- **Authority:** Product catalog and pricing are strictly managed by administrative staff via database and headless CMS.
- **Client Access:** Public read-only access cached via Cloudflare CDN. The client runtime has zero write privileges. Any price or specification sent from the client during checkout is ignored.

### 3.2 Customer Identity & Address Domain (Customer, Guest, Address)
- **Authority:** Registered customer profiles and delivery addresses are owned by the individual authenticated customer.
- **Client Access:** Customers can read and update their own personal information through authenticated sessions. Server-side validation enforces E.164 phone formats (`+254...`) and Kenyan geographic boundaries (Nairobi postal routes).

### 3.3 Clinical & Prescription Domain (Prescription, Revisions, Reviews)
- **Authority:** Clinical prescriptions represent formal medical orders governed by the Optometrists and Dispensing Opticians Board of Kenya (ODBK).
- **Client Access:**
  - **Patients:** Can create draft prescriptions or submit uploaded slips; can view verified prescriptions. Patients **cannot** mark a prescription verified.
  - **Optometrists:** Authenticated clinicians holding active OCK council registration numbers can review, approve, reject, or request clarification. Approvals append an immutable signature record.
  - **Encryption:** All refractive diopters (OD/OS SPH, CYL, AXIS, ADD) and pupillometer centration parameters (PD) must be encrypted at rest using AES-256-GCM.

### 3.4 Commerce, Checkout & Payment Domain (Cart, Orders, Payments, Receipts)
- **Authority:** Financial transactions, tax obligations (KRA ETR invoices), and order fulfillment states are strictly owned by the EyeKart backend ledger.
- **Client Access:**
  - Clients submit item configurations (`sku`, `variantId`, `lensConfig`). The backend calculates subtotal, taxes, and shipping fees.
  - Payment records (`payments`) are created exclusively by backend integration with Safaricom Daraja 2.0. Status transitions (`PENDING` $\to$ `SETTLED`) occur only upon authenticated webhook callback processing.

### 3.5 Operational Telemetry & Audit Domain (Audit Logs, Fulfillment Stages)
- **Authority:** Immutable system ledger.
- **Client Access:** Clients have zero write or delete permissions. System events (logins, price changes, prescription approvals, payment receipts) are written asynchronously by backend services into append-only tables.

---

## 4. CONCLUSION

The Data Ownership Matrix establishes clear, unbreachable data boundaries for EyeKart. By decoupling client convenience from data authority, the platform ensures that no client manipulation can compromise pricing integrity, patient medical confidentiality, or payment reconciliation.
