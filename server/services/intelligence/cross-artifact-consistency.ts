/**
 * Cross-Artifact Consistency Service
 *
 * Given a draft and its project, pulls the project's other artifacts and
 * checks for consistency divergences that reviewers cross-check ruthlessly:
 *   - Sample sizes that differ between a drafted Module 2.5 and an existing Module 5.3.5
 *   - Endpoint names/definitions that drift between a SAP and a CSR synopsis
 *   - Dose levels or NOAEL values that conflict across Module 4 and Module 2.4
 *   - Section cross-references that point to non-existent targets
 *
 * The checker is deterministic (regex + numeric extraction, no LLM) so it runs
 * fast enough to call on every drafted artifact.  It complements the RIM
 * pattern registry, which catches REGULATORY pattern matches; this service
 * catches INTRA-PROJECT factual drift.
 *
 * 2026-09-28 (row 74, slice S3): a failed read of the project's artifacts no
 * longer returns the empty report as-is. That report's verdict is 'clean', so
 * a database error reached the model as "No consistency issues detected"
 * when nothing had been compared — an error rendered as a pass. The report is
 * now marked `unavailable: 'artifacts_unreadable'`, and check_dossier_consistency
 * answers with an error instead of a verdict.
 *
 * 2026-10-04 (b1-consistency-defects): three honesty fixes.
 *   - A two-number fact (CI, age range) keeps its signed lower bound in
 *     `value` and its upper bound in `upper`. The upper bound was stored as
 *     the fact's `unit`, and the CI's minus sign sat outside the capture, so
 *     "95% CI -0.10 to 0.30" matched "95% CI 0.10 to 0.30".
 *   - A label stated more than once in either document is compared as a set,
 *     not on its first occurrence ("Drug X n=305; placebo n=303" against a
 *     CSR that lists placebo first was a false critical blocker).
 *   - A report that compared nothing says so (`notCompared`), and one cut
 *     short by the artifact cap says so (`truncated`). The within-document
 *     check no longer issues 'likely_inconsistency' from a severity label;
 *     check_numerical_integrity takes that verdict only from the canonical
 *     in-document rule (ana/terminology-consistency checkValueConsistency).
 *
 * @module server/services/intelligence/cross-artifact-consistency
 */

import { db } from '../../db.js';
import { eq, and, ne } from 'drizzle-orm';
import { concept2cureArtifacts } from '../../../shared/schema.js';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('cross-artifact-consistency');

export type DivergenceSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface NumericalFact {
  /** The label or key this number is attached to (e.g. "sample size", "LSM difference"). */
  readonly label: string;
  /** The raw numeric value as it appears in text. */
  readonly value: string;
  /**
   * The upper bound of a two-number fact (confidence interval, age range);
   * `value` is then the lower bound. Undefined for single-number facts.
   */
  readonly upper?: string;
  /** Optional unit if detected (%, mg, kg, etc.). */
  readonly unit?: string;
  /** The surrounding sentence or phrase for the reviewer to inspect. */
  readonly context: string;
  /** Position in the source text, useful for diffs. */
  readonly offset: number;
}

export interface ConsistencyDivergence {
  readonly kind:
    | 'numeric_divergence'     // Same labelled quantity with different values
    | 'endpoint_drift'          // Primary endpoint wording differs
    | 'population_drift'        // Study population / N differs
    | 'missing_cross_reference' // Draft references a section that doesn't exist in project
    | 'orphan_section';         // Draft references a section not tied to any artifact
  readonly severity: DivergenceSeverity;
  readonly description: string;
  readonly draftValue: string;
  readonly existingValue?: string;
  readonly existingArtifactId?: string;
  readonly existingArtifactTitle?: string;
  readonly existingCtdSection?: string | null;
  readonly draftContext?: string;
  readonly existingContext?: string;
}

