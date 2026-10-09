/**
 * SPIRIT 2013 item catalogue — the 33-item checklist as data, the map from each
 * item to the protocol sections that can evidence it, and the whole-word
 * section matcher that reads that map.
 *
 * SPIRIT 2013 (Standard Protocol Items: Recommendations for Interventional
 * Trials; Chan et al., Ann Intern Med 2013;158:200-207) was the protocol-content
 * guideline for randomised-trial protocols until the SPIRIT 2025 statement
 * (Chan et al., 2025; BMJ 2025;389:e081477; Nat Med 2025;31:1784-1792)
 * superseded it with 34 minimum items, a new open-science section and a
 * patient and public involvement item. Journals now reference SPIRIT 2025.
 * THIS CATALOGUE IS THE 2013 CHECKLIST ONLY; it is not the 2025 checklist and
 * conformance to it is not conformance to SPIRIT 2025.
 *
 * The 2013 checklist has 33 numbered items; eleven carry lettered sub-items
 * (2a/2b, 5a–5d, 6a/6b, 11a–11d, 16a–16c, 17a/17b, 18a/18b, 20a–20c, 21a/21b,
 * 26a/26b, 31a–31c), giving 51 assessable rows. This module carries those rows
 * in checklist order, each with the SPIRIT section it sits under, a faithful
 * paraphrase of its wording, and which evidence source in this platform can
 * answer it.
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
 *    a partial signal that a document section may complete. An item whose
 *    SPIRIT wording asks for something the design object has no field for
 *    (e.g. who decides termination, 21b) is `either`, never `design`: a
 *    design-only item can never be completed by an authored section, so it
 *    must be one the design can answer in full.
 *
 * Honesty contract for the section matcher ({@link sectionsForTopic}):
 *  - Title terms match WHOLE WORDS of the normalised title, never substrings:
 *    "Dose Conversion Table" does not contain the word "version", and
 *    "Emergency Unblinding" does not contain the word "blinding".
 *  - A term that is too generic alone is written as an all-of group
 *    (`['consent', 'ancillary']`) and `titleExcludes` voids a title match that
 *    names a neighbouring topic ("Patient Registration" is not trial
 *    registration; "Audit Trail" is not auditing; "Data Monitoring Committee"
 *    is 21a, not 5d).
 *  - A section whose key is an umbrella key is umbrella even when its title
 *    names the topic: the canonical "ethics" section titled "Ethics, Consent &
 *    Regulatory" MAY cover consent, it is not a consent section.
 *
 * The conformance engine that consumes this catalogue is
 * `./spirit-conformance`, which re-exports everything here. This file holds
 * the catalogue, the topic map, the pure matcher that reads it, and the input
 * and result shapes; no judging happens here.
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
  { item: '1', number: 1, section: ADMIN, title: 'Title', evidencedBy: 'either',
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
  { item: '12', number: 12, section: PIO, title: 'Outcomes', evidencedBy: 'either',
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
  { item: '21a', number: 21, section: MONITOR, title: 'Data monitoring: committee', evidencedBy: 'either',
    description: 'Composition of the data monitoring committee (DMC); summary of its role and reporting structure; statement of whether it is independent from the sponsor and competing interests; reference to where further details of its charter can be found if not in the protocol. Alternatively, an explanation of why a DMC is not needed.' },
  { item: '21b', number: 21, section: MONITOR, title: 'Data monitoring: interim analyses and stopping', evidencedBy: 'either',
    description: 'Description of any interim analyses and stopping guidelines, including who will have access to the interim results and make the final decision to terminate the trial.' },
  { item: '22', number: 22, section: MONITOR, title: 'Harms', evidencedBy: 'either',
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

/** One authored protocol section; mirrors a `protocol_sections` row. */
export interface SpiritProtocolSection {
  sectionKey: string;
  title: string;
  content: string | null;
  /** `protocol_sections` vocabulary is not_started | draft | complete; only `complete` can meet an item. */
  status: string;
}

export interface SpiritProtocolDocument {
  sections: SpiritProtocolSection[];
}

// ─── The shapes the conformance engine returns (re-exported by it) ───────────

export type SpiritItemStatus = 'met' | 'partial' | 'missing' | 'not_assessable';

/** Why an item was not assessed: no document was passed, or the design records the item as inapplicable. */
export type SpiritNotAssessableReason = 'no_document' | 'not_applicable';

export interface SpiritItemResult {
  item: string;
  number: number;
  section: SpiritSection;
  title: string;
  evidencedBy: SpiritEvidenceSource;
  status: SpiritItemStatus;
  /** Provenance lines, each prefixed `design:`, `document:` or `note:`. */
  evidence: string[];
  /** What is absent, present whenever status is not `met`. */
  gap?: string;
  notAssessableReason?: SpiritNotAssessableReason;
}

