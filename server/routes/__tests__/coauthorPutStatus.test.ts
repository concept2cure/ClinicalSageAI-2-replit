/**
 * A PUT cannot award a co-author document a verdict, and cannot rewrite one
 * that already carries a verdict — on EITHER route that writes the row.
 *
 * ── The defect (round-2 review of D7, 2026-09-23) ────────────────────────────
 * `PUT /api/coauthor/documents/:id` wrote `status` from the request body
 * verbatim, to any authenticated user in the organization, with no role check
 * and no derivation. The eCTD leaf resolver counts a source as submission-
 * finalized from exactly that column, and transmit refuses a package with an
 * unfinalized leaf. So one request —
 *
 *     PUT /api/coauthor/documents/<draft snapshot> {"status":"approved"}
 *
 * — cleared the "only approved documents" transmit refusal for a document no
 * one approved. The POST handler in the same file already says a client-
 * supplied status "would let any caller stamp approved on anything"; the PUT
 * did it.
 *
 * ── Why the round-2 fix was not sound (2026-09-23, W5/D7, round-3 review) ────
 *   1. `PUT /api/ectd-documents/:id` writes the SAME column verbatim, behind
 *      requireRole('regulatory-author'), which every org 'member' holds. The
 *      bypass was the same request to a different URL.
 *   2. It was a denylist of the resolver's two finalized values. The IND
 *      checklist and NDA cockpit read the same column and count `signed` and
 *      `locked` as complete, so {status:'signed'} still marked Form 1571 done;
 *      any other string was accepted too.
 *   3. A content edit under an existing `approved` status was allowed — and
 *      this file's round-2 case "accepts a PUT that restates an existing
 *      finalized status unchanged" PINNED it (content '<p>form v2</p>' under
 *      'approved', expecting 200). That was the defect, not a feature: the
 *      rewritten snapshot re-pins on the next upsertLeaf and transmits as
 *      approved. place-module3-into-submission.ts relies on "nothing edits
 *      placement snapshots". The case now expects 409.
 *   4. The restate test compared case-sensitively, so 'Approved' on an
 *      'approved' row was refused as a promotion, and ' approved' was written.
 *
 * ── The rule (server/services/coauthor/coauthor-status-write.ts) ─────────────
 * ONE rule both routes import. A PUT may set only a working state (draft,
 * in-progress, in_progress, review), compared trimmed and lower-cased and
 * written in that canonical form. Any other value is accepted only as a
 * restate of the row's current status (compared the same way), which is a
 * no-op; otherwise 400 and nothing written. Title / content / module changes
 * to a row whose current status is a verdict (the resolver's finalized set,
 * plus signed and locked) are refused 409 FINALIZED_DOCUMENT_READ_ONLY. Both
 * conditions sit in the UPDATE's own WHERE clause.
 *
 * Runs the real routers on PGlite so "nothing was written" is read back from
 * the table; the caller of the eCTD route is an ordinary org 'member' whose
 * roles are expanded by the real expandRoleClaims; the transmit refusal and
 * the IND checklist are read through their real assemblers.
 */
import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'coauthor-put-status-secret-padded-to-32-chars';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));

vi.mock('../../db', () => ({
  get db() {
    return holder.db;
  },
  pool: { query: (sql: string, params?: unknown[]) => holder.pglite.query(sql, params) },
  transaction: vi.fn(),
}));

vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { ...(req.user || {}), id: 3, userId: 3, organizationId: 7 };
    next();
  },
  authenticateToken: (_r: any, _s: any, n: any) => n(),
  requireAuth: (_r: any, _s: any, n: any) => n(),
}));

vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true })) },
}));

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';
import {
  assembleSequence,
  assembledTransmitBlockers,
} from '../../services/ectd/assemble-from-core';
import { assembleOrgIndChecklists } from '../../services/ind-lifecycle/ind-checklist-view-assembler';
import { expandRoleClaims } from '../../middleware/auth';
import { serverMessage } from '@/lib/queryClient';
import coauthorRoutes from '../coauthor';
import ectdDocumentsRoutes from '../ectd-documents';

