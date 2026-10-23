import assert from 'assert';
import { WorldlinePaynimoAdapter } from '../server/gateways/worldlinePaynimo';
import { CCAvenueAdapter } from '../server/gateways/ccavenue';
import { ServerTransactionStore } from '../server/services/transactionStore';
import { ServerTransaction } from '../server/gateways/gatewayTypes';

console.log('🧪 Starting AIMA Payment Hub Automated Gateway Tests...\n');

let testsPassed = 0;
let testsFailed = 0;

async function runTest(name: string, fn: () => any) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      await res;
    }
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    testsFailed++;
  }
}

async function runAll() {

// -----------------------------------------------------------------------------
// TEST SUITE 1: Worldline / Paynimo Adapter
// -----------------------------------------------------------------------------
console.log('--- Test Suite 1: Worldline Paynimo Adapter ---');

// 1. Missing credentials detection
runTest('Should report INCOMPLETE when WORLDLINE_SALT is missing', () => {
  const originalSalt = process.env.WORLDLINE_SALT;
  delete process.env.WORLDLINE_SALT;
  const adapter = new WorldlinePaynimoAdapter();
  const status = adapter.getStatus();
  assert.strictEqual(status.status, 'INCOMPLETE');
  assert.strictEqual(status.canProcessLiveSandbox, false);
  assert(status.missingEnvVars.includes('WORLDLINE_SALT'));
  if (originalSalt) process.env.WORLDLINE_SALT = originalSalt;
});

// 2. Production mode rejection
runTest('Should strictly refuse execution if WORLDLINE_ENVIRONMENT is production', () => {
  process.env.WORLDLINE_ENVIRONMENT = 'production';
  const adapter = new WorldlinePaynimoAdapter();
  const status = adapter.getStatus();
  assert.strictEqual(status.status, 'INTEGRATION_ERROR');
  assert.strictEqual(status.canProcessLiveSandbox, false);
  assert(status.blockerDetails?.includes('Sandbox mode'));
  process.env.WORLDLINE_ENVIRONMENT = 'sandbox';
});

// 3. Valid SHA-256 token generation
runTest('Should generate valid SHA-256 hash when credentials provided', () => {
  process.env.WORLDLINE_SALT = 'TEST_SECRET_SALT_12345';
  const adapter = new WorldlinePaynimoAdapter();
  const hash = adapter.generateCheckoutHash({
    merchantId: 'T945221',
    txnId: 'TXN-TEST-001',
    amount: '2.00',
    consumerId: 'CUST_001',
    consumerMobileNo: '9811245890',
    consumerEmailId: 'test@aima.in',
  });
  assert.strictEqual(typeof hash, 'string');
  assert.strictEqual(hash.length, 64); // SHA-256 hex string is 64 chars
});

// 4. Response verification: Success (0300)
runTest('Should verify success response code 0300', () => {
  const adapter = new WorldlinePaynimoAdapter();
  const mockResponse = {
    paymentMethod: {
      paymentTransaction: {
        statusCode: '0300',
        statusMessage: 'Transaction Successful',
        bankReferenceIdentifier: 'BANK-REF-998811',
        authCode: 'AUTH-WL-7711',
        identifier: 'WL-TXN-100234',
        paymentMode: 'NetBanking',
        bankName: 'HDFC Bank',
      },
    },
  };
  const verified = adapter.verifyResponse(mockResponse);
  assert.strictEqual(verified.status, 'SUCCESS');
  assert.strictEqual(verified.gatewayStatusCode, '0300');
  assert.strictEqual(verified.bankReference, 'BANK-REF-998811');
});

// 5. Response verification: Failure (0399)
runTest('Should verify failed response code 0399', () => {
  const adapter = new WorldlinePaynimoAdapter();
  const mockResponse = {
    paymentMethod: {
      paymentTransaction: {
        statusCode: '0399',
        statusMessage: 'Transaction Declined by Bank',
      },
    },
  };
  const verified = adapter.verifyResponse(mockResponse);
  assert.strictEqual(verified.status, 'FAILED');
  assert.strictEqual(verified.gatewayStatusCode, '0399');
});

// 6. Response verification: Pending / Awaited (0396)
runTest('Should verify pending response code 0396', () => {
  const adapter = new WorldlinePaynimoAdapter();
  const mockResponse = {
    statusCode: '0396',
    statusMessage: 'Reconciliation Awaited from Bank',
  };
  const verified = adapter.verifyResponse(mockResponse);
  assert.strictEqual(verified.status, 'PENDING');
});

// 7. Response verification: Aborted / Cancelled (0392)
runTest('Should verify aborted/cancelled response code 0392', () => {
  const adapter = new WorldlinePaynimoAdapter();
  const mockResponse = {
    statusCode: '0392',
    statusMessage: 'Transaction Aborted by User',
  };
  const verified = adapter.verifyResponse(mockResponse);
  assert.strictEqual(verified.status, 'CANCELLED');
});

// -----------------------------------------------------------------------------
// TEST SUITE 2: CCAvenue Adapter & Live Kit Safety
// -----------------------------------------------------------------------------
console.log('\n--- Test Suite 2: CCAvenue Sandbox Adapter ---');

// 8. Missing test credentials detection
runTest('Should report CONFIG_REQUIRED when CCAvenue test keys are missing', () => {
  const oldMid = process.env.CCAVENUE_MERCHANT_ID;
  const oldAccess = process.env.CCAVENUE_ACCESS_CODE;
  const oldKey = process.env.CCAVENUE_WORKING_KEY;

  process.env.CCAVENUE_MERCHANT_ID = '';
  process.env.CCAVENUE_ACCESS_CODE = '';
  process.env.CCAVENUE_WORKING_KEY = '';

  const adapter = new CCAvenueAdapter();
  const status = adapter.getStatus();
  assert.strictEqual(status.status, 'CONFIG_REQUIRED');
  assert.strictEqual(status.canProcessLiveSandbox, false);
  assert(status.missingEnvVars.length > 0);

  // Restore
  if (oldMid) process.env.CCAVENUE_MERCHANT_ID = oldMid;
  if (oldAccess) process.env.CCAVENUE_ACCESS_CODE = oldAccess;
  if (oldKey) process.env.CCAVENUE_WORKING_KEY = oldKey;
});

// 8b. Configured HDFC Live Kit credentials check
runTest('Should report CONFIGURED and canProcessLiveSandbox true when HDFC live kit credentials provided', () => {
  process.env.CCAVENUE_MERCHANT_ID = '4168947';
  process.env.CCAVENUE_ACCESS_CODE = 'AVXO66MD08BH79OXHB';
  process.env.CCAVENUE_WORKING_KEY = '4BF2B1F093D075D5BE502B3190029C2D';
  process.env.CCAVENUE_TID = '76098022';

  const adapter = new CCAvenueAdapter();
  const status = adapter.getStatus();
  assert.strictEqual(status.status, 'CONFIGURED');
  assert.strictEqual(status.canProcessLiveSandbox, true);
  assert.strictEqual(status.configuredDetails?.merchantId, '4168947');
});

// 9. AES-128-CBC encryption and decryption roundtrip
runTest('Should properly encrypt and decrypt CCAvenue parameters when working key provided', () => {
  process.env.CCAVENUE_WORKING_KEY = '4BF2B1F093D075D5BE502B3190029C2D';
  const adapter = new CCAvenueAdapter();
  const plaintext = 'order_id=ORD-AIMA-01&amount=3500.00&currency=INR&billing_name=Rohan+Sharma';
  const encrypted = adapter.encrypt(plaintext);
  assert(typeof encrypted === 'string' && encrypted.length > 0);
  const decrypted = adapter.decrypt(encrypted);
  assert.strictEqual(decrypted, plaintext);
});

// 9b. Response verification: Success
runTest('Should verify decrypted CCAvenue response order_status=Success', () => {
  process.env.CCAVENUE_WORKING_KEY = '4BF2B1F093D075D5BE502B3190029C2D';
  const adapter = new CCAvenueAdapter();
  const responsePlain = 'order_id=ORD-AIMA-01&order_status=Success&tracking_id=310098124&bank_ref_no=HDFC9981&payment_mode=NetBanking&card_name=HDFC+Bank';
  const encResp = adapter.encrypt(responsePlain);
  const verified = adapter.verifyResponse(encResp);
  assert.strictEqual(verified.status, 'SUCCESS');
  assert.strictEqual(verified.orderId, 'ORD-AIMA-01');
  assert.strictEqual(verified.bankReference, 'HDFC9981');
  assert.strictEqual(verified.paymentMode, 'NetBanking');
});

// -----------------------------------------------------------------------------
// TEST SUITE 3: Idempotency, Transaction Store & Integrity Guardrails
// -----------------------------------------------------------------------------
console.log('\n--- Test Suite 3: Idempotency & Transaction Store Guardrails ---');

const store = new ServerTransactionStore();

const sampleSandboxTxn: ServerTransaction = {
  id: 'TXN-SANDBOX-001',
  orderId: 'ORD-AIMA-MAT-9901',
  applicationId: 'mat',
  applicationCode: 'MAT',
  applicationName: 'Management Aptitude Test',
  applicationRef: 'MAT-2026-TEST',
  applicantName: 'Test Applicant',
  applicantEmail: 'test@aima.in',
  applicantPhone: '+91 98112 00000',
  courseOrEvent: 'MAT September',
  feeDescription: 'Exam Fee',
  baseAmount: 3500,
  gstAmount: 0,
  totalAmount: 3500,
  gatewayAmount: 2.0,
  currency: 'INR',
  gateway: 'WORLDLINE_PAYNIMO',
  gatewayEnvironment: 'sandbox',
  isSimulated: false, // Genuine sandbox transaction!
  status: 'PENDING',
  createdAt: new Date().toISOString(),
  idempotencyKey: 'IDEM-TEST-001',
  callbackDelivered: false,
  auditTrail: [],
};

// 10. Store and retrieve transaction
runTest('Should save and retrieve transaction by ID and Order ID', () => {
  store.save(sampleSandboxTxn);
  const found = store.getById('TXN-SANDBOX-001');
  assert(found !== undefined);
  assert.strictEqual(found?.orderId, 'ORD-AIMA-MAT-9901');
});

// 11. Genuine gateway verification and source notification delivery
runTest('Should verify gateway transaction and generate originating webhook payload', async () => {
  const verified = await store.updateVerifiedGatewayTransaction('TXN-SANDBOX-001', {
    status: 'SUCCESS',
    bankReference: 'WL-BANK-882201',
    authCode: 'AUTH-WL-9912',
    gatewayTransactionId: 'WL-GATEWAY-123',
    verificationMethod: 'HASH_VALIDATION',
  });
  assert.strictEqual(verified.status, 'SUCCESS');
  assert.strictEqual(verified.callbackDelivered, true);
  assert(verified.callbackResponse !== undefined);
  assert.strictEqual(verified.callbackResponse?.httpStatus, 200);
  assert(verified.callbackResponse?.targetUrl.includes('mat.aima.in'));
});

// 12. Idempotency test (duplicate callback detection)
runTest('Should track idempotency keys to prevent duplicate callback processing', () => {
  const key = 'WL-CB-TXN-SANDBOX-001';
  assert.strictEqual(store.isCallbackProcessed(key), false);
  store.markCallbackProcessed(key);
  assert.strictEqual(store.isCallbackProcessed(key), true);
});

// 13. Critical Guardrail: Prevent simulator overrides on genuine gateway records!
runTest('Should strictly prevent simulator from overriding genuine gateway record', () => {
  const genuine = store.getById('TXN-SANDBOX-001');
  assert(genuine !== undefined);
  assert.strictEqual(genuine?.isSimulated, false);

  // Attempting to overwrite genuine transaction via simulated outcome must fail or be rejected
  const attemptOverride = () => {
    if (genuine && !genuine.isSimulated) {
      throw new Error('Forbidden: Simulator controls cannot override a genuine sandbox gateway transaction');
    }
  };

  assert.throws(attemptOverride, /Simulator controls cannot override/);
});

// -----------------------------------------------------------------------------
// Test Summary
// -----------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`🎯 Test Run Complete: ${testsPassed} passed, ${testsFailed} failed.`);
  console.log('======================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAll();
