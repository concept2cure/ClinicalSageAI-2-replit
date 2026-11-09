/**
 * Regulatory Strategy Intelligence — fixed reference data
 *
 * The Japan rows (read from the one Japanese programmes record,
 * server/services/ind/ctd/jp-programs.ts), the FDA expedited-program registry and
 * comparison matrix, the FDA meeting types, briefing template and purpose map,
 * the orphan prevalence thresholds, the 505 pathway, exclusivity and
 * certification data and the global pathway registry of
 * regulatory-strategy-knowledge.ts, moved here unchanged on 2026-11-09 (Rule 2
 * S5d) so that the engine is under the 100,000-byte ceiling (CLAUDE.md Rule 6: a
 * file split out of a large one goes inside the folder it came from). Pure data:
 * no LLM, no network, no database. The engine is the only importer.
 *
 * @module server/services/regulatory-strategy/regulatory-strategy-reference
 */

import { getJpProgram, jpProgramBasisLabel, type JpProgram } from '../ind/ctd/jp-programs';
import type {
  CertificationType,
  DevelopmentPhase,
  ExpeditedProgramName,
  ExpeditedProgramResult,
  MeetingPurpose,
  ProductType,
  MeetingTypeClassification,
  MeetingTypeInfo,
  BriefingDocumentSection,
  PathwayRecommendation,
  PathwayType,
  PatentExclusivity,
  RegionalPathwayInfo,
  TargetMarket,
} from './regulatory-strategy-knowledge';

// ── Japan, from the one Japanese programmes record ──────────────────────────

/** A Japan expedited pathway row rendered from jp-programs.ts; `equivalent` is this module's cross-market mapping. */
export function jpExpeditedPathway(id: string, equivalent: string): RegionalPathwayInfo['expeditedPathways'][number] {
  const p: JpProgram = getJpProgram(id);
  const effective = p.effectiveFrom ? ` In force from ${p.effectiveFrom}.` : '';
  return {
    name: p.name,
    equivalent,
    criteria: [...p.criteria],
    benefits: [`${p.benefit}${effective} Basis: ${jpProgramBasisLabel(p)}.`],
  };
}

/** Japan's conditional approval, rendered from jp-programs.ts. */
export function jpConditionalApproval(): RegionalPathwayInfo['conditionalApproval'] {
  const p = getJpProgram('pmda-conditional-approval');
  return { name: p.name, criteria: [...p.criteria], postApprovalRequirements: [...(p.conditions ?? [])] };
}

// ── Expedited Program Registry ──────────────────────────────────────────────

export interface ExpeditedProgramDef {
  displayName: string;
  statutoryBasis: string;
  criteria: string[];
  benefits: string[];
  applicationTiming: string;
  keyRequirements: string[];
  regulatoryBasis: string[];
  caveats: string[];
}

export const EXPEDITED_PROGRAM_REGISTRY: Record<ExpeditedProgramName, ExpeditedProgramDef> = {
  fast_track: {
    displayName: 'Fast Track Designation',
    statutoryBasis: 'FD&C Act Section 506(b), as amended by FDASIA 2012',
    criteria: [
      'Product is intended to treat a serious or life-threatening condition',
      'Product demonstrates potential to address an unmet medical need',
      'Unmet medical need: no therapy exists, or potential advantage over available therapy (effectiveness, avoidance of serious side effects, improved compliance that may lead to improved outcomes, effectiveness in a new subpopulation)',
    ],
    benefits: [
      'Rolling review: sections of NDA/BLA reviewed as completed rather than waiting for complete submission',
      'More frequent meetings and communications with FDA to discuss drug development plan',
      'Eligibility for Accelerated Approval and Priority Review if relevant criteria met',
      'Written communication from FDA within 60 calendar days of request',
    ],
    applicationTiming:
      'May be requested at any time during development, including prior to IND submission. Most commonly requested with IND or at End-of-Phase 1.',
    keyRequirements: [
      'Submit Fast Track designation request including: indication and intended use, rationale for serious condition, evidence of unmet medical need, description of clinical development program, data supporting product potential',
      'FDA response within 60 calendar days of receipt of request',
      'Rescission possible if product no longer meets criteria',
    ],
    regulatoryBasis: [
      'FD&C Act Section 506(b) [21 USC 356(b)]',
      'FDA Guidance: Expedited Programs for Serious Conditions — Drugs and Biologics (2014, revised)',
      'FDASIA Section 901 (2012)',
      '21 CFR 312.300 — IND content and format',
    ],
    caveats: [
      'Fast Track does not change the standard of evidence for approval',
      'Rolling review does not guarantee faster review time — it allows earlier submission of completed sections',
      'Designation can be rescinded if the product no longer meets criteria',
      'Not available for drugs that are not intended to treat a serious condition',
    ],
  },
  breakthrough_therapy: {
    displayName: 'Breakthrough Therapy Designation',
    statutoryBasis: 'FD&C Act Section 506(a), as added by FDASIA 2012 Section 902',
    criteria: [
      'Product is intended to treat a serious or life-threatening condition',
      'Preliminary clinical evidence indicates that the drug may demonstrate SUBSTANTIAL IMPROVEMENT over existing therapies on one or more clinically significant endpoints',
      'Substantial improvement: clear advantage over available therapy — not merely a different mechanism of action. Evidence of a clinically meaningful advantage is required.',
      'Clinical evidence is typically Phase 1 or Phase 2 data, but earlier data may be acceptable if compelling',
    ],
    benefits: [
      'All features of Fast Track designation (rolling review, more frequent meetings)',
      'Intensive guidance on an efficient drug development program, beginning as early as Phase 1',
      'Organizational commitment involving senior managers at FDA',
      'Rolling review',
      'Potential for other actions to expedite review (e.g., involving senior managers/experienced review staff, FDA cross-disciplinary meetings, project management involvement)',
    ],
    applicationTiming:
      'Should be requested no later than End-of-Phase 2 meeting request. Typically requested after preliminary clinical evidence is available (Phase 1/2 data). FDA encourages early requests.',
    keyRequirements: [
      'Submit Breakthrough Therapy designation request with preliminary clinical evidence of substantial improvement',
      'Clinical evidence must include some evidence from a clinical trial (not just preclinical or mechanistic data)',
      'FDA response within 60 calendar days of receipt of request',
      'Must identify the serious condition and the available therapies for comparison',
    ],
    regulatoryBasis: [
      'FD&C Act Section 506(a) [21 USC 356(a)]',
      'FDASIA Section 902 (2012)',
      'FDA Guidance: Expedited Programs for Serious Conditions — Drugs and Biologics (2014, revised)',
      'FDA Breakthrough Therapy Designation: Frequently Asked Questions (2018)',
    ],
    caveats: [
      'Higher bar than Fast Track — requires preliminary CLINICAL evidence of substantial improvement',
      'Preclinical data alone is insufficient; at least some clinical evidence required',
      'Designation can be rescinded if further data do not support substantial improvement',
      'Does not change the evidentiary standard for approval',
      'About 30-40% of requests are granted historically',
    ],
  },
  accelerated_approval: {
    displayName: 'Accelerated Approval',
    statutoryBasis: 'FD&C Act Section 506(c), as amended by FDORA 2022',
    criteria: [
      'Product is intended to treat a serious or life-threatening condition',
      'Product provides a meaningful therapeutic benefit over existing treatments (addresses unmet medical need)',
      'Approval based on a surrogate endpoint reasonably likely to predict clinical benefit OR an intermediate clinical endpoint',
      'FDORA 2022 updates: FDA has enhanced authority to require and enforce post-marketing confirmatory studies',
    ],
    benefits: [
      'Earlier approval based on surrogate or intermediate endpoint rather than waiting for definitive clinical benefit data',
      'Enables access to treatments for serious conditions years earlier than traditional approval timeline',
      'Can be combined with other expedited programs (Fast Track, Breakthrough, Priority Review)',
    ],
    applicationTiming:
      'Discussed with FDA at End-of-Phase 2 or pre-Phase 3 meeting. The surrogate/intermediate endpoint must be agreed upon with FDA before pivotal trial design.',
    keyRequirements: [
      'Identification and agreement with FDA on the surrogate or intermediate endpoint',
      'Adequate and well-controlled clinical trial demonstrating effect on agreed endpoint',
      'Commitment to conduct confirmatory post-marketing study (FDORA 2022: FDA can require study to be underway at time of approval)',
      'Post-marketing study must verify and describe the predicted clinical benefit',
      'FDORA 2022: FDA can require progress reports, can use expedited withdrawal if confirmatory study fails or is not conducted with due diligence',
      'Promotional materials require pre-review',
    ],
    regulatoryBasis: [
      'FD&C Act Section 506(c) [21 USC 356(c)]',
      '21 CFR Part 314 Subpart H (drugs), 21 CFR Part 601 Subpart E (biologics)',
      'FDA Guidance: Expedited Programs for Serious Conditions — Drugs and Biologics (2014, revised)',
      'FDORA (Food and Drug Omnibus Reform Act) 2022 — Sections 3201-3210',
      'FDA Guidance: Accelerated Approval Program — Fulfillment of Postmarketing Requirements (draft 2023)',
    ],
    caveats: [
      'FDORA 2022 significantly strengthened FDA authority over post-marketing requirements',
      'FDA can now require confirmatory trial to be underway at the time of accelerated approval',
      'Expedited withdrawal proceedings available if sponsor fails to conduct confirmatory study with due diligence',
      'Approval may be withdrawn if confirmatory study does not verify clinical benefit',
      'Historical concern: ~20% of accelerated approvals eventually withdrawn or indication narrowed',
      'Surrogate endpoint must be "reasonably likely to predict clinical benefit" — lower bar than validated surrogate',
    ],
  },
  priority_review: {
    displayName: 'Priority Review Designation',
    statutoryBasis: 'FD&C Act Section 505(b), PDUFA performance goals',
    criteria: [
      'Application for a drug that, if approved, would provide a significant improvement in the safety or effectiveness of the treatment, diagnosis, or prevention of a serious condition compared to available therapy',
      'Significant improvement may include: evidence of increased effectiveness, elimination or substantial reduction of a treatment-limiting adverse reaction, enhanced compliance leading to improved outcomes, effectiveness in a new subpopulation, safety and effectiveness of a new dosage form, convenience or ease of use',
    ],
    benefits: [
      'FDA review target shortened from 10 months (Standard) to 6 months from filing date',
      '8-month review clock for Priority NMEs under PDUFA VII',
      'Does NOT change the scientific/medical standard for approval',
    ],
    applicationTiming:
      'Determined at the time of NDA/BLA filing. Sponsor can request Priority Review in the submission cover letter. FDA may grant Priority Review independently.',
    keyRequirements: [
      'Include Priority Review request in NDA/BLA submission cover letter',
      'Provide data and rationale for why product represents a significant improvement over available therapy',
      'FDA determines Priority Review eligibility within 60 days of receipt (at the filing/refuse to file stage)',
      'Priority Review Voucher (PRV) programs: tropical disease, rare pediatric disease — voucher can be applied to any subsequent NDA/BLA submission',
    ],
    regulatoryBasis: [
      'PDUFA VII (Prescription Drug User Fee Amendments, 2022-2027) Performance Goals',
      'FD&C Act Section 505(b) [21 USC 355(b)]',
      'FDA Guidance: Expedited Programs for Serious Conditions — Drugs and Biologics (2014, revised)',
      'FDA MAPP 6020.3 — Priority Review',
    ],
    caveats: [
      'Shorter review time does NOT mean lower evidentiary standard',
      'Review clock starts from the filing date (60-day filing review occurs first)',
      'FDA may reclassify from Priority to Standard if data review does not support significant improvement claim',
      'Priority Review does not guarantee approval — it only expedites the review process',
      'Priority Review Vouchers (PRVs) are separate programs — not the same as Priority Review designation',
    ],
  },
  rmat: {
    displayName: 'Regenerative Medicine Advanced Therapy (RMAT) Designation',
    statutoryBasis: 'FD&C Act Section 506(g), as added by 21st Century Cures Act (2016)',
    criteria: [
      'Product is a regenerative medicine therapy: cell therapy, therapeutic tissue engineering product, human cell and tissue product, or any combination product using such therapies or products',
      'Also includes gene therapies and certain combination products',
      'Product is intended to treat, modify, reverse, or cure a serious or life-threatening disease or condition',
      'Preliminary clinical evidence indicates that the drug has the potential to address unmet medical needs for such disease or condition',
    ],
    benefits: [
      'All benefits of Fast Track and Breakthrough Therapy designations combined',
      'Intensive FDA guidance on efficient development program',
      'Organizational commitment involving senior managers',
      'Rolling review',
      'Potential for accelerated approval based on surrogate or intermediate endpoints',
      'Eligibility for Priority Review',
      'Potential use of post-approval patient registries or other real-world evidence sources to fulfill post-marketing requirements',
    ],
    applicationTiming:
      'May be requested at any time during development after preliminary clinical evidence is available. FDA encourages early requests.',
    keyRequirements: [
      'Product must qualify as a "regenerative medicine therapy" (cell therapy, gene therapy, tissue engineering, HCT/P, or combination)',
      'Preliminary clinical evidence required (similar standard to Breakthrough Therapy)',
      'Submit RMAT designation request to relevant FDA review division',
      'FDA response within 60 calendar days of receipt of request',
    ],
    regulatoryBasis: [
      'FD&C Act Section 506(g) [21 USC 356(g)]',
      '21st Century Cures Act Section 3033 (2016)',
      'FDA Guidance: Regulatory Considerations for Human Cells, Tissues, and Cellular and Tissue-Based Products: Minimal Manipulation and Homologous Use (2020)',
      'FDA Guidance: Expedited Programs for Regenerative Medicine Therapies for Serious Conditions (2019)',
    ],
    caveats: [
      'Only available for regenerative medicine therapies — not small molecules or traditional biologics',
      'Preliminary clinical evidence required — preclinical data alone is insufficient',
      'Gene therapies are eligible for RMAT (even though also eligible for Breakthrough Therapy)',
      'Not a separate approval pathway — it enhances the existing BLA pathway',
      'Designation can be rescinded if criteria are no longer met',
    ],
  },
};

