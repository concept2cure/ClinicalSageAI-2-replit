/**
 * The standard job roles by client type: the PURE catalog (founder decision
 * P-119, 2026-11-10; docs/design/CLIENT_TYPE_JOB_ROLES_2026-11-10.md, slice 1).
 *
 * A person has an ACCESS LEVEL, which decides what they may do
 * (shared/constants/org-roles.ts), and JOB ROLES, which say what their function
 * is. The job-role store exists (P-49: `qms_job_roles`, shared/qms/training.ts)
 * and starts every organisation with none. This is the standard set an
 * administrator adopts from, by client type, beside the client-type presets
 * (./client-type-profiles.ts).
 *
 * It is data and pure helpers: no database and no I/O. An administrator adopts
 * from it in Administration (the design's section 2). A job role SUGGESTS an
 * access level and never grants one.
 *
 * @module shared/regulatory/client-type-job-roles
 */
import type { AssignableOrgRole } from '../constants/org-roles';
import type { ClientType, IndustryMode } from './client-type-profiles';

/** The function a job role belongs to. CMC is a function group, not a client type. */
export type JobRoleGroup =
  | 'regulatory'
  | 'clinical'
  | 'data_statistics'
  | 'safety'
  | 'nonclinical'
  | 'cmc'
  | 'quality'
  | 'device_diagnostics'
  | 'program';

/** The groups, in the order a screen lists them, each with the name it shows. */
export const JOB_ROLE_GROUPS: ReadonlyArray<Readonly<{ id: JobRoleGroup; name: string }>> = deepFreeze([
  { id: 'regulatory', name: 'Regulatory' },
  { id: 'clinical', name: 'Clinical' },
  { id: 'data_statistics', name: 'Data and statistics' },
  { id: 'safety', name: 'Safety' },
  { id: 'nonclinical', name: 'Nonclinical' },
  { id: 'cmc', name: 'CMC' },
  { id: 'quality', name: 'Quality' },
  { id: 'device_diagnostics', name: 'Device and diagnostics' },
  { id: 'program', name: 'Program' },
]);

/**
 * An access level a job role may suggest: every assignable level but `admin`.
 * Administration is a person's standing in the organisation, not a function.
 */
export type SuggestedAccessLevel = Exclude<AssignableOrgRole, 'admin'>;

/**
 * The kinds of organisation a role is offered to: the industries, and a
 * diagnostics organisation, which the client type tells apart from a device one.
 */
export type JobRoleOrganisationKind = IndustryMode | 'diagnostics';

export interface StandardJobRole {
  /** Stable snake_case key. Never shown to a person. */
  key: string;
  /** The job role's name: 1 to 80 characters, trimmed (the table's CHECK), unique ignoring case. */
  name: string;
  /** One sentence, at most 500 characters (the table's CHECK): what the function is accountable for. */
  description: string;
  group: JobRoleGroup;
  /** The access level the function usually takes: the least that lets it do its work. */
  suggestedAccessLevel: SuggestedAccessLevel;
  /**
   * One short clause, shown after "Usually {Level} access:" under the role's
   * name (the design's section 3 writes it "A {name} usually takes {level}: …";
   * the clause reads after either, and choosing "a" or "an" is the screen's). It starts small, refers to the person as "they", and says why the
   * level fits the work, not how the levels nest.
   */
  suggestedAccessReason: string;
  /**
   * The launch surfaces the function works in (shared/constants/launch-scope.ts),
   * across the products it serves: a role offered to drug and device
   * organisations lists both kinds of area. A reader shows those the
   * organisation has (its client type and entitlements).
   */
  workAreas: readonly string[];
  /** The plan task role keys this function answers to (services/regulatory). Each key has one role. */
  planTaskRoles: readonly string[];
  /** The kinds of organisation the role is offered to. The lists by client type are read from this. */
  offeredTo: readonly JobRoleOrganisationKind[];
}

/* ── Who a role is offered to ───────────────────────────────────────────────── */

/**
 * Sponsors of medicines: drugs and biologics. The CMC and safety groups are
 * theirs alone. A biotech is offered what a pharma organisation is, but for the
 * EU QPPV: its profile files NDAs and BLAs too, and sign-up files every "biotech
 * or pharma" organisation as biotech.
 */
const DRUG = ['biotech', 'pharma'] as const;
/** Device manufacturers. Whatever a device organisation is offered, a diagnostics one is offered too. */
const DEVICE = ['medtech', 'diagnostics'] as const;
/** Organisations that develop a product of their own. */
const SPONSORS = [...DRUG, ...DEVICE] as const;
/** Every kind of organisation. */
const EVERY = [...SPONSORS, 'cro', 'academic', 'regulatory', 'medical_writing'] as const;

