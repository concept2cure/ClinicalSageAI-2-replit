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
 * endpoint would REJECT this envelope (a 4xx or a refusing MDN, surfaced
 * honestly as a GatewayError — the success path below only runs on a 2xx whose
 * MDN accepts this very message, which a conformant gateway will not return to
 * a non-conformant message; a 5xx is recorded in transit, since an
 * intermediary may hold the bytes — classifyAs2Delivery, 2026-09-23 MDN final
 * pass). Likewise the synchronous
 * MDN is persisted but NOT cryptographically verified, and checkStatus() does
 * not poll FDA for async ack1/ack2/ack3. Closing this needs a real CMS
 * implementation (a vendored ASN.1/CMS library) + MDN signature verification +
 * an ack poller. Do not represent AS2 transmission as production-ready until
 * that lands; SFTP is the nearer-term real path (and requires ssh2-sftp-client,
 * currently absent from package.json).
 *
 *   3. ESG NextGen REST API (`FDA_ESG_TRANSPORT=rest`; W5 2026-09-20, runbook
 *      B16 / competitive delta §3): FDA retired WebTrader in April 2025 and
 *      offers a REST API beside AS2. The adapter resolves its credentials from
 *      the environment and sits behind the same SubmissionGateway interface,
 *      but its wire contract (upload endpoint, auth exchange, response shape)
 *      has NOT been verified against FDA's ESG NextGen API documentation and
 *      pre-production environment, so `transmit` raises the typed
 *      `UnverifiedTransportError` BEFORE any transmittal row exists — never a
 *      stub that pretends. Replace `transmitViaNextGenRest` with the real call
 *      only after the contract is verified in FDA's UAT.
 *
 * ── Environment variables ─────────────────────────────────────────────────
 * Production reads `FDA_ESG_*`; staging reads `FDA_ESG_STAGING_*` (same suffixes).
 *
 *   FDA_ESG_TRANSPORT        'as2' (default) | 'rest'. Which transport
 *                            `transmit` uses; bundles > 1 GB fall to SFTP on the
 *                            AS2 path. Any other value is refused as a
 *                            configuration error.
 *   AS2 / SFTP path:
 *   FDA_ESG_URL              FDA AS2 endpoint (https://…)
 *   FDA_ESG_AS2_FROM         Sponsor AS2 id assigned by FDA
 *   FDA_ESG_AS2_TO           FDA AS2 id (default 'FDA-CESUB')
 *   FDA_ESG_CERT_PATH        mTLS client certificate (PEM path)
 *   FDA_ESG_KEY_PATH         mTLS private key (PEM path)
 *   FDA_ESG_FDA_CERT_PATH    FDA's certificate (PEM path) — TLS trust anchor
 *   FDA_ESG_SFTP_HOST / FDA_ESG_SFTP_USER / FDA_ESG_SFTP_KEY_PATH  SFTP fallback
 *   REST (NextGen) path:
 *   FDA_ESG_REST_URL         ESG NextGen API base URL (https://…)
 *   FDA_ESG_REST_CLIENT_ID   API client id issued with the ESG NextGen account
 *   FDA_ESG_REST_CLIENT_SECRET  matching client secret
 *   FDA_ESG_REST_SUBMITTER_ID   the ESG account / submitter identifier FDA
 *                            files submissions under
 *
 * Every transport requires credentials in the platform secrets store; the
 * gateway flags presence + emits CredentialError naming the missing variables
 * rather than silently failing.
 *
 * Acks:
 *   ack1 — receipt-of-transmission (FDA gateway received the bytes)
 *   ack2 — virus scan + structure check passed (FDA AS2 accepted)
 *   ack3 — center-specific (CDER / CDRH / CBER) acceptance into review
 */

import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import { pool } from '../../db';
import { readVerifiedBundle } from './bundle-integrity';
import { platformTransmittalRecord } from './acknowledgement';
import {
  attemptDelivery, buildAs2Headers, classifyAs2Delivery, postAs2, signAs2Body, type DeliveryOutcome,
} from './as2-transport';
import {
  CredentialError, GatewayError, NOTHING_TRANSMITTED, TransportError, UnverifiedTransportError,
  resolveToRegistryEntry,
  type GatewayAcknowledgment, type GatewayStatusResult, type GatewayTransmitRequest,
  type GatewayTransmitResult, type SubmissionGateway, type SubmissionStatus,
  requiredAgencyMetadata,
  ValidationError
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

/* ─── Transport selection + ESG NextGen REST credentials ────────── */

export type FdaEsgConfiguredTransport = 'as2' | 'rest';

function envVarName(environment: 'staging' | 'production', suffix: string): string {
  return `FDA_ESG${environment === 'staging' ? '_STAGING' : ''}_${suffix}`;
}

/**
 * Which transport this environment is configured for. Unset means AS2 (the
 * path every existing deployment and test exercises). Any value other than
 * 'as2' / 'rest' is a configuration error and is refused as a CredentialError
 * naming the variable — silently falling back to AS2 would put bytes on a
 * transport the operator did not choose.
 */
export function resolveFdaEsgTransport(environment: 'staging' | 'production'): FdaEsgConfiguredTransport {
  const raw = (envFor(environment, 'TRANSPORT') ?? 'as2').trim().toLowerCase();
  if (raw === 'as2' || raw === '') return 'as2';
  if (raw === 'rest') return 'rest';
  throw new CredentialError('fda', 'esg', environment, [
    `${envVarName(environment, 'TRANSPORT')} (must be 'as2' or 'rest'; got '${raw}')`,
  ]);
}

interface FdaEsgRestCredentials {
  baseUrl:      string;
  clientId:     string;
  clientSecret: string;
  submitterId:  string;
}

/** ESG NextGen REST credentials. Missing → CredentialError naming each variable. */
export function loadFdaRestCredentials(environment: 'staging' | 'production'): FdaEsgRestCredentials {
  const missing: string[] = [];
  const baseUrl      = envFor(environment, 'REST_URL');
  const clientId     = envFor(environment, 'REST_CLIENT_ID');
  const clientSecret = envFor(environment, 'REST_CLIENT_SECRET');
  const submitterId  = envFor(environment, 'REST_SUBMITTER_ID');
  if (!baseUrl)      missing.push(envVarName(environment, 'REST_URL'));
  if (!clientId)     missing.push(envVarName(environment, 'REST_CLIENT_ID'));
  if (!clientSecret) missing.push(envVarName(environment, 'REST_CLIENT_SECRET'));
  if (!submitterId)  missing.push(envVarName(environment, 'REST_SUBMITTER_ID'));
  if (missing.length > 0) throw new CredentialError('fda', 'esg', environment, missing);
  return { baseUrl: baseUrl!, clientId: clientId!, clientSecret: clientSecret!, submitterId: submitterId! };
}

/**
 * The ESG NextGen REST transmit. A no-op unless FDA_ESG_TRANSPORT=rest selects
 * it. Credentials are resolved (so an unprovisioned environment still reports
 * exactly which variables are missing) and then the call is REFUSED with the typed UnverifiedTransportError: the platform holds
 * no verified copy of FDA's ESG NextGen API contract, and a request shaped from
 * a guess would either be rejected by FDA or — worse — accepted for something
 * other than what was intended. No transmittal row, no identifier.
 *
 * When the contract is verified (FDA ESG NextGen API documentation + a
 * pre-production round trip in `docs/runbooks/fda-esg-production-uat.md`),
 * replace the throw with the real request and record the response verbatim
 * on the transmittal row, as the AS2 path records the MDN.
 */
function transmitViaNextGenRest(
  environment: 'staging' | 'production',
): void {
  if (resolveFdaEsgTransport(environment) !== 'rest') return;
  const creds = loadFdaRestCredentials(environment);
  throw new UnverifiedTransportError(
    'fda', 'esg', 'rest',
    `Endpoint ${creds.baseUrl} (submitter ${creds.submitterId}) is configured, but the ESG NextGen ` +
    'upload/auth/response contract has not been verified against FDA documentation or exercised in ' +
    "FDA's pre-production environment. Use FDA_ESG_TRANSPORT=as2 for the verified AS2 path, or complete " +
    'the NextGen UAT and replace transmitViaNextGenRest.',
  );
}

/* ─── AS2 envelope (RFC 4130) ────────────────────────────────────── */

/* Envelope framing, body signing, the mTLS POST and MDN interpretation live
   in ./as2-transport.ts, shared with the E2B(R3) ICSR transport so there is
   exactly one AS2 implementation. The PKCS#7 conformance gap is documented
   there and at the top of this file. */

/** The agency application number the SFTP path is filed under; refused when absent. */
function sftpApplicationId(req: GatewayTransmitRequest): string {
  const raw = req.metadata?.applicationId;
  const applicationId = typeof raw === 'string' ? raw.trim() : '';
  if (!applicationId || /^UNASSIGNED/i.test(applicationId)) {
    throw new ValidationError('FDA ESG SFTP transmit requires the agency application number; nothing is sent without it.', []);
  }
  return applicationId;
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

/**
 * Record an AS2 attempt that did not end RECEIVED, and return the error the
 * transmit throws. The outcome comes from classifyAs2Delivery
 * (./as2-transport.ts) — the one delivery rule FDA ESG and the ICSR transport
 * share; nothing here re-derives it.
 *
 *   REFUSED_BY_AGENCY     'rejected' (errorClass 'gateway'), the HTTP status and
 *                         the agency's body kept. FDA answered and refused.
 *   DELIVERED_UNCONFIRMED 'in_transit' — inside the duplicate-send lock
 *                         (findActiveTransmittal, sub_trans_active_lock_idx) —
 *                         with the response's Message-ID or our AS2 Message-ID
 *                         as the transmission id (checkStatus reports a row
 *                         without one as never transmitted), the HTTP status and
 *                         body when there was one, and an error telling the
 *                         operator to confirm at FDA before any resend.
 *   NOT_DELIVERED         thrown as a TransportError whose message says nothing
 *                         reached FDA; transmit's catch records it 'rejected'
 *                         (errorClass 'transport'). It carries the
 *                         NOTHING_TRANSMITTED proof: the classifier's verdict
 *                         IS the proof that nothing reached an authenticated
 *                         FDA server, so refusedBeforeWire (index.ts) releases
 *                         the caller's transmit claim — the row says rejected,
 *                         and the sequence must not stay 'transmitting'.
 *
 * History, superseded by the rule above:
 * 2026-09-23 (W5/D7, round-2 review): an accepting MDN that names no
 * Original-Message-ID was recorded 'rejected' — outside the lock — so the same
 * bundle could be transmitted again at once although FDA answered 2xx.
 * 2026-09-23 (W5/D7, round-3 review, passes one to three): every MDN that
 * could not be tied to our message, and every failure after Node's request
 * 'finish', became 'in_transit'.
 * 2026-09-23 (W5/D7, MDN final pass): a non-2xx was 'rejected' whatever it
 * was, so a 502/504 from a proxy that may have forwarded the bundle freed a
 * resend; and a TLS 1.3 refusal of our client certificate (which fires after
 * 'finish') was 'in_transit' although FDA's application never saw a byte.
 * Both now follow the classifier: 5xx held, TLS refusal NOT_DELIVERED.
 * 2026-09-23 (W5/D7, MDN close): the NOT_DELIVERED TransportError carried no
 * proof, so transmitSequence left the sequence claim 'transmitting' — read as
 * "in flight, confirm at FDA" — after e.g. FDA refused our client certificate,
 * while this row said 'rejected'. It now passes NOTHING_TRANSMITTED. Only
 * this verdict may: a DELIVERED_UNCONFIRMED never does.
 * 2026-09-23 (W5/D7, MDN close, repair): the verdict briefly rested on the
 * order of Node's request 'finish' against the answer or failure, so a 502
 * or a reset after FDA had read the whole bundle released the claim. The
 * classifier no longer reads 'finish' (as2-transport.ts); NOT_DELIVERED is
 * only a refusal proven before the request was released.
 */
async function recordAs2Outcome(
  transmittalId: number,
  outcome: Exclude<DeliveryOutcome, { kind: 'RECEIVED' }>,
  messageId: string,
): Promise<Error> {
  if (outcome.kind === 'NOT_DELIVERED') {
    return new TransportError(
      `${outcome.reason}. Nothing reached FDA: the request was never released to an authenticated FDA ` +
        `server (a DNS, connection or TLS handshake/certificate failure), or FDA's TLS layer refused it. ` +
        `Transmittal ${transmittalId} is recorded rejected; correct the cause before sending again.`,
      outcome.error,
      NOTHING_TRANSMITTED,
    );
  }
  if (outcome.kind === 'REFUSED_BY_AGENCY') {
    await updateTransmittal(transmittalId, {
      status: 'rejected', httpStatus: outcome.httpStatus,
      errorClass: 'gateway', errorMessage: outcome.reason, mdnRaw: outcome.responseRaw,
    });
    return new GatewayError(outcome.reason, outcome.httpStatus, null, outcome.responseRaw);
  }
  return recordDeliveredUnconfirmed(transmittalId, outcome.reason, {
    delivery: outcome.httpStatus === null
      ? `The whole bundle was sent to an authenticated FDA endpoint (AS2 Message-ID ${messageId}) before the connection failed`
      : `The bundle was delivered (HTTP ${outcome.httpStatus}, AS2 Message-ID ${messageId})`,
    transmissionId: outcome.trackingId,
    httpStatus: outcome.httpStatus ?? undefined,
    mdnRaw: outcome.responseRaw ?? undefined,
    errorClass: outcome.httpStatus === null ? 'transport' : 'gateway',
  });
}

/** What left for FDA before a transmit failed, when FDA may hold the bundle. */
interface SentBundle {
  /** How the bundle left, for the operator: "The bundle was delivered (HTTP 200, …)". */
  delivery: string;
  transmissionId: string;
  httpStatus?: number;
  mdnRaw?: string;
  errorClass: 'gateway' | 'transport';
}

/**
 * Record a send FDA may hold as 'in_transit' — delivered, receipt unconfirmed,
 * inside the duplicate-send lock — and return the error the transmit throws.
 *
 * 2026-09-23 (W5/D7, round-3 review, third pass): split out so every failure
 * after the bytes left is recorded by one rule. A database failure after FDA
 * answered 2xx went through transmit's catch and was written 'rejected' —
 * outside findActiveTransmittal and sub_trans_active_lock_idx — so the same
 * bundle could be sent again at once. (Which transport failures count as
 * "after the bytes left" is classifyAs2Delivery's call — MDN final pass.)
 * If this write fails too, the row keeps the 'in_transit' written before the
 * send (still inside the lock), and the error says so.
 */
async function recordDeliveredUnconfirmed(transmittalId: number, reason: string, sent: SentBundle): Promise<GatewayError> {
  let errorMessage =
    `${reason} ${sent.delivery} and FDA may hold it: ` +
    `transmittal ${transmittalId} is recorded in transit, not rejected. Confirm receipt at FDA before any resend.`;
  try {
    await updateTransmittal(transmittalId, {
      status: 'in_transit', httpStatus: sent.httpStatus, transmissionId: sent.transmissionId,
      errorClass: sent.errorClass, errorMessage, mdnRaw: sent.mdnRaw,
    });
  } catch (writeErr: unknown) {
    errorMessage +=
      ` Recording this failed (${writeErr instanceof Error ? writeErr.message : String(writeErr)}); ` +
      `the row keeps the in_transit status written before the send.`;
  }
  return new GatewayError(errorMessage, sent.httpStatus ?? null, null, sent.mdnRaw ?? null);
}

/**
 * Record why a transmit failed, and return the error it throws.
 *
 * 2026-09-23 (W5/D7, round-3 review, third pass): moved out of transmit's
 * catch, which wrote 'rejected' for every failure that was not a GatewayError
 * — including a database failure after FDA answered 2xx. Once FDA may hold the
 * bundle (`sent`), the failure is recorded delivered-unconfirmed instead.
 * 'rejected' is kept for failures before the bundle left, and for an explicit
 * refusal of this message.
 * 2026-09-23 (W5/D7, MDN final pass): the AS2 transport failure is no longer
 * classified here (a RequestSentTransportError branch read Node's 'finish' as
 * delivery); recordAs2Outcome records every AS2 attempt from the classifier,
 * and a NOT_DELIVERED TransportError reaches this function only to be written
 * 'rejected'.
 */
async function recordTransmitFailure(
  transmittalId: number,
  err: unknown,
  sent: SentBundle | null,
): Promise<unknown> {
  const cause = err instanceof Error ? err.message : String(err);
  if (sent && !(err instanceof GatewayError)) {
    return recordDeliveredUnconfirmed(transmittalId, `Transmit failed after the bundle left: ${cause}.`, sent);
  }
  if (err instanceof CredentialError) {
    await updateTransmittal(transmittalId, {
      status: 'rejected', errorClass: 'auth', errorMessage: err.message,
    });
  } else if (err instanceof TransportError) {
    await updateTransmittal(transmittalId, {
      status: 'rejected', errorClass: 'transport', errorMessage: err.message,
    });
  } else if (!(err instanceof GatewayError)) {
    /* A GatewayError's status was already updated where it was raised. */
    await updateTransmittal(transmittalId, {
      status: 'rejected', errorClass: 'gateway', errorMessage: cause,
    });
  }
  return err;
}

/* ─── SFTP fallback ──────────────────────────────────────────────── */

async function transmitViaSftp(
  creds: FdaEsgCredentials,
  environment: 'staging' | 'production',
  bundlePath: string,
  applicationId: string,
  sequence: string,
): Promise<{ transmissionId: string; transport: 'sftp' }> {
  if (!creds.sftpHost || !creds.sftpUser || !creds.sftpKeyPem) {
    // 2026-09-23 (W5/D7, MDN close): named 'production' and the non-STAGING
    // variables whatever environment the credentials were resolved for, so a
    // staging operator was told to set FDA_ESG_SFTP_*. `environment` is the
    // one loadFdaCredentials resolved `creds` for.
    throw new CredentialError(
      'fda', 'esg', environment,
      [envVarName(environment, 'SFTP_HOST'), envVarName(environment, 'SFTP_USER'), envVarName(environment, 'SFTP_KEY_PATH')],
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
    // 2026-09-23 (W5/D7, MDN close; the round-3 skeptic's deferred change):
    // refused before any connection is opened, so it carries the typed
    // transmitted:false proof and refusedBeforeWire releases the caller's
    // claim; recordTransmitFailure still records the row rejected/transport.
    // The connect()/put() failure below must NOT carry it: a partial upload is
    // possible there.
    throw new TransportError(
      "FDA ESG SFTP transport requires 'ssh2-sftp-client' package; nothing was sent. " +
      "Install it (npm install ssh2-sftp-client) and retry.",
      undefined,
      NOTHING_TRANSMITTED,
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
      if (resolveFdaEsgTransport(environment) === 'rest') {
        // Configured means credentials resolve. It does NOT mean the REST
        // transport can transmit — see transmitViaNextGenRest — and
        // gatewayConfigurationStatus() reports the transport so a surface can
        // say which one.
        loadFdaRestCredentials(environment);
        return true;
      }
      await loadFdaCredentials(organizationId, environment);
      return true;
    } catch {
      // Any failure to load the credentials — a missing variable, or a cert
      // or key file that cannot be read — means not configured. This used to
      // answer true for everything except a missing variable, so an unmounted
      // or rotated-away certificate showed the gateway as configured.
      return false;
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

    /* Operator-selected transport. When FDA_ESG_TRANSPORT=rest the NextGen
       adapter refuses with a typed error before a transmittal row exists — see
       transmitViaNextGenRest; otherwise this is a no-op and AS2/SFTP follows. */
    transmitViaNextGenRest(req.environment);

    /* Bundles larger than 1 GB go via SFTP; smaller can use AS2. The
       FDA ESG AS2 path has a documented 1 GB message limit. */
    const useSftp = normalizedReq.bundle.sizeBytes > 1_073_741_824;
    const transport: 'as2' | 'sftp' = useSftp ? 'sftp' : 'as2';
    // The SFTP path is filed under /incoming/<application>/<sequence>/, so both
    // are required there; the AS2 envelope carries neither (an eSTAR has no
    // eCTD sequence). Refuse before a transmittal row exists: a refused
    // request is not a transmittal.
    if (transport === 'sftp') {
      sftpApplicationId(normalizedReq);
      requiredAgencyMetadata(normalizedReq);
    }
    const transmittalId = await createTransmittalRow(normalizedReq, transport);
    /* 2026-09-23 (W5/D7, round-3 review, third pass): what has left for FDA,
       once FDA may hold it. The catch below records any failure after that
       point (a database write after FDA answered) as delivered-unconfirmed
       ('in_transit', inside the lock), never 'rejected' — see
       recordDeliveredUnconfirmed. */
    let sent: SentBundle | null = null;

    try {
      const creds = await loadFdaCredentials(req.organizationId, req.environment);
      await updateTransmittal(transmittalId, { status: 'in_transit' });

      if (transport === 'sftp') {
        // The application number and sequence name the /incoming/ path FDA
        // files the bundle under. These defaulted to `APP-<packageId>` and
        // '0001', so a bundle with no application number was deposited under
        // a name FDA could not route.
        const applicationId = sftpApplicationId(normalizedReq);
        const sequence = requiredAgencyMetadata(normalizedReq).sequenceNumber;
        // Verify the on-disk bytes match the signed descriptor before SFTP
        // streams the file by path.
        await readVerifiedBundle(req.bundle);
        const result = await transmitViaSftp(creds, req.environment, req.bundle.path, applicationId, sequence);
        sent = {
          delivery: `The bundle was deposited over SFTP (${result.transmissionId})`,
          transmissionId: result.transmissionId, errorClass: 'transport',
        };
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

      /* 2026-09-23 (W5/D7, MDN final pass): one attempt, one outcome from the
         shared classifier — see recordAs2Outcome. The HTTP Content-Type goes
         to parseMdn inside it (an unsigned multipart/report's boundary is not
         in the body; round-3 review, second pass). */
      const outcome = classifyAs2Delivery(await attemptDelivery(() => postAs2({
        endpoint: creds.endpointUrl, headers, body,
        clientCertPem: creds.clientCertPem, clientKeyPem: creds.clientKeyPem,
        agencyCertPem: creds.fdaCertPem, errorPrefix: 'ESG AS2 POST',
      })), messageId);
      if (outcome.kind !== 'RECEIVED') throw await recordAs2Outcome(transmittalId, outcome, messageId);

      /* Persist the raw MDN body verbatim alongside the message-id. The
         §11.10(e) audit trail needs the agency's response as it arrived on
         the wire, not a kit-side reconstruction (per FDA ESG production UAT
         §11). downloadAcknowledgment() returns this string when present and
         falls back to synthesised text for pre-migration rows. The MDN's own
         Message-ID when FDA sends one; otherwise the AS2 message it was
         verified to acknowledge. */
      const mdnRaw = outcome.responseRaw;
      const mdnId = outcome.receiptId;
      sent = {
        delivery: `The bundle was delivered (HTTP ${outcome.httpStatus}, AS2 Message-ID ${messageId})`,
        transmissionId: mdnId, httpStatus: outcome.httpStatus, mdnRaw, errorClass: 'gateway',
      };
      await updateTransmittal(transmittalId, {
        status: 'received', transmissionId: mdnId,
        httpStatus: outcome.httpStatus, ackReceivedAt: new Date(),
        mdnRaw,
      });
      return {
        transmittalId, transmissionId: mdnId, status: 'received', transport: 'as2',
        httpStatus: outcome.httpStatus, ackReceivedAt: new Date(),
        message: `FDA ESG AS2 transmit accepted. MDN: ${mdnId}.`,
      };
    } catch (err: unknown) {
      throw await recordTransmitFailure(transmittalId, err, sent);
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
      source: 'stored',
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
        /* 2026-09-23 (W5/D7, round-3 review) — RESIDUAL, not fixed here: a row
           that is not 'received' (an explicit rejection, or an in_transit row
           whose MDN could not be tied to the message) has no ack_received_at,
           so this falls back to the download time. It should be null, but
           GatewayAcknowledgment.receivedAt is `Date` (types.ts) and the same
           fallback is in platformTransmittalRecord (acknowledgement.ts). */
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
