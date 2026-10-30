// @vitest-environment jsdom
/**
 * Alternatives in the one review panel (docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md,
 * slice 1). The panel asks the existing draft route once per approach; each answer is its own
 * single-use candidate with its own check and record, arrives on its own, keeps its own edits,
 * and the whole-alternative accept sends the candidate the person is looking at.
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
import { AuthoringAiDraft, type AiDraftReviewState } from '../surfaces/AuthoringAiDraft';

const res = (status: number, payload: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => payload }) as Response;

const QUALIFIED = [{ provider: 'anthropic', model: 'qualified-test-model', qualified: true, approvedForHighRisk: true, pq: 'passed' }];
const TEXT: Record<string, string> = {
  professional: 'Professional opening paragraph.\n\nProfessional second paragraph.',
  concise: 'Concise single paragraph.',
  detailed: 'Detailed opening paragraph.\n\nDetailed second paragraph.\n\nDetailed third paragraph.',
};
const draftFor = (tone: string) => ({
  success: true,
  draft: {
    content: TEXT[tone],
    draftId: `DC-${tone}`,
    turnRecord: { status: 'recorded', id: `TURN-${tone}`, sha256: 'a'.repeat(64), servedBy: QUALIFIED },
    check: null,
    metadata: { tone, region: 'FDA', model: 'qualified-test-model', provider: 'anthropic', sourcesRetrieved: 2, attributableSources: 2, retrievalStatus: 'ok', retrievalError: null },
  },
});
const toneOf = (call: unknown[]) => (call[2] as { tone?: string } | undefined)?.tone;
const draftCalls = () => apiRequest.mock.calls.filter((c: unknown[]) => c[0] === 'POST' && String(c[1]).endsWith('/ai/draft'));

const fireToast = vi.fn();
function mount(props: Partial<React.ComponentProps<typeof AuthoringAiDraft>> = {}) {
  return render(
    <AuthoringAiDraft sectionId="S1" sectionCode="11.4.1" sectionTitle="Analysis of Efficacy" region="FDA" docSealed={false}
      editorDirty={false} onAccepted={vi.fn()} onClose={vi.fn()} fireToast={fireToast} {...props} />,
  );
}
const alternatives = () => screen.getByRole('radiogroup', { name: /alternatives/i });
const radio = (name: RegExp) => within(alternatives()).getByRole('radio', { name });

beforeEach(() => {
  apiRequest.mockReset();
  fireToast.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body: { tone?: string }) => {
    if (method === 'POST' && url.endsWith('/ai/draft')) return res(200, draftFor(body.tone ?? 'professional'));
    return res(200, { success: true });
  });
});
afterEach(() => cleanup());

describe('AuthoringAiDraft — up to three alternatives, each its own candidate', () => {
  it('asks the existing draft route once per approach and labels each by what was asked', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Draft three alternatives' }));
    await waitFor(() => expect(within(alternatives()).getAllByRole('radio')).toHaveLength(3));
    await waitFor(() => expect(draftCalls()).toHaveLength(3));
    expect(draftCalls().map(toneOf)).toEqual(['professional', 'concise', 'detailed']);
    expect(radio(/Professional/).getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText(/Asked for a concise text/)).toBeTruthy();
    // Paragraph and word counts are the platform's own count, per alternative.
    expect(within(alternatives()).getByText(/3 paragraphs · 9 words/)).toBeTruthy();
    // The first that arrived is shown; nothing was saved or accepted.
    expect((radio(/Professional/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe(TEXT.professional);
    expect(apiRequest.mock.calls.some((c: unknown[]) => String(c[1]).endsWith('/accept'))).toBe(false);
  });

  it('shows each alternative as it arrives, without moving focus', async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    apiRequest.mockImplementation(async (method: string, url: string, body: { tone?: string }) => {
      if (method === 'POST' && url.endsWith('/ai/draft')) {
        if (body.tone === 'concise') await held;
        return res(200, draftFor(body.tone ?? 'professional'));
      }
      return res(200, { success: true });
    });
    render(<input aria-label="Where the person keeps working" />);
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Draft three alternatives' }));
    // The person goes back to work while AnA drafts; arrivals must not take focus.
    const elsewhere = screen.getByLabelText('Where the person keeps working');
    elsewhere.focus();
    await waitFor(() => expect((radio(/Professional/) as HTMLInputElement).checked).toBe(true));
    expect((radio(/Concise/) as HTMLInputElement).disabled).toBe(true);
    expect(within(alternatives()).getByText(/Concise.*drafting/i)).toBeTruthy();
    expect(screen.getByTestId('ai-draft-alternatives-status').textContent).toMatch(/Professional alternative is ready \(1 of 3\)/);
    expect(document.activeElement).toBe(elsewhere);
    release();
    await waitFor(() => expect((radio(/Detailed/) as HTMLInputElement).disabled).toBe(false));
    expect((radio(/Professional/) as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement).toBe(elsewhere);
  });

  it('puts focus on the alternative shown when the control the person pressed leaves the panel', async () => {
    mount();
    const button = screen.getByRole('button', { name: 'Draft three alternatives' });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect((radio(/Professional/) as HTMLInputElement).checked).toBe(true));
    expect(document.activeElement).toBe(radio(/Professional/));
  });

  it('keeps each alternative’s own edits when the person switches between them', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Draft three alternatives' }));
    await waitFor(() => expect((radio(/Detailed/) as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(screen.getByTestId('ai-draft-body'), { target: { value: 'Professional, edited by the author.' } });
    fireEvent.click(radio(/Concise/));
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe(TEXT.concise);
    fireEvent.click(radio(/Professional/));
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe('Professional, edited by the author.');
  });

});

describe('AuthoringAiDraft — accepting, comparing and ending a set of alternatives', () => {
  it('accepts the whole alternative that is shown, through the existing accept', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Draft three alternatives' }));
    await waitFor(() => expect((radio(/Detailed/) as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(radio(/Detailed/));
    apiRequest.mockImplementationOnce(async () => res(200, { success: true, section: { id: 'S1', content: TEXT.detailed }, attribution: { sourceSpans: 0, authorSpans: 1, distinctSources: 0, coverage: 0 } }));
    fireEvent.click(screen.getByTestId('ai-draft-accept'));
    await waitFor(() => expect(apiRequest.mock.calls.some((c: unknown[]) => String(c[1]).endsWith('/ai/draft/accept'))).toBe(true));
    const accept = apiRequest.mock.calls.find((c: unknown[]) => String(c[1]).endsWith('/ai/draft/accept'))!;
    expect(accept[2]).toMatchObject({ draftId: 'DC-detailed', content: TEXT.detailed });
  });

  it('compares the shown alternative with another one as a redline', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Draft three alternatives' }));
    await waitFor(() => expect((radio(/Detailed/) as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText('Compare with'), { target: { value: 'alternative:2' } });
    const redline = screen.getByTestId('ai-draft-compare');
    expect(redline.querySelector('ins')?.textContent).toMatch(/Professional/);
    expect(redline.querySelector('del')?.textContent).toMatch(/Detailed/);
  });

  it('says how many arrived when one alternative fails, and keeps the ones that did', async () => {
    apiRequest.mockImplementation(async (method: string, url: string, body: { tone?: string }) => {
      if (method === 'POST' && url.endsWith('/ai/draft') && body.tone === 'concise') {
        throw new ApiRequestError('The AI provider is busy.', 429, { success: false, error: { code: 'RATE_LIMITED', message: 'The AI provider is busy.' } }, 'RATE_LIMITED');
      }
      if (method === 'POST' && url.endsWith('/ai/draft')) return res(200, draftFor(body.tone ?? 'professional'));
      return res(200, { success: true });
    });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Draft three alternatives' }));
    await waitFor(() => expect(fireToast).toHaveBeenCalled());
    expect(fireToast.mock.calls[0][0]).toMatch(/Drafted 1 of 3 alternatives\. The concise alternative could not be drafted — The AI provider is busy\./);
    expect(draftCalls()).toHaveLength(2);
    expect(within(alternatives()).getAllByRole('radio')).toHaveLength(1);
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe(TEXT.professional);
  });

  it('refuses with no provider and shows nothing that looks like a draft', async () => {
    apiRequest.mockImplementation(async () => {
      throw new ApiRequestError('No AI provider', 503, { success: false, error: { code: 'GATEWAY_UNAVAILABLE', message: 'No AI provider' } }, 'GATEWAY_UNAVAILABLE');
    });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Draft three alternatives' }));
    await screen.findByTestId('ai-draft-refusal');
    expect(screen.getByTestId('ai-draft-refusal').textContent).toMatch(/No AI provider is configured/);
    expect(screen.queryByRole('radiogroup', { name: /alternatives/i })).toBeNull();
    expect(screen.queryByTestId('ai-draft-body')).toBeNull();
    expect(draftCalls()).toHaveLength(1);
  });

  it('discarding drops every alternative, from the screen and from the retained review', async () => {
    // The build coordinator retains a section's review across close and reopen; a
    // discarded alternative must not survive there as a candidate someone can return to.
    let retained: AiDraftReviewState = { draft: null, body: '', changeReason: '', refusal: null };
    function Controlled() {
      const [state, setState] = React.useState(retained);
      return <AuthoringAiDraft sectionId="S1" sectionCode="11.4.1" sectionTitle="Analysis of Efficacy" region="FDA" docSealed={false}
        editorDirty={false} onAccepted={vi.fn()} onClose={vi.fn()} fireToast={fireToast}
        reviewSession={{ state, update: next => { retained = next; setState(next); }, isCurrent: () => true }} />;
    }
    render(<Controlled />);
    fireEvent.click(screen.getByRole('button', { name: 'Draft three alternatives' }));
    await waitFor(() => expect((radio(/Detailed/) as HTMLInputElement).disabled).toBe(false));
    expect(retained.alternatives).toHaveLength(3);
    fireEvent.click(screen.getByTestId('ai-draft-discard'));
    expect(screen.queryByRole('radiogroup', { name: /alternatives/i })).toBeNull();
    expect(screen.queryByTestId('ai-draft-body')).toBeNull();
    expect(retained.alternatives).toBeUndefined();
    expect(retained.shownAlternative).toBeUndefined();
  });
});
