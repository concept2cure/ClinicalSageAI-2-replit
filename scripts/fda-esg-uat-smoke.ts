#!/usr/bin/env tsx
/**
 * fda-esg-uat-smoke.ts — Path-to-GA §C.6 one-shot smoke for the FDA ESG
 * production UAT. Companion to docs/runbooks/fda-esg-production-uat.md.
 *
 * What this script does:
 *
 *   1. Reads every env var that server/services/submission-gateways/fda-esg.ts
 *      reads (the `FDA_ESG_STAGING_*` family by default; pass --prod to read
 *      the `FDA_ESG_*` family instead). Validates presence + that the cert /
 *      key paths exist and parse.
 *
 *   2. Validates the cert-pair modulus match without shelling out to openssl.
 *
 *   3. Builds the AS2 envelope headers exactly the way buildAs2Headers does
 *      (fda-esg.ts:142–156) — same Message-ID shape, same AS2-To default,
 *      same Disposition-Notification-To — and pretty-prints them. NO network
 *      call. This is the closest thing to a "dry run" the gateway supports.
 *
 *   4. Optionally (--transmit) instantiates the real FdaEsgGateway and runs a
 *      transmit against the configured staging endpoint. THIS HITS THE
 *      NETWORK. Requires a bundle path + descriptor.
 *
 *   5. Pretty-prints the ack chain (synchronous MDN now; ack2/ack3 are async
 *      and observed in WebTrader — the script tells you so explicitly).
 *
 * Usage:
 *
 *   # Pre-flight only (no network):
 *   tsx scripts/fda-esg-uat-smoke.ts
 *
 *   # Pre-flight against production-prefixed env vars:
 *   tsx scripts/fda-esg-uat-smoke.ts --prod
 *
 *   # Print the AS2 headers the gateway would build:
 *   tsx scripts/fda-esg-uat-smoke.ts --print-envelope
 *
 *   # Real transmit against the staging endpoint (DESTRUCTIVE — actually
 *   # delivers bytes to FDA staging). Requires bundle args.
 *   tsx scripts/fda-esg-uat-smoke.ts --transmit \
 *     --bundle-path /abs/path/bundle.zip \
 *     --bundle-sha256 <hex> \
 *     --bundle-size  <bytes> \
 *     --org-id        7 \
 *     --user-id       11 \
 *     --package-id    99 \
 *     --application   IND123456 \
 *     --sequence      0001
 *
 * Exit codes:
 *   0  — smoke clean (pre-flight green, or transmit completed and ack1
 *        captured)
 *   1  — env / cert / arg problem
 *   2  — transmit invoked and failed (CredentialError / TransportError /
 *        GatewayError / ValidationError)
 */

import { promises as fs } from 'fs';
import { createPublicKey, createPrivateKey, randomUUID } from 'crypto';
import { URL } from 'url';

/* ─── CLI parsing ──────────────────────────────────────────────────── */

interface Args {
  prod:            boolean;
  printEnvelope:   boolean;
  transmit:        boolean;
  bundlePath?:     string;
  bundleSha256?:   string;
  bundleSize?:     number;
  orgId?:          number;
  userId?:         number;
  packageId?:      number;
  programId?:      string;
  application?:    string;
  sequence?:       string;
  submissionType?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { prod: false, printEnvelope: false, transmit: false };
  const get = (i: number): string => {
    const v = argv[i + 1];
    if (!v) {
      console.error(`Missing value for ${argv[i]}`);
      process.exit(1);
    }
    return v;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case '--prod':            out.prod = true; break;
      case '--print-envelope':  out.printEnvelope = true; break;
      case '--transmit':        out.transmit = true; break;
      case '--bundle-path':     out.bundlePath = get(i); i += 1; break;
      case '--bundle-sha256':   out.bundleSha256 = get(i); i += 1; break;
      case '--bundle-size':     out.bundleSize = Number(get(i)); i += 1; break;
      case '--org-id':          out.orgId = Number(get(i)); i += 1; break;
      case '--user-id':         out.userId = Number(get(i)); i += 1; break;
      case '--package-id':      out.packageId = Number(get(i)); i += 1; break;
      case '--program-id':      out.programId = get(i); i += 1; break;
      case '--application':     out.application = get(i); i += 1; break;
      case '--sequence':        out.sequence = get(i); i += 1; break;
      case '--submission-type': out.submissionType = get(i); i += 1; break;
      case '--help':
      case '-h':
        process.stdout.write(printUsage());
        process.exit(0);
        break;
      default:
        // Allow unknown flags to be ignored when the script is wrapped by ops.
        if (a.startsWith('--')) {
          console.warn(`[warn] unknown flag: ${a}`);
        }
    }
  }
  return out;
}

