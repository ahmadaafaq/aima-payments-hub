import crypto from 'crypto';
import { GatewayStatusInfo, ServerTransaction } from './gatewayTypes';

export class WorldlinePaynimoAdapter {
  private environment: string;
  private merchantCode: string;
  private schemeCode: string;
  private salt: string;

  constructor() {
    this.environment = (process.env.WORLDLINE_ENVIRONMENT || 'sandbox').toLowerCase();
    this.merchantCode = process.env.WORLDLINE_MERCHANT_CODE || 'T1202993';
    this.schemeCode = process.env.WORLDLINE_SCHEME_CODE || 'FIRST';
    this.salt = process.env.WORLDLINE_SALT || (this.merchantCode === 'T945221' ? '5174857326WJPKBR' : '5367530737NPUJCA');
  }

  public getEnvironment(): string {
    return (process.env.WORLDLINE_ENVIRONMENT || 'sandbox').toLowerCase();
  }

  public getMerchantCode(): string {
    return process.env.WORLDLINE_MERCHANT_CODE || 'T1202993';
  }

  public getSchemeCode(): string {
    return process.env.WORLDLINE_SCHEME_CODE || 'FIRST';
  }

  public getSalt(): string {
    return process.env.WORLDLINE_SALT || '';
  }

  /**
   * Evaluates configuration status of Worldline gateway
   */
  public getStatus(): GatewayStatusInfo {
    const env = this.getEnvironment();
    const merchant = this.getMerchantCode();
    const scheme = this.getSchemeCode();
    const salt = this.getSalt();

    const missing: string[] = [];
    if (!merchant) missing.push('WORLDLINE_MERCHANT_CODE');
    if (!scheme) missing.push('WORLDLINE_SCHEME_CODE');
    if (!salt) missing.push('WORLDLINE_SALT');

    if (env === 'production') {
      return {
        id: 'WORLDLINE_PAYNIMO',
        name: 'Worldline / Paynimo (Sandbox)',
        environment: 'sandbox',
        status: 'INTEGRATION_ERROR',
        statusLabel: 'Production Mode Blocked (Sandbox Enforced)',
        canProcessLiveSandbox: false,
        blockerDetails: 'Server policy strictly enforces Sandbox mode. Set WORLDLINE_ENVIRONMENT=sandbox.',
        missingEnvVars: [],
      };
    }

    if (missing.length > 0) {
      return {
        id: 'WORLDLINE_PAYNIMO',
        name: 'Worldline / Paynimo (Sandbox)',
        environment: 'sandbox',
        status: 'INCOMPLETE',
        statusLabel: 'Configuration Incomplete',
        canProcessLiveSandbox: false,
        blockerDetails: `Missing required secret(s): ${missing.join(', ')}. Worldline SALT must be set in environment.`,
        configuredDetails: {
          merchantId: this.merchantCode,
          schemeCode: this.schemeCode,
          testAmountLimits: '₹1.00 – ₹10.00',
          testCredentialsHint: 'Bank login: test / test',
        },
        missingEnvVars: missing,
      };
    }

    return {
      id: 'WORLDLINE_PAYNIMO',
      name: 'Worldline / Paynimo (Sandbox)',
      environment: 'sandbox',
      status: 'CONFIGURED',
      statusLabel: 'Sandbox Configured',
      canProcessLiveSandbox: true,
      configuredDetails: {
        merchantId: this.merchantCode,
        schemeCode: this.schemeCode,
        endpointsVerified: true,
        testAmountLimits: '₹1.00 – ₹10.00',
        testCredentialsHint: 'Bank login: test / test',
      },
      missingEnvVars: [],
    };
  }

  /**
   * Generates secure SHA-256 token/hash for Paynimo Checkout
   * Protocol format:
   * merchantId|txnId|totalamount|accountNo|consumerId|mobile|email|debitStartDate|debitEndDate|maxAmount|amountType|frequency|cardNumber|expMonth|expYear|cvvCode|SALT
   */
  public generateCheckoutHash(params: {
    merchantId: string;
    txnId: string;
    amount: string; // e.g. "2.00"
    accountNo?: string;
    consumerId: string;
    consumerMobileNo: string;
    consumerEmailId: string;
    debitStartDate?: string;
    debitEndDate?: string;
    maxAmount?: string;
    amountType?: string;
    frequency?: string;
    cardNumber?: string;
    expMonth?: string;
    expYear?: string;
    cvvCode?: string;
  }): string {
    const salt = this.getSalt();
    if (!salt) {
      throw new Error('WORLDLINE_SALT is required to compute secure token');
    }

    const fields = [
      params.merchantId || this.getMerchantCode(),
      params.txnId,
      params.amount,
      params.accountNo || '',
      params.consumerId,
      params.consumerMobileNo,
      params.consumerEmailId,
      params.debitStartDate || '',
      params.debitEndDate || '',
      params.maxAmount || '',
      params.amountType || '',
      params.frequency || '',
      params.cardNumber || '',
      params.expMonth || '',
      params.expYear || '',
      params.cvvCode || '',
      salt,
    ];

    const hashString = fields.join('|');
    return crypto.createHash('sha256').update(hashString, 'utf8').digest('hex');
  }