const ORG = 7;
const OTHER_ORG = 8;
const USER = 3;
/** A draft snapshot placed as leaf m1.2 of sequence 0000. */
const DRAFT = 600;
/** A snapshot that is already approved (taken from an APPROVED source). */
const APPROVED = 601;
/** Another organization's draft. */
const FOREIGN = 602;
/** A draft placed as Form 1571 (m1.1.1), read by the IND checklist. */
const FORM_1571 = 603;
/** Rows already carrying the other two verdicts the readers count complete. */
const SIGNED = 604;
const LOCKED = 605;
/** A verdict stored with trailing whitespace (data written before the rule). */
const TAB_APPROVED = 606;
const STAMP = '2026-09-01T00:00:00.000Z';

let h: IndPgliteDb;
const app = express();
app.use(express.json());
// An ordinary org 'member' — roles expanded exactly as req.user is built.
app.use((req: any, _res, next) => {
  req.user = {
    id: USER,
    userId: USER,
    organizationId: ORG,
    role: 'member',
    roles: expandRoleClaims('member', undefined),
  };
  next();
});
app.use('/api/coauthor', coauthorRoutes);
app.use('/api/ectd-documents', ectdDocumentsRoutes);

const ROUTES = [
  { name: 'PUT /api/coauthor/documents/:id', path: (id: number) => `/api/coauthor/documents/${id}` },
  { name: 'PUT /api/ectd-documents/:id', path: (id: number) => `/api/ectd-documents/${id}` },
] as const;

type Row = { status: string; title: string; content: string; module_number: string; updated_at: Date };
const row = async (id: number): Promise<Row> =>
  (
    await h.pglite.query<Row>(
      'SELECT status, title, content, module_number, updated_at FROM coauthor_documents WHERE id = $1',
      [id],
    )
  ).rows[0];
const stamp = (r: Row) => new Date(r.updated_at).toISOString();

const blockers = async () => {
  const a = await assembleSequence({
    sequenceId: 1,
    organizationId: ORG,
    userId: USER,
    applicationId: 'IND-1',
    sponsorId: 'S',
    sponsorName: 'S',
  });
  try {
    return assembledTransmitBlockers(a);
  } finally {
    await a.cleanup();
  }
};

const form1571Done = async (): Promise<boolean | undefined> => {
  const lists = await assembleOrgIndChecklists(ORG);
  const sub = lists.find((c: any) => Number(c.submissionId ?? c.id) === 1) as any;
  return sub?.forms?.find((f: any) => f.id === 'FDA_1571')?.done;
};

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true });
  holder.db = h.db;
  holder.pglite = h.pglite;
  // The harness mirrors only the columns the resolver reads; the routes'
  // `.returning()` selects every column shared/schema.ts declares.
  await h.pglite.exec(`
    ALTER TABLE coauthor_documents
      ADD COLUMN IF NOT EXISTS sections JSONB, ADD COLUMN IF NOT EXISTS template_id INTEGER,
      ADD COLUMN IF NOT EXISTS created_by TEXT, ADD COLUMN IF NOT EXISTS client_workspace TEXT,
      ADD COLUMN IF NOT EXISTS completion_percentage INTEGER,
      ADD COLUMN IF NOT EXISTS regulatory_compliance_score INTEGER,
      ADD COLUMN IF NOT EXISTS metadata JSONB, ADD COLUMN IF NOT EXISTS ectd_module_id INTEGER,
      ADD COLUMN IF NOT EXISTS module_name TEXT, ADD COLUMN IF NOT EXISTS embedding TEXT;
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'Org');
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
      VALUES (1, 'ind', 'ind', 'biotech', 'fda', ${ORG}, ${USER});
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
      VALUES (1, 1, 'fda', '0000', ${ORG}, ${USER});
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by)
      VALUES (1, 'm1.2', 'Cover letter', 'new', 'coauthor_documents', ${DRAFT}, ${ORG}, ${USER}),
             (1, 'm1.1.1', 'Form 1571', 'new', 'coauthor_documents', ${FORM_1571}, ${ORG}, ${USER});
  `);
  // 2026-09-23 (W5/D7, round-3 review, repair 1): 120 s, not 60 s — the PGlite
  // boot timed out in beforeAll when run beside other suites on a shared host.
}, 120_000);

