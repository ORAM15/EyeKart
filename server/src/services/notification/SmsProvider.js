/**
 * EyeKart Phase 8 SMS Provider Abstraction
 * Supports Kenyan phone number normalization (+254 / 254XXXXXXXXX).
 * Returns PROVIDER_DISABLED gracefully when external telecom credentials are not configured.
 */

const { NotificationProvider, NOTIFICATION_STATES, FAILURE_CATEGORIES } = require('./NotificationProvider');
const { normalizeKenyanPhone } = require('./phoneUtils');

class SmsProvider extends NotificationProvider {
  constructor(options = {}) {
    super('SMS_PROVIDER');
    this.providerType = process.env.SMS_PROVIDER || options.provider || null;
    this.senderId = process.env.SMS_SENDER_ID || options.senderId || 'EyeKart';
  }

  isConfigured() {
    return Boolean(
      process.env.SMS_API_KEY ||
      (process.env.AFRICASTALKING_API_KEY && process.env.AFRICASTALKING_USERNAME)
    );
  }

  async sendSms({ to, message, templateId = null, metadata = {} }) {
    let normalized;
    try {
      normalized = normalizeKenyanPhone(to);
    } catch (err) {
      return {
        success: false,
        status: NOTIFICATION_STATES.FAILED,
        failureCategory: FAILURE_CATEGORIES.INVALID_RECIPIENT,
        error: err.message,
        provider: this.name
      };
    }

    if (!this.isConfigured()) {
      return {
        success: false,
        status: NOTIFICATION_STATES.FAILED,
        failureCategory: FAILURE_CATEGORIES.PROVIDER_DISABLED,
        error: 'SMS provider credentials not configured. Live delivery disabled.',
        provider: this.name,
        normalizedRecipient: normalized.canonical
      };
    }

    try {
      throw new Error('Live external SMS provider dispatch not activated');
    } catch (err) {
      const category = this.classifyError(err);
      return {
        success: false,
        status: NOTIFICATION_STATES.FAILED,
        failureCategory: category,
        error: err.message,
        provider: this.name,
        normalizedRecipient: normalized.canonical
      };
    }
  }

  async sendEmail() {
    throw new Error('SmsProvider does not support Email channel.');
  }

  async sendWhatsApp() {
    throw new Error('SmsProvider does not support WhatsApp channel.');
  }
}

module.exports = SmsProvider;
