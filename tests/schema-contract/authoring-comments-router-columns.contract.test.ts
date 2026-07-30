/**
 * C-27 reconciliation proof: after 20260730_authoring_comments_router_columns.sql,
 * the CANONICAL authoring_comments / user_pins tables (the ones the durable
 * applier ships, from 20260725_authoring_document_loop_tables.sql) carry every
 * column authoring.router.ts references. Before this migration the router's
 * threaded-comment endpoints 500'd on the deployed schema with
 * "column ... does not exist", because those columns lived only in the
 * deploy-dead 20260730_authoring_subsystem_schema.sql.
 *
 * Runs the router's EXACT comment INSERT and SELECT column lists against real
 * Postgres (PGlite) provisioned with the canonical table shape + this migration.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MIGRATION = 'db/migrations/20260730_authoring_comments_router_columns.sql';

// The canonical shapes exactly as 20260725_authoring_document_loop_tables.sql
// declares them (9-col authoring_comments, user_pins without last_changed) — the
// pre-migration deployed state this migration must upgrade.
const CANONICAL_0725 = `
  CREATE TABLE authoring_comments (
    id UUID PRIMARY KEY,
    section_id UUID NOT NULL,
    doc_id UUID,
    body TEXT NOT NULL,
    anchor JSONB,
    status TEXT NOT NULL DEFAULT 'open',
    created_by TEXT,
    tenant_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE user_pins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    tenant_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE authoring_sections (
    id UUID PRIMARY KEY,
    doc_id UUID NOT NULL,
    code TEXT,
    title TEXT,
    content TEXT,
    order_index INTEGER DEFAULT 0,
    track_changes BOOLEAN DEFAULT FALSE,
    tenant_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

// Exactly the column list authoring.router.ts writes on POST comment
// (server/routes/authoring.router.ts INSERT INTO authoring_comments).
const ROUTER_INSERT_COLUMNS = [
  'id', 'doc_id', 'section_id', 'body', 'anchor', 'status', 'created_by',
  'user_name', 'user_email', 'parent_comment_id', 'position_data', 'tenant_id', 'created_at',
];
// Exactly the columns the router SELECTs back for a comment thread.
const ROUTER_SELECT_COLUMNS = [
  'id', 'doc_id', 'section_id', 'body', 'anchor', 'status', 'created_by',
  'user_name', 'user_email', 'parent_comment_id', 'position_data', 'resolution_note',
  'resolved_by', 'resolved_at', 'created_at', 'updated_at', 'tenant_id',
];

let pglite: import('@electric-sql/pglite').PGlite;

beforeAll(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  pglite = new PGlite();
  await pglite.exec(CANONICAL_0725);
  await pglite.exec(fs.readFileSync(path.join(REPO_ROOT, MIGRATION), 'utf8'));
});

afterAll(async () => {
  await pglite?.close();
});

describe('C-27: authoring_comments router columns land on the canonical table', () => {
  it('the migration is idempotent (re-runnable)', async () => {
    await expect(
      pglite.exec(fs.readFileSync(path.join(REPO_ROOT, MIGRATION), 'utf8')),
    ).resolves.toBeDefined();
  });

  it("the router's comment INSERT column list all exist and accept a row", async () => {
    const placeholders = ROUTER_INSERT_COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
    // A parent (self-referential thread) then a child, exercising parent_comment_id.
    const parentId = '11111111-1111-1111-1111-111111111111';
    await pglite.query(
      `INSERT INTO authoring_comments (${ROUTER_INSERT_COLUMNS.join(', ')}) VALUES (${placeholders})`,
      [parentId, '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
       'Please revise the potency claim.', JSON.stringify({ from: 10, to: 42 }), 'open',
       'ra@sponsor.example', 'RA Lead', 'ra@sponsor.example', null, JSON.stringify({ x: 1 }), 1, new Date().toISOString()],
    );
    const childId = '44444444-4444-4444-4444-444444444444';
    await pglite.query(
      `INSERT INTO authoring_comments (${ROUTER_INSERT_COLUMNS.join(', ')}) VALUES (${placeholders})`,
      [childId, '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
       'Agreed, updating now.', null, 'open', 'author@sponsor.example', 'Author', 'author@sponsor.example',
       parentId, null, 1, new Date().toISOString()],
    );
    const rows = await pglite.query('SELECT parent_comment_id FROM authoring_comments WHERE id = $1', [childId]);
    expect((rows.rows[0] as { parent_comment_id: string }).parent_comment_id).toBe(parentId);
  });

  it("the router's comment SELECT column list all resolve", async () => {
    // Would throw "column ... does not exist" for any missing column.
    const r = await pglite.query(
      `SELECT ${ROUTER_SELECT_COLUMNS.map((c) => `c.${c}`).join(', ')} FROM authoring_comments c`,
    );
    expect(Array.isArray(r.rows)).toBe(true);
  });

  it("authoring_sections gains the unique arbiter for the router's ON CONFLICT upsert", async () => {
    const upsert = `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (doc_id, code, tenant_id) DO UPDATE SET title = EXCLUDED.title`;
    const doc = '55555555-5555-5555-5555-555555555555';
    await pglite.query(upsert, ['66666666-6666-6666-6666-666666666661', doc, '3.2.S', 'First', 'x', 0, 1]);
    await pglite.query(upsert, ['66666666-6666-6666-6666-666666666662', doc, '3.2.S', 'Revised', 'y', 0, 1]);
    const r = await pglite.query('SELECT title FROM authoring_sections WHERE doc_id=$1 AND code=$2 AND tenant_id=1', [doc, '3.2.S']);
    expect(r.rows).toHaveLength(1);
    expect((r.rows[0] as { title: string }).title).toBe('Revised');
  });

  it('user_pins gains last_changed', async () => {
    await pglite.query(
      `INSERT INTO user_pins (email, pin_hash, tenant_id, last_changed) VALUES ($1,$2,$3, NOW())`,
      ['signer@sponsor.example', 'hash', 1],
    );
    const r = await pglite.query<{ last_changed: string }>(
      'SELECT last_changed FROM user_pins WHERE email = $1',
      ['signer@sponsor.example'],
    );
    expect(r.rows[0].last_changed).toBeTruthy();
  });
});
