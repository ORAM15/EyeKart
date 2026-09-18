/**
 * EyeKart Phase 8 WhatsApp Provider Abstraction
 * Designed for Meta / WhatsApp Business API.
 * Returns PROVIDER_DISABLED deterministically when credentials are not configured.
 */

const { NotificationProvider, NOTIFICATION_STATES, FAILURE_CATEGORIES } = require('./NotificationProvider');
const { normalizeKenyanPhone } = require('./phoneUtils');

class WhatsAppProvider extends NotificationProvider {
  constructor(options = {}) {
    super('WHATSAPP_PROVIDER');
    this.token = process.env.WHATSAPP_TOKEN || options.token || null;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || options.phoneNumberId || null;
    this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || options.businessAccountId || null;
  }

  isConfigured() {
    return Boolean(this.token && this.phoneNumberId);
  }

  async sendWhatsApp({ to, message, templateId = null, metadata = {} }) {
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
        error: 'WhatsApp Business credentials not configured. Live delivery disabled.',
        provider: this.name,
        normalizedRecipient: normalized.canonical
      };
    }

    try {
      throw new Error('Live external WhatsApp provider dispatch not activated');
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

  async sendSms() {
    throw new Error('WhatsAppProvider does not support SMS channel.');
  }

  async sendEmail() {
    throw new Error('WhatsAppProvider does not support Email channel.');
  }
}

module.exports = WhatsAppProvider;
