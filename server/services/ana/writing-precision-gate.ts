/**
 * Writing Precision Gate — the deterministic critique that turns AnA's existing
 * medical-writing checkers into one gate + a prioritized revision brief.
 *
 * The checkers already existed (grounding, readability-vs-audience,
 * abbreviation definition, standards section-coverage) but were never composed
 * into a single pass or wired into a draft→critique→revise cycle. This module
 * is that composition: run every checker over a draft, fold the results into one
 * 0–100 precision score with a pass/revise verdict, and emit an ordered list of
 * concrete findings a model must fix — the machine-checkable half of "greatest-
 * in-class precision writing." The rewrite itself is model-driven; this gate is
 * what decides whether a rewrite is needed and what specifically to fix.
 *
 * Pure and total (no DB, no I/O). Reused by the critique_draft AnA tool and,
 * later, by the drafting service's revise loop.
 *
 * @module server/services/ana/writing-precision-gate
 */

import { assessGrounding } from './grounding-core';
import { assessReadability, buildAbbreviationList, type ReadabilityAudience } from './medical-writing-qc';
import { reviewMedicalWriting } from './medical-writing-review';
import { checkTerminologyConsistency } from './terminology-consistency';
import { checkOverclaims } from './claim-precision';

export type PrecisionCategory =
  | 'grounding'
  | 'consistency'
  | 'readability'
  | 'abbreviations'
  | 'structure'
  | 'claims';

export type PrecisionSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface PrecisionFinding {
  category: PrecisionCategory;
  severity: PrecisionSeverity;
  /** What to fix, phrased as an instruction to the writer. */
  message: string;
  /** Concrete offending snippets/values, for the writer to locate. */
  evidence: string[];
}

export interface PrecisionReport {
  /** 0–100; 100 = every deterministic check passed. */
  score: number;
  /** 'pass' when no critical/high findings remain; else 'revise'. */
  verdict: 'pass' | 'revise';
  findings: PrecisionFinding[];
  metrics: {
    groundingScore: number;
    ungroundedClaims: number;
    fleschKincaidGrade: number;
    targetMaxGrade: number;
    meetsReadabilityTarget: boolean;
    undefinedAbbreviations: number;
    valueInconsistencies: number;
    abbreviationConflicts: number;
    missingSections: number;
  };
}

const SEVERITY_WEIGHT: Record<PrecisionSeverity, number> = {
  critical: 30,
  high: 18,
  medium: 8,
  low: 3,
};

const SEVERITY_ORDER: PrecisionSeverity[] = ['critical', 'high', 'medium', 'low'];

export interface CritiqueInput {
  text: string;
  /** Tunes the readability target; defaults to 'regulator'. */
  audience?: ReadabilityAudience;
  /** When set, section coverage is checked against this document type's standard. */
  documentType?: string;
}

function groundingDimension(text: string, findings: PrecisionFinding[]) {
  const grounding = assessGrounding(text);
  if (grounding.ungroundedClaims.length > 0) {
    findings.push({
      category: 'grounding',
      severity: 'critical', // an unsupported number is the cardinal reviewer finding
      message: `Cite a source for ${grounding.ungroundedClaims.length} quantitative claim(s) that currently have no nearby citation.`,
      evidence: grounding.ungroundedClaims.slice(0, 5).map(c => c.sentence),
    });
  }
  return grounding;
}

function consistencyDimension(text: string, findings: PrecisionFinding[]) {
  const consistency = checkTerminologyConsistency(text);
  for (const f of consistency.findings) {
    const message =
      f.kind === 'value_inconsistency'
        ? `Reconcile "${f.label}" — it is stated as ${f.variants.join(' and ')} in the same document. Use one value.`
        : f.kind === 'abbreviation_conflict'
          ? `Use one expansion for "${f.label}" — it is expanded as ${f.variants.map(v => `"${v}"`).join(' and ')}.`
          : `Use one term consistently for "${f.label}" — the document mixes ${f.variants.map(v => `"${v}"`).join(' and ')}.`;
    findings.push({
      category: 'consistency',
      severity: f.severity === 'high' ? 'high' : 'medium',
      message,
      evidence: f.evidence.slice(0, 4),
    });
  }
  return consistency;
}

