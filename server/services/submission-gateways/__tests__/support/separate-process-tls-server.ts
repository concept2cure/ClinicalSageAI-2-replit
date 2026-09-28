/**
 * A raw mTLS server (TLS 1.3, client certificate required, the throwaway PKI
 * of ./mtls-pki.ts) running in a SEPARATE Node process. It reads the request
 * head and the whole Content-Length body, then — after `delayMs` — either
 * answers `HTTP/1.1 <status>` or resets the connection. It prints one JSON
 * line per closed connection: the body bytes it read and the Content-Length.
 *
 * Why a separate process: in-process, the server and the client under test
 * share one event loop, so the client's write callbacks (Node's request
 * 'finish') always run before the server gets to answer. Against a real
 * agency they do not: over TLS the callback that emits 'finish' runs one or
 * more loop iterations after the bytes reached the kernel, and an answer can
 * be parsed first — every time, when this process is busy (`busyLoop`).
 * 2026-09-23 (W5/D7, MDN close, repair): new; it reproduces the skeptic probe
 * that showed a 502 after the whole body classed "nothing reached FDA".
 */
import { spawn } from 'node:child_process';
import * as readline from 'node:readline';
import type { MtlsPki } from './mtls-pki';

const SERVER_SOURCE = `
const tls = require('node:tls'); const fs = require('node:fs');
const dir = process.env.PKI_DIR, mode = process.env.MODE, status = Number(process.env.STATUS), delay = Number(process.env.DELAY_MS);
const srv = tls.createServer({ key: fs.readFileSync(dir + '/srv.key'), cert: fs.readFileSync(dir + '/srv.pem'),
  ca: fs.readFileSync(dir + '/ca.pem'), requestCert: true, rejectUnauthorized: true, maxVersion: 'TLSv1.3' }, (s) => {
  let head = Buffer.alloc(0), headEnd = -1, clen = 0, bodyRead = 0, done = false;
  const act = () => { if (mode === 'reset') s.destroy(); else s.write('HTTP/1.1 ' + status + ' X\\r\\nContent-Length: 3\\r\\nConnection: close\\r\\n\\r\\nbad'); };
  s.on('data', (c) => {
    if (headEnd < 0) {
      head = Buffer.concat([head, c]); const i = head.indexOf('\\r\\n\\r\\n'); if (i < 0) return; headEnd = i + 4;
      const m = /content-length:\\s*(\\d+)/i.exec(head.subarray(0, i).toString('latin1')); clen = m ? Number(m[1]) : 0;
      bodyRead = head.length - headEnd;
    } else bodyRead += c.length;
    if (!done && bodyRead >= clen) { done = true; if (delay) setTimeout(act, delay); else act(); }
  });
  s.on('close', () => process.stdout.write(JSON.stringify({ bodyRead, contentLength: clen }) + '\\n'));
  s.on('error', () => {});
});
srv.on('tlsClientError', () => {});
srv.listen(0, '127.0.0.1', () => process.stdout.write('PORT ' + srv.address().port + '\\n'));
`;

export interface SeparateProcessServer {
  port: number;
  /** The next closed connection: body bytes the server read, and the declared Content-Length. */
  nextClose(): Promise<{ bodyRead: number; contentLength: number }>;
  close(): void;
}

export async function startSeparateProcessServer(
  pki: MtlsPki,
  opts: { mode: 'answer'; status: number; delayMs: number } | { mode: 'reset'; delayMs: number },
): Promise<SeparateProcessServer> {
  const child = spawn(process.execPath, ['-e', SERVER_SOURCE], {
    env: {
      PATH: process.env.PATH ?? '', PKI_DIR: pki.dir, MODE: opts.mode,
      STATUS: String(opts.mode === 'answer' ? opts.status : 0), DELAY_MS: String(opts.delayMs),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const lines: string[] = [];
  const waiters: Array<(line: string) => void> = [];
  readline.createInterface({ input: child.stdout }).on('line', (l) => {
    const w = waiters.shift();
    if (w) w(l); else lines.push(l);
  });
  const next = () => new Promise<string>((resolve) => {
    const l = lines.shift();
    if (l !== undefined) resolve(l); else waiters.push(resolve);
  });
  const first = await next();
  const port = Number(/^PORT (\d+)$/.exec(first)?.[1]);
  if (!port) throw new Error(`separate-process server did not start: ${first}`);
  return {
    port,
    nextClose: async () => JSON.parse(await next()) as { bodyRead: number; contentLength: number },
    close: () => { child.kill(); },
  };
}

/**
 * Keep this process's event loop busy — a `ms` spin in the timers phase every
 * millisecond — as a loaded production server is. Returns the stop function.
 */
export function busyLoop(ms: number): () => void {
  const t = setInterval(() => { const until = Date.now() + ms; while (Date.now() < until) { /* busy */ } }, 1);
  return () => clearInterval(t);
}
