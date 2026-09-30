/**
 * No new way around RLS ships unreviewed: SECURITY DEFINER functions the
 * runtime role can call (D3, 2026-09-29; evidence
 * docs/evidence/D3/2026-09-29-definer-functions/).
 *
 * A SECURITY DEFINER function runs as its owner. Every table it reads or writes
 * is read or written past the tenant policies, whatever scope the caller is in.
 * So each one the runtime role may EXECUTE is a door around RLS, and the
 * question for each is whether its body, or its callers, keep a tenant to its
 * own rows. The RAG pipeline's vault arm (docs/evidence/D3/2026-09-24-rag-pipeline-tenant/)
 * is the shape to fear: a tenant key taken from an argument.
 *
 * scripts/db/security-definer-allowlist.json lists the reviewed ones, each
 * with a status and a reason. Since 2026-09-30 the runtime role's grant recipe
 * (scripts/db/provision-app-role.mjs, revokeUnreviewedDefinerExecute) REVOKEs
 * EXECUTE on every definer function not listed, on every deploy, so an
 * unreviewed one fails closed for the runtime role. This suite reads the
 * catalog and fails on any callable definer function that is not listed — a
 * database the recipe has not run on, or a GRANT that slipped in after it — and
 * shows the recipe revoking a planted one. It does not fail on listed functions
 * that are absent: a partial schema is not a bypass.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { revokeUnreviewedDefinerExecute } from '../../scripts/db/provision-app-role.mjs';

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const RUNTIME_ROLE = 'app_service';
const baseline = JSON.parse(
  readFileSync(resolve(__dirname, '../../scripts/db/security-definer-allowlist.json'), 'utf8')
) as { functions: Record<string, { status: string; reason: string }> };
let owner: Pool;

/** Every SECURITY DEFINER function the runtime role may execute, by signature. */
const CALLABLE_DEFINERS_SQL = `
SELECT n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE p.prosecdef
   AND p.prokind = 'f'
   AND n.nspname NOT IN ('pg_catalog', 'information_schema')
   AND has_function_privilege($1, p.oid, 'EXECUTE')
 ORDER BY 1`;

async function unlisted(db: { query: Pool['query'] }): Promise<string[]> {
  const { rows } = await db.query(CALLABLE_DEFINERS_SQL, [RUNTIME_ROLE]);
  return (rows as Array<{ sig: string }>).map(r => r.sig).filter(sig => !baseline.functions[sig]);
}

beforeAll(() => {
  if (!url) throw new Error('TEST_DATABASE_URL (or DATABASE_URL) is required');
  owner = new Pool({ connectionString: url, max: 2 });
});

afterAll(async () => {
  await owner?.end();
});

describe('only reviewed SECURITY DEFINER functions are callable by the runtime role (D3)', () => {
  it('the runtime role exists, so the privilege check means something', async () => {
    const { rows } = await owner.query(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1',
      [RUNTIME_ROLE]
    );
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });

  it('every baseline entry carries a status and a reason', () => {
    const bad = Object.entries(baseline.functions).filter(
      ([, v]) =>
        !['reviewed', 'reviewed-risk'].includes(v.status) ||
        typeof v.reason !== 'string' ||
        v.reason.trim().length < 20
    );
    expect(bad.map(([k]) => k)).toEqual([]);
  });

  it('self-test: a definer function planted in a rolled-back transaction is caught', async () => {
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      // The shape to fear: the tenant comes from the argument.
      await c.query(`
        CREATE FUNCTION public.wo03_planted_definer(p_org integer) RETURNS bigint
        LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*) FROM public.projects WHERE organization_id = p_org $$`);
      await c.query(
        'GRANT EXECUTE ON FUNCTION public.wo03_planted_definer(integer) TO app_service'
      );
      expect(await unlisted(c)).toContain('public.wo03_planted_definer(p_org integer)');
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  it("self-test: the runtime role's grant recipe revokes an unlisted one, and keeps a listed one", async () => {
    const c = await owner.connect();
    try {
      await c.query('BEGIN');
      await c.query(`
        CREATE FUNCTION public.wo03_planted_definer(p_org integer) RETURNS bigint
        LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*) FROM public.projects WHERE organization_id = p_org $$`);
      await c.query(
        'GRANT EXECUTE ON FUNCTION public.wo03_planted_definer(integer) TO app_service'
      );
      const revoked = await revokeUnreviewedDefinerExecute(c, 'app_service');
      expect(revoked).toContain('public.wo03_planted_definer(p_org integer)');
      const { rows } = await c.query(
        `SELECT has_function_privilege('app_service', 'public.wo03_planted_definer(integer)', 'EXECUTE') AS planted,
                has_function_privilege('app_service', 'identity.current_org_id()', 'EXECUTE') AS listed`
      );
      expect(rows[0]).toEqual({ planted: false, listed: true });
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  it('no callable definer function is missing from the reviewed allowlist', async () => {
    expect(
      await unlisted(owner),
      'each runs past RLS: review it and list it in scripts/db/security-definer-allowlist.json, or run the grant recipe'
    ).toEqual([]);
  });
});