/**
 * The one table. A role is here because a regulated organisation staffs the
 * function and a launch work area serves it.
 *
 * ROWS. Five lines each: what it is; what it is accountable for; its access
 * level and why; where it works and which plan task roles it answers to; who
 * is offered it.
 *
 * ORDER. Group by group in the order of JOB_ROLE_GROUPS, and within a group the
 * accountable lead first. Every list by client type keeps this order.
 *
 * SPELLING. The prose is British, as the product writes "organisation". The
 * words "labeling" and "Program" keep the product's own spelling (the launch
 * surface `labeling`, the program design).
 *
 * ACCESS LEVELS follow least privilege, and each is true to what the level may
 * do (server/services/tenant/role-scopes.ts reads these from the checks that
 * enforce them):
 *
 *   approver  signs, as a reviewer does, and also manages every project of the
 *             organisation (private ones too), reads the audit trail and
 *             finalises reports: a function that oversees the organisation's
 *             records. Until the organisation designates its QMS approvers, an
 *             approver also stands in as one (shared/qms/qms-approver-policy.ts),
 *             so Approver given to a function outside quality approves
 *             controlled documents until that designation is made.
 *   reviewer  signs, and manages only the projects it leads: a function that
 *             signs its work. The signing policy does not tell a review, an
 *             approval and a release apart (server/services/part11/
 *             signing-authority.ts), so a reviewer can sign a release too; the
 *             step to approver rests on oversight, not on release.
 *   manager   manages every project and reads the audit trail, and does not
 *             sign: a function that runs the organisation's work
 *   member    writes governed records, manages a project shared to it as
 *             owner, and does not sign: a function that writes. A CRO's
 *             project director is one: Manager would open every sponsor's
 *             project to them, and a CRO keeps its sponsors apart, so they are
 *             shared the projects they direct.
 *   viewer    reads only
 *
 * The reason's words carry that: "signs" appears for a level that signs and for
 * no other, and "every project" or "audit trail" for a level that reaches them
 * and for no other. The test holds each reason to its level by those words.
 *
 * PLAN TASK ROLES. Each key the program plan uses (services/regulatory) is
 * answered by exactly one role here: the role that holds it by default. Some
 * plans hand a key to an organisation that is not offered that role (the device
 * plans borrow `cmc_lead`, `supply_chain` and `safety_officer`; an academic
 * sponsor-investigator holds every sponsor task of its own IND that no role it
 * is offered holds; a consultancy's regulatory CMC lead holds the CMC lead's
 * Module 3 work). Those
 * holders are named in PLAN_TASK_ROLE_HOLDERS_ELSEWHERE, and
 * jobRoleForPlanTaskRole, given the organisation, answers the role it is
 * offered, or null when it is offered none: an academic organisation's
 * marketing-application and device plans answer null for many tasks, as no
 * academic sponsor files them. In a drug organisation the plan's
 * Module 3 tasks go to the CMC lead by key; a screen that proposes owners may
 * offer the regulatory CMC lead beside it.
 */
