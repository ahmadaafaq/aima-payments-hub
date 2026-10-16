# AIMA Centralized Payment Hub

**All India Management Association (AIMA)**  
*Centralized Institutional Payment Gateway Service & Integration Hub*

---

## 1. Executive Summary & Purpose

The **AIMA Centralized Payment Hub** is an institutional payment orchestration platform designed to unify fee collection across all AIMA business verticals and child applications—including:

- **AIMA Case League & Olympiad** (`AMIACRC` / `CASE_LEAGUE`)
- **Centre for Management Education** (`CME Admission`, `CME AMD DNC`)
- **Management Aptitude Test** (`MAT B School`, `MAT`)
- **Undergraduate Aptitude Test** (`UGAT`)
- **Advanced Management Training** (`AMT`)
- **Local Management Associations** (`LMA`)
- **Virtual Leadership Center / Corporate Council** (`VLC` / `VCC`)
- **AIMA Events & National Conferences** (`EVENTS`)

### The Problem It Solves
Previously, individual AIMA applications had to maintain their own payment gateway SDKs, merchant accounts, encryption keys, and callback handlers. 

With the Centralized Payment Hub:
1. **Single Point of Integration**: Child applications only need to redirect users to a common payment URL or make a single server-to-server API call.
2. **Zero Gateway Code in Child Applications**: Child applications (like `aima-quiz`) never touch CCAvenue AES keys, Worldline salts, or banking encryption logic.
3. **Institutional Gateway Policy Enforcement**: Automatic gateway routing ensures fees are deposited into the correct departmental merchant account (e.g. CME to HDFC/CCAvenue, LMA to Worldline/Paynimo).
4. **Unified Ledger & Audit Trail**: Real-time visibility into all transactions across all verticals in one central dashboard.

---

## 2. Architecture & Codebase Structure

The project is built as a unified TypeScript application: an **Express API backend** serving both REST endpoints and the **Vite React frontend** in one cohesive service.

```
aima-payments-hub/
├── server.ts                       # Server entrypoint (Express + Vite middleware mode)
├── package.json                    # Scripts: dev (tsx watch), test:all, lint, build
├── .env.example                    # Environment variable specification & test keys
│
├── server/                         # Backend Services & Gateway Adapters
│   ├── gateways/                   # Payment Gateway Adapters
│   │   ├── ccavenue.ts             # HDFC / CCAvenue AES-128-CBC encryption/decryption
│   │   ├── worldlinePaynimo.ts     # Worldline Paynimo SHA-256 token calculation & verification
│   │   └── gatewayTypes.ts         # Gateway interface types & transaction schemas
│   ├── middleware/                 # Security & Authentication Middlewares
│   │   └── auth.ts                 # Source App HMAC-SHA256 & Admin token validation
│   ├── models/                     # In-Memory & Persistent Domain Models
│   │   ├── sourceApplications.ts   # Application Registry, Gateway Routing Matrix, Return Allowlist
│   │   └── paymentSessionStore.ts  # Checkout session tokens (TTL 30m) & idempotency
│   ├── routes/                     # API Route Handlers
│   │   ├── paymentRoutes.ts        # Phase 1/2 routes (/api/gateways, /api/payments)
│   │   └── v1Routes.ts             # Phase 3 versioned API & Common /pay handler
│   └── services/                   # Background Services & Security Guards
│       ├── notificationService.ts  # Webhook delivery with exponential backoff & dead-letter queue
│       ├── ssrfGuard.ts            # SSRF protection blocking loopback & private subnets
│       └── transactionStore.ts     # In-memory + disk transaction ledger & audit trail
│
├── src/                            # Frontend (React 19 + Vite + TailwindCSS)
│   ├── App.tsx                     # Main app container, tab routing, session token handler
│   ├── components/                 # UI Components
│   │   ├── CentralizedPaymentPage. # Departmental gateway matrix view & checkout launcher
│   │   ├── AppRegistry.tsx         # Admin UI: Dynamic gateway reassignment & app onboarding
│   │   ├── PaymentResult.tsx       # Receipt, verified banking badges, auto-return countdown
│   │   ├── CCAvenueModal.tsx       # Embedded CCAvenue sandbox checkout modal
│   │   ├── WorldlineModal.tsx      # Embedded Worldline Paynimo sandbox modal
│   │   ├── PresentationSimulator.  # 4-state presentation simulator for executives
│   │   └── Header.tsx              # Navigation bar & gateway health indicators
│   ├── data/                       # Pre-seeded application presets & sample candidates
│   │   └── aimaApplications.ts     # MAT, CME, AMIACRC, LMA, etc. configurations
│   ├── services/                   # Frontend API clients & storage helpers
│   │   ├── gatewayApi.ts           # Endpoints for gateway initiation & verification
│   │   └── paymentStorage.ts       # LocalStorage caching for demo state
│   └── types/                      # Frontend TypeScript interfaces
│       └── payment.ts              # AimaApplication, TransactionRecord, PaymentGateway
│
├── tests/                          # Automated Test Suites (90 automated tests)
│   ├── paymentGateways.test.ts     # Adapter tests for Worldline & CCAvenue
│   ├── phase3Security.test.ts      # HMAC verification, session store, SSRF guard, dead-letter
│   └── automaticGatewayRouting.test.ts # Matrix routing, gateway mismatches, return URL allowlist
│
└── docs/                           # Architectural Documentation & Integration Specs
    └── integration/                # Integration guides, OpenAPI specs & sequence diagrams
```

