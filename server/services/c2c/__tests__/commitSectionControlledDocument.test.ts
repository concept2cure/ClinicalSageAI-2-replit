/**
 * A Quality controlled document (an SOP, a policy) is approved and released in the Quality register and is
 * never part of a filing. Saving one of its sections used to answer "This document is not bound to a filing, so
 * there is no governed section to update", and the editor printed that as "saved in the editor but not in the
 * filing" (found in the running app, 2026-11-12,
 * docs/evidence/DESIGN/D7/2026-11-12-training-lists-re-read/shots/w41-editor-1440.png). The save now says what the
 * document is, so the editor has nothing to say about a filing.
 */
import { describe, it, expect, vi } from 'vitest';
import { commitSectionToFiling } from '../commit-section-to-filing';

/** Answers the statements commitSectionToFiling issues for a document bound to no filing. */
function makeClient(opts: { qmsStore: boolean; controlled: boolean }) {
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (/to_regclass\('public\.c2c_document_sections'\)/.test(sql)) return { rows: [{ ok: true }] };
      if (/FROM authoring_sections s\s+JOIN authoring_documents/.test(sql)) {
        return { rows: [{ code: '1', c2c_document_id: null, doc_id: '10000000-0000-4000-8000-000000000001' }] };
      }
      if (/information_schema\.columns[\s\S]*qms_documents/.test(sql)) return { rows: [{ ok: opts.qmsStore }] };
      if (/FROM qms_documents/.test(sql)) return { rows: opts.controlled ? [{ controlled: 1 }] : [] };
      return { rows: [] };
    }),
  };
  return { client, queries };
}
const input = { sectionId: 'sec-1', content: 'Purpose. This procedure governs cold-chain shipments.', actorId: 'user-42', tenantId: 7 };

describe('commitSectionToFiling: a Quality controlled document', () => {
  it('says the document is controlled in Quality, not that it is missing a filing', async () => {
    const { client } = makeClient({ qmsStore: true, controlled: true });
    const result = await commitSectionToFiling({ client: client as any, ...input });
    expect(result).toMatchObject({ committed: false, outsideFiling: 'controlled-document' });
    expect((result as { reason: string }).reason).toMatch(/controlled document/i);
    expect((result as { reason: string }).reason).not.toMatch(/not bound to a filing/i);
  });

  /* A working copy that was never placed into a filing (every template copy starts so) is not a failed
     commit either: the page says "Unbound working copy" beside it. The result names that state, so the
     editor does not print a half-failure on every save (the CSR lane's ED-04, 2026-11-12). The sentence
     stays for a caller that reads it. */
  it('names a working copy that is in no filing, for a document no Quality record names', async () => {
    const { client } = makeClient({ qmsStore: true, controlled: false });
    const result = await commitSectionToFiling({ client: client as any, ...input });
    expect(result).toEqual({ committed: false, outsideFiling: 'unbound-working-copy',
      reason: 'This document is not bound to a filing, so there is no governed section to update.' });
  });

  it('never reads a Quality store that is not there: a failed statement would abort the save', async () => {
    const { client, queries } = makeClient({ qmsStore: false, controlled: true });
    const result = await commitSectionToFiling({ client: client as any, ...input });
    expect(result).toEqual({ committed: false, outsideFiling: 'unbound-working-copy',
      reason: 'This document is not bound to a filing, so there is no governed section to update.' });
    expect(queries.some((sql) => /FROM qms_documents/.test(sql))).toBe(false);
  });
});
