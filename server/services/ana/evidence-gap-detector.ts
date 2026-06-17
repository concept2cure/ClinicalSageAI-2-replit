/**
 * Evidence-gap detector — AnA's self-awareness of WHAT IT DOES NOT YET KNOW before
 * it answers.
 *
 * When AnA gathers evidence to answer a regulatory/clinical question, the evidence
 * it actually collected rarely covers everything the question implied. Answering on
 * partial data silently — e.g. synthesizing a "global" position from US/EU evidence
 * while saying nothing about JP, or a safety claim from efficacy-only studies — is a
 * trust failure. The honest move is to NOTICE the gap and offer to search further
 * BEFORE synthesizing.
 *
 * This module compares the coverage a QUESTION asked for ({@link GapQuery}) against
 * what the gathered EVIDENCE ({@link EvidenceItem}[]) actually covers, and reports the
 * gaps so AnA can proactively ask rather than over-claim.
 *
 * It is a PURE, deterministic detector:
 *   - No LLM, no network, no DB, no IO of any kind, no clock (recency uses the caller-
 *     supplied `asOfYear`, never `Date.now`).
 *   - Identical input always yields identical output, with stable ordering by gap type.
 *   - HONEST by construction: it reasons ONLY over the structured fields supplied. It
 *     cannot read free text, so a gap it reports is advisory ("the structured fields
 *     don't show coverage"), not a claim that the underlying source truly lacks it.
 *
 * Gap rules (all deterministic; ordering follows {@link GAP_TYPES}):
 *   1. geographic — any requested region absent (case-insensitive) from evidence
 *      regions → one gap listing the missing regions.        severity: major
 *   2. population — `query.population` set and NO evidence item's population matches it
 *      (case-insensitive substring) → gap.                   severity: major
 *   3. outcome — any requested outcomeType absent from evidence outcomeTypes → one gap
 *      listing the missing outcome types.                    severity: major
 *   4. temporal — `recencyYears` + `asOfYear` set and NO evidence item has
 *      `year >= asOfYear - recencyYears` → gap.              severity: minor
 *
 * @module server/services/ana/evidence-gap-detector
 */

/** A single piece of gathered evidence, described by its structured coverage fields. */
export interface EvidenceItem {
  /** Region the evidence pertains to (e.g. 'US', 'EU', 'JP'). */
  region?: string;
  /** Population studied (e.g. 'adult', 'pediatric'). */
  population?: string;
  /** What the evidence reports on. */
  outcomeType?: 'efficacy' | 'safety' | 'other';
  /** Publication / study year (used for recency). */
  year?: number;
}

/** The coverage a question asked the answer to span. All fields are optional. */
export interface GapQuery {
  /** Regions the answer should cover (e.g. ['US','EU','JP']). */
  regions?: string[];
  /** Population the answer should cover (e.g. 'pediatric'). */
  population?: string;
  /** Outcome types the answer should cover. */
  outcomeTypes?: ('efficacy' | 'safety')[];
  /** Evidence should include something within this many years of `asOfYear`. */
  recencyYears?: number;
  /** Reference year for recency. REQUIRED when `recencyYears` is set. Pure: never Date.now. */
  asOfYear?: number;
}

/** The dimensions along which evidence coverage is checked, in stable report order. */
export const GAP_TYPES = ['geographic', 'population', 'outcome', 'temporal'] as const;

/** A gap type. */
export type GapType = (typeof GAP_TYPES)[number];

/** A single detected coverage gap. */
export interface EvidenceGap {
  /** Which coverage dimension is missing. */
  type: GapType;
  /** How consequential the gap is to answering honestly. */
  severity: 'critical' | 'major' | 'minor';
  /** Human-readable description of what is missing. */
  description: string;
  /** The specific missing values, when enumerable (e.g. the missing regions). */
  missing?: string[];
  /** A suggested follow-up search AnA could offer before synthesizing. */
  suggestedQuery: string;
}

