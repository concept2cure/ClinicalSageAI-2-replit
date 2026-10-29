/**
 * The CAPA lifecycle (21 CFR 820.100): the moves the server accepts from each
 * state. The one copy: `server/services/capa-mdr/stateMachine.ts` enforces it,
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
import type { CapaState } from '../schema/capa-mdr';

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
