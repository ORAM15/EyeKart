# EYEKART — FINAL SYSTEM INVENTORY
**Authoritative Architectural, Catalog, Route & Data Schema Baseline**  
**Legal Entity:** EYE KART HEALTHCARE LIMITED (Company No: PVT-8LU79RXX • Inc. 5 May 2022)  
**Customer-Facing Location:** Corner Plaza Building, 4th Floor, Westlands, Nairobi, Kenya  
**Customer-Facing Email:** Eyekarthealthcare@gmail.com  
**Milestone:** Post-Release Candidate 1 (RC1) Final Inventory  
**Date:** September 15, 2026  
**Auditor:** Senior Product Completion Engineer, Principal Full-Stack Engineer, Clinical QA Lead & Security Architect  
**Classification:** Authoritative Commercial Release Document  

---

## 0. Authoritative Business Registry Baseline

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ 1. STATUTORY LEGAL REGISTRATION (Verified Company Incorporation Baseline)              │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ Legal Entity Name:      EYE KART HEALTHCARE LIMITED                                   │
│ Company Number:          PVT-8LU79RXX                                                 │
│ Date of Incorporation:   5 May 2022                                                   │
│ Corporate Registrar:     Business Registration Service (BRS), Republic of Kenya        │
│ Tax Authority Status:    Active Taxpayer with Active Company Income Tax Obligation    │
│ Statutory Note:          2022 registered-office address is statutory baseline only.    │
└───────────────────────────────────────────────────────────────────────────────────────┘
                                           ▲
                                           │ STRICT SEPARATION
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ 2. CURRENT CUSTOMER-FACING BUSINESS INFORMATION (Confirmed by Business Owner)          │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ Customer-Facing Address: Corner Plaza Building, 4th Floor, Westlands, Nairobi, Kenya   │
│ Customer-Facing Email:   Eyekarthealthcare@gmail.com                                  │
│ Trading Brand:           EyeKart                                                      │
│ Fiscal Status:           KRA REGISTRATION ≠ LIVE eTIMS INTEGRATION (Simulation Mode)  │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Canonical 13-Product Synchronized Catalog

Every product is mathematically and textually synchronized across `assets/js/catalog-data.js`, PostgreSQL `products` table, and Fastify REST API (`/api/products`). All prices are strictly **VAT-Inclusive**:

| SKU | Product Name | Base Price (KSh) | Compare At | Category | Collection | Shape | Material | Stock | Variants | Source Conflict Status |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **EK-101** | The Nairobi Aviator Titanium | 12,500.00 | 16,800.00 | Eyeglasses | Nairobi Precision | Aviator | Japanese Beta-Titanium | 12 | 4 | Clean |
| **EK-102** | The Karen Round Acetate | 11,200.00 | 13,960.00 | Eyeglasses | Equatorial Edition | Round | Mazzucchelli Bio-Acetate | 19 | 3 | Reconciled @ 11,200 |
| **EK-103** | The Muthaiga Classic Browline | 14,200.00 | 18,500.00 | Eyeglasses | Executive Club | Browline | Titanium & Acetate | 15 | 3 | Clean |
| **EK-201** | The Rift Valley Shield Sunglass | 9,800.00 | 12,500.00 | Sunglasses | Savannah Air | Shield | Lightweight TR90 | 24 | 3 | Clean |
| **EK-202** | The Diani Cat-Eye Sunglass | 10,500.00 | 14,200.00 | Sunglasses | Cat-Eye Atelier | Cat-Eye | Polished Bio-Polymer | 18 | 3 | Clean |
| **EK-301** | The Silicon Savannah Computer Glass | 8,500.00 | 11,000.00 | Screen | Nairobi Tech | Rectangle | Memory TR90 Flex | 30 | 3 | Clean |
| **EK-302** | The Kilimani Blue Block Round | 8,900.00 | 11,500.00 | Screen | Crystal Series | Round | Bio-Derived Crystal | 22 | 2 | Clean |
| **EK-801** | The Mara Square Havana | 13,200.00 | 16,500.00 | Eyeglasses | Bold Silhouette | Square | 8mm Milled Acetate | 14 | 3 | Clean |
| **EK-802** | The Lamu Crystal Clear | 11,800.00 | 14,900.00 | Eyeglasses | Crystal Series | Geometric | Lucent Bio-Polymer | 16 | 2 | Clean |
| **EK-803** | The Ngong Gradient Cat-Eye | 12,900.00 | 16,200.00 | Eyeglasses | Cat-Eye Atelier | Cat-Eye | Sculpted Mazzucchelli | 11 | 2 | Clean |
| **EK-804** | The Westlands Octagonal | 13,800.00 | 17,500.00 | Eyeglasses | Nairobi Precision | Octagonal | Hand-Milled Titanium | 8 | 2 | Reconciled @ 13,800 |
| **EK-805** | The Samburu Geometric | 14,500.00 | 18,900.00 | Eyeglasses | Pure Rimless | Geometric | Screwless Bushing Titanium | 9 | 2 | Clean |
| **EK-902** | The Kibera Minimalist Titanium | 18,500.00 | 23,200.00 | Eyeglasses | Nairobi Precision | Geometric | Japanese Beta-Titanium | 6 | 4 | **SAFEGUARD ACTIVE** |