function printUsage(): string {
  return [
    'fda-esg-uat-smoke.ts — FDA ESG production UAT smoke',
    '',
    '  --prod                Read FDA_ESG_* (production) instead of FDA_ESG_STAGING_*',
    '  --print-envelope      Print the AS2 headers the gateway would build (no network)',
    '  --transmit            Real transmit against the configured staging endpoint',
    '  --bundle-path PATH    Absolute path to the assembled bundle',
    '  --bundle-sha256 HEX   The sha256 recorded for the bundle descriptor',
    '  --bundle-size N       Bytes on disk',
    '  --org-id N            Sponsor org id (transmittal tenant)',
    '  --user-id N           Acting user id',
    '  --package-id N        Submission package id',
    '  --program-id S        Submission program id',
    '  --application S       FDA application id (e.g. IND123456) — metadata only',
    '  --sequence S          eCTD sequence (e.g. 0001) — metadata only',
    '  --submission-type S   Submission type tag (e.g. original)',
    '',
    'No dry-run mode in fda-esg.ts. --print-envelope is the closest equivalent.',
    'See docs/runbooks/fda-esg-production-uat.md.',
    '',
  ].join('\n');
}

/* ─── Pretty printing ──────────────────────────────────────────────── */

const COLOR = process.stdout.isTTY;
const c = (code: string, s: string) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const ok    = (s: string) => c('32', s);
const warn  = (s: string) => c('33', s);
const err   = (s: string) => c('31', s);
const bold  = (s: string) => c('1',  s);
const dim   = (s: string) => c('2',  s);

function section(title: string): void {
  process.stdout.write(`\n${bold('━━ ' + title + ' ' + '━'.repeat(Math.max(0, 60 - title.length)))}\n`);
}

function row(label: string, value: string, marker: 'ok' | 'warn' | 'err' | 'none' = 'none'): void {
  const m = marker === 'ok'   ? ok('  ✓ ')
         : marker === 'warn' ? warn('  ! ')
         : marker === 'err'  ? err('  ✗ ')
         :                     '    ';
  process.stdout.write(`${m}${label.padEnd(36)} ${value}\n`);
}

/* ─── Env var resolution (mirrors fda-esg.ts:62–68) ────────────────── */

interface EnvSet {
  prefix:           string;
  endpointUrl?:     string;
  as2From?:         string;
  as2To:            string;      // defaults to FDA-CESUB per fda-esg.ts:77
  certPath?:        string;
  keyPath?:         string;
  fdaCertPath?:     string;
  sftpHost?:        string;
  sftpUser?:        string;
  sftpKeyPath?:     string;
  missing:          string[];
}

function readEnvSet(prod: boolean): EnvSet {
  const prefix = prod ? 'FDA_ESG_' : 'FDA_ESG_STAGING_';
  const e = (k: string) => process.env[prefix + k];

  const set: EnvSet = {
    prefix,
    endpointUrl:  e('URL'),
    as2From:      e('AS2_FROM'),
    as2To:        e('AS2_TO') ?? 'FDA-CESUB',
    certPath:     e('CERT_PATH'),
    keyPath:      e('KEY_PATH'),
    fdaCertPath:  e('FDA_CERT_PATH'),
    sftpHost:     e('SFTP_HOST'),
    sftpUser:     e('SFTP_USER'),
    sftpKeyPath:  e('SFTP_KEY_PATH'),
    missing:      [],
  };
  if (!set.endpointUrl) set.missing.push(prefix + 'URL');
  if (!set.as2From)     set.missing.push(prefix + 'AS2_FROM');
  if (!set.certPath)    set.missing.push(prefix + 'CERT_PATH');
  if (!set.keyPath)     set.missing.push(prefix + 'KEY_PATH');
  if (!set.fdaCertPath) set.missing.push(prefix + 'FDA_CERT_PATH');
  return set;
}

/* ─── Cert validation (no openssl shell-out) ───────────────────────── */

