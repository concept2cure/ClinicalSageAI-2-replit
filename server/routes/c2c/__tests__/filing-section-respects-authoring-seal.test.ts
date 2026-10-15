/**
 * A sealed authoring document's FILING copy cannot be edited either.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `server/services/authoring/document-lock.ts` exists because of MDX UAT
 * 2026-08-18 item A4: a FROZEN document still accepted edits, so "the seal
 * recorded a hash of content that could still be changed underneath it". Its
 * own header states the rule it was written to enforce:
 *
 *   "Section CONTENT is mutated on four paths, not one — the editor save, the
 *    history revert, the AnA draft accept, and section creation. A gate written
 *    into the route the UAT happened to exercise would leave the other three
 *    open, and the next content path added would be open by default. One
 *    guard, called by every writer, is the repository's standing rule."
 *
 * There is a FIFTH content path, and it is the one that matters most for a
 * submission: `PATCH /api/c2c/documents/:id/sections/:key`, the MDx editor's
 * save (client/src/concept2cure/mdx/hooks/useSectionSave.ts). It writes
 * `c2c_document_sections` — the system of record the eCTD leaf is materialized
 * from (server/services/ectd/leaf-source-resolver.ts) — and it never asks the
 * bound authoring document whether it is sealed. Measured before this change:
 * the route's guards are auth, content-or-status, the approved/locked status
 * refusal, a reason, a valid status, a valid draftSource, and
 * `c2c_documents.status IN ('locked','submitted')`. `authoring_documents`
 * appears nowhere in the file.
 *
 * And the freeze does not close it from the other side: POST /docs/:docId/freeze
 * inserts `frozen_documents` and sets `authoring_documents.status = 'FROZEN'`,
 * and touches `c2c_documents` not at all.
 *
 * So a FROZEN — or APPROVED, i.e. e-signed — document's filed text could still
 * be changed, through the store a submission is built from, while its seal and
 * every signature over it covered the editing layer only. §11.10(e) requires
 * the record a signature is applied to be protected from alteration.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * The route consults the ONE canonical guard (`checkDocumentWritable`) for the
 * authoring document bound to this filing, and refuses with the lock's own
 * sentence. A filing with no bound authoring document has no authoring seal to
 * respect and is unaffected. A deployment without the authoring bundle cannot
 * be asked, and says so rather than guessing either way.
 *
 * Found by the read-only verification of round 14's nine-exit claim (three
 * independent search angles; this is the finding the destination-first angle
 * surfaced and the one with the module's own header against it).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  writeMutation: vi.fn(),
  /** What `authoring_documents` holds for the documents bound to this filing. */
  authoring: null as null | Array<{ id: string; status: string; locked_at?: string | null }>,
  /** Whether this deployment has the authoring bundle at all. */
  authoringTablePresent: true,
  /** Whether the binding lookup fails outright (a read this route cannot make). */
  authoringReadThrows: false,
  /** The filing document's own lifecycle state. */
  filingStatus: 'draft',
  statements: [] as string[],
}));

/** Every statement this route issues, so a missing question is visible. */
function record(sql: string): void {
  h.statements.push(sql.replace(/\s+/g, ' ').trim());
}

vi.mock('../../../db.js', () => {
  const answer = async (sql: string) => {
    record(sql);
    if (/FROM\s+authoring_documents/i.test(sql)) {
      /* Two DIFFERENT failures, deliberately: a deployment without the
         authoring bundle raises 42P01 (undefined_table) and nothing can be
         sealed on that side, while any other read failure means the seal is
         UNKNOWN. Collapsing them would make one of the two cases below pass
         for the wrong reason. */
      if (h.authoringReadThrows) throw Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
      if (!h.authoringTablePresent) throw Object.assign(new Error('relation "authoring_documents" does not exist'), { code: '42P01' });
      const bound = (h.authoring ?? []).map((d) => ({ id: d.id, status: d.status, locked_at: d.locked_at ?? null }));
      return { rows: bound, rowCount: bound.length };
    }
    if (/to_regclass/i.test(sql)) {
      return { rows: [{ present: h.authoringTablePresent }], rowCount: 1 };
    }
    if (/FROM\s+c2c_documents/i.test(sql)) {
      return { rows: [{ id: 'doc-1', status: h.filingStatus }], rowCount: 1 };
    }
    /* The section already exists, which is the case that matters: a sealed
       document's sections are written. It also keeps every case on the UPDATE
       branch, so the red is about the seal and not about which branch ran. */
    if (/FROM\s+c2c_document_sections/i.test(sql)) {
      return { rows: [{ id: 'sec-1', status: 'drafted' }], rowCount: 1 };
    }
    if (/FROM\s+c2c_rule_packs/i.test(sql) || /rule_pack/i.test(sql)) return { rows: [], rowCount: 0 };
    /* The write itself. The route returns the row it wrote, so a stub that
       answers nothing turns every case into a 500 and the red would be about
       this fixture rather than about the seal. */
    if (/INSERT INTO c2c_document_sections|UPDATE c2c_document_sections/i.test(sql)) {
      return {
        rows: [{ id: 'sec-1', document_id: 'doc-1', section_key: '2.5', content: { text: 'Text put straight into the filing.' }, status: 'drafted', draft_source: null }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  };
  return {
    pool: {
      query: answer,
      connect: async () => ({ query: answer, release: () => {} }),
    },
  };
});
/* Neither the lineage gate nor the governed-action ledger is under test here;
   both are exercised against real Postgres elsewhere. Stubbed so a 500 from
   an unstubbed coverage assertion cannot masquerade as the refusal this file
   is about. */
vi.mock('../../../services/clinical-regulatory-evidence/span-lineage.service.js', () => ({
  replaceAuthorSpans: async () => ({ written: 1, retired: 0 }),
  assertLineageCoversContent: async () => undefined,
}));
vi.mock('../actions.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../actions.js')>()),
  writeMutation: (...a: unknown[]) => h.writeMutation(...a),
  recordGovernedAction: async () => ({ actionId: 'act_1', auditId: 'aud_1' }),
}));

