/**
 * E2B(R3) ICSR gateway transport — the thin, fail-closed transport adapter that
 * sits *on top of* the completed message builder (`e2b-icsr-message`).
 *
 * `buildIcsrTransmission()` produces the full transmittable ICH ICSR message and
 * a transmit-readiness assessment, but — by design — does not post a single byte
 * to an agency gateway. This module closes that last-mile transport gap, with the
 * same fail-closed discipline as the FDA ESG transport
 * (`server/services/submission-gateways/fda-esg.ts`, reached through the shared
 * `submission-gateways/governed-transmit.ts`):
 *
 *   - With a gateway CONFIGURED, `transmitIcsr()` makes the real network call
 *     (W5 2026-09-20, runbook B7 — it used to throw "not implemented" precisely
 *     here). It reuses the ONE AS2 implementation in
 *     `submission-gateways/as2-transport.ts`; there is no second AS2 client.
 *     A receipt says `transmitted` only when the agency endpoint answered 2xx
 *     AND its MDN accepted the very message that was sent (AS2), or answered
 *     2xx with a receipt identifier (HTTPS). Anything else throws a typed
 *     error — never a fabricated acknowledgement. Which error is decided by
 *     the delivery classifier shared with FDA ESG (classifyDelivery in
 *     as2-transport.ts; 2026-09-23 W5/D7, MDN final pass): NOT_DELIVERED →
 *     stage 'transport', REFUSED_BY_AGENCY → 'gateway-rejected',
 *     DELIVERED_UNCONFIRMED → 'receipt-unproven'.
 *   - In PRODUCTION with no real gateway configured, `transmitIcsr()` THROWS.
 *     Returning a synthetic acknowledgement would tell a user their ICSR reached
 *     FAERS / EudraVigilance when nothing was transmitted — the most dangerous
 *     lie a pharmacovigilance platform can tell.
 *   - Outside production with no gateway it returns an explicitly
 *     `simulated: true` receipt that no caller can mistake for a real agency
 *     acknowledgment (and `markIcsrTransmitted` refuses to record it).
 *   - It refuses outright to transmit a message the readiness gate marks
 *     not-ready (mandatory-element gaps), in any environment.
 *
 * A transport receipt is NOT the E2B acknowledgement. FDA FAERS and
 * EudraVigilance return the ICH ICSR ACK (AA / AE / AR) asynchronously; that is
 * recorded separately by `markIcsrAcknowledged`. Status `transmitted` means
 * "the agency gateway took delivery of the bytes", nothing more.
 *
 * ── Environment variables ─────────────────────────────────────────────────
 *   ICSR_GATEWAY_URL               Gateway endpoint (https://…). Required.
 *   ICSR_GATEWAY_PROTOCOL          'as2' (default when a client cert is set) |
 *                                  'https' (default when only a password is set).
 *   AS2 path (FDA ESG AS2 for FAERS; the EudraVigilance AS2 gateway for EMA):
 *   ICSR_GATEWAY_USERNAME          Sender's AS2 identifier assigned by the agency
 *   ICSR_GATEWAY_AS2_TO            Agency AS2 identifier (never defaulted)
 *   ICSR_GATEWAY_CERT_PATH         mTLS client certificate (PEM path); also the
 *                                  configuration trigger for the AS2 path
 *   ICSR_GATEWAY_KEY_PATH          mTLS private key (PEM path)
 *   ICSR_GATEWAY_AGENCY_CERT_PATH  Agency certificate (PEM path) — TLS trust
 *                                  anchor; omitted ⇒ platform CA store
 *   HTTPS path (a gateway provider's authenticated upload endpoint):
 *   ICSR_GATEWAY_USERNAME / ICSR_GATEWAY_PASSWORD   HTTP Basic credentials
 *
 * The transmit timestamp is sourced from an injectable clock so the simulated
 * receipt is deterministic in tests (never raw `Date.now()` in asserted output).
 *
 * @module server/services/ind-lifecycle/icsr-gateway-transport
 */

import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import type { IcsrGateway, IcsrTransmissionResult } from './e2b-icsr-message';
import {
  attemptDelivery,
  buildAs2Headers,
  classifyAs2Delivery,
  classifyDelivery,
  headerValue,
  httpsPost,
  postAs2,
  signAs2Body,
  type DeliveryOutcome,
} from '../submission-gateways/as2-transport';

