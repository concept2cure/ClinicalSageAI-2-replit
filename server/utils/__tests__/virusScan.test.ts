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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as virusScan from '../virusScan';
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

/**
 * With AlertExceedsMax (set on the deployed scanner, terraform/modules/ecs-fargate),
 * clamd reports a file over MaxFileSize / MaxScanSize / MaxRecursion as a
 * Heuristics.Limits.Exceeded "FOUND" rather than answering OK for the part it
 * read. That is not a virus and not an all-clear: it is a scan that did not
 * cover the file. Still not clean, so every caller refuses it; marked, so the
 * refusal can say why.
 */
describe('virusScan — a file clamd could not scan whole', () => {
  it('marks a Heuristics.Limits.Exceeded result incomplete, and not clean', async () => {
    const server = await startMockClamd('stream: Heuristics.Limits.Exceeded.MaxScanSize FOUND');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(server.port);
    try {
      const result = await scanBuffer(Buffer.from('payload'));
      expect(result.clean).toBe(false);
      expect(result.incomplete).toBe(true);
      expect(result.signature).toBe('Heuristics.Limits.Exceeded.MaxScanSize');
    } finally {
      await server.close();
    }
  });

  it('does not mark a real signature incomplete', async () => {
    const server = await startMockClamd('stream: Eicar-Test-Signature FOUND');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(server.port);
    try {
      const result = await scanBuffer(Buffer.from('EICAR test payload'));
      expect(result.clean).toBe(false);
      expect(result.incomplete).toBeUndefined();
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

/**
 * pingClamd (MR-08): /readyz asks clamd whether it is there. True only on PONG.
 * Imported through the namespace so this block reports a missing export as a
 * failed assertion, not a file that cannot load.
 */
/** A clamd stand-in that answers zPING with `reply`, or holds the line when null. */
function startPingServer(
  reply: string | null
): Promise<MockServer & { pings: () => number; connections: () => number }> {
  let pings = 0;
  let connections = 0;
  const held: net.Socket[] = [];
  return new Promise((resolve, reject) => {
    const server = net.createServer(socket => {
      connections++;
      held.push(socket);
      socket.on('error', () => {});
      socket.on('data', raw => {
        if (!raw.toString('latin1').startsWith('zPING\0')) return;
        pings++;
        if (reply != null) socket.end(reply);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: (server.address() as net.AddressInfo).port,
        pings: () => pings,
        connections: () => connections,
        close: () =>
          new Promise(r => {
            held.forEach(h => h.destroy());
            server.close(() => r());
          }),
      });
    });
    server.on('error', reject);
  });
}

/** A peer that accepts, then hangs up (`end`) or resets (`reset`), as a dead backend behind a TCP proxy does. */
async function withPeer(behaviour: 'end' | 'reset', run: () => Promise<void>) {
  const sockets: net.Socket[] = [];
  const server = net.createServer(socket => {
    sockets.push(socket);
    socket.on('error', () => {});
    if (behaviour === 'end') socket.end();
    else socket.resetAndDestroy();
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  process.env.CLAMAV_HOST = '127.0.0.1';
  process.env.CLAMAV_PORT = String((server.address() as net.AddressInfo).port);
  try {
    await run();
  } finally {
    sockets.forEach(socket => socket.destroy());
    await new Promise(r => server.close(r));
  }
}

describe('pingClamd — is the scanner there', () => {
  beforeEach(() => {
    virusScan.__testing.resetPingCache?.();
  });

  it('is true when clamd answers PONG', async () => {
    expect(typeof virusScan.pingClamd).toBe('function');
    const server = await startPingServer('PONG\0');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(server.port);
    try {
      expect(await virusScan.pingClamd()).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('is false, within its timeout, when clamd accepts and never answers', async () => {
    expect(typeof virusScan.pingClamd).toBe('function');
    const server = await startPingServer(null);
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(server.port);
    try {
      const started = Date.now();
      expect(await virusScan.pingClamd(300)).toBe(false);
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      await server.close();
    }
  });

  it('is false on any answer but PONG', async () => {
    expect(typeof virusScan.pingClamd).toBe('function');
    const server = await startPingServer('UNKNOWN COMMAND\0');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(server.port);
    try {
      expect(await virusScan.pingClamd()).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('is false when nothing listens, and when CLAMAV_HOST is unset', async () => {
    expect(typeof virusScan.pingClamd).toBe('function');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = '1';
    expect(await virusScan.pingClamd()).toBe(false);
    delete process.env.CLAMAV_HOST;
    expect(await virusScan.pingClamd()).toBe(false);
  });
});

describe('pingClamdCached — reuse, expiry and one ping in flight', () => {
  beforeEach(() => {
    virusScan.__testing.resetPingCache?.();
  });

  // Literals, not PING_CACHE_MS: a test that follows the constant passes
  // whatever the constant becomes (a 10-minute cache included).
  it('pingClamdCached reuses a result for at most 30 s', async () => {
    expect(virusScan.PING_CACHE_MS).toBe(30_000);
    expect(typeof virusScan.pingClamdCached).toBe('function');
    const server = await startPingServer('PONG\0');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(server.port);
    let t = 1_000_000;
    const now = () => t;
    try {
      expect(await virusScan.pingClamdCached(2000, now)).toBe(true);
      t += 29_999;
      expect(await virusScan.pingClamdCached(2000, now)).toBe(true);
      expect(server.pings()).toBe(1);
      t += 1;
      expect(await virusScan.pingClamdCached(2000, now)).toBe(true);
      expect(server.pings()).toBe(2);
    } finally {
      await server.close();
    }
  });

  it('pingClamdCached treats a clock stepped back as expired', async () => {
    const server = await startPingServer('PONG\0');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(server.port);
    let t = 1_000_000;
    const now = () => t;
    try {
      expect(await virusScan.pingClamdCached(2000, now)).toBe(true);
      t -= 60_000; // NTP step backwards: the cached entry now looks 60 s in the future
      expect(await virusScan.pingClamdCached(2000, now)).toBe(true);
      expect(server.pings()).toBe(2);
    } finally {
      await server.close();
    }
  });

  // /readyz is public and unauthenticated. Without a shared in-flight ping,
  // N concurrent requests on an expired cache open N connections to clamd.
  it('pingClamdCached shares one in-flight ping: 50 concurrent callers open 1 connection', async () => {
    const server = await startPingServer('PONG\0');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(server.port);
    try {
      const results = await Promise.all(
        Array.from({ length: 50 }, () => virusScan.pingClamdCached(2000))
      );
      expect(results.every(r => r === true)).toBe(true);
      expect(server.connections()).toBe(1);
      expect(server.pings()).toBe(1);
    } finally {
      await server.close();
    }
  });
});

describe('pingClamd — a port that is not a port, and a connect() that throws', () => {
  beforeEach(() => {
    virusScan.__testing.resetPingCache?.();
  });

  // A malformed CLAMAV_PORT made socket.connect throw inside the Promise
  // executor, so the "never rejects" promise rejected and /readyz answered a
  // bare 500.
  it.each(['abc', '70000', '3310.5', '-1'])(
    'is false, and never rejects, when CLAMAV_PORT is %j',
    async port => {
      process.env.CLAMAV_HOST = '127.0.0.1';
      process.env.CLAMAV_PORT = port;
      await expect(virusScan.pingClamd(300)).resolves.toBe(false);
    }
  );

  // Number() reads each of these as the live PONG server's own port, so only
  // the port rule refuses them: with the rule removed (connect guard kept) the
  // ping reaches the server, gets PONG and these turn red on their own.
  it.each([
    ['a decimal point', (p: number) => `${p}.0`],
    ['hexadecimal', (p: number) => `0x${p.toString(16)}`],
    ['an exponent', (p: number) => `${p}e0`],
  ])('is false when CLAMAV_PORT is the right port written with %s', async (_label, write) => {
    const server = await startPingServer('PONG\0');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = write(server.port);
    try {
      await expect(virusScan.pingClamd(500)).resolves.toBe(false);
      expect(server.connections()).toBe(0);
    } finally {
      await server.close();
    }
  });

  // Port validation leaves connect() nothing to throw on today; the guard is
  // there for whatever it throws on next. Pinned by making it throw.
  it('is false, and never rejects, when connect() throws', async () => {
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = '3310';
    const connect = vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(() => {
      throw new Error('connect refused its arguments');
    });
    try {
      await expect(virusScan.pingClamd(300)).resolves.toBe(false);
    } finally {
      connect.mockRestore();
    }
  });
});

describe('pingClamd — a peer that hangs up or resets', () => {
  beforeEach(() => {
    virusScan.__testing.resetPingCache?.();
  });

  // Neither a hang-up nor a reset is clamd saying PONG.
  it('is false when the peer accepts and closes without a reply', () =>
    withPeer('end', async () => {
      await expect(virusScan.pingClamd(2_000)).resolves.toBe(false);
    }));

  it('is false when the peer accepts and resets the connection', () =>
    withPeer('reset', async () => {
      await expect(virusScan.pingClamd(2_000)).resolves.toBe(false);
    }));
});

/**
 * scanBuffer reads CLAMAV_PORT by the same rule as pingClamd. A port that is
 * not a port was a RangeError thrown out of the executor, so an upload got a
 * bare 500 instead of a scan that did not run (MR-08 fix round).
 */
/**
 * Only bytes can be scanned. A caller that passes anything else (a JS caller
 * past the types, a future route) gets a scan that did not run, which
 * production refuses with 503. It never gets a TypeError thrown from inside the
 * socket's connect callback, which nothing catches.
 */
describe('scanBuffer — an argument that is not a Buffer', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'payload'],
  ])('resolves not scanned, and never throws, for %s', async (_label, value) => {
    const server = await startMockClamd('stream: OK');
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(server.port);
    try {
      await expect(scanBuffer(value as unknown as Buffer)).resolves.toEqual({
        scanned: false,
        clean: true,
        reason: 'not_a_buffer',
      });
    } finally {
      await server.close();
    }
  });
});

describe('scanBuffer — a CLAMAV_PORT that is not a port', () => {
  it.each(['abc', '70000'])('resolves unreachable, and never rejects, for %j', async port => {
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = port;
    await expect(scanBuffer(Buffer.from('payload'))).resolves.toEqual({
      scanned: false,
      clean: true,
      reason: 'clamav_unreachable',
    });
  });

  // Number() reads each of these as a live clamd's own port, so only the port
  // rule stops the scan reaching it: with the rule removed the scan comes back
  // scanned and clean, and these turn red without depending on what else
  // happens to listen on this machine.
  it.each([
    ['a decimal point', (p: number) => `${p}.0`],
    ['hexadecimal', (p: number) => `0x${p.toString(16)}`],
    ['an exponent', (p: number) => `${p}e0`],
  ])(
    'resolves unreachable when CLAMAV_PORT is the right port written with %s',
    async (_label, write) => {
      const server = await startMockClamd('stream: OK');
      process.env.CLAMAV_HOST = '127.0.0.1';
      process.env.CLAMAV_PORT = write(server.port);
      try {
        await expect(scanBuffer(Buffer.from('payload'))).resolves.toEqual({
          scanned: false,
          clean: true,
          reason: 'clamav_unreachable',
        });
      } finally {
        await server.close();
      }
    }
  );

  it('resolves unreachable, and never rejects, when connect() throws', async () => {
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = '3310';
    const connect = vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(() => {
      throw new Error('connect refused its arguments');
    });
    try {
      await expect(scanBuffer(Buffer.from('payload'))).resolves.toEqual({
        scanned: false,
        clean: true,
        reason: 'clamav_unreachable',
      });
    } finally {
      connect.mockRestore();
    }
  });
});