// ── Comparison Matrix Dimensions ────────────────────────────────────────────

export const EXPEDITED_COMPARISON_MATRIX: ExpeditedProgramResult['comparisonMatrix'] = [
  {
    dimension: 'Statutory Basis',
    fast_track: 'FD&C Act §506(b), FDASIA 2012',
    breakthrough_therapy: 'FD&C Act §506(a), FDASIA 2012',
    accelerated_approval: 'FD&C Act §506(c), FDORA 2022',
    priority_review: 'PDUFA Performance Goals',
    rmat: 'FD&C Act §506(g), 21st Century Cures Act 2016',
  },
  {
    dimension: 'Condition Requirement',
    fast_track: 'Serious or life-threatening',
    breakthrough_therapy: 'Serious or life-threatening',
    accelerated_approval: 'Serious or life-threatening',
    priority_review: 'Serious condition',
    rmat: 'Serious or life-threatening',
  },
  {
    dimension: 'Evidence Required',
    fast_track: 'Nonclinical or clinical data showing potential to address unmet need',
    breakthrough_therapy: 'Preliminary CLINICAL evidence of substantial improvement',
    accelerated_approval: 'Adequate trial using surrogate/intermediate endpoint',
    priority_review: 'Evidence of significant improvement in NDA/BLA',
    rmat: 'Preliminary clinical evidence of potential to address unmet need',
  },
  {
    dimension: 'Product Scope',
    fast_track: 'Any drug or biologic',
    breakthrough_therapy: 'Any drug or biologic',
    accelerated_approval: 'Any drug or biologic',
    priority_review: 'Any drug or biologic',
    rmat: 'Regenerative medicine therapies only (cell, gene, tissue)',
  },
  {
    dimension: 'Key Benefit',
    fast_track: 'Rolling review + frequent FDA meetings',
    breakthrough_therapy: 'Intensive FDA guidance + organizational commitment + rolling review',
    accelerated_approval: 'Earlier approval on surrogate endpoint',
    priority_review: '6-month review vs. 10-month standard',
    rmat: 'All BT benefits + potential AA on surrogate + RWE for post-marketing',
  },
  {
    dimension: 'Application Timing',
    fast_track: 'Any time during development (even pre-IND)',
    breakthrough_therapy: 'No later than EOP2; early requests encouraged',
    accelerated_approval: 'Discussed at EOP2/pre-Phase 3; granted at NDA/BLA filing',
    priority_review: 'Determined at NDA/BLA filing',
    rmat: 'Any time after preliminary clinical evidence available',
  },
  {
    dimension: 'FDA Response Timeline',
    fast_track: '60 calendar days',
    breakthrough_therapy: '60 calendar days',
    accelerated_approval: 'N/A (regulatory pathway, not designation)',
    priority_review: 'At filing determination (60-day filing review)',
    rmat: '60 calendar days',
  },
  {
    dimension: 'Rolling Review',
    fast_track: 'Yes',
    breakthrough_therapy: 'Yes (inherits from Fast Track)',
    accelerated_approval: 'No (unless also granted Fast Track/BT)',
    priority_review: 'No (unless also granted Fast Track/BT)',
    rmat: 'Yes (inherits from Fast Track/BT)',
  },
  {
    dimension: 'Approval Standard',
    fast_track: 'Standard — substantial evidence of effectiveness and adequate safety',
    breakthrough_therapy: 'Standard — same evidentiary requirements',
    accelerated_approval: 'Surrogate/intermediate endpoint (confirmatory study required)',
    priority_review: 'Standard — same evidentiary requirements',
    rmat: 'May use surrogate endpoints and accelerated approval pathway',
  },
  {
    dimension: 'Historical Approval Rate (approximate)',
    fast_track: '~60% of designated products ultimately approved',
    breakthrough_therapy: '~70-80% of designated products ultimately approved',
    accelerated_approval: 'N/A — pathway rather than designation',
    priority_review: 'N/A — review timeline classification',
    rmat: 'Program relatively new (2017+); limited historical data',
  },
];

