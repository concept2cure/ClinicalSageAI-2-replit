/**
 * clientIpOf — the one reader of a request's client address (D6). Every
 * e-signature, QMS approval, financial-disclosure signature, §11.10(e) trail
 * row and rate-limit key that used to parse X-Forwarded-For by hand reads it
 * here; scripts/ci/check-client-ip-single-source.mjs keeps it that way.
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { resolveTrustProxy } from '../../config/trust-proxy';
import { clientIpKey, clientIpOf } from '../client-ip';

/** An app as production configures it, answering with what clientIpOf reads. */
function app(env: Record<string, string | undefined>) {
  const a = express();
  a.set('trust proxy', resolveTrustProxy(env).hops);
  a.get('/ip', (req, res) => res.json({ ip: clientIpOf(req), key: clientIpKey(req) }));
  return a;
}

describe('clientIpOf', () => {
  it('in production, the address the load balancer appended, never the one the client wrote', async () => {
    const r = await request(app({ NODE_ENV: 'production' }))
      .get('/ip')
      .set('X-Forwarded-For', '6.6.6.6, 203.0.113.9');
    expect(r.body.ip).toBe('203.0.113.9');
  });

  it('with no proxy trusted, the socket peer: a forwarding header changes nothing', async () => {
    const r = await request(app({ NODE_ENV: 'development' })).get('/ip').set('X-Forwarded-For', '6.6.6.6');
    expect(r.body.ip).not.toBe('6.6.6.6');
    expect(r.body.ip).toMatch(/127\.0\.0\.1|::1/);
  });

  it.each([
    ['no request', undefined, null],
    ['no address', {}, null],
    ['not an address', { ip: 'unknown' }, null],
    ['blank', { ip: '  ' }, null],
    ['IPv4', { ip: '203.0.113.9' }, '203.0.113.9'],
    ['IPv6', { ip: '2001:db8::1' }, '2001:db8::1'],
    ['IPv4-mapped IPv6', { ip: '::ffff:203.0.113.9' }, '::ffff:203.0.113.9'],
  ])('%s', (_what, req, expected) => {
    expect(clientIpOf(req as never)).toBe(expected);
  });

  it('clientIpKey gives a key a limiter can use, and says unknown rather than inventing an address', () => {
    expect(clientIpKey({ ip: '203.0.113.9' })).toBe('203.0.113.9');
    expect(clientIpKey({})).toBe('unknown');
  });
});
