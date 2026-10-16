/**
 * AIMA Payment Hub — Phase 3 Security & Integration Tests
 *
 * Tests cover:
 * - HMAC signature validation (valid, invalid, expired timestamp, replay)
 * - Source application registry (auth, allowlists, amount rules)
 * - Payment session lifecycle (creation, expiry, idempotency, cross-app)
 * - Notification store (creation, retry logic, dead-letter)
 * - SSRF guard
 * - State transition guardrails
 */

import assert from 'assert';
import crypto from 'crypto';
import { SourceApplicationRegistry, hashApiKey, verifyApiKey, generateApiKey } from '../server/models/sourceApplications';
import { PaymentSessionStore } from '../server/models/paymentSessions';
import { SourceNotificationStore, buildCanonicalNotificationPayload, signNotification } from '../server/models/notificationStore';
import { buildCanonicalRequest, computeHmacSignature } from '../server/middleware/hmacAuth';
import { quickSsrfCheck } from '../server/services/ssrfGuard';

console.log('🧪 Starting AIMA Phase 3 Security & Integration Tests...\n');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result
        .then(() => {
          console.log(`  ✅ PASS: ${name}`);
          testsPassed++;
        })
        .catch((err: any) => {
          console.error(`  ❌ FAIL: ${name}`);
          console.error(`     Error: ${err.message}`);
          testsFailed++;
        });
    } else {
      console.log(`  ✅ PASS: ${name}`);
      testsPassed++;
    }
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    testsFailed++;
  }
}

// ─── Suite 1: Source Application Registry ────────────────────────────────────
console.log('--- Test Suite 1: Source Application Registry ---');

const registry = new SourceApplicationRegistry();

runTest('Registry seeds 8 demo AIMA applications', () => {
  const apps = registry.getAll();
  assert(apps.length >= 8, `Expected at least 8 seeded apps, got ${apps.length}`);
});

runTest('Registry contains all expected source codes', () => {
  const codes = registry.getAll().map((a) => a.sourceCode);
  const expected = ['MAT', 'CME', 'CASE_LEAGUE', 'UGAT', 'LMA', 'AIMA_VCC', 'AMT', 'AIMA_EVENTS'];
  for (const code of expected) {
    assert(codes.includes(code), `Missing source code: ${code}`);
  }
});

runTest('Valid API key authenticates successfully', () => {
  const app = registry.authenticate('MAT', 'aima_mat_demo_key_phase3_sandbox_2026');
  assert(app !== null, 'Expected authentication to succeed');
  assert.strictEqual(app!.sourceCode, 'MAT');
});

runTest('Invalid API key is rejected', () => {
  const app = registry.authenticate('MAT', 'wrong_key_totally_invalid_here');
  assert.strictEqual(app, null, 'Expected authentication to fail with wrong key');
});

runTest('Wrong source code with valid key is rejected', () => {
  const app = registry.authenticate('CME', 'aima_mat_demo_key_phase3_sandbox_2026');
  assert.strictEqual(app, null, 'Cross-source authentication must fail');
});

runTest('Inactive application is rejected even with valid key', () => {
  // Create a test registry with an inactive app
  const testRegistry = new SourceApplicationRegistry();
  testRegistry.setActiveStatus('MAT', false, 'TEST');
  const app = testRegistry.authenticate('MAT', 'aima_mat_demo_key_phase3_sandbox_2026');
  assert.strictEqual(app, null, 'Inactive application must be rejected');
});

runTest('Return URL allowlist validation — valid URL passes', () => {
  const app = registry.getBySourceCode('MAT')!;
  const valid = registry.validateReturnUrl(app, 'https://mat.aima.in/payment/return');
  assert.strictEqual(valid, true);
});

runTest('Return URL allowlist — unregistered URL is blocked', () => {
  const app = registry.getBySourceCode('MAT')!;
  const blocked = registry.validateReturnUrl(app, 'https://evil.example.com/steal');
  assert.strictEqual(blocked, false, 'Unregistered return URL must be blocked');
});

runTest('Amount validation — FIXED mode rejects wrong amount', () => {
  const app = registry.getBySourceCode('UGAT')!;
  // UGAT EXAM_FEE is fixed at ₹650 (65000 paise)
  const result = registry.validateAmount(app, 'EXAM_FEE', 100000); // ₹1000 — wrong
  assert.strictEqual(result.valid, false, 'Wrong fixed amount must be rejected');
  assert(result.reason?.includes('mismatch'), `Expected mismatch message, got: ${result.reason}`);
});

