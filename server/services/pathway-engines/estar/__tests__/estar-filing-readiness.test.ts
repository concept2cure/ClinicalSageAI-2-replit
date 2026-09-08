import { describe, it, expect } from 'vitest';
import {
  assessEstarFilingReadiness,
  type FilingLeaf,
} from '../estar-filing-readiness';
import type { EstarClientRegistration } from '../estar-registration';

const ALL_REGISTERED: EstarClientRegistration = {
  clientId: 'org-1',
  satisfied: ['fda_esg_account', 'cdrh_portal_account', 'organization_identity', 'mdufa_fee_account'],
};
const UNREGISTERED: EstarClientRegistration = { clientId: 'org-0', satisfied: [] };
// Everything except the MDUFA fee account (enough for fee-exempt request types).
const REQUEST_ONLY: EstarClientRegistration = {
  clientId: 'org-2',
  satisfied: ['fda_esg_account', 'cdrh_portal_account', 'organization_identity'],
};

const leaf = (sectionCode: string, title: string, documentType?: string, substantive = true): FilingLeaf => ({
  sectionCode,
  title,
  documentType,
  substantive,
});

// Leaves covering every REQUIRED 510(k) eSTAR section.
/* A genuinely complete 510(k). Five of these leaves were absent from this
   fixture before W1-5 — the CDRH cover sheet, the user-fee cover sheet, the
   Truthful and Accurate Statement, the risk management file and the 510(k)
   Summary — because the model did not have those sections, so a submission
   without them was described here as complete. Two of them are statutory
   grounds for refusing acceptance. */
const complete510kLeaves: FilingLeaf[] = [
  leaf('1', 'Cover letter', 'cover_letter'),
  leaf('1b', 'CDRH cover sheet 3514', 'cdrh_cover_sheet'),
  leaf('1c', 'MDUFA user fee cover sheet 3601', 'user_fee'),
  leaf('2', 'Indications for use', 'indications_for_use'),
  leaf('2b', 'Truthful and accurate statement', 'truthful_accurate'),
  leaf('3', 'Device description', 'device_description'),
  leaf('4', 'Proposed labeling', 'labeling'),
  leaf('4b', 'Risk management file', 'risk_management'),
  leaf('5', 'Biocompatibility', 'biocompatibility'),
  leaf('6', 'Performance testing', 'performance_testing'),
  leaf('7', 'Substantial equivalence', 'substantial_equivalence'),
  leaf('8', '510(k) Summary', '510k_summary'),
];

/* A device that is none of the conditional things. Content readiness is only
   answerable once these are known: without them the conditional sections are
   undetermined, and an undetermined section is a gap, not a satisfied one. */
const PLAIN_DEVICE = {
  combinationProduct: false,
  softwareAiMl: false,
  cyberDevice: false,
  sterile: false,
  implantable: false,
  cliaWaived: false,
  clinicalData: false,
} as const;

