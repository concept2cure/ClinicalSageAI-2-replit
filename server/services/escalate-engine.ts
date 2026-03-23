/**
 * ESCALATE Engine — Structured Escalation with Decision Framework
 *
 * Provides structured escalation recommendations with:
 * - Consequence assessment (regulatory, commercial, clinical)
 * - Owner assignment based on issue domain
 * - Urgency classification (immediate, next-business-day, scheduled)
 * - Decision framework (proceed, hold, revise, escalate-further)
 *
 * @module server/services/escalate-engine
 */

import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('escalate-engine');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EscalateInput {
  issueType: string;
  description: string;
  domain: 'clinical' | 'cmc' | 'safety' | 'regulatory' | 'labeling' | 'nonclinical' | 'statistical' | 'operational';
  severity: 'low' | 'medium' | 'high' | 'critical';
  submissionType: string;
  submissionPhase?: 'pre-submission' | 'active-review' | 'post-approval' | 'amendment';
  currentDeadline?: string;
  affectedSections?: string[];
}

export interface EscalationResult {
  escalationId: string;
  urgency: 'immediate' | 'next_business_day' | 'within_48h' | 'scheduled';
  consequence: ConsequenceAssessment;
  owner: OwnerAssignment;
  decisionFramework: DecisionFramework;
  timeline: EscalationTimeline;
  communicationPlan: CommunicationStep[];
}

export interface ConsequenceAssessment {
  regulatory: { impact: string; likelihood: 'low' | 'medium' | 'high'; detail: string };
  commercial: { impact: string; likelihood: 'low' | 'medium' | 'high'; detail: string };
  clinical: { impact: string; likelihood: 'low' | 'medium' | 'high'; detail: string };
  overallConsequence: 'minor' | 'moderate' | 'major' | 'severe';
}

export interface OwnerAssignment {
  primaryOwner: string;
  role: string;
  escalationChain: string[];
  rationale: string;
}

export interface DecisionFramework {
  recommendation: 'proceed' | 'hold' | 'revise' | 'escalate_further' | 'withdraw_section';
  rationale: string;
  conditions: string[];
  alternatives: Array<{ action: string; tradeoff: string; risk: string }>;
  requiredApprovals: string[];
}

export interface EscalationTimeline {
  immediateActions: string[];
  shortTermActions: Array<{ action: string; deadline: string }>;
  followUpActions: Array<{ action: string; deadline: string }>;
}

