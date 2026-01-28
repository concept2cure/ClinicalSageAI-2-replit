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
  type: 'DE_NOVO';
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

export function buildDeNovoPyramid(): SubmissionPyramid {
  const phases: PyramidPhase[] = [];

  const phase1 = buildPhase('phase1', 'De Novo Planning', 1, [
    { id: 'classification', name: 'Confirm De Novo eligibility', estimatedHours: 6, role: 'ra_lead', critical: true },
    { id: 'risk_profile', name: 'Establish risk-based classification rationale', estimatedHours: 8, role: 'ra_lead', critical: true },
    { id: 'benefit_risk', name: 'Draft benefit-risk framework', estimatedHours: 8, role: 'clinical_lead' },
    { id: 'reg_strategy', name: 'Define regulatory strategy', estimatedHours: 6, role: 'ra_lead' },
    { id: 'timeline', name: 'Create submission timeline', estimatedHours: 4, role: 'project_manager' },
    { id: 'pre_sub_plan', name: 'Plan pre-sub interactions', estimatedHours: 4, role: 'project_manager' },
  ]);
  phases.push(phase1.phase);

  const phase2 = buildPhase('phase2', 'Device Characterization', 2, [
    { id: 'device_description', name: 'Draft device description', estimatedHours: 8, role: 'medical_writer', critical: true },
    { id: 'intended_use', name: 'Finalize intended use statement', estimatedHours: 4, role: 'ra_lead', critical: true },
    { id: 'tech_specs', name: 'Compile technical specifications', estimatedHours: 8, role: 'engineering' },
    { id: 'design_controls', name: 'Summarize design controls', estimatedHours: 6, role: 'quality' },
    { id: 'risk_analysis', name: 'Complete ISO 14971 risk analysis', estimatedHours: 10, role: 'qa_manager', critical: true },
  ], phase1.completeId);
  phases.push(phase2.phase);

  const phase3 = buildPhase('phase3', 'Classification & Controls', 3, [
    { id: 'controls_proposed', name: 'Propose special controls', estimatedHours: 8, role: 'ra_lead', critical: true },
    { id: 'mitigation_summary', name: 'Map controls to risks', estimatedHours: 8, role: 'qa_manager' },
    { id: 'reg_framework', name: 'Draft regulatory framework summary', estimatedHours: 6, role: 'ra_lead' },
    { id: 'predicate_analysis', name: 'Analyze predicate alternatives (if any)', estimatedHours: 6, role: 'ra_lead' },
    { id: 'classification_order', name: 'Draft classification order proposal', estimatedHours: 6, role: 'ra_lead' },
  ], phase2.completeId);
  phases.push(phase3.phase);

  const phase4 = buildPhase('phase4', 'Testing & Evidence', 4, [
    { id: 'bench_testing', name: 'Bench testing summary', estimatedHours: 12, role: 'engineering', critical: true },
    { id: 'software_docs', name: 'Software documentation', estimatedHours: 10, role: 'engineering' },
    { id: 'biocompatibility', name: 'Biocompatibility evidence', estimatedHours: 8, role: 'qa_manager' },
    { id: 'usability', name: 'Human factors/usability study', estimatedHours: 10, role: 'clinical_ops' },
    { id: 'clinical_evidence', name: 'Clinical evidence summary', estimatedHours: 10, role: 'clinical_lead', critical: true },
    { id: 'performance', name: 'Performance testing summary', estimatedHours: 8, role: 'medical_writer' },
  ], phase3.completeId);
  phases.push(phase4.phase);

  const phase5 = buildPhase('phase5', 'Labeling & IFU', 5, [
    { id: 'labeling', name: 'Draft labeling', estimatedHours: 8, role: 'medical_writer' },
    { id: 'ifu', name: 'Draft IFU', estimatedHours: 6, role: 'medical_writer', critical: true },
    { id: 'warnings', name: 'Warnings/precautions', estimatedHours: 4, role: 'ra_lead' },
    { id: 'claims_review', name: 'Claims consistency review', estimatedHours: 4, role: 'qa_manager' },
    { id: 'labeling_qc', name: 'Labeling QC', estimatedHours: 4, role: 'qa_manager' },
  ], phase4.completeId);
  phases.push(phase5.phase);

  const phase6 = buildPhase('phase6', 'Administrative & Forms', 6, [
    { id: 'cover_letter', name: 'Draft cover letter', estimatedHours: 4, role: 'ra_lead' },
    { id: 'form_3514', name: 'Complete FDA Form 3514', estimatedHours: 3, role: 'ra_associate' },
    { id: 'de_novo_summary', name: 'Draft De Novo summary', estimatedHours: 6, role: 'medical_writer', critical: true },
    { id: 'special_controls', name: 'Draft special controls section', estimatedHours: 6, role: 'ra_lead', critical: true },
    { id: 'table_of_contents', name: 'Assemble TOC', estimatedHours: 3, role: 'regulatory_ops' },
  ], phase5.completeId);
  phases.push(phase6.phase);

  const phase7 = buildPhase('phase7', 'QA Review & Submission', 7, [
    { id: 'qa_review', name: 'QA review of De Novo package', estimatedHours: 8, role: 'qa_manager', critical: true },
    { id: 'signatures', name: 'Collect signatures', estimatedHours: 4, role: 'ra_lead' },
    { id: 'final_validation', name: 'Final validation', estimatedHours: 4, role: 'regulatory_ops', critical: true },
    { id: 'submit', name: 'Submit De Novo', estimatedHours: 2, role: 'regulatory_ops', critical: true },
    { id: 'archive', name: 'Archive submission package', estimatedHours: 3, role: 'regulatory_ops' },
  ], phase6.completeId);
  phases.push(phase7.phase);

  const tasks = phases.flatMap(phase => phase.tasks);
  return { type: 'DE_NOVO', phases, tasks };
}
