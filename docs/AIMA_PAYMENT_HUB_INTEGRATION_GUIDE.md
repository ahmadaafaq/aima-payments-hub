# AIMA Centralized Payment Hub — Application Integration Specification

> **Version:** 2.0 (Post-HDFC / CyRAACS Security Audit Compliant)  
> **Target Audience:** Engineering Leads, Product Managers & Application Developers across AIMA departments (MAT, CME, Case League, UGAT, LMA, VCC, AMT, Events).  
> **Live Active Hub URL:** `https://aima-payments-hub.vercel.app` *(Audited by HDFC Bank / CyRAACS)*  
> **Alternate Proxy Domain:** `https://research.aima.in/pay`  
> **Institutional Custom Domain (Planned):** `https://payments.aima.in` *(pending AIMA IT DNS mapping)*  
> **Security Baseline:** RBI Advisory 1.4, OWASP Top 10, HMAC-SHA256 Cryptographic Request Tampering Defense, Dual Inquiry Status Verification.

---

## 1. Overview & Architecture

The **AIMA Centralized Payment Hub** is an institutional payment gateway middleware that abstracts payment gateways (HDFC Bank Collect Now / Razorpay, Worldline Paynimo, and CCAvenue).

**Source applications (MAT, Case League, CME, etc.) do NOT need individual payment gateway accounts, SDKs, or direct bank integrations.**

```
+--------------------+               +-----------------------------+               +----------------------+
| Source Application |               |      AIMA Payment Hub       |               | HDFC / Razorpay / WL |
+--------------------+               +-----------------------------+               +----------------------+
          |                                         |                                         |
          | --- 1. Initiate Payment Session ------> |                                         |
          |     (GET /pay or POST /payment-sessions)|                                         |
          |                                         |                                         |
          | <--- 2. Redirect to Central Checkout -- |                                         |
          |                                         |                                         |
          | [User Enters Card / NetBanking / UPI]   | --- 3. Process with Bank Gateway -----> |
          |                                         | <--- 4. S2S Signature Callback -------- |
          |                                         | --- 5. Dual Inquiry Verification -----> |
          |                                         |                                         |
          | <--- 6. Browser Redirect to return_url -|                                         |
          |     (?status=SUCCESS&orderId=...&ref=..)|                                         |
          |                                         |                                         |
          | --- 7. (Optional) S2S Verify Status --> |                                         |
          |     (GET /api/v1/payments/:orderId)     |                                         |
```

---

## 2. Onboarding Checklist for Source Application Teams

Before initiating payments, your application must be registered in the **AIMA Central Application Registry**. Contact the AIMA Payment Hub Administrator (`sjames@aima.in` or IT Secretariat) with:

1. **Source Code**: Unique alphanumeric identifier (e.g., `MAT`, `CME`, `CASE_LEAGUE`, `UGAT`, `LMA`, `AIMA_VCC`, `AMT`, `AIMA_EVENTS`).
2. **Department Name**: e.g., Centre for Management Education (CME), Testing Services (MAT), etc.
3. **Allowed Return URLs (Allowlist)**: Exact production and staging URLs where users can be redirected after payment (e.g., `https://mat.aima.in/payment/return`, `https://research.aima.in/registration`). *Wildcards or unregistered domains will be rejected by security policy.*
4. **Allowed Payment Purposes & Pricing Rules**: Fee types and amounts (e.g., `REGISTRATION_FEE`, `EXAM_FEE`, standard pricing per unit/candidate).
5. **Assigned Payment Gateway**: `CCAVENUE` (HDFC Bank Collect Now / Razorpay) or `WORLDLINE_PAYNIMO`.

You will receive from the Hub Administrator:
- **`AIMA_SOURCE_CODE`**: Your application identifier.
- **`AIMA_API_KEY` / `SHARED_SECRET`**: 256-bit cryptographic secret for HMAC signatures.

---

## 3. Integration Method 1: Lightweight Browser Redirect (`/pay`)

**Best For:** Web applications, registration forms, and client-side portals that want instant integration without building server-side session APIs.

### Request Endpoint
```http
GET https://aima-payments-hub.vercel.app/pay
```
*(Alternative Proxy: `https://research.aima.in/pay` | Planned Custom Domain: `https://payments.aima.in/pay`)*

### Query Parameters

