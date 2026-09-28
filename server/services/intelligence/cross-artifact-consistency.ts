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
 * 2026-09-28 (row 74, track H): nothing compared is no longer 'clean'. The
 * early returns (no project, a draft under 100 characters, no labelled figures)
 * and a read that leaves nothing to compare (no other documents, or no figure
 * shared under the same label) report verdict 'not_assessed' with
 * `notAssessedReason`. 'clean' needs at least one labelled figure compared
 * (`figuresCompared`). The verdict and its copy live in consistency-verdict.ts;
 * the vocabulary, with DivergenceSeverity, in shared/ana/dossier-consistency.ts.
 * A project document whose text is the draft's own (the draft, saved, found
 * because no exclude_artifact_id was given) is set aside
 * (`draftCopiesSetAside`): comparing the draft with itself agrees by
 * construction, and used to read as 'clean'.
 *
 * @module server/services/intelligence/cross-artifact-consistency
 */

import { db } from '../../db.js';
import { eq, and, ne } from 'drizzle-orm';
import { concept2cureArtifacts } from '../../../shared/schema.js';
import { createScopedLogger } from '../../utils/logger';
import {
  DOSSIER_CHECK_MIN_DRAFT_LENGTH,
  type DivergenceSeverity,
  type DossierConsistencyVerdict,
  type DossierNotAssessedReason,
} from '../../../shared/ana/dossier-consistency.js';
import { verdictFor } from './consistency-verdict.js';

const logger = createScopedLogger('cross-artifact-consistency');

export type { DivergenceSeverity };

