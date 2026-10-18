/**
 * Intelligence Engine — Core Pipeline
 *
 * Orchestrates all deterministic intelligence modules into a single pipeline:
 *
 *   input → deterministic modules → structured signals → constrained LLM → evaluation gate → output → RIM signal
 *
 * The pipeline ensures:
 *   1. All analysis starts with deterministic logic (Modules 1–5)
 *   2. LLM receives ONLY structured signals, never raw text for freeform analysis
 *   3. Model output can be checked with the evaluation gate (Module 6, evaluateOutput)
 *   4. Rejected outputs are regenerated with tighter constraints
 *   5. RIM signals are emitted for pattern accumulation
 *
 * A signal that was not assessed (no comparison, no claim analysed) is null
 * or 'not_assessed', and the prompt says so; it is never written as a figure.
 */

import { createHash } from 'crypto';
import {
  analyzeDocument as analyzeClaimEvidence,
  analyzeClaimEvidence as analyzeSingle,
} from './claim-evidence-engine';
import { analyzeConsistency, type DocumentSection } from './consistency-engine';
import { computeDefensibility } from './defensibility-engine';
import { generateReviewerQuestions } from './reviewer-question-engine';
import { classifyRisks } from './risk-classification-engine';
import type { IntelligenceAnalysis, RIMSignal } from './types';

// ─── Pipeline ────────────────────────────────────────────────────────────────

/**
 * Run the full intelligence pipeline on a document.
 *
 * @param content - Full document text
 * @param sections - Optional parsed sections for cross-section analysis
 * @returns Complete intelligence analysis with all module outputs
 */
export function runIntelligencePipeline(
  content: string,
  sections?: DocumentSection[]
): IntelligenceAnalysis {
  const inputHash = createHash('sha256').update(content).digest('hex').slice(0, 16);

  // Module 1: Claim/Evidence Alignment
  const claimEvidence = analyzeClaimEvidence(content);

  // Module 2: Cross-Section Consistency
  const consistency =
    sections && sections.length > 1
      ? analyzeConsistency(sections)
      : analyzeConsistency(splitIntoSections(content));

  // Module 3: Defensibility Scoring
  const defensibility = computeDefensibility(claimEvidence, consistency, content);

  // Module 4: Reviewer Questions (from deterministic signals)
  const reviewerQuestions = generateReviewerQuestions(claimEvidence, consistency, defensibility);

  // Module 5: Risk Classification
  const riskClassifications = classifyRisks(claimEvidence, consistency, defensibility, content);

  // 2026-10-15: Module 6 ran here over this function's own formatted report
  // and returned it as `evaluation` — a regex certifying text the engine
  // wrote (passed, qualityScore 100, on a two-sentence note). It checks model
  // output; callers run evaluateOutput on that.
  return {
    claimEvidence,
    consistency,
    defensibility,
    reviewerQuestions,
    riskClassifications,
    timestamp: new Date().toISOString(),
    inputHash,
  };
}

/**
 * Build a constrained LLM prompt from intelligence signals.
 * This is the ONLY way LLM should receive context — never raw freeform text.
 *
 * BAD: "Analyze this section"
 * GOOD: structured signals fed as context
 */
