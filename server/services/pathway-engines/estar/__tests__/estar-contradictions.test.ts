/**
 * eSTAR technical screening: device answers that contradict authored content.
 *
 * FDA does not put an eSTAR 510(k) through refuse-to-accept. It runs a technical
 * screening within 15 days. That screening checks two things: that each
 * applicable attachment-type question has a relevant attachment, and that the
 * eSTAR responses accurately describe the device. A submission with an
 * inaccurate response can be put on a technical-screening hold for up to 180
 * days (basis: g-estar-technical-screening-contradictions-facts.md).
 *
 * The flag-driven `missingRequired` already covers the attachment half. Nothing
 * covered the accuracy half. A program that answered "sterile: no" while
 * holding an approved sterilization validation was scored ready, and
 * assembleDeviceSubmission reported a producible official eSTAR.
 */
import { describe, it, expect } from 'vitest';
import { mapToEstar, type EstarInputLeaf, type DeviceFlags } from '../estar-mapper';
import { assembleDeviceSubmission } from '../../device-assembly/assemble-device-submission';

/* Every always-required 510(k) slot, substantive, and nothing that matches a
   conditional slot. With PLAIN_DEVICE this scores ready. */
const complete510k: EstarInputLeaf[] = [
  { sectionCode: '1', title: 'Cover letter', substantive: true },
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

const PLAIN_DEVICE: DeviceFlags = {
  combinationProduct: false,
  softwareAiMl: false,
  cyberDevice: false,
  sterile: false,
  implantable: false,
  cliaWaived: false,
  clinicalData: false,
};

const sterilizationValidation: EstarInputLeaf = {
  sectionCode: 'D4', title: 'Sterilization validation', substantive: true,
};

const TEMPLATE_510K_DEVICE = 'eSTAR-510k-non-ivd.pdf';

describe('mapToEstar summary.contradictions (eSTAR technical screening: responses must describe the device)', () => {
  it('reports sterile = no against a substantive sterilization validation, and is not ready', () => {
    const r = mapToEstar({ type: '510k', leaves: [...complete510k, sterilizationValidation], flags: PLAIN_DEVICE });
    expect(r.summary.contradictions).toEqual([
      { section: 'sterilization', flag: 'sterile', sources: ['D4'] },
    ]);
    expect(r.summary.ready).toBe(false);
    // Not a missing section, and not an unanswered question.
    expect(r.summary.missingRequired).toEqual([]);
    expect(r.summary.undetermined).toEqual([]);
  });

  it('is empty, and ready, for the same content without the contradicting section', () => {
    const r = mapToEstar({ type: '510k', leaves: complete510k, flags: PLAIN_DEVICE });
    expect(r.summary.contradictions).toEqual([]);
    expect(r.summary.ready).toBe(true);
  });

  it('does not count a draft: a non-substantive sterilization leaf contradicts nothing', () => {
    const r = mapToEstar({
      type: '510k',
      leaves: [...complete510k, { ...sterilizationValidation, substantive: false }],
      flags: PLAIN_DEVICE,
    });
    expect(r.summary.contradictions).toEqual([]);
  });

  it('does not report a contradiction when the answer is yes, or when nobody answered', () => {
    const yes = mapToEstar({ type: '510k', leaves: [sterilizationValidation], flags: { ...PLAIN_DEVICE, sterile: true } });
    expect(yes.summary.contradictions).toEqual([]);
    // Unanswered is undetermined, never "no". An unanswered question cannot be contradicted.
    const unanswered = mapToEstar({ type: '510k', leaves: [sterilizationValidation] });
    expect(unanswered.summary.contradictions).toEqual([]);
  });

  it('reports software = no against an authored software section', () => {
    const r = mapToEstar({
      type: 'de_novo',
      leaves: [{ sectionCode: 'D4', title: 'Software and firmware', substantive: true }],
      flags: PLAIN_DEVICE,
    });
    expect(r.summary.contradictions).toEqual([
      { section: 'software', flag: 'softwareAiMl', sources: ['D4'] },
    ]);
  });

  /* Shelf life and packaging are owed by non-sterile devices too. The
     sterilization slot matches them so that a sterile device's shelf-life
     section counts, but authoring one says nothing about sterility. */
  it('does not read a shelf-life or packaging section as a claim that the device is sterile', () => {
    const r = mapToEstar({
      type: '510k',
      leaves: [{ sectionCode: 'D5', title: 'Shelf life and packaging', substantive: true }],
      flags: PLAIN_DEVICE,
    });
    expect(r.summary.contradictions).toEqual([]);
  });

  /* A reusable device supplied non-sterile is sterilized by the user; its
     reprocessing section validates that. It does not contradict sterile = no. */
  it('does not read a reprocessing section that covers user sterilization as a contradiction', () => {
    const r = mapToEstar({
      type: '510k',
      leaves: [{ sectionCode: 'D3', title: 'Reprocessing: cleaning and sterilization validation', substantive: true }],
      flags: PLAIN_DEVICE,
    });
    expect(r.summary.contradictions).toEqual([]);
  });

  /* FDA's premarket cybersecurity guidance covers devices with software or
     programmable logic generally; a cyber device under §524B is a subset. A
     cybersecurity section on a device that is not a cyber device is expected,
     not inaccurate. */
  it('does not treat cybersecurity documentation on a non-cyber device as a contradiction', () => {
    const r = mapToEstar({
      type: '510k',
      leaves: [{ sectionCode: 'E3', title: 'Cybersecurity risk assessment', substantive: true }],
      flags: { ...PLAIN_DEVICE, softwareAiMl: true },
    });
    expect(r.summary.contradictions).toEqual([]);
  });
});

describe('assembleDeviceSubmission surfaces the contradiction as a blocker', () => {
  const base = {
    pathway: '510k' as const,
    variant: 'device' as const,
    deviceFlags: PLAIN_DEVICE,
    presentTemplates: [TEMPLATE_510K_DEVICE],
    environment: 'production' as const,
    requireTemplate: true,
  };

  it('holds back an official eSTAR whose answers contradict its own content, and says why', () => {
    const r = assembleDeviceSubmission({ ...base, leaves: [...complete510k, sterilizationValidation] });
    expect(r.canProduceOfficialEstar).toBe(false);
    expect(r.artifactKind).toBe('content-package-draft');
    const text = r.blockers.join('\n');
    expect(text).toMatch(/technical screening/i);
    expect(text).toMatch(/sterilization/);
    expect(text).toMatch(/Sterile/);
    expect(text).toMatch(/D4/);
    expect(text).not.toMatch(/\bRTA\b/);
  });

  it('still produces the official eSTAR for the same program without the contradicting section', () => {
    const r = assembleDeviceSubmission({ ...base, leaves: complete510k });
    expect(r.canProduceOfficialEstar).toBe(true);
    expect(r.blockers).toEqual([]);
  });
});

describe('vocabulary: 510(k) and De Novo are screened, not refused', () => {
  it('no 510(k) or De Novo slot authority calls a gap an RTA ground', () => {
    for (const type of ['510k', 'de_novo'] as const) {
      const r = mapToEstar({ type, leaves: [], flags: PLAIN_DEVICE });
      for (const s of r.sections) expect(s.authority, `${type}/${s.id}`).not.toMatch(/\bRTA\b/);
    }
  });
});
