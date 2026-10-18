/**
 * TMF inspection readiness counts an essential artifact as present only when its
 * filing references a document this service verified exists at assessment time.
 *
 * ── What the code used to do ────────────────────────────────────────────────
 * `getTrialTmfCompleteness` passed every filing ROW's artifact code to
 * `assessTmfCompleteness`, which set `ready` when every essential code had a
 * row. A row POSTed with only `artifactCode` (no document reference) counted,
 * and a vault reference was checked once, at filing, never again — so a trial
 * whose essential documents had all been "filed" with nothing attached, or
 * whose vault documents had since been deleted, read `ready: true`, and the
 * inspection package said "Inspection ready: YES" over a README claiming
 * "Nothing in this package is fabricated".
 *
 * The real persistence and package code run here; only the database is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

const S = vi.hoisted(() => ({
  filings: [] as Array<Record<string, unknown>>,
  query: vi.fn(),
}));

vi.mock('../../../db', () => ({
  pool: { query: S.query },
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: async () => S.filings }),
      }),
    }),
  },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn() } }));

import { getTrialTmfCompleteness } from '../tmf-artifact-persistence';
import { buildTmfInspectionPackage } from '../tmf-inspection-package';
import { TMF_REFERENCE_MODEL } from '../tmf-completeness';

const ESSENTIAL = TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.filter((a) => a.essential).map((a) => a.code));
const CTX = { organizationId: 7 };

function filing(artifactCode: string, documentRef: string | null) {
  return { id: `f-${artifactCode}`, organizationId: 7, trialId: 'T-1', artifactCode, zoneNumber: null, documentRef, filedAt: new Date('2026-10-01T00:00:00Z') };
}
/** A distinct uuid-shaped vault id per code, so a test can choose which ones resolve. */
const vaultId = (code: string) => {
  const h = createHash('md5').update(code).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

beforeEach(() => {
  S.filings = [];
  S.query.mockReset();
});

describe('a filing with no document reference', () => {
  it('does not make an essential artifact present, so the TMF is not ready', async () => {
    S.filings = ESSENTIAL.map((c) => filing(c, null));
    const r = await getTrialTmfCompleteness('T-1', CTX);
    expect(r.ready, 'every essential code has a ROW but no document: readiness must not be claimed').toBe(false);
    expect(r.summary.totalMissing).toBe(ESSENTIAL.length);
    expect(r.summary.totalUnverified).toBe(ESSENTIAL.length);
    const zone2 = r.zones.find((z) => z.number === 2)!;
    expect(zone2.present).toEqual([]);
    expect(zone2.unverified).toContainEqual({ code: 'protocol', evidence: 'no_document' });
    expect(r.basis).toBe('verified_documents');
    // No vault reference, so nothing to look up.
    expect(S.query).not.toHaveBeenCalled();
  });
});

describe('a vault reference is re-verified when readiness is computed', () => {
  it('a reference whose document no longer resolves is not present', async () => {
    S.filings = ESSENTIAL.map((c) => filing(c, `vault://${vaultId(c)}`));
    const gone = vaultId('protocol');
    S.query.mockResolvedValue({ rows: ESSENTIAL.map(vaultId).filter((id) => id !== gone).map((id) => ({ id })) });
    const r = await getTrialTmfCompleteness('T-1', CTX);
    expect(r.ready).toBe(false);
    const zone2 = r.zones.find((z) => z.number === 2)!;
    expect(zone2.missing).toEqual(['protocol']);
    expect(zone2.unverified).toEqual([{ code: 'protocol', evidence: 'unresolved' }]);
    expect(r.documentEvidence?.protocol).toBe('unresolved');
    expect(r.documentEvidence?.sap).toBe('verified');
    // One lookup, org-scoped through the program, soft-deleted documents excluded.
    expect(S.query).toHaveBeenCalledTimes(1);
    const [sql, params] = S.query.mock.calls[0];
    expect(sql).toMatch(/rp\.organization_id = \$2/);
    expect(sql).toMatch(/d\.deleted_at IS NULL/);
    expect(params[1]).toBe(7);
    expect(new Set(params[0])).toEqual(new Set(ESSENTIAL.map(vaultId)));
  });

  it('every essential artifact filed against a resolving vault document reads ready', async () => {
    S.filings = ESSENTIAL.map((c) => filing(c, `vault://${vaultId(c)}`));
    S.query.mockResolvedValue({ rows: ESSENTIAL.map((c) => ({ id: vaultId(c) })) });
    const r = await getTrialTmfCompleteness('T-1', CTX);
    expect(r.ready).toBe(true);
    expect(r.summary.totalMissing).toBe(0);
    expect(r.summary.totalUnverified).toBe(0);
  });

  it('a failed vault read is an error, never a readiness verdict', async () => {
    S.filings = [filing('protocol', `vault://${vaultId('protocol')}`)];
    S.query.mockRejectedValue(new Error('connection reset'));
    await expect(getTrialTmfCompleteness('T-1', CTX)).rejects.toThrow(/connection reset/);
  });
});

describe('an off-platform reference this service cannot check', () => {
  it('leaves readiness undetermined (null) when it is the only gap', async () => {
    S.filings = ESSENTIAL.map((c) => filing(c, c === 'protocol' ? 'https://sponsor.example/tmf/protocol.pdf' : `vault://${vaultId(c)}`));
    S.query.mockResolvedValue({ rows: ESSENTIAL.filter((c) => c !== 'protocol').map((c) => ({ id: vaultId(c) })) });
    const r = await getTrialTmfCompleteness('T-1', CTX);
    expect(r.ready).toBeNull();
    expect(r.zones.find((z) => z.number === 2)!.unverified).toEqual([{ code: 'protocol', evidence: 'unverifiable' }]);
  });

  it('is still not ready when another essential artifact has no document at all', async () => {
    S.filings = ESSENTIAL.filter((c) => c !== 'sap').map((c) => filing(c, c === 'protocol' ? 'https://sponsor.example/p.pdf' : `vault://${vaultId(c)}`));
    S.query.mockResolvedValue({ rows: ESSENTIAL.map((c) => ({ id: vaultId(c) })) });
    const r = await getTrialTmfCompleteness('T-1', CTX);
    expect(r.ready).toBe(false);
  });
});

describe('the inspection package', () => {
  it('does not say "Inspection ready: YES" over filings with no documents, and its index says which', async () => {
    S.filings = ESSENTIAL.map((c) => filing(c, null));
    const pkg = await buildTmfInspectionPackage({ trialId: 'T-1', organizationId: 7, generatedAt: '2026-10-15T00:00:00Z' });
    expect(pkg.ready).toBe(false);
    const zip = await JSZip.loadAsync(pkg.zip);
    const readme = await zip.file('README.txt')!.async('string');
    expect(readme).not.toMatch(/Inspection ready: YES/);
    expect(readme).toMatch(/Inspection ready: NO/);
    expect(readme).toMatch(/without a verified document: 26/);
    const csv = (await zip.file('inspection-index.csv')!.async('string')).trim().split('\n');
    expect(csv[0]).toBe('zone,artifact_code,artifact_name,filed_at,document_ref,document_evidence');
    expect(csv.find((l) => l.split(',')[1] === 'protocol')).toMatch(/,no_document$/);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.ready).toBe(false);
    expect(manifest.basis).toBe('verified_documents');
  });

  it('says NOT DETERMINED, not YES or NO, when the only gaps are references it cannot check', async () => {
    S.filings = ESSENTIAL.map((c) => filing(c, 'https://sponsor.example/tmf/' + c + '.pdf'));
    const pkg = await buildTmfInspectionPackage({ trialId: 'T-1', organizationId: 7, generatedAt: '2026-10-15T00:00:00Z' });
    expect(pkg.ready).toBeNull();
    const readme = await (await JSZip.loadAsync(pkg.zip)).file('README.txt')!.async('string');
    expect(readme).toMatch(/Inspection ready: NOT DETERMINED/);
  });
});
