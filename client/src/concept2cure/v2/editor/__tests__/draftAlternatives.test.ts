// @vitest-environment jsdom
/** The pure half of slice 1 (docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md): paragraphs, pairing, the proposals and the review state. */
import { describe, expect, it } from 'vitest';
import {
  arrivedAlternative, defaultPairing, draftParagraphAuthor, draftParagraphs, draftShape, NO_ALTERNATIVES, paragraphProposals,
  paragraphRefusal, savedParagraphs, showAlternative,
} from '../draftAlternatives';
import { createEmptyAiDraftReviewState, type PendingAiDraft } from '../authoringDraftTransport';

const draft = (generated: string, id = 'DC-1'): PendingAiDraft => ({ sectionId: 'S1', generated, draftId: id, metadata: {}, check: null });

describe('paragraphs and their shape', () => {
  it('splits a draft at blank lines and keeps a list or a table whole', () => {
    expect(draftParagraphs('One.\n\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |\r\n\r\nTwo.')).toEqual(['One.', '- a\n- b', '| x | y |\n|---|---|\n| 1 | 2 |', 'Two.']);
    expect(draftShape('Of 305 randomized, 290 completed.\n\n| x |')).toEqual({ paragraphs: 2, words: 6 });
  });

  it('reads the saved section as the editor’s text blocks, innermost first', () => {
    expect(savedParagraphs('<h2>Results</h2><p>First  para.</p><ul><li><p>Item</p></li></ul><table><tr><td>Cell</td></tr></table><pre>code</pre>'))
      .toEqual(['Results', 'First para.', 'Item', 'Cell']);
    expect(savedParagraphs('<p></p>')).toEqual([]);
    expect(savedParagraphs('')).toEqual([]);
    expect(savedParagraphs('Plain one.\n\nPlain two.')).toEqual(['Plain one.', 'Plain two.']);
  });
});

describe('default pairing', () => {
  it('pairs each draft paragraph with the current paragraph it shares most words with, not by position', () => {
    const current = ['The primary endpoint was met.', 'All randomized participants were analysed.'];
    expect(defaultPairing(['Participants randomized were all analysed.', 'The primary endpoint was met at Week 8.'], current)).toEqual([1, 0]);
  });
  it('breaks a tie toward the paragraph at the same position, and pairs nothing when there is no current text', () => {
    expect(defaultPairing(['Alpha.', 'Beta.'], ['Gamma.', 'Delta.'])).toEqual([0, 1]);
    expect(defaultPairing(['Alpha.'], [])).toEqual([-1]);
  });
});

describe('the proposals for chosen paragraphs', () => {
  const base = { sectionId: 'S1', baseUpdatedAt: '2026-10-29T10:00:00Z' };
  it('adds to an empty section as one insert-empty addition of the chosen paragraphs, in draft order', () => {
    const { plans } = paragraphProposals({ ...base, draft: ['A.', 'B.', 'C.'], chosen: [2, 0], current: [], pairing: [-1, -1, -1] });
    expect(plans).toEqual([{ replaces: null, paragraphs: [0, 2], proposal: { ...base, operation: 'insert-empty', quote: '', replacement: 'A.\n\nC.' } }]);
  });
  it('replaces each paired current paragraph, joining paragraphs paired with the same one', () => {
    const { plans, unchanged } = paragraphProposals({ ...base, draft: ['New one.', 'New two.', 'Same.'], chosen: [0, 1, 2],
      current: ['Old one.', 'Same.'], pairing: [0, 0, 1] });
    expect(plans).toEqual([{ replaces: 0, paragraphs: [0, 1], proposal: { ...base, quote: 'Old one.', replacement: 'New one.\n\nNew two.' } }]);
    expect(unchanged).toEqual([2]);
  });
  it('sends no base it does not have, and proposes nothing when nothing is chosen', () => {
    expect(paragraphProposals({ ...base, baseUpdatedAt: null, draft: ['A.'], chosen: [0], current: [], pairing: [-1] }).plans[0].proposal)
      .not.toHaveProperty('baseUpdatedAt');
    expect(paragraphProposals({ ...base, draft: ['A.'], chosen: [], current: ['B.'], pairing: [0] }).plans).toEqual([]);
  });
  it('names each refusal by paragraph, in this panel’s terms', () => {
    const plan = { replaces: 1, paragraphs: [2], proposal: { sectionId: 'S1', quote: 'x', replacement: 'y' } };
    expect(paragraphRefusal({ ok: false, reason: 'stale' }, plan)).toBe('Paragraph 3 was not added: the saved section changed after these alternatives were drafted. Draft them again.');
    expect(paragraphRefusal({ ok: false, reason: 'not-found' }, plan)).toMatch(/current paragraph 2 is no longer in the editor/);
    expect(paragraphRefusal({ ok: false, reason: 'model-not-approved', message: 'Refused for the model.' }, plan)).toBe('Paragraph 3 was not added: Refused for the model.');
  });
  it('proposes as AnA, naming the turn only when it was recorded', () => {
    expect(draftParagraphAuthor({ status: 'recorded', id: 'T-1', sha256: 'a'.repeat(64) })).toEqual({ id: 'ana', name: 'AnA (draft alternative)', sourceRecord: 'T-1' });
    expect(draftParagraphAuthor({ status: 'not_recorded', reason: 'x' })).toEqual({ id: 'ana', name: 'AnA (draft alternative)' });
  });
});

describe('review state', () => {
  it('shows the first arrival and lists later ones without moving the view', () => {
    let state = { ...createEmptyAiDraftReviewState(), ...arrivedAlternative(createEmptyAiDraftReviewState(), 'professional', draft('P.', 'DC-P'), ['concise', 'detailed'], true) };
    expect(state).toMatchObject({ shownAlternative: 0, body: 'P.', pendingApproaches: ['concise', 'detailed'] });
    state = { ...state, body: 'P, edited.' };
    state = { ...state, ...arrivedAlternative(state, 'concise', draft('C.', 'DC-C'), ['detailed'], false) };
    expect(state.body).toBe('P, edited.');
    expect(state.draft?.draftId).toBe('DC-P');
    expect(state.alternatives?.map(a => a.approach)).toEqual(['professional', 'concise']);
  });
  it('switching keeps the edits of the alternative left, and is refused while an accept is unresolved', () => {
    let state = { ...createEmptyAiDraftReviewState(), ...arrivedAlternative(createEmptyAiDraftReviewState(), 'professional', draft('P.', 'DC-P'), ['concise'], true) };
    state = { ...state, ...arrivedAlternative(state, 'concise', draft('C.', 'DC-C'), [], false), body: 'P, edited.' };
    state = { ...state, ...showAlternative(state, 1)! };
    expect(state).toMatchObject({ shownAlternative: 1, body: 'C.' });
    expect(state.draft?.draftId).toBe('DC-C');
    state = { ...state, ...showAlternative(state, 0)! };
    expect(state.body).toBe('P, edited.');
    expect(showAlternative({ ...state, acceptUnknown: true }, 1)).toBeNull();
    expect(showAlternative(state, 5)).toBeNull();
    expect(NO_ALTERNATIVES).toEqual({ alternatives: undefined, shownAlternative: undefined, pendingApproaches: undefined });
  });
});
