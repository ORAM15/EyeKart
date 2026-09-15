# EYEKART — VISUAL BASELINE SPECIFICATION
**Protocol Version:** 1.1  
**Status:** FROZEN & LOCKED  
**Enforcement:** Zero Visual Drift / Zero DOM Rewriting / Zero Redesign  

---

## 1. Executive Summary & Baseline Policy

The EyeKart user interface consists of 22 approved application panels produced by Stitch. These panels represent an approved visual baseline embodying **Modern Editorial Optical Minimalism** and **Precision Glassmorphic Depth** for the Nairobi luxury optometry market.

Under Protocol 1.1:
1. Every panel's `screen.png` is an **immutable visual baseline**.
2. Every panel's `code.html` is the **canonical structural source of truth**.
3. No visual styling, Tailwind class configuration, typography, color palette, or layout structure may be modified.
4. Functionality must be injected **beneath** the DOM via non-destructive runtime bindings.
5. Visual regression tolerance is **strictly 0%**.

---

## 2. Complete Panel Inventory & Baseline Registry

All paths are relative to repository root `d:\BRDR\Development\Active Projects\EyeKart\`.

| # | Panel Identifier | Screen Baseline | HTML Source | Visual Freeze Status | Key Runtime Hooks (IDs / Selectors) | Known Prototype Limitations | Regression Status |
|---|---|---|---|---|---|---|---|
| **01** | `eyekart_grand_optical_homepage` | `Stitch/stitch_eyekart_optical_commerce_platform/eyekart_grand_optical_homepage/screen.png` | `Stitch/stitch_eyekart_optical_commerce_platform/eyekart_grand_optical_homepage/code.html` | **LOCKED** | `#hero-finish-name`, `#hero-model-sku`, `#caliper-overlay`, `.swatch-btn`, `#clinic-booking-form`, `[data-path]` | Navigation links use `href="#"`, hero finishes toggle mock classes only | Baseline Locked |
| **02** | `eyekart_optical_catalog_faceted_filters` | `Stitch/.../eyekart_optical_catalog_faceted_filters/screen.png` | `Stitch/.../eyekart_optical_catalog_faceted_filters/code.html` | **LOCKED** | `#bridgeValueDisplay`, `input[type="range"]`, `.filter-group`, `.product-card`, `[data-path]` | Checkbox filters are disconnected from product cards; bridge slider only updates label | Baseline Locked |
| **03** | `eyekart_optical_catalog_quick_view_dimension_blueprint` | `Stitch/.../eyekart_optical_catalog_quick_view_dimension_blueprint/screen.png` | `Stitch/.../eyekart_optical_catalog_quick_view_dimension_blueprint/code.html` | **LOCKED** | `#blueprint-hud`, `#active-angle-label`, `#toggle-blueprint-btn`, `.view-mode-btn` | Quick View is rendered as a full page rather than hooked as an overlay modal | Baseline Locked |
| **04** | `eyekart_3d_product_detail_studio` | `Stitch/.../eyekart_3d_product_detail_studio/screen.png` | `Stitch/.../eyekart_3d_product_detail_studio/code.html` | **LOCKED** | `#cad-overlay`, `#light-container`, `.angle-btn`, `.light-mode-btn`, `#btn-configure-lenses` | 3D viewer simulates rotation via 2D perspective transforms; buttons lack router links | Baseline Locked |
| **05** | `eyekart_catalog_collection_live_try_on_studio_active_mode` | `Stitch/.../eyekart_catalog_collection_live_try_on_studio_active_mode/screen.png` | `Stitch/.../eyekart_catalog_collection_live_try_on_studio_active_mode/code.html` | **LOCKED** | `#active-frame-title`, `#active-frame-price`, `#hud-frame-metrics`, `.frame-card` | Live try-on overlay is hardcoded to static model photo; cards lack shared cart binding | Baseline Locked |
| **06** | `eyekart_live_camera_virtual_try_on_vto_studio` | `Stitch/.../eyekart_live_camera_virtual_try_on_vto_studio/screen.png` | `Stitch/.../eyekart_live_camera_virtual_try_on_vto_studio/code.html` | **LOCKED** | `#lightingLayer`, `#btnLightOffice`, `#btnLightSun`, `#toggleMirrorFeed`, `#snapshotBtn` | Camera feed is static image; `getUserMedia` stream not initialized | Baseline Locked |
| **07** | `eyekart_vto_calibration_pd_biometric_scanner` | `Stitch/.../eyekart_vto_calibration_pd_biometric_scanner/screen.png` | `Stitch/.../eyekart_vto_calibration_pd_biometric_scanner/code.html` | **LOCKED** | `#modeBtnA`, `#modeBtnB`, `#modeBtnC`, `#cardGuideSvg`, `#manualPdBox`, `#pdSlider` | Static guide overlays; calibration calculation not connected to store prescription | Baseline Locked |
| **08** | `eyekart_split_screen_comparison_vto_frame_a_vs_frame_b` | `Stitch/.../eyekart_split_screen_comparison_vto_frame_a_vs_frame_b/screen.png` | `Stitch/.../eyekart_split_screen_comparison_vto_frame_a_vs_frame_b/code.html` | **LOCKED** | `#yawSyncToggle`, `#frameA-container`, `#frameB-container`, `.lighting-select` | Comparison frames are hardcoded to EK-902 and EK-804; sync lock is visual toggle only | Baseline Locked |
| **09** | `eyekart_mobile_split_screen_vto_comparison` | `Stitch/.../eyekart_mobile_split_screen_vto_comparison/screen.png` | `Stitch/.../eyekart_mobile_split_screen_vto_comparison/code.html` | **LOCKED** | `#btn-split`, `#btn-swipe`, `#btn-fade`, `#slider-handle`, `#drawer-sku-selector` | Touch slider events are mock bindings; SKU drawer does not query central catalog | Baseline Locked |
| **10** | `eyekart_optical_comparison_matrix_multi_sku_technical_spec_studio` | `Stitch/.../eyekart_optical_comparison_matrix_multi_sku_technical_spec_studio/screen.png` | `Stitch/.../eyekart_optical_comparison_matrix_multi_sku_technical_spec_studio/code.html` | **LOCKED** | `#btn-show-all`, `#btn-highlight-diff`, `.matrix-row`, `#btn-share-blueprint` | SKUs are hardcoded (EK-902, EK-804, EK-102); share button is dead | Baseline Locked |
| **11** | `eyekart_precision_lens_configurator` | `Stitch/.../eyekart_precision_lens_configurator/screen.png` | `Stitch/.../eyekart_precision_lens_configurator/code.html` | **LOCKED** | `#uv-range`, `#uv-slider-readout`, `select[name="od_sph"]`, `.lens-type-card`, `.index-chip` | Prescription values do not compute dynamic price totals or add to bag | Baseline Locked |
| **12** | `eyekart_clinic_appointment_28_point_eye_exam_booking` | `Stitch/.../eyekart_clinic_appointment_28_point_eye_exam_booking/screen.png` | `Stitch/.../eyekart_clinic_appointment_28_point_eye_exam_booking/code.html` | **LOCKED** | `#stage-location`, `.clinic-card`, `.date-chip`, `.time-slot-btn`, `#confirmBookingBtn` | Clinic selection only updates border classes; confirmation does not save to user appointments | Baseline Locked |
| **13** | `eyekart_clinical_examination_report_precision_diopter_summary` | `Stitch/.../eyekart_clinical_examination_report_precision_diopter_summary/screen.png` | `Stitch/.../eyekart_clinical_examination_report_precision_diopter_summary/code.html` | **LOCKED** | `#toggle-units`, `#btn-configure-with-rx`, `#btn-sync-erecord`, `#btn-download-pdf` | SPH/CYL toggle is partial simulation; "Configure Lenses" does not push Rx to configurator | Baseline Locked |
| **14** | `eyekart_corporate_optical_insurance_claim_pre_authorization` | `Stitch/.../eyekart_corporate_optical_insurance_claim_pre_authorization/screen.png` | `Stitch/.../eyekart_corporate_optical_insurance_claim_pre_authorization/code.html` | **LOCKED** | `#submitClaimBtn`, `#submissionStatus`, `#patientConsentCheckbox`, `#insurerSelect` | Underwriter submission is simulated with a 1.2s timeout; does not link to approved voucher modal | Baseline Locked |
| **15** | `eyekart_claim_approved_electronic_pre_auth_letter_modal` | `Stitch/.../eyekart_claim_approved_electronic_pre_auth_letter_modal/screen.png` | `Stitch/.../eyekart_claim_approved_electronic_pre_auth_letter_modal/code.html` | **LOCKED** | `#voucherCode`, `#printVoucherBtn`, `#downloadPdfBtn`, `#closeModalBtn` | Standalone page instead of triggered modal overlay; print/download actions dead | Baseline Locked |
| **16** | `eyekart_desktop_m_pesa_express_checkout` | `Stitch/.../eyekart_desktop_m_pesa_express_checkout/screen.png` | `Stitch/.../eyekart_desktop_m_pesa_express_checkout/code.html` | **LOCKED** | `#mpesa-number`, `#toggle-edit-btn`, `#btn-trigger-stk`, `#order-summary-container` | Phone number readonly toggle works, but STK push button has no backend or tracking redirect | Baseline Locked |
| **17** | `eyekart_mobile_m_pesa_stk_push_checkout` | `Stitch/.../eyekart_mobile_m_pesa_stk_push_checkout/screen.png` | `Stitch/.../eyekart_mobile_m_pesa_stk_push_checkout/code.html` | **LOCKED** | `#countdownTimer`, `#btn-resend-stk`, `#sim-push-indicator`, `#btn-cancel-checkout` | Countdown timer decrements to 00:00 but does not trigger verified transition or retry logic | Baseline Locked |
| **18** | `eyekart_m_pesa_payment_verified_live_courier_dispatch` | `Stitch/.../eyekart_m_pesa_payment_verified_live_courier_dispatch/screen.png` | `Stitch/.../eyekart_m_pesa_payment_verified_live_courier_dispatch/code.html` | **LOCKED** | `#btn-copy-receipt`, `#toast-feedback`, `#eta-counter`, `#courier-stage-indicator` | `window.dispatchState` exists in mock form; receipt clipboard toast lacks real order ID | Baseline Locked |
| **19** | `eyekart_order_confirmation_live_nairobi_courier_tracking` | `Stitch/.../eyekart_order_confirmation_live_nairobi_courier_tracking/screen.png` | `Stitch/.../eyekart_order_confirmation_live_nairobi_courier_tracking/code.html` | **LOCKED** | `#trackingMapContainer`, `#btn-whatsapp-tracker`, `#btn-download-tax-invoice` | WhatsApp tracking link is static; map view is static raster illustration | Baseline Locked |
| **20** | `eyekart_kra_etr_tax_invoice_clinical_ophthalmic_certificate` | `Stitch/.../eyekart_kra_etr_tax_invoice_clinical_ophthalmic_certificate/screen.png` | `Stitch/.../eyekart_kra_etr_tax_invoice_clinical_ophthalmic_certificate/code.html` | **LOCKED** | `#downloadPdfBtn`, `#printBtn`, `#qrCodeImage`, `#cuSerialNumber` | Download button sets button text to loading state but triggers no download; QR is placeholder | Baseline Locked |
| **21** | `eyekart_customer_account_orders_prescriptions_management` | `Stitch/.../eyekart_customer_account_orders_prescriptions_management/screen.png` | `Stitch/.../eyekart_customer_account_orders_prescriptions_management/code.html` | **LOCKED** | `#tab-orders`, `#tab-prescriptions`, `#tab-appointments`, `#tab-wishlist`, `.tab-content` | Nav tabs are non-functional anchor tags; orders/prescriptions are hardcoded | Baseline Locked |
| **22** | `eyekart_integrated_spatial_optical_master_experience` | `Stitch/.../eyekart_integrated_spatial_optical_master_experience/screen.png` | `Stitch/.../eyekart_integrated_spatial_optical_master_experience/code.html` | **LOCKED** | `#ambient-caustic-canvas`, `#spatial-root`, `[data-path]` | Caustic canvas is uninitialized; navigation paths are dead | Baseline Locked |

---

## 3. Brand Assets & Design System Baseline

| Asset Name | Path | Type | Role |
|---|---|---|---|
| **EyeKart Brand Logo** | `Stitch/.../eyekart_brand_logo/code.html` + `screen.png` | Vector SVG / HTML | Official luxury Nairobi optical atelier typography and iconography |
| **Kenyan Model Studio Portrait** | `Stitch/.../close_up_professional_studio_portrait.../screen.png` | High-Resolution PNG | Canonical photographic reference for face mesh alignment, VTO fallback, and iris scale |
| **Design Tokens & Specs** | `Stitch/.../optical_editorial_precision_clinic/DESIGN.md` | Markdown Spec (237 lines) | Authoritative color tokens (16-color palette), typography scale (`Playfair Display`, `Plus Jakarta Sans`), elevation, and spacing |

---

## 4. Visual Verification Protocol

Before declaring any phase complete:
1. Each modified panel must be rendered via local server.
2. The visual output must be compared against the corresponding `screen.png`.
3. Any visual drift (layout shift, padding alteration, color difference, font replacement) constitutes an immediate regression failure.
