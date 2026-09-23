/**
 * The governed freeze/dispatch gate is bound to what it freezes, and to a filed
 * inventory that can no longer move under it.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic). Two fail-opens in the package gate
 * (assertSequencePackageable), reproduced here over PGlite with the REAL
 * freezeSequence / dispatchSequence / upsertLeaf / removeLeaf, the REAL
 * assembleSequence and the REAL leaf-manifest digest (deriveGovernedTargetBinding).
 * Only the readiness assessor and the audit writer are stubbed.
 *
 *  1. TOCTOU. The gate assembles (seconds of PDF rendering) while the sequence
 *     is still 'validated', so upsertLeaf / removeLeaf are allowed; the state
 *     change that followed was a compare-and-set on status only. A leaf placed
 *     or removed in that window was frozen without having been judged. Equally,
 *     upsertLeaf / removeLeaf read the status and wrote later, so a freeze that
 *     committed in between left a leaf written into a frozen sequence.
 *  2. The filed inventory moved after the lock. The gate judges lifecycle
 *     binding against the sequences the agency holds (dispatch_status sent /
 *     acknowledged). A LOWER sequence of the same submission that is frozen or
 *     dispatched but not yet sent changes that inventory when it is sent, so a
 *     verdict taken now does not hold at transmit — and a dispatched sequence
 *     has no way back. It is refused as its own ordering refusal, naming the
 *     sequence, not as a package defect in the author's leaves.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic, second pass). The reverse direction: a
 * LOWER sequence can never be filed after a HIGHER one it shares a section with
 * is locked — not while that one is unsent, and not after it is sent (the
 * prior-state loader never reads a higher number, so it would transmit a
 * lifecycle bound to what the higher one already replaced). The remedy the
 * refusal names — a new sequence numbered after it — is exercised and binds to
 * the right leaf. A pair locked before this rule existed (both frozen, unsent)
 * is not deadlocked: the lower one dispatches. The rule spans regions, as the
 * loader does, and says which region it waits on. The row-lock interleaving
 * itself is proven on two real Postgres connections in
 * freeze-gate-row-lock.pg.test.ts.
 *
 * 2026-09-23 (W5/D7, residual repair). "Shares a section" above now reads
 * "shares a lifecycle key": the same document in the same section, or a
 * withdrawal naming no document (which binds by section). Sharing a section was
 * too wide — every IND sequence files its own 1571 (m1.1) and cover letter
 * (m1.2), so IND filing became strictly serial and a lower number filed after a
 * higher one was stranded. The last describe blocks pin both the independence
 * and the cases that must keep refusing; one earlier case that pinned the
 * over-refusal is amended in place and says so.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const holder = vi.hoisted(() => ({
  db: null as any,
  pglite: null as any,
  duringAssembly: null as null | (() => Promise<void>),
  /** Fires once, before the Nth `select` on the db handle after it is armed. */
  onSelect: null as null | { remaining: number; hook: () => Promise<void> },
}));

vi.mock('../../../db', () => {
  const run = async (sql: string, params?: unknown[]) => {
    const r = await holder.pglite.query(sql, params);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  };
  return {
    get db() {
      if (!holder.onSelect) return holder.db;
      return new Proxy(holder.db, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (prop !== 'select' || !holder.onSelect) return value;
          return (...args: unknown[]) => {
            const armed = holder.onSelect;
            if (armed && --armed.remaining === 0) {
              holder.onSelect = null;
              // The drizzle builder is thenable; run the hook before the read.
              const builder = value.apply(target, args);
              return wrapThen(builder, armed.hook);
            }
            return value.apply(target, args);
          };
        },
      });
    },
    pool: { query: run, connect: async () => ({ query: run, release: () => {} }) },
  };

  function wrapThen(builder: any, hook: () => Promise<void>): any {
    return new Proxy(builder, {
      get(t, p, r) {
        const v = Reflect.get(t, p, r);
        if (typeof v !== 'function') return v;
        if (p === 'then') {
          return (res: any, rej: any) => hook().then(() => v.call(t, res, rej), rej);
        }
        return (...a: unknown[]) => {
          const out = v.apply(t, a);
          return out && typeof out === 'object' && 'then' in out ? wrapThen(out, hook) : out;
        };
      },
    });
  }
});
vi.mock('../../auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) },
  writeChainedAuditRow: vi.fn(async (client: any, row: any) => {
    await client.query(
      `INSERT INTO audit_logs (tenant_id, table_name, record_id, action, new_values) VALUES ($1,$2,$3,$4,$5)`,
      [row.organizationId, row.resourceType, String(row.resourceId), row.action, JSON.stringify(row.details)],
    );
  }),
}));
vi.mock('../../ectd/assess-dispatch-readiness', () => ({
  assessSequenceDispatchReadiness: async () => ({
    gate: { cleared: true, blockers: [] }, freezeGate: { cleared: true, blockers: [] },
    validationErrors: 0, unacknowledgedShadowCriticals: 0,
  }),
}));
vi.mock('../../ectd/assemble-from-core', async (orig) => {
  const real = await orig<any>();
  return {
    ...real,
    assembleSequence: async (p: any) => {
      const r = await real.assembleSequence(p);
      const hook = holder.duringAssembly;
      holder.duringAssembly = null;
      if (hook) await hook();
      return r;
    },
  };
});