*EK-902 Safeguard Note:* `EK-902 SOURCE CONFLICT — BUSINESS CONFIRMATION REQUIRED` is explicitly retained in the database `source_conflict` column and frontend metadata. Base frame price is anchored at KSh 18,500.00; bundled high-index lens configuration totals KSh 23,200.00.

---

## 2. Complete 45 Registered Routes Inventory

Every route is mapped in `assets/js/eyekart-router.js` with deep-linking support, parameter extraction, and link interception:

| Route Path | Mapped Stitch UI Panel Directory | Operational Purpose |
| :--- | :--- | :--- |
| `""` (root) | `eyekart_grand_optical_homepage` | Grand optical homepage & hero showcase |
| `"home"` | `eyekart_grand_optical_homepage` | Homepage direct alias |
| `"catalog"` | `eyekart_optical_catalog_faceted_filters` | Faceted search, filters & catalog grid |
| `"collection"` | `eyekart_optical_catalog_faceted_filters` | Collection filter view |
| `"collection-live-try-on"` | `eyekart_catalog_collection_live_try_on_studio_active_mode` | Catalog grid with live VTO overlay active |
| `"catalog-quick-view"` | `eyekart_optical_catalog_quick_view_dimension_blueprint` | Quick view modal with dimension blueprint |
| `"product"` | `eyekart_3d_product_detail_studio` | 3D WebGL product detail & colorway studio |
| `"product-detail"` | `eyekart_3d_product_detail_studio` | Direct PDP alias |
| `"studio-3d"` | `eyekart_3d_product_detail_studio` | Direct 3D studio alias |
| `"vto"` | `eyekart_live_camera_virtual_try_on_vto_studio` | Real-time MediaPipe live camera VTO studio |
| `"try-on"` | `eyekart_live_camera_virtual_try_on_vto_studio` | Direct VTO alias |
| `"live-camera-vto"` | `eyekart_live_camera_virtual_try_on_vto_studio` | Live camera VTO studio |
| `"vto-calibration"` | `eyekart_vto_calibration_pd_biometric_scanner` | Inter-pupillary distance biometric scanner |
| `"pd-scanner"` | `eyekart_vto_calibration_pd_biometric_scanner` | PD scanner alias |
| `"compare-vto"` | `eyekart_split_screen_comparison_vto_frame_a_vs_frame_b` | Side-by-side desktop dual frame comparison |
| `"split-vto"` | `eyekart_split_screen_comparison_vto_frame_a_vs_frame_b` | Desktop split VTO alias |
| `"mobile-split-vto"` | `eyekart_mobile_split_screen_vto_comparison` | Mobile responsive split screen VTO |
| `"compare-specs"` | `eyekart_optical_comparison_matrix_multi_sku_technical_spec_studio` | Multi-SKU technical comparison matrix |
| `"comparison-matrix"` | `eyekart_optical_comparison_matrix_multi_sku_technical_spec_studio` | Technical spec matrix alias |
| `"lens-configurator"` | `eyekart_precision_lens_configurator` | Precision lens index, coating & diopter configurator |
| `"configure-lenses"` | `eyekart_precision_lens_configurator` | Lens configurator alias |
| `"customize-lenses"` | `eyekart_precision_lens_configurator` | Custom lens configurator alias |
| `"clinical-report"` | `eyekart_clinical_examination_report_precision_diopter_summary` | Precision diopter examination summary |
| `"diopter-summary"` | `eyekart_clinical_examination_report_precision_diopter_summary` | Diopter summary alias |
| `"checkout"` | `eyekart_desktop_m_pesa_express_checkout` | Desktop M-PESA Express checkout & quote lock |
| `"desktop-checkout"` | `eyekart_desktop_m_pesa_express_checkout` | Desktop checkout alias |
| `"mobile-checkout"` | `eyekart_mobile_m_pesa_stk_push_checkout` | Mobile M-PESA STK Push checkout |
| `"m-pesa-checkout"` | `eyekart_mobile_m_pesa_stk_push_checkout` | Mobile M-PESA checkout alias |
| `"order-confirmed"` | `eyekart_order_confirmation_live_nairobi_courier_tracking` | Order confirmation & live courier dispatch |
| `"order-tracking"` | `eyekart_order_confirmation_live_nairobi_courier_tracking` | Real-time Nairobi courier dispatch telemetry |
| `"track-order"` | `eyekart_order_confirmation_live_nairobi_courier_tracking` | Track order alias |
| `"payment-verified"` | `eyekart_m_pesa_payment_verified_live_courier_dispatch` | M-PESA transaction verified & rider handover |
| `"book-exam"` | `eyekart_clinic_appointment_28_point_eye_exam_booking` | 28-Point comprehensive eye exam booking |
| `"book-eye-test"` | `eyekart_clinic_appointment_28_point_eye_exam_booking` | Book eye test alias |
| `"book-clinic-test"` | `eyekart_clinic_appointment_28_point_eye_exam_booking` | Book clinic test alias |
| `"clinics-nairobi"` | `eyekart_clinic_appointment_28_point_eye_exam_booking` | Nairobi clinics booking alias |
| `"nairobi-clinics"` | `eyekart_clinic_appointment_28_point_eye_exam_booking` | Nairobi clinics alias |
| `"insurance-pre-auth"` | `eyekart_corporate_optical_insurance_claim_pre_authorization` | Corporate optical insurance claim submission |
| `"insurance-claim"` | `eyekart_corporate_optical_insurance_claim_pre_authorization` | Insurance claim alias |
| `"claim-approved"` | `eyekart_claim_approved_electronic_pre_auth_letter_modal` | Pre-authorization approval certificate modal |
| `"account"` | `eyekart_customer_account_orders_prescriptions_management` | Customer account, orders, prescriptions & vault |
| `"account-orders"` | `eyekart_customer_account_orders_prescriptions_management` | Account orders tab direct route |
| `"account-prescriptions"` | `eyekart_customer_account_orders_prescriptions_management` | Account prescription vault direct route |
| `"kra-invoice"` | `eyekart_kra_etr_tax_invoice_clinical_ophthalmic_certificate` | Official KRA eTIMS ETR tax invoice certificate |
| `"etr-receipt"` | `eyekart_kra_etr_tax_invoice_clinical_ophthalmic_certificate` | Official ETR receipt alias |