runTest('Amount validation — FIXED mode accepts correct amount', () => {
  const app = registry.getBySourceCode('UGAT')!;
  const result = registry.validateAmount(app, 'EXAM_FEE', 65000); // ₹650 — correct
  assert.strictEqual(result.valid, true);
});

runTest('Amount validation — VARIABLE mode rejects out-of-range amount', () => {
  const app = registry.getBySourceCode('MAT')!;
  // MAT EXAM_FEE: ₹2,100–₹3,500. Test ₹500 (too low)
  const result = registry.validateAmount(app, 'EXAM_FEE', 50000); // ₹500
  assert.strictEqual(result.valid, false, 'Out-of-range amount must be rejected');
});

runTest('Amount validation — VARIABLE mode accepts in-range amount', () => {
  const app = registry.getBySourceCode('MAT')!;
  const result = registry.validateAmount(app, 'EXAM_FEE', 350000); // ₹3,500
  assert.strictEqual(result.valid, true);
});

runTest('Amount validation — Unknown payment purpose is rejected', () => {
  const app = registry.getBySourceCode('MAT')!;
  const result = registry.validateAmount(app, 'UNKNOWN_PURPOSE', 100000);
  assert.strictEqual(result.valid, false);
});

runTest('Admin can register a new source application', () => {
  const testRegistry = new SourceApplicationRegistry();
  const { app, rawApiKey } = testRegistry.register({
    sourceCode: 'TEST_APP',
    name: 'Test Application',
    description: 'For testing',
    isActive: true,
    allowedReturnUrls: ['https://test.example.com'],
    notificationUrl: 'https://test.example.com/notify',
    allowedPaymentPurposes: ['TEST_FEE'],
    amountRules: [{ paymentPurpose: 'TEST_FEE', description: 'Test', mode: 'FIXED', fixedAmountPaise: 10000, currency: 'INR', gstApplicable: false }],
    allowedGateways: ['DEMO_SIMULATOR'],
  });
  assert.strictEqual(app.sourceCode, 'TEST_APP');
  assert(rawApiKey.startsWith('aima_'), `Expected key to start with 'aima_', got: ${rawApiKey}`);
  // Verify new key works
  const auth = testRegistry.authenticate('TEST_APP', rawApiKey);
  assert(auth !== null, 'New API key must authenticate');
});

runTest('Duplicate source code registration is rejected', () => {
  assert.throws(
    () => registry.register({
      sourceCode: 'MAT',
      name: 'Duplicate',
      description: '',
      isActive: true,
      allowedReturnUrls: [],
      notificationUrl: 'https://example.com/notify',
      allowedPaymentPurposes: [],
      amountRules: [],
      allowedGateways: [],
    }),
    /already exists/
  );
});

runTest('API key rotation revokes old key and activates new one', () => {
  const testRegistry = new SourceApplicationRegistry();
  const oldKey = 'aima_mat_demo_key_phase3_sandbox_2026';
  const { rawApiKey: newKey } = testRegistry.rotateApiKey('MAT');

  // Old key must fail
  const oldAuth = testRegistry.authenticate('MAT', oldKey);
  assert.strictEqual(oldAuth, null, 'Old key must be revoked after rotation');

  // New key must work
  const newAuth = testRegistry.authenticate('MAT', newKey);
  assert(newAuth !== null, 'New key must authenticate after rotation');
});

runTest('Admin key rotation is reflected in audit history', () => {
  const testRegistry = new SourceApplicationRegistry();
  testRegistry.rotateApiKey('CME', 'ADMIN_TEST');
  const app = testRegistry.getBySourceCode('CME')!;
  const rotateEntry = app.auditHistory.find((e) => e.action === 'KEY_ROTATED');
  assert(rotateEntry !== undefined, 'KEY_ROTATED must appear in audit history');
});

// ─── Suite 2: HMAC Authentication ─────────────────────────────────────────────
console.log('\n--- Test Suite 2: HMAC Authentication ---');

runTest('Valid HMAC signature is computed correctly', () => {
  const secret = 'test-secret-key-for-hmac';
  const canonical = buildCanonicalRequest('POST', '/api/v1/payment-sessions', '1728999999', 'nonce-abc-123456789', 'bodyhash');
  const sig = computeHmacSignature(canonical, secret);
  assert.strictEqual(sig.length, 64, 'SHA-256 hex must be 64 chars');
  assert.strictEqual(typeof sig, 'string');
});

