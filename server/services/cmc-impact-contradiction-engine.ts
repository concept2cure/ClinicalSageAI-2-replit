export interface CmcContradiction {
  contradictionType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
  impactedSections: string[];
  requiredReviewers: string[];
}

export function detectContradictions(input: {
  specifications?: Array<{ materialName: string; acceptanceCriteria?: Record<string, any>; testParameter?: string }>;
  methods?: Array<{ methodName: string; purpose?: string; validationStatus?: string }>;
  stability?: Array<{ studyName: string; status?: string }>;
  batch?: Array<{ batchNumber: string; disposition?: string }>;
  changeControl?: Array<{ id: string; status?: string; affectedProcess?: string }>;
  comparability?: Array<{ assessmentName: string; regulatoryRiskLevel?: string }>;
  impurityProfiles?: Array<{ impurityName: string; observedLevel?: number; specLimit?: number }>;
  dissolutionProfiles?: Array<{ condition: string; result?: string; passFail?: string }>;
  processValidation?: Array<{ processStep: string; validationStatus?: string }>;
  sectionNarrative?: string;
}): CmcContradiction[] {
  const contradictions: CmcContradiction[] = [];

  // 1. Batch rejected
  if ((input.batch || []).some((b) => (b.disposition || '').toLowerCase() === 'rejected')) {
    contradictions.push({
      contradictionType: 'batch_rejected',
      severity: 'critical',
      details: 'At least one batch is rejected while Module 3 composition may include releasable assertions.',
      impactedSections: ['3.2.P.3', '3.2.P.5'],
      requiredReviewers: ['QA/Release', 'MSAT/Process Engineer'],
    });
  }

  // 2. Comparability critical risk
  if ((input.comparability || []).some((c) => (c.regulatoryRiskLevel || '').toLowerCase() === 'critical')) {
    contradictions.push({
      contradictionType: 'comparability_risk',
      severity: 'critical',
      details: 'Comparability assessment indicates critical risk requiring explicit closure.',
      impactedSections: ['3.2.S.2', '3.2.P.2', '3.2.P.8'],
      requiredReviewers: ['CMC Lead', 'Regulatory Writer'],
    });
  }

  // 3. Stability failure
  if ((input.stability || []).some((s) => (s.status || '').toLowerCase() === 'failed')) {
    contradictions.push({
      contradictionType: 'stability_failure',
      severity: 'high',
      details: 'A stability study has failed status.',
      impactedSections: ['3.2.S.7', '3.2.P.8'],
      requiredReviewers: ['Stability Scientist', 'Analytical Lead'],
    });
  }

  // 4. Specification conflict — duplicate test parameters with conflicting acceptance criteria
  const specs = input.specifications || [];
  const specsByParam = new Map<string, Array<{ materialName: string; criteria: string }>>();
  for (const spec of specs) {
    if (spec.acceptanceCriteria) {
      for (const [param, criteria] of Object.entries(spec.acceptanceCriteria)) {
        const key = param.toLowerCase().trim();
        if (!specsByParam.has(key)) specsByParam.set(key, []);
        specsByParam.get(key)!.push({ materialName: spec.materialName, criteria: String(criteria) });
      }
    }
  }
  for (const [param, entries] of specsByParam) {
    if (entries.length > 1) {
      const uniqueCriteria = new Set(entries.map((e) => e.criteria.toLowerCase().trim()));
      if (uniqueCriteria.size > 1) {
        contradictions.push({
          contradictionType: 'specification_conflict',
          severity: 'high',
          details: `Conflicting acceptance criteria for "${param}": ${entries.map((e) => `${e.materialName}="${e.criteria}"`).join(' vs ')}`,
          impactedSections: ['3.2.S.4', '3.2.P.5'],
          requiredReviewers: ['Analytical Lead', 'QA/Specifications'],
        });
      }
    }
  }

  // 5. Method validation gap — methods without validated status referenced in specifications
  const methods = input.methods || [];
  const unvalidatedMethods = methods.filter((m) => {
    const status = (m.validationStatus || '').toLowerCase();
    return status !== 'validated' && status !== 'verified' && status !== 'transferred';
  });
  if (unvalidatedMethods.length > 0 && specs.length > 0) {
    contradictions.push({
      contradictionType: 'method_validation_gap',
      severity: 'high',
      details: `${unvalidatedMethods.length} analytical method(s) lack validated status: ${unvalidatedMethods.map((m) => m.methodName).join(', ')}. Specifications reference these methods.`,
      impactedSections: ['3.2.S.4', '3.2.P.5'],
      requiredReviewers: ['Analytical Lead', 'Method Validation Scientist'],
    });
  }

  // 6. Change control vs manufacturing process misalignment — open change controls affecting manufacturing
  const openChanges = (input.changeControl || []).filter((cc) => {
    const status = (cc.status || '').toLowerCase();
    return status !== 'closed' && status !== 'completed' && status !== 'approved';
  });
  const mfgChanges = openChanges.filter((cc) => {
    const proc = (cc.affectedProcess || '').toLowerCase();
    return proc.includes('manufactur') || proc.includes('process') || proc.includes('batch');
  });
  if (mfgChanges.length > 0) {
    contradictions.push({
      contradictionType: 'change_control_open',
      severity: 'medium',
      details: `${mfgChanges.length} open change control(s) affect the manufacturing process: ${mfgChanges.map((cc) => cc.id).join(', ')}. Module 3 manufacture sections may be inaccurate.`,
      impactedSections: ['3.2.S.2', '3.2.P.3'],
      requiredReviewers: ['MSAT/Process Engineer', 'Change Control Owner'],
    });
  }

  // 7. Impurity exceeds specification limit
  const impurities = input.impurityProfiles || [];
  const exceedingImpurities = impurities.filter((ip) =>
    ip.observedLevel !== undefined && ip.specLimit !== undefined && ip.observedLevel > ip.specLimit
  );
  if (exceedingImpurities.length > 0) {
    contradictions.push({
      contradictionType: 'impurity_exceedance',
      severity: 'critical',
      details: `${exceedingImpurities.length} impurity/ies exceed specification limit: ${exceedingImpurities.map((ip) => `${ip.impurityName} (${ip.observedLevel}% vs limit ${ip.specLimit}%)`).join('; ')}`,
      impactedSections: ['3.2.S.3', '3.2.S.4', '3.2.P.5'],
      requiredReviewers: ['Analytical Lead', 'QA/Specifications', 'Regulatory Writer'],
    });
  }

  // 8. Dissolution failure
  const dissolutionFailures = (input.dissolutionProfiles || []).filter((dp) =>
    (dp.passFail || '').toLowerCase() === 'fail'
  );
  if (dissolutionFailures.length > 0) {
    contradictions.push({
      contradictionType: 'dissolution_failure',
      severity: 'high',
      details: `${dissolutionFailures.length} dissolution test(s) failed: ${dissolutionFailures.map((dp) => dp.condition).join(', ')}`,
      impactedSections: ['3.2.P.2', '3.2.P.5'],
      requiredReviewers: ['Formulation Scientist', 'Analytical Lead'],
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