---

## 3. Stitch 23 UI Panels Cryptographic Baseline

All 23 Stitch HTML files under `Stitch/stitch_eyekart_optical_commerce_platform/` are 100% hash-identical to their prebuild state (0.0% visual drift):

| # | Panel Directory Name | SHA-256 Hash | Visual Drift | Status |
| :-: | :--- | :--- | :-: | :-: |
| 1 | `eyekart_3d_product_detail_studio` | `cb3d1ee0085ecdbfb2e87900b91e92d04a88cbdb6b3017bb4113e3135b91b658` | 0.0% | **FROZEN** |
| 2 | `eyekart_brand_logo` | `1c827c88b0a96f9ff228a6fdf9926cb1a3a3036a1c5d0130ea51737beea79169` | 0.0% | **FROZEN** |
| 3 | `eyekart_catalog_collection_live_try_on_studio_active_mode` | `8c4744cb897dd60f9e1e35ff61921c5b8d28a38b2488aa2088f19da372a74c7c` | 0.0% | **FROZEN** |
| 4 | `eyekart_claim_approved_electronic_pre_auth_letter_modal` | `eb1b4bb1ebf279d04ba4e0f52d9b6fc910b2f54245fc2585f94a8be413d78c0e` | 0.0% | **FROZEN** |
| 5 | `eyekart_clinical_examination_report_precision_diopter_summary` | `7282fcce2bc736a65ba79b94090ea00ea01c808779b1836e4f3a7ea391515f43` | 0.0% | **FROZEN** |
| 6 | `eyekart_clinic_appointment_28_point_eye_exam_booking` | `e9f29bf4df7c050a41d3b0c5ba724125b0451cf44036130424a1bf9c1ecf4201` | 0.0% | **FROZEN** |
| 7 | `eyekart_corporate_optical_insurance_claim_pre_authorization` | `f3ee906bfe94c489ce4c54091fe21b0ea17a151670ea83b109e4f509c2565022` | 0.0% | **FROZEN** |
| 8 | `eyekart_customer_account_orders_prescriptions_management` | `0d918b9b81b5c4dfd924f7cc6bbd35ba48b1fc53a0f7df8f8c2132717087612f` | 0.0% | **FROZEN** |
| 9 | `eyekart_desktop_m_pesa_express_checkout` | `068bb98d407ff83f70ce895311dd65427d11f95be6708ddcf8fbb0d6e66dd00c` | 0.0% | **FROZEN** |
| 10 | `eyekart_grand_optical_homepage` | `e2a4be605be5e52c8b056157e8ebff88c7f261972f33b1e360f0d2c67672db91` | 0.0% | **FROZEN** |
| 11 | `eyekart_integrated_spatial_optical_master_experience` | `336718cfd6df022dfadbe7a9f7d8f4cb97e06a3e26466f21c216fb98319f37c5` | 0.0% | **FROZEN** |
| 12 | `eyekart_kra_etr_tax_invoice_clinical_ophthalmic_certificate` | `2950587d60517fa42d76712b07d66be745d0ba97f485750d4eb076a0862085dc` | 0.0% | **FROZEN** |
| 13 | `eyekart_live_camera_virtual_try_on_vto_studio` | `d175217ba3f87ea5be415f385c7bb7c28d5d4d38c11463cfbf56133f99e38f9b` | 0.0% | **FROZEN** |
| 14 | `eyekart_mobile_m_pesa_stk_push_checkout` | `223403a42eb665a5871239f5f02be8d119ee7b51b329432d5e30ca6ddff9a7c3` | 0.0% | **FROZEN** |
| 15 | `eyekart_mobile_split_screen_vto_comparison` | `0df8b839aa5ddfe3d8383f5c760eeffcc06409403ec41584ea059f1311029c78` | 0.0% | **FROZEN** |
| 16 | `eyekart_m_pesa_payment_verified_live_courier_dispatch` | `10214c77c0f1621379b35b628ec36d0b57140e6c52a36d2fbdf17a3f8c857777` | 0.0% | **FROZEN** |
| 17 | `eyekart_optical_catalog_faceted_filters` | `b99e74d1a58c0678d8a7c64c7849cb6e5d83cba44c4b694bbcf6fa2472b5042c` | 0.0% | **FROZEN** |
| 18 | `eyekart_optical_catalog_quick_view_dimension_blueprint` | `9b32c66144e5088eb747a5b3db5d5fbe54c5025759a2f7c040d39e94895696d5` | 0.0% | **FROZEN** |
| 19 | `eyekart_optical_comparison_matrix_multi_sku_technical_spec_studio` | `d974df3b8fe709a3410f924619d8544c42fa24dd479a32c45e5be264584e037b` | 0.0% | **FROZEN** |
| 20 | `eyekart_order_confirmation_live_nairobi_courier_tracking` | `7beecb45781a5a8f4c024d271f8b417c8282367d341ba0db7e1fb0cf909d93e1` | 0.0% | **FROZEN** |
| 21 | `eyekart_precision_lens_configurator` | `c379a0b12b5b7194f479d2667d8d21cbbd25c6ccdd26042db621cc13eb2389d4` | 0.0% | **FROZEN** |
| 22 | `eyekart_split_screen_comparison_vto_frame_a_vs_frame_b` | `cbb56ae7752e557fc9bc788647087e5b61e2716075c3db112bf8bb8ec701e513` | 0.0% | **FROZEN** |
| 23 | `eyekart_vto_calibration_pd_biometric_scanner` | `4859a84497e205aa102a0a25e171ff2f694a974b6df3efb8eecaa6e0e6403079` | 0.0% | **FROZEN** |

