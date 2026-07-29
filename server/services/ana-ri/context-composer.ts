/**
 * Context composer — the relevance-ranking kernel for AnA's enrichment.
 *
 * AnA now has ten knowledge packs, and a single message often triggers several
 * at once (a complete-response-letter message lights up client-attunement,
 * agency-tactics, and constructive-challenge together). Concatenating every
 * fired block floods the model with equal-prominence context and dilutes
 * focus — the opposite of how a brilliant advisor prioritizes.
 *
 * This module is a small, dependency-free information-retrieval kernel that
 * decides WHICH enrichment blocks reach the model and in WHAT order, under a
 * token budget. It uses three established techniques, implemented from scratch
 * (no new dependencies, fully deterministic, unit-testable without any model
 * call):
 *
 *   1. BM25-lite lexical relevance — score each block against the user's
 *      message using term-frequency · inverse-document-frequency with length
 *      normalization, the workhorse of search ranking.
 *   2. Priority weighting — a per-source base weight so safety-critical signals
 *      (a client in crisis, a governed envelope) outrank nice-to-haves even
 *      when lexical overlap is similar.
 *   3. Maximal Marginal Relevance (MMR) — greedily select blocks that are both
 *      relevant and non-redundant, so two packs saying the same thing do not
 *      both consume budget.
 *
 * The composer returns the ordered, budget-fitted selection plus an explainable
 * trace (why each block was kept or dropped), which the enrichment layer can
 * surface in enrichmentMeta for observability.
 *
 * Design principle: this changes PROMINENCE and BUDGET, never truth. A dropped
 * block is dropped because something more relevant earned the budget, not
 * because its content is wrong. When the budget is generous, everything is
 * kept — the composer is a no-op until context actually competes.
 *
 * @module server/services/ana-ri/context-composer
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CandidateBlock {
  /** Enrichment source name (e.g. 'client-attunement', 'agency-tactics'). */
  source: string;
  /** The rendered Markdown block. */
  text: string;
  /**
   * Base priority weight in [0, 1]. Higher = more important regardless of
   * lexical overlap. Defaults to 0.5 when not supplied.
   */
  priority?: number;
  /**
   * When true, the block is always kept regardless of score or budget (e.g. a
   * governed-execution envelope or a crisis read that must never be dropped).
   */
  pinned?: boolean;
}

export interface ComposedBlock {
  source: string;
  text: string;
  /** Final combined score used for ordering (relevance + priority). */
  score: number;
  /** Approximate token cost of this block. */
  tokens: number;
}

export interface ComposeTraceEntry {
  source: string;
  relevance: number;
  priority: number;
  /** MMR-adjusted score at selection time. */
  score: number;
  tokens: number;
  kept: boolean;
  reason: string;
}

export interface ComposeResult {
  /** Selected blocks, in final prompt order. */
  selected: ComposedBlock[];
  /** Concatenated text of the selected blocks. */
  text: string;
  /** Total approximate tokens used. */
  tokensUsed: number;
  /** Per-candidate decision trace, for observability. */
  trace: ComposeTraceEntry[];
}

export interface ComposeOptions {
  /** Approximate token budget for the composed enrichment. Default 2400. */
  tokenBudget?: number;
  /**
   * MMR trade-off in [0, 1]. 1 = pure relevance, 0 = pure diversity.
   * Default 0.7 (relevance-leaning but diversity-aware).
   */
  lambda?: number;
  /** Default base priority for blocks that do not set one. Default 0.5. */
  defaultPriority?: number;
  /**
   * Optional learned per-source priority multipliers (from adaptive-priority).
   * When present, a source's base priority is scaled by its multiplier and
   * re-clamped to [0, 1]. Bounded by construction, so it nudges ranking from
   * evidence without inverting the deliberate static weights.
   */
  priorityMultipliers?: Record<string, number>;
}

// ─── Tokenization & text stats ───────────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'as', 'it', 'its',
  'this', 'that', 'these', 'those', 'you', 'your', 'we', 'our', 'they', 'their',
  'i', 'me', 'my', 'he', 'she', 'them', 'do', 'does', 'did', 'have', 'has', 'had',
  'will', 'would', 'should', 'can', 'could', 'may', 'might', 'not', 'no', 'so',
  'if', 'then', 'than', 'when', 'what', 'which', 'who', 'how', 'why', 'about',
]);

