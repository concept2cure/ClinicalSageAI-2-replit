/**
 * One person's training on one document, today (P-49, P-50 Q1;
 * docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md §3.6): what they train on
 * next is due the day it takes effect, and someone covered after it was in
 * force is due 14 days after they were covered.
 */
import { describe, expect, it } from 'vitest';
import { trainingTaskOf, TRAINING_LATE_ASSIGNMENT_GRACE_DAYS, type TrainingTarget } from '../training-task';

const inForce: TrainingTarget = { version: '1.0', effectiveDay: '2026-10-01', effectiveAt: '2026-10-01T10:00:00.000Z', pending: false };
const pending: TrainingTarget = { version: '2.0', effectiveDay: '2026-11-16', effectiveAt: '2026-11-16T00:00:00.000Z', pending: true };

describe('trainingTaskOf', () => {
  it('is 14 days, the grace P-50 decided', () => expect(TRAINING_LATE_ASSIGNMENT_GRACE_DAYS).toBe(14));

  it('is due the day a version approved for a later day takes effect, and counts from then once acknowledged', () => {
    expect(trainingTaskOf(pending, false, '2026-10-30T09:00:00.000Z', '2026-10-30')).toEqual({ status: 'due', dueDate: '2026-11-16', lateAssignment: false, countsFrom: null });
    expect(trainingTaskOf(pending, true, '2026-10-30T09:00:00.000Z', '2026-10-30')).toMatchObject({ status: 'acknowledged', countsFrom: '2026-11-16' });
  });

  it('is due the day it took effect for someone covered before, so overdue once that day has come', () => {
    expect(trainingTaskOf(inForce, false, '2026-09-20T09:00:00.000Z', '2026-10-30')).toEqual({ status: 'overdue', dueDate: '2026-10-01', lateAssignment: false, countsFrom: null });
  });

  it('gives someone covered after it was in force 14 days from the day they were covered', () => {
    expect(trainingTaskOf(inForce, false, '2026-10-20T15:00:00.000Z', '2026-10-30')).toEqual({ status: 'due', dueDate: '2026-11-03', lateAssignment: true, countsFrom: null });
    expect(trainingTaskOf(inForce, false, '2026-10-20T15:00:00.000Z', '2026-11-03').status).toBe('overdue');
  });

  it('compares moments, not days: covered after a same-day approval is late, covered before it is not', () => {
    expect(trainingTaskOf(inForce, false, '2026-10-01T11:00:00.000Z', '2026-10-01')).toMatchObject({ lateAssignment: true, dueDate: '2026-10-15' });
    expect(trainingTaskOf(inForce, false, '2026-10-01T09:00:00.000Z', '2026-10-01')).toMatchObject({ lateAssignment: false, dueDate: '2026-10-01', status: 'overdue' });
  });

  it('gives the grace when the version records no effective moment', () => {
    expect(trainingTaskOf({ ...inForce, effectiveDay: null, effectiveAt: null }, false, '2026-10-20T15:00:00.000Z', '2026-10-30'))
      .toMatchObject({ lateAssignment: true, dueDate: '2026-11-03' });
  });

  it('has nothing to do once acknowledged', () => {
    expect(trainingTaskOf(inForce, true, '2026-09-20T09:00:00.000Z', '2026-10-30')).toMatchObject({ status: 'acknowledged', countsFrom: null });
  });
});
