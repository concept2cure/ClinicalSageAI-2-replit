/**
 * AS2 MDN interpretation: which part of the body is read, how the fields are
 * read, and which 2xx outcomes are rejections.
 *
 * 2026-09-23 (W5/D7, round-2 review). RFC 5322 §2.2.3 lets a field body
 * continue on a line that begins with a space or tab. parseMdn read each field
 * from a single line, so an accepting MDN whose Original-Message-ID (or
 * Disposition) was folded parsed as naming no message (or carrying no
 * disposition) and was refused.
 *
 * 2026-09-23 (W5/D7, round-3 review). The round-2 fix left four defects, each
 * pinned below:
 *   - an Original-Message-ID that is empty, whitespace only (including a
 *     folded whitespace-only continuation) or `<>` read as naming a DIFFERENT
 *     message, which FDA ESG recorded 'rejected', outside the duplicate-send
 *     lock;
 *   - a legal msg-id followed by an RFC 5322 comment (`<id> (FDA ESG)`) was
 *     refused, and a comment in the Disposition (`processed (no failure)`)
 *     read as a failure modifier;
 *   - only an MDN naming no message was classed delivered-unconfirmed; an
 *     accepting MDN naming another message, and a 2xx with no readable
 *     disposition, were still rejections although FDA may hold the bytes.
 *     Only an explicit non-accepting disposition is a rejection now — since
 *     the second pass (below), one that names our message, with `failed` or
 *     a `processed` error/failure modifier token (third pass, at the end);
 *   - fields were read from anywhere in the body, so a text/plain part that
 *     mentions Original-Message-ID could decide the outcome. Fields are read
 *     only from the message/disposition-notification part (or from a bare
 *     notification with no MIME structure at all).
 *
 * Pure functions: nothing is mocked.
 */
import { describe, it, expect } from 'vitest';
import { parseMdn, mdnRefusal } from '../as2-transport';

/* 2026-09-23 (W5/D7, round-3 review, second pass). Five further defects, each
   pinned in the describe blocks at the end of this file:
     - a disposition modifier other than exactly `error` / `failure`
       (`processed/failed`, `processed/decryption-failed`, `processed/x-error`,
       any RFC 3798 extension) read as an ACCEPTANCE, and so did a Disposition
       or msg-id with an unclosed comment — non-acceptances recorded 'received';
     - a failed MDN naming ANOTHER message (or none, or `<>`, or two) was a
       rejection, which frees a resend although it is no evidence about ours.
       The test "a failed disposition is a rejection, even when it names no
       message" pinned that and now names our message;
     - an unsigned multipart/report whose outer boundary travelled in the HTTP
       Content-Type was unreadable as soon as any nested boundary was declared
       in the body, so FDA's acceptance of our message was 'unconfirmed';
     - an Original-Message-ID echoed without angle brackets never matched;
     - the part locator's declared-boundary branch and its end-at-delimiter
       rule were pinned by no test. */

const MESSAGE_ID = '<3f1c2b9e-7a4d-4e2b-9c1a-5d6e7f8a9b0c@ZZFDA_CONCEPT2CURE_SPONSOR_TEST>';
const ACCEPTING = 'automatic-action/MDN-sent-automatically; processed';

const mdn = (fields: string, eol = '\r\n') =>
  ['Content-Type: message/disposition-notification', '', 'Reporting-UA: FDA ESG',
    'Original-Recipient: rfc822; ZZFDATST', 'Final-Recipient: rfc822; ZZFDATST']
    .join(eol) + eol + fields;

const classify = (raw: string) => mdnRefusal(parseMdn(raw), MESSAGE_ID);