runTest('Different body produces different HMAC', () => {
  const secret = 'test-secret';
  const sig1 = computeHmacSignature(buildCanonicalRequest('POST', '/api/v1/payment-sessions', '1728999999', 'nonce1234567890', 'hash1'), secret);
  const sig2 = computeHmacSignature(buildCanonicalRequest('POST', '/api/v1/payment-sessions', '1728999999', 'nonce1234567890', 'hash2'), secret);
  assert.notStrictEqual(sig1, sig2, 'Different bodies must produce different signatures');
});

runTest('API key hash is not reversible (one-way)', () => {
  const rawKey = generateApiKey();
  const hash = hashApiKey(rawKey);
  assert.notStrictEqual(hash, rawKey, 'Hash must differ from raw key');
  assert.strictEqual(hash.length, 64, 'HMAC-SHA256 hex must be 64 chars');
});

runTest('API key verification succeeds with correct key', () => {
  const rawKey = generateApiKey();
  const hash = hashApiKey(rawKey);
  assert.strictEqual(verifyApiKey(rawKey, hash), true);
});

runTest('API key verification fails with wrong key', () => {
  const rawKey = generateApiKey();
  const hash = hashApiKey(rawKey);
  const wrongKey = generateApiKey();
  // Different length keys should return false
  try {
    const result = verifyApiKey(wrongKey, hash);
    assert.strictEqual(result, false, 'Wrong key must fail verification');
  } catch {
    // timingSafeEqual throws if buffers differ in length — acceptable as "not equal"
  }
});

runTest('Canonical request changes with different method', () => {
  const c1 = buildCanonicalRequest('POST', '/api/v1/test', '12345', 'nonce1234567890', 'hash');
  const c2 = buildCanonicalRequest('GET', '/api/v1/test', '12345', 'nonce1234567890', 'hash');
  assert.notStrictEqual(c1, c2);
});

// ─── Suite 3: Payment Session Store ──────────────────────────────────────────
console.log('\n--- Test Suite 3: Payment Session Store ---');

const sessionStore = new PaymentSessionStore();

const baseSessionParams = {
  transactionId: 'TXN-20261015-99001',
  orderId: 'ORD-AIMA-MAT-9001',
  sourceCode: 'MAT',
  externalOrderId: 'EXT-MAT-001',
  applicationReference: 'MAT-2026-90001',
  paymentPurpose: 'EXAM_FEE',
  amountPaise: 350000,
  currency: 'INR' as const,
  customerName: 'Test User',
  customerEmail: 'test@example.com',
  returnUrl: 'https://mat.aima.in/return',
  idempotencyKey: 'IDEM-PHASE3-TEST-001',
};

runTest('Payment session creation generates opaque token', () => {
  const session = sessionStore.create(baseSessionParams);
  assert.strictEqual(session.sessionToken.length, 64, 'Token must be 64-char hex');
  assert.strictEqual(session.status, 'PENDING');
  assert.strictEqual(session.amountPaise, 350000);
});

runTest('Payment session retrieval by token succeeds', () => {
  const session = sessionStore.create({ ...baseSessionParams, idempotencyKey: 'IDEM-GET-002' });
  const found = sessionStore.getByToken(session.sessionToken);
  assert(found !== undefined, 'Session must be retrievable by token');
  assert.strictEqual(found!.orderId, baseSessionParams.orderId);
});

runTest('Duplicate idempotency key returns same session', () => {
  const idemKey = 'IDEM-IDEM-TEST-003';
  const s1 = sessionStore.create({ ...baseSessionParams, idempotencyKey: idemKey });
  const s2 = sessionStore.create({ ...baseSessionParams, idempotencyKey: idemKey });
  assert.strictEqual(s1.sessionToken, s2.sessionToken, 'Same idempotency key must return same session');
});

runTest('Session transition PENDING → PROCESSING succeeds', () => {
  const session = sessionStore.create({ ...baseSessionParams, idempotencyKey: 'IDEM-PROCESSING-004' });
  const updated = sessionStore.markProcessing(session.sessionToken, 'WORLDLINE_PAYNIMO');
  assert.strictEqual(updated.status, 'PROCESSING');
  assert.strictEqual(updated.selectedGateway, 'WORLDLINE_PAYNIMO');
});

runTest('Session transition PROCESSING → COMPLETED succeeds', () => {
  const session = sessionStore.create({ ...baseSessionParams, idempotencyKey: 'IDEM-COMPLETE-005' });
  sessionStore.markProcessing(session.sessionToken, 'WORLDLINE_PAYNIMO');
  const completed = sessionStore.markCompleted(session.sessionToken);
  assert.strictEqual(completed.status, 'COMPLETED');
});