beforeEach(async () => {
  await h.pglite.exec(`
    DELETE FROM coauthor_documents;
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status, metadata, updated_at) VALUES
      (${DRAFT},     ${ORG},       'Cover letter', '<p>cover</p>',   'm1.2',   'draft',    '{"version":"0001"}', '${STAMP}'),
      (${APPROVED},  ${ORG},       'Form 3674',    '<p>form</p>',    'm1.1.3', 'approved', '{"version":"0001"}', '${STAMP}'),
      (${FOREIGN},   ${OTHER_ORG}, 'Not yours',    '<p>foreign</p>', 'm1.2',   'draft',    NULL,                 '${STAMP}'),
      (${FORM_1571}, ${ORG},       'Form 1571',    '<p>1571</p>',    'm1.1.1', 'draft',    NULL,                 '${STAMP}'),
      (${SIGNED},    ${ORG},       'Signed',       '<p>s</p>',       'm1.3',   'signed',   NULL,                 '${STAMP}'),
      (${LOCKED},    ${ORG},       'Locked',       '<p>l</p>',       'm1.4',   'locked',   NULL,                 '${STAMP}'),
      (${TAB_APPROVED}, ${ORG},    'Tabbed',       '<p>t</p>',       'm1.5',   E'approved\\t', NULL,             '${STAMP}');
  `);
});

afterAll(async () => {
  await h?.close();
});

describe.each(ROUTES)('$name cannot award a verdict', ({ path }) => {
  const put = (id: number, body: Record<string, unknown>) => request(app).put(path(id)).send(body);

  it("refuses {status:'approved'} on a draft with 400, writes nothing, and the transmit refusal stands", async () => {
    const before = await blockers();
    expect(before.join(' ')).toMatch(/not approved/);

    const res = await put(DRAFT, { status: 'approved' });

    expect(res.status, 'a caller stamped approved on a draft').toBe(400);
    expect(res.body.error).toBe('STATUS_NOT_SETTABLE');
    expect(res.body.governedPath).toMatch(/sourceAuthoringDocId/);
    const after = await row(DRAFT);
    expect(after.status).toBe('draft');
    expect(stamp(after), 'the refused PUT still wrote the row').toBe(STAMP);
    expect(await blockers(), 'a bare status write cleared the transmit refusal').toEqual(before);
  }, 60_000);

  it('refuses every value outside the working states — verdicts, spellings, whitespace, unknown strings', async () => {
    for (const status of [
      'finalized',
      'APPROVED',
      'Finalized',
      'signed',
      'locked',
      ' approved',
      'approved ',
      'published',
      'complete',
      '',
    ]) {
      const res = await put(DRAFT, { status });
      expect(res.status, `status ${JSON.stringify(status)} was accepted`).toBe(400);
    }
    const after = await row(DRAFT);
    expect(after.status).toBe('draft');
    expect(stamp(after)).toBe(STAMP);
  });

  it("refuses 'signed' and 'locked' on Form 1571, and the IND checklist still reads it not done", async () => {
    expect(await form1571Done()).toBe(false);

    for (const status of ['signed', 'locked']) {
      const res = await put(FORM_1571, { status });
      expect(res.status, `status '${status}' was accepted`).toBe(400);
      expect(await form1571Done(), `'${status}' marked Form 1571 done`).toBe(false);
    }
    expect((await row(FORM_1571)).status).toBe('draft');
  }, 60_000);

  it('writes none of a refused request, including the fields that were allowed on their own', async () => {
    const res = await put(DRAFT, { status: 'approved', title: 'Retitled', content: '<p>new</p>' });

    expect(res.status).toBe(400);
    expect(await row(DRAFT)).toMatchObject({ status: 'draft', title: 'Cover letter', content: '<p>cover</p>' });
  });

  it('does not let a verdict be relabelled as a different verdict', async () => {
    for (const status of ['finalized', 'signed', 'locked']) {
      const res = await put(APPROVED, { status });
      expect(res.status, `approved -> '${status}' was accepted`).toBe(400);
    }
    expect((await row(APPROVED)).status).toBe('approved');
  });

  it('refuses a status carrying control characters with 400, not a 500', async () => {
    /* 2026-09-23 (W5/D7, round-3 review): 'appro\u0000ved' reached Postgres
       and failed there (text cannot hold NUL) as 'Failed to update'. */
    for (const status of ['appro\u0000ved', 'draft\u0007', 're\nview']) {
      const res = await put(DRAFT, { status });
      expect(res.status, JSON.stringify(status)).toBe(400);
      expect(res.body.error).toBe('STATUS_NOT_SETTABLE');
    }
    expect(stamp(await row(DRAFT))).toBe(STAMP);
  });

  it('refuses a status that is not a string, rather than failing inside the rule', async () => {
    const res = await put(DRAFT, { status: { value: 'approved' } });
    expect(res.status).toBe(400);
    expect((await row(DRAFT)).status).toBe('draft');
  });
});

