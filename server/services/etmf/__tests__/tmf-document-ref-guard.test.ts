/**
 * A TMF filing cannot reference a document that does not exist.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The eTMF surface's "File" button sent
 *
 *     documentRef: 'vault://' + trialId + '/' + artifactCode
 *
 * — a reference it MANUFACTURED from the two things it already knew. No
 * document was uploaded, none existed, and `tmf_artifact_filings` recorded the
 * essential document as filed against a location pointing at nothing. "File all
 * N" did it for every outstanding document in one click, which is how a trial
 * reached INSPECTION-READY without a single document having been filed.
 *
 * Inspection readiness is a verdict a sponsor acts on and an inspector audits.
 * A completeness roll-up computed from filings that reference no documents is a
 * false GCP record.
 *
 * ── Why the guard is in the SERVICE ─────────────────────────────────────────
 * The client is fixed too (it now uploads to the vault and files against the id
 * the vault returns). But a store that accepts any string as proof a document
 * exists will be lied to again by the next caller. The refusal belongs where
 * the record is written.
 *
 * ── 2026-11-10 (eTMF convergence E2) ────────────────────────────────────────
 * A filing belongs to a study of a project, so the document must be a live
 * document of THAT project: the lookup is bound to the organization and to the
 * study's project, and one refusal (DOCUMENT_NOT_IN_PROJECT) covers a document
 * that is absent, deleted, another project's or another organization's. The
 * separate check of the caller's access to the document's own project
 * (DOCUMENT_ACCESS_DENIED) is gone with it: the caller is admitted to the
 * study's project before the document is looked at, by the Vault's rule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const S = vi.hoisted(() => ({
  statements: [] as Array<{ sql: string; params: unknown[] }>,
  /** What the vault lookup answers: rows, or an error to throw. */
  vault: { rows: [] as Array<{ id: string }>, error: null as Error | null },
  write: vi.fn(),
  audit: vi.fn(),
  logAction: vi.fn(),
}));

vi.mock('../../../db', () => {
  const run = async (sql: string, params: unknown[] = []) => {
    S.statements.push({ sql, params });
    if (/FROM cdisc_prm_studies/.test(sql)) {
      return { rows: [{ id: 41, study_id: 'STUDY-1', program_id: 'study-program-id', protocol_id: 'P-1', protocol_title: 'A study' }] };
    }
    if (/FROM vault\.documents/.test(sql)) {
      if (S.vault.error) throw S.vault.error;
      return { rows: S.vault.rows };
    }
    if (/^\s*INSERT INTO tmf_artifact_filings/.test(sql)) {
      return { rows: [{ id: 'f-1', organization_id: params[0], trial_id: params[1], artifact_code: params[2], zone_number: params[3],
        document_ref: params[4], created_by: params[5], study_ref: params[6], filed_at: new Date(), updated_at: new Date() }] };
    }
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
  return { pool: { query: run }, transaction, db: {} };
});
vi.mock('../../auditService', () => ({ default: { logAction: S.logAction }, writeChainedAuditRow: S.audit }));
vi.mock('../../c2c/current-program-access', () => {
  class ProgramReadAccessError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) { super(message); }
  }
  return { ProgramReadAccessError, requireCurrentProgramAccess: vi.fn() };
});
vi.mock('../../vault/vault-write-authority', () => ({ requireCurrentVaultProgramWrite: S.write }));

import { recordTmfArtifactFiling, TmfArtifactError } from '../tmf-artifact-persistence';
import { getTmfReferenceModel } from '../tmf-completeness';
import { ProgramReadAccessError } from '../../c2c/current-program-access';

/** A real DIA TMF Reference Model code, so the artifact-code guard passes and
 *  the document-ref guard is what the test is actually exercising. */
const CODE = getTmfReferenceModel()[0].artifacts[0].code;
const CTX = { organizationId: 7, userId: 5 };
const WHY = 'Filed for the document reference proof.';
const file = (documentRef?: string) => recordTmfArtifactFiling({ trialId: 'STUDY-1', artifactCode: CODE, documentRef, reason: WHY }, CTX);
const wroteAFiling = () => S.statements.some((s) => /^\s*(INSERT INTO|UPDATE) tmf_artifact_filings/.test(s.sql));
const vaultLookups = () => S.statements.filter((s) => /FROM vault\.documents/.test(s.sql));

beforeEach(() => {
  S.statements.length = 0;
  S.vault = { rows: [], error: null };
  S.write.mockReset().mockResolvedValue({});
  S.audit.mockReset().mockResolvedValue(undefined);
  S.logAction.mockReset();
});

