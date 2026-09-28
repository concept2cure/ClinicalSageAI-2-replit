/**
 * A filing snapshot inherits the source document's governed state — and only
 * what that source has actually earned.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `POST /api/coauthor/documents` hardcoded `status: 'draft'`, and that one word
 * made the authoring editor structurally incapable of producing a filable
 * package.
 *
 * The eCTD leaf resolver counts a source as submission-finalized only when its
 * status is 'approved' or 'finalized' — correctly; a draft must never count
 * toward a complete package. So every snapshot "Place into filing" created was
 * unfinalized, and `assertEctdSubmissionComplete` throws whenever completeness
 * is required. A document the author had frozen, hash-sealed and e-signed was
 * filed as a draft, and no UI could change it: the only client that PUTs a
 * coauthor document sends `{ content }` alone.
 *
 * ── The half that matters most ───────────────────────────────────────────────
 * The status is DERIVED SERVER-SIDE and never accepted from the caller. That is
 * not a detail: a client-supplied status would let anyone stamp 'approved' on a
 * draft and make an incomplete package report itself complete — the same
 * unearned-verdict class this codebase keeps having to remove, but this time
 * loadbearing on whether a submission is filable. The caller may say WHICH
 * document it is snapshotting; what that document's state IS gets read from the
 * record, under the caller's own organization.
 */
import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'coauthor-snapshot-secret-padded-to-32-chars-plus';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

/** Rows the source-document lookup returns, and the values actually inserted. */
const state = vi.hoisted(() => ({
  sourceRows: [] as Array<{ status: string | null }>,
  inserted: [] as Record<string, unknown>[],
}));

vi.mock('../../db', async () => {
  /* 2026-09-23 (W5/D7, round-3 review, repair 1): harness only — no case
     below changed. A sourced snapshot now takes its text and title from the
     source's saved sections (services/coauthor/coauthor-snapshot.ts) and
     re-reads the source FOR UPDATE inside the create's transaction, so the
     mock answers by statement rather than returning the source row to every
     query. The text itself is pinned on PGlite in
     coauthorSnapshotFromSource.test.ts.
     2026-09-23 (W5/D7, round-3 review, repair 2): harness only again. The
     placement now re-reads the sections on its transaction and holds an
     approved/finalized copy to the source's seal (frozen_documents), so the
     sections carry id and order_index and a matching seal is answered. The
     seal rule itself is pinned in coauthorSnapshotFromSource.test.ts and, on
     the real authoring router, coauthorSnapshotSeal.test.ts. */
  const { PgDialect } = await import('drizzle-orm/pg-core');
  const { createHash } = await import('node:crypto');
  const dialect = new PgDialect();
  const SECTIONS = [{ id: 's1', code: '2.5', title: 'Overview', content: 'Text.', order_index: 0 }];
  const frozenContent = JSON.stringify({ document: { title: 'M2.5 Clinical Overview' }, sections: SECTIONS });
  const answer = (text: string) => {
    if (/FROM frozen_documents/i.test(text)) {
      const rows = [
        {
          version: 'v1.0.frozen',
          frozen_content: frozenContent,
          content_hash: createHash('sha256').update(frozenContent).digest('hex'),
        },
      ];
      return { rows, rowCount: 1 };
    }
    if (/FROM authoring_sections/i.test(text)) {
      const rows = state.sourceRows.length ? SECTIONS : [];
      return { rows, rowCount: rows.length };
    }
    if (/SELECT title, module FROM authoring_documents/i.test(text)) {
      const rows = state.sourceRows.length ? [{ title: 'M2.5 Clinical Overview', module: null }] : [];
      return { rows, rowCount: rows.length };
    }
    if (/FROM authoring_documents/i.test(text)) {
      return { rows: state.sourceRows, rowCount: state.sourceRows.length };
    }
    // The alias writer probes for its table with to_regclass; this database
    // has none, so the snapshot is created without an alias.
    if (/to_regclass/i.test(text)) return { rows: [{ present: false }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const pool = { query: vi.fn(async (text: string) => answer(text)) };
  const insert = () => ({
    values: (v: Record<string, unknown>) => ({
      returning: async () => {
        state.inserted.push(v);
        return [{ id: 101, ...v }];
      },
    }),
  });
  // The create runs the row and its alias-map write in one transaction (L10).
  const tx = { insert, execute: async (q: any) => answer(dialect.sqlToQuery(q).sql) };
  const db = { insert, transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) };
  return { db, pool, transaction: vi.fn(), getPool: () => pool, getDb: () => db };
});

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { id: 5, userId: 5, organizationId: 1, email: 'a@example.test' };
    next();
  },
  authenticateToken: (_r: any, _s: any, n: any) => n(),
  requireAuth: (_r: any, _s: any, n: any) => n(),
}));
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { id: 5, userId: 5, organizationId: 1, email: 'a@example.test' };
    next();
  },
  authenticateToken: (_r: any, _s: any, n: any) => n(),
  requireAuth: (_r: any, _s: any, n: any) => n(),
}));

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import coauthorRoutes from '../coauthor';

