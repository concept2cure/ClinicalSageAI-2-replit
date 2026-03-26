/**
 * AnA RI — Workflow Orchestration
 *
 * Defines complete submission workflows for every submission type.
 * AnA uses these to guide clients step-by-step through the entire
 * regulatory process, from project setup to submission.
 *
 * Each workflow defines:
 * - Phases with milestones
 * - Required documents/artifacts per phase
 * - Role-specific tasks
 * - Decision gates
 * - Common pitfalls to flag
 *
 * @module server/services/ana-ri/workflow-orchestration
 */

import { pool } from '../../db.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WorkflowStep {
  id: string;
  phase: string;
  title: string;
  description: string;
  ctdSection?: string;
  requiredArtifacts: string[];
  commands: string[]; // AnA commands to execute
  roles: string[]; // Which user roles are responsible
  depends?: string[]; // Step IDs this depends on
  criticalPath: boolean;
}

export interface SubmissionWorkflow {
  type: string;
  name: string;
  agency: string;
  phases: Array<{
    name: string;
    description: string;
    steps: WorkflowStep[];
  }>;
}

// ─── IND Workflow ────────────────────────────────────────────────────────────

const IND_WORKFLOW: SubmissionWorkflow = {
  type: 'ind',
  name: 'Investigational New Drug Application',
  agency: 'FDA',
  phases: [
    {
      name: 'Pre-IND Preparation',
      description: 'Gather data, define strategy, prepare for pre-IND meeting',
      steps: [
        { id: 'ind-1', phase: 'pre-ind', title: 'Define regulatory strategy', description: 'Determine IND type, clinical phase, indication, and target population', ctdSection: undefined, requiredArtifacts: ['strategy_note'], commands: ['/strategy'], roles: ['ra_lead', 'ceo'], depends: [], criticalPath: true },
        { id: 'ind-2', phase: 'pre-ind', title: 'Pre-IND meeting request', description: 'Draft Type B meeting request with questions for FDA', ctdSection: '1.1', requiredArtifacts: ['meeting_request'], commands: ['/draft 1.1'], roles: ['ra_lead'], depends: ['ind-1'], criticalPath: true },
        { id: 'ind-3', phase: 'pre-ind', title: 'Nonclinical data package', description: 'Compile pharmacology, toxicology, ADME summaries', ctdSection: '2.4', requiredArtifacts: ['nonclinical_overview'], commands: ['/draft 2.4'], roles: ['clinical_lead'], depends: ['ind-1'], criticalPath: true },
      ],
    },
    {
      name: 'Module 1 — Administrative',
      description: 'Cover letter, forms, and administrative documents',
      steps: [
        { id: 'ind-4', phase: 'module-1', title: 'Cover letter & Form 1571', description: 'IND cover letter with sponsor info, drug name, phase, protocol list', ctdSection: '1.1', requiredArtifacts: ['cover_letter', 'form_1571'], commands: ['/draft 1.1'], roles: ['ra_lead'], depends: ['ind-1'], criticalPath: true },
        { id: 'ind-5', phase: 'module-1', title: 'Form 1572 (Investigators)', description: 'Statement of Investigator for each site PI', ctdSection: '1.3.1', requiredArtifacts: ['form_1572'], commands: ['/draft 1.3.1'], roles: ['ra_lead', 'clinical_lead'], depends: [], criticalPath: false },
        { id: 'ind-6', phase: 'module-1', title: 'Investigator brochure', description: 'Compile IB with all available nonclinical and clinical data', ctdSection: '1.14', requiredArtifacts: ['investigator_brochure'], commands: ['/draft 1.14', '/safety'], roles: ['medical_writer', 'clinical_lead'], depends: ['ind-3'], criticalPath: true },
      ],
    },
    {
      name: 'Module 2 — CTD Summaries',
      description: 'The critical overview documents FDA reviewers read first',
      steps: [
        { id: 'ind-7', phase: 'module-2', title: 'Quality Overall Summary (2.3)', description: 'CMC summary — drug substance, drug product, controls', ctdSection: '2.3', requiredArtifacts: ['quality_overall_summary'], commands: ['/draft 2.3', '/cmc'], roles: ['cmc_lead'], depends: [], criticalPath: true },
        { id: 'ind-8', phase: 'module-2', title: 'Nonclinical Overview (2.4)', description: 'Integrated nonclinical evaluation', ctdSection: '2.4', requiredArtifacts: ['nonclinical_overview'], commands: ['/draft 2.4'], roles: ['clinical_lead'], depends: ['ind-3'], criticalPath: true },
        { id: 'ind-9', phase: 'module-2', title: 'Clinical Overview (2.5)', description: 'Integrated analysis of clinical data', ctdSection: '2.5', requiredArtifacts: ['clinical_overview'], commands: ['/draft 2.5'], roles: ['medical_writer'], depends: [], criticalPath: true },
        { id: 'ind-10', phase: 'module-2', title: 'Nonclinical Written Summaries (2.6)', description: 'Pharmacology, PK, toxicology summaries', ctdSection: '2.6', requiredArtifacts: ['nonclinical_summaries'], commands: ['/draft 2.6'], roles: ['clinical_lead'], depends: ['ind-8'], criticalPath: false },
        { id: 'ind-11', phase: 'module-2', title: 'Clinical Summary (2.7)', description: 'Efficacy + safety summary with biopharm evaluation', ctdSection: '2.7', requiredArtifacts: ['clinical_summary'], commands: ['/draft 2.7', '/safety'], roles: ['medical_writer'], depends: ['ind-9'], criticalPath: true },
      ],
    },
    {
      name: 'Module 3 — Quality (CMC)',
      description: 'Chemistry, manufacturing, and controls documentation',
      steps: [
        { id: 'ind-12', phase: 'module-3', title: 'Drug Substance (3.2.S)', description: 'Nomenclature, manufacture, characterization, controls, stability', ctdSection: '3.2.S', requiredArtifacts: ['drug_substance'], commands: ['/draft 3.2.S', '/cmc'], roles: ['cmc_lead'], depends: [], criticalPath: true },
        { id: 'ind-13', phase: 'module-3', title: 'Drug Product (3.2.P)', description: 'Description, development, manufacture, controls, stability', ctdSection: '3.2.P', requiredArtifacts: ['drug_product'], commands: ['/draft 3.2.P', '/cmc'], roles: ['cmc_lead'], depends: ['ind-12'], criticalPath: true },
      ],
    },
    {
      name: 'Module 5 — Clinical',
      description: 'Clinical study reports and statistical analyses',
      steps: [
        { id: 'ind-14', phase: 'module-5', title: 'Clinical protocol', description: 'Phase-appropriate protocol with endpoints, design, SAP', ctdSection: '5.3.5', requiredArtifacts: ['protocol', 'sap'], commands: ['/design', '/sap', '/power'], roles: ['clinical_lead', 'medical_writer'], depends: ['ind-1'], criticalPath: true },
        { id: 'ind-15', phase: 'module-5', title: 'Statistical Analysis Plan', description: 'Standalone SAP with all planned analyses', ctdSection: '5.3.5.3', requiredArtifacts: ['sap'], commands: ['/sap'], roles: ['clinical_lead'], depends: ['ind-14'], criticalPath: true },
      ],
    },
    {
      name: 'Pre-Submission Review',
      description: 'Final quality checks before submitting to FDA',
      steps: [
        { id: 'ind-16', phase: 'review', title: 'Full dossier preflight', description: 'Check all modules for completeness, consistency, and compliance', ctdSection: undefined, requiredArtifacts: ['preflight_report'], commands: ['/preflight', '/assess'], roles: ['ra_lead'], depends: ['ind-4', 'ind-7', 'ind-9', 'ind-12', 'ind-14'], criticalPath: true },
        { id: 'ind-17', phase: 'review', title: 'Risk assessment', description: 'Generate risk memo with go/no-go recommendation', ctdSection: undefined, requiredArtifacts: ['risk_memo'], commands: ['/risk', '/memo'], roles: ['ra_lead', 'ceo'], depends: ['ind-16'], criticalPath: true },
        { id: 'ind-18', phase: 'review', title: 'Reviewer question prep', description: 'Anticipate reviewer questions and prepare responses', ctdSection: undefined, requiredArtifacts: ['reviewer_brief'], commands: ['/brief', '/simulate'], roles: ['ra_lead', 'medical_writer'], depends: ['ind-16'], criticalPath: false },
        { id: 'ind-19', phase: 'review', title: 'Freeze and sign', description: 'Freeze all documents, collect electronic signatures', ctdSection: undefined, requiredArtifacts: [], commands: ['/freeze', '/sign'], roles: ['ra_lead', 'ceo'], depends: ['ind-16', 'ind-17'], criticalPath: true },
        { id: 'ind-20', phase: 'review', title: 'Submit', description: 'Submit IND package to FDA', ctdSection: undefined, requiredArtifacts: ['submission_package'], commands: ['/submit'], roles: ['ra_lead'], depends: ['ind-19'], criticalPath: true },
      ],
    },
  ],
};