function readabilityDimension(text: string, audience: ReadabilityAudience, findings: PrecisionFinding[]) {
  const readability = assessReadability(text, audience);
  if (text.trim() && !readability.meetsTarget) {
    findings.push({
      category: 'readability',
      severity: audience === 'patient' ? 'high' : 'medium',
      message: `Adjust reading level for a ${audience} audience: grade ${readability.fleschKincaidGrade.toFixed(1)} exceeds the target of ${readability.targetMaxGrade}. ${readability.suggestions.join(' ')}`.trim(),
      evidence: [],
    });
  }
  return readability;
}

function abbreviationDimension(text: string, findings: PrecisionFinding[]) {
  const abbr = buildAbbreviationList(text);
  if (abbr.undefinedAbbreviations.length > 0) {
    findings.push({
      category: 'abbreviations',
      severity: 'medium',
      message: `Define at first use: ${abbr.undefinedAbbreviations.join(', ')}.`,
      evidence: abbr.undefinedAbbreviations,
    });
  }
  return abbr;
}

function claimsDimension(text: string, findings: PrecisionFinding[]) {
  const overclaims = checkOverclaims(text);
  for (const f of overclaims.findings) {
    findings.push({
      category: 'claims',
      severity: f.severity,
      message: `Over-claim (${f.kind}): "${f.phrase}". ${f.suggestion}`,
      evidence: [f.sentence],
    });
  }
  return overclaims;
}

function structureDimension(text: string, documentType: string | undefined, findings: PrecisionFinding[]): number {
  if (!documentType) return 0;
  const review = reviewMedicalWriting(documentType, text);
  const missing = review.missingSections ?? [];
  if (missing.length > 0) {
    findings.push({
      category: 'structure',
      severity: 'high',
      message: `Add the missing required section(s) for a ${review.label ?? documentType}: ${missing.join(', ')}.`,
      evidence: missing,
    });
  }
  return missing.length;
}

/**
 * Run every deterministic writing checker over a draft and fold the results into
 * one precision report. The score starts at 100 and each finding subtracts its
 * severity weight (floored at 0); any critical/high finding forces a 'revise'.
 */
export function critiqueDraft(input: CritiqueInput): PrecisionReport {
  const text = input.text ?? '';
  const audience: ReadabilityAudience = input.audience ?? 'regulator';
  const findings: PrecisionFinding[] = [];

  const grounding = groundingDimension(text, findings);
  const consistency = consistencyDimension(text, findings);
  const readability = readabilityDimension(text, audience, findings);
  const abbr = abbreviationDimension(text, findings);
  claimsDimension(text, findings);
  const missingSections = structureDimension(text, input.documentType, findings);

  findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  const penalty = findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
  const score = Math.max(0, 100 - penalty);
  const verdict: 'pass' | 'revise' =
    findings.some(f => f.severity === 'critical' || f.severity === 'high') ? 'revise' : 'pass';

  return {
    score,
    verdict,
    findings,
    metrics: {
      groundingScore: grounding.groundingScore,
      ungroundedClaims: grounding.ungroundedClaims.length,
      fleschKincaidGrade: Math.round(readability.fleschKincaidGrade * 10) / 10,
      targetMaxGrade: readability.targetMaxGrade,
      meetsReadabilityTarget: readability.meetsTarget,
      undefinedAbbreviations: abbr.undefinedAbbreviations.length,
      valueInconsistencies: consistency.valueInconsistencies,
      abbreviationConflicts: consistency.abbreviationConflicts,
      missingSections,
    },
  };
}

/**
 * Verify that a revision improved on the original: the score rose and no
 * critical/high finding that was present before remains. Deterministic
 * loop-closer for the draft→critique→revise cycle.
 */
export interface RevisionVerdict {
  improved: boolean;
  passesNow: boolean;
  beforeScore: number;
  afterScore: number;
  resolvedFindings: number;
  remainingCriticalHigh: number;
  regressions: PrecisionFinding[];
}