import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import { assembleSequence } from '../../ectd/assemble-from-core';
import { deriveGovernedTargetBinding } from '../../part11/signature-persistence';
import { freezeSequence, dispatchSequence, upsertLeaf, removeLeaf } from '../submission-service';

let h: IndPgliteDb;
const ORG = 7, USER = 3;
const ctx = { organizationId: ORG, userId: USER };
let sigN = 0;

/** A governed `sign` action bound to the sequence's CURRENT leaf-manifest digest. */
async function sign(seqId: number, intent: string): Promise<string> {
  const id = `sig-${++sigN}`;
  const binding = await deriveGovernedTargetBinding(
    { query: (t: string, p?: unknown[]) => h.pglite.query(t, p) as any },
    `ectd-sequence:${seqId}`,
    ORG,
  );
  await h.pglite.query(
    `INSERT INTO c2c_ana_actions (id, org_id, command, target, state, proposed_by, payload) VALUES ($1,$2,'sign',$3,'executed',$4,$5)`,
    [id, ORG, `ectd-sequence:${seqId}`, USER, JSON.stringify({ intent })],
  );
  await h.pglite.query(
    `INSERT INTO electronic_signatures (organization_id, signed_target, signature_manifest, bound_payload_digest, binding_basis, is_valid, verification_status)
     VALUES ($1,$2,$3,$4,$5,true,'valid')`,
    [ORG, `ectd-sequence:${seqId}`, JSON.stringify({ actionId: id }), binding.digest, binding.basis],
  );
  return id;
}

/** What the compile route records for a sequence, then mark the agency as holding it. */
async function file(seqId: number, submissionId: number, seqNo: string) {
  const a = await assembleSequence({ sequenceId: seqId, organizationId: ORG, userId: USER, applicationId: 'IND-123456', sponsorId: 'S', sponsorName: 'S' });
  const manifest = a.bundle.leafManifest;
  await a.cleanup();
  await h.pglite.query(
    `INSERT INTO ectd_compilations (organization_id, submission_id, sequence_number, leaf_manifest) VALUES ($1,$2,$3,$4)`,
    [ORG, submissionId, seqNo, JSON.stringify(manifest)],
  );
  await h.pglite.query(`UPDATE ectd_sequences SET status='dispatched', dispatch_status='sent' WHERE id=$1`, [seqId]);
}

const statusOf = async (id: number) =>
  (await h.pglite.query(`SELECT status, dispatch_status FROM ectd_sequences WHERE id=$1`, [id])).rows[0] as { status: string; dispatch_status: string | null };
const liveLeaves = async (seqId: number) =>
  Number(((await h.pglite.query(`SELECT count(*)::int AS n FROM submission_leaves WHERE sequence_id=$1 AND deleted_at IS NULL`, [seqId])).rows[0] as { n: number }).n);
const outcome = (p: Promise<unknown>) => p.then(() => null, (e: any) => e);

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = h.db;
  holder.pglite = h.pglite;
  await h.pglite.exec(`
    CREATE TABLE c2c_ana_actions (id TEXT PRIMARY KEY, org_id INTEGER, command TEXT, target TEXT, state TEXT, proposed_by INTEGER, payload JSONB);
    CREATE TABLE electronic_signatures (id SERIAL PRIMARY KEY, organization_id INTEGER, signed_target TEXT, signature_manifest TEXT, bound_payload_digest TEXT, binding_basis TEXT, superseded_by INTEGER, is_valid BOOLEAN, verification_status TEXT);
    CREATE TABLE IF NOT EXISTS audit_logs (id SERIAL PRIMARY KEY, tenant_id INTEGER, table_name TEXT, record_id TEXT, action TEXT, new_values TEXT);
    CREATE TABLE IF NOT EXISTS ectd_compilations (id SERIAL PRIMARY KEY, organization_id INTEGER, submission_id INTEGER, sequence_number TEXT, leaf_manifest JSONB, compiled_at TIMESTAMP DEFAULT NOW());
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by) VALUES
      (1, 'race', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (2, 'order A', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (3, 'order B', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (4, 'order C', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (5, 'race B', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (6, 'legacy frozen pair', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (7, 'legacy frozen under dispatched', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (8, 'two regions', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (9, 'higher dispatched first', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (10, 'IND transmittal pairs', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (11, 'IND transmittal pairs, higher first', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (12, 'withdrawal naming no document, lower', 'ind', 'biotech', 'fda', ${ORG}, ${USER}),
      (13, 'withdrawal naming no document, higher', 'ind', 'biotech', 'fda', ${ORG}, ${USER});
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status) VALUES
      (200, ${ORG}, 'Clinical Overview', '<p>approved</p>', 'm2.5', 'approved'),
      (201, ${ORG}, 'Nonclinical Overview', '<p>still a draft</p>', 'm2.4', 'draft'),
      (202, ${ORG}, 'Quality Overall Summary', '<p>approved QOS</p>', 'm2.3', 'approved'),
      (300, ${ORG}, 'General Information', '<p>v1 of the section</p>', 'm3.2.s.1', 'approved'),
      (310, ${ORG}, 'Cover letter', '<p>withdrawal</p>', 'm1.2', 'approved'),
      (400, ${ORG}, 'General Information', '<p>B v1</p>', 'm3.2.s.1', 'approved'),
      (410, ${ORG}, 'Clinical Overview', '<p>B overview</p>', 'm2.5', 'approved'),
      (500, ${ORG}, 'General Information', '<p>C v1</p>', 'm3.2.s.1', 'approved'),
      (600, ${ORG}, 'General Information', '<p>legacy v1</p>', 'm3.2.s.1', 'approved'),
      (601, ${ORG}, 'General Information', '<p>legacy v2</p>', 'm3.2.s.1', 'approved'),
      (700, ${ORG}, 'General Information', '<p>D v1</p>', 'm3.2.s.1', 'approved'),
      (701, ${ORG}, 'General Information', '<p>D v2</p>', 'm3.2.s.1', 'approved'),
      (800, ${ORG}, 'General Information', '<p>E v1</p>', 'm3.2.s.1', 'approved'),
      (900, ${ORG}, 'General Information', '<p>F v1</p>', 'm3.2.s.1', 'approved'),
      (1000, ${ORG}, 'Form FDA 1571 (0000)', '<p>1571 initial</p>', 'm1.1', 'approved'),
      (1001, ${ORG}, 'Cover letter (0000)', '<p>cover letter initial</p>', 'm1.2', 'approved'),
      (1010, ${ORG}, 'Form FDA 1571 (0001)', '<p>1571 protocol amendment</p>', 'm1.1', 'approved'),
      (1011, ${ORG}, 'Cover letter (0001)', '<p>cover letter protocol amendment</p>', 'm1.2', 'approved'),
      (1012, ${ORG}, 'Nonclinical Overview', '<p>amendment overview</p>', 'm2.4', 'approved'),
      (1020, ${ORG}, 'Form FDA 1571 (0002)', '<p>1571 safety report</p>', 'm1.1', 'approved'),
      (1021, ${ORG}, 'Cover letter (0002)', '<p>cover letter safety report</p>', 'm1.2', 'approved'),
      (1030, ${ORG}, 'Form FDA 1571 (0003)', '<p>1571 correction</p>', 'm1.1', 'approved'),
      (1100, ${ORG}, 'Clinical Overview', '<p>G v1</p>', 'm2.5', 'approved'),
      (1101, ${ORG}, 'Clinical Overview addendum', '<p>G addendum</p>', 'm2.5', 'approved');
  `);
}, 120_000);
afterAll(async () => { await h.close(); });

