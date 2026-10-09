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
 * scripts/ci/security-definer-baseline.json lists every such function on a
 * database provisioned from empty, each with a status and a reason. This suite
 * reads the catalog and fails on any callable definer function that is not
 * listed, so the next one is read before it ships rather than found afterwards.
 * It does not fail on listed functions that are absent: a partial schema is not
 * a bypass.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const RUNTIME_ROLE = 'app_service';
const baseline = JSON.parse(
  readFileSync(resolve(__dirname, '../../scripts/ci/security-definer-baseline.json'), 'utf8')
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

describe('SECURITY DEFINER functions the runtime role can call are reviewed (D3)', () => {
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
        !['reviewed', 'reviewed-risk', 'unreviewed'].includes(v.status) ||
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

  it('no callable definer function is missing from the reviewed baseline', async () => {
    expect(
      await unlisted(owner),
      'each runs past RLS: read it and add it to scripts/ci/security-definer-baseline.json with a reason'
    ).toEqual([]);
  });
});
