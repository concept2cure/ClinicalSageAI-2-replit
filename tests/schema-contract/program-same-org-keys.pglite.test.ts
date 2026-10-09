/**
 * A record names a project of its own organization only — at the database
 * (PF-04, project first; D3).
 *
 * Five stores carry a project key (a `regulatory_programs` UUID) beside their
 * own organization column, and nothing held the two together: a record of
 * organization 2 could name organization 1's project, and would then be listed
 * in that project, placed in its filing and counted in its readiness. The
 * writers check first now; 20260926b makes the database refuse it too, for
 * every writer, including the ones that do not exist yet.
 *
 * Real DDL: each store is built by the files that create it, a cross-
 * organization legacy row is written into each BEFORE the keys (the rows the
 * NOT VALID keys must leave alone), then the file is applied, and then every
 * creator and the file are replayed, as the next deploy does (CLAUDE.md Rule 1).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES, UUID_TENANT_ISOLATION_NONPUBLIC } from '../../scripts/db/migration-set.mjs';
import { runProgramSameOrgPreflight } from '../../scripts/db/program-same-org-preflight.mjs';
import { extractTableDdl } from '../golden-journeys/harness';

const ROOT = join(__dirname, '..', '..');
const sql = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const KEYS = 'migrations/20260926b_program_same_org_keys.sql';

/** Every file that creates a keyed store or its key column, in apply order. */
const CREATORS = [
  'migrations/20260524_program_workbench_schema.sql',
  'migrations/20260814_projects_regulatory_program_anchor.sql',
  'db/migrations/20260725_authoring_document_loop_tables.sql',
  // The loop file builds these too; the ALTER-closure contract holds a harness
  // to the files that alter what it builds.
  'db/migrations/20260730_authoring_comments_router_columns.sql',
  'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
  'migrations/20260727_authoring_document_program_scope.sql',
  'db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
  'migrations/20260726_cre_source_program_scope.sql',
  'migrations/20260829_cre_source_versioning.sql',
  'migrations/20260527_mutation_primitives.sql',
  'migrations/20260528_phase9_document_schema.sql',
  'migrations/20260529_phase9_backfill.sql',
];

const P1 = '11111111-1111-4111-8111-111111111111'; // organization 1
const P2 = '22222222-2222-4222-8222-222222222222'; // organization 2
const P_MISSING = '99999999-9999-4999-8999-999999999999'; // no such program

interface Store {
  table: string;
  constraint: string;
  key: string;
  org: string;
  /** The column a test row is found by. */
  tag: string;
  insert: (org: number | null, key: string | null, tag: string) => [string, unknown[]];
  /** A change to a column that is neither the key nor the organization. */
  touch: string;
  /** ON DELETE SET NULL (key) — false for c2c_documents, NO ACTION like its older key. */
  nulls: boolean;
}

const STORES: Store[] = [
  {
    table: 'projects', constraint: 'projects_regulatory_program_same_org_fk',
    key: 'regulatory_program_id', org: 'organization_id', tag: 'name', touch: `status = 'active'`, nulls: true,
    insert: (org, key, tag) => [
      `INSERT INTO projects (organization_id, client_workspace_id, name, type, regulatory_program_id) VALUES ($1, $1, $3, 'regulatory', $2)`,
      [org, key, tag],
    ],
  },
  {
    table: 'authoring_documents', constraint: 'authoring_documents_program_same_org_fk',
    key: 'client_program_id', org: 'tenant_id', tag: 'title', touch: `status = 'review'`, nulls: true,
    insert: (org, key, tag) => [
      `INSERT INTO authoring_documents (id, title, created_by, tenant_id, client_program_id) VALUES (gen_random_uuid(), $3, 'u', $1, $2)`,
      [org, key, tag],
    ],
  },
  {
    table: 'cre_evidence_sources', constraint: 'cre_evidence_sources_program_same_org_fk',
    key: 'client_program_id', org: 'organization_id', tag: 'title', touch: `sponsor = 'Acme'`, nulls: true,
    insert: (org, key, tag) => [
      `INSERT INTO cre_evidence_sources (source_type, organization_id, client_program_id, title) VALUES ('client_document', $1, $2, $3)`,
      [org, key, tag],
    ],
  },
  {
    table: 'c2c_documents', constraint: 'c2c_documents_project_same_org_fk',
    key: 'project_id', org: 'org_id', tag: 'id', touch: `status = 'locked'`, nulls: false,
    insert: (org, key, tag) => [
      `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title) VALUES ($3, $1, $2, 'ind', 'fda', 'ich-m4-v2.0', 'IND')`,
      [org, key, tag],
    ],
  },
  {
    table: 'cdisc_prm_studies', constraint: 'cdisc_prm_studies_program_same_org_fk',
    key: 'program_id', org: 'tenant_id', tag: 'study_id', touch: `protocol_title = 'Revised'`, nulls: true,
    insert: (org, key, tag) => [
      `INSERT INTO cdisc_prm_studies (tenant_id, study_id, protocol_id, protocol_title, protocol_version, program_id) VALUES ($1, $3, 'p', 't', '1', $2)`,
      [org, key, tag],
    ],
  },
];