export interface SpiritConformance {
  items: SpiritItemResult[];
  summary: { met: number; partial: number; missing: number; notAssessable: number; total: number };
  /** SPIRIT_BASIS: the 2013 checklist, with its supersession stated. */
  basis: string;
  /** The guideline that superseded SPIRIT 2013; a consumer must not present 2013 conformance as current. */
  supersededBy: string;
  /** Whether a protocol document was passed; without one every document-only item is not_assessable. */
  documentProvided: boolean;
}

/** A whole-word phrase, or an all-of group of phrases that must every one appear in the title. */
export type SpiritTitleTerm = string | readonly string[];

/**
 * How the conformance engine locates a SPIRIT item in an authored protocol
 * document (`protocol_sections` rows). Keys are normalised section keys
 * (lower-case, spaces and hyphens → underscores). Title terms are matched as
 * WHOLE WORDS of the normalised title (see {@link normaliseTitle}). A `keys`
 * or title match addresses the item directly; an `umbrellaKeys` match is a
 * broader section that MAY cover it and can only ever score partial. Only
 * items an authored document can evidence (`evidencedBy` of
 * `protocol_document` or `either`) have an entry.
 */
export interface SpiritDocumentTopic {
  label: string;
  /** Normalised section keys that address the item directly. */
  keys: readonly string[];
  /** Whole-word phrases (or all-of groups) of a section title that address the item directly. */
  titleTerms: readonly SpiritTitleTerm[];
  /** Whole-word phrases that void a title match because they name a neighbouring topic. */
  titleExcludes?: readonly string[];
  /** Broader sections that MAY cover the item; a match here is at most partial, whatever the title says. */
  umbrellaKeys?: readonly string[];
}

const RANDOMISATION_UMBRELLA = ['design', 'randomization', 'randomisation', 'allocation'];
const DMC_TERMS = ['data monitoring committee', 'data monitoring board', 'dmc', 'dsmb', 'idmc', 'data safety monitoring', 'data and safety monitoring', 'safety monitoring committee', 'safety monitoring board'];

/*
 * The key `safety` is SPECIFIC to item 22, not an umbrella: this platform's
 * own clinical template (protocol-development-logic.ts) keys its "Safety
 * Reporting & Pharmacovigilance" section `safety`, and that section is the
 * adverse-event collection and reporting plan SPIRIT 22 asks for.
 */
