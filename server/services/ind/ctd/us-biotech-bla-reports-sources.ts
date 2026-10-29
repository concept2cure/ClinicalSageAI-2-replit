/**
 * Canonical lifecycle source records for the licensed-biologic (BLA) reports
 * that had a registry identity in the contract but no lifecycle record of their
 * own (docs/design/US_BIOTECH_FILING_COMPLETION_2026-10-27.md, interfaces
 * item 2): the 601.12(d) annual report of minor changes, the 601.28 pediatric
 * annual report, the 601.70 postmarketing study status report, the 600.81
 * distribution report, the 600.14 biological product deviation report and the
 * 600.80(c)(2) periodic adverse experience report.
 *
 * What already exists, and why these are separate records: `nda_bla_annual_report`
 * in lifecycle-document-types.ts follows 21 CFR 314.81(b)(2) and only cites the
 * Part 600/601 obligations ("cited here, not modelled part by part"); the
 * post-approval annual planner emits NDA sections with a biologic note. A BLA
 * report reads its own Part 600/601 source here. Pharmacovigilance knowledge
 * (pharmacovigilance-knowledge.ts) and the SOP requirement for BPDR
 * (shared/regulatory/sop-requirements.ts) cite the same sections; they are
 * obligations, not authoring records, and are not restated or replaced.
 *
 * Confidence: every basis is `recall`. www.ecfr.gov and fda.gov were not
 * reachable from this session (egress refused, 2026-10-29), so no section was
 * re-read for these records; each citation says so. Guidance titles and dates
 * are from knowledge and carry the same mark.
 *
 * AnA eligibility follows the existing projection rule
 * (market-specs/us-biotech-lifecycle-templates.ts): `table`/`form`/`data`
 * components are manual/source-controlled. No component here is `mixed`, so
 * none depends on that file's ORIGINAL_MIXED list. The only form number named is
 * Form FDA 3486, which 21 CFR 600.14(d) prescribes for a BPDR; no other report
 * here is given a transmittal form number.
 *
 * @module server/services/ind/ctd/us-biotech-bla-reports-sources
 */
import type { CtdContentType, LifecycleComponent, LifecycleDocumentType } from './types.js';

/** Lifecycle ids and the registry ids the root creates for them. */
export const US_BLA_REPORT_SOURCE_IDS = {
  annual: { id: 'us_bla_annual_report', registryId: 'US_BLA_ANNUAL' },
  pediatric: { id: 'us_bla_pediatric_annual_report', registryId: 'US_BLA_PEDIATRIC_ANNUAL' },
  pmrStatus: { id: 'us_bla_pmr_status_report', registryId: 'US_BLA_PMR_ANNUAL' },
  distribution: { id: 'us_bla_distribution_report', registryId: 'US_BLA_DISTRIBUTION' },
  bpdr: { id: 'us_bpdr', registryId: 'US_BPDR' },
  pae: { id: 'us_bla_periodic_adverse_experience_report', registryId: 'US_BLA_PAE_REPORT' },
} as const;

const NOT_REREAD = 'recall: not re-read on eCFR for this record';

/** A 21 CFR citation string carrying its confidence mark. */
const cfr = (section: string, what: string): string => `21 CFR ${section} (${what}) (${NOT_REREAD})`;
/** A named FDA guidance citation carrying its confidence mark. */
const guidance = (title: string, date: string): string =>
  `FDA guidance: ${title} (${date}) (recall: title and date not re-read on fda.gov)`;

const MANUAL_NOTE = 'Prepared from the controlled source record; AnA does not generate or replace it.';

interface PartSpec {
  code: string;
  title: string;
  contentType: CtdContentType;
  basis: string;
  authoring: string;
  elements: string[];
  prompt: string;
  required?: boolean;
}

/** One component with its basis written into the governing reference. */
function part(spec: PartSpec): LifecycleComponent {
  const manual = spec.contentType === 'form' || spec.contentType === 'data' || spec.contentType === 'table';
  return {
    code: spec.code, title: spec.title, required: spec.required ?? true, contentType: spec.contentType,
    guidance: `Basis: ${spec.basis}.`,
    authoringGuidance: manual ? `${spec.authoring} ${MANUAL_NOTE}` : spec.authoring,
    keyContentElements: spec.elements,
    generationPrompt: manual ? 'Not drafted: populate from the controlled source record.' : spec.prompt,
  };
}

