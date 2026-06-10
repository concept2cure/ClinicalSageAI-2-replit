/**
 * IND next-actions engine.
 *
 * Turns the lifecycle analysis (readiness verdict, clinical-hold/clock state,
 * regulatory timeline, and sequence-validation report) into ONE prioritized,
 * deduplicated checklist of what the sponsor must do next — the "what do I do
 * now" view clients act from. Pure / deterministic.
 */

import type { IndReadinessReport } from './ind-readiness-service';
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
  /** Count of expedited IND safety reports past their reporting deadline. */
  overdueSafetyReports?: number;
}

export interface IndActionItems {
  items: IndActionItem[];
  criticalCount: number;
  total: number;
}

const PRIORITY_RANK: Record<ActionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

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
  const overdue = input.overdueSafetyReports ?? 0;
  if (overdue > 0) {
    items.push({
      id: 'safety_overdue',
      priority: 'critical',
      category: 'safety',
      title: `Submit ${overdue} overdue IND safety report(s)`,
      detail: 'Expedited IND safety reports are past their 7/15-day reporting deadline.',
      cfrRef: '21 CFR 312.32',
    });
  }

  // 3. Readiness blockers (required sections / forms / safety) → high.
  if (input.readiness) {
    for (const b of input.readiness.blockers) {
      items.push({
        id: `readiness:${b.kind}:${b.code}`,
        priority: 'high',
        category: 'readiness',
        title: b.kind === 'required_form' ? `Complete form ${b.code}` : `Complete required section ${b.code}`,
        detail: b.message,
        cfrRef: '21 CFR 312.23',
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
