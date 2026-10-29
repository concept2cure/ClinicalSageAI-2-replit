/**
 * The narrative build on the CSR build's queue (2026-10-30): the worker claims
 * a queued run, writes subjects done of total, and records the outcome. A
 * worker that dies mid-run (its connection lost, so it cannot record its end)
 * leaves the run running; once it has made no progress for
 * NARRATIVE_STALL_MINUTES it reads as stalled, the next request takes the same
 * run over under a new attempt, and the job resumes per subject without
 * composing a verified narrative again. A superseded attempt cannot record an
 * outcome. A cancelled build stops the run, which is recorded as cancelled and
 * lands nothing. Real migrations/20260628_csr_job_state.sql in PGlite (replayed
 * twice); SYNTHETIC data (support/adam-narrative-synthetic.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ tables: vi.fn(), adam: vi.fn() }));
vi.mock('../saved-clinical-tables.js', () => ({ readSavedClinicalTables: h.tables }));
vi.mock('../vault-source-input.js', () => ({ readCsrAdamDatasets: h.adam }));
import { buildCsrNarratives, type NarrativeQueryable } from '../csr-narrative-store';
import { enqueueNarrativeRun, readLatestNarrativeRun, runNarrativeRun, type CsrNarrativeWorkerDeps } from '../csr-narrative-run';
import { narrativeBundle, narrativeDatasets } from './support/adam-narrative-synthetic';

const SQL = readFileSync(path.resolve(__dirname, '../../../../migrations/20260628_csr_job_state.sql'), 'utf8');
const PROTOCOL = 'SYN-LMN201-PROTOCOL';
const RUN = '0b9f3c1e-6a4d-4b7e-9c2a-5d1e8f7a6b31';
const PROGRAM = '11111111-2222-4333-8444-000000000011';
const receipt = { documentId: '11111111-2222-4333-8444-000000000099', sha256: 'e'.repeat(64), studyId: 'SYN-NARR', protocolNumber: PROTOCOL };
let db: PGlite;
const q: NarrativeQueryable = { query: (text, params) => db.query<Record<string, unknown>>(text, params as never[]) };

/** The worker's connection; `dieAfterSaves` loses it after that many narratives are saved (the process died). */
function deps(opts: { dieAfterSaves?: number; onSave?: (n: number) => Promise<void> } = {}): CsrNarrativeWorkerDeps & { composed: () => number } {
  let saves = 0;
  let dead = false;
  const client: NarrativeQueryable = {
    async query(text, params) {
      const saving = /INSERT INTO csr_narrative_outputs/.test(text);
      if (saving && saves >= (opts.dieAfterSaves ?? Infinity)) dead = true;
      if (dead) throw new Error('Connection terminated unexpectedly'); // nothing more reaches the database, not even the outcome
      const result = await q.query(text, params);
      if (saving) { saves++; await opts.onSave?.(saves); }
      return result;
    },
  };
  return { withOrganization: (_org, fn) => fn(client as never), build: buildCsrNarratives, composed: () => saves };
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations (id integer PRIMARY KEY); CREATE TABLE projects (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY); INSERT INTO organizations VALUES (7); INSERT INTO projects VALUES (11); INSERT INTO users VALUES (5), (6);`);
  await db.exec(SQL);
  await db.exec(SQL); // every deploy re-runs the file
  const bound = JSON.stringify({ studyInfo: { protocolNumber: PROTOCOL }, evidenceSource: { programId: PROGRAM, runId: RUN, studyId: 'SYN-NARR' } });
  for (const id of [1, 2, 3]) {
    await db.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by)
      VALUES ($1, 7, 11, $2, 'complete', $3, 5)`, [id, PROTOCOL, bound]);
  }
});
afterAll(async () => { await db?.close(); });
beforeEach(() => {
  h.tables.mockReset().mockResolvedValue({ runId: RUN, programId: PROGRAM, studies: [{ source: receipt, tables: {} }] });
  h.adam.mockReset().mockResolvedValue({ bundle: narrativeBundle(), datasets: narrativeDatasets(400), componentsApproved: true });
});

