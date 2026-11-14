// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const request = vi.hoisted(() => vi.fn());
/* useDocumentList reads the signed-in session (CanvasDocumentList.tsx); with
   no AuthProvider mounted, the real useAuth throws before Project home renders. */
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: null, currentClientWorkspace: null }) }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: request }));
import { ProjectHome } from '../surfaces/ProjectHome';
import { authService } from '@/services/portal/authService';
import { clearEditorTarget, peekEditorTarget } from '../editorTarget';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const admitted = <T extends readonly { id: number }[]>(projectId: string, sources: T) => ({ projectId, sources,
  selection: { scope: 'verified-accessible-sources', sourceIds: sources.map(source => source.id) } });
const row = (id: number) => ({ id, title: `source-${id}.pdf`, checksum: String(id % 10).repeat(64), projectId: A,
  extractionStatus: 'extracted', textAvailable: true, isCurrent: true, dataEligible: true });
const props = { surface: { id: 'project-home' } as never, segment: 'biopharma', onNav: vi.fn() };
function pendingRead() {
  let resolve!: (response: Response) => void;
  const response = new Promise<Response>(done => { resolve = done; });
  return { response, resolve };
}
function openEvidence(onAsk: (text: string) => void) {
  window.C2C_PROJECT = { id: A, title: 'Programme A' };
  const view = render(<ProjectHome {...props} onAsk={onAsk} />);
  const tab = Array.from(document.querySelectorAll<HTMLButtonElement>('.pj-lc-stage')).find(button => button.textContent?.trim() === 'Evidence')!;
  fireEvent.click(tab);
  return view;
}
beforeEach(() => {
  authService.setToken(`fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 4 }))}.synthetic`, {
    id: '7', organizationId: '4', roles: ['author'], permissions: [],
  });
});
afterEach(() => { cleanup(); props.onNav.mockReset(); clearEditorTarget(); authService.endSession(null); request.mockReset(); vi.unstubAllGlobals(); delete window.C2C_PROJECT; delete window.C2C_SOURCE_PINS; });
it('withholds drafting while the refreshed source admission is unknown, then adopts withdrawal', async () => {
  const pending = pendingRead(); let reads = 0;
  request.mockImplementation(async (_method: string, path: string) => {
    if (path.includes('?sourceIds=')) {
      const projectId = path.includes(B) ? B : A;
      return ok(admitted(projectId, [{ ...row(projectId === A ? 1 : 2), projectId }]));
    }
    if (path === `/api/c2c/projects/${A}/sources`) return ++reads === 1 ? ok({ sources: [row(1)] }) : pending.response;
    return ok({ id: A });
  });
  const onAsk = vi.fn(); openEvidence(onAsk);
  await screen.findByText('source-1.pdf');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh sources' }));
  const draft = screen.getByRole('button', { name: 'Write from these sources' }) as HTMLButtonElement;
  expect(draft.disabled).toBe(true);
  fireEvent.click(draft); expect(onAsk).not.toHaveBeenCalled();
  await act(async () => pending.resolve(ok({ sources: [{ ...row(1), dataEligible: false, disposition: 'remove_data' }] })));
  expect(screen.queryByRole('button', { name: 'Write from these sources' })).toBeNull();
});
it('retires local and handoff pins on programme change before the new source read resolves', async () => {
  const pending = pendingRead(); const onAsk = vi.fn();
  request.mockImplementation(async (_method: string, path: string) => {
    if (path.includes('?sourceIds=')) {
      const projectId = path.includes(B) ? B : A;
      return ok(admitted(projectId, [{ ...row(projectId === A ? 1 : 2), projectId }]));
    }
    if (path === `/api/c2c/projects/${A}/sources`) return ok({ sources: [row(1)] });
    if (path === `/api/c2c/projects/${B}/sources`) return pending.response;
    return ok({ id: path.includes(B) ? B : A });
  });
  const view = openEvidence(onAsk);
  fireEvent.click(await screen.findByLabelText('Use source-1.pdf as context'));
  fireEvent.click(screen.getByRole('button', { name: 'Draft with 1 pinned source' }));
  await waitFor(() => expect(window.C2C_SOURCE_PINS).toEqual(['1']));
  window.C2C_PROJECT = { id: B, title: 'Programme B' };
  view.rerender(<ProjectHome {...props} onAsk={onAsk} />);
  expect(screen.queryByRole('button', { name: 'Draft with 1 pinned source' })).toBeNull();
  expect(window.C2C_SOURCE_PINS).toEqual([]);
  // A different project opens at its own step (A2.1), so visit its Evidence
  // workflow before asking to draft from that project's sources.
  fireEvent.click(screen.getByRole('button', { name: 'Evidence' }));
  await act(async () => pending.resolve(ok({ sources: [row(2)] })));
  fireEvent.click(await screen.findByRole('button', { name: 'Write from these sources' }));
  await waitFor(() => expect(window.C2C_SOURCE_PINS).toEqual(['2']));
});

