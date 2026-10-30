// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));

import { ApiRequestError } from '@/lib/queryClient';
import { AuthoringAiDraft, type AiDraftReviewState, type AuthoringAiDraftProps } from '../surfaces/AuthoringAiDraft';
import { publishShellProject } from '../shellProject';

// Structural fixture typing keeps RED on the existing panel's behavior, without importing a future symbol.
interface Inputs { tone: string; region: string; context: string; requirements: string }
type Review = AiDraftReviewState & { generationInputs?: Inputs };
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const FIRST = '44444444-4444-4444-8444-444444444444';
const SECOND = '55555555-5555-4555-8555-555555555555';
const onAccepted = vi.fn();
const fireToast = vi.fn();
const onClose = vi.fn();
const defaults = (region = 'FDA'): Inputs => ({ tone: 'professional', region, context: '', requirements: '' });
const chosen = (region = 'PMDA'): Inputs => ({ tone: 'concise', region,
  context: 'Use the recorded diagnostic assay validation reference.', requirements: 'State the limitations and distinguish missing evidence.' });
const response = (body: unknown): Response => ({ ok: true, status: 200, json: async () => body }) as Response;
const candidateReply = () => response({ success: true,
  draft: { content: 'New review candidate.', draftId: 'new-candidate', metadata: { region: 'MHRA' } } });
function empty(): Review { return { draft: null, body: '', changeReason: '', refusal: null }; }
function retained(sectionId = FIRST, generationInputs?: Inputs): Review {
  return { draft: { sectionId, generated: 'Original model wording.', draftId: `draft-${sectionId}`,
    metadata: { tone: 'detailed', region: 'MHRA' }, check: null }, body: 'Human-reviewed scientific wording.',
  changeReason: 'Checked the stated limitations against the source.', refusal: null,
  ...(generationInputs ? { generationInputs } : {}) };
}
function props(extra: Partial<AuthoringAiDraftProps> = {}): AuthoringAiDraftProps {
  return { sectionId: FIRST, docId: DOC, programId: PROGRAM, sectionCode: 'purpose', sectionTitle: 'Scientific purpose',
    docSealed: false, editorDirty: false, region: 'FDA', onAccepted, onClose, fireToast, ...extra };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
function controlled(first: Review, second: Review = empty(), extra: Partial<AuthoringAiDraftProps> = {}) {
  let latest: Record<string, Review> = { [FIRST]: first, [SECOND]: second };
  const current = { value: true };
  function Owner() {
    const [reviews, setReviews] = useState(latest);
    const [selected, select] = useState(FIRST);
    const [open, setOpen] = useState(true);
    latest = reviews;
    return <>
      <button type="button" onClick={() => select(selected === FIRST ? SECOND : FIRST)}>Switch section</button>
      <button type="button" onClick={() => setOpen(true)}>Reopen review</button>
      {open && <AuthoringAiDraft key={selected} {...props({ ...extra, sectionId: selected,
        onClose: () => { onClose(); setOpen(false); } })}
      reviewSession={{ state: reviews[selected],
        update: next => setReviews(all => ({ ...all, [selected]: next })), isCurrent: () => current.value }} />}
    </>;
  }
  const view = render(<Owner />);
  return { ...view, current, read: (sectionId = FIRST) => latest[sectionId] };
}
function options(): Inputs {
  return { tone: (screen.getByLabelText('Tone') as HTMLSelectElement).value,
    region: (screen.getByLabelText('Region') as HTMLSelectElement).value,
    context: (screen.getByPlaceholderText('What this section needs to establish') as HTMLInputElement).value,
    requirements: (screen.getByPlaceholderText('Constraints the draft must satisfy') as HTMLInputElement).value };
}
function edit(input: Inputs) {
  fireEvent.change(screen.getByLabelText('Tone'), { target: { value: input.tone } });
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: input.region } });
  fireEvent.change(screen.getByPlaceholderText('What this section needs to establish'), { target: { value: input.context } });
  fireEvent.change(screen.getByPlaceholderText('Constraints the draft must satisfy'), { target: { value: input.requirements } });
}
function draftCalls() { return apiRequest.mock.calls.filter(([, path]) => String(path).endsWith('/ai/draft')); }
function acceptCalls() { return apiRequest.mock.calls.filter(([, path]) => String(path).endsWith('/accept')); }
async function generate(regenerate = false) {
  await act(async () => { fireEvent.click(screen.getByTestId(regenerate ? 'ai-draft-regenerate' : 'ai-draft-generate')); });
}
function closeAndReopen() {
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByTestId('ai-draft-panel')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reopen review' }));
}

