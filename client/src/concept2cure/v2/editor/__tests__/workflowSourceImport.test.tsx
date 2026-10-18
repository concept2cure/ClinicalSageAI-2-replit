// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { SourceImportDialog, openImportedDocument } from '../SourceImportDialog';
import { ImportSourceNotice } from '../ImportSourceNotice';
import { describeProvenance } from '../provenance';
import { readWorkflowImportResult, readWorkflowPreview } from '../../authoringHandoff';
import { clearEditorTarget, peekEditorTarget } from '../../editorTarget';
import type { AuthoringSourceImportPreviewData, WorkflowImportSource } from '@shared/authoring/source-import';
import { GOVERNED_REASON_MAX } from '@shared/constants/governed-reason';
const PID = '11111111-1111-4111-8111-111111111111';
const source: WorkflowImportSource = { kind: 'csr', jobId: 14, sectionNumbers: ['11'] };
const hash = 'ab'.repeat(32);
const preview: AuthoringSourceImportPreviewData = { preview: true, fingerprint: hash,
  origin: { kind: 'csr', id: '14', selection: source, programId: PID, title: 'Stored CSR', version: null,
    documentType: null, sectionCode: null, fingerprint: hash, conversion: 'ich-e3-sections', gaps: ['Section 12 was not stored.'],
    sourceScope: { level: 'organization', programId: null, projectId: null }, association: { mode: 'explicit', reason: null },
    sectionOrigins: [{ code: 'CSR_11', sourceRowId: '31', contentSha256: hash, originalAuthorship: 'machine', model: null, modelEvidence: 'unrecorded' }] },
  sections: [{ code: 'CSR_11', title: 'Efficacy', contentSha256: hash }], gaps: ['Section 12 was not stored.'], warnings: [],
  target: { programId: PID, projectId: 2 }, association: { mode: 'explicit', required: true, reasonRequired: true, sourceProgramId: null, sourceProjectId: null, targetProgramId: PID } };
const created = { doc: { id: '22222222-2222-4222-8222-222222222222', title: 'CSR working copy', client_program_id: PID },
  sections: [{ id: 'section-11', code: 'CSR_11', title: 'Efficacy' }], origin: preview.origin, warnings: [], reused: false };
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function reason() { fireEvent.change(screen.getByLabelText('Reason for creating a working copy'), { target: { value: 'Review saved clinical output' } }); }
function associate() { fireEvent.change(screen.getByLabelText('Reason for associating this source with the target project'), { target: { value: 'This study belongs to our selected program' } }); }
function dialog(props = {}) { return <SourceImportDialog programId={PID} source={source} title="CSR" onClose={() => {}} {...props} />; }
beforeEach(() => { apiRequest.mockReset(); });
afterEach(() => { cleanup(); clearEditorTarget(); });

