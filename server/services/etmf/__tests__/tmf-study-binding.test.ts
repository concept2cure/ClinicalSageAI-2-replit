/**
 * A TMF belongs to a study of a project (eTMF convergence E2, P-75).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `tmf_artifact_filings.trial_id` was free text a person typed, bound to
 * nothing: the service read and wrote any trial name for any member of the
 * organization, and the only project check it made was on the Vault document a
 * filing happened to reference.
 *
 * ── What is held here ────────────────────────────────────────────────────────
 * The trial a caller names is looked up as a study of the caller's own
 * organization by its own id string; the caller is admitted to the study's
 * project by the Vault's rule (a read by current-program-access, a write by
 * vault-write-authority on the writer's transaction); anything else is
 * STUDY_NOT_FOUND and no filing is read or written. A filing stores the study.
 * A Vault document must be the study's project's.
 *
 * The service is real. The database is a statement recorder, and the two
 * admission functions are doubles: what they decide is proved on PostgreSQL in
 * tests/db/etmf-study-binding.dbtest.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const S = vi.hoisted(() => ({
  statements: [] as Array<{ sql: string; params: unknown[] }>,
  study: null as Record<string, unknown> | null,
  documents: [] as Array<Record<string, unknown>>,
  filing: null as Record<string, unknown> | null,
  /** What the study's live filings read answers. */
  filings: [] as Array<Record<string, unknown>>,
  filingsRead: 0,
  read: vi.fn(),
  write: vi.fn(),
  logAction: vi.fn(),
  writeChainedAuditRow: vi.fn(),
}));

vi.mock('../../../db', () => {
  const run = async (sql: string, params: unknown[] = []) => {
    S.statements.push({ sql, params });
    if (/FROM cdisc_prm_studies/.test(sql)) return { rows: S.study ? [S.study] : [] };
    if (/FROM vault\.documents/.test(sql)) return { rows: S.documents };
    if (/INSERT INTO tmf_artifact_filings/.test(sql)) {
      return { rows: [{ id: 'f-1', organization_id: params[0], trial_id: params[1], artifact_code: params[2], zone_number: params[3],
        document_ref: params[4], created_by: params[5], study_ref: params[6], filed_at: new Date(), updated_at: new Date(),
        removed_at: null, removed_by: null, removal_reason: null }] };
    }
    if (/FROM tmf_artifact_filings/.test(sql)) return { rows: S.filing ? [S.filing] : [] };
    return { rows: [] };
  };
  // The canonical transaction() of server/db, over the same recorder.
  const transaction = async <T>(work: (client: { query: typeof run }) => Promise<T>): Promise<T> => {
    await run('BEGIN');
    try {
      const out = await work({ query: run });
      await run('COMMIT');
      return out;
    } catch (err) {
      await run('ROLLBACK');
      throw err;
    }
  };
  return {
    pool: { query: run },
    transaction,
    db: { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => { S.filingsRead += 1; return S.filings; } }) }) }) },
  };
});
vi.mock('../../auditService', () => ({ default: { logAction: S.logAction }, writeChainedAuditRow: S.writeChainedAuditRow }));
vi.mock('../../c2c/current-program-access', () => {
  class ProgramReadAccessError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
  }
  return { ProgramReadAccessError, requireCurrentProgramAccess: S.read };
});
vi.mock('../../vault/vault-write-authority', () => ({ requireCurrentVaultProgramWrite: S.write }));

import {
  getTrialTmfCompleteness,
  listTmfArtifacts,
  recordTmfArtifactFiling,
  removeTmfArtifactFiling,
} from '../tmf-artifact-persistence';
import { ProgramReadAccessError } from '../../c2c/current-program-access';

const CTX = { organizationId: 7, userId: 5 };
const REASON = 'Filed for the unit proof.';
const STUDY = { id: 41, study_id: 'STUDY-1', program_id: 'prog-1', protocol_id: 'P-001', protocol_title: 'A study',
  study_phase: 'Phase II', indication: 'Hypertension', protocol_status: 'draft' };
const FILING_ID = '11111111-2222-4333-8444-555555555555';
const refusal = (status: number, code: string) => new (ProgramReadAccessError as any)(status, code, `refused: ${code}`);
const sqlOf = () => S.statements.map((s) => s.sql);
const changesAFiling = (sql: string) => /^\s*(INSERT INTO|UPDATE|DELETE FROM) tmf_artifact_filings/.test(sql);

