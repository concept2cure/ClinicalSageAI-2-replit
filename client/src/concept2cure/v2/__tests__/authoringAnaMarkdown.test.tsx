// @vitest-environment jsdom
/**
 * AnA's answer in the authoring pane is a document, not a log line.
 *
 * The pane rendered `m.text` inside `white-space: pre-wrap`, so a regulatory
 * answer arrived as its own source: `## Drug Substance`, `**must**`, `| col |`.
 * On the one surface whose whole job is producing formatted regulatory prose,
 * the assistant's prose was the only unformatted text on screen.
 *
 * The rendering path is the codebase's ONE audited markdown story —
 * `components/ana/renderSafeMarkdown` (marked → DOMPurify allowlist) — and the
 * allowlisted result is then walked into React elements. No
 * `dangerouslySetInnerHTML`, so even a defect in the sanitizer cannot become an
 * injection sink here; and no second markdown parser, which is the duplication
 * this repo already removed once.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return {
    ...actual,
    authService: {
      getUser: () => ({ id: 1, organizationId: 1 }),
      captureSessionReadGuard: actual.authService.captureSessionReadGuard.bind(actual.authService),
      on: actual.authService.on.bind(actual.authService),
    },
    useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
  };
});

import { CanonicalAuthoringFlow, setAuthoringFlowScope, clearAuthoringFlowScope, serveAuthoringStream, sendAuthoringPrefill, toolbarDraftButton } from './canonicalAuthoringFlow';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;

const DOCS = {
  success: true,
  documents: [
    {
      id: 'dddddddd-0000-4000-8000-000000000001',
      title: 'Nonclinical Overview',
      module: 'M3',
      product_code: 'ABC',
      status: 'draft',
      updated_at: '2026-07-20T10:00:00Z',
      section_count: 1,
    },
  ],
};
const SECTIONS = {
  success: true,
  sections: [
    {
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      doc_id: 'dddddddd-0000-4000-8000-000000000001',
      code: '3.2.S.1',
      title: 'General Information',
      content: 'The drug substance is a monoclonal antibody.',
      order_index: 0,
      comment_count: 0,
      revision_count: 2,
      citation_count: 1,
      updated_at: '2026-07-20T10:00:00Z',
    },
  ],
};

function anaStream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
}

/** Stream one finished assistant answer through the canonical conversation. */
async function answer(markdown: string): Promise<HTMLElement> {
  serveAuthoringStream(() => anaStream([
        { type: 'text', content: markdown },
        { type: 'done', latencyMs: 12 },
        { type: 'post_done', cleanedResponse: markdown },
      ]));
  render(<CanonicalAuthoringFlow />);
  await screen.findAllByText('General Information');
  fireEvent.click(toolbarDraftButton());
  const pane = await sendAuthoringPrefill('Summarise the drug substance section.');
  await waitFor(() => expect(pane.querySelector('.ana-md')).toBeTruthy());
  return pane;
}

beforeEach(() => {
  setAuthoringFlowScope();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/dddddddd-0000-4000-8000-000000000001') return ok({ document: DOCS.documents[0] });
    if (method === 'GET' && url === '/api/authoring/docs/dddddddd-0000-4000-8000-000000000001/sections') return ok(SECTIONS);
    if (method === 'GET' && url.startsWith('/api/authoring/sections/'))
      return ok({ success: true, revisions: [], sources: [], citations: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/dddddddd-0000-4000-8000-000000000001/comments'))
      return ok({ success: true, comments: [] });
    if (url.startsWith('/api/c2c/documents/')) return { ...ok({ success: false }), ok: false, status: 404 };
    return ok({ success: true });
  });
});
afterEach(() => {
  cleanup();
  clearAuthoringFlowScope();
  vi.unstubAllGlobals();
});

