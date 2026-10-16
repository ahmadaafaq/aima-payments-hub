/**
 * AIMA Payment Hub — Notification Delivery Service (Phase 3)
 *
 * Delivers signed server-to-server payment notifications to registered
 * source application endpoints. Implements exponential backoff and
 * dead-letter handling.
 *
 * Security: Never sends gateway secrets, card data, or keys.
 * Only verified payment outcomes are dispatched.
 */

import { SourceNotification, sourceNotificationStore, buildCanonicalNotificationPayload, signNotification } from '../models/notificationStore';
import { sourceApplicationRegistry } from '../models/sourceApplications';
import { ServerTransaction } from '../gateways/gatewayTypes';
import { quickSsrfCheck } from './ssrfGuard';

const NOTIFICATION_TIMEOUT_MS = 10_000; // 10 second timeout

/**
 * Build the JSON body for a notification event.
 * Does NOT include: gateway secrets, card data, raw keys, or full audit trails.
 */
function buildNotificationBody(notification: SourceNotification): string {
  return JSON.stringify({
    schemaVersion: notification.schemaVersion,
    eventId: notification.eventId,
    signedAt: notification.signedAt,
    orderId: notification.orderId,
    sourceCode: notification.sourceCode,
    externalOrderId: notification.externalOrderId,
    applicationReference: notification.applicationReference,
    paymentPurpose: notification.paymentPurpose,
    amount: {
      paise: notification.amountPaise,
      inr: (notification.amountPaise / 100).toFixed(2),
      currency: notification.currency,
    },
    status: notification.status,
    gateway: notification.gateway,
    gatewayReference: notification.gatewayReference,
    signature: notification.signature,
  });
}

/**
 * Attempt to deliver a single notification.
 * Returns { success, httpStatus?, error? }
 */
async function attemptDelivery(notification: SourceNotification): Promise<{
  success: boolean;
  httpStatus?: number;
  responseBody?: string;
  error?: string;
  durationMs: number;
}> {
  const startMs = Date.now();

  // SSRF check before making any request
  const ssrfCheck = quickSsrfCheck(notification.notificationUrl);
  if (!ssrfCheck.safe) {
    return {
      success: false,
      error: `SSRF guard: ${ssrfCheck.reason}`,
      durationMs: Date.now() - startMs,
    };
  }

  const body = buildNotificationBody(notification);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NOTIFICATION_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(notification.notificationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AIMA-Event-ID': notification.eventId,
          'X-AIMA-Signature': notification.signature,
          'X-AIMA-Timestamp': notification.signedAt,
          'User-Agent': 'AIMA-PaymentHub/3.0',
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const durationMs = Date.now() - startMs;
    const responseBody = await response.text().catch(() => '');

    if (response.ok) {
      return { success: true, httpStatus: response.status, responseBody, durationMs };
    }

    // 4xx errors are not retried (source app configuration issue)
    const isRetryable = response.status >= 500;
    return {
      success: false,
      httpStatus: response.status,
      responseBody,
      error: isRetryable
        ? `HTTP ${response.status} — server error, will retry`
        : `HTTP ${response.status} — client error, manual retry required`,
      durationMs,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startMs;
    const errMsg = err.name === 'AbortError' ? 'Request timed out after 10s' : err.message;
    return { success: false, error: errMsg, durationMs };
  }
}

/**
 * Process all pending notifications immediately.
 * Called by the background scheduler.
 */
export async function processPendingNotifications(): Promise<void> {
  const pending = sourceNotificationStore.getPending();

  for (const notification of pending) {
    const result = await attemptDelivery(notification);

    if (result.success) {
      sourceNotificationStore.recordSuccess(
        notification.eventId,
        result.httpStatus!,
        result.responseBody || '',
        result.durationMs
      );
      console.log(`[Notification] ✅ Delivered ${notification.eventId} to ${notification.notificationUrl} (${result.durationMs}ms)`);
    } else {
      sourceNotificationStore.recordFailure(
        notification.eventId,
        result.error || 'Unknown error',
        result.httpStatus,
        result.durationMs
      );
      const updated = sourceNotificationStore.getByEventId(notification.eventId)!;
      console.warn(
        `[Notification] ⚠️  Delivery failed for ${notification.eventId} ` +
        `(attempt ${updated.attemptCount}/${updated.maxAttempts}): ${result.error}`
      );
    }
  }
}

/**
 * Create and queue a notification for a verified transaction.
 * Only called after gateway verification — not on PENDING status.
 */
export function queueNotification(transaction: ServerTransaction): SourceNotification | null {
  // Only notify on terminal statuses
  if (transaction.status === 'PENDING') return null;

  const app = sourceApplicationRegistry.getBySourceCode(transaction.applicationCode);
  if (!app) {
    console.warn(`[Notification] No source app registered for: ${transaction.applicationCode}`);
    return null;
  }

  // Use app's active credential hash as signing secret basis
  const activeCredential = app.credentials.find((c) => c.isActive && !c.revokedAt);
  if (!activeCredential) {
    console.warn(`[Notification] No active credential for: ${transaction.applicationCode}`);
    return null;
  }

  // SSRF pre-check on notification URL
  const ssrfCheck = quickSsrfCheck(app.notificationUrl);
  if (!ssrfCheck.safe) {
    console.warn(`[Notification] SSRF guard blocked delivery to ${app.notificationUrl}: ${ssrfCheck.reason}`);
    return null;
  }

  const notification = sourceNotificationStore.create({
    orderId: transaction.orderId,
    sourceCode: transaction.applicationCode,
    externalOrderId: transaction.orderId, // external order ID == internal in Phase 3
    applicationReference: transaction.applicationRef,
    paymentPurpose: transaction.feeDescription || 'PAYMENT',
    amountPaise: Math.round(transaction.totalAmount * 100),
    currency: 'INR',
    status: transaction.status,
    gateway: transaction.gateway,
    gatewayReference: transaction.gatewayTransactionId,
    notificationUrl: app.notificationUrl,
    signingSecret: activeCredential.keyHash, // Use stored hash as signing key
  });

  return notification;
}

/** Start background notification processor (runs every 30 seconds). */
export function startNotificationProcessor(): void {
  const POLL_INTERVAL_MS = 30_000;

  const poll = () => {
    processPendingNotifications().catch((err) => {
      console.error('[Notification] Processor error:', err);
    });
  };

  // Initial run after 5s
  setTimeout(poll, 5_000);
  setInterval(poll, POLL_INTERVAL_MS);
  console.log('[Notification] Background processor started (30s interval)');
}
