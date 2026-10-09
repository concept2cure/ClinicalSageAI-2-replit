/**
 * AS2 (RFC 4130) transport primitives shared by every agency path that ships
 * bytes over AS2-over-HTTPS with mTLS: the FDA ESG eCTD / eSTAR gateway
 * (`./fda-esg.ts`) and the E2B(R3) ICSR safety-gateway transport
 * (`../ind-lifecycle/icsr-gateway-transport.ts`).
 *
 * Extracted from `fda-esg.ts` on 2026-09-20 (W5, runbook B7/B16) so the ICSR
 * transport could reuse the ONE AS2 implementation instead of growing a second
 * one. Everything here is envelope framing, body signing, the mTLS POST, MDN
 * interpretation and the one delivery classification (classifyDelivery, added
 * 2026-09-23 W5/D7, MDN final pass) — no database, no transmittal rows; each
 * caller maps the four outcomes onto its own records.
 *
 * ── KNOWN CONFORMANCE GAP (carried over verbatim from fda-esg.ts) ────────────
 * The AS2 *message envelope* is NOT yet a PKCS#7/CMS S/MIME structure. The body
 * is posted as-is; `signAs2Body` computes a detached RSA-SHA256 signature but it
 * is NOT attached as an S/MIME `multipart/signed` part, and there is no PKCS#7
 * encryption. An agency AS2 endpoint that requires S/MIME will reject the
 * envelope (a 4xx or a refusing MDN), which every caller surfaces honestly (the
 * success path only runs on a 2xx whose MDN accepts the very message that was
 * sent; see classifyDelivery at the end of this file — 2026-09-23 MDN final
 * pass — for how every other answer is classed).
 * Do not represent AS2 transmission as production-conformant until a real CMS
 * implementation lands; confirm with the agency during UAT whether a
 * TLS-protected, non-S/MIME AS2 envelope is accepted for the account.
 *
 * @module server/services/submission-gateways/as2-transport
 */

import { createSign } from 'crypto';
import * as https from 'node:https';
import type { Socket } from 'node:net';
import type { TLSSocket } from 'node:tls';
import { URL } from 'url';
import { TransportError } from './types';

/** The AS2 message a caller wants on the wire. */
export interface As2Message {
  /** RFC 2822 Message-ID, e.g. `<uuid@AS2-FROM>`. */
  messageId: string;
  /** Sender's AS2 identifier (assigned by the agency). */
  from: string;
  /** Agency's AS2 identifier. */
  to: string;
  /** MIME type of `body`. */
  contentType: string;
  body: Buffer;
  /** Detached base64 RSA-SHA256 signature over `body` (see signAs2Body). */
  signaturePem: string;
  /** `Content-Disposition` filename — the name the agency files the payload under. */
  filename?: string;
  /** `User-Agent` header value. */
  userAgent?: string;
}

/** What came back from the agency AS2 endpoint. */
export interface As2Response {
  httpStatus: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  /* 2026-09-23 (W5/D7, MDN close, repair): requestWrittenBeforeAnswer (had
     Node's request 'finish' fired when the answer arrived) is withdrawn. Over
     TLS the callback that emits 'finish' runs one or more event-loop
     iterations after the bytes reached the kernel, so a server that had read
     the whole request could answer "before" it — a 502 after the whole
     bundle was classed NOT_DELIVERED and released the sequence claim. The
     order of 'finish' against an answer proves nothing about what the
     server holds. */
}

/** Parsed MDN disposition. */
export interface ParsedMdn {
  /**
   * The Original-Message-ID field value as it arrived (unfolded, trimmed), or
   * null when the notification has no such field or its value is empty. Not
   * yet reduced to a msg-id — mdnRefusal does that.
   */
  originalMessageId: string | null;
  /**
   * `processed` with no modifier, or with only `warning` modifiers.
   * 2026-09-23 (W5/D7, round-3 review, second pass): was "`processed` with no
   * `error` / `failure` modifier", so `processed/failed`, `processed/x-error`
   * and any other extension modifier read as an acceptance.
   */
  accepted: boolean;
  /**
   * An explicit non-acceptance: disposition-type `failed`, or `processed` with
   * a modifier that IS an error or failure token — `error`, `failure`,
   * `failed`, or one ending in `-error` / `-failure` / `-failed`
   * (`decryption-failed`, `x-error`). mdnRefusal treats it as a rejection only
   * when the MDN names our message.
   * 2026-09-23 (W5/D7, round-3 review, third pass): was any modifier merely
   * CONTAINING 'error' or 'fail', so `x-no-errors` and `x-failover-used` were
   * refusals of our message, which free a resend.
   */
  failed: boolean;
  /** The Disposition field value (unfolded, trimmed), or null. */
  disposition: string | null;
}

/* 2026-09-23 (W5/D7, round-3 review): helpers for parseMdn. Round 2 unfolded
   and searched the WHOLE response body, so a text/plain part mentioning
   Original-Message-ID could decide the outcome (a folded mention could flip a
   refusal into an acceptance). Fields are now read only from the
   message/disposition-notification part. */

const LINE_BREAK = /\r\n|\r|\n/;
/** A MIME boundary delimiter line (RFC 2046 §5.1.1: "--" + 1..70 bchars). */
const isDelimiterLine = (line: string) => /^--\S/.test(line);
const CONTENT_TYPE = /^content-type[ \t]*:/i;

/** Join RFC 5322 §2.2.3 continuation lines (leading WSP) onto their field. */
function unfoldLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && out.length > 0 && out[out.length - 1] !== '') out[out.length - 1] += line;
    else out.push(line);
  }
  return out;
}

/** The unfolded value of the header field starting at `lines[i]`. */
function unfoldedFieldAt(lines: string[], i: number): string {
  let v = lines[i];
  for (let j = i + 1; j < lines.length && /^[ \t]/.test(lines[j]) && lines[j - 1] !== ''; j++) v += lines[j];
  return v.slice(v.indexOf(':') + 1);
}

