// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssemblyPlan, AssemblyPreviewInput, AssemblySection } from '@shared/authoring/assembly';
import type { AssemblySourceManifest, AssemblySourceSelector } from '@shared/authoring/assembly-sources';
const apiRequest = vi.hoisted(() => vi.fn());
const actor = vi.hoisted(() => ({ revision: 0 }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({ authService: {
  getUser: () => ({ id: '7', organizationId: '12' }), on: () => () => undefined,
  captureSessionReadGuard: () => { const revision = actor.revision; return { sameRevision: () => actor.revision === revision }; },
} }));
import { useAuthoringAssemblyBuild } from '../useAuthoringAssemblyBuild';
import { readAssemblyPlan, readAssemblyCommit } from '../assemblyBuildTransport';
import { publishShellProject } from '../../shellProject';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOC = '33333333-3333-4333-8333-333333333333';
const SECTION = '44444444-4444-4444-8444-444444444444';
const VAULT = '55555555-5555-4555-8555-555555555555';
const selectors: AssemblySourceSelector[] = [{ kind: 'data-room', sourceId: 41 }, { kind: 'vault', documentId: VAULT, expectedChecksum: 'a'.repeat(64) }];
const manifest = (sources = selectors): AssemblySourceManifest => ({ version: 1, programId: PROGRAM, fingerprint: 'f'.repeat(64), limitations: ['Bounded excerpts only; no full-file review.'], entries: sources.map(source => ({ source, title: `Recorded ${source.kind} source`, contentHash: 'a'.repeat(64), extractedTextSha256: 'b'.repeat(64), version: 'v2', originalFileAvailable: false, disposition: 'current', span: { start: 10, end: 60, totalChars: 100, sha256: 'c'.repeat(64) } })) });
const section: AssemblySection = { id: SECTION, doc_id: DOC, code: '3.2.S.1', title: 'Scientific summary', content: '', order_index: 0, updated_at: null };
const plan = (input: AssemblyPreviewInput): AssemblyPlan => ({ version: 1, docId: DOC, programId: PROGRAM, templateId: 'template', selection: input.selection, targetSnapshot: 'target', templateSnapshot: 'template', fingerprint: 'build', templateName: 'Scientific outline', draftRegion: 'FDA', limitations: [], gaps: [], ...(input.sources ? { sources: manifest(input.sources) } : {}), rows: [{ code: section.code, title: section.title, content: '', ordering: 0, disposition: 'append', aiDraftable: true, aiDraftableReason: 'Narrative', gaps: [] }] });
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function mount() { return renderHook(() => useAuthoringAssemblyBuild({ docId: DOC, programId: PROGRAM, docSealed: false, editorDirty: false, onStructureBuilt: vi.fn(), onReviewSection: vi.fn() })); }
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
async function preview(view: ReturnType<typeof mount>) {
  await act(async () => { await view.result.current.loadTemplates(); await view.result.current.chooseTemplate('template'); await view.result.current.preview(); });
}
beforeEach(() => {
  actor.revision = 0; publishShellProject({ id: PROGRAM });
  apiRequest.mockReset().mockImplementation(async (_method: string, path: string, input: AssemblyPreviewInput) => {
    if (path === '/api/authoring/templates') return reply({ success: true, templates: [{ id: 'template', name: 'Scientific outline' }] });
    if (path.endsWith('/assembly/preview')) return reply({ success: true, data: plan(input) });
    if (path.endsWith('/assembly/commit')) return reply({ success: true, data: { docId: DOC, programId: PROGRAM, plan: plan(input), sections: [section] } });
    if (path.includes('/docs?')) return reply({ success: true, documents: [{ id: DOC, program_id: PROGRAM }] });
    if (new URL(path, 'http://localhost').pathname === `/api/authoring/docs/${DOC}`) return reply({ success: true, document: { id: DOC } });
    if (new URL(path, 'http://localhost').pathname.endsWith('/sections')) return reply({ success: true, sections: [section] });
    if (path.endsWith('/ai/draft')) return reply({ success: true, draft: { content: 'Retained candidate', draftId: 'candidate' } });
    throw new Error(`Unexpected request ${path}`);
  });
});
afterEach(cleanup);
describe('explicit selected-source assembly', () => {
  it('adopts exact selectors without a write and carries them through preview and deterministic build', async () => {
    const view = mount(); act(() => { expect(view.result.current.adoptSources(selectors)).toBe(true); });
    expect(apiRequest).not.toHaveBeenCalled(); expect(view.result.current.disclosureRequest).toBe(1);
    await preview(view); act(() => view.result.current.setReason('Assemble the selected sources.'));
    await act(async () => { await view.result.current.build(); });
    const requests = apiRequest.mock.calls.filter(call => String(call[1]).includes('/assembly/'));
    expect(requests.every(call => JSON.stringify(call[2].sources) === JSON.stringify(selectors))).toBe(true);
    expect(view.result.current.receipt?.plan.sources).toEqual(manifest());
    expect(apiRequest.mock.calls.some(call => String(call[1]).includes('/ai/'))).toBe(false);
  });
  it('pins the exact verified manifest to queue and review requests', async () => {
    const view = mount(); act(() => view.result.current.adoptSources(selectors)); await preview(view);
    act(() => { view.result.current.setReason('Prepare selected source candidate.'); view.result.current.setWithAna(true); });
    await act(async () => { await view.result.current.build(); });
    expect(apiRequest.mock.calls.find(call => String(call[1]).endsWith('/ai/draft'))?.[2].sources).toEqual(manifest());
    expect(view.result.current.reviewSessions[SECTION].sources).toEqual(manifest());
  });
  it('invalidates old previews and keeps reviewed text separate after a source change', async () => {
    const view = mount(); act(() => view.result.current.adoptSources(selectors)); await preview(view);
    act(() => { view.result.current.setReason('Prepare selected source candidate.'); view.result.current.setWithAna(true); });
    await act(async () => { await view.result.current.build(); });
    act(() => { const session = view.result.current.reviewSessions[SECTION]; session.update({ ...session.state, body: 'Reviewed source-specific wording', changeReason: 'Original source review' }); });
    act(() => view.result.current.adoptSources([{ kind: 'data-room', sourceId: 42 }]));
    expect(view.result.current.plan).toBeNull(); expect(view.result.current.reviewSessions[SECTION]).toBeUndefined();
    expect(view.result.current.slots[0].review).toMatchObject({ body: 'Reviewed source-specific wording', changeReason: 'Original source review' });
    await act(async () => { await view.result.current.retryDrafts(); });
    expect(apiRequest.mock.calls.filter(call => String(call[1]).endsWith('/ai/draft'))).toHaveLength(1);
  });
  it('preserves the known-document unknown-write hold across a changed selection', async () => {
    const view = mount(); act(() => view.result.current.adoptSources(selectors)); await preview(view);
    act(() => view.result.current.setReason('Assemble selected source references.'));
    apiRequest.mockRejectedValueOnce(new Error('Commit response lost'));
    await act(async () => { await view.result.current.build(); });
    act(() => view.result.current.adoptSources([{ kind: 'data-room', sourceId: 42 }]));
    await act(async () => { await view.result.current.build(); await view.result.current.preview(); });
    expect(view.result.current.phase).toBe('unknown');
    expect(apiRequest.mock.calls.filter(call => String(call[1]).endsWith('/assembly/commit'))).toHaveLength(1);
    await act(async () => { await view.result.current.check(); });
    expect(view.result.current.sourceSelection).toEqual([{ kind: 'data-room', sourceId: 42 }]);
    expect(view.result.current.phase).toBe('checked');
  });
  it('does not adopt a late generated candidate after selected sources change', async () => {
    const view = mount(); act(() => view.result.current.adoptSources(selectors)); await preview(view);
    act(() => { view.result.current.setReason('Prepare selected source candidate.'); view.result.current.setWithAna(true); });
    const pending = deferred<Response>(); const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, path: string, input: unknown) => path.endsWith('/ai/draft') ? pending.promise : base(method, path, input));
    let operation!: Promise<void>; act(() => { operation = view.result.current.build(); });
    await waitFor(() => expect(apiRequest.mock.calls.some(call => String(call[1]).endsWith('/ai/draft'))).toBe(true));
    act(() => view.result.current.adoptSources([{ kind: 'data-room', sourceId: 42 }]));
    await act(async () => { pending.resolve(reply({ success: true, draft: { content: 'Old source candidate', draftId: 'old' } })); await operation; });
    expect(view.result.current.reviewSessions[SECTION]).toBeUndefined();
    expect(view.result.current.slots[0].review.draft).toBeNull();
  });
});
describe('exact selected-source runtime receipts', () => {
  const input: AssemblyPreviewInput = { programId: PROGRAM, templateId: 'template', selection: { target: 'document' }, sources: selectors };
  it.each([
    ['missing manifest', () => undefined],
    ['other project', () => ({ ...manifest(), programId: VAULT })],
    ['missing selected source', () => ({ ...manifest(), entries: manifest().entries.slice(0, 1) })],
    ['changed source order', () => ({ ...manifest(), entries: [...manifest().entries].reverse() })],
    ['oversized excerpt', () => ({ ...manifest(), entries: manifest().entries.map(entry => ({ ...entry, span: { ...entry.span, start: 0, end: 8001, totalChars: 9000 } })) })],
    ['invalid extraction identity', () => ({ ...manifest(), entries: manifest().entries.map(entry => ({ ...entry, extractedTextSha256: 'unknown' })) })],
  ])('refuses %s rather than using broad or partial sources', (_name, invalid) => {
    expect(readAssemblyPlan({ ...plan(input), sources: invalid() }, DOC, input)).toBeNull();
  });
  it('refuses a changed exact manifest in an affirmative commit receipt', () => {
    const previewed = plan(input); const changed = { ...manifest(), fingerprint: 'e'.repeat(64) };
    const receipt = { docId: DOC, programId: PROGRAM, plan: { ...previewed, sources: changed }, sections: [section] };
    expect(readAssemblyCommit(receipt, DOC, input, previewed.fingerprint, previewed.sources)).toBeNull();
  });
});
