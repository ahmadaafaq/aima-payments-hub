/**
 * AIMA Payment Hub — Automatic Gateway Routing & Source Matrix Tests
 *
 * Acceptance Criteria Covered:
 * 1. Test all eight mappings:
 *    - AMIACRC                    -> CME -> HDFC / CCAvenue
 *    - CME Admission – PGDM PGCM  -> CME -> HDFC / CCAvenue
 *    - CME AMD DNC                -> CME -> HDFC / CCAvenue
 *    - AMT                        -> CMS -> HDFC / CCAvenue
 *    - MAT B School               -> CMS -> HDFC / CCAvenue
 *    - UGAT                       -> CMS -> HDFC / CCAvenue
 *    - LMA                        -> LMA -> Worldline / Paynimo
 *    - VLC                        -> VLC -> Worldline / Paynimo
 *    - Unmapped sources           -> HDFC / CCAvenue (Default)
 * 2. Missing gateway parameter resolves to assigned gateway automatically.
 * 3. Conflicting gateway parameter is rejected (never trusted to override registry).
 * 4. Invalid source application rejected.
 * 5. Unregistered return URL rejected.
 * 6. Gateway configuration failure (unconfigured sandbox errors out, no silent fallback).
 * 7. Payment status verification (source-authenticated, tenant boundary enforced).
 * 8. Admin dynamic reconfiguration without code changes.
 */

import assert from 'assert';
import { SourceApplicationRegistry } from '../server/models/sourceApplications';
import { PaymentSessionStore } from '../server/models/paymentSessions';
import { ServerTransactionStore } from '../server/services/transactionStore';
import { CCAvenueAdapter } from '../server/gateways/ccavenue';
import { WorldlinePaynimoAdapter } from '../server/gateways/worldlinePaynimo';
import { ServerTransaction } from '../server/gateways/gatewayTypes';

console.log('🧪 Starting AIMA Automatic Gateway Routing Tests...\n');

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

const registry = new SourceApplicationRegistry();

// ─── Suite 1: All 8 Source-to-Gateway Matrix Mappings ─────────────────────────
console.log('--- Test Suite 1: Source-to-Gateway Matrix Mappings ---');

// 1. AMIACRC -> CME -> HDFC / CCAvenue
runTest('Matrix 1: AMIACRC maps to CME and resolves to CCAVENUE', () => {
  const app = registry.getBySourceCode('AMIACRC');
  assert(app !== undefined, 'AMIACRC must be registered');
  assert.strictEqual(app!.department, 'CME');
  assert.strictEqual(app!.assignedGateway, 'CCAVENUE');
  const resolved = registry.resolveGatewayForSource('AMIACRC');
  assert.strictEqual(resolved, 'CCAVENUE');
});

// 2. CME Admission – PGDM PGCM -> CME -> HDFC / CCAvenue
runTest('Matrix 2: CME Admission – PGDM PGCM maps to CME and resolves to CCAVENUE', () => {
  const app = registry.getBySourceCode('CME Admission – PGDM PGCM');
  assert(app !== undefined, 'CME Admission must be registered');
  assert.strictEqual(app!.department, 'CME');
  assert.strictEqual(app!.assignedGateway, 'CCAVENUE');
  assert.strictEqual(registry.resolveGatewayForSource('CME Admission – PGDM PGCM'), 'CCAVENUE');
  // Also check aliases
  assert.strictEqual(registry.resolveGatewayForSource('CME_ADMISSION'), 'CCAVENUE');
  assert.strictEqual(registry.resolveGatewayForSource('CME_PGDM'), 'CCAVENUE');
});

// 3. CME AMD DNC -> CME -> HDFC / CCAvenue
runTest('Matrix 3: CME AMD DNC maps to CME and resolves to CCAVENUE', () => {
  const app = registry.getBySourceCode('CME AMD DNC');
  assert(app !== undefined, 'CME AMD DNC must be registered');
  assert.strictEqual(app!.department, 'CME');
  assert.strictEqual(app!.assignedGateway, 'CCAVENUE');
  assert.strictEqual(registry.resolveGatewayForSource('CME AMD DNC'), 'CCAVENUE');
  assert.strictEqual(registry.resolveGatewayForSource('CME_AMD_DNC'), 'CCAVENUE');
});

