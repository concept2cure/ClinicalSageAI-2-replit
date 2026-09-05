import { describe, it, expect } from 'vitest';
import { mapToEstar, type EstarInputLeaf, type DeviceFlags } from '../estar-mapper';

/* Leaves covering every ALWAYS-REQUIRED 510(k) eSTAR section, finalized.
   Five of these did not exist in the model before W1-5 — the CDRH cover sheet,
   the user-fee cover sheet, the Truthful and Accurate Statement, the risk
   management file, and the 510(k) Summary — and two of those are statutory
   grounds for refusing acceptance. */
const complete510kLeaves: EstarInputLeaf[] = [
  { sectionCode: '1', title: 'Cover letter', substantive: true },
  { sectionCode: '1b', title: 'CDRH premarket review submission cover sheet 3514', substantive: true },
  { sectionCode: '1c', title: 'MDUFA user fee cover sheet 3601', substantive: true },
  { sectionCode: '2', title: 'Indications for use', substantive: true },
  { sectionCode: '2b', title: 'Truthful and accurate statement', substantive: true },
  { sectionCode: '3', title: 'Device description', substantive: true },
  { sectionCode: '4', title: 'Proposed labeling and instructions for use', substantive: true },
  { sectionCode: '4b', title: 'Risk management file', substantive: true },
  { sectionCode: '5', title: 'Biocompatibility evaluation', substantive: true },
  { sectionCode: '6', title: 'Performance testing — bench', substantive: true },
  { sectionCode: '7', title: 'Substantial equivalence comparison to predicate', substantive: true },
  { sectionCode: '8', title: '510(k) Summary', substantive: true },
];

/* A device that is none of the conditional things. Supplying the flags is what
   lets the model say a conditional section is NOT needed, rather than that it
   does not know. */
const PLAIN_DEVICE: DeviceFlags = {
  combinationProduct: false,
  softwareAiMl: false,
  cyberDevice: false,
  sterile: false,
  implantable: false,
  cliaWaived: false,
  clinicalData: false,
};

