// @vitest-environment jsdom
/** The backend's exact creation identity still needs a verified current host. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';
import { ApiRequestError } from '@/lib/queryClient';
import { AuthoringCreateExport } from '../surfaces/AuthoringCreateExport';
import { publishShellProject } from '../shellProject';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
const A = '11111111-1111-4111-8111-111111111111';
const ACTOR = { id: '7', organizationId: '12', email: 'author@example.test', roles: ['admin'], permissions: ['governed:write'] };
const BEARER = `fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`;
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const props = () => ({ docId: 'D1', docTitle: 'Saved overview', docStatus: 'DRAFT', module: 'M2', programId: A,
  fireToast: vi.fn(), onDocCreated: vi.fn(), onSectionCreated: vi.fn(), onCheckCreation: vi.fn(async () => true) });
const postCalls = () => apiRequest.mock.calls.filter(([method]) => method === 'POST');
function wire(post: () => Promise<Response>, read?: (url: string) => Promise<Response>) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST') return post();
    if (url === '/api/authoring/templates') return response({ success: true, templates: [] });
    return read ? read(url) : response({ success: true, documents: [] });
  });
}
const open = async (_kind: 'document') => {
  fireEvent.click(screen.getByRole('button', { name: /New document/ }));
  await screen.findByRole('dialog', { name: 'New document' });
};
const fill = (_kind: 'document') => fireEvent.change(screen.getByRole('textbox', { name: /Document title/ }), { target: { value: 'Identified document' } });
const submit = (_kind: 'document') => fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
const newButton = (_kind: 'document') => screen.getByRole('button', { name: /New document/ }) as HTMLButtonElement;
beforeEach(() => {
  clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(BEARER, ACTOR, 'fixture-refresh', 3600);
  apiRequest.mockReset(); publishShellProject({ id: A });
});
afterEach(() => {
  cleanup(); authService.endSession(null); clearAuthToken(); vi.restoreAllMocks();
  delete window.C2C_PROJECT; localStorage.clear(); sessionStorage.clear();
});

describe('native creation recovery from the actual backend identity contract', () => {
  const id = '33333333-3333-4333-8333-333333333333';
  it.each([false, undefined])('keeps an identified creation unresolved when its actual host acknowledgement is %s', async acknowledged => {
    const p = props();
    wire(async () => response({ success: false, ok: false, retryAllowed: false, creationOutcome: 'unconfirmed',
      code: 'AUTHORING_CREATE_COMMIT_UNCONFIRMED', recovery: { documentId: id, organizationId: 12, programId: A } }, 503), async url =>
      url === `/api/authoring/docs/${id}` ? response({ success: true, document: { id, title: 'Exact identified document', client_program_id: A } })
        : response({ success: true, documents: [{ id, title: 'Exact identified document', program_id: A }] }));
    render(<AuthoringCreateExport {...p} onCheckCreation={acknowledged === undefined ? undefined : () => false} />);
    await open('document'); fill('document'); submit('document'); await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Check working documents' }));
    await screen.findByText(/Creation is still unconfirmed/);
    expect(screen.queryByRole('button', { name: 'Open identified document' })).toBeNull();
    expect(newButton('document').disabled).toBe(true); expect(postCalls()).toHaveLength(1);
    expect(p.onDocCreated).not.toHaveBeenCalled();
  });
  it.each(['unconfirmed', 'committed'] as const)('holds %s creation and opens only after an explicit exact scoped read', async creationOutcome => {
    const p = props();
    const payload = { success: false, ok: false, retryAllowed: false, creationOutcome,
      code: creationOutcome === 'unconfirmed' ? 'AUTHORING_CREATE_COMMIT_UNCONFIRMED' : 'AUTHORING_CREATE_HANDOFF_UNAVAILABLE',
      recovery: { documentId: id, organizationId: 12, programId: A } };
    wire(async () => { throw new ApiRequestError('creation outcome unavailable', 503, payload); }, async url =>
      url === `/api/authoring/docs/${id}` ? response({ success: true, document: { id, title: 'Existing exact document', client_program_id: A } })
      : response({ success: true, documents: [{ id, title: 'Existing exact document', program_id: A }] }));
    render(<AuthoringCreateExport {...p} />); await open('document'); fill('document'); submit('document');
    expect((await screen.findByRole('alert')).textContent).toContain(id);
    expect(newButton('document').disabled).toBe(true); expect(p.onDocCreated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check working documents' }));
    const openIdentified = await screen.findByRole('button', { name: 'Open identified document' });
    expect(newButton('document').disabled).toBe(true); expect(p.onDocCreated).not.toHaveBeenCalled();
    expect(postCalls()).toHaveLength(1);
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/authoring/docs/${id}`, undefined,
      { Authorization: `Bearer ${BEARER}`, 'x-organization-id': '12' });
    fireEvent.click(openIdentified);
    expect(p.onDocCreated).toHaveBeenCalledWith({ id, title: 'Existing exact document' });
  });
  it('a readable but empty inventory cannot release an identified unconfirmed creation', async () => {
    wire(async () => response({ success: false, ok: false, retryAllowed: false, creationOutcome: 'unconfirmed',
      code: 'AUTHORING_CREATE_COMMIT_UNCONFIRMED', recovery: { documentId: id, organizationId: 12, programId: A } }, 503));
    render(<AuthoringCreateExport {...props()} />); await open('document'); fill('document'); submit('document');
    await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button', { name: 'Check working documents' }));
    await screen.findByText(/Creation is still unconfirmed/);
    expect(newButton('document').disabled).toBe(true); expect(postCalls()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Open identified document' })).toBeNull();
  });
});
