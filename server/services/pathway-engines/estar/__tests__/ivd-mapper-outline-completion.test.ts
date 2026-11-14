import { describe, expect, it } from 'vitest';
import { mapToEstar, type DeviceFlags, type EstarInputLeaf } from '../estar-mapper';
import { estarOutlineRequirements } from '../estar-outline-requirements';
import { assessEstarFilingReadiness } from '../estar-filing-readiness';

const FLAGS: DeviceFlags = {
  combinationProduct: false, softwareAiMl: false, cyberDevice: false,
  sterile: false, implantable: false, cliaWaived: false, clinicalData: false,
};

const leaf = (sectionCode: string, title: string, documentType: string): EstarInputLeaf => ({
  sectionCode, title, documentType, substantive: true,
});

/** Administrative/labeling/SE/analytical evidence and an accountable biocompatibility review, without bench/animal content. */
const IVD_CONTENT: EstarInputLeaf[] = [
  leaf('A1', 'Cover letter', 'cover_letter'),
  leaf('A5', '510(k) summary', '510k_summary'),
  leaf('A6', 'Truthful and accurate statement', 'truthful_accurate'),
  leaf('A9', 'MDUFA user fee and payment', 'user_fee'),
  leaf('B1', 'Device description', 'device_description'),
  leaf('B2', 'Indications for use', 'indications_for_use'),
  leaf('C2', 'Substantial equivalence comparison', 'substantial_equivalence'),
  leaf('D2', 'Proposed labeling and instructions for use', 'labeling'),
  leaf('E1', 'Biocompatibility — reviewed evidence or non-contact rationale', 'biocompatibility'),
  leaf('E9', 'Analytical performance — assay and instrument performance', 'analytical_performance'),
];

