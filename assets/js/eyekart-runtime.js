/**
 * EyeKart Master Application Runtime Bootstrap
 * Non-destructive binding layer activating all approved Stitch panels.
 * Conforms to Protocol v1.1, Phase 2.0 Core Commerce State.
 */
(function (global) {
  'use strict';

  function initEyeKartRuntime() {
    console.info('[EyeKart Runtime] Initializing non-destructive runtime layer...');

    const DOMMap = global.EyeKartDOMMap || {};

    // 1. Initialize Universal Router & Link Bindings
    try {
      if (global.EyeKartRouter) {
        global.EyeKartRouter.bindLinks();
      }
    } catch (err) {
      console.warn('[EyeKart Runtime] Router binding error:', err);
    }

    // 2. Global Reactive Subscriptions (Cart & Wishlist Badges)
    try {
      if (global.EyeKartStore) {
        global.EyeKartStore.subscribe('cart', updateGlobalCartBadges);
        global.EyeKartStore.subscribe('wishlist', updateGlobalWishlistBadges);
      }
    } catch (storeErr) {
      console.warn('[EyeKart Runtime] Store subscription error:', storeErr);
    }

    // 3. Identify Current Active Panel
    const pathname = window.location.pathname.replace(/\\/g, '/');

    // Panel Detection & Module Bootstrapping
    try {
      if (pathname.includes('eyekart_grand_optical_homepage') || pathname.endsWith('/') || pathname.endsWith('index.html')) {
        bootstrapHomepage(DOMMap.homepage);
      } else if (pathname.includes('eyekart_optical_catalog_faceted_filters')) {
        bootstrapCatalog(DOMMap.catalog);
      } else if (pathname.includes('eyekart_3d_product_detail_studio')) {
        if (global.EyeKart3DStudio) global.EyeKart3DStudio.init();
      } else if (pathname.includes('eyekart_optical_catalog_quick_view_dimension_blueprint')) {
        bootstrapQuickViewBlueprint();
      } else if (pathname.includes('eyekart_live_camera_virtual_try_on_vto_studio') ||
                 pathname.includes('eyekart_vto_calibration_pd_biometric_scanner') ||
                 pathname.includes('eyekart_split_screen_comparison_vto') ||
                 pathname.includes('eyekart_mobile_split_screen_vto') ||
                 pathname.includes('eyekart_catalog_collection_live_try_on_studio')) {
        if (global.EyeKartVTO) global.EyeKartVTO.init();
      } else if (pathname.includes('eyekart_precision_lens_configurator')) {
        if (global.EyeKartLensEngine) global.EyeKartLensEngine.init();
      } else if (pathname.includes('eyekart_clinic_appointment_28_point_eye_exam_booking')) {
        if (global.EyeKartBooking) global.EyeKartBooking.init();
      } else if (pathname.includes('eyekart_desktop_m_pesa_express_checkout') ||
                 pathname.includes('eyekart_mobile_m_pesa_stk_push_checkout') ||
                 pathname.includes('eyekart_m_pesa_payment_verified_live_courier_dispatch') ||
                 pathname.includes('eyekart_order_confirmation_live_nairobi_courier_tracking') ||
                 pathname.includes('eyekart_kra_etr_tax_invoice') ||
                 pathname.includes('eyekart_corporate_optical_insurance') ||
                 pathname.includes('eyekart_claim_approved_electronic_pre_auth')) {
        if (global.EyeKartMPESA) global.EyeKartMPESA.init();
      } else if (pathname.includes('eyekart_customer_account_orders')) {
        if (global.EyeKartAccount) global.EyeKartAccount.init();
      } else if (pathname.includes('eyekart_optical_comparison_matrix')) {
        bootstrapComparisonMatrix();
      } else if (pathname.includes('eyekart_clinical_examination_report_precision_diopter_summary')) {
        bootstrapClinicalReport();
      } else if (pathname.includes('eyekart_integrated_spatial_optical_master')) {
        bootstrapSpatialMaster();
      }
    } catch (panelErr) {
      console.warn('[EyeKart Runtime] Panel-specific bootstrap warning:', panelErr);
    }

    // 4. Global Search "KSh Finder" Binding
    try {
      bindGlobalSearch(DOMMap.global);
    } catch (searchErr) {
      console.warn('[EyeKart Runtime] Global search binding warning:', searchErr);
    }

    console.info('[EyeKart Runtime] Runtime bindings successfully attached.');
  }

  // --- Universal Header Cart Badge Sync ---
  function updateGlobalCartBadges(cart) {
    const count = global.EyeKartStore ? global.EyeKartStore.getCartCount() : (cart?.items?.length || 0);
    const cartLinks = document.querySelectorAll('a[data-path="cart"], a[data-path="cart-bag"]');
    cartLinks.forEach(link => {
      const badge = link.querySelector('.rounded-full, [class*="rounded-full"], [class*="bg-mpesa-green"], [class*="bg-secondary"]');
      if (badge) {
        badge.textContent = String(count);
        badge.style.display = count > 0 ? '' : 'none';
      }
    });
  }

  // --- Universal Header Wishlist Badge Sync ---
  function updateGlobalWishlistBadges(wishlist) {
    const count = global.EyeKartStore ? global.EyeKartStore.getWishlistCount() : (wishlist?.length || 0);
    const wishlistLinks = document.querySelectorAll('a[data-path="wishlist"]');
    wishlistLinks.forEach(link => {
      const badge = link.querySelector('.rounded-full, [class*="rounded-full"], [class*="bg-mpesa-green"], [class*="bg-secondary"]');
      if (badge) {
        badge.textContent = String(count);
      }
    });
  }

  // --- Homepage Bootstrap ---
  function bootstrapHomepage(dom) {
    dom = dom || {};

    // Initialize Cinematic 3D Engine
    try {
      if (global.EyeKartCinematic3D) {
        global.EyeKartCinematic3D.init();
      }
    } catch (e3dErr) {
      console.warn('[EyeKart Runtime] Cinematic 3D init warning:', e3dErr);
    }

    // Caliper Dimension HUD Toggle
    const caliperBtn = document.querySelector(dom.btnDimensionHud || '#btn-dimension-hud');
    const caliperOverlay = document.querySelector(dom.caliperOverlay || '#caliper-overlay');
    if (caliperBtn && caliperOverlay && !caliperBtn.__eyekart_bound) {
      caliperBtn.__eyekart_bound = true;
      caliperBtn.addEventListener('click', (e) => {
        e.preventDefault();
        caliperOverlay.classList.toggle('hidden');
      });
    }

    // Swatch finish buttons
    const swatches = document.querySelectorAll(dom.swatches || '.swatch-btn, [data-finish]');
    const finishLabel = document.querySelector(dom.heroFinishName || '#hero-finish-name');
    const skuLabel = document.querySelector(dom.heroModelSku || '#hero-model-sku');

    swatches.forEach(btn => {
      if (btn.__eyekart_bound) return;
      btn.__eyekart_bound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const finish = btn.getAttribute('data-finish') || 'Obsidian Black';
        const sku = btn.getAttribute('data-sku') || 'KIBERA TITANIUM — SERIE 01';
        if (finishLabel) finishLabel.textContent = finish;
        if (skuLabel) skuLabel.textContent = sku;
        if (global.EyeKartStore) {
          global.EyeKartStore.setSelectedSku('EK-902');
          global.EyeKartStore.state.activeVariant = finish;
        }
      });
    });

    // Homepage Clinic Booking Form
    const clinicForm = document.querySelector(dom.clinicBookingForm || '#clinic-booking-form');
    if (clinicForm && global.EyeKartBooking) {
      global.EyeKartBooking.init();
    }
  }

  // --- Catalog Faceted Filter Bootstrap ---
  function bootstrapCatalog(dom) {
    dom = dom || {};
    const bridgeSlider = document.querySelector(dom.bridgeSlider || 'input[type="range"]');
    const bridgeDisplay = document.querySelector(dom.bridgeDisplay || '#bridgeValueDisplay');
    const priceSlider = document.querySelectorAll('input[type="range"]')[1];
    const productCards = Array.from(document.querySelectorAll(dom.cards || '[data-sku]'));
    const gridContainer = productCards[0]?.parentElement || null;

    // Cache initial order for resetting
    const initialCardsOrder = [...productCards];

    // State of active filters
    let activeFilters = {
      query: '',
      gender: 'all',
      categories: [],
      materials: [],
      shapes: [],
      bridge: 0,
      priceMax: 38000
    };

    // 1. Read URL query parameters (?q=..., ?cat=..., ?material=...)
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const qParam = params.get('q');
      const catParam = params.get('cat');
      const matParam = params.get('material');

      if (qParam) {
        activeFilters.query = qParam.trim();
        const searchInputs = document.querySelectorAll('input[placeholder*="Search" i]');
        searchInputs.forEach(inp => { inp.value = activeFilters.query; });
      }
      if (catParam) {
        activeFilters.categories.push(catParam.toLowerCase());
      }
      if (matParam) {
        activeFilters.materials.push(matParam.toLowerCase());
      }
    }

    // 2. Search Input Binding on Page
    const searchInputs = document.querySelectorAll('input[placeholder*="Search" i]');
    searchInputs.forEach(input => {
      if (input.__eyekart_bound_catalog) return;
      input.__eyekart_bound_catalog = true;
      input.addEventListener('input', (e) => {
        activeFilters.query = e.target.value.trim();
        applyCatalogFilters();
      });
    });

    // 3. Bridge Slider Filter
    if (bridgeSlider && !bridgeSlider.__eyekart_bound) {
      bridgeSlider.__eyekart_bound = true;
      bridgeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (bridgeDisplay) bridgeDisplay.textContent = `${val} mm`;
        activeFilters.bridge = val;
        applyCatalogFilters();
      });
    }

    // 4. Price Slider Filter
    if (priceSlider && !priceSlider.__eyekart_bound) {
      priceSlider.__eyekart_bound = true;
      priceSlider.addEventListener('input', (e) => {
        activeFilters.priceMax = parseInt(e.target.value, 10);
        applyCatalogFilters();
      });
    }

    // 5. Sidebar Checkboxes (Category, Style, Material, Prescription)
    const filterCheckboxes = document.querySelectorAll('aside input[type="checkbox"]');
    filterCheckboxes.forEach(cb => {
      if (cb.__eyekart_bound) return;
      cb.__eyekart_bound = true;
      cb.addEventListener('change', () => {
        extractCheckboxFilters();
        applyCatalogFilters();
      });
    });

    function extractCheckboxFilters() {
      const checkedLabels = Array.from(filterCheckboxes)
        .filter(c => c.checked)
        .map(c => c.closest('label')?.textContent.toLowerCase() || '');

      // Categories
      activeFilters.categories = [];
      if (checkedLabels.some(l => l.includes('prescription'))) activeFilters.categories.push('eyeglasses');
      if (checkedLabels.some(l => l.includes('equatorial sun'))) activeFilters.categories.push('sunglasses');
      if (checkedLabels.some(l => l.includes('blue defend'))) activeFilters.categories.push('screen');

      // Materials
      activeFilters.materials = [];
      if (checkedLabels.some(l => l.includes('titanium'))) activeFilters.materials.push('titanium');
      if (checkedLabels.some(l => l.includes('acetate'))) activeFilters.materials.push('acetate');
      if (checkedLabels.some(l => l.includes('tr90') || l.includes('polymer'))) activeFilters.materials.push('tr90', 'polymer');
      if (checkedLabels.some(l => l.includes('stainless') || l.includes('alloy') || l.includes('wire'))) activeFilters.materials.push('wire', 'stainless', 'alloy');
      if (checkedLabels.some(l => l.includes('horn'))) activeFilters.materials.push('horn');

      // Styles / Shapes
      activeFilters.shapes = [];
      if (checkedLabels.some(l => l.includes('semi-rimless'))) activeFilters.shapes.push('semi-rimless');
      if (checkedLabels.some(l => l.includes('rimless precision'))) activeFilters.shapes.push('rimless');
      if (checkedLabels.some(l => l.includes('cat-eye'))) activeFilters.shapes.push('cat-eye');
    }

    // 6. Gender Filter Pills (Men's, Women's, Teens)
    const genderBtns = Array.from(document.querySelectorAll('button')).filter(btn => 
      btn.textContent && (btn.textContent.includes("Men's") || btn.textContent.includes("Women's") || btn.textContent.includes("Teens"))
    );
    genderBtns.forEach(btn => {
      if (btn.__eyekart_bound) return;
      btn.__eyekart_bound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const text = btn.textContent.toLowerCase();
        if (text.includes("men's")) {
          activeFilters.gender = activeFilters.gender === 'men' ? 'all' : 'men';
        } else if (text.includes("women's")) {
          activeFilters.gender = activeFilters.gender === 'women' ? 'all' : 'women';
        } else if (text.includes("teens")) {
          activeFilters.gender = activeFilters.gender === 'teens' ? 'all' : 'teens';
        }
        genderBtns.forEach(b => b.classList.remove('bg-primary', 'text-on-primary'));
        if (activeFilters.gender !== 'all') {
          btn.classList.add('bg-primary', 'text-on-primary');
        }
        applyCatalogFilters();
      });
    });

    // 7. Shape Filter Icon Buttons
    const shapeBtns = Array.from(document.querySelectorAll('button')).filter(btn => 
      btn.querySelector('span') && ['crop_square', 'circle', 'change_history'].some(s => btn.innerHTML.includes(s))
    );
    shapeBtns.forEach(btn => {
      if (btn.__eyekart_bound) return;
      btn.__eyekart_bound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const text = btn.textContent.toLowerCase();
        if (text.includes('round')) activeFilters.shapes = ['round'];
        else if (text.includes('square')) activeFilters.shapes = ['square'];
        else if (text.includes('aviator')) activeFilters.shapes = ['aviator'];
        else if (text.includes('cat')) activeFilters.shapes = ['cat-eye'];
        else activeFilters.shapes = [];
        applyCatalogFilters();
      });
    });

    // Core Multi-Faceted Filter Pipeline
    function applyCatalogFilters() {
      let visibleCount = 0;

      productCards.forEach(card => {
        const sku = card.getAttribute('data-sku') || '';
        const frame = global.CatalogService ? global.CatalogService.getBySku(sku) : null;
        if (!frame) return;

        let visible = true;

        // Search Query
        if (activeFilters.query) {
          const q = activeFilters.query.toLowerCase();
          const match = frame.name.toLowerCase().includes(q) ||
                        frame.sku.toLowerCase().includes(q) ||
                        frame.shape.toLowerCase().includes(q) ||
                        frame.material.toLowerCase().includes(q) ||
                        (frame.collection && frame.collection.toLowerCase().includes(q));
          if (!match) visible = false;
        }

        // Category Filter
        if (visible && activeFilters.categories.length > 0) {
          if (!activeFilters.categories.includes(frame.category.toLowerCase())) {
            visible = false;
          }
        }

        // Gender Filter
        if (visible && activeFilters.gender !== 'all') {
          if (frame.gender !== activeFilters.gender && frame.gender !== 'unisex') {
            visible = false;
          }
        }

        // Shape Filter
        if (visible && activeFilters.shapes.length > 0) {
          const matchShape = activeFilters.shapes.some(s => frame.shape.toLowerCase().includes(s));
          if (!matchShape) visible = false;
        }

        // Material Filter
        if (visible && activeFilters.materials.length > 0) {
          const matchMat = activeFilters.materials.some(m => frame.material.toLowerCase().includes(m));
          if (!matchMat) visible = false;
        }

        // Bridge Filter (if slider moved)
        if (visible && activeFilters.bridge > 15) {
          if (frame.bridge !== activeFilters.bridge) {
            visible = false;
          }
        }

        // Price Filter
        if (visible && activeFilters.priceMax < 38000) {
          if (frame.price > activeFilters.priceMax) {
            visible = false;
          }
        }

        card.style.display = visible ? '' : 'none';
        if (visible) visibleCount++;
      });

      // Runtime-managed non-destructive empty state
      if (gridContainer) {
        let emptyEl = document.getElementById('catalog-empty-state');
        if (visibleCount === 0) {
          if (!emptyEl) {
            emptyEl = document.createElement('div');
            emptyEl.id = 'catalog-empty-state';
            emptyEl.className = 'col-span-full py-16 flex flex-col items-center justify-center text-center p-8 bg-surface-cream/50 rounded-xl border border-outline-variant/30 space-y-3';
            emptyEl.innerHTML = `
              <span class="material-symbols-outlined text-[48px] text-outline">search_off</span>
              <h3 class="font-headline-sm text-headline-sm text-primary font-semibold">No Frames Match Your Filter Criteria</h3>
              <p class="font-body-sm text-body-sm text-on-surface-variant max-w-md">Try widening your price range, clearing specific material/silhouette filters, or resetting all criteria.</p>
              <button type="button" id="btn-empty-reset-filters" class="mt-2 px-5 py-2 rounded bg-primary text-optical-white font-label-md text-label-md hover:bg-graphite transition-all shadow-sm">Reset All Filters</button>
            `;
            gridContainer.appendChild(emptyEl);
            const rBtn = emptyEl.querySelector('#btn-empty-reset-filters');
            if (rBtn) {
              rBtn.addEventListener('click', () => {
                const resetAllBtn = document.getElementById('resetAllFilters');
                if (resetAllBtn) resetAllBtn.click();
              });
            }
          } else {
            emptyEl.style.display = '';
          }
        } else if (emptyEl) {
          emptyEl.style.display = 'none';
        }
      }

      console.info(`[EyeKart Catalog] Filtered results: ${visibleCount} of ${productCards.length} frames visible.`);
    }

    // 8. Sorting Dropdown Binding (In-Place Node Reordering Preserves HTML & Handlers)
    const sortSelect = document.querySelector('select');
    if (sortSelect && !sortSelect.__eyekart_bound) {
      sortSelect.__eyekart_bound = true;
      sortSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        sortCatalogGrid(val);
      });
    }

    function sortCatalogGrid(sortType) {
      if (!gridContainer) return;

      const sortedCards = [...productCards].sort((cardA, cardB) => {
        const skuA = cardA.getAttribute('data-sku');
        const skuB = cardB.getAttribute('data-sku');
        const frameA = global.CatalogService?.getBySku(skuA) || { price: 0, weight: '99g' };
        const frameB = global.CatalogService?.getBySku(skuB) || { price: 0, weight: '99g' };

        if (sortType === 'Price: Low to High') {
          return frameA.price - frameB.price;
        } else if (sortType === 'Price: High to Low') {
          return frameB.price - frameA.price;
        } else if (sortType.includes('Featherlight')) {
          const weightA = parseFloat(frameA.weight) || 99;
          const weightB = parseFloat(frameB.weight) || 99;
          return weightA - weightB;
        } else {
          // Default / Most Acclaimed: restore initial DOM order
          return initialCardsOrder.indexOf(cardA) - initialCardsOrder.indexOf(cardB);
        }
      });

      // In-place node re-attachment moves DOM elements safely without destroying innerHTML
      sortedCards.forEach(card => gridContainer.appendChild(card));
    }

    // 9. Reset All Filters Button
    const resetBtns = document.querySelectorAll(dom.resetFiltersBtn || '#resetAllFilters, button');
    resetBtns.forEach(btn => {
      if (btn.id === 'resetAllFilters' || (btn.textContent && (btn.textContent.includes('Reset') || btn.textContent.includes('Clear all criteria')))) {
        if (btn.__eyekart_bound) return;
        btn.__eyekart_bound = true;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          activeFilters = {
            query: '',
            gender: 'all',
            categories: [],
            materials: [],
            shapes: [],
            bridge: 0,
            priceMax: 38000
          };
          searchInputs.forEach(i => { i.value = ''; });
          filterCheckboxes.forEach(cb => { cb.checked = true; });
          if (bridgeSlider) bridgeSlider.value = 18;
          if (bridgeDisplay) bridgeDisplay.textContent = '18 mm';
          if (priceSlider) priceSlider.value = 38000;
          if (sortSelect) sortSelect.selectedIndex = 0;
          sortCatalogGrid('Most Acclaimed in Nairobi');
          applyCatalogFilters();
        });
      }
    });

    // 10. Wishlist Buttons on Cards (Immediate Visual Toggle & Persistence)
    const heartButtons = document.querySelectorAll(dom.wishlistButtons || 'button[title="Save Frame"], .btn-wishlist, [data-action="wishlist"]');
    heartButtons.forEach(btn => {
      const card = btn.closest('[data-sku]');
      const sku = card ? card.getAttribute('data-sku') : null;

      // Sync initial heart state from store
      if (sku && global.EyeKartStore) {
        const isSaved = global.EyeKartStore.isInWishlist(sku);
        const icon = btn.querySelector('.material-symbols-outlined');
        if (icon) {
          icon.textContent = isSaved ? 'favorite' : 'favorite_border';
          if (isSaved) {
            icon.classList.add('text-alert-clinical');
            icon.style.fontVariationSettings = "'FILL' 1";
          } else {
            icon.classList.remove('text-alert-clinical');
            icon.style.fontVariationSettings = "'FILL' 0";
          }
        }
      }

      if (btn.__eyekart_bound) return;
      btn.__eyekart_bound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!sku || !global.EyeKartStore) return;

        const added = global.EyeKartStore.toggleWishlist(sku);
        const icon = btn.querySelector('.material-symbols-outlined');
        if (icon) {
          icon.textContent = added ? 'favorite' : 'favorite_border';
          if (added) {
            icon.classList.add('text-alert-clinical');
            icon.style.fontVariationSettings = "'FILL' 1";
          } else {
            icon.classList.remove('text-alert-clinical');
            icon.style.fontVariationSettings = "'FILL' 0";
          }
        }
      });
    });

    // 10.1. Comparison Buttons on Cards (Inject & Sync)
    productCards.forEach(card => {
      const sku = card.getAttribute('data-sku');
      if (!sku) return;

      let compareBtn = card.querySelector('.btn-compare');
      if (!compareBtn) {
        compareBtn = document.createElement('button');
        compareBtn.className = 'absolute top-3 right-12 z-10 p-2 rounded-full bg-optical-white/80 hover:bg-optical-white text-on-surface-variant hover:text-primary transition-all shadow-xs btn-compare';
        compareBtn.setAttribute('data-action', 'compare');
        compareBtn.setAttribute('title', 'Compare Frame');
        compareBtn.setAttribute('type', 'button');
        compareBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">difference</span>';
        const cardHeader = card.querySelector('.relative');
        if (cardHeader) {
          cardHeader.appendChild(compareBtn);
        }
      }

      const syncCompareState = () => {
        if (!sku || !global.EyeKartStore) return;
        const inCompare = global.EyeKartStore.isInCompare(sku);
        const icon = compareBtn.querySelector('.material-symbols-outlined');
        if (inCompare) {
          compareBtn.classList.add('bg-primary', 'text-optical-white');
          compareBtn.classList.remove('bg-optical-white/80', 'text-on-surface-variant');
          compareBtn.title = 'Remove from Spec Matrix';
          if (icon) icon.classList.add('text-cyan-accent');
        } else {
          compareBtn.classList.remove('bg-primary', 'text-optical-white');
          compareBtn.classList.add('bg-optical-white/80', 'text-on-surface-variant');
          compareBtn.title = 'Add to Technical Spec Matrix';
          if (icon) icon.classList.remove('text-cyan-accent');
        }
      };

      syncCompareState();

      if (!compareBtn.__eyekart_bound) {
        compareBtn.__eyekart_bound = true;
        compareBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!sku || !global.EyeKartStore) return;
          global.EyeKartStore.toggleCompare(sku);
          syncCompareState();
        });
      }
    });

    if (global.EyeKartStore) {
      global.EyeKartStore.subscribe('comparison', () => {
        productCards.forEach(card => {
          const sku = card.getAttribute('data-sku');
          const compareBtn = card.querySelector('.btn-compare');
          if (sku && compareBtn && global.EyeKartStore) {
            const inCompare = global.EyeKartStore.isInCompare(sku);
            const icon = compareBtn.querySelector('.material-symbols-outlined');
            if (inCompare) {
              compareBtn.classList.add('bg-primary', 'text-optical-white');
              compareBtn.classList.remove('bg-optical-white/80', 'text-on-surface-variant');
              compareBtn.title = 'Remove from Spec Matrix';
              if (icon) icon.classList.add('text-cyan-accent');
            } else {
              compareBtn.classList.remove('bg-primary', 'text-optical-white');
              compareBtn.classList.add('bg-optical-white/80', 'text-on-surface-variant');
              compareBtn.title = 'Add to Technical Spec Matrix';
              if (icon) icon.classList.remove('text-cyan-accent');
            }
          }
        });
      });
    }

    // 11. Direct Product Card Clicks & Color Swatches
    productCards.forEach(card => {
      const sku = card.getAttribute('data-sku');
      // Bind color swatch dots on card
      const swatches = card.querySelectorAll('span.cursor-pointer, span[title]');
      swatches.forEach(swatch => {
        const title = swatch.getAttribute('title');
        if (title && (title.includes('Gold') || title.includes('Black') || title.includes('Bronze') || title.includes('Titanium') || title.includes('Tortoise') || title.includes('Silver') || title.includes('Obsidian'))) {
          if (swatch.__eyekart_bound) return;
          swatch.__eyekart_bound = true;
          swatch.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (sku && global.EyeKartStore) {
              global.EyeKartStore.setSelectedSku(sku);
              global.EyeKartStore.setActiveVariant(title);
            }
            swatches.forEach(s => s.classList.remove('ring-1', 'ring-offset-1', 'ring-secondary'));
            swatch.classList.add('ring-1', 'ring-offset-1', 'ring-secondary');
          });
        }
      });

      if (card.__eyekart_bound) return;
      card.__eyekart_bound = true;
      card.addEventListener('click', (e) => {
        // If clicked on button or wishlist heart or link, let that element handle it
        if (e.target.closest('button, [data-path], a')) return;
        if (sku && global.EyeKartStore) global.EyeKartStore.setSelectedSku(sku);
        const variant = global.EyeKartStore ? global.EyeKartStore.getActiveVariant() : null;
        let query = sku ? `sku=${encodeURIComponent(sku)}` : '';
        if (variant) query += `&variant=${encodeURIComponent(variant)}`;
        if (global.EyeKartRouter) {
          global.EyeKartRouter.navigate('product-details', query);
        }
      });
    });

    // Run initial filter if params present
    if (activeFilters.query || activeFilters.categories.length > 0 || activeFilters.materials.length > 0) {
      applyCatalogFilters();
    }
  }

  // --- Quick View CAD Blueprint Bootstrap ---
  function bootstrapQuickViewBlueprint() {
    const viewButtons = document.querySelectorAll('.view-mode-btn');
    const angleLabel = document.getElementById('active-angle-label');
    const blueprintHud = document.getElementById('blueprint-hud');
    const toggleBp = document.getElementById('toggle-blueprint-btn');

    viewButtons.forEach(btn => {
      if (btn.__eyekart_bound) return;
      btn.__eyekart_bound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (angleLabel) angleLabel.textContent = btn.textContent.trim();
        viewButtons.forEach(b => b.classList.remove('bg-primary', 'text-on-primary'));
        btn.classList.add('bg-primary', 'text-on-primary');
      });
    });

    if (toggleBp && blueprintHud && !toggleBp.__eyekart_bound) {
      toggleBp.__eyekart_bound = true;
      toggleBp.addEventListener('click', () => {
        blueprintHud.classList.toggle('hidden');
      });
    }

    const addBagBtn = document.getElementById('btn-quick-add-bag') || document.getElementById('buy-frame-only-btn');
    if (addBagBtn && global.EyeKartStore && !addBagBtn.__eyekart_bound) {
      addBagBtn.__eyekart_bound = true;
      addBagBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const activeSku = global.EyeKartStore.getSelectedSku();
        const frame = global.CatalogService ? global.CatalogService.getBySku(activeSku) : null;
        global.EyeKartStore.addCartItem({
          sku: activeSku,
          name: frame ? frame.name : 'Optical Frame (CAD Blueprint)',
          variant: 'Standard Blueprint',
          framePrice: frame ? frame.price : 13800,
          totalPrice: frame ? frame.price : 13800,
          qty: 1
        });
      });
    }
  }

  // --- Multi-SKU Comparison Matrix Bootstrap ---
  function bootstrapComparisonMatrix() {
    const btnAll = document.getElementById('btn-show-all');
    const btnDiff = document.getElementById('btn-highlight-diff');
    const rows = document.querySelectorAll('.matrix-row, tr');

    // 1. Dynamic Rendering from EyeKartStore.getComparison()
    function renderComparisonMatrix() {
      if (!global.EyeKartStore || !global.CatalogService) return;
      const comparison = global.EyeKartStore.getComparison ? global.EyeKartStore.getComparison() : (global.EyeKartStore.state.comparison || []);
      
      // Update locked count pill in Section 1
      const countBadge = document.querySelector('.bg-secondary-fixed.text-on-secondary-container');
      if (countBadge) {
        countBadge.textContent = `${comparison.length} Frame${comparison.length === 1 ? '' : 's'} Locked`;
      }

      // Loop through the 3 displayed column slots: sku-col-1, sku-col-2, sku-col-3
      for (let slot = 1; slot <= 3; slot++) {
        const colClass = `sku-col-${slot}`;
        const sku = comparison[slot - 1];
        const headerCol = document.querySelector(`.sticky .${colClass}`);

        if (sku) {
          const frame = global.CatalogService.getBySku(sku);
          if (headerCol) {
            headerCol.innerHTML = `
              <button class="absolute top-2 right-2 p-1 text-outline hover:text-error transition-colors rounded-full hover:bg-surface-cream btn-remove-compare" onclick="window.removeSku('${colClass}')" title="Remove frame">
                <span class="material-symbols-outlined text-[18px]">close</span>
              </button>
              <div>
                <div class="flex items-center gap-2 mb-2">
                  <span class="px-2 py-0.5 bg-surface-container-high text-on-surface font-label-sm text-[10px] uppercase tracking-wider font-bold rounded">${frame.sku}</span>
                  <span class="px-2 py-0.5 bg-secondary-fixed text-on-secondary-fixed-variant font-label-sm text-[10px] font-bold rounded">${frame.shape.toUpperCase()}</span>
                </div>
                <div class="relative h-28 w-full mb-3 bg-surface-ivory rounded flex items-center justify-center p-2 overflow-hidden">
                  <img class="h-full w-auto object-contain transition-transform group-hover:scale-105 duration-300" src="${frame.gallery[0]}" alt="${frame.sku} ${frame.name}" />
                  <span class="absolute bottom-1 right-2 font-label-sm text-[9px] text-outline">Weight: ${frame.weight}</span>
                </div>
                <h3 class="font-title-md text-title-md text-primary font-bold line-clamp-1 leading-snug">${frame.name}</h3>
                <p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-1">${frame.material}</p>
                <div class="mt-2 flex items-baseline gap-2">
                  <span class="font-data-metric text-data-metric text-primary">KSh ${Number(frame.price).toLocaleString('en-KE')}</span>
                  <span class="font-body-sm text-body-sm text-mpesa-green font-bold">M-PESA Ready</span>
                </div>
                <div class="mt-1 flex items-center gap-1.5 font-label-sm text-[11px] text-on-surface-variant">
                  <span class="material-symbols-outlined text-mpesa-green text-[14px]">storefront</span>
                  <span>Sarit Centre Eye Lab (${frame.stock} units)</span>
                </div>
              </div>
              <div class="mt-3 pt-3 flex gap-2">
                <a href="${global.EyeKartRouter ? global.EyeKartRouter.resolveTarget('lens-customizer', 'sku=' + frame.sku) : '#'}" data-path="lens-customizer" class="flex-1 py-2 bg-primary hover:bg-graphite text-on-primary font-label-sm text-label-sm rounded transition-colors text-center">Configure Lenses</a>
                <a href="${global.EyeKartRouter ? global.EyeKartRouter.resolveTarget('product-details', 'sku=' + frame.sku) : '#'}" data-path="product-details" class="px-2.5 py-2 bg-surface-cream hover:bg-surface-container-high text-on-surface rounded transition-colors flex items-center justify-center" title="Launch 3D Studio">
                  <span class="material-symbols-outlined text-[18px]">view_in_ar</span>
                </a>
              </div>
            `;
          }

          // Populate matrix rows
          document.querySelectorAll('.matrix-row').forEach(row => {
            const cell = row.querySelector(`.${colClass}`);
            if (!cell) return;
            const rowLabel = row.querySelector('.font-label-md')?.textContent?.trim() || '';

            if (rowLabel.includes('Lens Width')) {
              cell.innerHTML = `
                <span class="font-data-metric text-data-metric text-primary">${frame.lensWidth} mm</span>
                <div class="w-full bg-surface-cream rounded-full h-1.5 mt-1.5">
                  <div class="bg-secondary h-1.5 rounded-full" style="width: ${Math.min(100, Math.round(frame.lensWidth * 1.3))}%"></div>
                </div>
                <span class="font-body-sm text-body-sm text-outline">Aperture width</span>
              `;
            } else if (rowLabel.includes('Bridge Width')) {
              cell.innerHTML = `
                <span class="font-data-metric text-data-metric text-primary">${frame.bridge} mm</span>
                <p class="font-body-sm text-body-sm text-on-surface mt-0.5">Anatomical nasal caliber</p>
              `;
            } else if (rowLabel.includes('Temple Length')) {
              cell.innerHTML = `
                <span class="font-data-metric text-data-metric text-primary">${frame.temple} mm</span>
                <span class="font-body-sm text-body-sm text-outline block">Cranial curvature reach</span>
              `;
            } else if (rowLabel.includes('Total Frame Width')) {
              const totalWidth = frame.frameTotalWidth || (frame.lensWidth * 2 + frame.bridge + 16);
              cell.innerHTML = `
                <span class="font-data-metric text-data-metric text-primary">${totalWidth} mm</span>
                <span class="px-2 py-0.5 bg-surface-cream text-on-surface font-label-sm text-[10px] rounded inline-block mt-1">Hinge-to-Hinge Span</span>
              `;
            } else if (rowLabel.includes('B-Dimension') || rowLabel.includes('Lens Height')) {
              cell.innerHTML = `
                <span class="font-data-metric text-data-metric text-primary">${frame.lensHeight} mm</span>
                <span class="font-body-sm text-body-sm text-mpesa-green font-bold block">100% Varifocal Corridor</span>
              `;
            } else if (rowLabel.includes('Bare Chassis Weight')) {
              cell.innerHTML = `
                <div class="flex items-center gap-2">
                  <span class="font-data-metric text-data-metric text-primary">${frame.weight}</span>
                  <span class="material-symbols-outlined text-secondary text-[18px]">clock_loader_40</span>
                </div>
                <span class="font-body-sm text-body-sm text-on-surface-variant">${frame.material.slice(0, 32)}</span>
              `;
            } else if (rowLabel.includes('Facial Morphology')) {
              const shapes = frame.recommendedFaceShapes && frame.recommendedFaceShapes.length > 0 
                ? frame.recommendedFaceShapes 
                : ['Oval', 'Round', 'Universal'];
              cell.innerHTML = `
                <div class="flex flex-wrap gap-1">
                  ${shapes.map(s => `<span class="px-2 py-0.5 bg-surface-subtle text-on-surface font-label-sm text-[11px] rounded capitalize">${s}</span>`).join('')}
                </div>
              `;
            } else if (rowLabel.includes('Chassis Construction')) {
              cell.innerHTML = `
                <span class="font-title-md text-title-md text-primary font-bold block">${frame.material}</span>
                <p class="font-body-sm text-body-sm text-on-surface-variant mt-1">${frame.finish || 'Hand-Polished Finish'}</p>
              `;
            } else if (rowLabel.includes('Hinge Architecture')) {
              cell.innerHTML = `
                <span class="font-label-md text-label-md text-primary font-bold block">German OBE 5-Barrel Precision Flex</span>
                <p class="font-body-sm text-body-sm text-on-surface-variant">Teflon-coated pivot pins; 25k flex cycles</p>
              `;
            } else if (rowLabel.includes('Nose Support Mechanism')) {
              cell.innerHTML = `
                <span class="font-body-md text-body-md text-on-surface font-medium">Hypoallergenic Medical Silicone</span>
                <p class="font-body-sm text-body-sm text-on-surface-variant">Pressure-distributing contoured pads</p>
              `;
            } else if (rowLabel.includes('Temple Reinforcement')) {
              cell.innerHTML = `
                <span class="font-body-md text-body-md text-on-surface">${frame.material.includes('Titanium') ? 'Micro-Fluted Laser Titanium Inlay' : 'Continuous 0.8mm Titanium Filament'}</span>
              `;
            } else if (rowLabel.includes('High Myopia Tolerance')) {
              const maxSph = frame.prescriptionCompatibility?.sphMin || -10;
              cell.innerHTML = `
                <div class="flex items-center gap-2">
                  <span class="font-data-metric text-data-metric text-mpesa-green">Optimal up to ${maxSph}.00 D</span>
                </div>
                <p class="font-body-sm text-body-sm text-on-surface-variant mt-1">Conceals high-index 1.67 / 1.74 edge bulk</p>
              `;
            } else if (rowLabel.includes('Varifocal') || rowLabel.includes('Progressive')) {
              cell.innerHTML = `
                <div class="flex items-center gap-1.5 text-mpesa-green font-bold">
                  <span class="material-symbols-outlined text-[18px]">verified</span>
                  <span class="font-label-md text-label-md">100% Certified</span>
                </div>
                <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Accommodates digital progression corridor</p>
              `;
            } else if (rowLabel.includes('Ultra-Thin 1.74')) {
              cell.innerHTML = `
                <span class="font-body-md text-body-md text-on-surface font-bold text-mpesa-green">Fully Supported</span>
                <p class="font-body-sm text-body-sm text-outline">Standard V-bevel optical edging</p>
              `;
            } else if (rowLabel.includes('Complete Lens Package')) {
              cell.innerHTML = `
                <span class="font-data-metric text-data-metric text-primary">KSh ${Number(frame.price + 3500).toLocaleString('en-KE')}</span>
                <span class="font-body-sm text-body-sm text-outline block">STK Prompt: Buy Goods 889211</span>
              `;
            } else if (rowLabel.includes('Chassis Only')) {
              cell.innerHTML = `
                <span class="font-title-md text-title-md text-on-surface">KSh ${Number(frame.price).toLocaleString('en-KE')}</span>
              `;
            } else if (rowLabel.includes('EyeKart Circle VIP')) {
              const vipPrice = Math.round(frame.price * 0.8);
              const savings = Math.round(frame.price * 0.2);
              cell.innerHTML = `
                <span class="font-data-metric text-data-metric text-secondary font-bold">KSh ${Number(vipPrice).toLocaleString('en-KE')}</span>
                <span class="text-xs text-mpesa-green font-bold block">Save KSh ${Number(savings).toLocaleString('en-KE')}</span>
              `;
            } else if (rowLabel.includes('Fulfillment Timetable')) {
              cell.innerHTML = `
                <div class="flex items-center gap-1 text-mpesa-green font-bold">
                  <span class="material-symbols-outlined text-[16px]">electric_moped</span>
                  <span class="font-label-md text-label-md">Same-Day Dispatch</span>
                </div>
                <p class="font-body-sm text-body-sm text-on-surface-variant">Nairobi Metropolitan Express Courier</p>
              `;
            }
          });
        } else {
          // Empty slot for this column
          if (headerCol) {
            headerCol.innerHTML = `
              <div class="h-full flex flex-col items-center justify-center p-6 text-center bg-surface-cream/40 rounded-lg">
                <span class="material-symbols-outlined text-outline text-[32px] mb-2">add_circle_outline</span>
                <span class="font-label-md text-label-md text-on-surface font-bold mb-1">Empty Slot</span>
                <span class="font-body-sm text-body-sm text-outline mb-3">Add alternative frame to compare fit &amp; metrics</span>
                <a href="${global.EyeKartRouter ? global.EyeKartRouter.resolveTarget('catalog') : '#'}" data-path="catalog" class="px-3 py-1.5 bg-primary text-on-primary font-label-sm text-label-sm rounded hover:bg-graphite transition-colors">Select Frame +</a>
              </div>
            `;
          }
          document.querySelectorAll('.matrix-row').forEach(row => {
            const cell = row.querySelector(`.${colClass}`);
            if (cell) {
              cell.innerHTML = '<span class="font-body-sm text-outline">—</span>';
            }
          });
        }
      }
    }

    // Connect window.removeSku
    window.removeSku = function(colClass) {
      const match = colClass.match(/sku-col-([1-3])/);
      if (match && global.EyeKartStore) {
        const slotIdx = parseInt(match[1], 10) - 1;
        const comp = global.EyeKartStore.getComparison ? global.EyeKartStore.getComparison() : (global.EyeKartStore.state.comparison || []);
        if (comp[slotIdx]) {
          global.EyeKartStore.removeFromCompare(comp[slotIdx]);
        }
      }
    };

    // Connect Reset button to clear comparison tray
    const resetBtn = Array.from(document.querySelectorAll('button')).find(b => b.title === 'Clear selection' || b.textContent.includes('Reset'));
    if (resetBtn && !resetBtn.__eyekart_reset_bound) {
      resetBtn.__eyekart_reset_bound = true;
      resetBtn.onclick = null; // Clear inline onclick
      resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm('Clear current optical selection?')) {
          if (global.EyeKartStore) global.EyeKartStore.clearCompare();
        }
      });
    }

    // Connect "Add 4th Frame +" button
    const add4thBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add 4th Frame'));
    if (add4thBtn && !add4thBtn.__eyekart_bound) {
      add4thBtn.__eyekart_bound = true;
      add4thBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (global.EyeKartRouter) global.EyeKartRouter.navigate('catalog');
      });
    }

    // Subscribe to store comparison updates
    if (global.EyeKartStore) {
      global.EyeKartStore.subscribe('comparison', renderComparisonMatrix);
    }

    // Run initial render
    renderComparisonMatrix();

    if (btnDiff && !btnDiff.__eyekart_bound) {
      btnDiff.__eyekart_bound = true;
      btnDiff.addEventListener('click', () => {
        btnDiff.classList.add('bg-primary', 'text-on-primary');
        btnDiff.classList.remove('bg-surface-cream', 'text-on-surface');
        if (btnAll) {
          btnAll.classList.remove('bg-primary', 'text-on-primary');
          btnAll.classList.add('bg-surface-cream', 'text-on-surface');
        }

        rows.forEach(row => {
          const cells = Array.from(row.querySelectorAll('.sku-col-1, .sku-col-2, .sku-col-3')).map(c => c.textContent.trim());
          if (cells.length > 1) {
            const isIdentical = cells.every(v => v === cells[0]);
            if (isIdentical) {
              row.classList.add('opacity-30');
            } else {
              row.classList.add('bg-cyan-accent/10');
            }
          }
        });
      });
    }

    if (btnAll && !btnAll.__eyekart_bound) {
      btnAll.__eyekart_bound = true;
      btnAll.addEventListener('click', () => {
        btnAll.classList.add('bg-primary', 'text-on-primary');
        btnAll.classList.remove('bg-surface-cream', 'text-on-surface');
        if (btnDiff) {
          btnDiff.classList.remove('bg-primary', 'text-on-primary');
          btnDiff.classList.add('bg-surface-cream', 'text-on-surface');
        }

        rows.forEach(row => {
          row.classList.remove('opacity-30', 'bg-cyan-accent/10');
        });
      });
    }

    const shareBtn = document.getElementById('btn-share-blueprint') || document.querySelector('[data-action="share-blueprint"]');
    if (shareBtn && !shareBtn.__eyekart_bound) {
      shareBtn.__eyekart_bound = true;
      shareBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = encodeURIComponent(window.location.href);
        window.open(`https://wa.me/?text=Compare%20EyeKart%20Optical%20Specs%3A%20${url}`, '_blank');
      });
    }
  }

  // --- Spatial Master Caustic Loop ---
  function bootstrapSpatialMaster() {
    const canvas = document.getElementById('ambient-caustic-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;
    function renderCaustics() {
      time += 0.02;
      canvas.width = canvas.parentElement?.clientWidth || 800;
      canvas.height = canvas.parentElement?.clientHeight || 600;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(6, 182, 212, 0.03)';

      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        const x = canvas.width / 2 + Math.sin(time + i) * 150;
        const y = canvas.height / 2 + Math.cos(time * 0.8 + i) * 100;
        const r = 80 + Math.sin(time * 1.2 + i) * 40;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(renderCaustics);
    }
    renderCaustics();
  }

  // --- Clinical Examination Report Bootstrap (Phase 5.1) ---
  function bootstrapClinicalReport() {
    const store = global.EyeKartStore;
    const router = global.EyeKartRouter;
    const params = (typeof window !== 'undefined' && window.location && window.location.search) 
      ? new URLSearchParams(window.location.search) 
      : new URLSearchParams();
    
    const orderId = params.get('orderId') || params.get('reviewOrder');
    let activeOrder = null;
    if (store) {
      if (orderId) {
        activeOrder = store.getOrder(orderId);
      } else {
        const pending = store.getPendingReviewOrders();
        if (pending.length > 0) activeOrder = pending[0];
      }
    }

    // 1. Interactive Diopter Transpose (+/- Cylinder) Toggle
    const toggleBtn = document.getElementById('toggle-units');
    if (toggleBtn && !toggleBtn.__eyekart_bound) {
      toggleBtn.__eyekart_bound = true;
      let isTransposed = false;

      function transposeRx(sphVal, cylVal, axisVal) {
        const sph = parseFloat(sphVal) || 0;
        const cyl = parseFloat(cylVal) || 0;
        const axis = parseInt(String(axisVal).replace(/[^0-9]/g, ''), 10) || 0;

        const newSph = (sph + cyl).toFixed(2);
        const newCyl = (-cyl).toFixed(2);
        let newAxis = (axis + 90) % 180;
        if (newAxis === 0) newAxis = 180;

        const sphStr = (parseFloat(newSph) > 0 ? '+' : '') + newSph;
        const cylStr = (parseFloat(newCyl) > 0 ? '+' : '') + newCyl;
        const axisStr = String(newAxis).padStart(3, '0') + '°';
        return { sph: sphStr, cyl: cylStr, axis: axisStr };
      }

      const tbody = document.querySelector('table tbody');
      if (tbody) {
        const rows = tbody.querySelectorAll('tr');
        if (rows.length >= 2) {
          const odCells = rows[0].querySelectorAll('td');
          const osCells = rows[1].querySelectorAll('td');
          const baseOD = { sph: odCells[1]?.textContent.trim(), cyl: odCells[2]?.textContent.trim(), axis: odCells[3]?.textContent.trim() };
          const baseOS = { sph: osCells[1]?.textContent.trim(), cyl: osCells[2]?.textContent.trim(), axis: osCells[3]?.textContent.trim() };

          toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            isTransposed = !isTransposed;
            if (isTransposed) {
              const tOD = transposeRx(baseOD.sph, baseOD.cyl, baseOD.axis);
              const tOS = transposeRx(baseOS.sph, baseOS.cyl, baseOS.axis);
              if (odCells[1]) odCells[1].textContent = tOD.sph;
              if (odCells[2]) odCells[2].textContent = tOD.cyl;
              if (odCells[3]) odCells[3].textContent = tOD.axis;
              if (osCells[1]) osCells[1].textContent = tOS.sph;
              if (osCells[2]) osCells[2].textContent = tOS.cyl;
              if (osCells[3]) osCells[3].textContent = tOS.axis;
              toggleBtn.textContent = 'Active: Plus Cylinder Format (+)';
              toggleBtn.classList.add('bg-primary', 'text-optical-white');
              if (store) store.showToast('Diopter matrix transposed to Plus Cylinder format', 'swap_horiz');
            } else {
              if (odCells[1]) odCells[1].textContent = baseOD.sph;
              if (odCells[2]) odCells[2].textContent = baseOD.cyl;
              if (odCells[3]) odCells[3].textContent = baseOD.axis;
              if (osCells[1]) osCells[1].textContent = baseOS.sph;
              if (osCells[2]) osCells[2].textContent = baseOS.cyl;
              if (osCells[3]) osCells[3].textContent = baseOS.axis;
              toggleBtn.textContent = 'Toggle SPH / CYL Transpose (+/-)';
              toggleBtn.classList.remove('bg-primary', 'text-optical-white');
              if (store) store.showToast('Diopter matrix restored to Minus Cylinder format', 'swap_horiz');
            }
          });
        }
      }
    }

    // 2. Configure Lenses with This Rx
    const configBtn = Array.from(document.querySelectorAll('button')).find(b => 
      b.textContent && b.textContent.includes('Configure Lenses with This Rx')
    );
    if (configBtn && !configBtn.__eyekart_bound) {
      configBtn.__eyekart_bound = true;
      configBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (store) {
          store.setPrescription({
            od: { sph: '-4.25', cyl: '-0.75', axis: '095', add: '+0.75' },
            os: { sph: '-3.75', cyl: '-0.50', axis: '085', add: '+0.75' },
            pd: '63.5',
            verified: true,
            verificationStatus: 'OPTOMETRIST_VERIFIED',
            reviewedBy: 'Dr. Kevin Omondi, MCOptom • OCK #0512',
            reportId: '#OCK-EK-94820-2024'
          });
          store.showToast('Official Clinical Rx loaded into Precision Lens Configurator', 'tune');
        }
        if (router) {
          router.navigate('lens-customizer');
        }
      });
    }

    // 3. Download Signed PDF Dossier
    const pdfBtn = Array.from(document.querySelectorAll('button')).find(b => 
      b.textContent && b.textContent.includes('Download Signed PDF Dossier')
    );
    if (pdfBtn && !pdfBtn.__eyekart_bound) {
      pdfBtn.__eyekart_bound = true;
      pdfBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (store) {
          store.showToast('Official Signed Clinical Dossier (PDF) generated (2.4 MB)', 'download_done');
        }
      });
    }

    // 4. Sync to Aga Khan / MOH E-Record
    const syncBtn = Array.from(document.querySelectorAll('button')).find(b => 
      b.textContent && b.textContent.includes('Sync to Aga Khan')
    );
    if (syncBtn && !syncBtn.__eyekart_bound) {
      syncBtn.__eyekart_bound = true;
      syncBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (store) {
          store.showToast('Clinical Dossier synced to Aga Khan Hospital & MOH Registry (#MOH-NRB-7721-OP)', 'cloud_sync');
        }
      });
    }

    // 5. Select with Rx frame buttons
    document.querySelectorAll('a').forEach(link => {
      if (link.textContent && link.textContent.includes('Select with Rx') && !link.__eyekart_bound) {
        link.__eyekart_bound = true;
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const card = link.closest('.p-space-md');
          const is804 = card && card.textContent.includes('EK-804');
          const targetSku = is804 ? 'EK-804' : 'EK-902';
          if (store) store.setSelectedSku(targetSku);
          if (router) router.navigate('lens-customizer', `sku=${targetSku}`);
        });
      }
    });

    // 6. Dynamic Clinical Status & Optometrist Review Actions
    if (activeOrder) {
      // Update patient info if custom
      if (activeOrder.customer && activeOrder.customer.name) {
        const pName = document.querySelector('.font-title-md.text-primary.font-semibold.block.mt-0\\.5');
        if (pName && pName.textContent.includes('Wanjiku')) {
          pName.textContent = activeOrder.customer.name;
        }
      }

      // Update Clinical Status badge
      const statusBlock = document.querySelectorAll('.grid-cols-2.sm\\:grid-cols-4 > div')[3];
      if (statusBlock) {
        const badge = statusBlock.querySelector('.font-label-md');
        if (badge) {
          const pStatus = activeOrder.prescriptionStatus || (activeOrder.status === 'PRESCRIPTION_REVIEW' ? 'PENDING_OPTOMETRIST_REVIEW' : 'APPROVED');
          if (pStatus === 'PENDING_OPTOMETRIST_REVIEW' || activeOrder.status === 'PRESCRIPTION_REVIEW') {
            badge.className = 'inline-flex items-center gap-1 font-label-md text-label-md text-amber-800 bg-amber-500/15 px-2 py-0.5 rounded font-semibold mt-1';
            badge.innerHTML = '<span class="material-symbols-outlined text-[16px]">hourglass_top</span> Pending Optometrist Review';
          } else if (pStatus === 'REJECTED' || activeOrder.status === 'PRESCRIPTION_REJECTED') {
            badge.className = 'inline-flex items-center gap-1 font-label-md text-label-md text-error bg-error/15 px-2 py-0.5 rounded font-semibold mt-1';
            badge.innerHTML = '<span class="material-symbols-outlined text-[16px]">cancel</span> Prescription Declined';
          } else if (pStatus === 'CLARIFICATION_REQUESTED' || activeOrder.status === 'CLARIFICATION_REQUESTED') {
            badge.className = 'inline-flex items-center gap-1 font-label-md text-label-md text-cyan-800 bg-cyan-700/15 px-2 py-0.5 rounded font-semibold mt-1';
            badge.innerHTML = '<span class="material-symbols-outlined text-[16px]">help_outline</span> Clarification Requested';
          } else {
            badge.className = 'inline-flex items-center gap-1 font-label-md text-label-md text-mpesa-green font-semibold mt-1';
            badge.innerHTML = '<span class="material-symbols-outlined text-[16px]">check_circle</span> Approved for Surfacing';
          }
        }
      }

      // If order is pending review, inject Optometrist Review Controls in Quick Command Actions sidebar
      if (activeOrder.prescriptionStatus === 'PENDING_OPTOMETRIST_REVIEW' || activeOrder.status === 'PRESCRIPTION_REVIEW') {
        const actionBox = document.querySelector('.lg\\:col-span-4.flex.flex-col');
        if (actionBox && !document.getElementById('optometrist-review-controls')) {
          const ctrlDiv = document.createElement('div');
          ctrlDiv.id = 'optometrist-review-controls';
          ctrlDiv.className = 'mt-3 pt-3 border-t border-border-hairline flex flex-col gap-2 bg-surface-cream/50 p-3 rounded';
          ctrlDiv.innerHTML = `
            <div class="flex items-center justify-between">
              <span class="font-label-sm text-[11px] uppercase tracking-wider text-secondary font-bold">Attending Optometrist Actions</span>
              <span class="text-[10px] text-on-surface-variant font-mono">Order #${activeOrder.orderId}</span>
            </div>
            <p class="font-body-sm text-[11px] text-on-surface-variant">Reviewing customer prescription for Free-Form German CNC lens edging clearance.</p>
            <button id="btn-optometrist-approve" class="w-full px-3 py-2 rounded bg-mpesa-green text-optical-white font-label-sm text-label-sm font-semibold flex items-center justify-center gap-1.5 hover:brightness-105 transition-all shadow-sm">
              <span class="material-symbols-outlined text-[16px]">verified</span>
              Approve Prescription for Surfacing
            </button>
            <div class="grid grid-cols-2 gap-2">
              <button id="btn-optometrist-clarify" class="px-2 py-1.5 rounded bg-optical-white text-cyan-800 border border-cyan-700/30 font-label-sm text-[11px] font-semibold flex items-center justify-center gap-1 hover:bg-cyan-50 transition-all">
                <span class="material-symbols-outlined text-[14px]">help_outline</span> Clarify
              </button>
              <button id="btn-optometrist-reject" class="px-2 py-1.5 rounded bg-optical-white text-error border border-error/30 font-label-sm text-[11px] font-semibold flex items-center justify-center gap-1 hover:bg-error/10 transition-all">
                <span class="material-symbols-outlined text-[14px]">cancel</span> Decline
              </button>
            </div>
          `;
          actionBox.appendChild(ctrlDiv);

          ctrlDiv.querySelector('#btn-optometrist-approve')?.addEventListener('click', () => {
            store.reviewPrescription(activeOrder.orderId, 'APPROVE');
            bootstrapClinicalReport();
          });
          ctrlDiv.querySelector('#btn-optometrist-clarify')?.addEventListener('click', () => {
            store.reviewPrescription(activeOrder.orderId, 'REQUEST_CLARIFICATION', { notes: 'Please verify if right eye axis is 95° or 175° and confirm monocular PD.' });
            bootstrapClinicalReport();
          });
          ctrlDiv.querySelector('#btn-optometrist-reject')?.addEventListener('click', () => {
            store.reviewPrescription(activeOrder.orderId, 'REJECT', { reason: 'Prescription diopters out of range for selected frame bevel profile.' });
            bootstrapClinicalReport();
          });
        }
      }
    }
  }

  // --- Global Search Input Binding ---
  function bindGlobalSearch(dom) {
    dom = dom || {};
    const searchInputs = document.querySelectorAll(dom.searchInputs || 'input[placeholder*="Search" i]');
    searchInputs.forEach(input => {
      if (input.__eyekart_bound) return;
      input.__eyekart_bound = true;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const query = input.value.trim();
          if (query && global.EyeKartRouter) {
            global.EyeKartRouter.navigate('catalog', `q=${encodeURIComponent(query)}`);
          }
        }
      });
    });

    const finderBtns = Array.from(document.querySelectorAll(dom.kshFinderBtns || 'button')).filter(btn => 
      btn.textContent && btn.textContent.includes('KSh Finder')
    );
    finderBtns.forEach(btn => {
      if (btn.__eyekart_bound) return;
      btn.__eyekart_bound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const parentInput = btn.parentElement?.querySelector('input');
        const query = parentInput ? parentInput.value.trim() : '';
        if (global.EyeKartRouter) {
          global.EyeKartRouter.navigate('catalog', query ? `q=${encodeURIComponent(query)}` : '');
        }
      });
    });
  }

  // Auto-run on DOM ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initEyeKartRuntime);
    } else {
      initEyeKartRuntime();
    }
  }

  global.EyeKartRuntime = {
    init: initEyeKartRuntime,
    version: '2.0.0'
  };

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
