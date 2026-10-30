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

import { createDraftCandidate, consumeDraftCandidate, readDraftCandidate, savedSectionDraftBase, type DraftGenerator } from '../draft-candidate-store';
import type { Queryable } from '../span-lineage.service';
import { renderDraftProductAdvisory } from '../../ana/draft-product-advisory';

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
  await pglite.exec(migration('migrations/20260814i_draft_candidate_generator.sql'));
  // The assertions column (source-attribution Phase 4).
  await pglite.exec(migration('migrations/20260906c_draft_candidate_assertions.sql'));
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

});

describe('draft-candidate generator and derivation receipts', () => {
  it('retains field origins and conflicts through the database JSON round trip', async () => {
    const recordedProductContext = renderDraftProductAdvisory({ therapeuticArea: 'oncology', phase: 'phase_2' }, '2.5', 'test').audit;
    const generator: DraftGenerator = { model: 'test', provider: 'test', promptSha256: null, generatedAt: '2026-10-30', recordedProductContext };
    const parked = await createDraftCandidate(ORG_A, SECTION, 'Draft.', [], 'user-1', exec, generator);
    expect((await consumeDraftCandidate(ORG_A, SECTION, parked.id, exec))?.generator?.recordedProductContext).toEqual(recordedProductContext);
  });

  it('refuses a malformed modern product audit instead of discarding the rest of its provenance', async () => {
    const parked = await createDraftCandidate(ORG_A, SECTION, 'Draft.', [], 'user-1', exec,
      { model: 'test', provider: 'test', promptSha256: null, generatedAt: '2026-10-30' });
    await exec.query(`UPDATE authoring_ai_draft_candidates SET generator=generator || $1::jsonb WHERE id=$2`,
      [JSON.stringify({ recordedProductContext: { productContextSource: 'recorded-unqualified' } }), parked.id]);
    await expect(consumeDraftCandidate(ORG_A, SECTION, parked.id, exec)).rejects.toMatchObject({ code: 'DRAFT_PROVENANCE_INVALID' });
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
      vaultSources: { programId: '33333333-3333-4333-8333-333333333333', retrievedBy: 7, documents: [{ documentId: '44444444-4444-4444-8444-444444444444', contentHash: 'b'.repeat(64), version: '1.0' }] },
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
      // Round 12 (RT-6): the gateway request and the turn record, null when not given.
      generatedAt: '2026-08-14T10:00:00.000Z', requestId: null, turnRecordId: null,
    });
  });


  /* ── Paraphrase assertions (source-attribution Phase 4) ───────────────────
     The model's [{quote, sourceId}] derivation claims are parked with the
     chunks for the same reason those are — a claim round-tripped through the
     client is forgeable — and fed to the accept gate as usage='paraphrased'. */
  it('round-trips paraphrase assertions from park to accept', async () => {
    const assertions = [
      { quote: 'The primary endpoint was met.', sourceId: 42 },
      { quote: 'Adverse events were mild.', sourceId: 43 },
    ];
    const { id } = await createDraftCandidate(
      ORG_A, SECTION, 'body', [], 'user-1', undefined, null, assertions,
    );
    const claimed = await consumeDraftCandidate(ORG_A, SECTION, id);
    expect(claimed?.assertions).toEqual(assertions);
  });

  it('defaults assertions to [] when none are parked, and drops malformed claims', async () => {
    const none = await createDraftCandidate(ORG_A, SECTION, 'body', [], 'user-1');
    expect((await consumeDraftCandidate(ORG_A, SECTION, none.id))?.assertions).toEqual([]);

    const messy = await createDraftCandidate(
      ORG_A, SECTION, 'body', [], 'user-1', undefined, null,
      [
        { quote: 'keep me', sourceId: 7 },
        { quote: '', sourceId: 8 } as any, // empty quote — dropped
        { quote: 'no id', sourceId: 0 } as any, // non-positive id — dropped
        { quote: 'bad id', sourceId: 'x' } as any, // non-integer id — dropped
      ],
    );
    const claimed = await consumeDraftCandidate(ORG_A, SECTION, messy.id);
    expect(claimed?.assertions).toEqual([{ quote: 'keep me', sourceId: 7 }]);
  });
});

describe('draft-candidate store — the turn and the request a draft came from (round 12, RT-6)', () => {
  it('carries the gateway request id and the turn record id from park to accept', async () => {
    const { id } = await createDraftCandidate(
      ORG_A, SECTION, 'body', [], 'user-1', undefined,
      {
        model: 'claude-opus-5-5', provider: 'anthropic', promptSha256: 'a'.repeat(64), generatedAt: '2026-10-05T12:00:00.000Z',
        requestId: 'req-rt6-1', turnRecordId: '6f1c2a4e-9b3d-4e21-8a7f-0c5d1e2b3a41',
      },
    );
    const claimed = await consumeDraftCandidate(ORG_A, SECTION, id);
    expect(claimed?.generator).toMatchObject({ requestId: 'req-rt6-1', turnRecordId: '6f1c2a4e-9b3d-4e21-8a7f-0c5d1e2b3a41' });
  });
});

