/**
 * ClamAV INSTREAM virus scanner.
 *
 * Scans a Buffer against a running clamd daemon over TCP. Returns a
 * structured result so callers can branch on infected / clean /
 * scan-disabled. Does NOT depend on the `clamscan` npm package —
 * implements the INSTREAM wire protocol directly (≤50 lines of
 * net.Socket) so the only dependency is Node's stdlib.
 *
 * Wire protocol (per clamd docs):
 *
 *   client → server:  zINSTREAM\0
 *   client → server:  <4-byte BE length><chunk>            (repeat)
 *   client → server:  \x00\x00\x00\x00                     (end-of-stream)
 *   server → client:  "stream: OK\0"  or  "stream: <SIG> FOUND\0"
 *
 * Activation:
 *
 *   Set CLAMAV_HOST=hostname (and optionally CLAMAV_PORT — defaults
 *   to 3310). When unset, `scanBuffer` returns `{ scanned: false,
 *   clean: true, reason: 'clamav_not_configured' }`. That is not an
 *   all-clear: only `scanned && clean` is. What a caller does with
 *   `scanned: false` depends on where it runs (below).
 *
 * Failure modes, and who fails open:
 *
 *   This client reports; it does not decide. Every failure below, and an
 *   argument that is not a Buffer (reason 'not_a_buffer'), resolves
 *   `{ scanned: false, clean: true, reason }`, and the caller chooses:
 *
 *   - PRODUCTION FAILS CLOSED. server/middleware/uploadSafety.ts
 *     refuses every upload whose scan did not run (503
 *     FILE_SCAN_UNAVAILABLE), and the boot self-test
 *     (services/securityHealth.ts clamav_connectivity) refuses to start
 *     a production process with no CLAMAV_HOST or a clamd that does not
 *     detect EICAR. /readyz reports the scanner down (pingClamd below).
 *
 *   - OUTSIDE PRODUCTION (development, test) the upload is accepted
 *     unscanned, with a warning, so a laptop without clamd can work. The
 *     route's other defenses (signature check, tenant-scoped storage
 *     path, file size cap) still apply there.
 *
 *   - Network error / connect timeout → reason 'clamav_unreachable'.
 *
 *   - Daemon returns an unparseable response → reason
 *     'clamav_unparseable'.
 *
 *   - Daemon returns FOUND → `{ scanned: true, clean: false,
 *     signature: '<name>' }`. Caller rejects the upload.
 *
 *   - Daemon returns a Heuristics.Limits.Exceeded.* FOUND → the same, plus
 *     `incomplete: true`. The deployed scanner runs with AlertExceedsMax
 *     (terraform/modules/ecs-fargate), so a file over its size or nesting
 *     limits is reported instead of answered OK for the part it read. Not a
 *     virus, and not an all-clear: still not clean, so every caller refuses
 *     it, and marked so the refusal can say why (uploadSafety.ts).
 *
 * The scan is bounded: the connect timeout is 5s, the total scan
 * timeout is 30s. Beyond that we abandon the connection and report
 * 'clamav_unreachable' (refused in production, as above). Large file
 * scans run on the daemon side, which has its own resource governance.
 */

import net from 'node:net';

export interface VirusScanResult {
  /** True iff a real scan ran end-to-end against clamd. */
  scanned: boolean;
  /** True iff the daemon (or the bypass path) says the bytes are safe. */
  clean: boolean;
  /** Populated when `clean === false` — the signature name clamd matched. */
  signature?: string;
  /** Diagnostic reason when `scanned === false` (configured? unreachable? etc.). */
  reason?: string;
  /**
   * True when clamd reported that the file exceeded its scan limits
   * (Heuristics.Limits.Exceeded.*): the scan did not cover the whole file.
   * `clean` is false with it.
   */
  incomplete?: true;
}

/** clamd's name for "this file is over the limits I scan to" (AlertExceedsMax). */
const LIMITS_EXCEEDED = /^Heuristics\.Limits\.Exceeded(?:\.|$)/;

const DEFAULT_PORT = 3310;
const CONNECT_TIMEOUT_MS = 5_000;
const SCAN_TIMEOUT_MS = 30_000;
const CHUNK_SIZE = 64 * 1024; // 64KB matches the clamd default max-chunk

