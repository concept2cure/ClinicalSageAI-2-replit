/**
 * Account canon stores no confidence nobody stated, and a validation is a
 * recorded act (who, when), not a confidence of 1.0.
 *
 * Until 2026-10-15 assertCanonFact and supersedeCanonFact wrote
 * `confidenceScore ?? 0.9` — every fact asserted without a score was stored
 * at 0.9 — and validateCanonFact set `confidence_score = 1.0`. The prompt
 * renderer's "[PROVISIONAL — not yet validated]" label read `confidenceScore`
 * off snake_case rows, so it never fired. Resolution ordered by
 * `confidence_score DESC`, which in Postgres puts NULL first.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as Array<{ text: string; params: unknown[] }>);
const rowCount = vi.hoisted(() => ({ value: 1 }));
vi.mock('../../db.js', () => ({
  pool: {
    query: async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      return { rows: [{ id: 11, canon_id: 'canon_x', version: 1 }], rowCount: rowCount.value };
    },
  },
}));

import {
  assertCanonFact,
  formatResolvedContextForPrompt,
  resolveAccountContext,
  validateCanonFact,
  type ResolvedAccountContext,
} from '../account-canon';

beforeEach(() => {
  calls.length = 0;
  rowCount.value = 1;
});

describe('account canon confidence', () => {
  it('stores null, not 0.9, when the asserter stated no confidence', async () => {
    await assertCanonFact({ organizationId: 3, category: 'terminology', key: 'k', title: 'T', content: 'Use "subject", not "patient".' });
    const insert = calls.find(c => c.text.includes('INSERT INTO account_canon_items'))!;
    expect(insert.params[15], 'an unstated confidence was stored as 0.9').toBeNull();
  });

  it('validation does not write a confidence; the ledger records who validated', async () => {
    await validateCanonFact(11, 3, 41, 'Dana');
    const update = calls.find(c => c.text.includes('UPDATE account_canon_items'))!;
    expect(update.text, 'validation set confidence_score = 1.0').not.toMatch(/confidence_score/);
    const event = calls.find(c => c.text.includes('INSERT INTO account_events'))!;
    expect(event.params).toContain('account_fact_validated');
    expect(event.params).toContain(41);
  });

  it('refuses to validate an item that does not exist in the organization', async () => {
    rowCount.value = 0;
    await expect(validateCanonFact(999, 3, 41)).rejects.toMatchObject({ statusCode: 404 });
    expect(calls.some(c => c.text.includes('INSERT INTO account_events'))).toBe(false);
  });

  it('resolution sorts unmeasured confidence last and reads validation from the ledger', async () => {
    await resolveAccountContext({ organizationId: 3 }).catch(() => undefined);
    const q = calls.find(c => c.text.includes('FROM account_canon_items'))!;
    expect(q.text).toMatch(/confidence_score DESC NULLS LAST/);
    expect(q.text).toMatch(/account_fact_validated/);
  });

  it('labels an unvalidated item, and not a validated one', () => {
    const item = (title: string, validated: boolean) =>
      ({ id: 1, title, content: 'c', category: 'terminology', status: 'active', validated }) as unknown as ResolvedAccountContext['canonItems'][number];
    const text = formatResolvedContextForPrompt({
      canonItems: [item('Unchecked', false), item('Checked', true)],
      terms: [], templates: [], tokensEstimate: 0, requestId: 'r',
    });
    expect(text).toMatch(/\*\*Unchecked\*\* \[NOT YET VALIDATED\]/);
    expect(text).toMatch(/\*\*Checked\*\*: c/);
  });
});