beforeEach(() => {
  S.statements.length = 0;
  S.study = { ...STUDY };
  S.documents = [{ id: 'doc-1' }];
  S.filing = null;
  S.filings = [];
  S.filingsRead = 0;
  S.read.mockReset().mockResolvedValue({});
  S.write.mockReset().mockResolvedValue({});
  S.logAction.mockReset().mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
  S.writeChainedAuditRow.mockReset().mockResolvedValue(undefined);
});

describe('the trial a caller names is a study of their organization', () => {
  it('is looked up by its own id string, within the caller\'s organization', async () => {
    await listTmfArtifacts('STUDY-1', CTX);
    const lookup = S.statements[0];
    expect(lookup.sql).toMatch(/FROM cdisc_prm_studies s\s+WHERE s\.study_id = \$1 AND s\.tenant_id = \$2/);
    expect(lookup.params).toEqual(['STUDY-1', 7]);
  });

  it('admits a read by the Vault\'s project read rule, for the study\'s own project', async () => {
    await listTmfArtifacts('STUDY-1', CTX);
    expect(S.read).toHaveBeenCalledWith(expect.anything(), { organizationId: 7, userId: 5, programId: 'prog-1' });
    expect(S.write).not.toHaveBeenCalled();
    expect(S.filingsRead).toBe(1);
  });

  it('admits a write by the Vault\'s write rule, inside the writer\'s transaction', async () => {
    await recordTmfArtifactFiling({ trialId: 'STUDY-1', artifactCode: 'protocol', documentRef: 'vault://doc-1', reason: REASON }, CTX);
    expect(S.write).toHaveBeenCalledWith(expect.anything(), { organizationId: 7, userId: 5, programId: 'prog-1' });
    expect(S.read).not.toHaveBeenCalled();
    const sql = sqlOf();
    const begin = sql.indexOf('BEGIN');
    const lookup = sql.findIndex((s) => /FROM cdisc_prm_studies/.test(s));
    const insert = sql.findIndex(changesAFiling);
    const commit = sql.indexOf('COMMIT');
    expect(begin).toBe(0);
    expect(lookup).toBeGreaterThan(begin);
    expect(insert).toBeGreaterThan(lookup);
    expect(commit).toBeGreaterThan(insert);
  });
});

describe('anything else is STUDY_NOT_FOUND, and no filing is read or written', () => {
  it('a name no study of the organization has', async () => {
    S.study = null;
    await expect(listTmfArtifacts('T-1', CTX)).rejects.toMatchObject({ code: 'STUDY_NOT_FOUND', status: 404 });
    await expect(getTrialTmfCompleteness('T-1', CTX)).rejects.toMatchObject({ code: 'STUDY_NOT_FOUND' });
    expect(S.read).not.toHaveBeenCalled();
    expect(S.filingsRead).toBe(0);
    expect(sqlOf().every((s) => /FROM cdisc_prm_studies/.test(s))).toBe(true);
  });

  it('a study that belongs to no project', async () => {
    S.study = { ...STUDY, program_id: null };
    await expect(listTmfArtifacts('STUDY-1', CTX)).rejects.toMatchObject({ code: 'STUDY_NOT_FOUND' });
    expect(S.read).not.toHaveBeenCalled();
    expect(S.filingsRead).toBe(0);
  });

  it('an empty name, or one longer than a study id can be, without asking the database', async () => {
    for (const name of ['', '   ', 'x'.repeat(101)]) {
      await expect(listTmfArtifacts(name, CTX)).rejects.toMatchObject({ code: 'STUDY_NOT_FOUND' });
    }
    expect(S.statements).toEqual([]);
  });

  it.each([[403, 'PROJECT_PERMISSION_DENIED'], [404, 'PROJECT_NOT_FOUND'], [409, 'PROJECT_ANCHOR_UNRESOLVED'], [403, 'PROJECT_ACTOR_ACCESS_DENIED']])(
    'a study in a project the caller cannot open (%i %s) is not disclosed', async (status, code) => {
      S.read.mockRejectedValue(refusal(status, code));
      await expect(listTmfArtifacts('STUDY-1', CTX)).rejects.toMatchObject({ code: 'STUDY_NOT_FOUND', status: 404 });
      await expect(getTrialTmfCompleteness('STUDY-1', CTX)).rejects.toMatchObject({ code: 'STUDY_NOT_FOUND' });
      expect(S.filingsRead).toBe(0);
    });

  it('a write to a study the caller cannot open writes nothing and rolls back', async () => {
    S.write.mockRejectedValue(refusal(403, 'PROJECT_PERMISSION_DENIED'));
    await expect(recordTmfArtifactFiling({ trialId: 'STUDY-1', artifactCode: 'protocol', documentRef: 'vault://doc-1', reason: REASON }, CTX))
      .rejects.toMatchObject({ code: 'STUDY_NOT_FOUND' });
    expect(sqlOf().some(changesAFiling)).toBe(false);
    expect(sqlOf()).toContain('ROLLBACK');
    expect(sqlOf()).not.toContain('COMMIT');
    expect(S.logAction).not.toHaveBeenCalled();
    expect(S.writeChainedAuditRow).not.toHaveBeenCalled();
  });
});