// ─── 510(k) Workflow ─────────────────────────────────────────────────────────

const FIVETEN_K_WORKFLOW: SubmissionWorkflow = {
  type: '510k',
  name: '510(k) Premarket Notification',
  agency: 'FDA',
  phases: [
    {
      name: 'Predicate & Strategy',
      description: 'Identify predicate device and determine substantial equivalence strategy',
      steps: [
        { id: '510k-1', phase: 'strategy', title: 'Predicate device search', description: 'Identify 1-3 predicate devices with product codes', ctdSection: undefined, requiredArtifacts: ['predicate_analysis'], commands: ['/precedent', '/device'], roles: ['ra_lead'], depends: [], criticalPath: true },
        { id: '510k-2', phase: 'strategy', title: 'Substantial equivalence argument', description: 'Define SE strategy — comparison table of tech characteristics', ctdSection: undefined, requiredArtifacts: ['se_comparison'], commands: ['/strategy'], roles: ['ra_lead'], depends: ['510k-1'], criticalPath: true },
      ],
    },
    {
      name: '510(k) Sections',
      description: 'Draft all required 510(k) sections',
      steps: [
        { id: '510k-3', phase: 'drafting', title: 'Device description', description: 'Intended use, indications, technical characteristics, materials', ctdSection: undefined, requiredArtifacts: ['device_description'], commands: ['/draft', '/device'], roles: ['ra_lead'], depends: ['510k-2'], criticalPath: true },
        { id: '510k-4', phase: 'drafting', title: 'SE comparison', description: 'Side-by-side comparison table vs predicate device', ctdSection: undefined, requiredArtifacts: ['se_table'], commands: ['/draft'], roles: ['ra_lead'], depends: ['510k-1'], criticalPath: true },
        { id: '510k-5', phase: 'drafting', title: 'Performance data', description: 'Bench testing, biocompatibility, clinical data (if required)', ctdSection: undefined, requiredArtifacts: ['performance_data'], commands: ['/draft', '/claims'], roles: ['ra_lead', 'clinical_lead'], depends: ['510k-3'], criticalPath: true },
        { id: '510k-6', phase: 'drafting', title: 'Biocompatibility', description: 'ISO 10993 biological evaluation or exemption justification', ctdSection: undefined, requiredArtifacts: ['biocompat_report'], commands: ['/draft'], roles: ['ra_lead'], depends: [], criticalPath: false },
        { id: '510k-7', phase: 'drafting', title: 'Labeling', description: 'Draft labeling including IFU, package insert, labels', ctdSection: undefined, requiredArtifacts: ['labeling'], commands: ['/draft'], roles: ['ra_lead', 'medical_writer'], depends: ['510k-3'], criticalPath: true },
        { id: '510k-8', phase: 'drafting', title: 'Software documentation', description: 'Software level of concern, V&V, cybersecurity (if applicable)', ctdSection: undefined, requiredArtifacts: ['software_docs'], commands: ['/draft'], roles: ['ra_lead'], depends: [], criticalPath: false },
      ],
    },
    {
      name: 'Review & Submit',
      description: 'Final quality checks and submission',
      steps: [
        { id: '510k-9', phase: 'review', title: 'Full submission preflight', description: 'Check completeness per FDA 510(k) checklist', ctdSection: undefined, requiredArtifacts: ['preflight_report'], commands: ['/preflight', '/assess', '/checklist'], roles: ['ra_lead'], depends: ['510k-3', '510k-4', '510k-5', '510k-7'], criticalPath: true },
        { id: '510k-10', phase: 'review', title: 'Risk assessment & deficiency prep', description: 'Anticipate AI letter and prepare responses', ctdSection: undefined, requiredArtifacts: ['risk_memo', 'reviewer_brief'], commands: ['/risk', '/memo', '/brief'], roles: ['ra_lead'], depends: ['510k-9'], criticalPath: true },
        { id: '510k-11', phase: 'review', title: 'Submit', description: 'Submit 510(k) to FDA', ctdSection: undefined, requiredArtifacts: ['submission_package'], commands: ['/freeze', '/sign', '/submit'], roles: ['ra_lead'], depends: ['510k-10'], criticalPath: true },
      ],
    },
  ],
};

