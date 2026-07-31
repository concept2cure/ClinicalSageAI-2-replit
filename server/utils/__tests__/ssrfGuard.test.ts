import { describe, it, expect } from 'vitest';
import { isSafePublicUrl, isSafePublicHost, assertSafePublicUrl } from '../ssrfGuard';

describe('isSafePublicUrl', () => {
  it('allows public https endpoints', () => {
    expect(isSafePublicUrl('https://example.com')).toBe(true);
    expect(isSafePublicUrl('https://api.fda.gov/drug/label.json')).toBe(true);
    expect(isSafePublicUrl('https://8.8.8.8')).toBe(true);
    expect(isSafePublicUrl('https://[2606:4700:4700::1111]/')).toBe(true);
  });

  it('rejects non-https schemes', () => {
    for (const u of ['http://example.com', 'ftp://example.com', 'file:///etc/passwd', 'gopher://x']) {
      expect(isSafePublicUrl(u)).toBe(false);
    }
  });

  it('rejects malformed URLs', () => {
    expect(isSafePublicUrl('not a url')).toBe(false);
    expect(isSafePublicUrl('')).toBe(false);
  });

  it('rejects private / loopback / metadata destinations', () => {
    for (const u of [
      'https://127.0.0.1',
      'https://10.0.0.5',
      'https://169.254.169.254', // cloud metadata
      'https://192.168.1.1',
      'https://172.16.0.1',
      'https://localhost',
    ]) {
      expect(isSafePublicUrl(u)).toBe(false);
    }
  });

  it('rejects the IPv4-mapped IPv6 bypass (regression)', () => {
    // Node serializes these hostnames to the hex form ::ffff:HHHH:HHHH.
    expect(isSafePublicUrl('https://[::ffff:169.254.169.254]/')).toBe(false); // metadata
    expect(isSafePublicUrl('https://[::ffff:127.0.0.1]/')).toBe(false); // loopback
    expect(isSafePublicUrl('https://[::ffff:10.0.0.1]/')).toBe(false); // private
  });
});

describe('isSafePublicHost — blocked', () => {
  it.each([
    'localhost',
    'app.localhost',
    'db.local',
    'svc.internal',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '0.0.0.0',
    '10.1.2.3',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '100.64.0.1',
    '100.127.255.255',
    '224.0.0.1',
    '240.0.0.1',
    // IPv4-mapped IPv6 — dotted and hex forms
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1', // 127.0.0.1
    '::ffff:a9fe:a9fe', // 169.254.169.254
  ])('blocks %s', (host) => {
    expect(isSafePublicHost(host)).toBe(false);
  });
});

describe('isSafePublicHost — allowed', () => {
  it.each([
    'example.com',
    'api.fda.gov',
    '8.8.8.8',
    '1.1.1.1',
    '172.15.0.1', // just below the 172.16/12 block
    '172.32.0.1', // just above
    '192.169.0.1', // not 192.168
    '100.63.0.1', // just below CGNAT
    '100.128.0.1', // just above CGNAT
    '223.255.255.255', // just below multicast
    '2606:4700:4700::1111', // public IPv6 (Cloudflare)
    '2001:4860:4860::8888', // public IPv6 (Google)
    '::ffff:8.8.8.8', // public IPv4-mapped stays allowed
    '::ffff:0808:0808', // 8.8.8.8 in hex form
  ])('allows %s', (host) => {
    expect(isSafePublicHost(host)).toBe(true);
  });
});

describe('assertSafePublicUrl', () => {
  it('throws for an unsafe URL with the context in the message', () => {
    expect(() => assertSafePublicUrl('https://169.254.169.254', 'connector token fetch')).toThrow(
      /connector token fetch/,
    );
    expect(() => assertSafePublicUrl('https://[::ffff:169.254.169.254]/')).toThrow();
  });

  it('does not throw for a safe URL', () => {
    expect(() => assertSafePublicUrl('https://example.com')).not.toThrow();
  });
});