---

## 3. Supported Payment Gateways

### 3.1 HDFC / CCAvenue (Integration Architecture)
- **Configuration (via `.env`)**:
  - `CCAVENUE_MERCHANT_ID`: Merchant ID assigned by CCAvenue
  - `CCAVENUE_TID`: Terminal ID
  - `CCAVENUE_ACCESS_CODE`: Gateway Access Code
  - `CCAVENUE_WORKING_KEY`: 128-bit Working Key for AES encryption
  - `CCAVENUE_POST_URL`: Checkout initiation endpoint (`https://secure.ccavenue.com/...` or test gateway)
  - `CCAVENUE_DOWEBTRANS_URL`: DoWebTrans status verification servlet
- **Protocol**:
  - Outgoing parameters are encrypted using **AES-128-CBC** with the MD5 digest of the 128-bit working key.
  - Returns decrypted order status (`Success`, `Failure`, `Aborted`) and bank reference code.
- **Guardrail**: If working keys are missing from `.env`, the adapter reports `CONFIG_REQUIRED` and strictly rejects checkout rather than silently pretending a transaction occurred.

### 3.2 Worldline / Paynimo (Sandbox Ready)
- **Configuration (via `.env`)**:
  - `WORLDLINE_MERCHANT_CODE`: Merchant Code
  - `WORLDLINE_SCHEME_CODE`: Scheme Code (e.g. `FIRST`)
  - `WORLDLINE_SALT`: Secret salt for token generation
- **Protocol**:
  - Server-calculated **SHA-256 HMAC token** generated using formula:
    `merchantId|txnId|totalamount|accountNo|consumerId|mobile|email|debitStartDate|debitEndDate|maxAmount|amountType|frequency|cardNumber|expMonth|expYear|cvvCode|SALT`
  - Returns bank response codes:
    - `0300`: Transaction Successful
    - `0399`: Transaction Declined by Bank
    - `0396`: Transaction Awaited (Pending bank reconciliation)
    - `0392`: Aborted / Cancelled by User
- **Test Bank Credentials (in Sandbox)**:
  - NetBanking Login: `test`
  - NetBanking Password: `test`

### 3.3 Demo Presentation Simulator (Preserved)
- Dedicated interactive 4-state simulator (`SUCCESS`, `FAILED`, `PENDING`, `CANCELLED`) for executive reviews and offline demos.
- Clearly segregated in the audit ledger (`isSimulated: true`); strictly prohibited from overriding genuine financial gateway records.

---

## 4. Automatic Gateway Selection Matrix

The Centralized Payment Hub automatically resolves the target payment gateway according to the institutional matrix:

| Project Code | Department | Assigned Gateway | Routing Mode | Default Rule |
|---|---|---|---|---|
| `AMIACRC` | CME | **HDFC / CCAvenue** (`CCAVENUE`) | `AUTO` | Pre-configured in registry |
| `CME Admission – PGDM PGCM` | CME | **HDFC / CCAvenue** (`CCAVENUE`) | `AUTO` | Pre-configured in registry |
| `CME AMD DNC` | CME | **HDFC / CCAvenue** (`CCAVENUE`) | `AUTO` | Pre-configured in registry |
| `AMT` | CMS | **HDFC / CCAvenue** (`CCAVENUE`) | `AUTO` | Pre-configured in registry |
| `MAT B School` | CMS | **HDFC / CCAvenue** (`CCAVENUE`) | `AUTO` | Pre-configured in registry |
| `UGAT` | CMS | **HDFC / CCAvenue** (`CCAVENUE`) | `AUTO` | Pre-configured in registry |
| `LMA` | LMA | **Worldline / Paynimo** (`WORLDLINE_PAYNIMO`) | `AUTO` | Pre-configured in registry |
| `VLC` | VLC | **Worldline / Paynimo** (`WORLDLINE_PAYNIMO`) | `AUTO` | Pre-configured in registry |
| *All other applications* | *Any* | **HDFC / CCAvenue** (`CCAVENUE`) | `AUTO` | Default institutional policy fallback |

