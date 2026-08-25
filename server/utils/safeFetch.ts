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
 * REDIRECTS: pinning the FIRST socket is not enough on its own. `fetch` follows
 * 3xx by default, and Node's socket layer skips a custom `lookup` for IP-literal
 * hosts — so a public host that 302-redirects to `http://169.254.169.254/…`
 * would connect straight to the metadata service, bypassing the pin entirely.
 * We therefore set `redirect: 'manual'` and follow redirects OURSELVES, re-running
 * the FULL guard (steps 1–3) on every hop with a bounded hop count. A hop to a
 * private/metadata literal, a non-https target, or a name that resolves to a
 * private IP is rejected. Credentials (Authorization / Cookie) are stripped on a
 * cross-origin hop so a redirect cannot exfiltrate a tenant's token to a third
 * party, and method/body are rewritten per the WHATWG fetch redirect rules.
 *
 * IP-literal hosts are already fully validated by step 1 and cannot be rebound,
 * so they skip DNS/pinning and fetch directly (behaviour-preserving) — but still
 * go through the manual redirect loop.
 *
 * Callers keep passing their own `signal` (timeouts/abort) through `init`; this
 * helper never imposes its own request timeout. It only adds a bounded DNS
 * lookup so a hung resolver cannot pin a worker. A caller may set
 * `init.redirect` to `'manual'` (return the 3xx untouched) or `'error'` (throw
 * on any redirect); the default is to follow with per-hop re-validation.
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

/** Maximum number of redirect hops we will follow before failing closed. */
const MAX_REDIRECTS = 5;

/** Redirect status codes we follow (when redirect handling is enabled). */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Headers stripped when a redirect crosses to a different origin. */
const CROSS_ORIGIN_STRIP = ['authorization', 'cookie', 'proxy-authorization'];

/** Entity headers dropped when a redirect rewrites the method to GET. */
const ENTITY_HEADERS = [
  'content-type',
  'content-length',
  'content-encoding',
  'content-language',
  'content-location',
];

export interface SafeFetchOptions {
  /** Milliseconds allowed for DNS resolution before failing closed. Default 5000. */
  dnsTimeoutMs?: number;
}

/**
 * Fetch `rawUrl` only if it is a public https endpoint whose hostname resolves
 * exclusively to public IPs, pinning the socket to those IPs, and re-validating
 * every redirect hop the same way. Throws (fails closed) on a non-https/private
 * literal, a resolution failure, any resolved private/metadata address, a
 * private/non-https redirect target, or too many redirects. Otherwise behaves
 * like `fetch(rawUrl, init)` with `redirect: 'follow'`.
 */
export async function safeFetch(
  rawUrl: string,
  init?: RequestInit,
  context = 'outbound request',
  options?: SafeFetchOptions,
): Promise<Response> {
  const redirectMode = init?.redirect ?? 'follow';

  let currentUrl = rawUrl;
  let currentInit: RequestInit = { ...init };

  for (let hop = 0; ; hop++) {
    // Every hop is validated + pinned from scratch; a redirect Location never
    // rides on the previous hop's validation.
    const res = await performGuardedRequest(currentUrl, currentInit, context, options);

    const location = res.status && REDIRECT_STATUSES.has(res.status)
      ? res.headers.get('location')
      : null;

    // Not a redirect, no Location, or the caller asked us not to follow.
    if (!location || redirectMode === 'manual') {
      return res;
    }
    if (redirectMode === 'error') {
      throw new Error(
        `Refused ${context}: unexpected redirect (HTTP ${res.status} -> ${location}); ` +
          'caller requested no redirect following.',
      );
    }
    if (hop >= MAX_REDIRECTS) {
      throw new Error(`Refused ${context}: too many redirects (> ${MAX_REDIRECTS}).`);
    }

    // Free the redirect response's socket before issuing the next hop.
    await cancelBody(res);

    const nextUrl = resolveLocation(location, currentUrl, context);
    currentInit = buildRedirectInit(currentInit, currentUrl, nextUrl, res.status);
    currentUrl = nextUrl;
  }
}

/**
 * Validate + pin + issue a SINGLE request (no redirect following). Returns the
 * raw response — including a 3xx — so the caller loop can re-validate the hop.
 */
async function performGuardedRequest(
  rawUrl: string,
  init: RequestInit,
  context: string,
  options?: SafeFetchOptions,
): Promise<Response> {
  // Step 1: literal hostname + scheme guard (https only, no literal private host).
  assertSafePublicUrl(rawUrl, context);

  const host = new URL(rawUrl).hostname.replace(/^\[|\]$/g, '');

  // Force manual redirect handling: we follow hops ourselves so each one is
  // re-validated. Without this, undici would follow a 302 to an IP-literal
  // private host, and Node skips the pinned lookup for IP literals.
  const baseInit: RequestInit = { ...init, redirect: 'manual' };

  // IP literals are fully validated by step 1 and cannot be DNS-rebound.
  if (isIP(host) !== 0) {
    return fetch(rawUrl, baseInit);
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
  const requestInit = { ...baseInit, dispatcher: agent } as unknown as RequestInit;
  return fetch(rawUrl, requestInit);
}

/** Resolve a (possibly relative) Location against the current URL. */
function resolveLocation(location: string, currentUrl: string, context: string): string {
  try {
    return new URL(location, currentUrl).toString();
  } catch {
    throw new Error(`Refused ${context}: redirect Location "${location}" is not a valid URL.`);
  }
}

/**
 * Derive the next hop's init from the current one, applying the WHATWG fetch
 * redirect rules: 303 (and 301/302 on POST) become GET with the body dropped;
 * 307/308 preserve method and body. Credentials are stripped on a cross-origin
 * hop so a redirect cannot leak a tenant token to a third party.
 */
function buildRedirectInit(
  init: RequestInit,
  fromUrl: string,
  toUrl: string,
  status: number,
): RequestInit {
  const next: RequestInit = { ...init };
  const method = (init.method ?? 'GET').toUpperCase();

  const downgradeToGet =
    status === 303 || ((status === 301 || status === 302) && method === 'POST');

  let headers = new Headers(init.headers ?? undefined);

  if (downgradeToGet) {
    next.method = 'GET';
    delete (next as { body?: unknown }).body;
    for (const h of ENTITY_HEADERS) headers.delete(h);
  }

  if (differentOrigin(fromUrl, toUrl)) {
    for (const h of CROSS_ORIGIN_STRIP) headers.delete(h);
  }

  next.headers = headers;
  // The per-hop dispatcher is rebuilt in performGuardedRequest; never carry one
  // across hops.
  delete (next as { dispatcher?: unknown }).dispatcher;
  return next;
}

/** True when two URLs have different origins (scheme, host, or port differ). */
function differentOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin !== new URL(b).origin;
  } catch {
    return true; // fail safe: treat as cross-origin and strip credentials
  }
}

/** Cancel a response body stream, ignoring errors, to release the socket. */
async function cancelBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    /* already consumed / not cancelable */
  }
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