export interface CommunicationStep {
  audience: string;
  message: string;
  channel: string;
  timing: string;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class EscalateEngine {

  async evaluate(input: EscalateInput): Promise<EscalationResult> {
    log.info(`ESCALATE: ${input.issueType} (${input.severity}/${input.domain})`);

    const urgency = this.determineUrgency(input);
    const consequence = this.assessConsequence(input);
    const owner = this.assignOwner(input);
    const decisionFramework = this.buildDecisionFramework(input, consequence);
    const timeline = this.buildTimeline(input, urgency);
    const communicationPlan = this.buildCommunicationPlan(input, urgency, owner);

    return {
      escalationId: `ESC-${Date.now().toString(36).toUpperCase()}`,
      urgency,
      consequence,
      owner,
      decisionFramework,
      timeline,
      communicationPlan,
    };
  }

  private determineUrgency(input: EscalateInput): EscalationResult['urgency'] {
    // Critical safety issues = immediate
    if (input.severity === 'critical' && input.domain === 'safety') return 'immediate';
    if (input.severity === 'critical' && input.submissionPhase === 'active-review') return 'immediate';

    // Critical during active review = next business day
    if (input.severity === 'critical') return 'next_business_day';
    if (input.severity === 'high' && input.submissionPhase === 'active-review') return 'next_business_day';

    // High severity = within 48h
    if (input.severity === 'high') return 'within_48h';

    // Everything else = scheduled
    return 'scheduled';
  }

  private assessConsequence(input: EscalateInput): ConsequenceAssessment {
    const domainConsequences: Record<string, ConsequenceAssessment> = {
      safety: {
        regulatory: {
          impact: 'Clinical hold, CRL, or REMS requirement',
          likelihood: input.severity === 'critical' ? 'high' : 'medium',
          detail: 'Safety signals during review can trigger clinical hold (IND) or Complete Response Letter (NDA/BLA)',
        },
        commercial: {
          impact: 'Launch delay or restricted label',
          likelihood: input.severity === 'critical' ? 'high' : 'medium',
          detail: 'Safety concerns typically result in restricted labeling, REMS, or delayed approval',
        },
        clinical: {
          impact: 'Patient safety concern — potential study modification',
          likelihood: input.severity === 'critical' ? 'high' : 'medium',
          detail: 'May require DSMB review, protocol amendment, or informed consent revision',
        },
        overallConsequence: input.severity === 'critical' ? 'severe' : 'major',
      },
      clinical: {
        regulatory: {
          impact: 'Deficiency letter, additional studies requested',
          likelihood: input.severity === 'critical' ? 'high' : 'medium',
          detail: 'Clinical data gaps trigger Information Requests (IRs) or formal deficiency letters',
        },
        commercial: {
          impact: 'Timeline delay for additional clinical work',
          likelihood: 'medium',
          detail: 'Additional clinical studies can add 12-24 months to approval timeline',
        },
        clinical: {
          impact: 'Study design or endpoint adequacy questioned',
          likelihood: input.severity === 'critical' ? 'high' : 'low',
          detail: 'Endpoint validation, sample size adequacy, or statistical methodology concerns',
        },
        overallConsequence: input.severity === 'critical' ? 'major' : 'moderate',
      },
      cmc: {
        regulatory: {
          impact: 'RTF for CMC deficiency or GMP compliance failure',
          likelihood: input.severity === 'critical' ? 'high' : 'medium',
          detail: 'CMC deficiencies are the leading cause of Refuse to File actions',
        },
        commercial: {
          impact: 'Manufacturing readiness delay',
          likelihood: 'medium',
          detail: 'Process validation, stability, or facility compliance issues delay commercial supply',
        },
        clinical: {
          impact: 'Minimal direct clinical impact',
          likelihood: 'low',
          detail: 'CMC issues rarely affect clinical safety unless formulation change is required',
        },
        overallConsequence: input.severity === 'critical' ? 'major' : 'moderate',
      },
      regulatory: {
        regulatory: {
          impact: 'Submission strategy risk — wrong pathway or missing components',
          likelihood: input.severity === 'critical' ? 'high' : 'medium',
          detail: 'Regulatory strategy misalignment can result in RTF, CRL, or wrong submission type',
        },
        commercial: {
          impact: 'Market access strategy affected',
          likelihood: 'medium',
          detail: 'Regulatory pathway choice directly affects time to market and labeling scope',
        },
        clinical: {
          impact: 'May require additional clinical program modifications',
          likelihood: 'low',
          detail: 'Regulatory feedback may require protocol amendments or additional endpoints',
        },
        overallConsequence: input.severity === 'critical' ? 'major' : 'moderate',
      },
    };

    return domainConsequences[input.domain] || {
      regulatory: { impact: 'Potential submission impact', likelihood: 'medium', detail: 'Assess based on specific issue context' },
      commercial: { impact: 'Potential timeline impact', likelihood: 'low', detail: 'Evaluate commercial implications' },
      clinical: { impact: 'Minimal clinical impact expected', likelihood: 'low', detail: 'Monitor for clinical relevance' },
      overallConsequence: input.severity === 'critical' ? 'major' : 'moderate' as const,
    };
  }

  private assignOwner(input: EscalateInput): OwnerAssignment {
    const ownerMap: Record<string, OwnerAssignment> = {
      safety: {
        primaryOwner: 'VP, Drug Safety / Pharmacovigilance',
        role: 'Safety signal assessment and regulatory communication',
        escalationChain: ['Medical Director', 'Chief Medical Officer', 'CEO (if clinical hold risk)'],
        rationale: 'Safety issues require PV lead ownership with direct CMO escalation path',
      },
      clinical: {
        primaryOwner: 'Clinical Development Lead',
        role: 'Clinical data integrity and regulatory response',
        escalationChain: ['VP Clinical Development', 'Chief Medical Officer'],
        rationale: 'Clinical data questions require clinical team ownership for data analysis and response strategy',
      },
      cmc: {
        primaryOwner: 'VP, CMC / Pharmaceutical Development',
        role: 'Manufacturing and quality data remediation',
        escalationChain: ['SVP Manufacturing', 'Chief Operating Officer'],
        rationale: 'CMC deficiencies require manufacturing expertise and quality systems oversight',
      },
      regulatory: {
        primaryOwner: 'VP, Regulatory Affairs',
        role: 'Regulatory strategy and agency communication',
        escalationChain: ['SVP Regulatory', 'Chief Regulatory Officer', 'General Counsel (if legal implications)'],
        rationale: 'Regulatory strategy issues require RA leadership for pathway assessment and agency engagement',
      },
      statistical: {
        primaryOwner: 'Head of Biostatistics',
        role: 'Statistical methodology and analysis validation',
        escalationChain: ['VP Clinical Development', 'Chief Medical Officer'],
        rationale: 'Statistical methodology questions require biostatistics expertise',
      },
      labeling: {
        primaryOwner: 'Director, Regulatory Labeling',
        role: 'Labeling strategy and promotional review',
        escalationChain: ['VP Regulatory Affairs', 'Legal/Medical Affairs'],
        rationale: 'Labeling issues span regulatory, medical, legal, and commercial considerations',
      },
      nonclinical: {
        primaryOwner: 'VP, Nonclinical Development',
        role: 'Nonclinical data assessment and study design',
        escalationChain: ['Chief Scientific Officer', 'Chief Medical Officer'],
        rationale: 'Nonclinical findings require scientific expertise for risk assessment',
      },
      operational: {
        primaryOwner: 'Director, Regulatory Operations',
        role: 'Submission assembly and timeline management',
        escalationChain: ['VP Regulatory Affairs', 'Program Management Lead'],
        rationale: 'Operational issues require project management and submission logistics expertise',
      },
    };

    return ownerMap[input.domain] || ownerMap.regulatory;
  }

  private buildDecisionFramework(input: EscalateInput, consequence: ConsequenceAssessment): DecisionFramework {
    if (consequence.overallConsequence === 'severe') {
      return {
        recommendation: 'hold',
        rationale: `Severe consequence identified in ${input.domain} domain. Submission progress should be paused until issue is resolved.`,
        conditions: [
          'Root cause fully identified and documented',
          'Remediation plan approved by relevant function head',
          'Impact assessment on timeline completed',
          'Agency communication strategy defined (if applicable)',
        ],
        alternatives: [
          { action: 'Proceed with risk acceptance', tradeoff: 'Faster timeline but higher rejection probability', risk: 'CRL/RTF likely if unresolved' },
          { action: 'Withdraw affected section', tradeoff: 'Removes risk but may reduce label scope', risk: 'Narrower approved indication' },
        ],
        requiredApprovals: ['Chief Medical Officer', 'VP Regulatory Affairs', 'Program Governance Board'],
      };
    }

    if (consequence.overallConsequence === 'major') {
      return {
        recommendation: 'revise',
        rationale: `Major issue in ${input.domain} requires section revision before submission. Proceed only after fix is verified.`,
        conditions: [
          'Affected section(s) revised and re-reviewed',
          'Cross-section consistency verified (HARMONIZE)',
          'Function head sign-off obtained',
        ],
        alternatives: [
          { action: 'Proceed as-is with risk memo', tradeoff: 'Maintains timeline but documents known weakness', risk: 'IR or deficiency letter likely' },
          { action: 'Request pre-submission meeting', tradeoff: 'Adds 2-3 months but de-risks agency position', risk: 'Minimal — proactive engagement is favorable' },
        ],
        requiredApprovals: ['VP Regulatory Affairs', 'Function Head'],
      };
    }

    if (consequence.overallConsequence === 'moderate') {
      return {
        recommendation: 'proceed',
        rationale: `Moderate issue that can be managed through submission narrative and proactive communication.`,
        conditions: [
          'Issue documented in risk register',
          'Mitigation strategy incorporated into submission narrative',
          'Reviewer briefing document prepared',
        ],
        alternatives: [
          { action: 'Revise affected section', tradeoff: 'Stronger submission but slight timeline impact', risk: 'Minimal — improves quality' },
        ],
        requiredApprovals: ['Regulatory Lead'],
      };
    }

    return {
      recommendation: 'proceed',
      rationale: 'Minor issue — proceed with standard review process.',
      conditions: ['Issue logged in submission tracker'],
      alternatives: [],
      requiredApprovals: ['Section Author'],
    };
  }

  private buildTimeline(input: EscalateInput, urgency: EscalationResult['urgency']): EscalationTimeline {
    const immediateActions: string[] = [];
    const shortTermActions: Array<{ action: string; deadline: string }> = [];
    const followUpActions: Array<{ action: string; deadline: string }> = [];

    if (urgency === 'immediate') {
      immediateActions.push(
        'Notify primary owner and escalation chain within 1 hour',
        'Convene cross-functional triage call within 4 hours',
        'Prepare preliminary impact assessment',
      );
      shortTermActions.push(
        { action: 'Complete root cause analysis', deadline: '24 hours' },
        { action: 'Draft remediation plan', deadline: '48 hours' },
        { action: 'Determine agency communication need', deadline: '24 hours' },
      );
    } else if (urgency === 'next_business_day') {
      immediateActions.push(
        'Send escalation notification to primary owner',
        'Document issue in submission risk register',
      );
      shortTermActions.push(
        { action: 'Triage meeting with relevant functions', deadline: '1 business day' },
        { action: 'Impact assessment on submission timeline', deadline: '2 business days' },
        { action: 'Draft resolution approach', deadline: '3 business days' },
      );
    } else {
      immediateActions.push('Log issue in submission tracker');
      shortTermActions.push(
        { action: 'Review at next team meeting', deadline: '1 week' },
        { action: 'Assign remediation owner', deadline: '1 week' },
      );
    }

    followUpActions.push(
      { action: 'Verify resolution and close escalation', deadline: 'Per remediation plan' },
      { action: 'Update HARMONIZE check for affected sections', deadline: 'Before submission' },
      { action: 'Lessons learned capture', deadline: '2 weeks post-resolution' },
    );

    return { immediateActions, shortTermActions, followUpActions };
  }

  private buildCommunicationPlan(
    input: EscalateInput,
    urgency: EscalationResult['urgency'],
    owner: OwnerAssignment
  ): CommunicationStep[] {
    const steps: CommunicationStep[] = [
      {
        audience: owner.primaryOwner,
        message: `${input.severity.toUpperCase()} escalation: ${input.issueType} — ${input.description.substring(0, 200)}`,
        channel: urgency === 'immediate' ? 'Phone + Email' : 'Email',
        timing: urgency === 'immediate' ? 'Immediately' : 'Within 4 hours',
      },
    ];

    if (input.severity === 'critical' || input.severity === 'high') {
      steps.push({
        audience: 'Escalation Chain',
        message: `Escalation summary with impact assessment and proposed next steps`,
        channel: 'Email with calendar invite for triage',
        timing: urgency === 'immediate' ? 'Within 2 hours' : 'Next business day',
      });
    }

    if (input.submissionPhase === 'active-review') {
      steps.push({
        audience: 'Regulatory Agency Contact',
        message: 'Assess need for proactive agency notification or amendment',
        channel: 'Per agency communication protocol',
        timing: 'After internal alignment (within 72 hours for safety issues)',
      });
    }

    steps.push({
      audience: 'Program Team',
      message: 'Status update on escalation and any timeline implications',
      channel: 'Team meeting or email update',
      timing: 'Next scheduled meeting or within 1 week',
    });

    return steps;
  }
}

export const escalateEngine = new EscalateEngine();
