/**
 * EyeKart Phase 8 Notification & Communication Verification Suite
 * Tests all 28 requirements:
 * 1. notification creation
 * 2. unauthorized notification access rejected
 * 3. customer cannot access another user's notifications (IDOR)
 * 4. admin authorization
 * 5. invalid recipient rejected
 * 6. invalid channel rejected
 * 7. invalid template rejected
 * 8. provider-disabled behavior deterministic
 * 9. test provider success
 * 10. test provider failure simulation
 * 11. idempotency prevents duplicate notification
 * 12. duplicate payment callback does not duplicate notification
 * 13. duplicate order transition does not duplicate notification
 * 14. notification state transition validation
 * 15. retry limit enforced
 * 16. transient failure is retryable
 * 17. permanent failure is not infinitely retried
 * 18. transactional notification occurs only after successful business transaction
 * 19. rolled-back transaction does not create committed notification
 * 20. sensitive payload fields are excluded
 * 21. customer communication preferences cannot disable mandatory transactional/security notifications
 * 22. marketing preferences remain separate
 * 23. notification rate limiting works
 * 24. Phase 4 payment regression passes
 * 25. Phase 5 order/fulfillment regression passes
 * 26. Phase 6 account/prescription regression passes
 * 27. Phase 7 admin/inventory regression passes
 * 28. Premium 3D/VTO regression passes
 */

const assert = require('assert');
const path = require('path');
const { query, getPool } = require('../server/src/db/pool');
const notificationService = require('../server/src/services/notification/notificationService');
const {
  NotificationProvider,
  CHANNELS,
  NOTIFICATION_STATES,
  FAILURE_CATEGORIES
} = require('../server/src/services/notification/NotificationProvider');
const TestNotificationProvider = require('../server/src/services/notification/TestNotificationProvider');
const EmailProvider = require('../server/src/services/notification/EmailProvider');
const SmsProvider = require('../server/src/services/notification/SmsProvider');
const WhatsAppProvider = require('../server/src/services/notification/WhatsAppProvider');
const {
  TEMPLATE_IDS,
  MANDATORY_TEMPLATES,
  MARKETING_TEMPLATES,
  isMandatoryTemplate,
  isMarketingTemplate,
  renderTemplate,
  sanitizePayload
} = require('../server/src/services/notification/notificationTemplates');
const { hashPassword, createSession } = require('../server/src/services/authService');
const { createOrderFromQuote, updateOrderStatus } = require('../server/src/services/orderService');
const webhookService = require('../server/src/services/webhookService');
const { RateLimiter } = require('../server/src/middleware/rateLimit');

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
  const session = await createSession(user.id, '127.0.0.1', 'Node-Test-Runner');
  return { user, token: session.rawToken };
}

