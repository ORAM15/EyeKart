/**
 * EyeKart Frontend Business Source of Truth
 * 
 * CRITICAL BUSINESS INVARIANTS:
 * 1. Maintain strict distinction between LEGAL / REGISTRATION information and CURRENT CUSTOMER-FACING business information.
 * 2. Do NOT treat 2022 registered-office address as current customer-facing store/clinic address.
 * 3. Do NOT invent telephone numbers, WhatsApp numbers, doctor names, branches, courier partners, or merchant IDs.
 * 4. KRA REGISTRATION ≠ LIVE eTIMS INTEGRATION.
 */
(function (global) {
  'use strict';

  global.EyeKartBusinessAuthority = {
    // 1. LEGAL / REGISTRATION INFORMATION
    legal: {
      legalEntityName: 'EYE KART HEALTHCARE LIMITED',
      companyNumber: 'PVT-8LU79RXX',
      incorporationDate: '2022-05-05',
      jurisdiction: 'Kenya',
      taxObligation: 'Company Income Tax (Active)',
      note: 'Authoritative historical/legal company registration information. Distinct from current customer-facing address.'
    },

    // 2. CURRENT CUSTOMER-FACING BUSINESS INFORMATION (Provided by the Business Owner)
    customerFacing: {
      businessLocation: 'Corner Plaza Building, 4th Floor, Westlands, Nairobi, Kenya',
      contactEmail: 'Eyekarthealthcare@gmail.com',
      tradingName: 'EyeKart',
      website: 'https://eyekart.ke',
      note: 'Current customer-facing location and email confirmed by business owner for website use.'
    },

    // 3. UNCONFIRMED ITEMS (Awaiting business owner confirmation; do not invent)
    unconfirmed: {
      telephone: null,
      whatsApp: null,
      openingHours: null,
      additionalBranches: null,
      optometristNames: null,
      courierPartners: null,
      mpesaPaybill: null,
      liveEtimsIntegration: false
    }
  };
})(typeof window !== 'undefined' ? window : global);