| Parameter | Type | Required | Description | Example |
| :--- | :--- | :--- | :--- | :--- |
| `source` | string | **Yes** | Your registered application source code | `CASE_LEAGUE` |
| `reference` | string | **Yes** | Unique candidate reference / application number | `AIMA-CL26-31797` |
| `amount` | string/number | **Yes** | Exact payable amount in INR (e.g. `200.00`) | `200` |
| `currency` | string | **Yes** | Currency code (strictly `INR`) | `INR` |
| `return_url` | string | **Yes** | Pre-registered URL where applicant returns | `https://research.aima.in/registration` |
| `name` | string | **Yes** | Applicant full name | `Aarav Sharma` |
| `email` | string | **Yes** | Applicant email address | `aarav@example.com` |
| `phone` | string | Optional | Applicant mobile number (10 digits) | `9811223344` |
| `purpose` | string | Optional | Pre-registered fee purpose (default: `REGISTRATION_FEE`) | `REGISTRATION_FEE` |
| `timestamp` | string | **Yes** | Current Unix epoch in seconds | `1761633600` |
| `signature` | string | **Yes** | HMAC-SHA256 signature for tampering defense | `a3f8c...` |

### HMAC Signature Construction (Required)
To prevent request amount tampering (flagged during security audits), construct a canonical string and sign it using your `SHARED_SECRET`:

```
canonical = "${source}:${reference}:${amount}:${currency}:${timestamp}"
signature = HMAC_SHA256(canonical, SHARED_SECRET)
```

#### JavaScript / TypeScript Example
```typescript
async function getPaymentRedirectUrl(params: {
  source: string;
  reference: string;
  amount: number;
  returnUrl: string;
  name: string;
  email: string;
  phone?: string;
  secret: string;
}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const canonical = `${params.source}:${params.reference}:${params.amount}:INR:${timestamp}`;

  // Compute HMAC-SHA256 using Web Crypto API or Node crypto
  const enc = new TextEncoder();
  const key = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(params.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuf = await window.crypto.subtle.sign('HMAC', key, enc.encode(canonical));
  const signature = Array.from(new Uint8Array(signatureBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const query = new URLSearchParams({
    source: params.source,
    reference: params.reference,
    amount: String(params.amount),
    currency: 'INR',
    return_url: params.returnUrl,
    name: params.name,
    email: params.email,
    phone: params.phone || '',
    timestamp: String(timestamp),
    signature: signature,
  });

  // Active Live URL: https://aima-payments-hub.vercel.app/pay (or https://research.aima.in/pay)
  return `https://aima-payments-hub.vercel.app/pay?${query.toString()}`;
}
```

---

## 4. Integration Method 2: Server-to-Server Session API (Backend Recommended)

**Best For:** Enterprise backends that pre-create an order session before loading the payment UI.

### Step 1: Create Payment Session
```http
POST https://aima-payments-hub.vercel.app/api/v1/payment-sessions
Content-Type: application/json
X-AIMA-Source-Code: MAT
X-AIMA-Timestamp: 1761633600
X-AIMA-Nonce: r7x9qL3kM2p8vN1w
X-AIMA-Signature: 6e4a2...
```

#### HMAC Header Calculation
```
canonical_request = "POST\n/api/v1/payment-sessions\n${X-AIMA-Timestamp}\n${X-AIMA-Nonce}\n${SHA256(request_body)}"
X-AIMA-Signature  = HMAC_SHA256(canonical_request, AIMA_API_KEY)
```

#### JSON Request Payload
```json
{
  "externalOrderId": "MAT-ORD-2026-90412",
  "applicationReference": "MAT-2026-REG-88123",
  "paymentPurpose": "EXAM_FEE",
  "amount": {
    "value": 2100.00,
    "currency": "INR"
  },
  "customerName": "Rohan Deshmukh",
  "customerEmail": "rohan.deshmukh@gmail.com",
  "customerPhone": "9820123456",
  "returnUrl": "https://mat.aima.in/payment/return",
  "idempotencyKey": "MAT-IDEM-2026-0091823",
  "metadata": {
    "examMode": "CBT",
    "testCity": "Delhi-NCR",
    "intakeSession": "DECEMBER_2026"
  }
}
```

#### JSON Response (`201 Created`)
```json
{
  "success": true,
  "sessionToken": "sess_tok_9f81a7b3e21049c8",
  "checkoutUrl": "https://aima-payments-hub.vercel.app/checkout/sess_tok_9f81a7b3e21049c8",
  "orderId": "ORD-AIMA-MAT-7431",
  "externalOrderId": "MAT-ORD-2026-90412",
  "amountPaise": 210000,
  "amountInr": "2100.00",
  "currency": "INR",
  "resolvedGateway": "CCAVENUE",
  "routingMode": "AUTO_ASSIGNED",
  "department": "MAT",
  "expiresAt": "2026-10-28T11:25:00.000Z"
}
```

### Step 2: Redirect User to `checkoutUrl`
Your frontend simply sets:
```javascript
window.location.href = response.checkoutUrl;
```

---

## 5. The Return Redirect (What the Source Application Receives)

Once the applicant completes payment (or cancels/fails) at the payment gateway, the Hub automatically redirects their browser back to your pre-registered `return_url`.

### Query String Parameters Appended to `return_url`:

```http
GET https://your-app.aima.in/payment/return?orderId=ORD-AIMA-MAT-7431&transactionId=TXN-20261028-51293&reference=MAT-2026-REG-88123&status=SUCCESS&paymentId=pay_Trh5kBUui8vvYg&amount=2100.00
```

| Parameter | Type | Values | Description |
| :--- | :--- | :--- | :--- |
| `status` | string | `SUCCESS` \| `FAILED` \| `USER_DROPPED` | Final transaction outcome |
| `orderId` | string | e.g. `ORD-AIMA-MAT-7431` | AIMA Central Order Identifier |
| `transactionId` | string | e.g. `TXN-20261028-51293` | Hub Transaction Audit Identifier |
| `reference` | string | e.g. `MAT-2026-REG-88123` | Your original candidate reference |
| `paymentId` | string | e.g. `pay_Trh5kBUui8vvYg` | Bank / Razorpay Gateway Payment ID |
| `amount` | string | e.g. `2100.00` | Authoritative amount captured in INR |
| `reason` | string | optional | Failure description (if `status !== 'SUCCESS'`) |

### Example Source Application Listener (React / TypeScript)
```typescript
import { useEffect } from 'react';

