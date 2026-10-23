// @vitest-environment jsdom
/** The old settings control only navigated to the portfolio. Its replacement
 * must open actual current settings, save through their governed path and keep
 * the user in the same project/workflow while metadata and activity refresh. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuthUser: () => actual.authService.getUser(), useAuth: () => ({ user: actual.authService.getUser() }) };
});
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: { id: 7 }, currentClientWorkspace: { id: '21', organizationId: '7' } }) }));

import { ProjectHome } from '../surfaces/ProjectHome';
import type { SurfaceViewProps } from '../surfaceViews';
import { authService } from '@/services/portal/authService';

const PROJECT_ID = '9a7f0b10-0000-4000-8000-0000000000aa';
const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;

let navigated: string[];
let savedDescription: string;

beforeEach(() => {
  authService.setToken(`e30.${btoa(JSON.stringify({ userId: 12, organizationId: 7 }))}.signature`, { id: '12', organizationId: '7', permissions: [] }, 'fixture-refresh', 3600);
  navigated = [];
  savedDescription = 'Phase 3 BLA';
  apiRequest.mockReset();
  apiRequest.mockImplementation((method: string, url: string, write?: { patch: { description: string } }) => {
    if (method === 'PATCH' && url === `/api/c2c/projects/${PROJECT_ID}/settings`) {
      savedDescription = write!.patch.description;
      return Promise.resolve(ok({ success: true, data: {
        programId: PROJECT_ID, projectId: 31, organizationId: 7, actorUserId: 12, clientWorkspaceId: 21,
        canChange: true, revision: `v1:${'b'.repeat(64)}`, description: savedDescription, priority: 'medium', targetSubmissionDate: null,
      }, meta: { auditTrail: { persisted: true, chained: true }, changedFields: ['description'] } }));
    }
    if (url === `/api/c2c/projects/${PROJECT_ID}/settings`) return Promise.resolve(ok({ success: true, data: {
      programId: PROJECT_ID, projectId: 31, organizationId: 7, actorUserId: 12, clientWorkspaceId: 21,
      canChange: true, revision: `v1:${'a'.repeat(64)}`, description: savedDescription, priority: 'medium', targetSubmissionDate: null,
    } }));
    if (url === `/api/c2c/projects/${PROJECT_ID}`) {
      return Promise.resolve(
        ok({ success: true, data: { id: PROJECT_ID, name: 'BX204', description: savedDescription, status: 'active' } }),
      );
    }
    return Promise.resolve(ok({ success: true, data: null }));
  });
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = {
    id: PROJECT_ID,
    title: 'BX204',
  };
});
afterEach(() => {
  cleanup();
  authService.endSession(null);
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

function mount() {
  const props = {
    surface: { id: 'project-home', label: 'Project home' },
    segment: 'biotech',
    onAsk: () => {},
    onNav: (id: string) => navigated.push(id),
  } as unknown as SurfaceViewProps;
  return render(<ProjectHome {...props} />);
}

describe('Project home — the "Project settings" control', () => {
  it('opens real settings within the current project instead of leaving for the portfolio', async () => {
    mount();
    await waitFor(() => expect(document.querySelector('.pj-title')).not.toBeNull());

    expect(apiRequest.mock.calls.some(([, path]) => path === `/api/c2c/projects/${PROJECT_ID}/settings`)).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Project settings' }));
    const description = await screen.findByRole('textbox', { name: 'Project description' });
    expect((description as HTMLTextAreaElement).value).toBe('Phase 3 BLA');
    expect(navigated).toEqual([]);
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/c2c/projects/${PROJECT_ID}/settings`, undefined,
      expect.objectContaining({ 'x-client-id': '21', 'x-organization-id': '7' }));
  });

  it('refreshes saved metadata and activity without resetting the open workflow stage', async () => {
    mount();
    const stages = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.pj-lc-stage'));
    await waitFor(() => expect(stages()).toHaveLength(5));
    fireEvent.click(stages().find(button => button.textContent?.includes('Review'))!);
    const reads = (path: string) => apiRequest.mock.calls.filter(([method, url]) => method === 'GET' && url === path).length;
    const metadataPath = `/api/c2c/projects/${PROJECT_ID}`;
    const activityPath = `${metadataPath}/activity`;
    const before = [reads(metadataPath), reads(activityPath)];
    fireEvent.click(screen.getByRole('button', { name: 'Project settings' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Project description' }), { target: { value: 'Updated sponsor project description' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review settings change' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('Captured verbatim in the audit log. Be specific.'), { target: { value: 'Sponsor requested scope clarification' } });
    fireEvent.change(within(dialog).getByPlaceholderText('yes'), { target: { value: 'yes' } });
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm and log' })); });
    await waitFor(() => expect([reads(metadataPath), reads(activityPath)]).toEqual(before.map(count => count + 1)));
    expect(document.querySelector('.pj-desc')?.textContent).toBe('Updated sponsor project description');
    expect(stages().find(button => button.textContent?.includes('Review'))?.getAttribute('data-status')).toBe('active');
    expect(navigated).toEqual([]);
  });

  it('leaves only the honest way out of the project workspace', async () => {
    mount();
    await waitFor(() => expect(document.querySelector('.pj-title')).not.toBeNull());

    // Every control that navigates to the all-projects list must SAY so. The
    // back control does; the ⋯ button did not.
    const leavers = Array.from(document.querySelectorAll('button')).filter((b) =>
      b.className.includes('pj-back') || b.className.includes('pj-icon'),
    );
    for (const b of leavers) {
      expect(b.textContent, `"${b.className}" leaves the project without saying so`)
        .toMatch(/All projects/i);
    }
  });
});