/** Gateway transport configuration, resolved from the environment. */
export interface IcsrGatewayConfig {
  /** Gateway endpoint URL (e.g. FDA ESG AS2 / EudraVigilance gateway). */
  url: string;
  /** Sender/account identifier registered with the gateway (AS2-From, or Basic username). */
  username?: string;
  /** Shared secret / password, when the gateway uses password auth. */
  password?: string;
  /** Path to the mTLS client certificate, when the gateway uses cert auth. */
  certPath?: string;
  /** Path to the mTLS private key (AS2 path). */
  keyPath?: string;
  /** Path to the agency's certificate — TLS trust anchor (AS2 path, optional). */
  agencyCertPath?: string;
  /** Agency AS2 identifier (AS2 path). */
  as2To?: string;
  /** Wire protocol; derived from the credentials present when unset. */
  protocol?: 'as2' | 'https';
}

/** Options for a transmit attempt. */
export interface TransmitIcsrOptions {
  /** Injectable clock — defaults to `Date.now`. Override for deterministic tests. */
  now?: () => number;
  /**
   * Optional audit sink. Mirrors the sibling services that audit transmit
   * attempts; left injectable so this transport stays free of a DB dependency
   * and remains unit-testable. Called for every attempt (success or refusal).
   */
  audit?: (event: IcsrTransmitAuditEvent) => void | Promise<void>;
  /**
   * Override config resolution (primarily for tests). When omitted, config is
   * read from the environment via {@link resolveGatewayConfig}.
   */
  config?: IcsrGatewayConfig | null;
}

/** Audit record for a transmit attempt. */
export interface IcsrTransmitAuditEvent {
  action: 'icsr_transmit';
  gateway: IcsrGateway;
  receiverId: string;
  /** 'simulated' (non-prod), 'transmitted' (real gateway), or 'refused'. */
  outcome: 'simulated' | 'transmitted' | 'refused';
  /** Why a transmit was refused, if applicable. */
  reason?: string;
  /**
   * The agency's response body, verbatim, on a refusal that got one (an MDN,
   * a non-2xx body). 2026-09-23 (W5/D7, round-2 review): the audit row is the
   * only durable record of a refused attempt, and it kept the reason but not
   * what the agency said — so an MDN a human must confirm at the agency was
   * lost with the thrown error.
   */
  agencyResponseRaw?: string;
  /**
   * The AS2 Message-ID (or HTTPS message id) this platform sent, on a refusal
   * of a configured gateway — what an operator quotes to the agency to confirm
   * an unconfirmed delivery. 2026-09-23 (W5/D7, MDN final pass).
   */
  transportMessageId?: string;
  timestamp: string;
}

/** The receipt returned by a successful (or simulated) transmit. */
export interface IcsrTransmitReceipt {
  /** True ⇔ this receipt was NOT produced by a real gateway acknowledgement. */
  simulated: boolean;
  /** Transport-layer status. */
  status: 'transmitted' | 'simulated';
  /** Echo of the gateway the message was addressed to. */
  gateway: IcsrGateway;
  /** Echo of the resolved receiver identifier. */
  receiverId: string;
  /** Sender-assigned message id (echoed from the transmitted message). */
  messageId: string;
  /** Transport receipt identifier (simulated receipts are prefixed SIMULATED-). */
  receiptId: string;
  /** ISO timestamp sourced from the injectable clock. */
  timestamp: string;
  /** Human-readable note — explicitly flags simulation in non-prod. */
  message: string;
  /** Which wire protocol carried the message (absent on a simulated receipt). */
  protocol?: 'as2' | 'https';
  /** The agency's own response body, verbatim, when the transport returned one. */
  agencyResponseRaw?: string;
}

/** Naming mirrors the FDA/ESG services (`FDA_ESG_*`); ICSR-specific prefix. */
const ENV_URL = 'ICSR_GATEWAY_URL';
const ENV_USERNAME = 'ICSR_GATEWAY_USERNAME';
const ENV_PASSWORD = 'ICSR_GATEWAY_PASSWORD';
const ENV_CERT_PATH = 'ICSR_GATEWAY_CERT_PATH';
const ENV_KEY_PATH = 'ICSR_GATEWAY_KEY_PATH';
const ENV_AGENCY_CERT_PATH = 'ICSR_GATEWAY_AGENCY_CERT_PATH';
const ENV_AS2_TO = 'ICSR_GATEWAY_AS2_TO';
const ENV_PROTOCOL = 'ICSR_GATEWAY_PROTOCOL';

