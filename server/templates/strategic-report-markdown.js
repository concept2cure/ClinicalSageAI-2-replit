/**
 * Strategic Intelligence Report - Markdown Template Generator
 *
 * This module provides functions to convert a strategic report JSON structure
 * into a formatted Markdown document for export, sharing, or display.
 */

/**
 * Generate a Markdown document from a strategic report data object
 *
 * @param {Object} reportData - Strategic report data in JSON format
 * @returns {String} Formatted Markdown document
 */
function generateStrategicReportMarkdown(reportData) {
  let markdown = '';

  // Add title page and metadata
  markdown += generateTitleSection(reportData.metadata || {});

  // Table of contents
  markdown += `\n## Table of Contents\n\n`;
  markdown += `1. [Executive Summary](#executive-summary)\n`;
  markdown += `2. [Historical Benchmarking](#historical-benchmarking)\n`;
  markdown += `3. [Endpoint Benchmarking](#endpoint-benchmarking)\n`;
  markdown += `4. [Design Risk Prediction](#design-risk-prediction)\n`;
  markdown += `5. [Competitive Landscape](#competitive-landscape)\n`;
  markdown += `6. [AI-Powered Strategic Recommendations](#ai-powered-strategic-recommendations)\n`;
  markdown += `7. [Protocol Design Summary](#protocol-design-summary)\n`;

  // Add each section
  markdown += generateExecutiveSummarySection(reportData.executiveSummary || {});
  markdown += generateHistoricalBenchmarkingSection(reportData.historicalBenchmarking || {});
  markdown += generateEndpointBenchmarkingSection(reportData.endpointBenchmarking || {});
  markdown += generateDesignRiskPredictionSection(reportData.designRiskPrediction || {});
  markdown += generateCompetitiveLandscapeSection(reportData.competitiveLandscape || {});
  markdown += generateAiRecommendationsSection(reportData.aiRecommendations || {});
  markdown += generateProtocolDesignSummarySection(reportData.protocolDesignSummary || {});

  return markdown;
}

/**
 * Generate title section with metadata
 *
 * @param {Object} metadata - Report metadata
 * @returns {String} Markdown for title section
 */
function generateTitleSection(metadata) {
  let section = `# ${metadata.title || 'Strategic Intelligence Report'}\n\n`;

  section += `**Protocol ID:** ${metadata.protocolId || 'N/A'}  \n`;
  section += `**Indication:** ${metadata.indication || 'N/A'}  \n`;
  section += `**Phase:** ${metadata.phase || 'N/A'}  \n`;
  section += `**Sponsor:** ${metadata.sponsor || 'N/A'}  \n\n`;

  section += `*Report ID:* ${metadata.reportId || 'N/A'}  \n`;
  section += `*Generated:* ${metadata.generatedDate || 'N/A'}  \n`;
  section += `*Version:* ${metadata.version || '1.0'}  \n\n`;

  section += `**Confidentiality Level:** ${metadata.confidentialityLevel || 'Confidential'}  \n`;
  section += `*This document contains proprietary and confidential information. Any unauthorized review, use, disclosure, or distribution is prohibited.*\n\n`;

  return section;
}

/**
 * Generate executive summary section
 *
 * @param {Object} executiveSummary - Executive summary data
 * @returns {String} Markdown for executive summary section
 */
function generateExecutiveSummarySection(executiveSummary) {
  let section = `\n## Executive Summary\n\n`;

  if (executiveSummary.overview) {
    section += `${executiveSummary.overview}\n\n`;
  }

  if (executiveSummary.keyFindings && executiveSummary.keyFindings.length > 0) {
    section += `### Key Findings\n\n`;
    executiveSummary.keyFindings.forEach(finding => {
      section += `* ${finding}\n`;
    });
    section += `\n`;
  }

  if (
    executiveSummary.strategicRecommendations &&
    executiveSummary.strategicRecommendations.length > 0
  ) {
    section += `### Strategic Recommendations\n\n`;
    executiveSummary.strategicRecommendations.forEach(rec => {
      section += `* ${rec}\n`;
    });
    section += `\n`;
  }

  if (executiveSummary.decisionMatrix) {
    const matrix = executiveSummary.decisionMatrix;
    section += `### Decision Matrix\n\n`;
    section += `| Assessment Area | Evaluation |\n`;
    section += `| ---------------- | ----------- |\n`;

    if (matrix.riskAssessment) {
      section += `| Risk Assessment | ${matrix.riskAssessment} |\n`;
    }
    if (matrix.timeToMarket) {
      section += `| Time to Market | ${matrix.timeToMarket} |\n`;
    }
    if (matrix.competitivePosition) {
      section += `| Competitive Position | ${matrix.competitivePosition} |\n`;
    }
    if (matrix.regulatoryOutlook) {
      section += `| Regulatory Outlook | ${matrix.regulatoryOutlook} |\n`;
    }

    section += `\n`;
  }

  return section;
}

