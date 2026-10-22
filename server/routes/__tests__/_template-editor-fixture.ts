/** Canonical JWT/HTTP and PGlite fixture shared by IND and regional editor template evaluations. */
import { afterAll, beforeAll, expect, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { createJourneyDb, type JourneyDb } from '../../../tests/golden-journeys/harness';
import type { IndAuthoringTemplate } from '../../services/authoring/ind-template-types';
import { AUTHOR, AUTHORING_ACCESS_DDL, PREREQ, PROGRAM, asToken, makeApp, mint } from './_authoring-canvas-fixture';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../db', () => ({ get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool,
  query: (sql: string, args?: unknown[]) => (h.pool as { query(s: string, a?: unknown[]): Promise<unknown> }).query(sql, args) }));
export let db: JourneyDb;
export let app: express.Express;
export let author: (r: request.Test) => request.Test;
export const payload = (template: IndAuthoringTemplate) => ({ title: `Working copy of ${template.name}`, module: template.module,
  template_id: template.id, client_program_id: PROGRAM });

export function templateEditorFixture(migrations: string[]): void {
  beforeAll(async () => {
    db = await createJourneyDb({ prereqSql: PREREQ + AUTHORING_ACCESS_DDL, migrations, testOnlySql: `CREATE TABLE client_workspaces(id integer PRIMARY KEY, organization_id integer);
      CREATE SCHEMA intelligence;
      CREATE TABLE intelligence.document_templates(id uuid PRIMARY KEY,template_name text,document_type text,agency text,description text,created_at timestamptz DEFAULT now(),status text);
      CREATE TABLE intelligence.template_sections(template_id uuid,section_code text,section_title text,ordering integer);` });
    h.db = db.db; h.pool = db.pool;
    author = asToken(await mint(AUTHOR));
    const { default: router } = await import('../authoring.router');
    app = makeApp(router);
  }, 180_000);
  afterAll(async () => { await db?.close(); });
}

export interface Counts { docs: number; sections: number; revisions: number; audits: number; signatures: number }
export async function counts(): Promise<Counts> {
  return (await db.pglite.query<Counts>(`SELECT (SELECT count(*) FROM authoring_documents)::int AS docs,
    (SELECT count(*) FROM authoring_sections)::int AS sections,(SELECT count(*) FROM doc_revisions)::int AS revisions,
    (SELECT count(*) FROM authoring_audit_trail)::int AS audits,(SELECT count(*) FROM authoring_signatures)::int AS signatures`)).rows[0];
}
export async function create(template: IndAuthoringTemplate, extra: Record<string, unknown> = {}) {
  return author(request(app).post('/api/authoring/docs')).send({ ...payload(template), ...extra });
}
export async function sections(documentId: string) {
  const response = await author(request(app).get(`/api/authoring/docs/${documentId}/sections`));
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.sections as Array<{ id: string; code: string; title: string; content: string; doc_id: string; tenant_id: number }>;
}
