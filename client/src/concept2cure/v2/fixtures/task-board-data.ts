/**
 * Task board fixture data — extracted from kit task-board.jsx.
 *
 * Grounded in the project/tasking forensic report (concept2cure-v2):
 *   - Canonical store: unifiedTasks (shared/schema.ts:6924) via
 *     /api/task-management (server/routes/taskManagement.routes.ts).
 *   - Board columns: TO DO / IN PROGRESS / IN REVIEW / DONE
 *   - ORG-SCOPED, not project-scoped.
 *   - Full unifiedTasks field set: taskType, impactScore, criticalPath,
 *     regulatoryImpact, approvalRequired/Status, blockedBy[]/blocks[],
 *     dependsOn, sourceEntityType (polymorphic origin), progress.
 *   - Seven task tables, no reconciliation (Gap 1).
 */

/* ── Interfaces ── */

export interface TaskItem {
  taskId: string;
  title: string;
  project: string;
  moduleType: string;
  taskType: string;
  status: string;
  priority: string;
  assignee: string;
  assignedBy: string;
  progress: number;
  impactScore: number;
  criticalPath: boolean;
  regulatoryImpact: boolean;
  approvalRequired: boolean;
  approvalStatus: string;
  dependsOn: string[];
  blocks: string[];
  comments: number;
  attachments: number;
  source: string;
  due: string;
  phase: string;
  blocked?: boolean;
  blockedReason?: string;
  estimatedHours?: number;
  assignmentType?: string;
}

export interface TeamMember {
  n: string;
  t: string;
}

export interface ProjectEntry {
  id: string;
  label: string;
  type: string;
}

export interface BoardColumn {
  id: string;
  label: string;
  tone: string;
}

export interface TaskSource {
  l: string;
  t: string;
}

export interface WorkflowTask {
  id: string;
  title: string;
  moduleType: string;
  dayOffset: number;
  duration: number;
  priority: string;
  estimatedHours: number;
  taskType?: string;
}

export interface WorkflowTemplate {
  templateId: string;
  name: string;
  category: string;
  submissionType: string;
  regulatoryRequirements: string[];
  riskFactors: string[];
  milestones: string[];
  tasks: WorkflowTask[];
  dependencies: [string, string][];
}

/* ── Module type palette (projectTasks.moduleColor) ── */
export const TB_MOD: Record<string, string> = {
  CMC: '#7c6f5b',
  IND: '#2a6f97',
  'Medical Device': '#5a8f69',
  eCTD: '#8a5a9c',
  Vault: '#9c7a3c',
  'Protocol Design': '#9c5a5a',
  Clinical: '#2a6f97',
  Nonclinical: '#6b8f5a',
  Biostatistics: '#5a6f9c',
  Safety: '#a8553c',
  Regulatory: '#7c6f5b',
};

/* ── Board columns (unifiedTasks status -> 4 columns, Board.tsx) ── */
export const TB_COLS: BoardColumn[] = [
  { id: 'pending', label: 'To do', tone: 'idle' },
  { id: 'in-progress', label: 'In progress', tone: 'ai' },
  { id: 'review', label: 'In review', tone: 'warn' },
  { id: 'completed', label: 'Done', tone: 'ok' },
];

/* ── Task type labels ── */
export const TB_TYPE: Record<string, string> = {
  milestone: 'Milestone',
  deliverable: 'Deliverable',
  review: 'Review',
  approval: 'Approval',
  action: 'Action',
};

/* ── sourceEntityType -- the 7-table provenance (Gap 1) ── */
export const TB_SRC: Record<string, TaskSource> = {
  unified: { l: 'Board', t: 'unifiedTasks' },
  section: { l: 'Section', t: 'projectTasks -- section state-machine' },
  pyramid: { l: 'Pyramid', t: 'in-memory -- not persisted' },
  wbs: { l: 'WBS', t: 'project_tasks -- legacy/CRO' },
  template: { l: 'Template', t: 'taskTemplates' },
  module: { l: 'Module', t: 'crossModuleTaskLinks' },
};