describe('assessEstarFilingReadiness', () => {
  it('returns undefined for an unknown catalog key', () => {
    expect(
      assessEstarFilingReadiness({
        catalogKey: 'nonexistent' as never,
        variant: 'device',
        registration: ALL_REGISTERED,
        leaves: [],
      }),
    ).toBeUndefined();
  });

  it('does not report 100% complete while listing sections as missing', () => {
    // Without deviceFlags every conditional section (sterilization, software,
    // cybersecurity, …) is UNDETERMINED. Those were reported inside
    // missingSections but excluded from the completeness denominator, so a
    // submission with every known-required section present rendered
    // "Content incomplete (100%): missing required sections sterilization,
    // software, cybersecurity." A number that contradicts the list beside it
    // tells the reader nothing.
    const r = assessEstarFilingReadiness({
      catalogKey: '510k',
      variant: 'device',
      registration: ALL_REGISTERED,
      leaves: complete510kLeaves,
      templateAvailable: true,
      fieldMapPopulated: true,
    })!;
    expect(r.contentReady).toBe(false);
    expect(r.missingSections.length).toBeGreaterThan(0);
    expect(r.completeness).toBeLessThan(100);
    const line = r.blockers.find((b) => b.startsWith('Content incomplete'))!;
    expect(line).toBeDefined();
    expect(line).not.toMatch(/\(100%\)/);
    // And it says which problem it is: a question to answer, not a document to write.
    expect(line).toMatch(/await an applicability answer, not a document/);
  });

  it('an unregistered client is not eligible and cannot file', () => {
    const r = assessEstarFilingReadiness({
      catalogKey: '510k',
      variant: 'device',
      registration: UNREGISTERED,
      leaves: complete510kLeaves,
      deviceFlags: PLAIN_DEVICE,
      templateAvailable: true,
      fieldMapPopulated: true,
    })!;
    expect(r.eligible).toBe(false);
    expect(r.registrationMissing.length).toBeGreaterThan(0);
    expect(r.canFileNow).toBe(false);
    expect(r.blockers.some((b) => /not registered/i.test(b))).toBe(true);
  });

  it('canFileNow is true only when registered + content complete + template producible', () => {
    const r = assessEstarFilingReadiness({
      catalogKey: '510k',
      variant: 'device',
      registration: ALL_REGISTERED,
      leaves: complete510kLeaves,
      deviceFlags: PLAIN_DEVICE,
      templateAvailable: true,
      fieldMapPopulated: true,
    })!;
    expect(r.eligible).toBe(true);
    expect(r.contentReady).toBe(true);
    expect(r.completeness).toBe(100);
    expect(r.officialTemplateProducible).toBe(true);
    expect(r.canFileNow).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('fails closed on producibility by default (honest — no submittable eSTAR claimed)', () => {
    const r = assessEstarFilingReadiness({
      catalogKey: '510k',
      variant: 'device',
      registration: ALL_REGISTERED,
      leaves: complete510kLeaves,
      deviceFlags: PLAIN_DEVICE,
      // templateAvailable / fieldMapPopulated omitted → default false
    })!;
    expect(r.eligible).toBe(true);
    expect(r.contentReady).toBe(true);
    expect(r.officialTemplateProducible).toBe(false);
    expect(r.canFileNow).toBe(false);
    expect(r.blockers.some((b) => /submittable eSTAR/i.test(b))).toBe(true);
  });

  it('surfaces the template family, current version, and OMB numbers per submission', () => {
    const k510 = assessEstarFilingReadiness({
      catalogKey: '510k',
      variant: 'device',
      registration: ALL_REGISTERED,
      leaves: [],
    })!;
    expect(k510.family).toBe('nivd');
    expect(k510.currentVersion).toBe('7.0');
    expect(k510.ombNumbers).toContain('0910-0120');

    const ivd = assessEstarFilingReadiness({
      catalogKey: '510k',
      variant: 'ivd',
      registration: ALL_REGISTERED,
      leaves: [],
    })!;
    expect(ivd.family).toBe('ivd');

    const qsub = assessEstarFilingReadiness({
      catalogKey: 'qsub_pre_submission',
      variant: 'device',
      registration: ALL_REGISTERED,
      leaves: [],
    })!;
    expect(qsub.family).toBe('prestar');
    expect(qsub.currentVersion).toBe('3.0');
    expect(qsub.ombNumbers).toContain('0910-0756');
  });

  it('dispatches PMA keys to the PMA mapper with per-submission-type required sections', () => {
    const r = assessEstarFilingReadiness({
      catalogKey: 'pma_30_day_notice',
      variant: 'device',
      registration: ALL_REGISTERED,
      leaves: [],
    })!;
    expect(r.programType).toBe('pma');
    expect(r.contentReady).toBe(false);
    // A 30-day manufacturing notice (814.39(f)) requires admin + manufacturing —
    // NOT the full original-PMA clinical package. PMA section ids, not eSTAR ones.
    expect(r.missingSections).toContain('manufacturing');
    expect(r.missingSections).toContain('admin-regulatory');
    expect(r.missingSections).not.toContain('clinical');
  });

  it('dispatches Q-Sub keys to the PreSTAR mapper (reports Q-Sub-specific gaps)', () => {
    const r = assessEstarFilingReadiness({
      catalogKey: 'qsub_pre_submission',
      variant: 'device',
      registration: ALL_REGISTERED,
      leaves: [],
    })!;
    expect(r.programType).toBe('q_sub');
    expect(r.missingSections).toContain('questions');
    expect(r.missingSections).toContain('background-rationale');
  });

  it('dispatches IDE and 513(g) keys to the PreSTAR mapper', () => {
    const ide = assessEstarFilingReadiness({
      catalogKey: 'ide',
      variant: 'device',
      registration: ALL_REGISTERED,
      leaves: [],
    })!;
    expect(ide.missingSections).toContain('investigational-plan');

    const g = assessEstarFilingReadiness({
      catalogKey: '513g',
      variant: 'device',
      registration: ALL_REGISTERED,
      leaves: [],
    })!;
    expect(g.missingSections).toContain('classification-questions');
  });

  it('fee-exempt request types are eligible without the MDUFA fee account; PMA is not', () => {
    const qsub = assessEstarFilingReadiness({
      catalogKey: 'qsub_pre_submission',
      variant: 'device',
      registration: REQUEST_ONLY,
      leaves: [],
    })!;
    expect(qsub.eligible).toBe(true);

    const pma = assessEstarFilingReadiness({
      catalogKey: 'pma_original',
      variant: 'device',
      registration: REQUEST_ONLY,
      leaves: [],
    })!;
    expect(pma.eligible).toBe(false);
    expect(pma.registrationMissing).toContain('mdufa_fee_account');
  });

  it('accumulates every blocker when nothing is ready', () => {
    const r = assessEstarFilingReadiness({
      catalogKey: 'pma_original',
      variant: 'device',
      registration: UNREGISTERED,
      leaves: [],
    })!;
    // registration + content + producibility all blocking.
    expect(r.blockers.length).toBe(3);
    expect(r.canFileNow).toBe(false);
  });
});
