/**
 * Filing and removing a TMF artifact are governed acts (eTMF convergence E3).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * A filing was committed and then its audit row was attempted, on another
 * connection, without the document it referenced (`recordAuditRow` after the
 * write): an audit outage left a filing with no record, and the route said so
 * in a header and carried on. A removal was a DELETE, with no reason. Neither
 * act asked the person why.
 *
 * ── What is held here ────────────────────────────────────────────────────────
 * Each act needs a reason of at least 8 characters before anything is read.
 * The audit row is written through the chained writer on the transaction's own
 * client, after the change and before COMMIT, and a failed audit write rolls
 * the change back. Its details name the study, the artifact, the document and
 * what the row held before. A removal is an UPDATE that marks the row; no
 * statement of this service deletes a filing.
 *
 * The service is real. The database is a statement recorder holding one row,
 * and the audit writer is a double: the real chain, and that the two rows share
 * one transaction, are proved on PostgreSQL in
 * tests/db/etmf-governed-filing.dbtest.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const S = vi.hoisted(() => ({
  statements: [] as Array<{ sql: string; params: unknown[]; client: unknown }>,
  /** The one stored row of (organization, study, artifact), or null. */
  stored: null as Record<string, unknown> | null,
  txClient: { name: 'the transaction client' } as Record<string, unknown>,
  write: vi.fn(),
  audit: vi.fn(),
  logAction: vi.fn(),
}));

vi.mock('../../../db', () => {
  const STUDY = { id: 41, study_id: 'STUDY-1', program_id: 'prog-1', protocol_id: 'P-001', protocol_title: 'A study',
    study_phase: 'Phase II', indication: 'Hypertension', protocol_status: 'draft' };
  const fresh = (params: unknown[]) => ({ id: '11111111-2222-4333-8444-555555555555', organization_id: params[0], trial_id: params[1],
    artifact_code: params[2], zone_number: params[3], document_ref: params[4], created_by: params[5], study_ref: params[6],
    filed_at: new Date('2026-11-10T09:00:00Z'), updated_at: new Date('2026-11-10T09:00:00Z'), removed_at: null, removed_by: null, removal_reason: null });
  const run = (client: unknown) => async (sql: string, params: unknown[] = []) => {
    S.statements.push({ sql, params, client });
    if (/FROM cdisc_prm_studies/.test(sql)) return { rows: [STUDY] };
    if (/FROM vault\.documents/.test(sql)) return { rows: [{ id: 'doc' }] };
    if (/^\s*INSERT INTO tmf_artifact_filings/.test(sql)) {
      if (S.stored) return { rows: [] }; // ON CONFLICT DO NOTHING
      S.stored = fresh(params);
      return { rows: [S.stored] };
    }
    if (/^\s*UPDATE tmf_artifact_filings\s+SET document_ref/.test(sql)) {
      S.stored = { ...S.stored, document_ref: params[1], zone_number: params[2], study_ref: params[3],
        removed_at: null, removed_by: null, removal_reason: null };
      return { rows: [S.stored] };
    }
    if (/^\s*UPDATE tmf_artifact_filings\s+SET removed_at/.test(sql)) {
      if (!S.stored || S.stored.removed_at) return { rows: [] };
      S.stored = { ...S.stored, removed_at: new Date('2026-11-10T10:00:00Z'), removed_by: params[2], removal_reason: params[3] };
      return { rows: [S.stored] };
    }
    if (/FROM tmf_artifact_filings/.test(sql)) {
      const live = /removed_at IS NULL/.test(sql);
      return { rows: S.stored && !(live && S.stored.removed_at) ? [S.stored] : [] };
    }
    return { rows: [] };
  };
  const tx = run(S.txClient);
  S.txClient.query = tx;
  // The canonical transaction() of server/db, over the same recorder.
  const transaction = async <T>(work: (client: unknown) => Promise<T>): Promise<T> => {
    await tx('BEGIN');
    try {
      const out = await work(S.txClient);
      await tx('COMMIT');
      return out;
    } catch (err) {
      await tx('ROLLBACK');
      throw err;
    }
  };
  return { pool: { query: run('the pool') }, transaction, db: {} };
});
vi.mock('../../auditService', () => ({ default: { logAction: S.logAction }, writeChainedAuditRow: S.audit }));
vi.mock('../../c2c/current-program-access', () => {
  class ProgramReadAccessError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
  }
  return { ProgramReadAccessError, requireCurrentProgramAccess: vi.fn() };
});
vi.mock('../../vault/vault-write-authority', () => ({ requireCurrentVaultProgramWrite: S.write }));

