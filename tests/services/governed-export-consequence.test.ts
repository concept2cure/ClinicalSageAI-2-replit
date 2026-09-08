import { createHash } from 'node:crypto';

import { describe, expect, it, vi, beforeEach } from 'vitest';

// vi.hoisted ensures env vars are set BEFORE any ESM imports (including
// transitive ones) are evaluated. Loading the auth/db/config chain at
// module init requires these to be present, or the chain throws.
vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});


// vi.hoisted so the spy is initialized before the vi.mock factory runs.
const { registerArtifactWithGovernance } = vi.hoisted(() => ({
  registerArtifactWithGovernance: vi.fn(),
}));

vi.mock('../../server/services/compute/artifactWriteback', () => ({
  registerArtifactWithGovernance,
}));

const { logAction } = vi.hoisted(() => ({ logAction: vi.fn() }));
vi.mock('../../server/services/auditService', () => ({
  default: { logAction },
  logAction,
}));

import {
  createAuditedUnplacedExport,
  createGovernedExportConsequence,
} from '../../server/services/export/governedExportConsequence';

function makeInput(overrides: Partial<Parameters<typeof createGovernedExportConsequence>[0]> = {}) {
  return {
    organizationId: 1,
    projectId: 2,
    userId: 3,
    title: 'Export Result',
    contentForArtifact: '{"type":"doc"}',
    sourceType: 'export_pdf' as const,
    backendRoute: 'POST /api/cerv2/export/pdf',
    binaryOutput: Buffer.from('pdf-data'),
    mimeType: 'application/pdf',
    filename: 'export.pdf',
    ...overrides,
  };
}

describe('createGovernedExportConsequence input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerArtifactWithGovernance.mockResolvedValue({
      artifactId: 'artifact_1',
      version: 1,
      artifactStatus: 'draft',
      placementState: 'placed',
      provenanceEventId: 'prov_1',
      auditId: 'audit_1',
    });
  });

  it('throws on empty binary output', async () => {
    await expect(
      createGovernedExportConsequence(makeInput({ binaryOutput: Buffer.alloc(0) }))
    ).rejects.toThrow('INVALID_GOVERNED_EXPORT_INPUT');
    expect(registerArtifactWithGovernance).not.toHaveBeenCalled();
  });

  it('throws on missing filename', async () => {
    await expect(createGovernedExportConsequence(makeInput({ filename: '   ' }))).rejects.toThrow(
      'INVALID_GOVERNED_EXPORT_INPUT'
    );
    expect(registerArtifactWithGovernance).not.toHaveBeenCalled();
  });


  it('throws when binary output exceeds max size', async () => {
    vi.stubEnv('GOVERNED_EXPORT_MAX_BYTES', '4');

    await expect(
      createGovernedExportConsequence(makeInput({ binaryOutput: Buffer.from('12345') }))
    ).rejects.toThrow('INVALID_GOVERNED_EXPORT_INPUT');
    expect(registerArtifactWithGovernance).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it('falls back to default max size when env is invalid', async () => {
    vi.stubEnv('GOVERNED_EXPORT_MAX_BYTES', 'not-a-number');

    await expect(
      createGovernedExportConsequence(makeInput({ binaryOutput: Buffer.from('ok') }))
    ).resolves.toBeTruthy();

    vi.unstubAllEnvs();
  });

  it('returns governed consequence when input is valid', async () => {
    const result = await createGovernedExportConsequence(makeInput());

    expect(registerArtifactWithGovernance).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      governed: true,
      source_type: 'export_pdf',
      artifact_id: 'artifact_1',
      provenance_ref: 'prov_1',
      audit_ref: 'audit_1',
      downloadable_output_ref: {
        mime_type: 'application/pdf',
        filename: 'export.pdf',
      },
    });
  });
});

/**
 * "An export must never be delivered un-audited" — the guarantee this function's
 * own docstring makes.
 *
 * It did not hold. `auditService.logAction` NEVER rejects, by explicit policy:
 * "A persistence failure is logged, never propagated: an audit-trail outage
 * must not break the user action it records" (auditService.ts). It resolves
 * with `{persisted:false, error}` instead. So awaiting it proved nothing, and
 * an unplaced governed export — the official FDA eSTAR among them — was handed
 * to the user with no audit row and a 200.
 *
 * That policy is right for an ordinary user action and wrong for this one. The
 * whole reason this path exists is that the artifact registry cannot place the
 * file: the audit row IS the record. With no row and no artifact, a delivered
 * submission PDF exists nowhere in the system that produced it.
 */
describe('createAuditedUnplacedExport — the audit row is the record', () => {
  const input = {
    organizationId: 1,
    userId: 3,
    sourceType: 'export_estar_pdf' as const,
    backendRoute: 'POST /api/510k/estar/official',
    resourceType: 'estar_official_pdf',
    resourceId: 'a2b4c6d8-0000-0000-0000-000000000001',
    programUuid: 'a2b4c6d8-0000-0000-0000-000000000001',
    filename: 'K-1_eSTAR.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('official-estar-bytes'),
  };

  beforeEach(() => vi.clearAllMocks());

  it('delivers the bytes with their sha256 when the audit row persisted', async () => {
    logAction.mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
    const out = await createAuditedUnplacedExport(input);
    expect(out.audited).toBe(true);
    expect(out.sha256).toBe(createHash('sha256').update(input.buffer).digest('hex'));
    expect(out.downloadable_output_ref.data).toBe(input.buffer.toString('base64'));
  });

  it.each([
    ['neither log wrote', { persisted: false, chained: false, tamperProof: false, error: 'no database pool' }],
    ['the write was refused', { persisted: false, chained: false, tamperProof: false }],
  ])('REFUSES to deliver when %s', async (_label, outcome) => {
    logAction.mockResolvedValue(outcome);
    await expect(createAuditedUnplacedExport(input)).rejects.toThrow(/UNAUDITED_EXPORT_REFUSED/);
  });

  it('names the audit failure so the route logs a true reason', async () => {
    logAction.mockResolvedValue({
      persisted: false,
      chained: false,
      tamperProof: false,
      error: 'no database pool: the chained audit_logs row was not attempted',
    });
    await expect(createAuditedUnplacedExport(input)).rejects.toThrow(/no database pool/);
  });

  it('REFUSES to deliver when the audit write itself throws', async () => {
    logAction.mockRejectedValue(new Error('audit transport down'));
    await expect(createAuditedUnplacedExport(input)).rejects.toThrow(/audit transport down/);
  });

  it('accepts a tamper-proof-only write — the hash chain is a record too', async () => {
    logAction.mockResolvedValue({ persisted: true, chained: false, tamperProof: true, error: 'audit_logs unavailable' });
    await expect(createAuditedUnplacedExport(input)).resolves.toMatchObject({ audited: true });
  });
});