let db: PGlite;

/** The SQLSTATE a statement fails with, or null when it succeeds. */
async function sqlState(text: string, params: unknown[] = []): Promise<{ code: string | null; message: string }> {
  try {
    await db.query(text, params);
    return { code: null, message: '' };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { code: err.code ?? 'unknown', message: err.message ?? '' };
  }
}

async function rowsTagged(st: Store, tag: string) {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id, ${st.key} AS key, ${st.org} AS org FROM ${st.table} WHERE ${st.tag} = $1`,
    [tag],
  );
  return rows;
}

async function applyCreators() {
  for (const f of CREATORS) await db.exec(sql(f));
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, email TEXT);
    INSERT INTO organizations (id, name) VALUES (1, 'acme'), (2, 'other');
    INSERT INTO users (id, name) VALUES (7, 'u');
  `);
  // Drizzle-pushed base tables (no creator file on the set), then every creator.
  await db.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['client_workspaces', 'projects', 'cdisc_prm_studies']));
  await applyCreators();
  // The study-design key column, as the hand-run link file (and drizzle push) left it.
  await db.exec(`ALTER TABLE cdisc_prm_studies ADD COLUMN IF NOT EXISTS program_id uuid`);
  await db.exec(`
    INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name) VALUES
      ('${P1}', 1, 'Alpha IND', 'A-1', 'ind', 'drug', 'FDA', 'Alpha'),
      ('${P2}', 2, 'Other IND', 'O-1', 'ind', 'drug', 'FDA', 'Other');
    INSERT INTO client_workspaces (id, organization_id, name, slug) VALUES (1, 1, 'w1', 'w1'), (2, 2, 'w2', 'w2');
  `);
  // The legacy rows: organization 2's records naming organization 1's project,
  // written before the keys existed. A GLOBAL_PUBLIC source with a project too.
  for (const st of STORES) {
    const [text, params] = st.insert(2, P1, `legacy-${st.table}`);
    await db.query(text, params);
  }
  await db.query(...STORES[2].insert(null, P1, 'legacy-global-public'));
  await db.exec(sql(KEYS));
  // The next deploy: every creator, then the keys, again.
  await applyCreators();
  await db.exec(sql(KEYS));
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe('20260926b on the applier', () => {
  it('runs after every file that creates what it keys, and before the tenant sweep', () => {
    const files = C2C_MIGRATION_FILES as string[];
    const at = files.indexOf(KEYS);
    expect(at).toBeGreaterThan(-1);
    for (const f of [...CREATORS.filter((c) => files.includes(c)), 'migrations/20260925b_submissions_program_anchor.sql']) {
      expect(files.indexOf(f), f).toBeLessThan(at);
    }
    expect(at).toBeLessThan(files.indexOf(UUID_TENANT_ISOLATION_NONPUBLIC as string));
  });

  it('the creators’ replayed comments name the key, not "no FK" (amended in place, Rule 1)', async () => {
    for (const [table, column, constraint] of [
      ['projects', 'regulatory_program_id', 'projects_regulatory_program_same_org_fk'],
      ['authoring_documents', 'client_program_id', 'authoring_documents_program_same_org_fk'],
      ['cre_evidence_sources', 'client_program_id', 'cre_evidence_sources_program_same_org_fk'],
    ]) {
      const { rows } = await db.query<{ c: string }>(
        `SELECT col_description(a.attrelid, a.attnum) AS c FROM pg_attribute a
          WHERE a.attrelid = $1::regclass AND a.attname = $2`,
        [table, column],
      );
      expect(rows[0].c, table).toContain(constraint);
      expect(rows[0].c, table).not.toMatch(/No FK|FK-free/);
    }
  });
});

