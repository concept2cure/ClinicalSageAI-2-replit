/**
 * The SSO hand-off the sign-in page reads from the URL fragment (security
 * audit 2026-09-24, IAM-18 item 6): the token, the provider and a return path
 * it will only follow when it is a same-origin path this app allows.
 */
import { describe, expect, it } from 'vitest';

import { parseSsoHandoff } from '../redirectUtils';

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI3In0.c2lnbmF0dXJl';

describe('parseSsoHandoff', () => {
  it('reads the token, provider and an allowed return path from the fragment', () => {
    expect(parseSsoHandoff(`#sso=${JWT}&provider=saml&returnTo=${encodeURIComponent('/concept2cure/projects?tab=1')}`)).toEqual({
      token: JWT,
      provider: 'saml',
      returnTo: '/concept2cure/projects?tab=1',
    });
  });

  it('drops a return path that is not a same-origin path this app allows', () => {
    expect(parseSsoHandoff(`#sso=${JWT}&returnTo=${encodeURIComponent('https://evil.example/x')}`)?.returnTo).toBeNull();
    expect(parseSsoHandoff(`#sso=${JWT}&returnTo=${encodeURIComponent('//evil.example')}`)?.returnTo).toBeNull();
    expect(parseSsoHandoff(`#sso=${JWT}&returnTo=${encodeURIComponent('/somewhere-else')}`)?.returnTo).toBeNull();
  });

  it('is null without a token shaped like a JWT, and for an empty or unrelated fragment', () => {
    expect(parseSsoHandoff('')).toBeNull();
    expect(parseSsoHandoff('#tab=1')).toBeNull();
    expect(parseSsoHandoff('#sso=not-a-token')).toBeNull();
    expect(parseSsoHandoff('#sso=')).toBeNull();
  });
});
