// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
const request = vi.hoisted(() => vi.fn());
/* useDocumentList reads the signed-in session (CanvasDocumentList.tsx); with
   no AuthProvider mounted, the real useAuth throws before Project home renders. */
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: request }));
import { ProjectHome } from '../surfaces/ProjectHome';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const row = (id: number) => ({ id, title: `source-${id}.pdf`, extractionStatus: 'extracted', textAvailable: true, isCurrent: true, dataEligible: true });
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
afterEach(() => { cleanup(); request.mockReset(); delete window.C2C_PROJECT; delete window.C2C_SOURCE_PINS; });
it('withholds drafting while the refreshed source admission is unknown, then adopts withdrawal', async () => {
  const pending = pendingRead(); let reads = 0;
  request.mockImplementation(async (_method: string, path: string) => {
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
    if (path === `/api/c2c/projects/${A}/sources`) return ok({ sources: [row(1)] });
    if (path === `/api/c2c/projects/${B}/sources`) return pending.response;
    return ok({ id: path.includes(B) ? B : A });
  });
  const view = openEvidence(onAsk);
  fireEvent.click(await screen.findByLabelText('Use source-1.pdf as context'));
  fireEvent.click(screen.getByRole('button', { name: 'Draft with 1 pinned source' }));
  expect(window.C2C_SOURCE_PINS).toEqual(['1']);
  window.C2C_PROJECT = { id: B, title: 'Programme B' };
  view.rerender(<ProjectHome {...props} onAsk={onAsk} />);
  expect(screen.queryByRole('button', { name: 'Draft with 1 pinned source' })).toBeNull();
  expect(window.C2C_SOURCE_PINS).toEqual([]);
  // A different project opens at its own step (A2.1), so visit its Evidence
  // workflow before asking to draft from that project's sources.
  fireEvent.click(screen.getByRole('button', { name: 'Evidence', exact: true }));
  await act(async () => pending.resolve(ok({ sources: [row(2)] })));
  fireEvent.click(await screen.findByRole('button', { name: 'Write from these sources' }));
  expect(window.C2C_SOURCE_PINS).toEqual(['2']);
});
