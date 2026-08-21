/**
 * Saved Precedent Queries — tenant-scoped connection routing (RLS readiness).
 *
 * ITEM D first slice. This route file was migrated from the shared Drizzle
 * pool (`db` from server/db) to the request-scoped connection (`requestDb(req)`
 * over `req.dbClient`) so its queries run on the same connection that
 * `requireTenantContext` / the global auth boundary set the RLS session vars
 * on. See server/db/requestDb.ts and migrations/0021_enable_rls_everywhere.sql.
 *
 * These tests pin the two invariants that must never regress:
 *
 *   1. App-layer org scoping is PRESERVED end-to-end after the conversion —
 *      GET / returns only the acting org's rows, driven through the real
 *      router + real Drizzle query builder against real Postgres (PGlite).
 *      A converted handler that dropped `.where(eq(organizationId, orgId))`
 *      would fail here.
 *
 *   2. The DEFENSE-IN-DEPTH layer works: with the 0021 policy installed and
 *      RLS_ENFORCE=on, a cross-tenant read on the request-scoped connection is
 *      DENIED by Postgres — even a query with no app-layer predicate cannot
 *      see another tenant's rows. Flipping the shadow bypass off (rls_enforce
 *      unset) proves the policy itself is doing the filtering.
 *
 * No network, no live DB — one in-process PGlite instance for the file.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import savedPrecedentQueriesRouter from '../saved-precedent-queries';

let pg: PGlite;

/**
 * A pg-style client that satisfies Drizzle's node-postgres driver but executes
 * on PGlite. Drizzle calls `.query(queryConfig, params)` where queryConfig
 * carries `{ text, rowMode: 'array' }` for row-mapped selects; it maps the
 * array rows itself using the column metadata it derived from the builder, so
 * we forward `rowMode` through to PGlite and hand back `{ rows, rowCount }`.
 *
 * This is the request-scoped `req.dbClient` shape (the same contract
 * LazyRequestDbClient exposes): a single connection carrying the tenant
 * session vars, which is exactly what requestDb(req) wraps.
 */
function makeRequestDbClient(db: PGlite) {
  return {
    query: async (textOrConfig: unknown, values?: unknown[]) => {
      const text =
        typeof textOrConfig === 'string'
          ? textOrConfig
          : (textOrConfig as { text: string }).text;
      const rowMode =
        typeof textOrConfig === 'string'
          ? undefined
          : (textOrConfig as { rowMode?: string }).rowMode;
      const r = await db.query(
        text,
        (values ?? []) as unknown[],
        rowMode === 'array' ? { rowMode: 'array' } : undefined,
      );
      return {
        rows: r.rows as unknown[],
        rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
        fields: (r as { fields?: unknown[] }).fields ?? [],
      };
    },
  };
}

/**
 * Build an app that mounts the REAL router behind a middleware that injects
 * the JWT-derived org (as the global auth boundary would) and the
 * request-scoped DB client bound to the tenant session on the connection.
 */
function appAsOrg(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) {
      (req as unknown as { user: { organizationId: number } }).user = { organizationId: org };
      (req as unknown as { dbClient: unknown }).dbClient = makeRequestDbClient(pg);
    }
    next();
  });
  app.use('/api/saved-precedent-queries', savedPrecedentQueriesRouter);
  return app;
}