export function verifyRevision(
  before: CritiqueInput,
  after: CritiqueInput
): RevisionVerdict {
  const b = critiqueDraft(before);
  const a = critiqueDraft(after);
  const key = (f: PrecisionFinding) => `${f.category}:${f.message}`;
  const beforeKeys = new Set(b.findings.map(key));
  const afterKeys = new Set(a.findings.map(key));
  const resolved = [...beforeKeys].filter(k => !afterKeys.has(k)).length;
  const regressions = a.findings.filter(f => !beforeKeys.has(key(f)));
  const remainingCriticalHigh = a.findings.filter(
    f => f.severity === 'critical' || f.severity === 'high'
  ).length;
  return {
    improved: a.score > b.score && remainingCriticalHigh <= b.findings.filter(f => f.severity === 'critical' || f.severity === 'high').length,
    passesNow: a.verdict === 'pass',
    beforeScore: b.score,
    afterScore: a.score,
    resolvedFindings: resolved,
    remainingCriticalHigh,
    regressions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Document-level critique (per-section + cross-section coherence)
// ─────────────────────────────────────────────────────────────────────────────

export interface DocumentSectionInput {
  /** A heading or id so findings can be attributed. */
  title: string;
  text: string;
}

export interface SectionCritique {
  title: string;
  score: number;
  verdict: 'pass' | 'revise';
  findingCount: number;
  report: PrecisionReport;
}

export interface DocumentCritique {
  /** Lowest section score minus any cross-section penalty, floored at 0. */
  documentScore: number;
  verdict: 'pass' | 'revise';
  sections: SectionCritique[];
  /** A value/term stated inconsistently ACROSS sections (not caught per-section). */
  crossSectionFindings: PrecisionFinding[];
}

/**
 * Critique a whole document: run the gate on each section for located findings,
 * AND run the consistency checker over the full concatenation so a value stated
 * one way in §1 and another in §3 — invisible to any single-section pass — is
 * caught. This is the cross-section coherence enforcement long documents lacked.
 */
export function critiqueDocument(
  sections: DocumentSectionInput[],
  opts: { audience?: ReadabilityAudience; documentType?: string } = {}
): DocumentCritique {
  const sectionCritiques: SectionCritique[] = sections.map(s => {
    const report = critiqueDraft({ text: s.text, audience: opts.audience });
    return {
      title: s.title,
      score: report.score,
      verdict: report.verdict,
      findingCount: report.findings.length,
      report,
    };
  });

  // Cross-section consistency: run over the concatenation, then keep only the
  // findings that arise BETWEEN sections (i.e. no single section already has
  // that inconsistency on its own).
  const perSectionConsistencyKeys = new Set<string>();
  for (const s of sections) {
    for (const f of critiqueDraft({ text: s.text }).findings) {
      if (f.category === 'consistency') perSectionConsistencyKeys.add(f.message);
    }
  }
  const whole = critiqueDraft({ text: sections.map(s => s.text).join('\n\n'), documentType: opts.documentType });
  const crossSectionFindings = whole.findings.filter(
    f => f.category === 'consistency' && !perSectionConsistencyKeys.has(f.message)
  );

  const worstSection = sectionCritiques.reduce((min, s) => Math.min(min, s.score), 100);
  const crossPenalty = crossSectionFindings.reduce(
    (sum, f) => sum + (f.severity === 'high' ? 18 : 8),
    0
  );
  const documentScore = Math.max(0, worstSection - crossPenalty);
  const verdict: 'pass' | 'revise' =
    documentScore < 100 &&
    (sectionCritiques.some(s => s.verdict === 'revise') || crossSectionFindings.length > 0)
      ? 'revise'
      : 'pass';

  return { documentScore, verdict, sections: sectionCritiques, crossSectionFindings };
}

/**
 * Render the report as a compact, ordered revision brief — the exact
 * instructions to feed back to the model for a rewrite. Empty string when the
 * draft passes (nothing to fix).
 */
export function buildRevisionBrief(report: PrecisionReport): string {
  if (report.findings.length === 0) return '';
  const lines = report.findings.map((f, i) => {
    const ev = f.evidence.length ? ` (e.g. ${f.evidence.slice(0, 2).map(e => `“${e}”`).join('; ')})` : '';
    return `${i + 1}. [${f.severity}/${f.category}] ${f.message}${ev}`;
  });
  return [
    `Precision score ${report.score}/100 — verdict: ${report.verdict}.`,
    'Fix the following, most severe first, without changing any value that is already correct and cited:',
    ...lines,
  ].join('\n');
}