export interface ConsistencyReport {
  readonly projectId: number;
  readonly organizationId: number;
  readonly draftCtdSection?: string;
  readonly artifactsCompared: number;
  readonly draftFactsExtracted: number;
  readonly divergences: readonly ConsistencyDivergence[];
  readonly verdict: 'clean' | 'minor_issues' | 'needs_review' | 'blocker';
  readonly generatedAt: string;
  /**
   * Set when the project's artifacts could not be read, so nothing was
   * compared. The verdict of such a report means nothing and must not be
   * shown as one.
   */
  readonly unavailable?: 'artifacts_unreadable';
  /**
   * Set when nothing was compared for a reason other than a failed read: an
   * invalid project, a draft too short to check, or a draft with no labelled
   * figures and no section to cross-reference. Like `unavailable`, the
   * verdict of such a report means nothing and must not be shown as one.
   */
  readonly notCompared?: 'invalid_project' | 'draft_too_short' | 'no_draft_facts';
  /** Set when the project held more artifacts than `maxArtifacts`; only that many were compared. */
  readonly truncated?: true;
}

// ─────────────────────────────────────────────────────────────────────────────
// NUMERIC FACT EXTRACTION
//
// Regulatory prose tends to attach numbers to recognizable keys: n=, N=,
// sample size, LSM, mean, median, p=, CI, dose, NOAEL, LOAEL, MRSD, etc.
// We extract ONLY the labelled cases, not every integer in the text, because
// free-standing numbers have too much false-positive risk for comparison.
// ─────────────────────────────────────────────────────────────────────────────

const LABELLED_NUMERIC_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'sample_size',     pattern: /\b(?:N|n|sample\s+size|enrolled|randomi[sz]ed)\s*[=:]\s*([0-9,]+)/gi },
  { label: 'p_value',         pattern: /\bp\s*[<=]\s*(0?\.[0-9]+|[0-9]+(?:\.[0-9]+)?[eE]-?[0-9]+)/gi },
  { label: 'confidence_interval', pattern: /\b(?:95|99)\s*%?\s*CI[:\s]*([-−]?[0-9.]+)\s*(?:to|,|-|–|—)\s*([-−]?[0-9.]+)/gi },
  { label: 'lsm_difference',  pattern: /\bLSM\s+difference[:\s]*[-−]?([0-9.]+)\s*%?/gi },
  { label: 'mean_change',     pattern: /\bmean\s+change\s+(?:from\s+baseline\s+)?(?:of\s+|[=:]\s*)[-−]?([0-9.]+)/gi },
  { label: 'hba1c_reduction', pattern: /\bHbA1[cC]\s+reduction\s*(?:of\s+|[=:]\s*)[-−]?([0-9.]+)\s*%/gi },
  { label: 'dose_mg',         pattern: /\b([0-9]+(?:\.[0-9]+)?)\s*mg\s+(?:once|twice|dose|daily|QD|BID|TID|QID)/gi },
  { label: 'dose_kg',         pattern: /\b([0-9]+(?:\.[0-9]+)?)\s*mg\/kg\b/gi },
  { label: 'noael',           pattern: /\bNOAEL\s*(?:of\s+|[=:]\s*)([0-9]+(?:\.[0-9]+)?)\s*(mg\/kg\/day|mg\/kg|mg|ug\/kg\/day)?/gi },
  { label: 'mrsd',            pattern: /\bMRSD\s*(?:of\s+|[=:]\s*)([0-9]+(?:\.[0-9]+)?)\s*(mg|mg\/kg|ug)?/gi },
  { label: 'shelf_life',      pattern: /\b([0-9]+)\s*[-‒–—]\s*month\s+shelf[- ]life\b/gi },
  { label: 'duration_weeks',  pattern: /\b(?:at\s+week|week\s+|through\s+week\s+)([0-9]+)\b/gi },
  { label: 'age_range',       pattern: /\bages?\s+([0-9]+)\s*(?:to|-|–)\s*([0-9]+)\s*(?:years?|yrs?)?/gi },
  { label: 'batches',         pattern: /\b([0-9]+)\s+(?:of\s+[0-9]+\s+)?(?:pivotal\s+|registration\s+|validation\s+)?batches?\b/gi },
  // ── Medical device / IVD quantities ──────────────────────────────────────
  // Anchored on an explicit label + connector so a bare percentage is never
  // captured. Clinical performance, analytical performance, submission
  // identifiers, and risk metrics — the governed values device/IVD documents
  // cite across the technical documentation, SE discussion, CER, and IFU.
  { label: 'sensitivity',      pattern: /\b(?:clinical\s+)?sensitivity(?:\s*\([^)]*\))?\s*(?:of|was|is|=|:)\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*%/gi },
  { label: 'specificity',      pattern: /\b(?:clinical\s+)?specificity(?:\s*\([^)]*\))?\s*(?:of|was|is|=|:)\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*%/gi },
  { label: 'ppa',              pattern: /\b(?:positive\s+percent\s+agreement|PPA)(?:\s*\([^)]*\))?\s*(?:of|was|is|=|:)\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*%/gi },
  { label: 'npa',              pattern: /\b(?:negative\s+percent\s+agreement|NPA)(?:\s*\([^)]*\))?\s*(?:of|was|is|=|:)\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*%/gi },
  { label: 'lod',              pattern: /\b(?:LoD|limit\s+of\s+detection)\s*(?:of|was|is|=|:)\s*([0-9]+(?:\.[0-9]+)?)\s*(copies\/mL|IU\/mL|ng\/mL|pg\/mL|cfu\/mL|mg\/L|%)?/gi },
  { label: 'lob',              pattern: /\b(?:LoB|limit\s+of\s+blank)\s*(?:of|was|is|=|:)\s*([0-9]+(?:\.[0-9]+)?)/gi },
  { label: 'loq',              pattern: /\b(?:LoQ|limit\s+of\s+quantitation)\s*(?:of|was|is|=|:)\s*([0-9]+(?:\.[0-9]+)?)/gi },
  { label: 'precision_cv',     pattern: /\b(?:CV|coefficient\s+of\s+variation)(?:\s*\([^)]*\))?\s*(?:of|was|is|=|:)\s*([0-9]+(?:\.[0-9]+)?)\s*%/gi },
  { label: 'predicate_knumber', pattern: /\b(K[0-9]{6})\b/g },
  { label: 'de_novo_number',   pattern: /\b(DEN[0-9]{6})\b/g },
  { label: 'pma_number',       pattern: /\b(P[0-9]{6})\b/g },
  { label: 'rpn',              pattern: /\bRPN\s*(?:of|was|is|=|:)\s*([0-9]+(?:\.[0-9]+)?)/gi },
];

