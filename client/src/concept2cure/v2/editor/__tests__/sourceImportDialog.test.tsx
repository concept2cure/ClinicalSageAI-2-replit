// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { SourceImportDialog, openImportedDocument, readSourceImportResult } from '../SourceImportDialog';
import { peekEditorTarget, clearEditorTarget } from '../../editorTarget';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';
import { clearShellProject, publishShellProject } from '../../shellProject';

const programId = '11111111-1111-4111-8111-111111111111';
const source = { kind: 'data-room' as const, sourceId: 42 };
const docId = '22222222-2222-4222-8222-222222222222';
const origin = { kind: 'data-room', id: '42', programId, title: 'Protocol', fileName: 'Protocol.pdf', mimeType: 'application/pdf',
  documentType: 'Protocol', sectionCode: null, sha256: 'ab'.repeat(32), conversion: 'extracted-text' };
const token = `fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`;
const data = { doc: { id: docId, title: 'Protocol', tenant_id: 12, client_program_id: programId, created_by: 7,
    status: 'DRAFT', provenance: { source: 'import', importSource: { ...origin, reason: 'Revise eligibility criteria', warnings: [] } } },
  sections: [{ id: '33333333-3333-4333-8333-333333333333', doc_id: docId, tenant_id: 12, code: 'source.1', title: 'Protocol', content: 'Saved protocol', order_index: 0 }], origin,
  warnings: ['Page layout was not retained.'], reused: false };
const ok = (body: unknown) => ({ ok: true, status: 201, json: async () => body });
beforeEach(() => {
  authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(token, { id: '7', organizationId: '12', roles: ['admin'], permissions: ['governed:write'] }, 'fixture-refresh', 3600);
  publishShellProject({ id: programId }); apiRequest.mockReset();
});
afterEach(() => { cleanup(); clearEditorTarget(); authService.endSession(null); clearAuthToken(); clearShellProject(); localStorage.clear(); sessionStorage.clear(); });

describe('source working copy', () => {
  it('requires a stated reason, shows server conversion warnings, and opens only the exact confirmed id', async () => {
    apiRequest.mockResolvedValue(ok({ success: true, data }));
    const onOpenDocument = vi.fn();
    render(<SourceImportDialog programId={programId} source={source} title="Protocol.pdf" onClose={() => {}} onOpenDocument={onOpenDocument} />);
    expect((screen.getByRole('button', { name: 'Create working copy' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason for creating a working copy'), { target: { value: 'Revise eligibility criteria' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create working copy' }));
    await screen.findByText('Page layout was not retained.');
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/authoring/import/source', { programId, source, reason: 'Revise eligibility criteria' },
      { Authorization: `Bearer ${token}`, 'x-organization-id': '12' });
    expect(onOpenDocument).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open working copy' }));
    expect(onOpenDocument).toHaveBeenCalledWith(data.doc.id);
  });

  it('shows an explicit refusal and never navigates', async () => {
    apiRequest.mockResolvedValue({ ok: false, status: 409, json: async () => ({ success: false, message: 'This source was superseded.' }) });
    const onOpenDocument = vi.fn();
    render(<SourceImportDialog programId={programId} source={source} title="Protocol" onClose={() => {}} onOpenDocument={onOpenDocument} />);
    fireEvent.change(screen.getByLabelText('Reason for creating a working copy'), { target: { value: 'Revise protocol' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create working copy' }));
    expect((await screen.findByRole('alert')).textContent).toContain('superseded');
    expect(screen.queryByRole('button', { name: 'Open working copy' })).toBeNull();
    expect(onOpenDocument).not.toHaveBeenCalled();
  });

  it('holds double-clicks while the server saves the working copy', async () => {
    let finish!: (value: unknown) => void;
    apiRequest.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<SourceImportDialog programId={programId} source={source} title="Protocol" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Reason for creating a working copy'), { target: { value: 'Review source' } });
    const button = screen.getByRole('button', { name: 'Create working copy' });
    fireEvent.click(button); fireEvent.click(button);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    finish(ok({ success: true, data }));
    await waitFor(() => expect(screen.getByTestId('source-import-result')).toBeTruthy());
  });

  it.each([
    { ...data, doc: { title: 'Protocol' } },
    { ...data, origin: { ...data.origin, programId: 'another-project' } },
    { ...data, origin: { ...data.origin, id: '43' } },
    { ...data, origin: { ...data.origin, sha256: 'unknown' } },
    { ...data, origin: { ...data.origin, kind: 'vault' } },
  ])('refuses a malformed or mismatched success response', invalid => {
    expect(readSourceImportResult({ success: true, data: invalid }, programId, source)).toBeNull();
  });

  it('does not treat an error envelope as success even when it contains data', () => {
    expect(readSourceImportResult({ success: false, data }, programId, source)).toBeNull();
  });

  it('the source surface handoff uses the returned document and project identity', () => {
    const onNav = vi.fn();
    openImportedDocument(data.doc.id, programId, onNav);
    expect(peekEditorTarget()).toMatchObject({ docId: data.doc.id, programId, docType: null });
    expect(onNav).toHaveBeenCalledWith('document-authoring');
  });
});
