/**
 * A tool that answers `{ ok: false, … }` did not do what it was asked
 * (ANA-SUMMARY S4, the defect S3 found; docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md
 * §2.6, "A governed-write refusal shows as a row with the server's sentence,
 * never as success").
 *
 * 36 refusals under server/services/ana answer `{ ok: false, reason | message }`
 * with no `error` field (document-placement-tools, document-catalog-tools, the
 * signature refusals in AnaToolExecutor …). refusalOf read only `error`, so the
 * stream recorded every one of them as a success: its status, the round's
 * adaptation note, the tool-run telemetry and the trace. Pinned here:
 *   - `ok: false` and `refused` are refusals, in the tool's own sentence
 *     (`reason`, then `message`), or a plain one when it gave none;
 *   - a check whose `ok` is its verdict about the input (check_grounding,
 *     validate_docx, verify_docx_against_source, a partial insertion, a
 *     script's run) carries the work it did, and is not a refusal.
 */
import { describe, it, expect } from 'vitest';
import { refusalOf, NO_REFUSAL_SENTENCE } from '../tool-trace';

const j = (v: unknown) => JSON.stringify(v);

describe('refusalOf: ok:false is a refusal, in its own words', () => {
  it('reads `reason` as the sentence (document-placement-tools: confirm a filing)', () => {
    expect(refusalOf(j({ ok: false, refused: true, documentId: 'd', reason: 'You cannot confirm a filing.' }))).toBe(
      'You cannot confirm a filing.',
    );
  });

  it('reads `message` when there is no reason (refuseSignatureInChat)', () => {
    expect(
      refusalOf(j({ ok: false, signatureRequired: true, tool: 'approve_qms_document', message: 'AnA cannot sign.' })),
    ).toBe('AnA cannot sign.');
  });

  it('prefers the reason over an instruction to the model (extraction failed)', () => {
    expect(
      refusalOf(j({ ok: false, extractionFailed: true, reason: 'No extracted text is stored.', message: 'Tell the user what failed.' })),
    ).toBe('No extracted text is stored.');
  });

  it('a refusal that gave no sentence still is one, in a plain sentence of the server', () => {
    expect(refusalOf(j({ ok: false }))).toBe(NO_REFUSAL_SENTENCE);
    expect(refusalOf(j({ refused: 'human_authorization_required' }))).toBe(NO_REFUSAL_SENTENCE);
  });

  it('`error` still wins, as before', () => {
    expect(refusalOf(j({ ok: false, error: 'offset 9 is beyond the document.', reason: 'other' }))).toBe(
      'offset 9 is beyond the document.',
    );
  });

  it('a check whose ok is its verdict is not a refusal: it did the check', () => {
    // check_grounding: claims without a citation marker are a finding.
    expect(refusalOf(j({ engine: 'x', ok: false, groundingScore: 0.5, ungroundedClaims: [{}], message: '1 of 2 UNGROUNDED' }))).toBeNull();
    // validate_docx: an invalid file is a finding.
    expect(refusalOf(j({ ok: false, docxPath: 'a.docx', validation: { ok: false }, message: 'INVALID .docx' }))).toBeNull();
    // verify_docx_against_source: a divergence is a finding.
    expect(refusalOf(j({ ok: false, missingRequiredStrings: ['x'], additions: 1, deletions: 0 }))).toBeNull();
    // A partial insertion reports what it applied.
    expect(refusalOf(j({ ok: false, engine: 'python-docx', applied: [{ status: 'not_found' }], message: 'Applied 0/1' }))).toBeNull();
  });

  it('is null for what never refused', () => {
    expect(refusalOf(j({ ok: true, steps: [] }))).toBeNull();
    expect(refusalOf(j({ refused: false, ok: true }))).toBeNull();
    expect(refusalOf('plain text answer')).toBeNull();
  });
});
