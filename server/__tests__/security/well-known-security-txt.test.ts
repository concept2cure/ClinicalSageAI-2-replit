/**
 * Verifies the RFC 9116 /.well-known/security.txt disclosure endpoint.
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import wellKnown from '../../routes/well-known';

describe('RFC 9116 security.txt', () => {
  const app = express();
  app.use('/.well-known', wellKnown);

  it('serves a valid security.txt (Contact, Expires, Canonical)', async () => {
    const res = await request(app).get('/.well-known/security.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/^Contact: mailto:/m);
    expect(res.text).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T/m);
    expect(res.text).toMatch(/^Canonical: .*\/\.well-known\/security\.txt$/m);
  });

  it('Expires is a future date (never stale)', async () => {
    const res = await request(app).get('/.well-known/security.txt');
    const m = res.text.match(/^Expires: (.+)$/m);
    expect(m).toBeTruthy();
    expect(new Date(m![1]).getTime()).toBeGreaterThan(Date.now());
  });
});
