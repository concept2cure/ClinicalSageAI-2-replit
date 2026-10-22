/**
 * The one current M11 level 1/2 protocol heading record. Project bootstrap,
 * Anna's component template and the existing DocumentOutline renderer project
 * this record; none holds another M11 heading tree.
 *
 * Adapted from ICH M11 Template, copyright ICH, adopted 19 November 2025,
 * FDA final May 2026. ICH permits adaptation with acknowledgement. The concise
 * purposes below are platform authoring summaries, not verbatim template text.
 * Neither ICH nor FDA endorses this adaptation. Detailed lower-level fields,
 * controlled terminology and electronic cardinality are not encoded here.
 */
import type { RegulatoryBasis } from './regulatory-basis';

export const ICH_M11_PROTOCOL_BASIS: RegulatoryBasis = {
  ref: 'ICH M11 CeSHarP final template — level 1 and 2 headings (FDA May 2026)',
  confidence: 'regulator-text',
  url: 'https://www.fda.gov/media/192647/download',
  checked: '2026-10-07',
  note: 'Heading structure checked against the final template; purposes are platform summaries. Retaining a heading does not establish that its content applies to every trial.',
};

export const ICH_M11_PROTOCOL_LIMITATIONS: readonly string[] = [
  'This M11 structure is for interventional clinical trial protocols, including drug and biological products. Confirm a suitable source template for observational research and other document classes.',
  'The required flags mean retain these level 1/2 headings when using M11. They do not require every possible assessment, intervention, objective or analysis; establish applicability from the approved design and use an explicit, justified not-applicable statement where appropriate.',
  'Only front matter and level 1/2 headings are encoded. Consult the final template for deeper headings, conditional text, repeatable objectives, fields and formatting. Remove its instructional section 0 and authoring prompts before finalisation.',
  'Purpose notes are platform authoring summaries of where approved sponsor material belongs; they are not a complete or verbatim agency content specification.',
  'Confirm current country and agency implementation, ethics requirements, client template, protocol version and amendment scope. Existing E6(R2) projects require a reviewed mapping before adopting the changed M11 section numbers (E6(R2) is superseded by E6(R3), 2025-01-06).',
  'This outline does not implement or validate M11 technical specification exchange, establish a filing format or demonstrate agency acceptance, source completeness, scientific adequacy or approval.',
];

export interface M11ProtocolSection {
  /** Platform key for front matter; the exact source number for numbered headings. */
  code: string;
  number?: string;
  title: string;
  /** Platform summary directing authoring from approved sponsor material. */
  purpose: string;
}

function section(number: string, title: string, purpose: string): M11ProtocolSection {
  return { code: number, number, title, purpose };
}

const CONTAINER = 'Retain this containing heading and populate its applicable subsections from the approved trial design and sponsor source records.';

