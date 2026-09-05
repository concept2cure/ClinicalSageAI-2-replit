/**
 * A CMC Module 3 filing must never assert a stability CONCLUSION the recorded
 * data does not establish — a failing/absent stability study must not read as a
 * passing one. Guards the fix in "fix(cmc): stop fabricating stability
 * conclusions and compendial method basis in Module 3".
 */
import { describe, expect, it } from 'vitest';
import { composeModule3FromCanonicalSources } from '../module3Composer';

const src = (sourceType: string, sourcePayload: Record<string, unknown>, id = '1') =>
  ({ id, sourceType, sourcePayload, sourceHash: `h-${id}` }) as any;

describe('module3Composer — stability conclusions are not fabricated', () => {
  it('3.2.S.7 does NOT assert "is stable" when the data shows OOS/degradation', () => {
    const sections = composeModule3FromCanonicalSources([
      src('drug_substance', { name: 'API-1' }),
      src('stability', {
        storageCondition: '25°C/60%RH',
        timePoints: [0, 3, 6],
        status: 'Assay out-of-specification at 6 months; degradation observed',
      }, '2'),
    ]);
    const s = sections.find((x) => x.sectionKey === '3.2.S.7');
    expect(s?.narrativeDraft).toBeDefined();
    // The old code appended "the drug substance is stable ..." unconditionally.
    expect(s!.narrativeDraft).not.toMatch(/is stable under the proposed storage conditions/i);
    expect(s!.narrativeDraft).toMatch(/out-of-specification|degradation|subject to review/i);
  });

  it('3.2.S.7 defers (does not assert stability) when no results are present', () => {
    const sections = composeModule3FromCanonicalSources([
      src('drug_substance', { name: 'API-1' }),
      src('stability', { storageCondition: '25°C/60%RH', timePoints: [0, 3] }, '2'),
    ]);
    const s = sections.find((x) => x.sectionKey === '3.2.S.7');
    expect(s!.narrativeDraft).not.toMatch(/is stable under the proposed storage conditions/i);
    expect(s!.narrativeDraft).toMatch(/subject to review|not asserted/i);
  });

  it('3.2.P.8 does NOT claim stability studies/shelf-life when only comparability is present', () => {
    const sections = composeModule3FromCanonicalSources([
      src('drug_product', { name: 'DP-1' }),
      src('comparability', { comparabilityStatus: 'Comparable' }, '2'),
    ]);
    const s = sections.find((x) => x.sectionKey === '3.2.P.8');
    expect(s?.narrativeDraft).toBeDefined();
    expect(s!.narrativeDraft).not.toMatch(/Stability studies support a shelf life/i);
    expect(s!.narrativeDraft).not.toMatch(/drug product is stable under the proposed storage conditions/i);
    expect(s!.narrativeDraft).toMatch(/No drug product stability study is present/i);
  });

  it('spec tables do not fabricate a "Per monograph" compendial basis when no method is recorded', () => {
    const sections = composeModule3FromCanonicalSources([
      src('drug_substance', { name: 'API-1' }),
      src('specification', { acceptanceCriteria: { Assay: '95.0–105.0%' } }, '2'),
    ]);
    const s = sections.find((x) => x.sectionKey === '3.2.S.4');
    expect(JSON.stringify(s)).not.toContain('Per monograph');
  });
});
