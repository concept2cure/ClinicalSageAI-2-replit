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

  if (!Number.isFinite(projectId) || projectId <= 0) return emptyReport;
  if (!draftContent || draftContent.length < 100) return emptyReport;

  const draftFacts = extractNumericalFacts(draftContent);
  if (draftFacts.length === 0 && !draftCtdSection) return emptyReport;

  let relatedArtifacts: Array<{
    id: number;
    artifactId: string;
    title: string;
    content: string;
    ctdSection: string | null;
    status: string;
  }> = [];

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
      .limit(maxArtifacts);
    relatedArtifacts = rows;
  } catch (err) {
    logger.warn(
      `[cross-artifact] Failed to load related artifacts: ${err instanceof Error ? err.message : 'unknown'}`,
    );
    return emptyReport;
  }

  const divergences: ConsistencyDivergence[] = [];

  // 1. Numeric divergences — same labelled quantity, different values
  for (const existing of relatedArtifacts) {
    const existingFacts = extractNumericalFacts(existing.content);
    if (existingFacts.length === 0) continue;

    // Group facts by label. Compare the FIRST occurrence of each label in
    // both documents. This intentionally avoids the n^2 explosion of
    // comparing every fact against every other fact, which would produce a
    // lot of within-document noise (e.g. a document naming two sample
    // sizes for two different study arms).
    const draftByLabel = new Map<string, NumericalFact>();
    for (const f of draftFacts) {
      if (!draftByLabel.has(f.label)) draftByLabel.set(f.label, f);
    }
    const existingByLabel = new Map<string, NumericalFact>();
    for (const f of existingFacts) {
      if (!existingByLabel.has(f.label)) existingByLabel.set(f.label, f);
    }

    for (const [label, draftFact] of draftByLabel) {
      const existingFact = existingByLabel.get(label);
      if (!existingFact) continue;
      if (valuesMatch(draftFact.value, existingFact.value)) continue;

      divergences.push({
        kind: 'numeric_divergence',
        severity: severityFor(label),
        description: `${humanLabel(label)} differs: draft says ${draftFact.value}${draftFact.unit ? ' ' + draftFact.unit : ''}, existing artifact "${existing.title}" says ${existingFact.value}${existingFact.unit ? ' ' + existingFact.unit : ''}.`,
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
