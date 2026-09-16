/**
 * EyeKart Centralized Reactive Store
 * Manages shared state across all 22 panels with LocalStorage persistence.
 * Implements Protocol v1.1, Sections 7, 8, 10, 11.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'eyekart_store_state_v1_1';

  const DefaultState = {
    selectedSku: "EK-902",
    activeVariant: "Obsidian Black",
    cart: {
      items: [],
      subtotal: 0,
      vat: 0,
      deliveryFee: 0,
      total: 0
    },
    wishlist: [],
    comparison: [],
    prescription: {
      type: "manual",
      mode: "manual",
      verificationStatus: "NONE",
      od: { sph: "0.00", cyl: "0.00", axis: "0", add: "0.00" },
      os: { sph: "0.00", cyl: "0.00", axis: "0", add: "0.00" },
      pd: 63,
      verified: false
    },
    lensConfig: {
      lensType: "Digital Single Vision",
      index: "1.56",
      coatings: ["Anti-Reflective"],
      lensPrice: 0
    },
    appointments: [],
    insurance: null,
    orders: [],
    user: null
  };

  class Store {
    constructor() {
      this.subscribers = new Map();
      this.state = this._loadState();
      this._recalculateCart();
    }

    _loadState() {
      try {
        if (typeof localStorage === 'undefined') {
          return JSON.parse(JSON.stringify(DefaultState));
        }
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return JSON.parse(JSON.stringify(DefaultState));
        const parsed = JSON.parse(raw);
        return Object.assign({}, DefaultState, parsed);
      } catch (e) {
        console.warn('[EyeKart Store] Error reading localStorage, using defaults', e);
        return JSON.parse(JSON.stringify(DefaultState));
      }
    }

    _saveState() {
      try {
        if (typeof localStorage === 'undefined') return;
        // Privacy Guardrail: sanitize state before writing to persistent localStorage
        const safeState = {
          selectedSku: this.state.selectedSku,
          activeVariant: this.state.activeVariant,
          cart: this.state.cart,
          wishlist: this.state.wishlist,
          comparison: this.state.comparison,
          lensConfig: this.state.lensConfig,
          prescription: {
            mode: this.state.prescription?.mode || this.state.prescription?.type || 'manual',
            type: this.state.prescription?.type || 'manual',
            verificationStatus: this.state.prescription?.verificationStatus || 'USER_ENTERED',
            od: this.state.prescription?.od || {},
            os: this.state.prescription?.os || {},
            pd: this.state.prescription?.pd || 63,
            verified: this.state.prescription?.verificationStatus === 'OPTOMETRIST_VERIFIED'
          },
          appointments: this.state.appointments || [],
          orders: this.state.orders || []
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
      } catch (e) {
        console.warn('[EyeKart Store] Error persisting to localStorage', e);
      }
    }

    subscribe(key, callback) {
      if (!this.subscribers.has(key)) {
        this.subscribers.set(key, new Set());
      }
      this.subscribers.get(key).add(callback);
      // Run once immediately with current value
      callback(this.state[key], this.state);
      return () => this.subscribers.get(key).delete(callback);
    }

    notify(key) {
      this._saveState();
      if (this.subscribers.has(key)) {
        this.subscribers.get(key).forEach(cb => {
          try { cb(this.state[key], this.state); } catch (e) { console.error(e); }
        });
      }
      if (this.subscribers.has('*')) {
        this.subscribers.get('*').forEach(cb => {
          try { cb(this.state, this.state); } catch (e) { console.error(e); }
        });
      }
    }

    // --- Active SKU Continuity ---
    getSelectedSku() {
      return this.state.selectedSku || "EK-902";
    }

    setSelectedSku(sku) {
      if (!sku || typeof sku !== 'string') return;
      const clean = sku.toUpperCase().trim();
      if (!clean) return;
      this.state.selectedSku = clean;
      this.notify('selectedSku');
    }

    // --- Active Variant Continuity ---
    getActiveVariant() {
      return this.state.activeVariant || "Obsidian Black";
    }

    setActiveVariant(variant) {
      if (!variant || typeof variant !== 'string') return;
      const clean = variant.trim();
      if (!clean) return;
      this.state.activeVariant = clean;
      this.notify('activeVariant');
    }

    // --- Cart Management ---
    _recalculateCart() {
      let subtotal = 0;
      if (this.state.cart && Array.isArray(this.state.cart.items)) {
        this.state.cart.items.forEach(item => {
          subtotal += (item.totalPrice || item.framePrice || 0) * (item.qty || 1);
        });
      } else {
        this.state.cart = { items: [], subtotal: 0, vat: 0, deliveryFee: 0, total: 0 };
      }
      this.state.cart.subtotal = subtotal;
      // VAT-inclusive pricing: VAT component = VAT-inclusive total × 16 / 116
      this.state.cart.vat = Math.round(subtotal * 16 / 116);
      this.state.cart.deliveryFee = 0; // Free Nairobi courier
      this.state.cart.total = subtotal; // Total = subtotal (VAT already included)
    }

    getCart() {
      return this.state.cart || { items: [], subtotal: 0, vat: 0, deliveryFee: 0, total: 0 };
    }

    getCartCount() {
      if (!this.state.cart || !Array.isArray(this.state.cart.items)) return 0;
      return this.state.cart.items.reduce((sum, it) => sum + (it.qty || 1), 0);
    }

    getCartTotal() {
      return this.state.cart?.total || 0;
    }

    addCartItem(item) {
      const id = 'cart_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      const activeSku = item.sku || this.getSelectedSku();
      const frameData = global.CatalogService ? global.CatalogService.getBySku(activeSku) : null;
      const frameName = item.name || (frameData ? frameData.name : "Optical Atelier Frame");
      const framePrice = item.framePrice !== undefined ? item.framePrice : (frameData ? frameData.price : 14800);
      const activeVariant = item.variant || this.getActiveVariant() || (frameData?.variants?.[0]?.name) || "Standard";

      // Strongly-typed lens configuration & prescription metadata
      let lensConfig = item.lensConfig || null;
      if (lensConfig) {
        const rxMode = lensConfig.prescriptionMode || this.getPrescriptionMode() || 'manual';
        const rxStatus = lensConfig.prescription?.verificationStatus || 
                         (rxMode === 'upload' ? 'PENDING_OPTOMETRIST_REVIEW' :
                         (rxMode === 'whatsapp' ? 'PENDING_SUBMISSION' :
                         (rxMode === 'no_rx' ? 'PLANO_NO_RX' : 
                         (rxMode === 'saved' ? 'OPTOMETRIST_VERIFIED' : 'USER_ENTERED'))));

        lensConfig = Object.assign({}, lensConfig, {
          prescriptionMode: rxMode,
          prescription: Object.assign({}, lensConfig.prescription || this.state.prescription || {}, {
            verificationStatus: rxStatus
          })
        });
      }

      const lensPrice = lensConfig ? (lensConfig.lensPrice || 0) : 0;
      const totalPrice = item.totalPrice !== undefined ? item.totalPrice : (framePrice + lensPrice);

      const productSnapshot = {
        category: frameData?.category || "eyeglasses",
        material: frameData?.material || "Japanese Titanium",
        dimensions: frameData?.dimensions || "50 □ 19 - 140",
        image: frameData?.gallery?.[0] || null
      };

      const newItem = {
        id: id,
        sku: activeSku,
        name: frameName,
        variant: activeVariant,
        qty: item.qty || 1,
        framePrice: framePrice,
        lensConfig: lensConfig,
        totalPrice: totalPrice,
        productSnapshot: productSnapshot
      };

      // Check if exact same SKU & variant & lensConfig exists
      const existing = this.state.cart.items.find(it => 
        it.sku === newItem.sku && 
        it.variant === newItem.variant && 
        JSON.stringify(it.lensConfig || null) === JSON.stringify(newItem.lensConfig || null)
      );

      if (existing) {
        existing.qty = (existing.qty || 1) + (newItem.qty || 1);
      } else {
        this.state.cart.items.push(newItem);
      }

      this._recalculateCart();
      this.notify('cart');
      this.showToast(`Added ${newItem.name} (${newItem.variant}) to Optical Bag`, 'shopping_bag');
      return newItem;
    }

    removeCartItem(itemId) {
      if (!this.state.cart || !Array.isArray(this.state.cart.items)) return;
      this.state.cart.items = this.state.cart.items.filter(it => it.id !== itemId);
      this._recalculateCart();
      this.notify('cart');
      this.showToast('Item removed from Optical Bag', 'delete');
    }

    updateCartQty(itemId, delta) {
      if (!this.state.cart || !Array.isArray(this.state.cart.items)) return;
      const it = this.state.cart.items.find(i => i.id === itemId);
      if (!it) return;
      it.qty = Math.max(1, (it.qty || 1) + delta);
      this._recalculateCart();
      this.notify('cart');
    }

    clearCart() {
      if (!this.state.cart) this.state.cart = {};
      this.state.cart.items = [];
      this._recalculateCart();
      this.notify('cart');
    }

    // --- Wishlist Management ---
    getWishlistCount() {
      return (this.state.wishlist || []).length;
    }

    isInWishlist(sku) {
      if (!sku) return false;
      const clean = sku.toUpperCase().trim();
      return (this.state.wishlist || []).includes(clean);
    }

    toggleWishlist(sku) {
      if (!sku) return false;
      const clean = sku.toUpperCase().trim();
      if (!Array.isArray(this.state.wishlist)) this.state.wishlist = [];
      const idx = this.state.wishlist.indexOf(clean);
      let added = false;
      if (idx > -1) {
        this.state.wishlist.splice(idx, 1);
        this.showToast(`Removed ${clean} from Saved Frames`, 'favorite_border');
      } else {
        this.state.wishlist.push(clean);
        this.showToast(`Saved ${clean} to Atelier Wishlist`, 'favorite');
        added = true;
      }
      this.notify('wishlist');
      return added;
    }

    // --- Comparison Tray ---
    getComparison() {
      return this.state.comparison || [];
    }

    isInCompare(sku) {
      if (!sku) return false;
      return (this.state.comparison || []).includes(sku.toUpperCase().trim());
    }

    toggleCompare(sku) {
      if (!sku) return false;
      const clean = sku.toUpperCase().trim();
      if (!Array.isArray(this.state.comparison)) this.state.comparison = [];
      const idx = this.state.comparison.indexOf(clean);
      let added = false;
      if (idx > -1) {
        this.state.comparison.splice(idx, 1);
        this.showToast(`Removed ${clean} from Technical Spec Matrix`, 'difference');
      } else {
        if (this.state.comparison.length >= 4) {
          this.showToast('Comparison limit reached (max 4 frames). Remove a frame to add another.', 'info');
          return false;
        }
        this.state.comparison.push(clean);
        this.showToast(`Added ${clean} to Technical Spec Matrix`, 'architecture');
        added = true;
      }
      this.notify('comparison');
      return added;
    }

    removeFromCompare(sku) {
      if (!sku) return;
      const clean = sku.toUpperCase().trim();
      if (!Array.isArray(this.state.comparison)) return;
      const idx = this.state.comparison.indexOf(clean);
      if (idx > -1) {
        this.state.comparison.splice(idx, 1);
        this.showToast(`Removed ${clean} from Technical Spec Matrix`, 'difference');
        this.notify('comparison');
      }
    }

    clearCompare() {
      this.state.comparison = [];
      this.showToast('Cleared comparison matrix selection', 'delete_sweep');
      this.notify('comparison');
    }

    // --- Clinical Prescription & Lens Customization ---
    getPrescriptionMode() {
      return this.state.prescription?.mode || this.state.prescription?.type || 'manual';
    }

    setPrescriptionMode(mode) {
      if (!this.state.prescription) this.state.prescription = {};
      this.state.prescription.mode = mode;
      this.state.prescription.type = mode;
      if (mode === 'no_rx' || mode === 'plano') {
        this.state.prescription.verificationStatus = 'PLANO_NO_RX';
      } else if (mode === 'manual') {
        this.state.prescription.verificationStatus = 'USER_ENTERED';
      } else if (mode === 'upload') {
        this.state.prescription.verificationStatus = 'PENDING_OPTOMETRIST_REVIEW';
      } else if (mode === 'whatsapp') {
        this.state.prescription.verificationStatus = 'PENDING_SUBMISSION';
      } else if (mode === 'saved') {
        this.state.prescription.verificationStatus = 'OPTOMETRIST_VERIFIED';
      }
      this.notify('prescription');
    }

    getPrescription() {
      return this.state.prescription || null;
    }

    setPrescription(rx) {
      this.state.prescription = Object.assign({}, this.state.prescription, rx);
      if (!this.state.prescription.verificationStatus) {
        const mode = this.state.prescription.mode || this.state.prescription.type || 'manual';
        this.state.prescription.verificationStatus = mode === 'upload' ? 'PENDING_OPTOMETRIST_REVIEW' :
                                                     (mode === 'whatsapp' ? 'PENDING_SUBMISSION' :
                                                     (mode === 'no_rx' ? 'PLANO_NO_RX' : 
                                                     (mode === 'saved' ? 'OPTOMETRIST_VERIFIED' : 'USER_ENTERED')));
      }
      this.notify('prescription');
    }

    transposePrescription() {
      // Plus / Minus Cylinder transposition formula:
      // New SPH = SPH + CYL
      // New CYL = -CYL
      // New AXIS = (AXIS + 90) % 180 (if > 180, - 180; if 0, 180)
      const transposeEye = (eye) => {
        if (!eye) return { sph: '0.00', cyl: '0.00', axis: '090', add: '+1.25' };
        const sph = parseFloat(eye.sph) || 0;
        const cyl = parseFloat(eye.cyl) || 0;
        let axis = parseInt(eye.axis, 10) || 0;
        const newSph = (sph + cyl).toFixed(2);
        const newCyl = (-cyl).toFixed(2);
        axis = (axis + 90) % 180;
        if (axis === 0) axis = 180;
        return {
          sph: (parseFloat(newSph) > 0 ? '+' : '') + newSph,
          cyl: (parseFloat(newCyl) > 0 ? '+' : '') + newCyl,
          axis: String(axis).padStart(3, '0'),
          add: eye.add || '+1.25'
        };
      };

      if (!this.state.prescription) this.state.prescription = {};
      this.state.prescription.od = transposeEye(this.state.prescription.od);
      this.state.prescription.os = transposeEye(this.state.prescription.os);
      this.notify('prescription');
      this.showToast('Transposed SPH / CYL optical formula', 'swap_horiz');
    }

    getLensConfig() {
      return this.state.lensConfig || null;
    }

    setLensConfig(config) {
      this.state.lensConfig = Object.assign({}, this.state.lensConfig, config);
      this.notify('lensConfig');
    }

    // --- Clinic Appointments ---
    bookAppointment(apt) {
      const id = 'APT-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
      const newApt = Object.assign({
        id: id,
        date: new Date().toISOString().split('T')[0],
        time: "10:30 AM",
        clinicName: "Sarit Centre Precision Clinic",
        optometrist: "Dr. Farida Onyango",
        status: "CONFIRMED_DEMO"
      }, apt);

      if (!Array.isArray(this.state.appointments)) this.state.appointments = [];
      this.state.appointments.unshift(newApt);
      this.notify('appointments');
      this.showToast(`28-Point Exam booked at ${newApt.clinicName}`, 'event_available');
      return newApt;
    }

    // --- Insurance Claim Pre-Auth Demo ---
    submitPreAuth(claim) {
      const code = 'JUB-OPT-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000) + 'X';
      this.state.insurance = Object.assign({}, this.state.insurance, claim, {
        preAuthCode: code,
        status: "APPROVED_DEMO"
      });
      this.notify('insurance');
      this.showToast(`Pre-Authorization Approved: ${code}`, 'verified');
      return this.state.insurance;
    }

    // --- Order Generation & Lifecycle Management (DEMO / SIMULATION) ---
    placeOrder(orderData) {
      // 1. Deep snapshot cart items
      const cartItems = (this.state.cart && Array.isArray(this.state.cart.items) && this.state.cart.items.length > 0)
        ? JSON.parse(JSON.stringify(this.state.cart.items))
        : [{
            id: 'item_snapshot_' + Date.now(),
            sku: this.getSelectedSku(),
            name: (global.CatalogService && global.CatalogService.getBySku(this.getSelectedSku())?.name) || "Kibera Minimalist EK-902",
            variant: this.getActiveVariant() || "Champagne Titanium",
            qty: 1,
            framePrice: (global.CatalogService && global.CatalogService.getBySku(this.getSelectedSku())?.price) || 18500,
            lensConfig: this.state.lensConfig ? JSON.parse(JSON.stringify(this.state.lensConfig)) : {
              lensType: "1.67 Aspheric Free-Form Lenses",
              lensPrice: 4700,
              coatings: ["Anti-Reflective", "BlueShield 420", "Hydrophobic Hydro-Coat"],
              prescriptionMode: this.getPrescriptionMode() || "manual"
            },
            totalPrice: this.state.cart?.total || 23200,
            productSnapshot: {
              image: (global.CatalogService && global.CatalogService.getBySku(this.getSelectedSku())?.gallery?.[0]) || null,
              category: "eyeglasses",
              material: "Pure Titanium",
              dimensions: "51 • 19 • 145 mm"
            }
          }];

      const calculatedSubtotal = this.state.cart?.subtotal || cartItems.reduce((acc, it) => acc + ((it.totalPrice || it.framePrice || 0) * (it.qty || 1)), 0);
      const calculatedVat = this.state.cart?.vat || Math.round(calculatedSubtotal * 16 / 116); // VAT included (16%)
      const calculatedTotal = this.state.cart?.total || calculatedSubtotal; // Total = subtotal (VAT already included)
      const orderId = orderData?.orderId || ('EK-NBI-' + Math.floor(10000 + Math.random() * 90000));
      const mpesaCode = orderData?.mpesaReceipt || ('QHK' + Math.floor(100000 + Math.random() * 900000) + 'MP');
      const kraCode = orderData?.kraInvoiceNumber || ('KRA-ETR-2025-' + Math.floor(1000000 + Math.random() * 9000000));
      
      const primaryItem = cartItems[0];
      const summaryText = cartItems.map(it => `${it.qty || 1}x ${it.name} (${it.sku} - ${it.variant})`).join(', ');

      // Determine if order requires clinical optical review
      const requiresPrescriptionReview = cartItems.some(it => {
        if (!it.lensConfig) return false;
        const lt = (it.lensConfig.lensType || '').toLowerCase();
        if (lt.includes('demo') || lt.includes('non-prescription') || lt.includes('plano')) return false;
        if (it.lensConfig.prescriptionMode === 'no_rx' || it.lensConfig.prescriptionMode === 'plano') return false;
        return true;
      });

      const isAlreadyVerified = this.state.prescription?.verified === true || 
                                this.state.prescription?.verificationStatus === 'OPTOMETRIST_VERIFIED' || 
                                orderData?.prescriptionVerified === true;

      let initialStatus = 'CONFIRMED';
      let initialPrescriptionStatus = 'NOT_APPLICABLE';
      let initialTracking = {
        stage: "CONFIRMED",
        stageNumber: 1,
        stageTitle: "Stage 1 of 10: Order Confirmed (Frame Only — Cleared for Assembly)",
        riderName: "Westlands Central Lab Dispatch",
        riderPhone: "+254 700 918 274",
        vehicleReg: "Electric Moto Transporter #EK-E12",
        etaMinutes: 45,
        temperature: "21.4°C",
        speed: "0 km/h",
        routeText: "Packaging at Westlands Atelier"
      };
      let initialHistory = [
        { status: "PAYMENT_INITIATED", timestamp: new Date(Date.now() - 2000).toISOString() },
        { status: "PAYMENT_CONFIRMED_DEMO", timestamp: new Date().toISOString(), note: "Payment verified via Safaricom M-PESA." }
      ];

      if (requiresPrescriptionReview) {
        if (isAlreadyVerified) {
          initialPrescriptionStatus = 'APPROVED';
          initialStatus = 'PROCESSING';
          initialTracking = {
            stage: "LAB_SURFACING",
            stageNumber: 3,
            stageTitle: "Stage 3 of 10: German CNC Free-Form Lens Edging",
            riderName: "Juma Kamau",
            riderPhone: "+254 700 918 274",
            vehicleReg: "Electric Moto Transporter #EK-E12",
            etaMinutes: 30,
            temperature: "21.4°C",
            speed: "0 km/h",
            routeText: "Surfacing at Westlands Central Lab"
          };
          initialHistory.push({ status: "PRESCRIPTION_APPROVED", timestamp: new Date().toISOString(), note: "Pre-verified clinical prescription approved for surfacing." });
          initialHistory.push({ status: "PROCESSING", timestamp: new Date().toISOString(), note: "Released to German CNC diamond bevel edging queue." });
        } else {
          initialPrescriptionStatus = 'PENDING_OPTOMETRIST_REVIEW';
          initialStatus = 'PRESCRIPTION_REVIEW';
          initialTracking = {
            stage: "PRESCRIPTION_REVIEW",
            stageNumber: 2,
            stageTitle: "Stage 2 of 10: Digital Prescription Clearance Pending",
            riderName: "Awaiting Lab Dispatch",
            riderPhone: "+254 700 918 274",
            vehicleReg: "Electric Moto Transporter #EK-E12",
            etaMinutes: 60,
            temperature: "21.4°C",
            speed: "0 km/h",
            routeText: "Awaiting Optometrist Review at Sarit Diagnostic Wing"
          };
          initialHistory.push({ 
            status: "PRESCRIPTION_REVIEW", 
            timestamp: new Date().toISOString(), 
            note: "Optical prescription submitted by customer. Queued for registered optometrist verification." 
          });
        }
      }

      const newOrder = Object.assign({
        orderId: orderId,
        date: new Date().toISOString(),
        paymentMethod: "M-PESA Express STK (Demo)",
        payment: {
          rail: "Safaricom Daraja 2.0 (Demo Rail)",
          status: "COMPLETED_DEMO",
          transactionId: mpesaCode,
          timestamp: new Date().toISOString()
        },
        mpesaReceipt: mpesaCode,
        kraInvoiceNumber: kraCode,
        subtotal: calculatedSubtotal,
        vat: calculatedVat,
        deliveryFee: 0,
        total: calculatedTotal,
        customer: Object.assign({
          name: "Zawadi Kamau",
          email: "zawadi.kamau@eyekart.co.ke",
          phone: orderData?.userPhone || "+254 712 345 678",
          clientId: "EK-NRB-" + Math.floor(1000 + Math.random() * 9000)
        }, this.state.user || {}),
        deliveryAddress: orderData?.deliveryAddress || "Riverside Green Suites, Block B Apt 402, Riverside Drive, Nairobi",
        gateProtocol: orderData?.gateProtocol || "Ring Apt 402 buzzer or call upon arrival at the security gate.",
        items: cartItems,
        itemsSummary: summaryText || `${primaryItem.name} (${primaryItem.sku}) + Fitted Lenses`,
        primaryItem: primaryItem,
        requiresPrescriptionReview: requiresPrescriptionReview,
        prescriptionStatus: initialPrescriptionStatus,
        prescriptionSnapshot: this.state.prescription ? JSON.parse(JSON.stringify(this.state.prescription)) : {
          mode: "manual",
          verificationStatus: "USER_ENTERED",
          od: { sph: "-4.25", cyl: "-0.75", axis: "095", add: "+1.25" },
          os: { sph: "-3.75", cyl: "-0.50", axis: "085", add: "+1.25" },
          pd: "63.5",
          verified: false
        },
        tracking: initialTracking,
        status: initialStatus,
        lifecycleHistory: initialHistory
      }, orderData);

      if (!Array.isArray(this.state.orders)) this.state.orders = [];
      this.state.orders.unshift(newOrder);
      this.clearCart();
      this.notify('orders');
      return newOrder;
    }

    getOrders() {
      return this.state.orders || [];
    }

    getOrder(orderId) {
      if (!this.state.orders || !this.state.orders.length) return null;
      if (!orderId) return this.state.orders[0];
      return this.state.orders.find(o => o.orderId === orderId) || this.state.orders[0];
    }

    cancelOrder(orderId, reason) {
      const order = this.getOrder(orderId);
      if (!order) return null;
      order.status = "CANCELLED";
      if (!order.payment) order.payment = {};
      order.payment.status = "REFUNDED_DEMO";
      order.cancelledAt = new Date().toISOString();
      order.cancelReason = reason || "Customer requested cancellation prior to laboratory edging dispatch.";
      if (!Array.isArray(order.lifecycleHistory)) order.lifecycleHistory = [];
      order.lifecycleHistory.push({
        status: "CANCELLED",
        timestamp: new Date().toISOString(),
        note: order.cancelReason
      });
      this.notify('orders');
      this.showToast(`Order #${order.orderId} cancelled. Simulated refund initiated.`, 'cancel');
      return order;
    }

    updateOrderStatus(orderId, newStatus, stageInfo) {
      const order = this.getOrder(orderId);
      if (!order) return null;
      order.status = newStatus;
      if (stageInfo && order.tracking) {
        Object.assign(order.tracking, stageInfo);
      }
      if (!Array.isArray(order.lifecycleHistory)) order.lifecycleHistory = [];
      order.lifecycleHistory.push({
        status: newStatus,
        timestamp: new Date().toISOString()
      });
      this.notify('orders');
      return order;
    }

    // --- Optical Operations & Clinical Review Workflow (Phase 5.1) ---
    getPendingReviewOrders() {
      if (!this.state.orders || !Array.isArray(this.state.orders)) return [];
      return this.state.orders.filter(o => 
        o.requiresPrescriptionReview && 
        (o.prescriptionStatus === 'PENDING_OPTOMETRIST_REVIEW' || o.status === 'PRESCRIPTION_REVIEW')
      );
    }

    reviewPrescription(orderId, action, options = {}) {
      const order = this.getOrder(orderId);
      if (!order) return null;
      const actor = options.actor || 'Dr. Kevin Omondi (MCOptom, OCK #0512)';
      const timestamp = new Date().toISOString();
      const prevState = order.prescriptionStatus || 'PENDING_OPTOMETRIST_REVIEW';

      if (action === 'APPROVE') {
        order.prescriptionStatus = 'APPROVED';
        order.status = 'PROCESSING';
        if (!order.prescriptionSnapshot) order.prescriptionSnapshot = {};
        order.prescriptionSnapshot.verificationStatus = 'OPTOMETRIST_VERIFIED';
        order.prescriptionSnapshot.verified = true;
        order.prescriptionSnapshot.reviewedBy = actor;
        order.prescriptionSnapshot.reviewedAt = timestamp;
        if (options.notes) order.prescriptionSnapshot.clinicalNotes = options.notes;

        if (order.tracking) {
          order.tracking.stage = 'LAB_SURFACING';
          order.tracking.stageNumber = 3;
          order.tracking.stageTitle = 'Stage 3 of 10: German CNC Free-Form Lens Edging';
          order.tracking.routeText = 'Diamond Bevel Edging at Westlands Central Lab';
        }

        if (!Array.isArray(order.lifecycleHistory)) order.lifecycleHistory = [];
        order.lifecycleHistory.push({
          status: 'PRESCRIPTION_APPROVED',
          timestamp: timestamp,
          actor: actor,
          previousState: prevState,
          newState: 'APPROVED',
          note: options.notes || `Prescription verified and approved by ${actor}. Cleared for optical lab surfacing.`
        });
        order.lifecycleHistory.push({
          status: 'PROCESSING',
          timestamp: timestamp,
          actor: 'Optical Lab Manager',
          note: 'Job ticket queued for German CNC diamond bevel edging.'
        });
        this.notify('orders');
        this.showToast(`Prescription approved by ${actor}`, 'verified');
        return order;
      }

      if (action === 'REJECT') {
        order.prescriptionStatus = 'REJECTED';
        order.status = 'PRESCRIPTION_REJECTED';
        order.rejectReason = options.reason || 'Astigmatism CYL/AXIS parameter inconsistency requires clinic re-examination.';
        if (!order.prescriptionSnapshot) order.prescriptionSnapshot = {};
        order.prescriptionSnapshot.verificationStatus = 'REJECTED';
        order.prescriptionSnapshot.verified = false;
        order.prescriptionSnapshot.reviewedBy = actor;
        order.prescriptionSnapshot.reviewedAt = timestamp;

        if (order.tracking) {
          order.tracking.stage = 'PRESCRIPTION_REJECTED';
          order.tracking.stageTitle = 'Prescription Rejected: Patient Resubmission Required';
        }

        if (!Array.isArray(order.lifecycleHistory)) order.lifecycleHistory = [];
        order.lifecycleHistory.push({
          status: 'PRESCRIPTION_REJECTED',
          timestamp: timestamp,
          actor: actor,
          previousState: prevState,
          newState: 'REJECTED',
          reason: order.rejectReason,
          note: `Prescription declined by ${actor}: ${order.rejectReason}`
        });
        this.notify('orders');
        this.showToast(`Prescription declined: ${order.rejectReason}`, 'warning');
        return order;
      }

      if (action === 'REQUEST_CLARIFICATION') {
        order.prescriptionStatus = 'CLARIFICATION_REQUESTED';
        order.status = 'CLARIFICATION_REQUESTED';
        order.clarificationRequest = options.notes || 'Please confirm if right eye axis is 95° or 175°.';
        if (!order.prescriptionSnapshot) order.prescriptionSnapshot = {};
        order.prescriptionSnapshot.verificationStatus = 'CLARIFICATION_REQUESTED';
        order.prescriptionSnapshot.verified = false;
        order.prescriptionSnapshot.reviewedBy = actor;
        order.prescriptionSnapshot.reviewedAt = timestamp;

        if (order.tracking) {
          order.tracking.stage = 'CLARIFICATION_REQUESTED';
          order.tracking.stageTitle = 'Clinical Clarification Requested by Optometrist';
        }

        if (!Array.isArray(order.lifecycleHistory)) order.lifecycleHistory = [];
        order.lifecycleHistory.push({
          status: 'CLARIFICATION_REQUESTED',
          timestamp: timestamp,
          actor: actor,
          previousState: prevState,
          newState: 'CLARIFICATION_REQUESTED',
          notes: order.clarificationRequest,
          note: `Clarification requested by ${actor}: ${order.clarificationRequest}`
        });
        this.notify('orders');
        this.showToast(`Clarification query sent: ${order.clarificationRequest}`, 'help_outline');
        return order;
      }

      return null;
    }

    submitPrescriptionClarification(orderId, updatedRx, patientNote) {
      const order = this.getOrder(orderId);
      if (!order) return null;
      const timestamp = new Date().toISOString();

      if (!order.prescriptionSnapshot) order.prescriptionSnapshot = {};

      // Preserve original submitted prescription values immutably
      if (!order.prescriptionSnapshot.originalSubmitted) {
        order.prescriptionSnapshot.originalSubmitted = {
          od: { ...(order.prescriptionSnapshot.od || {}) },
          os: { ...(order.prescriptionSnapshot.os || {}) },
          pd: order.prescriptionSnapshot.pd
        };
      }

      // Update with clarified values
      if (updatedRx.od) order.prescriptionSnapshot.od = Object.assign({}, order.prescriptionSnapshot.od, updatedRx.od);
      if (updatedRx.os) order.prescriptionSnapshot.os = Object.assign({}, order.prescriptionSnapshot.os, updatedRx.os);
      if (updatedRx.pd) order.prescriptionSnapshot.pd = updatedRx.pd;
      
      order.prescriptionStatus = 'PENDING_OPTOMETRIST_REVIEW';
      order.status = 'PRESCRIPTION_REVIEW';
      order.patientClarificationNote = patientNote || 'Patient clarified diopter / axis parameters.';

      if (order.tracking) {
        order.tracking.stage = 'PRESCRIPTION_REVIEW';
        order.tracking.stageTitle = 'Stage 2 of 10: Digital Prescription Clearance Pending';
      }

      if (!Array.isArray(order.lifecycleHistory)) order.lifecycleHistory = [];
      order.lifecycleHistory.push({
        status: 'CLARIFICATION_RESUBMITTED',
        timestamp: timestamp,
        actor: order.customer?.name || 'Patient / Customer',
        note: order.patientClarificationNote
      });
      this.notify('orders');
      this.showToast('Prescription clarification re-submitted for optometrist review.', 'send');
      return order;
    }

    advanceFulfillmentStage(orderId, nextStage, stageInfo = {}) {
      const order = this.getOrder(orderId);
      if (!order) return null;

      // Enforce Clinical Fulfillment Gate:
      const requiresReview = order.requiresPrescriptionReview && order.prescriptionStatus !== 'NOT_APPLICABLE';
      const isUnresolved = order.prescriptionStatus !== 'APPROVED';
      const isPostReviewStage = ['LAB_SURFACING', 'PROCESSING', 'VACUUM_COATING', 'QA_CLINICAL', 'ULTRASONIC_CLEANING', 'CASING_SEAL', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(nextStage);

      if (requiresReview && isUnresolved && isPostReviewStage) {
        const errorMsg = `Fulfillment Gate Blocked: Order #${order.orderId} cannot advance to ${nextStage} while prescription status is ${order.prescriptionStatus || 'UNRESOLVED'}.`;
        this.showToast(errorMsg, 'block');
        return { success: false, blocked: true, error: errorMsg };
      }

      order.status = nextStage;
      if (!order.tracking) order.tracking = {};
      Object.assign(order.tracking, stageInfo, { stage: nextStage });

      if (!Array.isArray(order.lifecycleHistory)) order.lifecycleHistory = [];
      order.lifecycleHistory.push({
        status: nextStage,
        timestamp: new Date().toISOString(),
        actor: stageInfo.actor || 'Optical Fulfillment System',
        note: stageInfo.note || `Order advanced to ${nextStage}`
      });
      this.notify('orders');
      this.showToast(`Order updated to: ${nextStage}`, 'update');
      return { success: true, order: order };
    }

    // --- Non-Destructive Toast Feedback ---
    showToast(message, icon) {
      if (typeof document === 'undefined' || !document.createElement) return;
      let toast = document.getElementById('eyekart-runtime-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'eyekart-runtime-toast';
        toast.className = 'fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 bg-graphite text-on-primary rounded shadow-2xl transition-all duration-300 transform translate-y-8 opacity-0 pointer-events-none font-body-sm text-body-sm border border-outline-variant/30';
        toast.innerHTML = '<span class="material-symbols-outlined text-[20px] text-cyan-accent" id="eyekart-toast-icon">check_circle</span><span id="eyekart-toast-msg"></span>';
        document.body.appendChild(toast);
      }
      const iconEl = toast.querySelector('#eyekart-toast-icon');
      const msgEl = toast.querySelector('#eyekart-toast-msg');
      if (iconEl && icon) iconEl.textContent = icon;
      if (msgEl) msgEl.textContent = message;

      toast.classList.remove('translate-y-8', 'opacity-0', 'pointer-events-none');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toast.classList.add('translate-y-8', 'opacity-0', 'pointer-events-none');
      }, 3200);
    }
  }

  const storeInstance = new Store();
  storeInstance.DefaultState = DefaultState;
  Store.DefaultState = DefaultState;
  global.EyeKartStore = storeInstance;
  global.EyeKartStoreClass = Store;

  // Phase 6.1: Non-destructive asynchronous API adapter bootstrap
  if (typeof document !== 'undefined' && !document.querySelector('script[src*="eyekart-api-adapter"]')) {
    const s = document.createElement('script');
    s.src = '/assets/js/eyekart-api-adapter.js';
    s.async = true;
    document.head.appendChild(s);
  }

  // Node.js CommonJS compatibility for test suites
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      EyeKartStore: storeInstance,
      Store,
      DefaultState
    };
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