/** Lowercase word tokens, stopworded, length-2+; deterministic. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:\([a-z0-9]+\)|[a-z0-9])*/g) || [])
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Approximate token count (~4 chars/token, the common GPT/Claude heuristic). */
export function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

// ─── BM25-lite relevance ───────────────────────────────────────────────────

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * Score each block against the query using BM25 over the block corpus.
 * Returns a relevance score per block index, normalized to [0, 1] across the
 * candidate set (so it composes cleanly with the [0,1] priority weight).
 */
export function scoreRelevanceBM25(query: string, blocks: CandidateBlock[]): number[] {
  const queryTerms = Array.from(new Set(tokenize(query)));
  if (queryTerms.length === 0 || blocks.length === 0) {
    return blocks.map(() => 0);
  }

  const docTokens = blocks.map((b) => tokenize(b.text));
  const docLengths = docTokens.map((d) => d.length || 1);
  const avgLen = docLengths.reduce((a, b) => a + b, 0) / docLengths.length;
  const N = blocks.length;

  // Document frequency per query term.
  const df = new Map<string, number>();
  for (const term of queryTerms) {
    let count = 0;
    for (const d of docTokens) if (d.includes(term)) count += 1;
    df.set(term, count);
  }

  const raw = docTokens.map((tokens, i) => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const term of queryTerms) {
      const f = tf.get(term) || 0;
      if (f === 0) continue;
      const n = df.get(term) || 0;
      // BM25 idf with +1 smoothing (always non-negative).
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const denom = f + BM25_K1 * (1 - BM25_B + (BM25_B * docLengths[i]) / avgLen);
      score += idf * ((f * (BM25_K1 + 1)) / denom);
    }
    return score;
  });

  const max = Math.max(...raw, 0);
  return max > 0 ? raw.map((s) => s / max) : raw.map(() => 0);
}

// ─── Lexical similarity for MMR diversity ────────────────────────────────────