describe('TOCTOU: the gate is bound to the leaf manifest it assembled', () => {
  it('refuses the freeze when a leaf is placed while the gate is assembling', async () => {
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES (1, 1, 'fda', '0000', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (1, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 200, ${ORG}, ${USER});
    `);
    const sig = await sign(1, 'freeze');
    holder.duringAssembly = async () => {
      // A draft document: had the gate assembled it, it would have refused.
      await upsertLeaf({ sequenceId: 1, sectionCode: 'm2.4', title: 'Nonclinical Overview', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 201 }, ctx);
    };
    const err = await outcome(freezeSequence(1, ctx, sig));
    expect(err, 'a leaf the gate never judged was frozen').toMatchObject({
      code: 'INVALID_STATE',
      message: expect.stringMatching(/leaves changed while this freeze was being checked/),
    });
    expect((await statusOf(1)).status).toBe('validated');
  }, 120_000);

  it('refuses the freeze when a leaf is removed while the gate is assembling', async () => {
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES (2, 5, 'fda', '0000', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (id, sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (2001, 2, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 200, ${ORG}, ${USER}),
        (2002, 2, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${ORG}, ${USER});
    `);
    const sig = await sign(2, 'freeze');
    holder.duringAssembly = async () => { await removeLeaf(2002, 2, ctx); };
    const err = await outcome(freezeSequence(2, ctx, sig));
    expect(err, 'a sequence was frozen without a leaf the gate judged').toMatchObject({
      code: 'INVALID_STATE',
      message: expect.stringMatching(/leaves changed while this freeze was being checked/),
    });
    expect((await statusOf(2)).status).toBe('validated');
    // With nothing moving, the same sequence freezes under a fresh signature.
    await freezeSequence(2, ctx, await sign(2, 'freeze'));
    expect((await statusOf(2)).status).toBe('frozen');
  }, 120_000);

  it('upsertLeaf re-checks the status under the sequence row lock, not only before it', async () => {
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES (5, 1, 'fda', '0001', ${ORG}, ${USER}, 'validated');
    `);
    // The freeze commits after upsertLeaf read 'validated' and before it wrote.
    holder.onSelect = { remaining: 2, hook: async () => { await h.pglite.query(`UPDATE ectd_sequences SET status='frozen', frozen_at=NOW() WHERE id=5`); } };
    const err = await outcome(upsertLeaf({ sequenceId: 5, sectionCode: 'm2.5', title: 'Clinical Overview', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 200 }, ctx));
    holder.onSelect = null;
    expect(err, 'a leaf was written into a frozen sequence').toMatchObject({ code: 'INVALID_STATE', message: expect.stringMatching(/frozen; its leaves are immutable/) });
    expect(await liveLeaves(5)).toBe(0);
  }, 60_000);

  it('removeLeaf re-checks the status under the sequence row lock, not only before it', async () => {
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES (6, 1, 'fda', '0002', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (id, sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (6001, 6, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 200, ${ORG}, ${USER});
    `);
    holder.onSelect = { remaining: 2, hook: async () => { await h.pglite.query(`UPDATE ectd_sequences SET status='frozen', frozen_at=NOW() WHERE id=6`); } };
    const err = await outcome(removeLeaf(6001, 6, ctx));
    holder.onSelect = null;
    expect(err, 'a leaf was removed from a frozen sequence').toMatchObject({ code: 'INVALID_STATE', message: expect.stringMatching(/frozen; its leaves are immutable/) });
    expect(await liveLeaves(6)).toBe(1);
  }, 60_000);
});

