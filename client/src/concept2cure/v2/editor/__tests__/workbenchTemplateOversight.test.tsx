// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AskOrigin } from '../askAnaToDraft';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({
  ...(await original<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { displayName: 'Author', email: 'author@example.test' } }),
}));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
import { DocumentCanvas } from '../DocumentCanvas';
import { DocumentAuthoring } from '../../surfaces/DocumentAuthoring';
import { clearEditorTarget } from '../../editorTarget';
import { oversightPrompt } from '../authoringOversight';
import { readSavedTemplateContext, savedTemplateFacts } from '../savedTemplateContext';

const DOC = 'dddddddd-0000-4000-8000-000000000091';
const SEC = 'aaaaaaaa-0000-4000-8000-000000000091';
const PID = 'bbbbbbbb-0000-4000-8000-000000000091';
const TEMPLATE = 'f05db0b5-caa8-5df2-8b44-33b8d905013a';
const SOURCE = {
  id: TEMPLATE, entryId: 'section:m1.1.1', version: 1,
  sha256: '74350d7b07f5815d82285b5db9491ed074791b56771e3e5118aa157912cecb95',
  kind: 'preparation', aiDraftable: false, authoringMode: 'form', originalFormat: 'pdf',
  limitations: ['Use and retain the original signed form; this preparation worksheet does not replace it.'],
};
const AT = '2026-10-14T10:00:00Z';
const doc = { id: DOC, title: 'Renamed administrative preparation', module: 'M1', status: 'DRAFT',
  updated_at: AT, section_count: 1, template_id: TEMPLATE,
  provenance: { source: 'template', governedWrite: 'unverified', templateSource: SOURCE } };
const section = { id: SEC, doc_id: DOC, code: '1.1.1', title: 'Source and completion checks',
  content: '<p>The sponsor contact is listed in the source record.</p>', order_index: 0, updated_at: AT };
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
type Handoff = { prefill: string; sendOnArrival: boolean; origin: AskOrigin };
const handoff = () => (window as unknown as { C2C_CONVO?: Handoff }).C2C_CONVO;
for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}

