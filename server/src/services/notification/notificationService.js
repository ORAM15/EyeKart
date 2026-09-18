/**
 * EyeKart Phase 8 Notification Service
 * High-level coordinator for transactional outbox persistence, deterministic delivery state machine,
 * provider-agnostic dispatch, idempotency, bounded retry policies, and healthcare privacy controls.
 */

const { query, getPool } = require('../../db/pool');
const { logAuditEvent } = require('../auditService');
const {
  NotificationProvider,
  CHANNELS,
  NOTIFICATION_STATES,
  LEGAL_NOTIFICATION_TRANSITIONS,
  FAILURE_CATEGORIES
} = require('./NotificationProvider');
const TestNotificationProvider = require('./TestNotificationProvider');
const EmailProvider = require('./EmailProvider');
const SmsProvider = require('./SmsProvider');
const WhatsAppProvider = require('./WhatsAppProvider');
const {
  TEMPLATE_IDS,
  MANDATORY_TEMPLATES,
  MARKETING_TEMPLATES,
  isMandatoryTemplate,
  isMarketingTemplate,
  renderTemplate,
  sanitizePayload
} = require('./notificationTemplates');
const { normalizeKenyanPhone, isValidEmail } = require('./phoneUtils');

// Default active providers
const defaultTestProvider = new TestNotificationProvider();
const defaultEmailProvider = new EmailProvider();
const defaultSmsProvider = new SmsProvider();
const defaultWhatsAppProvider = new WhatsAppProvider();

class NotificationService {
  constructor() {
    this.testProvider = defaultTestProvider;
    this.emailProvider = defaultEmailProvider;
    this.smsProvider = defaultSmsProvider;
    this.whatsAppProvider = defaultWhatsAppProvider;
    this.useTestProvider = true; // By default, use deterministic TestProvider to avoid unconfigured network traffic
  }

  get activeProvider() {
    return this.testProvider;
  }

  setProvider(newProvider) {
    if (newProvider instanceof TestNotificationProvider) {
      this.testProvider = newProvider;
      this.useTestProvider = true;
    } else {
      this.testProvider = newProvider;
      this.useTestProvider = false;
    }
  }

  setUseTestProvider(flag) {
    this.useTestProvider = Boolean(flag);
  }

  getProviderForChannel(channel) {
    if (this.useTestProvider) {
      return this.testProvider;
    }
    switch (channel) {
      case CHANNELS.EMAIL:
        return this.emailProvider;
      case CHANNELS.SMS:
        return this.smsProvider;
      case CHANNELS.WHATSAPP:
        return this.whatsAppProvider;
      default:
        return this.testProvider;
    }
  }

  /**
   * Validate channel and recipient
   */
  validateRecipientAndChannel(channel, recipient) {
    if (!channel || !Object.values(CHANNELS).includes(channel)) {
      const err = new Error(`Invalid or unsupported notification channel: '${channel}'. Allowed: ${Object.values(CHANNELS).join(', ')}`);
      err.code = 'INVALID_CHANNEL';
      err.statusCode = 400;
      throw err;
    }

    if (!recipient || typeof recipient !== 'string' || recipient.trim() === '') {
      const err = new Error('Recipient identity (email or phone) is required.');
      err.code = 'INVALID_RECIPIENT';
      err.statusCode = 400;
      throw err;
    }

    const clean = recipient.trim();
    if (channel === CHANNELS.EMAIL) {
      if (!isValidEmail(clean)) {
        const err = new Error(`Invalid email recipient format: '${clean}'.`);
        err.code = 'INVALID_RECIPIENT';
        err.statusCode = 400;
        throw err;
      }
      return clean.toLowerCase();
    } else {
      try {
        const norm = normalizeKenyanPhone(clean);
        return norm.canonical;
      } catch (normErr) {
        const err = new Error(`Invalid Kenyan phone recipient format: '${clean}'.`);
        err.code = 'INVALID_RECIPIENT';
        err.statusCode = 400;
        throw err;
      }
    }
  }

  /**
   * Derive deterministic idempotency key
   */
  generateIdempotencyKey({ eventType, resourceId, channel, recipient }) {
    const resId = resourceId || 'global';
    return `${eventType}:${resId}:${channel}:${recipient}`;
  }

