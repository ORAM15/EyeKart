/**
 * EyeKart Universal Navigation & Route Controller
 * Connects existing Stitch navigation elements to approved panels.
 * Conforms to Protocol v1.1, Phase 1 Remediation.
 */
(function (global) {
  'use strict';

  const RouteMap = {
    'home': 'eyekart_grand_optical_homepage',
    'eyeglasses': 'eyekart_optical_catalog_faceted_filters',
    'eyeglasses-collection': 'eyekart_optical_catalog_faceted_filters',
    'catalog': 'eyekart_optical_catalog_faceted_filters',
    'sunglasses': 'eyekart_optical_catalog_faceted_filters?cat=sunglasses',
    'sunglasses-collection': 'eyekart_optical_catalog_faceted_filters?cat=sunglasses',
    'screen-glasses': 'eyekart_optical_catalog_faceted_filters?cat=screen',
    'kids-teens': 'eyekart_optical_catalog_faceted_filters?cat=kids',
    'kids-teens-optics': 'eyekart_optical_catalog_faceted_filters?cat=kids',
    'contact-lenses': 'eyekart_optical_catalog_faceted_filters?cat=contacts',
    'premium-atelier': 'eyekart_optical_catalog_faceted_filters?material=titanium',
    'nairobi-edit': 'eyekart_optical_catalog_faceted_filters?coll=nairobi',
    'product-details': 'eyekart_3d_product_detail_studio',
    'virtual-try-on': 'eyekart_live_camera_virtual_try_on_vto_studio',
    'try-on': 'eyekart_live_camera_virtual_try_on_vto_studio',
    'try-on-studio': 'eyekart_live_camera_virtual_try_on_vto_studio',
    'split-vto': 'eyekart_split_screen_comparison_vto_frame_a_vs_frame_b',
    'compare-vto': 'eyekart_split_screen_comparison_vto_frame_a_vs_frame_b',
    'mobile-vto': 'eyekart_mobile_split_screen_vto_comparison',
    'vto-calibration': 'eyekart_vto_calibration_pd_biometric_scanner',
    'comparison-matrix': 'eyekart_optical_comparison_matrix_multi_sku_technical_spec_studio',
    'lens-customizer': 'eyekart_precision_lens_configurator',
    'upload-prescription': 'eyekart_precision_lens_configurator?tab=upload',
    'book-eye-test': 'eyekart_clinic_appointment_28_point_eye_exam_booking',
    'book-clinic-test': 'eyekart_clinic_appointment_28_point_eye_exam_booking',
    'clinics-nairobi': 'eyekart_clinic_appointment_28_point_eye_exam_booking',
    'nairobi-clinics': 'eyekart_clinic_appointment_28_point_eye_exam_booking',
    'clinical-report': 'eyekart_clinical_examination_report_precision_diopter_summary',
    'corporate-insurance': 'eyekart_corporate_optical_insurance_claim_pre_authorization',
    'insurance-voucher': 'eyekart_claim_approved_electronic_pre_auth_letter_modal',
    'cart': 'eyekart_desktop_m_pesa_express_checkout',
    'cart-bag': 'eyekart_desktop_m_pesa_express_checkout',
    'checkout': 'eyekart_desktop_m_pesa_express_checkout',
    'mobile-checkout': 'eyekart_mobile_m_pesa_stk_push_checkout',
    'courier-dispatch': 'eyekart_m_pesa_payment_verified_live_courier_dispatch',
    'order-tracking': 'eyekart_order_confirmation_live_nairobi_courier_tracking',
    'tax-invoice': 'eyekart_kra_etr_tax_invoice_clinical_ophthalmic_certificate',
    'my-account': 'eyekart_customer_account_orders_prescriptions_management',
    'user-profile': 'eyekart_customer_account_orders_prescriptions_management',
    'profile-portal': 'eyekart_customer_account_orders_prescriptions_management',
    'wishlist': 'eyekart_customer_account_orders_prescriptions_management?tab=wishlist',
    'spatial-master': 'eyekart_integrated_spatial_optical_master_experience',
    'ai-frame-finder': 'eyekart_optical_catalog_faceted_filters?mode=ai',
    'privacy-policy': 'eyekart_customer_account_orders_prescriptions_management?tab=privacy',
    'terms-conditions': 'eyekart_customer_account_orders_prescriptions_management?tab=terms'
  };

  class Router {
    constructor() {
      this.baseDir = this._computeBaseDir();
      this._parseUrlParams();
    }

    _computeBaseDir() {
      return '/Stitch/stitch_eyekart_optical_commerce_platform/';
    }

    _parseUrlParams() {
      if (typeof window === 'undefined' || !window.location || !window.location.search) return;
      const params = new URLSearchParams(window.location.search);
      const sku = params.get('sku');
      if (sku && global.EyeKartStore) {
        // Sanitize SKU input: alphanumeric and hyphens only
        const cleanSku = sku.replace(/[^A-Za-z0-9\-_]/g, '').trim();
        if (cleanSku) {
          global.EyeKartStore.setSelectedSku(cleanSku);
        }
      }
      const variant = params.get('variant');
      if (variant && global.EyeKartStore) {
        global.EyeKartStore.setActiveVariant(decodeURIComponent(variant).trim());
      }
    }

    resolveTarget(pathOrTarget, query) {
      // Prevent path traversal
      if (typeof pathOrTarget !== 'string' || pathOrTarget.includes('..') || pathOrTarget.includes('//')) {
        pathOrTarget = 'home';
      }

      const mapped = RouteMap[pathOrTarget] || pathOrTarget;
      let targetPath = mapped;
      let targetQuery = query || '';

      if (mapped.includes('?')) {
        const parts = mapped.split('?');
        targetPath = parts[0];
        targetQuery = parts[1] + (query ? '&' + query : '');
      }

      const activeSku = global.EyeKartStore ? global.EyeKartStore.getSelectedSku() : 'EK-902';
      const activeVariant = global.EyeKartStore ? global.EyeKartStore.getActiveVariant() : null;
      // Append SKU and variant if not already present and navigating to product-dependent view
      if (['eyekart_3d_product_detail_studio', 'eyekart_precision_lens_configurator', 'eyekart_live_camera_virtual_try_on_vto_studio'].includes(targetPath)) {
        if (!targetQuery.includes('sku=')) {
          targetQuery = (targetQuery ? targetQuery + '&' : '') + 'sku=' + encodeURIComponent(activeSku);
        }
        if (activeVariant && !targetQuery.includes('variant=')) {
          targetQuery = (targetQuery ? targetQuery + '&' : '') + 'variant=' + encodeURIComponent(activeVariant);
        }
      }

      return `${this.baseDir}${targetPath}/code.html${targetQuery ? '?' + targetQuery : ''}`;
    }

    resolvePath(target, query) {
      return this.resolveTarget(target, query);
    }

    navigate(dataPath, query) {
      const url = this.resolveTarget(dataPath, query);
      console.info(`[EyeKart Router] Navigating to: ${url}`);
      window.location.href = url;
    }

    bindLinks() {
      // Bind all a[data-path] and button[data-path]
      document.querySelectorAll('[data-path]').forEach(el => {
        if (el.__eyekart_bound) return;
        el.__eyekart_bound = true;

        el.addEventListener('click', (e) => {
          const path = el.getAttribute('data-path');
          if (!path) return;
          e.preventDefault();

          // If element has a specific SKU or variant attached (e.g. on product card)
          const itemSku = el.getAttribute('data-sku') || el.closest('[data-sku]')?.getAttribute('data-sku');
          const itemVariant = el.getAttribute('data-variant') || el.closest('[data-variant]')?.getAttribute('data-variant');
          if (itemSku && global.EyeKartStore) {
            global.EyeKartStore.setSelectedSku(itemSku);
          }
          if (itemVariant && global.EyeKartStore) {
            global.EyeKartStore.setActiveVariant(itemVariant);
          }

          let query = '';
          const qParts = [];
          if (itemSku) qParts.push('sku=' + encodeURIComponent(itemSku));
          if (itemVariant) qParts.push('variant=' + encodeURIComponent(itemVariant));
          if (qParts.length > 0) query = qParts.join('&');
          this.navigate(path, query);
        });
      });

      // Semantic link interception for frozen Stitch href="#" links lacking explicit data-path
      document.querySelectorAll('a[href="#"]:not([data-path])').forEach(el => {
        if (el.__eyekart_bound) return;
        el.__eyekart_bound = true;

        const text = el.textContent.trim().replace(/\s+/g, ' ');
        el.addEventListener('click', (e) => {
          e.preventDefault();
          if (text.includes('Track Doorstep Delivery')) {
            this.navigate('order-tracking');
          } else if (text.includes('Atelier Hub')) {
            this.navigate('home');
          } else if (text.includes('Clinical Diagnostics')) {
            this.navigate('clinical-report');
          } else if (text.includes('Select with Rx')) {
            this.navigate('lens-customizer');
          } else if (text.includes('3D Virtual Fit')) {
            this.navigate('virtual-try-on');
          } else if (text.includes('Patient Portal')) {
            this.navigate('my-account');
          } else if (text.includes('Insurance Claims')) {
            this.navigate('corporate-insurance');
          } else if (text === 'Home' || text.startsWith('Home ')) {
            this.navigate('home');
          } else if (text.includes('My Optical Dossier')) {
            this.navigate('my-account');
          } else if (text.includes('Launch 3D Studio')) {
            this.navigate('product-details');
          } else if (text.includes('WhatsApp Concierge')) {
            if (typeof window !== 'undefined') window.open('https://wa.me/254700393527', '_blank');
          } else if (text.includes('Dispensary Catalog')) {
            this.navigate('catalog');
          } else if (text.includes('Book In-Clinic Try-On')) {
            this.navigate('book-eye-test');
          } else if (text.includes('Upload Prescription')) {
            this.navigate('upload-prescription');
          } else if (text.includes('Back to Frame Details')) {
            this.navigate('product-details');
          } else if (text.includes('Pupil Gauge')) {
            this.navigate('vto-calibration');
          } else {
            console.debug('[EyeKart Router] Intercepted default href="#" link:', text);
          }
        });
      });

      // Synchronize Header Badges
      this.syncBadges();
    }

    syncBadges() {
      if (!global.EyeKartStore) return;

      // Cart Badge
      const cartLinks = document.querySelectorAll('a[data-path="cart"], a[data-path="cart-bag"]');
      cartLinks.forEach(link => {
        let badge = link.querySelector('.rounded-full, [class*="rounded-full"], [class*="bg-mpesa-green"], [class*="bg-secondary"]');
        if (badge) {
          const updateCartBadge = () => {
            const count = global.EyeKartStore.getCartCount();
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
          };
          updateCartBadge();
          global.EyeKartStore.subscribe('cart', updateCartBadge);
        }
      });

      // Wishlist Badge
      const wishlistLinks = document.querySelectorAll('a[data-path="wishlist"]');
      wishlistLinks.forEach(link => {
        let badge = link.querySelector('.rounded-full, [class*="rounded-full"], [class*="bg-mpesa-green"], [class*="bg-secondary"]');
        if (badge) {
          const updateWishlistBadge = () => {
            const count = global.EyeKartStore.getWishlistCount();
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
          };
          updateWishlistBadge();
          global.EyeKartStore.subscribe('wishlist', updateWishlistBadge);
        }
      });
    }
  }

  global.EyeKartRouter = new Router();

})(typeof window !== 'undefined' ? window : this);
