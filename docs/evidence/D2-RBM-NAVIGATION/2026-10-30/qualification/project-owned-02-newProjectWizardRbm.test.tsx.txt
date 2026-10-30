// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const fixture = vi.hoisted(() => ({ request: vi.fn(), setWorkspace: vi.fn() }));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ id: '12', organizationId: '7' }) }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: { id: 7 }, setCurrentClientWorkspace: fixture.setWorkspace }) }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: fixture.request }));
vi.mock('../surfaces/AnaVerbs', () => ({ RegistryPicker: ({ onChange }: { onChange: (id: string) => void }) => <button onClick={() => onChange('510k')}>Pick filing</button> }));
vi.mock('../surfaces/RegistryBridge', () => ({ getSubmissionTypeContext: () => ({ id: 'us_510k', displayName: 'Traditional 510(k)', pathwayKey: '510k', agency: 'FDA', region: 'US' }) }));

import { setAuthToken, clearAuthToken } from '@/utils/authToken';
import { NewProjectWizard } from '../surfaces/Projects';
import { clearShellProject } from '../shellProject';

const projectId = 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05';
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const posts = () => fixture.request.mock.calls.filter(([method]) => method === 'POST');
async function configure() {
  fireEvent.click(screen.getByRole('button', { name: 'Pick filing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Client workspace' })).toHaveProperty('value', '21'));
  fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: 'A monitoring project' } });
}
beforeEach(() => {
  clearShellProject();
  setAuthToken(`e30.${btoa(JSON.stringify({ userId: 12, organizationId: 7 }))}.signature`);
  fixture.request.mockImplementation(async (method: string) => method === 'GET' ? response({ success: true,
    clients: [{ id: '21', name: 'Sponsor A', organizationId: '7', status: 'active' }],
    meta: { purpose: 'project-intake', organizationId: 7, actorUserId: 12 } }) : response({
    data: { id: projectId, title: 'A monitoring project' },
    meta: { created: true, projectAnchorId: 31, organizationId: 7, actorUserId: 12, clientWorkspaceId: 21, clientWorkspaceName: 'Sponsor A' },
  }, 201));
});
afterEach(() => { cleanup(); fixture.request.mockReset(); fixture.setWorkspace.mockReset(); clearAuthToken(); clearShellProject(); });

describe('existing project setup monitoring choice', () => {
  it('reviews and persists the explicitly selected monitoring service without seeding a record', async () => {
    const onNav = vi.fn();
    render(<NewProjectWizard onClose={vi.fn()} onNav={onNav} />);
    await configure();
    const choice = screen.getByRole('checkbox', { name: /risk-based monitoring/i });
    expect(choice).toHaveProperty('checked', false);
    fireEvent.click(choice);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(document.querySelector('.npw-review')?.textContent).toContain('Risk-based monitoring');
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('project-home'));
    expect(posts()).toHaveLength(1);
    expect(posts()[0].slice(0, 3)).toEqual(['POST', '/api/c2c/projects', expect.objectContaining({ riskBasedMonitoring: true, programType: '510k' })]);
    expect(fixture.request.mock.calls.some(([, path]) => String(path).includes('/rbm-'))).toBe(false);
  });

  it('leaves monitoring unselected unless the creator chooses it', async () => {
    const onNav = vi.fn();
    render(<NewProjectWizard onClose={vi.fn()} onNav={onNav} />);
    await configure();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(document.querySelector('.npw-review')?.textContent).toContain('Not selected');
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('project-home'));
    expect(posts()[0][2]).toMatchObject({ riskBasedMonitoring: false });
  });
});