describe.each(ROUTES)('$name cannot rewrite a document that carries a verdict', ({ path }) => {
  const put = (id: number, body: Record<string, unknown>) => request(app).put(path(id)).send(body);

  it('refuses a content change to an approved row with 409, names the governed path, and writes nothing', async () => {
    /* Round-2 of this file asserted 200 for exactly this ('<p>form v2</p>'
       under 'approved') — that was the defect: the rewritten snapshot
       re-pins on the next upsertLeaf and transmits as approved. */
    const res = await put(APPROVED, { content: '<p>FORGED unapproved content</p>' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('FINALIZED_DOCUMENT_READ_ONLY');
    expect(res.body.message).toMatch(/source authoring document/i);
    // 2026-09-23 (W5/D7, round-3 review): the copy used to say "Edit the source
    // authoring document and place it into the filing again" — a path that
    // failed (the alias map refused a second copy). It now names re-placement,
    // which coauthorSnapshotFromSource.test.ts follows end to end.
    expect(res.body.message).toMatch(/placed into the filing again/i);
    const after = await row(APPROVED);
    expect(after).toMatchObject({ status: 'approved', content: '<p>form</p>' });
    expect(stamp(after)).toBe(STAMP);
  });

  it('shows the refusal to the user: the client error reader lifts the message verbatim', async () => {
    /* EctdCoauthor.saveContent renders `Not saved — <message>`; the message
       reaches it through apiRequest's serverMessage, which drops copy that
       looks internal (an API route, a table name). A refusal carrying a route
       would degrade to a generic sentence and the author would not learn
       where to go. */
    const res = await put(APPROVED, { content: '<p>x</p>' });
    expect(serverMessage(res.body)).toBe(res.body.message);
  });

  it('refuses a restate combined with a content change, and a title change', async () => {
    const restate = await put(APPROVED, { status: 'approved', content: '<p>form v2</p>' });
    expect(restate.status).toBe(409);

    const retitle = await put(APPROVED, { title: 'Retitled' });
    expect(retitle.status).toBe(409);

    expect(await row(APPROVED)).toMatchObject({ status: 'approved', title: 'Form 3674', content: '<p>form</p>' });
  });

  it('refuses content changes to signed and locked rows too', async () => {
    for (const id of [SIGNED, LOCKED]) {
      const before = await row(id);
      const res = await put(id, { content: '<p>changed</p>' });
      expect(res.status, `row ${before.status} was rewritten`).toBe(409);
      expect(await row(id)).toMatchObject({ status: before.status, content: before.content });
    }
  });

  it('treats a verdict stored with trailing whitespace as a verdict — the guard and its normaliser agree', async () => {
    /* 2026-09-23 (W5/D7, round-3 review): the guard compared lower(btrim())
       in SQL (spaces only) while the JS rule trimmed all whitespace, so a
       stored 'approved\t' was a verdict to one and editable to the other. */
    const res = await put(TAB_APPROVED, { content: '<p>changed</p>' });
    expect(res.status).toBe(409);
    expect(await row(TAB_APPROVED)).toMatchObject({ content: '<p>t</p>' });
  });

  it("treats 'Approved' on an 'approved' row as a no-op restate, not a promotion", async () => {
    const res = await put(APPROVED, { status: 'Approved' });

    expect(res.status).toBe(200);
    const after = await row(APPROVED);
    expect(after.status, 'the restate rewrote the stored spelling').toBe('approved');
    expect(stamp(after), 'a no-op restate touched the row').toBe(STAMP);
  });
});

describe.each(ROUTES)('$name — every working edit keeps working', ({ path }) => {
  const put = (id: number, body: Record<string, unknown>) => request(app).put(path(id)).send(body);

  it('saves a content-only PUT on a draft — the one client caller, EctdCoauthor.saveContent', async () => {
    const res = await put(DRAFT, { content: '<p>revised</p>' });

    expect(res.status).toBe(200);
    expect(res.body.document).toMatchObject({ id: DRAFT, content: '<p>revised</p>', status: 'draft' });
    expect(await row(DRAFT)).toMatchObject({ content: '<p>revised</p>', status: 'draft' });
  });

  it('moves between working states and writes the canonical spelling', async () => {
    for (const [sent, stored] of [
      ['review', 'review'],
      ['In-Progress', 'in-progress'],
      [' in_progress ', 'in_progress'],
      ['Draft', 'draft'],
    ] as const) {
      const res = await put(DRAFT, { status: sent });
      expect(res.status, `working state ${JSON.stringify(sent)} was refused`).toBe(200);
      expect((await row(DRAFT)).status).toBe(stored);
    }
  });

  it('lets a verdict be withdrawn to a working state (the fail-safe direction)', async () => {
    const res = await put(APPROVED, { status: 'draft' });
    expect(res.status).toBe(200);
    expect((await row(APPROVED)).status).toBe('draft');
  });

  it("still answers 404 for a document that is not this organization's, and leaves it alone", async () => {
    const res = await put(FOREIGN, { status: 'draft', content: '<p>mine now</p>' });
    expect(res.status).toBe(404);
    expect(await row(FOREIGN)).toMatchObject({ status: 'draft', content: '<p>foreign</p>' });

    expect((await put(99999, { status: 'draft' })).status).toBe(404);
  });
});

describe('PUT /api/ectd-documents/:id — route-specific fields', () => {
  const put = (id: number, body: Record<string, unknown>) =>
    request(app).put(`/api/ectd-documents/${id}`).send(body);

  it('refuses moving an approved document to another module (it would land its verdict on another section)', async () => {
    const res = await put(APPROVED, { module: 'm1.1.1' });
    expect(res.status).toBe(409);
    expect((await row(APPROVED)).module_number).toBe('m1.1.3');
    expect(await form1571Done()).toBe(false);
  }, 60_000);

  it('a refused status write neither bumps the version nor logs an update (its own approved-list branch is gone)', async () => {
    /* The route kept a second, case-sensitive `approved || finalized` list
       and bumped metadata.version to 0002 when a PUT stamped approved. */
    const res = await put(DRAFT, { status: 'approved' });
    expect(res.status).toBe(400);
    const meta = (
      await h.pglite.query<{ metadata: { version?: string; lifecycle?: unknown[] } }>(
        'SELECT metadata FROM coauthor_documents WHERE id = $1',
        [DRAFT],
      )
    ).rows[0].metadata;
    expect(meta.version).toBe('0001');
    expect(meta.lifecycle, 'a refused PUT logged an update').toBeUndefined();
  });

  it('a no-op restate logs no lifecycle event either', async () => {
    const res = await put(APPROVED, { status: 'APPROVED' });
    expect(res.status).toBe(200);
    expect(res.body.document).toMatchObject({ status: 'approved', version: '0001' });
    const meta = (
      await h.pglite.query<{ metadata: { lifecycle?: unknown[] } }>(
        'SELECT metadata FROM coauthor_documents WHERE id = $1',
        [APPROVED],
      )
    ).rows[0].metadata;
    expect(meta.lifecycle).toBeUndefined();
  });
});
