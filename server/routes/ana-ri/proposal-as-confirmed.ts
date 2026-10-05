/**
 * The params a person confirmed on POST /api/ana-ri/governed-action, and the
 * model that proposed them (D5, MC-RL-4, 2026-10-05; evidence
 * docs/evidence/D5/2026-10-05-proposal-provenance/). Out of utility.ts so the
 * route stays readable.
 */
import type { CommandContext } from '../../services/ana-ri/command-executor.js';
import type { readPendingApproval } from '../../services/ana/run-control.js';
import { carriesModelAuthoredText, openProposalSeal } from '../../services/ana-ri/proposal-seal';
import { isServedModelApprovedForHighRisk } from '../../services/ai-governance/approved-models.js';

/**
 * The params a person confirmed and the model that proposed them. A held run's
 * proposer is its row's; a run-less proposal carries its proposer sealed in its
 * params (D5, MC-RL-4, 2026-10-05; services/ana-ri/proposal-seal.ts), opened
 * here before anything reads the params, so a valid seal restores the model
 * that wrote them and the seal itself never reaches a handler or the audit row.
 * Model-authored text from a model not qualified for high-risk drafting is
 * refused at the write (RULE 2).
 */
export function proposalAsConfirmed(
  authorised: { pendingForRun: Awaited<ReturnType<typeof readPendingApproval>>; command: string; params: Record<string, unknown> },
  organizationId: number,
  userId: number,
): { params: Record<string, unknown>; proposer: CommandContext['servingModel']; refused: string | null } {
  const { pendingForRun, command } = authorised;
  const opened = pendingForRun
    ? { params: authorised.params, proposer: null }
    : openProposalSeal(command, authorised.params, { organizationId, userId });
  const proposer = pendingForRun?.proposedBy ?? opened.proposer;
  const refused =
    proposer && carriesModelAuthoredText(opened.params) && !isServedModelApprovedForHighRisk(proposer)
      ? 'This proposal holds text written by a model that is not approved for regulatory drafting, so it cannot become a governed record'
      : null;
  return { params: opened.params, proposer, refused };
}

