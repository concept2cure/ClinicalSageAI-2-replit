// @vitest-environment jsdom
/** Existing New document drawer and native form controls; transport is synthetic. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';
import { AuthoringCreateExport } from '../surfaces/AuthoringCreateExport';
import { publishShellProject } from '../shellProject';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({
  ...(await original<typeof import('@/lib/queryClient')>()), apiRequest,
}));

const PROJECT = '11111111-1111-4111-8111-111111111111';
const ACTOR = { id: '7', organizationId: '12', email: 'template-author@example.test', roles: ['admin'], permissions: ['governed:write'] };
const BEARER = `fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`;
const ACTOR_HEADERS = { Authorization: `Bearer ${BEARER}`, 'x-organization-id': '12' };
const TEMPLATES = [
  { id: 41, name: 'Protocol scaffold', title: 'Dose protocol', template_name: 'Clinical master', module: 'M5',
    description: 'Dose escalation narrative', template_type: 'Clinical protocol', category: 'Sponsor standards', regions: ['FDA'] },
  { id: 'regional-template', title: 'Regional submission', module: null, description: 'Quality package',
    template_type: 'ctis-form', category: 'Regulatory reference', regions: ['EU'], entryId: 'registry:eu-cta',
    filingContext: { registryId: 'eu-cta', region: 'EU', agency: 'EMA' }, families: ['ctis'], kind: 'preparation',
    authoringMode: 'manual', originalFormat: 'eCTD', limitations: ['Retain signed originals'] },
  { id: 43, name: 'Nonclinical overview', module: 'M2', description: 'Animal findings' },
];
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
function props() {
  return { docId: null, docTitle: null, module: 'M2', programId: PROJECT,
    fireToast: vi.fn(), onDocCreated: vi.fn(), onSectionCreated: vi.fn() };
}
function wire(catalog: unknown = { templates: TEMPLATES, globalCatalog: 'ok' }) {
  apiRequest.mockImplementation(async (method: string, _url: string, body?: Record<string, unknown>) => method === 'GET'
    ? response(catalog)
    : response({ success: true, document: { id: 'created-document', ...body }, sections_seeded: 3 }, 201));
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: /New document/ }));
  return screen.findByRole('dialog', { name: 'New document' });
}
function picker() { return screen.getByRole('combobox', { name: 'Start from' }) as HTMLSelectElement; }
function search(query: string) { fireEvent.change(screen.getByRole('searchbox', { name: 'Search templates' }), { target: { value: query } }); }
function listedTemplates() {
  return within(picker()).getAllByRole('option').filter(option => option.getAttribute('value') && option.getAttribute('value') !== '(blank document)');
}

beforeEach(() => {
  clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(BEARER, ACTOR, 'fixture-refresh', 3600);
  apiRequest.mockReset(); publishShellProject({ id: PROJECT, title: 'Selected project' }); wire();
});
afterEach(() => {
  cleanup(); authService.endSession(null); clearAuthToken();
  publishShellProject({ id: '' }); delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  localStorage.clear(); sessionStorage.clear();
});

describe('template search in the existing New document picker', () => {
  it('browses the returned catalog with a count and no additional reads', async () => {
    render(<AuthoringCreateExport {...props()} />); await open();
    await screen.findByText('3 of 3 templates');
    expect(listedTemplates().map(option => option.textContent)).toEqual(['Protocol scaffold', 'Regional submission', 'Nonclinical overview']);
    expect(picker().value).toBe('(blank document)');
    expect(apiRequest.mock.calls).toEqual([['GET', '/api/authoring/templates']]);
  });

  it.each([
    ['  pRoToCoL  ', 'Protocol scaffold'], ['dose protocol', 'Protocol scaffold'], ['dose escalation', 'Protocol scaffold'], ['clinical master', 'Protocol scaffold'],
    ['Sponsor standards', 'Protocol scaffold'], ['FDA', 'Protocol scaffold'], ['M5', 'Protocol scaffold'],
    ['ctis-form', 'Regional submission'], ['registry:eu-cta', 'Regional submission'], ['EMA', 'Regional submission'],
    ['signed originals', 'Regional submission'], ['manual', 'Regional submission'], ['eCTD', 'Regional submission'],
  ])('finds %s in returned titles and metadata', async (query, expected) => {
    render(<AuthoringCreateExport {...props()} />); await open(); await screen.findByText('3 of 3 templates');
    search(query);
    expect(listedTemplates().map(option => option.textContent)).toEqual([expected]);
    expect(screen.getByText('1 of 3 templates')).toBeTruthy();
    expect(apiRequest.mock.calls).toEqual([['GET', '/api/authoring/templates']]);
  });

  it('clears a no-match query, restores browsing and keeps the typed document title', async () => {
    render(<AuthoringCreateExport {...props()} />); await open(); await screen.findByText('3 of 3 templates');
    fireEvent.change(screen.getByRole('textbox', { name: 'Document title' }), { target: { value: 'My draft' } });
    search('not-in-the-catalog');
    expect(screen.getByText(/No templates match/).textContent).toContain('not-in-the-catalog');
    expect(screen.getByText('0 of 3 templates')).toBeTruthy();
    expect(listedTemplates()).toHaveLength(0);
    expect(within(picker()).getByRole('option', { name: '(blank document)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear template search' }));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('3 of 3 templates')).toBeTruthy();
    expect(listedTemplates()).toHaveLength(3);
    expect((screen.getByRole('textbox', { name: 'Document title' }) as HTMLInputElement).value).toBe('My draft');
  });

  it('keeps a chosen template when a later search excludes it and submits its original ID, module and selected project', async () => {
    const p = props(); render(<AuthoringCreateExport {...p} />); await open(); await screen.findByText('3 of 3 templates');
    fireEvent.change(screen.getByRole('textbox', { name: 'Document title' }), { target: { value: 'My protocol' } });
    search('FDA'); fireEvent.change(picker(), { target: { value: '41' } }); search('animal');
    expect(picker().value).toBe('41');
    expect(within(picker()).getByRole('option', { name: 'Protocol scaffold' }).closest('optgroup')?.label).toBe('Selected template');
    expect(screen.getByText(/Current selection is kept/)).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'CTD module' }) as HTMLInputElement).value).toBe('M5');
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/authoring/docs', {
      title: 'My protocol', module: 'M5', template_id: 41, client_program_id: PROJECT,
    }, ACTOR_HEADERS));
    await waitFor(() => expect(p.onDocCreated).toHaveBeenCalledWith({ id: 'created-document', title: 'My protocol' }));
  });

  it('preserves preparation placement and guidance when selected through metadata search', async () => {
    render(<AuthoringCreateExport {...props()} />); await open(); await screen.findByText('3 of 3 templates');
    search('EMA'); fireEvent.change(picker(), { target: { value: 'regional-template' } });
    expect((screen.getByRole('textbox', { name: 'CTD module' }) as HTMLInputElement).value).toBe('No CTD placement (preparation)');
    expect(screen.getByText(/Creates an empty working copy/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Document title' }), { target: { value: 'Preparation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/authoring/docs', {
      title: 'Preparation', module: null, template_id: 'regional-template', client_program_id: PROJECT,
    }, ACTOR_HEADERS));
  });

  it('permits keyboard typing, clearing, native selection, submission focus and dialog close', async () => {
    const user = userEvent.setup(); render(<AuthoringCreateExport {...props()} />);
    const opener = screen.getByRole('button', { name: /New document/ }); opener.focus(); await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog'); await screen.findByText('3 of 3 templates');
    expect(document.activeElement).toBe(dialog);
    const input = screen.getByRole('searchbox', { name: 'Search templates' }); input.focus(); await user.keyboard('animal');
    await user.tab(); expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Clear template search' }));
    await user.keyboard(' '); expect(document.activeElement).toBe(input); expect(listedTemplates()).toHaveLength(3);
    await user.tab(); expect(document.activeElement).toBe(picker());
    await user.selectOptions(picker(), '43'); expect(picker().value).toBe('43');
    screen.getByRole('button', { name: 'Create document' }).focus(); await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(opener);
  });

  it('resets the query and selection when the New document drawer is reopened', async () => {
    render(<AuthoringCreateExport {...props()} />); await open(); await screen.findByText('3 of 3 templates');
    search('FDA'); fireEvent.change(picker(), { target: { value: '41' } }); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await open(); expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('3 of 3 templates')).toBeTruthy(); expect(picker().value).toBe('(blank document)');
  });
});

describe('catalog state stays truthful in the picker', () => {
  it('distinguishes a pending read from an empty catalog while allowing blank creation', async () => {
    let finish!: (value: Response) => void;
    apiRequest.mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
    render(<AuthoringCreateExport {...props()} />); await open();
    expect(screen.getByText(/Loading templates/)).toBeTruthy(); expect(screen.queryByText(/No templates are available/)).toBeNull();
    expect(picker().value).toBe('(blank document)');
    await act(async () => finish(response({ templates: [] })));
    expect(screen.getByText(/No templates are available/)).toBeTruthy(); expect(screen.queryByText(/Loading templates/)).toBeNull();
  });

  it('explains an empty catalog and leaves a blank document unplaced until a module is chosen', async () => {
    wire({ templates: [] }); render(<AuthoringCreateExport {...props()} />); await open();
    expect(await screen.findByText(/No templates are available/)).toBeTruthy(); expect(screen.queryByText(/No templates match/)).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Document title' }), { target: { value: 'Blank draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/authoring/docs', {
      title: 'Blank draft', module: null, client_program_id: PROJECT,
    }, ACTOR_HEADERS));
  });

  it.each(['http', 'network', 'malformed'])('keeps a %s failure separate from an empty list', async failure => {
    apiRequest.mockImplementation(async () => {
      if (failure === 'network') throw new TypeError('Failed to fetch');
      return failure === 'http' ? response({ message: 'Unavailable' }, 503) : response({ templates: null });
    });
    render(<AuthoringCreateExport {...props()} />); await open();
    expect((await screen.findByRole('alert')).textContent).toMatch(/template list didn’t load/i);
    expect(screen.queryByText(/No templates are available|No templates match/)).toBeNull();
    expect(picker().value).toBe('(blank document)');
  });

  it('counts only loaded templates and retains the partial shared-catalog warning during search', async () => {
    wire({ templates: TEMPLATES, globalCatalog: 'unavailable' }); render(<AuthoringCreateExport {...props()} />); await open();
    await screen.findByText('3 of 3 loaded templates'); search('animal');
    expect(screen.getByText('1 of 3 loaded templates')).toBeTruthy();
    expect(screen.getByText(/The shared reference store did not load/)).toBeTruthy();
  });
});


describe('filing guidance without hiding the global template library', () => {
  const context = { projectId: PROJECT, registryId: 'US_BLA' };
  const catalog = [
    { id: 'bla-start', name: 'BLA preparation', module: null, filingContext: { registryId: 'US_BLA', region: 'US', agency: 'FDA' } },
    { id: 'nda-start', name: 'NDA preparation', module: null, filingContext: { registryId: 'US_NDA', region: 'US', agency: 'FDA' } },
    { id: 'csr-start', name: 'Shared CSR', module: null, filingContext: { registryId: null, region: 'GLOBAL', agency: 'ICH' } },
  ];
  it('promotes the exact filing and shared components without choosing the whole filing automatically', async () => {
    wire({ templates: catalog, globalCatalog: 'ok' });
    render(<AuthoringCreateExport {...props()} filingContext={context} />); await open(); await screen.findByText('3 of 3 templates');
    const recommended = within(picker()).getByRole('group', { name: 'For this filing and shared documents' });
    expect(within(recommended).getAllByRole('option').map(option => option.textContent)).toEqual(['BLA preparation', 'Shared CSR']);
    expect(within(picker()).getByRole('option', { name: 'NDA preparation' })).toBeTruthy();
    expect(picker().value).toBe('(blank document)');
  });
  it('rejects a template choice retained from an earlier filing context before sending creation', async () => {
    wire({ templates: catalog, globalCatalog: 'ok' }); const p = props();
    const view = render(<AuthoringCreateExport {...p} filingContext={context} />); await open(); await screen.findByText('3 of 3 templates');
    fireEvent.change(screen.getByRole('textbox', { name: 'Document title' }), { target: { value: 'My report' } });
    fireEvent.change(picker(), { target: { value: 'bla-start' } });
    view.rerender(<AuthoringCreateExport {...p} filingContext={{ projectId: PROJECT, registryId: 'US_NDA' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    expect(apiRequest.mock.calls.filter(call => call[0] === 'POST')).toHaveLength(0);
    expect(screen.getByText(/project or filing changed/i)).toBeTruthy();
  });
  it('does not infer a CTD placement for a new blank document', async () => {
    wire({ templates: [], globalCatalog: 'ok' }); render(<AuthoringCreateExport {...props()} filingContext={context} />); await open();
    fireEvent.change(screen.getByRole('textbox', { name: 'Document title' }), { target: { value: 'Working response' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/authoring/docs',
      { title: 'Working response', module: null, client_program_id: PROJECT }, ACTOR_HEADERS));
  });

  it.each(['filing round trip', 'project round trip', 'batched project round trip', 'account replacement', 'same-account session replacement'])('requires explicit reopen after %s', async change => {
    wire({ templates: catalog, globalCatalog: 'ok' }); const p = props();
    const view = render(<AuthoringCreateExport {...p} filingContext={context} />); await open(); await screen.findByText('3 of 3 templates');
    fireEvent.change(screen.getByRole('textbox', { name: 'Document title' }), { target: { value: 'Earlier form values' } });
    fireEvent.change(picker(), { target: { value: 'bla-start' } });
    if (change === 'filing round trip') {
      view.rerender(<AuthoringCreateExport {...p} filingContext={{ ...context, registryId: 'US_NDA' }} />);
      view.rerender(<AuthoringCreateExport {...p} filingContext={context} />);
    } else if (change === 'batched project round trip') {
      act(() => { publishShellProject({ id: '22222222-2222-4222-8222-222222222222' }); publishShellProject({ id: PROJECT }); });
    } else if (change === 'project round trip') {
      act(() => publishShellProject({ id: '22222222-2222-4222-8222-222222222222' }));
      act(() => publishShellProject({ id: PROJECT }));
    } else {
      const id = change === 'account replacement' ? '8' : '7';
      act(() => authService.setToken(`fixture.${btoa(JSON.stringify({ userId: Number(id), organizationId: 12, visit: 'replacement' }))}.synthetic`,
        { ...ACTOR, id }, 'fixture-new-session', 3600));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    expect(apiRequest.mock.calls.filter(call => call[0] === 'POST')).toHaveLength(0);
    expect(screen.getByText(/Close this form and open New document again/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await open();
    expect((screen.getByRole('textbox', { name: 'Document title' }) as HTMLInputElement).value).toBe('');
  });

  it('reopens with a fresh account catalog before creating a document under that account', async () => {
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>(resolve => { finish = resolve; });
    const initial = apiRequest.getMockImplementation()!; let replacement = false;
    apiRequest.mockImplementation((method, url, body, headers) => replacement && method === 'GET' ? pending : initial(method, url, body, headers));
    const p = props(); render(<AuthoringCreateExport {...p} filingContext={context} />); await open(); await screen.findByText('3 of 3 templates');
    replacement = true;
    const token = `fixture.${btoa(JSON.stringify({ userId: 8, organizationId: 12 }))}.synthetic`;
    act(() => authService.setToken(token, { ...ACTOR, id: '8' }, 'fixture-new-account', 3600));
    expect(screen.queryByRole('option', { name: 'Protocol scaffold' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); await open();
    expect(screen.getByText(/Loading templates/)).toBeTruthy();
    await act(async () => finish(response({ templates: [{ id: 'current-template', name: 'Current account outline', module: null }] })));
    fireEvent.change(picker(), { target: { value: 'current-template' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Document title' }), { target: { value: 'Current account draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', '/api/authoring/docs',
      { title: 'Current account draft', module: null, template_id: 'current-template', client_program_id: PROJECT },
      { Authorization: `Bearer ${token}`, 'x-organization-id': '12' }));
  });
});
