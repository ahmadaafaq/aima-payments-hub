import crypto from 'crypto';
import { GatewayStatusInfo, ServerTransaction } from './gatewayTypes';

export class CCAvenueAdapter {
  constructor() {}

  public getEnvironment(): 'sandbox' | 'production' | 'simulated' {
    const env = (process.env.CCAVENUE_ENVIRONMENT || 'sandbox').toLowerCase();
    if (env === 'production') return 'production';
    if (env === 'simulated') return 'simulated';
    return 'sandbox';
  }

  public getMerchantId(): string {
    return process.env.CCAVENUE_MERCHANT_ID || '';
  }

  public getAccessCode(): string {
    return process.env.CCAVENUE_ACCESS_CODE || '';
  }

  public getWorkingKey(): string {
    return process.env.CCAVENUE_WORKING_KEY || '';
  }

  public getTid(): string {
    return process.env.CCAVENUE_TID || '76098022';
  }

  public getPostUrl(): string {
    return (
      process.env.CCAVENUE_POST_URL ||
      'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction'
    );
  }

  public getDoWebTransUrl(): string {
    return (
      process.env.CCAVENUE_DOWEBTRANS_URL ||
      'https://api.ccavenue.com/apis/servlet/DoWebTrans'
    );
  }

  public getBankMid(): string {
    return process.env.CCAVENUE_BANK_MID || '12380772';
  }

  public getMeCode(): string {
    return process.env.CCAVENUE_ME_CODE || 'GPY451';
  }

  public getLegalName(): string {
    return process.env.CCAVENUE_LEGAL_NAME || 'ALL INDIA MANAGEMENT ASSOCIATION';
  }

  public getMcc(): string {
    return process.env.CCAVENUE_MCC || '8220';
  }

  /**
   * Evaluates configuration status of CCAvenue gateway
   */
  public getStatus(): GatewayStatusInfo {
    const env = this.getEnvironment();
    const merchant = this.getMerchantId();
    const access = this.getAccessCode();
    const workingKey = this.getWorkingKey();
    const tid = this.getTid();

    const missing: string[] = [];
    if (!merchant) missing.push('CCAVENUE_MERCHANT_ID');
    if (!access) missing.push('CCAVENUE_ACCESS_CODE');
    if (!workingKey) missing.push('CCAVENUE_WORKING_KEY');

    if (missing.length > 0) {
      return {
        id: 'CCAVENUE',
        name: 'HDFC / CCAvenue (Live Kit)',
        environment: 'sandbox',
        status: 'CONFIG_REQUIRED',
        statusLabel: 'Sandbox configuration required',
        canProcessLiveSandbox: false,
        blockerDetails: `Missing required secret(s): ${missing.join(', ')}. Populate in environment.`,
        configuredDetails: {
          testCredentialsHint: 'Requires test merchant ID, access code & 128-bit working key',
        },
        missingEnvVars: missing,
      };
    }

    return {
      id: 'CCAVENUE',
      name: 'HDFC / CCAvenue (Live Kit Configured)',
      environment: env,
      status: 'CONFIGURED',
      statusLabel: 'Live Kit Configured',
      canProcessLiveSandbox: true,
      configuredDetails: {
        merchantId: merchant,
        tid: tid,
        endpointsVerified: true,
        testCredentialsHint: `HDFC Bank Account: ${merchant} | TID: ${tid} | ME Code: ${this.getMeCode()} | Post: secure.ccavenue.com`,
      },
      missingEnvVars: [],
    };
  }

  /**
   * Official CCAvenue AES-128-CBC encryption method
   * Key: MD5 hash of workingKey
   * IV: \x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f
   */
  public encrypt(plainText: string): string {
    const keyStr = this.getWorkingKey();
    if (!keyStr) {
      throw new Error('CCAVENUE_WORKING_KEY is not configured');
    }
    const m = crypto.createHash('md5');
    m.update(keyStr);
    const key = m.digest();
    const iv = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    let encoded = cipher.update(plainText, 'utf8', 'hex');
    encoded += cipher.final('hex');
    return encoded;
  }

  /**
   * Official CCAvenue AES-128-CBC decryption method
   */
  public decrypt(encText: string): string {
    const keyStr = this.getWorkingKey();
    if (!keyStr) {
      throw new Error('CCAVENUE_WORKING_KEY is not configured');
    }
    const m = crypto.createHash('md5');
    m.update(keyStr);
    const key = m.digest();
    const iv = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    let decoded = decipher.update(encText, 'hex', 'utf8');
    decoded += decipher.final('utf8');
    return decoded;
  }