### Dynamic Admin Reconfiguration (Zero Code Changes)
Administrators can change any application's gateway assignment or add new applications without modifying code:
- **Via UI**: Open the **App Registry** tab, select an app card, choose the target gateway, and click **Save Assignment Policy**.
- **Via Admin REST API**:
  ```http
  PUT /api/v1/admin/applications/AMIACRC/gateway HTTP/1.1
  X-Admin-Key: aima-admin-dev-token-2026
  Content-Type: application/json

  {
    "assignedGateway": "WORLDLINE_PAYNIMO",
    "routingMode": "AUTO"
  }
  ```

---

## 5. How Source Applications Integrate

### Method 1: Unified Common Redirection (`/pay`)
The simplest and most common integration. The source application redirects the user to:

```
https://payments.aima.in/pay?source=AMIACRC&reference=REG123&amount=200&currency=INR&return_url=https%3A%2F%2Fexample.com%2Fregistration&name=John+Doe&email=john%40example.com&phone=9876543210&purpose=REGISTRATION_FEE
```

#### Query Parameters:
| Parameter | Type | Required | Description |
|---|---|---|---|
| `source` | string | **Yes** | Project code (e.g. `AMIACRC`, `LMA`, `MAT B School`). Alias-aware. |
| `reference` | string | **Yes** | Unique reference ID in the source app (e.g. `AIMA-CL26-62855`). |
| `amount` | number | **Yes** | Nominal amount in INR. Validated against registered amount rules. |
| `return_url` | string | **Yes** | URL to return user to. **Must be in the registered allowlist**. |
| `currency` | string | No | Defaults to `INR`. Only `INR` is supported. |
| `gateway` | string | No | Optional. If provided, strictly validated against assigned gateway. |
| `name`, `email`, `phone` | string | No | Pre-fills candidate details on checkout. |
| `purpose` | string | No | Payment purpose (e.g. `REGISTRATION_FEE`). |

---

### Method 2: Headless Server-to-Server API (`POST /api/v1/payment-sessions`)
For apps that want to create the session from their backend before redirecting:

```http
POST /api/v1/payment-sessions HTTP/1.1
Host: payments.aima.in
X-AIMA-Source: AMIACRC
X-AIMA-Timestamp: 2026-10-15T12:00:00.000Z
X-AIMA-Signature: <HMAC-SHA256 signature of request body>
Content-Type: application/json

{
  "applicationReference": "REG123",
  "paymentPurpose": "REGISTRATION_FEE",
  "amount": { "value": 200, "currency": "INR" },
  "returnUrl": "https://example.com/registration",
  "customer": {
    "name": "Candidate Name",
    "email": "applicant@example.com",
    "phone": "+919876543210"
  }
}
```

Response:
```json
{
  "sessionToken": "4476299e612682de5b...",
  "redirectUrl": "https://payments.aima.in/checkout/4476299e612682de5b...",
  "resolvedGateway": "CCAVENUE",
  "routingMode": "AUTO",
  "expiresAt": "2026-10-15T14:45:28.376Z"
}
```

---

## 6. Return Flow & Authoritative Status Verification

### 6.1 Automatic Return Flow
When payment completes on the gateway:
1. The Payment Hub records and verifies the transaction.
2. A **2-second auto-return countdown** appears:
   > *"Payment Verified — Automatically Returning to Application in 2s..."*
3. The applicant can click **"Return Now"** to return immediately, or **"Stay on Receipt"** to print an official receipt.
4. The browser automatically navigates back to `return_url` with parameters:
   ```
   https://example.com/registration?orderId=ORD-AIMA-AMIACRC-7469&reference=REG123&status=SUCCESS&amount=200&currency=INR&gateway=CCAVENUE&authCode=AUTH_847291
   ```

### 6.2 Authoritative Status Verification Endpoint
To prevent client-side tampering, source application backends **must** verify the status before granting access or issuing licenses:

```http
GET /api/v1/payments/ORD-AIMA-AMIACRC-7469 HTTP/1.1
Host: payments.aima.in
X-AIMA-Source: AMIACRC
X-AIMA-Timestamp: 2026-10-15T12:05:00.000Z
X-AIMA-Signature: <HMAC-SHA256 signature of canonical request>
```

Tenant isolation guarantees that applications can only query orders belonging to their own `sourceCode`.

