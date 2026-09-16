/**
 * EyeKart Phase 4 Payment Services Registry
 * Provides unified interface and provider factory for EyeKart payment rails.
 */
const {
  PaymentProvider,
  PAYMENT_STATES,
  LEGAL_PAYMENT_TRANSITIONS,
  PROVIDER_ENVIRONMENTS,
  isValidPaymentTransition
} = require('./PaymentProvider');

const DemoPaymentProvider = require('./DemoPaymentProvider');
const MpesaDarajaProvider = require('./MpesaDarajaProvider');
const DarajaClient = require('./DarajaClient');

const demoInstance = new DemoPaymentProvider();
const darajaInstance = new MpesaDarajaProvider();

/**
 * Get payment provider instance based on name or active environment
 * @param {string} [name] - 'MPESA_DARAJA', 'MPESA', or 'DEMO'
 * @returns {PaymentProvider}
 */
function getPaymentProvider(name = null) {
  if (name) {
    const normalized = String(name).trim().toUpperCase();
    if (normalized === 'MPESA_DARAJA' || normalized === 'MPESA' || normalized === 'DARAJA') {
      return darajaInstance;
    }
    if (normalized === 'DEMO') {
      return demoInstance;
    }
  }

  // Environment-driven resolution
  const env = (process.env.MPESA_ENVIRONMENT || 'DISABLED').toUpperCase();
  if (env === 'SANDBOX' || env === 'LIVE') {
    return darajaInstance;
  }

  // Default fallback for development/testing
  return demoInstance;
}

module.exports = {
  getPaymentProvider,
  PaymentProvider,
  PAYMENT_STATES,
  LEGAL_PAYMENT_TRANSITIONS,
  PROVIDER_ENVIRONMENTS,
  isValidPaymentTransition,
  DemoPaymentProvider,
  MpesaDarajaProvider,
  DarajaClient,
  demoInstance,
  darajaInstance
};