export const SPIRIT_DOCUMENT_TOPICS: Readonly<Record<string, SpiritDocumentTopic>> = Object.freeze({
  '1': { label: 'the protocol title', keys: ['title_page', 'title', 'protocol_title'], titleTerms: ['title page', 'protocol title', 'full title'], umbrellaKeys: ['synopsis'] },
  '2a': { label: 'trial registration', keys: ['trial_registration', 'study_registration', 'trial_registry'], titleTerms: ['trial registration', 'study registration', 'trial registry', 'registry name', 'registration number', 'registry identifier', 'trial identifier', 'trial identifiers', 'clinicaltrials gov'],
    titleExcludes: ['patient registration', 'participant registration', 'subject registration'], umbrellaKeys: ['synopsis', 'administrative'] },
  '2b': { label: 'the WHO trial registration data set', keys: ['who_trds', 'trial_registration_data_set', 'registration_data_set'], titleTerms: ['registration data set', 'who trds'], umbrellaKeys: ['trial_registration', 'study_registration'] },
  '3': { label: 'protocol version and date', keys: ['version', 'protocol_version', 'version_history', 'revision_history', 'document_history'], titleTerms: ['version', 'revision history', 'document history', 'protocol date'], umbrellaKeys: ['synopsis', 'administrative', 'title_page'] },
  '4': { label: 'funding', keys: ['funding', 'funding_sources'], titleTerms: ['funding', 'financial support', 'sources of support'], umbrellaKeys: ['administrative', 'sponsor'] },
  '5a': { label: 'protocol contributors', keys: ['contributors', 'protocol_contributors', 'roles_and_responsibilities'], titleTerms: ['contributor', 'contributors', 'protocol authors', 'roles and responsibilities'], umbrellaKeys: ['administrative'] },
  '5b': { label: 'the sponsor contact', keys: ['sponsor', 'sponsor_contact', 'sponsor_information'], titleTerms: ['sponsor'],
    titleExcludes: ['role', 'roles', 'responsibility', 'responsibilities', 'obligations', 'signature', 'signatures', 'approval'], umbrellaKeys: ['administrative', 'contributors'] },
  '5c': { label: 'the role of the sponsor and funders', keys: ['sponsor_role', 'role_of_sponsor', 'funder_role', 'role_of_funder'], titleTerms: [['role', 'sponsor'], ['role', 'funder'], ['role', 'funders'], ['role', 'funding']], umbrellaKeys: ['sponsor', 'funding', 'administrative'] },
  '5d': { label: 'trial committees and oversight groups', keys: ['committees', 'trial_committees', 'steering_committee', 'adjudication_committee', 'trial_organisation', 'trial_organization', 'study_organisation', 'study_organization'],
    titleTerms: ['committees', 'steering committee', 'adjudication committee', 'endpoint adjudication', 'coordinating centre', 'coordinating center', 'trial management group', 'trial organisation', 'trial organization', 'study organisation', 'study organization', 'study leadership'],
    titleExcludes: ['data monitoring', 'dmc', 'dsmb', 'idmc', 'data safety monitoring', 'data and safety monitoring', 'safety monitoring'], umbrellaKeys: ['administrative'] },
  '6a': { label: 'background and rationale', keys: ['background', 'rationale', 'introduction', 'study_rationale'], titleTerms: ['background', 'rationale', 'introduction'],
    titleExcludes: ['dose', 'dosing', 'background therapy', 'background treatment', 'background medication', 'background medications'] },
  '9': { label: 'the study setting', keys: ['setting', 'study_setting', 'sites', 'study_sites'], titleTerms: ['setting', 'settings', 'study sites', 'trial sites', 'participating sites', 'participating centres', 'participating centers', 'centres', 'centers'],
    titleExcludes: ['coordinating'], umbrellaKeys: ['design'] },
  '11b': { label: 'intervention discontinuation and modification', keys: ['discontinuation', 'withdrawal', 'dose_modification', 'dose_modifications'],
    titleTerms: ['discontinuation', 'withdrawal', 'dose modification', 'dose modifications', 'dose adjustment', 'dose adjustments', 'dose reduction', 'dose reductions', 'dose interruption'],
    titleExcludes: ['study discontinuation', 'trial discontinuation', 'closure'], umbrellaKeys: ['intervention'] },
  '11c': { label: 'adherence to the intervention', keys: ['adherence', 'treatment_adherence', 'intervention_adherence', 'treatment_compliance', 'intervention_compliance', 'drug_compliance'],
    titleTerms: ['adherence', ['compliance', 'treatment'], ['compliance', 'intervention'], ['compliance', 'drug'], ['compliance', 'medication'], ['compliance', 'dosing']],
    titleExcludes: ['protocol adherence', 'adherence to protocol', 'adherence to the protocol', 'gcp', 'good clinical practice', 'regulatory', 'statement of compliance'], umbrellaKeys: ['intervention'] },
  '11d': { label: 'concomitant care', keys: ['concomitant', 'concomitant_medications', 'concomitant_therapy', 'prohibited_medications'], titleTerms: ['concomitant', 'prohibited', 'permitted medications', 'permitted therapies', 'rescue medication', 'rescue medications'], umbrellaKeys: ['intervention'] },
  '12': { label: 'outcomes', keys: ['outcomes', 'endpoints', 'outcome_measures', 'study_endpoints'], titleTerms: ['outcomes', 'outcome', 'endpoints', 'endpoint', 'outcome measures'],
    titleExcludes: ['adjudication', 'committee', 'euthanasia', 'humane', 'pregnancy'], umbrellaKeys: ['objectives'] },
  '15': { label: 'recruitment', keys: ['recruitment', 'recruitment_strategy', 'accrual'], titleTerms: ['recruitment', 'accrual', 'enrolment strategy', 'enrollment strategy', 'enrolment strategies', 'enrollment strategies'], umbrellaKeys: ['population', 'enrolment', 'enrollment'] },
  '16b': { label: 'allocation concealment', keys: ['allocation_concealment', 'concealment'], titleTerms: ['concealment'], umbrellaKeys: RANDOMISATION_UMBRELLA },
  '16c': { label: 'allocation implementation', keys: ['allocation_implementation', 'randomization_implementation', 'randomisation_implementation'],
    titleTerms: [['implementation', 'allocation'], ['implementation', 'randomization'], ['implementation', 'randomisation'], ['implementation', 'sequence']], umbrellaKeys: RANDOMISATION_UMBRELLA },
  '17a': { label: 'blinding', keys: ['blinding', 'masking'], titleTerms: ['blinding', 'masking'], umbrellaKeys: ['design'] },
  '17b': { label: 'emergency unblinding', keys: ['unblinding', 'emergency_unblinding', 'code_break'], titleTerms: ['unblinding', 'code break', 'code breaking', 'breaking the blind'], umbrellaKeys: ['blinding', 'masking'] },
  '18a': { label: 'data collection methods', keys: ['data_collection', 'crf', 'case_report_forms'], titleTerms: ['data collection', 'case report form', 'case report forms', 'crf', 'crfs'], umbrellaKeys: ['assessments', 'data_management'] },
  '18b': { label: 'participant retention', keys: ['retention', 'participant_retention'], titleTerms: ['retention', 'loss to follow up', 'lost to follow up'],
    titleExcludes: ['record', 'records', 'data retention', 'specimen', 'specimens', 'sample', 'samples'], umbrellaKeys: ['discontinuation'] },
  '19': { label: 'data management', keys: ['data_management'], titleTerms: ['data management', 'data handling'] },
  '20b': { label: 'additional (subgroup, adjusted, sensitivity) analyses', keys: ['subgroup_analyses', 'additional_analyses', 'sensitivity_analyses', 'adjusted_analyses'],
    titleTerms: ['subgroup', 'subgroups', 'additional analyses', 'sensitivity analyses', 'sensitivity analysis', 'adjusted analyses', 'adjusted analysis', 'supplementary analyses'], umbrellaKeys: ['statistics'] },
  '21a': { label: 'the data monitoring committee', keys: ['dmc', 'dsmb', 'idmc', 'data_monitoring_committee', 'data_safety_monitoring_board'], titleTerms: DMC_TERMS, umbrellaKeys: ['safety', 'monitoring', 'data_monitoring', 'data_safety'] },
  '21b': { label: 'interim analyses and stopping guidelines', keys: ['interim_analysis', 'interim_analyses', 'stopping_rules', 'stopping_guidelines', 'early_stopping', 'halting_rules'],
    titleTerms: ['interim analysis', 'interim analyses', 'stopping rules', 'stopping guidelines', 'stopping boundaries', 'early stopping', 'halting rules', 'early termination'],
    titleExcludes: ['visit', 'participant', 'participants', 'individual', 'subject', 'subjects'], umbrellaKeys: ['statistics', 'safety', 'data_safety', 'dmc', 'dsmb', 'data_monitoring_committee'] },
  '22': { label: 'harms (adverse-event collection, assessment, reporting and management)', keys: ['safety', 'harms', 'adverse_events', 'safety_reporting', 'ae_reporting', 'pharmacovigilance'],
    titleTerms: ['harms', 'adverse event', 'adverse events', 'safety reporting', 'pharmacovigilance'] },
  '23': { label: 'auditing', keys: ['auditing', 'audit', 'audits'], titleTerms: ['audit', 'audits', 'auditing'], titleExcludes: ['audit trail', 'audit trails'], umbrellaKeys: ['data_management', 'monitoring', 'quality_assurance'] },
  '24': { label: 'research ethics approval', keys: ['ethics_approval', 'irb_approval', 'research_ethics', 'irb', 'iec'],
    titleTerms: ['ethics approval', 'ethical approval', 'irb', 'iec', 'ethics committee', 'research ethics', 'institutional review board'], umbrellaKeys: ['ethics'] },
  '25': { label: 'protocol amendments', keys: ['amendments', 'protocol_amendments'], titleTerms: ['amendment', 'amendments', 'protocol modification', 'protocol modifications'], titleExcludes: ['history', 'summary of changes'], umbrellaKeys: ['ethics'] },
  '26a': { label: 'informed consent', keys: ['consent', 'informed_consent', 'consent_process'], titleTerms: ['consent', 'assent'],
    titleExcludes: ['consent form', 'consent forms', 'ancillary', 'future use', 'future research'], umbrellaKeys: ['ethics'] },
  '26b': { label: 'consent for ancillary studies', keys: ['ancillary_consent', 'specimen_consent', 'future_use_consent'],
    titleTerms: [['consent', 'ancillary'], ['consent', 'future use'], ['consent', 'future research'], ['consent', 'specimen'], ['consent', 'specimens'], ['consent', 'samples']], umbrellaKeys: ['ethics', 'consent', 'informed_consent'] },
  '27': { label: 'confidentiality', keys: ['confidentiality', 'privacy', 'data_protection'], titleTerms: ['confidentiality', 'privacy', 'data protection'], umbrellaKeys: ['ethics', 'data_management'] },
  '28': { label: 'declaration of interests', keys: ['conflicts_of_interest', 'conflict_of_interest', 'declaration_of_interests', 'competing_interests', 'coi'],
    titleTerms: ['conflict of interest', 'conflicts of interest', 'declaration of interest', 'declaration of interests', 'declarations of interest', 'competing interest', 'competing interests', 'financial disclosure'], umbrellaKeys: ['ethics'] },
  '29': { label: 'access to data', keys: ['data_access', 'access_to_data'], titleTerms: ['access to data', 'data access'], umbrellaKeys: ['data_management'] },
  '30': { label: 'ancillary and post-trial care', keys: ['post_trial_care', 'ancillary_care', 'injury_compensation', 'insurance'],
    titleTerms: ['post trial', 'ancillary care', 'compensation for injury', 'compensation for harm', 'injury compensation', 'research related injury', 'trial related injury', 'insurance'], umbrellaKeys: ['ethics', 'compensation'] },
  '31a': { label: 'dissemination of results', keys: ['dissemination', 'publication', 'publication_policy'], titleTerms: ['dissemination', 'publication'] },
  '31b': { label: 'authorship', keys: ['authorship'], titleTerms: ['authorship'], umbrellaKeys: ['dissemination', 'publication', 'publication_policy'] },
  '31c': { label: 'public access to the protocol, data and code', keys: ['data_sharing', 'public_access'], titleTerms: ['data sharing', 'public access'], umbrellaKeys: ['dissemination', 'publication', 'publication_policy'] },
  '32': { label: 'informed consent materials', keys: ['consent_form', 'consent_forms', 'informed_consent_form', 'icf'], titleTerms: ['consent form', 'consent forms', 'consent materials', 'icf'], umbrellaKeys: ['appendices', 'appendix'] },
  '33': { label: 'biological specimens', keys: ['specimens', 'biological_specimens', 'biospecimens', 'biobanking'],
    titleTerms: ['specimen', 'specimens', 'biospecimen', 'biospecimens', 'biobank', 'biobanking', 'biological samples'], titleExcludes: ['consent'], umbrellaKeys: ['appendices', 'appendix'] },
});