### 6.3 Server-to-Server Webhook Notifications
The Payment Hub automatically dispatches signed webhooks to the source application's registered `notificationUrl`:
- Signed with `X-AIMA-Signature: sha256=<HMAC>`.
- Automatic retry with exponential backoff (up to 5 attempts).
- Dead-letter queue with manual retry controls in the Admin UI.

---

## 7. Real-World Reference Integration: AIMA Case League (`aima-quiz`)

The companion project `aima-quiz` (Case League) is integrated with this hub:
- **`src/config/paymentConfig.ts`**: Resolves Hub URL (`http://localhost:3000` in dev, `https://payments.aima.in` in staging).
- **`src/components/registration/RegistrationPage.tsx`**: Triggers `initiatePaymentRedirect(...)`.
- **`src/components/payment/PaymentReturnListener.tsx`**: Catches `status=SUCCESS`, triggers celebration confetti, updates Supabase to `PAID`, and unlocks team login credentials.

---

## 8. Local Setup & Developer Quickstart

### Prerequisites
- Node.js `>= 18.0.0` (Tested on Node v20 / v22)
- npm `>= 9.0.0`

### Step 1: Clone & Install Dependencies
```bash
git clone https://github.com/ahmadaafaq/aima-payments-hub.git
cd aima-payments-hub
npm install
```

### Step 2: Configure Environment Variables
Create `.env` from `.env.example`:
```bash
cp .env.example .env
```
Ensure `.env` is populated with your test sandbox keys:
```env
PORT="3000"
APP_URL="http://localhost:3000"

WORLDLINE_ENVIRONMENT="sandbox"
WORLDLINE_MERCHANT_CODE="YOUR_WORLDLINE_MERCHANT_CODE"
WORLDLINE_SCHEME_CODE="FIRST"
WORLDLINE_SALT="YOUR_WORLDLINE_SALT"

CCAVENUE_ENVIRONMENT="sandbox"
CCAVENUE_MERCHANT_ID="YOUR_CCAVENUE_MERCHANT_ID"
CCAVENUE_ACCESS_CODE="YOUR_CCAVENUE_ACCESS_CODE"
CCAVENUE_WORKING_KEY="YOUR_CCAVENUE_WORKING_KEY"
CCAVENUE_TID="YOUR_CCAVENUE_TID"

ADMIN_TOKEN="aima-admin-dev-token-2026"
```

### Step 3: Run Development Server
```bash
npm run dev
```
The server will boot with `tsx watch server.ts` at **`http://localhost:3000`** (auto-reloading on any code changes).

### Step 4: Run Automated Tests
```bash
# Run all 90 automated tests (Gateway Adapters, Phase 3 Security, Gateway Matrix)
npm run test:all

# Run TypeScript lint check
npm run lint

# Build production bundle
npm run build
```

---

## 9. Security & Guardrails

1. **Return URL Allowlist**: Every source application has a strictly enforced list of allowed origin URLs (`allowedReturnUrls`). Wildcards or arbitrary redirection are blocked to prevent open redirect vulnerabilities. Local loopbacks (`localhost`, `127.0.0.1`, `0.0.0.0`) are permitted during development.
2. **SSRF Guard**: Webhook notification dispatchers block loopback IPs, internal private networks (RFC 1918 `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and AWS/cloud metadata services (`169.254.169.254`).
3. **API Key Security**: Raw API keys are **never stored** in the database. Only one-way salted hashes (`hashApiKey(...)` using HMAC-SHA256 with pepper) are persisted.
4. **Idempotency Guard**: Checkout and callback operations use idempotency keys (`idempotencyKey`) to guarantee that retries or double network requests never duplicate bank charges.

---

## 10. Troubleshooting & Common Developer Gotchas

### Issue 1: `⚠️ Unregistered Return URL`
- **Cause**: The `return_url` passed to `/pay` is not in the source application's `allowedReturnUrls`.
- **Fix**: Open `server/models/sourceApplications.ts` and add the application's origin (e.g. `http://localhost:3002`, `http://0.0.0.0:3002`, `https://your-preview.vercel.app`) to the application's `allowedReturnUrls` array.

### Issue 2: `⚠️ Gateway Configuration Error`
- **Cause**: A gateway was selected that lacks credentials in `.env` (e.g. missing `CCAVENUE_WORKING_KEY`).
- **Fix**: Ensure your local `.env` has all required keys copied from `.env.example`.

### Issue 3: Port Collision on Port 3000
- **Cause**: Another Node process is running on port 3000.
- **Fix**: Run `lsof -i :3000` to find the process ID and run `kill <PID>`.

---

## 11. Support & Contributions

Maintained by the **AIMA IT & Digital Infrastructure Team**.  
For technical questions or onboarding assistance, refer to the documentation in `docs/integration/` or contact the technical architect.
