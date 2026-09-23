/**
 * The SQL behind protocol signatures, against the REAL migrations in PGlite:
 *
 *   - separation of duties: who authored a protocol (creator + governed edits),
 *     and that review activity is not counted as authorship;
 *   - the §11.70 content binding: finalization and a reviewer's disposition bind
 *     the same protocol content, and any content change moves the digest;
 *   - who may sign a disposition, and with which meaning.
 *
 * The route test (server/routes/__tests__/protocol-signatures.routes.test.ts)
 * proves the ceremony's order with the database stubbed; this proves the
 * queries it relies on run against the schema a deploy builds.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const holder = vi.hoisted(() => ({
  query: async (_sql: string, _params?: unknown[]): Promise<{ rows: any[] }> => {
    throw new Error('PGlite not initialised yet');
  },
}));
vi.mock('../../../db.js', () => ({ pool: { query: (s: string, p?: unknown[]) => holder.query(s, p) }, db: {} }));
vi.mock('../../../db', () => ({
  pool: {
    query: (s: string, p?: unknown[]) => holder.query(s, p),
    // One PGlite session: the signing transaction and pool reads share it.
    connect: async () => ({ query: (s: string, p?: unknown[]) => holder.query(s, p), release: () => undefined }),
  },
  db: {},
}));
// The ceremony's order is what these cases test, against the real authorship
// SQL and the real finalize. Re-authentication, the ledger pair and the
// signature row are the canonical path's own and are tested there.
const ceremony = vi.hoisted(() => ({ signed: [] as Array<{ target: string; userId: number }> }));
vi.mock('../../../routes/c2c/actions', () => ({
  verifyReauth: async () => ({ ok: true }),
  recordGovernedAction: async (_c: unknown, a: { target: string; userId: number }) => {
    ceremony.signed.push({ target: a.target, userId: a.userId });
    return { actionId: 'act', auditId: 1, sha256Chain: 'chain' };
  },
}));
vi.mock('../../part11/signature-persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../part11/signature-persistence')>()),
  persistGovernedSignSignature: async () => ({ id: 'sig', signedAt: new Date('2026-09-23T00:00:00Z') }),
}));

import { resolveTargetAuthors } from '../../governance/separation-of-duties';
import { BINDING_BASIS, deriveGovernedTargetBinding } from '../../part11/signature-persistence';
import { assignReviewerTx, ProtocolReviewError, setDispositionTx } from '../../protocol-reviews/protocol-reviews-service';
import { finalizeProtocolTx } from '../protocol-development-service';
import { ProtocolSignatureRefusal, signProtocolAct } from '../protocol-signature';

const ORG = 42;
const OTHER_ORG = 99;
const CREATOR = 7;
const EDITOR = 8;
const REVIEWER = 9;
const STRANGER = 10;
const VIEWER = 11;

let pglite: PGlite;
const q = async (sql: string, params?: unknown[]) => {
  const r = await pglite.query(sql, params as unknown[]);
  return { rows: r.rows as any[] };
};
const client = { query: q };

function migration(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../../', rel), 'utf8');
}

let actionSeq = 0;
async function ledger(orgId: number, userId: number, command: string, target: string, payload: Record<string, unknown> = {}) {
  actionSeq += 1;
  await q(
    `INSERT INTO c2c_ana_actions (id, org_id, domain, surface, command, target, payload, state, proposed_by, decided_by)
     VALUES ($1,$2,'protocol_development','api',$3,$4,$5::jsonb,'executed',$6,$6)`,
    [`act_${actionSeq}`, orgId, command, target, JSON.stringify(payload), userId],
  );
}

async function protocol(orgId = ORG): Promise<{ docId: number; sectionId: number }> {
  const d = await q(
    `INSERT INTO protocol_documents (organization_id, protocol_kind, title, created_by)
     VALUES ($1,'clinical','A Phase 2 Study',$2) RETURNING id`,
    [orgId, CREATOR],
  );
  const docId = Number(d.rows[0].id);
  const s = await q(
    `INSERT INTO protocol_sections (organization_id, protocol_document_id, section_key, title, content, order_index, created_by)
     VALUES ($1,$2,'background','Background','Original text.',0,$3) RETURNING id`,
    [orgId, docId, CREATOR],
  );
  return { docId, sectionId: Number(s.rows[0].id) };
}

async function assignment(docId: number, reviewerUserId: number | null, orgId = ORG): Promise<number> {
  const a = await q(
    `INSERT INTO protocol_review_assignments (organization_id, protocol_document_id, reviewer_name, reviewer_user_id, created_by)
     VALUES ($1,$2,'Dr. Reviewer',$3,$4) RETURNING id`,
    [orgId, docId, reviewerUserId, CREATOR],
  );
  return Number(a.rows[0].id);
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT, name TEXT);
    CREATE TABLE research_personnel (id SERIAL PRIMARY KEY);
    -- shared/schema.ts organizationUsers: the membership and org role a reviewer assignment is checked against.
    CREATE TABLE organization_users (
      id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member', UNIQUE (user_id, organization_id));
    INSERT INTO organizations (id, name) VALUES (${ORG},'a'), (${OTHER_ORG},'b');
    INSERT INTO users (id, email, name) VALUES
      (${CREATOR},'c@e.test','Creator'), (${EDITOR},'e@e.test','Editor'),
      (${REVIEWER},'r@e.test','Reviewer'), (${STRANGER},'s@e.test','Stranger'), (${VIEWER},'v@e.test','Viewer');
    INSERT INTO organization_users (organization_id, user_id, role) VALUES
      (${ORG},${CREATOR},'admin'), (${ORG},${EDITOR},'member'), (${ORG},${REVIEWER},'member'),
      (${ORG},${VIEWER},'viewer'), (${OTHER_ORG},${STRANGER},'member');
  `);
  await pglite.exec(migration('migrations/20260527_mutation_primitives.sql'));
  await pglite.exec(migration('db/migrations/20260730_c2c_ana_actions_command_vocab.sql'));
  await pglite.exec(migration('migrations/20260621_protocol_development.sql'));
  await pglite.exec(migration('migrations/20260629_protocol_reviews.sql'));
  await pglite.exec(migration('migrations/20260701_protocol_soa.sql'));
  await pglite.exec(migration('migrations/20260921_protocol_documents_sponsor_pi.sql'));
  holder.query = q;
}, 120_000);

afterAll(async () => {
  await pglite?.close();
});

describe('who authored a protocol', () => {
  it('the creator and everyone who edited it through the ledger, and no one else', async () => {
    const { docId, sectionId } = await protocol();
    await ledger(ORG, EDITOR, 'update', `protocol-section:${sectionId}`);
    await ledger(ORG, EDITOR, 'update', `protocol-visit:77`, { documentId: docId });
    // Review activity is not authorship.
    await ledger(ORG, REVIEWER, 'create', `protocol-document:${docId}`, { commentId: 1 });
    await ledger(ORG, REVIEWER, 'update', `protocol-review-comment:1`);
    await ledger(ORG, REVIEWER, 'sign', `protocol-review-assignment:1`);
    // Another tenant editing a protocol with the same id is not this protocol.
    await ledger(OTHER_ORG, STRANGER, 'update', `protocol-document:${docId}`);

    const a = await resolveTargetAuthors(`protocol-document:${docId}`, ORG);
    expect(a.modelled).toBe(true);
    expect(a.authors).toEqual([CREATOR, EDITOR]);
    expect(a.sources).toEqual(['protocol content', 'protocol creator', 'protocol edit ledger']);
  });

  it('whoever built the schedule of assessments or the objectives is an author; a commenting reviewer is not', async () => {
    const { docId } = await protocol();
    await q(
      `INSERT INTO protocol_soa_assessments (organization_id, protocol_document_id, name, category, order_index, created_by)
       VALUES ($1,$2,'Vital signs','vital_signs',0,$3)`,
      [ORG, docId, EDITOR],
    );
    await q(
      `INSERT INTO protocol_objectives (organization_id, protocol_document_id, objective_type, objective, order_index, created_by)
       VALUES ($1,$2,'primary','Reduce HbA1c',0,$3)`,
      [ORG, docId, STRANGER],
    );
    await q(
      `INSERT INTO protocol_review_comments (organization_id, protocol_document_id, comment, severity, created_by)
       VALUES ($1,$2,'Clarify the endpoint','major',$3)`,
      [ORG, docId, REVIEWER],
    );
    const a = await resolveTargetAuthors(`protocol-document:${docId}`, ORG);
    expect(a.authors).toEqual([CREATOR, EDITOR, STRANGER]);
    expect(a.authors).not.toContain(REVIEWER);
  });

  it('reads on the client it is given', async () => {
    const { docId } = await protocol();
    const seen: string[] = [];
    const spy = { query: async (sql: string, params?: unknown[]) => { seen.push(sql); return q(sql, params); } };
    await resolveTargetAuthors(`protocol-document:${docId}`, ORG, spy);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('comments, budget, version snapshots and other modules\' records are not authorship of the protocol', async () => {
    const { docId } = await protocol();
    // AnA's review comment, budget parameters, a version snapshot (ledger row
    // and the version row it writes), and an Other Support entry whose own
    // document happens to share this protocol's id.
    await ledger(ORG, REVIEWER, 'update', `protocol-document:${docId}`, { commentId: 4, severity: 'major' });
    await ledger(ORG, EDITOR, 'update', `protocol-document:${docId}`, { paramsId: 2 });
    await ledger(ORG, STRANGER, 'update', `protocol-document:${docId}`, { version: '0.2' });
    await q(
      `INSERT INTO protocol_versions (organization_id, protocol_document_id, version, change_summary, snapshot, created_by)
       VALUES ($1,$2,'0.2','Snapshot','{}',$3)`,
      [ORG, docId, STRANGER],
    );
    await ledger(ORG, STRANGER, 'update', `other-support-entry:3`, { documentId: docId });
    expect((await resolveTargetAuthors(`protocol-document:${docId}`, ORG)).authors).toEqual([CREATOR]);
  });

  it('a synopsis edit, which records no payload, counts', async () => {
    const { docId } = await protocol();
    await q(
      `INSERT INTO c2c_ana_actions (id, org_id, domain, surface, command, target, state, proposed_by, decided_by)
       VALUES ('act_nopayload',$1,'protocol_development','api','update',$2,'executed',$3,$3)`,
      [ORG, `protocol-document:${docId}`, EDITOR],
    );
    expect((await resolveTargetAuthors(`protocol-document:${docId}`, ORG)).authors).toEqual([CREATOR, EDITOR]);
  });

  it('a document-level edit counts', async () => {
    const { docId } = await protocol();
    await ledger(ORG, STRANGER, 'update', `protocol-document:${docId}`, { objectiveId: 3 });
    expect((await resolveTargetAuthors(`protocol-document:${docId}`, ORG)).authors).toEqual([CREATOR, STRANGER]);
  });

  it('a disposition is independent of the reviewed protocol\'s authors', async () => {
    const { docId } = await protocol();
    await ledger(ORG, EDITOR, 'update', `protocol-document:${docId}`);
    const aid = await assignment(docId, REVIEWER);
    expect((await resolveTargetAuthors(`protocol-review-assignment:${aid}`, ORG)).authors).toEqual([CREATOR, EDITOR]);
  });

  it('another tenant\'s protocol has no authors here, so it cannot be shown independent', async () => {
    const { docId } = await protocol(OTHER_ORG);
    const a = await resolveTargetAuthors(`protocol-document:${docId}`, ORG);
    expect(a.modelled).toBe(true);
    expect(a.authors).toEqual([]);
  });
});

describe('what a protocol signature binds', () => {
  it('finalization and a disposition bind the same content, re-derivably', async () => {
    const { docId } = await protocol();
    const aid = await assignment(docId, REVIEWER);
    const doc = await deriveGovernedTargetBinding(client, `protocol-document:${docId}`, ORG);
    const disp = await deriveGovernedTargetBinding(client, `protocol-review-assignment:${aid}`, ORG);
    expect(doc.basis).toBe(BINDING_BASIS.PROTOCOL_DOCUMENT_CONTENT);
    expect(doc.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(disp.digest).toBe(doc.digest);
    // Same content, same digest.
    expect((await deriveGovernedTargetBinding(client, `protocol-document:${docId}`, ORG)).digest).toBe(doc.digest);
  });

  it('finalization does not move it: version and workflow status are not content', async () => {
    const { docId } = await protocol();
    const before = await deriveGovernedTargetBinding(client, `protocol-document:${docId}`, ORG);
    await q(`UPDATE protocol_documents SET version = '1.0', status = 'finalized' WHERE id = $1`, [docId]);
    await q(`UPDATE protocol_sections SET status = 'complete' WHERE protocol_document_id = $1`, [docId]);
    const after = await deriveGovernedTargetBinding(client, `protocol-document:${docId}`, ORG);
    expect(after.digest).toBe(before.digest);
  });

  it.each([
    ['an objective', `INSERT INTO protocol_objectives (organization_id, protocol_document_id, objective_type, objective, order_index, created_by) VALUES ($1,$2,'primary','Reduce HbA1c',0,${CREATOR})`],
    ['an eligibility criterion', `INSERT INTO protocol_eligibility_criteria (organization_id, protocol_document_id, kind, criterion, order_index, created_by) VALUES ($1,$2,'inclusion','Age 18 or over',0,${CREATOR})`],
    ['a visit', `INSERT INTO protocol_schedule_visits (organization_id, protocol_document_id, visit_name, timepoint, order_index, created_by) VALUES ($1,$2,'Screening','Day -14',0,${CREATOR})`],
    ['the synopsis', `UPDATE protocol_documents SET synopsis = 'A new synopsis' WHERE organization_id = $1 AND id = $2`],
    ['the sponsor', `UPDATE protocol_documents SET sponsor = 'Acme Bio' WHERE organization_id = $1 AND id = $2`],
  ])('adding or changing %s moves it', async (_what, sql) => {
    const { docId } = await protocol();
    const before = await deriveGovernedTargetBinding(client, `protocol-document:${docId}`, ORG);
    await q(sql, [ORG, docId]);
    const after = await deriveGovernedTargetBinding(client, `protocol-document:${docId}`, ORG);
    expect(after.digest).not.toBe(before.digest);
  });

  it('changing the content moves the digest', async () => {
    const { docId, sectionId } = await protocol();
    const before = await deriveGovernedTargetBinding(client, `protocol-document:${docId}`, ORG);
    await q(`UPDATE protocol_sections SET content = 'Changed text.' WHERE id = $1`, [sectionId]);
    const after = await deriveGovernedTargetBinding(client, `protocol-document:${docId}`, ORG);
    expect(after.digest).not.toBe(before.digest);
  });

  it('another tenant\'s protocol binds nothing of its content', async () => {
    const { docId } = await protocol(OTHER_ORG);
    const b = await deriveGovernedTargetBinding(client, `protocol-document:${docId}`, ORG);
    expect(b.basis).toBe(BINDING_BASIS.GOVERNED_ACTION_LEDGER);
    expect(b.digest).toBeNull();
  });
});

describe('who may sign a disposition, and as what', () => {
  it('the assigned reviewer, as review', async () => {
    const { docId } = await protocol();
    const aid = await assignment(docId, REVIEWER);
    const r = await setDispositionTx(client, ORG, aid, { disposition: 'approve', signerId: REVIEWER, meaning: 'review' });
    expect(r).toMatchObject({ disposition: 'approve', protocolDocumentId: docId, onBehalfOf: null });
    const row = (await q(`SELECT disposition, status FROM protocol_review_assignments WHERE id = $1`, [aid])).rows[0];
    expect(row).toEqual({ disposition: 'approve', status: 'completed' });
  });

  it('not someone else, and nothing is recorded', async () => {
    const { docId } = await protocol();
    const aid = await assignment(docId, REVIEWER);
    await expect(setDispositionTx(client, ORG, aid, { disposition: 'approve', signerId: STRANGER, meaning: 'review' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const row = (await q(`SELECT disposition FROM protocol_review_assignments WHERE id = $1`, [aid])).rows[0];
    expect(row.disposition).toBeNull();
  });

  it('a reviewer with no account can only have their decision recorded under responsibility', async () => {
    const { docId } = await protocol();
    const aid = await assignment(docId, null);
    await expect(setDispositionTx(client, ORG, aid, { disposition: 'reject', signerId: STRANGER, meaning: 'review' })).rejects.toBeInstanceOf(ProtocolReviewError);
    const r = await setDispositionTx(client, ORG, aid, { disposition: 'reject', signerId: STRANGER, meaning: 'responsibility' });
    expect(r.onBehalfOf).toBe('Dr. Reviewer');
  });

  it('a signed disposition is final: a second signing is refused and the decision stands', async () => {
    const { docId } = await protocol();
    const aid = await assignment(docId, REVIEWER);
    await setDispositionTx(client, ORG, aid, { disposition: 'approve', signerId: REVIEWER, meaning: 'review' });
    await expect(setDispositionTx(client, ORG, aid, { disposition: 'reject', signerId: REVIEWER, meaning: 'review' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const row = (await q(`SELECT disposition FROM protocol_review_assignments WHERE id = $1`, [aid])).rows[0];
    expect(row.disposition).toBe('approve');
  });

  it('another tenant\'s assignment is not found', async () => {
    const { docId } = await protocol(OTHER_ORG);
    const aid = await assignment(docId, REVIEWER, OTHER_ORG);
    await expect(setDispositionTx(client, ORG, aid, { disposition: 'approve', signerId: REVIEWER, meaning: 'review' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('the ceremony checks authorship before the act writes anything', () => {
  /** A clinical protocol that passes the completeness gate, built by CREATOR. */
  async function finalizable(): Promise<number> {
    const { docId } = await protocol();
    await q(`UPDATE protocol_sections SET status = 'complete' WHERE protocol_document_id = $1`, [docId]);
    await q(
      `INSERT INTO protocol_objectives (organization_id, protocol_document_id, objective_type, objective, order_index, created_by)
       VALUES ($1,$2,'primary','Reduce HbA1c',0,$3)`,
      [ORG, docId, CREATOR],
    );
    await q(
      `INSERT INTO protocol_eligibility_criteria (organization_id, protocol_document_id, kind, criterion, order_index, created_by)
       VALUES ($1,$2,'inclusion','Adults 18-75',0,$3)`,
      [ORG, docId, CREATOR],
    );
    await q(
      `INSERT INTO protocol_schedule_visits (organization_id, protocol_document_id, visit_name, order_index, created_by)
       VALUES ($1,$2,'Screening',0,$3)`,
      [ORG, docId, CREATOR],
    );
    return docId;
  }

  function finalize(docId: number, signer: number, meaning: string) {
    return signProtocolAct({
      orgId: ORG,
      userId: signer,
      target: `protocol-document:${docId}`,
      reason: 'Protocol complete; finalizing for submission',
      meaning,
      allowedMeanings: ['authorship', 'approval', 'responsibility'],
      reauth: { password: 'pw' },
      ipAddress: null,
      role: 'member',
      write: async (c, m) => {
        const r = await finalizeProtocolTx(c as never, ORG, signer, docId);
        return { payload: { version: r.version, meaning: m }, body: { documentId: docId, version: r.version } };
      },
    });
  }

  async function status(docId: number): Promise<string> {
    return (await q(`SELECT status FROM protocol_documents WHERE id = $1`, [docId])).rows[0].status;
  }

  it('someone independent of the authors finalizes it as approval: the version row finalize writes does not make them an author', async () => {
    const docId = await finalizable();
    const r = await finalize(docId, STRANGER, 'approval');
    expect(r.meaning).toBe('approval');
    expect(r.version).toBe('1.0');
    expect(await status(docId)).toBe('finalized');
  });

  it('a non-author cannot finalize as its author, and nothing is written', async () => {
    const docId = await finalizable();
    const before = ceremony.signed.length;
    const err = await finalize(docId, STRANGER, 'authorship').catch((e) => e);
    expect(err).toBeInstanceOf(ProtocolSignatureRefusal);
    expect(err.code).toBe('NOT_AN_AUTHOR');
    expect(await status(docId)).toBe('draft');
    expect((await q(`SELECT count(*)::int n FROM protocol_versions WHERE protocol_document_id = $1`, [docId])).rows[0].n).toBe(0);
    expect(ceremony.signed.length).toBe(before);
  });

  it('the author finalizes it as its author', async () => {
    const docId = await finalizable();
    const r = await finalize(docId, CREATOR, 'authorship');
    expect(r.meaning).toBe('authorship');
    expect(await status(docId)).toBe('finalized');
  });

  it('whatever the act itself writes is not read as authorship of what is being signed', async () => {
    // Pins the order, not one act's rows: even an act that wrote protocol
    // content under the signer's id would be checked against the record as it
    // stood before the signature.
    const docId = await finalizable();
    const r = await signProtocolAct({
      orgId: ORG, userId: STRANGER, target: `protocol-document:${docId}`,
      reason: 'Approving the protocol as written', meaning: 'approval',
      allowedMeanings: ['approval'], reauth: { password: 'pw' }, ipAddress: null, role: 'member',
      write: async (c) => {
        await (c as unknown as { query: typeof q }).query(
          `INSERT INTO protocol_sections (organization_id, protocol_document_id, section_key, title, content, order_index, created_by)
           VALUES ($1,$2,'appendix','Appendix','Added in the act.',9,$3)`,
          [ORG, docId, STRANGER],
        );
        return { body: { documentId: docId } };
      },
    });
    expect(r.meaning).toBe('approval');
  });

  it('the author cannot approve their own protocol', async () => {
    const docId = await finalizable();
    const err = await finalize(docId, CREATOR, 'approval').catch((e) => e);
    expect(err).toBeInstanceOf(ProtocolSignatureRefusal);
    expect(err.code).toBe('SEPARATION_OF_DUTIES');
    expect(await status(docId)).toBe('draft');
  });
});