export const STANDARD_JOB_ROLES: readonly StandardJobRole[] = deepFreeze<StandardJobRole[]>([
  /* ── Regulatory ── */
  { key: 'regulatory_affairs_lead', name: 'Regulatory affairs lead', group: 'regulatory',
    description: 'Accountable for the regulatory strategy, the interactions with health authorities and the decision to file.',
    suggestedAccessLevel: 'approver', suggestedAccessReason: 'signs filings and oversees every project',
    workAreas: ['projects', 'submission-center', 'dispatch-readiness', 'communication-center', 'device-510k', 'device-pma', 'device-presub'], planTaskRoles: ['ra_lead'],
    offeredTo: [...SPONSORS, 'cro', 'academic', 'regulatory'] },
  { key: 'regional_regulatory_lead', name: 'Regional regulatory lead', group: 'regulatory',
    description: "Accountable for one region's filing: its Module 1, its procedure and the answers to that authority's questions.",
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs the documents for their region',
    workAreas: ['submission-center', 'communication-center', 'document-authoring'], planTaskRoles: [],
    offeredTo: [...DRUG, 'cro', 'regulatory'] },
  { key: 'regulatory_affairs_associate', name: 'Regulatory affairs associate', group: 'regulatory',
    description: "Accountable for preparing a filing's forms, administrative documents and correspondence, and for keeping its record complete.",
    suggestedAccessLevel: 'member', suggestedAccessReason: 'prepares and files records and does not sign them',
    workAreas: ['submission-center', 'ind-checklist', 'vault', 'tasks', 'device-510k', 'device-pma', 'device-presub', 'device-udi'], planTaskRoles: ['ra_associate'],
    offeredTo: [...SPONSORS, 'cro', 'academic', 'regulatory'] },
  { key: 'regulatory_operations_lead', name: 'Regulatory operations lead', group: 'regulatory',
    description: 'Accountable for publishing: the build of the electronic submission, its validation and its dispatch to the health authority.',
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs the dispatch of a submission',
    workAreas: ['submission-center', 'ectd-compile', 'dispatch-readiness', 'gateway-transmittals'], planTaskRoles: ['regulatory_ops'],
    offeredTo: [...SPONSORS, 'cro', 'regulatory'] },
  { key: 'labeling_lead', name: 'Labeling lead', group: 'regulatory',
    description: "Accountable for the product's labeling, from the label and instructions for use to the prescribing information: its text, its agreement with the evidence and its review by the health authority.",
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs the review of labeling',
    workAreas: ['document-authoring', 'review', 'labeling', 'device-udi'], planTaskRoles: [],
    offeredTo: [...DRUG, ...DEVICE] },
  { key: 'medical_writer', name: 'Medical writer', group: 'regulatory',
    description: 'Accountable for drafting clinical and regulatory documents from their source data, to the template and style in force.',
    suggestedAccessLevel: 'member', suggestedAccessReason: 'drafts documents and does not sign them',
    workAreas: ['document-authoring', 'review', 'vault'], planTaskRoles: ['medical_writer'],
    offeredTo: [...SPONSORS, 'cro', 'regulatory', 'medical_writing'] },
  { key: 'lead_medical_writer', name: 'Lead medical writer', group: 'regulatory',
    description: "Accountable for a filing's clinical documents and summaries: their consistency with each other, their check against source and their review rounds.",
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs the review of documents others drafted',
    workAreas: ['document-authoring', 'review'], planTaskRoles: [],
    offeredTo: [...DRUG, 'cro', 'medical_writing'] },
  { key: 'regulatory_consultant', name: 'Regulatory consultant', group: 'regulatory',
    description: "Accountable for the advice given to a client: the pathway, the strategy and the documents prepared on the client's behalf.",
    suggestedAccessLevel: 'member', suggestedAccessReason: 'drafts for clients and does not sign for them',
    workAreas: ['projects', 'document-authoring', 'communication-center'], planTaskRoles: [],
    offeredTo: ['regulatory'] },

  /* ── Clinical ── */
  { key: 'clinical_lead', name: 'Clinical development lead', group: 'clinical',
    description: 'Accountable for the clinical development plan and the medical interpretation of the evidence on benefit and safety.',
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs clinical documents as their medical reviewer',
    workAreas: ['protocol-dev', 'document-authoring', 'review'], planTaskRoles: ['clinical_lead', 'medical_officer'],
    offeredTo: [...SPONSORS] },
  { key: 'medical_monitor', name: 'Medical monitor', group: 'clinical',
    description: "Accountable for the medical oversight of a study in conduct: eligibility questions, participants' safety and the medical review of adverse events.",
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs medical reviews',
    workAreas: ['rbm', 'protocol-dev', 'review'], planTaskRoles: ['medical_monitor'],
    offeredTo: [...DRUG, 'cro'] },
  { key: 'clinical_operations_lead', name: 'Clinical operations lead', group: 'clinical',
    description: "Accountable for the conduct of the organisation's studies: sites, enrolment, monitoring and vendors, to the protocol and to good clinical practice.",
    suggestedAccessLevel: 'manager', suggestedAccessReason: 'runs the studies of every project and reads the audit trail, and does not sign',
    workAreas: ['projects', 'tasks', 'protocol-dev', 'rbm'], planTaskRoles: ['clinical_ops', 'clinical_operations'],
    offeredTo: [...SPONSORS, 'cro'] },
  { key: 'clinical_trial_manager', name: 'Clinical trial manager', group: 'clinical',
    description: "Accountable for one study's delivery: its timeline, its sites, its vendors and its budget.",
    suggestedAccessLevel: 'member', suggestedAccessReason: 'leads the project of their own study and does not sign',
    workAreas: ['project-home', 'tasks', 'rbm', 'device-clinical-studies'], planTaskRoles: [],
    offeredTo: [...DRUG, ...DEVICE, 'cro'] },
  { key: 'clinical_research_associate', name: 'Clinical research associate', group: 'clinical',
    description: 'Accountable for monitoring study sites: the review and verification of source data, compliance with the protocol and good clinical practice, and the follow-up of findings.',
    suggestedAccessLevel: 'member', suggestedAccessReason: 'records monitoring findings and does not sign',
    workAreas: ['rbm', 'tasks', 'device-clinical-studies'], planTaskRoles: ['clinical_research_associate'],
    offeredTo: [...DRUG, ...DEVICE, 'cro'] },
  { key: 'clinical_pharmacologist', name: 'Clinical pharmacologist', group: 'clinical',
    description: 'Accountable for the pharmacokinetic and pharmacodynamic evidence and for the rationale for the dose.',
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs clinical pharmacology reports',
    workAreas: ['document-authoring', 'review'], planTaskRoles: ['clinical_pharmacology'],
    offeredTo: [...DRUG] },
  { key: 'sponsor_investigator', name: 'Sponsor-investigator', group: 'clinical',
    description: 'Accountable, as both sponsor and investigator, for an investigator-initiated study: its application, its conduct and its reporting.',
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs their own application and study documents',
    workAreas: ['projects', 'protocol-dev', 'document-authoring', 'submission-center', 'ind-checklist'], planTaskRoles: [],
    offeredTo: ['academic'] },
  { key: 'study_coordinator', name: 'Study coordinator', group: 'clinical',
    description: "Accountable to the investigator for the day-to-day running of a study at its site: participant visits, the study's records and its submissions to the ethics committee.",
    suggestedAccessLevel: 'member', suggestedAccessReason: 'keeps the records of the study and does not sign',
    workAreas: ['tasks', 'protocol-dev', 'vault'], planTaskRoles: [],
    offeredTo: ['academic'] },

  /* ── Data and statistics ── */
  { key: 'biostatistician', name: 'Biostatistician', group: 'data_statistics',
    description: 'Accountable for the statistical analysis plan, the analyses and the correctness of every reported result.',
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs statistical plans and outputs',
    workAreas: ['biostatistics', 'document-authoring', 'review'], planTaskRoles: ['biostatistician'],
    offeredTo: [...SPONSORS, 'cro', 'academic'] },
  { key: 'statistical_programmer', name: 'Statistical programmer', group: 'data_statistics',
    description: 'Accountable for the analysis datasets and the tables, listings and figures, and for their traceability to the source data.',
    suggestedAccessLevel: 'member', suggestedAccessReason: 'produces analysis datasets and outputs',
    workAreas: ['biostatistics', 'vault'], planTaskRoles: [],
    offeredTo: [...DRUG, 'cro'] },
  { key: 'clinical_data_manager', name: 'Clinical data manager', group: 'data_statistics',
    description: 'Accountable for the study database: its cleaning, coding and reconciliation, its lock and the datasets submitted to the authority.',
    suggestedAccessLevel: 'member', suggestedAccessReason: 'maintains study data records',
    workAreas: ['vault', 'rbm', 'biostatistics', 'device-clinical-studies'], planTaskRoles: [],
    offeredTo: [...DRUG, ...DEVICE, 'cro'] },

  /* ── Safety: the pharmacovigilance of a medicine ── */
  { key: 'pharmacovigilance_lead', name: 'Pharmacovigilance lead', group: 'safety',
    description: 'Accountable for the safety of the medicine in people: the expedited and periodic safety reports, the detection and assessment of signals, the integrated safety assessment and its case narratives, and the risk management plan.',
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs safety reports and plans as their medical reviewer',
    workAreas: ['document-authoring', 'review', 'communication-center'], planTaskRoles: ['pharmacovigilance', 'safety_officer', 'safety'],
    offeredTo: [...DRUG, 'cro'] },
  { key: 'drug_safety_associate', name: 'Drug safety associate', group: 'safety',
    description: 'Accountable for processing safety cases: their intake, coding and follow-up, their reporting on time and the data for periodic reports.',
    suggestedAccessLevel: 'member', suggestedAccessReason: 'records safety data',
    workAreas: ['tasks', 'document-authoring'], planTaskRoles: ['drug_safety'],
    offeredTo: [...DRUG, 'cro'] },
  { key: 'eu_qualified_person_for_pharmacovigilance', name: 'EU qualified person responsible for pharmacovigilance (QPPV)', group: 'safety',
    description: "Accountable for the marketing authorisation holder's pharmacovigilance system in the European Union and for oversight of the safety of its authorised medicines.",
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs pharmacovigilance system documents',
    workAreas: ['document-authoring', 'review', 'quality'], planTaskRoles: [],
    offeredTo: ['pharma'] },

  /* ── Nonclinical: a medicine's, and a device's biocompatibility and animal studies ── */
  { key: 'nonclinical_lead', name: 'Nonclinical lead', group: 'nonclinical',
    description: 'Accountable for the nonclinical evidence: the pharmacology, pharmacokinetic, toxicology, biocompatibility and animal studies, their conduct to standard and their summaries.',
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs nonclinical reports and summaries',
    workAreas: ['document-authoring', 'review', 'vault'], planTaskRoles: ['nonclinical_lead', 'toxicologist'],
    offeredTo: [...DRUG, ...DEVICE] },

  /* ── CMC: a function group, offered whole to every drug and biologic type. A
     CMC-only organisation (a contract manufacturer) adopts it as a biotech or
     pharma organisation; a CRO is offered none of it. ── */
  { key: 'cmc_lead', name: 'CMC lead', group: 'cmc',
    description: 'Accountable for the development and manufacture of the drug substance and drug product, their control strategy and their stability.',
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs chemistry, manufacturing and controls documents',
    workAreas: ['cmc', 'document-authoring', 'review'], planTaskRoles: ['cmc_lead'],
    offeredTo: [...DRUG] },
  { key: 'regulatory_cmc_lead', name: 'Regulatory CMC lead', group: 'cmc',
    description: 'Accountable for Module 3 and its quality summary, and for their agreement with the manufacturing record.',
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs the documents of Module 3',
    workAreas: ['cmc', 'submission-center', 'document-authoring', 'review'], planTaskRoles: [],
    offeredTo: [...DRUG, 'regulatory'] },
  { key: 'analytical_development_scientist', name: 'Analytical development scientist', group: 'cmc',
    description: 'Accountable for the analytical methods and their validation, the specifications and the stability studies.',
    suggestedAccessLevel: 'member', suggestedAccessReason: 'records analytical data and reports',
    workAreas: ['cmc'], planTaskRoles: [],
    offeredTo: [...DRUG] },
  { key: 'process_development_scientist', name: 'Formulation and process development scientist', group: 'cmc',
    description: 'Accountable for the formulation, its container closure and the manufacturing process: their development, scale-up, characterisation and validation.',
    suggestedAccessLevel: 'member', suggestedAccessReason: 'records development data and reports',
    workAreas: ['cmc'], planTaskRoles: [],
    offeredTo: [...DRUG] },
  { key: 'manufacturing_lead', name: 'Manufacturing lead', group: 'cmc',
    description: 'Accountable for making batches to the approved process and to good manufacturing practice, and for their batch records.',
    suggestedAccessLevel: 'member', suggestedAccessReason: 'records manufacturing data and does not sign the release of a batch',
    workAreas: ['cmc', 'quality'], planTaskRoles: [],
    offeredTo: [...DRUG] },
  { key: 'quality_control_analyst', name: 'Quality control analyst', group: 'cmc',
    description: 'Accountable for testing materials and batches against their specifications and for investigating results that fall outside them.',
    suggestedAccessLevel: 'member', suggestedAccessReason: 'records test results and does not sign the release of a batch',
    workAreas: ['cmc', 'quality'], planTaskRoles: [],
    offeredTo: [...DRUG] },
  { key: 'supply_chain_lead', name: 'Supply chain lead', group: 'cmc',
    description: 'Accountable for the supply of product: the packaging, labeling and distribution of investigational product to sites, and the readiness of supply for launch.',
    suggestedAccessLevel: 'member', suggestedAccessReason: 'records supply plans and shipments',
    workAreas: ['cmc', 'tasks'], planTaskRoles: ['supply_chain'],
    offeredTo: [...DRUG] },
  { key: 'qualified_person', name: 'Qualified person for batch certification', group: 'cmc',
    description: 'Accountable for certifying, before its release in the European Union, that each batch was made and checked to its authorisation and to good manufacturing practice.',
    suggestedAccessLevel: 'approver', suggestedAccessReason: 'signs the certification that releases a batch and reads the audit trail behind the batch',
    workAreas: ['cmc', 'quality', 'audit-trail'], planTaskRoles: [],
    offeredTo: [...DRUG] },

  /* ── Quality ── */
  { key: 'quality_assurance_lead', name: 'Quality assurance lead', group: 'quality',
    description: 'Accountable for the quality system: controlled documents and the training on them, change control, deviations and corrective actions, suppliers, audits, readiness for inspection and, where the organisation makes product, the release or rejection of each batch.',
    suggestedAccessLevel: 'approver', suggestedAccessReason: 'signs controlled documents as a QMS approver and reads the audit trail',
    workAreas: ['quality', 'review', 'audit-trail', 'compliance-reports', 'cmc'], planTaskRoles: ['qa_manager', 'quality'],
    offeredTo: [...EVERY] },
  { key: 'quality_assurance_specialist', name: 'Quality assurance specialist', group: 'quality',
    description: 'Accountable for the day-to-day work of the quality unit: document changes, deviations, nonconformances and corrective actions, and supplier records.',
    suggestedAccessLevel: 'member', suggestedAccessReason: 'writes quality records and does not sign their approval',
    workAreas: ['quality', 'tasks'], planTaskRoles: [],
    offeredTo: [...SPONSORS, 'cro'] },
  { key: 'document_control_specialist', name: 'Document control specialist', group: 'quality',
    description: 'Accountable for the register of controlled documents: their numbering, versions, distribution, the schedule of periodic review and retention.',
    suggestedAccessLevel: 'member', suggestedAccessReason: 'maintains the document register and does not sign',
    workAreas: ['quality', 'vault'], planTaskRoles: [],
    offeredTo: [...DRUG, ...DEVICE, 'cro'] },
  { key: 'internal_auditor', name: 'Internal auditor', group: 'quality',
    description: "Accountable for independent audits of the organisation's processes and records, and of its suppliers, against its procedures and the regulations that apply.",
    suggestedAccessLevel: 'member', suggestedAccessReason: 'records audits and their findings and does not sign',
    workAreas: ['quality', 'vault'], planTaskRoles: [],
    offeredTo: [...SPONSORS, 'cro'] },
  { key: 'computerised_system_validation_lead', name: 'Computerised system validation lead', group: 'quality',
    description: 'Accountable for showing that each computerised system holding regulated records is validated for its intended use and stays so through change.',
    suggestedAccessLevel: 'approver', suggestedAccessReason: 'signs validation plans and reports and reads the audit trail as validation evidence',
    workAreas: ['quality', 'audit-trail', 'compliance-reports'], planTaskRoles: [],
    offeredTo: [...DRUG, ...DEVICE, 'cro'] },

  /* ── Device and diagnostics ── */
  { key: 'design_engineering_lead', name: 'Design engineering lead', group: 'device_diagnostics',
    description: "Accountable for the device's design and development record: design inputs and outputs, verification and validation, and transfer to production.",
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs design reviews',
    workAreas: ['device-engineering', 'device-software', 'document-authoring'], planTaskRoles: ['engineering'],
    offeredTo: [...DEVICE] },
  { key: 'device_software_engineer', name: 'Device software engineer', group: 'device_diagnostics',
    description: "Accountable for the device software's lifecycle record: its requirements, architecture, cybersecurity, verification and release, to the software's safety classification.",
    suggestedAccessLevel: 'member', suggestedAccessReason: 'writes software lifecycle records',
    workAreas: ['device-software', 'device-engineering'], planTaskRoles: [],
    offeredTo: [...DEVICE] },
  { key: 'risk_management_lead', name: 'Risk management lead', group: 'device_diagnostics',
    description: "Accountable for the device's risk management file: its hazards, its risk controls, the benefit-risk conclusion and its upkeep from post-market data.",
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs reviews of the risk management file',
    workAreas: ['device-engineering', 'review'], planTaskRoles: [],
    offeredTo: [...DEVICE] },
  { key: 'human_factors_engineer', name: 'Human factors engineer', group: 'device_diagnostics',
    description: 'Accountable for the usability engineering file: the use-related risk analysis, the formative evaluations and the summative evaluation that validates the user interface.',
    suggestedAccessLevel: 'member', suggestedAccessReason: 'writes usability records',
    workAreas: ['human-factors', 'device-engineering'], planTaskRoles: [],
    offeredTo: [...DEVICE] },
  { key: 'manufacturing_engineering_lead', name: 'Manufacturing engineering lead', group: 'device_diagnostics',
    description: 'Accountable for making the device to its released design: production and process controls, process validation, acceptance activities, the production records and the readiness of supply.',
    suggestedAccessLevel: 'member', suggestedAccessReason: 'records production and validation data and does not sign',
    workAreas: ['device-engineering', 'quality'], planTaskRoles: [],
    offeredTo: [...DEVICE] },
  { key: 'clinical_evaluation_lead', name: 'Clinical evaluation lead', group: 'device_diagnostics',
    description: "Accountable for the device's clinical evaluation: its plan, the appraisal of the literature and clinical data, its report and post-market clinical follow-up.",
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs the clinical evaluation report as an evaluator',
    workAreas: ['device-cer', 'device-clinical-studies', 'document-authoring', 'review'], planTaskRoles: [],
    offeredTo: [...DEVICE] },
  { key: 'person_responsible_for_regulatory_compliance', name: 'Person responsible for regulatory compliance', group: 'device_diagnostics',
    description: 'Accountable, for a manufacturer placing devices on the European Union market, for conformity checks before release, the technical documentation and declaration of conformity, post-market surveillance and vigilance reporting, and the statement for devices under clinical investigation or performance study.',
    suggestedAccessLevel: 'approver', suggestedAccessReason: 'signs the conformity check before a device is released and oversees every project',
    workAreas: ['device-engineering', 'device-postmarket', 'quality', 'submission-center'], planTaskRoles: [],
    offeredTo: [...DEVICE] },
  { key: 'post_market_surveillance_lead', name: 'Post-market surveillance lead', group: 'device_diagnostics',
    description: 'Accountable for post-market surveillance and vigilance: complaints, incident reports to authorities, trend analysis and the periodic safety reports.',
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs vigilance and surveillance reports',
    workAreas: ['device-postmarket', 'quality'], planTaskRoles: [],
    offeredTo: [...DEVICE] },
  { key: 'management_representative', name: 'Management representative', group: 'device_diagnostics',
    description: "Accountable, as top management's appointee, for making sure the quality management system's processes are established and kept, and for reporting on its performance and the need for improvement; often held by the quality assurance lead.",
    suggestedAccessLevel: 'approver', suggestedAccessReason: 'reads the audit trail to report on the quality system and signs quality system documents as a QMS approver',
    workAreas: ['quality', 'audit-trail', 'compliance-reports'], planTaskRoles: [],
    offeredTo: [...DEVICE] },
  { key: 'assay_development_scientist', name: 'Assay development scientist', group: 'device_diagnostics',
    description: "Accountable for the assay's design and analytical performance: its reagents, its calibration and controls, and the studies that characterise it.",
    suggestedAccessLevel: 'member', suggestedAccessReason: 'records assay development data',
    workAreas: ['device-diagnostics', 'device-engineering'], planTaskRoles: [],
    offeredTo: ['diagnostics'] },
  { key: 'performance_evaluation_lead', name: 'Performance evaluation lead', group: 'device_diagnostics',
    description: 'Accountable for the performance evaluation of an in vitro diagnostic: its scientific validity, analytical performance and clinical performance, the report on them and their post-market performance follow-up.',
    suggestedAccessLevel: 'reviewer', suggestedAccessReason: 'signs the performance evaluation report',
    workAreas: ['device-diagnostics', 'document-authoring', 'review'], planTaskRoles: [],
    offeredTo: ['diagnostics'] },
  { key: 'clinical_laboratory_director', name: 'Clinical laboratory director', group: 'device_diagnostics',
    description: "Accountable for a clinical laboratory's testing: its procedures, the competence of its staff, its quality control and the results it reports.",
    suggestedAccessLevel: 'approver', suggestedAccessReason: 'signs the approval of the laboratory procedures and reads the audit trail',
    workAreas: ['device-diagnostics', 'quality', 'audit-trail'], planTaskRoles: [],
    offeredTo: ['diagnostics'] },

  /* ── Program, with the external reviewer last: an outside reader, not a program function ── */
  { key: 'executive_sponsor', name: 'Executive sponsor', group: 'program',
    description: 'Accountable for the decision to proceed at each gate and for the people and budget the work needs.',
    suggestedAccessLevel: 'approver', suggestedAccessReason: 'signs the decision at a gate and sees every project, private ones too',
    workAreas: ['projects', 'insights'], planTaskRoles: ['executive'],
    offeredTo: [...SPONSORS] },
  { key: 'project_director', name: 'Project director', group: 'program',
    description: 'Accountable to a sponsor for the delivery of its contracted work: scope, timelines, quality and the decisions put to the sponsor.',
    suggestedAccessLevel: 'member', suggestedAccessReason: 'leads the projects their sponsors contract and does not sign',
    workAreas: ['projects', 'tasks', 'communication-center', 'insights'], planTaskRoles: [],
    offeredTo: ['cro'] },
  { key: 'project_manager', name: 'Project manager', group: 'program',
    description: 'Accountable for the integrated schedule, the risk, issue and decision logs, and reporting the status of the work.',
    suggestedAccessLevel: 'manager', suggestedAccessReason: 'manages the plan and tasks of every project and does not sign',
    workAreas: ['projects', 'project-home', 'tasks', 'insights'], planTaskRoles: ['project_manager'],
    offeredTo: [...EVERY] },
  { key: 'market_access_lead', name: 'Market access lead', group: 'program',
    description: "Accountable for the evidence for pricing and reimbursement: health economics, health technology assessment and payers' requirements.",
    suggestedAccessLevel: 'member', suggestedAccessReason: 'drafts the value evidence and does not sign',
    workAreas: ['document-authoring', 'insights'], planTaskRoles: ['market_access'],
    offeredTo: [...DRUG] },
  { key: 'external_reviewer', name: 'External reviewer', group: 'program',
    description: 'Accountable for an independent reading of the records the organisation shares with them, as an adviser, auditor or partner, without changing any.',
    suggestedAccessLevel: 'viewer', suggestedAccessReason: 'reads what they are shown and changes nothing',
    workAreas: ['vault', 'review'], planTaskRoles: [],
    offeredTo: [...EVERY] },
]);

