// @vitest-environment jsdom
/** Real shell controls preflight the existing protocol editor's pending work. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Editor } from '@tiptap/core';
import { installDriveBrowserMocks } from './liveDriveShell.fixtures';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({
  ...await original<typeof import('@/services/portal/authService')>(),
  useAuth: () => ({ user: { id: '7', organizationId: '7', firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: ['admin'], permissions: ['governed:write', 'billing:admin'] }, logout: vi.fn() }),
}));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: { id: '7', name: 'Sponsor' }, organizationId: 7, tenant: null }) }));
vi.mock('../surfaceActions', async original => {
  const real = await original<typeof import('../surfaceActions')>();
  return { ...real, applySurfaceAction: vi.fn(real.applySurfaceAction) };
});

import { Rail, TopBar, CmdK } from '../Shell';
import { NavEntitlementsProvider } from '../navEntitlements';
import { ProtocolWorkspaceDoc } from '../surfaces/ProtocolDevWorkspace';
import { RichSectionEditor } from '../editor/RichSectionEditor';
import { C2CForm } from '../C2CForm';
import { applySurfaceAction, __resetSurfaceActionBus } from '../surfaceActions';
import { clearShellProject, publishShellProject, readShellProject } from '../shellProject';
import { clearNavParams, registerSurfaceLeaveGuard, surfaceLeaveRefusal } from '../navParams';
import { clearEditorTarget, setEditorTarget } from '../editorTarget';
import { __resetCeremonies } from '../ceremony';
import { locationForSurface } from '../routing';

const PID = '5b2d7c11-2222-4333-8444-555566667777';
const REFUSAL = 'Save the pending section changes before switching work.';
const DOC = { id: '41', programId: PID, title: 'Dose-ranging study', shortTitle: 'BX-410-201', kind: 'clinical', version: '0.7', status: 'draft',
  openSection: '101', sections: [{ id: '101', num: '1', title: 'Synopsis', status: 'draft', required: true, updatedAt: '2026-10-30T10:00:00.000Z' }],
  content: { 101: [{ p: 'The saved clinical protocol.' }] }, objectives: [], completenessFindings: [], studyDesign: null };
const release: Array<() => void> = [];
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value }) as Response;

function mount({ palette = false, protocol = true }: { palette?: boolean; protocol?: boolean } = {}) {
  const onNav = vi.fn((id: string) => window.history.pushState({}, '', locationForSurface(id)));
  const onAsk = vi.fn(), onAct = vi.fn(), onClose = vi.fn(), setSegment = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function ShellControls() {
    const [open, setOpen] = React.useState(palette);
    return <>
      <Rail activeId="protocol-dev" onNav={onNav} collapsed={false} setCollapsed={() => {}} segment="biopharma" setSegment={setSegment} />
      <TopBar surface={{ id: 'protocol-dev', label: 'Protocol workspace' }} onPalette={() => setOpen(true)} segment="biopharma" onSegment={setSegment} onNav={onNav} onAsk={onAsk} />
      <CmdK open={open} onClose={() => { onClose(); setOpen(false); }} onNav={onNav} onAsk={onAsk} onAct={onAct} />
      {protocol && <ProtocolWorkspaceDoc doc={DOC} onNav={onNav} onAsk={onAsk} />}
    </>;
  }
  render(<QueryClientProvider client={client}><NavEntitlementsProvider><ShellControls /></NavEntitlementsProvider></QueryClientProvider>);
  return { onNav, onAsk, onAct, onClose, setSegment };
}
async function pending() {
  const canvas = await screen.findByRole('textbox', { name: /Section 1 — Synopsis/ });
  fireEvent.change(screen.getByLabelText(/Section status/), { target: { value: 'complete' } });
  expect(surfaceLeaveRefusal()).toBe(REFUSAL);
  return canvas;
}
const rail = () => screen.getByRole('navigation', { name: 'Primary' });
const palette = () => screen.getByRole('dialog', { name: 'Command palette' });
const query = () => within(palette()).getByPlaceholderText(/Search surfaces/) as HTMLInputElement;
function result(label: string) {
  const button = within(palette()).getAllByRole('button').find(element => element.querySelector('.lbl')?.textContent === label);
  if (!button) throw new Error(`No palette result ${label}`);
  return button;
}
function channels() { return { url: window.location.href, project: readShellProject(), params: window.C2C_NAV_PARAMS, editor: window.C2C_EDITOR_TARGET, convo: (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO }; }
function expectChannels(before: ReturnType<typeof channels>) {
  expect(window.location.href).toBe(before.url); expect(readShellProject()).toBe(before.project);
  expect(window.C2C_NAV_PARAMS).toBe(before.params); expect(window.C2C_EDITOR_TARGET).toBe(before.editor);
  expect((window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO).toBe(before.convo);
}
async function alertContains(text: string | RegExp) {
  await waitFor(() => expect(screen.getAllByRole('alert').some(element => typeof text === 'string' ? element.textContent?.includes(text) : text.test(element.textContent ?? ''))).toBe(true));
}

beforeEach(() => {
  installDriveBrowserMocks(); __resetCeremonies(); localStorage.clear(); sessionStorage.clear();
  window.history.replaceState({}, '', `/concept2cure/protocol-dev?program=${PID}&view=retained#section-1`);
  publishShellProject({ id: PID, title: 'BX-410' });
  window.C2C_NAV_PARAMS = { surfaceId: 'vault', params: { source: 'prior handoff' }, setAt: Date.now() };
  setEditorTarget({ docType: null, docId: '30000000-0000-4000-8000-000000000003', programId: PID });
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'retained' };
  apiRequest.mockReset(); vi.mocked(applySurfaceAction).mockClear();
  apiRequest.mockImplementation(async (_method: string, url: string) => ok(url === '/api/module-subscriptions/navigation'
    ? { organizationId: 7, tier: 'enterprise', masterAdmin: false, resolved: true, surfaces: [] } : {}));
});
afterEach(() => {
  cleanup(); release.splice(0).forEach(unregister => unregister()); __resetSurfaceActionBus(); __resetCeremonies();
  clearEditorTarget(); clearNavParams(); clearShellProject(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
  window.history.replaceState({}, '', '/');
});

describe('shell destinations preserve status-only protocol changes', () => {
  it.each(['Vault', 'Tasks', 'logo', 'project', 'help', 'account', 'client type'])('refuses %s before routing or action dispatch', async target => {
    const callbacks = mount(); const canvas = await pending(); const before = channels();
    if (target === 'Vault' || target === 'Tasks') fireEvent.click(within(rail()).getByRole('button', { name: target }));
    else if (target === 'logo') fireEvent.click(within(rail()).getAllByRole('button', { name: 'Home' })[0]);
    else if (target === 'project') fireEvent.click(screen.getByRole('button', { name: /Open project\s*BX-410/ }));
    else if (target === 'help') fireEvent.click(screen.getByRole('button', { name: 'Get help' }));
    else {
      fireEvent.click(screen.getByTitle('Ada Rowe'));
      fireEvent.click(screen.getByRole(target === 'account' ? 'menuitem' : 'menuitemradio', { name: target === 'account' ? 'Usage & limits' : /Medical Device & IVD/ }));
    }
    expect(callbacks.onNav).not.toHaveBeenCalled(); expect(callbacks.setSegment).not.toHaveBeenCalled();
    expect(applySurfaceAction).not.toHaveBeenCalled(); expectChannels(before);
    expect(screen.getByRole('textbox', { name: /Section 1 — Synopsis/ })).toBe(canvas);
    await alertContains(REFUSAL);
  });
});

describe('the palette exempts only its own navigation dialog', () => {
  it('preserves query and selection when pending work refuses a keyboard-selected result before action dispatch', async () => {
    const callbacks = mount({ palette: true }); await pending(); const before = channels();
    fireEvent.change(query(), { target: { value: 'Tasks' } });
    const input = query(); fireEvent.keyDown(input, { key: 'Enter' });
    expect(callbacks.onNav).not.toHaveBeenCalled(); expect(applySurfaceAction).not.toHaveBeenCalled();
    expect(callbacks.onClose).not.toHaveBeenCalled(); expect(query().value).toBe('Tasks'); expectChannels(before);
    await alertContains(REFUSAL);
  });

  it('permits a clean result despite its own dialog while the shared default remains strict', async () => {
    const callbacks = mount({ palette: true }); await screen.findByRole('textbox', { name: /Section 1 — Synopsis/ });
    expect(surfaceLeaveRefusal()).toMatch(/dialog/i);
    fireEvent.change(query(), { target: { value: 'Vault' } }); fireEvent.click(result('Vault'));
    expect(callbacks.onNav).toHaveBeenCalledExactlyOnceWith('vault'); expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
  });

  it('still refuses an underlying native dialog with the same cmdk class', async () => {
    const callbacks = mount({ palette: true }); await screen.findByRole('textbox', { name: /Section 1 — Synopsis/ });
    render(<div role="dialog" aria-label="Unfinished source" className="cmdk"><input defaultValue="Keep this source detail" /></div>);
    fireEvent.change(query(), { target: { value: 'Vault' } }); fireEvent.click(result('Vault'));
    expect(callbacks.onNav).not.toHaveBeenCalled(); expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Unfinished source' })).toBeTruthy(); expect(query().value).toBe('Vault');
    await alertContains(/dialog/i);
  });

  it('fails closed and reports the canonical reason when a registered guard throws', async () => {
    const callbacks = mount(); await screen.findByRole('textbox', { name: /Section 1 — Synopsis/ });
    release.push(registerSurfaceLeaveGuard(() => { throw new Error('Guard read failed'); }));
    fireEvent.click(within(rail()).getByRole('button', { name: 'Vault' }));
    expect(callbacks.onNav).not.toHaveBeenCalled(); await alertContains('Finish or close the work on this screen before navigating.');
  });
});

describe('palette actions and questions keep pending protocol work', () => {
  it.each(['step', 'action', 'ask'])('refuses a %s result before creating a deferred action or conversation handoff', async kind => {
    const callbacks = mount({ palette: true }); await pending(); const before = channels();
    if (kind === 'step') { fireEvent.change(query(), { target: { value: 'Plan' } }); fireEvent.click(result('Plan')); }
    else if (kind === 'action') fireEvent.click(result('Run validation'));
    else {
      fireEvent.change(query(), { target: { value: 'Explain our clinical study' } });
      fireEvent.click(result('Ask AnA: "Explain our clinical study"'));
    }
    expect(callbacks.onNav).not.toHaveBeenCalled(); expect(callbacks.onAct).not.toHaveBeenCalled();
    expect(callbacks.onAsk).not.toHaveBeenCalled(); expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(applySurfaceAction).not.toHaveBeenCalled(); expectChannels(before); await alertContains(REFUSAL);
  });

  it('does not replay a rejected palette result after changes are reverted; a fresh keyboard request succeeds', async () => {
    const callbacks = mount({ palette: true }); await pending();
    fireEvent.change(query(), { target: { value: 'Vault' } }); fireEvent.click(result('Vault'));
    expect(callbacks.onNav).not.toHaveBeenCalled(); expect(query().value).toBe('Vault');
    fireEvent.change(screen.getByLabelText(/Section status/), { target: { value: 'draft' } });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(callbacks.onNav).not.toHaveBeenCalled(); expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(query().value).toBe('Vault');
    fireEvent.keyDown(query(), { key: 'Enter' });
    expect(callbacks.onNav).toHaveBeenCalledExactlyOnceWith('vault'); expect(callbacks.onClose).toHaveBeenCalledOnce();
  });

  it('keeps governed ceremony ownership even when the palette itself is ignored', async () => {
    const callbacks = mount({ palette: true }); await screen.findByRole('textbox', { name: /Section 1 — Synopsis/ });
    render(<C2CForm config={{ eyebrow: 'Protocol', title: 'Governed draft', governed: true, fields: [], submitLabel: 'Save' }} onCancel={vi.fn()} onSubmit={vi.fn()} />);
    fireEvent.change(query(), { target: { value: 'Vault' } }); fireEvent.click(result('Vault'));
    expect(callbacks.onNav).not.toHaveBeenCalled(); expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Governed draft' })).toBeTruthy(); await alertContains(/governed form/i);
  });
});

describe('shell requests respect shared-editor text and in-flight saves', () => {
  it('preserves a real protocol text edit when a rail navigation is requested', async () => {
    const callbacks = mount(); const canvas = await screen.findByRole('textbox', { name: /Section 1 — Synopsis/ });
    const editor = (canvas as HTMLElement & { editor: Editor }).editor;
    act(() => { editor.view.dispatch(editor.state.tr.insertText('Unfinished dosing rationale. ', 1)); });
    await waitFor(() => expect(surfaceLeaveRefusal()).toBe(REFUSAL));
    const before = channels(); fireEvent.click(within(rail()).getByRole('button', { name: 'Vault' }));
    expect(callbacks.onNav).not.toHaveBeenCalled(); expectChannels(before);
    expect(canvas.textContent).toContain('Unfinished dosing rationale.'); expect(canvas.isConnected).toBe(true); await alertContains(REFUSAL);
  });

  it('retains the legacy editor beforeunload refusal when no shared registry guard is active', async () => {
    const callbacks = mount({ protocol: false });
    render(<RichSectionEditor value="<p>The stored section.</p>" onSave={async () => undefined} storageKey={null} ariaLabel="Legacy section content" />);
    const canvas = await screen.findByRole('textbox', { name: 'Legacy section content' });
    const editor = (canvas as HTMLElement & { editor: Editor }).editor;
    act(() => { editor.view.dispatch(editor.state.tr.insertText('Pending legacy wording. ', 1)); });
    expect(surfaceLeaveRefusal()).toBeNull();
    const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    fireEvent.click(within(rail()).getByRole('button', { name: 'Vault' }));
    expect(callbacks.onNav).not.toHaveBeenCalled(); expect(canvas.textContent).toContain('Pending legacy wording.');
    await alertContains(/unsaved document changes/i);
  });

  it('does not leave while the protocol section PATCH is unresolved', async () => {
    const callbacks = mount(); const canvas = await pending();
    let settle: ((response: Response) => void) | undefined;
    apiRequest.mockImplementation(async (method: string) => method === 'PATCH' ? new Promise<Response>(resolve => { settle = resolve; }) : ok({}));
    fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: 'Confirming the reviewed synopsis status' } });
    fireEvent.click(screen.getByRole('button', { name: /Save section/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(true));
    const before = channels(); fireEvent.click(within(rail()).getByRole('button', { name: 'Tasks' }));
    expect(callbacks.onNav).not.toHaveBeenCalled(); expect(applySurfaceAction).not.toHaveBeenCalled(); expectChannels(before);
    expect(canvas.isConnected).toBe(true); await alertContains(REFUSAL);
    await act(async () => { settle?.({ ok: false, status: 409, json: async () => ({ error: { code: 'SECTION_CHANGED', message: 'The saved section changed.' } }) } as Response); });
    expect((screen.getByLabelText(/Section status/) as HTMLSelectElement).value).toBe('complete');
  });
});
