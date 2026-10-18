/**
 * The knowledge corpus version changes when any entry's content changes.
 *
 * corpusVersion() is stamped on every saved IVD assessment so the computation
 * is "reproducible against the exact knowledge snapshot that informed it", and
 * drift detection compares it. It hashed only each entry's id and lastReviewed
 * date, so an edit to an entry's text, citations or applicability without a
 * date bump left the stamp unchanged and drift detection reported none.
 *
 * Each case hands a freshly loaded service (nothing cached) an edited copy of
 * the shipped corpus.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Entry = Record<string, unknown>;

async function versionAfter(edit: (corpus: Entry[]) => Entry[]): Promise<string> {
  vi.resetModules();
  vi.doMock('../index', async () => {
    const real = await vi.importActual<Record<string, unknown>>('../index');
    return { ...real, IVD_KNOWLEDGE_BASE: edit([...(real.IVD_KNOWLEDGE_BASE as Entry[])]) };
  });
  const { corpusVersion } = await import('../knowledge.service');
  return corpusVersion();
}

let shipped: string;
beforeEach(async () => {
  shipped = await versionAfter((c) => c);
});

describe('corpus version', () => {
  it('is well-formed', () => {
    expect(shipped).toMatch(/^v\d+-[0-9a-f]{16}$/);
  });

  it('changes when an entry’s text changes, even with the same id and review date', async () => {
    const edited = await versionAfter(([first, ...rest]) => [
      { ...first, summary: `${String(first.summary)} (edited)` }, ...rest,
    ]);
    expect(edited).not.toBe(shipped);
  });

  it('changes when an entry’s citations change', async () => {
    const edited = await versionAfter(([first, ...rest]) => [{ ...first, citations: [] }, ...rest]);
    expect(edited).not.toBe(shipped);
  });

  it('does not depend on the order the corpus lists its entries in', async () => {
    expect(await versionAfter((c) => c.reverse())).toBe(shipped);
  });
});
