/**
 * The IVDR pack's §6 AI provenance chain is THIS project's, and a provenance
 * read that fails is recorded in the pack — never silently left out.
 *
 * ── WHAT THE CODE USED TO DO (before 2026-10-15) ─────────────────────────────
 * buildManifestV1 read the chain with `WHERE gr.organization_id = $1`: 20
 * generation runs (ORDER BY a random uuid, so not even the latest) and ALL of
 * the organisation's AI claims — none of it scoped to the pack's project — and
 * hashed the result into this pack's manifest, where §6 renders it as
 * "Verifier Summary … Supported Rate: xx.x%".
 *
 * On the schema the migrations actually create, ai_generation_runs has no
 * organization_id column at all (a run's tenant and project live on its
 * ai_retrieval_runs row). So every build raised 42703, and
 *   } catch { // AI provenance tables may not exist yet — skip gracefully }
 * dropped the chain: every pack printed "AI provenance chain not available." —
 * the same sentence as "no AI was used", and as "the tables could not be read".
 *
 * Runs against the REAL db/migrations/20260224_ai_trace_chain.sql and
 * 20260224_ai_claims_verifier_flags.sql in an in-process PGlite.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';

import { buildManifestV1 } from '../ivdrPackManifest';
import { buildIvdrPackContent } from '../ivdrPackContent';
import { renderIvdrPackHtml } from '../ivdrPackHtml';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MIGRATIONS = [
  'db/migrations/20260224_ai_trace_chain.sql',
  'db/migrations/20260224_ai_claims_verifier_flags.sql',
];

const ORG = 7;
const PROJ_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJ_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROJ_NO_AI = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

let pg: PGlite;
let empty: PGlite;

function poolOf(db: () => PGlite, fail?: { when: RegExp; error: string }): Pool {
  return {
    query: async (sql: string, params?: unknown[]) => {
      if (fail && fail.when.test(sql)) throw new Error(fail.error);
      const r = await db().query(sql, params as unknown[]);
      return { rows: r.rows as any[], rowCount: r.rows.length };
    },
  } as unknown as Pool;
}
const pool = poolOf(() => pg);

/** One retrieval-grounded generation run, as the chat and evidence-ask routes record it. */
async function run(org: number, project: string, snapshot: string, at: string) {
  const thread = `thread-${snapshot}`;
  await pg.query(`INSERT INTO ai_threads (id, organization_id, project_id) VALUES ($1, $2, $3)`, [thread, org, project]);
  const ret = await pg.query<{ id: string }>(
    `INSERT INTO ai_retrieval_runs
       (organization_id, project_id, user_id, embedding_model, query_text, query_hash_sha256, snapshot_hash_sha256, top_k)
     VALUES ($1, $2, 'u-1', 'emb', 'q', 'qh', $3, 5) RETURNING id`,
    [org, project, snapshot],
  );
  const gen = await pg.query<{ id: string }>(
    `INSERT INTO ai_generation_runs (retrieval_run_id, thread_id, model, answer_hash_sha256, created_at)
     VALUES ($1, $2, 'model-x', 'ah', $3) RETURNING id`,
    [ret.rows[0].id, thread, at],
  );
  return { ret: ret.rows[0].id, gen: gen.rows[0].id };
}

async function claim(gen: string, index: number, status: string, rules: string[] = []) {
  await pg.query(
    `INSERT INTO ai_claims (generation_run_id, claim_index, claim_text, claim_hash_sha256, status, verifier_flags)
     VALUES ($1, $2, 'claim', 'ch', $3, $4::jsonb)`,
    [gen, index, status, JSON.stringify(rules.map(rule => ({ rule, severity: 'warn', message: 'm' })))],
  );
}

let a1: { ret: string; gen: string };
let a2: { ret: string; gen: string };

