// @vitest-environment jsdom
/**
 * Alternatives for a selected passage (docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md, slice 4), in
 * the real workbench and TipTap editor. The person selects words in the editor and asks for
 * alternatives; the one review panel drafts up to three replacements of exactly that passage
 * through the existing draft route; the one chosen lands as AnA's tracked replacement of exactly
 * the selection, through the workbench's own proposal door, naming its turn record. Nothing is
 * saved or accepted.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Editor } from '@tiptap/core';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({
  ...(await original<typeof import('@/services/portal/authService')>()), useAuth: () => ({ user: { displayName: 'Author', email: 'author@test.co' } }) }));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));

import { DocumentAuthoring } from '../../surfaces/DocumentAuthoring';
import { ApiRequestError } from '@/lib/queryClient';

const DOC = 'dddddddd-0000-4000-8000-000000000012';
const SEC = 'aaaaaaaa-0000-4000-8000-000000000012';
const PID = 'bbbbbbbb-0000-4000-8000-000000000012';
const AT = '2026-10-29T10:00:00Z';
/** One sentence twice, in different places: the context names which. */
const CURRENT = '<p>The objective response rate was 31% in the 10 mg arm.</p>'
  + '<p>The objective response rate was 31% in the 10 mg arm, as the protocol required.</p>';
const QUOTE = 'objective response rate was 31%';
const TEXT: Record<string, string> = {
  professional: 'objective response rate (ORR) was 31%',
  concise: 'ORR was 31%',
  detailed: 'objective response rate, by investigator assessment, was 31%',
};
const served = (qualified: boolean) => [{ provider: 'anthropic', model: 'qualified-test-model', qualified, approvedForHighRisk: qualified, pq: 'pending' }];
const doc = { id: DOC, title: 'Clinical study report', module: 'M5', status: 'draft', updated_at: AT, section_count: 1 };
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = () => [];
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}

type Body = { tone?: string; passage?: { quote: string; prefix: string; suffix: string } };
const SEC2 = 'aaaaaaaa-0000-4000-8000-000000000013';
function serve(content: string, opts: { qualified?: boolean; echo?: boolean; refuse?: ApiRequestError } = {}) {
  const { qualified = true, echo = true, refuse } = opts;
  const section = { id: SEC, doc_id: DOC, code: '11.4.1', title: 'Analysis of Efficacy', content, order_index: 0, updated_at: AT };
  const second = { id: SEC2, doc_id: DOC, code: '12.2', title: 'Adverse Events', content: '<p>No deaths were reported.</p>', order_index: 1, updated_at: AT };
  apiRequest.mockImplementation(async (method: string, url: string, body: Body) => {
    if (method === 'POST' && url === `/api/authoring/sections/${SEC}/ai/draft`) {
      if (refuse) throw refuse;
      const tone = body?.tone ?? 'professional';
      return ok({ success: true, draft: { content: TEXT[tone], check: null,
        turnRecord: { status: 'recorded', id: `TURN-passage-${tone}`, sha256: 'b'.repeat(64), servedBy: served(qualified) },
        ...(echo && body?.passage ? { passage: body.passage } : {}),
        metadata: { tone, model: 'qualified-test-model', provider: 'anthropic', sourcesRetrieved: 1, attributableSources: 0, retrievalStatus: 'ok' } } });
    }
    if (url.startsWith('/api/authoring/docs?')) return ok({ documents: [doc] });
    if (url.split('?')[0] === `/api/authoring/docs/${DOC}`) return ok({ document: doc });
    if (url.split('?')[0] === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [section, second] });
    if (url.startsWith('/api/c2c/documents/')) return ok({ success: false }, 404);
    return ok({ success: true });
  });
}