beforeEach(() => {
  clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(`fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`,
    { id: '7', organizationId: '12', roles: ['author'], permissions: [] }, 'fixture-refresh', 3600);
  publishShellProject({ id: PROGRAM });
  apiRequest.mockReset().mockImplementation(async () => candidateReply());
  onAccepted.mockReset(); onClose.mockReset(); fireToast.mockReset();
});
afterEach(() => {
  cleanup(); authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  delete window.C2C_PROJECT;
});

describe('existing retained review uses its explicit regional generation inputs', () => {
  it.each(['PMDA', 'EMA', 'Health Canada', 'FDA'])('regenerates %s with its retained inputs and ignores conflicting optional metadata', async region => {
    const input = chosen(region); const original = retained(FIRST, input);
    controlled(original, empty(), { region: 'MHRA' });
    expect(screen.queryByLabelText('Region')).toBeNull();

    await generate(true);

    expect(draftCalls()).toHaveLength(1);
    expect(draftCalls()[0]).toEqual(['POST', `/api/authoring/sections/${FIRST}/ai/draft`, input]);
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe('New review candidate.');
    expect(acceptCalls()).toHaveLength(0);
    expect(onAccepted).not.toHaveBeenCalled();
    expect(input).toEqual(chosen(region));
  });

  it.each([undefined, 'Health Canada'])('uses an explicit supported standalone choice, with no default for initialRegion=%s', async region => {
    render(<AuthoringAiDraft {...props({ region })} />);
    expect(options()).toEqual(defaults(region ?? ''));

    if (!region) {
      expect((screen.getByTestId('ai-draft-generate') as HTMLButtonElement).disabled).toBe(true);
      await generate();
      expect(draftCalls()).toHaveLength(0);
      fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'FDA' } });
    }

    await generate();

    expect(draftCalls()[0][2]).toEqual({ tone: 'professional', region: region ?? 'FDA' });
    expect(acceptCalls()).toHaveLength(0);
  });

  it('keeps a legacy controlled candidate compatible with initialRegion rather than provider metadata', async () => {
    controlled(retained(), empty(), { region: 'EMA' });
    await generate(true);
    expect(draftCalls()[0][2]).toEqual({ tone: 'professional', region: 'EMA' });
    expect(acceptCalls()).toHaveLength(0);
  });

  it('Discard exposes the retained inputs in the same existing four controls', () => {
    const input = chosen('PMDA'); const view = controlled(retained(FIRST, input));
    fireEvent.click(screen.getByTestId('ai-draft-discard'));

    expect(options()).toEqual(input);
    expect(view.read()).toMatchObject({ draft: null, body: '', generationInputs: input });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('explicit control edits remain in the existing retained review buffer', () => {
  it('keeps all four manual options through generation, Discard and a controlled Close/reopen', async () => {
    const input = chosen('Health Canada'); const view = controlled(empty()); edit(input);
    await generate();
    expect(draftCalls()[0][2]).toEqual(input);
    fireEvent.click(screen.getByTestId('ai-draft-discard'));
    closeAndReopen();

    expect(options()).toEqual(input);
    expect(view.read().generationInputs).toEqual(input);
    await generate();
    expect(draftCalls().map(([, , request]) => request)).toEqual([input, input]);
    expect(acceptCalls()).toHaveLength(0);
  });

  it('isolates manual options for each section across actual controlled remounts', () => {
    const first = chosen('PMDA'); const second = { ...chosen('EMA'), tone: 'detailed', context: 'Second section reference.', requirements: 'Second section constraints.' };
    const view = controlled(empty()); edit(first);
    fireEvent.click(screen.getByRole('button', { name: 'Switch section' })); edit(second);
    fireEvent.click(screen.getByRole('button', { name: 'Switch section' }));

    expect(options()).toEqual(first);
    expect(view.read(FIRST).generationInputs).toEqual(first);
    fireEvent.click(screen.getByRole('button', { name: 'Switch section' }));
    expect(options()).toEqual(second);
    expect(view.read(SECOND).generationInputs).toEqual(second);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('merges synchronous edits to different fields without overwriting earlier values', async () => {
    const input = chosen('PMDA'); const view = controlled(empty());
    act(() => { edit(input); });
    closeAndReopen();

    expect(options()).toEqual(input);
    expect(view.read().generationInputs).toEqual(input);
    await generate();
    expect(draftCalls()[0][2]).toEqual(input);
    expect(acceptCalls()).toHaveLength(0);
  });

  it.each(['transport', 'truncated', 'provider'] as const)('a %s regeneration refusal preserves the reviewed candidate, reason and options', async mode => {
    const input = chosen('PMDA'); const original = retained(FIRST, input); const view = controlled(original);
    apiRequest.mockRejectedValueOnce(mode === 'transport' ? new TypeError('Synthetic connection lost')
      : new ApiRequestError('Synthetic generation refused', mode === 'truncated' ? 422 : 503,
        { error: { code: mode === 'truncated' ? 'DRAFT_TRUNCATED' : 'GATEWAY_UNAVAILABLE' } },
        mode === 'truncated' ? 'DRAFT_TRUNCATED' : 'GATEWAY_UNAVAILABLE'));

    await generate(true);

    expect(draftCalls()[0][2]).toEqual(input);
    expect(view.read()).toMatchObject({ draft: original.draft, body: original.body, changeReason: original.changeReason, generationInputs: input });
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe(original.body);
    expect((screen.getByPlaceholderText('Accepted AI draft') as HTMLInputElement).value).toBe(original.changeReason);
    fireEvent.click(screen.getByTestId('ai-draft-discard'));
    closeAndReopen();
    expect(options()).toEqual(input);
    expect(acceptCalls()).toHaveLength(0);
    expect(onAccepted).not.toHaveBeenCalled();
  });
});

describe('retained inputs do not bypass acceptance or currentness holds', () => {
  it('unknown acceptance prevents another generation and preserves the retained inputs', async () => {
    const original = { ...retained(FIRST, chosen()), acceptUnknown: true };
    const view = controlled(original);
    expect((screen.getByTestId('ai-draft-regenerate') as HTMLButtonElement).disabled).toBe(true);
    await generate(true);
    expect(apiRequest).not.toHaveBeenCalled();
    expect(view.read()).toEqual(original);
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('a no-longer-current retained session cannot generate from its options', async () => {
    const original = retained(FIRST, chosen()); const view = controlled(original); view.current.value = false;
    await generate(true);
    expect(apiRequest).not.toHaveBeenCalled();
    expect(view.read()).toEqual(original);
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it.each(['session', 'project-round-trip', 'section-switch', 'unmount'] as const)(
    'does not replace the prior candidate or cross retained section inputs after a delayed %s change', async transition => {
      const original = retained(FIRST, chosen('PMDA')); const second = retained(SECOND, chosen('EMA'));
      const view = controlled(original, second); const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise);
      act(() => { fireEvent.click(screen.getByTestId('ai-draft-regenerate')); });
      await waitFor(() => expect(draftCalls()).toHaveLength(1));
      if (transition === 'session') view.current.value = false;
      if (transition === 'project-round-trip') { publishShellProject({ id: OTHER }); publishShellProject({ id: PROGRAM }); }
      if (transition === 'section-switch') fireEvent.click(screen.getByRole('button', { name: 'Switch section' }));
      if (transition === 'unmount') view.unmount();

      await act(async () => { pending.resolve(candidateReply()); await pending.promise; });

      expect(view.read(FIRST)).toMatchObject({ draft: original.draft, body: original.body, changeReason: original.changeReason, generationInputs: original.generationInputs });
      expect(view.read(SECOND)).toEqual(second);
      expect(draftCalls()).toHaveLength(1);
      expect(acceptCalls()).toHaveLength(0);
      expect(onAccepted).not.toHaveBeenCalled();
    });
});
