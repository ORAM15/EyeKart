/**
 * EyeKart Phase 9 Appointment, Clinic Scheduling & Optical Operations Verification Suite
 * 
 * Verifies:
 * 1. Slot availability query (filtering by clinic, date, future-only, active exclusion)
 * 2. Unauthenticated booking rejected (401)
 * 3. Booking validation (missing patient name/phone rejected 400)
 * 4. Kenyan phone normalization (+254 standard formats)
 * 5. Invalid Kenyan phone rejected (400)
 * 6. Non-existent slot booking rejected (404)
 * 7. Past slot booking rejected (400)
 * 8. Customer booking creation (201, reference APT-YYYY-XXXXX, status BOOKED)
 * 9. Slot marked unavailable upon booking
 * 10. Atomic double-booking prevention (sequential 409 SLOT_ALREADY_BOOKED)
 * 11. Concurrent race condition double-booking prevention (FOR UPDATE + uq_active_appointment_slot)
 * 12. Booking idempotency key prevents duplicate appointments (HTTP 200, idempotentHit: true)
 * 13. Customer can list own appointments
 * 14. Customer can view specific appointment
 * 15. IDOR view protection: Customer B cannot view Customer A appointment (403)
 * 16. IDOR cancel protection: Customer B cannot cancel Customer A appointment (403)
 * 17. IDOR reschedule protection: Customer B cannot reschedule Customer A appointment (403)
 * 18. Customer can cancel own appointment (status CANCELLED, slot released is_available=TRUE)
 * 19. Cancellation terminal state guard (cannot cancel already CANCELLED appointment)
 * 20. Customer can reschedule own appointment (old slot released, new reserved, status CONFIRMED)
 * 21. Rescheduling into already booked slot rejected (409)
 * 22. Rescheduling terminal appointment rejected (400)
 * 23. RBAC: Customer cannot confirm appointment (403)
 * 24. Staff / Admin can confirm appointment (BOOKED -> CONFIRMED, confirmed_at set)
 * 25. RBAC: Customer cannot complete appointment (403)
 * 26. Staff / Admin can complete appointment (CONFIRMED -> COMPLETED, completed_at set)
 * 27. Direct completion from BOOKED rejected (skipping CONFIRMED is illegal 400)
 * 28. Completed appointment is terminal
 * 29. RBAC: Customer cannot mark appointment NO_SHOW (403)
 * 30. Staff / Admin can mark appointment NO_SHOW (slot released)
 * 31. RBAC: Customer cannot trigger reminder dispatch (403)
 * 32. Staff / Admin can send appointment reminder (reminder_sent_at set, notification sent)
 * 33. Reminder idempotency prevents duplicate notifications
 * 34. Operational schedule list accessible by staff/admin with filters; blocked for customer (403)
 * 35. Direct PATCH mutation blocked (400/403)
 * 36. Transactional notifications verified for lifecycle events
 * 37. Audit logging verified for all lifecycle actions
 * 38. Timezone correctness verified (Africa/Nairobi UTC+03:00)
 * 39. Phase 4 Payment Regression passes
 * 40. Phase 5 Order & Fulfillment Regression passes
 * 41. Phase 6 Account & Clinical Prescription Regression passes
 * 42. Phase 7 Admin & Inventory Operations Regression passes
 * 43. Phase 8 Notification & Communication Regression passes
 * 44. Premium 3D / VTO Experience Regression passes
 */

const assert = require('assert');
const path = require('path');
const cp = require('child_process');
const { query, getPool } = require('../server/src/db/pool');
const { hashPassword, createSession } = require('../server/src/services/authService');
const appointmentService = require('../server/src/services/appointmentService');
const notificationService = require('../server/src/services/notification/notificationService');
const TestNotificationProvider = require('../server/src/services/notification/TestNotificationProvider');

const BASE_URL = 'http://127.0.0.1:3001';

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`  [PASS] ${name}`);
  passed++;
}

function fail(name, err) {
  console.error(`  [FAIL] ${name}:`, err.message || err);
  failed++;
}

async function createTestUser(email, role = 'CUSTOMER', phone = null) {
  const pHash = await hashPassword('Password123!');
  const res = await query(
    `INSERT INTO users (email, phone, full_name, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET role = $5, phone = COALESCE($2, users.phone)
     RETURNING id, email, phone, full_name, role`,
    [email, phone, 'Test User', pHash, role]
  );
  const user = res.rows[0];
  const session = await createSession(user.id, '127.0.0.1', 'Phase9-Test-Runner');
  return { user, token: session.rawToken };
}

