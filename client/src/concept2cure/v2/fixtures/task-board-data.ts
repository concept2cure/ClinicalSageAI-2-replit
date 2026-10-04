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

/* ── Module type palette (projectTasks.moduleColor) ──
   Each value is a design token (`--module-*`, design-system/colors_and_type.css),
   with a light and a dark value and each held to AA as chip text by
   check-token-contrast. Until 2026-09-28 (design-system G2) these were raw hex
   with no dark pair, eight of them below AA. MODULE_COLOR_UNKNOWN is the colour
   of a module this map does not name. */
export const MODULE_COLOR_UNKNOWN = 'var(--text-300)';
export const TB_MOD: Record<string, string> = {
  CMC: 'var(--module-cmc)',
  IND: 'var(--module-ind)',
  // Both spellings: the server enum / demo seed use the space-less keys
  // (MedicalDevice, ProtocolDesign) while older rows may carry the spaced
  // labels — a live row must never fall through to grey (assessment D7).
  'Medical Device': 'var(--module-device)',
  MedicalDevice: 'var(--module-device)',
  eCTD: 'var(--module-ectd)',
  Vault: 'var(--module-vault)',
  'Protocol Design': 'var(--module-protocol)',
  ProtocolDesign: 'var(--module-protocol)',
  Clinical: 'var(--module-ind)',
  Nonclinical: 'var(--module-nonclinical)',
  Biostatistics: 'var(--module-biostatistics)',
  Safety: 'var(--module-safety)',
  Regulatory: 'var(--module-cmc)',
  general: 'var(--module-cmc)',
};

/* ── Board columns ──
   One column per NON-TERMINAL status in TASK_STATUSES, in workflow order.
   'blocked' has to be here: it is a legal target of every transition in
   TASK_TRANSITIONS, the server's unblock cascade only wakes successors that are
   literally in it, and without a column such a task rendered in no column at
   all — counted in the Blocked stat tile but invisible and unmovable on the
   board. ('cancelled' is deliberately absent; it is terminal and filtered out
   of `list` rather than given a column.) */
export const TB_COLS: BoardColumn[] = [
  { id: 'pending', label: 'To do', tone: 'idle' },
  { id: 'in-progress', label: 'In progress', tone: 'ai' },
  // 'err', not 'warn': blocked work is stuck and needs intervention, review is
  // healthy work awaiting a reader. Both carried 'warn' at first, which made the
  // two column dots the identical amber — indistinguishable in the one place a
  // board is scanned fastest. The palette's semantic split is amber = attention,
  // red = critical (kdot[data-tone="err"], app-v2.css:457).
  { id: 'blocked', label: 'Blocked', tone: 'err' },
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
  // Other stores, read through the cross-store work view (2026-10-01). Their
  // cards are read-only on the board and open where they live.
  schedule: { l: 'Schedule', t: 'project_tasks -- the schedule and Communication Center' },
  correspondence: { l: 'Correspondence', t: 'c2c_project_work_items -- agency correspondence' },
  review: { l: 'Review', t: 'c2c_project_work_items -- review work' },
  filing: { l: 'Filing', t: 'estar_submissions -- tracked filings' },
};


/* ── Default assignee per module. A constant lookup, not a computation.
     The real getOptimalAssignee() (taskManagement.routes.ts:229) does balance
     workload, but server-side; nothing here calls it. ── */
