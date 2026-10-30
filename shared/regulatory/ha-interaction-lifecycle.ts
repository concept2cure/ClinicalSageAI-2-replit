/**
 * A health-authority meeting's lifecycle (ha_interactions): which status may
 * follow which, and the date each one records. One definition, enforced by the
 * server (ha-service.ts updateInteractionStatusTx) and offered by Communication's
 * Meetings tab, so a form never proposes a move the server refuses.
 *
 * The lifecycle runs one way. A meeting is requested, scheduled, held, its
 * minutes received and then closed. It may be cancelled until it is held.
 * Closed and cancelled are final: a meeting held is a fact, and a cancelled
 * request is re-made as a new one.
 *
 * @module shared/regulatory/ha-interaction-lifecycle
 */

export const HA_INTERACTION_STATUSES = ['planned', 'requested', 'scheduled', 'held', 'minutes_received', 'closed', 'cancelled'] as const;
export type HaInteractionStatus = (typeof HA_INTERACTION_STATUSES)[number];

/** The statuses each status may move to. */
export const HA_INTERACTION_NEXT: Readonly<Record<HaInteractionStatus, readonly HaInteractionStatus[]>> = {
  planned: ['requested', 'scheduled', 'cancelled'],
  requested: ['scheduled', 'cancelled'],
  scheduled: ['held', 'cancelled'],
  held: ['minutes_received', 'closed'],
  minutes_received: ['closed'],
  closed: [],
  cancelled: [],
};

/** The date a move records, by the status moved to; the others record none. */
export const HA_INTERACTION_DATE_FOR: Readonly<Partial<Record<HaInteractionStatus, 'scheduledDate' | 'heldDate' | 'minutesReceivedDate'>>> = {
  scheduled: 'scheduledDate',
  held: 'heldDate',
  minutes_received: 'minutesReceivedDate',
};

export const HA_INTERACTION_STATUS_LABEL: Readonly<Record<HaInteractionStatus, string>> = {
  planned: 'Planned',
  requested: 'Requested',
  scheduled: 'Scheduled',
  held: 'Held',
  minutes_received: 'Minutes received',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export function isHaInteractionStatus(value: unknown): value is HaInteractionStatus {
  return typeof value === 'string' && (HA_INTERACTION_STATUSES as readonly string[]).includes(value);
}

/** Why `from` may not move to `to`, or null when it may. */
export function haInteractionMoveRefusal(from: string, to: string): string | null {
  if (!isHaInteractionStatus(to)) return `"${to}" is not a meeting status.`;
  if (!isHaInteractionStatus(from)) return `The meeting's recorded status "${from}" is not one this lifecycle knows.`;
  if (HA_INTERACTION_NEXT[from].includes(to)) return null;
  return HA_INTERACTION_NEXT[from].length === 0
    ? `A ${HA_INTERACTION_STATUS_LABEL[from].toLowerCase()} meeting does not move. Record a new meeting instead.`
    : `A ${HA_INTERACTION_STATUS_LABEL[from].toLowerCase()} meeting moves to ${HA_INTERACTION_NEXT[from].map((s) => HA_INTERACTION_STATUS_LABEL[s].toLowerCase()).join(' or ')}, not ${HA_INTERACTION_STATUS_LABEL[to].toLowerCase()}.`;
}
