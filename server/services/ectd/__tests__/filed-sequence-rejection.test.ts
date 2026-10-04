/**
 * Recording an agency technical rejection (2026-10-01, W5/D7, sweep F19) — the
 * rules that decide WHICH filing it takes off file and when it refuses, against
 * a scripted connection, and that every refusal writes and signs nothing.
 *
 * What the SQL itself does (the JSONB merge, the assembler honouring the mark,
 * the Vault's tenant scoping, the rollback when a write fails, a rollback that
 * does not un-file) is pinned through PGlite in
 * tests/submission-ops-package-spine.pglite.e2e.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { ledger, persistSignature, db } = vi.hoisted(() => ({
  ledger: vi.fn(),
  persistSignature: vi.fn(),
  db: {
    /** The tenant read before the lock: [] when the transmittal is not this org's. */
    owner: [] as Array<{ package_id: number | null; package_db_id: number | null }>,
    /** The package metadata served under the row lock. */
    metadata: {} as Record<string, unknown>,
    transmittal: null as null | { status: string; package_id: number; bundle_sha256: string | null },
    vault: [] as Array<{ id: string; content_hash: string; created_by: number | null }>,
  },
}));
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction: ledger }));
vi.mock('../../part11/signature-persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../part11/signature-persistence')>()),
  persistGovernedActionSignature: persistSignature,
}));
const lockQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
  if (/FROM c2c_submission_packages WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows: [{ metadata: db.metadata }] };
  if (/FROM submission_transmittals\s+WHERE/.test(sql)) return { rows: db.transmittal ? [db.transmittal] : [] };
  if (/FROM vault\.documents/.test(sql)) return { rows: db.vault.filter((d) => d.id === params[0]) };
  return { rows: [] };
});
vi.mock('../../../db', () => ({
  db: {},
  pool: {
    query: vi.fn(async () => ({ rows: db.owner })),
    connect: vi.fn(async () => ({ query: (sql: string, params?: unknown[]) => lockQuery(sql, params ?? []), release: () => {} })),
  },
}));

import { pool } from '../../../db';
import { recordFiledSequenceRejection, FiledSequenceRejectionRefusal } from '../filed-sequence-rejection';
import { isRejectedFiling, readFiledSequences } from '../package-sequence-lifecycle';

const NOTICE = '5f0c2d7a-0b6f-4d1e-9c39-4f0e9a516f10';
const NOTICE_SHA = 'ab'.repeat(32);
const sha = (sequence: string) => sequence.repeat(16);
const entry = (sequence: string, transmittalId: number | null) => ({
  sequence, submissionType: 'original', sha256: sha(sequence), transmittalId,
  filedAt: '2026-09-30T00:00:00Z', leaves: [], state: 'transmitted',
});
const rejectedEntry = (sequence: string, transmittalId: number) => ({
  ...entry(sequence, transmittalId), state: 'rejected',
  rejection: { actionId: 'act_0', signatureId: 1, evidence: { vaultDocumentId: NOTICE, contentSha256: NOTICE_SHA } },
});
const REAUTH_AT = new Date('2026-10-01T09:30:00Z');
const reject = (over: Record<string, unknown> = {}) => recordFiledSequenceRejection({
  orgId: 99, transmittalId: 2, actorUserId: 777, meaning: 'responsibility',
  reason: 'FDA technical rejection notice: Ack3 failed', evidenceDocumentId: NOTICE,
  authenticationMethod: 'password+totp', secondFactorVerified: true, ipAddress: '10.0.0.7',
  reauthVerifiedAt: REAUTH_AT, ...over,
});
const writes = () => lockQuery.mock.calls.map(([sql]) => sql).filter((sql) => /^\s*(INSERT|UPDATE)/i.test(sql));
/** The metadata written under the lock, parsed. */
const writtenMetadata = () => {
  const call = lockQuery.mock.calls.find(([sql]) => /^UPDATE c2c_submission_packages/.test(sql));
  return JSON.parse(String(call?.[1]?.[1]));
};
async function refused(code: string, over: Record<string, unknown> = {}) {
  const err = await reject(over).then(() => null, (e: unknown) => e);
  expect(err, `refused with ${code}`).toBeInstanceOf(FiledSequenceRejectionRefusal);
  expect((err as FiledSequenceRejectionRefusal).code).toBe(code);
  expect(writes(), 'a refusal writes nothing').toEqual([]);
  expect(ledger).not.toHaveBeenCalled();
  expect(persistSignature).not.toHaveBeenCalled();
  return err as FiledSequenceRejectionRefusal;
}