it.each(['search', 'page'] as const)('retains checked sources across %s and freshly hands off the entire selection', async change => {
  const exact = pendingRead(); const onAsk = vi.fn();
  request.mockImplementation(async (_method: string, path: string) => {
    if (path.includes('?sourceIds=')) return exact.response;
    if (path === `/api/c2c/projects/${A}/sources`) return ok({ projectId: A, sources: [row(1)], currentTotal: 201,
      total: 201, window: { shown: 1, truncated: true } });
    if (path.startsWith(`/api/c2c/projects/${A}/sources?`)) return ok({ projectId: A, sources: [row(2)], currentTotal: 201,
      total: 1, window: { shown: 1, truncated: false } });
    return ok({ id: A });
  });
  openEvidence(onAsk);
  fireEvent.click(await screen.findByLabelText('Use source-1.pdf as context'));
  if (change === 'search') fireEvent.change(screen.getByRole('textbox', { name: 'Search sources by title or text' }), { target: { value: 'second' } });
  else fireEvent.click(screen.getByRole('button', { name: 'Older sources' }));
  fireEvent.click(await screen.findByLabelText('Use source-2.pdf as context'));
  fireEvent.click(screen.getByRole('button', { name: 'Draft with 2 pinned sources' }));
  await waitFor(() => expect(request.mock.calls.some(([, path]) => new URL(String(path), 'https://fixture.test').searchParams.get('sourceIds') === '1,2')).toBe(true));
  expect(onAsk).not.toHaveBeenCalled();
  expect(window.C2C_SOURCE_PINS ?? []).toEqual([]);
  await act(async () => exact.resolve(ok(admitted(A, [row(2), row(1)]))));
  expect(window.C2C_SOURCE_PINS).toEqual(['1', '2']);
  expect(onAsk).toHaveBeenCalledTimes(1);
});

it.each(['another source', 'the checked source'] as const)('retires a delayed exact read when %s changes away and back', async change => {
  const exact = pendingRead(); const onAsk = vi.fn();
  request.mockImplementation(async (_method: string, path: string) => {
    if (path.includes('?sourceIds=')) return exact.response;
    if (path === `/api/c2c/projects/${A}/sources`) return ok({ projectId: A, sources: [row(1), row(2)] });
    return ok({ id: A });
  });
  openEvidence(onAsk);
  fireEvent.click(await screen.findByLabelText('Use source-1.pdf as context'));
  fireEvent.click(screen.getByRole('button', { name: 'Draft with 1 pinned source' }));
  expect(onAsk).not.toHaveBeenCalled();
  const changed = screen.getByLabelText(`Use source-${change === 'another source' ? 2 : 1}.pdf as context`);
  fireEvent.click(changed); fireEvent.click(changed);
  await act(async () => exact.resolve(ok(admitted(A, [row(1)]))));
  expect(onAsk).not.toHaveBeenCalled();
  expect(window.C2C_SOURCE_PINS ?? []).toEqual([]);
});