describe('parseMdn — RFC 5322 folded fields are unfolded before they are read', () => {
  it('reads an Original-Message-ID folded onto a CRLF continuation line', () => {
    const p = parseMdn(mdn(`Original-Message-ID:\r\n ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n`));
    expect(p.originalMessageId).toBe(MESSAGE_ID);
    expect(p.accepted).toBe(true);
    expect(mdnRefusal(p, MESSAGE_ID)).toBeNull();
  });

  it('reads an Original-Message-ID folded with a bare LF and a tab', () => {
    const p = parseMdn(mdn(`Original-Message-ID:\n\t${MESSAGE_ID}\nDisposition: ${ACCEPTING}\n`, '\n'));
    expect(p.originalMessageId).toBe(MESSAGE_ID);
    expect(mdnRefusal(p, MESSAGE_ID)).toBeNull();
  });

  it('reads a Disposition folded after its action mode', () => {
    const p = parseMdn(mdn(
      `Original-Message-ID: ${MESSAGE_ID}\r\n` +
      'Disposition: automatic-action/MDN-sent-automatically;\r\n processed\r\n',
    ));
    expect(p.disposition).toBe(ACCEPTING);
    expect(p.accepted).toBe(true);
    expect(mdnRefusal(p, MESSAGE_ID)).toBeNull();
  });

  it('a folded processed/error modifier is a rejection', () => {
    const p = parseMdn(mdn(
      `Original-Message-ID: ${MESSAGE_ID}\r\n` +
      'Disposition: automatic-action/MDN-sent-automatically;\r\n processed/error:\r\n unexpected-processing-error\r\n',
    ));
    expect(p.accepted).toBe(false);
    expect(mdnRefusal(p, MESSAGE_ID)).toMatchObject({ kind: 'rejected', reason: expect.stringMatching(/did not accept/) });
  });

  it('does not join a following field that is not a continuation', () => {
    const p = parseMdn(mdn(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n`));
    expect(p.originalMessageId).toBe(MESSAGE_ID);
    expect(p.disposition).toBe(ACCEPTING);
  });
});

describe('Original-Message-ID that names no message — unconfirmed, never a rejection', () => {
  it('a field whose value is only a trailing space names no message', () => {
    const raw = mdn(`Original-Message-ID: \r\nDisposition: ${ACCEPTING}\r\n`);
    expect(parseMdn(raw).originalMessageId).toBeNull();
    expect(classify(raw)).toMatchObject({ kind: 'unconfirmed', reason: expect.stringMatching(/names no Original-Message-ID/) });
  });

  it('a field folded onto a whitespace-only continuation names no message', () => {
    const raw = mdn(`Original-Message-ID:\r\n \r\nDisposition: ${ACCEPTING}\r\n`);
    expect(parseMdn(raw).originalMessageId).toBeNull();
    expect(classify(raw)).toMatchObject({ kind: 'unconfirmed', reason: expect.stringMatching(/names no Original-Message-ID/) });
  });

  it('an empty msg-id "<>" names no message', () => {
    expect(classify(mdn(`Original-Message-ID: <>\r\nDisposition: ${ACCEPTING}\r\n`)))
      .toMatchObject({ kind: 'unconfirmed', reason: expect.stringMatching(/names no Original-Message-ID/) });
  });

  it('a field absent altogether names no message', () => {
    expect(classify(mdn(`Disposition: ${ACCEPTING}\r\n`)))
      .toMatchObject({ kind: 'unconfirmed', reason: expect.stringMatching(/names no Original-Message-ID/) });
  });

  it('a value carrying no angle-bracketed msg-id cannot be tied to the message sent', () => {
    expect(classify(mdn(`Original-Message-ID: (FDA ESG)\r\nDisposition: ${ACCEPTING}\r\n`)))
      .toMatchObject({ kind: 'unconfirmed' });
  });

  it('a value carrying two msg-ids cannot be tied to the message sent, even when one of them is ours', () => {
    expect(classify(mdn(`Original-Message-ID: <other@X> ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n`)))
      .toMatchObject({ kind: 'unconfirmed' });
  });
});

describe('RFC 5322 comments (CFWS) do not change what an MDN says', () => {
  it('accepts our msg-id followed by a comment folded onto a continuation line', () => {
    expect(classify(mdn(`Original-Message-ID: ${MESSAGE_ID}\r\n (FDA ESG)\r\nDisposition: ${ACCEPTING}\r\n`))).toBeNull();
  });

  it('accepts our msg-id followed by a comment on the same line', () => {
    expect(classify(mdn(`Original-Message-ID: ${MESSAGE_ID} (FDA ESG)\r\nDisposition: ${ACCEPTING}\r\n`))).toBeNull();
  });

  it('accepts our msg-id preceded by a comment that itself contains an angle-bracketed id', () => {
    expect(classify(mdn(`Original-Message-ID: (was <other@X>) ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n`))).toBeNull();
  });

  it('a folded "(no failure)" comment after processed is not a failure modifier', () => {
    const raw = mdn(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n (no failure)\r\n`);
    expect(parseMdn(raw).accepted).toBe(true);
    expect(classify(raw)).toBeNull();
  });

  it('a nested comment mentioning error after processed is not an error modifier', () => {
    expect(classify(mdn(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING} (not an (error))\r\n`))).toBeNull();
  });

  it('a /error modifier folded onto a continuation line after processed is a rejection', () => {
    expect(classify(mdn(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n /error: x\r\n`)))
      .toMatchObject({ kind: 'rejected' });
  });
});

