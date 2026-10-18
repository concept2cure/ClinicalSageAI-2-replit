import type { GeneratedMilestone, GeneratedSchedule } from './generator';
import type { ScheduleStatus } from './health';

/** A changed requirement must be reviewed instead of inheriting old actuals. */
export class SchedulePreservationConflict extends Error {
  readonly code = 'SCHEDULE_REVIEW_REQUIRED';

  constructor(reason: string) {
    super(`The existing schedule needs review before regeneration: ${reason}. No schedule changes were saved.`);
    this.name = 'SchedulePreservationConflict';
  }
}

export interface StoredScheduleMilestone {
  id: number;
  name: string;
  description: string | null;
  order: number;
  status: string;
  start_date: Date | null;
  due_date: Date | null;
  metadata: unknown;
  [column: string]: unknown;
}

export interface StoredSchedulePlan {
  id: number;
  version: number;
  project_type: string | null;
  regulatory_framework: string | null;
  [column: string]: unknown;
}

export function scheduleMetadata(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { /* Invalid metadata is not a source of milestone identity. */ }
  }
  return {};
}

function keyOf(value: unknown, seen: Set<string>): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || seen.has(value)) {
    throw new SchedulePreservationConflict('milestone keys are missing or ambiguous');
  }
  seen.add(value);
  return value;
}

function dependencies(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(key => typeof key !== 'string' || !key.trim())) {
    throw new SchedulePreservationConflict('a milestone dependency cannot be identified');
  }
  return [...new Set(value as string[])].sort();
}

function existingDefinition(row: StoredScheduleMilestone): string {
  const md = scheduleMetadata(row.metadata);
  return JSON.stringify([
    row.name, row.description ?? null, md.category ?? null,
    md.regulatoryBasis ?? null, dependencies(md.dependsOn),
  ]);
}

function proposedDefinition(milestone: GeneratedMilestone): string {
  return JSON.stringify([
    milestone.title, milestone.description ?? null, milestone.category,
    milestone.regulatoryBasis ?? null, dependencies(milestone.dependsOn),
  ]);
}

/** Pure matching; no completion is carried across a different requirement. */
export function planMilestonePreservation(
  previousPlan: StoredSchedulePlan | null,
  previousRows: StoredScheduleMilestone[],
  proposal: GeneratedSchedule,
): { matches: Map<string, StoredScheduleMilestone>; newMilestoneKeys: string[]; preservedMilestoneIds: number[] } {
  if (!previousPlan && previousRows.length) {
    throw new SchedulePreservationConflict('existing milestones have no recorded plan');
  }
  if (previousPlan && (previousPlan.project_type !== proposal.projectType
    || previousPlan.regulatory_framework !== proposal.framework)) {
    throw new SchedulePreservationConflict('the regulatory pathway or framework changed');
  }
  const oldKeys = new Set<string>();
  const oldRows = new Map(previousRows.map(row => [keyOf(scheduleMetadata(row.metadata).key, oldKeys), row]));
  const newKeys = new Set<string>();
  const proposed = new Map(proposal.milestones.map(m => [keyOf(m.key, newKeys), m]));
  for (const [key, row] of oldRows) {
    const milestone = proposed.get(key);
    if (!milestone) throw new SchedulePreservationConflict(`milestone "${key}" was removed`);
    if (existingDefinition(row) !== proposedDefinition(milestone)) {
      throw new SchedulePreservationConflict(`the requirement for milestone "${key}" changed`);
    }
  }
  return {
    matches: oldRows,
    newMilestoneKeys: [...proposed.keys()].filter(key => !oldRows.has(key)),
    preservedMilestoneIds: previousRows.map(row => row.id),
  };
}

export function isCompletedMilestone(row: StoredScheduleMilestone): boolean {
  return row.status === 'completed' || scheduleMetadata(row.metadata).scheduleStatus === 'completed';
}

export function milestoneScheduleStatus(row: StoredScheduleMilestone): ScheduleStatus {
  return isCompletedMilestone(row)
    ? 'completed' : (scheduleMetadata(row.metadata).scheduleStatus as ScheduleStatus) || 'not_started';
}

function normalizedScheduleReason(reason: unknown): string | null {
  return typeof reason === 'string' ? reason.trim() || null : null;
}

export function generatedScheduleRevisionDetail(
  before: { plan: StoredSchedulePlan | null; milestones: StoredScheduleMilestone[] },
  proposal: GeneratedSchedule,
  toVersion: number,
  preservation: ReturnType<typeof planMilestonePreservation>,
  reason: unknown,
) {
  return {
    basisSummary: proposal.basisSummary, confidence: proposal.confidence, milestoneCount: proposal.milestones.length,
    fromVersion: before.plan?.version ?? null,
    toVersion,
    before,
    proposal,
    preservedMilestoneIds: preservation.preservedMilestoneIds,
    newMilestoneKeys: preservation.newMilestoneKeys,
    reason: normalizedScheduleReason(reason),
  };
}