/* ── Projects ── */
export const TB_PROJECTS: ProjectEntry[] = [
  { id: 'bx204', label: 'BX-204 -- NDA 212345', type: 'NDA' },
  { id: 'or902', label: 'OR-902 Spinal Implant', type: '510(k)' },
  { id: 'iv415', label: 'IV-415 Companion Dx', type: 'CER/IVDR' },
];

/* ── Team members ── */
export const TB_TEAM: Record<string, TeamMember> = {
  jc: { n: 'J. Chen', t: 'Reg Affairs' },
  mw: { n: 'M. Wei', t: 'Biostat' },
  am: { n: 'A. Muller', t: 'EU Reg' },
  sm: { n: 'S. Marchetti', t: 'Reg lead' },
  rn: { n: 'R. Nair', t: 'Clinical' },
  mb: { n: 'M. Webb', t: 'Medical writer' },
  qa: { n: 'QA', t: 'Quality' },
};

/* ── Optimal assignee per module (getOptimalAssignee) ── */
export const TB_OPTIMAL: Record<string, string> = {
  Biostatistics: 'mw',
  Safety: 'rn',
  CMC: 'qa',
  'Medical Device': 'mb',
  Clinical: 'rn',
  Regulatory: 'jc',
  eCTD: 'sm',
  IND: 'jc',
  Nonclinical: 'rn',
  Vault: 'sm',
  'Protocol Design': 'rn',
};

