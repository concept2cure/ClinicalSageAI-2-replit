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
  type: 'MAA';
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

export function buildMaaPyramid(): SubmissionPyramid {
  const phases: PyramidPhase[] = [];

  const phase1 = buildPhase('phase1', 'MAA Planning', 1, [
    { id: 'reg_strategy', name: 'Define EU regulatory strategy', estimatedHours: 8, role: 'ra_lead', critical: true },
    { id: 'rms_selection', name: 'Select RMS/CMS strategy', estimatedHours: 6, role: 'ra_lead' },
    { id: 'timeline', name: 'Create submission timeline', estimatedHours: 6, role: 'project_manager' },
    { id: 'eudralink', name: 'Plan eSubmission gateway setup', estimatedHours: 6, role: 'regulatory_ops' },
    { id: 'pbrer_plan', name: 'PBRER planning', estimatedHours: 6, role: 'safety' },
    { id: 'pvp_plan', name: 'Pharmacovigilance plan', estimatedHours: 6, role: 'safety', critical: true },
  ]);
  phases.push(phase1.phase);

  const phase2 = buildPhase('phase2', 'Module 1 EU Administrative', 2, [
    { id: 'application_form', name: 'EU application form', estimatedHours: 6, role: 'ra_associate', critical: true },
    { id: 'annexes', name: 'Prepare Annexes', estimatedHours: 6, role: 'regulatory_ops' },
    { id: 'product_info', name: 'Product information (SmPC/PL)', estimatedHours: 10, role: 'medical_writer', critical: true },
    { id: 'risk_management', name: 'Risk management plan', estimatedHours: 8, role: 'safety' },
    { id: 'pip', name: 'PIP compliance check', estimatedHours: 6, role: 'ra_lead' },
    { id: 'pricing', name: 'Pricing/HTA considerations', estimatedHours: 4, role: 'market_access' },
  ], phase1.completeId);
  phases.push(phase2.phase);

  const phase3 = buildPhase('phase3', 'Module 2 Summaries', 3, [
    { id: 'ctd_intro', name: 'CTD introduction', estimatedHours: 6, role: 'medical_writer' },
    { id: 'qos', name: 'Quality overall summary', estimatedHours: 10, role: 'cmc_lead', critical: true },
    { id: 'nonclinical_overview', name: 'Nonclinical overview', estimatedHours: 8, role: 'toxicologist' },
    { id: 'clinical_overview', name: 'Clinical overview', estimatedHours: 10, role: 'clinical_lead', critical: true },
    { id: 'clinical_summary', name: 'Clinical summary', estimatedHours: 10, role: 'medical_writer' },
    { id: 'summary_qc', name: 'Module 2 QC review', estimatedHours: 6, role: 'qa_manager' },
  ], phase2.completeId);
  phases.push(phase3.phase);

  const phase4 = buildPhase('phase4', 'Module 3 Quality', 4, [
    { id: 'drug_substance', name: 'Drug substance section', estimatedHours: 12, role: 'cmc_lead', critical: true },
    { id: 'drug_product', name: 'Drug product section', estimatedHours: 12, role: 'cmc_lead' },
    { id: 'controls', name: 'Control strategy', estimatedHours: 10, role: 'cmc_lead' },
    { id: 'stability', name: 'Stability summary', estimatedHours: 8, role: 'cmc_lead' },
    { id: 'specifications', name: 'Specifications and methods', estimatedHours: 8, role: 'cmc_lead' },
    { id: 'quality_qc', name: 'Module 3 QC review', estimatedHours: 6, role: 'qa_manager', critical: true },
  ], phase3.completeId);
  phases.push(phase4.phase);

  const phase5 = buildPhase('phase5', 'Module 4 Nonclinical', 5, [
    { id: 'pharmacology', name: 'Pharmacology reports', estimatedHours: 10, role: 'toxicologist' },
    { id: 'pk', name: 'Pharmacokinetics reports', estimatedHours: 10, role: 'toxicologist' },
    { id: 'tox', name: 'Toxicology reports', estimatedHours: 12, role: 'toxicologist', critical: true },
    { id: 'study_listings', name: 'Nonclinical study listings', estimatedHours: 6, role: 'regulatory_ops' },
    { id: 'nonclinical_qc', name: 'Module 4 QC review', estimatedHours: 6, role: 'qa_manager' },
    { id: 'nonclinical_finalize', name: 'Finalize Module 4', estimatedHours: 4, role: 'toxicologist', critical: true },
  ], phase4.completeId);
  phases.push(phase5.phase);

  const phase6 = buildPhase('phase6', 'Module 5 Clinical', 6, [
    { id: 'study_listings', name: 'Clinical study listings', estimatedHours: 8, role: 'regulatory_ops' },
    { id: 'csr_compilation', name: 'Compile CSRs', estimatedHours: 14, role: 'medical_writer', critical: true },
    { id: 'tables_figures', name: 'Tables/figures appendices', estimatedHours: 12, role: 'biostatistician' },
    { id: 'clinical_summaries', name: 'Clinical study summaries', estimatedHours: 10, role: 'medical_writer' },
    { id: 'clinical_qc', name: 'Module 5 QC review', estimatedHours: 8, role: 'qa_manager', critical: true },
    { id: 'clinical_finalize', name: 'Finalize Module 5', estimatedHours: 6, role: 'medical_writer', critical: true },
  ], phase5.completeId);
  phases.push(phase6.phase);

  const phase7 = buildPhase('phase7', 'EU Submission Assembly', 7, [
    { id: 'esub_compile', name: 'Compile EU eCTD sequence', estimatedHours: 8, role: 'regulatory_ops', critical: true },
    { id: 'validation', name: 'EU technical validation', estimatedHours: 6, role: 'regulatory_ops' },
    { id: 'translations', name: 'Prepare translations', estimatedHours: 6, role: 'regulatory_ops' },
    { id: 'signatures', name: 'Collect signatures', estimatedHours: 4, role: 'ra_lead' },
    { id: 'submit', name: 'Submit MAA', estimatedHours: 2, role: 'regulatory_ops', critical: true },
    { id: 'archive', name: 'Archive submission package', estimatedHours: 3, role: 'regulatory_ops' },
  ], phase6.completeId);
  phases.push(phase7.phase);

  const tasks = phases.flatMap(phase => phase.tasks);
  return { type: 'MAA', phases, tasks };
}
