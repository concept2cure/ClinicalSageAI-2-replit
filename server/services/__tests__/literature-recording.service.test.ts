/**
 * literature-recording.service — the literature_entries WRITE path.
 *
 * Contract under test:
 *   - idempotency is update-first-then-insert on (org, source='PubMed', pmid):
 *     an existing row is UPDATEd (no INSERT issued), a new one INSERTed;
 *   - nothing is fabricated: year-only dates become year-precision Jan 1 (the
 *     only thing the corpus chart reads is the year), the PubMed URL is the
 *     canonical PMID-derived one, relevance_score is never set;
 *   - fail closed: empty batches, malformed pmids, blank titles and bad org
 *     ids throw instead of being silently skipped, and DB errors propagate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  recordLiteratureEntries,
  normalizeAuthors,
  yearToPublicationDate,
  canonicalPubmedUrl,
  LITERATURE_SOURCE_NAME,
  type SqlExecutor,
} from '../literature-recording.service';

function makeExecutor(updateRows: Array<Record<string, unknown>> = []): {
  executor: SqlExecutor;
  calls: Array<{ text: string; params: unknown[] }>;
} {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const executor: SqlExecutor = {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      if (/^\s*UPDATE literature_entries/i.test(text)) {
        return { rows: updateRows };
      }
      return { rows: [{ id: 'a0000000-0000-0000-0000-000000000001' }] };
    }),
  };
  return { executor, calls };
}

const HIT = {
  pmid: '38012345',
  title: 'Continuous glucose monitoring in adults',
  journal: 'Diabetes Care',
  year: 2023,
  authors: 'Smith J, Lee K',
  doi: '10.1000/x',
  url: null,
};

describe('pure helpers', () => {
  it('splits a comma-separated author display string, passes arrays through', () => {
    expect(normalizeAuthors('Smith J, Lee K')).toEqual(['Smith J', 'Lee K']);
    expect(normalizeAuthors(['A B', ' C D '])).toEqual(['A B', 'C D']);
    expect(normalizeAuthors('')).toBeNull();
    expect(normalizeAuthors(null)).toBeNull();
  });

  it('maps a year to a year-precision date and refuses nonsense years', () => {
    expect(yearToPublicationDate(2023)).toBe('2023-01-01');
    expect(yearToPublicationDate(null)).toBeNull();
    expect(yearToPublicationDate(17)).toBeNull();
  });

  it('derives the canonical PubMed URL from the PMID', () => {
    expect(canonicalPubmedUrl('123')).toBe('https://pubmed.ncbi.nlm.nih.gov/123/');
  });
});

describe('recordLiteratureEntries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a new entry when no existing row matches (update-first miss)', async () => {
    const { executor, calls } = makeExecutor([]);
    const result = await recordLiteratureEntries(executor, 7, [HIT]);

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.entries).toEqual([
      { pmid: '38012345', id: 'a0000000-0000-0000-0000-000000000001', outcome: 'created' },
    ]);

    expect(calls).toHaveLength(2);
    expect(calls[0].text).toMatch(/UPDATE literature_entries/);
    expect(calls[1].text).toMatch(/INSERT INTO literature_entries/);

    const insertParams = calls[1].params;
    expect(insertParams[0]).toBe(HIT.title);
    expect(insertParams[3]).toBe('2023-01-01'); // year precision only
    expect(insertParams[4]).toEqual(['Smith J', 'Lee K']);
    expect(insertParams[6]).toBe('https://pubmed.ncbi.nlm.nih.gov/38012345/'); // derived, not fabricated
    expect(insertParams[7]).toBe(LITERATURE_SOURCE_NAME);
    expect(insertParams[8]).toBe('38012345');
    expect(insertParams[9]).toBe(7);
    // relevance_score / embedding are never written — no appraisal is invented.
    expect(calls[1].text).not.toMatch(/relevance_score|embedding/);
  });

  it('updates the existing entry instead of duplicating (idempotency)', async () => {
    const { executor, calls } = makeExecutor([{ id: 'existing-id' }]);
    const result = await recordLiteratureEntries(executor, 7, [HIT]);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.entries[0]).toEqual({ pmid: '38012345', id: 'existing-id', outcome: 'updated' });
    expect(calls).toHaveLength(1); // no INSERT after a hit
    // The update is scoped to the org + PubMed source key.
    expect(calls[0].params[0]).toBe('7');
    expect(calls[0].params[1]).toBe(LITERATURE_SOURCE_NAME);
    expect(calls[0].params[9]).toBe('38012345');
    // Nullable fields enrich via COALESCE — a re-record never erases data.
    expect(calls[0].text).toMatch(/abstract\s+=\s+COALESCE/);
  });

  it('dedupes the same PMID within one batch (first occurrence wins)', async () => {
    const { executor, calls } = makeExecutor([]);
    const result = await recordLiteratureEntries(executor, 7, [HIT, { ...HIT, title: 'Other' }]);
    expect(result.created).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it('fails closed on invalid input instead of silently skipping', async () => {
    const { executor } = makeExecutor();
    await expect(recordLiteratureEntries(executor, 7, [])).rejects.toThrow(/at least one/i);
    await expect(
      recordLiteratureEntries(executor, 7, [{ ...HIT, pmid: 'abc' }]),
    ).rejects.toThrow(/numeric PubMed ID/i);
    await expect(
      recordLiteratureEntries(executor, 7, [{ ...HIT, title: '   ' }]),
    ).rejects.toThrow(/no title/i);
    await expect(recordLiteratureEntries(executor, 0, [HIT])).rejects.toThrow(/organizationId/i);
  });

  it('propagates database failure — never a fake success', async () => {
    const executor: SqlExecutor = {
      query: vi.fn(async () => {
        throw new Error('relation "literature_entries" does not exist');
      }),
    };
    await expect(recordLiteratureEntries(executor, 7, [HIT])).rejects.toThrow(
      /literature_entries/,
    );
  });
});