// ─── Workflow Registry ───────────────────────────────────────────────────────

// ─── NDA Workflow ─────────────────────────────────────────────────────────────

const NDA_WORKFLOW: SubmissionWorkflow = {
  type: 'nda',
  name: 'New Drug Application',
  agency: 'FDA',
  phases: [
    {
      name: 'Pre-NDA Planning',
      description: 'Strategy, Type A/B meetings, submission plan',
      steps: [
        { id: 'nda-1', phase: 'planning', title: 'Pre-NDA meeting request', description: 'Type B meeting with FDA to align on NDA content and format', ctdSection: undefined, requiredArtifacts: ['meeting_request'], commands: ['/strategy'], roles: ['ra_lead', 'ceo'], depends: [], criticalPath: true },
        { id: 'nda-2', phase: 'planning', title: 'NDA submission plan', description: 'Define modules, rolling submission strategy, PDUFA date targets', ctdSection: undefined, requiredArtifacts: ['submission_plan'], commands: ['/strategy', '/workflow'], roles: ['ra_lead'], depends: ['nda-1'], criticalPath: true },
      ],
    },
    {
      name: 'Module 2 — CTD Summaries',
      description: 'All CTD overview and summary documents',
      steps: [
        { id: 'nda-3', phase: 'module-2', title: 'Quality Overall Summary (2.3)', description: 'Complete CMC summary for commercial product', ctdSection: '2.3', requiredArtifacts: ['quality_overall_summary'], commands: ['/draft 2.3', '/cmc'], roles: ['cmc_lead'], depends: [], criticalPath: true },
        { id: 'nda-4', phase: 'module-2', title: 'Nonclinical Overview (2.4)', description: 'Integrated nonclinical evaluation with full tox package', ctdSection: '2.4', requiredArtifacts: ['nonclinical_overview'], commands: ['/draft 2.4'], roles: ['clinical_lead'], depends: [], criticalPath: true },
        { id: 'nda-5', phase: 'module-2', title: 'Clinical Overview (2.5)', description: 'Integrated benefit-risk assessment across all clinical studies', ctdSection: '2.5', requiredArtifacts: ['clinical_overview'], commands: ['/draft 2.5'], roles: ['medical_writer'], depends: [], criticalPath: true },
        { id: 'nda-6', phase: 'module-2', title: 'Nonclinical Summaries (2.6)', description: 'Detailed pharmacology, PK, toxicology summaries', ctdSection: '2.6', requiredArtifacts: ['nonclinical_summaries'], commands: ['/draft 2.6'], roles: ['clinical_lead'], depends: ['nda-4'], criticalPath: true },
        { id: 'nda-7', phase: 'module-2', title: 'Clinical Summary (2.7)', description: 'Biopharm, clinical efficacy, clinical safety, synopses', ctdSection: '2.7', requiredArtifacts: ['clinical_summary'], commands: ['/draft 2.7', '/safety'], roles: ['medical_writer'], depends: ['nda-5'], criticalPath: true },
      ],
    },
    {
      name: 'Module 3 — Quality',
      description: 'Full commercial CMC package',
      steps: [
        { id: 'nda-8', phase: 'module-3', title: 'Drug Substance (3.2.S)', description: 'Full commercial DS documentation', ctdSection: '3.2.S', requiredArtifacts: ['drug_substance'], commands: ['/draft 3.2.S', '/cmc'], roles: ['cmc_lead'], depends: [], criticalPath: true },
        { id: 'nda-9', phase: 'module-3', title: 'Drug Product (3.2.P)', description: 'Full commercial DP documentation', ctdSection: '3.2.P', requiredArtifacts: ['drug_product'], commands: ['/draft 3.2.P', '/cmc'], roles: ['cmc_lead'], depends: ['nda-8'], criticalPath: true },
      ],
    },
    {
      name: 'Module 5 — Clinical Studies',
      description: 'All clinical study reports and analyses',
      steps: [
        { id: 'nda-10', phase: 'module-5', title: 'Pivotal CSR(s)', description: 'ICH E3 clinical study reports for pivotal trials', ctdSection: '5.3.5', requiredArtifacts: ['pivotal_csr'], commands: ['/csr', '/draft'], roles: ['medical_writer', 'clinical_lead'], depends: [], criticalPath: true },
        { id: 'nda-11', phase: 'module-5', title: 'Integrated Summary of Safety (ISS)', description: 'Pooled safety analysis across all studies', ctdSection: '5.3.5.3', requiredArtifacts: ['iss'], commands: ['/safety', '/draft'], roles: ['medical_writer'], depends: ['nda-10'], criticalPath: true },
        { id: 'nda-12', phase: 'module-5', title: 'Integrated Summary of Efficacy (ISE)', description: 'Pooled efficacy analysis across pivotal studies', ctdSection: '5.3.5.3', requiredArtifacts: ['ise'], commands: ['/draft', '/claims'], roles: ['medical_writer'], depends: ['nda-10'], criticalPath: true },
      ],
    },
    {
      name: 'Labeling & Advisory Committee',
      description: 'USPI, Medication Guide, AdCom preparation',
      steps: [
        { id: 'nda-13', phase: 'labeling', title: 'USPI draft', description: 'Prescribing information per FDA Physician Labeling Rule', ctdSection: '1.14', requiredArtifacts: ['uspi'], commands: ['/draft'], roles: ['medical_writer', 'ra_lead'], depends: ['nda-7'], criticalPath: true },
        { id: 'nda-14', phase: 'labeling', title: 'AdCom preparation', description: 'Advisory committee briefing document and presentation', ctdSection: undefined, requiredArtifacts: ['adcom_briefing'], commands: ['/brief', '/simulate'], roles: ['ra_lead', 'medical_writer', 'clinical_lead'], depends: ['nda-7'], criticalPath: false },
      ],
    },
    {
      name: 'Pre-Submission & Filing',
      description: 'Final QC, preflight, submission',
      steps: [
        { id: 'nda-15', phase: 'filing', title: 'Full dossier preflight', description: 'Complete NDA readiness check across all modules', ctdSection: undefined, requiredArtifacts: ['preflight_report'], commands: ['/preflight', '/assess'], roles: ['ra_lead'], depends: ['nda-3', 'nda-5', 'nda-8', 'nda-10'], criticalPath: true },
        { id: 'nda-16', phase: 'filing', title: 'RTF risk assessment', description: 'Refuse-to-file risk analysis and mitigation', ctdSection: undefined, requiredArtifacts: ['risk_memo'], commands: ['/risk', '/memo', '/deficiencies'], roles: ['ra_lead'], depends: ['nda-15'], criticalPath: true },
        { id: 'nda-17', phase: 'filing', title: 'Freeze, sign, submit', description: 'Freeze documents, collect e-signatures, submit NDA', ctdSection: undefined, requiredArtifacts: ['submission_package'], commands: ['/freeze', '/sign', '/submit'], roles: ['ra_lead', 'ceo'], depends: ['nda-16'], criticalPath: true },
      ],
    },
  ],
};

