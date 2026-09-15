/**
 * EyeKart Phase 6.2 Payment Provider Base Interface
 * Defines abstract contract for all commerce payment rails.
 */

const PAYMENT_STATES = {
  NOT_STARTED: 'NOT_STARTED',
  INITIATED: 'INITIATED',
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED'
};

const LEGAL_PAYMENT_TRANSITIONS = {
  NOT_STARTED: ['INITIATED', 'CANCELLED'],
  INITIATED: ['PENDING', 'FAILED', 'CANCELLED'],
  PENDING: ['SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED'],
  SUCCESS: [], // Terminal authorization
  FAILED: [],  // Terminal attempt
  CANCELLED: [],
  EXPIRED: []
};

const PROVIDER_ENVIRONMENTS = {
  DISABLED: 'DISABLED',
  SANDBOX: 'SANDBOX',
  LIVE: 'LIVE'
};

function isValidPaymentTransition(fromState, toState) {
  if (fromState === toState) return true;
  const allowed = LEGAL_PAYMENT_TRANSITIONS[fromState] || [];
  return allowed.includes(toState);
}

class PaymentProvider {
  constructor(name, environment = PROVIDER_ENVIRONMENTS.DISABLED) {
    this.name = name;
    this.environment = environment;
  }

  get isLive() {
    return this.environment === PROVIDER_ENVIRONMENTS.LIVE;
  }

  get isSandbox() {
    return this.environment === PROVIDER_ENVIRONMENTS.SANDBOX;
  }

  get isEnabled() {
    return this.environment !== PROVIDER_ENVIRONMENTS.DISABLED;
  }

  async initiatePayment(params) {
    throw new Error(`initiatePayment() must be implemented by ${this.constructor.name}`);
  }

  async verifyPayment(params) {
    throw new Error(`verifyPayment() must be implemented by ${this.constructor.name}`);
  }

  async queryPayment(params) {
    throw new Error(`queryPayment() must be implemented by ${this.constructor.name}`);
  }

  normalizeProviderResponse(raw) {
    throw new Error(`normalizeProviderResponse() must be implemented by ${this.constructor.name}`);
  }
}

module.exports = {
  PaymentProvider,
  PAYMENT_STATES,
  LEGAL_PAYMENT_TRANSITIONS,
  PROVIDER_ENVIRONMENTS,
  isValidPaymentTransition
};
