/**
 * The device screens' Correspondence tab reads a project's letters, and only a
 * project the reader may open (2026-10-29).
 *
 * What the code did until then: the screens name their program (a
 * regulatory_programs uuid); GET /correspondence did Number(projectId), got
 * NaN, dropped the project filter and listed every letter in the
 * organisation, other projects' and private ones included. A letter's detail
 * and an issue review checked the organisation only.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import * as schema from '../../../shared/schema';
import { runGovernedIssueParser } from '../../services/regulatory-correspondence/issue-parser';
import express from 'express';
import request from 'supertest';

const PROGRAM = '3f2c1a9e-8b7d-4c6e-9f10-2a3b4c5d6e7f';
const h = vi.hoisted(() => ({
  statements: [] as Array<{ sql: string; params: unknown[] }>,
  admitted: new Set<string>(),
  writable: new Set<string>(),
  pg: null as import('@electric-sql/pglite').PGlite | null,
}));

vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: unknown, next: () => void) => { req.user = { id: 11, organizationId: 2 }; next(); },
}));
vi.mock('../../db', () => {
  const query = async (config: string | { text: string; rowMode?: string }, params: unknown[] = []) => {
    const sql = typeof config === 'string' ? config : config.text;
    h.statements.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    if (h.pg) {
      const result = await h.pg.query<Record<string, unknown>>(sql, params);
      return { rows: typeof config === 'object' && config.rowMode === 'array' ? result.rows.map(Object.values) : result.rows };
    }
    if (/to_regclass/.test(sql)) return { rows: [{ tbl: 'c2c_submissions' }] };
    if (/FROM projects WHERE organization_id = \$1 AND regulatory_program_id/.test(sql)) return { rows: [{ id: 7 }, { id: 8 }] };
    if (/SELECT \* FROM c2c_correspondence WHERE id = \$1/.test(sql)) return { rows: [{ id: params[0], project_id: params[0] === 'letter-private' ? 9 : 7 }] };
    if (/SELECT c.project_id FROM c2c_correspondence_issues/.test(sql)) return { rows: [{ project_id: 9 }] };
    return { rows: [] };
  };
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { pool, getPool: () => pool, getDb: () => ({}), transaction: async (cb: (c: typeof pool) => unknown) => cb(pool) };
});
vi.mock('../c2c/project-access', () => {
  class ProjectAdmissionRefusal extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
  }
  return {
    ProjectAdmissionRefusal,
    requireProjectAdmission: async (_req: unknown, id: string, forWrite = false) => {
      if (!h.admitted.has(id)) throw new ProjectAdmissionRefusal(404, 'PROJECT_NOT_FOUND', 'Project not found.');
      if (forWrite && !h.writable.has(id)) throw new ProjectAdmissionRefusal(403, 'PROJECT_WRITE_PERMISSION_DENIED', 'No change allowed.');
      return { id: Number(id) };
    },
  };
});

import routes from '../regulatory-correspondence';

const app = express();
app.use(express.json());
app.use('/api/regulatory-correspondence', routes);
const listSql = () => h.statements.find((s) => /FROM c2c_correspondence WHERE/.test(s.sql) && /ORDER BY received_at/.test(s.sql));

beforeEach(() => { h.statements.length = 0; h.admitted = new Set(['7']); h.writable = new Set(); });

describe('GET /correspondence is one project\'s letters', () => {
  it("lists the program's admitted project's letters only, never the organisation's", async () => {
    const res = await request(app).get(`/api/regulatory-correspondence/correspondence?projectId=${PROGRAM}`);
    expect(res.status).toBe(200);
    const list = listSql()!;
    expect(list.sql).toMatch(/project_id = ANY\(\$2::int\[\]\)/);
    expect(list.params).toEqual([2, [7]]); // project 8 anchors the program too, and this reader may not open it
  });

  it('refuses a request that names no project, and one naming a project the reader may not open', async () => {
    expect((await request(app).get('/api/regulatory-correspondence/correspondence')).status).toBe(422);
    expect((await request(app).get('/api/regulatory-correspondence/correspondence?projectId=not-a-project')).status).toBe(422);
    expect((await request(app).get('/api/regulatory-correspondence/correspondence?projectId=9')).status).toBe(404);
    expect(listSql()).toBeUndefined();
  });

  it("does not show a letter of a project the reader may not open", async () => {
    expect((await request(app).get('/api/regulatory-correspondence/correspondence/letter-7')).status).toBe(200);
    expect((await request(app).get('/api/regulatory-correspondence/correspondence/letter-private')).status).toBe(404);
  });

  it("refuses an issue review by someone who may not change the letter's project, and writes nothing", async () => {
    h.admitted.add('9');
    const res = await request(app).patch('/api/regulatory-correspondence/issues/iss-1/review')
      .send({ humanReviewStatus: 'confirmed', reason: 'Reviewed against the letter text' });
    expect(res.status).toBe(403);
    expect(h.statements.some((s) => /UPDATE c2c_correspondence_issues/.test(s.sql))).toBe(false);
  });
});

async function createReviewDatabase(): Promise<PGlite> {
    const pg = new PGlite();
    await pg.exec(`
      CREATE TABLE c2c_submissions (id TEXT PRIMARY KEY,organization_id INT,project_id INT);
      CREATE TABLE c2c_correspondence (id TEXT PRIMARY KEY,organization_id INT,project_id INT,submission_id TEXT,parsed_text TEXT,direction TEXT DEFAULT 'inbound');
      CREATE TABLE c2c_correspondence_issues (id TEXT PRIMARY KEY,correspondence_id TEXT,category TEXT,subcategory TEXT,severity TEXT,blocker BOOLEAN,response_required BOOLEAN,source_excerpt TEXT,confidence NUMERIC,human_review_status TEXT,mapped_ctd_sections JSONB,mapped_artifact_ids JSONB,resolution_status TEXT,structured_extraction JSONB,updated_at TIMESTAMPTZ);
      CREATE TABLE audit_logs (id UUID PRIMARY KEY,tenant_id INT,user_id INT,action TEXT,table_name TEXT,record_id TEXT,actor_id INT,target TEXT,target_type TEXT,target_id TEXT,reason TEXT,payload_hash TEXT,ana_action_id TEXT,sha256_chain TEXT,occurred_at TIMESTAMPTZ,hmac_seal TEXT,chain_seq BIGSERIAL,old_values JSON,new_values JSON,ip_address TEXT,user_agent TEXT);
      CREATE TABLE c2c_ana_actions (id TEXT PRIMARY KEY,org_id INT,domain TEXT,surface TEXT,command TEXT,target TEXT,risk TEXT,payload JSONB,agentic_mode TEXT,state TEXT,proposed_at TIMESTAMPTZ,proposed_by INT,decided_at TIMESTAMPTZ,decided_by INT,decision_reason TEXT,executed_at TIMESTAMPTZ,audit_row_id UUID,idempotency_key TEXT);
    `);
    const kit = createRequire(import.meta.url)('drizzle-kit/api') as typeof import('drizzle-kit/api');
    const tables = { c2cBlockers: schema.c2cBlockers, c2cSubmissionPackages: schema.c2cSubmissionPackages, c2cPackageSections: schema.c2cPackageSections };
    for (const statement of await kit.generateMigration(kit.generateDrizzleJson({}), kit.generateDrizzleJson(tables))) {
      if (/^CREATE TABLE/.test(statement)) await pg.exec(statement);
    }
    return pg;
}

describe('a human issue review commits current evidence, blockers and its real governed audit together', () => {
  let pg: PGlite;
  let issueId: string;
  let digest: string;
  const text = `${'Administrative cover note.\n'.repeat(20)}Missing CMC stability data for the proposed shelf life.`;
  beforeAll(async () => { pg = await createReviewDatabase(); }, 60_000);
  afterAll(async () => { h.pg = null; await pg?.close(); });
  async function seed(sourceText = text) {
    const issue = runGovernedIssueParser(sourceText, 'letter-pg').issues.find(item => item.blocker)!;
    issueId = issue.id;
    digest = issue.structuredExtraction!.sourceTextDigest!;
    await pg.query(`INSERT INTO c2c_correspondence_issues
      (id,correspondence_id,category,severity,blocker,response_required,source_excerpt,confidence,human_review_status,mapped_ctd_sections,mapped_artifact_ids,resolution_status,structured_extraction)
      VALUES ($1,'letter-pg',$2,$3,$4,TRUE,$5,0.78,'pending',$6::jsonb,'[]','open',$7::jsonb)`,
    [issueId,issue.category,issue.severity,issue.blocker,issue.sourceExcerpt,JSON.stringify(issue.mappedCtdSections),JSON.stringify(issue.structuredExtraction)]);
    await pg.query("UPDATE c2c_correspondence SET parsed_text=$1 WHERE id='letter-pg'", [sourceText]);
  }
  beforeEach(async () => {
    h.pg = pg;
    h.admitted = new Set(['7']); h.writable = new Set(['7']);
    await pg.exec(`ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS refuse_review_audit;
      TRUNCATE c2c_correspondence_issues,c2c_correspondence,c2c_submissions,c2c_blockers,c2c_submission_packages,c2c_package_sections,audit_logs,c2c_ana_actions RESTART IDENTITY;
      INSERT INTO c2c_submissions VALUES ('sub-pg',2,7);
      INSERT INTO c2c_correspondence VALUES ('letter-pg',2,7,'sub-pg','','inbound');
      INSERT INTO c2c_submission_packages(package_id,org_id,project_id,package_family,title) VALUES ('package-pg',2,7,'nda','Current package');`);
    await seed();
  });
  const review = (body: Record<string, unknown> = {}) => request(app)
    .patch(`/api/regulatory-correspondence/issues/${issueId}/review`)
    .send({ reason: 'Reviewed the exact current agency letter.', humanReviewStatus: 'confirmed', sourceTextDigest: digest, ...body });
  const stored = async () => (await pg.query<{ human_review_status: string; structured_extraction: Record<string, any> }>('SELECT human_review_status,structured_extraction FROM c2c_correspondence_issues WHERE id=$1', [issueId])).rows[0];
  const openBlockers = async () => (await pg.query("SELECT id FROM c2c_blockers WHERE status='open'")).rows;

  it('confirms the exact current letter under the authenticated reviewer and closes its blocker on rejection', async () => {
    const result = await review();
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const saved = await stored();
    expect(saved.structured_extraction.humanReview).toMatchObject({ reviewedBy: 11, status: 'confirmed', sourceTextDigest: digest });
    expect(saved.structured_extraction.humanReview.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(saved.structured_extraction.feedbackCoding).toMatchObject({ register: 'objective', humanConfirmed: true });
    expect((await pg.query('SELECT tenant_id,user_id,actor_id FROM audit_logs')).rows).toEqual([{ tenant_id: 2, user_id: 11, actor_id: 11 }]);
    expect((await pg.query('SELECT decided_by FROM c2c_ana_actions')).rows).toEqual([{ decided_by: 11 }]);
    expect(await openBlockers()).toHaveLength(1);
    expect((await review({ humanReviewStatus: 'rejected' })).status).toBe(200);
    expect(await openBlockers()).toEqual([]);
    expect((await stored()).structured_extraction.feedbackCoding.humanConfirmed).toBe(false);
  });
  it('refuses a changed letter, a forged span and a missing expected source version before writing', async () => {
    await pg.query("UPDATE c2c_correspondence SET parsed_text=parsed_text || ' Revised.' WHERE id='letter-pg'");
    expect((await review()).status).toBe(409);
    await pg.query("UPDATE c2c_correspondence SET parsed_text=$1 WHERE id='letter-pg'", [text]);
    expect((await review({ sourceTextDigest: undefined })).status).toBe(409);
    await pg.query("UPDATE c2c_correspondence_issues SET structured_extraction=jsonb_set(structured_extraction,'{evidenceSpan,text}','\"Invented quote\"') WHERE id=$1", [issueId]);
    expect((await review()).status).toBe(409);
    expect((await stored()).human_review_status).toBe('pending');
    expect((await pg.query('SELECT id FROM audit_logs')).rows).toEqual([]);
    expect(await openBlockers()).toEqual([]);
  });
  it('does not accept a submitted reviewer, confirmation flag or inference coding', async () => {
    expect((await review({ reviewedBy: 999, humanConfirmed: true, feedbackCoding: { register: 'objective' } })).status).toBe(400);
    expect((await stored()).human_review_status).toBe('pending');
  });
  it('a partial issue update cannot promote an unreviewed stored confirmation into an objective gate', async () => {
    await pg.query("UPDATE c2c_correspondence_issues SET human_review_status='confirmed' WHERE id=$1", [issueId]);
    expect((await review({ humanReviewStatus: undefined, sourceTextDigest: undefined, resolutionStatus: 'open' })).status).toBe(200);
    expect((await stored()).structured_extraction.feedbackCoding.humanConfirmed).toBe(false);
    expect(await openBlockers()).toEqual([]);
  });
  it('keeps confirmed presentation expectations out of objective publishing blockers', async () => {
    await pg.exec('DELETE FROM c2c_correspondence_issues');
    await seed('Please improve the clarity and risk framing of the safety presentation.');
    expect((await review()).status).toBe(200);
    expect((await stored()).structured_extraction.feedbackCoding).toMatchObject({ register: 'subjective', humanConfirmed: true });
    expect(await openBlockers()).toEqual([]);
  });
  it.each(['foreign_tenant', 'mismatched_submission', 'project_write_denied'])('refuses %s ownership before changing an issue', async state => {
    if (state === 'foreign_tenant') await pg.exec('UPDATE c2c_correspondence SET organization_id=3');
    if (state === 'mismatched_submission') await pg.exec('UPDATE c2c_submissions SET organization_id=3');
    if (state === 'project_write_denied') h.writable.clear();
    expect((await review()).status).toBe(state === 'project_write_denied' ? 403 : 404);
    expect((await stored()).human_review_status).toBe('pending');
    expect((await pg.query('SELECT id FROM audit_logs')).rows).toEqual([]);
  });
  it('rolls back the issue decision and derived blocker when the real governed audit refuses', async () => {
    await pg.exec('ALTER TABLE audit_logs ADD CONSTRAINT refuse_review_audit CHECK (false) NOT VALID');
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try { expect((await review()).status).toBe(500); } finally { quiet.mockRestore(); }
    expect((await stored()).human_review_status).toBe('pending');
    expect(await openBlockers()).toEqual([]);
    expect((await pg.query('SELECT id FROM audit_logs')).rows).toEqual([]);
    expect((await pg.query('SELECT id FROM c2c_ana_actions')).rows).toEqual([]);
  });
});
