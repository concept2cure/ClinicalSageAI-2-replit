import type { MilestoneDefinition } from './document-taxonomy';
import { ms } from './milestone-builder';

// ── US biotech filing identities (2026-10-29) ────────────────────────────────
// docs/design/US_BIOTECH_FILING_COMPLETION_2026-10-27.md. Each identity below
// names its plan explicitly (defaultTaskBlueprint), because the family resolver
// would give it a neighbour's rhythm: a Type D or INTERACT package goes WITH
// the request (MEETING_BRIEFING_TASKS sends it ahead of the meeting), an
// expanded-access submission is not a trial package (DRUG_CTA_TASKS), and a
// Part 600/601 report is not an aggregate safety report. Steps only; the
// clocks and contents are the identity's own lifecycle record's.

/** Type D / INTERACT: the meeting package is submitted with the request. */
export const MEETING_PACKAGE_WITH_REQUEST_TASKS: MilestoneDefinition[] = [
  ms(1, 'prepare', ['ms_mtgr_prep', 'Scope and Questions', 'Confirm the meeting type fits and frame the questions'], [
    ['t_scope', 'Confirm Meeting Type Scope', 'Check the issue fits this meeting type before requesting it'],
    ['t_questions', 'Question List', 'Frame the specific questions with the sponsor position for each'],
  ]),
  ms(2, 'authoring', ['ms_mtgr_author', 'Request and Package', 'Draft the request and its enclosed package together'], [
    ['t_request', 'Meeting Request Letter', 'Request that names the meeting type and encloses the package'],
    ['t_briefing', 'Meeting Package', 'Background and position on each question, enclosed with the request'],
  ]),
  ms(3, 'submission', ['ms_mtgr_submit', 'Submit & Meet', 'Submit request with package; meet and record'], [
    ['t_submit', 'Submit Request with Package', 'One submission: the request and its package'],
    ['t_meeting', 'Hold Meeting & Minutes', 'Conduct the meeting and record minutes'],
  ]),
];

/** Expanded access under 21 CFR part 312 subpart I (individual, intermediate, treatment). */
export const EXPANDED_ACCESS_TASKS: MilestoneDefinition[] = [
  ms(1, 'planning', ['ms_ea_plan', 'Eligibility and Route', 'Criteria, route and right of reference'], [
    ['t_ea_criteria', 'Confirm Expanded Access Criteria', 'Record the facts against the subpart I criteria for this access category'],
    ['t_ea_route', 'Choose the Submission Route', 'New IND or protocol amendment to an existing IND; emergency or non-emergency where individual'],
    ['t_ea_loa', 'Letter of Authorization', 'Obtain the manufacturer\'s right of reference where its IND or master file is relied on'],
  ]),
  ms(2, 'authoring', ['ms_ea_author', 'Submission Documents', 'Forms, treatment plan and IRB'], [
    ['t_ea_forms', 'Prepare FDA Forms from Source', 'Complete the applicable official forms from the source record; never generated'],
    ['t_ea_plan', 'Rationale and Treatment Plan', 'Rationale, treatment plan or protocol, and monitoring'],
    ['t_ea_irb', 'IRB Review and Informed Consent', 'IRB review and consent under 21 CFR parts 50 and 56'],
  ]),
  ms(3, 'submission', ['ms_ea_submit', 'Submit and Follow Up', 'Submit and meet the follow-up obligations'], [
    ['t_submit', 'Submit to FDA', 'Submit by the chosen route'],
    ['t_ea_followup', 'Follow-up Reports', 'Safety reports, annual reports and any end-of-treatment summary the category requires'],
  ]),
];

