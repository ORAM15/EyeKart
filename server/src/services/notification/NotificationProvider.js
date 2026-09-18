/**
 * EyeKart Phase 8 Notification Provider Base Interface
 * Defines abstract contract and failure classification for multi-channel
 * customer and operational communications (Email, SMS, WhatsApp).
 */

const CHANNELS = Object.freeze({
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP'
});

const NOTIFICATION_STATES = Object.freeze({
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
});

const LEGAL_NOTIFICATION_TRANSITIONS = Object.freeze({
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SENT', 'FAILED', 'CANCELLED'],
  FAILED: ['PROCESSING', 'CANCELLED'], // Retries transition from FAILED back to PROCESSING
  SENT: [],      // Terminal
  CANCELLED: []  // Terminal
});

const FAILURE_CATEGORIES = Object.freeze({
  PROVIDER_DISABLED: 'PROVIDER_DISABLED',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_REJECTED: 'PROVIDER_REJECTED',
  INVALID_RECIPIENT: 'INVALID_RECIPIENT',
  RATE_LIMITED: 'RATE_LIMITED',
  TEMPORARY_PROVIDER_ERROR: 'TEMPORARY_PROVIDER_ERROR',
  PERMANENT_PROVIDER_ERROR: 'PERMANENT_PROVIDER_ERROR'
});

const RETRYABLE_FAILURE_CATEGORIES = Object.freeze([
  FAILURE_CATEGORIES.PROVIDER_TIMEOUT,
  FAILURE_CATEGORIES.RATE_LIMITED,
  FAILURE_CATEGORIES.TEMPORARY_PROVIDER_ERROR
]);

class NotificationProvider {
  constructor(name = 'BASE_NOTIFICATION_PROVIDER') {
    this.name = name;
  }

  static isValidTransition(fromState, toState) {
    if (fromState === toState) return true;
    const allowed = LEGAL_NOTIFICATION_TRANSITIONS[fromState] || [];
    return allowed.includes(toState);
  }

  static isRetryable(failureCategory) {
    return RETRYABLE_FAILURE_CATEGORIES.includes(failureCategory);
  }

  /**
   * Universal dispatch method
   */
  async send({ channel, to, subject, message, html, text, templateId = null, metadata = {} }) {
    switch (channel) {
      case CHANNELS.EMAIL:
        return this.sendEmail({ to, subject, html, text, templateId, metadata });
      case CHANNELS.SMS:
        return this.sendSms({ to, message, templateId, metadata });
      case CHANNELS.WHATSAPP:
        return this.sendWhatsApp({ to, message, templateId, metadata });
      default:
        throw new Error(`Unsupported notification channel: '${channel}'`);
    }
  }

  async sendSms({ to, message, templateId = null, metadata = {} }) {
    throw new Error(`sendSms() must be implemented by ${this.constructor.name}`);
  }

  async sendEmail({ to, subject, html, text, templateId = null, metadata = {} }) {
    throw new Error(`sendEmail() must be implemented by ${this.constructor.name}`);
  }

  async sendWhatsApp({ to, message, templateId = null, metadata = {} }) {
    throw new Error(`sendWhatsApp() must be implemented by ${this.constructor.name}`);
  }

  /**
   * Classify arbitrary provider error into deterministic standard category
   */
  classifyError(err) {
    if (!err) return FAILURE_CATEGORIES.PERMANENT_PROVIDER_ERROR;
    const code = err.code || err.statusCode || '';
    const msg = String(err.message || '').toUpperCase();

    if (code === 'PROVIDER_DISABLED' || msg.includes('DISABLED') || msg.includes('NOT CONFIGURED')) {
      return FAILURE_CATEGORIES.PROVIDER_DISABLED;
    }
    if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || msg.includes('TIMEOUT')) {
      return FAILURE_CATEGORIES.PROVIDER_TIMEOUT;
    }
    if (code === 'INVALID_RECIPIENT' || msg.includes('RECIPIENT') || msg.includes('PHONE NUMBER') || msg.includes('EMAIL FORMAT')) {
      return FAILURE_CATEGORIES.INVALID_RECIPIENT;
    }
    if (code === 429 || msg.includes('RATE LIMIT') || msg.includes('THROTTLED')) {
      return FAILURE_CATEGORIES.RATE_LIMITED;
    }
    if (code === 401 || code === 403 || msg.includes('REJECTED') || msg.includes('CREDENTIALS')) {
      return FAILURE_CATEGORIES.PROVIDER_REJECTED;
    }
    if (code >= 500 && code < 600) {
      return FAILURE_CATEGORIES.TEMPORARY_PROVIDER_ERROR;
    }
    return FAILURE_CATEGORIES.PERMANENT_PROVIDER_ERROR;
  }
}

NotificationProvider.NotificationProvider = NotificationProvider;
NotificationProvider.CHANNELS = CHANNELS;
NotificationProvider.NOTIFICATION_STATES = NOTIFICATION_STATES;
NotificationProvider.LEGAL_NOTIFICATION_TRANSITIONS = LEGAL_NOTIFICATION_TRANSITIONS;
NotificationProvider.FAILURE_CATEGORIES = FAILURE_CATEGORIES;
NotificationProvider.RETRYABLE_FAILURE_CATEGORIES = RETRYABLE_FAILURE_CATEGORIES;

module.exports = NotificationProvider;
