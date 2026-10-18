/**
 * Who signed a protocol, when, and as what, read back from the signature record
 * (periodic review 2026-09-28, editor family, P11-C-2), against the REAL
 * protocol migrations in PGlite.
 *
 * The two signed acts — finalizing a protocol, and a reviewer's disposition —
 * each write an electronic_signatures row with the §11.50 printed name, time,
 * meaning and reason. Nothing read it back: the workspace read model, the
 * Reviews pane and the protocol export carried no signer, so the manifestation
 * was shown once in the signing modal and then nowhere, and a disposition
 * recorded on behalf of a reviewer with no account read like the reviewer's
 * own. §11.50(b) wants it on every human-readable form of the record.
 *
 * The rows here are written by the real ceremony (signProtocolAct → the real
 * persistGovernedSignSignature), so the join key the read uses is the one the
 * writer writes. Re-authentication and the ledger pair are the canonical
 * path's own and are stubbed, as in protocol-signature.pglite.integration.test.ts.
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
// The signer's role, as the ceremony reads it: the membership row (§11.10(g)),
// here from the PGlite organization_users table (the real lookup is drizzle's).
vi.mock('../../part11/resolve-signer-role', () => ({
  resolveSignerOrgRole: async (userId: number, orgId: number) =>
    (await holder.query('SELECT role FROM organization_users WHERE user_id = $1 AND organization_id = $2', [userId, orgId])).rows[0]?.role ?? null,
}));
const ledger = vi.hoisted(() => ({ seq: 0 }));
vi.mock('../../../routes/c2c/actions', () => ({
  verifyReauth: async () => ({ ok: true }),
  recordGovernedAction: async () => {
    ledger.seq += 1;
    return { actionId: `act-${ledger.seq}`, auditId: ledger.seq, sha256Chain: `chain-${ledger.seq}` };
  },
}));

import { assembleOrgPdevDocs } from '../pdev-view-assembler';
import { finalizeProtocolTx } from '../protocol-development-service';
import { signProtocolAct } from '../protocol-signature';
import { setDispositionTx } from '../../protocol-reviews/protocol-reviews-service';
import { BINDING_BASIS, manifestSignatureHash, persistGovernedSignatureRevocation } from '../../part11/signature-persistence';
import { getProtocolExport } from '../../protocol-export/protocol-export-service';
import { ELECTRONIC_SIGNATURES_READ_FIXTURE_DDL } from './_protocol-signature-schema-fixture';

const ORG = 42;
const OTHER_ORG = 99;
const CREATOR = 7;
const APPROVER = 8;
const REVIEWER = 9;
const STRANGER = 10;

let pglite: PGlite;
const q = async (sql: string, params?: unknown[]) => {
  const r = await pglite.query(sql, params as unknown[]);
  return { rows: r.rows as any[] };
};

function migration(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../../', rel), 'utf8');
}

/** A clinical protocol that passes the completeness gate, built by CREATOR. */
async function finalizable(title = 'A Phase 2 Study'): Promise<number> {
  const d = await q(
    `INSERT INTO protocol_documents (organization_id, protocol_kind, title, protocol_number, created_by)
     VALUES ($1,'clinical',$2,'C2C-101-201',$3) RETURNING id`,
    [ORG, title, CREATOR],
  );
  const docId = Number(d.rows[0].id);
  await q(
    `INSERT INTO protocol_sections (organization_id, protocol_document_id, section_key, title, content, status, order_index, created_by)
     VALUES ($1,$2,'background','Background','Original text.','complete',0,$3)`,
    [ORG, docId, CREATOR],
  );
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

const FINALIZE_REASON = 'Protocol complete; approved for IRB submission';

function finalize(docId: number, signer = APPROVER, meaning = 'approval') {
  return signProtocolAct({
    orgId: ORG, userId: signer, target: `protocol-document:${docId}`,
    reason: FINALIZE_REASON, meaning, allowedMeanings: ['authorship', 'approval', 'responsibility'],
    reauth: { password: 'pw' }, ipAddress: null, role: 'member',
    write: async (c) => {
      const r = await finalizeProtocolTx(c as never, ORG, signer, docId);
      return { act: { finalized: true, protocolVersion: r.version }, body: { documentId: docId, ...r } };
    },
  });
}

async function assignment(docId: number, reviewerName: string, reviewerUserId: number | null): Promise<number> {
  const a = await q(
    `INSERT INTO protocol_review_assignments (organization_id, protocol_document_id, reviewer_name, reviewer_user_id, role, created_by)
     VALUES ($1,$2,$3,$4,'scientific',$5) RETURNING id`,
    [ORG, docId, reviewerName, reviewerUserId, CREATOR],
  );
  return Number(a.rows[0].id);
}

/** The disposition route's own act (routes/protocol-reviews.ts). */
function signDisposition(assignmentId: number, signer: number, meaning: string, reason: string) {
  return signProtocolAct({
    orgId: ORG, userId: signer, target: `protocol-review-assignment:${assignmentId}`,
    reason, meaning, allowedMeanings: ['review', 'approval', 'responsibility'],
    reauth: { password: 'pw' }, ipAddress: null, role: 'member',
    write: async (c, m) => {
      const r = await setDispositionTx(c as never, ORG, assignmentId, { disposition: 'approve', signerId: signer, meaning: m });
      return {
        act: {
          disposition: r.disposition, protocolDocumentId: r.protocolDocumentId, protocolVersion: r.protocolVersion,
          ...(r.onBehalfOf ? { recordedOnBehalfOf: r.onBehalfOf } : {}),
        },
        body: { assignmentId, disposition: r.disposition },
      };
    },
  });
}

async function docById(docId: number): Promise<any> {
  const docs = await assembleOrgPdevDocs(ORG);
  const doc = docs.find((d) => d.id === String(docId));
  expect(doc, `protocol ${docId} was not in the read model`).toBeTruthy();
  return doc;
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
    CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT, name TEXT, title TEXT);
    CREATE TABLE research_personnel (id SERIAL PRIMARY KEY);
    CREATE TABLE organization_users (
      id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member', UNIQUE (user_id, organization_id));
    INSERT INTO organizations (id, name) VALUES (${ORG},'a'), (${OTHER_ORG},'b');
    INSERT INTO users (id, email, name) VALUES
      (${CREATOR},'c@e.test','Dr Carla Creator'), (${APPROVER},'d@e.test','Dana Approver'),
      (${REVIEWER},'r@e.test','Dr Rui Reviewer'), (${STRANGER},'s@e.test','Stranger');
    -- The signers hold the roles that may sign (P-18): the ceremony checks the
    -- membership row before the password (§11.10(g), QA 2026-10-08).
    INSERT INTO organization_users (organization_id, user_id, role) VALUES
      (${ORG},${CREATOR},'admin'), (${ORG},${APPROVER},'approver'), (${ORG},${REVIEWER},'reviewer'),
      (${OTHER_ORG},${STRANGER},'member');
  `);
  for (const m of [
    'migrations/20260527_mutation_primitives.sql',
    'db/migrations/20260730_c2c_ana_actions_command_vocab.sql',
    'migrations/20260621_protocol_development.sql',
    'migrations/20260622_protocol_risks.sql',
    'migrations/20260629_protocol_amendments.sql',
    'migrations/20260629_protocol_deviations.sql',
    'migrations/20260629_protocol_reviews.sql',
    'migrations/20260629_protocol_consent.sql',
    'migrations/20260630_protocol_milestones.sql',
    'migrations/20260701_protocol_soa.sql',
    'migrations/20260702_protocol_budget.sql',
    'migrations/20260921_protocol_documents_sponsor_pi.sql',
    'migrations/20260922_protocol_document_study_design.sql',
    'migrations/20260922e_amendment_declarations_nullable.sql',
    'migrations/20260922f_protocol_deviation_assessment.sql',
  ]) await pglite.exec(migration(m));
  await pglite.exec(ELECTRONIC_SIGNATURES_READ_FIXTURE_DDL);
  holder.query = q;
}, 120_000);

afterAll(async () => {
  await pglite?.close();
});

describe('the finalization signature, on the protocol read model', () => {
  it('carries the printed name recorded at signing, the time, the meaning and the reason', async () => {
    const docId = await finalizable();
    const signed = await finalize(docId);
    const doc = await docById(docId);
    expect(doc.status).toBe('finalized');
    expect(doc.finalization).toMatchObject({
      state: 'signed',
      signature: {
        signerName: 'Dana Approver',
        signedAt: signed.signedAt,
        meaning: 'approval',
        reason: FINALIZE_REASON,
        recordedOnBehalfOf: null,
      },
    });
  });

  it('is the name as recorded, not the account as it reads today', async () => {
    const docId = await finalizable();
    await finalize(docId);
    await q(`UPDATE users SET name = 'Dana Renamed' WHERE id = $1`, [APPROVER]);
    try {
      expect((await docById(docId)).finalization.signature.signerName).toBe('Dana Approver');
    } finally {
      await q(`UPDATE users SET name = 'Dana Approver' WHERE id = $1`, [APPROVER]);
    }
  });

  it('a revoked signature reads as revoked, still naming who signed; the revocation row is not the signature', async () => {
    const docId = await finalizable();
    await finalize(docId);
    await persistGovernedSignatureRevocation({ query: q }, {
      orgId: ORG, userId: CREATOR, target: `protocol-document:${docId}`,
      reason: 'Signed against the wrong version', payload: { meaning: 'responsibility' },
      actionId: 'act-revoke', auditId: '900', sha256Chain: 'chain-revoke',
      authenticationMethod: 'password', secondFactorVerified: false, ipAddress: null, occurredAt: new Date(),
    });
    const doc = await docById(docId);
    expect(doc.finalization.state).toBe('revoked');
    expect(doc.finalization.qualification).toMatchObject({
      contentBinding: 'unverified', historicalSigningPolicy: { state: 'unassessed' },
      currentContentQualification: { state: 'held', reason: 'signature-revoked' },
    });
    expect(doc.finalization.signature).toMatchObject({ signerName: 'Dana Approver', meaning: 'approval' });
  });

  it('a finalized protocol with no signature row says none, never a signer', async () => {
    // Protocols finalized before the ceremony existed (2026-09-23) have no row.
    const docId = await finalizable();
    await q(`UPDATE protocol_documents SET status = 'finalized' WHERE id = $1`, [docId]);
    expect((await docById(docId)).finalization).toEqual({ state: 'none' });
  });

  it('another organisation’s row on the same target string is not this protocol’s signature', async () => {
    const docId = await finalizable();
    await q(`UPDATE protocol_documents SET status = 'finalized' WHERE id = $1`, [docId]);
    await q(
      `INSERT INTO electronic_signatures (signed_target, signature_type, signature_purpose, signer_id, signer_name, signer_email,
         authentication_method, authentication_timestamp, signature_hash, signature_meaning, organization_id, bound_payload_digest)
       VALUES ($1,'governed-action','Foreign',$2,'Stranger','s@e.test','password',now(),'h','approval',$3,'d')`,
      [`protocol-document:${docId}`, STRANGER, OTHER_ORG],
    );
    expect((await docById(docId)).finalization).toEqual({ state: 'none' });
  });
});

describe('a disposition’s signature, on its review row', () => {
  it('names who signed and the meaning; a decision recorded for a reviewer with no account says so', async () => {
    const docId = await finalizable();
    const aid = await assignment(docId, 'Dr Iyer (external)', null);
    const signed = await signDisposition(aid, APPROVER, 'responsibility', 'Recording Dr Iyer’s emailed approval');
    const review = (await docById(docId)).reviews.find((r: any) => r.id === String(aid));
    expect(review.reviewer).toBe('Dr Iyer (external)');
    expect(review.signature).toMatchObject({
      state: 'signed',
      signature: {
        signerName: 'Dana Approver',
        signedAt: signed.signedAt,
        meaning: 'responsibility',
        reason: 'Recording Dr Iyer’s emailed approval',
        recordedOnBehalfOf: 'Dr Iyer (external)',
      },
    });
  });

  it('the assigned reviewer’s own signature, as review', async () => {
    const docId = await finalizable();
    const aid = await assignment(docId, 'Dr Rui Reviewer', REVIEWER);
    await signDisposition(aid, REVIEWER, 'review', 'Reviewed the statistical sections');
    const review = (await docById(docId)).reviews.find((r: any) => r.id === String(aid));
    expect(review.signature).toMatchObject({
      state: 'signed',
      signature: { signerName: 'Dr Rui Reviewer', meaning: 'review', recordedOnBehalfOf: null },
    });
  });

  it('an unsigned review has no signature', async () => {
    const docId = await finalizable();
    const aid = await assignment(docId, 'Dr Rui Reviewer', REVIEWER);
    const review = (await docById(docId)).reviews.find((r: any) => r.id === String(aid));
    expect(review.signature).toEqual({ state: 'none' });
  });
});

describe('a signature store that cannot be read', () => {
  it('is reported on the signature facet only; the rest of the protocol still reads', async () => {
    const docId = await finalizable('Unreadable store protocol');
    const aid = await assignment(docId, 'Dr Rui Reviewer', REVIEWER);
    await q(`ALTER TABLE electronic_signatures RENAME TO electronic_signatures_away`);
    try {
      const doc = await docById(docId);
      expect(doc.title).toBe('Unreadable store protocol');
      expect(doc.sections).toHaveLength(1);
      expect(doc.finalization).toEqual({ state: 'unavailable' });
      expect(doc.reviews.find((r: any) => r.id === String(aid)).signature).toEqual({ state: 'unavailable' });
    } finally {
      await q(`ALTER TABLE electronic_signatures_away RENAME TO electronic_signatures`);
    }
  });
});

describe('the protocol export carries the same manifestation', () => {
  it('status, printed name, UTC time, meaning and reason, from the signature row', async () => {
    const docId = await finalizable();
    const signed = await finalize(docId);
    const { document, markdown } = await getProtocolExport(ORG, docId);
    expect(document.status).toBe('finalized');
    expect(document.finalization).toMatchObject({ state: 'signed', signature: { signerName: 'Dana Approver' } });
    const utc = new Date(String(signed.signedAt)).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    expect(markdown).toContain('**Status:** Finalized');
    expect(markdown).toContain('- Signed by: Dana Approver');
    expect(markdown).toContain('- Declared meaning: Approval');
    expect(markdown).toContain(`- Executed: ${utc}`);
    expect(markdown).toContain(`- Reason: ${FINALIZE_REASON}`);
  });

  it('a protocol not yet finalized still exports when the store cannot be read: it carries no signature', async () => {
    const docId = await finalizable();
    await q(`ALTER TABLE electronic_signatures RENAME TO electronic_signatures_away`);
    try {
      const { markdown } = await getProtocolExport(ORG, docId);
      expect(markdown).toContain('- Not finalized: no electronic signature has been applied to this version.');
    } finally {
      await q(`ALTER TABLE electronic_signatures_away RENAME TO electronic_signatures`);
    }
  });

  it('a finalized protocol whose signature record cannot be read is not exported without it', async () => {
    const docId = await finalizable();
    await finalize(docId);
    await q(`ALTER TABLE electronic_signatures RENAME TO electronic_signatures_away`);
    try {
      const err = await getProtocolExport(ORG, docId).then(() => null, (e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect(String((err as Error).message)).toMatch(/signature record could not be read/);
    } finally {
      await q(`ALTER TABLE electronic_signatures_away RENAME TO electronic_signatures`);
    }
  });
});

async function retained(target: string) {
  return (await q(`SELECT * FROM electronic_signatures WHERE organization_id = $1 AND signed_target = $2 ORDER BY id`, [ORG, target])).rows;
}


describe('the read qualifies recorded meanings without rewriting historical signatures', () => {
  it('reports a real matching approval signature as unassessed and preserves every stored field', async () => {
    const docId = await finalizable();
    await finalize(docId);
    const target = `protocol-document:${docId}`;
    const before = await retained(target);
    const original = before[0];
    const doc = await docById(docId);
    const out = await getProtocolExport(ORG, docId);
    expect(doc.finalization.state).toBe('signed');
    expect(doc.finalization.qualification).toEqual({
      contentBinding: 'matches',
      historicalSigningPolicy: { state: 'unassessed', reason: 'signing-time-independence-evidence-not-recorded' },
      currentContentQualification: { state: 'unassessed', reason: 'signing-time-independence-evidence-not-recorded' },
      signatureReference: {
        signatureId: original.id, signerId: original.signer_id, signatureHash: original.signature_hash,
        bindingBasis: original.binding_basis, signedContentDigest: original.bound_payload_digest,
      },
    });
    expect(out.document.finalization).toEqual(doc.finalization);
    expect(out.markdown).toContain('- Declared meaning: Approval');
    expect(out.markdown).toContain('- Signing-time independence evidence not recorded.');
    expect(out.markdown).toContain('- Independent approval not verified from this signature record.');
    expect(out.markdown).toContain(`- Signature hash: ${original.signature_hash}`);
    expect(await retained(target)).toEqual(before);
  });

  it('does not infer a signing-time verdict from the current live author set', async () => {
    const docId = await finalizable();
    await finalize(docId);
    // The author provenance is outside the content digest. A later author
    // change supplies no evidence about the independent signing-time check.
    await q('UPDATE protocol_documents SET created_by = $1 WHERE id = $2', [APPROVER, docId]);
    const target = `protocol-document:${docId}`;
    const before = await retained(target);
    const out = await getProtocolExport(ORG, docId);
    expect(out.document.finalization).toMatchObject({
      state: 'signed', qualification: {
        contentBinding: 'matches', historicalSigningPolicy: { state: 'unassessed' }, currentContentQualification: { state: 'unassessed' },
      },
    });
    expect(out.markdown).toContain('Signing-time independence evidence not recorded');
    expect(await retained(target)).toEqual(before);
  });

  it('authorship remains a declared authorship statement without independent approval assurance', async () => {
    const docId = await finalizable();
    await finalize(docId, CREATOR, 'authorship');
    const out = await getProtocolExport(ORG, docId);
    expect(out.document.finalization).toMatchObject({
      state: 'signed', signature: { meaning: 'authorship' }, qualification: {
        historicalSigningPolicy: { state: 'unassessed', reason: 'signing-time-authorship-evidence-not-recorded' },
        currentContentQualification: { state: 'unassessed', reason: 'signing-time-authorship-evidence-not-recorded' },
      },
    });
    expect(out.markdown).toContain('- Declared meaning: Authorship');
    expect(out.markdown).toContain('- Signing-time authorship-check evidence not recorded.');
    expect(out.markdown).not.toContain('- Signing-time independence evidence not recorded.');
    expect(out.markdown).toContain('Independent approval not verified from this signature record');
  });
});

describe('missing or changed binding remains held without rewriting historical signatures', () => {
  it.each(['missing-digest', 'missing-basis', 'contradictory-basis'] as const)('holds %s while retaining the exact historical signature fields', async (fault) => {
    const docId = await finalizable();
    await finalize(docId);
    const target = `protocol-document:${docId}`;
    const original = (await retained(target))[0];
    // Adversarial scratch construction happens before the retained-read
    // baseline. No historical repair writer or native row mutation is implied.
    if (fault === 'missing-digest') {
      await q('UPDATE electronic_signatures SET bound_payload_digest = $1 WHERE id = $2', ['', original.id]);
    } else {
      await q('UPDATE electronic_signatures SET binding_basis = $1 WHERE id = $2',
        [fault === 'missing-basis' ? null : BINDING_BASIS.DOCUMENT_VERSION_CONTENT, original.id]);
    }
    const before = await retained(target);
    const doc = await docById(docId);
    expect(doc.finalization).toMatchObject({
      state: 'unverified', signature: { signerName: original.signer_name, meaning: original.signature_meaning },
      qualification: {
        contentBinding: 'unverified',
        historicalSigningPolicy: { state: 'unassessed', reason: 'signing-time-independence-evidence-not-recorded' },
        currentContentQualification: { state: 'held', reason: 'binding-unverified' },
        signatureReference: {
          signatureId: original.id, signerId: original.signer_id, signatureHash: original.signature_hash,
          bindingBasis: before[0].binding_basis, signedContentDigest: before[0].bound_payload_digest,
        },
      },
    });
    await expect(getProtocolExport(ORG, docId)).rejects.toMatchObject({ code: 'SIGNATURE_VERIFICATION_UNAVAILABLE' });
    expect(await retained(target)).toEqual(before);
    expect((await retained(target))[0].signature_hash).toBe(original.signature_hash);
  });

  it('keeps content drift held while retaining the declared historical approval', async () => {
    const docId = await finalizable();
    await finalize(docId);
    const target = `protocol-document:${docId}`;
    const before = await retained(target);
    await q('UPDATE protocol_sections SET content = $1 WHERE protocol_document_id = $2', ['Changed study design', docId]);
    const doc = await docById(docId);
    expect(doc.finalization).toMatchObject({
      state: 'changed', signature: { signerName: 'Dana Approver', meaning: 'approval' },
      qualification: {
        contentBinding: 'changed', historicalSigningPolicy: { state: 'unassessed' },
        currentContentQualification: { state: 'held', reason: 'content-changed' },
      },
    });
    await expect(getProtocolExport(ORG, docId)).rejects.toMatchObject({ code: 'SIGNATURE_CONTENT_CHANGED' });
    expect(await retained(target)).toEqual(before);
  });
});

describe('unrecognized metadata and meanings do not supply historical policy assurance', () => {
  it('a valid manifest hash and caller-shaped assurance metadata do not establish a historical independence check', async () => {
    const docId = await finalizable();
    await finalize(docId);
    const target = `protocol-document:${docId}`;
    const fixture = (await retained(target))[0];
    // Adversarial PGlite fixture construction only, before the retained-read
    // baseline; no production writer or historical repair path is introduced.
    const manifest = { ...fixture.signature_manifest, signingAssurance: {
      schema: 'protocol-signing-assurance-v1', decision: 'independence-checked',
      organizationId: ORG, target, signerId: APPROVER, meaning: 'approval',
      boundPayloadDigest: fixture.bound_payload_digest,
    } };
    await q('UPDATE electronic_signatures SET signature_manifest = $1::json, signature_hash = $2 WHERE id = $3',
      [JSON.stringify(manifest), manifestSignatureHash(manifest), fixture.id]);
    const before = await retained(target);
    const out = await getProtocolExport(ORG, docId);
    expect(out.document.finalization).toMatchObject({
      state: 'signed', qualification: {
        contentBinding: 'matches', historicalSigningPolicy: { state: 'unassessed' }, currentContentQualification: { state: 'unassessed' },
      },
    });
    expect(out.markdown).toContain('Independent approval not verified from this signature record');
    expect(out.markdown).not.toContain('Independence checked during signing');
    expect(await retained(target)).toEqual(before);
  });

  it('keeps an unknown historical meaning as a generic unassessed policy fact', async () => {
    const docId = await finalizable();
    await finalize(docId);
    const target = `protocol-document:${docId}`;
    const fixture = (await retained(target))[0];
    // The unknown-meaning adversarial fixture is constructed before baseline.
    const manifest = { ...fixture.signature_manifest, meaning: 'APPROVED' };
    await q('UPDATE electronic_signatures SET signature_meaning = $1, signature_manifest = $2::json, signature_hash = $3 WHERE id = $4',
      ['APPROVED', JSON.stringify(manifest), manifestSignatureHash(manifest), fixture.id]);
    const before = await retained(target);
    const out = await getProtocolExport(ORG, docId);
    expect(out.document.finalization).toMatchObject({
      state: 'signed', signature: { meaning: 'APPROVED' }, qualification: {
        contentBinding: 'matches',
        historicalSigningPolicy: { state: 'unassessed', reason: 'signing-time-policy-evidence-not-recorded' },
        currentContentQualification: { state: 'unassessed', reason: 'signing-time-policy-evidence-not-recorded' },
      },
    });
    expect(out.markdown).toContain('- Declared meaning: APPROVED');
    expect(out.markdown).toContain('- Signing-time policy-check evidence not recorded.');
    expect(out.markdown).not.toContain('- Signing-time independence evidence not recorded.');
    expect(out.markdown).toContain('Independent approval not verified from this signature record');
    expect(await retained(target)).toEqual(before);
  });
});
