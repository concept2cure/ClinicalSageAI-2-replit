type BaseTask = {
  id: string;
  name: string;
  estimatedHours: number;
  role?: string;
  critical?: boolean;
  description?: string;
};

type PyramidTask = BaseTask & {
  phaseId: string;
  dependencies: string[];
};

type PyramidPhase = {
  id: string;
  name: string;
  order: number;
  tasks: PyramidTask[];
};

type SubmissionPyramid = {
  type: 'IND';
  phases: PyramidPhase[];
  tasks: PyramidTask[];
};

function buildPhase(
  phaseId: string,
  name: string,
  order: number,
  baseTasks: BaseTask[],
  dependsOn?: string
): { phase: PyramidPhase; completeId: string } {
  const dependencies = dependsOn ? [dependsOn] : [];
  const tasks = baseTasks.map(task => ({
    ...task,
    id: `${phaseId}.${task.id}`,
    phaseId,
    dependencies,
  }));
  const completeId = `${phaseId}.complete`;
  const completionTask: PyramidTask = {
    id: completeId,
    name: `${name} Complete`,
    estimatedHours: 1,
    role: 'regulatory_ops',
    critical: true,
    phaseId,
    dependencies: tasks.map(task => task.id),
  };

  return {
    phase: { id: phaseId, name, order, tasks: [...tasks, completionTask] },
    completeId,
  };
}

