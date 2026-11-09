/**
 * Regulatory Strategy Intelligence: FDA meeting timing and practical advice
 * =========================================================================
 *
 * Pure lookups by meeting purpose, development phase and product type, moved
 * unchanged out of regulatory-strategy-knowledge.ts on 2026-11-09 (Rule 2 S5d)
 * so that engine stays under the repository's byte ceiling and its reference
 * sibling under the line ceiling. Read by planFDAMeeting. Deterministic: no
 * LLM, no network, no database.
 *
 * @module server/services/regulatory-strategy/regulatory-strategy-meeting-advice
 */

import type { DevelopmentPhase, MeetingPurpose, ProductType } from './regulatory-strategy-knowledge';

export function getSubmissionTiming(purpose: MeetingPurpose, phase: DevelopmentPhase): string {
  switch (purpose) {
    case 'pre_ind':
      return 'Submit meeting request 2-3 months before planned IND submission to allow time for scheduling and FDA response.';
    case 'eop1':
      return 'Submit meeting request upon availability of Phase 1 data, typically 1-2 months before planned Phase 2 initiation.';
    case 'eop2':
      return 'Submit meeting request 2-4 months before planned Phase 3 initiation. EOP2 is the most strategically important meeting — allow adequate time for preparation.';
    case 'pre_phase3':
      return 'Submit meeting request 2-3 months before planned Phase 3 protocol finalization.';
    case 'pre_nda_bla':
      return 'Submit meeting request at least 6 months before planned NDA/BLA submission to allow for filing format discussions and resolution of any outstanding issues.';
    case 'type_a_urgent':
      return 'Submit as soon as the urgent issue is identified. Type A meetings have 30-day scheduling targets.';
    case 'dispute_resolution':
      return 'Submit after exhausting informal dispute resolution at the review division level. Formal dispute follows MAPP 4151.7 procedures.';
    case 'pre_submission_505b2':
      return 'Submit meeting request 3-6 months before planned 505(b)(2) submission to discuss clinical bridging strategy and data requirements.';
    case 'pre_submission_anda':
      return 'Submit meeting request 3-6 months before planned ANDA submission per GDUFA III pre-ANDA meeting goals.';
    default:
      return 'Submit meeting request at the appropriate development milestone. Allow 75 calendar days for Type B/C scheduling.';
  }
}

export function getTimingRecommendations(purpose: MeetingPurpose, phase: DevelopmentPhase): string[] {
  const common: string[] = [
    'Begin briefing document preparation at least 6 weeks before the meeting to allow for internal review and revision',
    'Conduct a mock meeting or dry run 1-2 weeks before the actual FDA meeting',
    'Identify and prepare the lead spokesperson for each question area',
  ];

  switch (purpose) {
    case 'pre_ind':
      return [
        ...common,
        'Pre-IND meeting should occur 2-3 months before planned IND submission',
        'Key topics: overall nonclinical plan adequacy, first-in-human dose selection rationale, Phase 1 design',
        'Use this meeting to identify any deal-breaking FDA concerns before investing in IND-enabling studies',
        'For novel mechanisms: discuss biomarker strategy, patient selection, and dose escalation scheme',
      ];
    case 'eop2':
      return [
        ...common,
        'EOP2 is the single most important meeting in drug development — invest heavily in preparation',
        'Request meeting 2-4 months before planned Phase 3 initiation',
        'Key topics: pivotal trial design, primary endpoint, statistical analysis plan, patient population, adequacy of safety database',
        'Come with a clearly articulated proposed Phase 3 plan and ask FDA to agree or propose modifications',
        'Discuss regulatory pathway (standard vs. accelerated) and any expedited program designations',
        'If accelerated approval is contemplated, discuss the proposed surrogate/intermediate endpoint',
        'Include proposed label claims and their evidentiary basis',
      ];
    case 'pre_nda_bla':
      return [
        ...common,
        'Schedule pre-NDA/BLA meeting at least 6 months before planned submission',
        'Key topics: submission format, eCTD structure, data presentation, any outstanding study issues',
        'Discuss proposed product labeling and prescribing information',
        'Confirm the filing checklist and any division-specific requirements',
        'Address any outstanding safety signals or risk management strategies',
        'Discuss the need for Advisory Committee meeting',
        'Confirm the anticipated review timeline (Priority vs. Standard)',
      ];
    case 'type_a_urgent':
      return [
        ...common,
        'Type A meetings have 30-day scheduling targets — prepare quickly',
        'For clinical holds: focus on the specific hold issue and proposed resolution',
        'For Complete Response Letter follow-up: address each deficiency clearly',
        'Bring proposed resolution for each issue with supporting data',
      ];
    default:
      return [
        ...common,
        'Allow appropriate lead time for meeting scheduling and preparation',
        'Focus questions on the most critical decision points in the development program',
      ];
  }
}

export function getPracticalAdvice(purpose: MeetingPurpose, productType: ProductType): string[] {
  const general: string[] = [
    'Designate a single point of contact for all FDA communications',
    'Keep the meeting team small and focused — typically 5-8 people from the sponsor',
    'The most senior scientific/medical person should lead the discussion',
    'Listen more than talk — the goal is to understand FDA thinking, not to convince them',
    'Take detailed notes — the official minutes are the legally binding record',
    'Do not introduce new data or topics at the meeting that were not in the briefing document',
    'If FDA raises unexpected concerns, acknowledge them and request time to respond rather than arguing',
    'Follow up on all action items within the agreed timeline',
  ];

  const productSpecific: string[] = [];
  switch (productType) {
    case 'biologic':
    case 'cell_therapy':
    case 'gene_therapy':
    case 'tissue_engineered':
      productSpecific.push(
        'For biologics and advanced therapies, CBER meetings may have different procedures than CDER — confirm with the relevant division',
        'Discuss manufacturing comparability strategy if process changes are anticipated',
        'For cell/gene therapy: confirm long-term follow-up expectations (15 years for integrating vectors per FDA LTFU Guidance)',
      );
      break;
    case 'biosimilar':
      productSpecific.push(
        'For biosimilar meetings, discuss the analytical similarity assessment plan and its impact on clinical study requirements',
        'Confirm the reference product and any cross-referencing arrangements',
      );
      break;
    case 'combination_product':
      productSpecific.push(
        'For combination products, confirm the lead center (CDER, CBER, or CDRH) assignment',
        'Discuss the product classification and applicable regulatory pathway (PMA, 510(k), NDA, BLA)',
      );
      break;
    default:
      break;
  }

  return [...general, ...productSpecific];
}