describe('AnA answers render as prose, not as markdown source', () => {
  it('renders headings as headings and never shows the hashes', async () => {
    const pane = await answer('## Drug Substance\n\nThe substance is well characterised.');
    const md = pane.querySelector('.ana-md')!;
    const h = md.querySelector('h1,h2,h3,h4,h5,h6');
    expect(h, 'a heading element').toBeTruthy();
    expect(h!.textContent).toBe('Drug Substance');
    expect(md.textContent).not.toMatch(/##/);
  });

  it('renders emphasis as emphasis and never shows the asterisks', async () => {
    const pane = await answer('The specification **must** cite a validated *method*.');
    const md = pane.querySelector('.ana-md')!;
    expect(within(md as HTMLElement).getByText('must').tagName).toBe('STRONG');
    expect(within(md as HTMLElement).getByText('method').tagName).toBe('EM');
    expect(md.textContent).not.toMatch(/\*/);
  });

  it('renders bullet and ordered lists as lists', async () => {
    const pane = await answer('Gaps:\n\n- Assay validation\n- Impurity limits\n\n1. First\n2. Second');
    const md = pane.querySelector('.ana-md')!;
    expect(md.querySelectorAll('ul > li')).toHaveLength(2);
    expect(md.querySelectorAll('ol > li')).toHaveLength(2);
    expect(md.textContent).not.toMatch(/^- /m);
  });

  it('renders inline code and fenced code without showing the backticks', async () => {
    const pane = await answer('Set `pH 6.5`.\n\n```\nUSP <621>\n```');
    const md = pane.querySelector('.ana-md')!;
    expect(md.querySelectorAll('code').length).toBeGreaterThanOrEqual(2);
    expect(md.querySelector('pre')).toBeTruthy();
    expect(md.textContent).not.toMatch(/`/);
  });

  it('renders a pipe table as a table', async () => {
    const pane = await answer(
      'Specification:\n\n| Attribute | Limit |\n| --- | --- |\n| Purity | ≥ 98% |\n| Water | ≤ 0.5% |'
    );
    const md = pane.querySelector('.ana-md')!;
    const table = md.querySelector('table');
    expect(table, 'a table element').toBeTruthy();
    expect(table!.querySelectorAll('th')).toHaveLength(2);
    expect(table!.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(md.textContent).not.toMatch(/\|/);
  });

  it('builds React nodes — no raw HTML from the model is injected', async () => {
    const pane = await answer(
      'Careful: <img src=x onerror="alert(1)"> and <script>alert(2)</script> and [go](javascript:alert(3)).'
    );
    const md = pane.querySelector('.ana-md')!;
    expect(md.querySelector('script')).toBeNull();
    expect(md.querySelector('img')).toBeNull();
    expect(md.querySelector('iframe')).toBeNull();
    for (const el of Array.from(md.querySelectorAll('*'))) {
      expect(el.getAttribute('onerror')).toBeNull();
      expect(el.getAttribute('onclick')).toBeNull();
      const href = el.getAttribute('href');
      if (href) expect(href.toLowerCase().startsWith('javascript:')).toBe(false);
    }
  });

  it('leaves the user’s own turn as plain text', async () => {
    const pane = await answer('## Heading');
    // The author's question is echoed verbatim — it is their words, not a
    // document, and rendering it as markdown would rewrite what they typed.
    expect(pane.textContent).toMatch(/Summarise the drug substance section\./);
    const user = pane.querySelector('.ct-user')!;
    expect(user.querySelector('.ana-md')).toBeNull();
  });

  it('still shows the streaming status phase rather than an invented sentence', async () => {
    let endStream = () => {};
    serveAuthoringStream(() => new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'status', phase: 'Reading the section…' })}\n\n`));
      endStream = () => controller.close();
    } }));
    render(<CanonicalAuthoringFlow />);
    await screen.findAllByText('General Information');
    fireEvent.click(toolbarDraftButton());
    const pane = await sendAuthoringPrefill('Anything?');
    try {
      await waitFor(() => expect(pane.textContent).toMatch(/Reading the section…|Thinking…/));
    } finally { endStream(); }
  });
});