/**
 * Who else holds a plan task role, in an organisation that is not offered the
 * role that holds it by default, in the order they are tried. Read by
 * jobRoleForPlanTaskRole when it is told the organisation.
 */
export const PLAN_TASK_ROLE_HOLDERS_ELSEWHERE: Readonly<Record<string, readonly string[]>> = deepFreeze({
  // An academic sponsor-investigator holds the sponsor's work on an
  // investigator-initiated IND: clinical and medical, its monitoring and conduct,
  // its safety reporting, its documents, and the CMC and nonclinical sections
  // (often by reference to the manufacturer's). The publishing goes to the
  // regulatory affairs associate an academic organisation is offered.
  clinical_lead: ['sponsor_investigator'],
  medical_officer: ['sponsor_investigator'],
  medical_monitor: ['sponsor_investigator'],
  clinical_ops: ['sponsor_investigator'],
  clinical_operations: ['sponsor_investigator'],
  clinical_research_associate: ['sponsor_investigator'],
  pharmacovigilance: ['sponsor_investigator'],
  safety: ['sponsor_investigator'],
  drug_safety: ['sponsor_investigator'],
  medical_writer: ['sponsor_investigator'],
  nonclinical_lead: ['sponsor_investigator'],
  toxicologist: ['sponsor_investigator'],
  regulatory_ops: ['regulatory_affairs_associate'],
  // A device plan's manufacturing tasks; a consultancy's Module 3 work; an academic IND's.
  cmc_lead: ['manufacturing_engineering_lead', 'regulatory_cmc_lead', 'sponsor_investigator'],
  supply_chain: ['manufacturing_engineering_lead'],
  // A device's periodic safety update report is post-market surveillance; an academic IND's safety report.
  safety_officer: ['post_market_surveillance_lead', 'sponsor_investigator'],
});

