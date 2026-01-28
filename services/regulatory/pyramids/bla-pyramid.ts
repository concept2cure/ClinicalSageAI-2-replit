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
  type: 'BLA';
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

export function buildBlaPyramid(): SubmissionPyramid {
  const phases: PyramidPhase[] = [];

  const phase1 = buildPhase('phase1', 'Program Planning', 1, [
    { id: 'reg_strategy', name: 'Define BLA strategy', estimatedHours: 8, role: 'ra_lead', critical: true },
    { id: 'cber_alignment', name: 'CBER alignment plan', estimatedHours: 6, role: 'ra_lead' },
    { id: 'potency_plan', name: 'Potency assay strategy', estimatedHours: 8, role: 'cmc_lead', critical: true },
    { id: 'manufacturing_plan', name: 'Manufacturing readiness plan', estimatedHours: 8, role: 'cmc_lead' },
    { id: 'clinical_plan', name: 'Clinical evidence plan', estimatedHours: 8, role: 'clinical_lead' },
    { id: 'timeline', name: 'Create submission timeline', estimatedHours: 6, role: 'project_manager' },
    { id: 'risk_plan', name: 'BLA risk mitigation plan', estimatedHours: 6, role: 'ra_lead' },
    { id: 'data_lock', name: 'Confirm data lock readiness', estimatedHours: 4, role: 'biostatistician' },
    { id: 'inspection_plan', name: 'Inspection readiness plan', estimatedHours: 6, role: 'quality' },
  ]);
  phases.push(phase1.phase);

  const phase2 = buildPhase('phase2', 'Module 1 Administrative', 2, [
    { id: 'cover_letter', name: 'Draft cover letter', estimatedHours: 4, role: 'ra_lead' },
    { id: 'form_356h', name: 'Complete FDA Form 356h', estimatedHours: 6, role: 'ra_associate', critical: true },
    { id: 'toc', name: 'Compile module TOC', estimatedHours: 4, role: 'regulatory_ops' },
    { id: 'labeling', name: 'Prepare proposed labeling', estimatedHours: 10, role: 'medical_writer' },
    { id: 'financial', name: 'Financial disclosures', estimatedHours: 4, role: 'ra_associate' },
    { id: 'debarment', name: 'Debarment certification', estimatedHours: 3, role: 'ra_associate' },
    { id: 'facility_list', name: 'Facility registration list', estimatedHours: 4, role: 'regulatory_ops' },
    { id: 'user_fee', name: 'User fee cover sheet', estimatedHours: 3, role: 'ra_associate' },
    { id: 'field_copy', name: 'Field copy certification', estimatedHours: 3, role: 'regulatory_ops' },
  ], phase1.completeId);
  phases.push(phase2.phase);

  const phase3 = buildPhase('phase3', 'Module 2 Summaries', 3, [
    { id: 'ctd_intro', name: 'CTD introduction', estimatedHours: 6, role: 'medical_writer' },
    { id: 'qos', name: 'Quality overall summary', estimatedHours: 10, role: 'cmc_lead', critical: true },
    { id: 'nonclinical_overview', name: 'Nonclinical overview', estimatedHours: 8, role: 'toxicologist' },
    { id: 'clinical_overview', name: 'Clinical overview', estimatedHours: 10, role: 'clinical_lead', critical: true },
    { id: 'clinical_summary', name: 'Clinical summary', estimatedHours: 10, role: 'medical_writer' },
    { id: 'summary_qc', name: 'Module 2 QC review', estimatedHours: 6, role: 'qa_manager' },
    { id: 'consistency', name: 'Cross-module consistency check', estimatedHours: 6, role: 'ra_lead' },
    { id: 'immunogenicity', name: 'Immunogenicity summary', estimatedHours: 6, role: 'clinical_lead' },
    { id: 'potency_summary', name: 'Potency summary', estimatedHours: 6, role: 'cmc_lead' },
  ], phase2.completeId);
  phases.push(phase3.phase);

  const phase4 = buildPhase('phase4', 'Module 3 Quality (CMC)', 4, [
    { id: 'drug_substance', name: 'Drug substance section', estimatedHours: 12, role: 'cmc_lead', critical: true },
    { id: 'drug_product', name: 'Drug product section', estimatedHours: 12, role: 'cmc_lead' },
    { id: 'controls', name: 'Control strategy', estimatedHours: 10, role: 'cmc_lead' },
    { id: 'process_validation', name: 'Process validation summary', estimatedHours: 10, role: 'quality' },
    { id: 'viral_clearance', name: 'Viral clearance studies', estimatedHours: 10, role: 'cmc_lead', critical: true },
    { id: 'stability', name: 'Stability summary', estimatedHours: 8, role: 'cmc_lead' },
    { id: 'specifications', name: 'Specifications & methods', estimatedHours: 8, role: 'cmc_lead' },
    { id: 'batch_analysis', name: 'Batch analysis tables', estimatedHours: 6, role: 'cmc_lead' },
    { id: 'quality_qc', name: 'Module 3 QC review', estimatedHours: 6, role: 'qa_manager', critical: true },
  ], phase3.completeId);
  phases.push(phase4.phase);

  const phase5 = buildPhase('phase5', 'Module 4 Nonclinical', 5, [
    { id: 'pharmacology', name: 'Pharmacology reports', estimatedHours: 10, role: 'toxicologist' },
    { id: 'pk', name: 'Pharmacokinetics reports', estimatedHours: 10, role: 'toxicologist' },
    { id: 'tox', name: 'Toxicology reports', estimatedHours: 12, role: 'toxicologist', critical: true },
    { id: 'study_listings', name: 'Nonclinical study listings', estimatedHours: 6, role: 'regulatory_ops' },
    { id: 'immunotox', name: 'Immunotoxicology summary', estimatedHours: 8, role: 'toxicologist' },
    { id: 'nonclinical_qc', name: 'Module 4 QC review', estimatedHours: 6, role: 'qa_manager' },
    { id: 'nonclinical_finalize', name: 'Finalize Module 4', estimatedHours: 4, role: 'toxicologist', critical: true },
    { id: 'car_t_cell', name: 'Biologic-specific rationale', estimatedHours: 6, role: 'clinical_lead' },
  ], phase4.completeId);
  phases.push(phase5.phase);

  const phase6 = buildPhase('phase6', 'Module 5 Clinical', 6, [
    { id: 'study_listings', name: 'Clinical study listings', estimatedHours: 8, role: 'regulatory_ops' },
    { id: 'csr_compilation', name: 'Compile CSRs', estimatedHours: 14, role: 'medical_writer', critical: true },
    { id: 'tables_figures', name: 'Tables/figures appendices', estimatedHours: 12, role: 'biostatistician' },
    { id: 'clinical_summaries', name: 'Clinical study summaries', estimatedHours: 10, role: 'medical_writer' },
    { id: 'clinical_qc', name: 'Module 5 QC review', estimatedHours: 8, role: 'qa_manager', critical: true },
    { id: 'safety', name: 'Safety narrative review', estimatedHours: 8, role: 'medical_monitor' },
    { id: 'immunogenicity', name: 'Immunogenicity analysis', estimatedHours: 8, role: 'clinical_lead' },
    { id: 'clinical_finalize', name: 'Finalize Module 5', estimatedHours: 6, role: 'medical_writer', critical: true },
  ], phase5.completeId);
  phases.push(phase6.phase);

  const phase7 = buildPhase('phase7', 'Final QA & Submission', 7, [
    { id: 'qa_full', name: 'Full submission QA review', estimatedHours: 10, role: 'qa_manager', critical: true },
    { id: 'publishing', name: 'Publish eCTD sequence', estimatedHours: 6, role: 'regulatory_ops' },
    { id: 'validation', name: 'eCTD technical validation', estimatedHours: 6, role: 'regulatory_ops', critical: true },
    { id: 'signatures', name: 'Collect signatures', estimatedHours: 4, role: 'ra_lead' },
    { id: 'submit', name: 'Submit BLA', estimatedHours: 2, role: 'regulatory_ops', critical: true },
    { id: 'archive', name: 'Archive submission package', estimatedHours: 3, role: 'regulatory_ops' },
    { id: 'receipt', name: 'Confirm FDA receipt', estimatedHours: 2, role: 'regulatory_ops' },
    { id: 'inspection_readiness', name: 'BLA inspection readiness', estimatedHours: 6, role: 'quality', critical: true },
  ], phase6.completeId);
  phases.push(phase7.phase);

  const tasks = phases.flatMap(phase => phase.tasks);
  return { type: 'BLA', phases, tasks };
}
