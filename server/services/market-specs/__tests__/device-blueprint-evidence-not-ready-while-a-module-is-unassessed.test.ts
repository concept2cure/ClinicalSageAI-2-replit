/**
 * The blueprint's evidenceReady counts every applicable evidence module
 * (2026-10-15).
 *
 * evidenceReady was `assessedReady.length > 0 && assessedReady.every(Boolean)` over
 * only the modules whose present-section ids were supplied, so an applicable module
 * nobody assessed was dropped from the verdict: an mdr_td blueprint with a complete
 * Risk Management File and no CER sections at all was evidenceReady true — the
 * "dropped dimension" defect the scorecard fix removed from the readiness score.
 * An applicable module nobody assessed now leaves evidenceReady null and is named in
 * evidenceNotAssessed; an assessed module that is not ready still makes it false.
 */
import { describe, it, expect } from 'vitest';
import { buildDeviceBlueprint } from '../device-blueprint';
import { RMF_SECTIONS } from '../risk-management-structure';
import { CER_SECTIONS } from '../cer-structure';

const RMF_COMPLETE = RMF_SECTIONS.filter((s) => s.required).map((s) => s.id);
const CER_COMPLETE = CER_SECTIONS.filter((s) => s.required && !s.equivalenceOnly).map((s) => s.id);
const notAssessed = (bp: ReturnType<typeof buildDeviceBlueprint>) => bp.evidenceNotAssessed.map((m) => m.id);

describe('evidenceReady with an applicable evidence module nobody assessed', () => {
  it('is not true for an mdr_td file with a complete RMF and no CER sections', () => {
    const bp = buildDeviceBlueprint({ submissionType: 'mdr_td', present: { rmfSectionIds: RMF_COMPLETE } });
    expect(bp.evidenceReady, 'the unassessed clinical evaluation was dropped from the verdict').not.toBe(true);
    expect(bp.evidenceReady).toBeNull();
    expect(notAssessed(bp)).toEqual(['clinical_evaluation']);
    expect(bp.evidenceNotAssessed[0].reason).toMatch(/cerSectionIds/);
  });

  it('names an applicable software module whose deliverables nobody listed', () => {
    const bp = buildDeviceBlueprint({
      submissionType: '510k',
      present: { rmfSectionIds: RMF_COMPLETE },
      software: { applicable: true, canContributeToDeathOrSeriousInjury: false, canContributeToNonSeriousInjury: false },
    });
    expect(bp.evidenceReady).toBeNull();
    expect(notAssessed(bp)).toEqual(['software']);
  });

  it('names applicable modules whose evidence the blueprint lists but does not assess', () => {
    const bp = buildDeviceBlueprint({
      submissionType: '510k',
      present: { rmfSectionIds: RMF_COMPLETE },
      contact: { nature: 'skin', duration: 'limited' },
      electrical: { electricallyPowered: true },
      sterilization: { sterile: true, method: 'eo' },
    });
    expect(bp.evidenceReady).toBeNull();
    expect(notAssessed(bp)).toEqual(['biocompatibility', 'electrical_safety', 'sterilization']);
  });

  it('is null, not false, when nothing applicable was assessed', () => {
    const bp = buildDeviceBlueprint({ submissionType: '510k' });
    expect(bp.evidenceReady).toBeNull();
    expect(notAssessed(bp)).toEqual(['risk_management']);
  });
});

describe('evidenceReady once modules are assessed', () => {
  it('is false when an assessed module is not ready, whatever else was not assessed', () => {
    const bp = buildDeviceBlueprint({ submissionType: 'mdr_td', present: { rmfSectionIds: ['plan'] } });
    expect(bp.evidenceReady).toBe(false);
    expect(notAssessed(bp)).toEqual(['clinical_evaluation']);
  });

  it('is true only when every applicable module was assessed and is ready', () => {
    const bp = buildDeviceBlueprint({
      submissionType: 'mdr_td',
      present: { rmfSectionIds: RMF_COMPLETE, cerSectionIds: CER_COMPLETE },
      equivalenceClaimed: false,
    });
    expect(bp.evidenceReady).toBe(true);
    expect(bp.evidenceNotAssessed).toEqual([]);
  });
});
