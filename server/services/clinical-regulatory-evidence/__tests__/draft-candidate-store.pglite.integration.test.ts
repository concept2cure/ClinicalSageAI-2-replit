/**
 * Draft-candidate store — END-TO-END against in-process PGlite, applying the real
 * migration (db/migrations/20260809_source_attribution_draft_candidates.sql, RLS and
 * all). Proves the store that feeds automated source attribution:
 *
 *   - a parked candidate round-trips its content + sources
 *   - consume is SINGLE-USE (DELETE … RETURNING) — a second accept gets nothing
 *   - consume is TENANT- and SECTION-scoped — wrong org / wrong section get nothing
 *   - an expired candidate is not acceptable
 *
 * One PGlite instance for the file.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const exec = {
  query: async <R = any>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number }> => {
    const r = await pglite.query(sql, params as unknown[]);
    return {
      rows: r.rows as R[],
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => exec.query(s, p) } }));

import { createDraftCandidate, consumeDraftCandidate } from '../draft-candidate-store';

const ORG_A = 711;
const ORG_B = 822;
const SECTION = '11111111-1111-1111-1111-111111111111';
const OTHER_SECTION = '22222222-2222-2222-2222-222222222222';

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await pglite.exec(`INSERT INTO organizations (id, name) VALUES (${ORG_A},'a'), (${ORG_B},'b');`);
  await pglite.exec(migration('db/migrations/20260809_source_attribution_draft_candidates.sql'));
  // The generator column (GA ledger L33) — applied here so the store is tested
  // against the schema it actually writes to, rather than an earlier one.
  await pglite.exec(migration('migrations/20260814h_draft_candidate_generator.sql'));
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

describe('draft-candidate store', () => {
  it('round-trips content + sources and is single-use', async () => {
    const sources = [
      { evidenceSourceId: 42, content: 'source one text', title: 'a.pdf' },
      { evidenceSourceId: 43, content: 'source two text', title: null },
    ];
    const { id } = await createDraftCandidate(ORG_A, SECTION, 'drafted content', sources, 'user-1', exec);
    expect(id).toBeTruthy();

    const claimed = await consumeDraftCandidate(ORG_A, SECTION, id, exec);
    expect(claimed).not.toBeNull();
    expect(claimed!.content).toBe('drafted content');
    expect(claimed!.sources).toHaveLength(2);
    expect(claimed!.sources[0]).toEqual({ evidenceSourceId: 42, content: 'source one text', title: 'a.pdf' });
    expect(claimed!.sources[1]).toEqual({ evidenceSourceId: 43, content: 'source two text', title: null });

    // Single-use: the row was claimed (deleted), so a second accept gets nothing.
    expect(await consumeDraftCandidate(ORG_A, SECTION, id, exec)).toBeNull();
  });

  it('is tenant- and section-scoped', async () => {
    const { id } = await createDraftCandidate(ORG_A, SECTION, 'x', [], null, exec);
    // Wrong tenant → nothing (also the row must survive for the rightful owner).
    expect(await consumeDraftCandidate(ORG_B, SECTION, id, exec)).toBeNull();
    // Wrong section → nothing.
    expect(await consumeDraftCandidate(ORG_A, OTHER_SECTION, id, exec)).toBeNull();
    // Rightful owner + section still works.
    expect(await consumeDraftCandidate(ORG_A, SECTION, id, exec)).not.toBeNull();
  });

  it('drops entries with no usable source id, and defaults content/title', async () => {
    const sources = [
      { evidenceSourceId: 7, content: 'keep me', title: 'k.pdf' },
      { evidenceSourceId: null, content: 'no id — dropped', title: 'x' } as any,
      { evidenceSourceId: 0, content: 'zero id — dropped', title: 'y' } as any,
    ];
    const { id } = await createDraftCandidate(ORG_A, SECTION, 'c', sources, null, exec);
    const claimed = await consumeDraftCandidate(ORG_A, SECTION, id, exec);
    expect(claimed!.sources).toHaveLength(1);
    expect(claimed!.sources[0].evidenceSourceId).toBe(7);
  });

  it('will not accept an expired candidate', async () => {
    // Insert a candidate already past its TTL directly, then try to consume it.
    const { rows } = await exec.query<{ id: string }>(
      `INSERT INTO authoring_ai_draft_candidates
         (section_id, organization_id, content, sources, created_by, expires_at)
       VALUES ($1, $2, 'stale', '[]'::jsonb, NULL, NOW() - INTERVAL '1 minute')
       RETURNING id`,
      [SECTION, ORG_A],
    );
    const staleId = rows[0].id;
    expect(await consumeDraftCandidate(ORG_A, SECTION, staleId, exec)).toBeNull();
  });

  /* ── Generator capture (GA ledger L33) ───────────────────────────────────
     Model, provider and prompt digest existed at draft time and reached only
     the browser, so "what produced this text?" survived about as long as the
     tab. They are parked server-side with the source chunks for the same
     reason those are: a generator round-tripped through the client would be a
     client claim, and which model wrote a regulatory section must not be
     forgeable. */
  it('carries the generator from park to accept', async () => {
    const generator = {
      model: 'claude-opus-5',
      provider: 'anthropic',
      promptSha256: 'a'.repeat(64),
      generatedAt: '2026-08-14T10:00:00.000Z',
    };
    const { id } = await createDraftCandidate(
      ORG_A, SECTION, 'drafted body', [], 'user-1', undefined, generator,
    );
    const claimed = await consumeDraftCandidate(ORG_A, SECTION, id);
    expect(claimed?.generator).toMatchObject(generator);
  });

  it('reports no generator rather than guessing one', async () => {
    // Drafts parked before this column existed, and routes that supply none.
    // A default from the model registry would attribute text to a model that
    // may never have seen it.
    const { id } = await createDraftCandidate(ORG_A, SECTION, 'body', [], 'user-1');
    const claimed = await consumeDraftCandidate(ORG_A, SECTION, id);
    expect(claimed?.generator).toBeNull();
  });

  it('does not half-populate a generator it cannot read', async () => {
    const { id } = await createDraftCandidate(
      ORG_A, SECTION, 'body', [], 'user-1', undefined,
      { model: 'm', provider: null, promptSha256: null, generatedAt: '2026-08-14T10:00:00.000Z' },
    );
    const claimed = await consumeDraftCandidate(ORG_A, SECTION, id);
    // Absent fields are null, not omitted — a reader can tell "not recorded"
    // from "not applicable" without guessing which it is.
    expect(claimed?.generator).toEqual({
      model: 'm', provider: null, promptSha256: null, promptVersion: null,
      generatedAt: '2026-08-14T10:00:00.000Z',
    });
  });
});
