/**
 * IND regulatory clock + clinical-hold tracker (21 CFR 312.40 / 312.42).
 *
 * Computes the 30-calendar-day "safe to proceed" clock and the clinical-hold
 * state from FDA's receipt date and a timeline of events. Per 312.40(b), a
 * sponsor may begin clinical investigations 30 days after FDA receives the IND
 * UNLESS the IND is placed on clinical hold; per 312.42 a hold suspends the
 * investigation until lifted.
 *
 * Pure / deterministic: given the same receipt date, events, and as-of date, it
 * yields the same state. Stateless (no DB) — the caller supplies the timeline,
 * exactly like the readiness evaluator.
 */

export type ClockStatus =
  | 'submitted' // received, within the 30-day review window
  | 'safe_to_proceed' // 30 days elapsed, no hold
  | 'clinical_hold' // full clinical hold imposed (312.42)
  | 'partial_clinical_hold' // partial hold imposed
  | 'withdrawn' // sponsor withdrew the IND
  | 'inactive'; // FDA placed the IND on inactive status (312.45)

export type ClockEventType =
  | 'clinical_hold_imposed'
  | 'partial_hold_imposed'
  | 'hold_lifted'
  | 'withdrawn'
  | 'inactivated'
  | 'reactivated';

export interface ClockEvent {
  type: ClockEventType;
  /** ISO date the event took effect. */
  date: string;
  note?: string;
}

export interface ClockInput {
  /** ISO date FDA received the original IND (starts the 30-day clock). */
  receiptDate: string;
  /** Ordered lifecycle events (holds, lifts, withdrawal, …). */
  events?: ClockEvent[];
  /** Evaluate the clock as of this ISO date (defaults to now). */
  asOf?: string;
}

export interface ClockState {
  status: ClockStatus;
  /** ISO date the 30-day clock elapses (receipt + 30 calendar days). */
  thirtyDayDate: string;
  /** True only when 30 days have elapsed AND there is no active hold/withdrawal/inactive status. */
  safeToProceed: boolean;
  /** True when a full or partial clinical hold is currently active. */
  onHold: boolean;
  /** Calendar days until the 30-day clock elapses (0 once elapsed). */
  daysUntilThirtyDay: number;
  /** Plain-language explanation of the current state. */
  rationale: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** receipt + 30 calendar days (21 CFR 312.40(b)). */
export function computeThirtyDayDate(receiptDate: string | Date): Date {
  const d = new Date(receiptDate);
  return new Date(d.getTime() + 30 * DAY_MS);
}

/** Fold the event timeline (sorted by date) into the current hold/withdrawal status. */
function deriveStatusFromEvents(events: ClockEvent[], asOf: Date): {
  holdStatus: 'none' | 'clinical_hold' | 'partial_clinical_hold';
  terminal: 'withdrawn' | 'inactive' | null;
} {
  const sorted = events
    .filter((e) => new Date(e.date).getTime() <= asOf.getTime())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let holdStatus: 'none' | 'clinical_hold' | 'partial_clinical_hold' = 'none';
  let terminal: 'withdrawn' | 'inactive' | null = null;

  for (const e of sorted) {
    switch (e.type) {
      case 'clinical_hold_imposed':
        holdStatus = 'clinical_hold';
        break;
      case 'partial_hold_imposed':
        holdStatus = 'partial_clinical_hold';
        break;
      case 'hold_lifted':
        holdStatus = 'none';
        break;
      case 'withdrawn':
        terminal = 'withdrawn';
        break;
      case 'inactivated':
        terminal = 'inactive';
        break;
      case 'reactivated':
        terminal = null;
        break;
    }
  }
  return { holdStatus, terminal };
}

/**
 * Evaluate the IND regulatory clock. The `safeToProceed` flag is the
 * authoritative gate: true ⇔ 30 days elapsed with no active hold/withdrawal.
 */
export function evaluateRegulatoryClock(input: ClockInput): ClockState {
  const asOf = input.asOf ? new Date(input.asOf) : new Date();
  const thirtyDay = computeThirtyDayDate(input.receiptDate);
  const elapsed = asOf.getTime() >= thirtyDay.getTime();
  const daysUntil = elapsed ? 0 : Math.ceil((thirtyDay.getTime() - asOf.getTime()) / DAY_MS);

  const { holdStatus, terminal } = deriveStatusFromEvents(input.events ?? [], asOf);

  let status: ClockStatus;
  let rationale: string;

  if (terminal === 'withdrawn') {
    status = 'withdrawn';
    rationale = 'The IND has been withdrawn by the sponsor; no clinical investigation may proceed under it.';
  } else if (terminal === 'inactive') {
    status = 'inactive';
    rationale = 'The IND is on inactive status (21 CFR 312.45); it must be reactivated before proceeding.';
  } else if (holdStatus === 'clinical_hold') {
    status = 'clinical_hold';
    rationale = 'A clinical hold is in effect (21 CFR 312.42); the affected investigation(s) may not proceed until the hold is lifted.';
  } else if (holdStatus === 'partial_clinical_hold') {
    status = 'partial_clinical_hold';
    rationale = 'A partial clinical hold is in effect; only the unaffected portions of the investigation may proceed.';
  } else if (elapsed) {
    status = 'safe_to_proceed';
    rationale = 'The 30-day review period has elapsed with no clinical hold; clinical investigations may proceed (21 CFR 312.40(b)).';
  } else {
    status = 'submitted';
    rationale = `Within the 30-day FDA review period; ${daysUntil} calendar day(s) remain before the investigation may begin absent a hold.`;
  }

  const onHold = status === 'clinical_hold' || status === 'partial_clinical_hold';
  const safeToProceed = elapsed && !onHold && terminal === null;

  return {
    status,
    thirtyDayDate: thirtyDay.toISOString(),
    safeToProceed,
    onHold,
    daysUntilThirtyDay: daysUntil,
    rationale,
  };
}
