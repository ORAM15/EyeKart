/**
 * EyeKart Production API Adapter (Phase 6.1 Foundation)
 * Provides a non-blocking asynchronous bridge between the existing EyeKart client runtime
 * and the production Fastify / PostgreSQL backend.
 * Conforms strictly to Rule 15: preserves local/demo functionality if the backend is unavailable.
 */
(function (global) {
  'use strict';

  const DEFAULT_API_BASE = 'http://127.0.0.1:3001';

  class EyeKartApiAdapter {
    constructor(baseUrl = DEFAULT_API_BASE) {
      this.baseUrl = baseUrl;
      this.isConnected = false;
      this.activeToken = null;
    }

    /**
     * Set active authorization token (stored in memory, not localStorage)
     */
    setToken(token) {
      this.activeToken = token;
    }

    /**
     * Clear active authorization token
     */
    clearToken() {
      this.activeToken = null;
    }

    /**
     * Private fetch helper with credentials and authorization headers
     */
    async _fetch(endpoint, options = {}) {
      const url = `${this.baseUrl}${endpoint}`;
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };

      if (this.activeToken) {
        headers['Authorization'] = `Bearer ${this.activeToken}`;
      }

      try {
        const res = await fetch(url, {
          ...options,
          headers,
          credentials: 'include' // Sends HTTP-only cookies
        });

        const data = await res.json().catch(() => ({}));
        return {
          ok: res.ok,
          status: res.status,
          data
        };
      } catch (networkErr) {
        return {
          ok: false,
          status: 0,
          error: 'BACKEND_UNAVAILABLE',
          message: networkErr.message
        };
      }
    }

    /**
     * Health check verifying backend status
     */
    async checkHealth() {
      const res = await this._fetch('/api/health', { method: 'GET' });
      this.isConnected = res.ok && res.data && res.data.status === 'ok';
      return res;
    }

    /**
     * Fetch canonical authoritative catalog products
     */
    async getProducts() {
      const res = await this._fetch('/api/products', { method: 'GET' });
      if (res.ok && res.data && res.data.success) {
        return res.data.data;
      }
      return null;
    }

    /**
     * Fetch canonical product by SKU
     */
    async getProductBySku(sku) {
      const res = await this._fetch(`/api/products/${encodeURIComponent(sku)}`, { method: 'GET' });
      if (res.ok && res.data && res.data.success) {
        return res.data.data;
      }
      return null;
    }

    /**
     * Fetch authoritative pricing quote for cart items
     * Client totalPrice is explicitly ignored by server
     */
    async calculateAuthoritativeQuote(items) {
      const res = await this._fetch('/api/pricing/quote', {
        method: 'POST',
        body: JSON.stringify({ items })
      });
      return res;
    }

    /**
     * Authenticate customer credentials
     */
    async login(email, password) {
      const res = await this._fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (res.ok && res.data && res.data.token) {
        this.setToken(res.data.token);
      }
      return res;
    }

    /**
     * Register new customer account
     */
    async register(email, password, fullName, phone) {
      const res = await this._fetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, fullName, phone })
      });
      if (res.ok && res.data && res.data.token) {
        this.setToken(res.data.token);
      }
      return res;
    }

    /**
     * Invalidate session and logout
     */
    async logout() {
      const res = await this._fetch('/api/auth/logout', { method: 'POST' });
      this.clearToken();
      return res;
    }

    /**
     * Fetch current authenticated user profile
     */
    async getCurrentUser() {
      const res = await this._fetch('/api/me', { method: 'GET' });
      if (res.ok && res.data && res.data.user) {
        return res.data.user;
      }
      return null;
    }

    // ==========================================
    // Phase 6.2 Server-Authoritative Commerce
    // ==========================================

    /**
     * Fetch server-authoritative cart
     */
    async getCart() {
      return this._fetch('/api/cart', { method: 'GET' });
    }

    /**
     * Add item to server cart
     */
    async addToCart(sku, variant = 'Standard', qty = 1, lensConfig = null) {
      return this._fetch('/api/cart/items', {
        method: 'POST',
        body: JSON.stringify({ sku, variant, qty, lensConfig })
      });
    }

    /**
     * Update cart item quantity
     */
    async updateCartItem(itemId, qty) {
      return this._fetch(`/api/cart/items/${encodeURIComponent(itemId)}`, {
        method: 'PUT',
        body: JSON.stringify({ qty })
      });
    }

    /**
     * Remove item from cart
     */
    async removeCartItem(itemId) {
      return this._fetch(`/api/cart/items/${encodeURIComponent(itemId)}`, {
        method: 'DELETE'
      });
    }

    /**
     * Clear all cart items
     */
    async clearCart() {
      return this._fetch('/api/cart', { method: 'DELETE' });
    }

    /**
     * Merge guest cart into customer cart
     */
    async mergeGuestCart(items) {
      return this._fetch('/api/cart/merge', {
        method: 'POST',
        body: JSON.stringify({ items })
      });
    }

    /**
     * Generate authoritative checkout quote
     */
    async getCheckoutQuote(params = {}) {
      return this._fetch('/api/checkout/quote', {
        method: 'POST',
        body: JSON.stringify(params)
      });
    }

    /**
     * Create order from checkout quote
     */
    async createOrder(orderData = {}) {
      const headers = {};
      if (orderData.idempotencyKey) {
        headers['Idempotency-Key'] = orderData.idempotencyKey;
      }
      return this._fetch('/api/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify(orderData)
      });
    }

    /**
     * List authenticated customer orders
     */
    async getOrders(params = {}) {
      const query = new URLSearchParams(params).toString();
      const endpoint = `/api/orders${query ? '?' + query : ''}`;
      return this._fetch(endpoint, { method: 'GET' });
    }

    /**
     * Get specific order by ID (with IDOR protection)
     */
    async getOrder(orderId) {
      return this._fetch(`/api/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });
    }

    /**
     * Cancel order (with state machine verification)
     */
    async cancelOrder(orderId, reason = null) {
      return this._fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    }

    /**
     * Initiate simulated demo STK push
     */
    async initiateDemoPayment(params = {}) {
      const headers = {};
      if (params.idempotencyKey) {
        headers['Idempotency-Key'] = params.idempotencyKey;
      }
      return this._fetch('/api/payments/demo/initiate', {
        method: 'POST',
        headers,
        body: JSON.stringify(params)
      });
    }

    /* ==========================================================================
     * Phase 6.3: Optical & Clinical Prescriptions / Review Methods
     * ========================================================================== */

    /**
     * List authenticated customer's prescriptions
     */
    async getPrescriptions() {
      return this._fetch('/api/prescriptions', { method: 'GET' });
    }

    /**
     * Get specific prescription details (with IDOR protection)
     */
    async getPrescription(prescriptionId) {
      return this._fetch(`/api/prescriptions/${encodeURIComponent(prescriptionId)}`, { method: 'GET' });
    }

    /**
     * Create a new prescription draft or auto-submitted record
     */
    async createPrescription(rxData = {}) {
      return this._fetch('/api/prescriptions', {
        method: 'POST',
        body: JSON.stringify(rxData)
      });
    }

    /**
     * Submit draft prescription to Optometrist Review Queue
     */
    async submitPrescription(prescriptionId) {
      return this._fetch(`/api/prescriptions/${encodeURIComponent(prescriptionId)}/submit`, {
        method: 'POST',
        body: JSON.stringify({})
      });
    }

    /**
     * Respond to optometrist clarification (creates Revision N + 1)
     */
    async respondToClarification(prescriptionId, values, patientNote = null) {
      return this._fetch(`/api/prescriptions/${encodeURIComponent(prescriptionId)}/clarification`, {
        method: 'POST',
        body: JSON.stringify({ values, patientNote })
      });
    }

    /**
     * Fetch Optometrist Clinical Review Queue (Optometrist / Admin role required)
     */
    async getOptometristReviewQueue(params = {}) {
      const query = new URLSearchParams(params).toString();
      const endpoint = `/api/optometrist/prescriptions${query ? '?' + query : ''}`;
      return this._fetch(endpoint, { method: 'GET' });
    }

    /**
     * Approve prescription (Optometrist / Admin role required)
     */
    async approvePrescription(prescriptionId, notes = '') {
      return this._fetch(`/api/optometrist/prescriptions/${encodeURIComponent(prescriptionId)}/approve`, {
        method: 'POST',
        body: JSON.stringify({ notes })
      });
    }

    /**
     * Reject prescription (Optometrist / Admin role required)
     */
    async rejectPrescription(prescriptionId, reason = '') {
      return this._fetch(`/api/optometrist/prescriptions/${encodeURIComponent(prescriptionId)}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason, notes: reason })
      });
    }

    /**
     * Request clinical clarification from customer (Optometrist / Admin role required)
     */
    async requestClarification(prescriptionId, notes = '') {
      return this._fetch(`/api/optometrist/prescriptions/${encodeURIComponent(prescriptionId)}/clarification`, {
        method: 'POST',
        body: JSON.stringify({ notes })
      });
    }

    /**
     * Check authoritative order fulfillment eligibility
     */
    async checkOrderFulfillmentEligibility(orderId) {
      return this._fetch(`/api/orders/${encodeURIComponent(orderId)}/fulfillment-eligibility`, {
        method: 'GET'
      });
    }

    /* ==========================================================================
     * Phase 6.4: Fulfillment, Inventory & Appointments Methods
     * ========================================================================== */

    /**
     * Get fulfillment details for an order
     */
    async getFulfillment(orderId) {
      return this._fetch(`/api/orders/${encodeURIComponent(orderId)}/fulfillment`, { method: 'GET' });
    }

    /**
     * Get tracking telemetry and event history for an order
     */
    async getOrderTracking(orderId) {
      return this._fetch(`/api/orders/${encodeURIComponent(orderId)}/tracking`, { method: 'GET' });
    }

    /**
     * Staff/Admin initialization of fulfillment
     */
    async createFulfillment(orderId, notes = '') {
      return this._fetch('/api/fulfillments', {
        method: 'POST',
        body: JSON.stringify({ orderId, notes })
      });
    }

    /**
     * Staff/Admin transition of fulfillment state
     */
    async transitionFulfillment(fulfillmentId, targetState, note = '') {
      return this._fetch(`/api/fulfillments/${encodeURIComponent(fulfillmentId)}/transition`, {
        method: 'POST',
        body: JSON.stringify({ targetState, note })
      });
    }

    /**
     * Query server-authoritative inventory metrics for a product SKU
     */
    async getInventory(sku) {
      return this._fetch(`/api/products/${encodeURIComponent(sku)}/inventory`, { method: 'GET' });
    }

    /**
     * Query available appointment slots
     */
    async getAppointmentAvailability(params = {}) {
      const query = new URLSearchParams(params).toString();
      const endpoint = `/api/appointments/availability${query ? '?' + query : ''}`;
      return this._fetch(endpoint, { method: 'GET' });
    }

    /**
     * Book appointment
     */
    async bookAppointment(bookingData = {}) {
      return this._fetch('/api/appointments', {
        method: 'POST',
        body: JSON.stringify(bookingData)
      });
    }

    /**
     * List authenticated customer's appointments
     */
    async getAppointments() {
      return this._fetch('/api/appointments', { method: 'GET' });
    }

    /**
     * Get specific appointment details (IDOR protected)
     */
    async getAppointment(appointmentId) {
      return this._fetch(`/api/appointments/${encodeURIComponent(appointmentId)}`, { method: 'GET' });
    }

    /**
     * Cancel an appointment and release its slot
     */
    async cancelAppointment(appointmentId, reason = '') {
      return this._fetch(`/api/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    }

    /**
     * Atomically reschedule an appointment to a new slot
     */
    async rescheduleAppointment(appointmentId, newSlotId) {
      return this._fetch(`/api/appointments/${encodeURIComponent(appointmentId)}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({ newSlotId })
      });
    }

    /* ============================================================
     * PHASE 6.6 EXTERNAL INTEGRATIONS (SANDBOX / READINESS)
     * ============================================================ */

    /**
     * Initiate production-ready M-PESA Daraja STK Push
     */
    async initiateDarajaStkPush({ orderId, phone, amount, currency = 'KES', idempotencyKey = null } = {}) {
      return this._fetch('/api/payments/daraja/stkpush', {
        method: 'POST',
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
        body: JSON.stringify({ orderId, phone, amount, currency })
      });
    }

    /**
     * Query status of an in-flight M-PESA Daraja STK Push
     */
    async queryDarajaPayment(checkoutRequestId) {
      return this._fetch('/api/payments/daraja/query', {
        method: 'POST',
        body: JSON.stringify({ checkoutRequestId })
      });
    }

    /**
     * Request a secure upload intent ticket for optical prescriptions/clinical files
     */
    async createStorageUploadIntent({ purpose = 'PRESCRIPTION', fileName, mimeType, fileSize } = {}) {
      return this._fetch('/api/storage/upload-intent', {
        method: 'POST',
        body: JSON.stringify({ purpose, fileName, mimeType, fileSize })
      });
    }

    /**
     * Confirm and record uploaded document
     */
    async confirmStorageUpload({ purpose = 'PRESCRIPTION', objectKey, fileName, mimeType, fileContentBase64 } = {}) {
      return this._fetch('/api/storage/confirm-upload', {
        method: 'POST',
        body: JSON.stringify({ purpose, objectKey, fileName, mimeType, fileContentBase64 })
      });
    }

    /**
     * Retrieve secure download ticket with IDOR validation
     */
    async getDocumentDownloadUrl(documentId) {
      return this._fetch(`/api/storage/documents/${encodeURIComponent(documentId)}/download`, {
        method: 'GET'
      });
    }

    /**
     * List customer's stored optical documents
     */
    async getStoredDocuments() {
      return this._fetch('/api/storage/documents', {
        method: 'GET'
      });
    }
  }

  // Export globally
  global.EyeKartApiAdapter = new EyeKartApiAdapter();

  // Attach to EyeKartStore if store is initialized
  if (global.EyeKartStore) {
    global.EyeKartStore.apiAdapter = global.EyeKartApiAdapter;
  }
})(typeof window !== 'undefined' ? window : global);
