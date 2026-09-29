/**
 * The browser Sentry client is a third-party sink for a copy of whatever was on
 * the page when it broke. Until 2026-09-26 that copy left the browser
 * unscrubbed (audit DP-26, plan P1-27). These cases pin what the scrubber
 * removes, and that a scrubber failure drops the event rather than sending it.
 */
import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/react';

import { REDACTED, redactDeep, redactText, scrubSentryBreadcrumb, scrubSentryEvent } from '../sentryScrub';

describe('redactText — the carriers a key name does not announce', () => {
  it('redacts bearer tokens, JWTs, provider keys, email addresses and SSNs inside a string', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiJ9.c2lnbmF0dXJlLXNpZ25hdHVyZQ';
    expect(redactText(`Authorization: Bearer ${jwt}`)).toBe(`Authorization: ${REDACTED}`);
    expect(redactText(`token ${jwt} expired`)).toBe(`token ${REDACTED} expired`);
    expect(redactText('key sk-abcdefghijklmnopqrstuvwxyz')).toBe(`key ${REDACTED}`);
    expect(redactText('mail ops@example.org now')).toBe(`mail ${REDACTED} now`);
    expect(redactText('ssn 123-45-6789')).toBe(`ssn ${REDACTED}`);
  });

  it('keeps a URL and its parameter names but not the values of secret parameters', () => {
    expect(redactText('https://app.example.test/sso/callback?code=abc123&state=s1&next=/home'))
      .toBe(`https://app.example.test/sso/callback?code=${REDACTED}&state=s1&next=/home`);
    expect(redactText('/api/x?token=t.t.t&page=2')).toBe(`/api/x?token=${REDACTED}&page=2`);
    expect(redactText('/api/x#access_token=abc')).toBe(`/api/x#access_token=${REDACTED}`);
  });

  it('leaves ordinary text alone', () => {
    expect(redactText('Cannot read properties of undefined (reading "id")')).toBe('Cannot read properties of undefined (reading "id")');
  });
});

describe('redactDeep — the key denylist, wherever the key occurs', () => {
  it('drops sensitive keys at any depth and scrubs the remaining strings', () => {
    const out = redactDeep({
      level: 'error',
      contexts: { state: { password: 'hunter2', Access_Token: 'abc', 'x-api-key': 'k', mrn: '00042', patientId: 7, note: 'call ops@example.org' } },
      list: [{ email: 'a@b.co' }, 'Bearer abc.def.ghi', 3],
    });
    expect(out).toEqual({
      level: 'error',
      contexts: { state: { password: REDACTED, Access_Token: REDACTED, 'x-api-key': REDACTED, mrn: REDACTED, patientId: REDACTED, note: `call ${REDACTED}` } },
      list: [{ email: REDACTED }, REDACTED, 3],
    });
  });

  it('passes class instances through untouched and keeps nulls', () => {
    const when = new Date('2026-09-26T00:00:00Z');
    const out = redactDeep({ when, empty: null, password: null });
    expect(out.when).toBe(when);
    expect(out.empty).toBeNull();
    expect(out.password).toBeNull();
  });
});

describe('scrubSentryEvent — what a browser error event may carry', () => {
  const event = (): ErrorEvent => ({
    type: undefined,
    message: 'Failed for ops@example.org',
    user: { id: 'u-1', email: 'ops@example.org', username: 'ops', ip_address: '10.0.0.7', geo: { city: 'X' }, segment: 'beta' },
    request: {
      url: 'https://app.example.test/x?token=abc&page=2',
      query_string: 'token=abc&page=2',
      headers: { Authorization: 'Bearer a.b.c', Cookie: 'sid=1', 'X-Org-Id': '9', 'User-Agent': 'Mozilla/5.0' },
      cookies: { sid: '1' },
    },
    extra: { password: 'hunter2', surfaceId: 'vault' },
    breadcrumbs: [{ category: 'fetch', data: { url: '/api/login?code=zzz', method: 'POST' }, message: 'Bearer a.b.c' }],
  });

  it('keeps the pseudonymous user id and drops the address, email, username and location', () => {
    const out = scrubSentryEvent(event());
    expect(out?.user).toEqual({ id: 'u-1', email: REDACTED, username: REDACTED, segment: 'beta' });
    expect(out?.user).not.toHaveProperty('ip_address');
    expect(out?.user).not.toHaveProperty('geo');
  });

  it('redacts credential and tenant headers, removes cookies, and strips secret query values', () => {
    const out = scrubSentryEvent(event());
    expect(out?.request?.headers).toEqual({ Authorization: REDACTED, Cookie: REDACTED, 'X-Org-Id': REDACTED, 'User-Agent': 'Mozilla/5.0' });
    expect(out?.request).not.toHaveProperty('cookies');
    expect(out?.request?.url).toBe(`https://app.example.test/x?token=${REDACTED}&page=2`);
    expect(out?.request?.query_string).toBe(`token=${REDACTED}&page=2`);
  });

  it('scrubs the message, extras and breadcrumbs', () => {
    const out = scrubSentryEvent(event());
    expect(out?.message).toBe(`Failed for ${REDACTED}`);
    expect(out?.extra).toEqual({ password: REDACTED, surfaceId: 'vault' });
    expect(out?.breadcrumbs).toEqual([{ category: 'fetch', data: { url: `/api/login?code=${REDACTED}`, method: 'POST' }, message: REDACTED }]);
  });

  it('drops the event when scrubbing throws', () => {
    const poisoned = event();
    Object.defineProperty(poisoned, 'extra', { enumerable: true, get() { throw new Error('boom'); } });
    expect(scrubSentryEvent(poisoned)).toBeNull();
  });
});

describe('scrubSentryBreadcrumb', () => {
  it('scrubs a breadcrumb and drops one it cannot scrub', () => {
    expect(scrubSentryBreadcrumb({ category: 'console', message: 'user ops@example.org', data: { token: 't' } }))
      .toEqual({ category: 'console', message: `user ${REDACTED}`, data: { token: REDACTED } });
    const poisoned = { category: 'xhr' } as Record<string, unknown>;
    Object.defineProperty(poisoned, 'data', { enumerable: true, get() { throw new Error('boom'); } });
    expect(scrubSentryBreadcrumb(poisoned)).toBeNull();
  });
});
