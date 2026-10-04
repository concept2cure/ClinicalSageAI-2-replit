/**
 * The reason a confirmed tool records is the person's (D5, 2026-09-29).
 *
 * A tool in REASON_REQUIRED_TOOLS is held at the reason tier
 * (governed-tool-gate.ts registeredToolTier), and the confirmation route
 * (utility.ts POST /governed-action) runs it with what the person submitted.
 *
 * @module server/routes/ana-ri/persons-reason
 */

import { reasonFieldOf } from '../../services/ana/stated-reason-input.js';

/**
 * A reason-tier tool runs with the reason the PERSON confirmed, not the one the
 * model wrote into the call (D5, 2026-09-29). The held params carry the model's
 * proposal in the tool's reason input (`reason`, or `reason_for_change`); the
 * person saw it at confirmation and typed their own or adopted that wording,
 * and what they submitted replaces it. The sign-off row records both, and
 * whether the person's reason is the proposal as written.
 */
export function personsReasonFor(
  tool: string,
  params: Record<string, unknown>,
  reasonForChange: string,
): { params: Record<string, unknown>; audit: Record<string, unknown> } {
  const field = reasonFieldOf(tool);
  const proposed = typeof params[field] === 'string' ? (params[field] as string).trim() : null;
  return {
    params: { ...params, [field]: reasonForChange },
    audit: { proposedReason: proposed, reasonAsProposed: proposed !== null && proposed === reasonForChange },
  };
}

