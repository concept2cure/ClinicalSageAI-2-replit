/**
 * FDA Electronic Submissions Gateway (ESG) — AS2 over HTTPS + SFTP fallback.
 *
 * AS2 (RFC 4130) transport scaffolding over mTLS. It makes a REAL network call
 * to the configured FDA AS2 endpoint (no simulation), credential-gated and
 * fail-closed. Two transports:
 *
 *   1. AS2 over HTTPS (preferred for IND/NDA/BLA, 510(k), DMF):
 *      - mTLS handshake against the FDA AS2 endpoint
 *      - AS2-From / AS2-To / Message-ID / Disposition-Notification headers
 *      - Synchronous MDN (Message Disposition Notification) returned in
 *        the HTTP response body, persisted verbatim (mdnRaw)
 *
 *   2. SFTP (used for very large submissions + by orgs without AS2):
 *      - SSH key auth against esg-sftp.fda.gov, PUT to /incoming/…
 *      - FDA picks up and emits ack1/ack2/ack3 over /outgoing/ later
 *
 * ── KNOWN CONFORMANCE GAP (not yet production-conformant) ────────────────────
 * The AS2 *message envelope* is NOT yet a PKCS#7/CMS S/MIME structure. The body
 * is posted as `application/octet-stream`; `signAs2Body` computes a detached
 * RSA-SHA256 signature but it is NOT attached as an S/MIME `multipart/signed` or
 * `application/pkcs7-mime` part, and there is no PKCS#7 *encryption*. FDA ESG
 * (Axway/Cyclone AS2) requires an S/MIME PKCS#7-signed message, so a real FDA
 * endpoint would REJECT this envelope (a non-2xx, surfaced honestly as a
 * GatewayError — the success path below only runs on a 2xx, which a conformant
 * gateway will not return to a non-conformant message). Likewise the synchronous
 * MDN is persisted but NOT cryptographically verified, and checkStatus() does
 * not poll FDA for async ack1/ack2/ack3. Closing this needs a real CMS
 * implementation (a vendored ASN.1/CMS library) + MDN signature verification +
 * an ack poller. Do not represent AS2 transmission as production-ready until
 * that lands; SFTP is the nearer-term real path (and requires ssh2-sftp-client,
 * currently absent from package.json).
 *
 * Both transports require credentials in the platform secrets store; the gateway
 * flags presence + emits CredentialError when missing rather than silently
 * failing.
 *
 * Acks:
 *   ack1 — receipt-of-transmission (FDA gateway received the bytes)
 *   ack2 — virus scan + structure check passed (FDA AS2 accepted)
 *   ack3 — center-specific (CDER / CDRH / CBER) acceptance into review
 */

import { promises as fs } from 'fs';
import { createHash, randomUUID, createSign } from 'crypto';
import * as https from 'node:https';
import { URL } from 'url';
import { pool } from '../../db';
import { readVerifiedBundle } from './bundle-integrity';
import { platformTransmittalRecord } from './acknowledgement';
import {
  CredentialError, GatewayError, TransportError,
  resolveToRegistryEntry, getSubmissionTypeLabel,
  type GatewayAcknowledgment, type GatewayStatusResult, type GatewayTransmitRequest,
  type GatewayTransmitResult, type SubmissionGateway, type SubmissionStatus,
} from './types';

/* ─── Credential resolution ──────────────────────────────────────── */

interface FdaEsgCredentials {
  endpointUrl:   string;       // 'https://esg.fda.gov' or staging variant
  as2From:       string;       // Sponsor's AS2 identifier (assigned by FDA)
  as2To:         string;       // FDA AS2 identifier (e.g. 'FDA-CESUB')
  clientCertPem: string;       // mTLS client cert (also signs AS2)
  clientKeyPem:  string;       // mTLS private key
  fdaCertPem:    string;       // FDA's AS2 public cert (encrypts AS2 to FDA)
  sftpHost?:     string;
  sftpUser?:     string;
  sftpKeyPem?:   string;
}

