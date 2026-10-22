/**
 * The PGlite harness for the filing's writers: the REAL authoring router and
 * the REAL c2c documents router over HTTP, on the REAL migrations. Shared by
 * node-status-follows-work.pglite.test.ts (spine F1) and
 * filing-lock-write-through.pglite.test.ts.
 *
 * What this module cannot hold: `vi.mock`, which binds to the file that calls
 * it. Each test file mocks `../../../db` (to `h.pool`) and the signer modules
 * itself, then calls `startFilingApp`.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { expect } from 'vitest';
import { createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';

/** Set as process.env.JWT_SECRET and JWT_SECRET_DEV by each test file before it imports a router. */
export const FILING_JWT_SECRET = 'node-status-follows-work';

export const AUTHOR = {
  id: '42',
  organizationId: 1,
  email: 'approver@filing.example',
  name: 'Avery Approver',
};
export const PROJECT = '9a111111-2222-3333-4444-666666666666';
export const PASSWORD = 'signer-password';
export const T = 180_000;

const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, email TEXT);
  CREATE TABLE organization_users (
    organization_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member'
  );
  CREATE TABLE regulatory_programs (
    id uuid PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    program_type text,
    primary_agency text,
    deleted_at timestamptz
  );
  CREATE TABLE audit_logs (
    id text PRIMARY KEY, tenant_id integer, user_id integer, action text,
    table_name text, record_id text, actor_id text, target text,
    target_type text, target_id text, reason text, payload_hash text,
    ana_action_id text, sha256_chain text,
    occurred_at timestamptz DEFAULT now(), hmac_seal text,
    old_values json, new_values json, ip_address text, user_agent text
  );
  INSERT INTO organizations (id, name) VALUES (1, 'f1-org');
  INSERT INTO users (id, name, email) VALUES (42, '${AUTHOR.name}', '${AUTHOR.email}');
  INSERT INTO organization_users (organization_id, user_id, role) VALUES (1, 42, 'member');
  INSERT INTO regulatory_programs (id, organization_id) VALUES ('${PROJECT}', 1);
`;

const MIGRATIONS = [
  'db/migrations/20260725_authoring_document_loop_tables.sql',
  'migrations/20260727_authoring_document_program_scope.sql',
  'db/migrations/20260730_authoring_comments_router_columns.sql',
  'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
  'db/migrations/20260725_authoring_audit_trail.sql',
  'db/migrations/20260725_authoring_signatures_and_workflow.sql',
  'db/migrations/20260725_authoring_signature_freeze_binding.sql',
  'db/migrations/20260730_authoring_runtime_ddl.sql',
  'db/migrations/20260803_document_span_lineage.sql',
  'migrations/20260907_span_lineage_accepted_machine_draft.sql',
  'migrations/20260908_span_lineage_machine_draft.sql',
  'migrations/20260728_authoring_comments_threading.sql',
  'migrations/20260527_mutation_primitives.sql',
  // recordGovernedAction's 'approve' verb: the open command vocabulary the
  // deployed set carries (scripts/db/migration-set.mjs).
  'db/migrations/20260730_c2c_ana_actions_command_vocab.sql',
  'migrations/20260528_phase9_document_schema.sql',
  'migrations/20260728_c2c_document_sections_timestamps.sql',
  'migrations/20260728_c2c_section_version_author_kind.sql',
  'migrations/20260728_authoring_document_governed_binding.sql',
];

export async function signToken(claims: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({
    userId: AUTHOR.id, email: AUTHOR.email, name: AUTHOR.name,
    organizationId: AUTHOR.organizationId, tenant_id: AUTHOR.organizationId, ...claims,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt().setExpirationTime('1h')
    .sign(new TextEncoder().encode(FILING_JWT_SECRET));
}

export interface FilingApp {
  jdb: JourneyDb;
  app: express.Express;
  q: <R = any>(sql: string, params?: unknown[]) => Promise<R[]>;
}

/** Builds the database, hands its pool to the caller's `db` mock, and mounts both routers. */
export async function startFilingApp(bind: (jdb: JourneyDb) => void): Promise<FilingApp> {
  const jdb = await createJourneyDb({ prereqSql: PREREQ, migrations: MIGRATIONS });
  bind(jdb);
  const { default: authoringRouter } = await import('../../../routes/authoring.router');
  const { default: documentsRouter } = await import('../../../routes/c2c/documents');
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/authoring', authoringRouter);
  // The documents router reads the principal the app's auth middleware sets.
  app.use('/api/c2c/documents', (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: Number(AUTHOR.id), organizationId: AUTHOR.organizationId };
    next();
  }, documentsRouter);
  const q = async <R = any>(sql: string, params?: unknown[]): Promise<R[]> =>
    ((await (jdb.pool as any).query(sql, params)).rows as R[]);
  return { jdb, app, q };
}

let filingSeq = 0;
/**
 * One governed filing (its sections all 'todo', as the scaffold writes them)
 * and one authored document bound to it, with a section per key. Each case
 * gets its own, so no case depends on another's order.
 */
export async function makeFiling(
  { app, q }: FilingApp, as: (r: request.Test) => request.Test, keys: string[],
) {
  const doc = `doc_f1_${++filingSeq}`;
  const pack = await q<{ version: string }>(
    `SELECT version FROM c2c_rule_packs WHERE doc_type='ind' AND agency='fda' LIMIT 1`,
  );
  await q(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     VALUES ($1, 1, $2, 'ind', 'fda', $3, 'IND', 'draft', 0)`,
    [doc, PROJECT, pack[0].version],
  );
  for (const [i, key] of keys.entries()) {
    await q(
      `INSERT INTO c2c_document_sections (document_id, section_key, label, path_order, status)
       VALUES ($1, $2, $2, $3, 'todo')`,
      [doc, key, i + 1],
    );
  }
  const created = await as(request(app).post('/api/authoring/docs')).send({
    title: `IND working copy ${filingSeq}`, module: 'M2', client_program_id: PROJECT,
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const authoringDocId: string = created.body.document.id;
  await q(`UPDATE authoring_documents SET c2c_document_id = $1 WHERE id = $2`, [doc, authoringDocId]);
  const sectionIds: Record<string, string> = {};
  for (const key of keys) {
    const s = await as(request(app).post('/api/authoring/sections')).send({
      doc_id: authoringDocId, code: key, title: key, content: '', order_index: 1,
    });
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    sectionIds[key] = s.body.section.id;
  }
  return { doc, authoringDocId, sectionIds };
}
