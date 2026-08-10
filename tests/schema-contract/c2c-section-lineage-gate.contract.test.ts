/**
 * Contract: the governed c2c section write records provenance, or does not write.
 *
 * ── The gap this closes ───────────────────────────────────────────────────────
 * `PATCH /api/authoring/sections/:sectionId` has enforced since #1269 that a
 * section's content and its span lineage commit in one transaction or neither
 * does. `PATCH /api/c2c/documents/:id/sections/:key` — the OTHER write path,
 * against `c2c_documents`, which scaffold-project-documents.ts calls "the system
 * of record for a regulatory filing" — had no gate at all.
 *
 * So the store that matters most for a filing was the one place regulated text
 * could land with nothing recorded about where it came from. That is worse than
 * having no lineage anywhere: a report that reads the table finds real rows for
 * the authoring path, returns a coverage figure, and is silent about the
 * sections written through the other door. Partial provenance reads as complete.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 * Against real DDL on PGlite, using the real span-lineage service:
 *   • saving content writes spans covering it, in the same transaction;
 *   • the coverage assertion the route runs actually passes for that content;
 *   • it FAILS for content with no spans — the gate is not vacuous;
 *   • the jsonb -> text serialisation is single-valued, because spans recorded
 *     against one string and verified against another would silently point at
 *     the wrong words.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  replaceAuthorSpans,
  assertLineageCoversContent,
} from '../../server/services/clinical-regulatory-evidence/span-lineage.service';
import { detectSpans } from '../../server/services/sentenceTraceabilityService';
import { sectionPlainText } from '../../server/routes/c2c/documents';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LINEAGE = path.join(REPO, 'db/migrations/20260803_document_span_lineage.sql');

const ORG = 7;
const REF = { documentTable: 'c2c_document_sections', documentId: '4242' };

let pg: PGlite;
const exec = () => ({ query: (sql: string, p?: unknown[]) => pg.query(sql, p as any[]) }) as any;

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE organizations (id serial PRIMARY KEY, name text);`);
  // Explicit id: document_span_lineage.organization_id carries a FK to this
  // table, so the org under test has to be the one that exists. Seeding a
  // serial and assuming it matched ORG produced a foreign-key violation that
  // surfaced downstream as "cannot read properties of undefined" — the insert
  // never returned a row.
  await pg.exec(`INSERT INTO organizations (id, name) VALUES (${ORG}, 'acme');`);
  await pg.exec(fs.readFileSync(LINEAGE, 'utf8'));
});
afterEach(async () => { await pg?.close(); });

/** Exactly what the route does, so the test exercises the route's own logic. */
async function saveLikeTheRoute(content: unknown, userId = 11) {
  const plain = sectionPlainText(content);
  const spans = detectSpans(plain, 'clause').map((s) => ({
    charStart: s.charStart,
    charEnd: s.charEnd,
    spanText: s.text,
  }));
  await replaceAuthorSpans(
    ORG, REF, spans,
    { assertedBy: String(userId), createdBy: String(userId) },
    exec(),
  );
  await assertLineageCoversContent(ORG, REF, plain, exec());
  return plain;
}

const CONTENT = {
  paragraphs: [
    { id: 'p1', text: 'The NOAEL in the 28-day rat study was 30 mg/kg/day.' },
    { id: 'p2', text: 'No adverse findings were observed at the low dose, and recovery was complete.' },
  ],
};

