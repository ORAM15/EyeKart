/**
 * EyeKart Phase 6.6 Tax Fiscalization Service
 * High-level coordinator for tax invoice generation and fiscalization.
 */
const TestFiscalizationProvider = require('./TestFiscalizationProvider');

const defaultProvider = new TestFiscalizationProvider();

class TaxFiscalizationService {
  constructor(provider = defaultProvider) {
    this.provider = provider;
  }

  get activeProvider() {
    return this.provider;
  }

  setProvider(newProvider) {
    this.provider = newProvider;
  }

  async fiscalizeOrderInvoice(order) {
    return this.provider.fiscalizeInvoice({
      orderId: order.id,
      invoiceNumber: `INV-${order.order_number || order.id.slice(0, 8)}`,
      customerPin: order.customer_pin || 'P051234567Z',
      items: order.items || [],
      grossTotal: Number(order.total)
    });
  }
}

module.exports = new TaxFiscalizationService();