describe('who a review can be assigned to', () => {
  const input = (reviewerUserId: number | null) => ({ reviewerName: 'Dr. Reviewer', reviewerUserId, role: 'scientific' });

  it('a member who can sign', async () => {
    const { docId } = await protocol();
    const r = await assignReviewerTx(client, ORG, CREATOR, docId, input(REVIEWER));
    expect(r.role).toBe('scientific');
  });

  it('a named reviewer with no account', async () => {
    const { docId } = await protocol();
    await expect(assignReviewerTx(client, ORG, CREATOR, docId, input(null))).resolves.toMatchObject({ role: 'scientific' });
  });

  it('not a user of another organization: the review could never be signed', async () => {
    const { docId } = await protocol();
    const err = await assignReviewerTx(client, ORG, CREATOR, docId, input(STRANGER)).catch((e) => e);
    expect(err).toBeInstanceOf(ProtocolReviewError);
    expect(err.code).toBe('BAD_INPUT');
    expect(err.message).toMatch(/not a member of this organization/);
  });

  it('not a viewer, who cannot sign', async () => {
    const { docId } = await protocol();
    const err = await assignReviewerTx(client, ORG, CREATOR, docId, input(VIEWER)).catch((e) => e);
    expect(err.code).toBe('BAD_INPUT');
    expect(err.message).toMatch(/cannot sign/);
  });

  it('the disposition reports the protocol version that was reviewed', async () => {
    const { docId } = await protocol();
    await q(`UPDATE protocol_documents SET version = '0.4' WHERE id = $1`, [docId]);
    const aid = await assignment(docId, REVIEWER);
    const r = await setDispositionTx(client, ORG, aid, { disposition: 'approve', signerId: REVIEWER, meaning: 'review' });
    expect(r.protocolVersion).toBe('0.4');
  });
});
