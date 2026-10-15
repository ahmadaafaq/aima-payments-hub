export type PaymentGateway = 'WORLDLINE_PAYNIMO' | 'CCAVENUE' | 'DEMO_SIMULATOR';

export type PaymentStatus = 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED';

export type GatewayConfigStatus = 
  | 'CONFIGURED' 
  | 'INCOMPLETE' 
  | 'CONFIG_REQUIRED' 
  | 'INTEGRATION_ERROR';

export interface GatewayStatusInfo {
  id: PaymentGateway;
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

export interface ApplicantPreset {
  name: string;
  refNo: string;
  email: string;
  phone: string;
  courseOrEvent: string;
  feeDescription: string;
  baseAmount: number;
  gstAmount: number;
  totalAmount: number;
}

export interface AimaApplication {
  id: string;
  code: string;
  name: string;
  tagline: string;
  category: 'Academics' | 'Exams' | 'Corporate' | 'Affiliation' | 'Events';
  description: string;
  portalUrl: string;
  accentColor: string;
  gstApplicable: boolean;
  sampleApplicants: ApplicantPreset[];
}

export interface AuditStep {
  step: string;
  timestamp: string;
  detail: string;
  status: 'ok' | 'fail' | 'warn' | 'info';
}

export interface TransactionRecord {
  id: string; // e.g. TXN-20261015-88219
  orderId: string; // e.g. ORD-AIMA-MAT-7721
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
  gatewayAmount: number; // actual gateway charge (e.g. ₹2.00 for test)
  currency?: string;
  gateway: PaymentGateway;
  gatewayEnvironment: 'sandbox' | 'simulated';
  isSimulated: boolean;
  gatewayTid?: string;
  gatewayAcctId?: string;
  status: PaymentStatus;
  statusReason?: string;
  bankReference?: string;
  authCode?: string;
  paymentMode: string;
  bankName?: string;
  gatewayTransactionId?: string;
  gatewayStatusCode?: string;
  createdAt: string;
  completedAt?: string;
  verifiedAt?: string;
  verificationMethod?: 'HASH_VALIDATION' | 'DUAL_VERIFICATION_API' | 'SIMULATED' | 'AES_DECRYPTION';
  auditTrail: AuditStep[];
  callbackDelivered: boolean;
  callbackResponse?: {
    httpStatus: number;
    deliveredAt: string;
    targetUrl: string;
    payloadSnippet: string;
  };
}
