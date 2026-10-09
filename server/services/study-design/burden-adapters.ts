/**
 * Adapters from this repository's two Schedule-of-Activities models onto the one
 * burden engine input ({@link BurdenMatrix}).
 *
 * The engine in `burden-model.ts` takes a plain matrix precisely so there is one
 * implementation and two callers, rather than a burden engine per SoA model:
 *
 *   - {@link burdenMatrixFromDesign} — the study-design spine
 *     (`study-design-types.ts`), the primary input. Its `SoaActivity` carries no
 *     duration and no invasiveness, so those are passed as null and the engine
 *     reports the derived measures absent rather than as zero.
 *   - {@link burdenMatrixFromProtocolSoaMatrix} — the protocol read model
 *     (`../protocol-soa/protocol-soa-logic.ts`). Its `timepoint` is free text, so
 *     there is no study day and the duration measure is absent too; it has no arm
 *     count; and its `required` boolean maps onto performed/optional.
 *
 * Pure and deterministic: no DB, no clock, no RNG, no LLM.
 *
 * @module server/services/study-design/burden-adapters
 */

import type { SoaMatrix as ProtocolSoaMatrix } from '../protocol-soa/protocol-soa-logic';
import type { StudyDesign } from './study-design-types';
import {
  absentBurdenProfile,
  computeBurdenProfile,
  type BurdenCellState,
  type BurdenMatrix,
  type BurdenProfile,
} from './burden-model';

const DESIGN_SOURCE = 'study-design ScheduleOfActivities (server/services/study-design/study-design-types.ts)';
const PROTOCOL_SOURCE = 'protocol-soa SoaMatrix (server/services/protocol-soa/protocol-soa-logic.ts)';

/**
 * Adapt the study-design spine's Schedule of Activities onto the engine input.
 * Returns null when the design carries no schedule — there is nothing to measure,
 * which the caller reports as absent rather than as a zero-burden design.
 */
export function burdenMatrixFromDesign(design: StudyDesign): BurdenMatrix | null {
  const soa = design.scheduleOfActivities;
  if (!soa) return null;
  return {
    source: DESIGN_SOURCE,
    visits: [...(soa.visits ?? [])]
      .sort((a, b) => a.order - b.order)
      .map(v => ({
        id: v.id,
        name: v.name,
        studyDay: typeof v.studyDay === 'number' ? v.studyDay : null,
        // The flag is a boolean on this model: absent means "not unscheduled".
        unscheduled: v.unscheduled === true,
      })),
    activities: [...(soa.activities ?? [])]
      .sort((a, b) => a.order - b.order)
      .map(a => ({
        id: a.id,
        name: a.name,
        category: a.category,
        // SoaActivity carries neither duration nor invasiveness. Left absent, never defaulted.
        participantMinutes: null,
        invasiveness: null,
      })),
    cells: (soa.cells ?? []).map(c => ({ activityId: c.activityId, visitId: c.visitId, state: c.state })),
    armCount: Array.isArray(design.arms) ? design.arms.length : null,
  };
}

/** Burden profile for a study design; absent (not zero) when it carries no schedule. */
export function burdenProfileForDesign(design: StudyDesign): BurdenProfile {
  const matrix = burdenMatrixFromDesign(design);
  if (!matrix) {
    return absentBurdenProfile(DESIGN_SOURCE, 'The design carries no Schedule of Activities.');
  }
  return computeBurdenProfile(matrix);
}

/**
 * Adapt the protocol read model's SoA matrix onto the same engine input, so the
 * protocol surface measures burden with this engine rather than a second one.
 * That model has no study day (its `timepoint` is free text), no arm count and no
 * per-activity duration, so those measures come back absent — correctly.
 * `required: false` maps onto `optional`; `required: true` onto `performed`.
 */
export function burdenMatrixFromProtocolSoaMatrix(matrix: ProtocolSoaMatrix): BurdenMatrix {
  return {
    source: PROTOCOL_SOURCE,
    visits: matrix.columns.map(c => ({
      id: String(c.visitId),
      name: c.visitName,
      studyDay: null,
      unscheduled: null,
    })),
    activities: matrix.rows.map(r => ({
      id: String(r.assessmentId),
      name: r.name,
      category: r.category ?? null,
      participantMinutes: null,
      invasiveness: null,
    })),
    cells: matrix.rows.flatMap(r =>
      r.cells
        .filter(c => c.present)
        .map(c => ({
          activityId: String(r.assessmentId),
          visitId: String(c.visitId),
          state: (c.required ? 'performed' : 'optional') as BurdenCellState,
        })),
    ),
    armCount: null,
  };
}
