/**
 * The `reason` input of a governed AnA tool.
 *
 * The handler records it as the reason for change on the audit trail
 * (recordGovernedAction -> audit_logs.reason), so it must be the person's, in
 * their words. A governed tool sent without one refuses and tells the model to
 * ask (AnaToolExecutor.ts reasonNotStated); this description says the same
 * before the call, so the model asks first instead of writing one.
 *
 * @compliance 21 CFR Part 11 §11.10(e)
 */
export const STATED_REASON_INPUT = {
  type: 'string',
  description:
    "The person's reason for this change, in their words (at least 8 characters). It is recorded as the " +
    'reason for change on the audit trail. If they have not given one, ask them; never write one yourself.',
} as const;
