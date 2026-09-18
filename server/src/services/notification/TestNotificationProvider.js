/**
 * EyeKart Phase 8 Test Notification Provider
 * Captures outgoing SMS, Email, and WhatsApp messages in memory for test assertions
 * without dispatching any live external network traffic.
 * Supports controllable simulation of transient and permanent provider failures.
 */
const crypto = require('crypto');
const {
  NotificationProvider,
  NOTIFICATION_STATES,
  FAILURE_CATEGORIES
} = require('./NotificationProvider');

class TestNotificationProvider extends NotificationProvider {
  constructor() {
    super('TEST_NOTIFICATION_PROVIDER');
    this.sentSms = [];
    this.sentEmails = [];
    this.sentWhatsApp = [];
    this.simulatedFailures = [];
  }

  /**
   * Configure simulated failures for deterministic testing
   */
  simulateFailure({
    channel = null,
    category = FAILURE_CATEGORIES.TEMPORARY_PROVIDER_ERROR,
    error = 'Simulated provider error',
    remainingCount = 1,
    predicate = null
  } = {}) {
    this.simulatedFailures.push({ channel, category, error, remainingCount, predicate });
  }

  clearSimulatedFailures() {
    this.simulatedFailures = [];
  }

  _checkSimulatedFailure(channel, params) {
    for (let i = 0; i < this.simulatedFailures.length; i++) {
      const f = this.simulatedFailures[i];
      if (!f.channel || f.channel === channel) {
        if (!f.predicate || f.predicate(params)) {
          if (f.remainingCount > 0) {
            f.remainingCount--;
            if (f.remainingCount === 0) {
              this.simulatedFailures.splice(i, 1);
            }
            return {
              success: false,
              status: NOTIFICATION_STATES.FAILED,
              failureCategory: f.category,
              error: f.error,
              provider: this.name
            };
          }
        }
      }
    }
    return null;
  }

  /**
   * Record simulated SMS dispatch
   */
  async sendSms({ to, message, templateId = null, metadata = {} }) {
    const failure = this._checkSimulatedFailure('SMS', { to, message, templateId, metadata });
    if (failure) return failure;

    const record = {
      id: 'sms-' + crypto.randomUUID(),
      to,
      message,
      templateId,
      metadata,
      sentAt: new Date().toISOString(),
      provider: this.name,
      status: 'CAPTURED_INTERNALLY'
    };
    this.sentSms.push(record);
    return {
      success: true,
      messageId: record.id,
      status: NOTIFICATION_STATES.SENT
    };
  }

  /**
   * Record simulated Email dispatch
   */
  async sendEmail({ to, subject, html, text, templateId = null, metadata = {} }) {
    const failure = this._checkSimulatedFailure('EMAIL', { to, subject, html, text, templateId, metadata });
    if (failure) return failure;

    const record = {
      id: 'email-' + crypto.randomUUID(),
      to,
      subject,
      html,
      text: text || html,
      templateId,
      metadata,
      sentAt: new Date().toISOString(),
      provider: this.name,
      status: 'CAPTURED_INTERNALLY'
    };
    this.sentEmails.push(record);
    return {
      success: true,
      messageId: record.id,
      status: NOTIFICATION_STATES.SENT
    };
  }

  /**
   * Record simulated WhatsApp dispatch
   */
  async sendWhatsApp({ to, message, templateId = null, metadata = {} }) {
    const failure = this._checkSimulatedFailure('WHATSAPP', { to, message, templateId, metadata });
    if (failure) return failure;

    const record = {
      id: 'wa-' + crypto.randomUUID(),
      to,
      message,
      templateId,
      metadata,
      sentAt: new Date().toISOString(),
      provider: this.name,
      status: 'CAPTURED_INTERNALLY'
    };
    this.sentWhatsApp.push(record);
    return {
      success: true,
      messageId: record.id,
      status: NOTIFICATION_STATES.SENT
    };
  }

  getSentSms() {
    return [...this.sentSms];
  }

  getSentEmails() {
    return [...this.sentEmails];
  }

  getSentWhatsApp() {
    return [...this.sentWhatsApp];
  }

  findSmsByPhone(phone) {
    const clean = String(phone).replace(/[^0-9]/g, '');
    return this.sentSms.filter(s => String(s.to).replace(/[^0-9]/g, '').includes(clean));
  }

  findEmailByRecipient(recipient) {
    const clean = String(recipient).toLowerCase().trim();
    return this.sentEmails.filter(e => String(e.to).toLowerCase().includes(clean));
  }

  findWhatsAppByPhone(phone) {
    const clean = String(phone).replace(/[^0-9]/g, '');
    return this.sentWhatsApp.filter(w => String(w.to).replace(/[^0-9]/g, '').includes(clean));
  }

  clear() {
    this.sentSms = [];
    this.sentEmails = [];
    this.sentWhatsApp = [];
    this.simulatedFailures = [];
  }
}

module.exports = TestNotificationProvider;