describe('a check that could not run is an error with a code, never "not found"', () => {
  it('answers STUDY_ACCESS_UNAVAILABLE (503) when project access could not be verified', async () => {
    S.read.mockRejectedValue(refusal(503, 'PROJECT_ACCESS_UNAVAILABLE'));
    await expect(listTmfArtifacts('STUDY-1', CTX)).rejects.toMatchObject({ code: 'STUDY_ACCESS_UNAVAILABLE', status: 503 });
    expect(S.filingsRead).toBe(0);
  });

  it('a failed study lookup is thrown as it is, not turned into an empty TMF', async () => {
    S.study = null;
    const { pool } = await import('../../../db');
    const real = pool.query;
    (pool as any).query = async () => { throw new Error('connection reset'); };
    try {
      await expect(getTrialTmfCompleteness('STUDY-1', CTX)).rejects.toThrow(/connection reset/);
    } finally {
      (pool as any).query = real;
    }
  });

  it('tells a role that may read the Vault but not change it, in the Vault\'s own words', async () => {
    S.write.mockRejectedValue(refusal(403, 'VAULT_WRITE_ROLE_REQUIRED'));
    await expect(recordTmfArtifactFiling({ trialId: 'STUDY-1', artifactCode: 'protocol', reason: REASON }, CTX))
      .rejects.toMatchObject({ code: 'VAULT_WRITE_ROLE_REQUIRED', status: 403, message: 'refused: VAULT_WRITE_ROLE_REQUIRED' });
    expect(sqlOf().some(changesAFiling)).toBe(false);
  });
});

describe('a filing carries its study', () => {
  it('stores the study row id and the study\'s own id string', async () => {
    const filed = await recordTmfArtifactFiling({ trialId: ' STUDY-1 ', artifactCode: 'protocol', documentRef: 'vault://doc-1', reason: REASON }, CTX);
    const insert = S.statements.find((s) => /INSERT INTO tmf_artifact_filings/.test(s.sql))!;
    expect(insert.sql).toMatch(/study_ref/);
    expect(insert.params).toEqual([7, 'STUDY-1', 'protocol', 2, 'vault://doc-1', 5, 41]);
    expect(filed).toMatchObject({ studyRef: 41, trialId: 'STUDY-1', organizationId: 7, artifactCode: 'protocol' });
  });

  it('says which study a completeness answer is about, in the names the study list uses', async () => {
    const assessed = await getTrialTmfCompleteness('STUDY-1', CTX);
    expect(assessed.study).toEqual({ id: 41, studyId: 'STUDY-1', programId: 'prog-1', protocolId: 'P-001', title: 'A study',
      phase: 'Phase II', indication: 'Hypertension', status: 'draft' });
    expect(assessed.basis).toBe('verified_documents');
    expect(assessed.zones).toHaveLength(11);
  });
});

describe('a filing\'s Vault document is the study\'s project\'s', () => {
  it('looks the document up in the organization and in the study\'s project', async () => {
    await recordTmfArtifactFiling({ trialId: 'STUDY-1', artifactCode: 'protocol', documentRef: 'vault://doc-1', reason: REASON }, CTX);
    const lookup = S.statements.find((s) => /FROM vault\.documents/.test(s.sql))!;
    expect(lookup.sql).toMatch(/d\.organization_id = \$2 AND d\.deleted_at IS NULL/);
    expect(lookup.sql).toMatch(/d\.program_id::text = \$3/);
    expect(lookup.params).toEqual(['doc-1', 7, 'prog-1']);
  });

  it('refuses a document that is not there with DOCUMENT_NOT_IN_PROJECT (409), and writes nothing', async () => {
    S.documents = [];
    await expect(recordTmfArtifactFiling({ trialId: 'STUDY-1', artifactCode: 'protocol', documentRef: 'vault://doc-9', reason: REASON }, CTX))
      .rejects.toMatchObject({ code: 'DOCUMENT_NOT_IN_PROJECT', status: 409 });
    expect(sqlOf().some(changesAFiling)).toBe(false);
    expect(sqlOf()).toContain('ROLLBACK');
  });
});

