/**
 * EyeKart Phase 8 Email Provider Abstraction
 * Supports SMTP/API provider configuration via environment variables.
 * Gracefully returns PROVIDER_DISABLED when external credentials are unconfigured.
 */

const { NotificationProvider, NOTIFICATION_STATES, FAILURE_CATEGORIES } = require('./NotificationProvider');
const { isValidEmail } = require('./phoneUtils');

class EmailProvider extends NotificationProvider {
  constructor(options = {}) {
    super('EMAIL_PROVIDER');
    this.providerType = process.env.EMAIL_PROVIDER || options.provider || null;
    this.smtpHost = process.env.SMTP_HOST || options.host || null;
    this.smtpPort = process.env.SMTP_PORT || options.port || 587;
    this.smtpUser = process.env.SMTP_USER || options.user || null;
    this.senderAddress = process.env.SMTP_FROM || options.from || 'no-reply@eyekart.ke';
    this.senderName = process.env.SMTP_SENDER_NAME || options.senderName || 'EyeKart Healthcare';
  }

  isConfigured() {
    // Only considered configured if valid provider credentials exist
    return Boolean(this.smtpHost && this.smtpUser && process.env.SMTP_PASS);
  }

  async sendEmail({ to, subject, html, text, templateId = null, metadata = {} }) {
    if (!isValidEmail(to)) {
      return {
        success: false,
        status: NOTIFICATION_STATES.FAILED,
        failureCategory: FAILURE_CATEGORIES.INVALID_RECIPIENT,
        error: `Invalid recipient email address: '${to}'`,
        provider: this.name
      };
    }

    if (!this.isConfigured()) {
      return {
        success: false,
        status: NOTIFICATION_STATES.FAILED,
        failureCategory: FAILURE_CATEGORIES.PROVIDER_DISABLED,
        error: 'Email provider credentials not configured. Live delivery disabled.',
        provider: this.name
      };
    }

    // In production with credentials, dispatch via configured SMTP/API client here.
    // If external call throws, classify error and return standard structure:
    try {
      // Placeholder for live SMTP transport dispatch
      throw new Error('Live external email provider dispatch not activated');
    } catch (err) {
      const category = this.classifyError(err);
      return {
        success: false,
        status: NOTIFICATION_STATES.FAILED,
        failureCategory: category,
        error: err.message,
        provider: this.name
      };
    }
  }

  async sendSms() {
    throw new Error('EmailProvider does not support SMS channel.');
  }

  async sendWhatsApp() {
    throw new Error('EmailProvider does not support WhatsApp channel.');
  }
}

module.exports = EmailProvider;
