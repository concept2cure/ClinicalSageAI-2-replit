import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, registerArtifactMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  registerArtifactMock: vi.fn(),
}));

vi.mock('../../db', () => ({
  getPool: () => ({ query: queryMock }),
}));

vi.mock('../../services/compute/runtimeProfiles', () => ({
  getRuntimeProfile: vi.fn(async () => ({
    profileKey: 'docx-python',
    displayName: 'DOCX Python',
    networkPolicy: 'deny_all',
    timeoutSeconds: 30,
    enabled: true,
    maturity: 'seeded',
  })),
  inferRuntimeMaturity: vi.fn((format: string) => (format === 'docx' ? 'production-path' : 'provisional')),
}));

vi.mock('../../services/compute/workerClient', () => ({
  runIsolatedCompute: vi.fn(async () => [
    {
      outputType: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileName: 'ri_memo.docx',
      buffer: Buffer.from('docx bytes'),
      sanitizerReport: { runtime: 'docx-python' },
    },
  ]),
}));

vi.mock('../../services/compute/outputStore', () => ({
  persistOutput: vi.fn(async () => ({
    storageUri: 'file:///tmp/ri_memo.docx',
    sha256: 'abc123',
    byteSize: 9,
  })),
}));

vi.mock('../../services/compute/artifactWriteback', () => ({
  registerArtifactWithGovernance: registerArtifactMock,
}));

import { enqueueAndRunComputeJob } from '../../services/compute/computeService';

describe('computeService integration behavior', () => {
  beforeEach(() => {
    queryMock.mockReset();
    registerArtifactMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    registerArtifactMock.mockResolvedValue({
      artifactId: 'artifact_123',
      version: 1,
      artifactTitle: 'RI Copilot evidence memo',
      artifactStatus: 'draft',
      placementState: 'placed',
      provenanceEventId: 'prov_123',
      auditId: 'audit_123',
    });
  });

  it('executes job -> stores output -> writes governed artifact consequence', async () => {
    const result = await enqueueAndRunComputeJob({
      projectId: 10,
      organizationId: 20,
      requestedById: 30,
      surfaceKey: 'ri_copilot',
      intentType: 'docx_generation',
      title: 'RI Copilot evidence memo',
      content: 'memo body',
      ctdSection: 'm2.5',
      format: 'docx',
    });

    expect(result.status).toBe('completed');
    expect(result.runtimeMaturity).toBe('production-path');
    expect(registerArtifactMock).toHaveBeenCalledTimes(1);

    const updateCall = queryMock.mock.calls.find(c =>
      String(c[0]).includes("SET status = 'completed'")
    );
    expect(updateCall).toBeTruthy();
    expect(JSON.stringify(updateCall?.[1] || [])).toContain('provenanceRef');
    expect(JSON.stringify(updateCall?.[1] || [])).toContain('auditRef');
  });

  it('records failed attempt when governed writeback fails', async () => {
    registerArtifactMock.mockRejectedValueOnce(new Error('writeback failed'));

    await expect(
      enqueueAndRunComputeJob({
        projectId: 10,
        organizationId: 20,
        requestedById: 30,
        surfaceKey: 'ri_copilot',
        intentType: 'docx_generation',
        title: 'RI Copilot evidence memo',
        content: 'memo body',
        ctdSection: 'm2.5',
        format: 'docx',
      })
    ).rejects.toThrow(/writeback failed/);

    const failedJobUpdate = queryMock.mock.calls.find(c =>
      String(c[0]).includes("SET status = 'failed'")
    );
    const failedAttemptUpdate = queryMock.mock.calls.find(c =>
      String(c[0]).includes('error_message = $2')
    );

    expect(failedJobUpdate).toBeTruthy();
    expect(failedAttemptUpdate).toBeTruthy();
  });
});