describe('mdnRefusal — only an explicit non-accepting disposition is a rejection', () => {
  it('a failed disposition naming our message is a rejection', () => {
    expect(classify(mdn(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: automatic-action/MDN-sent-automatically; failed/failure: sender-unauthorized\r\n`)))
      .toMatchObject({ kind: 'rejected', reason: expect.stringMatching(/did not accept/) });
  });

  it('processed/error is a rejection', () => {
    expect(classify(mdn(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: automatic-action/MDN-sent-automatically; processed/error: authentication-failed\r\n`)))
      .toMatchObject({ kind: 'rejected' });
  });

  it('processed/failure is a rejection', () => {
    expect(classify(mdn(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: automatic-action/MDN-sent-automatically; processed/failure: unsupported format\r\n`)))
      .toMatchObject({ kind: 'rejected' });
  });

  it('processed/warning is an acceptance even when its description text contains the word failure', () => {
    expect(classify(mdn(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: automatic-action/MDN-sent-automatically; processed/warning: partial failure to index\r\n`)))
      .toBeNull();
  });

  it('an accepting MDN for a different message is delivered-unconfirmed, not a rejection', () => {
    expect(classify(mdn(`Original-Message-ID: <other@X>\r\nDisposition: ${ACCEPTING}\r\n`)))
      .toMatchObject({ kind: 'unconfirmed', reason: expect.stringMatching(/different message/) });
  });

  it('a 2xx body with no disposition is delivered-unconfirmed, not a rejection', () => {
    expect(classify('')).toMatchObject({ kind: 'unconfirmed', reason: expect.stringMatching(/no MDN disposition/) });
  });

  it('a disposition type that is neither processed nor failed is delivered-unconfirmed, not a rejection', () => {
    expect(classify(mdn(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: automatic-action/MDN-sent-automatically; displayed\r\n`)))
      .toMatchObject({ kind: 'unconfirmed' });
  });

  it('a notification carrying two conflicting Disposition fields is delivered-unconfirmed', () => {
    expect(classify(mdn(
      `Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n` +
      'Disposition: automatic-action/MDN-sent-automatically; failed/failure: x\r\n',
    ))).toMatchObject({ kind: 'unconfirmed' });
  });
});

describe('fields are read only from the message/disposition-notification part', () => {
  it('case L: a folded Original-Message-ID in a text/plain part does not override the notification part naming another message', () => {
    const raw =
      'Content-Type: text/plain\r\n\r\nOriginal-Message-ID:\r\n ' + MESSAGE_ID + '\r\n' +
      mdn(`Original-Message-ID: <other@X>\r\nDisposition: ${ACCEPTING}\r\n`);
    const p = parseMdn(raw);
    expect(p.originalMessageId).toBe('<other@X>');
    expect(mdnRefusal(p, MESSAGE_ID)).toMatchObject({ kind: 'unconfirmed', reason: expect.stringMatching(/different message/) });
  });

  it('case K: an accepting Disposition in a text/plain part does not override a failed notification part', () => {
    const raw =
      'Content-Type: text/plain\r\n\r\nYour message was\r\n Disposition: automatic-action/MDN-sent-automatically; processed\r\n' +
      mdn(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: automatic-action/MDN-sent-automatically; failed/failure: x\r\n`);
    expect(classify(raw)).toMatchObject({ kind: 'rejected' });
  });

  const report = (textPart: string, dnPart: string | null) =>
    'Content-Type: multipart/report; report-type=disposition-notification;\r\n\tboundary="=_b1"\r\n\r\n' +
    '--=_b1\r\nContent-Type: text/plain; charset=us-ascii\r\n\r\n' + textPart +
    (dnPart === null ? '' : '--=_b1\r\nContent-Type: message/disposition-notification\r\n\r\n' + dnPart) +
    '--=_b1--\r\n';

  it('in a multipart/report, the text/plain part naming our message does not override a notification naming another', () => {
    const raw = report(
      `Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n`,
      `Original-Message-ID: <other@X>\r\nDisposition: ${ACCEPTING}\r\n`,
    );
    expect(classify(raw)).toMatchObject({ kind: 'unconfirmed', reason: expect.stringMatching(/different message/) });
  });

  it('in a multipart/report, the notification part naming our message with processed is the receipt', () => {
    const raw = report('The message was received.\r\n', `Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n`);
    expect(classify(raw)).toBeNull();
  });

  it('a multipart body with no notification part is never read from its text/plain part', () => {
    const raw = report(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n`, null);
    const p = parseMdn(raw);
    expect(p.disposition).toBeNull();
    expect(p.originalMessageId).toBeNull();
    expect(mdnRefusal(p, MESSAGE_ID)).toMatchObject({ kind: 'unconfirmed', reason: expect.stringMatching(/no MDN disposition/) });
  });

  it('a single-part text/plain body is not read as a notification', () => {
    const raw = `Content-Type: text/plain\r\n\r\nOriginal-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n`;
    expect(parseMdn(raw).disposition).toBeNull();
    expect(classify(raw)).toMatchObject({ kind: 'unconfirmed' });
  });

  it('a bare notification with no MIME structure is read as the notification fields', () => {
    expect(classify(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n`)).toBeNull();
  });

  it('a notification part nested inside a multipart/signed wrapper is found', () => {
    const raw =
      '--sig\r\nContent-Type: multipart/report; report-type=disposition-notification; boundary="rep"\r\n\r\n' +
      '--rep\r\nContent-Type: text/plain\r\n\r\nhuman text\r\n' +
      '--rep\r\nContent-Type: message/disposition-notification\r\n\r\n' +
      `Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n` +
      '--rep--\r\n--sig\r\nContent-Type: application/pkcs7-signature\r\n\r\nMIIB\r\n--sig--\r\n';
    expect(classify(raw)).toBeNull();
  });
});

describe('disposition modifiers — only processed with no modifier, or with warning, is an acceptance', () => {
  const disp = (d: string) => mdn(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: automatic-action/MDN-sent-automatically; ${d}\r\n`);

  it.each([
    ['processed/failed: signature check failed'],
    ['processed/decryption-failed'],
    ['processed/x-error'],
    ['processed/Warning, error: mixed'],
  ])('%s names a failure and is a rejection, never an acceptance', (d) => {
    const p = parseMdn(disp(d));
    expect(p.accepted).toBe(false);
    expect(mdnRefusal(p, MESSAGE_ID)).toMatchObject({ kind: 'rejected' });
  });

  it.each([
    ['processed/superseded'],
    ['processed/x-custom-modifier: something'],
    ['processed/warning, expired'],
  ])('%s is an unknown modifier: delivered-unconfirmed, never an acceptance', (d) => {
    const p = parseMdn(disp(d));
    expect(p.accepted).toBe(false);
    expect(p.failed).toBe(false);
    expect(mdnRefusal(p, MESSAGE_ID)).toMatchObject({ kind: 'unconfirmed' });
  });

  it.each([['processed/warning'], ['processed/Warning: duplicate-document'], ['processed']])('%s is an acceptance', (d) => {
    expect(classify(disp(d))).toBeNull();
  });

  it('a Disposition with an unclosed comment is unreadable, never an acceptance', () => {
    const p = parseMdn(disp('processed (see note /error: decryption-failed'));
    expect(p.accepted).toBe(false);
    expect(mdnRefusal(p, MESSAGE_ID)).toMatchObject({ kind: 'unconfirmed' });
  });

  it('a Disposition with an unterminated quoted string is unreadable, never an acceptance', () => {
    expect(classify(disp('processed "/error'))).toMatchObject({ kind: 'unconfirmed' });
  });

  it('an Original-Message-ID with an unclosed comment is not a single msg-id', () => {
    expect(classify(mdn(`Original-Message-ID: ${MESSAGE_ID} (FDA ESG\r\nDisposition: ${ACCEPTING}\r\n`)))
      .toMatchObject({ kind: 'unconfirmed' });
  });
});

describe('a refusal is evidence about our message only when it names our message', () => {
  const FAILED = 'automatic-action/MDN-sent-automatically; failed/failure: unsupported format';
  const PROC_ERROR = 'automatic-action/MDN-sent-automatically; processed/error: authentication-failed';

  it.each([
    ['failed, for a different message', `Original-Message-ID: <someone-else@FDA>\r\nDisposition: ${FAILED}\r\n`],
    ['processed/error, for a different message', `Original-Message-ID: <someone-else@FDA>\r\nDisposition: ${PROC_ERROR}\r\n`],
    ['failed, naming "<>"', `Original-Message-ID: <>\r\nDisposition: ${FAILED}\r\n`],
    ['failed, naming two msg-ids one of which is ours', `Original-Message-ID: ${MESSAGE_ID} <other@X>\r\nDisposition: ${FAILED}\r\n`],
    ['failed, naming no message', `Disposition: ${FAILED}\r\n`],
  ])('%s is delivered-unconfirmed, not a rejection', (_label, fields) => {
    expect(classify(mdn(fields))).toMatchObject({ kind: 'unconfirmed' });
  });

  it('processed/error naming our message is a rejection', () => {
    expect(classify(mdn(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${PROC_ERROR}\r\n`)))
      .toMatchObject({ kind: 'rejected', reason: expect.stringMatching(/did not accept/) });
  });
});

