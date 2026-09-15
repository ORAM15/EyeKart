# EYEKART — RUNTIME ARCHITECTURE SPECIFICATION
**Protocol Version:** 1.1  
**Architecture Model:** Non-Destructive In-Situ Runtime Binding  
**Constraint:** Zero DOM Structural Mutation / Zero Framework Migration  

---

## 1. System Topology

EyeKart operates on a strictly decoupled layered architecture where the approved Stitch HTML markup acts as an immutable presentation surface, while functional behaviors are orchestrated by a centralized client runtime:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   APPROVED STITCH PRESENTATION LAYER                   │
│  22 Static Panels (Tailwind CSS, Playfair Display, Plus Jakarta Sans)  │
└────────────────────────────────────▲───────────────────────────────────┘
                                     │ Event Listeners & Selective Mounts
┌────────────────────────────────────┴───────────────────────────────────┐
│                      EYEKART APPLICATION RUNTIME                       │
│                                                                        │
│   ┌───────────────────────┐  ┌─────────────────────────────────────┐   │
│   │   eyekart-router.js   │  │          eyekart-store.js           │   │
│   │  - 33 data-path links │  │  - Reactive pub/sub state manager   │   │
│   │  - Hash/Query routing │  │  - LocalStorage cross-tab sync      │   │
│   │  - Badge synchronization│ │  - Schema validation               │   │
│   └───────────┬───────────┘  └──────────────────┬──────────────────┘   │
│               │                                 │                      │
│   ┌───────────▼─────────────────────────────────▼──────────────────┐   │
│   │                         DOMAIN SERVICES                        │   │
│   │  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────┐ │   │
│   │  │   CatalogService  │ │     VTOService    │ │  Studio3D     │ │   │
│   │  │  - 22-field SKU   │ │  - getUserMedia   │ │  - 360 orbit  │ │   │
│   │  │  - Facet filters  │ │  - Face alignment │ │  - CAD HUD    │ │   │
│   │  │  - Search index   │ │  - Biometric ruler│ │  - Lighting   │ │   │
│   │  └───────────────────┘ └───────────────────┘ └───────────────┘ │   │
│   │  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────┐ │   │
│   │  │   LensEngine      │ │    BookingEngine  │ │  MPESAService │ │   │
│   │  │  - OD/OS Grid     │ │  - 28-point exams │ │  - STK Push   │ │   │
│   │  │  - Index/Coatings │ │  - 4 Clinic Hubs  │ │  - Telemetry  │ │   │
│   │  │  - Dynamic Price  │ │  - Patient Dossier│ │  - KRA ETR Gen│ │   │
│   │  └───────────────────┘ └───────────────────┘ └───────────────┘ │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Centralized Catalog Schema

All product entities consumed by Catalog, 3D Studio, VTO, Configurator, Cart, and Checkout follow this standardized 22-attribute schema:

