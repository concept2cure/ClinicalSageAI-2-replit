/**
 * canonical_documents: the database refuses to rewrite a lifecycle record
 * (VR-03, row D5; 21 CFR Part 11 §11.10(e), §11.70).
 *
 * Applies the real files — 20260731c (the table) and 20260925 (the guard) — and
 * issues RAW SQL, the way a script, a future route or an operator would. The
 * application no longer attempts any of these writes. The point is that the
 * database refuses them anyway.
 *
 * Triggers fire for every role, the superuser PGlite runs as included, so the
 * DELETE and TRUNCATE refusals are shown here too. Real PostgreSQL, the runtime
 * role and concurrent transitions are tests/db/canonical-documents-append-only.dbtest.ts.
 *
 * The first describe block is the negative control: the same raw rewrite
 * against the table WITHOUT the guard succeeds. That is what shows the other
 * blocks measure the guard and not the fixture.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const ROOT = join(__dirname, '..', '..');
const TABLE = 'migrations/20260731c_canonical_documents.sql';
const GUARD = 'migrations/20260925_canonical_documents_append_only.sql';
const sql = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const ID = '00000000-0000-4000-8000-00000000c0de';
const ev = (from: string, to: string, extra: Record<string, unknown> = {}) => ({
  documentId: ID,
  version: 1,
  from,
  to,
  actor: '42',
  at: '2026-09-25T00:00:00.000Z',
  prevEventHash: '',
  eventHash: `h-${from}-${to}`,
  ...extra,
});
const REVIEW = {
  actor: '42',
  role: 'admin',
  signatureRef: 'csig:review-1',
  signedAt: '2026-09-25T00:00:00.000Z',
  meaning: 'reviewed',
};
const APPROVAL = {
  actor: '43',
  role: 'admin',
  signatureRef: 'csig:approve-1',
  signedAt: '2026-09-25T00:00:00.000Z',
  meaning: 'approved',
};

let db: PGlite;

async function seed(stage: string, audit: unknown[], extra: Record<string, unknown> = {}) {
  await db.query(
    `INSERT INTO canonical_documents
       (canonical_id, organization_id, title, document_type, stage, has_content, content_hash,
        review_signature, approval_signature, source_refs, audit)
     VALUES ($1, 1, 'Clinical overview', 'US_IND', $2, true, 'sha-content',
             $3::jsonb, $4::jsonb, '{"coauthor_documents":{"nativeId":7,"role":"content"}}'::jsonb, $5::jsonb)`,
    [
      ID,
      stage,
      extra.review ? JSON.stringify(extra.review) : null,
      extra.approval ? JSON.stringify(extra.approval) : null,
      JSON.stringify(audit),
    ]
  );
}

/** Run a raw UPDATE; resolve to the refusal message, or null when it was allowed. */
async function attempt(statement: string, params: unknown[] = []): Promise<string | null> {
  try {
    await db.query(statement, params);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

const appendJson = (e: unknown) => JSON.stringify([e]);

afterEach(async () => {
  await db?.close();
});

describe('negative control — without the guard, a raw rewrite of the trail succeeds', () => {
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(sql(TABLE));
  });

  it("rewrites the first event's actor, and nothing refuses it", async () => {
    await seed('in_review', [ev('authoring', 'in_review')]);
    const refused = await attempt(
      `UPDATE canonical_documents SET audit = jsonb_set(audit, '{0,actor}', '"999"')`
    );
    expect(refused).toBeNull();
  });
});

