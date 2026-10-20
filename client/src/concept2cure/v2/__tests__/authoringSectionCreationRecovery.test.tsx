// @vitest-environment jsdom
/** Native section recovery uses actual backend tuples; only HTTP is synthetic. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthoringCreateExport } from '../surfaces/AuthoringCreateExport';
import { publishShellProject } from '../shellProject';
import { surfaceLeaveRefusal } from '../navParams';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';
import { ApiRequestError } from '@/lib/queryClient';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const actor = (id = 7) => ({ id: String(id), organizationId: '12', email: 'author@example.test', roles: ['admin'], permissions: ['governed:write'] });
const bearer = (id = 7) => `fixture.${btoa(JSON.stringify({ userId: id, organizationId: 12 }))}.synthetic`;
const headers = { Authorization: `Bearer ${bearer()}`, 'x-organization-id': '12' };
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const props = () => ({ docId: null as string | null, docTitle: 'Current document', module: 'M2', programId: A,
  fireToast: vi.fn(), onDocCreated: vi.fn(), onSectionCreated: vi.fn(), onCheckCreation: vi.fn(async () => true) });
const postCalls = () => apiRequest.mock.calls.filter(call => call[0] === 'POST');
const newButton = (_kind: string) => screen.getByRole('button', { name: 'New section' }) as HTMLButtonElement;
async function open(_kind: string) {
  fireEvent.click(newButton('section')); await screen.findByRole('dialog', { name: 'New section' });
}
function fill(_kind: string) {
  fireEvent.change(screen.getByRole('textbox', { name: /Section code/ }), { target: { value: '2.6.6' } });
  fireEvent.change(screen.getByRole('textbox', { name: /Section title/ }), { target: { value: 'Toxicology summary' } });
}
function submit(_kind: string) { fireEvent.click(screen.getByRole('button', { name: 'Create section' })); }
function wire(post: () => Promise<Response>, read?: (url: string) => Promise<Response>) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST') return post();
    if (url === '/api/authoring/templates') return response({ success: true, templates: [] });
    return read ? read(url) : response({ success: true, documents: [], sections: [] });
  });
}
beforeEach(() => {
  clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(bearer(), actor(), 'fixture-refresh', 3600);
  apiRequest.mockReset(); publishShellProject({ id: A });
});
afterEach(() => {
  cleanup(); authService.endSession(null); clearAuthToken(); vi.restoreAllMocks();
  delete window.C2C_PROJECT; localStorage.clear(); sessionStorage.clear();
});

describe('native section creation exact recovery tuple', () => {
  const documentId = '55555555-5555-4555-8555-555555555555';
  const sectionId = '66666666-6666-4666-8666-666666666666';
  const outcome = (organizationId = 12) => ({ success: false, ok: false,
    code: 'AUTHORING_SECTION_CREATE_COMMIT_UNCONFIRMED',
    error: { code: 'AUTHORING_SECTION_CREATE_COMMIT_UNCONFIRMED', message: 'Section creation outcome is unconfirmed.' },
    writeOutcome: 'unconfirmed', retryAllowed: false, recovery: { organizationId, documentId, sectionId } });
  const sectionProps = () => ({ ...props(), docId: documentId });
  it.each([false, undefined])('keeps an identified section held when the host acknowledgement is %s', async acknowledged => {
    const p = sectionProps();
    wire(async () => response(outcome(), 503), async url =>
      url.endsWith('/sections') ? response({ success: true, sections: [{ id: sectionId, doc_id: documentId, code: '2.6.6', content: '' }] })
      : url.includes('?') ? response({ success: true, documents: [{ id: documentId, title: 'Current parent', program_id: A }] })
      : response({ success: true, document: { id: documentId, client_program_id: A } }));
    render(<AuthoringCreateExport {...p} onCheckCreation={acknowledged === undefined ? undefined : () => false} />);
    await open('section'); fill('section'); submit('section'); await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Check document sections' }));
    await screen.findByText(/Creation is still unconfirmed/);
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/authoring/docs/${documentId}`, undefined, headers);
    expect(newButton('section').disabled).toBe(true); expect(postCalls()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Open identified section' })).toBeNull();
    expect(p.onSectionCreated).not.toHaveBeenCalled();
    expect(surfaceLeaveRefusal()).toMatch(/unconfirmed/i);
  });
  it('retains the actual section and parent IDs and opens only after an explicit exact current-project read', async () => {
    const p = sectionProps();
    wire(async () => { throw new ApiRequestError('Section creation outcome is unconfirmed.', 503, outcome()); }, async url =>
      url.endsWith('/sections') ? response({ success: true, sections: [{ id: sectionId, doc_id: documentId, code: '2.6.6', content: '' }] })
      : url.includes('?') ? response({ success: true, documents: [{ id: documentId, title: 'Current parent', program_id: A }] })
      : response({ success: true, document: { id: documentId, client_program_id: A } }));
    render(<AuthoringCreateExport {...p} />); await open('section'); fill('section'); submit('section');
    expect((await screen.findByRole('alert')).textContent).toContain(sectionId);
    expect(screen.getByRole('alert').textContent).toContain(documentId);
    expect(newButton('section').disabled).toBe(true); expect(p.onSectionCreated).not.toHaveBeenCalled();
    expect(surfaceLeaveRefusal()).toMatch(/unconfirmed/i);
    fireEvent.click(screen.getByRole('button', { name: 'Check document sections' }));
    const openIdentified = await screen.findByRole('button', { name: 'Open identified section' });
    expect(p.onSectionCreated).not.toHaveBeenCalled(); expect(newButton('section').disabled).toBe(true);
    expect(surfaceLeaveRefusal()).toBeNull();
    expect(postCalls()).toHaveLength(1);
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/authoring/docs?status=all&programId=${A}`, undefined, headers);
    fireEvent.click(openIdentified);
    expect(p.onSectionCreated).toHaveBeenCalledWith({ id: sectionId, code: '2.6.6' });
    expect(surfaceLeaveRefusal()).toBeNull();
    expect(newButton('section').disabled).toBe(true); expect(postCalls()).toHaveLength(1);
  });
  it.each(['empty', 'wrong section', 'foreign parent', 'wrong program'] as const)('a %s read cannot release the known section outcome', async kind => {
    wire(async () => response(outcome(), 503), async url => !url.endsWith('/sections') ? url.includes('?')
      ? response({ success: true, documents: [{ id: documentId, title: 'Current parent', program_id: A }] })
      : response({ success: true, document: { id: documentId, client_program_id: kind === 'wrong program' ? B : A } })
      : response({ success: true, sections: kind === 'empty' ? [] : [{
      id: kind === 'wrong section' ? '77777777-7777-4777-8777-777777777777' : sectionId,
      doc_id: kind === 'foreign parent' ? '88888888-8888-4888-8888-888888888888' : documentId, code: '2.6.6', content: '',
    }] }));
    const p = sectionProps(); render(<AuthoringCreateExport {...p} />); await open('section'); fill('section'); submit('section');
    await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button', { name: 'Check document sections' }));
    await screen.findByText(/Creation is still unconfirmed/);
    expect(newButton('section').disabled).toBe(true); expect(postCalls()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Open identified section' })).toBeNull();
    expect(p.onSectionCreated).not.toHaveBeenCalled();
    expect(surfaceLeaveRefusal()).toMatch(/unconfirmed/i);
  });
  it('holds a recognized outcome with a foreign recovery tuple through an empty read without exposing its IDs', async () => {
    wire(async () => response(outcome(99), 400));
    render(<AuthoringCreateExport {...sectionProps()} />); await open('section'); fill('section'); submit('section');
    const notice = await screen.findByRole('alert'); expect(notice.textContent).not.toContain(sectionId);
    expect(newButton('section').disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Check document sections' }));
    await screen.findByText(/Creation is still unconfirmed/);
    expect(newButton('section').disabled).toBe(true); expect(postCalls()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Open identified section' })).toBeNull();
    expect(surfaceLeaveRefusal()).toMatch(/unconfirmed/i);
  });
  it('does not open an earlier actor’s recovered section after a same-organization account switch', async () => {
    let resolveInventory!: (value: Response) => void;
    const inventory = new Promise<Response>(resolve => { resolveInventory = resolve; });
    const p = sectionProps();
    wire(async () => response(outcome(), 503), async url => url.endsWith('/sections')
      ? response({ success: true, sections: [{ id: sectionId, doc_id: documentId, code: '2.6.6' }] }) : inventory);
    render(<AuthoringCreateExport {...p} />); await open('section'); fill('section'); submit('section');
    await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button', { name: 'Check document sections' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', `/api/authoring/docs?status=all&programId=${A}`, undefined, headers));
    act(() => { authService.setToken(bearer(8), actor(8), 'fixture-refresh-8', 3600); });
    await act(async () => resolveInventory(response({ success: true, documents: [{ id: documentId, title: 'Parent', program_id: A }] })));
    expect(p.onSectionCreated).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Open identified section' })).toBeNull();
    expect(apiRequest.mock.calls.some(([method, path]) => method === 'GET' && path === `/api/authoring/docs/${documentId}`)).toBe(false);
    expect(postCalls()).toHaveLength(1);
  });
});
