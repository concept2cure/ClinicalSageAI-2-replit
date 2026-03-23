/**
 * AnA Biostats — SME Router
 *
 * Routes biostatistics requests to the correct specialist sub-agent(s).
 * Routing is based on: input fields, workflow type, domain track, document type, keywords.
 * Produces specialist-enhanced interpretation and document guidance.
 *
 * This is INTERNAL routing — users see one coherent AnA Biostats surface.
 */

import {
  SME_AGENTS,
  ALL_SME_AGENTS,
  type SMEAgentId,
  type SMEAgentProfile,
  type SMERoutingResult,
  type SMEEnhancement,
} from './sme-agents';

import type {
  StatisticalInput,
  ComputationResult,
  JudgmentResult,
  DomainAdaptation,
  RegulatoryCustomization,
  BiostatsWorkflowRequest,
  StatisticalDocumentType,
  RoleExplanations,
} from './types';

export class SMERouter {

  /**
   * Route a request to the most appropriate SME sub-agent(s).
   * Returns primary SME + any secondary SMEs that should contribute.
   */
  route(request: BiostatsWorkflowRequest): SMERoutingResult {
    const scores = this.scoreAllSMEs(request);

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    if (scores.length === 0 || scores[0].score === 0) {
      return {
        primarySME: 'trial_design_power', // default fallback
        secondarySMEs: [],
        confidence: 50,
        rationale: 'No strong specialist match — using default trial design specialist.',
      };
    }

    const primary = scores[0];
    const secondaries = scores
      .slice(1)
      .filter(s => s.score >= primary.score * 0.5 && s.score > 20)
      .map(s => s.smeId);

    return {
      primarySME: primary.smeId,
      secondarySMEs: secondaries.slice(0, 2), // max 2 secondary
      confidence: Math.min(100, primary.score),
      rationale: `Primary: ${SME_AGENTS[primary.smeId].name} (score: ${primary.score}). ${secondaries.length > 0 ? `Secondary: ${secondaries.map(id => SME_AGENTS[id].name).join(', ')}.` : 'No secondary specialist needed.'}`,
    };
  }

  /**
   * Score all SMEs against a request.
   */
  private scoreAllSMEs(request: BiostatsWorkflowRequest): Array<{ smeId: SMEAgentId; score: number }> {
    return ALL_SME_AGENTS.map(sme => ({
      smeId: sme.id,
      score: this.scoreSME(sme, request),
    }));
  }

  /**
   * Score a single SME against a request.
   * Higher = better match.
   */
  private scoreSME(sme: SMEAgentProfile, request: BiostatsWorkflowRequest): number {
    let score = 0;
    const input = request.input;
    const triggers = sme.triggerConditions;

    // Workflow type match (high weight)
    if (triggers.workflowTypes.includes(request.workflowType)) {
      score += 25;
    }

    // Study type match
    if (input.studyType && triggers.studyTypes.includes(input.studyType)) {
      score += 15;
    }

    // Endpoint type match
    if (input.endpointType && triggers.endpointTypes.includes(input.endpointType)) {
      score += 15;
    }

    // Client track match (high weight for device/diagnostics SME)
    if (input.clientTrack && triggers.clientTracks.includes(input.clientTrack)) {
      score += 20;
      // Bonus for device/diagnostics SME when track is device/IVD
      if (sme.id === 'device_diagnostics_performance' &&
          (input.clientTrack === 'medical_device' || input.clientTrack === 'diagnostics_ivd')) {
        score += 15;
      }
    }

    // Document type match
    if (request.documentType && triggers.documentTypes.includes(request.documentType)) {
      score += 10;
    }

    // Priority bonus
    score += triggers.priority;

    // Specific field-based routing
    if (sme.id === 'sap_analysis_strategy') {
      if (input.estimandStrategy) score += 10;
      if (input.missingDataMethod) score += 10;
      if (input.multiplicityMethod) score += 10;
    }

    if (sme.id === 'adaptive_sensitivity') {
      if (input.studyType === 'adaptive') score += 20;
      if (input.interimAnalyses && input.interimAnalyses > 0) score += 15;
      if (input.crossoverPeriods) score += 5;
    }

    if (sme.id === 'regulatory_submission') {
      if (input.regulatoryBody) score += 15;
      if (request.documentType === 'statistical_reviewer_response') score += 20;
      if (request.documentType === 'submission_statistical_note') score += 20;
    }

    if (sme.id === 'device_diagnostics_performance') {
      if (input.sensitivity || input.specificity) score += 15;
      if (input.prevalence) score += 10;
      if (input.agreementTarget) score += 15;
      if (input.aucTarget) score += 15;
    }

    return score;
  }