```javascript
/**
 * Master SKU Entity Definition
 */
const FrameSchema = {
  sku: "EK-902",                          // Unique SKU string
  name: "Kibera Minimalist Titanium",      // Display title
  brand: "EyeKart Nairobi Atelier",       // Brand pedigree
  category: "eyeglasses",                  // 'eyeglasses' | 'sunglasses' | 'screen'
  gender: "unisex",                        // 'men' | 'women' | 'unisex' | 'kids'
  shape: "round",                          // 'round' | 'aviator' | 'octagonal' | 'square' | 'browline' | 'rimless'
  material: "Japanese Beta-Titanium",      // Frame composition
  color: "Obsidian Black",                 // Primary display color
  finish: "Matte Anodized",                // Surface finish
  price: 18500,                            // Base price in Kenyan Shillings (KES / KSh)
  compareAtPrice: 21200,                   // Original retail price
  dimensions: "50 □ 19 - 140",             // Optical standard: Lens Width □ Bridge - Temple (mm)
  weight: "14.2g",                         // Weight without demo lenses
  bridge: 19,                              // Bridge dimension in mm
  temple: 140,                             // Temple arm length in mm
  lensWidth: 50,                           // Eye size width in mm
  lensCompatibility: ["single_vision", "progressive", "office", "polarized"],
  stock: 12,                               // Available inventory in atelier
  gallery: [                               // Multi-perspective assets
    "assets/frames/ek902_front.png",
    "assets/frames/ek902_quarter.png",
    "assets/frames/ek902_profile.png",
    "assets/frames/ek902_cad.png"
  ],
  asset3D: {
    modelUrl: "assets/models/ek902.glb",   // 3D GLB model or 360 high-res sprite sequence
    cadOverlay: true
  },
  assetVTO: {
    overlayUrl: "assets/vto/ek902_vto.png",
    scaleFactor: 1.0,
    bridgeOffset: [0, 1.2, 0]
  },
  prescriptionCompatibility: {
    sphMin: -10.00,
    sphMax: 6.00,
    cylMax: -4.00
  },
  collection: "The Nairobi Precision Series",
  status: "ACTIVE_DEMO",                   // 'ACTIVE_DEMO' | 'ACTIVE_PRODUCTION'
  seoMetadata: {
    title: "EK-902 Kibera Titanium Optical Frame | EyeKart Nairobi",
    description: "Ultra-light Japanese titanium round spectacle frame handcrafted for Nairobi."
  }
};
```

---

## 3. Shared Reactive State Specification

The central reactive store (`eyekart-store.js`) manages the single source of truth across all 22 panels with automatic `localStorage` serialization:

```javascript
const InitialState = {
  // 1. Catalog & Active Item
  catalog: [],                            // Initialized from catalog-data.js
  selectedSku: "EK-902",                  // Currently active frame across 3D, VTO, Configurator
  activeVariant: "Obsidian Black",

  // 2. Shopping Cart
  cart: {
    items: [],                            // Array of { id, sku, variant, lensConfig, price, qty }
    subtotal: 0,
    vat: 0,                               // 16% Kenyan VAT breakdown
    deliveryFee: 0,                       // 0 for Nairobi Express delivery
    total: 0
  },

  // 3. Wishlist & Comparison
  wishlist: ["EK-902", "EK-804", "EK-102"],
  comparison: ["EK-902", "EK-804", "EK-102"], // Max 4 SKUs for matrix studio

  // 4. Clinical Prescription & Lens Configuration
  prescription: {
    type: "manual",                       // 'manual' | 'upload' | 'saved'
    od: { sph: "-2.25", cyl: "-0.50", axis: "175", add: "+1.25" },
    os: { sph: "-2.00", cyl: "-0.75", axis: "005", add: "+1.25" },
    pd: 63,                               // Pupillary Distance (mm)
    validated: true
  },
  lensConfig: {
    lensType: "digital_single_vision",    // 'single_vision' | 'progressive' | 'office'
    index: "1.67",                        // '1.50' | '1.60' | '1.67' | '1.74'
    coatings: ["blueshield_420", "anti_reflective", "oleophobic"],
    lensPrice: 7500
  },

  // 5. Clinical Appointments
  appointments: [
    {
      id: "APT-2025-9912",
      clinicId: "sarit_centre",
      clinicName: "Sarit Centre Precision Clinic",
      date: "2025-11-16",
      time: "10:30 AM",
      optometrist: "Dr. Farida Onyango (Optometry Council #281)",
      examType: "28-Point Comprehensive Ophthalmic Examination",
      patient: {
        fullName: "Zawadi Kamau",
        phone: "+254 712 345 678",
        email: "z.kamau@eyekart.ke"
      },
      status: "CONFIRMED_DEMO"
    }
  ],

  // 6. Corporate Insurance Pre-Authorization
  insurance: {
    underwriter: "Jubilee Insurance",
    policyNumber: "JUB-MED-849102",
    memberId: "EMP-09214",
    opticalLimit: 40000,
    utilizedAmount: 5000,
    remainingBalance: 35000,
    preAuthCode: "JUB-OPT-2025-8841X",
    status: "APPROVED_DEMO"
  },

  // 7. Orders & Live Courier Dispatch
  orders: [
    {
      orderId: "EK-NBI-89421",
      date: "2025-11-15T14:30:00Z",
      items: [],
      paymentMethod: "M-PESA Express",
      mpesaReceipt: "SFA91028X4",
      total: 23200,
      deliveryAddress: "Westlands Commercial Hub, Suite 402, Nairobi",
      tracking: {
        stage: "DISPATCHED",              // 'OPTICIAN_QA' | 'CLEANROOM_FIT' | 'DISPATCHED' | 'DELIVERED'
        riderName: "Kelvin Odhiambo",
        riderPhone: "+254 700 393 527",
        vehicleReg: "KBZ 849X (TVS Apache)",
        etaMinutes: 18,
        temperature: "21.4°C",
        speed: "38 km/h"
      },
      kraInvoiceNumber: "KRA-ETR-2025-0098412",
      status: "IN_TRANSIT_DEMO"
    }
  ],

  // 8. User Profile Session
  user: {
    name: "Zawadi Kamau",
    phone: "+254 712 345 678",
    email: "z.kamau@eyekart.ke",
    tier: "Atelier VIP Member",
    registeredInsurer: "Jubilee Insurance"
  }
};
```

