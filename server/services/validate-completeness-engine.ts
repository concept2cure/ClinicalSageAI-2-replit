/**
 * VALIDATE-COMPLETENESS Engine — Submission Readiness Assessment
 *
 * Provides:
 * - CTD module completeness checklist per submission type
 * - RTF risk scoring
 * - Go/No-Go decision framework
 * - Gap analysis with remediation guidance
 *
 * @module server/services/validate-completeness-engine
 */

import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('validate-completeness');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidateInput {
  submissionType: string;
  /** Sections present in the submission (section IDs or CTD module paths) */
  presentSections: string[];
  /** Optional: section quality scores (0-100) */
  sectionScores?: Record<string, number>;
  /** Optional: known issues from HARMONIZE */
  harmonizeIssueCount?: number;
  /** Optional: known escalations */
  openEscalations?: number;
  /** Target agency */
  targetAgency?: string;
}

export interface CompletenessCheckItem {
  module: string;
  section: string;
  description: string;
  required: boolean;
  present: boolean;
  qualityScore: number | null;
  status: 'complete' | 'present_needs_review' | 'missing_required' | 'missing_optional';
  remediation?: string;
}

export interface RTFRiskAssessment {
  overallRTFRisk: 'low' | 'medium' | 'high' | 'critical';
  rtfScore: number;
  missingCritical: string[];
  missingImportant: string[];
  weakSections: string[];
}

export interface GoNoGoDecision {
  decision: 'go' | 'conditional_go' | 'no_go';
  readinessScore: number;
  rationale: string;
  conditions: string[];
  blockers: string[];
  risks: string[];
}

