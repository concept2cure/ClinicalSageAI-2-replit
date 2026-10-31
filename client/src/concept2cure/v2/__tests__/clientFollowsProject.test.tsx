// @vitest-environment jsdom
/**
 * The current client follows the open project (2026-10-31: inside LMN-201, a
 * project of the "Lumen Bioscience (demo)" client, the header stayed on the
 * first client and Team & sharing was refused 403 — "The current client
 * workspace does not match this project").
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const tenant = vi.hoisted(() => ({
  currentOrganization: { id: 1 } as { id: number } | null,
  currentClientWorkspace: { id: '1', name: 'Concept2Cure Therapeutics', organizationId: '1' } as { id: string; name: string; organizationId: string } | null,
  setCurrentClientWorkspace: vi.fn(),
}));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => tenant }));

import { projectClientOf, useClientFollowsProject } from '../clientFollowsProject';
import { publishShellProject } from '../shellProject';

const LUMEN = '94223e96-6cd8-4f3e-80c3-85745b1434b5';
const answer = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
function Probe() { useClientFollowsProject(); return null; }

beforeEach(() => {
  apiRequest.mockReset();
  tenant.setCurrentClientWorkspace.mockReset();
  sessionStorage.clear();
});
afterEach(cleanup);

describe('the current client follows the open project', () => {
  it('reads the client from the project record, bare or enveloped', () => {
    expect(projectClientOf({ id: LUMEN, client_workspace_id: 3, client_name: 'Lumen Bioscience (demo — not affiliated)' }))
      .toEqual({ id: 3, name: 'Lumen Bioscience (demo — not affiliated)' });
    expect(projectClientOf({ data: { client_workspace_id: 3 } })).toEqual({ id: 3, name: null });
    expect(projectClientOf({ id: LUMEN })).toBeNull();
    expect(projectClientOf(null)).toBeNull();
  });

  it("makes the open project's client current when it is another client", async () => {
    apiRequest.mockResolvedValue(answer({ id: LUMEN, client_workspace_id: 3, client_name: 'Lumen Bioscience (demo — not affiliated)' }));
    publishShellProject({ id: LUMEN, title: 'LMN-201' });
    render(<Probe />);
    await waitFor(() => expect(tenant.setCurrentClientWorkspace).toHaveBeenCalledWith(
      { id: '3', name: 'Lumen Bioscience (demo — not affiliated)', organizationId: '1' }));
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/c2c/projects/${LUMEN}`);
  });

  it('changes nothing when the project is of the current client, or its record cannot be read', async () => {
    apiRequest.mockResolvedValueOnce(answer({ id: LUMEN, client_workspace_id: 1 }));
    publishShellProject({ id: LUMEN, title: 'C2C-101' });
    render(<Probe />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    cleanup();
    apiRequest.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as Response);
    render(<Probe />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(tenant.setCurrentClientWorkspace).not.toHaveBeenCalled();
  });
});
