/**
 * Assemble the v2 Evidence surface's render contract from the REAL, org-scoped AI
 * trace chain (ai_retrieval_runs + ai_retrieval_chunks + ai_generation_runs) — the
 * exact provenance tables server/routes/evidence-ask.ts persists on every corpus ask
 * (POST /api/evidence/ask, verified at :201 / :242 / :338), NOT a seed-only blob.
 *
 * Each ai_retrieval_run IS one evidence ask: the natural-language question the tenant
 * asked (query_text), when (created_at), and the ranked source chunks retrieved for it
 * (ai_retrieval_chunks — title, similarity score, excerpt preview). A linked
 * ai_generation_run records that a grounded answer was produced (model, provider).
 *
 * Honest mapping — the trace chain is a provenance/audit chain, deliberately
 * content-light:
 *   question, askedAt, chunks{n,doc,page:null,sim,snip}, model, pedigree  → REAL
 *   answer prose  → NOT retained (ai_generation_runs stores only answer_hash_sha256,
 *                   never the text; evidence-ask.ts writes no ai_messages) → null
 *   cite indices  → NOT retained (evidence-ask.ts writes no ai_claims /
 *                   ai_claim_citations) → []
 * So the surface renders the org's real ask history (latest-first) with its traced
 * sources; the answer prose is honestly flagged not-retained (`answerRetained: false`).
 * An org that has never run an ask returns [] and the surface shows its empty state.
 *
 * Latest-first, org-scoped, bulk (one query per table). Mirrors the landed idiom of
 * shadow-review-view-assembler.ts / ind-checklist-view-assembler.ts.
 */
import { pool } from '../../db';

/** Bound the history payload — the surface only needs the org's recent asks. */
const MAX_ASKS = 50;

const str = (v: unknown): string => (v == null ? '' : String(v));
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const toIso = (v: unknown): string | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** One retrieved source chunk, shaped to the surface's ev-chunk render contract. */
export interface EvidenceAskChunkView {
  /** Rank of the chunk within its retrieval run (ai_retrieval_chunks.rank). */
  n: number;
  /** Source title (ai_retrieval_chunks.title). */
  doc: string;
  /** No page label exists in the trace chain — honest null, never fabricated. */
  page: string | null;
  /** Similarity / relevance score (ai_retrieval_chunks.score). */
  sim: number;
  /** Retrieved excerpt preview (ai_retrieval_chunks.excerpt_preview, ≤500 chars). */
  snip: string;
}

/** One evidence ask, shaped to exactly what the v2 Evidence surface renders. */
export interface EvidenceAskView {
  /** ai_retrieval_runs.id — the ask's stable key. */
  id: string;
  /** The natural-language question asked (ai_retrieval_runs.query_text). */
  question: string;
  /** When the ask ran (ai_retrieval_runs.created_at, ISO). */
  askedAt: string | null;
  /** Trust pedigree: model_assisted when a generation run is linked, else the ask
   *  was a pure retrieval/query (deterministic_query). Both are PedigreeBadge levels. */
  pedigree: string;
  /** Answer prose is NOT retained by the provenance chain (only its hash) → null. */
  answer: string | null;
  /** Explicit honesty flag — false today; the surface renders the traced sources
   *  as the grounded evidence instead of a fabricated answer body. */
  answerRetained: boolean;
  /** Cite indices are NOT retained (no ai_claim_citations written) → []. */
  cites: number[];
  /** Generation model, when a generation run is linked (ai_generation_runs.model). */
  model: string | null;
  /** The ranked source chunks retrieved for this ask, rank-ordered. */
  chunks: EvidenceAskChunkView[];
}

/**
 * Assemble every evidence ask for the org, newest first. Returns [] when the org has
 * never run an ask — the surface renders its honest empty state.
 */
export async function assembleOrgEvidenceAsks(orgId: number): Promise<EvidenceAskView[]> {
  const runsRes = await pool.query(
    `SELECT id, query_text, created_at
       FROM ai_retrieval_runs
      WHERE organization_id = $1
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT $2`,
    [orgId, MAX_ASKS],
  );
  const runs = runsRes.rows as Array<{ id: string; query_text: unknown; created_at: unknown }>;
  if (runs.length === 0) return [];

  const runIds = runs.map((r) => String(r.id));

  // Bulk-fetch the chunks and generation runs for exactly these asks (one query each).
  const [chunksRes, gensRes] = await Promise.all([
    pool.query(
      `SELECT retrieval_run_id, rank, title, excerpt_preview, score
         FROM ai_retrieval_chunks
        WHERE retrieval_run_id = ANY($1)
        ORDER BY rank ASC`,
      [runIds],
    ),
    pool.query(
      `SELECT retrieval_run_id, model, created_at
         FROM ai_generation_runs
        WHERE retrieval_run_id = ANY($1)
        ORDER BY created_at ASC NULLS FIRST`,
      [runIds],
    ),
  ]);

  const chunksByRun = new Map<string, EvidenceAskChunkView[]>();
  for (const c of chunksRes.rows as Array<Record<string, unknown>>) {
    const rid = str(c.retrieval_run_id);
    const list = chunksByRun.get(rid) ?? [];
    list.push({
      n: num(c.rank),
      doc: str(c.title),
      page: null, // no page label in the trace chain — honest null
      sim: num(c.score),
      snip: str(c.excerpt_preview),
    });
    chunksByRun.set(rid, list);
  }

  // Latest generation run per retrieval run (ORDER BY created_at ASC → last write wins).
  const genByRun = new Map<string, { model: string | null }>();
  for (const g of gensRes.rows as Array<Record<string, unknown>>) {
    genByRun.set(str(g.retrieval_run_id), { model: g.model == null ? null : str(g.model) });
  }

  return runs.map((r) => {
    const rid = String(r.id);
    const gen = genByRun.get(rid);
    return {
      id: rid,
      question: str(r.query_text),
      askedAt: toIso(r.created_at),
      pedigree: gen ? 'model_assisted' : 'deterministic_query',
      answer: null,
      answerRetained: false,
      cites: [],
      model: gen?.model ?? null,
      chunks: chunksByRun.get(rid) ?? [],
    };
  });
}
