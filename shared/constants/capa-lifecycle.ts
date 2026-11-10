/**
 * The CAPA lifecycle (21 CFR 820.100) and its action items' lifecycle (21 CFR
 * 820.100(a)(2-3)), and the complaint and MDR lifecycles below them: the moves the server accepts from each state. The one copy: `server/services/capa-mdr/stateMachine.ts` enforces it,
 * and the Quality CAPA register (client quality/QmsRecords.tsx) offers exactly
 * these moves. Pure, so the client imports it without the schema's drizzle.
 *
 * open → investigation (problem statement + root-cause analysis)
 * investigation → action_planned (corrective + preventive action plan drafted)
 * action_planned → action_implemented (all action items in 'done' state)
 * action_implemented → effectiveness_check
 * effectiveness_check → closed_effective | closed_not_effective | escalated
 * closed_not_effective → investigation (re-open for a fresh root-cause pass)
 * escalated → investigation
 * closed_effective is terminal.
 */
import type { ActionState, CapaState, ComplaintState, MdrState } from '../schema/capa-mdr';

/**
 * The complaint lifecycle (21 CFR 820.198), moved here from server/services/capa-mdr/stateMachine.ts on 2026-11-10
 * (P-122) so Quality's complaint register offers exactly the moves the server accepts, as the CAPA register does.
 *
 * new → triaged (record triage decision)
 *           ↘ escalated_capa (route to a CAPA, complaint stays open in parallel)
 *           ↘ escalated_mdr  (route to an MDR, complaint stays open in parallel)
 * triaged → investigation (complaint requires its own investigation track)
 *         → resolved (no investigation needed; documented and resolved)
 *         → closed
 * investigation → resolved → closed
 * Any state → closed (terminal — requires closureReason).
 */
export const COMPLAINT_TRANSITIONS: Record<ComplaintState, readonly ComplaintState[]> = {
  new: ['triaged', 'escalated_capa', 'escalated_mdr', 'closed'] as const,
  triaged: ['investigation', 'resolved', 'escalated_capa', 'escalated_mdr', 'closed'] as const,
  investigation: ['resolved', 'escalated_capa', 'escalated_mdr', 'closed'] as const,
  resolved: ['closed'] as const,
  closed: [] as const,
  escalated_capa: ['triaged', 'investigation', 'resolved', 'closed'] as const,
  escalated_mdr: ['triaged', 'investigation', 'resolved', 'closed'] as const,
};

/**
 * The MDR lifecycle (21 CFR 803 / EU MDR Article 87), moved here with the complaint lifecycle (P-122).
 *
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
export const MDR_TRANSITIONS: Record<MdrState, readonly MdrState[]> = {
  open: ['preparing', 'closed'] as const,
  preparing: ['filed', 'open', 'closed'] as const,
  filed: ['acknowledged', 'followup_required', 'closed'] as const,
  acknowledged: ['followup_required', 'closed'] as const,
  followup_required: ['preparing', 'closed'] as const,
  closed: [] as const,
};

export const CAPA_TRANSITIONS: Record<CapaState, readonly CapaState[]> = {
  open: ['investigation', 'escalated'] as const,
  investigation: ['action_planned', 'escalated'] as const,
  action_planned: ['action_implemented', 'investigation', 'escalated'] as const,
  action_implemented: ['effectiveness_check', 'action_planned', 'escalated'] as const,
  effectiveness_check: ['closed_effective', 'closed_not_effective', 'escalated'] as const,
  closed_effective: [] as const,
  closed_not_effective: ['investigation'] as const,
  escalated: ['investigation', 'action_planned', 'action_implemented'] as const,
};

export const ACTION_TRANSITIONS: Record<ActionState, readonly ActionState[]> = {
  planned: ['in_progress', 'cancelled'] as const,
  in_progress: ['done', 'blocked', 'cancelled'] as const,
  blocked: ['in_progress', 'cancelled'] as const,
  done: [] as const,
  cancelled: [] as const,
};
