/**
 * Security contract: an ON CONFLICT arbiter that omits the tenant column is a
 * cross-tenant write primitive.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * cmc_module3_sections and cmc_source_objects were unique on keys that omit
 * organization_id (migrations/0016:22, migrations/0017:102,107). Uniqueness is
 * what ON CONFLICT resolves against, so an org-blind key decides WHOSE ROW an
 * upsert lands on. POST /api/cmc/module3-os/compile/:projectId upserted with
 * `ON CONFLICT (project_id, section_key)` and never validated that :projectId
 * belonged to the caller.
 *
 * It was destructive rather than merely wrong because of three details that had
 * to line up, and did:
 *
 *   1. The DO UPDATE SET list does not include organization_id, so the
 *      overwritten row KEPT the victim's tenant id — invisible to the attacker,
 *      and still counted as the victim's record.
 *   2. composeModule3FromCanonicalSources emits all 17 sections regardless of
 *      input, so a caller with no sources for that project still produced 17
 *      placeholder bodies ("has no source data available").
 *   3. The upsert wrote `stale = false, stale_reason = NULL` and left
 *      approval_state alone — so the emptied sections stayed marked APPROVED and
 *      NOT-STALE, which is precisely what canFinalizeExport reads.
 *
 * Net: any authenticated user of any tenant could blank another tenant's eCTD
 * Module 3, delete its lineage, and leave it flagged ready to ship. A blind
 * write — no data comes back — so it is an integrity event, not a leak.
 *
 * ── Why these tests execute SQL ───────────────────────────────────────────────
 * A source grep cannot tell you which row an upsert lands on. That is decided by
 * the index, at runtime, in the database. So these tests build the real tables,
 * apply the REAL migration file, and then run the REAL upsert statement text
 * from the handler. The org-blind case is reproduced first, against the old
 * index, so the test proves the mechanism rather than assuming it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = path.join(REPO_ROOT, 'migrations/20260728_cmc_module3_org_scoped_uniqueness.sql');

/** Minimal shape of the two tables, matching the columns the handlers write. */
const BASE_SCHEMA = `
  CREATE TABLE cmc_module3_sections (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    integer NOT NULL,
    project_id         text    NOT NULL,
    section_key        text    NOT NULL,
    section_path       text,
    deterministic_json jsonb,
    narrative_text     text,
    compiled_hash      text,
    stale              boolean NOT NULL DEFAULT false,
    stale_reason       text,
    approval_state     text    NOT NULL DEFAULT 'draft',
    updated_at         timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE cmc_source_objects (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id integer NOT NULL,
    project_id      text    NOT NULL,
    source_type     text    NOT NULL,
    source_key      text    NOT NULL,
    source_payload  jsonb,
    source_hash     text,
    version         integer NOT NULL DEFAULT 1,
    updated_at      timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE cmc_section_lineage (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id integer NOT NULL,
    section_id      uuid    NOT NULL
  );
`;

/** The org-blind uniqueness as migrations/0016 and 0017 left it. */
const OLD_INDEXES = `
  ALTER TABLE cmc_module3_sections
    ADD CONSTRAINT cmc_module3_sections_project_section UNIQUE (project_id, section_key);
  CREATE UNIQUE INDEX cmc_source_objects_project_key_idx
    ON cmc_source_objects(project_id, source_type, source_key, version);
`;

/** The compile handler's upsert, verbatim in shape. */
const SECTION_UPSERT = (arbiter: string) => `
  INSERT INTO cmc_module3_sections (organization_id, project_id, section_key, section_path, deterministic_json, narrative_text, compiled_hash, stale, stale_reason, approval_state)
  VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,'draft')
  ON CONFLICT ${arbiter}
  DO UPDATE SET deterministic_json = excluded.deterministic_json,
                compiled_hash = excluded.compiled_hash,
                stale = excluded.stale,
                stale_reason = excluded.stale_reason,
                narrative_text = excluded.narrative_text,
                updated_at = now()
  RETURNING id`;

const VICTIM_ORG = 7;
const ATTACKER_ORG = 42;
const PROJECT = '15';
const SECTION = '3.2.S.1';

