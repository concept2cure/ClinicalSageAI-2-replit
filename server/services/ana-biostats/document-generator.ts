/**
 * AnA Biostats — Layer 6: Governed Statistical Documents
 *
 * Creates governed, project-bound statistical artifacts with full provenance.
 * Every document preserves deterministic assumptions/results, includes
 * confidence/limitations, and is designed to land in the existing editor/canvas.
 *
 * Document types:
 * 1. Sample Size Rationale Draft
 * 2. Statistical Risk Memo
 * 3. Design Assumption Note
 * 4. SAP Section Draft
 * 5. Scenario Comparison Brief
 * 6. Statistical Reviewer Response Support
 * 7. Protocol Statistical Section Draft
 * 8. Submission-Support Statistical Note
 */

import type {
  StatisticalInput,
  ComputationResult,
  JudgmentResult,
  DomainAdaptation,
  RegulatoryCustomization,
  GovernedStatisticalDocument,
  DocumentProvenance,
  DocumentMetadata,
  StatisticalDocumentType,
} from './types';

const ENGINE_VERSION = '1.0.0';

export class DocumentGenerator {

  generate(
    type: StatisticalDocumentType,
    input: StatisticalInput,
    computation: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation,
    regulatory: RegulatoryCustomization | undefined,
    meta: { projectId: number; organizationId: number; userId: number }
  ): GovernedStatisticalDocument {
    const provenance = this.buildProvenance(input, computation, judgment, domain, regulatory);
    const metadata = this.buildMetadata(input, meta);

    const content = this.generateContent(type, input, computation, judgment, domain, regulatory);
    const title = this.generateTitle(type, input);

    return {
      type,
      title,
      content,
      projectId: meta.projectId,
      organizationId: meta.organizationId,
      createdBy: meta.userId,
      version: 1,
      status: 'draft',
      provenance,
      metadata,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Content generation by type
  // ════════════════════════════════════════════════════════════════

  private generateContent(
    type: StatisticalDocumentType,
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation,
    regulatory?: RegulatoryCustomization
  ): string {
    switch (type) {
      case 'sample_size_rationale':
        return this.generateSampleSizeRationale(input, comp, judgment, domain, regulatory);
      case 'statistical_risk_memo':
        return this.generateStatisticalRiskMemo(input, comp, judgment, domain, regulatory);
      case 'design_assumption_note':
        return this.generateDesignAssumptionNote(input, comp, judgment, domain);
      case 'sap_section_draft':
        return this.generateSAPSectionDraft(input, comp, judgment, domain, regulatory);
      case 'scenario_comparison_brief':
        return this.generateScenarioComparisonBrief(input, comp, judgment, domain);
      case 'statistical_reviewer_response':
        return this.generateReviewerResponseSupport(input, comp, judgment, domain, regulatory);
      case 'protocol_statistical_section':
        return this.generateProtocolStatisticalSection(input, comp, judgment, domain, regulatory);
      case 'submission_statistical_note':
        return this.generateSubmissionStatisticalNote(input, comp, judgment, domain, regulatory);
      case 'full_statistical_analysis_plan':
        return this.generateFullStatisticalAnalysisPlan(input, comp, judgment, domain, regulatory);
      case 'interim_analysis_plan':
        return this.generateInterimAnalysisPlan(input, comp, judgment, domain, regulatory);
      case 'dsmb_charter':
        return this.generateDsmbCharter(input, comp, judgment, domain, regulatory);
      case 'statistical_methods_section':
        return this.generateStatisticalMethodsSection(input, comp, judgment, domain, regulatory);
      case 'tlf_shell_plan':
        return this.generateTlfShellPlan(input, comp, judgment, domain);
      case 'randomization_plan':
        return this.generateRandomizationPlan(input, comp, judgment, domain);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // 1. Sample Size Rationale
  // ────────────────────────────────────────────────────────────────

  private generateSampleSizeRationale(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation,
    regulatory?: RegulatoryCustomization
  ): string {
    const n = comp.adjustedTotal ?? comp.sampleSize.total;
    const trackLabel = this.trackLabel(input.clientTrack);
    const bodyLabel = regulatory?.body ?? 'FDA';
    const fragLabel = judgment.fragility.category;

    let content = `# Sample Size Rationale\n\n`;
    content += `## Study Context\n`;
    content += `- **Track**: ${trackLabel}\n`;
    content += `- **Study Type**: ${input.studyType}\n`;
    content += `- **Endpoint Type**: ${input.endpointType}\n`;
    content += `- **Objective**: ${input.objectiveType}\n`;
    if (input.indication) content += `- **Indication**: ${input.indication}\n`;
    if (input.phase) content += `- **Phase**: ${input.phase}\n`;
    content += `- **Target Regulatory Body**: ${bodyLabel}\n\n`;

    content += `## Sample Size Determination\n\n`;
    content += `### Statistical Method\n`;
    content += `${comp.method}\n\n`;
    content += `### Formula\n`;
    content += `${comp.formula}\n\n`;

    content += `### Assumptions\n\n`;
    content += `| Parameter | Value | Source | Sensitivity |\n`;
    content += `|-----------|-------|--------|-------------|\n`;
    for (const a of comp.assumptions) {
      content += `| ${a.parameter} | ${a.value} | ${a.source} | ${a.sensitivity} |\n`;
    }
    content += `\n`;

    content += `### Result\n\n`;
    content += `- **Sample size per group**: ${comp.sampleSize.perGroup}\n`;
    content += `- **Number of groups**: ${comp.sampleSize.groups}\n`;
    content += `- **Total (unadjusted)**: ${comp.sampleSize.total}\n`;
    content += `- **Dropout adjustment**: ${(input.attritionRate * 100).toFixed(0)}%\n`;
    content += `- **Total (adjusted)**: ${n}\n`;
    content += `- **Achieved power**: ${(comp.power * 100).toFixed(1)}%\n`;
    content += `- **Significance level**: ${input.alpha} (two-sided)\n\n`;

    if (comp.diagnosticMetrics) {
      content += `### Diagnostic Performance\n\n`;
      content += `- **Sensitivity**: ${(comp.diagnosticMetrics.sensitivity * 100).toFixed(1)}%\n`;
      content += `- **Specificity**: ${(comp.diagnosticMetrics.specificity * 100).toFixed(1)}%\n`;
      if (comp.diagnosticMetrics.ppv) content += `- **PPV**: ${(comp.diagnosticMetrics.ppv * 100).toFixed(1)}%\n`;
      if (comp.diagnosticMetrics.npv) content += `- **NPV**: ${(comp.diagnosticMetrics.npv * 100).toFixed(1)}%\n`;
      content += `\n`;
    }

    // Scenario table
    if (comp.scenarios && comp.scenarios.length > 0) {
      content += `### Scenario Analysis\n\n`;
      content += `| Scenario | Sample Size (total) | Power | Notes |\n`;
      content += `|----------|-------------------|-------|-------|\n`;
      for (const s of comp.scenarios) {
        content += `| ${s.label} | ${s.sampleSize.total} | ${(s.power * 100).toFixed(0)}% | ${s.delta} |\n`;
      }
      content += `\n`;
    }

    // Judgment summary
    content += `## Statistical Assessment\n\n`;
    content += `- **Overall Verdict**: ${judgment.overallVerdict}\n`;
    content += `- **Action Recommendation**: ${judgment.actionRecommendation}\n`;
    content += `- **Fragility**: ${fragLabel} (index: ${judgment.fragility.fragilityIndex})\n`;
    content += `- **Confidence Level**: ${judgment.confidence.level} (${judgment.confidence.score}/100)\n\n`;

    if (judgment.fragility.sensitiveParameters.length > 0) {
      content += `### Sensitivity Points\n\n`;
      for (const sp of judgment.fragility.sensitiveParameters) {
        content += `- **${sp.parameter}**: current=${sp.currentValue}, breakpoint=${sp.breakpointValue} (${sp.percentMargin}% margin)\n`;
      }
      content += `\n`;
    }

    // Limitations
    if (judgment.confidence.limitations.length > 0) {
      content += `## Limitations\n\n`;
      for (const lim of judgment.confidence.limitations) {
        content += `- ${lim}\n`;
      }
      content += `\n`;
    }

    // Regulatory notes
    if (regulatory && regulatory.statisticalExpectations.length > 0) {
      content += `## Regulatory Considerations (${bodyLabel})\n\n`;
      for (const exp of regulatory.statisticalExpectations.slice(0, 5)) {
        content += `- ${exp}\n`;
      }
      content += `\n`;
    }

    content += this.provenanceFooter();
    return content;
  }

  // ────────────────────────────────────────────────────────────────
  // 2. Statistical Risk Memo
  // ────────────────────────────────────────────────────────────────

  private generateStatisticalRiskMemo(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation,
    regulatory?: RegulatoryCustomization
  ): string {
    let content = `# Statistical Risk Memo\n\n`;
    content += `## Executive Summary\n\n`;
    content += `${judgment.roleExplanations.executive}\n\n`;

    content += `## Risk Classification\n\n`;
    content += `- **Overall Risk**: ${judgment.overallRisk}\n`;
    content += `- **Action**: ${judgment.actionRecommendation}\n`;
    content += `- **Confidence**: ${judgment.confidence.level}\n\n`;

    content += `## Dimension Analysis\n\n`;
    content += `| Dimension | Verdict | Score | Key Flags |\n`;
    content += `|-----------|---------|-------|-----------|\n`;
    for (const dim of judgment.dimensions) {
      content += `| ${dim.name} | ${dim.verdict} | ${dim.score}/100 | ${dim.flags.join('; ') || 'None'} |\n`;
    }
    content += `\n`;

    content += `## Fragility Assessment\n\n`;
    content += `${judgment.fragility.narrative}\n\n`;

    content += `## Endpoint-Method Fit\n\n`;
    content += `- **Fit**: ${judgment.endpointMethodFit.fit}\n`;
    content += `- **Current Method**: ${judgment.endpointMethodFit.currentMethod}\n`;
    content += `- **Suggested Method**: ${judgment.endpointMethodFit.suggestedMethod}\n`;
    content += `- **Rationale**: ${judgment.endpointMethodFit.rationale}\n\n`;

    if (judgment.escalationReasons.length > 0) {
      content += `## Escalation Items\n\n`;
      for (const reason of judgment.escalationReasons) {
        content += `- ⚠ ${reason}\n`;
      }
      content += `\n`;
    }

    // Domain-specific risk factors
    if (domain.riskFactors.length > 0) {
      content += `## Domain-Specific Risks (${this.trackLabel(input.clientTrack)})\n\n`;
      for (const rf of domain.riskFactors) {
        content += `- ${rf}\n`;
      }
      content += `\n`;
    }

    // Regulatory risk framing
    if (regulatory && regulatory.riskFramingNotes.length > 0) {
      content += `## Regulatory Risk Framing (${regulatory.body})\n\n`;
      for (const note of regulatory.riskFramingNotes) {
        content += `- ${note}\n`;
      }
      content += `\n`;
    }

    content += `## Role-Specific Interpretations\n\n`;
    content += `### For Clinical Team\n${judgment.roleExplanations.clinical}\n\n`;
    content += `### For Regulatory Affairs\n${judgment.roleExplanations.regulatory}\n\n`;
    content += `### For Biostatistics\n${judgment.roleExplanations.technical}\n\n`;

    content += this.provenanceFooter();
    return content;
  }

  // ────────────────────────────────────────────────────────────────
  // 3. Design Assumption Note
  // ────────────────────────────────────────────────────────────────

  private generateDesignAssumptionNote(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation
  ): string {
    let content = `# Design Assumption Note\n\n`;
    content += `## Purpose\n`;
    content += `This note documents the statistical assumptions underlying the study design and their sensitivity to change.\n\n`;

    content += `## Assumptions\n\n`;
    content += `| Parameter | Value | Source | Sensitivity | Breakpoint |\n`;
    content += `|-----------|-------|--------|-------------|------------|\n`;
    for (const a of comp.assumptions) {
      const sp = judgment.fragility.sensitiveParameters.find(p => p.parameter === a.parameter);
      content += `| ${a.parameter} | ${a.value} | ${a.source} | ${a.sensitivity} | ${sp ? sp.breakpointValue : 'N/A'} |\n`;
    }
    content += `\n`;

    content += `## Fragility Analysis\n\n`;
    content += `${judgment.fragility.narrative}\n\n`;

    if (judgment.fragility.sensitiveParameters.length > 0) {
      content += `### Critical Parameters\n\n`;
      for (const sp of judgment.fragility.sensitiveParameters) {
        content += `- **${sp.parameter}**: ${sp.percentMargin}% margin before power drops below threshold (current: ${sp.currentValue}, breakpoint: ${sp.breakpointValue})\n`;
      }
      content += `\n`;
    }

    content += `## Design Considerations\n\n`;
    for (const dc of domain.designConsiderations) {
      content += `- ${dc}\n`;
    }
    content += `\n`;

    content += `## Recommendations\n\n`;
    if (judgment.actionRecommendation === 'proceed') {
      content += `Assumptions are adequate for proceeding. Monitor key parameters during conduct.\n`;
    } else if (judgment.actionRecommendation === 'proceed_with_conditions') {
      content += `Proceed with the following conditions:\n`;
      for (const lim of judgment.confidence.limitations) {
        content += `- Address: ${lim}\n`;
      }
    } else {
      content += `Revision recommended before proceeding. Key concerns:\n`;
      for (const reason of judgment.escalationReasons) {
        content += `- ${reason}\n`;
      }
    }

    content += `\n`;
    content += this.provenanceFooter();
    return content;
  }

  // ────────────────────────────────────────────────────────────────
  // 4. SAP Section Draft
  // ────────────────────────────────────────────────────────────────

  private generateSAPSectionDraft(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation,
    regulatory?: RegulatoryCustomization
  ): string {
    const bodyLabel = regulatory?.body ?? 'FDA';
    let content = `# Statistical Analysis Plan — Section Draft\n\n`;

    content += `## 1. Study Objectives and Endpoints\n\n`;
    content += `### Primary Objective\n`;
    content += `${input.objectiveType} assessment using ${input.endpointType} endpoint.\n\n`;
    content += `### Primary Endpoint\n`;
    content += `Type: ${input.endpointType}. Study type: ${input.studyType}.\n\n`;

    content += `## 2. Study Design\n\n`;
    content += `- Design: ${input.studyType}\n`;
    content += `- Groups: ${input.numberOfGroups ?? 2}\n`;
    content += `- Allocation ratio: ${input.allocationRatio}:1\n`;
    content += `- Comparator: ${input.comparatorType ?? 'placebo'}\n\n`;

    content += `## 3. Sample Size Determination\n\n`;
    content += `A sample size of ${comp.adjustedTotal ?? comp.sampleSize.total} subjects (${comp.sampleSize.perGroup} per group) provides ${(comp.power * 100).toFixed(1)}% power to detect a ${input.effectSize} ${input.endpointType === 'binary' ? 'difference in proportions' : input.endpointType === 'time_to_event' ? 'hazard ratio reduction' : 'effect size'} at a two-sided significance level of ${input.alpha}.\n\n`;
    content += `${comp.formula}\n\n`;
    content += `An attrition rate of ${(input.attritionRate * 100).toFixed(0)}% is assumed, yielding an adjusted total of ${comp.adjustedTotal ?? comp.sampleSize.total} subjects.\n\n`;

    content += `## 4. Statistical Methods\n\n`;
    content += `### Primary Analysis\n`;
    content += `${comp.method}\n\n`;
    content += `### Endpoint-Method Assessment\n`;
    content += `${judgment.endpointMethodFit.rationale}\n\n`;

    if (judgment.endpointMethodFit.alternatives.length > 0) {
      content += `### Alternative Methods\n`;
      for (const alt of judgment.endpointMethodFit.alternatives) {
        content += `- ${alt}\n`;
      }
      content += `\n`;
    }

    content += `## 5. Significance Level and Multiplicity\n\n`;
    content += `Two-sided significance level: α = ${input.alpha}.\n\n`;
    if (comp.multiplicityResult && comp.multiplicityResult.endpointCount > 1) {
      content += `### Multiplicity Adjustment\n`;
      content += `${comp.multiplicityResult.recommendation}\n\n`;
      content += `| Endpoint | Adjusted Alpha |\n|----------|---------------|\n`;
      comp.multiplicityResult.adjustedAlphas.forEach((a, i) => {
        content += `| Endpoint ${i + 1} | ${a.toFixed(4)} |\n`;
      });
      content += `\nFamily-wise error rate controlled at α = ${input.alpha}.\n\n`;
    }

    content += `## 6. Estimand Framework\n\n`;
    if (input.estimandStrategy) {
      content += `### Estimand Strategy: ${input.estimandStrategy}\n\n`;
      content += `Per ICH E9(R1), the estimand is defined by:\n`;
      content += `- **Population**: [Study-specific]\n`;
      content += `- **Variable**: ${input.endpointType} endpoint\n`;
      content += `- **Intercurrent event handling**: ${input.estimandStrategy}\n`;
      content += `- **Summary measure**: [Study-specific]\n\n`;
    } else {
      content += `Estimand framework should be defined per ICH E9(R1) prior to study conduct.\n\n`;
    }

    content += `## 7. Missing Data Handling\n\n`;
    if (input.missingDataMethod) {
      content += `### Primary Approach: ${input.missingDataMethod}\n\n`;
      if (comp.missingDataImpact) {
        content += `Expected missing data rate: ${(comp.missingDataImpact.expectedMissingRate * 100).toFixed(0)}%.\n`;
        content += `Effective sample size after missing data: ${comp.missingDataImpact.effectiveSampleSize}.\n`;
        content += `Estimated power after missing data: ${(comp.missingDataImpact.adjustedPower * 100).toFixed(1)}%.\n`;
        content += `Bias risk: ${comp.missingDataImpact.biasRisk}.\n\n`;
        content += `${comp.missingDataImpact.recommendation}\n\n`;
      }
    } else {
      content += `Missing data handling method should be pre-specified in the SAP. Consider MMRM for longitudinal endpoints or multiple imputation for general missing data patterns.\n\n`;
    }

    content += `## 8. Sensitivity Analyses\n\n`;
    content += `The following sensitivity analyses are recommended:\n`;
    content += `- Tipping point analysis for missing data assumptions\n`;
    content += `- Alternative population analysis (ITT vs. PP)\n`;
    if (judgment.fragility.category !== 'robust') {
      content += `- Sensitivity to effect size assumption (fragility index: ${judgment.fragility.fragilityIndex})\n`;
    }
    if (input.estimandStrategy) {
      content += `- Alternative intercurrent event handling strategies\n`;
    }
    content += `\n`;

    if (input.interimAnalyses && input.interimAnalyses > 0) {
      content += `## 8. Interim Analyses\n\n`;
      content += `${input.interimAnalyses} planned interim ${input.interimAnalyses === 1 ? 'analysis' : 'analyses'} with pre-specified alpha spending function.\n\n`;
    }

    content += this.provenanceFooter();
    return content;
  }

  // ────────────────────────────────────────────────────────────────
  // 5. Scenario Comparison Brief
  // ────────────────────────────────────────────────────────────────

  private generateScenarioComparisonBrief(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation
  ): string {
    let content = `# Scenario Comparison Brief\n\n`;

    if (comp.scenarios && comp.scenarios.length > 0) {
      content += `## Scenarios\n\n`;
      content += `| Scenario | Total N | Power | Effect Size | Notes |\n`;
      content += `|----------|---------|-------|-------------|-------|\n`;
      for (const s of comp.scenarios) {
        content += `| ${s.label} | ${s.sampleSize.total} | ${(s.power * 100).toFixed(0)}% | ${s.delta} | ${s.recommendation ?? ''} |\n`;
      }
      content += `\n`;

      content += `## Analysis\n\n`;
      content += `The base case requires ${comp.sampleSize.total} subjects with ${(comp.power * 100).toFixed(1)}% power. `;
      const conservative = comp.scenarios.find(s => s.label.includes('Conservative'));
      if (conservative) {
        content += `Under conservative assumptions (${conservative.delta}), ${conservative.sampleSize.total} subjects would be needed. `;
      }
      content += `\n\n`;
    }

    content += `## Recommendation\n\n`;
    content += `${judgment.roleExplanations.clinical}\n\n`;

    content += `## Fragility Note\n\n`;
    content += `${judgment.fragility.narrative}\n\n`;

    content += this.provenanceFooter();
    return content;
  }

  // ────────────────────────────────────────────────────────────────
  // 6. Statistical Reviewer Response Support
  // ────────────────────────────────────────────────────────────────

  private generateReviewerResponseSupport(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation,
    regulatory?: RegulatoryCustomization
  ): string {
    let content = `# Statistical Reviewer Response Support\n\n`;
    content += `## Prepared Defense Points\n\n`;

    content += `### Sample Size Justification\n`;
    content += `The sample size of ${comp.adjustedTotal ?? comp.sampleSize.total} was determined using ${comp.method} with the following assumptions:\n`;
    for (const a of comp.assumptions.filter(a => a.source === 'user_provided')) {
      content += `- ${a.parameter}: ${a.value}\n`;
    }
    content += `\n`;

    content += `### Power Adequacy\n`;
    content += `${judgment.roleExplanations.technical}\n\n`;

    content += `### Design Defensibility\n`;
    content += `Endpoint-method fit: ${judgment.endpointMethodFit.fit}. ${judgment.endpointMethodFit.rationale}\n\n`;

    if (domain.methodSuggestions.length > 0) {
      content += `### Methodological Considerations\n`;
      for (const ms of domain.methodSuggestions) {
        content += `- ${ms}\n`;
      }
      content += `\n`;
    }

    if (regulatory) {
      content += `### Regulatory Alignment (${regulatory.body})\n`;
      for (const ref of regulatory.guidanceReferences) {
        content += `- ${ref}\n`;
      }
      content += `\n`;
    }

    content += `### Known Limitations (Proactive Disclosure)\n`;
    for (const lim of judgment.confidence.limitations) {
      content += `- ${lim}\n`;
    }
    content += `\n`;

    content += this.provenanceFooter();
    return content;
  }

  // ────────────────────────────────────────────────────────────────
  // 7. Protocol Statistical Section
  // ────────────────────────────────────────────────────────────────

  private generateProtocolStatisticalSection(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation,
    regulatory?: RegulatoryCustomization
  ): string {
    let content = `# Protocol — Statistical Considerations\n\n`;

    content += `## Statistical Hypotheses\n\n`;
    if (input.studyType === 'superiority') {
      content += `H0: No difference between treatment groups.\nH1: Treatment is superior to control.\n\n`;
    } else if (input.studyType === 'non_inferiority') {
      content += `H0: Treatment is inferior to control by more than the non-inferiority margin (${input.nonInferiorityMargin}).\nH1: Treatment is non-inferior to control.\n\n`;
    } else if (input.studyType === 'equivalence') {
      content += `H0: Treatment and control differ by more than the equivalence margin (±${input.equivalenceMargin}).\nH1: Treatment and control are equivalent.\n\n`;
    }

    content += `## Sample Size\n\n`;
    content += `${comp.adjustedTotal ?? comp.sampleSize.total} subjects (${comp.sampleSize.perGroup} per group) provide ${(comp.power * 100).toFixed(1)}% power at α=${input.alpha} (two-sided) to detect an effect size of ${input.effectSize}.\n\n`;

    content += `## Primary Analysis\n\n`;
    content += `${comp.method}. Significance level: α = ${input.alpha} (two-sided).\n\n`;

    content += `## Analysis Populations\n\n`;
    content += `- **Full Analysis Set (FAS/ITT)**: All randomized subjects\n`;
    content += `- **Per-Protocol (PP)**: Subjects completing the study without major protocol deviations\n`;
    content += `- **Safety Population**: All subjects receiving at least one dose of study treatment\n\n`;

    content += this.provenanceFooter();
    return content;
  }

  // ────────────────────────────────────────────────────────────────
  // 8. Submission-Support Statistical Note
  // ────────────────────────────────────────────────────────────────

  private generateSubmissionStatisticalNote(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation,
    regulatory?: RegulatoryCustomization
  ): string {
    let content = `# Submission-Support Statistical Note\n\n`;
    content += `## Summary for Submission Dossier\n\n`;
    content += `This note supports the statistical design and analysis approach for inclusion in the regulatory submission to ${regulatory?.body ?? 'the target regulatory authority'}.\n\n`;

    content += `## Statistical Design Summary\n\n`;
    content += `- Study type: ${input.studyType}\n`;
    content += `- Total sample size: ${comp.adjustedTotal ?? comp.sampleSize.total}\n`;
    content += `- Primary method: ${comp.method}\n`;
    content += `- Power: ${(comp.power * 100).toFixed(1)}%\n`;
    content += `- Significance level: α = ${input.alpha}\n\n`;

    content += `## Regulatory Alignment\n\n`;
    if (regulatory) {
      for (const exp of regulatory.statisticalExpectations) {
        content += `- ${exp}\n`;
      }
    }
    content += `\n`;

    content += `## Statistical Rigor Assessment\n\n`;
    content += `- Overall verdict: ${judgment.overallVerdict}\n`;
    content += `- Confidence: ${judgment.confidence.level}\n`;
    content += `- Fragility: ${judgment.fragility.category}\n\n`;

    content += this.provenanceFooter();
    return content;
  }

  // ════════════════════════════════════════════════════════════════
  // Helpers
  // ════════════════════════════════════════════════════════════════

  private buildProvenance(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation,
    regulatory?: RegulatoryCustomization
  ): DocumentProvenance {
    return {
      computationInputs: input,
      computationResults: comp,
      judgmentResults: judgment,
      domainAdaptation: domain,
      regulatoryCustomization: regulatory,
      generatedAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
    };
  }

  private buildMetadata(input: StatisticalInput, meta: { projectId: number; organizationId: number }): DocumentMetadata {
    return {
      clientTrack: input.clientTrack,
      regulatoryBody: input.regulatoryBody,
      studyType: input.studyType,
      indication: input.indication,
      phase: input.phase,
      tags: [input.clientTrack, input.studyType, input.endpointType],
    };
  }

  // ────────────────────────────────────────────────────────────────
  // 9. Full Statistical Analysis Plan
  // ────────────────────────────────────────────────────────────────

  private generateFullStatisticalAnalysisPlan(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation,
    regulatory?: RegulatoryCustomization
  ): string {
    const n = comp.adjustedTotal ?? comp.sampleSize.total;
    const body = regulatory?.body ?? input.regulatoryBody ?? 'FDA';
    let c = `# Statistical Analysis Plan\n\n`;
    c += `*${this.trackLabel(input.clientTrack)} · ${input.studyType} · ${input.objectiveType}*\n\n`;

    c += `## 1. Introduction\n\nThis Statistical Analysis Plan (SAP) specifies the analyses for a ${input.studyType} study with a ${input.endpointType} primary endpoint. It is written to ${body} expectations and should be finalized and signed prior to database lock and unblinding.\n\n`;

    c += `## 2. Study Objectives and Endpoints\n\n- **Primary objective**: ${input.objectiveType} evaluation via the ${input.endpointType} primary endpoint.\n- **Study type**: ${input.studyType}${input.nonInferiorityMargin ? ` (non-inferiority margin ${input.nonInferiorityMargin})` : ''}${input.equivalenceMargin ? ` (equivalence margin ${input.equivalenceMargin})` : ''}.\n\n`;

    c += `## 3. Study Design\n\n- Design: ${input.studyType}\n- Number of groups: ${input.numberOfGroups ?? 2}\n- Allocation ratio: ${input.allocationRatio}:1\n- Comparator: ${input.comparatorType ?? 'placebo'}\n\n`;

    c += `## 4. Analysis Populations\n\n- **Intention-to-treat (ITT)**: all randomized subjects, analyzed as randomized. Primary population for efficacy.\n- **Per-protocol (PP)**: subjects without major protocol deviations. Supportive${input.studyType === 'non_inferiority' || input.studyType === 'equivalence' ? ' — co-primary for non-inferiority/equivalence per ICH E9.' : '.'}\n- **Safety**: all subjects who received any study intervention, analyzed as treated.\n\n`;

    c += `## 5. Sample Size Determination\n\nA total of **${n} subjects** (${comp.sampleSize.perGroup} per group) provides **${(comp.power * 100).toFixed(1)}% power** at a two-sided α = ${input.alpha} to detect the planned effect (${input.effectSize}).\n\n${comp.formula}\n\nAssumed attrition: ${(input.attritionRate * 100).toFixed(0)}%.\n\n`;

    c += `## 6. Primary Analysis Method\n\n${comp.method}\n\n*Endpoint–method fit*: ${judgment.endpointMethodFit.rationale}\n\n`;

    c += `## 7. Multiplicity\n\n`;
    if (comp.multiplicityResult && comp.multiplicityResult.endpointCount > 1) {
      c += `${comp.multiplicityResult.recommendation}\n\n| Endpoint | Adjusted α |\n|---|---|\n`;
      comp.multiplicityResult.adjustedAlphas.forEach((a, i) => { c += `| Endpoint ${i + 1} | ${a.toFixed(4)} |\n`; });
      c += `\nFamily-wise error rate controlled at α = ${input.alpha}.\n\n`;
    } else {
      c += `Single primary endpoint — no multiplicity adjustment required for the primary comparison. Pre-specify a testing hierarchy for any key secondary endpoints.\n\n`;
    }

    c += `## 8. Estimand (ICH E9(R1))\n\n${input.estimandStrategy ? `Strategy for intercurrent events: **${input.estimandStrategy}**. Define population, variable (${input.endpointType}), intercurrent-event handling, and population-level summary measure explicitly.` : 'Define the estimand (population, variable, intercurrent-event strategy, summary measure) before study conduct per ICH E9(R1).'}\n\n`;

    c += `## 9. Missing Data\n\n`;
    if (input.missingDataMethod && comp.missingDataImpact) {
      c += `Primary approach: **${input.missingDataMethod}**. Expected missing rate ${(comp.missingDataImpact.expectedMissingRate * 100).toFixed(0)}%; effective N ${comp.missingDataImpact.effectiveSampleSize}; adjusted power ${(comp.missingDataImpact.adjustedPower * 100).toFixed(1)}%; bias risk ${comp.missingDataImpact.biasRisk}. ${comp.missingDataImpact.recommendation}\n\n`;
    } else {
      c += `Pre-specify the missing-data approach (e.g. MMRM for longitudinal endpoints, multiple imputation otherwise) and a tipping-point sensitivity analysis.\n\n`;
    }

    c += `## 10. Sensitivity Analyses\n\n- Tipping-point analysis for missing-data assumptions\n- ITT vs PP concordance\n`;
    if (judgment.fragility.category !== 'robust') c += `- Effect-size sensitivity (fragility index ${judgment.fragility.fragilityIndex})\n`;
    c += `\n`;

    c += `## 11. Interim Analyses\n\n`;
    if (input.interimAnalyses && input.interimAnalyses > 0) {
      c += `${input.interimAnalyses} planned interim ${input.interimAnalyses === 1 ? 'analysis' : 'analyses'} governed by a pre-specified alpha-spending function (e.g. O'Brien–Fleming). See the Interim Analysis Plan and DSMB Charter.\n\n`;
    } else {
      c += `No interim efficacy analyses planned. Safety monitoring per the DSMB charter, if applicable.\n\n`;
    }

    c += `## 12. Planned Outputs\n\nTables, listings and figures are specified in the TLF Shell Plan. Disposition, demographics, primary/secondary efficacy, and safety summaries are mandatory.\n\n`;
    c += this.provenanceFooter();
    return c;
  }

  // ────────────────────────────────────────────────────────────────
  // 10. Interim Analysis Plan
  // ────────────────────────────────────────────────────────────────

  private generateInterimAnalysisPlan(
    input: StatisticalInput,
    comp: ComputationResult,
    _judgment: JudgmentResult,
    _domain: DomainAdaptation,
    regulatory?: RegulatoryCustomization
  ): string {
    const k = input.interimAnalyses && input.interimAnalyses > 0 ? input.interimAnalyses : 1;
    const n = comp.adjustedTotal ?? comp.sampleSize.total;
    let c = `# Interim Analysis Plan\n\n`;
    c += `## 1. Purpose\n\nThis plan governs ${k} planned interim ${k === 1 ? 'analysis' : 'analyses'} for a ${input.studyType} study (target N = ${n}, ${(comp.power * 100).toFixed(0)}% power at α = ${input.alpha}). It controls the overall Type I error and defines stopping rules.\n\n`;
    c += `## 2. Timing\n\nInterim ${k === 1 ? 'analysis is' : 'analyses are'} planned at approximately ${Array.from({ length: k }, (_, i) => `${Math.round(((i + 1) / (k + 1)) * 100)}%`).join(', ')} of planned information (events/completers).\n\n`;
    c += `## 3. Alpha Spending\n\nA group-sequential design with an O'Brien–Fleming-type alpha-spending function is recommended to preserve a conservative early boundary and a near-nominal final boundary. The cumulative spend at the final analysis equals the study-wide α = ${input.alpha}.\n\n| Look | Information fraction | Indicative two-sided boundary (Z) |\n|---|---|---|\n`;
    for (let i = 1; i <= k; i++) {
      const frac = (i / (k + 1));
      const z = (2.96 - 0.6 * frac).toFixed(2); // indicative, conservative-early → near-final
      c += `| ${i} | ${(frac * 100).toFixed(0)}% | ±${z} |\n`;
    }
    c += `| Final | 100% | ±${(1.97).toFixed(2)} |\n\n*Boundaries are indicative; compute exact boundaries with the chosen spending function (e.g. Lan–DeMets) at finalization.*\n\n`;
    c += `## 4. Stopping Rules\n\n- **Efficacy**: cross the upper boundary at an interim look.\n- **Futility**: non-binding futility boundary (e.g. conditional power < 20%).\n- **Safety**: per DSMB charter, independent of efficacy boundaries.\n\n`;
    c += `## 5. Governance\n\nInterim analyses are performed by an unblinded independent statistician and reviewed by the DSMB (see DSMB Charter). The sponsor remains blinded.${regulatory ? ` ${regulatory.body} expects pre-specification of all boundaries before the first look.` : ''}\n\n`;
    c += this.provenanceFooter();
    return c;
  }

  // ────────────────────────────────────────────────────────────────
  // 11. DSMB / DMC Charter
  // ────────────────────────────────────────────────────────────────

  private generateDsmbCharter(
    input: StatisticalInput,
    comp: ComputationResult,
    _judgment: JudgmentResult,
    _domain: DomainAdaptation,
    regulatory?: RegulatoryCustomization
  ): string {
    let c = `# Data Safety Monitoring Board (DSMB) Charter\n\n`;
    c += `## 1. Purpose and Scope\n\nThe DSMB (also DMC) safeguards the safety and interests of subjects in this ${input.studyType} study (target N = ${comp.adjustedTotal ?? comp.sampleSize.total}) and the integrity of the trial. It operates independently of the sponsor and investigators.\n\n`;
    c += `## 2. Membership\n\n- Independent clinician(s) with relevant therapeutic expertise\n- Independent biostatistician\n- A chair with prior DSMB experience\n\nMembers have no competing financial or intellectual interests in the outcome.\n\n`;
    c += `## 3. Responsibilities\n\n- Review accumulating safety data at pre-specified intervals\n- Review interim efficacy at planned looks (see Interim Analysis Plan)\n- Recommend continue / modify / pause / stop\n\n`;
    c += `## 4. Meetings\n\n- **Organizational** (before first subject)\n- **Periodic safety reviews** (e.g. by enrollment/exposure milestones)\n- **Interim analyses**: ${input.interimAnalyses && input.interimAnalyses > 0 ? `${input.interimAnalyses} planned` : 'safety-only unless protocol specifies efficacy looks'}\n\n`;
    c += `## 5. Open and Closed Sessions\n\nOpen sessions include the sponsor (blinded). Closed sessions are restricted to voting members and the independent unblinded statistician who presents by-arm data.\n\n`;
    c += `## 6. Statistical Support and Stopping Guidance\n\nAn independent unblinded statistician prepares closed reports. Formal efficacy stopping follows the pre-specified group-sequential boundaries; safety stopping is at DSMB discretion.${regulatory ? ` Aligns with ${regulatory.body} expectations for independent data monitoring.` : ''}\n\n`;
    c += `## 7. Confidentiality\n\nInterim by-arm results are confidential to the DSMB until the board recommends otherwise, to protect trial integrity and avoid operational bias.\n\n`;
    c += this.provenanceFooter();
    return c;
  }

  // ────────────────────────────────────────────────────────────────
  // 12. CSR Statistical Methods Section (ICH E3 §9.7)
  // ────────────────────────────────────────────────────────────────

  private generateStatisticalMethodsSection(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    _domain: DomainAdaptation,
    _regulatory?: RegulatoryCustomization
  ): string {
    const n = comp.adjustedTotal ?? comp.sampleSize.total;
    let c = `# Statistical Methods (CSR §9.7, ICH E3)\n\n`;
    c += `## 9.7.1 Statistical and Analytical Plans\n\nThe study was a ${input.studyType} design with a ${input.endpointType} primary endpoint analyzed by ${comp.method}. Analyses followed the pre-specified SAP.\n\n`;
    c += `## 9.7.1.1 Analysis Populations\n\nEfficacy was analyzed on the ITT population; the PP population was supportive. Safety was summarized on the as-treated population.\n\n`;
    c += `## 9.7.1.2 Primary Endpoint Analysis\n\nThe primary endpoint was compared between arms using ${comp.method} at a two-sided α = ${input.alpha}. The point estimate is reported with its ${((1 - input.alpha) * 100).toFixed(0)}% confidence interval${comp.confidenceInterval ? ` (planned CI [${comp.confidenceInterval.lower}, ${comp.confidenceInterval.upper}])` : ''}.\n\n`;
    c += `## 9.7.1.3 Sample Size\n\nThe planned sample size of ${n} (${comp.sampleSize.perGroup}/group) provided ${(comp.power * 100).toFixed(1)}% power. ${comp.formula}\n\n`;
    c += `## 9.7.2 Multiplicity\n\n${comp.multiplicityResult && comp.multiplicityResult.endpointCount > 1 ? comp.multiplicityResult.recommendation : 'A single primary comparison was performed; secondary endpoints were tested within a pre-specified hierarchy.'}\n\n`;
    c += `## 9.7.3 Handling of Missing Data\n\n${input.missingDataMethod ? `Missing data were handled by ${input.missingDataMethod}, with tipping-point sensitivity analyses.` : 'Missing data were handled per the pre-specified SAP approach with sensitivity analyses.'}\n\n`;
    c += `## 9.7.4 Interim Analyses\n\n${input.interimAnalyses && input.interimAnalyses > 0 ? `${input.interimAnalyses} interim ${input.interimAnalyses === 1 ? 'analysis was' : 'analyses were'} conducted under a pre-specified alpha-spending function with DSMB oversight.` : 'No interim efficacy analyses were conducted.'}\n\n`;
    if (judgment.fragility.category !== 'robust') {
      c += `## 9.7.5 Robustness\n\nResult robustness was assessed (fragility index ${judgment.fragility.fragilityIndex}); conclusions were examined under alternative assumptions.\n\n`;
    }
    c += this.provenanceFooter();
    return c;
  }

  // ────────────────────────────────────────────────────────────────
  // 13. Tables, Listings & Figures Shell Plan
  // ────────────────────────────────────────────────────────────────

  private generateTlfShellPlan(
    input: StatisticalInput,
    comp: ComputationResult,
    _judgment: JudgmentResult,
    _domain: DomainAdaptation
  ): string {
    let c = `# Tables, Listings & Figures (TLF) Shell Plan\n\n`;
    c += `Planned outputs for a ${input.studyType} study (N = ${comp.adjustedTotal ?? comp.sampleSize.total}). Shells are organized by ICH E3 domain.\n\n`;
    c += `## Tables\n\n| ID | Title | Population |\n|---|---|---|\n`;
    c += `| 14.1.1 | Subject disposition | All randomized |\n`;
    c += `| 14.1.2 | Protocol deviations | All randomized |\n`;
    c += `| 14.1.3 | Demographics and baseline characteristics | ITT; Safety |\n`;
    c += `| 14.2.1 | Primary endpoint (${input.endpointType}) analysis — ${comp.method} | ITT |\n`;
    c += `| 14.2.2 | Primary endpoint — PP sensitivity | PP |\n`;
    c += `| 14.2.3 | Secondary endpoints | ITT |\n`;
    if (comp.multiplicityResult && comp.multiplicityResult.endpointCount > 1) c += `| 14.2.4 | Multiplicity-adjusted testing summary | ITT |\n`;
    c += `| 14.3.1 | Exposure | Safety |\n`;
    c += `| 14.3.2 | Adverse events overview | Safety |\n`;
    c += `| 14.3.3 | AEs by SOC/PT | Safety |\n`;
    c += `| 14.3.4 | Serious adverse events | Safety |\n`;
    c += `| 14.3.5 | Laboratory shifts | Safety |\n\n`;
    c += `## Figures\n\n| ID | Title |\n|---|---|\n`;
    c += `| F-1 | Subject disposition (CONSORT) |\n`;
    if (input.endpointType === 'time_to_event') c += `| F-2 | Kaplan–Meier curve, primary endpoint |\n`;
    c += `| F-3 | Primary endpoint by visit / forest plot of subgroups |\n\n`;
    c += `## Listings\n\n| ID | Title |\n|---|---|\n`;
    c += `| 16.2.1 | Subject disposition |\n`;
    c += `| 16.2.4 | Protocol deviations |\n`;
    c += `| 16.2.7 | Adverse events |\n\n`;
    c += this.provenanceFooter();
    return c;
  }

  // ────────────────────────────────────────────────────────────────
  // 14. Randomization & Blinding Plan
  // ────────────────────────────────────────────────────────────────

  private generateRandomizationPlan(
    input: StatisticalInput,
    comp: ComputationResult,
    _judgment: JudgmentResult,
    _domain: DomainAdaptation
  ): string {
    const groups = input.numberOfGroups ?? 2;
    let c = `# Randomization & Blinding Plan\n\n`;
    c += `## 1. Allocation\n\nSubjects are randomized ${input.allocationRatio}:1 across ${groups} arm${groups === 1 ? '' : 's'} for this ${input.studyType} study (target N = ${comp.adjustedTotal ?? comp.sampleSize.total}).\n\n`;
    c += `## 2. Method\n\nPermuted-block randomization with randomly varying block sizes is recommended to balance arms while protecting allocation concealment. ${input.studyType === 'single_arm' ? 'Single-arm study — randomization not applicable; document enrollment order instead.' : 'Stratify by key prognostic factors (e.g. site, baseline severity) to control confounding.'}\n\n`;
    c += `## 3. Allocation Concealment\n\nThe randomization list is generated by an independent statistician and held in a secure IWRS/IRT. Sites obtain assignments at the point of randomization only.\n\n`;
    c += `## 4. Blinding\n\n${input.comparatorType === 'placebo' ? 'Double-blind: subjects, investigators, and outcome assessors are masked using matching placebo.' : 'Specify the blinding level (open-label, single-, or double-blind). Where blinding is infeasible, use blinded independent endpoint adjudication.'}\n\n`;
    c += `## 5. Unblinding\n\nEmergency unblinding is available via the IWRS for medical necessity and is logged. Planned unblinding occurs only after database lock, except for DSMB closed sessions (see DSMB Charter).\n\n`;
    c += this.provenanceFooter();
    return c;
  }

  private generateTitle(type: StatisticalDocumentType, input: StatisticalInput): string {
    const trackLabel = this.trackLabel(input.clientTrack);
    const typeLabels: Record<StatisticalDocumentType, string> = {
      sample_size_rationale: 'Sample Size Rationale',
      statistical_risk_memo: 'Statistical Risk Memo',
      design_assumption_note: 'Design Assumption Note',
      sap_section_draft: 'SAP Section Draft',
      scenario_comparison_brief: 'Scenario Comparison Brief',
      statistical_reviewer_response: 'Statistical Reviewer Response Support',
      protocol_statistical_section: 'Protocol Statistical Section',
      submission_statistical_note: 'Submission Statistical Note',
      full_statistical_analysis_plan: 'Statistical Analysis Plan',
      interim_analysis_plan: 'Interim Analysis Plan',
      dsmb_charter: 'DSMB / DMC Charter',
      statistical_methods_section: 'CSR Statistical Methods Section',
      tlf_shell_plan: 'Tables, Listings & Figures Shell Plan',
      randomization_plan: 'Randomization & Blinding Plan',
    };
    const suffix = input.indication ? ` — ${input.indication}` : '';
    return `${typeLabels[type]} (${trackLabel})${suffix}`;
  }

  private trackLabel(track: string): string {
    switch (track) {
      case 'biotech_pharma': return 'Pharma/Biotech';
      case 'medical_device': return 'Medical Device';
      case 'diagnostics_ivd': return 'Diagnostics/IVD';
      default: return track;
    }
  }

  private provenanceFooter(): string {
    return `\n---\n*Generated by AnA Biostats Engine v${ENGINE_VERSION}. All numeric results are deterministic. Judgment and framing are rule-backed. This document should be reviewed by a qualified biostatistician before regulatory submission.*\n`;
  }
}

export const documentGenerator = new DocumentGenerator();
