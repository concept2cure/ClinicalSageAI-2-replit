/**
 * Contract: the version ledger records WHICH AnA action produced a version.
 *
 * `c2c_document_section_versions.ana_action_id` has been declared since the
 * Phase-9 schema — with a foreign key to `c2c_ana_actions` and the comment
 * "backlink when AnA-mediated" — and written by nothing. The BEFORE UPDATE
 * trigger that is the table's only writer named six columns and omitted this
 * one, so it has been NULL on every row ever written.
 *
 * What already worked, and is asserted here so the fix cannot regress it:
 * `author_kind` is carried from the section's `draft_source`, so an AnA-drafted
 * version is recorded as 'ana'. The gap was never "we cannot tell AI from
 * human" — it was "we cannot tell WHICH AnA action", the difference between
 * knowing a machine wrote it and being able to open the conversation, the
 * prompt and the tool calls behind it.
 *
 * 2026-10-17 (document store consolidation step 5): PATCH
 * /api/c2c/documents/:id/sections/:key no longer writes text, and it was the
 * one writer that set `app.ana_action_id` (no client ever sent `anaActionId`).
 * The trigger contract is kept, driven the way any writer must drive it: the
 * GUCs set transaction-locally, then the UPDATE. Today nothing sets the
 * backlink GUC, so live rows carry NULL until the write-through passes one.
 *
 * Run against the REAL migrations in PGlite, because a trigger is exactly the
 * kind of thing a mocked pool reports as working while it writes nothing.
 *
 * @compliance 21 CFR Part 11 §11.10(e)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREREQ = path.join(REPO_ROOT, 'migrations/20260527_mutation_primitives.sql');
const SCHEMA = path.join(REPO_ROOT, 'migrations/20260528_phase9_document_schema.sql');
const AUTHORING = path.join(REPO_ROOT, 'db/migrations/20260725_authoring_document_loop_tables.sql');
const COMMENTS = path.join(REPO_ROOT, 'db/migrations/20260730_authoring_comments_router_columns.sql');
const REVISION_LEDGER = path.join(REPO_ROOT, 'db/migrations/20260817_doc_revisions_immutable_ledger.sql');
const BINDING = path.join(REPO_ROOT, 'migrations/20260728_authoring_document_governed_binding.sql');
const BACKLINK = path.join(
  REPO_ROOT,
  'migrations/20260814f_section_version_ana_action_backlink.sql',
);

const ORG = 7;
const USER = 42;
const DOC = 'doc_backlink';
const PROJECT = '11111111-2222-3333-4444-555555555555';
const ACTION = 'act_real_0001';

let pg: PGlite;

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
    CREATE TABLE audit_logs (
      id text PRIMARY KEY, tenant_id integer, user_id integer, action text,
      table_name text, record_id text, actor_id text, target text,
      target_type text, target_id text, reason text, payload_hash text,
      ana_action_id text, sha256_chain text,
      occurred_at timestamptz DEFAULT now(), hmac_seal text,
      old_values   json,
      new_values   json,
      ip_address   text,
      user_agent   text
    );
  `);
  await pg.exec(fs.readFileSync(PREREQ, 'utf8'));
  await pg.exec(fs.readFileSync(SCHEMA, 'utf8'));
  // The real route checks bound authoring seals in the write transaction.
  // Provision those canonical migration prerequisites rather than bypass it.
  await pg.exec(fs.readFileSync(AUTHORING, 'utf8'));
  await pg.exec(fs.readFileSync(COMMENTS, 'utf8'));
  await pg.exec(fs.readFileSync(REVISION_LEDGER, 'utf8'));
  await pg.exec(fs.readFileSync(BINDING, 'utf8'));
  await pg.exec(fs.readFileSync(BACKLINK, 'utf8'));

  await pg.query(`INSERT INTO regulatory_programs (id) VALUES ($1)`, [PROJECT]);
  const pack = await pg.query<{ version: string }>(
    `SELECT version FROM c2c_rule_packs WHERE doc_type='ind' AND agency='fda' LIMIT 1`,
  );
  await pg.query(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     VALUES ($1, $2, $3, 'ind', 'fda', $4, 'Backlink Doc', 'draft', 0)`,
    [DOC, ORG, PROJECT, pack.rows[0].version],
  );
  // A real action row, so the FK the trigger must respect has something to hit.
  await pg.query(
    `INSERT INTO c2c_ana_actions
       (id, org_id, domain, surface, command, target, state, proposed_by)
     VALUES ($1, $2, 'mdx', 'authoring', 'accept-ai-suggestion', 'section:m2.5', 'executed', $3)`,
    [ACTION, ORG, USER],
  );
});

afterEach(async () => {
  vi.resetModules();
  await pg?.close();
});

/** A section write as the trigger requires it: GUCs first, in one transaction. */
const save = async (body: { content: unknown; draftSource?: string; anaActionId?: string }, key = 'm2.5') =>
  pg.transaction(async (tx) => {
    await tx.query(`SELECT set_config('app.actor_id', $1, true)`, [String(USER)]);
    await tx.query(`SELECT set_config('app.reason', $1, true)`, ['backlink contract edit']);
    await tx.query(`SELECT set_config('app.ana_action_id', $1, true)`, [body.anaActionId ?? '']);
    const upd = await tx.query(
      `UPDATE c2c_document_sections SET content = $3::jsonb, draft_source = $4
        WHERE document_id = $1 AND section_key = $2`,
      [DOC, key, JSON.stringify(body.content), body.draftSource ?? null],
    );
    if (upd.affectedRows === 0) {
      await tx.query(
        `INSERT INTO c2c_document_sections (document_id, section_key, label, path_order, content, status, draft_source)
         VALUES ($1, $2, $2, 1, $3::jsonb, 'drafted', $4)`,
        [DOC, key, JSON.stringify(body.content), body.draftSource ?? null],
      );
    }
  });

