/**
 * Module 7 — Governed Statistical Artifact Generator
 *
 * Converts deterministic analysis + judgment into governed work product:
 * - Statistical Risk Memo
 * - Design Assumption Note
 * - Sample Size Rationale Draft
 * - SAP Section Draft
 * - Scenario Comparison Brief
 *
 * Uses existing artifact infrastructure. Content is deterministic,
 * not LLM-generated prose.
 *
 * @module server/services/biostatistics-judgment/statistical-artifact-generator
 */

import type {
  StatisticalArtifactType,
  StatisticalArtifactInput,
  GeneratedStatisticalArtifact,
  ArtifactSection,
  StudyDesignInput,
  PowerAdequacyJudgment,
  AssumptionFragility,
  EndpointMethodDefensibility,
  StatisticalRiskProfile,
  TradeoffAnalysis,
  RoleAwareInterpretation,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

export function generateStatisticalArtifact(
  artifactInput: StatisticalArtifactInput,
): GeneratedStatisticalArtifact {
  const generators: Record<StatisticalArtifactType, (input: StatisticalArtifactInput) => GeneratedStatisticalArtifact> = {
    statistical_risk_memo: generateRiskMemo,
    design_assumption_note: generateAssumptionNote,
    sample_size_rationale: generateSampleSizeRationale,
    sap_section_draft: generateSAPSectionDraft,
    scenario_comparison_brief: generateScenarioComparisonBrief,
  };

  const generator = generators[artifactInput.artifactType];
  return generator(artifactInput);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATISTICAL RISK MEMO
// ═══════════════════════════════════════════════════════════════════════════════

function generateRiskMemo(input: StatisticalArtifactInput): GeneratedStatisticalArtifact {
  const { studyInput, riskProfile, powerJudgment, fragilityJudgment, defensibilityJudgment } = input;
  const sections: ArtifactSection[] = [];

  // Executive Summary
  sections.push({
    heading: 'Executive Summary',
    content: `This memo summarizes the statistical risk assessment for the ${studyInput.studyType} ` +
      `Phase ${studyInput.phase} trial in ${studyInput.indication}. ` +
      `Overall statistical risk level: ${riskProfile.overallRiskLevel.toUpperCase()}. ` +
      `${riskProfile.criticalCount} critical and ${riskProfile.majorCount} major risk(s) identified.`,
    isStructured: false,
  });

  // Study Design Overview
  sections.push({
    heading: 'Study Design Overview',
    content: formatStudyOverview(studyInput),
    isStructured: true,
    structuredData: {
      studyType: studyInput.studyType,
      phase: studyInput.phase,
      indication: studyInput.indication,
      primaryEndpoint: studyInput.primaryEndpoint,
      endpointType: studyInput.endpointType,
      sampleSize: studyInput.computedSampleSize,
      power: studyInput.powerTarget,
      alpha: studyInput.alpha,
    },
  });

  // Power Assessment
  sections.push({
    heading: 'Power Adequacy Assessment',
    content: `Classification: ${powerJudgment.classification.toUpperCase()}\n\n` +
      `Rationale:\n${powerJudgment.rationale.map(r => `• ${r}`).join('\n')}\n\n` +
      (powerJudgment.concerns.length > 0
        ? `Concerns:\n${powerJudgment.concerns.map(c => `• ${c}`).join('\n')}\n\n`
        : '') +
      (powerJudgment.recommendedActions.length > 0
        ? `Recommended Actions:\n${powerJudgment.recommendedActions.map(a => `• ${a}`).join('\n')}`
        : ''),
    isStructured: true,
    structuredData: {
      classification: powerJudgment.classification,
      effectivePower: powerJudgment.effectivePower,
      powerGap: powerJudgment.powerGap,
    },
  });

  // Assumption Fragility
  sections.push({
    heading: 'Assumption Fragility Assessment',
    content: `Fragility Level: ${fragilityJudgment.fragilityLevel.toUpperCase()} (Score: ${fragilityJudgment.fragilityScore}/100)\n\n` +
      `Key Dependencies:\n${fragilityJudgment.keyDependencies.map(d => `• ${d}`).join('\n')}\n\n` +
      `Likely Failure Modes:\n${fragilityJudgment.likelyFailureModes.map(m => `• ${m}`).join('\n')}\n\n` +
      fragilityJudgment.overallAssessment,
    isStructured: true,
    structuredData: {
      fragilityLevel: fragilityJudgment.fragilityLevel,
      fragilityScore: fragilityJudgment.fragilityScore,
      sensitivityFactorCount: fragilityJudgment.sensitivityFactors.length,
    },
  });

  // Risk Register
  sections.push({
    heading: 'Statistical Risk Register',
    content: riskProfile.risks.length > 0
      ? riskProfile.risks.map(r =>
          `[${r.severity.toUpperCase()}] ${r.riskType.replace(/_/g, ' ')}\n` +
          `  Description: ${r.description}\n` +
          `  Mitigation: ${r.mitigation}\n` +
          `  Regulatory: ${r.regulatoryImplication}`
        ).join('\n\n')
      : 'No significant statistical risks identified.',
    isStructured: true,
    structuredData: {
      totalRisks: riskProfile.risks.length,
      criticalCount: riskProfile.criticalCount,
      majorCount: riskProfile.majorCount,
      overallLevel: riskProfile.overallRiskLevel,
    },
  });

  // Endpoint-Method Assessment
  sections.push({
    heading: 'Endpoint-Method Defensibility',
    content: `Rating: ${defensibilityJudgment.rating.replace(/_/g, ' ').toUpperCase()}\n\n` +
      `${defensibilityJudgment.endpointAssessment}\n` +
      `${defensibilityJudgment.methodAssessment}\n` +
      `${defensibilityJudgment.pairingAssessment}\n\n` +
      (defensibilityJudgment.caveats.length > 0
        ? `Caveats:\n${defensibilityJudgment.caveats.map(c => `• ${c}`).join('\n')}\n\n`
        : '') +
      (defensibilityJudgment.regulatoryConsiderations.length > 0
        ? `Regulatory Considerations:\n${defensibilityJudgment.regulatoryConsiderations.map(r => `• ${r}`).join('\n')}`
        : ''),
    isStructured: false,
  });

  // Recommendations
  sections.push({
    heading: 'Recommendations',
    content: riskProfile.summary + '\n\n' +
      powerJudgment.recommendedActions.map(a => `• ${a}`).join('\n'),
    isStructured: false,
  });

  return {
    artifactType: 'statistical_risk_memo',
    title: `Statistical Risk Memo — ${studyInput.indication} Phase ${studyInput.phase}`,
    sections,
    metadata: {
      projectId: input.projectId,
      generatedAt: input.generatedAt,
      generatedBy: input.generatedBy,
      provenance: 'ana_biostatistics_judgment',
      version: '1.0',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN ASSUMPTION NOTE
// ═══════════════════════════════════════════════════════════════════════════════

function generateAssumptionNote(input: StatisticalArtifactInput): GeneratedStatisticalArtifact {
  const { studyInput, fragilityJudgment, powerJudgment } = input;
  const sections: ArtifactSection[] = [];

  sections.push({
    heading: 'Purpose',
    content: `This note documents the key statistical assumptions underlying the ${studyInput.studyType} ` +
      `Phase ${studyInput.phase} trial design in ${studyInput.indication}, their basis, ` +
      `and their sensitivity to deviation.`,
    isStructured: false,
  });

  // Assumptions table
  const assumptions: Record<string, string> = {
    'Effect Size': `${studyInput.effectSizeAssumption}${studyInput.effectSizeUnit ? ' ' + studyInput.effectSizeUnit : ''}`,
    'Alpha (Type I Error)': `${studyInput.alpha} (two-sided)`,
    'Power Target': `${(studyInput.powerTarget * 100).toFixed(0)}%`,
    'Allocation Ratio': `${studyInput.allocationRatio}:1`,
    'Attrition Rate': `${(studyInput.attritionAssumption * 100).toFixed(0)}%`,
    'Sample Size': `${studyInput.computedSampleSize} total`,
  };
  if (studyInput.variance) assumptions['Variance/SD'] = `${studyInput.variance}`;
  if (studyInput.controlRate) assumptions['Control Rate'] = `${(studyInput.controlRate * 100).toFixed(1)}%`;
  if (studyInput.treatmentRate) assumptions['Treatment Rate'] = `${(studyInput.treatmentRate * 100).toFixed(1)}%`;
  if (studyInput.hazardRatio) assumptions['Hazard Ratio'] = `${studyInput.hazardRatio}`;
  if (studyInput.nonInferiorityMargin) assumptions['Non-Inferiority Margin'] = `${studyInput.nonInferiorityMargin}`;

  sections.push({
    heading: 'Key Assumptions',
    content: Object.entries(assumptions).map(([k, v]) => `${k}: ${v}`).join('\n'),
    isStructured: true,
    structuredData: assumptions,
  });

  // Sensitivity Analysis
  sections.push({
    heading: 'Sensitivity Assessment',
    content: `Fragility Level: ${fragilityJudgment.fragilityLevel.toUpperCase()} (Score: ${fragilityJudgment.fragilityScore}/100)\n\n` +
      `Sensitivity Factors:\n` +
      fragilityJudgment.sensitivityFactors.map(f =>
        `• ${f.parameter}: ${f.description} [Impact: ${f.impact}]`
      ).join('\n'),
    isStructured: true,
    structuredData: {
      fragilityLevel: fragilityJudgment.fragilityLevel,
      fragilityScore: fragilityJudgment.fragilityScore,
      factorCount: fragilityJudgment.sensitivityFactors.length,
    },
  });

  // Dependencies
  sections.push({
    heading: 'Critical Dependencies',
    content: fragilityJudgment.keyDependencies.map(d => `• ${d}`).join('\n') +
      '\n\n' + fragilityJudgment.overallAssessment,
    isStructured: false,
  });

  return {
    artifactType: 'design_assumption_note',
    title: `Design Assumption Note — ${studyInput.indication} Phase ${studyInput.phase}`,
    sections,
    metadata: {
      projectId: input.projectId,
      generatedAt: input.generatedAt,
      generatedBy: input.generatedBy,
      provenance: 'ana_biostatistics_judgment',
      version: '1.0',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAMPLE SIZE RATIONALE
// ═══════════════════════════════════════════════════════════════════════════════

function generateSampleSizeRationale(input: StatisticalArtifactInput): GeneratedStatisticalArtifact {
  const { studyInput, powerJudgment, fragilityJudgment } = input;
  const sections: ArtifactSection[] = [];

  sections.push({
    heading: 'Sample Size Determination',
    content: `The sample size for this ${studyInput.studyType} Phase ${studyInput.phase} trial ` +
      `was determined based on the primary endpoint (${studyInput.primaryEndpoint}, ${studyInput.endpointType}) ` +
      `using ${studyInput.statisticalMethod} analysis.\n\n` +
      `A total of ${studyInput.computedSampleSize} participants ` +
      `(${studyInput.allocationRatio}:1 randomization ratio) are planned, ` +
      `providing ${(studyInput.powerTarget * 100).toFixed(0)}% power at a ` +
      `two-sided significance level of ${studyInput.alpha}.`,
    isStructured: false,
  });

  // Assumptions
  const assumptionLines: string[] = [
    `Effect size: ${studyInput.effectSizeAssumption}${studyInput.effectSizeUnit ? ' ' + studyInput.effectSizeUnit : ''}`,
    `Significance level: ${studyInput.alpha} (two-sided)`,
    `Power: ${(studyInput.powerTarget * 100).toFixed(0)}%`,
    `Allocation ratio: ${studyInput.allocationRatio}:1`,
  ];
  if (studyInput.variance) assumptionLines.push(`Standard deviation: ${Math.sqrt(studyInput.variance).toFixed(3)}`);
  if (studyInput.controlRate) assumptionLines.push(`Control rate: ${(studyInput.controlRate * 100).toFixed(1)}%`);
  if (studyInput.hazardRatio) assumptionLines.push(`Hazard ratio: ${studyInput.hazardRatio}`);

  sections.push({
    heading: 'Statistical Assumptions',
    content: assumptionLines.join('\n'),
    isStructured: true,
    structuredData: {
      effectSize: studyInput.effectSizeAssumption,
      alpha: studyInput.alpha,
      power: studyInput.powerTarget,
      allocationRatio: studyInput.allocationRatio,
    },
  });

  // Dropout adjustment
  if (studyInput.attritionAssumption > 0) {
    sections.push({
      heading: 'Dropout Adjustment',
      content: `An anticipated dropout rate of ${(studyInput.attritionAssumption * 100).toFixed(0)}% ` +
        `has been incorporated into the sample size. The sample size has been inflated accordingly ` +
        `to ensure adequate evaluable participants for the primary analysis.`,
      isStructured: false,
    });
  }

  // Power adequacy assessment
  sections.push({
    heading: 'Power Adequacy Assessment',
    content: `Power classification: ${powerJudgment.classification}\n\n` +
      powerJudgment.rationale.join('\n') +
      (powerJudgment.concerns.length > 0
        ? `\n\nConsiderations:\n${powerJudgment.concerns.map(c => `• ${c}`).join('\n')}`
        : ''),
    isStructured: false,
  });

  // Sensitivity
  if (fragilityJudgment.fragilityLevel !== 'low') {
    sections.push({
      heading: 'Sensitivity Considerations',
      content: `Assumption fragility: ${fragilityJudgment.fragilityLevel}\n\n` +
        fragilityJudgment.overallAssessment,
      isStructured: false,
    });
  }

  return {
    artifactType: 'sample_size_rationale',
    title: `Sample Size Rationale — ${studyInput.indication} Phase ${studyInput.phase}`,
    sections,
    metadata: {
      projectId: input.projectId,
      generatedAt: input.generatedAt,
      generatedBy: input.generatedBy,
      provenance: 'ana_biostatistics_judgment',
      version: '1.0',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAP SECTION DRAFT
// ═══════════════════════════════════════════════════════════════════════════════

function generateSAPSectionDraft(input: StatisticalArtifactInput): GeneratedStatisticalArtifact {
  const { studyInput, defensibilityJudgment, riskProfile } = input;
  const sections: ArtifactSection[] = [];

  // Primary Analysis
  sections.push({
    heading: 'Primary Analysis Method',
    content: `The primary endpoint (${studyInput.primaryEndpoint}) will be analyzed using ` +
      `${studyInput.statisticalMethod}. The analysis will be performed at the ` +
      `${studyInput.alpha} significance level (two-sided).\n\n` +
      `Endpoint type: ${studyInput.endpointType}\n` +
      `Study design: ${studyInput.studyType}\n\n` +
      `Method justification: ${defensibilityJudgment.methodAssessment}`,
    isStructured: false,
  });

  // Sample Size
  sections.push({
    heading: 'Sample Size',
    content: `A total of ${studyInput.computedSampleSize} participants will be randomized ` +
      `(${studyInput.allocationRatio}:1 ratio). This provides ${(studyInput.powerTarget * 100).toFixed(0)}% ` +
      `power to detect a treatment effect of ${studyInput.effectSizeAssumption}` +
      `${studyInput.effectSizeUnit ? ' ' + studyInput.effectSizeUnit : ''} ` +
      `at alpha=${studyInput.alpha} (two-sided).` +
      (studyInput.attritionAssumption > 0
        ? ` The sample size includes inflation for an anticipated ${(studyInput.attritionAssumption * 100).toFixed(0)}% dropout rate.`
        : ''),
    isStructured: false,
  });

  // Missing Data
  if (studyInput.missingDataMethod) {
    sections.push({
      heading: 'Missing Data Handling',
      content: `Missing data will be handled using ${studyInput.missingDataMethod}. ` +
        `Sensitivity analyses will be conducted to assess the robustness of the primary analysis ` +
        `to missing data assumptions.`,
      isStructured: false,
    });
  }

  // Multiplicity
  if (studyInput.multiplicityAdjustment) {
    sections.push({
      heading: 'Multiplicity Adjustment',
      content: `Multiplicity adjustment: ${studyInput.multiplicityAdjustment}.\n` +
        `The overall Type I error rate will be controlled at ${studyInput.alpha} (two-sided).`,
      isStructured: false,
    });
  }

  // Interim Analysis
  if (studyInput.interimAnalyses && studyInput.interimAnalyses > 0) {
    sections.push({
      heading: 'Interim Analysis',
      content: `${studyInput.interimAnalyses} interim analysis/analyses planned. ` +
        `Alpha spending will be controlled using appropriate boundaries.`,
      isStructured: false,
    });
  }

  // Statistical considerations
  if (defensibilityJudgment.caveats.length > 0 || defensibilityJudgment.regulatoryConsiderations.length > 0) {
    sections.push({
      heading: 'Statistical Considerations',
      content: [...defensibilityJudgment.caveats, ...defensibilityJudgment.regulatoryConsiderations]
        .map(c => `• ${c}`).join('\n'),
      isStructured: false,
    });
  }

  return {
    artifactType: 'sap_section_draft',
    title: `SAP Section Draft — ${studyInput.indication} Phase ${studyInput.phase}`,
    sections,
    metadata: {
      projectId: input.projectId,
      generatedAt: input.generatedAt,
      generatedBy: input.generatedBy,
      provenance: 'ana_biostatistics_judgment',
      version: '1.0',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO COMPARISON BRIEF
// ═══════════════════════════════════════════════════════════════════════════════

function generateScenarioComparisonBrief(input: StatisticalArtifactInput): GeneratedStatisticalArtifact {
  const { studyInput, tradeoffAnalysis, powerJudgment, riskProfile } = input;
  const sections: ArtifactSection[] = [];

  sections.push({
    heading: 'Current Design Summary',
    content: formatStudyOverview(studyInput) + '\n\n' +
      `Power: ${powerJudgment.classification} | Risk: ${riskProfile.overallRiskLevel}`,
    isStructured: true,
    structuredData: {
      sampleSize: studyInput.computedSampleSize,
      power: studyInput.powerTarget,
      effectSize: studyInput.effectSizeAssumption,
      riskLevel: riskProfile.overallRiskLevel,
    },
  });

  if (tradeoffAnalysis) {
    for (const tradeoff of tradeoffAnalysis.tradeoffs) {
      sections.push({
        heading: `Tradeoff: ${tradeoff.dimension}`,
        content: `Current: ${tradeoff.currentChoice}\n` +
          `Alternative: ${tradeoff.alternative}\n\n` +
          `What improves:\n${tradeoff.whatImproves.map(w => `  ✓ ${w}`).join('\n')}\n\n` +
          `What becomes harder:\n${tradeoff.whatWorses.map(w => `  ✗ ${w}`).join('\n')}\n\n` +
          `Assessment: ${tradeoff.netAssessment}\n` +
          `Recommendation: ${tradeoff.recommendation}`,
        isStructured: true,
        structuredData: {
          dimension: tradeoff.dimension,
          netAssessment: tradeoff.netAssessment,
        },
      });
    }

    sections.push({
      heading: 'Safest Path Forward',
      content: tradeoffAnalysis.safestPath,
      isStructured: false,
    });

    sections.push({
      heading: 'Overall Guidance',
      content: tradeoffAnalysis.overallGuidance,
      isStructured: false,
    });
  }

  return {
    artifactType: 'scenario_comparison_brief',
    title: `Scenario Comparison Brief — ${studyInput.indication} Phase ${studyInput.phase}`,
    sections,
    metadata: {
      projectId: input.projectId,
      generatedAt: input.generatedAt,
      generatedBy: input.generatedBy,
      provenance: 'ana_biostatistics_judgment',
      version: '1.0',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatStudyOverview(input: StudyDesignInput): string {
  return [
    `Study Type: ${input.studyType}`,
    `Phase: ${input.phase}`,
    `Indication: ${input.indication}`,
    `Primary Endpoint: ${input.primaryEndpoint} (${input.endpointType})`,
    `Statistical Method: ${input.statisticalMethod}`,
    `Sample Size: ${input.computedSampleSize}`,
    `Power Target: ${(input.powerTarget * 100).toFixed(0)}%`,
    `Alpha: ${input.alpha}`,
    `Effect Size: ${input.effectSizeAssumption}${input.effectSizeUnit ? ' ' + input.effectSizeUnit : ''}`,
    `Allocation: ${input.allocationRatio}:1`,
    `Attrition: ${(input.attritionAssumption * 100).toFixed(0)}%`,
  ].join('\n');
}
