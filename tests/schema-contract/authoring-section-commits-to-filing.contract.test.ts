/**
 * Contract: text typed in the editor reaches the filing it belongs to.
 *
 * ── The split ─────────────────────────────────────────────────────────────────
 * Two section editors ship, one per store:
 *
 *   v2  DocumentAuthoring  → PATCH /api/authoring/sections/:id → authoring_sections
 *   mdx PathwayPanes       → PATCH /api/c2c/documents/:id/sections/:key
 *                                                      → c2c_document_sections
 *
 * c2c_documents is the system of record for a regulatory filing — rule-pack
 * outline, readiness trigger, the version-snapshot trigger that RAISES without
 * an actor, span lineage. authoring_sections is the editing layer.
 *
 * The editor most people use wrote the second one. So the store that decides
 * what the filing CONTAINS never saw the text anybody actually wrote. A series
 * of earlier fixes made the surfaces agree about what each store knew; none of
 * them changed that. This is the one that does: a save commits the working copy
 * into the repository.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 * Against the REAL router over HTTP with REAL signed JWTs, on the REAL
 * migrations — because every property here is a database property:
 *
 *   • the governed section receives the text, in the shape the readers expect;
 *   • the Part 11 version ledger gets an ATTRIBUTED row — the snapshot trigger
 *     raises without app.actor_id, so a 200 is positive proof the GUC was set;
 *   • readiness and has_content, which are computed from the governed store,
 *     now see work done in this editor;
 *   • an unbound document still saves, and SAYS it did not reach a filing;
 *   • a section whose code matches nothing in the rule pack is not invented;
 *   • a failure to reach the filing rolls the authored write back with it —
 *     the two move together or neither does.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createJourneyDb, type JourneyDb } from '../golden-journeys/harness';

const JWT_SECRET = 'commit-section-to-filing-contract';
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_SECRET_DEV = JWT_SECRET;

const AUTHOR = {
  // INTEGER, not a uuid. shared/schema.ts declares `users.id serial`, and the
  // phase-9 migration reconciles to it explicitly: "the brief assumed a
  // uuid-keyed user/org model; the live schema is integer-keyed". The Part 11
  // trigger casts app.actor_id to integer, so a uuid subject — which the
  // golden-journey harness uses for its own uuid-keyed fixture — would 22P02
  // here and prove nothing about production.
  id: '42',
  organizationId: 1,
  email: 'author@filing.example',
  name: 'Avery Author',
};
const MEMBERSHIP_ID = Number.parseInt(AUTHOR.id, 10); // 42

const PROJECT = '9a111111-2222-3333-4444-555555555555';
const DOC = 'doc_filing_contract';

const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, email TEXT);
  CREATE TABLE organization_users (
    organization_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member'
  );
  CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
  CREATE TABLE audit_logs (
    id text PRIMARY KEY, tenant_id integer, user_id integer, action text,
    table_name text, record_id text, actor_id text, target text,
    target_type text, target_id text, reason text, payload_hash text,
    ana_action_id text, sha256_chain text,
    occurred_at timestamptz DEFAULT now(), hmac_seal text
  );
  INSERT INTO organizations (id, name) VALUES (1, 'contract-org');
  INSERT INTO users (id, name, email) VALUES ('${AUTHOR.id}', '${AUTHOR.name}', '${AUTHOR.email}');
  INSERT INTO organization_users (organization_id, user_id, role) VALUES (1, ${MEMBERSHIP_ID}, 'member');
  INSERT INTO regulatory_programs (id) VALUES ('${PROJECT}');
`;

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../server/db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

const T = 180_000;
let jdb: JourneyDb;
let app: express.Express;
let token = '';
const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

/** doc_id of the authored document, and the ids of its sections by code. */
let authoringDocId = '';
const sectionIds: Record<string, string> = {};