/**
 * Generate historical benchmarking section
 *
 * @param {Object} benchmarking - Historical benchmarking data
 * @returns {String} Markdown for historical benchmarking section
 */
function generateHistoricalBenchmarkingSection(benchmarking) {
  let section = `\n## Historical Benchmarking\n\n`;

  if (benchmarking.matchingCriteria) {
    const criteria = benchmarking.matchingCriteria;
    section += `### Matching Criteria\n\n`;
    section += `**Indication:** ${criteria.indication || 'N/A'}  \n`;
    section += `**Phase:** ${criteria.phase || 'N/A'}  \n`;

    if (criteria.additionalFilters && criteria.additionalFilters.length > 0) {
      section += `**Additional Filters:** ${criteria.additionalFilters.join(', ')}  \n`;
    }

    section += `\n`;
  }

  if (benchmarking.relevantPrecedents && benchmarking.relevantPrecedents.length > 0) {
    section += `### Relevant Trial Precedents\n\n`;
    section += `| CSR ID | Sponsor | Phase | Sample Size | Outcome |\n`;
    section += `| ------ | ------- | ----- | ----------- | ------- |\n`;

    benchmarking.relevantPrecedents.forEach(p => {
      section += `| ${p.csrId || 'N/A'} | ${p.sponsor || 'N/A'} | ${p.phase || 'N/A'} | ${p.sampleSize || 'N/A'} | ${p.outcome || 'N/A'} |\n`;
    });

    section += `\n`;
  }

  if (benchmarking.benchmarkMetrics) {
    const metrics = benchmarking.benchmarkMetrics;
    section += `### Benchmark Metrics\n\n`;

    if (metrics.medianSampleSize) {
      section += `* **Median Sample Size:** ${metrics.medianSampleSize} (Range: ${metrics.sampleSizeRange || 'N/A'})\n`;
    }
    if (metrics.medianDuration) {
      section += `* **Median Study Duration:** ${metrics.medianDuration} (Range: ${metrics.durationRange || 'N/A'})\n`;
    }
    if (metrics.successRate) {
      section += `* **Historical Success Rate:** ${metrics.successRate}%\n`;
    }
    if (metrics.averageDropoutRate) {
      section += `* **Average Dropout Rate:** ${metrics.averageDropoutRate}%\n`;
    }

    if (metrics.commonRegulatoryChallenges && metrics.commonRegulatoryChallenges.length > 0) {
      section += `\n**Common Regulatory Challenges:**\n\n`;
      metrics.commonRegulatoryChallenges.forEach(challenge => {
        section += `* ${challenge}\n`;
      });
    }

    section += `\n`;
  }

  return section;
}

/**
 * Generate endpoint benchmarking section
 *
 * @param {Object} endpoints - Endpoint benchmarking data
 * @returns {String} Markdown for endpoint benchmarking section
 */
