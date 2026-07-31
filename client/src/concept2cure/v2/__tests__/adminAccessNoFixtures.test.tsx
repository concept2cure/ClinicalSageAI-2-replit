// @vitest-environment jsdom
/**
 * AdminAccess — fixture-free contract (GA real-data standard).
 *
 * The surface used to fall back to an inline `FX` fixture — fabricated members
 * (Jordan Chen / Marcus Webb / Phoebe Brennan), roles, an SSO topology, a fake
 * audit row and settings — behind a "Sample data" pill whenever GET
 * /api/mdx/admin was unreachable or shape-mismatched. On an administrative
 * surface that is exactly the fabricated data the GA bar forbids, and it is
 * retired. These tests pin the three honest states the surface may now render —
 * the org's REAL admin estate from GET /api/mdx/admin (members, roles, api
 * keys, audit, settings and a truthful SSO object), an honest EMPTY state, or
 * an honest ERROR state — prove the KPI row is derived from the real rows, and
 * prove no retired fixture content or "Sample data" pill survives.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { AdminAccess } from '../surfaces/AdminAccess';

const props = () => ({
  surface: { id: 'admin-console', label: 'Admin and access' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

/* A REAL org-scoped payload — deliberately NOT the retired fixture, so anything
   rendered proves the response was adopted rather than a codebase constant. The
   route shape is { data: { kpis, members, roles, grants, apiKeys, audit,
   settings, sso }, meta } (server/routes/mdx-admin.ts). */
const REAL = {
  data: {
    kpis: [],
    members: [
      { id: 'u-11', initials: 'AR', name: 'Ada Rivera', email: 'ada@brightbio.io', role: 'Admin', groups: ['CMC'], sso: 'sso', mfa: true, lastSeen: '2026-07-30T00:00:00Z', state: 'active', programs: [] },
      { id: 'u-12', initials: 'BK', name: 'Ben Kwan', email: 'ben@brightbio.io', role: 'Manager', groups: [], sso: '', mfa: false, lastSeen: '', state: 'invited', programs: [] },
    ],
    roles: [
      { id: 'admin', label: 'Admin', members: 1, desc: '', scopes: [] },
      { id: 'manager', label: 'Manager', members: 1, desc: '', scopes: [] },
    ],
    grants: [
      { user: 'u-11', program: '*', scope: 'edit', granted: 'Org admin' },
      { user: 'u-12', program: '*', scope: 'view', granted: 'Org manager' },
    ],
    apiKeys: [
      { id: 'key-7', name: 'prod ingest key', owner: 'u-11', scopes: ['documents:read'], created: '2026-06-01', lastUsed: '2026-07-29T00:00:00Z', rotateIn: '' },
    ],
    audit: [
      { id: 'aud-90ab12', when: '2026-07-30T00:00:00Z', actor: 'u-11', action: 'data_modify', target: 'organizations · 2', sha: 'dead…babe' },
    ],
    settings: [
      { id: 'mfa-required', label: 'MFA required', kind: 'toggle', value: 'Yes (all roles)', desc: '21 CFR Part 11 §11.10(d) compliance' },
      { id: 'branding', label: 'Org branding', kind: 'text', value: 'Bright Biosciences', desc: 'Appears on PDF exports + cover letters' },
    ],
    sso: {
      primary: { kind: 'SAML/OIDC', provider: 'Configured IdP', status: 'connected', domain: 'brightbio.io', users: 2, lastSync: '' },
      fallback: { kind: 'Local', provider: 'Local users', status: 'enabled', domain: 'brightbio.io', users: 0, lastSync: 'real-time' },
      proposed: { kind: '—', provider: 'None staged', status: 'none', domain: '', users: 0, lastSync: 'never' },
      scim: { provider: 'SCIM 2.0', enabled: true, provisionedAttrs: 0, lastEvent: '' },
      mfaRequired: true, sessionTtl: '30m',
    },
  },
  meta: { count: 2 },
};

const EMPTY = {
  data: { kpis: [], members: [], roles: [], grants: [], apiKeys: [], audit: [], settings: [], sso: null },
  meta: { count: 0 },
};