// ── FDA Meeting Type Registry ───────────────────────────────────────────────

export const MEETING_TYPE_REGISTRY: Record<MeetingTypeClassification, Omit<MeetingTypeInfo, 'classification'>> = {
  A: {
    displayName: 'Type A Meeting',
    description:
      'Immediately necessary for an otherwise stalled drug development program. Includes meetings to discuss: ' +
      'clinical hold disputes, special protocol assessment (SPA) disputes, and post-action (Complete Response Letter) meetings.',
    fdaResponseTimeline: '30 calendar days from FDA receipt of meeting request',
    schedulingTimeline: 'Meeting should be scheduled within 30 calendar days of receipt',
    examples: [
      'Dispute resolution for clinical holds (21 CFR 312.48)',
      'Post-Complete Response Letter meetings',
      'Special Protocol Assessment (SPA) dispute meetings',
      'Safety-related meetings that impact an ongoing clinical program',
    ],
    regulatoryBasis: [
      'FDA Guidance: Formal Meetings Between FDA and Sponsors or Applicants of PDUFA Products (2017, revised)',
      'PDUFA VII Performance Goals and Procedures (2022-2027)',
      '21 CFR 312.47 — Meetings',
    ],
  },
  B: {
    displayName: 'Type B Meeting',
    description:
      'Pre-IND, certain End-of-Phase 1 (for Subpart E/H products), End-of-Phase 2/pre-Phase 3, and pre-NDA/BLA meetings. ' +
      'These are the most common and strategically important development milestone meetings.',
    fdaResponseTimeline: '75 calendar days from FDA receipt of meeting request for scheduling',
    schedulingTimeline: 'Pre-IND: within 75 days. EOP2: within 75 days. Pre-NDA/BLA: within 75 days.',
    examples: [
      'Pre-IND meeting: discuss planned IND content, nonclinical program, initial clinical plan',
      'End-of-Phase 1 meeting (for products under Subpart E/H): discuss Phase 2 plans for serious conditions',
      'End-of-Phase 2 / Pre-Phase 3 meeting: discuss pivotal trial design, endpoints, statistical plan',
      'Pre-NDA/BLA meeting: discuss submission format, content, and review expectations',
    ],
    regulatoryBasis: [
      'FDA Guidance: Formal Meetings Between FDA and Sponsors or Applicants of PDUFA Products (2017, revised)',
      'PDUFA VII Performance Goals — Type B meeting timelines',
      '21 CFR 312.47(b) — End-of-Phase 2 meetings',
      '21 CFR 312.82 — IND meetings for life-threatening conditions',
    ],
  },
  C: {
    displayName: 'Type C Meeting',
    description:
      'Any other meeting necessary for drug development that does not qualify as Type A or B. ' +
      'Used for questions that arise during development but are not tied to major milestones.',
    fdaResponseTimeline: '75 calendar days from FDA receipt of meeting request',
    schedulingTimeline: 'Within 75 calendar days of receipt of meeting request',
    examples: [
      'CMC development strategy discussions',
      'Labeling discussions',
      'Post-marketing commitment/requirement discussions',
      'REMS discussions',
      'General clinical development questions not tied to Phase boundaries',
    ],
    regulatoryBasis: [
      'FDA Guidance: Formal Meetings Between FDA and Sponsors or Applicants of PDUFA Products (2017, revised)',
      'PDUFA VII Performance Goals',
    ],
  },
  D: {
    displayName: 'Type D Meeting — Formal Dispute Resolution',
    description:
      'Formal dispute resolution meeting. Used when a sponsor disagrees with a scientific or procedural decision ' +
      'and has exhausted the informal dispute resolution process at the review division level.',
    fdaResponseTimeline: 'Within 30 calendar days if involving a clinical hold or SPA; otherwise varies',
    schedulingTimeline: 'Varies — follows formal dispute resolution procedures in 21 CFR 10.75 and MAPP 4151.7',
    examples: [
      'Disputes over Complete Response Letter content',
      'Disputes over clinical hold reasons',
      'Disputes over FDA requests for additional studies',
      'Disagreements on endpoint acceptability',
    ],
    regulatoryBasis: [
      '21 CFR 10.75 — Internal agency review of decisions',
      'FDA Guidance: Formal Dispute Resolution: Scientific and Technical Issues Related to Pharmaceutical Component Quality (2017)',
      'FDA MAPP 4151.7 — Formal Dispute Resolution process',
    ],
  },
  pre_submission: {
    displayName: 'Pre-Submission Meeting (505(b)(2)/ANDA-specific)',
    description:
      'Product-specific pre-submission meetings for 505(b)(2) NDAs and ANDAs to discuss formulation strategy, ' +
      'bioequivalence study design, clinical study needs, and product-specific guidance interpretation.',
    fdaResponseTimeline: '75 calendar days from receipt of meeting request',
    schedulingTimeline: 'Within 75 calendar days; GDUFA goals may apply for ANDAs',
    examples: [
      'Pre-ANDA meeting to discuss bioequivalence approach for complex generics',
      '505(b)(2) pre-NDA meeting to discuss clinical bridging strategy',
      'Product-specific guidance (PSG) interpretation',
      'Complex generic drug development strategy',
    ],
    regulatoryBasis: [
      'GDUFA III Performance Goals (2023-2027) — pre-ANDA meeting goals',
      'FDA Guidance: ANDAs for Certain Highly Purified Synthetic Peptide Drug Products That Refer to Listed Drugs of rDNA Origin (2021)',
      'FDA Guidance: Controlled Correspondence Related to Generic Drug Development (2020)',
    ],
  },
};

// ── Briefing Document Template ──────────────────────────────────────────────

export const BRIEFING_DOCUMENT_TEMPLATE: BriefingDocumentSection[] = [
  {
    sectionTitle: '1. Meeting Objectives',
    contentGuidance: [
      'State the purpose of the meeting clearly and concisely',
      'List the specific questions or issues to be discussed (numbered)',
      'Include the sponsor position for each question',
    ],
    pageGuidance: '1 page',
  },
  {
    sectionTitle: '2. Product Background',
    contentGuidance: [
      'Product name (generic and trade name if applicable), dosage form, route of administration',
      'Mechanism of action',
      'Regulatory history (INDs, previous submissions, previous FDA meetings)',
      'Development stage and key milestones',
    ],
    pageGuidance: '1-2 pages',
  },
  {
    sectionTitle: '3. Disease Background and Unmet Need',
    contentGuidance: [
      'Brief epidemiology and pathophysiology',
      'Current standard of care and its limitations',
      'Unmet medical need that the product addresses',
    ],
    pageGuidance: '1-2 pages',
  },
  {
    sectionTitle: '4. Nonclinical Summary',
    contentGuidance: [
      'Key pharmacology findings (in vitro and in vivo)',
      'Toxicology summary (species, key findings, NOAEL, safety margins)',
      'ADME/PK overview',
      'Any outstanding nonclinical issues',
    ],
    pageGuidance: '3-5 pages',
  },
  {
    sectionTitle: '5. Clinical Summary',
    contentGuidance: [
      'Clinical pharmacology summary (PK, dose-response, PK/PD)',
      'Clinical efficacy data (Phase 1/2/3 as available)',
      'Key efficacy endpoints and results',
      'Safety database summary, including serious adverse events',
      'Risk-benefit assessment',
    ],
    pageGuidance: '5-15 pages (varies by development stage)',
  },
  {
    sectionTitle: '6. CMC Summary',
    contentGuidance: [
      'Drug substance manufacturing process overview',
      'Drug product formulation and manufacturing',
      'Analytical methods and specifications',
      'Stability data summary',
      'Any CMC challenges or open issues',
    ],
    pageGuidance: '2-4 pages',
  },
  {
    sectionTitle: '7. Proposed Regulatory Strategy',
    contentGuidance: [
      'Proposed clinical development plan (if applicable)',
      'Proposed pivotal trial design and endpoints',
      'Statistical analysis plan overview',
      'Proposed regulatory pathway and expedited program strategy',
      'Target submission timeline',
    ],
    pageGuidance: '2-4 pages',
  },
  {
    sectionTitle: '8. Questions for FDA',
    contentGuidance: [
      'Number each question clearly',
      'State the sponsor position for each question BEFORE asking the question',
      'Provide relevant background data supporting the sponsor position',
      'Frame questions to elicit actionable FDA feedback (yes/no or agree/disagree preferred)',
      'Limit to 5-7 focused questions per meeting',
      'Avoid compound questions — break complex issues into discrete questions',
    ],
    pageGuidance: '2-5 pages',
  },
  {
    sectionTitle: '9. Appendices (as needed)',
    contentGuidance: [
      'Detailed data tables, figures, and study designs',
      'Protocol synopses',
      'Literature references',
      'Regulatory correspondence history',
    ],
    pageGuidance: 'As needed — keep appendices focused',
  },
];

