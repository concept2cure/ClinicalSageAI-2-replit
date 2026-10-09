/**
 * A retrieval floor is applied where it is configured, and recorded only when
 * it was (D4, 2026-09-26; evidence docs/evidence/D4/2026-09-26-retrieval-floor/).
 *
 * `evidence-ask` documents a semantic similarity threshold (default 0.6,
 * overridable per request) and says it "refuses (no generation) when zero
 * sources clear the threshold". It passed that threshold to
 * `enhancedEmbeddingService.searchHybrid` in the `semanticWeight` position and
 * never filtered on it, so every top-k atom — however weak — was admissible,
 * cited as [SRC-n], and written to ai_retrieval_chunks under a run whose
 * `threshold` column said 0.6. Five more callers did the same.
 *
 * These cases mount the real route on a from-empty PostgreSQL, as the
 * non-superuser runtime role with RLS enforcing, inside tenant A's request
 * scope. Only the query embedding and the model call are stubbed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const route = vi.fn();
vi.mock('../../server/services/ai-gateway/index.js', () => ({
  getGateway: () => ({ getEnabledProviders: () => ['anthropic'], route: (...a: unknown[]) => route(...a) }),
}));

import { runWithTenantScope } from '../../server/db/tenantStore';
import { getPool } from '../../server/db/runtime';
import { EnhancedEmbeddingService } from '../../server/services/enhancedEmbeddingService';
import evidenceAskRouter from '../../server/routes/evidence-ask';
import {
  TAG,
  ORG_A,
  owner,
  userA,
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
const QUERY = 'renal clearance';
const QUERY_VECTOR = JSON.parse(vec(1)) as number[];
const STRONG = `${TAG}-floor-strong`;
const WEAK = `${TAG}-floor-weak`;
let uuidA = '';

async function atom(title: string, cos: number) {
  await owner.query(
    `INSERT INTO lumen_data_atoms
       (organization_id, source_type, source_id, atom_type, title, content, status, embedding, created_at, updated_at)
     VALUES ($1,'document',$2,'finding',$2,$3,'active',$4::vector, now(), now())`,
    [ORG_A, title, `${title}: ${QUERY} was measured`, vec(cos)],
  );
}

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).tenantId = ORG_A;
    (req as any).userId = userA;
    (req as any).user = { userId: userA, organizationId: ORG_A };
    runWithTenantScope(
      { tenantId: String(ORG_A), orgUuid: uuidA, role: 'member', source: 'request', caller: 'retrieval-floor' },
      () => next(),
    );
  });
  a.use('/api/evidence', evidenceAskRouter);
  return a;
}

const titlesOf = (body: any) => JSON.stringify(body?.sources ?? []);

beforeAll(async () => {
  await provisionTwoTenantFixture();
  uuidA = (await owner.query('SELECT uuid::text AS u FROM organizations WHERE id = $1', [ORG_A])).rows[0].u;
  vi.spyOn(EnhancedEmbeddingService.prototype, 'embed').mockResolvedValue({
    text: QUERY,
    embedding: QUERY_VECTOR,
    model: 'text-embedding-3-small',
    dimensions: DIM,
    cached: false,
  } as never);
  route.mockResolvedValue({
    content: 'Renal clearance was measured [SRC-1].',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    latencyMs: 5,
  });
  await atom(STRONG, 0.9);
  await atom(WEAK, 0.3);
}, 120_000);

afterAll(async () => {
  vi.restoreAllMocks();
  if (owner) {
    await owner.query(
      `DELETE FROM ai_retrieval_chunks WHERE retrieval_run_id IN
         (SELECT id FROM ai_retrieval_runs WHERE organization_id = $1)`,
      [ORG_A],
    );
    await owner.query(
      `DELETE FROM ai_generation_runs WHERE retrieval_run_id IN
         (SELECT id FROM ai_retrieval_runs WHERE organization_id = $1)`,
      [ORG_A],
    );
    await owner.query('DELETE FROM ai_retrieval_runs WHERE organization_id = $1', [ORG_A]);
    await owner.query('DELETE FROM ai_threads WHERE organization_id = $1', [ORG_A]);
    await owner.query('DELETE FROM lumen_data_atoms WHERE source_id LIKE $1', [`${TAG}-floor-%`]);
  }
  await teardownTwoTenantFixture();
});

describe('searchHybrid applies a floor only when asked for one', () => {
  const asTenantA = <T>(fn: () => Promise<T>) =>
    runWithTenantScope(
      { tenantId: String(ORG_A), orgUuid: uuidA, role: 'member', source: 'request', caller: 'retrieval-floor' },
      fn,
    );
  it('the floor is what excludes the weak atom: without one it is returned, with one it is not', async () => {
    const svc = new EnhancedEmbeddingService(getPool() as never);
    const unfloored = await asTenantA(() => svc.searchHybrid(QUERY, { limit: 5, organizationUuid: uuidA }));
    const floored = await asTenantA(() =>
      svc.searchHybrid(QUERY, { limit: 5, organizationUuid: uuidA, minSemanticScore: 0.6 }),
    );
    expect(unfloored.map((r) => r.title)).toEqual(expect.arrayContaining([STRONG, WEAK]));
    expect(floored.map((r) => r.title)).toEqual([STRONG]);
  });
});

describe('evidence-ask applies its similarity floor, and records only the floor it applied', () => {
  it('an atom below the default floor (0.6) is not admissible evidence', async () => {
    route.mockClear();
    const res = await request(app()).post('/api/evidence/ask').send({ message: QUERY });
    expect(titlesOf(res.body)).not.toContain(WEAK);
    expect(res.status).toBe(200);
    expect(titlesOf(res.body)).toContain(STRONG);
  });

  it('a question nothing clears is refused, and the model is never called', async () => {
    route.mockClear();
    const res = await request(app()).post('/api/evidence/ask').send({ message: QUERY, threshold: 0.95 });
    expect(titlesOf(res.body)).not.toContain(WEAK);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NO_ADMISSIBLE_EVIDENCE');
    expect(route).not.toHaveBeenCalled();
  });

  it('every chunk recorded under a run clears the threshold that run records', async () => {
    const res = await request(app()).post('/api/evidence/ask').send({ message: QUERY });
    const runId = res.body.retrievalRunId;
    expect(runId).toBeTruthy();
    const { rows } = await owner.query(
      `SELECT r.threshold::float8 AS threshold, a.title,
              1 - (a.embedding <=> $2::vector) AS similarity
         FROM ai_retrieval_runs r
         JOIN ai_retrieval_chunks c ON c.retrieval_run_id = r.id
         JOIN lumen_data_atoms a ON a.id::text = c.atom_id::text
        WHERE r.id = $1`,
      [runId, vec(1)],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.similarity, `${r.title} was recorded under threshold ${r.threshold}`).toBeGreaterThanOrEqual(
        Number(r.threshold),
      );
    }
  });
});
