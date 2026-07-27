/**
 * The /collab WebSocket transport — proven with a real socket, not a mock.
 *
 * WHY THIS FILE EXISTS
 * `attachHocuspocusToServer` used to hand the raw `net.Socket` from the HTTP
 * 'upgrade' event straight to `hocuspocus.handleConnection`, which requires an
 * already-handshaken `ws.WebSocket`. No 101 response was ever written, so a
 * browser's WebSocket never opened; hocuspocus then called `.ping()` and read
 * `.readyState` against ws's numeric constants on an object with neither.
 *
 * Nothing caught it because nothing connects: no module imports
 * `@hocuspocus/provider`, and the authoring surface uses the REST
 * presence/locking service instead. A unit test with a fake socket would have
 * passed against the broken code just as happily as against the fixed code,
 * which is precisely why the assertion here is a real `ws` client completing a
 * real handshake against a real `http.Server`.
 *
 * These tests do NOT authenticate — a hocuspocus client sends its token as its
 * first protocol message, after the socket is open. What is being proven here
 * is only that the socket can open at all. Authentication and authorization are
 * proven directly against `authenticateCollabConnection` in
 * collab-governance.pglite.integration.test.ts.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';

/**
 * Import the collaboration module fresh so the ENABLE_COLLAB_CRDT read and the
 * memoized Hocuspocus singleton are re-evaluated per case.
 */
async function loadCollabModule(enabled: boolean) {
  vi.resetModules();
  if (enabled) process.env.ENABLE_COLLAB_CRDT = 'true';
  else delete process.env.ENABLE_COLLAB_CRDT;
  return import('../../hocuspocus-server');
}

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
  delete process.env.ENABLE_COLLAB_CRDT;
});

/** Start a listening http.Server and return its port. */
async function listen(server: http.Server): Promise<number> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  return (server.address() as AddressInfo).port;
}

describe('attachHocuspocusToServer', () => {
  it('does not touch the HTTP server at all when the flag is off', async () => {
    // Flag off must mean "not attached", not "attached and rejecting" — an
    // unused WebSocket endpoint on the public HTTP server is attack surface
    // with no user.
    const { attachHocuspocusToServer, isCollabEnabled } = await loadCollabModule(false);
    const server = http.createServer();
    expect(isCollabEnabled()).toBe(false);
    attachHocuspocusToServer(server);
    expect(server.listenerCount('upgrade')).toBe(0);
  });

  it('completes a real WebSocket handshake at /collab', async () => {
    // The assertion the previous implementation could not have passed: a
    // client socket reaching readyState OPEN means the 101 was written and the
    // ws handshake finished.
    const { attachHocuspocusToServer, hocuspocusInstance } = await loadCollabModule(true);
    const server = http.createServer();
    attachHocuspocusToServer(server);
    expect(server.listenerCount('upgrade')).toBe(1);
    const port = await listen(server);

    const client = new WebSocket(`ws://127.0.0.1:${port}/collab/authoring`);
    cleanups.push(() => client.close());

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the socket never opened')), 5000);
      client.on('open', () => {
        clearTimeout(timer);
        resolve();
      });
      client.on('error', err => {
        clearTimeout(timer);
        reject(err);
      });
    });

    expect(client.readyState).toBe(WebSocket.OPEN);
    void hocuspocusInstance;
  }, 20_000);

  it('leaves upgrades on other paths to their own handler', async () => {
    // Socket.io owns its own upgrade path on this same HTTP server. Destroying
    // or answering a socket that is not ours would break it.
    const { attachHocuspocusToServer } = await loadCollabModule(true);
    const server = http.createServer();
    attachHocuspocusToServer(server);

    let sawOtherPath = false;
    const otherWss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => {
      if ((request.url || '').startsWith('/socket.io')) {
        sawOtherPath = true;
        otherWss.handleUpgrade(request, socket as never, head, ws => ws.close());
      }
    });
    const port = await listen(server);

    const client = new WebSocket(`ws://127.0.0.1:${port}/socket.io/`);
    cleanups.push(() => client.close());
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the other handler never ran')), 5000);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      client.on('open', done);
      client.on('close', done);
      client.on('error', err => {
        clearTimeout(timer);
        reject(err);
      });
    });

    expect(sawOtherPath).toBe(true);
  }, 20_000);
});
