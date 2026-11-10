/**
 * A request's pinned DB connection goes back to the pool however the request
 * ends, including when its client went away before the tenant scope bound it.
 *
 * Authentication is asynchronous, so a page that navigates away (or a fetch
 * that is aborted) can close its socket before `bindRequestDbClient` runs. The
 * response's 'close' has then already been emitted and is not emitted again,
 * and a response written to a closed socket never emits 'finish'. Before this
 * was handled, each such request kept the connection its handler took, and
 * about twenty of them exhausted the pool: every later request, sign-in
 * included, failed with "timeout exceeded when trying to connect".
 */
import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import type { Pool, PoolClient } from 'pg';
import type { Request, Response } from 'express';
import { LazyRequestDbClient } from '../../middleware/lazyRequestDbClient';
import { bindRequestDbClient } from '../requestDbLease';

/** A pool that counts the connections it hands out and the ones returned. */
function countingPool() {
  const counts = { connected: 0, released: 0 };
  const pool = {
    connect: async () => {
      counts.connected += 1;
      let returned = false;
      return {
        query: async () => ({ rows: [] }),
        release: () => { if (!returned) { returned = true; counts.released += 1; } },
      } as unknown as PoolClient;
    },
  } as unknown as Pool;
  return { pool, counts, outstanding: () => counts.connected - counts.released };
}

/** Run `handle` for one request on a real HTTP server; resolves when it has finished. */
async function serveOnce(
  handle: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>,
  drive: (port: number) => void,
): Promise<void> {
  let handled!: () => void;
  const done = new Promise<void>((resolve) => { handled = resolve; });
  const server = http.createServer((req, res) => { void handle(req, res).finally(handled); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    drive((server.address() as AddressInfo).port);
    await done;
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('a request DB connection is returned to the pool however its request ends', () => {
  it('when the client went away before the scope was bound', async () => {
    const { pool, outstanding } = countingPool();
    await serveOnce(async (req, res) => {
      // Authentication is still running when the page navigates away.
      await new Promise<void>((resolve) => req.socket.once('close', () => resolve()));
      await settle();
      const client = new LazyRequestDbClient(pool, async () => undefined);
      bindRequestDbClient(req as Request, res as Response, client);
      await client.query('SELECT 1').catch(() => undefined);
      res.end();
      await settle();
    }, (port) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write('GET /api/mdx/notifications/unread-count HTTP/1.1\r\nHost: x\r\n\r\n');
        setTimeout(() => socket.destroy(), 10);
      });
      socket.on('error', () => undefined);
    });
    expect(outstanding(), 'the abandoned request kept its connection').toBe(0);
  });

  it('when the client went away first and the scope was given a stand-in response', async () => {
    // The auth boundary's warn mode (every environment but production) passes
    // the authenticator a response that forwards only `on` and captures
    // `status`; the real response's state is not on it.
    const { pool, outstanding } = countingPool();
    await serveOnce(async (req, res) => {
      await new Promise<void>((resolve) => req.socket.once('close', () => resolve()));
      await settle();
      const standIn = { on(event: string, listener: (...args: unknown[]) => void) { res.on(event, listener); return this; } };
      const client = new LazyRequestDbClient(pool, async () => undefined);
      bindRequestDbClient(req as Request, standIn as unknown as Response, client);
      await client.query('SELECT 1').catch(() => undefined);
      await settle();
    }, (port) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write('GET /api/mdx/notifications/unread-count HTTP/1.1\r\nHost: x\r\n\r\n');
        setTimeout(() => socket.destroy(), 10);
      });
      socket.on('error', () => undefined);
    });
    expect(outstanding(), 'the abandoned request kept its connection').toBe(0);
  });

  it('when the client goes away while the handler holds the connection', async () => {
    const { pool, outstanding } = countingPool();
    await serveOnce(async (req, res) => {
      const client = new LazyRequestDbClient(pool, async () => undefined);
      bindRequestDbClient(req as Request, res as Response, client);
      await client.query('SELECT 1');
      await new Promise<void>((resolve) => req.socket.once('close', () => resolve()));
      await settle();
    }, (port) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write('GET /api/widgets HTTP/1.1\r\nHost: x\r\n\r\n');
        setTimeout(() => socket.destroy(), 30);
      });
      socket.on('error', () => undefined);
    });
    expect(outstanding()).toBe(0);
  });

  it('when the response is sent', async () => {
    const { pool, counts, outstanding } = countingPool();
    let status = 0;
    await serveOnce(async (req, res) => {
      const client = new LazyRequestDbClient(pool, async () => undefined);
      bindRequestDbClient(req as Request, res as Response, client);
      await client.query('SELECT 1');
      res.end('ok');
      await settle();
    }, (port) => {
      http.get({ port, host: '127.0.0.1', path: '/api/widgets', agent: false }, (r) => { status = r.statusCode ?? 0; r.resume(); });
    });
    expect(status).toBe(200);
    expect(counts.connected).toBe(1);
    expect(outstanding()).toBe(0);
  });

  it.each([
    ['destroyed', { destroyed: true }],
    ['already finished', { writableFinished: true }],
  ])('when the response is %s by the time the scope is bound', async (_, state) => {
    const { pool, counts } = countingPool();
    const res = Object.assign(new EventEmitter(), state);
    const client = new LazyRequestDbClient(pool, async () => undefined);
    const req = {} as Request;
    bindRequestDbClient(req, res as unknown as Response, client);
    expect(req.dbClient).toBeNull();
    await expect(client.query('SELECT 1')).rejects.toThrow(/released request DB client/);
    expect(counts.connected).toBe(0);
  });
});
