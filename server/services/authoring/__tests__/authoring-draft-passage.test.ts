/**
 * Alternatives for a selected passage (docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md, slice 4).
 * The draft route takes `passage: { quote, prefix, suffix }`. The passage must be in the SAVED
 * section, outside any pending change, and name one place there; the model is shown the saved
 * section and the passage as data and asked for a replacement of the passage only.
 */
import { describe, expect, it } from 'vitest';
import {
  admitDraftPassage, draftPassageFor, DraftPassageError, MAX_PASSAGE_CHARS, readDraftPassageRequest, renderPassageBlock,
} from '../authoring-draft-passage';
import { buildSectionDraftPrompt } from '../authoring-draft-template';

const SAVED = '<h2>Efficacy</h2><p>The primary endpoint was met in the treatment group.</p>'
  + '<p>The primary endpoint was met in the 10 mg arm only.</p>'
  + '<p>Before <ins data-author-id="ana" data-author-name="AnA">inserted words</ins> after <del data-author-id="ana" data-author-name="AnA">gone words</del>.</p>';

const refusal = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e as DraftPassageError; }
  throw new Error('expected a refusal');
};

describe('the passage field', () => {
  it('is absent on an ordinary draft, and read exactly when present', () => {
    expect(readDraftPassageRequest({ tone: 'concise' })).toBeNull();
    expect(readDraftPassageRequest(undefined)).toBeNull();
    expect(readDraftPassageRequest({ passage: { quote: 'endpoint was met', prefix: 'The primary ', suffix: ' in the' } }))
      .toEqual({ quote: 'endpoint was met', prefix: 'The primary ', suffix: ' in the' });
    expect(readDraftPassageRequest({ passage: { quote: 'endpoint' } })).toEqual({ quote: 'endpoint', prefix: '', suffix: '' });
  });

  it('refuses a malformed passage before anything is read', () => {
    for (const passage of [null, 'quote', [], {}, { quote: '   ' }, { quote: 7 }, { quote: 'x'.repeat(MAX_PASSAGE_CHARS + 1) },
      { quote: 'ok', prefix: 3 }, { quote: 'ok', suffix: 'x'.repeat(301) }]) {
      const e = refusal(() => readDraftPassageRequest({ passage }));
      expect(e).toBeInstanceOf(DraftPassageError);
      expect(e).toMatchObject({ status: 400, code: 'PASSAGE_INVALID' });
      expect(e.message).toMatch(/Nothing was drafted/);
    }
  });
});

describe('the passage is admitted only from the saved section', () => {
  it('admits a passage that occurs once, and shows the saved section around it', () => {
    const admitted = admitDraftPassage({ quote: 'in the treatment group', prefix: '', suffix: '' }, SAVED);
    expect(admitted.quote).toBe('in the treatment group');
    expect(admitted.savedText).toContain('The primary endpoint was met in the treatment group.');
    expect(admitted.savedText).toContain('## Efficacy');
  });

  it('picks the one place the prefix and suffix name when the words occur more than once', () => {
    const first = admitDraftPassage({ quote: 'The primary endpoint was met', prefix: 'Efficacy ', suffix: ' in the treatment' }, SAVED);
    expect(first.quote).toBe('The primary endpoint was met');
    const second = admitDraftPassage({ quote: 'The primary endpoint was met', prefix: 'treatment group. ', suffix: ' in the 10 mg' }, SAVED);
    expect(second.quote).toBe('The primary endpoint was met');
  });

  it('refuses words that occur more than once when the context does not pick one', () => {
    for (const ctx of [{ prefix: '', suffix: '' }, { prefix: 'nowhere ', suffix: '' }, { prefix: '', suffix: ' in the' }]) {
      const e = refusal(() => admitDraftPassage({ quote: 'The primary endpoint was met', ...ctx }, SAVED));
      expect(e).toMatchObject({ status: 409, code: 'PASSAGE_AMBIGUOUS' });
      expect(e.message).toMatch(/more than once/);
    }
  });

  it('refuses a passage the saved section does not hold, or that runs into a pending change', () => {
    for (const quote of ['met in the placebo group', 'inserted words', 'gone words', 'Before inserted']) {
      const e = refusal(() => admitDraftPassage({ quote, prefix: '', suffix: '' }, SAVED));
      expect(e).toMatchObject({ status: 409, code: 'PASSAGE_NOT_IN_SAVED_SECTION' });
      expect(e.message).toMatch(/Save the section/);
    }
  });

  it('reads whitespace as the editor does, and a list marker or heading level is not part of the text', () => {
    expect(admitDraftPassage({ quote: 'endpoint   was\nmet in the 10 mg', prefix: '', suffix: '' }, SAVED).quote)
      .toBe('endpoint   was\nmet in the 10 mg');
    expect(admitDraftPassage({ quote: 'Efficacy', prefix: '', suffix: ' The primary endpoint' }, SAVED).quote).toBe('Efficacy');
    expect(admitDraftPassage({ quote: 'Second item', prefix: 'First item ', suffix: '' }, '<ul><li>First item</li><li>Second item</li></ul>').quote)
      .toBe('Second item');
  });
});

describe('the passage block and the route parts', () => {
  const inputs = { section: { module: 'M5', code: '11.4.1', title: 'Analysis of Efficacy', product_code: 'P-17' },
    tone: 'concise', region: 'FDA', evidenceBlock: '[SRC-1] "CSR"\nORR 31%.\n--- END EVIDENCE ---', referenceBlock: '' };

  it('appends to the one prompt: the saved section and the passage as data, a replacement of the passage only, no figure from the model', () => {
    const plain = buildSectionDraftPrompt(inputs);
    expect(buildSectionDraftPrompt({ ...inputs, passage: null })).toBe(plain);
    const block = renderPassageBlock({ quote: 'was met', savedText: 'The primary endpoint was met.' });
    const prompt = buildSectionDraftPrompt({ ...inputs, passage: { quote: 'was met', savedText: 'The primary endpoint was met.' } });
    expect(prompt.startsWith(plain)).toBe(true);
    expect(prompt.endsWith(block)).toBe(true);
    expect(block).toContain('BEGIN_SAVED_SECTION\nThe primary endpoint was met.\nEND_SAVED_SECTION');
    expect(block).toContain('BEGIN_PASSAGE\nwas met\nEND_PASSAGE');
    expect(block).toMatch(/"content" holds only the text that replaces the passage/);
    expect(block).toMatch(/The saved section is not evidence/);
    expect(block).toMatch(/Never add a number, result or statistic that neither the passage nor the evidence above states/);
  });

  it('spreads nothing for an ordinary draft, and the passage as admitted for a passage', () => {
    expect(draftPassageFor({ tone: 'concise' }, { content: SAVED })).toEqual({ prompt: null, turnRequest: {}, response: {} });
    const parts = draftPassageFor({ passage: { quote: 'in the treatment group', prefix: 'was met ', suffix: '.' } }, { content: SAVED });
    const passage = { quote: 'in the treatment group', prefix: 'was met ', suffix: '.' };
    expect(parts.turnRequest).toEqual({ passage });
    expect(parts.response).toEqual({ passage });
    expect(parts.prompt?.quote).toBe('in the treatment group');
  });

  it('refuses a passage that also asks to revise a draft', () => {
    const e = refusal(() => draftPassageFor({ passage: { quote: 'in the treatment group' },
      revise: { fromDraftId: 'aaaaaaaa-0000-4000-8000-0000000000aa', instruction: 'Shorter' } }, { content: SAVED }));
    expect(e).toMatchObject({ status: 400, code: 'PASSAGE_INVALID' });
  });
});
