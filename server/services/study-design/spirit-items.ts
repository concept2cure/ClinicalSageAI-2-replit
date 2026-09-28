/**
 * SPIRIT 2013 item catalogue — the 33-item checklist as data.
 *
 * SPIRIT 2013 (Standard Protocol Items: Recommendations for Interventional
 * Trials; Chan et al., Ann Intern Med 2013 / BMJ 2013) is the protocol-content
 * standard that journals, funders and many ethics committees expect a trial
 * protocol to satisfy. Its checklist has 33 numbered items; several carry
 * lettered sub-items (2a/2b, 5a–5d, 11a–11d, 16a–16c, 17a/17b, 18a/18b,
 * 20a–20c, 21a/21b, 26a/26b, 31a–31c), giving 51 assessable rows. This module
 * carries those rows in checklist order, each with the SPIRIT section it sits
 * under, a faithful paraphrase of its wording, and which evidence source in this
 * platform can answer it.
 *
 * Honesty contract for the catalogue itself:
 *  - `description` is a paraphrase, never the verbatim published text. Where the
 *    paraphrase is written from a less certain recollection of the published
 *    wording it carries `paraphrased: true`; confirm those against the
 *    published checklist (EQUATOR network) before quoting them to a reviewer.
 *  - No item is invented. The item codes are the real SPIRIT 2013 numbering.
 *  - `evidencedBy` is a statement about THIS platform's structured
 *    {@link StudyDesign} object, not about SPIRIT: `design` means the design
 *    object carries the fields that answer the item; `protocol_document` means
 *    only an authored protocol section can; `either` means the design carries
 *    a partial signal that a document section may complete.
 *
 * The conformance engine that consumes this catalogue is
 * `./spirit-conformance`. This file is data only.
 *
 * @module server/services/study-design/spirit-items
 */

/** The eight SPIRIT 2013 checklist sections, in checklist order. */
export type SpiritSection =
  | 'Administrative information'
  | 'Introduction'
  | 'Methods: Participants, interventions, and outcomes'
  | 'Methods: Assignment of interventions'
  | 'Methods: Data collection, management, and analysis'
  | 'Methods: Monitoring'
  | 'Ethics and dissemination'
  | 'Appendices';

/** Which source in this platform can evidence an item. See the module header. */
export type SpiritEvidenceSource = 'design' | 'protocol_document' | 'either';

export interface SpiritItem {
  /** SPIRIT 2013 item code, e.g. '2a'. Unique across the catalogue. */
  item: string;
  /** The numbered item this row belongs to (1–33). Lettered sub-items share a number. */
  number: number;
  section: SpiritSection;
  title: string;
  /** The checklist wording, paraphrased faithfully. */
  description: string;
  evidencedBy: SpiritEvidenceSource;
  /** True when the paraphrase is written from a less certain recollection of the published wording. */
  paraphrased?: true;
}

/** Number of numbered SPIRIT 2013 items. Lettered sub-items do not add to this. */
export const SPIRIT_2013_NUMBERED_ITEM_COUNT = 33;

const ADMIN: SpiritSection = 'Administrative information';
const INTRO: SpiritSection = 'Introduction';
const PIO: SpiritSection = 'Methods: Participants, interventions, and outcomes';
const ASSIGN: SpiritSection = 'Methods: Assignment of interventions';
const DATA: SpiritSection = 'Methods: Data collection, management, and analysis';
const MONITOR: SpiritSection = 'Methods: Monitoring';
const ETHICS: SpiritSection = 'Ethics and dissemination';
const APPX: SpiritSection = 'Appendices';

