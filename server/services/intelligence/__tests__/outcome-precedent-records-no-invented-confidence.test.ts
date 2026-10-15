/**
 * A precedent minted from a submission outcome records no confidence, because
 * nothing measured one.
 *
 * ingestOutcomeAsPrecedent stored precedent.regulatory_precedents.confidence_score
 * = 0.5 + 0.08 × (count of five record fields present): a recognised decision,
 * a decision date, FDA questions, risk factors, an embedding. That is how
 * complete the record is, with a floor of 0.5, and the precedent engine
 * presents the column as the precedent's confidence. The fields themselves are
 * stored on the row, so nothing is lost by leaving the column NULL — which the
 * engine already reads as "no confidence recorded".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPool } from '../../../../tests/setup';

vi.mock('../../../db/runtime', () => ({ pool: mockPool, getPool: () => mockPool, db: mockPool, getDb: () => mockPool }));

const { ingestOutcomeAsPrecedent } = await import('../outcome-precedent-ingestor');

const OUTCOME = {
  outcome_id: 'o-1',
  program_id: 'p-1',
  submission_id: null,
  submission_type: 'NDA',
  agency: 'FDA',
  outcome_status: 'complete_response',
  outcome_date: '2026-03-01',
  submitted_at: '2025-05-01',
  questions_received: 31,
  deficiencies_cited: 7,
  had_rtf: false,
  had_advisory_committee: true,
  questions_detail: ['Justify the dissolution specification'],
  deficiencies_detail: [],
  therapeutic_area: 'oncology',
  organization_id: 7,
  product_type: null,
  device_class: null,
  indication: null,
};

let precedentParams: unknown[] | null = null;

beforeEach(() => {
  precedentParams = null;
  mockPool.query.mockReset().mockImplementation((text: string, params: unknown[] = []) => {
    if (/FROM innovation\.submission_outcomes/.test(text)) return Promise.resolve({ rows: [OUTCOME] });
    if (/INSERT INTO precedent\.regulatory_precedents/.test(text)) {
      precedentParams = params;
      return Promise.resolve({ rows: [{ id: 'prec-1' }] });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
});

describe('ingestOutcomeAsPrecedent', () => {
  it('stores a NULL confidence_score, not record completeness relabelled as confidence', async () => {
    const result = await ingestOutcomeAsPrecedent({ embedFn: async () => [0.1, 0.2] });
    expect(result.ingested).toBe(1);
    // confidence_score is $12.
    expect(precedentParams?.[11]).toBeNull();
  });

  it('still records the facts the old figure counted, on their own columns', async () => {
    await ingestOutcomeAsPrecedent({ embedFn: async () => [0.1, 0.2] });
    expect(precedentParams?.[5]).toBe('2026-03-01'); // decision_date
    expect(precedentParams?.[6]).toBe('CRL'); // decision_outcome
    expect(JSON.parse(String(precedentParams?.[7]))).toEqual(['Justify the dissolution specification']);
    expect(precedentParams?.[9]).toBe('[0.1,0.2]'); // embedding
  });
});
