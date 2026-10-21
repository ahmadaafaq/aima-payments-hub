import { Router, Request, Response } from 'express';
import { WorldlinePaynimoAdapter } from '../gateways/worldlinePaynimo';
import { CCAvenueAdapter } from '../gateways/ccavenue';
import { HDFCCollectNowAdapter } from '../gateways/hdfcCollectNow';
import { serverTransactionStore } from '../services/transactionStore';
import { paymentSessionStore } from '../models/paymentSessions';
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
paymentRouter.post('/payments/worldline/callback', (req: Request, res: Response): any => {
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
  const updatedTxn = serverTransactionStore.updateVerifiedGatewayTransaction(txnId, {
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
  });

  const updatedTxn = serverTransactionStore.updateVerifiedGatewayTransaction(txn.id, {
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
paymentRouter.post('/payments/hdfc-collectnow/cancel', (req: Request, res: Response): any => {
  const { transactionId, reason } = req.body;
  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId is required' });
  }

  const txn = serverTransactionStore.getById(transactionId);
  if (!txn) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const updatedTxn = serverTransactionStore.updateVerifiedGatewayTransaction(txn.id, {
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
 * 4e. POST /api/payments/hdfc-collectnow/callback
 * Handles direct POST callback from HDFC Collect Now Embedded Checkout
 * (https://api.razorpay.com/v1/checkout/embedded POSTs back to this URL)
 */
paymentRouter.post('/payments/hdfc-collectnow/callback', async (req: Request, res: Response): Promise<any> => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).send('Missing required payment parameters from HDFC Collect Now callback.');
  }

  // Find transaction by gatewayTransactionId (order_id) or orderId
  const allTxns = serverTransactionStore.getAll();
  const txn = allTxns.find(
    (t) => t.gatewayTransactionId === razorpay_order_id || t.orderId === razorpay_order_id
  );

  if (!txn) {
    return res.status(404).send(`Order ${razorpay_order_id} not found in transaction ledger.`);
  }

  const verification = await hdfcCollectNowAdapter.verifyPayment({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  const updatedTxn = serverTransactionStore.updateVerifiedGatewayTransaction(txn.id, {
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

  // Resolve session: try by orderId, by query token, or by reference
  const tokenParam = (req.query.token as string) || '';
  let session = paymentSessionStore.getByOrderId(txn.orderId);
  if (!session && tokenParam) {
    session = paymentSessionStore.getAnyByToken(tokenParam);
  }
  if (!session && txn.applicationRef) {
    session = paymentSessionStore.findActivePending(txn.applicationCode, txn.applicationRef) ||
              paymentSessionStore.getAll().find(
                (s) => s.sourceCode === txn.applicationCode && s.applicationReference === txn.applicationRef
              );
  }

  if (session && verification.status === 'SUCCESS') {
    paymentSessionStore.markCompleted(session.sessionToken);
  }

  const targetReturnUrl = (req.query.returnUrl as string) || session?.returnUrl;

  // If targetReturnUrl is available, redirect directly back to originating app
  if (targetReturnUrl) {
    try {
      const returnUrlObj = new URL(targetReturnUrl);
      returnUrlObj.searchParams.set('orderId', txn.orderId);
      returnUrlObj.searchParams.set('transactionId', txn.id);
      returnUrlObj.searchParams.set('status', verification.status);
      returnUrlObj.searchParams.set('reference', txn.applicationRef);
      returnUrlObj.searchParams.set('paymentId', razorpay_payment_id);
      return res.redirect(returnUrlObj.toString());
    } catch {
      const sep = targetReturnUrl.includes('?') ? '&' : '?';
      return res.redirect(
        `${targetReturnUrl}${sep}orderId=${encodeURIComponent(txn.orderId)}&transactionId=${encodeURIComponent(txn.id)}&status=${verification.status}&reference=${encodeURIComponent(txn.applicationRef)}&paymentId=${encodeURIComponent(razorpay_payment_id)}`
      );
    }
  }

  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  return res.redirect(`${appUrl}/?orderId=${encodeURIComponent(txn.orderId)}&status=${verification.status}`);
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
paymentRouter.post('/payments/ccavenue/callback', (req: Request, res: Response): any => {
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

  const updatedTxn = serverTransactionStore.updateVerifiedGatewayTransaction(txn.id, {
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
 * Returns list of persistent transactions
 */
paymentRouter.get('/transactions', (_req: Request, res: Response) => {
  res.json({
    transactions: serverTransactionStore.getAll(),
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
