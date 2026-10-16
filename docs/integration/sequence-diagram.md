# AIMA Payment Hub — Phase 3 Integration Sequence Diagrams

This document contains visual architectural sequences for source applications integrating with the AIMA Centralized Payment Hub.

---

## 1. End-to-End Payment Session Flow

```mermaid
sequenceDiagram
    autonumber
    actor Student as Student / Applicant
    participant SourceApp as Source Application (e.g. MAT Portal)
    participant HubAPI as Payment Hub API (/api/v1/*)
    participant HubUI as Centralized Checkout (/checkout?session=...)
    participant Gateway as Payment Gateway (Worldline / CCAvenue)

    Note over Student,SourceApp: Step 1: Initiating Payment
    Student->>SourceApp: Click "Proceed to Pay ₹3,500"
    SourceApp->>SourceApp: Compute HMAC-SHA256 signature<br/>Canonical: POST /api/v1/payment-sessions + timestamp + nonce + bodyHash
    SourceApp->>HubAPI: POST /api/v1/payment-sessions<br/>Headers: X-AIMA-Source-Code, X-AIMA-Timestamp, X-AIMA-Nonce, X-AIMA-Signature
    
    Note over HubAPI: Step 2: Server-Side Validation
    HubAPI->>HubAPI: 1. Validate Timestamp (within ±300s)<br/>2. Check Nonce (prevent replay)<br/>3. Verify HMAC with stored secret hash<br/>4. Validate returnUrl against allowlist<br/>5. Validate amount against catalog rules (FIXED/VARIABLE)
    HubAPI-->>SourceApp: 201 Created: { sessionToken, checkoutUrl, expiresAt }
    
    SourceApp-->>Student: 302 Redirect to checkoutUrl

    Note over Student,Gateway: Step 3: Centralized Checkout & Gateway Handshake
    Student->>HubUI: Load checkoutUrl with sessionToken
    HubUI->>HubAPI: GET /api/v1/checkout/session/:token
    HubAPI-->>HubUI: Return verified session details (customer, purpose, amount)
    Student->>HubUI: Select Payment Gateway (Worldline / CCAvenue)
    HubUI->>HubAPI: POST /api/gateway/initiate
    HubAPI->>Gateway: Cryptographically signed payload (SHA256 / AES-128)
    Gateway-->>HubUI: Gateway payment redirect / modal

    Note over Student,Gateway: Step 4: Payment Authorization
    Student->>Gateway: Enter Card / NetBanking / UPI & OTP
    Gateway-->>HubAPI: POST callback (encrypted / signed response)

    Note over HubAPI,SourceApp: Step 5: Verification & S2S Webhook Delivery
    HubAPI->>Gateway: Server-to-server dual verification (status inquiry)
    Gateway-->>HubAPI: Verified status: SUCCESS / PAID
    HubAPI->>HubAPI: Update transaction state & Queue S2S notification
    
    par Asynchronous Authenticated S2S Notification
        HubAPI->>HubAPI: Generate HMAC-SHA256 signature with source application secret
        HubAPI->>SourceApp: POST /api/v1/payment-notification<br/>Headers: X-AIMA-Signature, X-AIMA-Timestamp, X-AIMA-Event-ID
        SourceApp->>SourceApp: Verify signature with pre-shared secret
        SourceApp-->>HubAPI: 200 OK: { received: true }
    and Browser Return Navigation
        HubAPI-->>Student: 302 Redirect to registered returnUrl?orderId=...&status=PAID
        Student->>SourceApp: View confirmation receipt on originating portal
    end
```

---

## 2. Server-to-Server Notification & Retry Mechanism

```mermaid
sequenceDiagram
    autonumber
    participant HubService as Notification Service (Hub)
    participant SSRFGuard as SSRF Protection Guard
    participant SourceApp as Source Application Notification Endpoint
    participant Store as Notification Store / Dead-Letter Queue

    Note over HubService: Payment status verified as SUCCESS or FAILED
    HubService->>SSRFGuard: Validate destination notificationUrl
    alt Blocked IP / Private Subnet / Localhost
        SSRFGuard-->>HubService: Blocked: Private IP or invalid scheme
        HubService->>Store: Mark DEAD_LETTER (security fault, no retry)
    else URL is Public & Safe
        SSRFGuard-->>HubService: Allowed
        HubService->>SourceApp: POST Notification (Attempt 1)
        alt Source App Returns 200 OK
            SourceApp-->>HubService: 200 OK
            HubService->>Store: Mark DELIVERED
        else Source App Down / 5xx Server Error
            SourceApp-->>HubService: 503 Service Unavailable / Timeout
            HubService->>Store: Increment attempt (1/5), schedule backoff (1m)
            Note over HubService: Wait backoff interval (1m, 5m, 15m, 1h, 6h)
            HubService->>SourceApp: POST Notification (Retry 2..5)
            alt Max Attempts Exceeded without 200 OK
                HubService->>Store: Mark DEAD_LETTER for Admin Review
                Note over Store: Admin can inspect payload & trigger manual retry from Hub Registry
            end
        end
    end
```

---

## 3. Real-Time Status Verification Polling (Source App Server)

```mermaid
sequenceDiagram
    autonumber
    participant SourceBackend as Source Backend
    participant HubAPI as Payment Hub (/api/v1/transactions/:orderId)

    Note over SourceBackend: Source app needs authoritative transaction status
    SourceBackend->>SourceBackend: Generate HMAC signature for GET request
    SourceBackend->>HubAPI: GET /api/v1/transactions/ORD-AIMA-MAT-9001<br/>Headers: X-AIMA-Source-Code, X-AIMA-Timestamp, X-AIMA-Nonce, X-AIMA-Signature
    HubAPI->>HubAPI: Authenticate HMAC & enforce cross-tenant data boundary
    alt Order belongs to another application
        HubAPI-->>SourceBackend: 403 Forbidden: Tenant boundary violation
    else Order belongs to calling application
        HubAPI-->>SourceBackend: 200 OK: { orderId, status: "SUCCESS", amountPaise, bankRef, completedAt }
    end
```
