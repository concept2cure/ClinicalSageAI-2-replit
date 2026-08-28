/**
 * CRL/RTF pre-mortem → board-ready decision artifact (E14).
 *
 * `run_submission_premortem` already produces an honest readiness VERDICT (ranked
 * reviewer-trigger findings + a confidence-bearing risk level + precedent
 * citations). E14 lifts that verdict into a *board-ready decision artifact*: the
 * shape an executive committee signs off on before committing filing runway —
 *
 *   - an approval-probability ESTIMATE (never a guarantee), grounded in the
 *     observed approve/deny ratio of the cited precedent corpus, carrying its
 *     denominator and confidence;
 *   - a ranked top-risks list, each risk bound to the grounding precedent that
 *     justifies it (so no risk floats free of evidence);
 *   - a prioritized fix-list (criticals/highs first) the team can execute;
 *   - an explicit honesty envelope and an exportability guard.
 *
 * This module is PURE (no DB, no LLM, no I/O): the handler feeds it the verdict
 * and precedent records, and it composes the artifact + its Markdown rendering.
 * Kept pure so probability estimation, grounding, the fix-list ordering, and the
 * honesty/exportability guards are directly unit-testable on fixtures.
 *
 * Honesty contract (21 CFR Part 11): the probability is ALWAYS framed as an
 * estimate grounded in cited precedent, never a guarantee. A pattern-only /
 * insufficient-data read is marked `not_assessed` and is NOT exportable or
 * sealable. A "sample" artifact is likewise never exportable/sealable.
 *
 * E1 INTEGRATION: the "sealed" half of E14 (Sign-and-seal + SealBadge/
 * ProvenanceTrail) lands with E1. This module deliberately produces an
 * UNSEALED artifact and exposes `sealable` + a `sealStatus` of 'unsealed';
 * E1 attaches the SealedRecord/seal action without changing report assembly.
 */

import type {
  PremortemVerdict,
  PremortemFinding,
  PrecedentCitation,
  Confidence,
  RiskLevel,
  Severity,
} from './submission-premortem-core.js';

/** A precedent outcome bucket used to ground the approval-probability estimate. */
export interface PrecedentOutcomeRecord {
  /** Stable id of the precedent (e.g. a K-number, NDA id, or corpus id). */
  id: string;
  /** Human-readable label (clearance number / device / applicant). */
  label: string;
  /** Raw decision outcome string from the corpus (e.g. CLEARED, CRL, REFUSE_TO_FILE). */
  outcome: string;
}

/** How a precedent's outcome maps onto approval signal. */
export type OutcomeClass = 'approved' | 'denied' | 'unknown';

export type ProbabilityClass = 'low' | 'moderate' | 'high';

/**
 * The artifact's assessment status. `estimated` is the only state in which an
 * approval-probability figure is shown; `not_assessed` (pattern-only /
 * insufficient corpus) carries NO probability and is non-exportable, and
 * `sample` is a demonstration artifact that is likewise never exportable.
 */
export type ArtifactStatus = 'estimated' | 'not_assessed' | 'sample';

export interface ApprovalProbabilityEstimate {
  /** Point estimate as a fraction in [0,1], or null when not assessable. */
  value: number | null;
  /** Coarse band for at-a-glance reading. Null when not assessed. */
  class: ProbabilityClass | null;
  /** Precedents the estimate is calibrated against (the denominator). */
  denominator: number;
  /** Approve / deny / unknown split of the denominator. */
  approved: number;
  denied: number;
  unknown: number;
  confidence: Confidence;
  /**
   * Always-present framing string. Explicitly an ESTIMATE grounded in cited
   * precedent, never a guarantee — the honesty contract made textual.
   */
  framing: string;
}

/** A ranked risk in the artifact, bound to the precedent grounding it. */
export interface RankedRisk {
  rank: number;
  title: string;
  severity: Severity;
  category: string;
  reviewerQuestion: string;
  regulatoryBasis: string;
  /**
   * The grounding citation for this risk. Every risk MUST carry one: when the
   * corpus is thin the grounding falls back to the regulatory basis itself
   * (marked as such) rather than leaving the risk uncited.
   */
  grounding: RiskGrounding;
}