/** Labels whose second capture is an upper bound, not a unit. */
const TWO_BOUND_LABELS = new Set(['confidence_interval', 'age_range']);

/** A Unicode minus (U+2212) does not parse; normalise it to '-'. */
function normaliseSign(v: string): string {
  return v.replace(/−/g, '-');
}

export function extractNumericalFacts(text: string): NumericalFact[] {
  if (!text || text.length < 20) return [];
  const facts: NumericalFact[] = [];
  const seen = new Set<string>();

  for (const { label, pattern } of LABELLED_NUMERIC_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const twoBound = TWO_BOUND_LABELS.has(label);
      const value = normaliseSign(match[1]);
      const offset = match.index;
      const context = extractSentenceContext(text, offset);
      // Dedup by label+value+offset so a single line isn't double-counted
      const key = `${label}:${value}:${offset}`;
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push({
        label,
        value,
        context,
        offset,
        upper: twoBound ? normaliseSign(match[2]) : undefined,
        unit: twoBound ? undefined : match[2] || undefined,
      });
    }
  }

  return facts;
}

function extractSentenceContext(text: string, offset: number): string {
  const SEARCH_WINDOW = 160;
  const start = Math.max(0, offset - 80);
  const end = Math.min(text.length, offset + SEARCH_WINDOW);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION CROSS-REFERENCE EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_REFERENCE_PATTERN =
  /\b(?:Module|Section|§)\s+([0-9](?:\.[0-9A-Z]+)*(?:\.[0-9]+)*)/gi;

export function extractSectionReferences(text: string): string[] {
  if (!text) return [];
  const refs = new Set<string>();
  SECTION_REFERENCE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SECTION_REFERENCE_PATTERN.exec(text)) !== null) {
    refs.add(match[1]);
  }
  return Array.from(refs);
}

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-ARTIFACT COMPARISON
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_BY_LABEL: Record<string, DivergenceSeverity> = {
  sample_size: 'critical',        // RTF trigger
  p_value: 'high',
  confidence_interval: 'high',
  lsm_difference: 'high',
  mean_change: 'high',
  hba1c_reduction: 'high',
  dose_mg: 'critical',            // Dose mismatch is patient-safety
  dose_kg: 'critical',
  noael: 'critical',
  mrsd: 'critical',
  shelf_life: 'high',             // Affects product labeling
  duration_weeks: 'medium',
  age_range: 'medium',
  batches: 'medium',
  // Device / IVD — a performance-claim or predicate mismatch is a submission
  // blocker (substantial-equivalence / performance-evaluation collapses).
  sensitivity: 'critical',
  specificity: 'critical',
  ppa: 'critical',
  npa: 'critical',
  lod: 'high',
  lob: 'high',
  loq: 'high',
  precision_cv: 'high',
  predicate_knumber: 'critical', // wrong predicate breaks the SE argument
  de_novo_number: 'high',
  pma_number: 'high',
  rpn: 'high',                    // risk acceptability threshold
};