  /**
   * Check if user preferences allow this notification.
   *
   * CRITICAL TAXONOMY RULES:
   * 1. Mandatory transactional / clinical / security notifications can NEVER be suppressed.
   * 2. Non-marketing transactional notifications (even if not explicitly mandatory)
   *    cannot be suppressed by marketing preferences.
   * 3. Only optional marketing notifications are subject to marketing preferences.
   */
  async checkUserPreferences(userId, channel, templateId) {
    if (!userId) return true;

    // 1. Mandatory templates are always allowed
    if (isMandatoryTemplate(templateId)) {
      return true;
    }

    // 2. Non-marketing (transactional) notifications are NEVER suppressed by marketing preferences
    const isMarketing = isMarketingTemplate(templateId);
    if (!isMarketing) {
      return true;
    }

    // 3. For marketing communications, evaluate user's marketing preferences
    try {
      const prefRes = await query(
        `SELECT * FROM notification_preferences WHERE user_id = $1`,
        [userId]
      );
      if (prefRes.rows.length === 0) {
        // Marketing is strictly opt-in by default
        return false;
      }
      const prefs = prefRes.rows[0];

      if (channel === CHANNELS.EMAIL) {
        return Boolean(prefs.marketing_email);
      }
      if (channel === CHANNELS.SMS) {
        return Boolean(prefs.marketing_sms);
      }
      return true;
    } catch {
      return false; // Fail closed for marketing communications if DB read fails
    }
  }

  /**
   * Enqueue notification inside an existing database transaction (Transactional Outbox)
   */
  async enqueueOutbox({
    client,
    userId = null,
    recipient,
    channel,
    templateId,
    payload = {},
    resourceId = null,
    idempotencyKey = null
  }) {
    const validRecipient = this.validateRecipientAndChannel(channel, recipient);
    const rendered = renderTemplate(templateId, payload);
    const idempKey = idempotencyKey || this.generateIdempotencyKey({
      eventType: templateId,
      resourceId,
      channel,
      recipient: validRecipient
    });

    const provider = this.getProviderForChannel(channel);

    // Check if notification already exists for this idempotency key
    const existingRes = await client.query(
      `SELECT * FROM notifications WHERE idempotency_key = $1`,
      [idempKey]
    );

    if (existingRes.rows.length > 0) {
      return {
        idempotentHit: true,
        notification: existingRes.rows[0]
      };
    }

    // Insert into notifications
    const insertNotifSql = `
      INSERT INTO notifications (
        user_id, recipient, channel, event_type, template_id,
        payload, status, provider, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const notifRes = await client.query(insertNotifSql, [
      userId,
      validRecipient,
      channel,
      templateId,
      templateId,
      JSON.stringify(rendered.payload),
      NOTIFICATION_STATES.PENDING,
      provider.name,
      idempKey
    ]);

    const notif = notifRes.rows[0];

    // Insert into outbox table
    await client.query(
      `INSERT INTO notification_outbox (notification_id, status, event_type)
       VALUES ($1, $2, $3)`,
      [notif.id, NOTIFICATION_STATES.PENDING, templateId]
    );

    return {
      idempotentHit: false,
      notification: notif
    };
  }

  /**
   * Direct transactional dispatch (used when an outbox event is processed or direct dispatch requested)
   */
  async sendTransactionalNotification({
    userId = null,
    recipient,
    channel,
    templateId,
    payload = {},
    resourceId = null,
    idempotencyKey = null,
    ipAddress = null
  }) {
    const validRecipient = this.validateRecipientAndChannel(channel, recipient);
    const rendered = renderTemplate(templateId, payload);
    const idempKey = idempotencyKey || this.generateIdempotencyKey({
      eventType: templateId,
      resourceId,
      channel,
      recipient: validRecipient
    });

    // Check preferences
    const allowed = await this.checkUserPreferences(userId, channel, templateId);
    if (!allowed) {
      return {
        success: false,
        cancelled: true,
        optedOut: true,
        status: NOTIFICATION_STATES.CANCELLED,
        reason: 'USER_PREFERENCE_SUPPRESSED'
      };
    }

    // Atomic idempotency check in notifications table
    const existing = await query(
      `SELECT * FROM notifications WHERE idempotency_key = $1`,
      [idempKey]
    );

    let notification;
    if (existing.rows.length > 0) {
      notification = existing.rows[0];
      if (notification.status === NOTIFICATION_STATES.SENT) {
        return {
          success: true,
          idempotentHit: true,
          notification
        };
      }
      if (notification.status === NOTIFICATION_STATES.PROCESSING) {
        return {
          success: false,
          status: NOTIFICATION_STATES.PROCESSING,
          idempotentHit: true,
          notification
        };
      }
    } else {
      const provider = this.getProviderForChannel(channel);
      const insertRes = await query(
        `INSERT INTO notifications (
          user_id, recipient, channel, event_type, template_id,
          payload, status, provider, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [
          userId,
          validRecipient,
          channel,
          templateId,
          templateId,
          JSON.stringify(rendered.payload),
          NOTIFICATION_STATES.PENDING,
          provider.name,
          idempKey
        ]
      );
      notification = insertRes.rows[0];
    }