describe('a manufactured vault path is refused', () => {
  it('refuses the exact shape the surface used to send', async () => {
    await expect(file('vault://STUDY-1/' + CODE)).rejects.toThrow(TmfArtifactError);
    // Nothing was written. This is the whole point: the filing must not exist.
    expect(wroteAFiling()).toBe(false);
    expect(S.audit).not.toHaveBeenCalled();
    expect(S.logAction).not.toHaveBeenCalled();
    // Refused on its shape, before a transaction is opened or anything is read.
    expect(S.statements).toEqual([]);
  });

  it('says WHY, naming the path shape rather than a generic not-found', async () => {
    await expect(file('vault://T/' + CODE)).rejects.toThrow(/path built from the trial and artifact code/);
    await expect(file('vault://T/' + CODE)).rejects.toMatchObject({ code: 'UNRESOLVABLE_DOCUMENT_REF', status: 400 });
  });
});

describe('a vault id is verified against the store, in the study\'s project', () => {
  it('refuses an id that is no live document of the study\'s project', async () => {
    S.vault.rows = [];
    await expect(file('vault://abc-123')).rejects.toMatchObject({ code: 'DOCUMENT_NOT_IN_PROJECT', status: 409 });
    expect(wroteAFiling()).toBe(false);
    expect(S.audit).not.toHaveBeenCalled();
    expect(S.statements.map((s) => s.sql)).toContain('ROLLBACK');
  });

  it('does not say whether the document is absent or another project\'s: the answer does not carry the id', async () => {
    const refusal = await file('vault://abc-123').catch((err: Error) => err);
    expect((refusal as Error).message).not.toContain('abc-123');
  });

  it('accepts an id the study\'s project DOES hold, and writes the filing', async () => {
    S.vault.rows = [{ id: 'abc-123' }];
    await expect(file('vault://abc-123')).resolves.toBeTruthy();
    expect(wroteAFiling()).toBe(true);
    const [lookup] = vaultLookups();
    expect(lookup.sql).toMatch(/rp\.organization_id = \$2/);
    expect(lookup.sql).toMatch(/d\.deleted_at IS NULL/);
    expect(lookup.sql).toMatch(/d\.program_id::text = \$3/);
    // The id as given, the caller's organization, and the STUDY's project: not a project the document names.
    expect(lookup.params).toEqual(['abc-123', 7, 'study-program-id']);
    expect(S.write).toHaveBeenCalledWith(expect.anything(), { organizationId: 7, userId: 5, programId: 'study-program-id' });
  });

  it('looks at no document when the caller cannot write the study\'s project', async () => {
    S.vault.rows = [{ id: 'real-document' }];
    S.write.mockRejectedValueOnce(new (ProgramReadAccessError as any)(403, 'PROJECT_PERMISSION_DENIED', 'Private project.'));
    await expect(file('vault://real-document')).rejects.toMatchObject({ code: 'STUDY_NOT_FOUND' });
    expect(vaultLookups()).toEqual([]);
    expect(wroteAFiling()).toBe(false);
    expect(S.audit).not.toHaveBeenCalled();
  });

  it('refuses rather than waving the reference through when the vault schema is missing', async () => {
    // An unprovisioned store must not become a free pass — that is the exact
    // failure this guard exists to prevent.
    S.vault.error = Object.assign(new Error('no relation'), { code: '42P01' });
    await expect(file('vault://abc-123')).rejects.toThrow(/not provisioned/);
    expect(wroteAFiling()).toBe(false);
  });

  it('throws a failed lookup as it is: an error is not a verdict about the document', async () => {
    S.vault.error = new Error('connection reset');
    await expect(file('vault://abc-123')).rejects.toThrow(/connection reset/);
    expect(wroteAFiling()).toBe(false);
  });
});

describe('what is still allowed', () => {
  it('a filing with NO document reference — an honest "recorded, nothing attached"', async () => {
    await expect(file()).resolves.toBeTruthy();
    expect(vaultLookups()).toEqual([]);
    expect(wroteAFiling()).toBe(true);
  });

  it('a non-vault reference (an off-platform original this service cannot verify)', async () => {
    await expect(file('https://sponsor.example/archive/1571.pdf')).resolves.toBeTruthy();
    expect(vaultLookups()).toEqual([]);
  });

  it('still refuses an unknown artifact code before it looks at the reference', async () => {
    await expect(
      recordTmfArtifactFiling({ trialId: 'STUDY-1', artifactCode: 'NOT-A-CODE', documentRef: 'vault://abc', reason: WHY }, CTX),
    ).rejects.toThrow(/not a known TMF Reference Model artifact code/);
    expect(S.statements).toEqual([]);
  });
});