beforeEach(() => {
  localStorage.clear();
  window.C2C_PROJECT = { id: PID } as typeof window.C2C_PROJECT;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    if (url.startsWith('/api/authoring/docs?')) return ok({ documents: [doc] });
    if (url.split('?')[0] === `/api/authoring/docs/${DOC}`) return ok({ document: doc });
    if (url.split('?')[0] === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [section] });
    if (url.startsWith('/api/authoring/guidance/')) return ok({ template_guidance: [{ guidance_text: 'Review the source form.', template_source: SOURCE }] });
    if (url.includes('/sources')) return ok({ sources: [] });
    if (url.startsWith('/api/c2c/documents/')) return ok({}, 404);
    return ok({ success: true });
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => {
  cleanup(); localStorage.clear(); vi.unstubAllGlobals(); clearEditorTarget();
  delete window.C2C_PROJECT;
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

async function ready() {
  await screen.findByTestId('template-guidance');
  await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('sponsor contact'));
}
function ask(label: string) {
  fireEvent.click(screen.getByText('Review with AnA'));
  fireEvent.click(screen.getByRole('button', { name: label }));
}
function expectScope(origin?: AskOrigin) {
  expect(origin?.moduleContext).toMatchObject({ documentId: DOC, templateId: TEMPLATE,
    templateSourceState: 'recorded', templateSource: SOURCE });
  expect(JSON.stringify(origin)).not.toContain(section.content);
  expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
  expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  expect(vi.mocked(globalThis.fetch).mock.calls.some(([url]) => String(url).includes('/api/ana-ri/stream'))).toBe(false);
}

describe('saved template facts use the existing editor conversation handoff', () => {
  it.each(['Review document', 'Prepare targeted fixes'])('retains renamed preparation identity in the embedded %s ask', async label => {
    const onAsk = vi.fn();
    render(<DocumentCanvas docId={DOC} programId={PID} conversationId="template-thread" fromThisConversation expanded
      onExpandedChange={vi.fn()} onNav={vi.fn()} onAsk={onAsk} fireToast={vi.fn()} />);
    await ready(); ask(label);
    expectScope(onAsk.mock.calls[0]?.[1]);
    expect(onAsk.mock.calls[0]?.[0]).not.toContain(doc.title);
    expect(onAsk.mock.calls[0]?.[0]).toContain('critique_document');
  });

  it.each(['Review document', 'Prepare targeted fixes'])('prefills the canonical conversation with recorded limits for %s', async label => {
    const onNav = vi.fn();
    render(<DocumentAuthoring onNav={onNav} segment="biotech" surface={{ id: 'document-authoring', label: 'Authoring' } as never} />);
    await ready(); ask(label);
    expect(onNav).toHaveBeenCalledWith('conversation-thread');
    expect(handoff()?.sendOnArrival).toBe(false);
    expectScope(handoff()?.origin);
    expect(handoff()?.prefill).toContain('get_document_template');
  });
});

describe('template identity is recorded rather than inferred from the document name', () => {
  it('uses the existing provenance line to identify the preparation worksheet', async () => {
    render(<DocumentCanvas docId={DOC} programId={PID} conversationId={null} expanded fromThisConversation={false}
      onExpandedChange={vi.fn()} onNav={vi.fn()} onAsk={vi.fn()} fireToast={vi.fn()} />);
    await ready();
    expect(screen.queryByTestId('doc-provenance')?.textContent ?? '').toContain('preparation worksheet');
    expect(screen.queryByTestId('doc-provenance')?.textContent).not.toContain('verified');
  });

  it.each(['mismatched', 'missing'])('keeps %s source metadata unavailable instead of guessing preparation limits', async mode => {
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string) => url.split('?')[0] === `/api/authoring/docs/${DOC}`
      ? Promise.resolve(ok({ document: { ...doc, provenance: mode === 'missing' ? null : {
        source: 'template', templateSource: { ...SOURCE, id: 'aaaaaaaa-0000-4000-8000-000000000099' },
      } } })) : normal(method, url));
    const onAsk = vi.fn();
    render(<DocumentCanvas docId={DOC} programId={PID} conversationId={null} expanded fromThisConversation={false}
      onExpandedChange={vi.fn()} onNav={vi.fn()} onAsk={onAsk} fireToast={vi.fn()} />);
    await ready(); ask('Review document');
    expect(onAsk.mock.calls[0]?.[1]?.moduleContext).toMatchObject({ templateId: TEMPLATE,
      templateSourceState: mode === 'missing' ? 'not-recorded' : 'unavailable' });
    expect(onAsk.mock.calls[0]?.[1]?.moduleContext?.templateSource).toBeUndefined();
    expect(screen.queryByTestId('doc-provenance')).toBeNull();
  });
});

describe('regional filing source stays recorded in the one editor', () => {
  it.each([
    ['US_NDA', 'US', 'FDA'], ['CA_CTA', 'CA', 'Health_Canada'],
    ['EU_CTA', 'EU', 'EMA'], ['JP_CTN', 'JP', 'PMDA'],
  ])('preserves %s scope after the working document is renamed', async (registryId, region, agency) => {
    const templateId = '33333333-2222-4333-8444-000000000003';
    const filingContext = { registryId, region, agency };
    const source = { ...SOURCE, id: templateId, entryId: `registry:${registryId}`,
      authoringMode: 'manual', originalFormat: 'source-dependent', filingContext };
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string) => {
      if (url.split('?')[0] === `/api/authoring/docs/${DOC}`) return Promise.resolve(ok({ document: {
        ...doc, module: null, title: 'Renamed regional working document', template_id: templateId,
        provenance: { source: 'template', templateSource: source },
      } }));
      if (url.startsWith('/api/authoring/guidance/')) return Promise.resolve(ok({ template_guidance: [{
        guidance_text: 'Confirm the current regional source and product applicability.', template_source: source,
      }] }));
      return normal(method, url);
    });
    const onAsk = vi.fn();
    render(<DocumentCanvas docId={DOC} programId={PID} conversationId={null} expanded fromThisConversation={false}
      onExpandedChange={vi.fn()} onNav={vi.fn()} onAsk={onAsk} fireToast={vi.fn()} />);
    await ready(); ask('Review document');
    const context = onAsk.mock.calls[0]?.[1]?.moduleContext;
    expect.soft(context?.templateSource?.filingContext).toEqual(filingContext);
    expect.soft(screen.queryByTestId('doc-provenance')?.textContent ?? '').toContain('regulatory template');
    expect(context?.templateId).toBe(templateId);
    expect(context?.templateSource?.aiDraftable).toBe(false);
    expect(context?.templateSource?.limitations).toEqual(SOURCE.limitations);
    expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  });

  it('marks malformed recorded regional identity unavailable rather than dropping it', async () => {
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string) => url.split('?')[0] === `/api/authoring/docs/${DOC}`
      ? Promise.resolve(ok({ document: { ...doc, provenance: { source: 'template', templateSource: {
        ...SOURCE, filingContext: { registryId: 'CA_CTA', region: 'unknown', agency: 'Health_Canada' },
      } } } })) : normal(method, url));
    const onAsk = vi.fn();
    render(<DocumentCanvas docId={DOC} programId={PID} conversationId={null} expanded fromThisConversation={false}
      onExpandedChange={vi.fn()} onNav={vi.fn()} onAsk={onAsk} fireToast={vi.fn()} />);
    await ready(); ask('Review document');
    expect(onAsk.mock.calls[0]?.[1]?.moduleContext?.templateSourceState).toBe('unavailable');
    expect(onAsk.mock.calls[0]?.[1]?.moduleContext?.templateSource).toBeUndefined();
    expect(screen.queryByTestId('doc-provenance')).toBeNull();
  });
});

