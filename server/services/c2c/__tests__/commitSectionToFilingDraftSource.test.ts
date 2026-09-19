/**
 * commitSectionToFiling hardcoded `draft_source = NULL` on every write into
 * c2c_document_sections — the store the file's own header calls "what the
 * filing IS" — even on the two call sites in authoring.router.ts where the
 * content being written is by definition an accepted AI draft:
 *
 *   - PATCH /sections/:sectionId, when `contributors` (machineContributors,
 *     resolved from the client's accepted-insertion authors) is non-empty
 *   - POST /sections/:id/ai/draft/accept, whose entire purpose is committing
 *     an accepted AI draft
 *
 * c2c_document_section_versions.author_kind — "what an inspector reads to
 * answer 'who wrote this section'" (migrations/20260822) — is derived from
 * this column by the snapshot trigger the next time the section is edited. A
 * draft_source that is always NULL means author_kind can never read anything
 * but 'unspecified' for AI-accepted content that reached the filing through
 * the primary v2 editor, even though the older mdx surface (mdx-ana-drafts.ts)
 * already writes 'ana' correctly on the exact same column.
 *
 * The fix threads the caller's already-computed knowledge through as an
 * optional `draftSource` field, defaulting to NULL — "not stated" — so a
 * caller that has not been taught to pass one keeps today's honest behaviour
 * exactly. It never invents 'human' for the zero-contributor case; that
 * asymmetry is the point (see the production comment).
 */
import { describe, it, expect, vi } from 'vitest';
import { commitSectionToFiling } from '../commit-section-to-filing';

/** Records every query; answers the fixed sequence commitSectionToFiling issues. */
function makeClient() {
  const queries: { sql: string; params?: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (/to_regclass\('public\.c2c_document_sections'\)/.test(sql)) {
        return { rows: [{ ok: true }] };
      }
      if (/FROM authoring_sections s/.test(sql)) {
        return { rows: [{ code: '3.2.S.3', c2c_document_id: 'doc-1' }] };
      }
      if (/UPDATE c2c_document_sections/.test(sql)) {
        return { rows: [{ section_key: '3.2.S.3' }] };
      }
      return { rows: [] };
    }),
  };
  return { client, queries };
}

function baseInput(over: Record<string, unknown> = {}) {
  return {
    sectionId: 'sec-1',
    content: 'Impurity levels remain within the qualified threshold.',
    actorId: 'user-42',
    tenantId: 7,
    ...over,
  };
}

describe('commitSectionToFiling — draft_source', () => {
  it('writes the caller-supplied draftSource — the AI-draft-accept route always passes one', async () => {
    const { client, queries } = makeClient();
    const result = await commitSectionToFiling({
      client: client as any,
      ...baseInput(),
      draftSource: 'ana',
    });

    expect(result.committed).toBe(true);
    const update = queries.find((q) => /UPDATE c2c_document_sections/.test(q.sql));
    expect(update).toBeDefined();
    // documentId, code, content, tenantId, draftSource — draft_source is the 5th param.
    expect(update!.params![4]).toBe('ana');
  });

  it('defaults to NULL — never guesses "human" — when the caller passes nothing', async () => {
    const { client, queries } = makeClient();
    await commitSectionToFiling({ client: client as any, ...baseInput() });

    const update = queries.find((q) => /UPDATE c2c_document_sections/.test(q.sql));
    expect(update!.params![4]).toBeNull();
    expect(update!.params).not.toContain('human');
  });

  it('writes NULL, not an empty string, when draftSource is explicitly null', async () => {
    const { client, queries } = makeClient();
    await commitSectionToFiling({ client: client as any, ...baseInput(), draftSource: null });

    const update = queries.find((q) => /UPDATE c2c_document_sections/.test(q.sql));
    expect(update!.params![4]).toBeNull();
  });
});

describe('authoring.router.ts wiring — verified against the real source, not re-implemented', () => {
  /*
   * The two call sites live inside one 7000+ line router with a live pg pool,
   * not something worth standing up an app for just to assert two literals.
   * Reading the source directly pins the exact wiring this fix depends on —
   * that PATCH /sections/:sectionId's draftSource tracks `contributors`
   * (never hardcodes a guess) and that the AI-draft-accept route passes 'ana'
   * unconditionally.
   */
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const router = fs.readFileSync(
    path.resolve(__dirname, '../../../routes/authoring.router.ts'),
    'utf8',
  );

  it('the manual-save route derives draftSource from contributors, never hardcodes a value', () => {
    expect(router).toMatch(
      /draftSource:\s*contributors\.length > 0 \? contributors\[0\]\.id : null/,
    );
  });

  it('the AI-draft-accept route passes draftSource unconditionally', () => {
    expect(router).toMatch(/draftSource:\s*'ana',\s*\n\s*\}\);/);
  });

  it('draft_source is no longer hardcoded to the SQL literal NULL', () => {
    expect(router).not.toMatch(/draft_source\s*=\s*NULL,/);
  });
});
