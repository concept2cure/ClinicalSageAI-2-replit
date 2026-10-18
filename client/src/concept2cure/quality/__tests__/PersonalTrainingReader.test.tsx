// @vitest-environment jsdom
import * as React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QMS_TRAINING_DECLARATION, type QmsTrainingAcknowledgement, type QmsTrainingContext } from '@shared/qms/training';
import { ApiRequestError } from '@/lib/queryClient';
import { setAuthToken, clearAuthToken } from '@/utils/authToken';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  user: { id: '7', organizationId: '12', permissions: [] as string[] },
}));
vi.mock('@/lib/queryClient', async (original) => ({
  ...await original<typeof import('@/lib/queryClient')>(), apiRequest: (...args: unknown[]) => H.apiRequest(...args),
}));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => H.user }));
vi.mock('../ControlledTextEditor', () => ({ ControlledTextEditor: ({ onSaved }: { onSaved: () => Promise<void> }) => <div>Controlled text editor<button onClick={() => { void onSaved(); }}>stub saved controlled text</button></div> }));
import { PersonalTrainingReader } from '../PersonalTrainingReader';
import { ceremonyOpen } from '../../v2/ceremony';

const receipt: QmsTrainingAcknowledgement = {
  id: 31, documentId: 6, userId: 7, documentVersion: '1.0', contentDigest: 'a'.repeat(64),
  acknowledgedAt: '2026-10-01T09:00:00.000Z', expiresAt: '2099-10-01T09:00:00.000Z', method: 'attestation',
};
function context(patch: Partial<QmsTrainingContext> = {}): QmsTrainingContext {
  return {
    documentId: 6, docNumber: 'SOP-015', title: 'Supplier controls', documentVersion: '1.0', status: 'effective',
    eligible: true, canEditControlledText: false, contentDigest: 'a'.repeat(64), unavailableReason: null,
    sections: [{ key: 'procedure', label: 'Procedure', body: 'Review <script>alert("unsafe")</script> & supplier evidence.\nKeep the release record.' }],
    acknowledgement: null, ...patch,
  };
}
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function read(c = context(), organizationId = 12) {
  return response({ data: { id: c.documentId, organization_id: organizationId, version: c.documentVersion, status: c.status }, meta: { training: c } });
}
const acknowledged = () => response({ data: receipt, meta: { auditTrail: { persisted: true, chained: true } } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function mount(documentId = 6, onAcknowledged = vi.fn(), onClose = vi.fn()) {
  return { ...render(<PersonalTrainingReader documentId={documentId} onAcknowledged={onAcknowledged} onClose={onClose} />), onAcknowledged, onClose };
}
async function declare() {
  const checkbox = await screen.findByRole('checkbox', { name: QMS_TRAINING_DECLARATION });
  fireEvent.click(checkbox);
  return screen.getByRole('button', { name: 'Acknowledge this revision' });
}
beforeEach(() => {
  H.apiRequest.mockReset(); H.user = { id: '7', organizationId: '12', permissions: [] };
  setAuthToken(`fixture.${btoa(JSON.stringify({ userId: '7', organizationId: '12' }))}.fixture`);
});
afterEach(() => { cleanup(); clearAuthToken(); });

describe('personal reading and acknowledgement in the controlled-document dialog', () => {
  it('renders exact section text escaped, names its revision, and requires an unchecked personal declaration', async () => {
    H.apiRequest.mockResolvedValue(read());
    const { container } = mount();
    await screen.findByText(/Keep the release record/);
    expect(container.querySelector('.qms-training-content p')?.textContent).toBe(context().sections[0].body);
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByLabelText('Released revision 1.0')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: QMS_TRAINING_DECLARATION }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('button', { name: 'Acknowledge this revision' }) as HTMLButtonElement).disabled).toBe(true);
    expect(H.apiRequest).toHaveBeenCalledTimes(1);
    expect(ceremonyOpen()).toBe(true);
  });

  it('allows a viewer to personally acknowledge without requesting a password or signature', async () => {
    let saved = false;
    H.apiRequest.mockImplementation(async (method: string) => {
      if (method === 'POST') { saved = true; return acknowledged(); }
      return read(context({ acknowledgement: saved ? receipt : null }));
    });
    const { onAcknowledged } = mount();
    fireEvent.click(await declare());
    expect(await screen.findByRole('region', { name: 'My acknowledgement' })).toBeTruthy();
    await waitFor(() => expect(onAcknowledged).toHaveBeenCalledTimes(1));
    expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/documents/6/training-ack', {
      documentVersion: '1.0', contentDigest: 'a'.repeat(64), understood: true, method: 'attestation',
    }, expect.objectContaining({ 'x-organization-id': '12', Authorization: expect.any(String) }));
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.getByText('Refresh due')).toBeTruthy();
    expect(screen.getByText('2099-10-01 09:00:00 UTC')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(H.apiRequest.mock.calls.filter(([method]) => method === 'GET')).toHaveLength(2);
  });

  it('shows a current server receipt without offering a duplicate acknowledgement', async () => {
    H.apiRequest.mockResolvedValue(read(context({ acknowledgement: receipt })));
    mount();
    expect(await screen.findByRole('region', { name: 'My acknowledgement' })).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(H.apiRequest).toHaveBeenCalledTimes(1);
  });

  it('refuses a token account swap before React rerenders without posting the checked declaration under another actor', async () => {
    H.apiRequest.mockResolvedValue(read());
    const { onAcknowledged } = mount();
    const submit = await declare();
    setAuthToken(`fixture.${btoa(JSON.stringify({ userId: '8', organizationId: '12' }))}.fixture`);
    fireEvent.click(submit);
    expect((await screen.findByRole('alert')).textContent).toMatch(/signed-in account or organization changed/);
    expect(H.apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(0);
    expect(onAcknowledged).not.toHaveBeenCalled();
  });

  it('prevents same-tick duplicate submissions and closing during a pending write', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    H.apiRequest.mockImplementation((method: string) => method === 'GET' ? Promise.resolve(read()) : pending.promise);
    const { onClose } = mount();
    const submit = await declare();
    fireEvent.click(submit); fireEvent.click(submit);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(H.apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => pending.resolve(response({ data: receipt, meta: {} })));
  });

});