describe('template context is scoped to the saved document currently open', () => {
  it('bounds long handoff limits explicitly and points to complete saved-review pages', async () => {
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string) => url.split('?')[0] === `/api/authoring/docs/${DOC}`
      ? Promise.resolve(ok({ document: { ...doc, provenance: { ...doc.provenance,
        templateSource: { ...SOURCE, limitations: ['Long recorded limit. '.repeat(1000)] },
      } } })) : normal(method, url));
    const onAsk = vi.fn();
    render(<DocumentCanvas docId={DOC} programId={PID} conversationId={null} expanded fromThisConversation={false}
      onExpandedChange={vi.fn()} onNav={vi.fn()} onAsk={onAsk} fireToast={vi.fn()} />);
    await ready(); ask('Review document');
    const context = onAsk.mock.calls[0]?.[1]?.moduleContext;
    expect(context?.templateSourceState).toBe('recorded');
    expect(context?.templateSource).toMatchObject({ id: TEMPLATE, aiDraftable: false,
      limitationsOmitted: true, limitationCount: 1 });
    expect(context?.templateSource.instruction).toContain('critique_document');
    expect(JSON.stringify(context).length).toBeLessThan(3000);
    expect(context?.templateSource.limitations).toBeUndefined();
  });

  it('does not carry late prior-document metadata into another document ask', async () => {
    const second = 'dddddddd-0000-4000-8000-000000000092';
    const secondSection = 'aaaaaaaa-0000-4000-8000-000000000092';
    const normal = apiRequest.getMockImplementation()!;
    let reads = 0;
    let resolvePrior!: (value: Response) => void;
    const prior = new Promise<Response>(resolve => { resolvePrior = resolve; });
    apiRequest.mockImplementation((method: string, url: string) => {
      if (url.split('?')[0] === `/api/authoring/docs/${DOC}` && ++reads > 1) return prior;
      if (url.split('?')[0] === `/api/authoring/docs/${second}`) return Promise.resolve(ok({ document: {
        ...doc, id: second, title: 'Second saved document', template_id: null, provenance: null,
      } }));
      if (url.split('?')[0] === `/api/authoring/docs/${second}/sections`) return Promise.resolve(ok({ sections: [{
        ...section, id: secondSection, doc_id: second, content: '<p>The second saved document is open.</p>',
      }] }));
      return normal(method, url);
    });
    const onAsk = vi.fn();
    const props = { programId: PID, conversationId: null, expanded: true, fromThisConversation: false,
      onExpandedChange: vi.fn(), onNav: vi.fn(), onAsk, fireToast: vi.fn() };
    const view = render(<DocumentCanvas {...props} docId={DOC} />);
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('sponsor contact'));
    view.rerender(<DocumentCanvas {...props} docId={second} />);
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('second saved document'));
    await act(async () => { resolvePrior(ok({ document: doc })); await prior; });
    ask('Review document');
    const context = onAsk.mock.calls[0]?.[1]?.moduleContext;
    expect(context?.documentId).toBe(second);
    expect(context?.templateSource).toBeUndefined();
    expect(JSON.stringify(context)).not.toContain(TEMPLATE);
    expect(document.querySelectorAll('.tiptap')).toHaveLength(1);
  });
});