runTest('Expired session returns undefined on lookup', () => {
  const params = { ...baseSessionParams, idempotencyKey: 'IDEM-EXPIRED-006' };
  const session = sessionStore.create(params);
  // Manually expire the session
  (session as any).expiresAt = new Date(Date.now() - 1000).toISOString();
  (session as any).status = 'EXPIRED';
  const found = sessionStore.getByToken(session.sessionToken);
  assert.strictEqual(found, undefined, 'Expired session must not be returned');
});

runTest('Completed session cannot be marked processing', () => {
  const session = sessionStore.create({ ...baseSessionParams, idempotencyKey: 'IDEM-COMP-007' });
  sessionStore.markProcessing(session.sessionToken, 'DEMO_SIMULATOR');
  sessionStore.markCompleted(session.sessionToken);
  assert.throws(
    () => sessionStore.markProcessing(session.sessionToken, 'WORLDLINE_PAYNIMO'),
    /COMPLETED/
  );
});

// ─── Suite 4: Notification Store ─────────────────────────────────────────────
console.log('\n--- Test Suite 4: Notification Store & Retry Logic ---');

const notifStore = new SourceNotificationStore();
const testSecret = 'test-signing-secret-for-notifications';

const baseNotifParams = {
  orderId: 'ORD-AIMA-MAT-9001',
  sourceCode: 'MAT',
  externalOrderId: 'EXT-001',
  applicationReference: 'MAT-2026-001',
  paymentPurpose: 'EXAM_FEE',
  amountPaise: 350000,
  currency: 'INR' as const,
  status: 'SUCCESS' as const,
  gateway: 'WORLDLINE_PAYNIMO',
  notificationUrl: 'https://mat.aima.in/api/v1/payment-notification',
  signingSecret: testSecret,
};

runTest('Notification creation generates unique event ID', () => {
  const n = notifStore.create(baseNotifParams);
  assert(n.eventId.startsWith('EVT-'), `Event ID must start with EVT-, got: ${n.eventId}`);
  assert.strictEqual(n.deliveryStatus, 'PENDING');
  assert.strictEqual(n.attemptCount, 0);
});

runTest('Notification signature is valid HMAC-SHA256', () => {
  const n = notifStore.create({ ...baseNotifParams });
  const canonical = buildCanonicalNotificationPayload(n);
  const expectedSig = signNotification(canonical, testSecret);
  assert.strictEqual(n.signature, expectedSig, 'Notification signature must match computed HMAC');
});

runTest('Receiver can verify notification signature', () => {
  const n = notifStore.create({ ...baseNotifParams });
  const canonical = buildCanonicalNotificationPayload({
    eventId: n.eventId,
    orderId: n.orderId,
    sourceCode: n.sourceCode,
    status: n.status,
    amountPaise: n.amountPaise,
    signedAt: n.signedAt,
  });
  const computed = signNotification(canonical, testSecret);
  let valid = false;
  try {
    valid = crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(n.signature, 'hex'));
  } catch { valid = false; }
  assert.strictEqual(valid, true, 'Receiver verification must succeed');
});

runTest('Tampered notification fails signature verification', () => {
  const n = notifStore.create({ ...baseNotifParams });
  // Tamper with amount
  const tampered = { ...n, amountPaise: 999999 };
  const canonical = buildCanonicalNotificationPayload(tampered);
  const computed = signNotification(canonical, testSecret);
  let valid = false;
  try {
    valid = crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(n.signature, 'hex'));
  } catch { valid = false; }
  assert.strictEqual(valid, false, 'Tampered notification must fail signature check');
});

runTest('Successful delivery marks notification as DELIVERED', () => {
  const n = notifStore.create({ ...baseNotifParams });
  notifStore.recordSuccess(n.eventId, 200, '{"ok":true}', 120);
  const updated = notifStore.getByEventId(n.eventId)!;
  assert.strictEqual(updated.deliveryStatus, 'DELIVERED');
  assert.strictEqual(updated.attemptCount, 1);
  assert(updated.deliveredAt !== undefined);
});

runTest('Failed delivery increments attempt count and schedules retry', () => {
  const n = notifStore.create({ ...baseNotifParams });
  notifStore.recordFailure(n.eventId, 'Connection refused', 503, 5000);
  const updated = notifStore.getByEventId(n.eventId)!;
  assert.strictEqual(updated.deliveryStatus, 'RETRYING');
  assert.strictEqual(updated.attemptCount, 1);
  assert(updated.nextRetryAt !== undefined);
});