  /**
   * Enhance the workflow output with specialist-specific guidance.
   * Called after computation and judgment, before document generation.
   */
  enhance(
    smeId: SMEAgentId,
    input: StatisticalInput,
    computation: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation,
    regulatory?: RegulatoryCustomization
  ): SMEEnhancement {
    const sme = SME_AGENTS[smeId];

    const additionalGuidance = this.generateSpecialistGuidance(sme, input, computation, judgment);
    const emphasizedFlags = this.getEmphasizedFlags(sme, judgment);
    const documentRecommendations = this.getDocumentRecommendations(sme, judgment);
    const roleFraming = this.getSpecialistRoleFraming(sme, input, computation, judgment);
    const provisionalNotes = this.getProvisionalNotes(sme, input, judgment);
    const escalationNotes = this.getEscalationNotes(sme, input, judgment);

    return {
      smeId,
      smeName: sme.name,
      additionalGuidance,
      emphasizedFlags,
      documentRecommendations,
      roleFraming,
      provisionalNotes,
      escalationNotes,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Specialist guidance generation
  // ════════════════════════════════════════════════════════════════

  private generateSpecialistGuidance(
    sme: SMEAgentProfile,
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult
  ): string[] {
    const guidance: string[] = [];

    switch (sme.id) {
      case 'trial_design_power':
        if (comp.power < 0.80) {
          guidance.push(`Design & Power assessment: Power of ${(comp.power * 100).toFixed(1)}% is below the standard 80% threshold. Consider increasing sample size or re-evaluating effect size assumptions.`);
        }
        if (judgment.fragility.category === 'fragile' || judgment.fragility.category === 'very_fragile') {
          guidance.push(`Fragility warning: Design fragility index is ${judgment.fragility.fragilityIndex}/100. ${judgment.fragility.narrative}`);
        }
        if (comp.scenarios && comp.scenarios.length > 0) {
          const conservative = comp.scenarios.find(s => s.label.includes('Conservative'));
          if (conservative) {
            guidance.push(`Conservative scenario requires N=${conservative.sampleSize.total}. Consider this for robust planning.`);
          }
        }
        break;

      case 'sap_analysis_strategy':
        if (!input.estimandStrategy && input.clientTrack === 'biotech_pharma') {
          guidance.push('SAP Strategy: Estimand framework not specified. ICH E9(R1) requires explicit estimand definition for confirmatory trials.');
        }
        if (!input.missingDataMethod) {
          guidance.push('SAP Strategy: Missing data handling method should be pre-specified. Consider MMRM for longitudinal endpoints or multiple imputation for general patterns.');
        }
        if ((input.numberOfEndpoints ?? 1) > 1 && !input.multiplicityMethod) {
          guidance.push(`SAP Strategy: ${input.numberOfEndpoints} endpoints without multiplicity adjustment. Pre-specify correction method in SAP.`);
        }
        if (comp.multiplicityResult && comp.multiplicityResult.sampleSizeImpact > 20) {
          guidance.push(`SAP Strategy: Multiplicity adjustment increases required sample size by ~${comp.multiplicityResult.sampleSizeImpact}%. Discuss with clinical team.`);
        }
        break;

      case 'regulatory_submission':
        if (judgment.overallRisk === 'high' || judgment.overallRisk === 'critical') {
          guidance.push(`Regulatory assessment: ${judgment.overallRisk} risk level detected. Pre-submission meeting recommended to align statistical approach.`);
        }
        if (input.regulatoryBody) {
          const bodySpecific = this.getBodySpecificGuidance(input.regulatoryBody, input, judgment);
          guidance.push(...bodySpecific);
        }
        guidance.push(`Defensibility: ${judgment.endpointMethodFit.fit} endpoint-method fit. ${judgment.endpointMethodFit.rationale}`);
        break;

      case 'device_diagnostics_performance':
        if (comp.diagnosticMetrics) {
          if (comp.diagnosticMetrics.ppv && comp.diagnosticMetrics.ppv < 0.50) {
            guidance.push(`Device/IVD alert: PPV of ${(comp.diagnosticMetrics.ppv * 100).toFixed(1)}% is low — consider prevalence enrichment or clinical utility justification.`);
          }
          if (input.prevalence && input.prevalence < 0.10) {
            guidance.push('Device/IVD: Low prevalence (<10%) requires larger sample and enrichment strategy consideration.');
          }
        }
        if (input.studyType === 'performance' && !input.controlRate) {
          guidance.push('Device/IVD: Performance goal not specified. Must be derived from literature or predicate device data.');
        }
        break;

      case 'adaptive_sensitivity':
        if (judgment.fragility.fragilityIndex > 40) {
          guidance.push(`Sensitivity assessment: Design has fragility index of ${judgment.fragility.fragilityIndex}/100.`);
          for (const sp of judgment.fragility.sensitiveParameters) {
            guidance.push(`  → ${sp.parameter}: ${sp.percentMargin}% margin to breakpoint (current: ${sp.currentValue}, break: ${sp.breakpointValue})`);
          }
        }
        if (comp.missingDataImpact) {
          guidance.push(`Missing data sensitivity: ${comp.missingDataImpact.method} reduces power by ${(comp.missingDataImpact.powerReduction * 100).toFixed(1)}%. Bias risk: ${comp.missingDataImpact.biasRisk}.`);
        }
        if (input.interimAnalyses && input.interimAnalyses > 0) {
          guidance.push(`Interim analysis: ${input.interimAnalyses} planned looks. Ensure alpha spending function is pre-specified and IDMC charter is in place.`);
        }
        break;
    }

    return guidance;
  }

  private getBodySpecificGuidance(body: string, input: StatisticalInput, judgment: JudgmentResult): string[] {
    const guidance: string[] = [];
    switch (body) {
      case 'FDA':
        if (input.phase === 'III') guidance.push('FDA: Confirmatory Phase III — ensure prospective statistical planning with separate SAP.');
        if (judgment.dimensions.find(d => d.name === 'Multiplicity Control')?.verdict !== 'adequate') {
          guidance.push('FDA: Multiplicity concerns may trigger review questions. Pre-specify adjustment in protocol/SAP.');
        }
        break;
      case 'EMA':
        guidance.push('EMA: Scientific advice from CHMP/SAWP recommended for novel statistical approaches.');
        if (!input.estimandStrategy) guidance.push('EMA: Estimand framework particularly emphasized by EMA reviewers.');
        break;
      case 'PMDA':
        guidance.push('PMDA: Japanese subgroup analysis and ethnic sensitivity assessment may be required.');
        break;
      case 'MHRA':
        guidance.push('MHRA: Post-Brexit UK-specific requirements may differ from EU. Consider ILAP pathway for innovative designs.');
        break;
    }
    return guidance;
  }

  // ════════════════════════════════════════════════════════════════
  // Flag emphasis
  // ════════════════════════════════════════════════════════════════

  private getEmphasizedFlags(sme: SMEAgentProfile, judgment: JudgmentResult): string[] {
    const emphasized: string[] = [];
    for (const dim of judgment.dimensions) {
      if (sme.reasoningPreferences.emphasizedDimensions.includes(dim.name)) {
        emphasized.push(...dim.flags);
      }
    }
    return emphasized;
  }

  // ════════════════════════════════════════════════════════════════
  // Document recommendations
  // ════════════════════════════════════════════════════════════════

  private getDocumentRecommendations(sme: SMEAgentProfile, judgment: JudgmentResult): StatisticalDocumentType[] {
    const docs: StatisticalDocumentType[] = [...sme.outputPreferences.primaryDocuments];

    if (judgment.actionRecommendation === 'escalate' || judgment.actionRecommendation === 'revise') {
      docs.push('statistical_risk_memo');
    }

    // Deduplicate
    return [...new Set(docs)];
  }

  // ════════════════════════════════════════════════════════════════
  // Role framing
  // ════════════════════════════════════════════════════════════════

  private getSpecialistRoleFraming(
    sme: SMEAgentProfile,
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult
  ): Partial<RoleExplanations> {
    const framing: Partial<RoleExplanations> = {};

    if (sme.id === 'regulatory_submission') {
      framing.regulatory = `[Regulatory Biostats Specialist]: ${judgment.roleExplanations.regulatory} ${input.regulatoryBody ? `Specific to ${input.regulatoryBody} expectations.` : ''}`;
    }

    if (sme.id === 'device_diagnostics_performance') {
      framing.technical = `[Device/IVD Specialist]: ${judgment.roleExplanations.technical} ${comp.diagnosticMetrics ? `Diagnostic metrics: Se=${comp.diagnosticMetrics.sensitivity}, Sp=${comp.diagnosticMetrics.specificity}.` : ''}`;
    }

    if (sme.id === 'adaptive_sensitivity') {
      framing.technical = `[Sensitivity Specialist]: Fragility index ${judgment.fragility.fragilityIndex}/100 (${judgment.fragility.category}). ${judgment.fragility.narrative}`;
    }

    return framing;
  }

  // ════════════════════════════════════════════════════════════════
  // Provisional / Escalation notes
  // ════════════════════════════════════════════════════════════════

  private getProvisionalNotes(sme: SMEAgentProfile, input: StatisticalInput, judgment: JudgmentResult): string[] {
    const notes: string[] = [];

    for (const condition of sme.escalationRules.provisionalWhen) {
      // Check if any condition matches the current state
      if (condition.includes('effect size') && judgment.fragility.category === 'fragile') {
        notes.push(`Provisional: ${condition}`);
      }
      if (condition.includes('estimand') && !input.estimandStrategy && input.clientTrack === 'biotech_pharma') {
        notes.push(`Provisional: ${condition}`);
      }
      if (condition.includes('prevalence') && !input.prevalence && input.clientTrack === 'diagnostics_ivd') {
        notes.push(`Provisional: ${condition}`);
      }
      if (condition.includes('regulatory body') && !input.regulatoryBody) {
        notes.push(`Provisional: ${condition}`);
      }
      if (condition.includes('missing data') && !input.missingDataMethod) {
        notes.push(`Provisional: ${condition}`);
      }
    }

    // Max confidence claim enforcement
    if (judgment.confidence.level === 'high' && sme.escalationRules.maxConfidenceClaim !== 'high') {
      notes.push(`${sme.name} limits confidence claim to ${sme.escalationRules.maxConfidenceClaim} for this specialty area.`);
    }

    return notes;
  }

  private getEscalationNotes(sme: SMEAgentProfile, input: StatisticalInput, judgment: JudgmentResult): string[] {
    const notes: string[] = [];

    for (const condition of sme.escalationRules.humanReviewWhen) {
      if (condition.includes('power < 70') && judgment.dimensions.find(d => d.name === 'Power Adequacy')?.score < 30) {
        notes.push(`Escalation: ${condition}`);
      }
      if (condition.includes('fragility') && judgment.fragility.fragilityIndex > 65) {
        notes.push(`Escalation: ${condition}`);
      }
      if (condition.includes('Phase III') && input.phase === 'III') {
        if (condition.includes('estimand') && !input.estimandStrategy) {
          notes.push(`Escalation: ${condition}`);
        }
        if (condition.includes('novel design')) {
          notes.push(`Escalation: ${condition}`);
        }
      }
      if (condition.includes('missing data rate > 25') && (input.expectedMissingRate ?? input.attritionRate) > 0.25) {
        notes.push(`Escalation: ${condition}`);
      }
      if (condition.includes('critical defensibility') && judgment.overallRisk === 'critical') {
        notes.push(`Escalation: ${condition}`);
      }
    }

    // Check handoff recommendations
    for (const handoff of sme.escalationRules.handoffTo) {
      if (handoff.when.includes('adaptive') && input.studyType === 'adaptive' && sme.id !== 'adaptive_sensitivity') {
        notes.push(`Consider handoff to ${SME_AGENTS[handoff.smeId].name}: ${handoff.when}`);
      }
      if (handoff.when.includes('regulatory') && judgment.overallRisk === 'high' && sme.id !== 'regulatory_submission') {
        notes.push(`Consider handoff to ${SME_AGENTS[handoff.smeId].name}: ${handoff.when}`);
      }
    }

    return notes;
  }
}

export const smeRouter = new SMERouter();