/**
 * Resolve gateway config from the environment. Returns null when no gateway URL
 * is configured (the fail-closed trigger). A URL plus *either* a password or a
 * client-certificate path constitutes a usable config; a bare URL is treated as
 * not-configured (credentials are mandatory for a real agency gateway).
 */
export function resolveGatewayConfig(): IcsrGatewayConfig | null {
  const url = process.env[ENV_URL];
  if (!url) return null;

  const username = process.env[ENV_USERNAME];
  const password = process.env[ENV_PASSWORD];
  const certPath = process.env[ENV_CERT_PATH];

  // Credentials are required: either password auth or an mTLS cert path.
  if (!password && !certPath) return null;

  const protoRaw = process.env[ENV_PROTOCOL]?.trim().toLowerCase();
  const protocol = protoRaw === 'as2' || protoRaw === 'https' ? protoRaw : undefined;

  return {
    url,
    username,
    password,
    certPath,
    keyPath: process.env[ENV_KEY_PATH],
    agencyCertPath: process.env[ENV_AGENCY_CERT_PATH],
    as2To: process.env[ENV_AS2_TO],
    protocol,
  };
}

/** A message that the readiness gate marks not-ready is never transmitted. */
export class IcsrNotReadyError extends Error {
  constructor(public readonly gaps: IcsrTransmissionResult['gaps']) {
    const labels = gaps.map((g) => g.label).join(', ');
    super(
      `ICSR is not transmit-ready: ${gaps.length} mandatory-element gap(s) ` +
        `must be resolved before transmission${labels ? ` (${labels})` : ''}.`,
    );
    this.name = 'IcsrNotReadyError';
  }
}

/**
 * No usable gateway → fail closed rather than fabricate an ACK. Raised in
 * production when nothing is configured, and in ANY environment when a gateway
 * is configured but the variables its protocol needs are missing (`missing`
 * names them).
 */
export class IcsrGatewayNotConfiguredError extends Error {
  constructor(gateway: IcsrGateway, public readonly missing: string[] = []) {
    super(
      missing.length === 0
        ? `ICSR gateway transport is not configured. Message was NOT transmitted to ${gateway}. ` +
          `Set ${ENV_URL} and credentials (${ENV_PASSWORD} or ${ENV_CERT_PATH}) before ICSRs ` +
          `can be transmitted. Returning a fabricated acknowledgement is prohibited.`
        : `ICSR gateway transport is configured but incomplete. Message was NOT transmitted to ${gateway}. ` +
          `Missing: ${missing.join(', ')}. Returning a fabricated acknowledgement is prohibited.`,
    );
    this.name = 'IcsrGatewayNotConfiguredError';
  }
}

/**
 * A configured gateway was reached (or the network call was attempted) and the
 * outcome is not an acceptance. `stage` is the shared delivery classification
 * (classifyDelivery, as2-transport.ts):
 *   'transport'        NOT_DELIVERED — nothing was provably handed to an
 *                      authenticated gateway (DNS, connection refused, any TLS
 *                      handshake / certificate refusal before the message was
 *                      released, or the gateway's own TLS refusal alert).
 *                      "NOT transmitted".
 *   'gateway-rejected' REFUSED_BY_AGENCY — an HTTP 4xx, or an MDN that
 *                      explicitly refuses this message. "NOT transmitted".
 *   'receipt-unproven' DELIVERED_UNCONFIRMED — the agency may hold the
 *                      message: a 2xx this platform cannot tie to a receipt, a
 *                      5xx (or other non-2xx, non-4xx) status, or a failure
 *                      after the message was released to an authenticated
 *                      gateway. "Delivery unconfirmed"; `transmitted` is
 *                      'unconfirmed', and the persistence layer locks the row
 *                      ('transmission_unconfirmed').
 *
 * 2026-09-23 (W5/D7, round-3 review): stage 'receipt-unproven' said "ICSR was
 * NOT transmitted", which is not known. 2026-09-23 (W5/D7, MDN final pass): a
 * TLS 1.3 client-certificate refusal was 'receipt-unproven' (it fires after
 * Node's 'finish'), every 5xx was 'gateway-rejected', and `transmitted` was
 * `false` for 'receipt-unproven' too; each now follows the classifier, and
 * `transportMessageId` carries the id this platform sent so the persisted row
 * can be reconciled at the agency.
 * 2026-09-23 (W5/D7, MDN close, repair): the classifier no longer reads
 * Node's request 'finish'. A 502 or a reset after the gateway had read the
 * whole report was 'transport' ("NOT transmitted", the row back to
 * 'prepared') whenever 'finish' had not yet been delivered; it is
 * 'receipt-unproven' now.
 */
