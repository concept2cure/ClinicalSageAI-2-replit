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
  type: 'PMA';
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

export function buildPmaPyramid(): SubmissionPyramid {
  const phases: PyramidPhase[] = [];

  const phase1 = buildPhase('phase1', 'Program Planning', 1, [
    { id: 'strategy', name: 'Define PMA strategy', estimatedHours: 8, role: 'ra_lead', critical: true },
    { id: 'classification', name: 'Confirm class III classification', estimatedHours: 6, role: 'ra_lead' },
    { id: 'pre_sub', name: 'Plan pre-sub meeting', estimatedHours: 6, role: 'project_manager' },
    { id: 'clinical_plan', name: 'Define clinical evidence plan', estimatedHours: 10, role: 'clinical_lead', critical: true },
    { id: 'nonclinical_plan', name: 'Define nonclinical evidence plan', estimatedHours: 8, role: 'toxicologist' },
    { id: 'timeline', name: 'Create master timeline', estimatedHours: 6, role: 'project_manager' },
    { id: 'risk_plan', name: 'Risk management plan', estimatedHours: 8, role: 'qa_manager' },
    { id: 'resource_plan', name: 'Resource plan', estimatedHours: 4, role: 'project_manager' },
  ]);
  phases.push(phase1.phase);

  const phase2 = buildPhase('phase2', 'Device Description & Design', 2, [
    { id: 'device_description', name: 'Draft device description', estimatedHours: 10, role: 'medical_writer', critical: true },
    { id: 'design_history', name: 'Compile design history file', estimatedHours: 12, role: 'engineering' },
    { id: 'intended_use', name: 'Finalize intended use', estimatedHours: 4, role: 'ra_lead' },
    { id: 'materials', name: 'Document materials & components', estimatedHours: 8, role: 'engineering' },
    { id: 'specs', name: 'Finalize device specifications', estimatedHours: 6, role: 'engineering' },
    { id: 'risk_analysis', name: 'Complete ISO 14971 risk analysis', estimatedHours: 10, role: 'qa_manager', critical: true },
    { id: 'software_overview', name: 'Software documentation overview', estimatedHours: 8, role: 'engineering' },
  ], phase1.completeId);
  phases.push(phase2.phase);

  const phase3 = buildPhase('phase3', 'Preclinical Testing', 3, [
    { id: 'bench_testing', name: 'Bench testing summary', estimatedHours: 12, role: 'engineering', critical: true },
    { id: 'biocompatibility', name: 'Biocompatibility testing', estimatedHours: 10, role: 'qa_manager' },
    { id: 'sterilization', name: 'Sterilization validation', estimatedHours: 8, role: 'quality' },
    { id: 'shelf_life', name: 'Shelf-life validation', estimatedHours: 6, role: 'quality' },
    { id: 'emi_emc', name: 'EMI/EMC testing', estimatedHours: 6, role: 'engineering' },
    { id: 'software_validation', name: 'Software validation testing', estimatedHours: 8, role: 'engineering' },
    { id: 'animal_studies', name: 'Animal studies (if required)', estimatedHours: 10, role: 'toxicologist' },
  ], phase2.completeId);
  phases.push(phase3.phase);

  const phase4 = buildPhase('phase4', 'Clinical Investigation', 4, [
    { id: 'protocol', name: 'Clinical protocol finalization', estimatedHours: 10, role: 'clinical_lead', critical: true },
    { id: 'ide_submission', name: 'IDE submission (if required)', estimatedHours: 8, role: 'ra_lead' },
    { id: 'site_selection', name: 'Site selection & activation', estimatedHours: 12, role: 'clinical_ops' },
    { id: 'enrollment', name: 'Patient enrollment plan', estimatedHours: 10, role: 'clinical_ops' },
    { id: 'data_collection', name: 'Clinical data collection', estimatedHours: 12, role: 'clinical_ops' },
    { id: 'monitoring', name: 'Clinical monitoring', estimatedHours: 10, role: 'clinical_ops' },
    { id: 'analysis', name: 'Clinical data analysis', estimatedHours: 12, role: 'biostatistician', critical: true },
  ], phase3.completeId);
  phases.push(phase4.phase);

  const phase5 = buildPhase('phase5', 'Manufacturing & Quality', 5, [
    { id: 'process', name: 'Manufacturing process description', estimatedHours: 8, role: 'cmc_lead' },
    { id: 'controls', name: 'Process controls', estimatedHours: 8, role: 'quality' },
    { id: 'supplier_controls', name: 'Supplier controls', estimatedHours: 6, role: 'quality' },
    { id: 'validation', name: 'Process validation', estimatedHours: 10, role: 'quality', critical: true },
    { id: 'batch_records', name: 'Batch record summaries', estimatedHours: 6, role: 'quality' },
    { id: 'quality_system', name: 'Quality system summary', estimatedHours: 8, role: 'qa_manager' },
    { id: 'inspections', name: 'Pre-approval inspection readiness', estimatedHours: 8, role: 'qa_manager', critical: true },
  ], phase4.completeId);
  phases.push(phase5.phase);

  const phase6 = buildPhase('phase6', 'Labeling & IFU', 6, [
    { id: 'labeling', name: 'Draft labeling', estimatedHours: 8, role: 'medical_writer' },
    { id: 'ifu', name: 'Draft IFU', estimatedHours: 8, role: 'medical_writer', critical: true },
    { id: 'warnings', name: 'Warnings/precautions', estimatedHours: 6, role: 'ra_lead' },
    { id: 'training', name: 'Training materials', estimatedHours: 6, role: 'clinical_ops' },
    { id: 'claims_review', name: 'Labeling claims review', estimatedHours: 4, role: 'qa_manager' },
    { id: 'labeling_qc', name: 'Labeling QC', estimatedHours: 4, role: 'qa_manager' },
    { id: 'translations', name: 'Translations (if required)', estimatedHours: 4, role: 'regulatory_ops' },
  ], phase5.completeId);
  phases.push(phase6.phase);

  const phase7 = buildPhase('phase7', 'Module Compilation', 7, [
    { id: 'module1', name: 'Assemble Module 1', estimatedHours: 6, role: 'regulatory_ops' },
    { id: 'module2', name: 'Assemble Module 2', estimatedHours: 6, role: 'regulatory_ops' },
    { id: 'module3', name: 'Assemble Module 3', estimatedHours: 8, role: 'regulatory_ops' },
    { id: 'module4', name: 'Assemble Module 4', estimatedHours: 8, role: 'regulatory_ops' },
    { id: 'module5', name: 'Assemble Module 5', estimatedHours: 8, role: 'regulatory_ops' },
    { id: 'module6', name: 'Assemble Module 6', estimatedHours: 8, role: 'regulatory_ops' },
    { id: 'module7', name: 'Assemble Module 7', estimatedHours: 8, role: 'regulatory_ops' },
  ], phase6.completeId);
  phases.push(phase7.phase);

  const phase8 = buildPhase('phase8', 'QA Review', 8, [
    { id: 'qa_full', name: 'Full PMA QA review', estimatedHours: 12, role: 'qa_manager', critical: true },
    { id: 'traceability', name: 'Traceability matrix review', estimatedHours: 8, role: 'qa_manager' },
    { id: 'compliance', name: 'Compliance verification', estimatedHours: 8, role: 'qa_manager' },
    { id: 'signatures', name: 'Collect signatures', estimatedHours: 6, role: 'ra_lead' },
    { id: 'deficiency_check', name: 'Deficiency readiness check', estimatedHours: 6, role: 'ra_lead', critical: true },
    { id: 'final_corrections', name: 'Final corrections', estimatedHours: 6, role: 'regulatory_ops' },
    { id: 'executive_approval', name: 'Executive approval', estimatedHours: 4, role: 'executive', critical: true },
  ], phase7.completeId);
  phases.push(phase8.phase);

  const phase9 = buildPhase('phase9', 'Submission', 9, [
    { id: 'ectd_publish', name: 'Publish PMA eCTD', estimatedHours: 6, role: 'regulatory_ops', critical: true },
    { id: 'validation', name: 'Technical validation', estimatedHours: 6, role: 'regulatory_ops' },
    { id: 'esg_submission', name: 'Submit to FDA', estimatedHours: 4, role: 'regulatory_ops', critical: true },
    { id: 'receipt', name: 'Confirm receipt', estimatedHours: 2, role: 'regulatory_ops' },
    { id: 'archive', name: 'Archive submission package', estimatedHours: 4, role: 'regulatory_ops' },
    { id: 'submission_log', name: 'Submission log entry', estimatedHours: 2, role: 'regulatory_ops' },
    { id: 'post_submit_plan', name: 'Post-submission plan', estimatedHours: 4, role: 'project_manager' },
  ], phase8.completeId);
  phases.push(phase9.phase);

  const phase10 = buildPhase('phase10', 'Post-Submission Readiness', 10, [
    { id: 'inspection_readiness', name: 'Inspection readiness', estimatedHours: 8, role: 'qa_manager', critical: true },
    { id: 'response_plan', name: 'FDA response plan', estimatedHours: 6, role: 'ra_lead' },
    { id: 'qa_training', name: 'QA training refresh', estimatedHours: 4, role: 'qa_manager' },
    { id: 'supply_plan', name: 'Supply chain readiness', estimatedHours: 6, role: 'supply_chain' },
    { id: 'complaint_process', name: 'Complaint handling process', estimatedHours: 4, role: 'quality' },
    { id: 'field_alert', name: 'Field alert reporting readiness', estimatedHours: 4, role: 'quality' },
    { id: 'post_market', name: 'Post-market surveillance plan', estimatedHours: 6, role: 'ra_lead' },
  ], phase9.completeId);
  phases.push(phase10.phase);

  const tasks = phases.flatMap(phase => phase.tasks);
  return { type: 'PMA', phases, tasks };
}
