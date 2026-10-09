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

  it('Canonical is built on APP_URL, the origin Terraform sets, not on the Host header (P1-14 / INF-32)', async () => {
    const prev = { url: process.env.APP_URL, base: process.env.APP_BASE_URL };
    process.env.APP_URL = 'https://app.example.test/';
    delete process.env.APP_BASE_URL;
    try {
      const res = await request(app).get('/.well-known/security.txt').set('Host', 'evil.example');
      expect(res.text).toMatch(/^Canonical: https:\/\/app\.example\.test\/\.well-known\/security\.txt$/m);
      expect(res.text).not.toMatch(/evil\.example/);
    } finally {
      if (prev.url === undefined) delete process.env.APP_URL; else process.env.APP_URL = prev.url;
      if (prev.base === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = prev.base;
    }
  });

  it('the Policy URL it advertises is served by this same router (P1-14 / INF-32)', async () => {
    const txt = await request(app).get('/.well-known/security.txt');
    const m = txt.text.match(/^Policy: (\S+)$/m);
    expect(m).toBeTruthy();
    const policyPath = new URL(m![1]).pathname;
    expect(policyPath.startsWith('/.well-known/')).toBe(true);
    const policy = await request(app).get(policyPath);
    expect(policy.status).toBe(200);
    expect(policy.headers['content-type']).toMatch(/text\/(plain|markdown)/);
    expect(policy.text).toMatch(/security@/);
    expect(policy.text).toMatch(/Reporting a Vulnerability/i);
  });

  it('Expires is a future date (never stale)', async () => {
    const res = await request(app).get('/.well-known/security.txt');
    const m = res.text.match(/^Expires: (.+)$/m);
    expect(m).toBeTruthy();
    expect(new Date(m![1]).getTime()).toBeGreaterThan(Date.now());
  });
});
