/**
 * The MCP evidence client signs in as the account the operator names, never a
 * built-in one. 2026-10-15.
 *
 * server/mcp/client-transcript.ts, given no MCP_TOKEN, dev-logged-in as
 * MCP_DEV_EMAIL or, when that was unset, a real person's personal address, so
 * a transcript nobody configured was produced, and every tool call it made was
 * audited, as them. Without MCP_TOKEN or MCP_DEV_EMAIL it now refuses before
 * any request. Run as written, as a separate process, against a stub server.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
let server: http.Server;
let base = '';
const devLoginBodies: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url === '/api/auth/dev-login') devLoginBodies.push(body);
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function runClient(env: Record<string, string>) {
  return new Promise<{ status: number | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/mcp/client-transcript.ts'], {
      cwd: ROOT,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', MCP_URL: `${base}/mcp`, ...env },
    });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (out += c));
    child.on('close', (status) => resolve({ status, out }));
  });
}

describe('MCP client transcript identity', () => {
  it('with no MCP_TOKEN and no MCP_DEV_EMAIL, refuses before any request', async () => {
    devLoginBodies.length = 0;
    const r = await runClient({});
    expect(devLoginBodies).toEqual([]);
    expect(r.out).toContain('MCP_DEV_EMAIL');
    expect(r.status).toBe(1);
  }, 120_000);

  it('dev-logs-in as the account MCP_DEV_EMAIL names', async () => {
    devLoginBodies.length = 0;
    const r = await runClient({ MCP_DEV_EMAIL: 'mcp-evidence@local.test' });
    expect(devLoginBodies.map((b) => JSON.parse(b))).toEqual([{ email: 'mcp-evidence@local.test' }]);
    expect(r.status).toBe(1); // the stub refuses the sign-in
  }, 120_000);
});
