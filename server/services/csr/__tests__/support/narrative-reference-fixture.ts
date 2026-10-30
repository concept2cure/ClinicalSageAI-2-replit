/**
 * §14.3.3 by reference (2026-10-30): a SYNTHETIC CSR build in PGlite whose
 * narratives are saved and landed through the real SQL store
 * (csr-narrative-store.ts sqlNarrativeStore: csr_narrative_outputs, and
 * §14.3.3 streamed into csr_section_outputs with its database-checked digest),
 * at any size. Every subject, event and sentence is invented. Tests and the
 * scale measurement only.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { NARRATIVE_COMPOSER, type SavedNarrative } from '../../csr-narrative-job';
import { sqlNarrativeStore } from '../../csr-narrative-store';
import { narrativeSectionBlock, narrativesSectionHead } from '../../narrative-section';

const SQL = readFileSync(fileURLToPath(new URL('../../../../../migrations/20260628_csr_job_state.sql', import.meta.url)), 'utf8');
export const PROGRAM = '11111111-1111-4111-8111-111111111111';
export const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
export const subjectOf = (i: number) => `SYN-${String(i + 1).padStart(5, '0')}`;

export type Q = { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

/** The tables the import's access checks read, then the real CSR job migration (replayed, as every deploy does). */
export async function narrativeDatabase(): Promise<{ pg: PGlite; q: Q }> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id int,deleted_at timestamptz);
    CREATE TABLE users(id int PRIMARY KEY,status text);
    CREATE TABLE organizations(id int PRIMARY KEY,status text);
    CREATE TABLE organization_users(user_id int,organization_id int,role text);
    CREATE TABLE projects(id int PRIMARY KEY,organization_id int,owner_id int,created_by_id int,settings json,regulatory_program_id uuid,client_workspace_id int);
    CREATE TABLE project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_artifacts(id int,artifact_id text,organization_id int,project_id int);
    CREATE TABLE concept2cure_review_assignments(artifact_id int,organization_id int,reviewer_id int,status text);
    INSERT INTO regulatory_programs VALUES('${PROGRAM}',7,NULL);
    INSERT INTO users VALUES(5,'active');
    INSERT INTO organizations VALUES(7,'active');
    INSERT INTO organization_users VALUES(5,7,'member');
    INSERT INTO projects VALUES(11,7,5,5,'{}','${PROGRAM}',NULL);
    INSERT INTO project_visibility_settings VALUES(11,7,'private');`);
  await pg.exec(SQL);
  await pg.exec(SQL);
  const q: Q = { query: async (text, params) => pg.query<Record<string, unknown>>(text, params as never[]) };
  return { pg, q };
}

/** One invented narrative of about `length` characters. */
function narrative(i: number, n: number, length: number): SavedNarrative {
  const sentence = `On synthetic study day ${(i % 97) + 1}, subject ${subjectOf(i)} had an invented serious adverse event that resolved. `;
  const content = sentence.repeat(Math.max(1, Math.ceil(length / sentence.length))).trim();
  return { subjectId: subjectOf(i), sequence: i, status: 'composed', content, contentHash: sha(content), factsDigest: sha(`facts-${i}`),
    qc: { armName: i < n / 2 ? 'Synthetic active 10 mg' : 'Synthetic placebo', categories: ['serious'], events: ['Invented event'], missingFields: [], prose: 'template' } };
}

export interface LandedBuild { jobId: number; narratives: number; landedLength: number; landedSha256: string; rows: SavedNarrative[] | null }

/**
 * Build `jobId` with `n` composed narratives of about `length` characters each,
 * saved one at a time and §14.3.3 landed a page at a time, as the narrative job does.
 * `keepRows` false keeps no narrative text in memory (the scale measurement).
 */
export async function landSyntheticBuild(q: Q, jobId: number, n: number, opts: { length?: number; keepRows?: boolean; inline?: Array<{ code: string; content: string }> } = {}): Promise<LandedBuild> {
  const length = opts.length ?? 1_400;
  const bound = JSON.stringify({ studyInfo: { title: 'Synthetic narrative-scale study', protocolNumber: 'SYN-LMN201-B' },
    evidenceSource: { programId: PROGRAM, runId: 'run-41', studyId: 'SYN-LMN201-B' } });
  await q.query(`INSERT INTO csr_build_jobs (id, organization_id, project_id, study_id, status, study_info_snapshot, requested_by)
    VALUES ($1, 7, 11, 'SYN-LMN201-B', 'complete', $2, 5)`, [jobId, bound]);
  const store = sqlNarrativeStore(q, { organizationId: 7, jobId, projectId: 11 });
  for (let i = 0; i < n; i++) if (!await store.save(narrative(i, n, length))) throw new Error('SYNTHETIC fixture: save refused');
  const head = { protocolNumber: 'SYN-LMN201-B', counts: { death: 0, serious: n, discontinuation: 0, aesi: 0 }, aesiDeclared: false, subjects: n };
  const digest = createHash('sha256');
  let landedLength = 0;
  async function* chunks() {
    const opening = narrativesSectionHead(head);
    digest.update(opening); landedLength += opening.length;
    yield opening;
    for (let start = 0; start < n; start += 50) {
      const page = Array.from({ length: Math.min(50, n - start) }, (_, k) => narrative(start + k, n, length))
        .map(r => narrativeSectionBlock({ subjectId: r.subjectId, armName: r.qc.armName, categories: r.qc.categories, events: r.qc.events, text: r.content! })).join('');
      digest.update(page); landedLength += page.length;
      yield page;
    }
  }
  const lineage = { composer: NARRATIVE_COMPOSER, prose: ['template'], subjects: n };
  const cross = 'The narratives are presented in Section 14.3.3, in treatment-group and subject order.';
  await store.writeSections({ narratives: { sectionNumber: '14.3.3', chunks: chunks(), lineage },
    crossReference: { sectionNumber: '12.3.2', content: cross, contentHash: sha(cross), lineage } });
  for (const [i, s] of (opts.inline ?? []).entries()) {
    await q.query(`INSERT INTO csr_section_outputs (organization_id, project_id, job_id, section_number, content, content_hash, ai_generated, lineage, generated_at)
      VALUES (7, 11, $1, $2, $3, $4, false, '{"source":"template"}', $5)`, [jobId, s.code, s.content, sha(s.content), new Date(Date.UTC(2026, 3, 2, 10, i))]);
  }
  return { jobId, narratives: n, landedLength, landedSha256: digest.digest('hex'), rows: opts.keepRows === false ? null : Array.from({ length: n }, (_, i) => narrative(i, n, length)) };
}
