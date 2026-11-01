/** @vitest-environment jsdom */
/**
 * A project opened by its link alone (a reload, a shared link, a bookmark) is
 * in the shell by id only, so the top bar's chip said "Open project" while
 * that project's own page was on screen (UI walk, 2026-10-31). Once Project
 * home has read the project, it names it in the shell, as Projects does when it
 * opens one. It never renames a project the shell already names.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
import { ProjectHome } from '../surfaces/ProjectHome';
import { readShellProject } from '../shellProject';

const PID = '24fd6124-6ff9-4ec8-8287-5aa23a49443b';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const props = () => ({
  surface: { id: 'project-home', label: 'Project' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});
const row = {
  id: PID, code: 'BX-204', name: 'BX-204 IND', program_type: 'IND', status: 'active', phase: 'planning',
  priority: 'medium', description: null, product_name: 'BX-204', indication: 'idiopathic pulmonary fibrosis',
  primary_agency: 'FDA', target_submission_date: null, readiness: 0, sponsor_name: null, application_number: null,
  product_type: 'drug',
};
function answer(project: Record<string, unknown>) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => ok(url === `/api/c2c/projects/${PID}` ? project : {}));
}
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
  sessionStorage.clear();
});

describe('a project opened by its link alone', () => {
  it('is named in the shell once its page has read it', async () => {
    (window as any).C2C_PROJECT = { id: PID };
    answer(row);
    render(<ProjectHome {...props()} />);
    await screen.findByRole('region', { name: /project identity/i });
    await waitFor(() => expect(readShellProject()).toMatchObject({ id: PID, title: 'BX-204 IND', code: 'BX-204' }));
  });

  it('keeps the name the shell already has', async () => {
    (window as any).C2C_PROJECT = { id: PID, title: 'Chosen in Projects', code: 'P-1' };
    answer(row);
    render(<ProjectHome {...props()} />);
    await screen.findByRole('region', { name: /project identity/i });
    await waitFor(() => expect(readShellProject()?.productType).toBe('drug'));
    expect(readShellProject()).toMatchObject({ title: 'Chosen in Projects', code: 'P-1' });
  });

  it('is not named from a read that answered for another project', async () => {
    (window as any).C2C_PROJECT = { id: PID };
    answer({ ...row, id: 'another-project', name: 'Another project', code: 'AP-1' });
    render(<ProjectHome {...props()} />);
    await screen.findByRole('region', { name: /project identity/i });
    await waitFor(() => expect(readShellProject()?.productType).toBe('drug'));
    expect(readShellProject()?.title).toBeUndefined();
    expect(readShellProject()?.code).toBeUndefined();
  });
});
