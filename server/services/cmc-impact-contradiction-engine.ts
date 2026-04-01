export interface CmcContradiction {
  contradictionType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
  impactedSections: string[];
  requiredReviewers: string[];
}

export function detectContradictions(input: {
  specifications?: Array<{ materialName: string; acceptanceCriteria?: Record<string, any> }>;
  methods?: Array<{ methodName: string; purpose?: string }>;
  stability?: Array<{ studyName: string; status?: string }>;
  batch?: Array<{ batchNumber: string; disposition?: string }>;
  changeControl?: Array<{ id: string; status?: string }>;
  comparability?: Array<{ assessmentName: string; regulatoryRiskLevel?: string }>;
  sectionNarrative?: string;
}): CmcContradiction[] {
  const contradictions: CmcContradiction[] = [];

  if ((input.batch || []).some((b) => (b.disposition || '').toLowerCase() === 'rejected')) {
    contradictions.push({
      contradictionType: 'batch_rejected',
      severity: 'critical',
      details: 'At least one batch is rejected while Module 3 composition may include releasable assertions.',
      impactedSections: ['3.2.P.3', '3.2.P.5'],
      requiredReviewers: ['QA/Release', 'MSAT/Process Engineer'],
    });
  }

  if ((input.comparability || []).some((c) => (c.regulatoryRiskLevel || '').toLowerCase() === 'critical')) {
    contradictions.push({
      contradictionType: 'comparability_risk',
      severity: 'critical',
      details: 'Comparability assessment indicates critical risk requiring explicit closure.',
      impactedSections: ['3.2.S.2', '3.2.P.2', '3.2.P.8'],
      requiredReviewers: ['CMC Lead', 'Regulatory Writer'],
    });
  }

  if ((input.stability || []).some((s) => (s.status || '').toLowerCase() === 'failed')) {
    contradictions.push({
      contradictionType: 'stability_failure',
      severity: 'high',
      details: 'A stability study has failed status.',
      impactedSections: ['3.2.S.7', '3.2.P.8'],
      requiredReviewers: ['Stability Scientist', 'Analytical Lead'],
    });
  }

  return contradictions;
}

export function deriveImpactTasks(contradictions: CmcContradiction[]) {
  return contradictions.map((c) => ({
    title: `Resolve ${c.contradictionType}`,
    impactedSections: c.impactedSections,
    requiredReviewers: c.requiredReviewers,
    priority: c.severity === 'critical' ? 'P0' : c.severity === 'high' ? 'P1' : 'P2',
  }));
}