/**
 * Remove RFC 5322 §3.2.2 comments — parenthesised, nestable, with quoted-pairs
 * — leaving quoted strings intact. Each comment becomes a space (it is CFWS).
 *
 * 2026-09-23 (W5/D7, round-3 review, second pass): an unclosed `(` swallowed
 * the rest of the value, so `processed (see /error: x` read as `processed`
 * and was recorded as the agency's acceptance. An unbalanced comment (an
 * unclosed `(`, or a `)` that closes none) or an unterminated quoted string
 * now makes the value unreadable: null.
 */
function stripComments(v: string, untilDescription = false): string | null {
  /* 2026-09-23 (W5/D7, round-3 review, third pass): `untilDescription` stops
     at the first ':' outside a comment or quoted string and keeps the rest
     verbatim. A Disposition's description text is free text; an unbalanced
     '(' or '"' in `processed/warning: see note (x` made the whole value
     unreadable and FDA's acceptance of our message 'unconfirmed'. An unclosed
     comment BEFORE that colon still swallows it, so the value is still
     unreadable (`processed (see /error: x`). */
  const st = { out: '', depth: 0, quoted: false };
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '\\' && (st.depth > 0 || st.quoted)) {
      // quoted-pair: the next character is literal
      if (st.depth === 0) st.out += v[i] + (v[i + 1] ?? '');
      i++;
    } else if (untilDescription && v[i] === ':' && st.depth === 0 && !st.quoted) {
      return st.out + v.slice(i);
    } else if (!commentStep(st, v[i])) {
      return null;
    }
  }
  return st.depth === 0 && !st.quoted ? st.out : null;
}

/**
 * One character (not part of a quoted-pair) of stripComments: kept outside a
 * comment, dropped inside one. False when a `)` closes no comment.
 */
function commentStep(st: { out: string; depth: number; quoted: boolean }, c: string): boolean {
  if (st.quoted || (st.depth === 0 && c !== '(' && c !== ')')) {
    if (c === '"') st.quoted = !st.quoted;
    st.out += c;
  } else if (c === '(') {
    if (st.depth++ === 0) st.out += ' ';
  } else if (c === ')') {
    if (st.depth-- === 0) return false;
  }
  return true;
}

/** The boundary parameter of a Content-Type field value, or null. */
function boundaryParam(contentType: string): string | null {
  const m = contentType.match(/;\s*boundary\s*=\s*(?:"([^"]+)"|([^\s;]+))/i);
  return m ? (m[1] ?? m[2]) : null;
}

/** Every MIME boundary a Content-Type header in the body declares. */
function declaredBoundaries(lines: string[]): Set<string> {
  const boundaries = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    if (!CONTENT_TYPE.test(lines[i])) continue;
    const b = boundaryParam(unfoldedFieldAt(lines, i));
    if (b !== null) boundaries.add(b);
  }
  return boundaries;
}

const isDnHeader = (lines: string[], i: number) =>
  CONTENT_TYPE.test(lines[i]) && /^\s*message\/disposition-notification\s*(;|$)/i.test(unfoldedFieldAt(lines, i));

/**
 * The index of each Content-Type line naming a message/disposition-notification
 * part inside a part header block: the lines right after a line `isOpening`
 * accepts, up to the first blank line or delimiter line.
 */
function dnHeaderBlockStarts(lines: string[], isOpening: (line: string) => boolean): number[] {
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isOpening(lines[i])) continue;
    for (let j = i + 1; j < lines.length && lines[j] !== '' && !isDelimiterLine(lines[j]); j++) {
      if (isDnHeader(lines, j)) { starts.push(j); break; }
    }
  }
  return starts;
}

/**
 * The lines of the message/disposition-notification part: after that part's
 * header block, up to the next boundary delimiter line or the end. Null when
 * the body has no such part, or has more than one (ambiguous).
 *
 * `outerBoundary` is the boundary of the HTTP response's own Content-Type. An
 * unsigned multipart/report carries it there, not in the body.
 */
function dispositionNotificationLines(lines: string[], outerBoundary: string | null): string[] | null {
  /* 2026-09-23 (W5/D7, round-3 review, second pass): once ANY boundary was
     declared in the body, the part was looked for only after delimiters of
     boundaries declared in the body. An unsigned report's outer boundary is
     in the HTTP Content-Type, so a report whose human part was
     multipart/alternative, or whose third part echoed our multipart/signed
     headers, lost its notification part and FDA's acceptance of our message
     was 'unconfirmed'. The HTTP boundary now counts as declared; when the
     caller has none, a part header block after any delimiter line is
     searched, still requiring exactly one notification part. */
  const boundaries = declaredBoundaries(lines);
  if (outerBoundary !== null) boundaries.add(outerBoundary);
  /** An opening delimiter line of a declared boundary (not the closing `--b--`). */
  const isDeclaredOpening = (line: string) => {
    const t = line.replace(/[ \t]+$/, '');
    for (const b of boundaries) if (t === `--${b}`) return true;
    return false;
  };

  // With a boundary declared, only a part header block after one of its
  // delimiters can name the part. With the outer boundary unknown, any
  // delimiter line may open a part; with no delimiter line at all (a bare
  // entity), the Content-Type line is located wherever it is.
  let starts = boundaries.size > 0 ? dnHeaderBlockStarts(lines, isDeclaredOpening) : [];
  if (starts.length === 0 && outerBoundary === null) {
    starts = lines.some(isDelimiterLine)
      ? dnHeaderBlockStarts(lines, isDelimiterLine)
      : lines.flatMap((_, i) => (isDnHeader(lines, i) ? [i] : []));
  }
  if (starts.length !== 1) return null;
  let k = starts[0];
  while (k < lines.length && lines[k] !== '') k++;
  const out: string[] = [];
  for (k += 1; k < lines.length && !isDelimiterLine(lines[k]); k++) out.push(lines[k]);
  return out;
}