// ─── BLA Workflow ─────────────────────────────────────────────────────────────

const BLA_WORKFLOW: SubmissionWorkflow = {
  type: 'bla',
  name: 'Biologics License Application',
  agency: 'FDA',
  phases: [
    {
      name: 'BLA Strategy',
      description: 'BLA-specific strategy and planning',
      steps: [
        { id: 'bla-1', phase: 'strategy', title: 'BLA submission strategy', description: 'Biologics-specific pathway, biosimilar vs novel, accelerated pathways', ctdSection: undefined, requiredArtifacts: ['strategy_note'], commands: ['/strategy'], roles: ['ra_lead', 'ceo'], depends: [], criticalPath: true },
      ],
    },
    {
      name: 'Module 2 — CTD Summaries',
      description: 'CTD overview documents with biologics-specific content',
      steps: [
        { id: 'bla-2', phase: 'module-2', title: 'Quality Overall Summary (2.3)', description: 'Biologics CMC — cell line, fermentation, purification, characterization', ctdSection: '2.3', requiredArtifacts: ['quality_overall_summary'], commands: ['/draft 2.3', '/cmc'], roles: ['cmc_lead'], depends: [], criticalPath: true },
        { id: 'bla-3', phase: 'module-2', title: 'Clinical Overview (2.5)', description: 'Integrated clinical benefit-risk with immunogenicity assessment', ctdSection: '2.5', requiredArtifacts: ['clinical_overview'], commands: ['/draft 2.5'], roles: ['medical_writer'], depends: [], criticalPath: true },
        { id: 'bla-4', phase: 'module-2', title: 'Clinical Summary (2.7)', description: 'Efficacy, safety, immunogenicity summaries', ctdSection: '2.7', requiredArtifacts: ['clinical_summary'], commands: ['/draft 2.7', '/safety'], roles: ['medical_writer'], depends: ['bla-3'], criticalPath: true },
      ],
    },
    {
      name: 'Module 3 — Quality (Biologics)',
      description: 'Biologics-specific CMC including cell line, manufacturing, comparability',
      steps: [
        { id: 'bla-5', phase: 'module-3', title: 'Drug Substance (3.2.S) — Biologics', description: 'Cell substrate, manufacturing, characterization (ICH Q5 series)', ctdSection: '3.2.S', requiredArtifacts: ['drug_substance'], commands: ['/draft 3.2.S', '/cmc'], roles: ['cmc_lead'], depends: [], criticalPath: true },
        { id: 'bla-6', phase: 'module-3', title: 'Drug Product (3.2.P)', description: 'Formulation, fill-finish, container closure, stability', ctdSection: '3.2.P', requiredArtifacts: ['drug_product'], commands: ['/draft 3.2.P', '/cmc'], roles: ['cmc_lead'], depends: ['bla-5'], criticalPath: true },
      ],
    },
    {
      name: 'Module 5 & Filing',
      description: 'Clinical studies and submission',
      steps: [
        { id: 'bla-7', phase: 'module-5', title: 'Pivotal CSRs', description: 'ICH E3 reports including immunogenicity data', ctdSection: '5.3.5', requiredArtifacts: ['pivotal_csr'], commands: ['/csr', '/draft'], roles: ['medical_writer'], depends: [], criticalPath: true },
        { id: 'bla-8', phase: 'filing', title: 'Full preflight + submit', description: 'BLA readiness check, risk assessment, submission', ctdSection: undefined, requiredArtifacts: ['preflight_report', 'risk_memo', 'submission_package'], commands: ['/assess', '/risk', '/freeze', '/sign', '/submit'], roles: ['ra_lead'], depends: ['bla-2', 'bla-3', 'bla-5', 'bla-7'], criticalPath: true },
      ],
    },
  ],
};