function severityFor(label: string): DivergenceSeverity {
  return SEVERITY_BY_LABEL[label] ?? 'medium';
}

function numbersMatch(a: string, b: string): boolean {
  // Tolerant comparison: strip commas, trim, parse as numbers when possible.
  const na = a.replace(/,/g, '').trim();
  const nb = b.replace(/,/g, '').trim();
  if (na === nb) return true;
  const fa = parseFloat(na);
  const fb = parseFloat(nb);
  if (Number.isFinite(fa) && Number.isFinite(fb)) {
    // Within 0.5% tolerance for float rounding artefacts
    const tolerance = Math.max(Math.abs(fa), Math.abs(fb)) * 0.005;
    return Math.abs(fa - fb) <= tolerance;
  }
  return false;
}

/** Two facts match when their values match and, for a two-number fact, their upper bounds too. */
function valuesMatch(a: NumericalFact, b: NumericalFact): boolean {
  if (!numbersMatch(a.value, b.value)) return false;
  if (a.upper === undefined && b.upper === undefined) return true;
  return a.upper !== undefined && b.upper !== undefined && numbersMatch(a.upper, b.upper);
}

/** A fact as a reader would write it: "-0.10 to 0.30", "50 mg/kg/day". */
function formatFact(f: NumericalFact): string {
  const range = f.upper !== undefined ? `${f.value} to ${f.upper}` : f.value;
  return f.unit ? `${range} ${f.unit}` : range;
}

