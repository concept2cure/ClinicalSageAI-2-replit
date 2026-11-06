/**
 * Atom retrieval returns rows, the right rows, and as many as were asked for.
 *
 * `enhancedEmbeddingService.searchHybrid` is what grounds an Authoring AI draft
 * and AnA's answers in a tenant's own evidence. On every database built from
 * empty it returned nothing, for three reasons found in sequence:
 *
 *   1. search_atoms_hybrid (db/migrations/20260730_fix_atom_embedding_dimension.sql)
 *      declares `structured_data JSONB` and selects `lumen_data_atoms.structured_data`,
 *      which is `json`. Every call failed, even on an empty table. Authoring
 *      reported it honestly as `retrievalStatus: 'failed'`, so every draft was
 *      ungrounded.
 *   2. The caller passed its arguments out of order. The org branch sent the
 *      result limit as `keyword_weight`, and the other branch sent it as
 *      `semantic_weight`. `match_count` was never sent, so the function always
 *      returned its default 10.
 *   3. The org and project filters ran AFTER the function had picked its top
 *      10 from everything the caller could see. A project's own evidence was
 *      crowded out by other projects' atoms that scored higher.
 *
 * Proof on PostgreSQL built by install-fresh + deploy-migrate, as the
 * non-superuser runtime role with RLS enforcing (two-tenant-fixture.ts).
 * Embeddings are fixed vectors: the model is not what is under test.
 *
 * Since F1 (2026-11-05) a search names the projects it may rank (projectIds),
 * and ranks only those projects' artifact atoms. So every atom here is an
 * artifact atom of a project: tenant A's project under test, a second project
 * of tenant A that scores higher, and tenant B's project
 * (docs/evidence/F1/2026-11-05-evidence-retrieval-scope/).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getPool } from '../../server/db/runtime';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { EnhancedEmbeddingService } from '../../server/services/enhancedEmbeddingService';
import {
  TAG,
  ORG_A,
  ORG_B,
  FIXTURE_ORGS,
  owner,
  ids,
  userA,
  workspaceA,
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
const QUERY = 'hepatotoxicity signal';
const QUERY_VECTOR = JSON.parse(vec(1)) as number[];

let orgUuidA: string;
let projectA: number;
/** Tenant A's second project, made here: its atoms score higher than project A's. */
let projectA2: number;
let projectB: number;
const projectAtomSources: string[] = [];

/** An artifact of `projectId`, and its atom. */
async function artifactAtom(org: number, projectId: number, artifactId: string, cos: number, label: string) {
  await owner.query(
    `INSERT INTO concept2cure_artifacts (artifact_id, project_id, organization_id, type, category, title, content)
     VALUES ($1,$2,$3,'document','clinical',$4,'fixture')`,
    [artifactId, projectId, org, `${TAG} artifact ${label}`],
  );
  await atom(org, 'artifact', artifactId, cos, label);
}