// ─── MAA Workflow (EU) ───────────────────────────────────────────────────────

const MAA_WORKFLOW: SubmissionWorkflow = {
  type: 'maa',
  name: 'Marketing Authorisation Application',
  agency: 'EMA',
  phases: [
    {
      name: 'Pre-Submission (EMA)',
      description: 'Scientific advice, PRIME designation, submission planning',
      steps: [
        { id: 'maa-1', phase: 'pre-sub', title: 'Regulatory strategy (EU)', description: 'Centralised vs decentralised, PRIME eligibility, rapporteur preferences', ctdSection: undefined, requiredArtifacts: ['strategy_note'], commands: ['/strategy'], roles: ['ra_lead'], depends: [], criticalPath: true },
        { id: 'maa-2', phase: 'pre-sub', title: 'Scientific advice request', description: 'EMA scientific advice on development plan', ctdSection: undefined, requiredArtifacts: ['scientific_advice'], commands: ['/draft'], roles: ['ra_lead'], depends: ['maa-1'], criticalPath: false },
      ],
    },
    {
      name: 'Module 1 — EU Administrative',
      description: 'EU-specific Module 1 with SmPC, PL, environmental risk',
      steps: [
        { id: 'maa-3', phase: 'module-1', title: 'Application form', description: 'EMA application form and cover letter', ctdSection: '1.2', requiredArtifacts: ['application_form'], commands: ['/draft'], roles: ['ra_lead'], depends: [], criticalPath: true },
        { id: 'maa-4', phase: 'module-1', title: 'SmPC draft', description: 'Summary of Product Characteristics per QRD template', ctdSection: '1.3.1', requiredArtifacts: ['smpc'], commands: ['/draft'], roles: ['medical_writer', 'ra_lead'], depends: [], criticalPath: true },
        { id: 'maa-5', phase: 'module-1', title: 'Package Leaflet', description: 'Patient-facing PL per QRD template + readability testing', ctdSection: '1.3.1', requiredArtifacts: ['package_leaflet'], commands: ['/draft'], roles: ['medical_writer'], depends: ['maa-4'], criticalPath: true },
        { id: 'maa-6', phase: 'module-1', title: 'Risk Management Plan', description: 'EU RMP per EMA GVP Module V', ctdSection: '1.8.2', requiredArtifacts: ['rmp'], commands: ['/safety', '/draft'], roles: ['ra_lead'], depends: [], criticalPath: true },
      ],
    },
    {
      name: 'Modules 2-5 (Same as IND/NDA)',
      description: 'CTD Modules 2-5 — same ICH structure, EU-specific content',
      steps: [
        { id: 'maa-7', phase: 'modules', title: 'CTD Modules 2-5', description: 'Quality, nonclinical, clinical modules per ICH M4 with EU-specific requirements', ctdSection: '2.3', requiredArtifacts: ['quality_overall_summary', 'clinical_overview', 'clinical_summary'], commands: ['/draft', '/cmc', '/safety'], roles: ['cmc_lead', 'medical_writer', 'clinical_lead'], depends: [], criticalPath: true },
      ],
    },
    {
      name: 'Filing',
      description: 'Validation, assessment, submission',
      steps: [
        { id: 'maa-8', phase: 'filing', title: 'Full MAA preflight', description: 'EU-specific readiness check including RMP, SmPC, PL', ctdSection: undefined, requiredArtifacts: ['preflight_report'], commands: ['/assess', '/preflight'], roles: ['ra_lead'], depends: ['maa-3', 'maa-4', 'maa-6', 'maa-7'], criticalPath: true },
        { id: 'maa-9', phase: 'filing', title: 'Submit MAA', description: 'Submit to EMA via CESP/eSubmission gateway', ctdSection: undefined, requiredArtifacts: ['submission_package'], commands: ['/freeze', '/sign', '/submit'], roles: ['ra_lead'], depends: ['maa-8'], criticalPath: true },
      ],
    },
  ],
};