function envFor(env: 'staging' | 'production', key: string): string | undefined {
  /* Staging variants are prefixed FDA_ESG_STAGING_*; production uses
     FDA_ESG_*. The kit's gateway-credentials table records the secretsRef
     so the platform knows which env var to read. */
  const prefix = env === 'production' ? 'FDA_ESG_' : 'FDA_ESG_STAGING_';
  return process.env[prefix + key];
}

async function loadFdaCredentials(
  organizationId: number,
  environment: 'staging' | 'production',
): Promise<FdaEsgCredentials> {
  const missing: string[] = [];
  const endpointUrl = envFor(environment, 'URL');
  const as2From     = envFor(environment, 'AS2_FROM');
  const as2To       = envFor(environment, 'AS2_TO') ?? 'FDA-CESUB';
  const certPath    = envFor(environment, 'CERT_PATH');
  const keyPath     = envFor(environment, 'KEY_PATH');
  const fdaCertPath = envFor(environment, 'FDA_CERT_PATH');
  if (!endpointUrl)    missing.push(`FDA_ESG${environment === 'staging' ? '_STAGING' : ''}_URL`);
  if (!as2From)        missing.push(`FDA_ESG${environment === 'staging' ? '_STAGING' : ''}_AS2_FROM`);
  if (!certPath)       missing.push(`FDA_ESG${environment === 'staging' ? '_STAGING' : ''}_CERT_PATH`);
  if (!keyPath)        missing.push(`FDA_ESG${environment === 'staging' ? '_STAGING' : ''}_KEY_PATH`);
  if (!fdaCertPath)    missing.push(`FDA_ESG${environment === 'staging' ? '_STAGING' : ''}_FDA_CERT_PATH`);
  if (missing.length > 0) {
    throw new CredentialError('fda', 'esg', environment, missing);
  }
  /* Verify the credential row is recorded for this org × environment so
     audit can answer "why did this org's submission go through?". */
  void pool.query(
    `INSERT INTO submission_gateway_credentials (
       organization_id, region, gateway, environment, credential_kind,
       identifier, secrets_ref, status
     ) VALUES ($1, 'fda', 'esg', $2, 'mtls', $3, $4, 'active')
     ON CONFLICT (organization_id, region, gateway, environment) DO NOTHING`,
    [organizationId, environment, as2From, certPath],
  ).catch((err) => {
    // Best-effort; do not block transmit — but a missing credential audit row
    // breaks "why did this org's submission go through?", so surface it.
    console.error('[fda-esg] credential audit row insert failed:', err?.message ?? err);
  });

  const [clientCertPem, clientKeyPem, fdaCertPem] = await Promise.all([
    fs.readFile(certPath!, 'utf8'),
    fs.readFile(keyPath!, 'utf8'),
    fs.readFile(fdaCertPath!, 'utf8'),
  ]);

  return {
    endpointUrl: endpointUrl!,
    as2From: as2From!,
    as2To,
    clientCertPem, clientKeyPem, fdaCertPem,
    sftpHost: envFor(environment, 'SFTP_HOST'),
    sftpUser: envFor(environment, 'SFTP_USER'),
    sftpKeyPem: envFor(environment, 'SFTP_KEY_PATH')
      ? await fs.readFile(envFor(environment, 'SFTP_KEY_PATH')!, 'utf8')
      : undefined,
  };
}

/* ─── AS2 envelope (RFC 4130) ────────────────────────────────────── */

/* Hand-rolled AS2 framing. Real AS2 production traffic typically also
   uses CMS/PKCS#7 envelope wrapping for signing + encryption; we frame
   the message + sign with the client key here, and use TLS for the
   encryption (FDA accepts TLS-protected AS2). Adding full PKCS#7
   encryption is a follow-up: routine to add but takes the AS2 piece from
   ~120 LoC to ~400 LoC and pulls in node-forge or @peculiar/asn1-cms.
   Flagged in docs/runbooks/fda-esg-setup.md. */

interface As2Message {
  messageId:   string;
  from:        string;
  to:          string;
  contentType: string;
  body:        Buffer;
  signaturePem: string;
}

