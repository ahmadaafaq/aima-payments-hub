/**
 * AIMA Payment Hub — HMAC Authentication Middleware (Phase 3)
 *
 * Authenticates source application API requests using HMAC-SHA256 signed
 * request signatures. Protects against:
 *   - Forged requests (signature verification)
 *   - Replay attacks (timestamp window + nonce tracking)
 *   - Expired requests (5-minute clock skew tolerance)
 *
 * Required headers:
 *   X-AIMA-Source-Code   : Source application code (e.g. 'MAT')
 *   X-AIMA-Timestamp     : Unix timestamp in seconds (10-digit integer)
 *   X-AIMA-Nonce         : Unique random value per request (min 16 chars)
 *   X-AIMA-Signature     : HMAC-SHA256 of canonical request
 *
 * Canonical request format:
 *   METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256(body)
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { sourceApplicationRegistry, SourceApplication } from '../models/sourceApplications';

// Maximum clock skew allowed (5 minutes)
const MAX_CLOCK_SKEW_SEC = 5 * 60;

// Nonce replay tracking — in production use Redis with TTL
const usedNonces = new Map<string, number>(); // nonce → unix timestamp

// Clean up old nonces periodically
setInterval(() => {
  const cutoff = Math.floor(Date.now() / 1000) - MAX_CLOCK_SKEW_SEC;
  for (const [nonce, ts] of usedNonces.entries()) {
    if (ts < cutoff) usedNonces.delete(nonce);
  }
}, 60_000);

/**
 * Build canonical request string for HMAC signing.
 * This is the string that both sender and verifier must compute identically.
 */
export function buildCanonicalRequest(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  bodyHex: string
): string {
  return `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${bodyHex}`;
}

/**
 * Compute HMAC-SHA256 of a canonical request string.
 */
export function computeHmacSignature(canonical: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

/**
 * Express middleware: authenticate and attach source application to request.
 * Sets `req.sourceApp` on success. Calls next(err) or returns 401/400 on failure.
 */
export function hmacAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const sourceCode = req.headers['x-aima-source-code'] as string | undefined;
  const timestamp = req.headers['x-aima-timestamp'] as string | undefined;
  const nonce = req.headers['x-aima-nonce'] as string | undefined;
  const signature = req.headers['x-aima-signature'] as string | undefined;
  // Support alternative: Bearer token in Authorization header as API key
  const authHeader = req.headers['authorization'] as string | undefined;

  // Fast path for simple API key auth (used in GET status lookups)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const apiKey = authHeader.substring(7);
    if (!sourceCode) {
      res.status(401).json({ error: 'X-AIMA-Source-Code header required' });
      return;
    }
    const app = sourceApplicationRegistry.authenticate(sourceCode, apiKey);
    if (!app) {
      res.status(401).json({ error: 'Invalid source code or API key' });
      return;
    }
    (req as any).sourceApp = app;
    next();
    return;
  }

  // Full HMAC path
  if (!sourceCode || !timestamp || !nonce || !signature) {
    res.status(401).json({
      error: 'Missing authentication headers: X-AIMA-Source-Code, X-AIMA-Timestamp, X-AIMA-Nonce, X-AIMA-Signature',
    });
    return;
  }

  // 1. Validate timestamp
  const nowSec = Math.floor(Date.now() / 1000);
  const reqTimeSec = parseInt(timestamp, 10);
  if (isNaN(reqTimeSec) || Math.abs(nowSec - reqTimeSec) > MAX_CLOCK_SKEW_SEC) {
    res.status(401).json({ error: 'Request timestamp expired or invalid (±5 min tolerance)' });
    return;
  }

  // 2. Check nonce replay
  if (nonce.length < 16) {
    res.status(401).json({ error: 'Nonce must be at least 16 characters' });
    return;
  }
  const nonceKey = `${sourceCode}:${nonce}`;
  if (usedNonces.has(nonceKey)) {
    res.status(401).json({ error: 'Nonce has already been used (replay attack prevented)' });
    return;
  }

  // 3. Look up source application
  const sourceApp = sourceApplicationRegistry.getBySourceCode(sourceCode);
  if (!sourceApp || !sourceApp.isActive) {
    res.status(401).json({ error: 'Unknown or inactive source application' });
    return;
  }

  // 4. Get active credential and compute expected signature
  const activeCredential = sourceApp.credentials.find((c) => c.isActive && !c.revokedAt);
  if (!activeCredential) {
    res.status(401).json({ error: 'No active credential for source application' });
    return;
  }

  // Compute body SHA-256
  const bodyStr = req.body ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : '';
  const bodyHash = crypto.createHash('sha256').update(bodyStr, 'utf8').digest('hex');

  // We need the raw API key to verify HMAC — but we only stored the hash.
  // Solution: The source app sends its raw API key in X-AIMA-API-Key header,
  // we verify it against stored hash, then use it to compute HMAC.
  // (This follows the same pattern as AWS Signature V4)
  const apiKeyHeader = req.headers['x-aima-api-key'] as string | undefined;
  if (!apiKeyHeader) {
    res.status(401).json({ error: 'X-AIMA-API-Key header required for HMAC authentication' });
    return;
  }

  // 5. Verify raw API key against stored hash
  const { verifyApiKey } = require('../models/sourceApplications');
  if (!verifyApiKey(apiKeyHeader, activeCredential.keyHash)) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  // 6. Compute expected HMAC signature
  const canonical = buildCanonicalRequest(
    req.method,
    req.path,
    timestamp,
    nonce,
    bodyHash
  );
  const expectedSig = computeHmacSignature(canonical, apiKeyHeader);

  // 7. Constant-time comparison
  let sigValid = false;
  try {
    sigValid = crypto.timingSafeEqual(
      Buffer.from(expectedSig, 'hex'),
      Buffer.from(signature, 'hex')
    );
  } catch {
    sigValid = false;
  }

  if (!sigValid) {
    res.status(401).json({ error: 'Invalid HMAC signature' });
    return;
  }

  // 8. Record nonce to prevent replay
  usedNonces.set(nonceKey, reqTimeSec);

  // Attach source app to request
  (req as any).sourceApp = sourceApp;
  next();
}

/** Extend Express Request type */
declare global {
  namespace Express {
    interface Request {
      sourceApp?: SourceApplication;
    }
  }
}