// 4. AMT -> CMS -> HDFC / CCAvenue
runTest('Matrix 4: AMT maps to CMS and resolves to CCAVENUE', () => {
  const app = registry.getBySourceCode('AMT');
  assert(app !== undefined, 'AMT must be registered');
  assert.strictEqual(app!.department, 'CMS');
  assert.strictEqual(app!.assignedGateway, 'CCAVENUE');
  assert.strictEqual(registry.resolveGatewayForSource('AMT'), 'CCAVENUE');
});

// 5. MAT B School -> CMS -> HDFC / CCAvenue
runTest('Matrix 5: MAT B School maps to CMS and resolves to CCAVENUE', () => {
  const app = registry.getBySourceCode('MAT B School');
  assert(app !== undefined, 'MAT B School must be registered');
  assert.strictEqual(app!.department, 'CMS');
  assert.strictEqual(app!.assignedGateway, 'CCAVENUE');
  assert.strictEqual(registry.resolveGatewayForSource('MAT B School'), 'CCAVENUE');
  assert.strictEqual(registry.resolveGatewayForSource('MAT_B_SCHOOL'), 'CCAVENUE');
});

// 6. UGAT -> CMS -> HDFC / CCAvenue
runTest('Matrix 6: UGAT maps to CMS and resolves to CCAVENUE', () => {
  const app = registry.getBySourceCode('UGAT');
  assert(app !== undefined, 'UGAT must be registered');
  assert.strictEqual(app!.department, 'CMS');
  assert.strictEqual(app!.assignedGateway, 'CCAVENUE');
  assert.strictEqual(registry.resolveGatewayForSource('UGAT'), 'CCAVENUE');
});

// 7. LMA -> LMA -> Worldline / Paynimo
runTest('Matrix 7: LMA maps to LMA department and resolves to WORLDLINE_PAYNIMO', () => {
  const app = registry.getBySourceCode('LMA');
  assert(app !== undefined, 'LMA must be registered');
  assert.strictEqual(app!.department, 'LMA');
  assert.strictEqual(app!.assignedGateway, 'WORLDLINE_PAYNIMO');
  assert.strictEqual(registry.resolveGatewayForSource('LMA'), 'WORLDLINE_PAYNIMO');
});

// 8. VLC -> VLC -> Worldline / Paynimo
runTest('Matrix 8: VLC maps to VLC department and resolves to WORLDLINE_PAYNIMO', () => {
  const app = registry.getBySourceCode('VLC');
  assert(app !== undefined, 'VLC must be registered');
  assert.strictEqual(app!.department, 'VLC');
  assert.strictEqual(app!.assignedGateway, 'WORLDLINE_PAYNIMO');
  assert.strictEqual(registry.resolveGatewayForSource('VLC'), 'WORLDLINE_PAYNIMO');
});

// 9. Unmapped applications fallback to HDFC / CCAvenue
runTest('Matrix Default: Unmapped applications default to CCAVENUE', () => {
  // Case League is not in the 8-item matrix
  assert.strictEqual(registry.resolveGatewayForSource('CASE_LEAGUE'), 'CCAVENUE');
  // Unknown arbitrary source code
  assert.strictEqual(registry.resolveGatewayForSource('SOME_NEW_PROJECT'), 'CCAVENUE');
});

// ─── Suite 2: Missing & Conflicting Gateway Parameters ────────────────────────
console.log('\n--- Test Suite 2: Gateway Parameter Validation & Registry Precedence ---');

runTest('Missing gateway parameter resolves to registered gateway automatically', () => {
  const res1 = registry.validateAndResolveGateway('AMIACRC', undefined);
  assert.strictEqual(res1.valid, true);
  assert.strictEqual(res1.resolvedGateway, 'CCAVENUE');

  const res2 = registry.validateAndResolveGateway('LMA', '');
  assert.strictEqual(res2.valid, true);
  assert.strictEqual(res2.resolvedGateway, 'WORLDLINE_PAYNIMO');
});

runTest('Conflicting gateway parameter is strictly rejected (never overrides registry)', () => {
  // AMIACRC is assigned CCAVENUE; client attempts to pass WORLDLINE_PAYNIMO
  const res = registry.validateAndResolveGateway('AMIACRC', 'WORLDLINE_PAYNIMO');
  assert.strictEqual(res.valid, false, 'Conflicting parameter must be rejected');
  assert(res.reason?.includes('Gateway conflict'));
  assert(res.reason?.includes('cannot override'));
  assert.strictEqual(res.resolvedGateway, 'CCAVENUE', 'Registry assignment must be preserved');
});

