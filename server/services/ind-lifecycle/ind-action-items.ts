/**
 * IND next-actions engine.
 *
 * Turns the lifecycle analysis (readiness verdict, clinical-hold/clock state,
 * regulatory timeline, and sequence-validation report) into ONE prioritized,
 * deduplicated checklist of what the sponsor must do next — the "what do I do
 * now" view clients act from. Pure / deterministic.
 */

import {
  OVERDUE_SAFETY_REPORTS_NOT_ASSESSED,
  type IndReadinessReport,
  type ReadinessBlocker,
} from './ind-readiness-service';
import type { ClockState } from './ind-regulatory-clock';
import type { IndTimeline } from './ind-timeline-service';
import type { SequenceValidationReport } from './ind-sequence-validation';

export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';
export type ActionCategory = 'hold' | 'safety' | 'readiness' | 'validation' | 'deadline';

export interface IndActionItem {
  id: string;
  priority: ActionPriority;
  category: ActionCategory;
  title: string;
  detail: string;
  cfrRef?: string;
  /** ISO due date when the action is time-bound (e.g. an upcoming report). */
  dueDate?: string;
}

export interface IndActionItemsInput {
  readiness?: IndReadinessReport | null;
  clock?: ClockState | null;
  timeline?: IndTimeline | null;
  sequenceValidation?: SequenceValidationReport | null;
  /**
   * Count of TRACKED expedited IND safety reports past their reporting deadline
   * (drafted reports in the register). Omitted → an action says it was not
   * assessed, unless the readiness in scope is for an initial IND.
   */
  overdueSafetyReports?: number;
}

export interface IndActionItems {
  items: IndActionItem[];
  criticalCount: number;
  total: number;
}

const PRIORITY_RANK: Record<ActionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** A readiness blocker's action title, by what kind of blocker it is. */
function readinessActionTitle(b: ReadinessBlocker): string {
  switch (b.kind) {
    case 'required_form':
      return `Complete form ${b.code}`;
    case 'required_section':
      return `Complete required section ${b.code}`;
    case 'overdue_safety_report':
      return 'Submit the overdue tracked IND safety report(s)';
    case 'nothing_assessed':
      return b.code === OVERDUE_SAFETY_REPORTS_NOT_ASSESSED ? 'Overdue IND safety reports not assessed' : `Not assessed: ${b.code}`;
    case 'lifecycle':
      return `Resolve lifecycle issue ${b.code}`;
  }
}

/**
 * The overdue IND safety-report action, if any. 2026-10-15: an omitted count
 * read as zero (no action); it is now an action saying it was not assessed. An
 * initial IND has no IND safety reports yet, so nothing is asked of it.
 */
function safetyActionItem(input: IndActionItemsInput): IndActionItem | null {
  const overdue = typeof input.overdueSafetyReports === 'number' ? input.overdueSafetyReports : null;
  if (overdue !== null && overdue > 0) {
    return {
      id: 'safety_overdue',
      priority: 'critical',
      category: 'safety',
      title: `Submit ${overdue} overdue tracked IND safety report(s)`,
      detail:
        'Tracked expedited IND safety reports are past their 7/15-day reporting deadline. Tracked reports only: an adverse ' +
        'event whose clock has lapsed with no drafted report is not counted.',
      cfrRef: '21 CFR 312.32',
    };
  }
  if (overdue === null && input.readiness?.filingType !== 'initial') {
    return {
      id: 'safety_not_assessed',
      priority: 'high',
      category: 'safety',
      title: 'Overdue IND safety reports not assessed',
      detail:
        'No count of expedited IND safety reports past their 7/15-day deadline was supplied, so none is assumed. ' +
        'Establish it from the safety-report register.',
      cfrRef: '21 CFR 312.32',
    };
  }
  return null;
}

/** Readiness blockers that state the same fact as the safety action above them. */
function isSafetyBlocker(b: ReadinessBlocker): boolean {
  return b.kind === 'overdue_safety_report' || (b.kind === 'nothing_assessed' && b.code === OVERDUE_SAFETY_REPORTS_NOT_ASSESSED);
}

/**
 * Derive the prioritized action list. Items are sorted critical → low; within a
 * priority, time-bound items (with a dueDate) sort earliest-first.
 */
export function deriveIndActionItems(input: IndActionItemsInput): IndActionItems {
  const items: IndActionItem[] = [];

  // 1. Clinical hold — the hardest blocker (312.42).
  if (input.clock?.onHold) {
    items.push({
      id: 'hold',
      priority: 'critical',
      category: 'hold',
      title: 'Resolve the clinical hold',
      detail: input.clock.rationale,
      cfrRef: '21 CFR 312.42',
    });
  }

  // 2. Overdue expedited safety reports (312.32).
  const safety = safetyActionItem(input);
  if (safety) items.push(safety);
  const safetyItemStated = safety !== null;

  // 3. Readiness blockers (required sections / forms / safety) → high. A safety
  //    blocker is not repeated when step 2 already states that fact.
  if (input.readiness) {
    for (const b of input.readiness.blockers) {
      if (safetyItemStated && isSafetyBlocker(b)) continue;
      items.push({
        id: `readiness:${b.kind}:${b.code}`,
        priority: 'high',
        category: 'readiness',
        title: readinessActionTitle(b),
        detail: b.message,
        cfrRef: isSafetyBlocker(b) ? '21 CFR 312.32' : '21 CFR 312.23',
      });
    }
  }

  // 4. Sequence-validation gaps — required sections with no leaf in the assembled
  //    sequence → high (only those not already named by a readiness blocker).
  if (input.sequenceValidation) {
    const readinessCodes = new Set((input.readiness?.blockers ?? []).map((b) => b.code));
    for (const m of input.sequenceValidation.missing) {
      if (readinessCodes.has(m.code)) continue;
      items.push({
        id: `validation:${m.code}`,
        priority: 'high',
        category: 'validation',
        title: `Add a leaf for required section ${m.code}`,
        detail: `${m.title} (${m.module}) has no leaf in the assembled sequence.`,
        cfrRef: m.regulatoryRef,
      });
    }
  }

  // 5. Upcoming deadlines (timeline due_soon) → medium, time-bound.
  if (input.timeline) {
    for (const ms of input.timeline.milestones) {
      if (ms.status === 'due_soon') {
        items.push({
          id: `deadline:${ms.key}`,
          priority: 'medium',
          category: 'deadline',
          title: `Prepare: ${ms.label}`,
          detail: `Due in ${ms.daysFromNow} day(s).`,
          cfrRef: ms.cfrRef,
          dueDate: ms.date,
        });
      }
    }
  }

  items.sort((a, b) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    // Time-bound items first (earliest due), then stable by id.
    if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return {
    items,
    criticalCount: items.filter((i) => i.priority === 'critical').length,
    total: items.length,
  };
}