async function validateCertPair(
  certPath: string,
  keyPath:  string,
): Promise<{ ok: boolean; reason?: string; subject?: string; notAfter?: Date }> {
  let certPem: string; let keyPem: string;
  try { certPem = await fs.readFile(certPath, 'utf8'); }
  catch (e) { return { ok: false, reason: `cert read failed: ${(e as Error).message}` }; }
  try { keyPem = await fs.readFile(keyPath, 'utf8'); }
  catch (e) { return { ok: false, reason: `key read failed: ${(e as Error).message}` }; }

  let certKeyObj; let privKeyObj;
  try { certKeyObj = createPublicKey(certPem); }
  catch (e) { return { ok: false, reason: `cert parse failed: ${(e as Error).message}` }; }
  try { privKeyObj = createPrivateKey(keyPem); }
  catch (e) { return { ok: false, reason: `key parse failed: ${(e as Error).message}` }; }

  // Compare the public-key DER from the cert against the public-key DER derived
  // from the private key. Equal DER → the private key matches the certificate.
  const certPubDer = certKeyObj.export({ format: 'der', type: 'spki' }) as Buffer;
  const fromPriv   = createPublicKey(privKeyObj).export({ format: 'der', type: 'spki' }) as Buffer;
  if (!certPubDer.equals(fromPriv)) {
    return { ok: false, reason: 'cert and key public-key DER do not match (mismatched pair)' };
  }

  // Decode the cert just enough to extract subject + notAfter for ops display.
  // We can't depend on a heavy ASN.1 lib in scripts/, so fall back to a tiny
  // x509 read via the X509Certificate helper (Node ≥15.6).
  try {
    const { X509Certificate } = await import('crypto');
    const x = new X509Certificate(certPem);
    return {
      ok:       true,
      subject:  x.subject,
      notAfter: new Date(x.validTo),
    };
  } catch {
    return { ok: true };
  }
}

/* ─── AS2 envelope preview (mirrors fda-esg.ts:142–156) ────────────── */

function buildAs2HeadersPreview(env: EnvSet): Record<string, string> {
  const messageId = `<${randomUUID()}@${env.as2From}>`;
  return {
    'Message-ID':                       messageId,
    'AS2-From':                         env.as2From ?? '<missing>',
    'AS2-To':                           env.as2To,
    'AS2-Version':                      '1.2',
    'Disposition-Notification-To':      env.as2From ?? '<missing>',
    'Disposition-Notification-Options': 'signed-receipt-protocol=optional, pkcs7-signature; signed-receipt-micalg=optional, sha-256',
    'Receipt-Delivery-Option':          'sync',
    'Content-Type':                     'application/octet-stream',
    'Content-Disposition':              'attachment; filename="ectd.zip"',
    'Content-Length':                   '<set at transmit time>',
    'User-Agent':                       'concept2cure-mdx/1.0',
  };
}