beforeEach(() => {
  db.owner = [{ package_id: 5, package_db_id: 5 }];
  db.metadata = { filedSequences: [entry('0000', 1), entry('0001', 2)] };
  db.transmittal = { status: 'received', package_id: 5, bundle_sha256: sha('0001') };
  db.vault = [{ id: NOTICE, content_hash: NOTICE_SHA, created_by: 777 }];
  lockQuery.mockClear();
  vi.mocked(pool.query).mockClear();
  vi.mocked(pool.connect).mockClear();
  ledger.mockReset();
  ledger.mockResolvedValue({ actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'chain_1' });
  persistSignature.mockReset();
  persistSignature.mockResolvedValue({ id: 31, signedAt: new Date('2026-10-01T00:00:00Z') });
});

describe('which filing a technical rejection takes off file', () => {
  it('is keyed on the transmittal: an entry naming another transmittal is never matched, even with the same bytes', async () => {
    db.transmittal = { status: 'received', package_id: 5, bundle_sha256: sha('0001') };
    const err = await refused('TRANSMITTAL_NOT_ON_FILE', { transmittalId: 3 });
    expect(err.details).toEqual({ transmittalId: 3, alreadyRecorded: false });
  });

  it('an entry that names no transmittal (an older history) is matched by the bundle digest, in any case', async () => {
    db.metadata = { filedSequences: [entry('0000', 1), entry('0001', null)] };
    db.transmittal = { status: 'received', package_id: 5, bundle_sha256: sha('0001').toUpperCase() };
    expect((await reject()).sequence).toBe('0001');
    db.transmittal = { status: 'received', package_id: 5, bundle_sha256: 'f'.repeat(64) };
    lockQuery.mockClear();
    ledger.mockClear();
    persistSignature.mockClear();
    await refused('TRANSMITTAL_NOT_ON_FILE');
  });

  it('a rejection already recorded is not recorded twice', async () => {
    db.metadata = { filedSequences: [entry('0000', 1), rejectedEntry('0001', 2)] };
    const err = await refused('TRANSMITTAL_NOT_ON_FILE');
    expect(err.message).toMatch(/already recorded/);
    expect(err.details.alreadyRecorded).toBe(true);
  });

  it('only the latest sequence on file: one with a later sequence on file is refused, naming it', async () => {
    db.transmittal = { status: 'received', package_id: 5, bundle_sha256: sha('0000') };
    const err = await refused('NOT_LATEST_FILED_SEQUENCE', { transmittalId: 1 });
    expect(err.httpStatus).toBe(409);
    expect(err.details).toEqual({ transmittalId: 1, sequence: '0000', later: [{ sequence: '0001', transmittalId: 2 }] });
    expect(err.message).toMatch(/Sequence 0001 \(transmittal 2\) is on file after 0000/);
  });

  it('a later sequence already taken off file does not hold the earlier one', async () => {
    db.metadata = { filedSequences: [entry('0000', 1), rejectedEntry('0001', 2)] };
    db.transmittal = { status: 'ack2_received', package_id: 5, bundle_sha256: sha('0000') };
    expect((await reject({ transmittalId: 1 })).sequence).toBe('0000');
  });
});

describe('what the transmittal’s status allows', () => {
  it.each(['ack3_received', 'validation_passed', 'review_started', 'response_required', 'completed'])(
    'a transmittal at %s records the agency accepting it, and is refused',
    async (status) => {
      db.transmittal = { status, package_id: 5, bundle_sha256: sha('0001') };
      expect((await refused('TRANSMITTAL_RECORDS_ACCEPTANCE')).details).toEqual({ transmittalId: 2, status });
    },
  );

  it.each([
    ['in_transit', 'validation_failed'], ['received', 'validation_failed'],
    ['ack1_received', 'validation_failed'], ['ack2_received', 'validation_failed'],
    ['validation_failed', 'validation_failed'], ['rolled_back', 'rolled_back'], ['pending', 'pending'],
  ])('a transmittal at %s is left at %s, with the rejection on its metadata', async (previous, current) => {
    db.transmittal = { status: previous, package_id: 5, bundle_sha256: sha('0001') };
    expect((await reject()).transmittalStatus).toEqual({ previous, current });
    const update = lockQuery.mock.calls.find(([sql]) => /^\s*UPDATE submission_transmittals/.test(sql))!;
    const [, , status, errorClass, errorMessage, technicalRejection] = update[1] as unknown[];
    expect(status).toBe(current);
    expect(errorClass).toBe(previous === current ? null : 'validation');
    expect(errorMessage).toBe(previous === current ? null : 'Technical rejection recorded: the agency did not load sequence 0001.');
    expect(JSON.parse(String(technicalRejection))).toMatchObject({ sequence: '0001', transmittalStatus: { previous, current } });
  });
});