beforeAll(async () => {
  pg = new PGlite();
  for (const file of MIGRATIONS) await pg.exec(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'));
  empty = new PGlite(); // no provenance tables at all
  await empty.query('SELECT 1'); // start it here, not inside a test's 10 s budget

  a1 = await run(ORG, PROJ_A, 'snap-a1', '2026-10-01T00:00:00Z');
  a2 = await run(ORG, PROJ_A, 'snap-a2', '2026-10-02T00:00:00Z');
  const b = await run(ORG, PROJ_B, 'snap-b', '2026-10-03T00:00:00Z');
  const other = await run(9, PROJ_A, 'snap-other-org', '2026-10-04T00:00:00Z');

  await claim(a1.gen, 0, 'SUPPORTED');
  await claim(a1.gen, 1, 'WEAK', ['CITATION_OVERLAP_LOW']);
  await claim(a2.gen, 0, 'UNSUPPORTED', ['NO_CITATION', 'CITATION_OVERLAP_LOW']);
  for (let i = 0; i < 3; i++) await claim(b.gen, i, 'SUPPORTED');
  await claim(other.gen, 0, 'SUPPORTED');
}, 60_000);

afterAll(async () => {
  await pg?.close();
  await empty?.close();
});

function manifestFor(projectId: string, p: Pool = pool) {
  return buildManifestV1({
    pool: p,
    packId: 'pack-1',
    packType: 'IVDR_TECHDOC',
    packVersion: 1,
    organizationId: ORG,
    projectId,
    snapshotHashSha256: 'a'.repeat(64),
    claimIds: [],
  });
}

describe('IVDR manifest provenance chain', () => {
  it('covers this project\'s runs and claims — not another project\'s, not another organisation\'s', async () => {
    const { manifest } = await manifestFor(PROJ_A);
    expect(manifest.provenanceReadFailure).toBeUndefined();
    expect(manifest.provenanceChain).toEqual({
      retrievalRunIds: [a1.ret, a2.ret],
      generationRunIds: [a1.gen, a2.gen],
      snapshotHashes: ['snap-a1', 'snap-a2'],
      aiClaimSummary: {
        totalClaims: 3,
        supported: 1,
        weak: 1,
        unsupported: 1,
        supportedClaimRate: 1 / 3,
        flaggedCount: 2,
        topRules: ['CITATION_OVERLAP_LOW', 'NO_CITATION'],
      },
    });
  });

  it('a project with no AI runs has no chain — and no failure either', async () => {
    const { manifest } = await manifestFor(PROJ_NO_AI);
    expect(manifest.provenanceChain).toBeUndefined();
    expect(manifest.provenanceReadFailure).toBeUndefined();
  });

  it('records a failed read on the hashed manifest instead of omitting the chain', async () => {
    const { manifest, manifestJson } = await manifestFor(PROJ_A, poolOf(() => empty));
    expect(manifest.provenanceChain).toBeUndefined();
    expect(manifest.provenanceReadFailure?.error).toMatch(/does not exist/);
    // It is in the manifest.json the pack ships, not only in memory.
    expect(JSON.parse(manifestJson).provenanceReadFailure.error).toMatch(/does not exist/);
  });

  it('a failure part-way through never yields a partial chain', async () => {
    const failing = poolOf(() => pg, {
      when: /jsonb_array_elements/,
      error: 'permission denied for table ai_claims',
    });
    const { manifest } = await manifestFor(PROJ_A, failing);
    expect(manifest.provenanceChain).toBeUndefined();
    expect(manifest.provenanceReadFailure).toEqual({ error: 'permission denied for table ai_claims' });
  });
});

describe('the rendered pack §6', () => {
  /** Answers the programme check; every IVDR section reads as empty. */
  const programmeOnly = {
    query: async (sql: string) => ({ rows: /FROM regulatory_programs/.test(sql) ? [{ id: PROJ_A }] : [] }),
  } as unknown as Pool;

  async function contentWith(manifestPool: Pool) {
    const { manifest } = await manifestFor(PROJ_A, manifestPool);
    return buildIvdrPackContent({
      pool: programmeOnly,
      organizationId: ORG,
      projectId: PROJ_A,
      packId: 'pack-1',
      packType: 'IVDR_TECHDOC',
      packVersion: 1,
      manifest,
    });
  }

  it('says the provenance could not be read — never "not available" — when the read failed', async () => {
    const content = await contentWith(
      poolOf(() => pg, { when: /ai_generation_runs/, error: 'permission denied for table ai_generation_runs' }),
    );
    expect(content.readFailures).toContainEqual({
      section: 'provenanceChain',
      error: 'permission denied for table ai_generation_runs',
    });

    const html = renderIvdrPackHtml(content);
    expect(html).not.toContain('AI provenance chain not available.');
    expect(html).toContain(
      'The AI provenance records could not be read (permission denied for table ai_generation_runs).',
    );
    expect(html).toContain('INCOMPLETE');
  });

  it('prints this project\'s verifier summary when the read succeeded', async () => {
    const html = renderIvdrPackHtml(await contentWith(pool));
    expect(html).toContain('<p>Generation Run IDs: 2</p>');
    expect(html).toContain('<strong>Total Claims:</strong> 3');
    expect(html).toContain('<strong>Supported Rate:</strong> 33.3%');
  });
});
