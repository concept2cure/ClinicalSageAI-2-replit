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

vi.mock('../../db', () => {
  const pool = {
    query: vi.fn(async () => ({ rows: state.sourceRows, rowCount: state.sourceRows.length })),
  };
  const insert = () => ({
    values: (v: Record<string, unknown>) => ({
      returning: async () => {
        state.inserted.push(v);
        return [{ id: 101, ...v }];
      },
    }),
  });
  // The create runs the row and its alias-map write in one transaction
  // (L10). The alias writer first probes for its table with to_regclass;
  // this database has none, so the snapshot is created without an alias.
  const tx = { insert, execute: async () => ({ rows: [{ present: false }] }) };
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
