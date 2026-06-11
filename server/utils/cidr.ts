/**
 * CIDR / IP-range matching for tenant network-access policies.
 *
 * Used by the SCIM IP allowlist (and reusable for any per-tenant source-IP
 * restriction). Pure, dependency-free, and exhaustively unit-tested — getting
 * subnet math wrong is a security bug, so the logic is deliberately explicit.
 *
 * Supports IPv4 and IPv6, including IPv4-mapped IPv6 (`::ffff:a.b.c.d`) — the
 * form Node hands back as `req.ip` when the listener is dual-stack — by
 * normalising a mapped address to its IPv4 form before comparison.
 */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    n = n * 256 + octet;
  }
  return n >>> 0;
}

/** Strip an IPv4-mapped IPv6 prefix (`::ffff:1.2.3.4` → `1.2.3.4`). */
function unmapIpv4(ip: string): string {
  const m = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(ip);
  return m ? m[1] : ip;
}

function ipv6ToBigInt(ip: string): bigint | null {
  // Reject anything that clearly isn't IPv6 before the expensive parse.
  if (!ip.includes(':')) return null;

  // An embedded IPv4 tail (e.g. ::ffff:1.2.3.4 or 2001:db8::1.2.3.4) — convert
  // the tail to two hextets so the rest can be parsed uniformly.
  const lastColon = ip.lastIndexOf(':');
  const tail = ip.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = ipv4ToInt(tail);
    if (v4 === null) return null;
    const hi = (v4 >>> 16) & 0xffff;
    const lo = v4 & 0xffff;
    ip = `${ip.slice(0, lastColon + 1)}${hi.toString(16)}:${lo.toString(16)}`;
  }

  const halves = ip.split('::');
  if (halves.length > 2) return null; // at most one '::'

  const head = halves[0] ? halves[0].split(':') : [];
  const back = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : null;

  let groups: string[];
  if (back === null) {
    groups = head;
    if (groups.length !== 8) return null; // no '::' → must be full
  } else {
    const missing = 8 - head.length - back.length;
    if (missing < 1) return null; // '::' must elide at least one group
    groups = [...head, ...Array(missing).fill('0'), ...back];
  }
  if (groups.length !== 8) return null;

  let value = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    value = (value << 16n) | BigInt(parseInt(g, 16));
  }
  return value;
}

/** True when `cidr` is a syntactically valid IPv4 or IPv6 CIDR (or bare IP). */
export function isValidCidr(cidr: string): boolean {
  if (typeof cidr !== 'string' || cidr.length === 0 || cidr.length > 64) return false;
  const slash = cidr.indexOf('/');
  const addr = slash === -1 ? cidr : cidr.slice(0, slash);
  const prefixStr = slash === -1 ? null : cidr.slice(slash + 1);

  const v4 = ipv4ToInt(unmapIpv4(addr));
  if (v4 !== null) {
    if (prefixStr === null) return true;
    return /^\d{1,2}$/.test(prefixStr) && Number(prefixStr) <= 32;
  }
  const v6 = ipv6ToBigInt(addr);
  if (v6 !== null) {
    if (prefixStr === null) return true;
    return /^\d{1,3}$/.test(prefixStr) && Number(prefixStr) <= 128;
  }
  return false;
}

/**
 * True when `ip` falls within `cidr`. A bare IP (no `/prefix`) is treated as an
 * exact host match (/32 or /128). Mismatched families (v4 ip vs v6 cidr) are
 * never a match. Invalid input returns false (callers fail closed).
 */
export function ipInCidr(ip: string, cidr: string): boolean {
  if (typeof ip !== 'string' || typeof cidr !== 'string') return false;
  const slash = cidr.indexOf('/');
  const cidrAddr = slash === -1 ? cidr : cidr.slice(0, slash);
  const prefixStr = slash === -1 ? null : cidr.slice(slash + 1);

  const ipV4 = ipv4ToInt(unmapIpv4(ip));
  const cidrV4 = ipv4ToInt(unmapIpv4(cidrAddr));
  if (ipV4 !== null && cidrV4 !== null) {
    const prefix = prefixStr === null ? 32 : Number(prefixStr);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
    if (prefix === 0) return true;
    const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
    return (ipV4 & mask) >>> 0 === (cidrV4 & mask) >>> 0;
  }

  const ipV6 = ipv6ToBigInt(ip);
  const cidrV6 = ipv6ToBigInt(cidrAddr);
  if (ipV6 !== null && cidrV6 !== null) {
    const prefix = prefixStr === null ? 128 : Number(prefixStr);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) return false;
    if (prefix === 0) return true;
    const mask = ((1n << BigInt(prefix)) - 1n) << BigInt(128 - prefix);
    return (ipV6 & mask) === (cidrV6 & mask);
  }

  return false;
}

/** True when `ip` matches ANY of the CIDRs. Empty list → false. */
export function ipInAnyCidr(ip: string, cidrs: readonly string[]): boolean {
  for (const cidr of cidrs) {
    if (ipInCidr(ip, cidr)) return true;
  }
  return false;
}