const ANNUAL_6012D = cfr('601.12(d)', 'changes to be described in an annual report: minor changes with minimal potential for an adverse effect on identity, strength, quality, purity or potency');
const ANNUAL_6012F3 = cfr('601.12(f)(3)', 'labeling changes with minimal potential for an adverse effect, described in an annual report');

function blaAnnualReport(): LifecycleDocumentType {
  const ids = US_BLA_REPORT_SOURCE_IDS.annual;
  return {
    id: ids.id, registryId: ids.registryId, label: 'BLA Annual Report of Minor Changes', category: 'periodic', family: 'BLA', agency: 'FDA',
    description: 'The annual report in which a licensed biologic\'s applicant describes the minor manufacturing, controls and labeling changes it implemented without a supplement (21 CFR 601.12(d) and 601.12(f)(3)). It is not the NDA annual report under 314.81(b)(2): its content is the change description 601.12(d) prescribes. Postmarketing study status (601.70), pediatric reporting (601.28), distribution (600.81) and periodic adverse experience reports (600.80(c)(2)) are separate obligations with their own records.',
    regulatoryBasis: [
      ANNUAL_6012D, ANNUAL_6012F3,
      guidance('Changes to an Approved Application for Specified Biotechnology and Specified Synthetic Biological Products', 'July 1997'),
      guidance('Chemistry, Manufacturing, and Controls Changes to an Approved Application: Certain Biological Products', 'draft, June 2021'),
    ],
    timing: `Within 60 days of the anniversary date of approval of the application (${ANNUAL_6012D}).`,
    components: [
      part({
        code: 'bla_annual.cover', title: 'Cover Letter and Index', contentType: 'narrative', basis: ANNUAL_6012D,
        authoring: 'Identify the BLA (STN), the product\'s proper name, the reporting period ending on the approval anniversary and an index of the changes reported. Use the transmittal form FDA currently specifies for the submission; this record names none.',
        elements: ['BLA STN, proper and proprietary names', 'Reporting period and approval anniversary date', 'Index of changes reported, by site and change', 'Applicant contact and responsible official'],
        prompt: 'Draft the cover letter for {{SPONSOR}}\'s BLA annual report of minor changes (21 CFR 601.12(d)) for {{PRODUCT_NAME}}, with the STN, reporting period and an index of the changes from the change-control records. Use bracketed placeholders for numbers and dates.',
      }),
      part({
        code: 'bla_annual.products', title: 'List of Products Involved', contentType: 'table', basis: ANNUAL_6012D,
        authoring: 'List every licensed product the reported changes affect.',
        elements: ['Product proper name and STN', 'Strengths/presentations affected', 'Changes (by reference number) that affect each product'], prompt: '',
      }),
      part({
        code: 'bla_annual.changes', title: 'Description of Each Manufacturing and Controls Change', contentType: 'narrative', basis: ANNUAL_6012D,
        authoring: 'Describe each change fully: the manufacturing site(s) or area(s) involved, the date the change was made, a cross-reference to the validation protocols and/or SOPs, and the statement that the effects of the change have been assessed. A change with more than minimal potential for an adverse effect belongs in a CBE-30 or prior approval supplement (601.12(b)-(c)), not here.',
        elements: ['Full description of the change', 'Manufacturing site(s) or area(s) involved', 'Date the change was made', 'Cross-reference to validation protocols and/or SOPs', 'Statement that the effects of the change were assessed', 'Why the change is annual-reportable rather than a supplement'],
        prompt: 'Draft the description of each minor change for {{SPONSOR}}\'s BLA annual report on {{PRODUCT_NAME}} (21 CFR 601.12(d)) from the change-control records: site or area, date implemented, validation/SOP cross-reference, and the statement that the effects were assessed. Do not describe a change, date or result the records do not contain.',
      }),
      part({
        code: 'bla_annual.data', title: 'Data From Studies and Tests Evaluating Each Change', contentType: 'data', basis: ANNUAL_6012D,
        authoring: 'Attach the relevant data from the studies and tests performed to evaluate the effect of each change.',
        elements: ['Validation and comparability results per change', 'Stability data where applicable', 'Reference to the controlled study report'], prompt: '',
      }),
      part({
        code: 'bla_annual.labeling', title: 'Minor Labeling Changes', contentType: 'narrative', basis: ANNUAL_6012F3, required: false,
        authoring: 'Describe each labeling change with minimal potential for an adverse effect (for example an editorial change) implemented during the period. Labeling changes outside 601.12(f)(3) are submitted as supplements.',
        elements: ['Each minor labeling change, before and after', 'Date implemented', 'Why it qualifies under 601.12(f)(3)'],
        prompt: 'Describe the minor labeling changes implemented during the period for {{PRODUCT_NAME}} (21 CFR 601.12(f)(3)) from the labeling change records, before and after, with the date implemented.',
      }),
    ],
  };
}

