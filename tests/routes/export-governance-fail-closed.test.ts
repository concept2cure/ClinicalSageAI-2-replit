import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockRegisterExportGovernanceQuick, mockAssemble } = vi.hoisted(() => ({
  mockRegisterExportGovernanceQuick: vi.fn(),
  mockAssemble: vi.fn(),
}));
vi.mock('../../server/services/compute/exportGovernance', () => ({
  registerExportGovernanceQuick: mockRegisterExportGovernanceQuick,
}));
vi.mock('../../server/services/ectd/assemble-from-core', () => ({
  assembleSubmissionEctd: mockAssemble,
}));
vi.mock('../../server/services/submission-gateways/ectd-structural-validator', () => ({
  validateEctdPackage: vi.fn(async () => ({ valid: true, errors: [] })),
}));
// The submission's program is anchored to project 77 (Document Identity
// Contract C1), so the export takes the registry-placed governance path.
vi.mock('../../server/services/c2c/program-project-anchor', () => ({
  resolveProgramProjectAnchor: vi.fn(async () => 77),
}));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({}) }));

import ectdExportRoutes from '../../server/routes/ectd-export';

const PACKAGE = Buffer.from('ectd-zip-bytes');

function exportHandler() {
  const layer = ectdExportRoutes.stack.find(
    (l: any) => l.route?.path === '/:submissionId' && l.route?.methods?.post
  );
  if (!layer) throw new Error('Missing route POST /:submissionId');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function exportRequest() {
  const req = createMockRequest({ params: { submissionId: '123' }, body: {} }) as any;
  req.user = { id: 7, organizationId: 1, name: 'Test User' };
  req.tenantContext = { organizationId: 1 };
  return req;
}

describe('export routes fail closed on governance registration', () => {
  const originalGate = process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'false';
    mockAssemble.mockResolvedValue({
      buffer: PACKAGE,
      filename: 'submission.zip',
      sequenceId: 1,
      sequenceNumber: '0000',
      region: 'fda',
      sha256: 'a'.repeat(64),
      materialized: 7,
      unresolvedLeaves: [],
      skipped: [],
      priorState: 'filed',
      unfiledPriorSequences: [],
      programId: '5eb50a2e-235a-4605-bd1b-af2d75e8518c',
      stats: { totalModules: 5, totalFiles: 10, totalGranules: 7, generatedAt: '2026-09-30T00:00:00.000Z' },
    });
    mockRegisterExportGovernanceQuick.mockResolvedValue({
      artifactId: 'artifact_export_test',
      version: 1,
      artifactTitle: 'test',
      artifactStatus: 'draft',
      placementState: 'unplaced',
      provenanceEventId: 'prov_test',
      auditId: 'audit_test',
      snapshotId: 'snap_test',
      governanceSource: 'export',
      governed: true,
    });
  });

  afterEach(() => {
    if (originalGate === undefined) delete process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;
    else process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = originalGate;
  });

  // The ind-pdf route-source assertion was removed with server/routes/ind-pdf.ts
  // itself (zero-caller route deleted in the biotech-lifecycle consolidation).

  // This asserted the source literal `if (!governanceResult)`. 954c2588f moved
  // registration into recordGovernedEctdExport (placed against the program's
  // project anchor, or audited-unplaced), and the gate became
  // `if (registry === null)`: the same refusal under different code. It is now
  // asserted by what the route does.
  it('ectd-export refuses the package with EXPORT_GOVERNANCE_REQUIRED when governance registration fails', async () => {
    mockRegisterExportGovernanceQuick.mockResolvedValueOnce(null);
    const res = createMockResponse();

    await exportHandler()(exportRequest(), res);

    expect(mockRegisterExportGovernanceQuick).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 77 })
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'EXPORT_GOVERNANCE_REQUIRED' })
    );
    expect(res.send).not.toHaveBeenCalled();
    // The refusal is a JSON error, not a body labelled as a zip attachment.
    expect(res.setHeader).not.toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(res.setHeader).not.toHaveBeenCalledWith('Content-Disposition', expect.anything());
  });

  it('ectd-export delivers the package once governance registration succeeds (positive control)', async () => {
    const res = createMockResponse();

    await exportHandler()(exportRequest(), res);

    expect(res.setHeader).toHaveBeenCalledWith('X-Export-Registry', 'placed');
    expect(res.send).toHaveBeenCalledWith(PACKAGE);
    expect(
      mockRegisterExportGovernanceQuick.mock.invocationCallOrder[0]
    ).toBeLessThan((res.send as any).mock.invocationCallOrder[0]);
  });
});
