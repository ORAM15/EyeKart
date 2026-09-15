/**
 * EyeKart Phase 6.6 Courier Provider Base Interface
 * Defines abstract contract for external third-party courier dispatchers (Fargo, G4S, Sendy).
 */

class CourierProvider {
  constructor(name) {
    this.name = name;
  }

  async createShipment(params) {
    throw new Error(`createShipment() must be implemented by ${this.constructor.name}`);
  }

  async getTracking(params) {
    throw new Error(`getTracking() must be implemented by ${this.constructor.name}`);
  }

  async cancelShipment(params) {
    throw new Error(`cancelShipment() must be implemented by ${this.constructor.name}`);
  }
}

module.exports = CourierProvider;