describe('with the guard (20260925)', () => {
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(sql(TABLE));
    await db.exec(sql(GUARD));
  });

  it('is on the applier, after the table it guards', () => {
    const files = C2C_MIGRATION_FILES as string[];
    expect(files.indexOf(GUARD)).toBeGreaterThan(files.indexOf(TABLE));
    expect(files.indexOf(TABLE)).toBeGreaterThanOrEqual(0);
  });

  it('replays cleanly: the deploy re-runs it, and it installs each trigger once', async () => {
    await db.exec(sql(GUARD));
    const { rows } = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pg_trigger WHERE tgrelid = 'canonical_documents'::regclass AND NOT tgisinternal`
    );
    expect(rows[0].n).toBe(2);
  });

  describe('the trail only grows', () => {
    beforeEach(() => seed('in_review', [ev('authoring', 'in_review')]));

    it("refuses rewriting a recorded event's actor", async () => {
      expect(
        await attempt(
          `UPDATE canonical_documents SET audit = jsonb_set(audit, '{0,actor}', '"999"')`
        )
      ).toMatch(/only grows/);
    });

    it('refuses removing a recorded event', async () => {
      expect(await attempt(`UPDATE canonical_documents SET audit = '[]'::jsonb`)).toMatch(
        /only grows/
      );
    });

    it('refuses replacing the trail with something that is not an array', async () => {
      expect(await attempt(`UPDATE canonical_documents SET audit = '{}'::jsonb`)).toMatch(
        /must remain an array/
      );
    });

    it('allows appending an event', async () => {
      expect(
        await attempt(`UPDATE canonical_documents SET audit = audit || $1::jsonb`, [
          appendJson(ev('in_review', 'in_review', { reason: 'note' })),
        ])
      ).toBeNull();
    });
  });

  describe('an approval is written once', () => {
    beforeEach(() => seed('in_review', [ev('authoring', 'in_review')], { review: REVIEW }));

    it('records it with its transition, then refuses replacing or removing it', async () => {
      expect(
        await attempt(
          `UPDATE canonical_documents SET stage = 'approved', approval_signature = $1::jsonb, audit = audit || $2::jsonb`,
          [JSON.stringify(APPROVAL), appendJson(ev('in_review', 'approved'))]
        )
      ).toBeNull();
      expect(
        await attempt(
          `UPDATE canonical_documents SET approval_signature = $1::jsonb, audit = audit || $2::jsonb`,
          [JSON.stringify({ ...APPROVAL, actor: '999' }), appendJson(ev('approved', 'approved'))]
        )
      ).toMatch(/approval .* cannot be replaced/);
      expect(
        await attempt(
          `UPDATE canonical_documents SET approval_signature = NULL, audit = audit || $1::jsonb`,
          [appendJson(ev('approved', 'approved'))]
        )
      ).toMatch(/approval .* cannot be replaced/);
    });

    it('refuses an approval recorded with no trail event', async () => {
      expect(
        await attempt(`UPDATE canonical_documents SET approval_signature = $1::jsonb`, [
          JSON.stringify(APPROVAL),
        ])
      ).toMatch(/must append its own lifecycle event/);
    });
  });

  describe('a review sign-off closes only with a recorded revision', () => {
    beforeEach(() => seed('in_review', [ev('authoring', 'in_review')], { review: REVIEW }));

    it('refuses replacing it', async () => {
      expect(
        await attempt(
          `UPDATE canonical_documents SET review_signature = $1::jsonb, audit = audit || $2::jsonb`,
          [JSON.stringify({ ...REVIEW, actor: '999' }), appendJson(ev('in_review', 'in_review'))]
        )
      ).toMatch(/closes only with a recorded revision/);
    });

    it('refuses clearing it without the revision transition', async () => {
      expect(
        await attempt(
          `UPDATE canonical_documents SET review_signature = NULL, audit = audit || $1::jsonb`,
          [appendJson(ev('in_review', 'in_review'))]
        )
      ).toMatch(/closes only with a recorded revision/);
    });

    it('clears it on in_review → authoring, in the statement that records the transition', async () => {
      expect(
        await attempt(
          `UPDATE canonical_documents SET stage = 'authoring', review_signature = NULL, audit = audit || $1::jsonb`,
          [appendJson(ev('in_review', 'authoring'))]
        )
      ).toBeNull();
    });
  });

  describe('a stage change is its own recorded event', () => {
    beforeEach(() => seed('in_review', [ev('authoring', 'in_review')], { review: REVIEW }));

    it('refuses a stage change with no event', async () => {
      expect(await attempt(`UPDATE canonical_documents SET stage = 'withdrawn'`)).toMatch(
        /must append its own lifecycle event/
      );
    });

    it('refuses a stage change whose last event names another stage', async () => {
      expect(
        await attempt(
          `UPDATE canonical_documents SET stage = 'withdrawn', audit = audit || $1::jsonb`,
          [appendJson(ev('in_review', 'approved'))]
        )
      ).toMatch(/does not record that transition/);
    });
  });

  describe('frozen columns', () => {
    it('refuses changing the source binding, the tenant or the identity', async () => {
      await seed('authoring', []);
      expect(await attempt(`UPDATE canonical_documents SET source_refs = '{}'::jsonb`)).toMatch(
        /frozen/
      );
      expect(await attempt(`UPDATE canonical_documents SET organization_id = 2`)).toMatch(/frozen/);
      expect(await attempt(`UPDATE canonical_documents SET canonical_id = 'other'`)).toMatch(
        /frozen/
      );
    });

    it('allows a content hash to change during authoring, and refuses it after', async () => {
      await seed('authoring', []);
      expect(await attempt(`UPDATE canonical_documents SET content_hash = 'sha-2'`)).toBeNull();
      await db.query(
        `UPDATE canonical_documents SET stage = 'in_review', audit = audit || $1::jsonb`,
        [appendJson(ev('authoring', 'in_review'))]
      );
      expect(await attempt(`UPDATE canonical_documents SET content_hash = 'sha-3'`)).toMatch(
        /content hash .* frozen once it has left authoring/
      );
    });

    it('freezes a withdrawn document entirely', async () => {
      await seed('withdrawn', [ev('authoring', 'withdrawn')]);
      expect(await attempt(`UPDATE canonical_documents SET title = 'renamed'`)).toMatch(
        /withdrawn and can never be modified/
      );
      expect(await attempt(`UPDATE canonical_documents SET updated_at = now()`)).toBeNull();
    });
  });

  describe('nothing is deleted', () => {
    beforeEach(() => seed('authoring', []));

    it('refuses DELETE', async () => {
      expect(await attempt(`DELETE FROM canonical_documents`)).toMatch(/cannot be deleted/);
    });

    it('refuses TRUNCATE', async () => {
      expect(await attempt(`TRUNCATE canonical_documents`)).toMatch(/cannot be truncated/);
    });
  });
});
