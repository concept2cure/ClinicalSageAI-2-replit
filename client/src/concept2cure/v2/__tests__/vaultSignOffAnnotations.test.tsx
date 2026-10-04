// @vitest-environment jsdom
/**
 * The review and approval dialogs say which review annotations were open on
 * the document when they opened (plan critique 15). They never refuse for
 * open annotations: no decision makes that a rule (FD13). A failed read is
 * said as such, never as "none open". The annotations themselves:
 * vaultAnnotations.test.tsx; the server: tests/db/vault-version-annotations*.dbtest.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const me = vi.hoisted(() => ({ id: '7', displayName: 'Abe Approver', email: 'abe@example.test', mfaEnabled: false, roles: ['member'] as string[] }));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => me,
}));

import { Vault } from '../surfaces/Vault';
import { PID, DOC_ID, ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const V1 = '33333333-3333-4333-8333-333333333333';
const ANNOTATIONS_URL = `/api/c2c/project-vault/${PID}/documents/${DOC_ID}/annotations`;
const head = uploadDoc({ ver: 'v2.0', versionCount: 2, lifecycleStage: null, details: { documentTitle: 'Stability summary', documentType: 'OTHER', classification: 'INTERNAL' } });
const signOff = { printedName: 'Rae Reviewer', meaning: 'REVIEWED', signedAt: '2026-10-01T10:00:00.000Z', signatureRef: 'esig:9', signerId: 5 };
const versions = [
  { id: DOC_ID, version: '2.0', contentHash: 'b'.repeat(64), fileSize: 2048, fileName: 's.pdf', uploader: 'Uma Uploader', uploaderId: 3,
    createdAt: '2026-09-30T10:00:00.000Z', current: true, link: 'verified', lifecycle: { canonicalId: 'C-4', stage: 'in_review', review: signOff, approval: null } },
  { id: V1, version: '1.0', contentHash: 'a'.repeat(64), fileSize: 2048, fileName: 's.pdf', uploader: 'Uma Uploader', uploaderId: 3,
    createdAt: '2026-09-29T10:00:00.000Z', current: false, link: 'none', lifecycle: null },
];
const openByVersion = [
  { versionId: DOC_ID, versionLabel: '2.0', current: true, open: 1, openChangeRequests: 1 },
  { versionId: V1, versionLabel: '1.0', current: false, open: 2, openChangeRequests: 2 },
];

let onAnnotations: () => Response;
beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload({ tree: cabinetTree([head]) }));
    if (url.endsWith('/versions')) return ok({ success: true, data: { versions } });
    if (url === ANNOTATIONS_URL) return onAnnotations();
    if (url.endsWith('/relationships')) return ok({ success: true, data: { relationships: [] } });
    return ok({ success: true, data: { entries: [], chain: { ok: true } } });
  });
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><Vault {...props()} /></QueryClientProvider>);
}

describe('the approval dialog says what was open (critique 15)', () => {
  it('names the open annotations on every version, and leaves Approve to the approver', async () => {
    onAnnotations = () => ok({ success: true, data: { annotations: [], openByVersion } });
    mount();
    const approve = await screen.findByRole('button', { name: /^Approve:/ });
    expect((approve as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(approve);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain(
      'When this dialog opened: These annotations were open: v2.0 — 1 (1 change request); v1.0 — 2 (2 change requests). '
      + "Signing does not resolve annotations; they stay on each version's record.",
    );
    expect(within(dialog).getByRole('button', { name: /Sign and commit/ })).toBeTruthy();
  });

  it('a read that failed is said as such, never as none open', async () => {
    onAnnotations = () => ({ ok: false, status: 500, json: async () => ({ success: false, error: 'ANNOTATIONS_UNAVAILABLE' }) }) as Response;
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Approve:/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('The open annotations on this document could not be read, so none are listed here.');
    expect(dialog.textContent).not.toMatch(/No annotations were open/);
    expect((await screen.findAllByRole('alert')).some((a) => a.textContent === 'Open annotations could not be read.')).toBe(true);
  });
});
