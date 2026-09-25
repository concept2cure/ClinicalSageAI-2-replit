/**
 * Every table an RLS decision reads is itself out of a tenant's reach
 * (D3, 2026-09-25; evidence docs/evidence/D3/2026-09-25-organizations-tenant-key/).
 *
 * A policy is only as strong as its inputs. Three holes closed on 2026-09-24/25
 * had one shape: the policy was sound, and a table it consulted was not.
 *
 *   - identity.org_relationships (delegate grants, read by
 *     identity.can_access_program / can_access_org): no RLS; a tenant wrote
 *     itself a grant from another tenant.
 *   - public.organizations (read by core.get_program_org_id to turn a program's
 *     org into the uuid vault RLS compares): no RLS; a tenant gave another
 *     org its own uuid. Closed by making id and uuid immutable, not by RLS —
 *     it is the one REVIEWED exception below, and its guard is checked.
 *   - core.programs (read by the same resolver): RLS, but keyed on the row's
 *     own org — so a different defect, fixed in the resolver, and pinned in
 *     tests/db/vault-program-ownership.dbtest.ts rather than here.
 *
 * This suite reads the catalog of a provisioned database and follows every
 * policy expression into the functions it calls, recursively, collecting each
 * relation a policy subquery or one of those functions reads. It fails on any
 * such relation that has no RLS while app_service may INSERT, UPDATE or DELETE
 * it. That is the first two findings' shape, stated once so the next one fails
 * here instead of being found by hand.
 *
 * It is a static reading of function source (FROM / JOIN), so dynamic SQL
 * (EXECUTE format(...)) is not followed; the self-test below shows the reading
 * reaches the case it exists for.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const RUNTIME_ROLE = 'app_service';
let owner: Pool;

/**
 * Relations read by any RLS policy or any function it reaches, that the runtime
 * role can write and that carry no RLS. Parameter $1 is the runtime role.
 */
const UNGUARDED_POLICY_INPUTS_SQL = `
WITH RECURSIVE
pol AS (SELECT coalesce(qual, '') || ' ' || coalesce(with_check, '') AS e FROM pg_policies),
fns(fn) AS (
  SELECT DISTINCT m[1] FROM pol,
    regexp_matches(e, '([a-z_][a-z0-9_]*\\.[a-z_][a-z0-9_]*)\\(', 'g') AS m
  WHERE m[1] NOT LIKE 'pg_catalog.%' AND to_regproc(m[1]) IS NOT NULL
  UNION
  SELECT m[1] FROM fns f
    JOIN pg_proc p ON p.oid = to_regproc(f.fn)
    CROSS JOIN regexp_matches(p.prosrc, '([a-z_][a-z0-9_]*\\.[a-z_][a-z0-9_]*)\\s*\\(', 'g') AS m
  WHERE m[1] NOT LIKE 'pg_catalog.%' AND to_regproc(m[1]) IS NOT NULL
),
reads AS (
  SELECT m[1] AS rel, 'a policy subquery' AS via FROM pol,
    regexp_matches(e, '(?:FROM|JOIN)\\s+([a-z_][a-z0-9_]*(?:\\.[a-z_][a-z0-9_]*)?)', 'g') AS m
  UNION
  SELECT m[1], f.fn FROM fns f
    JOIN pg_proc p ON p.oid = to_regproc(f.fn)
    CROSS JOIN regexp_matches(p.prosrc, '(?:FROM|JOIN)\\s+([a-z_][a-z0-9_]*(?:\\.[a-z_][a-z0-9_]*)?)', 'gi') AS m
)
SELECT n.nspname || '.' || c.relname AS relation,
       string_agg(DISTINCT r.via, ', ' ORDER BY r.via) AS read_by
  FROM reads r
  JOIN pg_class c
    ON c.oid = to_regclass(CASE WHEN r.rel LIKE '%.%' THEN r.rel ELSE 'public.' || r.rel END)
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind IN ('r', 'p')
   AND NOT c.relrowsecurity
   AND (has_table_privilege($1, c.oid, 'INSERT')
     OR has_table_privilege($1, c.oid, 'UPDATE')
     OR has_table_privilege($1, c.oid, 'DELETE'))
 GROUP BY 1
 ORDER BY 1`;

/**
 * Relations allowed to stay unpoliced, each with the reason and the guard that
 * makes the reason true. The guard is queried: if it is gone, the exception
 * lapses and the relation fails the sweep like any other.
 */
const REVIEWED: Record<string, { reason: string; guard: string }> = {
  'public.organizations': {
    reason:
      'Policies read only its id and uuid (core.get_program_org_id), and those are immutable ' +
      'once set. Narrowing writes to its other columns needs five platform-staff override ' +
      'routes on the system scope first (docs/evidence/D3/2026-09-25-organizations-tenant-key/).',
    guard: `SELECT EXISTS (
              SELECT 1 FROM pg_trigger
               WHERE tgrelid = 'public.organizations'::regclass
                 AND tgname = 'organizations_tenant_key_immutable'
                 AND tgenabled <> 'D')`,
  },
};

async function unguarded(db: { query: Pool['query'] }): Promise<string[]> {
  const { rows } = await db.query(UNGUARDED_POLICY_INPUTS_SQL, [RUNTIME_ROLE]);
  const out: string[] = [];
  for (const r of rows as Array<{ relation: string; read_by: string }>) {
    const reviewed = REVIEWED[r.relation];
    if (reviewed && (await db.query(reviewed.guard)).rows[0]?.exists === true) continue;
    out.push(`${r.relation} (read by ${r.read_by})`);
  }
  return out;
}

beforeAll(() => {
  if (!url) throw new Error('TEST_DATABASE_URL (or DATABASE_URL) is required');
  owner = new Pool({ connectionString: url, max: 2 });
});

afterAll(async () => {
  await owner?.end();
});

describe('RLS inputs are out of a tenant reach (D3)', () => {
  it('the runtime role exists, so the privilege checks below mean something', async () => {
    const { rows } = await owner.query(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1',
      [RUNTIME_ROLE]
    );
    expect(rows, `${RUNTIME_ROLE} is not provisioned on this database`).toHaveLength(1);
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('self-test: the sweep catches a delegate-grant table with its RLS removed', async () => {
    // The 2026-09-24 finding, reconstructed inside a transaction that is
    // always rolled back. If this fails, the sweep has stopped seeing through
    // policy -> function -> table, and a green result below would be vacuous.
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await c.query('ALTER TABLE identity.org_relationships NO FORCE ROW LEVEL SECURITY');
      await c.query('ALTER TABLE identity.org_relationships DISABLE ROW LEVEL SECURITY');
      expect((await unguarded(c)).join('\n')).toContain('identity.org_relationships');
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  it('self-test: a reviewed exception lapses when its guard is gone', async () => {
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        'ALTER TABLE public.organizations DISABLE TRIGGER organizations_tenant_key_immutable'
      );
      expect((await unguarded(c)).join('\n')).toContain('public.organizations');
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  it('no table an RLS decision reads is writable by the runtime role without RLS', async () => {
    expect(
      await unguarded(owner),
      'each of these decides a tenant boundary and can be rewritten by any tenant'
    ).toEqual([]);
  });
});
