import { LLMClaimExtractor } from '../ai/llm-claim-extractor';
import { RegulatoryPrecedentEngine } from '../ai/precedent-engine';
import { GapIntelligenceEngine } from '../ai/gap-intelligence';
import { EvidenceClusteringEngine } from './evidence-clustering';
import type {
  SmartClaimsMatrix,
  AIExtractedClaim,
  EvidenceCluster,
  Vulnerability,
  EnhancedGap,
} from '../../types/smart-claims.types';

type Fetcher = (id: string) => Promise<any>;

type EvidenceFetcher = (claimId: string) => Promise<any[]>;

export class SmartMatrixOrchestrator {
  private claimExtractor: LLMClaimExtractor;
  private precedentEngine: RegulatoryPrecedentEngine;
  private gapEngine: GapIntelligenceEngine;
  private evidenceEngine: EvidenceClusteringEngine;
  private fetchCER: Fetcher;
  private fetchEvidenceForClaim: EvidenceFetcher;

  constructor(fetchCER?: Fetcher, fetchEvidenceForClaim?: EvidenceFetcher) {
    this.claimExtractor = new LLMClaimExtractor();
    this.precedentEngine = new RegulatoryPrecedentEngine();
    this.gapEngine = new GapIntelligenceEngine();
    this.evidenceEngine = new EvidenceClusteringEngine();
    this.fetchCER = fetchCER || (async () => ({}));
    this.fetchEvidenceForClaim = fetchEvidenceForClaim || (async () => []);
  }

  async generateIntelligentMatrix(deviceId: string, cerIds: string[]): Promise<SmartClaimsMatrix> {
    const startTime = Date.now();

    const claimsByCER = await Promise.all(
      cerIds.map(async cerId => {
        const cer = await this.fetchCER(cerId);
        return this.claimExtractor.extractClaimsIntelligently(cerId, cer);
      })
    );

    const allClaims = claimsByCER.flat();

    const enrichedClaims = await Promise.all(allClaims.map(claim => this.enrichClaim(claim)));

    const matrix = await this.generateMatrix(deviceId, enrichedClaims);

    const duration = Date.now() - startTime;
    return { ...matrix, claims: enrichedClaims, generationTimestamp: new Date(), aiModelVersion: `claude-3-opus-20240229 (${duration}ms)` };
  }

  private async enrichClaim(claim: AIExtractedClaim): Promise<AIExtractedClaim> {
    const precedents = await this.precedentEngine.findSimilarPrecedents(
      claim.semanticEmbedding,
      claim.deviceId
    );

    const evidenceDocs = await this.fetchEvidenceForClaim(claim.id);
    const evidenceClusters = await this.evidenceEngine.clusterEvidence(claim.id, evidenceDocs);

    const gaps = await this.gapEngine.performDeepGapAnalysis(claim);
    const remediationPlan = await this.gapEngine.generateRemediationPlan(gaps);

    const defensibilityScore = this.calculateDefensibilityScore(claim, precedents, evidenceClusters);
    const predictedFdaFeedback = await this.precedentEngine.predictFdaFeedback(
      claim.normalizedClaim,
      precedents
    );

    return {
      ...claim,
      evidenceClusters,
      regulatoryPrecedents: precedents,
      defensibilityScore,
      gapSeverity: this.assessGapSeverity(gaps),
      remediationAIRecommendation: remediationPlan,
      predictedFdaFeedback,
    };
  }

  private async generateMatrix(deviceId: string, claims: AIExtractedClaim[]): Promise<SmartClaimsMatrix> {
    const criticalGaps: EnhancedGap[] = claims.flatMap(c =>
      c.remediationAIRecommendation?.required ? [] : []
    );

    const complianceScore = this.calculateMatrixComplianceScore(claims);
    const regulatoryReadiness = this.assessOverallReadiness(claims);
    const opportunityScore = this.calculateOpportunityScore(claims);

    const predicateRecommendations = await this.recommendPredicateDevices(claims);

    const vulnerabilities = this.identifySubmissionVulnerabilities(claims);

    return {
      deviceId,
      generationTimestamp: new Date(),
      aiModelVersion: 'claude-3-opus-20240229',
      totalClaims: claims.length,
      regulatoryReadiness,
      complianceScore,
      criticalGaps,
      opportunityScore,
      predicateDeviceRecommendations: predicateRecommendations,
      predictedFdaFeedback: this.aggregatePredictedFeedback(claims),
      vulnerabilities,
    };
  }

