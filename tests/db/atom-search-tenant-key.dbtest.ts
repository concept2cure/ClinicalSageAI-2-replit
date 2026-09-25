/**
 * An atom search runs under the session's tenant key, or it does not run
 * (D3, 2026-09-24; evidence docs/evidence/D3/2026-09-24-atom-search-tenant-key/).
 *
 * `enhancedEmbeddingService.searchHybrid` is the one road into
 * lumen_data_atoms for AI retrieval — Authoring's AI draft, deep research,
 * AnA chat, AI section editing and template generation, evidence-ask, the
 * cortex search, and the RAG pipeline's project arm all end in it. It had two
 * ways to read another tenant's evidence:
 *
 *   - with NO key it ran search_atoms_hybrid unfiltered, ranking every
 *     tenant's atoms. Authoring's AI draft and deep research never passed a
 *     key, and until search_atoms_hybrid was fixed (docs/evidence/D4/
 *     2026-09-24-atom-search/) that failed on every call, so nobody saw it;
 *   - with a key it trusted the key, and nine routes built theirs as
 *     `tenantContext?.organizationUuid || req.headers['x-org-uuid']`.
 *
 * Each is contained where RLS enforces, because lumen_data_atoms' policy keys
 * on the session's GUC. D3 asks for more than that: the application must hold
 * the boundary with the policy off. So these cases run twice in the evidence —
 * RLS enforcing, and RLS disabled on lumen_data_atoms — and pass both ways.
 *
 * The cases drive the service the way every route now does: inside the tenant
 * scope the auth boundary opens, with the key from currentTenantOrgUuid.
 * Only the query embedding is stubbed; the model is not what is under test.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getPool } from '../../server/db/runtime';
import { runWithSystemTenantScope, runWithTenantScope } from '../../server/db/tenantStore';
import {
  currentTenantOrgUuid,
  TenantKeyRequiredError,
  TenantScopeMismatchError,
} from '../../server/db/currentTenant';
import { EnhancedEmbeddingService } from '../../server/services/enhancedEmbeddingService';
import {
  TAG,
  ORG_A,
  ORG_B,
  FIXTURE_ORGS,
  owner,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

const DIM = 1536;
/** A unit vector along axis 0, mixed with axis 1 so its cosine to axis 0 is `cos`. */
function vec(cos: number): string {
  const v = new Array<number>(DIM).fill(0);
  v[0] = cos;
  v[1] = Math.sqrt(1 - cos * cos);
  return `[${v.join(',')}]`;
}
const QUERY = 'nephrotoxicity signal';
const QUERY_VECTOR = JSON.parse(vec(1)) as number[];
const uuidOf: Record<'A' | 'B', string> = { A: '', B: '' };

async function atom(org: number, k: number, cos: number, label: string) {
  await owner.query(
    `INSERT INTO lumen_data_atoms
       (organization_id, source_type, source_id, atom_type, title, content, status, embedding, created_at, updated_at)
     VALUES ($1,'document',$2,'finding',$3,$4,'active',$5::vector, now(), now())`,
    [org, `${TAG}-tk-${label}-${k}`, `${TAG} ${label} ${k}`, `${label}: a ${QUERY} in ${TAG}`, vec(cos)],
  );
}

function service(pool: unknown) {
  const s = new EnhancedEmbeddingService(pool as never);
  vi.spyOn(s, 'embed').mockResolvedValue({
    text: QUERY,
    embedding: QUERY_VECTOR,
    model: 'text-embedding-3-small',
    dimensions: DIM,
    cached: false,
  } as never);
  return s;
}

/** Tenant A's request scope as the auth boundary opens it. `orgUuid` is absent
 *  on the degraded membership path — exactly when the header fallbacks fired. */
const asTenantA = <T>(fn: () => Promise<T>, orgUuid: string | null = uuidOf.A) =>
  runWithTenantScope(
    { tenantId: String(ORG_A), orgUuid, role: 'member', source: 'request', caller: 'atom-search-tenant-key' },
    fn,
  );

/** The search_atoms_hybrid statements issued from here on. A spy on an
 *  already-spied method is the same spy, so its history is cleared first —
 *  otherwise an earlier case's legitimate search would read as this one's. */
