/**
 * Built-in workflow template catalog.
 *
 * `task_templates` is an org-scoped table with a working instantiation route
 * (POST /tasks/from-template/:templateId) — but a fresh organization has no
 * rows in it, no UI to author one, and (until this module) no list endpoint.
 * The result was a "Start workflow" button that could never work end-to-end
 * (assessment D9/D10).
 *
 * These built-ins close that loop: GET /templates returns the org's own
 * templates PLUS this catalog, and the from-template route instantiates a
 * built-in exactly like a stored one. Org templates always win on id
 * collision. The catalog is deliberately small and regulatory-real — the same
 * three submission workflows the ui-v2 kit designed (NDA/BLA filing, 510(k),
 * IND-enabling), now owned by the server so every client shares one source.
 *
 * Shape mirrors the `task_templates` row contract (taskDefinitionSchema /
 * templateDependencySchema in taskManagement.routes.ts) so one instantiation
 * code path serves both.
 *
 * @module server/services/tasking/workflow-templates
 */

export interface BuiltinTemplateTask {
  id: string;
  title: string;
  description?: string;
  moduleType: string;
  taskType?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  dayOffset: number;
  duration: number;
  estimatedHours: number;
}

export interface BuiltinTemplateDependency {
  predecessor: string;
  successor: string;
  type?: 'finish-to-start' | 'start-to-start' | 'finish-to-finish' | 'start-to-finish';
  lag?: number;
}

export interface BuiltinWorkflowTemplate {
  templateId: string;
  name: string;
  description: string;
  category: string;
  submissionType: string;
  /** Marks catalog entries so clients can label them and admins can override. */
  builtin: true;
  regulatoryRequirements: string[];
  riskFactors: string[];
  milestones: string[];
  tasks: BuiltinTemplateTask[];
  dependencies: BuiltinTemplateDependency[];
}

const dep = (predecessor: string, successor: string): BuiltinTemplateDependency => ({
  predecessor,
  successor,
  type: 'finish-to-start',
});

export const BUILTIN_WORKFLOW_TEMPLATES: BuiltinWorkflowTemplate[] = [
  {
    templateId: 'BUILTIN-NDA-FILING',
    name: 'NDA / BLA filing workflow',
    description:
      'Module 1–5 assembly through validated sequence dispatch for an NDA/BLA filing.',
    category: 'Submission',
    submissionType: 'NDA',
    builtin: true,
    regulatoryRequirements: ['21 CFR 314.50', 'eCTD v4.0', 'PDUFA'],
    riskFactors: ['define.xml validation', 'financial disclosure completeness'],
    milestones: ['CTD lock', 'Sequence dispatch'],
    tasks: [
      { id: 't1', title: 'Assemble Module 1 administrative set (356h, cover, 3674)', moduleType: 'eCTD', dayOffset: 0, duration: 5, priority: 'high', estimatedHours: 16 },
      { id: 't2', title: 'Reconcile Module 2 CTD summaries (2.5 / 2.7)', moduleType: 'Clinical', dayOffset: 3, duration: 8, priority: 'high', estimatedHours: 32 },
      { id: 't3', title: 'Close Module 3 CMC comparability (3.2.S.4.4)', moduleType: 'CMC', dayOffset: 2, duration: 10, priority: 'critical', estimatedHours: 40 },
      { id: 't4', title: 'Finalize Module 5 datasets + define.xml validation', moduleType: 'Biostatistics', dayOffset: 5, duration: 7, priority: 'critical', estimatedHours: 28 },
      { id: 't5', title: 'Run eValidator + shadow review (RTF pre-empt)', moduleType: 'eCTD', dayOffset: 14, duration: 3, priority: 'high', estimatedHours: 12 },
      { id: 't6', title: 'Freeze sequence + governed dispatch (e-sign)', moduleType: 'eCTD', taskType: 'milestone', dayOffset: 18, duration: 1, priority: 'critical', estimatedHours: 4 },
    ],
    dependencies: [dep('t1', 't5'), dep('t2', 't5'), dep('t3', 't5'), dep('t4', 't5'), dep('t5', 't6')],
  },
  {
    templateId: 'BUILTIN-510K',
    name: '510(k) submission workflow',
    description: 'Predicate strategy through eSTAR assembly for a Traditional 510(k).',
    category: 'Submission',
    submissionType: '510k',
    builtin: true,
    regulatoryRequirements: ['21 CFR 807', 'eSTAR'],
    riskFactors: ['predicate validity', 'performance testing gaps'],
    milestones: ['SE argument complete', 'eSTAR assembled'],
    tasks: [
      { id: 't1', title: 'Predicate search + substantial-equivalence matrix', moduleType: 'MedicalDevice', dayOffset: 0, duration: 6, priority: 'critical', estimatedHours: 24 },
      { id: 't2', title: 'Performance testing summary (bench + biocompat)', moduleType: 'MedicalDevice', dayOffset: 3, duration: 8, priority: 'high', estimatedHours: 32 },
      { id: 't3', title: 'Draft labeling / IFU + human factors', moduleType: 'Regulatory', dayOffset: 5, duration: 6, priority: 'medium', estimatedHours: 20 },
      { id: 't4', title: 'Assemble eSTAR package + gate validate', moduleType: 'MedicalDevice', taskType: 'milestone', dayOffset: 12, duration: 2, priority: 'high', estimatedHours: 8 },
    ],
    dependencies: [dep('t1', 't4'), dep('t2', 't4'), dep('t3', 't4')],
  },
  {
    templateId: 'BUILTIN-IND',
    name: 'IND-enabling workflow',
    description: 'Nonclinical, CMC and clinical content through signed IND assembly.',
    category: 'Submission',
    submissionType: 'IND',
    builtin: true,
    regulatoryRequirements: ['21 CFR 312.23', 'ICH M4'],
    riskFactors: ['GLP tox timing', 'CMC readiness'],
    milestones: ['IND content complete', 'Forms signed'],
    tasks: [
      { id: 't1', title: 'Nonclinical / Module 4 GLP study reports + SEND', moduleType: 'Nonclinical', dayOffset: 0, duration: 10, priority: 'high', estimatedHours: 40 },
      { id: 't2', title: 'CMC Module 3 initial (drug substance + product)', moduleType: 'CMC', dayOffset: 0, duration: 12, priority: 'critical', estimatedHours: 48 },
      { id: 't3', title: 'Clinical protocol + investigator brochure', moduleType: 'Clinical', dayOffset: 4, duration: 8, priority: 'high', estimatedHours: 32 },
      { id: 't4', title: 'Forms 1571 / 1572 / 3674 + IND assembly', moduleType: 'Regulatory', taskType: 'milestone', dayOffset: 14, duration: 2, priority: 'high', estimatedHours: 8 },
    ],
    dependencies: [dep('t1', 't4'), dep('t2', 't4'), dep('t3', 't4')],
  },
];

/** Catalog lookup by template id; null when the id is not a built-in. */
export function getBuiltinWorkflowTemplate(templateId: string): BuiltinWorkflowTemplate | null {
  return BUILTIN_WORKFLOW_TEMPLATES.find(t => t.templateId === templateId) ?? null;
}
