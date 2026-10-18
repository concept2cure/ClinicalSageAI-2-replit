/**
 * Why a Shadow Review run failed, from a closed set — and which failures are an
 * AI provider outage that a signed waiver may stand in for (P-34,
 * docs/LAUNCH_DEFINITION_OF_DONE.md, decided 2026-10-15).
 *
 * Until 2026-10-15 a failed run kept no reason at all, and the service threw
 * PROVIDER_UNAVAILABLE for everything but a JSON syntax error: a placement
 * refusal, a model-governance refusal, a rate limit and "no provider
 * configured" all read as an outage. P-34 offers a waiver only for an outage,
 * so the run now records which of these it was (shadow_review_runs.failure_code,
 * migrations/20261015_shadow_review_waiver.sql), and the caller is answered
 * with the gateway's own classification of the error (gateway-error-map.ts),
 * not a blanket "unavailable".
 *
 * Errors are told apart by `name` and `code`, not `instanceof`, as
 * gateway-error-map does for the same reason: route tests mock the gateway
 * module with a hand-listed set of classes, and an `instanceof` against one the
 * mock omits throws.
 *
 * @module server/services/shadow-review/shadow-review-failure
 */
import { classifyGatewayError, type GatewayErrorCode } from '../ai-gateway/gateway-error-map';
import type { ShadowReviewFailureCode } from '../../../shared/constants/shadow-review-failure';

// The vocabulary — the closed codes, which are waivable, and what each says — is
// shared/constants/shadow-review-failure.ts, which the browser loads too. It is
// re-exported here so server callers have one import; only the classification
// of a thrown gateway error into a code lives in this file.
export {
  SHADOW_REVIEW_FAILURE_CODES,
  WAIVABLE_SHADOW_REVIEW_FAILURE_CODES,
  SHADOW_REVIEW_FAILURE_CLAUSE,
  isShadowReviewFailureCode,
  isWaivableShadowReviewFailure,
  describeShadowReviewFailure,
  type ShadowReviewFailureCode,
  type WaivableShadowReviewFailureCode,
} from '../../../shared/constants/shadow-review-failure';

/** The ShadowReviewError codes a failed run is answered with. */
export type ShadowReviewFailureErrorCode = GatewayErrorCode | 'INTERNAL';

export interface ClassifiedShadowReviewFailure {
  failureCode: ShadowReviewFailureCode;
  /** The code the caller is answered with; the HTTP status is the gateway table's. */
  errorCode: ShadowReviewFailureErrorCode;
  /** Safe to show: authored here or by the gateway, never a provider string. */
  message: string;
}

type NamedError = { name?: unknown; code?: unknown; message?: unknown; reasonCode?: unknown; stage?: unknown };

const POLICY_FAILURE: Partial<Record<GatewayErrorCode, ShadowReviewFailureCode>> = {
  MODEL_NOT_QUALIFIED: 'model_not_qualified',
  RATE_LIMITED: 'rate_limited',
  PLACEMENT_REFUSED: 'placement_refused',
};

const ALL_FAILED_FAILURE: Partial<Record<GatewayErrorCode, ShadowReviewFailureCode>> = {
  OVERLOADED: 'provider_overloaded',
  RATE_LIMITED: 'rate_limited',
  TOKEN_LIMIT_EXCEEDED: 'token_limit',
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
};

/** A gateway policy refusal (GatewayPolicyError and its subclasses): never an outage. */
function classifyPolicyRefusal(err: NamedError): ShadowReviewFailureCode {
  // ModelNotApprovedError answers PROVIDER_UNAVAILABLE when the caller named the
  // model ('explicit'); it is still a governance refusal, not an outage.
  if (err.code === 'MODEL_NOT_APPROVED_FOR_HIGH_RISK') return 'model_not_qualified';
  return POLICY_FAILURE[classifyGatewayError(err).code] ?? 'policy_blocked';
}

/**
 * "All models failed": an outage only when no rung was declined by a safety
 * classifier. A decline is a refusal — the provider was working — so a ladder
 * that saw one is not a pure outage and is not waivable (fail closed).
 */
function classifyAllProvidersFailed(err: NamedError): ShadowReviewFailureCode {
  if (/Declined by the safety classifier/i.test(String(err.message ?? ''))) return 'policy_blocked';
  return ALL_FAILED_FAILURE[classifyGatewayError(err).code] ?? 'provider_unavailable';
}

function failureCodeOf(err: unknown): ShadowReviewFailureCode {
  const e = (err ?? {}) as NamedError;
  if (err instanceof SyntaxError || (e.name === 'ShadowReviewError' && e.code === 'INVALID_AI_RESPONSE')) return 'invalid_ai_response';
  switch (e.name) {
    case 'GatewayAllProvidersFailedError': return classifyAllProvidersFailed(e);
    case 'GatewayNoProviderError': return 'no_provider_configured';
    case 'GatewayContextWindowError': return 'token_limit';
    case 'GatewayModelDeclinedError': return 'policy_blocked';
    case 'GatewayPolicyError': return classifyPolicyRefusal(e);
    default: return 'internal';
  }
}

const INTERNAL_MESSAGE =
  'Shadow Review could not be completed because of a fault on the server, not at the AI provider. The run is recorded as failed.';

/** Classify why a run failed: the code to record and what to answer the caller. */
export function classifyShadowReviewFailure(err: unknown): ClassifiedShadowReviewFailure {
  const failureCode = failureCodeOf(err);
  if (failureCode === 'internal') return { failureCode, errorCode: 'INTERNAL', message: INTERNAL_MESSAGE };
  if (failureCode === 'invalid_ai_response') {
    const own = (err as NamedError).name === 'ShadowReviewError' ? String((err as NamedError).message ?? '') : '';
    return { failureCode, errorCode: 'INVALID_AI_RESPONSE', message: own || 'Shadow review returned invalid JSON.' };
  }
  const gateway = classifyGatewayError(err);
  return { failureCode, errorCode: gateway.code, message: gateway.message };
}