function atomSearchCalls(pool: { query: (...a: unknown[]) => unknown }) {
  const spy = vi.spyOn(pool, 'query');
  spy.mockClear();
  return () =>
    spy.mock.calls
      .map((c) => String(c[0]))
      .filter((sql) => sql.includes('search_atoms_hybrid'));
}

const titles = (rows: Array<{ title: string }>) => rows.map((r) => r.title);

beforeAll(async () => {
  await provisionTwoTenantFixture();
  const orgs = await owner.query<{ id: number; uuid: string }>(
    'SELECT id, uuid::text AS uuid FROM organizations WHERE id = ANY($1::int[])',
    [FIXTURE_ORGS],
  );
  for (const o of orgs.rows) uuidOf[o.id === ORG_A ? 'A' : 'B'] = o.uuid;

  // Tenant B's atoms score HIGHER than tenant A's, so any search that is not
  // held to tenant A surfaces B's first.
  for (let k = 0; k < 4; k++) {
    await atom(ORG_A, k, 0.8, 'tenant-A');
    await atom(ORG_B, k, 1, 'tenant-B');
  }
}, 120_000);

afterAll(async () => {
  vi.restoreAllMocks();
  if (owner) {
    await owner.query(`DELETE FROM lumen_data_atoms WHERE source_id LIKE $1`, [`${TAG}-tk-%`]);
  }
  await teardownTwoTenantFixture();
});

describe("an atom search runs under the session's tenant key", () => {
  it('serves tenant A its own atoms (positive control)', async () => {
    const rows = await asTenantA(() => service(getPool()).searchHybrid(QUERY, 5, 0.7, uuidOf.A));
    expect(titles(rows).join('\n')).not.toMatch(/tenant-B/);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("refuses a key naming another tenant, and runs no search", async () => {
    const pool = getPool();
    const calls = atomSearchCalls(pool as never);
    let out: unknown;
    try {
      out = await asTenantA(() => service(pool).searchHybrid(QUERY, 5, 0.7, uuidOf.B));
    } catch (err) {
      out = err;
    }
    expect(JSON.stringify(out ?? null)).not.toMatch(/tenant-B/);
    expect(out).toBeInstanceOf(TenantScopeMismatchError);
    expect(calls()).toEqual([]);
  });

  it('refuses to run with no key at all — never the unfiltered search', async () => {
    const pool = getPool();
    const calls = atomSearchCalls(pool as never);
    let out: unknown;
    try {
      out = await asTenantA(() => service(pool).searchHybrid(QUERY, 5, 0.7, undefined as never));
    } catch (err) {
      out = err;
    }
    expect(JSON.stringify(out ?? null)).not.toMatch(/tenant-B/);
    expect(out).toBeInstanceOf(TenantKeyRequiredError);
    expect(calls()).toEqual([]);
  });

  it("resolves the session's own key when the scope carries none (the degraded membership path)", async () => {
    const key = await asTenantA(() => currentTenantOrgUuid(getPool()), null);
    expect(key).toBe(uuidOf.A);
  });

  it('on that degraded path, a key naming another tenant is still refused', async () => {
    let out: unknown;
    try {
      out = await asTenantA(() => service(getPool()).searchHybrid(QUERY, 5, 0.7, uuidOf.B), null);
    } catch (err) {
      out = err;
    }
    expect(JSON.stringify(out ?? null)).not.toMatch(/tenant-B/);
    expect(out).toBeInstanceOf(TenantScopeMismatchError);
  });

  it('names no key outside a per-user scope', async () => {
    expect(await currentTenantOrgUuid(getPool())).toBeNull();
    expect(await runWithSystemTenantScope('atom-search-tenant-key', () => currentTenantOrgUuid(getPool()))).toBeNull();
  });

  it('outside any scope the key is the only boundary, and it holds on a connection RLS does not filter', async () => {
    // The owner connection bypasses RLS: only the query's own org filter stands
    // between tenant A's key and tenant B's better-scoring atoms.
    const rows = await service(owner as never).searchHybrid(QUERY, 10, 0.7, uuidOf.A);
    expect(titles(rows).join('\n')).not.toMatch(/tenant-B/);
    expect(rows.length).toBeGreaterThan(0);
  });
});