// ─── PMA Workflow ─────────────────────────────────────────────────────────────

const PMA_WORKFLOW: SubmissionWorkflow = {
  type: 'pma',
  name: 'Premarket Approval',
  agency: 'FDA',
  phases: [
    {
      name: 'PMA Strategy',
      description: 'Device classification, clinical data requirements',
      steps: [
        { id: 'pma-1', phase: 'strategy', title: 'PMA strategy & classification', description: 'Confirm Class III, identify clinical data needs, modular PMA option', ctdSection: undefined, requiredArtifacts: ['strategy_note'], commands: ['/strategy', '/device'], roles: ['ra_lead'], depends: [], criticalPath: true },
        { id: 'pma-2', phase: 'strategy', title: 'Pre-submission meeting', description: 'Q-Sub with FDA CDRH to align on clinical requirements', ctdSection: undefined, requiredArtifacts: ['meeting_request'], commands: ['/draft'], roles: ['ra_lead'], depends: ['pma-1'], criticalPath: true },
      ],
    },
    {
      name: 'PMA Content',
      description: 'Device description, clinical data, manufacturing',
      steps: [
        { id: 'pma-3', phase: 'content', title: 'Device description & IFU', description: 'Detailed device description, intended use, indications', ctdSection: undefined, requiredArtifacts: ['device_description'], commands: ['/draft', '/device'], roles: ['ra_lead'], depends: ['pma-1'], criticalPath: true },
        { id: 'pma-4', phase: 'content', title: 'Clinical study data', description: 'Pivotal clinical study report per IDE protocol', ctdSection: undefined, requiredArtifacts: ['clinical_study'], commands: ['/csr', '/sap', '/safety'], roles: ['clinical_lead', 'medical_writer'], depends: [], criticalPath: true },
        { id: 'pma-5', phase: 'content', title: 'Manufacturing (QSR)', description: 'Manufacturing per 21 CFR 820 Quality System Regulation', ctdSection: undefined, requiredArtifacts: ['manufacturing_info'], commands: ['/cmc', '/draft'], roles: ['cmc_lead'], depends: [], criticalPath: true },
        { id: 'pma-6', phase: 'content', title: 'Nonclinical testing', description: 'Bench testing, biocompatibility, software V&V, sterilization', ctdSection: undefined, requiredArtifacts: ['nonclinical_testing'], commands: ['/draft'], roles: ['ra_lead'], depends: [], criticalPath: true },
      ],
    },
    {
      name: 'Review & Submit',
      description: 'Panel preparation and submission',
      steps: [
        { id: 'pma-7', phase: 'review', title: 'Advisory panel preparation', description: 'Prepare for potential FDA advisory committee review', ctdSection: undefined, requiredArtifacts: ['panel_briefing'], commands: ['/brief', '/simulate'], roles: ['ra_lead', 'clinical_lead'], depends: ['pma-4'], criticalPath: false },
        { id: 'pma-8', phase: 'review', title: 'PMA preflight & submit', description: 'Full readiness check and submission', ctdSection: undefined, requiredArtifacts: ['preflight_report', 'submission_package'], commands: ['/assess', '/freeze', '/sign', '/submit'], roles: ['ra_lead'], depends: ['pma-3', 'pma-4', 'pma-5', 'pma-6'], criticalPath: true },
      ],
    },
  ],
};

// ─── De Novo Workflow ────────────────────────────────────────────────────────

