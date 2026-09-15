/**
 * EyeKart Centralized DOM Selector Registry
 * Authoritative mapping between runtime engines and approved Stitch HTML panels.
 * Conforms to Protocol v1.1, Phase 1 Remediation (Amendment 2).
 * 
 * Selector Priority:
 * 1. Existing unique ID
 * 2. Existing data-* attribute
 * 3. Existing name attribute
 * 4. Existing aria-label / semantic attribute
 * 5. Existing stable class
 * 6. Explicit text matching
 * 7. Inline onclick matching ONLY as a last resort
 */
(function (global) {
  'use strict';

  const EyeKartDOMMap = {
    // Flagship Homepage
    homepage: {
      heroModelSku: '#hero-model-sku',
      heroFinishName: '#hero-finish-name',
      btnLightingToggle: '#btn-lighting-toggle',
      btnDimensionHud: '#btn-dimension-hud',
      caliperOverlay: '#caliper-overlay',
      clinicBookingForm: '#clinic-booking-form',
      swatches: '.swatch-btn, [data-finish]',
      recTitle: '#rec-title',
      recDesc: '#rec-desc',
      recSkuLabel: '#rec-sku-label'
    },

    // Optical Catalog Faceted Filters
    catalog: {
      resetFiltersBtn: '#resetAllFilters',
      bridgeSlider: 'input[type="range"]',
      bridgeDisplay: '#bridgeValueDisplay',
      selectedWidthBadge: '#selectedWidthBadge',
      cards: '[data-sku]',
      wishlistButtons: 'button[title="Save Frame"], .btn-wishlist, [data-action="wishlist"], [data-sku] button.absolute.top-3.right-3',
      filterPillButtons: 'button'
    },

    // 3D Product Detail Studio (2D / CSS PRODUCT ROTATION DEMO)
    productStudio: {
      viewerStage: '#viewerStage',
      rotationArea: '#rotationArea',
      mainImage: '#mainFrameImage',
      rotationAngleDisplay: '#rotationAngleDisplay',
      blueprintBtn: '#blueprintBtn',
      blueprintReticle: '#blueprintReticle',
      lightStudio: '#lightStudio',
      lightGolden: '#lightGolden',
      lightClinical: '#lightClinical',
      bgToggle: '#bgToggle',
      selectedColorName: '#selectedColorName',
      fitModal: '#fitModal',
      toastNotification: '#toastNotification',
      toastIcon: '#toastIcon',
      toastMessage: '#toastMessage',
      configureLensLink: 'a[data-path="lens-customizer"]',
      angleButtons: '.angle-thumb, [onclick*="switchAngle"]',
      resetButton: 'button[onclick*="resetRotation"]',
      buyFrameOnlyButton: 'button[onclick*="buyFrameOnly"]',
      colorButtons: '.color-btn'
    },

    // Precision Lens Configurator
    lensConfigurator: {
      uvSlider: '#uv-range',
      uvReadout: '#uv-slider-readout',
      leftTintOverlay: '#left-tint-overlay',
      rightTintOverlay: '#right-tint-overlay',
      leftLensReflex: '#left-lens-reflex',
      rightLensReflex: '#right-lens-reflex',
      pdSingleBtn: '#pd-mode-single',
      pdDualBtn: '#pd-mode-dual',
      visionTypeRadios: 'input[name="vision_type"]',
      lensIndexRadios: 'input[name="lens_index"]',
      rxSelects: 'select',
      rxInputs: 'input[type="number"]',
      continueToCartLink: 'a[data-path="cart"]',
      resetFormBtn: 'button', // text: "Reset Form"
      prescriptionTabs: '.prescription-tab',
      coatingsCheckboxes: 'input[type="checkbox"]',
      edgeIndicator: '#edge-thickness-indicator',
      edgeMetric: '#edge-metric-text',
      edgeSpecBadge: '#edge-spec-badge'
    },

    // Live Camera VTO Studio
    vto: {
      viewportStage: '#vtoViewportStage',
      arModelFace: '#arModelFace',
      lightingLayer: '#lightingLayer',
      btnLightOffice: '#btnLightOffice',
      btnLightSun: '#btnLightSun',
      btnLightSunset: '#btnLightSunset',
      toggleAntiReflect: '#toggleAntiReflect',
      toggleMirrorFeed: '#toggleMirrorFeed',
      toggleBareFace: '#toggleBareFace',
      toggleFullscreenVTO: '#toggleFullscreenVTO',
      verticalOffsetSlider: '#verticalOffsetSlider',
      offsetValue: '#offsetValue',
      currentFinishLabel: '#currentFinishLabel',
      btnCaptureSnapshot: '#btnCaptureSnapshot',
      snapshotSuccessToast: '#snapshotSuccessToast',
      btnOrderHomeTryOn: '#btnOrderHomeTryOn',
      btnShareLook: '#btnShareLook',
      frameCards: '.frame-selector-card',
      finishSwatches: '.finish-swatch'
    },

    // 28-Point Exam Booking
    booking: {
      selectedTimeBtn: '#selected-time-btn',
      clinicCards: '[onclick*="selectClinic"]',
      tierCards: '[onclick*="selectTier"]',
      doctorCards: '[onclick*="selectDoctor"]',
      dateChips: 'button[onclick*="selectDate"]',
      timeChips: 'button[onclick*="selectTime"]',
      confirmBookingBtn: 'button[onclick*="alert"]'
    },

    // Desktop M-PESA Express Checkout
    checkout: {
      toggleEditBtn: '#toggle-edit-btn',
      mpesaNumber: '#mpesa-number',
      stkSimulator: '#stk-simulator',
      simulatorStatus: '#simulator-status',
      stkPromptText: '#stk-prompt-text',
      triggerStkBtn: '#trigger-stk-button',
      buttonLabel: '#button-label'
    },

    // Customer Account Orders & Prescriptions Management
    account: {
      tabButtons: 'button', // Filtered by text
      actionButtons: 'button'
    },

    // Global / Cross-Panel Elements
    global: {
      navigationLinks: '[data-path]',
      cartBadge: 'a[data-path="cart"] span:not(.material-symbols-outlined), a[data-path="cart-bag"] span:not(.material-symbols-outlined)',
      wishlistBadge: 'a[data-path="wishlist"] span:not(.material-symbols-outlined)',
      searchInputs: 'input[placeholder*="Search" i]',
      kshFinderBtns: 'button' // Filtered by textContent containing "KSh Finder"
    }
  };

  global.EyeKartDOMMap = EyeKartDOMMap;

})(typeof window !== 'undefined' ? window : this);