describe.each(STORES)('$table: ($key, $org) → regulatory_programs (id, organization_id)', (st) => {
  it('holds one NOT VALID key with its delete action, after a replay', async () => {
    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT c.convalidated, c.confdeltype, c.confupdtype, c.confdelsetcols::text AS setcols, a.attnum
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = $2
        WHERE c.conname = $1 AND c.conrelid = $3::regclass`,
      [st.constraint, st.key, st.table],
    );
    expect(rows).toHaveLength(1);
    // SET NULL of the key column alone; c2c_documents NO ACTION like its older key.
    expect(rows[0]).toMatchObject({ convalidated: false, confdeltype: st.nulls ? 'n' : 'a', confupdtype: 'a' });
    expect(rows[0].setcols).toBe(st.nulls ? `{${rows[0].attnum}}` : null);
  });

  it('refuses another organization’s project and a missing one; admits its own, and none', async () => {
    const foreign = await sqlState(...st.insert(1, P2, `foreign-${st.table}`));
    expect(foreign.code, foreign.message).toBe('23503');
    expect(foreign.message).toContain(st.constraint);
    // A missing program: c2c_documents' own older key may refuse it first.
    expect((await sqlState(...st.insert(1, P_MISSING, `missing-${st.table}`))).code).toBe('23503');
    for (const [key, tag] of [[P1, 'own'], [null, 'none']] as const) {
      const [text, params] = st.insert(1, key, `${tag}-${st.table}`);
      expect((await sqlState(text, params)).code, tag).toBeNull();
    }
  });

  it('keeps a legacy cross-organization row writable, but never re-keyed and never validated', async () => {
    const legacy = `legacy-${st.table}`;
    expect((await sqlState(`UPDATE ${st.table} SET ${st.touch} WHERE ${st.tag} = $1`, [legacy])).code).toBeNull();
    const rekey = await sqlState(`UPDATE ${st.table} SET ${st.key} = $1 WHERE ${st.tag} = $2`, [P_MISSING, legacy]);
    expect(rekey.code).toBe('23503');
    expect((await sqlState(`ALTER TABLE ${st.table} VALIDATE CONSTRAINT ${st.constraint}`)).code).toBe('23503');
    expect(await rowsTagged(st, legacy)).toMatchObject([{ key: P1, org: 2 }]);
  });

  it('the pre-flight lists exactly the rows the key does not cover', async () => {
    const report = (await runProgramSameOrgPreflight(db)).find((r) => r.relation === `public.${st.table}`);
    expect(report?.skipped).toBe(false);
    const expected = [...(await rowsTagged(st, `legacy-${st.table}`))];
    if (st.table === 'cre_evidence_sources') expected.push(...(await rowsTagged(st, 'legacy-global-public')));
    expect(report?.rows.map((r: { id: unknown }) => String(r.id)).sort()).toEqual(expected.map((r) => String(r.id)).sort());
  });
});

describe('the rest of the contract', () => {
  it('a GLOBAL_PUBLIC source (no organization) carries no project', async () => {
    const r = await sqlState(...STORES[2].insert(null, P1, 'public-with-project'));
    expect(r.code, r.message).toBe('23514');
    expect(r.message).toContain('cre_evidence_sources_program_needs_org');
    expect((await sqlState(...STORES[2].insert(null, null, 'public-crl'))).code).toBeNull();
  });

  it('a program its organization’s records name cannot be moved to another organization', async () => {
    const r = await sqlState(`UPDATE regulatory_programs SET organization_id = 2 WHERE id = $1`, [P1]);
    expect(r.code, r.message).toBe('23503');
  });

  it('adds the study-design key column where no applier ever did, once', async () => {
    const fresh = new PGlite();
    try {
      await fresh.exec(`CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);`);
      await fresh.exec(sql('migrations/20260524_program_workbench_schema.sql'));
      await fresh.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['cdisc_prm_studies']));
      await fresh.exec(sql(KEYS));
      await fresh.exec(sql(KEYS));
      const { rows } = await fresh.query<{ cols: number; idx: number; keys: number }>(
        `SELECT (SELECT count(*)::int FROM pg_attribute WHERE attrelid = 'cdisc_prm_studies'::regclass AND attname = 'program_id') AS cols,
                (SELECT count(*)::int FROM pg_indexes WHERE indexname = 'prm_program_idx') AS idx,
                (SELECT count(*)::int FROM pg_constraint WHERE conname = 'cdisc_prm_studies_program_same_org_fk') AS keys`,
      );
      expect(rows[0]).toEqual({ cols: 1, idx: 1, keys: 1 });
    } finally {
      await fresh.close();
    }
  });
});

// Last: it deletes a program. A tenant purge deletes regulatory_programs, so a
// NO ACTION key would abort it at the first anchored record.
describe('a purge-shaped delete of an organization’s programs', () => {
  it('is refused while c2c_documents still names them — both its keys are NO ACTION, whichever fires first', async () => {
    const r = await sqlState(`DELETE FROM regulatory_programs WHERE organization_id = 1`);
    expect(r.code).toBe('23503');
    expect(r.message).toMatch(/c2c_documents/);
  });

  it('in the operator’s order — clear what the pre-flight lists, delete c2c_documents, then the programs — each own record keeps its organization and loses only its key', async () => {
    await db.exec('BEGIN');
    try {
      // 1. The pre-flight's c2c row (organization 2 naming organization 1's
      //    program): its older single-column key would block the delete.
      await db.query(`UPDATE c2c_documents SET project_id = NULL WHERE id = 'legacy-c2c_documents'`);
      // 2. The purge deletes c2c_documents before the programs (D6).
      await db.query(`DELETE FROM c2c_documents WHERE org_id = 1`);
      expect((await sqlState(`DELETE FROM regulatory_programs WHERE organization_id = 1`)).code).toBeNull();
      for (const st of STORES.filter((x) => x.nulls)) {
        expect(await rowsTagged(st, `own-${st.table}`), st.table).toMatchObject([{ key: null, org: 1 }]);
        // SET NULL matches (key, organization) only: a legacy cross-organization
        // row is left naming the deleted program. The pre-flight lists it first.
        expect(await rowsTagged(st, `legacy-${st.table}`), st.table).toMatchObject([{ key: P1, org: 2 }]);
      }
    } finally {
      await db.exec('ROLLBACK');
    }
  });
});