export const ICH_M11_PROTOCOL_SECTIONS: readonly M11ProtocolSection[] = [
  { code: 'title_page', title: 'Title Page', purpose: 'Identify the sponsor, product, trial, protocol version, available regulatory identifiers, approval and signatory records. Apply the source title-page field instructions.' },
  { code: 'amendment_details', title: 'Amendment Details', purpose: 'State original or amended protocol status; for an amendment, document its scope, rationale and current changes with references to affected sections.' },
  { code: 'table_of_contents', title: 'Table of Contents', purpose: 'Provide a navigable, current contents list consistent with the final protocol headings.' },
  section('1', 'PROTOCOL SUMMARY', CONTAINER),
  section('1.1', 'Protocol Synopsis', 'Summarise the approved objectives, estimands, design and population; use the deeper synopsis fields in the source template.'),
  section('1.2', 'Trial Schema', 'Show the sequence of trial periods, intervention groups and participant progression consistent with the detailed design.'),
  section('1.3', 'Schedule of Activities', 'Reconcile assessments, procedures, visit timing and allowed windows with the approved protocol and operational records.'),
  section('2', 'INTRODUCTION', CONTAINER),
  section('2.1', 'Purpose of Trial', 'Explain the scientific purpose and rationale using the development programme and supporting clinical and nonclinical evidence.'),
  section('2.2', 'Assessment of Risks and Benefits', 'Summarise supported risks, mitigation, potential benefits and the integrated risk-benefit assessment; consult its deeper source headings.'),
  section('3', 'TRIAL OBJECTIVES AND ASSOCIATED ESTIMANDS', CONTAINER),
  section('3.1', 'Primary Objective(s) and Associated Estimand(s)', 'State each primary objective and associated endpoint; define the applicable estimand characteristics using the source repeatable objective structure.'),
  section('3.2', 'Secondary Objective(s) and Associated Estimand(s)', 'Document the approved secondary objectives and associated estimands, or an explicit not-applicable statement when no secondary objective exists.'),
  section('3.3', 'Exploratory Objective(s)', 'Document approved exploratory objectives and endpoints; define estimands when applicable and preserve the source repeatable structure.'),
  section('4', 'TRIAL DESIGN', CONTAINER),
  section('4.1', 'Description of Trial Design', 'Describe the intervention model, comparator, trial periods and applicable adaptive, dose-escalation or transition features; reconcile with the synopsis and schema.'),
  section('4.2', 'Rationale for Trial Design', 'Justify the approved design, estimands, intervention model, control, duration and applicable novel features from supporting evidence.'),
  section('4.3', 'Trial Stopping Rules', 'State approved rules for stopping the trial and the evidence and decision responsibilities supporting them.'),
  section('4.4', 'Start of Trial and End of Trial', 'Define trial start and end using the approved operational and regulatory definitions.'),
  section('4.5', 'Access to Trial Intervention After End of Trial', 'Explain post-trial intervention access arrangements and their applicability using sponsor and country-specific records.'),
  section('5', 'TRIAL POPULATION', CONTAINER),
  section('5.1', 'Description of Trial Population and Rationale', 'Describe the intended population and justify its selection and representativeness for the scientific question.'),
  section('5.2', 'Inclusion Criteria', 'List the approved, operationally clear eligibility conditions without inventing thresholds or biomarkers.'),
  section('5.3', 'Exclusion Criteria', 'List the approved exclusion conditions with the design and safety rationale where specified.'),
  section('5.4', 'Contraception', 'Record applicable reproductive-risk definitions and contraception requirements from the approved product risk assessment and country requirements.'),
  section('5.5', 'Lifestyle Restrictions', 'Specify applicable dietary, substance-use, activity and other restrictions from the approved trial design.'),
  section('5.6', 'Screen Failure and Rescreening', 'Describe screen-failure records and the approved conditions and procedures for rescreening.'),
  section('6', 'TRIAL INTERVENTION AND CONCOMITANT THERAPY', CONTAINER),
  section('6.1', 'Description of Investigational Trial Intervention', 'Identify each investigational intervention using the approved product, formulation and intervention records.'),
  section('6.2', 'Rationale for Investigational Trial Intervention Dose and Regimen', 'Justify dose, regimen and exposure using the supporting clinical, nonclinical and pharmacology evidence.'),
  section('6.3', 'Investigational Trial Intervention Administration', 'State the approved route, administration schedule and operational instructions.'),
  section('6.4', 'Investigational Trial Intervention Dose Modification', 'Describe approved dose adjustment, interruption and restart conditions using source rules.'),
  section('6.5', 'Management of Investigational Trial Intervention Overdose', 'Describe applicable overdose management and reporting using approved safety guidance.'),
  section('6.6', 'Preparation, Storage, Handling and Accountability of Investigational Trial Intervention', 'Reconcile preparation, storage, handling and accountability with the current product and pharmacy records.'),
  section('6.7', 'Investigational Trial Intervention Assignment, Randomisation and Blinding', 'Describe assignment and applicable randomisation, blinding and emergency-unblinding procedures using the source substructure.'),
  section('6.8', 'Investigational Trial Intervention Adherence', 'Explain how adherence will be assessed and addressed under the approved procedures.'),
  section('6.9', 'Description of Noninvestigational Trial Intervention', 'Describe applicable background, rescue and other noninvestigational interventions using approved treatment records.'),
  section('6.10', 'Concomitant Therapy', 'State applicable permitted and prohibited therapies and the approved recording and management procedures.'),
  section('7', 'PARTICIPANT DISCONTINUATION OF TRIAL INTERVENTION AND DISCONTINUATION OR WITHDRAWAL FROM TRIAL', CONTAINER),
  section('7.1', 'Discontinuation of Trial Intervention for Individual Participants', 'Distinguish permanent or temporary intervention discontinuation and applicable rechallenge procedures from trial withdrawal.'),
  section('7.2', 'Participant Discontinuation or Withdrawal from the Trial', 'Describe participant trial withdrawal, data and sample decisions, and applicable follow-up using approved consent and trial procedures.'),
  section('7.3', 'Management of Loss to Follow-Up', 'Describe approved attempts and responsibilities for follow-up and documentation of participants who cannot be contacted.'),
  section('8', 'TRIAL ASSESSMENTS AND PROCEDURES', CONTAINER),
  section('8.1', 'Trial Assessments and Procedures Considerations', 'Describe assessment procedures and relevant operational considerations consistent with the schedule of activities.'),
  section('8.2', 'Screening/Baseline Assessments and Procedures', 'Specify the approved screening and baseline procedures, timing and eligibility verification.'),
  section('8.3', 'Efficacy Assessments and Procedures', 'Define endpoint measurements and assessment procedures consistent with the objectives and analysis plan.'),
  section('8.4', 'Safety Assessments and Procedures', 'Describe applicable safety assessments, their methods and timing; use the source deeper headings for the selected assessments.'),
  section('8.5', 'Pharmacokinetics', 'Document applicable pharmacokinetic sampling and assessment procedures from the approved protocol and bioanalytical records.'),
  section('8.6', 'Biomarkers', 'Specify applicable genetic, genomic, pharmacodynamic and other biomarker procedures and sample plans.'),
  section('8.7', 'Immunogenicity Assessments', 'Document applicable immunogenicity sampling and assessments using the approved assay and analysis plans.'),
  section('8.8', 'Medical Resource Utilisation and Health Economics', 'Describe applicable resource-use and economic assessments from the approved design.'),
  section('9', 'ADVERSE EVENTS, SERIOUS ADVERSE EVENTS, PRODUCT COMPLAINTS, PREGNANCY AND POSTPARTUM INFORMATION, AND SPECIAL SAFETY SITUATIONS', CONTAINER),
  section('9.1', 'Definitions', 'Use the approved adverse-event, serious-adverse-event and applicable product-complaint definitions, with the source substructure.'),
  section('9.2', 'Timing and Procedures for Collection and Reporting', 'Reconcile safety collection periods, evaluation and reporting procedures with the approved safety plan and applicable agency obligations.'),
  section('9.3', 'Pregnancy and Postpartum Information', 'Describe applicable collection and follow-up for participant or partner pregnancies using the approved safety and consent procedures.'),
  section('9.4', 'Special Safety Situations', 'Identify applicable special safety situations and their collection, assessment and reporting procedures.'),
  section('10', 'STATISTICAL CONSIDERATIONS', CONTAINER),
  section('10.1', 'General Considerations', 'State the statistical framework and relationship to the approved statistical analysis plan.'),
  section('10.2', 'Analysis Sets', 'Define the approved analysis populations and rules for participant inclusion.'),
  section('10.3', 'Analyses of Demographics and Other Baseline Variables', 'Describe planned demographic and baseline summaries without creating study results.'),
  section('10.4', 'Analyses Associated with the Primary Objective(s)', 'Link each primary analysis to its estimand, intercurrent-event handling, missing-data approach and applicable sensitivity analyses.'),
  section('10.5', 'Analyses Associated with the Secondary Objective(s)', 'Describe the approved secondary analyses and associated estimand and missing-data methods, or state their non-applicability.'),
  section('10.6', 'Analyses Associated with the Exploratory Objective(s)', 'Describe applicable exploratory analyses and their interpretation under the approved analysis plan.'),
  section('10.7', 'Safety Analyses', 'Describe planned safety analyses and exposure summaries using the approved safety and statistical plans.'),
  section('10.8', 'Other Analyses', 'Describe other approved analyses applicable to the design without inventing new objectives.'),
  section('10.9', 'Interim Analyses', 'Describe applicable interim analyses, decision rules and information access using the approved design and analysis plan.'),
  section('10.10', 'Multiplicity Adjustments', 'Describe applicable multiplicity control and its relationship to the approved testing strategy.'),
  section('10.11', 'Sample Size Determination', 'Trace the sample-size rationale, assumptions and calculations to approved statistical records; never invent quantitative inputs.'),
  section('11', 'TRIAL OVERSIGHT AND OTHER GENERAL CONSIDERATIONS', CONTAINER),
  section('11.1', 'Regulatory and Ethical Considerations', 'State the applicable regulatory, ethical and GCP framework using current country and ethics records.'),
  section('11.2', 'Trial Oversight', 'Describe investigator and sponsor responsibilities and oversight arrangements from the approved governance records.'),
  section('11.3', 'Informed Consent Process', 'Describe the approved consent process and applicable rescreening or remaining-sample provisions, consistent with ethics-approved forms.'),
  section('11.4', 'Committees', 'Describe applicable committee roles and link to current committee charters.'),
  section('11.5', 'Insurance and Indemnity', 'State applicable participant protection and insurance arrangements using approved country and sponsor records.'),
  section('11.6', 'Risk-Based Quality Management', 'Describe the approved approach to trial quality risks, critical factors and proportionate controls using the quality-management records.'),
  section('11.7', 'Data Governance', 'Describe approved data-management and governance responsibilities and processes.'),
  section('11.8', 'Data Protection', 'Describe applicable privacy and data-protection arrangements using the approved consent and country records.'),
  section('11.9', 'Source Records', 'Describe source-record expectations and authorised access for monitoring, audit and inspection using applicable agreements.'),
  section('11.10', 'Protocol Deviations', 'Describe approved deviation handling and documentation procedures.'),
  section('11.11', 'Early Site Closure', 'Specify approved site-closure decision rights, criteria and responsibilities.'),
  section('11.12', 'Data Dissemination', 'Describe applicable trial registration, results reporting and dissemination plans using approved sponsor policy and regulatory records.'),
  section('12', 'APPENDIX: SUPPORTING DETAILS', CONTAINER),
  section('12.1', 'Clinical Laboratory Tests', 'Specify the applicable laboratory panels and referenced calculations consistent with the assessment schedule.'),
  section('12.2', 'Country/Region-Specific Differences', 'Identify approved country or region differences, affected protocol sections and their communication through local addenda or other documented arrangements.'),
  section('12.3', 'Prior Protocol Amendment(s)', 'State amendment history and retain the applicable original, first-amendment or prior-amendment information using controlled versions.'),
  section('13', 'APPENDIX: GLOSSARY OF TERMS AND ABBREVIATIONS', 'Define terms and abbreviations used in the protocol consistently with its content.'),
  section('14', 'APPENDIX: REFERENCES', 'List the actual sources cited in the protocol and verify each reference.'),
];
