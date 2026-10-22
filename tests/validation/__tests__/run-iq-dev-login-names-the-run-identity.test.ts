/**
 * IQ-10 signs in as the run identity the operator names, never a built-in one.
 * 2026-10-15.
 *
 * scripts/validation/run-iq.mjs posted VALIDATION_USER_EMAIL to dev-login and,
 * when it was unset, a real person's personal address, so an IQ run nobody
 * configured signed in as them on any server that answers dev-login. Now,
 * where dev-login answers by configuration, IQ-10 records a deviation naming
 * VALIDATION_USER_EMAIL instead of signing in as anyone; where it must refuse,
 * the probe carries no identity. The runner is executed as written against a
 * stub server; its evidence goes to a temporary directory.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
let server: http.Server;
let base = '';
let devLoginAnswers = 200;
const devLoginBodies: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/auth/dev-login') {
        devLoginBodies.push(body);
        res.statusCode = devLoginAnswers;
        return res.end(JSON.stringify(devLoginAnswers === 200 ? { accessToken: 'stub' } : {}));
      }
      res.statusCode = 404;
      return res.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** Run the IQ runner; returns its IQ-10 record. */
async function runIq(env: Record<string, string>) {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'iq-identity-'));
  try {
    await new Promise<void>((resolve) => {
      const child = spawn(process.execPath, ['scripts/validation/run-iq.mjs'], {
        cwd: ROOT,
        env: {
          PATH: process.env.PATH ?? '',
          HOME: process.env.HOME ?? '',
          VALIDATION_BASE_URL: base,
          VALIDATION_EVIDENCE_ROOT: evidence,
          DATABASE_URL: '', // the checkout's .env must not send this run to a database
          ...env,
        },
        stdio: 'ignore',
      });
      child.on('close', () => resolve());
    });
    const result = JSON.parse(fs.readFileSync(path.join(evidence, 'IQ', 'iq-results.json'), 'utf8'));
    return result.checks.find((c: { id: string }) => c.id === 'IQ-10') as { status: string; observed: string };
  } finally {
    fs.rmSync(evidence, { recursive: true, force: true });
  }
}

describe('IQ-10 run identity', () => {
  it('where dev-login answers and no identity is named, signs in as no one and records a deviation', async () => {
    devLoginBodies.length = 0;
    devLoginAnswers = 200;
    const iq10 = await runIq({ NODE_ENV: 'development', ALLOW_DEV_AUTH: '1' });
    expect(devLoginBodies).toEqual([]);
    expect(iq10.status).toBe('deviation');
    expect(iq10.observed).toContain('VALIDATION_USER_EMAIL');
  }, 120_000);

  it('signs in as the identity the operator names', async () => {
    devLoginBodies.length = 0;
    devLoginAnswers = 200;
    await runIq({ NODE_ENV: 'development', ALLOW_DEV_AUTH: '1', VALIDATION_USER_EMAIL: 'iq-runner@local.test' });
    expect(devLoginBodies.map((b) => JSON.parse(b))).toEqual([{ email: 'iq-runner@local.test' }]);
  }, 120_000);

  it('where dev-login must refuse, probes it with no identity and passes on the 404', async () => {
    devLoginBodies.length = 0;
    devLoginAnswers = 404;
    const iq10 = await runIq({ NODE_ENV: 'test', ALLOW_DEV_AUTH: '0' });
    expect(devLoginBodies.map((b) => JSON.parse(b))).toEqual([{}]);
    expect(iq10.status).toBe('pass');
  }, 120_000);
});
