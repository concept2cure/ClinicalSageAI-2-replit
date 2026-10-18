/**
 * What the cortex precedent tools answer — kept out of the tool registry
 * (tools/index.ts), which is at its size ceiling.
 *
 * Each says what the precedent engine found and nothing more: a risk analysis
 * that could read no source is "not assessed", not "LOW (score 0%)"; a
 * strategy no approved precedent recorded is not recommended; and an empty
 * list reads as "none recorded", not "Standard testing requirements." or
 * "No major risks identified." (2026-10-15).
 */
import type { ToolArtifact, ToolResult } from '../toolRegistry';
import type { RiskAnalysisResult, StrategyRecommendation } from '../precedent-engine';

/** The risk tool's answer for an analysis that could read no source. */
export function riskNotAssessedResult(analysis: RiskAnalysisResult): ToolResult {
  const why = Object.values(analysis.sources)
    .map((s) => (s === 'read' ? '' : s.notRead))
    .filter(Boolean)
    .join('; ');
  return {
    ok: false,
    artifact: null,
    message: { role: 'assistant', content: `Risk analysis not assessed — no source could be read (${why}).` },
  };
}

/** The strategy tool's answer when no submission type was named; it assumed 510(k). */
export const STRATEGY_NEEDS_TYPE: ToolResult = {
  ok: false,
  artifact: null,
  message: {
    role: 'assistant',
    content: 'Which submission type? Strategies differ by application type (510(k), PMA, De Novo, NDA, BLA, IND).',
  },
};

/** The strategy tool's answer for what recommendStrategy found. */
export function strategyToolResult(strategy: StrategyRecommendation): ToolResult {
  const artifact: ToolArtifact = {
    type: 'strategy_recommendation',
    id: `prec-strat-${Date.now()}`,
    title: 'Submission Strategy Recommendation',
    status: 'generated',
    data: strategy as unknown as Record<string, unknown>,
  };
  if (strategy.basis === 'no-precedents' || strategy.recommendedStrategy === null) {
    const none = 'No approved precedent that records a strategy matched, so no strategy is recommended.';
    return { ok: true, artifact, summary: none, message: { role: 'assistant', content: `## Submission Strategy Recommendation\n\n${none}` } };
  }
  const altList = strategy.alternativeStrategies
    .map((a) => `  • **${a.strategy}** — ${a.precedentCount} precedent(s), ${Math.round(a.shareOfApprovedPrecedents * 100)}% of approved precedents`)
    .join('\n');
  const testList = strategy.testingRequirements.map((t) => `  • ${t}`).join('\n');
  const riskList = strategy.keyRisks.map((r) => `  ⚠️ ${r}`).join('\n');
  const confidence = Math.round((strategy.confidence ?? 0) * 100);
  return {
    ok: true,
    artifact,
    summary: `Recommended: "${strategy.recommendedStrategy}" (${confidence}% confidence), ${strategy.supportingPrecedents.length} supporting precedents`,
    message: {
      role: 'assistant',
      content: [
        '## Submission Strategy Recommendation',
        '',
        `**Recommended Strategy:** ${strategy.recommendedStrategy}`,
        `**Confidence:** ${confidence}%`,
        `**Estimated Timeline:** ${strategy.estimatedTimeline ?? 'not estimated (no timeline for this clearance type)'}`,
        '',
        `**Supporting Precedents:** ${strategy.supportingPrecedents.length} approved submission(s)`,
        '',
        `**Testing Requirements:**\n${testList || '  None recorded in the supporting precedents.'}`,
        '',
        `**Alternative Strategies:**\n${altList || '  No alternatives identified.'}`,
        '',
        `**Key Risks:**\n${riskList || '  None recorded in the matched rejected precedents.'}`,
      ].join('\n'),
    },
  };
}
