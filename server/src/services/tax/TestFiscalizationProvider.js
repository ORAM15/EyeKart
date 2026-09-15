/**
 * EyeKart Phase 6.6 Test Fiscalization Provider
 * Provides deterministic simulation of electronic tax invoices (eTIMS)
 * strictly designated as TEST / DEMO with zero contact to KRA servers.
 */
const crypto = require('crypto');
const FiscalizationProvider = require('./FiscalizationProvider');

class TestFiscalizationProvider extends FiscalizationProvider {
  constructor() {
    super('TEST_ETIMS_PROVIDER');
  }

  /**
   * Fiscalize invoice with deterministic Kenyan VAT (16%) breakdown
   */
  async fiscalizeInvoice({
    orderId,
    invoiceNumber,
    customerPin = 'A000000000Z',
    items = [],
    grossTotal
  }) {
    const total = Number(grossTotal);
    const taxableAmount = +(total / 1.16).toFixed(2);
    const vatAmount = +(total - taxableAmount).toFixed(2);
    const controlUnitSerial = 'KRA-ETIMS-SANDBOX-' + Math.floor(100000 + Math.random() * 900000);
    const invoiceQrCode = `https://itax.kra.go.ke/KRA-Portal/invoiceVal.htm?mode=TEST&cuSerial=${controlUnitSerial}&invoiceNum=${encodeURIComponent(invoiceNumber || orderId)}`;

    return {
      success: true,
      provider: this.name,
      isSimulation: true,
      marker: 'DEMO / TEST FISCALIZATION MARKER — ZERO CONTACT WITH KRA PORTAL',
      orderId,
      invoiceNumber: invoiceNumber || `INV-${orderId.slice(0, 8)}`,
      customerPin,
      taxBreakdown: {
        vatRate: '16%',
        taxableAmount,
        vatAmount,
        grossTotal: total,
        currency: 'KES'
      },
      controlUnit: {
        serialNumber: controlUnitSerial,
        date: new Date().toISOString(),
        qrCodeUrl: invoiceQrCode,
        signature: 'TEST-SIG-' + crypto.randomBytes(8).toString('hex').toUpperCase()
      }
    };
  }

  async getInvoiceStatus({ invoiceNumber }) {
    return {
      success: true,
      invoiceNumber,
      status: 'FISCALIZED_TEST_MODE',
      verified: true
    };
  }
}

module.exports = TestFiscalizationProvider;