export class IcsrGatewayTransmitError extends Error {
  /** false: nothing reached the agency, or it refused; 'unconfirmed': it may hold the message. */
  readonly transmitted: false | 'unconfirmed';
  readonly httpStatus: number | null;
  readonly agencyResponseRaw: string | null;
  /** The AS2 Message-ID (or HTTPS message id) this platform sent, when known. */
  readonly transportMessageId: string | null;
  constructor(
    gateway: IcsrGateway,
    public readonly stage: 'transport' | 'gateway-rejected' | 'receipt-unproven',
    detail: string,
    wire: { httpStatus?: number | null; agencyResponseRaw?: string | null; transportMessageId?: string | null } = {},
  ) {
    super(
      stage === 'receipt-unproven'
        ? `ICSR delivery to ${gateway} is unconfirmed (${stage}): ${detail}`
        : `ICSR was NOT transmitted to ${gateway} (${stage}): ${detail}`,
    );
    this.name = 'IcsrGatewayTransmitError';
    this.transmitted = stage === 'receipt-unproven' ? 'unconfirmed' : false;
    this.httpStatus = wire.httpStatus ?? null;
    this.agencyResponseRaw = wire.agencyResponseRaw ?? null;
    this.transportMessageId = wire.transportMessageId ?? null;
  }
}

function isoNow(now: () => number): string {
  return new Date(now()).toISOString();
}

function extractMessageId(message: string): string {
  // The builder writes the sender message number into <M.1.1>.
  const match = message.match(/<M\.1\.1>([^<]*)<\/M\.1\.1>/);
  return match?.[1]?.trim() || 'UNKNOWN';
}

/** Which wire protocol a config selects: explicit, else derived from its credentials. */
export function resolveProtocol(config: IcsrGatewayConfig): 'as2' | 'https' {
  if (config.protocol) return config.protocol;
  return config.certPath ? 'as2' : 'https';
}

/**
 * The receipt of a RECEIVED outcome, or the typed error for any other — one
 * mapping for the AS2 and HTTPS paths. `protocolLabel` and `ourId` name what
 * was sent, for the operator.
 * 2026-09-23 (W5/D7, MDN final pass): replaces transportRefusal and the two
 * inline status checks, which classed every non-2xx as 'gateway-rejected' and
 * every failure after Node's 'finish' as 'receipt-unproven'.
 */
function receiptOrRefusal(
  gateway: IcsrGateway,
  outcome: DeliveryOutcome,
  protocolLabel: string,
  ourId: string,
): { receiptId: string; agencyResponseRaw: string } {
  switch (outcome.kind) {
    case 'RECEIVED':
      return { receiptId: outcome.receiptId, agencyResponseRaw: outcome.responseRaw };
    case 'NOT_DELIVERED':
      throw new IcsrGatewayTransmitError(
        gateway, 'transport',
        `${outcome.reason}. Nothing reached the agency: the message was never released to an authenticated gateway, or its TLS layer refused it.`,
        { transportMessageId: ourId },
      );
    case 'REFUSED_BY_AGENCY':
      throw new IcsrGatewayTransmitError(gateway, 'gateway-rejected', outcome.reason, {
        httpStatus: outcome.httpStatus, agencyResponseRaw: outcome.responseRaw, transportMessageId: ourId,
      });
    case 'DELIVERED_UNCONFIRMED': {
      const delivered = outcome.httpStatus === null
        ? `The ${protocolLabel} message ${ourId} was sent to an authenticated gateway before the connection failed`
        : `The gateway answered HTTP ${outcome.httpStatus} to ${protocolLabel} message ${ourId}`;
      throw new IcsrGatewayTransmitError(
        gateway, 'receipt-unproven',
        `${outcome.reason} ${delivered} and may hold it; confirm receipt at the agency before any resend.`,
        { httpStatus: outcome.httpStatus, agencyResponseRaw: outcome.responseRaw, transportMessageId: ourId },
      );
    }
  }
}

