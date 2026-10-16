/**
 * AIMA Payment Hub — Source Notification Store (Phase 3)
 *
 * Tracks server-to-server payment notifications sent to registered source
 * applications. Supports retry with exponential backoff, dead-letter state,
 * idempotent event IDs, and manual operator retry.
 */

import crypto from 'crypto';

export type NotificationStatus =
  | 'PENDING'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETRYING'
  | 'DEAD_LETTER';

export interface DeliveryAttempt {
  attemptNumber: number;
  attemptedAt: string;
  httpStatus?: number;
  responseBody?: string;
  error?: string;
  durationMs?: number;
}

export interface SourceNotification {
  /** Unique event ID — used for idempotent processing at receiver */
  eventId: string;
  /** Schema version for forward compatibility */
  schemaVersion: '1.0';
  /** Internal order ID */
  orderId: string;
  /** Source application code */
  sourceCode: string;
  /** External order ID from source system */
  externalOrderId: string;
  /** Application reference */
  applicationReference: string;
  /** Payment purpose */
  paymentPurpose: string;
  /** Amount in paise */
  amountPaise: number;
  currency: 'INR';
  /** Normalized payment status */
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'CANCELLED';
  /** Payment gateway used */
  gateway: string;
  /** Gateway transaction reference (if available) */
  gatewayReference?: string;
  /** Notification target URL */
  notificationUrl: string;
  /** HMAC-SHA256 signature of canonical payload (for receiver verification) */
  signature: string;
  /** Timestamp included in signature */
  signedAt: string;
  /** Current delivery status */
  deliveryStatus: NotificationStatus;
  /** Number of delivery attempts made */
  attemptCount: number;
  /** Maximum attempts before dead-lettering */
  maxAttempts: number;
  /** Next retry time (ISO string) */
  nextRetryAt?: string;
  /** All delivery attempts */
  attempts: DeliveryAttempt[];
  createdAt: string;
  lastAttemptAt?: string;
  deliveredAt?: string;
}

const MAX_ATTEMPTS = 5;
// Exponential backoff: 30s, 2m, 10m, 30m, 2h
const BACKOFF_SECONDS = [30, 120, 600, 1800, 7200];

function computeNextRetry(attemptCount: number): string {
  const delaySec = BACKOFF_SECONDS[Math.min(attemptCount, BACKOFF_SECONDS.length - 1)];
  return new Date(Date.now() + delaySec * 1000).toISOString();
}

/**
 * Build the canonical notification payload string for signing.
 * Format: eventId|orderId|sourceCode|status|amountPaise|signedAt
 */
export function buildCanonicalNotificationPayload(notification: Pick<SourceNotification,
  'eventId' | 'orderId' | 'sourceCode' | 'status' | 'amountPaise' | 'signedAt'>): string {
  return [
    notification.eventId,
    notification.orderId,
    notification.sourceCode,
    notification.status,
    String(notification.amountPaise),
    notification.signedAt,
  ].join('|');
}

/**
 * Sign the canonical notification payload with HMAC-SHA256.
 * The secret is the source application's per-source key hash — in production
 * use a dedicated signing secret per source.
 */
export function signNotification(canonical: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

export class SourceNotificationStore {
  private notifications: Map<string, SourceNotification> = new Map();

  /** Create a new notification record (not yet delivered). */
  public create(params: Omit<SourceNotification,
    'eventId' | 'schemaVersion' | 'deliveryStatus' | 'attemptCount' | 'maxAttempts' | 'nextRetryAt' | 'attempts' | 'createdAt' | 'signature' | 'signedAt'> & { signingSecret: string }
  ): SourceNotification {
    const { signingSecret, ...rest } = params;
    const now = new Date().toISOString();
    const eventId = `EVT-${Date.now()}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    const canonical = buildCanonicalNotificationPayload({
      eventId,
      orderId: rest.orderId,
      sourceCode: rest.sourceCode,
      status: rest.status,
      amountPaise: rest.amountPaise,
      signedAt: now,
    });
    const signature = signNotification(canonical, signingSecret);

    const notification: SourceNotification = {
      ...rest,
      eventId,
      schemaVersion: '1.0',
      signature,
      signedAt: now,
      deliveryStatus: 'PENDING',
      attemptCount: 0,
      maxAttempts: MAX_ATTEMPTS,
      nextRetryAt: now, // ready to deliver immediately
      attempts: [],
      createdAt: now,
    };

    this.notifications.set(eventId, notification);
    return notification;
  }

  public getByEventId(eventId: string): SourceNotification | undefined {
    return this.notifications.get(eventId);
  }

  public getByOrderId(orderId: string): SourceNotification[] {
    return Array.from(this.notifications.values()).filter((n) => n.orderId === orderId);
  }

  public getAll(): SourceNotification[] {
    return Array.from(this.notifications.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getPending(): SourceNotification[] {
    const now = new Date();
    return Array.from(this.notifications.values()).filter(
      (n) =>
        (n.deliveryStatus === 'PENDING' || n.deliveryStatus === 'RETRYING') &&
        n.nextRetryAt &&
        new Date(n.nextRetryAt) <= now
    );
  }

  /** Record a successful delivery. */
  public recordSuccess(eventId: string, httpStatus: number, responseBody: string, durationMs: number): SourceNotification {
    const notification = this.notifications.get(eventId);
    if (!notification) throw new Error(`Notification ${eventId} not found`);

    const now = new Date().toISOString();
    notification.deliveryStatus = 'DELIVERED';
    notification.deliveredAt = now;
    notification.lastAttemptAt = now;
    notification.attemptCount += 1;
    notification.attempts.push({
      attemptNumber: notification.attemptCount,
      attemptedAt: now,
      httpStatus,
      responseBody: responseBody.substring(0, 512),
      durationMs,
    });

    this.notifications.set(eventId, notification);
    return notification;
  }

  /** Record a failed delivery attempt. Implements backoff scheduling. */
  public recordFailure(eventId: string, error: string, httpStatus?: number, durationMs?: number): SourceNotification {
    const notification = this.notifications.get(eventId);
    if (!notification) throw new Error(`Notification ${eventId} not found`);

    const now = new Date().toISOString();
    notification.lastAttemptAt = now;
    notification.attemptCount += 1;
    notification.attempts.push({
      attemptNumber: notification.attemptCount,
      attemptedAt: now,
      httpStatus,
      error: error.substring(0, 512),
      durationMs,
    });

    if (notification.attemptCount >= notification.maxAttempts) {
      notification.deliveryStatus = 'DEAD_LETTER';
      notification.nextRetryAt = undefined;
    } else {
      notification.deliveryStatus = 'RETRYING';
      notification.nextRetryAt = computeNextRetry(notification.attemptCount);
    }

    this.notifications.set(eventId, notification);
    return notification;
  }

  /** Allow operator to manually reset a dead-letter notification for retry. */
  public manualRetry(eventId: string): SourceNotification {
    const notification = this.notifications.get(eventId);
    if (!notification) throw new Error(`Notification ${eventId} not found`);
    if (notification.deliveryStatus !== 'DEAD_LETTER') {
      throw new Error('Only DEAD_LETTER notifications can be manually retried');
    }

    notification.deliveryStatus = 'RETRYING';
    notification.nextRetryAt = new Date().toISOString();
    this.notifications.set(eventId, notification);
    return notification;
  }
}

export const sourceNotificationStore = new SourceNotificationStore();
