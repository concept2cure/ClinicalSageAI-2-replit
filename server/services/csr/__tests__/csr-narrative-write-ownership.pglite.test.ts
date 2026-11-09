/** Real SQL/transactions against the deployed CSR migration in PGlite.
 * Not a claim about multiple native PostgreSQL connections or production RLS. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { sqlNarrativeStore, type NarrativeQueryable } from '../csr-narrative-store';
import type { NarrativeSectionRow, SavedNarrative } from '../csr-narrative-job';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const scope = { organizationId: 7, jobId: 41, projectId: 11,
  narrativeAttempt: { runId: 91, attempt: 1 } };
const row = (text: string): SavedNarrative => ({ subjectId: 'SYN-1', sequence: 0,
  status: 'composed', content: text, contentHash: sha(text), factsDigest: 'e'.repeat(64),
  qc: { armName: 'Synthetic arm', categories: ['death'], events: [], missingFields: [], prose: 'template' } });
let db: PGlite;
const q: NarrativeQueryable = { query: (sql, params) => db.query<Record<string, unknown>>(sql, params as never[]) };
const store = () => sqlNarrativeStore(q, scope);
function sections(fail = false) {
  const crossReference: NarrativeSectionRow = { sectionNumber: '12.3.2',
    content: 'See retained narratives.', contentHash: sha('See retained narratives.'),
    lineage: { composer: 'csr-narrative-job' } };
  return { narratives: { sectionNumber: '14.3.3' as const, lineage: { composer: 'csr-narrative-job' },
    chunks: (async function* () { yield 'Synthetic opening\n'; if (fail) throw Error('stream interrupted'); yield 'Synthetic narrative\n'; })() }, crossReference };
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations(id integer PRIMARY KEY);
    CREATE TABLE projects(id integer PRIMARY KEY); CREATE TABLE users(id integer PRIMARY KEY);
    INSERT INTO organizations VALUES(7),(8); INSERT INTO projects VALUES(11); INSERT INTO users VALUES(5);`);
  await db.exec(readFileSync(path.resolve(__dirname, '../../../../migrations/20260628_csr_job_state.sql'), 'utf8'));
});
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`TRUNCATE csr_build_jobs CASCADE;
    INSERT INTO csr_build_jobs(id,organization_id,project_id,study_id,status,requested_by)
      VALUES(41,7,11,'SYN-PROTOCOL','complete',5);
    INSERT INTO csr_narrative_runs(id,organization_id,job_id,requested_by,status,attempt)
      VALUES(91,7,41,5,'running',1);`);
});

it('writes verified narrative text and both final sections on the current claimed attempt', async () => {
  expect(await store().save(row('Current narrative'))).toBe(true);
  expect(await store().writeSections(sections())).toEqual({ written: ['14.3.3', '12.3.2'], kept: [] });
  const saved = await db.query<{ content: string; content_hash: string }>(
    `SELECT content, content_hash FROM csr_section_outputs WHERE job_id=41 AND section_number='14.3.3'`);
  expect(saved.rows[0]).toEqual({ content: 'Synthetic opening\nSynthetic narrative\n', content_hash: sha('Synthetic opening\nSynthetic narrative\n') });
});

it('refuses a late save and landing after the same run is claimed under another attempt', async () => {
  expect(await store().save(row('Original narrative'))).toBe(true);
  await db.exec(`UPDATE csr_narrative_runs SET attempt=2 WHERE id=91`);
  const newer = sqlNarrativeStore(q, { ...scope, narrativeAttempt: { runId: 91, attempt: 2 } });
  expect(await newer.save(row('Replacement narrative'))).toBe(true);
  expect(await store().save(row('Obsolete response'))).toBe(false);
  await expect(store().writeSections(sections())).rejects.toMatchObject({ code: 'CSR_NARRATIVE_BUILD_NOT_RUNNABLE' });
  const saved = await db.query(`SELECT content FROM csr_narrative_outputs WHERE job_id=41`);
  expect(saved.rows).toEqual([{ content: 'Replacement narrative' }]);
  expect((await db.query('SELECT id FROM csr_section_outputs')).rows).toHaveLength(0);
});

it('cancellation after the final heartbeat prevents section writes and retains earlier narratives', async () => {
  expect(await store().save(row('Keep this narrative'))).toBe(true);
  await db.exec(`UPDATE csr_build_jobs SET status='cancelled' WHERE id=41`);
  await expect(store().writeSections(sections())).rejects.toMatchObject({ code: 'CSR_NARRATIVE_BUILD_NOT_RUNNABLE' });
  expect(await store().save(row('Should not land'))).toBe(false);
  expect((await db.query('SELECT content FROM csr_narrative_outputs')).rows).toEqual([{ content: 'Keep this narrative' }]);
  expect((await db.query('SELECT id FROM csr_section_outputs')).rows).toHaveLength(0);
});

it('rolls back the provisional narrative section when its stream fails', async () => {
  await store().writeSections(sections());
  const before = await db.query('SELECT section_number, content, content_hash FROM csr_section_outputs ORDER BY section_number');
  await expect(store().writeSections(sections(true))).rejects.toThrow('stream interrupted');
  expect((await db.query('SELECT section_number, content, content_hash FROM csr_section_outputs ORDER BY section_number')).rows).toEqual(before.rows);
});

it('foreign organization cannot save or land into the selected build', async () => {
  const other = sqlNarrativeStore(q, { ...scope, organizationId: 8 });
  expect(await other.save(row('Foreign text'))).toBe(false);
  await expect(other.writeSections(sections())).rejects.toMatchObject({ code: 'CSR_NARRATIVE_BUILD_NOT_RUNNABLE' });
  expect((await db.query('SELECT id FROM csr_narrative_outputs')).rows).toHaveLength(0);
});
