/**
 * E2B(R3) ICSR transmission — message envelope, transmit-readiness, and ACK.
 *
 * `e2b-icsr-composer` produces the ICH E2B(R3) *data-element projection* but,
 * by design, not the transmission envelope (the batch/message header an agency
 * gateway needs). This module closes that last-mile gap deterministically:
 *
 *   - buildIcsrTransmission()  wraps the composed elements in the ICH ICSR
 *                              batch + message header (N.1.* / M.1.*), producing
 *                              the full transmittable message XML, and gates it
 *                              on transmit-readiness (no mandatory-element gaps).
 *   - parseIcsrAcknowledgment() parses an ICH ICSR acknowledgment (ACK) — the
 *                              transmission/report ack codes (AA accepted / AE
 *                              accepted-with-error / AR rejected) — into a
 *                              structured result a tracking layer can act on.
 *
 * The actual byte-level transport (FDA ESG AS2 / EMA EudraVigilance gateway) is
 * a thin, environment-dependent adapter over this message; the assembly,
 * readiness gate and ACK model are the substance and are pure/deterministic.
 *
 * @module server/services/ind-lifecycle/e2b-icsr-message
 */

import { escapeXml } from './ind-ectd-envelope';
import { serializeE2bXml } from './e2b-icsr-composer';
import type { E2bIcsrResult } from './e2b-icsr-composer';

/** Target safety gateway for an ICSR. */
export type IcsrGateway = 'FDA_FAERS' | 'EMA_EUDRAVIGILANCE';

export interface IcsrTransmissionEnvelope {
  /** Sender organization identifier (registered with the gateway). */
  senderId: string;
  /** Receiver identifier — defaults per gateway when omitted. */
  receiverId?: string;
  /** Message number (sender-unique); also used as the batch number. */
  messageNumber: string;
  /** Target gateway (drives the default receiver + message metadata). */
  gateway: IcsrGateway;
  /** Message creation timestamp (defaults to now). */
  messageDate?: Date;
}

export interface IcsrTransmissionResult {
  /** The full transmittable ICH ICSR message XML (batch + message + safetyreport). */
  message: string;
  /** True ⇔ the composed ICSR has no mandatory-element gaps. */
  transmitReady: boolean;
  /** Mandatory-element gaps blocking transmission (from the composer). */
  gaps: E2bIcsrResult['gaps'];
  gateway: IcsrGateway;
  /** The resolved receiver identifier. */
  receiverId: string;
}

const DEFAULT_RECEIVER: Record<IcsrGateway, string> = {
  FDA_FAERS: 'ZZFDA',
  EMA_EUDRAVIGILANCE: 'EVHUMAN',
};

function isoDateTime(d: Date): string {
  return d.toISOString();
}

/**
 * Build the full transmittable ICH ICSR message: the batch + message header
 * (N.1.* batch admin, M.1.* message admin) wrapping the composed safetyreport.
 * Deterministic. `transmitReady` is false when the ICSR has mandatory gaps —
 * the message is still produced (for inspection) but must not be transmitted.
 */
export function buildIcsrTransmission(
  result: E2bIcsrResult,
  envelope: IcsrTransmissionEnvelope,
): IcsrTransmissionResult {
  const receiverId = envelope.receiverId ?? DEFAULT_RECEIVER[envelope.gateway];
  const date = isoDateTime(envelope.messageDate ?? new Date());

  // The composer emits <ichicsr ...><safetyreport>…</safetyreport></ichicsr>;
  // lift the inner <safetyreport> block into the transmission message.
  const inner = serializeE2bXml(result.icsr);
  const safetyReport = inner.replace(/^[\s\S]*?(<safetyreport>[\s\S]*<\/safetyreport>)[\s\S]*$/m, '$1');

  const el = (tag: string, value: string) => `      <${tag}>${escapeXml(value)}</${tag}>\n`;

  let message = '<?xml version="1.0" encoding="UTF-8"?>\n';
  message += '<ichicsrMessage standard="E2B(R3)" projection="data-elements">\n';
  message += '  <ichicsrBatch>\n';
  // N.1 — Batch wrapper.
  message += el('N.1.1', `batch-${envelope.messageNumber}`);
  message += el('N.1.2', envelope.senderId);
  message += el('N.1.3', receiverId);
  message += el('N.1.5', date);
  message += '    <ichicsrMessageHeader>\n';
  // M.1 — Message header.
  message += el('M.1.1', envelope.messageNumber);
  message += el('M.1.2', envelope.senderId);
  message += el('M.1.3', receiverId);
  message += el('M.1.4', date);
  message += el('M.1.5', 'ichicsr'); // message type
  message += '    </ichicsrMessageHeader>\n';
  message += `${'    '}${safetyReport}\n`;
  message += '  </ichicsrBatch>\n';
  message += '</ichicsrMessage>\n';

  return {
    message,
    transmitReady: result.gaps.length === 0,
    gaps: result.gaps,
    gateway: envelope.gateway,
    receiverId,
  };
}

// ---------------------------------------------------------------------------
// Acknowledgment parsing
// ---------------------------------------------------------------------------

/** ICH ICSR transmission/report acknowledgment code. */
export type IcsrAckCode = 'AA' | 'AE' | 'AR' | 'unknown';

export interface IcsrAcknowledgment {
  /** The acknowledged message/batch number, if present. */
  acknowledgedMessageNumber: string | null;
  /** AA = accepted, AE = accepted with error(s), AR = rejected, unknown = unparseable. */
  ackCode: IcsrAckCode;
  /** True only for AA (fully accepted). */
  accepted: boolean;
  /** Whether the case still requires attention (AE/AR). */
  requiresAction: boolean;
  /** Error/comment text extracted from the ACK, if any. */
  errors: string[];
}

const ACK_CODE_RE = /<(?:transmissionacknowledgmentcode|messageacknowledgmentcode|reportacknowledgmentcode)>\s*([A-Z]{2})\s*<\//i;
const ACK_MSGNUM_RE = /<(?:acknowledgedmessagenumb|messagenumb|localmessagenumb)>\s*([^<]+?)\s*<\//i;
const ACK_ERROR_RE = /<(?:error|errormessagecomment|transmissionacknowledgmenterrormessage)>\s*([^<]+?)\s*<\//gi;

/**
 * Parse an ICH ICSR acknowledgment (ACK) message into a structured result.
 * Tolerant of the common element-name variants; returns ackCode 'unknown' when
 * no code can be found. Pure / deterministic.
 */
export function parseIcsrAcknowledgment(ackXml: string): IcsrAcknowledgment {
  const xml = typeof ackXml === 'string' ? ackXml : '';
  const codeMatch = xml.match(ACK_CODE_RE);
  const code = (codeMatch?.[1]?.toUpperCase() ?? 'unknown') as IcsrAckCode;
  const ackCode: IcsrAckCode = code === 'AA' || code === 'AE' || code === 'AR' ? code : 'unknown';

  const msgNum = xml.match(ACK_MSGNUM_RE)?.[1]?.trim() ?? null;
  const errors: string[] = [];
  for (const m of xml.matchAll(ACK_ERROR_RE)) {
    if (m[1]) errors.push(m[1].trim());
  }

  return {
    acknowledgedMessageNumber: msgNum,
    ackCode,
    accepted: ackCode === 'AA',
    requiresAction: ackCode === 'AE' || ackCode === 'AR',
    errors,
  };
}
