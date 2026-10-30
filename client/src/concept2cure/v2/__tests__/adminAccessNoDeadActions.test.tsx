// @vitest-environment jsdom
/**
 * Admin's actions do what they say, or are not offered (slice 0 of
 * .design/client-journey/INFORMATION_ARCHITECTURE.md, the admin-console row).
 *
 * "Grant access", "Audit activity", "Audit a member", "Edit scopes" and every
 * "Change setting" row only sent AnA a sentence. No AnA tool or command grants
 * project access, edits a role's scopes, changes an organisation setting or
 * exports a member's activity (server/services/ana/ana-launch-scope.inventory.json
 * lists every one; `audit.explain` explains a single audit row), so each ended
 * in a conversation that could not do it, under a header that said every action
 * on the page "emits a 21 CFR Part 11 audit entry".
 *
 * Now each reaches the real thing or is not offered:
 *   - auditing opens the audit trail, searched for the member where there is one
 *     (`audit-trail.search` matches the actor);
 *   - project access is granted on the project, in Plan's Project sharing; the
 *     member's drawer says so, and lists the grants it has;
 *   - a role's scopes are read from the checks that enforce them
 *     (server/services/tenant/role-scopes.ts), so they are shown, not edited;
 *   - a row of the organisation's record is shown as it is. Since Setup folded
 *     into Settings (D2, 2026-10-29), each governed setting is changed on its own
 *     card under a reason (adminConsoleSettings.test.tsx); the session timeout is
 *     the session-policy card, not a row.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AdminAccess } from '../surfaces/AdminAccess';
import { __resetSurfaceActionBus, registerSurfaceActionHandlers } from '../surfaceActions';

const props = () => ({
  surface: { id: 'admin-console', label: 'Admin and access' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

const payload = {
  data: {
    kpis: [],
    members: [
      { id: 'u-1', initials: 'DR', name: 'Dana Reyes', email: 'dana@acme.example', role: 'Admin', groups: [], sso: '', mfa: true, lastSeen: '2026-10-20T10:00:00.000Z', state: 'active', programs: [] },
    ],
    roles: [{ id: 'admin', label: 'Admin', members: 1, desc: 'Administers the organization.', scopes: ['records:read', 'members:administer'] }],
    grants: [{ user: 'u-1', program: '*', scope: 'edit', granted: 'Org admin' }],
    apiKeys: [],
    audit: [],
    settings: [
      { id: 'sso', label: 'Single sign-on', kind: 'toggle', value: 'Disabled', desc: 'SAML / OIDC via your IdP' },
    ],
    sso: {
      primary: { kind: '—', provider: 'Not configured', status: 'disabled', domain: '', users: 0, lastSync: 'never' },
      fallback: { kind: 'Local', provider: 'Local users', status: 'enabled', domain: '', users: 1, lastSync: 'real-time' },
      proposed: { kind: '—', provider: 'None staged', status: 'none', domain: '', users: 0, lastSync: 'never' },
      scim: { provider: 'Not configured', enabled: false, provisionedAttrs: 0, lastEvent: '' },
      mfaRequired: false, sessionTtl: '',
    },
  },
  meta: { count: 1, unavailable: [] },
};

function serve() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/mdx/admin') return { ok: true, status: 200, json: async () => payload } as Response;
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

function clickTab(label: string) {
  const btn = Array.from(document.querySelectorAll('.adm-tab')).find((b) => (b.textContent || '').includes(label));
  fireEvent.click(btn as Element);
}

async function openMember(p: ReturnType<typeof props>) {
  render(<AdminAccess {...p} />);
  fireEvent.click((await screen.findAllByText('Dana Reyes'))[0]);
  return screen.getByRole('complementary');
}

beforeEach(() => {
  apiRequest.mockReset();
  serve();
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
});

describe('Admin: each action reaches the real thing, or is not offered', () => {
  it('no action on the page sends AnA a sentence it cannot carry out', async () => {
    const p = props();
    const drawer = await openMember(p);
    expect(within(drawer).queryByRole('button', { name: /Grant access/ })).toBeNull();
    clickTab('Roles');
    expect(screen.queryByRole('button', { name: /Edit scopes/ })).toBeNull();
    clickTab('Settings');
    expect(screen.getByText('Single sign-on').closest('button')).toBeNull();
    expect(p.onAsk).not.toHaveBeenCalled();
  });

  it('a member\'s drawer says where project access is granted', async () => {
    const drawer = await openMember(props());
    expect(within(drawer).getByText(/on the project's Plan, under Project sharing/)).toBeTruthy();
  });

  it('auditing a member opens the audit trail, searched for them', async () => {
    const p = props();
    const drawer = await openMember(p);
    fireEvent.click(within(drawer).getByRole('button', { name: /Audit activity/ }));
    expect(p.onNav).toHaveBeenCalledWith('audit-trail');
    const queries: string[] = [];
    registerSurfaceActionHandlers('audit-trail', {
      'audit-trail.search': (params) => {
        queries.push(params.query);
        return { ok: true };
      },
    });
    expect(queries).toEqual(['Dana Reyes']);
  });

  it('the header\'s audit opens the audit trail', async () => {
    const p = props();
    render(<AdminAccess {...p} />);
    await screen.findAllByText('Dana Reyes');
    fireEvent.click(screen.getByRole('button', { name: /Open the audit trail/ }));
    expect(p.onNav).toHaveBeenCalledWith('audit-trail');
    expect(p.onAsk).not.toHaveBeenCalled();
  });

  it('no claim that every action on the page writes a Part 11 entry, and none that settings change here', async () => {
    render(<AdminAccess {...props()} />);
    await screen.findAllByText('Dana Reyes');
    expect(screen.queryByText(/Every action below emits a 21 CFR Part 11 audit entry/)).toBeNull();
    clickTab('Settings');
    expect(screen.queryByText(/Changes here emit Part 11 audit entries/)).toBeNull();
  });
});