async function atom(org: number, sourceType: string, sourceId: string, cos: number, label: string) {
  await owner.query(
    `INSERT INTO lumen_data_atoms
       (organization_id, source_type, source_id, atom_type, title, content, status, embedding, created_at, updated_at)
     VALUES ($1,$2,$3,'finding',$4,$5,'active',$6::vector, now(), now())`,
    [org, sourceType, sourceId, `${TAG} ${label}`, `${label}: a ${QUERY} was observed in ${TAG}`, vec(cos)],
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

const asTenantA = <T>(fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId: String(ORG_A), role: 'member', source: 'test', caller: 'atom-search' }, fn);

beforeAll(async () => {
  await provisionTwoTenantFixture();
  orgUuidA = (await owner.query('SELECT uuid::text AS u FROM organizations WHERE id = $1', [ORG_A])).rows[0].u;
  projectA = Number(ids.A.projects);
  projectB = Number(ids.B.projects);
  projectA2 = Number((await owner.query(
    `INSERT INTO projects (organization_id,client_workspace_id,name,type,description,created_by_id)
     VALUES ($1,$2,$3,'regulatory','fixture-body-A2',$4) RETURNING id`,
    [ORG_A, workspaceA, `${TAG}-project-A2`, userA],
  )).rows[0].id);

  // Tenant A, the project under test: three artifacts whose atoms score LOWER
  // on the vector than everything else below.
  for (let k = 0; k < 3; k++) {
    const artifactId = `${TAG}-art-A${k}`;
    projectAtomSources.push(artifactId);
    await artifactAtom(ORG_A, projectA, artifactId, 0.6, `project-A atom ${k}`);
  }
  // Tenant A's second project, and tenant B's project: twelve each, scoring higher.
  for (let k = 0; k < 12; k++) {
    await artifactAtom(ORG_A, projectA2, `${TAG}-art-A2-${k}`, 1, `project-A2 atom ${k}`);
    await artifactAtom(ORG_B, projectB, `${TAG}-art-B${k}`, 1, `tenant-B atom ${k}`);
  }
}, 120_000);

afterAll(async () => {
  if (owner) {
    await owner.query('DELETE FROM lumen_data_atoms WHERE organization_id = ANY($1::int[])', [FIXTURE_ORGS]);
    await owner.query('DELETE FROM concept2cure_artifacts WHERE organization_id = ANY($1::int[])', [FIXTURE_ORGS]);
  }
  await teardownTwoTenantFixture();
});

describe('search_atoms_hybrid on a from-blank database', () => {
  it('returns rows', async () => {
    const res = await asTenantA(() =>
      getPool().query(`SELECT * FROM search_atoms_hybrid($1, $2::vector, 0.7, 0.3, 5)`, [QUERY, vec(1)]),
    );
    expect(res.rows.length).toBeGreaterThan(0);
  });
});

describe("searchHybrid serves a tenant's own evidence, as asked", () => {
  it('returns no more rows than the limit, all the tenant’s own', async () => {
    // With tenant A's key: a search with none is refused since the D3 change
    // (atom-search-tenant-key.dbtest.ts), where this call once ran unfiltered and
    // only RLS kept it to tenant A.
    const rows = await asTenantA(() =>
      service(getPool()).searchHybrid(QUERY, { limit: 3, organizationUuid: orgUuidA, projectIds: [projectA, projectA2] }),
    );
    expect(rows.length).toBe(3);
    for (const r of rows) expect(r.title).not.toMatch(/tenant-B/);
  });

  it('weights semantic and keyword scores as the caller asked', async () => {
    const rows = await asTenantA(() =>
      service(getPool()).searchHybrid(QUERY, { limit: 5, organizationUuid: orgUuidA, projectIds: [projectA, projectA2] }),
    );
    expect(rows.length).toBe(5);
    for (const r of rows) {
      expect(r.score).toBeCloseTo(0.7 * r.semanticScore + 0.3 * r.keywordScore, 6);
    }
  });

  it("returns a project's own atoms even when other projects' atoms score higher", async () => {
    const rows = await asTenantA(() => service(getPool()).searchHybrid(QUERY, { limit: 3, organizationUuid: orgUuidA, projectIds: [projectA] }));
    expect(rows.map((r) => r.sourceId).sort()).toEqual([...projectAtomSources].sort());
  });

  it('never returns an atom of a project of the same tenant that the scope does not name', async () => {
    // Room for every candidate: project A2's twelve better-scoring atoms are the
    // same tenant's, readable under its RLS policy, and still not returned.
    const rows = await asTenantA(() => service(getPool()).searchHybrid(QUERY, { limit: 10, organizationUuid: orgUuidA, projectIds: [projectA] }));
    expect(rows.map((r) => r.sourceId).sort()).toEqual([...projectAtomSources].sort());
    for (const r of rows) expect(r.title).not.toMatch(/project-A2/);
    const unscoped = await asTenantA(() => service(getPool()).searchHybrid(QUERY, { limit: 10, organizationUuid: orgUuidA, projectIds: [projectA, projectA2] }));
    expect(unscoped.some((r) => /project-A2/.test(r.title)), 'positive control: A2 is searchable when named').toBe(true);
  });

  it('never returns another tenant’s atom, even on a connection RLS does not filter', async () => {
    // The owner pool bypasses RLS: only the query's own org filter stands
    // between tenant A's search and tenant B's twelve better-scoring atoms, even
    // with tenant B's project named in the scope.
    const rows = await service(owner as never).searchHybrid(QUERY, {
      limit: 10, organizationUuid: orgUuidA, projectIds: [projectA, projectA2, projectB],
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.title).not.toMatch(/tenant-B/);
  });
});
