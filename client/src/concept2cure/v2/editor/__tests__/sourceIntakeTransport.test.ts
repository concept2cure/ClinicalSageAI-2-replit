// @vitest-environment jsdom
/** Canonical receipt and intake transports; all HTTP remains synthetic. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringSourceImportData, AuthoringSourceImportPreviewData, BinaryImportOrigin, WorkflowImportOrigin, WorkflowImportSource } from '@shared/authoring/source-import';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { ApiRequestError } from '@/lib/queryClient';
import { createBinaryImport, createWorkflowImport, inspectSourceImport, previewWorkflowImport, readSourceImportResult,
  readWorkflowImportResult, type SourceIntakeRequest } from '../../authoringHandoff';

const PROGRAM = '11111111-1111-4111-8111-111111111791';
const DOC = '22222222-2222-4222-8222-222222222791';
const SECTION = '33333333-3333-4333-8333-333333333791';
const HASH = 'a'.repeat(64);
const source: WorkflowImportSource = { kind: 'csr', jobId: 44, sectionNumbers: ['11'] };
const origin: WorkflowImportOrigin = { kind: 'csr', id: '44', programId: PROGRAM, title: 'Saved CSR',
  documentType: null, sectionCode: null, fingerprint: HASH, selection: source, gaps: [], version: '1',
  conversion: 'ich-e3-sections', sourceScope: { level: 'project', programId: null, projectId: 42 },
  association: { mode: 'recorded', reason: null }, sectionOrigins: [{ code: '11.1', sourceRowId: 'csr_section_outputs:17',
    contentSha256: HASH, originalAuthorship: 'unknown', model: null, modelEvidence: 'unrecorded' }] };
const preview: AuthoringSourceImportPreviewData = { preview: true, origin, fingerprint: HASH,
  sections: [{ code: '11.1', title: 'Efficacy', contentSha256: HASH }], gaps: [], warnings: [],
  target: { programId: PROGRAM, projectId: 42 }, association: { mode: 'recorded', required: false,
    reasonRequired: false, sourceProgramId: null, sourceProjectId: 42, targetProgramId: PROGRAM } };
function copy(): AuthoringSourceImportData {
  return { doc: { id: DOC, title: 'Saved CSR working copy', tenant_id: 7, client_program_id: PROGRAM, created_by: '3',
    provenance: { source: 'import', importSource: origin } }, sections: [{ id: SECTION, doc_id: DOC,
    tenant_id: 7, code: '11.1', title: 'Efficacy', content: '<p>Saved observations.</p>', order_index: 0 }],
    origin, warnings: [], reused: false };
}
const read = (data: AuthoringSourceImportData) => readWorkflowImportResult({ success: true, data }, PROGRAM, source, preview);
beforeEach(() => { apiRequest.mockReset(); });

describe('fresh source intake receipts require actual saved row identity', () => {
  it('retains a valid exact saved document and section receipt', () => {
    const data = copy(); expect(read(data)).toBe(data);
  });
  it.each(['document-id', 'section-id', 'missing-program', 'missing-tenant', 'section-parent', 'section-tenant', 'content', 'order', 'provenance'] as const)('refuses malformed fresh %s instead of offering an unrelated or incomplete working copy', field => {
      const data = copy();
      if (field === 'document-id') data.doc.id = 'not-a-document-uuid';
      if (field === 'section-id') data.sections[0].id = 'not-a-section-uuid';
      if (field === 'missing-program') delete data.doc.client_program_id;
      if (field === 'missing-tenant') delete data.doc.tenant_id;
      if (field === 'section-parent') data.sections[0].doc_id = '44444444-4444-4444-8444-444444444791';
      if (field === 'section-tenant') data.sections[0].tenant_id = 8;
      if (field === 'content') data.sections[0].content = { unavailable: true };
      if (field === 'order') data.sections[0].order_index = 0.5;
      if (field === 'provenance') delete data.doc.provenance;
      expect(read(data)).toBeNull();
    });
});

const binary = { kind: 'data-room' as const, sourceId: 42 };
const binaryOrigin: BinaryImportOrigin = { kind: 'data-room', id: '42', programId: PROGRAM, title: 'Saved laboratory report',
  fileName: 'report.pdf', mimeType: 'application/pdf', sha256: HASH, documentType: null, sectionCode: null, conversion: 'extracted-text' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const success = (data: unknown) => response({ success: true, data }, 201);
const request = (current: () => boolean = () => true): SourceIntakeRequest => ({ actor: { userId: 3, organizationId: 7 },
  headers: { Authorization: 'Bearer captured-intake-actor', 'x-organization-id': '7' }, current });
const clonePreview = (): AuthoringSourceImportPreviewData => JSON.parse(JSON.stringify(preview)) as AuthoringSourceImportPreviewData;
function binaryCopy(): AuthoringSourceImportData {
  const data = copy(); data.origin = binaryOrigin;
  data.doc.provenance = { source: 'import', importSource: { ...binaryOrigin, warnings: [], reason: 'Review the saved report' } };
  return data;
}
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; }
const unknown = (recovery: unknown = { documentId: DOC, organizationId: 7, programId: PROGRAM }) => ({ success: false, ok: false,
  code: 'AUTHORING_CREATE_COMMIT_UNCONFIRMED', creationOutcome: 'unconfirmed', retryAllowed: false, recovery });
const recovery = { documentId: DOC, organizationId: 7, programId: PROGRAM, creationOutcome: 'unconfirmed' as const };
function wholeCopy(workflow = false) {
  const data = workflow ? copy() : binaryCopy();
  data.doc.readScope = 'document'; data.doc.sourceMetadataState = 'available';
  if (workflow) data.doc.provenance = { source: 'import', importSource: { ...origin, warnings: [], reason: 'Review the saved CSR' } };
  return data;
}
function installReads(data = wholeCopy(), options: { inventory?: unknown; detail?: unknown; sections?: unknown } = {}) {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method !== 'GET') throw new Error('Inspection cannot issue a write');
    const url = new URL(path, 'http://localhost');
    if (url.pathname === '/api/authoring/docs') return response(options.inventory ?? { success: true,
      documents: [{ id: DOC, title: data.doc.title, program_id: PROGRAM, readScope: 'document' }] });
    if (url.pathname === `/api/authoring/docs/${DOC}`) return response(options.detail ?? { success: true, document: data.doc });
    if (url.pathname === `/api/authoring/docs/${DOC}/sections`) return response(options.sections ?? { success: true, sections: data.sections, readScope: 'document' });
    throw new Error(`Unexpected read: ${path}`);
  });
}

describe('binary receipts share the canonical strict saved-copy decoder', () => {
  it('admits actual Data Room and Vault source versions', () => {
    const data = binaryCopy(); expect(readSourceImportResult({ success: true, data }, PROGRAM, binary)).toBe(data);
    const vault = { kind: 'vault' as const, documentId: '55555555-5555-4555-8555-555555555791' };
    data.origin = { ...binaryOrigin, kind: 'vault', id: vault.documentId };
    data.doc.provenance = { source: 'import', importSource: data.origin };
    expect(readSourceImportResult({ success: true, data }, PROGRAM, vault)).toBe(data);
  });
  it.each([false, true])('retains an empty edited copy only as an authenticated reused structure (workflow %s)', workflow => {
    const data = workflow ? copy() : binaryCopy(); data.sections = [];
    const decode = () => workflow ? read(data) : readSourceImportResult({ success: true, data }, PROGRAM, binary);
    expect(decode()).toBeNull();
    data.reused = true; expect(decode()).toBe(data); expect(decode()?.sections).toEqual([]);
  });
  it.each(['nonuuid', 'parent', 'tenant', 'duplicate', 'code', 'content', 'order', 'provenance', 'version'] as const)('rejects a binary %s receipt without accepting the title as identity', problem => {
    const data = binaryCopy();
    if (problem === 'nonuuid') data.doc.id = 'a-title';
    if (problem === 'parent') data.sections[0].doc_id = '55555555-5555-4555-8555-555555555791';
    if (problem === 'tenant') data.sections[0].tenant_id = 8;
    if (problem === 'duplicate') data.sections.push({ ...data.sections[0] });
    if (problem === 'code') data.sections[0].code = ' ';
    if (problem === 'content') delete data.sections[0].content;
    if (problem === 'order') data.sections[0].order_index = Number.MAX_SAFE_INTEGER + 1;
    if (problem === 'provenance') delete data.doc.provenance;
    if (problem === 'version') data.doc.provenance = { source: 'import', importSource: { ...binaryOrigin, sha256: 'b'.repeat(64) } };
    expect(readSourceImportResult({ success: true, data }, PROGRAM, binary)).toBeNull();
  });
});

describe('one existing source import transport pins actor, selection and preview', () => {
  it('uses the existing POST with captured actor headers for a binary source', async () => {
    apiRequest.mockResolvedValue(success(binaryCopy())); const transport = request();
    const reply = await createBinaryImport(PROGRAM, binary, 'Review the saved report', transport);
    expect(reply.ok).toBe(true);
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith('POST', '/api/authoring/import/source',
      { programId: PROGRAM, source: binary, reason: 'Review the saved report' }, transport.headers);
  });
  it('previews without a write and creates only the exact retained workflow fingerprint', async () => {
    apiRequest.mockResolvedValueOnce(success(preview)).mockResolvedValueOnce(success(copy())); const transport = request();
    expect((await previewWorkflowImport(PROGRAM, source, transport)).ok).toBe(true);
    expect((await createWorkflowImport(PROGRAM, source, preview, 'Review the saved CSR', { request: transport })).ok).toBe(true);
    expect(apiRequest.mock.calls[0][2]).toEqual({ programId: PROGRAM, source, previewOnly: true });
    expect(apiRequest.mock.calls[1][2]).toEqual({ programId: PROGRAM, source, expectedFingerprint: HASH, reason: 'Review the saved CSR' });
    expect(apiRequest.mock.calls.every(call => call[3].Authorization === transport.headers.Authorization)).toBe(true);
  });
  it('snapshots headers, actor and source/preview objects before the first await', async () => {
    const pending = deferred<Response>(); apiRequest.mockReturnValue(pending.promise);
    const transport = request(); const selected: WorkflowImportSource = { kind: 'csr', jobId: 44, sectionNumbers: ['11'] }; const expected = clonePreview();
    const reply = createWorkflowImport(PROGRAM, selected, expected, 'Review the saved CSR', { request: transport });
    transport.headers.Authorization = 'Bearer replacement'; transport.actor.organizationId = 8; transport.actor.userId = 4;
    selected.sectionNumbers?.push('12'); expected.fingerprint = 'b'.repeat(64); expected.sections[0].code = 'changed';
    pending.resolve(success(copy())); expect((await reply).ok).toBe(true);
    expect(apiRequest.mock.calls[0][2].source).toEqual(source);
    expect(apiRequest.mock.calls[0][3]).toEqual(request().headers);
  });
  it.each(['organization', 'actor'])('refuses a well-shaped receipt from another captured %s', async field => {
    const data = binaryCopy();
    if (field === 'organization') { data.doc.tenant_id = 8; data.sections[0].tenant_id = 8; }
    else data.doc.created_by = 4;
    apiRequest.mockResolvedValue(success(data));
    expect(await createBinaryImport(PROGRAM, binary, 'Review the saved report', request())).toMatchObject({ ok: false, phase: 'unknown' });
  });
  it('does not dispatch with missing captured headers or a retired owner', async () => {
    const missing = request(); missing.headers = {};
    expect((await createBinaryImport(PROGRAM, binary, 'Review the report', missing)).ok).toBe(false);
    expect((await createBinaryImport(PROGRAM, binary, 'Review the report', request(() => false))).ok).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('cannot use the binary create path for a workflow without its preview', async () => {
    expect(await createBinaryImport(PROGRAM, source, 'Review the report', request())).toMatchObject({ ok: false, phase: 'refused' });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('create uncertainty never becomes permission to repeat a write', () => {
  it.each([[400, 'refused'], [403, 'refused'], [408, 'unknown'], [500, 'unknown'], [503, 'unknown'], [201, 'unknown']] as const)('classifies HTTP %i with an invalid receipt as %s', async (status, phase) => {
    apiRequest.mockResolvedValue(response({ success: false, message: 'The source could not be verified.' }, status));
    expect(await createBinaryImport(PROGRAM, binary, 'Review the report', request())).toMatchObject({ ok: false, phase });
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it('holds a lost response without another import write', async () => {
    apiRequest.mockRejectedValue(new Error('Lost after dispatch'));
    expect(await createBinaryImport(PROGRAM, binary, 'Review the report', request())).toMatchObject({ ok: false, phase: 'unknown' });
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it.each(['response', 'exception'])('preserves typed recovery in a %s envelope', async kind => {
    if (kind === 'response') apiRequest.mockResolvedValue(response(unknown(), 503));
    else apiRequest.mockRejectedValue(new ApiRequestError('Unconfirmed', 503, unknown()));
    expect(await createBinaryImport(PROGRAM, binary, 'Review the report', request())).toMatchObject({ ok: false, phase: 'unknown', identifiedOutcome: true, recovery });
  });
  it.each(['organization', 'project', 'uuid', 'absent'])('holds recognized outcomes with malformed %s identity', async kind => {
    const identity = { ...recovery };
    if (kind === 'organization') identity.organizationId = 8;
    if (kind === 'project') identity.programId = '11111111-1111-4111-8111-111111111792';
    if (kind === 'uuid') identity.documentId = 'not-a-uuid';
    apiRequest.mockResolvedValue(response(unknown(kind === 'absent' ? null : identity), 503));
    const reply = await createBinaryImport(PROGRAM, binary, 'Review the report', request());
    expect(reply).toMatchObject({ ok: false, phase: 'unknown', identifiedOutcome: true }); expect('recovery' in reply).toBe(false);
  });
  it('holds a typed ApiRequestError code even when its payload has been lost', async () => {
    apiRequest.mockRejectedValue(new ApiRequestError('Unconfirmed', 503, undefined, 'AUTHORING_CREATE_COMMIT_UNCONFIRMED'));
    expect(await createBinaryImport(PROGRAM, binary, 'Review the report', request())).toMatchObject({ ok: false, phase: 'unknown', identifiedOutcome: true });
  });
  it.each(['network', 'server', 'malformed'])('leaves a %s preview read retryable', async kind => {
    if (kind === 'network') apiRequest.mockRejectedValue(new Error('Unavailable'));
    else apiRequest.mockResolvedValue(response({ success: false }, kind === 'server' ? 503 : 200));
    expect(await previewWorkflowImport(PROGRAM, source, request())).toMatchObject({ ok: false, phase: 'refused' });
    expect(apiRequest.mock.calls[0][2].previewOnly).toBe(true);
  });
});

describe('retired transport owners stop before response-body and state delivery', () => {
  it('does not read a body after retirement at the response await', async () => {
    let current = true; const pending = deferred<Response>(); const json = vi.fn(); apiRequest.mockReturnValue(pending.promise);
    const reply = createBinaryImport(PROGRAM, binary, 'Review the report', request(() => current));
    current = false; pending.resolve({ ok: true, status: 201, json } as unknown as Response);
    expect(await reply).toMatchObject({ ok: false, phase: 'stale' }); expect(json).not.toHaveBeenCalled();
  });
  it('rejects retirement while a successful body is being decoded', async () => {
    let current = true; const body = deferred<unknown>(); const json = vi.fn(() => body.promise);
    apiRequest.mockResolvedValue({ ok: true, status: 201, json });
    const reply = createBinaryImport(PROGRAM, binary, 'Review the report', request(() => current));
    await vi.waitFor(() => expect(json).toHaveBeenCalledTimes(1)); current = false; body.resolve({ success: true, data: binaryCopy() });
    expect(await reply).toMatchObject({ ok: false, phase: 'stale' });
  });
});

describe('explicit read-only source import inspection', () => {
  it('returns only scoped inventory for generic uncertainty, even if a title and source appear to match', async () => {
    installReads(); const reply = await inspectSourceImport(PROGRAM, binary, {}, request());
    expect(reply).toEqual({ ok: true, inventory: [{ id: DOC, title: 'Saved CSR working copy' }] });
    expect(apiRequest).toHaveBeenCalledTimes(1); expect(apiRequest.mock.calls[0][0]).toBe('GET');
  });
  it.each(['binary', 'workflow'])('restores the exact identified %s copy through three scoped GETs only', async kind => {
    const workflow = kind === 'workflow'; const data = wholeCopy(workflow);
    data.sections[0].code = 'reviewed.efficacy'; data.sections[0].content = '<p>Human reviewed text.</p>';
    installReads(data); const transport = request();
    const reply = await inspectSourceImport(PROGRAM, workflow ? source : binary, { recovery, preview: workflow ? preview : undefined }, transport);
    expect(reply.ok && reply.data?.sections[0].code).toBe('reviewed.efficacy');
    expect(reply.ok && reply.data?.reused).toBe(true); expect(apiRequest).toHaveBeenCalledTimes(3);
    for (const [method, path, , headers] of apiRequest.mock.calls) {
      expect(method).toBe('GET'); expect(new URL(path, 'http://localhost').searchParams.get('programId')).toBe(PROGRAM);
      expect(headers).toEqual(transport.headers);
    }
  });
  it.each(['foreign-program', 'duplicate', 'nonuuid', 'missing-scope'])('rejects a %s inventory before reading an exact document', async kind => {
    const row: Record<string, unknown> = { id: DOC, title: 'Saved evidence', program_id: PROGRAM, readScope: 'document' };
    if (kind === 'foreign-program') row.program_id = '11111111-1111-4111-8111-111111111792';
    if (kind === 'nonuuid') row.id = 'not-a-uuid'; if (kind === 'missing-scope') delete row.readScope;
    installReads(wholeCopy(), { inventory: { success: true, documents: kind === 'duplicate' ? [row, { ...row }] : [row] } });
    expect(await inspectSourceImport(PROGRAM, binary, { recovery }, request())).toMatchObject({ ok: false, phase: 'refused' });
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it.each(['section-only', 'metadata', 'tenant', 'actor', 'provenance', 'section-parent', 'section-scope'])('refuses exact readback with changed %s', async kind => {
    const data = wholeCopy();
    if (kind === 'section-only') data.doc.readScope = 'sections';
    if (kind === 'metadata') data.doc.sourceMetadataState = 'unavailable';
    if (kind === 'tenant') { data.doc.tenant_id = 8; data.sections[0].tenant_id = 8; }
    if (kind === 'actor') data.doc.created_by = 4;
    if (kind === 'provenance') data.doc.provenance = { source: 'import', importSource: { ...binaryOrigin, id: '43' } };
    if (kind === 'section-parent') data.sections[0].doc_id = '55555555-5555-4555-8555-555555555791';
    installReads(data, kind === 'section-scope' ? { sections: { success: true, sections: data.sections, readScope: 'sections' } } : {});
    const reply = await inspectSourceImport(PROGRAM, binary, { recovery }, request());
    expect(reply).toMatchObject({ ok: false, phase: 'refused' }); expect('data' in reply).toBe(false);
  });
  it('does not fall back to generic inventory for a recognized malformed identity', async () => {
    expect(await inspectSourceImport(PROGRAM, binary, { identifiedOutcome: true }, request())).toMatchObject({ ok: false, phase: 'unknown', identifiedOutcome: true });
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('requires the retained workflow fingerprint during recovery and preserves edited structure when it matches', async () => {
    installReads(wholeCopy(true)); const changed = clonePreview(); changed.fingerprint = 'b'.repeat(64); changed.origin.fingerprint = changed.fingerprint;
    const reply = await inspectSourceImport(PROGRAM, source, { recovery, preview: changed }, request());
    expect(reply.ok).toBe(false); expect('data' in reply).toBe(false);
  });
  it.each([0, 1, 2])('checks the captured owner after recovery read hop %i without dispatching later hops', async hop => {
    let current = true; let reads = 0; const data = wholeCopy();
    apiRequest.mockImplementation(async (_method: string, path: string) => {
      const index = reads++; const url = new URL(path, 'http://localhost');
      const body = url.pathname === '/api/authoring/docs' ? { success: true, documents: [{ id: DOC, title: data.doc.title, program_id: PROGRAM, readScope: 'document' }] }
        : url.pathname.endsWith('/sections') ? { success: true, sections: data.sections, readScope: 'document' } : { success: true, document: data.doc };
      return { ok: true, status: 200, json: async () => { if (index === hop) current = false; return body; } };
    });
    expect(await inspectSourceImport(PROGRAM, binary, { recovery }, request(() => current))).toMatchObject({ ok: false, phase: 'stale' });
    expect(apiRequest).toHaveBeenCalledTimes(hop + 1);
  });
});