// ─── The section matcher ─────────────────────────────────────────────────────

/** Normalised section key: lower-case, spaces and hyphens → underscores; '' for a non-string. */
export function normaliseSectionKey(key: unknown): string {
  return typeof key === 'string' ? key.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
}

/**
 * A title (or a term) as space-padded lower-case words: '&' reads as "and",
 * apostrophes are dropped and every other non-alphanumeric run is one space,
 * so "Investigator's Brochure" → " investigators brochure " and
 * "ClinicalTrials.gov" → " clinicaltrials gov ". Padding makes
 * `includes(' version ')` a whole-word test.
 */
export function normaliseTitle(title: unknown): string {
  if (typeof title !== 'string') return ' ';
  const words = title.toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return ` ${words} `;
}

function hasPhrase(normalisedTitle: string, phrase: string): boolean {
  const p = normaliseTitle(phrase);
  return p.trim().length > 0 && normalisedTitle.includes(p);
}

function titleAddresses(topic: SpiritDocumentTopic, title: unknown): boolean {
  const t = normaliseTitle(title);
  if ((topic.titleExcludes ?? []).some(p => hasPhrase(t, p))) return false;
  return topic.titleTerms.some(term => (typeof term === 'string' ? [term] : term).every(p => hasPhrase(t, p)));
}