const DE_NOVO_WORKFLOW: SubmissionWorkflow = {
  type: 'de_novo',
  name: 'De Novo Classification Request',
  agency: 'FDA',
  phases: [
    {
      name: 'De Novo Strategy',
      description: 'Confirm no predicate, define classification, pre-sub',
      steps: [
        { id: 'dn-1', phase: 'strategy', title: 'Classification rationale', description: 'Document why 510(k) is not appropriate — novel device, no predicate', ctdSection: undefined, requiredArtifacts: ['classification_rationale'], commands: ['/device', '/strategy', '/precedent'], roles: ['ra_lead'], depends: [], criticalPath: true },
        { id: 'dn-2', phase: 'strategy', title: 'Pre-submission (Q-Sub)', description: 'FDA feedback on De Novo classification and content', ctdSection: undefined, requiredArtifacts: ['meeting_request'], commands: ['/draft'], roles: ['ra_lead'], depends: ['dn-1'], criticalPath: true },
      ],
    },
    {
      name: 'De Novo Content',
      description: 'Risk-based classification, special controls, performance data',
      steps: [
        { id: 'dn-3', phase: 'content', title: 'Risk assessment & special controls', description: 'Identify risks, propose special controls, risk mitigation measures', ctdSection: undefined, requiredArtifacts: ['risk_assessment', 'special_controls'], commands: ['/risk', '/draft'], roles: ['ra_lead'], depends: ['dn-1'], criticalPath: true },
        { id: 'dn-4', phase: 'content', title: 'Device description & testing', description: 'Device description, bench testing, performance data', ctdSection: undefined, requiredArtifacts: ['device_description', 'performance_data'], commands: ['/draft', '/device'], roles: ['ra_lead'], depends: ['dn-3'], criticalPath: true },
        { id: 'dn-5', phase: 'content', title: 'Clinical data (if required)', description: 'Clinical evidence supporting safety and effectiveness', ctdSection: undefined, requiredArtifacts: ['clinical_study'], commands: ['/csr'], roles: ['clinical_lead'], depends: [], criticalPath: false },
      ],
    },
    {
      name: 'Filing',
      description: 'Submission and FDA review',
      steps: [
        { id: 'dn-6', phase: 'filing', title: 'De Novo preflight & submit', description: 'Completeness check, risk assessment review, submission', ctdSection: undefined, requiredArtifacts: ['preflight_report', 'submission_package'], commands: ['/assess', '/freeze', '/sign', '/submit'], roles: ['ra_lead'], depends: ['dn-3', 'dn-4'], criticalPath: true },
      ],
    },
  ],
};

// ─── CER Workflow (EU MDR) ───────────────────────────────────────────────────

const CER_WORKFLOW: SubmissionWorkflow = {
  type: 'cer',
  name: 'Clinical Evaluation Report (EU MDR)',
  agency: 'EMA/Notified Body',
  phases: [
    {
      name: 'CER Planning',
      description: 'Scope, equivalence claim, literature search protocol',
      steps: [
        { id: 'cer-1', phase: 'planning', title: 'CER scope & plan', description: 'Define scope, MEDDEV 2.7/1 Rev 4 compliance, equivalence strategy', ctdSection: undefined, requiredArtifacts: ['cer_plan'], commands: ['/strategy', '/device'], roles: ['ra_lead'], depends: [], criticalPath: true },
        { id: 'cer-2', phase: 'planning', title: 'Literature search protocol', description: 'Systematic literature review protocol per MEDDEV 2.7/1', ctdSection: undefined, requiredArtifacts: ['search_protocol'], commands: ['/draft'], roles: ['ra_lead', 'clinical_lead'], depends: ['cer-1'], criticalPath: true },
      ],
    },
    {
      name: 'CER Content',
      description: 'Clinical data appraisal, analysis, and report',
      steps: [
        { id: 'cer-3', phase: 'content', title: 'Literature search & appraisal', description: 'Execute search, screen, appraise clinical data', ctdSection: undefined, requiredArtifacts: ['literature_appraisal'], commands: ['/claims', '/draft'], roles: ['clinical_lead'], depends: ['cer-2'], criticalPath: true },
        { id: 'cer-4', phase: 'content', title: 'Clinical data analysis', description: 'Analyze safety, performance, benefit-risk per EU MDR Annex XIV', ctdSection: undefined, requiredArtifacts: ['clinical_analysis'], commands: ['/safety', '/draft'], roles: ['clinical_lead', 'medical_writer'], depends: ['cer-3'], criticalPath: true },
        { id: 'cer-5', phase: 'content', title: 'CER report', description: 'Full Clinical Evaluation Report per MEDDEV 2.7/1 Rev 4', ctdSection: undefined, requiredArtifacts: ['cer_report'], commands: ['/draft', '/audit'], roles: ['medical_writer', 'ra_lead'], depends: ['cer-4'], criticalPath: true },
        { id: 'cer-6', phase: 'content', title: 'PMCF plan', description: 'Post-Market Clinical Follow-up plan per EU MDR Article 61', ctdSection: undefined, requiredArtifacts: ['pmcf_plan'], commands: ['/draft'], roles: ['ra_lead', 'clinical_lead'], depends: ['cer-5'], criticalPath: true },
      ],
    },
    {
      name: 'Review & Filing',
      description: 'CER review and submission to Notified Body',
      steps: [
        { id: 'cer-7', phase: 'filing', title: 'CER audit & submit', description: 'Internal audit, compliance check, submission to Notified Body', ctdSection: undefined, requiredArtifacts: ['preflight_report', 'submission_package'], commands: ['/audit', '/assess', '/freeze', '/sign', '/submit'], roles: ['ra_lead'], depends: ['cer-5', 'cer-6'], criticalPath: true },
      ],
    },
  ],
};