describe('the c2c section save records provenance', () => {
  it('writes spans covering the saved text', async () => {
    const plain = await saveLikeTheRoute(CONTENT);

    const rows = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM document_span_lineage
        WHERE document_table = $1 AND document_id = $2 AND organization_id = $3`,
      [REF.documentTable, REF.documentId, ORG],
    );
    expect(Number(rows.rows[0].n)).toBeGreaterThan(0);
    expect(plain).toContain('NOAEL');
  }, 60_000);

  it('attributes every span to the saving user as an author assertion', async () => {
    await saveLikeTheRoute(CONTENT, 99);
    const rows = await pg.query<{ provenance_kind: string; asserted_by: string }>(
      `SELECT provenance_kind, asserted_by FROM document_span_lineage
        WHERE document_table = $1 AND document_id = $2`,
      [REF.documentTable, REF.documentId],
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    for (const r of rows.rows) {
      expect(r.provenance_kind).toBe('author_assertion');
      expect(r.asserted_by).toBe('99');
    }
  }, 60_000);

  it('replaces prior spans on re-save rather than accumulating them', async () => {
    await saveLikeTheRoute(CONTENT);
    const first = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM document_span_lineage
        WHERE document_table = $1 AND document_id = $2`, [REF.documentTable, REF.documentId],
    );
    await saveLikeTheRoute(CONTENT);
    const second = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM document_span_lineage
        WHERE document_table = $1 AND document_id = $2`, [REF.documentTable, REF.documentId],
    );
    // Stale spans pointing at text that no longer exists would be worse than
    // none: they read as provenance for words nobody wrote.
    expect(Number(second.rows[0].n)).toBe(Number(first.rows[0].n));
  }, 60_000);
});

describe('the gate is not vacuous', () => {
  it('refuses content that has no spans recorded for it', async () => {
    // The failure the route must surface: text present, provenance absent.
    await expect(
      assertLineageCoversContent(ORG, REF, 'Wholly unattributed regulatory prose.', exec()),
    ).rejects.toThrow();
  }, 60_000);

  it('refuses when the spans cover only part of the content', async () => {
    await saveLikeTheRoute(CONTENT);
    const extended = sectionPlainText(CONTENT) + '\n\nA later claim added with no provenance at all.';
    await expect(assertLineageCoversContent(ORG, REF, extended, exec())).rejects.toThrow();
  }, 60_000);
});

describe('lineage commits with the content, or not at all', () => {
  // This is the property replaceAuthorSpans silently did NOT have. It accepted an
  // `exec` and forwarded it to the retire UPDATE, but called recordAuthorSpan
  // without it — so every span INSERT ran on `defaultExec`, the pool, while the
  // caller believed it was inside their transaction.
  //
  // Nothing looked wrong in the happy path: pool statements autocommit, so the
  // surrounding transaction read the spans back and the coverage assertion
  // passed. The damage was on the failure path — a refused save rolled the
  // CONTENT back and left spans committed against text that was never
  // persisted. Provenance for words nobody wrote is worse than no provenance,
  // and it was hiding inside the gate built to prevent exactly that.
  it('spans written inside a transaction disappear when it rolls back', async () => {
    await pg.query('BEGIN');
    await replaceAuthorSpans(
      ORG, REF,
      [{ charStart: 0, charEnd: 12, spanText: 'Rolled back.' }],
      { assertedBy: '11', createdBy: '11' },
      exec(),
    );

    const during = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM document_span_lineage
        WHERE document_table = $1 AND document_id = $2 AND deleted_at IS NULL`,
      [REF.documentTable, REF.documentId],
    );
    expect(Number(during.rows[0].n), 'the spans should be visible inside the transaction').toBe(1);

    await pg.query('ROLLBACK');

    const after = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM document_span_lineage
        WHERE document_table = $1 AND document_id = $2`,
      [REF.documentTable, REF.documentId],
    );
    expect(
      Number(after.rows[0].n),
      'spans survived a rollback — they were written on a connection other than the ' +
        'caller\'s transaction, so a refused save leaves orphaned provenance behind',
    ).toBe(0);
  }, 60_000);
});

describe('the jsonb -> text serialisation is single-valued', () => {
  it('is deterministic for the same content', () => {
    expect(sectionPlainText(CONTENT)).toBe(sectionPlainText(CONTENT));
  });

  it('ignores paragraphs with no usable text instead of emitting "undefined"', () => {
    const out = sectionPlainText({
      paragraphs: [{ id: 'a', text: 'Kept.' }, { id: 'b' }, { id: 'c', text: 42 }, null],
    });
    // A stringified `undefined` would occupy real characters and shift every
    // offset after it, so provenance would point at the wrong words.
    expect(out).toBe('Kept.');
    expect(out).not.toContain('undefined');
  });

  it('returns empty only for shapes that carry no body at all', () => {
    for (const v of [null, undefined, {}, { paragraphs: null }, { paragraphs: 'x' }, 5]) {
      expect(sectionPlainText(v)).toBe('');
    }
  });

  it('serialises every shape the reader accepts, not just paragraphs', () => {
    // This is the defect the gate could not see. The editor saves
    // `{ text: … }` (useSectionSave.ts:89) and the serialiser read only
    // `paragraphs`, so it returned '' — and the route gates its whole lineage
    // block on `plain.trim().length > 0`. Every section a user typed into
    // committed with ZERO spans recorded, from a gate whose entire purpose is
    // that content and provenance commit together or neither does.
    expect(sectionPlainText({ text: 'Typed by a person.' })).toBe('Typed by a person.');
    expect(sectionPlainText({ markdown: '## Heading' })).toBe('## Heading');
    expect(sectionPlainText('legacy bare string')).toBe('legacy bare string');
  });

  it('paragraph serialisation is byte-identical to what it always was', () => {
    // Spans already recorded against `{paragraphs}` content are verified against
    // this string later. A changed join, or a changed skip rule, shifts every
    // offset after the change and makes existing provenance point at the wrong
    // words — so widening the OTHER shapes must not touch this one.
    expect(sectionPlainText({ paragraphs: [{ text: 'One.' }, { text: 'Two.' }] }))
      .toBe('One.\n\nTwo.');
  });

  it('precedence matches the reader when a row carries more than one key', () => {
    // contentToBody (useDossier.ts:80-99) checks paragraphs, then markdown,
    // then text. Server and reader disagreeing about which key wins is how the
    // has_content defect happened in the first place.
    expect(sectionPlainText({ paragraphs: [{ text: 'P' }], markdown: 'M', text: 'T' })).toBe('P');
    expect(sectionPlainText({ markdown: 'M', text: 'T' })).toBe('M');
  });
});

describe('the lineage gate now actually runs for the shape the editor saves', () => {
  it('a { text } save records spans and satisfies the coverage assertion', async () => {
    // Before the serialiser was widened this content produced plain === '',
    // the route skipped the block entirely, and the save committed with no
    // provenance. Now it takes the same path `{paragraphs}` content takes.
    const content = {
      text: 'The investigational product was administered once daily. '
          + 'No dose-limiting toxicity was observed at any level.',
    };
    const plain = sectionPlainText(content);
    expect(plain.trim().length).toBeGreaterThan(0);

    await saveLikeTheRoute(content);
    await expect(assertLineageCoversContent(ORG, REF, plain, exec())).resolves.toBeUndefined();

    const { rows } = await pg.query(
      `SELECT count(*)::int AS n FROM document_span_lineage
        WHERE organization_id = $1 AND document_id = $2 AND deleted_at IS NULL`,
      [ORG, REF.documentId],
    );
    expect((rows[0] as { n: number }).n).toBeGreaterThan(0);
  }, 60_000);
});
