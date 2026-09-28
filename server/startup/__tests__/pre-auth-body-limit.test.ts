/**
 * The 50 MB JSON parser for /api/concept2cure ran before the auth boundary
 * (security audit 2026-09-24, IAM-18 item 7): an anonymous request could make
 * the process read and parse fifty megabytes before being refused. The large
 * parser now mounts after the boundary (applyAuthBoundary), and before it no
 * /api/concept2cure body is read at all; the 2 MB parser for the rest of /api
 * is unchanged. The prototype-pollution scrub still follows the parser.
 *
 * The app here is the production order in miniature: the pre-boundary parsers,
 * a boundary that refuses without a session, the post-boundary parser, routes.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { mountConcept2cureBodyParser, mountPreAuthBodyParsers } from '../middleware';

function app(signedIn: boolean) {
  const a = express();
  mountPreAuthBodyParsers(a);
  a.use('/api', (_req: Request, res: Response, next: NextFunction) => (signedIn ? next() : res.status(401).json({ error: { code: 'AUTH_001' } })));
  mountConcept2cureBodyParser(a);
  const echo = (req: Request, res: Response) =>
    res.json({
      parsed: typeof req.body === 'object' && req.body !== null && Object.keys(req.body).length > 0,
      bytes: typeof req.body === 'object' && req.body !== null ? JSON.stringify(req.body).length : 0,
      ownProto: Object.prototype.hasOwnProperty.call(req.body ?? {}, '__proto__'),
    });
  a.post('/api/concept2cure/echo', echo);
  a.post('/api/other/echo', echo);
  return a;
}

const megabytes = (n: number) => JSON.stringify({ blob: 'x'.repeat(n * 1024 * 1024) });
const json = { 'Content-Type': 'application/json' };

describe('the /api/concept2cure body is read only after the auth boundary', () => {
  it('an anonymous 3 MB body is refused by the boundary without being parsed: malformed JSON is 401, not 400', async () => {
    const r = await request(app(false)).post('/api/concept2cure/echo').set(json).send(megabytes(3).slice(0, -1));
    expect(r.status, 'the body was parsed before the boundary').toBe(401);
  });

  it('a signed-in 3 MB document body is still parsed (the large limit serves document bodies)', async () => {
    const r = await request(app(true)).post('/api/concept2cure/echo').set(json).send(megabytes(3));
    expect(r.status).toBe(200);
    expect(r.body.parsed).toBe(true);
    expect(r.body.bytes).toBeGreaterThan(3 * 1024 * 1024);
  });

  it('a signed-in body is scrubbed of prototype pollution after it is parsed', async () => {
    const r = await request(app(true)).post('/api/concept2cure/echo').set(json).send('{"__proto__":{"polluted":true},"a":1}');
    expect(r.status).toBe(200);
    expect(r.body.ownProto).toBe(false);
    expect(r.body.parsed).toBe(true);
  });

  it('the rest of /api keeps its 2 MB parser before the boundary: malformed JSON is 400, a 3 MB body 413', async () => {
    expect((await request(app(false)).post('/api/other/echo').set(json).send('{"a":')).status).toBe(400);
    expect((await request(app(true)).post('/api/other/echo').set(json).send(megabytes(3))).status).toBe(413);
    const r = await request(app(true)).post('/api/other/echo').set(json).send({ a: 1 });
    expect(r.body.parsed).toBe(true);
  });
});
