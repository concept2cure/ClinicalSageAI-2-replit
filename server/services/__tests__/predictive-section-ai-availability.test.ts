/**
 * Section predictions say whether the model's suggestions are in them.
 *
 * Until 2026-09-23 any model failure — including an unreadable reply — became
 * an empty list of AI suggestions, and the response looked exactly like "the
 * model had nothing to add". An error must not be rendered as an empty result.
 */
import { describe, it, expect, vi } from 'vitest';

const S = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: S.chat } }));

import predictiveSectionService from '../predictiveSectionService';

const CONTEXT = {
  documentType: 'protocol',
  submissionType: 'IND' as const,
  existingSections: [],
  regulatoryRegion: 'FDA' as const,
};

// No beforeEach(mockReset): under vitest 4.1.7 a reset mock that then rejects
// fails the test even when the code under test catches it (see
// real-time-validation-fail-closed.test.ts). Each case sets its own behaviour.

describe('predictive section suggestions', () => {
  it('a readable model reply is included, and says so', async () => {
    S.chat.mockImplementation(async () => ({
      content: JSON.stringify({
        suggestions: [{ sectionCode: '2.5', sectionTitle: 'Clinical Overview', priority: 'High', confidence: 0.8, reasoning: 'r', dependencies: [], estimatedEffort: 'Moderate', regulatoryRequirement: 'Mandatory' }],
      }),
    }));
    const r = await predictiveSectionService.getSectionSuggestions(CONTEXT);
    expect(r.aiSuggestions).toBe('included');
  });

  it.each([
    ['a model failure', () => S.chat.mockImplementation(async () => { throw new Error('provider down'); })],
    ['an unreadable reply', () => S.chat.mockImplementation(async () => ({ content: 'Here are some ideas…' }))],
    ['a reply with no suggestions list', () => S.chat.mockImplementation(async () => ({ content: '{"notes":"none"}' }))],
  ])('%s is reported as unavailable, and the rule-based list still returns', async (_what, arrange) => {
    arrange();
    const r = await predictiveSectionService.getSectionSuggestions(CONTEXT);
    expect(r.aiSuggestions).toBe('unavailable');
    expect(r.suggestions.every(s => !(s as { aiGenerated?: boolean }).aiGenerated)).toBe(true);
  });
});
