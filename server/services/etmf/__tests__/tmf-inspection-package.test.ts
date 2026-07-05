/**
 * eTMF inspection-readiness package (E3) — the ZIP deliverable the eTMF domain
 * gained. Verifies it assembles the four expected members, carries an honest
 * "metadata only" manifest, orders artifacts deterministically, and reports the
 * readiness verdict from the underlying assessment. The persistence layer is
 * mocked so this stays a pure unit test (no DB).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';

// Mock the persistence layer the package builder reads from.
vi.mock('../tmf-artifact-persistence', () => ({
  getTrialTmfCompleteness: vi.fn(),
  listTmfArtifacts: vi.fn(),
}));

import { buildTmfInspectionPackage } from '../tmf-inspection-package';
import { getTrialTmfCompleteness, listTmfArtifacts } from '../tmf-artifact-persistence';

const mockCompleteness = getTrialTmfCompleteness as unknown as ReturnType<typeof vi.fn>;
const mockList = listTmfArtifacts as unknown as ReturnType<typeof vi.fn>;

const READY_ASSESSMENT = {
  ready: true,
  scope: 'essential' as const,
  zones: [],
  summary: { zoneCount: 11, zonesComplete: 11, totalRequired: 20, totalMissing: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildTmfInspectionPackage', () => {
  it('assembles a ZIP with the four expected members and an honest manifest', async () => {
    mockCompleteness.mockResolvedValue(READY_ASSESSMENT);
    mockList.mockResolvedValue([
      { artifactCode: 'protocol', filedAt: '2026-01-02T00:00:00Z', documentRef: 'VAULT-1' },
    ]);

    const pkg = await buildTmfInspectionPackage({
      trialId: 'TRIAL-1',
      organizationId: 7,
      scope: 'essential',
      generatedAt: '2026-07-05T00:00:00Z',
    });

    expect(pkg.fileName).toBe('tmf-inspection-TRIAL-1.zip');
    expect(pkg.ready).toBe(true);
    expect(pkg.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pkg.sizeBytes).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(pkg.zip);
    for (const name of ['manifest.json', 'completeness.json', 'inspection-index.csv', 'README.txt']) {
      expect(zip.file(name)).not.toBeNull();
    }

    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.kind).toBe('tmf-inspection-package');
    expect(manifest.ready).toBe(true);
    // Honesty contract: the manifest must state it holds metadata, not bytes.
    expect(manifest.note).toMatch(/metadata/i);
    expect(manifest.artifactCount).toBe(1);
  });

  it('orders artifacts deterministically by zone then code', async () => {
    mockCompleteness.mockResolvedValue(READY_ASSESSMENT);
    // Provide out-of-order codes; the CSV must come back sorted.
    mockList.mockResolvedValue([
      { artifactCode: 'trial-master-file-plan', filedAt: null, documentRef: null },
      { artifactCode: 'protocol', filedAt: null, documentRef: null },
    ]);

    const pkg = await buildTmfInspectionPackage({
      trialId: 'TRIAL-2',
      organizationId: 7,
      generatedAt: '2026-07-05T00:00:00Z',
    });
    const zip = await JSZip.loadAsync(pkg.zip);
    const csv = await zip.file('inspection-index.csv')!.async('string');
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('zone,artifact_code,artifact_name,filed_at,document_ref');
    // Two data rows, deterministic order (stable across runs).
    expect(lines).toHaveLength(3);
  });

  it('propagates a not-ready verdict honestly', async () => {
    mockCompleteness.mockResolvedValue({
      ...READY_ASSESSMENT,
      ready: false,
      summary: { zoneCount: 11, zonesComplete: 8, totalRequired: 20, totalMissing: 3 },
    });
    mockList.mockResolvedValue([]);

    const pkg = await buildTmfInspectionPackage({
      trialId: 'TRIAL-3',
      organizationId: 7,
      generatedAt: '2026-07-05T00:00:00Z',
    });
    expect(pkg.ready).toBe(false);
    expect(pkg.artifactCount).toBe(0);
    const zip = await JSZip.loadAsync(pkg.zip);
    const readme = await zip.file('README.txt')!.async('string');
    expect(readme).toMatch(/Inspection ready: NO/);
  });
});
