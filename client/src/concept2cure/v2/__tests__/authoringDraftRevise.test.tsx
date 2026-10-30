// @vitest-environment jsdom
/**
 * Revise by instruction in the one review panel (docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md,
 * slice 3). A revision asks the existing draft route to revise the live candidate shown, by its
 * draftId. It arrives as a new entry derived from the one it names, shown against that text as a
 * redline; nothing it revises is replaced, and the person can go back to any earlier entry.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { AuthoringAiDraft } from '../surfaces/AuthoringAiDraft';

const res = (status: number, payload: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => payload }) as Response;

const QUALIFIED = [{ provider: 'anthropic', model: 'qualified-test-model', qualified: true, approvedForHighRisk: true, pq: 'passed' }];
const TEXT: Record<string, string> = {
  professional: 'Professional opening paragraph.\n\nProfessional second paragraph.',
  concise: 'Concise single paragraph about the primary endpoint.',
  detailed: 'Detailed opening paragraph.\n\nDetailed second paragraph.\n\nDetailed third paragraph.',
};
type Body = { tone?: string; revise?: { fromDraftId: string; instruction: string } };
let revisions = 0;
/** The server: a draft per tone; a revision derived from the candidate named, as parked. */
function reply(body: Body, derive = true) {
  const tone = body.tone ?? 'professional';
  if (body.revise) {
    revisions += 1;
    const id = `DC-rev-${revisions}`;
    return { success: true, draft: { content: `Revised ${revisions}: concise text about the endpoint.`, draftId: id, check: null,
      turnRecord: { status: 'recorded', id: `TURN-rev-${revisions}`, sha256: 'a'.repeat(64), servedBy: QUALIFIED },
      ...(derive ? { derivedFrom: { draftId: body.revise.fromDraftId, contentSha256: 'c'.repeat(64), instruction: body.revise.instruction } } : {}),
      metadata: { tone, region: 'FDA', model: 'qualified-test-model', provider: 'anthropic', sourcesRetrieved: 2, attributableSources: 2, retrievalStatus: 'ok' } } };
  }
  return { success: true, draft: { content: TEXT[tone], draftId: `DC-${tone}`, check: null,
    turnRecord: { status: 'recorded', id: `TURN-${tone}`, sha256: 'a'.repeat(64), servedBy: QUALIFIED },
    metadata: { tone, region: 'FDA', model: 'qualified-test-model', provider: 'anthropic', sourcesRetrieved: 2, attributableSources: 2, retrievalStatus: 'ok' } } };
}
const draftCalls = () => apiRequest.mock.calls.filter((c: unknown[]) => c[0] === 'POST' && String(c[1]).endsWith('/ai/draft'));
const revisionCalls = () => draftCalls().filter((c: unknown[]) => (c[2] as Body).revise);

const fireToast = vi.fn();
const mount = () => render(<AuthoringAiDraft sectionId="S1" sectionCode="11.4.1" sectionTitle="Analysis of Efficacy" docSealed={false}
  editorDirty={false} onAccepted={vi.fn()} onClose={vi.fn()} fireToast={fireToast} />);
const alternatives = () => screen.getByRole('radiogroup', { name: /alternatives/i });
const radio = (name: RegExp) => within(alternatives()).getByRole('radio', { name });
const body = () => (screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value;
const reviseGroup = () => screen.getByRole('group', { name: /ask AnA to revise/i });

async function threeAlternatives() {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Draft three alternatives' }));
  await waitFor(() => expect((radio(/Detailed/) as HTMLInputElement).disabled).toBe(false));
}

beforeEach(() => {
  revisions = 0;
  apiRequest.mockReset();
  fireToast.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, b: Body) => {
    if (method === 'POST' && url.endsWith('/ai/draft')) return res(200, reply(b));
    return res(200, { success: true });
  });
});
afterEach(() => cleanup());

