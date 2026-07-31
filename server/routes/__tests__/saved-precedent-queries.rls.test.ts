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

describe('Defense-in-depth: 0021 RLS policy denies cross-tenant reads on the request-scoped connection', () => {
  beforeEach(async () => {
    // Install the uniform tenant-isolation policy exactly as
    // migrations/0021_enable_rls_everywhere.sql does (ENABLE + FORCE + the
    // shadow-bypass USING clause), and act as a NON-owner, non-superuser role
    // so FORCE ROW LEVEL SECURITY actually engages (PGlite's default role is
    // superuser and would otherwise bypass RLS — the same owner-bypass hole
    // 0021 documents and closes with FORCE).
    await pg.exec(`
      DROP POLICY IF EXISTS tenant_isolation_policy ON saved_precedent_queries;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
          CREATE ROLE app_user NOLOGIN;
        END IF;
      END $$;
      GRANT SELECT ON saved_precedent_queries TO app_user;
      ALTER TABLE saved_precedent_queries ENABLE ROW LEVEL SECURITY;
      ALTER TABLE saved_precedent_queries FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_policy ON saved_precedent_queries
        USING (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
          OR organization_id = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    `);
  });

  afterAll(async () => {
    await pg.exec(`RESET ROLE; DROP POLICY IF EXISTS tenant_isolation_policy ON saved_precedent_queries;`);
  });

  it('with RLS_ENFORCE=on, an UNFILTERED read as tenant 1 is denied org 2 rows by Postgres', async () => {
    await pg.exec(`SET ROLE app_user;`);
    await pg.query("SELECT set_config('app.rls_enforce','on',false)");
    await pg.query("SELECT set_config('app.current_tenant_id','1',false)");

    // Deliberately NO app-layer WHERE — prove the policy alone filters.
    const enforced = await pg.query('SELECT organization_id FROM saved_precedent_queries');
    const orgs = (enforced.rows as Array<{ organization_id: number }>)
      .map(r => r.organization_id)
      .sort();
    expect(orgs).toEqual([1, 1]);

    // Shadow bypass (rls_enforce unset) → policy passes everything, proving the
    // above filtering came from the policy, not from a lucky empty table.
    await pg.query("SELECT set_config('app.rls_enforce','',false)");
    const shadow = await pg.query('SELECT organization_id FROM saved_precedent_queries');
    expect((shadow.rows as unknown[]).length).toBe(3);

    await pg.exec(`RESET ROLE;`);
  });
});