const app = express();
app.use(express.json());
app.use('/api/coauthor', coauthorRoutes);

const place = (body: Record<string, unknown>) =>
  request(app).post('/api/coauthor/documents').send({ title: 'M2.5 Clinical Overview', ...body });

const lastInsert = () => state.inserted[state.inserted.length - 1];
// authoring_documents ids are uuids; the alias map refuses anything else (L10).
const SOURCE_DOC = '7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f';

beforeEach(() => {
  state.sourceRows = [];
  state.inserted = [];
});

describe('the snapshot carries what the source document earned', () => {
  it('an APPROVED document files as approved — the case that was impossible', async () => {
    /* Before this, an e-signed and approved document was snapshotted as a
       draft, so the package it went into could never be complete. */
    state.sourceRows = [{ status: 'APPROVED' }];
    const res = await place({ content: '<p>Text.</p>', sourceAuthoringDocId: SOURCE_DOC });
    expect(res.status).toBe(201);
    expect(lastInsert().status).toBe('approved');
  });

  it('a FROZEN document files as finalized', async () => {
    /* Freezing snapshots the content, hash-seals it and locks the document —
       and, since the freeze gate, proves it carries no unresolved comments or
       undecided tracked changes. That is what "finalized" means. */
    state.sourceRows = [{ status: 'FROZEN' }];
    await place({ content: '<p>Text.</p>', sourceAuthoringDocId: SOURCE_DOC });
    expect(lastInsert().status).toBe('finalized');
  });

  it('a DRAFT document still files as a draft, and still fails completeness', async () => {
    /* The rule the resolver enforces is right and must not be weakened. An
       unfinished document must not be able to make a package look complete. */
    state.sourceRows = [{ status: 'draft' }];
    await place({ content: '<p>Text.</p>', sourceAuthoringDocId: SOURCE_DOC });
    expect(lastInsert().status).toBe('draft');
  });

  it('an unrecognised state files as a draft, never as something better', async () => {
    state.sourceRows = [{ status: 'IN_REVIEW' }];
    await place({ content: '<p>Text.</p>', sourceAuthoringDocId: SOURCE_DOC });
    expect(lastInsert().status).toBe('draft');
  });

  it('a source with no status at all files as a draft', async () => {
    state.sourceRows = [{ status: null }];
    await place({ content: '<p>Text.</p>', sourceAuthoringDocId: SOURCE_DOC });
    expect(lastInsert().status).toBe('draft');
  });
});

describe('the caller cannot award the status itself', () => {
  it('ignores a status sent in the body', async () => {
    /* THE SECURITY PROPERTY. If this were honoured, anyone could stamp
       'approved' on a draft and make an incomplete submission report itself
       complete. */
    state.sourceRows = [{ status: 'draft' }];
    await place({ content: '<p>Text.</p>', sourceAuthoringDocId: SOURCE_DOC, status: 'approved' });
    expect(lastInsert().status, 'a client-supplied status was honoured').toBe('draft');
  });

  it('ignores a status even with no source document named', async () => {
    await place({ content: '<p>Text.</p>', status: 'finalized' });
    expect(lastInsert().status).toBe('draft');
  });

  it('refuses a source document that is not this organization\'s', async () => {
    /* The lookup is org-scoped, so a foreign or missing id returns no row.
       Refused rather than quietly falling back to a draft snapshot: the caller
       asked for a document's state to be carried, and carrying a different
       one silently is worse than saying no. */
    state.sourceRows = [];
    const res = await place({ content: '<p>Text.</p>', sourceAuthoringDocId: 'someone-elses-doc' });
    expect(res.status).toBe(404);
    expect(state.inserted, 'a snapshot was created anyway').toHaveLength(0);
  });
});

describe('provenance', () => {
  it('records which document the status came from', async () => {
    /* So the status can be audited back to the record that justified it,
       rather than taken on trust. */
    state.sourceRows = [{ status: 'APPROVED' }];
    await place({ content: '<p>Text.</p>', sourceAuthoringDocId: 'doc-42' });
    expect(lastInsert().metadata).toMatchObject({
      source: 'authoring-document',
      docId: 'doc-42',
      status: 'APPROVED',
    });
  });

  it('leaves an unsourced snapshot with no provenance claim', async () => {
    await place({ content: '<p>Text.</p>' });
    expect(lastInsert().metadata).toBeUndefined();
  });
});
