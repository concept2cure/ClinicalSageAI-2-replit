import { ProtocolData } from './protocol-analyzer-service';
import { isApiKeyAvailable, generateTailoredProtocolRecommendations } from './openai-service';

export interface OptimizationResult {
  original: ProtocolData;
  optimized: ProtocolData;
  recommendations: Recommendation[];
  improvementScore: number;
}

export interface Recommendation {
  field: string;
  original: string | number;
  suggested: string | number;
  reason: string;
  /**
   * How strongly this RULE is held, fixed when the rule was written — not a
   * confidence in this recommendation being right for this protocol.
   *
   * Renamed from `confidence` on 2026-09-11. Every value is a literal chosen at
   * authoring time (0.9 for the small-sample rule, 0.7 for the large-Phase-I
   * rule, 0.8 for the chronic-duration rule, 0.6 for the endpoint rule) and
   * nothing about the submitted protocol moves any of them. Calling that a
   * confidence invited it to be read as "we are 90% sure this is correct",
   * which no part of this service computes.
   */
  ruleStrength: number;
}

export class ProtocolOptimizerService {
  /**
   * A narrative recommendation for the submitted protocol, written by the
   * configured model from the evidence the caller supplies: the protocol text,
   * the comparable trials, and the deterministic comparison of the two.
   *
   * Returns null when no model is configured. A failed model call throws.
   *
   * ── 2026-10-01 ─────────────────────────────────────────────────────────────
   * With no model configured this used to return a template — "Based on our
   * analysis of your Phase 3 obesity protocol, we recommend…", "Optimize
   * sample size … Based on similar studies in obesity" — describing an analysis
   * that had not run and studies nobody read. A failed model call returned the
   * string 'Unable to generate tailored recommendations. Please try again.' AS
   * the recommendation, so an error rendered as content.
   */
  async generateTailoredRecommendations(
    protocolText: string,
    protocolMeta: {
      indication: string;
      phase: string;
      studyType?: string;
      title?: string;
    },
    comparableTrials: any[],
    evidenceSummary: string
  ): Promise<string | null> {
    if (!isApiKeyAvailable()) return null;
    return generateTailoredProtocolRecommendations(
      protocolText,
      protocolMeta,
      comparableTrials,
      evidenceSummary
    );
  }

