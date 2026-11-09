/** @vitest-environment jsdom */
/**
 * A project opened by its link alone (a new tab, a reload, a shared link, a
 * bookmark) is in the shell by id only, so the top bar's chip said "Open
 * project" (or, since the top bar became a breadcrumb, no project at all),
 * first on the project's own page (UI walk, 2026-10-31) and then on any other
 * screen a link opened, such as its agency inbox (demo walk, 2026-11-01,
 * defect 7). The chip reads the project and names it in the shell
 * on whichever screen is open, as Projects does when it opens one. It never
 * renames a project the shell already names, and a read that answered for
 * another project names nothing.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ currentOrganization: { name: 'Concept2Cure Therapeutics' } }),
}));
vi.mock('@/services/portal/authService', async original => ({
  ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null, logout: vi.fn() }),
}));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
import { TopBar } from '../Shell';
import { readShellProject } from '../shellProject';

const PID = '24fd6124-6ff9-4ec8-8287-5aa23a49443b';
const COMMUNICATION = { id: 'communication-center', label: 'Communication' } as never;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const row = { id: PID, code: 'BX-204', name: 'BX-204 IND', program_type: 'IND', status: 'active' };
const projectReads = () => apiRequest.mock.calls.filter((c) => c[1] === `/api/c2c/projects/${PID}`);

function answer(project: Record<string, unknown>) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => ok(url === `/api/c2c/projects/${PID}` ? project : {}));
}
const renderBar = () => render(<TopBar surface={COMMUNICATION} onPalette={() => {}} segment="biopharma" onSegment={() => {}} onNav={vi.fn()} />);
const crumb = () => document.querySelector('.crumb-proj .lbl')?.textContent ?? null;
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
  sessionStorage.clear();
});

describe('a project opened by its link alone', () => {
  it('is named in the top bar on the screen the link opened, once the project is read', async () => {
    (window as any).C2C_PROJECT = { id: PID };
    answer(row);
    renderBar();
    await waitFor(() => expect(readShellProject()).toMatchObject({ id: PID, title: 'BX-204 IND', code: 'BX-204' }));
    await waitFor(() => expect(crumb()).toBe('BX-204'));
  });

  it('keeps the name the shell already has, and reads nothing for it', async () => {
    (window as any).C2C_PROJECT = { id: PID, title: 'Chosen in Projects', code: 'P-1' };
    answer(row);
    renderBar();
    expect(crumb()).toBe('P-1');
    expect(projectReads()).toHaveLength(0);
    expect(readShellProject()).toMatchObject({ title: 'Chosen in Projects', code: 'P-1' });
  });

  it('is not named from a read that answered for another project', async () => {
    (window as any).C2C_PROJECT = { id: PID };
    answer({ ...row, id: 'another-project', name: 'Another project', code: 'AP-1' });
    renderBar();
    await waitFor(() => expect(projectReads().length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 20));
    expect(readShellProject()?.title).toBeUndefined();
    expect(readShellProject()?.code).toBeUndefined();
    // No name to show, so the bar shows no project crumb rather than invent one.
    expect(crumb()).toBeNull();
  });
});
