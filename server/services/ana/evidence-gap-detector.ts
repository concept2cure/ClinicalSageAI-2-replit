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
 *      (case-insensitive exact structured label) → gap.                   severity: major
 *   3. outcome — any requested outcomeType absent from evidence outcomeTypes → one gap
 *      listing the missing outcome types.                    severity: major
 *   4. temporal — `recencyYears` + `asOfYear` set and NO evidence item has
 *      `asOfYear - recencyYears <= year <= asOfYear` → gap.              severity: minor
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
  /** Validated evidence items considered; zero when supplied input is invalid. */
  evidenceCount: number;
  /** True only when requested dimensions were assessed and no metadata gap was found. */
  complete: boolean;
  /** False for invalid input, no requested dimensions, or invalid requested recency. */
  assessed: boolean;
  /** Invalid supplied fields; no verdict is issued over a silently reduced input. */
  inputIssues: string[];
  /** Honest caveats about the scope and basis of this report. */
  notes: string[];
}

/** Case-insensitive, whitespace-trimmed key for comparing structured tokens. */
function norm(value: string): string {
  return value.trim().toLowerCase();
}

function validRecency(query: GapQuery): boolean {
  return Number.isFinite(query.recencyYears) && (query.recencyYears as number) >= 0 &&
    Number.isInteger(query.asOfYear) && (query.asOfYear as number) > 0;
}

function recentYear(year: unknown, threshold: number, asOfYear: number): boolean {
  return typeof year === 'number' && Number.isInteger(year) && year >= threshold && year <= asOfYear;
}

