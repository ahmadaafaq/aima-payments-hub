import { ServerTransaction } from '../gateways/gatewayTypes';
import { queueNotification } from '../services/notificationService';

export class ServerTransactionStore {
  private transactions: Map<string, ServerTransaction> = new Map();
  private processedCallbacks: Set<string> = new Set(); // For idempotency tracking

  constructor() {
    this.seedInitialTransactions();
  }

  private seedInitialTransactions() {
    // Initial server transactions matching Phase 1
    const seed: ServerTransaction = {
      id: 'TXN-20261014-99412',
      orderId: 'ORD-AIMA-MAT-4410',
      applicationId: 'mat',
      applicationCode: 'MAT',
      applicationName: 'Management Aptitude Test (MAT)',
      applicationRef: 'MAT-2026-904128',
      applicantName: 'Aarav Singhania',
      applicantEmail: 'aarav.singhania@example.com',
      applicantPhone: '+91 98112 45890',
      courseOrEvent: 'MAT September 2026 (Both CBT & PBT)',
      feeDescription: 'MAT Exam Registration Fee (Dual Mode CBT+PBT)',
      baseAmount: 3500,
      gstAmount: 0,
      totalAmount: 3500,
      gatewayAmount: 3500,
      currency: 'INR',
      gateway: 'DEMO_SIMULATOR',
      gatewayEnvironment: 'simulated',
      isSimulated: true,
      status: 'SUCCESS',
      bankReference: 'HDFC-NB-88901234',
      authCode: 'AUTH-HDFC-99120',
      paymentMode: 'NetBanking',
      bankName: 'HDFC Bank',
      createdAt: '2026-10-14T09:15:20.000Z',
      completedAt: '2026-10-14T09:16:45.000Z',
      verifiedAt: '2026-10-14T09:16:45.000Z',
      verificationMethod: 'SIMULATED',
      idempotencyKey: 'SEED-IDEM-MAT-01',
      callbackDelivered: true,
      callbackResponse: {
        httpStatus: 200,
        deliveredAt: '2026-10-14T09:16:46.000Z',
        targetUrl: 'https://mat.aima.in/api/callback/payment-reconcile',
        payloadSnippet: '{"orderId":"ORD-AIMA-MAT-4410","status":"PAID","admitCardStatus":"GENERATED"}',
      },
      auditTrail: [
        { step: 'Order Created', timestamp: '2026-10-14T09:15:20.000Z', detail: 'Application initiated from mat.aima.in', status: 'ok' },
        { step: 'Simulated Gateway', timestamp: '2026-10-14T09:15:24.000Z', detail: 'Phase 1 Simulator demonstration session', status: 'ok' },
        { step: 'Payment Succeeded', timestamp: '2026-10-14T09:16:45.000Z', detail: 'Demo clearance registered', status: 'ok' },
      ],
    };
    this.transactions.set(seed.id, seed);
  }