function generateEndpointBenchmarkingSection(endpoints) {
  let section = `\n## Endpoint Benchmarking\n\n`;

  if (endpoints.primaryEndpoints && endpoints.primaryEndpoints.length > 0) {
    section += `### Primary Endpoints Analysis\n\n`;

    endpoints.primaryEndpoints.forEach(endpoint => {
      section += `#### ${endpoint.name || 'Unnamed Endpoint'}\n\n`;

      if (endpoint.frequencyScore) {
        section += `* **Usage Frequency:** ${endpoint.frequencyScore}/100\n`;
      }
      if (endpoint.successRate) {
        section += `* **Success Rate:** ${endpoint.successRate}%\n`;
      }
      if (endpoint.timeToResult) {
        section += `* **Time to Result:** ${endpoint.timeToResult}\n`;
      }
      if (endpoint.regulatoryAcceptance) {
        section += `* **Regulatory Acceptance:** ${endpoint.regulatoryAcceptance}\n`;
      }

      if (endpoint.predecessorUse && endpoint.predecessorUse.length > 0) {
        section += `\n**Examples of usage in prior studies:**\n\n`;
        endpoint.predecessorUse.forEach(pred => {
          section += `* **${pred.csrId || 'N/A'}:** ${pred.specificDefinition || 'N/A'} - Outcome: ${pred.outcome || 'N/A'}\n`;
        });
      }

      section += `\n`;
    });
  }

  if (endpoints.secondaryEndpoints && endpoints.secondaryEndpoints.length > 0) {
    section += `### Secondary Endpoints Analysis\n\n`;

    endpoints.secondaryEndpoints.forEach(endpoint => {
      section += `#### ${endpoint.name || 'Unnamed Endpoint'}\n\n`;

      if (endpoint.frequencyScore) {
        section += `* **Usage Frequency:** ${endpoint.frequencyScore}/100\n`;
      }
      if (endpoint.successRate) {
        section += `* **Success Rate:** ${endpoint.successRate}%\n`;
      }
      if (endpoint.correlationWithPrimary) {
        section += `* **Correlation with Primary:** ${endpoint.correlationWithPrimary}\n`;
      }
      if (endpoint.regulatoryValue) {
        section += `* **Regulatory Value:** ${endpoint.regulatoryValue}\n`;
      }

      section += `\n`;
    });
  }

  if (endpoints.endpointRecommendations && endpoints.endpointRecommendations.length > 0) {
    section += `### Endpoint Recommendations\n\n`;

    endpoints.endpointRecommendations.forEach((rec, i) => {
      section += `**${i + 1}. ${rec.recommendation || 'N/A'}**\n\n`;

      if (rec.confidence) {
        section += `* **Confidence:** ${rec.confidence}\n`;
      }
      if (rec.rationale) {
        section += `* **Rationale:** ${rec.rationale}\n`;
      }
      if (rec.supportingEvidence) {
        section += `* **Evidence:** ${rec.supportingEvidence}\n`;
      }

      section += `\n`;
    });
  }

  return section;
}

/**
 * Generate design risk prediction section
 *
 * @param {Object} risk - Design risk prediction data
 * @returns {String} Markdown for design risk prediction section
 */