---

## 4. Navigation & Route Resolution Map

All 33 `data-path` attributes found across the 22 Stitch panels resolve according to this deterministic lookup table:

| `data-path` Attribute | Target Panel Directory | View Role |
|---|---|---|
| `home` | `eyekart_grand_optical_homepage` | Flagship Editorial Homepage |
| `eyeglasses` / `eyeglasses-collection` | `eyekart_optical_catalog_faceted_filters` | Main Eyewear Catalog with Faceted Filters |
| `sunglasses` / `sunglasses-collection` | `eyekart_optical_catalog_faceted_filters?cat=sunglasses` | Sunglasses Collection View |
| `screen-glasses` | `eyekart_optical_catalog_faceted_filters?cat=screen` | Blue-Light Defense Eyewear |
| `kids-teens` / `kids-teens-optics` | `eyekart_optical_catalog_faceted_filters?cat=kids` | Paediatric & Teen Eyewear |
| `contact-lenses` | `eyekart_optical_catalog_faceted_filters?cat=contacts` | Clinical Contact Lenses & Solutions |
| `premium-atelier` | `eyekart_optical_catalog_faceted_filters?material=titanium` | Japanese Titanium & Mazzucchelli Collection |
| `nairobi-edit` | `eyekart_optical_catalog_faceted_filters?coll=nairobi` | Local Nairobi Signature Series |
| `product-details` | `eyekart_3d_product_detail_studio` | 3D Studio & Technical Specification |
| `virtual-try-on` / `try-on` / `try-on-studio` | `eyekart_live_camera_virtual_try_on_vto_studio` | Live Camera Virtual Try-On Studio |
| `split-vto` / `compare-vto` | `eyekart_split_screen_comparison_vto_frame_a_vs_frame_b` | Desktop Split-Screen VTO Comparison |
| `mobile-vto` | `eyekart_mobile_split_screen_vto_comparison` | Mobile Split / Swipe / Fade VTO |
| `vto-calibration` | `eyekart_vto_calibration_pd_biometric_scanner` | Card & Iris Biometric PD Calibrator |
| `comparison-matrix` | `eyekart_optical_comparison_matrix_multi_sku_technical_spec_studio` | Multi-SKU Technical Spec Studio |
| `lens-customizer` / `upload-prescription` | `eyekart_precision_lens_configurator` | Precision Diopter & Coating Configurator |
| `book-eye-test` / `book-clinic-test` | `eyekart_clinic_appointment_28_point_eye_exam_booking` | 28-Point Eye Examination Booking |
| `clinical-report` | `eyekart_clinical_examination_report_precision_diopter_summary` | Precision Diopter Summary & E-Record |
| `corporate-insurance` | `eyekart_corporate_optical_insurance_claim_pre_authorization` | Corporate Optical Insurance Portal |
| `insurance-voucher` | `eyekart_claim_approved_electronic_pre_auth_letter_modal` | Electronic Pre-Auth Letter & Voucher |
| `cart` / `cart-bag` | `eyekart_desktop_m_pesa_express_checkout` | Shopping Bag & M-PESA Express Checkout |
| `mobile-checkout` | `eyekart_mobile_m_pesa_stk_push_checkout` | Mobile STK Push PIN Simulation Sheet |
| `courier-dispatch` | `eyekart_m_pesa_payment_verified_live_courier_dispatch` | Payment Verified & Courier Dispatch |
| `order-tracking` | `eyekart_order_confirmation_live_nairobi_courier_tracking` | Live Nairobi Courier Tracking & Route |
| `tax-invoice` | `eyekart_kra_etr_tax_invoice_clinical_ophthalmic_certificate` | Official KRA ETR Tax Invoice & Certificate |
| `my-account` / `user-profile` / `profile-portal` | `eyekart_customer_account_orders_prescriptions_management` | Customer Account Portal & History |
| `spatial-master` | `eyekart_integrated_spatial_optical_master_experience` | Unified Spatial Optical Experience |
| `clinics-nairobi` / `nairobi-clinics` | `eyekart_clinic_appointment_28_point_eye_exam_booking` | Physical Atelier Clinics in Nairobi |