function nonemptyLabel(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function recordInput(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function labelList(value: unknown): boolean {
  return Array.isArray(value) && value.every(nonemptyLabel);
}

function outcomeList(value: unknown): boolean {
  return Array.isArray(value) && value.every(item => item === 'efficacy' || item === 'safety');
}

/** Check supplied fields before generating coverage conclusions. */
function gapQueryIssues(query: unknown): string[] {
  if (!recordInput(query)) return ['query must be a structured object.'];
  const checks: Record<string, (value: unknown) => boolean> = {
    regions: labelList,
    population: nonemptyLabel,
    outcomeTypes: outcomeList,
    recencyYears: value => typeof value === 'number' && Number.isFinite(value) && value >= 0,
    asOfYear: value => typeof value === 'number' && Number.isInteger(value) && value > 0,
  };
  return Object.entries(query).flatMap(([key, value]) => {
    if (!Object.hasOwn(checks, key)) return [`query.${key} is not a supported coverage criterion.`];
    return checks[key](value) ? [] : [`query.${key} has an invalid value or shape.`];
  });
}

function evidenceItemIssues(item: unknown, index: number): string[] {
  const path = `evidence[${index}]`;
  if (!recordInput(item)) return [`${path} must be a structured object.`];
  const checks: Record<string, (value: unknown) => boolean> = {
    region: nonemptyLabel,
    population: nonemptyLabel,
    outcomeType: value => ['efficacy', 'safety', 'other'].includes(value as string),
    year: value => typeof value === 'number' && Number.isInteger(value) && value > 0,
  };
  return Object.entries(checks).flatMap(([key, check]) =>
    item[key] === undefined || check(item[key]) ? [] : [`${path}.${key} has an invalid value or shape.`]);
}

function gapInputIssues(query: unknown, evidence: unknown): string[] {
  const issues = gapQueryIssues(query);
  if (!Array.isArray(evidence)) return [...issues, 'evidence must be an array; unavailable evidence is not an empty search result.'];
  return [...issues, ...evidence.flatMap(evidenceItemIssues)];
}

/** Evaluate recency without treating an invalid request as a successful check. */
function assessRecency(query: GapQuery, items: EvidenceItem[], gaps: EvidenceGap[], notes: string[]): 'assessed' | 'invalid' | 'not_requested' {
  if (query.recencyYears !== undefined || query.asOfYear !== undefined) {
    if (!validRecency(query)) {
      notes.push('Recency was not assessed: provide a finite non-negative recency window and a valid positive integer reference year.');
      return 'invalid';
    } else {
      const asOfYear = query.asOfYear as number;
      const threshold = asOfYear - (query.recencyYears as number);
      const hasRecent = items.some((e) => recentYear(e.year, threshold, asOfYear));
      if (!hasRecent) {
        gaps.push({
          type: 'temporal',
          severity: 'minor',
          description:
            `The supplied structured years do not confirm evidence within the last ${query.recencyYears} year(s) ` +
            `(from ${threshold} through ${asOfYear}).`,
          suggestedQuery: `Search for evidence published from ${threshold} through ${asOfYear}.`,
        });
      }
      return 'assessed';
    }
  }
  return 'not_requested';
}

/**
 * Detect the gaps between what a question asked for and what the gathered evidence
 * covers. Pure and deterministic: identical input always yields identical output, and
 * gaps are emitted in the fixed order of {@link GAP_TYPES}.
 *
 * @param query    the coverage the answer should span
 * @param evidence the evidence actually gathered
 * @returns a {@link GapReport}; `complete` requires an assessed query with no metadata gaps
 */
export function detectEvidenceGaps(rawQuery: unknown, rawEvidence: unknown): GapReport {
  const inputIssues = gapInputIssues(rawQuery, rawEvidence);
  if (inputIssues.length > 0) return {
    gaps: [], evidenceCount: 0, assessed: false, complete: false, inputIssues,
    notes: ['Evidence coverage was not assessed because supplied inputs are invalid. Correct the named tool fields using available source context and retry before requesting client clarification.', ...inputIssues],
  };
  const query = rawQuery as GapQuery;
  const items = rawEvidence as EvidenceItem[];
  const gaps: EvidenceGap[] = [];
  const notes: string[] = [];
  let checkedDimensions = 0;

  // 1. geographic
  if (query.regions && query.regions.length > 0) {
    checkedDimensions++;
    const present = new Set(
      items
        .map((e) => e.region)
        .filter((r): r is string => nonemptyLabel(r))
        .map(norm),
    );
    const missing = query.regions.filter((r) => !present.has(norm(r)));
    if (missing.length > 0) {
      gaps.push({
        type: 'geographic',
        severity: 'major',
        description: `The supplied structured fields do not confirm coverage of requested region(s): ${missing.join(', ')}.`,
        missing,
        suggestedQuery: `Search for evidence covering region(s): ${missing.join(', ')}.`,
      });
    }
  }

  // 2. population
  if (nonemptyLabel(query.population)) {
    checkedDimensions++;
    notes.push('Population coverage uses exact normalized structured labels; a broader or negated label requires applicability verification, not a substring assumption.');
    const wanted = norm(query.population);
    const covered = items.some(
      (e) => typeof e.population === 'string' && norm(e.population) === wanted,
    );
    if (!covered) {
      gaps.push({
        type: 'population',
        severity: 'major',
        description: `The supplied structured fields do not confirm coverage of the requested population: ${query.population}.`,
        missing: [query.population],
        suggestedQuery: `Search for evidence in the ${query.population} population.`,
      });
    }
  }

  // 3. outcome
  if (query.outcomeTypes && query.outcomeTypes.length > 0) {
    checkedDimensions++;
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
        description: `The supplied structured fields do not confirm coverage of requested outcome type(s): ${missing.join(', ')}.`,
        missing,
        suggestedQuery: `Search for ${missing.join(' and ')} evidence.`,
      });
    }
  }

  const recency = assessRecency(query, items, gaps, notes);
  checkedDimensions += recency === 'assessed' ? 1 : 0;
  const invalidRecency = recency === 'invalid';
  if (checkedDimensions === 0 && !invalidRecency) notes.push('No coverage dimensions were requested; evidence completeness was not assessed.');
  const assessed = checkedDimensions > 0 && !invalidRecency;

  // Stable ordering by gap type (defensive; insertion order already matches GAP_TYPES).
  gaps.sort((a, b) => GAP_TYPES.indexOf(a.type) - GAP_TYPES.indexOf(b.type));

  return {
    gaps,
    evidenceCount: items.length,
    inputIssues,
    complete: assessed && gaps.length === 0,
    assessed,
    notes: [
      ...notes,
      'Coverage dimensions are checked independently; their union does not prove all requested populations, markets and outcomes are jointly supported by applicable evidence.',
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