/** The refusal-specific fields of a transmit attempt's audit event. */
function refusalAuditFields(err: unknown): Pick<IcsrTransmitAuditEvent, 'reason' | 'agencyResponseRaw' | 'transportMessageId'> {
  if (err instanceof IcsrGatewayNotConfiguredError) return { reason: 'not-configured' };
  if (!(err instanceof IcsrGatewayTransmitError)) return { reason: 'transport' };
  return {
    reason: err.stage,
    ...(err.agencyResponseRaw !== null ? { agencyResponseRaw: err.agencyResponseRaw } : {}),
    ...(err.transportMessageId !== null ? { transportMessageId: err.transportMessageId } : {}),
  };
}

/* ─── Real transports ────────────────────────────────────────────── */

async function transmitViaAs2(
  built: IcsrTransmissionResult,
  config: IcsrGatewayConfig,
  messageId: string,
): Promise<{ receiptId: string; agencyResponseRaw: string }> {
  const missing: string[] = [];
  if (!config.username) missing.push(ENV_USERNAME);
  if (!config.certPath) missing.push(ENV_CERT_PATH);
  if (!config.keyPath) missing.push(ENV_KEY_PATH);
  if (!config.as2To) missing.push(ENV_AS2_TO);
  if (missing.length > 0) throw new IcsrGatewayNotConfiguredError(built.gateway, missing);

  const [clientCertPem, clientKeyPem, agencyCertPem] = await Promise.all([
    fs.readFile(config.certPath!, 'utf8'),
    fs.readFile(config.keyPath!, 'utf8'),
    config.agencyCertPath ? fs.readFile(config.agencyCertPath, 'utf8') : Promise.resolve(undefined),
  ]);

  const body = Buffer.from(built.message, 'utf8');
  const as2MessageId = `<${randomUUID()}@${config.username}>`;
  const headers = buildAs2Headers({
    messageId: as2MessageId,
    from: config.username!,
    to: config.as2To!,
    contentType: 'application/xml; charset=utf-8',
    body,
    signaturePem: signAs2Body(body, clientKeyPem),
    filename: `${messageId}.xml`,
    userAgent: 'concept2cure-icsr/1.0',
  });

  const outcome = classifyAs2Delivery(await attemptDelivery(() => postAs2({
    endpoint: config.url, headers, body,
    clientCertPem, clientKeyPem, agencyCertPem,
    errorPrefix: `ICSR AS2 POST (${built.gateway})`,
  })), as2MessageId);
  /* 2026-09-23 (W5/D7, round-2 and round-3 review): an MDN that could not be
     tied to this message (none named, another message, empty or `<>`, no
     readable disposition) is 'receipt-unproven', not 'gateway-rejected'; only
     an explicit refusal naming this message is. 2026-09-23 (W5/D7, MDN final
     pass): the whole decision is classifyAs2Delivery's, shared with FDA ESG. */
  return receiptOrRefusal(built.gateway, outcome, 'AS2', as2MessageId);
}

async function transmitViaHttps(
  built: IcsrTransmissionResult,
  config: IcsrGatewayConfig,
  messageId: string,
): Promise<{ receiptId: string; agencyResponseRaw: string }> {
  const missing: string[] = [];
  if (!config.username) missing.push(ENV_USERNAME);
  if (!config.password) missing.push(ENV_PASSWORD);
  if (missing.length > 0) throw new IcsrGatewayNotConfiguredError(built.gateway, missing);

  const body = Buffer.from(built.message, 'utf8');
  const basic = Buffer.from(`${config.username}:${config.password}`, 'utf8').toString('base64');
  const attempt = await attemptDelivery(() => httpsPost({
    endpoint: config.url,
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${messageId}.xml"`,
      'Content-Length': String(body.length),
      'User-Agent': 'concept2cure-icsr/1.0',
    },
    body,
    errorPrefix: `ICSR HTTPS POST (${built.gateway})`,
  }));
  // A 2xx with nothing to cite is not proof of delivery. The gateway must hand
  // back an identifier this platform can later reconcile an ACK against.
  const outcome = classifyDelivery(attempt, messageId, (response) => {
    const receiptId =
      headerValue(response.headers['x-receipt-id']) ??
      headerValue(response.headers['message-id']) ??
      headerValue(response.headers['location']);
    return receiptId
      ? { kind: 'RECEIVED', receiptId }
      : {
          kind: 'DELIVERED_UNCONFIRMED',
          reason: `gateway answered HTTP ${response.httpStatus} but returned no receipt identifier ` +
            '(X-Receipt-Id, Message-ID or Location); refusing to record the message as transmitted.',
        };
  });
  return receiptOrRefusal(built.gateway, outcome, 'HTTPS', messageId);
}