---

## 5. Demo / Live Separation Protocol

In accordance with Sections 8, 10, 11, and 12 of Protocol 1.1:

1. **M-PESA Express Checkout**:
   - Environment: `SANDBOX_SIMULATED`.
   - Behavior: Prompts user for Safaricom number (`2547XXXXXXXX`), simulates STK push payload dispatch, displays realistic 1:42 countdown with PIN authorization dialog, validates demo transaction code (`SFA91028X4`), and updates order history.
   - Disclaimer: Clearly displays `"EyeKart Sandbox Environment — No live monetary transaction is debited"`.
2. **KRA ETR Tax Invoice**:
   - Environment: `DEMO_COMPLIANCE_MOCK`.
   - Behavior: Formats a complete Kenya Revenue Authority Electronic Tax Register invoice (PIN P051234567Z, CU Serial # KRAM091823, QR Verification payload format compliant with TIMS/eTIMS).
   - Disclaimer: Watermarked `"DEMO FISCAL DOCUMENT — FOR DEVELOPMENT & AUDIT PURPOSES ONLY"`.
3. **Virtual Try-On (VTO) & Biometric Calibration**:
   - Environment: `OPTICAL_FITTING_ESTIMATE`.
   - Behavior: Utilizes browser `getUserMedia` for live camera stream and face alignment reticle. Renders frame overlay with perspective yaw/pitch response.
   - Disclaimer: `"Virtual Try-On and Biometric PD calibration provide fitting estimates. They do not constitute an authorized clinical ophthalmic prescription."`
4. **Corporate Insurance Pre-Authorization**:
   - Environment: `SMARTCARD_PREAUTH_DEMO`.
   - Behavior: Validates Kenyan underwriter policy formats (Jubilee, APA, Britam, CIC, AAR, Madison) against demo corporate limits, calculating optical balances and issuing signed authorization vouchers.
   - Disclaimer: `"Demonstration pre-authorization voucher for underwriting workflow validation."`
5. **Courier Telemetry**:
   - Environment: `TELEMETRY_SIMULATION`.
   - Behavior: Simulates live Nairobi motorbike dispatch progress across 4 stages (Optician QA Certified $\to$ Cleanroom Lens Fitted $\to$ Dispatched via Express Rider $\to$ Delivered), updating ETA, temperature (21.4°C), and speed (38 km/h).
