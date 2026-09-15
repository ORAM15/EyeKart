/**
 * EyeKart Precision Lens Configurator & Prescription Engine
 * Manages OD/OS diopter matrices, refractive index, coatings, and real-time pair pricing.
 * Conforms to Protocol v1.1, Phase 2.0 Core Commerce State.
 */
(function (global) {
  'use strict';

  class LensConfiguratorEngine {
    constructor() {
      this.activeSku = 'EK-902';
      this.activeVariant = 'Standard';
      this.framePrice = 18500;
      this.selectedLensType = 'Digital Single Vision';
      this.lensBasePrice = 0;
      this.selectedIndex = '1.67';
      this.indexPrice = 8200;
      this.selectedCoatings = ['Crizal-Grade Hydrophobic Anti-Glare', 'BlueShield UV420 High-Energy Filter', 'Diamond Hard-Coat Scratch Armour'];
      this.coatingsPrice = 0;
      this.prescriptionMode = 'manual';
      this.verificationStatus = 'USER_ENTERED';
    }

    init() {
      console.info('[EyeKart Lens Engine] Initializing Lens Configurator...');
      const DOM = (global.EyeKartDOMMap && global.EyeKartDOMMap.lensConfigurator) || {};

      // 1. Resolve active SKU and variant from URL or store with fallback
      let hasUrlSku = false;
      let activeVariant = null;
      if (typeof window !== 'undefined' && window.location && window.location.search) {
        const params = new URLSearchParams(window.location.search);
        const urlSku = params.get('sku');
        if (urlSku) {
          this.activeSku = urlSku.replace(/[^A-Za-z0-9\-_]/g, '').trim() || 'EK-902';
          hasUrlSku = true;
        }
        const urlVariant = params.get('variant');
        if (urlVariant) {
          activeVariant = decodeURIComponent(urlVariant).trim();
        }
      }
      if (!hasUrlSku && global.EyeKartStore) {
        this.activeSku = global.EyeKartStore.getSelectedSku() || 'EK-902';
      }
      if (!activeVariant && global.EyeKartStore) {
        activeVariant = global.EyeKartStore.getActiveVariant();
      }

      const frame = global.CatalogService ? global.CatalogService.getBySku(this.activeSku) : null;
      if (frame) {
        this.framePrice = frame.price;
        if (!activeVariant && frame.variants && frame.variants.length > 0) {
          activeVariant = frame.variants[0].name;
        }
        if (global.EyeKartStore) {
          global.EyeKartStore.setSelectedSku(frame.sku);
        }
      }

      this.activeVariant = activeVariant || 'Standard';
      if (global.EyeKartStore) {
        global.EyeKartStore.setActiveVariant(this.activeVariant);
        this.prescriptionMode = global.EyeKartStore.getPrescriptionMode() || 'manual';
      }

      this._bindFrameSummary(frame);
      this._bindPrescriptionTabs(DOM);
      this._bindPrescriptionGrid(DOM);
      this._bindLensOptions(DOM);
      this._bindCoatings(DOM);
      this._bindUvSlider(DOM);
      this._bindSubmitCta(frame, DOM);
      this._updateIndexGuidance();
      this.updateTotal();
    }

    _bindFrameSummary(frame) {
      if (!frame) return;
      // Silhouette Confirmation card title
      const cardTitles = Array.from(document.querySelectorAll('span, h2, h3, h4')).filter(s => 
        s.textContent && (s.textContent.includes('Mara Round') || s.textContent.includes('EK-') || s.textContent.includes('The '))
      );
      cardTitles.forEach(el => {
        if (el.classList.contains('font-title-md') || (el.classList.contains('uppercase') && el.classList.contains('font-bold'))) {
          el.textContent = `${frame.sku} — ${frame.name}`;
        }
      });

      // Update frame subtitle / variant on Silhouette card
      const cardSubtitles = document.querySelectorAll('span.font-body-sm.text-body-sm.text-outline, .font-body-sm.text-on-surface-variant');
      cardSubtitles.forEach(el => {
        if (el.textContent.includes('Obsidian') || el.textContent.includes('Titanium Core') || el.textContent.includes('Japanese Acetate')) {
          el.textContent = `${this.activeVariant} • ${frame.material}`;
        }
      });

      // Bottom bar frame title
      const bottomBarTitle = document.querySelector('.fixed.bottom-0 .font-label-md.text-primary');
      if (bottomBarTitle) {
        bottomBarTitle.textContent = `${frame.sku} — ${frame.name}`;
      }

      // Update frame base price line in bottom bar
      const framePriceSpan = Array.from(document.querySelectorAll('.fixed.bottom-0 strong, .fixed.bottom-0 span')).find(s => 
        s.parentElement?.textContent?.includes('Frame:') || s.textContent.includes('14,800') || s.textContent.includes('13,800')
      );
      if (framePriceSpan) {
        framePriceSpan.textContent = global.CatalogService ? global.CatalogService.formatPriceKSh(frame.price) : `KSh ${Number(frame.price).toLocaleString('en-KE')}`;
      }

      // Update Base Frame display price on the Silhouette card
      const baseFrameLabel = Array.from(document.querySelectorAll('span, p')).find(el => 
        el.textContent.trim() === 'Base Frame' || el.textContent.includes('Frame Silhouette')
      );
      if (baseFrameLabel && baseFrameLabel.nextElementSibling) {
        baseFrameLabel.nextElementSibling.textContent = global.CatalogService ? global.CatalogService.formatPriceKSh(frame.price) : `KSh ${Number(frame.price).toLocaleString('en-KE')}`;
      }

      // Update thumbnail image
      const thumbImgs = document.querySelectorAll('img');
      thumbImgs.forEach(img => {
        if (img.src && (img.src.includes('A-A0OcWm8xlyml') || img.src.includes('AqBDCZmb2Whb'))) {
          if (frame.gallery && frame.gallery[0]) {
            img.src = frame.gallery[0];
            img.alt = `${frame.sku} ${frame.name}`;
          }
        }
      });
    }

    _bindPrescriptionTabs(dom) {
      const tabs = document.querySelectorAll(dom.prescriptionTabs || '.prescription-tab');
      tabs.forEach(tab => {
        if (tab.__eyekart_tab_bound) return;
        tab.__eyekart_tab_bound = true;
        tab.addEventListener('click', () => {
          const method = tab.getAttribute('data-method') || 'manual';
          this.prescriptionMode = method;

          if (this.selectedLensType === 'Digital Non-Rx Screen') {
            this.verificationStatus = 'PLANO_NO_RX';
          } else if (method === 'upload') {
            this.verificationStatus = 'PENDING_OPTOMETRIST_REVIEW';
          } else if (method === 'whatsapp') {
            this.verificationStatus = 'PENDING_SUBMISSION';
          } else {
            this.verificationStatus = 'USER_ENTERED';
          }

          if (global.EyeKartStore) {
            global.EyeKartStore.setPrescriptionMode(method);
            if (global.EyeKartStore.state.prescription) {
              global.EyeKartStore.state.prescription.verificationStatus = this.verificationStatus;
            }
          }
        });
      });
    }

    _bindPrescriptionGrid(dom) {
      // SPH / CYL transpose button
      const transposeBtns = document.querySelectorAll('#toggle-units, [data-action="transpose-rx"], button');
      transposeBtns.forEach(btn => {
        if (btn.textContent && (btn.textContent.includes('Transpose') || btn.textContent.includes('Transpose SPH / CYL') || btn.id === 'toggle-units')) {
          if (btn.__eyekart_bound) return;
          btn.__eyekart_bound = true;
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (global.EyeKartStore) {
              global.EyeKartStore.transposePrescription();
              this._syncInputsFromStore();
            }
          });
        }
      });

      // Listen to OD / OS selects and inputs
      const selects = document.querySelectorAll(dom.rxSelects || 'select');
      selects.forEach(sel => {
        if (sel.__eyekart_bound) return;
        sel.__eyekart_bound = true;
        sel.addEventListener('change', () => {
          this._saveInputsToStore();
        });
      });

      const numInputs = document.querySelectorAll(dom.rxInputs || 'input[type="number"]');
      numInputs.forEach(inp => {
        if (inp.__eyekart_bound) return;
        inp.__eyekart_bound = true;
        inp.addEventListener('input', () => {
          this._saveInputsToStore();
        });
      });
    }

    transpose() {
      if (global.EyeKartStore) {
        global.EyeKartStore.transposePrescription();
        this._syncInputsFromStore();
      }
    }

    _syncInputsFromStore() {
      if (!global.EyeKartStore) return;
      const rx = global.EyeKartStore.state.prescription;
      if (!rx) return;

      const setSelectValue = (sel, val) => {
        if (!sel || val === undefined) return;
        let opt = sel.querySelector(`option[value="${val}"]`);
        if (!opt) {
          opt = document.createElement('option');
          opt.value = val;
          opt.textContent = val;
          sel.appendChild(opt);
        }
        sel.value = val;
      };

      const selects = document.querySelectorAll('select');
      if (selects.length >= 6) {
        if (rx.od) {
          setSelectValue(selects[0], rx.od.sph);
          setSelectValue(selects[1], rx.od.cyl);
          setSelectValue(selects[2], rx.od.add);
        }
        if (rx.os) {
          setSelectValue(selects[3], rx.os.sph);
          setSelectValue(selects[4], rx.os.cyl);
          setSelectValue(selects[5], rx.os.add);
        }
      }

      const numInputs = document.querySelectorAll('input[type="number"]');
      if (numInputs.length >= 2) {
        if (rx.od && rx.od.axis) numInputs[0].value = parseInt(rx.od.axis, 10) || 95;
        if (rx.os && rx.os.axis) numInputs[1].value = parseInt(rx.os.axis, 10) || 85;
      }
    }

    _saveInputsToStore() {
      if (!global.EyeKartStore) return;
      const selects = document.querySelectorAll('select');
      const numInputs = document.querySelectorAll('input[type="number"]');

      const rx = {
        type: this.prescriptionMode || 'manual',
        od: {
          sph: selects[0] ? selects[0].value : '-2.00',
          cyl: selects[1] ? selects[1].value : '-0.50',
          axis: numInputs[0] ? numInputs[0].value : '95',
          add: selects[2] ? selects[2].value : '+1.25'
        },
        os: {
          sph: selects[3] ? selects[3].value : '-1.75',
          cyl: selects[4] ? selects[4].value : '-0.75',
          axis: numInputs[1] ? numInputs[1].value : '85',
          add: selects[5] ? selects[5].value : '+1.25'
        },
        pd: 63.5,
        verified: true,
        verificationStatus: this.verificationStatus
      };

      global.EyeKartStore.setPrescription(rx);
      this._updateIndexGuidance();
    }

    _updateIndexGuidance() {
      const selects = document.querySelectorAll('select');
      const odSph = Math.abs(parseFloat(selects[0]?.value) || 0);
      const osSph = Math.abs(parseFloat(selects[3]?.value) || 0);
      const maxSph = Math.max(odSph, osSph);

      let suggestedIndex = '1.50';
      let suggestedLabel = 'Suggested lens index: 1.50 / 1.56 (Standard)';
      let description = `Based on your diopter load (|SPH| ${maxSph.toFixed(2)}D), standard or thin profile lenses provide excellent visual clarity with minimal thickness.`;

      if (maxSph > 6.00) {
        suggestedIndex = '1.74';
        suggestedLabel = 'Suggested lens index: 1.74 (Ultra-Thin)';
        description = `Based on your high diopter load (|SPH| ${maxSph.toFixed(2)}D), 1.74 high-index lenses prevent unsightly lens edge protrusion and reduce optical weight by up to 45%.`;
      } else if (maxSph >= 4.25) {
        suggestedIndex = '1.67';
        suggestedLabel = 'Suggested lens index: 1.67 (Thin Profile)';
        description = `Based on your diopter load (|SPH| ${maxSph.toFixed(2)}D), 1.67 ultra-thin lenses ensure optical precision with slender lens margins.`;
      } else if (maxSph >= 2.25) {
        suggestedIndex = '1.61';
        suggestedLabel = 'Suggested lens index: 1.61 (Lightweight)';
        description = `Based on your diopter load (|SPH| ${maxSph.toFixed(2)}D), 1.61 index lenses offer a lightweight profile with enhanced impact resistance.`;
      }

      this.suggestedIndex = suggestedIndex;

      // Update recommendation badge in Step 4
      const badge = Array.from(document.querySelectorAll('span')).find(s => 
        s.textContent && (s.textContent.includes('Recommendation:') || s.textContent.includes('Suggested lens index:'))
      );
      if (badge) {
        badge.textContent = suggestedLabel;
      }

      // Update explanatory paragraph in Step 4
      const pDesc = Array.from(document.querySelectorAll('p')).find(p => 
        p.textContent && (p.textContent.includes('high-index lenses prevent unsightly') || p.textContent.includes('Based on your'))
      );
      if (pDesc) {
        pDesc.textContent = description;
      }
    }

    _bindLensOptions(dom) {
      // Vision Type radio options
      const visionInputs = document.querySelectorAll(dom.visionTypeRadios || 'input[name="vision_type"]');
      const visionPrices = {
        'single': 0,
        'single_distance': 0,
        'single_reading': 0,
        'digital_single': 0,
        'screen_zeropower': 1800,
        'anti_fatigue': 1800,
        'progressive': 8500
      };

      const visionTitles = {
        'single': 'Digital Single Vision',
        'digital_single': 'Digital Single Vision',
        'single_distance': 'Single Vision (Distance)',
        'single_reading': 'Single Vision (Near)',
        'screen_zeropower': 'Digital Non-Rx Screen',
        'progressive': 'Free-Form Progressive'
      };

      visionInputs.forEach(input => {
        if (input.checked) {
          this.lensBasePrice = visionPrices[input.value] !== undefined ? visionPrices[input.value] : 0;
          this.selectedLensType = visionTitles[input.value] || 'Digital Single Vision';
        }
        if (input.__eyekart_bound) return;
        input.__eyekart_bound = true;
        input.addEventListener('change', () => {
          this.lensBasePrice = visionPrices[input.value] !== undefined ? visionPrices[input.value] : 0;
          this.selectedLensType = visionTitles[input.value] || 'Digital Single Vision';
          if (input.value === 'screen_zeropower') {
            this.verificationStatus = 'PLANO_NO_RX';
          } else if (this.prescriptionMode === 'upload') {
            this.verificationStatus = 'PENDING_OPTOMETRIST_REVIEW';
          } else if (this.prescriptionMode === 'whatsapp') {
            this.verificationStatus = 'PENDING_SUBMISSION';
          } else {
            this.verificationStatus = 'USER_ENTERED';
          }
          this.updateTotal();
        });
      });

      // Lens Index radio options
      const indexInputs = document.querySelectorAll(dom.lensIndexRadios || 'input[name="lens_index"]');
      const indexPrices = {
        '1.50': 0,
        '1.56': 2500,
        '1.60': 5000,
        '1.61': 5000,
        '1.67': 8200,
        '1.74': 13000
      };

      indexInputs.forEach(input => {
        if (input.checked) {
          this.indexPrice = indexPrices[input.value] !== undefined ? indexPrices[input.value] : 8200;
          this.selectedIndex = input.value;
        }
        if (input.__eyekart_bound) return;
        input.__eyekart_bound = true;
        input.addEventListener('change', () => {
          this.indexPrice = indexPrices[input.value] !== undefined ? indexPrices[input.value] : 8200;
          this.selectedIndex = input.value;
          this.updateTotal();
        });
      });
    }

    _bindCoatings(dom) {
      const coatingCheckboxes = document.querySelectorAll('.space-y-3 input[type="checkbox"], input[type="checkbox"]');
      coatingCheckboxes.forEach(cb => {
        const label = cb.closest('label');
        if (!label || (!label.textContent.includes('Anti-Glare') && !label.textContent.includes('BlueShield') && !label.textContent.includes('Hard-Coat'))) return;

        if (cb.__eyekart_coating_bound) return;
        cb.__eyekart_coating_bound = true;
        cb.addEventListener('change', () => {
          this._syncCoatings();
          this.updateTotal();
        });
      });
      this._syncCoatings();
    }

    _syncCoatings() {
      const coatingLabels = Array.from(document.querySelectorAll('.space-y-3 label, label')).filter(lbl => 
        lbl.textContent.includes('Anti-Glare') || lbl.textContent.includes('BlueShield') || lbl.textContent.includes('Hard-Coat')
      );
      this.selectedCoatings = [];
      let extraCoatPrice = 0;
      coatingLabels.forEach(lbl => {
        const cb = lbl.querySelector('input[type="checkbox"]');
        if (cb && cb.checked) {
          const title = lbl.querySelector('.font-title-md')?.textContent?.trim() || 'Coating';
          this.selectedCoatings.push(title);
          if (lbl.textContent.includes('+ KSh')) {
            const match = lbl.textContent.match(/\+\s*KSh\s*([0-9,]+)/);
            if (match) {
              extraCoatPrice += parseInt(match[1].replace(/,/g, ''), 10);
            }
          }
        }
      });
      this.coatingsPrice = extraCoatPrice;
    }

    _bindUvSlider(dom) {
      const uvSlider = document.querySelector(dom.uvSlider || '#uv-range');
      const uvReadout = document.querySelector(dom.uvReadout || '#uv-slider-readout');
      const leftTint = document.querySelector(dom.leftTintOverlay || '#left-tint-overlay');
      const rightTint = document.querySelector(dom.rightTintOverlay || '#right-tint-overlay');

      if (uvSlider && !uvSlider.__eyekart_bound) {
        uvSlider.__eyekart_bound = true;
        uvSlider.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value) || 0;
          const opacity = Math.min(0.85, (val / 100) * 0.85);
          if (uvReadout) uvReadout.textContent = `${Math.round(350 + val * 0.7)}nm Active Shield`;
          if (leftTint) leftTint.style.opacity = opacity;
          if (rightTint) rightTint.style.opacity = opacity;
        });
      }
    }

    updateTotal() {
      const total = this.framePrice + this.lensBasePrice + this.indexPrice + this.coatingsPrice;
      
      // Update bottom bar breakdown
      const frameSpan = Array.from(document.querySelectorAll('.fixed.bottom-0 strong, .fixed.bottom-0 span')).find(s => 
        s.parentElement?.textContent?.includes('Frame:')
      );
      if (frameSpan) {
        frameSpan.textContent = `KSh ${Number(this.framePrice).toLocaleString('en-KE')}`;
      }

      const lensSpan = Array.from(document.querySelectorAll('.fixed.bottom-0 strong, .fixed.bottom-0 span')).find(s => 
        s.parentElement?.textContent?.includes('BlueShield:') || s.parentElement?.textContent?.includes('Index') || s.parentElement?.textContent?.includes('+')
      );
      if (lensSpan && lensSpan.parentElement?.textContent?.includes('+')) {
        const lensAddons = this.lensBasePrice + this.indexPrice + this.coatingsPrice;
        lensSpan.textContent = `KSh ${Number(lensAddons).toLocaleString('en-KE')}`;
      }

      // Update bottom bar total price and any price metric
      const totalEls = Array.from(document.querySelectorAll('.font-data-metric, .price-display, .font-headline-sm, .font-display-lg')).filter(el => 
        el.closest('.fixed, [class*="bottom-0"]') || el.classList.contains('font-display-lg')
      );
      totalEls.forEach(el => {
        if (el.textContent.includes('KSh') || el.classList.contains('font-data-metric') || el.classList.contains('text-headline-sm')) {
          el.textContent = `KSh ${Number(total).toLocaleString('en-KE')}`;
        }
      });

      // Update bottom bar subtitle
      const bottomBarSubtitle = document.querySelector('.fixed.bottom-0 .font-body-sm.text-xs.text-on-surface-variant');
      if (bottomBarSubtitle) {
        bottomBarSubtitle.textContent = `${this.selectedLensType} • ${this.selectedIndex} Index`;
      }

      return total;
    }

    _bindSubmitCta(frame, dom) {
      // Find bottom bar checkout CTA button specifically
      const ctaBtns = Array.from(document.querySelectorAll('.fixed.bottom-0 a[data-path="cart"], .fixed.bottom-0 a, a[data-path="cart"]')).filter(a => 
        a.textContent && (a.textContent.includes('Continue to Review') || a.textContent.includes('Checkout'))
      );

      ctaBtns.forEach(btn => {
        if (btn.__eyekart_lens_cta_bound) return;
        btn.__eyekart_lens_cta_bound = true;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();

          // Prescription Validation Rule:
          // If in manual mode, verify that any non-zero CYL has a valid AXIS (1-180)
          if (this.prescriptionMode === 'manual' && this.selectedLensType !== 'Digital Non-Rx Screen') {
            const selects = document.querySelectorAll('select');
            const numInputs = document.querySelectorAll('input[type="number"]');

            const odCyl = parseFloat(selects[1]?.value) || 0;
            const osCyl = parseFloat(selects[4]?.value) || 0;
            const odAxisRaw = numInputs[0]?.value ? String(numInputs[0].value).trim() : '';
            const osAxisRaw = numInputs[1]?.value ? String(numInputs[1].value).trim() : '';
            const odAxis = parseInt(odAxisRaw, 10);
            const osAxis = parseInt(osAxisRaw, 10);

            const odInvalid = (odCyl !== 0) && (!odAxisRaw || isNaN(odAxis) || odAxis < 1 || odAxis > 180);
            const osInvalid = (osCyl !== 0) && (!osAxisRaw || isNaN(osAxis) || osAxis < 1 || osAxis > 180);

            if (odInvalid || osInvalid) {
              const eyeName = (odInvalid && osInvalid) ? 'both eyes (OD & OS)' : (odInvalid ? 'Right Eye (OD)' : 'Left Eye (OS)');
              const warnMsg = `Prescription Validation Warning: Astigmatism (CYL) in ${eyeName} requires an AXIS angle between 1° and 180°.`;
              if (global.EyeKartStore && global.EyeKartStore.showToast) {
                global.EyeKartStore.showToast(warnMsg, 'warning');
              }
              if (odInvalid && numInputs[0]) {
                numInputs[0].classList.add('border-alert-clinical', 'ring-2', 'ring-alert-clinical');
                numInputs[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
                numInputs[0].focus();
              } else if (osInvalid && numInputs[1]) {
                numInputs[1].classList.add('border-alert-clinical', 'ring-2', 'ring-alert-clinical');
                numInputs[1].scrollIntoView({ behavior: 'smooth', block: 'center' });
                numInputs[1].focus();
              }
              return false;
            }
          }

          // Clear any previous validation highlights
          const numInputs = document.querySelectorAll('input[type="number"]');
          numInputs.forEach(i => i.classList.remove('border-alert-clinical', 'ring-2', 'ring-alert-clinical'));

          this._saveInputsToStore();
          const total = this.updateTotal();

          if (global.EyeKartStore) {
            const activeFrame = frame || global.CatalogService?.getBySku(this.activeSku);
            const lensConfigData = {
              lensType: this.selectedLensType,
              index: this.selectedIndex,
              coatings: this.selectedCoatings,
              lensPrice: this.lensBasePrice + this.indexPrice + this.coatingsPrice,
              prescriptionMode: this.prescriptionMode,
              verificationStatus: this.verificationStatus
            };
            global.EyeKartStore.setLensConfig(lensConfigData);

            const cartItem = {
              sku: activeFrame ? activeFrame.sku : this.activeSku,
              name: activeFrame ? activeFrame.name : 'Precision Optical Pair',
              variant: this.activeVariant || (activeFrame?.variants?.[0]?.name) || 'Standard',
              lensConfig: lensConfigData,
              framePrice: this.framePrice,
              totalPrice: total,
              qty: 1
            };

            global.EyeKartStore.addCartItem(cartItem);

            if (global.EyeKartRouter) {
              global.EyeKartRouter.navigate('cart');
            }
          }
        }, true);
      });
    }
  }

  const lensInstance = new LensConfiguratorEngine();
  global.EyeKartLensEngine = lensInstance;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