/* ── By client type ─────────────────────────────────────────────────────────── */

const keysOfferedTo = (kind: JobRoleOrganisationKind): readonly string[] =>
  Object.freeze(STANDARD_JOB_ROLES.filter((role) => role.offeredTo.includes(kind)).map((role) => role.key));

/** For each industry (`organizations.industry_mode`), the role keys offered, in the catalog's order. */
export const JOB_ROLE_KEYS_BY_INDUSTRY_MODE: Readonly<Record<IndustryMode, readonly string[]>> = Object.freeze({
  biotech: keysOfferedTo('biotech'),
  pharma: keysOfferedTo('pharma'),
  cro: keysOfferedTo('cro'),
  medtech: keysOfferedTo('medtech'),
  academic: keysOfferedTo('academic'),
  regulatory: keysOfferedTo('regulatory'),
  medical_writing: keysOfferedTo('medical_writing'),
});

/**
 * For each client type (`organizations.client_type`), the role keys offered, in
 * the catalog's order. Where the two vocabularies share a name they share the
 * list. `health` is a health system or academic centre, which the industry
 * presets call `academic`. `diagnostics` gets the device roles and its own.
 */
export const JOB_ROLE_KEYS_BY_CLIENT_TYPE: Readonly<Record<ClientType, readonly string[]>> = Object.freeze({
  medtech: JOB_ROLE_KEYS_BY_INDUSTRY_MODE.medtech,
  biotech: JOB_ROLE_KEYS_BY_INDUSTRY_MODE.biotech,
  pharma: JOB_ROLE_KEYS_BY_INDUSTRY_MODE.pharma,
  diagnostics: keysOfferedTo('diagnostics'),
  cro: JOB_ROLE_KEYS_BY_INDUSTRY_MODE.cro,
  health: JOB_ROLE_KEYS_BY_INDUSTRY_MODE.academic,
});

