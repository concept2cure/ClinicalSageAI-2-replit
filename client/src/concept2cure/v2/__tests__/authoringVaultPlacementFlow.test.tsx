// @vitest-environment jsdom
/** Reachability proof using the existing filer, Vault selection and Vault placement control. */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { authService } from '@/services/portal/authService';
import { FileToVaultDialog } from '../editor/FileToVaultDialog';
import { Vault } from '../surfaces/Vault';
import { publishShellProject } from '../shellProject';
import { PID, DOC_ID, ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const SOURCE = '33333333-3333-4333-8333-333333333333';
const sha256 = 'a'.repeat(64);
const reason = 'Approved stability summary for IND';
const filed = uploadDoc({ mimeType: 'application/pdf', filing: { ...uploadDoc().filing, ctdSection: '3.2.P.8.3', placementStatus: 'confirmed' } });

function ExistingFlow() {
  const [surface, setSurface] = React.useState('authoring');
  const [open, setOpen] = React.useState(true);
  return surface === 'vault'
    ? <Vault {...props()} onNav={setSurface} />
    : <FileToVaultDialog open={open} docId={SOURCE} docTitle="Stability summary" docStatus="APPROVED" programId={PID} programName="BX-301" onClose={() => setOpen(false)} onNav={setSurface} fireToast={vi.fn()} />;
}

beforeEach(() => {
  authService.setToken('fixture-composed-vault', { id: '7', organizationId: '1' }, 'fixture-composed-refresh', 3600);
  publishShellProject({ id: PID, title: 'BX-301' });
  apiRequest.mockReset().mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'POST' && url === `/api/authoring/docs/${SOURCE}/file-to-vault`) return new Response(JSON.stringify({ success: true, data: {
      vaultDocumentId: DOC_ID, programId: PID, sha256, format: 'pdf', folder: 'module-3',
      approval: { carried: true, reviewedBy: 'Rae Reviewer', approvedBy: 'Abe Approver' },
    } }), { status: 201 });
    if (method === 'GET' && url === `/api/c2c/project-vault/${PID}`) return ok(vaultPayload({ tree: cabinetTree([filed]) }));
    if (method === 'GET' && url === `/api/c2c/project-vault/${PID}/documents/${DOC_ID}/versions`) return ok({ success: true, data: { versions: [{
      id: DOC_ID, version: '1.0', contentHash: sha256, fileSize: 1024, fileName: 'stability-summary-24m.pdf',
      uploader: 'Ada Author', createdAt: '2026-10-21T10:00:00.000Z', current: true, link: 'none',
      lifecycle: { canonicalId: 'c-1', stage: 'approved', review: null, approval: null }, transmitRefusal: null, placements: [],
    }] } });
    if (url === '/api/submissions' || url.startsWith('/api/submissions?')) return ok([{ id: 4, title: 'Our IND', applicationType: 'ind', primaryRegion: 'us', status: 'open', programId: PID }]);
    if (url === '/api/submissions/4/sequences') return ok([{ id: 9, sequenceNumber: '0000', type: 'original', status: 'draft', region: 'us' }]);
    if (method === 'GET' && url === '/api/submissions/sequences/9/leaves') return ok([]);
    if (method === 'PUT' && url === '/api/submissions/sequences/9/leaves') return ok({
      ...body, id: 55, sequenceId: 9, documentId: null, auditTrail: { persisted: true, chained: true },
    });
    return ok({});
  });
});
afterEach(() => { cleanup(); authService.endSession(null); delete window.C2C_PROJECT; delete window.C2C_VAULT_TARGET; });

it('carries the returned Vault UUID through Open in Vault and the existing vault_documents leaf write', async () => {
  render(<ExistingFlow />);
  fireEvent.click(screen.getByTestId('ftv-submit'));
  await screen.findByTestId('ftv-result');
  fireEvent.click(screen.getByTestId('ftv-open-vault'));
  const control = await screen.findByTestId('vault-place-into-submission');
  expect(window.C2C_VAULT_TARGET).toBeNull(); // The existing Vault consumed the handoff.
  fireEvent.click(control);
  const dialog = await screen.findByRole('dialog', { name: /place into filing/i });
  expect((within(dialog).getByLabelText(/^Section code/) as HTMLInputElement).value).toBe('3.2.P.8.3');
  fireEvent.change(await within(dialog).findByLabelText('Target submission'), { target: { value: '4' } });
  await within(dialog).findByLabelText('Sequence');
  fireEvent.change(within(dialog).getByLabelText(/^Reason for this placement/), { target: { value: reason } });
  await waitFor(() => expect((within(dialog).getByRole('button', { name: /^Place into filing$/ }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(within(dialog).getByRole('button', { name: /^Place into filing$/ }));
  await within(dialog).findByText(/Filed as leaf 3\.2\.P\.8\.3/);
  expect(apiRequest).toHaveBeenCalledWith('PUT', '/api/submissions/sequences/9/leaves', {
    sectionCode: '3.2.P.8.3', title: filed.title, lifecycleOp: 'new', documentTable: 'vault_documents', documentUuid: DOC_ID, reason,
  });
  expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toEqual([
    ['POST', `/api/authoring/docs/${SOURCE}/file-to-vault`, { format: 'pdf' }],
  ]);
});