// ── Meeting Purpose to Type Mapping ─────────────────────────────────────────

export const PURPOSE_TO_TYPE: Record<MeetingPurpose, MeetingTypeClassification> = {
  pre_ind: 'B',
  eop1: 'B',
  eop2: 'B',
  pre_phase3: 'B',
  pre_nda_bla: 'B',
  type_a_urgent: 'A',
  dispute_resolution: 'D',
  pre_submission_505b2: 'pre_submission',
  pre_submission_anda: 'pre_submission',
  risk_evaluation: 'C',
  pediatric: 'C',
  other: 'C',
};

// ── Orphan Designation Registry ─────────────────────────────────────────────

export const FDA_ORPHAN_PREVALENCE_THRESHOLD = 200000;
export const EMA_ORPHAN_PREVALENCE_THRESHOLD = 5; // per 10,000

// ── 505 Pathway Decision Data ───────────────────────────────────────────────

export const PATHWAY_REGISTRY: Record<PathwayType, Omit<PathwayRecommendation, 'pathway'>> = {
  '505b1': {
    displayName: '505(b)(1) Full NDA — New Drug Application',
    description:
      'Full NDA with complete reports of adequate and well-controlled investigations demonstrating ' +
      'safety and effectiveness. Required for new molecular entities (NMEs) and products where the ' +
      'sponsor generates all safety and efficacy data independently.',
    legalBasis: 'FD&C Act Section 505(b)(1) [21 USC 355(b)(1)]',
    requiredStudies: [
      'Complete nonclinical pharmacology and toxicology package',
      'Phase 1 clinical pharmacology studies (PK, dose-ranging, drug-drug interaction)',
      'Phase 2 dose-finding and proof-of-concept studies',
      'Phase 3 pivotal adequate and well-controlled efficacy trials (typically 2)',
      'Complete safety database (typically 300-600 patients for non-life-threatening; 1500+ for chronic conditions per ICH E1)',
      'Full CMC data package (drug substance and drug product)',
      'Environmental assessment or claim of categorical exclusion',
    ],
    advantages: [
      '5-year New Chemical Entity (NCE) exclusivity for NMEs',
      '3-year exclusivity for new clinical investigation essential to approval (change in condition of use)',
      'No reliance on another product — full independence',
      'Broadest patent protection strategy options',
    ],
    disadvantages: [
      'Longest and most expensive development pathway',
      'Requires full nonclinical and clinical data package',
      'Typical development timeline: 10-15 years, $1-3 billion',
      'Highest regulatory risk if pivotal trials fail',
    ],
    typicalTimeline: '10-15 years from discovery to approval',
    regulatoryBasis: [
      'FD&C Act Section 505(b)(1) [21 USC 355(b)(1)]',
      '21 CFR 314 Subpart B — Applications',
      '21 CFR 314.50 — Content and format of an NDA',
      'ICH E1 — Extent of Population Exposure',
      'ICH E8 — General Considerations for Clinical Trials',
    ],
  },
  '505b2': {
    displayName: '505(b)(2) NDA — NDA with Reliance on Prior Findings',
    description:
      'NDA where at least some of the information required for approval comes from studies not ' +
      'conducted by or for the applicant and for which the applicant has not obtained a right of ' +
      'reference. Relies on FDA previous findings of safety and effectiveness for a listed drug (RLD). ' +
      'May include the applicant own studies to support changes from the RLD.',
    legalBasis: 'FD&C Act Section 505(b)(2) [21 USC 355(b)(2)]',
    requiredStudies: [
      'Literature-based or FDA-finding-based safety/efficacy data for the active ingredient',
      'Bridging studies as needed: bioequivalence/bioavailability studies, comparative clinical studies',
      'Clinical studies to support the specific change from the RLD (new indication, route, dosage form, strength)',
      'Nonclinical studies if the change raises new safety questions (e.g., new route may need new tox studies)',
      'CMC data for the proposed drug product',
      'If Paragraph IV certification: patent challenge litigation potential',
    ],
    advantages: [
      'Reduced development time and cost compared to 505(b)(1)',
      'May leverage existing safety and efficacy data for the active ingredient',
      'Enables development of improved formulations, new routes, new indications for known drugs',
      '3-year exclusivity for new clinical investigations essential to approval',
      'Can establish new competitive position for a known molecule',
    ],
    disadvantages: [
      'Subject to patent challenges (Paragraph IV certification may trigger 30-month stay)',
      'Must identify and cite a listed drug (RLD) in the Orange Book',
      'Bridging study requirements may be substantial depending on the change from RLD',
      'Potential for Citizen Petitions from RLD holder to delay approval',
      'No 5-year NCE exclusivity (only 3-year new clinical investigation exclusivity)',
    ],
    typicalTimeline: '3-7 years from development start to approval',
    regulatoryBasis: [
      'FD&C Act Section 505(b)(2) [21 USC 355(b)(2)]',
      '21 CFR 314.54 — Content and format of an NDA filed under 505(b)(2)',
      'FDA Guidance: Applications Covered by Section 505(b)(2) (2023 draft)',
      'FDA Guidance: Determining Whether to Submit an ANDA or a 505(b)(2) Application (2019)',
    ],
  },
  '505j': {
    displayName: '505(j) ANDA — Abbreviated New Drug Application',
    description:
      'Abbreviated application for a generic drug that is the same as a listed drug (RLD) in active ingredient, ' +
      'dosage form, strength, route of administration, labeling, quality, performance characteristics, and ' +
      'intended use. Must demonstrate bioequivalence to the RLD.',
    legalBasis: 'FD&C Act Section 505(j) [21 USC 355(j)]',
    requiredStudies: [
      'Bioequivalence study demonstrating that the generic product is bioequivalent to the RLD',
      'In vitro dissolution testing (comparative with RLD)',
      'Full CMC data for drug substance and drug product',
      'Stability studies per ICH Q1A/Q1E',
      'No clinical efficacy trials required (bioequivalence substitutes for efficacy)',
      'Product-specific guidance (PSG) requirements, if available',
    ],
    advantages: [
      'Shortest and least expensive regulatory pathway',
      '180-day first-to-file exclusivity for successful Paragraph IV challengers',
      'No clinical efficacy trials required — bioequivalence to RLD is sufficient',
      'GDUFA fee structure (lower than PDUFA)',
      'Eligible for competitive generic therapy (CGT) designation for additional benefits',
    ],
    disadvantages: [
      'Must be the same active ingredient, dosage form, route, strength, and conditions of use as RLD',
      'Subject to patent exclusivity and 30-month stay for Paragraph IV challenges',
      'Cannot make changes to the RLD (no new indications, routes, or dosage forms without suitability petition)',
      'Competitive market with thin margins',
      'Complex generics may require additional studies (product-specific guidances)',
    ],
    typicalTimeline: '2-5 years from development start to approval',
    regulatoryBasis: [
      'FD&C Act Section 505(j) [21 USC 355(j)]',
      '21 CFR 314 Subpart C — Abbreviated Applications (ANDAs)',
      '21 CFR 320 — Bioavailability and Bioequivalence Requirements',
      'FDA Orange Book (Approved Drug Products with Therapeutic Equivalence Evaluations)',
      'GDUFA III Performance Goals (2023-2027)',
    ],
  },
  suitability_petition: {
    displayName: 'Suitability Petition (21 CFR 314.93)',
    description:
      'Petition to FDA requesting permission to file an ANDA for a drug product that differs from the RLD ' +
      'in dosage form, route of administration, strength, or active ingredient in a combination product. ' +
      'If approved, the ANDA may be filed with the change; if denied, a 505(b)(2) NDA is required instead.',
    legalBasis: '21 CFR 314.93, FD&C Act Section 505(j)(2)(C)',
    requiredStudies: [
      'Petition must demonstrate that the proposed change from the RLD does not require new clinical investigations to establish safety and effectiveness',
      'If petition is approved: standard ANDA requirements (bioequivalence, CMC)',
      'If petition is denied: 505(b)(2) NDA with appropriate clinical bridging studies',
    ],
    advantages: [
      'May enable ANDA pathway for products that differ from RLD in dosage form, route, or strength',
      'Lower cost than 505(b)(2) NDA if petition is approved',
      'Maintains generic drug cost and development advantages',
    ],
    disadvantages: [
      'FDA may deny the petition, requiring 505(b)(2) NDA instead',
      'Petition review adds time before ANDA can be filed',
      'Limited to specific types of changes from RLD',
      'Cannot be used for new indications or new active ingredients (except in combinations)',
    ],
    typicalTimeline: 'Petition review: ~150 days. Then ANDA timeline if approved.',
    regulatoryBasis: [
      '21 CFR 314.93 — Petition to request change from listed drug',
      'FD&C Act Section 505(j)(2)(C) [21 USC 355(j)(2)(C)]',
      'FDA Guidance: Determining Whether to Submit an ANDA or a 505(b)(2) Application (2019)',
    ],
  },
};

