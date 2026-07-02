/**
 * Living Record Spine — pure document-citation matching.
 *
 * The deterministic core of "bind a governed value to the CTD/IND document
 * section that cites it." Given the labelled numbers extracted from a section's
 * prose and the program's active canonical facts, decide which extracted number
 * is a citation of which fact — and whether the cited value currently agrees
 * with the governed value or already diverges (the inconsistency-intelligence
 * moment).
 *
 * No database, no I/O. The regex extraction lives in
 * intelligence/cross-artifact-consistency.ts (extractNumericalFacts); this
 * module only maps its output onto facts and compares values, reusing the same
 * value comparator the reconciliation engine uses so a citation and a claim are
 * judged by one rule.
 *
 * See docs/architecture/LIVING_RECORD_SPINE.md §3.7 (Document Citations).
 */

import { compareValues, type FactValueView } from './value-reconciliation';

// ─────────────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────────────

/** One labelled number pulled from section prose (extractNumericalFacts shape). */
export interface ExtractedNumber {
  label: string;
  value: string;
  unit?: string;
  context: string;
  offset: number;
}

/** The slice of an active canonical_facts row the matcher needs. */
export interface ActiveFactView extends FactValueView {
  id: string;
  entity: string;
  field: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Label ↔ field affinity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The vocabulary extractNumericalFacts emits, mapped to the field-name tokens a
 * canonical fact is likely to carry. A citation is only proposed when the
 * extracted label has affinity to the fact's (entity, field) — matching on the
 * bare number alone would bind coincidental values.
 */
const LABEL_FIELD_SYNONYMS: Record<string, string[]> = {
  sample_size: ['sample_size', 'samplesize', 'n', 'enrolled', 'randomized', 'randomised', 'population', 'subjects'],
  p_value: ['p_value', 'pvalue', 'p'],
  confidence_interval: ['confidence_interval', 'ci', 'confidence'],
  lsm_difference: ['lsm_difference', 'lsm', 'treatment_difference', 'lsmean'],
  mean_change: ['mean_change', 'meanchange', 'change_from_baseline'],
  hba1c_reduction: ['hba1c_reduction', 'hba1c', 'a1c'],
  dose_mg: ['dose', 'dose_mg', 'dosage', 'strength'],
  dose_kg: ['dose', 'dose_mg_kg', 'dose_kg', 'dosage'],
  noael: ['noael'],
  mrsd: ['mrsd', 'starting_dose'],
  shelf_life: ['shelf_life', 'shelflife', 'expiry', 'expiration'],
  duration_weeks: ['duration', 'duration_weeks', 'treatment_duration', 'study_duration'],
  age_range: ['age', 'age_range'],
  batches: ['batches', 'batch_count', 'batches_count'],
};

/** lowercase, non-alphanumeric → '_', collapse repeats, trim. */
export function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Does an extracted label plausibly name this fact's (entity, field)? */
export function labelMatchesFact(label: string, fact: ActiveFactView): boolean {
  const field = normalizeToken(fact.field);
  const entityField = normalizeToken(`${fact.entity}_${fact.field}`);
  const normLabel = normalizeToken(label);
  const synonyms = LABEL_FIELD_SYNONYMS[label] ?? [normLabel];

  for (const raw of [normLabel, ...synonyms]) {
    const syn = normalizeToken(raw);
    if (!syn) continue;
    if (field === syn) return true;
    // Substring only against the fuller entity_field key, and only for tokens
    // long enough to be meaningful (guards against 'n'/'p' matching everything).
    if (syn.length >= 3 && entityField.includes(syn)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching
// ─────────────────────────────────────────────────────────────────────────────

export interface CitationMatch {
  factId: string;
  entity: string;
  field: string;
  label: string;
  observedValue: string;
  observedUnit?: string;
  context: string;
  offset: number;
  /** Does the cited value currently agree with the governed value? */
  consistency: 'consistent' | 'divergent';
  driftType: string | null;
}

export interface CitationMatchResult {
  matches: CitationMatch[];
  /** Extracted numbers that mapped to no active fact (informational). */
  unmatchedLabels: string[];
}

/**
 * Match every extracted number to at most one active fact by label affinity.
 * When several facts have affinity to one label, the value comparison breaks
 * the tie: a fact the value agrees with wins over one it diverges from, so an
 * already-consistent citation is preferred over a spurious divergence. Pure.
 */
export function matchCitationsToFacts(
  extracted: ExtractedNumber[],
  facts: ActiveFactView[],
  opts?: { tolerance?: number },
): CitationMatchResult {
  const matches: CitationMatch[] = [];
  const unmatched: string[] = [];

  for (const number of extracted) {
    const candidates = facts.filter(f => labelMatchesFact(number.label, f));
    if (candidates.length === 0) {
      unmatched.push(number.label);
      continue;
    }

    let best: CitationMatch | null = null;
    for (const fact of candidates) {
      const cmp = compareValues({
        fact,
        observed: number.value,
        observedUnit: number.unit ?? null,
        tolerance: opts?.tolerance,
      });
      const candidate: CitationMatch = {
        factId: fact.id,
        entity: fact.entity,
        field: fact.field,
        label: number.label,
        observedValue: number.value,
        observedUnit: number.unit,
        context: number.context,
        offset: number.offset,
        consistency: cmp.equal ? 'consistent' : 'divergent',
        driftType: cmp.equal ? null : cmp.driftType,
      };
      // Prefer a consistent match; otherwise keep the first divergent one.
      if (best === null || (best.consistency === 'divergent' && candidate.consistency === 'consistent')) {
        best = candidate;
      }
    }
    if (best) matches.push(best);
  }

  return { matches, unmatchedLabels: [...new Set(unmatched)] };
}

export interface CitationScanSummary {
  extracted: number;
  matched: number;
  consistent: number;
  divergent: number;
}

export function summarizeCitationMatches(result: CitationMatchResult): CitationScanSummary {
  return {
    extracted: result.matches.length + result.unmatchedLabels.length,
    matched: result.matches.length,
    consistent: result.matches.filter(m => m.consistency === 'consistent').length,
    divergent: result.matches.filter(m => m.consistency === 'divergent').length,
  };
}