/** A readable form of a title term for a gap line: `"version"` or `"consent" + "ancillary"`. */
export function describeTitleTerm(term: SpiritTitleTerm): string {
  return (typeof term === 'string' ? [term] : term).map(p => `"${p}"`).join(' + ');
}

/**
 * The sections of a document that address a topic directly (`specific`) and
 * the broader ones that may cover it (`umbrella`). Keys decide first: a
 * `keys` match is specific and an `umbrellaKeys` match is umbrella whatever
 * the title says; only an unkeyed section is matched on whole title words.
 * Non-object entries are skipped.
 */
export function sectionsForTopic(topic: SpiritDocumentTopic, sections: unknown): { specific: SpiritProtocolSection[]; umbrella: SpiritProtocolSection[] } {
  const specific: SpiritProtocolSection[] = [];
  const umbrella: SpiritProtocolSection[] = [];
  const list = Array.isArray(sections) ? sections.filter((s): s is SpiritProtocolSection => typeof s === 'object' && s !== null) : [];
  for (const s of list) {
    const key = normaliseSectionKey(s.sectionKey);
    if (topic.keys.includes(key)) specific.push(s);
    else if ((topic.umbrellaKeys ?? []).includes(key)) umbrella.push(s);
    else if (titleAddresses(topic, s.title)) specific.push(s);
  }
  return { specific, umbrella };
}