describe('refusals before the lock, and the evidence', () => {
  it.each([['no', undefined], ['an invalid', new Date('not a date')]])(
    'a caller that hands in %s re-authentication time is refused before anything is read',
    async (_what, reauthVerifiedAt) => {
      await expect(reject({ reauthVerifiedAt })).rejects.toThrow(/re-authentication/);
      expect(pool.query).not.toHaveBeenCalled();
      expect(pool.connect).not.toHaveBeenCalled();
    },
  );

  it('a transmittal that is not this organization’s is not found, and no lock is taken', async () => {
    db.owner = [];
    expect((await refused('TRANSMITTAL_NOT_FOUND')).httpStatus).toBe(404);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('a transmittal that sent no package is not this action’s', async () => {
    db.owner = [{ package_id: null, package_db_id: null }];
    expect((await refused('NOT_A_PACKAGE_TRANSMITTAL')).httpStatus).toBe(422);
  });

  it('the evidence is read from this organization’s Vault, held FOR SHARE; a document it does not hold is refused', async () => {
    db.vault = [];
    expect((await refused('EVIDENCE_NOT_FOUND')).httpStatus).toBe(422);
    const read = lockQuery.mock.calls.find(([sql]) => /FROM vault\.documents/.test(sql))!;
    expect(read[0]).toMatch(/organization_id = \$2 AND deleted_at IS NULL\s+FOR SHARE/);
    expect(read[1]).toEqual([NOTICE, 99]);
  });

  it('an evidence id that is not a Vault document id is refused without a lookup', async () => {
    await refused('EVIDENCE_NOT_FOUND', { evidenceDocumentId: 'fda-notice.pdf' });
    expect(lockQuery.mock.calls.some(([sql]) => /vault\.documents/.test(sql))).toBe(false);
  });
});

describe('what it writes', () => {
  it('one governed sign, and a signature bound to the notice that names the sequence, transmittal and evidence', async () => {
    await reject();
    expect(ledger).toHaveBeenCalledTimes(1);
    expect(ledger.mock.calls[0][1]).toMatchObject({
      orgId: 99, userId: 777, command: 'sign', target: 'submission:5', reason: 'FDA technical rejection notice: Ack3 failed',
      payload: {
        meaning: 'responsibility', change: 'filed-sequence-rejected', sequence: '0001', transmittalId: 2,
        bundleSha256: sha('0001'), evidence: { vaultDocumentId: NOTICE, contentSha256: NOTICE_SHA }, staleBundleCleared: null,
      },
    });
    expect(persistSignature.mock.calls[0][1]).toMatchObject({
      orgId: 99, userId: 777, target: 'submission:5', payload: { meaning: 'responsibility' },
      actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'chain_1',
      authenticationMethod: 'password+totp', secondFactorVerified: true, ipAddress: '10.0.0.7',
      binding: { digest: NOTICE_SHA, basis: 'vault-document-version-sha256', note: expect.stringContaining(NOTICE) },
      extraManifest: { sequence: '0001', transmittalId: 2, evidenceDocumentId: NOTICE, reauthVerifiedAt: REAUTH_AT.toISOString() },
      manifestKind: 'governed-filed-sequence-rejection', command: 'sign',
    });
  });

  it('the entry it marks is one the shared predicate takes off file, and the reader skips', async () => {
    await reject();
    const written = writtenMetadata();
    expect(written.filedSequences).toHaveLength(2);
    expect(isRejectedFiling(written.filedSequences[1])).toBe(true);
    expect(readFiledSequences(written).map((f) => f.sequence)).toEqual(['0000']);
  });

  it('only a stored bundle planned ABOVE the rejected sequence is cleared', async () => {
    db.metadata = { ...db.metadata, bundle: { sequence: '0001', sha256: 'e'.repeat(64) }, preflight: { errorCount: 0 } };
    expect((await reject()).staleBundleCleared).toBeNull();
    expect(writtenMetadata()).toMatchObject({ bundle: { sequence: '0001' }, preflight: { errorCount: 0 } });
  });

  it('a signature id the reader would not honour is never written', async () => {
    persistSignature.mockResolvedValueOnce({ id: 'sig-31', signedAt: new Date() });
    await expect(reject()).rejects.toThrow(/signature id could not be read/);
    expect(writes()).toEqual([]);
  });
});