export function buildIndPyramid(): SubmissionPyramid {
  const phases: PyramidPhase[] = [];

  const phase1 = buildPhase('phase1', 'Program Planning', 1, [
    { id: 'product_profile', name: 'Define product profile', estimatedHours: 6, role: 'ra_lead', critical: true },
    { id: 'ind_strategy', name: 'Draft IND strategy', estimatedHours: 8, role: 'ra_lead', critical: true },
    { id: 'pre_ind_plan', name: 'Plan Pre-IND meeting', estimatedHours: 6, role: 'project_manager' },
    { id: 'nonclinical_gap', name: 'Assess nonclinical gaps', estimatedHours: 8, role: 'toxicologist' },
    { id: 'clinical_outline', name: 'Outline clinical plan', estimatedHours: 6, role: 'clinical_lead' },
    { id: 'timeline', name: 'Create master timeline', estimatedHours: 4, role: 'project_manager' },
  ]);
  phases.push(phase1.phase);

  const phase2 = buildPhase('phase2', 'Pre-IND Engagement', 2, [
    { id: 'meeting_request', name: 'Submit Pre-IND meeting request', estimatedHours: 4, role: 'ra_lead' },
    { id: 'briefing_package', name: 'Prepare briefing package', estimatedHours: 10, role: 'medical_writer', critical: true },
    { id: 'questions', name: 'Finalize FDA questions', estimatedHours: 4, role: 'ra_lead' },
    { id: 'meeting_execution', name: 'Conduct Pre-IND meeting', estimatedHours: 4, role: 'ra_lead' },
    { id: 'meeting_minutes', name: 'Document meeting minutes', estimatedHours: 4, role: 'ra_lead' },
    { id: 'strategy_updates', name: 'Incorporate FDA feedback', estimatedHours: 6, role: 'ra_lead', critical: true },
  ], phase1.completeId);
  phases.push(phase2.phase);

  // NOTE (CTD correctness): phases 3-7 follow the ICH CTD module numbering and
  // mirror the canonical source of truth in
  // server/services/regulatory/registry/blueprints/usIndBlueprint.ts:
  //   Module 3 = Quality/CMC, Module 4 = Nonclinical, Module 5 = Clinical,
  //   Module 2 = CTD Summaries (built FROM modules 3/4/5), Module 1 = Administrative.
  // A prior version of this file mislabeled these modules; do not reintroduce
  // that mapping. Build order = dependency order (content modules -> summaries ->
  // administrative -> QA/submission).
  const phase3 = buildPhase('phase3', 'Module 3 — Quality/CMC', 3, [
    { id: 'drug_substance', name: 'Draft drug substance section (3.2.S)', estimatedHours: 10, role: 'cmc_lead', critical: true },
    { id: 'drug_product', name: 'Draft drug product section (3.2.P)', estimatedHours: 10, role: 'cmc_lead' },
    { id: 'manufacturing', name: 'Describe manufacturing process', estimatedHours: 8, role: 'cmc_lead' },
    { id: 'control_strategy', name: 'Define control strategy & specifications', estimatedHours: 6, role: 'quality' },
    { id: 'stability', name: 'Compile stability data', estimatedHours: 8, role: 'cmc_lead' },
    { id: 'cmc_review', name: 'CMC review and finalize', estimatedHours: 6, role: 'qa_manager', critical: true },
  ], phase2.completeId);
  phases.push(phase3.phase);

  const phase4 = buildPhase('phase4', 'Module 4 — Nonclinical', 4, [
    { id: 'pharmacology', name: 'Draft pharmacology study reports (4.2.1)', estimatedHours: 8, role: 'nonclinical_lead' },
    { id: 'pk_studies', name: 'Draft pharmacokinetic study reports (4.2.2)', estimatedHours: 8, role: 'nonclinical_lead' },
    { id: 'toxicology', name: 'Draft toxicology study reports (4.2.3)', estimatedHours: 10, role: 'toxicologist', critical: true },
    { id: 'study_reports', name: 'Compile/place nonclinical study reports', estimatedHours: 8, role: 'nonclinical_lead' },
    { id: 'glp_compliance', name: 'Verify GLP compliance & statements', estimatedHours: 4, role: 'qa_manager' },
    { id: 'nonclinical_finalize', name: 'Finalize Module 4', estimatedHours: 4, role: 'nonclinical_lead', critical: true },
  ], phase3.completeId);
  phases.push(phase4.phase);

  const phase5 = buildPhase('phase5', 'Module 5 — Clinical', 5, [
    { id: 'protocol_outline', name: 'Draft clinical protocol outline', estimatedHours: 6, role: 'clinical_lead' },
    { id: 'design', name: 'Define study design & estimands', estimatedHours: 8, role: 'clinical_lead', critical: true },
    { id: 'endpoints', name: 'Define endpoints', estimatedHours: 6, role: 'biostatistician' },
    { id: 'inclusion_exclusion', name: 'Define eligibility criteria', estimatedHours: 6, role: 'clinical_lead' },
    { id: 'safety_plan', name: 'Draft safety monitoring plan', estimatedHours: 6, role: 'medical_monitor' },
    { id: 'investigator_brochure', name: 'Author Investigator’s Brochure', estimatedHours: 16, role: 'medical_writer', critical: true },
    { id: 'protocol_finalize', name: 'Finalize protocol (5.3.5)', estimatedHours: 6, role: 'clinical_lead', critical: true },
  ], phase4.completeId);
  phases.push(phase5.phase);

  const phase6 = buildPhase('phase6', 'Module 2 — CTD Summaries', 6, [
    { id: 'qos', name: 'Quality Overall Summary (2.3)', estimatedHours: 10, role: 'cmc_lead', critical: true },
    { id: 'nonclinical_overview', name: 'Nonclinical Overview (2.4)', estimatedHours: 8, role: 'nonclinical_lead', critical: true },
    { id: 'nonclinical_summaries', name: 'Nonclinical Written/Tabulated Summaries (2.6)', estimatedHours: 10, role: 'medical_writer' },
    { id: 'clinical_overview', name: 'Clinical Overview (2.5)', estimatedHours: 8, role: 'clinical_lead', critical: true },
    { id: 'clinical_summary', name: 'Clinical Summary (2.7)', estimatedHours: 10, role: 'medical_writer' },
    { id: 'summaries_qc', name: 'Summaries cross-consistency QC', estimatedHours: 6, role: 'qa_manager', critical: true },
  ], phase5.completeId);
  phases.push(phase6.phase);

  const phase7 = buildPhase('phase7', 'Module 1 — Administrative', 7, [
    { id: 'cover_letter', name: 'Draft cover letter', estimatedHours: 4, role: 'ra_lead' },
    { id: 'form_1571', name: 'Complete FDA Form 1571', estimatedHours: 4, role: 'ra_associate', critical: true },
    { id: 'form_1572', name: 'Complete FDA Form 1572 (per investigator)', estimatedHours: 4, role: 'ra_associate', critical: true },
    { id: 'form_3674', name: 'Complete FDA Form 3674 (ClinicalTrials.gov cert)', estimatedHours: 2, role: 'ra_associate' },
    { id: 'general_plan', name: 'Draft introductory statement & general investigational plan', estimatedHours: 6, role: 'medical_writer' },
    { id: 'toc', name: 'Compile module 1 table of contents', estimatedHours: 3, role: 'regulatory_ops' },
    { id: 'env_assessment', name: 'Environmental assessment / categorical exclusion', estimatedHours: 2, role: 'ra_associate' },
  ], phase6.completeId);
  phases.push(phase7.phase);

  const phase8 = buildPhase('phase8', 'QA Review & Submission', 8, [
    { id: 'qc_check', name: 'QC full IND package', estimatedHours: 8, role: 'qa_manager', critical: true },
    { id: 'signatures', name: 'Collect signatures', estimatedHours: 4, role: 'ra_lead' },
    { id: 'ectd_compile', name: 'Compile eCTD', estimatedHours: 6, role: 'regulatory_ops' },
    { id: 'ectd_validate', name: 'Validate eCTD', estimatedHours: 4, role: 'regulatory_ops', critical: true },
    { id: 'submit', name: 'Submit IND', estimatedHours: 2, role: 'regulatory_ops', critical: true },
    { id: 'archive', name: 'Archive submission package', estimatedHours: 3, role: 'regulatory_ops' },
  ], phase7.completeId);
  phases.push(phase8.phase);

  const tasks = phases.flatMap(phase => phase.tasks);
  return { type: 'IND', phases, tasks };
}
