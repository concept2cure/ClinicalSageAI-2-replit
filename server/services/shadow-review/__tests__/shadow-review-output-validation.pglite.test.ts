/**
 * A Shadow Review run is complete only when the model returned an assessment
 * the dispatch gate can count.
 *
 * 2026-09-22 (W5/D7). Only a JSON.parse error failed a run. Valid JSON with no
 * `findings` array became `findings = []` and a status of 'complete' — the
 * review produced no assessment, and transmit Gate 2 read it as a clean one.
 * Severity was stored verbatim, while the gate counts `severity = 'critical'`
 * exactly, so a model's 'Critical' was persisted and never blocked anything.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, reply: '' }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));
vi.mock('../../ai-gateway', () => ({ getGateway: () => ({ route: async () => ({ model: 'm', content: holder.reply }) }) }));

import { runShadowReview } from '../shadow-review-service';

let h: IndPgliteDb;
const ORG = 7;
const USER = 3;

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true });
  holder.db = h.db;
  await h.pglite.exec(`
    CREATE TABLE shadow_review_runs (id serial PRIMARY KEY, sequence_id int NOT NULL, region text NOT NULL, lens text NOT NULL DEFAULT 'fda_filing', model text, prompt_version text, status text NOT NULL DEFAULT 'running', rtf_risk_score real, crl_risk_score real, summary text, organization_id int NOT NULL, created_by int NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
    CREATE TABLE shadow_review_findings (id serial PRIMARY KEY, run_id int NOT NULL, dimension text NOT NULL, severity text NOT NULL, title text NOT NULL, detail text, basis text, recommendation text, leaf_ref text, status text NOT NULL DEFAULT 'open', organization_id int NOT NULL, created_by int NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz);
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by) VALUES
      (1,'A','ind','biotech','fda',${ORG},${USER}), (2,'B','ind','biotech','fda',${ORG},${USER}),
      (3,'C','ind','biotech','fda',${ORG},${USER}), (4,'D','ind','biotech','fda',${ORG},${USER});
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by) VALUES
      (1,1,'fda','0000',${ORG},${USER}), (2,2,'fda','0000',${ORG},${USER}),
      (3,3,'fda','0000',${ORG},${USER}), (4,4,'fda','0000',${ORG},${USER});
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, organization_id, created_by) VALUES
      (1,'m2.5','CO','new',${ORG},${USER}), (2,'m2.5','CO','new',${ORG},${USER}),
      (3,'m2.5','CO','new',${ORG},${USER}), (4,'m2.5','CO','new',${ORG},${USER});
  `);
});

afterAll(async () => {
  await h.close();
});

/** The two numbers dispatch readiness reads (assess-dispatch-readiness.ts). */
async function gateInputs(seq: number) {
  const runs = await h.pglite.query<{ n: number }>(
    `SELECT count(*)::int n FROM shadow_review_runs WHERE sequence_id=$1 AND organization_id=$2 AND status='complete' AND deleted_at IS NULL`,
    [seq, ORG],
  );
  const crit = await h.pglite.query<{ n: number }>(
    `SELECT count(*)::int n FROM shadow_review_findings f JOIN shadow_review_runs r ON f.run_id=r.id
      WHERE r.sequence_id=$1 AND f.organization_id=$2 AND f.severity='critical' AND f.status='open'
        AND f.deleted_at IS NULL AND r.deleted_at IS NULL`,
    [seq, ORG],
  );
  return { completedRuns: runs.rows[0].n, openCriticals: crit.rows[0].n };
}

describe('runShadowReview — only a countable assessment completes a run', () => {
  it('fails a reply with no findings array instead of completing a run with 0 criticals', async () => {
    holder.reply = '{"summary":"Reviewed.","rtfRiskScore":0.9,"crlRiskScore":0.9}';
    await expect(runShadowReview({ sequenceId: 1, organizationId: ORG, userId: USER })).rejects.toMatchObject({
      code: 'INVALID_AI_RESPONSE',
    });
    expect(await gateInputs(1)).toEqual({ completedRuns: 0, openCriticals: 0 });
  });

  it('counts a "Critical" finding as critical', async () => {
    holder.reply = '{"findings":[{"dimension":"RTF","severity":"Critical","title":"Form 1571 missing"}],"summary":"s"}';
    await runShadowReview({ sequenceId: 2, organizationId: ORG, userId: USER });
    expect(await gateInputs(2)).toEqual({ completedRuns: 1, openCriticals: 1 });
  });

  it('fails a reply whose severity is not one the gate knows', async () => {
    holder.reply = '{"findings":[{"dimension":"rtf","severity":"severe","title":"Form 1571 missing"}],"summary":"s"}';
    await expect(runShadowReview({ sequenceId: 3, organizationId: ORG, userId: USER })).rejects.toMatchObject({
      code: 'INVALID_AI_RESPONSE',
    });
    expect(await gateInputs(3)).toEqual({ completedRuns: 0, openCriticals: 0 });
  });

  it('completes a run whose model returned an explicit, empty findings list', async () => {
    holder.reply = '{"findings":[],"summary":"No issues found."}';
    await runShadowReview({ sequenceId: 4, organizationId: ORG, userId: USER });
    expect(await gateInputs(4)).toEqual({ completedRuns: 1, openCriticals: 0 });
  });
});