// ── Patent Exclusivity Registry ─────────────────────────────────────────────

export const PATENT_EXCLUSIVITY_REGISTRY: PatentExclusivity[] = [
  {
    type: 'New Chemical Entity (NCE) Exclusivity',
    duration: '5 years from NDA approval date',
    description:
      'Prevents FDA from accepting any ANDA or 505(b)(2) application referencing the NME for 5 years. ' +
      'An ANDA with Paragraph IV certification may be submitted after 4 years.',
    legalBasis: 'FD&C Act Section 505(c)(3)(E)(ii) and 505(j)(5)(F)(ii)',
    applicableTo: ['505b1'],
  },
  {
    type: 'New Clinical Investigation Exclusivity',
    duration: '3 years from approval date',
    description:
      'Granted when approval requires new clinical investigations (other than BA/BE studies) essential to ' +
      'the approval. Blocks approval (not submission) of ANDAs and 505(b)(2)s for the same condition of approval.',
    legalBasis: 'FD&C Act Section 505(c)(3)(E)(iii) and 505(j)(5)(F)(iii)',
    applicableTo: ['505b1', '505b2'],
  },
  {
    type: 'OTC Exclusivity',
    duration: '3 years from OTC approval date',
    description:
      'Three-year exclusivity for a switch from prescription to OTC status when supported by new clinical data.',
    legalBasis: 'FD&C Act Section 505(c)(3)(E)(iii)',
    applicableTo: ['505b1', '505b2'],
  },
  {
    type: 'Pediatric Exclusivity',
    duration: '6 months added to existing exclusivity/patent',
    description:
      'Six-month extension added to all existing exclusivities and patents for the moiety when the sponsor ' +
      'conducts pediatric studies pursuant to a Written Request from FDA.',
    legalBasis: 'FD&C Act Section 505A, Pediatric Research Equity Act (PREA), BPCA',
    applicableTo: ['505b1', '505b2', '505j'],
  },
  {
    type: 'Orphan Drug Exclusivity',
    duration: '7 years from NDA/BLA approval date',
    description:
      'Prevents FDA from approving another application for the same drug for the same orphan indication for 7 years. ' +
      'Does not prevent approval of a clinically superior product for the same indication.',
    legalBasis: 'Orphan Drug Act Section 527 [21 USC 360cc]',
    applicableTo: ['505b1', '505b2'],
  },
  {
    type: '180-Day Generic Exclusivity',
    duration: '180 days from first commercial marketing or court decision',
    description:
      'First ANDA applicant to file a Paragraph IV certification gets 180 days of exclusivity — ' +
      'FDA will not approve subsequent ANDAs during this period.',
    legalBasis: 'FD&C Act Section 505(j)(5)(B)(iv), Hatch-Waxman Act',
    applicableTo: ['505j'],
  },
  {
    type: 'Patent Term Extension (PTE)',
    duration: 'Up to 5 years (total patent life post-approval cannot exceed 14 years)',
    description:
      'Extension of one patent per product to compensate for time lost during FDA review. ' +
      'Calculated based on IND-to-NDA and NDA-to-approval periods.',
    legalBasis: '35 USC 156 (Hatch-Waxman Patent Term Restoration)',
    applicableTo: ['505b1', '505b2'],
  },
];

// ── Paragraph Certification Types ───────────────────────────────────────────

export const CERTIFICATION_TYPES: CertificationType[] = [
  {
    paragraph: 'Paragraph I',
    description: 'No patent information has been submitted to FDA for the RLD.',
    implications: [
      'ANDA/505(b)(2) may be approved immediately (no patent barrier)',
      'Rare scenario — most listed drugs have Orange Book patents',
    ],
  },
  {
    paragraph: 'Paragraph II',
    description: 'The patent has expired.',
    implications: [
      'ANDA/505(b)(2) may be approved immediately (patent barrier removed)',
      'Applicant must verify patent expiration date in Orange Book',
    ],
  },
  {
    paragraph: 'Paragraph III',
    description: 'The applicant will not seek approval until the patent expires.',
    implications: [
      'ANDA/505(b)(2) approval will be delayed until the patent expiration date',
      'No litigation risk — applicant is deferring to the patent',
      'Tentative approval may be granted before patent expiration',
    ],
  },
  {
    paragraph: 'Paragraph IV',
    description:
      'The patent is invalid, unenforceable, or will not be infringed by the generic product.',
    implications: [
      'Triggers notice to patent holder and NDA holder within 20 days of acceptance of ANDA',
      'Patent holder may sue within 45 days of receiving notice',
      'If suit filed: 30-month stay of ANDA approval (unless court resolves sooner)',
      'First filer eligible for 180-day generic exclusivity',
      'Requires paragraph IV certification letter with detailed factual and legal basis',
      'Significant litigation cost and risk',
    ],
  },
];

// ── Global Regulatory Pathway Data ──────────────────────────────────────────