describe('an unsigned multipart/report whose outer boundary is in the HTTP Content-Type', () => {
  const DN = `Content-Type: message/disposition-notification\r\n\r\nReporting-UA: FDA ESG\r\nOriginal-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n`;
  const HTTP_CT = 'multipart/report; report-type=disposition-notification; boundary="outer"';
  const P4 =
    '--outer\r\nContent-Type: multipart/alternative; boundary="alt"\r\n\r\n--alt\r\nContent-Type: text/plain\r\n\r\nreceived\r\n' +
    '--alt\r\nContent-Type: text/html\r\n\r\n<p>received</p>\r\n--alt--\r\n\r\n--outer\r\n' + DN + '\r\n--outer--\r\n';
  const P5 =
    '--outer\r\nContent-Type: text/plain\r\n\r\nreceived\r\n--outer\r\n' + DN + '\r\n' +
    `--outer\r\nContent-Type: text/rfc822-headers\r\n\r\nMessage-ID: ${MESSAGE_ID}\r\n` +
    'Content-Type: multipart/signed; protocol="application/pkcs7-signature"; micalg=sha-256; boundary="origsig"\r\n\r\n--outer--\r\n';
  const P13 =
    '--outer\r\nContent-Type: text/plain\r\n\r\nYour message was received. Original headers:\r\n' +
    'Content-Type: multipart/signed; micalg=sha-256; boundary="origsig"\r\n\r\n--outer\r\n' + DN + '\r\n--outer--\r\n';

  it.each([
    ['a multipart/alternative human part (P4)', P4],
    ['a text/rfc822-headers third part echoing our multipart/signed headers (P5)', P5],
    ['a text/plain part quoting a boundary-bearing Content-Type (P13)', P13],
  ])('with %s, accepting our message, is the receipt — with and without the HTTP Content-Type', (_label, raw) => {
    expect(mdnRefusal(parseMdn(raw, HTTP_CT), MESSAGE_ID)).toBeNull();
    expect(mdnRefusal(parseMdn(raw), MESSAGE_ID)).toBeNull();
    expect(mdnRefusal(parseMdn(raw.replace(/\r\n/g, '\n'), HTTP_CT), MESSAGE_ID)).toBeNull();
  });

  it('with the boundary known from the HTTP Content-Type, a delimiter-like line inside a text part cannot name a second notification', () => {
    const raw =
      '--outer\r\nContent-Type: text/plain\r\n\r\nquoted:\r\n--fake\r\nContent-Type: message/disposition-notification\r\n\r\n' +
      `Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n\r\n` +
      `--outer\r\nContent-Type: message/disposition-notification\r\n\r\nOriginal-Message-ID: ${MESSAGE_ID}\r\n` +
      'Disposition: automatic-action/MDN-sent-automatically; failed/failure: x\r\n\r\n--outer--\r\n';
    expect(mdnRefusal(parseMdn(raw, HTTP_CT), MESSAGE_ID)).toMatchObject({ kind: 'rejected' });
    // Without the HTTP boundary the two header blocks are indistinguishable: ambiguous, never an acceptance.
    expect(mdnRefusal(parseMdn(raw), MESSAGE_ID)).toMatchObject({ kind: 'unconfirmed' });
  });
});