---

## 4. PostgreSQL Database Schema Inventory (25 Tables)

The database layer runs on PostgreSQL 18 with relational integrity, foreign key cascading rules, check constraints, and atomic row locking:

| # | Table Name | Primary Key | Key Foreign Keys | Purpose & Reconciliation Note |
| :-: | :--- | :--- | :--- | :--- |
| 1 | `roles` | `name` | — | Role definitions (CUSTOMER, STAFF, STORE_STAFF, LAB_TECH, OPTOMETRIST, ADMIN) |
| 2 | `users` | `id` (UUID) | `role -> roles(name)` | User accounts, hashed passwords, contact details |
| 3 | `sessions` | `id` (UUID) | `user_id -> users(id)` | Active user session tokens, expiry, IP addresses |
| 4 | `categories` | `id` (VARCHAR) | — | Product categories (eyeglasses, sunglasses, screen) |
| 5 | `collections` | `id` (VARCHAR) | — | Editorial collections (Nairobi Precision, Equatorial Edition, etc.) |
| 6 | `products` | `sku` (VARCHAR) | `category_id`, `collection_id` | Canonical 13 SKUs with prices, dimensions, and specs |
| 7 | `product_variants`| `id` (UUID) | `sku -> products(sku)` | Colorway variants with hex codes and price deltas (35 variants) |
| 8 | `inventory_transactions` | `id` (UUID) | `sku -> products(sku)` | Stock audit trail for allocations, adjustments, and releases |
| 9 | `checkout_quotes` | `id` (UUID) | `user_id -> users(id)` | Authoritative frozen checkout quotes with expiration timestamps |
| 10 | `orders` | `id` (UUID) | `user_id -> users(id)` | Central order records with VAT 16%, state, and tracking snapshot |
| 11 | `order_items` | `id` (UUID) | `order_id -> orders(id)` | Order line items with frozen frame prices and lens configuration |
| 12 | `payment_attempts` | `id` (UUID) | `order_id -> orders(id)` | Payment transactions, STK requests, and M-PESA receipts |
| 13 | `prescriptions` | `id` (UUID) | `user_id`, `order_id` | Customer optical prescriptions with status and source |
| 14 | `prescription_revisions` | `id` (UUID) | `prescription_id` | Immutable diopter history (OD/OS SPH, CYL, AXIS, ADD, PD) |
| 15 | `prescription_reviews` | `id` (UUID) | `prescription_id`, `reviewer_id` | Clinical review audit trail (APPROVE, CLARIFY, REJECT) |
| 16 | `clinics` | `id` (VARCHAR) | — | *Reconciliation Note:* 4 seeded clinics are development fixtures awaiting business confirmation |
| 17 | `appointment_types` | `id` (VARCHAR) | — | Clinical exam types (Signature 28-Point Exam, etc.) |
| 18 | `appointment_slots` | `id` (VARCHAR) | `clinic_id -> clinics(id)` | 252 appointment slots across clinics with availability status |
| 19 | `appointments` | `id` (UUID) | `slot_id`, `user_id` | Booked clinical eye examinations with patient details |
| 20 | `fulfillments` | `id` (UUID) | `order_id -> orders(id)` | Operational fulfillment records with 10-stage status and tracking |
| 21 | `fulfillment_events`| `id` (UUID) | `fulfillment_id` | Chronological fulfillment audit log for customer tracking |
| 22 | `insurance_claims` | `id` (UUID) | `user_id`, `order_id` | Corporate optical insurance pre-authorization claims |
| 23 | `stored_documents` | `id` (UUID) | `user_id -> users(id)` | Uploaded prescription cards and insurance letters with MIME security |
| 24 | `audit_logs` | `id` (UUID) | `actor_id -> users(id)` | Comprehensive security and administrative audit trail |
| 25 | `system_settings` | `key` (VARCHAR) | — | Global platform settings, tax rates, and feature toggles |

