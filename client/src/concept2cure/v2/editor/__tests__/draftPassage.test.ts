// @vitest-environment jsdom
/** The pure half of slice 4 (docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md): the passage as the proposal door takes it. */
import { describe, expect, it } from 'vitest';
import { passageFigureHold, passageProposal, passageRefusal, samePassage, PASSAGE_CONTEXT_CHARS } from '../draftPassage';

const PASSAGE = { quote: 'was met', prefix: 'The primary endpoint ', suffix: ' in the treatment group.' };

describe('the passage proposal', () => {
  it('replaces exactly the quote, named by its context, against the saved base', () => {
    expect(passageProposal({ sectionId: 'S1', baseUpdatedAt: '2026-10-29T10:00:00Z', passage: PASSAGE, replacement: 'was achieved' }))
      .toEqual({ sectionId: 'S1', baseUpdatedAt: '2026-10-29T10:00:00Z', operation: 'replace', quote: 'was met',
        prefix: 'The primary endpoint ', suffix: ' in the treatment group.', replacement: 'was achieved' });
  });
  it('sends no base it does not have', () => {
    expect(passageProposal({ sectionId: 'S1', baseUpdatedAt: null, passage: PASSAGE, replacement: 'x' })).not.toHaveProperty('baseUpdatedAt');
  });
  it('takes context of a bounded length', () => {
    expect(PASSAGE_CONTEXT_CHARS).toBe(60);
  });
});

describe('the passage answered is the passage asked about', () => {
  it('compares quote, prefix and suffix exactly', () => {
    expect(samePassage(PASSAGE, { ...PASSAGE })).toBe(true);
    expect(samePassage(PASSAGE, undefined)).toBe(false);
    expect(samePassage(PASSAGE, { ...PASSAGE, prefix: '' })).toBe(false);
    expect(samePassage(PASSAGE, { ...PASSAGE, suffix: '' })).toBe(false);
    expect(samePassage(PASSAGE, { ...PASSAGE, quote: 'was not met' })).toBe(false);
  });
});

describe('why a replacement did not land, in this panel’s terms', () => {
  const cases: Array<[string, RegExp]> = [
    ['stale', /saved section changed after these alternatives were drafted/],
    ['no-base', /no saved version/],
    ['not-found', /no longer in the editor as it was selected/],
    ['ambiguous', /more than one place/],
    ['overlaps-suggestion', /already holds a pending change/],
  ];
  for (const [reason, wording] of cases) {
    it(reason, () => {
      const text = passageRefusal({ ok: false, reason } as never);
      expect(text).toMatch(/^The alternative was not added: /);
      expect(text).toMatch(wording);
    });
  }
});

describe('a passage alternative carrying a figure the engine did not produce (CSR slice 2)', () => {
  const alt = (generated: string, csrFigures?: unknown) => ({ sectionId: 'S1', generated, draftId: null, metadata: {}, check: null,
    ...(csrFigures ? { csrFigures } : {}) }) as Parameters<typeof passageFigureHold>[0];

  it('is held, and names the figure', () => {
    expect(passageFigureHold(alt('Responders were 17/305.', { status: 'checked', results: true, figures: [{ figure: '17/305', blocking: true }] })))
      .toBe('Not offered: 17/305 is not a figure the study’s engine produced for this section. Ask AnA for the alternatives again, or edit the passage in the editor.');
  });

  it('is not held for a reported figure, a section with no receipts, or a document the gate does not cover', () => {
    expect(passageFigureHold(alt('Planned 300.', { status: 'checked', results: false, figures: [{ figure: '300', blocking: false }] }))).toBeNull();
    expect(passageFigureHold(alt('Responders were 17/305.', { status: 'not_checked' }))).toBeNull();
    expect(passageFigureHold(alt('Responders were 17/305.'))).toBeNull();
  });
});
