import { ProtocolData } from './protocol-analyzer-service';
import { huggingFaceService } from './huggingface-service';
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
  confidence: number;
}

export class ProtocolOptimizerService {
  /**
   * Generates tailored recommendations based on the exact protocol submitted
   * with specific references to similar CSRs and academic literature
   */
  async generateTailoredRecommendations(
    protocolText: string,
    protocolMeta: {
      indication: string;
      phase: string;
      studyType: string;
      title?: string;
    },
    matchedCsrs: any[] = [],
    academicReferences: any[] = []
  ): Promise<string> {
    try {
      // If OpenAI API is available, use that for more tailored recommendations
      if (isApiKeyAvailable()) {
        return await generateTailoredProtocolRecommendations(
          protocolText,
          protocolMeta,
          matchedCsrs,
          academicReferences
        );
      } else {
        // Fallback to simpler template-based approach if OpenAI is not available
        return `## Protocol Optimization Recommendations for ${protocolMeta.indication} Study

Based on our analysis of your ${protocolMeta.phase.replace('phase', 'Phase ')} ${protocolMeta.indication} protocol, we recommend the following optimizations:

1. **Consider industry standard endpoints for ${protocolMeta.indication} studies**
   - Ensure alignment with regulatory expectations
   - Include patient-reported outcomes

2. **Optimize sample size for statistical power**
   - Based on similar studies in ${protocolMeta.indication}
   - Account for expected effect size and dropout rate

3. **Enhance inclusion/exclusion criteria**
   - Target appropriate patient population
   - Balance enrollment feasibility with population specificity

4. **Review safety monitoring procedures**
   - Implement standard safety assessments for ${protocolMeta.indication} studies
   - Include appropriate stopping rules`;
      }
    } catch (error) {
      console.error('Error generating tailored recommendations:', error);
      return 'Unable to generate tailored recommendations. Please try again.';
    }
  }

  /**
   * Generates optimization recommendations for a protocol
   */
  async optimizeProtocol(protocolData: ProtocolData): Promise<OptimizationResult> {
    // In a real implementation, this would use a machine learning model
    // to analyze the protocol and generate optimization recommendations

    // Generate some sample recommendations based on rules
    const recommendations: Recommendation[] = [];

    // Check sample size
    if (protocolData.sample_size < 50) {
      recommendations.push({
        field: 'sample_size',
        original: protocolData.sample_size,
        suggested: Math.max(50, protocolData.sample_size * 2),
        reason:
          'Small sample sizes reduce statistical power. Consider increasing to improve chances of detecting treatment effect.',
        confidence: 0.9,
      });
    } else if (protocolData.sample_size > 500 && protocolData.phase === 'Phase I') {
      recommendations.push({
        field: 'sample_size',
        original: protocolData.sample_size,
        suggested: 50,
        reason:
          'Sample size is unusually large for a Phase I trial, which typically focuses on safety in a small group.',
        confidence: 0.7,
      });
    }

    // Check duration
    if (
      protocolData.duration_weeks < 12 &&
      protocolData.indication.toLowerCase().includes('chronic')
    ) {
      recommendations.push({
        field: 'duration_weeks',
        original: protocolData.duration_weeks,
        suggested: Math.max(24, protocolData.duration_weeks * 2),
        reason:
          'For chronic conditions, longer follow-up periods are recommended to better assess long-term outcomes.',
        confidence: 0.8,
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

    const indication = protocolData.indication.toLowerCase();
    for (const [category, endpoints] of Object.entries(commonEndpoints)) {
      if (indication.includes(category.toLowerCase())) {
        const isUsingCommonEndpoint = endpoints.some(endpoint =>
          protocolData.primary_endpoint.toLowerCase().includes(endpoint.toLowerCase())
        );

        if (!isUsingCommonEndpoint) {
          recommendations.push({
            field: 'primary_endpoint',
            original: protocolData.primary_endpoint,
            suggested: endpoints[0],
            reason: `Consider using established endpoints like ${endpoints.join(', ')} for ${category} trials, which may improve regulatory acceptance.`,
            confidence: 0.6,
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

    // Calculate an improvement score based on the recommendations
    const improvementScore = recommendations.reduce(
      (score, rec) => score + rec.confidence * 0.1,
      recommendations.length > 0 ? 0.5 : 0
    );

    return {
      original: protocolData,
      optimized,
      recommendations,
      improvementScore: Math.min(0.95, improvementScore),
    };
  }

  /**
   * Performs a more detailed optimization with Hugging Face models
   */
  async getDeepOptimizationRecommendations(
    protocolData: ProtocolData
  ): Promise<OptimizationResult> {
    // This would use the Hugging Face model to make more advanced recommendations
    // First get basic optimization
    const basicOptimization = await this.optimizeProtocol(protocolData);

    // In a real implementation, this would enhance the optimization with HF models
    // For this demo, we'll simulate that by adding more detailed recommendations

    const enhancedRecommendations = [...basicOptimization.recommendations];

    // Add additional recommendations based on "deeper analysis"
    if (protocolData.design && !protocolData.design.toLowerCase().includes('randomized')) {
      enhancedRecommendations.push({
        field: 'design',
        original: protocolData.design || 'Not specified',
        suggested: 'Randomized, Double-Blind, Placebo-Controlled',
        reason:
          'Randomized controlled trials provide stronger evidence than non-randomized designs. Consider implementing randomization to reduce bias.',
        confidence: 0.85,
      });
    }

    if (protocolData.arms && protocolData.arms < 2) {
      enhancedRecommendations.push({
        field: 'arms',
        original: protocolData.arms || 1,
        suggested: 2,
        reason:
          'Single-arm studies provide limited evidence of treatment effect. Consider adding a control arm for comparison.',
        confidence: 0.9,
      });
    }

    // Add secondary endpoint recommendations if they don't exist
    if (!protocolData.secondary_endpoints || protocolData.secondary_endpoints.length === 0) {
      enhancedRecommendations.push({
        field: 'secondary_endpoints',
        original: 'None specified',
        suggested: 'Add safety and quality of life endpoints',
        reason:
          'Secondary endpoints provide additional valuable information beyond the primary outcome. Consider adding patient-reported outcomes and safety assessments.',
        confidence: 0.8,
      });
    }

    // Enhance the optimization with improved values
    const enhancedOptimized = { ...basicOptimization.optimized };

    // Apply enhanced recommendations
    for (const rec of enhancedRecommendations.filter(
      r => !basicOptimization.recommendations.some(b => b.field === r.field)
    )) {
      switch (rec.field) {
        case 'design':
          enhancedOptimized.design = String(rec.suggested);
          break;
        case 'arms':
          enhancedOptimized.arms = Number(rec.suggested);
          break;
        case 'secondary_endpoints':
          enhancedOptimized.secondary_endpoints = [
            'Safety and Tolerability',
            'Quality of Life Assessment',
          ];
          break;
      }
    }

    // Calculate an enhanced improvement score
    const enhancedImprovementScore = enhancedRecommendations.reduce(
      (score, rec) => score + rec.confidence * 0.1,
      enhancedRecommendations.length > 0 ? 0.6 : 0
    );

    return {
      original: protocolData,
      optimized: enhancedOptimized,
      recommendations: enhancedRecommendations,
      improvementScore: Math.min(0.98, enhancedImprovementScore),
    };
  }
}

// Export a singleton instance for convenience
export const protocolOptimizerService = new ProtocolOptimizerService();