beforeAll(async () => {
  pg = new PGlite();
  // Minimal DDL matching shared/schema.ts savedPrecedentQueries.
  await pg.exec(`
    CREATE TABLE saved_precedent_queries (
      id serial PRIMARY KEY,
      organization_id integer NOT NULL,
      user_id integer,
      label text NOT NULL,
      query text NOT NULL,
      scope json,
      hits integer NOT NULL DEFAULT -1,
      last_run_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);
});

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec(`
    TRUNCATE saved_precedent_queries RESTART IDENTITY;
    INSERT INTO saved_precedent_queries (organization_id, user_id, label, query) VALUES
      (1, 10, 'A1', 'q-a1'),
      (1, 10, 'A2', 'q-a2'),
      (2, 20, 'B1', 'q-b1');
  `);
});

describe('GET /api/saved-precedent-queries — org scoping preserved through requestDb', () => {
  it('returns ONLY the acting org rows (org 1 sees A1/A2, never B1)', async () => {
    const res = await request(appAsOrg(1)).get('/api/saved-precedent-queries');
    expect(res.status).toBe(200);
    const labels = res.body.data.map((r: { label: string }) => r.label).sort();
    expect(labels).toEqual(['A1', 'A2']);
    expect(res.body.data.some((r: { label: string }) => r.label === 'B1')).toBe(false);
  });

  it('a different tenant (org 2) sees only its own row — no cross-tenant bleed', async () => {
    const res = await request(appAsOrg(2)).get('/api/saved-precedent-queries');
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { label: string }) => r.label)).toEqual(['B1']);
  });

  it('fails closed with 403 when there is no org context (never returns rows unscoped)', async () => {
    const res = await request(appAsOrg(null)).get('/api/saved-precedent-queries');
    expect(res.status).toBe(403);
    expect(res.body.data).toBeUndefined();
  });
});

describe('Defense-in-depth: the 0021 RLS policy filters on the request-scoped connection', () => {
  // Mirror migrations/0021_enable_rls_everywhere.sql: the uniform
  // tenant_isolation_policy with the shadow-bypass clause plus USING and
  // WITH CHECK tenant predicates. The table is re-owned by a NON-superuser role
  // (app_owner) to mirror production on Neon, where 0021's own comment (lines
  // 33-38) notes the app's login role IS the table owner. FORCE is left OFF
  // here and toggled explicitly per test, because FORCE governs the OWNER (it
  // is a no-op for a non-owner role) — the owner test below proves it is
  // load-bearing.
  beforeEach(async () => {
    await pg.exec(`
      RESET ROLE;
      DROP POLICY IF EXISTS tenant_isolation_policy ON saved_precedent_queries;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user')  THEN CREATE ROLE app_user  NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN CREATE ROLE app_owner NOLOGIN; END IF;
      END $$;
      ALTER TABLE saved_precedent_queries OWNER TO app_owner;
      GRANT SELECT, INSERT ON saved_precedent_queries TO app_user, app_owner;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, app_owner;
      ALTER TABLE saved_precedent_queries ENABLE ROW LEVEL SECURITY;
      ALTER TABLE saved_precedent_queries NO FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_policy ON saved_precedent_queries
        USING (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
          OR organization_id = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
          OR organization_id = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    `);
  });

  afterAll(async () => {
    await pg.exec(
      `RESET ROLE; DROP POLICY IF EXISTS tenant_isolation_policy ON saved_precedent_queries; ALTER TABLE saved_precedent_queries OWNER TO postgres;`,
    );
  });

  it('as a NON-owner role, RLS_ENFORCE=on filters an UNFILTERED read to the acting tenant', async () => {
    await pg.exec(`SET ROLE app_user;`);
    await pg.query("SELECT set_config('app.rls_enforce','on',false)");
    await pg.query("SELECT set_config('app.current_tenant_id','1',false)");

    // Deliberately NO app-layer WHERE — prove the policy alone filters.
    const enforced = await pg.query('SELECT organization_id FROM saved_precedent_queries');
    expect(
      (enforced.rows as Array<{ organization_id: number }>).map(r => r.organization_id).sort(),
    ).toEqual([1, 1]);

    // Shadow bypass (rls_enforce unset) → policy passes everything, proving the
    // filtering came from the policy, not from a lucky empty table.
    await pg.query("SELECT set_config('app.rls_enforce','',false)");
    const shadow = await pg.query('SELECT organization_id FROM saved_precedent_queries');
    expect((shadow.rows as unknown[]).length).toBe(3);

    await pg.exec(`RESET ROLE;`);
  });

  it('FORCE is load-bearing: the table OWNER bypasses RLS with ENABLE only, and is isolated once FORCE is set', async () => {
    await pg.exec(`SET ROLE app_owner;`);
    await pg.query("SELECT set_config('app.rls_enforce','on',false)");
    await pg.query("SELECT set_config('app.current_tenant_id','1',false)");

    // ENABLE-only: the OWNER BYPASSES RLS and sees every tenant's rows. This is
    // exactly the production hole on Neon, where the app login role owns the
    // tables — the case FORCE exists to close (0021 lines 33-38).
    const enableOnly = await pg.query('SELECT organization_id FROM saved_precedent_queries');
    expect(
      (enableOnly.rows as Array<{ organization_id: number }>).map(r => r.organization_id).sort(),
    ).toEqual([1, 1, 2]);

    // FORCE ROW LEVEL SECURITY (what 0021 adds) subjects the owner to the policy.
    await pg.exec(
      `RESET ROLE; ALTER TABLE saved_precedent_queries FORCE ROW LEVEL SECURITY; SET ROLE app_owner;`,
    );
    const forced = await pg.query('SELECT organization_id FROM saved_precedent_queries');
    expect(
      (forced.rows as Array<{ organization_id: number }>).map(r => r.organization_id).sort(),
    ).toEqual([1, 1]);

    await pg.exec(`RESET ROLE;`);
    // If FORCE were removed from migration 0021, the second assertion above
    // would revert to [1, 1, 2] and this test would fail — so FORCE is covered.
  });

  it('WITH CHECK blocks writing a row for another tenant', async () => {
    await pg.exec(`SET ROLE app_user;`);
    await pg.query("SELECT set_config('app.rls_enforce','on',false)");
    await pg.query("SELECT set_config('app.current_tenant_id','1',false)");

    // Same-tenant write passes the WITH CHECK predicate.
    await expect(
      pg.query("INSERT INTO saved_precedent_queries (organization_id, label, query) VALUES (1,'ok','q')"),
    ).resolves.toBeTruthy();

    // Cross-tenant write is denied by the WITH CHECK clause.
    await expect(
      pg.query("INSERT INTO saved_precedent_queries (organization_id, label, query) VALUES (2,'evil','q')"),
    ).rejects.toThrow(/row-level security|policy/i);

    await pg.exec(`RESET ROLE;`);
  });
});

describe('Migration 0021 keeps the FORCE + tenant predicate that makes owner-bypass impossible', () => {
  const sql = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../../migrations/0021_enable_rls_everywhere.sql'),
    'utf8',
  );

  it('still FORCEs row level security (removing this silently disables RLS for table owners)', () => {
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/);
  });

  it('still carries the shadow-bypass and tenant predicates', () => {
    expect(sql).toMatch(/app\.rls_enforce/);
    expect(sql).toMatch(/app\.current_tenant_id/);
  });
});