function buildAs2Headers(msg: As2Message): Record<string, string> {
  return {
    'Message-ID':                msg.messageId,
    'AS2-From':                  msg.from,
    'AS2-To':                    msg.to,
    'AS2-Version':               '1.2',
    'Disposition-Notification-To': msg.from,
    'Disposition-Notification-Options': 'signed-receipt-protocol=optional, pkcs7-signature; signed-receipt-micalg=optional, sha-256',
    'Receipt-Delivery-Option':   'sync',  /* synchronous MDN — easier to wire */
    'Content-Type':              msg.contentType,
    'Content-Disposition':       'attachment; filename="ectd.zip"',
    'Content-Length':            String(msg.body.length),
    'User-Agent':                'concept2cure-mdx/1.0',
  };
}

function signAs2Body(body: Buffer, privateKeyPem: string): string {
  /* Detached SHA-256 signature over the body. FDA's MDN signing
     verification expects the signature in the MDN; the request-side
     signature is the sponsor's proof of origin. Production uses CMS
     SignedData; this scaffolds the path. */
  const signer = createSign('RSA-SHA256');
  signer.update(body);
  return signer.sign(privateKeyPem, 'base64');
}

/* ─── Transmittal helpers ────────────────────────────────────────── */

async function createTransmittalRow(
  req: GatewayTransmitRequest,
  transport: 'as2' | 'sftp',
): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO submission_transmittals (
       organization_id, program_id, package_id, region, gateway, format,
       submission_type, transport, bundle_path, bundle_sha256,
       bundle_size_bytes, status, submitted_by, metadata
     ) VALUES ($1, $2, $3, 'fda', 'esg', $4, $5, $6, $7, $8, $9, 'pending', $10, $11)
     RETURNING id`,
    [
      req.organizationId, req.programId, req.packageId, req.bundle.format,
      req.submissionType ?? null, transport, req.bundle.path,
      req.bundle.sha256, req.bundle.sizeBytes, req.userId,
      JSON.stringify(req.metadata ?? {}),
    ],
  );
  return rows[0].id;
}

async function updateTransmittal(
  id: number,
  patch: Partial<{
    status:         SubmissionStatus;
    transmissionId: string;
    httpStatus:     number;
    errorClass:     string;
    errorMessage:   string;
    ackReceivedAt:  Date;
    completedAt:    Date;
    /**
     * Raw MDN response body — persisted on the row so the §11.10(e) audit
     * trail and downloadAcknowledgment can return what the agency actually
     * sent rather than a kit-side reconstruction. See migration
     * 20260629_submission_transmittals_mdn_raw.sql.
     */
    mdnRaw:         string;
  }>,
): Promise<void> {
  const COL: Record<string, string> = {
    status: 'status', transmissionId: 'transmission_id', httpStatus: 'http_status',
    errorClass: 'error_class', errorMessage: 'error_message',
    ackReceivedAt: 'ack_received_at', completedAt: 'completed_at',
    mdnRaw: 'mdn_raw',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    args.push(v); setFrags.push(`${COL[k]} = $${args.length}`);
  }
  if (setFrags.length === 0) return;
  setFrags.push(`updated_at = NOW()`);
  args.push(id);
  await pool.query(
    `UPDATE submission_transmittals SET ${setFrags.join(', ')} WHERE id = $${args.length}`,
    args,
  );
}

/* ─── HTTPS POST helper (with mTLS) ──────────────────────────────── */

interface As2Response {
  httpStatus: number;
  headers:    Record<string, string | string[] | undefined>;
  body:       Buffer;
}

function postAs2(
  endpoint: string, headers: Record<string, string>, body: Buffer,
  cert: string, key: string, fdaCert: string,
): Promise<As2Response> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const req = https.request({
      hostname: url.hostname,
      port:     url.port ? Number(url.port) : 443,
      path:     url.pathname + url.search,
      method:   'POST',
      headers,
      cert,
      key,
      ca:       fdaCert,  /* trust FDA's cert */
      rejectUnauthorized: true,
      timeout:  60_000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({
        httpStatus: res.statusCode ?? 0,
        headers:    res.headers as Record<string, string | string[] | undefined>,
        body:       Buffer.concat(chunks),
      }));
    });
    req.on('error', (err) => reject(new TransportError(`ESG AS2 POST failed: ${err.message}`, err)));
    req.on('timeout', () => { req.destroy(); reject(new TransportError('ESG AS2 POST timeout')); });
    req.write(body);
    req.end();
  });
}

/* ─── SFTP fallback ──────────────────────────────────────────────── */

async function transmitViaSftp(
  creds: FdaEsgCredentials,
  bundlePath: string,
  applicationId: string,
  sequence: string,
): Promise<{ transmissionId: string; transport: 'sftp' }> {
  if (!creds.sftpHost || !creds.sftpUser || !creds.sftpKeyPem) {
    throw new CredentialError(
      'fda', 'esg', 'production',
      ['FDA_ESG_SFTP_HOST', 'FDA_ESG_SFTP_USER', 'FDA_ESG_SFTP_KEY_PATH'],
    );
  }
  /* SFTP transport uses `ssh2-sftp-client` — kept as a dynamic import so
     the package is optional (orgs that only use AS2 don't pay the
     install). Throws TransportError when the package is missing. The
     module name is built at runtime so TS doesn't try to resolve type
     defs that may not be installed in this environment. */
  let sftpModule: { default: new () => unknown };
  try {
    const moduleName = 'ssh2-sftp-client';
    sftpModule = await import(/* @vite-ignore */ moduleName) as { default: new () => unknown };
  } catch {
    throw new TransportError(
      "FDA ESG SFTP transport requires 'ssh2-sftp-client' package. " +
      "Install it (npm install ssh2-sftp-client) and retry.",
    );
  }
  const Client = sftpModule.default as new () => {
    connect: (opts: Record<string, unknown>) => Promise<void>;
    put: (src: string, dest: string) => Promise<void>;
    end: () => Promise<void>;
  };
  const client = new Client();
  try {
    await client.connect({
      host:       creds.sftpHost,
      port:       22,
      username:   creds.sftpUser,
      privateKey: creds.sftpKeyPem,
    });
    const transmissionId = `sftp-${applicationId}-${sequence}-${Date.now()}`;
    const remotePath = `/incoming/${applicationId}/${sequence}/${transmissionId}.zip`;
    await client.put(bundlePath, remotePath);
    return { transmissionId, transport: 'sftp' };
  } catch (err: unknown) {
    throw new TransportError(`FDA ESG SFTP transmit failed: ${err instanceof Error ? err.message : String(err)}`, err);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/* ─── Gateway implementation ─────────────────────────────────────── */

export class FdaEsgGateway implements SubmissionGateway {
  readonly region    = 'fda' as const;
  readonly gateway   = 'esg' as const;
  /* `transport` here is the default; per-transmit selection is dynamic
     based on bundle size and credential availability (large bundles
     prefer SFTP; AS2 when configured). */
  readonly transport = 'as2' as const;

  async isConfigured(organizationId: number, environment: 'staging' | 'production'): Promise<boolean> {
    try {
      await loadFdaCredentials(organizationId, environment);
      return true;
    } catch (err) {
      return !(err instanceof CredentialError);
    }
  }

  async transmit(req: GatewayTransmitRequest): Promise<GatewayTransmitResult> {
    /* Resolve the caller-supplied submission type through the canonical bridge
       so the transmittal row and wire metadata use the canonical identifier.
       Falls back to the raw string for unrecognized types. */
    const resolvedEntry = req.submissionType ? resolveToRegistryEntry(req.submissionType) : null;
    const normalizedReq: GatewayTransmitRequest = resolvedEntry
      ? { ...req, submissionType: resolvedEntry.applicationType }
      : req;

    /* Bundles larger than 1 GB go via SFTP; smaller can use AS2. The
       FDA ESG AS2 path has a documented 1 GB message limit. */
    const useSftp = normalizedReq.bundle.sizeBytes > 1_073_741_824;
    const transport: 'as2' | 'sftp' = useSftp ? 'sftp' : 'as2';
    const transmittalId = await createTransmittalRow(normalizedReq, transport);

    try {
      const creds = await loadFdaCredentials(req.organizationId, req.environment);
      await updateTransmittal(transmittalId, { status: 'in_transit' });

      if (transport === 'sftp') {
        const applicationId =
          (req.metadata?.applicationId as string | undefined) ?? `APP-${req.packageId ?? 'pkg'}`;
        const sequence =
          (req.metadata?.sequence as string | undefined) ?? '0001';
        // Verify the on-disk bytes match the signed descriptor before SFTP
        // streams the file by path.
        await readVerifiedBundle(req.bundle);
        const result = await transmitViaSftp(creds, req.bundle.path, applicationId, sequence);
        // An SFTP PUT only deposits the bundle in FDA's /incoming/ directory —
        // it is NOT an acknowledgment. FDA picks the file up asynchronously and
        // emits ack1/ack2/ack3 over /outgoing/ later (see the ack notes at the
        // top of this file). The honest post-upload state is therefore
        // `in_transit` with NO ack timestamp; marking it `received` with an
        // ackReceivedAt of `now` would fabricate an FDA acknowledgment that
        // never arrived. checkStatus() reconciles the real ack once it lands.
        await updateTransmittal(transmittalId, {
          status: 'in_transit',
          transmissionId: result.transmissionId,
        });
        return {
          transmittalId,
          transmissionId: result.transmissionId,
          status: 'in_transit',
          transport: 'sftp',
          httpStatus: null,
          ackReceivedAt: null,
          message: `FDA ESG SFTP upload complete; awaiting FDA receipt. Tracking: ${result.transmissionId}.`,
        };
      }

      /* AS2 transmit. */
      const body = await readVerifiedBundle(req.bundle);
      const messageId = `<${randomUUID()}@${creds.as2From}>`;
      const headers = buildAs2Headers({
        messageId, from: creds.as2From, to: creds.as2To,
        contentType: 'application/octet-stream',
        body,
        signaturePem: signAs2Body(body, creds.clientKeyPem),
      });

      const response = await postAs2(
        creds.endpointUrl, headers, body,
        creds.clientCertPem, creds.clientKeyPem, creds.fdaCertPem,
      );
      const mdnId =
        (response.headers['message-id'] as string | undefined) ?? messageId;

      if (response.httpStatus < 200 || response.httpStatus >= 300) {
        await updateTransmittal(transmittalId, {
          status: 'rejected', httpStatus: response.httpStatus,
          errorClass: 'gateway', errorMessage: `HTTP ${response.httpStatus}: ${response.body.toString('utf8').slice(0, 500)}`,
        });
        throw new GatewayError(
          `FDA ESG AS2 returned HTTP ${response.httpStatus}`,
          response.httpStatus, null, response.body.toString('utf8'),
        );
      }
      /* Persist the raw MDN body verbatim alongside the message-id. The
         §11.10(e) audit trail needs the agency's response as it arrived on
         the wire, not a kit-side reconstruction (per FDA ESG production UAT
         §11). downloadAcknowledgment() returns this string when present and
         falls back to synthesised text for pre-migration rows. */
      const mdnRaw = response.body.toString('utf8');
      await updateTransmittal(transmittalId, {
        status: 'received', transmissionId: mdnId,
        httpStatus: response.httpStatus, ackReceivedAt: new Date(),
        mdnRaw,
      });
      return {
        transmittalId, transmissionId: mdnId, status: 'received', transport: 'as2',
        httpStatus: response.httpStatus, ackReceivedAt: new Date(),
        message: `FDA ESG AS2 transmit accepted. MDN: ${mdnId}.`,
      };
    } catch (err: unknown) {
      if (err instanceof CredentialError) {
        await updateTransmittal(transmittalId, {
          status: 'rejected', errorClass: 'auth', errorMessage: err.message,
        });
      } else if (err instanceof TransportError) {
        await updateTransmittal(transmittalId, {
          status: 'rejected', errorClass: 'transport', errorMessage: err.message,
        });
      } else if (err instanceof GatewayError) {
        /* status already updated above */
      } else {
        await updateTransmittal(transmittalId, {
          status: 'rejected', errorClass: 'gateway',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    }
  }

  async checkStatus(transmittalId: number): Promise<GatewayStatusResult> {
    /* FDA ESG status polling — the gateway emits ack1/ack2/ack3 via
       async MDN or via SFTP /outgoing/<applicant>/. Real implementation
       polls the SFTP /outgoing/ directory or subscribes to the AS2
       async-MDN webhook. Until the credentials are wired, return the
       last-known row state from our DB. */
    const { rows } = await pool.query<{
      transmission_id: string | null; status: string; ack_received_at: Date | null;
    }>(
      `SELECT transmission_id, status, ack_received_at FROM submission_transmittals
        WHERE id = $1 AND region = 'fda' AND gateway = 'esg'`,
      [transmittalId],
    );
    if (rows.length === 0 || !rows[0].transmission_id) {
      throw new GatewayError(`Transmittal ${transmittalId} not found or never transmitted`, 404, null, null);
    }
    return {
      transmittalId,
      transmissionId: rows[0].transmission_id,
      status: rows[0].status as SubmissionStatus,
      ackReceivedAt: rows[0].ack_received_at,
    };
  }

  async downloadAcknowledgment(transmittalId: number): Promise<GatewayAcknowledgment> {
    /* Ack download — when the AS2 transmit captured the agency's MDN body
       (post-migration 20260629_submission_transmittals_mdn_raw), return the
       raw bytes verbatim so the auditor sees what FDA actually said
       (§11.10(e) audit trail). For pre-migration rows where mdn_raw is NULL,
       fall back to a synthesised text summary so the kit's UI still has
       something to render. A future async-MDN poller can fetch
       /outgoing/<applicant>/ over SFTP and back-fill mdn_raw for rows whose
       MDN arrived asynchronously. */
    const { rows } = await pool.query<{
      transmission_id: string; status: string; ack_received_at: Date | null;
      mdn_raw: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT transmission_id, status, ack_received_at, mdn_raw, metadata
         FROM submission_transmittals
        WHERE id = $1 AND region = 'fda' AND gateway = 'esg'`,
      [transmittalId],
    );
    if (rows.length === 0) {
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    }
    const r = rows[0];
    if (r.mdn_raw && r.mdn_raw.length > 0) {
      // Return the verbatim MDN response. message/disposition-notification is
      // the canonical MIME type for MDN; the body itself is multipart and
      // self-describes. We keep the legacy filename extension stable in the
      // route layer so existing UI download links continue to work.
      return {
        transmittalId,
        transmissionId: r.transmission_id,
        contentType: 'message/disposition-notification',
        buffer: Buffer.from(r.mdn_raw, 'utf8'),
        receivedAt: r.ack_received_at ?? new Date(),
        // The only genuine agency artefact the platform holds: FDA's own MDN,
        // stored verbatim at transmit time. Everything else served from this
        // method is a platform record and is labelled as one.
        provenance: 'agency',
      };
    }
    // Not an agency acknowledgement — this platform's own record of the
    // transmission, titled as such. See ./acknowledgement.ts.
    return platformTransmittalRecord({
      transmittalId,
      transmissionId: r.transmission_id,
      gatewayLabel: 'FDA ESG (esg)',
      status: r.status,
      ackReceivedAt: r.ack_received_at,
      extra: { 'Transmission': r.transmission_id },
    });
  }
}