export async function checkDossierConsistency(params: {
  projectId: number;
  organizationId: number;
  draftContent: string;
  draftCtdSection?: string;
  /** Skip an existing artifact id when re-checking a draft of that artifact. */
  excludeArtifactId?: number;
  /** Max related artifacts to pull for comparison. Default 25. */
  maxArtifacts?: number;
}): Promise<ConsistencyReport> {
  const { projectId, organizationId, draftContent, draftCtdSection, excludeArtifactId } = params;
  const maxArtifacts = params.maxArtifacts ?? 25;

  const emptyReport: ConsistencyReport = {
    projectId,
    organizationId,
    draftCtdSection,
    artifactsCompared: 0,
    draftFactsExtracted: 0,
    divergences: [],
    verdict: 'clean',
    generatedAt: new Date().toISOString(),
  };

  if (!Number.isFinite(projectId) || projectId <= 0) return { ...emptyReport, notCompared: 'invalid_project' };
  if (!draftContent || draftContent.length < 100) return { ...emptyReport, notCompared: 'draft_too_short' };

  const draftFacts = extractNumericalFacts(draftContent);
  if (draftFacts.length === 0 && !draftCtdSection) return { ...emptyReport, notCompared: 'no_draft_facts' };

  let relatedArtifacts: Array<{
    id: number;
    artifactId: string;
    title: string;
    content: string;
    ctdSection: string | null;
    status: string;
  }> = [];
  let truncated: boolean;

  try {
    const rows = await db
      .select({
        id: concept2cureArtifacts.id,
        artifactId: concept2cureArtifacts.artifactId,
        title: concept2cureArtifacts.title,
        content: concept2cureArtifacts.content,
        ctdSection: concept2cureArtifacts.ctdSection,
        status: concept2cureArtifacts.status,
      })
      .from(concept2cureArtifacts)
      .where(
        excludeArtifactId
          ? and(
              eq(concept2cureArtifacts.projectId, projectId),
              eq(concept2cureArtifacts.organizationId, organizationId),
              ne(concept2cureArtifacts.id, excludeArtifactId),
            )
          : and(
              eq(concept2cureArtifacts.projectId, projectId),
              eq(concept2cureArtifacts.organizationId, organizationId),
            ),
      )
      // One row past the cap tells us the comparison was cut short.
      .limit(maxArtifacts + 1);
    truncated = rows.length > maxArtifacts;
    relatedArtifacts = rows.slice(0, maxArtifacts);
  } catch (err) {
    logger.warn(
      `[cross-artifact] Failed to load related artifacts: ${err instanceof Error ? err.message : 'unknown'}`,
    );
    // Not the empty report: its verdict is 'clean', and nothing was compared.
    return { ...emptyReport, unavailable: 'artifacts_unreadable' };
  }

  const divergences: ConsistencyDivergence[] = [];

  // 1. Numeric divergences — same labelled quantity, different values
  for (const existing of relatedArtifacts) {
    const existingFacts = extractNumericalFacts(existing.content);
    if (existingFacts.length === 0) continue;

    // Group facts by label. A label with one distinct value on each side is
    // compared directly. A label with several distinct values on either side
    // (two arms, two cohorts) cannot be paired by position, so the sets are
    // compared and only a disjoint pair is flagged — at medium, because the
    // checker cannot tell which value belongs to which arm.
    const draftByLabel = groupByLabel(draftFacts);
    const existingByLabel = groupByLabel(existingFacts);

    for (const [label, draftGroup] of draftByLabel) {
      const existingGroup = existingByLabel.get(label);
      if (!existingGroup) continue;
      const draftDistinct = distinctFacts(draftGroup);
      const existingDistinct = distinctFacts(existingGroup);
      if (draftDistinct.some(d => existingDistinct.some(e => valuesMatch(d, e)))) continue;

      const draftFact = draftDistinct[0];
      const existingFact = existingDistinct[0];
      const single = draftDistinct.length === 1 && existingDistinct.length === 1;
      const draftValue = draftDistinct.map(formatFact).join('; ');
      const existingValue = existingDistinct.map(formatFact).join('; ');
      divergences.push({
        kind: 'numeric_divergence',
        severity: single ? severityFor(label) : 'medium',
        description: single
          ? `${humanLabel(label)} differs: draft says ${draftValue}, existing artifact "${existing.title}" says ${existingValue}.`
          : `${humanLabel(label)} values do not overlap: draft states ${draftValue}, existing artifact "${existing.title}" states ${existingValue}. The arms or sets could not be paired, so check each one.`,
        draftValue,
        existingValue,
        existingArtifactId: existing.artifactId,
        existingArtifactTitle: existing.title,
        existingCtdSection: existing.ctdSection,
        draftContext: draftFact.context,
        existingContext: existingFact.context,
      });
    }
  }

  // 2. Missing cross-references — draft points to a Module X.Y that no
  //    artifact in the project covers.
  const draftSectionRefs = extractSectionReferences(draftContent);
  if (draftSectionRefs.length > 0) {
    const coveredSections = new Set<string>();
    for (const a of relatedArtifacts) {
      if (a.ctdSection) coveredSections.add(a.ctdSection);
    }
    for (const ref of draftSectionRefs) {
      // Allow prefix match (e.g. ref "3.2.S" is covered by artifact section "3.2.S.1")
      const covered = Array.from(coveredSections).some(
        s => s === ref || s.startsWith(`${ref}.`) || ref.startsWith(`${s}.`),
      );
      if (!covered && ref !== draftCtdSection) {
        divergences.push({
          kind: 'missing_cross_reference',
          severity: 'medium',
          description: `Draft references Module/Section ${ref} but no artifact in this project currently covers it.`,
          draftValue: ref,
        });
      }
    }
  }

  const verdict = computeVerdict(divergences);

  return {
    projectId,
    organizationId,
    draftCtdSection,
    artifactsCompared: relatedArtifacts.length,
    draftFactsExtracted: draftFacts.length,
    divergences,
    verdict,
    generatedAt: new Date().toISOString(),
    ...(truncated ? { truncated: true as const } : {}),
  };
}