describe('the filed inventory the gate judges against cannot move after the lock', () => {
  it('refuses a dependent freeze while a lower sequence is dispatched but not sent — as an ordering refusal, not a package defect', async () => {
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES
        (11, 3, 'fda', '0000', ${ORG}, ${USER}, 'validated'), (12, 3, 'fda', '0001', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (11, 'm3.2.s.1', 'General Information', 'new', 'coauthor_documents', 400, ${ORG}, ${USER});
    `);
    // 0000 compiled and dispatched, queued for transmit.
    const a = await assembleSequence({ sequenceId: 11, organizationId: ORG, userId: USER, applicationId: 'IND-654321', sponsorId: 'S', sponsorName: 'S' });
    const manifest = a.bundle.leafManifest;
    await a.cleanup();
    await h.pglite.query(`INSERT INTO ectd_compilations (organization_id, submission_id, sequence_number, leaf_manifest) VALUES ($1,3,'0000',$2)`, [ORG, JSON.stringify(manifest)]);
    await h.pglite.query(`UPDATE ectd_sequences SET status='dispatched', dispatch_status='pending' WHERE id=11`);
    await h.pglite.exec(`
      UPDATE coauthor_documents SET content = '<p>B v2 revised</p>' WHERE id = 400;
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (12, 'm3.2.s.1', 'General Information', 'replace', 'coauthor_documents', 400, ${ORG}, ${USER});
    `);
    const err = await outcome(freezeSequence(12, ctx, await sign(12, 'freeze')));
    expect(err).toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringMatching(/sequence 0000 is not yet filed; freeze this one after it is sent/) });
    expect(err.message).not.toMatch(/could not be packaged|Transmit would refuse this package/);
    expect((await statusOf(12)).status).toBe('validated');
    // Once 0000 is sent, the same unchanged leaves freeze.
    await h.pglite.query(`UPDATE ectd_sequences SET dispatch_status='sent' WHERE id=11`);
    await freezeSequence(12, ctx, await sign(12, 'freeze'));
    expect((await statusOf(12)).status).toBe('frozen');
  }, 120_000);

  it('does not refuse a sequence of only new leaves that shares no section with the unsent lower one', async () => {
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES
        (13, 3, 'fda', '0002', ${ORG}, ${USER}, 'validated');
      UPDATE ectd_sequences SET status='frozen', dispatch_status=NULL WHERE id=12;
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (13, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 410, ${ORG}, ${USER});
    `);
    // 0001 is frozen and unsent, but 0002 files a new leaf in a section 0001 does not touch.
    await freezeSequence(13, ctx, await sign(13, 'freeze'));
    expect((await statusOf(13)).status).toBe('frozen');
  }, 120_000);

  it('refuses a new leaf in a section the unsent lower sequence files (its operation derives from that filing)', async () => {
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES
        (14, 3, 'fda', '0003', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (14, 'm3.2.s.1', 'General Information', 'new', 'coauthor_documents', 400, ${ORG}, ${USER});
    `);
    const err = await outcome(freezeSequence(14, ctx, await sign(14, 'freeze')));
    expect(err).toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringMatching(/sequence 0001 is not yet filed; freeze this one after it is sent/) });
  }, 120_000);

  it('refuses dispatch on the same rule', async () => {
    // A pre-existing pair: both frozen, the lower one unsent.
    await h.pglite.exec(`UPDATE ectd_sequences SET status='frozen' WHERE id=14`);
    const err = await outcome(dispatchSequence(14, ctx, await sign(14, 'dispatch')));
    expect(err).toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringMatching(/sequence 0001 is not yet filed; dispatch this one after it is sent/) });
    expect((await statusOf(14)).status).toBe('frozen');
  }, 120_000);

});

// 2026-09-23 (W5/D7, residual repair): split out of the describe above (one
// block of 146 lines); the cases and their order are unchanged.
describe('the higher direction: a lower sequence is not filed behind a locked higher one it depends on', () => {
  it('refuses to freeze a lower sequence whose filing would move the inventory a frozen higher sequence was judged against', async () => {
    // The skeptic's case A, through the governed path: 0000 filed with X; 0001
    // withdraws X; 0002 declares replace of X and is frozen+dispatched while
    // 0001 is still being prepared.
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES
        (21, 2, 'fda', '0000', ${ORG}, ${USER}, 'validated'), (22, 2, 'fda', '0001', ${ORG}, ${USER}, 'validated'), (23, 2, 'fda', '0002', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (21, 'm3.2.s.1', 'General Information', 'new', 'coauthor_documents', 300, ${ORG}, ${USER});
    `);
    await file(21, 2, '0000');
    await h.pglite.exec(`
      UPDATE coauthor_documents SET content = '<p>v2 of the section, revised</p>' WHERE id = 300;
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (22, 'm1.2', 'Cover letter', 'new', 'coauthor_documents', 310, ${ORG}, ${USER}),
        (22, 'm3.2.s.1', 'General Information', 'delete', 'coauthor_documents', 300, ${ORG}, ${USER}),
        (23, 'm3.2.s.1', 'General Information', 'replace', 'coauthor_documents', 300, ${ORG}, ${USER});
    `);
    await freezeSequence(23, ctx, await sign(23, 'freeze'));
    await dispatchSequence(23, ctx, await sign(23, 'dispatch'));
    // Before: 0001 froze here, was sent, and 0002 was left dispatched and unsendable.
    const err = await outcome(freezeSequence(22, ctx, await sign(22, 'freeze')));
    expect(err, '0001 froze under a dispatched 0002 whose lifecycle acts its filing would invalidate').toMatchObject({
      code: 'DISPATCH_BLOCKED',
      message: expect.stringMatching(/sequence 0002 is dispatched and not yet filed/),
    });
    expect((await statusOf(22)).status).toBe('validated');
    // 2026-09-23 (W5/D7, round-2 skeptic, second pass): this case used to end
    // by marking 0002 sent and asserting only that 0001's freeze was no longer
    // an ordering refusal, under the comment "once 0002 is at the agency, 0001
    // is judged against an inventory that includes it". That was false and the
    // assertion pinned the defect: the prior-state loader reads only sequences
    // numbered BELOW the current one, so 0001 froze, dispatched and transmitted
    // judged against {0000}, its delete bound to the 0000 leaf that 0002 had
    // already replaced. A lower sequence can never be filed after a higher one
    // in a shared section; the refusal must hold once 0002 is sent, and its
    // remedy is a new sequence numbered after 0002 — which IS judged against it.
    await file(23, 2, '0002');
    const afterSent = await outcome(freezeSequence(22, ctx, await sign(22, 'freeze')));
    expect(afterSent, '0001 froze after 0002 was filed, judged against an inventory without 0002').toMatchObject({
      code: 'DISPATCH_BLOCKED',
      message: expect.stringMatching(/sequence 0002 is already filed/),
    });
    expect(afterSent.message).toMatch(/new sequence numbered after 0002/);
    expect((await statusOf(22)).status).toBe('validated');

    // The remedy the refusal names: the same leaves in 0003. Its withdrawal binds
    // to the leaf 0002 filed, not to the one 0002 replaced.
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES
        (24, 2, 'fda', '0003', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (24, 'm1.2', 'Cover letter', 'new', 'coauthor_documents', 310, ${ORG}, ${USER}),
        (24, 'm3.2.s.1', 'General Information', 'delete', 'coauthor_documents', 300, ${ORG}, ${USER});
    `);
    await freezeSequence(24, ctx, await sign(24, 'freeze'));
    await dispatchSequence(24, ctx, await sign(24, 'dispatch'));
    expect((await statusOf(24)).status).toBe('dispatched');
    const a = await assembleSequence({ sequenceId: 24, organizationId: ORG, userId: USER, applicationId: 'IND-123456', sponsorId: 'S', sponsorName: 'S' });
    const withdrawal = (a.bundle.leafManifest as Array<{ ctdSection: string; operation: string; modifiedFile?: string }>)
      .find((l) => l.ctdSection === 'm3.2.s.1');
    await a.cleanup();
    expect(withdrawal).toMatchObject({ operation: 'delete', modifiedFile: expect.stringMatching(/^\.\.\/0002\//) });
  }, 180_000);

  it('refuses dispatch of a frozen lower sequence once a higher one acting on the same document is already filed', async () => {
    // A pre-existing state the governed path can no longer produce: 0001 frozen,
    // 0002 frozen after it, then 0002 dispatched and sent.
    //
    // 2026-09-23 (W5/D7, residual repair): 0002 used to file a DIFFERENT
    // document (701) as new in the section 0001 withdraws 700 from, and this
    // case pinned the refusal of that pair — the shared-section over-refusal.
    // The two leaves have no lifecycle key in common (the operator keys a leaf
    // by section + a file name derived from its document), so 0001's
    // withdrawal binds to 0000's leaf whatever 0002 filed. The dependent case
    // is 0002 superseding the very leaf 0001 withdraws, which is what it does now.
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES
        (71, 7, 'fda', '0000', ${ORG}, ${USER}, 'validated'), (72, 7, 'fda', '0001', ${ORG}, ${USER}, 'validated'), (73, 7, 'fda', '0002', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (71, 'm3.2.s.1', 'General Information', 'new', 'coauthor_documents', 700, ${ORG}, ${USER});
    `);
    await file(71, 7, '0000');
    await h.pglite.exec(`
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (72, 'm3.2.s.1', 'General Information', 'delete', 'coauthor_documents', 700, ${ORG}, ${USER}),
        (73, 'm3.2.s.1', 'General Information', 'replace', 'coauthor_documents', 700, ${ORG}, ${USER});
      UPDATE coauthor_documents SET content = '<p>D v1, revised</p>' WHERE id = 700;
      UPDATE ectd_sequences SET status='frozen' WHERE id=72;
    `);
    await file(73, 7, '0002');
    const err = await outcome(dispatchSequence(72, ctx, await sign(72, 'dispatch')));
    expect(err, 'a lower sequence was dispatched after a higher one in its section was filed').toMatchObject({
      code: 'DISPATCH_BLOCKED',
      message: expect.stringMatching(/sequence 0002 is already filed/),
    });
    expect((await statusOf(72)).status).toBe('frozen');
  }, 180_000);

  it('a dispatched, unsent higher sequence refuses the lower one with the remedy that works, not "send it first"', async () => {
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES
        (91, 9, 'fda', '0000', ${ORG}, ${USER}, 'validated'), (92, 9, 'fda', '0001', ${ORG}, ${USER}, 'validated'), (93, 9, 'fda', '0002', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (91, 'm3.2.s.1', 'General Information', 'new', 'coauthor_documents', 900, ${ORG}, ${USER});
    `);
    await file(91, 9, '0000');
    await h.pglite.exec(`
      UPDATE coauthor_documents SET content = '<p>F v2</p>' WHERE id = 900;
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (92, 'm3.2.s.1', 'General Information', 'replace', 'coauthor_documents', 900, ${ORG}, ${USER}),
        (93, 'm3.2.s.1', 'General Information', 'replace', 'coauthor_documents', 900, ${ORG}, ${USER});
    `);
    await freezeSequence(93, ctx, await sign(93, 'freeze'));
    await dispatchSequence(93, ctx, await sign(93, 'dispatch'));
    const err = await outcome(freezeSequence(92, ctx, await sign(92, 'freeze')));
    expect(err).toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringMatching(/sequence 0002 is dispatched and not yet filed/) });
    expect(err.message, 'the remedy offered was one the gate then lets through wrongly').not.toMatch(/Send 0002 first/);
    expect(err.message).toMatch(/new sequence numbered after 0002/);
    expect((await statusOf(92)).status).toBe('validated');
  }, 180_000);
});

describe('a pre-existing pair of locked, unsent sequences in a shared section is not deadlocked', () => {
  it('lets the lower one dispatch, and holds the higher one until it is sent', async () => {
    // Both frozen before the filing-order rule existed.
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES
        (61, 6, 'fda', '0000', ${ORG}, ${USER}, 'validated'), (62, 6, 'fda', '0001', ${ORG}, ${USER}, 'validated'), (63, 6, 'fda', '0002', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (61, 'm3.2.s.1', 'General Information', 'new', 'coauthor_documents', 600, ${ORG}, ${USER});
    `);
    await file(61, 6, '0000');
    await h.pglite.exec(`
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (62, 'm3.2.s.1', 'General Information', 'new', 'coauthor_documents', 601, ${ORG}, ${USER}),
        (63, 'm3.2.s.1', 'General Information', 'new', 'coauthor_documents', 601, ${ORG}, ${USER});
      UPDATE ectd_sequences SET status='frozen' WHERE id IN (62, 63);
    `);
    const higher = await outcome(dispatchSequence(63, ctx, await sign(63, 'dispatch')));
    expect(higher).toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringMatching(/sequence 0001 is not yet filed; dispatch this one after it is sent/) });
    const lower = await outcome(dispatchSequence(62, ctx, await sign(62, 'dispatch')));
    expect(lower, 'neither sequence of the pair could ever move').toBeNull();
    expect((await statusOf(62)).status).toBe('dispatched');
    // The higher one still waits for the lower one to reach the agency.
    const stillHeld = await outcome(dispatchSequence(63, ctx, await sign(63, 'dispatch')));
    expect(stillHeld).toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringMatching(/sequence 0001 is not yet filed/) });
    expect((await statusOf(63)).status).toBe('frozen');
  }, 180_000);
});

