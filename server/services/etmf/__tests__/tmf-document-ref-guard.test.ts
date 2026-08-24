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
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query, insertChain, logAction } = vi.hoisted(() => ({
  query: vi.fn(),
  insertChain: vi.fn(),
  logAction: vi.fn(),
}));

vi.mock('../../../db', () => ({
  pool: { query },
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            insertChain();
            return [{ id: 1, artifactCode: 'X', documentRef: null }];
          },
        }),
      }),
    }),
  },
}));
vi.mock('../../auditService', () => ({ default: { logAction } }));

import { recordTmfArtifactFiling, TmfArtifactError } from '../tmf-artifact-persistence';
import { getTmfReferenceModel } from '../tmf-completeness';

/** A real DIA TMF Reference Model code, so the artifact-code guard passes and
 *  the document-ref guard is what the test is actually exercising. */
const CODE = getTmfReferenceModel()[0].artifacts[0].code;
const CTX = { organizationId: 7, userId: 5 };

beforeEach(() => {
  query.mockReset();
  insertChain.mockReset();
  logAction.mockReset();
});

describe('a manufactured vault path is refused', () => {
  it('refuses the exact shape the surface used to send', async () => {
    await expect(
      recordTmfArtifactFiling(
        { trialId: 'TRIAL-1', artifactCode: CODE, documentRef: 'vault://TRIAL-1/' + CODE },
        CTX,
      ),
    ).rejects.toThrow(TmfArtifactError);
    // Nothing was written. This is the whole point: the filing must not exist.
    expect(insertChain).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
  });

  it('says WHY, naming the path shape rather than a generic not-found', async () => {
    await expect(
      recordTmfArtifactFiling(
        { trialId: 'T', artifactCode: CODE, documentRef: 'vault://T/' + CODE },
        CTX,
      ),
    ).rejects.toThrow(/path built from the trial and artifact code/);
  });
});

describe('a vault id is verified against the store', () => {
  it('refuses an id no vault document has', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(
      recordTmfArtifactFiling({ trialId: 'T', artifactCode: CODE, documentRef: 'vault://abc-123' }, CTX),
    ).rejects.toThrow(/No vault document abc-123 exists/);
    expect(insertChain).not.toHaveBeenCalled();
  });

  it('accepts an id the vault DOES have, and writes the filing', async () => {
    query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    await expect(
      recordTmfArtifactFiling({ trialId: 'T', artifactCode: CODE, documentRef: 'vault://abc-123' }, CTX),
    ).resolves.toBeTruthy();
    expect(insertChain).toHaveBeenCalled();
    expect(query.mock.calls[0][1]).toEqual(['abc-123']);
  });

  it('refuses rather than waving the reference through when the vault schema is missing', async () => {
    // An unprovisioned store must not become a free pass — that is the exact
    // failure this guard exists to prevent.
    query.mockRejectedValue(Object.assign(new Error('no relation'), { code: '42P01' }));
    await expect(
      recordTmfArtifactFiling({ trialId: 'T', artifactCode: CODE, documentRef: 'vault://abc-123' }, CTX),
    ).rejects.toThrow(/not provisioned/);
    expect(insertChain).not.toHaveBeenCalled();
  });
});

describe('what is still allowed', () => {
  it('a filing with NO document reference — an honest "recorded, nothing attached"', async () => {
    await expect(
      recordTmfArtifactFiling({ trialId: 'T', artifactCode: CODE }, CTX),
    ).resolves.toBeTruthy();
    expect(query).not.toHaveBeenCalled();
    expect(insertChain).toHaveBeenCalled();
  });

  it('a non-vault reference (an off-platform original this service cannot verify)', async () => {
    await expect(
      recordTmfArtifactFiling(
        { trialId: 'T', artifactCode: CODE, documentRef: 'https://sponsor.example/archive/1571.pdf' },
        CTX,
      ),
    ).resolves.toBeTruthy();
    expect(query).not.toHaveBeenCalled();
  });

  it('still refuses an unknown artifact code before it looks at the reference', async () => {
    await expect(
      recordTmfArtifactFiling({ trialId: 'T', artifactCode: 'NOT-A-CODE', documentRef: 'vault://abc' }, CTX),
    ).rejects.toThrow(/not a known TMF Reference Model artifact code/);
    expect(query).not.toHaveBeenCalled();
  });
});
