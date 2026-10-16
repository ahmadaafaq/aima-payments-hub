/**
 * AIMA Payment Hub — SSRF Protection Guard (Phase 3)
 *
 * Protects against Server-Side Request Forgery when making outbound HTTP
 * requests to source application notification URLs.
 *
 * Blocks:
 *   - RFC 1918 private ranges (10.x, 172.16-31.x, 192.168.x)
 *   - Loopback (127.x, ::1)
 *   - Link-local (169.254.x, fe80::)
 *   - Unspecified addresses (0.0.0.0, ::)
 *   - Non-http/https protocols
 *
 * An explicit SSRF allowlist may be configured via environment variable
 * SSRF_ALLOWED_PRIVATE_HOSTS for internal test deployments (admin-only).
 */

import { URL } from 'url';
import dns from 'dns';
import net from 'net';

// Ranges blocked to prevent SSRF
const BLOCKED_CIDRS = [
  // Loopback
  { start: ipToLong('127.0.0.0'), end: ipToLong('127.255.255.255') },
  // RFC 1918 - Private
  { start: ipToLong('10.0.0.0'), end: ipToLong('10.255.255.255') },
  { start: ipToLong('172.16.0.0'), end: ipToLong('172.31.255.255') },
  { start: ipToLong('192.168.0.0'), end: ipToLong('192.168.255.255') },
  // Link-local
  { start: ipToLong('169.254.0.0'), end: ipToLong('169.254.255.255') },
  // Unspecified
  { start: ipToLong('0.0.0.0'), end: ipToLong('0.0.0.0') },
];

function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIp(ip: string): boolean {
  // IPv6 loopback / unspecified
  if (ip === '::1' || ip === '::' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }

  // IPv4-mapped IPv6
  const ipv4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Mapped) {
    return isPrivateIp(ipv4Mapped[1]);
  }

  if (!net.isIPv4(ip)) return false;

  const ipLong = ipToLong(ip);
  return BLOCKED_CIDRS.some(({ start, end }) => ipLong >= start && ipLong <= end);
}

/** Load explicit allowlist from environment (admin-configured only). */
function getAllowedPrivateHosts(): Set<string> {
  const envVal = process.env.SSRF_ALLOWED_PRIVATE_HOSTS || '';
  return new Set(envVal.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
}

/**
 * Validate that a notification URL is safe to make an outbound HTTP request to.
 * Throws if the URL is unsafe.
 */
export async function validateNotificationUrl(rawUrl: string): Promise<void> {
  // 1. Parse and validate URL structure
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid notification URL: ${rawUrl}`);
  }

  // 2. Only allow http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Notification URL must use http or https protocol, got: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname;

  // 3. Check explicit allowlist
  const allowedHosts = getAllowedPrivateHosts();
  if (allowedHosts.has(hostname.toLowerCase())) {
    return; // Explicitly allowed
  }

  // 4. Block raw IP addresses in private ranges
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error(`SSRF blocked: notification URL resolves to private/internal IP address: ${hostname}`);
    }
    return; // Public IP — allow
  }

  // 5. Resolve hostname and check all resolved IPs
  const ips = await new Promise<string[]>((resolve, reject) => {
    dns.resolve(hostname, (err, addresses) => {
      if (err) {
        // Also try IPv6
        dns.resolve6(hostname, (err6, v6addresses) => {
          if (err6) reject(new Error(`DNS resolution failed for ${hostname}: ${err.message}`));
          else resolve(v6addresses || []);
        });
      } else {
        resolve(addresses || []);
      }
    });
  });

  for (const ip of ips) {
    if (isPrivateIp(ip)) {
      throw new Error(
        `SSRF blocked: notification URL '${hostname}' resolves to private IP ${ip}. ` +
        `Configure SSRF_ALLOWED_PRIVATE_HOSTS if this is an approved internal endpoint.`
      );
    }
  }
}

/**
 * Synchronous pre-check for obviously blocked hostnames (no DNS lookup).
 * Use before making any network call.
 */
export function quickSsrfCheck(rawUrl: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, reason: `Unsupported protocol: ${parsed.protocol}` };
    }

    const hostname = parsed.hostname;
    const allowedHosts = getAllowedPrivateHosts();
    if (allowedHosts.has(hostname.toLowerCase())) {
      return { safe: true };
    }

    if (net.isIP(hostname) && isPrivateIp(hostname)) {
      return { safe: false, reason: `Private IP address blocked: ${hostname}` };
    }

    // Check obvious private hostnames
    if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname.endsWith('.local')) {
      return { safe: false, reason: `Private hostname blocked: ${hostname}` };
    }

    return { safe: true };
  } catch (e: any) {
    return { safe: false, reason: `Invalid URL: ${e.message}` };
  }
}