export interface ValidateCompletenessResult {
  submissionType: string;
  targetAgency: string;
  checklist: CompletenessCheckItem[];
  rtfRisk: RTFRiskAssessment;
  goNoGo: GoNoGoDecision;
  summary: {
    totalSections: number;
    completeSections: number;
    missingSections: number;
    readinessPercentage: number;
  };
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class ValidateCompletenessEngine {

  async validate(input: ValidateInput): Promise<ValidateCompletenessResult> {
    log.info(`VALIDATE-COMPLETENESS: ${input.submissionType}, ${input.presentSections.length} sections`);

    const targetAgency = input.targetAgency || 'FDA';
    const requirements = this.getRequirements(input.submissionType, targetAgency);
    const checklist = this.buildChecklist(requirements, input);
    const rtfRisk = this.assessRTFRisk(checklist, input);
    const goNoGo = this.buildGoNoGo(checklist, rtfRisk, input);

    const completeSections = checklist.filter(c => c.status === 'complete').length;
    const missingSections = checklist.filter(c => c.status === 'missing_required').length;

    return {
      submissionType: input.submissionType,
      targetAgency,
      checklist,
      rtfRisk,
      goNoGo,
      summary: {
        totalSections: checklist.length,
        completeSections,
        missingSections,
        readinessPercentage: Math.round((completeSections / checklist.length) * 100),
      },
    };
  }

  private getRequirements(submissionType: string, agency: string): Array<{
    module: string; section: string; description: string; required: boolean; criticality: 'blocking' | 'important' | 'supporting';
  }> {
    // Common CTD requirements applicable to NDA/BLA/MAA/ANDA/505(b)(2)
    const commonCTD = [
      { module: '1', section: '1.1', description: 'Forms (FDA 356h / EMA Application Form)', required: true, criticality: 'blocking' as const },
      { module: '1', section: '1.2', description: 'Cover Letter', required: true, criticality: 'blocking' as const },
      { module: '1', section: '1.3', description: 'Administrative Information', required: true, criticality: 'blocking' as const },
      { module: '1', section: '1.12', description: 'Patent Information / Certifications', required: submissionType === 'ANDA' || submissionType === '505(b)(2)', criticality: 'blocking' as const },
      { module: '1', section: '1.14', description: 'Environmental Assessment', required: true, criticality: 'important' as const },
      { module: '2', section: '2.2', description: 'Introduction', required: true, criticality: 'important' as const },
      { module: '2', section: '2.3', description: 'Quality Overall Summary (QOS)', required: true, criticality: 'blocking' as const },
      { module: '2', section: '2.4', description: 'Nonclinical Overview', required: true, criticality: 'blocking' as const },
      { module: '2', section: '2.5', description: 'Clinical Overview', required: true, criticality: 'blocking' as const },
      { module: '2', section: '2.6', description: 'Nonclinical Written and Tabulated Summaries', required: true, criticality: 'important' as const },
      { module: '2', section: '2.7', description: 'Clinical Summary', required: true, criticality: 'blocking' as const },
      { module: '3', section: '3.2.S', description: 'Drug Substance', required: true, criticality: 'blocking' as const },
      { module: '3', section: '3.2.P', description: 'Drug Product', required: true, criticality: 'blocking' as const },
      { module: '3', section: '3.2.A', description: 'Appendices (Facilities, Adventitious Agents)', required: true, criticality: 'important' as const },
      { module: '3', section: '3.2.R', description: 'Regional Information', required: true, criticality: 'important' as const },
      { module: '4', section: '4.2', description: 'Study Reports (Pharmacology, PK, Toxicology)', required: submissionType !== 'ANDA', criticality: 'blocking' as const },
      { module: '4', section: '4.3', description: 'Literature References', required: true, criticality: 'supporting' as const },
      { module: '5', section: '5.2', description: 'Tabular Listing of All Clinical Studies', required: true, criticality: 'blocking' as const },
      { module: '5', section: '5.3', description: 'Clinical Study Reports', required: true, criticality: 'blocking' as const },
      { module: '5', section: '5.3.5', description: 'Reports of Efficacy and Safety Studies', required: submissionType !== 'ANDA', criticality: 'blocking' as const },
      { module: '5', section: '5.4', description: 'Literature References', required: true, criticality: 'supporting' as const },
    ];

    // ANDA-specific
    if (submissionType === 'ANDA') {
      return [
        ...commonCTD,
        { module: '5', section: '5.3.1', description: 'Bioequivalence Study Reports', required: true, criticality: 'blocking' as const },
        { module: '1', section: '1.12.1', description: 'Paragraph IV Certification Letters', required: false, criticality: 'important' as const },
        { module: '3', section: '3.2.P.2', description: 'Pharmaceutical Development (comparative dissolution)', required: true, criticality: 'blocking' as const },
      ];
    }

    // 505(b)(2)-specific
    if (submissionType === '505(b)(2)') {
      return [
        ...commonCTD,
        { module: '1', section: '1.12.2', description: 'Right of Reference Letters', required: true, criticality: 'blocking' as const },
        { module: '2', section: '2.7.1', description: 'Summary of Biopharmaceutics and Bridging', required: true, criticality: 'blocking' as const },
      ];
    }

    // Device submissions (PMA/510k/De Novo)
    if (['PMA', '510(k)', 'De Novo'].includes(submissionType)) {
      return [
        { module: '1', section: '1.1', description: 'Device Application Form (FDA 3601 or equivalent)', required: true, criticality: 'blocking' as const },
        { module: '1', section: '1.2', description: 'Cover Letter and Table of Contents', required: true, criticality: 'blocking' as const },
        { module: '2', section: '2.1', description: 'Device Description and Intended Use', required: true, criticality: 'blocking' as const },
        { module: '2', section: '2.2', description: 'Substantial Equivalence Comparison (510k) / Classification (De Novo)', required: submissionType !== 'PMA', criticality: 'blocking' as const },
        { module: '3', section: '3.1', description: 'Non-Clinical Testing (Bench, Biocompatibility)', required: true, criticality: 'blocking' as const },
        { module: '3', section: '3.2', description: 'Software Documentation (if SaMD)', required: false, criticality: 'important' as const },
        { module: '4', section: '4.1', description: 'Clinical Study Reports / Literature', required: submissionType === 'PMA', criticality: 'blocking' as const },
        { module: '5', section: '5.1', description: 'Labeling (IFU, Package Insert)', required: true, criticality: 'blocking' as const },
        { module: '5', section: '5.2', description: 'Sterilization Validation (if applicable)', required: false, criticality: 'important' as const },
        { module: '5', section: '5.3', description: 'Shelf Life / Packaging Validation', required: true, criticality: 'important' as const },
        { module: '6', section: '6.1', description: 'Manufacturing Information', required: true, criticality: 'blocking' as const },
      ];
    }

    // MAA (EMA)
    if (submissionType === 'MAA') {
      return [
        ...commonCTD,
        { module: '1', section: '1.5', description: 'Risk Management Plan (RMP)', required: true, criticality: 'blocking' as const },
        { module: '1', section: '1.6', description: 'Paediatric Investigation Plan (PIP) or Waiver', required: true, criticality: 'blocking' as const },
        { module: '1', section: '1.8', description: 'Environmental Risk Assessment', required: true, criticality: 'important' as const },
        { module: '2', section: '2.5', description: 'Clinical Overview (EU-specific benefit-risk)', required: true, criticality: 'blocking' as const },
      ];
    }

    return commonCTD;
  }

  private buildChecklist(
    requirements: ReturnType<ValidateCompletenessEngine['getRequirements']>,
    input: ValidateInput
  ): CompletenessCheckItem[] {
    return requirements.map(req => {
      const present = input.presentSections.some(s =>
        s.includes(req.section) || s.includes(req.description.toLowerCase()) ||
        s.toLowerCase().includes(req.section.toLowerCase())
      );
      const qualityScore = input.sectionScores?.[req.section] ?? null;
      const needsReview = present && qualityScore !== null && qualityScore < 70;

      let status: CompletenessCheckItem['status'];
      if (present && !needsReview) status = 'complete';
      else if (present && needsReview) status = 'present_needs_review';
      else if (!present && req.required) status = 'missing_required';
      else status = 'missing_optional';

      return {
        module: req.module,
        section: req.section,
        description: req.description,
        required: req.required,
        present,
        qualityScore,
        status,
        remediation: status === 'missing_required'
          ? `BLOCKER: ${req.description} is required for ${input.submissionType} submission. Prepare and include before filing.`
          : status === 'present_needs_review'
            ? `Quality score ${qualityScore}/100 is below threshold. Review and strengthen this section.`
            : undefined,
      };
    });
  }

  private assessRTFRisk(checklist: CompletenessCheckItem[], input: ValidateInput): RTFRiskAssessment {
    const missingCritical = checklist
      .filter(c => c.status === 'missing_required' && c.module <= '3')
      .map(c => `${c.section}: ${c.description}`);

    const missingImportant = checklist
      .filter(c => c.status === 'missing_required' && c.module > '3')
      .map(c => `${c.section}: ${c.description}`);

    const weakSections = checklist
      .filter(c => c.status === 'present_needs_review')
      .map(c => `${c.section}: ${c.description} (score: ${c.qualityScore})`);

    // RTF score: 0 = definitely RTF, 100 = no RTF risk
    let rtfScore = 100;
    rtfScore -= missingCritical.length * 20;
    rtfScore -= missingImportant.length * 8;
    rtfScore -= weakSections.length * 5;
    if (input.harmonizeIssueCount) rtfScore -= Math.min(input.harmonizeIssueCount * 3, 15);
    if (input.openEscalations) rtfScore -= Math.min(input.openEscalations * 5, 20);
    rtfScore = Math.max(0, Math.min(100, rtfScore));

    const overallRTFRisk: RTFRiskAssessment['overallRTFRisk'] =
      rtfScore < 30 ? 'critical'
        : rtfScore < 50 ? 'high'
          : rtfScore < 75 ? 'medium'
            : 'low';

    return { overallRTFRisk, rtfScore, missingCritical, missingImportant, weakSections };
  }

  private buildGoNoGo(
    checklist: CompletenessCheckItem[],
    rtfRisk: RTFRiskAssessment,
    input: ValidateInput
  ): GoNoGoDecision {
    const blockers = rtfRisk.missingCritical.slice();
    if (input.openEscalations && input.openEscalations > 0) {
      blockers.push(`${input.openEscalations} open escalation(s) require resolution`);
    }

    const risks = [
      ...rtfRisk.missingImportant.map(s => `Missing: ${s}`),
      ...rtfRisk.weakSections.map(s => `Low quality: ${s}`),
    ];

    if (input.harmonizeIssueCount && input.harmonizeIssueCount > 0) {
      risks.push(`${input.harmonizeIssueCount} HARMONIZE consistency issue(s) detected`);
    }

    const readinessScore = Math.round(
      (checklist.filter(c => c.status === 'complete').length / checklist.length) * 100
    );

    let decision: GoNoGoDecision['decision'];
    let rationale: string;
    const conditions: string[] = [];

    if (blockers.length > 0) {
      decision = 'no_go';
      rationale = `${blockers.length} blocking issue(s) prevent submission. Critical sections are missing or unresolved escalations exist.`;
    } else if (risks.length > 3 || rtfRisk.overallRTFRisk === 'high') {
      decision = 'conditional_go';
      rationale = `Submission is substantially complete but ${risks.length} risk(s) require mitigation before filing.`;
      conditions.push(
        'Address all high-priority consistency issues from HARMONIZE check',
        'Complete quality review for sections below threshold',
        'Obtain function head sign-off on risk acceptance memo',
      );
    } else {
      decision = 'go';
      rationale = `Submission is ready for filing. ${readinessScore}% completeness with ${risks.length} minor risk(s).`;
      if (risks.length > 0) {
        conditions.push('Document accepted risks in submission risk register');
      }
    }

    return { decision, readinessScore, rationale, conditions, blockers, risks };
  }
}

export const validateCompletenessEngine = new ValidateCompletenessEngine();
