// @vitest-environment jsdom
/**
 * The unlock panel says which verdict it explains.
 *
 * A locked rail entry or ⌘K result opens this panel for every kind of lock: a
 * feature outside the release and a feature the organisation's plan lacks look
 * alike from outside. The slice 0 launch walk (tests/e2e/launch-walk-no-lock.e2e.ts)
 * fails on the first and records the second, so it reads the verdict from
 * `data-lock-source`. Without it, the walk counted every panel as a licence lock
 * and passed with "not in this release" on screen
 * (docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/slice0/walk/red/).
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('@/lib/queryClient', () => ({
  apiRequest: async () => new Response(JSON.stringify({ requests: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }),
  redactInternals: (s: string) => s,
  serverMessage: () => null,
}));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'token' }));

import { NavUnlockPanel } from '../NavUnlockPanel';

afterEach(cleanup);

function panel(verdict: Parameters<typeof NavUnlockPanel>[0]['verdict']) {
  render(<NavUnlockPanel verdict={verdict} isOrgAdmin={false} onClose={() => {}} onNav={() => {}} />);
  return document.querySelector('.nav-unlock');
}

describe('NavUnlockPanel data-lock-source', () => {
  it('marks a feature outside the release as launch-scope', () => {
    const el = panel({ id: 'pv-cockpit', label: 'PV cockpit', entitled: false, source: 'launch-scope', requiredTier: null });
    expect(el?.getAttribute('data-lock-source')).toBe('launch-scope');
  });

  it('marks a feature the plan lacks by its own verdict, not as launch-scope', () => {
    const el = panel({ id: 'communication-center', label: 'Communication Center', entitled: false, source: 'tier', requiredTier: 'standard' });
    expect(el?.getAttribute('data-lock-source')).toBe('tier');
  });
});
