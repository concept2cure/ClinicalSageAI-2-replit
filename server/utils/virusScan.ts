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
 *   clean: true }` so callers behave as if the scan passed. This
 *   lets the route code call the scanner unconditionally; the gate
 *   activates the moment a clamd daemon is provisioned in staging
 *   without any code change.
 *
 * Failure modes:
 *
 *   - Network error / connect timeout → `{ scanned: false, clean:
 *     true, reason: 'clamav_unreachable' }`. We FAIL OPEN by design:
 *     the route's other defenses (signature check, tenant-scoped
 *     storage path, file size cap) still apply. A misconfigured
 *     clamav shouldn't block uploads. This is intentional but worth
 *     monitoring — log analyzers should alert on a rising rate of
 *     `clamav_unreachable` reasons.
 *
 *   - Daemon returns an unparseable response → `{ scanned: false,
 *     clean: true, reason: 'clamav_unparseable' }`. Same fail-open
 *     posture.
 *
 *   - Daemon returns FOUND → `{ scanned: true, clean: false,
 *     signature: '<name>' }`. Caller rejects the upload.
 *
 * The scan is bounded: the connect timeout is 5s, the total scan
 * timeout is 30s. Beyond that we abandon the connection and report
 * fail-open. Large file scans run on the daemon side, which has its
 * own resource governance.
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
}

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
 * reason: 'clamav_not_configured' }` when CLAMAV_HOST is unset — the
 * fail-open path that lets uploads work in environments without a
 * scanner. Callers must NOT treat `scanned: false` as a clean signal
 * — only `clean: true && scanned: true` is a real all-clear.
 */
export function scanBuffer(buffer: Buffer): Promise<VirusScanResult> {
  if (!isConfigured()) {
    return Promise.resolve({
      scanned: false,
      clean: true,
      reason: 'clamav_not_configured',
    });
  }

  return new Promise(resolve => {
    const host = process.env.CLAMAV_HOST as string;
    const port = process.env.CLAMAV_PORT ? Number(process.env.CLAMAV_PORT) : DEFAULT_PORT;

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
        settle({ scanned: true, clean: false, signature: foundMatch[1] });
        return;
      }
      settle({ scanned: false, clean: true, reason: 'clamav_unparseable' });
    });

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
  });
}

/** Exposed for tests. */
export const __testing = { isConfigured };
