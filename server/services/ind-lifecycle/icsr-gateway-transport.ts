/**
 * E2B(R3) ICSR gateway transport — the thin, fail-closed transport adapter that
 * sits *on top of* the completed message builder (`e2b-icsr-message`).
 *
 * `buildIcsrTransmission()` produces the full transmittable ICH ICSR message and
 * a transmit-readiness assessment, but — by design — does not post a single byte
 * to an agency gateway. This module closes that last-mile transport gap, with the
 * same fail-closed discipline as the sibling FDA/ESG transports
 * (`server/services/fdaIntegrationService.ts`, `server/services/ESGSubmissionService.ts`):
 *
 *   - In PRODUCTION with no real gateway configured, `transmitIcsr()` THROWS.
 *     Returning a synthetic acknowledgement would tell a user their ICSR reached
 *     FAERS / EudraVigilance when nothing was transmitted — the most dangerous
 *     lie a pharmacovigilance platform can tell.
 *   - Outside production it returns an explicitly `simulated: true` receipt that
 *     no caller can mistake for a real agency acknowledgment.
 *   - It refuses outright to transmit a message the readiness gate marks
 *     not-ready (mandatory-element gaps), in any environment.
 *
 * The transmit timestamp is sourced from an injectable clock so the simulated
 * receipt is deterministic in tests (never raw `Date.now()` in asserted output).
 *
 * @module server/services/ind-lifecycle/icsr-gateway-transport
 */

import type { IcsrGateway, IcsrTransmissionResult } from './e2b-icsr-message';

/** Gateway transport configuration, resolved from the environment. */
export interface IcsrGatewayConfig {
  /** Gateway endpoint URL (e.g. FDA ESG AS2 / EudraVigilance gateway). */
  url: string;
  /** Sender/account identifier registered with the gateway. */
  username?: string;
  /** Shared secret / password, when the gateway uses password auth. */
  password?: string;
  /** Path to the mTLS client certificate, when the gateway uses cert auth. */
  certPath?: string;
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
}

/** Naming mirrors the FDA/ESG services (`FDA_ESG_*`); ICSR-specific prefix. */
const ENV_URL = 'ICSR_GATEWAY_URL';
const ENV_USERNAME = 'ICSR_GATEWAY_USERNAME';
const ENV_PASSWORD = 'ICSR_GATEWAY_PASSWORD';
const ENV_CERT_PATH = 'ICSR_GATEWAY_CERT_PATH';

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

  return { url, username, password, certPath };
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

/** Production with no configured gateway → fail closed rather than fabricate an ACK. */
export class IcsrGatewayNotConfiguredError extends Error {
  constructor(gateway: IcsrGateway) {
    super(
      `ICSR gateway transport is not configured. Message was NOT transmitted to ${gateway}. ` +
        `Set ${ENV_URL} and credentials (${ENV_PASSWORD} or ${ENV_CERT_PATH}) before ICSRs ` +
        `can be transmitted. Returning a fabricated acknowledgement is prohibited.`,
    );
    this.name = 'IcsrGatewayNotConfiguredError';
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

/**
 * Transmit a built ICSR message to its target gateway.
 *
 * Gating order (fail-closed, deterministic):
 *   1. Refuse if the readiness assessment marks the message not-ready.
 *   2. In production with no configured gateway → throw (never fake an ACK).
 *   3. With a real gateway configured → real transport (not yet implemented;
 *      throws an actionable not-implemented error rather than a fake receipt).
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

  // 2/3. A real gateway is configured: do NOT fabricate a transport. Until the
  // production AS2/SFTP transport client exists, fail closed with an actionable
  // error instead of returning a fake "transmitted" receipt.
  if (config) {
    await audit({
      gateway: built.gateway,
      receiverId: built.receiverId,
      outcome: 'refused',
      reason: 'transport-not-implemented',
    });
    throw new Error(
      `ICSR gateway transport client is not implemented for ${built.gateway} ` +
        `(${config.url}). A real AS2/SFTP transport must be wired before live ICSR ` +
        `transmission. Refusing to fabricate a gateway acknowledgement.`,
    );
  }

  // 2 (prod, unconfigured). Fail closed — never pretend success.
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