export interface RiskGrounding {
  /** Precedent id when corpus-grounded, otherwise the regulatory citation. */
  citationId: string;
  citationLabel: string;
  /** True when grounded in a real precedent record, false when basis-only. */
  fromCorpus: boolean;
}

export interface FixListItem {
  /** Execution order: criticals and highs first. */
  order: number;
  priority: Severity;
  action: string;
  /** Which risk (by title) this fix addresses, for traceability. */
  addressesRisk: string;
  /** The precedent/basis citation that justifies the fix. */
  citationId: string;
}

export type SealStatus = 'unsealed' | 'sealed';

export interface CrlPremortemArtifact {
  title: string;
  status: ArtifactStatus;
  riskLevel: RiskLevel;
  approvalProbability: ApprovalProbabilityEstimate;
  topRisks: RankedRisk[];
  fixList: FixListItem[];
  precedentCitations: PrecedentCitation[];
  honestyNote: string;
  /**
   * Whether this artifact may be exported/sealed. False for `not_assessed`
   * (insufficient grounding) and `sample` — those must never become a record.
   */
  exportable: boolean;
  /**
   * Whether E1's Sign-and-seal action may attach. Mirrors `exportable`; a
   * non-exportable artifact is never sealable.
   */
  sealable: boolean;
  /** Always 'unsealed' until E1's seal action runs. */
  sealStatus: SealStatus;
  generatedAt: string;
}

/** Map a raw corpus outcome string to an approval signal. */
export function classifyOutcome(outcome: string): OutcomeClass {
  const o = (outcome || '').trim().toUpperCase();
  if (!o) return 'unknown';
  if (['CLEARED', 'APPROVED', 'SE', 'GRANTED'].includes(o)) return 'approved';
  if (['REJECTED', 'CRL', 'REFUSE_TO_FILE', 'RTF', 'DENIED', 'NOT_SUBSTANTIALLY_EQUIVALENT', 'NSE'].includes(o)) {
    return 'denied';
  }
  return 'unknown';
}

function probabilityClass(value: number): ProbabilityClass {
  if (value >= 0.66) return 'high';
  if (value >= 0.33) return 'moderate';
  return 'low';
}

/**
 * Estimate approval probability from the precedent outcome split. Honest by
 * construction: the figure is the observed approve-rate over the precedents that
 * have a known outcome (the calibrated denominator), and it is only produced
 * when there is at least one such precedent. With none, the estimate is null and
 * the caller treats the artifact as `not_assessed`.
 */
export function estimateApprovalProbability(
  precedents: PrecedentOutcomeRecord[],
  confidence: Confidence,
): ApprovalProbabilityEstimate {
  let approved = 0;
  let denied = 0;
  let unknown = 0;
  for (const p of precedents) {
    const c = classifyOutcome(p.outcome);
    if (c === 'approved') approved += 1;
    else if (c === 'denied') denied += 1;
    else unknown += 1;
  }
  const calibrated = approved + denied;
  const denominator = precedents.length;

  if (calibrated === 0) {
    return {
      value: null,
      class: null,
      denominator,
      approved,
      denied,
      unknown,
      confidence: 'low',
      framing:
        'Approval probability NOT ESTIMATED: no precedent with a known approve/deny outcome is available for this context. This is a pattern-only read, not a probability — populate the precedent corpus for a grounded estimate.',
    };
  }

  const value = approved / calibrated;
  const pct = Math.round(value * 100);
  return {
    value,
    class: probabilityClass(value),
    denominator,
    approved,
    denied,
    unknown,
    confidence,
    framing:
      `ESTIMATE — approximately ${pct}% (${approved} of ${calibrated} comparable precedents reached approval). ` +
      'This is a precedent-grounded estimate, NOT a guarantee or a prediction of this submission’s outcome; ' +
      `confidence: ${confidence} (n=${denominator}). Treat it as directional and verify against your filing strategy.`,
  };
}

