/** @vitest-environment jsdom */
/**
 * The open program's segment, and where the client type is chosen.
 *
 * MDX demo pack, 2026-09-21, finding F9: with the 510(k) IVD program open, the
 * top bar read "Biotech & Pharma" — the segment is a stored preference and
 * nothing told it a device program was open. The fix made the top bar's
 * client-domain label follow the open program's product type
 * (segmentForShellProject).
 *
 * FILING_SPINE F8 (2026-10-08) took that control out of the top bar: it was a
 * second place to set the client type, which the account menu's Client type
 * already sets, and no screen named the open project. The top bar now names the
 * project (topBarProject.test.tsx). This file pinned the old control's label;
 * it now pins what remains true:
 *   - the mapping from a program to its segment (pure, unchanged);
 *   - the top bar no longer shows any client type, so the F9 defect — a client
 *     type beside a program it does not describe — has no place to come back;
 *   - the client type is chosen in one place, the account menu's Client type,
 *     and opening a program does not change that setting.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ currentOrganization: { name: 'Concept2Cure Diagnostics' } }),
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 7, firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: ['admin'] }, logout: vi.fn() }),
}));

import { NavEntitlementsProvider } from '../navEntitlements';
import { Rail, TopBar } from '../Shell';
import { publishShellProject, segmentForShellProject } from '../shellProject';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;
const surface = { id: 'project-home', label: 'Project' } as never;
const IVD_PROGRAM = { id: '82d3b729', title: '[Demo · MDX] NeuroPanel-Dx 510(k)', ws: 'MDX', productType: 'ivd' };

beforeEach(() => {
  delete (window as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  sessionStorage.clear();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    url === '/api/module-subscriptions/navigation'
      ? ok({ organizationId: 7, tier: 'enterprise', industryMode: 'biotech', masterAdmin: false, resolved: true, surfaces: [] })
      : ok({ data: [] }),
  );
});
afterEach(() => {
  cleanup();
  delete (window as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  sessionStorage.clear();
});

describe('segmentForShellProject (pure)', () => {
  it('maps product type first, workstream second, nothing otherwise', () => {
    expect(segmentForShellProject({ id: 'p', productType: 'ivd' })).toBe('diagnostics');
    expect(segmentForShellProject({ id: 'p', productType: 'cdx' })).toBe('diagnostics');
    expect(segmentForShellProject({ id: 'p', productType: 'device' })).toBe('medtech');
    expect(segmentForShellProject({ id: 'p', productType: 'samd' })).toBe('medtech');
    expect(segmentForShellProject({ id: 'p', productType: 'drug' })).toBe('biopharma');
    expect(segmentForShellProject({ id: 'p', productType: 'biologic' })).toBe('biopharma');
    expect(segmentForShellProject({ id: 'p', ws: 'MDX' })).toBe('medtech');
    expect(segmentForShellProject({ id: 'p', ws: 'Biotech' })).toBe('biopharma');
    expect(segmentForShellProject({ id: 'p', ws: 'CRO' })).toBe('cro');
    expect(segmentForShellProject({ id: 'p' })).toBeNull();
    expect(segmentForShellProject(null)).toBeNull();
    // An unknown product type is not guessed.
    expect(segmentForShellProject({ id: 'p', productType: 'widget' })).toBeNull();
  });
});

describe('the top bar shows no client type (FILING_SPINE F8)', () => {
  const renderBar = (segment = 'biopharma') =>
    render(<TopBar surface={surface} onPalette={() => {}} segment={segment} onSegment={() => {}} onNav={() => {}} />);
  const barText = () => document.querySelector('header.topbar')?.textContent ?? '';

  it('with an IVD program open and a pharma preference, it names the program and no client type', () => {
    publishShellProject(IVD_PROGRAM);
    renderBar('biopharma');
    expect(barText()).toContain('[Demo · MDX] NeuroPanel-Dx 510(k)');
    expect(barText()).not.toMatch(/Biotech & Pharma|In Vitro Diagnostics|Medical Device/);
  });

  it('with no program open, it shows no client type either', () => {
    renderBar('medtech');
    expect(barText()).toContain('No project open');
    expect(barText()).not.toMatch(/Biotech & Pharma|In Vitro Diagnostics|Medical Device/);
  });

  it('when the program publishes its product type, the top bar still names the program', () => {
    publishShellProject({ id: '82d3b729', title: 'NeuroPanel-Dx 510(k)', ws: 'MDX' });
    renderBar('biopharma');
    act(() => {
      publishShellProject({ id: '82d3b729', title: 'NeuroPanel-Dx 510(k)', ws: 'MDX', productType: 'ivd' });
    });
    expect(barText()).toContain('NeuroPanel-Dx 510(k)');
    expect(barText()).not.toMatch(/In Vitro Diagnostics/);
  });
});

describe("the account menu's Client type is the one place the type is chosen", () => {
  async function openMenu(segment: string) {
    const setSegment = vi.fn();
    render(
      <NavEntitlementsProvider>
        <Rail activeId="project-home" onNav={vi.fn()} collapsed={false} setCollapsed={() => {}} segment={segment} setSegment={setSegment} />
      </NavEntitlementsProvider>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    fireEvent.click(screen.getByTitle('Ada Rowe'));
    return { setSegment, group: within(screen.getByRole('menu')).getByRole('group', { name: 'Client type' }) };
  }

  it('opening an IVD program does not change the setting: the preference stays checked', async () => {
    publishShellProject(IVD_PROGRAM);
    const { group } = await openMenu('biopharma');
    const checked = within(group).getAllByRole('menuitemradio').filter((t) => t.getAttribute('aria-checked') === 'true');
    expect(checked.map((t) => t.textContent?.trim())).toEqual(['Biotech & Pharma']);
  });

  it('choosing another type there sets it', async () => {
    publishShellProject(IVD_PROGRAM);
    const { group, setSegment } = await openMenu('biopharma');
    fireEvent.click(within(group).getByRole('menuitemradio', { name: /Medical Device & IVD/ }));
    expect(setSegment).toHaveBeenCalledWith('medtech');
  });
});
