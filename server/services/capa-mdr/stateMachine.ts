/**
 * State machine for the CAPA / complaint / MDR triage workflow.
 *
 * Each lifecycle has a state map listing the allowed next states. A
 * transition request is accepted only if (current, next) is in the map for
 * that entity type. The service layer calls `assertTransition` before any
 * state-mutating write so the audit trail records only valid moves.
 *
 * The maps are intentionally narrow. New transitions should be added with a
 * regulatory rationale (CFR/MDR/ISO citation) in this file, not bolted in
 * at the route layer.
 */

import type {
  ActionState,
  CapaState,
  ComplaintState,
  MdrState,
} from '@shared/schema/capa-mdr';
import { ACTION_TRANSITIONS, CAPA_TRANSITIONS, COMPLAINT_TRANSITIONS, MDR_TRANSITIONS } from '@shared/constants/capa-lifecycle';

// ─────────────────────────────────────────────────────────────────────────────
// Complaint lifecycle (21 CFR 820.198) and MDR lifecycle (21 CFR 803 / EU MDR Article 87)
// ─────────────────────────────────────────────────────────────────────────────

// The maps are shared with Quality's complaint and MDR registers (P-122): shared/constants/capa-lifecycle.ts.

// ─────────────────────────────────────────────────────────────────────────────
// CAPA lifecycle (21 CFR 820.100)
// ─────────────────────────────────────────────────────────────────────────────

// The map is shared with the Quality CAPA register: shared/constants/capa-lifecycle.ts.

// ─────────────────────────────────────────────────────────────────────────────
// Action item lifecycle (per 21 CFR 820.100(a)(2-3))
// ─────────────────────────────────────────────────────────────────────────────

// The map is shared with the Quality CAPA register: shared/constants/capa-lifecycle.ts.

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export class InvalidTransitionError extends Error {
  constructor(entity: string, from: string, to: string, prerequisite?: string) {
    super(prerequisite ?? `Invalid ${entity} transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function complaintTransitions(state: ComplaintState): readonly ComplaintState[] {
  return COMPLAINT_TRANSITIONS[state];
}

export function mdrTransitions(state: MdrState): readonly MdrState[] {
  return MDR_TRANSITIONS[state];
}

export function capaTransitions(state: CapaState): readonly CapaState[] {
  return CAPA_TRANSITIONS[state];
}

export function actionTransitions(state: ActionState): readonly ActionState[] {
  return ACTION_TRANSITIONS[state];
}

export function assertComplaintTransition(from: ComplaintState, to: ComplaintState): void {
  if (!COMPLAINT_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError('complaint', from, to);
  }
}

export function assertMdrTransition(from: MdrState, to: MdrState): void {
  if (!MDR_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError('mdr_event', from, to);
  }
}

export function assertCapaTransition(from: CapaState, to: CapaState): void {
  if (!CAPA_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError('capa_record', from, to);
  }
}

export function assertActionTransition(from: ActionState, to: ActionState): void {
  if (!ACTION_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError('capa_action', from, to);
  }
}