const NEITHER = { accepted: false, failed: false } as const;
const FAILED = { accepted: false, failed: true } as const;
/** A disposition-modifier token (RFC 3798 atom, narrowed); anything else is unreadable. */
const MODIFIER_TOKEN = /^[a-z0-9][a-z0-9._-]*$/;
const FAILURE_WORDS = new Set(['error', 'failure', 'failed']);
const NEGATIONS = new Set(['no', 'not', 'non']);

/** A modifier that is itself an error or failure: its last hyphen segment names one, and no segment negates it. */
function isFailureModifier(modifier: string): boolean {
  const segments = modifier.split('-');
  return FAILURE_WORDS.has(segments[segments.length - 1]) && !segments.some((x) => NEGATIONS.has(x));
}

/**
 * Judge a Disposition field value. RFC 3798 / RFC 4130 §7.4.3:
 * `<mode>; <type>[/<modifier>[, <modifier>…][: text]]`.
 *
 * 2026-09-23 (W5/D7, round-3 review, second pass): the modifier counted as a
 * failure only when it was exactly `error` or `failure`, and every other
 * `processed` was an acceptance — so `processed/failed`,
 * `processed/decryption-failed`, `processed/x-error` and any RFC 3798
 * extension modifier were recorded as the agency's acceptance. Now:
 *   - accepted: `processed` with no modifier, or only `warning` modifiers;
 *   - failed:   `failed`, or `processed` with an error/failure modifier
 *               token (isFailureModifier — third pass, below);
 *   - neither:  any other type or modifier, or a value that cannot be read
 *               (an unbalanced comment) — mdnRefusal classes it unconfirmed.
 *
 * 2026-09-23 (W5/D7, round-3 review, third pass): the failure test was a
 * substring match (`x-no-errors`, `x-failover-used` and the non-grammatical
 * `warning;error` were refusals), and a description straight after the type
 * (`processed: error`) or a ':' inside the action mode read as an acceptance.
 * Now the value is read only up to its description colon; a description
 * needs a `/modifier`; every modifier must be a token (else neither); a
 * failure modifier is a whole error/failure token (isFailureModifier); and
 * free text after the colon is not parsed for comments.
 */
function judgeDisposition(disposition: string): { accepted: boolean; failed: boolean } {
  const bare = stripComments(disposition, true);
  if (bare === null) return NEITHER;
  const colon = bare.indexOf(':');
  const head = colon < 0 ? bare : bare.slice(0, colon);
  const semi = head.indexOf(';');
  const m = semi < 0 ? null : head.slice(semi + 1).match(/^\s*([A-Za-z-]+)\s*(?:\/(.*))?$/);
  if (!m || (colon >= 0 && m[2] === undefined)) return NEITHER;
  const type = m[1].toLowerCase();
  const modifiers = m[2] === undefined ? [] : m[2].split(',').map((x) => x.trim().toLowerCase());
  if (modifiers.some((x) => !MODIFIER_TOKEN.test(x))) return NEITHER;
  if (type === 'failed' || (type === 'processed' && modifiers.some(isFailureModifier))) return FAILED;
  return { accepted: type === 'processed' && modifiers.every((x) => x === 'warning'), failed: false };
}

/**
 * What a synchronous MDN says about the message it acknowledges: the
 * Disposition, judged by judgeDisposition, and the Original-Message-ID.
 * `httpContentType` is the HTTP response's Content-Type header, whose boundary
 * frames an unsigned multipart/report.
 */
