/**
 * planDeviceSubmission (the AnA tool `plan_device_submission`) must ask a device
 * client for the forms FDA actually takes, on the pathway they are filing.
 *
 * 510(k) and De Novo are eSTAR submissions (510(k) mandatory from 2023-10-01,
 * De Novo from 2025-10-01), filed through the CDRH Portal. FDA's eSTAR page:
 * "you do not need to provide a Premarket Review Submission Cover Sheet (Form
 * FDA 3514) with your eSTAR". So a 510(k)/De Novo plan that demands the 3514
 * and "eCopy" packaging sends the client to produce a form FDA does not want.
 *
 * Their content list is not this file's to keep: it is the eSTAR slot registry
 * in pathway-engines/estar/estar-mapper.ts, which the readiness engine scores
 * against. The plan must name the same sections, or the plan and the readiness
 * verdict disagree about what a filing needs.
 *
 * HDE is not an eSTAR pathway and keeps the 3514 (and the eCopy); a device-led
 * BLA's application form is Form FDA 356h, not the CDRH cover sheet.
 */
import { describe, it, expect } from 'vitest';
import {
  planDeviceSubmission,
  type PlanDeviceSubmissionParams,
  type SubmissionSection,
} from '../medical-device-knowledge';
import { estarSlots } from '../../pathway-engines/estar/estar-mapper';

const text = (sections: SubmissionSection[]): string =>
  sections.map((s) => [s.title, s.contents, s.citation.source, s.citation.note ?? ''].join(' ')).join('\n');

const plan = (p: PlanDeviceSubmissionParams) => planDeviceSubmission(p);

describe('planDeviceSubmission — eSTAR pathways do not ask for the retired cover sheet', () => {
  for (const usPathway of ['510(k)', 'De Novo'] as const) {
    it(`${usPathway} names neither Form FDA 3514 nor eCopy`, () => {
      const out = text(plan({ usPathway, asOf: '2026-10-04' }).usSections);
      expect(out).not.toMatch(/3514|ecopy/i);
    });
  }

  it('the 510(k) plan carries every always-required eSTAR slot, by id and label', () => {
    const sections = plan({ usPathway: '510(k)', asOf: '2026-10-04' }).usSections;
    for (const slot of estarSlots('510k').filter((s) => s.necessity === 'always')) {
      const hit = sections.find((s) => s.sectionId === slot.id);
      expect(hit, slot.id).toBeDefined();
      expect(hit!.title).toBe(slot.label);
      expect(hit!.citation.source).toBe(slot.authority);
    }
  });

  it('the De Novo plan carries every always-required eSTAR slot, by id and label', () => {
    const sections = plan({ usPathway: 'De Novo', asOf: '2026-10-04' }).usSections;
    for (const slot of estarSlots('de_novo').filter((s) => s.necessity === 'always')) {
      const hit = sections.find((s) => s.sectionId === slot.id);
      expect(hit, slot.id).toBeDefined();
      expect(hit!.title).toBe(slot.label);
    }
  });

  it('an IVD 510(k) is planned against the IVD eSTAR, which asks for analytical performance', () => {
    const ids = plan({ usPathway: '510(k)', isIVD: true }).usSections.map((s) => s.sectionId);
    expect(ids).toContain('ivd-analytical-performance');
    const nonIvd = plan({ usPathway: '510(k)' }).usSections.map((s) => s.sectionId);
    expect(nonIvd).not.toContain('ivd-analytical-performance');
  });

  it('the plan names exactly the eSTAR sections — no parallel hand-written list beside them', () => {
    const sections = plan({ usPathway: '510(k)', sterile: true, hasSoftware: true, clinicalDataIncluded: true }).usSections;
    const registry = new Set(estarSlots('510k').map((s) => s.id));
    expect(sections.map((s) => s.sectionId).filter((id) => !registry.has(id))).toEqual([]);
  });

  it('a conditional section follows the device answer, and an unanswered one says it is undetermined', () => {
    const sterile = plan({ usPathway: '510(k)', sterile: true }).usSections.find((s) => s.sectionId === 'sterilization');
    expect(sterile?.contents).toMatch(/^Required\b/);

    const notSterile = plan({ usPathway: '510(k)', sterile: false }).usSections.find((s) => s.sectionId === 'sterilization');
    expect(notSterile).toBeUndefined();

    // Not asked is not the same as not needed: it stays on the plan, marked.
    const unknown = plan({ usPathway: '510(k)' }).usSections.find((s) => s.sectionId === 'sterilization');
    expect(unknown?.contents).toMatch(/undetermined/i);

    // Cyber-device status is not a plan input at all, so it is always undetermined, never dropped.
    const cyber = plan({ usPathway: '510(k)', hasSoftware: true }).usSections.find((s) => s.sectionId === 'cybersecurity');
    expect(cyber?.contents).toMatch(/undetermined/i);

    // CLIA applies only to IVDs: a device stated not to be one is answered.
    const clia = (isIVD?: boolean) =>
      plan({ usPathway: '510(k)', isIVD }).usSections.find((s) => s.sectionId === 'clia-waiver');
    expect(clia(false)).toBeUndefined();
    expect(clia(undefined)?.contents).toMatch(/undetermined/i);
  });
});

describe('planDeviceSubmission — non-eSTAR pathways', () => {
  it('HDE keeps the CDRH cover sheet (Form FDA 3514) and the eCopy', () => {
    const out = text(plan({ usPathway: 'HDE' }).usSections);
    expect(out).toMatch(/3514/);
    expect(out).toMatch(/eCopy/);
  });

  it('HDE is not told to pay a MDUFA user fee (HDE applications are fee-exempt)', () => {
    const admin = plan({ usPathway: 'HDE' }).usSections.find((s) => s.sectionId === 'admin');
    expect(admin).toBeDefined();
    expect(admin!.contents).not.toMatch(/user[- ]fee payment/i);
  });

  it('a device-led BLA names Form FDA 356h, not the CDRH cover sheet', () => {
    const out = text(plan({ usPathway: 'BLA' }).usSections);
    expect(out).toMatch(/356h/);
    expect(out).not.toMatch(/3514/);
  });

  it('an undetermined pathway does not pick a form for the client', () => {
    const admin = plan({ usPathway: 'undetermined' }).usSections.find((s) => s.sectionId === 'admin');
    expect(admin).toBeDefined();
    expect(admin!.contents).toMatch(/depends on the pathway/i);
  });
});
