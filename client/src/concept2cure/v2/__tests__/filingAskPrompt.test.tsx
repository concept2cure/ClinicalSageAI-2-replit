import { describe, expect, it } from 'vitest';
import { filingAskPrompt, resolveFilingCatalogEntry } from '@shared/regulatory/filing-catalog';

/** The reachable picker Ask control is driven in registryPickerOffers.test.tsx. */
describe('the shared filing question', () => {
  it('preserves the catalogue display name and existing question wording', () => {
    const selected = resolveFilingCatalogEntry('us_ind');
    expect(selected).toBeTruthy();
    expect(filingAskPrompt(selected!.displayName)).toBe(
      `Tell me about the ${selected!.displayName} — when it's required, what it contains, and what evidence I need.`,
    );
  });
});
