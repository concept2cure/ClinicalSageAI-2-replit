// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getSurface } from '@shared/constants/ui-surface-registry';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Apps } from '../surfaces/WorkflowCatalog';

const CATALOG_PATH = '/api/module-subscriptions/catalog';
const LICENSE_PATH = '/api/module-subscriptions/license';
const SURFACE = getSurface('apps')!;
const CATALOG = {
  modules: [{
    moduleId: 'vault', name: 'Recovered source library', description: 'Saved source records',
    category: 'documents', icon: null, path: '/vault', isEnabled: true,
    subscriptionState: 'enabled', isAvailable: true, requiredTier: 'standard', sortOrder: 10,
  }],
};
const LICENSE = {
  organizationId: 7, tier: 'professional', industryMode: 'biotech',
  usage: {
    projects: { currentCount: 3, maxAllowed: 25 },
    users: { currentCount: 9, maxAllowed: 50 },
  },
};

function response(payload: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function readCount(path: string) {
  return apiRequest.mock.calls.filter(([method, url]) => method === 'GET' && url === path).length;
}

function mount() {
  return render(<Apps surface={SURFACE} onAsk={() => {}} onNav={() => {}} segment="biotech" />);
}

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('catalog and subscription read recovery on the mounted screen', () => {
  it('retries only the catalog, shows loading, suppresses repeat dispatch and preserves the search', async () => {
    const retry = deferred<Response>();
    apiRequest.mockImplementation((method: string, path: string) => {
      if (path === LICENSE_PATH) return Promise.resolve(response(LICENSE));
      if (method === 'GET' && path === CATALOG_PATH) {
        return readCount(CATALOG_PATH) === 1
          ? Promise.resolve(response({ error: 'temporarily unavailable' }, 503)) : retry.promise;
      }
      throw new Error('Unexpected request');
    });
    mount();
    const button = await screen.findByRole('button', { name: 'Retry features' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a feature' }), { target: { value: 'Recovered' } });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(await screen.findByText('Loading features…')).toBeTruthy();
    expect(screen.getByText('Current subscription')).toBeTruthy();
    expect(readCount(CATALOG_PATH)).toBe(2);
    expect(readCount(LICENSE_PATH)).toBe(1);
    await act(async () => { retry.resolve(response(CATALOG)); });
    expect(await screen.findByText('Recovered source library')).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Find a feature' })).toHaveProperty('value', 'Recovered');
    expect(screen.queryByText("Couldn't load features")).toBeNull();
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it('retries only subscription details while the catalog remains readable', async () => {
    const retry = deferred<Response>();
    apiRequest.mockImplementation((_method: string, path: string) => {
      if (path === CATALOG_PATH) return Promise.resolve(response(CATALOG));
      return readCount(LICENSE_PATH) === 1
        ? Promise.resolve(response({ error: 'temporarily unavailable' }, 503)) : retry.promise;
    });
    mount();
    const button = await screen.findByRole('button', { name: 'Retry subscription details' });
    expect(screen.getByText('Recovered source library')).toBeTruthy();
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(await screen.findByText('Loading license…')).toBeTruthy();
    expect(screen.getByText('Recovered source library')).toBeTruthy();
    expect(readCount(LICENSE_PATH)).toBe(2);
    expect(readCount(CATALOG_PATH)).toBe(1);
    await act(async () => { retry.resolve(response(LICENSE)); });
    expect(await screen.findByText('Current subscription')).toBeTruthy();
    expect(screen.getByText('3 / 25')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry subscription details' })).toBeNull();
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it.each([
    ['features', CATALOG_PATH, 'Retry features', CATALOG, 'Recovered source library'],
    ['subscription', LICENSE_PATH, 'Retry subscription details', LICENSE, 'Current subscription'],
  ] as const)('keeps repeated %s failures recoverable without automatic rereads', async (_name, pathToRetry, label, payload, restoredText) => {
    let restored = false;
    const otherPath = pathToRetry === CATALOG_PATH ? LICENSE_PATH : CATALOG_PATH;
    apiRequest.mockImplementation((_method: string, path: string) => Promise.resolve(
      path === pathToRetry && restored ? response(payload) : response(null, 503),
    ));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: label }));
    await waitFor(() => expect(readCount(pathToRetry)).toBe(2));
    expect(await screen.findByRole('button', { name: label })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry features' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry subscription details' })).toBeTruthy();
    expect(readCount(otherPath)).toBe(1);
    restored = true;
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(await screen.findByText(restoredText)).toBeTruthy();
    expect(readCount(pathToRetry)).toBe(3);
    expect(readCount(otherPath)).toBe(1);
    expect(screen.queryByText('No features available')).toBeNull();
  });
});

describe('catalog and subscription payload recovery', () => {
  it.each([
    ['malformed object', { unexpected: [] }, 200],
    ['array envelope', { data: [] }, 200],
    ['absent payload', null, 200],
    ['no content', undefined, 204],
  ])('recovers a %s catalog response without calling it an empty catalog', async (_name, payload, status) => {
    apiRequest.mockImplementation((_method: string, path: string) => Promise.resolve(
      path === LICENSE_PATH ? response(LICENSE)
        : readCount(CATALOG_PATH) === 1 ? response(payload, status as number) : response(CATALOG),
    ));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry features' }));
    expect(screen.queryByText('No features available')).toBeNull();
    expect(await screen.findByText('Recovered source library')).toBeTruthy();
    expect(readCount(CATALOG_PATH)).toBe(2);
    expect(readCount(LICENSE_PATH)).toBe(1);
  });

  it.each([
    ['malformed usage', { tier: 'professional', usage: {} }, 200],
    ['absent payload', null, 200],
    ['no content', undefined, 204],
  ])('recovers %s subscription details without refetching the catalog', async (_name, payload, status) => {
    apiRequest.mockImplementation((_method: string, path: string) => Promise.resolve(
      path === CATALOG_PATH ? response(CATALOG)
        : readCount(LICENSE_PATH) === 1 ? response(payload, status as number) : response(LICENSE),
    ));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry subscription details' }));
    expect(await screen.findByText('Current subscription')).toBeTruthy();
    expect(readCount(LICENSE_PATH)).toBe(2);
    expect(readCount(CATALOG_PATH)).toBe(1);
  });

  it('retains the genuine empty-catalog state after a successful empty list', async () => {
    apiRequest.mockImplementation((_method: string, path: string) => Promise.resolve(
      response(path === CATALOG_PATH ? { modules: [] } : LICENSE),
    ));
    mount();
    expect(await screen.findByText('No features available')).toBeTruthy();
    expect(screen.queryByText("Couldn't load features")).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry features' })).toBeNull();
    expect(readCount(CATALOG_PATH)).toBe(1);
  });
});
