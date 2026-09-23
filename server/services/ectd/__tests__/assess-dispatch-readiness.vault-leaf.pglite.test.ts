/**
 * The dispatch-readiness ASSESSMENT resolves a vault-backed leaf — and the
 * composed freeze / dispatch gate agrees with it.
 *
 * ── The defect (MDX demo pack, 2026-09-21, finding F5) ───────────────────────
 * `GET /api/submissions/sequences/:id/dispatch-readiness` reported every leaf
 * filed from the vault as UNRESOLVED_DOCUMENT ("has no resolvable document"):
 * the assessor handed the pure validator the integer `documentId` alone, and
 * a vault leaf is keyed by `documentUuid`. Six leaves the leaf route had
 * accepted — uuid stored, content hash pinned — were six error findings, and
 * "6 open error-severity validation finding(s)" blocked both the freeze gate
 * and the dispatch gate. No vault-built sequence could ever clear.
 *
 * ── What is locked here (real SQL, in-process PGlite; the gate's own DB reads) ─
 *   • a uuid-keyed vault leaf and an integer-keyed coauthor leaf both resolve:
 *     no UNRESOLVED_DOCUMENT for either;
 *   • a leaf whose pinned hash differs from the stored document is reported
 *     under its own code, DOCUMENT_CONTENT_MISMATCH, as an error;
 *   • a leaf pointing at a document that does not exist stays UNRESOLVED_DOCUMENT;
 *   • the structural blocker leaves BOTH composed gates (freeze and dispatch)
 *     once every leaf resolves — what remains is real (no Shadow Review), so
 *     the gate is still not cleared, and says why.
 *
 * The release-signature resolver is stubbed (its store is not in this harness
 * and it has its own journey); every other gate input is read from the
 * database by the assessor itself.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHash } from 'crypto';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../../db.js', () => ({ get db() { return holder.db; } }));
vi.mock('../release-signature-status', () => ({
  resolveReleaseSignatureStatus: async () => ({ verdict: 'unsigned', detail: 'stubbed: no release signature store in this harness' }),
  isReleaseSignatureRequired: () => false,
}));

import { assessSequenceDispatchReadiness } from '../assess-dispatch-readiness';

let harness: IndPgliteDb;
const ORG = 41;
const USER = 5;
const PROGRAM = '55555555-5555-4555-8555-555555555555';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

let seqCounter = 0;
const nextUuid = () => `6666${(++seqCounter).toString().padStart(4, '0')}-6666-4666-8666-666666666666`;

async function seedVaultDoc(): Promise<{ uuid: string; hash: string }> {
  const uuid = nextUuid();
  const hash = sha(`bytes-${uuid}`);
  await harness.pglite.query(
    `INSERT INTO vault.documents (id, program_id, storage_version_id, content_hash, file_name)
     VALUES ($1::uuid, $2::uuid, $3, $4, 'doc.pdf')`,
    [uuid, PROGRAM, `ver-${uuid}`, hash],
  );
  return { uuid, hash };
}

async function seedSequence(): Promise<number> {
  const sub = await harness.pglite.query<{ id: number }>(
    `INSERT INTO submissions (title, product_name, application_type, client_type, primary_region, organization_id, created_by)
     VALUES ('NeuroPanel-Dx 510(k)', 'NeuroPanel-Dx', '510k', 'ivd', 'fda', $1, $2) RETURNING id`,
    [ORG, USER],
  );
  const seq = await harness.pglite.query<{ id: number }>(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, organization_id, created_by)
     VALUES ($1, 'fda', '0000', 'original', 'assembling', $2, $3) RETURNING id`,
    [Number(sub.rows[0].id), ORG, USER],
  );
  return Number(seq.rows[0].id);
}

async function seedLeaf(sequenceId: number, leaf: {
  sectionCode: string;
  title: string;
  documentTable: string;
  documentId?: number | null;
  documentUuid?: string | null;
  pin?: string | null;
}): Promise<void> {
  await harness.pglite.query(
    `INSERT INTO submission_leaves
       (sequence_id, section_code, title, lifecycle_op, document_table, document_id, document_uuid,
        document_content_sha256, organization_id, created_by)
     VALUES ($1, $2, $3, 'new', $4, $5, $6::uuid, $7, $8, $9)`,
    [sequenceId, leaf.sectionCode, leaf.title, leaf.documentTable, leaf.documentId ?? null, leaf.documentUuid ?? null, leaf.pin ?? null, ORG, USER],
  );
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  await harness.pglite.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE IF NOT EXISTS regulatory_programs (id UUID PRIMARY KEY, organization_id INTEGER, deleted_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS vault.documents (
      id UUID PRIMARY KEY, program_id UUID NOT NULL, storage_version_id TEXT, content_hash TEXT, file_name TEXT, deleted_at TIMESTAMPTZ
    );
    -- The Shadow Review store the assessor reads (shared/schema/shadow-review.ts).
    CREATE TABLE IF NOT EXISTS shadow_review_runs (
      id SERIAL PRIMARY KEY, sequence_id INTEGER NOT NULL, region TEXT NOT NULL DEFAULT 'fda', lens TEXT NOT NULL DEFAULT 'fda_filing',
      model TEXT, prompt_version TEXT, status TEXT NOT NULL DEFAULT 'running', rtf_risk_score REAL, crl_risk_score REAL, summary TEXT,
      organization_id INTEGER NOT NULL, created_by INTEGER, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), deleted_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS shadow_review_findings (
      id SERIAL PRIMARY KEY, run_id INTEGER NOT NULL, dimension TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL, detail TEXT,
      basis TEXT, recommendation TEXT, leaf_ref TEXT, status TEXT NOT NULL DEFAULT 'open', organization_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), deleted_at TIMESTAMPTZ
    );
  `);
  await harness.pglite.query(`INSERT INTO regulatory_programs (id, organization_id) VALUES ($1::uuid, $2)`, [PROGRAM, ORG]);
});

afterAll(async () => {
  await harness?.close?.();
});

describe('assessSequenceDispatchReadiness — vault-backed leaves resolve', () => {
  it('resolves a uuid-keyed vault leaf and an integer-keyed leaf; reports a changed pin and a missing document under their own codes', async () => {
    const sequenceId = await seedSequence();
    const vaultOk = await seedVaultDoc();
    const vaultChanged = await seedVaultDoc();
    const coauthor = await harness.pglite.query<{ id: number }>(
      `INSERT INTO coauthor_documents (organization_id, title, content, module_number, status)
       VALUES ($1, 'Clinical Overview', 'Authored body.', 'm2.5', 'approved') RETURNING id`,
      [ORG],
    );
    const coauthorId = Number(coauthor.rows[0].id);

    await seedLeaf(sequenceId, { sectionCode: '3.2.P.1', title: 'Device Description', documentTable: 'vault_documents', documentUuid: vaultOk.uuid, pin: vaultOk.hash });
    await seedLeaf(sequenceId, { sectionCode: 'm2.5', title: 'Clinical Overview', documentTable: 'coauthor_documents', documentId: coauthorId, pin: sha('Authored body.') });
    await seedLeaf(sequenceId, { sectionCode: '1.14', title: 'Labeling', documentTable: 'vault_documents', documentUuid: vaultChanged.uuid, pin: sha('the labeling that was filed') });
    await seedLeaf(sequenceId, { sectionCode: 'm2.4', title: 'Nonclinical Overview', documentTable: 'coauthor_documents', documentId: 999_999, pin: null });

    const a = await assessSequenceDispatchReadiness({ sequenceId, organizationId: ORG });
    const errors = a.readiness.findings.filter((f) => f.severity === 'error');
    const codesBySection = new Map(errors.map((f) => [f.sectionCode, f.code]));

    // The two leaves that resolve carry NO error finding.
    expect(codesBySection.has('3.2.P.1'), 'vault leaf keyed by uuid must resolve').toBe(false);
    expect(codesBySection.has('m2.5'), 'integer-keyed leaf must still resolve').toBe(false);
    // The changed pin is its own finding, the missing document stays UNRESOLVED.
    expect(codesBySection.get('1.14')).toBe('DOCUMENT_CONTENT_MISMATCH');
    expect(codesBySection.get('m2.4')).toBe('UNRESOLVED_DOCUMENT');
    expect(a.validationErrors).toBe(2);
    expect(a.gate.blockers.join(' ')).toMatch(/2 open error-severity validation finding/);
  });

  it('once every leaf resolves, the structural blocker leaves BOTH composed gates and what remains is real', async () => {
    const sequenceId = await seedSequence();
    for (const code of ['3.2.P.1', '3.2.R', '5.3.1.4', '5.3.5.2', '1.16', '1.14']) {
      const v = await seedVaultDoc();
      await seedLeaf(sequenceId, { sectionCode: code, title: `Vault leaf ${code}`, documentTable: 'vault_documents', documentUuid: v.uuid, pin: v.hash });
    }

    const a = await assessSequenceDispatchReadiness({ sequenceId, organizationId: ORG });
    expect(a.leafCount).toBe(6);
    expect(a.validationErrors).toBe(0);
    expect(a.readiness.findings.filter((f) => f.code === 'UNRESOLVED_DOCUMENT')).toHaveLength(0);
    expect(a.readiness.findings.filter((f) => f.code === 'DOCUMENT_CONTENT_MISMATCH')).toHaveLength(0);

    // The composed gates agree with the assessment: no validation blocker on
    // either. The sequence is still NOT cleared — no Shadow Review has run —
    // and both gates name that real reason.
    for (const gate of [a.gate, a.freezeGate]) {
      expect(gate.blockers.join(' ')).not.toMatch(/validation finding/);
      expect(gate.cleared).toBe(false);
      expect(gate.blockers.join(' ')).toMatch(/Shadow Review/);
    }
  });
});
