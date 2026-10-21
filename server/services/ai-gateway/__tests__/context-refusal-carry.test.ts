/** D2/W2: reach the existing typed context refusal through its canonical map.
 * Synthetic gateway-authored fit numbers qualify classification only. This
 * suite neither creates a context policy nor qualifies a live provider/DB. */
import { describe, expect, it } from 'vitest';
import { GatewayContextWindowError, type ContextWindowFit } from '../context-budget';
import { GatewayAllProvidersFailedError, GatewayNoProviderError, GatewayPolicyError } from '../gateway';
import { classifyGatewayError, GATEWAY_ERROR_HTTP_STATUS, type ClassifiedGatewayError } from '../gateway-error-map';

type CarryOptions = { priorToolWorkMayExist?: boolean };
// The baseline export exists. Widening its argument type makes the new option
// executable before implementation; missing symbols cannot cause the red run.
const classifyWithOptions = classifyGatewayError as (error: unknown, options?: CarryOptions) => ClassifiedGatewayError;
const SUFFIX = ' Some actions or source receipts from earlier steps may already exist; inspect the current state before repeating them.';
const WITH_RESERVE = 'The request is about 240,000 tokens (≈232,000 of input plus 8,000 reserved for the answer). The largest context window available to it is 200,000 tokens (anthropic/fixture-large). Reduce the input by about 40,000 tokens (≈200,000 characters), lower maxTokens, or split the work into smaller sections.';
const WITHOUT_RESERVE = 'The request is about 240,000 tokens. The largest context window available to it is 200,000 tokens (anthropic/fixture-large). Reduce the input by about 40,000 tokens (≈200,000 characters) or split the work into smaller sections.';

function fits(reservedOutputTokens = 8000): ContextWindowFit[] {
  return [128000, 200000].map((contextWindow, i) => ({ fits: false, id: `fixture-${i}`,
    provider: 'anthropic', model: i === 0 ? 'fixture-small' : 'fixture-large', contextWindow,
    estimatedInputTokens: 240000 - reservedOutputTokens, reservedOutputTokens, estimatedTokens: 240000 }));
}

describe('typed context refusal default compatibility controls', () => {
  it('keeps the canonical measured size, ceiling, remedy and 413 without options', () => {
    const error = new GatewayContextWindowError(fits());
    expect(error.message).toBe(WITH_RESERVE);
    expect(classifyGatewayError(error)).toEqual({ code: 'TOKEN_LIMIT_EXCEEDED', message: WITH_RESERVE });
    expect(GATEWAY_ERROR_HTTP_STATUS.TOKEN_LIMIT_EXCEEDED).toBe(413);
  });

  it('keeps omitted, empty and explicitly false options byte-identical', () => {
    const error = new GatewayContextWindowError(fits());
    const expected = { code: 'TOKEN_LIMIT_EXCEEDED', message: WITH_RESERVE };
    expect(classifyWithOptions(error)).toEqual(expected);
    expect(classifyWithOptions(error, {})).toEqual(expected);
    expect(classifyWithOptions(error, { priorToolWorkMayExist: false })).toEqual(expected);
  });

  it('preserves the existing no-output-reserve and empty-refusal messages by default', () => {
    expect(classifyWithOptions(new GatewayContextWindowError(fits(0)), { priorToolWorkMayExist: false }))
      .toEqual({ code: 'TOKEN_LIMIT_EXCEEDED', message: WITHOUT_RESERVE });
    expect(classifyGatewayError(new GatewayContextWindowError([])))
      .toEqual({ code: 'TOKEN_LIMIT_EXCEEDED', message: 'The request is too large for any available AI model.' });
  });
});

describe('typed context refusal carries earlier-work honesty only when requested', () => {
  it('appends exactly the fixed note to the unchanged numeric guidance', () => {
    const error = new GatewayContextWindowError(fits());
    const classified = classifyWithOptions(error, { priorToolWorkMayExist: true });
    expect(classified).toEqual({ code: 'TOKEN_LIMIT_EXCEEDED', message: WITH_RESERVE + SUFFIX });
    expect(GATEWAY_ERROR_HTTP_STATUS[classified.code]).toBe(413);
    expect(classified.message).not.toMatch(/rolled back|no actions|nothing.*happened|retry shortly/i);
  });

  it('carries the same note when no output reserve was requested', () => {
    expect(classifyWithOptions(new GatewayContextWindowError(fits(0)), { priorToolWorkMayExist: true }))
      .toEqual({ code: 'TOKEN_LIMIT_EXCEEDED', message: WITHOUT_RESERVE + SUFFIX });
  });

  it('carries the same note when the existing typed error has no fit details', () => {
    expect(classifyWithOptions(new GatewayContextWindowError([]), { priorToolWorkMayExist: true }))
      .toEqual({ code: 'TOKEN_LIMIT_EXCEEDED', message: 'The request is too large for any available AI model.' + SUFFIX });
  });

  it('does not mutate frozen errors, refusal arrays, fit objects or caller options across repeated classification', () => {
    const refusals = fits().map(fit => Object.freeze(fit));
    Object.freeze(refusals);
    const error = Object.freeze(new GatewayContextWindowError(refusals));
    const options = Object.freeze({ priorToolWorkMayExist: true });
    const before = JSON.stringify({ message: error.message, refusals, options,
      estimatedTokens: error.estimatedTokens, largestContextWindow: error.largestContextWindow });
    const first = classifyWithOptions(error, options);
    const second = classifyWithOptions(error, options);
    expect(first).toEqual({ code: 'TOKEN_LIMIT_EXCEEDED', message: WITH_RESERVE + SUFFIX });
    expect(second).toEqual(first);
    expect(error.refusals).toBe(refusals);
    expect(error.message).toBe(WITH_RESERVE);
    expect(JSON.stringify({ message: error.message, refusals, options,
      estimatedTokens: error.estimatedTokens, largestContextWindow: error.largestContextWindow })).toBe(before);
    expect(classifyGatewayError(error).message).toBe(WITH_RESERVE);
  });
});

