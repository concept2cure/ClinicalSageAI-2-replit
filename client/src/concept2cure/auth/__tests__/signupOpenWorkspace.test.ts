// @vitest-environment jsdom
/**
 * QA 2026-10-08 (j9, finding 3): after self-serve sign-up, "Open Concept2Cure"
 * went to `/ai` — a route the client does not have — with the new session
 * stored only under the legacy key `token`, which nothing reads. The person was
 * bounced to sign-in with a nested returnTo.
 *
 * The sign-up's session is adopted the way every other hand-off is
 * (authService.adoptSession: the server confirms it before it is stored), and
 * the button opens the workspace. If the server does not confirm it, the person
 * is sent to sign in — never to a dead route.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/components/i18n/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));

import { openWorkspaceAfterSignup } from '../ZenSignup';

afterEach(() => vi.restoreAllMocks());

describe('openWorkspaceAfterSignup', () => {
  it('adopts the sign-up session (persistently) and opens the workspace', async () => {
    const adopt = vi.fn(async () => ({ id: '9', email: 'new@c2c.test' }));
    await expect(openWorkspaceAfterSignup('signup-access-token', adopt)).resolves.toBe('/concept2cure');
    expect(adopt).toHaveBeenCalledWith('signup-access-token', true);
  });

  it('a session the server does not confirm goes to sign-in', async () => {
    const adopt = vi.fn(async () => null);
    await expect(openWorkspaceAfterSignup('signup-access-token', adopt)).resolves.toBe('/concept2cure/login');
  });

  it('no session (verification required, or none issued) goes to sign-in without asking the server', async () => {
    const adopt = vi.fn();
    await expect(openWorkspaceAfterSignup(null, adopt)).resolves.toBe('/concept2cure/login');
    expect(adopt).not.toHaveBeenCalled();
  });
});

describe('ZenSignup source', () => {
  const src = readFileSync(resolve(__dirname, '../ZenSignup.tsx'), 'utf8');
  it('sends nobody to the dead /ai route', () => {
    expect(src).not.toMatch(/['"`]\/ai[?'"`]/);
    expect(src).not.toMatch(/\/ai\?welcome/);
  });
  it('does not keep the session under the unread legacy key "token"', () => {
    expect(src).not.toMatch(/localStorage\.setItem\(\s*['"]token['"]/);
  });
});
