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

const WORKFLOW_REGISTRY: Record<string, SubmissionWorkflow> = {
  ind: IND_WORKFLOW,
  '510k': FIVETEN_K_WORKFLOW,
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