const PED_601_28 = cfr('601.28', 'annual reports of postmarketing pediatric studies for licensed biological products');

function blaPediatricAnnualReport(): LifecycleDocumentType {
  const ids = US_BLA_REPORT_SOURCE_IDS.pediatric;
  return {
    id: ids.id, registryId: ids.registryId, label: 'BLA Pediatric Annual Report', category: 'periodic', family: 'BLA', agency: 'FDA',
    description: 'The annual report a licensed biologic\'s sponsor submits on pediatric use: a summary of pediatric labeling supplements and studies with exposure estimates, an analysis of pediatric safety and efficacy data, and the status of pediatric postmarketing studies (21 CFR 601.28).',
    regulatoryBasis: [PED_601_28, 'FD&C Act section 505B (pediatric assessments; PREA) (recall: not re-read for this record)'],
    timing: `Each year within 60 days of the anniversary date of approval of the license (${PED_601_28}).`,
    components: [
      part({
        code: 'bla_ped.summary', title: 'Summary of Pediatric Labeling and Studies, With Exposure Estimate', contentType: 'narrative', basis: cfr('601.28(a)', 'summary'),
        authoring: 'State whether labeling supplements for pediatric use have been submitted and whether new pediatric studies to support labeling have been initiated. Where possible, estimate patient exposure with special reference to the pediatric population (neonates, infants, children, adolescents), including dosage form.',
        elements: ['Pediatric labeling supplements submitted (or none)', 'New pediatric studies initiated (or none)', 'Patient exposure estimate by pediatric age group and dosage form, with its source and method'],
        prompt: 'Draft the 21 CFR 601.28(a) summary for {{SPONSOR}}\'s {{PRODUCT_NAME}}: pediatric labeling supplements submitted, new pediatric studies initiated and the exposure estimate by age group, from the source records. Do not state an exposure figure the records do not give.',
      }),
      part({
        code: 'bla_ped.exposure', title: 'Pediatric Exposure Data', contentType: 'table', basis: cfr('601.28(a)', 'summary'), required: false,
        authoring: 'Tabulate the exposure estimate by age group and dosage form, with the data source.',
        elements: ['Age group', 'Dosage form', 'Estimated exposure and units', 'Data source and period'], prompt: '',
      }),
      part({
        code: 'bla_ped.clinical', title: 'Analysis of Pediatric Safety and Efficacy Data', contentType: 'narrative', basis: cfr('601.28(b)', 'clinical data'),
        authoring: 'Analyze the available pediatric safety and efficacy data, state the labeling changes proposed on that basis, and assess the data needed to ensure appropriate pediatric labeling.',
        elements: ['Available pediatric safety and efficacy data', 'Labeling changes proposed from the data', 'Assessment of the data still needed for appropriate pediatric labeling'],
        prompt: 'Draft the pediatric safety and efficacy analysis (21 CFR 601.28(b)) for {{PRODUCT_NAME}} in {{INDICATION}}, the labeling changes it supports and the data still needed, from the cited study reports. Do not state a result the reports do not contain.',
      }),
      part({
        code: 'bla_ped.status', title: 'Status of Pediatric Postmarketing Studies', contentType: 'table', basis: cfr('601.28(c)', 'status reports of pediatric postmarketing studies'),
        authoring: 'Give the current status of each pediatric postmarketing study performed by or on behalf of the applicant, including required pediatric assessments and commitments.',
        elements: ['Study identifier and description', 'Whether required (FD&C Act 505B) or committed', 'Current status and schedule'], prompt: '',
      }),
    ],
  };
}

const PMR_601_70 = cfr('601.70', 'annual progress reports of postmarketing studies');
const PMR_505O = 'FD&C Act section 505(o)(3)(E)(ii) (applicant periodically reports the status of each required postmarketing study or clinical trial; FDA implements the report through the 21 CFR 601.70 annual status report) (recall: not re-read for this record)';

