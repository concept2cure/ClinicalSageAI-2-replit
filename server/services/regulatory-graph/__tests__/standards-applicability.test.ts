/**
 * Standards-applicability rule tests against the canonical
 * `device_test_standards` table.
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';

import { REGULATORY_STANDARDS_SEED } from '../../../../shared/schema/regulatory-standards.seed';

// Build full deviceTestStandards-shaped rows from the seed.
const SEED_ROWS = REGULATORY_STANDARDS_SEED.map((s, i) => ({
  id: i + 1,
  standardCode: s.standardCode,
  standardName: s.standardName,
  standardBody: s.standardBody,
  family: s.family ?? null,
  version: s.version ?? null,
  editionYear: s.editionYear ?? null,
  clause: null,
  region: s.region ?? null,
  description: s.description ?? null,
  applicableCategories: null,
  requiredTests: null,
  effectiveDate: null,
  supersededBy: null,
  domain: s.domain,
  appliesTo: s.appliesTo,
  fdaRecognitionNumber: null,
  fdaRecognized: s.fdaRecognized ?? false,
  euHarmonized: s.euHarmonized ?? false,
  jurisdictions: s.jurisdictions ?? [],
  status: s.status ?? 'active',
  supersededByStandardId: null,
  withdrawnAt: null,
  summary: s.summary ?? null,
  sourceUrl: null,
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
  test('ISO 13485 / 14971 / 24971 / 15223-1 always apply to device programs', async () => {
    const recs = await recommendApplicability(baseProfile);
    const byCode = new Map(recs.map(r => [r.standard.standardCode, r]));
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
    const byCode = new Map(recs.map(r => [r.standard.standardCode, r]));
    expect(byCode.get('IEC 62304:2006/AMD 1:2015')!.applicability).toBe('does_not_apply');
    expect(byCode.get('IEC 81001-5-1:2021')!.applicability).toBe('does_not_apply');
  });

  test('software standards apply when software flag is set', async () => {
    const recs = await recommendApplicability({ ...baseProfile, isSoftware: true });
    const byCode = new Map(recs.map(r => [r.standard.standardCode, r]));
    expect(byCode.get('IEC 62304:2006/AMD 1:2015')!.applicability).toBe('applies');
    expect(byCode.get('IEC 81001-5-1:2021')!.applicability).toBe('applies');
  });

  test('IVD standards do not apply to non-IVD devices', async () => {
    const recs = await recommendApplicability({ ...baseProfile, isIvd: false });
    const byCode = new Map(recs.map(r => [r.standard.standardCode, r]));
    expect(byCode.get('ISO 20916:2019')!.applicability).toBe('does_not_apply');
    expect(byCode.get('CLSI EP05-A3')!.applicability).toBe('does_not_apply');
  });

  test('IVD standards apply when productType is ivd', async () => {
    const recs = await recommendApplicability({
      ...baseProfile,
      productType: 'ivd',
      isIvd: true,
    });
    const byCode = new Map(recs.map(r => [r.standard.standardCode, r]));
    expect(byCode.get('ISO 20916:2019')!.applicability).toBe('applies');
  });

  test('ISO 14155 is conditional for non-PMA Class II', async () => {
    const recs = await recommendApplicability(baseProfile);
    const rec = recs.find(r => r.standard.standardCode === 'ISO 14155:2020')!;
    expect(rec.applicability).toBe('conditional');
  });

  test('ISO 14155 applies for PMA programs', async () => {
    const recs = await recommendApplicability({
      ...baseProfile,
      programType: 'PMA',
      deviceClass: 'III',
    });
    const rec = recs.find(r => r.standard.standardCode === 'ISO 14155:2020')!;
    expect(rec.applicability).toBe('applies');
  });

  test('biocompatibility marked tbd when patient-contact unset', async () => {
    const recs = await recommendApplicability(baseProfile);
    const rec = recs.find(r => r.standard.standardCode === 'ISO 10993-1:2018')!;
    expect(rec.applicability).toBe('tbd');
  });

  test('biocompatibility applies when hasPatientContact=true', async () => {
    const recs = await recommendApplicability({ ...baseProfile, hasPatientContact: true });
    const rec = recs.find(r => r.standard.standardCode === 'ISO 10993-1:2018')!;
    expect(rec.applicability).toBe('applies');
  });

  test('sterilization standards do_not_apply when isSterile=false', async () => {
    const recs = await recommendApplicability({ ...baseProfile, isSterile: false });
    const rec = recs.find(r => r.standard.standardCode === 'ISO 11135:2014/AMD 1:2018')!;
    expect(rec.applicability).toBe('does_not_apply');
  });

  test('every recommendation includes a non-empty rationale and confidence in [0,1]', async () => {
    const recs = await recommendApplicability(baseProfile);
    for (const r of recs) {
      expect(r.rationale.length).toBeGreaterThan(0);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  test('combination-product standards apply to a combination program', async () => {
    const recs = await recommendApplicability({ ...baseProfile, productType: 'combination' });
    const rec = recs.find(r => r.standard.standardCode === 'ISO 11608-1:2022')!;
    expect(rec.applicability).toBe('applies');
  });

  test('combination-product standards do_not_apply to a pure IVD program', async () => {
    const recs = await recommendApplicability({ ...baseProfile, productType: 'ivd', isIvd: true });
    const rec = recs.find(r => r.standard.standardCode === 'ISO 11608-1:2022')!;
    expect(rec.applicability).toBe('does_not_apply');
  });

  test('added biocompatibility parts apply when hasPatientContact=true', async () => {
    const recs = await recommendApplicability({ ...baseProfile, hasPatientContact: true });
    const byCode = new Map(recs.map(r => [r.standard.standardCode, r]));
    expect(byCode.get('ISO 10993-5:2009')!.applicability).toBe('applies');
    expect(byCode.get('ISO 10993-23:2021')!.applicability).toBe('applies');
  });
});

describe('regulatory standards seed — integrity', () => {
  test('standard codes are unique and entries are well-formed', () => {
    const codes = REGULATORY_STANDARDS_SEED.map(s => s.standardCode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const s of REGULATORY_STANDARDS_SEED) {
      expect(s.standardCode.trim().length).toBeGreaterThan(0);
      expect(s.standardName.trim().length).toBeGreaterThan(0);
      expect(s.standardBody.trim().length).toBeGreaterThan(0);
      expect(s.domain.trim().length).toBeGreaterThan(0);
      expect(s.appliesTo.length).toBeGreaterThan(0);
    }
  });

  test('covers the combination-product domain (drug-device delivery)', () => {
    const combo = REGULATORY_STANDARDS_SEED.filter(s => s.domain === 'combination_product');
    expect(combo.length).toBeGreaterThanOrEqual(3);
    expect(combo.map(s => s.standardCode)).toContain('ISO 11608-1:2022');
  });

  test('jurisdictions on global standards span multiple regions', () => {
    const iso13485 = REGULATORY_STANDARDS_SEED.find(s => s.standardCode === 'ISO 13485:2016')!;
    expect((iso13485.jurisdictions ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