const USER = 7;
const ORG = 3;

async function app() {
  const router = (await import('../documents.js')).default;
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: USER, organizationId: ORG };
    next();
  });
  a.use('/api/c2c/documents', router);
  return a;
}

const saveSection = async (body: Record<string, unknown> = {}) =>
  request(await app())
    .patch('/api/c2c/documents/doc-1/sections/2.5')
    .send({ content: { text: 'Text put straight into the filing.' }, reason: 'drafting 2.5', ...body });

/** Did the route write the filing's section row? */
const wroteSection = () =>
  h.statements.some((s) => /(INSERT INTO c2c_document_sections|UPDATE c2c_document_sections)/i.test(s));
/** Did it ask the authoring store whether the document is sealed? */
const askedTheSeal = () => h.statements.some((s) => /FROM\s+authoring_documents/i.test(s));

beforeEach(() => {
  h.writeMutation.mockReset();
  h.writeMutation.mockResolvedValue({ actionId: 'act_1', auditId: 'aud_1' });
  h.authoring = null;
  h.authoringTablePresent = true;
  h.authoringReadThrows = false;
  h.filingStatus = 'draft';
  h.statements = [];
});

describe('PATCH /api/c2c/documents/:id/sections/:key respects the authoring seal', () => {
  it('refuses a content edit when the bound authoring document is FROZEN, and writes nothing', async () => {
    h.authoring = [{ id: 'auth-1', status: 'FROZEN' }];
    const res = await saveSection();
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.code ?? res.body.error).toBe('DOCUMENT_FROZEN');
    /* The lock's own sentence, not a second copy of it. */
    expect(String(res.body.message ?? '')).toMatch(/frozen/i);
    expect(askedTheSeal(), 'the route never asked whether the document is sealed').toBe(true);
    expect(wroteSection(), 'a sealed record was altered').toBe(false);
  });

  it('refuses it when the bound document is APPROVED — an approval e-signature freezes it too', async () => {
    h.authoring = [{ id: 'auth-1', status: 'APPROVED' }];
    const res = await saveSection();
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(wroteSection()).toBe(false);
  });

  it('allows it when the bound authoring document is still editable', async () => {
    /* The negative control: the guard is not a blanket refusal. */
    h.authoring = [{ id: 'auth-1', status: 'draft' }];
    const res = await saveSection();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(askedTheSeal()).toBe(true);
  });

  it('allows it when no authoring document is bound to this filing', async () => {
    /* A filing nobody edits through Authoring has no authoring seal to respect.
       The MDx editor is a first-class door, not a second-class one. */
    h.authoring = null;
    const res = await saveSection();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it('allows it where the deployment has no authoring bundle — nothing can be bound, so nothing is sealed', async () => {
    h.authoringTablePresent = false;
    const res = await saveSection();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });

  it('refuses when the seal cannot be read at all — an unreadable status is not permission', async () => {
    /* document-lock.ts's stated posture: "A document whose status cannot be
       read is NOT writable. The alternative — treating an unreadable status as
       unlocked — would turn any transient read failure into permission to
       write to a sealed record, which is the one outcome this gate exists to
       prevent." */
    h.authoringReadThrows = true;
    const res = await saveSection();
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(res.body.code).toBe('SEAL_CHECK_UNAVAILABLE');
    expect(wroteSection()).toBe(false);
  });

  it('ONE sealed editing copy is enough: the binding is not unique', async () => {
    /* `authoring_documents.c2c_document_id` carries no uniqueness, so the rows
       are filtered rather than the first one winning. The editable copy is
       listed FIRST on purpose — a first-row-wins reading would admit the save
       over a frozen copy of the same filing. */
    h.authoring = [
      { id: 'auth-editable', status: 'draft' },
      { id: 'auth-frozen', status: 'FROZEN' },
    ];
    const res = await saveSection();
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(wroteSection()).toBe(false);
  });

  it('honours locked_at as well as the status, which is the schema\u2019s other lock', async () => {
    /* Nothing sets `locked_at` today. Honouring it costs nothing and means a
       future writer that does set it is enforced from the moment it lands —
       the reason document-lock.ts reads it, pinned here so the filing door
       cannot be the one place it is forgotten. */
    h.authoring = [{ id: 'auth-1', status: 'draft', locked_at: '2026-10-09T10:00:00Z' }];
    const res = await saveSection();
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(wroteSection()).toBe(false);
  });

  it('a status-only change is refused on a sealed document too', async () => {
    /* `status: 'review'` carries no new text, but moving a sealed document
       through the workflow is still a change to a sealed record. */
    h.authoring = [{ id: 'auth-1', status: 'FROZEN' }];
    const res = await saveSection({ content: undefined, status: 'review' });
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(wroteSection()).toBe(false);
  });
});