describe('stored workflow intake', () => {
  it('previews an exact saved IVD document and opens only the confirmed Authoring document id', async () => {
    const savedSource: WorkflowImportSource={kind:'ivd-document',documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
    const origin={...preview.origin,kind:'ivd-document' as const,id:savedSource.documentId,selection:savedSource,conversion:'ivd-document-snapshot' as const,
      sectionOrigins:[{code:'ivd.document',sourceRowId:`ivd_generated_documents:${savedSource.documentId}`,contentSha256:hash,originalAuthorship:'unknown' as const,model:null,modelEvidence:'unrecorded' as const}]};
    const sourcePreview={...preview,origin,sections:[{code:'ivd.document',title:'Saved notice payload',contentSha256:hash}]};
    const copy={...created,origin,sections:[{id:'real-authoring-section',code:'ivd.document',title:'Saved notice payload'}]};
    apiRequest.mockResolvedValueOnce(ok(sourcePreview)).mockResolvedValueOnce(ok(copy));
    const onOpenDocument=vi.fn();render(dialog({source:savedSource,title:'Saved notice',onOpenDocument}));
    await screen.findByTestId('workflow-import-preview');reason();associate();fireEvent.click(screen.getByRole('button',{name:'Create working copy'}));
    await screen.findByRole('button',{name:'Open working copy'});
    expect(apiRequest.mock.calls[1][2]).toMatchObject({source:savedSource,expectedFingerprint:hash,programId:PID});
    fireEvent.click(screen.getByRole('button',{name:'Open working copy'}));
    expect(onOpenDocument).toHaveBeenCalledWith(created.doc.id,'ivd.document');
    expect(onOpenDocument).not.toHaveBeenCalledWith(savedSource.documentId,expect.anything());
  });
  it('previews source identity, gaps and unknown model before atomic create and exact section handoff', async () => {
    apiRequest.mockResolvedValueOnce(ok(preview)).mockResolvedValueOnce(ok(created));
    const onOpenDocument = vi.fn(); render(dialog({ onOpenDocument }));
    await screen.findByTestId('workflow-import-preview');
    expect(screen.getByText(/Model not recorded/)).toBeTruthy();
    expect(screen.getByText('Section 12 was not stored.')).toBeTruthy();
    reason(); expect((screen.getByRole('button', { name: 'Create working copy' }) as HTMLButtonElement).disabled).toBe(true);
    associate(); fireEvent.click(screen.getByRole('button', { name: 'Create working copy' }));
    await screen.findByRole('button', { name: 'Open working copy' });
    expect(apiRequest.mock.calls[0][2]).toEqual({ programId: PID, source, previewOnly: true });
    expect(apiRequest.mock.calls[1][2]).toEqual({ programId: PID, source, expectedFingerprint: hash, reason: 'Review saved clinical output', associationReason: 'This study belongs to our selected program' });
    fireEvent.click(screen.getByRole('button', { name: 'Open working copy' }));
    expect(onOpenDocument).toHaveBeenCalledWith(created.doc.id, 'CSR_11');
    expect(apiRequest.mock.calls.every(([method, url]) => method === 'POST' && url === '/api/authoring/import/source')).toBe(true);
  });

  it('holds duplicate creation and refuses a changed fingerprint without navigation', async () => {
    const pending = deferred<ReturnType<typeof ok>>();
    apiRequest.mockResolvedValueOnce(ok(preview)).mockReturnValueOnce(pending.promise);
    render(dialog({ onOpenDocument: vi.fn() })); await screen.findByTestId('workflow-import-preview'); reason(); associate();
    const button = screen.getByRole('button', { name: 'Create working copy' }); fireEvent.click(button); fireEvent.click(button);
    expect(apiRequest).toHaveBeenCalledTimes(2);
    await act(async () => { pending.resolve(ok({ ...created, origin: { ...created.origin, fingerprint: 'cd'.repeat(32) } })); await pending.promise; });
    expect(screen.queryByRole('button', { name: 'Open working copy' })).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload source preview' })).toBeTruthy();
  });

  it('invalidates an old preview when a different CSR selection is requested', async () => {
    const pending = deferred<ReturnType<typeof ok>>(); apiRequest.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(ok(preview));
    const view = render(dialog());
    view.rerender(dialog({ source: { kind: 'csr', jobId: 14, sectionNumbers: ['12'] } }));
    await act(async () => { pending.resolve(ok(preview)); await pending.promise; });
    expect(screen.queryByTestId('workflow-import-preview')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open working copy' })).toBeNull();
  });

  it('holds opening a saved copy while the source editor has become dirty', async () => {
    apiRequest.mockResolvedValueOnce(ok(preview)).mockResolvedValueOnce(ok(created));
    const onOpenDocument = vi.fn(); const view = render(dialog({ onOpenDocument }));
    await screen.findByTestId('workflow-import-preview'); reason(); associate(); fireEvent.click(screen.getByRole('button', { name: 'Create working copy' }));
    await screen.findByRole('button', { name: 'Open working copy' }); view.rerender(dialog({ onOpenDocument, openBlocked: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Open working copy' })); expect(onOpenDocument).not.toHaveBeenCalled();
  });
});

describe('workflow response and provenance boundaries', () => {
  it('retains IVD source identity and honest source limits after reopening the authoring copy', () => {
    const ivdSource: WorkflowImportSource = {kind:'ivd-assessment',documentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
    const ivdOrigin = {...preview.origin,kind:'ivd-assessment' as const,id:ivdSource.documentId,selection:ivdSource,conversion:'ivd-assessment-snapshot' as const};
    const provenance=describeProvenance({source:'import',importSource:{...ivdOrigin,reason:'Review retained device facts',warnings:[]}});
    expect(provenance?.line).toContain(`IVD assessment source ${ivdSource.documentId}`);
    render(<ImportSourceNotice source={provenance?.importSource}/>);
    expect(screen.getByText(/Saved IVD assessment output/)).toBeTruthy();
    expect(screen.getByText(/source approval and signatures were not copied/)).toBeTruthy();
    expect(screen.queryByText(/Saved protocol output/)).toBeNull();
  });
  it.each([
    { ...preview, target: { ...preview.target, programId: 'another-program' } },
    { ...preview, origin: { ...preview.origin, selection: { kind: 'csr', jobId: 14, sectionNumbers: ['12'] } } },
    { ...preview, origin: { ...preview.origin, kind: 'protocol' } },
  ])('refuses a preview for another target or source selection', invalid => {
    expect(readWorkflowPreview({ success: true, data: invalid }, PID, source)).toBeNull();
  });
  it('does not accept saved sections outside the confirmed source preview', () => {
    expect(readWorkflowImportResult({ success: true, data: { ...created, sections: [{ id: 'other', code: '11.9' }] } }, PID, source, preview)).toBeNull();
  });
  it('keeps workflow machine origin and gaps visible after reopening without claiming human authorship', () => {
    const provenance = describeProvenance({ source: 'import', authorName: 'Importing member', importSource: { ...preview.origin, reason: 'Review source output', warnings: [] } });
    expect(provenance?.line).toContain('CSR source 14'); expect(provenance?.line).not.toContain('Authored');
    render(<ImportSourceNotice source={provenance?.importSource} />);
    expect(screen.getByText(/machine origin · model not recorded/)).toBeTruthy(); expect(screen.getByText('Section 12 was not stored.')).toBeTruthy();
  });
  it('publishes only the confirmed document, program and actual returned section code', () => {
    const onNav = vi.fn(); openImportedDocument(created.doc.id, PID, onNav, 'CSR_11');
    expect(peekEditorTarget()).toMatchObject({ docId: created.doc.id, programId: PID, sectionCode: 'CSR_11', docType: null });
    expect(onNav).toHaveBeenCalledWith('document-authoring');
  });
});

describe('workflow intake keeps the canonical governed reason fields', () => {
  it('applies the same accessible reason bounds to creation and explicit association', async () => {
    apiRequest.mockResolvedValue(ok(preview));
    render(dialog()); await screen.findByTestId('workflow-import-preview');
    const reasonField = screen.getByLabelText('Reason for creating a working copy') as HTMLTextAreaElement;
    const association = screen.getByLabelText('Reason for associating this source with the target project') as HTMLTextAreaElement;
    expect(reasonField.getAttribute('aria-required')).toBe('true');
    expect(association.getAttribute('aria-required')).toBe('true');
    reason(); associate();
    fireEvent.change(association, { target: { value: 'x'.repeat(GOVERNED_REASON_MAX + 1) } });
    const button = screen.getByRole('button', { name: 'Create working copy' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true); fireEvent.click(button);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    associate(); fireEvent.change(reasonField, { target: { value: 'x'.repeat(GOVERNED_REASON_MAX + 1) } });
    expect(button.disabled).toBe(true); fireEvent.click(button);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
