/**
 * Contract: a section version cannot be written without a real reason.
 *
 * `c2c_snapshot_section_version()` RAISES when `app.actor_id` is absent —
 * attribution is enforced by the database. The reason for change got the
 * opposite treatment one line down: `COALESCE(NULLIF(v_reason, ''),
 * 'content change')`. A writer that set the actor but not the reason silently
 * filed the literal string 'content change' into a NOT NULL Part 11 column.
 *
 * That is worse than a constraint violation. A violation gets fixed; a
 * placeholder gets filed, and an inspector reading the ledger sees a reason on
 * every version with no way to tell which ones a human actually gave.
 *
 * These tests run the REAL migrations in PGlite, in order, because the property
 * under test is a trigger body — the exact thing a mocked pool reports as
 * working while it enforces nothing. They also assert that the previous
 * migration's ana_action_id handling survived this replacement: two
 * CREATE OR REPLACE migrations against one function is precisely how a feature
 * gets silently dropped.
 *
 * @compliance 21 CFR Part 11 §11.10(e)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILES = [
  'migrations/20260527_mutation_primitives.sql',
  'migrations/20260528_phase9_document_schema.sql',
  'migrations/20260814f_section_version_ana_action_backlink.sql',
  'migrations/20260814g_section_version_reason_required.sql',
].map((f) => path.join(REPO_ROOT, f));

const ORG = 7;
const USER = 42;
const DOC = 'doc_reason';
const PROJECT = '11111111-2222-3333-4444-555555555555';
const ACTION = 'act_reason_0001';

let pg: PGlite;
let sectionId: number;

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
  `);
  for (const f of FILES) await pg.exec(fs.readFileSync(f, 'utf8'));

  await pg.query(`INSERT INTO regulatory_programs (id) VALUES ($1)`, [PROJECT]);
  const pack = await pg.query<{ version: string }>(
    `SELECT version FROM c2c_rule_packs WHERE doc_type='ind' AND agency='fda' LIMIT 1`,
  );
  await pg.query(
    `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness)
     VALUES ($1,$2,$3,'ind','fda',$4,'Reason Doc','draft',0)`,
    [DOC, ORG, PROJECT, pack.rows[0].version],
  );
  await pg.query(
    `INSERT INTO c2c_ana_actions (id, org_id, domain, surface, command, target, state, proposed_by)
     VALUES ($1,$2,'mdx','authoring','accept-ai-suggestion','section:m2.5','executed',$3)`,
    [ACTION, ORG, USER],
  );
  const s = await pg.query<{ id: number }>(
    `INSERT INTO c2c_document_sections (document_id, section_key, label, path_order, status, content, version)
     VALUES ($1,'m2.5','Clinical Overview',1,'todo', '{"text":"seed"}'::jsonb, 1)
     RETURNING id`,
    [DOC],
  );
  sectionId = s.rows[0].id;
});

afterEach(async () => {
  await pg?.close();
});

/**
 * Change the section's content with whatever GUCs the caller chose to set.
 *
 * All of it inside ONE explicit transaction, because `set_config(…, true)` is
 * transaction-local and every standalone query here is its own implicit
 * transaction — the settings would be gone by the time the UPDATE fired. That
 * is also how the product does it: the route opens a transaction, sets the
 * GUCs, and writes on the same client.
 */
async function edit(opts: { actor?: string; reason?: string | null; action?: string }) {
  await pg.query('BEGIN');
  try {
    await pg.query(`SELECT set_config('app.actor_id', $1, true)`, [opts.actor ?? String(USER)]);
    if (opts.reason !== undefined) {
      await pg.query(`SELECT set_config('app.reason', $1, true)`, [opts.reason ?? '']);
    }
    await pg.query(`SELECT set_config('app.ana_action_id', $1, true)`, [opts.action ?? '']);
    const r = await pg.query(
      `UPDATE c2c_document_sections SET content = $2 WHERE id = $1`,
      [sectionId, JSON.stringify({ text: `edited ${Math.abs(sectionId)}` })],
    );
    await pg.query('COMMIT');
    return r;
  } catch (e) {
    await pg.query('ROLLBACK').catch(() => {});
    throw e;
  }
}

async function versions() {
  const r = await pg.query<any>(
    `SELECT reason, ana_action_id, author_kind FROM c2c_document_section_versions
      WHERE section_id = $1 ORDER BY version`,
    [sectionId],
  );
  return r.rows;
}

describe('c2c section version — reason is mandatory', () => {
  it('REGRESSION: a blank reason is refused instead of becoming "content change"', async () => {
    await expect(edit({ reason: '' })).rejects.toThrow(/reason-for-change is mandatory/i);
    expect(await versions()).toHaveLength(0);
  });

  it('whitespace is not a reason', async () => {
    await expect(edit({ reason: '   ' })).rejects.toThrow(/reason-for-change is mandatory/i);
  });

  it('the placeholder string can no longer be produced by an empty reason', async () => {
    await edit({ reason: 'Reworked per FDA information request item 3' });
    const rows = await versions();
    expect(rows[0].reason).toBe('Reworked per FDA information request item 3');
    expect(rows[0].reason).not.toBe('content change');
  });

  it('the reason is stored trimmed, not padded', async () => {
    await edit({ reason: '   Corrected the dosing table   ' });
    expect((await versions())[0].reason).toBe('Corrected the dosing table');
  });

  it('attribution is still enforced, and independently', async () => {
    await expect(
      edit({ actor: '', reason: 'a perfectly good reason' }),
    ).rejects.toThrow(/attribution is mandatory/i);
  });

  it('the AnA backlink from the previous migration survived this replacement', async () => {
    // Two CREATE OR REPLACE migrations against one function is exactly how a
    // feature gets silently dropped by the later one.
    await edit({ reason: 'AnA accepted', action: ACTION });
    expect((await versions())[0].ana_action_id).toBe(ACTION);
  });

  it('a non-existent action id still does not break the save', async () => {
    await edit({ reason: 'cites a ghost action', action: 'act_nope' });
    const rows = await versions();
    expect(rows).toHaveLength(1);
    expect(rows[0].ana_action_id).toBeNull();
  });

  it('an edit that does not change content writes no version and needs no reason', async () => {
    // The trigger only fires on a real content change; a status-only update
    // must not be forced to invent a reason for a change that did not happen.
    await pg.query('BEGIN');
    await pg.query(`SELECT set_config('app.actor_id', $1, true)`, [String(USER)]);
    await pg.query(`SELECT set_config('app.reason', '', true)`);
    await pg.query(`UPDATE c2c_document_sections SET status = 'review' WHERE id = $1`, [sectionId]);
    await pg.query('COMMIT');
    expect(await versions()).toHaveLength(0);
  });
});
