import { Router, Request, Response } from 'express';
import { WorldlinePaynimoAdapter } from '../gateways/worldlinePaynimo';
import { CCAvenueAdapter } from '../gateways/ccavenue';
import { HDFCCollectNowAdapter } from '../gateways/hdfcCollectNow';
import { serverTransactionStore } from '../services/transactionStore';
import { paymentSessionStore } from '../models/paymentSessions';
import { sourceApplicationRegistry } from '../models/sourceApplications';
import { CreateOrderRequest, ServerTransaction } from '../gateways/gatewayTypes';

export const paymentRouter = Router();

const worldlineAdapter = new WorldlinePaynimoAdapter();
const ccavenueAdapter = new CCAvenueAdapter();
const hdfcCollectNowAdapter = new HDFCCollectNowAdapter();

/**
 * 1. GET /api/gateways/status
 * Returns real-time configuration status for all supported gateways
 */
paymentRouter.get('/gateways/status', (_req: Request, res: Response) => {
  const worldlineStatus = worldlineAdapter.getStatus();
  const collectNowStatus = hdfcCollectNowAdapter.getStatus();
  // If HDFC Collect Now has active test credentials, report it as the primary HDFC engine
  const ccavenueStatus = collectNowStatus.canProcessLiveSandbox ? collectNowStatus : ccavenueAdapter.getStatus();

  const simulatorStatus = {
    id: 'DEMO_SIMULATOR',
    name: 'Demo Simulator (Phase 1)',
    environment: 'simulated',
    status: 'CONFIGURED',
    statusLabel: 'Demo Simulator Ready',
    canProcessLiveSandbox: false,
    configuredDetails: {
      testCredentialsHint: 'Interactive presentation simulator (Success, Failed, Pending, Cancelled)',
    },
    missingEnvVars: [],
  };

  res.json({
    gateways: {
      WORLDLINE_PAYNIMO: worldlineStatus,
      CCAVENUE: ccavenueStatus,
      DEMO_SIMULATOR: simulatorStatus,
    },
    serverTime: new Date().toISOString(),
    environmentMode: 'SANDBOX_ONLY',
  });
});

/**
 * 2. POST /api/payments/create-order
 * Validates order inputs, checks currency, sets up server order
 */