export function parseMdn(raw: string, httpContentType?: string | string[] | null): ParsedMdn {
  /* 2026-09-23 (W5/D7, round-2 review): fields were read from a single line,
     so a field folded onto a continuation line (RFC 5322 §2.2.3 — a line
     break followed by a space or tab) read as absent or cut short. Fields are
     unfolded before they are read.
     2026-09-23 (W5/D7, round-3 review): round 2 unfolded and read the whole
     body. Now:
       - fields come only from the message/disposition-notification part; a
         body with no such part is read as a bare notification ONLY when it
         has no MIME structure (no boundary delimiter line, no Content-Type
         naming a single-part type), so a text/plain part is never read;
       - a field whose value is empty after trimming (including a folded
         whitespace-only continuation, which round-2 unfolding turned into
         ' ') is absent, not a value;
       - a field that appears twice is ambiguous and read as absent;
       - RFC 5322 comments are removed before the disposition is judged, so
         `processed (no failure)` is not a failure modifier, and the modifier
         is the token after '/', not any word in the description text.
     2026-09-23 (W5/D7, round-3 review, second pass): the HTTP Content-Type's
     boundary is read (see dispositionNotificationLines), and the disposition
     is judged by judgeDisposition. A Content-Type header that arrives twice
     is ambiguous and supplies no boundary. */
  const lines = raw.split(LINE_BREAK);
  const outerBoundary = typeof httpContentType === 'string' ? boundaryParam(httpContentType) : null;
  let fieldLines = dispositionNotificationLines(lines, outerBoundary);
  if (fieldLines === null) {
    // A Content-Type naming a single-part type (text/plain, or a
    // message/disposition-notification that was ambiguous or outside a part
    // header block) is MIME structure too: the body is not a bare notification.
    // 2026-09-23 (W5/D7, round-3 review, third pass): a delimiter-like line
    // counted as MIME structure on its own, so a bare notification followed
    // by a dashed footer ('-----') had no disposition. A delimiter line is
    // structure only when some boundary is declared (in the body or the HTTP
    // Content-Type) — with none, it cannot delimit anything.
    const anyBoundary = outerBoundary !== null || declaredBoundaries(lines).size > 0;
    const hasMimeStructure = lines.some((l, i) =>
      (anyBoundary && isDelimiterLine(l)) || (CONTENT_TYPE.test(l) && !/^\s*multipart\//i.test(unfoldedFieldAt(lines, i))));
    fieldLines = hasMimeStructure ? [] : lines;
  }
  const fields = unfoldLines(fieldLines);
  const field = (name: string): string | null => {
    const re = new RegExp(`^${name}[ \\t]*:(.*)$`, 'i');
    const values = fields.map((l) => l.match(re)).filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => m[1].trim());
    if (values.length !== 1 || values[0] === '') return null;
    return values[0];
  };

  const disposition = field('Disposition');
  const { accepted, failed } = disposition === null ? NEITHER : judgeDisposition(disposition);
  return { originalMessageId: field('Original-Message-ID'), accepted, failed, disposition };
}

/**
 * Why a 2xx MDN is not an acceptance of the message sent.
 *
 * 2026-09-23 (W5/D7, round-3 review): the classification is by whether the
 * agency may hold the bytes, not by which field is missing. A 2xx answer to
 * our own POST is delivery; only an explicit non-accepting disposition is
 * evidence the agency did not take them.
 *
 * `rejected` — the MDN's disposition is `failed`, or `processed` with an
 * error/failure modifier token (ParsedMdn.failed), AND its Original-Message-ID
 * names our message. The agency refused the message.
 *
 * `unconfirmed` — delivered, receipt unconfirmed: no readable disposition, a
 * disposition that neither accepts nor refuses (an unknown modifier, an
 * unbalanced comment), or an accepting OR refusing disposition whose
 * Original-Message-ID is missing, empty, `<>`, not a single msg-id, or names
 * a different message. The agency may hold the bytes. A caller records
 * it as delivered-unconfirmed (FDA ESG: 'in_transit', inside the
 * duplicate-send lock; ICSR: stage 'receipt-unproven') and never as rejected:
 * a rejection is what frees a send to be made again.
 *
 * 2026-09-23 (W5/D7, round-3 review, second pass): a refusal was a
 * rejection whatever message it named, so a `failed` MDN for another message
 * (or for none, or `<>`) freed a resend of ours — no evidence about ours. A
 * refusal is now tied to our message exactly as an acceptance is.
 */
export interface MdnRefusal {
  kind: 'rejected' | 'unconfirmed';
  reason: string;
}

/** The msg-id token of an Original-Message-ID value, or null when it holds no single non-empty one. */
function msgIdToken(value: string): string | null {
  /* RFC 5322 §3.6.4: msg-id = [CFWS] "<" id-left "@" id-right ">" [CFWS].
     Only the bracketed token is compared; comments around it are CFWS.
     2026-09-23 (W5/D7, round-3 review, second pass): an id echoed without its
     angle brackets (`id-left@id-right`, one token, no whitespace) never
     matched, although it names our message exactly; it is now read as the
     same token. A value with an unbalanced comment is not a single msg-id.
     Third pass (same date): the bare form required exactly one '@', so an id
     built from an e-mail-shaped AS2 identity (`<uuid@user@host>`, which the
     bracketed form accepts) never matched when echoed bare. The bare form is
     now one token with a non-empty left part before its first '@'. */
  const bare = stripComments(value)?.trim();
  if (bare === undefined) return null;
  const m = bare.match(/^<([^<>]*)>$/) ?? bare.match(/^([^\s<>"()@]+@[^\s<>"()]+)$/);
  return m && m[1].trim() !== '' ? m[1].trim().toLowerCase() : null;
}

/** Why an Original-Message-ID does not tie an MDN to `messageId`, or null when it does. */
function untiedReason(originalMessageId: string | null, messageId: string): string | null {
  const bare = originalMessageId === null ? null : stripComments(originalMessageId);
  if (originalMessageId === null || (bare !== null && /^<\s*>$/.test(bare.trim()))) {
    return 'Agency MDN names no Original-Message-ID, so it cannot be tied to the message sent.';
  }
  const token = msgIdToken(originalMessageId);
  // 2026-09-23 (W5/D7, round-3 review, third pass): msg-ids are public
  // identifiers echoed by the agency, not secrets; a timing-safe compare buys nothing.
  // eslint-disable-next-line security/detect-possible-timing-attacks -- msg-id, not a secret
  if (token === null) {
    return `Agency MDN Original-Message-ID (${originalMessageId}) is not a single msg-id, so it cannot be tied to the message sent.`;
  }
  // eslint-disable-next-line security/detect-possible-timing-attacks -- msg-id, not a secret
  if (token !== msgIdToken(messageId)) return `Agency MDN answers a different message (${originalMessageId}).`;
  return null;
}

/**
 * Why a 2xx MDN is not an acceptance of `messageId`, or null when it is. A 2xx
 * used to be recorded as received on its own: an MDN whose disposition was
 * `failed` or `processed/error`, one for a different message, or a body with
 * no disposition at all all went into the row as the agency's acceptance.
 */
export function mdnRefusal(mdn: ParsedMdn, messageId: string): MdnRefusal | null {
  const unconfirmed = (reason: string): MdnRefusal => ({ kind: 'unconfirmed', reason });
  if (mdn.disposition === null) return unconfirmed('Agency returned success with no MDN disposition in the body.');
  if (!mdn.accepted && !mdn.failed) {
    return unconfirmed(`Agency MDN disposition neither accepts nor refuses the message (unknown or unreadable): ${mdn.disposition}`);
  }
  /* 2026-09-22 (W5/D7): an MDN that names no message used to pass, so a
     receipt that cannot be tied to what was sent was recorded as the agency's
     acceptance of it. Received-Content-MIC and the MDN's own signature are
     still not verified (residual; needs the agency's certificates and a UAT
     round trip).
     2026-09-23 (W5/D7, round-2 review): the 2026-09-22 note said such a send
     "is not re-sent", but FDA ESG recorded it 'rejected' — outside the
     active-transmittal lock — so the same bundle could be sent again at once.
     2026-09-23 (W5/D7, round-3 review): round 2 kept that only for a field
     that was absent; an empty, whitespace-only or `<>` value, a msg-id with a
     trailing comment and an MDN for another message were still rejections.
     Every one is now `unconfirmed`, and a comment no longer defeats a match.
     2026-09-23 (W5/D7, round-3 review, second pass): the refusal check ran
     before this tie, so a refusal naming another message (or none) was a
     rejection. The tie now applies to refusals and acceptances alike. */
  const untied = untiedReason(mdn.originalMessageId, messageId);
  if (untied !== null) return unconfirmed(untied);
  if (mdn.failed) return { kind: 'rejected', reason: `Agency MDN did not accept the message: ${mdn.disposition}` };
  return null;
}

export function buildAs2Headers(msg: As2Message): Record<string, string> {
  return {
    'Message-ID':                msg.messageId,
    'AS2-From':                  msg.from,
    'AS2-To':                    msg.to,
    'AS2-Version':               '1.2',
    'Disposition-Notification-To': msg.from,
    'Disposition-Notification-Options': 'signed-receipt-protocol=optional, pkcs7-signature; signed-receipt-micalg=optional, sha-256',
    'Receipt-Delivery-Option':   'sync',  /* synchronous MDN — easier to wire */
    'Content-Type':              msg.contentType,
    'Content-Disposition':       `attachment; filename="${msg.filename ?? 'ectd.zip'}"`,
    'Content-Length':            String(msg.body.length),
    'User-Agent':                msg.userAgent ?? 'concept2cure-mdx/1.0',
  };
}

export function signAs2Body(body: Buffer, privateKeyPem: string): string {
  /* Detached SHA-256 signature over the body. The agency's MDN signing
     verification expects the signature in the MDN; the request-side
     signature is the sponsor's proof of origin. Production uses CMS
     SignedData; this scaffolds the path. */
  const signer = createSign('RSA-SHA256');
  signer.update(body);
  return signer.sign(privateKeyPem, 'base64');
}

/**
 * The transport failed AFTER the request had been released to a server that
 * had accepted our TLS client identity: a timeout, reset or cut-short
 * response while sending it or waiting for the answer. The recipient may hold
 * the message, so a caller must not record it as refused — that frees a
 * resend.
 *
 * 2026-09-23 (W5/D7, round-3 review, third pass): new. Every failure was a
 * plain TransportError, which FDA ESG recorded 'rejected' — outside the
 * duplicate-send lock — and ICSR reported "NOT transmitted", although a
 * timeout while FDA computes a synchronous MDN comes after the whole bundle
 * was sent.
 * 2026-09-23 (W5/D7, MDN final pass): raised only when httpsPost has proof
 * the request reached an authenticated server (see httpsPost), not on Node's
 * 'finish' alone: under TLS 1.3 'finish' fires before the server has checked
 * our client certificate, so an agency refusing the certificate was recorded
 * as holding a bundle its application never saw. Every other transport
 * failure is a plain TransportError — NOT_DELIVERED (classifyDelivery).
 * 2026-09-23 (W5/D7, MDN close, repair): raised for every such failure
 * after the request was released, not only once 'finish' has fired — the
 * 'finish' callback can trail the server's read of the whole body (see
 * requestReachedServer).
 */
export class RequestSentTransportError extends TransportError {
  readonly requestSent = true as const;
  constructor(message: string, cause?: unknown) {
    super(`${message} after the request was sent to an authenticated server; the recipient may hold it`, cause);
    this.name = 'RequestSentTransportError';
  }
}

/**
 * Peer TLS alerts that refuse this client or the bytes it sent: a certificate
 * the server will not accept, access denied, a failed handshake, or a record
 * of ours it could not authenticate (so it did not take the whole request).
 */
const PEER_REFUSAL_ALERTS = new Set([
  'bad certificate', 'unsupported certificate', 'certificate revoked', 'certificate expired',
  'certificate unknown', 'unknown ca', 'certificate required', 'access denied', 'handshake failure',
  'insufficient security', 'bad record mac', 'decrypt error', 'decryption failed',
]);

/**
 * The description of a TLS alert the SERVER sent that refuses this client or
 * its bytes (PEER_REFUSAL_ALERTS), else null. OpenSSL reports a received alert
 * as "<version> alert <description>" (code ERR_SSL_<VERSION>_ALERT_<DESC>); a
 * failure detected locally — e.g. "decryption failed or bad record mac" on a
 * record from the server — carries no "alert" and is not one.
 * 2026-09-23 (W5/D7, MDN final pass, repair): new; replaces isTlsFailure,
 * which counted every TLS-shaped error, local decryption failures included.
 */
export function peerRefusalAlert(err: unknown): string | null {
  if (err === null || typeof err !== 'object') return null;
  const found: string[] = [];
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string') {
    const m = /_ALERT_([A-Z0-9_]+)$/.exec(code);
    if (m) found.push(m[1].toLowerCase().replace(/_/g, ' '));
  }
  const message = (err as { message?: unknown }).message;
  if (typeof message === 'string') {
    for (const m of message.matchAll(/\b(?:sslv3|tlsv1|tlsv13|ssl\/tls) alert ([a-z ]+)/gi)) found.push(m[1].toLowerCase().trim());
  }
  return found.find((d) => PEER_REFUSAL_ALERTS.has(d)) ?? null;
}

