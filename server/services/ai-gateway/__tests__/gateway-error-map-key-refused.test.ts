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
