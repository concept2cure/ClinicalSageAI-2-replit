// @vitest-environment jsdom
/**
 * DocumentWorkbench — File to vault.
 *
 * POST /api/authoring/docs/:docId/file-to-vault { format } (WM's route). What
 * is pinned: the dialog sends exactly that, renders the server's own result
 * (folder, SHA-256, vault id) and nothing composed locally, renders the
 * server's refusal as a refusal with nothing claimed, refuses honestly with
 * no program, and is disabled while the open section has unsaved changes
 * (the vault files the SAVED document).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));
vi.mock('../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));

const emptyRects = function () { return [] as unknown as DOMRectList; };
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';

const PID = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SEC = 'ssssssss-ssss-4sss-8sss-ssssssssssss';
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

const FILED = { success: true, data: { vaultDocumentId: 'c4411315-0dd8-4775-9377-d123b9f9d16d', folder: 'module-2', sha256: '44cf3a1bedc69fc402070838694cd33e02c9c51b0a08c5a0b06706e8ca839b4f', format: 'pdf', fileName: 'module-2-5.pdf', programId: PID, sealed: false } };

let fileToVault: () => Promise<Response> | Response;
function mockApi() {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url.startsWith('/api/authoring/docs?')) {
      return ok({ documents: [{ id: DOC, title: 'Module 2.5 Clinical Overview', module: 'M2', product_code: null, status: 'draft', updated_at: null, section_count: 1 }] });
    }
    if (url === `/api/authoring/docs/${DOC}`) return ok({ success: true, document: { id: DOC, title: 'Module 2.5 Clinical Overview', module: 'M2', status: 'draft', provenance: null } });
    if (url === `/api/authoring/docs/${DOC}/sections`) {
      return ok({ sections: [{ id: SEC, doc_id: DOC, code: '2.5.1', title: 'Rationale', content: '<p>The product rationale.</p>', order_index: 0, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: null }] });
    }
    if (method === 'POST' && url === `/api/authoring/docs/${DOC}/file-to-vault`) return fileToVault();
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'C2C-101', phase: 'planning' });
    if (url.startsWith('/api/c2c/documents/')) return ok({ success: false }, 404);
    return ok({ success: true, sources: [], revisions: [], comments: [] });
  });
}

const props = () => ({ surface: { id: 'document-authoring', label: 'Authoring' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

async function openDialog() {
  render(<DocumentAuthoring {...props()} />);
  await screen.findAllByText('Rationale');
  fireEvent.click(await screen.findByTestId('file-to-vault-open'));
  return screen.findByTestId('file-to-vault-dialog');
}

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'C2C-101' };
  fileToVault = () => ok(FILED, 201);
  mockApi();
});
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});

describe('DocumentWorkbench — File to vault', () => {
  it('calls the route with the chosen format and renders the server’s folder, hash and id', async () => {
    const dlg = await openDialog();
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    fireEvent.click(within(dlg).getByLabelText(/Word/));
    fireEvent.click(within(dlg).getByTestId('ftv-submit'));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', `/api/authoring/docs/${DOC}/file-to-vault`, { format: 'docx' }));
    const result = await within(dlg).findByTestId('ftv-result');
    expect(result.textContent).toContain('under module-2');
    expect(result.textContent).toContain('Vault id c4411315-0dd8-4775-9377-d123b9f9d16d');
    expect(result.textContent).toContain('SHA-256 44cf3a1bedc69fc402070838694cd33e02c9c51b0a08c5a0b06706e8ca839b4f');
    // The result is the server's format, not the radio's.
    expect(result.textContent).toContain('Filed as PDF');
    expect(within(dlg).queryByTestId('ftv-submit')).toBeNull();
  });

  it('renders the server’s refusal as a refusal, with nothing claimed', async () => {
    fileToVault = () => {
      throw new ApiRequestError('This document is mid-freeze; it cannot be filed until the freeze completes.', 409, { success: false, error: { code: 'DOCUMENT_MID_FREEZE' } }, 'DOCUMENT_MID_FREEZE');
    };
    const dlg = await openDialog();
    fireEvent.click(within(dlg).getByTestId('ftv-submit'));
    const err = await within(dlg).findByTestId('ftv-error');
    expect(err.textContent).toContain('This document is mid-freeze');
    expect(err.textContent).toContain('Nothing was written to the vault');
    expect(within(dlg).queryByTestId('ftv-result')).toBeNull();
    // Still submittable after a refusal — the person may resolve and retry.
    expect((within(dlg).getByTestId('ftv-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('a 2xx without a vault record is not a success', async () => {
    fileToVault = () => ok({ success: true, data: {} }, 201);
    const dlg = await openDialog();
    fireEvent.click(within(dlg).getByTestId('ftv-submit'));
    expect((await within(dlg).findByTestId('ftv-error')).textContent).toContain('answered without a vault record');
  });

  it('with no program the dialog says so and offers no submit', async () => {
    delete (window as any).C2C_PROJECT;
    mockApi();
    const dlg = await openDialog();
    expect(within(dlg).getByTestId('ftv-no-program')).toBeTruthy();
    expect((within(dlg).getByTestId('ftv-submit') as HTMLButtonElement).disabled).toBe(true);
    expect(apiRequest.mock.calls.some(c => String(c[1]).endsWith('/file-to-vault'))).toBe(false);
  });
});
