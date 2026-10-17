/**
 * Contract: the product must not claim regulatory acts it does not perform.
 *
 * This is the third and fourth site of one defect. ESGSubmissionService minted
 * acknowledgement numbers for submissions it never sent; medicalDeviceService
 * wrote submissionStatus 'submitted' for 510(k)s it never transmitted. Both were
 * closed earlier. These two were still open:
 *
 *   1. server/services/ectd-submission-agent.ts — submitToGateway() validated the
 *      sequence, wrote `status = 'submitted'` with a history row reading
 *      "Submitted to agency gateway", and returned { status: 'submitted' }. There
 *      is no gateway client in that file: no AS2 handshake, no ESG connection, no
 *      bytes, no transmittal, no acknowledgement. A regulatory affairs lead
 *      reading that record — in the UI, in an export, during an inspection —
 *      would conclude the sequence had been filed.
 *
 *   2. client/src/concept2cure/v2/surfaces/Review.tsx — the "Electronic
 *      signature" dialog collected a password and a TOTP into component state,
 *      used NEITHER, wrote `window.C2C_SIGNED` (read nowhere in the repo), made
 *      zero network calls, attributed the signature to the hardcoded string
 *      'Jordan Chen' (a fixture identity), and told the user "Manifestation
 *      recorded per 21 CFR §11.50".
 *
 * The second is the more serious of the two. A §11.50 manifestation must record
 * the signer's printed name, the date and time of execution, and the meaning of
 * the signing, bound to the signed record — none of which can come from the
 * browser's say-so. And a control that asks for a password and discards it
 * teaches users to type credentials into things that do nothing.
 *
 * These tests assert on source because the defect IS the source: what the record
 * says, and what the UI tells the user it did. Each assertion is written so that
 * reinstating the specific fabricated string fails it.
 *
 * UPDATE (f3515fcf8, "Review & approval: four governed acts that reached no
 * server at all"): the review surface's decision modal is no longer a dead
 * control — it POSTs to /api/review/workflows/:id/decision on the governed
 * review router, sends the reviewer's selected 21 CFR 11.50 MEANING verbatim,
 * and reports success only after the server confirms the write. What it records
 * is a review decision, still NOT a §11.50 signature manifestation (no signer
 * re-verification, nothing sealed against a frozen document version) — and the
 * surface still says so, in the modal manifest and in a persistent banner. The
 * contract below therefore pins BOTH truths: the wiring must be real, and the
 * not-a-signature disclosure must stay.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRaw = (p: string) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');

/**
 * Source with comments removed.
 *
 * These assertions are about what the CODE does, and both fixes deliberately
 * leave comments quoting the exact strings they removed — that is the record of
 * why the code looks the way it does. Matching raw source would flag those
 * comments and force the explanation out of the file, which is the opposite of
 * what anyone wants. So: strip comments, then assert.
 *
 * Deliberately naive (no string/regex-literal awareness) because it only has to
 * handle these two files, and being over-eager here can only remove text — it
 * cannot invent a passing match.
 */
