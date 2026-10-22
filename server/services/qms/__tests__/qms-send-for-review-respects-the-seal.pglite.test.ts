/**
 * A sealed editing copy cannot be sent for review through the QMS register.
 *
 * WHAT THIS PINS, AND WHY IT IS NOT OBVIOUS FROM THE WRITE. The last statement
 * of `updateControlledQmsDocument` writes the bound editing copy:
 *
 *     UPDATE authoring_documents SET title = COALESCE($3,title),
 *            status = COALESCE($4,status), updated_at = NOW()
 *      WHERE id = $1 AND tenant_id = $2
 *
 * with `$4 = 'IN_REVIEW'` when the register entry is sent for review. It reads
 * the authoring document's current status NOWHERE. Read on its own it looks
 * like the one writer in the platform that can move a document out of FROZEN —
 * which would undo this platform's one signing ceremony (DP-35 / P1-32:
 * §11.10(g) authority, a §11.50 meaning, §11.200 re-verification, and an
 * `authoring_signatures` row bound by covered_freeze_version /
 * covered_content_hash to the snapshot it seals; "permanently (there is no
 * unfreeze)").
 *
 * It cannot. Two lines above it,
 * `requireContentAccess(..., row.authoring_document_id, 'edit')` asks
 * `decideAuthoringPermission`, and that refuses `edit` on an immutable status
 * before anything else — including before the global-admin bypass, so not even
 * SUPER_ADMIN gets through. The seal holds.
 *
 * THE REASON THIS TEST EXISTS ANYWAY. The guarantee is incidental and it was
 * untested. It does not come from `LOCKED_DOCUMENT_STATUSES` in
 * document-lock.ts — the module whose header calls itself "the ONE definition,
 * shared by every entry point" — but from `IMMUTABLE_DOCUMENT_STATUSES` in
 * authoring-permissions.ts, a different list in a different module. The two
 * disagree: {FROZEN, APPROVED} against eight statuses. So the QMS seal rests
 * on a list nothing connects to the seal, no test covered that reliance, and
 * one tidy of either list would open the un-freeze silently with every other
 * test still green.
 *
 * These cases run as an organization ADMIN (the harness resolves the signer
 * role to `admin`), which is the principal that would otherwise be hardest to
 * refuse.
 */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction: async () => ({ actionId: 'action', auditId: 'audit', sha256Chain: 'chain' }) }));
vi.mock('../../c2c/document-alias-map', () => ({ recordDocumentAlias: async () => ({ recorded: true }), canonicalIdFor: async () => null, DocumentAliasConflictError: class extends Error {} }));
vi.mock('../../authoring/authoring-permissions', async (original) => ({
  ...await original<typeof import('../../authoring/authoring-permissions')>(), grantAuthoringPermission: async () => undefined,
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => 'admin' }));
vi.mock('../../authoring/authoring-evidence', async (original) => ({
  ...await original<typeof import('../../authoring/authoring-evidence')>(),
  writeAuthoringAuditTrail: async () => undefined,
  createRevision: async (q: { query: Function }, args: { sectionId: string; content: string; updatedBy: string; tenantId: number }) => {
    await q.query('INSERT INTO doc_revisions (section_id,content,created_by,tenant_id) VALUES ($1,$2,$3,$4)', [args.sectionId,args.content,args.updatedBy,args.tenantId]);
    return 'revision';
  },
}));
vi.mock('../../part11/signature-persistence', async (original) => ({
  ...await original<typeof import('../../part11/signature-persistence')>(),
  persistGovernedActionSignature: async () => ({ id: 51, signedAt: new Date('2026-10-14T12:00:00Z') }),
}));
import { createControlledQmsDocument, reviseControlledQmsDocument, updateControlledQmsDocument } from '../controlled-document-service';
import { decideAuthoringPermission, resolveAuthoringDocumentScope } from '../../authoring/authoring-permissions';
import type { CreateContext } from '../../authoring/authoring-documents';
import { installQmsProgramAccessHarness } from './qms-authoring-harness';