/** The SPIRIT 2013 checklist rows, in checklist order. Frozen: this is reference data. */
export const SPIRIT_2013_ITEMS: readonly SpiritItem[] = Object.freeze([
  // ─── Administrative information ───────────────────────────────────────────
  { item: '1', number: 1, section: ADMIN, title: 'Title', evidencedBy: 'design',
    description: 'Descriptive title identifying the study design, population, interventions and, if applicable, trial acronym.' },
  { item: '2a', number: 2, section: ADMIN, title: 'Trial registration: identifier', evidencedBy: 'protocol_document',
    description: 'Trial identifier and registry name; if not yet registered, the name of the intended registry.' },
  { item: '2b', number: 2, section: ADMIN, title: 'Trial registration: data set', evidencedBy: 'protocol_document',
    description: 'All items from the World Health Organization Trial Registration Data Set.' },
  { item: '3', number: 3, section: ADMIN, title: 'Protocol version', evidencedBy: 'either',
    description: 'Date and version identifier of the protocol.' },
  { item: '4', number: 4, section: ADMIN, title: 'Funding', evidencedBy: 'protocol_document',
    description: 'Sources and types of financial, material and other support.' },
  { item: '5a', number: 5, section: ADMIN, title: 'Roles and responsibilities: contributors', evidencedBy: 'protocol_document',
    description: 'Names, affiliations and roles of protocol contributors.' },
  { item: '5b', number: 5, section: ADMIN, title: 'Roles and responsibilities: sponsor contact', evidencedBy: 'protocol_document',
    description: 'Name and contact information for the trial sponsor.' },
  { item: '5c', number: 5, section: ADMIN, title: 'Roles and responsibilities: sponsor and funder role', evidencedBy: 'protocol_document',
    description: 'Role of the study sponsor and funders, if any, in study design; collection, management, analysis and interpretation of data; writing of the report; and the decision to submit for publication, including whether they have ultimate authority over any of these activities.' },
  { item: '5d', number: 5, section: ADMIN, title: 'Roles and responsibilities: committees', evidencedBy: 'protocol_document', paraphrased: true,
    description: 'Composition, roles and responsibilities of the coordinating centre, steering committee, endpoint adjudication committee, data management team and other individuals or groups overseeing the trial, if applicable (the data monitoring committee is item 21a).' },
  // ─── Introduction ─────────────────────────────────────────────────────────
  { item: '6a', number: 6, section: INTRO, title: 'Background and rationale', evidencedBy: 'protocol_document',
    description: 'Description of the research question and justification for undertaking the trial, including a summary of relevant studies (published and unpublished) examining benefits and harms for each intervention.' },
  { item: '6b', number: 6, section: INTRO, title: 'Choice of comparators', evidencedBy: 'design',
    description: 'Explanation for the choice of comparators.' },
  { item: '7', number: 7, section: INTRO, title: 'Objectives', evidencedBy: 'design',
    description: 'Specific objectives or hypotheses.' },
  { item: '8', number: 8, section: INTRO, title: 'Trial design', evidencedBy: 'design',
    description: 'Description of the trial design including type of trial (e.g. parallel group, crossover, factorial, single group), allocation ratio and framework (e.g. superiority, equivalence, non-inferiority, exploratory).' },
  // ─── Methods: Participants, interventions, and outcomes ───────────────────
  { item: '9', number: 9, section: PIO, title: 'Study setting', evidencedBy: 'either', paraphrased: true,
    description: 'Description of study settings (e.g. community clinic, academic hospital) and list of countries where data will be collected, with a reference to where the list of study sites can be obtained.' },
  { item: '10', number: 10, section: PIO, title: 'Eligibility criteria', evidencedBy: 'design',
    description: 'Inclusion and exclusion criteria for participants and, if applicable, eligibility criteria for study centres and the individuals who will perform the interventions.' },
  { item: '11a', number: 11, section: PIO, title: 'Interventions: description', evidencedBy: 'design',
    description: 'Interventions for each group with sufficient detail to allow replication, including how and when they will be administered.' },
  { item: '11b', number: 11, section: PIO, title: 'Interventions: discontinuation and modification', evidencedBy: 'either',
    description: 'Criteria for discontinuing or modifying allocated interventions for a given trial participant (e.g. dose change in response to harms, participant request, or improving/worsening disease).' },
  { item: '11c', number: 11, section: PIO, title: 'Interventions: adherence', evidencedBy: 'protocol_document',
    description: 'Strategies to improve adherence to intervention protocols, and any procedures for monitoring adherence (e.g. drug tablet return, laboratory tests).' },
  { item: '11d', number: 11, section: PIO, title: 'Interventions: concomitant care', evidencedBy: 'protocol_document',
    description: 'Relevant concomitant care and interventions that are permitted or prohibited during the trial.' },
  { item: '12', number: 12, section: PIO, title: 'Outcomes', evidencedBy: 'design',
    description: 'Primary, secondary and other outcomes, including the specific measurement variable, analysis metric (e.g. change from baseline, final value, time to event), method of aggregation (e.g. median, proportion) and time point for each outcome. Explanation of the clinical relevance of the chosen efficacy and harm outcomes is strongly recommended.' },
  { item: '13', number: 13, section: PIO, title: 'Participant timeline', evidencedBy: 'design',
    description: 'Time schedule of enrolment, interventions (including any run-ins and washouts), assessments and visits for participants. A schematic diagram is highly recommended.' },
  { item: '14', number: 14, section: PIO, title: 'Sample size', evidencedBy: 'design',
    description: 'Estimated number of participants needed to achieve the study objectives and how it was determined, including the clinical and statistical assumptions supporting any sample size calculation.' },
  { item: '15', number: 15, section: PIO, title: 'Recruitment', evidencedBy: 'protocol_document',
    description: 'Strategies for achieving adequate participant enrolment to reach the target sample size.' },
  // ─── Methods: Assignment of interventions (for controlled trials) ─────────
  { item: '16a', number: 16, section: ASSIGN, title: 'Allocation: sequence generation', evidencedBy: 'design',
    description: 'Method of generating the allocation sequence (e.g. computer-generated random numbers) and list of any factors for stratification. To reduce predictability, details of any planned restriction (e.g. blocking) should be provided in a separate document unavailable to those who enrol participants or assign interventions.' },
  { item: '16b', number: 16, section: ASSIGN, title: 'Allocation: concealment mechanism', evidencedBy: 'protocol_document',
    description: 'Mechanism of implementing the allocation sequence (e.g. central telephone; sequentially numbered, opaque, sealed envelopes), describing any steps to conceal the sequence until interventions are assigned.' },
  { item: '16c', number: 16, section: ASSIGN, title: 'Allocation: implementation', evidencedBy: 'protocol_document',
    description: 'Who will generate the allocation sequence, who will enrol participants, and who will assign participants to interventions.' },
  { item: '17a', number: 17, section: ASSIGN, title: 'Blinding (masking)', evidencedBy: 'either',
    description: 'Who will be blinded after assignment to interventions (e.g. trial participants, care providers, outcome assessors, data analysts), and how.' },
  { item: '17b', number: 17, section: ASSIGN, title: 'Blinding: emergency unblinding', evidencedBy: 'either',
    description: 'If blinded, the circumstances under which unblinding is permissible and the procedure for revealing a participant\'s allocated intervention during the trial.' },
  // ─── Methods: Data collection, management, and analysis ───────────────────
  { item: '18a', number: 18, section: DATA, title: 'Data collection methods', evidencedBy: 'either', paraphrased: true,
    description: 'Plans for assessment and collection of outcome, baseline and other trial data, including processes to promote data quality (e.g. duplicate measurements, training of assessors) and a description of study instruments (e.g. questionnaires, laboratory tests) with their reliability and validity if known; reference to where data collection forms can be found if not in the protocol.' },
  { item: '18b', number: 18, section: DATA, title: 'Data collection: retention', evidencedBy: 'protocol_document',
    description: 'Plans to promote participant retention and complete follow-up, including a list of any outcome data to be collected for participants who discontinue or deviate from intervention protocols.' },
  { item: '19', number: 19, section: DATA, title: 'Data management', evidencedBy: 'protocol_document',
    description: 'Plans for data entry, coding, security and storage, including processes to promote data quality (e.g. double data entry, range checks); reference to where data management procedures can be found if not in the protocol.' },
  { item: '20a', number: 20, section: DATA, title: 'Statistical methods: outcomes', evidencedBy: 'design',
    description: 'Statistical methods for analysing primary and secondary outcomes; reference to where other details of the statistical analysis plan can be found if not in the protocol.' },
  { item: '20b', number: 20, section: DATA, title: 'Statistical methods: additional analyses', evidencedBy: 'either',
    description: 'Methods for any additional analyses (e.g. subgroup and adjusted analyses).' },
  { item: '20c', number: 20, section: DATA, title: 'Statistical methods: analysis population and missing data', evidencedBy: 'design',
    description: 'Definition of the analysis population relating to protocol non-adherence (e.g. as-randomised analysis), and any statistical methods to handle missing data (e.g. multiple imputation).' },
  // ─── Methods: Monitoring ──────────────────────────────────────────────────
  { item: '21a', number: 21, section: MONITOR, title: 'Data monitoring: committee', evidencedBy: 'design',
    description: 'Composition of the data monitoring committee (DMC); summary of its role and reporting structure; statement of whether it is independent from the sponsor and competing interests; reference to where further details of its charter can be found if not in the protocol. Alternatively, an explanation of why a DMC is not needed.' },
  { item: '21b', number: 21, section: MONITOR, title: 'Data monitoring: interim analyses and stopping', evidencedBy: 'design',
    description: 'Description of any interim analyses and stopping guidelines, including who will have access to the interim results and make the final decision to terminate the trial.' },
  { item: '22', number: 22, section: MONITOR, title: 'Harms', evidencedBy: 'design',
    description: 'Plans for collecting, assessing, reporting and managing solicited and spontaneously reported adverse events and other unintended effects of trial interventions or trial conduct.' },
  { item: '23', number: 23, section: MONITOR, title: 'Auditing', evidencedBy: 'protocol_document',
    description: 'Frequency and procedures for auditing trial conduct, if any, and whether the process will be independent from investigators and the sponsor.' },
  // ─── Ethics and dissemination ─────────────────────────────────────────────
  { item: '24', number: 24, section: ETHICS, title: 'Research ethics approval', evidencedBy: 'protocol_document',
    description: 'Plans for seeking research ethics committee / institutional review board (REC/IRB) approval.' },
  { item: '25', number: 25, section: ETHICS, title: 'Protocol amendments', evidencedBy: 'protocol_document',
    description: 'Plans for communicating important protocol modifications (e.g. changes to eligibility criteria, outcomes, analyses) to relevant parties (e.g. investigators, REC/IRBs, trial participants, trial registries, journals, regulators).' },
  { item: '26a', number: 26, section: ETHICS, title: 'Consent or assent', evidencedBy: 'protocol_document',
    description: 'Who will obtain informed consent or assent from potential trial participants or authorised surrogates, and how (see item 32).' },
  { item: '26b', number: 26, section: ETHICS, title: 'Consent: ancillary studies', evidencedBy: 'protocol_document', paraphrased: true,
    description: 'Additional consent provisions for collection and use of participant data and biological specimens in ancillary studies, if applicable.' },
  { item: '27', number: 27, section: ETHICS, title: 'Confidentiality', evidencedBy: 'protocol_document',
    description: 'How personal information about potential and enrolled participants will be collected, shared and maintained in order to protect confidentiality before, during and after the trial.' },
  { item: '28', number: 28, section: ETHICS, title: 'Declaration of interests', evidencedBy: 'protocol_document',
    description: 'Financial and other competing interests for principal investigators for the overall trial and each study site.' },
  { item: '29', number: 29, section: ETHICS, title: 'Access to data', evidencedBy: 'protocol_document',
    description: 'Statement of who will have access to the final trial dataset, and disclosure of contractual agreements that limit such access for investigators.' },
  { item: '30', number: 30, section: ETHICS, title: 'Ancillary and post-trial care', evidencedBy: 'protocol_document', paraphrased: true,
    description: 'Provisions, if any, for ancillary and post-trial care, and for compensation to those who suffer harm from trial participation.' },
  { item: '31a', number: 31, section: ETHICS, title: 'Dissemination policy: trial results', evidencedBy: 'protocol_document',
    description: 'Plans for investigators and sponsor to communicate trial results to participants, healthcare professionals, the public and other relevant groups (e.g. via publication, reporting in results databases, or other data sharing arrangements), including any publication restrictions.' },
  { item: '31b', number: 31, section: ETHICS, title: 'Dissemination policy: authorship', evidencedBy: 'protocol_document',
    description: 'Authorship eligibility guidelines and any intended use of professional writers.' },
  { item: '31c', number: 31, section: ETHICS, title: 'Dissemination policy: public access', evidencedBy: 'protocol_document',
    description: 'Plans, if any, for granting public access to the full protocol, participant-level dataset and statistical code.' },
  // ─── Appendices ───────────────────────────────────────────────────────────
  { item: '32', number: 32, section: APPX, title: 'Informed consent materials', evidencedBy: 'protocol_document',
    description: 'Model consent form and other related documentation given to participants and authorised surrogates.' },
  { item: '33', number: 33, section: APPX, title: 'Biological specimens', evidencedBy: 'protocol_document', paraphrased: true,
    description: 'Plans for collection, laboratory evaluation and storage of biological specimens for genetic or molecular analysis in the current trial and for future use in ancillary studies, if applicable.' },
] as SpiritItem[]);