let pg: PGlite;
beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(BASE_SCHEMA);
});
afterEach(async () => {
  await pg?.close();
});

/** The victim's approved, compiled section. */
const seedVictim = async () => {
  await pg.query(
    `INSERT INTO cmc_module3_sections
       (organization_id, project_id, section_key, section_path, deterministic_json, narrative_text, compiled_hash, stale, stale_reason, approval_state)
     VALUES ($1,$2,$3,'3.2.S.1','{"sourceObjects":["real"],"completeness":100}'::jsonb,
             'Drug substance XYZ is manufactured by...', 'hash-real', false, NULL, 'approved')`,
    [VICTIM_ORG, PROJECT, SECTION],
  );
};

/** What the composer emits for a project with no sources. */
const attackerArgs = [
  ATTACKER_ORG, PROJECT, SECTION, '3.2.S.1',
  JSON.stringify({ sourceObjects: [], completeness: 0, missingInputs: ['name', 'manufacturer'] }),
  'Section 3.2.S.1 has no source data available. Required inputs: name, manufacturer.',
  'hash-empty', false, null,
];

const victimRow = async () => {
  const r = await pg.query<any>(
    `SELECT organization_id, narrative_text, approval_state, stale, deterministic_json
       FROM cmc_module3_sections WHERE organization_id = $1 AND project_id = $2 AND section_key = $3`,
    [VICTIM_ORG, PROJECT, SECTION],
  );
  return r.rows[0];
};

