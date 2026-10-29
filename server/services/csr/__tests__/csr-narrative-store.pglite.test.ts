/**
 * CSR slice 7: csr_narrative_outputs replays on every deploy (RULE 1), the job
 * persists and resumes per subject in it, lands §14.3.3 and §12.3.2 in
 * csr_section_outputs (keeping a §12.3.2 the drafter wrote), stops on a
 * cancelled build, and the QC list reads back. Real
 * migrations/20260628_csr_job_state.sql in PGlite; SYNTHETIC data.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runNarrativeJob } from '../csr-narrative-job';
import { readCsrNarrativeQc, sqlNarrativeStore } from '../csr-narrative-store';
import { narrativeBundle, narrativeDatasets } from './support/adam-narrative-synthetic';

const SQL = readFileSync(path.resolve(__dirname, '../../../../migrations/20260628_csr_job_state.sql'), 'utf8');
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
let db: PGlite;
const q = { query: async (text: string, params?: unknown[]) => db.query<Record<string, unknown>>(text, params as never[]) };
const store = (jobId: number) => sqlNarrativeStore(q, { organizationId: 7, jobId, projectId: 11 });
const run = (jobId: number, n = 60) => runNarrativeJob({ bundle: narrativeBundle(), datasets: narrativeDatasets(n), store: store(jobId), protocolNumber: 'SYN-LMN201-PROTOCOL' });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations (id integer PRIMARY KEY); CREATE TABLE projects (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY); INSERT INTO organizations VALUES (7), (8); INSERT INTO projects VALUES (11); INSERT INTO users VALUES (5);`);
  await db.exec(SQL);
  await db.exec(SQL); // every deploy re-runs the file
  for (const [id, org, status] of [[1, 7, 'complete'], [2, 7, 'complete'], [3, 7, 'cancelled'], [4, 7, 'complete']] as const) {
    await db.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, requested_by) VALUES ($1, $2, 11, 'SYN-LMN201-PROTOCOL', $3, 5)`, [id, org, status]);
  }
});
afterAll(async () => { await db?.close(); });

describe('csr_narrative_outputs (SYNTHETIC data)', () => {
  it('replays and enforces its row shape: a composed row has text and hash, a refused row has neither', async () => {
    await expect(db.query(`INSERT INTO csr_narrative_outputs (organization_id, job_id, subject_id, sequence, status, content, content_hash, facts_digest)
      VALUES (7, 1, 'X', 0, 'refused', 'text', 'h', 'd')`)).rejects.toThrow(/csr_narrative_outputs_content_check/);
  });

  it('persists, resumes and lands the sections; a drafted §12.3.2 is kept', async () => {
    const drafted = '§12.3.2 drafted by the build.';
    await db.query(`INSERT INTO csr_section_outputs (organization_id, project_id, job_id, section_number, content, content_hash, lineage)
      VALUES (7, 11, 2, '12.3.2', $1, $2, '{"source":"ai"}')`, [drafted, sha(drafted)]);
    const first = await run(1);
    expect(first.status).toBe('complete');
    expect(first.sections).toEqual({ written: ['14.3.3', '12.3.2'], kept: [] });
    const again = await run(1);
    expect(again.resumed).toBe(first.selected);
    expect(again.sections.written).toEqual(['14.3.3', '12.3.2']); // its own §12.3.2 is replaced
    const second = await run(2);
    expect(second.sections).toEqual({ written: ['14.3.3'], kept: ['12.3.2'] });
    const { rows } = await db.query<{ section_number: string; content: string; content_hash: string; ai_generated: boolean }>(
      `SELECT section_number, content, content_hash, ai_generated FROM csr_section_outputs WHERE job_id = 2 ORDER BY section_number`);
    expect(rows.find(r => r.section_number === '12.3.2')!.content).toBe(drafted);
    const s1433 = rows.find(r => r.section_number === '14.3.3')!;
    expect(s1433.content_hash).toBe(sha(s1433.content));
    expect(s1433.ai_generated).toBe(false);
  });

  it('stops on a cancelled build and saves nothing for it', async () => {
    const result = await run(3);
    expect(result.status).toBe('stopped');
    expect((await db.query(`SELECT count(*)::int AS n FROM csr_narrative_outputs WHERE job_id = 3`)).rows[0]).toEqual({ n: 0 });
  });

  it('reads the QC list without the narrative text, organization-scoped', async () => {
    const qc = await readCsrNarrativeQc(q, 7, 1);
    expect(qc.length).toBeGreaterThan(0);
    expect(qc[0]).toMatchObject({ status: 'composed', qc: { prose: 'template' } });
    expect(qc[0]).not.toHaveProperty('content');
    expect(await readCsrNarrativeQc(q, 8, 1)).toEqual([]);
  });

  it('SYNTHETIC scale through the database: 1,000 subjects, 200 narratives persisted one by one, then resumed', async () => {
    const started = performance.now();
    const result = await run(4, 1000);
    const firstMs = performance.now() - started;
    expect(result).toMatchObject({ status: 'complete', selected: 200, composed: 200 });
    const resumedAt = performance.now();
    const again = await run(4, 1000);
    const resumeMs = performance.now() - resumedAt;
    expect(again.resumed).toBe(200);
    expect(firstMs).toBeLessThan(60_000);
    console.info(`[SYNTHETIC scale, PGlite] subjects=1000 narratives=${result.selected} firstRunMs=${Math.round(firstMs)} resumeMs=${Math.round(resumeMs)}`);
  }, 120_000);
});
