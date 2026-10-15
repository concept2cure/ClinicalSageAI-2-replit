// @vitest-environment jsdom
/**
 * The connector for Claude on Admin → Settings (ADR-0014 §10, plan P1-47).
 *
 *  - The owner or administrator (the server's `canChange`) gets a switch; turning it on is
 *    confirmed first, sent as PUT { enabled: true }, and the setting is read
 *    again so what is shown is what the server stored.
 *  - Anyone else sees the state and that only the owner or administrator can change it.
 *  - A read that fails, or answers in a shape the page does not know, reads
 *    "Could not be read", never "Off".
 *  - A refused change says it was not changed.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AdminAccess } from '../surfaces/AdminAccess';

const ORG = '42';
const PATH = `/api/tenant-config/${ORG}/claude-connector`;

const props = () => ({
  surface: { id: 'admin-console', label: 'Admin and access' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

/** An organisation of one: its owner (an organisation with no members renders the empty state, not the tabs). */
const ADMIN = {
  data: {
    kpis: [],
    members: [
      { id: 'u-1', initials: 'OW', name: 'Org Owner', email: 'owner@example.invalid', role: 'Owner', groups: [], sso: '', mfa: true, lastSeen: '', state: 'active', programs: [] },
    ],
    roles: [{ id: 'owner', label: 'Owner', members: 1, desc: '', scopes: [] }],
    grants: [],
    apiKeys: [],
    audit: [],
    settings: [],
    sso: null,
  },
  meta: { count: 1, unavailable: [] },
};

const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

/** The server: the stored setting, who is asking, and how a read or a write answers. */
let server: { enabled: boolean; canChange: boolean; read: 'ok' | 'error' | 'shape'; write: 'ok' | 'forbidden' };

function serve() {
  apiRequest.mockImplementation(async (method: string, url: string, body?: { enabled?: boolean }) => {
    if (method === 'GET' && url === '/api/mdx/admin') return ok(ADMIN);
    if (url === PATH && method === 'GET') {
      if (server.read === 'error') return ok({ error: 'The connector setting could not be read.' }, 500);
      if (server.read === 'shape') return ok({});
      return ok({ connector: { enabled: server.enabled, canChange: server.canChange } });
    }
    if (url === PATH && method === 'PUT') {
      if (server.write === 'forbidden') return ok({ error: "Only the organisation's owner or administrator can turn the connector for Claude on or off." }, 403);
      server.enabled = body?.enabled === true;
      return ok({ connector: { enabled: server.enabled, canChange: true } });
    }
    return ok({});
  });
}

async function openSettings() {
  render(<AdminAccess {...props()} />);
  const tab = await waitFor(() => {
    const found = Array.from(document.querySelectorAll('.adm-tab')).find((b) => (b.textContent || '').includes('Settings'));
    expect(found, 'the Settings tab did not render').toBeTruthy();
    return found as Element;
  });
  fireEvent.click(tab);
  return screen.findByTestId('claude-connector-setting');
}

const puts = () => apiRequest.mock.calls.filter(([method]) => method === 'PUT');

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  window.localStorage.setItem('currentOrganizationId', ORG);
  server = { enabled: false, canChange: true, read: 'ok', write: 'ok' };
  serve();
});

describe('Connector for Claude on Admin → Settings', () => {
  it('the owner or administrator turns it on after confirming, and the stored value is read back', async () => {
    const row = await openSettings();
    expect(row.textContent).toContain('Connector for Claude');
    const toggle = await screen.findByRole('switch', { name: 'Connector for Claude' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(row.textContent).toContain('Off');

    fireEvent.click(toggle);
    expect(puts()).toHaveLength(0);
    expect(row.textContent).toContain("Members will be able to connect Claude to this organisation's content.");
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));

    await waitFor(() => expect(puts()).toEqual([['PUT', PATH, { enabled: true }]]));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Connector for Claude' }).getAttribute('aria-checked')).toBe('true'));
    // Read again after the change: two GETs of the setting.
    expect(apiRequest.mock.calls.filter(([m, u]) => m === 'GET' && u === PATH).length).toBeGreaterThanOrEqual(2);
  });

  it('cancel sends nothing', async () => {
    await openSettings();
    fireEvent.click(await screen.findByRole('switch', { name: 'Connector for Claude' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(puts()).toHaveLength(0);
    expect(screen.getByRole('switch', { name: 'Connector for Claude' })).toBeTruthy();
  });

  it('anyone but the owner or administrator sees the state, no switch, and who can change it', async () => {
    server = { ...server, enabled: true, canChange: false };
    const row = await openSettings();
    await waitFor(() => expect(row.textContent).toContain('On'));
    expect(row.textContent).toContain("Only the organisation's owner or administrator can change this.");
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it.each([
    ['fails', 'error'],
    ['answers in a shape the page does not know', 'shape'],
  ] as const)('a read that %s is "Could not be read", never "Off"', async (_label, read) => {
    server = { ...server, read };
    const row = await openSettings();
    await waitFor(() => expect(row.textContent).toContain('Could not be read'));
    expect(row.textContent).not.toMatch(/\bOff\b/);
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('a refused change says it was not changed, and the state stays as stored', async () => {
    server = { ...server, write: 'forbidden' };
    const row = await openSettings();
    fireEvent.click(await screen.findByRole('switch', { name: 'Connector for Claude' }));
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      "The setting was not changed. Only the organisation's owner or administrator can change it.",
    );
    expect(screen.getByRole('switch', { name: 'Connector for Claude' }).getAttribute('aria-checked')).toBe('false');
    expect(row.textContent).toContain('Off');
  });
});