function groupByLabel(facts: readonly NumericalFact[]): Map<string, NumericalFact[]> {
  const byLabel = new Map<string, NumericalFact[]>();
  for (const f of facts) {
    const list = byLabel.get(f.label) ?? [];
    list.push(f);
    byLabel.set(f.label, list);
  }
  return byLabel;
}

/** One fact per distinct value, so a figure repeated verbatim counts once. */
function distinctFacts(group: readonly NumericalFact[]): NumericalFact[] {
  const out: NumericalFact[] = [];
  for (const f of group) if (!out.some(o => valuesMatch(o, f))) out.push(f);
  return out;
}

function humanLabel(label: string): string {
  const map: Record<string, string> = {
    sample_size: 'Sample size (N)',
    p_value: 'p-value',
    confidence_interval: 'Confidence interval',
    lsm_difference: 'LSM difference',
    mean_change: 'Mean change',
    hba1c_reduction: 'HbA1c reduction',
    dose_mg: 'Dose (mg)',
    dose_kg: 'Dose (mg/kg)',
    noael: 'NOAEL',
    mrsd: 'MRSD',
    shelf_life: 'Shelf life',
    duration_weeks: 'Study duration (weeks)',
    age_range: 'Age range',
    batches: 'Batch count',
    sensitivity: 'Clinical sensitivity (%)',
    specificity: 'Clinical specificity (%)',
    ppa: 'Positive percent agreement (%)',
    npa: 'Negative percent agreement (%)',
    lod: 'Limit of detection',
    lob: 'Limit of blank',
    loq: 'Limit of quantitation',
    precision_cv: 'Precision (CV%)',
    predicate_knumber: 'Predicate 510(k) number',
    de_novo_number: 'De Novo number',
    pma_number: 'PMA number',
    rpn: 'Risk priority number',
  };
  return map[label] ?? label;
}

function computeVerdict(divergences: ConsistencyDivergence[]): ConsistencyReport['verdict'] {
  if (divergences.length === 0) return 'clean';
  const anyCritical = divergences.some(d => d.severity === 'critical');
  const anyHigh = divergences.some(d => d.severity === 'high');
  if (anyCritical) return 'blocker';
  if (anyHigh) return 'needs_review';
  return 'minor_issues';
}

// ─────────────────────────────────────────────────────────────────────────────
// WITHIN-DOCUMENT NUMERICAL INTEGRITY
//
// Regulatory prose and its accompanying tables must report the same numbers.
// "N=648" in the narrative and "N=641" in Table 14.1 is a defect a reviewer
// will query, as is a p-value stated in text that differs from the value in
// the same table. This check surfaces CANDIDATES — same labelled quantity stated with
// multiple distinct values within the same draft — for Claude or the author
// to adjudicate. Some multi-arm / multi-timepoint variation is legitimate
// ("N=648 at Week 26, N=612 at Week 52"), so the checker deliberately does
// NOT self-resolve; it reports the candidates and lets the author justify
// or fix.
// ─────────────────────────────────────────────────────────────────────────────

export interface InternalNumericalCandidate {
  readonly label: string;
  readonly humanLabel: string;
  readonly severity: DivergenceSeverity;
  readonly distinctValues: readonly string[];
  readonly occurrences: ReadonlyArray<{
    readonly value: string;
    readonly upper?: string;
    readonly unit?: string;
    readonly context: string;
  }>;
}

