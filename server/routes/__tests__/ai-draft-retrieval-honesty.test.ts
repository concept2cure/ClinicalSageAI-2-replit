/**
 * An ungrounded draft must not look like a grounded one.
 *
 * WHAT WAS WRONG. Both AI-draft paths wrapped Data Room retrieval in a catch
 * that logged a warning and continued. On failure `sourcesRetrieved` stayed 0,
 * no evidence block reached the model, and the response said "AI draft
 * generated successfully" — identical to the ordinary case where the corpus
 * simply held nothing relevant. So the one situation in which a reviewer most
 * needs to know a draft is ungrounded was indistinguishable from the one in
 * which nothing was wrong.
 *
 * Two facts were being collapsed into one zero:
 *   • retrieval RAN and found nothing — a fact about the Data Room;
 *   • retrieval FAILED — no fact about the Data Room at all, and a draft whose
 *     claims nothing checked.
 *
 * These tests pin them apart at the source level. The draft routes are long
 * SSE/gateway handlers whose behaviour here is a reporting contract rather than
 * a computation, and the property that matters — that a failure is named — is
 * one a reader can verify directly.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');

const AUTHORING = 'server/routes/authoring.router.ts';
// server/routes/c2c/documents.ts used to carry a second AI-draft stream; it was
// deleted (ledger L32) — no consumer, and it never parked the sources it
// retrieved, so its drafts could not be accepted with source lineage.

describe('AI draft — retrieval outcome is reported, not swallowed', () => {
  it.each([AUTHORING])('%s distinguishes failed retrieval from an empty corpus', (file) => {
    const src = read(file);
    expect(src).toContain("retrievalStatus: 'ok' | 'empty' | 'failed'");
    expect(src).toContain("retrievalStatus = 'failed'");
    expect(src).toContain("retrievalStatus = 'ok'");
    expect(src).toContain("retrievalStatus = 'empty'");
  });

  it.each([AUTHORING])('%s records the failure reason rather than only logging it', (file) => {
    const src = read(file);
    // A console.warn is not a record: the caller cannot see it, and neither can
    // anyone reading the draft afterwards.
    expect(src).toContain('retrievalError');
    expect(src).toMatch(/retrievalError\s*=\s*e\?\.message/);
  });

  it.each([AUTHORING])('%s reports the status to the caller', (file) => {
    const src = read(file);
    // Present in the response/metadata, not just held in a local.
    const afterCatch = src.slice(src.indexOf("retrievalStatus = 'failed'"));
    expect(afterCatch).toMatch(/retrievalStatus,/);
  });

  it('the authoring response no longer says "successfully" for an ungrounded draft', () => {
    const src = read(AUTHORING);
    // The old message. Its return would mean a retrieval outage is once again
    // being reported as an ordinary success.
    expect(src).not.toContain("'AI draft generated successfully'");
    expect(src).toContain('retrieval failed, so this draft is ungrounded');
    // And the empty-corpus case says what it actually is.
    expect(src).toContain('no Data Room sources above the relevance threshold');
  });

  it('the failure reason is bounded, so a driver error cannot flood the response', () => {
    for (const file of [AUTHORING]) {
      expect(read(file)).toMatch(/String\(e\.message\)\.slice\(0, 300\)/);
    }
  });

  it('a retrieval failure still yields a draft — it is labelled, not blocked', () => {
    // Deliberate: a draft is not a governed write, and the accept path already
    // refuses to persist content whose lineage cannot be covered. Blocking here
    // would trade a labelled draft for no draft at all.
    for (const file of [AUTHORING]) {
      const src = read(file);
      const catchBlock = src.slice(
        src.indexOf("retrievalStatus = 'failed'"),
        src.indexOf("retrievalStatus = 'failed'") + 600,
      );
      expect(catchBlock).not.toMatch(/\bthrow\b|res\.status\(5\d\d\)/);
    }
  });
});