describe('AuthoringAiDraft — revise the text shown by instruction', () => {
  it('asks the existing route to revise the candidate shown, by its draftId and its tone, with the instruction as sent', async () => {
    await threeAlternatives();
    fireEvent.click(radio(/Concise/));
    // The person's edits stay with the text shown; the server revises the candidate as parked.
    fireEvent.change(screen.getByTestId('ai-draft-body'), { target: { value: 'Concise, edited by the author.' } });
    fireEvent.click(within(reviseGroup()).getByRole('button', { name: 'Shorter' }));
    await waitFor(() => expect(within(alternatives()).getAllByRole('radio')).toHaveLength(4));
    expect(revisionCalls()).toHaveLength(1);
    const sent = revisionCalls()[0][2] as Body & Record<string, unknown>;
    expect(sent.revise).toEqual({ fromDraftId: 'DC-concise', instruction: 'Shorter' });
    expect(sent.tone).toBe('concise');
    expect(JSON.stringify(sent)).not.toContain('edited by the author');
    // A new entry, shown; the alternative it revises is still there with its edits.
    expect((radio(/Revised: Shorter/) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Revises the concise alternative/)).toBeTruthy();
    expect(body()).toBe('Revised 1: concise text about the endpoint.');
    fireEvent.click(radio(/Concise/));
    expect(body()).toBe('Concise, edited by the author.');
    expect(screen.getByTestId('ai-draft-alternatives-status').textContent).toMatch(/The revision “Shorter” is ready and shown\. The text it revises is kept\./);
    expect(apiRequest.mock.calls.some((c: unknown[]) => String(c[1]).endsWith('/accept'))).toBe(false);
  });

  it('shows the revision against the text it revised as a redline, and the person can go back to any earlier entry', async () => {
    await threeAlternatives();
    fireEvent.click(radio(/Concise/));
    fireEvent.click(within(reviseGroup()).getByRole('button', { name: 'Shorter' }));
    await waitFor(() => expect((radio(/Revised: Shorter/) as HTMLInputElement).checked).toBe(true));
    expect((screen.getByLabelText('Compare with') as HTMLSelectElement).value).toBe('revised');
    const marks = (tag: string) => [...screen.getByTestId('ai-draft-compare').querySelectorAll(tag)].map(n => n.textContent).join(' ');
    expect(marks('del')).toMatch(/single paragraph/);
    expect(marks('ins')).toMatch(/Revised 1/);
    // A revision of the revision: revision N against revision N-1.
    fireEvent.change(screen.getByLabelText('Your instruction'), { target: { value: '  Follow the order of the SAP  ' } });
    fireEvent.click(within(reviseGroup()).getByRole('button', { name: 'Revise' }));
    await waitFor(() => expect(within(alternatives()).getAllByRole('radio')).toHaveLength(5));
    expect((revisionCalls()[1][2] as Body).revise).toEqual({ fromDraftId: 'DC-rev-1', instruction: 'Follow the order of the SAP' });
    expect(screen.getByText(/Revises the revision “Shorter”/)).toBeTruthy();
    // “Revised 1: …” against “Revised 2: …”: only the number differs, not the concise text further back.
    expect(marks('del').trim()).toMatch(/^1:?$/);
    expect(marks('ins').trim()).toMatch(/^2:?$/);
    for (const [name, text] of [[/Professional/, TEXT.professional], [/Revised: Shorter/, 'Revised 1: concise text about the endpoint.'],
      [/Detailed/, TEXT.detailed]] as const) {
      fireEvent.click(radio(name));
      expect(body()).toBe(text);
    }
  });

  it('keeps focus where the person is: on the control pressed, or wherever they moved it', async () => {
    await threeAlternatives();
    const shorter = within(reviseGroup()).getByRole('button', { name: 'Shorter' });
    shorter.focus();
    fireEvent.click(shorter);
    // A browser drops focus from a control disabled while AnA revises; it returns when the revision ends.
    // (jsdom keeps focus on a disabled control, so the drop to the page is made here.)
    const transient = document.body.appendChild(document.createElement('input'));
    transient.focus();
    transient.remove();
    expect(document.activeElement).toBe(document.body);
    await waitFor(() => expect((radio(/Revised: Shorter/) as HTMLInputElement).checked).toBe(true));
    await waitFor(() => expect(document.activeElement).toBe(shorter));
    // Focus the person moved elsewhere during the next revision stays there.
    render(<input aria-label="Where the person keeps working" />);
    fireEvent.click(within(reviseGroup()).getByRole('button', { name: 'Follow the SAP wording' }));
    const elsewhere = screen.getByLabelText('Where the person keeps working');
    elsewhere.focus();
    await waitFor(() => expect(within(alternatives()).getAllByRole('radio')).toHaveLength(5));
    expect(document.activeElement).toBe(elsewhere);
  });

  it('accepts the whole revision through the existing accept, by the revision’s own candidate', async () => {
    await threeAlternatives();
    fireEvent.click(within(reviseGroup()).getByRole('button', { name: 'Shorter' }));
    await waitFor(() => expect((radio(/Revised: Shorter/) as HTMLInputElement).checked).toBe(true));
    expect(screen.getByTestId('ai-draft-accept').textContent).toBe('Accept the whole revision and record citations');
    apiRequest.mockImplementationOnce(async () => res(200, { success: true, section: { id: 'S1', content: 'x' }, attribution: { sourceSpans: 0, authorSpans: 1, distinctSources: 0, coverage: 0 } }));
    fireEvent.click(screen.getByTestId('ai-draft-accept'));
    await waitFor(() => expect(apiRequest.mock.calls.some((c: unknown[]) => String(c[1]).endsWith('/ai/draft/accept'))).toBe(true));
    const accept = apiRequest.mock.calls.find((c: unknown[]) => String(c[1]).endsWith('/ai/draft/accept'))!;
    expect(accept[2]).toMatchObject({ draftId: 'DC-rev-1' });
  });

  it('revises a lone draft and lists both, keeping “Draft again” a single draft', async () => {
    mount();
    fireEvent.click(screen.getByTestId('ai-draft-generate'));
    await waitFor(() => expect(body()).toBe(TEXT.professional));
    expect(screen.queryByRole('radiogroup', { name: /alternatives/i })).toBeNull();
    fireEvent.click(within(reviseGroup()).getByRole('button', { name: 'Follow the SAP wording' }));
    await waitFor(() => expect(within(alternatives()).getAllByRole('radio')).toHaveLength(2));
    expect((revisionCalls()[0][2] as Body).revise).toEqual({ fromDraftId: 'DC-professional', instruction: 'Follow the SAP wording' });
    expect(screen.getByText(/Revises the draft/)).toBeTruthy();
    expect(screen.getByTestId('ai-draft-regenerate').textContent).toBe('Draft again');
    fireEvent.click(radio(/Professional/));
    expect(body()).toBe(TEXT.professional);
  });
});