import { recordTmfArtifactFiling, removeTmfArtifactFiling } from '../tmf-artifact-persistence';

const CTX = { organizationId: 7, userId: 5, ipAddress: '203.0.113.9', userAgent: 'unit-proof' };
const FILING_ID = '11111111-2222-4333-8444-555555555555';
const WHY = 'Signed protocol received from the sponsor.';
const sqlOf = () => S.statements.map((s) => s.sql.trim());
/** File 'protocol' for the study. With no second argument the reason is WHY; a second argument is the reason as given, `undefined` included. */
const file = (documentRef: string | null, ...given: [unknown?]) =>
  recordTmfArtifactFiling({ trialId: 'STUDY-1', artifactCode: 'protocol', documentRef, reason: given.length ? given[0] : WHY }, CTX);
/** The entry handed to the chained audit writer on its nth call, and the client it was handed on. */
const auditCall = (n = 0) => ({ client: S.audit.mock.calls[n][0], entry: S.audit.mock.calls[n][1] });

beforeEach(() => {
  S.statements.length = 0;
  S.stored = null;
  S.write.mockReset().mockResolvedValue({});
  S.audit.mockReset().mockResolvedValue(undefined);
  S.logAction.mockReset();
});

describe('a reason is required before anything is read', () => {
  it.each([[undefined], [null], [''], ['   '], ['1234567'], ['  short  '], [12345678], [{ text: 'an object is not a reason' }]])(
    'refuses a filing whose reason is %j', async (reason) => {
      await expect(file('vault://doc', reason)).rejects.toMatchObject({ code: 'REASON_REQUIRED', status: 400 });
      expect(S.statements).toEqual([]);
      expect(S.audit).not.toHaveBeenCalled();
    });

  it('refuses a removal with no reason, without looking the filing up', async () => {
    S.stored = { id: FILING_ID, study_ref: 41, artifact_code: 'protocol', zone_number: 2, document_ref: 'vault://doc', removed_at: null };
    for (const reason of [undefined, '', 'short', 7]) {
      await expect(removeTmfArtifactFiling({ id: FILING_ID, reason }, CTX)).rejects.toMatchObject({ code: 'REASON_REQUIRED', status: 400 });
    }
    expect(S.statements).toEqual([]);
    expect(S.stored.removed_at).toBeNull();
  });

  it('takes a reason of exactly 8 characters, trimmed, and never one it composed', async () => {
    await file('vault://doc', '  12345678  ');
    expect(auditCall().entry.reason).toBe('12345678');
    expect(auditCall().entry.details.reason).toBe('12345678');
  });

  it('still refuses an unknown artifact code first', async () => {
    await expect(recordTmfArtifactFiling({ trialId: 'STUDY-1', artifactCode: 'NOT-A-CODE', reason: undefined }, CTX))
      .rejects.toMatchObject({ code: 'UNKNOWN_ARTIFACT' });
  });
});