describe('the org-blind arbiter really was a cross-tenant write (mechanism proof)', () => {
  // This test asserts the DEFECT, against the OLD index. It exists so the fix
  // below is known to close a real mechanism rather than a theorised one. If
  // Postgres ever stopped behaving this way, this test would tell us.
  it('lands the attacker\'s empty content on the victim\'s row, keeping the victim\'s org id', async () => {
    await pg.exec(OLD_INDEXES);
    await seedVictim();

    await pg.query(SECTION_UPSERT('(project_id, section_key)'), attackerArgs);

    const row = await victimRow();
    expect(row, 'the victim row still exists — it was updated, not replaced').toBeTruthy();
    expect(row.organization_id).toBe(VICTIM_ORG);              // still theirs
    expect(row.narrative_text).toContain('no source data available'); // emptied
    expect(row.approval_state).toBe('approved');               // still shippable
    expect(row.stale).toBe(false);                             // and not flagged
  }, 60_000);

  it('leaves exactly one row — the attacker gets no row of their own', async () => {
    await pg.exec(OLD_INDEXES);
    await seedVictim();
    await pg.query(SECTION_UPSERT('(project_id, section_key)'), attackerArgs);
    const all = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM cmc_module3_sections`);
    expect(Number(all.rows[0].n)).toBe(1);
  }, 60_000);
});

describe('after the migration, the same request cannot reach another tenant', () => {
  const applyFix = async () => {
    await pg.exec(OLD_INDEXES);
    await pg.exec(fs.readFileSync(MIGRATION, 'utf8'));
  };

  it('leaves the victim\'s section completely untouched', async () => {
    await applyFix();
    await seedVictim();

    await pg.query(SECTION_UPSERT('(organization_id, project_id, section_key)'), attackerArgs);

    const row = await victimRow();
    expect(row.organization_id).toBe(VICTIM_ORG);
    expect(row.narrative_text).toContain('Drug substance XYZ');
    expect(row.approval_state).toBe('approved');
    expect(row.deterministic_json.completeness).toBe(100);
  }, 60_000);

  it('gives the attacker their own row instead', async () => {
    await applyFix();
    await seedVictim();
    await pg.query(SECTION_UPSERT('(organization_id, project_id, section_key)'), attackerArgs);

    const all = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM cmc_module3_sections`);
    expect(Number(all.rows[0].n)).toBe(2);
    const mine = await pg.query<any>(
      `SELECT organization_id, approval_state FROM cmc_module3_sections WHERE organization_id = $1`,
      [ATTACKER_ORG],
    );
    expect(mine.rows).toHaveLength(1);
    expect(mine.rows[0].approval_state).toBe('draft'); // never inherits approval
  }, 60_000);

  it('still upserts correctly WITHIN one tenant (the fix must not break recompile)', async () => {
    await applyFix();
    await seedVictim();
    const recompile = [
      VICTIM_ORG, PROJECT, SECTION, '3.2.S.1',
      JSON.stringify({ sourceObjects: ['real', 'more'], completeness: 100 }),
      'Drug substance XYZ, revised.', 'hash-v2', false, null,
    ];
    await pg.query(SECTION_UPSERT('(organization_id, project_id, section_key)'), recompile);

    const all = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM cmc_module3_sections`);
    expect(Number(all.rows[0].n), 'a same-tenant recompile must UPDATE, not insert').toBe(1);
    expect((await victimRow()).narrative_text).toBe('Drug substance XYZ, revised.');
  }, 60_000);
});

describe('the migration removes BOTH org-blind objects', () => {
  // Leaving either one behind does not merely fail to fix the defect — it turns
  // the silent clobber into a unique violation on legitimate use, because two
  // tenants compiling the same project id would collide on the narrower key.
  it('drops the 0016 constraint and the 0017 index', async () => {
    await pg.exec(OLD_INDEXES);
    await pg.exec(fs.readFileSync(MIGRATION, 'utf8'));

    const idx = await pg.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename IN ('cmc_module3_sections','cmc_source_objects')`,
    );
    const names = idx.rows.map(r => r.indexname);
    expect(names).not.toContain('cmc_module3_sections_project_section');
    expect(names).not.toContain('cmc_module3_sections_project_key_idx');
    expect(names).not.toContain('cmc_source_objects_project_key_idx');
    expect(names).toContain('cmc_module3_sections_org_project_key_idx');
    expect(names).toContain('cmc_source_objects_org_project_key_idx');
  }, 60_000);

  it('lets two tenants hold the same (project_id, section_key)', async () => {
    await pg.exec(OLD_INDEXES);
    await pg.exec(fs.readFileSync(MIGRATION, 'utf8'));
    await seedVictim();
    await expect(
      pg.query(SECTION_UPSERT('(organization_id, project_id, section_key)'), attackerArgs),
    ).resolves.toBeDefined();
  }, 60_000);

  it('is re-runnable', async () => {
    await pg.exec(OLD_INDEXES);
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    await pg.exec(sql);
    await expect(pg.exec(sql)).resolves.toBeDefined();
  }, 60_000);

  it('applies cleanly to a database that never had the old objects', async () => {
    // Fresh installs get the table from drizzle-kit push, which declares no
    // unique index at all — so the DROPs must be no-ops, not errors.
    await expect(pg.exec(fs.readFileSync(MIGRATION, 'utf8'))).resolves.toBeDefined();
  }, 60_000);
});

describe('source objects get the same protection', () => {
  const SOURCE_UPSERT = (arbiter: string) => `
    INSERT INTO cmc_source_objects (organization_id, project_id, source_type, source_key, source_payload, source_hash, version)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
    ON CONFLICT ${arbiter}
    DO UPDATE SET source_payload = excluded.source_payload, source_hash = excluded.source_hash, updated_at = NOW()
    RETURNING id`;

  it('no longer lets one tenant rewrite another\'s canonical CMC input', async () => {
    await pg.exec(OLD_INDEXES);
    await pg.exec(fs.readFileSync(MIGRATION, 'utf8'));
    await pg.query(SOURCE_UPSERT('(organization_id, project_id, source_type, source_key, version)'), [
      VICTIM_ORG, PROJECT, 'drug_substance', 'ds-1', JSON.stringify({ name: 'real' }), 'h1', 1,
    ]);
    await pg.query(SOURCE_UPSERT('(organization_id, project_id, source_type, source_key, version)'), [
      ATTACKER_ORG, PROJECT, 'drug_substance', 'ds-1', JSON.stringify({ name: 'injected' }), 'h2', 1,
    ]);

    const v = await pg.query<any>(
      `SELECT source_payload FROM cmc_source_objects WHERE organization_id = $1`, [VICTIM_ORG],
    );
    expect(v.rows[0].source_payload.name).toBe('real');
  }, 60_000);
});