async function q<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
  const r = await (h.pool as any).query(sql, params);
  return r.rows as T[];
}

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260725_authoring_audit_trail.sql',
      'db/migrations/20260725_authoring_signatures_and_workflow.sql',
      'db/migrations/20260725_authoring_signature_freeze_binding.sql',
      'db/migrations/20260730_authoring_runtime_ddl.sql',
      'db/migrations/20260803_document_span_lineage.sql',
      'migrations/20260728_authoring_comments_threading.sql',
      // The governed store: rule packs, c2c_documents, c2c_document_sections,
      // the readiness trigger and the Part 11 snapshot trigger.
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260528_phase9_document_schema.sql',
      'migrations/20260728_c2c_document_sections_timestamps.sql',
      'migrations/20260728_c2c_section_version_author_kind.sql',
      // MUST follow BOTH bundles: the binding ALTER is guarded on
      // authoring_documents AND c2c_documents, so listed any earlier it
      // no-ops with a NOTICE and the column this whole file is about is
      // silently absent. Same ordering the durable path uses.
      'migrations/20260728_authoring_document_governed_binding.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;

  token = await new SignJWT({
    userId: AUTHOR.id, email: AUTHOR.email, name: AUTHOR.name,
    organizationId: AUTHOR.organizationId, tenant_id: AUTHOR.organizationId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt().setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));

  const { default: authoringRouter } = await import('../../server/routes/authoring.router');
  app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/authoring', authoringRouter);

  // A governed filing with two rule-pack sections.
  const pack = await q<{ version: string }>(
    `SELECT version FROM c2c_rule_packs WHERE doc_type='ind' AND agency='fda' LIMIT 1`,
  );
  await q(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     VALUES ($1, 1, $2, 'ind', 'fda', $3, 'IND', 'draft', 0)`,
    [DOC, PROJECT, pack[0].version],
  );
  await q(
    `INSERT INTO c2c_document_sections (document_id, section_key, label, path_order, status)
     VALUES ($1, '2.5', 'Clinical overview', 1, 'todo'),
            ($1, '2.6', 'Nonclinical summaries', 2, 'todo')`,
    [DOC],
  );

  // An authored document BOUND to it, with three sections: two that correspond
  // to rule-pack keys and one that does not.
  const created = await as(request(app).post('/api/authoring/docs')).send({
    title: 'IND — working copy', module: 'M2',
  });
  expect(created.status).toBe(201);
  authoringDocId = created.body.document.id;
  await q(`UPDATE authoring_documents SET c2c_document_id = $1 WHERE id = $2`, [DOC, authoringDocId]);

  for (const code of ['2.5', '2.6', 'ZZ-not-in-pack']) {
    const s = await as(request(app).post('/api/authoring/sections')).send({
      doc_id: authoringDocId, code, title: code, content: '', order_index: 1,
    });
    expect(s.status).toBe(201);
    sectionIds[code] = s.body.section.id;
  }
}, T);

afterAll(async () => { await jdb?.close(); });

const save = (code: string, content: string) =>
  as(request(app).patch(`/api/authoring/sections/${sectionIds[code]}`)).send({
    content, changeReason: 'drafting the overview',
  });

describe('a save in the editor reaches the filing', () => {
  it('writes the text into the governed section', async () => {
    const res = await save('2.5', 'The investigational product was well tolerated.');
    expect(res.status).toBe(200);
    expect(res.body.filing).toMatchObject({ committed: true, documentId: DOC, sectionKey: '2.5' });

    const [row] = await q<{ content: any; draft_source: string }>(
      `SELECT content, draft_source FROM c2c_document_sections
        WHERE document_id = $1 AND section_key = '2.5'`,
      [DOC],
    );
    // The shape the governed readers understand — the same one the mdx editor
    // writes, which sectionHasContentSql and sectionPlainText both handle.
    expect(row.content).toEqual({ text: 'The investigational product was well tolerated.' });
    expect(row.draft_source).toBe('human');
  }, T);

  it('the governed outline now reports the section as written', async () => {
    // has_content is computed from the governed store. Before this, work done
    // in this editor was invisible to it no matter how much was written.
    const [row] = await q<{ has_content: boolean }>(
      `SELECT (content ->> 'text') IS NOT NULL AND length(btrim(content ->> 'text')) > 0 AS has_content
         FROM c2c_document_sections WHERE document_id = $1 AND section_key = '2.5'`,
      [DOC],
    );
    expect(row.has_content).toBe(true);
  }, T);

  it('a re-save enters the Part 11 ledger ATTRIBUTED to the real actor', async () => {
    // c2c_snapshot_section_version() RAISES without app.actor_id, so a 200 on a
    // second save is positive proof the GUC reached the trigger — the exact
    // property `SET LOCAL app.actor_id = $1` failed to provide before #1188.
    const res = await save('2.5', 'Revised: no dose-limiting toxicity was observed.');
    expect(res.status).toBe(200);

    const versions = await q<{ author_id: number; reason: string; content: any }>(
      `SELECT author_id, reason, content FROM c2c_document_section_versions
        ORDER BY version`,
    );
    // The trigger is BEFORE UPDATE and preserves OLD.content, so each row holds
    // what that save SUPERSEDED — version 1 is the scaffold placeholder the
    // first save replaced, and the newest row is the first save's text.
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const newest = versions[versions.length - 1];
    expect(newest.content).toEqual({ text: 'The investigational product was well tolerated.' });

    // Every row is attributed to the verified actor, as an integer — the type
    // the ledger and the live users table both use. Attribution is the property
    // the snapshot trigger exists to enforce, so it is asserted on all of them.
    for (const v of versions) {
      expect(v.author_id).toBe(42);
      expect(v.reason).toBe('drafting the overview');
    }
  }, T);

  it('and the working copy still holds the text too', async () => {
    const [row] = await q<{ content: string }>(
      `SELECT content FROM authoring_sections WHERE id = $1`, [sectionIds['2.5']],
    );
    expect(row.content).toBe('Revised: no dose-limiting toxicity was observed.');
  }, T);
});

describe('what it deliberately does NOT do', () => {
  it('does not invent a section the rule pack does not define', async () => {
    const res = await save('ZZ-not-in-pack', 'Text under a code the filing has no slot for.');
    // The save succeeds — the working copy is real.
    expect(res.status).toBe(200);
    expect(res.body.filing).toMatchObject({ committed: false });
    expect(res.body.filing.reason).toMatch(/no section "ZZ-not-in-pack"/);

    // And nothing was created in the governed outline.
    const rows = await q(
      `SELECT 1 FROM c2c_document_sections WHERE document_id = $1 AND section_key = 'ZZ-not-in-pack'`,
      [DOC],
    );
    expect(rows).toHaveLength(0);
  }, T);

  it('an unbound document saves, and says the text did not reach a filing', async () => {
    const other = await as(request(app).post('/api/authoring/docs')).send({
      title: 'Org-wide note', module: 'M2',
    });
    const s = await as(request(app).post('/api/authoring/sections')).send({
      doc_id: other.body.document.id, code: '2.5', title: '2.5', content: '', order_index: 1,
    });

    const res = await as(request(app).patch(`/api/authoring/sections/${s.body.section.id}`))
      .send({ content: 'Notes that belong to no filing.' });

    expect(res.status).toBe(200);
    expect(res.body.filing).toMatchObject({ committed: false });
    expect(res.body.filing.reason).toMatch(/not bound to a filing/i);

    // Crucially: it did NOT land in the other document's 2.5.
    const [row] = await q<{ content: any }>(
      `SELECT content FROM c2c_document_sections WHERE document_id = $1 AND section_key = '2.5'`,
      [DOC],
    );
    expect(row.content).not.toEqual({ text: 'Notes that belong to no filing.' });
  }, T);
});

describe('the two stores move together or neither does', () => {
  it('a filing write that cannot happen takes the authored write down with it', async () => {
    // Point the binding at a document that does not exist. The FK on
    // c2c_document_sections means the UPDATE matches nothing — but the deeper
    // property under test is the transaction: if committing to the filing
    // THROWS, the authored content must not be left behind on its own.
    //
    // Simulated by breaking the join mid-flight rather than by mocking, so the
    // rollback is the database's, not a stub's.
    const before = await q<{ content: string }>(
      `SELECT content FROM authoring_sections WHERE id = $1`, [sectionIds['2.6']],
    );

    await q(`ALTER TABLE c2c_document_sections ADD CONSTRAINT tmp_refuse CHECK (section_key <> '2.6') NOT VALID`);
    try {
      const res = await save('2.6', 'This must not survive on its own.');
      expect(res.status).toBe(500);
      expect(res.body.error?.code).toBe('LINEAGE_REQUIRED');
    } finally {
      await q(`ALTER TABLE c2c_document_sections DROP CONSTRAINT tmp_refuse`);
    }

    const after = await q<{ content: string }>(
      `SELECT content FROM authoring_sections WHERE id = $1`, [sectionIds['2.6']],
    );
    // The authored row is untouched: the refused filing write rolled it back.
    expect(after[0].content).toBe(before[0].content);
  }, T);
});