describe('the ordering rule spans the regions of a submission, as the prior-state loader does', () => {
  it('names the region of the sequence it waits on', async () => {
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status, dispatch_status) VALUES
        (81, 8, 'ema', '0000', ${ORG}, ${USER}, 'dispatched', 'pending'), (82, 8, 'fda', '0001', ${ORG}, ${USER}, 'validated', NULL);
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (81, 'm3.2.s.1', 'General Information', 'new', 'coauthor_documents', 800, ${ORG}, ${USER}),
        (82, 'm3.2.s.1', 'General Information', 'new', 'coauthor_documents', 800, ${ORG}, ${USER});
    `);
    const err = await outcome(freezeSequence(82, ctx, await sign(82, 'freeze')));
    expect(err).toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringMatching(/sequence 0000 is not yet filed/) });
    expect(err.message, 'a refusal on another region\'s sequence did not say which region').toMatch(/region 'ema'/);
  }, 120_000);
});

/*
 * 2026-09-23 (W5/D7, residual repair). The ordering rule's DEPENDENCY is a
 * shared lifecycle key, not a shared section. The lifecycle operator keys a
 * leaf by section + a file name derived from its document reference
 * (leafFileName over leafSourceKey), so two sequences that each file their own
 * document in one section never act on each other's leaves. Every IND sequence
 * carries its own Form FDA 1571 (m1.1) and cover letter (m1.2)
 * (ind-lifecycle-persistence withTransmittalPair), so the shared-section rule
 * made IND filing strictly serial — and, in the higher direction, stranded the
 * lower number for good. Two cases keep refusing: the SAME document in both,
 * and a withdrawal that names no document, which binds by section.
 */
describe('the ordering rule binds on a shared lifecycle key, not a shared section', () => {
  const leafOps = async (seqId: number) => {
    const a = await assembleSequence({ sequenceId: seqId, organizationId: ORG, userId: USER, applicationId: 'IND-123456', sponsorId: 'S', sponsorName: 'S' });
    const ops = (a.bundle.leafManifest as Array<{ ctdSection: string; operation: string; modifiedFile?: string }>)
      .map((l) => ({ section: l.ctdSection, operation: l.operation, modifiedFile: l.modifiedFile ?? null }));
    await a.cleanup();
    return ops;
  };

  it('IND sequences with their own 1571 and cover letter freeze and dispatch while the lower one is dispatched, not sent', async () => {
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES
        (101, 10, 'fda', '0000', ${ORG}, ${USER}, 'validated'), (102, 10, 'fda', '0001', ${ORG}, ${USER}, 'validated'),
        (103, 10, 'fda', '0002', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (101, 'm1.1', 'Form FDA 1571', 'new', 'coauthor_documents', 1000, ${ORG}, ${USER}),
        (101, 'm1.2', 'Cover letter', 'new', 'coauthor_documents', 1001, ${ORG}, ${USER});
    `);
    await file(101, 10, '0000');
    await h.pglite.exec(`
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (102, 'm1.1', 'Form FDA 1571', 'new', 'coauthor_documents', 1010, ${ORG}, ${USER}),
        (102, 'm1.2', 'Cover letter', 'new', 'coauthor_documents', 1011, ${ORG}, ${USER}),
        (102, 'm2.4', 'Nonclinical Overview', 'new', 'coauthor_documents', 1012, ${ORG}, ${USER}),
        (103, 'm1.1', 'Form FDA 1571', 'new', 'coauthor_documents', 1020, ${ORG}, ${USER}),
        (103, 'm1.2', 'Cover letter', 'new', 'coauthor_documents', 1021, ${ORG}, ${USER});
    `);
    await freezeSequence(102, ctx, await sign(102, 'freeze'));
    await dispatchSequence(102, ctx, await sign(102, 'dispatch'));
    expect(await statusOf(102)).toEqual({ status: 'dispatched', dispatch_status: 'pending' });

    // 0002 shares m1.1 and m1.2 with the unsent 0001, but no document.
    const frozen = await outcome(freezeSequence(103, ctx, await sign(103, 'freeze')));
    expect(frozen, 'an IND sequence was held behind another one that files different documents in m1.1/m1.2').toBeNull();
    const dispatched = await outcome(dispatchSequence(103, ctx, await sign(103, 'dispatch')));
    expect(dispatched).toBeNull();
    expect(await statusOf(103)).toEqual({ status: 'dispatched', dispatch_status: 'pending' });
    expect(await leafOps(103)).toEqual([
      { section: 'm1.1', operation: 'new', modifiedFile: null },
      { section: 'm1.2', operation: 'new', modifiedFile: null },
    ]);
  }, 180_000);

  it('a replace of the SAME document the unsent lower sequence files is still refused, with the filing-order message', async () => {
    // Continues submission 10: 0001 dispatched, not sent, files cover letter 1011.
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES
        (104, 10, 'fda', '0003', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (104, 'm1.1', 'Form FDA 1571', 'new', 'coauthor_documents', 1030, ${ORG}, ${USER}),
        (104, 'm1.2', 'Cover letter', 'replace', 'coauthor_documents', 1011, ${ORG}, ${USER});
    `);
    const err = await outcome(freezeSequence(104, ctx, await sign(104, 'freeze')));
    expect(err, 'a replace of a leaf the unsent 0001 files was frozen before 0001 reached the agency').toMatchObject({
      code: 'DISPATCH_BLOCKED',
      message: expect.stringMatching(/sequence 0001 is not yet filed; freeze this one after it is sent/),
    });
    expect(err.message).toMatch(/filing-order constraint/);
    expect(err.message, 'the refusal named a section where nothing binds').not.toMatch(/m1\.1/);
    expect(err.message, 'the refusal waited on 0002, which shares no document with this one').not.toMatch(/0002/);
    expect((await statusOf(104)).status).toBe('validated');

    // Once 0001 is at the agency the same leaves freeze, and the replace binds to 0001's leaf.
    await file(102, 10, '0001');
    await h.pglite.query(`UPDATE coauthor_documents SET content = '<p>cover letter protocol amendment, corrected</p>' WHERE id = 1011`);
    await freezeSequence(104, ctx, await sign(104, 'freeze'));
    expect((await statusOf(104)).status).toBe('frozen');
    expect(await leafOps(104)).toEqual([
      { section: 'm1.1', operation: 'new', modifiedFile: null },
      { section: 'm1.2', operation: 'replace', modifiedFile: expect.stringMatching(/^\.\.\/0001\/.*coauthor-documents-1011\.pdf$/) },
    ]);
  }, 180_000);

  it('a lower IND sequence still freezes and dispatches after a higher one with its own transmittal pair is filed', async () => {
    // The verdict's P5: an urgent safety report 0002 frozen and sent while the
    // protocol amendment 0001 is still being prepared.
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES
        (111, 11, 'fda', '0000', ${ORG}, ${USER}, 'validated'), (112, 11, 'fda', '0001', ${ORG}, ${USER}, 'validated'),
        (113, 11, 'fda', '0002', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (111, 'm1.1', 'Form FDA 1571', 'new', 'coauthor_documents', 1000, ${ORG}, ${USER}),
        (111, 'm1.2', 'Cover letter', 'new', 'coauthor_documents', 1001, ${ORG}, ${USER});
    `);
    await file(111, 11, '0000');
    await h.pglite.exec(`
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (112, 'm1.1', 'Form FDA 1571', 'new', 'coauthor_documents', 1010, ${ORG}, ${USER}),
        (112, 'm1.2', 'Cover letter', 'new', 'coauthor_documents', 1011, ${ORG}, ${USER}),
        (112, 'm2.4', 'Nonclinical Overview', 'new', 'coauthor_documents', 1012, ${ORG}, ${USER}),
        (113, 'm1.1', 'Form FDA 1571', 'new', 'coauthor_documents', 1020, ${ORG}, ${USER}),
        (113, 'm1.2', 'Cover letter', 'new', 'coauthor_documents', 1021, ${ORG}, ${USER});
    `);
    await freezeSequence(113, ctx, await sign(113, 'freeze'));
    const whileFrozen = await outcome(freezeSequence(112, ctx, await sign(112, 'freeze')));
    expect(whileFrozen, 'the lower IND sequence was refused behind a frozen higher one it shares no document with').toBeNull();
    await dispatchSequence(113, ctx, await sign(113, 'dispatch'));
    await file(113, 11, '0002');
    const afterFiled = await outcome(dispatchSequence(112, ctx, await sign(112, 'dispatch')));
    expect(afterFiled, 'the lower number was stranded once the higher one was filed').toBeNull();
    expect(await statusOf(112)).toEqual({ status: 'dispatched', dispatch_status: 'pending' });
    expect(await leafOps(112)).toEqual([
      { section: 'm1.1', operation: 'new', modifiedFile: null },
      { section: 'm1.2', operation: 'new', modifiedFile: null },
      { section: 'm2.4', operation: 'new', modifiedFile: null },
    ]);
  }, 180_000);

});

