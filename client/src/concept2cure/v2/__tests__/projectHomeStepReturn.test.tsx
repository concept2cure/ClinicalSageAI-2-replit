// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: { name: 'Test organization' } }) }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));

import { ProjectHome } from '../surfaces/ProjectHome';
import { TopBar } from '../Shell';
import { clearShellProject, publishShellProject, readShellProject } from '../shellProject';
import { clearNavParams, stashNavParamsForTarget } from '../navParams';
import { __resetSurfaceActionBus, applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const A = '5b2d7c11-2222-4333-8444-555566667777';
const B = '6b2d7c11-2222-4333-8444-555566667777';
const TEMPLATE = '00000000-0000-4000-8000-000000000001';
const DOCUMENT = '00000000-0000-4000-8000-000000000002';
const DOC = { id: DOCUMENT, title: 'Target Product Profile', template_id: TEMPLATE, client_program_id: A, program_id: A, status: 'draft' };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
let docs: unknown[] = [];
const active = () => document.querySelector('.pj-lc-stage[data-status="active"]')?.textContent?.trim();
const tab = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('.pj-lc-stage')).find(button => button.textContent?.trim() === name)!;
const props = { surface: { id: 'project-home', label: 'Project home' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' };

function ShellVisit() {
  const [surface, nav] = useState('project-home');
  return <><TopBar surface={{ id: surface, label: surface } as never} onPalette={() => {}} segment="biopharma" onSegment={() => {}} onNav={nav} />
    {surface === 'project-home' ? <ProjectHome {...props} onNav={nav} /> : <p data-testid="editor-visit">Document editor</p>}</>;
}
function setStage(stage: string) {
  const resolved = resolveSurfaceAction('project-home.set-stage', { stage });
  if (!resolved.ok) throw new Error(resolved.error);
  return applySurfaceAction(resolved.directive, vi.fn());
}

beforeEach(() => {
  docs = [];
  clearShellProject(); clearNavParams(); __resetSurfaceActionBus();
  publishShellProject({ id: A, title: 'Project A', code: 'A-101' });
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST' && url === '/api/authoring/docs') { docs = [DOC]; return ok({ success: true, document: DOC }); }
    if (url === '/api/authoring/ind-document-catalog') return ok({ success: true, data: {
      submissionType: 'IND', phases: [{ id: 'phase1', name: 'Planning', order: 1 }], sections: [], deliverables: [{
        id: 'profile:0', title: 'Target Product Profile', phaseId: 'phase1', phaseName: 'Planning', taskId: 'profile', taskName: 'Product profile', module: null,
        sectionCodes: [], artifactTypes: [], aiDraftable: true, template: { id: TEMPLATE, title: 'Target Product Profile', module: null, sectionCount: 1, kind: 'narrative', aiDraftable: true, authoringMode: 'ai_assisted', originalFormat: 'docx', limitations: [] },
      }],
    } });
    if (url.startsWith('/api/authoring/docs')) return ok({ documents: docs });
    if (url === `/api/c2c/projects/${A}` || url === `/api/c2c/projects/${B}`) return ok({ id: url.endsWith(A) ? A : B, name: 'Test project', program_type: 'IND', product_type: 'drug', primary_agency: 'FDA', status: 'active' });
    if (url.startsWith('/api/chat/threads')) return ok({ threads: [] });
    return ok({});
  });
});
afterEach(() => { cleanup(); clearShellProject(); clearNavParams(); __resetSurfaceActionBus(); });

describe('the project’s step survives leaving the page', () => {
  it('creates a document from Plan and comes back to Plan through the real top-bar chip', async () => {
    render(<ShellVisit />);
    await waitFor(() => expect(active()).toBe('Plan'));
    const create = await screen.findByRole('button', { name: 'Create from template' });
    await waitFor(() => expect(create.hasAttribute('disabled')).toBe(false));
    fireEvent.click(create);
    await screen.findByTestId('editor-visit');
    fireEvent.click(screen.getByRole('button', { name: /Open project\s*A-101/ }));
    await waitFor(() => expect(active()).toBe('Plan'));
    expect(await screen.findByRole('button', { name: /Open Target Product Profile/ })).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/authoring/docs', expect.objectContaining({ client_program_id: A, template_id: TEMPLATE }));
  });

  it('restores a remembered explicit step even when the document list is empty', async () => {
    publishShellProject({ id: A, step: 'respond' });
    render(<ProjectHome {...props} />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', expect.stringContaining('/api/authoring/docs')));
    await waitFor(() => expect(active()).toBe('Respond'));
  });

  it('resets a different project to its own default without a surface remount', async () => {
    docs = [DOC];
    const view = render(<ProjectHome {...props} />);
    await screen.findByTestId('pj-documents');
    fireEvent.click(tab('Submit'));
    docs = [];
    act(() => publishShellProject({ id: B, title: 'Project B' }));
    view.rerender(<ProjectHome {...props} />);
    await waitFor(() => expect(active()).toBe('Plan'));
    expect(readShellProject()?.step).toBe('plan');
  });

  it('honors the Tasks stage handoff above remembered state and a pending action', async () => {
    publishShellProject({ id: A, step: 'respond' });
    act(() => setStage('author'));
    stashNavParamsForTarget('project-home', { stage: 'evidence' });
    render(<ProjectHome {...props} />);
    await waitFor(() => expect(active()).toBe('Evidence'));
  });

  it('honors a pending step action above remembered state and the empty-list default', async () => {
    publishShellProject({ id: A, step: 'respond' });
    act(() => setStage('submit'));
    render(<ProjectHome {...props} />);
    await waitFor(() => expect(active()).toBe('Submit'));
    expect(readShellProject()?.step).toBe('submit');
  });

  it('falls back to Review for a bare workId, including an invalid stage', async () => {
    stashNavParamsForTarget('project-home', { workId: 'review:target', stage: 'invalid' });
    render(<ProjectHome {...props} />);
    await waitFor(() => expect(active()).toBe('Review'));
    expect(readShellProject()?.step).toBe('review');
  });
});
