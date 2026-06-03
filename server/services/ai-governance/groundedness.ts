/**
 * Accept-time groundedness scoring.
 *
 * Computes a deterministic, synchronous groundedness signal for AI-generated
 * content at the moment it is accepted, so the human-review gate can act on it
 * without a per-accept LLM call. The signal is citation coverage: the fraction
 * of substantive claim sentences that carry an inline citation marker — a
 * standard, defensible proxy for "are the claims traceable to a source", which
 * is exactly what a regulated reviewer checks.
 *
 * This is the fast accept-time path. The richer, LLM-judged claim verification
 * (server/services/confidenceScoringEngine.ts → computeEvidenceConfidence /
 * verifyClaim) runs at generation/review time and can be supplied explicitly as
 * `groundednessScore` on the payload, which takes precedence over this proxy.
 *
 * @module server/services/ai-governance/groundedness
 */

/** Inline citation/traceability markers a grounded regulatory claim may carry. */
const CITATION_MARKERS: RegExp[] = [
  /\[\d+\]/, // [1], [12]
  /\([A-Z][A-Za-z]+(?:\s+et al\.?)?,?\s*\d{4}[a-z]?\)/, // (Smith, 2020), (Smith et al. 2020)
  /\bdoi:\s*10\.\d{4,}/i, // doi:10.xxxx
  /\bPMID:?\s*\d+/i, // PMID 12345678
  /\bNCT\d{6,}/, // NCT01234567
  /\[(?:ref|cite|source)[^\]]*\]/i, // [ref], [cite: ...]
  /\b(?:K|P|DEN|BLA|NDA)\d{5,}/, // predicate / submission numbers (K123456)
];

const TRAILING_WS = /\s+/g;

/** Split content into candidate sentences. */
function sentences(content: string): string[] {
  return content
    .replace(/\r/g, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/** A "claim" is a substantive sentence (not a heading, label, or fragment). */
function isClaim(sentence: string): boolean {
  const words = sentence.replace(TRAILING_WS, ' ').split(' ').filter(Boolean);
  if (words.length < 6) return false; // too short to be a claim
  if (sentence.endsWith(':')) return false; // heading / label line
  // Skip ALL-CAPS short headings.
  const letters = sentence.replace(/[^A-Za-z]/g, '');
  if (letters.length > 0 && letters === letters.toUpperCase() && words.length < 10) return false;
  return true;
}

export function hasCitation(sentence: string): boolean {
  return CITATION_MARKERS.some(re => re.test(sentence));
}

export interface CitationCoverage {
  /** 0..1 fraction of claim sentences carrying a citation; null when no claims found. */
  coverage: number | null;
  claims: number;
  cited: number;
}

/**
 * Citation coverage of the content's claim sentences. Returns null coverage
 * when there are no substantive claims to assess (so a heading-only or trivial
 * payload is reported as "not assessed" rather than a misleading 0).
 */
export function citationCoverage(content: string): CitationCoverage {
  const claims = sentences(content).filter(isClaim);
  if (claims.length === 0) return { coverage: null, claims: 0, cited: 0 };
  const cited = claims.filter(hasCitation).length;
  return { coverage: cited / claims.length, claims: claims.length, cited };
}

export type GroundednessSource = 'explicit' | 'computed' | 'none';

export interface ResolvedGroundedness {
  score: number | null;
  source: GroundednessSource;
  /** Whether a low score should block the accept (vs. only be recorded). */
  enforce: boolean;
  detail?: CitationCoverage;
}

function firstContentField(p: Record<string, unknown>): string | null {
  for (const key of ['content', 'refinedContent', 'draft', 'text']) {
    const v = p[key];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return null;
}

function explicitScore(p: Record<string, unknown>): number | null {
  const raw = p.groundednessScore ?? p.groundedness ?? p.confidence ?? p.confidenceScore;
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'string' ? Number(raw) : (raw as number);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve a groundedness score for an accept payload.
 *  - An explicit score (from the richer engine) wins and is always enforced.
 *  - Otherwise, if content is present, compute citation coverage. This is
 *    recorded always; it only blocks when the caller opts in
 *    (`enforceGroundedness: true`) so existing accept flows are not broken by
 *    surprise.
 *  - Otherwise the score is unknown (not assessed).
 */
export function resolveGroundedness(payload: Record<string, unknown> | undefined): ResolvedGroundedness {
  const p = payload ?? {};

  const explicit = explicitScore(p);
  if (explicit !== null) {
    return { score: explicit, source: 'explicit', enforce: true };
  }

  const content = firstContentField(p);
  if (content) {
    const detail = citationCoverage(content);
    return {
      score: detail.coverage,
      source: detail.coverage === null ? 'none' : 'computed',
      enforce: p.enforceGroundedness === true,
      detail,
    };
  }

  return { score: null, source: 'none', enforce: false };
}
