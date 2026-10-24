/**
 * AIMA Payment Hub — v1 API Router (Phase 3 + Automatic Gateway Routing)
 *
 * Versioned API for source application integration.
 * All endpoints are protected by HMAC authentication except:
 *   - /pay & /api/v1/pay (Common initiation redirect URL)
 *   - /api/v1/session/:token (Opaque token resolution for checkout page)
 *   - /api/v1/admin/* (Admin bearer token authentication)
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { hmacAuthMiddleware } from '../middleware/hmacAuth';
import { sourceApplicationRegistry, SourceApplication } from '../models/sourceApplications';
import { paymentSessionStore } from '../models/paymentSessions';
import { sourceNotificationStore } from '../models/notificationStore';
import { serverTransactionStore } from '../services/transactionStore';
import { GatewayType, ServerTransaction } from '../gateways/gatewayTypes';
import { WorldlinePaynimoAdapter } from '../gateways/worldlinePaynimo';
import { CCAvenueAdapter } from '../gateways/ccavenue';
import { HDFCCollectNowAdapter } from '../gateways/hdfcCollectNow';
import { supabaseAdmin } from '../lib/supabaseClient';

export const v1Router = Router();

const worldlineAdapter = new WorldlinePaynimoAdapter();
const ccavenueAdapter = new CCAvenueAdapter();
const hdfcCollectNowAdapter = new HDFCCollectNowAdapter();

// ─── Admin Token Auth ─────────────────────────────────────────────────────────
function adminAuth(req: Request, res: Response, next: () => void): boolean {
  const adminToken = process.env.ADMIN_TOKEN || 'aima-admin-dev-token-2026';
  const authHeader = req.headers['authorization'] as string | undefined;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Admin bearer token required' });
    return false;
  }

  const token = authHeader.substring(7);
  let valid = false;
  try {
    valid = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(adminToken));
  } catch {
    valid = false;
  }

  if (!valid) {
    res.status(403).json({ error: 'Invalid admin token' });
    return false;
  }

  next();
  return true;
}

// ─── HTML Error Renderer for Browser Redirects ───────────────────────────────
function renderErrorHtml(title: string, message: string, details?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payment Initiation Error — All India Management Association</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 24px; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; max-width: 540px; width: 100%; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; border-bottom: 1px solid #f1f5f9; padding-bottom: 16px; }
    .logo-badge { background: #00223b; color: white; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; }
    h1 { font-size: 18px; margin: 0; color: #0f172a; }
    .sub { font-size: 12px; color: #64748b; margin: 2px 0 0; }
    .alert { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 10px; padding: 14px 16px; color: #9f1239; font-size: 14px; line-height: 1.5; margin-bottom: 20px; }
    .alert strong { display: block; margin-bottom: 4px; color: #881337; font-size: 15px; }
    .details { font-family: monospace; font-size: 12px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; margin-top: 8px; color: #334155; word-break: break-all; }
    .btn { display: inline-block; background: #00223b; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; transition: background 0.2s; }
    .btn:hover { background: #003358; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo-badge">AIMA</div>
      <div>
        <h1>AIMA Payment Hub</h1>
        <div class="sub">Centralized Institutional Payment Service</div>
      </div>
    </div>
    <div class="alert">
      <strong>⚠️ ${title}</strong>
      ${message}
      ${details ? `<div class="details">${details}</div>` : ''}
    </div>
    <a href="/?tab=registry" class="btn">Return to Payment Hub</a>
  </div>
</body>
</html>`;
}

function resolveCheckoutUrl(req: Request, sessionToken: string): string {
  if (process.env.APP_URL) {
    return `${process.env.APP_URL.replace(/\/$/, '')}/checkout/${sessionToken}`;
  }
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    const proto = req.protocol || 'http';
    return `${proto}://${host}/checkout/${sessionToken}`;
  }
  return `https://aima-payments-hub.vercel.app/checkout/${sessionToken}`;
}

// ─── Common Payment Initiation URL Handler (/pay) ─────────────────────────────
/**
 * Common payment initiation endpoint for source application redirects:
 * E.g.: https://payments.aima.in/pay?source=AMIACRC&reference=REG123&amount=1000&currency=INR&gateway=CCAVENUE&return_url=...
 */