    // Transition to PROCESSING
    await query(
      `UPDATE notifications
       SET status = $1, attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [NOTIFICATION_STATES.PROCESSING, notification.id]
    );

    // Dispatch to provider
    const provider = this.getProviderForChannel(channel);
    let result;
    try {
      if (channel === CHANNELS.EMAIL) {
        result = await provider.sendEmail({
          to: validRecipient,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          templateId,
          metadata: { notificationId: notification.id, resourceId }
        });
      } else if (channel === CHANNELS.SMS) {
        result = await provider.sendSms({
          to: validRecipient,
          message: rendered.text,
          templateId,
          metadata: { notificationId: notification.id, resourceId }
        });
      } else if (channel === CHANNELS.WHATSAPP) {
        result = await provider.sendWhatsApp({
          to: validRecipient,
          message: rendered.text,
          templateId,
          metadata: { notificationId: notification.id, resourceId }
        });
      }
    } catch (err) {
      const cat = provider.classifyError(err);
      result = {
        success: false,
        status: NOTIFICATION_STATES.FAILED,
        failureCategory: cat,
        error: err.message
      };
    }

    const currentAttempt = (notification.attempt_count || 0) + 1;
    const maxAttempts = notification.max_attempts || 3;

    if (result && result.success) {
      // SENT terminal state
      const updatedRes = await query(
        `UPDATE notifications
         SET status = $1, provider_message_id = $2, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [NOTIFICATION_STATES.SENT, result.messageId || null, notification.id]
      );

      await logAuditEvent({
        actorId: userId,
        actorRole: 'SYSTEM',
        ipAddress,
        action: 'NOTIFICATION_SENT',
        entity: 'Notification',
        entityId: notification.id,
        metadata: {
          channel,
          templateId,
          recipient: validRecipient,
          provider: provider.name
        }
      });

