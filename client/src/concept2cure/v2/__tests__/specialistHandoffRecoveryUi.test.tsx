// @vitest-environment jsdom
/** Actual Reporting controls and canonical handoff; only HTTP is synthetic. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { ReportEngine } from '../surfaces/ReportEngine';
import { authService } from '@/services/portal/authService';
import { publishShellProject } from '../shellProject';
import { clearEditorTarget, consumeEditorTarget } from '../editorTarget';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({
  ...(await original<typeof import('@/lib/queryClient')>()), apiRequest,
}));
const PROGRAM = '0b9f6c2e-5d4a-4c3b-9a21-7e6f5d4c3b2a';
const DOC = 'saved-specialist-document';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const user = {
  id: '71', organizationId: '8', organizationName: null, email: 'synthetic@example.test',
  firstName: 'Synthetic', lastName: 'Reviewer', displayName: 'Synthetic reviewer',
  roles: ['author'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false,
};
const created = () => json(201, { success: true,
  document: { id: DOC, title: 'Saved analysis', module: 'M5', client_program_id: PROGRAM },
  governance: { bound: false, reason: 'No governed filing exists.' },
});
let documentReply: () => Response | Promise<Response>;
let sectionReply: () => Response | Promise<Response>;
let listReply: () => Response | Promise<Response>;

beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear(); clearEditorTarget();
  vi.stubGlobal('fetch', vi.fn(async () => json(200, { authenticated: true, user })));
  expect(await authService.adoptSession('synthetic-recovery-session')).toMatchObject({ id: user.id });
  publishShellProject({ id: PROGRAM });
  documentReply = created;
  sectionReply = () => json(403, { success: false, error: 'Text write refused' });
  listReply = () => json(200, { success: true, documents: [{ id: DOC, title: 'Saved analysis', program_id: PROGRAM }] });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path === '/api/authoring/docs') return documentReply();
    if (method === 'POST' && path === '/api/authoring/sections') return sectionReply();
    if (method === 'GET' && path.startsWith('/api/authoring/docs?')) return listReply();
    if (method === 'GET' && path === `/api/authoring/docs/${DOC}`) return json(200, {
      success: true, document: { id: DOC, title: 'Saved analysis', tenant_id: 8, status: 'draft' },
    });
    if (method === 'GET' && path === `/api/authoring/docs/${DOC}/sections`) return json(200, { success: true, sections: [] });
    if (path === '/api/analytics/analyze-protocol-text') return json(200, { success: true, data: {
      protocol_data: { title: 'Synthetic protocol', indication: 'Synthetic indication', phase: '2',
        sample_size: 240, duration_weeks: 24, primary_endpoint: 'Synthetic outcome', risk_factors: [] },
      similar_protocols: [],
    } });
    return json(200, { success: true, data: [] });
  });
});
afterEach(() => {
  cleanup(); clearEditorTarget(); delete window.C2C_PROJECT;
  localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals();
});
const writes = () => apiRequest.mock.calls.filter(([method, path]) => method === 'POST' && String(path).startsWith('/api/authoring/'));
async function reporting() {
  const surface = UI_SURFACES.find(item => item.id === 'report-engine');
  if (!surface) throw new Error('Reporting registry entry missing');
  const targets: ReturnType<typeof consumeEditorTarget>[] = [];
  const onNav = vi.fn(() => targets.push(consumeEditorTarget()));
  render(<ReportEngine surface={surface} onAsk={vi.fn()} onNav={onNav} segment="biopharma" />);
  fireEvent.change(screen.getByLabelText('Protocol synopsis'), { target: { value:
    'Title: Synthetic protocol\nPhase: 2\nSample size: 240\nDuration: 24 weeks\nPrimary endpoint: Synthetic outcome' } });
  fireEvent.click(screen.getByRole('button', { name: 'Analyze protocol' }));
  await screen.findByRole('button', { name: 'Open in document editor' });
  return { onNav, targets };
}
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

describe('specialist recovery stays beside the retained source', () => {
  it('retains an actionable unknown-outcome notice and blocks repeat creation', async () => {
    documentReply = () => Promise.reject(new Error('offline after request'));
    const { onNav } = await reporting();
    fireEvent.click(screen.getByRole('button', { name: 'Open in document editor' }));
    await waitFor(() => expect(writes()).toHaveLength(1)); await settle();
    expect(screen.queryByRole('button', { name: 'Check working documents' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open in document editor' })); await settle();
    expect(writes()).toHaveLength(1);
    expect(onNav).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Protocol synopsis')).not.toBeNull();
  });

  it('does not create a second document after its confirmed first document has no saved text', async () => {
    const { onNav } = await reporting();
    fireEvent.click(screen.getByRole('button', { name: 'Open in document editor' }));
    await waitFor(() => expect(writes()).toHaveLength(2)); await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Open in document editor' })); await settle();
    expect(writes().filter(([, path]) => path === '/api/authoring/docs')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Check document sections' })).not.toBeNull();
    expect(onNav).not.toHaveBeenCalled();
  });

  it('shows the checked inventory with uncertainty and only opens the list after another explicit action', async () => {
    documentReply = () => Promise.reject(new Error('lost document response'));
    const { onNav, targets } = await reporting();
    const source = document.querySelector('.bs-doc-render')?.textContent;
    expect(source).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open in document editor' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check working documents' }));
    await screen.findByRole('button', { name: 'Open working documents' });
    expect(screen.getByText(`Saved analysis · ${DOC}`)).not.toBeNull();
    expect(screen.getByText(/This list does not identify which request created a document/)).not.toBeNull();
    expect(document.querySelector('.bs-doc-render')?.textContent).toBe(source);
    expect(writes()).toHaveLength(1);
    expect(onNav).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open working documents' }));
    expect(onNav).toHaveBeenCalledWith('document-authoring');
    expect(targets).toEqual([null]);
  });

  it('keeps the check control and creation guard after a failed inventory read', async () => {
    documentReply = () => Promise.reject(new Error('lost document response'));
    listReply = () => json(503, { success: false, error: 'Temporarily unreadable' });
    const { onNav } = await reporting();
    fireEvent.click(screen.getByRole('button', { name: 'Open in document editor' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check working documents' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check working documents' }).getAttribute('disabled')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Open in document editor' })); await settle();
    expect(writes()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Open working documents' })).toBeNull();
    expect(onNav).not.toHaveBeenCalled();
  });

  it('checks without writing, continues only the text, then offers a separate exact document open', async () => {
    const { onNav, targets } = await reporting();
    const source = document.querySelector('.bs-doc-render')?.textContent;
    expect(source).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open in document editor' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check document sections' }));
    await screen.findByRole('button', { name: 'Continue saving text' });
    expect(writes()).toHaveLength(2);
    expect(document.querySelector('.bs-doc-render')?.textContent).toBe(source);
    expect(onNav).not.toHaveBeenCalled();
    sectionReply = () => json(201, { success: true,
      section: { id: 'saved-section', doc_id: DOC, code: 'recommendations', title: 'Saved analysis' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue saving text' }));
    await screen.findByRole('button', { name: 'Open saved document' });
    expect(writes().filter(([, path]) => path === '/api/authoring/docs')).toHaveLength(1);
    expect(writes().filter(([, path]) => path === '/api/authoring/sections')).toHaveLength(2);
    expect(onNav).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open saved document' }));
    expect(targets).toMatchObject([{ docId: DOC, programId: PROGRAM, sectionCode: 'recommendations' }]);
  });
});
