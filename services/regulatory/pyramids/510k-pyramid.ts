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
  type: '510K';
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

export function build510kPyramid(): SubmissionPyramid {
  const phases: PyramidPhase[] = [];

  const phase1 = buildPhase('phase1', 'Project Planning', 1, [
    { id: 'scope', name: 'Define submission scope', estimatedHours: 6, role: 'ra_lead', critical: true },
    { id: 'device_class', name: 'Confirm device classification', estimatedHours: 4, role: 'ra_lead' },
    { id: 'predicate_shortlist', name: 'Shortlist predicate devices', estimatedHours: 8, role: 'ra_lead', critical: true },
    { id: 'reg_strategy', name: 'Draft regulatory strategy', estimatedHours: 6, role: 'ra_lead' },
    { id: 'timeline', name: 'Create submission timeline', estimatedHours: 4, role: 'project_manager' },
  ]);
  phases.push(phase1.phase);

  const phase2 = buildPhase('phase2', 'Device Characterization', 2, [
    { id: 'device_description', name: 'Draft device description outline', estimatedHours: 6, role: 'medical_writer' },
    { id: 'intended_use', name: 'Finalize intended use statement', estimatedHours: 4, role: 'ra_lead', critical: true },
    { id: 'tech_specs', name: 'Compile technical specifications', estimatedHours: 8, role: 'engineering' },
    { id: 'risk_analysis', name: 'Perform initial risk analysis', estimatedHours: 10, role: 'qa_manager' },
    { id: 'standards', name: 'Identify applicable standards', estimatedHours: 6, role: 'ra_lead' },
  ], phase1.completeId);
  phases.push(phase2.phase);

  const phase3 = buildPhase('phase3', 'Predicate & Equivalence', 3, [
    { id: 'predicate_selection', name: 'Select primary predicate', estimatedHours: 6, role: 'ra_lead', critical: true },
    { id: 'se_matrix', name: 'Build substantial equivalence matrix', estimatedHours: 10, role: 'ra_lead', critical: true },
    { id: 'tech_differences', name: 'Document technological differences', estimatedHours: 8, role: 'engineering' },
    { id: 'se_rationale', name: 'Draft SE rationale', estimatedHours: 8, role: 'medical_writer' },
    { id: 'predicate_docs', name: 'Collect predicate documentation', estimatedHours: 6, role: 'ra_associate' },
  ], phase2.completeId);
  phases.push(phase3.phase);

  const phase4 = buildPhase('phase4', 'Testing & Evidence', 4, [
    { id: 'bench_testing', name: 'Complete bench testing summary', estimatedHours: 12, role: 'engineering', critical: true },
    { id: 'software_docs', name: 'Prepare software documentation', estimatedHours: 10, role: 'engineering' },
    { id: 'biocompatibility', name: 'Compile biocompatibility evidence', estimatedHours: 8, role: 'qa_manager' },
    { id: 'sterilization', name: 'Prepare sterilization validation', estimatedHours: 6, role: 'quality' },
    { id: 'performance', name: 'Draft performance testing summary', estimatedHours: 8, role: 'medical_writer' },
  ], phase3.completeId);
  phases.push(phase4.phase);

  const phase5 = buildPhase('phase5', 'Labeling & IFU', 5, [
    { id: 'ifu_statement', name: 'Finalize IFU statement', estimatedHours: 4, role: 'ra_lead', critical: true },
    { id: 'labeling', name: 'Prepare labeling package', estimatedHours: 8, role: 'medical_writer' },
    { id: 'instructions', name: 'Draft instructions for use', estimatedHours: 6, role: 'medical_writer' },
    { id: 'claims_review', name: 'Review claims for consistency', estimatedHours: 4, role: 'qa_manager' },
    { id: 'warnings', name: 'Draft warnings/precautions', estimatedHours: 4, role: 'ra_lead' },
  ], phase4.completeId);
  phases.push(phase5.phase);

  const phase6 = buildPhase('phase6', 'Submission Assembly', 6, [
    { id: 'cover_letter', name: 'Draft cover letter', estimatedHours: 4, role: 'ra_lead' },
    { id: 'form_3514', name: 'Complete FDA Form 3514', estimatedHours: 3, role: 'ra_associate' },
    { id: 'form_3881', name: 'Complete FDA Form 3881', estimatedHours: 3, role: 'ra_associate' },
    { id: 'table_of_contents', name: 'Assemble table of contents', estimatedHours: 2, role: 'regulatory_ops' },
    { id: 'qc_package', name: 'Package submission artifacts', estimatedHours: 6, role: 'regulatory_ops', critical: true },
  ], phase5.completeId);
  phases.push(phase6.phase);

  const phase7 = buildPhase('phase7', 'QA Review & Submission', 7, [
    { id: 'qa_review', name: 'QA review of submission', estimatedHours: 8, role: 'qa_manager', critical: true },
    { id: 'signature', name: 'Collect required signatures', estimatedHours: 4, role: 'ra_lead' },
    { id: 'final_validation', name: 'Final submission validation', estimatedHours: 4, role: 'regulatory_ops', critical: true },
    { id: 'esg_prep', name: 'Prepare ESG package', estimatedHours: 4, role: 'regulatory_ops' },
    { id: 'submit', name: 'Submit 510(k) package', estimatedHours: 2, role: 'regulatory_ops', critical: true },
  ], phase6.completeId);
  phases.push(phase7.phase);

  const tasks = phases.flatMap(phase => phase.tasks);
  return { type: '510K', phases, tasks };
}
