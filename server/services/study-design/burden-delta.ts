/**
 * Burden delta — what an amendment did to the participant.
 *
 * The operational question at amendment time is not "how heavy is this protocol"
 * but "how much heavier did this change make it". {@link compareBurden} answers it
 * from two {@link BurdenProfile}s produced by `burden-model.ts` — the same engine,
 * no second measurement path.
 *
 * Two honesty properties carry over from the profile:
 *   - A measure absent on either side yields an ABSENT delta, naming the side that
 *     could not compute it. A delta is never taken against an assumed zero.
 *   - Visits and assessments are matched by id. A visit whose id changed reads as
 *     one removed and one added, because that is all the data supports.
 *
 * Pure and deterministic: no DB, no clock, no RNG, no LLM.
 *
 * @module server/services/study-design/burden-delta
 */

import type { DesignFinding } from './design-gates';
import {
  absentMeasure,
  burdenFinding,
  computedMeasure,
  round2,
  type BurdenAssessmentLoad,
  type BurdenPeakVisit,
  type BurdenProfile,
  type BurdenVisitLoad,
  type Measure,
  BURDEN_BASIS,
} from './burden-model';

export interface MeasureDelta {
  measure: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  status: 'computed' | 'not_computable';
  absentReason?: string;
}

export interface VisitLoadChange {
  visitId: string;
  visitName: string;
  before: number;
  after: number;
  delta: number;
}

export interface BurdenDelta {
  /** True only when both profiles have a schedule to measure. */
  comparable: boolean;
  /** Direction of travel on the scheduled-procedure count. */
  direction: 'increased' | 'decreased' | 'unchanged' | 'unknown';
  deltas: MeasureDelta[];
  addedVisits: BurdenPeakVisit[];
  removedVisits: BurdenPeakVisit[];
  /** Visits present in both, whose load changed. */
  changedVisits: VisitLoadChange[];
  addedAssessments: BurdenAssessmentLoad[];
  removedAssessments: BurdenAssessmentLoad[];
  /** Assessments present in both, scheduled at a different number of visits. */
  changedAssessments: VisitLoadChange[];
  findings: DesignFinding[];
  basis: string;
}

function numericDelta(measure: string, before: Measure<number>, after: Measure<number>): MeasureDelta {
  const b = before.status === 'computed' ? before.value : null;
  const a = after.status === 'computed' ? after.value : null;
  if (b === null || a === null) {
    const which = b === null && a === null ? 'either profile' : b === null ? 'the before profile' : 'the after profile';
    const why = (b === null ? before.absentReason : after.absentReason) ?? 'no value.';
    return {
      measure,
      before: b,
      after: a,
      delta: null,
      status: 'not_computable',
      absentReason: `Not computable on ${which}: ${why}`,
    };
  }
  return { measure, before: b, after: a, delta: round2(a - b), status: 'computed' };
}

function peakAsMeasure(profile: BurdenProfile): Measure<number> {
  const peak = profile.peakVisitLoad;
  if (peak.status !== 'computed' || peak.value === null) {
    return absentMeasure(peak.basis, peak.absentReason ?? 'No peak visit.');
  }
  return computedMeasure(peak.value.procedureCount, peak.basis);
}

function toPeakShape(load: BurdenVisitLoad): BurdenPeakVisit {
  return { visitId: load.visitId, visitName: load.visitName, procedureCount: load.procedureCount };
}

function diffVisits(before: BurdenProfile, after: BurdenProfile) {
  const beforeById = new Map(before.visits.map(v => [v.visitId, v] as const));
  const afterById = new Map(after.visits.map(v => [v.visitId, v] as const));
  const addedVisits = after.visits.filter(v => !beforeById.has(v.visitId)).map(toPeakShape);
  const removedVisits = before.visits.filter(v => !afterById.has(v.visitId)).map(toPeakShape);
  const changedVisits: VisitLoadChange[] = [];
  for (const b of before.visits) {
    const a = afterById.get(b.visitId);
    if (!a || a.procedureCount === b.procedureCount) continue;
    changedVisits.push({
      visitId: b.visitId,
      visitName: a.visitName,
      before: b.procedureCount,
      after: a.procedureCount,
      delta: a.procedureCount - b.procedureCount,
    });
  }
  return { addedVisits, removedVisits, changedVisits };
}

