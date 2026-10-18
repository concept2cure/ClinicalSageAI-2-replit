import { describe, expect, it } from 'vitest';
import { generateSchedule } from '../generator';
import {
  isCompletedMilestone, planMilestonePreservation, SchedulePreservationConflict,
  type StoredScheduleMilestone,
} from '../preservation';

const proposal = () => generateSchedule({ projectType: 'IND', baselineDate: new Date('2031-01-01Z') });
const plan = { id: 1, version: 2, project_type: 'IND', regulatory_framework: 'FDA' };
function stored(): StoredScheduleMilestone[] {
  return proposal().milestones.map((m, index) => ({
    id: index + 10, name: m.title, description: m.description ?? null, order: m.sortOrder,
    status: 'pending', start_date: m.baselineDate, due_date: m.targetDate,
    metadata: { key: m.key, category: m.category, regulatoryBasis: m.regulatoryBasis ?? null,
      dependsOn: m.dependsOn, scheduleStatus: 'not_started', progress: 0 },
  }));
}

describe('preservation identity guard', () => {
  it('matches canonical requirements while dates and generated rationale change, without mutating input', () => {
    const rows = stored();
    const before = structuredClone(rows);
    const next = generateSchedule({ projectType: 'ind', baselineDate: new Date('2032-01-01Z') });
    const decision = planMilestonePreservation(plan, rows, next);
    expect([...decision.matches.values()]).toEqual(rows);
    expect(decision.preservedMilestoneIds).toEqual(rows.map(row => row.id));
    expect(decision.newMilestoneKeys).toEqual([]);
    expect(rows).toEqual(before);
  });

  it.each(['', ' kickoff', null, undefined])('refuses an invalid proposed key (%s)', key => {
    const next = proposal();
    next.milestones[0].key = key as string;
    expect(() => planMilestonePreservation(null, [], next)).toThrow(SchedulePreservationConflict);
  });

  it('refuses duplicate proposal keys even on first creation', () => {
    const next = proposal();
    next.milestones[1].key = next.milestones[0].key;
    expect(() => planMilestonePreservation(null, [], next)).toThrow(/ambiguous/);
  });

  it.each([null, 'invalid json', '[]', []].map(metadata => ({ metadata })))('refuses unidentifiable existing metadata ($metadata)', ({ metadata }) => {
    const rows = stored();
    rows[0].metadata = metadata;
    expect(() => planMilestonePreservation(plan, rows, proposal())).toThrow(/ambiguous/);
  });

  it('accepts JSON-string metadata and compares dependency sets regardless of order or repetition', () => {
    const rows = stored();
    const row = rows.find(r => (r.metadata as any).dependsOn.length > 1)!;
    const metadata = row.metadata as any;
    row.metadata = JSON.stringify({ ...metadata, dependsOn: [...metadata.dependsOn].reverse().concat(metadata.dependsOn[0]) });
    expect(planMilestonePreservation(plan, rows, proposal()).matches.size).toBe(rows.length);
  });

  it.each(['unknown', [null]].map(dependsOn => ({ dependsOn })))('refuses malformed dependency information ($dependsOn)', ({ dependsOn }) => {
    const rows = stored();
    rows[0].metadata = { ...(rows[0].metadata as object), dependsOn };
    expect(() => planMilestonePreservation(plan, rows, proposal())).toThrow(/dependency/);
  });

  it('keeps new requirements separate from preserved identities', () => {
    const rows = stored().slice(1);
    const decision = planMilestonePreservation(plan, rows, proposal());
    expect(decision.newMilestoneKeys).toEqual(['kickoff']);
    expect(decision.preservedMilestoneIds).toEqual(rows.map(row => row.id));
    expect(decision.matches.has('kickoff')).toBe(false);
  });
});

describe('completed actuals classification', () => {
  it.each([
    { status: 'completed', scheduleStatus: 'not_started', completed: true },
    { status: 'pending', scheduleStatus: 'completed', completed: true },
    { status: 'blocked', scheduleStatus: 'in_progress', completed: false },
    { status: 'pending', scheduleStatus: 'not_started', completed: false },
  ])('respects independent row status $status and metadata status $scheduleStatus', ({ status, scheduleStatus, completed }) => {
    const row = { ...stored()[0], status, metadata: { scheduleStatus, progress: 83 } };
    expect(isCompletedMilestone(row)).toBe(completed);
    expect(row.metadata.progress).toBe(83);
    expect(row.metadata).not.toHaveProperty('completedAt');
  });
});