  /**
   * Prepares encrypted request parameters for CCAvenue form post
   */
  public preparePaymentRequest(transaction: ServerTransaction, appUrl: string) {
    const status = this.getStatus();
    if (!status.canProcessLiveSandbox) {
      throw new Error(
        `Cannot initiate CCAvenue payment: ${status.blockerDetails || 'Missing credentials'}`
      );
    }

    const postUrl = this.getPostUrl();
    const merchantId = this.getMerchantId();
    const tid = this.getTid();
    const meCode = this.getMeCode();

    const params = new URLSearchParams({
      merchant_id: merchantId,
      order_id: transaction.orderId,
      currency: 'INR',
      amount: transaction.gatewayAmount.toFixed(2),
      redirect_url: `${appUrl}/api/payments/ccavenue/callback`,
      cancel_url: `${appUrl}/api/payments/ccavenue/callback`,
      language: 'EN',
      billing_name: transaction.applicantName,
      billing_email: transaction.applicantEmail,
      billing_tel: transaction.applicantPhone,
      merchant_param1: transaction.id,
      merchant_param2: transaction.applicationCode,
      merchant_param3: transaction.applicationRef,
      merchant_param4: meCode,
      merchant_param5: transaction.courseOrEvent,
      tid: tid,
    });

    const encRequest = this.encrypt(params.toString());

    return {
      actionUrl: postUrl,
      sandboxUrl: postUrl,
      accessCode: this.getAccessCode(),
      merchantId: merchantId,
      tid: tid,
      encRequest,
      rawParamsForAudit: {
        merchant_id: merchantId,
        order_id: transaction.orderId,
        amount: transaction.gatewayAmount.toFixed(2),
        currency: 'INR',
        redirect_url: `${appUrl}/api/payments/ccavenue/callback`,
        billing_name: transaction.applicantName,
        billing_email: transaction.applicantEmail,
        billing_tel: transaction.applicantPhone,
        post_url: postUrl,
        tid: tid,
        me_code: meCode,
        legal_name: this.getLegalName(),
      },
    };
  }

  /**
   * Parses and verifies CCAvenue decrypted response
   */
  public verifyResponse(encResponse: string): {
    isValid: boolean;
    status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED';
    gatewayStatusCode: string;
    statusReason: string;
    bankReference?: string;
    authCode?: string;
    gatewayTransactionId?: string;
    orderId?: string;
    paymentMode?: string;
    bankName?: string;
  } {
    try {
      const decrypted = this.decrypt(encResponse);
      const params = new URLSearchParams(decrypted);

      const orderStatus = params.get('order_status') || '';
      const trackingId = params.get('tracking_id') || params.get('trackingId') || '';
      const bankRefNo = params.get('bank_ref_no') || params.get('bankRefNo') || '';
      const failureMessage = params.get('failure_message') || '';
      const statusMessage = params.get('status_message') || '';
      const orderId = params.get('order_id') || params.get('orderId') || '';
      const paymentMode = params.get('payment_mode') || 'NetBanking';
      const cardName = params.get('card_name') || 'HDFC Bank';
      const authCode = params.get('auth_code') || params.get('authCode') || '';

      let status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED' = 'FAILED';
      if (orderStatus.toLowerCase() === 'success') {
        status = 'SUCCESS';
      } else if (orderStatus.toLowerCase() === 'aborted') {
        status = 'CANCELLED';
      } else if (orderStatus.toLowerCase() === 'pending') {
        status = 'PENDING';
      } else {
        status = 'FAILED';
      }

      return {
        isValid: true,
        status,
        gatewayStatusCode: orderStatus,
        statusReason: failureMessage || statusMessage || `CCAvenue order status: ${orderStatus}`,
        bankReference: bankRefNo || undefined,
        authCode: authCode || undefined,
        gatewayTransactionId: trackingId || undefined,
        orderId: orderId || undefined,
        paymentMode,
        bankName: cardName,
      };
    } catch (err: any) {
      return {
        isValid: false,
        status: 'FAILED',
        gatewayStatusCode: 'DECRYPT_ERROR',
        statusReason: `Failed to decrypt response: ${err.message}`,
      };
    }
  }
}