describe('a withdrawal that names no document still binds the ordering rule by section', () => {
  it('a withdrawal naming no document binds by section: a dispatched, unsent one holds a higher sequence filing in that section', async () => {
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES
        (121, 12, 'fda', '0000', ${ORG}, ${USER}, 'validated'), (122, 12, 'fda', '0001', ${ORG}, ${USER}, 'validated'),
        (123, 12, 'fda', '0002', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (121, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 1100, ${ORG}, ${USER});
    `);
    await file(121, 12, '0000');
    await h.pglite.exec(`
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (122, 'm2.5', 'Clinical Overview', 'delete', NULL, NULL, ${ORG}, ${USER}),
        (123, 'm2.5', 'Clinical Overview addendum', 'new', 'coauthor_documents', 1101, ${ORG}, ${USER});
    `);
    await freezeSequence(122, ctx, await sign(122, 'freeze'));
    await dispatchSequence(122, ctx, await sign(122, 'dispatch'));
    const err = await outcome(freezeSequence(123, ctx, await sign(123, 'freeze')));
    expect(err, 'a leaf in the section an unsent section-bound withdrawal acts on was frozen ahead of it').toMatchObject({
      code: 'DISPATCH_BLOCKED',
      message: expect.stringMatching(/sequence 0001 is not yet filed; freeze this one after it is sent/),
    });
    expect(err.message).toMatch(/m2\.5/);
    expect((await statusOf(123)).status).toBe('validated');
  }, 180_000);

  it('a withdrawal naming no document is refused behind a dispatched higher sequence that files in its section', async () => {
    await h.pglite.exec(`
      INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES
        (131, 13, 'fda', '0000', ${ORG}, ${USER}, 'validated'), (132, 13, 'fda', '0001', ${ORG}, ${USER}, 'validated'),
        (133, 13, 'fda', '0002', ${ORG}, ${USER}, 'validated');
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (131, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 1100, ${ORG}, ${USER});
    `);
    await file(131, 13, '0000');
    await h.pglite.exec(`
      INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
        (132, 'm2.5', 'Clinical Overview', 'delete', NULL, NULL, ${ORG}, ${USER}),
        (133, 'm2.5', 'Clinical Overview addendum', 'new', 'coauthor_documents', 1101, ${ORG}, ${USER});
    `);
    await freezeSequence(133, ctx, await sign(133, 'freeze'));
    await dispatchSequence(133, ctx, await sign(133, 'dispatch'));
    const err = await outcome(freezeSequence(132, ctx, await sign(132, 'freeze')));
    expect(err, 'a section-bound withdrawal froze ahead of a higher sequence filing in its section').toMatchObject({
      code: 'DISPATCH_BLOCKED',
      message: expect.stringMatching(/sequence 0002 is dispatched and not yet filed/),
    });
    expect(err.message).toMatch(/new sequence numbered after 0002/);
    expect((await statusOf(132)).status).toBe('validated');
  }, 180_000);
});
