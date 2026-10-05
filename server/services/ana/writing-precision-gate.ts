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
 * Pure and total (no DB, no I/O). Reused by the critique_draft, verify_revision
 * and critique_document AnA tools.
 *
 * Ported from abandoned PR #1003 (dc25698fb, 41fe41860) onto v2. The PR's
 * claim-precision.ts is NOT ported: it was a second over-claim lexicon beside
 * promotional-screening.ts (superiority, absolutes, unqualified safety, causal
 * overreach — the same four categories), so the claims dimension composes the
 * existing screener instead of duplicating it.
 *
 * Claims register: the gate defaults to the screener's 'submission' register,
 * which exempts named regulatory terms of art (the ICH E3 §5.3 consent
 * statement, the Breakthrough Therapy designation, test-of-cure endpoints) and
 * additionally composes governance.detectUnsupportedClaims, so a predicted
 * approval or "the study was successful" is a high regulatory_outcome finding.
 *
 * @module server/services/ana/writing-precision-gate
 */

import { assessGrounding } from './grounding-core';
import { assessReadability, buildAbbreviationList, type ReadabilityAudience } from './medical-writing-qc';
import { reviewMedicalWriting } from './medical-writing-review';
import { checkTerminologyConsistency } from './terminology-consistency';
import {
  screenPromotionalLanguage,
  type ClaimCategory,
  type ClaimRegister,
  type ExemptedTerm,
} from './promotional-screening';
import { detectUnsupportedClaims } from '../clinical-regulatory-evidence/governance';

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
  /** Claims register applied ('submission' unless the caller chose 'promotional'). */
  register: ClaimRegister;
  /** Lexicon hits the submission register dropped as terms of art, each with its basis. */
  claimExemptions: ExemptedTerm[];
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
  /** Claims register; defaults to 'submission' (regulatory prose). */
  register?: ClaimRegister;
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
    // An 'arithmetic' finding's variants are [stated, recomputed] (terminology-consistency.ts).
    const message =
      f.kind === 'arithmetic'
        ? f.label === 'arm_sum'
          ? `Reconcile the arm counts with the total they follow — they sum to ${f.variants[1]}, but the text states a total of ${f.variants[0]}. Correct the total or the arm counts.`
          : `Recompute the percentage — ${f.variants[0]} is stated, but its own n/N gives ${f.variants[1]}. Correct the percentage or the counts.`
        : f.kind === 'value_inconsistency'
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

const REGULATORY_OUTCOME: ClaimCategory = 'regulatory_outcome';

/** Protocol-governance approvers (deny-list). Anything else after "by", a date included, is not one. */
const GOVERNANCE_BODY =
  '(?:(?:the|each|a|an|every|all)\\s+)?(?:(?:local|site|participating|central|independent|study|trial)\\s+){0,2}' +
  '(?:sponsor|IRBs?|IECs?|ethics committees?|institutional review boards?|' +
  '(?:Safety Review|(?:Independent )?Data Monitoring|Data (?:and )?Safety Monitoring|Steering|Dose Escalation)\\s+(?:Committee|Board)s?|' +
  'SRC|DSMBs?|I?DMCs?|Medical Monitors?|(?:principal\\s+)?investigators?)\\b';
const BODY_AHEAD = new RegExp(`^${GOVERNANCE_BODY}`, 'i');
const BODY_BEHIND = new RegExp(`(?:^|[\\s,(])${GOVERNANCE_BODY}\\s*$`, 'i');
/** A coordinator after an approver; another agent follows when the next word is "by", a determiner or capitalised. */
const COORDINATED_AGENT_AHEAD = /^\s*(?:,\s*(?:(?:and|or)\s+)?|\s(?:and\/or|and|or)\s+|\/\s*)(?=by\s|(?:the|a|an|each)\s|[A-Z])(?:by\s+)?/;
/** Before a subject: "and"/"or", or a comma after a capitalised name ("FDA, the IRB and"); "After review," is not one. */
const COORDINATOR_BEHIND = /(?:(?<=\b[A-Z][\w-]*)\s*,|\b(?:and\/or|and|or)|\/)\s*$/;