function blaPmrStatusReport(): LifecycleDocumentType {
  const ids = US_BLA_REPORT_SOURCE_IDS.pmrStatus;
  return {
    id: ids.id, registryId: ids.registryId, label: 'BLA Postmarketing Requirement and Commitment Status Report', category: 'periodic', family: 'BLA', agency: 'FDA',
    description: 'The annual status report, for each postmarketing requirement and commitment of an approved BLA, of the clinical safety, clinical efficacy, clinical pharmacology and nonclinical toxicology studies FDA required or the applicant committed to conduct (21 CFR 601.70; FD&C Act 505(o)(3)(E)(ii)). It is a requirement-status submission, not a study protocol: a protocol submitted to fulfil a PMR is a separate submission.',
    regulatoryBasis: [
      PMR_601_70, PMR_505O,
      guidance('Postmarketing Studies and Clinical Trials — Implementation of Section 505(o)(3) of the Federal Food, Drug, and Cosmetic Act', 'April 2011; revised draft October 2019'),
      guidance('Reports on the Status of Postmarketing Study Commitments — Implementation of Section 130 of the Food and Drug Administration Modernization Act of 1997', 'February 2006'),
    ],
    timing: `Within 60 days of the anniversary date of U.S. approval of the original application, and annually until FDA notifies the applicant in writing that the study is fulfilled or no longer feasible (${PMR_601_70}).`,
    components: [
      part({
        code: 'bla_pmr.cover', title: 'Cover Letter and Index of Studies', contentType: 'narrative', basis: PMR_601_70,
        authoring: 'Identify the applicant, the product\'s established and proper names, the BLA STN and the date of U.S. approval, and index every open postmarketing requirement and commitment reported.',
        elements: ['Applicant name', 'Established and proper names', 'BLA STN and date of U.S. approval', 'Index of each PMR/PMC by FDA identifier'],
        prompt: 'Draft the cover letter for {{SPONSOR}}\'s 21 CFR 601.70 postmarketing study status report for {{PRODUCT_NAME}}, with the STN, approval date and an index of each PMR and PMC by its FDA identifier from the commitment records. Use bracketed placeholders for identifiers and dates.',
      }),
      part({
        code: 'bla_pmr.status_table', title: 'Status of Each Postmarketing Requirement and Commitment', contentType: 'table', basis: `${PMR_601_70}; ${PMR_505O}`,
        authoring: 'One row per study: the date of the requirement or commitment, its description, the schedule for completion and reporting, and its current status (pending, ongoing, delayed, terminated or submitted). Fulfilled and released are FDA determinations, recorded only from FDA correspondence.',
        elements: ['FDA PMR/PMC identifier', 'Required (505(o)) or committed', 'Date of the requirement or commitment', 'Description', 'Original schedule for completion and reporting', 'Current status category', 'Revised schedule, if proposed'], prompt: '',
      }),
      part({
        code: 'bla_pmr.explanation', title: 'Explanation of Status and Any Revised Schedule', contentType: 'narrative', basis: PMR_601_70,
        authoring: 'Explain each study\'s status, in particular any delay or termination and its cause, and justify any proposed revised schedule.',
        elements: ['Explanation of each study\'s status', 'Cause of each delay or termination', 'Proposed revised schedule and its justification'],
        prompt: 'Write the status explanation for each postmarketing requirement and commitment of {{PRODUCT_NAME}} from the study tracking records, explaining each delay or termination and any proposed revised schedule. Do not state a status or date the records do not give.',
      }),
    ],
  };
}

const DIST_600_81 = cfr('600.81', 'distribution reports');

