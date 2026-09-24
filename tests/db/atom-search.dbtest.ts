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
const projectAtomSources: string[] = [];

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

  // Tenant A, the project under test: three artifacts whose atoms score LOWER
  // on the vector than everything else below.
  for (let k = 0; k < 3; k++) {
    const artifactId = `${TAG}-art-A${k}`;
    await owner.query(
      `INSERT INTO concept2cure_artifacts (artifact_id, project_id, organization_id, type, category, title, content)
       VALUES ($1,$2,$3,'document','clinical',$4,'fixture')`,
      [artifactId, projectA, ORG_A, `${TAG} artifact A${k}`],
    );
    projectAtomSources.push(artifactId);
    await atom(ORG_A, 'artifact', artifactId, 0.6, `project-A atom ${k}`);
  }
  // Tenant A outside the project, and tenant B: twelve each, scoring higher.
  for (let k = 0; k < 12; k++) {
    await atom(ORG_A, 'document', `${TAG}-doc-A${k}`, 1, `tenant-A atom ${k}`);
    await atom(ORG_B, 'document', `${TAG}-doc-B${k}`, 1, `tenant-B atom ${k}`);
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
    const rows = await asTenantA(() => service(getPool()).searchHybrid(QUERY, 3));
    expect(rows.length).toBe(3);
    for (const r of rows) expect(r.title).not.toMatch(/tenant-B/);
  });

  it('weights semantic and keyword scores as the caller asked', async () => {
    const rows = await asTenantA(() => service(getPool()).searchHybrid(QUERY, 5, 0.7, orgUuidA));
    expect(rows.length).toBe(5);
    for (const r of rows) {
      expect(r.score).toBeCloseTo(0.7 * r.semanticScore + 0.3 * r.keywordScore, 6);
    }
  });

  it("returns a project's own atoms even when other projects' atoms score higher", async () => {
    const rows = await asTenantA(() => service(getPool()).searchHybrid(QUERY, 3, 0.7, orgUuidA, String(projectA)));
    expect(rows.map((r) => r.sourceId).sort()).toEqual([...projectAtomSources].sort());
  });

  it('never returns another tenant’s atom, even on a connection RLS does not filter', async () => {
    // The owner pool bypasses RLS: only the query's own org filter stands
    // between tenant A's search and tenant B's twelve better-scoring atoms.
    const rows = await service(owner as never).searchHybrid(QUERY, 10, 0.7, orgUuidA);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.title).not.toMatch(/tenant-B/);
  });
});
