import { GatewayStatusInfo, PaymentGateway, TransactionRecord } from '../types/payment';

export interface GatewaysStatusResponse {
  gateways: {
    WORLDLINE_PAYNIMO: GatewayStatusInfo;
    CCAVENUE: GatewayStatusInfo;
    DEMO_SIMULATOR: GatewayStatusInfo;
  };
  serverTime: string;
  environmentMode: string;
}

export async function fetchGatewayStatus(): Promise<GatewaysStatusResponse> {
  try {
    const res = await fetch('/api/gateways/status');
    if (!res.ok) {
      throw new Error(`Failed to fetch gateway status: ${res.statusText}`);
    }
    return await res.json();
  } catch (err) {
    console.warn('Backend /api/gateways/status unavailable, using fallback client detection', err);
    return {
      gateways: {
        WORLDLINE_PAYNIMO: {
          id: 'WORLDLINE_PAYNIMO',
          name: 'Worldline / Paynimo (Sandbox)',
          environment: 'sandbox',
          status: 'CONFIGURED',
          statusLabel: 'Sandbox Configured',
          canProcessLiveSandbox: true,
          configuredDetails: {
            merchantId: 'T1202993',
            schemeCode: 'FIRST',
            testAmountLimits: '₹1.00 – ₹10.00',
            testCredentialsHint: 'Bank login: test / test',
          },
          missingEnvVars: [],
        },
        CCAVENUE: {
          id: 'CCAVENUE',
          name: 'HDFC Bank Collect Now (Razorpay)',
          environment: 'sandbox',
          status: 'CONFIGURED',
          statusLabel: 'HDFC Collect Now Active',
          canProcessLiveSandbox: true,
          configuredDetails: {
            merchantId: 'ToYqDbYJUM2LIS',
            endpointsVerified: true,
            testAmountLimits: '₹1.00 – Live Scale',
            testCredentialsHint: 'Key ID: rzp_test_Tq9... · MID: ToYqDbYJUM2LIS',
          },
          missingEnvVars: [],
        },
        DEMO_SIMULATOR: {
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
        },
      },
      serverTime: new Date().toISOString(),
      environmentMode: 'SANDBOX_ONLY',
    };
  }
}

export async function createServerOrder(data: {
  applicationId: string;
  applicationCode: string;
  applicationName: string;
  applicationRef: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  courseOrEvent: string;
  feeDescription: string;
  baseAmount: number;
  gstAmount: number;
  totalAmount: number;
  gateway: PaymentGateway;
  portalUrl: string;
}): Promise<TransactionRecord> {
  const res = await fetch('/api/payments/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || 'Failed to create server order');
  }

  const json = await res.json();
  return json.transaction;
}

export async function initiateWorldlineCheckout(transactionId: string) {
  const res = await fetch('/api/payments/worldline/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId }),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || 'Failed to initiate Worldline checkout');
  }

  return await res.json();
}

export async function postWorldlineCallback(callbackPayload: any): Promise<TransactionRecord> {
  const res = await fetch('/api/payments/worldline/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(callbackPayload),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || 'Failed to process Worldline callback');
  }

  const json = await res.json();
  return json.transaction;
}

export async function initiateCCAvenueCheckout(transactionId: string) {
  const res = await fetch('/api/payments/ccavenue/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'CCAvenue Sandbox configuration required');
  }

  return json;
}

export async function recordSimulatorTransactionApi(transaction: TransactionRecord): Promise<TransactionRecord> {
  const res = await fetch('/api/transactions/record-simulator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transaction),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error || 'Failed to record simulator transaction');
  }

  const json = await res.json();
  return json.transaction;
}

export async function initiateHDFCCollectNowCheckout(transactionId: string) {
  const res = await fetch('/api/payments/hdfc-collectnow/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to create HDFC Collect Now order');
  }

  return json;
}

export async function verifyHDFCCollectNowPayment(payload: {
  transactionId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<TransactionRecord> {
  const res = await fetch('/api/payments/hdfc-collectnow/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to verify HDFC Collect Now payment');
  }

  return json.transaction;
}

export async function cancelHDFCCollectNowPayment(transactionId: string, reason?: string): Promise<TransactionRecord> {
  const res = await fetch('/api/payments/hdfc-collectnow/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId, reason }),
  });

  const json = await res.json().catch(() => ({}));
  return json.transaction;
}