function isConfigured(): boolean {
  return Boolean(process.env.CLAMAV_HOST);
}

/**
 * Scan a buffer against the configured clamd daemon.
 *
 * Returns synchronously-resolved `{ scanned: false, clean: true,
 * reason: 'clamav_not_configured' }` when CLAMAV_HOST is unset. Outside
 * production uploadSafety.ts accepts that with a warning; production
 * refuses it (503 FILE_SCAN_UNAVAILABLE) and does not boot without
 * CLAMAV_HOST. Callers must NOT treat `scanned: false` as a clean signal
 * — only `clean: true && scanned: true` is a real all-clear.
 */
export function scanBuffer(buffer: Buffer): Promise<VirusScanResult> {
  // Only bytes can be scanned. Anything else is a scan that did not run, which
  // production refuses (uploadSafety.ts: 503), never a TypeError thrown from the
  // connect callback below, where nothing would catch it.
  if (!Buffer.isBuffer(buffer)) {
    return Promise.resolve({ scanned: false, clean: true, reason: 'not_a_buffer' });
  }
  if (!isConfigured()) {
    return Promise.resolve({
      scanned: false,
      clean: true,
      reason: 'clamav_not_configured',
    });
  }
  // The same port rule as pingClamd, so /readyz and the scan cannot disagree
  // about whether CLAMAV_PORT names a port. Not one: unreachable, not a throw.
  const port = clamdPort();
  if (port === null) {
    return Promise.resolve({ scanned: false, clean: true, reason: 'clamav_unreachable' });
  }

  return new Promise(resolve => {
    const host = process.env.CLAMAV_HOST as string;

    let settled = false;
    const settle = (result: VirusScanResult) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const socket = new net.Socket();
    socket.setTimeout(SCAN_TIMEOUT_MS);

    let response = Buffer.alloc(0);

    const connectTimer = setTimeout(() => {
      settle({ scanned: false, clean: true, reason: 'clamav_unreachable' });
    }, CONNECT_TIMEOUT_MS);

    socket.once('error', () => {
      clearTimeout(connectTimer);
      settle({ scanned: false, clean: true, reason: 'clamav_unreachable' });
    });

    socket.once('timeout', () => {
      clearTimeout(connectTimer);
      settle({ scanned: false, clean: true, reason: 'clamav_unreachable' });
    });

    socket.on('data', chunk => {
      // Sockets emit Buffer by default; coerce here to satisfy the
      // string-or-Buffer type union without changing runtime shape.
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      response = Buffer.concat([response, buf]);
    });

    socket.once('close', () => {
      clearTimeout(connectTimer);
      const text = response.toString('utf8').replace(/\0+$/, '').trim();
      if (!text) {
        settle({ scanned: false, clean: true, reason: 'clamav_unparseable' });
        return;
      }
      // Typical responses:
      //   "stream: OK"
      //   "stream: Eicar-Test-Signature FOUND"
      //   "stream: <signature> FOUND"
      if (/:\s*OK$/i.test(text)) {
        settle({ scanned: true, clean: true });
        return;
      }
      const foundMatch = text.match(/stream:\s*(.+?)\s+FOUND/i);
      if (foundMatch) {
        const signature = foundMatch[1];
        settle(
          LIMITS_EXCEEDED.test(signature)
            ? { scanned: true, clean: false, incomplete: true, signature }
            : { scanned: true, clean: false, signature }
        );
        return;
      }
      settle({ scanned: false, clean: true, reason: 'clamav_unparseable' });
    });

    // connect() throws synchronously on an argument it rejects (a host it
    // cannot parse). A scan that cannot start is unreachable; it never rejects.
    try {
      socket.connect(port, host, () => {
        clearTimeout(connectTimer);

        // INSTREAM command — the `z` prefix delimits responses with NUL
        // instead of newline; we don't care for one-shot scans but it
        // matches clamd's recommended client pattern.
        socket.write('zINSTREAM\x00');

        // Stream the buffer in CHUNK_SIZE pieces with the 4-byte BE
        // length prefix per chunk.
        for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
          const end = Math.min(offset + CHUNK_SIZE, buffer.length);
          const slice = buffer.subarray(offset, end);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(slice.length, 0);
          socket.write(len);
          socket.write(slice);
        }

        // End-of-stream sentinel: zero-length chunk.
        const terminator = Buffer.alloc(4);
        terminator.writeUInt32BE(0, 0);
        socket.write(terminator);
      });
    } catch {
      clearTimeout(connectTimer);
      settle({ scanned: false, clean: true, reason: 'clamav_unreachable' });
    }
  });
}