const PID = '00000000-0000-4000-8000-000000000012';
let db: PGlite;
let ctx: CreateContext;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations (id int PRIMARY KEY); INSERT INTO organizations VALUES (9),(10);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY,organization_id int,deleted_at timestamptz); INSERT INTO regulatory_programs VALUES ('${PID}',9,NULL);
    CREATE TABLE authoring_documents (id uuid PRIMARY KEY,title text,module text,product_code text,locale text,status text,created_by text,created_at timestamptz,updated_at timestamptz,
      tenant_id int,template_id uuid,client_program_id uuid,approved_at timestamptz,frozen_at timestamptz,locked_at timestamptz,locked_by text);
    CREATE TABLE authoring_sections (id uuid PRIMARY KEY,doc_id uuid REFERENCES authoring_documents(id),code text,title text,content text,order_index int,created_at timestamptz,updated_at timestamptz,tenant_id int);
    CREATE TABLE doc_revisions (id serial,section_id uuid,content text,created_by text,tenant_id int);
    CREATE TABLE doc_permissions (tenant_id int,doc_id uuid,section_id uuid,principal_id text,email text,role text,
      revoked_at timestamptz,valid_from timestamptz DEFAULT NOW(),valid_until timestamptz);
    CREATE TABLE qms_documents (id serial PRIMARY KEY,organization_id int,doc_number text,title text,doc_type text,category text,version text,status text,
      author_id int,approver_id int,approved_at timestamptz,effective_date date,next_review_date date,artifact_id int,metadata jsonb DEFAULT '{}',updated_at timestamptz,deleted_at timestamptz);
    CREATE UNIQUE INDEX qms_numbers ON qms_documents(organization_id,doc_number);`);
  await installQmsProgramAccessHarness(db,9,3,PID);
  await db.exec(`INSERT INTO users VALUES (7,'active'),(8,'active'); INSERT INTO organization_users VALUES (9,7,'admin'),(9,8,'reviewer');
    INSERT INTO project_members VALUES (9,9,8,'use','active');`);
  await db.exec(await readFile('db/migrations/20261014_qms_controlled_authoring_content.sql','utf8'));
  const pool = { query: (sql: string, args?: unknown[]) => db.query(sql,args), connect: async () => ({ query: (sql: string, args?: unknown[]) => db.query(sql,args), release: () => undefined }) };
  ctx = { pool: pool as unknown as CreateContext['pool'], tenantId: 9, actor: { id: '3', email: null },
    audit: { pool, tenantId: 9, actorId: '3', actorEmail: 'unknown', actorRole: 'author', ipAddress: 'unknown', userAgent: 'test' } };
});
afterAll(async () => { await db?.close(); });

let seq = 0;
/**
 * A controlled document with saved text, so QMS_CONTENT_REQUIRED is not what
 * refuses. `seal` is written directly, exactly as the authoring freeze writes
 * it (`POST /docs/:docId/freeze` sets authoring_documents.status) — the point
 * is the state the QMS path then finds, not how it was reached.
 */
async function controlled(seal: 'FROZEN' | 'APPROVED' | null) {
  seq += 1;
  const row = await createControlledQmsDocument(ctx, {
    title: `Procedure ${seq}`, docType: 'sop', programId: PID, templateKey: 'sop',
    reason: `Create controlled procedure ${seq}`,
  });
  await db.query(`UPDATE authoring_sections SET content = '<p>Controlled procedure text.</p>' WHERE doc_id = $1`, [row.authoring_document_id]);
  if (seal) await db.query(`UPDATE authoring_documents SET status = $2, frozen_at = NOW() WHERE id = $1`, [row.authoring_document_id, seal]);
  return row;
}

const authoringStatus = async (docId: string) =>
  (await db.query<{ status: string }>('SELECT status FROM authoring_documents WHERE id = $1', [docId])).rows[0]?.status;

describe('a sealed editing copy survives a send-for-review', () => {
  for (const seal of ['FROZEN', 'APPROVED'] as const) {
    it(`refuses to send for review when the editing copy is ${seal}, and leaves it ${seal}`, async () => {
      const row = await controlled(seal);
      await expect(
        updateControlledQmsDocument(ctx, row.id, { status: 'in_review', reason: 'Send for independent review' }),
      ).rejects.toMatchObject({ status: 409, code: 'QMS_DOCUMENT_SEALED' });
      expect(await authoringStatus(row.authoring_document_id), 'the seal must still be there').toBe(seal);
      // And the register entry did not move either: the refusal is the whole act.
      const after = await db.query<{ status: string }>('SELECT status FROM qms_documents WHERE id = $1', [row.id]);
      expect(after.rows[0].status).toBe('draft');
    });
  }

  it('refuses because the document is sealed, ahead of every grant and bypass', async () => {
    /* Asserted on the decider itself, because the QMS layer collapses every
       permission outcome into one code. The ordering is the load-bearing part:
       `document-immutable` is returned BEFORE the global-admin branch, so the
       seal is not something a role can out-rank. */
    const row = await controlled('FROZEN');
    const scope = await resolveAuthoringDocumentScope(ctx.pool, 9, row.authoring_document_id);
    const asSuperAdmin = { id: '3', email: null, roles: ['SUPER_ADMIN'] };
    const edit = await decideAuthoringPermission({ pool: ctx.pool, scope, principal: asSuperAdmin, action: 'edit' });
    expect(edit.allowed).toBe(false);
    expect(edit.reason, 'the seal, not a missing grant').toBe('document-immutable');
    // And the same principal may still read and export it — a sealed document
    // is what those actions exist for.
    for (const action of ['view', 'export'] as const) {
      expect((await decideAuthoringPermission({ pool: ctx.pool, scope, principal: asSuperAdmin, action })).allowed, action).toBe(true);
    }
  });

  it('says the document is sealed, and does not blame the reader\'s permissions', async () => {
    /* P-40. This refused with 403 QMS_DOCUMENT_PERMISSION_DENIED, "You do not
       have permission to read or change this authored document" — to an
       organization ADMIN who owns it. The refusal was right and its sentence
       was false: the reason the decider returned was `document-immutable`, and
       requireContentAccess collapsed every outcome into the permission one,
       throwing away the information an honest message needs. */
    const row = await controlled('FROZEN');
    const err = await updateControlledQmsDocument(ctx, row.id, {
      status: 'in_review', reason: 'Send for independent review',
    }).catch((e) => e);
    expect(String(err.message), 'the seal, not the reader').not.toMatch(/permission/i);
    expect(String(err.message), 'what is true').toMatch(/sealed/i);
    expect(String(err.message), 'and what to do about it').toMatch(/revision/i);
  });

  it('does not rename a sealed editing copy either', async () => {
    const row = await controlled('FROZEN');
    await expect(
      updateControlledQmsDocument(ctx, row.id, { title: 'Renamed after sealing', reason: 'Correct the register title' }),
    ).rejects.toMatchObject({ status: 409, code: 'QMS_DOCUMENT_SEALED' });
    const doc = await db.query<{ title: string }>('SELECT title FROM authoring_documents WHERE id = $1', [row.authoring_document_id]);
    expect(doc.rows[0].title, 'a sealed row is not relabelled').not.toBe('Renamed after sealing');
  });
});

describe('an unsealed draft still goes to review, exactly as before', () => {
  it('sends an unsealed draft for review and moves the editing copy to IN_REVIEW', async () => {
    const row = await controlled(null);
    const updated = await updateControlledQmsDocument(ctx, row.id, { status: 'in_review', reason: 'Send for independent review' });
    expect(updated.status).toBe('in_review');
    // IN_REVIEW is deliberately NOT a sealing status (document-lock.ts): review
    // is a state a document is edited during, and the review board finds work
    // by upper(d.status) = 'IN_REVIEW'. This path must keep writing it.
    expect(await authoringStatus(row.authoring_document_id)).toBe('IN_REVIEW');
  });

  it('still renames an unsealed editing copy', async () => {
    const row = await controlled(null);
    await updateControlledQmsDocument(ctx, row.id, { title: 'Renamed while a draft', reason: 'Correct the register title' });
    const doc = await db.query<{ title: string }>('SELECT title FROM authoring_documents WHERE id = $1', [row.authoring_document_id]);
    expect(doc.rows[0].title).toBe('Renamed while a draft');
  });
});

describe('the remedy that sentence names is performable (P-40)', () => {
  /* Before P-40 it was not. A register entry at `draft` whose editing copy was
     sealed could not be sent for review (the seal, correctly) and could not be
     revised either: reviseControlledQmsDocument admitted
     effective/retired/superseded/in_review and not `draft`. The frozen
     message's own remedy — "Create a new version to make further changes" —
     has no route on the authoring side at all, and there is no unfreeze. So
     the document was stranded, and naming a revision in the refusal above
     would have been the same unperformable-remedy mistake this session already
     made once with FILING_DIVERGED. */

  it('revises a draft whose editing copy is sealed, onto a NEW editing copy', async () => {
    const row = await controlled('FROZEN');
    const revised = await reviseControlledQmsDocument(ctx, row.id, 'Revise because the sealed copy needs changes');
    expect(revised.version, 'a revision bumps the version').toBe('2.0');
    expect(revised.authoring_document_id, 'and binds a NEW editing copy').not.toBe(row.authoring_document_id);
    // The seal and every signature over it are untouched; the old copy is
    // retained by id, which is what makes this safe rather than an un-freeze.
    expect(await authoringStatus(row.authoring_document_id)).toBe('FROZEN');
    expect(revised.metadata.retainedAuthoringDocuments).toContain(row.authoring_document_id);
    // The sealed text came across, so the revision starts from what was sealed.
    const copied = await db.query<{ content: string }>('SELECT content FROM authoring_sections WHERE doc_id = $1', [revised.authoring_document_id]);
    expect(copied.rows.some((r) => r.content.includes('Controlled procedure text.'))).toBe(true);
  });

  it('still refuses to revise a draft whose editing copy is NOT sealed', async () => {
    // The widening is conditional on the seal. Without that condition it would
    // be a free version bump on any draft — a new door, not a remedy.
    const row = await controlled(null);
    await expect(
      reviseControlledQmsDocument(ctx, row.id, 'Revise an ordinary draft for no reason'),
    ).rejects.toMatchObject({ code: 'QMS_INVALID_STATE' });
  });
});