/**
 * Whether a failed attempt may be held by the recipient — the one rule behind
 * RequestSentTransportError (DELIVERED_UNCONFIRMED) vs TransportError
 * (NOT_DELIVERED). See httpsPost for how the two flags are established.
 *   - Once any response has been parsed: always — the server answered.
 *   - Before the server accepted this client: never — the request is still
 *     corked, so not one byte of it was handed to the TLS layer.
 *   - Otherwise only on a connection whose server had accepted this client,
 *     and not when the failure is the server's own refusal alert
 *     (peerRefusalAlert: a certificate refused late, or a record of ours it
 *     could not authenticate). Any other failure there — a reset, a timeout, a
 *     record FROM the server that fails our decryption (the server's answer
 *     arriving), a non-refusing alert — may follow the server reading it all.
 * 2026-09-23 (W5/D7, MDN final pass, repair): new. The final pass's rule sent
 * every TLS-shaped failure without a parsed response to NOT_DELIVERED, so an
 * agency answer corrupted in flight after it had read the whole bundle was
 * recorded "Nothing reached FDA" / 'rejected' and a resend freed. Once the
 * request is written only after the server accepted this client (httpsPost),
 * a TLS failure is no longer evidence of a handshake refusal.
 * 2026-09-23 (W5/D7, MDN close, repair): Node's request 'finish' is no longer
 * a boundary ("before 'finish': never"). Over TLS its callback runs one or
 * more loop iterations after the bytes reached the kernel, so a server that
 * read the whole bundle and then reset was classed NOT_DELIVERED whenever
 * 'finish' had not yet been delivered — every time on a busy process — and
 * NOT_DELIVERED now releases the sequence claim. Only evidence that does not
 * depend on callback timing counts: the cork (nothing written) and the
 * server's own refusal alert. A failure mid-write on an authenticated
 * connection is therefore held — the conservative side.
 */
