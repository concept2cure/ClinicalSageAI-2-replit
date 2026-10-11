// @vitest-environment jsdom
/**
 * QA 2026-10-08, walk 2, j3 (a): a manager opened a Vault version in review,
 * was offered "Sign review", gave a reason and a password, and only then was
 * refused (403, §11.10(g)). Whether the reader may sign is the server's answer
 * (GET …/versions `signing.canSign`, the check the sign route applies), never
 * the client's role list; and the version says, by name, who can sign it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
/* A manager: a role the client knows can author, and that it cannot tell
   apart from a signer by itself. */
const me = vi.hoisted(() => ({ id: '20', displayName: 'Mo Manager', email: 'mo@example.test', mfaEnabled: false, roles: ['manager'] as string[] }));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => me,
}));

import { Vault } from '../surfaces/Vault';
import { PID, DOC_ID, ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const VERSIONS_URL = `/api/c2c/project-vault/${PID}/documents/${DOC_ID}/versions`;
const head = uploadDoc({ ver: 'v3.0', versionCount: 1, lifecycleStage: 'in_review', details: { documentTitle: 'Stability protocol', documentType: 'OTHER', classification: 'INTERNAL' } });
const inReview = {
  id: DOC_ID, version: '3.0', contentHash: 'c'.repeat(64), fileSize: 2048, fileName: 's.pdf', uploader: 'Emma Uploader',
  uploaderId: 4, createdAt: '2026-10-08T12:00:00.000Z', current: true, link: 'none',
  lifecycle: { canonicalId: 'C-9', stage: 'in_review', creatorId: 4, review: null, approval: null },
};
let signing: unknown;

function mount() {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload({ tree: cabinetTree([head]) }));
    if (url === VERSIONS_URL) return ok({ success: true, data: { versions: [inReview], signing } });
    return ok({ success: true, data: { entries: [], chain: { ok: true } } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Vault {...props()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => { (window as any).C2C_PROJECT = { id: PID, title: 'TOLV' }; });
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

describe('signing a Vault review is offered only to someone the server says can sign', () => {
  it('disables Sign review, says why, and names who can sign, when the server says this reader cannot', async () => {
    signing = { canSign: false, signers: [{ id: 3, name: 'Raj Patel' }, { id: 4, name: 'Emma Uploader' }, { id: 36, name: 'QA Onboard 3' }] };
    mount();
    const button = (await screen.findByRole('button', { name: /^Sign review:/ })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Your role does not carry signing authority .* so you cannot sign the review of this version\./)).toBeTruthy();
    // The uploader (who also sent it) is not offered as a signer.
    expect(screen.getByTestId('vault-who-may-sign').textContent).toBe('Not assigned to one person. Can sign the review: Raj Patel or QA Onboard 3.');
  });

  it('says plainly when nobody in the organization can sign it', async () => {
    signing = { canSign: false, signers: [{ id: 4, name: 'Emma Uploader' }] };
    mount();
    await screen.findByRole('button', { name: /^Sign review:/ });
    expect(screen.getByTestId('vault-who-may-sign').textContent).toMatch(/^No one in this organization can sign the review/);
  });

  it('leaves Sign review open for a signer, and to the server when the answer is unknown', async () => {
    signing = { canSign: true, signers: [{ id: 20, name: 'Mo Manager' }] };
    const first = mount();
    expect(((await screen.findByRole('button', { name: /^Sign review:/ })) as HTMLButtonElement).disabled).toBe(false);
    first.unmount();

    signing = { canSign: null, signers: null };
    mount();
    expect(((await screen.findByRole('button', { name: /^Sign review:/ })) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('vault-who-may-sign')).toBeNull();
  });
});