/* ─── Rollback helper (FIX 6) ────────────────────────────────────── */

/** Result of a successful operator-initiated rollback. */
export interface RollbackResult {
  transmittalId: number;
  /** Prior status before the row was flipped to 'rolled_back'. */
  previousStatus: SubmissionStatus;
  /** New status — always 'rolled_back' on a successful rollback. */
  status: 'rolled_back';
  /** Audit-trail correlation id from recordGovernedAction. */
  auditId: string;
  /** Governed-action correlation id (act_*) from recordGovernedAction. */
  actionId: string;
  /** ISO timestamp of the rollback. */
  rolledBackAt: string;
  /**
   * Always true. The platform cannot un-send bytes to an agency — this
   * operation records the rollback in THIS platform's Part 11 audit trail and
   * frees the transmit lock; the agency still holds everything that was
   * transmitted, and the operator must file the agency-side retraction
   * separately (FDA: WebTrader).
   *
   * It is a field rather than a comment because the surface previously told the
   * user "Transmittal #N rolled back at the gateway", and the response carried
   * nothing the client could have used to say otherwise.
   */
  agencyRetractionRequired: true;
  /** What the operator still has to do, in words the surface can render. */
  agencyRetractionNote: string;
}

/** Thrown when a rollback is requested on a transmittal that hasn't shipped
 *  yet (or has already been rolled back / rejected). The HTTP layer maps this
 *  to a 409 Conflict so the operator can refresh the row and retry. */