export interface NumericalIntegrityReport {
  readonly contentLength: number;
  readonly factsExtracted: number;
  /**
   * Distinct labels stated at least twice: the only figures this check can
   * compare. 0 means nothing was compared, whatever the verdict says — a text
   * that states every labelled figure once reads 'clean' (row 74, S5).
   */
  readonly labelsCompared: number;
  readonly candidateCount: number;
  readonly candidates: readonly InternalNumericalCandidate[];
  /**
   * Candidates only. A 'likely inconsistency' is the canonical in-document
   * rule's call (ana/terminology-consistency checkValueConsistency), which
   * check_numerical_integrity applies on top of this report.
   */
  readonly verdict: 'clean' | 'review_candidates';
  readonly generatedAt: string;
}

/**
 * Scan a single drafted artifact for the same labelled quantity stated with
 * multiple distinct values. Returns candidates, not divergences — a multi-arm
 * study legitimately reports different N per arm, so the checker refuses to
 * pretend it knows which case a given document is in.
 *
 * Deterministic, sync, no external calls — safe to run on every draft.
 */
export function checkInternalNumericalIntegrity(content: string): NumericalIntegrityReport {
  const now = new Date().toISOString();
  const facts = extractNumericalFacts(content);

  if (facts.length === 0) {
    return {
      contentLength: content?.length ?? 0,
      factsExtracted: 0,
      labelsCompared: 0,
      candidateCount: 0,
      candidates: [],
      verdict: 'clean',
      generatedAt: now,
    };
  }

  // Group by label; canonicalize value (strip commas, normalize negative sign)
  // so "1,000" and "1000" don't register as different. A two-number fact is
  // keyed on both bounds, so "ages 18 to 65" and "ages 18 to 75" differ.
  const byLabel = groupByLabel(facts);

  const candidates: InternalNumericalCandidate[] = [];
  let labelsCompared = 0;
  for (const [label, group] of byLabel) {
    if (group.length < 2) continue;
    labelsCompared++;
    const distinctValuesSet = new Set<string>();
    for (const f of group) {
      const lower = f.value.replace(/,/g, '').trim();
      distinctValuesSet.add(f.upper !== undefined ? `${lower} to ${f.upper.trim()}` : lower);
    }
    if (distinctValuesSet.size < 2) continue;

    // Suppress if the values cluster within the tolerance bucket — avoids
    // noise for things like "approximately 648" vs "648" that are effectively
    // the same reading. A two-number fact must cluster on both bounds.
    if (clustersWithinTolerance(group.map(f => f.value)) &&
        (group.every(f => f.upper === undefined) || clustersWithinTolerance(group.map(f => f.upper ?? '')))) {
      continue;
    }

    candidates.push({
      label,
      humanLabel: humanLabel(label),
      severity: severityFor(label),
      distinctValues: Array.from(distinctValuesSet),
      occurrences: group.map(f => ({
        value: f.value,
        upper: f.upper,
        unit: f.unit,
        context: f.context,
      })),
    });
  }

  const verdict = computeIntegrityVerdict(candidates);

  return {
    contentLength: content?.length ?? 0,
    factsExtracted: facts.length,
    labelsCompared,
    candidateCount: candidates.length,
    candidates,
    verdict,
    generatedAt: now,
  };
}

/** True when every value parses and they all sit within the 0.5% tolerance bucket. */
function clustersWithinTolerance(values: readonly string[]): boolean {
  const nums = values.map(v => parseFloat(v.replace(/,/g, '').trim()));
  if (nums.length < 2 || !nums.every(n => Number.isFinite(n))) return false;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  // Equal values (including all zero) cluster; otherwise relative to the
  // larger magnitude, so a zero upper end does not hide a negative lower one.
  if (max === min) return true;
  return (max - min) / Math.max(Math.abs(max), Math.abs(min)) < 0.005;
}

function computeIntegrityVerdict(
  candidates: InternalNumericalCandidate[],
): NumericalIntegrityReport['verdict'] {
  // No 'likely_inconsistency' from a severity label: two arms, two cohorts and
  // two analysis sets legitimately state a critical-label quantity twice
  // ("Drug X n=305; placebo n=303"). That call belongs to the canonical
  // in-document rule, checkValueConsistency, applied by the tool handler.
  return candidates.length === 0 ? 'clean' : 'review_candidates';
}
