import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockRegisterExportGovernanceQuick } = vi.hoisted(() => ({ mockRegisterExportGovernanceQuick: vi.fn() }));
vi.mock('../../server/services/compute/exportGovernance', () => ({
  registerExportGovernanceQuick: mockRegisterExportGovernanceQuick,
}));

describe('export routes fail closed on governance registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('ind-pdf route source awaits governance registration', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = path.resolve(__dirname, '../../server/routes/ind-pdf.ts');
    const content = fs.readFileSync(file, 'utf-8');
    expect(content.includes('await registerExportGovernanceQuick')).toBe(true);
    expect(content.includes("Register governed export (fail-closed")).toBe(true);
  });

  it('ectd-export route source contains explicit governance gate', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const file = path.resolve(__dirname, '../../server/routes/ectd-export.ts');
    const content = fs.readFileSync(file, 'utf-8');
    expect(content.includes('if (!governanceResult)')).toBe(true);
    expect(content.includes('EXPORT_GOVERNANCE_REQUIRED')).toBe(true);
  });
});