export class RollbackNotPermittedError extends Error {
  readonly errorClass = 'validation' as const;
  constructor(
    readonly transmittalId: number,
    readonly currentStatus: string,
  ) {
    super(
      `Transmittal ${transmittalId} cannot be rolled back from status '${currentStatus}'. ` +
      `Only 'received' / 'in_transit' / 'ack1_received' / 'ack2_received' / 'ack3_received' ` +
      `transmittals are eligible.`,
    );
    this.name = 'RollbackNotPermittedError';
  }
}

/** Statuses from which an operator is allowed to roll back a transmittal. The
 *  list deliberately excludes terminal-failure states (`rejected`,
 *  `rolled_back`, `completed`) and pre-shipment states (`pending`). */
const ROLLBACKABLE_STATUSES: ReadonlySet<string> = new Set<string>([
  'in_transit',
  'received',
  'ack1_received',
  'ack2_received',
  'ack3_received',
  'validation_passed',
  'validation_failed',
  'review_started',
  'response_required',
]);

/**
 * Operator-initiated rollback of a transmitted FDA ESG submission.
 *
 * The platform cannot un-send bytes to FDA — the operator still has to file a
 * WebTrader retraction with the agency (documented in the FDA ESG production
 * UAT runbook §11). This helper records the rollback INSIDE the kit's audit
 * trail so the §11.10(e) chain has a counterpart to the original `sign`
 * action: the transmittal row flips to `rolled_back`, and a governed action
 * with command `transmittal_rollback` is written linking the actor + reason
 * to the row. The caller (the HTTP route) is responsible for invoking this
 * inside a tenant-scoped handler — this helper itself does NOT validate
 * org-scope on its own; it expects the caller to have already loaded the row
 * tenant-scoped and to pass the verified `organizationId` so the audit row
 * lands under the right tenant.
 *
 * Returns the audit-trail correlation ids so the caller can include them in
 * the HTTP response (and so monitoring can join "FDA submission shipped" to
 * "FDA submission rolled back" in a single ledger query).
 *
 * @param params.transmittalId    The row to roll back. MUST already be
 *                                tenant-checked by the caller.
 * @param params.organizationId   Verified tenant id (used to write the
 *                                governed-action row under the right org).
 * @param params.actorUserId      User initiating the rollback. Captured on
 *                                the audit row.
 * @param params.reason           Free-form rationale (e.g. "wrong sequence
 *                                shipped to FDA — retracting"). Persisted
 *                                verbatim on the governed-action row.
 * @param params.recordGovernedAction Injected to avoid a circular import
 *                                between server/services and server/routes.
 *                                Pass the symbol exported from
 *                                server/routes/c2c/actions.ts.
 */