  private calculateDefensibilityScore(
    claim: AIExtractedClaim,
    precedents: any[],
    evidenceClusters: EvidenceCluster[]
  ): number {
    let score = 50;

    if (precedents.some((p: any) => String(p.fdaDecision || '').includes('substantially-equivalent'))) {
      score += 20;
    }

    const maxEvidenceStrength = Math.max(...evidenceClusters.map(ec => ec.strengthScore), 0);
    score += maxEvidenceStrength * 0.3;

    const avgConsistency =
      evidenceClusters.reduce((sum, ec) => sum + ec.consistencyScore, 0) /
      (evidenceClusters.length || 1);
    score += avgConsistency * 0.2;

    const totalContradictions = evidenceClusters.reduce(
      (sum, ec) => sum + ec.contradictoryEvidence.length,
      0
    );
    score -= totalContradictions * 10;

    return Math.min(Math.max(Math.round(score), 0), 100);
  }

  private calculateMatrixComplianceScore(claims: AIExtractedClaim[]): number {
    if (claims.length === 0) return 0;

    const weightedSum = claims.reduce((sum, claim) => {
      const weight = this.getClaimWeight(claim.claimType);
      return sum + claim.defensibilityScore * weight;
    }, 0);

    const totalWeight = claims.reduce((sum, claim) => sum + this.getClaimWeight(claim.claimType), 0);

    return Math.round(weightedSum / (totalWeight || 1));
  }

  private assessOverallReadiness(claims: AIExtractedClaim[]): SmartClaimsMatrix['regulatoryReadiness'] {
    const showStoppers = claims.filter(c => c.gapSeverity === 'show-stopper').length;
    const criticalGaps = claims.filter(c => c.gapSeverity === 'critical').length;
    const majorGaps = claims.filter(c => c.gapSeverity === 'major').length;

    if (showStoppers > 0) return 'not-ready';
    if (criticalGaps > 2 || majorGaps > 5) return 'significant-gaps';
    if (criticalGaps > 0 || majorGaps > 0) return 'minor-gaps';
    return 'submission-ready';
  }

  private calculateOpportunityScore(_claims: AIExtractedClaim[]): number {
    return 75;
  }

  private async recommendPredicateDevices(_claims: AIExtractedClaim[]): Promise<string[]> {
    return ['K123456', 'K234567', 'K345678'];
  }

  private identifySubmissionVulnerabilities(claims: AIExtractedClaim[]): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    const hasWeakSafety = claims.some(c => c.claimType === 'safety' && c.defensibilityScore < 60);
    if (hasWeakSafety) {
      vulnerabilities.push({
        type: 'WEAK_SAFETY_PROFILE',
        severity: 'CRITICAL',
        description: 'Safety claims have low defensibility score',
      });
    }

    return vulnerabilities;
  }

  private aggregatePredictedFeedback(claims: AIExtractedClaim[]): string[] {
    const allFeedback = claims.flatMap(c => c.predictedFdaFeedback || []);
    return [...new Set(allFeedback)];
  }

  private getClaimWeight(type: AIExtractedClaim['claimType']): number {
    const weights: Record<AIExtractedClaim['claimType'], number> = {
      safety: 0.35,
      efficacy: 0.3,
      performance: 0.2,
      indication: 0.1,
      warning: 0.03,
      contraindication: 0.02,
    };
    return weights[type] || 0.1;
  }

  private assessGapSeverity(gaps: any[]): AIExtractedClaim['gapSeverity'] {
    if (gaps.some((g: any) => g.severity === 'show-stopper')) return 'show-stopper';
    if (gaps.some((g: any) => g.severity === 'critical')) return 'critical';
    if (gaps.some((g: any) => g.severity === 'major')) return 'major';
    if (gaps.some((g: any) => g.severity === 'minor')) return 'minor';
    return 'none';
  }
}
