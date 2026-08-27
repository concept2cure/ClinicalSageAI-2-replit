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
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;

const DOCS = {
  success: true,
  documents: [
    {
      id: 'D1',
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
      id: 'S1',
      doc_id: 'D1',
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

const props = () => ({
  surface: { id: 'document-authoring', label: 'Authoring' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

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

/** Stream one finished assistant answer and return the AnA pane. */
async function answer(markdown: string): Promise<HTMLElement> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      body: anaStream([
        { type: 'text', content: markdown },
        { type: 'done', latencyMs: 12 },
        { type: 'post_done', cleanedResponse: markdown },
      ]),
    }))
  );
  render(<DocumentAuthoring {...props()} />);
  await screen.findAllByText('General Information');
  const composer = await screen.findByRole('textbox', { name: 'Ask AnA about 3.2.S.1' });
  fireEvent.change(composer, { target: { value: 'Summarise the drug substance section.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  const pane = await screen.findByLabelText(/AnA — document authoring/);
  await waitFor(() => expect(pane.querySelector('.ana-md')).toBeTruthy());
  return pane;
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
    if (method === 'GET' && url.startsWith('/api/authoring/sections/'))
      return ok({ success: true, revisions: [], sources: [], citations: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/D1/comments'))
      return ok({ success: true, comments: [] });
    return ok({ success: true });
  });
});
afterEach(() => {
  cleanup();
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
    const user = Array.from(pane.querySelectorAll('.cmt')).find(c =>
      c.querySelector('.cmt-meta')?.textContent?.includes('You')
    )!;
    expect(user.querySelector('.ana-md')).toBeNull();
  });

  it('still shows the streaming status phase rather than an invented sentence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        body: anaStream([{ type: 'status', phase: 'Reading the section…' }]),
      }))
    );
    render(<DocumentAuthoring {...props()} />);
    await screen.findAllByText('General Information');
    const composer = await screen.findByRole('textbox', { name: 'Ask AnA about 3.2.S.1' });
    fireEvent.change(composer, { target: { value: 'Anything?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const pane = await screen.findByLabelText(/AnA — document authoring/);
    await waitFor(() => expect(pane.textContent).toMatch(/Reading the section…|Thinking…/));
  });
});
