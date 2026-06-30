/**
 * Canonical type definitions for ALL submission pyramids.
 *
 * Every pyramid builder (ind-pyramid.ts, nda-pyramid.ts, etc.) and the
 * SubmissionPyramidEngine MUST import from this module. No local type
 * redeclaration allowed — this is the single source of truth.
 *
 * @module services/regulatory/pyramids/types
 */

// ─── Submission Type Union ──────────────────────────────────────────────────

export type CoreSubmissionType =
  | '510K'
  | 'IND'
  | 'NDA'
  | 'BLA'
  | 'PMA'
  | 'MAA'
  | 'JNDA'
  | 'DE_NOVO';

export type IndVariantType =
  | 'IND_AMENDMENT'
  | 'IND_ANNUAL_REPORT'
  | 'IND_SAFETY_SUPPLEMENT';

export type SubmissionType = CoreSubmissionType | IndVariantType;

// ─── Risk Scoring ───────────────────────────────────────────────────────────

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface TaskRisk {
  severity: RiskSeverity;
  probability: number;
  impact: string;
  mitigations: string[];
}

// ─── Document Binding ───────────────────────────────────────────────────────

export interface DocumentBinding {
  ctdSection: string;
  sectionTitle: string;
  ectdLifecycleOp?: 'new' | 'append' | 'replace' | 'delete';
  artifactTypes?: string[];
}

// ─── Timeline Metadata ──────────────────────────────────────────────────────

export interface TaskTimeline {
  typicalStartWeek?: number;
  typicalDurationWeeks?: number;
  fdaMilestone?: string;
  regulatoryDeadlineDays?: number;
}

// ─── Sub-tasks ──────────────────────────────────────────────────────────────

export interface SubTask {
  id: string;
  name: string;
  estimatedHours: number;
  documentBinding?: DocumentBinding;
  deliverable?: string;
}

// ─── Regulatory Guidance ────────────────────────────────────────────────────

export interface RegulatoryGuidance {
  fdaGuidanceRef?: string;
  ichGuideline?: string;
  cfrReference?: string;
  keyConsiderations?: string[];
}

// ─── Cross-submission Dependencies ──────────────────────────────────────────

export interface CrossSubmissionDep {
  targetSubmissionType: SubmissionType;
  targetTaskId: string;
  relationship: 'feeds_into' | 'derived_from' | 'supersedes' | 'parallel';
  description?: string;
}

// ─── Core Task Types ────────────────────────────────────────────────────────

export interface BaseTask {
  id: string;
  name: string;
  estimatedHours: number;
  role?: string;
  critical?: boolean;
  description?: string;
  risk?: TaskRisk;
  documentBindings?: DocumentBinding[];
  subTasks?: SubTask[];
  timeline?: TaskTimeline;
  guidance?: RegulatoryGuidance;
  crossSubmissionDeps?: CrossSubmissionDep[];
  deliverables?: string[];
}

export interface PyramidTask extends BaseTask {
  phaseId: string;
  dependencies: string[];
}

// ─── Phase ──────────────────────────────────────────────────────────────────

export interface PyramidPhase {
  id: string;
  name: string;
  order: number;
  tasks: PyramidTask[];
  description?: string;
  estimatedWeeks?: number;
}

// ─── Pyramid ────────────────────────────────────────────────────────────────

export interface SubmissionPyramid {
  type: SubmissionType;
  phases: PyramidPhase[];
  tasks: PyramidTask[];
  totalEstimatedHours?: number;
  criticalPathIds?: string[];
}

// ─── Progress Tracking ──────────────────────────────────────────────────────

export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done' | 'blocked';

export interface TaskProgress {
  taskId: string;
  status: TaskStatus;
  actualHours?: number;
  startedAt?: string;
  completedAt?: string;
  assigneeId?: string;
  notes?: string;
}

export interface PhaseProgress {
  total: number;
  completed: number;
  percentComplete: number;
  estimatedHoursRemaining: number;
}

export interface ProgressSummary {
  total: number;
  completed: number;
  percentComplete: number;
  perPhase: Record<string, PhaseProgress>;
  criticalPathProgress: number;
  estimatedHoursRemaining: number;
  riskScore: number;
}

// ─── Resource Allocation ────────────────────────────────────────────────────

export interface RoleCapacity {
  role: string;
  availableHoursPerWeek: number;
}

export interface ResourceAllocation {
  role: string;
  totalRequiredHours: number;
  taskCount: number;
  criticalTaskCount: number;
}

// ─── Builder Helper ─────────────────────────────────────────────────────────

export function buildPhase(
  phaseId: string,
  name: string,
  order: number,
  baseTasks: BaseTask[],
  dependsOn?: string,
): { phase: PyramidPhase; completeId: string } {
  const dependencies = dependsOn ? [dependsOn] : [];
  const tasks: PyramidTask[] = baseTasks.map(task => ({
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