const editor = () => (document.querySelector('.tiptap') as unknown as { editor: Editor }).editor;
async function openSection(probe: string) {
  render(<DocumentAuthoring onNav={vi.fn()} segment="biotech" surface={{ id: 'document-authoring', label: 'Authoring' } as never} />);
  await screen.findAllByText('Analysis of Efficacy');
  await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain(probe));
  await waitFor(() => expect(editor()).toBeTruthy());
}
/** Select the n-th occurrence of `words` in the editor, as a person dragging over them would. */
function select(words: string, occurrence = 0, length = words.length) {
  const at: number[] = [];
  editor().state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (let i = node.text!.indexOf(words); i !== -1; i = node.text!.indexOf(words, i + 1)) at.push(pos + i);
  });
  act(() => { editor().commands.setTextSelection({ from: at[occurrence], to: at[occurrence] + length }); });
}
const offer = () => fireEvent.click(screen.getByRole('button', { name: /^Offer alternatives/ }));
const drafts = () => apiRequest.mock.calls.filter((c: unknown[]) => c[0] === 'POST' && String(c[1]).endsWith('/ai/draft'));
const patched = () => apiRequest.mock.calls.filter((c: unknown[]) => c[0] === 'PATCH');
const panel = () => screen.getByRole('region', { name: /alternatives for a passage of 11\.4\.1/i });

async function threeForPassage() {
  fireEvent.click(within(panel()).getByRole('button', { name: 'Draft three alternatives for this passage' }));
  const group = await within(panel()).findByRole('radiogroup', { name: /alternatives/i });
  await waitFor(() => expect((within(group).getByRole('radio', { name: /Detailed/ }) as HTMLInputElement).disabled).toBe(false));
  return group;
}

beforeEach(() => {
  localStorage.clear();
  window.C2C_PROJECT = { id: PID } as typeof window.C2C_PROJECT;
  apiRequest.mockReset();
});
afterEach(() => { cleanup(); localStorage.clear(); delete window.C2C_PROJECT; });