describe('fixed oversight instructions preserve template authority', () => {
  it.each(['section', 'document', 'evidence', 'fixes'] as const)('%s reads saved template limits before proposing changes', action => {
    const prompt = oversightPrompt(action);
    expect(prompt).toContain('critique_document');
    expect(prompt).toContain('get_document_template');
    expect(prompt).toContain('aiDraftable');
    expect(prompt).toContain('filingContext');
    expect(prompt).toContain('original');
    expect(prompt).toContain('read_authoring_section');
    expect(prompt).toContain('do not save, accept, approve or file');
  });
});

describe('saved source metadata availability is explicit', () => {
  it.each(['partial', 'unavailable'])('keeps %s metadata unknown through the actual embedded conversation handoff', async mode => {
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string) => url.split('?')[0] === `/api/authoring/docs/${DOC}`
      ? Promise.resolve(ok({ document: { ...doc, readScope: mode === 'partial' ? 'sections' : 'document',
        sourceMetadataState: mode === 'partial' ? 'available' : 'unavailable',
        provenance: { ...doc.provenance, projectSourceReferences: [{ sectionCode: '1.1.1',
          figures: { checked: 1, found: 1 }, claims: { compared: 1, conflicts: 0 } }] },
      } })) : normal(method, url));
    const onAsk = vi.fn();
    render(<DocumentCanvas docId={DOC} programId={PID} conversationId={null} expanded fromThisConversation
      onExpandedChange={vi.fn()} onNav={vi.fn()} onAsk={onAsk} fireToast={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('sponsor contact'));
    ask('Review document');
    expect(onAsk.mock.calls[0]?.[1]?.moduleContext).toMatchObject({ documentId: DOC, templateId: null,
      templateSourceState: 'unavailable', ...(mode === 'partial' ? { readScope: 'sections' } : {}) });
    for (const testId of ['dc-provenance', 'doc-provenance', 'template-guidance', 'doc-figure-check', 'doc-claims-check'])
      expect(screen.queryByTestId(testId)).toBeNull();
    expect(JSON.stringify(onAsk.mock.calls[0]?.[1])).not.toContain(TEMPLATE);
    expect(apiRequest.mock.calls.some(([,url]) => String(url).startsWith('/api/authoring/guidance/'))).toBe(false);
  });
  it.each(['available', 'unavailable'])('partial + %s suppresses whole-document template facts', sourceMetadataState => {
    const context = readSavedTemplateContext(DOC, { ...doc, readScope: 'sections', sourceMetadataState });
    expect(context).toEqual({ documentId: DOC, templateId: null, templateSourceState: 'unavailable' });
    expect(savedTemplateFacts(context, DOC)).toEqual({ templateId: null, templateSourceState: 'unavailable' });
  });
  it('full but unavailable metadata is unknown, rather than no recorded source', () => {
    expect(readSavedTemplateContext(DOC, { template_id: TEMPLATE, readScope: 'document', sourceMetadataState: 'unavailable' }))
      .toEqual({ documentId: DOC, templateId: null, templateSourceState: 'unavailable' });
  });
  it('full available null provenance remains a positive no-recorded-source result', () => {
    expect(readSavedTemplateContext(DOC, { template_id: TEMPLATE, provenance: null,
      readScope: 'document', sourceMetadataState: 'available' }))
      .toEqual({ documentId: DOC, templateId: TEMPLATE, templateSourceState: 'not-recorded' });
  });
  it('missing availability flags retains the legacy recorded source', () => {
    expect(readSavedTemplateContext(DOC, doc)).toMatchObject({ templateId: TEMPLATE,
      templateSourceState: 'recorded', templateSource: SOURCE });
  });
});
