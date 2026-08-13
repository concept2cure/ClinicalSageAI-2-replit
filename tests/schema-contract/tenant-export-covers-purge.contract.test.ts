/**
 * The purge may not destroy what the export does not return.
 *
 * ── The defect this pins ──────────────────────────────────────────────────────
 * `purgeTenant` refuses to destroy a tenant without a `finalExportDigest`, on the
 * grounds that the data-return obligation must be discharged first. That gate is
 * only worth anything if the export it points at actually covers the tables the
 * purge destroys.
 *
 * It did not. Measured when this test was written, the curated manifest
 * (`tenant-export.service.ts`) covered exactly ONE of the eight tables in
 * `PURGE_CHILD_TABLES` — `regulatory_programs`. A customer offboarding would have
 * received their programme records while the purge deleted their documents, vault
 * contents, uploads, projects and workspaces. Under GDPR Art. 20 and the standard
 * MSA data-return clause that is not a discharged obligation, and the digest gate
 * would have certified it as one.
 *
 * The fix was to make the export catalog-driven rather than hand-listed. This
 * test is what stops the two drifting apart again: it is a structural invariant,
 * not a snapshot, so a table added to the purge set in six months either gets
 * exported or fails here.
 *
 * ── Why it runs against a real schema ─────────────────────────────────────────
 * `discoverTenantTables` reads `information_schema`. Asserting against a mocked
 * catalog would prove the test's own fixture agrees with itself. The real drizzle
 * lineage is applied to PGlite, exactly as the RLS probe next door does, so the
 * discovery runs over the tables the product actually ships.
 *
 * @compliance GDPR Art. 20 (data portability); 21 CFR Part 11 §11.10(e).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { citext } from '@electric-sql/pglite/contrib/citext';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PURGE_CHILD_TABLES } from '../../server/services/tenant/tenant-offboarding';
import {
  canonicalize,
  digestOf,
  discoverTenantTables,
  EXPORT_EXCLUDED_TABLES,
} from '../../server/services/tenant-export/tenant-full-export.service';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const T = 300_000;

let pg: PGlite;
let discovered: Array<{ table: string; tenantColumn: string }> = [];
/** Every base table in the fixture, read from the catalog independently of the export set. */
let tablesInFixture = new Set<string>();

/** PGlite exposes `query`; the service only needs that much of the pg Pool shape. */
const asClient = () => ({ query: (sql: string, params?: unknown[]) => pg.query(sql, params) }) as never;

beforeAll(async () => {
  pg = new PGlite({ extensions: { pgcrypto, pg_trgm, uuid_ossp, citext } });
  const safe = async (sql: string) => {
    try {
      await pg.exec(sql);
    } catch {
      await pg.exec('ROLLBACK').catch(() => undefined);
    }
  };
  for (const ext of ['pgcrypto', 'pg_trgm', '"uuid-ossp"', 'citext']) {
    await safe(`CREATE EXTENSION IF NOT EXISTS ${ext};`);
  }
  const journal = fs.readFileSync(path.join(REPO_ROOT, 'migrations/0000_sweet_joseph.sql'), 'utf8');
  for (const match of journal.matchAll(/CREATE TABLE "([a-z0-9_]+)" \([\s\S]*?\n\);/g)) {
    await safe(match[0].replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS '));
  }
  // The receipts table ships in its own migration; apply it so the export
  // lineage under test is the one a deploy produces.
  await safe(
    fs.readFileSync(path.join(REPO_ROOT, 'migrations/20260813b_tenant_export_receipts.sql'), 'utf8')
  );

  discovered = await discoverTenantTables(asClient());

  const { rows } = await pg.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  );
  tablesInFixture = new Set(rows.map(r => r.table_name));
}, T);

afterAll(async () => {
  await pg?.close().catch(() => undefined);
});

describe('export coverage vs purge destruction', () => {
  it('discovers a substantial share of the schema, not a handful of tables', () => {
    // A collapsed discovery would make every assertion below vacuous.
    expect(discovered.length).toBeGreaterThan(150);
  }, T);

  it('EVERY table the purge destroys is covered by the export', () => {
    const exported = new Set(discovered.map(d => d.table));

    // Existence is established from the CATALOG, independently of the export set.
    //
    // An earlier revision of this assertion derived "does the table exist" from
    // `discovered` — which IS the export set — so the uncovered list was
    // `!exported.has(t) && exported.has(t)`, i.e. always empty. It passed
    // unconditionally and proved nothing. Deriving the two sides from different
    // sources is what makes the comparison real.
    const uncovered = PURGE_CHILD_TABLES.filter(
      t => tablesInFixture.has(t) && !exported.has(t)
    );

    expect(
      uncovered,
      `the purge destroys these tables but the export does not return them: ${uncovered.join(', ')}`
    ).toEqual([]);

    // And the comparison has to be looking at something: if none of the purge
    // targets existed in the fixture, the assertion above would be vacuous.
    const judged = PURGE_CHILD_TABLES.filter(t => tablesInFixture.has(t));
    expect(judged.length).toBeGreaterThan(3);
  }, T);

  it('no purge target is on the export exclusion list', () => {
    // The exclusion list is for cross-tenant infrastructure and secrets. If a
    // table were ever on BOTH lists the tenant's data would be destroyed and
    // deliberately withheld from the return — the worst combination available.
    const both = PURGE_CHILD_TABLES.filter(t => EXPORT_EXCLUDED_TABLES.includes(t));
    expect(both).toEqual([]);
  });

  it('excludes secrets and cross-tenant infrastructure from the return', () => {
    const exported = new Set(discovered.map(d => d.table));
    // api_keys is the sharp one: an export is handed to a customer, and key
    // material is not part of their data.
    expect(exported.has('api_keys')).toBe(false);
    expect(exported.has('__drizzle_migrations')).toBe(false);
    expect(exported.has('stripe_events')).toBe(false);
  });

  it('resolves one tenant column per table, preferring organization_id', () => {
    const tables = discovered.map(d => d.table);
    expect(new Set(tables).size).toBe(tables.length);
    for (const d of discovered) {
      expect(['organization_id', 'org_id', 'tenant_id']).toContain(d.tenantColumn);
    }
  });

  it('provisions the receipts table the purge verifies against', async () => {
    const { rows } = await pg.query<{ n: string }>(
      `SELECT count(*) AS n FROM information_schema.tables
        WHERE table_schema='public' AND table_name='tenant_export_receipts'`
    );
    expect(Number(rows[0].n)).toBe(1);
  });
});

describe('the digest', () => {
  it('is stable under key reordering — it depends on data, not insertion order', () => {
    // Without canonicalization the same export digests differently across Node
    // versions or driver upgrades, and a receipt stops matching for reasons that
    // have nothing to do with the tenant.
    expect(digestOf({ a: 1, b: { c: 2, d: 3 } })).toBe(digestOf({ b: { d: 3, c: 2 }, a: 1 }));
  });

  it('changes when any value changes', () => {
    expect(digestOf({ a: 1 })).not.toBe(digestOf({ a: 2 }));
  });

  it('distinguishes nesting from flattening', () => {
    expect(digestOf({ a: { b: 1 } })).not.toBe(digestOf({ 'a.b': 1 }));
  });

  it('canonicalizes arrays positionally — order is data, not noise', () => {
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
  });

  it('is prefixed so the algorithm is self-describing', () => {
    expect(digestOf({})).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
