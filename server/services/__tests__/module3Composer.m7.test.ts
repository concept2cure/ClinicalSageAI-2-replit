/**
 * §3.2.S.3.2 / §3.2.P.5.5 assess a mutagenic impurity under ICH M7(R2).
 *
 * A 'mutagenic' row used to be refused as out of Q3A/Q3B scope and listed
 * under "cannot be compared to a threshold … governed instead by ICH M7" —
 * true, and useless, with the M7 engine unused beside it. The section now
 * classifies it and compares it to the acceptable intake, and counts it under
 * its own guideline rather than folding it into the Q3A/Q3B tally.
 */
import { describe, expect, it } from 'vitest';

import { composeModule3FromCanonicalSources, type CanonicalSource } from '../module3Composer';

const src = (sourceType: CanonicalSource['sourceType'], sourcePayload: Record<string, unknown>, key = 'k'): CanonicalSource =>
  ({ id: key, sourceType, sourceKey: key, sourcePayload, sourceHash: 'h', version: 1 } as unknown as CanonicalSource);

const nitrosamine = (over: Record<string, unknown> = {}) => ({
  scope: 'drug_substance',
  materialName: 'BX-204 drug substance',
  impurityName: 'NDMA',
  impurityType: 'mutagenic',
  observedLevel: '0.02',
  levelUnit: 'ppm',
  maximumDailyDose: '500 mg',
  routeOfAdministration: 'oral',
  amesResult: 'positive',
  structuralAlert: 'yes',
  carcinogenicityData: 'not-tested',
  treatmentDuration: 'lifetime',
  cohortOfConcern: 'CoC_nitrosamine',
  status: 'draft',
  drugSubstanceImpurityProfile: 'NDMA',
  ...over,
});

const tablesToText = (tables: Array<{ rows: unknown[][] }>) => tables.flatMap((t) => t.rows.map((r) => r.join(' | '))).join('\n');

describe('§3.2.S.3 — a mutagenic impurity under ICH M7(R2)', () => {
  it('classifies and compares it, and counts it under M7 rather than refusing it', () => {
    const s3 = composeModule3FromCanonicalSources([src('impurity_profile', nitrosamine())]).find((c) => c.sectionKey === '3.2.S.3')!;
    expect(s3.narrativeDraft).toContain('assessed against ICH M7(R2)');
    expect(s3.narrativeDraft).not.toContain('NDMA — ');
    expect(tablesToText(s3.tables)).toMatch(/ICH M7 Class 2 acceptable intake/);
  });

  it('says so when the level is above the acceptable intake', () => {
    const s3 = composeModule3FromCanonicalSources([src('impurity_profile', nitrosamine({ observedLevel: '5' }))]).find((c) => c.sectionKey === '3.2.S.3')!;
    expect(s3.narrativeDraft).toMatch(/1 of 1 above the acceptable intake/);
    expect(tablesToText(s3.tables)).toMatch(/above the ICH M7 Class 2 acceptable intake/);
  });

  it('still refuses — visibly — when the M7 inputs are not recorded', () => {
    const s3 = composeModule3FromCanonicalSources([src('impurity_profile', nitrosamine({ amesResult: '' }))]).find((c) => c.sectionKey === '3.2.S.3')!;
    expect(s3.narrativeDraft).not.toContain('assessed against ICH M7(R2)');
    expect(s3.narrativeDraft).toMatch(/NDMA — .*Ames/);
  });

  it('carries a Class 4/5 impurity as controlled under Q3A/Q3B, with no TTC limit stated', () => {
    const s3 = composeModule3FromCanonicalSources([src('impurity_profile', nitrosamine({ amesResult: 'negative', structuralAlert: 'no', cohortOfConcern: 'not_coc' }))]).find((c) => c.sectionKey === '3.2.S.3')!;
    expect(s3.narrativeDraft).toMatch(/of Class 4\/5, controlled as non-mutagenic/);
    expect(tablesToText(s3.tables)).toMatch(/ICH M7 Class 5 — controlled as a non-mutagenic impurity/);
    expect(tablesToText(s3.tables)).not.toMatch(/µg\/day/);
  });
});
