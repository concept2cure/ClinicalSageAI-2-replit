/**
 * The export review gate says whose word an approval is: the caller's.
 *
 * Until 2026-10-15 an accepted export was stamped
 * `X-Concept2Cure-Human-Review-Approved: true`, `X-Concept2Cure-Reviewer:
 * <name>` and `X-Concept2Cure-Review-Timestamp: <ts>`. All three were free text
 * from the request body, checked for presence only, bound to no session user
 * and no Part 11 signature; `aiGenerated: false` was stamped `AI-Generated:
 * false` on the caller's word; and none of it was recorded, so nothing the
 * server can show was reviewed. The headers now name the values as asserted —
 * `X-Concept2Cure-Export-Authorization: caller-asserted-review`, the vocabulary
 * the Artifacts Center export uses for its persisted review state — and
 * `exportReviewAttestation` is what each route records in its export audit
 * row, bound to the authenticated user who made the assertion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as gate from '../exportReviewGate';
import { applyExportGovernanceHeaders, evaluateExportGovernance } from '../exportReviewGate';

const APPROVAL = {
  aiGenerated: true,
  humanReviewApproved: true,
  reviewerName: 'Dr. Jane Doe',
  reviewerRole: 'Regulatory Affairs Lead',
  reviewTimestamp: '2026-03-24T12:00:00.000Z',
};

function headersFor(rawGovernance: unknown): Map<string, string> {
  const evaluation = evaluateExportGovernance(rawGovernance);
  if (!evaluation.ok) throw new Error(`governance refused: ${evaluation.code}`);
  const headers = new Map<string, string>();
  applyExportGovernanceHeaders({ setHeader: (n: string, v: string) => headers.set(n, v) }, evaluation.governance);
  return headers;
}

const saved = { NODE_ENV: process.env.NODE_ENV, GATE: process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW };
beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;
});
afterEach(() => {
  process.env.NODE_ENV = saved.NODE_ENV;
  if (saved.GATE === undefined) delete process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;
  else process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = saved.GATE;
  vi.restoreAllMocks();
});

describe('export governance headers', () => {
  it('an accepted approval is not stamped as an approved human review', () => {
    const headers = headersFor(APPROVAL);
    expect(headers.has('X-Concept2Cure-Human-Review-Approved'), 'a caller assertion was stamped as an approved review').toBe(false);
    expect(headers.get('X-Concept2Cure-Export-Authorization')).toBe('caller-asserted-review');
    expect(headers.get('X-Concept2Cure-Review-Required')).toBe('true');
  });

  it('the reviewer and the review time are named as asserted, not as the reviewer of record', () => {
    const headers = headersFor(APPROVAL);
    expect(headers.has('X-Concept2Cure-Reviewer')).toBe(false);
    expect(headers.has('X-Concept2Cure-Review-Timestamp')).toBe(false);
    expect(headers.get('X-Concept2Cure-Asserted-Reviewer')).toBe('Dr.%20Jane%20Doe');
    expect(headers.get('X-Concept2Cure-Asserted-Review-Timestamp')).toBe('2026-03-24T12:00:00.000Z');
  });

  it('"not AI-generated" is the caller\'s word, and says so', () => {
    const headers = headersFor({ aiGenerated: false, humanReviewApproved: false });
    expect(headers.get('X-Concept2Cure-AI-Generated')).toBe('caller-asserted-false');
    expect(headers.get('X-Concept2Cure-Export-Authorization')).toBe('none');
  });

  it('with no governance block the export is treated as AI-generated and unauthorized', () => {
    const headers = headersFor(undefined);
    expect(headers.get('X-Concept2Cure-AI-Generated')).toBe('true');
    expect(headers.get('X-Concept2Cure-Export-Authorization')).toBe('none');
    expect(headers.has('X-Concept2Cure-Asserted-Reviewer')).toBe(false);
  });
});

describe('exportReviewAttestation — what the export audit row records', () => {
  it('records the assertion as an assertion, bound to the authenticated user who made it', () => {
    expect(typeof gate.exportReviewAttestation, 'nothing records the review assertion').toBe('function');
    const evaluation = evaluateExportGovernance(APPROVAL);
    if (!evaluation.ok) throw new Error('governance refused');
    expect(gate.exportReviewAttestation(evaluation.governance, 17)).toEqual({
      authorization: 'caller-asserted-review',
      assertedByUserId: 17,
      aiGenerated: true,
      reviewerName: 'Dr. Jane Doe',
      reviewerRole: 'Regulatory Affairs Lead',
      reviewTimestamp: '2026-03-24T12:00:00.000Z',
    });
  });

  it('an export with no approval records that nothing authorized it, and no reviewer', () => {
    const evaluation = evaluateExportGovernance({});
    if (!evaluation.ok) throw new Error('governance refused');
    expect(gate.exportReviewAttestation(evaluation.governance, 17)).toEqual({
      authorization: 'none',
      assertedByUserId: 17,
      aiGenerated: true,
      reviewerName: null,
      reviewerRole: null,
      reviewTimestamp: null,
    });
  });
});