describe('provider-wrapped token errors remain distinct from typed pre-dispatch refusal', () => {
  it.each(['token count exceeded', 'context length exceeded', 'max_tokens exceeded'])(
    'keeps existing generic token copy for provider failure %j with the carry option', providerMessage => {
      const error = new GatewayAllProvidersFailedError(providerMessage + ' PRIVATE_PROVIDER_DETAIL');
      const expected = { code: 'TOKEN_LIMIT_EXCEEDED', message: 'The input is too large for a single AI request.' };
      expect(classifyGatewayError(error)).toEqual(expected);
      expect(classifyWithOptions(error, { priorToolWorkMayExist: true })).toEqual(expected);
      expect(error).not.toBeInstanceOf(GatewayContextWindowError);
    },
  );

  it('does not promote a wrapped provider token error by its forged context-error name', () => {
    const error = new GatewayAllProvidersFailedError('token count exceeded PRIVATE_PROVIDER_DETAIL');
    error.name = 'GatewayContextWindowError';
    expect(classifyWithOptions(error, { priorToolWorkMayExist: true }))
      .toEqual({ code: 'TOKEN_LIMIT_EXCEEDED', message: 'The input is too large for a single AI request.' });
  });

  it.each([
    ['529 Overloaded PRIVATE_PROVIDER_DETAIL', 'OVERLOADED', 'The AI provider is overloaded right now. Please retry in a moment.'],
    ['429 rate limit PRIVATE_PROVIDER_DETAIL', 'RATE_LIMITED', 'The AI provider is rate limiting requests. Try again shortly.'],
    ['connection reset PRIVATE_PROVIDER_DETAIL', 'PROVIDER_UNAVAILABLE', 'The AI provider is temporarily unavailable.'],
  ])('does not alter existing wrapped-provider classification for %s', (raw, code, message) => {
    const error = Object.freeze(new GatewayAllProvidersFailedError(raw));
    expect(classifyWithOptions(error, { priorToolWorkMayExist: true })).toEqual({ code, message });
    expect(classifyWithOptions(error, { priorToolWorkMayExist: true })).toEqual(classifyGatewayError(error));
  });
});

describe('other canonical and untrusted errors keep existing safe classifications', () => {
  it('leaves generic policy, no-provider and JSON parse failures unchanged', () => {
    const cases = [
      { error: new GatewayPolicyError('PRIVATE_POLICY_DETAIL'), code: 'PROVIDER_UNAVAILABLE', message: 'This request was blocked by AI gateway policy.' },
      { error: new GatewayNoProviderError('PRIVATE_PROVIDER_DETAIL'), code: 'PROVIDER_UNAVAILABLE', message: 'No AI provider is available to handle this request.' },
      { error: new SyntaxError('PRIVATE_JSON_DETAIL'), code: 'INVALID_AI_RESPONSE', message: 'The AI response was not valid JSON.' },
    ];
    for (const { error, code, message } of cases) {
      expect(classifyWithOptions(error, { priorToolWorkMayExist: true })).toEqual({ code, message });
      expect(classifyWithOptions(error, { priorToolWorkMayExist: true })).toEqual(classifyGatewayError(error));
    }
  });

  it('leaves the existing source-context policy refusal unchanged', () => {
    const error = Object.freeze(Object.assign(new GatewayPolicyError('PRIVATE_SOURCE_DETAIL'), { code: 'SOURCE_CONTEXT_UNAVAILABLE' }));
    const expected = { code: 'SOURCE_CONTEXT_UNAVAILABLE',
      message: 'Selected project sources changed or are no longer available. Check project access and current source versions before retrying this section.' };
    expect(classifyWithOptions(error, { priorToolWorkMayExist: true })).toEqual(expected);
    expect(classifyGatewayError(error)).toEqual(expected);
  });

  it('does not trust an arbitrary error name, code or admission-like text', () => {
    const error = Object.freeze(Object.assign(new Error('PRIVATE_CONTEXT_DETAIL The request is too large.'), {
      name: 'GatewayContextWindowError', code: 'TOKEN_LIMIT_EXCEEDED',
    }));
    expect(classifyWithOptions(error, { priorToolWorkMayExist: true }))
      .toEqual({ code: 'PROVIDER_UNAVAILABLE', message: 'The AI request could not be completed.' });
  });

  it.each([null, undefined, { name: 'GatewayContextWindowError', code: 'TOKEN_LIMIT_EXCEEDED', message: 'PRIVATE_CONTEXT_DETAIL' }])(
    'does not promote an untyped value %j into context refusal', error => {
      expect(classifyWithOptions(error, { priorToolWorkMayExist: true }))
        .toEqual({ code: 'PROVIDER_UNAVAILABLE', message: 'The AI request could not be completed.' });
    },
  );
});
