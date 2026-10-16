# AIMA Payment Hub — Source Application Integration Guide (Phase 3)

## Overview

The AIMA Centralized Payment Hub provides a secure, reusable payment integration for all AIMA applications (MAT, CME, CASE_LEAGUE, UGAT, LMA, AIMA_VCC, AMT, AIMA_EVENTS).

**Source applications do NOT need their own payment gateway SDK.** The Hub handles all gateway integration, cryptographic operations, and verification.

---

## Prerequisites

- Your application must be registered in the Hub's Application Registry by an AIMA administrator
- You will receive:
  - A **Source Code** (e.g. `MAT`, `CME`)
  - A **raw API key** (shown once — store it securely as `AIMA_API_KEY`)
- Your **notification URL** and **return URLs** must be registered in the registry before use

---

## Environment Variables (Source Application)

```bash
# Payment Hub base URL
PAYMENT_HUB_URL=https://payments.aima.in

# Your source application credentials (provided by AIMA admin)
AIMA_SOURCE_CODE=MAT
AIMA_API_KEY=aima_mat_demo_key_phase3_sandbox_2026
```

---

## End-to-End Integration Flow

```
Source Backend           AIMA Payment Hub           Payment Gateway
     |                        |                          |
     |-- POST /api/v1/payment-sessions (HMAC signed) --> |
     |<-- { sessionToken, checkoutUrl, orderId } ------  |
     |                        |                          |
     |-- Redirect browser --> checkoutUrl                |
     |                        |                          |
     |                  User selects gateway             |
     |                        |                          |
     |                        |-- Initiate payment ----> |
     |                        |<-- Gateway callback ---- |
     |                        |                          |
     |                  Verify gateway response          |
     |                        |                          |
     |<-- S2S Notification (HMAC signed) -------------- |
     |                        |                          |
     |-- Redirect browser --> returnUrl?ref=SESSION_TOKEN
     |                        |
     |-- GET /api/v1/payments/:orderId (verify) -------> |
     |<-- { status: 'SUCCESS', ... } ------------------- |
```

---

## 1. Initiate a Payment Session

**Your backend** calls the Hub API. **Never call from the browser.**

### HMAC Signing

```
X-AIMA-Source-Code: MAT
X-AIMA-Timestamp: <unix seconds>
X-AIMA-Nonce: <random 16+ char string>
X-AIMA-API-Key: <your raw API key>
X-AIMA-Signature: HMAC-SHA256(canonical_request, api_key)

canonical_request = "METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256(body)"
```

### Request

```http
POST /api/v1/payment-sessions
Content-Type: application/json
X-AIMA-Source-Code: MAT
X-AIMA-Timestamp: 1728999999
X-AIMA-Nonce: rand_nonce_abc123xyz
X-AIMA-API-Key: aima_mat_demo_key_phase3_sandbox_2026
X-AIMA-Signature: <computed_hmac>

{
  "externalOrderId": "MAT-ORDER-2026-001",
  "applicationReference": "MAT-2026-904128",
  "paymentPurpose": "EXAM_FEE",
  "amount": { "value": 3500, "currency": "INR" },
  "customerName": "Aarav Singhania",
  "customerEmail": "aarav@example.com",
  "customerPhone": "+919811245890",
  "returnUrl": "https://mat.aima.in/payment/return",
  "idempotencyKey": "MAT-IDEM-2026-001-unique",
  "metadata": { "studentId": "STU-9041", "examMode": "CBT+PBT" }
}
```

### Response

```json
{
  "success": true,
  "sessionToken": "a3f5d2...64-char-hex...",
  "checkoutUrl": "https://payments.aima.in/checkout/a3f5d2...",
  "orderId": "ORD-AIMA-MAT-7821",
  "externalOrderId": "MAT-ORDER-2026-001",
  "amountPaise": 350000,
  "amountInr": "3500.00",
  "currency": "INR",
  "expiresAt": "2026-10-15T19:15:00.000Z"
}
```

### 2. Redirect User's Browser

```javascript
// In your web controller / server response:
res.redirect(checkoutUrl);
// OR in Next.js:
return { redirect: { destination: checkoutUrl, permanent: false } };
```

The user completes payment on the AIMA checkout page. **Do not pass any payment parameters in the URL.**

---

## 3. Handle the Return Redirect

After payment, the browser is redirected to your registered `returnUrl`:

```
https://mat.aima.in/payment/return?ref=a3f5d2...&orderId=ORD-AIMA-MAT-7821
```

> ⚠️ **The URL parameters are for UX only.** Do NOT mark a payment as successful based solely on a URL redirect. Always verify via notification or API call.

Display a "processing" state until you receive the S2S notification or query the status API.

---

## 4. Receive S2S Payment Notification

The Hub sends a signed POST request to your registered notification URL.

### Notification Payload

```json
{
  "schemaVersion": "1.0",
  "eventId": "EVT-1728999999-ABCDEF",
  "signedAt": "2026-10-15T19:15:30.000Z",
  "orderId": "ORD-AIMA-MAT-7821",
  "sourceCode": "MAT",
  "externalOrderId": "MAT-ORDER-2026-001",
  "applicationReference": "MAT-2026-904128",
  "paymentPurpose": "EXAM_FEE",
  "amount": { "paise": 350000, "inr": "3500.00", "currency": "INR" },
  "status": "SUCCESS",
  "gateway": "WORLDLINE_PAYNIMO",
  "gatewayReference": "WL-TXN-992211",
  "signature": "<hmac-sha256-hex>"
}
```

### Verify the Signature (Node.js)

