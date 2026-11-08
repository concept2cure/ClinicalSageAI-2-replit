/**
 * A provider that refuses the deployment's API key is not "temporarily
 * unavailable". Recorded in the running app, 2026-11-06: every Anthropic model
 * answered 401 authentication_error "invalid x-api-key", the gateway threw
 * "All models failed … Last error: 401 …", and the person read "AnA couldn't
 * complete this request. Try again", so a wrong key looked like a broken
 * product and retrying could never help. The founder had keys and "couldn't get
 * it to work". The classified message names the cause and who fixes it, and
 * never the provider's raw text or the key.
 */
import { describe, expect, it } from 'vitest';
import { GatewayAllProvidersFailedError } from '../gateway';
import { classifyGatewayError, GATEWAY_ERROR_HTTP_STATUS } from '../gateway-error-map';

const allFailed = (last: string) =>
  new GatewayAllProvidersFailedError(
    `All models failed. Tried: anthropic/claude-opus-5-5, anthropic/claude-opus-5, anthropic/claude-opus-4-8. Last error: ${last}.`,
  );

describe('a refused API key', () => {
  it.each([
    '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
    '401 Incorrect API key provided: sk-proj-****abcd',
    'Error: 403 {"type":"error","error":{"type":"permission_error","message":"Your API key does not have permission to use the specified resource."}}',
  ])('is PROVIDER_KEY_REFUSED, said plainly, never retried as an outage: %s', (last) => {
    const c = classifyGatewayError(allFailed(last));
    expect(c.code).toBe('PROVIDER_KEY_REFUSED');
    expect(c.message).toMatch(/refused this deployment's API key/);
    expect(c.message).toMatch(/administrator/);
    expect(c.message).not.toMatch(/temporarily|try again shortly|x-api-key|sk-|Incorrect API key|permission_error/i);
    expect(GATEWAY_ERROR_HTTP_STATUS[c.code]).toBe(503);
  });

  it('names Anthropic when the models tried were Anthropic', () => {
    expect(classifyGatewayError(allFailed('401 invalid x-api-key')).message).toContain('Anthropic');
    // The gateway's own wording: "Tried:" lists registry ids, with no provider prefix.
    const asThrown = new GatewayAllProvidersFailedError(
      'All models failed. Tried: claude-opus-4, claude-opus-5, claude-opus-4-legacy. Last error: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}.',
    );
    expect(classifyGatewayError(asThrown).message).toContain('The AI provider (Anthropic) refused');
  });

  it('leaves an outage an outage', () => {
    expect(classifyGatewayError(allFailed('500 Internal server error')).code).toBe('PROVIDER_UNAVAILABLE');
    expect(classifyGatewayError(allFailed('529 overloaded_error')).code).toBe('OVERLOADED');
  });
});

describe('ordering', () => {
  it('an expired OAuth token is a refused credential, not too large an input', () => {
    expect(classifyGatewayError(allFailed('401 {"type":"error","error":{"type":"authentication_error","message":"OAuth token has expired"}}')).code)
      .toBe('PROVIDER_KEY_REFUSED');
  });
});

/**
 * A valid key on an account that cannot be served is not an outage either (2026-11-06). Anthropic answers an account
 * with no credit "400 … Your credit balance is too low", and the person read "temporarily unavailable". OpenAI answers
 * a spent quota with a 429, and the person read "rate limiting … Try again shortly", for as long as they kept trying.
 * A model the account cannot use answers 404. Each names the cause and who fixes it.
 */
describe('a provider account that cannot be served', () => {
  it.each([
    ['Anthropic', '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011"}'],
    ['OpenAI', '429 You exceeded your current quota, please check your plan and billing details. For more information on this error, read the docs.'],
    ['OpenAI', '429 {"error":{"message":"quota","type":"insufficient_quota","code":"insufficient_quota"}}'],
  ])('%s with no credit or quota left is PROVIDER_ACCOUNT_REFUSED, never "try again shortly"', (provider, last) => {
    const c = classifyGatewayError(allFailed(last));
    expect(c.code).toBe('PROVIDER_ACCOUNT_REFUSED');
    expect(c.message).toContain(`The AI provider (${provider})`);
    expect(c.message).toMatch(/no credit or quota left/);
    expect(c.message).toMatch(/administrator/);
    expect(c.message).not.toMatch(/temporarily|try again shortly|Plans & Billing|req_011|insufficient_quota/i);
    expect(GATEWAY_ERROR_HTTP_STATUS[c.code]).toBe(503);
  });

  it.each([
    ['Anthropic', '404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-opus-5-5"}}'],
    ['OpenAI', '404 The model `gpt-5` does not exist or you do not have access to it.'],
  ])('%s refusing the model to this account is PROVIDER_ACCOUNT_REFUSED', (provider, last) => {
    const c = classifyGatewayError(allFailed(last));
    expect(c.code).toBe('PROVIDER_ACCOUNT_REFUSED');
    expect(c.message).toContain(`The AI provider (${provider}) does not offer the requested model`);
    expect(c.message).not.toMatch(/temporarily|not_found_error|gpt-5/);
  });

  it('a real rate limit is still a rate limit', () => {
    expect(classifyGatewayError(allFailed('429 {"type":"error","error":{"type":"rate_limit_error","message":"Number of request tokens has exceeded your per-minute rate limit"}}')).code)
      .toBe('RATE_LIMITED');
  });
});