/**
 * Transmit a built ICSR message to its target gateway.
 *
 * Gating order (fail-closed, deterministic):
 *   1. Refuse if the readiness assessment marks the message not-ready.
 *   2. With a real gateway configured → the real transport (AS2 via the shared
 *      as2-transport module, or an HTTPS Basic upload). `transmitted` only on
 *      an accepting 2xx; every other outcome is a typed error.
 *   3. In production with no configured gateway → throw (never fake an ACK).
 *   4. Otherwise (non-production, no real gateway) → deterministic SIMULATED
 *      receipt, explicitly flagged `simulated: true`.
 */
export async function transmitIcsr(
  built: IcsrTransmissionResult,
  opts: TransmitIcsrOptions = {},
): Promise<IcsrTransmitReceipt> {
  const now = opts.now ?? Date.now;
  const timestamp = isoNow(now);
  const messageId = extractMessageId(built.message);

  const audit = async (event: Omit<IcsrTransmitAuditEvent, 'action' | 'timestamp'>) => {
    if (!opts.audit) return;
    await opts.audit({ action: 'icsr_transmit', timestamp, ...event });
  };

  // 1. Readiness gate — never transmit a message with mandatory gaps.
  if (!built.transmitReady) {
    await audit({
      gateway: built.gateway,
      receiverId: built.receiverId,
      outcome: 'refused',
      reason: 'not-ready',
    });
    throw new IcsrNotReadyError(built.gaps);
  }

  const config = opts.config !== undefined ? opts.config : resolveGatewayConfig();

  // 2. A real gateway is configured: make the real call. Nothing below this
  // line fabricates — a receipt exists only when the agency endpoint accepted.
  if (config) {
    const protocol = resolveProtocol(config);
    let delivery: { receiptId: string; agencyResponseRaw: string };
    try {
      delivery = protocol === 'as2'
        ? await transmitViaAs2(built, config, messageId)
        : await transmitViaHttps(built, config, messageId);
    } catch (err) {
      await audit({
        gateway: built.gateway,
        receiverId: built.receiverId,
        outcome: 'refused',
        ...refusalAuditFields(err),
      });
      throw err;
    }

    const receipt: IcsrTransmitReceipt = {
      simulated: false,
      status: 'transmitted',
      gateway: built.gateway,
      receiverId: built.receiverId,
      messageId,
      receiptId: delivery.receiptId,
      timestamp,
      protocol,
      agencyResponseRaw: delivery.agencyResponseRaw,
      message:
        `ICSR handed to ${built.gateway} over ${protocol.toUpperCase()} (${config.url}); transport receipt ${delivery.receiptId}. ` +
        'This is delivery of the bytes, not the E2B acknowledgement — record the agency ACK (AA/AE/AR) when it arrives.',
    };
    await audit({
      gateway: built.gateway,
      receiverId: built.receiverId,
      outcome: 'transmitted',
    });
    return receipt;
  }

  // 3 (prod, unconfigured). Fail closed — never pretend success.
  if (process.env.NODE_ENV === 'production') {
    await audit({
      gateway: built.gateway,
      receiverId: built.receiverId,
      outcome: 'refused',
      reason: 'not-configured',
    });
    throw new IcsrGatewayNotConfiguredError(built.gateway);
  }

  // 4. Non-production simulation only — explicitly flagged so no caller can
  // mistake it for a real agency acknowledgment.
  const receipt: IcsrTransmitReceipt = {
    simulated: true,
    status: 'simulated',
    gateway: built.gateway,
    receiverId: built.receiverId,
    messageId,
    receiptId: `SIMULATED-${messageId}`,
    timestamp,
    message:
      `SIMULATED ICSR transmission (non-production). NOT transmitted to ${built.gateway}. ` +
      `Configure ${ENV_URL} and credentials for real transport.`,
  };

  await audit({
    gateway: built.gateway,
    receiverId: built.receiverId,
    outcome: 'simulated',
  });

  return receipt;
}