/**
 * CLAMAV_PORT as a TCP port, or null when it is not one. Unset or empty means
 * clamd's default, 3310. Anything else must be an integer 1-65535: Number()
 * alone lets 'abc' (NaN), '70000' and '3310.5' through to socket.connect, which
 * throws on them synchronously.
 */
function clamdPort(): number | null {
  const raw = (process.env.CLAMAV_PORT ?? '').trim();
  if (raw === '') return DEFAULT_PORT;
  if (!/^[0-9]+$/.test(raw)) return null;
  const port = Number(raw);
  return port >= 1 && port <= 65_535 ? port : null;
}

/**
 * Is the configured clamd answering? Sends `zPING\0` and resolves `true` only
 * on `PONG`. Anything else — CLAMAV_HOST unset, a CLAMAV_PORT that is not a
 * port, a refused or reset connection, an unexpected reply, no reply within
 * `timeoutMs` — resolves `false`. Never rejects. /readyz reads it
 * (startup/inline-endpoints.ts), so a scanner that has gone away is visible
 * before an upload finds it (MR-08).
 */
export function pingClamd(timeoutMs = 2000): Promise<boolean> {
  if (!isConfigured()) return Promise.resolve(false);
  const host = process.env.CLAMAV_HOST as string;
  const port = clamdPort();
  if (port === null) return Promise.resolve(false);

  return new Promise(resolve => {
    let settled = false;
    let reply = '';
    const socket = new net.Socket();
    const timer = setTimeout(() => settle(false), timeoutMs);
    function settle(ok: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(ok);
    }
    const answer = () => reply.replace(/\0+$/, '').trim() === 'PONG';
    socket.once('error', () => settle(false));
    socket.on('data', chunk => {
      reply += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      // The `z` prefix makes clamd end its reply with NUL.
      if (reply.includes('\0')) settle(answer());
    });
    socket.once('close', () => settle(answer()));
    // connect() throws synchronously on an argument it rejects (a bad port, a
    // host it cannot parse). The promise must still resolve, never reject.
    try {
      socket.connect(port, host, () => {
        socket.write('zPING\x00');
      });
    } catch {
      settle(false);
    }
  });
}

/** How long /readyz may reuse a ping result. */
export const PING_CACHE_MS = 30_000;
let pingCache: { key: string; at: number; ok: boolean } | null = null;
/** The ping in progress, per host:port: concurrent callers share it. */
const pingInFlight = new Map<string, Promise<boolean>>();

/**
 * pingClamd, reused for at most PING_CACHE_MS per host:port, so a readiness
 * poller cannot turn into a connection per request against clamd. /readyz is
 * public and unauthenticated, so concurrent callers on an expired cache share
 * the one ping in flight instead of each opening a connection. A cached entry
 * whose age is negative (the clock stepped back) is expired, not fresh.
 */
export function pingClamdCached(timeoutMs = 2000, now: () => number = Date.now): Promise<boolean> {
  const key = `${process.env.CLAMAV_HOST ?? ''}:${process.env.CLAMAV_PORT ?? DEFAULT_PORT}`;
  if (pingCache && pingCache.key === key) {
    const age = now() - pingCache.at;
    if (age >= 0 && age < PING_CACHE_MS) return Promise.resolve(pingCache.ok);
  }
  const pending = pingInFlight.get(key);
  if (pending) return pending;
  const ping = pingClamd(timeoutMs)
    .then(ok => {
      pingCache = { key, at: now(), ok };
      return ok;
    })
    .finally(() => {
      pingInFlight.delete(key);
    });
  pingInFlight.set(key, ping);
  return ping;
}

/** Exposed for tests. */
export const __testing = {
  isConfigured,
  resetPingCache: () => {
    pingCache = null;
    pingInFlight.clear();
  },
};