function generateDesignRiskPredictionSection(risk) {
  let section = `\n## Design Risk Prediction\n\n`;

  if (risk.overallRiskScore) {
    section += `**Overall Risk Score:** ${risk.overallRiskScore}/100\n\n`;
  }

  if (risk.riskCategories && risk.riskCategories.length > 0) {
    section += `### Risk Categories\n\n`;
    section += `| Category | Risk Score | Key Factors |\n`;
    section += `| -------- | ---------- | ----------- |\n`;

    risk.riskCategories.forEach(cat => {
      const factors = cat.keyFactors ? cat.keyFactors.join(', ') : 'N/A';
      section += `| ${cat.category || 'N/A'} | ${cat.score || 'N/A'}/100 | ${factors} |\n`;
    });

    section += `\n`;
  }

  const sensitivity = risk.sensitivityAnalysis?.sampleSizeSensitivity;
  if (sensitivity) {
    section += `### Sample Size Sensitivity Analysis\n\n`;

    section += `**Recommended Sample Size:** ${sensitivity.recommendedSampleSize || 'N/A'}\n\n`;

    const power = sensitivity.powerAnalysisDetails;
    if (power) {
      section += `**Power Analysis Details:**\n\n`;
      if (power.effect) {
        section += `* Expected Effect Size: ${power.effect}\n`;
      }
      if (power.power) {
        section += `* Statistical Power: ${power.power}\n`;
      }
      if (power.alpha) {
        section += `* Alpha Level: ${power.alpha}\n`;
      }
      section += `\n`;
    }
  }

  const dropout = risk.sensitivityAnalysis?.dropoutRiskAnalysis;
  if (dropout) {
    section += `### Dropout Risk Analysis\n\n`;

    section += `**Predicted Dropout Rate:** ${dropout.predictedDropoutRate || 'N/A'}%\n\n`;

    if (dropout.factors && dropout.factors.length > 0) {
      section += `**Dropout Risk Factors:**\n\n`;
      dropout.factors.forEach(factor => {
        section += `* ${factor}\n`;
      });
      section += `\n`;
    }

    if (dropout.recommendations && dropout.recommendations.length > 0) {
      section += `**Recommendations to Address Dropout:**\n\n`;
      dropout.recommendations.forEach(rec => {
        section += `* ${rec}\n`;
      });
      section += `\n`;
    }
  }

  const simulation = risk.virtualTrialSimulation;
  if (simulation) {
    section += `### Virtual Trial Simulation\n\n`;

    if (simulation.summary) {
      section += `${simulation.summary}\n\n`;
    }

    const params = simulation.simulationParameters;
    if (params) {
      section += `**Simulation Parameters:**\n\n`;
      if (params.baselineSampleSize) {
        section += `* Base Sample Size: ${params.baselineSampleSize}\n`;
      }
      if (params.endpointsModeled && params.endpointsModeled.length > 0) {
        section += `* Endpoints Modeled: ${params.endpointsModeled.join(', ')}\n`;
      }
      section += `\n`;
    }

    if (simulation.outcomes && simulation.outcomes.length > 0) {
      section += `**Simulation Outcomes:**\n\n`;
      section += `| Scenario | Probability of Success | Confidence Interval |\n`;
      section += `| -------- | ---------------------- | ------------------- |\n`;

      simulation.outcomes.forEach(outcome => {
        section += `| ${outcome.scenario || 'N/A'} | ${outcome.probabilityOfSuccess || 'N/A'}% | ${outcome.confidenceInterval || 'N/A'} |\n`;
      });

      section += `\n`;
    }
  }

  return section;
}

/**
 * Generate competitive landscape section
 *
 * @param {Object} landscape - Competitive landscape data
 * @returns {String} Markdown for competitive landscape section
 */
function generateCompetitiveLandscapeSection(landscape) {
  let section = `\n## Competitive Landscape\n\n`;

  if (landscape.marketOverview) {
    section += `${landscape.marketOverview}\n\n`;
  }

  if (landscape.keyCompetitors && landscape.keyCompetitors.length > 0) {
    section += `### Key Competitors\n\n`;
    section += `| Competitor | Phase | Time to Market | Threat Level |\n`;
    section += `| ---------- | ----- | -------------- | ------------ |\n`;

    landscape.keyCompetitors.forEach(comp => {
      section += `| ${comp.name || 'N/A'} | ${comp.phase || 'N/A'} | ${comp.timeToMarket || 'N/A'} | ${comp.threatLevel || 'N/A'} |\n`;
    });

    section += `\n`;
  }

  const comparison = landscape.comparativeAnalysis;
  if (comparison) {
    section += `### Comparative Analysis\n\n`;

    if (comparison.strengthsVsCompetitors && comparison.strengthsVsCompetitors.length > 0) {
      section += `**Strengths vs. Competitors:**\n\n`;
      comparison.strengthsVsCompetitors.forEach(strength => {
        section += `* ${strength}\n`;
      });
      section += `\n`;
    }

    if (comparison.weaknessesVsCompetitors && comparison.weaknessesVsCompetitors.length > 0) {
      section += `**Weaknesses vs. Competitors:**\n\n`;
      comparison.weaknessesVsCompetitors.forEach(weakness => {
        section += `* ${weakness}\n`;
      });
      section += `\n`;
    }

    if (comparison.opportunitiesVsCompetitors && comparison.opportunitiesVsCompetitors.length > 0) {
      section += `**Opportunities vs. Competitors:**\n\n`;
      comparison.opportunitiesVsCompetitors.forEach(opp => {
        section += `* ${opp}\n`;
      });
      section += `\n`;
    }

    if (comparison.threatsVsCompetitors && comparison.threatsVsCompetitors.length > 0) {
      section += `**Threats vs. Competitors:**\n\n`;
      comparison.threatsVsCompetitors.forEach(threat => {
        section += `* ${threat}\n`;
      });
      section += `\n`;
    }
  }

  const positioning = landscape.strategicPositioning;
  if (positioning) {
    section += `### Strategic Positioning\n\n`;

    if (positioning.recommendedPositioning) {
      section += `${positioning.recommendedPositioning}\n\n`;
    }

    if (positioning.keyDifferentiators && positioning.keyDifferentiators.length > 0) {
      section += `**Key Differentiators:**\n\n`;
      positioning.keyDifferentiators.forEach(diff => {
        section += `* ${diff}\n`;
      });
      section += `\n`;
    }
  }

  return section;
}

