// @vitest-environment jsdom
/**
 * RAG-grounded AI section drafting — the accept path and its honesty seams.
 *
 * `POST /sections/:id/ai/draft` and `…/ai/draft/accept` shipped built, tested
 * and callerless. The accept endpoint is the ONLY path in the product that
 * records span-level source lineage for generated text; everything else saves
 * through PATCH, which can only assert author-original. So the UI that reaches
 * it has to get four things right, and each of them is a case where the
 * comfortable rendering is the dishonest one:
 *
 *   1. the hardcoded-template fallback is not a draft and cannot be accepted;
 *   2. a retrieval OUTAGE and an empty corpus are opposite facts;
 *   3. a draft with no parked candidate cannot carry citations at all;
 *   4. an edited draft is no longer the model's words.
 *
 * Plus the two refusals that must survive longer than a toast: the single-use
 * 410 and the fail-closed LINEAGE_REQUIRED rollback.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'ra@example.test', displayName: 'R. Author' } }),
}));

/* jsdom has no layout; ProseMirror asks for client rects on mount. */
const emptyRects = function () {
  return [] as unknown as DOMRectList;
};
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<
  Record<string, unknown>
>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { ApiRequestError } from '@/lib/queryClient';
import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';
import {
  AuthoringAiDraft,
  describeAcceptFailure,
  describeGrounding,
  type PendingAiDraft,
} from '../surfaces/AuthoringAiDraft';

const res = (status: number, payload: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => payload }) as Response;

/**
 * How a non-ok response ACTUALLY reaches a caller.
 *
 * `apiRequest` throws `ApiRequestError` for every status except 2xx and 401 —
 * it never hands back a non-ok Response. An earlier version of this file
 * mocked the 410 and 500 cases as resolved non-ok Responses, so the assertions
 * passed against branches that could not run in production. The mock has to
 * lie the same way the real thing does.
 */
const rejects =
  (status: number, code: string, message: string) => () =>
    Promise.reject(
      new ApiRequestError(message, status, { success: false, error: { code, message } }, code),
    );

/** A model draft with N retrieved / M attributable sources. */
const MODEL_DRAFT = (over: Record<string, unknown> = {}) => ({
  success: true,
  draft: {
    content: 'Drafted section body.',
    draftId: 'DC-1',
    metadata: {
      tone: 'professional',
      region: 'FDA',
      model: 'claude-x',
      provider: 'anthropic',
      sourcesRetrieved: 3,
      attributableSources: 3,
      retrievalStatus: 'ok',
      retrievalError: null,
    },
  },
  ...over,
});

/** The server's degraded answer: 200, success:false, usable template body. */
const TEMPLATE_DRAFT = {
  success: false,
  degraded: true,
  source: 'template',
  draft: {
    content: 'QUALITY OVERALL SUMMARY\n[Detailed information]',
    metadata: { model: 'template-based', source: 'template', degraded: true },
  },
  message: 'AI generation was unavailable; returned a hardcoded section template.',
};

const onAccepted = vi.fn();
const onClose = vi.fn();
const fireToast = vi.fn();

function mount(props: Partial<React.ComponentProps<typeof AuthoringAiDraft>> = {}) {
  return render(
    <AuthoringAiDraft
      sectionId="S1"
      sectionCode="3.2.S.1"
      sectionTitle="General Information"
      docSealed={false}
      editorDirty={false}
      onAccepted={onAccepted}
      onClose={onClose}
      fireToast={fireToast}
      {...props}
    />,
  );
}

async function generate() {
  fireEvent.click(screen.getByTestId('ai-draft-generate'));
  await screen.findByTestId('ai-draft-body');
}

beforeEach(() => {
  apiRequest.mockReset();
  onAccepted.mockReset();
  onClose.mockReset();
  fireToast.mockReset();
});
afterEach(() => cleanup());