function diffAssessments(before: BurdenProfile, after: BurdenProfile) {
  const beforeById = new Map(before.assessments.map(a => [a.activityId, a] as const));
  const afterById = new Map(after.assessments.map(a => [a.activityId, a] as const));
  const addedAssessments = after.assessments.filter(a => !beforeById.has(a.activityId));
  const removedAssessments = before.assessments.filter(a => !afterById.has(a.activityId));
  const changedAssessments: VisitLoadChange[] = [];
  for (const b of before.assessments) {
    const a = afterById.get(b.activityId);
    if (!a || a.scheduledVisitCount === b.scheduledVisitCount) continue;
    changedAssessments.push({
      visitId: b.activityId,
      visitName: a.name,
      before: b.scheduledVisitCount,
      after: a.scheduledVisitCount,
      delta: a.scheduledVisitCount - b.scheduledVisitCount,
    });
  }
  return { addedAssessments, removedAssessments, changedAssessments };
}

function deltaFindings(procedures: MeasureDelta, peak: MeasureDelta, added: BurdenPeakVisit[]): DesignFinding[] {
  const findings: DesignFinding[] = [];
  if (procedures.delta !== null && procedures.delta > 0) {
    const visits = added.length > 0 ? ` New visit(s): ${added.map(v => v.visitName).join(', ')}.` : '';
    findings.push(
      burdenFinding(
        'BRD-030',
        'minor',
        'Amendment increases scheduled participant burden',
        `The schedule goes from ${procedures.before} to ${procedures.after} scheduled activities ` +
          `(+${procedures.delta}).${visits}`,
        'Confirm the added assessments are required, and whether re-consent covers the added burden.',
      ),
    );
  }
  if (peak.delta !== null && peak.delta > 0) {
    findings.push(
      burdenFinding(
        'BRD-031',
        'info',
        'Amendment raises the heaviest single visit',
        `The heaviest visit goes from ${peak.before} to ${peak.after} scheduled activities (+${peak.delta}).`,
        'Consider spreading the added assessments across adjacent visits.',
      ),
    );
  }
  return findings;
}

/**
 * The burden delta between two profiles — the operational question at amendment
 * time. Visits and assessments are matched by id: a visit whose id changed reads
 * as one removed and one added, which is honest about what the data supports.
 * A measure absent on either side yields an absent delta, never a delta against
 * an assumed zero.
 */
export function compareBurden(before: BurdenProfile, after: BurdenProfile): BurdenDelta {
  const procedures = numericDelta('procedureCount', before.procedureCount, after.procedureCount);
  const peak = numericDelta('peakVisitLoad', peakAsMeasure(before), peakAsMeasure(after));
  const deltas: MeasureDelta[] = [
    numericDelta('visitCount', before.visitCount, after.visitCount),
    procedures,
    numericDelta('durationDays', before.durationDays, after.durationDays),
    numericDelta('activityCount', before.activityCount, after.activityCount),
    peak,
    numericDelta('participantTimeMinutes', before.participantTimeMinutes, after.participantTimeMinutes),
  ];

  const visitDiff = diffVisits(before, after);
  const assessmentDiff = diffAssessments(before, after);

  let direction: BurdenDelta['direction'] = 'unknown';
  if (procedures.delta !== null) {
    if (procedures.delta > 0) direction = 'increased';
    else if (procedures.delta < 0) direction = 'decreased';
    else direction = 'unchanged';
  }

  return {
    comparable: before.present && after.present,
    direction,
    deltas,
    ...visitDiff,
    ...assessmentDiff,
    findings: deltaFindings(procedures, peak, visitDiff.addedVisits),
    basis: BURDEN_BASIS,
  };
}