const read = (p: string) =>
  readRaw(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const AGENT = 'server/services/ectd-submission-agent.ts';
const REVIEW = 'client/src/concept2cure/v2/surfaces/Review.tsx';
/** The review decision dialog and its write, out of Review.tsx since 404e94efc. */
const DECISION_DIALOG = 'client/src/concept2cure/v2/surfaces/ReviewDecisionDialog.tsx';
const DECISION_HOOK = 'client/src/concept2cure/v2/surfaces/usePeerReviewDecision.ts';
const PEER_REVIEW = 'client/src/concept2cure/v2/surfaces/authoringPeerReview.ts';

describe('eCTD submission agent does not claim to have transmitted', () => {
  const src = read(AGENT);
  const submitFn = src.slice(
    src.indexOf('async submitToGateway'),
    src.indexOf('/** Get a single submission with org isolation */'),
  );

  it('locates submitToGateway (guards against the anchor moving)', () => {
    expect(submitFn.length).toBeGreaterThan(200);
    expect(submitFn).toContain('ectd_submissions');
  });

  it('never sets status to submitted', () => {
    expect(submitFn).not.toMatch(/status\s*=\s*'submitted'/);
    expect(submitFn).not.toMatch(/status:\s*'submitted'/);
  });

  it('does not write a history reason claiming it reached the gateway', () => {
    expect(submitFn).not.toContain("'Submitted to agency gateway'");
  });

  it('states plainly that nothing was transmitted', () => {
    expect(submitFn).toMatch(/NOT been transmitted|NOT transmitted/);
    expect(submitFn).toMatch(/transmitted:\s*false/);
  });

  it('uses a status the CHECK constraint actually permits', () => {
    // db/migrations/082_ectd_submission_agent.sql:71 constrains this column.
    // Writing a value outside the list would 500 on every call — which is how a
    // first attempt at this fix (a new 'ready_for_transmission') would have
    // failed.
    const ddl = readRaw('db/migrations/082_ectd_submission_agent.sql');
    const check = ddl.slice(ddl.indexOf('CHECK (status IN ('), ddl.indexOf('package_path'));
    const written = [...submitFn.matchAll(/status\s*=\s*'([a-z_]+)'/g)].map(m => m[1]);
    // 2026-10-15: this required a status write, and the one written was
    // 'validated' on four local prechecks. No status is written now, so the
    // list may be empty; whatever is written must still be in the CHECK.
    expect(written).not.toContain('validated');
    for (const s of written) expect(check, `status '${s}' is not in the CHECK`).toContain(`'${s}'`);
  });

  it('still refuses to proceed on validation errors', () => {
    // The honesty fix must not weaken the gate that was already there.
    expect(submitFn).toMatch(/has not been validated yet/i);
    expect(submitFn).toMatch(/validation error/i);
  });
});

describe('the review surface does not fabricate an electronic signature', () => {
  const src = read(REVIEW);
  /* The decision dialog. VSR-001 F-6 (2026-09-21) moved the board onto the
     authoring review store, and the dialog was renamed with it: ESignModal ->
     DecisionModal, its opener ApproveSign -> RecordDecision. 404e94efc
     (2026-10-14, "Bind Authoring peer reviews to saved content and current
     authority") moved it out of Review.tsx: the dialog is ReviewDecisionDialog
     (ReviewDecisionDialog.tsx), its record flow usePeerReviewDecision, and the
     write authoringPeerReview.ts::recordPeerReview. Every property below is
     asserted on those files. Each slice is asserted non-empty, because
     String.slice(-1, -1) is '' and every `not.toContain` against '' passes —
     which is exactly how the fixture-identity check below went vacuous when
     the names changed. */
  const dialog = read(DECISION_DIALOG);
  const hook = read(DECISION_HOOK);
  const peerReview = read(PEER_REVIEW);
  /** Everything the surface renders or sends for a decision. */
  const surface = [src, dialog, hook, peerReview].join('\n');
  const between = (text: string, from: string, to: string | null, where: string) => {
    const start = text.indexOf(from);
    expect(start, `${from} not found in ${where}`).toBeGreaterThan(-1);
    const end = to == null ? text.length : text.indexOf(to, start + from.length);
    expect(end, `${to} must follow ${from} in ${where}`).toBeGreaterThan(start);
    return text.slice(start, end);
  };
  const decisionDialog = () => between(dialog, 'export function ReviewDecisionDialog', null, DECISION_DIALOG);
  const recordFlow = () => between(hook, 'const record = async', 'return {', DECISION_HOOK);
  const recordWrite = () => between(peerReview, 'export async function recordPeerReview', null, PEER_REVIEW);
  const reviewInput = () => between(peerReview, 'export function capturedReviewInput', 'function receiptMatches', PEER_REVIEW);

  it('the review board opens the decision dialog, so the properties below are the surface’s', () => {
    expect(src).toMatch(/import \{ ReviewDecisionDialog \} from '\.\/ReviewDecisionDialog'/);
    expect(src).toMatch(/<ReviewDecisionDialog\b/);
  });

  it('does not attribute a signature to a hardcoded fixture identity', () => {
    for (const part of [decisionDialog(), recordFlow(), recordWrite()]) expect(part).not.toContain('Jordan Chen');
  });

  it('does not write the phantom C2C_SIGNED global', () => {
    // It was assigned here and read nowhere in the repository, so every
    // "signature" evaporated on reload.
    expect(surface).not.toMatch(/C2C_SIGNED\s*(\[|=)/);
  });

  it('does not collect credentials it discards', () => {
    // A password field whose value is never used is indistinguishable from a
    // harvesting UI, and trains users to enter passwords into dead controls.
    expect(surface).not.toMatch(/type="password"/);
    expect(surface).not.toMatch(/6-digit TOTP/);
  });

  it('never claims a §11.50 manifestation was recorded', () => {
    expect(surface).not.toMatch(/Manifestation recorded per 21 CFR/);
    expect(surface).not.toMatch(/E-sign is re-verified and manifested/);
  });

  it('says explicitly that a recorded decision is not an electronic signature', () => {
    // The decision now reaches the server (next test), but it is still not a
    // §11.50 signature: no signer identity is re-verified here and nothing is
    // sealed against a frozen document version. The dialog manifest and the
    // persistent banner both have to keep saying so — wiring the act made the
    // act real, it did not make it a signature.
    expect(src).toMatch(/not (an )?electronic signature/i);
    expect(decisionDialog()).toMatch(/not\s*(<\/?b>\s*)?a 21 CFR §11\.50 signature manifestation/i);
  });

  it('records the decision on the server and claims only what came back', () => {
    // f3515fcf8 made the modal POST to the governed review router; VSR-001 F-6
    // (2026-09-21) moved that write onto the authoring workflow's OWN review
    // transition, POST /api/authoring/documents/:id/review, so there is one
    // review store (client/src/concept2cure/v2/__tests__/reviewWritesReachTheServer.test.tsx
    // pins the chain end to end). The verdict the reviewer SELECTED travels
    // verbatim — never inferred — and the only success path out of the dialog
    // (onRecorded) fires once the server's answer has been checked against
    // what was sent, so "recorded" is a statement about the record, not about
    // the click.
    const write = recordWrite();
    expect(write).toMatch(/apiRequest\(\s*'POST',\s*`\/api\/authoring\/documents\/\$\{encodeURIComponent\(scope\.documentId\)\}\/review`/);
    const input = reviewInput();
    expect(input).toMatch(/review_status: verdict, \.\.\.\(trimmed \? \{ review_comments: trimmed \} : \{\}\)/);
    // It is a verdict, not a signature: this dialog puts no §11.50 meaning on
    // the wire, neither selected nor inferred.
    for (const part of [decisionDialog(), recordFlow(), write, input]) expect(part).not.toMatch(/\bmeaning\s*[:,}]/);
    // Only a confirmed answer is returned: a non-OK response throws, and so
    // does a body that does not match the review that was sent.
    const confirmed = write.indexOf('return parsed.data.review');
    expect(confirmed).toBeGreaterThan(-1);
    expect(write.indexOf('if (!response.ok)')).toBeGreaterThan(-1);
    expect(write.indexOf('if (!response.ok)')).toBeLessThan(confirmed);
    expect(write).toMatch(/if \(!parsed\.success \|\| !receiptMatches\(parsed\.data\.review, scope, context, input\)\) throw/);
    expect(write.indexOf('receiptMatches(')).toBeLessThan(confirmed);
    // ...and the dialog's success path fires only on that confirmed receipt.
    const flow = recordFlow();
    expect(flow).toMatch(/const confirmed = await recordPeerReview\(/);
    expect(flow.indexOf('onRecorded(confirmed)')).toBeGreaterThan(flow.indexOf('await recordPeerReview('));
    // A rejection is a record the author must act on: it cannot be written
    // without substantive grounds. (The floor covers a change request as
    // well: every verdict other than approval needs the reason.)
    expect(input).toMatch(/if \(\(verdict !== 'approved' && trimmed\.length < 8\) \|\| trimmed\.length > 4000\) \{\s*throw/);
    expect(decisionDialog()).toMatch(/\(state\.decision === 'approved' \|\| length >= 8\)/);
    // ...and the floor is enforced before the write, not merely displayed.
    const guard = write.indexOf('capturedReviewInput(');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(write.indexOf('apiRequest('));
  });

  it('points at the path that does perform a binding signature, and says truly how it verifies the signer', () => {
    // Removing a false claim without saying where the real capability lives
    // just moves the confusion.
    //
    // HOW the signer is verified is a claim about the product too, so it is
    // pinned to the implementation, not to whatever the copy last said. Both
    // authoring signature routes, POST /api/authoring/docs/:docId/e-sign and
    // /sign (server/routes/authoring.router.ts), call reverifyAuthoringSigner ->
    // reverifySigner (server/services/part11/reverify-signer.ts): the account
    // PASSWORD every time, and a 6-digit authenticator code on top of it only
    // when that signer has MFA enrolled (isMfaEnabled reads users.mfa_enabled,
    // per account). The dialog is the shared EsignModal, which asks for the
    // password and then the code when the server says one is enrolled.
    //
    // There is no signing PIN. 6f79a000f (2026-09-23, VSR-001 §13.3 item 3)
    // deleted verifyUserPin, POST /api/authoring/users/pin and
    // services/part11/pin-verification.ts, and corrected this surface's copy
    // from "PIN-verified" to "the signer's password is re-verified". This
    // assertion still required /PIN-verified/, so it pinned the retired
    // mechanism and failed on the copy that had been made true.
    //
    // Both places the surface tells the user where to sign are checked on
    // their own: the persistent banner and the decision dialog's manifest.
    // Whitespace is collapsed the way JSX renders it, so a copy line wrapped in
    // the source reads as the sentence the user sees.
    const disclosure = (text: string, where: string, anchor: string, close: string) =>
      between(text, anchor, close, where).replace(/\s+/g, ' ');
    const places: Array<[string, string]> = [
      ['signature banner', disclosure(src, REVIEW, 'Decisions recorded on this surface are not electronic signatures', '</div>')],
      ['decision dialog manifest', disclosure(dialog, DECISION_DIALOG, 'className="esign-manifest"', '</p>')],
    ];
    for (const [where, text] of places) {
      expect(text, where).toMatch(/authoring workspace/i);
      expect(text, where).toMatch(/password is re-verified/i);
      expect(text, where).not.toMatch(/\bpin\b/i);
    }
    // Nowhere on the surface: the PIN signs nothing.
    expect(surface).not.toMatch(/\bPIN\b/);
  });

  it('no longer labels the action as signing or sealing', () => {
    expect(surface).not.toMatch(/Approve &amp; sign|Approved &amp; sealed/);
    expect(surface).not.toMatch(/>Electronic signature</);
  });
});