/**
 * Generate AI recommendations section
 *
 * @param {Object} aiRecs - AI recommendations data
 * @returns {String} Markdown for AI recommendations section
 */
function generateAiRecommendationsSection(aiRecs) {
  let section = `\n## AI-Powered Strategic Recommendations\n\n`;

  if (aiRecs.designRecommendations && aiRecs.designRecommendations.length > 0) {
    section += `### Design Recommendations\n\n`;

    aiRecs.designRecommendations.forEach((rec, i) => {
      section += `#### ${i + 1}. ${rec.area || 'General'}: ${rec.recommendation || 'N/A'}\n\n`;

      if (rec.confidence) {
        section += `* **Confidence:** ${rec.confidence}\n`;
      }
      if (rec.impact) {
        section += `* **Expected Impact:** ${rec.impact}\n`;
      }
      if (rec.evidence) {
        section += `* **Supporting Evidence:** ${rec.evidence}\n`;
      }

      if (rec.implementationNotes) {
        section += `\n*Implementation Notes: ${rec.implementationNotes}*\n\n`;
      } else {
        section += `\n`;
      }
    });
  }

  const riskMitigation = aiRecs.riskMitigationStrategy;
  if (riskMitigation) {
    section += `### Risk Mitigation Strategy\n\n`;

    if (riskMitigation.keyRisks && riskMitigation.keyRisks.length > 0) {
      section += `**Key Identified Risks:**\n\n`;
      riskMitigation.keyRisks.forEach(risk => {
        section += `* ${risk}\n`;
      });
      section += `\n`;
    }

    if (riskMitigation.mitigationPlan && riskMitigation.mitigationPlan.length > 0) {
      section += `**Mitigation Plan:**\n\n`;
      section += `| Risk | Mitigation Strategy | Contingency Plan |\n`;
      section += `| ---- | ------------------- | ---------------- |\n`;

      riskMitigation.mitigationPlan.forEach(plan => {
        section += `| ${plan.risk || 'N/A'} | ${plan.mitigationStrategy || 'N/A'} | ${plan.contingencyPlan || 'N/A'} |\n`;
      });

      section += `\n`;
    }
  }

  const regulatoryStrategy = aiRecs.regulatoryStrategy;
  if (regulatoryStrategy) {
    section += `### Regulatory Strategy\n\n`;

    if (
      regulatoryStrategy.keyRegulatoryChallenges &&
      regulatoryStrategy.keyRegulatoryChallenges.length > 0
    ) {
      section += `**Key Regulatory Challenges:**\n\n`;
      regulatoryStrategy.keyRegulatoryChallenges.forEach(challenge => {
        section += `* ${challenge}\n`;
      });
      section += `\n`;
    }

    if (regulatoryStrategy.recommendedApproach) {
      section += `**Recommended Approach:** ${regulatoryStrategy.recommendedApproach}\n\n`;
    }

    if (
      regulatoryStrategy.precedentJustifications &&
      regulatoryStrategy.precedentJustifications.length > 0
    ) {
      section += `**Precedent Justifications:**\n\n`;
      regulatoryStrategy.precedentJustifications.forEach(precedent => {
        section += `* ${precedent}\n`;
      });
      section += `\n`;
    }
  }

  return section;
}

