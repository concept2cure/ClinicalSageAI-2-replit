/**
 * A market's document takes only its own sections (FILING_SPINE F22b).
 *
 * A market document holds the market's Module 1 and 3.2.R, and keeps M3 as the
 * container above 3.2.R. A common section committed into it is refused by
 * name before anything is written: no attribution, no outline read, no write.
 * Without the refusal the common module's container key (M3) took the text,
 * and any other common code read as "no such section" in a filing that is not
 * the one it belongs to.
 */
import { describe, expect, it, vi } from 'vitest';
import { commitSectionToFiling } from '../commit-section-to-filing';

function makeClient(code: string, scope: string | null) {
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (/to_regclass\('public\.c2c_document_sections'\)/.test(sql)) return { rows: [{ ok: true }] };
      if (/FROM authoring_sections s\s+JOIN authoring_documents/.test(sql)) return { rows: [{ code, c2c_document_id: 'doc_ema' }] };
      if (/'filing_scope'/.test(sql)) return { rows: [{ filing_scope: scope }] };
      if (/SELECT ds\.section_key FROM c2c_document_sections/.test(sql)) return { rows: [{ section_key: 'M1' }, { section_key: '1.3.1' }, { section_key: 'M3' }, { section_key: '3.2.R' }] };
      if (/FROM authoring_sections s\s+WHERE s\.tenant_id/.test(sql)) return { rows: [{ id: 'sec-1', code, title: 'S', content: '' }] };
      if (/UPDATE c2c_document_sections/.test(sql)) return { rows: [{ section_key: code, previous_status: 'todo', status: 'drafted' }] };
      return { rows: [] };
    }),
  };
  return { client, queries };
}

const commit = (client: unknown) =>
  commitSectionToFiling({ client: client as never, sectionId: 'sec-1', content: 'Text.', actorId: '42', tenantId: 7 });

describe("a market's document takes only its own sections", () => {
  it.each(['M3', '2.5'])('refuses common section %s by name, and writes nothing', async (code) => {
    const { client, queries } = makeClient(code, 'market');
    const out = await commit(client);
    expect(out).toMatchObject({ committed: false });
    const prefix = `Section ${code} is part of the project's home filing`;
    expect('reason' in out ? out.reason.slice(0, prefix.length) : undefined).toBe(prefix);
    expect(queries.some((q) => /set_config|UPDATE c2c_document_sections/.test(q))).toBe(false);
  });

  it("commits the market's own section", async () => {
    const { client } = makeClient('1.3.1', 'market');
    expect(await commit(client)).toMatchObject({ committed: true, sectionKey: '1.3.1' });
  });

  it.each(['home', null])('the home filing (scope %s) takes a common section as before', async (scope) => {
    const { client } = makeClient('M3', scope);
    expect(await commit(client)).toMatchObject({ committed: true });
  });
});