describe('Original-Message-ID echoed without angle brackets', () => {
  it('a bare id naming our message is the receipt', () => {
    expect(classify(mdn(`Original-Message-ID: ${MESSAGE_ID.slice(1, -1)}\r\nDisposition: ${ACCEPTING}\r\n`))).toBeNull();
  });

  it('a bare id naming another message is a different message', () => {
    expect(classify(mdn(`Original-Message-ID: other@X\r\nDisposition: ${ACCEPTING}\r\n`)))
      .toMatchObject({ kind: 'unconfirmed', reason: expect.stringMatching(/different message/) });
  });

  it('two bare words are not a single msg-id', () => {
    expect(classify(mdn(`Original-Message-ID: ${MESSAGE_ID.slice(1, -1)} other@X\r\nDisposition: ${ACCEPTING}\r\n`)))
      .toMatchObject({ kind: 'unconfirmed', reason: expect.stringMatching(/not a single msg-id/) });
  });
});

describe('the part locator — a boundary declared in the body, and the end of the notification part', () => {
  it('a notification Content-Type line inside a text/plain part BODY does not name a part', () => {
    const raw =
      'Content-Type: multipart/report; report-type=disposition-notification; boundary="b1"\r\n\r\n' +
      '--b1\r\nContent-Type: text/plain\r\n\r\nContent-Type: message/disposition-notification\r\n\r\n' +
      `Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n--b1--\r\n`;
    expect(parseMdn(raw).disposition).toBeNull();
    expect(classify(raw)).toMatchObject({ kind: 'unconfirmed' });
  });

  it('with a boundary declared in the body, a delimiter-like line inside a text part does not open a second part', () => {
    const raw =
      'Content-Type: multipart/report; report-type=disposition-notification; boundary="b1"\r\n\r\n' +
      '--b1\r\nContent-Type: text/plain\r\n\r\nquoted:\r\n--fake\r\nContent-Type: message/disposition-notification\r\n\r\n' +
      `Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n\r\n` +
      `--b1\r\nContent-Type: message/disposition-notification\r\n\r\nOriginal-Message-ID: ${MESSAGE_ID}\r\n` +
      'Disposition: automatic-action/MDN-sent-automatically; failed/failure: x\r\n\r\n--b1--\r\n';
    expect(classify(raw)).toMatchObject({ kind: 'rejected' });
  });

  it('the notification part ends at the next delimiter: a later part naming another message does not make it ambiguous', () => {
    const raw =
      'Content-Type: multipart/report; report-type=disposition-notification; boundary="b1"\r\n\r\n' +
      '--b1\r\nContent-Type: text/plain\r\n\r\nok\r\n' +
      `--b1\r\nContent-Type: message/disposition-notification\r\n\r\nOriginal-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n` +
      '--b1\r\nContent-Type: text/rfc822-headers\r\n\r\nOriginal-Message-ID: <other@X>\r\n' +
      'Disposition: automatic-action/MDN-sent-automatically; failed/failure: x\r\n--b1--\r\n';
    const p = parseMdn(raw);
    expect(p.originalMessageId).toBe(MESSAGE_ID);
    expect(mdnRefusal(p, MESSAGE_ID)).toBeNull();
  });
});

