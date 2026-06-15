import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiRequest = vi.fn();
vi.mock('../../../lib/queryClient', () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));

import {
  listScopes,
  listReportTypes,
  listProgramGroups,
  runReport,
  getRunDependencies,
  exportRunPdfUrl,
} from '../reportOsClient';

function jsonResponse(data: unknown): Response {
  return { json: async () => ({ data }) } as unknown as Response;
}

describe('reportOsClient', () => {
  beforeEach(() => apiRequest.mockReset());

  it('listScopes unwraps the data envelope and hits the scopes route', async () => {
    apiRequest.mockResolvedValueOnce(jsonResponse(['account', 'project', 'document']));
    const scopes = await listScopes();
    expect(scopes).toEqual(['account', 'project', 'document']);
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/report-os/scopes');
  });

  it('listReportTypes returns the taxonomy rows', async () => {
    apiRequest.mockResolvedValueOnce(
      jsonResponse([{ typeId: 'exec_board', label: 'Executive / Board', family: 'executive', allowedScopes: ['account'] }]),
    );
    const types = await listReportTypes();
    expect(types[0].typeId).toBe('exec_board');
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/report-os/taxonomy');
  });

  it('listProgramGroups threads the includeArchived flag', async () => {
    apiRequest.mockResolvedValue(jsonResponse([]));
    await listProgramGroups();
    expect(apiRequest).toHaveBeenLastCalledWith('GET', '/api/report-os/program-groups');
    await listProgramGroups(true);
    expect(apiRequest).toHaveBeenLastCalledWith('GET', '/api/report-os/program-groups?includeArchived=true');
  });

  it('runReport POSTs the input and returns run + blockers + confidence', async () => {
    apiRequest.mockResolvedValueOnce(
      jsonResponse({
        run: { id: 7, scopeType: 'project', scopeId: 'p1', reportTypeId: 'ra_lead', status: 'partial', blockers: ['x'], confidence: 0.6 },
        snapshot: { id: 3, runId: 7, snapshotVersion: 1, isLatest: true },
        blockers: ['x'],
        confidence: 0.6,
      }),
    );
    const input = {
      organizationId: 2,
      scopeType: 'project' as const,
      scopeId: 'p1',
      reportTypeId: 'ra_lead',
      requestedBy: 9,
    };
    const result = await runReport(input);
    expect(result.run.id).toBe(7);
    expect(result.blockers).toEqual(['x']);
    expect(result.confidence).toBe(0.6);
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/report-os/runs', input);
  });

  it('getRunDependencies returns dependency rows for a run', async () => {
    apiRequest.mockResolvedValueOnce(jsonResponse([{ id: 1, runId: 7, provider: 'submission_readiness', status: 'ready', observedAt: 'now' }]));
    const deps = await getRunDependencies(7);
    expect(deps[0].provider).toBe('submission_readiness');
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/report-os/runs/7/dependencies');
  });

  it('falls back to safe empty data when the envelope is missing', async () => {
    apiRequest.mockResolvedValueOnce({ json: async () => ({}) } as unknown as Response);
    expect(await listScopes()).toEqual([]);
  });

  it('exportRunPdfUrl builds the sealed-PDF route', () => {
    expect(exportRunPdfUrl(42)).toBe('/api/report-os/runs/42/export.pdf');
  });
});
