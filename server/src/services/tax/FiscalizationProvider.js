/**
 * EyeKart Phase 6.6 Tax Fiscalization Provider Base Interface
 * Defines abstract contract for electronic tax invoice signing (KRA eTIMS / VSCU).
 */

class FiscalizationProvider {
  constructor(name) {
    this.name = name;
  }

  async fiscalizeInvoice(params) {
    throw new Error(`fiscalizeInvoice() must be implemented by ${this.constructor.name}`);
  }

  async getInvoiceStatus(params) {
    throw new Error(`getInvoiceStatus() must be implemented by ${this.constructor.name}`);
  }
}

module.exports = FiscalizationProvider;
