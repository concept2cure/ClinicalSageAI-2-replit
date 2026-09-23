/**
 * AS2 (RFC 4130) transport primitives shared by every agency path that ships
 * bytes over AS2-over-HTTPS with mTLS: the FDA ESG eCTD / eSTAR gateway
 * (`./fda-esg.ts`) and the E2B(R3) ICSR safety-gateway transport
 * (`../ind-lifecycle/icsr-gateway-transport.ts`).
 *
 * Extracted from `fda-esg.ts` on 2026-09-20 (W5, runbook B7/B16) so the ICSR
 * transport could reuse the ONE AS2 implementation instead of growing a second
 * one. Everything here is envelope framing, body signing, the mTLS POST and MDN
 * interpretation — no database, no transmittal rows, no agency-specific policy.
 *
 * ── KNOWN CONFORMANCE GAP (carried over verbatim from fda-esg.ts) ────────────
 * The AS2 *message envelope* is NOT yet a PKCS#7/CMS S/MIME structure. The body
 * is posted as-is; `signAs2Body` computes a detached RSA-SHA256 signature but it
 * is NOT attached as an S/MIME `multipart/signed` part, and there is no PKCS#7
 * encryption. An agency AS2 endpoint that requires S/MIME will reject the
 * envelope with a non-2xx, which every caller surfaces honestly (the success
 * path only runs on a 2xx whose MDN accepts the very message that was sent).
 * Do not represent AS2 transmission as production-conformant until a real CMS
 * implementation lands; confirm with the agency during UAT whether a
 * TLS-protected, non-S/MIME AS2 envelope is accepted for the account.
 *
 * @module server/services/submission-gateways/as2-transport
 */

import { createSign } from 'crypto';
import * as https from 'node:https';
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
}

/** Parsed MDN disposition. */
export interface ParsedMdn {
  originalMessageId: string | null;
  accepted: boolean;
  disposition: string | null;
}

/**
 * What a synchronous MDN says about the message it acknowledges. RFC 3798 /
 * AS2: `Disposition: <mode>; <type>[/<modifier>: text]` — only a `processed`
 * type without an `error` or `failure` modifier is an acceptance.
 */
export function parseMdn(raw: string): ParsedMdn {
  const field = (name: string): string | null => {
    const m = raw.match(new RegExp(`^${name}:[ \\t]*(.+?)[ \\t]*$`, 'im'));
    return m ? m[1] : null;
  };
  const disposition = field('Disposition');
  const afterMode = disposition ? disposition.slice(disposition.indexOf(';') + 1).trim().toLowerCase() : '';
  const accepted = disposition !== null && disposition.includes(';')
    && afterMode.startsWith('processed') && !/\b(error|failure|failed)\b/.test(afterMode);
  return { originalMessageId: field('Original-Message-ID'), accepted, disposition };
}

/**
 * Why a 2xx MDN is not an acceptance of `messageId`, or null when it is. A 2xx
 * used to be recorded as received on its own: an MDN whose disposition was
 * `failed` or `processed/error`, one for a different message, or a body with
 * no disposition at all all went into the row as the agency's acceptance.
 */
export function mdnRefusal(mdn: ParsedMdn, messageId: string): string | null {
  if (mdn.disposition === null) return 'Agency returned success with no MDN disposition in the body.';
  if (!mdn.accepted) return `Agency MDN did not accept the message: ${mdn.disposition}`;
  const norm = (v: string) => v.trim().replace(/^<|>$/g, '').toLowerCase();
  /* 2026-09-22 (W5/D7): an MDN that names no message used to pass, so a
     receipt that cannot be tied to what was sent was recorded as the agency's
     acceptance of it. The caller records the refusal with the raw MDN and the
     sequence stays in flight for a human to confirm at the agency — it is not
     re-sent. Received-Content-MIC and the MDN's own signature are still not
     verified (residual; needs the agency's certificates and a UAT round trip). */
  if (mdn.originalMessageId === null) {
    return 'Agency MDN names no Original-Message-ID, so it cannot be tied to the message sent; confirm receipt at the agency.';
  }
  if (norm(mdn.originalMessageId) !== norm(messageId)) {
    return `Agency MDN acknowledges a different message (${mdn.originalMessageId}).`;
  }
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
}): Promise<As2Response> {
  const prefix = opts.errorPrefix ?? 'HTTPS POST';
  return new Promise((resolve, reject) => {
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
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({
        httpStatus: res.statusCode ?? 0,
        headers:    res.headers as Record<string, string | string[] | undefined>,
        body:       Buffer.concat(chunks),
      }));
    });
    req.on('error', (err) => reject(new TransportError(`${prefix} failed: ${err.message}`, err)));
    req.on('timeout', () => { req.destroy(); reject(new TransportError(`${prefix} timeout`)); });
    req.write(opts.body);
    req.end();
  });
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
