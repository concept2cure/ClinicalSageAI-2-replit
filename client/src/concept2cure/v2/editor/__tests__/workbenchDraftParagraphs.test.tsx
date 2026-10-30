// @vitest-environment jsdom
/**
 * Chosen paragraphs of a drafted alternative land in the one editor as AnA's tracked changes,
 * through the workbench's own proposal door (docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md,
 * slice 1). Nothing is saved or accepted; each change names the turn record of the alternative it
 * came from, so the save can verify AnA's words against that record.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({
  ...(await original<typeof import('@/services/portal/authService')>()), useAuth: () => ({ user: { displayName: 'Author', email: 'author@test.co' } }) }));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));

import { DocumentAuthoring } from '../../surfaces/DocumentAuthoring';

const DOC = 'dddddddd-0000-4000-8000-000000000011';
const SEC = 'aaaaaaaa-0000-4000-8000-000000000011';
const PID = 'bbbbbbbb-0000-4000-8000-000000000011';
const AT = '2026-10-29T10:00:00Z';
const CURRENT = '<p>All randomized participants were included in the efficacy analysis.</p><p>The primary endpoint was met in the treatment group.</p>';
const TEXT: Record<string, string> = {
  professional: 'All randomized participants were included in the efficacy analysis set.\n\nThe primary endpoint was met.',
  concise: 'The analysis set included all randomized participants.\n\nThe primary endpoint was met.',
  detailed: 'Sensitivity analyses were consistent with the primary analysis.\n\nThe primary endpoint was met in the treatment group at Week 8.',
};
const served = (qualified: boolean) => [{ provider: 'anthropic', model: 'qualified-test-model', qualified, approvedForHighRisk: qualified, pq: 'pending' }];
const doc = { id: DOC, title: 'Clinical study report', module: 'M5', status: 'draft', updated_at: AT, section_count: 1 };
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = () => [];
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}

function serve(content: string, qualified = true) {
  const section = { id: SEC, doc_id: DOC, code: '11.4.1', title: 'Analysis of Efficacy', content, order_index: 0, updated_at: AT };
  apiRequest.mockImplementation(async (method: string, url: string, body: { tone?: string }) => {
    if (method === 'POST' && url === `/api/authoring/sections/${SEC}/ai/draft`) {
      const tone = body?.tone ?? 'professional';
      return ok({ success: true, draft: { content: TEXT[tone], draftId: `DC-${tone}`, check: null,
        turnRecord: { status: 'recorded', id: `TURN-${tone}`, sha256: 'b'.repeat(64), servedBy: served(qualified) },
        metadata: { tone, model: 'qualified-test-model', provider: 'anthropic', sourcesRetrieved: 1, attributableSources: 1, retrievalStatus: 'ok' } } });
    }
    if (url.startsWith('/api/authoring/docs?')) return ok({ documents: [doc] });
    if (url.split('?')[0] === `/api/authoring/docs/${DOC}`) return ok({ document: doc });
    if (url.split('?')[0] === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [section] });
    if (url.startsWith('/api/c2c/documents/')) return ok({ success: false }, 404);
    return ok({ success: true });
  });
}

async function openAlternatives(expectEmpty = false) {
  render(<DocumentAuthoring onNav={vi.fn()} segment="biotech" surface={{ id: 'document-authoring', label: 'Authoring' } as never} />);
  await screen.findAllByText('Analysis of Efficacy');
  await waitFor(() => {
    const canvas = document.querySelector('.tiptap');
    expect(canvas).toBeTruthy();
    if (expectEmpty) expect(canvas?.textContent).toBe('');
    else expect(canvas?.textContent).toContain('primary endpoint');
  });
  const open = screen.getByTestId('ai-draft-open') as HTMLButtonElement;
  await waitFor(() => expect(open.disabled).toBe(false));
  fireEvent.click(open);
  fireEvent.click(await screen.findByRole('button', { name: 'Draft three alternatives' }));
  const group = await screen.findByRole('radiogroup', { name: /alternatives/i });
  await waitFor(() => expect((within(group).getByRole('radio', { name: /Detailed/ }) as HTMLInputElement).disabled).toBe(false));
  return group;
}

const sent = (suffix: string) => apiRequest.mock.calls.filter((c: unknown[]) => String(c[1]).endsWith(suffix));
const patched = () => apiRequest.mock.calls.filter((c: unknown[]) => c[0] === 'PATCH');

beforeEach(() => {
  localStorage.clear();
  window.C2C_PROJECT = { id: PID } as typeof window.C2C_PROJECT;
  apiRequest.mockReset();
});
afterEach(() => { cleanup(); localStorage.clear(); delete window.C2C_PROJECT; });

describe('Chosen paragraphs land in the editor as AnA’s tracked changes', () => {
  it('replaces the current paragraph the chosen one is paired with, naming the alternative’s turn', async () => {
    serve(CURRENT);
    const group = await openAlternatives();
    fireEvent.click(within(group).getByRole('radio', { name: /Detailed/ }));
    const choice = screen.getByRole('group', { name: /paragraphs of the detailed alternative/i });
    fireEvent.click(within(choice).getByRole('checkbox', { name: 'Use paragraph 2' }));
    // Paired by default with the current paragraph it shares most words with, not by position alone.
    expect((within(choice).getByLabelText('Paragraph 2 replaces') as HTMLSelectElement).value).toBe('1');
    expect((within(choice).getByLabelText('Paragraph 1 replaces') as HTMLSelectElement).value).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 chosen paragraph as tracked changes' }));
    await waitFor(() => expect(document.querySelector('.tiptap ins[data-author-id="ana"]')).toBeTruthy());
    const ins = document.querySelector('.tiptap ins[data-author-id="ana"]')!;
    expect(ins.textContent).toBe('The primary endpoint was met in the treatment group at Week 8.');
    expect(ins.getAttribute('data-source-record')).toBe('TURN-detailed');
    expect(document.querySelector('.tiptap del[data-author-id="ana"]')?.textContent).toBe('The primary endpoint was met in the treatment group.');
    // The unchosen paragraph, and the current paragraph nothing was paired with, are untouched.
    expect(document.querySelectorAll('.tiptap ins, .tiptap del')).toHaveLength(2);
    expect(document.querySelector('.tiptap')?.textContent).toContain('All randomized participants were included in the efficacy analysis.');
    expect(document.querySelector('.tiptap')?.textContent).not.toContain('Sensitivity analyses');
    await screen.findByText(/1 paragraph is in the editor as a tracked change/);
    expect(patched()).toHaveLength(0);
    expect(sent('/ai/draft/accept')).toHaveLength(0);
  });

  it('adds chosen paragraphs to an empty section as one addition, each decided on its own', async () => {
    serve('<p></p>');
    const group = await openAlternatives(true);
    fireEvent.click(within(group).getByRole('radio', { name: /Concise/ }));
    const choice = screen.getByRole('group', { name: /paragraphs of the concise alternative/i });
    expect(within(choice).queryByLabelText('Paragraph 1 replaces')).toBeNull();
    fireEvent.click(within(choice).getByRole('checkbox', { name: 'Use paragraph 1' }));
    fireEvent.click(within(choice).getByRole('checkbox', { name: 'Use paragraph 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 chosen paragraphs as tracked changes' }));
    await waitFor(() => expect(document.querySelectorAll('.tiptap ins[data-author-id="ana"]')).toHaveLength(2));
    const inserted = [...document.querySelectorAll('.tiptap ins[data-author-id="ana"]')];
    expect(inserted.map(n => n.textContent)).toEqual(['The analysis set included all randomized participants.', 'The primary endpoint was met.']);
    expect(inserted.every(n => n.getAttribute('data-source-record') === 'TURN-concise')).toBe(true);
    expect(document.querySelector('.tiptap del')).toBeNull();
    expect(patched()).toHaveLength(0);
  });

  it('keeps an answer the governed-write rule does not admit out of the section', async () => {
    serve(CURRENT, false);
    await openAlternatives();
    const choice = screen.getByRole('group', { name: /paragraphs of the professional alternative/i });
    fireEvent.click(within(choice).getByRole('checkbox', { name: 'Use paragraph 1' }));
    const add = screen.getByRole('button', { name: 'Add 1 chosen paragraph as tracked changes' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getByTestId('ai-draft-paragraph-note').textContent).toMatch(/not approved for regulatory drafting/);
    fireEvent.click(add);
    expect(document.querySelector('.tiptap ins')).toBeNull();
  });

  it('says before the click that chosen paragraphs carry no source citations', async () => {
    serve(CURRENT);
    await openAlternatives();
    expect(screen.getByTestId('ai-draft-paragraph-note').textContent).toMatch(/carry no source citations/);
  });
});