export async function handleCommonPay(req: Request, res: Response): Promise<any> {
  const sourceCode = ((req.query.source || req.query.app || req.query.project_code || '') as string).trim();
  const reference = ((req.query.reference || req.query.ref || req.query.applicationRef || '') as string).trim();
  const amountStr = ((req.query.amount || '') as string).trim();
  const currency = (((req.query.currency as string) || 'INR')).trim().toUpperCase();
  const requestedGateway = ((req.query.gateway || '') as string).trim();
  const returnUrl = ((req.query.return_url || req.query.returnUrl || '') as string).trim();
  const customerName = (req.query.name || req.query.customerName || 'Student Applicant') as string;
  const customerEmail = (req.query.email || req.query.customerEmail || 'applicant@aima.in') as string;
  const customerPhone = (req.query.phone || req.query.customerPhone || '') as string;
  const isJson = req.headers.accept?.includes('application/json') || req.query.format === 'json';

  // 1. Validate source
  if (!sourceCode) {
    const err = { error: 'MISSING_SOURCE', message: "Missing required parameter 'source'" };
    return isJson ? res.status(400).json(err) : res.status(400).send(renderErrorHtml('Missing Source Parameter', err.message));
  }

  const sourceApp = sourceApplicationRegistry.getBySourceCode(sourceCode);
  if (!sourceApp || !sourceApp.isActive) {
    const err = {
      error: 'INVALID_SOURCE',
      message: `Unknown or inactive source application: '${sourceCode}'. Applications must be registered in the AIMA Payment Hub.`,
    };
    return isJson ? res.status(400).json(err) : res.status(400).send(renderErrorHtml('Invalid Source Application', err.message));
  }

  const rawPurpose = ((req.query.purpose || req.query.paymentPurpose || '') as string).trim();
  const paymentPurpose = rawPurpose || sourceApp.amountRules[0]?.paymentPurpose || 'REGISTRATION_FEE';

  // 2. Validate return URL
  if (!returnUrl) {
    const err = { error: 'MISSING_RETURN_URL', message: "Missing required parameter 'return_url'" };
    return isJson ? res.status(400).json(err) : res.status(400).send(renderErrorHtml('Missing Return URL', err.message));
  }

  if (!sourceApplicationRegistry.validateReturnUrl(sourceApp, returnUrl)) {
    const err = {
      error: 'UNREGISTERED_RETURN_URL',
      message: `Return URL '${returnUrl}' is not in the registered allowlist for '${sourceApp.sourceCode}'. Registered origins: ${sourceApp.allowedReturnUrls.join(', ')}`,
    };
    return isJson ? res.status(403).json(err) : res.status(403).send(renderErrorHtml('Unregistered Return URL', err.message));
  }

  // 2b. Validate Cryptographic Message Integrity (HMAC-SHA256 signature)
  const signatureParam = ((req.query.signature || req.query.sig || req.query.hmac || '') as string).trim();
  const timestampParam = ((req.query.timestamp || req.query.ts || '') as string).trim();

  if (signatureParam) {
    const nowSec = Math.floor(Date.now() / 1000);
    const reqSec = parseInt(timestampParam, 10);
    if (isNaN(reqSec) || Math.abs(nowSec - reqSec) > 1800) {
      const err = { error: 'EXPIRED_PAYMENT_URL', message: 'Payment URL timestamp has expired or is outside ±30 min tolerance. Please re-initiate payment from the portal.' };
      return isJson ? res.status(403).json(err) : res.status(403).send(renderErrorHtml('Expired Payment Signature', err.message));
    }

    const appSecret = sourceApplicationRegistry.getAppSecret(sourceApp.sourceCode);
    if (appSecret) {
      const canonical = `${sourceApp.sourceCode}:${reference}:${amountStr}:${currency}:${timestampParam}`;
      const expectedSig = crypto.createHmac('sha256', appSecret).update(canonical, 'utf8').digest('hex');

      let isValidSig = false;
      try {
        isValidSig = crypto.timingSafeEqual(Buffer.from(signatureParam, 'utf8'), Buffer.from(expectedSig, 'utf8'));
      } catch {
        isValidSig = false;
      }

      if (!isValidSig) {
        console.warn(`[SECURITY ALERT] Parameter tampering detected on /pay initiation! Source: ${sourceApp.sourceCode}, Ref: ${reference}, Tampered Amount: ${amountStr}`);
        const err = {
          error: 'PARAMETER_TAMPERING_DETECTED',
          message: 'Security Violation: Cryptographic signature mismatch. The request amount or parameters have been modified in transit.',
        };
        return isJson ? res.status(403).json(err) : res.status(403).send(renderErrorHtml('Security Violation: Parameter Tampering Detected', err.message));
      }
    }
  }

  // 3. Validate amount format and currency
  const amountNum = parseFloat(amountStr);
  if (isNaN(amountNum) || amountNum <= 0) {
    const err = { error: 'INVALID_AMOUNT', message: `Amount must be a positive number. Received: '${amountStr}'` };
    return isJson ? res.status(400).json(err) : res.status(400).send(renderErrorHtml('Invalid Amount', err.message));
  }

  if (currency !== 'INR') {
    const err = { error: 'INVALID_CURRENCY', message: 'Only INR currency is supported' };
    return isJson ? res.status(400).json(err) : res.status(400).send(renderErrorHtml('Invalid Currency', err.message));
  }

  const amountPaise = Math.round(amountNum * 100);

  // 3b. Server-Side Authoritative Database Verification (Cross-validates against backend registrations ledger)
  if (reference && (sourceApp.sourceCode === 'CASE_LEAGUE' || sourceApp.sourceCode === 'AMIACRC')) {
    try {
      const { data: reg, error: regErr } = await supabaseAdmin
        .from('registrations')
        .select('registration_number, participant_count, fee_tier, subtotal_amount, total_amount')
        .eq('registration_number', reference)
        .maybeSingle();

      if (reg && !regErr) {
        const participantCount = reg.participant_count || 1;
        // Authoritative server-side price calculation: strictly supports ₹200 (Standard) and ₹500 (Comparative QA) per participant
        const is500Tier =
          amountNum === participantCount * 500 ||
          reg.total_amount === participantCount * 500 ||
          reg.subtotal_amount === participantCount * 500 ||
          reg.fee_tier?.includes('500') ||
          reg.fee_tier?.includes('comparative') ||
          reg.fee_tier?.includes('Executive');

        const authoritativeAmount = is500Tier ? participantCount * 500 : participantCount * 200;
        const authoritativePaise = authoritativeAmount * 100;

        if (amountPaise !== authoritativePaise) {
          console.warn(`[SECURITY ALERT] Request amount tampering detected! Ref: ${reference}, Submitted: ₹${amountNum}, Authoritative Server Price: ₹${authoritativeAmount} (${participantCount} participants)`);
          const err = {
            error: 'AMOUNT_TAMPERING_DETECTED',
            message: `Security Violation: Client submitted amount ₹${amountNum.toFixed(2)} does not match server-calculated authoritative amount ₹${authoritativeAmount.toFixed(2)} for ${participantCount} participant(s) under registration ${reference}.`,
          };
          return isJson ? res.status(403).json(err) : res.status(403).send(renderErrorHtml('Security Violation: Amount Tampering Detected', err.message));
        }
      }
    } catch (dbErr) {
      console.warn('Database authoritative check skipped (offline or network notice):', dbErr);
    }
  }

  // 3c. Registry Fee Rules Validation (Enforces TIERED_MULTIPLIER and unit pricing)
  const amountValidation = sourceApplicationRegistry.validateAmount(sourceApp, paymentPurpose, amountPaise);
  if (!amountValidation.valid) {
    const err = { error: 'AMOUNT_VALIDATION_FAILED', message: amountValidation.reason || 'Amount validation failed' };
    return isJson ? res.status(400).json(err) : res.status(400).send(renderErrorHtml('Amount Validation Failed', err.message));
  }

  // 4. Validate and resolve gateway according to registry policy
  const gatewayResolution = sourceApplicationRegistry.validateAndResolveGateway(sourceApp.sourceCode, requestedGateway);
  if (!gatewayResolution.valid) {
    const err = { error: 'GATEWAY_MISMATCH', message: gatewayResolution.reason || 'Gateway mismatch' };
    return isJson ? res.status(400).json(err) : res.status(400).send(renderErrorHtml('Gateway Mismatch', err.message));
  }

  const resolvedGateway = gatewayResolution.resolvedGateway;

  // 5. Check gateway configuration: NEVER silently fall back to simulated success
  if (resolvedGateway === 'CCAVENUE') {
    const collectNowStatus = hdfcCollectNowAdapter.getStatus();
    const status = collectNowStatus.canProcessLiveSandbox ? collectNowStatus : ccavenueAdapter.getStatus();
    if (!status.canProcessLiveSandbox) {
      const err = {
        error: 'GATEWAY_CONFIG_ERROR',
        message: 'Gateway Configuration Error: HDFC Bank sandbox credentials are not configured. Cannot process payments without active test keys. Falling back to simulator is strictly prohibited.',
        gateway: 'CCAVENUE',
        blockerDetails: status.blockerDetails,
      };
      return isJson ? res.status(422).json(err) : res.status(422).send(renderErrorHtml('Gateway Configuration Error', err.message, status.blockerDetails));
    }
  } else if (resolvedGateway === 'WORLDLINE_PAYNIMO') {
    const status = worldlineAdapter.getStatus();
    if (!status.canProcessLiveSandbox) {
      const err = {
        error: 'GATEWAY_CONFIG_ERROR',
        message: 'Gateway Configuration Error: Worldline / Paynimo sandbox credentials are not configured.',
        gateway: 'WORLDLINE_PAYNIMO',
      };
      return isJson ? res.status(422).json(err) : res.status(422).send(renderErrorHtml('Gateway Configuration Error', err.message));
    }
  }

  // 5b. Reference Idempotency & Duplicate Payment Prevention
  if (reference) {
    const existingSuccess = serverTransactionStore.getAll().find(
      (t) =>
        t.applicationCode === sourceApp.sourceCode &&
        t.applicationRef === reference &&
        t.status === 'SUCCESS'
    );

    if (existingSuccess) {
      if (isJson) {
        return res.status(200).json({
          success: true,
          alreadyPaid: true,
          message: `Payment for reference '${reference}' has already been completed successfully.`,
          orderId: existingSuccess.orderId,
          transactionId: existingSuccess.id,
          amountPaise: Math.round(existingSuccess.totalAmount * 100),
          status: 'SUCCESS',
        });
      }

      // If user came via browser redirect to /pay:
      // Redirect back to return_url with status=SUCCESS&already_paid=true to prevent double charging
      try {
        const urlObj = new URL(returnUrl);
        urlObj.searchParams.set('orderId', existingSuccess.orderId);
        urlObj.searchParams.set('transactionId', existingSuccess.id);
        urlObj.searchParams.set('status', 'SUCCESS');
        urlObj.searchParams.set('reference', reference);
        urlObj.searchParams.set('already_paid', 'true');
        return res.redirect(urlObj.toString());
      } catch {
        const sep = returnUrl.includes('?') ? '&' : '?';
        return res.redirect(
          `${returnUrl}${sep}orderId=${encodeURIComponent(existingSuccess.orderId)}&transactionId=${encodeURIComponent(existingSuccess.id)}&status=SUCCESS&reference=${encodeURIComponent(reference)}&already_paid=true`
        );
      }
    }

    // Reuse existing active pending session if candidate clicks /pay again before 15 min expires
    const activeSession = paymentSessionStore.findActivePending(sourceApp.sourceCode, reference);
    if (activeSession) {
      const checkoutUrl = resolveCheckoutUrl(req, activeSession.sessionToken);
      if (isJson) {
        return res.status(200).json({
          success: true,
          reused: true,
          sessionToken: activeSession.sessionToken,
          checkoutUrl,
          orderId: activeSession.orderId,
          reference,
          amountPaise: activeSession.amountPaise,
          currency: 'INR',
          resolvedGateway,
          expiresAt: activeSession.expiresAt,
        });
      }
      return res.redirect(checkoutUrl);
    }
  }

  // 6. Create internal order
  const now = new Date().toISOString();
  const dateStr = now.slice(0, 10).replace(/-/g, '');
  const randNum = Math.floor(10000 + Math.random() * 90000);
  const txnId = `TXN-${dateStr}-${randNum}`;
  const orderId = `ORD-AIMA-${sourceApp.sourceCode.replace(/[^A-Za-z0-9]/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

  const transaction: ServerTransaction = {
    id: txnId,
    orderId,
    applicationId: sourceApp.id,
    applicationCode: sourceApp.sourceCode,
    applicationName: sourceApp.name,
    applicationRef: reference || orderId,
    applicantName: customerName,
    applicantEmail: customerEmail,
    applicantPhone: customerPhone,
    courseOrEvent: paymentPurpose,
    feeDescription: paymentPurpose,
    baseAmount: amountNum,
    gstAmount: 0,
    totalAmount: amountNum,
    gatewayAmount: amountNum,
    currency: 'INR',
    gateway: resolvedGateway,
    gatewayEnvironment: 'sandbox',
    isSimulated: false,
    status: 'PENDING',
    createdAt: now,
    idempotencyKey: `PAY-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    callbackDelivered: false,
    auditTrail: [
      {
        step: 'Common Pay Order Initiated',
        timestamp: now,
        detail: `Initiated via /pay URL. Source: ${sourceApp.sourceCode} (${sourceApp.department || 'N/A'}). Auto-resolved Gateway: ${resolvedGateway} (Mode: ${gatewayResolution.routingMode}). Ref: ${reference}`,
        status: 'ok',
      },
    ],
  };

  // 7. Create payment session
  const session = paymentSessionStore.create({
    transactionId: txnId,
    orderId,
    sourceCode: sourceApp.sourceCode,
    externalOrderId: reference || orderId,
    applicationReference: reference || orderId,
    paymentPurpose,
    amountPaise,
    currency: 'INR',
    customerName,
    customerEmail,
    customerPhone,
    returnUrl,
    selectedGateway: resolvedGateway,
    routingMode: gatewayResolution.routingMode,
    idempotencyKey: transaction.idempotencyKey,
  });

  transaction.sessionToken = session.sessionToken;
  transaction.returnUrl = returnUrl;
  transaction.externalOrderId = reference || orderId;
  transaction.paymentPurpose = paymentPurpose;
  await serverTransactionStore.save(transaction);

  const checkoutUrl = resolveCheckoutUrl(req, session.sessionToken);

  if (isJson) {
    return res.status(201).json({
      success: true,
      sessionToken: session.sessionToken,
      checkoutUrl,
      orderId,
      reference,
      amountPaise,
      amountInr: (amountPaise / 100).toFixed(2),
      currency: 'INR',
      resolvedGateway,
      routingMode: gatewayResolution.routingMode,
      department: sourceApp.department || 'CME',
      expiresAt: session.expiresAt,
    });
  }

  // Browser redirect to centralized checkout
  return res.redirect(checkoutUrl);
}