/* ── 1 + 2: the grounding statement, as a pure decision ─────────────────── */
describe('describeGrounding', () => {
  const base = (meta: Record<string, unknown>, degraded = false): PendingAiDraft => ({
    sectionId: 'S1',
    generated: 'x',
    draftId: degraded ? null : 'DC-1',
    degraded,
    metadata: meta,
  });

  it('a retrieval OUTAGE is not reported as an empty corpus', () => {
    const failed = describeGrounding(
      base({ sourcesRetrieved: 0, retrievalStatus: 'failed', retrievalError: 'timeout' }),
    );
    const empty = describeGrounding(base({ sourcesRetrieved: 0, retrievalStatus: 'empty' }));

    // Both leave sourcesRetrieved at 0. They must not read the same.
    expect(failed.text).not.toBe(empty.text);
    expect(failed.text).toMatch(/retrieval failed/i);
    expect(failed.text).toMatch(/did not complete/i);
    expect(failed.text).toContain('timeout');
    // An outage outranks a footnote.
    expect(failed.tone).toBe('error');

    expect(empty.text).toMatch(/no data room source met the relevance threshold/i);
    expect(empty.text).toMatch(/unverified/i);
    expect(empty.tone).toBe('warn');
  });

  it('names the gap when retrieved evidence cannot all carry citations', () => {
    const g = describeGrounding(
      base({ sourcesRetrieved: 5, attributableSources: 2, retrievalStatus: 'ok' }),
    );
    expect(g.text).toMatch(/5 Data Room sources/);
    expect(g.text).toMatch(/2 can carry citations/);
    // The 3 that informed the text and cite nothing are the point.
    expect(g.text).toMatch(/other 3/);
    expect(g.tone).toBe('warn');
  });

  it('reports a fully attributable draft plainly', () => {
    const g = describeGrounding(
      base({ sourcesRetrieved: 2, attributableSources: 2, retrievalStatus: 'ok' }),
    );
    expect(g.tone).toBe('ok');
    expect(g.text).toMatch(/2 Data Room sources, all of which can carry citations/);
  });

  it('calls the template fallback a template, not a draft', () => {
    const g = describeGrounding(base({ model: 'template-based', degraded: true }, true));
    expect(g.text).toMatch(/not model-generated/i);
    expect(g.text).toMatch(/placeholders are literal/i);
    expect(g.text).toMatch(/cannot be accepted/i);
  });
});

/* ── The two refusals that are not "errors" ─────────────────────────────── */
describe('describeAcceptFailure', () => {
  it('a claimed (410) draft is discarded — a retry of it can only fail', () => {
    const f = describeAcceptFailure(410, 'DRAFT_EXPIRED', 'gone');
    expect(f.clearDraft).toBe(true);
    expect(f.text).toMatch(/already accepted or has expired/i);
    expect(f.text).toMatch(/section is unchanged/i);
  });

  it('a LINEAGE_REQUIRED rollback KEEPS the draft — the candidate survived it', () => {
    const f = describeAcceptFailure(500, 'LINEAGE_REQUIRED', 'The draft was not saved');
    // Clearing here would make the correct next move — retry — impossible.
    expect(f.clearDraft).toBe(false);
    expect(f.text).toMatch(/lineage could not be recorded/i);
    expect(f.text).toMatch(/not saved without provenance/i);
  });

  it('names an unauthenticated session rather than blaming the draft', () => {
    expect(describeAcceptFailure(401, null, null).text).toMatch(/isn’t authenticated/i);
  });

  it('falls back to the server’s sentence, never to a bare code', () => {
    const f = describeAcceptFailure(503, null, 'Upstream unavailable');
    expect(f.text).toContain('Upstream unavailable');
    expect(f.clearDraft).toBe(false);
  });
});