function blaDistributionReport(): LifecycleDocumentType {
  const ids = US_BLA_REPORT_SOURCE_IDS.distribution;
  return {
    id: ids.id, registryId: ids.registryId, label: 'BLA Distribution Report', category: 'periodic', family: 'BLA', agency: 'FDA',
    description: 'The report of the quantity of a licensed biological product distributed under the license, including to distributors, by bulk, fill and label lot (21 CFR 600.81).',
    regulatoryBasis: [DIST_600_81],
    timing: `At 6-month intervals, or another interval FDA specifies in writing (${DIST_600_81}).`,
    components: [
      part({
        code: 'bla_dist.cover', title: 'Cover Letter', contentType: 'narrative', basis: DIST_600_81,
        authoring: 'Identify the license, product and the period the report covers, and state the electronic format used if FDA requires one.',
        elements: ['BLA STN and product proper name', 'Reporting period', 'Applicant contact'],
        prompt: 'Draft a short cover letter for {{SPONSOR}}\'s 21 CFR 600.81 distribution report for {{PRODUCT_NAME}}, identifying the STN and reporting period. Use bracketed placeholders.',
      }),
      part({
        code: 'bla_dist.lots', title: 'Lot Distribution Data', contentType: 'data', basis: DIST_600_81,
        authoring: 'Report, per lot, the bulk lot number from which the final container was filled, the fill lot numbers and the total dosage units of each strength or potency distributed, the label lot number if different, the labeled expiration date, the number of doses per fill or label lot, and the date of release for distribution; if a significant amount of a fill or label lot is returned, report that too.',
        elements: ['Bulk lot number', 'Fill lot number and dosage units distributed by strength or potency', 'Label lot number (if different)', 'Labeled expiration date', 'Doses per fill/label lot', 'Date of release for distribution', 'Quantity distributed to distributors', 'Significant quantities returned, by fill or label lot'], prompt: '',
      }),
    ],
  };
}

const BPDR_600_14 = cfr('600.14', 'reporting of biological product deviations by licensed manufacturers');
const BPDR_FORM = cfr('600.14(d)', 'reports are made on Form FDA 3486');

function bpdr(): LifecycleDocumentType {
  const ids = US_BLA_REPORT_SOURCE_IDS.bpdr;
  return {
    id: ids.id, registryId: ids.registryId, label: 'Biological Product Deviation Report (BPDR)', category: 'safety', family: 'BLA', agency: 'FDA',
    description: 'The report a license holder that had control of a distributed biological product makes of an event in manufacturing, testing, processing, packing, labeling, storage, holding or distribution that is a deviation from cGMP, applicable regulations or standards or established specifications, or an unexpected or unforeseeable event, that may affect the product\'s safety, purity or potency (21 CFR 600.14). Blood and blood components report under 21 CFR 606.171 instead.',
    regulatoryBasis: [
      BPDR_600_14, BPDR_FORM,
      guidance('Biological Product Deviation Reporting for Licensed Manufacturers of Biological Products Other than Blood and Blood Components', 'October 2006'),
    ],
    timing: `As soon as possible, and no later than 45 calendar days from the date the manufacturer acquires information reasonably suggesting a reportable event has occurred (${cfr('600.14(c)', 'when to report')}).`,
    components: [
      part({
        code: 'bpdr.reportability', title: 'Reportability Assessment', contentType: 'narrative', basis: cfr('600.14(a)-(b)', 'who reports and what is reportable'),
        authoring: 'Record why the event is or is not reportable: whether it is a deviation or an unexpected or unforeseeable event, whether it may affect safety, purity or potency, whether it occurred in the license holder\'s or a contracted facility, and whether the product was distributed. The date information first reasonably suggested a reportable event starts the reporting clock. Quality approves this assessment.',
        elements: ['Event and date of discovery', 'Deviation versus unexpected or unforeseeable event', 'Potential effect on safety, purity or potency', 'Facility (own or under contract)', 'Whether the product was distributed', 'Date information reasonably suggested a reportable event', 'Reportability conclusion'],
        prompt: 'Draft the 21 CFR 600.14 reportability assessment for the deviation record on {{PRODUCT_NAME}}: deviation or unexpected event, potential effect on safety, purity or potency, facility, distribution status, and the clock-start date, from the deviation and distribution records. Do not state a fact or date the records do not contain.',
      }),
      part({
        code: 'bpdr.3486', title: 'Form FDA 3486', contentType: 'form', basis: BPDR_FORM,
        authoring: 'Complete the official Form FDA 3486 from the deviation record, through the forms registry and its original-asset review gate.',
        elements: ['Completed Form FDA 3486 from the deviation record'], prompt: '',
      }),
      part({
        code: 'bpdr.description', title: 'Event Description, Investigation and Corrective Action', contentType: 'narrative', basis: BPDR_600_14,
        authoring: 'Describe what happened, how it was discovered, the investigation and its conclusion, the products and lots affected, and the corrective and preventive action, for transcription onto the form by the preparer.',
        elements: ['What happened and how it was discovered', 'Investigation and conclusion', 'Products and lots affected', 'Corrective and preventive action'],
        prompt: 'Draft the event description, investigation summary and corrective action for the biological product deviation on {{PRODUCT_NAME}} from the deviation and CAPA records, for entry on Form FDA 3486. Do not state a cause or outcome the records do not contain.',
      }),
      part({
        code: 'bpdr.lots', title: 'Affected Lots and Distribution', contentType: 'data', basis: BPDR_600_14,
        authoring: 'List the affected lots and their distribution.',
        elements: ['Lot numbers', 'Quantities distributed', 'Distribution dates and consignees as recorded'], prompt: '',
      }),
    ],
  };
}