paymentRouter.post('/payments/create-order', (req: Request, res: Response): any => {
  const body: CreateOrderRequest = req.body;

  if (!body.applicationCode || !body.applicantName || !body.totalAmount) {
    return res.status(400).json({ error: 'Missing required order fields' });
  }

  if (body.totalAmount <= 0) {
    return res.status(400).json({ error: 'Order amount must be greater than zero' });
  }

  // Registry amount rules validation
  const app = sourceApplicationRegistry.getBySourceCode(body.applicationCode);
  if (app) {
    const purpose = body.courseOrEvent || body.feeDescription || 'REGISTRATION_FEE';
    const amountPaise = Math.round(body.totalAmount * 100);
    const amountVal = sourceApplicationRegistry.validateAmount(app, purpose, amountPaise);
    if (!amountVal.valid) {
      return res.status(400).json({ error: amountVal.reason || 'Amount validation failed' });
    }
  }

  const now = new Date().toISOString();
  const dateStr = now.slice(0, 10).replace(/-/g, '');
  const randNum = Math.floor(10000 + Math.random() * 90000);
  const txnId = `TXN-${dateStr}-${randNum}`;
  const orderId = `ORD-AIMA-${body.applicationCode}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Determine gateway amount (actual total fee for real payment processing)
  let gatewayAmount = body.totalAmount;

  const isSimulated = body.gateway === 'DEMO_SIMULATOR';

  const transaction: ServerTransaction = {
    id: txnId,
    orderId: orderId,
    applicationId: body.applicationId,
    applicationCode: body.applicationCode,
    applicationName: body.applicationName,
    applicationRef: body.applicationRef,
    applicantName: body.applicantName,
    applicantEmail: body.applicantEmail,
    applicantPhone: body.applicantPhone,
    courseOrEvent: body.courseOrEvent,
    feeDescription: body.feeDescription,
    baseAmount: body.baseAmount,
    gstAmount: body.gstAmount,
    totalAmount: body.totalAmount,
    gatewayAmount: gatewayAmount,
    currency: 'INR',
    gateway: body.gateway,
    gatewayEnvironment: isSimulated ? 'simulated' : 'sandbox',
    isSimulated: isSimulated,
    status: 'PENDING',
    createdAt: now,
    idempotencyKey: `IDEM-${txnId}`,
    callbackDelivered: false,
    auditTrail: [
      {
        step: 'Order Created',
        timestamp: now,
        detail: `Server order ${orderId} created for ${body.applicationCode} (${body.applicationRef}). Nominal: ₹${body.totalAmount}, Gateway: ${body.gateway} (Test Charge: ₹${gatewayAmount.toFixed(2)})`,
        status: 'ok',
      },
    ],
  };

  serverTransactionStore.save(transaction);

  res.json({
    success: true,
    transaction,
  });
});

/**
 * 3. POST /api/payments/worldline/initiate
 * Generates signed payload for Paynimo Checkout (checkout.js)
 */
paymentRouter.post('/payments/worldline/initiate', (req: Request, res: Response): any => {
  const { transactionId } = req.body;
  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId is required' });
  }

  const txn = serverTransactionStore.getById(transactionId);
  if (!txn) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  // App URL resolution (Cloud Run / dev server)
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

  try {
    const payload = worldlineAdapter.prepareCheckoutPayload(txn, appUrl);
    
    // Add audit step
    txn.auditTrail.push({
      step: 'Worldline Payload Generated',
      timestamp: new Date().toISOString(),
      detail: `Generated SHA-256 token for Merchant ${payload.consumerData.merchantId}, Scheme ${payload.consumerData.items[0].itemId}, Amount ₹${payload.consumerData.items[0].amount}`,
      status: 'ok',
    });
    serverTransactionStore.save(txn);

    res.json({
      success: true,
      payload,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * 4. POST /api/payments/worldline/callback
 * Handles webhook & browser return from Worldline Paynimo
 */
paymentRouter.post('/payments/worldline/callback', async (req: Request, res: Response): Promise<any> => {
  const callbackData = req.body;

  // Extract transaction ID from response
  const txnId =
    callbackData?.paymentMethod?.paymentTransaction?.merchantTransactionIdentifier ||
    callbackData?.merchantTxnId ||
    callbackData?.txnId ||
    callbackData?.consumerData?.txnId;

  if (!txnId) {
    return res.status(400).json({ error: 'Missing merchantTransactionIdentifier in callback' });
  }

  const existingTxn = serverTransactionStore.getById(txnId);
  if (!existingTxn) {
    return res.status(404).json({ error: `Transaction ${txnId} not found` });
  }

  // Idempotency check: If callback for this transaction was already processed into a terminal state, return existing
  const idempotencyKey = `WL-CB-${txnId}-${callbackData?.paymentMethod?.paymentTransaction?.identifier || 'DIRECT'}`;
  if (serverTransactionStore.isCallbackProcessed(idempotencyKey) && existingTxn.status !== 'PENDING') {
    return res.json({
      success: true,
      idempotent: true,
      message: 'Duplicate callback ignored; transaction already verified',
      transaction: existingTxn,
    });
  }

  // Verify response
  const verification = worldlineAdapter.verifyResponse(callbackData);

  // Update verified transaction
  const updatedTxn = await serverTransactionStore.updateVerifiedGatewayTransaction(txnId, {
    status: verification.status,
    statusReason: verification.statusReason,
    bankReference: verification.bankReference,
    authCode: verification.authCode,
    gatewayTransactionId: verification.gatewayTransactionId,
    gatewayStatusCode: verification.gatewayStatusCode,
    paymentMode: verification.paymentMode,
    bankName: verification.bankName,
    verificationMethod: 'HASH_VALIDATION',
  });

  serverTransactionStore.markCallbackProcessed(idempotencyKey);

  if (verification.status === 'SUCCESS') {
    const session = paymentSessionStore.getByOrderId(updatedTxn.orderId);
    if (session) {
      paymentSessionStore.markCompleted(session.sessionToken);
    }
  }

  res.json({
    success: true,
    transaction: updatedTxn,
  });
});

/**
 * 4b. POST /api/payments/hdfc-collectnow/create-order
 * Creates an official order on HDFC Bank Collect Now (Razorpay API)
 */
paymentRouter.post('/payments/hdfc-collectnow/create-order', async (req: Request, res: Response): Promise<any> => {
  const { transactionId } = req.body;
  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId is required' });
  }

  const txn = serverTransactionStore.getById(transactionId);
  if (!txn) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  try {
    const orderData = await hdfcCollectNowAdapter.createOrder(txn);

    txn.gatewayTransactionId = orderData.orderId;
    txn.auditTrail.push({
      step: 'HDFC Collect Now Order Created',
      timestamp: new Date().toISOString(),
      detail: `Created Razorpay order ${orderData.orderId} for MID ${orderData.mid}. Amount: ₹${(orderData.amount / 100).toFixed(2)} (in paise: ${orderData.amount})`,
      status: 'ok',
    });
    serverTransactionStore.save(txn);

    res.json({
      success: true,
      order: orderData,
      transaction: txn,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * 4c. POST /api/payments/hdfc-collectnow/verify
 * Verifies payment signature and marks transaction completed
 */
paymentRouter.post('/payments/hdfc-collectnow/verify', async (req: Request, res: Response): Promise<any> => {
  const { transactionId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!transactionId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing required verification parameters' });
  }

  const txn = serverTransactionStore.getById(transactionId);
  if (!txn) {
    return res.status(404).json({ error: `Transaction ${transactionId} not found` });
  }

  const verification = await hdfcCollectNowAdapter.verifyPayment({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
    expectedAmountPaise: Math.round(txn.totalAmount * 100),
  });

  const updatedTxn = await serverTransactionStore.updateVerifiedGatewayTransaction(txn.id, {
    status: verification.status,
    statusReason: verification.statusReason,
    bankReference: verification.bankReference,
    authCode: verification.authCode,
    gatewayTransactionId: verification.gatewayTransactionId,
    gatewayStatusCode: verification.status === 'SUCCESS' ? 'captured' : 'failed',
    paymentMode: verification.paymentMode || 'NetBanking',
    bankName: verification.bankName || 'HDFC Bank',
    verificationMethod: 'HASH_VALIDATION',
  });

  if (verification.status === 'SUCCESS') {
    const session = paymentSessionStore.getByOrderId(txn.orderId);
    if (session) {
      paymentSessionStore.markCompleted(session.sessionToken);
    }
  }

  res.json({
    success: true,
    transaction: updatedTxn,
  });
});

/**
 * 4d. POST /api/payments/hdfc-collectnow/cancel
 * Handles candidate modal dismissal / abort
 */
paymentRouter.post('/payments/hdfc-collectnow/cancel', async (req: Request, res: Response): Promise<any> => {
  const { transactionId, reason } = req.body;
  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId is required' });
  }

  const txn = serverTransactionStore.getById(transactionId);
  if (!txn) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const updatedTxn = await serverTransactionStore.updateVerifiedGatewayTransaction(txn.id, {
    status: 'CANCELLED',
    statusReason: reason || 'Customer dismissed checkout modal before completing payment',
    verificationMethod: 'HASH_VALIDATION',
  });

  res.json({
    success: true,
    transaction: updatedTxn,
  });
});

/**
 * 4e. ALL /api/payments/hdfc-collectnow/callback
 * Handles direct POST/GET callback from HDFC Collect Now Embedded Checkout
 * (https://api.razorpay.com/v1/checkout/embedded POSTs back to this URL)
 */
paymentRouter.all(['/payments/hdfc-collectnow/callback', '/payments/hdfc-collectnow/callback/'], async (req: Request, res: Response): Promise<any> => {
  const body = req.body || {};
  const query = req.query || {};

  // Extract payment/order identifiers from multiple potential payload locations
  const razorpay_order_id =
    body.razorpay_order_id ||
    body?.error?.metadata?.order_id ||
    body?.['error[metadata][order_id]'] ||
    (query.order_id as string) ||
    (query.orderId as string) ||
    (query.razorpay_order_id as string) ||
    '';

  const razorpay_payment_id =
    body.razorpay_payment_id ||
    body?.error?.metadata?.payment_id ||
    body?.['error[metadata][payment_id]'] ||
    (query.payment_id as string) ||
    (query.razorpay_payment_id as string) ||
    '';

  const razorpay_signature =
    body.razorpay_signature ||
    (query.razorpay_signature as string) ||
    '';

  const tokenParam = ((query.token as string) || (query['amp;token'] as string) || body.token || '').trim();
  const transactionId = (
    (query.transactionId as string) ||
    (query['amp;transactionId'] as string) ||
    body.transactionId ||
    body['notes[transaction_id]'] ||
    body?.notes?.transaction_id ||
    ''
  ).trim();
  const rawTargetReturnUrl = ((query.returnUrl as string) || (query['amp;returnUrl'] as string) || (body.returnUrl as string) || '').trim();

  // Extract error / failure messages from Razorpay
  const errorObj = body.error || {};
  const errorCode = errorObj.code || body['error[code]'] || (query.error_code as string) || '';
  const errorDescription =
    errorObj.description ||
    body['error[description]'] ||
    errorObj.reason ||
    body['error[reason]'] ||
    (query.error_description as string) ||
    (query.reason as string) ||
    '';

  // Determine if this is a failure/cancellation or success
  const isFailure = Boolean(errorCode || errorDescription || (!razorpay_signature && !razorpay_payment_id));

  // Find transaction across multiple lookup strategies
  let txn: ServerTransaction | undefined;
  if (transactionId) {
    txn = await serverTransactionStore.fetchById(transactionId);
  }
  if (!txn && tokenParam) {
    txn = await serverTransactionStore.fetchBySessionToken(tokenParam);
  }
  if (!txn && razorpay_order_id) {
    txn = await serverTransactionStore.fetchByOrderId(razorpay_order_id);
  }
  if (!txn && razorpay_order_id) {
    txn = serverTransactionStore.getAll().find(
      (t) => t.gatewayTransactionId === razorpay_order_id || t.orderId === razorpay_order_id
    );
  }

  // Resolve session if possible
  let session = txn ? paymentSessionStore.getByOrderId(txn.orderId) : undefined;
  if (!session && tokenParam) {
    session = paymentSessionStore.getAnyByToken(tokenParam);
  }
  if (!session && txn?.applicationRef) {
    session = paymentSessionStore.findActivePending(txn.applicationCode, txn.applicationRef) ||
              paymentSessionStore.getAll().find(
                (s) => s.sourceCode === txn?.applicationCode && s.applicationReference === txn?.applicationRef
              );
  }

  const targetReturnUrl = rawTargetReturnUrl || session?.returnUrl || txn?.returnUrl || 'https://research.aima.in/registration';

  const renderRedirectHtml = (redirectUrl: string, title: string, subtitle: string, isSuccess: boolean) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url=${redirectUrl}">
  <title>${title} - Redirecting...</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; text-align: center; }
    .card { background: white; padding: 2.5rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 420px; width: 90%; }
    .spinner { width: 40px; height: 40px; border: 3px solid #e2e8f0; border-top-color: ${isSuccess ? '#10b981' : '#ef4444'}; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1.25rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { margin: 0 0 0.5rem; font-size: 1.25rem; color: ${isSuccess ? '#065f46' : '#991b1b'}; font-weight: 700; }
    p { margin: 0 0 1.5rem; color: #64748b; font-size: 0.875rem; line-height: 1.5; }
    a { display: inline-block; padding: 0.75rem 1.5rem; background: ${isSuccess ? '#002b49' : '#b91c1c'}; color: white; text-decoration: none; border-radius: 0.5rem; font-weight: 600; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>${title}</h2>
    <p>${subtitle}</p>
    <a href="${redirectUrl}">Click here if not redirected automatically</a>
  </div>
  <script>
    window.location.replace(${JSON.stringify(redirectUrl)});
  </script>
</body>
</html>`;

  // === HANDLE FAILURE OR CANCELLED PAYMENT ===
  if (isFailure || !razorpay_signature) {
    const failureReason = errorDescription || 'Payment declined or cancelled by candidate';
    console.warn(`[HDFC Collect Now Callback] Payment failure recorded for order ${razorpay_order_id || txn?.orderId || 'unknown'}: ${failureReason}`);

    if (txn) {
      await serverTransactionStore.updateVerifiedGatewayTransaction(txn.id, {
        status: 'FAILED',
        statusReason: failureReason,
        gatewayStatusCode: 'failed',
        gatewayTransactionId: razorpay_payment_id || txn.gatewayTransactionId || razorpay_order_id,
        verificationMethod: 'HASH_VALIDATION',
      });
    }

    let finalUrl = targetReturnUrl;
    try {
      const returnUrlObj = new URL(targetReturnUrl);
      if (txn) {
        returnUrlObj.searchParams.set('orderId', txn.orderId);
        returnUrlObj.searchParams.set('transactionId', txn.id);
        returnUrlObj.searchParams.set('reference', txn.applicationRef);
      }
      returnUrlObj.searchParams.set('status', 'FAILED');
      returnUrlObj.searchParams.set('reason', failureReason);
      if (razorpay_payment_id) {
        returnUrlObj.searchParams.set('paymentId', razorpay_payment_id);
      }
      finalUrl = returnUrlObj.toString();
    } catch {
      const sep = targetReturnUrl.includes('?') ? '&' : '?';
      finalUrl = `${targetReturnUrl}${sep}status=FAILED&reason=${encodeURIComponent(failureReason)}${txn ? `&orderId=${encodeURIComponent(txn.orderId)}&reference=${encodeURIComponent(txn.applicationRef)}` : ''}`;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(renderRedirectHtml(finalUrl, 'Payment Not Completed', 'Redirecting you back to your application...', false));
  }

  // === HANDLE SUCCESSFUL PAYMENT ===
  const verification = await hdfcCollectNowAdapter.verifyPayment({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
    expectedAmountPaise: txn ? Math.round(txn.totalAmount * 100) : undefined,
  });

  if (txn) {
    await serverTransactionStore.updateVerifiedGatewayTransaction(txn.id, {
      status: verification.status,
      statusReason: verification.statusReason,
      bankReference: verification.bankReference,
      authCode: verification.authCode,
      gatewayTransactionId: verification.gatewayTransactionId,
      gatewayStatusCode: verification.status === 'SUCCESS' ? 'captured' : 'failed',
      paymentMode: verification.paymentMode || 'NetBanking',
      bankName: verification.bankName || 'HDFC Bank',
      verificationMethod: 'HASH_VALIDATION',
    });
  }

  try {
    if (session && verification.status === 'SUCCESS') {
      paymentSessionStore.markCompleted(session.sessionToken);
    } else if (tokenParam && verification.status === 'SUCCESS') {
      paymentSessionStore.markCompleted(tokenParam);
    }
  } catch (err) {
    console.warn('[PaymentRoutes] Session completion notice:', err);
  }

  let finalUrl = targetReturnUrl;
  try {
    const returnUrlObj = new URL(targetReturnUrl);
    if (txn) {
      returnUrlObj.searchParams.set('orderId', txn.orderId);
      returnUrlObj.searchParams.set('transactionId', txn.id);
      returnUrlObj.searchParams.set('reference', txn.applicationRef);
    }
    returnUrlObj.searchParams.set('status', verification.status);
    returnUrlObj.searchParams.set('paymentId', razorpay_payment_id);
    if (txn) {
      returnUrlObj.searchParams.set('amount', String(txn.totalAmount));
    }
    if (verification.status !== 'SUCCESS') {
      returnUrlObj.searchParams.set('reason', verification.statusReason);
    }
    finalUrl = returnUrlObj.toString();
  } catch {
    const sep = targetReturnUrl.includes('?') ? '&' : '?';
    finalUrl = `${targetReturnUrl}${sep}status=${verification.status}&paymentId=${encodeURIComponent(razorpay_payment_id)}${txn ? `&orderId=${encodeURIComponent(txn.orderId)}&reference=${encodeURIComponent(txn.applicationRef)}&amount=${encodeURIComponent(String(txn.totalAmount))}` : ''}${verification.status !== 'SUCCESS' ? `&reason=${encodeURIComponent(verification.statusReason)}` : ''}`;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(renderRedirectHtml(finalUrl, verification.status === 'SUCCESS' ? 'Payment Successful' : 'Payment Completed', 'Redirecting you back to your application...', verification.status === 'SUCCESS'));
});

/**
 * 5. POST /api/payments/ccavenue/initiate
 * Handles CCAvenue sandbox initiation
 */
paymentRouter.post('/payments/ccavenue/initiate', (req: Request, res: Response): any => {
  const { transactionId } = req.body;
  const txn = serverTransactionStore.getById(transactionId);
  if (!txn) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

  try {
    const payload = ccavenueAdapter.preparePaymentRequest(txn, appUrl);
    
    txn.auditTrail.push({
      step: 'CCAvenue Payload Generated',
      timestamp: new Date().toISOString(),
      detail: `Generated AES-128-CBC cipher for Merchant ${payload.merchantId}, TID ${payload.tid}, Order ${txn.orderId}`,
      status: 'ok',
    });
    serverTransactionStore.save(txn);

    res.json({
      success: true,
      payload,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message,
      statusLabel: 'Sandbox configuration required',
    });
  }
});

/**
 * 6. POST /api/payments/ccavenue/callback
 * Handles CCAvenue encrypted return
 */
paymentRouter.post('/payments/ccavenue/callback', async (req: Request, res: Response): Promise<any> => {
  const { encResp, orderNo } = req.body;
  if (!encResp) {
    return res.status(400).json({ error: 'encResp is required' });
  }

  const verification = ccavenueAdapter.verifyResponse(encResp);
  if (!verification.isValid || !verification.orderId) {
    return res.status(400).json({ error: verification.statusReason });
  }

  const txn = serverTransactionStore.getByOrderId(verification.orderId);
  if (!txn) {
    return res.status(404).json({ error: `Order ${verification.orderId} not found` });
  }

  // Idempotency check
  const idempotencyKey = `CC-CB-${txn.id}-${verification.gatewayTransactionId || 'DIRECT'}`;
  if (serverTransactionStore.isCallbackProcessed(idempotencyKey) && txn.status !== 'PENDING') {
    return res.json({
      success: true,
      idempotent: true,
      message: 'Duplicate callback ignored; transaction already verified',
      transaction: txn,
    });
  }

  const updatedTxn = await serverTransactionStore.updateVerifiedGatewayTransaction(txn.id, {
    status: verification.status,
    statusReason: verification.statusReason,
    bankReference: verification.bankReference,
    authCode: verification.authCode,
    gatewayTransactionId: verification.gatewayTransactionId,
    gatewayStatusCode: verification.gatewayStatusCode,
    paymentMode: verification.paymentMode || 'NetBanking',
    bankName: verification.bankName || 'HDFC Bank',
    verificationMethod: 'AES_DECRYPTION',
  });

  serverTransactionStore.markCallbackProcessed(idempotencyKey);

  if (verification.status === 'SUCCESS') {
    const session = paymentSessionStore.getByOrderId(txn.orderId);
    if (session) {
      paymentSessionStore.markCompleted(session.sessionToken);
    }
  }

  res.json({
    success: true,
    transaction: updatedTxn,
  });
});

/**
 * 6b. POST /api/payments/ccavenue/encrypt-test-response
 * Generates genuinely AES-128-CBC encrypted test callback ciphertext using workingKey
 */
paymentRouter.post('/payments/ccavenue/encrypt-test-response', (req: Request, res: Response): any => {
  const { orderId, status = 'Success', bankRef, trackingId, authCode, paymentMode = 'NetBanking', bankName = 'HDFC Bank', amount = '2.00' } = req.body;
  
  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required' });
  }

  try {
    const params = new URLSearchParams({
      order_id: orderId,
      order_status: status,
      amount: amount,
      currency: 'INR',
      tracking_id: trackingId || `${Math.floor(310000000000 + Math.random() * 90000000000)}`,
      bank_ref_no: bankRef || `HDFC${Math.floor(100000 + Math.random() * 900000)}`,
      auth_code: authCode || `AUTH-HDFC-${Math.floor(1000 + Math.random() * 9000)}`,
      payment_mode: paymentMode,
      card_name: bankName,
      status_message: status === 'Success' ? 'Transaction Successful' : status === 'Aborted' ? 'Transaction Cancelled' : 'Payment Failed',
      status_code: status === 'Success' ? '00' : '99',
    });

    const encResp = ccavenueAdapter.encrypt(params.toString());
    res.json({
      success: true,
      encResp,
      plainSnippet: params.toString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7. GET /api/payments/status/:id
 * Status inquiry endpoint
 */
paymentRouter.get('/payments/status/:id', (req: Request, res: Response): any => {
  const txn = serverTransactionStore.getById(req.params.id);
  if (!txn) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  res.json({ transaction: txn });
});

/**
 * 8. GET /api/transactions
 * Returns list of persistent transactions synced with Supabase
 */
paymentRouter.get('/transactions', async (_req: Request, res: Response) => {
  const transactions = await serverTransactionStore.fetchAll();
  res.json({
    transactions,
  });
});

/**
 * 9. POST /api/transactions/record-simulator
 * Handles recording Phase 1 simulated outcomes with strict guardrails
 */
paymentRouter.post('/transactions/record-simulator', (req: Request, res: Response): any => {
  const body = req.body;
  const existing = serverTransactionStore.getById(body.id);

  // Guardrail: Simulator controls must NEVER override a genuine gateway record!
  if (existing && !existing.isSimulated) {
    return res.status(403).json({
      error: 'Cannot overwrite genuine sandbox gateway transaction with simulated outcome',
    });
  }

  const now = new Date().toISOString();
  const simulatedTxn: ServerTransaction = {
    ...body,
    isSimulated: true,
    gatewayEnvironment: 'simulated',
    verificationMethod: 'SIMULATED',
    completedAt: body.status !== 'PENDING' ? now : undefined,
    verifiedAt: body.status !== 'PENDING' ? now : undefined,
  };

  serverTransactionStore.save(simulatedTxn);

  res.json({
    success: true,
    transaction: simulatedTxn,
  });
});

/**
 * 10. POST /api/transactions/reset
 * Resets demo data
 */
paymentRouter.post('/transactions/reset', (_req: Request, res: Response) => {
  serverTransactionStore.resetDemoData();
  res.json({
    success: true,
    transactions: serverTransactionStore.getAll(),
  });
});
