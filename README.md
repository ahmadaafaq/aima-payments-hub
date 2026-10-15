# AIMA Centralized Payment Hub — Gateway Integration & Technical Architecture

**All India Management Association (AIMA)**
*Centralized Payment Gateway Service & Integration Hub (Phase 2 Upgrade)*

---

## 1. Executive Summary

The **AIMA Centralized Payment Hub** is an institutional payment orchestration platform designed to unify fee collection across all AIMA business verticals—including **Management Aptitude Test (MAT)**, **Centre for Management Education (CME)**, **National Management Quiz & Case League**, **Undergraduate Aptitude Test (UGAT)**, **Local Management Associations (LMA)**, **AIMA-VCC**, **Advanced Management Training (AMT)**, and national conferences.

In **Phase 2**, the hub has been enhanced by senior payment engineers to support:
1. **Worldline / Paynimo (Genuine Sandbox)**: Full end-to-end sandbox payments with server-side SHA-256 tokenization, test bank authorization (`test`/`test`), and verified return callbacks.
2. **HDFC / CCAvenue (Integration Ready & Security Guardrails)**: Standard AES-128-CBC encryption/decryption engine, request/response parsers, and explicit auditing explaining why the live production credentials provided in email correspondence (`secure.ccavenue.com`) require dedicated test credentials before sandbox endpoints (`test.ccavenue.com`) can be engaged.
3. **Phase 1 Presentation Simulator (Preserved)**: Interactive 4-state simulator (Success, Failed, Pending, Cancelled) for non-technical executive presentations, clearly segregated with zero risk of overwriting genuine financial transactions.

---

## 2. Gateway Protocol & Security Audit Findings

### 2.1 Worldline / Paynimo
- **Merchant Code**: `T945221`
- **Scheme Code**: `FIRST`
- **Test Amount Constraint**: **₹1.00 – ₹10.00 INR** (enforced by Worldline Sandbox). The hub dynamically scales nominal course fees (e.g. ₹3,500 MAT fee) to **₹2.00 INR** when interacting with the sandbox test switch while maintaining the full nominal amount on the originating AIMA application ledger.
- **Protocol Analysis**:
  - The supplied email mentions a legacy single-URL integration.
  - The modern standard documented by Worldline Paynimo is `pnCheckout` with server-calculated SHA-256 hash.
  - Hash formula:
    ```
    merchantId|txnId|totalamount|accountNo|consumerId|mobile|email|debitStartDate|debitEndDate|maxAmount|amountType|frequency|cardNumber|expMonth|expYear|cvvCode|SALT
    ```
  - Return Status Codes Verified:
    - `0300`: Transaction Successful
    - `0399`: Transaction Declined by Bank
    - `0396`: Transaction Awaited (Pending bank reconciliation)
    - `0392`: Aborted / Cancelled by User
- **Test Bank Credentials**:
  - NetBanking Login: `test`
  - NetBanking Password: `test`

### 2.2 HDFC / CCAvenue (Configured via Official Live Kit Spreadsheet)
- **Account Credentials from Attachment**:
  - Merchant ID (Ccavenue MID): `4168947`
  - Terminal ID (TID): `76098022`
  - Access Code: `AVXO66MD08BH79OXHB`
  - Working Key: `4BF2B1F093D075D5BE502B3190029C2D`
  - Post Action URL: `https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction`
  - Status API (DoWebTrans): `https://api.ccavenue.com/apis/servlet/DoWebTrans`
  - Bank MID: `12380772`
  - Legal & DBA Name: `ALL INDIA MANAGEMENT ASSOCIATION`
  - ME Code: `GPY451` | MCC: `8220 (PROFESSIONAL EDUCATION)`
- **Integration Flow**:
  - Encrypts outgoing payment parameters with AES-128-CBC using the MD5 digest of the 128-bit working key (`4BF2B1F093D075D5BE502B3190029C2D`) and standard 16-byte initialization vector.
  - Generates form post payload with `encRequest`, `access_code`, and `merchant_id`.
  - Implements HDFC test instructions: *"Kindly perform a test transaction using live credentials for Card as well as Net Banking payment option"*.
  - Decrypts incoming `encResp` ciphertext, updates transaction status to `SUCCESS`, `FAILED`, `PENDING`, or `CANCELLED`, and delivers signed webhook notifications to the candidate's originating vertical portal.

---

## 3. Environment Variables Configuration

Refer to `.env.example` for the complete specification:

```bash
# Server & App URL
PORT=3000
APP_URL="http://localhost:3000"

# Worldline Paynimo Sandbox
WORLDLINE_ENVIRONMENT="sandbox" # Server blocks 'production' in test mode
WORLDLINE_MERCHANT_CODE="T945221"
WORLDLINE_SCHEME_CODE="FIRST"
WORLDLINE_SALT="AIMA_SANDBOX_FIRST_T945221"

# CCAvenue Sandbox (Acquire from test.ccavenue.com)
CCAVENUE_ENVIRONMENT="sandbox"
CCAVENUE_MERCHANT_ID="YOUR_CCAVENUE_TEST_MERCHANT_ID"
CCAVENUE_ACCESS_CODE="YOUR_CCAVENUE_TEST_ACCESS_CODE"
CCAVENUE_WORKING_KEY="YOUR_CCAVENUE_TEST_WORKING_KEY"
```

---

## 4. Key Server API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/gateways/status` | GET | Returns real-time configuration status, environment, and blocker details for all gateways. |
| `/api/payments/create-order` | POST | Validates fee breakdown, generates order IDs (`ORD-AIMA-MAT-XXXX`), and initiates server transaction. |
| `/api/payments/worldline/initiate` | POST | Computes SHA-256 token and produces `consumerData` payload for Paynimo checkout. |
| `/api/payments/worldline/callback` | POST | Idempotent callback endpoint verifying bank status code (`0300`) and triggering originating ERP webhook. |
| `/api/payments/ccavenue/initiate` | POST | Generates encrypted ciphertext using CCAvenue AES-128-CBC protocol. |
| `/api/payments/ccavenue/callback` | POST | Decrypts response ciphertext, updates verified transaction, and notifies originating app. |
| `/api/transactions` | GET | Retrieves persistent transaction ledger. |
| `/api/transactions/record-simulator` | POST | Records Phase 1 simulator outcomes (strictly guarded against overwriting genuine sandbox transactions). |
| `/api/transactions/reset` | POST | Resets demo transactions back to default baseline. |

---

## 5. Running Automated Verification Tests

The repository includes an automated test suite verifying gateway adapters, SHA-256 token generation, AES-128-CBC cryptography, idempotency guards, and status code verifications:

```bash
# Run unit and gateway regression tests
npm test

# Run TypeScript linter
npm run lint

# Compile production bundle
npm run build
```

---

## 6. Stakeholder Demonstration Walkthrough

1. Open the application in your browser.
2. Under the **Applications** tab, select **Management Aptitude Test (MAT)**.
3. Review the candidate dossier (Rohan Sharma, `MAT-2026-9041`, ₹3,500 INR).
4. Select **Worldline / Paynimo (Sandbox)**. Note the indicator explaining the ₹2.00 sandbox test charge.
5. Click **Initiate Worldline Sandbox**.
6. In the sandbox switch modal, verify the preloaded test bank login (`test`/`test`) and click **Authorize Sandbox Payment**.
7. The payment is cryptographically verified by the server (`0300`), producing an official verified sandbox receipt.
8. Click **Return to Application** to view the candidate portal on `mat.aima.in`, where the record is marked as **Paid & Confirmed**, unlocking the Admit Card download!
