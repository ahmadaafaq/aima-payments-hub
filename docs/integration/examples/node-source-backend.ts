/**
 * AIMA Payment Hub — Sample Source Backend Integration (Node.js/TypeScript)
 *
 * This example shows how a source application (e.g. MAT portal) integrates
 * with the AIMA Payment Hub Phase 3 API.
 *
 * Usage:
 *   PAYMENT_HUB_URL=http://localhost:3000 \
 *   AIMA_SOURCE_CODE=MAT \
 *   AIMA_API_KEY=aima_mat_demo_key_phase3_sandbox_2026 \
 *   npx tsx docs/integration/examples/node-source-backend.ts
 */

import crypto from 'crypto';
import http from 'http';
import { URL } from 'url';

const HUB_URL = process.env.PAYMENT_HUB_URL || 'http://localhost:3000';
const SOURCE_CODE = process.env.AIMA_SOURCE_CODE || 'MAT';
const API_KEY = process.env.AIMA_API_KEY || 'aima_mat_demo_key_phase3_sandbox_2026';

// ─── HMAC Signing ─────────────────────────────────────────────────────────────

function buildCanonicalRequest(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  bodyHash: string
): string {
  return `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
}

function signRequest(method: string, path: string, body: string): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');
  const bodyHash = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
  const canonical = buildCanonicalRequest(method, path, timestamp, nonce, bodyHash);
  const signature = crypto
    .createHmac('sha256', API_KEY)
    .update(canonical, 'utf8')
    .digest('hex');

  return {
    'Content-Type': 'application/json',
    'X-AIMA-Source-Code': SOURCE_CODE,
    'X-AIMA-Timestamp': timestamp,
    'X-AIMA-Nonce': nonce,
    'X-AIMA-API-Key': API_KEY,
    'X-AIMA-Signature': signature,
  };
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

async function hubFetch(
  method: string,
  path: string,
  body?: object
): Promise<any> {
  const bodyStr = body ? JSON.stringify(body) : '';
  const headers = method === 'GET'
    ? {
        'Authorization': `Bearer ${API_KEY}`,
        'X-AIMA-Source-Code': SOURCE_CODE,
      }
    : signRequest(method, path, bodyStr);

  const parsedUrl = new URL(`${HUB_URL}${path}`);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 3000,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── Notification Verification ────────────────────────────────────────────────

function verifyNotificationSignature(payload: any): boolean {
  const canonical = [
    payload.eventId,
    payload.orderId,
    payload.sourceCode,
    payload.status,
    String(payload.amount?.paise),
    payload.signedAt,
  ].join('|');

  // Hub signs with keyHash (HMAC of API key with server pepper)
  const signingSecret = crypto
    .createHmac('sha256', 'AIMA_KEY_HASH_PEPPER_2026')
    .update(API_KEY)
    .digest('hex');

  const expected = crypto
    .createHmac('sha256', signingSecret)
    .update(canonical, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(payload.signature, 'hex')
    );
  } catch {
    return false;
  }
}

// ─── Integration Demo ─────────────────────────────────────────────────────────

async function runIntegrationDemo() {
  console.log('='.repeat(60));
  console.log('AIMA Payment Hub — Source Backend Integration Demo');
  console.log(`Hub URL: ${HUB_URL}`);
  console.log(`Source Code: ${SOURCE_CODE}`);
  console.log('='.repeat(60));
  console.log();

  // ── Step 1: Create payment session ────────────────────────────────────────
  console.log('Step 1: Creating payment session...');

  const idempotencyKey = `MAT-DEMO-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  let sessionResponse: any;
  try {
    sessionResponse = await hubFetch('POST', '/api/v1/payment-sessions', {
      externalOrderId: `MAT-EXT-${Date.now()}`,
      applicationReference: 'MAT-2026-904128',
      paymentPurpose: 'EXAM_FEE',
      amount: { value: 3500, currency: 'INR' },
      customerName: 'Aarav Singhania',
      customerEmail: 'aarav.singhania@example.com',
      customerPhone: '+919811245890',
      returnUrl: 'http://localhost:4001/payment/return',
      idempotencyKey,
      metadata: { examMode: 'CBT+PBT', center: 'Delhi' },
    });
  } catch (err: any) {
    console.error('❌ Failed to create session:', err.message);
    return;
  }

  if (!sessionResponse.success) {
    console.error('❌ Session creation failed:', sessionResponse.error);
    return;
  }

  console.log('✅ Payment session created:');
  console.log(`   Session Token: ${sessionResponse.sessionToken?.substring(0, 16)}...`);
  console.log(`   Checkout URL: ${sessionResponse.checkoutUrl}`);
  console.log(`   Order ID: ${sessionResponse.orderId}`);
  console.log(`   Amount: ₹${sessionResponse.amountInr} (${sessionResponse.amountPaise} paise)`);
  console.log(`   Expires: ${sessionResponse.expiresAt}`);
  console.log();

  // ── Step 2: Simulate "redirect browser to checkout URL" ───────────────────
  console.log('Step 2: In a real app, redirect user browser to:');
  console.log(`   ${sessionResponse.checkoutUrl}`);
  console.log('   (User completes payment on AIMA checkout page)');
  console.log();

  // ── Step 3: Query payment status ──────────────────────────────────────────
  console.log('Step 3: Querying payment status (S2S lookup)...');
  let statusResponse: any;
  try {
    statusResponse = await hubFetch('GET', `/api/v1/payments/${sessionResponse.orderId}`);
    console.log('✅ Status response:');
    console.log(`   Order: ${statusResponse.orderId}`);
    console.log(`   Status: ${statusResponse.status}`);
    console.log(`   Amount: ₹${statusResponse.amount?.inr}`);
    console.log(`   Verification: ${statusResponse.verificationState || 'PENDING'}`);
  } catch (err: any) {
    console.error('❌ Status query failed:', err.message);
  }
  console.log();

  // ── Step 4: Simulate notification verification ────────────────────────────
  console.log('Step 4: Simulating notification verification...');
  const mockNotification = {
    eventId: `EVT-${Date.now()}-DEMO`,
    signedAt: new Date().toISOString(),
    orderId: sessionResponse.orderId,
    sourceCode: SOURCE_CODE,
    status: 'SUCCESS',
    amount: { paise: 350000, inr: '3500.00', currency: 'INR' },
  };

  // Compute expected signature
  const canonical = [
    mockNotification.eventId,
    mockNotification.orderId,
    mockNotification.sourceCode,
    mockNotification.status,
    String(mockNotification.amount.paise),
    mockNotification.signedAt,
  ].join('|');

  const signingSecret = crypto
    .createHmac('sha256', 'AIMA_KEY_HASH_PEPPER_2026')
    .update(API_KEY)
    .digest('hex');

  const mockSignature = crypto
    .createHmac('sha256', signingSecret)
    .update(canonical, 'utf8')
    .digest('hex');

  const mockPayloadWithSig = { ...mockNotification, signature: mockSignature };

  const isValid = verifyNotificationSignature(mockPayloadWithSig);
  console.log(`✅ Valid notification signature: ${isValid}`);

  // Test tampered payload
  const tampered = { ...mockPayloadWithSig, amount: { ...mockPayloadWithSig.amount, paise: 999999 } };
  const isInvalid = verifyNotificationSignature(tampered);
  console.log(`✅ Tampered notification rejected: ${!isInvalid}`);
  console.log();

  console.log('='.repeat(60));
  console.log('Integration demo complete.');
  console.log('See docs/integration/README.md for full documentation.');
  console.log('='.repeat(60));
}

runIntegrationDemo().catch(console.error);
