// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { IndDocumentLibrary } from '../IndDocumentLibrary';
import { AuthoringCreateExport } from '../../surfaces/AuthoringCreateExport';
import { publishShellProject } from '../../shellProject';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TEMPLATE = '33333333-3333-4333-8333-333333333333';
const SECOND_TEMPLATE = '44444444-4444-4444-8444-444444444444';
const DOCUMENT = '55555555-5555-4555-8555-555555555555';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const template = { id: TEMPLATE, title: 'Repeat-Dose Toxicity preparation worksheet', module: 'M4', sectionCount: 8,
  kind: 'preparation', aiDraftable: false, authoringMode: 'data_import', originalFormat: 'pdf',
  limitations: ['The signed study report remains the original. Do not invent study findings or GLP claims.'] };
const catalogue = { phases: [], deliverables: [], sections: [
  { id: 'section:m4.2.3.2', code: 'm4.2.3.2', title: 'Repeat-Dose Toxicity', module: 'M4', phaseId: null, description: '', aiDraftable: false, template },
  { id: 'section:m5.3.5.1', code: 'm5.3.5.1', title: 'Controlled Study Reports', module: 'M5', phaseId: null, description: '', aiDraftable: true },
] };
const receipt = (extra: Record<string, unknown> = {}) => ({ success: true,
  document: { id: DOCUMENT, title: template.title, module: 'M4', template_id: TEMPLATE, client_program_id: PROGRAM, ...extra } });
const posts = () => apiRequest.mock.calls.filter(([method]) => method === 'POST');
let priorProject: typeof window.C2C_PROJECT;

function reads(documents: Array<Record<string, unknown>> = [], create: () => Promise<unknown> = async () => ok(receipt())) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST') return create();
    if (url.includes('ind-document-catalog')) return ok({ success: true, data: catalogue });
    if (url === '/api/authoring/templates') return ok({ templates: [
      { id: TEMPLATE, name: 'Repeated template name' }, { id: SECOND_TEMPLATE, name: 'Repeated template name' },
    ] });
    return ok({ documents });
  });
}

async function showType() {
  fireEvent.click(screen.getByRole('button', { name: 'CTD sections' }));
  fireEvent.click(await screen.findByText('m4.2.3.2 · Repeat-Dose Toxicity'));
  return screen.findByRole('button', { name: 'Create from template' });
}

beforeEach(() => {
  priorProject = window.C2C_PROJECT;
  publishShellProject({ id: PROGRAM, title: 'IND project' });
  apiRequest.mockReset();
  reads();
});
afterEach(() => {
  cleanup();
  window.C2C_PROJECT = priorProject;
  sessionStorage.removeItem('c2c.shell-project');
});

