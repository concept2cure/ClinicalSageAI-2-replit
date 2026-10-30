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
import { ACTION_TRANSITIONS, CAPA_TRANSITIONS } from '@shared/constants/capa-lifecycle';

// ─────────────────────────────────────────────────────────────────────────────
// Complaint lifecycle (21 CFR 820.198)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * new → triaged (record triage decision)
 *           ↘ escalated_capa (route to a CAPA, complaint stays open in parallel)
 *           ↘ escalated_mdr  (route to an MDR, complaint stays open in parallel)
 * triaged → investigation (complaint requires its own investigation track)
 *         → resolved (no investigation needed; documented and resolved)
 *         → closed
 * investigation → resolved → closed
 * Any state → closed (terminal — requires closureReason).
 */
const COMPLAINT_TRANSITIONS: Record<ComplaintState, readonly ComplaintState[]> = {
  new: ['triaged', 'escalated_capa', 'escalated_mdr', 'closed'] as const,
  triaged: ['investigation', 'resolved', 'escalated_capa', 'escalated_mdr', 'closed'] as const,
  investigation: ['resolved', 'escalated_capa', 'escalated_mdr', 'closed'] as const,
  resolved: ['closed'] as const,
  closed: [] as const,
  escalated_capa: ['triaged', 'investigation', 'resolved', 'closed'] as const,
  escalated_mdr: ['triaged', 'investigation', 'resolved', 'closed'] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// MDR lifecycle (21 CFR 803 / EU MDR Article 87)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * open → preparing (drafting the report)
 * preparing → filed (transmitted to FDA ESG / NCA)
 *           → open (revert if drafting paused)
 * filed → acknowledged (regulator confirmation received)
 *       → followup_required (regulator requested more info)
 * acknowledged → followup_required → preparing (next supplemental)
 * acknowledged → closed (terminal happy path)
 * followup_required → preparing → filed → ...
 * Any state → closed (terminal — requires reason).
 */
const MDR_TRANSITIONS: Record<MdrState, readonly MdrState[]> = {
  open: ['preparing', 'closed'] as const,
  preparing: ['filed', 'open', 'closed'] as const,
  filed: ['acknowledged', 'followup_required', 'closed'] as const,
  acknowledged: ['followup_required', 'closed'] as const,
  followup_required: ['preparing', 'closed'] as const,
  closed: [] as const,
};

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
  constructor(entity: string, from: string, to: string) {
    super(`Invalid ${entity} transition: ${from} → ${to}`);
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