describe('draft-candidate store — recorded termination metadata', () => {
  // The real PGlite JSONB read is the ordinary object path. The wrapper changes
  // only the database driver's generator representation after the real query,
  // exercising the store's supported JSON-string read path as well.
  const stringGeneratorExec: Queryable = {
    query: async <R = unknown>(sql: string, params?: unknown[]) => {
      const result = await exec.query<Record<string, unknown>>(sql, params);
      return {
        ...result,
        rows: result.rows.map(row => ({
          ...row,
          ...(row.generator !== undefined && row.generator !== null
            ? { generator: JSON.stringify(row.generator) } : {}),
        })) as R[],
      };
    },
  };
  const readModes = [
    { name: 'object JSONB', reader: exec },
    { name: 'JSON-string driver', reader: stringGeneratorExec },
  ];
  const recordedTerminations: Array<{
    name: string;
    metadata: { finishReason?: string | null; truncated?: boolean };
  }> = [
    { name: 'raw whitespace-surrounded cutoff and false flag', metadata: { finishReason: ' \tlength\n ', truncated: false } },
    { name: 'raw ordinary reason and true flag', metadata: { finishReason: 'stop', truncated: true } },
    { name: 'ordinary reason and false flag', metadata: { finishReason: 'end_turn', truncated: false } },
    { name: 'unknown reason and false flag', metadata: { finishReason: 'future_provider_reason', truncated: false } },
    { name: 'explicit null reason and false flag', metadata: { finishReason: null, truncated: false } },
    { name: 'absent reason and true flag', metadata: { truncated: true } },
    { name: 'cutoff reason without flag', metadata: { finishReason: 'max_tokens' } },
    { name: 'explicit null reason without flag', metadata: { finishReason: null } },
  ];

  function historicalGenerator(): DraftGenerator {
    return {
      model: 'recorded-model', provider: 'recorded-provider',
      promptSha256: 'a'.repeat(64), promptVersion: 'test-prompt-v1',
      generatedAt: '2026-10-18T10:00:00.000Z', requestId: 'req-store-termination',
      turnRecordId: '6f1c2a4e-9b3d-4e21-8a7f-0c5d1e2b3a41',
      vaultSources: {
        programId: '33333333-3333-4333-8333-333333333333', retrievedBy: 7,
        documents: [{ documentId: '44444444-4444-4444-8444-444444444444', contentHash: 'b'.repeat(64), version: '1.0' }],
      },
      assemblySources: {
        version: 1, programId: '33333333-3333-4333-8333-333333333333', fingerprint: 'c'.repeat(64),
        entries: [{
          source: { kind: 'data-room', sourceId: 42 }, title: 'endpoint.pdf',
          contentHash: 'd'.repeat(64), extractedTextSha256: 'e'.repeat(64), version: '2',
          originalFileAvailable: true, disposition: null,
          span: { start: 5, end: 20, totalChars: 40, sha256: 'f'.repeat(64) },
        }],
        limitations: ['Only the selected excerpt was shown.'],
      },
      savedSectionBase: {
        version: 1, sectionId: SECTION, docId: '55555555-5555-4555-8555-555555555555',
        code: '2.7.3', title: 'Clinical efficacy', contentSha256: '0'.repeat(64),
        updatedAt: '2026-10-18T09:00:00.000Z',
      },
    };
  }

  for (const { name: readMode, reader } of readModes) {
    for (const { name, metadata } of recordedTerminations) {
      it(`retains ${name} through ${readMode} without changing source/base/turn receipts`, async () => {
        // This erased assertion lets the unchanged baseline compile: the two
        // optional production fields do not exist until the implementation lands.
        const generator = { ...historicalGenerator(), ...metadata } as DraftGenerator;
        const sources = [{ evidenceSourceId: 42, content: 'The primary endpoint was met.', title: 'endpoint.pdf' }];
        const assertions = [{ quote: 'The primary endpoint was met.', sourceId: 42 }];
        const { id } = await createDraftCandidate(
          ORG_A, SECTION, 'A parked draft.', sources, 'user-termination', exec, generator, assertions,
        );
        const parked = await exec.query<{ generator: unknown }>(
          'SELECT generator FROM authoring_ai_draft_candidates WHERE id = $1', [id],
        );
        expect(parked.rows[0].generator).toEqual(generator);

        // Direct store consumption retains facts, including contradictory ones;
        // rejecting a known cutoff is the actual HTTP accept policy's job.
        const claimed = await consumeDraftCandidate(ORG_A, SECTION, id, reader);
        expect(claimed).not.toBeNull();
        expect(claimed).toMatchObject({
          id, sectionId: SECTION, content: 'A parked draft.', createdBy: 'user-termination',
          sources, assertions,
        });
        expect(claimed?.generator).toEqual(generator);
        expect(await consumeDraftCandidate(ORG_A, SECTION, id, reader)).toBeNull();
      });
    }

    it(`keeps the exact historical generator keys and no-generator null through ${readMode}`, async () => {
      const generator = historicalGenerator();
      const historical = await createDraftCandidate(ORG_A, SECTION, 'legacy', [], 'user-1', exec, generator);
      const historicalClaim = await consumeDraftCandidate(ORG_A, SECTION, historical.id, reader);
      expect(historicalClaim?.generator).toEqual(generator);
      expect(Object.keys(historicalClaim?.generator ?? {}).sort()).toEqual(Object.keys(generator).sort());
      expect(historicalClaim?.generator).not.toHaveProperty('finishReason');
      expect(historicalClaim?.generator).not.toHaveProperty('truncated');

      const withoutGenerator = await createDraftCandidate(ORG_A, SECTION, 'legacy-null', [], null, exec);
      expect((await consumeDraftCandidate(ORG_A, SECTION, withoutGenerator.id, reader))?.generator).toBeNull();
    });
  }
});

