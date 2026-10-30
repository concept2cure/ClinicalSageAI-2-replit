// @vitest-environment jsdom
/** The pure half of slice 1 (docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md): paragraphs, pairing, the proposals and the review state. */
import { describe, expect, it } from 'vitest';
import {
  alternativeDescription, alternativeLabel, alternativeName, alternativeWording, arrivedAlternative, defaultPairing, draftParagraphAuthor,
  draftParagraphs, draftShape, NO_ALTERNATIVES, paragraphProposals, paragraphRefusal, revisedAlternative, revisionRefusal, revisionTarget,
  savedParagraphs, showAlternative,
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

describe('revise by instruction (slice 3)', () => {
  const two = () => {
    let state = { ...createEmptyAiDraftReviewState(), ...arrivedAlternative(createEmptyAiDraftReviewState(), 'professional', draft('P.', 'DC-P'), ['concise'], true) };
    state = { ...state, ...arrivedAlternative(state, 'concise', draft('C.', 'DC-C'), [], false) };
    return { ...state, ...showAlternative(state, 1)! };
  };
  it('targets the entry shown, its candidate and its approach, and nothing while an accept is unresolved', () => {
    const state = two();
    expect(revisionTarget(state, 'detailed')).toEqual({ from: 1, fromDraftId: 'DC-C', approach: 'concise' });
    expect(revisionTarget({ ...state, acceptUnknown: true }, 'detailed')).toBeNull();
    expect(revisionTarget({ ...state, baseChanged: true }, 'detailed')).toBeNull();
    const lone = { ...createEmptyAiDraftReviewState(), draft: { ...draft('L.', 'DC-L'), metadata: { tone: 'detailed' } }, body: 'L.' };
    expect(revisionTarget(lone, 'professional')).toEqual({ from: 0, fromDraftId: 'DC-L', approach: 'detailed' });
    expect(revisionTarget({ ...lone, draft: { ...lone.draft, draftId: null } }, 'professional')).toBeNull();
  });
  it('joins the list as a new entry derived from the one named, shown, with nothing it revises replaced', () => {
    const state = { ...two(), body: 'C, edited.' };
    const next = { ...state, ...revisedAlternative(state, { from: 1, fromDraftId: 'DC-C', approach: 'concise' }, draft('R.', 'DC-R'), 'Shorter') };
    expect(next.alternatives?.map(a => a.draft.draftId)).toEqual(['DC-P', 'DC-C', 'DC-R']);
    expect(next.alternatives?.[1].body).toBe('C, edited.');
    expect(next.alternatives?.[2]).toMatchObject({ approach: 'concise', body: 'R.', revision: { from: 1, instruction: 'Shorter' } });
    expect(next).toMatchObject({ shownAlternative: 2, body: 'R.' });
    expect(next.draft?.draftId).toBe('DC-R');
    expect(alternativeLabel(next.alternatives![2])).toBe('Revised: Shorter');
    expect(alternativeDescription(next.alternatives!, 2)).toBe('Revises the concise alternative · 1 paragraph · 1 word');
    expect(alternativeWording(next, false)).toMatchObject({ set: true, paragraphLabel: 'the revision “Shorter”', accept: 'Accept the whole revision and record citations' });
  });
  it('lists a lone draft first, so the person can go back to it, and keeps “Draft again” a single draft', () => {
    const lone = { ...createEmptyAiDraftReviewState(), draft: draft('L.', 'DC-L'), body: 'L, edited.' };
    const next = { ...lone, ...revisedAlternative(lone, { from: 0, fromDraftId: 'DC-L', approach: 'professional' }, draft('R.', 'DC-R'), 'x'.repeat(60)) };
    expect(next.alternatives?.map(a => [a.draft.draftId, a.body, !!a.single])).toEqual([['DC-L', 'L, edited.', true], ['DC-R', 'R.', false]]);
    expect(alternativeName(next.alternatives!, 0)).toBe('the draft');
    expect(alternativeLabel(next.alternatives![1])).toBe(`Revised: ${'x'.repeat(48)}…`);
    expect(alternativeWording(next, false)).toMatchObject({ set: false, again: 'Draft again', accept: 'Accept the whole revision and record citations' });
  });
  it('names why the text shown cannot be revised', () => {
    expect(revisionRefusal(two(), true)).toMatch(/frozen/);
    expect(revisionRefusal({ ...two(), draft: { ...draft('P.'), draftId: null } }, false)).toMatch(/not retained on the server/);
    expect(revisionRefusal({ ...two(), baseChanged: true }, false)).toMatch(/saved section changed/);
    expect(revisionRefusal(two(), false)).toBeNull();
  });
});