export interface NumericalFact {
  /** The label or key this number is attached to (e.g. "sample size", "LSM difference"). */
  readonly label: string;
  /** The raw numeric value as it appears in text. */
  readonly value: string;
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
  /** Other project documents read and compared with the draft. Saved copies of the draft are not counted. */
  readonly artifactsCompared: number;
  /** Project documents whose text is the draft's own, set aside rather than compared. */
  readonly draftCopiesSetAside: number;
  readonly draftFactsExtracted: number;
  /**
   * Labelled-figure comparisons made: one draft figure against the same label
   * in one other document. 0 means no figure was compared, whatever was read.
   */
  readonly figuresCompared: number;
  /** Draft cross-references resolved, or flagged, against the project's documents. */
  readonly crossReferencesChecked: number;
  readonly divergences: readonly ConsistencyDivergence[];
  /** 'not_assessed' when nothing was compared: see `notAssessedReason`, or `unavailable`. */
  readonly verdict: DossierConsistencyVerdict;
  /** Why nothing was compared, when the check could tell. */
  readonly notAssessedReason?: DossierNotAssessedReason;
  readonly generatedAt: string;
  /**
   * Set when the project's artifacts could not be read, so nothing was
   * compared. That is an error, not an assessment: the verdict is
   * 'not_assessed' and must not be shown as a result.
   */
  readonly unavailable?: 'artifacts_unreadable';
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
  { label: 'confidence_interval', pattern: /\b(?:95|99)\s*%?\s*CI[:\s]*[-−]?([0-9.]+)\s*(?:to|,|-|–|—)\s*[-−]?([0-9.]+)/gi },
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

export function extractNumericalFacts(text: string): NumericalFact[] {
  if (!text || text.length < 20) return [];
  const facts: NumericalFact[] = [];
  const seen = new Set<string>();

  for (const { label, pattern } of LABELLED_NUMERIC_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const value = match[1];
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
        unit: match[2] || undefined,
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

function valuesMatch(a: string, b: string): boolean {
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

interface DossierCheckParams {
  projectId: number;
  organizationId: number;
  draftContent: string;
  draftCtdSection?: string;
  /** Skip an existing artifact id when re-checking a draft of that artifact. */
  excludeArtifactId?: number;
  /** Max related artifacts to pull for comparison. Default 25. */
  maxArtifacts?: number;
}

interface RelatedArtifact {
  id: number;
  artifactId: string;
  title: string;
  content: string;
  ctdSection: string | null;
  status: string;
}

type ReportScope = Pick<ConsistencyReport, 'projectId' | 'organizationId' | 'draftCtdSection'>;

/** A report that compared nothing. Its verdict is 'not_assessed', never 'clean'. */
function nothingCompared(scope: ReportScope, draftFactsExtracted: number): ConsistencyReport {
  return {
    ...scope,
    artifactsCompared: 0,
    draftCopiesSetAside: 0,
    draftFactsExtracted,
    figuresCompared: 0,
    crossReferencesChecked: 0,
    divergences: [],
    verdict: 'not_assessed',
    generatedAt: new Date().toISOString(),
  };
}

async function loadRelatedArtifacts(params: DossierCheckParams): Promise<RelatedArtifact[]> {
  const { projectId, organizationId, excludeArtifactId } = params;
  const sameProject = and(
    eq(concept2cureArtifacts.projectId, projectId),
    eq(concept2cureArtifacts.organizationId, organizationId),
  );
  return db
    .select({
      id: concept2cureArtifacts.id,
      artifactId: concept2cureArtifacts.artifactId,
      title: concept2cureArtifacts.title,
      content: concept2cureArtifacts.content,
      ctdSection: concept2cureArtifacts.ctdSection,
      status: concept2cureArtifacts.status,
    })
    .from(concept2cureArtifacts)
    .where(excludeArtifactId ? and(sameProject, ne(concept2cureArtifacts.id, excludeArtifactId)) : sameProject)
    .limit(params.maxArtifacts ?? 25);
}

/** The first occurrence of each label. */
function firstByLabel(facts: readonly NumericalFact[]): Map<string, NumericalFact> {
  const byLabel = new Map<string, NumericalFact>();
  for (const f of facts) {
    if (!byLabel.has(f.label)) byLabel.set(f.label, f);
  }
  return byLabel;
}

const withUnit = (f: NumericalFact): string => `${f.value}${f.unit ? ' ' + f.unit : ''}`;

/**
 * 1. Numeric divergences — same labelled quantity, different values.
 *
 * Compares the FIRST occurrence of each label in both documents. This
 * intentionally avoids the n^2 explosion of comparing every fact against every
 * other fact, which would produce a lot of within-document noise (e.g. a
 * document naming two sample sizes for two different study arms). `compared`
 * counts every label the draft shares with a document, agreeing or not.
 */
function compareFigures(
  draftFacts: readonly NumericalFact[],
  relatedArtifacts: readonly RelatedArtifact[],
): { divergences: ConsistencyDivergence[]; compared: number } {
  const divergences: ConsistencyDivergence[] = [];
  let compared = 0;
  const draftByLabel = firstByLabel(draftFacts);
  for (const existing of relatedArtifacts) {
    const existingByLabel = firstByLabel(extractNumericalFacts(existing.content));
    for (const [label, draftFact] of draftByLabel) {
      const existingFact = existingByLabel.get(label);
      if (!existingFact) continue;
      compared += 1;
      if (valuesMatch(draftFact.value, existingFact.value)) continue;

      divergences.push({
        kind: 'numeric_divergence',
        severity: severityFor(label),
        description: `${humanLabel(label)} differs: draft says ${withUnit(draftFact)}, existing artifact "${existing.title}" says ${withUnit(existingFact)}.`,
        draftValue: draftFact.value,
        existingValue: existingFact.value,
        existingArtifactId: existing.artifactId,
        existingArtifactTitle: existing.title,
        existingCtdSection: existing.ctdSection,
        draftContext: draftFact.context,
        existingContext: existingFact.context,
      });
    }
  }
  return { divergences, compared };
}

/** Whether a document filed under one of `sections` covers section `ref` (prefix match either way). */
function sectionCovered(sections: readonly string[], ref: string): boolean {
  // e.g. ref "3.2.S" is covered by artifact section "3.2.S.1"
  return sections.some(s => s === ref || s.startsWith(`${ref}.`) || ref.startsWith(`${s}.`));
}

const sectionsOf = (docs: readonly RelatedArtifact[]): string[] =>
  docs.map(a => a.ctdSection).filter((s): s is string => !!s);

/**
 * 2. Missing cross-references — the draft points to a Module X.Y that no
 * artifact in the project covers. A reference to the draft's own section, or
 * one that only a saved copy of the draft covers, is the draft pointing at
 * itself: not flagged, and not counted as checked unless another document
 * covers it.
 */
function checkCrossReferences(
  draftContent: string,
  draft: { readonly section: string | undefined; readonly copies: readonly RelatedArtifact[] },
  relatedArtifacts: readonly RelatedArtifact[],
): { divergences: ConsistencyDivergence[]; checked: number } {
  const divergences: ConsistencyDivergence[] = [];
  let checked = 0;
  const otherSections = sectionsOf(relatedArtifacts);
  const draftSections = sectionsOf(draft.copies);
  for (const ref of extractSectionReferences(draftContent)) {
    const covered = sectionCovered(otherSections, ref);
    if (!covered && (ref === draft.section || sectionCovered(draftSections, ref))) continue;
    checked += 1;
    if (covered) continue;
    divergences.push({
      kind: 'missing_cross_reference',
      severity: 'medium',
      description: `Draft references Module/Section ${ref} but no artifact in this project currently covers it.`,
      draftValue: ref,
    });
  }
  return { divergences, checked };
}

/** The early returns: nothing is read, nothing is compared. */
function reasonNotToRead(projectId: number, draftContent: string | undefined): DossierNotAssessedReason | null {
  if (!Number.isInteger(projectId) || projectId <= 0) return 'no_project';
  if (!draftContent || draftContent.length < DOSSIER_CHECK_MIN_DRAFT_LENGTH) return 'draft_too_short';
  return null;
}

/** Whitespace-insensitive text, so a saved copy that was re-flowed still reads as the draft. */
const normalisedText = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * Project documents whose text is the draft's own: the draft, saved, and found
 * because the caller gave no excludeArtifactId. Comparing the draft with itself
 * agrees by construction, so such a copy is set aside, not compared. A saved
 * copy in another format, or an earlier version, is not detected here.
 */
function setAsideDraftCopies(
  rows: readonly RelatedArtifact[],
  draftContent: string,
): { others: RelatedArtifact[]; draftCopies: RelatedArtifact[] } {
  const draft = normalisedText(draftContent);
  const others: RelatedArtifact[] = [];
  const draftCopies: RelatedArtifact[] = [];
  for (const row of rows) {
    (typeof row.content === 'string' && normalisedText(row.content) === draft ? draftCopies : others).push(row);
  }
  return { others, draftCopies };
}

export async function checkDossierConsistency(params: DossierCheckParams): Promise<ConsistencyReport> {
  const { projectId, organizationId, draftContent, draftCtdSection } = params;
  const scope: ReportScope = { projectId, organizationId, draftCtdSection };

  const early = reasonNotToRead(projectId, draftContent);
  if (early) return { ...nothingCompared(scope, 0), notAssessedReason: early };

  const draftFacts = extractNumericalFacts(draftContent);
  if (draftFacts.length === 0 && !draftCtdSection) {
    return { ...nothingCompared(scope, 0), notAssessedReason: 'no_figures_in_draft' };
  }

  let rows: RelatedArtifact[];
  try {
    rows = await loadRelatedArtifacts(params);
  } catch (err) {
    logger.warn(
      `[cross-artifact] Failed to load related artifacts: ${err instanceof Error ? err.message : 'unknown'}`,
    );
    // An error, not an assessment: nothing was compared (row 74, S3).
    return { ...nothingCompared(scope, draftFacts.length), unavailable: 'artifacts_unreadable' };
  }

  const { others, draftCopies } = setAsideDraftCopies(rows, draftContent);
  const figures = compareFigures(draftFacts, others);
  const references = checkCrossReferences(draftContent, { section: draftCtdSection, copies: draftCopies }, others);
  const divergences = [...figures.divergences, ...references.divergences];

  return {
    ...scope,
    artifactsCompared: others.length,
    draftCopiesSetAside: draftCopies.length,
    draftFactsExtracted: draftFacts.length,
    figuresCompared: figures.compared,
    crossReferencesChecked: references.checked,
    divergences,
    ...verdictFor({
      divergences,
      relatedArtifacts: others.length,
      draftCopies: draftCopies.length,
      draftFacts: draftFacts.length,
      figuresCompared: figures.compared,
    }),
    generatedAt: new Date().toISOString(),
  };
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

// ─────────────────────────────────────────────────────────────────────────────
// WITHIN-DOCUMENT NUMERICAL INTEGRITY
//
// Regulatory prose and its accompanying tables must report the same numbers.
// "N=648" in the narrative and "N=641" in Table 14.1 is a classic RTF trigger,
// as is a p-value stated in text that differs from the value in the same
// table. This check surfaces CANDIDATES — same labelled quantity stated with
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
    readonly unit?: string;
    readonly context: string;
  }>;
}

export interface NumericalIntegrityReport {
  readonly contentLength: number;
  readonly factsExtracted: number;
  readonly candidateCount: number;
  readonly candidates: readonly InternalNumericalCandidate[];
  readonly verdict: 'clean' | 'review_candidates' | 'likely_inconsistency';
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
      candidateCount: 0,
      candidates: [],
      verdict: 'clean',
      generatedAt: now,
    };
  }

  // Group by label; canonicalize value (strip commas, normalize negative sign)
  // so "1,000" and "1000" don't register as different.
  const byLabel = new Map<string, NumericalFact[]>();
  for (const fact of facts) {
    const list = byLabel.get(fact.label) ?? [];
    list.push(fact);
    byLabel.set(fact.label, list);
  }

  const candidates: InternalNumericalCandidate[] = [];
  for (const [label, group] of byLabel) {
    if (group.length < 2) continue;
    const distinctValuesSet = new Set<string>();
    for (const f of group) {
      const normalized = f.value.replace(/,/g, '').trim();
      distinctValuesSet.add(normalized);
    }
    if (distinctValuesSet.size < 2) continue;

    // Suppress if the values cluster within the tolerance bucket — avoids
    // noise for things like "approximately 648" vs "648" that are effectively
    // the same reading.
    const numericDistincts = Array.from(distinctValuesSet)
      .map(v => parseFloat(v))
      .filter(n => Number.isFinite(n));
    if (numericDistincts.length === distinctValuesSet.size && numericDistincts.length >= 2) {
      const max = Math.max(...numericDistincts);
      const min = Math.min(...numericDistincts);
      const spread = max === 0 ? 0 : (max - min) / Math.max(Math.abs(max), Math.abs(min));
      if (spread < 0.005) continue;
    }

    candidates.push({
      label,
      humanLabel: humanLabel(label),
      severity: severityFor(label),
      distinctValues: Array.from(distinctValuesSet),
      occurrences: group.map(f => ({
        value: f.value,
        unit: f.unit,
        context: f.context,
      })),
    });
  }

  const verdict = computeIntegrityVerdict(candidates);

  return {
    contentLength: content?.length ?? 0,
    factsExtracted: facts.length,
    candidateCount: candidates.length,
    candidates,
    verdict,
    generatedAt: now,
  };
}

function computeIntegrityVerdict(
  candidates: InternalNumericalCandidate[],
): NumericalIntegrityReport['verdict'] {
  if (candidates.length === 0) return 'clean';
  // Critical-severity labels with multiple distinct values are very likely
  // real inconsistencies — dose, NOAEL, MRSD, sample size rarely have a
  // legitimate "different value in different places" interpretation within
  // a single drafted section.
  if (candidates.some(c => c.severity === 'critical')) return 'likely_inconsistency';
  return 'review_candidates';
}
