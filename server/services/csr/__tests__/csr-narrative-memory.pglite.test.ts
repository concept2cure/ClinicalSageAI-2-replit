/**
 * The narrative build off the request path (2026-10-30): memory does not grow
 * with the number of narratives. At the design scale target (5,000 subjects,
 * 1,000 narratives) no single statement the job sends or reads carries more
 * than a page of narrative text (the content column read, every parameter
 * sent): the resume and landing reads carry no text or one page, and §14.3.3 is written into csr_section_outputs in page-sized
 * chunks inside one transaction, its SHA-256 checked by the database against
 * the digest the job streamed. The landed text is byte-identical to the
 * whole-section composer's. Real migrations/20260628_csr_job_state.sql in
 * PGlite; SYNTHETIC data (support/adam-narrative-synthetic.ts).
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runNarrativeJob } from '../csr-narrative-job';
import { sqlNarrativeStore } from '../csr-narrative-store';
import { narrativesSection, type SectionNarrative } from '../narrative-section';
import { selectNarrativeSubjects } from '../narrative-subject-selection';
import { narrativeBundle, narrativeDatasets } from './support/adam-narrative-synthetic';

const SQL = readFileSync(path.resolve(__dirname, '../../../../migrations/20260628_csr_job_state.sql'), 'utf8');
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
let db: PGlite;
const traffic = { maxSent: 0, maxRead: 0 };
const textLength = (value: unknown): number => (typeof value === 'string' ? value.length
  : value && typeof value === 'object' ? Object.values(value).reduce<number>((n, v) => n + textLength(v), 0) : 0);
const q = {
  query: async (text: string, params?: unknown[]) => {
    traffic.maxSent = Math.max(traffic.maxSent, textLength(params ?? []));
    const result = await db.query<Record<string, unknown>>(text, params as never[]);
    if (/csr_narrative_outputs/.test(text)) traffic.maxRead = Math.max(traffic.maxRead, result.rows.reduce((n, r) => n + textLength(r.content), 0));
    return result;
  },
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations (id integer PRIMARY KEY); CREATE TABLE projects (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY); INSERT INTO organizations VALUES (7); INSERT INTO projects VALUES (11); INSERT INTO users VALUES (5);`);
  await db.exec(SQL);
  await db.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, requested_by) VALUES (1, 7, 11, 'SYN-LMN201-PROTOCOL', 'complete', 5)`);
});
afterAll(async () => { await db?.close(); });

describe('narrative build memory at 1,000 narratives (SYNTHETIC data)', () => {
  it('never moves more than a page of narrative text in one statement, and lands §14.3.3 byte-identical', async () => {
    const bundle = narrativeBundle();
    const datasets = narrativeDatasets(5000);
    const store = sqlNarrativeStore(q, { organizationId: 7, jobId: 1, projectId: 11 });
    const result = await runNarrativeJob({ bundle, datasets, store, protocolNumber: 'SYN-LMN201-PROTOCOL' });
    expect(result).toMatchObject({ status: 'complete', selected: 1000, composed: 1000, sections: { written: ['14.3.3', '12.3.2'] } });

    const { rows: saved } = await db.query<{ subject_id: string; content: string; qc: { armName: string; categories: SectionNarrative['categories']; events: string[] } }>(
      `SELECT subject_id, content, qc FROM csr_narrative_outputs WHERE job_id = 1 ORDER BY sequence`);
    const narratives = saved.map(r => ({ subjectId: r.subject_id, armName: r.qc.armName, categories: r.qc.categories, events: r.qc.events, text: r.content }));
    const expected = narrativesSection({ protocolNumber: 'SYN-LMN201-PROTOCOL', counts: result.counts,
      aesiDeclared: selectNarrativeSubjects(bundle, datasets).aesiDeclared, narratives });
    const { rows: [section] } = await db.query<{ content: string; content_hash: string }>(
      `SELECT content, content_hash FROM csr_section_outputs WHERE job_id = 1 AND section_number = '14.3.3'`);
    expect(section.content === expected).toBe(true);
    expect(section.content_hash).toBe(sha(expected));

    const page = expected.length / 10; // 1,000 narratives: a tenth of the section is 100 narratives' text
    console.info(`[SYNTHETIC memory] narratives=1000 section14_3_3_chars=${expected.length} maxSentChars=${traffic.maxSent} maxReadChars=${traffic.maxRead}`);
    expect(traffic.maxSent).toBeLessThan(page);
    expect(traffic.maxRead).toBeLessThan(page);

    // A resume reads no narrative text to decide what to skip, and lands again in pages.
    traffic.maxSent = 0; traffic.maxRead = 0;
    const again = await runNarrativeJob({ bundle, datasets, store, protocolNumber: 'SYN-LMN201-PROTOCOL' });
    expect(again).toMatchObject({ status: 'complete', resumed: 1000 });
    expect(traffic.maxSent).toBeLessThan(page);
    expect(traffic.maxRead).toBeLessThan(page);
  }, 180_000);
});
