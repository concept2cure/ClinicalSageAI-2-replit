import type { EnhancedGap, RemediationPlan, AIExtractedClaim } from '../../types/smart-claims.types';
import { Anthropic } from '@anthropic-ai/sdk';

const sanitizeJson = (value: string) => value.trim().replace(/^```json/i, '').replace(/```$/, '');

export class GapIntelligenceEngine {
  private anthropic: Anthropic;

  constructor() {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      throw new Error('Missing ANTHROPIC_API_KEY.');
    }
    this.anthropic = new Anthropic({ apiKey: anthropicKey });
  }

  async performDeepGapAnalysis(claim: AIExtractedClaim): Promise<EnhancedGap[]> {
    const gapPrompt = `As an FDA submission expert, analyze this claim and identify ALL gaps:

Claim: ${claim.normalizedClaim}
Current Evidence: ${JSON.stringify(claim.evidenceClusters)}

For each gap, specify:
1. id
2. type
3. severity (minor | major | critical | show-stopper)
4. description
5. regulatoryPathway (optional)
6. aiExplainedImpact
7. precedentExamples (string[])
8. costOfInaction
9. automatedDataSources (string[])

Return JSON array.`;

    const gapAnalysis = await this.anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 2000,
      temperature: 0.2,
      messages: [{ role: 'user', content: gapPrompt }],
    });

    const rawText = gapAnalysis.content?.[0]?.text || '[]';
    const identifiedGaps = JSON.parse(sanitizeJson(rawText));

    return identifiedGaps.map((gap: any) => ({
      id: gap.id || `gap-${claim.id}-${gap.type || 'gap'}`,
      type: gap.type || 'evidence',
      severity: gap.severity || 'minor',
      description: gap.description || 'Identified regulatory gap',
      regulatoryPathway: gap.regulatoryPathway,
      aiExplainedImpact: gap.aiExplainedImpact || 'Regulatory impact identified.',
      precedentExamples: gap.precedentExamples || [],
      costOfInaction: gap.costOfInaction || 0,
      automatedDataSources: gap.automatedDataSources || [],
    }));
  }

  async generateRemediationPlan(gaps: EnhancedGap[]): Promise<RemediationPlan> {
    if (gaps.length === 0) {
      return {
        required: false,
        estimatedCost: 0,
        timelineDays: 0,
        recommendedActions: [],
        alternativePathways: [],
        predictedSuccessRate: 0,
      };
    }

    const remediationPrompt = `Given these regulatory gaps:
${JSON.stringify(gaps)}

Create a remediation plan JSON object with:
- required (boolean)
- estimatedCost
- timelineDays
- recommendedActions (array)
- alternativePathways (array)
- predictedSuccessRate`;

    const remediationPlan = await this.anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 3000,
      messages: [{ role: 'user', content: remediationPrompt }],
    });

    const rawText = remediationPlan.content?.[0]?.text || '{}';
    return JSON.parse(sanitizeJson(rawText));
  }
}
