export type GatewayType = 'WORLDLINE_PAYNIMO' | 'CCAVENUE' | 'DEMO_SIMULATOR';

export type GatewayConfigStatus = 
  | 'CONFIGURED' 
  | 'INCOMPLETE' 
  | 'CONFIG_REQUIRED' 
  | 'INTEGRATION_ERROR';

export interface GatewayStatusInfo {
  id: GatewayType;
  name: string;
  environment: 'sandbox' | 'production' | 'simulated';
  status: GatewayConfigStatus;
  statusLabel: string;
  canProcessLiveSandbox: boolean;
  blockerDetails?: string;
  configuredDetails?: {
    merchantId?: string;
    schemeCode?: string;
    tid?: string;
    endpointsVerified?: boolean;
    testAmountLimits?: string;
    testCredentialsHint?: string;
  };
  missingEnvVars: string[];
}

export interface CreateOrderRequest {
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
  gateway: GatewayType;
  portalUrl: string;
}

export interface ServerTransaction {
  id: string; // TXN-...
  orderId: string; // ORD-...
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
  totalAmount: number; // nominal amount
  gatewayAmount: number; // actual amount charged at gateway (e.g., scaled to ₹2 for sandbox)
  currency: string;
  gateway: GatewayType;
  gatewayEnvironment: 'sandbox' | 'simulated';
  isSimulated: boolean;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED';
  statusReason?: string;
  bankReference?: string;
  authCode?: string;
  paymentMode?: string;
  bankName?: string;
  gatewayTransactionId?: string;
  gatewayStatusCode?: string;
  createdAt: string;
  completedAt?: string;
  verifiedAt?: string;
  verificationMethod?: 'HASH_VALIDATION' | 'DUAL_VERIFICATION_API' | 'SIMULATED' | 'AES_DECRYPTION';
  idempotencyKey: string;
  callbackDelivered: boolean;
  callbackResponse?: {
    httpStatus: number;
    deliveredAt: string;
    targetUrl: string;
    payloadSnippet: string;
  };
  sessionToken?: string;
  returnUrl?: string;
  externalOrderId?: string;
  paymentPurpose?: string;
  auditTrail: {
    step: string;
    timestamp: string;
    detail: string;
    status: 'ok' | 'fail' | 'warn' | 'info';
  }[];
}
