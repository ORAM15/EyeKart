/**
 * EyeKart Authoritative Business Source of Truth
 * 
 * CRITICAL BUSINESS INVARIANTS:
 * 1. Maintain strict distinction between LEGAL / REGISTRATION information and CURRENT CUSTOMER-FACING business information.
 * 2. Do NOT treat 2022 registered-office address as current customer-facing store/clinic address.
 * 3. Do NOT invent telephone numbers, WhatsApp numbers, doctor names, branches, courier partners, or merchant IDs.
 * 4. KRA REGISTRATION ≠ LIVE eTIMS INTEGRATION. KRA corporate registration does not prove live fiscal website integration.
 */

const BUSINESS_AUTHORITY = {
  // 1. LEGAL / REGISTRATION INFORMATION (Authoritative from company incorporation documents)
  legal: {
    legalEntityName: 'EYE KART HEALTHCARE LIMITED',
    companyNumber: 'PVT-8LU79RXX',
    incorporationDate: '2022-05-05', // 5 May 2022
    jurisdiction: 'Kenya',
    registryAuthority: 'Business Registration Service (BRS), Republic of Kenya',
    taxAuthority: 'Kenya Revenue Authority (KRA)',
    taxObligation: 'Company Income Tax (Active)',
    note: 'Authoritative legal registration information. Historical registered office is distinct from current store location.'
  },

  // 2. CURRENT CUSTOMER-FACING BUSINESS INFORMATION (Provided by the Business Owner)
  customerFacing: {
    businessLocation: 'Corner Plaza Building, 4th Floor, Westlands, Nairobi, Kenya',
    contactEmail: 'Eyekarthealthcare@gmail.com',
    tradingName: 'EyeKart',
    website: 'https://eyekart.ke',
    note: 'Current customer-facing location and email confirmed by business owner for website use.'
  },

  // 3. UNCONFIRMED OPERATIONAL ITEMS (Strictly NOT to be invented; awaiting business confirmation)
  unconfirmed: {
    telephoneNumbers: null, // Any numbers in codebase are TEST PLACEHOLDERS ONLY
    whatsAppNumber: null,  // Any numbers in codebase are TEST PLACEHOLDERS ONLY
    openingHours: null,    // Awaiting business owner confirmation
    additionalBranches: null, // 4 DB clinic branches (Sarit, Junction, Village Market, Westlands Square) are unconfirmed dev scaffolding
    optometristNames: null,   // Any clinician names in codebase are TEST PLACEHOLDERS ONLY
    courierPartners: null,    // Awaiting formal logistics agreement confirmation
    mpesaPaybillNumber: null, // Live Paybill/Till number awaiting Safaricom Business onboarding
    liveEtimsIntegration: false // KRA registration exists, but live eTIMS API/middleware is NOT integrated
  }
};

module.exports = BUSINESS_AUTHORITY;