const refusedReads = [
  { name: 'wrong project', body: { projectId: B, sources: [row(1)] } },
  { name: 'wrong recorded parent', body: { projectId: A, sources: [{ ...row(1), projectId: B }] } },
  { name: 'partial set', body: { projectId: A, sources: [] } },
  { name: 'unrelated identity', body: { projectId: A, sources: [row(2)] } },
  { name: 'duplicate identity', body: { projectId: A, sources: [row(1), row(1)] } },
  { name: 'changed checked bytes', body: { projectId: A, sources: [{ ...row(1), checksum: 'f'.repeat(64) }] } },
  { name: 'missing checksum', body: { projectId: A, sources: [{ ...row(1), checksum: undefined }] } },
  { name: 'malformed checksum', body: { projectId: A, sources: [{ ...row(1), checksum: 'unknown' }] } },
  { name: 'withdrawn data', body: { projectId: A, sources: [{ ...row(1), dataEligible: false, disposition: 'remove_data' }] } },
  { name: 'replaced source', body: { projectId: A, sources: [{ ...row(1), isCurrent: false }] } },
  { name: 'unreadable data', body: { projectId: A, sources: [{ ...row(1), textAvailable: false }] } },
];
it.each(refusedReads)('refuses $name before either handoff', async ({ body }) => {
  const onAsk = vi.fn();
  request.mockImplementation(async (_method: string, path: string) => {
    if (path.includes('?sourceIds=')) return ok(admitted(body.projectId, body.sources));
    if (path === `/api/c2c/projects/${A}/sources`) return ok({ projectId: A, sources: [row(1)] });
    return ok({ id: A });
  });
  openEvidence(onAsk);
  fireEvent.click(await screen.findByLabelText('Use source-1.pdf as context'));
  const targetReads = () => request.mock.calls.filter(([, path]) => String(path).startsWith('/api/authoring/')).length;
  const beforeTargetReads = targetReads();
  for (const name of ['Draft with 1 pinned source', 'Build in editor']) {
    fireEvent.click(screen.getByRole('button', { name }));
    await screen.findByText('The selected sources could not be verified. Refresh or select them again before continuing.');
    expect(onAsk).not.toHaveBeenCalled();
    expect(window.C2C_SOURCE_PINS ?? []).toEqual([]);
    expect(screen.queryByTestId('source-assembly-dialog')).toBeNull();
  }
  expect(request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  expect(targetReads()).toBe(beforeTargetReads);
});

it('refuses an exact source read error and permits an explicit fresh retry', async () => {
  let failing = true; const onAsk = vi.fn();
  request.mockImplementation(async (_method: string, path: string) => {
    if (path.includes('?sourceIds=')) return failing ? new Response('{}', { status: 503 }) : ok(admitted(A, [row(1)]));
    if (path === `/api/c2c/projects/${A}/sources`) return ok({ projectId: A, sources: [row(1)] });
    return ok({ id: A });
  });
  openEvidence(onAsk);
  fireEvent.click(await screen.findByLabelText('Use source-1.pdf as context'));
  fireEvent.click(screen.getByRole('button', { name: 'Draft with 1 pinned source' }));
  await screen.findByText('The selected sources could not be verified. Refresh or select them again before continuing.');
  expect(onAsk).not.toHaveBeenCalled();
  failing = false; fireEvent.click(screen.getByRole('button', { name: 'Draft with 1 pinned source' }));
  await waitFor(() => expect(onAsk).toHaveBeenCalledTimes(1));
  expect(window.C2C_SOURCE_PINS).toEqual(['1']);
});

it.each([null, 'legacy-unverified'])('does not admit mutually matching unchecked byte identities: %s', async checksum => {
  request.mockImplementation(async (_method: string, path: string) => path.startsWith(`/api/c2c/projects/${A}/sources`)
    ? ok(admitted(A, [{ ...row(1), checksum }])) : ok({ id: A }));
  const onAsk = vi.fn(); openEvidence(onAsk);
  fireEvent.click(await screen.findByLabelText('Use source-1.pdf as context'));
  fireEvent.click(screen.getByRole('button', { name: 'Draft with 1 pinned source' }));
  await screen.findByText('The selected sources could not be verified. Refresh or select them again before continuing.');
  expect(onAsk).not.toHaveBeenCalled();
  expect(window.C2C_SOURCE_PINS ?? []).toEqual([]);
});

it('retires an exact response whose body arrives after the source was unchecked', async () => {
  let resolveBody!: (body: unknown) => void;
  const body = new Promise<unknown>(done => { resolveBody = done; });
  request.mockImplementation(async (_method: string, path: string) => {
    if (path.includes('?sourceIds=')) return { ok: true, status: 200, json: () => body } as Response;
    if (path === `/api/c2c/projects/${A}/sources`) return ok({ projectId: A, sources: [row(1)] });
    return ok({ id: A });
  });
  const onAsk = vi.fn(); openEvidence(onAsk);
  const pin = await screen.findByLabelText('Use source-1.pdf as context'); fireEvent.click(pin);
  fireEvent.click(screen.getByRole('button', { name: 'Draft with 1 pinned source' }));
  await screen.findByText('Checking selected sources…');
  fireEvent.click(pin);
  const call = request.mock.calls.find(([, path]) => String(path).includes('?sourceIds='))!;
  expect((call[4] as AbortSignal).aborted).toBe(true);
  await act(async () => resolveBody(admitted(A, [row(1)])));
  expect(onAsk).not.toHaveBeenCalled();
  expect(window.C2C_SOURCE_PINS ?? []).toEqual([]);
});

it('keeps an admitted pending source read through an ordinary bearer refresh for the same session', async () => {
  const token = (visit: string) => `fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 4, visit }))}.synthetic`;
  authService.setToken(token('original'), { id: '7', organizationId: '4', roles: ['author'], permissions: [] }, 'refresh');
  const exact = pendingRead(); const onAsk = vi.fn();
  request.mockImplementation(async (_method: string, path: string) => path.includes('?sourceIds=') ? exact.response
    : path === `/api/c2c/projects/${A}/sources` ? ok({ projectId: A, sources: [row(1)] }) : ok({ id: A }));
  openEvidence(onAsk);
  fireEvent.click(await screen.findByLabelText('Use source-1.pdf as context'));
  fireEvent.click(screen.getByRole('button', { name: 'Draft with 1 pinned source' }));
  vi.stubGlobal('fetch', vi.fn(async () => ok({ accessToken: token('refreshed'), refreshToken: 'rotated', expiresIn: 3600 })));
  await act(async () => { expect(await authService.refreshToken()).toBe(true); });
  const call = request.mock.calls.find(([, path]) => String(path).includes('?sourceIds='))!;
  expect((call[4] as AbortSignal).aborted).toBe(false);
  await act(async () => exact.resolve(ok(admitted(A, [row(1)]))));
  expect(onAsk).toHaveBeenCalledTimes(1);
  expect(window.C2C_SOURCE_PINS).toEqual(['1']);
});

it('retires a pending check when an upload changes the read scope and admits a later deliberate retry', async () => {
  const exact = pendingRead(), upload = pendingRead(); let exactReads = 0;
  request.mockImplementation(async (_method: string, path: string) => path.includes('?sourceIds=')
    ? ++exactReads === 1 ? exact.response : ok(admitted(A, [row(1)]))
    : path === `/api/c2c/projects/${A}/sources` ? ok({ projectId: A, sources: [row(1)] }) : ok({ id: A }));
  vi.stubGlobal('fetch', vi.fn(() => upload.response));
  const onAsk = vi.fn(); openEvidence(onAsk);
  fireEvent.click(await screen.findByLabelText('Use source-1.pdf as context'));
  fireEvent.click(screen.getByRole('button', { name: 'Draft with 1 pinned source' }));
  const call = request.mock.calls.find(([, path]) => String(path).includes('?sourceIds='))!;
  fireEvent.change(screen.getByLabelText('Attach files to this project'), {
    target: { files: [new File(['%PDF'], 'new-study.pdf', { type: 'application/pdf' })] },
  });
  await waitFor(() => expect((call[4] as AbortSignal).aborted).toBe(true));
  await act(async () => upload.resolve(ok({ fileId: 'synthetic-upload', extractionMethod: 'pdf-text', extractionWords: 10, sourceId: 2 })));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Draft with 1 pinned source' }) as HTMLButtonElement).disabled).toBe(false));
  await act(async () => exact.resolve(ok(admitted(A, [row(1)]))));
  expect(onAsk).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Draft with 1 pinned source' }));
  await waitFor(() => expect(onAsk).toHaveBeenCalledTimes(1));
  expect(exactReads).toBe(2);
});

it('keeps retained checked bytes across pages and opens the existing chooser only after their fresh read', async () => {
  const exact = pendingRead(); const onAsk = vi.fn();
  const doc = '33333333-3333-4333-8333-333333333333';
  request.mockImplementation(async (_method: string, path: string) => {
    if (path.includes('?sourceIds=')) return exact.response;
    if (path === `/api/c2c/projects/${A}/sources`) return ok({ projectId: A, sources: [row(1)], currentTotal: 201,
      window: { shown: 1, truncated: true } });
    if (path.startsWith(`/api/c2c/projects/${A}/sources?offset=`)) return ok({ projectId: A, sources: [row(2)] });
    if (path.startsWith('/api/authoring/docs?')) return ok({ success: true,
      documents: [{ id: doc, title: 'Existing working document', program_id: A, status: 'DRAFT', readScope: 'document' }] });
    return ok({ id: A });
  });
  const view = openEvidence(onAsk);
  props.onNav.mockImplementation(() => view.unmount());
  fireEvent.click(await screen.findByLabelText('Use source-1.pdf as context'));
  fireEvent.click(screen.getByRole('button', { name: 'Older sources' }));
  await screen.findByLabelText('Use source-2.pdf as context');
  const targetReads = () => request.mock.calls.filter(([, path]) => String(path).startsWith('/api/authoring/')).length;
  const beforeTargetReads = targetReads();
  fireEvent.click(screen.getByRole('button', { name: 'Build in editor' }));
  expect(screen.queryByTestId('source-assembly-dialog')).toBeNull();
  expect(targetReads()).toBe(beforeTargetReads);
  await act(async () => {
    exact.resolve(ok(admitted(A, [{ ...row(1), originalFileAvailable: false, disposition: 'keep_data' }])));
  });
  await screen.findByRole('option', { name: 'Existing working document' });
  fireEvent.change(screen.getByLabelText('Working document'), { target: { value: doc } });
  fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
  await waitFor(() => expect(peekEditorTarget()?.assemblySources?.sources).toEqual([
    { kind: 'data-room', sourceId: 1, expectedChecksum: row(1).checksum },
  ]));
  expect(props.onNav).toHaveBeenCalledWith('document-authoring');
  expect(screen.queryByRole('heading', { name: 'Data room' })).toBeNull();
  expect(onAsk).not.toHaveBeenCalled();
  expect(request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
});

it('refuses a twenty-first explicit pin without silently truncating it for AnA', async () => {
  request.mockImplementation(async (_method: string, path: string) => path === `/api/c2c/projects/${A}/sources`
    ? ok({ projectId: A, sources: Array.from({ length: 21 }, (_, i) => row(i + 1)) }) : ok({ id: A }));
  const onAsk = vi.fn(); openEvidence(onAsk);
  await screen.findByLabelText('Use source-21.pdf as context');
  for (let id = 1; id <= 21; id++) fireEvent.click(screen.getByLabelText(`Use source-${id}.pdf as context`));
  expect((screen.getByRole('button', { name: 'Draft with 21 pinned sources' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Select up to 20 sources for AnA. 21 are selected.')).toBeTruthy();
  expect(onAsk).not.toHaveBeenCalled();
  expect(request.mock.calls.some(([, path]) => String(path).includes('?sourceIds='))).toBe(false);
});
