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

import { createGovernedExportConsequence } from '../../server/services/export/governedExportConsequence';

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
