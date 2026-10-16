/**
 * AIMA Payment Hub — Payment Session Store (Phase 3)
 *
 * A payment session is a short-lived, opaque token that binds a checkout
 * page visit to a server-side order. The browser receives only the session
 * token — no merchant secrets, keys, or trusted amounts.
 *
 * Session lifecycle:
 *   PENDING → PROCESSING → COMPLETED | EXPIRED | CANCELLED
 */

import crypto from 'crypto';
import { GatewayType } from '../gateways/gatewayTypes';

export type SessionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';

export interface PaymentSession {
  /** Opaque session token — what the browser sees */
  sessionToken: string;
  /** Internal transaction ID */
  transactionId: string;
  /** Internal order ID */
  orderId: string;
  /** Source application code */
  sourceCode: string;
  /** External order ID from source system */
  externalOrderId: string;
  /** Application reference (student ID, registration no., etc.) */
  applicationReference: string;
  /** Payment purpose */
  paymentPurpose: string;
  /** Amount in paise (integer — authoritative, cannot be changed by browser) */
  amountPaise: number;
  currency: 'INR';
  /** Customer info */
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  /** Registered return URL (validated against allowlist) */
  returnUrl: string;
  /** Gateway selected (may be set when user picks gateway on checkout page or auto-routed) */
  selectedGateway?: GatewayType;
  /** Whether gateway routing is automatic or user-selectable */
  routingMode?: 'AUTO' | 'USER_SELECTABLE';
  status: SessionStatus;
  createdAt: string;
  expiresAt: string;         // 30-minute TTL by default
  completedAt?: string;
  lastActivityAt: string;
  /** Non-sensitive metadata from source application */
  metadata?: Record<string, string>;
  /** Idempotency key from source application */
  idempotencyKey: string;
}

const SESSION_TTL_MINUTES = 30;

export class PaymentSessionStore {
  private sessions: Map<string, PaymentSession> = new Map();
  // Map from idempotencyKey → sessionToken (for idempotent session creation)
  private idempotencyIndex: Map<string, string> = new Map();

  /** Generate a cryptographically random session token */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create a new payment session.
   * If the same idempotencyKey is presented again within TTL, the existing session is returned.
   */
  public create(params: Omit<PaymentSession, 'sessionToken' | 'status' | 'createdAt' | 'expiresAt' | 'lastActivityAt'>): PaymentSession {
    // Idempotency: return existing session if key was already used
    const existingToken = this.idempotencyIndex.get(params.idempotencyKey);
    if (existingToken) {
      const existing = this.sessions.get(existingToken);
      if (existing && !this.isExpired(existing)) {
        return existing;
      }
      // Existing session expired — allow creation of new one
      this.idempotencyIndex.delete(params.idempotencyKey);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MINUTES * 60 * 1000);

    const session: PaymentSession = {
      ...params,
      sessionToken: this.generateToken(),
      status: 'PENDING',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastActivityAt: now.toISOString(),
    };

    this.sessions.set(session.sessionToken, session);
    this.idempotencyIndex.set(params.idempotencyKey, session.sessionToken);
    return session;
  }

  /** Retrieve session by token. Returns undefined if not found or expired. */
  public getByToken(token: string): PaymentSession | undefined {
    const session = this.sessions.get(token);
    if (!session) return undefined;
    if (this.isExpired(session)) {
      this.markExpired(token);
      return undefined;
    }
    return session;
  }

  /** Retrieve session by internal order ID. */
  public getByOrderId(orderId: string): PaymentSession | undefined {
    return Array.from(this.sessions.values()).find((s) => s.orderId === orderId);
  }

  /** Retrieve session by idempotency key. */
  public getByIdempotencyKey(key: string): PaymentSession | undefined {
    const token = this.idempotencyIndex.get(key);
    if (!token) return undefined;
    return this.sessions.get(token);
  }

  public isExpired(session: PaymentSession): boolean {
    if (session.status === 'EXPIRED') {
      return true;
    }
    return new Date() > new Date(session.expiresAt);
  }

  private markExpired(token: string) {
    const session = this.sessions.get(token);
    if (session && session.status === 'PENDING') {
      session.status = 'EXPIRED';
      this.sessions.set(token, session);
    }
  }

  /** Mark session as processing (gateway initiated). */
  public markProcessing(token: string, gateway: GatewayType): PaymentSession {
    const session = this.sessions.get(token);
    if (!session) throw new Error(`Session ${token} not found`);
    if (session.status !== 'PENDING') throw new Error(`Session cannot transition from ${session.status} to PROCESSING`);
    if (this.isExpired(session)) throw new Error('Payment session has expired');

    session.status = 'PROCESSING';
    session.selectedGateway = gateway;
    session.lastActivityAt = new Date().toISOString();
    this.sessions.set(token, session);
    return session;
  }

  /** Mark session as completed (payment result received). */
  public markCompleted(token: string): PaymentSession {
    const session = this.sessions.get(token);
    if (!session) throw new Error(`Session ${token} not found`);
    if (session.status === 'COMPLETED') return session; // idempotent

    const now = new Date().toISOString();
    session.status = 'COMPLETED';
    session.completedAt = now;
    session.lastActivityAt = now;
    this.sessions.set(token, session);
    return session;
  }

  /** Mark session as cancelled. */
  public markCancelled(token: string): PaymentSession {
    const session = this.sessions.get(token);
    if (!session) throw new Error(`Session ${token} not found`);
    session.status = 'CANCELLED';
    session.lastActivityAt = new Date().toISOString();
    this.sessions.set(token, session);
    return session;
  }

  public getAll(): PaymentSession[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
}

export const paymentSessionStore = new PaymentSessionStore();