/**
 * `organizations.client_type` is NOT NULL DEFAULT 'pharma'
 * (db/migrations/20260612_org_client_type_user_preferences.sql), so an
 * organisation that never stated a client type carries this one. Beside a known
 * industry it is therefore not read as a second statement, as reporting already
 * refuses to (server/services/report-os/segment.ts).
 */
const UNSTATED_CLIENT_TYPE: ClientType = 'pharma';

/* ── Lookups ────────────────────────────────────────────────────────────────── */

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
/** A name as the store's live unique index compares it (lower-cased), with runs of whitespace as one space. */
const nameKey = (value: unknown): string => text(value).replace(/\s+/g, ' ').toLowerCase();

const ROLE_BY_KEY: ReadonlyMap<string, StandardJobRole> = new Map(STANDARD_JOB_ROLES.map((role) => [role.key, role]));
const ROLE_BY_NAME: ReadonlyMap<string, StandardJobRole> = new Map(STANDARD_JOB_ROLES.map((role) => [nameKey(role.name), role]));
const ROLE_BY_PLAN_TASK_ROLE: ReadonlyMap<string, StandardJobRole> = new Map(
  STANDARD_JOB_ROLES.flatMap((role) => role.planTaskRoles.map((taskRole) => [taskRole, role] as const)),
);