      return {
        success: true,
        status: NOTIFICATION_STATES.SENT,
        notification: updatedRes.rows[0]
      };
    } else {
      // FAILED state
      const failureCat = result?.failureCategory || FAILURE_CATEGORIES.PERMANENT_PROVIDER_ERROR;
      const isRetryable = NotificationProvider.isRetryable(failureCat) && currentAttempt < maxAttempts;
      const nextRetry = isRetryable ? new Date(Date.now() + Math.pow(2, currentAttempt) * 1000) : null;

      const updatedRes = await query(
        `UPDATE notifications
         SET status = $1, error_details = $2, next_retry_at = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING *`,
        [
          NOTIFICATION_STATES.FAILED,
          JSON.stringify({
            failureCategory: failureCat,
            error: result?.error || 'Provider dispatch failed',
            attempt: currentAttempt
          }),
          nextRetry,
          notification.id
        ]
      );

      await logAuditEvent({
        actorId: userId,
        actorRole: 'SYSTEM',
        ipAddress,
        action: 'NOTIFICATION_FAILED',
        entity: 'Notification',
        entityId: notification.id,
        metadata: {
          channel,
          templateId,
          failureCategory: failureCat,
          attempt: currentAttempt,
          isRetryable,
          nextRetry
        }
      });

      return {
        success: false,
        status: NOTIFICATION_STATES.FAILED,
        failureCategory: failureCat,
        isRetryable,
        notification: updatedRes.rows[0]
      };
    }
  }

  /**
   * Process pending records in the notification outbox
   */
  async processOutbox(batchLimit = 20) {
    const pool = getPool();
    const client = await pool.connect();
    const processed = [];

    try {
      await client.query('BEGIN');

      const outboxRes = await client.query(
        `SELECT o.id as outbox_id, o.retry_count, n.*
         FROM notification_outbox o
         JOIN notifications n ON o.notification_id = n.id
         WHERE o.status = 'PENDING'
         ORDER BY o.created_at ASC
         LIMIT $1
         FOR UPDATE OF o SKIP LOCKED`,
        [batchLimit]
      );

      for (const row of outboxRes.rows) {
        // Mark outbox row PROCESSING
        await client.query(
          `UPDATE notification_outbox SET status = 'PROCESSING' WHERE id = $1`,
          [row.outbox_id]
        );

        // Dispatch outside the outbox transaction to avoid blocking DB during network calls
        const dispatchRes = await this.sendTransactionalNotification({
          userId: row.user_id,
          recipient: row.recipient,
          channel: row.channel,
          templateId: row.template_id,
          payload: row.payload,
          idempotencyKey: row.idempotency_key
        });

        if (dispatchRes.success) {
          await client.query(
            `UPDATE notification_outbox SET status = 'COMPLETED', processed_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [row.outbox_id]
          );
        } else {
          await client.query(
            `UPDATE notification_outbox
             SET status = CASE WHEN $2::boolean THEN 'PENDING' ELSE 'FAILED' END,
                 retry_count = retry_count + 1,
                 last_error = $3
             WHERE id = $1`,
            [row.outbox_id, dispatchRes.isRetryable, dispatchRes.failureCategory || 'DISPATCH_ERROR']
          );
        }
        processed.push({ outboxId: row.outbox_id, success: dispatchRes.success });
      }

      await client.query('COMMIT');
      return processed;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // =========================================================================
  // BACKWARD-COMPATIBLE HIGH LEVEL BUSINESS HELPERS
  // =========================================================================

  async notifyOrderPlaced({ order, user }) {
    const toPhone = order.phone || user?.phone;
    const toEmail = order.email || user?.email;
    const orderNumber = order.order_number;
    const total = order.total;

    if (toPhone) {
      await this.sendTransactionalNotification({
        userId: user?.id || order.user_id,
        recipient: toPhone,
        channel: CHANNELS.SMS,
        templateId: TEMPLATE_IDS.ORDER_CREATED,
        payload: { orderNumber, total },
        resourceId: order.id
      }).catch(err => console.warn('[Notification] OrderPlaced SMS warning:', err.message));
    }

    if (toEmail) {
      await this.sendTransactionalNotification({
        userId: user?.id || order.user_id,
        recipient: toEmail,
        channel: CHANNELS.EMAIL,
        templateId: TEMPLATE_IDS.ORDER_CREATED,
        payload: { orderNumber, total },
        resourceId: order.id
      }).catch(err => console.warn('[Notification] OrderPlaced Email warning:', err.message));
    }
  }

  async notifyPaymentSuccess({ order, receiptNumber, amount }) {
    const toPhone = order.phone;
    const toEmail = order.email;
    const orderNumber = order.order_number;

    if (toPhone) {
      await this.sendTransactionalNotification({
        userId: order.user_id,
        recipient: toPhone,
        channel: CHANNELS.SMS,
        templateId: TEMPLATE_IDS.PAYMENT_SUCCESS,
        payload: { orderNumber, receiptNumber, amount },
        resourceId: order.id
      }).catch(err => console.warn('[Notification] PaymentSuccess SMS warning:', err.message));
    }

    if (toEmail) {
      await this.sendTransactionalNotification({
        userId: order.user_id,
        recipient: toEmail,
        channel: CHANNELS.EMAIL,
        templateId: TEMPLATE_IDS.PAYMENT_SUCCESS,
        payload: { orderNumber, receiptNumber, amount },
        resourceId: order.id
      }).catch(err => console.warn('[Notification] PaymentSuccess Email warning:', err.message));
    }
  }

  async notifyOpticalReview({ order, status, notes }) {
    const toPhone = order.phone;
    const templateId = status === 'APPROVED' ? TEMPLATE_IDS.PRESCRIPTION_APPROVED
                     : status === 'REJECTED' ? TEMPLATE_IDS.PRESCRIPTION_REJECTED
                     : TEMPLATE_IDS.PRESCRIPTION_CLARIFICATION_REQUIRED;

    if (toPhone) {
      await this.sendTransactionalNotification({
        userId: order.user_id,
        recipient: toPhone,
        channel: CHANNELS.SMS,
        templateId,
        payload: { orderNumber: order.order_number, notes },
        resourceId: order.id
      }).catch(err => console.warn('[Notification] OpticalReview SMS warning:', err.message));
    }
  }

  async notifyAppointmentBooked({ appointment, clinic }) {
    if (appointment.patient_phone) {
      await this.sendTransactionalNotification({
        userId: appointment.user_id,
        recipient: appointment.patient_phone,
        channel: CHANNELS.SMS,
        templateId: TEMPLATE_IDS.APPOINTMENT_CREATED,
        payload: {
          bookingReference: appointment.booking_reference,
          patientName: appointment.patient_name,
          clinicName: clinic?.name || 'Westlands Central Clinic',
          startTime: appointment.start_time
        },
        resourceId: appointment.id
      }).catch(err => console.warn('[Notification] AppointmentBooked SMS warning:', err.message));
    }
  }
}

const instance = new NotificationService();
instance.NotificationService = NotificationService;
module.exports = instance;