```typescript
import crypto from 'crypto';

function verifyNotification(payload: any, apiKey: string): boolean {
  const canonical = [
    payload.eventId,
    payload.orderId,
    payload.sourceCode,
    payload.status,
    String(payload.amount.paise),
    payload.signedAt,
  ].join('|');

  // Note: Hub signs with HMAC-SHA256(canonical, keyHash) — where keyHash is
  // the server-side hash of your API key. Use the provided signingSecret
  // (your API key hash) for verification in production.
  // For the sandbox demo, the signing secret = HMAC-SHA256('AIMA_KEY_HASH_PEPPER_2026', apiKey)
  const signingSecret = crypto
    .createHmac('sha256', 'AIMA_KEY_HASH_PEPPER_2026')
    .update(apiKey)
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
```

### Idempotent Processing

```typescript
const processedEvents = new Set<string>(); // Use Redis in production

app.post('/api/v1/payment-notification', async (req, res) => {
  const payload = req.body;

  // 1. Verify signature
  if (!verifyNotification(payload, process.env.AIMA_API_KEY!)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 2. Idempotent: skip already-processed events
  if (processedEvents.has(payload.eventId)) {
    return res.json({ ok: true, idempotent: true });
  }

  // 3. Update your database
  if (payload.status === 'SUCCESS') {
    await markOrderAsPaid(payload.externalOrderId);
    await generateAdmitCard(payload.applicationReference);
  }

  processedEvents.add(payload.eventId);
  return res.json({ ok: true });
});
```

---

## 5. Query Payment Status (Server-to-Server)

Use this if your notification handler missed an event.

### Using Bearer Auth (simpler)

```typescript
const response = await fetch(
  `${process.env.PAYMENT_HUB_URL}/api/v1/payments/${orderId}`,
  {
    headers: {
      'Authorization': `Bearer ${process.env.AIMA_API_KEY}`,
      'X-AIMA-Source-Code': process.env.AIMA_SOURCE_CODE!,
    },
  }
);
const data = await response.json();
// data.status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED'
```

### Response

```json
{
  "orderId": "ORD-AIMA-MAT-7821",
  "externalOrderId": "MAT-ORDER-2026-001",
  "applicationReference": "MAT-2026-904128",
  "amount": { "paise": 350000, "inr": "3500.00", "currency": "INR" },
  "status": "SUCCESS",
  "gateway": "WORLDLINE_PAYNIMO",
  "gatewayReference": "WL-TXN-992211",
  "verificationState": "HASH_VALIDATION",
  "createdAt": "2026-10-15T19:13:00.000Z",
  "updatedAt": "2026-10-15T19:15:30.000Z"
}
```

---

## 6. HMAC Signing Utility (Node.js)

```typescript
import crypto from 'crypto';
import fetch from 'node-fetch';

interface PaymentSessionRequest {
  externalOrderId: string;
  applicationReference: string;
  paymentPurpose: string;
  amount: { value: number; currency: 'INR' };
  customerName: string;
  customerEmail: string;
  returnUrl: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}

async function createPaymentSession(params: PaymentSessionRequest) {
  const sourceCode = process.env.AIMA_SOURCE_CODE!;
  const apiKey = process.env.AIMA_API_KEY!;
  const hubUrl = process.env.PAYMENT_HUB_URL!;

  const path = '/api/v1/payment-sessions';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');
  const body = JSON.stringify(params);
  const bodyHash = crypto.createHash('sha256').update(body, 'utf8').digest('hex');

  const canonical = `POST\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const signature = crypto.createHmac('sha256', apiKey).update(canonical, 'utf8').digest('hex');

  const response = await fetch(`${hubUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AIMA-Source-Code': sourceCode,
      'X-AIMA-Timestamp': timestamp,
      'X-AIMA-Nonce': nonce,
      'X-AIMA-API-Key': apiKey,
      'X-AIMA-Signature': signature,
    },
    body,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  return response.json() as Promise<{
    sessionToken: string;
    checkoutUrl: string;
    orderId: string;
    expiresAt: string;
  }>;
}
```

---

## Application Onboarding Checklist

- [ ] Provide source application name, description, and source code to AIMA admin
- [ ] Provide registered return URL origin(s) (e.g. `https://mat.aima.in`)
- [ ] Provide S2S notification endpoint URL (must be public HTTPS)
- [ ] Specify required payment purposes (e.g. `EXAM_FEE`, `SEMESTER_FEE`)
- [ ] Specify amount rules per purpose (FIXED or VARIABLE with min/max)
- [ ] Receive API key from admin — store as `AIMA_API_KEY` in your env (never commit to git)
- [ ] Implement HMAC signing for payment session requests
- [ ] Implement notification endpoint with signature verification
- [ ] Implement idempotent event processing (use `eventId` as deduplication key)
- [ ] Test with `DEMO_SIMULATOR` gateway before going live
- [ ] Document retry handling for notification failures

---

## Security Notes

- **Never expose your API key** in browser code, logs, or version control
- **Always verify signatures** on incoming notifications — do not trust unsigned callbacks
- **Never trust the return URL redirect** alone as proof of payment
- **Use HTTPS** for all integration endpoints
- The Hub never sends card data, gateway secrets, or encryption keys in notifications

---

## Limitations

- This is a sandbox implementation — in-memory storage (data resets on server restart)
- For production: implement persistent database storage and replace in-memory stores
- No PCI DSS certification claim — formal assessment required before production use
- Applications without a server backend cannot securely use HMAC authentication; contact AIMA admin for alternative arrangements
