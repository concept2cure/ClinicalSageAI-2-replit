/**
 * /readyz reports whether the virus scanner answers (MR-08 stage 1).
 *
 * Production refuses every upload it cannot scan (middleware/uploadSafety.ts:
 * 503 FILE_SCAN_UNAVAILABLE). /readyz checked the database, the schema, AnA,
 * the vault store and Redis, but not clamd, so a process whose scanner had
 * gone away reported ready and then refused every file. The deploy's post-roll
 * smoke reads /readyz, so it has to say this.
 *
 * Production with CLAMAV_HOST set: the clamd ping decides ok or down. With it
 * unset: down (uploads are refused). Outside production: skipped, as the scan is.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import net from 'node:net';
import request from 'supertest';

vi.mock('../../services/storage', () => ({
  getStorageProvider: () => ({ name: 's3', isAvailable: async () => true }),
}));

import { mountFastPathHealthEndpoints } from '../inline-endpoints';
import { setSchemaReadiness } from '../readiness-state';
import { setAnaReadiness } from '../ana-readiness-state';
import { __testing as virusScanTesting, PING_CACHE_MS } from '../../utils/virusScan';

const okPool = { query: async () => ({ rows: [{ '?column?': 1 }] }) } as never;

function appWithHealth() {
  const app = express();
  mountFastPathHealthEndpoints(app, okPool);
  return app;
}

const ENV_KEYS = ['NODE_ENV', 'CLAMAV_HOST', 'CLAMAV_PORT', 'REDIS_URL', 'REDIS_TLS_URL'] as const;
let savedEnv: Record<string, string | undefined> = {};
const servers: net.Server[] = [];

/** A clamd stand-in on an ephemeral port; `onSocket` decides how it answers. */
async function fakeClamd(onSocket: (socket: net.Socket) => void): Promise<number> {
  const server = net.createServer(onSocket);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as net.AddressInfo).port;
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  delete process.env.REDIS_URL;
  delete process.env.REDIS_TLS_URL;
  // Every other dependency healthy, so the scanner is the only variable.
  setSchemaReadiness('ready');
  setAnaReadiness('ready', 'test fixture: AnA provider pinned healthy');
  virusScanTesting.resetPingCache?.();
});

afterEach(async () => {
  vi.useRealTimers();
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  );
});

describe('/readyz and the virus scanner', () => {
  it('is not ready, and does not hang, when clamd accepts and never answers', async () => {
    const held: net.Socket[] = [];
    const port = await fakeClamd((socket) => {
      held.push(socket); // accept, read nothing back
      socket.on('error', () => {});
    });
    process.env.NODE_ENV = 'production';
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(port);
    const started = Date.now();
    const res = await request(appWithHealth()).get('/readyz');
    held.forEach((s) => s.destroy());
    expect(res.status).toBe(503);
    expect(res.body.dependencies.virusScan).toBe('down');
    expect(res.body.failed).toContain('virusScan');
    expect(Date.now() - started).toBeLessThan(8_000);
  }, 15_000);

  it('is ready, and says the scanner is ok, when clamd answers PONG', async () => {
    const port = await fakeClamd((socket) => {
      socket.on('data', (chunk) => {
        if (chunk.toString('latin1').startsWith('zPING\0')) socket.end('PONG\0');
      });
    });
    process.env.NODE_ENV = 'production';
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(port);
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.dependencies.virusScan).toBe('ok');
  });

  it('is not ready in production when no scanner is configured', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CLAMAV_HOST;
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.dependencies.virusScan).toBe('down');
  });

  it('skips the scanner outside production, as the scan does', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CLAMAV_HOST;
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.dependencies.virusScan).toBe('skipped');
  });

  // A malformed CLAMAV_PORT made the ping's socket.connect throw; /readyz then
  // answered a bare 500 instead of saying the scanner is down.
  it('says the scanner is down (503), not a bare 500, when CLAMAV_PORT is malformed', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = 'abc';
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.dependencies.virusScan).toBe('down');
  });

  // The cache bound, at the endpoint, with a faked clock (Date only: the
  // sockets' own timers stay real). Literals, not PING_CACHE_MS.
  it('reuses one zPING for 30 s: ok after clamd goes away inside the window, down after it', async () => {
    expect(PING_CACHE_MS).toBe(30_000);
    let connections = 0;
    let pings = 0;
    const live: net.Socket[] = [];
    const port = await fakeClamd((socket) => {
      connections++;
      live.push(socket);
      socket.on('error', () => {});
      socket.on('data', (chunk) => {
        if (!chunk.toString('latin1').startsWith('zPING\0')) return;
        pings++;
        socket.end('PONG\0');
      });
    });
    process.env.NODE_ENV = 'production';
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(port);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
    const app = appWithHealth();

    const first = await request(app).get('/readyz');
    expect(first.body.dependencies.virusScan).toBe('ok');
    vi.setSystemTime(new Date('2026-10-18T12:00:10Z'));
    const second = await request(app).get('/readyz');
    expect(second.body.dependencies.virusScan).toBe('ok');
    expect(pings).toBe(1);
    expect(connections).toBe(1);

    // clamd goes away.
    const server = servers.splice(0)[0];
    live.forEach((s) => s.destroy());
    await new Promise<void>((resolve) => server.close(() => resolve()));

    vi.setSystemTime(new Date('2026-10-18T12:00:29.999Z'));
    const inside = await request(app).get('/readyz');
    expect(inside.status).toBe(200);
    expect(inside.body.dependencies.virusScan).toBe('ok');

    vi.setSystemTime(new Date('2026-10-18T12:00:30Z'));
    const after = await request(app).get('/readyz');
    expect(after.status).toBe(503);
    expect(after.body.dependencies.virusScan).toBe('down');
    expect(pings).toBe(1);
  }, 15_000);
});