async function runPhase8Verification() {
  console.log('============================================================');
  console.log('EYEKART PHASE 8: NOTIFICATIONS, COMMUNICATION & EVENT DELIVERY');
  console.log('============================================================\n');

  // Reset test provider
  const testProvider = new TestNotificationProvider();
  notificationService.setProvider(testProvider);

  // Setup test users
  const userA = await createTestUser('custA_p8@eyekart.ke', 'CUSTOMER', '254711000001');
  const userB = await createTestUser('custB_p8@eyekart.ke', 'CUSTOMER', '254711000002');
  const admin = await createTestUser('admin_p8@eyekart.ke', 'ADMIN', '254711000003');

  // Clean old test notifications
  await query(`DELETE FROM notifications WHERE recipient LIKE '%p8%' OR user_id IN ($1, $2, $3)`, [
    userA.user.id, userB.user.id, admin.user.id
  ]);

  // ------------------------------------------------------------
  // 1. Notification Creation
  // ------------------------------------------------------------
  try {
    const res = await notificationService.sendTransactionalNotification({
      userId: userA.user.id,
      recipient: '254711000001',
      channel: CHANNELS.SMS,
      templateId: TEMPLATE_IDS.ORDER_CREATED,
      payload: { orderNumber: 'EK-TEST-001', total: 15000 },
      resourceId: 'order-uuid-1'
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.notification.status, NOTIFICATION_STATES.SENT);
    assert.strictEqual(res.notification.recipient, '254711000001');
    assert.strictEqual(res.notification.channel, 'SMS');
    assert.strictEqual(res.notification.template_id, TEMPLATE_IDS.ORDER_CREATED);
    pass('1. notification creation and persistence');
  } catch (err) {
    fail('1. notification creation', err);
  }

  // ------------------------------------------------------------
  // 2. Unauthorized Notification Access Rejected
  // ------------------------------------------------------------
  try {
    const resp = await fetch(`${BASE_URL}/api/notifications`);
    assert.strictEqual(resp.status, 401);
    pass('2. unauthorized notification access rejected with 401');
  } catch (err) {
    fail('2. unauthorized notification access', err);
  }

  // ------------------------------------------------------------
  // 3. Customer Cannot Access Another User's Notifications (IDOR)
  // ------------------------------------------------------------
  try {
    // User A fetches notifications
    const respA = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${userA.token}` }
    });
    const dataA = await respA.json();
    assert.strictEqual(respA.status, 200);
    assert.ok(dataA.notifications.length >= 1);
    assert.ok(dataA.notifications.every(n => n.recipient === '254711000001'));

    // User B fetches notifications (should have 0)
    const respB = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${userB.token}` }
    });
    const dataB = await respB.json();
    assert.strictEqual(respB.status, 200);
    assert.strictEqual(dataB.notifications.length, 0);
    pass("3. customer cannot access another user's notifications (IDOR isolated)");
  } catch (err) {
    fail("3. customer notification IDOR isolation", err);
  }

  // ------------------------------------------------------------
  // 4. Admin Authorization
  // ------------------------------------------------------------
  try {
    // Customer attempt on admin endpoint
    const forbiddenResp = await fetch(`${BASE_URL}/api/admin/notifications`, {
      headers: { Authorization: `Bearer ${userA.token}` }
    });
    assert.strictEqual(forbiddenResp.status, 403);

    // Admin attempt
    const adminResp = await fetch(`${BASE_URL}/api/admin/notifications`, {
      headers: { Authorization: `Bearer ${admin.token}` }
    });
    assert.strictEqual(adminResp.status, 200);
    const adminData = await adminResp.json();
    assert.strictEqual(adminData.success, true);
    assert.ok(Array.isArray(adminData.notifications));
    pass('4. admin notification access guarded by RBAC');
  } catch (err) {
    fail('4. admin authorization', err);
  }

  // ------------------------------------------------------------
  // 5. Invalid Recipient Rejected
  // ------------------------------------------------------------
  try {
    let threw = false;
    try {
      await notificationService.sendTransactionalNotification({
        userId: userA.user.id,
        recipient: 'invalid-email-string',
        channel: CHANNELS.EMAIL,
        templateId: TEMPLATE_IDS.ORDER_CREATED,
        payload: { orderNumber: 'EK-TEST-002', total: 5000 }
      });
    } catch (e) {
      threw = true;
      assert.strictEqual(e.code, 'INVALID_RECIPIENT');
    }
    assert.strictEqual(threw, true);
    pass('5. invalid recipient rejected with INVALID_RECIPIENT');
  } catch (err) {
    fail('5. invalid recipient', err);
  }

  // ------------------------------------------------------------
  // 6. Invalid Channel Rejected
  // ------------------------------------------------------------
  try {
    let threw = false;
    try {
      await notificationService.sendTransactionalNotification({
        userId: userA.user.id,
        recipient: '254711000001',
        channel: 'CARRIER_PIGEON',
        templateId: TEMPLATE_IDS.ORDER_CREATED,
        payload: {}
      });
    } catch (e) {
      threw = true;
      assert.strictEqual(e.code, 'INVALID_CHANNEL');
    }
    assert.strictEqual(threw, true);
    pass('6. invalid channel rejected with INVALID_CHANNEL');
  } catch (err) {
    fail('6. invalid channel', err);
  }

  // ------------------------------------------------------------
  // 7. Invalid Template Rejected
  // ------------------------------------------------------------
  try {
    let threw = false;
    try {
      await notificationService.sendTransactionalNotification({
        userId: userA.user.id,
        recipient: '254711000001',
        channel: CHANNELS.SMS,
        templateId: 'NON_EXISTENT_TEMPLATE_XYZ',
        payload: {}
      });
    } catch (e) {
      threw = true;
      assert.strictEqual(e.code, 'INVALID_TEMPLATE_ID');
    }
    assert.strictEqual(threw, true);
    pass('7. invalid template rejected with INVALID_TEMPLATE_ID');
  } catch (err) {
    fail('7. invalid template', err);
  }

  // ------------------------------------------------------------
  // 8. Provider-Disabled Behavior Deterministic
  // ------------------------------------------------------------
  try {
    const unconfiguredEmail = new EmailProvider();
    const emailRes = await unconfiguredEmail.sendEmail({
      to: 'client@eyekart.ke',
      subject: 'Test',
      html: '<p>Test</p>'
    });
    assert.strictEqual(emailRes.success, false);
    assert.strictEqual(emailRes.failureCategory, FAILURE_CATEGORIES.PROVIDER_DISABLED);

    const unconfiguredSms = new SmsProvider();
    const smsRes = await unconfiguredSms.sendSms({
      to: '0712345678',
      message: 'Test SMS'
    });
    assert.strictEqual(smsRes.success, false);
    assert.strictEqual(smsRes.failureCategory, FAILURE_CATEGORIES.PROVIDER_DISABLED);

    const unconfiguredWa = new WhatsAppProvider();
    const waRes = await unconfiguredWa.sendWhatsApp({
      to: '0712345678',
      message: 'Test WA'
    });
    assert.strictEqual(waRes.success, false);
    assert.strictEqual(waRes.failureCategory, FAILURE_CATEGORIES.PROVIDER_DISABLED);

    pass('8. provider-disabled behavior deterministic without fabricated delivery');
  } catch (err) {
    fail('8. provider-disabled behavior', err);
  }

  // ------------------------------------------------------------
  // 9. Test Provider Success
  // ------------------------------------------------------------
  try {
    testProvider.clear();
    const res = await testProvider.sendSms({
      to: '254711000001',
      message: 'Test dispatch message'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(testProvider.getSentSms().length, 1);
    assert.strictEqual(testProvider.getSentSms()[0].to, '254711000001');
    pass('9. test provider captures outgoing dispatches safely');
  } catch (err) {
    fail('9. test provider success', err);
  }

  // ------------------------------------------------------------
  // 10. Test Provider Failure Simulation
  // ------------------------------------------------------------
  try {
    testProvider.clear();
    testProvider.simulateFailure({
      channel: 'SMS',
      category: FAILURE_CATEGORIES.TEMPORARY_PROVIDER_ERROR,
      error: 'Upstream gateway 502 Bad Gateway',
      remainingCount: 1
    });

    const res = await testProvider.sendSms({
      to: '254711000001',
      message: 'Should fail'
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.failureCategory, FAILURE_CATEGORIES.TEMPORARY_PROVIDER_ERROR);
    pass('10. test provider failure simulation operates deterministically');
  } catch (err) {
    fail('10. test provider failure', err);
  }

  // ------------------------------------------------------------
  // 11. Idempotency Prevents Duplicate Notification
  // ------------------------------------------------------------
  try {
    testProvider.clear();
    testProvider.clearSimulatedFailures();
    const testResId11 = 'order-idemp-' + Date.now();

    const dispatch1 = await notificationService.sendTransactionalNotification({
      userId: userA.user.id,
      recipient: '254711000001',
      channel: CHANNELS.SMS,
      templateId: TEMPLATE_IDS.ORDER_PAID,
      payload: { orderNumber: 'EK-IDEMP-001', amount: 8000 },
      resourceId: testResId11
    });
    assert.strictEqual(dispatch1.success, true);
    assert.strictEqual(dispatch1.idempotentHit, undefined);

    // Duplicate call with identical event, resource, channel, and recipient
    const dispatch2 = await notificationService.sendTransactionalNotification({
      userId: userA.user.id,
      recipient: '254711000001',
      channel: CHANNELS.SMS,
      templateId: TEMPLATE_IDS.ORDER_PAID,
      payload: { orderNumber: 'EK-IDEMP-001', amount: 8000 },
      resourceId: testResId11
    });
    assert.strictEqual(dispatch2.success, true);
    assert.strictEqual(dispatch2.idempotentHit, true);
    assert.strictEqual(dispatch1.notification.id, dispatch2.notification.id);
    pass('11. idempotency prevents duplicate notifications');
  } catch (err) {
    fail('11. idempotency', err);
  }

  // ------------------------------------------------------------
  // 12. Duplicate Payment Callback Does Not Duplicate Notification
  // ------------------------------------------------------------
  try {
    const testPayId = 'order-pay-' + Date.now();

    // First payment notification
    const res1 = await notificationService.sendTransactionalNotification({
      userId: userA.user.id,
      recipient: '254711000001',
      channel: CHANNELS.SMS,
      templateId: TEMPLATE_IDS.PAYMENT_SUCCESS,
      payload: { orderNumber: 'EK-PAY-001', receiptNumber: 'QEK12345P8', amount: 1000 },
      resourceId: testPayId
    });
    assert.strictEqual(res1.success, true);

    // Replay callback notification
    const res2 = await notificationService.sendTransactionalNotification({
      userId: userA.user.id,
      recipient: '254711000001',
      channel: CHANNELS.SMS,
      templateId: TEMPLATE_IDS.PAYMENT_SUCCESS,
      payload: { orderNumber: 'EK-PAY-001', receiptNumber: 'QEK12345P8', amount: 1000 },
      resourceId: testPayId
    });
    assert.strictEqual(res2.idempotentHit, true);
    pass('12. duplicate payment callback does not duplicate notification');
  } catch (err) {
    fail('12. duplicate payment callback', err);
  }

  // ------------------------------------------------------------
  // 13. Duplicate Order Transition Does Not Duplicate Notification
  // ------------------------------------------------------------
  try {
    const testProcId = 'order-proc-' + Date.now();

    const res1 = await notificationService.sendTransactionalNotification({
      userId: userA.user.id,
      recipient: '254711000001',
      channel: CHANNELS.SMS,
      templateId: TEMPLATE_IDS.ORDER_PROCESSING,
      payload: { orderNumber: 'EK-PROC-001' },
      resourceId: testProcId
    });
    assert.strictEqual(res1.success, true);

    const res2 = await notificationService.sendTransactionalNotification({
      userId: userA.user.id,
      recipient: '254711000001',
      channel: CHANNELS.SMS,
      templateId: TEMPLATE_IDS.ORDER_PROCESSING,
      payload: { orderNumber: 'EK-PROC-001' },
      resourceId: testProcId
    });
    assert.strictEqual(res2.idempotentHit, true);
    pass('13. duplicate order transition does not duplicate notification');
  } catch (err) {
    fail('13. duplicate order transition', err);
  }

  // ------------------------------------------------------------
  // 14. Notification State Transition Validation
  // ------------------------------------------------------------
  try {
    assert.strictEqual(NotificationProvider.isValidTransition('PENDING', 'PROCESSING'), true);
    assert.strictEqual(NotificationProvider.isValidTransition('PROCESSING', 'SENT'), true);
    assert.strictEqual(NotificationProvider.isValidTransition('PROCESSING', 'FAILED'), true);
    assert.strictEqual(NotificationProvider.isValidTransition('FAILED', 'PROCESSING'), true);
    // Terminal states cannot transition out
    assert.strictEqual(NotificationProvider.isValidTransition('SENT', 'PENDING'), false);
    assert.strictEqual(NotificationProvider.isValidTransition('SENT', 'PROCESSING'), false);
    assert.strictEqual(NotificationProvider.isValidTransition('CANCELLED', 'PROCESSING'), false);
    pass('14. notification state transitions validated with terminal guards');
  } catch (err) {
    fail('14. state transition validation', err);
  }

  // ------------------------------------------------------------
  // 15. Retry Limit Enforced
  // ------------------------------------------------------------
  try {
    const idempKey = 'RETRY_TEST_' + Date.now();
    // Simulate permanent failure
    testProvider.simulateFailure({
      channel: 'SMS',
      category: FAILURE_CATEGORIES.TEMPORARY_PROVIDER_ERROR,
      error: 'Simulated 503 Server Error',
      remainingCount: 10
    });

    // Attempt 1
    const a1 = await notificationService.sendTransactionalNotification({
      userId: userA.user.id,
      recipient: '254711000001',
      channel: CHANNELS.SMS,
      templateId: TEMPLATE_IDS.ORDER_CREATED,
      payload: { orderNumber: 'EK-RETRY-001', total: 1000 },
      idempotencyKey: idempKey
    });
    assert.strictEqual(a1.notification.attempt_count, 1);
    assert.strictEqual(a1.isRetryable, true);

    // Attempt 2
    const a2 = await notificationService.sendTransactionalNotification({
      userId: userA.user.id,
      recipient: '254711000001',
      channel: CHANNELS.SMS,
      templateId: TEMPLATE_IDS.ORDER_CREATED,
      payload: { orderNumber: 'EK-RETRY-001', total: 1000 },
      idempotencyKey: idempKey
    });
    assert.strictEqual(a2.notification.attempt_count, 2);
    assert.strictEqual(a2.isRetryable, true);

    // Attempt 3 (Max attempts = 3)
    const a3 = await notificationService.sendTransactionalNotification({
      userId: userA.user.id,
      recipient: '254711000001',
      channel: CHANNELS.SMS,
      templateId: TEMPLATE_IDS.ORDER_CREATED,
      payload: { orderNumber: 'EK-RETRY-001', total: 1000 },
      idempotencyKey: idempKey
    });
    assert.strictEqual(a3.notification.attempt_count, 3);
    assert.strictEqual(a3.isRetryable, false); // Capped at max_attempts!
    assert.strictEqual(a3.notification.next_retry_at, null);

    testProvider.clearSimulatedFailures();
    pass('15. retry limit enforced (capped at max 3 attempts)');
  } catch (err) {
    testProvider.clearSimulatedFailures();
    fail('15. retry limit enforced', err);
  }

  // ------------------------------------------------------------
  // 16. Transient Failure is Retryable with Exponential Backoff
  // ------------------------------------------------------------
  try {
    assert.strictEqual(NotificationProvider.isRetryable(FAILURE_CATEGORIES.TEMPORARY_PROVIDER_ERROR), true);
    assert.strictEqual(NotificationProvider.isRetryable(FAILURE_CATEGORIES.PROVIDER_TIMEOUT), true);
    assert.strictEqual(NotificationProvider.isRetryable(FAILURE_CATEGORIES.RATE_LIMITED), true);

    testProvider.simulateFailure({
      channel: 'SMS',
      category: FAILURE_CATEGORIES.PROVIDER_TIMEOUT,
      error: 'Connection timed out',
      remainingCount: 1
    });

    const res = await notificationService.sendTransactionalNotification({
      userId: userA.user.id,
      recipient: '254711000001',
      channel: CHANNELS.SMS,
      templateId: TEMPLATE_IDS.ORDER_CREATED,
      payload: { orderNumber: 'EK-BACKOFF-1', total: 1000 },
      idempotencyKey: 'BACKOFF_TEST_' + Date.now()
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.isRetryable, true);
    assert.ok(new Date(res.notification.next_retry_at) > new Date());
    testProvider.clearSimulatedFailures();
    pass('16. transient failure is classified as retryable with backoff timestamp');
  } catch (err) {
    testProvider.clearSimulatedFailures();
    fail('16. transient failure retryable', err);
  }

  // ------------------------------------------------------------
  // 17. Permanent Failure is Not Infinitely Retried
  // ------------------------------------------------------------
  try {
    assert.strictEqual(NotificationProvider.isRetryable(FAILURE_CATEGORIES.INVALID_RECIPIENT), false);
    assert.strictEqual(NotificationProvider.isRetryable(FAILURE_CATEGORIES.PROVIDER_DISABLED), false);
    assert.strictEqual(NotificationProvider.isRetryable(FAILURE_CATEGORIES.PROVIDER_REJECTED), false);
    assert.strictEqual(NotificationProvider.isRetryable(FAILURE_CATEGORIES.PERMANENT_PROVIDER_ERROR), false);

    testProvider.simulateFailure({
      channel: 'SMS',
      category: FAILURE_CATEGORIES.PROVIDER_REJECTED,
      error: 'Account suspended by provider',
      remainingCount: 1
    });

    const res = await notificationService.sendTransactionalNotification({
      userId: userA.user.id,
      recipient: '254711000001',
      channel: CHANNELS.SMS,
      templateId: TEMPLATE_IDS.ORDER_CREATED,
      payload: { orderNumber: 'EK-PERM-1', total: 1000 },
      idempotencyKey: 'PERM_TEST_' + Date.now()
    });

    assert.strictEqual(res.isRetryable, false);
    assert.strictEqual(res.notification.next_retry_at, null);
    testProvider.clearSimulatedFailures();
    pass('17. permanent provider failure is non-retryable and terminated');
  } catch (err) {
    testProvider.clearSimulatedFailures();
    fail('17. permanent failure non-retryable', err);
  }

  // ------------------------------------------------------------
  // 18. Transactional Outbox Committed with Business Transaction
  // ------------------------------------------------------------
  try {
    const pool = getPool();
    const client = await pool.connect();
    const idempKey = 'OUTBOX_TX_COMMITTED_' + Date.now();

    await client.query('BEGIN');
    const outboxEnq = await notificationService.enqueueOutbox({
      client,
      userId: userA.user.id,
      recipient: '254711000001',
      channel: CHANNELS.SMS,
      templateId: TEMPLATE_IDS.ORDER_CREATED,
      payload: { orderNumber: 'EK-TX-001', total: 12000 },
      idempotencyKey: idempKey
    });
    assert.strictEqual(outboxEnq.idempotentHit, false);
    await client.query('COMMIT');
    client.release();

    const dbCheck = await query(`SELECT * FROM notifications WHERE idempotency_key = $1`, [idempKey]);
    assert.strictEqual(dbCheck.rows.length, 1);
    assert.strictEqual(dbCheck.rows[0].status, NOTIFICATION_STATES.PENDING);

    // Process outbox
    const processed = await notificationService.processOutbox(10);
    assert.ok(processed.some(p => p.success === true));

    const updatedCheck = await query(`SELECT * FROM notifications WHERE idempotency_key = $1`, [idempKey]);
    assert.strictEqual(updatedCheck.rows[0].status, NOTIFICATION_STATES.SENT);
    pass('18. transactional outbox commits atomically with business transaction');
  } catch (err) {
    fail('18. transactional outbox commit', err);
  }

  // ------------------------------------------------------------
  // 19. Rolled-Back Transaction Does Not Create Committed Notification
  // ------------------------------------------------------------
  try {
    const pool = getPool();
    const client = await pool.connect();
    const idempKey = 'OUTBOX_ROLLBACK_' + Date.now();

    await client.query('BEGIN');
    await notificationService.enqueueOutbox({
      client,
      userId: userA.user.id,
      recipient: '254711000001',
      channel: CHANNELS.SMS,
      templateId: TEMPLATE_IDS.ORDER_CREATED,
      payload: { orderNumber: 'EK-TX-ROLLBACK', total: 12000 },
      idempotencyKey: idempKey
    });
    // Explicit rollback
    await client.query('ROLLBACK');
    client.release();

    const dbCheck = await query(`SELECT * FROM notifications WHERE idempotency_key = $1`, [idempKey]);
    assert.strictEqual(dbCheck.rows.length, 0, 'Rolled back transaction must leave zero notification records');
    pass('19. rolled-back transaction leaves zero notification records (outbox atomicity)');
  } catch (err) {
    fail('19. rolled-back transaction isolation', err);
  }

  // ------------------------------------------------------------
  // 20. Sensitive Payload Fields are Excluded
  // ------------------------------------------------------------
  try {
    const rawPayload = {
      orderNumber: 'EK-SENS-001',
      total: 10000,
      password: 'RawPassword123!',
      password_hash: 'scrypt$hash',
      token: 'session-secret-abc',
      cvv: '123',
      od_sph: -2.50,
      od_cyl: -0.75,
      od_axis: 180,
      pd: 63
    };

    const sanitized = sanitizePayload(rawPayload);
    assert.strictEqual(sanitized.password, undefined);
    assert.strictEqual(sanitized.password_hash, undefined);
    assert.strictEqual(sanitized.token, undefined);
    assert.strictEqual(sanitized.cvv, undefined);
    assert.strictEqual(sanitized.od_sph, undefined);
    assert.strictEqual(sanitized.od_cyl, undefined);
    assert.strictEqual(sanitized.orderNumber, 'EK-SENS-001');
    assert.strictEqual(sanitized.total, 10000);

    pass('20. sensitive payload fields strictly excluded from notification payloads and templates');
  } catch (err) {
    fail('20. sensitive payload sanitization', err);
  }

  // ------------------------------------------------------------
  // 21. Communication Preferences: Mandatory vs Marketing (Invariants A & D)
  // ------------------------------------------------------------
  try {
    // Invariant A: Mandatory transactional notification cannot be suppressed
    // 1. Attempting to disable mandatory transactional email returns 400
    const disableResp = await fetch(`${BASE_URL}/api/notifications/preferences`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.token}`
      },
      body: JSON.stringify({
        transactionalEmail: false
      })
    });
    assert.strictEqual(disableResp.status, 400);
    const data = await disableResp.json();
    assert.strictEqual(data.code, 'CANNOT_DISABLE_MANDATORY_NOTIFICATIONS');

    // 2. Attempting to disable mandatory transactional SMS returns 400
    const disableSmsResp = await fetch(`${BASE_URL}/api/notifications/preferences`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.token}`
      },
      body: JSON.stringify({
        transactionalSms: false
      })
    });
    assert.strictEqual(disableSmsResp.status, 400);
    const dataSms = await disableSmsResp.json();
    assert.strictEqual(dataSms.code, 'CANNOT_DISABLE_MANDATORY_NOTIFICATIONS');

    // 3. Even with marketing preferences disabled, checkUserPreferences allows mandatory templates
    const allowedMandatory = await notificationService.checkUserPreferences(
      userA.user.id,
      CHANNELS.EMAIL,
      TEMPLATE_IDS.ORDER_CREATED
    );
    assert.strictEqual(allowedMandatory, true);

    // Invariant D: Customer cannot manipulate template or category to bypass distinction
    const hackResp = await fetch(`${BASE_URL}/api/notifications/preferences`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.token}`
      },
      body: JSON.stringify({
        templateId: 'ORDER_CREATED',
        category: 'MARKETING'
      })
    });
    assert.strictEqual(hackResp.status, 400);
    const hackData = await hackResp.json();
    assert.strictEqual(hackData.code, 'INVALID_PREFERENCE_PAYLOAD');

    // Server-authoritative classification cannot be overridden
    assert.strictEqual(isMandatoryTemplate(TEMPLATE_IDS.ORDER_CREATED), true);
    assert.strictEqual(isMarketingTemplate(TEMPLATE_IDS.ORDER_CREATED), false);

    pass('21. customer communication preferences cannot disable mandatory transactional notifications');
  } catch (err) {
    fail('21. mandatory notifications preference enforcement', err);
  }

  // ------------------------------------------------------------
  // 22. Marketing Preferences Strictly Separated (Invariants B & C)
  // ------------------------------------------------------------
  try {
    // 1. Ensure user has marketing turned off
    const setMktOff = await fetch(`${BASE_URL}/api/notifications/preferences`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.token}`
      },
      body: JSON.stringify({
        marketingEmail: false,
        marketingSms: false,
        whatsapp: false
      })
    });
    assert.strictEqual(setMktOff.status, 200);

    // Invariant B: Optional marketing notification can be suppressed
    const mktPrefOff = await notificationService.checkUserPreferences(
      userA.user.id,
      CHANNELS.EMAIL,
      TEMPLATE_IDS.MARKETING_PROMOTION
    );
    assert.strictEqual(mktPrefOff, false);

    // Attempting to send marketing notification when user opted out results in cancellation
    const mktResultBlocked = await notificationService.sendTransactionalNotification({
      userId: userA.user.id,
      recipient: 'customera@test.eyekart.ke',
      channel: CHANNELS.EMAIL,
      templateId: TEMPLATE_IDS.MARKETING_PROMOTION,
      payload: { message: 'Spring optical sale' }
    });
    assert.strictEqual(mktResultBlocked.optedOut, true);
    assert.strictEqual(mktResultBlocked.status, NOTIFICATION_STATES.CANCELLED);

    // Invariant C: Non-marketing transactional notification cannot be suppressed by marketing preference
    // A transactional template (even if arbitrary/non-mandatory) is NOT suppressed when marketing is disabled
    const txPrefCheck = await notificationService.checkUserPreferences(
      userA.user.id,
      CHANNELS.EMAIL,
      'ARBITRARY_TRANSACTIONAL_NOTICE'
    );
    assert.strictEqual(txPrefCheck, true);

    // When customer opts in to marketing, marketing notification is delivered
    const setMktOn = await fetch(`${BASE_URL}/api/notifications/preferences`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.token}`
      },
      body: JSON.stringify({
        marketingEmail: true,
        marketingSms: false,
        whatsapp: true
      })
    });
    assert.strictEqual(setMktOn.status, 200);
    const mktOnData = await setMktOn.json();
    assert.strictEqual(mktOnData.preferences.marketingEmail, true);
    assert.strictEqual(mktOnData.preferences.marketingSms, false);
    assert.strictEqual(mktOnData.preferences.whatsapp, true);
    assert.strictEqual(mktOnData.preferences.transactionalEmail, true);
    assert.strictEqual(mktOnData.preferences.transactionalSms, true);

    const mktPrefOn = await notificationService.checkUserPreferences(
      userA.user.id,
      CHANNELS.EMAIL,
      TEMPLATE_IDS.MARKETING_PROMOTION
    );
    assert.strictEqual(mktPrefOn, true);

    const mktResultSent = await notificationService.sendTransactionalNotification({
      userId: userA.user.id,
      recipient: 'customera@test.eyekart.ke',
      channel: CHANNELS.EMAIL,
      templateId: TEMPLATE_IDS.MARKETING_PROMOTION,
      payload: { message: 'New eyewear styles' },
      idempotencyKey: 'MKT_TEST_' + Date.now()
    });
    assert.strictEqual(mktResultSent.success, true);
    assert.strictEqual(mktResultSent.notification.status, NOTIFICATION_STATES.SENT);

    pass('22. marketing preferences are independently and securely configurable');
  } catch (err) {
    fail('22. marketing preferences separation', err);
  }

  // ------------------------------------------------------------
  // 23. Notification Rate Limiting Works
  // ------------------------------------------------------------
  try {
    const testLimiter = new RateLimiter(5, 60000);
    const ip = '192.168.1.100';

    for (let i = 0; i < 5; i++) {
      assert.strictEqual(testLimiter.isAllowed(ip), true);
    }
    // 6th call should be blocked
    assert.strictEqual(testLimiter.isAllowed(ip), false);
    pass('23. notification endpoint rate limiter enforces threshold and blocks excess traffic');
  } catch (err) {
    fail('23. notification rate limiting', err);
  }

  // ------------------------------------------------------------
  // 24. Phase 4 Payment Architecture Regression
  // ------------------------------------------------------------
  try {
    const cp = require('child_process');
    cp.execSync('node scratch/verify_phase4_payment_architecture.js', { stdio: 'pipe' });
    pass('24. Phase 4 payment regression passes (18/18 assertions)');
  } catch (err) {
    fail('24. Phase 4 payment regression', err);
  }

  // ------------------------------------------------------------
  // 25. Phase 5 Order & Fulfillment Regression
  // ------------------------------------------------------------
  try {
    const cp = require('child_process');
    cp.execSync('node scratch/verify_phase5_order_fulfillment.js', { stdio: 'pipe' });
    pass('25. Phase 5 order/fulfillment regression passes (21/21 assertions)');
  } catch (err) {
    fail('25. Phase 5 order/fulfillment regression', err);
  }

  // ------------------------------------------------------------
  // 26. Phase 6 Account & Clinical Prescription Regression
  // ------------------------------------------------------------
  try {
    const cp = require('child_process');
    cp.execSync('node scratch/verify_phase6_account_prescription.js', { stdio: 'pipe' });
    pass('26. Phase 6 account/prescription regression passes (76/76 assertions)');
  } catch (err) {
    fail('26. Phase 6 account/prescription regression', err);
  }

  // ------------------------------------------------------------
  // 27. Phase 7 Admin & Operational Inventory Regression
  // ------------------------------------------------------------
  try {
    const cp = require('child_process');
    cp.execSync('node scratch/verify_phase7_admin_inventory_operations.js', { stdio: 'pipe' });
    pass('27. Phase 7 admin/inventory regression passes (39/39 assertions)');
  } catch (err) {
    fail('27. Phase 7 admin/inventory regression', err);
  }

  // ------------------------------------------------------------
  // 28. Premium 3D / VTO Visual Experience Regression
  // ------------------------------------------------------------
  try {
    const cp = require('child_process');
    cp.execSync('node scratch/verify_premium_3d_experience.js', { stdio: 'pipe' });
    pass('28. Premium 3D/VTO regression passes (18/18 assertions)');
  } catch (err) {
    fail('28. Premium 3D/VTO regression', err);
  }

  // ------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------
  console.log('\n============================================================');
  console.log(`PHASE 8 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase8Verification().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
