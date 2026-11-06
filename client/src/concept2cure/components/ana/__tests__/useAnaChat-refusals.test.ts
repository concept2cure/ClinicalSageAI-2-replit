// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { streamRefusalText } from '../useAnaChat';

describe('AnA refusal recovery', () => {
  it('gives a sign-in recovery for HTTP 401 without blaming the network', () => {
    const message = streamRefusalText({ status: 401 });
    expect(message).toContain('Sign in again');
    expect(message).toContain('Prior turns are preserved');
    expect(message).not.toMatch(/unreachable|network|gateway/i);
  });

  it('gives an access recovery for HTTP 403 without blaming the network', () => {
    const message = streamRefusalText({ status: 403 });
    expect(message).toContain('access');
    expect(message).toContain('administrator');
    expect(message).not.toMatch(/unreachable|network|gateway/i);
  });

  it.each([new Error('A server failure'), { status: 500 }])('does not invent a cause for an unexplained failure', failure => {
    const message = streamRefusalText(failure);
    expect(message).toContain("couldn't complete this request");
    expect(message).toContain('Prior turns are preserved');
    expect(message).not.toMatch(/unreachable|network|gateway/i);
  });

  it.each([
    [{ status: 503, code: 'GATEWAY_UNAVAILABLE' }, 'No AI provider is configured'],
    [{ status: 429, code: 'WEEKLY_LIMIT_EXCEEDED' }, 'weekly limit'],
    [{ status: 429 }, 'Too many AnA requests'],
  ])('keeps the specific explanation for %o', (failure, explanation) => {
    expect(streamRefusalText(failure)).toContain(explanation);
  });
});

describe('a classified gateway refusal says its cause (2026-11-06)', () => {
  const refused = (code: string, message: string, status?: number) =>
    Object.assign(new Error(message), { code, serverSent: true, ...(status ? { status } : {}) });

  it('a refused API key is named, not "try again"', () => {
    const text = streamRefusalText(refused('PROVIDER_KEY_REFUSED',
      "The AI provider (Anthropic) refused this deployment's API key, so the request was not answered. Retrying will not change this; an administrator must set a valid key."));
    expect(text).toContain("refused this deployment's API key");
    expect(text).toContain('Prior turns are preserved');
    expect(text).not.toMatch(/couldn't complete this request|Try again/);
  });

  it('a qualified-model refusal sent as 403 is not told to sign in again', () => {
    const text = streamRefusalText(refused('MODEL_NOT_QUALIFIED',
      'No model approved for regulatory drafting and review is configured on this deployment for this request.', 403));
    expect(text).toContain('No model approved for regulatory drafting');
    expect(text).not.toMatch(/Sign in again/);
  });

  it('falls back to the generic line when the server sent no sentence', () => {
    expect(streamRefusalText(refused('PROVIDER_UNAVAILABLE', 'Stream error'))).toContain("couldn't complete this request");
  });
});