describe('IVD 510(k) requirements follow the IVD performance and contact questions', () => {
  it('requires analytical and contact-review evidence without requiring a second bench/animal report', () => {
    const result = mapToEstar({ type: '510k', variant: 'ivd', flags: FLAGS, leaves: IVD_CONTENT });
    expect(result.sections.find((s) => s.id === 'performance-testing')).toMatchObject({
      label: 'Animal performance testing (where applicable)', present: false, required: false,
      applicability: 'when-applicable',
    });
    expect(result.sections.find((s) => s.id === 'ivd-analytical-performance')).toMatchObject({
      present: true, required: true, applicability: 'required', sources: ['E9'],
    });
    expect(result.summary.missingRequired).toEqual([]);
    expect(result.summary.checkApplicability).toContain('performance-testing');
    expect(result.summary.ready).toBe(true);
  });

  it.each([undefined, FLAGS, { ...FLAGS, sterile: true, implantable: true, clinicalData: true }])(
    'keeps contact review required without inferring a recorded answer from unrelated flags: %j', (flags) => {
      const result = mapToEstar({ type: '510k', variant: 'ivd', flags, leaves: [] });
      expect(result.sections.find((s) => s.id === 'biocompatibility')).toMatchObject({
        present: false, required: true, necessity: 'always', applicability: 'required',
      });
      expect(result.summary.checkApplicability).not.toContain('biocompatibility');
      expect(result.summary.missingRequired).toContain('biocompatibility');
    },
  );

  it('refuses ready when the tissue-contact assessment has no substantive review record', () => {
    const leaves = IVD_CONTENT.filter((s) => s.sectionCode !== 'E1');
    const result = mapToEstar({ type: '510k', variant: 'ivd', flags: FLAGS, leaves });
    expect(result.summary.missingRequired).toEqual(['biocompatibility']);
    expect(result.summary.ready).toBe(false);
    const filing = assessEstarFilingReadiness({
      catalogKey: '510k', variant: 'ivd', deviceFlags: FLAGS, leaves,
      registration: { clientId: 'test-client', satisfied: ['cdrh_portal_account', 'organization_identity', 'mdufa_fee_account'] },
      templateAvailable: true, fieldMapPopulated: true,
    });
    expect(filing?.contentReady).toBe(false);
    expect(filing?.canFileNow).toBe(false);
  });

  it('matches animal testing only, not analytical or legacy bench evidence, for the conditional FDA animal branch', () => {
    const ordinary = mapToEstar({ type: '510k', variant: 'ivd', flags: FLAGS, leaves: [
      ...IVD_CONTENT, leaf('E5', 'Bench performance testing', 'bench_testing'),
    ] });
    expect(ordinary.sections.find((s) => s.id === 'performance-testing')).toMatchObject({ present: false, sources: [] });
    const animal = mapToEstar({ type: '510k', variant: 'ivd', flags: FLAGS, leaves: [
      ...IVD_CONTENT, leaf('E6', 'Animal performance testing', 'animal_testing'),
    ] });
    expect(animal.sections.find((s) => s.id === 'performance-testing')).toMatchObject({
      present: true, required: false, applicability: 'when-applicable', sources: ['E6'],
    });
    expect(animal.sections.find((s) => s.id === 'ivd-analytical-performance')?.sources).toEqual(['E9']);
  });

  it('keeps absent analytical evidence as the blocking required gap', () => {
    const result = mapToEstar({
      type: '510k', variant: 'ivd', flags: FLAGS,
      leaves: IVD_CONTENT.filter((s) => s.sectionCode !== 'E9'),
    });
    expect(result.summary.missingRequired).toEqual(['ivd-analytical-performance']);
    expect(result.summary.ready).toBe(false);
  });

  it('keeps a matching analytical placeholder absent', () => {
    const result = mapToEstar({
      type: '510k', variant: 'ivd', flags: FLAGS,
      leaves: IVD_CONTENT.map((s) => s.sectionCode === 'E9' ? { ...s, substantive: false } : s),
    });
    expect(result.summary.missingRequired).toEqual(['ivd-analytical-performance']);
    expect(result.summary.ready).toBe(false);
  });

  it('projects the same analytical and contact requirements into the governed outline', () => {
    const result = estarOutlineRequirements({
      type: '510k', variant: 'ivd', flags: FLAGS,
      sections: [
        { key: 'E1', label: 'Biocompatibility', mandatory: true },
        { key: 'E9', label: 'Analytical performance — assay and instrument performance', mandatory: true },
      ],
    });
    expect(result.byKey.get('E1')).toMatchObject({
      decidedBy: 'mapper', requirement: 'required', mark: 'Required', blocker: 'Mandatory section — no content yet',
    });
    expect(result.byKey.get('E9')).toMatchObject({
      decidedBy: 'mapper', requirement: 'required', slotId: 'ivd-analytical-performance',
      blocker: 'Mandatory section — no content yet',
    });
    expect(result.unplaced).toContainEqual(expect.objectContaining({ slotId: 'performance-testing', applicability: 'when-applicable' }));
    expect(result.unplaced.map((s) => s.slotId)).not.toContain('ivd-analytical-performance');
  });

  it('allows the content projection while retaining the separate official-template release gate', () => {
    const result = assessEstarFilingReadiness({
      catalogKey: '510k', variant: 'ivd', deviceFlags: FLAGS, leaves: IVD_CONTENT,
      registration: { clientId: 'test-client', satisfied: ['cdrh_portal_account', 'organization_identity', 'mdufa_fee_account'] },
      templateAvailable: false, fieldMapPopulated: false,
    });
    expect(result?.contentReady).toBe(true);
    expect(result?.missingSections).toEqual([]);
    expect(result?.canFileNow).toBe(false);
    expect(result?.blockers.length).toBeGreaterThan(0);
  });

});

describe('the retained non-IVD and De Novo requirements', () => {
  it.each(['device', undefined] as const)('preserves non-IVD bench and contact requirements for %s', (variant) => {
    const result = mapToEstar({ type: '510k', variant, flags: FLAGS, leaves: IVD_CONTENT.filter((s) => s.sectionCode !== 'E1') });
    expect(result.summary.missingRequired).toEqual(['performance-testing', 'biocompatibility']);
    expect(result.sections.some((s) => s.id.startsWith('ivd-'))).toBe(false);
    expect(result.summary.ready).toBe(false);
  });

  it('preserves the separate De Novo registry for both family templates', () => {
    const device = mapToEstar({ type: 'de_novo', variant: 'device', flags: FLAGS, leaves: [] });
    const ivd = mapToEstar({ type: 'de_novo', variant: 'ivd', flags: FLAGS, leaves: [] });
    expect(ivd).toEqual(device);
    expect(ivd.summary.missingRequired).toEqual(expect.arrayContaining(['performance-testing', 'biocompatibility']));
  });
});