async function versions() {
  const r = await pg.query<any>(
    `SELECT v.ana_action_id, v.author_kind, v.reason, v.version
       FROM c2c_document_section_versions v
       JOIN c2c_document_sections s ON s.id = v.section_id
      WHERE s.document_id = $1
      ORDER BY v.version`,
    [DOC],
  );
  return r.rows;
}

describe('c2c section version — AnA action backlink', () => {
  it('REGRESSION: an AnA-mediated edit records the action that produced it', async () => {
    await save({ content: { paragraphs: ['seed'] } });
    await save({
      content: { paragraphs: ['AnA rewrote this'] },
      draftSource: 'ana',
      anaActionId: ACTION,
    });

    const rows = await versions();
    expect(rows).toHaveLength(1);
    // NULL here before the fix, on every row ever written.
    expect(rows[0].ana_action_id).toBe(ACTION);
  });

  it('still records author_kind, which already worked', async () => {
    await save({ content: { paragraphs: ['seed'] }, draftSource: 'ana' });
    await save({ content: { paragraphs: ['second'] }, anaActionId: ACTION });
    const rows = await versions();
    // The superseded row was the AnA-drafted one.
    expect(rows[0].author_kind).toBe('ana');
  });

  it('a human edit with no action leaves the backlink NULL, not invented', async () => {
    await save({ content: { paragraphs: ['seed'] } });
    await save({ content: { paragraphs: ['human edit'] } });
    const rows = await versions();
    expect(rows[0].ana_action_id).toBeNull();
    expect(rows[0].author_kind).toBe('human');
  });

  it('an action id that is not in the ledger does not break the save', async () => {
    await save({ content: { paragraphs: ['seed'] } });
    // Throws (and fails this case) if the trigger's FK handling breaks the write.
    await save({
      content: { paragraphs: ['edit citing a ghost'] },
      anaActionId: 'act_does_not_exist',
    });
    // A dangling FK from inside a BEFORE UPDATE trigger would turn an ordinary
    // section save into a 500 — a section a reviewer cannot edit. A missing
    // backlink is a gap in the record; the save must survive.
    const rows = await versions();
    expect(rows[0].ana_action_id).toBeNull();
  });

  it('the backlink does not leak from one save to the next', async () => {
    await save({ content: { paragraphs: ['seed'] } });
    await save({ content: { paragraphs: ['ana edit'] }, anaActionId: ACTION });
    await save({ content: { paragraphs: ['later human edit'] } });
    const rows = await versions();
    expect(rows[0].ana_action_id).toBe(ACTION);
    // The GUC is transaction-local AND always set, so the third save cannot
    // inherit the second's action.
    expect(rows[1].ana_action_id).toBeNull();
  });

  it('the Part 11 reason is still the caller text, unaffected', async () => {
    await save({ content: { paragraphs: ['seed'] } });
    await save({ content: { paragraphs: ['edit'] }, anaActionId: ACTION });
    const rows = await versions();
    expect(rows[0].reason).toBe('backlink contract edit');
  });
});
