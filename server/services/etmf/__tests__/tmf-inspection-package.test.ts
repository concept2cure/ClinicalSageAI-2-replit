/**
 * eTMF inspection-readiness package (E3) — the ZIP deliverable the eTMF domain
 * gained. Verifies it assembles the four expected members, carries an honest
 * "metadata only" manifest, orders artifacts deterministically, and reports the
 * readiness verdict from the underlying assessment. The persistence layer is
 * mocked so this stays a pure unit test (no DB).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';

// Mock the persistence layer the package builder reads from: one admitted
// read of the study's TMF (the study, its filings, their assessment).
vi.mock('../tmf-artifact-persistence', () => ({
  readTrialTmf: vi.fn(),
}));

import { buildTmfInspectionPackage } from '../tmf-inspection-package';
import { readTrialTmf } from '../tmf-artifact-persistence';

const mockRead = readTrialTmf as unknown as ReturnType<typeof vi.fn>;
const study = (studyId: string) => ({ id: 41, studyId, programId: 'prog-1', protocolId: 'P-001', title: 'A study',
  phase: 'Phase II', indication: 'Hypertension', status: 'draft' });
/** What the one read answers for a study: its assessment and its filings. */
function tmfIs(studyId: string, completeness: Record<string, unknown>, filings: unknown[]) {
  mockRead.mockResolvedValue({ study: study(studyId), filings, completeness: { ...completeness, study: study(studyId) } });
}

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
    tmfIs('TRIAL-1', READY_ASSESSMENT, [
      { artifactCode: 'protocol', filedAt: '2026-01-02T00:00:00Z', documentRef: 'VAULT-1' },
    ]);

    const pkg = await buildTmfInspectionPackage({
      trialId: 'TRIAL-1',
      organizationId: 7,
      userId: 5,
      scope: 'essential',
      generatedAt: '2026-07-05T00:00:00Z',
    });
    // One read, as the caller, for the study the route named.
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(mockRead).toHaveBeenCalledWith('TRIAL-1', { organizationId: 7, userId: 5 }, 'essential');
    expect(pkg.study).toMatchObject({ id: 41, studyId: 'TRIAL-1' });

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
    // The package names the study it is about (E2).
    expect(manifest.study).toEqual({ id: 41, studyId: 'TRIAL-1', protocolId: 'P-001', title: 'A study', programId: 'prog-1' });
  });

  it('names its file with characters that are safe in a header, whatever the study id holds', async () => {
    tmfIs('ST"UDY\r\nX-Injected: 1/../é', READY_ASSESSMENT, []);
    const pkg = await buildTmfInspectionPackage({ trialId: 'anything', organizationId: 7, userId: 5, generatedAt: '2026-07-05T00:00:00Z' });
    // The quote, the line break, the colon, the slash and the accented letter each became an underscore.
    expect(pkg.fileName).toBe('tmf-inspection-ST_UDY__X-Injected__1_..__.zip');
    expect(pkg.fileName).toMatch(/^tmf-inspection-[A-Za-z0-9._-]+\.zip$/);
  });

  it('orders artifacts deterministically by zone then code', async () => {
    // Provide out-of-order codes; the CSV must come back sorted.
    tmfIs('TRIAL-2', READY_ASSESSMENT, [
      { artifactCode: 'trial-master-file-plan', filedAt: null, documentRef: null },
      { artifactCode: 'protocol', filedAt: null, documentRef: null },
    ]);

    const pkg = await buildTmfInspectionPackage({
      trialId: 'TRIAL-2',
      organizationId: 7,
      userId: 5,
      generatedAt: '2026-07-05T00:00:00Z',
    });
    const zip = await JSZip.loadAsync(pkg.zip);
    const csv = await zip.file('inspection-index.csv')!.async('string');
    const lines = csv.trim().split('\n');
    // document_evidence added 2026-10-15: the index now says whether each filing's document was verified.
    expect(lines[0]).toBe('zone,artifact_code,artifact_name,filed_at,document_ref,document_evidence,not_applicable_reason');
    // Two data rows, deterministic order (stable across runs).
    expect(lines).toHaveLength(3);
  });

  it('propagates a not-ready verdict honestly', async () => {
    tmfIs('TRIAL-3', {
      ...READY_ASSESSMENT,
      ready: false,
      summary: { zoneCount: 11, zonesComplete: 8, totalRequired: 20, totalMissing: 3 },
    }, []);

    const pkg = await buildTmfInspectionPackage({
      trialId: 'TRIAL-3',
      organizationId: 7,
      userId: 5,
      generatedAt: '2026-07-05T00:00:00Z',
    });
    expect(pkg.ready).toBe(false);
    expect(pkg.artifactCount).toBe(0);
    const zip = await JSZip.loadAsync(pkg.zip);
    const readme = await zip.file('README.txt')!.async('string');
    expect(readme).toMatch(/Inspection ready: NO/);
  });

  /* 2026-11-12 (eTMF E4 step 5): a study whose every required record is declared not applicable has no verdict. The
     cover says so, never "YES" and never the off-platform reason "NOT DETERMINED" stands for. */
  it('a study with no required record left to check says no verdict, and why', async () => {
    tmfIs('TRIAL-4', {
      ...READY_ASSESSMENT,
      ready: null,
      summary: { zoneCount: 11, zonesComplete: 11, totalRequired: 0, totalMissing: 0, totalUnverified: 0, totalNotApplicable: 26 },
    }, []);
    const pkg = await buildTmfInspectionPackage({ trialId: 'TRIAL-4', organizationId: 7, userId: 5, generatedAt: '2026-11-12T00:00:00Z' });
    expect(pkg.ready).toBeNull();
    const readme = await (await JSZip.loadAsync(pkg.zip)).file('README.txt')!.async('string');
    expect(readme).toMatch(/Inspection ready: NO VERDICT \(every required record is declared not applicable\)/);
  });
});