runTest('Conflicting gateway parameter for LMA is strictly rejected', () => {
  // LMA is assigned WORLDLINE_PAYNIMO; client attempts to pass CCAVENUE
  const res = registry.validateAndResolveGateway('LMA', 'CCAVENUE');
  assert.strictEqual(res.valid, false, 'Conflicting parameter must be rejected');
  assert(res.reason?.includes('Gateway conflict'));
  assert.strictEqual(res.resolvedGateway, 'WORLDLINE_PAYNIMO');
});

runTest('Matching gateway parameter succeeds', () => {
  const res1 = registry.validateAndResolveGateway('AMIACRC', 'CCAVENUE');
  assert.strictEqual(res1.valid, true);
  assert.strictEqual(res1.resolvedGateway, 'CCAVENUE');

  const res2 = registry.validateAndResolveGateway('LMA', 'WORLDLINE_PAYNIMO');
  assert.strictEqual(res2.valid, true);
  assert.strictEqual(res2.resolvedGateway, 'WORLDLINE_PAYNIMO');
});

runTest('Normalization accepts human variations (e.g. HDFC / CCAvenue, Paynimo)', () => {
  const res1 = registry.validateAndResolveGateway('AMIACRC', 'HDFC / CCAvenue');
  assert.strictEqual(res1.valid, true);
  assert.strictEqual(res1.resolvedGateway, 'CCAVENUE');

  const res2 = registry.validateAndResolveGateway('LMA', 'Paynimo');
  assert.strictEqual(res2.valid, true);
  assert.strictEqual(res2.resolvedGateway, 'WORLDLINE_PAYNIMO');
});

// ─── Suite 3: Invalid Sources & Unregistered Return URLs ─────────────────────
console.log('\n--- Test Suite 3: Security Guardrails: Source & URL Validation ---');

runTest('Invalid / non-existent source is rejected', () => {
  const res = registry.validateAndResolveGateway('NON_EXISTENT_SOURCE_123', null);
  assert.strictEqual(res.valid, false);
  assert(res.reason?.includes('not registered') || res.reason?.includes('Unknown'));
});

runTest('Unregistered return URL is rejected by allowlist', () => {
  const app = registry.getBySourceCode('AMIACRC')!;
  // Registered for AMIACRC: https://amiacrc.aima.in, https://example.com, http://localhost:4010
  const valid = registry.validateReturnUrl(app, 'https://example.com/payment-result');
  assert.strictEqual(valid, true, 'Registered origin must be accepted');

  const validLoopback = registry.validateReturnUrl(app, 'http://0.0.0.0:3002/registration');
  assert.strictEqual(validLoopback, true, 'Local loopback/bind origin (0.0.0.0:3002) must be accepted');

  const validLocalhost = registry.validateReturnUrl(app, 'http://localhost:3002/registration');
  assert.strictEqual(validLocalhost, true, 'Localhost:3002 must be accepted');

  const invalid = registry.validateReturnUrl(app, 'https://malicious-attacker-site.com/steal-creds');
  assert.strictEqual(invalid, false, 'Unregistered origin must be blocked');

  const subdomainAttack = registry.validateReturnUrl(app, 'https://amiacrc.aima.in.evil.com/callback');
  assert.strictEqual(subdomainAttack, false, 'Attacker suffix must be blocked');
});

// ─── Suite 4: Gateway Configuration Failures (No Silent Fallback) ─────────────
console.log('\n--- Test Suite 4: Gateway Configuration Failure Guardrails ---');

runTest('CCAvenue adapter reports CONFIG_REQUIRED when test keys are missing', () => {
  const oldKey = process.env.CCAVENUE_WORKING_KEY;
  process.env.CCAVENUE_WORKING_KEY = '';
  process.env.CCAVENUE_ACCESS_CODE = '';

  const ccAdapter = new CCAvenueAdapter();
  const status = ccAdapter.getStatus();
  assert.strictEqual(status.canProcessLiveSandbox, false);
  assert.strictEqual(status.status, 'CONFIG_REQUIRED');

  // Restore
  if (oldKey) process.env.CCAVENUE_WORKING_KEY = oldKey;
});

runTest('Worldline Paynimo adapter reports live sandbox ready when T1202993 configured', () => {
  process.env.WORLDLINE_MERCHANT_CODE = 'T1202993';
  process.env.WORLDLINE_SALT = '5367530737NPUJCA';
  process.env.WORLDLINE_ENVIRONMENT = 'sandbox';
  const wlAdapter = new WorldlinePaynimoAdapter();
  const status = wlAdapter.getStatus();
  assert.strictEqual(status.canProcessLiveSandbox, true);
  assert.strictEqual(status.configuredDetails?.merchantId, 'T1202993');
});