describe('the audit row is written by the change\'s own transaction', () => {
  it('goes through the chained writer, on the transaction client, after the write and before COMMIT', async () => {
    S.audit.mockImplementation(async () => { S.statements.push({ sql: 'AUDIT ROW', params: [], client: S.txClient }); });
    const filed = await file('vault://doc');
    expect(S.audit).toHaveBeenCalledTimes(1);
    expect(auditCall().client).toBe(S.txClient);
    const sql = sqlOf();
    const insert = sql.findIndex((s) => s.startsWith('INSERT INTO tmf_artifact_filings'));
    expect(sql[0]).toBe('BEGIN');
    expect(sql.indexOf('AUDIT ROW')).toBeGreaterThan(insert);
    expect(sql.indexOf('COMMIT')).toBe(sql.indexOf('AUDIT ROW') + 1);
    // Every statement of the write ran on that one client: nothing went to the pool.
    expect(S.statements.every((s) => s.client === S.txClient)).toBe(true);
    // The old ancillary writer is not used: there is no second, after-commit attempt.
    expect(S.logAction).not.toHaveBeenCalled();
    expect(filed.auditTrail).toEqual({ persisted: true, chained: true });
  });

  it('names the study, the artifact, the document, the reason and who asked from where', async () => {
    await file('  vault://doc  ');
    expect(auditCall().entry).toMatchObject({
      tenantId: 7, userId: 5, action: 'TMF_ARTIFACT_FILED', resourceType: 'tmf_artifact', resourceId: FILING_ID,
      reason: WHY, ipAddress: '203.0.113.9', userAgent: 'unit-proof',
      details: { study: { id: 41, studyId: 'STUDY-1', protocolId: 'P-001', title: 'A study' }, programId: 'prog-1',
        artifactCode: 'protocol', zone: 2, documentRef: 'vault://doc', outcome: 'filed', reason: WHY },
    });
    expect(auditCall().entry.details).not.toHaveProperty('replacedDocumentRef');
  });

  it('writes no filing when its audit row cannot be written', async () => {
    S.audit.mockRejectedValue(new Error('audit chain unavailable'));
    await expect(file('vault://doc')).rejects.toThrow(/audit chain unavailable/);
    expect(sqlOf()).toContain('ROLLBACK');
    expect(sqlOf()).not.toContain('COMMIT');
  });

  it('removes no filing when its audit row cannot be written', async () => {
    await file('vault://doc');
    S.statements.length = 0;
    S.audit.mockRejectedValue(new Error('audit chain unavailable'));
    await expect(removeTmfArtifactFiling({ id: FILING_ID, reason: 'Filed against the wrong study.' }, CTX)).rejects.toThrow(/audit chain unavailable/);
    expect(sqlOf()).toContain('ROLLBACK');
    expect(sqlOf()).not.toContain('COMMIT');
  });
});

describe('a re-file says what it replaced', () => {
  it('names the document it replaced, read under the row\'s lock', async () => {
    await file('vault://first');
    S.statements.length = 0;
    await file('vault://second', 'Amendment 1 supersedes the first protocol.');
    const sql = sqlOf();
    const held = sql.findIndex((s) => /FROM tmf_artifact_filings[\s\S]*FOR UPDATE$/.test(s));
    const update = sql.findIndex((s) => s.startsWith('UPDATE tmf_artifact_filings'));
    expect(held).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(held);
    expect(auditCall(1).entry.details).toMatchObject({ outcome: 'refiled', documentRef: 'vault://second', replacedDocumentRef: 'vault://first' });
    expect(auditCall(1).entry.resourceId).toBe(FILING_ID);
  });

  it('says so when the first filing had no document', async () => {
    await file(null);
    await file('vault://second');
    expect(auditCall(0).entry.details).toMatchObject({ outcome: 'filed', documentRef: null });
    expect(auditCall(1).entry.details).toMatchObject({ outcome: 'refiled', replacedDocumentRef: null });
  });

  it('says which removal a filing cleared, and that it replaced no live document', async () => {
    await file('vault://first');
    await removeTmfArtifactFiling({ id: FILING_ID, reason: 'Filed against the wrong study.' }, CTX);
    const refiled = await file('vault://second');
    expect(refiled).toMatchObject({ id: FILING_ID, removedAt: null, removedBy: null, removalReason: null, documentRef: 'vault://second' });
    const details = auditCall(2).entry.details;
    expect(details).toMatchObject({ outcome: 'filed_after_removal', documentRef: 'vault://second',
      clearedRemoval: { removedAt: '2026-11-10T10:00:00.000Z', removedBy: 5, reason: 'Filed against the wrong study.', documentRef: 'vault://first' } });
    expect(details).not.toHaveProperty('replacedDocumentRef');
    // The same row, cleared: the unique key never needed a second one.
    const clears = S.statements.find((s) => /^\s*UPDATE tmf_artifact_filings\s+SET document_ref/.test(s.sql))!;
    expect(clears.sql).toMatch(/removed_at = NULL, removed_by = NULL, removal_reason = NULL/);
  });

  it('says so when it takes the place of a row that had no study', async () => {
    S.stored = { id: FILING_ID, trial_id: 'STUDY-1', study_ref: null, document_ref: 'typed-by-hand', filed_at: new Date('2026-07-01T00:00:00Z'),
      removed_at: null, removed_by: null, removal_reason: null, organization_id: 7, artifact_code: 'protocol', zone_number: 2,
      created_by: 3, updated_at: new Date('2026-07-01T00:00:00Z') };
    const filed = await file('vault://doc');
    expect(filed.studyRef).toBe(41);
    expect(auditCall().entry.details).toMatchObject({ outcome: 'filed_over_unlinked',
      replacedUnlinkedFiling: { trialId: 'STUDY-1', documentRef: 'typed-by-hand', filedAt: '2026-07-01T00:00:00.000Z' } });
  });
});