/**
 * Bind each ranked finding to a grounding precedent. Findings are already
 * severity-ranked by the verdict; risk i borrows precedent i (cycling) so the
 * top, highest-severity risks draw the strongest available citations. When the
 * corpus is empty, every risk grounds on its own regulatory basis (marked
 * `fromCorpus: false`) so no risk is ever uncited.
 *
 * IMPORTANT: the pairing is POSITIONAL, not topical — PrecedentCitation carries
 * no category/pattern to match a finding on, so precedent i is not verified as
 * evidentially specific to finding i. The renderer therefore discloses this on
 * every corpus-grounded citation ("drawn from the available precedent pool; not
 * verified as topically specific"), so a reviewer never mistakes list order for
 * an established evidentiary link.
 */
export function bindRisksToGrounding(
  findings: PremortemFinding[],
  precedents: PrecedentCitation[],
): RankedRisk[] {
  return findings.map((f, i) => {
    const p = precedents.length > 0 ? precedents[i % precedents.length] : undefined;
    const grounding: RiskGrounding = p
      ? { citationId: p.id, citationLabel: `${p.label} (${p.outcome})`, fromCorpus: true }
      : {
          citationId: f.regulatoryBasis || f.patternId,
          citationLabel: f.regulatoryBasis || f.patternId,
          fromCorpus: false,
        };
    return {
      rank: i + 1,
      title: f.title,
      severity: f.severity,
      category: f.category,
      reviewerQuestion: f.reviewerQuestion,
      regulatoryBasis: f.regulatoryBasis,
      grounding,
    };
  });
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Build the prioritized fix-list: each finding's remediation, ordered by
 * severity (criticals/highs first), each carrying the citation that justifies
 * acting. Pure; the input findings carry the remediation text.
 */
export function buildFixList(findings: PremortemFinding[], risks: RankedRisk[]): FixListItem[] {
  const byTitle = new Map(risks.map(r => [r.title, r]));
  const ordered = [...findings].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.matchConfidence - a.matchConfidence,
  );
  return ordered.map((f, i) => {
    const risk = byTitle.get(f.title);
    return {
      order: i + 1,
      priority: f.severity,
      action: f.remediation,
      addressesRisk: f.title,
      citationId: risk?.grounding.citationId ?? f.regulatoryBasis ?? f.patternId,
    };
  });
}

export interface AssembleArtifactInput {
  verdict: PremortemVerdict;
  /** Precedent outcome records used to ground the approval-probability estimate. */
  precedents: PrecedentOutcomeRecord[];
  title?: string;
  /** Mark this a demonstration artifact — never exportable/sealable. */
  isSample?: boolean;
  /** Injected for deterministic tests; defaults to now. */
  now?: Date;
}

/**
 * Compose the full board-ready CRL/RTF pre-mortem decision artifact from a
 * verdict + grounded precedent outcomes. Honest by construction; never sealed.
 */
export function assembleCrlPremortemArtifact(input: AssembleArtifactInput): CrlPremortemArtifact {
  const { verdict, precedents } = input;
  const now = input.now ?? new Date();

  const approvalProbability = estimateApprovalProbability(precedents, verdict.confidence);
  const topRisks = bindRisksToGrounding(verdict.findings, verdict.precedentCitations);
  const fixList = buildFixList(verdict.findings, topRisks);

  // Status: a demonstration artifact is always `sample`; otherwise, an absent
  // probability estimate (no calibrated precedent) is `not_assessed`; a present
  // estimate is `estimated`. Only `estimated` is exportable/sealable.
  let status: ArtifactStatus;
  if (input.isSample) status = 'sample';
  else if (approvalProbability.value == null) status = 'not_assessed';
  else status = 'estimated';

  const exportable = status === 'estimated';
  const sealable = exportable; // a non-exportable artifact is never sealable

  const honestyNote =
    verdict.honestyNote ??
    'This artifact is a precedent-grounded ESTIMATE, not a guarantee. Every risk cites its grounding precedent; verify against your filing strategy before relying on it.';

  return {
    title: input.title?.trim() || 'CRL/RTF Pre-Mortem — Decision Artifact',
    status,
    riskLevel: verdict.riskLevel,
    approvalProbability,
    topRisks,
    fixList,
    precedentCitations: verdict.precedentCitations,
    honestyNote,
    exportable,
    sealable,
    sealStatus: 'unsealed',
    generatedAt: now.toISOString(),
  };
}

