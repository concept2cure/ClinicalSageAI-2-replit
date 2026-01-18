import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { AIExtractedClaim, RemediationPlan, VerbatimSource } from '../../types/smart-claims.types';

const DEFAULT_CONFIDENCE = 0.85;

const sanitizeJson = (value: string) => value.trim().replace(/^```json/i, '').replace(/```$/, '');

export class LLMClaimExtractor {
  private anthropic: Anthropic;
  private openai: OpenAI;
  private embeddingModel = 'text-embedding-3-large';

  constructor() {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!anthropicKey || !openaiKey) {
      throw new Error('Missing AI API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY).');
    }

    this.anthropic = new Anthropic({ apiKey: anthropicKey });
    this.openai = new OpenAI({ apiKey: openaiKey });
  }

  async extractClaimsIntelligently(cerId: string, cerContent: any): Promise<AIExtractedClaim[]> {
    const extractionPrompt = `You are an FDA regulatory affairs expert specializing in medical device submissions.
Extract every clinical claim, safety claim, performance claim, and indication from this Clinical Evaluation Report.
Include implied claims, comparative statements, and any efficacy statements.

CER Content: ${JSON.stringify(cerContent)}

For each claim, provide:
1. originalText
2. normalizedClaim
3. claimType (safety | performance | efficacy | indication | contraindication | warning)
4. riskLevel (low | medium | high | critical)
5. confidence (0-1)
6. evidenceStrength (0-1)
7. regulatoryConcerns (string[])
8. pageNumber (optional)

Return JSON array.`;

    const claimExtraction = await this.anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 4000,
      temperature: 0.1,
      messages: [{ role: 'user', content: extractionPrompt }],
    });

    const rawText = claimExtraction.content?.[0]?.text || '[]';
    const rawClaims = JSON.parse(sanitizeJson(rawText));

    const enhancedClaims = await Promise.all(
      rawClaims.map(async (claim: any, index: number) => {
        const embedding = await this.openai.embeddings.create({
          model: this.embeddingModel,
          input: claim.normalizedClaim,
        });

        const verbatimSources: VerbatimSource[] = [
          {
            sourceId: cerId,
            sourceType: 'CER',
            verbatimText: claim.originalText,
            pageNumber: claim.pageNumber ?? null,
          },
        ];

        return {
          id: `claim-${cerId}-${index}`,
          aiConfidence: Math.round((claim.confidence ?? DEFAULT_CONFIDENCE) * 100) / 100,
          semanticEmbedding: embedding.data[0].embedding,
          deviceId: cerContent?.deviceId || cerId,
          claimText: claim.originalText,
          normalizedClaim: claim.normalizedClaim,
          claimType: claim.claimType,
          riskLevel: claim.riskLevel,
          evidenceClusters: [],
          regulatoryPrecedents: [],
          defensibilityScore: Math.round((claim.evidenceStrength ?? 0.5) * 100),
          gapSeverity: 'none',
          remediationAIRecommendation: this.defaultRemediationPlan(),
          verbatimSources,
          predictedFdaFeedback: claim.regulatoryConcerns || [],
        } as AIExtractedClaim;
      })
    );

    return enhancedClaims;
  }

  async identifyImplicitClaims(cerContent: any): Promise<string[]> {
    const implicitPrompt = `Analyze this CER for implied claims that FDA reviewers would infer:
- Off-label use implications
- Unstated comparative effectiveness
- Implicit safety signals
- Unclaimed but suggested indications

Return JSON array of implied claims.`;

    const implicitAnalysis = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      messages: [{ role: 'user', content: implicitPrompt }],
    });

    const rawText = implicitAnalysis.content?.[0]?.text || '[]';
    return JSON.parse(sanitizeJson(rawText));
  }

  private defaultRemediationPlan(): RemediationPlan {
    return {
      required: false,
      estimatedCost: 0,
      timelineDays: 0,
      recommendedActions: [],
      alternativePathways: [],
      predictedSuccessRate: 0,
    };
  }
}
