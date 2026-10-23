/**
 * Sequence history reads ectd_submissions by its tenant column, org_id
 * (db/migrations/082_ectd_submission_agent.sql, in the deploy set).
 *
 * What it used to do (until 2026-10-15): it queried
 * ectd_submissions.organization_id, a column the migration does not create, so
 * every deploy hit 42703 and the source was dropped as "unscopable" — a
 * sequence recorded only there read as unused, and a duplicate could pass.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../../db.js', () => ({
  pool: { query },
  db: { execute: vi.fn(async () => ({ rows: [] })) },
}));

import { detectSequenceGaps } from '../ectd-validator-hardening';

const pgError = (code: string) => Object.assign(new Error(`pg ${code}`), { code });

beforeEach(() => query.mockReset());

describe('ectd_submissions history is read through org_id', () => {
  it('a sequence recorded only in ectd_submissions is a duplicate', async () => {
    // The deployed shape: org_id exists, organization_id does not.
    query.mockImplementation(async (sqlText: string) => {
      if (/ectd_submissions/.test(sqlText)) {
        if (/organization_id/.test(sqlText)) throw pgError('42703');
        return { rows: [{ sequence_number: '0000' }, { sequence_number: '0001' }] };
      }
      return { rows: [{ sequence_number: '0000' }] };
    });
    const findings = await detectSequenceGaps('IND123456', '0001', 42);
    expect(findings.some((f) => f.code === 'SEQ_DUPLICATE'), 'the ectd_submissions history was dropped').toBe(true);
  });

  it('an absent org_id column blocks, rather than dropping the history', async () => {
    query.mockImplementation(async (sqlText: string) => {
      if (/ectd_submissions/.test(sqlText)) throw pgError('42703');
      return { rows: [{ sequence_number: '0000' }] };
    });
    const findings = await detectSequenceGaps('IND123456', '0001', 42);
    expect(findings.some((f) => f.code === 'SEQ_QUERY_FAILED' && f.severity === 'error')).toBe(true);
  });
});
