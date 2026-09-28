/**
 * The client address of a request: the one answer every audit row, e-signature
 * record, rate-limit key and allow-list check uses.
 *
 * It is `req.ip`, which Express resolves from the socket and the X-Forwarded-For
 * entries the configured proxies appended (server/config/trust-proxy.ts). With
 * one trusted hop that is the address the load balancer received the
 * connection from; no client can choose it.
 *
 * What this replaces (D6, 2026-09-23): about twenty places parsed
 * X-Forwarded-For by hand and took its LEFT-MOST entry, the one every client
 * writes. The load balancer appends to that header; it does not replace it.
 * So a signer could put any address they liked into the electronic_signatures
 * row, the QMS approval, the financial-disclosure signature, the §11.10(e)
 * trail, and the enterprise sign-in limit's key. Once trust proxy was set,
 * those sites and req.ip gave two different addresses for one request in one
 * Part 11 trail. scripts/ci/check-client-ip-single-source.mjs keeps the header
 * from being read anywhere else.
 */
import { isIP } from 'node:net';

/** Anything with Express's `ip` (a Request, or a test double of one). */
export interface HasClientIp {
  ip?: string | null;
}

/**
 * The request's client address, or null when there is none that is an IP
 * address (INET columns accept NULL; "unknown" is not an address).
 */
export function clientIpOf(req: HasClientIp | null | undefined): string | null {
  const ip = req?.ip;
  if (typeof ip !== 'string') return null;
  const trimmed = ip.trim();
  return isIP(trimmed) === 0 ? null : trimmed;
}

/** For a rate-limit or quota key, which needs a string: the address, or 'unknown'. */
export function clientIpKey(req: HasClientIp | null | undefined): string {
  return clientIpOf(req) ?? 'unknown';
}