export function requestReachedServer(s: {
  authenticated: boolean;
  answered: boolean;
  cause?: unknown;
}): boolean {
  if (s.answered) return true;
  return s.authenticated && peerRefusalAlert(s.cause) === null;
}

/**
 * How long httpsPost waits, after a TLS 1.3 handshake, for the server to
 * confirm it accepted our client certificate before the request is written.
 * See httpsPost.
 */
export const TLS13_CLIENT_AUTH_SETTLE_MS = 2_000;

/** A plain HTTPS POST (optionally mTLS). What postAs2 is built on. */
export function httpsPost(opts: {
  endpoint: string;
  headers: Record<string, string>;
  body: Buffer;
  clientCertPem?: string;
  clientKeyPem?: string;
  /** Trust anchor for the TLS handshake; omitted ⇒ the platform CA store. */
  agencyCertPem?: string;
  timeoutMs?: number;
  errorPrefix?: string;
  /** Override TLS13_CLIENT_AUTH_SETTLE_MS (tests). */
  tls13SettleMs?: number;
}): Promise<As2Response> {
  /* 2026-09-23 (W5/D7, MDN final pass): when a failure counts as "the whole
     request reached a server that may hold it" (RequestSentTransportError).
     The third pass used Node's request 'finish' alone. Under TLS 1.3 the
     client completes its handshake — and Node writes the request and fires
     'finish' — before the server has verified the client certificate; a
     server that refuses it answers with an alert or a reset one round trip
     later. From the client, "refused our certificate" and "read the whole
     body, then reset" were the same event sequence (secureConnect, finish,
     ECONNRESET), and both were recorded as delivered.

     So the request is held (the socket is corked) until the server has
     provably accepted this client:
       - TLS 1.2 and earlier: the handshake itself — the server verifies the
         client certificate before its Finished, and 'secureConnect' needs it;
       - TLS 1.3: the server's NewSessionTicket ('session'), which a server
         sends only after it has verified the client's Finished and
         certificate; or, for a server that sends no tickets, the settle
         window (tls13SettleMs) passing with the connection open — a refusal
         is an immediate alert or reset, one round trip after our Finished.
     A failure before that point — DNS, connection refused, any TLS error, a
     refusal inside the settle window — leaves before a byte of the request
     is written: TransportError, NOT_DELIVERED. After it, the request is
     released to the socket; a failure from then on is
     RequestSentTransportError, DELIVERED_UNCONFIRMED — unless it is the
     server's own refusal alert with no response parsed
     (requestReachedServer).
     2026-09-23 (MDN final pass, repair): the exception was "any TLS-shaped
     failure", which included a response record that fails our decryption —
     the server's answer arriving — and recorded it NOT_DELIVERED.
     2026-09-23 (W5/D7, MDN close, repair): Node's request 'finish' is not
     evidence either way, and is no longer read. The MDN final pass counted a
     failure before 'finish' as NOT_DELIVERED, and the MDN close pass an
     answer that is neither 2xx nor 4xx before 'finish'
     (requestWrittenBeforeAnswer). Over TLS the callback that emits 'finish'
     runs one or more loop iterations after the bytes reached the kernel, so
     a server that read the whole bundle and answered 502, or reset, was
     classed "nothing reached FDA" — and the sequence claim released — on
     most attempts, and on every attempt while this process was busy.

     A non-2xx final answer still stops the rest of the body being sent
     (RFC 9112 §9.5: a server that answers before reading the body does not
     want it). That is hygiene — it spares an agency front end that declined
     the message a 1 GiB upload — not evidence: the attempt is classed on
     the status alone.

     `agent: false` gives every POST its own connection, so the handshake
     evidence above is about this request's connection, never a pooled one.

     The settle window must exceed the round trip to the agency: a shorter one
     writes the request before a TLS 1.3 refusal can arrive. The suites pin a
     1 s floor and a refusal over a 60 ms-each-way proxy.

     Residual: a TLS 1.3 server that sends no session tickets AND takes
     longer than the settle window to refuse a certificate is written to
     before the refusal arrives. If the refusal is an alert it is still
     NOT_DELIVERED (peerRefusalAlert); if it is a bare reset it is classed
     DELIVERED_UNCONFIRMED (the lock is held; nothing is re-sent). */
  const prefix = opts.errorPrefix ?? 'HTTPS POST';
  const settleMs = opts.tls13SettleMs ?? TLS13_CLIENT_AUTH_SETTLE_MS;
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    /** The server accepted this client (see above); the request may be written. */
    let authenticated = false;
    /** The server's response head was parsed (it answered). */
    let answered = false;

    const failure = (message: string, cause?: unknown): TransportError =>
      requestReachedServer({ authenticated, answered, cause })
        ? new RequestSentTransportError(message, cause)
        : new TransportError(message, cause);
    const fail = (message: string, cause?: unknown) => done(() => reject(failure(message, cause)));

    const url = new URL(opts.endpoint);
    const req = https.request({
      hostname: url.hostname,
      port:     url.port ? Number(url.port) : 443,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  opts.headers,
      cert:     opts.clientCertPem,
      key:      opts.clientKeyPem,
      ca:       opts.agencyCertPem,  /* trust the agency's cert when given */
      rejectUnauthorized: true,
      timeout:  opts.timeoutMs ?? 60_000,
      agent:    false,
    }, (res) => {
      answered = true;
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        done(() => resolve({
          httpStatus: res.statusCode ?? 0,
          headers:    res.headers as Record<string, string | string[] | undefined>,
          body:       Buffer.concat(chunks),
        }));
        /* 2026-09-23 (W5/D7, MDN close; repair): a non-2xx final answer ends
           this attempt. Stop sending whatever of the body is still queued
           (RFC 9112 §9.5) — hygiene, see above; the verdict does not depend
           on it. The connection is this request's own (`agent: false`). The
           request 'error' the destroy may raise lands in `fail`, a no-op once
           settled. */
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) req.destroy();
      });
      // 2026-09-23 (W5/D7, MDN final pass): a response cut short (headers and
      // part of the MDN, then a reset) emitted no 'end' and no request
      // 'error', so the transmit never settled.
      const cut = (cause?: unknown) =>
        fail(`${prefix} failed: the response was cut short${cause instanceof Error ? ` (${cause.message})` : ''}`, cause);
      res.on('aborted', () => cut());
      res.on('error', (err: Error) => cut(err));
      res.on('close', () => { if (!res.complete) cut(); });
    });
    req.on('socket', (socket) => holdUntilClientAccepted(socket, settleMs, () => { authenticated = true; }));
    req.on('error', (err) => fail(`${prefix} failed: ${err.message}`, err));
    req.on('timeout', () => { req.destroy(); fail(`${prefix} timeout`); });
    req.write(opts.body);
    req.end();
  });
}

