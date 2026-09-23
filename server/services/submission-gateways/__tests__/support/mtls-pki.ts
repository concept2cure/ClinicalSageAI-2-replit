/**
 * Throwaway PKI for the real-socket mTLS tests of the AS2 delivery classifier
 * (as2-transport.ts): a CA, a `localhost` server certificate it signs, a client
 * certificate it signs (the server accepts it), and a self-signed "rogue"
 * client certificate (the server refuses it at the TLS handshake).
 *
 * Generated per run with the openssl CLI into a temp directory: Node's crypto
 * can make keys but not X.509 certificates, and a committed private key is a
 * secret-scanning finding whatever it protects. Nothing here is a mock — the
 * tests drive node:https against a node:https server built from these files.
 *
 * 2026-09-23 (W5/D7, MDN final pass): new.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as https from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as net from 'node:net';
import type { AddressInfo } from 'node:net';

export interface MtlsPki {
  dir: string;
  caPem: string;
  serverKeyPem: string;
  serverCertPem: string;
  clientKeyPem: string;
  clientCertPem: string;
  rogueKeyPem: string;
  rogueCertPem: string;
  /** Paths of the PEM files above, for code that reads credentials from disk. */
  paths: Record<'ca' | 'clientKey' | 'clientCert' | 'rogueKey' | 'rogueCert', string>;
  cleanup(): void;
}

export function makeMtlsPki(): MtlsPki {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'as2-mtls-pki-'));
  const f = (name: string) => path.join(dir, name);
  const openssl = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
  const newKeyReq = (name: string, cn: string) =>
    openssl('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', f(`${name}.key`), '-out', f(`${name}.csr`), '-subj', `/CN=${cn}`);

  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('ca.key'), '-out', f('ca.pem'), '-days', '2', '-subj', '/CN=as2-test-ca');
  writeFileSync(f('srv.ext'), 'subjectAltName=DNS:localhost,IP:127.0.0.1\n');
  newKeyReq('srv', 'localhost');
  openssl('x509', '-req', '-in', f('srv.csr'), '-CA', f('ca.pem'), '-CAkey', f('ca.key'), '-set_serial', '1', '-days', '2', '-extfile', f('srv.ext'), '-out', f('srv.pem'));
  newKeyReq('cli', 'SPONSOR-AS2');
  openssl('x509', '-req', '-in', f('cli.csr'), '-CA', f('ca.pem'), '-CAkey', f('ca.key'), '-set_serial', '2', '-days', '2', '-out', f('cli.pem'));
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('rogue.key'), '-out', f('rogue.pem'), '-days', '2', '-subj', '/CN=ROGUE-AS2');

  const r = (name: string) => readFileSync(f(name), 'utf8');
  return {
    dir,
    caPem: r('ca.pem'),
    serverKeyPem: r('srv.key'),
    serverCertPem: r('srv.pem'),
    clientKeyPem: r('cli.key'),
    clientCertPem: r('cli.pem'),
    rogueKeyPem: r('rogue.key'),
    rogueCertPem: r('rogue.pem'),
    paths: { ca: f('ca.pem'), clientKey: f('cli.key'), clientCert: f('cli.pem'), rogueKey: f('rogue.key'), rogueCert: f('rogue.pem') },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** A request the server's application handler saw, with its whole body. */
export interface SeenRequest {
  headers: IncomingMessage['headers'];
  body: Buffer;
}

export interface MtlsServer {
  port: number;
  /** Requests the application handler received in full (nothing a TLS refusal stopped). */
  seen: SeenRequest[];
  /** What the application does once it has read the whole request body. */
  respond: (req: SeenRequest, res: ServerResponse) => void;
  /**
   * When set, the application is handed the request as soon as its HEAD
   * arrives and `respond` is not used: it may answer without reading the body
   * (a front end with no healthy upstream, a redirect), or answer and then
   * read. 2026-09-23 (W5/D7, MDN close).
   */
  answerOnHead: ((res: ServerResponse, req: IncomingMessage) => void) | null;
  /**
   * One entry per request handed to `answerOnHead`: the body bytes the
   * application read (0 unless the hook reads), whether the HTTP layer had
   * received the WHOLE body (`IncomingMessage.complete`) by the time the
   * connection closed, and the raw bytes (TLS records, head included) the
   * server read from the connection by then. Both are null while it is open.
   */
  answeredOnHead: Array<{ bodyBytesReadByApplication: number; completeAtClose: boolean | null; socketBytesReadAtClose: number | null }>;
  /** Change the TLS version cap for the next connections. */
  setMaxVersion(v: 'TLSv1.2' | 'TLSv1.3'): void;
  close(): Promise<void>;
}

/**
 * A real https server that requires a client certificate signed by the test CA
 * (`requestCert` + `rejectUnauthorized`), capped at `maxVersion`.
 */
export async function startMtlsServer(pki: MtlsPki): Promise<MtlsServer> {
  let maxVersion: 'TLSv1.2' | 'TLSv1.3' = 'TLSv1.3';
  const state: MtlsServer = {
    port: 0,
    seen: [],
    respond: (_req, res) => { res.writeHead(200); res.end('ok'); },
    answerOnHead: null,
    answeredOnHead: [],
    setMaxVersion: (v) => {
      maxVersion = v;
      srv.setSecureContext({ key: pki.serverKeyPem, cert: pki.serverCertPem, ca: pki.caPem, maxVersion });
    },
    close: () => new Promise<void>((resolve) => { srv.closeAllConnections(); srv.close(() => resolve()); }),
  };
  const srv = https.createServer(
    { key: pki.serverKeyPem, cert: pki.serverCertPem, ca: pki.caPem, requestCert: true, rejectUnauthorized: true, maxVersion },
    (req, res) => {
      if (state.answerOnHead) {
        const entry = { bodyBytesReadByApplication: 0, completeAtClose: null as boolean | null, socketBytesReadAtClose: null as number | null };
        state.answeredOnHead.push(entry);
        req.on('data', (c: Buffer) => { entry.bodyBytesReadByApplication += c.length; });
        req.pause();
        req.socket.once('close', () => { entry.completeAtClose = req.complete; entry.socketBytesReadAtClose = req.socket.bytesRead; });
        state.answerOnHead(res, req);
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const seen = { headers: req.headers, body: Buffer.concat(chunks) };
        state.seen.push(seen);
        state.respond(seen, res);
      });
    },
  );
  srv.on('tlsClientError', () => undefined);
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  state.port = (srv.address() as AddressInfo).port;
  return state;
}