/* ── unifiedTasks rows (a DAG via dependsOn). taskId is the unique business key. ── */
export const TB_TASKS: TaskItem[] = [
  { taskId: 'C2C-TASK-2031', title: 'Reconcile ORR with locked CSR-201 dataset', project: 'bx204', moduleType: 'Biostatistics', taskType: 'deliverable', status: 'review', priority: 'critical', assignee: 'mw', assignedBy: 'sm', progress: 80, impactScore: 9, criticalPath: true, regulatoryImpact: true, approvalRequired: true, approvalStatus: 'pending', dependsOn: [], blocks: ['C2C-TASK-2041'], comments: 6, attachments: 3, source: 'section', due: 'in 2 days', phase: 'M5 Clinical' },
  { taskId: 'C2C-TASK-2041', title: 'Lock Pop-PK model; cross-reference 2.7.2', project: 'bx204', moduleType: 'Biostatistics', taskType: 'deliverable', status: 'in-progress', priority: 'critical', assignee: 'mw', assignedBy: 'sm', progress: 55, impactScore: 9, criticalPath: true, regulatoryImpact: true, approvalRequired: true, approvalStatus: 'not_started', dependsOn: ['C2C-TASK-2031'], blocks: ['C2C-TASK-2052'], comments: 4, attachments: 2, source: 'section', due: 'in 4 days', phase: 'M5 Clinical' },
  { taskId: 'C2C-TASK-2052', title: 'Author 2.5.4 efficacy -- claim-to-evidence pass', project: 'bx204', moduleType: 'Clinical', taskType: 'deliverable', status: 'pending', priority: 'high', assignee: 'jc', assignedBy: 'sm', progress: 0, impactScore: 8, criticalPath: true, regulatoryImpact: true, approvalRequired: false, approvalStatus: 'not_started', dependsOn: ['C2C-TASK-2041'], blocks: ['C2C-TASK-2061'], comments: 1, attachments: 0, source: 'pyramid', due: 'in 9 days', phase: 'M2 Summaries' },
  { taskId: 'C2C-TASK-2061', title: 'Compile 2.5 Clinical overview; freeze gate', project: 'bx204', moduleType: 'eCTD', taskType: 'milestone', status: 'pending', priority: 'high', assignee: 'sm', assignedBy: 'sm', progress: 0, impactScore: 10, criticalPath: true, regulatoryImpact: true, approvalRequired: true, approvalStatus: 'not_started', dependsOn: ['C2C-TASK-2052'], blocks: [], comments: 0, attachments: 0, source: 'pyramid', due: 'in 16 days', phase: 'M2 Summaries' },
  { taskId: 'C2C-TASK-1990', title: 'Module 3 CMC comparability protocol', project: 'bx204', moduleType: 'CMC', taskType: 'deliverable', status: 'in-progress', priority: 'critical', assignee: 'qa', assignedBy: 'sm', progress: 40, impactScore: 9, criticalPath: true, regulatoryImpact: true, approvalRequired: true, approvalStatus: 'pending', dependsOn: [], blocks: ['C2C-TASK-2061'], comments: 9, attachments: 5, source: 'module', due: 'in 6 days', phase: 'M3 Quality' },
  { taskId: 'C2C-TASK-2070', title: 'Resolve FAERS signal adjudication (3 events)', project: 'bx204', moduleType: 'Safety', taskType: 'action', status: 'in-progress', priority: 'urgent', assignee: 'rn', assignedBy: 'sm', progress: 30, impactScore: 8, criticalPath: false, regulatoryImpact: true, approvalRequired: false, approvalStatus: 'not_started', dependsOn: [], blocks: [], comments: 5, attachments: 1, source: 'unified', due: 'overdue 1 day', phase: 'M2 Summaries', blocked: true, blockedReason: 'Awaiting medical review of case 22-118' },
  { taskId: 'C2C-TASK-2088', title: 'Pediatric study plan (PSP) initial', project: 'bx204', moduleType: 'Regulatory', taskType: 'deliverable', status: 'pending', priority: 'medium', assignee: 'jc', assignedBy: 'sm', progress: 0, impactScore: 5, criticalPath: false, regulatoryImpact: true, approvalRequired: false, approvalStatus: 'not_started', dependsOn: [], blocks: [], comments: 0, attachments: 0, source: 'template', due: 'in 21 days', phase: 'M1 Admin' },
  { taskId: 'C2C-TASK-1820', title: 'IND safety report -- 15-day reconcile', project: 'bx204', moduleType: 'Safety', taskType: 'review', status: 'completed', priority: 'high', assignee: 'rn', assignedBy: 'sm', progress: 100, impactScore: 7, criticalPath: false, regulatoryImpact: true, approvalRequired: true, approvalStatus: 'approved', dependsOn: [], blocks: [], comments: 3, attachments: 2, source: 'unified', due: 'done', phase: 'M5 Clinical' },
  { taskId: 'C2C-TASK-2102', title: 'Predicate K213992 -- SE comparison matrix', project: 'or902', moduleType: 'Medical Device', taskType: 'deliverable', status: 'in-progress', priority: 'critical', assignee: 'mb', assignedBy: 'sm', progress: 65, impactScore: 9, criticalPath: true, regulatoryImpact: true, approvalRequired: false, approvalStatus: 'not_started', dependsOn: [], blocks: ['C2C-TASK-2110'], comments: 7, attachments: 4, source: 'section', due: 'in 3 days', phase: '510K.5 SE' },
  { taskId: 'C2C-TASK-2110', title: 'Assemble eSTAR package; gate validate', project: 'or902', moduleType: 'Medical Device', taskType: 'milestone', status: 'pending', priority: 'high', assignee: 'sm', assignedBy: 'sm', progress: 0, impactScore: 10, criticalPath: true, regulatoryImpact: true, approvalRequired: true, approvalStatus: 'not_started', dependsOn: ['C2C-TASK-2102'], blocks: [], comments: 0, attachments: 0, source: 'pyramid', due: 'in 12 days', phase: '510K.10 Assemble' },
  { taskId: 'C2C-TASK-2120', title: 'ISO 11135:2024 sterilization 13 update', project: 'or902', moduleType: 'Medical Device', taskType: 'action', status: 'review', priority: 'medium', assignee: 'qa', assignedBy: 'sm', progress: 90, impactScore: 6, criticalPath: false, regulatoryImpact: false, approvalRequired: true, approvalStatus: 'pending', dependsOn: [], blocks: [], comments: 2, attachments: 1, source: 'unified', due: 'in 5 days', phase: '510K.7 Performance' },
  { taskId: 'C2C-TASK-2150', title: 'FAERS/literature scan -- CER 7 clinical eval', project: 'iv415', moduleType: 'Clinical', taskType: 'deliverable', status: 'in-progress', priority: 'high', assignee: 'am', assignedBy: 'am', progress: 45, impactScore: 7, criticalPath: true, regulatoryImpact: true, approvalRequired: false, approvalStatus: 'not_started', dependsOn: [], blocks: [], comments: 3, attachments: 2, source: 'wbs', due: 'in 8 days', phase: 'Annex XIV' },
  { taskId: 'C2C-TASK-2155', title: 'GSPR Annex I conformity checklist', project: 'iv415', moduleType: 'Regulatory', taskType: 'review', status: 'pending', priority: 'medium', assignee: 'am', assignedBy: 'am', progress: 0, impactScore: 5, criticalPath: false, regulatoryImpact: true, approvalRequired: true, approvalStatus: 'not_started', dependsOn: [], blocks: [], comments: 0, attachments: 0, source: 'wbs', due: 'in 14 days', phase: 'Annex I' },
  { taskId: 'C2C-TASK-1760', title: 'Pre-IND briefing book -- Q-Sub bundle', project: 'bx204', moduleType: 'Regulatory', taskType: 'approval', status: 'completed', priority: 'high', assignee: 'sm', assignedBy: 'sm', progress: 100, impactScore: 8, criticalPath: false, regulatoryImpact: true, approvalRequired: true, approvalStatus: 'approved', dependsOn: [], blocks: [], comments: 11, attachments: 6, source: 'unified', due: 'done', phase: 'Pre-IND' },
];

