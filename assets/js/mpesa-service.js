/**
 * EyeKart M-PESA Express & Courier Telemetry Service (DEMO / SIMULATION)
 * Simulates Safaricom STK Push, 1:42 countdown timer, receipt issuance, and motorbike courier tracking.
 * Conforms to Protocol v1.1, Phase 5.0 Core Commerce & Order Lifecycle (Strictly DEMO / SIMULATION).
 */
(function (global) {
  'use strict';

  class MPESAService {
    constructor() {
      this.isEditingPhone = false;
      this.countdownSeconds = 102;
      this.timerInterval = null;
      this.telemetryInterval = null;
      this.isDemoSimulation = true;
      this.paymentState = 'NOT_STARTED'; // NOT_STARTED, INITIATED, PENDING, SUCCESS, FAILED, CANCELLED, EXPIRED
      this.isProcessing = false;
      this.simulateFailure = false; // Test flag for payment rejection verification
      this.autoNavigate = true; // Set to false during tests to verify in-situ order snapshot
      this.lastCreatedOrder = null;
    }

    init() {
      console.info('[EyeKart MPESA] Initializing M-PESA Service (Classified: DEMO / SIMULATION)...');
      const DOM = (global.EyeKartDOMMap && global.EyeKartDOMMap.checkout) || {};

      this._bindDesktopCheckout(DOM);
      this._bindMobileStkPush();
      this._bindCourierTelemetry();
      this._bindKraInvoice();
      this._bindInsurancePreAuth();
      this._bindAlternativePayments();
      this.syncConfirmationOrderDetails();

      // Subscribe to reactive cart updates
      if (global.EyeKartStore) {
        global.EyeKartStore.subscribe('cart', () => {
          this._syncOrderSummary();
        });
        global.EyeKartStore.subscribe('orders', () => {
          this.syncConfirmationOrderDetails();
        });
      }
    }

    getPaymentState() {
      return this.paymentState;
    }

    setPaymentState(state) {
      this.paymentState = state;
      console.info(`[EyeKart MPESA] State transition: -> ${state}`);
    }

    // --- Desktop Checkout Flow ---
    _bindDesktopCheckout(dom) {
      const editBtn = document.querySelector(dom.toggleEditBtn || '#toggle-edit-btn');
      const phoneInput = document.querySelector(dom.mpesaNumber || '#mpesa-number');
      const triggerBtn = document.querySelector(dom.triggerStkBtn || '#trigger-stk-button');

      if (editBtn && phoneInput && !editBtn.__eyekart_bound) {
        editBtn.__eyekart_bound = true;
        editBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this.isEditingPhone = !this.isEditingPhone;
          if (this.isEditingPhone) {
            phoneInput.removeAttribute('readonly');
            phoneInput.focus();
            phoneInput.select();
            editBtn.innerHTML = '<span class="material-symbols-outlined text-[14px]">check</span> Save Number';
          } else {
            phoneInput.setAttribute('readonly', 'true');
            editBtn.innerHTML = '<span class="material-symbols-outlined text-[14px]">edit</span> Change Number';
          }
        });
      }

      if (triggerBtn && !triggerBtn.__eyekart_bound) {
        triggerBtn.__eyekart_bound = true;
        triggerBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const phone = phoneInput ? phoneInput.value.trim() : '+254 712 345 678';
          this.triggerStkPush(phone);
        });
      }

      // Sync Order Summary from Cart
      this._syncOrderSummary();
    }

    _syncOrderSummary() {
      if (!global.EyeKartStore) return;
      const cart = global.EyeKartStore.state.cart;
      if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) return;

      const primaryItem = cart.items[cart.items.length - 1]; // Most recent item
      const frameData = global.CatalogService?.getBySku(primaryItem.sku);

      // 1. Update Preview Image
      const previewImg = document.querySelector('[class*="col-span-5"] img');
      if (previewImg && frameData && frameData.gallery && frameData.gallery[0]) {
        previewImg.src = frameData.gallery[0];
      }

      // 2. Update Frame Title & SKU & Variant
      const titleEl = document.querySelector('[class*="col-span-5"] h4');
      if (titleEl) {
        const variantSuffix = primaryItem.variant && primaryItem.variant !== 'Standard' ? ` • ${primaryItem.variant}` : '';
        titleEl.textContent = `${primaryItem.name} (${primaryItem.sku})${variantSuffix}`;
      }

      // 3. Update Frame Price
      const framePriceLine = Array.from(document.querySelectorAll('[class*="col-span-5"] span')).find(el => 
        el.textContent.includes('KSh 18,500') || (el.previousElementSibling && el.previousElementSibling.textContent.includes('Frame Silhouette'))
      );
      if (framePriceLine) {
        framePriceLine.textContent = global.CatalogService ? global.CatalogService.formatPriceKSh(primaryItem.framePrice) : `KSh ${Number(primaryItem.framePrice).toLocaleString('en-KE')}`;
      }

      // 4. Update Lens Config Title & Price
      const rightCol = document.querySelector('[class*="col-span-5"]');
      const lensTitleEl = rightCol ? Array.from(rightCol.querySelectorAll('span')).find(el => 
        el.textContent && (el.textContent.includes('Index') || el.textContent.includes('Vision') || el.textContent.includes('Aspheric') || el.textContent.includes('Lenses'))
      ) : null;
      if (primaryItem.lensConfig) {
        if (lensTitleEl) {
          lensTitleEl.textContent = `${primaryItem.lensConfig.lensType || 'Precision Lenses'} (Index ${primaryItem.lensConfig.index || '1.67'})`;
        }
        const lensRow = lensTitleEl ? (lensTitleEl.closest('.flex.items-start.justify-between') || lensTitleEl.parentElement?.parentElement) : null;
        const lensPriceEl = lensRow ? lensRow.querySelector('.font-label-md') : null;
        if (lensPriceEl && primaryItem.lensConfig.lensPrice !== undefined) {
          lensPriceEl.textContent = global.CatalogService ? global.CatalogService.formatPriceKSh(primaryItem.lensConfig.lensPrice) : `KSh ${Number(primaryItem.lensConfig.lensPrice).toLocaleString('en-KE')}`;
        }
      } else {
        if (lensTitleEl) {
          lensTitleEl.textContent = `Standard Demo Lenses (Non-Prescription)`;
        }
        const lensRow = lensTitleEl ? (lensTitleEl.closest('.flex.items-start.justify-between') || lensTitleEl.parentElement?.parentElement) : null;
        const lensPriceEl = lensRow ? lensRow.querySelector('.font-label-md') : null;
        if (lensPriceEl) {
          lensPriceEl.textContent = `KSh 0 (Included)`;
        }
      }

      // 5. Update Subtotal & Total
      const subtotalEls = Array.from(document.querySelectorAll('[class*="col-span-5"] span')).filter(el => 
        el.textContent.includes('KSh 26,700') || (el.previousElementSibling && el.previousElementSibling.textContent.includes('Subtotal'))
      );
      subtotalEls.forEach(el => {
        el.textContent = global.CatalogService ? global.CatalogService.formatPriceKSh(cart.subtotal) : `KSh ${Number(cart.subtotal).toLocaleString('en-KE')}`;
      });

      const totalEls = document.querySelectorAll('[class*="col-span-5"] .font-display-lg, .checkout-total-amount, [data-checkout-total]');
      totalEls.forEach(el => {
        el.textContent = global.CatalogService ? global.CatalogService.formatPriceKSh(cart.total) : `KSh ${Number(cart.total).toLocaleString('en-KE')}`;
      });

      // Update VAT component display for transparency (VAT-inclusive pricing)
      const vatFormatted = global.CatalogService ? global.CatalogService.formatPriceKSh(cart.vat) : `KSh ${Number(cart.vat).toLocaleString('en-KE')}`;
      const vatEls = Array.from(document.querySelectorAll('[class*="col-span-5"] span')).filter(el =>
        el.textContent && (el.textContent.includes('VAT') || el.textContent.includes('KRA ETR Compliant'))
      );
      vatEls.forEach(el => {
        el.textContent = `VAT included (16%): ${vatFormatted} (KRA ETR Compliant)`;
      });

      // Update Left Column Authorization Amount
      const authAmountEls = document.querySelectorAll('[class*="col-span-7"] .font-data-metric, .auth-amount-val');
      authAmountEls.forEach(el => {
        if (!el.matches('input')) {
          el.textContent = global.CatalogService ? global.CatalogService.formatPriceKSh(cart.total) : `KSh ${Number(cart.total).toLocaleString('en-KE')}`;
        }
      });

      // 6. Update Button Label with dynamic total
      const buttonLabel = document.getElementById('button-label');
      if (buttonLabel && this.paymentState === 'NOT_STARTED') {
        const totalStr = global.CatalogService ? global.CatalogService.formatPriceKSh(cart.total) : `KSh ${Number(cart.total).toLocaleString('en-KE')}`;
        buttonLabel.textContent = `Trigger M-PESA STK Push (${totalStr})`;
      }
    }

    triggerStkPush(phone) {
      if (this.isProcessing) {
        console.warn('[EyeKart MPESA] Double-trigger ignored: payment handshake already in progress.');
        return false;
      }

      this.isProcessing = true;
      this.setPaymentState('INITIATED');

      const triggerBtn = document.getElementById('trigger-stk-button');
      const buttonLabel = document.getElementById('button-label');
      const simulatorStatus = document.getElementById('simulator-status');
      const promptText = document.getElementById('stk-prompt-text');
      const cart = global.EyeKartStore ? global.EyeKartStore.state.cart : null;
      const total = cart?.total || 23200;
      const totalStr = global.CatalogService ? global.CatalogService.formatPriceKSh(total) : `KSh ${Number(total).toLocaleString('en-KE')}`;

      // Update button to processing state
      if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.classList.add('opacity-75', 'cursor-not-allowed');
      }
      if (buttonLabel) {
        buttonLabel.textContent = 'Connecting to Safaricom Daraja Gateway...';
      }
      if (simulatorStatus) {
        simulatorStatus.textContent = 'STK Request Transmitted';
        simulatorStatus.className = 'font-label-sm text-[11px] text-mpesa-green font-bold uppercase';
      }
      if (promptText) {
        promptText.innerHTML = `<span class="text-mpesa-green">Pinging Handset (${phone})...</span> Please enter your 4-digit M-PESA PIN.`;
      }

      if (global.EyeKartStore) {
        global.EyeKartStore.showToast(`[DEMO SIMULATION] STK Push prompt sent to ${phone}. Authorize ${totalStr} on Safaricom SIM Toolkit.`, 'payments');
      }

      // Step 2: Transition to PENDING
      setTimeout(() => {
        this.setPaymentState('PENDING');
        if (buttonLabel) {
          buttonLabel.textContent = `Waiting for PIN Entry on ${phone}...`;
        }
        if (simulatorStatus) {
          simulatorStatus.textContent = 'Awaiting PIN Verification (0:14)';
        }

        // Step 3: Check failure simulation condition
        const isFailureTest = this.simulateFailure || (typeof phone === 'string' && (phone.endsWith('999') || phone === '0700000000'));

        setTimeout(() => {
          if (isFailureTest) {
            // PAYMENT REJECTED / FAILED FLOW: Cart preserved, no order created
            this.setPaymentState('FAILED');
            this.isProcessing = false;

            if (triggerBtn) {
              triggerBtn.disabled = false;
              triggerBtn.classList.remove('opacity-75', 'cursor-not-allowed');
            }
            if (buttonLabel) {
              buttonLabel.textContent = `Retry M-PESA STK Push (${totalStr})`;
            }
            if (simulatorStatus) {
              simulatorStatus.textContent = 'Payment Failed: Transaction Cancelled';
              simulatorStatus.className = 'font-label-sm text-[11px] text-error font-bold uppercase';
            }
            if (promptText) {
              promptText.innerHTML = `<span class="text-error font-semibold">Payment cancelled or PIN timeout.</span> Your cart has been safely preserved. Please retry or choose an alternative payment channel.`;
            }
            if (global.EyeKartStore) {
              global.EyeKartStore.showToast('[DEMO SIMULATION] M-PESA payment cancelled. Cart items preserved.', 'cancel');
            }
          } else {
            // PAYMENT SUCCESS FLOW: Order snapshot created
            this.setPaymentState('SUCCESS');
            if (buttonLabel) {
              buttonLabel.textContent = 'Payment Received • Directing to Live Dispatch...';
            }
            if (simulatorStatus) {
              simulatorStatus.textContent = 'M-PESA Ref Confirmed';
              simulatorStatus.className = 'font-label-sm text-[11px] text-mpesa-green font-bold uppercase';
            }
            if (promptText) {
              promptText.innerHTML = `<span class="text-secondary-fixed">${totalStr} paid to EyeKart Optical Ltd.</span> Verification token generated.`;
            }

            this._completePaymentDemo(phone);
          }
        }, 700);
      }, 500);

      return true;
    }

    _completePaymentDemo(phone) {
      if (global.EyeKartStore) {
        const order = global.EyeKartStore.placeOrder({
          paymentMethod: 'M-PESA Express STK (Demo)',
          userPhone: phone
        });
        this.lastCreatedOrder = order;
        global.EyeKartStore.showToast(`[DEMO] M-PESA Receipt ${order.mpesaReceipt} Verified! Order #${order.orderId} Created.`, 'verified');

        if (this.autoNavigate !== false) {
          setTimeout(() => {
            this.isProcessing = false;
            if (window.innerWidth < 768) {
              if (global.EyeKartRouter) global.EyeKartRouter.navigate('mobile-checkout');
            } else {
              if (global.EyeKartRouter) global.EyeKartRouter.navigate('courier-dispatch');
            }
          }, 1200);
        } else {
          this.isProcessing = false;
        }
      }
    }

    // --- Dynamic Order Confirmation & Courier Dispatch Hydration ---
    syncConfirmationOrderDetails() {
      if (!global.EyeKartStore) return;
      const order = global.EyeKartStore.state.orders && global.EyeKartStore.state.orders[0];
      if (!order) return;

      const totalFormatted = global.CatalogService ? global.CatalogService.formatPriceKSh(order.total) : `KSh ${Number(order.total).toLocaleString('en-KE')}`;
      const primary = order.items && order.items[0] ? order.items[0] : null;

      // 1. Hydrate Receipt Displays
      document.querySelectorAll('strong, span, p').forEach(el => {
        if (el.textContent && (el.textContent === 'QHK92837L1' || el.textContent === 'QKL902814MP' || el.textContent.includes('Receipt No: QHK') || el.textContent.includes('Receipt #QKL'))) {
          el.textContent = el.textContent.replace(/QHK92837L1|QKL902814MP/, order.mpesaReceipt);
        }
      });

      // 2. Hydrate Order ID Displays
      document.querySelectorAll('h2, p, span').forEach(el => {
        if (el.textContent && (el.textContent.includes('#EK-78420-NB') || el.textContent.includes('EK-NRB-1904'))) {
          el.textContent = el.textContent.replace(/#EK-78420-NB|EK-NRB-1904/g, '#' + order.orderId);
        }
      });

      // 3. Hydrate Total / Amount Paid Displays
      const amountPaidEls = document.querySelectorAll('.text-mpesa-green, .font-data-metric, .font-headline-sm');
      amountPaidEls.forEach(el => {
        if (el.textContent && (el.textContent.includes('KSh 23,000') || el.textContent.includes('KSh 23,200.00') || el.textContent.includes('KSh 23,200'))) {
          el.textContent = totalFormatted;
        }
      });

      // 4. Hydrate Recipient & Destination
      if (order.customer && order.customer.name) {
        document.querySelectorAll('h4, p').forEach(el => {
          if (el.textContent && el.textContent.includes('Wanjiku Muthoni')) {
            el.textContent = el.textContent.replace(/Wanjiku Muthoni/g, order.customer.name);
          }
        });
      }

      // 5. Hydrate Primary Item Name & Details
      if (primary) {
        const itemTitleEls = document.querySelectorAll('h3');
        itemTitleEls.forEach(el => {
          if (el.textContent && (el.textContent.includes('Kibera Minimalist') || el.textContent.includes('EK-902'))) {
            el.textContent = `${primary.name} (${primary.sku})`;
          }
        });

        const itemImg = document.querySelector('[class*="col-span-5"] img, [class*="col-span-4"] img');
        if (itemImg && primary.productSnapshot && primary.productSnapshot.image) {
          itemImg.src = primary.productSnapshot.image;
        }
      }

      // 6. Hydrate KRA ETR Invoice Number
      const invoiceEl = document.getElementById('etr-invoice-num');
      if (invoiceEl && order.kraInvoiceNumber) {
        invoiceEl.textContent = order.kraInvoiceNumber;
      }
    }

    // --- Mobile STK Push Sheet Simulation ---
    _bindMobileStkPush() {
      const timerDisplay = document.getElementById('countdownTimer');
      const resendBtn = document.getElementById('btn-resend-stk');

      if (timerDisplay) {
        this.countdownSeconds = 102;
        clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
          this.countdownSeconds--;
          if (this.countdownSeconds <= 0) {
            clearInterval(this.timerInterval);
            timerDisplay.textContent = '00:00 (Expired)';
            this.setPaymentState('EXPIRED');
            return;
          }
          const mins = Math.floor(this.countdownSeconds / 60);
          const secs = this.countdownSeconds % 60;
          timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }, 1000);
      }

      if (resendBtn && !resendBtn.__eyekart_bound) {
        resendBtn.__eyekart_bound = true;
        resendBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this.countdownSeconds = 102;
          this.setPaymentState('INITIATED');
          if (global.EyeKartStore) global.EyeKartStore.showToast('[DEMO] STK Push re-transmitted to mobile device', 'refresh');
        });
      }

      const mobileAuthorizeBtn = document.getElementById('btn-mobile-auth-pin');
      if (mobileAuthorizeBtn && !mobileAuthorizeBtn.__eyekart_bound) {
        mobileAuthorizeBtn.__eyekart_bound = true;
        mobileAuthorizeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this._completePaymentDemo('+254 712 345 678');
        });
      }
    }

    // --- Motorbike Courier Telemetry Loop ---
    _bindCourierTelemetry() {
      let speedEl = document.getElementById('courier-speed');
      let tempEl = document.getElementById('courier-temp');

      if (!speedEl) {
        speedEl = Array.from(document.querySelectorAll('.font-data-metric')).find(el => el.textContent && el.textContent.includes('km/h'));
      }
      if (!tempEl) {
        tempEl = Array.from(document.querySelectorAll('.text-mpesa-green, span')).find(el => el.textContent && el.textContent.includes('Optical Case:'));
      }

      const isCourierView = typeof window !== 'undefined' && (
        window.location.pathname.includes('courier_dispatch') || 
        window.location.pathname.includes('courier_tracking') ||
        !!speedEl || !!tempEl
      );

      if (!isCourierView) return;

      clearInterval(this.telemetryInterval);
      this.telemetryInterval = setInterval(() => {
        const speed = Math.floor(32 + Math.random() * 12);
        if (speedEl) speedEl.textContent = `${speed} km/h`;
        if (tempEl) tempEl.textContent = `Optical Case: ${(21.2 + (Math.random() * 0.4)).toFixed(1)}°C`;
      }, 3000);
    }

    // --- KRA ETR Tax Invoice Auto-Populate ---
    _bindKraInvoice() {
      const invoiceEl = document.getElementById('etr-invoice-num');
      const timeEl = document.getElementById('invoice-timestamp');
      if (invoiceEl) {
        const order = global.EyeKartStore?.state.orders[0];
        if (order && order.kraInvoiceNumber) {
          invoiceEl.textContent = order.kraInvoiceNumber;
        }
      }
      if (timeEl) {
        timeEl.textContent = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
      }
    }

    // --- Insurance Direct Pre-Auth Demo Form ---
    _bindInsurancePreAuth() {
      const claimBtn = document.getElementById('btn-submit-preauth');
      if (claimBtn && !claimBtn.__eyekart_bound) {
        claimBtn.__eyekart_bound = true;
        claimBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (global.EyeKartStore) {
            global.EyeKartStore.submitPreAuth({});
            if (global.EyeKartRouter) {
              global.EyeKartRouter.navigate('insurance-voucher');
            }
          }
        });
      }
    }

    // --- Alternative Payment Accordion Bindings ---
    _bindAlternativePayments() {
      // Switch to Card Terminal button
      const cardBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.includes('Switch to Card Terminal'));
      cardBtns.forEach(btn => {
        if (!btn.__eyekart_bound) {
          btn.__eyekart_bound = true;
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (global.EyeKartStore) {
              global.EyeKartStore.showToast('[DEMO SIMULATION] Kenyan Bank 3D-Secure 2.0 Gateway activated.', 'credit_card');
            }
          });
        }
      });

      // Submit Smartcard Pre-Auth Claim button
      const smartcardBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.includes('Submit Smartcard Pre-Auth Claim'));
      smartcardBtns.forEach(btn => {
        if (!btn.__eyekart_bound) {
          btn.__eyekart_bound = true;
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (global.EyeKartStore) {
              global.EyeKartStore.submitPreAuth({});
              if (global.EyeKartRouter) {
                global.EyeKartRouter.navigate('insurance-voucher');
              }
            }
          });
        }
      });
    }
  }

  const mpesaInstance = new MPESAService();
  global.EyeKartMPESA = mpesaInstance;

  // Global delegation for inline template onclick="handleStkPush()"
  global.handleStkPush = function () {
    const phoneInput = document.getElementById('mpesa-number');
    const phone = phoneInput ? phoneInput.value.trim() : '+254 712 345 678';
    return mpesaInstance.triggerStkPush(phone);
  };

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
