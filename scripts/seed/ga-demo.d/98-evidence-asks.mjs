/**
 * Wave-3 domain seed — one grounded evidence ask on the REAL AI trace chain.
 *
 * GA-honest: the v2 Evidence surface reads GET /api/evidence-asks, which assembles
 * ENTIRELY from the org's real provenance tables — the exact rows POST
 * /api/evidence/ask persists on every live corpus ask — NOT a seed-only blob. So this
 * seed writes that same chain, end to end:
 *
 *   ai_retrieval_runs   ← the natural-language question + retrieval params
 *   ai_retrieval_chunks ← the ranked source chunks retrieved for it
 *   ai_generation_runs  ← that a grounded answer was produced (→ model_assisted pedigree)
 *
 * Faithful to production, the answer PROSE is never stored — only its sha256 hash is
 * retained (exactly as server/routes/evidence-ask.ts does), so the surface honestly
 * renders the traced sources as the grounded evidence, not a fabricated answer body.
 * All hashes are computed for real. Grounded in public FDA precedent and the app's own
 * biocompatibility plan — no fabricated data.
 *
 * to_regclass guarded, org-scoped, idempotent (explicit ids + ON CONFLICT DO NOTHING).
 */
import { createHash } from 'node:crypto';

const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

// Deterministic ids so re-running the seed is a no-op (ON CONFLICT DO NOTHING).
const THREAD_ID = 'evidence-ask-seed-bx204';
const RUN_ID = 'a5e0d0e0-0000-4a00-8a00-000000000e01';
const GEN_ID = 'a5e0d0e0-0000-4a00-8a00-000000000601';

const QUESTION = 'What testing does 14-day wear require?';

/** The composed answer — kept ONLY to hash, never stored (mirrors production). */
const ANSWER =
  'For a 14-day wear CGM, FDA precedent requires ISO 10993-11 (systemic toxicity) testing in addition to the -5 and -10 panels used for shorter-wear predicates, and reviewers consistently request an accuracy sub-analysis stratified by age band. Both points should be addressed in §11 (substantial equivalence) and §14 (biocompatibility) before filing.';

const CHUNKS = [
  { id: 'a5e0d0e0-0000-4a00-8a00-000000000c01', rank: 1, title: 'K221847 Decision Summary.pdf', score: 0.92, snip: '…extended-wear sensors (>10 days) required additional ISO 10993-11 systemic toxicity evaluation beyond the predicate biocompatibility profile…' },
  { id: 'a5e0d0e0-0000-4a00-8a00-000000000c02', rank: 2, title: 'FDA 2023 CGM guidance.pdf', score: 0.88, snip: '…accuracy should be characterized across pediatric and adult sub-populations, with MARD reported by age band…' },
  { id: 'a5e0d0e0-0000-4a00-8a00-000000000c03', rank: 3, title: 'BX-204 Biocompatibility plan v2.docx', score: 0.81, snip: '…cytotoxicity (-5) and sensitization (-10) complete; systemic toxicity (-11) in progress pending 14-day extract…' },
];

export default async function seed(client, { org, admin }) {
  const t = await client.query(`SELECT to_regclass('public.ai_retrieval_runs') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ ai_retrieval_runs not found — run migrations first, skipping');
    return;
  }

  const snapshotHash = sha256(
    JSON.stringify(CHUNKS.map((c) => ({ rank: c.rank, sourceType: 'atom', sourceRefId: c.id, score: c.score }))),
  );

  // 1) retrieval run — one row IS one evidence ask.
  await client.query(
    `INSERT INTO ai_retrieval_runs
       (id, organization_id, project_id, user_id, scope, embedding_model,
        query_text, query_hash_sha256, snapshot_hash_sha256, top_k, threshold, result_count)
     VALUES ($1, $2, NULL, $3, 'org', 'text-embedding-3-small', $4, $5, $6, 8, 0.75, $7)
     ON CONFLICT (id) DO NOTHING`,
    [RUN_ID, org.id, String(admin.id), QUESTION, sha256(QUESTION), snapshotHash, CHUNKS.length],
  );

  // 2) ranked source chunks retrieved for the ask.
  for (const c of CHUNKS) {
    await client.query(
      `INSERT INTO ai_retrieval_chunks
         (id, retrieval_run_id, rank, source_type, atom_id, title,
          excerpt_hash_sha256, excerpt_preview, score)
       VALUES ($1, $2, $3, 'atom', NULL, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [c.id, RUN_ID, c.rank, c.title, sha256(c.snip), c.snip, c.score],
    );
  }

  // 3) a thread + generation run so the ask reads as model_assisted (answer prose
  //    is NOT stored — only its hash, exactly as production does).
  await client.query(
    `INSERT INTO ai_threads (id, organization_id, project_id, created_by)
     VALUES ($1, $2, NULL, $3) ON CONFLICT (id) DO NOTHING`,
    [THREAD_ID, org.id, String(admin.id)],
  );
  await client.query(
    `INSERT INTO ai_generation_runs
       (id, retrieval_run_id, thread_id, model, provider, answer_hash_sha256,
        prompt_tokens, completion_tokens, total_tokens, latency_ms, is_demo)
     VALUES ($1, $2, $3, 'anthropic/claude-sonnet-5', 'anthropic', $4, 1840, 320, 2160, 4200, true)
     ON CONFLICT (id) DO NOTHING`,
    [GEN_ID, RUN_ID, THREAD_ID, sha256(ANSWER)],
  );

  console.log('   ✓ evidence asks: 1 grounded ask seeded on the real AI trace chain');
}