export async function rollbackTransmittal(params: {
  transmittalId: number;
  organizationId: number;
  actorUserId: number;
  reason: string;
  recordGovernedAction: (
    client: { query: (sql: string, args?: unknown[]) => Promise<{ rows: unknown[] }> },
    p: {
      orgId: number;
      userId: number;
      command: string;
      target: string;
      reason: string;
      payload?: Record<string, unknown>;
      domain?: string;
      surface?: string;
    },
  ) => Promise<{ actionId: string; auditId: string; sha256Chain: string }>;
}): Promise<RollbackResult> {
  const { transmittalId, organizationId, actorUserId, reason, recordGovernedAction } = params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Load the row tenant-scoped + lock it so a concurrent rollback or status
    // update can't race us. SELECT FOR UPDATE means a second rollback waits on
    // this transaction's commit/rollback before evaluating the status guard.
    const { rows } = await client.query<{ status: string; package_id: number | null; bundle_sha256: string | null }>(
      `SELECT status, package_id, bundle_sha256
         FROM submission_transmittals
        WHERE id = $1 AND organization_id = $2 AND region = 'fda' AND gateway = 'esg'
        FOR UPDATE`,
      [transmittalId, organizationId],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      throw new GatewayError(`Transmittal ${transmittalId} not found`, 404, null, null);
    }
    const previousStatus = rows[0].status as SubmissionStatus;
    if (!ROLLBACKABLE_STATUSES.has(previousStatus)) {
      await client.query('ROLLBACK');
      throw new RollbackNotPermittedError(transmittalId, previousStatus);
    }

    // 1) Emit the audit trail entry FIRST. The governed-action row is
    //    immutable; if the subsequent UPDATE fails we want the audit trail
    //    intact so the cause is forensically reconstructable.
    const gov = await recordGovernedAction(client, {
      orgId:   organizationId,
      userId:  actorUserId,
      command: 'transmittal_rollback',
      target:  `transmittal:${transmittalId}`,
      reason,
      payload: {
        meaning: 'submission_rollback',
        previousStatus,
        packageId:    rows[0].package_id,
        bundleSha256: rows[0].bundle_sha256,
      },
      domain:  'mdx',
      surface: 'submission-gateway',
    });

    // 2) Flip the transmittal row to 'rolled_back'. This frees the partial
    //    unique index (sub_trans_active_lock_idx) so a corrective re-transmit
    //    of the same package can be enqueued.
    const rolledBackAt = new Date();
    await client.query(
      `UPDATE submission_transmittals
          SET status        = 'rolled_back',
              completed_at  = $1,
              updated_at    = NOW()
        WHERE id = $2 AND organization_id = $3`,
      [rolledBackAt, transmittalId, organizationId],
    );

    await client.query('COMMIT');

    return {
      transmittalId,
      previousStatus,
      status:        'rolled_back',
      auditId:       gov.auditId,
      actionId:      gov.actionId,
      rolledBackAt:  rolledBackAt.toISOString(),
      agencyRetractionRequired: true,
      agencyRetractionNote:
        'The agency still holds the transmitted bytes. This rollback is recorded in the ' +
        'Concept2Cure audit trail only — file the agency-side retraction directly with the ' +
        'agency (FDA: WebTrader).',
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    throw err;
  } finally {
    client.release();
  }
}