/** Jaccard similarity over token sets — cheap, deterministic redundancy proxy. */
export function lexicalSimilarity(a: string, b: string): number {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

// ─── The composer ────────────────────────────────────────────────────────────

/**
 * Compose the enrichment blocks under a token budget, ranking by relevance and
 * priority and de-duplicating with MMR. Pinned blocks are always included
 * (and do not count against the relevance ranking, though they do consume
 * budget). Returns the ordered selection plus a decision trace.
 */
export function composeContext(
  query: string,
  candidates: CandidateBlock[],
  options: ComposeOptions = {},
): ComposeResult {
  const tokenBudget = options.tokenBudget ?? 2400;
  const lambda = options.lambda ?? 0.7;
  const defaultPriority = options.defaultPriority ?? 0.5;

  if (candidates.length === 0) {
    return { selected: [], text: '', tokensUsed: 0, trace: [] };
  }

  const relevance = scoreRelevanceBM25(query, candidates);
  const tokens = candidates.map((c) => approxTokens(c.text));
  const mult = options.priorityMultipliers;
  const priority = candidates.map((c) => {
    const base = typeof c.priority === 'number' ? c.priority : defaultPriority;
    const scaled = mult && c.source in mult ? base * mult[c.source] : base;
    return Math.max(0, Math.min(1, scaled));
  });

  // Base score blends relevance and priority. Priority dominates ties so a
  // safety-critical block beats an equally-relevant nice-to-have.
  const base = candidates.map((_, i) => 0.6 * relevance[i] + 0.4 * priority[i]);

  const trace: ComposeTraceEntry[] = candidates.map((c, i) => ({
    source: c.source,
    relevance: Number(relevance[i].toFixed(3)),
    priority: Number(priority[i].toFixed(3)),
    score: Number(base[i].toFixed(3)),
    tokens: tokens[i],
    kept: false,
    reason: '',
  }));

  const selectedIdx: number[] = [];
  let tokensUsed = 0;

  // 1. Pinned blocks first, in input order — always kept (budget permitting,
  //    but they take precedence over everything else for the budget).
  for (let i = 0; i < candidates.length; i++) {
    if (!candidates[i].pinned) continue;
    selectedIdx.push(i);
    tokensUsed += tokens[i];
    trace[i].kept = true;
    trace[i].reason = 'pinned';
  }

  // 2. MMR greedy selection over the rest.
  const remaining = candidates
    .map((_, i) => i)
    .filter((i) => !candidates[i].pinned);

  while (remaining.length > 0) {
    let bestPos = -1;
    let bestMmr = -Infinity;
    for (let r = 0; r < remaining.length; r++) {
      const i = remaining[r];
      // Redundancy = max similarity to anything already selected.
      let maxSim = 0;
      for (const j of selectedIdx) {
        const sim = lexicalSimilarity(candidates[i].text, candidates[j].text);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = lambda * base[i] - (1 - lambda) * maxSim;
      if (mmr > bestMmr) {
        bestMmr = mmr;
        bestPos = r;
      }
    }
    const chosen = remaining[bestPos];
    remaining.splice(bestPos, 1);

    if (tokensUsed + tokens[chosen] <= tokenBudget) {
      selectedIdx.push(chosen);
      tokensUsed += tokens[chosen];
      trace[chosen].kept = true;
      trace[chosen].score = Number(bestMmr.toFixed(3));
      trace[chosen].reason = 'selected';
    } else {
      trace[chosen].score = Number(bestMmr.toFixed(3));
      trace[chosen].reason = 'over-budget';
    }
  }

  // Final prompt order: pinned (input order) first, then the rest by descending
  // base score so the most important non-pinned context leads.
  const pinnedSel = selectedIdx.filter((i) => candidates[i].pinned);
  const restSel = selectedIdx
    .filter((i) => !candidates[i].pinned)
    .sort((a, b) => base[b] - base[a]);
  const ordered = [...pinnedSel, ...restSel];

  const selected: ComposedBlock[] = ordered.map((i) => ({
    source: candidates[i].source,
    text: candidates[i].text,
    score: Number(base[i].toFixed(3)),
    tokens: tokens[i],
  }));

  return {
    selected,
    text: selected.map((s) => s.text).join('\n'),
    tokensUsed,
    trace,
  };
}

// ─── Source priority defaults ────────────────────────────────────────────────

/**
 * Default priority weights per enrichment source. Safety- and
 * delivery-critical signals rank highest; reference/strategy packs sit in the
 * middle; broad orientation sits lower. The enrichment layer can override per
 * call. Sources not listed fall back to the composer's defaultPriority.
 */
export const SOURCE_PRIORITY: Record<string, number> = {
  // Always-on, must dominate.
  'governed-envelope': 1.0,
  'client-attunement': 0.95,
  'project-profile': 0.9,
  'workflow': 0.85,
  // Proactive judgment layers — high when they fire.
  'constructive-challenge': 0.8,
  'decision-framework': 0.78,
  'agency-tactics': 0.75,
  'stakeholder-alignment': 0.72,
  'competitive-strategy': 0.7,
  // Live intelligence enrichment.
  'readiness': 0.68,
  'foresight': 0.66,
  'precedent': 0.64,
  'claims': 0.62,
  'deficiency': 0.62,
  // Knowledge / orientation.
  'industry-wisdom': 0.55,
  'tour-guide': 0.5,
  'first-session-tour': 0.5,
  'proactive-tour-guide': 0.45,
  // Audience framing rides along with whatever it frames.
  'role-lens': 0.6,
};

/** Look up the default priority for a source, or the global default. */
export function priorityForSource(source: string, fallback = 0.5): number {
  // Map slash-command source aliases (e.g. 'wisdom', 'guide') onto their pack.
  const aliases: Record<string, string> = {
    wisdom: 'industry-wisdom',
    guide: 'tour-guide', playbook: 'tour-guide', orient: 'tour-guide', tour: 'tour-guide',
    challenge: 'constructive-challenge', redteam: 'constructive-challenge', devil: 'constructive-challenge',
    decide: 'decision-framework', tradeoff: 'decision-framework', framework: 'decision-framework',
    meeting: 'agency-tactics', agency: 'agency-tactics', tactics: 'agency-tactics',
    position: 'competitive-strategy', landscape: 'competitive-strategy', compete: 'competitive-strategy',
    align: 'stakeholder-alignment',
  };
  const key = aliases[source] ?? source;
  return SOURCE_PRIORITY[key] ?? fallback;
}
