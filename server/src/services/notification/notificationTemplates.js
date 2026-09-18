/**
 * EyeKart Phase 8 Notification Templates Engine
 * Provides trusted server-side template definitions with strict HTML escaping,
 * header-injection mitigation, and healthcare data minimization.
 */

const TEMPLATE_IDS = Object.freeze({
  ACCOUNT_CREATED: 'ACCOUNT_CREATED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  SECURITY_ALERT: 'SECURITY_ALERT',
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_PAYMENT_PENDING: 'ORDER_PAYMENT_PENDING',
  ORDER_PAID: 'ORDER_PAID',
  ORDER_PROCESSING: 'ORDER_PROCESSING',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  ORDER_EXPIRED: 'ORDER_EXPIRED',
  PRESCRIPTION_SUBMITTED: 'PRESCRIPTION_SUBMITTED',
  PRESCRIPTION_APPROVED: 'PRESCRIPTION_APPROVED',
  PRESCRIPTION_REJECTED: 'PRESCRIPTION_REJECTED',
  PRESCRIPTION_CLARIFICATION_REQUIRED: 'PRESCRIPTION_CLARIFICATION_REQUIRED',
  FULFILLMENT_CREATED: 'FULFILLMENT_CREATED',
  ORDER_SHIPPED: 'ORDER_SHIPPED',
  ORDER_DELIVERED: 'ORDER_DELIVERED',
  APPOINTMENT_CREATED: 'APPOINTMENT_CREATED',
  APPOINTMENT_CONFIRMED: 'APPOINTMENT_CONFIRMED',
  APPOINTMENT_CANCELLED: 'APPOINTMENT_CANCELLED',
  APPOINTMENT_REMINDER: 'APPOINTMENT_REMINDER',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
  MARKETING_PROMOTION: 'MARKETING_PROMOTION'
});

const NOTIFICATION_CATEGORIES = Object.freeze({
  TRANSACTIONAL: 'TRANSACTIONAL',
  MARKETING: 'MARKETING'
});

// Mandatory transactional / security / clinical templates that cannot be disabled by user preferences
const MANDATORY_TEMPLATES = Object.freeze([
  TEMPLATE_IDS.ACCOUNT_CREATED,
  TEMPLATE_IDS.PASSWORD_CHANGED,
  TEMPLATE_IDS.SECURITY_ALERT,
  TEMPLATE_IDS.ORDER_CREATED,
  TEMPLATE_IDS.ORDER_PAYMENT_PENDING,
  TEMPLATE_IDS.ORDER_PAID,
  TEMPLATE_IDS.ORDER_PROCESSING,
  TEMPLATE_IDS.ORDER_CANCELLED,
  TEMPLATE_IDS.ORDER_EXPIRED,
  TEMPLATE_IDS.PRESCRIPTION_SUBMITTED,
  TEMPLATE_IDS.PRESCRIPTION_APPROVED,
  TEMPLATE_IDS.PRESCRIPTION_REJECTED,
  TEMPLATE_IDS.PRESCRIPTION_CLARIFICATION_REQUIRED,
  TEMPLATE_IDS.FULFILLMENT_CREATED,
  TEMPLATE_IDS.ORDER_SHIPPED,
  TEMPLATE_IDS.ORDER_DELIVERED,
  TEMPLATE_IDS.APPOINTMENT_CREATED,
  TEMPLATE_IDS.APPOINTMENT_CONFIRMED,
  TEMPLATE_IDS.APPOINTMENT_CANCELLED,
  TEMPLATE_IDS.APPOINTMENT_REMINDER,
  TEMPLATE_IDS.PAYMENT_SUCCESS,
  TEMPLATE_IDS.PAYMENT_FAILED,
  TEMPLATE_IDS.PAYMENT_EXPIRED
]);

// Optional marketing templates subject to customer marketing preference opt-in
const MARKETING_TEMPLATES = Object.freeze([
  TEMPLATE_IDS.MARKETING_PROMOTION
]);