/** After the last body, a tail that may still name an agent: "'s date", "-requested", " (FDA)", ", then by FDA". */
const AGENT_IN_TAIL = /^(?:['’]s\b|-|\s*[([])|\bby\b/i;

/** "approved by the IRB (and the sponsor)": every named agent is a governance body. */
function namesOnlyGovernanceApprovers(after: string): boolean {
  let rest = after.replace(/^\s+by\s+/i, '');
  for (;;) {
    const body = BODY_AHEAD.exec(rest);
    if (!body) return false;
    rest = rest.slice(body[0].length);
    const more = COORDINATED_AGENT_AHEAD.exec(rest);
    if (!more) return !AGENT_IN_TAIL.test(rest.split(/[.;]/)[0]);
    rest = rest.slice(more[0].length);
  }
}

/** "The Medical Monitor (and the SRC) will approve": every coordinated subject is a governance body. */
function subjectIsOnlyGovernanceBodies(before: string): boolean {
  let rest = before;
  for (;;) {
    const body = BODY_BEHIND.exec(rest);
    if (!body) return false;
    rest = rest.slice(0, body.index);
    const more = COORDINATOR_BEHIND.exec(rest);
    if (!more) return true;
    rest = rest.slice(0, more.index);
  }
}

/**
 * governance's approval pattern also matches protocol governance ("will be
 * approved by the sponsor / the Safety Review Committee / each site IRB", "the
 * Medical Monitor will approve"). Those are operational steps, not predictions of
 * a regulatory decision. Fail closed: keep every approval match unless its only
 * approvers are named governance bodies. "by the end of 2027", "by MHLW" and "by
 * the Food and Drug Administration" are kept because they are not on the list.
 */
function predictsRegulatoryDecision(text: string, v: { match: string; index: number }): boolean {
  if (!/approv/i.test(v.match)) return true; // the other governance patterns are not approval verbs
  if (/\bbe\s+approved$/i.test(v.match)) {
    const after = text.slice(v.index + v.match.length);
    return !(/^\s+by\s/i.test(after) && namesOnlyGovernanceApprovers(after));
  }
  const clauseStart = Math.max(text.lastIndexOf('.', v.index), text.lastIndexOf(';', v.index)) + 1;
  return !subjectIsOnlyGovernanceBodies(text.slice(clauseStart, v.index));
}

function claimsDimension(text: string, register: ClaimRegister, findings: PrecisionFinding[]) {
  const screen = screenPromotionalLanguage(text, { register });
  for (const f of screen.flags) {
    findings.push({
      category: 'claims',
      severity: f.severity,
      message: `Over-claim (${f.category}): "${f.phrase}". ${f.suggestion}`,
      evidence: [f.context],
    });
  }
  if (register === 'submission') {
    for (const v of detectUnsupportedClaims(text)) {
      if (!predictsRegulatoryDecision(text, v)) continue;
      findings.push({
        category: 'claims',
        severity: 'high',
        message: `Unsupported claim (${REGULATORY_OUTCOME}): "${v.match}". ${v.reason} State the evidence and leave the regulatory decision to the agency.`,
        evidence: [text.slice(Math.max(0, v.index - 40), v.index + v.match.length + 40).trim()],
      });
    }
  }
  return screen;
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
  const register: ClaimRegister = input.register ?? 'submission';
  const findings: PrecisionFinding[] = [];

  const grounding = groundingDimension(text, findings);
  const consistency = consistencyDimension(text, findings);
  const readability = readabilityDimension(text, audience, findings);
  const abbr = abbreviationDimension(text, findings);
  const claims = claimsDimension(text, register, findings);
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
    register,
    claimExemptions: claims.exempted,
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
  /** Claims register both texts were judged in. */
  register: ClaimRegister;
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
    register: a.register,
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
  /**
   * A value/term stated inconsistently ACROSS sections (not caught per-section),
   * plus any required section missing from the document as a whole.
   */
  crossSectionFindings: PrecisionFinding[];
  /** Claims register applied to every section and the whole document. */
  register: ClaimRegister;
}

/**
 * Critique a whole document: run the gate on each section for located findings,
 * AND run the consistency checker over the full concatenation so a value stated
 * one way in §1 and another in §3 — invisible to any single-section pass — is
 * caught. This is the cross-section coherence enforcement long documents lacked.
 */
export function critiqueDocument(
  sections: DocumentSectionInput[],
  opts: { audience?: ReadabilityAudience; documentType?: string; register?: ClaimRegister } = {}
): DocumentCritique {
  const sectionCritiques: SectionCritique[] = sections.map(s => {
    const report = critiqueDraft({ text: s.text, audience: opts.audience, register: opts.register });
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
  // that inconsistency on its own). Structure is judged once, on the whole
  // document — a required section is missing from the document, not from each
  // section.
  const perSectionConsistencyKeys = new Set<string>();
  for (const s of sectionCritiques) {
    for (const f of s.report.findings) {
      if (f.category === 'consistency') perSectionConsistencyKeys.add(f.message);
    }
  }
  const whole = critiqueDraft({
    text: sections.map(s => s.text).join('\n\n'),
    audience: opts.audience,
    documentType: opts.documentType,
    register: opts.register,
  });
  const crossSectionFindings = whole.findings.filter(
    f =>
      (f.category === 'consistency' && !perSectionConsistencyKeys.has(f.message)) ||
      f.category === 'structure'
  );

  const worstSection = sectionCritiques.reduce((min, s) => Math.min(min, s.score), 100);
  const crossPenalty = crossSectionFindings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
  const documentScore = Math.max(0, worstSection - crossPenalty);
  const verdict: 'pass' | 'revise' =
    documentScore < 100 &&
    (sectionCritiques.some(s => s.verdict === 'revise') || crossSectionFindings.length > 0)
      ? 'revise'
      : 'pass';

  return { documentScore, verdict, sections: sectionCritiques, crossSectionFindings, register: whole.register };
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
