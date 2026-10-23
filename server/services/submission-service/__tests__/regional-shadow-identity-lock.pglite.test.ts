/** Existing waiver/disposition acts take the package identity locks in the same order as release. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any, calls: [] as string[],
  atSubmission: null as (() => Promise<void>) | null, atSequence: null as (() => Promise<void>) | null }));
vi.mock('../../../db', () => {
  const query = async (text: string, values?: unknown[]) => {
    holder.calls.push(text);
    if (/FROM submissions[\s\S]*FOR SHARE/.test(text) && holder.atSubmission) {
      const hook = holder.atSubmission; holder.atSubmission = null; await hook();
    }
    if (/FROM ectd_sequences[\s\S]*FOR UPDATE/.test(text) && holder.atSequence) {
      const hook = holder.atSequence; holder.atSequence = null; await hook();
    }
    const result = await holder.pglite.query(text, values);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  };
  return { get db() { return holder.db; }, pool: { query, connect: async () => ({ query, release: () => undefined }) } };
});
import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, type IndPgliteDb } from '../../../db/pglite-harness';
import { FREEZE_GATE_SEED_SQL, FREEZE_PROGRAM_ID, ORG, USER, freezeGateHelpers } from './_freeze-gate-fixture';
import { dispositionShadowFinding, waiveShadowReview } from '../submission-service';
let db: IndPgliteDb;
let nextId = 9400;
const { sign } = freezeGateHelpers(() => db);
const q = (text: string, values?: unknown[]) => db.pglite.query(text, values) as Promise<{ rows: any[] }>;
const ctx = { organizationId: ORG, userId: USER };
const outcome = (pending: Promise<unknown>) => pending.then(() => null, error => error);

async function scenario(act: 'waiver' | 'disposition') {
  const id = nextId++;
  await q(`INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id, application_number)
    VALUES ($1, 'Regional shadow act', 'ind', 'biotech', 'jp', $2, 2, $3, 'JP-123456')`, [id, ORG, FREEZE_PROGRAM_ID]);
  await q(`INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status)
    VALUES ($1, $1, 'jp', '0000', $2, 2, 'validated')`, [id, ORG]);
  const run = Number((await q(`INSERT INTO shadow_review_runs (sequence_id, status, failure_code, organization_id, created_by)
    VALUES ($1, $2, $3, $4, 2) RETURNING id`, [id, act === 'waiver' ? 'failed' : 'completed', act === 'waiver' ? 'provider_unavailable' : null, ORG])).rows[0].id);
  const signatureActionId = await sign(id, act === 'waiver' ? 'shadow-waiver' : 'shadow-finding-disposition', 'responsibility');
  let findingId = 0;
  if (act === 'disposition') {
    findingId = Number((await q(`INSERT INTO shadow_review_findings (run_id, dimension, severity, title, organization_id, created_by)
      VALUES ($1, 'rtf', 'critical', 'Recorded finding', $2, 2) RETURNING id`, [run, ORG])).rows[0].id);
    await q(`UPDATE c2c_ana_actions SET payload = payload || $2::jsonb WHERE id = $1`, [signatureActionId, JSON.stringify({ findingId, disposition: 'accepted' })]);
  }
  await q(`UPDATE electronic_signatures SET signature_purpose = 'Independent review of the recorded facts' WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [signatureActionId]);
  holder.calls.length = 0;
  return { id, signatureActionId, invoke: () => act === 'waiver'
    ? waiveShadowReview({ sequenceId: id, signatureActionId, failedRunId: run }, ctx)
    : dispositionShadowFinding({ sequenceId: id, signatureActionId, findingId, disposition: 'accepted' }, ctx) };
}
beforeAll(async () => {
  db = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true, shadowReview: true });
  holder.db = db.db; holder.pglite = db.pglite;
  await db.pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await db.pglite.exec(FREEZE_GATE_SEED_SQL);
  await db.pglite.exec(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS application_number TEXT;
    ALTER TABLE electronic_signatures ADD COLUMN IF NOT EXISTS signature_purpose TEXT, ADD COLUMN IF NOT EXISTS signer_name TEXT,
    ADD COLUMN IF NOT EXISTS signature_meaning TEXT, ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP DEFAULT NOW();`);
}, 120_000);
afterAll(async () => { await db?.close(); });

describe.each(['waiver', 'disposition'] as const)('regional %s identity serialization', act => {
  it('takes organization, submission, sequence, then program/sponsor before recording the act', async () => {
    const scenario_ = await scenario(act);
    await scenario_.invoke();
    const organization = holder.calls.findIndex(text => /FROM organizations[\s\S]*FOR SHARE/.test(text));
    const submission = holder.calls.findIndex(text => /FROM submissions[\s\S]*FOR SHARE/.test(text));
    const sequence = holder.calls.findIndex(text => /FROM ectd_sequences[\s\S]*FOR UPDATE/.test(text));
    const program = holder.calls.findIndex(text => /FROM regulatory_programs[\s\S]*FOR SHARE/.test(text));
    const sponsor = holder.calls.findIndex(text => /FROM ind_sponsors[\s\S]*FOR SHARE/.test(text));
    expect(organization).toBeGreaterThan(-1); expect(submission).toBeGreaterThan(organization);
    expect(sequence).toBeGreaterThan(submission); expect(program).toBeGreaterThan(sequence); expect(sponsor).toBeGreaterThan(program);
  }, 120_000);

  it.each(['missing', 'swapped'])('refuses a %s actual parent without recording the act', async problem => {
    const scenario_ = await scenario(act);
    if (problem === 'missing') holder.atSubmission = async () => { await q(`UPDATE submissions SET deleted_at = NOW() WHERE id = $1`, [scenario_.id]); };
    else holder.atSequence = async () => { await q(`UPDATE ectd_sequences SET submission_id = 1 WHERE id = $1`, [scenario_.id]); };
    expect(await outcome(scenario_.invoke())).toMatchObject({ code: 'INVALID_STATE' });
    holder.atSubmission = null; holder.atSequence = null;
    const action = act === 'waiver' ? 'SHADOW_REVIEW_WAIVED' : 'SHADOW_FINDING_DISPOSITIONED';
    expect((await q(`SELECT id FROM audit_logs WHERE action = $1 AND record_id = $2`, [action, String(scenario_.id)])).rows).toEqual([]);
  }, 120_000);
});