/* ─── Main ─────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  process.stdout.write(bold('\nFDA ESG production UAT smoke\n'));
  process.stdout.write(dim(`(Path-to-GA §C.6; see docs/runbooks/fda-esg-production-uat.md)\n`));

  /* ─── 1. Env vars ─── */
  section('1 — Environment variables');
  const envSet = readEnvSet(args.prod);
  row('Variable prefix', envSet.prefix);
  row(envSet.prefix + 'URL',           envSet.endpointUrl   ?? '<unset>', envSet.endpointUrl   ? 'ok' : 'err');
  row(envSet.prefix + 'AS2_FROM',      envSet.as2From       ?? '<unset>', envSet.as2From       ? 'ok' : 'err');
  row(envSet.prefix + 'AS2_TO',        envSet.as2To + (envSet.as2To === 'FDA-CESUB' && !process.env[envSet.prefix + 'AS2_TO'] ? dim('  (default)') : ''));
  row(envSet.prefix + 'CERT_PATH',     envSet.certPath      ?? '<unset>', envSet.certPath      ? 'ok' : 'err');
  row(envSet.prefix + 'KEY_PATH',      envSet.keyPath       ?? '<unset>', envSet.keyPath       ? 'ok' : 'err');
  row(envSet.prefix + 'FDA_CERT_PATH', envSet.fdaCertPath   ?? '<unset>', envSet.fdaCertPath   ? 'ok' : 'err');
  row(envSet.prefix + 'SFTP_HOST',     envSet.sftpHost      ?? '<unset; SFTP fallback unavailable>', envSet.sftpHost     ? 'ok' : 'warn');
  row(envSet.prefix + 'SFTP_USER',     envSet.sftpUser      ?? '<unset>', envSet.sftpUser     ? 'ok' : 'warn');
  row(envSet.prefix + 'SFTP_KEY_PATH', envSet.sftpKeyPath   ?? '<unset>', envSet.sftpKeyPath  ? 'ok' : 'warn');

  if (envSet.missing.length > 0) {
    process.stdout.write(err(`\nMissing required env vars: ${envSet.missing.join(', ')}\n`));
    process.stdout.write(`Set them in the platform secrets manager and re-run. See runbook §3.\n`);
    process.exit(1);
  }

  /* ─── 2. Endpoint URL parse ─── */
  section('2 — Endpoint URL');
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(envSet.endpointUrl!);
  } catch (e) {
    row('Parse', `failed: ${(e as Error).message}`, 'err');
    process.exit(1);
  }
  if (parsedUrl.protocol !== 'https:') {
    row('Protocol', `${parsedUrl.protocol} — must be https`, 'err');
    process.exit(1);
  }
  row('Protocol',  parsedUrl.protocol, 'ok');
  row('Host',      parsedUrl.hostname, 'ok');
  row('Port',      parsedUrl.port || '443 (default)', 'ok');
  row('Path',      parsedUrl.pathname + parsedUrl.search, 'ok');

  /* ─── 3. Cert pair ─── */
  section('3 — mTLS cert pair (client cert + private key)');
  const pair = await validateCertPair(envSet.certPath!, envSet.keyPath!);
  if (!pair.ok) {
    row('Pair check', pair.reason ?? 'failed', 'err');
    process.exit(1);
  }
  row('Pair check', 'modulus / SPKI match', 'ok');
  if (pair.subject)  row('Subject',  pair.subject);
  if (pair.notAfter) {
    const days = Math.floor((pair.notAfter.getTime() - Date.now()) / 86_400_000);
    const marker = days < 0 ? 'err' : days < 30 ? 'warn' : 'ok';
    row('Not After', `${pair.notAfter.toISOString()}  (${days} days from now)`, marker);
    if (days < 0) {
      process.stdout.write(err('\nClient cert is expired. Reissue before UAT.\n'));
      process.exit(1);
    }
  }

  /* ─── 4. FDA cert ─── */
  section('4 — FDA AS2 public cert (trust anchor)');
  try {
    const fdaPem = await fs.readFile(envSet.fdaCertPath!, 'utf8');
    const { X509Certificate } = await import('crypto');
    const x = new X509Certificate(fdaPem);
    row('Subject', x.subject, 'ok');
    row('Issuer',  x.issuer);
    const days = Math.floor((new Date(x.validTo).getTime() - Date.now()) / 86_400_000);
    row('Not After', `${x.validTo}  (${days} days)`, days < 0 ? 'err' : days < 30 ? 'warn' : 'ok');
  } catch (e) {
    row('Load', (e as Error).message, 'err');
    process.exit(1);
  }

  /* ─── 5. AS2 envelope preview ─── */
  if (args.printEnvelope || !args.transmit) {
    section('5 — AS2 envelope preview (mirrors fda-esg.ts:142–156)');
    const headers = buildAs2HeadersPreview(envSet);
    for (const [k, v] of Object.entries(headers)) {
      row(k, v);
    }
    process.stdout.write(dim('\n(NO network call. This is a preview of the headers the gateway would emit;\n'));
    process.stdout.write(dim(' the real Message-ID will be regenerated at transmit time.)\n'));
  }

  /* ─── 6. Optional real transmit ─── */
  if (!args.transmit) {
    section('Result');
    process.stdout.write(ok('  Pre-flight clean. '));
    process.stdout.write(dim('Re-run with --transmit to actually contact the FDA staging endpoint.\n'));
    process.stdout.write(dim('  No dry-run mode in fda-esg.ts; the gateway either transmits real bytes\n'));
    process.stdout.write(dim('  or refuses with CredentialError. Pre-flight is the safest UAT-day check.\n'));
    process.exit(0);
  }

  /* Real transmit path. */
  section('6 — Real transmit (NETWORK)');
  const required: Array<keyof Args> = [
    'bundlePath', 'bundleSha256', 'bundleSize', 'orgId', 'userId', 'packageId',
  ];
  const missing = required.filter((k) => args[k] === undefined || args[k] === null);
  if (missing.length > 0) {
    process.stdout.write(err(`Missing required --transmit args: ${missing.map((m) => '--' + String(m).replace(/[A-Z]/g, (l) => '-' + l.toLowerCase())).join(', ')}\n`));
    process.exit(1);
  }
  if (!args.application || !args.sequence) {
    process.stdout.write(warn('--application and --sequence not set; SFTP path will fall back to placeholders.\n'));
  }

  let FdaEsgGateway: typeof import('../server/services/submission-gateways/fda-esg').FdaEsgGateway;
  try {
    ({ FdaEsgGateway } = await import('../server/services/submission-gateways/fda-esg'));
  } catch (e) {
    process.stdout.write(err(`Failed to load FdaEsgGateway: ${(e as Error).message}\n`));
    process.stdout.write(dim('  This script must run from a node environment where the server build\n'));
    process.stdout.write(dim('  resolves. Run with tsx from the repo root.\n'));
    process.exit(1);
  }
  if (args.prod) {
    process.stdout.write(err('  REFUSING to run --transmit with --prod from this script.\n'));
    process.stdout.write(dim('  Production transmits must go through the orchestrator route\n'));
    process.stdout.write(dim('  with governed-action ledger writes (see runbook §5).\n'));
    process.exit(1);
  }

  const gw = new FdaEsgGateway();
  process.stdout.write(`  POSTing AS2 to ${parsedUrl.toString()} ... `);
  const t0 = Date.now();
  try {
    const result = await gw.transmit({
      organizationId: args.orgId!,
      userId:         args.userId!,
      programId:      args.programId ?? null,
      packageId:      args.packageId!,
      bundle: {
        path:      args.bundlePath!,
        sha256:    args.bundleSha256!,
        sizeBytes: args.bundleSize!,
        format:    'ectd',
      },
      environment:    'staging',
      submissionType: args.submissionType ?? 'original',
      metadata: {
        applicationId: args.application,
        sequence:      args.sequence,
        environment:   'staging',
        source:        'fda-esg-uat-smoke',
      },
    });
    const ms = Date.now() - t0;
    process.stdout.write(ok(`OK  (${ms} ms)\n`));

    section('Result — GatewayTransmitResult');
    row('transmittalId',  String(result.transmittalId), 'ok');
    row('transmissionId', result.transmissionId ?? '<null>', result.transmissionId ? 'ok' : 'warn');
    row('status',         result.status, result.status === 'received' ? 'ok' : 'warn');
    row('transport',      result.transport, 'ok');
    row('httpStatus',     String(result.httpStatus ?? '<null>'), result.httpStatus && result.httpStatus < 300 ? 'ok' : 'warn');
    row('ackReceivedAt',  result.ackReceivedAt ? result.ackReceivedAt.toISOString() : '<null>', result.ackReceivedAt ? 'ok' : 'warn');
    row('message',        result.message);

    section('Ack chain');
    row('ack1 (receipt-of-transmission)', result.transport === 'as2' && result.status === 'received'
      ? `MDN ${result.transmissionId}  at  ${result.ackReceivedAt?.toISOString() ?? '<n/a>'}`
      : `<not yet — transport=${result.transport}, status=${result.status}>`,
      result.transport === 'as2' && result.status === 'received' ? 'ok' : 'warn');
    row('ack2 (virus + structure check)', '<async; observe in WebTrader>', 'warn');
    row('ack3 (center acceptance)',       '<async; observe in WebTrader>', 'warn');

    if (result.transport === 'sftp') {
      process.stdout.write('\n');
      process.stdout.write(warn('  SFTP path: status is honestly in_transit. FDA picks the file up async\n'));
      process.stdout.write(warn('  and emits ack1/2/3 via /outgoing/. See runbook §8.\n'));
    }

    process.exit(0);
  } catch (e: unknown) {
    const ms = Date.now() - t0;
    process.stdout.write(err(`FAILED  (${ms} ms)\n`));
    const errObj = e as { name?: string; message?: string; httpStatus?: number };
    process.stdout.write(`  error class: ${errObj.name ?? 'unknown'}\n`);
    process.stdout.write(`  message:     ${errObj.message ?? String(e)}\n`);
    if (errObj.httpStatus) process.stdout.write(`  http status: ${errObj.httpStatus}\n`);
    process.stdout.write(dim('\n  See runbook §10 for failure-mode diagnostics.\n'));
    process.exit(2);
  }
}

main().catch((e) => {
  process.stderr.write(err(`\nFatal: ${(e as Error).message}\n`));
  process.exit(2);
});