describe('a filing is removed through its own study', () => {
  it('does not find a row that has no study, or an id that is not one', async () => {
    await expect(removeTmfArtifactFiling({ id: FILING_ID, reason: REASON }, CTX)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    const lookup = S.statements.find((s) => /FROM tmf_artifact_filings/.test(s.sql))!;
    expect(lookup.sql).toMatch(/study_ref IS NOT NULL/);
    expect(lookup.params).toEqual([FILING_ID, 7]);
    expect(S.write).not.toHaveBeenCalled();
    S.statements.length = 0;
    await expect(removeTmfArtifactFiling({ id: 'not-a-uuid', reason: REASON }, CTX)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(S.statements).toEqual([]);
  });

  it('asks the Vault\'s write rule about the filing\'s study, and changes nothing when it refuses', async () => {
    S.filing = { id: FILING_ID, study_ref: 41, artifact_code: 'protocol', document_ref: 'vault://doc-1' };
    S.write.mockRejectedValue(refusal(403, 'PROJECT_PERMISSION_DENIED'));
    await expect(removeTmfArtifactFiling({ id: FILING_ID, reason: REASON }, CTX)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    const study = S.statements.find((s) => /FROM cdisc_prm_studies/.test(s.sql))!;
    expect(study.sql).toMatch(/WHERE s\.id = \$1 AND s\.tenant_id = \$2/);
    expect(study.params).toEqual([41, 7]);
    expect(S.write).toHaveBeenCalledWith(expect.anything(), { organizationId: 7, userId: 5, programId: 'prog-1' });
    expect(sqlOf().some(changesAFiling)).toBe(false);
  });
});

describe('the list says what each filing\'s document is (E3b)', () => {
  const listed = (artifactCode: string, documentRef: string | null) => ({ id: `f-${artifactCode}`, organizationId: 7, trialId: 'STUDY-1',
    artifactCode, zoneNumber: 2, documentRef, studyRef: 41, removedAt: null });
  const lookups = () => S.statements.filter((s) => /FROM vault\.documents/.test(s.sql));

  it('names the document of each Vault reference: id, title, version and whether it is the current version', async () => {
    S.filings = [listed('protocol', 'vault://doc-1'), listed('sap', ' vault://doc-2 ')];
    S.documents = [
      { id: 'doc-1', document_title: 'Protocol v1', file_name: 'protocol.pdf', version: '1.0', current: false },
      { id: 'doc-2', document_title: 'Statistical analysis plan', file_name: 'sap.pdf', version: '3.0', current: true },
    ];
    const rows = await listTmfArtifacts('STUDY-1', CTX);
    expect(rows.map((r) => [r.artifactCode, r.document])).toEqual([
      ['protocol', { id: 'doc-1', title: 'Protocol v1', version: '1.0', current: false }],
      ['sap', { id: 'doc-2', title: 'Statistical analysis plan', version: '3.0', current: true }],
    ]);
    // The filing's own fields are as they were.
    expect(rows[0]).toMatchObject({ id: 'f-protocol', documentRef: 'vault://doc-1', studyRef: 41 });
  });

  it('reads the documents once for the whole list, in the organization and the study\'s project', async () => {
    S.filings = [listed('protocol', 'vault://doc-1'), listed('sap', 'vault://doc-2'), listed('sample_crf', 'vault://doc-1'),
      listed('sample_icf', 'https://sponsor.example/icf.pdf'), listed('insurance', null)];
    S.documents = [{ id: 'doc-1', document_title: 'One', file_name: null, version: '1.0', current: true }];
    await listTmfArtifacts('STUDY-1', CTX);
    expect(lookups()).toHaveLength(1);
    const [lookup] = lookups();
    expect(lookup.params).toEqual([['doc-1', 'doc-2'], 7, 'prog-1']);
    expect(lookup.sql).toMatch(/d\.id::text = ANY\(\$1::text\[\]\)/);
    expect(lookup.sql).toMatch(/d\.organization_id = \$2 AND d\.deleted_at IS NULL/);
    expect(lookup.sql).toMatch(/d\.program_id::text = \$3/);
    expect(lookup.sql).toMatch(/rp\.organization_id = \$2/);
    // "current" is the Vault's one link rule, written out: no live successor in the same family.
    expect(lookup.sql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM vault\.documents succ\s+WHERE succ\.supersedes_id = d\.id\s+AND succ\.program_id = d\.program_id\s+AND succ\.document_code IS NOT DISTINCT FROM d\.document_code\s+AND succ\.organization_id = d\.organization_id\s+AND succ\.deleted_at IS NULL/);
    // No value is written into the statement's text.
    expect(lookup.sql).not.toMatch(/doc-1|prog-1/);
  });

  it('gives null, never a guessed title, for a reference that names no live document of the project', async () => {
    S.filings = [listed('protocol', 'vault://doc-gone'), listed('sap', 'vault://doc-1'), listed('sample_icf', 'https://sponsor.example/icf.pdf'),
      listed('insurance', null), listed('sample_crf', 'vault://STUDY-1/sample_crf'), listed('tmf_plan', '   ')];
    S.documents = [{ id: 'doc-1', document_title: 'One', file_name: 'one.pdf', version: '1.0', current: true }];
    const rows = await listTmfArtifacts('STUDY-1', CTX);
    expect(Object.fromEntries(rows.map((r) => [r.artifactCode, r.document]))).toEqual({
      protocol: null, sap: { id: 'doc-1', title: 'One', version: '1.0', current: true }, sample_icf: null, insurance: null, sample_crf: null, tmf_plan: null,
    });
    // Every listed filing carries the field, so a client never reads "absent" as "not asked".
    expect(rows.every((r) => 'document' in r)).toBe(true);
  });

  it('asks the Vault nothing when no filing holds a Vault reference', async () => {
    S.filings = [listed('protocol', 'https://sponsor.example/p.pdf'), listed('insurance', null)];
    const rows = await listTmfArtifacts('STUDY-1', CTX);
    expect(lookups()).toEqual([]);
    expect(rows.map((r) => r.document)).toEqual([null, null]);
    expect(await listTmfArtifacts('STUDY-1', CTX).then(() => S.filingsRead)).toBe(2);
  });

  it('takes the file name when the document has no title, and null when it has neither', async () => {
    S.filings = [listed('protocol', 'vault://doc-1'), listed('sap', 'vault://doc-2'), listed('sample_crf', 'vault://doc-3')];
    S.documents = [
      { id: 'doc-1', document_title: '   ', file_name: 'protocol-v1.pdf', version: '1.0', current: true },
      { id: 'doc-2', document_title: null, file_name: null, version: null, current: true },
      { id: 'doc-3', document_title: 'Sample CRF', file_name: 'crf.pdf', version: '', current: 'unexpected' },
    ];
    const rows = await listTmfArtifacts('STUDY-1', CTX);
    expect(rows.map((r) => r.document)).toEqual([
      { id: 'doc-1', title: 'protocol-v1.pdf', version: '1.0', current: true },
      { id: 'doc-2', title: null, version: null, current: true },
      // "current" is true only when the database said true.
      { id: 'doc-3', title: 'Sample CRF', version: null, current: false },
    ]);
  });

  it('throws a failed document read: an error is not "no document"', async () => {
    S.filings = [listed('protocol', 'vault://doc-1')];
    const { pool } = await import('../../../db');
    const real = pool.query;
    (pool as any).query = async (sql: string, params?: unknown[]) => {
      if (/FROM vault\.documents/.test(sql)) throw new Error('connection reset');
      return real(sql, params as never);
    };
    try {
      await expect(listTmfArtifacts('STUDY-1', CTX)).rejects.toThrow(/connection reset/);
    } finally {
      (pool as any).query = real;
    }
  });

  it('names no document for a study the caller cannot open: nothing is read', async () => {
    S.filings = [listed('protocol', 'vault://doc-1')];
    S.read.mockRejectedValue(refusal(403, 'PROJECT_PERMISSION_DENIED'));
    await expect(listTmfArtifacts('STUDY-1', CTX)).rejects.toMatchObject({ code: 'STUDY_NOT_FOUND' });
    expect(lookups()).toEqual([]);
    expect(S.filingsRead).toBe(0);
  });
});
