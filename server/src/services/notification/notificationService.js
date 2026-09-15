/**
 * EyeKart Phase 6.6 Notification Service
 * High-level business event notification coordinator for orders, payments,
 * optical reviews, and clinic appointments.
 */
const TestNotificationProvider = require('./TestNotificationProvider');

// By default in Phase 6.6, use the deterministic TestNotificationProvider
const activeProvider = new TestNotificationProvider();

class NotificationService {
  constructor(provider = activeProvider) {
    this.provider = provider;
  }

  get activeProvider() {
    return this.provider;
  }

  setProvider(newProvider) {
    this.provider = newProvider;
  }

  /**
   * Notify customer of order placement
   */
  async notifyOrderPlaced({ order, user }) {
    const toPhone = order.phone || user?.phone;
    const toEmail = order.email || user?.email;

    if (toPhone) {
      await this.provider.sendSms({
        to: toPhone,
        message: `EyeKart: Order #${order.order_number} confirmed! Total KES ${Number(order.total).toLocaleString()}. Track online at eyekart.ke/track.`,
        metadata: { orderId: order.id, event: 'ORDER_PLACED' }
      });
    }

    if (toEmail) {
      await this.provider.sendEmail({
        to: toEmail,
        subject: `Your EyeKart Atelier Order #${order.order_number} has been confirmed`,
        html: `<p>Thank you for choosing EyeKart. Your bespoke eyewear order #${order.order_number} has been confirmed.</p>`,
        metadata: { orderId: order.id, event: 'ORDER_PLACED' }
      });
    }
  }

  /**
   * Notify customer of successful payment
   */
  async notifyPaymentSuccess({ order, receiptNumber, amount }) {
    const toPhone = order.phone;
    const toEmail = order.email;

    if (toPhone) {
      await this.provider.sendSms({
        to: toPhone,
        message: `EyeKart: Payment received for Order #${order.order_number}. Receipt: ${receiptNumber}, Amount: KES ${Number(amount).toLocaleString()}. Thank you!`,
        metadata: { orderId: order.id, receiptNumber, event: 'PAYMENT_SUCCESS' }
      });
    }

    if (toEmail) {
      await this.provider.sendEmail({
        to: toEmail,
        subject: `Payment Receipt: EyeKart Order #${order.order_number}`,
        html: `<p>We have received your payment of KES ${Number(amount).toLocaleString()} via M-PESA (${receiptNumber}) for order #${order.order_number}.</p>`,
        metadata: { orderId: order.id, receiptNumber, event: 'PAYMENT_SUCCESS' }
      });
    }
  }

  /**
   * Notify customer of optical / prescription review update
   */
  async notifyOpticalReview({ order, status, notes }) {
    const toPhone = order.phone;
    if (toPhone) {
      await this.provider.sendSms({
        to: toPhone,
        message: `EyeKart Optical Team: Your prescription review for Order #${order.order_number} is now ${status}. ${notes || ''}`,
        metadata: { orderId: order.id, status, event: 'OPTICAL_REVIEW_UPDATE' }
      });
    }
  }

  /**
   * Notify patient of appointment booking
   */
  async notifyAppointmentBooked({ appointment, clinic }) {
    if (appointment.patient_phone) {
      await this.provider.sendSms({
        to: appointment.patient_phone,
        message: `EyeKart Clinic: Appointment #${appointment.booking_reference} confirmed for ${appointment.patient_name} at ${clinic?.name || 'Westlands Atelier'}.`,
        metadata: { appointmentId: appointment.id, event: 'APPOINTMENT_BOOKED' }
      });
    }
  }
}

module.exports = new NotificationService();
