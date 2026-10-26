// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({
  ...(await original<typeof import('@/lib/queryClient')>()), apiRequest,
}));
import { Apps } from '../surfaces/AdminSurfaces';
import { useActiveSurfaceContext } from '../surfaceContext';

const surface = { id: 'apps', label: 'Subscription & features' } as UiSurface;
const license = {
  tier: 'professional', industryMode: 'medtech', enabledModules: [],
  usage: { projects: { currentCount: 1, maxAllowed: 10 }, users: { currentCount: 2, maxAllowed: 20 } },
};
const row = (moduleId: string, name: string, over: Record<string, unknown> = {}) => ({
  moduleId, name, description: `${name} work`, category: 'authoring',
  isEnabled: false, subscriptionState: 'none', isAvailable: true,
  requiredTier: 'standard', sortOrder: 10, ...over,
});
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
function mockCatalog(modules: ReturnType<typeof row>[], put?: (url: string, body: unknown) => Promise<Response>) {
  apiRequest.mockImplementation(async (method: string, url: string, body: unknown) => {
    if (method === 'GET' && url === '/api/module-subscriptions/catalog') return ok({ modules });
    if (method === 'GET' && url === '/api/module-subscriptions/license') return ok(license);
    if (method === 'PUT' && put) return put(url, body);
    throw new Error(`Unexpected ${method} ${url}`);
  });
}
function mount() {
  const onNav = vi.fn();
  render(<Apps surface={surface} onAsk={vi.fn()} onNav={onNav} segment="medtech" />);
  return onNav;
}
function revealAccess() {
  const details = screen.getByText(/Feature access \(/).closest('details')!;
  details.open = true;
  return within(details);
}
afterEach(() => { cleanup(); apiRequest.mockReset(); });

describe('Apps catalog reaches MDX through Projects', () => {
  it('grounds AnA in the project journey and feature access without an app-count product model', async () => {
    mockCatalog([row('projects', 'Projects'), row('device-cer', 'Clinical evaluation')]);
    mount();
    await screen.findByTestId('mdx-catalog-solution');
    const { result } = renderHook(() => useActiveSurfaceContext('apps'));
    await waitFor(() => expect(result.current?.summary).toContain('project journey'));
    expect(result.current?.facts).not.toHaveProperty('totalApps');
    expect(result.current?.facts).not.toHaveProperty('enabledApps');
    expect(result.current?.facts?.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ features: expect.arrayContaining([expect.objectContaining({ id: 'device-cer' })]) }),
    ]));
  });

  it('groups features across catalog categories into one solution and keeps shared apps reachable', async () => {
    mockCatalog([
      row('quality', 'Quality'),
      row('device-510k', '510(k) submission'),
      row('risk', 'Risk management', { category: 'quality', sortOrder: 20 }),
      row('device-cer', 'Clinical evaluation', { category: 'clinical', sortOrder: 30 }),
    ]);
    const onNav = mount();
    const solution = await screen.findByTestId('mdx-catalog-solution');
    expect(screen.getAllByTestId('mdx-catalog-solution')).toHaveLength(1);
    expect(solution.closest('.workflow-area')?.getAttribute('aria-label')).toBe('Projects');
    expect(solution.querySelectorAll('[data-feature-id]')).toHaveLength(3);
    expect(solution.querySelector('.launch-grid')).toBeNull();
    fireEvent.click(within(solution).getByRole('button', { name: 'Open projects' }));
    expect(onNav).toHaveBeenLastCalledWith('projects');
    expect(revealAccess().queryByRole('button', { name: 'Open' })).toBeNull();
    const qualityCard = screen.getByText('Quality').closest('.launch')!;
    qualityCard.closest('details')!.open = true;
    fireEvent.click(within(qualityCard as HTMLElement).getByRole('button', { name: 'Open' }));
    expect(onNav).toHaveBeenLastCalledWith('quality');
  });

  it('searches within the Projects MDX workflow and preserves unknown additional capabilities', async () => {
    mockCatalog([
      row('device-510k', '510(k) submission'),
      row('device-cer', 'Clinical evaluation'),
      row('partner-evidence', 'Partner evidence', { category: 'Partner services' }),
    ]);
    mount();
    await screen.findByTestId('mdx-catalog-solution');
    const search = screen.getByRole('searchbox', { name: 'Find a feature' });
    fireEvent.change(search, { target: { value: 'Clinical evaluation' } });
    const solution = screen.getByTestId('mdx-catalog-solution');
    expect(solution.closest('.workflow-area')?.getAttribute('aria-label')).toBe('Projects');
    expect(solution.querySelectorAll('[data-feature-id]')).toHaveLength(1);
    expect(solution.querySelector('details')?.open).toBe(true);
    expect(screen.queryByText('510(k) submission', { selector: '.launch-title' })).toBeNull();
    fireEvent.change(search, { target: { value: 'MDX solutions' } });
    expect(screen.getByTestId('mdx-catalog-solution').querySelectorAll('[data-feature-id]')).toHaveLength(2);
    fireEvent.change(search, { target: { value: 'Partner evidence' } });
    expect(screen.queryByTestId('mdx-catalog-solution')).toBeNull();
    expect(screen.getByText('Partner evidence', { selector: '.launch-title' }).closest('[data-workflow]')?.getAttribute('data-workflow')).toBe('additional');
  });

  it('preserves disabled, tier and industry reasons on individual feature rows', async () => {
    mockCatalog([
      row('device-510k', '510(k) submission', { subscriptionState: 'disabled' }),
      row('device-cer', 'Clinical evaluation', { isAvailable: false, requiredTier: 'enterprise' }),
      row('risk', 'Risk management', { isAvailable: false, requiredTier: 'standard' }),
    ]);
    mount();
    await screen.findByTestId('mdx-catalog-solution');
    const access = revealAccess();
    expect(access.getByText(/510\(k\) submission is turned off for this workspace/)).toBeTruthy();
    expect(access.getByText(/Clinical evaluation is not included in your subscription/)).toBeTruthy();
    expect(access.getByText(/Risk management is not offered for this workspace/)).toBeTruthy();
    fireEvent.click(screen.getByTitle('Toggle admin controls'));
    expect(access.getAllByRole('switch')).toHaveLength(1);
    expect(access.getByRole('switch', { name: 'Enable 510(k) submission' })).toBeTruthy();
  });

  it('governs a feature access change using the original module id and catalog group', async () => {
    const put = vi.fn(async () => ok({ auditTrail: { persisted: true } }));
    mockCatalog([
      row('quality', 'Quality'),
      row('risk', 'Risk management', { category: 'quality', sortOrder: 20, subscriptionState: 'disabled' }),
    ], put);
    mount();
    await screen.findByTestId('mdx-catalog-solution');
    const access = revealAccess();
    fireEvent.click(screen.getByTitle('Toggle admin controls'));
    fireEvent.click(access.getByRole('switch', { name: 'Enable Risk management' }));
    expect(put).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    fireEvent.change(dialog.querySelector('textarea')!, { target: { value: 'Enable risk work for active device projects' } });
    fireEvent.change(dialog.querySelector('input')!, { target: { value: 'yes' } });
    fireEvent.click(screen.getByText('Confirm and log'));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/module-subscriptions/risk/toggle', {
      enabled: true, reason: 'Enable risk work for active device projects',
    }));
    await waitFor(() => expect(access.getByRole('switch', { name: 'Disable Risk management' }).getAttribute('aria-checked')).toBe('true'));
    expect(screen.getByText('Quality').closest('.launch')?.getAttribute('data-locked')).toBeNull();
  });
});
