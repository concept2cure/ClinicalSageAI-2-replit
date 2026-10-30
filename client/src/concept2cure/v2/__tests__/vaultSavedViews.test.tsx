// @vitest-environment jsdom
/**
 * Vault saved views, the control (D2, P-46; docs/design/VAULT_SAVED_VIEWS_2026-10-29.md
 * §3.9, test T9). A view is a search remembered. Opening the Vault asks nothing
 * of the store; opening "Saved views" reads it, and a failed read is said, never
 * shown as no views. Applying a view sets the find view's state and the existing
 * search runs it; a view the search would now refuse changes nothing. Only the
 * acts a view's flags allow are offered. Saving sends the state on screen.
 * Server half: server/routes/c2c/__tests__/project-vault-saved-views.pglite.integration.test.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ user: null as null | { id: string; permissions?: string[] } }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => auth.user,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { Vault } from '../surfaces/Vault';
import { savedViewKey } from '../surfaces/VaultLibraryResults';
import { PID, ok, vaultPayload, props } from './_vault-surface-fixtures';

const VIEWS = `/api/c2c/project-vault/${PID}/saved-views`;
const MEMBER = { id: '8', permissions: ['governed:write'] };
const VIEWER = { id: '7', permissions: [] };

const view = (over: Record<string, unknown> = {}) => ({
  id: 1, label: 'Stability CSRs', visibility: 'private', programId: PID, q: 'stability',
  filters: { documentType: ['CSR'], ctdSection: ['3.2.P'] }, includeSuperseded: true,
  createdBy: { userId: 8, name: 'A. Author' }, updatedBy: { userId: 8, name: 'A. Author' },
  createdAt: '2026-10-29T10:00:00.000Z', updatedAt: '2026-10-29T10:00:00.000Z',
  mine: true, canEdit: true, canRename: true, canShare: true, canDelete: true, applies: true,
  ...over,
});
const orgView = (over: Record<string, unknown> = {}) => view({
  id: 2, label: 'All protocols', visibility: 'org_public', programId: null, q: '',
  filters: { documentType: ['PROTOCOL'] }, includeSuperseded: false,
  createdBy: { userId: 9, name: 'B. Lead' }, updatedBy: { userId: 9, name: 'B. Lead' },
  mine: false, canEdit: false, canRename: false, canShare: false, canDelete: false,
  ...over,
});
const listOf = (...views: unknown[]) => ok({ success: true, data: { programId: PID, views } });

let onViews: () => Response;
let onChange: (method: string, url: string, body: unknown) => Response;
const calls = (pred: (method: string, url: string) => boolean) =>
  apiRequest.mock.calls.filter(([m, u]) => pred(String(m), String(u)));
const viewReads = () => calls((m, u) => m === 'GET' && u === VIEWS).length;
const changes = () => calls((m, u) => m !== 'GET' && u.startsWith('/api/c2c/project-vault/saved-views'));
const projectSearches = () => calls((m, u) => m === 'GET' && u.startsWith(`/api/c2c/project-vault/${PID}/search?`)).map(([, u]) => String(u));
const librarySearches = () => calls((m, u) => m === 'GET' && u.startsWith('/api/c2c/project-vault/search?')).map(([, u]) => String(u));
const params = (url: string) => new URL(url, 'https://example.test').searchParams;

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  auth.user = MEMBER;
  apiRequest.mockReset();
  onViews = () => listOf(view(), orgView());
  onChange = () => ok({ success: true, data: view() });
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload());
    if (url === VIEWS && method === 'GET') return onViews();
    if (url.startsWith('/api/c2c/project-vault/saved-views')) return onChange(method, url, body);
    if (url.startsWith('/api/c2c/project-vault/search?')) {
      return ok({ success: true, data: { scope: 'verified-accessible-programs', query: params(url).get('q') ?? '', mode: 'browse', total: 0, limit: 50, offset: 0, results: [] } });
    }
    if (url.includes('/search?')) return ok({ success: true, data: { query: params(url).get('q') ?? '', mode: 'search', total: 0, limit: 100, offset: 0, results: [] } });
    if (url.endsWith('/seals')) return ok({ success: true, data: { seals: [] } });
    return ok({ success: true, data: {} });
  });
});
afterEach(() => { cleanup(); auth.user = null; delete (window as any).C2C_PROJECT; });

async function openVault() {
  render(<Vault {...props()} />);
  return screen.findByRole('group', { name: 'Filter documents' });
}
async function openViews() {
  await openVault();
  fireEvent.click(screen.getByRole('button', { name: 'Saved views' }));
  return screen.findByRole('group', { name: 'Saved views' });
}
const viewSelect = (g: HTMLElement) => within(g).getByLabelText('Saved view') as HTMLSelectElement;
async function pick(g: HTMLElement, label: string) {
  const select = viewSelect(g);
  await waitFor(() => expect([...select.options].some((o) => o.textContent?.startsWith(label))).toBe(true));
  const option = [...select.options].find((o) => o.textContent?.startsWith(label))!;
  fireEvent.change(select, { target: { value: option.value } });
}
async function applyView(label: string) {
  const g = await openViews();
  await pick(g, label);
  fireEvent.click(within(g).getByRole('button', { name: 'Apply' }));
  return g;
}

describe('the list is read only when asked for, and a failed read is a failure', () => {
  it('opening the Vault reads no saved views; opening the control reads this project\'s', async () => {
    await openVault();
    expect(viewReads()).toBe(0);
    const button = screen.getByRole('button', { name: 'Saved views' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    await waitFor(() => expect(viewReads()).toBe(1));
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('a failed read says so, never "No saved views yet", disables saving, and Try again reads again', async () => {
    onViews = () => { throw new ApiRequestError('Failed', 500, { error: 'SAVED_VIEWS_UNAVAILABLE' }, 'SAVED_VIEWS_UNAVAILABLE'); };
    const g = await openViews();
    expect((await within(g).findByRole('alert')).textContent).toContain('Saved views could not be loaded. This is not an empty list.');
    expect(within(g).queryByText('No saved views yet.')).toBeNull();
    expect((within(g).getByRole('button', { name: 'Save current search…' }) as HTMLButtonElement).disabled).toBe(true);
    onViews = () => listOf(view());
    fireEvent.click(within(g).getByRole('button', { name: 'Try again' }));
    await pick(g, 'Stability CSRs');
    expect(viewReads()).toBe(2);
    expect(within(g).queryByRole('alert')).toBeNull();
  });

  it('a malformed list is a failed read, not an empty one', async () => {
    onViews = () => ok({ success: true, data: { programId: PID, views: [{ id: 'x' }] } });
    const g = await openViews();
    expect((await within(g).findByRole('alert')).textContent).toContain('This is not an empty list.');
  });

  it('a verified empty list says there are none yet', async () => {
    onViews = () => listOf();
    const g = await openViews();
    await waitFor(() => expect(viewSelect(g).textContent).toBe('No saved views yet.'));
    expect(viewSelect(g).disabled).toBe(true);
    expect(within(g).queryByRole('alert')).toBeNull();
  });

  it('groups my views and the organisation\'s, and says whose and how wide each is', async () => {
    const g = await openViews();
    await pick(g, 'Stability CSRs');
    const groups = [...viewSelect(g).querySelectorAll('optgroup')].map((o) => o.label);
    expect(groups).toEqual(['Mine', 'Organisation']);
    expect([...viewSelect(g).options].map((o) => o.textContent)).toContain('All protocols · all projects · by B. Lead');
  });
});

describe('applying a view sets the find view, and the search runs it', () => {
  it('choosing a view changes nothing until Apply', async () => {
    const g = await openViews();
    await pick(g, 'Stability CSRs');
    expect((screen.getByLabelText('Search this vault') as HTMLInputElement).value).toBe('');
    expect(projectSearches()).toEqual([]);
    expect(within(g).getByRole('button', { name: 'Apply' })).toBeTruthy();
  });

  it('a project view fills the box, the filters and earlier versions, and the search carries exactly them', async () => {
    await applyView('Stability CSRs');
    await waitFor(() => expect(projectSearches().length).toBeGreaterThan(0));
    const p = params(projectSearches().at(-1)!);
    expect(p.get('q')).toBe('stability');
    expect(p.getAll('documentType')).toEqual(['CSR']);
    expect(p.getAll('ctdSection')).toEqual(['3.2.P']);
    expect(p.get('includeSuperseded')).toBe('true');
    expect((screen.getByLabelText('Search this vault') as HTMLInputElement).value).toBe('stability');
    const filters = screen.getByRole('group', { name: 'Filter documents' });
    expect((within(filters).getByLabelText('Type') as HTMLSelectElement).value).toBe('CSR');
    expect((within(filters).getByLabelText('CTD section') as HTMLInputElement).value).toBe('3.2.P');
    expect((screen.getByLabelText('Include earlier versions') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/View “Stability CSRs”/)).toBeTruthy();
    expect(screen.queryByText(/\(changed\)/)).toBeNull();
  });

  it('a library view searches the accessible projects, with no folder', async () => {
    await applyView('All protocols');
    await waitFor(() => expect(librarySearches().length).toBeGreaterThan(0));
    const p = params(librarySearches().at(-1)!);
    expect(p.getAll('documentType')).toEqual(['PROTOCOL']);
    expect(p.has('folderId')).toBe(false);
    expect((screen.getByLabelText('Accessible projects') as HTMLInputElement).checked).toBe(true);
    expect(projectSearches()).toEqual([]);
  });

  it('a view that no longer applies changes nothing and says why', async () => {
    onViews = () => listOf(view({
      label: 'Old folder view', filters: { folderId: ['module-9'] }, applies: false,
      refusal: { error: 'INVALID_FILTER', parameter: 'folderId', message: 'That folder is not in this project\'s cabinet.' },
    }));
    const g = await openViews();
    await pick(g, 'Old folder view (no longer applies)');
    fireEvent.click(within(g).getByRole('button', { name: 'Apply' }));
    expect((await within(g).findByRole('status')).textContent)
      .toBe('“Old folder view” no longer applies: That folder is not in this project\'s cabinet. Nothing was changed.');
    expect(projectSearches()).toEqual([]);
    expect((screen.getByLabelText('Search this vault') as HTMLInputElement).value).toBe('');
  });

  it('a held folder disables "Accessible projects" with its reason, and is shown and removable', async () => {
    onViews = () => listOf(view({ label: 'Module 3 only', q: '', filters: { folderId: ['module-3'] }, includeSuperseded: false }));
    await applyView('Module 3 only');
    await waitFor(() => expect(params(projectSearches().at(-1) ?? '?').getAll('folderId')).toEqual(['module-3']));
    expect((screen.getByLabelText('Accessible projects') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('A folder is one project’s cabinet. Remove the folder filter to search accessible projects.')).toBeTruthy();
    const filters = screen.getByRole('group', { name: 'Filter documents' });
    expect(within(filters).getByText('Also filtering by:')).toBeTruthy();
    fireEvent.click(within(filters).getByRole('button', { name: 'Remove the filter Folder: Module 3 · Quality' }));
    await waitFor(() => expect((screen.getByLabelText('Accessible projects') as HTMLInputElement).disabled).toBe(false));
  });

  it('several values in one dimension are shown, not hidden behind the select', async () => {
    onViews = () => listOf(view({ label: 'Two types', filters: { documentType: ['CSR', 'PROTOCOL'] } }));
    await applyView('Two types');
    const filters = await screen.findByRole('group', { name: 'Filter documents' });
    expect(await within(filters).findByRole('button', { name: /Remove the filter Type: Clinical study report, Protocol/ })).toBeTruthy();
  });
});

describe('only the acts a view allows are offered', () => {
  it('an organisation view made by someone else offers no change, and says who shared it', async () => {
    onViews = () => listOf(view(), orgView({ updatedBy: { userId: 4, name: 'C. Manager' } }));
    const g = await openViews();
    await pick(g, 'All protocols');
    for (const name of ['Rename', 'Delete', 'Update view', 'Share with organisation', 'Make personal']) {
      expect(within(g).queryByRole('button', { name })).toBeNull();
    }
    expect(within(g).getByText('Shared by B. Lead. Renamed by C. Manager.')).toBeTruthy();
    await pick(g, 'Stability CSRs');
    expect(within(g).getByRole('button', { name: 'Rename' })).toBeTruthy();
    expect(within(g).getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(within(g).getByRole('button', { name: 'Share with organisation' })).toBeTruthy();
  });

  it('Update view waits until the applied view\'s search has changed, and says why', async () => {
    const g = await openViews();
    await pick(g, 'Stability CSRs');
    const update = within(g).getByRole('button', { name: 'Update view' }) as HTMLButtonElement;
    expect(update.disabled).toBe(true);
    expect(within(g).getByText('Apply this view and change the search to update it.')).toBeTruthy();
  });
});

describe('saving sends the state on screen, and a refusal is said in the server\'s words', () => {
  it('Save is offered only while searching, with its reason', async () => {
    const g = await openViews();
    await pick(g, 'Stability CSRs');
    expect((within(g).getByRole('button', { name: 'Save current search…' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(g).getByText('Type a search or choose a filter, then save it as a view.')).toBeTruthy();
  });

  it('a read-only role may save for itself only, and is told so', async () => {
    auth.user = VIEWER;
    const g = await openViews();
    fireEvent.change(screen.getByLabelText('Search this vault'), { target: { value: 'stability' } });
    fireEvent.click(within(g).getByRole('button', { name: 'Save current search…' }));
    const form = await within(g).findByRole('group', { name: 'Save current search' });
    expect((within(form).getByLabelText('Everyone in the organisation') as HTMLInputElement).disabled).toBe(true);
    expect(within(form).getByText('Your role can save views for yourself only.')).toBeTruthy();
    expect((within(form).getByLabelText('Only me') as HTMLInputElement).checked).toBe(true);
  });

  it('the POST body is the find view\'s state, and a saved view is re-read and applied', async () => {
    onChange = (method) => (method === 'POST'
      ? ok({ success: true, data: view({ id: 3, label: 'My view', visibility: 'org_public', q: 'stability', filters: { documentType: ['CSR'] } }) })
      : ok({ success: true, data: {} }));
    const g = await openViews();
    fireEvent.change(screen.getByLabelText('Search this vault'), { target: { value: '  stability ' } });
    const select = within(screen.getByRole('group', { name: 'Filter documents' })).getByLabelText('Type');
    fireEvent.change(select, { target: { value: 'CSR' } });
    fireEvent.click(screen.getByLabelText('Include earlier versions'));
    await waitFor(() => expect((within(g).getByRole('button', { name: 'Save current search…' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(g).getByRole('button', { name: 'Save current search…' }));
    const form = await within(g).findByRole('group', { name: 'Save current search' });
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'My view' } });
    fireEvent.click(within(form).getByLabelText('Everyone in the organisation'));
    expect(within(form).getByText('Everyone in the organisation sees this view\'s name.')).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect((await within(g).findByRole('status')).textContent).toBe('Saved “My view”.');
    const [[method, url, body]] = changes();
    expect([method, url]).toEqual(['POST', '/api/c2c/project-vault/saved-views']);
    expect(body).toEqual({ label: 'My view', visibility: 'org_public', programId: PID, q: 'stability', filters: { documentType: ['CSR'] }, includeSuperseded: true });
    await waitFor(() => expect(viewReads()).toBe(2));
    expect(screen.getByText(/View “My view”/)).toBeTruthy();
  });

  it('a refused save shows the server\'s message, which stays until the next act', async () => {
    onChange = () => { throw new ApiRequestError('Bad', 400, { success: false, error: 'INVALID_FILTER', parameter: 'ctdSection', message: 'ctdSection must be a CTD section code, for example 3.2.P.' }, 'INVALID_FILTER'); };
    const g = await openViews();
    fireEvent.change(screen.getByLabelText('Search this vault'), { target: { value: 'stability' } });
    fireEvent.click(within(g).getByRole('button', { name: 'Save current search…' }));
    const form = await within(g).findByRole('group', { name: 'Save current search' });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect((await within(g).findByRole('alert')).textContent).toBe('ctdSection must be a CTD section code, for example 3.2.P.');
    fireEvent.change(screen.getByLabelText('Search this vault'), { target: { value: 'stability 2' } });
    expect(within(g).getByRole('alert').textContent).toContain('ctdSection must be a CTD section code');
    expect(viewReads()).toBe(1);
  });
});

describe('changing a view', () => {
  it('a change after applying shows "(changed)", and Update view sends the new parameters', async () => {
    onChange = () => ok({ success: true, data: view({ q: 'stability 24' }) });
    const g = await applyView('Stability CSRs');
    fireEvent.change(screen.getByLabelText('Search this vault'), { target: { value: 'stability 24' } });
    expect(await screen.findByText(/View “Stability CSRs” \(changed\)/)).toBeTruthy();
    const update = within(g).getByRole('button', { name: 'Update view' }) as HTMLButtonElement;
    expect(update.disabled).toBe(false);
    fireEvent.click(update);
    expect((await within(g).findByRole('status')).textContent).toBe('Updated “Stability CSRs”.');
    expect(changes().map(([m, u, b]) => [m, u, b])).toEqual([
      ['PATCH', '/api/c2c/project-vault/saved-views/1', { q: 'stability 24', filters: { documentType: ['CSR'], ctdSection: ['3.2.P'] }, includeSuperseded: true }],
    ]);
    await waitFor(() => expect(screen.queryByText(/\(changed\)/)).toBeNull());
  });

  it('Rename and Share each send one change', async () => {
    onChange = (_m, _u, body) => ok({ success: true, data: view(body as Record<string, unknown>) });
    const g = await openViews();
    await pick(g, 'Stability CSRs');
    fireEvent.click(within(g).getByRole('button', { name: 'Rename' }));
    const form = await within(g).findByRole('group', { name: 'Rename view' });
    fireEvent.change(within(form).getByLabelText('New name'), { target: { value: 'Stability reports' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save name' }));
    expect((await within(g).findByRole('status')).textContent).toBe('Renamed to “Stability reports”.');
    fireEvent.click(within(g).getByRole('button', { name: 'Share with organisation' }));
    expect((await within(g).findByText('“Stability CSRs” is now shared with the organisation.'))).toBeTruthy();
    expect(changes().map(([m, u, b]) => [m, u, b])).toEqual([
      ['PATCH', '/api/c2c/project-vault/saved-views/1', { label: 'Stability reports' }],
      ['PATCH', '/api/c2c/project-vault/saved-views/1', { visibility: 'org_public' }],
    ]);
  });

  it('Delete asks first, then deletes and forgets the applied view', async () => {
    onChange = () => ok({ success: true, data: { id: 1 } });
    const g = await applyView('Stability CSRs');
    expect(screen.getByText(/View “Stability CSRs”/)).toBeTruthy();
    fireEvent.click(within(g).getByRole('button', { name: 'Delete' }));
    const confirm = await within(g).findByRole('group', { name: 'Delete view' });
    expect(within(confirm).getByText('Delete your view “Stability CSRs”? Documents are not affected.')).toBeTruthy();
    expect(changes()).toEqual([]);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete view' }));
    expect((await within(g).findByRole('status')).textContent).toBe('Deleted “Stability CSRs”.');
    expect(changes().map(([m, u]) => [m, u])).toEqual([['DELETE', '/api/c2c/project-vault/saved-views/1']]);
    expect(screen.queryByText(/View “Stability CSRs”/)).toBeNull();
  });
});

describe('savedViewKey', () => {
  it('ignores value and key order and surrounding spaces, and tells a library view from a project one', () => {
    const a = savedViewKey({ q: ' x ', filters: { lifecycleStage: ['none', 'authoring'], documentType: ['CSR'] }, includeSuperseded: false, library: false });
    const b = savedViewKey({ q: 'x', filters: { documentType: ['CSR'], lifecycleStage: ['authoring', 'none'] }, includeSuperseded: false, library: false });
    expect(a).toBe(b);
    expect(savedViewKey({ q: 'x', filters: {}, includeSuperseded: false, library: true })).not.toBe(savedViewKey({ q: 'x', filters: {}, includeSuperseded: false, library: false }));
    expect(savedViewKey({ q: 'x', filters: { documentType: [] }, includeSuperseded: false, library: false })).toBe(savedViewKey({ q: 'x', filters: {}, includeSuperseded: false, library: false }));
  });
});