export function buildConstrainedPrompt(
  analysis: IntelligenceAnalysis,
  taskType: 'explain_risk' | 'suggest_remediation' | 'generate_memo' | 'rewrite_section'
): string {
  const signals = [];
  const { claimEvidence, consistency, defensibility } = analysis;
  // 2026-10-15: unassessed figures were written as measured ones, e.g.
  // "Consistency score: 100/100" when nothing was compared.
  const dimension = (v: number | null) => (v === null ? 'not assessed' : `${v}/25`);

  // Claim/Evidence signals
  signals.push(`CLAIM/EVIDENCE ANALYSIS:`);
  signals.push(
    claimEvidence.overallRisk === 'not_assessed'
      ? `- Overall risk: not assessed (no claim was analysed)`
      : `- Overall risk: ${claimEvidence.overallRisk}`
  );
  signals.push(`- Overstated claims: ${analysis.claimEvidence.overstatedCount}`);
  signals.push(`- Unsupported claims: ${analysis.claimEvidence.unsupportedCount}`);
  if (analysis.claimEvidence.alignments.length > 0) {
    const worst = analysis.claimEvidence.alignments
      .filter(a => a.alignment !== 'aligned')
      .slice(0, 3);
    for (const a of worst) {
      signals.push(
        `  * ${a.alignment}: "${a.claimText.slice(0, 80)}" (claim: ${a.claimStrength}, evidence: ${a.evidenceStrength})`
      );
    }
  }

  // Consistency signals
  signals.push(`\nCROSS-SECTION CONSISTENCY:`);
  signals.push(
    consistency.consistencyScore === null
      ? `- Consistency score: not assessed (no statements from two different sections were compared)`
      : `- Consistency score: ${consistency.consistencyScore}/100 over ${consistency.comparisons} cross-section comparisons`
  );
  if (analysis.consistency.inconsistencies.length > 0) {
    for (const inc of analysis.consistency.inconsistencies.slice(0, 3)) {
      signals.push(`  * ${inc.type} (${inc.severity}): ${inc.description}`);
    }
  }

  // Defensibility signals
  signals.push(
    defensibility.score === null
      ? `\nDEFENSIBILITY SCORE: not assessed (no claim was analysed)`
      : `\nDEFENSIBILITY SCORE: ${defensibility.score}/100 (${defensibility.riskLevel} risk)` +
          (defensibility.partial
            ? `, over the dimensions measured; not assessed: ${defensibility.notAssessed.join(', ')}`
            : '')
  );
  signals.push(`- Evidence presence: ${dimension(defensibility.breakdown.evidencePresence)}`);
  signals.push(`- Claim precision: ${dimension(defensibility.breakdown.claimPrecision)}`);
  signals.push(`- Consistency: ${dimension(defensibility.breakdown.consistency)}`);
  signals.push(`- Completeness: ${defensibility.breakdown.completeness}/25`);

  // Risk classifications
  if (analysis.riskClassifications.classifications.length > 0) {
    signals.push(`\nRISK CLASSIFICATIONS (${analysis.riskClassifications.overallRisk} overall):`);
    for (const r of analysis.riskClassifications.classifications.slice(0, 5)) {
      signals.push(`  * [${r.severity.toUpperCase()}] ${r.category}: ${r.finding}`);
      signals.push(`    Regulatory basis: ${r.regulatoryBasis}`);
    }
  }

  // Task-specific instructions
  const riskAssessed = defensibility.riskLevel !== 'not_assessed';
  const taskInstructions: Record<typeof taskType, string> = {
    explain_risk: `Based on the above deterministic analysis signals, explain:
1. ${riskAssessed ? `Why this document carries ${defensibility.riskLevel} regulatory risk` : 'That no defensibility risk level was assessed for this document, and what was not assessed'}
2. Which specific findings create the most exposure
3. What a regulatory reviewer would likely challenge first
Be specific. Reference the signals above. Do not add findings not in the signals.`,

    suggest_remediation: `Based on the above deterministic analysis signals, provide:
1. Prioritized remediation steps (critical findings first)
2. Specific language changes for overstated claims
3. Missing elements that must be added
Each recommendation must reference a specific signal from the analysis above.`,

    generate_memo: `Based on the above deterministic analysis signals, generate a regulatory intelligence memo that:
1. Opens with the defensibility score and risk level${riskAssessed ? '' : ' — both were not assessed: say so and why'}
2. Lists critical and major findings with their regulatory basis
3. Provides specific remediation guidance for each finding
4. Concludes with a clear recommendation (proceed/revise/hold)
Format as a structured memo. Every statement must be grounded in the signals above.`,

    rewrite_section: `Based on the above deterministic analysis signals, rewrite the flagged content to:
1. Moderate overstated claims (change "demonstrates" to "suggests" where evidence is partial)
2. Add evidence references where they are missing
3. Resolve any detected inconsistencies
4. Maintain technical accuracy and regulatory precision
Only modify what the signals indicate needs changing. Preserve all content that passed analysis.`,
  };

  return `You are a regulatory intelligence analyst. You have been given DETERMINISTIC analysis results from the Intelligence Engine.

YOUR ROLE: Interpret and synthesize these structured signals into clear, actionable output. Do NOT perform your own analysis. Do NOT add findings that are not grounded in the signals below. Where a signal says "not assessed", say that it was not assessed; never state or estimate a figure for it.

${signals.join('\n')}

${taskInstructions[taskType]}`;
}

