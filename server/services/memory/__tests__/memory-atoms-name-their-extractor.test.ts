/**
 * Each memory atom names the extractor that produced it: the governed model
 * ('ai') or the regex/keyword rules ('heuristic').
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * The drafts carried no record of their extractor, and the ingest writer
 * stored every atom as extracted_by 'ai' — including the regex and keyword
 * matches the heuristic fallback produces whenever the model is disabled,
 * unavailable or returns nothing. A rule's match was presented as a model's
 * reading of the document.
 */
import { describe, expect, it } from 'vitest';
import { extractMemoryEntriesFromText, extractProjectMemoryEntries } from '../heuristic-extraction';
import { parseMemoryEntries, resolveMemoryEntries } from '../llm-extraction';

const CLIENT_TEXT =
  'Our mission is to cure rare disease through gene therapy. We are preparing an IND and a BLA. ' +
  'Lead asset ABC-1234 is in Phase II.';
const PROJECT_TEXT =
  'The primary endpoint is overall survival. This is a randomized, double-blind study. ' +
  'FDA recommended an additional PK cohort.';
const MODEL_REPLY = JSON.stringify({
  entries: [{ category: 'regulatory', subcategory: 'pathway', title: 'IND planned', content: 'An IND is planned.', importanceLevel: 'high' }],
});
const extractorOf = (e: object) => (e as { extractedBy?: unknown }).extractedBy;
const INPUT = { kind: 'client' as const, text: CLIENT_TEXT, fileName: 'overview.pdf', subjectName: 'Acme Bio', organizationId: 1, userId: 2 };

describe('memory atoms name their extractor', () => {
  it('labels every client heuristic atom "heuristic"', () => {
    const out = extractMemoryEntriesFromText(CLIENT_TEXT, 'overview.pdf', 'Acme Bio');
    expect(out.length).toBeGreaterThan(3);
    expect(out.map(extractorOf), 'a rule match carried no extractor, so it was stored as "ai"')
      .toEqual(out.map(() => 'heuristic'));
  });

  it('labels every project heuristic atom "heuristic"', () => {
    const out = extractProjectMemoryEntries(PROJECT_TEXT, 'protocol.pdf', 'Study 001');
    expect(out.length).toBeGreaterThan(2);
    expect(out.map(extractorOf), 'a rule match carried no extractor, so it was stored as "ai"')
      .toEqual(out.map(() => 'heuristic'));
  });

  it('labels a model atom "ai"', () => {
    expect(parseMemoryEntries(MODEL_REPLY).map(extractorOf)).toEqual(['ai']);
  });

  it('keeps the heuristic label when the model returns nothing and the rules run', async () => {
    const out = await resolveMemoryEntries(
      { ...INPUT, heuristic: () => extractMemoryEntriesFromText(CLIENT_TEXT, 'overview.pdf', 'Acme Bio') },
      { enabled: () => true, extract: async () => [] },
    );
    expect(new Set(out.map(extractorOf))).toEqual(new Set(['heuristic']));
  });

  it('keeps the model label when the model answers', async () => {
    const out = await resolveMemoryEntries(
      { ...INPUT, heuristic: () => extractMemoryEntriesFromText(CLIENT_TEXT, 'overview.pdf', 'Acme Bio') },
      { enabled: () => true, extract: async () => parseMemoryEntries(MODEL_REPLY) },
    );
    expect(out.map(extractorOf)).toEqual(['ai']);
  });
});