describe('draft-candidate store — the read a revision is drafted from (CSR draft control, slice 3)', () => {
  const section = { id: SECTION, doc_id: 'dddddddd-0000-4000-8000-000000000001', code: '11.4.1', title: 'Efficacy',
    content: '<p>Saved.</p>', updated_at: '2026-10-29 10:00:00+00' };
  const generator = (): DraftGenerator => ({ model: 'm', provider: 'p', promptSha256: null, generatedAt: '2026-10-29T10:00:00Z',
    savedSectionBase: savedSectionDraftBase(section) });

  it('reads a live candidate without claiming it, so it still accepts', async () => {
    const { id } = await createDraftCandidate(ORG_A, SECTION, 'base text', [], 'user-1', exec, generator());
    const read = await readDraftCandidate(ORG_A, SECTION, id, section, exec);
    expect(read).toMatchObject({ id, sectionId: SECTION, content: 'base text', savedBaseCurrent: true });
    expect(read!.generator?.savedSectionBase).toEqual(savedSectionDraftBase(section));
    expect(await readDraftCandidate(ORG_A, SECTION, id, section, exec)).not.toBeNull();
    expect((await consumeDraftCandidate(ORG_A, SECTION, id, exec))?.content).toBe('base text');
    expect(await readDraftCandidate(ORG_A, SECTION, id, section, exec)).toBeNull();
  });

  it('is tenant-, section- and expiry-scoped, as the claim is', async () => {
    const { id } = await createDraftCandidate(ORG_A, SECTION, 'scoped', [], 'user-1', exec, generator());
    expect(await readDraftCandidate(ORG_B, SECTION, id, section, exec)).toBeNull();
    expect(await readDraftCandidate(ORG_A, OTHER_SECTION, id, section, exec)).toBeNull();
    await exec.query(`UPDATE authoring_ai_draft_candidates SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [id]);
    expect(await readDraftCandidate(ORG_A, SECTION, id, section, exec)).toBeNull();
  });

  it('says when the saved section changed since the candidate was drafted, or the candidate names no base', async () => {
    const { id } = await createDraftCandidate(ORG_A, SECTION, 'base text', [], 'user-1', exec, generator());
    expect((await readDraftCandidate(ORG_A, SECTION, id, { ...section, content: '<p>Saved since.</p>' }, exec))?.savedBaseCurrent).toBe(false);
    expect((await readDraftCandidate(ORG_A, SECTION, id, { ...section, updated_at: '2026-10-29 11:00:00+00' }, exec))?.savedBaseCurrent).toBe(false);
    const legacy = await createDraftCandidate(ORG_A, SECTION, 'legacy', [], 'user-1', exec);
    expect((await readDraftCandidate(ORG_A, SECTION, legacy.id, section, exec))?.savedBaseCurrent).toBe(false);
  });

  it('carries derivedFrom from park to accept', async () => {
    const derivedFrom = { draftId: 'aaaaaaaa-0000-4000-8000-0000000000aa', contentSha256: 'c'.repeat(64), instruction: 'Shorter' };
    const { id } = await createDraftCandidate(ORG_A, SECTION, 'revised', [], 'user-1', exec, { ...generator(), derivedFrom });
    expect((await readDraftCandidate(ORG_A, SECTION, id, section, exec))?.generator?.derivedFrom).toEqual(derivedFrom);
    expect((await consumeDraftCandidate(ORG_A, SECTION, id, exec))?.generator?.derivedFrom).toEqual(derivedFrom);
  });
});
