/**
 * Seed and helpers for freeze-gate-binding.pglite.test.ts: the fixture tables
 * and rows its cases run the real freeze/dispatch gate over, and the governed
 * signature, filing and read-back helpers they drive it with. Moved here
 * unchanged from that file (2026-09-23, ESLint max-lines ratchet). Its module
 * mocks stay in the test file, because vitest hoists them per file; the
 * assembleSequence imported here is the one that file's mock wraps.
 *
 * Not a test file: nothing here runs on its own.
 */
import type { IndPgliteDb } from '../../../db/pglite-harness';
import { assembleSequence } from '../../ectd/assemble-from-core';
import { deriveGovernedTargetBinding } from '../../part11/signature-persistence';

export const ORG = 7, USER = 3;

/** The tables the harness does not create, and every submission and document the cases file. */
export const FREEZE_GATE_SEED_SQL = `
    CREATE TABLE c2c_ana_actions (id TEXT PRIMARY KEY, org_id INTEGER, command TEXT, target TEXT, state TEXT, proposed_by INTEGER, payload JSONB);
    CREATE TABLE electronic_signatures (id SERIAL PRIMARY KEY, organization_id INTEGER, signed_target TEXT, signature_manifest TEXT, bound_payload_digest TEXT, binding_basis TEXT, superseded_by INTEGER, is_valid BOOLEAN, verification_status TEXT);
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
  `;

/**
 * The helpers read the harness through `db` at call time, so the suite can
 * build them before its beforeAll creates it.
 */
export function freezeGateHelpers(db: () => IndPgliteDb) {
  let sigN = 0;

  /** A governed `sign` action bound to the sequence's CURRENT leaf-manifest digest. */
  async function sign(seqId: number, intent: string): Promise<string> {
    const h = db();
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
    const h = db();
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
    (await db().pglite.query(`SELECT status, dispatch_status FROM ectd_sequences WHERE id=$1`, [id])).rows[0] as { status: string; dispatch_status: string | null };
  const liveLeaves = async (seqId: number) =>
    Number(((await db().pglite.query(`SELECT count(*)::int AS n FROM submission_leaves WHERE sequence_id=$1 AND deleted_at IS NULL`, [seqId])).rows[0] as { n: number }).n);

  return { sign, file, statusOf, liveLeaves };
}
