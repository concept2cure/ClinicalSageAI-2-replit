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
  type: 'JNDA';
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

/**
 * JNDA (Japan New Drug Application / PMDA Shōnin marketing approval) pyramid.
 *
 * Japan-specific task tree for a J-CTD marketing-authorization application.
 * Mirrors the NDA/BLA phase structure but threads the PMDA-specific
 * requirements: pre-application consultation (対面助言), bridging/ethnic-factor
 * strategy (ICH E5), J-CTD Module 1 (様式 application form, 添付文書 package
 * insert), J-GCP/GPSP compliance, J-RMP, and foreign-data acceptability. The
 * quality phase carries biologic-aware items (potency, viral safety) so the
 * pyramid serves biologic JNDA programs as well as small-molecule.
 */
export function buildJndaPyramid(): SubmissionPyramid {
  const phases: PyramidPhase[] = [];

  const phase1 = buildPhase('phase1', 'Pre-application Planning', 1, [
    { id: 'reg_strategy', name: 'Define JNDA regulatory strategy', estimatedHours: 8, role: 'ra_lead', critical: true },
    { id: 'pmda_consultation', name: 'PMDA consultation (対面助言)', estimatedHours: 10, role: 'ra_lead', critical: true },
    { id: 'bridging_strategy', name: 'Bridging / ethnic-factor strategy (ICH E5)', estimatedHours: 8, role: 'clinical_lead', critical: true },
    { id: 'foreign_data', name: 'Assess foreign clinical data acceptability', estimatedHours: 6, role: 'clinical_lead' },
    { id: 'data_package', name: 'Data package gap assessment', estimatedHours: 8, role: 'medical_writer' },
    { id: 'timeline', name: 'Create submission timeline', estimatedHours: 6, role: 'project_manager' },
    { id: 'risk_plan', name: 'JNDA risk mitigation plan', estimatedHours: 6, role: 'ra_lead' },
    { id: 'inspection_plan', name: 'GMP/GCP inspection readiness plan', estimatedHours: 6, role: 'quality' },
  ]);
  phases.push(phase1.phase);

  const phase2 = buildPhase('phase2', 'Module 1 Japan Administrative', 2, [
    { id: 'application_form', name: 'Complete application form (様式)', estimatedHours: 6, role: 'ra_associate', critical: true },
    { id: 'package_insert', name: 'Draft package insert (添付文書)', estimatedHours: 12, role: 'medical_writer', critical: true },
    { id: 'gaiyo', name: 'Prepare application summary (申請資料概要)', estimatedHours: 10, role: 'medical_writer' },
    { id: 'gcp_certificate', name: 'J-GCP compliance certificate', estimatedHours: 6, role: 'qa_manager' },
    { id: 'j_rmp', name: 'Risk management plan (J-RMP)', estimatedHours: 8, role: 'safety' },
    { id: 'reliability_standards', name: 'Reliability standards (信頼性基準) check', estimatedHours: 6, role: 'qa_manager', critical: true },
    { id: 'marketing_auth_holder', name: 'Confirm MAH and in-country caretaker', estimatedHours: 4, role: 'ra_lead' },
  ], phase1.completeId);
  phases.push(phase2.phase);

  const phase3 = buildPhase('phase3', 'Module 2 CTD Summaries', 3, [
    { id: 'ctd_intro', name: 'CTD introduction', estimatedHours: 6, role: 'medical_writer' },
    { id: 'qos', name: 'Quality overall summary', estimatedHours: 10, role: 'cmc_lead', critical: true },
    { id: 'nonclinical_overview', name: 'Nonclinical overview', estimatedHours: 8, role: 'toxicologist' },
    { id: 'clinical_overview', name: 'Clinical overview', estimatedHours: 10, role: 'clinical_lead', critical: true },
    { id: 'clinical_summary', name: 'Clinical summary', estimatedHours: 10, role: 'medical_writer' },
    { id: 'ethnic_factor', name: 'Ethnic factor / bridging summary', estimatedHours: 8, role: 'clinical_lead', critical: true },
    { id: 'summary_qc', name: 'Module 2 QC review', estimatedHours: 6, role: 'qa_manager' },
  ], phase2.completeId);
  phases.push(phase3.phase);

  const phase4 = buildPhase('phase4', 'Module 3 Quality (CMC)', 4, [
    { id: 'drug_substance', name: 'Drug substance section', estimatedHours: 12, role: 'cmc_lead', critical: true },
    { id: 'drug_product', name: 'Drug product section', estimatedHours: 12, role: 'cmc_lead' },
    { id: 'controls', name: 'Control strategy', estimatedHours: 10, role: 'cmc_lead' },
    { id: 'stability', name: 'Stability summary (Japan storage/zone)', estimatedHours: 8, role: 'cmc_lead' },
    { id: 'specifications', name: 'Specifications and methods', estimatedHours: 8, role: 'cmc_lead' },
    { id: 'potency_viral', name: 'Potency / viral safety (biologic)', estimatedHours: 8, role: 'cmc_lead' },
    { id: 'foreign_mfr', name: 'Foreign manufacturer accreditation (外国製造業者認定)', estimatedHours: 6, role: 'regulatory_ops', critical: true },
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
    { id: 'japanese_data', name: 'Japanese / bridging study data', estimatedHours: 10, role: 'clinical_lead', critical: true },
    { id: 'tables_figures', name: 'Tables/figures appendices', estimatedHours: 12, role: 'biostatistician' },
    { id: 'clinical_summaries', name: 'Clinical study summaries', estimatedHours: 10, role: 'medical_writer' },
    { id: 'clinical_qc', name: 'Module 5 QC review', estimatedHours: 8, role: 'qa_manager', critical: true },
    { id: 'clinical_finalize', name: 'Finalize Module 5', estimatedHours: 6, role: 'medical_writer', critical: true },
  ], phase5.completeId);
  phases.push(phase6.phase);

  const phase7 = buildPhase('phase7', 'Final Assembly & Submission', 7, [
    { id: 'esub_compile', name: 'Compile J-eCTD sequence', estimatedHours: 8, role: 'regulatory_ops', critical: true },
    { id: 'validation', name: 'J-eCTD technical validation', estimatedHours: 6, role: 'regulatory_ops' },
    { id: 'gpsp_plan', name: 'GPSP post-marketing surveillance plan', estimatedHours: 6, role: 'safety' },
    { id: 'translations', name: 'Finalize Japanese translations', estimatedHours: 8, role: 'regulatory_ops' },
    { id: 'signatures', name: 'Collect signatures', estimatedHours: 4, role: 'ra_lead' },
    { id: 'submit', name: 'Submit JNDA to PMDA', estimatedHours: 2, role: 'regulatory_ops', critical: true },
    { id: 'archive', name: 'Archive submission package', estimatedHours: 3, role: 'regulatory_ops' },
  ], phase6.completeId);
  phases.push(phase7.phase);

  const tasks = phases.flatMap(phase => phase.tasks);
  return { type: 'JNDA', phases, tasks };
}