---

## 5. Backend REST API Endpoints Inventory (38 Endpoints)

Fastify server routes exposed on port 3001 with strict RBAC middleware:

| Route Group | Method | Endpoint Path | Auth Guard | Description |
| :--- | :---: | :--- | :--- | :--- |
| **Health** | `GET` | `/api/health` | Public | System status, uptime, database connectivity check |
| **Catalog** | `GET` | `/api/products` | Public | List all 13 canonical products with active variants |
| | `GET` | `/api/products/:sku` | Public | Fetch individual product specifications |
| | `GET` | `/api/categories` | Public | List product categories |
| | `GET` | `/api/inventory` | `STAFF`, `ADMIN` | Staff inventory overview across ateliers |
| **Auth** | `POST` | `/api/auth/register` | Rate-limited | Customer self-registration (strictly CUSTOMER role) |
| | `POST` | `/api/auth/login` | Rate-limited | User authentication (issues session cookie & Bearer token) |
| | `POST` | `/api/auth/logout` | `requireAuth` | Invalidate active session |
| | `GET` | `/api/me` | `requireAuth` | Retrieve authenticated user profile |
| **Pricing** | `POST` | `/api/pricing/quote` | Public | Calculate authoritative quote for cart items |
| **Checkout** | `POST` | `/api/checkout/quote` | Public / Customer | Generate and freeze authoritative checkout quote |
| **Payments** | `POST` | `/api/payments/demo/initiate` | `requireAuth` | Initiate simulated M-PESA STK Push (Demo rail) |
| | `POST` | `/api/payments/demo/transition`| `requireAuth` | Explicitly transition payment attempt state |
| | `POST` | `/api/payments/daraja/stkpush`| `requireAuth` | Initiate production Safaricom Daraja STK push |
| | `POST` | `/api/webhooks/mpesa` | Public (Whitelisted) | Safaricom Daraja callback webhook handler (16 cases) |
| **Orders** | `POST` | `/api/orders` | `requireAuth` | Place order from authoritative checkout quote |
| | `GET` | `/api/orders` | `requireAuth` | List authenticated customer's own orders |
| | `GET` | `/api/orders/:id` | `requireAuth` | Fetch specific order details (strict IDOR isolation) |
| | `POST` | `/api/orders/:id/cancel` | `requireAuth` | Cancel customer order (pre-surfacing only) |
| | `PATCH` | `/api/orders/:id/status` | `ADMIN`, `STAFF` | Administrative order status override |
| **Fulfillment** | `GET` | `/api/orders/:id/fulfillment` | `requireAuth` | Customer/staff fulfillment view |
| | `GET` | `/api/orders/:id/tracking` | `requireAuth` | Customer delivery tracking timeline & telemetry |
| | `POST` | `/api/fulfillments` | `STORE_STAFF`, `ADMIN`| Initialize fulfillment record for paid order |
| | `POST` | `/api/fulfillments/:id/transition` | Staff / Lab Tech | Advance fulfillment through 10 operational stages |
| **Prescriptions** | `POST` | `/api/prescriptions` | `requireAuth` | Save diopters to Ophthalmic Vault |
| | `GET` | `/api/prescriptions` | `requireAuth` | List customer's saved prescriptions |
| | `GET` | `/api/prescriptions/:id` | `requireAuth` | Get specific prescription (IDOR protected) |
| | `POST` | `/api/prescriptions/:id/submit` | `requireAuth` | Submit prescription to optometrist queue |
| | `POST` | `/api/prescriptions/:id/clarification` | `requireAuth` | Resubmit clarified diopters (creates Revision N+1) |
| **Optometrist** | `GET` | `/api/optometrist/prescriptions` | `OPTOMETRIST`, `ADMIN`| Fetch Clinical Review Queue |
| | `POST` | `/api/optometrist/prescriptions/:id/approve` | `OPTOMETRIST`, `ADMIN`| Clinically approve prescription (unblocks lab) |
| | `POST` | `/api/optometrist/prescriptions/:id/reject` | `OPTOMETRIST`, `ADMIN`| Clinically reject prescription with reason |
| | `POST` | `/api/optometrist/prescriptions/:id/clarification` | `OPTOMETRIST`, `ADMIN`| Request clarification from patient |
| **Appointments** | `GET` | `/api/appointments/availability`| Public | Query available appointment slots by clinic & date |
| | `POST` | `/api/appointments` | `requireAuth` | Book appointment with atomic row-level lock |
| | `GET` | `/api/appointments` | `requireAuth` | List authenticated customer's appointments |
| | `GET` | `/api/appointments/:id` | `requireAuth` | Get appointment details (IDOR protected) |
| | `POST` | `/api/appointments/:id/cancel` | `requireAuth` | Cancel appointment and release slot to inventory |
| | `POST` | `/api/appointments/:id/reschedule`| `requireAuth` | Atomically reschedule appointment to new slot |
| **Storage** | `POST` | `/api/storage/upload` | `requireAuth` | Upload prescription card/letter (MIME validated) |
| | `GET` | `/api/storage/files/:id` | `requireAuth` | Download stored document (IDOR protected) |

