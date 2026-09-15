/**
 * EyeKart Phase 6.6 Test Courier Provider
 * Provides deterministic simulation of courier shipment creation, tracking milestones,
 * and dispatch waybills without making any live external network calls.
 */
const crypto = require('crypto');
const CourierProvider = require('./CourierProvider');

class TestCourierProvider extends CourierProvider {
  constructor() {
    super('TEST_COURIER_PROVIDER');
    this.shipments = new Map();
  }

  /**
   * Simulate creation of an external courier shipment
   */
  async createShipment({
    orderId,
    recipientName,
    recipientPhone,
    deliveryAddress,
    city = 'Nairobi',
    parcelType = 'OPTICAL_EYEWEAR'
  }) {
    const waybillNumber = 'EK-FARGO-' + Math.floor(100000 + Math.random() * 900000);
    const trackingCode = 'TRK-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const shipment = {
      orderId,
      waybillNumber,
      trackingCode,
      recipientName,
      recipientPhone,
      deliveryAddress,
      city,
      parcelType,
      status: 'BOOKED',
      milestones: [
        { status: 'BOOKED', location: 'EyeKart Westlands Central Lab', timestamp: new Date().toISOString() }
      ],
      createdAt: new Date().toISOString()
    };

    this.shipments.set(waybillNumber, shipment);
    this.shipments.set(trackingCode, shipment);

    return {
      success: true,
      provider: this.name,
      isSimulation: true,
      waybillNumber,
      trackingCode,
      estimatedDeliveryDays: city.toLowerCase().includes('nairobi') ? 1 : 2
    };
  }

  /**
   * Simulate fetching tracking milestones
   */
  async getTracking({ waybillNumber, trackingCode }) {
    const key = waybillNumber || trackingCode;
    const shipment = this.shipments.get(key);

    if (!shipment) {
      return {
        success: false,
        status: 'UNKNOWN',
        message: `Waybill / Tracking '${key}' not found in courier simulation.`
      };
    }

    return {
      success: true,
      waybillNumber: shipment.waybillNumber,
      trackingCode: shipment.trackingCode,
      currentStatus: shipment.status,
      milestones: shipment.milestones
    };
  }

  /**
   * Advance milestone for test scenarios
   */
  advanceMilestone(waybillNumber, status, location = 'In Transit') {
    const shipment = this.shipments.get(waybillNumber);
    if (!shipment) return null;

    shipment.status = status;
    shipment.milestones.push({
      status,
      location,
      timestamp: new Date().toISOString()
    });

    return shipment;
  }

  async cancelShipment({ waybillNumber, reason = 'Customer request' }) {
    const shipment = this.shipments.get(waybillNumber);
    if (!shipment) return { success: false, message: 'Shipment not found' };

    shipment.status = 'CANCELLED';
    shipment.cancellationReason = reason;
    shipment.milestones.push({
      status: 'CANCELLED',
      location: 'Dispatch Hub',
      timestamp: new Date().toISOString()
    });

    return { success: true, waybillNumber, status: 'CANCELLED' };
  }

  clear() {
    this.shipments.clear();
  }
}

module.exports = TestCourierProvider;