// ─── Where a protocol document evidences an item ─────────────────────────────

/**
 * How the conformance engine locates a SPIRIT item in an authored protocol
 * document (`protocol_sections` rows). Keys are normalised section keys
 * (lower-case, spaces and hyphens → underscores); title terms are lower-case
 * fragments of a section title. A `keys`/`titleTerms` match addresses the item
 * directly; an `umbrellaKeys` match is a broader section that MAY cover it and
 * can only ever score partial. Only items an authored document can evidence
 * (`evidencedBy` of `protocol_document` or `either`) have an entry.
 */
export interface SpiritDocumentTopic {
  label: string;
  /** Normalised section keys that address the item directly. */
  keys: string[];
  /** Lower-case fragments of a section title that address the item directly. */
  titleTerms: string[];
  /** Broader sections that MAY cover the item; a match here is at most partial. */
  umbrellaKeys?: string[];
}

export const SPIRIT_DOCUMENT_TOPICS: Readonly<Record<string, SpiritDocumentTopic>> = Object.freeze({
  '2a': { label: 'trial registration', keys: ['registration', 'trial_registration'], titleTerms: ['registration', 'registry'], umbrellaKeys: ['synopsis', 'administrative'] },
  '2b': { label: 'the WHO trial registration data set', keys: ['who_trds', 'trial_registration_data_set', 'registration_data_set'], titleTerms: ['registration data set', 'who trds'], umbrellaKeys: ['registration', 'trial_registration'] },
  '3': { label: 'protocol version and date', keys: ['version', 'protocol_version', 'revision_history', 'document_history'], titleTerms: ['version', 'revision history', 'document history'], umbrellaKeys: ['synopsis', 'administrative', 'title_page'] },
  '4': { label: 'funding', keys: ['funding', 'funding_sources'], titleTerms: ['funding', 'financial support'], umbrellaKeys: ['administrative', 'sponsor'] },
  '5a': { label: 'protocol contributors', keys: ['contributors', 'protocol_contributors', 'roles_and_responsibilities', 'investigators'], titleTerms: ['contributor', 'roles and responsibilities', 'investigator'], umbrellaKeys: ['administrative'] },
  '5b': { label: 'the sponsor contact', keys: ['sponsor', 'sponsor_contact'], titleTerms: ['sponsor'], umbrellaKeys: ['administrative', 'contributors'] },
  '5c': { label: 'the role of the sponsor and funders', keys: ['sponsor_role', 'role_of_sponsor', 'funder_role'], titleTerms: ['role of the sponsor', 'role of sponsor', 'sponsor role', 'role of funder'], umbrellaKeys: ['sponsor', 'funding', 'administrative'] },
  '5d': { label: 'trial committees and oversight groups', keys: ['committees', 'steering_committee', 'trial_organisation', 'trial_organization', 'oversight'], titleTerms: ['steering committee', 'committee', 'oversight', 'coordinating cent'], umbrellaKeys: ['administrative'] },
  '6a': { label: 'background and rationale', keys: ['background', 'rationale', 'introduction'], titleTerms: ['background', 'rationale', 'introduction'] },
  '9': { label: 'the study setting', keys: ['setting', 'study_setting', 'sites', 'study_sites'], titleTerms: ['study setting', 'setting', 'study sites', 'centres', 'centers'], umbrellaKeys: ['design'] },
  '11b': { label: 'intervention discontinuation and modification', keys: ['discontinuation', 'withdrawal', 'dose_modification'], titleTerms: ['discontinuation', 'withdrawal', 'dose modification'], umbrellaKeys: ['intervention'] },
  '11c': { label: 'adherence', keys: ['adherence', 'compliance'], titleTerms: ['adherence', 'compliance'], umbrellaKeys: ['intervention'] },
  '11d': { label: 'concomitant care', keys: ['concomitant', 'concomitant_medications', 'prohibited_medications'], titleTerms: ['concomitant', 'prohibited'], umbrellaKeys: ['intervention'] },
  '15': { label: 'recruitment', keys: ['recruitment', 'enrolment', 'enrollment'], titleTerms: ['recruitment', 'enrolment', 'enrollment'], umbrellaKeys: ['population'] },
  '16b': { label: 'allocation concealment', keys: ['allocation_concealment', 'concealment'], titleTerms: ['concealment'], umbrellaKeys: ['design', 'randomization', 'randomisation', 'allocation'] },
  '16c': { label: 'allocation implementation', keys: ['allocation_implementation', 'randomization_implementation', 'randomisation_implementation'], titleTerms: ['implementation'], umbrellaKeys: ['design', 'randomization', 'randomisation', 'allocation'] },
  '17a': { label: 'blinding', keys: ['blinding', 'masking'], titleTerms: ['blinding', 'masking', 'blind'], umbrellaKeys: ['design'] },
  '17b': { label: 'emergency unblinding', keys: ['unblinding', 'emergency_unblinding'], titleTerms: ['unblinding'], umbrellaKeys: ['blinding', 'masking'] },
  '18a': { label: 'data collection methods', keys: ['data_collection', 'crf', 'case_report_forms'], titleTerms: ['data collection', 'case report form'], umbrellaKeys: ['assessments', 'data_management'] },
  '18b': { label: 'participant retention', keys: ['retention', 'participant_retention', 'follow_up'], titleTerms: ['retention', 'follow-up'], umbrellaKeys: ['discontinuation'] },
  '19': { label: 'data management', keys: ['data_management'], titleTerms: ['data management'] },
  '20b': { label: 'additional (subgroup, adjusted, sensitivity) analyses', keys: ['subgroup_analyses', 'additional_analyses', 'sensitivity_analyses'], titleTerms: ['subgroup', 'additional analyses', 'sensitivity analyses'], umbrellaKeys: ['statistics'] },
  '23': { label: 'auditing', keys: ['auditing', 'audit'], titleTerms: ['audit'], umbrellaKeys: ['data_management', 'monitoring'] },
  '24': { label: 'research ethics approval', keys: ['ethics_approval', 'irb_approval', 'research_ethics'], titleTerms: ['ethics approval', 'irb', 'ethics committee'], umbrellaKeys: ['ethics'] },
  '25': { label: 'protocol amendments', keys: ['amendments', 'protocol_amendments'], titleTerms: ['amendment'], umbrellaKeys: ['ethics'] },
  '26a': { label: 'informed consent', keys: ['consent', 'informed_consent'], titleTerms: ['consent'], umbrellaKeys: ['ethics'] },
  '26b': { label: 'consent for ancillary studies', keys: ['ancillary_consent', 'specimen_consent'], titleTerms: ['ancillary', 'future use'], umbrellaKeys: ['ethics', 'consent'] },
  '27': { label: 'confidentiality', keys: ['confidentiality', 'privacy'], titleTerms: ['confidentiality', 'privacy'], umbrellaKeys: ['ethics', 'data_management'] },
  '28': { label: 'declaration of interests', keys: ['conflicts_of_interest', 'declaration_of_interests', 'coi'], titleTerms: ['conflict of interest', 'conflicts of interest', 'declaration of interest', 'competing interest'], umbrellaKeys: ['ethics'] },
  '29': { label: 'access to data', keys: ['data_access', 'access_to_data'], titleTerms: ['access to data', 'data access'], umbrellaKeys: ['data_management'] },
  '30': { label: 'ancillary and post-trial care', keys: ['post_trial_care', 'ancillary_care', 'compensation'], titleTerms: ['post-trial', 'post trial', 'ancillary care', 'compensation'], umbrellaKeys: ['ethics'] },
  '31a': { label: 'dissemination of results', keys: ['dissemination', 'publication', 'publication_policy'], titleTerms: ['dissemination', 'publication'] },
  '31b': { label: 'authorship', keys: ['authorship'], titleTerms: ['authorship'], umbrellaKeys: ['dissemination', 'publication', 'publication_policy'] },
  '31c': { label: 'public access to the protocol, data and code', keys: ['data_sharing', 'public_access'], titleTerms: ['data sharing', 'public access'], umbrellaKeys: ['dissemination', 'publication', 'publication_policy'] },
  '32': { label: 'informed consent materials', keys: ['consent_form', 'informed_consent_form', 'icf'], titleTerms: ['consent form', 'icf'], umbrellaKeys: ['appendices', 'appendix'] },
  '33': { label: 'biological specimens', keys: ['specimens', 'biological_specimens', 'biospecimens', 'biobanking'], titleTerms: ['specimen', 'biobank'], umbrellaKeys: ['appendices', 'appendix'] },
});
