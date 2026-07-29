/**
 * Unit tests for the CIDR matcher (server/utils/cidr.ts). Subnet math is a
 * security boundary for tenant IP allowlists, so the edges are covered
 * explicitly: prefix boundaries, /0 and /32, family mismatches, IPv4-mapped
 * IPv6, IPv6 `::` elision, and malformed input (which must fail closed).
 */

import { describe, it, expect } from 'vitest';
import { ipInCidr, ipInAnyCidr, isValidCidr } from '../../utils/cidr';

describe('ipInCidr — IPv4', () => {
  it('matches inside a /24', () => {
    expect(ipInCidr('192.168.1.50', '192.168.1.0/24')).toBe(true);
    expect(ipInCidr('192.168.1.255', '192.168.1.0/24')).toBe(true);
  });
  it('rejects outside a /24', () => {
    expect(ipInCidr('192.168.2.1', '192.168.1.0/24')).toBe(false);
  });
  it('honours the /16 boundary', () => {
    expect(ipInCidr('10.0.255.255', '10.0.0.0/16')).toBe(true);
    expect(ipInCidr('10.1.0.0', '10.0.0.0/16')).toBe(false);
  });
  it('treats a bare IP as /32 (exact host)', () => {
    expect(ipInCidr('203.0.113.7', '203.0.113.7')).toBe(true);
    expect(ipInCidr('203.0.113.8', '203.0.113.7')).toBe(false);
    expect(ipInCidr('203.0.113.7', '203.0.113.7/32')).toBe(true);
  });
  it('/0 matches everything', () => {
    expect(ipInCidr('1.2.3.4', '0.0.0.0/0')).toBe(true);
  });
  it('matches an IPv4-mapped IPv6 source against an IPv4 CIDR', () => {
    expect(ipInCidr('::ffff:192.168.1.10', '192.168.1.0/24')).toBe(true);
    expect(ipInCidr('::ffff:127.0.0.1', '127.0.0.1')).toBe(true);
  });
});

describe('ipInCidr — IPv6', () => {
  it('matches inside a /64', () => {
    expect(ipInCidr('2001:db8::1', '2001:db8::/32')).toBe(true);
    expect(ipInCidr('2001:db8:0:0:abcd::1', '2001:db8::/32')).toBe(true);
  });
  it('rejects outside the prefix', () => {
    expect(ipInCidr('2001:db9::1', '2001:db8::/32')).toBe(false);
  });
  it('exact host match (/128) and bare IPv6', () => {
    expect(ipInCidr('::1', '::1')).toBe(true);
    expect(ipInCidr('::2', '::1/128')).toBe(false);
  });
});

describe('ipInCidr — family mismatch & malformed', () => {
  it('never matches across families', () => {
    expect(ipInCidr('2001:db8::1', '192.168.0.0/16')).toBe(false);
    expect(ipInCidr('192.168.1.1', '2001:db8::/32')).toBe(false);
  });
  it('fails closed on garbage', () => {
    expect(ipInCidr('not-an-ip', '192.168.1.0/24')).toBe(false);
    expect(ipInCidr('192.168.1.1', 'garbage')).toBe(false);
    expect(ipInCidr('999.1.1.1', '999.1.1.1')).toBe(false);
    expect(ipInCidr('', '0.0.0.0/0')).toBe(false);
  });
});

describe('ipInAnyCidr', () => {
  it('matches when any range contains the ip', () => {
    expect(ipInAnyCidr('10.2.0.1', ['192.168.0.0/16', '10.2.0.0/16'])).toBe(true);
  });
  it('false on empty list and no match', () => {
    expect(ipInAnyCidr('8.8.8.8', [])).toBe(false);
    expect(ipInAnyCidr('8.8.8.8', ['10.0.0.0/8'])).toBe(false);
  });
});

describe('isValidCidr', () => {
  it('accepts valid IPv4/IPv6 CIDRs and bare IPs', () => {
    expect(isValidCidr('192.168.0.0/24')).toBe(true);
    expect(isValidCidr('10.0.0.1')).toBe(true);
    expect(isValidCidr('2001:db8::/32')).toBe(true);
    expect(isValidCidr('::1')).toBe(true);
    expect(isValidCidr('0.0.0.0/0')).toBe(true);
  });
  it('rejects malformed CIDRs and out-of-range prefixes', () => {
    expect(isValidCidr('192.168.0.0/33')).toBe(false);
    expect(isValidCidr('2001:db8::/129')).toBe(false);
    expect(isValidCidr('300.1.1.1/24')).toBe(false);
    expect(isValidCidr('garbage')).toBe(false);
    expect(isValidCidr('')).toBe(false);
  });
});