  /**
   * Generates optimization recommendations for a protocol
   */
  async optimizeProtocol(protocolData: ProtocolData): Promise<OptimizationResult> {
    // In a real implementation, this would use a machine learning model
    // to analyze the protocol and generate optimization recommendations

    // Generate some sample recommendations based on rules
    const recommendations: Recommendation[] = [];

    /* ── 2026-09-10: these rules used to fire on invented inputs ──────────────
       ProtocolData's fields were required and defaulted by the analyser, so a
       protocol that never stated a sample size arrived here as 100 and a
       protocol that never stated an indication arrived as a therapeutic area.
       The rules below then produced recommendations about those values. The
       fields are optional now; a rule whose input is missing does not fire and
       does not substitute one. Saying nothing about an unstated sample size is
       the correct output. */

    // Check sample size — only when the protocol actually stated one.
    const n = protocolData.sample_size;
    if (n !== undefined) {
      if (n < 50) {
        recommendations.push({
          field: 'sample_size',
          original: n,
          suggested: Math.max(50, n * 2),
          reason:
            'Small sample sizes reduce statistical power. Consider increasing to improve chances of detecting treatment effect.',
          ruleStrength: 0.9,
        });
      } else if (n > 500 && protocolData.phase === 'Phase I') {
        recommendations.push({
          field: 'sample_size',
          original: n,
          suggested: 50,
          reason:
            'Sample size is unusually large for a Phase I trial, which typically focuses on safety in a small group.',
          ruleStrength: 0.7,
        });
      }
    }

    // Check duration — needs BOTH a stated duration and a stated indication.
    const weeks = protocolData.duration_weeks;
    if (
      weeks !== undefined &&
      weeks < 12 &&
      protocolData.indication?.toLowerCase().includes('chronic')
    ) {
      recommendations.push({
        field: 'duration_weeks',
        original: weeks,
        suggested: Math.max(24, weeks * 2),
        reason:
          'For chronic conditions, longer follow-up periods are recommended to better assess long-term outcomes.',
        ruleStrength: 0.8,
      });
    }

    // Primary endpoint recommendations
    const commonEndpoints: Record<string, string[]> = {
      oncology: ['Overall Survival', 'Progression-Free Survival', 'Objective Response Rate'],
      cardiovascular: ['Major Adverse Cardiac Events (MACE)', 'Left Ventricular Ejection Fraction'],
      neurology: ['Modified Rankin Scale', 'UPDRS Score'],
      psychiatry: ['Hamilton Depression Rating Scale', 'PANSS Score'],
      'infectious disease': ['Viral Load', 'Time to Resolution of Symptoms'],
    };

    // Needs a stated indication AND a stated primary endpoint. Recommending a
    // replacement endpoint requires knowing the current one; with the endpoint
    // defaulted to 'Overall Response Rate' this rule used to compare an
    // invented endpoint against a reference list and advise on the result.
    const indication = protocolData.indication?.toLowerCase() ?? '';
    const currentEndpoint = protocolData.primary_endpoint;
    for (const [category, endpoints] of Object.entries(commonEndpoints)) {
      if (currentEndpoint !== undefined && indication.includes(category.toLowerCase())) {
        const isUsingCommonEndpoint = endpoints.some(endpoint =>
          currentEndpoint.toLowerCase().includes(endpoint.toLowerCase())
        );

        if (!isUsingCommonEndpoint) {
          recommendations.push({
            field: 'primary_endpoint',
            original: currentEndpoint,
            suggested: endpoints[0],
            reason: `Consider using established endpoints like ${endpoints.join(', ')} for ${category} trials, which may improve regulatory acceptance.`,
            ruleStrength: 0.6,
          });
        }
      }
    }

    // Create optimized protocol based on recommendations
    const optimized = { ...protocolData };

    // Apply recommendations to the optimized protocol
    for (const rec of recommendations) {
      switch (rec.field) {
        case 'sample_size':
          optimized.sample_size = Number(rec.suggested);
          break;
        case 'duration_weeks':
          optimized.duration_weeks = Number(rec.suggested);
          break;
        case 'primary_endpoint':
          optimized.primary_endpoint = String(rec.suggested);
          optimized.endpoint_primary = String(rec.suggested);
          break;
      }
    }

    // A weighted COUNT OF RULES THAT FIRED — 0.5 plus a tenth of each rule's
    // authored strength, capped below. It does not measure how much the
    // protocol would improve, and it cannot: nothing here compares a before and
    // an after. The name is kept because it is on the exported type, and this
    // comment is the correction.
    const improvementScore = recommendations.reduce(
      (score, rec) => score + rec.ruleStrength * 0.1,
      recommendations.length > 0 ? 0.5 : 0
    );

    return {
      original: protocolData,
      optimized,
      recommendations,
      improvementScore: Math.min(0.95, improvementScore),
    };
  }

  /*
   * getDeepOptimizationRecommendations was REMOVED on 2026-09-11.
   *
   * Its docstring read "Performs a more detailed optimization with Hugging Face
   * models" and its body read "In a real implementation, this would enhance the
   * optimization with HF models / For this demo, we'll simulate that by adding
   * more detailed recommendations", with "deeper analysis" in its own scare
   * quotes. No Hugging Face model was called: `huggingFaceService` was imported
   * at the top of this file and never referenced. It ran optimizeProtocol and
   * appended three more hardcoded rules.
   *
   * It also had ZERO callers — referenced nowhere but its own definition — so
   * nothing is lost. The unused import went with it.
   */

}

// Export a singleton instance for convenience
export const protocolOptimizerService = new ProtocolOptimizerService();