/* ── The panel ──────────────────────────────────────────────────────────── */
describe('AuthoringAiDraft', () => {
  it('generating does not save anything — the section is untouched until accept', async () => {
    apiRequest.mockResolvedValue(res(200, MODEL_DRAFT()));
    mount();
    await generate();

    const urls = apiRequest.mock.calls.map((c: unknown[]) => String(c[1]));
    expect(urls).toEqual(['/api/authoring/sections/S1/ai/draft']);
    expect(urls.some((u) => u.includes('/accept'))).toBe(false);
    expect(onAccepted).not.toHaveBeenCalled();
    // Said on the panel, not merely implied by the absence of a save.
    expect(screen.getByText(/not saved/i)).toBeTruthy();
  });

  it('offers the degraded template as a scaffold, and refuses to let it be accepted', async () => {
    apiRequest.mockResolvedValue(res(200, TEMPLATE_DRAFT));
    mount();
    await generate();

    // success:false is NOT an error here — the body the server chose to return
    // is still offered.
    expect(fireToast).not.toHaveBeenCalled();
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toMatch(
      /QUALITY OVERALL SUMMARY/,
    );
    expect(screen.getByTestId('ai-draft-grounding').textContent).toMatch(/not model-generated/i);
    // No draft candidate exists behind it, so there is nothing to accept.
    expect(screen.queryByTestId('ai-draft-accept')).toBeNull();
  });

  it('a transport failure yields no draft body and says nothing changed', async () => {
    apiRequest.mockImplementation(rejects(500, 'INTERNAL', 'Failed to generate AI draft'));
    mount();
    fireEvent.click(screen.getByTestId('ai-draft-generate'));

    await waitFor(() => expect(fireToast).toHaveBeenCalled());
    expect(String(fireToast.mock.calls[0][0])).toMatch(/nothing was changed/i);
    expect(fireToast.mock.calls[0][1]).toBe('error');
    expect(screen.queryByTestId('ai-draft-body')).toBeNull();
  });

  it('a model draft with no parked candidate says citations are impossible for it', async () => {
    apiRequest.mockResolvedValue(
      res(200, {
        success: true,
        draft: {
          content: 'Ungrounded body.',
          // draftId absent: attribution prep is best-effort by design.
          metadata: { sourcesRetrieved: 2, attributableSources: 0, retrievalStatus: 'ok' },
        },
      }),
    );
    mount();
    await generate();

    expect(screen.getByTestId('ai-draft-no-lineage').textContent).toMatch(
      /cannot be accepted with source lineage/i,
    );
    expect(screen.getByTestId('ai-draft-no-lineage').textContent).toMatch(/sole author/i);
    expect(screen.queryByTestId('ai-draft-accept')).toBeNull();
  });

  it('accepts through the lineage endpoint, sending the draftId and the text actually saved', async () => {
    apiRequest
      .mockResolvedValueOnce(res(200, MODEL_DRAFT()))
      .mockResolvedValueOnce(
        res(200, {
          success: true,
          section: { id: 'S1', content: 'Edited body.' },
          attribution: { sourceSpans: 4, authorSpans: 2, distinctSources: 3, coverage: 61 },
        }),
      );
    mount();
    await generate();

    fireEvent.change(screen.getByTestId('ai-draft-body'), { target: { value: 'Edited body.' } });
    fireEvent.change(screen.getByPlaceholderText('Accepted AI draft'), {
      target: { value: 'Adopted with edits.' },
    });
    fireEvent.click(screen.getByTestId('ai-draft-accept'));

    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
    const [method, url, payload] = apiRequest.mock.calls[1];
    expect(method).toBe('POST');
    expect(url).toBe('/api/authoring/sections/S1/ai/draft/accept');
    expect(payload).toEqual({
      draftId: 'DC-1',
      content: 'Edited body.',
      changeReason: 'Adopted with edits.',
    });
    // The server's lineage summary is handed up verbatim, not recomputed.
    expect(onAccepted.mock.calls[0][1]).toEqual({
      sourceSpans: 4,
      authorSpans: 2,
      distinctSources: 3,
      coverage: 61,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('names the consequence on the regenerate control once edits exist', async () => {
    apiRequest.mockResolvedValue(res(200, MODEL_DRAFT()));
    mount();
    await generate();
    expect(screen.getByTestId('ai-draft-regenerate').textContent).toBe('Draft again');

    fireEvent.change(screen.getByTestId('ai-draft-body'), { target: { value: 'My own words.' } });
    // Regenerating overwrites the buffer; the button says so before the click.
    expect(screen.getByTestId('ai-draft-regenerate').textContent).toMatch(/replaces your edits/i);
  });

  it('passes a MISSING lineage summary up as absent, never as a summary of zero', async () => {
    apiRequest
      .mockResolvedValueOnce(res(200, MODEL_DRAFT()))
      // Saved and confirmed, but the server sent no `attribution` block.
      .mockResolvedValueOnce(res(200, { success: true, section: { id: 'S1', content: 'Body.' } }));
    mount();
    await generate();
    fireEvent.click(screen.getByTestId('ai-draft-accept'));

    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
    // A zero-filled object here would report "0 verified citations" for a save
    // whose lineage the server recorded and merely did not summarise.
    expect(onAccepted.mock.calls[0][1]).toBeNull();
  });

  it('warns while it is still a choice that an edited draft is no longer the model’s words', async () => {
    apiRequest.mockResolvedValue(res(200, MODEL_DRAFT()));
    mount();
    await generate();
    expect(screen.queryByTestId('ai-draft-edited')).toBeNull();

    fireEvent.change(screen.getByTestId('ai-draft-body'), { target: { value: 'My own words.' } });
    expect(screen.getByTestId('ai-draft-edited').textContent).toMatch(/differs from what the model/i);
  });

  it('a consumed (410) draft is cleared, not left behind a button that can only fail', async () => {
    apiRequest
      .mockResolvedValueOnce(res(200, MODEL_DRAFT()))
      .mockImplementationOnce(rejects(410, 'DRAFT_EXPIRED', 'This AI draft has expired'));
    mount();
    await generate();
    fireEvent.click(screen.getByTestId('ai-draft-accept'));

    await screen.findByTestId('ai-draft-refusal');
    expect(screen.getByTestId('ai-draft-refusal').textContent).toMatch(
      /already accepted or has expired/i,
    );
    expect(screen.getByTestId('ai-draft-refusal').textContent).toMatch(/section is unchanged/i);
    expect(screen.queryByTestId('ai-draft-body')).toBeNull();
    expect(onAccepted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reports the fail-closed lineage rollback as a rollback, and adopts nothing', async () => {
    apiRequest
      .mockResolvedValueOnce(res(200, MODEL_DRAFT()))
      .mockImplementationOnce(rejects(500, 'LINEAGE_REQUIRED', 'The draft was not saved'));
    mount();
    await generate();
    fireEvent.click(screen.getByTestId('ai-draft-accept'));

    const refusal = await screen.findByTestId('ai-draft-refusal');
    expect(refusal.textContent).toMatch(/lineage could not be recorded/i);
    expect(refusal.textContent).toMatch(/not saved without provenance/i);
    expect(refusal.textContent).toMatch(/section is unchanged/i);
    expect(onAccepted).not.toHaveBeenCalled();
    // The draft survives a refusal — the candidate was rolled back, so a retry
    // is the correct next move and the text must still be there for it.
    expect(screen.getByTestId('ai-draft-body')).toBeTruthy();
  });

  it('says unsaved editor edits are not part of the draft being accepted', async () => {
    apiRequest.mockResolvedValue(res(200, MODEL_DRAFT()));
    mount({ editorDirty: true });
    await generate();
    expect(screen.getByTestId('ai-draft-dirty-warning').textContent).toMatch(
      /unsaved edits are not part of this draft/i,
    );
  });
});

/* ── The wiring ────────────────────────────────────────────────────────────
   The component tests above mount the panel directly, so they say nothing
   about whether the editor actually renders it. This is the seam a dark
   endpoint dies in: a correct panel that no surface mounts is exactly the
   state this whole change exists to end. */
describe('DocumentAuthoring — the drafting panel is reachable', () => {
  const DOCS = {
    success: true,
    documents: [
      {
        id: 'D1', title: 'Quality Overall Summary', module: 'M3', product_code: 'ABC',
        status: 'draft', updated_at: null, section_count: 1,
      },
    ],
  };
  const SECTIONS = {
    success: true,
    sections: [
      {
        id: 'S1', doc_id: 'D1', code: '3.2.S.1', title: 'General Information',
        content: '<p>Text.</p>', order_index: 0, comment_count: 0, revision_count: 1,
        citation_count: 0, updated_at: null,
      },
    ],
  };

  function surfaceProps() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { surface: { id: 'document-authoring', label: 'Authoring' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' };
  }

  beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return res(200, DOCS);
      if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return res(200, SECTIONS);
      return res(200, { success: true, revisions: [], comments: [], sources: [], events: [] });
    });
  });

  it('opens the panel from the editor toolbar, and drafts nothing until asked', async () => {
    render(<DocumentAuthoring {...surfaceProps()} />);

    const open = (await screen.findByTestId('ai-draft-open')) as HTMLButtonElement;
    expect(screen.queryByTestId('ai-draft-panel')).toBeNull();
    // Disabled until a section is actually open — there is no section to draft
    // before then, and the endpoint is addressed by section id.
    expect(open.disabled).toBe(true);
    await waitFor(() => expect(open.disabled).toBe(false));
    fireEvent.click(open);

    const panel = await screen.findByTestId('ai-draft-panel');
    expect(panel.textContent).toMatch(/Draft 3\.2\.S\.1 from Data Room sources/);
    // Opening the panel must not call the generator — drafting is an act the
    // author takes, and it costs a model call and a draft candidate.
    const urls = apiRequest.mock.calls.map((c: unknown[]) => String(c[1]));
    expect(urls.some((u) => u.includes('/ai/draft'))).toBe(false);
  });
});