describe('mapToEstar', () => {
  it('is ready when every required 510(k) section is present and the device profile is known', () => {
    const r = mapToEstar({ leaves: complete510kLeaves, type: '510k', flags: PLAIN_DEVICE });
    expect(r.summary.ready).toBe(true);
    expect(r.summary.missingRequired).toEqual([]);
    expect(r.summary.undetermined).toEqual([]);
  });

  it('is NOT ready on the same submission when the device profile is unknown', () => {
    /* This is the defect W1-5 names, in one assertion. The old model answered
       ready:true here — every section it knew about was present — while never
       having asked whether the device is sterile, contains software, or is a
       cyber device. Those sections were `required: false` for every device, so
       their absence was scored as satisfied rather than as unanswered. */
    const r = mapToEstar({ leaves: complete510kLeaves, type: '510k' });
    expect(r.summary.ready).toBe(false);
    // Nothing that is genuinely required is missing...
    expect(r.summary.missingRequired).toEqual([]);
    // ...but the conditional sections cannot be judged without the flags.
    expect(r.summary.undetermined).toContain('sterilization');
    expect(r.summary.undetermined).toContain('software');
    expect(r.summary.undetermined).toContain('cybersecurity');
  });

  it('a sterile device needs its sterilization section, and says so', () => {
    const r = mapToEstar({
      leaves: complete510kLeaves,
      type: '510k',
      flags: { ...PLAIN_DEVICE, sterile: true },
    });
    const sterilization = r.sections.find((s) => s.id === 'sterilization');
    expect(sterilization?.applicability).toBe('required');
    expect(sterilization?.required).toBe(true);
    expect(r.summary.missingRequired).toContain('sterilization');
    expect(r.summary.ready).toBe(false);
  });

  it('a non-sterile device does not, and that is a different answer from "unknown"', () => {
    const r = mapToEstar({ leaves: complete510kLeaves, type: '510k', flags: PLAIN_DEVICE });
    const sterilization = r.sections.find((s) => s.id === 'sterilization');
    expect(sterilization?.applicability).toBe('not-applicable');
    expect(r.summary.undetermined).not.toContain('sterilization');
  });

  it('carries the authority for every section, so a reader can check it', () => {
    const r = mapToEstar({ leaves: [], type: '510k', flags: PLAIN_DEVICE });
    expect(r.sections.every((s) => typeof s.authority === 'string' && s.authority.length > 0)).toBe(true);
    const byId = Object.fromEntries(r.sections.map((s) => [s.id, s.authority]));
    expect(byId['truthful-accurate-statement']).toContain('807.87(k)');
    expect(byId['510k-summary-or-statement']).toContain('807.92');
    expect(byId['cybersecurity']).toContain('524B');
    expect(byId['risk-management']).toContain('14971');
  });

  it('models the statutory sections that were absent entirely before W1-5', () => {
    const ids = new Set(mapToEstar({ leaves: [], type: '510k' }).sections.map((s) => s.id));
    for (const id of [
      '510k-summary-or-statement',
      'truthful-accurate-statement',
      'cdrh-cover-sheet',
      'user-fee-cover-sheet',
      'cybersecurity',
      'risk-management',
      'human-factors',
      'reprocessing',
      'class-iii-certification',
      'clinical-financial-disclosure',
    ]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('does not block readiness on what it genuinely cannot decide, but does report it', () => {
    /* EMC turns on whether the device is electrically powered, which is not one
       of the seven flags. Pretending to know would be worse than saying so. */
    const r = mapToEstar({ leaves: complete510kLeaves, type: '510k', flags: PLAIN_DEVICE });
    const emc = r.sections.find((s) => s.id === 'emc-electrical');
    expect(emc?.applicability).toBe('when-applicable');
    expect(emc?.appliesWhen).toContain('electrically powered');
    expect(r.summary.checkApplicability).toContain('emc-electrical');
    expect(r.summary.ready).toBe(true);
  });

  it('handles empty input honestly (nothing invented)', () => {
    const r = mapToEstar({ leaves: [], type: '510k' });
    expect(r.summary.ready).toBe(false);
    expect(r.sections.every((s) => !s.present)).toBe(true);
  });

  it(
    'honesty fix (confirmed HIGH defect): a required section whose only matching leaf is a ' +
      'draft/placeholder stub is NOT marked present, and does NOT flip the 510(k) to ready — ' +
      'this must fail against the pre-fix code, which set present:true off a title-substring ' +
      'match alone, with no check of content, length, or authoring status',
    () => {
      // "Performance Testing" stub containing only "TBD" — title matches the slot,
      // but it carries no real content. Every other required section is genuinely
      // complete, so this single stub is the only thing standing between the
      // submission and a false "ready".
      const leaves: EstarInputLeaf[] = [
        ...complete510kLeaves.filter((l) => l.sectionCode !== '6'),
        { sectionCode: '6', title: 'Performance testing', documentType: 'performance_testing', substantive: false },
      ];
      const r = mapToEstar({ leaves, type: '510k' });
      const perf = r.sections.find((s) => s.id === 'performance-testing');
      expect(perf?.present).toBe(false);
      expect(r.summary.missingRequired).toContain('performance-testing');
      expect(r.summary.ready).toBe(false);
    },
  );

  it('a section still in draft/in-review status (substantive:false) is a gap even when every other title matches', () => {
    const draftLeaves: EstarInputLeaf[] = complete510kLeaves.map((l) => ({ ...l, substantive: false }));
    const r = mapToEstar({ leaves: draftLeaves, type: '510k' });
    expect(r.sections.every((s) => !s.present)).toBe(true);
    expect(r.summary.ready).toBe(false);
    expect(r.summary.missingRequired.length).toBeGreaterThan(0);
  });

  it('De Novo requires a classification request + special controls (not predicate SE)', () => {
    const r = mapToEstar({ leaves: [], type: 'de_novo' });
    expect(r.sections.some((s) => s.id === 'substantial-equivalence')).toBe(false);
    expect(r.summary.missingRequired).toContain('classification-request');
    expect(r.summary.missingRequired).toContain('special-controls');
  });

  it('matches by documentType as well as title, and only when substantive', () => {
    const present = mapToEstar({
      leaves: [{ sectionCode: 'a', title: 'untitled', documentType: 'device_description', substantive: true }],
      type: '510k',
    });
    expect(present.sections.find((s) => s.id === 'device-description')?.present).toBe(true);

    const notPresent = mapToEstar({
      leaves: [{ sectionCode: 'a', title: 'untitled', documentType: 'device_description', substantive: false }],
      type: '510k',
    });
    expect(notPresent.sections.find((s) => s.id === 'device-description')?.present).toBe(false);
  });
});
