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
 *
 * Two inputs decide whether a clearance can be stated at all (2026-10-15). The
 * engine used to read a missing `events` list as "no hold" and any date as
 * FDA's receipt, so 30 days after a program's TARGET date it returned
 * safe_to_proceed / "clinical investigations may proceed" — a statement that
 * authorises dosing — over a plan and a hold history nobody had read.
 *   - `receiptRecorded: true` says receiptDate is FDA's recorded receipt;
 *     otherwise the clock is a projection and never clears.
 *   - `events` supplied (an empty list included) is an assessed hold history;
 *     absent, onHold is null and an elapsed clock is 'undetermined'.
 */

export type ClockStatus =
  | 'submitted' // received, within the 30-day review window
  | 'safe_to_proceed' // 30 days elapsed since a recorded receipt, hold history assessed, no hold
  | 'undetermined' // 30 days elapsed since a recorded receipt, hold history not assessed
  | 'projected' // receipt not recorded: the 30-day date is a projection, never a clearance
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
  /** ISO date the 30-day clock is computed from: FDA's receipt of the original IND, or a planned date. */
  receiptDate: string;
  /**
   * True only when receiptDate is FDA's RECORDED receipt of the IND. Anything
   * else (absent, false, a truthy non-boolean) makes the clock a projection.
   */
  receiptRecorded?: boolean;
  /**
   * Ordered lifecycle events (holds, lifts, withdrawal, …). Absent means the
   * hold history was not assessed; an empty list means assessed, none.
   */
  events?: ClockEvent[];
  /** Evaluate the clock as of this ISO date (defaults to now). */
  asOf?: string;
}