---

## 6. Frontend Module Inventory (`assets/js/`)

| File Name | Size (Bytes) | Primary Responsibilities | Exports / Namespace |
| :--- | :---: | :--- | :--- |
| `business-authority.js` | ~1.5 KB | Authoritative legal & customer contact registry | `window.EyeKartBusinessAuthority` |
| `catalog-data.js` | ~26 KB | Synchronized 13-product canonical catalog definitions | `window.EyeKartCatalog` |
| `eyekart-router.js` | ~11 KB | 45 hash routes, deep linking, parameter resolution | `window.EyeKartRouter` |
| `eyekart-runtime.js` | ~61 KB | Component lifecycle, empty states, search, catalog grid | `window.EyeKartRuntime` |
| `eyekart-store.js` | ~41 KB | Reactive store, localStorage sync, cart & wishlist state | `window.EyeKartStore` |
| `eyekart-api-adapter.js`| ~16 KB | Client HTTP adapter for Fastify backend endpoints | `window.EyeKartAPI` |
| `eyekart-dom-map.js` | ~6 KB | Pre-indexed DOM selectors across 23 Stitch panels | `window.EyeKartDOMMap` |
| `lens-configurator-engine.js` | ~24 KB | Interactive lens options, diopter entry & live quote math | `window.LensConfigurator` |
| `mpesa-service.js` | ~22 KB | Desktop & mobile STK Push timers, simulation, modal | `window.MpesaCheckout` |
| `three-studio.js` | ~28 KB | Three.js WebGL canvas, OrbitControls, 2D fallback | `window.ThreeStudio` |
| `vto-engine.js` | ~38 KB | MediaPipe Face Mesh live camera tracking & VTO preview | `window.VTOEngine` |
| `account-engine.js` | ~46 KB | Customer account tabs (Orders, Rx Vault, Appointments) | `window.AccountEngine` |
| `booking-engine.js` | ~5 KB | Clinic selection, slot chips, and appointment submission | `window.BookingEngine` |
