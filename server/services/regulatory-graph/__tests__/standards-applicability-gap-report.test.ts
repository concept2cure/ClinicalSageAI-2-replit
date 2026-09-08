/**
 * The gap report distinguishes "assessed and clear" from "never assessed".
 *
 * `standards_applicability` has no INSERT anywhere in the repo (ledger L22 /
 * ci:writerless-stores), so in production `listProgramApplicability` returns
 * nothing for every program. Two of the three summary counts are filtered from
 * those rows, so both were permanently 0 — which reads as a conformance
 * clearance on the standards pillar of a device filing rather than as "nothing
 * has been assessed".
 *
 * @module server/services/regulatory-graph/__tests__/standards-applicability-gap-report.test
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { REGULATORY_STANDARDS_SEED } from '../../../../shared/schema/regulatory-standards.seed';

const STANDARDS = REGULATORY_STANDARDS_SEED.slice(0, 6).map((s, i) => ({
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

/** Rows the mocked `standards_applicability` read returns for this test. */
let applicabilityRows: any[] = [];

vi.mock('../../../db', () => {
  const makeChain = () => {
    let table = '';
    const rowsFor = () =>
      table === 'standards_applicability' ? applicabilityRows : STANDARDS;
    const chain: any = {
      from(t: any) {
        // Drizzle carries the SQL name on the table object; fall back to a
        // marker the fixtures set so the mock never guesses.
        table = t?.[Symbol.for('drizzle:Name')] ?? t?._?.name ?? t?.__name ?? '';
        return chain;
      },
      where: () => chain,
      orderBy: () => chain,
      limit: () => Promise.resolve(rowsFor()),
      then: (resolve: (rows: unknown[]) => void) => resolve(rowsFor()),
    };
    return chain;
  };
  return { db: { select: () => makeChain() } };
});

import { applicabilityGapReport } from '../standards-applicability.service';

const PROFILE = {
  programType: '510K',
  productType: 'device',
  deviceClass: 'II',
  primaryAgency: 'FDA',
  targetAgencies: ['FDA'],
  isElectrical: true,
  hasPatientContact: true,
};

beforeEach(() => {
  applicabilityRows = [];
});

describe('applicabilityGapReport — assessed vs clear', () => {
  it('reports NOT assessed, and no conformance counts, when no applicability row exists', async () => {
    const report = await applicabilityGapReport('prog-1', PROFILE);

    expect(report.assessed).toBe(false);
    expect(report.summary.assessed).toBe(false);
    expect(report.summary.examinedCount).toBe(0);
    // The two counts filtered from rows on file say nothing, rather than zero.
    expect(report.summary.nonConformantCount).toBeNull();
    expect(report.summary.missingEvidenceCount).toBeNull();
    // The gap side is honest in this state: everything recommended is missing.
    expect(report.summary.missingCount).toBeGreaterThan(0);
  });

  it('counts conformance once at least one standard has been assessed', async () => {
    applicabilityRows = [
      {
        id: 'a-1',
        programId: 'prog-1',
        standardId: STANDARDS[0].id,
        applicability: 'applies',
        conformanceStatus: 'non_conformant',
        primaryEvidenceId: null,
      },
    ];

    const report = await applicabilityGapReport('prog-1', PROFILE);

    expect(report.assessed).toBe(true);
    expect(report.summary.examinedCount).toBe(1);
    expect(report.summary.nonConformantCount).toBe(1);
    expect(report.summary.missingEvidenceCount).toBe(1);
  });
});
