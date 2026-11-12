/**
 * P-99 C2 (F1, rows D7 and D2): a person puts a sent sequence's send on record, read back from the package the platform
 * kept (design §3.0, §3.1, §3.3; re-cut 2026-11-09). A governed act, unsigned: the content is decided by bytes whose
 * SHA-256 the platform recorded before they left, and the person binds what they read (the precheck's manifestSha256)
 * and gives a reason. The record goes on the send's own transmittal row; the fold then reads the sequence as sent.
 *
 * The real precheck, act and fold over the freeze-gate fixture on PGlite. The package is a real one, from the canonical
 * packager, kept in a stubbed store and read back through readSentPackage's own integrity checks. Project read access
 * is stubbed to this project (current-program-access.ts has its own suites).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { promises as fs } from 'fs';
import { createHash, randomUUID } from 'crypto';
import * as os from 'os';
import * as path from 'path';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any, store: new Map<string, Buffer>(), afterDerive: null as null | (() => Promise<void>) }));
vi.mock('../../../db', () => {
  const run = async (sql: string, params?: unknown[]) => {
    const r = await holder.pglite.query(sql, params);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  };
  return { get db() { return holder.db; }, pool: { query: run, connect: async () => ({ query: run, release: () => {} }) } };
});
// The act's derivation runs outside the lock; a hook here changes the world before the lock is taken (as P-86's T7).
vi.mock('../../submission-gateways/sent-package-read', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../submission-gateways/sent-package-read')>();
  return {
    ...actual,
    deriveSentLeafManifest: async (...args: Parameters<typeof actual.deriveSentLeafManifest>) => {
      const d = await actual.deriveSentLeafManifest(...args);
      const hook = holder.afterDerive;
      if (hook) { holder.afterDerive = null; await hook(); }
      return d;
    },
  };
});
vi.mock('../../storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage')>();
  return { ...actual, getStorageProviderFor: () => ({ get: async (versionId: string) => (holder.store.has(versionId) ? { bytes: holder.store.get(versionId)! } : null) }) };
});
// The actor's organization role, as the receipt path reads it (csr/project-scope.ts readCsrProjectActor): 9901 is a viewer.
vi.mock('../../csr/project-scope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../csr/project-scope')>();
  return { ...actual, readCsrProjectActor: async (_q: unknown, _org: number, userId: number) => ({ userId, role: userId === 9901 ? 'viewer' : 'admin' }) };
});
vi.mock('../../c2c/current-program-access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../c2c/current-program-access')>();
  return {
    ...actual,
    requireCurrentProgramAccess: async (_q: unknown, input: { programId: string }) => {
      if (input.programId !== FREEZE_PROGRAM_ID) throw Object.assign(new Error('Current project access does not permit this operation.'), { status: 403, code: 'PROJECT_PERMISSION_DENIED' });
      return { actor: {}, programId: input.programId, projectId: 1, clientWorkspaceId: null };
    },
  };
});

import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, applySequenceRemovalGuard, type IndPgliteDb } from '../../../db/pglite-harness';
import { ORG, USER, FREEZE_GATE_SEED_SQL, FREEZE_PROGRAM_ID, freezeGateHelpers } from './_freeze-gate-fixture';
import { precheckSentRecord, rederiveSentRecord } from '../submission-service';
import { loadFiledStateBySubmission, loadLatestPriorManifestBySubmission } from '../../ectd/prior-sequence-loader';
import { packageEctdSubmission, type EctdLeaf } from '../../submission-gateways/regional-packager';
import { plainPdfFixture as pdf } from '../../ectd/__tests__/support/signed-pdf-fixture';

let h: IndPgliteDb;
let work: string;
const ctx = { organizationId: ORG, userId: USER };
const AUTHOR = 4;
const { sign } = freezeGateHelpers(() => h);
const q = (text: string, params?: unknown[]) => h.pglite.query(text, params) as Promise<{ rows: any[] }>;
const outcome = (p: Promise<unknown>) => p.then(() => null, (e: any) => e);
const REASON = 'The platform kept the exact package sequence 0000 sent; recording what it carried.';
const { pool } = await import('../../../db');

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true, programSpine: true });
  holder.db = h.db;
  holder.pglite = h.pglite;
  await h.pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pglite.exec(FREEZE_GATE_SEED_SQL);
  await applySequenceRemovalGuard(h.pglite);
  // The real transmittal table's columns (migrations/20260509_submission_gateways.sql and its successors), as the
  // held-send suites add them; readSentPackage reads program_id and bundle_sha256.
  await h.pglite.exec(`
    ALTER TABLE electronic_signatures ADD COLUMN IF NOT EXISTS signer_name TEXT, ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP DEFAULT now(),
      ADD COLUMN IF NOT EXISTS signature_purpose TEXT;
    ALTER TABLE submission_transmittals ADD COLUMN IF NOT EXISTS package_id INTEGER, ADD COLUMN IF NOT EXISTS program_id UUID,
      ADD COLUMN IF NOT EXISTS gateway TEXT, ADD COLUMN IF NOT EXISTS transport TEXT, ADD COLUMN IF NOT EXISTS status TEXT,
      ADD COLUMN IF NOT EXISTS bundle_sha256 TEXT, ADD COLUMN IF NOT EXISTS bundle_size_bytes BIGINT, ADD COLUMN IF NOT EXISTS transmission_id TEXT,
      ADD COLUMN IF NOT EXISTS error_message TEXT, ADD COLUMN IF NOT EXISTS mdn_raw TEXT, ADD COLUMN IF NOT EXISTS ack_received_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(), ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();`);
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'sent-record-act-'));
}, 120_000);
afterAll(async () => { await h?.close(); await fs.rm(work, { recursive: true, force: true }); });

/** A real 0000 package: a Module 1 cover letter and 3.2.S.4.2, as the canonical packager builds it. */
async function realPackage(sequence = '0000'): Promise<{ bytes: Buffer; sha256: string }> {
  const file = async (n: string) => { const p = path.join(work, `${n}-${randomUUID()}.pdf`); await fs.writeFile(p, await pdf(n)); return p; };
  const bundle = await packageEctdSubmission({
    region: 'fda', applicationId: '123456', sequence, submissionType: 'original', fda: { applicationType: 'ind' },
    sponsorId: 'D', sponsorName: 'S', productName: 'P', outputDir: path.join(work, `out-${randomUUID()}`), environment: 'staging',
    leaves: [
      { ctdSection: 'm1.2', fileName: 'cover.pdf', title: 'Cover letter', operation: 'new', sourcePath: await file('cover') },
      { ctdSection: '3.2.S.4.2', fileName: 'analytical-procedures.pdf', title: 'Analytical procedures', operation: 'new', sourcePath: await file('ap') },
    ] as EctdLeaf[],
  } as Parameters<typeof packageEctdSubmission>[0]);
  const bytes = await fs.readFile(bundle.path);
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

let nextId = 9900;
const uuid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
type WindowOpts = { bound?: boolean; environment?: string; kept?: boolean; corrupt?: boolean; otherSent?: boolean; record?: boolean; dispatchStatus?: string; sequenceNumber?: string; submissionId?: number; bytes?: Buffer };
/** A sequence sent to FDA in the window: its transmittal keeps the package's identity and no record of its leaves. */
async function windowSend(opts: WindowOpts = {}) {
  const id = nextId++;
  const submissionId = opts.submissionId ?? id;
  if (!opts.submissionId) {
    await q(`INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id)
             VALUES ($1, 'P-99 window send', 'ind', 'biotech', 'fda', ${ORG}, ${AUTHOR}, $2)`, [submissionId, FREEZE_PROGRAM_ID]);
  }
  const n = opts.sequenceNumber ?? '0000';
  await q(`INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status, dispatch_status)
           VALUES ($1, $2, 'fda', $3, ${ORG}, ${AUTHOR}, 'dispatched', 'pending')`, [id, submissionId, n]);
  const S = await sign(id, 'transmit', 'release', { environment: 'production' });
  const A = uuid(id);
  await q(`UPDATE ectd_sequences SET dispatch_status = $2, transmit_signature_action_id = $3, transmit_attempt_id = $4::uuid WHERE id = $1`,
    [id, opts.dispatchStatus ?? 'sent', S, A]);
  const pkg = opts.bytes ? { bytes: opts.bytes, sha256: createHash('sha256').update(opts.bytes).digest('hex') } : await realPackage(n);
  const versionId = randomUUID();
  if (opts.kept !== false) holder.store.set(versionId, pkg.bytes);
  const metadata: Record<string, unknown> = {
    environment: opts.environment ?? 'production', sequence: n,
    ...(opts.bound === false ? {} : { dispatchBinding: { organizationId: ORG, sequenceId: id, signatureActionId: S, attemptId: A, bundleSha256: pkg.sha256 } }),
    sentPackage: { storageVersionId: versionId, provider: 'test', sha256: opts.corrupt ? 'b'.repeat(64) : pkg.sha256, sizeBytes: pkg.bytes.length, filename: `fda-esg-${pkg.sha256}.zip` },
    ...(opts.record ? { leafManifest: [] } : {}),
  };
  const transmittalId = (await q(`INSERT INTO submission_transmittals (organization_id, program_id, region, gateway, transport, status, metadata, bundle_sha256, submitted_at)
      VALUES (${ORG}, $1, 'fda', 'esg', 'as2', 'received', $2::jsonb, $3, now() - interval '3 days') RETURNING id`,
  [FREEZE_PROGRAM_ID, JSON.stringify(metadata), opts.otherSent ? 'c'.repeat(64) : pkg.sha256])).rows[0].id as number;
  return { id, submissionId, S, A, transmittalId, sha256: pkg.sha256, bytes: pkg.bytes };
}
const transmittal = async (id: number) => (await q(`SELECT status, metadata FROM submission_transmittals WHERE id = $1`, [id])).rows[0];
const auditOf = async (seq: number, action: string) =>
  (await q(`SELECT reason, new_values::jsonb AS v FROM audit_logs WHERE table_name = 'ectd_sequence' AND record_id = $1 AND action = $2`, [String(seq), action])).rows;
async function readBack(seqId: number) {
  const pre = await precheckSentRecord(seqId, ctx);
  expect(pre.cleared, String(pre.refusal)).toBe(true);
  return pre.sentRecord.readBack!;
}

describe('P-99 C2: a sent sequence’s send is put on record, read back from the package it sent', () => {
  it('T6 a window send is read back: the record on its row, one chained row, and the fold reads it as sent', async () => {
    const s = await windowSend();
    // A preview compile carried a leaf the send did not: before, the fold reads it; after, never.
    await q(`INSERT INTO ectd_compilations (organization_id, submission_id, compilation_type, sequence_number, leaf_manifest)
             VALUES (${ORG}, $1, 'module', '0000', $2::jsonb)`, [s.submissionId, JSON.stringify([{ ctdSection: '2.5', fileName: 'phantom.pdf', href: 'm2/2-5/phantom.pdf', md5: '9'.repeat(32), operation: 'new' }])]);
    const pre = await precheckSentRecord(s.id, ctx);
    expect(pre).toMatchObject({ step: 'sent-record', cleared: true, refusal: null,
      sentRecord: { sequenceNumber: '0000', agency: 'fda', basis: 'compiles', path: 'read-back' } });
    const rb = pre.sentRecord.readBack!;
    expect(rb).toMatchObject({ leafCount: 2, notRecoverable: ['sourceMd5', 'originalPdfProof'] });
    // Words only on the way to the screen: no hrefs, IDs or checksums.
    expect(rb.leaves).toEqual([
      { ctdSection: '3.2.S.4.2', fileName: 'analytical-procedures.pdf', operation: 'new', title: 'Analytical procedures' },
      { ctdSection: 'm1.2', fileName: 'cover.pdf', operation: 'new', title: 'Cover letter' },
    ]);
    const done = await rederiveSentRecord(s.id, ctx, { reason: REASON, manifestSha256: rb.manifestSha256 });
    expect(done).toMatchObject({ recorded: true, sequenceId: s.id, sequenceNumber: '0000', leafCount: 2, transmittalId: s.transmittalId });
    const t = await transmittal(s.transmittalId);
    expect(t.metadata.leafManifest.map((l: { fileName: string }) => l.fileName)).toEqual(['analytical-procedures.pdf', 'cover.pdf']);
    expect(t.metadata.leafManifestDerivation).toMatchObject({ method: 'sent-package-read', version: 1, sourceSha256: s.sha256,
      manifestSha256: rb.manifestSha256, leafCount: 2, notRecoverable: ['sourceMd5', 'originalPdfProof'], derivedBy: USER, reason: REASON });
    expect(t.metadata.dispatchBinding).toMatchObject({ sequenceId: s.id, signatureActionId: s.S, attemptId: s.A });
    expect(t.metadata.sentPackage).toMatchObject({ sha256: s.sha256 });
    expect(t.status).toBe('received');
    expect(await auditOf(s.id, 'ECTD_SENT_RECORD_REDERIVED')).toMatchObject([{ reason: REASON,
      v: { transmittalId: s.transmittalId, sourceSha256: s.sha256, method: 'sent-package-read', methodVersion: 1, manifestSha256: rb.manifestSha256, leafCount: 2, environment: 'production' } }]);
    const view = await loadFiledStateBySubmission(pool as never, { organizationId: ORG, submissionId: s.submissionId });
    expect(view.sequences).toEqual([expect.objectContaining({ sequenceNumber: '0000', filed: true, basis: 'transmit', restored: { how: 'read-back', on: expect.any(String) } })]);
    expect(view.leaves.map((l) => l.fileName).sort()).toEqual(['analytical-procedures.pdf', 'cover.pdf']);
    const next = await loadLatestPriorManifestBySubmission(pool as never, { organizationId: ORG, submissionId: s.submissionId, currentSequence: '0001' });
    expect(next.leaves.map((l) => l.fileName).sort()).toEqual(['analytical-procedures.pdf', 'cover.pdf']);
    // Already on record: asked again, it is refused in words.
    expect(await outcome(rederiveSentRecord(s.id, ctx, { reason: REASON, manifestSha256: rb.manifestSha256 })))
      .toMatchObject({ code: 'SENT_RECORD_NOT_RESTORABLE', message: expect.stringMatching(/^Sequence 0000's send is already on record \(/) });
  }, 120_000);

  it('T7 a send whose gateway wrote no binding is bound through the send’s own chained record, once', async () => {
    const s = await windowSend({ bound: false });
    const transmitted = (details: Record<string, unknown>) => q(`INSERT INTO audit_logs (id, tenant_id, action, table_name, record_id, new_values)
        VALUES (gen_random_uuid(), ${ORG}, 'ECTD_TRANSMITTED', 'ectd_sequence', $1, $2)`, [String(s.id), JSON.stringify(details)]);
    // The receipt path's and the settlement's rows of that action carry no packageSha256: not the transmit's own.
    await transmitted({ signatureActionId: s.S, source: 'held-send-settlement', status: 'received' });
    await transmitted({ signatureActionId: s.S, transmittalId: s.transmittalId, packageSha256: s.sha256, status: 'submitted', environment: 'production' });
    const rb = await readBack(s.id);
    await rederiveSentRecord(s.id, ctx, { reason: REASON, manifestSha256: rb.manifestSha256 });
    const t = await transmittal(s.transmittalId);
    expect(t.metadata.restoredBinding).toMatchObject({ sequenceId: s.id, attemptId: s.A, signatureActionId: s.S, source: 'ECTD_TRANSMITTED', transmittalId: s.transmittalId });
    const view = await loadFiledStateBySubmission(pool as never, { organizationId: ORG, submissionId: s.submissionId });
    expect(view.sequences[0]).toMatchObject({ filed: true, basis: 'transmit' });
  }, 120_000);

  it('T7 two transmit records of one send, or one whose package is not the row’s, bind nothing', async () => {
    const two = await windowSend({ bound: false });
    for (let i = 0; i < 2; i++) {
      await q(`INSERT INTO audit_logs (id, tenant_id, action, table_name, record_id, new_values) VALUES (gen_random_uuid(), ${ORG}, 'ECTD_TRANSMITTED', 'ectd_sequence', $1, $2)`,
        [String(two.id), JSON.stringify({ signatureActionId: two.S, transmittalId: two.transmittalId, packageSha256: two.sha256, status: 'submitted' })]);
    }
    expect((await precheckSentRecord(two.id, ctx)).refusal).toMatch(/^No transmission of sequence 0000 is on record that names it/);
    const other = await windowSend({ bound: false });
    await q(`INSERT INTO audit_logs (id, tenant_id, action, table_name, record_id, new_values) VALUES (gen_random_uuid(), ${ORG}, 'ECTD_TRANSMITTED', 'ectd_sequence', $1, $2)`,
      [String(other.id), JSON.stringify({ signatureActionId: other.S, transmittalId: other.transmittalId, packageSha256: 'd'.repeat(64), status: 'submitted' })]);
    expect((await precheckSentRecord(other.id, ctx)).refusal).toMatch(/^No transmission of sequence 0000 is on record that names it/);
  }, 120_000);
});

describe('P-99 C2: what the read-back refuses, and that it records only what the person read', () => {
  it.each([
    ['not filed', { dispatchStatus: 'pending' }, /^Sequence 0000 is not on file at the agency, so there is no send to put on record\. Nothing was changed\.$/],
    ['already on record', { record: true }, /^Sequence 0000's send is already on record \(/],
    ['a test send', { environment: 'staging' }, /^Sequence 0000 was sent to the agency's test environment, which is not a filing, so it is not put on record as filed\. Nothing was changed\.$/],
    ['a copy that is not the package sent', { corrupt: true }, /^The package the platform kept for this send cannot be read back\./],
    // Intact, but not the package the row records as sent: only the record-to-row check refuses it.
    ['an intact copy of another package', { otherSent: true }, /^The package the platform kept for this send cannot be read back\./],
    ['a copy missing from storage', { kept: false }, /^The package the platform kept for this send cannot be read back\./],
  ])('T8 refuses %s, before anything is recorded', async (_label, opts, words) => {
    const s = await windowSend(opts as WindowOpts);
    const pre = await precheckSentRecord(s.id, ctx);
    expect(pre.cleared).toBe(false);
    expect(pre.refusal).toMatch(words as RegExp);
    expect(await outcome(rederiveSentRecord(s.id, ctx, { reason: REASON, manifestSha256: 'a'.repeat(64) }))).toMatchObject({ code: expect.stringMatching(/SENT_RECORD_NOT_RESTORABLE|INVALID_STATE/) });
    expect(await auditOf(s.id, 'ECTD_SENT_RECORD_REDERIVED')).toEqual([]);
  }, 120_000);

  it('T8 refuses a sequence whose earlier sequence is not on record, naming it', async () => {
    const first = await windowSend();
    const second = await windowSend({ submissionId: first.submissionId, sequenceNumber: '0001', bytes: (await realPackage('0001')).bytes });
    expect((await precheckSentRecord(second.id, ctx)).refusal)
      .toBe('Sequence 0000, before it, is not on record either. Put sequence 0000 on record first. Nothing was changed.');
  }, 120_000);

  it('T8 refuses a package that is not this sequence, with the reader’s reasons', async () => {
    const s = await windowSend({ bytes: (await realPackage('0003')).bytes });
    expect((await precheckSentRecord(s.id, ctx)).refusal).toMatch(/could not be read back from the package it sent: the package holds sequence 0003, not sequence 0000/);
  }, 120_000);

  it('T8 refuses a person without governed write access', async () => {
    const s = await windowSend();
    const e = await outcome(rederiveSentRecord(s.id, { organizationId: ORG, userId: 9901 }, { reason: REASON, manifestSha256: 'a'.repeat(64) }));
    expect(e).toMatchObject({ code: 'FORBIDDEN', message: 'Recording what a sequence sent needs write access to this project.' });
  }, 120_000);

  it('T10 what is recorded is what the person read: a different read-back is refused, and nothing is written', async () => {
    const s = await windowSend();
    const e = await outcome(rederiveSentRecord(s.id, ctx, { reason: REASON, manifestSha256: 'a'.repeat(64) }));
    expect(e).toMatchObject({ code: 'SENT_RECORD_NOT_RESTORABLE', message: 'What would be recorded changed since you read it. Nothing was recorded; open it again.' });
    expect((await transmittal(s.transmittalId)).metadata).not.toHaveProperty('leafManifest');
  }, 120_000);

  it('T10 judged again under the lock: a send put on record after this act read it is not recorded twice', async () => {
    const s = await windowSend();
    const rb = await readBack(s.id);
    // Another act records the send between this act's read and its lock.
    holder.afterDerive = async () => { await q(`UPDATE submission_transmittals SET metadata = metadata || '{"leafManifest": []}'::jsonb WHERE id = $1`, [s.transmittalId]); };
    expect(await outcome(rederiveSentRecord(s.id, ctx, { reason: REASON, manifestSha256: rb.manifestSha256 })))
      .toMatchObject({ code: 'SENT_RECORD_NOT_RESTORABLE', message: expect.stringMatching(/^Sequence 0000's send is already on record \(/) });
    expect((await transmittal(s.transmittalId)).metadata.leafManifest).toEqual([]);
    expect(await auditOf(s.id, 'ECTD_SENT_RECORD_REDERIVED')).toEqual([]);
  }, 120_000);

  it('T10 a reason is required', async () => {
    const s = await windowSend();
    const rb = await readBack(s.id);
    expect(await outcome(rederiveSentRecord(s.id, ctx, { reason: '  ', manifestSha256: rb.manifestSha256 }))).toMatchObject({ code: 'VALIDATION' });
  }, 120_000);
});
