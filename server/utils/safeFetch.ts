/**
 * DNS-rebinding-resistant fetch for outbound, tenant-controlled URLs.
 *
 * SECURITY: {@link ssrfGuard} rejects a URL by HOSTNAME inspection only. As its
 * own module note says, hostname checks do not defeat DNS rebinding: a public
 * name that passed validation at credential-storage time can resolve to a
 * private / loopback / cloud-metadata IP at fetch time and turn our server into
 * an SSRF proxy (credential theft, internal port scanning).
 *
 * This helper closes that gap immediately before the outbound request:
 *   1. Re-run the literal hostname guard ({@link assertSafePublicUrl}) — https
 *      only, and reject literal private/metadata hosts up front.
 *   2. Resolve the hostname to EVERY address (`dns.lookup(host, { all: true })`)
 *      and assert each resolved IP is public via {@link isSafePublicHost}. Any
 *      private address, or a resolution failure/empty result, FAILS CLOSED.
 *   3. Pin the connection to the validated addresses: the outbound socket is
 *      forced (via an undici dispatcher with a fixed `lookup`) to connect only
 *      to the IPs we just checked, so a second DNS answer between our lookup and
 *      the actual connect (the classic rebinding TOCTOU window) cannot redirect
 *      the socket to a private target. TLS SNI and the Host header still use the
 *      original hostname, so certificate validation is unaffected.
 *
 * IP-literal hosts are already fully validated by step 1 and cannot be rebound,
 * so they skip DNS/pinning and fetch directly (behaviour-preserving).
 *
 * Callers keep passing their own `signal` (timeouts/abort) through `init`; this
 * helper never imposes its own request timeout. It only adds a bounded DNS
 * lookup so a hung resolver cannot pin a worker.
 *
 * @module server/utils/safeFetch
 */

import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { lookup as dnsLookupCb } from 'node:dns';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { Agent } from 'undici';
import { assertSafePublicUrl, isSafePublicHost } from './ssrfGuard.js';

/** Default budget for DNS resolution before failing closed. */
const DEFAULT_DNS_TIMEOUT_MS = 5000;

export interface SafeFetchOptions {
  /** Milliseconds allowed for DNS resolution before failing closed. Default 5000. */
  dnsTimeoutMs?: number;
}

/**
 * Fetch `rawUrl` only if it is a public https endpoint whose hostname resolves
 * exclusively to public IPs, pinning the socket to those IPs. Throws (fails
 * closed) on a non-https/private literal, a resolution failure, or any resolved
 * private/metadata address. Otherwise behaves like `fetch(rawUrl, init)`.
 */
export async function safeFetch(
  rawUrl: string,
  init?: RequestInit,
  context = 'outbound request',
  options?: SafeFetchOptions,
): Promise<Response> {
  // Step 1: literal hostname + scheme guard (https only, no literal private host).
  assertSafePublicUrl(rawUrl, context);

  const host = new URL(rawUrl).hostname.replace(/^\[|\]$/g, '');

  // IP literals are fully validated by step 1 and cannot be DNS-rebound.
  if (isIP(host) !== 0) {
    return fetch(rawUrl, init);
  }

  // Step 2: resolve and assert every address is public (fail closed otherwise).
  const addresses = await resolvePublicAddresses(
    host,
    options?.dnsTimeoutMs ?? DEFAULT_DNS_TIMEOUT_MS,
    context,
  );

  // Step 3: pin the connection to the validated addresses. keepAlive is kept
  // minimal so the per-request dispatcher's sockets close promptly once the
  // response body is consumed and the Agent can be garbage-collected.
  const agent = new Agent({
    connect: { lookup: makePinnedLookup(addresses) },
    keepAliveTimeout: 1,
    keepAliveMaxTimeout: 1,
  });

  // Node's global fetch (undici) accepts `dispatcher` at runtime; the DOM
  // RequestInit type does not model it, so drop it from the static type.
  const requestInit = { ...init, dispatcher: agent } as unknown as RequestInit;
  return fetch(rawUrl, requestInit);
}

/**
 * Resolve `host` to all addresses and assert each is public. Rejects on lookup
 * error, timeout, an empty result, or any private/reserved/metadata address.
 */
async function resolvePublicAddresses(
  host: string,
  dnsTimeoutMs: number,
  context: string,
): Promise<LookupAddress[]> {
  const addresses = await lookupAllWithTimeout(host, dnsTimeoutMs, context);

  if (addresses.length === 0) {
    throw new Error(`Refused ${context}: host "${host}" resolved to no addresses`);
  }
  for (const { address } of addresses) {
    if (!isSafePublicHost(address)) {
      throw new Error(
        `Refused ${context}: host "${host}" resolved to non-public address ${address} ` +
          `(possible DNS rebinding; private/loopback/link-local/metadata targets are blocked)`,
      );
    }
  }
  return addresses;
}

/** Promise-wrap `dns.lookup(host, { all: true })` with a hard timeout. */
function lookupAllWithTimeout(
  host: string,
  dnsTimeoutMs: number,
  context: string,
): Promise<LookupAddress[]> {
  return new Promise<LookupAddress[]>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Refused ${context}: DNS resolution for "${host}" timed out after ${dnsTimeoutMs}ms`));
    }, dnsTimeoutMs);
    // Do not keep the event loop alive solely for this timer.
    if (typeof timer.unref === 'function') timer.unref();

    dnsLookupCb(host, { all: true }, (err, addresses) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(new Error(`Refused ${context}: DNS resolution for "${host}" failed (${err.message})`));
        return;
      }
      resolve(addresses as LookupAddress[]);
    });
  });
}

/**
 * Build a `lookup` that ignores the hostname it is called with and always
 * returns the pre-validated addresses, pinning the socket to public IPs.
 */
function makePinnedLookup(addresses: LookupAddress[]): LookupFunction {
  const pinnedLookup = (
    _hostname: string,
    lookupOptions: LookupOptions,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ): void => {
    if (lookupOptions && lookupOptions.all) {
      callback(null, addresses.map((a) => ({ address: a.address, family: a.family })));
    } else {
      const first = addresses[0];
      callback(null, first.address, first.family);
    }
  };
  return pinnedLookup as unknown as LookupFunction;
}