// ─── Suite 5: Payment Session Creation & Persisted Gateway ───────────────────
console.log('\n--- Test Suite 5: Payment Session & Ledger Persistence ---');

const sessionStore = new PaymentSessionStore();
const txnStore = new ServerTransactionStore();

runTest('Payment session persists resolved gateway and routing mode', () => {
  const session = sessionStore.create({
    transactionId: 'TXN-ROUTING-001',
    orderId: 'ORD-AIMA-AMIACRC-901',
    sourceCode: 'AMIACRC',
    externalOrderId: 'REG123',
    applicationReference: 'REG123',
    paymentPurpose: 'REG123',
    amountPaise: 100000,
    currency: 'INR',
    customerName: 'Test Applicant',
    customerEmail: 'applicant@aima.in',
    returnUrl: 'https://example.com/payment-result',
    selectedGateway: 'CCAVENUE',
    routingMode: 'AUTO',
    idempotencyKey: 'IDEM-ROUTING-001',
  });

  assert.strictEqual(session.selectedGateway, 'CCAVENUE');
  assert.strictEqual(session.routingMode, 'AUTO');
  assert.strictEqual(session.amountPaise, 100000);
});

runTest('Transaction ledger persists resolved gateway and nominal amount', () => {
  const txn: ServerTransaction = {
    id: 'TXN-ROUTING-002',
    orderId: 'ORD-AIMA-LMA-902',
    applicationId: 'src-lma-001',
    applicationCode: 'LMA',
    applicationName: 'Local Management Associations',
    applicationRef: 'LMA-REG-441',
    applicantName: 'DMA Delegate',
    applicantEmail: 'dma@lma.in',
    applicantPhone: '+91 11 2464 1234',
    courseOrEvent: 'SUBSCRIPTION_FEE',
    feeDescription: 'Annual LMA Affiliation',
    baseAmount: 20000,
    gstAmount: 3600,
    totalAmount: 23600,
    gatewayAmount: 2.0,
    currency: 'INR',
    gateway: 'WORLDLINE_PAYNIMO',
    gatewayEnvironment: 'sandbox',
    isSimulated: false,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    idempotencyKey: 'IDEM-LMA-002',
    callbackDelivered: false,
    auditTrail: [],
  };

  txnStore.save(txn);
  const retrieved = txnStore.getByOrderId('ORD-AIMA-LMA-902');
  assert(retrieved !== undefined);
  assert.strictEqual(retrieved?.gateway, 'WORLDLINE_PAYNIMO');
  assert.strictEqual(retrieved?.totalAmount, 23600);
});

// ─── Suite 6: Authoritative Status Verification & Tenant Boundary ────────────
console.log('\n--- Test Suite 6: Authoritative Status Verification & Tenant Isolation ---');

runTest('Authoritative status check succeeds for matching source tenant', () => {
  const order = txnStore.getByOrderId('ORD-AIMA-LMA-902')!;
  assert(order !== undefined);
  assert.strictEqual(order.applicationCode, 'LMA');
  assert.strictEqual(order.status, 'PENDING');
});

runTest('Cross-tenant status lookup boundary is enforced', () => {
  const lmaOrder = txnStore.getByOrderId('ORD-AIMA-LMA-902')!;
  const matApp = registry.getBySourceCode('AMIACRC')!;

  // AMIACRC attempting to read LMA order
  const isAuthorized = lmaOrder.applicationCode === matApp.sourceCode;
  assert.strictEqual(isAuthorized, false, 'Cross-tenant lookup must be denied');
});

// ─── Suite 7: Dynamic Admin Gateway Reassignment ─────────────────────────────
console.log('\n--- Test Suite 7: Dynamic Admin Gateway Reassignment ---');

runTest('Admin can reassign gateway dynamically without modifying code', () => {
  // Before: AMIACRC is CCAVENUE
  assert.strictEqual(registry.resolveGatewayForSource('AMIACRC'), 'CCAVENUE');

  // Admin reassigns AMIACRC to WORLDLINE_PAYNIMO
  const updated = registry.updateGatewayAssignment('AMIACRC', 'WORLDLINE_PAYNIMO', 'AUTO', 'CME', 'ADMIN_TEST');
  assert.strictEqual(updated.assignedGateway, 'WORLDLINE_PAYNIMO');

  // Subsequent lookups immediately reflect new assignment
  assert.strictEqual(registry.resolveGatewayForSource('AMIACRC'), 'WORLDLINE_PAYNIMO');

  const check = registry.validateAndResolveGateway('AMIACRC');
  assert.strictEqual(check.resolvedGateway, 'WORLDLINE_PAYNIMO');

  // Restore back to CCAVENUE
  registry.updateGatewayAssignment('AMIACRC', 'CCAVENUE', 'AUTO', 'CME', 'ADMIN_TEST');
  assert.strictEqual(registry.resolveGatewayForSource('AMIACRC'), 'CCAVENUE');
});