/* 2026-09-23 (W5/D7, round-3 review, third pass). Four further defects:
     - 'error' / 'fail' matched as a SUBSTRING of any modifier, so an extension
       such as `processed/x-no-errors` or `processed/x-failover-used`, and the
       non-grammatical `processed/warning;error`, were explicit refusals of our
       message — recorded 'rejected', which frees a resend;
     - a description (`: text`) straight after the type, with no `/modifier`
       (`processed: error`), and a colon inside the action mode, read as a
       plain acceptance;
     - a free-text warning description with an unbalanced `(` or `"` made the
       whole Disposition unreadable, and a bare notification followed by a
       dashed footer line read as MIME structure with no notification part —
       both 'unconfirmed' where HEAD accepted;
     - an id echoed without angle brackets matched only when it held one '@',
       so our own id built from an e-mail-shaped AS2 identity never matched. */
describe('disposition modifiers are whole tokens, and a description needs a modifier', () => {
  const disp = (d: string) => mdn(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: automatic-action/MDN-sent-automatically; ${d}\r\n`);

  it.each([
    ['processed/x-no-errors'],
    ['processed/x-failover-used'],
    ['processed/x-not-failed'],
    ['processed/warning;error'],
    ['processed/'],
    ['processed/warning,'],
  ])('%s is not an explicit refusal: delivered-unconfirmed, never rejected or accepted', (d) => {
    const p = parseMdn(disp(d));
    expect(p.failed).toBe(false);
    expect(p.accepted).toBe(false);
    expect(mdnRefusal(p, MESSAGE_ID)).toMatchObject({ kind: 'unconfirmed' });
  });

  it.each([
    ['processed: error'],
    ['processed:'],
  ])('%s — a description with no modifier — is unreadable, never an acceptance', (d) => {
    const p = parseMdn(disp(d));
    expect(p.accepted).toBe(false);
    expect(mdnRefusal(p, MESSAGE_ID)).toMatchObject({ kind: 'unconfirmed' });
  });

  it('a colon inside the action mode is unreadable, never an acceptance', () => {
    const raw = mdn(`Original-Message-ID: ${MESSAGE_ID}\r\nDisposition: automatic-action: x; processed\r\n`);
    expect(classify(raw)).toMatchObject({ kind: 'unconfirmed' });
  });

  it.each([
    ['processed/error: authentication-failed'],
    ['processed/failure: sender-equals-receiver'],
    ['processed/decryption-failed'],
    ['processed/x-error'],
    ['processed/Integrity-Check-Failed'],
    ['failed/failure: unsupported format'],
  ])('%s naming our message is still a rejection', (d) => {
    expect(classify(disp(d))).toMatchObject({ kind: 'rejected' });
  });

  it.each([
    ['processed/warning: see note (unbalanced'],
    ['processed/warning: a 3.5" disk'],
    ['processed/warning: stray ) paren'],
    ['processed (a comment: with a colon)/warning: text'],
  ])('%s — free text after the modifier cannot make the disposition unreadable', (d) => {
    expect(classify(disp(d))).toBeNull();
  });

  it('an unclosed comment BEFORE the description still makes the disposition unreadable', () => {
    expect(classify(disp('processed (see /error: decryption-failed'))).toMatchObject({ kind: 'unconfirmed' });
    expect(classify(disp('processed (see /warning: x'))).toMatchObject({ kind: 'unconfirmed' });
  });
});

describe('a bare notification with a footer line, and an id with more than one @', () => {
  it('a bare notification followed by a dashed footer line is read as the notification', () => {
    const raw = `Reporting-UA: FDA ESG\r\nOriginal-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n\r\n-----\r\nFDA ESG\r\n`;
    expect(classify(raw)).toBeNull();
  });

  it('with a multipart boundary in the HTTP Content-Type, a body of delimiter lines and no part headers is not read as bare', () => {
    const raw = `--outer\r\n\r\nOriginal-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n--outer--\r\n`;
    expect(mdnRefusal(parseMdn(raw, 'multipart/report; boundary="outer"'), MESSAGE_ID)).toMatchObject({ kind: 'unconfirmed' });
  });

  it('a body with a delimiter line and a declared boundary but no notification part is still not read as bare', () => {
    const raw = `Content-Type: multipart/report; boundary="b1"\r\n\r\n--b1\r\n\r\nOriginal-Message-ID: ${MESSAGE_ID}\r\nDisposition: ${ACCEPTING}\r\n--b1--\r\n`;
    expect(classify(raw)).toMatchObject({ kind: 'unconfirmed' });
  });

  it('a bare echo of an id whose AS2 identity is e-mail shaped names our message', () => {
    const ours = '<3f1c2b9e-7a4d@sponsor@example.com>';
    const raw = mdn(`Original-Message-ID: 3f1c2b9e-7a4d@sponsor@example.com\r\nDisposition: ${ACCEPTING}\r\n`);
    expect(mdnRefusal(parseMdn(raw), ours)).toBeNull();
    const other = mdn(`Original-Message-ID: 3f1c2b9e-7a4d@other@example.com\r\nDisposition: ${ACCEPTING}\r\n`);
    expect(mdnRefusal(parseMdn(other), ours)).toMatchObject({ kind: 'unconfirmed', reason: expect.stringMatching(/different message/) });
  });
});
