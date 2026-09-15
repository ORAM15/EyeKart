/**
 * EyeKart Phase 6.6 Notification Provider Base Interface
 * Defines abstract contract for multi-channel customer communications (SMS, Email).
 */

class NotificationProvider {
  constructor(name) {
    this.name = name;
  }

  async sendSms({ to, message, templateId = null, metadata = {} }) {
    throw new Error(`sendSms() must be implemented by ${this.constructor.name}`);
  }

  async sendEmail({ to, subject, html, text, templateId = null, metadata = {} }) {
    throw new Error(`sendEmail() must be implemented by ${this.constructor.name}`);
  }
}

module.exports = NotificationProvider;