describe('IND template loading uses the existing scoped document path', () => {
  it('filters Modules 1–5 and displays the actual preparation limits', async () => {
    render(<IndDocumentLibrary programId={PROGRAM} />);
    await showType();
    expect(screen.getByText(template.limitations[0])).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Module'), { target: { value: 'M4' } });
    expect(screen.queryByText('m5.3.5.1 · Controlled Study Reports')).toBeNull();
    expect(screen.getByRole('option', { name: 'M1' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'M5' })).toBeTruthy();
  });

  it('posts exact template/project identity and retains the created ID if the host keeps its leave guard open', async () => {
    const onOpenDocument = vi.fn();
    render(<IndDocumentLibrary programId={PROGRAM} onOpenDocument={onOpenDocument} />);
    fireEvent.click(await showType());
    await waitFor(() => expect(onOpenDocument).toHaveBeenCalledWith(DOCUMENT));
    expect(posts()).toHaveLength(1);
    expect(posts()[0][2]).toEqual({ title: template.title, module: 'M4', template_id: TEMPLATE, client_program_id: PROGRAM });
    fireEvent.click(screen.getByRole('button', { name: 'Open working copy' }));
    expect(onOpenDocument).toHaveBeenCalledTimes(2);
    expect(posts()).toHaveLength(1);
  });

  it('gives AnA the exact loadable template identity and asks for every source-requirement page', async () => {
    const onAsk = vi.fn();
    render(<IndDocumentLibrary programId={PROGRAM} onAsk={onAsk} />);
    await showType();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare with AnA' }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    const message = onAsk.mock.calls[0][0] as string;
    expect(message).toContain(TEMPLATE);
    expect(message).toContain('get_document_template');
    expect(message).toMatch(/every page/);
    expect(message).toMatch(/do not invent an official form or dataset/);
    expect(posts()).toHaveLength(0);
  });

  it('keeps a renamed working document reachable by its saved template ID', async () => {
    const onOpenDocument = vi.fn();
    reads([{ id: DOCUMENT, title: 'Study Tox-07 working draft', status: 'DRAFT', template_id: TEMPLATE, client_program_id: PROGRAM }]);
    render(<IndDocumentLibrary programId={PROGRAM} onOpenDocument={onOpenDocument} />);
    await showType();
    fireEvent.click(await screen.findByRole('button', { name: 'Open Study Tox-07 working draft · Draft' }));
    expect(onOpenDocument).toHaveBeenCalledWith(DOCUMENT);
    expect(posts()).toHaveLength(0);
  });

  it('prevents duplicate creates while the exact request is pending', async () => {
    let finish!: (value: unknown) => void;
    reads([], () => new Promise(resolve => { finish = resolve; }));
    render(<IndDocumentLibrary programId={PROGRAM} onOpenDocument={vi.fn()} />);
    const create = await showType();
    fireEvent.click(create); fireEvent.click(create);
    expect(posts()).toHaveLength(1);
    await act(async () => finish(ok(receipt())));
  });

  it.each([{ client_program_id: OTHER }, { template_id: SECOND_TEMPLATE }])('refuses an unverified creation receipt %j without opening it', async wrong => {
    const onOpenDocument = vi.fn();
    reads([], async () => ok(receipt(wrong)));
    render(<IndDocumentLibrary programId={PROGRAM} onOpenDocument={onOpenDocument} />);
    fireEvent.click(await showType());
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not confirm/i);
    expect(onOpenDocument).not.toHaveBeenCalled();
    expect(posts()).toHaveLength(1);
  });
});

describe('IND template creation recovery stays in the current project', () => {
  it('recovers an uncertain create through the existing scoped document list before offering another POST', async () => {
    let created = false;
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST') { created = true; throw new TypeError('Reply lost after creation'); }
      if (url.includes('ind-document-catalog')) return ok({ success: true, data: catalogue });
      return ok({ documents: created ? [{ id: DOCUMENT, title: 'Recovered working copy', status: 'DRAFT', template_id: TEMPLATE, client_program_id: PROGRAM }] : [] });
    });
    const onOpenDocument = vi.fn();
    render(<IndDocumentLibrary programId={PROGRAM} onOpenDocument={onOpenDocument} />);
    fireEvent.click(await showType());
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not confirm/i);
    expect(onOpenDocument).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check working documents' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Recovered working copy · Draft' }));
    expect(onOpenDocument).toHaveBeenCalledWith(DOCUMENT);
    expect(posts()).toHaveLength(1);
  });

  it('offers a real retry for a refused create', async () => {
    let calls = 0;
    reads([], async () => { if (++calls === 1) throw new ApiRequestError('Current project permission denied.', 403); return ok(receipt()); });
    const onOpenDocument = vi.fn();
    render(<IndDocumentLibrary programId={PROGRAM} onOpenDocument={onOpenDocument} />);
    fireEvent.click(await showType());
    expect((await screen.findByRole('alert')).textContent).toMatch(/permission denied/i);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(onOpenDocument).toHaveBeenCalledWith(DOCUMENT));
    expect(posts()).toHaveLength(2);
  });

  it('suppresses a delayed old-project receipt after the host switches project', async () => {
    let finish!: (value: unknown) => void;
    reads([], () => new Promise(resolve => { finish = resolve; }));
    const onOpenDocument = vi.fn();
    const { rerender } = render(<IndDocumentLibrary programId={PROGRAM} onOpenDocument={onOpenDocument} />);
    fireEvent.click(await showType());
    publishShellProject({ id: OTHER, title: 'Other project' });
    rerender(<IndDocumentLibrary programId={OTHER} onOpenDocument={onOpenDocument} />);
    await act(async () => finish(ok(receipt())));
    expect(onOpenDocument).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Open working copy' })).toBeNull();
  });

  it('holds creation when the existing working documents could not be checked', async () => {
    reads();
    apiRequest.mockImplementation(async (_method: string, url: string) => url.includes('ind-document-catalog')
      ? ok({ success: true, data: catalogue }) : { ok: false, status: 503, json: async () => ({ message: 'Unavailable' }) });
    render(<IndDocumentLibrary programId={PROGRAM} />);
    const create = await showType();
    await screen.findByText('Working documents could not be checked');
    expect((create as HTMLButtonElement).disabled).toBe(true);
    expect(posts()).toHaveLength(0);
  });
});