const WORKFLOW_REGISTRY: Record<string, SubmissionWorkflow> = {
  ind: IND_WORKFLOW,
  '510k': FIVETEN_K_WORKFLOW,
  nda: NDA_WORKFLOW,
  bla: BLA_WORKFLOW,
  maa: MAA_WORKFLOW,
  pma: PMA_WORKFLOW,
  de_novo: DE_NOVO_WORKFLOW,
  cer: CER_WORKFLOW,
};

// ─── Workflow Status Computation ─────────────────────────────────────────────

export interface WorkflowStatus {
  type: string;
  name: string;
  totalSteps: number;
  completedSteps: number;
  currentPhase: string;
  nextStep: WorkflowStep | null;
  criticalBlockers: string[];
  progressPercent: number;
  phases: Array<{
    name: string;
    steps: Array<{ id: string; title: string; complete: boolean; critical: boolean }>;
  }>;
}

export async function getWorkflowStatus(
  projectId: number | string,
  submissionType: string,
  organizationId?: number,
): Promise<WorkflowStatus | null> {
  const workflow = WORKFLOW_REGISTRY[submissionType.toLowerCase()];
  if (!workflow) return null;

  // Check which artifacts exist for this project
  let existingArtifacts: string[] = [];
  try {
    const res = await pool.query(
      `SELECT DISTINCT type FROM concept2cure_artifacts WHERE project_id = $1 AND status != 'deleted'`,
      [projectId]
    );
    existingArtifacts = res.rows.map((r: any) => r.type);
  } catch { /* table might not exist */ }

  // Check which sections have content
  let populatedSections: string[] = [];
  try {
    const res = await pool.query(
      `SELECT DISTINCT ctd_section FROM concept2cure_artifacts WHERE project_id = $1 AND content IS NOT NULL AND LENGTH(content) > 100`,
      [projectId]
    );
    populatedSections = res.rows.map((r: any) => r.ctd_section).filter(Boolean);
  } catch { /* non-critical */ }

  const allSteps = workflow.phases.flatMap(p => p.steps);
  let completedCount = 0;
  let currentPhase = workflow.phases[0].name;
  let nextStep: WorkflowStep | null = null;
  const criticalBlockers: string[] = [];

  const phases = workflow.phases.map(phase => ({
    name: phase.name,
    steps: phase.steps.map(step => {
      const hasArtifacts = step.requiredArtifacts.length === 0 ||
        step.requiredArtifacts.some(a => existingArtifacts.includes(a));
      const hasSection = !step.ctdSection || populatedSections.includes(step.ctdSection);
      const complete = hasArtifacts || hasSection;

      if (complete) completedCount++;
      if (!complete && step.criticalPath) {
        criticalBlockers.push(step.title);
      }
      if (!complete && !nextStep) {
        nextStep = step;
        currentPhase = phase.name;
      }

      return { id: step.id, title: step.title, complete, critical: step.criticalPath };
    }),
  }));

  return {
    type: workflow.type,
    name: workflow.name,
    totalSteps: allSteps.length,
    completedSteps: completedCount,
    currentPhase,
    nextStep,
    criticalBlockers: criticalBlockers.slice(0, 5),
    progressPercent: Math.round((completedCount / allSteps.length) * 100),
    phases,
  };
}

/**
 * Build a workflow context block for AnA's system prompt.
 */
export async function buildWorkflowContext(
  projectId: number | string,
  submissionType: string,
  organizationId?: number,
): Promise<string> {
  const status = await getWorkflowStatus(projectId, submissionType, organizationId);
  if (!status) return '';

  const parts: string[] = [
    `## Submission Workflow: ${status.name}`,
    `**Progress:** ${status.completedSteps}/${status.totalSteps} steps (${status.progressPercent}%)`,
    `**Current Phase:** ${status.currentPhase}`,
  ];

  if (status.nextStep) {
    parts.push(`\n**Next Step:** ${status.nextStep.title}`);
    parts.push(`> ${status.nextStep.description}`);
    if (status.nextStep.commands.length > 0) {
      parts.push(`Suggested commands: ${status.nextStep.commands.join(', ')}`);
    }
    if (status.nextStep.roles.length > 0) {
      parts.push(`Responsible: ${status.nextStep.roles.join(', ')}`);
    }
  }

  if (status.criticalBlockers.length > 0) {
    parts.push(`\n**Critical Blockers (${status.criticalBlockers.length}):**`);
    for (const b of status.criticalBlockers) {
      parts.push(`- ${b}`);
    }
  }

  // Phase summary
  parts.push('\n**Phases:**');
  for (const phase of status.phases) {
    const done = phase.steps.filter(s => s.complete).length;
    const total = phase.steps.length;
    const icon = done === total ? 'DONE' : `${done}/${total}`;
    parts.push(`- ${phase.name}: ${icon}`);
  }

  parts.push('\nUse this workflow status to guide the user. Tell them what to do next, which commands to use, and flag blockers. Be directive.');

  return '\n\n' + parts.join('\n');
}

/**
 * Get the workflow definition for a submission type.
 */
export function getWorkflow(submissionType: string): SubmissionWorkflow | null {
  return WORKFLOW_REGISTRY[submissionType.toLowerCase()] || null;
}
