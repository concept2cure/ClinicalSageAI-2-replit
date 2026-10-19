// @vitest-environment jsdom
/** Independent integration review: the real shared signature modal must own
 * the global ceremony fence, including notification reads already in flight. */
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { apiRequest, verifyPassword } = vi.hoisted(() => ({ apiRequest: vi.fn(), verifyPassword: vi.fn() }));
vi.mock('@/lib/queryClient', async (original) => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
// Reauthentication is a test seam; the modal, notification resolver client,
// ceremony channel, and navigation/program handoff are their actual modules.
vi.mock('../../hooks/useEsignature', () => ({ useEsignature: () => ({ verifyPassword, verifyMfa: vi.fn() }) }));
vi.mock('../../_shared/signingPosture', () => ({ useSigningPosture: () => null }));
import { EsignModal, type EsigSignedManifest } from '../../_shared/components/EsignModal';
import { NotificationOpenButton } from '../NotificationOpenButton';
import { __resetCeremonies, ceremonyOpen, registerCeremonyOpen } from '../ceremony';
import { clearNavParams } from '../navParams';
import { clearEditorTarget } from '../editorTarget';
import { clearShellProject, publishShellProject, readShellProject } from '../shellProject';

const OLD_PROGRAM = '10000000-0000-4000-8000-000000000001';
const NEW_PROGRAM = '20000000-0000-4000-8000-000000000002';
const notice = { id: 5, resource_type: 'report_run', resource_id: '41' };
const target = { surface: 'insights', label: 'Open saved report', params: { reportRunId: '41' }, programId: NEW_PROGRAM };
const reply = () => ({ ok: true, status: 200, json: async () => ({ data: target }) }) as Response;
const manifest: EsigSignedManifest = { meaning: 'approval', reason: 'Reviewed exact package', signedAt: '2026-10-14T12:00:00Z' };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function Harness({ navigate, sign }: { navigate: (id: string) => void; sign: () => Promise<EsigSignedManifest> }) {
  const [open, setOpen] = useState(false);
  return <>
    <NotificationOpenButton notice={notice} navigate={navigate} />
    <button onClick={() => setOpen(true)}>Open package signature</button>
    <EsignModal open={open} action="Sign package release" target="run-1" meanings={['approval']} onClose={() => setOpen(false)} onSign={sign} />
  </>;
}
beforeEach(() => {
  __resetCeremonies(); clearNavParams(); clearEditorTarget(); clearShellProject();
  publishShellProject({ id: OLD_PROGRAM });
  apiRequest.mockReset(); apiRequest.mockResolvedValue(reply());
  verifyPassword.mockReset(); verifyPassword.mockResolvedValue({ valid: true, mfaRequired: false });
});
afterEach(() => { cleanup(); __resetCeremonies(); clearNavParams(); clearEditorTarget(); clearShellProject(); sessionStorage.clear(); localStorage.clear(); });

it('a target resolved after the real signature form opens cannot change the program or navigate', async () => {
  const pending = deferred<Response>();
  apiRequest.mockReturnValueOnce(pending.promise);
  const navigate = vi.fn();
  render(<Harness navigate={navigate} sign={async () => manifest} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open saved report' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Open package signature' }));
  fireEvent.change(screen.getByLabelText('Reason for this action'), { target: { value: 'Keep this unsaved signing reason' } });
  await act(async () => pending.resolve(reply()));
  expect((await screen.findByRole('alert')).textContent).toMatch(/governed form/);
  expect(navigate).not.toHaveBeenCalled(); expect(readShellProject()?.id).toBe(OLD_PROGRAM);
  expect((screen.getByLabelText('Reason for this action') as HTMLTextAreaElement).value).toBe('Keep this unsaved signing reason');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel signing' }));
  expect(ceremonyOpen()).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Retry linked record' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
  expect(readShellProject()?.id).toBe(NEW_PROGRAM);
});

it('keeps the notification fence while the actual shared ceremony commits a delayed signed action', async () => {
  const pendingTarget = deferred<Response>(); const pendingSign = deferred<EsigSignedManifest>();
  apiRequest.mockReturnValueOnce(pendingTarget.promise);
  const navigate = vi.fn(); const sign = vi.fn(() => pendingSign.promise);
  render(<Harness navigate={navigate} sign={sign} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open saved report' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open package signature' }));
  fireEvent.change(screen.getByLabelText('Reason for this action'), { target: { value: manifest.reason } });
  fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'synthetic-test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign and commit' }));
  await waitFor(() => expect(sign).toHaveBeenCalledOnce());
  try {
    await act(async () => pendingTarget.resolve(reply()));
    expect((await screen.findByRole('alert')).textContent).toMatch(/governed form/);
    expect(navigate).not.toHaveBeenCalled(); expect(readShellProject()?.id).toBe(OLD_PROGRAM);
    expect((screen.getByRole('button', { name: 'Cancel signing' }) as HTMLButtonElement).disabled).toBe(true);
    expect(ceremonyOpen()).toBe(true);
  } finally { await act(async () => pendingSign.resolve(manifest)); }
  await screen.findByText('Signature applied');
  expect(ceremonyOpen()).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(ceremonyOpen()).toBe(false);
});

it('registers only while open and cleans up correctly across StrictMode toggles and unmount', () => {
  const props = { action: 'Sign package release', target: 'run-1', onClose: vi.fn(), onSign: async () => manifest };
  const view = render(<React.StrictMode><EsignModal {...props} open={false} /></React.StrictMode>);
  expect(ceremonyOpen()).toBe(false);
  view.rerender(<React.StrictMode><EsignModal {...props} open /></React.StrictMode>);
  expect(ceremonyOpen()).toBe(true);
  const releaseOther = registerCeremonyOpen();
  view.rerender(<React.StrictMode><EsignModal {...props} open={false} /></React.StrictMode>);
  expect(ceremonyOpen()).toBe(true);
  releaseOther(); expect(ceremonyOpen()).toBe(false);
  view.rerender(<React.StrictMode><EsignModal {...props} open /></React.StrictMode>);
  expect(ceremonyOpen()).toBe(true);
  view.unmount(); expect(ceremonyOpen()).toBe(false);
});
