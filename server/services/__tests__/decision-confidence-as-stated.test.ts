/**
 * A decision record carries the confidence its decider stated, or none.
 *
 * decision-lifecycle-service wrote confidence_level 'high' for a decision with
 * more than two source signals and 'moderate' otherwise — a count, recorded
 * as a confidence. decision-record-service defaulted every other record to
 * 'moderate', and createDecision asserted evidence_basis 'expert_judgment'
 * whatever produced the decision — an SAP generator included. The column was
 * NOT NULL DEFAULT 'moderate', so "nobody said" could not be recorded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const H = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: H.query } }));
vi.mock('../../db', () => ({ pool: { query: H.query } }));

import { decisionLifecycleService } from '../decision-lifecycle-service';
import { decisionRecordService } from '../decision-record-service';

/** The confidence_level and evidence_basis bound into each decision_records INSERT. */
const inserted = () => H.query.mock.calls
  .filter(([sql]) => /INSERT INTO decision_records/.test(String(sql)))
  .map(([, p]) => ({ confidence: (p as unknown[])[8], basis: (p as unknown[])[9] }));

beforeEach(() => {
  H.query.mockReset();
  H.query.mockImplementation(async (sql: string) =>
    /INSERT INTO decision_records/.test(sql)
      ? { rows: [{ id: '00000000-0000-0000-0000-000000000001', created_at: new Date(), updated_at: new Date() }], rowCount: 1 }
      : { rows: [], rowCount: 1 });
});

describe('the decision lifecycle', () => {
  it('records no confidence for a formal decision, however many source signals it has', async () => {
    await decisionLifecycleService.recordGovernedActionDecision({
      projectId: '42', organizationId: 77, kind: 'promotion-decision', governedAction: 'approve-artifact',
      summary: 'Approve section 3.2.P.5', rationale: 'All checks cleared',
      sourceSignals: ['a', 'b', 'c', 'd'] as never, createdByType: 'human', createdById: 'u1',
    } as never);
    expect(inserted()).toEqual([{ confidence: null, basis: null }]);
  });
});

describe('decisionRecordService.createDecision', () => {
  const base = { organizationId: 3, projectId: 12, recommendationType: 'statistical_method', recommendationSummary: 'N=120' };

  it("records neither a confidence nor an evidence basis nobody stated", async () => {
    await decisionRecordService.createDecision(base);
    expect(inserted()).toEqual([{ confidence: null, basis: null }]);
  });

  it('records what the caller stated', async () => {
    await decisionRecordService.createDecision({ ...base, confidence: 'low', evidenceBasis: 'rules_based' });
    expect(inserted()).toEqual([{ confidence: 'low', basis: 'rules_based' }]);
  });
});

describe('decision_records.confidence_level', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'db/migrations/20260323_assumption_decision_contradiction.sql'), 'utf8');
  const column = async (pg: PGlite) => (await pg.query<{ is_nullable: string; column_default: string | null }>(
    `SELECT is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'decision_records' AND column_name = 'confidence_level'`)).rows[0];
  const UNSTATED = `INSERT INTO decision_records (organization_id, project_id, decision_code, title, domain_track,
      recommendation_type, recommendation_summary, decided_by)
    VALUES (3, 12, 'D-1', 'T', 'regulatory', 'statistical_method', 'S', 'u1') RETURNING confidence_level`;

  it('is nullable with no default on a fresh install', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(sql);
      expect(await column(pg)).toEqual({ is_nullable: 'YES', column_default: null });
      expect((await pg.query<{ confidence_level: string | null }>(UNSTATED)).rows[0].confidence_level).toBeNull();
    } finally {
      await pg.close();
    }
  }, 60_000);

  it('becomes so on a database provisioned NOT NULL DEFAULT moderate, every deploy', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(sql);
      await pg.exec(`UPDATE decision_records SET confidence_level = 'moderate';
        ALTER TABLE decision_records ALTER COLUMN confidence_level SET DEFAULT 'moderate',
                                     ALTER COLUMN confidence_level SET NOT NULL`);
      expect(await column(pg)).toEqual({ is_nullable: 'NO', column_default: "'moderate'::text" });
      for (let deploy = 0; deploy < 2; deploy++) await pg.exec(sql);
      expect(await column(pg)).toEqual({ is_nullable: 'YES', column_default: null });
      expect((await pg.query<{ confidence_level: string | null }>(UNSTATED)).rows[0].confidence_level).toBeNull();
    } finally {
      await pg.close();
    }
  }, 60_000);
});