describe('module outlines stay in the same IND library', () => {
  it('offers the module template through the same creation action', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'POST') return ok(receipt());
      if (url.includes('ind-document-catalog')) return ok({ success: true, data: { ...catalogue, moduleTemplates: [{ ...template, title: 'M4 · Module 4 working outline' }] } });
      return ok({ documents: [] });
    });
    const onOpenDocument = vi.fn();
    render(<IndDocumentLibrary programId={PROGRAM} onOpenDocument={onOpenDocument} />);
    fireEvent.click(screen.getByRole('button', { name: 'Module outlines' }));
    fireEvent.click(await screen.findByText('M4 · Module 4 working outline'));
    fireEvent.click(screen.getByRole('button', { name: 'Create from template' }));
    await waitFor(() => expect(onOpenDocument).toHaveBeenCalledWith(DOCUMENT));
    expect(posts()[0][2]).toMatchObject({ title: 'M4 · Module 4 working outline', template_id: TEMPLATE, module: 'M4' });
  });
});

describe('the existing document creation picker selects identities', () => {
  it('submits the second exact ID when two templates have the same display name', async () => {
    render(<AuthoringCreateExport docId={null} docTitle={null} module="M4" fireToast={vi.fn()}
      onDocCreated={vi.fn()} onSectionCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /New document/ }));
    const choice = await screen.findByLabelText('Start from');
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Repeated template name' })).toHaveLength(2));
    expect(screen.getAllByRole('option', { name: 'Repeated template name' }).map(option => (option as HTMLOptionElement).value)).toEqual([TEMPLATE, SECOND_TEMPLATE]);
    fireEvent.change(choice, { target: { value: SECOND_TEMPLATE } });
    fireEvent.change(screen.getByLabelText(/^Document title/), { target: { value: 'Study Tox-07' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][2]).toMatchObject({ template_id: SECOND_TEMPLATE, client_program_id: PROGRAM });
  });

  it.each(['M1', null])('derives the builtin module %s instead of the current M4 tree selection', async targetModule => {
    apiRequest.mockImplementation(async (method: string) => method === 'GET'
      ? ok({ templates: [{ id: TEMPLATE, name: 'Builtin working outline', module: targetModule, limitations: template.limitations }] })
      : ok(receipt()));
    render(<AuthoringCreateExport docId={null} docTitle={null} module="M4" fireToast={vi.fn()}
      onDocCreated={vi.fn()} onSectionCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /New document/ }));
    const choice = await screen.findByLabelText('Start from');
    await screen.findByRole('option', { name: 'Builtin working outline' });
    fireEvent.change(choice, { target: { value: TEMPLATE } });
    const derived = screen.getByLabelText('CTD module') as HTMLInputElement;
    expect(derived.readOnly).toBe(true);
    expect(derived.value).toBe(targetModule ?? 'No CTD placement (preparation)');
    expect(screen.getByText(template.limitations[0])).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Document title/), { target: { value: 'Working outline' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][2]).toMatchObject({ module: targetModule, template_id: TEMPLATE, client_program_id: PROGRAM });
  });
});
