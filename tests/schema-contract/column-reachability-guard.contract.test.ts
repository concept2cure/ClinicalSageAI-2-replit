/**
 * The column-reachability guard's contract (scripts/ci/check-column-reachability.mjs
 * over scripts/ci/lib/sql-columns.mjs).
 *
 * The guard asks: does a column the server queries exist on a database a real
 * deployment builds? Its first version answered with three regexes and a
 * co-occurrence test, and an adversarial review of its first seven findings
 * found every kind of error a guard like this can make:
 *
 *   · documents.tags — `SELECT p.tags, (…) AS documents FROM regulatory_programs p`
 *     "named" documents and tags, so it was reported; it reads regulatory_programs.
 *   · documents.summary — `c.summary` of `vault.document_catalog c`, reported
 *     against public.documents because the schema was thrown away.
 *   · stab_studies.tenant_id — exists on every deployed database, added by a
 *     catalog sweep (`EXECUTE format('ALTER TABLE %I.%I ADD COLUMN …')`) no regex
 *     could see.
 *   · 218 of 691 column-adding clauses invisible, because only the FIRST action
 *     of a multi-clause ALTER was read.
 *
 * And a fix proposed for the schema problem would have made a real defect
 * vanish: keying tables by schema made `INSERT INTO document_chunks` (public —
 * which exists nowhere) skip as "the table guard's finding", while the table
 * guard never opened .js files. These cases pin all of it, and make the guard
 * FAIL on the defects it was built for by un-wiring their migrations.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  columnsAddedIn,
  columnsCreatedIn,
  dynamicColumnAdds,
  drizzleColumns,
  columnReferences,
  referencesColumn,
  stripSqlComments,
} from '../../scripts/ci/lib/sql-columns.mjs';
import {
  buildColumnSurface,
  scanRepository,
} from '../../scripts/ci/check-column-reachability.mjs';
import {
  referencedTables,
  relationsIn,
  drizzlePushFiles,
  durableSurface,
  repoRoot,
} from '../../scripts/ci/check-migration-reachability.mjs';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const keys = (xs: { table: string; column: string }[]) => xs.map((x) => `${x.table}.${x.column}`).sort();
const refs = (sql: string, rel: string, col: string, has: (r: string, c: string) => boolean = () => false) =>
  referencesColumn(columnReferences(sql), rel, col, has);

describe('what a migration ADDS', () => {
  it('reads every action of a multi-clause ALTER, not only the first', () => {
    const sql = `ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS target text,
      ADD COLUMN occurred_at timestamptz DEFAULT now(),
      ADD CONSTRAINT audit_logs_target_ck CHECK (target <> ''),
      ADD actor_id integer;`;
    expect(keys(columnsAddedIn(sql))).toEqual(['audit_logs.actor_id', 'audit_logs.occurred_at', 'audit_logs.target']);
  });

  it('keeps a non-public schema and normalizes public away', () => {
    expect(keys(columnsAddedIn('ALTER TABLE IF EXISTS vault.documents ADD COLUMN folder_id uuid;'))).toEqual([
      'vault.documents.folder_id',
    ]);
    expect(keys(columnsAddedIn('ALTER TABLE ONLY public.t ADD COLUMN c int;'))).toEqual(['t.c']);
  });

  it('counts a column rename as creating the new name, and a table rename as nothing', () => {
    expect(keys(columnsAddedIn('ALTER TABLE t RENAME COLUMN a TO b;'))).toEqual(['t.b']);
    expect(columnsAddedIn('ALTER TABLE t RENAME TO u;')).toEqual([]);
  });

  it('joins static DDL split across concatenated literals', () => {
    const sql = `EXECUTE 'ALTER TABLE contradiction_consequence_log ' || 'ADD COLUMN IF NOT EXISTS notes TEXT';`;
    expect(keys(columnsAddedIn(sql))).toEqual(['contradiction_consequence_log.notes']);
  });
});

describe('what a migration CREATES', () => {
  it('reads two columns on one line and a quoted keyword column', () => {
    const sql = `CREATE TABLE stab_results (id serial PRIMARY KEY, unit text, pass boolean,
      "check" text, CONSTRAINT stab_results_ck CHECK (id > 0));`;
    expect(keys(columnsCreatedIn(sql))).toEqual([
      'stab_results.check', 'stab_results.id', 'stab_results.pass', 'stab_results.unit',
    ]);
  });

  it('stops at the balanced paren, so a PARTITION BY cannot run into the next statement', () => {
    const sql = `CREATE TABLE audit_log (id bigint, at timestamptz) PARTITION BY RANGE (at);
      CREATE FUNCTION f(p_tenant_id int) RETURNS void AS $$ BEGIN
        create_something();
      END $$ LANGUAGE plpgsql;
      SELECT 1
      );`;
    expect(keys(columnsCreatedIn(sql))).toEqual(['audit_log.at', 'audit_log.id']);
  });

  it('does not count a TEMP table as schema', () => {
    expect(columnsCreatedIn('CREATE TEMP TABLE scratch (x int) ON COMMIT DROP;')).toEqual([]);
  });

  it('ignores a CREATE TABLE that only a comment describes', () => {
    expect(columnsCreatedIn(stripSqlComments('-- CREATE TABLE ghost (phantom int);\nSELECT 1;'))).toEqual([]);
  });
});

describe('what drizzle DECLARES', () => {
  it('reads property-position builders only, through a multi-line $type, and pgSchema tables', () => {
    const src = `
      const vault = pgSchema('vault');
      export const t = pgTable('orders', {
        id: serial('id').primaryKey(),
        state: text('state').default('draft'),
        meta: jsonb('meta').$type<{
          a: string;
        }>(),
        placed_at: timestamp('placed_at'),
      });
      export const d = vault.table('documents', { folder: uuid('folder_id') });`;
    const { tables, columns } = drizzleColumns(src);
    expect(tables).toEqual(['orders', 'vault.documents']);
    expect(keys(columns)).toEqual([
      'orders.id', 'orders.meta', 'orders.placed_at', 'orders.state', 'vault.documents.folder_id',
    ]);
  });

  it('reads the push surface from drizzle.config.ts, not an assumed single entry', () => {
    const rel = drizzlePushFiles().map((f: string) => path.relative(repoRoot, f));
    expect(rel).toEqual(expect.arrayContaining([
      'shared/schema.ts', 'shared/schema/ana-intelligence.ts', 'shared/schema/report-os.ts',
    ]));
    // shared/cmc-schema.ts is not re-exported; drizzle never creates its tables.
    expect(rel).not.toContain('shared/cmc-schema.ts');
  });
});

describe('catalog sweeps in DO blocks', () => {
  const sweep = (filter: string, add = `'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS tenant_id INTEGER'`) => `
    DO $$ DECLARE rec record; BEGIN
      FOR rec IN SELECT table_schema, table_name FROM information_schema.tables WHERE ${filter}
      LOOP EXECUTE format(${add}, rec.table_schema, rec.table_name); END LOOP;
    END $$;`;

  it('resolves a LIKE sweep with an escaped underscore', () => {
    const { sweeps, unresolved } = dynamicColumnAdds(sweep(`table_name LIKE 'stab\\_%'`));
    expect(unresolved).toEqual([]);
    expect(sweeps[0].columns).toEqual(['tenant_id']);
    expect(sweeps[0].patterns[0].test('stab_studies')).toBe(true);
    expect(sweeps[0].patterns[0].test('stabxstudies')).toBe(false);
  });

  it('resolves IN lists, ARRAY lists and VALUES (table, column) tuples', () => {
    expect(dynamicColumnAdds(sweep(`table_name IN ('stab_capa', 'stab_chain')`)).sweeps[0].names).toEqual([
      'stab_capa', 'stab_chain',
    ]);
    const arr = `DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['kg_nodes','kg_edges'] LOOP
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN organization_id INTEGER', t); END LOOP; END $$;`;
    expect(dynamicColumnAdds(arr).sweeps[0]).toMatchObject({ names: ['kg_nodes', 'kg_edges'], columns: ['organization_id'], schema: 'public' });
    const vals = `DO $$ DECLARE spec record; BEGIN FOR spec IN SELECT * FROM (VALUES
      ('regulatory_audit_logs', 'created_at', 'timestamp')) AS t(tbl, col, definition)
      LOOP EXECUTE format('ALTER TABLE public.%I ADD COLUMN %I %s', spec.tbl, spec.col, spec.definition); END LOOP; END $$;`;
    expect(dynamicColumnAdds(vals).sweeps[0].pairs).toEqual([['regulatory_audit_logs', 'created_at']]);
  });

  it('does not mistake an ADD CONSTRAINT sweep for a column sweep', () => {
    expect(dynamicColumnAdds(sweep(`table_name IN ('a')`, `'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (x) REFERENCES y(id)'`))).toEqual({
      sweeps: [], unresolved: [],
    });
  });

  it('reports, and does not believe, a sweep whose table set cannot be resolved', () => {
    const r = dynamicColumnAdds(`DO $$ BEGIN EXECUTE 'ALTER TABLE ' || some_var || ' ADD COLUMN c int'; END $$;`);
    expect(r.sweeps).toEqual([]);
    expect(r.unresolved).toHaveLength(1);
  });

  it('vouches only for tables created BEFORE the sweep runs', () => {
    // A catalog sweep touches tables that exist when it runs. stab_studies is
    // created at set index 75 and swept at 120; a table created at 200 gets no
    // column on first deploy and must not be vouched for.
    const surface = {
      applyIndex: (rel: string) => ({ 'sweep.sql': 120 } as Record<string, number>)[rel] ?? null,
      durableTables: new Set(['stab_studies', 'stab_future']),
      creatorIndex: new Map([['stab_studies', 75], ['stab_future', 200]]),
    };
    const files = [
      { rel: 'sweep.sql', sql: sweep(`table_name LIKE 'stab\\_%'`) },
      { rel: 'dead.sql', sql: 'ALTER TABLE stab_future ADD COLUMN tenant_id text; ALTER TABLE stab_studies ADD COLUMN tenant_id text;' },
    ];
    const { durable, orphanAdds } = buildColumnSurface(surface, files);
    expect(durable.has('stab_studies.tenant_id')).toBe(true);
    expect(durable.has('stab_future.tenant_id')).toBe(false);
    expect(orphanAdds.has('stab_future.tenant_id')).toBe(true);
  });
});

describe('what a statement REFERENCES', () => {
  it('does not read an output alias as a table (documents.tags)', () => {
    const sql = `SELECT p.id, p.tags,
      (SELECT json_agg(json_build_object('id', d.id)) FROM c2c_documents d WHERE d.project_id = p.id) AS documents
      FROM regulatory_programs p WHERE p.organization_id = $1`;
    expect(refs(sql, 'documents', 'tags')).toBe(false);
    expect(refs(sql, 'regulatory_programs', 'tags')).toBe(true);
    expect(refs('SELECT d.tags FROM documents d', 'documents', 'tags')).toBe(true);
  });

  it('resolves an alias to its own relation and schema (documents.summary)', () => {
    const sql = `SELECT d.id, c.summary FROM vault.document_catalog c JOIN vault.documents d ON d.id = c.document_id`;
    expect(refs(sql, 'documents', 'summary')).toBe(false);
    expect(refs(sql, 'vault.documents', 'summary')).toBe(false);
    expect(refs(sql, 'vault.document_catalog', 'summary')).toBe(true);
    // An unqualified name is public; it must not match a vault-qualified write.
    expect(refs('UPDATE vault.documents SET tags = $1 WHERE id = $2', 'vault.documents', 'tags')).toBe(true);
    expect(refs('UPDATE vault.documents SET tags = $1 WHERE id = $2', 'documents', 'tags')).toBe(false);
  });

  it('does not count a CTE that shadows a table name', () => {
    expect(refs('WITH documents AS (SELECT 1 AS tags) SELECT tags FROM documents', 'documents', 'tags')).toBe(false);
  });

  it('counts INSERT column lists, ON CONFLICT targets and UPDATE SET targets', () => {
    expect(refs('INSERT INTO ai_claims (run_id, verifier_flags) VALUES ($1, $2)', 'ai_claims', 'verifier_flags')).toBe(true);
    expect(refs(`UPDATE gdpr_data_subject_requests SET execution_evidence = $2 WHERE id = $1`, 'gdpr_data_subject_requests', 'execution_evidence')).toBe(true);
    expect(refs(`UPDATE deviations SET resolution_date = now() WHERE id IN (SELECT id FROM capa WHERE capa.x = $1)`, 'deviations', 'resolution_date')).toBe(true);
    expect(refs(`WITH u AS (UPDATE ivdr_analytical_validations SET hook_effect = $1 WHERE id = $2 RETURNING id) SELECT id FROM u`, 'ivdr_analytical_validations', 'hook_effect')).toBe(true);
  });

  it('resolves a bare column in a join the way Postgres does', () => {
    const sql = `SELECT jsonb_array_length(verifier_flags) FROM ai_claims ac JOIN ai_generation_runs gr ON gr.id = ac.run_id`;
    // No other relation in scope has it: the statement reads it from ai_claims.
    expect(refs(sql, 'ai_claims', 'verifier_flags')).toBe(true);
    // If the other relation durably has it, Postgres reads it from there instead.
    const has = (r: string, c: string) => r === 'ai_generation_runs' && c === 'verifier_flags';
    expect(refs(sql, 'ai_claims', 'verifier_flags', has)).toBe(false);
  });

  it('lets an outer relation satisfy a bare column in a correlated subquery', () => {
    const sql = `SELECT id FROM orders o WHERE EXISTS (SELECT 1 FROM lines l WHERE l.order_id = o.id AND region = 'eu')`;
    const has = (r: string, c: string) => r === 'orders' && c === 'region';
    expect(refs(sql, 'lines', 'region', has)).toBe(false);
    expect(refs(sql, 'lines', 'region')).toBe(true);
  });
});

describe('the table guard sees what the column guard defers to it', () => {
  it('reads .js and .mjs server files, not only .ts', () => {
    // The column guard skips a table nothing durable creates as the TABLE
    // guard's finding. That deferral is sound only if the table guard reads the
    // same files — before 2026-09-22 it read .ts only, and a .js INSERT into a
    // table that exists nowhere passed both.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colgate-'));
    try {
      fs.writeFileSync(path.join(dir, 'ingest.js'), "db.query(`INSERT INTO document_chunks (doc_id) VALUES ($1)`);\n");
      fs.writeFileSync(path.join(dir, 'worker.mjs'), "db.query('SELECT id FROM roles WHERE name = $1');\n");
      const found = referencedTables(dir);
      expect(found.has('document_chunks')).toBe(true);
      expect(found.has('roles')).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('binds a table only in relation position', () => {
    expect([...relationsIn('SELECT p.tags, (SELECT 1) AS documents FROM regulatory_programs p')]).toEqual(['regulatory_programs']);
    expect([...relationsIn('WITH ranked AS (SELECT 1) SELECT * FROM ranked JOIN regulatory.submissions s ON true')]).toEqual([
      'regulatory.submissions',
    ]);
  });

  it('agrees with the column guard on which tables are durable (one surface, not two)', () => {
    const surface = durableSurface();
    expect(surface.durableTables.has('stab_studies')).toBe(true);
    // migrations/_legacy/ is never applied (install-fresh reads the top level only).
    expect(surface.isDurable('migrations/_legacy/20260524_udi_records.sql')).toBe(false);
    expect(surface.isDurable('migrations/20260507_mdx_beta_surfaces.sql')).toBe(true);
  });
});

describe('the guard fails on the defects it was built for', () => {
  // Five of the six hand-found defects were columns added only by a migration on
  // no applier (the sixth was a CHECK). Un-wire each migration and the guard must
  // name its columns — the same "verify by making the check fail" the repository
  // asks of every gate.
  const HISTORICAL: Record<string, string[]> = {
    'db/migrations/20260617_audit_events_hmac_seal.sql': ['audit_events.hmac_seal'],
    'db/migrations/20260905_gdpr_dsar_execution_evidence.sql': ['gdpr_data_subject_requests.execution_evidence'],
    'db/migrations/20260224_ai_claims_verifier_flags.sql': ['ai_claims.verifier_flags'],
    'db/migrations/20260224_binder_evidence_source_types.sql': ['ivdr_binder_evidence.source_type'],
    'db/migrations/20260225_ivdr_pack_warnings_artifact_hashes.sql': ['ivdr_packs.has_warnings', 'ivdr_packs.warnings_jsonb'],
  };

  it('reports every historical column once its migration is off the set', () => {
    const unwired = C2C_MIGRATION_FILES.filter((f: string) => !(f in HISTORICAL));
    expect(unwired.length).toBe(C2C_MIGRATION_FILES.length - Object.keys(HISTORICAL).length);
    const reported = new Set(scanRepository({ setFiles: unwired }).findings.map((f: { column: string }) => f.column));
    for (const [file, columns] of Object.entries(HISTORICAL)) {
      for (const c of columns) expect(reported.has(c), `${c} (from ${file}) must be reported when ${file} is un-wired`).toBe(true);
    }
  });

  it('reports none of them while they are wired', () => {
    const reported = new Set(scanRepository().findings.map((f: { column: string }) => f.column));
    for (const columns of Object.values(HISTORICAL)) for (const c of columns) expect(reported.has(c)).toBe(false);
  });
});