describe('a removal marks the row and keeps it', () => {
  it('records who, why and what was filed, and deletes nothing', async () => {
    await file('vault://doc');
    S.statements.length = 0;
    const removed = await removeTmfArtifactFiling({ id: FILING_ID, reason: '  Filed against the wrong study.  ' }, CTX);
    expect(removed).toEqual({ id: FILING_ID, auditTrail: { persisted: true, chained: true } });
    const mark = S.statements.find((s) => /^\s*UPDATE tmf_artifact_filings\s+SET removed_at/.test(s.sql))!;
    expect(mark.sql).toMatch(/removed_at = now\(\), removed_by = \$3, removal_reason = \$4/);
    expect(mark.sql).toMatch(/AND removed_at IS NULL/);
    expect(mark.params).toEqual([FILING_ID, 7, 5, 'Filed against the wrong study.']);
    expect(S.stored).toMatchObject({ removed_by: 5, removal_reason: 'Filed against the wrong study.' });
    expect(auditCall(1)).toMatchObject({ client: S.txClient, entry: {
      tenantId: 7, userId: 5, action: 'TMF_ARTIFACT_REMOVED', resourceType: 'tmf_artifact', resourceId: FILING_ID,
      reason: 'Filed against the wrong study.',
      details: { study: { id: 41, studyId: 'STUDY-1' }, programId: 'prog-1', artifactCode: 'protocol', zone: 2,
        documentRef: 'vault://doc', reason: 'Filed against the wrong study.' } } });
    expect(sqlOf().indexOf('COMMIT')).toBe(sqlOf().length - 1);
  });

  it('does not find a filing that is already removed, and records nothing more', async () => {
    await file('vault://doc');
    await removeTmfArtifactFiling({ id: FILING_ID, reason: 'Filed against the wrong study.' }, CTX);
    await expect(removeTmfArtifactFiling({ id: FILING_ID, reason: 'Filed against the wrong study.' }, CTX))
      .rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(S.audit).toHaveBeenCalledTimes(2);
  });

  it('issues no DELETE against the filings table, on any path', async () => {
    await file('vault://first');
    await file('vault://second');
    await removeTmfArtifactFiling({ id: FILING_ID, reason: 'Filed against the wrong study.' }, CTX);
    await file('vault://third');
    expect(sqlOf().filter((s) => /\bDELETE\s+FROM\b/i.test(s))).toEqual([]);
    expect(sqlOf().filter((s) => /tmf_artifact_filings/.test(s)).length).toBeGreaterThan(6);
  });
});