/**
 * Cork `socket` until the server has accepted this TLS client (see httpsPost),
 * then call `onAccepted` and uncork it. A socket that is not a TLS socket
 * (no getProtocol) is left alone.
 * 2026-09-23 (W5/D7, MDN final pass): new.
 */
function holdUntilClientAccepted(socket: Socket, settleMs: number, onAccepted: () => void): void {
  const tls = socket as Partial<TLSSocket>;
  if (typeof tls.getProtocol !== 'function' || typeof socket.cork !== 'function') return;
  socket.cork();
  let released = false;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  const release = () => {
    if (released || socket.destroyed) return;
    released = true;
    if (settleTimer) clearTimeout(settleTimer);
    onAccepted();
    // Deferred: uncorking inside the TLS callback that emitted 'session'
    // dropped the tail of the request (observed on Node 22).
    globalThis.setImmediate(() => { if (!socket.destroyed) socket.uncork(); });
  };
  socket.once('secureConnect', () => {
    const protocol = tls.getProtocol?.() ?? null;
    if (protocol !== 'TLSv1.3') { release(); return; }
    settleTimer = setTimeout(release, settleMs);
  });
  socket.once('session', release);
  socket.once('close', () => { if (settleTimer) clearTimeout(settleTimer); });
}

/**
 * AS2 POST with mTLS. `agencyCertPem` is the agency's certificate, used as the
 * trust anchor for the TLS handshake (`rejectUnauthorized: true` always).
 * `errorPrefix` names the caller in the TransportError so a log line says which
 * agency path failed.
 */
export function postAs2(opts: {
  endpoint: string;
  headers: Record<string, string>;
  body: Buffer;
  clientCertPem: string;
  clientKeyPem: string;
  agencyCertPem?: string;
  timeoutMs?: number;
  errorPrefix?: string;
}): Promise<As2Response> {
  return httpsPost({ ...opts, errorPrefix: opts.errorPrefix ?? 'AS2 POST' });
}

/* ─── Delivery classification — the one rule ─────────────────────────────── */

/**
 * What one delivery attempt proved. The ONE classification every agency path
 * that posts through httpsPost uses (FDA ESG AS2, the E2B(R3) ICSR AS2 and
 * HTTPS transports); no caller re-derives it.
 *
 *   RECEIVED              HTTP 2xx and the caller's 2xx judge accepts (AS2: an
 *                         accepting MDN whose Original-Message-ID token is
 *                         ours — see parseMdn / mdnRefusal).
 *   REFUSED_BY_AGENCY     HTTP 2xx whose judge finds an explicit refusal of OUR
 *                         message (AS2: a `failed` disposition, or `processed`
 *                         with a failure modifier, naming our message); or any
 *                         HTTP 4xx — the server answered and refused.
 *   DELIVERED_UNCONFIRMED The agency may hold the message: a 2xx that is
 *                         neither of the above (no or unreadable disposition,
 *                         no / empty / `<>` / another message's id, ambiguous
 *                         modifiers); any HTTP status that is not 2xx or 4xx
 *                         (5xx — an intermediary or the backend may hold the
 *                         bytes — and 1xx/3xx, which refuse nothing), whenever
 *                         it came; a RequestSentTransportError (the request
 *                         was released to a server that had accepted this
 *                         client — see httpsPost). A caller keeps the
 *                         duplicate-send lock for it.
 *   NOT_DELIVERED         Every other failure, each PROVEN before the request
 *                         could reach an authenticated server — DNS,
 *                         connection refused, any TLS handshake / certificate
 *                         error before the server accepted this client (the
 *                         request still corked: not a byte of it written), or
 *                         the server's own refusal alert with no response
 *                         parsed (requestReachedServer). This verdict is the
 *                         NOTHING_TRANSMITTED proof callers pass on (types.ts),
 *                         so it must never rest on timing. 2026-09-23
 *                         (repair): a TLS error after an authenticated write
 *                         that is not such an alert — a record from the server
 *                         failing our decryption — is DELIVERED_UNCONFIRMED.
 *
 * 2026-09-23 (W5/D7, MDN final pass): new. The rule lived in three places
 * (fda-esg.ts, and the AS2 and HTTPS paths of icsr-gateway-transport.ts), and
 * each classed every non-2xx as a refusal — so a 502 from a proxy that may
 * have forwarded the bundle freed a resend.
 * 2026-09-23 (W5/D7, MDN close): a 5xx/3xx the endpoint sent before Node's
 * request 'finish' was made NOT_DELIVERED. 2026-09-23 (MDN close, repair):
 * withdrawn — 'finish' can trail the server's read of the whole body by one
 * or more loop iterations, so genuine deliveries answered 502 were classed
 * NOT_DELIVERED and released the sequence claim. A front end that answers
 * 503 on the request head stays DELIVERED_UNCONFIRMED ('in_transit' until
 * someone confirms at FDA): the client cannot tell it from one that read
 * everything.
 */
