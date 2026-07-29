/**
 * Special designation → eligibility criteria and benefits.
 * @module shared/constants/domain/mappings/designation-eligibility
 */

export interface DesignationInfo {
  id: string;
  name: string;
  agency: string;
  /** Eligibility criteria summary. */
  eligibility: string;
  /** Evidence required to apply. */
  evidenceRequired: string;
  /** Benefits granted. */
  benefits: string[];
  /** Regulatory reference. */
  reference: string;
}

export const DESIGNATION_INFO: DesignationInfo[] = [
  {
    id: 'fda_orphan',
    name: 'Orphan Drug Designation',
    agency: 'FDA',
    eligibility: 'Disease or condition affecting fewer than 200,000 persons in the US, or no reasonable expectation of cost recovery',
    evidenceRequired: 'Scientific rationale for use in the rare disease; may include preclinical or early clinical data',
    benefits: ['7-year market exclusivity', 'Tax credits for clinical trial costs', 'Waiver of PDUFA application fee', 'FDA Office of Orphan Products assistance'],
    reference: '21 CFR Part 316; Orphan Drug Act (1983)',
  },
  {
    id: 'fda_fast_track',
    name: 'Fast Track Designation',
    agency: 'FDA',
    eligibility: 'Drug intended to treat a serious or life-threatening condition AND demonstrates potential to address unmet medical need',
    evidenceRequired: 'Nonclinical or clinical data demonstrating potential to address unmet need',
    benefits: ['More frequent FDA meetings', 'Rolling review of NDA/BLA sections', 'Eligibility for accelerated approval and priority review'],
    reference: '21 USC 356; FDA Safety and Innovation Act (FDASIA)',
  },
  {
    id: 'fda_breakthrough_therapy',
    name: 'Breakthrough Therapy Designation',
    agency: 'FDA',
    eligibility: 'Drug intended to treat a serious condition AND preliminary clinical evidence indicates substantial improvement over existing therapies on a clinically significant endpoint',
    evidenceRequired: 'Preliminary clinical evidence (Phase 1 or 2) showing substantial improvement',
    benefits: ['All Fast Track features', 'Intensive FDA guidance on development program', 'Organizational commitment involving senior managers', 'Eligibility for rolling review'],
    reference: '21 USC 356(a); FDASIA Section 902',
  },
  {
    id: 'fda_accelerated_approval',
    name: 'Accelerated Approval',
    agency: 'FDA',
    eligibility: 'Drug for serious condition that provides meaningful therapeutic benefit over available therapies, based on surrogate or intermediate clinical endpoint',
    evidenceRequired: 'Adequate and well-controlled trials demonstrating effect on surrogate endpoint reasonably likely to predict clinical benefit',
    benefits: ['Approval based on surrogate endpoint', 'Earlier market access', 'Post-marketing confirmatory study required'],
    reference: '21 CFR 314.510 (drugs); 21 CFR 601.41 (biologics)',
  },
  {
    id: 'fda_priority_review',
    name: 'Priority Review',
    agency: 'FDA',
    eligibility: 'Application for drug that treats a serious condition AND would provide significant improvement in safety or effectiveness',
    evidenceRequired: 'Complete NDA/BLA application; FDA determination at filing',
    benefits: ['6-month review goal (vs. 10-month standard)', 'FDA action date 2 months earlier'],
    reference: 'PDUFA commitments; FDA MAPP 6020.3',
  },
  {
    id: 'fda_rmat',
    name: 'Regenerative Medicine Advanced Therapy (RMAT)',
    agency: 'FDA',
    eligibility: 'Regenerative medicine therapy (cell therapy, gene therapy, tissue engineering) for serious or life-threatening condition with preliminary clinical evidence of addressing unmet need',
    evidenceRequired: 'Preliminary clinical evidence (may include case series)',
    benefits: ['All Breakthrough Therapy features', 'Potential use of surrogate or intermediate endpoints for accelerated approval', 'Eligibility for priority review'],
    reference: '21st Century Cures Act Section 3033; 21 USC 356(g)',
  },
  {
    id: 'fda_breakthrough_device',
    name: 'Breakthrough Device Designation',
    agency: 'FDA',
    eligibility: 'Device that provides more effective treatment/diagnosis of life-threatening or irreversibly debilitating disease AND meets one of: (1) represents breakthrough technology, (2) no approved alternatives, (3) significant advantage, (4) in patient\'s best interest',
    evidenceRequired: 'Preclinical or early clinical data supporting the designation criteria',
    benefits: ['Priority review', 'Expedited interaction with FDA', 'Flexible clinical study design', 'Data development plan', 'Pre-market review within 150 days of receipt'],
    reference: '21st Century Cures Act Section 3051; FD&C Act Section 515B',
  },
  {
    id: 'ema_prime',
    name: 'PRIME (PRIority MEdicines)',
    agency: 'EMA',
    eligibility: 'Medicine targeting unmet medical need, with preliminary clinical evidence of substantial improvement over existing treatments',
    evidenceRequired: 'Preliminary clinical data (exceptions for ATMPs/academic sponsors with compelling nonclinical data)',
    benefits: ['Rapporteur appointed early', 'Kick-off meeting with CHMP/CAT', 'Scientific advice at key development milestones', 'Accelerated assessment eligibility at MAA'],
    reference: 'EMA/CHMP/57760/2015',
  },
  {
    id: 'ema_orphan',
    name: 'Orphan Designation (EU)',
    agency: 'EMA',
    eligibility: 'Condition affecting not more than 5 in 10,000 persons in the EU, AND no satisfactory method of treatment exists or significant benefit demonstrated',
    evidenceRequired: 'Medical plausibility of use in the condition; prevalence data',
    benefits: ['10-year market exclusivity', 'Protocol assistance', 'Fee reductions', 'Centralized procedure access'],
    reference: 'Regulation (EC) No 141/2000',
  },
  {
    id: 'ema_conditional_ma',
    name: 'Conditional Marketing Authorisation',
    agency: 'EMA',
    eligibility: 'Medicine for seriously debilitating or life-threatening disease OR public health emergency, where benefit-risk is positive but comprehensive clinical data not yet complete',
    evidenceRequired: 'Positive benefit-risk with less comprehensive data; commitment to provide confirmatory data',
    benefits: ['Marketing authorisation before complete data', 'Annual renewal with data updates', 'Conversion to standard MA when data complete'],
    reference: 'Regulation (EC) No 507/2006',
  },
  {
    id: 'pmda_sakigake',
    name: 'SAKIGAKE Designation',
    agency: 'PMDA',
    eligibility: 'Innovative drug/device developed in Japan first, for serious disease with no existing treatment, with significant clinical superiority expected',
    evidenceRequired: 'Early clinical data showing potential; Japan-first development plan',
    benefits: ['Priority consultation', 'Dedicated review team', '6-month total review period', 'Conditional early approval possible'],
    reference: 'MHLW Notification (2015, revised 2020)',
  },
];

export function getDesignation(id: string): DesignationInfo | undefined {
  return DESIGNATION_INFO.find(d => d.id === id);
}

export function getDesignationsForAgency(agency: string): DesignationInfo[] {
  return DESIGNATION_INFO.filter(d => d.agency === agency);
}