const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  low: 'LOW',
  moderate: 'MODERATE',
  high: 'HIGH',
  critical: 'CRITICAL',
};

/**
 * Render the artifact as board-ready Markdown for `author_docx_native`. Throws
 * when the artifact is not exportable (`not_assessed` / `sample`) so the
 * honesty/exportability guard is enforced at the only egress point, not merely
 * advisory. Unsealed export is permitted but the document states it plainly.
 */
export function renderArtifactMarkdown(artifact: CrlPremortemArtifact): string {
  if (!artifact.exportable) {
    throw new Error(
      `CRL/RTF pre-mortem artifact is not exportable (status: ${artifact.status}). ` +
        'Pattern-only / insufficient-data and sample artifacts cannot be sealed or exported.',
    );
  }

  const ap = artifact.approvalProbability;
  const lines: string[] = [];
  lines.push(`# ${artifact.title}`);
  lines.push('');
  lines.push(
    `> UNSEALED DRAFT — this decision artifact has not been signed and sealed. ` +
      `Generated ${artifact.generatedAt}.`,
  );
  lines.push('');
  lines.push('## Approval-probability estimate');
  lines.push('');
  lines.push(ap.framing);
  lines.push('');
  lines.push(
    `- Overall pre-mortem risk level: **${RISK_LEVEL_LABEL[artifact.riskLevel]}**`,
  );
  if (ap.value != null) {
    lines.push(`- Estimate band: **${ap.class}** (${ap.approved} approved / ${ap.denied} denied of n=${ap.denominator})`);
  }
  lines.push(`- Confidence: ${ap.confidence}`);
  lines.push('');
  lines.push(`> Honesty note: ${artifact.honestyNote}`);
  lines.push('');

  lines.push('## Top risks (ranked, each grounded in cited precedent)');
  lines.push('');
  if (artifact.topRisks.length === 0) {
    lines.push(
      'No codified reviewer-trigger pattern fired. This is NOT proof of soundness — a human reviewer must still confirm completeness.',
    );
  } else {
    for (const r of artifact.topRisks) {
      lines.push(`### ${r.rank}. ${r.title} — ${r.severity.toUpperCase()}`);
      lines.push('');
      lines.push(`- Reviewer question: ${r.reviewerQuestion}`);
      lines.push(`- Regulatory basis: ${r.regulatoryBasis}`);
      lines.push(
        `- Grounding precedent: ${r.grounding.citationLabel}` +
          (r.grounding.fromCorpus
            ? ' (drawn from the available precedent pool; not verified as topically specific to this finding)'
            : ' (regulatory basis — no matched precedent; see DATA-OP note)'),
      );
      lines.push('');
    }
  }

  lines.push('## Prioritized fix-list');
  lines.push('');
  if (artifact.fixList.length === 0) {
    lines.push('No remediations required by codified patterns.');
  } else {
    for (const fix of artifact.fixList) {
      lines.push(
        `${fix.order}. [${fix.priority.toUpperCase()}] ${fix.action} ` +
          `_(addresses: ${fix.addressesRisk}; cite: ${fix.citationId})_`,
      );
    }
  }
  lines.push('');

  lines.push('## Precedent citations');
  lines.push('');
  if (artifact.precedentCitations.length === 0) {
    // DATA-OP: thin corpus — the P2 precedent-corpus ingestion populates this.
    lines.push('No precedent records matched this context (corpus may be thin — see DATA-OP).');
  } else {
    for (const c of artifact.precedentCitations) {
      lines.push(`- ${c.label} — ${c.outcome} (${c.id})`);
    }
  }
  lines.push('');

  return lines.join('\n');
}
