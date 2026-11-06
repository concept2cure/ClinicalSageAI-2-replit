// @vitest-environment jsdom
/**
 * A turn that failed before the model answered offers no next steps (2026-11-06, ConversationThread `suggestionsFor`).
 * Walked in the running app: a refused turn drew "Rewrite Section", "Create Risk Memo" and the rest under "… has no
 * credit or quota left" (docs/evidence/HUMAN-TEST/ANA-CSR/2026-11-06/, 04- before, 05- after).
 */
import { describe, expect, it } from 'vitest';
import type { AnaChatMessage } from '../../components/ana/useAnaChat';
import { suggestionsFor } from '../surfaces/ConversationThread';

const turn = (extra: Partial<AnaChatMessage>) =>
  ({ id: 'm', role: 'assistant', text: 'x', suggestedActions: ['Rewrite Section', 'Create Risk Memo'], ...extra }) as AnaChatMessage;

describe('suggestionsFor', () => {
  it('offers none under a turn refused before the model wrote anything', () => {
    expect(suggestionsFor(turn({ interrupted: true, interruptedWithPartialResponse: false, refusalCode: 'PROVIDER_ACCOUNT_REFUSED' }))).toBeUndefined();
  });

  it('keeps them under an answered turn, and under one cut off after the model had written', () => {
    expect(suggestionsFor(turn({}))).toEqual(['Rewrite Section', 'Create Risk Memo']);
    expect(suggestionsFor(turn({ interrupted: true, interruptedWithPartialResponse: true }))).toEqual(['Rewrite Section', 'Create Risk Memo']);
  });

  it('offers none when the turn carried none', () => {
    expect(suggestionsFor(turn({ suggestedActions: [] }))).toBeUndefined();
  });
});