/* ── Workflow templates (taskTemplates) ── */
export const TB_WORKFLOWS: WorkflowTemplate[] = [
  {
    templateId: 'TMPL-NDA-FILING', name: 'NDA / BLA filing workflow', category: 'Submission', submissionType: 'NDA',
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
    dependencies: [['t1', 't5'], ['t2', 't5'], ['t3', 't5'], ['t4', 't5'], ['t5', 't6']],
  },
  {
    templateId: 'TMPL-510K', name: '510(k) submission workflow', category: 'Submission', submissionType: '510k',
    regulatoryRequirements: ['21 CFR 807', 'eSTAR'],
    riskFactors: ['predicate validity', 'performance testing gaps'],
    milestones: ['SE argument complete', 'eSTAR assembled'],
    tasks: [
      { id: 't1', title: 'Predicate search + substantial-equivalence matrix', moduleType: 'Medical Device', dayOffset: 0, duration: 6, priority: 'critical', estimatedHours: 24 },
      { id: 't2', title: 'Performance testing summary (bench + biocompat)', moduleType: 'Medical Device', dayOffset: 3, duration: 8, priority: 'high', estimatedHours: 32 },
      { id: 't3', title: 'Draft labeling / IFU + human factors', moduleType: 'Regulatory', dayOffset: 5, duration: 6, priority: 'medium', estimatedHours: 20 },
      { id: 't4', title: 'Assemble eSTAR package + gate validate', moduleType: 'Medical Device', taskType: 'milestone', dayOffset: 12, duration: 2, priority: 'high', estimatedHours: 8 },
    ],
    dependencies: [['t1', 't4'], ['t2', 't4'], ['t3', 't4']],
  },
  {
    templateId: 'TMPL-IND', name: 'IND-enabling workflow', category: 'Submission', submissionType: 'IND',
    regulatoryRequirements: ['21 CFR 312.23', 'ICH M4'],
    riskFactors: ['GLP tox timing', 'CMC readiness'],
    milestones: ['IND content complete', 'Forms signed'],
    tasks: [
      { id: 't1', title: 'Nonclinical / Module 4 GLP study reports + SEND', moduleType: 'Nonclinical', dayOffset: 0, duration: 10, priority: 'high', estimatedHours: 40 },
      { id: 't2', title: 'CMC Module 3 initial (drug substance + product)', moduleType: 'CMC', dayOffset: 0, duration: 12, priority: 'critical', estimatedHours: 48 },
      { id: 't3', title: 'Clinical protocol + investigator brochure', moduleType: 'Clinical', dayOffset: 4, duration: 8, priority: 'high', estimatedHours: 32 },
      { id: 't4', title: 'Forms 1571 / 1572 / 3674 + IND assembly', moduleType: 'Regulatory', taskType: 'milestone', dayOffset: 14, duration: 2, priority: 'high', estimatedHours: 8 },
    ],
    dependencies: [['t1', 't4'], ['t2', 't4'], ['t3', 't4']],
  },
];