/** A TCP proxy between the client under test and a real server. */
export interface TcpProxy {
  port: number;
  /** Bytes the proxy has passed from the server to the client. */
  serverToClientBytes(): number;
  close(): Promise<void>;
}

/**
 * A plain TCP proxy in front of `targetPort` on 127.0.0.1, for conditions the
 * loopback interface never produces:
 *   - `delayMs`: hold every chunk, in both directions, this long (one-way
 *     latency, as on a WAN hop to the agency). Order is kept.
 *   - `corrupt`: asked for every server-to-client chunk; when it returns true,
 *     one byte of that chunk is flipped — a TLS record the client then fails
 *     to decrypt, as after a faulty middlebox or NIC.
 * 2026-09-23 (W5/D7, MDN final pass, repair): new.
 */
export async function startTcpProxy(
  targetPort: number,
  opts: { delayMs?: number; corrupt?: () => boolean } = {},
): Promise<TcpProxy> {
  let s2c = 0;
  const sockets = new Set<net.Socket>();
  const later = (fn: () => void) => (opts.delayMs ? setTimeout(fn, opts.delayMs) : fn());
  const proxy = net.createServer((client) => {
    const upstream = net.connect(targetPort, '127.0.0.1');
    sockets.add(client); sockets.add(upstream);
    client.on('data', (d: Buffer) => later(() => { if (!upstream.destroyed) upstream.write(d); }));
    upstream.on('data', (d: Buffer) => {
      let out = d;
      if (opts.corrupt?.()) {
        out = Buffer.from(d);
        const i = Math.min(out.length - 1, 20);
        out[i] ^= 0x55;
      }
      s2c += out.length;
      later(() => { if (!client.destroyed) client.write(out); });
    });
    client.on('end', () => later(() => upstream.end()));
    upstream.on('end', () => later(() => client.end()));
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.on('close', () => later(() => upstream.destroy()));
    upstream.on('close', () => later(() => client.destroy()));
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  return {
    port: (proxy.address() as AddressInfo).port,
    serverToClientBytes: () => s2c,
    close: () => new Promise<void>((resolve) => {
      for (const s of sockets) s.destroy();
      proxy.close(() => resolve());
    }),
  };
}