describe('recorded controlled text and writer availability', () => {
  it.each(['outline only', 'artifact only', 'unverified release'])('offers no declaration when %s has no verified released bodies', async (reason) => {
    H.apiRequest.mockResolvedValue(read(context({ eligible: false, contentDigest: null, sections: [], unavailableReason: reason })));
    mount();
    expect(await screen.findByText(reason)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Acknowledge this revision' })).toBeNull();
  });

  it('does not let a viewer edit an unreleased document', async () => {
    H.apiRequest.mockResolvedValue(read(context({ status: 'draft', eligible: false, canEditControlledText: true, sections: [], unavailableReason: 'Release required.' })));
    mount();
    expect(await screen.findByText('Release required.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit controlled text' })).toBeNull();
  });

  it.each([
    ['in-review', 'in_review', 'This document is awaiting approval.'],
    ['read-only standing', 'effective', 'This organization is read-only.'],
  ] as const)('lets a %s reader read recorded text without a release claim or acknowledgement', async (_case, status, unavailableReason) => {
    H.apiRequest.mockResolvedValue(read(context({ status, eligible: false, unavailableReason })));
    const { container } = mount();
    await screen.findByText(/Keep the release record/);
    expect(container.querySelector('.qms-training-content p')?.textContent).toBe(context().sections[0].body);
    expect(screen.getByLabelText('Recorded controlled text for revision 1.0')).toBeTruthy();
    expect(screen.queryByLabelText('Released revision 1.0')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(unavailableReason)).toBeTruthy();
  });

  it('gives an authorized writer the existing controlled-text editor for a draft', async () => {
    H.user.permissions = ['governed:write'];
    H.apiRequest.mockResolvedValue(read(context({ status: 'draft', eligible: false, canEditControlledText: true, sections: [], unavailableReason: 'Release required.' })));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit controlled text' }));
    expect(screen.getByText('Controlled text editor')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('keeps a controlled-text save confirmed while independently rereading after a coverage-refresh failure', async () => {
    H.user.permissions = ['governed:write'];
    H.apiRequest.mockResolvedValue(read(context({ status: 'draft', eligible: false, canEditControlledText: true, sections: [], unavailableReason: 'Release required.' })));
    const onAcknowledged = vi.fn().mockRejectedValue(new Error('Coverage unavailable'));
    mount(6, onAcknowledged);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit controlled text' }));
    fireEvent.click(screen.getByRole('button', { name: 'stub saved controlled text' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/was saved.*coverage could not be refreshed/));
    expect(H.apiRequest.mock.calls.filter(([method]) => method === 'GET')).toHaveLength(2);
    expect(screen.queryByText('Controlled text editor')).toBeNull();
  });

  it('requires fresh server editing availability even when the cached session has a writer permission', async () => {
    H.user.permissions = ['governed:write'];
    H.apiRequest.mockResolvedValue(read(context({ status: 'draft', eligible: false, canEditControlledText: false, unavailableReason: 'The organization is read-only.' })));
    mount();
    expect(await screen.findByText('The organization is read-only.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit controlled text' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

});

describe('personal acknowledgement refusals and reconciliation', () => {
  it.each([
    ['missing audit', { data: receipt, meta: {} }],
    ['unchained audit', { data: receipt, meta: { auditTrail: { persisted: true, chained: false } } }],
    ['foreign actor', { data: { ...receipt, userId: 8 }, meta: { alreadyAcknowledged: true } }],
    ['different revision', { data: { ...receipt, documentVersion: '2.0' }, meta: { alreadyAcknowledged: true } }],
    ['different digest', { data: { ...receipt, contentDigest: 'b'.repeat(64) }, meta: { alreadyAcknowledged: true } }],
    ['malformed success', { data: null }],
  ])('does not invent success or refresh coverage after %s', async (_name, body) => {
    H.apiRequest.mockImplementation(async (method: string) => method === 'GET' ? read() : response(body));
    const { onAcknowledged } = mount();
    fireEvent.click(await declare());
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be confirmed/);
    expect(onAcknowledged).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'My acknowledgement' })).toBeNull();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  });

  it('shows a stale-release refusal and requires rereading rather than retrying a stale declaration', async () => {
    H.apiRequest.mockImplementation(async (method: string) => {
      if (method === 'GET') return read();
      throw new ApiRequestError('This released revision changed. Reload it before acknowledging.', 409, undefined, 'QMS_TRAINING_STALE');
    });
    const { onAcknowledged } = mount();
    fireEvent.click(await declare());
    expect((await screen.findByRole('alert')).textContent).toMatch(/revision changed/);
    expect(onAcknowledged).not.toHaveBeenCalled();
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
  });

  it('reconciles a lost write response by explicitly reloading the authoritative current receipt', async () => {
    let wrote = false;
    H.apiRequest.mockImplementation(async (method: string) => {
      if (method === 'POST') { wrote = true; throw new Error('Network unavailable'); }
      return read(context({ acknowledgement: wrote ? receipt : null }));
    });
    const { onAcknowledged } = mount();
    fireEvent.click(await declare());
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be confirmed/);
    expect(screen.queryByRole('region', { name: 'My acknowledgement' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reload record' }));
    expect(await screen.findByRole('region', { name: 'My acknowledgement' })).toBeTruthy();
    expect(onAcknowledged).not.toHaveBeenCalled();
    expect(H.apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
  });

  it('keeps a confirmed receipt when the following refresh fails', async () => {
    let reads = 0;
    H.apiRequest.mockImplementation(async (method: string) => {
      if (method === 'POST') return acknowledged();
      if (++reads > 1) throw new Error('Unavailable');
      return read();
    });
    const { onAcknowledged } = mount();
    fireEvent.click(await declare());
    expect(await screen.findByRole('region', { name: 'My acknowledgement' })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/was recorded.*could not be refreshed/));
    expect(onAcknowledged).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

});

describe('reader identities and late responses', () => {
  it('treats a refused initial read as unreadable, including a resolved session 401', async () => {
    H.apiRequest.mockResolvedValue(response({ error: 'Sign in again to read this document.' }, 401));
    mount();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Sign in again/);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('rejects a foreign user receipt returned by a successful GET', async () => {
    H.apiRequest.mockResolvedValue(read(context({ acknowledgement: { ...receipt, userId: 8 } })));
    mount();
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be verified/);
    expect(screen.queryByRole('region', { name: 'My acknowledgement' })).toBeNull();
  });

  it('ignores a delayed old-document read after the selected document changes', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    H.apiRequest.mockImplementation((_method: string, path: string) => path.endsWith('/6') ? pending.promise : Promise.resolve(read(context({ documentId: 9, title: 'New document', docNumber: 'SOP-009', sections: [{ key: 'purpose', label: 'Purpose', body: 'The newly selected document.' }] }))));
    const view = mount();
    view.rerender(<PersonalTrainingReader documentId={9} onClose={view.onClose} onAcknowledged={view.onAcknowledged} />);
    expect(await screen.findByText('The newly selected document.')).toBeTruthy();
    await act(async () => pending.resolve(read(context({ acknowledgement: receipt }))));
    expect(screen.queryByRole('region', { name: 'My acknowledgement' })).toBeNull();
    expect(screen.queryByText(context().sections[0].body)).toBeNull();
  });

  it.each(['organization', 'user'])('ignores a late old-%s write result and never refreshes the replacement scope', async (changed) => {
    const pending = deferred<ReturnType<typeof response>>();
    H.apiRequest.mockImplementation((method: string) => method === 'POST' ? pending.promise : Promise.resolve(read(context(), Number(H.user.organizationId))));
    const view = mount();
    fireEvent.click(await declare());
    H.user = changed === 'organization' ? { ...H.user, organizationId: '13' } : { ...H.user, id: '8' };
    view.rerender(<PersonalTrainingReader documentId={6} onClose={view.onClose} onAcknowledged={view.onAcknowledged} />);
    await screen.findByRole('checkbox');
    await act(async () => pending.resolve(acknowledged()));
    expect(view.onAcknowledged).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'My acknowledgement' })).toBeNull();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });

  it('does not refresh or render a confirmed old-document write after switching documents', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    H.apiRequest.mockImplementation((method: string, path: string) => method === 'POST' ? pending.promise : Promise.resolve(read(context(path.endsWith('/9') ? { documentId: 9, docNumber: 'SOP-009' } : {}))));
    const view = mount();
    fireEvent.click(await declare());
    view.rerender(<PersonalTrainingReader documentId={9} onClose={view.onClose} onAcknowledged={view.onAcknowledged} />);
    await screen.findByRole('checkbox');
    await act(async () => pending.resolve(acknowledged()));
    expect(view.onAcknowledged).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'My acknowledgement' })).toBeNull();
  });
});