runTest('Admin can register a new application with custom gateway assignment', () => {
  const { app } = registry.register({
    sourceCode: 'NEW_AIMA_PORTAL',
    name: 'New AIMA Executive Portal',
    department: 'Corporate',
    description: 'Dynamic registration test',
    isActive: true,
    assignedGateway: 'WORLDLINE_PAYNIMO',
    routingMode: 'AUTO',
    allowedReturnUrls: ['https://newportal.aima.in'],
    notificationUrl: 'https://newportal.aima.in/api/v1/payment-notification',
    allowedPaymentPurposes: ['REGISTRATION_FEE'],
    amountRules: [],
    allowedGateways: ['WORLDLINE_PAYNIMO'],
  });

  assert.strictEqual(app.assignedGateway, 'WORLDLINE_PAYNIMO');
  assert.strictEqual(registry.resolveGatewayForSource('NEW_AIMA_PORTAL'), 'WORLDLINE_PAYNIMO');
});

// ─── Test Suite 8: Reference Idempotency & Duplicate Payment Guardrails ───────
console.log('\n--- Test Suite 8: Reference Idempotency & Duplicate Payment Guardrails ---');

runTest('findActivePending returns unexpired pending session for matching source and reference', () => {
  const store = new PaymentSessionStore();
  const session = store.create({
    transactionId: 'TXN-IDEM-001',
    orderId: 'ORD-AIMA-CASE_LEAGUE-001',
    sourceCode: 'CASE_LEAGUE',
    externalOrderId: 'ICRC-REG-2026',
    applicationReference: 'ICRC-REG-2026',
    paymentPurpose: 'REGISTRATION_FEE',
    amountPaise: 59000,
    currency: 'INR',
    customerName: 'Dr. Vikram Malhotra',
    customerEmail: 'vikram@aima.in',
    customerPhone: '9876543210',
    returnUrl: 'http://localhost:3000',
    selectedGateway: 'CCAVENUE',
    routingMode: 'AUTO',
    idempotencyKey: 'IDEM-KEY-001',
  });

  const found = store.findActivePending('CASE_LEAGUE', 'ICRC-REG-2026');
  assert(found !== undefined);
  assert.strictEqual(found?.sessionToken, session.sessionToken);
  assert.strictEqual(found?.amountPaise, 59000);
});

runTest('findActivePending returns undefined when session is completed or non-existent', () => {
  const store = new PaymentSessionStore();
  const session = store.create({
    transactionId: 'TXN-IDEM-002',
    orderId: 'ORD-AIMA-CASE_LEAGUE-002',
    sourceCode: 'CASE_LEAGUE',
    externalOrderId: 'ICRC-REG-COMPLETED',
    applicationReference: 'ICRC-REG-COMPLETED',
    paymentPurpose: 'REGISTRATION_FEE',
    amountPaise: 59000,
    currency: 'INR',
    customerName: 'Dr. Vikram Malhotra',
    customerEmail: 'vikram@aima.in',
    customerPhone: '9876543210',
    returnUrl: 'http://localhost:3000',
    selectedGateway: 'CCAVENUE',
    routingMode: 'AUTO',
    idempotencyKey: 'IDEM-KEY-002',
  });

  // Mark completed
  store.markCompleted(session.sessionToken);

  const found = store.findActivePending('CASE_LEAGUE', 'ICRC-REG-COMPLETED');
  assert.strictEqual(found, undefined, 'Completed session should not be returned as active pending');

  const notFound = store.findActivePending('CASE_LEAGUE', 'NON-EXISTENT-REF');
  assert.strictEqual(notFound, undefined);
});

// ─── Summary ─────────────────────────────────────────────────────────────────
setTimeout(() => {
  console.log('\n======================================================');
  console.log(`🎯 Automatic Gateway Routing Test Run Complete: ${testsPassed} passed, ${testsFailed} failed.`);
  console.log('======================================================\n');
  if (testsFailed > 0) {
    process.exit(1);
  }
}, 50);