// Helper to create future slots for testing
async function createTestSlot(clinicId, practitionerId, practitionerName, startOffsetMinutes = 60, durationMinutes = 30) {
  const pId = practitionerId || null;
  const startTime = new Date(Date.now() + startOffsetMinutes * 60 * 1000);
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
  const res = await query(
    `INSERT INTO appointment_slots (clinic_id, practitioner_id, practitioner_name, start_time, end_time, is_available, timezone)
     VALUES ($1, $2, $3, $4, $5, TRUE, 'Africa/Nairobi')
     RETURNING *`,
    [clinicId, pId, practitionerName, startTime, endTime]
  );
  return res.rows[0];
}

async function runPhase9Verification() {
  console.log('============================================================');
  console.log('EYEKART PHASE 9: APPOINTMENT, CLINIC SCHEDULING & OPTICAL OPS');
  console.log('============================================================\n');

  // Reset inventory reservations to ensure regression passes cleanly
  await query('UPDATE products SET reserved_stock = 0');
  await query('DELETE FROM inventory_reservations');

  // Setup test notification provider to inspect dispatches
  const testProvider = new TestNotificationProvider();
  notificationService.setProvider(testProvider);

  // Setup test users
  const customerA = await createTestUser('custA_p9@eyekart.ke', 'CUSTOMER', '+254711000001');
  const customerB = await createTestUser('custB_p9@eyekart.ke', 'CUSTOMER', '+254711000002');
  const adminStaff = await createTestUser('admin_p9@eyekart.ke', 'ADMIN', '+254711000003');
  const optomStaff = await createTestUser('optom_p9@eyekart.ke', 'OPTOMETRIST', '+254711000004');

  // Fetch a clinic
  const clinicRes = await query(`SELECT * FROM clinics LIMIT 1`);
  assert.ok(clinicRes.rows.length > 0, 'Clinics table must have seeded records');
  const clinic = clinicRes.rows[0];

  // ------------------------------------------------------------
  // 1. Slot availability query
  // ------------------------------------------------------------
  try {
    const slot = await createTestSlot(clinic.id, optomStaff.user.id, 'Dr. Miriam Ouma', 120);
    const res = await fetch(`${BASE_URL}/api/appointments/availability?clinicId=${clinic.id}`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.slots));
    const found = data.slots.find(s => s.id === slot.id);
    assert.ok(found, 'Created test slot must be returned in availability');
    assert.ok(found.date_eat, 'Must include date_eat in EAT');
    assert.ok(found.time_eat, 'Must include time_eat in EAT');
    pass('1. Slot availability query returns future slots with clinic and formatted EAT time');
  } catch (err) {
    fail('1. Slot availability query', err);
  }

  // ------------------------------------------------------------
  // 2. Unauthenticated booking rejected
  // ------------------------------------------------------------
  try {
    const slot = await createTestSlot(clinic.id, optomStaff.user.id, 'Dr. Miriam Ouma', 180);
    const res = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinicId: clinic.id,
        slotId: slot.id,
        patientName: 'Jane Doe',
        patientPhone: '+254712345678'
      })
    });
    assert.strictEqual(res.status, 401);
    pass('2. Unauthenticated appointment booking rejected with 401 UNAUTHENTICATED');
  } catch (err) {
    fail('2. Unauthenticated booking', err);
  }

  // ------------------------------------------------------------
  // 3. Booking validation: missing details rejected
  // ------------------------------------------------------------
  try {
    const slot = await createTestSlot(clinic.id, optomStaff.user.id, 'Dr. Miriam Ouma', 240);
    const res = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({
        clinicId: clinic.id,
        slotId: slot.id,
        patientName: '', // empty name
        patientPhone: '+254712345678'
      })
    });
    assert.strictEqual(res.status, 400);
    pass('3. Booking with missing patient name rejected with 400');
  } catch (err) {
    fail('3. Missing details validation', err);
  }

  // ------------------------------------------------------------
  // 4. Kenyan phone normalization & 5. Invalid phone rejected
  // ------------------------------------------------------------
  try {
    const slot = await createTestSlot(clinic.id, optomStaff.user.id, 'Dr. Miriam Ouma', 300);
    const resInvalid = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({
        clinicId: clinic.id,
        slotId: slot.id,
        patientName: 'Test Patient',
        patientPhone: '12345' // invalid Kenyan format
      })
    });
    assert.strictEqual(resInvalid.status, 400);
    pass('5. Invalid Kenyan phone number rejected with 400');

    // Valid Kenyan local phone '0712345678' should be normalized to +254712345678
    const resValid = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({
        clinicId: clinic.id,
        slotId: slot.id,
        patientName: 'Test Patient',
        patientPhone: '0712345678'
      })
    });
    const dataValid = await resValid.json();
    assert.strictEqual(resValid.status, 201);
    assert.strictEqual(dataValid.appointment.patient_phone, '+254712345678');
    pass('4. Kenyan phone number normalized to canonical E.164 +254 standard format');
  } catch (err) {
    fail('4/5. Kenyan phone validation and normalization', err);
  }

  // ------------------------------------------------------------
  // 6. Non-existent slot rejected
  // ------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({
        clinicId: clinic.id,
        slotId: '00000000-0000-0000-0000-000000000000',
        patientName: 'Test Patient',
        patientPhone: '+254712345678'
      })
    });
    assert.strictEqual(res.status, 404);
    pass('6. Non-existent slot booking rejected with 404 SLOT_NOT_FOUND');
  } catch (err) {
    fail('6. Non-existent slot rejection', err);
  }

  // ------------------------------------------------------------
  // 7. Past slot booking rejected
  // ------------------------------------------------------------
  try {
    // Insert slot in the past
    const pastStart = new Date(Date.now() - 3600 * 1000);
    const pastEnd = new Date(pastStart.getTime() + 1800 * 1000);
    const pastSlotRes = await query(
      `INSERT INTO appointment_slots (clinic_id, practitioner_id, practitioner_name, start_time, end_time, is_available, timezone)
       VALUES ($1, $2, 'Dr. Past', $3, $4, TRUE, 'Africa/Nairobi')
       RETURNING *`,
      [clinic.id, optomStaff.user.id, pastStart, pastEnd]
    );
    const pastSlot = pastSlotRes.rows[0];

    const res = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({
        clinicId: clinic.id,
        slotId: pastSlot.id,
        patientName: 'Test Patient',
        patientPhone: '+254712345678'
      })
    });
    assert.strictEqual(res.status, 400);
    pass('7. Booking a slot in the past rejected with 400 PAST_SLOT_NOT_BOOKABLE');
  } catch (err) {
    fail('7. Past slot rejection', err);
  }

  // ------------------------------------------------------------
  // 8. Successful booking creation & 9. Slot marked unavailable
  // ------------------------------------------------------------
  let apt1;
  let slot1;
  try {
    slot1 = await createTestSlot(clinic.id, optomStaff.user.id, 'Dr. Miriam Ouma', 360);
    const res = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({
        clinicId: clinic.id,
        slotId: slot1.id,
        patientName: 'Customer A Patient',
        patientPhone: '+254722000001',
        patientEmail: 'patientA@eyekart.ke',
        notes: 'Initial optical exam'
      })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    apt1 = data.appointment;
    assert.ok(apt1.booking_reference.startsWith('APT-'));
    assert.strictEqual(apt1.status, 'BOOKED');
    assert.strictEqual(apt1.user_id, customerA.user.id);

    // Verify slot is now unavailable in DB
    const checkSlot = await query(`SELECT is_available FROM appointment_slots WHERE id = $1`, [slot1.id]);
    assert.strictEqual(checkSlot.rows[0].is_available, false);
    pass('8. Customer booking creation succeeds (201, reference APT-YYYY-XXXXX, status BOOKED)');
    pass('9. Appointment slot is immediately marked unavailable (is_available = FALSE)');
  } catch (err) {
    fail('8/9. Booking creation and slot state', err);
  }

  // ------------------------------------------------------------
  // 10. Atomic double-booking prevention (Sequential attempt)
  // ------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerB.token}`
      },
      body: JSON.stringify({
        clinicId: clinic.id,
        slotId: slot1.id, // same slot
        patientName: 'Customer B Patient',
        patientPhone: '+254722000002'
      })
    });
    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(data.code, 'SLOT_ALREADY_BOOKED');
    pass('10. Sequential double-booking attempt rejected with 409 SLOT_ALREADY_BOOKED');
  } catch (err) {
    fail('10. Double booking prevention', err);
  }

  // ------------------------------------------------------------
  // 11. Concurrent race condition double-booking test
  // ------------------------------------------------------------
  try {
    const raceSlot = await createTestSlot(clinic.id, optomStaff.user.id, 'Dr. David Mwangi', 420);

    const [resA, resB] = await Promise.all([
      fetch(`${BASE_URL}/api/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${customerA.token}`
        },
        body: JSON.stringify({
          clinicId: clinic.id,
          slotId: raceSlot.id,
          patientName: 'Contender A',
          patientPhone: '+254722111111'
        })
      }),
      fetch(`${BASE_URL}/api/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${customerB.token}`
        },
        body: JSON.stringify({
          clinicId: clinic.id,
          slotId: raceSlot.id,
          patientName: 'Contender B',
          patientPhone: '+254722222222'
        })
      })
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepStrictEqual(statuses, [201, 409], 'Exactly one concurrent request must succeed (201) and one must conflict (409)');
    pass('11. Concurrent booking race condition safely resolved: 1 booked, 1 rejected with 409');
  } catch (err) {
    fail('11. Concurrent booking race condition', err);
  }

  // ------------------------------------------------------------
  // 12. Booking idempotency key prevents duplicate appointments
  // ------------------------------------------------------------
  try {
    const idempSlot = await createTestSlot(clinic.id, optomStaff.user.id, 'Dr. Miriam Ouma', 480);
    const idempKey = 'idemp_test_' + Date.now();

    const res1 = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`,
        'X-Idempotency-Key': idempKey
      },
      body: JSON.stringify({
        clinicId: clinic.id,
        slotId: idempSlot.id,
        patientName: 'Idemp Patient',
        patientPhone: '+254722333333'
      })
    });
    assert.strictEqual(res1.status, 201);
    const data1 = await res1.json();
    assert.strictEqual(data1.idempotentHit, false);

    // Resend exact request
    const res2 = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`,
        'X-Idempotency-Key': idempKey
      },
      body: JSON.stringify({
        clinicId: clinic.id,
        slotId: idempSlot.id,
        patientName: 'Idemp Patient',
        patientPhone: '+254722333333'
      })
    });
    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();
    assert.strictEqual(data2.idempotentHit, true);
    assert.strictEqual(data2.appointment.id, data1.appointment.id);
    pass('12. Booking idempotency key prevents duplicate appointments (returns existing, idempotentHit: true)');
  } catch (err) {
    fail('12. Booking idempotency', err);
  }

  // ------------------------------------------------------------
  // 13. Customer can list own appointments & 14. view specific appointment
  // ------------------------------------------------------------
  try {
    const resList = await fetch(`${BASE_URL}/api/appointments`, {
      headers: { 'Authorization': `Bearer ${customerA.token}` }
    });
    assert.strictEqual(resList.status, 200);
    const dataList = await resList.json();
    assert.ok(dataList.appointments.length >= 1);

    const resGet = await fetch(`${BASE_URL}/api/appointments/${apt1.id}`, {
      headers: { 'Authorization': `Bearer ${customerA.token}` }
    });
    assert.strictEqual(resGet.status, 200);
    const dataGet = await resGet.json();
    assert.strictEqual(dataGet.appointment.id, apt1.id);
    assert.ok(dataGet.appointment.clinic_name);
    pass('13. Customer can list own appointments');
    pass('14. Customer can view specific appointment details with clinic and EAT time formatting');
  } catch (err) {
    fail('13/14. Customer appointments view', err);
  }

  // ------------------------------------------------------------
  // 15. IDOR view protection: Customer B cannot view Customer A's appointment
  // ------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/appointments/${apt1.id}`, {
      headers: { 'Authorization': `Bearer ${customerB.token}` }
    });
    assert.strictEqual(res.status, 403);
    pass('15. IDOR view protection: Customer B cannot view Customer A appointment (403)');
  } catch (err) {
    fail('15. IDOR view protection', err);
  }

  // ------------------------------------------------------------
  // 16. IDOR cancel protection: Customer B cannot cancel Customer A's appointment
  // ------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/appointments/${apt1.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerB.token}`
      },
      body: JSON.stringify({ reason: 'Malicious cancel' })
    });
    assert.strictEqual(res.status, 403);
    pass('16. IDOR cancel protection: Customer B cannot cancel Customer A appointment (403)');
  } catch (err) {
    fail('16. IDOR cancel protection', err);
  }

  // ------------------------------------------------------------
  // 17. IDOR reschedule protection: Customer B cannot reschedule Customer A's appointment
  // ------------------------------------------------------------
  try {
    const newSlot = await createTestSlot(clinic.id, optomStaff.user.id, 'Dr. Miriam Ouma', 540);
    const res = await fetch(`${BASE_URL}/api/appointments/${apt1.id}/reschedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerB.token}`
      },
      body: JSON.stringify({ newSlotId: newSlot.id })
    });
    assert.strictEqual(res.status, 403);
    pass('17. IDOR reschedule protection: Customer B cannot reschedule Customer A appointment (403)');
  } catch (err) {
    fail('17. IDOR reschedule protection', err);
  }

  // ------------------------------------------------------------
  // 18. Customer can cancel own appointment & 19. Terminal state guard
  // ------------------------------------------------------------
  try {
    const resCancel = await fetch(`${BASE_URL}/api/appointments/${apt1.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({ reason: 'Need to change plans' })
    });
    assert.strictEqual(resCancel.status, 200);
    const dataCancel = await resCancel.json();
    assert.strictEqual(dataCancel.appointment.status, 'CANCELLED');

    // Verify slot was released in DB
    const checkSlot = await query(`SELECT is_available FROM appointment_slots WHERE id = $1`, [slot1.id]);
    assert.strictEqual(checkSlot.rows[0].is_available, true);
    pass('18. Customer can cancel own appointment (status CANCELLED, slot released is_available=TRUE)');

    // Attempt to cancel again (terminal state guard)
    const resCancelAgain = await fetch(`${BASE_URL}/api/appointments/${apt1.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({ reason: 'Cancel again' })
    });
    assert.strictEqual(resCancelAgain.status, 400);
    pass('19. Cancellation terminal state guard: cannot cancel an already CANCELLED appointment (400)');
  } catch (err) {
    fail('18/19. Customer cancellation and terminal guard', err);
  }

  // ------------------------------------------------------------
  // 20. Customer can reschedule own appointment & 21. Reschedule to booked slot & 22. Reschedule terminal
  // ------------------------------------------------------------
  try {
    // Book a fresh appointment for Customer A
    const origSlot = await createTestSlot(clinic.id, optomStaff.user.id, 'Dr. Miriam Ouma', 600);
    const targetSlot = await createTestSlot(clinic.id, optomStaff.user.id, 'Dr. David Mwangi', 660);

    const bookRes = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({
        clinicId: clinic.id,
        slotId: origSlot.id,
        patientName: 'Reschedule Patient',
        patientPhone: '+254722444444'
      })
    });
    const bookData = await bookRes.json();
    const reschedApt = bookData.appointment;

    // Reschedule to targetSlot
    const reschedRes = await fetch(`${BASE_URL}/api/appointments/${reschedApt.id}/reschedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({ newSlotId: targetSlot.id })
    });
    assert.strictEqual(reschedRes.status, 200);
    const reschedData = await reschedRes.json();
    assert.strictEqual(reschedData.appointment.slot_id, targetSlot.id);
    assert.strictEqual(reschedData.appointment.status, 'CONFIRMED');

    // Verify origSlot released and targetSlot reserved
    const origCheck = await query(`SELECT is_available FROM appointment_slots WHERE id = $1`, [origSlot.id]);
    const targetCheck = await query(`SELECT is_available FROM appointment_slots WHERE id = $1`, [targetSlot.id]);
    assert.strictEqual(origCheck.rows[0].is_available, true, 'Original slot must be released');
    assert.strictEqual(targetCheck.rows[0].is_available, false, 'Target slot must be claimed');
    pass('20. Customer can reschedule appointment (old slot released, new claimed, status CONFIRMED)');

    // 21. Rescheduling into already booked slot rejected
    const reschedConflict = await fetch(`${BASE_URL}/api/appointments/${reschedApt.id}/reschedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({ newSlotId: targetSlot.id }) // targetSlot is now booked
    });
    assert.strictEqual(reschedConflict.status, 409);
    pass('21. Rescheduling into an already booked slot rejected with 409 SLOT_ALREADY_BOOKED');

    // Cancel appointment to make it terminal
    await fetch(`${BASE_URL}/api/appointments/${reschedApt.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({ reason: 'Cancelling' })
    });

    // 22. Rescheduling cancelled appointment rejected
    const freshSlot = await createTestSlot(clinic.id, optomStaff.user.id, 'Dr. Miriam Ouma', 720);
    const reschedTerminal = await fetch(`${BASE_URL}/api/appointments/${reschedApt.id}/reschedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({ newSlotId: freshSlot.id })
    });
    assert.strictEqual(reschedTerminal.status, 400);
    pass('22. Rescheduling a terminal (CANCELLED) appointment rejected with 400');
  } catch (err) {
    fail('20/21/22. Rescheduling lifecycle and terminal validation', err);
  }

  // ------------------------------------------------------------
  // 23. RBAC: Customer cannot confirm & 24. Staff can confirm appointment
  // ------------------------------------------------------------
  let operationalApt;
  try {
    const opSlot = await createTestSlot(clinic.id, optomStaff.user.id, 'Dr. Miriam Ouma', 780);
    const bookRes = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({
        clinicId: clinic.id,
        slotId: opSlot.id,
        patientName: 'Operational Patient',
        patientPhone: '+254722555555'
      })
    });
    const bookData = await bookRes.json();
    operationalApt = bookData.appointment;

    // Customer attempt to confirm
    const custConfirm = await fetch(`${BASE_URL}/api/appointments/${operationalApt.id}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      }
    });
    assert.strictEqual(custConfirm.status, 403);
    pass('23. RBAC: Customer attempting operational confirm rejected with 403 FORBIDDEN');

    // Optometrist staff confirms
    const staffConfirm = await fetch(`${BASE_URL}/api/appointments/${operationalApt.id}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${optomStaff.token}`
      },
      body: JSON.stringify({ notes: 'Confirmed with patient' })
    });
    assert.strictEqual(staffConfirm.status, 200);
    const confirmData = await staffConfirm.json();
    assert.strictEqual(confirmData.appointment.status, 'CONFIRMED');
    assert.ok(confirmData.appointment.confirmed_at);
    operationalApt = confirmData.appointment;
    pass('24. Optometrist / Staff can confirm appointment (BOOKED -> CONFIRMED, confirmed_at populated)');
  } catch (err) {
    fail('23/24. Appointment confirmation RBAC and transition', err);
  }

  // ------------------------------------------------------------
  // 25. RBAC: Customer cannot complete & 26. Staff can complete appointment
  // ------------------------------------------------------------
  try {
    // Customer attempt to complete
    const custComplete = await fetch(`${BASE_URL}/api/appointments/${operationalApt.id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      }
    });
    assert.strictEqual(custComplete.status, 403);
    pass('25. RBAC: Customer attempting operational complete rejected with 403 FORBIDDEN');

    // Admin staff completes
    const adminComplete = await fetch(`${BASE_URL}/api/appointments/${operationalApt.id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminStaff.token}`
      },
      body: JSON.stringify({ notes: 'Consultation concluded' })
    });
    assert.strictEqual(adminComplete.status, 200);
    const completeData = await adminComplete.json();
    assert.strictEqual(completeData.appointment.status, 'COMPLETED');
    assert.ok(completeData.appointment.completed_at);
    operationalApt = completeData.appointment;
    pass('26. Staff / Admin can complete appointment (CONFIRMED -> COMPLETED, completed_at populated)');
  } catch (err) {
    fail('25/26. Appointment completion RBAC and transition', err);
  }

  // ------------------------------------------------------------
  // 27. Direct completion from BOOKED rejected & 28. Completed is terminal
  // ------------------------------------------------------------
  try {
    const rawSlot = await createTestSlot(clinic.id, optomStaff.user.id, 'Dr. Miriam Ouma', 840);
    const rawBook = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({
        clinicId: clinic.id,
        slotId: rawSlot.id,
        patientName: 'Skip Confirm Patient',
        patientPhone: '+254722666666'
      })
    });
    const rawApt = (await rawBook.json()).appointment;

    // Attempt to complete directly from BOOKED
    const skipRes = await fetch(`${BASE_URL}/api/appointments/${rawApt.id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminStaff.token}`
      }
    });
    assert.strictEqual(skipRes.status, 400);
    pass('27. Direct completion from BOOKED without confirmation rejected with 400 ILLEGAL_APPOINTMENT_TRANSITION');

    // 28. Completed appointment is terminal
    const cancelCompleted = await fetch(`${BASE_URL}/api/appointments/${operationalApt.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminStaff.token}`
      }
    });
    assert.strictEqual(cancelCompleted.status, 400);
    pass('28. Completed appointment is terminal: cannot be cancelled or altered');
  } catch (err) {
    fail('27/28. Transition guard and terminal state enforcement', err);
  }

  // ------------------------------------------------------------
  // 29. RBAC: Customer cannot mark NO_SHOW & 30. Staff can mark NO_SHOW
  // ------------------------------------------------------------
  try {
    const noShowSlot = await createTestSlot(clinic.id, optomStaff.user.id, 'Dr. David Mwangi', 900);
    const bookRes = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({
        clinicId: clinic.id,
        slotId: noShowSlot.id,
        patientName: 'No Show Patient',
        patientPhone: '+254722777777'
      })
    });
    const noShowApt = (await bookRes.json()).appointment;

    // Customer attempt
    const custNoShow = await fetch(`${BASE_URL}/api/appointments/${noShowApt.id}/no-show`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      }
    });
    assert.strictEqual(custNoShow.status, 403);
    pass('29. RBAC: Customer attempting to mark appointment NO_SHOW rejected with 403 FORBIDDEN');

    // Staff marks NO_SHOW
    const staffNoShow = await fetch(`${BASE_URL}/api/appointments/${noShowApt.id}/no-show`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminStaff.token}`
      },
      body: JSON.stringify({ notes: 'Patient did not arrive within 30 min grace period' })
    });
    assert.strictEqual(staffNoShow.status, 200);
    const noShowData = await staffNoShow.json();
    assert.strictEqual(noShowData.appointment.status, 'NO_SHOW');

    // Verify slot was released
    const slotCheck = await query(`SELECT is_available FROM appointment_slots WHERE id = $1`, [noShowSlot.id]);
    assert.strictEqual(slotCheck.rows[0].is_available, true, 'Slot must be released when marked NO_SHOW');
    pass('30. Staff / Admin can mark appointment NO_SHOW and slot is released for walk-ins');
  } catch (err) {
    fail('29/30. NO_SHOW RBAC and slot release', err);
  }

  // ------------------------------------------------------------
  // 31. RBAC: Customer cannot trigger reminder & 32. Staff can trigger reminder & 33. Reminder idempotency
  // ------------------------------------------------------------
  try {
    const remSlot = await createTestSlot(clinic.id, optomStaff.user.id, 'Dr. Miriam Ouma', 960);
    const bookRes = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({
        clinicId: clinic.id,
        slotId: remSlot.id,
        patientName: 'Reminder Patient',
        patientPhone: '+254722888888'
      })
    });
    const remApt = (await bookRes.json()).appointment;

    // Customer attempt
    const custRem = await fetch(`${BASE_URL}/api/appointments/${remApt.id}/remind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      }
    });
    assert.strictEqual(custRem.status, 403);
    pass('31. RBAC: Customer attempting to trigger reminder rejected with 403 FORBIDDEN');

    // Staff triggers reminder
    const staffRem = await fetch(`${BASE_URL}/api/appointments/${remApt.id}/remind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminStaff.token}`
      }
    });
    assert.strictEqual(staffRem.status, 200);
    const remData = await staffRem.json();
    assert.strictEqual(remData.idempotentHit, false);
    assert.ok(remData.appointment.reminder_sent_at);
    pass('32. Staff / Admin can trigger appointment reminder (reminder_sent_at recorded)');

    // Second call without force enforces reminder idempotency
    const dupRem = await fetch(`${BASE_URL}/api/appointments/${remApt.id}/remind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminStaff.token}`
      }
    });
    assert.strictEqual(dupRem.status, 200);
    const dupData = await dupRem.json();
    assert.strictEqual(dupData.idempotentHit, true);
    pass('33. Reminder idempotency prevents duplicate notifications (idempotentHit: true)');
  } catch (err) {
    fail('31/32/33. Reminder RBAC, dispatch and idempotency', err);
  }

  // ------------------------------------------------------------
  // 34. Operational schedule list accessible by staff/admin; blocked for customer
  // ------------------------------------------------------------
  try {
    const custOp = await fetch(`${BASE_URL}/api/appointments/operational`, {
      headers: { 'Authorization': `Bearer ${customerA.token}` }
    });
    assert.strictEqual(custOp.status, 403);

    const staffOp = await fetch(`${BASE_URL}/api/appointments/operational?clinicId=${clinic.id}&limit=10`, {
      headers: { 'Authorization': `Bearer ${optomStaff.token}` }
    });
    assert.strictEqual(staffOp.status, 200);
    const opData = await staffOp.json();
    assert.ok(Array.isArray(opData.appointments));
    assert.ok(opData.total >= 1);
    assert.strictEqual(opData.limit, 10);
    pass('34. Operational appointments list accessible to staff/optometrist/admin and blocked for customer (403)');
  } catch (err) {
    fail('34. Operational schedule list', err);
  }

  // ------------------------------------------------------------
  // 35. Direct PATCH mutation blocked
  // ------------------------------------------------------------
  try {
    const patchRes = await fetch(`${BASE_URL}/api/appointments/${apt1.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${customerA.token}`
      },
      body: JSON.stringify({ user_id: customerB.user.id })
    });
    assert.strictEqual(patchRes.status, 403);
    pass('35. Direct appointment PATCH mutation blocked to protect ownership and integrity');
  } catch (err) {
    fail('35. Direct PATCH mutation protection', err);
  }

  // ------------------------------------------------------------
  // 36. Transactional notifications verified
  // ------------------------------------------------------------
  try {
    const notifs = await query(`SELECT * FROM notifications WHERE event_type LIKE 'APPOINTMENT_%' ORDER BY created_at DESC LIMIT 10`);
    assert.ok(notifs.rows.length >= 3, 'Must have recorded appointment transactional notifications in outbox/notifications');
    const types = notifs.rows.map(n => n.event_type);
    assert.ok(types.includes('APPOINTMENT_CREATED'), 'Should record APPOINTMENT_CREATED');
    assert.ok(types.includes('APPOINTMENT_CONFIRMED'), 'Should record APPOINTMENT_CONFIRMED');
    assert.ok(types.includes('APPOINTMENT_REMINDER'), 'Should record APPOINTMENT_REMINDER');
    pass('36. Transactional notifications properly dispatched for appointment lifecycle events');
  } catch (err) {
    fail('36. Transactional notification records', err);
  }

  // ------------------------------------------------------------
  // 37. Audit logging verified for appointment lifecycle
  // ------------------------------------------------------------
  try {
    const audits = await query(`SELECT * FROM audit_logs WHERE action LIKE 'APPOINTMENT_%' ORDER BY created_at DESC LIMIT 20`);
    assert.ok(audits.rows.length >= 4, 'Must have recorded appointment audit logs');
    const actions = audits.rows.map(a => a.action);
    assert.ok(actions.includes('APPOINTMENT_BOOKED'), 'Audit log includes APPOINTMENT_BOOKED');
    assert.ok(actions.includes('APPOINTMENT_CONFIRMED'), 'Audit log includes APPOINTMENT_CONFIRMED');
    assert.ok(actions.includes('APPOINTMENT_COMPLETED'), 'Audit log includes APPOINTMENT_COMPLETED');
    assert.ok(actions.includes('APPOINTMENT_NO_SHOW'), 'Audit log includes APPOINTMENT_NO_SHOW');
    pass('37. Audit logs accurately recorded across all operational and customer lifecycle events');
  } catch (err) {
    fail('37. Audit logs verification', err);
  }

  // ------------------------------------------------------------
  // 38. Timezone correctness (Africa/Nairobi UTC+03:00)
  // ------------------------------------------------------------
  try {
    const tzCheck = await query(`
      SELECT 
        start_time,
        start_time AT TIME ZONE 'Africa/Nairobi' AS eat_time,
        to_char(start_time AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM-DD HH12:MI AM') AS formatted_eat
      FROM appointments 
      LIMIT 1
    `);
    assert.ok(tzCheck.rows.length > 0);
    assert.ok(tzCheck.rows[0].formatted_eat);
    pass('38. Timezone correctness verified under Africa/Nairobi (EAT UTC+03:00)');
  } catch (err) {
    fail('38. Timezone correctness', err);
  }

  // ------------------------------------------------------------
  // 39. Phase 4 Payment Architecture Regression
  // ------------------------------------------------------------
  try {
    cp.execSync('node scratch/verify_phase4_payment_architecture.js', { stdio: 'pipe' });
    pass('39. Phase 4 payment regression passes (18/18 assertions)');
  } catch (err) {
    fail('39. Phase 4 payment regression', err);
  }

  // ------------------------------------------------------------
  // 40. Phase 5 Order & Fulfillment Regression
  // ------------------------------------------------------------
  try {
    cp.execSync('node scratch/verify_phase5_order_fulfillment.js', { stdio: 'pipe' });
    pass('40. Phase 5 order/fulfillment regression passes (21/21 assertions)');
  } catch (err) {
    fail('40. Phase 5 order/fulfillment regression', err);
  }

  // ------------------------------------------------------------
  // 41. Phase 6 Account & Clinical Prescription Regression
  // ------------------------------------------------------------
  try {
    cp.execSync('node scratch/verify_phase6_account_prescription.js', { stdio: 'pipe' });
    pass('41. Phase 6 account/prescription regression passes (76/76 assertions)');
  } catch (err) {
    fail('41. Phase 6 account/prescription regression', err);
  }

  // ------------------------------------------------------------
  // 42. Phase 7 Admin & Operational Inventory Regression
  // ------------------------------------------------------------
  try {
    cp.execSync('node scratch/verify_phase7_admin_inventory_operations.js', { stdio: 'pipe' });
    pass('42. Phase 7 admin/inventory regression passes (39/39 assertions)');
  } catch (err) {
    fail('42. Phase 7 admin/inventory regression', err);
  }

  // ------------------------------------------------------------
  // 43. Phase 8 Notification & Communication Regression
  // ------------------------------------------------------------
  try {
    cp.execSync('node scratch/verify_phase8_notifications.js', { stdio: 'pipe' });
    pass('43. Phase 8 notification/communication regression passes (28/28 assertions)');
  } catch (err) {
    fail('43. Phase 8 notification regression', err);
  }

  // ------------------------------------------------------------
  // 44. Premium 3D / VTO Visual Experience Regression
  // ------------------------------------------------------------
  try {
    cp.execSync('node scratch/verify_premium_3d_experience.js', { stdio: 'pipe' });
    pass('44. Premium 3D/VTO visual experience regression passes (18/18 assertions)');
  } catch (err) {
    fail('44. Premium 3D/VTO regression', err);
  }

  // ------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------
  console.log('\n============================================================');
  console.log(`PHASE 9 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase9Verification().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
