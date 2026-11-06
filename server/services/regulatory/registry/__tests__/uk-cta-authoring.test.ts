import { describe, expect, it } from 'vitest';
import { getApplicationType } from '../../../../../shared/regulatory/global-document-registry.js';
import { getSectionBlueprintForEntry, getTaskBlueprintForEntry } from '../../../../../shared/regulatory/project-bootstrap.js';
import { getResolvedSectionBlueprint, getSectionBlueprint, getSectionBlueprintContext, hasDedicatedSectionBlueprint, requiresSectionApplicabilityAssessment } from '../../sectionBlueprintCatalog.js';
import { getTaskBlueprint } from '../../taskBlueprintCatalog.js';

const uk = getApplicationType('UK_CTA')!;
const outline = () => getResolvedSectionBlueprint(uk);
const row = (code: string) => outline().sections.find(section => section.code === code);

describe('UK CTA preparation uses one medicinal-trial outline', () => {
  it('selects a dedicated IRAS preparation outline through the existing catalog', async () => {
    expect(hasDedicatedSectionBlueprint('UK_CTA')).toBe(true);
    expect(await getSectionBlueprint('UK_CTA')).toBe(outline());
    expect(outline().name).toMatch(/IRAS/);
    expect(outline().sections.every(section => section.code.startsWith('uk_cta_'))).toBe(true);
    expect(new Set(outline().sections.map(section => section.code)).size).toBe(outline().sections.length);
    expect(outline().sections.every(section => [1, 2, 3].includes(section.module))).toBe(true);
  });

  it('preserves the six historical component identities and baseline alternatives', () => {
    for (const code of ['uk_cta_cover_letter', 'uk_cta_application_form', 'uk_cta_protocol', 'uk_cta_ib', 'uk_cta_impd']) {
      expect(row(code)?.required, code).toBe(true);
    }
    expect(row('uk_cta_gmp')?.required).toBe(false);
    expect(row('uk_cta_ib')?.guidance).toMatch(/SmPC/);
    expect(row('uk_cta_ib')?.guidance).toMatch(/authorised conditions.*supplement/i);
    expect(row('uk_cta_impd')?.guidance).toMatch(/simplified|cross.reference/i);
    expect(row('uk_cta_impd')?.guidance).toMatch(/letter of authorisation/i);
  });

  it('prepares product science as evidence groups without demanding standalone uploads', () => {
    for (const code of ['uk_cta_quality', 'uk_cta_nonclinical', 'uk_cta_human_experience', 'uk_cta_benefit_risk', 'uk_cta_labelling']) {
      expect(row(code)?.required, code).toBe(true);
      expect(row(code)?.module, code).toBe(2);
    }
    expect(row('uk_cta_quality')?.guidance).toMatch(/Module 3/);
    expect(row('uk_cta_nonclinical')?.guidance).toMatch(/GLP/);
    expect(row('uk_cta_human_experience')?.guidance).toMatch(/GCP.*registr/i);
    expect(getSectionBlueprintContext('UK_CTA').limitations.join(' ')).toMatch(/not.*duplicate.*standalone.*upload/i);
  });

  it('keeps GMP exceptions and trial-specific reference restrictions explicit', () => {
    expect(row('uk_cta_gmp')?.guidance).toMatch(/UK or EU.*not modified/i);
    expect(row('uk_cta_gmp')?.guidance).toMatch(/simplified.*not.*waiver/i);
    expect(row('uk_cta_impd')?.guidance).toMatch(/GMP.*labelling.*cannot.*previous/i);
    expect(row('uk_cta_gmp')?.guidance).toMatch(/QP|MIA/);
  });

  it('keeps conditional MHRA material unresolved rather than universally mandatory', () => {
    for (const code of ['uk_cta_notifiable', 'uk_cta_scientific_advice', 'uk_cta_specialist', 'uk_cta_ivd', 'uk_cta_decentralised', 'uk_cta_auxiliary']) {
      expect(row(code)?.required, code).toBe(false);
      expect(row(code)?.guidance, code).toMatch(/if|when|applicable/i);
    }
    expect(row('uk_cta_notifiable')?.guidance).toMatch(/Confirmation of notifiable trial criteria/);
    expect(row('uk_cta_notifiable')?.guidance).toMatch(/combined.*approval/i);
  });

  it('separates REC baseline preparation and conditional local-information documents', () => {
    for (const code of ['uk_cta_rec_dataset', 'uk_cta_participant_info', 'uk_cta_ci_cv', 'uk_cta_insurance']) {
      expect(row(code)?.required, code).toBe(true);
      expect(row(code)?.module, code).toBe(3);
    }
    expect(row('uk_cta_insurance')?.guidance).toMatch(/NHS\/HSC.*statement/i);
    expect(row('uk_cta_rec_support')?.required).toBe(false);
    expect(row('uk_cta_local_info')?.required).toBe(false);
    expect(row('uk_cta_local_info')?.guidance).toMatch(/non.commercial.*NHS\/HSC.*SoECAT/i);
  });
});

describe('UK preparation context and shared project bootstrap', () => {
  it('carries dated platform provenance, every relevant source and an unassessed initial-date boundary', () => {
    const context = getSectionBlueprintContext('UK_CTA');
    expect(context.basis).toMatchObject({ confidence: 'platform-convention', checked: '2026-11-06' });
    expect(context.basis?.url).toContain('apply-for-approval-in-the-uk');
    const limits = context.limitations.join(' ');
    expect(limits).toMatch(/initial.*submission date/i);
    expect(limits).toMatch(/28 April 2026/);
    expect(limits).toMatch(/medicinal.*standalone device.*IVD/i);
    expect(limits).toMatch(/platform groups/);
    expect(limits).toMatch(/IRAS.*schema/i);
    expect(limits).toContain('clinical-trials-for-medicines-clinical-trials-regulations-transitional-arrangements');
    expect(limits).toContain('clinical-trials-for-medicines-notifiable-trials');
    expect(limits).toContain('document-management-combined-review-applications');
    expect(requiresSectionApplicabilityAssessment('UK_CTA')).toBe(true);
  });

  it('uses the same section object for client/shared bootstrap and server drafting', () => {
    expect(getSectionBlueprintForEntry(uk)).toBe(outline());
    expect(getSectionBlueprintForEntry(uk).sections.some(section => section.code === 'uk_cta_protocol')).toBe(true);
  });

  it('uses the same dedicated task object for shared and server planning', async () => {
    const tasks = await getTaskBlueprint('UK_CTA');
    expect(tasks.id).toBe('uk_cta_tasks');
    expect(getTaskBlueprintForEntry({ ...uk, defaultTaskBlueprint: 'uk_cta_tasks' })).toBe(tasks);
    const descriptions = tasks.milestones.flatMap(milestone => milestone.tasks).map(task => task.description).join(' ');
    expect(descriptions).toMatch(/initial.*submission date/i);
    expect(descriptions).toMatch(/IRAS/);
    expect(descriptions).toMatch(/MHRA.*REC.*before.*start/i);
    expect(tasks.milestones.map(milestone => milestone.description).join(' ')).toMatch(/planning estimates.*not agency/i);
  });

  it('keeps US IND and UK marketing on their existing outlines', () => {
    expect(getSectionBlueprintForEntry(getApplicationType('US_IND')!).sections.some(section => section.code === '3.2.S')).toBe(true);
    expect(getSectionBlueprintForEntry(getApplicationType('UK_MA')!).sections.some(section => section.code === '3.2.S')).toBe(true);
    expect(requiresSectionApplicabilityAssessment('US_IND')).toBe(false);
  });
});
