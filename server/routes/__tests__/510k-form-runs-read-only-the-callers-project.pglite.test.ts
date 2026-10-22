/**
 * The two 510(k) form runs — POST /api/510k/:projectId/generate-documents and
 * POST /api/fda-forms/project/:projectId/generate-all — read the 510(k) project
 * they are named (fda_510k_projects.id) in the caller's organization only, and
 * answer another organization's project 404.
 *
 * What the code used to do (until 2026-10-15): DocumentOrchestrationService.
 * fetchProject read fda_510k_projects by id alone, unlike every other route on
 * these forms. The run then drafted from the base project the row pointed at
 * (loadFormProjectData, org-scoped) and saved the forms under the row's id. So
 * another organization's 510(k) project answered 500, not 404 — and one whose
 * base project id is the caller's had the caller's forms filed under it: rows
 * in the caller's organization naming another organization's 510(k) project.
 *
 * The real routers, service and form generator over real tables (drizzle
 * definitions) on PGlite; only the Part 11 signer lookup is a double.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import {
  documentAuditTrail,
  fda510kDocuments,
  fda510kProjects,
  fda510kStageProgress,
  organizations,
  projects,
} from '../../../shared/schema';
import { projectCharters } from '../../../shared/schema/project-charter';

const H = vi.hoisted(() => ({ pg: null as any, db: null as any }));
vi.mock('../../db', () => ({ get db() { return H.db; } }));
vi.mock('../../db.js', () => ({ get db() { return H.db; } }));
vi.mock('../../services/part11/resolve-signer-identity.js', () => ({
  resolveSignerIdentity: async () => ({ name: 'Dana Doe', email: 'dana@example.test', title: null }),
}));
vi.mock('../../services/part11/signature-persistence.js', () => ({ drizzleSignatureClient: () => ({}) }));

import documentOrchestrationRoutes from '../documentOrchestrationRoutes';
import fdaFormsRoutes from '../fda-forms.routes';

const ALPHA = 1;
const BETA = 2;
const ALPHA_BASE = 11;
const BETA_BASE = 22;
/** Alpha's own 510(k) project. */
const ALPHA_510K = 101;
/** Beta's 510(k) project, on Beta's base project. */
const BETA_510K = 202;
/** Beta's 510(k) project whose base project id is Alpha's. */
const BETA_510K_ON_ALPHA_BASE = 203;

/** CREATE TABLE from the drizzle definition: columns, types, literal defaults. */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => {
    const d = col.default;
    const literal = typeof d === 'number' || typeof d === 'boolean' ? ` DEFAULT ${d}`
      : typeof d === 'string' ? ` DEFAULT '${d.replace(/'/g, "''")}'` : '';
    return `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}${literal}`;
  });
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

const rows = async (sql: string, params: unknown[] = []) => (await H.pg.query(sql, params)).rows as any[];

beforeAll(async () => {
  H.pg = new PGlite();
  H.db = drizzle(H.pg);
  for (const t of [organizations, projects, fda510kProjects, fda510kDocuments, fda510kStageProgress,
    projectCharters, documentAuditTrail]) {
    await H.pg.exec(ddlOf(t as PgTable));
  }
  await H.pg.exec(`CREATE TABLE fda_510k_initial_data_forms (
    id serial PRIMARY KEY, project_id integer, form_type text, form_data json)`);
  await H.pg.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Alpha Devices', 'alpha'), ($2, 'Beta Medical', 'beta')`,
    [ALPHA, BETA]);
  await H.pg.query(
    `INSERT INTO projects (id, organization_id, client_workspace_id, name, type, status) VALUES
       ($1, $2, 1, 'Alpha Widget', 'regulatory', 'active'), ($3, $4, 2, 'Beta Stent', 'regulatory', 'active')`,
    [ALPHA_BASE, ALPHA, BETA_BASE, BETA]);
  await H.pg.query(
    `INSERT INTO fda_510k_projects (id, organization_id, project_id, device_name) VALUES
       ($1, $2, $3, 'Alpha Widget'), ($4, $5, $6, 'Beta Stent'), ($7, $5, $3, 'Beta shadow of Alpha')`,
    [ALPHA_510K, ALPHA, ALPHA_BASE, BETA_510K, BETA, BETA_BASE, BETA_510K_ON_ALPHA_BASE]);
}, 60_000);

afterAll(async () => {
  await H.pg?.close();
});

beforeEach(async () => {
  await H.pg.exec('DELETE FROM fda_510k_documents; DELETE FROM document_audit_trail;');
});

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 5, organizationId: ALPHA };
    next();
  });
  a.use(documentOrchestrationRoutes);
  a.use('/api/fda-forms', fdaFormsRoutes);
  return a;
}

const RUNS = [
  ['POST /api/510k/:projectId/generate-documents', (id: number) => `/api/510k/${id}/generate-documents`],
  ['POST /api/fda-forms/project/:projectId/generate-all', (id: number) => `/api/fda-forms/project/${id}/generate-all`],
] as const;

describe.each(RUNS)('%s', (_name, url) => {
  it("answers another organization's 510(k) project 404 and writes nothing", async () => {
    const res = await request(app()).post(url(BETA_510K));

    expect(res.status, `another organization's 510(k) project: ${JSON.stringify(res.body)}`).toBe(404);
    expect(res.body.error).toBe('Project not found');
    expect(await rows('SELECT id FROM fda_510k_documents')).toEqual([]);
    expect(await rows('SELECT id FROM document_audit_trail')).toEqual([]);
  });

  it("files nothing under another organization's 510(k) project that points at the caller's base project", async () => {
    const res = await request(app()).post(url(BETA_510K_ON_ALPHA_BASE));

    expect(
      await rows('SELECT project_id, organization_id FROM fda_510k_documents'),
      "Alpha's forms were filed under Beta's 510(k) project",
    ).toEqual([]);
    expect(res.status).toBe(404);
  });

  it("drafts and files the caller's own 510(k) project's forms under it", async () => {
    const res = await request(app()).post(url(ALPHA_510K));

    expect([200, 207], JSON.stringify(res.body)).toContain(res.status);
    const saved = await rows('SELECT DISTINCT project_id, organization_id FROM fda_510k_documents');
    expect(saved).toEqual([{ project_id: ALPHA_510K, organization_id: ALPHA }]);
  });
});