function isMandatoryTemplate(templateId) {
  return MANDATORY_TEMPLATES.includes(templateId);
}

function isMarketingTemplate(templateId) {
  return MARKETING_TEMPLATES.includes(templateId);
}

/**
 * HTML sanitization to prevent script and markup injection
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Header sanitization to prevent CRLF email injection
 */
function sanitizeHeader(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[\r\n\t]/g, ' ').trim();
}

/**
 * Filter out forbidden sensitive fields from notification payloads
 */
function sanitizePayload(payload = {}) {
  const sensitiveKeys = [
    'password', 'password_hash', 'passwordHash', 'token', 'sessionToken',
    'secret', 'clientSecret', 'cookie', 'cvv', 'credit_card', 'pin',
    'od_sph', 'od_cyl', 'od_axis', 'od_add',
    'os_sph', 'os_cyl', 'os_axis', 'os_add', 'pd'
  ];
  const cleaned = {};
  for (const [k, v] of Object.entries(payload)) {
    if (!sensitiveKeys.includes(k) && !sensitiveKeys.includes(k.toLowerCase())) {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        cleaned[k] = sanitizePayload(v);
      } else {
        cleaned[k] = v;
      }
    }
  }
  return cleaned;
}

const TEMPLATES = {
  [TEMPLATE_IDS.ACCOUNT_CREATED]: {
    subject: () => 'Welcome to EyeKart',
    emailHtml: (p) => `<p>Dear ${escapeHtml(p.fullName || 'Customer')},</p><p>Your EyeKart account has been successfully created. Explore our optical products online at https://eyekart.ke.</p>`,
    smsText: (p) => `EyeKart: Welcome ${p.fullName || ''}! Your account has been created. Visit https://eyekart.ke to explore our eyewear.`
  },
  [TEMPLATE_IDS.PASSWORD_CHANGED]: {
    subject: () => 'Security Notice: Your EyeKart Password Was Changed',
    emailHtml: (p) => `<p>Security Alert: Your EyeKart password was updated on ${escapeHtml(p.timestamp || new Date().toISOString())}. If you did not make this change, please contact Eyekarthealthcare@gmail.com immediately.</p>`,
    smsText: (p) => `EyeKart Security: Your password was updated. If this wasn't you, contact support at Eyekarthealthcare@gmail.com immediately.`
  },
  [TEMPLATE_IDS.SECURITY_ALERT]: {
    subject: () => 'Security Alert: Notice Concerning Your Account',
    emailHtml: (p) => `<p>Security Notice: An account security event (${escapeHtml(p.event || 'Activity')}) was recorded. Please review your account settings at https://eyekart.ke.</p>`,
    smsText: (p) => `EyeKart Security Alert: Security activity detected on your account. Review your settings at https://eyekart.ke.`
  },
  [TEMPLATE_IDS.ORDER_CREATED]: {
    subject: (p) => `EyeKart Order Confirmation #${sanitizeHeader(p.orderNumber)}`,
    emailHtml: (p) => `<p>Thank you for choosing EyeKart. Order #${escapeHtml(p.orderNumber)} for KES ${Number(p.total || 0).toLocaleString()} has been placed. You can track progress in your account at https://eyekart.ke.</p>`,
    smsText: (p) => `EyeKart: Order #${p.orderNumber} placed for KES ${Number(p.total || 0).toLocaleString()}. Track progress online at https://eyekart.ke.`
  },
  [TEMPLATE_IDS.ORDER_PAYMENT_PENDING]: {
    subject: (p) => `Payment Pending: EyeKart Order #${sanitizeHeader(p.orderNumber)}`,
    emailHtml: (p) => `<p>Order #${escapeHtml(p.orderNumber)} is awaiting payment confirmation of KES ${Number(p.total || 0).toLocaleString()}.</p>`,
    smsText: (p) => `EyeKart: Order #${p.orderNumber} is awaiting payment of KES ${Number(p.total || 0).toLocaleString()}. Complete your payment to begin processing.`
  },
  [TEMPLATE_IDS.ORDER_PAID]: {
    subject: (p) => `Payment Confirmed: EyeKart Order #${sanitizeHeader(p.orderNumber)}`,
    emailHtml: (p) => `<p>Your payment of KES ${Number(p.amount || p.total || 0).toLocaleString()} for Order #${escapeHtml(p.orderNumber)} has been received with thanks.</p>`,
    smsText: (p) => `EyeKart: Payment received for Order #${p.orderNumber}. Amount: KES ${Number(p.amount || p.total || 0).toLocaleString()}. Thank you!`
  },
  [TEMPLATE_IDS.ORDER_PROCESSING]: {
    subject: (p) => `Order Processing: Order #${sanitizeHeader(p.orderNumber)}`,
    emailHtml: (p) => `<p>Order #${escapeHtml(p.orderNumber)} has entered workshop processing and lens fabrication.</p>`,
    smsText: (p) => `EyeKart: Order #${p.orderNumber} has entered workshop processing and lens fabrication.`
  },
  [TEMPLATE_IDS.ORDER_CANCELLED]: {
    subject: (p) => `Order Cancelled: Order #${sanitizeHeader(p.orderNumber)}`,
    emailHtml: (p) => `<p>Order #${escapeHtml(p.orderNumber)} has been cancelled. ${escapeHtml(p.reason || '')}</p>`,
    smsText: (p) => `EyeKart: Order #${p.orderNumber} has been cancelled. Any held inventory has been released.`
  },
  [TEMPLATE_IDS.ORDER_EXPIRED]: {
    subject: (p) => `Order Expired: Order #${sanitizeHeader(p.orderNumber)}`,
    emailHtml: (p) => `<p>Order #${escapeHtml(p.orderNumber)} has expired due to pending payment timeout.</p>`,
    smsText: (p) => `EyeKart: Order #${p.orderNumber} has expired. Please reorder online at https://eyekart.ke if you still wish to purchase.`
  },
  [TEMPLATE_IDS.PRESCRIPTION_SUBMITTED]: {
    subject: () => 'Prescription Received for Optometrist Review',
    emailHtml: (p) => `<p>Your optical prescription has been submitted for optometrist review.</p>`,
    smsText: () => `EyeKart: Your prescription has been received and queued for optometrist review.`
  },
  [TEMPLATE_IDS.PRESCRIPTION_APPROVED]: {
    subject: () => 'Prescription Approved - EyeKart Review',
    emailHtml: (p) => `<p>Your prescription has been reviewed and approved by an optometrist. Your order can now proceed to lens fabrication.</p>`,
    smsText: (p) => `EyeKart: Your prescription has been approved by the optometrist. Workshop fabrication can now proceed.`
  },
  [TEMPLATE_IDS.PRESCRIPTION_REJECTED]: {
    subject: () => 'Notice Regarding Your Prescription Review',
    emailHtml: (p) => `<p>The optometrist was unable to approve the submitted prescription. ${escapeHtml(p.notes || 'Please log in to your account at https://eyekart.ke to review the feedback.')}</p>`,
    smsText: (p) => `EyeKart: Notice regarding your prescription review. Please log in to your account at https://eyekart.ke to review feedback.`
  },
  [TEMPLATE_IDS.PRESCRIPTION_CLARIFICATION_REQUIRED]: {
    subject: () => 'Action Required: Prescription Clarification Needed',
    emailHtml: (p) => `<p>The optometrist requires additional clarification on your optical details before proceeding. ${escapeHtml(p.notes || '')} Please log in to your account at https://eyekart.ke to respond.</p>`,
    smsText: (p) => `EyeKart: Clarification requested on your optical prescription. Log in at https://eyekart.ke to respond.`
  },
  [TEMPLATE_IDS.FULFILLMENT_CREATED]: {
    subject: (p) => `Fulfillment Created for Order #${sanitizeHeader(p.orderNumber)}`,
    emailHtml: (p) => `<p>Fulfillment has been initiated for Order #${escapeHtml(p.orderNumber)}.${p.trackingNumber ? ' Tracking number: ' + escapeHtml(p.trackingNumber) + '.' : ''}</p>`,
    smsText: (p) => `EyeKart: Fulfillment started for Order #${p.orderNumber}.${p.trackingNumber ? ' Tracking: ' + p.trackingNumber + '.' : ' Tracking details will be updated once dispatched.'}`
  },
  [TEMPLATE_IDS.ORDER_SHIPPED]: {
    subject: (p) => `Dispatched: EyeKart Order #${sanitizeHeader(p.orderNumber)}`,
    emailHtml: (p) => `<p>Order #${escapeHtml(p.orderNumber)} has been handed over to courier dispatch.${p.carrier ? ' Courier: ' + escapeHtml(p.carrier) + '.' : ''}${p.trackingNumber ? ' Tracking number: ' + escapeHtml(p.trackingNumber) + '.' : ''}</p>`,
    smsText: (p) => `EyeKart: Order #${p.orderNumber} dispatched!${p.carrier ? ' Courier: ' + p.carrier + '.' : ''}${p.trackingNumber ? ' Tracking: ' + p.trackingNumber : ' Tracking details available in your account.'}`
  },
  [TEMPLATE_IDS.ORDER_DELIVERED]: {
    subject: (p) => `Delivered: EyeKart Order #${sanitizeHeader(p.orderNumber)}`,
    emailHtml: (p) => `<p>Your EyeKart order #${escapeHtml(p.orderNumber)} has been delivered. Thank you for choosing EyeKart Healthcare Limited.</p>`,
    smsText: (p) => `EyeKart: Order #${p.orderNumber} has been delivered. Thank you for choosing EyeKart Healthcare Limited.`
  },
  [TEMPLATE_IDS.APPOINTMENT_CREATED]: {
    subject: (p) => `Appointment Received: #${sanitizeHeader(p.bookingReference)}`,
    emailHtml: (p) => `<p>Appointment booking #${escapeHtml(p.bookingReference)} for ${escapeHtml(p.patientName || 'patient')}${p.clinicLocation || p.clinicName ? ' at ' + escapeHtml(p.clinicLocation || p.clinicName) : ''} has been received.</p>`,
    smsText: (p) => `EyeKart: Appointment #${p.bookingReference} received for ${p.patientName || 'patient'}. Details: https://eyekart.ke/account.`
  },
  [TEMPLATE_IDS.APPOINTMENT_CONFIRMED]: {
    subject: (p) => `Appointment Confirmed: #${sanitizeHeader(p.bookingReference)}`,
    emailHtml: (p) => `<p>Your appointment #${escapeHtml(p.bookingReference)}${p.clinicLocation || p.clinicName ? ' at ' + escapeHtml(p.clinicLocation || p.clinicName) : ''} on ${escapeHtml(p.startTime || 'scheduled time')} is confirmed.</p>`,
    smsText: (p) => `EyeKart: Appointment #${p.bookingReference} confirmed${p.clinicLocation || p.clinicName ? ' at ' + (p.clinicLocation || p.clinicName) : ''}. Time: ${p.startTime || 'Scheduled'}.`
  },
  [TEMPLATE_IDS.APPOINTMENT_CANCELLED]: {
    subject: (p) => `Appointment Cancelled: #${sanitizeHeader(p.bookingReference)}`,
    emailHtml: (p) => `<p>Appointment #${escapeHtml(p.bookingReference)} has been cancelled. ${escapeHtml(p.reason || '')}</p>`,
    smsText: (p) => `EyeKart: Appointment #${p.bookingReference} has been cancelled. To reschedule, visit https://eyekart.ke.`
  },
  [TEMPLATE_IDS.APPOINTMENT_REMINDER]: {
    subject: (p) => `Reminder: Upcoming EyeKart Appointment #${sanitizeHeader(p.bookingReference)}`,
    emailHtml: (p) => `<p>Reminder: You have an appointment #${escapeHtml(p.bookingReference)} scheduled for ${escapeHtml(p.startTime || 'upcoming time')}${p.clinicLocation || p.clinicName ? ' at ' + escapeHtml(p.clinicLocation || p.clinicName) : ''}.</p>`,
    smsText: (p) => `EyeKart Reminder: Appointment #${p.bookingReference} scheduled for ${p.startTime || 'upcoming time'}${p.clinicLocation || p.clinicName ? ' at ' + (p.clinicLocation || p.clinicName) : ''}.`
  },
  [TEMPLATE_IDS.PAYMENT_SUCCESS]: {
    subject: (p) => `Payment Received: Order #${sanitizeHeader(p.orderNumber)}`,
    emailHtml: (p) => `<p>We have received payment of KES ${Number(p.amount || 0).toLocaleString()} (Receipt: ${escapeHtml(p.receiptNumber || 'Confirmed')}) for order #${escapeHtml(p.orderNumber)}.</p>`,
    smsText: (p) => `EyeKart: Payment received for Order #${p.orderNumber}. Receipt: ${p.receiptNumber || 'Confirmed'}, Amount: KES ${Number(p.amount || 0).toLocaleString()}.`
  },
  [TEMPLATE_IDS.PAYMENT_FAILED]: {
    subject: (p) => `Payment Failed: Order #${sanitizeHeader(p.orderNumber)}`,
    emailHtml: (p) => `<p>Payment attempt for Order #${escapeHtml(p.orderNumber)} was unsuccessful. ${escapeHtml(p.reason || '')} Please log in to your account at https://eyekart.ke to retry your payment.</p>`,
    smsText: (p) => `EyeKart: Payment unsuccessful for Order #${p.orderNumber}. Log in at https://eyekart.ke to retry payment.`
  },
  [TEMPLATE_IDS.PAYMENT_EXPIRED]: {
    subject: (p) => `Payment Window Expired: Order #${sanitizeHeader(p.orderNumber)}`,
    emailHtml: (p) => `<p>The payment window for Order #${escapeHtml(p.orderNumber)} timed out. Any reserved inventory has been released.</p>`,
    smsText: (p) => `EyeKart: Payment window expired for Order #${p.orderNumber}. You can initiate a new checkout anytime at https://eyekart.ke.`
  },
  [TEMPLATE_IDS.MARKETING_PROMOTION]: {
    subject: () => 'EyeKart News & Updates',
    emailHtml: (p) => `<p>Dear Customer,</p><p>${escapeHtml(p.message || 'Discover new optical frames and lenses online at https://eyekart.ke.')}</p>`,
    smsText: (p) => `EyeKart: ${p.message || 'Discover new optical frames and lenses at https://eyekart.ke.'}`
  }
};

/**
 * Render template safely
 */
function renderTemplate(templateId, payload = {}) {
  if (!TEMPLATE_IDS[templateId] || !TEMPLATES[templateId]) {
    const err = new Error(`Invalid or unknown notification template ID: '${templateId}'`);
    err.code = 'INVALID_TEMPLATE_ID';
    err.statusCode = 400;
    throw err;
  }

  const tmpl = TEMPLATES[templateId];
  const safePayload = sanitizePayload(payload);

  const subject = tmpl.subject ? sanitizeHeader(tmpl.subject(safePayload)) : 'EyeKart Notification';
  const html = tmpl.emailHtml ? tmpl.emailHtml(safePayload) : `<p>${escapeHtml(subject)}</p>`;
  const text = tmpl.smsText ? tmpl.smsText(safePayload) : subject;

  return {
    templateId,
    subject,
    html,
    text,
    payload: safePayload
  };
}

module.exports = {
  TEMPLATE_IDS,
  MANDATORY_TEMPLATES,
  MARKETING_TEMPLATES,
  NOTIFICATION_CATEGORIES,
  isMandatoryTemplate,
  isMarketingTemplate,
  renderTemplate,
  sanitizePayload,
  escapeHtml,
  sanitizeHeader
};
