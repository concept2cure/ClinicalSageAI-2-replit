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

  const phase3 = buildPhase('phase3', 'Module 1 Administrative', 3, [
    { id: 'cover_letter', name: 'Draft cover letter', estimatedHours: 4, role: 'ra_lead' },
    { id: 'form_1571', name: 'Complete FDA Form 1571', estimatedHours: 4, role: 'ra_associate', critical: true },
    { id: 'intro_statement', name: 'Draft introductory statement', estimatedHours: 6, role: 'medical_writer' },
    { id: 'general_plan', name: 'Draft general investigational plan', estimatedHours: 6, role: 'medical_writer' },
    { id: 'toc', name: 'Compile table of contents', estimatedHours: 3, role: 'regulatory_ops' },
    { id: 'env_assessment', name: 'Environmental assessment check', estimatedHours: 2, role: 'ra_associate' },
  ], phase2.completeId);
  phases.push(phase3.phase);

  const phase4 = buildPhase('phase4', 'Module 2 Investigator’s Brochure', 4, [
    { id: 'ib_outline', name: 'Finalize IB outline', estimatedHours: 4, role: 'medical_writer' },
    { id: 'nonclinical_summary', name: 'Draft nonclinical summary', estimatedHours: 10, role: 'toxicologist', critical: true },
    { id: 'clinical_summary', name: 'Draft clinical summary', estimatedHours: 8, role: 'clinical_lead' },
    { id: 'pk_pd', name: 'Compile PK/PD data', estimatedHours: 8, role: 'clinical_pharmacology' },
    { id: 'ib_review', name: 'IB review and QC', estimatedHours: 6, role: 'qa_manager' },
    { id: 'ib_finalize', name: 'Finalize IB', estimatedHours: 4, role: 'medical_writer', critical: true },
  ], phase3.completeId);
  phases.push(phase4.phase);

  const phase5 = buildPhase('phase5', 'Module 3 Clinical Protocol', 5, [
    { id: 'protocol_outline', name: 'Draft protocol outline', estimatedHours: 6, role: 'clinical_lead' },
    { id: 'design', name: 'Define study design', estimatedHours: 8, role: 'clinical_lead', critical: true },
    { id: 'endpoints', name: 'Define endpoints', estimatedHours: 6, role: 'biostatistician' },
    { id: 'inclusion_exclusion', name: 'Define eligibility criteria', estimatedHours: 6, role: 'clinical_lead' },
    { id: 'safety_plan', name: 'Draft safety monitoring plan', estimatedHours: 6, role: 'medical_monitor' },
    { id: 'protocol_finalize', name: 'Finalize protocol', estimatedHours: 6, role: 'clinical_lead', critical: true },
  ], phase4.completeId);
  phases.push(phase5.phase);

  const phase6 = buildPhase('phase6', 'Module 4 CMC', 6, [
    { id: 'drug_substance', name: 'Draft drug substance section', estimatedHours: 10, role: 'cmc_lead', critical: true },
    { id: 'drug_product', name: 'Draft drug product section', estimatedHours: 10, role: 'cmc_lead' },
    { id: 'manufacturing', name: 'Describe manufacturing process', estimatedHours: 8, role: 'cmc_lead' },
    { id: 'control_strategy', name: 'Define control strategy', estimatedHours: 6, role: 'quality' },
    { id: 'stability', name: 'Compile stability data', estimatedHours: 8, role: 'cmc_lead' },
    { id: 'cmc_review', name: 'CMC review and finalize', estimatedHours: 6, role: 'qa_manager', critical: true },
  ], phase5.completeId);
  phases.push(phase6.phase);

  const phase7 = buildPhase('phase7', 'Module 5 Pharm/Tox', 7, [
    { id: 'pharm_summary', name: 'Draft pharmacology summary', estimatedHours: 8, role: 'toxicologist' },
    { id: 'tox_summary', name: 'Draft toxicology summary', estimatedHours: 10, role: 'toxicologist', critical: true },
    { id: 'study_reports', name: 'Compile study reports', estimatedHours: 8, role: 'toxicologist' },
    { id: 'integrated_summary', name: 'Integrated nonclinical summary', estimatedHours: 8, role: 'medical_writer' },
    { id: 'glp_compliance', name: 'Verify GLP compliance', estimatedHours: 4, role: 'qa_manager' },
    { id: 'module5_finalize', name: 'Finalize Module 5', estimatedHours: 4, role: 'toxicologist', critical: true },
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
