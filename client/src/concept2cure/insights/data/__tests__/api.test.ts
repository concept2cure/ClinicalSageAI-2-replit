import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Light data-layer checks for the Insights API client.
 *
 * The repo's vitest environment is `node` (no DOM). We mock the app's shared
 * `apiRequest` helper so each api function can be exercised without a network
 * round-trip, then assert (a) the right URL/method is called and (b) the
 * `{ data }` envelope is unwrapped. The pure `buildRunsQuery` is tested
 * directly. Mocks are declared via a factory so the mock is hoisted ahead of
 * the module-under-test's static import of `@/lib/queryClient`.
 */

const apiRequestMock = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

import {
  REPORT_OS_BASE,
  buildRunsQuery,
  createReportRun,
  fetchProgramGroups,
  fetchRenderedReport,
  fetchReportTypes,
  fetchRunDependencies,
  fetchRuns,
  fetchScopes,
} from '../api';
import type { CreateReportRunInput, FetchRunsParams } from '../types';

/** Build a minimal Response-like object whose `.json()` yields `body`. */
function jsonResponse(body: unknown): Response {
  return { json: async () => body } as unknown as Response;
}

beforeEach(() => {
  apiRequestMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('buildRunsQuery', () => {
  it('always emits organizationId and omits undefined params', () => {
    const params: FetchRunsParams = { organizationId: 42 };
    const qs = new URLSearchParams(buildRunsQuery(params));
    expect(qs.get('organizationId')).toBe('42');
    expect(qs.has('scopeType')).toBe(false);
    expect(qs.has('limit')).toBe(false);
  });

  it('serializes all provided filter params', () => {
    const params: FetchRunsParams = {
      organizationId: 7,
      scopeType: 'project',
      scopeId: '123',
      status: 'partial',
      reportTypeId: 'readiness',
      search: 'foo',
      sortBy: 'confidence',
      sortOrder: 'asc',
      limit: 25,
    };
    const qs = new URLSearchParams(buildRunsQuery(params));
    expect(qs.get('organizationId')).toBe('7');
    expect(qs.get('scopeType')).toBe('project');
    expect(qs.get('scopeId')).toBe('123');
    expect(qs.get('status')).toBe('partial');
    expect(qs.get('reportTypeId')).toBe('readiness');
    expect(qs.get('search')).toBe('foo');
    expect(qs.get('sortBy')).toBe('confidence');
    expect(qs.get('sortOrder')).toBe('asc');
    expect(qs.get('limit')).toBe('25');
  });
});

describe('api functions', () => {
  it('fetchReportTypes GETs /taxonomy and unwraps { data }', async () => {
    const types = [{ typeId: 't', label: 'T', family: 'f', allowedScopes: [], allowedPersonas: [] }];
    apiRequestMock.mockResolvedValueOnce(jsonResponse({ data: types }));

    const result = await fetchReportTypes();

    expect(apiRequestMock).toHaveBeenCalledWith('GET', `${REPORT_OS_BASE}/taxonomy`);
    expect(result).toEqual(types);
  });

  it('fetchScopes GETs /scopes and unwraps { data }', async () => {
    apiRequestMock.mockResolvedValueOnce(jsonResponse({ data: ['account', 'project'] }));

    const result = await fetchScopes();

    expect(apiRequestMock).toHaveBeenCalledWith('GET', `${REPORT_OS_BASE}/scopes`);
    expect(result).toEqual(['account', 'project']);
  });

  it('createReportRun POSTs /runs with the input body and unwraps { data }', async () => {
    const input: CreateReportRunInput = {
      organizationId: 1,
      scopeType: 'project',
      scopeId: '9',
      reportTypeId: 'readiness',
    };
    const payload = { run: { id: 'r1' }, snapshot: {}, blockers: [], confidence: 0.5 };
    apiRequestMock.mockResolvedValueOnce(jsonResponse({ data: payload }));

    const result = await createReportRun(input);

    expect(apiRequestMock).toHaveBeenCalledWith('POST', `${REPORT_OS_BASE}/runs`, input);
    expect(result).toEqual(payload);
  });

  it('fetchRuns GETs /runs with a query string and unwraps { data }', async () => {
    const runs = [{ id: 'r1', reportTypeId: 't', scopeType: 'project', scopeId: '9', status: 'final', confidence: 1 }];
    apiRequestMock.mockResolvedValueOnce(jsonResponse({ data: runs }));

    const result = await fetchRuns({ organizationId: 3, scopeType: 'project' });

    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    const [method, url] = apiRequestMock.mock.calls[0];
    expect(method).toBe('GET');
    expect(url).toContain(`${REPORT_OS_BASE}/runs?`);
    expect(url).toContain('organizationId=3');
    expect(url).toContain('scopeType=project');
    expect(result).toEqual(runs);
  });

  it('fetchRenderedReport GETs /runs/:id/rendered and unwraps { data }', async () => {
    const rendered = { reportTypeId: 't', scopeType: 'project', scopeId: '9', generatedAt: 'x', status: 'final', sections: [] };
    apiRequestMock.mockResolvedValueOnce(jsonResponse({ data: rendered }));

    const result = await fetchRenderedReport(55);

    expect(apiRequestMock).toHaveBeenCalledWith('GET', `${REPORT_OS_BASE}/runs/55/rendered`);
    expect(result).toEqual(rendered);
  });

  it('fetchRunDependencies GETs /runs/:id/dependencies and unwraps { data }', async () => {
    const deps = [{ id: 1, runId: 55, provider: 'p', status: 'ready', blocker: null, observedAt: 'x' }];
    apiRequestMock.mockResolvedValueOnce(jsonResponse({ data: deps }));

    const result = await fetchRunDependencies(55);

    expect(apiRequestMock).toHaveBeenCalledWith('GET', `${REPORT_OS_BASE}/runs/55/dependencies`);
    expect(result).toEqual(deps);
  });

  it('fetchProgramGroups GETs /program-groups with organizationId and unwraps { data }', async () => {
    const groups = [{ id: 1, organizationId: 3, name: 'g', status: 'active', projects: [] }];
    apiRequestMock.mockResolvedValueOnce(jsonResponse({ data: groups }));

    const result = await fetchProgramGroups(3);

    const [method, url] = apiRequestMock.mock.calls[0];
    expect(method).toBe('GET');
    expect(url).toContain(`${REPORT_OS_BASE}/program-groups?`);
    expect(url).toContain('organizationId=3');
    expect(result).toEqual(groups);
  });

  it('unwrap falls back to the raw payload when there is no { data } envelope', async () => {
    const raw = ['account', 'project'];
    apiRequestMock.mockResolvedValueOnce(jsonResponse(raw));

    const result = await fetchScopes();

    expect(result).toEqual(raw);
  });
});