describe('narrative run on the CSR build queue (SYNTHETIC data)', () => {
  it('a worker that dies mid-run is stalled, taken over by the next request, and resumes without recomposing verified subjects', async () => {
    const first = await enqueueNarrativeRun(q, { organizationId: 7, userId: 5, jobId: 1 });
    const dying = deps({ dieAfterSaves: 30 });
    await expect(runNarrativeRun(first.runId, 7, dying)).rejects.toThrow(/Connection terminated/);
    const dead = await readLatestNarrativeRun(q, 7, 1);
    expect(dead).toMatchObject({ id: first.runId, status: 'running', attempt: 1, stalled: false, subjectsTotal: 80 });
    expect(dead!.subjectsDone).toBeLessThanOrEqual(30);

    // Before it is stale, a second request is refused: the run may still be alive.
    await expect(enqueueNarrativeRun(q, { organizationId: 7, userId: 6, jobId: 1 })).rejects.toMatchObject({ code: 'CSR_NARRATIVE_BUILD_IN_PROGRESS', runId: first.runId });
    await db.query(`UPDATE csr_narrative_runs SET updated_at = now() - interval '6 minutes' WHERE id = $1`, [first.runId]);
    expect(await readLatestNarrativeRun(q, 7, 1)).toMatchObject({ status: 'running', stalled: true });
    const { rows: before } = await db.query<{ subject_id: string; updated_at: string }>(`SELECT subject_id, updated_at::text FROM csr_narrative_outputs WHERE job_id = 1`);
    expect(before).toHaveLength(30);

    const taken = await enqueueNarrativeRun(q, { organizationId: 7, userId: 6, jobId: 1 });
    expect(taken).toEqual({ runId: first.runId, status: 'queued', resumed: true });
    const healthy = deps();
    await runNarrativeRun(taken.runId, 7, healthy);
    const done = await readLatestNarrativeRun(q, 7, 1);
    expect(done).toMatchObject({ status: 'complete', attempt: 2, subjectsDone: 80, subjectsTotal: 80, stalled: false,
      result: { status: 'complete', selected: 80, resumed: 30, sections: { written: ['14.3.3', '12.3.2'] } } });
    expect(healthy.composed()).toBe(50); // only the 50 not saved before the crash
    const { rows: after } = await db.query<{ subject_id: string; updated_at: string }>(`SELECT subject_id, updated_at::text FROM csr_narrative_outputs WHERE job_id = 1 AND subject_id = ANY($1)`, [before.map(r => r.subject_id)]);
    expect(Object.fromEntries(after.map(r => [r.subject_id, r.updated_at]))).toEqual(Object.fromEntries(before.map(r => [r.subject_id, r.updated_at])));
    expect(h.tables).toHaveBeenLastCalledWith(expect.anything(), { organizationId: 7, userId: 6, programId: PROGRAM }, RUN);
  });

  it('a superseded attempt cannot record an outcome', async () => {
    const queued = await enqueueNarrativeRun(q, { organizationId: 7, userId: 5, jobId: 2 });
    // The first worker is still composing when the run is taken over and claimed by a second.
    const slow = deps({ onSave: async n => {
      if (n !== 5) return;
      await db.query(`UPDATE csr_narrative_runs SET status = 'queued', updated_at = now() WHERE id = $1`, [queued.runId]);
      await db.query(`UPDATE csr_narrative_runs SET status = 'running', attempt = attempt + 1 WHERE id = $1`, [queued.runId]);
    } });
    await runNarrativeRun(queued.runId, 7, slow);
    expect(await readLatestNarrativeRun(q, 7, 2)).toMatchObject({ status: 'running', attempt: 2, result: null });
    expect(slow.composed()).toBeLessThan(80); // its next progress write was refused, so it stopped
  });

  it('a cancelled build stops the run, which is recorded as cancelled and lands nothing', async () => {
    const queued = await enqueueNarrativeRun(q, { organizationId: 7, userId: 5, jobId: 3 });
    const cancelling = deps({ onSave: async n => { if (n === 10) await db.query(`UPDATE csr_build_jobs SET status = 'cancelled' WHERE id = 3`); } });
    await runNarrativeRun(queued.runId, 7, cancelling);
    expect(await readLatestNarrativeRun(q, 7, 3)).toMatchObject({ status: 'cancelled', error: { code: 'CSR_NARRATIVE_BUILD_NOT_RUNNABLE' } });
    expect((await db.query(`SELECT count(*)::int AS n FROM csr_section_outputs WHERE job_id = 3`)).rows[0]).toEqual({ n: 0 });
    expect((await db.query(`SELECT count(*)::int AS n FROM csr_narrative_outputs WHERE job_id = 3`)).rows[0]).toEqual({ n: 10 });
    await expect(enqueueNarrativeRun(q, { organizationId: 7, userId: 5, jobId: 3 })).rejects.toMatchObject({ code: 'CSR_NARRATIVE_BUILD_NOT_RUNNABLE' });
  });
});