describe('AuthoringAiDraft — a revision fails closed', () => {
  it('refuses an answer the server did not derive from the text shown, and keeps what is shown', async () => {
    await threeAlternatives();
    apiRequest.mockImplementation(async (method: string, url: string, b: Body) => res(200, reply(b, false)));
    fireEvent.click(within(reviseGroup()).getByRole('button', { name: 'Shorter' }));
    await screen.findByTestId('ai-draft-refusal');
    expect(screen.getByTestId('ai-draft-refusal').textContent).toMatch(/did not confirm that this revision was drafted from the text shown, so it was not added\. The text shown is kept and nothing was changed\. Ask for the revision again\./);
    expect(within(alternatives()).getAllByRole('radio')).toHaveLength(3);
    expect(body()).toBe(TEXT.professional);
  });

  it('says a revision failed and keeps the text shown', async () => {
    await threeAlternatives();
    apiRequest.mockImplementation(async () => {
      throw new ApiRequestError('The draft to revise has expired.', 409, { success: false, error: { code: 'REVISION_BASE_UNAVAILABLE', message: 'The draft to revise has expired.' } }, 'REVISION_BASE_UNAVAILABLE');
    });
    fireEvent.click(within(reviseGroup()).getByRole('button', { name: 'Shorter' }));
    await waitFor(() => expect(fireToast).toHaveBeenCalled());
    expect(fireToast.mock.calls[0][0]).toBe('Couldn’t revise this text — The draft to revise has expired. The text shown is kept; nothing was changed.');
    expect(within(alternatives()).getAllByRole('radio')).toHaveLength(3);
    expect(body()).toBe(TEXT.professional);
  });

  it('cannot revise a draft the server did not retain, and says why before the click', async () => {
    apiRequest.mockImplementation(async (method: string, url: string, b: Body) => {
      const r = reply(b);
      return res(200, { ...r, draft: { ...r.draft, draftId: undefined } });
    });
    mount();
    fireEvent.click(screen.getByTestId('ai-draft-generate'));
    await waitFor(() => expect(body()).toBe(TEXT.professional));
    const shorter = within(reviseGroup()).getByRole('button', { name: 'Shorter' }) as HTMLButtonElement;
    expect(shorter.disabled).toBe(true);
    expect(screen.getByTestId('ai-draft-revise-note').textContent).toMatch(/not retained on the server, so it cannot be revised/);
    fireEvent.click(shorter);
    expect(revisionCalls()).toHaveLength(0);
  });

  it('says before the click that AnA does not supply figures and the check names any the sources do not hold', async () => {
    await threeAlternatives();
    expect(screen.getByTestId('ai-draft-revise-note').textContent).toMatch(/AnA does not supply figures: the check names any figure the sources shown do not hold/);
    expect((within(reviseGroup()).getByRole('button', { name: 'Revise' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