export interface ClockState {
  status: ClockStatus;
  /** What the 30-day date is computed from: FDA's recorded receipt, or a date not shown to be one. */
  basis: 'fda_receipt' | 'projection';
  /** Whether a hold history (`events`) was supplied — an empty one included. */
  holdHistoryAssessed: boolean;
  /** ISO date the 30-day clock elapses (receipt + 30 calendar days). */
  thirtyDayDate: string;
  /**
   * True only when 30 days have elapsed since a recorded receipt, the hold
   * history was assessed, and nothing is active. False when a fact rules it
   * out (inside the window, a hold, a withdrawal). Null when undetermined.
   */
  safeToProceed: boolean | null;
  /** True when a full or partial clinical hold is active; null when the hold history was not assessed. */
  onHold: boolean | null;
  /** Calendar days until the 30-day clock elapses (0 once elapsed). */
  daysUntilThirtyDay: number;
  /** Plain-language explanation of the current state. */
  rationale: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const EVENT_TYPES: readonly ClockEventType[] = [
  'clinical_hold_imposed',
  'partial_hold_imposed',
  'hold_lifted',
  'withdrawn',
  'inactivated',
  'reactivated',
];

/** A supplied date, or a VALIDATION refusal naming the field (the routes answer 400). */
function dateOf(value: unknown, field: string): Date {
  const d = typeof value === 'string' || value instanceof Date ? new Date(value) : new Date(NaN);
  if (Number.isNaN(d.getTime())) throw new Error(`VALIDATION: ${field} must be a valid date.`);
  return d;
}

/**
 * The hold history as recorded: every event a known type on a readable date, or
 * a refusal naming the one that is not. 2026-10-15: an unparseable date or an
 * unknown type dropped the event, so a recorded clinical hold was ignored and,
 * 30 days after receipt, the clock answered safe_to_proceed.
 */
function readEvents(events: ClockEvent[]): ClockEvent[] {
  events.forEach((e, i) => {
    if (!EVENT_TYPES.includes(e?.type)) throw new Error(`VALIDATION: events[${i}].type must be one of ${EVENT_TYPES.join(', ')}.`);
    dateOf(e.date, `events[${i}].date`);
  });
  return events;
}

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

/** What the clock is evaluated from, once the inputs are read. */
interface ClockFacts {
  elapsed: boolean;
  daysUntil: number;
  receiptRecorded: boolean;
  holdHistoryAssessed: boolean;
  holdStatus: 'none' | 'clinical_hold' | 'partial_clinical_hold';
  terminal: 'withdrawn' | 'inactive' | null;
}

type StatusAndRationale = { status: ClockStatus; rationale: string };

/** A recorded withdrawal, inactivation or hold — a fact on either basis. */
function recordedEventStatus(f: ClockFacts): StatusAndRationale | null {
  if (f.terminal === 'withdrawn') {
    return { status: 'withdrawn', rationale: 'The IND has been withdrawn by the sponsor; no clinical investigation may proceed under it.' };
  }
  if (f.terminal === 'inactive') {
    return { status: 'inactive', rationale: 'The IND is on inactive status (21 CFR 312.45); it must be reactivated before proceeding.' };
  }
  if (f.holdStatus === 'clinical_hold') {
    return {
      status: 'clinical_hold',
      rationale: 'A clinical hold is in effect (21 CFR 312.42); the affected investigation(s) may not proceed until the hold is lifted.',
    };
  }
  if (f.holdStatus === 'partial_clinical_hold') {
    return {
      status: 'partial_clinical_hold',
      rationale: 'A partial clinical hold is in effect; only the unaffected portions of the investigation may proceed.',
    };
  }
  return null;
}

/** Where the 30-day period stands, on the basis the caller stated. */
function periodStatus(f: ClockFacts): StatusAndRationale {
  const holdNote = f.holdHistoryAssessed ? '' : ' Clinical-hold history was not assessed.';
  if (!f.receiptRecorded) {
    return {
      status: 'projected',
      rationale:
        'FDA receipt of the IND is not recorded, so the 21 CFR 312.40(b) 30-day period cannot be shown to have started; ' +
        `the 30-day date is projected from the date supplied${f.elapsed ? ' and has passed' : `, ${f.daysUntil} calendar day(s) away`}. ` +
        `This is not a clearance to proceed.${holdNote}`,
    };
  }
  if (!f.elapsed) {
    return {
      status: 'submitted',
      rationale: `Within the 30-day FDA review period; ${f.daysUntil} calendar day(s) remain before the investigation may begin absent a hold.${holdNote}`,
    };
  }
  if (!f.holdHistoryAssessed) {
    return {
      status: 'undetermined',
      rationale:
        "The 30-day review period has elapsed since FDA's recorded receipt, but no clinical-hold history was supplied, " +
        'so no clearance to begin clinical investigations can be stated (21 CFR 312.40(b), 312.42).',
    };
  }
  return {
    status: 'safe_to_proceed',
    rationale: 'The 30-day review period has elapsed with no clinical hold; clinical investigations may proceed (21 CFR 312.40(b)).',
  };
}

/** False where a fact rules a clearance out; null where nothing was established. */
function clearance(f: ClockFacts): boolean | null {
  if (f.terminal !== null || f.holdStatus !== 'none') return false;
  if (!f.receiptRecorded) return null;
  if (!f.elapsed) return false;
  return f.holdHistoryAssessed ? true : null;
}

/**
 * Evaluate the IND regulatory clock. The `safeToProceed` flag is the
 * authoritative gate: true ⇔ 30 days elapsed since a RECORDED receipt, with an
 * ASSESSED hold history showing no active hold/withdrawal; null when either was
 * not established.
 */
export function evaluateRegulatoryClock(input: ClockInput): ClockState {
  const asOf = input.asOf ? dateOf(input.asOf, 'asOf') : new Date();
  const thirtyDay = computeThirtyDayDate(dateOf(input.receiptDate, 'receiptDate'));
  const elapsed = asOf.getTime() >= thirtyDay.getTime();
  const events = Array.isArray(input.events) ? readEvents(input.events) : null;
  const facts: ClockFacts = {
    elapsed,
    daysUntil: elapsed ? 0 : Math.ceil((thirtyDay.getTime() - asOf.getTime()) / DAY_MS),
    receiptRecorded: input.receiptRecorded === true,
    holdHistoryAssessed: events !== null,
    ...deriveStatusFromEvents(events ?? [], asOf),
  };
  const { status, rationale } = recordedEventStatus(facts) ?? periodStatus(facts);
  const onHold = facts.holdStatus !== 'none' ? true : facts.holdHistoryAssessed ? false : null;

  return {
    status,
    basis: facts.receiptRecorded ? 'fda_receipt' : 'projection',
    holdHistoryAssessed: facts.holdHistoryAssessed,
    thirtyDayDate: thirtyDay.toISOString(),
    safeToProceed: clearance(facts),
    onHold,
    daysUntilThirtyDay: facts.daysUntil,
    rationale,
  };
}