/** The full coverage report. */
export interface GapReport {
  /** Detected gaps, stably ordered by {@link GAP_TYPES}. */
  gaps: EvidenceGap[];
  /** Number of evidence items considered. */
  evidenceCount: number;
  /** True iff there are no gaps. */
  complete: boolean;
  /** Honest caveats about the scope and basis of this report. */
  notes: string[];
}

/** Case-insensitive, whitespace-trimmed key for comparing structured tokens. */
function norm(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Detect the gaps between what a question asked for and what the gathered evidence
 * covers. Pure and deterministic: identical input always yields identical output, and
 * gaps are emitted in the fixed order of {@link GAP_TYPES}.
 *
 * @param query    the coverage the answer should span
 * @param evidence the evidence actually gathered
 * @returns a {@link GapReport}; `complete` is true iff `gaps` is empty
 */
export function detectEvidenceGaps(query: GapQuery, evidence: EvidenceItem[]): GapReport {
  const items = Array.isArray(evidence) ? evidence : [];
  const gaps: EvidenceGap[] = [];

  // 1. geographic
  if (query.regions && query.regions.length > 0) {
    const present = new Set(
      items
        .map((e) => e.region)
        .filter((r): r is string => typeof r === 'string' && r.trim() !== '')
        .map(norm),
    );
    const missing = query.regions.filter((r) => !present.has(norm(r)));
    if (missing.length > 0) {
      gaps.push({
        type: 'geographic',
        severity: 'major',
        description: `Evidence does not cover requested region(s): ${missing.join(', ')}.`,
        missing,
        suggestedQuery: `Search for evidence covering region(s): ${missing.join(', ')}.`,
      });
    }
  }

  // 2. population
  if (query.population && query.population.trim() !== '') {
    const wanted = norm(query.population);
    const covered = items.some(
      (e) => typeof e.population === 'string' && norm(e.population).includes(wanted),
    );
    if (!covered) {
      gaps.push({
        type: 'population',
        severity: 'major',
        description: `No evidence covers the requested population: ${query.population}.`,
        missing: [query.population],
        suggestedQuery: `Search for evidence in the ${query.population} population.`,
      });
    }
  }

  // 3. outcome
  if (query.outcomeTypes && query.outcomeTypes.length > 0) {
    const present = new Set(
      items
        .map((e) => e.outcomeType)
        .filter((o): o is 'efficacy' | 'safety' | 'other' => typeof o === 'string'),
    );
    const missing = query.outcomeTypes.filter((o) => !present.has(o));
    if (missing.length > 0) {
      gaps.push({
        type: 'outcome',
        severity: 'major',
        description: `Evidence does not cover requested outcome type(s): ${missing.join(', ')}.`,
        missing,
        suggestedQuery: `Search for ${missing.join(' and ')} evidence.`,
      });
    }
  }

  // 4. temporal
  if (typeof query.recencyYears === 'number' && typeof query.asOfYear === 'number') {
    const threshold = query.asOfYear - query.recencyYears;
    const hasRecent = items.some((e) => typeof e.year === 'number' && e.year >= threshold);
    if (!hasRecent) {
      gaps.push({
        type: 'temporal',
        severity: 'minor',
        description:
          `No evidence is from within the last ${query.recencyYears} year(s) ` +
          `(on/after ${threshold}, as of ${query.asOfYear}).`,
        suggestedQuery: `Search for evidence published in ${threshold} or later.`,
      });
    }
  }

  // Stable ordering by gap type (defensive; insertion order already matches GAP_TYPES).
  gaps.sort((a, b) => GAP_TYPES.indexOf(a.type) - GAP_TYPES.indexOf(b.type));

  return {
    gaps,
    evidenceCount: items.length,
    complete: gaps.length === 0,
    notes: [
      'Advisory only: gaps are inferred from the structured fields supplied on each ' +
        'evidence item (region/population/outcomeType/year), not from full text. A reported ' +
        'gap means the structured fields do not show coverage — not that the underlying ' +
        'source definitely lacks it. Recency is judged against the caller-supplied asOfYear.',
    ],
  };
}

export default {
  GAP_TYPES,
  detectEvidenceGaps,
};