export function PaymentCallbackHandler() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const orderId = params.get('orderId');
    const reference = params.get('reference');
    const amount = params.get('amount');
    const paymentId = params.get('paymentId');

    if (status === 'SUCCESS') {
      // 1. Mark registration as PAID in your database
      console.log(`Payment confirmed for ${reference}: Order ${orderId}, Ref: ${paymentId}`);
      // 2. Clean URL query string
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      // Payment Failed or Cancelled
      const reason = params.get('reason') || 'Payment declined by bank';
      alert(`Payment was not completed: ${reason}`);
    }
  }, []);

  return <div>Verifying payment status...</div>;
}
```

---

## 6. Verification API: Query Payment Status (`GET /payments/:orderId`)

Your backend can programmatically check the definitive status of any transaction at any time.

### Endpoint
```http
GET https://aima-payments-hub.vercel.app/api/v1/payments/:orderId
X-AIMA-Source-Code: MAT
X-AIMA-Timestamp: 1761633600
X-AIMA-Nonce: n4m8k2p1q9
X-AIMA-Signature: 7c8b1...
```

### Response
```json
{
  "orderId": "ORD-AIMA-MAT-7431",
  "transactionId": "TXN-20261028-51293",
  "externalOrderId": "MAT-ORD-2026-90412",
  "applicationReference": "MAT-2026-REG-88123",
  "paymentPurpose": "EXAM_FEE",
  "status": "SUCCESS",
  "amount": {
    "value": 2100.00,
    "currency": "INR"
  },
  "customer": {
    "name": "Rohan Deshmukh",
    "email": "rohan.deshmukh@gmail.com",
    "phone": "9820123456"
  },
  "gateway": {
    "name": "CCAVENUE",
    "paymentId": "pay_Trh5kBUui8vvYg"
  },
  "timestamps": {
    "createdAt": "2026-10-28T11:00:15.000Z",
    "completedAt": "2026-10-28T11:02:30.000Z"
  }
}
```

---

## 7. Security Best Practices & Audit Standards

1. **Never Trust Client-Side Amounts**: The Payment Hub enforces server-side authoritative fee rules. Submitting tampered amounts will trigger an automatic `403 AMOUNT_TAMPERING_DETECTED` security block.
2. **Always Use HTTPS**: HTTP requests are blocked automatically.
3. **Keep `SHARED_SECRET` Secret**: Store your key in environment variables. Do NOT commit keys to git repositories.
4. **Idempotency**: Always pass your unique registration reference. If a candidate attempts to pay for an already completed registration, the Hub prevents duplicate debiting and redirects with `already_paid=true`.

---

## 8. Summary Table for Department Developers

| Task | What the Source Team Does | What the Payment Hub Does |
| :--- | :--- | :--- |
| **Initial Setup** | Request `AIMA_SOURCE_CODE` & register `return_url` | Issues API credentials & maps to bank gateway |
| **Payment Start** | Redirects user to `/pay` (or calls `/payment-sessions`) | Validates signature, creates order & presents HDFC/Razorpay UI |
| **Payment Execution**| None (user pays on secured Hub) | Captures funds, verifies cryptographic webhook & logs ledger |
| **Payment Return** | Reads `status=SUCCESS`, `orderId`, `reference` on `return_url` | Redirects user back cleanly to your portal with auth tokens |
| **Audit / Reconciliation** | Calls `GET /api/v1/payments/:orderId` if needed | Returns real-time status and bank transaction reference |
