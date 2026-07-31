/**
 * SSRF guard for outbound, tenant-controlled URLs.
 *
 * SECURITY: connector base URLs / token endpoints and webhook delivery targets
 * are supplied by tenants. Without a guard a tenant could point an outbound
 * fetch at an internal service or the cloud metadata endpoint
 * (169.254.169.254) and turn our server into an SSRF proxy (credential theft,
 * internal port scanning). This module centralises the allow/deny decision so
 * every outbound sink shares one audited implementation.
 *
 * Only https to a public host is allowed. Private, loopback, link-local,
 * unique-local and metadata destinations are rejected by hostname inspection,
 * and non-https schemes are rejected outright.
 *
 * NOTE: hostname inspection does not by itself defeat DNS rebinding (a public
 * name resolving to a private IP at fetch time). Mitigation is to validate at
 * BOTH credential-storage time and immediately before each outbound fetch, so a
 * literal private destination can never be stored or used.
 *
 * @module server/utils/ssrfGuard
 */

/**
 * True when `rawUrl` is a public https endpoint safe to fetch.
 * Returns false for invalid URLs, non-https schemes, and private/loopback/
 * link-local/unique-local/metadata hosts.
 */
export function isSafePublicUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return isSafePublicHost(url.hostname);
}

/**
 * True when `hostname` (a URL hostname, IPv6 may be bracketed) is a public host
 * — i.e. not localhost, not an internal TLD, and not a private/reserved IP
 * literal. Exposed separately so callers that already hold a parsed host can
 * re-check it.
 */
export function isSafePublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host.length === 0) return false;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return false;
  }
  // IPv6 loopback (::1), unique-local (fc00::/7 → fc/fd) and link-local (fe80::).
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    return false;
  }
  // IPv4 — plain literal, OR IPv4-mapped IPv6 (::ffff:127.0.0.1, and Node's hex
  // serialization ::ffff:7f00:1). Without unifying these, a mapped form smuggles
  // a private/metadata target (e.g. https://[::ffff:169.254.169.254]/) past both
  // the IPv6 prefix checks and the dotted-IPv4 check.
  const ipv4 = extractEmbeddedIpv4(host);
  if (ipv4 && isPrivateIpv4(ipv4[0], ipv4[1])) return false;
  // Fail closed on any IPv4-mapped form we could not parse to a public address.
  if (host.startsWith('::ffff:') && !ipv4) return false;

  return true;
}

/** IPv4 first-two-octets test for private / reserved / metadata ranges. */
function isPrivateIpv4(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true;        // this-net, private, loopback
  if (a === 169 && b === 254) return true;                  // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;         // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                  // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;        // CGNAT 100.64.0.0/10
  if (a >= 224) return true;                                // multicast / reserved
  return false;
}

/**
 * Extract an embedded IPv4 from a lowercased, de-bracketed host: a plain dotted
 * quad, an IPv4-mapped IPv6 in dotted form (::ffff:1.2.3.4), or Node's hex
 * serialization of the same (::ffff:HHHH:HHHH). Returns null when the host
 * carries no IPv4 (a real domain, or a genuine public IPv6 which stays allowed).
 */
function extractEmbeddedIpv4(host: string): [number, number, number, number] | null {
  const dotted = host.match(/(?:^|:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) {
    return [Number(dotted[1]), Number(dotted[2]), Number(dotted[3]), Number(dotted[4])];
  }
  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
  }
  return null;
}

/**
 * Throw if `rawUrl` is not a public https endpoint. Use immediately before an
 * outbound fetch in connectors so a private/metadata target can never be hit.
 */
export function assertSafePublicUrl(rawUrl: string, context = 'outbound request'): void {
  if (!isSafePublicUrl(rawUrl)) {
    throw new Error(
      `Refused ${context}: URL is not a public https endpoint (private/loopback/link-local/metadata hosts and non-https are blocked)`
    );
  }
}