const industryModeOf = (value: unknown): IndustryMode | null => {
  const key = text(value).toLowerCase();
  return Object.hasOwn(JOB_ROLE_KEYS_BY_INDUSTRY_MODE, key) ? (key as IndustryMode) : null;
};
const clientTypeOf = (value: unknown): ClientType | null => {
  const key = text(value).toLowerCase();
  return Object.hasOwn(JOB_ROLE_KEYS_BY_CLIENT_TYPE, key) ? (key as ClientType) : null;
};

/** What an organisation says it is: either value, both, or neither. */
export interface JobRoleOrganisation {
  /** `organizations.industry_mode`. */
  industryMode?: string | null;
  /** `organizations.client_type`. */
  clientType?: string | null;
}

/** The standard job role with this key, or null. */
export function standardJobRole(key: string | null | undefined): StandardJobRole | null {
  return ROLE_BY_KEY.get(text(key)) ?? null;
}

/**
 * The standard job roles offered to an organisation, in the catalog's order.
 *
 *   - One value known: that industry's or that client type's list.
 *   - Both known: both lists, each role once. That is how a diagnostics
 *     organisation (industry `medtech`, client type `diagnostics`) gets the device
 *     roles and the diagnostics ones. The exception is client type `pharma`
 *     beside a known industry: it is the column's default, so it adds nothing.
 *   - Neither known (missing, or a value this catalog does not name): an empty
 *     list. Nothing is offered to an organisation whose type is not known; the
 *     whole table is STANDARD_JOB_ROLES.
 *
 * Case and surrounding whitespace are ignored. Never throws.
 */