describe('Alternatives for a selected passage', () => {
  it('drafts three replacements of exactly the selection, and the one chosen replaces exactly it as AnA’s tracked change', async () => {
    serve(CURRENT);
    await openSection('as the protocol required');
    select(QUOTE, 1);
    offer();
    expect(within(panel()).getByText(QUOTE)).toBeTruthy();
    expect(document.activeElement).toBe(within(panel()).getByRole('heading', { name: /alternatives for a passage of 11\.4\.1/i }));
    const group = await threeForPassage();
    // Three requests to the existing route, one per tone, each naming the passage and its context.
    expect(drafts().map(c => (c[2] as Body).tone)).toEqual(['professional', 'concise', 'detailed']);
    for (const call of drafts()) {
      const { passage } = call[2] as Body;
      expect(passage?.quote).toBe(QUOTE);
      expect(passage?.prefix.trimEnd().endsWith('in the 10 mg arm. The')).toBe(true);
      expect(passage?.suffix.trimStart().startsWith('in the 10 mg arm, as the protocol')).toBe(true);
    }
    fireEvent.click(within(group).getByRole('radio', { name: /Concise/ }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Replace the selected passage with this alternative' }));
    await waitFor(() => expect(document.querySelector('.tiptap ins[data-author-id="ana"]')).toBeTruthy());
    const ins = document.querySelector('.tiptap ins[data-author-id="ana"]')!;
    const del = document.querySelector('.tiptap del[data-author-id="ana"]')!;
    expect(ins.textContent).toBe('ORR was 31%');
    expect(ins.getAttribute('data-source-record')).toBe('TURN-passage-concise');
    expect(del.textContent).toBe(QUOTE);
    // Exactly the selection: the second paragraph, and nothing around it.
    const paragraphs = [...document.querySelectorAll('.tiptap p')];
    expect(paragraphs[0].querySelector('ins, del')).toBeNull();
    expect(paragraphs[1].contains(del)).toBe(true);
    expect(paragraphs[1].textContent).toBe(`The ${QUOTE}ORR was 31% in the 10 mg arm, as the protocol required.`);
    expect(document.querySelectorAll('.tiptap ins, .tiptap del')).toHaveLength(2);
    await within(panel()).findByText(/The alternative is in the editor as a tracked change/);
    expect(patched()).toHaveLength(0);
    expect(apiRequest.mock.calls.some((c: unknown[]) => String(c[1]).endsWith('/ai/draft/accept'))).toBe(false);
  });

  it('replaces the first occurrence when that is the one selected', async () => {
    serve(CURRENT);
    await openSection('as the protocol required');
    select(QUOTE, 0);
    offer();
    const group = await threeForPassage();
    fireEvent.click(within(group).getByRole('radio', { name: /Detailed/ }));
    fireEvent.click(within(panel()).getByRole('button', { name: 'Replace the selected passage with this alternative' }));
    await waitFor(() => expect(document.querySelector('.tiptap del[data-author-id="ana"]')).toBeTruthy());
    const paragraphs = [...document.querySelectorAll('.tiptap p')];
    expect(paragraphs[0].querySelector('del')?.textContent).toBe(QUOTE);
    expect(paragraphs[1].querySelector('ins, del')).toBeNull();
  });

});

describe('The passage panel keeps the person in control: focus, notes and refusals', () => {
  it('keeps focus with the person: on the alternative shown, and back on Replace once the change is in the editor', async () => {
    serve(CURRENT);
    await openSection('as the protocol required');
    select(QUOTE, 1);
    offer();
    // A browser drops focus from a control disabled while AnA works (jsdom does not, so the drop is made here).
    const drop = () => { const t = document.body.appendChild(document.createElement('input')); t.focus(); t.remove(); };
    const ask = within(panel()).getByRole('button', { name: 'Draft three alternatives for this passage' });
    ask.focus();
    fireEvent.click(ask);
    drop();
    const group = await within(panel()).findByRole('radiogroup', { name: /alternatives/i });
    await waitFor(() => expect(document.activeElement).toBe(within(group).getByRole('radio', { name: /Professional/ })));
    await waitFor(() => expect((within(group).getByRole('radio', { name: /Detailed/ }) as HTMLInputElement).disabled).toBe(false));
    const replace = within(panel()).getByRole('button', { name: 'Replace the selected passage with this alternative' });
    replace.focus();
    fireEvent.click(replace);
    drop();
    await within(panel()).findByText(/The alternative is in the editor as a tracked change/);
    await waitFor(() => expect(document.activeElement).toBe(replace));
  });

  it('says before the click that the replacement carries no source citations and AnA supplies no figures', async () => {
    serve(CURRENT);
    await openSection('as the protocol required');
    select(QUOTE, 1);
    offer();
    const note = within(panel()).getByTestId('ai-draft-passage-note').textContent ?? '';
    expect(note).toMatch(/replaces exactly the selected passage as AnA’s tracked change/);
    expect(note).toMatch(/carries no source citations/);
    expect(note).toMatch(/AnA does not supply figures/);
  });

  it('keeps an answer the governed-write rule does not admit out of the section', async () => {
    serve(CURRENT, { qualified: false });
    await openSection('as the protocol required');
    select(QUOTE, 1);
    offer();
    await threeForPassage();
    const replace = within(panel()).getByRole('button', { name: 'Replace the selected passage with this alternative' }) as HTMLButtonElement;
    expect(replace.disabled).toBe(true);
    expect(within(panel()).getByTestId('ai-draft-passage-replace-note').textContent).toMatch(/not approved for regulatory drafting/);
    fireEvent.click(replace);
    expect(document.querySelector('.tiptap ins, .tiptap del')).toBeNull();
  });

  it('refuses an answer the server did not draft for the passage selected, and lists nothing', async () => {
    serve(CURRENT, { echo: false });
    await openSection('as the protocol required');
    select(QUOTE, 1);
    offer();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Draft three alternatives for this passage' }));
    const alert = await within(panel()).findByTestId('ai-draft-passage-refusal');
    expect(alert.textContent).toMatch(/did not confirm that this alternative was drafted for the selected passage/);
    expect(within(panel()).queryByRole('radiogroup')).toBeNull();
    expect(drafts()).toHaveLength(1);
  });

  it('keeps a refusal from the server beside the passage, with its remedy, and lists nothing', async () => {
    const message = 'The selected passage is not in the saved section as it reads now, outside any pending change. Save the section, select the passage again and ask again. Nothing was drafted.';
    serve(CURRENT, { refuse: new ApiRequestError(message, 409, { success: false, error: { code: 'PASSAGE_NOT_IN_SAVED_SECTION', message } }, 'PASSAGE_NOT_IN_SAVED_SECTION') });
    await openSection('as the protocol required');
    select(QUOTE, 1);
    offer();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Draft three alternatives for this passage' }));
    const alert = await within(panel()).findByTestId('ai-draft-passage-refusal');
    expect(alert.textContent).toBe(`Couldn’t draft alternatives for this passage — ${message}`);
    expect(within(panel()).queryByRole('radiogroup')).toBeNull();
    expect(drafts()).toHaveLength(1);
  });
});

describe('The passage view is left as the person leaves it: back, closed, another view or another section', () => {
  it('goes back to the section draft, which is as it was', async () => {
    serve(CURRENT);
    await openSection('as the protocol required');
    select(QUOTE, 1);
    offer();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Back to drafting the section' }));
    expect(screen.queryByRole('region', { name: /alternatives for a passage/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Draft three alternatives' })).toBeTruthy();
    expect(drafts()).toHaveLength(0);
  });

  it('ends the passage when the panel closes, so Draft from sources opens the section draft', async () => {
    serve(CURRENT);
    await openSection('as the protocol required');
    const passageShown = () => screen.queryByRole('region', { name: /alternatives for a passage/i });
    select(QUOTE, 1);
    offer();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }));
    expect(passageShown()).toBeNull();
    fireEvent.click(screen.getByTestId('ai-draft-open'));
    expect(passageShown()).toBeNull();
    expect(screen.getByRole('button', { name: 'Draft three alternatives' })).toBeTruthy();
    // The toolbar's own toggle ends a passage as well.
    select(QUOTE, 1);
    offer();
    expect(passageShown()).toBeTruthy();
    fireEvent.click(screen.getByTestId('ai-draft-open'));
    fireEvent.click(screen.getByTestId('ai-draft-open'));
    expect(passageShown()).toBeNull();
    expect(screen.getByRole('button', { name: 'Draft three alternatives' })).toBeTruthy();
  });

  it('opens the section draft, not the passage, when Draft from sources is pressed in Document view', async () => {
    serve(CURRENT);
    await openSection('as the protocol required');
    select(QUOTE, 1);
    offer();
    fireEvent.click(screen.getByRole('button', { name: 'Document' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Document' }).getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(screen.getByTestId('ai-draft-open'));
    await screen.findByTestId('ai-draft-panel');
    expect(screen.queryByRole('region', { name: /alternatives for a passage/i })).toBeNull();
  });

  it('belongs to its section: another section, and coming back, show the section draft', async () => {
    serve(CURRENT);
    await openSection('as the protocol required');
    select(QUOTE, 1);
    offer();
    expect(screen.getByRole('region', { name: /alternatives for a passage/i })).toBeTruthy();
    fireEvent.click(screen.getAllByText('Adverse Events')[0]);
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('No deaths were reported.'));
    fireEvent.click(screen.getAllByText('Analysis of Efficacy')[0]);
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('as the protocol required'));
    expect(screen.queryByRole('region', { name: /alternatives for a passage/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Draft three alternatives' })).toBeTruthy();
  });

});

describe('Offering alternatives is refused, with the reason, before anything is asked', () => {
  const notice = () => document.querySelector('.rse-gate[role="alert"]')?.textContent ?? '';

  it('with nothing selected', async () => {
    serve(CURRENT);
    await openSection('as the protocol required');
    act(() => { editor().commands.setTextSelection(3); });
    offer();
    expect(notice()).toMatch(/Select the words you want alternatives for/);
    expect(screen.queryByRole('region', { name: /alternatives for a passage/i })).toBeNull();
  });

  it('for a selection that runs across paragraphs', async () => {
    serve(CURRENT);
    await openSection('as the protocol required');
    select('in the 10 mg arm.', 0, 40);
    offer();
    expect(notice()).toMatch(/^Select text within one paragraph, heading, list item or table cell\. An alternative replaces words in one place\./);
    expect(screen.queryByRole('region', { name: /alternatives for a passage/i })).toBeNull();
  });

  it('for words that read the same, with the same text around them, in more than one place', async () => {
    serve('<p>Not applicable.</p>'.repeat(10));
    await openSection('Not applicable.');
    select('Not applicable.', 4);
    offer();
    expect(notice()).toMatch(/more than one place/);
    expect(screen.queryByRole('region', { name: /alternatives for a passage/i })).toBeNull();
    expect(drafts()).toHaveLength(0);
  });
});
