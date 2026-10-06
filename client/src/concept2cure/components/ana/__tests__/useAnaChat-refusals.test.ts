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
