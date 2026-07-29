/**
 * Verifies the ClamAV INSTREAM client.
 *
 * Uses a node:net server that speaks the clamd INSTREAM wire protocol
 * just well enough to test each branch: clean response, FOUND
 * response, unparseable response, and the disconnect case. We do NOT
 * call a real clamd; that would tie tests to infra that doesn't run
 * in CI.
 */

import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanBuffer } from '../virusScan';

const ORIGINAL_HOST = process.env.CLAMAV_HOST;
const ORIGINAL_PORT = process.env.CLAMAV_PORT;

interface MockServer {
  port: number;
  close(): Promise<void>;
}

/**
 * Start a node:net server that reads the INSTREAM stream and replies
 * with `reply` once the EOF sentinel arrives. Used by tests to
 * exercise the parser without a real clamd.
 */
function startMockClamd(reply: string | null): Promise<MockServer> {
  return new Promise((resolve, reject) => {
    const server = net.createServer(socket => {
      socket.on('data', raw => {
        // Detect the 4-byte zero terminator anywhere in the buffer.
        // Real clamd parses length-prefixed chunks; for the test we
        // just look for the terminator and reply.
        const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        if (chunk.length >= 4 && chunk.readUInt32BE(chunk.length - 4) === 0) {
          if (reply == null) {
            // Hang up without replying — exercises the unparseable
            // path.
            socket.end();
          } else {
            socket.write(`${reply}\x00`);
            socket.end();
          }
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({
        port,
        close: () =>
          new Promise(r => {
            server.close(() => r());
          }),
      });
    });
    server.on('error', reject);
  });
}

afterEach(() => {
  process.env.CLAMAV_HOST = ORIGINAL_HOST;
  process.env.CLAMAV_PORT = ORIGINAL_PORT;
});

describe('virusScan — bypass when not configured', () => {
  beforeEach(() => {
    delete process.env.CLAMAV_HOST;
    delete process.env.CLAMAV_PORT;
  });

  it('returns scanned=false, clean=true when CLAMAV_HOST is unset', async () => {
    const result = await scanBuffer(Buffer.from('hello'));
    expect(result.scanned).toBe(false);
    expect(result.clean).toBe(true);
    expect(result.reason).toBe('clamav_not_configured');
  });
});

describe('virusScan — clean response', () => {
  it('parses "stream: OK" as scanned + clean', async () => {
    const server = await startMockClamd('stream: OK');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(server.port);
    try {
      const result = await scanBuffer(Buffer.from('benign payload'));
      expect(result.scanned).toBe(true);
      expect(result.clean).toBe(true);
      expect(result.signature).toBeUndefined();
    } finally {
      await server.close();
    }
  });
});

describe('virusScan — FOUND response', () => {
  it('parses signature name out of "stream: X FOUND"', async () => {
    const server = await startMockClamd('stream: Eicar-Test-Signature FOUND');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(server.port);
    try {
      const result = await scanBuffer(Buffer.from('EICAR test payload'));
      expect(result.scanned).toBe(true);
      expect(result.clean).toBe(false);
      expect(result.signature).toBe('Eicar-Test-Signature');
    } finally {
      await server.close();
    }
  });

  it('parses multi-word signatures correctly', async () => {
    const server = await startMockClamd('stream: Win.Trojan.Generic.12345 FOUND');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(server.port);
    try {
      const result = await scanBuffer(Buffer.from('payload'));
      expect(result.scanned).toBe(true);
      expect(result.clean).toBe(false);
      expect(result.signature).toBe('Win.Trojan.Generic.12345');
    } finally {
      await server.close();
    }
  });
});

describe('virusScan — fail-open posture', () => {
  it('returns clean=true with reason on unparseable response', async () => {
    // Server closes without sending anything — the on('close')
    // handler observes an empty buffer and returns unparseable.
    const server = await startMockClamd(null);
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(server.port);
    try {
      const result = await scanBuffer(Buffer.from('payload'));
      expect(result.scanned).toBe(false);
      expect(result.clean).toBe(true);
      expect(result.reason).toBe('clamav_unparseable');
    } finally {
      await server.close();
    }
  });

  it('returns clean=true with reason when host is unreachable', async () => {
    // Use a port that nothing is listening on. The connect attempt
    // will eventually time out or get refused; either way we expect
    // the fail-open path.
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = '1'; // privileged port w/ no listener
    const result = await scanBuffer(Buffer.from('payload'));
    expect(result.scanned).toBe(false);
    expect(result.clean).toBe(true);
    expect(result.reason).toBe('clamav_unreachable');
  }, 8_000);
});