/* ─── Active-transmittal lookup (FIX 7) ──────────────────────────── */

/**
 * Returns the active (pending|in_transit|received) transmittal row for an
 * (organizationId, packageId, bundleSha256) tuple, or null if none exists.
 * Used by the HTTP transmit handler to refuse duplicates with 409 BEFORE the
 * gateway is invoked. The DB-level partial unique index
 * (sub_trans_active_lock_idx) is the backstop for races between this check
 * and the subsequent INSERT.
 *
 * Tenant-scoped: a different org can transmit the same package_id /
 * bundle_sha256 (realistic for a CMO running multiple sponsors).
 */
export async function findActiveTransmittal(params: {
  organizationId: number;
  packageId: number | null;
  bundleSha256: string;
}): Promise<{ id: number; status: string } | null> {
  const { organizationId, packageId, bundleSha256 } = params;
  // If packageId is null we cannot enforce a meaningful lock (the partial
  // index is keyed on package_id). Return null and let the gateway proceed —
  // ad-hoc transmits without a package row are not the surface area the lock
  // is protecting.
  if (packageId == null) return null;

  const { rows } = await pool.query<{ id: number; status: string }>(
    `SELECT id, status FROM submission_transmittals
      WHERE organization_id = $1
        AND package_id      = $2
        AND bundle_sha256   = $3
        AND status IN ('pending', 'in_transit', 'received')
      ORDER BY submitted_at DESC
      LIMIT 1`,
    [organizationId, packageId, bundleSha256],
  );
  return rows[0] ?? null;
}