export const GLOBAL_PATHWAY_REGISTRY: Record<TargetMarket, Omit<RegionalPathwayInfo, 'market'>> = {
  us: {
    displayName: 'United States',
    regulatoryAuthority: 'Food and Drug Administration (FDA)',
    relevantDivision: 'CDER (drugs) or CBER (biologics, gene/cell therapy, vaccines, blood products)',
    applicationType: 'NDA (drugs under FD&C Act) or BLA (biologics under PHS Act)',
    standardReviewTimeline: '10 months (Standard Review, PDUFA VII)',
    expeditedReviewTimeline: '6 months (Priority Review); 8 months (Priority NME, PDUFA VII)',
    expeditedPathways: [
      {
        name: 'Fast Track Designation',
        equivalent: 'N/A — US-specific program',
        criteria: ['Serious condition', 'Potential to address unmet medical need'],
        benefits: ['Rolling review', 'Frequent FDA meetings', 'Eligible for AA and PR'],
      },
      {
        name: 'Breakthrough Therapy Designation',
        equivalent: 'EMA PRIME, PMDA SAKIGAKE, NMPA Breakthrough, Health Canada NOC/c',
        criteria: ['Serious condition', 'Preliminary clinical evidence of substantial improvement'],
        benefits: ['Intensive FDA guidance', 'Organizational commitment', 'Rolling review', 'Senior manager involvement'],
      },
      {
        name: 'Accelerated Approval',
        equivalent: `EMA Conditional Marketing Authorization, PMDA ${getJpProgram('pmda-conditional-approval').name}, NMPA Conditional Approval`,
        criteria: ['Serious condition', 'Unmet need', 'Surrogate or intermediate endpoint'],
        benefits: ['Earlier approval on surrogate endpoint', 'FDORA 2022 strengthened post-marketing requirements'],
      },
      {
        name: 'Priority Review',
        equivalent: 'EMA Accelerated Assessment, Health Canada Priority Review',
        criteria: ['Significant improvement in safety or effectiveness over available therapy'],
        benefits: ['6-month review target vs. 10-month standard'],
      },
      {
        name: 'RMAT Designation',
        equivalent: 'EMA PRIME (for ATMPs), PMDA SAKIGAKE (for regenerative medicine)',
        criteria: ['Regenerative medicine therapy', 'Serious condition', 'Preliminary clinical evidence'],
        benefits: ['All Fast Track + Breakthrough benefits', 'Potential accelerated approval', 'RWE for post-marketing'],
      },
    ],
    orphanEquivalent: {
      name: 'Orphan Drug Designation (ODD)',
      prevalenceThreshold: '<200,000 persons in the US',
      exclusivityPeriod: '7 years from approval',
      otherBenefits: [
        'Tax credit for clinical research (expired 2017; renewal pending)',
        'PDUFA fee waiver',
        'Protocol assistance fee waiver',
        'Grants program (up to $600K/year for clinical studies)',
      ],
    },
    conditionalApproval: {
      name: 'Accelerated Approval (under FD&C Act §506(c))',
      criteria: [
        'Serious or life-threatening condition',
        'Meaningful therapeutic benefit over existing treatments',
        'Surrogate or intermediate clinical endpoint reasonably likely to predict clinical benefit',
      ],
      postApprovalRequirements: [
        'Confirmatory post-marketing study required (FDORA 2022: must be underway at time of approval)',
        'Promotional material pre-review',
        'Expedited withdrawal if confirmatory study fails or not conducted with due diligence',
      ],
    },
    dataRequirementsDifferences: [
      'Two adequate and well-controlled studies typically required (but one study with strong evidence may suffice)',
      'US-specific safety reporting: CIOMS-I form for expedited reports, MedWatch for post-marketing',
      'FDA may accept foreign clinical data if applicable to US population (21 CFR 312.120)',
      'Ethnic bridging generally not required for US submissions',
    ],
    gmpInspectionRequirements: [
      'Pre-approval inspection (PAI) of manufacturing sites for all NDA/BLA submissions',
      'FDA may inspect foreign manufacturing sites',
      'Inspection within approximately 6 months of PDUFA date',
      'Warning Letter or Import Alert can delay approval',
    ],
    referencePricingHTA: [
      'No formal reference pricing system at federal level',
      'Inflation Reduction Act (2022): Medicare drug price negotiation for select high-spend drugs',
      'CMS coverage decisions (NCDs/LCDs) impact Medicare reimbursement',
      'Private payer formulary decisions based on clinical and economic evidence',
      'ICER (Institute for Clinical and Economic Review) value assessments increasingly influential',
    ],
  },
  eu: {
    displayName: 'European Union',
    regulatoryAuthority: 'European Medicines Agency (EMA)',
    relevantDivision: 'Committee for Medicinal Products for Human Use (CHMP) or Committee for Advanced Therapies (CAT) for ATMPs',
    applicationType: 'Marketing Authorisation Application (MAA) — Centralised Procedure',
    standardReviewTimeline: '210 active days (~12-15 months total including clock stops)',
    expeditedReviewTimeline: '150 active days (Accelerated Assessment, ~9-10 months total)',
    expeditedPathways: [
      {
        name: 'PRIME (PRIority MEdicines)',
        equivalent: 'FDA Breakthrough Therapy Designation',
        criteria: [
          'Targets an unmet medical need',
          'Preliminary clinical evidence showing major therapeutic advantage (or for ATMPs/academic sponsors: compelling nonclinical data)',
        ],
        benefits: [
          'Early and enhanced scientific and regulatory support',
          'Rapporteur appointed at PRIME eligibility',
          'Eligibility for Accelerated Assessment',
          'Increased interaction with CHMP/CAT',
        ],
      },
      {
        name: 'Accelerated Assessment',
        equivalent: 'FDA Priority Review',
        criteria: ['Major public health interest', 'Therapeutic innovation'],
        benefits: ['Review timeline reduced from 210 to 150 active days'],
      },
      {
        name: 'Conditional Marketing Authorisation (CMA)',
        equivalent: 'FDA Accelerated Approval',
        criteria: [
          'Unmet medical need',
          'Benefit-risk balance is positive',
          'Applicant will be able to provide comprehensive data post-approval',
          'Product addresses life-threatening, seriously debilitating, or emergency situations',
        ],
        benefits: [
          'Earlier market access based on less comprehensive data',
          'Annual renewal until full MA granted',
        ],
      },
      {
        name: 'Marketing Authorisation Under Exceptional Circumstances',
        equivalent: 'No direct FDA equivalent',
        criteria: [
          'Comprehensive data cannot be provided due to rarity of condition, limited scientific knowledge, or ethical concerns',
          'Benefit-risk balance is positive',
        ],
        benefits: ['Permanent MA with specific obligations for additional data collection'],
      },
    ],
    orphanEquivalent: {
      name: 'Orphan Medicinal Product Designation',
      prevalenceThreshold: '<5 per 10,000 in the EU (approximately <250,000 persons in EU)',
      exclusivityPeriod: '10 years (may be reduced to 6 years if criteria no longer met at Year 5 review)',
      otherBenefits: [
        'Protocol assistance at reduced fee',
        'Fee reductions for regulatory procedures',
        'Access to EU orphan drug incentives (varies by member state)',
        'Centralized procedure mandatory — single EU-wide authorization',
      ],
    },
    conditionalApproval: {
      name: 'Conditional Marketing Authorisation (CMA)',
      criteria: [
        'Seriously debilitating or life-threatening disease, or emergency situation',
        'Unmet medical need',
        'Positive benefit-risk balance based on available data',
        'Comprehensive data can be provided post-authorisation',
        'Public health benefit of immediate availability outweighs risk of less comprehensive data',
      ],
      postApprovalRequirements: [
        'Specific obligations to complete ongoing or new studies',
        'Annual renewal by CHMP until converted to full MA',
        'MA may be suspended or revoked if obligations are not fulfilled',
      ],
    },
    dataRequirementsDifferences: [
      'One adequate and well-controlled pivotal study may be sufficient if compelling',
      'CTD format required (ICH M4)',
      'Environmental Risk Assessment (ERA) required — not required for US NDA',
      'Paediatric Investigation Plan (PIP) required unless waiver/deferral granted (Regulation (EC) No 1901/2006)',
      'Ethnic bridging generally not required for EU submissions',
      'QP (Qualified Person) batch release required for EU-marketed products',
    ],
    gmpInspectionRequirements: [
      'GMP compliance verified by EEA member state inspectorates',
      'Mutual Recognition Agreements (MRA) with certain countries (Australia, Canada, Japan, Switzerland, US, etc.)',
      'QP certification required for each batch released in EU',
      'Pre-approval GMP inspection may be requested by CHMP',
    ],
    referencePricingHTA: [
      'HTA assessments by member states (NICE UK, G-BA Germany, HAS France, AIFA Italy, etc.)',
      'EU HTA Regulation (2021/2282) — joint clinical assessments starting January 2025 for oncology and ATMPs',
      'External reference pricing (ERP) used by most EU member states',
      'Pricing and reimbursement decisions are member state competence',
      'Value-based pricing increasingly adopted',
    ],
  },
  japan: {
    displayName: 'Japan',
    regulatoryAuthority: 'Pharmaceuticals and Medical Devices Agency (PMDA) / Ministry of Health, Labour and Welfare (MHLW)',
    relevantDivision: 'Office of New Drug (drugs) or Office of Cellular and Tissue-based Products (cell/gene therapy)',
    applicationType: 'J-NDA (drugs) or BLA equivalent (biologics) or Regenerative Medicine Product application',
    standardReviewTimeline: '12 months standard review (PMDA target)',
    expeditedReviewTimeline: '6-9 months (SAKIGAKE or Priority Review)',
    expeditedPathways: [
      jpExpeditedPathway('pmda-sakigake', 'FDA Breakthrough Therapy Designation'),
      jpExpeditedPathway('pmda-priority-review', 'FDA Priority Review'),
      jpExpeditedPathway('pmda-conditional-approval', 'FDA Accelerated Approval'),
    ],
    orphanEquivalent: {
      name: 'Orphan Drug Designation (Japan)',
      prevalenceThreshold: '<50,000 patients in Japan',
      exclusivityPeriod: '10 years re-examination period (extended from standard 8 years)',
      otherBenefits: [
        'Priority review',
        'Reduced regulatory fees',
        'Tax incentives for R&D expenses',
        'Subsidies for clinical development',
        'National Health Insurance (NHI) listing with premium pricing',
      ],
    },
    conditionalApproval: jpConditionalApproval(),
    dataRequirementsDifferences: [
      'Ethnic bridging study may be required per ICH E5 (Ethnic Factors in the Acceptability of Foreign Clinical Data)',
      'Japanese bridging strategy: evaluate PK/PD intrinsic/extrinsic ethnic factors',
      'PMDA may require Japan-specific clinical data if ethnic sensitivity identified',
      'CTD format in Japanese (translations required)',
      'Drug Master File (DMF) system similar to US DMF',
      'GLP and GCP inspections conducted by PMDA',
    ],
    gmpInspectionRequirements: [
      'PMDA pre-approval GMP inspection (Compliance Assessment)',
      'Regular GMP inspections every 5 years for marketed products',
      'MRA with EU, US (PIC/S member since 2014)',
      'Inspection of foreign manufacturing sites may be conducted',
    ],
    referencePricingHTA: [
      'NHI drug price listing: cost-effectiveness analysis required for drugs with annual sales >10 billion yen or significant budget impact',
      'Drug Pricing Organization (Chuikyo) determines NHI price',
      'Premium pricing for innovative drugs (kasan) based on: innovativeness, usefulness, pediatric indication, SAKIGAKE designation',
      'Biennial price revision (price cuts) based on market price surveys',
      'Cost-effectiveness evaluation (CEA) introduced 2019 for high-cost drugs',
    ],
  },
  china: {
    displayName: 'China',
    regulatoryAuthority: 'National Medical Products Administration (NMPA)',
    relevantDivision: 'Center for Drug Evaluation (CDE)',
    applicationType: 'Import Drug License Application (IDLA) for foreign products; Domestic NDA for domestic products',
    standardReviewTimeline: '200 working days (~10-12 months) per 2020 reform targets',
    expeditedReviewTimeline: '130 working days (~6-7 months) for Priority Review; 70 working days for Breakthrough',
    expeditedPathways: [
      {
        name: 'Breakthrough Therapy Designation (China)',
        equivalent: 'FDA Breakthrough Therapy Designation',
        criteria: [
          'Innovative drug for serious or life-threatening condition',
          'Preliminary clinical evidence of significant clinical advantage',
          'Drug with clear clinical value',
        ],
        benefits: [
          'Priority review and approval',
          'Reduced review timeline (70 working days target)',
          'Enhanced communication with CDE',
          'Rolling submission permitted',
          'Conditional approval possible',
        ],
      },
      {
        name: 'Priority Review (China)',
        equivalent: 'FDA Priority Review',
        criteria: [
          'Innovative drugs with obvious clinical value',
          'Drugs urgently needed for public health',
          'Drugs designated as breakthrough therapy',
          'Pediatric drugs with urgent clinical need',
        ],
        benefits: ['Accelerated review timeline: 130 working days target'],
      },
      {
        name: 'Special Approval Procedure',
        equivalent: 'FDA Emergency Use Authorization (emergency context)',
        criteria: [
          'Public health emergency',
          'Prevention/treatment of HIV/AIDS, viral hepatitis, rare diseases, malignant tumors',
          'Innovative drugs urgently needed',
        ],
        benefits: ['Expedited review and approval', 'Conditional approval permitted'],
      },
    ],
    orphanEquivalent: {
      name: 'Rare Disease Drug Incentives',
      prevalenceThreshold: 'Based on First Batch of Rare Diseases List (2018): 121 diseases listed; prevalence <1/500,000 or similar',
      exclusivityPeriod: 'No specific orphan exclusivity period — data protection rules apply (6 years for innovative drugs)',
      otherBenefits: [
        'Priority review pathway',
        'Reduced clinical data requirements possible',
        'Potential for conditional approval',
        'Import drug registration may be expedited',
        'VAT exemption for certain rare disease drugs (State Council 2019)',
      ],
    },
    conditionalApproval: {
      name: 'Conditional Approval (China)',
      criteria: [
        'Urgently needed drug for serious or life-threatening condition with no effective treatment',
        'Public health emergency drug',
        'Drug designated as breakthrough therapy',
        'Surrogate/intermediate endpoint or early/mid-stage clinical trial data shows significant benefit',
      ],
      postApprovalRequirements: [
        'Confirmatory clinical study required within specified timeline',
        'Annual report on post-marketing study progress',
        'Approval may be withdrawn if confirmatory study fails',
      ],
    },
    dataRequirementsDifferences: [
      'China Clinical Trial Registration required (all trials involving Chinese subjects)',
      'ICH E5 ethnic bridging: China-specific PK/PD or bridging study often required',
      'Multi-regional clinical trial (MRCT) data with Chinese subjects increasingly accepted (ICH E17)',
      'Minimum Chinese patient enrollment requirements in global studies (varies by indication)',
      'Drug Master File (DMF) filing with CDE for drug substance and excipients',
      'GMP certification of domestic and foreign manufacturing sites by NMPA',
      'Data integrity and source data verification emphasis in inspections',
    ],
    gmpInspectionRequirements: [
      'NMPA pre-approval inspection of manufacturing sites (domestic and foreign)',
      'Overseas inspection program for foreign manufacturing sites',
      'GMP certificate required for import drug applications',
      'Inspection cycle: every 2-3 years for marketed products',
    ],
    referencePricingHTA: [
      'National Reimbursement Drug List (NRDL) — negotiated inclusion',
      'Annual NRDL negotiation rounds (centralized by NHSA)',
      'Significant price reductions expected during negotiation (often 50-80% from list price)',
      'Volume-based procurement (VBP/centralized procurement) for generics — dramatic price reductions',
      'HTA evaluation increasingly required for NRDL inclusion',
      'Provincial supplemental drug lists being phased out',
    ],
  },
  canada: {
    displayName: 'Canada',
    regulatoryAuthority: 'Health Canada — Health Products and Food Branch (HPFB)',
    relevantDivision: 'Therapeutic Products Directorate (TPD) for drugs; Biologic and Radiopharmaceutical Drugs Directorate (BRDD) for biologics',
    applicationType: 'New Drug Submission (NDS) or Abbreviated New Drug Submission (ANDS)',
    standardReviewTimeline: '300 calendar days (target) from filing to decision',
    expeditedReviewTimeline: '180 calendar days (Priority Review)',
    expeditedPathways: [
      {
        name: 'Priority Review',
        equivalent: 'FDA Priority Review',
        criteria: [
          'Serious, life-threatening, or severely debilitating condition',
          'Evidence of significant increase in efficacy and/or significant decrease in risk',
        ],
        benefits: ['180-day review target vs. 300-day standard'],
      },
      {
        name: 'Notice of Compliance with Conditions (NOC/c)',
        equivalent: 'FDA Accelerated Approval',
        criteria: [
          'Serious, life-threatening, or severely debilitating condition',
          'Promising evidence of clinical effectiveness based on surrogate marker or limited clinical data',
          'Undertaking to provide confirmatory evidence',
        ],
        benefits: [
          'Earlier market access based on surrogate/limited data',
          'Conditions attached for additional studies',
        ],
      },
      {
        name: 'Advance Consideration',
        equivalent: 'No direct equivalent',
        criteria: ['Drug addresses serious condition with unmet need', 'Sponsor requests advance consideration'],
        benefits: ['Enhanced pre-submission consultation', 'Potential for expedited processing'],
      },
    ],
    orphanEquivalent: {
      name: 'Orphan Drug Framework (proposed — no formal orphan drug legislation as of 2024)',
      prevalenceThreshold: 'No formal prevalence threshold — Canada lacks formal orphan drug legislation. Special Access Programme may apply.',
      exclusivityPeriod: 'No orphan exclusivity — standard 8-year data protection for innovative drugs applies',
      otherBenefits: [
        'Priority Review eligible for rare disease drugs',
        'Special Access Programme for emergency access',
        'Collaboration with FDA and EMA through Project Orbis and MHRA-HC partnership',
        'Proposed orphan drug framework under development',
      ],
    },
    conditionalApproval: {
      name: 'Notice of Compliance with Conditions (NOC/c)',
      criteria: [
        'Serious, life-threatening, or severely debilitating disease or condition',
        'Promising evidence of clinical effectiveness',
        'Acceptable safety profile',
        'Sponsor commitment to confirmatory studies',
      ],
      postApprovalRequirements: [
        'Confirmatory studies as specified in conditions',
        'Periodic safety update reports',
        'Conditions published on Health Canada website',
        'NOC/c may be suspended if conditions not met',
      ],
    },
    dataRequirementsDifferences: [
      'CTD format required (ICH member)',
      'Canadian Reference Product (CRP) required for generic submissions',
      'Bilingual labeling requirements (English and French)',
      'Drug Identification Number (DIN) assigned upon approval',
      'Product Monograph (PM) format specific to Canada',
      'No specific ethnic bridging requirements',
      'Foreign clinical data generally accepted',
    ],
    gmpInspectionRequirements: [
      'Health Canada GMP inspection required for all manufacturing sites',
      'Drug Establishment License (DEL) required for domestic manufacturers and importers',
      'MRA with EU, Australia, and other PIC/S members',
      'Risk-based inspection approach — high-risk sites inspected more frequently',
    ],
    referencePricingHTA: [
      'CADTH (Canadian Agency for Drugs and Technologies in Health) — HTA and formulary listing recommendations',
      'INESSS (Quebec) — separate HTA evaluation for Quebec',
      'pan-Canadian Pharmaceutical Alliance (pCPA) — centralized pricing negotiation',
      'Patented Medicine Prices Review Board (PMPRB) — maximum price regulation',
      'Provincial formulary listing required for public reimbursement',
      'PMPRB reforms (2022+): new price ceiling methodology based on pharmacoeconomic value and international reference pricing',
    ],
  },
  australia: {
    displayName: 'Australia',
    regulatoryAuthority: 'Therapeutic Goods Administration (TGA)',
    relevantDivision: 'Prescription Medicines Authorisation Branch',
    applicationType: 'Registration on the Australian Register of Therapeutic Goods (ARTG) — Category 1 application',
    standardReviewTimeline: '255 working days (~12 months)',
    expeditedReviewTimeline: '150 working days (Priority Review); Provisional approval pathway also available',
    expeditedPathways: [
      {
        name: 'Priority Review',
        equivalent: 'FDA Priority Review',
        criteria: [
          'Major therapeutic advance for serious condition',
          'Important improvement in safety or efficacy',
        ],
        benefits: ['150 working days review target vs. 255 standard'],
      },
      {
        name: 'Provisional Approval',
        equivalent: 'FDA Accelerated Approval',
        criteria: [
          'Serious or life-threatening condition',
          'Promising clinical data but incomplete',
          'Expected to provide significant improvement in efficacy/safety',
        ],
        benefits: [
          'Earlier market access based on preliminary clinical data',
          'Provisional registration for up to 6 years (2-year initial + 2 extensions)',
        ],
      },
    ],
    orphanEquivalent: {
      name: 'Orphan Drug Designation (TGA)',
      prevalenceThreshold: '<2,000 patients in Australia (approximately <1 in 12,500)',
      exclusivityPeriod: '5 years data exclusivity for orphan drugs',
      otherBenefits: [
        'Fee waivers and reductions',
        'TGA orphan drug designation facilitates PBAC listing',
        'Access to Life Saving Drugs Program (LSDP) for eligible rare disease drugs',
      ],
    },
    conditionalApproval: {
      name: 'Provisional Approval',
      criteria: [
        'Serious or life-threatening condition',
        'Preliminary clinical data showing significant promise',
        'Reasonable to expect comprehensive data will be provided',
      ],
      postApprovalRequirements: [
        'Sponsor must provide confirmatory data within registration period',
        'Provisional registration for 2 years, extendable twice (up to 6 years total)',
        'Automatic cancellation if not transitioned to full registration or extended',
      ],
    },
    dataRequirementsDifferences: [
      'CTD format required (ICH member)',
      'Australian-specific Module 1',
      'Product Information (PI) and Consumer Medicine Information (CMI) format',
      'Generally accepts foreign clinical data — no ethnic bridging requirement',
      'Work-sharing arrangements with EMA, Health Canada, Swissmedic (ACCESS Consortium)',
    ],
    gmpInspectionRequirements: [
      'TGA GMP clearance required for all manufacturing sites',
      'MRA with EU, Canada, and other PIC/S members (TGA is PIC/S member)',
      'Risk-based GMP inspection program',
      'Periodic GMP re-assessment',
    ],
    referencePricingHTA: [
      'Pharmaceutical Benefits Advisory Committee (PBAC) — cost-effectiveness evaluation required for PBS listing',
      'Pharmaceutical Benefits Scheme (PBS) — government subsidized medicines',
      'PBAC is the sole national HTA body — positive recommendation required for PBS listing',
      'Evidence of cost-effectiveness mandatory — willingness-to-pay threshold approximately AUD 45,000-75,000/QALY',
      'Reference pricing within therapeutic groups',
    ],
  },
  brazil: {
    displayName: 'Brazil',
    regulatoryAuthority: 'Agencia Nacional de Vigilancia Sanitaria (ANVISA)',
    relevantDivision: 'General Office for Medicines and Biological Products (GGMED)',
    applicationType: 'New Drug Registration (Registro de Medicamento Novo) or Biological Product Registration',
    standardReviewTimeline: '365 calendar days (statutory target); actual may be longer',
    expeditedReviewTimeline: '120 calendar days (Priority Review for serious conditions)',
    expeditedPathways: [
      {
        name: 'Priority Review (ANVISA)',
        equivalent: 'FDA Priority Review',
        criteria: [
          'Innovative drug for serious or life-threatening condition',
          'No adequate treatment available in Brazil',
          'Drugs already approved by FDA, EMA, or PMDA (stringent regulatory authority)',
        ],
        benefits: ['120-day review target vs. 365-day standard'],
      },
      {
        name: 'Temporary Emergency Use (Uso Emergencial)',
        equivalent: 'FDA Emergency Use Authorization',
        criteria: [
          'Public health emergency',
          'No approved alternative in Brazil',
          'Sufficient evidence of quality, safety, and efficacy',
        ],
        benefits: ['Rapid authorization during public health emergencies'],
      },
    ],
    orphanEquivalent: {
      name: 'No formal orphan drug legislation in Brazil',
      prevalenceThreshold: 'No formal prevalence threshold — ANVISA uses WHO rare disease definition (affecting <65/100,000 persons)',
      exclusivityPeriod: 'No orphan drug exclusivity — standard 10-year data protection for innovative drugs applies',
      otherBenefits: [
        'Priority Review available for drugs for rare diseases',
        'ANVISA may grant compassionate use for rare disease patients',
        'National Commission for Technology Incorporation in SUS (CONITEC) evaluation for public system inclusion',
      ],
    },
    conditionalApproval: {
      name: 'Conditional Approval (ANVISA)',
      criteria: [
        'Serious or life-threatening condition with unmet need',
        'Preliminary evidence of clinical benefit',
        'Product approved by stringent regulatory authority (FDA, EMA, PMDA)',
      ],
      postApprovalRequirements: [
        'Annual renewal based on additional data submission',
        'Confirmatory studies required',
        'ANVISA may revoke if benefit-risk becomes unfavorable',
      ],
    },
    dataRequirementsDifferences: [
      'CTD format accepted but not always mandatory — Brazilian regulatory format also accepted',
      'Portuguese language labeling and product information required',
      'Stability studies under WHO Climatic Zone IVb conditions (30C/75% RH) required',
      'Brazilian GMP certificate (CBPF) required for all manufacturing sites',
      'Local clinical data may be requested for certain therapeutic areas',
      'ANVISA may accept foreign clinical data from well-controlled studies',
    ],
    gmpInspectionRequirements: [
      'ANVISA GMP inspection required for all domestic and foreign manufacturing sites',
      'Certificado de Boas Praticas de Fabricacao (CBPF) — GMP certificate mandatory',
      'ANVISA conducts overseas inspections — significant lead time required',
      'GMP certificate valid for 2 years',
      'Brazil is not currently a PIC/S member (observer status)',
    ],
    referencePricingHTA: [
      'CMED (Camara de Regulacao do Mercado de Medicamentos) — pharmaceutical price regulation',
      'Maximum price set at lowest among reference countries (US, Canada, France, Spain, Portugal, Australia, Greece, Italy, New Zealand)',
      'CONITEC (Comissao Nacional de Incorporacao de Tecnologias no SUS) — HTA for public system (SUS)',
      'Positive CONITEC recommendation required for SUS reimbursement',
      'Private market pricing may differ from SUS pricing',
    ],
  },
  south_korea: {
    displayName: 'South Korea',
    regulatoryAuthority: 'Ministry of Food and Drug Safety (MFDS)',
    relevantDivision: 'Pharmaceutical Safety Bureau — New Drug Division',
    applicationType: 'New Drug Application (NDA) or Biologics License Application (BLA equivalent)',
    standardReviewTimeline: '120 working days (~6 months) statutory target',
    expeditedReviewTimeline: '100 working days (Priority Review); 50 working days (Accelerated Approval drugs)',
    expeditedPathways: [
      {
        name: 'Priority Review (MFDS)',
        equivalent: 'FDA Priority Review',
        criteria: [
          'Drug with significant clinical improvement for serious condition',
          'First domestic application for orphan drug',
          'Drug designated as breakthrough therapy by foreign authority (FDA, EMA)',
        ],
        benefits: ['100 working days review target vs. 120 standard'],
      },
      {
        name: 'Conditional Approval (Korea)',
        equivalent: 'FDA Accelerated Approval',
        criteria: [
          'Serious or life-threatening condition with limited treatment options',
          'Surrogate endpoint or clinical data suggesting benefit',
          'Benefit of early availability outweighs risk of incomplete data',
        ],
        benefits: ['Earlier approval based on preliminary data', 'Conditional marketing permitted'],
      },
      {
        name: 'Fast Track Designation (Korea)',
        equivalent: 'FDA Fast Track',
        criteria: [
          'Innovative drug for serious condition',
          'Potential to address unmet medical need',
          'First-in-class mechanism of action',
        ],
        benefits: ['Pre-review consultation', 'Rolling submission permitted', 'Expedited review'],
      },
    ],
    orphanEquivalent: {
      name: 'Orphan Drug Designation (Korea)',
      prevalenceThreshold: '<20,000 patients in South Korea',
      exclusivityPeriod: '6 years data exclusivity for orphan drugs',
      otherBenefits: [
        'Fee waivers for regulatory review',
        'Priority review designation',
        'Tax incentives for R&D',
        'National Health Insurance (NHI) listing support',
        'Government subsidies for clinical development',
      ],
    },
    conditionalApproval: {
      name: 'Conditional Approval (MFDS)',
      criteria: [
        'Serious or life-threatening condition',
        'No adequate alternative treatment',
        'Expected clinical benefit based on available data',
        'Sponsor commitment to post-marketing studies',
      ],
      postApprovalRequirements: [
        'Post-marketing confirmatory clinical studies',
        'Periodic safety reports',
        'Re-evaluation upon receipt of confirmatory data',
        'Approval may be revoked if confirmatory data does not support benefit-risk',
      ],
    },
    dataRequirementsDifferences: [
      'CTD format required (ICH member since 2016)',
      'Korean bridging study may be required per ICH E5',
      'MFDS encourages inclusion of Korean patients in global MRCTs',
      'Korean labeling in Korean language required',
      'Bio-creep concerns for multiple generic submissions',
      'Project Orbis participation for oncology drugs — simultaneous review with FDA and other agencies',
    ],
    gmpInspectionRequirements: [
      'MFDS GMP inspection required for manufacturing sites',
      'Korea PIC/S member — mutual recognition of GMP inspections from PIC/S members',
      'Pre-approval inspection within review period',
      'GMP certificate renewal every 3 years',
    ],
    referencePricingHTA: [
      'Health Insurance Review and Assessment Service (HIRA) — drug pricing and reimbursement',
      'Positive HTA assessment required for NHI listing',
      'A-7 reference pricing system: price set based on average of 7 comparator countries',
      'Risk-sharing agreements (RSAs) increasingly used for high-cost drugs',
      'Managed Entry Agreements (MEAs) for innovative drugs with uncertain long-term value',
      'Pharmacoeconomic evaluation required for all new drugs seeking NHI listing',
    ],
  },
};

// ── FDA meeting timing and advice: pure lookups by purpose, phase and product type (moved unchanged 2026-11-09, Rule 2
// S5d) ──

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
