/**
 * Why a Shadow Review run failed: the closed set of failure codes, which of
 * them is an AI provider outage a signed waiver may stand in for, and what each
 * says in plain language (P-34, docs/LAUNCH_DEFINITION_OF_DONE.md, decided
 * 2026-10-15).
 *
 * The run records the code (shadow_review_runs.failure_code,
 * migrations/20261015_shadow_review_waiver.sql); the server classifies a thrown
 * error into it (server/services/shadow-review/shadow-review-failure.ts, which
 * imports this and keeps the gateway classification server-side); the waiver's
 * rules read it (server/services/ectd/shadow-review-waiver.ts); and the
 * Submission Center renders it. One vocabulary, here, with no imports, so the
 * browser loads the same list and the same words the server applies.
 *
 * @module shared/constants/shadow-review-failure
 */

export const SHADOW_REVIEW_FAILURE_CODES = [
  'provider_unavailable',
  'provider_overloaded',
  'rate_limited',
  'invalid_ai_response',
  'model_not_qualified',
  'placement_refused',
  'policy_blocked',
  'token_limit',
  'no_provider_configured',
  'internal',
] as const;
export type ShadowReviewFailureCode = (typeof SHADOW_REVIEW_FAILURE_CODES)[number];

/**
 * The outages: every AI provider failed, or every one was overloaded. Nothing
 * else is waivable — a reply that was not an assessment, a governance or
 * placement refusal, a rate limit, an oversized request, "no provider
 * configured" and a fault of the server are not "the AI provider was
 * unavailable".
 */
export const WAIVABLE_SHADOW_REVIEW_FAILURE_CODES = ['provider_unavailable', 'provider_overloaded'] as const;
export type WaivableShadowReviewFailureCode = (typeof WAIVABLE_SHADOW_REVIEW_FAILURE_CODES)[number];

export function isShadowReviewFailureCode(code: unknown): code is ShadowReviewFailureCode {
  return typeof code === 'string' && (SHADOW_REVIEW_FAILURE_CODES as readonly string[]).includes(code);
}

export function isWaivableShadowReviewFailure(code: unknown): code is WaivableShadowReviewFailureCode {
  return typeof code === 'string' && (WAIVABLE_SHADOW_REVIEW_FAILURE_CODES as readonly string[]).includes(code);
}

/** What a failed run's code says happened, as the clause after "failed because". */
export const SHADOW_REVIEW_FAILURE_CLAUSE: Readonly<Record<ShadowReviewFailureCode, string>> = {
  provider_unavailable: 'every AI provider was unavailable',
  provider_overloaded: 'every AI provider was overloaded',
  rate_limited: 'the AI provider applied a rate limit',
  invalid_ai_response: "the model's reply was not an assessment the dispatch gate can count",
  model_not_qualified: 'no model approved for regulatory review could serve it',
  placement_refused: "the organization's placement policy refused every lane",
  policy_blocked: 'a governance policy of the AI gateway refused it',
  token_limit: 'the sequence was too large for a single AI request',
  no_provider_configured: 'no AI provider is configured on this deployment',
  internal: 'of a fault on the server, not at the AI provider',
};

/** "failed because …" for a recorded code. A run with none failed before codes were recorded. */
export function describeShadowReviewFailure(code: unknown): string {
  return isShadowReviewFailureCode(code)
    ? SHADOW_REVIEW_FAILURE_CLAUSE[code]
    : 'of a failure that was not recorded: the run failed before failures were recorded';
}