/** Read the value cell of the KPI whose label matches. */
function kpiValue(label: string): string {
  const card = Array.from(document.querySelectorAll('.metric-card')).find((el) =>
    (el.querySelector('.metric-label')?.textContent || '').includes(label),
  );
  return card?.querySelector('.metric-val')?.textContent?.trim() || '';
}

/** Click the admin tab whose label matches. */
function clickTab(label: string) {
  const btn = Array.from(document.querySelectorAll('.adm-tab')).find((b) =>
    (b.textContent || '').includes(label),
  );
  fireEvent.click(btn as Element);
}

/* Fixture strings that must NEVER appear once the FX fixture is gone. */
const RETIRED = [
  'Jordan Chen',
  'Marcus Webb',
  'Phoebe Brennan',
  'jordan@example.io',
  'marcus@example.io',
  'phoebe@example.io',
  'ADM-0000',
  'awaiting live data',
  'Reg Affairs',
  'Sample data',
];

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
});

describe('AdminAccess — real admin estate renders (no fixture)', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/admin') {
        return { ok: true, status: 200, json: async () => REAL } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  });

  it('renders the REAL members and audit, with no provenance pill or fixture', async () => {
    render(<AdminAccess {...props()} />);

    // Members tab is default — the rows came from the response, not a fixture.
    // Ada is the auto-selected first member, so she appears in both the table
    // and the detail drawer (real-data behaviour) — hence findAllByText.
    expect((await screen.findAllByText('Ada Rivera')).length).toBeGreaterThan(0);
    expect(screen.getByText('Ben Kwan')).toBeTruthy();
    expect(screen.getByText('ben@brightbio.io')).toBeTruthy();
    // The admin audit band (always shown with real data) adopted the live row.
    expect(screen.getByText('data_modify')).toBeTruthy();
    expect(screen.getByText('aud-90ab12')).toBeTruthy();

    // No "Sample data" pill and none of the retired FX content.
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });

  it('derives every KPI from the real rows (not hardcoded, not a fixture)', async () => {
    render(<AdminAccess {...props()} />);
    await screen.findByText('Ben Kwan');

    expect(kpiValue('Members')).toBe('2');
    expect(kpiValue('Roles')).toBe('2');
    expect(kpiValue('MFA enabled')).toBe('1'); // only Ada has MFA
    expect(kpiValue('API keys')).toBe('1');
  });

  it('adopts the real API-keys and SSO panels on tab switch', async () => {
    render(<AdminAccess {...props()} />);
    await screen.findByText('Ben Kwan');

    clickTab('API keys');
    expect(await screen.findByText('prod ingest key')).toBeTruthy();

    clickTab('SSO');
    expect(await screen.findByText('Configured IdP')).toBeTruthy();

    // Still no fixture leakage after navigating panels.
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });
});

describe('AdminAccess — honest empty state', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/admin') {
        return { ok: true, status: 200, json: async () => EMPTY } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  });

  it('shows an EmptyState — never a fixture — when the org has no admin data', async () => {
    render(<AdminAccess {...props()} />);

    expect(await screen.findByText('No administrative data yet')).toBeTruthy();
    // KPIs read '--' rather than a fabricated number.
    expect(kpiValue('Members')).toBe('--');
    expect(kpiValue('API keys')).toBe('--');
    // No fixture rows, no tabs body, no pill.
    expect(document.querySelector('.adm-tabs')).toBeNull();
    expect(document.querySelector('.ctable-row')).toBeNull();
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });
});

describe('AdminAccess — honest error state', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/mdx/admin') {
        return { ok: false, status: 403, json: async () => ({ error: 'Organization admin access required.' }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  });

  it('shows an error EmptyState — never a fixture — when the read fails or the caller is not an org admin', async () => {
    render(<AdminAccess {...props()} />);

    expect(await screen.findByText("Couldn't load admin and access")).toBeTruthy();
    // KPIs read '--' rather than a fabricated number.
    await waitFor(() => expect(kpiValue('Members')).toBe('--'));
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });
});
