// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: request }));
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
import { ProjectHome } from '../surfaces/ProjectHome';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const project = { id: A, name: 'Client assay', program_type: '510K', product_type: 'ivd', regulatory_path: '510k', primary_agency: 'FDA', device_flags: [], product_name: 'Client assay', status: 'active' };
const props = () => ({ surface: { id: 'project-home' } as never, segment: 'medtech', onNav: vi.fn(), onAsk: vi.fn() });
beforeEach(() => {
  window.C2C_PROJECT = { id: A, title: 'Client assay' };
  request.mockReset();
  request.mockImplementation(async (_method: string, path: string) => path === `/api/c2c/projects/${A}` ? ok(project) : ok({ data: [] }));
});
afterEach(() => { cleanup(); delete window.C2C_PROJECT; sessionStorage.clear(); });

describe('MDX starts inside the verified client project', () => {
  it('reaches the workflow compiler from Project home and keeps work in the project', async () => {
    const p = props(); render(<ProjectHome {...p} />);
    /* The workflow is the device project's Plan (CLIENT_JOURNEY_2026-10-25.md, pass 3). */
    fireEvent.click(await screen.findByRole('button', { name: 'Plan' }));
    const workflow = await screen.findByTestId('pj-mdx-workflow');
    expect(workflow.textContent).toContain('510(k) · Diagnostic project workflow');
    const analytical = workflow.querySelector('[data-work-package="analytical-performance"]')! as HTMLElement;
    fireEvent.click(within(analytical).getByRole('button', { name: 'Open project evidence' }));
    expect(document.querySelector('.pj-lc-stage[data-status="active"]')?.textContent).toContain('Evidence');
    expect(p.onNav).not.toHaveBeenCalled();
    expect(window.C2C_PROJECT?.id).toBe(A);
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    const writing = (await screen.findByTestId('pj-mdx-workflow')).querySelector('[data-work-package="medical-writing"]')! as HTMLElement;
    fireEvent.click(within(writing).getByRole('button', { name: 'Open project documents' }));
    expect(document.querySelector('.pj-lc-stage[data-status="active"]')?.textContent).toContain('Author');
    expect(document.querySelector('.pj-stageband-blurb')?.textContent).not.toContain('eCTD');
  });

  it('retires the previous project workflow while the next project record is loading', async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>(done => { resolve = done; });
    request.mockImplementation(async (_method: string, path: string) => path === `/api/c2c/projects/${A}` ? ok(project)
      : path === `/api/c2c/projects/${B}` ? pending : ok({ data: [] }));
    const p = props(); const view = render(<ProjectHome {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plan' }));
    await screen.findByTestId('pj-mdx-workflow');
    window.C2C_PROJECT = { id: B, title: 'Client medicine' };
    view.rerender(<ProjectHome {...p} />);
    expect(screen.queryByTestId('pj-mdx-workflow')).toBeNull();
    await act(async () => resolve(ok({ ...project, id: B, product_type: 'drug', program_type: 'IND', regulatory_path: null })));
    expect(screen.queryByTestId('pj-mdx-workflow')).toBeNull();
  });
});