// ─── RIM Signal Emission ─────────────────────────────────────────────────────

/**
 * Extract RIM signals from an intelligence analysis for pattern accumulation.
 */
export function emitRIMSignals(analysis: IntelligenceAnalysis): RIMSignal[] {
  const signals: RIMSignal[] = [];
  const now = new Date().toISOString();

  // Claim overstatement signals
  if (analysis.claimEvidence.overstatedCount > 0) {
    signals.push({
      type: 'claim_overstatement',
      severity: analysis.claimEvidence.overstatedCount >= 3 ? 'high' : 'medium',
      source: 'claim-evidence-engine',
      detail: `${analysis.claimEvidence.overstatedCount} overstated claims detected`,
      timestamp: now,
    });
  }

  // Evidence gap signals
  if (analysis.claimEvidence.unsupportedCount > 0) {
    signals.push({
      type: 'evidence_gap',
      severity: analysis.claimEvidence.unsupportedCount >= 3 ? 'critical' : 'high',
      source: 'claim-evidence-engine',
      detail: `${analysis.claimEvidence.unsupportedCount} unsupported claims detected`,
      timestamp: now,
    });
  }

  // Inconsistency signals
  if (analysis.consistency.inconsistencies.length > 0) {
    const highCount = analysis.consistency.inconsistencies.filter(
      i => i.severity === 'high'
    ).length;
    signals.push({
      type: 'inconsistency',
      severity: highCount >= 2 ? 'high' : 'medium',
      source: 'consistency-engine',
      detail: `${analysis.consistency.inconsistencies.length} inconsistencies (${highCount} high severity)`,
      timestamp: now,
    });
  }

  // Defensibility signals (an unassessed score is not a drop)
  if (analysis.defensibility.score !== null && analysis.defensibility.score < 50) {
    signals.push({
      type: 'defensibility_drop',
      severity: analysis.defensibility.score < 30 ? 'critical' : 'high',
      source: 'defensibility-engine',
      detail: `Defensibility score: ${analysis.defensibility.score}/100`,
      timestamp: now,
    });
  }

  // Risk escalation
  if (
    analysis.riskClassifications.overallRisk === 'critical' ||
    analysis.riskClassifications.overallRisk === 'high'
  ) {
    signals.push({
      type: 'risk_escalation',
      severity: analysis.riskClassifications.overallRisk === 'critical' ? 'critical' : 'high',
      source: 'risk-classification-engine',
      detail: `${analysis.riskClassifications.criticalCount} critical, ${analysis.riskClassifications.majorCount} major findings`,
      timestamp: now,
    });
  }

  return signals;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Split raw text into pseudo-sections for consistency analysis
 * when explicit sections are not provided.
 */
function splitIntoSections(content: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  // Split on markdown headings or numbered sections
  const parts = content.split(/(?=^#{1,3}\s+|\n\d+\.\s+[A-Z])/m);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (part.length < 30) continue;

    // Extract heading
    const headingMatch = part.match(/^(?:#{1,3}\s+)?(.+?)(?:\n|$)/);
    const name = headingMatch ? headingMatch[1].trim().slice(0, 100) : `Section ${i + 1}`;

    sections.push({
      id: `section_${i}`,
      name,
      content: part,
    });
  }

  // If no sections detected, treat as single document
  if (sections.length === 0) {
    sections.push({
      id: 'document',
      name: 'Full Document',
      content,
    });
  }

  return sections;
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { analyzeClaimEvidence, analyzeDocument as analyzeSingle } from './claim-evidence-engine';
export { analyzeConsistency, extractAssertions } from './consistency-engine';
export { computeDefensibility } from './defensibility-engine';
export { generateReviewerQuestions } from './reviewer-question-engine';
export { classifyRisks } from './risk-classification-engine';
export { evaluateOutput, evaluateIntelligenceOutput } from './evaluation-gate';
export type * from './types';
