export interface VerbatimSource {
  sourceId: string;
  sourceType: 'CER' | 'labeling' | 'study' | 'predicate' | 'other';
  verbatimText: string;
  pageNumber?: number | null;
}

export interface Contradiction {
  doc1Id: string;
  doc2Id: string;
  nature: string;
  resolutionStrategy: string;
}

export interface GapIssue {
  id: string;
  type: string;
  severity: 'minor' | 'major' | 'critical' | 'show-stopper';
  description: string;
  regulatoryPathway?: '510k' | 'PMA' | 'DeNovo' | 'CE-MDR' | 'CE-IVDR';
}

export interface Vulnerability {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
}

export interface AIExtractedClaim {
  id: string;
  deviceId: string;
  claimText: string;
  normalizedClaim: string;
  claimType: 'safety' | 'performance' | 'efficacy' | 'indication' | 'contraindication' | 'warning';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  aiConfidence: number;
  semanticEmbedding: number[];
  evidenceClusters: EvidenceCluster[];
  regulatoryPrecedents: RegulatoryPrecedent[];
  defensibilityScore: number;
  gapSeverity: 'none' | 'minor' | 'major' | 'critical' | 'show-stopper';
  remediationAIRecommendation: RemediationPlan;
  verbatimSources: VerbatimSource[];
  predictedFdaFeedback?: string[];
}

export interface EvidenceCluster {
  clusterId: string;
  evidenceType: 'clinical-trial' | 'real-world-evidence' | 'literature' | 'predicate' | 'bench-testing';
  strengthScore: number;
  consistencyScore: number;
  primaryCERs: string[];
  supportingCERs: string[];
  contradictoryEvidence: Contradiction[];
}

export interface RegulatoryPrecedent {
  precedentId: string;
  devicePredicate: string;
  regulatoryPathway: '510k' | 'PMA' | 'DeNovo' | 'CE-MDR' | 'CE-IVDR';
  fdaDecision: string;
  similarityScore: number;
  kNumber: string;
  panel: string;
  decisionDate: string;
  keyQuotes: string[];
}

export interface RemediationPlan {
  required: boolean;
  estimatedCost: number;
  timelineDays: number;
  recommendedActions: ActionItem[];
  alternativePathways: AlternativePathway[];
  predictedSuccessRate: number;
}

export interface ActionItem {
  actionId: string;
  type: 'additional-study' | 'literature-search' | 'post-market-surveillance' | 'labeling-change' | 'comparator' | 'other';
  priority: 'P0' | 'P1' | 'P2';
  description: string;
  specificRequirements: string[];
  estimatedCost: number;
  vendorRecommendations: string[];
}

export interface AlternativePathway {
  pathway: '510k' | 'PMA' | 'DeNovo' | 'CE-MDR' | 'CE-IVDR';
  rationale: string;
  estimatedTimelineDays: number;
}

export interface SmartClaimsMatrix {
  deviceId: string;
  generationTimestamp: Date;
  aiModelVersion: string;
  totalClaims: number;
  regulatoryReadiness: 'submission-ready' | 'minor-gaps' | 'significant-gaps' | 'not-ready';
  complianceScore: number;
  criticalGaps: EnhancedGap[];
  opportunityScore: number;
  predicateDeviceRecommendations: string[];
  predictedFdaFeedback: string[];
  vulnerabilities: Vulnerability[];
  claims?: AIExtractedClaim[];
}

export interface EnhancedGap extends GapIssue {
  aiExplainedImpact: string;
  precedentExamples: string[];
  costOfInaction: number;
  automatedDataSources: string[];
}
