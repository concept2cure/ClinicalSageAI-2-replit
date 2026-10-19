/**
 * AnA's approve_import and POST /api/mdx/imports/:id/approve are one
 * implementation (document store consolidation step 3, 2026-10-17).
 *
 * The AnA tool kept its own copy of the approve loop: no transaction, no lock
 * on the job, no check that project_id belongs to the job's organisation, and
 * no audit row for who approved the import. The REST approve had all four.
 * Both now call approveImportJob in routes/mdx-imports.ts.
 *
 * Real handler, real route, PGlite with the 20260512 import tables.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const h = vi.hoisted(() => {
  const state: { pg: { query: (text: string, params?: unknown[]) => Promise<unknown> } | null } = { pg: null };
  const query = (text: string, params?: unknown[]) => {
    if (!state.pg) throw new Error('PGlite is not started');
    return state.pg.query(text, params);
  };
  // PGlite is one connection, so a "checked-out client" is the same session.
  const pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return {
    state, pool,
    resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
    recordAuditRow: vi.fn(async () => ({ recorded: true })),
  };
});
vi.mock('../../../db', () => ({ pool: h.pool, getPool: () => h.pool, db: {} }));
vi.mock('../../../db.js', () => ({ pool: h.pool, getPool: () => h.pool, db: {} }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: h.resolveSignerOrgRole }));
vi.mock('../../audit/audit-write-outcome', () => ({ recordAuditRow: h.recordAuditRow }));
vi.mock('../../audit/audit-write-outcome.js', () => ({ recordAuditRow: h.recordAuditRow }));

import { getToolHandler, type ToolContext } from '../AnaToolExecutor';
import importsRouter from '../../../routes/mdx-imports';

const ORG = 8471, OTHER_ORG = 8472, USER = 8473;
const PROJECT = 501, FOREIGN_PROJECT = 502;
const CTX: ToolContext = { organizationId: ORG, userId: USER, humanConfirmed: true };
const MIGRATION = readFileSync(path.join(process.cwd(), 'migrations/20260512_legacy_imports.sql'), 'utf8');
let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  h.state.pg = pg;
  await pg.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY);
    CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL);
    CREATE TABLE concept2cure_artifacts (
      id serial PRIMARY KEY, artifact_id text NOT NULL UNIQUE, project_id integer NOT NULL REFERENCES projects(id),
      organization_id integer NOT NULL, type text NOT NULL, category text NOT NULL, title text, content text,
      content_hash text, ctd_section text, status text, created_by_id integer, metadata jsonb);
    CREATE TABLE concept2cure_provenance_events (
      id serial PRIMARY KEY, organization_id integer, artifact_id integer, artifact_version_id integer,
      event_type text, event_action text, actor_id integer, details jsonb, backend_route text,
      backend_service text, created_at timestamptz DEFAULT now());
    INSERT INTO organizations (id) VALUES (${ORG}), (${OTHER_ORG});
    INSERT INTO users (id) VALUES (${USER});
    INSERT INTO projects VALUES (${PROJECT}, ${ORG}), (${FOREIGN_PROJECT}, ${OTHER_ORG});
  `);
  await pg.exec(MIGRATION);
}, 120_000);
afterAll(async () => { await pg?.close(); });
beforeEach(() => { h.recordAuditRow.mockClear(); });

async function readyJob(): Promise<number> {
  const { rows: [job] } = await pg.query<{ id: number }>(
    `INSERT INTO import_jobs (organization_id, source_path, source_kind, status, requested_by)
     VALUES ($1, '/uploads/x.zip', 'zip', 'ready_for_review', $2) RETURNING id`, [ORG, USER]);
  await pg.query(
    `INSERT INTO import_job_files (import_job_id, organization_id, relative_path, file_name, sha256,
       mapped_ctd_section, mapped_artifact_kind, status)
     VALUES ($1, $2, 'm1/us/1-1/cover-letter.pdf', 'cover-letter.pdf', $3, '1.1', 'cover_letter', 'mapped')`,
    [job.id, ORG, 'c'.repeat(64)]);
  return job.id;
}
const approveViaAna = async (jobId: number, projectId = PROJECT) =>
  JSON.parse(await getToolHandler('approve_import')!({ import_job_id: jobId, project_id: projectId }, CTX));
function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: USER, organizationId: ORG, role: 'admin' };
    (req as unknown as { userRole: string }).userRole = 'admin';
    next();
  });
  a.use('/api/mdx', importsRouter);
  return a;
}
const rowsOf = async (jobId: number) => ({
  job: (await pg.query<{ status: string }>(`SELECT status, approved_by, artifacts_created FROM import_jobs WHERE id = $1`, [jobId])).rows[0],
  artifacts: (await pg.query(
    `SELECT project_id, organization_id, type, category, title, content, content_hash, ctd_section, status, created_by_id,
            metadata - 'importJobId' AS metadata
       FROM concept2cure_artifacts WHERE artifact_id LIKE $1`, [`import-${jobId}-%`])).rows,
  files: (await pg.query(`SELECT status, artifact_id IS NOT NULL AS has_artifact FROM import_job_files WHERE import_job_id = $1`, [jobId])).rows,
});

describe('approve_import is the REST approve', () => {
  it("refuses a project of another organisation and writes nothing", async () => {
    const jobId = await readyJob();
    const out = await approveViaAna(jobId, FOREIGN_PROJECT);
    expect(out.ok, JSON.stringify(out)).not.toBe(true);
    const after = await rowsOf(jobId);
    expect(after.artifacts, 'AnA placed an import into another organisation\'s project').toEqual([]);
    expect(after.job.status).toBe('ready_for_review');
  });

  it('records who approved the import, as the REST approve does', async () => {
    const jobId = await readyJob();
    const out = await approveViaAna(jobId);
    expect(out).toMatchObject({ ok: true, artifactsCreated: 1 });
    expect(h.recordAuditRow, 'AnA approve_import wrote no audit row').toHaveBeenCalledWith(expect.objectContaining({
      tenantId: ORG, userId: USER, action: 'mdx.onboarding.import.approve', resourceType: 'import_job', resourceId: jobId,
    }));
  });

  it('stores the same job, artifact and file rows as POST /api/mdx/imports/:id/approve', async () => {
    const viaAna = await readyJob();
    const viaRoute = await readyJob();
    expect((await approveViaAna(viaAna)).ok).toBe(true);
    const res = await request(app()).post(`/api/mdx/imports/${viaRoute}/approve`).send({ projectId: PROJECT });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await rowsOf(viaAna)).toEqual(await rowsOf(viaRoute));
  });

  it('refuses a job that is no longer awaiting review', async () => {
    const jobId = await readyJob();
    expect((await approveViaAna(jobId)).ok).toBe(true);
    const again = await approveViaAna(jobId);
    expect(again.error).toMatch(/ready_for_review/);
    expect((await rowsOf(jobId)).artifacts).toHaveLength(1);
  });
});