/** BLA periodic reports: minor changes (601.12(d)), pediatric (601.28), PMR/PMC status (601.70), distribution (600.81). */
export const BLA_PERIODIC_REPORT_TASKS: MilestoneDefinition[] = [
  ms(1, 'collection', ['ms_blar_collect', 'Source Records', 'Collect the records the report is built from'], [
    ['t_period', 'Reporting Period and Due Date', 'Fix the interval and due date from the report\'s own rule'],
    ['t_sources', 'Collect Source Records', 'Change control, distribution, pediatric or postmarketing study records as the report requires'],
  ]),
  ms(2, 'authoring', ['ms_blar_author', 'Report Preparation', 'Prepare the report parts'], [
    ['t_report', 'Prepare Report Parts', 'Narrative parts from the sources; tables and listings from controlled records'],
  ]),
  ms(3, 'submission', ['ms_blar_submit', 'Review & Submit', 'Review and submit'], [
    ['t_review', 'Regulatory and Quality Review', 'Review against the source records'],
    ['t_submit', 'Submit Report', 'Submit to the BLA by the due date'],
  ]),
];

/** Biological product deviation report (21 CFR 600.14, Form FDA 3486). */
export const BIOLOGICAL_DEVIATION_REPORT_TASKS: MilestoneDefinition[] = [
  ms(1, 'assessment', ['ms_bpdr_assess', 'Reportability', 'Assess and start the clock'], [
    ['t_reportability', 'Reportability Assessment', 'Deviation or unexpected event, possible effect on safety, purity or potency, distribution status'],
    ['t_clock', 'Record the Clock Start', 'Date information reasonably suggested a reportable event'],
  ]),
  ms(2, 'authoring', ['ms_bpdr_author', 'Report', 'Investigation and form'], [
    ['t_investigation', 'Investigation and CAPA Summary', 'From the deviation and CAPA records'],
    ['t_form_3486', 'Complete Form FDA 3486', 'Official form completed from the deviation record'],
  ]),
  ms(3, 'submission', ['ms_bpdr_submit', 'Submit', 'Quality approval and submission'], [
    ['t_qa', 'Quality Approval', 'Quality approves the report'],
    ['t_submit', 'Submit BPDR', 'Submit within the 21 CFR 600.14 period'],
  ]),
];

/** CBER lot release protocol and samples (21 CFR 610.2). */
export const LOT_RELEASE_TASKS: MilestoneDefinition[] = [
  ms(1, 'compilation', ['ms_lr_compile', 'Protocol Compilation', 'From the batch and test records'], [
    ['t_protocol', 'Compile Lot Release Protocol', 'Manufacturing and test results from the batch and QC records'],
    ['t_samples', 'Samples (when required)', 'Prepare samples where FDA requires them for the lot'],
  ]),
  ms(2, 'review', ['ms_lr_review', 'Quality Review', 'Review and sign'], [
    ['t_qa_signoff', 'Quality Review and Signature', 'Responsible official reviews and signs the protocol'],
  ]),
  ms(3, 'submission', ['ms_lr_submit', 'Submit and Hold', 'Submit and hold distribution'], [
    ['t_submit', 'Submit Protocol and Samples', 'Submit to CBER for the lot'],
    ['t_hold', 'Hold Until Released', 'Do not distribute the lot until FDA releases it'],
  ]),
];

/** FD&C Act 564 emergency use authorization request for a drug or biologic. */
export const EUA_REQUEST_TASKS: MilestoneDefinition[] = [
  ms(1, 'planning', ['ms_eua_plan', 'Basis for the Request', 'Declaration and criteria'], [
    ['t_declaration', 'Confirm the Emergency Declaration', 'Identify the section 564 declaration the request relies on'],
    ['t_criteria', 'Criteria Assessment', 'Record the evidence against the section 564(c) criteria'],
  ]),
  ms(2, 'authoring', ['ms_eua_author', 'Request Documents', 'Request, data and fact sheets'], [
    ['t_request', 'Request and Benefit-Risk Narrative', 'The request and its benefit-risk statement from the data'],
    ['t_data', 'Safety, Effectiveness and CMC Data', 'Controlled data, or reference to the submissions holding them'],
    ['t_fact_sheets', 'Proposed Fact Sheets', 'Health care provider and recipient fact sheets'],
  ]),
  ms(3, 'submission', ['ms_eua_submit', 'Submit and Respond', 'Submit and answer FDA'], [
    ['t_submit', 'Submit EUA Request', 'Submit to FDA'],
    ['t_irs', 'Respond to FDA Requests', 'Answer FDA questions on the request'],
  ]),
];