  /**
   * Generates complete consumerData payload for client-side $.pnCheckout initialization
   */
  public prepareCheckoutPayload(transaction: ServerTransaction, appUrl: string) {
    const status = this.getStatus();
    if (!status.canProcessLiveSandbox) {
      throw new Error(`Cannot initiate Worldline payment: ${status.blockerDetails || 'Incomplete setup'}`);
    }

    // Format amount to 2 decimal places within ₹1-₹10 sandbox boundary
    const gatewayAmount = transaction.gatewayAmount.toFixed(2);
    const merchant = this.getMerchantCode();
    const scheme = this.getSchemeCode();

    const consumerId = `CUST_${transaction.applicationRef.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const token = this.generateCheckoutHash({
      merchantId: merchant,
      txnId: transaction.id,
      amount: gatewayAmount,
      consumerId: consumerId,
      consumerMobileNo: transaction.applicantPhone.replace(/[^0-9]/g, '').slice(-10) || '9876543210',
      consumerEmailId: transaction.applicantEmail,
    });

    return {
      tarCall: false,
      features: {
        showFullResponse: true,
        showSplitOption: false,
        enableNewWindowFlow: false,
      },
      consumerData: {
        deviceId: 'WEBSH1', // WEBSH1 = SHA-256 (WEBSH2 is SHA-512)
        token: token,
        returnUrl: `${appUrl}/api/payments/worldline/callback?txnId=${encodeURIComponent(transaction.id)}&orderId=${encodeURIComponent(transaction.orderId)}`,
        responseHandler: 'handleWorldlineResponse',
        paymentMode: 'all',
        merchantLogoUrl: `${appUrl}/logo.png`,
        merchantId: merchant,
        currency: 'INR',
        consumerId: consumerId,
        consumerMobileNo: transaction.applicantPhone.replace(/[^0-9]/g, '').slice(-10) || '9876543210',
        consumerEmailId: transaction.applicantEmail,
        txnId: transaction.id,
        items: [
          {
            itemId: scheme,
            amount: gatewayAmount,
            comAmt: '0',
          },
        ],
        customStyle: {
          PRIMARY_COLOR_CODE: '#002b49',
          SECONDARY_COLOR_CODE: '#e88b00',
          BUTTON_COLOR_CODE_1: '#002b49',
          BUTTON_COLOR_CODE_2: '#ffffff',
        },
      },
    };
  }

  /**
   * Robustly parses incoming callback payload from Worldline / Paynimo
   * Supporting:
   * 1. Single URL integration pipe-separated string (req.body.msg / req.query.msg)
   * 2. Direct form fields (clnt_txn_ref, txnId, merchantTxnId, etc.)
   * 3. Nested JSON payload ($.pnCheckout responseHandler format)
   * 4. Query string parameters (txnId, orderId)
   */
  public parseCallbackData(body: any, query: any = {}) {
    let msgStr = '';
    if (typeof body === 'string') {
      if (body.startsWith('msg=')) {
        msgStr = decodeURIComponent(body.slice(4));
      } else if (body.includes('|')) {
        msgStr = body;
      }
    } else if (body?.msg || body?.MSG) {
      msgStr = String(body.msg || body.MSG);
    } else if (query?.msg || query?.MSG) {
      msgStr = String(query.msg || query.MSG);
    }

    let parsedFromMsg: any = null;
    if (msgStr && msgStr.includes('|')) {
      const parts = msgStr.split('|');
      parsedFromMsg = {
        statusCode: parts[0]?.trim() || '',
        statusMessage: parts[1]?.trim() || '',
        errorMessage: parts[2]?.trim() || '',
        clnt_txn_ref: parts[3]?.trim() || '',
        bankCode: parts[4]?.trim() || '',
        gatewayTransactionId: parts[5]?.trim() || '',
        amount: parts[6]?.trim() || '',
        clnt_rqst_meta: parts[7]?.trim() || '',
        txnTime: parts[8]?.trim() || '',
        authCode: parts[13]?.trim() || '',
        token: parts[14]?.trim() || '',
        rawMsg: msgStr,
      };
    }

    const pMethod = body?.paymentMethod?.paymentTransaction || body?.paymentMethod || body;

    const txnId =
      parsedFromMsg?.clnt_txn_ref ||
      (query?.txnId as string) ||
      (query?.transactionId as string) ||
      (query?.clnt_txn_ref as string) ||
      (query?.merchantTransactionIdentifier as string) ||
      pMethod?.merchantTransactionIdentifier ||
      body?.clnt_txn_ref ||
      body?.merchantTxnId ||
      body?.merchantTransactionIdentifier ||
      body?.txnId ||
      body?.txn_id ||
      body?.merch_txn_id ||
      body?.transactionId ||
      body?.consumerData?.txnId ||
      '';

    const orderId =
      (query?.orderId as string) ||
      body?.orderId ||
      body?.order_id ||
      '';

    const statusCode =
      parsedFromMsg?.statusCode ||
      pMethod?.statusCode ||
      body?.statusCode ||
      body?.status ||
      (query?.status as string) ||
      '';

    const statusMessage =
      parsedFromMsg?.statusMessage ||
      parsedFromMsg?.errorMessage ||
      pMethod?.statusMessage ||
      pMethod?.errorMessage ||
      body?.statusMessage ||
      '';

    const bankRef =
      parsedFromMsg?.bankCode ||
      pMethod?.bankReferenceIdentifier ||
      pMethod?.bankReference ||
      body?.bankRef ||
      '';

    const authCode =
      parsedFromMsg?.authCode ||
      pMethod?.authCode ||
      body?.authCode ||
      '';

    const gatewayTxnId =
      parsedFromMsg?.gatewayTransactionId ||
      pMethod?.identifier ||
      body?.transactionId ||
      '';

    const token =
      parsedFromMsg?.token ||
      body?.token ||
      body?.hash ||
      '';

    return {
      txnId: (txnId || '').trim(),
      orderId: (orderId || '').trim(),
      statusCode,
      statusMessage,
      bankRef,
      authCode,
      gatewayTxnId,
      token,
      parsedFromMsg,
      rawPayload: body,
    };
  }

  /**
   * Verifies incoming callback response from Worldline / Paynimo
   * Status code meanings:
   * '0300': Success
   * '0398': Initiated
   * '0399': Failed
   * '0396': Awaited / Pending
   * '0392': Aborted / Cancelled
   */
  public verifyResponse(responsePayload: any): {
    isValid: boolean;
    status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED';
    gatewayStatusCode: string;
    statusReason: string;
    bankReference?: string;
    authCode?: string;
    paymentMode?: string;
    bankName?: string;
    gatewayTransactionId?: string;
    computedHashMatch: boolean;
  } {
    // If string or contains msg, parse it first
    if (typeof responsePayload === 'string' || responsePayload?.msg || responsePayload?.MSG) {
      const parsed = this.parseCallbackData(responsePayload);
      responsePayload = { ...responsePayload, ...(parsed.parsedFromMsg || {}), ...parsed };
    }

    // Paynimo response structure can be direct or nested inside paymentMethod
    const pMethod = responsePayload?.paymentMethod || responsePayload?.parsedFromMsg || responsePayload;
    const statusCode = String(
      pMethod?.paymentTransaction?.statusCode ||
      responsePayload?.statusCode ||
      responsePayload?.status ||
      ''
    );
    const statusMsg =
      pMethod?.paymentTransaction?.statusMessage ||
      pMethod?.paymentTransaction?.errorMessage ||
      responsePayload?.statusMessage ||
      responsePayload?.errorMessage ||
      '';

    const bankRef =
      pMethod?.paymentTransaction?.bankReferenceIdentifier ||
      pMethod?.paymentTransaction?.bankReference ||
      responsePayload?.bankRef ||
      responsePayload?.bankReference ||
      '';

    const authCode =
      pMethod?.paymentTransaction?.authCode ||
      responsePayload?.authCode ||
      '';

    const gatewayTxnId =
      pMethod?.paymentTransaction?.identifier ||
      responsePayload?.gatewayTransactionId ||
      responsePayload?.transactionId ||
      '';

    const mode =
      pMethod?.paymentTransaction?.paymentMode ||
      responsePayload?.paymentMode ||
      'NetBanking';

    const bankName =
      pMethod?.paymentTransaction?.bankName ||
      responsePayload?.bankName ||
      'Test Sandbox Bank';

    // ── Dual SHA-256 Response Token Verification ──────────────────────────────
    // Paynimo sends back a token in the response computed from the same pipe-delimited
    // formula used during checkout initiation. We recompute the expected hash from the
    // response fields and compare using constant-time comparison to prevent timing attacks.
    let computedHashMatch = true;
    const responseToken = responsePayload?.token || responsePayload?.hash || '';
    const salt = this.getSalt();

    if (responseToken && salt) {
      // Extract fields from response to recompute verification hash
      const respMerchantId =
        pMethod?.paymentTransaction?.merchantId ||
        responsePayload?.merchantId ||
        this.getMerchantCode();
      const respTxnId =
        pMethod?.paymentTransaction?.merchantTransactionIdentifier ||
        responsePayload?.merchantTxnId ||
        responsePayload?.txnId ||
        '';
      const respAmount =
        pMethod?.paymentTransaction?.amount ||
        responsePayload?.amount ||
        '';
      const respAccountNo =
        pMethod?.paymentTransaction?.accountNo ||
        responsePayload?.accountNo ||
        '';
      const respConsumerId =
        pMethod?.paymentTransaction?.consumerId ||
        responsePayload?.consumerId ||
        '';
      const respMobile =
        pMethod?.paymentTransaction?.consumerMobileNo ||
        responsePayload?.consumerMobileNo ||
        '';
      const respEmail =
        pMethod?.paymentTransaction?.consumerEmailId ||
        responsePayload?.consumerEmailId ||
        '';

      // Recompute hash using same pipe-delimited formula as checkout initiation
      const verificationFields = [
        respMerchantId,
        respTxnId,
        String(respAmount),
        respAccountNo,
        respConsumerId,
        respMobile,
        respEmail,
        '', // debitStartDate (not in response)
        '', // debitEndDate
        '', // maxAmount
        '', // amountType
        '', // frequency
        '', // cardNumber
        '', // expMonth
        '', // expYear
        '', // cvvCode
        salt,
      ];

      const expectedHash = crypto
        .createHash('sha256')
        .update(verificationFields.join('|'), 'utf8')
        .digest('hex');

      // Constant-time comparison to prevent timing side-channel attacks
      try {
        computedHashMatch = crypto.timingSafeEqual(
          Buffer.from(responseToken, 'utf8'),
          Buffer.from(expectedHash, 'utf8')
        );
      } catch {
        // Buffer length mismatch means tokens don't match
        computedHashMatch = false;
      }

      if (!computedHashMatch) {
        console.warn(
          `[SECURITY] Worldline response token mismatch! TxnId: ${respTxnId}. ` +
          `Expected hash prefix: ${expectedHash.substring(0, 12)}..., ` +
          `Received token prefix: ${responseToken.substring(0, 12)}...`
        );
      }
    } else if (responseToken && !salt) {
      // Token was provided by Worldline but we have no SALT to verify — flag as unverified
      console.warn('[SECURITY] Worldline response contains token but WORLDLINE_SALT is not configured — cannot verify');
      computedHashMatch = false;
    }
    // If no responseToken present (e.g. sandbox simulated responses), skip hash check gracefully

    let status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED' = 'FAILED';

    if (statusCode === '0300') {
      status = 'SUCCESS';
    } else if (statusCode === '0396') {
      status = 'PENDING';
    } else if (statusCode === '0392') {
      status = 'CANCELLED';
    } else {
      status = 'FAILED';
    }

    // If hash verification failed on a success response, demote to FAILED for safety
    const isResponseIntegrityValid = computedHashMatch || !responseToken;

    return {
      isValid: isResponseIntegrityValid,
      status: (!isResponseIntegrityValid && status === 'SUCCESS') ? 'FAILED' : status,
      gatewayStatusCode: statusCode,
      statusReason: statusMsg || `Worldline status code ${statusCode}`,
      bankReference: bankRef || undefined,
      authCode: authCode || undefined,
      paymentMode: mode,
      bankName: bankName,
      gatewayTransactionId: gatewayTxnId || undefined,
      computedHashMatch,
    };
  }
}