// Mount /pay on v1 router
v1Router.get('/pay', handleCommonPay);

// ─── POST /api/v1/payment-sessions ───────────────────────────────────────────
/**
 * Create a payment session (authenticated server-to-server API).
 * Authenticated via HMAC signature or Bearer API key.
 *
 * Automatic Gateway Routing:
 *   - Resolves assigned gateway from registered source application policy.
 *   - If optional `gateway` parameter is supplied, validates against registered assignment;
 *     never trusts client to override registry policy.
 *   - Validates gateway sandbox readiness.
 */
v1Router.post('/payment-sessions', hmacAuthMiddleware, async (req: Request, res: Response): Promise<any> => {
  const sourceApp: SourceApplication = (req as any).sourceApp;
  if (!sourceApp) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    externalOrderId,
    applicationReference,
    paymentPurpose,
    amount,         // { value: number (rupees float), currency: 'INR' }
    currency = 'INR',
    customerName,
    customerEmail,
    customerPhone,
    returnUrl,
    idempotencyKey,
    gateway: requestedGateway,
    metadata,
  } = req.body;

  // ── Input validation ──────────────────────────────────────────────────────
  const missing: string[] = [];
  if (!externalOrderId) missing.push('externalOrderId');
  if (!applicationReference) missing.push('applicationReference');
  if (!paymentPurpose) missing.push('paymentPurpose');
  if (!amount || typeof amount.value !== 'number') missing.push('amount.value');
  if (!customerName) missing.push('customerName');
  if (!customerEmail) missing.push('customerEmail');
  if (!returnUrl) missing.push('returnUrl');
  if (!idempotencyKey) missing.push('idempotencyKey');

  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  // ── Validate currency ─────────────────────────────────────────────────────
  if (currency !== 'INR') {
    return res.status(400).json({ error: 'Only INR currency is supported' });
  }

  // ── Validate payment purpose ──────────────────────────────────────────────
  if (!sourceApp.allowedPaymentPurposes.includes(paymentPurpose)) {
    return res.status(403).json({
      error: `Payment purpose '${paymentPurpose}' is not permitted for ${sourceApp.sourceCode}. Allowed: ${sourceApp.allowedPaymentPurposes.join(', ')}`,
    });
  }

  // ── Validate amount (convert to paise — integer arithmetic) ───────────────
  const amountPaise = Math.round(amount.value * 100);
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  const amountValidation = sourceApplicationRegistry.validateAmount(sourceApp, paymentPurpose, amountPaise);
  if (!amountValidation.valid) {
    return res.status(400).json({ error: amountValidation.reason });
  }

  // ── Validate return URL against allowlist ─────────────────────────────────
  if (!sourceApplicationRegistry.validateReturnUrl(sourceApp, returnUrl)) {
    return res.status(403).json({
      error: `Return URL '${returnUrl}' is not in the registered allowlist for ${sourceApp.sourceCode}`,
    });
  }

  // ── Automatic Gateway Resolution & Conflict Check ─────────────────────────
  const gatewayResolution = sourceApplicationRegistry.validateAndResolveGateway(
    sourceApp.sourceCode,
    requestedGateway || (req.query.gateway as string)
  );

  if (!gatewayResolution.valid) {
    return res.status(400).json({
      error: 'GATEWAY_MISMATCH',
      message: gatewayResolution.reason || 'Gateway parameter does not match registered assignment policy',
    });
  }

  const resolvedGateway = gatewayResolution.resolvedGateway;

  // ── Gateway configuration check (refuse silent fallback to simulator) ─────
  if (resolvedGateway === 'CCAVENUE') {
    const collectNowStatus = hdfcCollectNowAdapter.getStatus();
    const status = collectNowStatus.canProcessLiveSandbox ? collectNowStatus : ccavenueAdapter.getStatus();
    if (!status.canProcessLiveSandbox) {
      return res.status(422).json({
        error: 'GATEWAY_CONFIG_ERROR',
        message: 'Gateway Configuration Error: HDFC Bank sandbox credentials are not configured. Cannot process payments without active test keys. Falling back to simulator is strictly prohibited.',
        gateway: 'CCAVENUE',
        blockerDetails: status.blockerDetails,
      });
    }
  } else if (resolvedGateway === 'WORLDLINE_PAYNIMO') {
    const status = worldlineAdapter.getStatus();
    if (!status.canProcessLiveSandbox) {
      return res.status(422).json({
        error: 'GATEWAY_CONFIG_ERROR',
        message: 'Gateway Configuration Error: Worldline / Paynimo sandbox credentials are not configured.',
        gateway: 'WORLDLINE_PAYNIMO',
      });
    }
  }

  // ── Validate metadata (non-sensitive, string values only) ─────────────────
  if (metadata !== undefined && typeof metadata !== 'object') {
    return res.status(400).json({ error: 'metadata must be an object with string values' });
  }
  if (metadata) {
    for (const [k, v] of Object.entries(metadata)) {
      if (typeof v !== 'string') {
        return res.status(400).json({ error: `metadata.${k} must be a string` });
      }
    }
  }

  // ── Create internal order ─────────────────────────────────────────────────
  const now = new Date().toISOString();
  const dateStr = now.slice(0, 10).replace(/-/g, '');
  const randNum = Math.floor(10000 + Math.random() * 90000);
  const txnId = `TXN-${dateStr}-${randNum}`;
  const orderId = `ORD-AIMA-${sourceApp.sourceCode.replace(/[^A-Za-z0-9]/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

  const gatewayAmount = amount.value;

  const transaction: ServerTransaction = {
    id: txnId,
    orderId,
    applicationId: sourceApp.id,
    applicationCode: sourceApp.sourceCode,
    applicationName: sourceApp.name,
    applicationRef: applicationReference,
    applicantName: customerName,
    applicantEmail: customerEmail,
    applicantPhone: customerPhone || '',
    courseOrEvent: paymentPurpose,
    feeDescription: paymentPurpose,
    baseAmount: amount.value,
    gstAmount: 0,
    totalAmount: amount.value,
    gatewayAmount,
    currency: 'INR' as const,
    gateway: resolvedGateway,
    gatewayEnvironment: 'sandbox' as const,
    isSimulated: false,
    status: 'PENDING' as const,
    createdAt: now,
    idempotencyKey: `V1-${idempotencyKey}`,
    callbackDelivered: false,
    auditTrail: [
      {
        step: 'Session Order Created (v1 API)',
        timestamp: now,
        detail: `Order ${orderId} created by ${sourceApp.sourceCode} via v1 API. External: ${externalOrderId}. Auto-resolved Gateway: ${resolvedGateway} (${gatewayResolution.routingMode}). Purpose: ${paymentPurpose}. Amount: ₹${amount.value.toFixed(2)}`,
        status: 'ok' as const,
      },
    ],
  };

  // ── Create payment session ─────────────────────────────────────────────────
  let session;
  try {
    session = paymentSessionStore.create({
      transactionId: txnId,
      orderId,
      sourceCode: sourceApp.sourceCode,
      externalOrderId,
      applicationReference,
      paymentPurpose,
      amountPaise,
      currency: 'INR',
      customerName,
      customerEmail,
      customerPhone,
      returnUrl,
      selectedGateway: resolvedGateway,
      routingMode: gatewayResolution.routingMode,
      idempotencyKey,
      metadata,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }

  transaction.sessionToken = session.sessionToken;
  transaction.returnUrl = returnUrl;
  transaction.externalOrderId = externalOrderId;
  transaction.paymentPurpose = paymentPurpose;
  await serverTransactionStore.save(transaction);

  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const checkoutUrl = `${appUrl}/checkout/${session.sessionToken}`;

  return res.status(201).json({
    success: true,
    sessionToken: session.sessionToken,
    checkoutUrl,
    orderId,
    externalOrderId,
    amountPaise,
    amountInr: (amountPaise / 100).toFixed(2),
    currency: 'INR',
    resolvedGateway,
    routingMode: gatewayResolution.routingMode,
    department: sourceApp.department || 'CME',
    expiresAt: session.expiresAt,
  });
});

// ─── GET /api/v1/payments/:orderId ────────────────────────────────────────────
/**
 * Source application status lookup.
 * Returns authoritative transaction status.
 * Enforces per-source tenant isolation.
 */
v1Router.get('/payments/:orderId', hmacAuthMiddleware, (req: Request, res: Response): any => {
  const sourceApp = (req as any).sourceApp;
  if (!sourceApp) return res.status(401).json({ error: 'Unauthorized' });

  const { orderId } = req.params;
  const txn = serverTransactionStore.getByOrderId(orderId);

  if (!txn) {
    return res.status(404).json({ error: `Order ${orderId} not found` });
  }

  // Enforce per-source access control (tenant boundary)
  const isMatch =
    txn.applicationCode === sourceApp.sourceCode ||
    sourceApp.aliases?.includes(txn.applicationCode) ||
    txn.applicationId === sourceApp.id;

  if (!isMatch) {
    return res.status(403).json({ error: 'Access denied: order belongs to a different application' });
  }

  // Authoritative verified status response
  return res.json({
    orderId: txn.orderId,
    externalOrderId: txn.orderId,
    applicationReference: txn.applicationRef,
    amount: {
      paise: Math.round(txn.totalAmount * 100),
      inr: txn.totalAmount.toFixed(2),
      currency: txn.currency || 'INR',
    },
    status: txn.status,
    gateway: txn.gateway,
    gatewayReference: txn.gatewayTransactionId,
    bankReference: txn.bankReference,
    verificationState: txn.verificationMethod || null,
    createdAt: txn.createdAt,
    updatedAt: txn.completedAt || txn.createdAt,
  });
});

// ─── GET /api/v1/session/:token ───────────────────────────────────────────────
/**
 * Internal: resolve payment session for checkout page.
 * Returns session details + order details + auto-resolved gateway.
 */
v1Router.get('/session/:token', async (req: Request, res: Response): Promise<any> => {
  const token = req.params.token;
  let session = paymentSessionStore.getByToken(token);

  if (!session) {
    let storedTxn = await serverTransactionStore.fetchBySessionToken(token);
    if (!storedTxn) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      storedTxn = await serverTransactionStore.fetchBySessionToken(token);
    }
    if (storedTxn) {
      const app = sourceApplicationRegistry.getBySourceCode(storedTxn.applicationCode);
      session = paymentSessionStore.createWithToken({
        sessionToken: token,
        transactionId: storedTxn.id,
        orderId: storedTxn.orderId,
        sourceCode: storedTxn.applicationCode,
        externalOrderId: storedTxn.applicationRef || storedTxn.orderId,
        applicationReference: storedTxn.applicationRef || storedTxn.orderId,
        paymentPurpose: storedTxn.courseOrEvent || storedTxn.feeDescription || 'REGISTRATION_FEE',
        amountPaise: Math.round(storedTxn.totalAmount * 100),
        currency: 'INR',
        customerName: storedTxn.applicantName,
        customerEmail: storedTxn.applicantEmail,
        customerPhone: storedTxn.applicantPhone,
        returnUrl: storedTxn.returnUrl || 'https://research.aima.in/registration',
        selectedGateway: storedTxn.gateway as any,
        routingMode: app?.routingMode || 'AUTO',
        idempotencyKey: storedTxn.idempotencyKey,
      });
    }
  }

  if (!session) {
    const expiredSession = paymentSessionStore.getAnyByToken(token);
    if (expiredSession) {
      const app = sourceApplicationRegistry.getBySourceCode(expiredSession.sourceCode);
      return res.status(410).json({
        error: 'SESSION_EXPIRED',
        message: 'This payment session has expired. Please return to the originating application to initiate a new checkout.',
        session: {
          sessionToken: expiredSession.sessionToken,
          status: 'EXPIRED',
          orderId: expiredSession.orderId,
          sourceCode: expiredSession.sourceCode,
          sourceName: app?.name || expiredSession.sourceCode,
          returnUrl: expiredSession.returnUrl,
          isExpired: true,
        },
      });
    }

    return res.status(404).json({
      error: 'SESSION_NOT_FOUND',
      message: 'Payment session not found or has expired. Please return to the application and try again.',
    });
  }

  const txn = serverTransactionStore.getByOrderId(session.orderId);
  const app = sourceApplicationRegistry.getBySourceCode(session.sourceCode);

  // If transaction is already successful, ensure session is completed
  if (txn && txn.status === 'SUCCESS' && session.status !== 'COMPLETED') {
    paymentSessionStore.markCompleted(session.sessionToken);
  }

  const isCompleted = session.status === 'COMPLETED' || txn?.status === 'SUCCESS';
  const resolvedGateway = session.selectedGateway || app?.assignedGateway || 'CCAVENUE';
  const routingMode = session.routingMode || app?.routingMode || 'AUTO';

  return res.json({
    session: {
      sessionToken: session.sessionToken,
      status: session.status,
      expiresAt: session.expiresAt,
      sourceCode: session.sourceCode,
      sourceName: app?.name || session.sourceCode,
      department: app?.department || 'CME',
      resolvedGateway,
      routingMode,
      returnUrl: session.returnUrl,
      isCompleted,
    },
    order: {
      orderId: session.orderId,
      externalOrderId: session.externalOrderId,
      applicationReference: session.applicationReference,
      paymentPurpose: session.paymentPurpose,
      amountPaise: session.amountPaise,
      amountInr: (session.amountPaise / 100).toFixed(2),
      currency: session.currency,
      customerName: session.customerName,
      customerEmail: session.customerEmail,
      status: txn?.status || session.status,
      gateway: resolvedGateway,
    },
    transaction: txn || null,
    allowedGateways: app?.allowedGateways || [resolvedGateway],
  });
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────

/** GET /api/v1/admin/applications — List all source applications */
v1Router.get('/admin/applications', (req: Request, res: Response): any => {
  if (!adminAuth(req, res, () => {})) return;
  const apps = sourceApplicationRegistry.getAll();
  return res.json({
    applications: apps.map((a) => sourceApplicationRegistry.toSafeView(a)),
    total: apps.length,
  });
});

/** PUT /api/v1/admin/applications/:code/gateway — Update gateway assignment & routing mode */
v1Router.put('/admin/applications/:code/gateway', (req: Request, res: Response): any => {
  if (!adminAuth(req, res, () => {})) return;

  const { assignedGateway, routingMode, department } = req.body;
  if (!assignedGateway) {
    return res.status(400).json({ error: "Missing required field 'assignedGateway'" });
  }

  const normalized = sourceApplicationRegistry.normalizeGatewayName(assignedGateway);
  if (!normalized) {
    return res.status(400).json({ error: `Invalid assignedGateway '${assignedGateway}'. Permitted: CCAVENUE, WORLDLINE_PAYNIMO, DEMO_SIMULATOR` });
  }

  try {
    const app = sourceApplicationRegistry.updateGatewayAssignment(
      req.params.code,
      normalized,
      routingMode,
      department,
      'ADMIN_API'
    );
    return res.json({
      success: true,
      message: `Gateway assignment for ${app.sourceCode} updated to ${app.assignedGateway} (${app.routingMode})`,
      application: sourceApplicationRegistry.toSafeView(app),
    });
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

/** PUT /api/v1/admin/applications/:code — Update full platform configuration (gateway, return URLs, notification webhook, name) */
v1Router.put('/admin/applications/:code', (req: Request, res: Response): any => {
  if (!adminAuth(req, res, () => {})) return;

  const { name, assignedGateway, allowedReturnUrls, notificationUrl, department } = req.body;
  const normalizedGw = assignedGateway ? sourceApplicationRegistry.normalizeGatewayName(assignedGateway) : undefined;

  try {
    const app = sourceApplicationRegistry.updateApplication(
      req.params.code,
      {
        name,
        assignedGateway: normalizedGw || undefined,
        allowedReturnUrls,
        notificationUrl,
        department,
      },
      'ADMIN_API'
    );
    return res.json({
      success: true,
      message: `Platform '${app.sourceCode}' configuration updated successfully`,
      application: sourceApplicationRegistry.toSafeView(app),
    });
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

/** POST /api/v1/admin/applications — Register new source application */
v1Router.post('/admin/applications', (req: Request, res: Response): any => {
  if (!adminAuth(req, res, () => {})) return;

  const {
    sourceCode,
    name,
    department,
    description,
    assignedGateway,
    routingMode,
    allowedReturnUrls,
    notificationUrl,
    allowedPaymentPurposes,
    amountRules,
    allowedGateways,
  } = req.body;

  const missing: string[] = [];
  if (!sourceCode) missing.push('sourceCode');
  if (!name) missing.push('name');
  if (!allowedReturnUrls || !Array.isArray(allowedReturnUrls)) missing.push('allowedReturnUrls');
  if (!notificationUrl) missing.push('notificationUrl');
  if (!allowedPaymentPurposes || !Array.isArray(allowedPaymentPurposes)) missing.push('allowedPaymentPurposes');
  if (!amountRules || !Array.isArray(amountRules)) missing.push('amountRules');

  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  // SSRF pre-check on notification URL
  const { quickSsrfCheck } = require('../services/ssrfGuard');
  const ssrfResult = quickSsrfCheck(notificationUrl);
  if (!ssrfResult.safe) {
    return res.status(400).json({ error: `Notification URL rejected: ${ssrfResult.reason}` });
  }

  const resolvedAssignedGw = sourceApplicationRegistry.normalizeGatewayName(assignedGateway || 'CCAVENUE') || 'CCAVENUE';

  try {
    const { app, rawApiKey } = sourceApplicationRegistry.register(
      {
        sourceCode: sourceCode.trim(),
        name: name.trim(),
        department: department || 'General',
        description: description || '',
        isActive: true,
        assignedGateway: resolvedAssignedGw,
        routingMode: routingMode === 'USER_SELECTABLE' ? 'USER_SELECTABLE' : 'AUTO',
        allowedReturnUrls,
        notificationUrl,
        allowedPaymentPurposes,
        amountRules,
        allowedGateways: allowedGateways || [resolvedAssignedGw, 'WORLDLINE_PAYNIMO', 'CCAVENUE', 'DEMO_SIMULATOR'],
      },
      'ADMIN_API'
    );

    return res.status(201).json({
      success: true,
      application: sourceApplicationRegistry.toSafeView(app),
      apiKey: rawApiKey,
      warning: 'Store this API key securely. It will NOT be shown again.',
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/** PUT /api/v1/admin/applications/:code/status — Toggle active status */
v1Router.put('/admin/applications/:code/status', (req: Request, res: Response): any => {
  if (!adminAuth(req, res, () => {})) return;

  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive must be a boolean' });
  }

  try {
    const app = sourceApplicationRegistry.setActiveStatus(req.params.code, isActive, 'ADMIN_API');
    return res.json({ success: true, application: sourceApplicationRegistry.toSafeView(app) });
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

/** POST /api/v1/admin/applications/:code/rotate-key — Rotate API key */
v1Router.post('/admin/applications/:code/rotate-key', (req: Request, res: Response): any => {
  if (!adminAuth(req, res, () => {})) return;

  try {
    const { rawApiKey } = sourceApplicationRegistry.rotateApiKey(req.params.code, 'ADMIN_API');
    return res.json({
      success: true,
      apiKey: rawApiKey,
      warning: 'New API key generated. Old key is revoked. Store this key securely — it will NOT be shown again.',
    });
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

/** GET /api/v1/admin/notifications — List all notifications */
v1Router.get('/admin/notifications', (req: Request, res: Response): any => {
  if (!adminAuth(req, res, () => {})) return;

  const { sourceCode, status } = req.query;
  let notifications = sourceNotificationStore.getAll();

  if (sourceCode) {
    notifications = notifications.filter((n) => n.sourceCode.toUpperCase() === String(sourceCode).toUpperCase());
  }
  if (status) {
    notifications = notifications.filter((n) => n.deliveryStatus === String(status).toUpperCase());
  }

  return res.json({
    notifications: notifications.map((n) => ({
      eventId: n.eventId,
      orderId: n.orderId,
      sourceCode: n.sourceCode,
      status: n.status,
      deliveryStatus: n.deliveryStatus,
      attemptCount: n.attemptCount,
      maxAttempts: n.maxAttempts,
      nextRetryAt: n.nextRetryAt,
      notificationUrl: n.notificationUrl,
      createdAt: n.createdAt,
      deliveredAt: n.deliveredAt,
      lastAttemptAt: n.lastAttemptAt,
      attempts: n.attempts,
    })),
    total: notifications.length,
  });
});

/** POST /api/v1/admin/notifications/:eventId/retry — Manual retry */
v1Router.post('/admin/notifications/:eventId/retry', (req: Request, res: Response): any => {
  if (!adminAuth(req, res, () => {})) return;

  try {
    const notification = sourceNotificationStore.manualRetry(req.params.eventId);
    return res.json({ success: true, notification });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/** DELETE /api/v1/admin/applications/:code — Delete a source application */
v1Router.delete('/admin/applications/:code', (req: Request, res: Response): any => {
  if (!adminAuth(req, res, () => {})) return;

  const code = req.params.code;
  const deleted = sourceApplicationRegistry.deleteApplication(code, 'ADMIN_API');
  if (!deleted) {
    return res.status(404).json({ error: `Application '${code}' not found` });
  }

  return res.json({ success: true, message: `Application '${code}' deleted successfully` });
});

/** GET /api/v1/admin/transactions — Comprehensive payment ledger and reporting */
v1Router.get('/admin/transactions', async (req: Request, res: Response): Promise<any> => {
  if (!adminAuth(req, res, () => {})) return;

  const { sourceCode, gateway, status, search, startDate, endDate } = req.query;
  let txns = await serverTransactionStore.fetchAll();

  if (sourceCode && sourceCode !== 'ALL') {
    const sc = String(sourceCode).toUpperCase();
    txns = txns.filter((t) => t.applicationCode.toUpperCase() === sc || (t.applicationId && t.applicationId.toUpperCase() === sc));
  }

  if (gateway && gateway !== 'ALL') {
    const gw = String(gateway).toUpperCase();
    txns = txns.filter((t) => t.gateway.toUpperCase() === gw);
  }

  if (status && status !== 'ALL') {
    const st = String(status).toUpperCase();
    txns = txns.filter((t) => t.status.toUpperCase() === st);
  }

  if (startDate) {
    const start = new Date(String(startDate)).getTime();
    if (!isNaN(start)) {
      txns = txns.filter((t) => new Date(t.createdAt).getTime() >= start);
    }
  }

  if (endDate) {
    const end = new Date(String(endDate)).getTime();
    if (!isNaN(end)) {
      txns = txns.filter((t) => new Date(t.createdAt).getTime() <= end);
    }
  }

  if (search) {
    const q = String(search).toLowerCase().trim();
    txns = txns.filter(
      (t) =>
        t.orderId.toLowerCase().includes(q) ||
        t.applicantName.toLowerCase().includes(q) ||
        t.applicantEmail.toLowerCase().includes(q) ||
        (t.bankReference && t.bankReference.toLowerCase().includes(q)) ||
        (t.gatewayTransactionId && t.gatewayTransactionId.toLowerCase().includes(q)) ||
        t.applicationName.toLowerCase().includes(q)
    );
  }

  // Calculate aggregation metrics
  const totalCount = txns.length;
  const successList = txns.filter((t) => t.status === 'SUCCESS');
  const failedList = txns.filter((t) => t.status === 'FAILED');
  const pendingList = txns.filter((t) => t.status === 'PENDING');
  const totalAmount = successList.reduce((acc, t) => acc + (t.totalAmount || 0), 0);

  return res.json({
    transactions: txns,
    total: totalCount,
    metrics: {
      totalCount,
      successCount: successList.length,
      failedCount: failedList.length,
      pendingCount: pendingList.length,
      totalAmount,
      successRate: totalCount > 0 ? ((successList.length / totalCount) * 100).toFixed(1) : '0',
    },
  });
});

/** POST /api/v1/admin/transactions/:id/reconcile — Admin conflict/discrepancy resolution */
v1Router.post('/admin/transactions/:id/reconcile', (req: Request, res: Response): any => {
  if (!adminAuth(req, res, () => {})) return;

  const { status, note, bankReference, adminUser } = req.body;
  if (!status || !['SUCCESS', 'FAILED', 'CANCELLED'].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Must be SUCCESS, FAILED, or CANCELLED." });
  }

  if (!note) {
    return res.status(400).json({ error: "Resolution note is required." });
  }

  try {
    const resolved = serverTransactionStore.reconcileTransaction(req.params.id, {
      status,
      note,
      adminUser: adminUser || 'Admin User',
      bankReference,
    });
    return res.json({ success: true, transaction: resolved });
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

/** POST /api/v1/admin/auth/login — Admin login */
v1Router.post('/admin/auth/login', (req: Request, res: Response): any => {
  const { username, password } = req.body;
  const adminToken = process.env.ADMIN_TOKEN || 'aima-admin-dev-token-2026';
  const expectedPassword = process.env.ADMIN_PASSWORD || 'AimaAdmin@2026';

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // Accept admin / AimaAdmin@2026 or aima / AimaAdmin@2026
  if (
    (username.toLowerCase() === 'admin' || username.toLowerCase() === 'tech@aima.in') &&
    password === expectedPassword
  ) {
    return res.json({
      success: true,
      token: adminToken,
      user: {
        username: 'admin',
        email: 'tech@aima.in',
        name: 'AIMA Payments Administrator',
        role: 'superadmin',
      },
    });
  }

  return res.status(401).json({ error: 'Invalid admin credentials' });
});

/** GET /api/v1/admin/auth/verify — Verify admin session */
v1Router.get('/admin/auth/verify', (req: Request, res: Response): any => {
  if (!adminAuth(req, res, () => {})) return;

  return res.json({
    valid: true,
    user: {
      username: 'admin',
      email: 'tech@aima.in',
      name: 'AIMA Payments Administrator',
      role: 'superadmin',
    },
  });
});