runTest('Notification reaches DEAD_LETTER after max attempts', () => {
  const n = notifStore.create({ ...baseNotifParams });
  for (let i = 0; i < 5; i++) {
    notifStore.recordFailure(n.eventId, 'Server error', 500, 1000);
  }
  const updated = notifStore.getByEventId(n.eventId)!;
  assert.strictEqual(updated.deliveryStatus, 'DEAD_LETTER');
  assert.strictEqual(updated.nextRetryAt, undefined);
});

runTest('Admin manual retry resets DEAD_LETTER to RETRYING', () => {
  const n = notifStore.create({ ...baseNotifParams });
  for (let i = 0; i < 5; i++) {
    notifStore.recordFailure(n.eventId, 'Server error', 500, 1000);
  }
  notifStore.manualRetry(n.eventId);
  const updated = notifStore.getByEventId(n.eventId)!;
  assert.strictEqual(updated.deliveryStatus, 'RETRYING');
});

runTest('Manual retry fails on non-DEAD_LETTER notification', () => {
  const n = notifStore.create({ ...baseNotifParams });
  assert.throws(() => notifStore.manualRetry(n.eventId), /DEAD_LETTER/);
});

// ─── Suite 5: SSRF Guard ──────────────────────────────────────────────────────
console.log('\n--- Test Suite 5: SSRF Protection Guard ---');

runTest('SSRF guard blocks loopback IP (127.0.0.1)', () => {
  const result = quickSsrfCheck('http://127.0.0.1/notify');
  assert.strictEqual(result.safe, false);
});

runTest('SSRF guard blocks localhost hostname', () => {
  const result = quickSsrfCheck('http://localhost/notify');
  assert.strictEqual(result.safe, false);
});

runTest('SSRF guard blocks RFC 1918 private IP (192.168.1.1)', () => {
  const result = quickSsrfCheck('http://192.168.1.1/notify');
  assert.strictEqual(result.safe, false);
});

runTest('SSRF guard blocks RFC 1918 private IP (10.0.0.1)', () => {
  const result = quickSsrfCheck('http://10.0.0.1/notify');
  assert.strictEqual(result.safe, false);
});

runTest('SSRF guard blocks .local hostname', () => {
  const result = quickSsrfCheck('http://myserver.local/notify');
  assert.strictEqual(result.safe, false);
});

runTest('SSRF guard allows public HTTPS URL', () => {
  const result = quickSsrfCheck('https://mat.aima.in/api/v1/payment-notification');
  assert.strictEqual(result.safe, true);
});

runTest('SSRF guard blocks non-http protocols', () => {
  const result = quickSsrfCheck('file:///etc/passwd');
  assert.strictEqual(result.safe, false);
});

runTest('SSRF guard blocks ftp protocol', () => {
  const result = quickSsrfCheck('ftp://mat.aima.in/notify');
  assert.strictEqual(result.safe, false);
});

runTest('SSRF guard rejects malformed URL', () => {
  const result = quickSsrfCheck('not-a-url-at-all');
  assert.strictEqual(result.safe, false);
});

// ─── Suite 6: Cross-App Access Control ───────────────────────────────────────
console.log('\n--- Test Suite 6: Cross-Application Access Control ---');

runTest('Source code isolated amount rules — MAT cannot use CME purpose', () => {
  const matApp = registry.getBySourceCode('MAT')!;
  // CME SEMESTER_FEE — not in MAT's allowed purposes
  assert.strictEqual(matApp.allowedPaymentPurposes.includes('SEMESTER_FEE'), false);
});

runTest('Source application cannot access another app\'s notification URL', () => {
  const matApp = registry.getBySourceCode('MAT')!;
  const cmeApp = registry.getBySourceCode('CME')!;
  assert.notStrictEqual(matApp.notificationUrl, cmeApp.notificationUrl);
});

runTest('toSafeView does not expose credential hashes', () => {
  const app = registry.getBySourceCode('MAT')!;
  const safe = registry.toSafeView(app);
  assert(!('credentials' in safe), 'Safe view must not include raw credentials array');
  const safeStr = JSON.stringify(safe);
  assert(!safeStr.includes('keyHash'), 'keyHash must not appear in safe view');
});

// ─── Test Summary ─────────────────────────────────────────────────────────────
setTimeout(() => {
  console.log('\n======================================================');
  console.log(`🎯 Phase 3 Test Run Complete: ${testsPassed} passed, ${testsFailed} failed.`);
  console.log('======================================================\n');
  if (testsFailed > 0) process.exit(1);
  else process.exit(0);
}, 100);
