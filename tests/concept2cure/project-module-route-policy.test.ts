import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeRedirect } from '../../client/src/concept2cure/auth/redirectUtils';
import {
  buildLoginRedirectPath,
  getProjectModuleRoutePolicy,
  parseProjectRoute,
} from '../../client/src/concept2cure/router/projectModuleRoutePolicy';
import {
  useProjectModules,
  useUnlinkModule,
  useUpdateModuleLink,
} from '../../client/src/concept2cure/hooks/useEnterprise';

describe('project module route policy', () => {
  it('routes project 510k exact path into ZenApp shell when embedding is enabled', () => {
    const policy = getProjectModuleRoutePolicy('/concept2cure/project/proj-1/510k', true);
    expect(policy.projectId).toBe('proj-1');
    expect(policy.module).toBe('510k');
    expect(policy.shouldRenderInShell).toBe(true);
    expect(policy.shouldRenderStandalone).toBe(false);
  });

  it('routes project 510k exact and nested paths to standalone when embedding is disabled', () => {
    const exact = getProjectModuleRoutePolicy('/concept2cure/project/proj-1/510k', false);
    const nested = getProjectModuleRoutePolicy('/concept2cure/project/proj-1/510k/section/11', false);

    expect(exact.shouldRenderStandalone).toBe(true);
    expect(exact.shouldRenderInShell).toBe(false);
    expect(nested.shouldRenderStandalone).toBe(true);
    expect(nested.moduleSubPath).toBe('section/11');
  });

  it('routes project PMA exact and nested paths to standalone when embedding is disabled', () => {
    const exact = getProjectModuleRoutePolicy('/concept2cure/project/proj-2/pma', false);
    const nested = getProjectModuleRoutePolicy('/concept2cure/project/proj-2/pma/review/risk', false);

    expect(exact.module).toBe('pma');
    expect(exact.shouldRenderStandalone).toBe(true);
    expect(nested.module).toBe('pma');
    expect(nested.moduleSubPath).toBe('review/risk');
    expect(nested.shouldRenderStandalone).toBe(true);
  });

  it('preserves projectId for deep nested module paths', () => {
    const parsed = parseProjectRoute('/concept2cure/project/deep-project-id-42/510k/foo/bar/baz');
    expect(parsed.projectId).toBe('deep-project-id-42');
    expect(parsed.module).toBe('510k');
    expect(parsed.moduleSubPath).toBe('foo/bar/baz');
  });

  it('builds login redirect with returnTo and preserves route intent contract post-login', () => {
    const loginPath = buildLoginRedirectPath('/concept2cure/project/proj-77/510k/section/12');
    expect(loginPath).toBe(
      '/concept2cure/login?returnTo=%2Fconcept2cure%2Fproject%2Fproj-77%2F510k%2Fsection%2F12'
    );

    const preservedDestination = computeRedirect(
      '?returnTo=%2Fconcept2cure%2Fproject%2Fproj-77%2F510k%2Fsection%2F12'
    );
    expect(preservedDestination).toBe('/concept2cure/project/proj-77/510k/section/12');
  });

  it('extracts ownership preferences API path from project route id', () => {
    const parsed = parseProjectRoute('/concept2cure/project/proj_123');
    expect(parsed.projectId).toBe('proj_123');
    const ownershipPatchPath = `/api/concept2cure/projects/${parsed.projectId}/ownership-preferences`;
    expect(ownershipPatchPath).toBe('/api/concept2cure/projects/proj_123/ownership-preferences');
  });
});

describe('project module enterprise hooks', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    global.fetch = fetchSpy;
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createWrapper() {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
  }

  it('unwraps the modules payload returned by the project modules API', async () => {
    const modules = [
      {
        id: 1,
        projectId: 88,
        organizationId: 5,
        clientWorkspaceId: 3,
        moduleType: 'pma',
        moduleInstanceId: 42,
        status: 'active',
        settings: null,
        metadata: { source: 'workspace' },
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ];

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ projectId: 88, modules, count: 1 }),
    });

    const { result } = renderHook(() => useProjectModules(88), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(modules);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/projects/88/modules',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );
  });

  it('updates a module link using the composite module route', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: 1,
          projectId: 88,
          organizationId: 5,
          clientWorkspaceId: 3,
          moduleType: 'pma',
          moduleInstanceId: 42,
          status: 'completed',
          settings: { reviewStage: 'panel' },
          metadata: null,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        }),
    });

    const { result } = renderHook(() => useUpdateModuleLink(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      projectId: 88,
      moduleType: 'pma',
      moduleInstanceId: 42,
      data: {
        status: 'completed',
        settings: { reviewStage: 'panel' },
      },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/projects/88/modules/pma/42',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          status: 'completed',
          settings: { reviewStage: 'panel' },
        }),
      })
    );
  });

  it('unlinks a module using module type and instance id', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    });

    const { result } = renderHook(() => useUnlinkModule(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      projectId: 88,
      moduleType: 'pma',
      moduleInstanceId: 42,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/projects/88/modules/pma/42',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });
});

