/**
 * EyeKart Phase 6.6 Safaricom Daraja 2.0 Client
 * Handles OAuth 2.0 authentication, STK Push dispatch, and STK status queries.
 *
 * SAFETY INVARIANTS:
 * - Defaults strictly to DISABLED when credentials are not configured.
 * - Routes only to Safaricom Sandbox (https://sandbox.safaricom.co.ke) unless LIVE is explicitly set.
 * - Never logs credentials, consumer secrets, passkeys, or auth tokens.
 * - Supports mock transport injection for offline/deterministic test execution.
 */

class DarajaClient {
  constructor(config = {}) {
    this.environment = (config.environment || process.env.MPESA_ENVIRONMENT || 'DISABLED').toUpperCase();
    this.consumerKey = config.consumerKey || process.env.MPESA_CONSUMER_KEY || '';
    this.consumerSecret = config.consumerSecret || process.env.MPESA_CONSUMER_SECRET || '';
    this.passkey = config.passkey || process.env.MPESA_PASSKEY || '';
    this.shortCode = config.shortCode || process.env.MPESA_SHORTCODE || '174379'; // Safaricom test shortcode
    this.callbackUrl = config.callbackUrl || process.env.MPESA_CALLBACK_URL || 'http://localhost:3001/api/webhooks/mpesa';
    this.timeoutMs = config.timeoutMs || 8000;
    this.mockTransport = config.mockTransport || null;

    // Token cache
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  get baseUrl() {
    if (this.environment === 'LIVE') {
      return 'https://api.safaricom.co.ke';
    }
    // Default to sandbox
    return 'https://sandbox.safaricom.co.ke';
  }

  get isConfigured() {
    return Boolean(
      this.environment !== 'DISABLED' &&
      this.consumerKey &&
      this.consumerSecret &&
      this.passkey
    );
  }

  /**
   * Format phone number to standard Safaricom format (254XXXXXXXXX)
   */
  static formatPhoneNumber(phone) {
    if (!phone) {
      const err = new Error('Phone number is required.');
      err.code = 'INVALID_PHONE_NUMBER';
      throw err;
    }
    const cleaned = String(phone).replace(/[^0-9]/g, '');
    let formatted = cleaned;
    if (cleaned.startsWith('254') && cleaned.length === 12) {
      formatted = cleaned;
    } else if (cleaned.startsWith('0') && cleaned.length === 10) {
      formatted = '254' + cleaned.slice(1);
    } else if (cleaned.length === 9) {
      formatted = '254' + cleaned;
    }
    if (!formatted.startsWith('254') || formatted.length !== 12) {
      const err = new Error(`Invalid Kenyan phone number format: '${phone}'. Must resolve to 254XXXXXXXXX.`);
      err.code = 'INVALID_PHONE_NUMBER';
      throw err;
    }
    return formatted;
  }

  /**
   * Format timestamp as YYYYMMDDHHmmss
   */
  static getTimestamp(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}${m}${d}${h}${min}${s}`;
  }

  /**
   * Generate STK password: Base64(Shortcode + Passkey + Timestamp)
   */
  generatePassword(timestamp) {
    const raw = `${this.shortCode}${this.passkey}${timestamp}`;
    return Buffer.from(raw).toString('base64');
  }

  /**
   * Fetch or return cached OAuth access token
   */
  async getAccessToken() {
    if (this.environment === 'DISABLED') {
      const err = new Error('M-PESA Daraja integration is DISABLED. Configure MPESA_ENVIRONMENT=SANDBOX and provide valid credentials.');
      err.code = 'DARAJA_DISABLED';
      err.statusCode = 503;
      throw err;
    }

    if (!this.consumerKey || !this.consumerSecret) {
      const err = new Error('M-PESA Daraja consumer key or secret is missing.');
      err.code = 'DARAJA_CREDENTIALS_MISSING';
      err.statusCode = 503;
      throw err;
    }

    // Return cached token if valid (with 60-second buffer)
    const now = Date.now();
    if (this.cachedToken && this.tokenExpiresAt > now + 60000) {
      return this.cachedToken;
    }

    // If mock transport is injected, use it
    if (this.mockTransport && typeof this.mockTransport.getAccessToken === 'function') {
      const mockResult = await this.mockTransport.getAccessToken();
      this.cachedToken = mockResult.access_token;
      this.tokenExpiresAt = now + ((mockResult.expires_in || 3599) * 1000);
      return this.cachedToken;
    }

    const authHeader = 'Basic ' + Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    const url = `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json'
        },
        signal: controller.signal
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        const err = new Error(`Daraja OAuth token request failed with HTTP ${res.status}`);
        err.code = 'DARAJA_AUTH_FAILED';
        err.statusCode = res.status;
        err.details = errorText;
        throw err;
      }

      const data = await res.json();
      this.cachedToken = data.access_token;
      this.tokenExpiresAt = now + ((parseInt(data.expires_in, 10) || 3599) * 1000);
      return this.cachedToken;
    } catch (e) {
      if (e.name === 'AbortError') {
        const timeoutErr = new Error('Daraja OAuth request timed out after ' + this.timeoutMs + 'ms');
        timeoutErr.code = 'DARAJA_TIMEOUT';
        timeoutErr.statusCode = 504;
        throw timeoutErr;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Initiate STK Push (Lipa Na M-PESA Online)
   */
  async initiateStkPush({ phone, amount, accountReference, transactionDesc = 'EyeKart Purchase' }) {
    if (this.environment === 'DISABLED') {
      const err = new Error('M-PESA Daraja integration is currently disabled.');
      err.code = 'DARAJA_DISABLED';
      err.statusCode = 503;
      throw err;
    }

    const formattedPhone = DarajaClient.formatPhoneNumber(phone);
    if (!formattedPhone || formattedPhone.length !== 12) {
      const err = new Error(`Invalid Kenyan phone number format: '${phone}'. Must resolve to 254XXXXXXXXX.`);
      err.code = 'INVALID_PHONE_NUMBER';
      err.statusCode = 400;
      throw err;
    }

    const numericAmount = Math.round(Number(amount));
    if (isNaN(numericAmount) || numericAmount <= 0) {
      const err = new Error(`Invalid STK Push amount: '${amount}'. Amount must be a positive integer.`);
      err.code = 'INVALID_AMOUNT';
      err.statusCode = 400;
      throw err;
    }

    // If mock transport provided, use it
    if (this.mockTransport && typeof this.mockTransport.initiateStkPush === 'function') {
      return this.mockTransport.initiateStkPush({
        phone: formattedPhone,
        amount: numericAmount,
        accountReference,
        transactionDesc
      });
    }

    const token = await this.getAccessToken();
    const timestamp = DarajaClient.getTimestamp();
    const password = this.generatePassword(timestamp);

    const payload = {
      BusinessShortCode: this.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: numericAmount,
      PartyA: formattedPhone,
      PartyB: this.shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: this.callbackUrl,
      AccountReference: String(accountReference || 'EyeKart').slice(0, 12),
      TransactionDesc: String(transactionDesc).slice(0, 100)
    };

    const url = `${this.baseUrl}/mpesa/stkpush/v1/processrequest`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(body.errorMessage || `Daraja STK Push failed with HTTP ${res.status}`);
        err.code = body.errorCode || 'DARAJA_STK_FAILED';
        err.statusCode = res.status;
        err.responseBody = body;
        throw err;
      }

      return {
        merchantRequestId: body.MerchantRequestID,
        checkoutRequestId: body.CheckoutRequestID,
        responseCode: body.ResponseCode,
        responseDescription: body.ResponseDescription,
        customerMessage: body.CustomerMessage
      };
    } catch (e) {
      if (e.name === 'AbortError') {
        const timeoutErr = new Error(`Daraja STK push timed out after ${this.timeoutMs}ms`);
        timeoutErr.code = 'DARAJA_TIMEOUT';
        timeoutErr.statusCode = 504;
        throw timeoutErr;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Query STK Push status
   */
  async queryStkPush({ checkoutRequestId }) {
    if (this.environment === 'DISABLED') {
      const err = new Error('M-PESA Daraja integration is currently disabled.');
      err.code = 'DARAJA_DISABLED';
      err.statusCode = 503;
      throw err;
    }

    if (!checkoutRequestId) {
      const err = new Error('checkoutRequestId is required for STK query.');
      err.code = 'MISSING_CHECKOUT_ID';
      err.statusCode = 400;
      throw err;
    }

    if (this.mockTransport && typeof this.mockTransport.queryStkPush === 'function') {
      return this.mockTransport.queryStkPush({ checkoutRequestId });
    }

    const token = await this.getAccessToken();
    const timestamp = DarajaClient.getTimestamp();
    const password = this.generatePassword(timestamp);

    const payload = {
      BusinessShortCode: this.shortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    };

    const url = `${this.baseUrl}/mpesa/stkpushquery/v1/query`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const body = await res.json().catch(() => ({}));
      return {
        responseCode: body.ResponseCode,
        responseDescription: body.ResponseDescription,
        merchantRequestId: body.MerchantRequestID,
        checkoutRequestId: body.CheckoutRequestID,
        resultCode: body.ResultCode,
        resultDesc: body.ResultDesc
      };
    } catch (e) {
      if (e.name === 'AbortError') {
        const timeoutErr = new Error(`Daraja STK query timed out after ${this.timeoutMs}ms`);
        timeoutErr.code = 'DARAJA_TIMEOUT';
        timeoutErr.statusCode = 504;
        throw timeoutErr;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = DarajaClient;
