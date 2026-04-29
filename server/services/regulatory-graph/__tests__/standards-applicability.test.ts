/**
 * Standards-applicability rule tests.
 *
 * Mocks `db.select` to return the seed standards directly so the rule logic
 * can be exercised without Postgres.
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';

import { REGULATORY_STANDARDS_SEED } from '../../../../shared/schema/regulatory-standards.seed';
import type { RegulatoryStandard } from '../../../../shared/schema/regulatory-graph';

// Build full RegulatoryStandard rows from the seed (fill audit fields)
const SEED_ROWS: RegulatoryStandard[] = REGULATORY_STANDARDS_SEED.map((s, i) => ({
  id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
  code: s.code,
  title: s.title,
  sdo: s.sdo,
  version: s.version ?? null,
  publishedAt: null,
  domain: s.domain,
  appliesTo: s.appliesTo ?? null,
  fdaRecognitionNumber: s.fdaRecognitionNumber ?? null,
  fdaRecognized: s.fdaRecognized ?? null,
  euHarmonized: s.euHarmonized ?? null,
  jurisdictions: s.jurisdictions ?? null,
  status: s.status ?? 'active',
  supersededByStandardId: null,
  withdrawnAt: null,
  effectiveAt: null,
  sourceUrl: s.sourceUrl ?? null,
  summary: s.summary ?? null,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}));

vi.mock('../../../db', () => {
  const chain: any = {
    from() {
      return chain;
    },
    where() {
      return chain;
    },
    limit() {
      return Promise.resolve(SEED_ROWS);
    },
    orderBy() {
      return chain;
    },
    then(resolve: (rows: unknown[]) => void) {
      resolve(SEED_ROWS);
    },
  };
  return { db: { select: () => chain } };
});

import { recommendApplicability } from '../standards-applicability.service';

beforeEach(() => {
  vi.clearAllMocks();
});

const baseProfile = {
  programType: '510K',
  productType: 'device',
  deviceClass: 'II',
  primaryAgency: 'FDA',
  targetAgencies: ['FDA'],
};

describe('recommendApplicability', () => {
  test('ISO 13485, 14971, 15223-1 always apply to device programs', async () => {
    const recs = await recommendApplicability(baseProfile);
    const byCode = new Map(recs.map(r => [r.standard.code, r]));
    expect(byCode.get('ISO 13485:2016')!.applicability).toBe('applies');
    expect(byCode.get('ISO 14971:2019')!.applicability).toBe('applies');
    expect(byCode.get('ISO 15223-1:2021')!.applicability).toBe('applies');
  });

  test('software standards do not apply when program is not software', async () => {
    const recs = await recommendApplicability({
      ...baseProfile,
      isSoftware: false,
      isAiMl: false,
    });
    const byCode = new Map(recs.map(r => [r.standard.code, r]));
    expect(byCode.get('IEC 62304:2006/AMD 1:2015')!.applicability).toBe('does_not_apply');
    expect(byCode.get('IEC 81001-5-1:2021')!.applicability).toBe('does_not_apply');
  });

  test('software standards apply when software flag is set', async () => {
    const recs = await recommendApplicability({
      ...baseProfile,
      isSoftware: true,
    });
    const byCode = new Map(recs.map(r => [r.standard.code, r]));
    expect(byCode.get('IEC 62304:2006/AMD 1:2015')!.applicability).toBe('applies');
    expect(byCode.get('IEC 81001-5-1:2021')!.applicability).toBe('applies');
  });

  test('IVD standards do not apply to non-IVD devices', async () => {
    const recs = await recommendApplicability({ ...baseProfile, isIvd: false });
    const byCode = new Map(recs.map(r => [r.standard.code, r]));
    expect(byCode.get('ISO 20916:2019')!.applicability).toBe('does_not_apply');
    expect(byCode.get('CLSI EP05-A3')!.applicability).toBe('does_not_apply');
  });

  test('IVD standards apply when productType is ivd', async () => {
    const recs = await recommendApplicability({
      ...baseProfile,
      productType: 'ivd',
      isIvd: true,
    });
    const byCode = new Map(recs.map(r => [r.standard.code, r]));
    expect(byCode.get('ISO 20916:2019')!.applicability).toBe('applies');
  });

  test('ISO 14155 (clinical investigation) is conditional for non-PMA Class II', async () => {
    const recs = await recommendApplicability(baseProfile);
    const rec = recs.find(r => r.standard.code === 'ISO 14155:2020')!;
    expect(rec.applicability).toBe('conditional');
  });

  test('ISO 14155 applies for PMA programs', async () => {
    const recs = await recommendApplicability({
      ...baseProfile,
      programType: 'PMA',
      deviceClass: 'III',
    });
    const rec = recs.find(r => r.standard.code === 'ISO 14155:2020')!;
    expect(rec.applicability).toBe('applies');
  });

  test('biocompatibility marked tbd when patient-contact unset', async () => {
    const recs = await recommendApplicability(baseProfile);
    const rec = recs.find(r => r.standard.code === 'ISO 10993-1:2018')!;
    expect(rec.applicability).toBe('tbd');
  });

  test('biocompatibility applies when hasPatientContact=true', async () => {
    const recs = await recommendApplicability({
      ...baseProfile,
      hasPatientContact: true,
    });
    const rec = recs.find(r => r.standard.code === 'ISO 10993-1:2018')!;
    expect(rec.applicability).toBe('applies');
  });

  test('sterilization standards do_not_apply when isSterile=false', async () => {
    const recs = await recommendApplicability({ ...baseProfile, isSterile: false });
    const rec = recs.find(r => r.standard.code === 'ISO 11135:2014/AMD 1:2018')!;
    expect(rec.applicability).toBe('does_not_apply');
  });

  test('every recommendation includes a non-empty rationale and a confidence in [0,1]', async () => {
    const recs = await recommendApplicability(baseProfile);
    for (const r of recs) {
      expect(r.rationale.length).toBeGreaterThan(0);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });
});