export type DeliveryOutcome =
  | { kind: 'RECEIVED'; httpStatus: number; responseRaw: string; receiptId: string }
  | { kind: 'REFUSED_BY_AGENCY'; httpStatus: number; responseRaw: string; reason: string }
  | {
      kind: 'DELIVERED_UNCONFIRMED';
      /** Null when no HTTP answer arrived (a failure after the request was sent). */
      httpStatus: number | null;
      responseRaw: string | null;
      reason: string;
      /** The response's Message-ID when it carried one, else the id we sent. */
      trackingId: string;
    }
  | {
      kind: 'NOT_DELIVERED';
      reason: string;
      /** What the attempt threw. */
      error: unknown;
    };

/** The raw result of one POST: the response, or what it threw. */
export type DeliveryAttempt = { ok: true; response: As2Response } | { ok: false; error: unknown };

/** What a caller's judge makes of a 2xx answer. */
export type TwoXxVerdict =
  | { kind: 'RECEIVED'; receiptId: string }
  | { kind: 'REFUSED_BY_AGENCY' | 'DELIVERED_UNCONFIRMED'; reason: string };

/** Run one POST and capture its result for classifyDelivery; never throws. */
export async function attemptDelivery(post: () => Promise<As2Response>): Promise<DeliveryAttempt> {
  try {
    return { ok: true, response: await post() };
  } catch (error: unknown) {
    return { ok: false, error };
  }
}

/** The first non-empty value of a response header. */
export function headerValue(v: string | string[] | undefined): string | null {
  const first = Array.isArray(v) ? v[0] : v;
  return typeof first === 'string' && first.trim() !== '' ? first.trim() : null;
}

/**
 * Classify one attempt. `ourMessageId` is the id this platform sent (the AS2
 * Message-ID, or the transport's own message id); `judge2xx` reads a 2xx body.
 */
export function classifyDelivery(
  attempt: DeliveryAttempt,
  ourMessageId: string,
  judge2xx: (response: As2Response, raw: string) => TwoXxVerdict,
): DeliveryOutcome {
  if (!attempt.ok) {
    const { error } = attempt;
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof RequestSentTransportError) {
      return { kind: 'DELIVERED_UNCONFIRMED', httpStatus: null, responseRaw: null, reason, trackingId: ourMessageId };
    }
    return { kind: 'NOT_DELIVERED', reason, error };
  }
  const { response } = attempt;
  const status = response.httpStatus;
  const raw = response.body.toString('utf8');
  const trackingId = headerValue(response.headers['message-id']) ?? ourMessageId;
  if (status >= 400 && status < 500) {
    return {
      kind: 'REFUSED_BY_AGENCY', httpStatus: status, responseRaw: raw,
      reason: `The agency endpoint refused the message: HTTP ${status}: ${raw.slice(0, 500)}`,
    };
  }
  if (status < 200 || status >= 300) {
    return {
      kind: 'DELIVERED_UNCONFIRMED', httpStatus: status, responseRaw: raw, trackingId,
      reason: `The agency endpoint answered HTTP ${status}, which neither accepts nor refuses the message ` +
        `(an intermediary or the agency's backend may hold it): ${raw.slice(0, 500)}`,
    };
  }
  const verdict = judge2xx(response, raw);
  if (verdict.kind === 'RECEIVED') return { kind: 'RECEIVED', httpStatus: status, responseRaw: raw, receiptId: verdict.receiptId };
  if (verdict.kind === 'REFUSED_BY_AGENCY') return { kind: 'REFUSED_BY_AGENCY', httpStatus: status, responseRaw: raw, reason: verdict.reason };
  return { kind: 'DELIVERED_UNCONFIRMED', httpStatus: status, responseRaw: raw, reason: verdict.reason, trackingId };
}

/**
 * classifyDelivery for an AS2 POST: a 2xx is judged by its synchronous MDN
 * (parseMdn + mdnRefusal, tied to `messageId`). A RECEIVED receipt id is the
 * MDN's own Message-ID, else the AS2 Message-ID the MDN acknowledges.
 */
export function classifyAs2Delivery(attempt: DeliveryAttempt, messageId: string): DeliveryOutcome {
  return classifyDelivery(attempt, messageId, (response, raw) => {
    const refusal = mdnRefusal(parseMdn(raw, response.headers['content-type']), messageId);
    if (refusal === null) return { kind: 'RECEIVED', receiptId: headerValue(response.headers['message-id']) ?? messageId };
    return { kind: refusal.kind === 'rejected' ? 'REFUSED_BY_AGENCY' : 'DELIVERED_UNCONFIRMED', reason: refusal.reason };
  });
}
