/**
 * EyeKart Phase 6.6 Test Notification Provider
 * Captures outgoing SMS and Email messages in memory for test assertions
 * without dispatching any live external network traffic.
 */
const crypto = require('crypto');
const NotificationProvider = require('./NotificationProvider');

class TestNotificationProvider extends NotificationProvider {
  constructor() {
    super('TEST_NOTIFICATION_PROVIDER');
    this.sentSms = [];
    this.sentEmails = [];
  }

  /**
   * Record simulated SMS dispatch
   */
  async sendSms({ to, message, templateId = null, metadata = {} }) {
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
    console.info(`[Notification Simulation] SMS captured for '${to}': "${message.slice(0, 80)}..."`);
    return {
      success: true,
      messageId: record.id,
      status: 'CAPTURED'
    };
  }

  /**
   * Record simulated Email dispatch
   */
  async sendEmail({ to, subject, html, text, templateId = null, metadata = {} }) {
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
    console.info(`[Notification Simulation] Email captured for '${to}': "${subject}"`);
    return {
      success: true,
      messageId: record.id,
      status: 'CAPTURED'
    };
  }

  getSentSms() {
    return [...this.sentSms];
  }

  getSentEmails() {
    return [...this.sentEmails];
  }

  findSmsByPhone(phone) {
    const clean = String(phone).replace(/[^0-9]/g, '');
    return this.sentSms.filter(s => String(s.to).replace(/[^0-9]/g, '').includes(clean));
  }

  findEmailByRecipient(recipient) {
    const clean = String(recipient).toLowerCase().trim();
    return this.sentEmails.filter(e => String(e.to).toLowerCase().includes(clean));
  }

  clear() {
    this.sentSms = [];
    this.sentEmails = [];
  }
}

module.exports = TestNotificationProvider;