/**
 * Generate protocol design summary section
 *
 * @param {Object} design - Protocol design summary data
 * @returns {String} Markdown for protocol design summary section
 */
function generateProtocolDesignSummarySection(design) {
  let section = `\n## Protocol Design Summary\n\n`;

  const structure = design.designStructure;
  if (structure) {
    section += `### Design Structure\n\n`;

    if (structure.title) {
      section += `**Study Title:** ${structure.title}\n\n`;
    }

    if (structure.population) {
      section += `**Population:** ${structure.population}\n\n`;
    }

    const objectives = structure.objectives;
    if (objectives) {
      section += `#### Study Objectives\n\n`;

      if (objectives.primary) {
        section += `**Primary Objective:** ${objectives.primary}\n\n`;
      }

      if (objectives.secondary && objectives.secondary.length > 0) {
        section += `**Secondary Objectives:**\n\n`;
        objectives.secondary.forEach(obj => {
          section += `* ${obj}\n`;
        });
        section += `\n`;
      }
    }

    const endpoints = structure.endpoints;
    if (endpoints) {
      section += `#### Study Endpoints\n\n`;

      if (endpoints.primary) {
        section += `**Primary Endpoint:** ${endpoints.primary}\n\n`;
      }

      if (endpoints.secondary && endpoints.secondary.length > 0) {
        section += `**Secondary Endpoints:**\n\n`;
        endpoints.secondary.forEach(end => {
          section += `* ${end}\n`;
        });
        section += `\n`;
      }
    }

    if (structure.studyDesign) {
      section += `**Study Design:** ${structure.studyDesign}\n\n`;
    }

    const arms = structure.arms;
    if (arms && arms.length > 0) {
      section += `#### Study Arms\n\n`;
      section += `| Arm | Description | Size |\n`;
      section += `| --- | ----------- | ---- |\n`;

      arms.forEach(arm => {
        section += `| ${arm.name || 'N/A'} | ${arm.description || 'N/A'} | ${arm.size || 'N/A'} |\n`;
      });

      section += `\n`;
    }

    if (structure.duration) {
      section += `**Study Duration:** ${structure.duration}\n\n`;
    }

    if (structure.keyProcedures && structure.keyProcedures.length > 0) {
      section += `**Key Procedures:**\n\n`;
      structure.keyProcedures.forEach(proc => {
        section += `* ${proc}\n`;
      });
      section += `\n`;
    }
  }

  const stats = design.statisticalApproach;
  if (stats) {
    section += `### Statistical Approach\n\n`;

    if (stats.primaryAnalysis) {
      section += `* **Primary Analysis:** ${stats.primaryAnalysis}\n`;
    }
    if (stats.powerCalculations) {
      section += `* **Power Calculations:** ${stats.powerCalculations}\n`;
    }
    if (stats.interimAnalyses) {
      section += `* **Interim Analyses:** ${stats.interimAnalyses}\n`;
    }
    if (stats.multiplicityConcerns) {
      section += `* **Multiplicity Concerns:** ${stats.multiplicityConcerns}\n`;
    }

    section += `\n`;
  }

  const operational = design.operationalConsiderations;
  if (operational) {
    section += `### Operational Considerations\n\n`;

    if (operational.expectedChallenges && operational.expectedChallenges.length > 0) {
      section += `**Expected Operational Challenges:**\n\n`;
      operational.expectedChallenges.forEach(challenge => {
        section += `* ${challenge}\n`;
      });
      section += `\n`;
    }

    if (operational.mitigationStrategies && operational.mitigationStrategies.length > 0) {
      section += `**Mitigation Strategies:**\n\n`;
      operational.mitigationStrategies.forEach(strategy => {
        section += `* ${strategy}\n`;
      });
      section += `\n`;
    }

    if (operational.timelineConsiderations && operational.timelineConsiderations.length > 0) {
      section += `**Timeline Considerations:**\n\n`;
      operational.timelineConsiderations.forEach(consideration => {
        section += `* ${consideration}\n`;
      });
      section += `\n`;
    }
  }

  return section;
}

module.exports = {
  generateStrategicReportMarkdown,
};
