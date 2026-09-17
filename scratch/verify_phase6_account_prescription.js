/**
 * EyeKart Phase 6: Customer Accounts & Clinical Prescription Workflow Verification
 * Exhaustive 20-step verification suite testing authentication guards, account profile
 * hardening, privilege escalation prevention, prescription lifecycle, IDOR isolation,
 * medical document storage linkage, clinical queue RBAC, order-prescription binding,
 * and optometrist review workflows.
 */

const http = require('http');
const { query } = require('../server/src/db/pool');
const { createSession } = require('../server/src/services/authService');

const API_BASE = 'http://127.0.0.1:3001';

// Helper for HTTP requests
function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const postData = body ? JSON.stringify(body) : null;

    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(
      url,
      {
        method,
        headers,
        timeout: 10000
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => (rawData += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(rawData);
          } catch (e) {
            parsed = rawData;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout: ${method} ${path}`));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

let passedChecks = 0;
let totalChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runPhase6Tests() {
  console.log('================================================================');
  console.log('EYEKART PHASE 6: CUSTOMER ACCOUNTS & PRESCRIPTION WORKFLOW TEST');
  console.log('================================================================\n');

  // Login accounts
  console.log('[Step 1] Authenticating Test Actors...');
  const uniqueCustomerAEmail = `customer_a_${Date.now()}@eyekart.ke`;
  const uniqueCustomerAPhone = `+254${Math.floor(700000000 + Math.random() * 89999999)}`;
  const customerARegister = await request('POST', '/api/auth/register', {
    email: uniqueCustomerAEmail,
    password: 'CustomerSecurePassword2026!',
    fullName: 'Grace Wanjiku (Test Subject)',
    phone: uniqueCustomerAPhone
  });
  assert(customerARegister.status === 201 && customerARegister.body?.token, 'Customer A registered successfully');
  let tokenCustomerA = customerARegister.body.token;

  const staffRes = await query(`SELECT id FROM users WHERE role = 'STORE_STAFF' LIMIT 1`);
  const sessionStaff = await createSession(staffRes.rows[0].id, '127.0.0.1', 'Phase6-Verifier');
  assert(Boolean(sessionStaff?.rawToken), 'Store Staff session created successfully');
  const tokenStaff = sessionStaff.rawToken;

  const optomRes = await query(`SELECT id FROM users WHERE role = 'OPTOMETRIST' LIMIT 1`);
  const sessionOptom = await createSession(optomRes.rows[0].id, '127.0.0.1', 'Phase6-Verifier');
  assert(Boolean(sessionOptom?.rawToken), 'Optometrist session created successfully');
  const tokenOptom = sessionOptom.rawToken;

  // Register Customer B for cross-tenant IDOR tests
  const uniqueCustomerBEmail = `customer_b_${Date.now()}@eyekart.ke`;
  const uniqueCustomerBPhone = `+254${Math.floor(710000000 + Math.random() * 89999999)}`;
  const customerBRegister = await request('POST', '/api/auth/register', {
    email: uniqueCustomerBEmail,
    password: 'CustomerBSecurePassword2026!',
    fullName: 'Customer B (Test Subject)',
    phone: uniqueCustomerBPhone
  });
  assert(customerBRegister.status === 201 && customerBRegister.body?.token, 'Customer B registered successfully');
  const tokenCustomerB = customerBRegister.body.token;

  console.log('\n[Step 2] Testing Authentication Guards on Account & Prescription Endpoints...');
  const unauthMe = await request('GET', '/api/me');
  assert(unauthMe.status === 401, 'Unauthenticated GET /api/me rejected with 401');

  const unauthPatchMe = await request('PATCH', '/api/me', { fullName: 'Hacker' });
  assert(unauthPatchMe.status === 401, 'Unauthenticated PATCH /api/me rejected with 401');

  const unauthChangePw = await request('POST', '/api/auth/change-password', { currentPassword: 'a', newPassword: 'b' });
  assert(unauthChangePw.status === 401, 'Unauthenticated POST /api/auth/change-password rejected with 401');

  const unauthRx = await request('GET', '/api/prescriptions');
  assert(unauthRx.status === 401, 'Unauthenticated GET /api/prescriptions rejected with 401');

  const unauthOptom = await request('GET', '/api/optometrist/prescriptions');
  assert(unauthOptom.status === 401, 'Unauthenticated GET /api/optometrist/prescriptions rejected with 401');

  console.log('\n[Step 3] Profile Retrieval and Data Validation (GET /api/me)...');
  const meRes = await request('GET', '/api/me', null, tokenCustomerA);
  assert(meRes.status === 200, 'GET /api/me returns 200');
  assert(meRes.body.user.email === uniqueCustomerAEmail, 'User email verified');
  assert('defaultShippingAddress' in meRes.body.user, 'defaultShippingAddress field present in user profile');
  assert('preferences' in meRes.body.user, 'preferences field present in user profile');
  assert(!meRes.body.user.password_hash, 'Password hash is strictly excluded from response');

  console.log('\n[Step 4] Profile Updating with Safe Mutable Fields (PATCH /api/me)...');
  const updatedCustomerAPhone = `+254${Math.floor(720000000 + Math.random() * 89999999)}`;
  const patchRes = await request('PATCH', '/api/me', {
    fullName: 'Grace Wanjiku Updated',
    phone: updatedCustomerAPhone,
    defaultShippingAddress: 'Corner Plaza, 4th Floor, Suite 402, Westlands, Nairobi',
    preferences: { smsNotifications: true, preferredFittingLocation: 'Westlands Atelier' }
  }, tokenCustomerA);
  assert(patchRes.status === 200, 'PATCH /api/me returns 200');
  assert(patchRes.body.user.fullName === 'Grace Wanjiku Updated', 'fullName successfully updated');
  assert(patchRes.body.user.phone === updatedCustomerAPhone, 'phone successfully updated');
  assert(patchRes.body.user.defaultShippingAddress.includes('Corner Plaza'), 'defaultShippingAddress successfully updated');
  assert(patchRes.body.user.preferences.preferredFittingLocation === 'Westlands Atelier', 'preferences successfully updated');

  console.log('\n[Step 5] Privilege Escalation Prevention (PATCH /api/me)...');
  const exploitRole = await request('PATCH', '/api/me', { role: 'ADMIN' }, tokenCustomerA);
  assert(exploitRole.status === 400, 'Client attempt to elevate role to ADMIN rejected with 400');
  assert(exploitRole.body.code === 'UNAUTHORIZED_ROLE_MODIFICATION', 'Returns UNAUTHORIZED_ROLE_MODIFICATION code');

  const exploitOptom = await request('PATCH', '/api/me', { role: 'OPTOMETRIST' }, tokenCustomerA);
  assert(exploitOptom.status === 400, 'Client attempt to elevate role to OPTOMETRIST rejected with 400');

  // Verify role remained CUSTOMER
  const verifyRole = await request('GET', '/api/me', null, tokenCustomerA);
  assert(verifyRole.body.user.role === 'CUSTOMER', 'Customer role remained securely intact as CUSTOMER');

  console.log('\n[Step 6] Immutable Field Protection (PATCH /api/me)...');
  const exploitEmail = await request('PATCH', '/api/me', { email: 'hacked@eyekart.ke' }, tokenCustomerA);
  assert(exploitEmail.status === 400, 'Attempt to mutate email via PATCH /api/me rejected with 400');
  assert(exploitEmail.body.code === 'IMMUTABLE_FIELD_MODIFICATION', 'Returns IMMUTABLE_FIELD_MODIFICATION code');

  const exploitId = await request('PATCH', '/api/me', { id: '00000000-0000-0000-0000-000000000000' }, tokenCustomerA);
  assert(exploitId.status === 400, 'Attempt to mutate account ID rejected with 400');

  console.log('\n[Step 7] Password Change Lifecycle (POST /api/auth/change-password)...');
  // 7a. Incorrect current password
  const badOldPw = await request('POST', '/api/auth/change-password', {
    currentPassword: 'WrongPassword123!',
    newPassword: 'NewValidPassword2026!'
  }, tokenCustomerA);
  assert(badOldPw.status === 400 && badOldPw.body.code === 'INVALID_CURRENT_PASSWORD', 'Bad current password rejected with 400 INVALID_CURRENT_PASSWORD');

  // 7b. New password too short
  const shortNewPw = await request('POST', '/api/auth/change-password', {
    currentPassword: 'CustomerSecurePassword2026!',
    newPassword: 'short'
  }, tokenCustomerA);
  assert(shortNewPw.status === 400 && shortNewPw.body.code === 'PASSWORD_TOO_SHORT', 'Short password rejected with 400 PASSWORD_TOO_SHORT');

  // 7c. Valid password change
  const validPwChange = await request('POST', '/api/auth/change-password', {
    currentPassword: 'CustomerSecurePassword2026!',
    newPassword: 'BrandNewSecurePassword2026!'
  }, tokenCustomerA);
  assert(validPwChange.status === 200, 'Valid password change returns 200');

  // 7d. Verify login with new password
  const newLogin = await request('POST', '/api/auth/login', {
    email: uniqueCustomerAEmail,
    password: 'BrandNewSecurePassword2026!'
  });
  assert(newLogin.status === 200, 'Successfully logged in with newly changed password');
  tokenCustomerA = newLogin.body.token;

  console.log('\n[Step 8] Refractive Parameter Validation (POST /api/prescriptions)...');
  // 8a. Out of bounds sphere (> 20 diopters)
  const badSphere = await request('POST', '/api/prescriptions', {
    values: { od_sph: -25.50, os_sph: -2.00 }
  }, tokenCustomerA);
  assert(badSphere.status === 400 && badSphere.body.code === 'INVALID_SPHERE', 'Out-of-bounds sphere (-25.50) rejected with 400 INVALID_SPHERE');

  // 8b. Cylinder without axis
  const cylNoAxis = await request('POST', '/api/prescriptions', {
    values: { od_sph: -2.00, od_cyl: -1.25 } // missing od_axis
  }, tokenCustomerA);
  assert(cylNoAxis.status === 400 && cylNoAxis.body.code === 'CYL_REQUIRES_AXIS', 'Cylinder without axis rejected with 400 CYL_REQUIRES_AXIS');

  // 8c. Valid refractive parameters
  const validDraftRx = await request('POST', '/api/prescriptions', {
    values: {
      od_sph: -2.25,
      od_cyl: -0.75,
      od_axis: 90,
      od_add: 1.50,
      os_sph: -2.00,
      os_cyl: -0.50,
      os_axis: 85,
      os_add: 1.50,
      pd: 63.0
    },
    patientNote: 'Astigmatism correction for reading and office computer work.'
  }, tokenCustomerA);
  assert(validDraftRx.status === 201, 'Valid prescription created with 201');
  assert(validDraftRx.body.prescription.status === 'DRAFT', 'Initial status is DRAFT');
  assert(validDraftRx.body.prescription.current_revision === 1, 'Initial revision is 1');
  const rxId1 = validDraftRx.body.prescription.id;

  console.log('\n[Step 9] Medical Document Attachment & IDOR Protection...');
  // Customer A uploads document
  const docUploadA = await request('POST', '/api/storage/confirm-upload', {
    purpose: 'PRESCRIPTION',
    objectKey: `prescriptions/test_${Date.now()}_rx.pdf`,
    fileName: 'prescription_scan_customerA.pdf',
    mimeType: 'application/pdf',
    fileContentBase64: Buffer.from('%PDF-1.4 test prescription optical data').toString('base64')
  }, tokenCustomerA);
  assert(docUploadA.status === 201 && docUploadA.body?.document?.id, 'Customer A generated stored document upload record');
  const docIdA = docUploadA.body.document.id;

  // Customer B attempts to attach Customer A's document to Customer B's prescription
  const docTheftAttempt = await request('POST', '/api/prescriptions', {
    values: { od_sph: -1.00, os_sph: -1.00, pd: 62.0 },
    documentId: docIdA
  }, tokenCustomerB);
  assert(docTheftAttempt.status === 403, 'Cross-user document attachment rejected with 403');
  assert(docTheftAttempt.body.code === 'FORBIDDEN_DOCUMENT_ACCESS', 'Returns FORBIDDEN_DOCUMENT_ACCESS');

  // Customer A successfully attaches own document
  const validDocRx = await request('POST', '/api/prescriptions', {
    values: { od_sph: -1.00, os_sph: -1.00, pd: 62.0 },
    documentId: docIdA
  }, tokenCustomerA);
  assert(validDocRx.status === 201, 'Customer A successfully attaches own medical document');
  assert(validDocRx.body.prescription.document_id === docIdA, 'document_id is linked to prescription');

  console.log('\n[Step 10] Draft Prescription Modification (PUT /api/prescriptions/:id)...');
  const updateDraft = await request('PUT', `/api/prescriptions/${rxId1}`, {
    values: {
      od_sph: -2.50,
      od_cyl: -0.75,
      od_axis: 90,
      os_sph: -2.25,
      os_cyl: -0.50,
      os_axis: 85,
      pd: 63.5
    },
    patientNote: 'Updated notes after rechecking with trial frame.'
  }, tokenCustomerA);
  assert(updateDraft.status === 200, 'PUT /api/prescriptions/:id returns 200 for draft');
  assert(Number(updateDraft.body.prescription.currentRevision.od_sph) === -2.50, 'Revision 1 od_sph updated in place');
  assert(updateDraft.body.prescription.notes === 'Updated notes after rechecking with trial frame.', 'Notes updated');

  console.log('\n[Step 11] Draft Prescription Deletion (DELETE /api/prescriptions/:id)...');
  // Create disposable draft
  const disposableRx = await request('POST', '/api/prescriptions', {
    values: { od_sph: -0.50, os_sph: -0.50, pd: 60.0 }
  }, tokenCustomerA);
  const dispId = disposableRx.body.prescription.id;
  
  // Customer B cannot delete Customer A's draft
  const deleteForbidden = await request('DELETE', `/api/prescriptions/${dispId}`, null, tokenCustomerB);
  assert(deleteForbidden.status === 403, 'Customer B cannot delete Customer A draft (403)');

  // Customer A deletes own draft
  const deleteSuccess = await request('DELETE', `/api/prescriptions/${dispId}`, null, tokenCustomerA);
  assert(deleteSuccess.status === 200, 'Customer A deletes own draft successfully (200)');

  // Verify deletion
  const checkGone = await request('GET', `/api/prescriptions/${dispId}`, null, tokenCustomerA);
  assert(checkGone.status === 404, 'Deleted draft prescription returns 404');

  console.log('\n[Step 12] Prescription Submission to Clinical Queue (POST /api/prescriptions/:id/submit)...');
  const submitRes = await request('POST', `/api/prescriptions/${rxId1}/submit`, null, tokenCustomerA);
  assert(submitRes.status === 200, 'POST /api/prescriptions/:id/submit returns 200');
  assert(submitRes.body.prescription.status === 'PENDING_OPTOMETRIST_REVIEW', 'Status transitioned to PENDING_OPTOMETRIST_REVIEW');

  console.log('\n[Step 13] Immutability of Submitted Prescriptions...');
  // Cannot PUT to submitted prescription
  const mutateSubmitted = await request('PUT', `/api/prescriptions/${rxId1}`, {
    values: { od_sph: -5.00 }
  }, tokenCustomerA);
  assert(mutateSubmitted.status === 400 && mutateSubmitted.body.code === 'CANNOT_MUTATE_NON_DRAFT_PRESCRIPTION', 'Direct PUT to submitted prescription rejected with 400 CANNOT_MUTATE_NON_DRAFT_PRESCRIPTION');

  // Cannot DELETE submitted prescription
  const deleteSubmitted = await request('DELETE', `/api/prescriptions/${rxId1}`, null, tokenCustomerA);
  assert(deleteSubmitted.status === 400 && deleteSubmitted.body.code === 'CANNOT_DELETE_ACTIVE_PRESCRIPTION', 'DELETE of submitted prescription rejected with 400 CANNOT_DELETE_ACTIVE_PRESCRIPTION');

  console.log('\n[Step 14] Prescription IDOR Protection...');
  const idorRxGet = await request('GET', `/api/prescriptions/${rxId1}`, null, tokenCustomerB);
  assert(idorRxGet.status === 403 && idorRxGet.body.code === 'FORBIDDEN_PRESCRIPTION_ACCESS', 'Customer B prevented from viewing Customer A prescription with 403 FORBIDDEN_PRESCRIPTION_ACCESS');

  console.log('\n[Step 15] Clinical Queue Role-Based Access Control...');
  const customerQueue = await request('GET', '/api/optometrist/prescriptions', null, tokenCustomerA);
  assert(customerQueue.status === 403, 'Customer rejected from clinical queue with 403 FORBIDDEN_ROLE');

  const staffQueue = await request('GET', '/api/optometrist/prescriptions', null, tokenStaff);
  assert(staffQueue.status === 403, 'Store staff rejected from clinical queue with 403 FORBIDDEN_ROLE');

  const optomQueue = await request('GET', '/api/optometrist/prescriptions', null, tokenOptom);
  assert(optomQueue.status === 200, 'Optometrist receives clinical queue with 200');
  assert(Array.isArray(optomQueue.body.queue), 'Clinical queue is an array');
  const inQueue = optomQueue.body.queue.some(item => item.id === rxId1);
  assert(inQueue, 'Submitted prescription rxId1 is present in clinical review queue');

  console.log('\n[Step 16] Prevention of Client-Side Reviewer & Status Spoofing...');
  const statusSpoof = await request('PATCH', `/api/prescriptions/${rxId1}`, { status: 'APPROVED' }, tokenCustomerA);
  assert(statusSpoof.status === 403 && statusSpoof.body.code === 'FORBIDDEN_STATUS_MODIFICATION', 'Client attempt to force status: APPROVED rejected with 403');

  const reviewerSpoof = await request('PATCH', `/api/prescriptions/${rxId1}`, { reviewerId: 'fake-id' }, tokenCustomerA);
  assert(reviewerSpoof.status === 403 && reviewerSpoof.body.code === 'FORBIDDEN_REVIEWER_SPOOF', 'Client attempt to inject reviewer identity rejected with 403');

  console.log('\n[Step 17] Optometrist Clarification Request & Customer Revision Resubmission...');
  // 17a. Optometrist requests clarification
  const clarifyReq = await request('POST', `/api/optometrist/prescriptions/${rxId1}/clarification`, {
    reason: 'Please confirm whether cylinder axis 90 was measured under dilated refraction.'
  }, tokenOptom);
  assert(clarifyReq.status === 200, 'Optometrist clarification request returns 200');
  assert(clarifyReq.body.prescription.status === 'CLARIFICATION_REQUIRED', 'Prescription status is CLARIFICATION_REQUIRED');

  // 17b. Customer submits Revision 2
  const clarifyResp = await request('POST', `/api/prescriptions/${rxId1}/clarification`, {
    values: {
      od_sph: -2.50,
      od_cyl: -0.75,
      od_axis: 92,
      os_sph: -2.25,
      os_cyl: -0.50,
      os_axis: 85,
      pd: 63.5
    },
    patientNote: 'Confirmed with Dr. Waweru clinic card: axis 92.'
  }, tokenCustomerA);
  assert(clarifyResp.status === 200, 'Customer clarification response returns 200');
  assert(clarifyResp.body.prescription.status === 'PENDING_OPTOMETRIST_REVIEW', 'Status returns to PENDING_OPTOMETRIST_REVIEW');
  assert(clarifyResp.body.prescription.current_revision === 2, 'Revision number incremented to 2');

  console.log('\n[Step 18] Optometrist Approval Workflow & Order Synchronization...');
  // Customer creates order linked to prescription rxId1
  const quoteRes = await request('POST', '/api/checkout/quote', {
    items: [{ sku: 'EK-915', qty: 1 }]
  }, tokenCustomerA);
  assert(quoteRes.status === 201 && quoteRes.body?.quote?.id, 'Checkout quote generated successfully');
  const quoteId = quoteRes.body.quote.id;

  const orderRes = await request('POST', '/api/orders', {
    quoteId,
    prescriptionId: rxId1,
    deliveryAddress: 'Corner Plaza, 4th Floor, Westlands, Nairobi'
  }, tokenCustomerA);
  assert(orderRes.status === 201, 'Order created with linked prescription');
  assert(orderRes.body.order.requires_prescription_review === true, 'Order requires prescription review');
  assert(orderRes.body.order.prescription_status === 'PENDING_OPTOMETRIST_REVIEW', 'Initial order prescription status is PENDING_OPTOMETRIST_REVIEW');
  const linkedOrderId = orderRes.body.order.id;

  // Optometrist approves prescription rxId1
  const approveRes = await request('POST', `/api/optometrist/prescriptions/${rxId1}/approve`, {
    notes: 'Prescription verified against revision 2. Approved for German CNC diamond bevel surfacing.'
  }, tokenOptom);
  assert(approveRes.status === 200, 'Optometrist approval returns 200');
  assert(approveRes.body.prescription.status === 'APPROVED', 'Prescription status is APPROVED');

  // Verify order prescription_status automatically synchronized to APPROVED
  const syncedOrder = await request('GET', `/api/orders/${linkedOrderId}`, null, tokenCustomerA);
  assert(syncedOrder.body.order.prescription_status === 'APPROVED', 'Linked order prescription_status synchronized to APPROVED');

  // Verify approved prescription is strictly immutable
  const mutateApproved = await request('PUT', `/api/prescriptions/${rxId1}`, { values: { od_sph: -3.00 } }, tokenCustomerA);
  assert(mutateApproved.status === 400, 'Approved prescription cannot be modified (400)');

  console.log('\n[Step 19] Order ↔ Prescription Cross-Customer Theft Prevention...');
  // Customer B creates quote
  const quoteB = await request('POST', '/api/checkout/quote', {
    items: [{ sku: 'EK-505', qty: 1 }]
  }, tokenCustomerB);
  assert(quoteB.status === 201 && quoteB.body?.quote?.id, 'Customer B quote generated successfully');

  // Customer B attempts to create order linking Customer A's prescription rxId1
  const theftOrder = await request('POST', '/api/orders', {
    quoteId: quoteB.body.quote.id,
    prescriptionId: rxId1, // Customer A's prescription!
    deliveryAddress: 'Kilimani, Nairobi, Kenya'
  }, tokenCustomerB);
  assert(theftOrder.status === 403, 'Cross-customer prescription theft in order creation blocked with 403');
  assert(theftOrder.body.code === 'FORBIDDEN_PRESCRIPTION_ACCESS', 'Returns FORBIDDEN_PRESCRIPTION_ACCESS');

  console.log('\n[Step 20] Optometrist Rejection Workflow with Clinical Rationale...');
  // Create another prescription to test rejection
  const rxToReject = await request('POST', '/api/prescriptions', {
    values: { od_sph: -1.50, os_sph: -1.50, pd: 62.0 },
    autoSubmit: true
  }, tokenCustomerA);
  const rejectRxId = rxToReject.body.prescription.id;

  const rejectRes = await request('POST', `/api/optometrist/prescriptions/${rejectRxId}/reject`, {
    reason: 'Prescription expired: clinical test date older than 24 months. Re-examination required.'
  }, tokenOptom);
  assert(rejectRes.status === 200, 'Prescription rejection returns 200');
  assert(rejectRes.body.prescription.status === 'REJECTED', 'Prescription status is REJECTED');

  console.log('\n================================================================');
  console.log(`PHASE 6 AUTOMATED VERIFICATION PASSED: ${passedChecks}/${totalChecks} assertions`);
  console.log('================================================================\n');
}

runPhase6Tests().catch((err) => {
  console.error('\n❌ TEST RUN ABORTED WITH ERROR:');
  console.error(err);
  process.exit(1);
});