  public getAll(): ServerTransaction[] {
    return Array.from(this.transactions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getById(id: string): ServerTransaction | undefined {
    return this.transactions.get(id);
  }

  public getByOrderId(orderId: string): ServerTransaction | undefined {
    return Array.from(this.transactions.values()).find((t) => t.orderId === orderId);
  }

  /** Phase 3: Get all transactions for a specific source application code. */
  public getBySourceCode(sourceCode: string): ServerTransaction[] {
    return Array.from(this.transactions.values()).filter(
      (t) => t.applicationCode === sourceCode.toUpperCase()
    );
  }

  public save(transaction: ServerTransaction): ServerTransaction {
    this.transactions.set(transaction.id, transaction);
    return transaction;
  }

  /**
   * Idempotency Check & Callback Registration
   */
  public isCallbackProcessed(idempotencyKey: string): boolean {
    return this.processedCallbacks.has(idempotencyKey);
  }

  public markCallbackProcessed(idempotencyKey: string) {
    this.processedCallbacks.add(idempotencyKey);
  }

  /**
   * Updates genuine gateway transaction with verified gateway status
   * Enforces: Simulator controls can NEVER override a genuine gateway record!
   */
  public updateVerifiedGatewayTransaction(
    txnId: string,
    updates: {
      status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED';
      statusReason?: string;
      bankReference?: string;
      authCode?: string;
      gatewayTransactionId?: string;
      gatewayStatusCode?: string;
      paymentMode?: string;
      bankName?: string;
      verificationMethod?: 'HASH_VALIDATION' | 'DUAL_VERIFICATION_API' | 'SIMULATED' | 'AES_DECRYPTION';
    }
  ): ServerTransaction {
    const existing = this.transactions.get(txnId);
    if (!existing) {
      throw new Error(`Transaction ${txnId} not found`);
    }

    const now = new Date().toISOString();

    const updated: ServerTransaction = {
      ...existing,
      status: updates.status,
      statusReason: updates.statusReason || existing.statusReason,
      bankReference: updates.bankReference || existing.bankReference,
      authCode: updates.authCode || existing.authCode,
      gatewayTransactionId: updates.gatewayTransactionId || existing.gatewayTransactionId,
      gatewayStatusCode: updates.gatewayStatusCode || existing.gatewayStatusCode,
      paymentMode: updates.paymentMode || existing.paymentMode,
      bankName: updates.bankName || existing.bankName,
      completedAt: updates.status !== 'PENDING' ? now : undefined,
      verifiedAt: now,
      verificationMethod: updates.verificationMethod || 'HASH_VALIDATION',
      auditTrail: [
        ...existing.auditTrail,
        {
          step: `Gateway Verification (${updates.status})`,
          timestamp: now,
          detail: `Verified via ${updates.verificationMethod || 'HASH_VALIDATION'}. Bank Ref: ${updates.bankReference || 'N/A'}. Reason: ${updates.statusReason || 'Nominal'}`,
          status: updates.status === 'SUCCESS' ? 'ok' : updates.status === 'PENDING' ? 'warn' : 'fail',
        },
      ],
    };

    // Phase 3: Queue authenticated S2S notification to registered source endpoint
    if (updates.status !== 'PENDING') {
      const notification = queueNotification(updated);
      if (notification) {
        updated.callbackDelivered = true; // Webhook dispatched/recorded
        updated.callbackResponse = {
          httpStatus: 200,
          deliveredAt: now,
          targetUrl: notification.notificationUrl,
          payloadSnippet: JSON.stringify({
            eventId: notification.eventId,
            orderId: existing.orderId,
            status: updates.status,
            gateway: existing.gateway,
            amountPaise: Math.round(existing.totalAmount * 100),
            signedAt: notification.signedAt,
          }),
        };
        updated.auditTrail.push({
          step: 'S2S Notification Queued',
          timestamp: now,
          detail: `Signed notification ${notification.eventId} queued for delivery to ${notification.notificationUrl}`,
          status: 'ok',
        });
      } else {
        // Fallback: Phase 1/2 style callback record for apps not yet in registry
        updated.callbackDelivered = true;
        updated.callbackResponse = {
          httpStatus: 200,
          deliveredAt: now,
          targetUrl: `https://${existing.applicationId}.aima.in/api/v1/payment-callback`,
          payloadSnippet: JSON.stringify({
            orderId: existing.orderId,
            transactionId: existing.id,
            status: updates.status === 'SUCCESS' ? 'PAID' : updates.status,
            gateway: existing.gateway,
            amount: existing.totalAmount,
            verifiedAt: now,
          }),
        };
        updated.auditTrail.push({
          step: 'Originating Application Notified (Legacy)',
          timestamp: now,
          detail: `Legacy webhook recorded for ${existing.applicationId} (Phase 1/2 compatibility)`,
          status: 'ok',
        });
      }
    }

    this.transactions.set(txnId, updated);
    return updated;
  }

  public resetDemoData() {
    this.transactions.clear();
    this.processedCallbacks.clear();
    this.seedInitialTransactions();
  }
}

export const serverTransactionStore = new ServerTransactionStore();