export function standardJobRolesFor(organisation: JobRoleOrganisation | null | undefined): StandardJobRole[] {
  const industry = industryModeOf(organisation?.industryMode);
  const client = clientTypeOf(organisation?.clientType);
  const offered = new Set<string>(industry ? JOB_ROLE_KEYS_BY_INDUSTRY_MODE[industry] : []);
  if (client && !(industry && client === UNSTATED_CLIENT_TYPE)) {
    for (const key of JOB_ROLE_KEYS_BY_CLIENT_TYPE[client]) offered.add(key);
  }
  return STANDARD_JOB_ROLES.filter((role) => offered.has(role.key));
}

/** The same roles under their function groups, in the groups' order. A group with no role is left out. */
export function standardJobRolesByGroup(
  organisation: JobRoleOrganisation | null | undefined,
): Array<{ group: JobRoleGroup; name: string; roles: StandardJobRole[] }> {
  const roles = standardJobRolesFor(organisation);
  return JOB_ROLE_GROUPS
    .map((group) => ({ group: group.id, name: group.name, roles: roles.filter((role) => role.group === group.id) }))
    .filter((group) => group.roles.length > 0);
}

/** The access level a standard job role usually takes, or null for a key this catalog does not name. */
export function suggestedAccessLevel(roleKey: string | null | undefined): SuggestedAccessLevel | null {
  return standardJobRole(roleKey)?.suggestedAccessLevel ?? null;
}

const HOLDERS_ELSEWHERE: ReadonlyMap<string, readonly string[]> = new Map(Object.entries(PLAN_TASK_ROLE_HOLDERS_ELSEWHERE));

/**
 * The job role a plan task's role means (`role` and `assignedRole` under
 * services/regulatory). Case and surrounding whitespace are ignored.
 *
 *   - Without an organisation (omitted, null or undefined): the role that holds
 *     the key by default, or null for a key the plan does not use.
 *   - With one: the first role it is offered among that default and the key's
 *     PLAN_TASK_ROLE_HOLDERS_ELSEWHERE, or null when it is offered none. Null is
 *     "no proposed owner": never a role the organisation cannot adopt.
 *
 * Never throws.
 */
export function jobRoleForPlanTaskRole(
  taskRole: string | null | undefined,
  organisation?: JobRoleOrganisation | null,
): StandardJobRole | null {
  const key = text(taskRole).toLowerCase();
  const role = ROLE_BY_PLAN_TASK_ROLE.get(key) ?? null;
  if (!role || organisation === undefined || organisation === null) return role;
  const offered = new Set(standardJobRolesFor(organisation).map((r) => r.key));
  for (const candidate of [role.key, ...(HOLDERS_ELSEWHERE.get(key) ?? [])]) {
    if (offered.has(candidate)) return ROLE_BY_KEY.get(candidate) ?? null;
  }
  return null;
}

/**
 * The standard job role an organisation's own role name is, or null. The match
 * is exact but for case and for surrounding or repeated whitespace. It is never
 * fuzzy: a near name is the organisation's own role, not a standard one.
 */
export function matchStandardJobRole(name: string | null | undefined): StandardJobRole | null {
  const key = nameKey(name);
  return key ? ROLE_BY_NAME.get(key) ?? null : null;
}

/** Freezes a literal and everything in it, so the one table cannot be changed by a reader. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}