const PAE_600_80 = cfr('600.80(c)(2)', 'periodic adverse experience reports for licensed biological products');

function blaPaeReport(): LifecycleDocumentType {
  const ids = US_BLA_REPORT_SOURCE_IDS.pae;
  return {
    id: ids.id, registryId: ids.registryId, label: 'BLA Periodic Adverse Experience Report', category: 'safety', family: 'BLA', agency: 'FDA',
    description: 'The periodic report for a licensed biologic of each adverse experience not reported as a 15-day Alert report, with a narrative summary and analysis and a history of actions taken (21 CFR 600.80(c)(2)). FDA may accept an ICH E2C(R2) PBRER in its place under a waiver. ICSRs are submitted electronically.',
    regulatoryBasis: [
      PAE_600_80, cfr('600.80(h)', 'electronic format for postmarketing safety reports'), cfr('600.90', 'waivers'),
      guidance('Providing Postmarketing Periodic Safety Reports in the ICH E2C(R2) Format (Periodic Benefit-Risk Evaluation Report)', 'November 2016'),
    ],
    timing: `Quarterly for 3 years from the date of issuance of the biologics license, each within 30 days of the close of the quarter, then annually within 60 days of the anniversary date of the license (${PAE_600_80}).`,
    components: [
      part({
        code: 'pae.summary', title: 'Narrative Summary and Analysis, Including 15-Day Alert Reports', contentType: 'narrative', basis: PAE_600_80,
        authoring: 'Summarize and analyze the information in the report, and analyze the 15-day Alert reports submitted during the interval, referencing each by patient identification code, adverse reaction term(s) and date of submission to FDA.',
        elements: ['Reporting interval', 'Summary and analysis of the adverse experiences reported', 'Analysis of the 15-day Alert reports, each referenced by patient code, term and submission date', 'New safety signals or changes in frequency or severity'],
        prompt: 'Draft the 21 CFR 600.80(c)(2) narrative summary and analysis for {{SPONSOR}}\'s {{PRODUCT_NAME}} for the reporting interval, including the analysis of the 15-day Alert reports, from the safety database outputs. Do not state a case count, term or signal the outputs do not contain.',
      }),
      part({
        code: 'pae.icsrs', title: 'Individual Case Safety Reports Not Previously Submitted', contentType: 'data', basis: `${PAE_600_80}; ${cfr('600.80(h)', 'electronic format')}`,
        authoring: 'Submit an ICSR for each adverse experience not reported as a 15-day Alert report, electronically from the safety database.',
        elements: ['ICSR per adverse experience not reported as a 15-day Alert report under 600.80(c)(1)(i)', 'Electronic transmission record'], prompt: '',
      }),
      part({
        code: 'pae.actions', title: 'History of Actions Taken Since the Last Report', contentType: 'narrative', basis: PAE_600_80,
        authoring: 'State the actions taken since the last report because of adverse experiences, for example labeling changes or studies initiated.',
        elements: ['Labeling changes made or proposed', 'Studies initiated', 'Other risk-minimization actions'],
        prompt: 'Draft the history of actions taken since the last periodic report on {{PRODUCT_NAME}} because of adverse experiences, from the labeling and safety action records. Do not state an action the records do not contain.',
      }),
    ],
  };
}

/** The six BLA report lifecycle records, in contract order. */
export function buildUsBlaReportSources(): LifecycleDocumentType[] {
  return [blaAnnualReport(), blaPediatricAnnualReport(), blaPmrStatusReport(), blaDistributionReport(), bpdr(), blaPaeReport()];
}

/** The same records as a value, for appending into LIFECYCLE_DOCUMENT_TYPES. */
export const US_BLA_REPORT_SOURCES: readonly LifecycleDocumentType[] = Object.freeze(buildUsBlaReportSources());
