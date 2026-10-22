/**
 * seed-ind-pyramid reports what it created, not a fixed tally. 2026-10-15.
 *
 * Its summary printed "TOTAL: 29 documents" and "Approved: 15 / Review: 7 /
 * Draft: 7" whatever happened. The script makes 28 create calls (6 of them
 * drafts), and it swallowed every refused status change and printed "Status
 * set to" anyway: the artifacts route refuses approve and lock without an
 * e-signature attestation, which this script never sends, so nothing it seeded
 * was approved. It now counts the artifacts the server created and the status
 * each actually reached. Run here, for real, against a stub of the four routes
 * it calls that answers as the product does.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
let server: http.Server;
let base = '';
let nextId = 100;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const send = (status: number, json: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      const url = req.url ?? '';
      if (req.method === 'POST' && url === '/api/auth/login') return send(200, { accessToken: 'stub-access-token-0123456789' });
      if (req.method === 'POST' && url.endsWith('/artifacts')) return send(201, { success: true, data: { id: nextId++ } });
      if (req.method === 'PUT' && url.endsWith('/ctd-section')) return send(200, { success: true });
      if (req.method === 'PUT' && url.endsWith('/status')) {
        const { status } = JSON.parse(body || '{}') as { status?: string };
        // Approve and lock are electronic signatures: refused without an attestation.
        if (status === 'approved' || status === 'locked') return send(400, { success: false, error: 'attestation required' });
        return send(200, { success: true });
      }
      return send(404, {});
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** The script as an operator runs it; the stub answers while it runs, so no spawnSync. */
function runScript(env: Record<string, string>) {
  return new Promise<{ status: number | null; out: string }>((resolve) => {
    const child = spawn('bash', ['scripts/seed-ind-pyramid.sh'], {
      cwd: ROOT,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
    });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (out += c));
    child.on('close', (status) => resolve({ status, out }));
  });
}

describe('seed-ind-pyramid', () => {
  it('reports the artifacts the server created and the status each reached', async () => {
    const r = await runScript({ BASE_URL: base, DEMO_EMAIL: 'demo@local.test', DEMO_PASSWORD: 'x', DEMO_PROJECT_ID: 'proj_1' });
    expect(r.status).toBe(0);
    expect(r.out).not.toMatch(/Approved: 15|TOTAL: 29|Status set to: approved/);
    expect(r.out).toContain('Artifacts this run created: 28');
    const reached = Object.fromEntries(
      [...r.out.matchAll(/^\s+(\d+) reached (\w+)$/gm)].map((m) => [m[2], Number(m[1])]),
    );
    expect(reached).toEqual({ draft: 6, review: 22 });
    const modules = Object.fromEntries(
      [...r.out.matchAll(/^\s+(\d+) in Module (\d)$/gm)].map((m) => [m[2], Number(m[1])]),
    );
    expect(modules).toEqual({ 1: 7, 2: 5, 3: 5, 4: 6, 5: 5 });
  }, 120_000);
});
