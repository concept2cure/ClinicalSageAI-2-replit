import { describe, expect, it } from 'vitest';
import type { SectionBlueprint } from '../../../../../shared/regulatory/document-taxonomy.js';
import * as euCta from '../blueprints/euCtaBlueprint.js';
import * as canadaCta from '../blueprints/canadaCtaBlueprint.js';

const find = (blueprint: SectionBlueprint, code: string) => blueprint.sections.find(section => section.code === code);

describe('EU CTA uses the medicinal-product CTIS dossier, not a marketing CTD', () => {
  it('has explicit Form/MSC, Part I and Part II authoring groups', () => {
    expect(euCta.sectionBlueprint.name).toContain('CTIS');
    expect(find(euCta.sectionBlueprint, 'FORM.COVER')?.module).toBe(1);
    expect(find(euCta.sectionBlueprint, 'MSC')?.module).toBe(1);
    expect(find(euCta.sectionBlueprint, 'PART_I.PROTOCOL')?.module).toBe(2);
    expect(find(euCta.sectionBlueprint, 'PART_II.CONSENT')?.module).toBe(3);
    expect(euCta.sectionBlueprint.sections.every(section => section.module <= 3)).toBe(true);
    expect(euCta.sectionBlueprint.sections.some(section => /^\d/.test(section.code))).toBe(false);
  });

  it('covers scientific trial and product documents with justified alternatives', () => {
    for (const code of ['PART_I.PROTOCOL', 'PART_I.SYNOPSIS', 'PART_I.IB_SMPC', 'PART_I.IMPD_Q', 'PART_I.IMPD_SE', 'PART_I.LABEL']) {
      expect(find(euCta.sectionBlueprint, code)?.required, code).toBe(true);
    }
    expect(find(euCta.sectionBlueprint, 'PART_I.IB_SMPC')?.guidance).toMatch(/alternative|or SmPC/i);
    expect(find(euCta.sectionBlueprint, 'PART_I.IMPD_Q')?.guidance).toMatch(/simplified|justification/i);
    expect(find(euCta.sectionBlueprint, 'PART_I.IMPD_SE')?.guidance).toMatch(/nonclinical|benefit.risk/i);
    for (const code of ['PART_I.GMP', 'PART_I.AXMP', 'PART_I.SCIENTIFIC_ADVICE', 'PART_I.PIP']) {
      expect(find(euCta.sectionBlueprint, code)?.required, code).toBe(false);
      expect(find(euCta.sectionBlueprint, code)?.guidance, code).toMatch(/applicable|when|if/i);
    }
  });

  it('covers national Part II without treating every possible attachment as universal', () => {
    for (const code of ['PART_II.SITES', 'PART_II.RECRUITMENT', 'PART_II.CONSENT', 'PART_II.INVESTIGATOR', 'PART_II.FACILITIES', 'PART_II.INSURANCE', 'PART_II.FINANCIAL']) {
      expect(find(euCta.sectionBlueprint, code)?.required, code).toBe(true);
    }
    for (const code of ['FORM.FEES', 'PART_II.DATA_PROTECTION', 'PART_II.BIOLOGICAL_SAMPLES']) {
      expect(find(euCta.sectionBlueprint, code)?.required, code).toBe(false);
    }
    expect(find(euCta.sectionBlueprint, 'FORM.GDPR')?.required).toBe(true);
    expect(find(euCta.sectionBlueprint, 'PART_II.CONSENT')?.guidance).toMatch(/publication|redact/i);
  });
});

describe('Health Canada initial CTA and CTA-A keep their own Modules 1–3 scope', () => {
  it('places clinical documents in Module 1 and quality information in Modules 2–3', () => {
    for (const code of ['1.0.1', '1.2.1', '1.3.4', '1.4.1', '1.7.1', '1.7.2']) {
      expect(find(canadaCta.sectionBlueprint, code)?.module, code).toBe(1);
      expect(find(canadaCta.sectionBlueprint, code)?.required, code).toBe(true);
    }
    expect(find(canadaCta.sectionBlueprint, '2.3')?.module).toBe(2);
    expect(find(canadaCta.sectionBlueprint, '3.2')?.module).toBe(3);
    expect(canadaCta.sectionBlueprint.sections.every(section => section.module <= 3)).toBe(true);
    for (const code of ['2.2', '2.4', '2.5', '2.6', '2.7', '1.5']) {
      expect(find(canadaCta.sectionBlueprint, code), code).toBeUndefined();
    }
  });

  it('keeps authorization/reference, site timing and format exceptions explicit', () => {
    expect(find(canadaCta.sectionBlueprint, '2.3')?.required).toBe(false);
    expect(find(canadaCta.sectionBlueprint, '2.3')?.guidance).toMatch(/NOC.*DIN|DIN.*NOC/i);
    expect(find(canadaCta.sectionBlueprint, '3.2')?.required).toBe(false);
    expect(find(canadaCta.sectionBlueprint, '1.1')?.required).toBe(false);
    expect(find(canadaCta.sectionBlueprint, '1.1')?.guidance).toMatch(/non-eCTD.*only/i);
    expect(find(canadaCta.sectionBlueprint, '1.2.5.1')?.required).toBe(false);
    expect(find(canadaCta.sectionBlueprint, '1.2.5.1')?.guidance).toMatch(/online.*before.*start/i);
    expect(find(canadaCta.sectionBlueprint, '1.3.4')?.guidance).toMatch(/Product Monograph/i);
    expect(find(canadaCta.sectionBlueprint, '1.2.1')?.guidance).toMatch(/appendices.*one file/i);
    expect(canadaCta.sectionBlueprint.sections.some(section => /undertaking|REB approval|labell?ing/i.test(section.title))).toBe(false);
  });

  it('exposes a genuinely separate amendment outline with no initial-only PSEAT', () => {
    const amendment = canadaCta.amendmentSectionBlueprint;
    expect(amendment).toBeDefined();
    expect(amendment.id).toBe('ca_cta_a_sections');
    expect(amendment).not.toBe(canadaCta.sectionBlueprint);
    expect(find(amendment, '1.4.1')).toBeUndefined();
    expect(find(amendment, '1.0.1')?.required).toBe(true);
    expect(find(amendment, '1.0.1')?.guidance).toMatch(/file.*control.*number/i);
    expect(amendment.sections.every(section => section.module <= 3)).toBe(true);
  });

  it('requires changed protocol evidence for a clinical amendment without making it a quality-only requirement', () => {
    const amendment = canadaCta.amendmentSectionBlueprint;
    expect(amendment).toBeDefined();
    const protocol = find(amendment, '1.7.1');
    expect(protocol?.required).toBe(false);
    expect(protocol?.guidance).toMatch(/clinical amendment/i);
    expect(protocol?.guidance).toMatch(/most recently authorized/i);
    expect(protocol?.guidance).toMatch(/original.*revised.*rationale/i);
    expect(protocol?.guidance).toMatch(/cross-reference.*alone.*not/i);
    for (const code of ['1.2.5.1', '1.2.7', '1.7.2']) {
      expect(find(amendment, code)?.required, code).toBe(false);
      expect(find(amendment, code)?.guidance, code).toMatch(/clinical.*not.*quality.only/i);
    }
    expect(find(amendment, '1.3.4')?.guidance).toMatch(/duration|biologic/i);
  });
});

describe('regional blueprint provenance and compatibility', () => {
  it('publishes dated official source provenance for both regional outlines', () => {
    expect(euCta.EU_CTA_BLUEPRINT_SOURCES).toBeDefined();
    expect(canadaCta.CA_CTA_BLUEPRINT_SOURCES).toBeDefined();
    for (const source of [...euCta.EU_CTA_BLUEPRINT_SOURCES, ...canadaCta.CA_CTA_BLUEPRINT_SOURCES]) {
      expect(source.verifiedAt).toBe('2026-10-07');
      expect(new URL(source.url).hostname).toMatch(/^(eur-lex\.europa\.eu|www\.ema\.europa\.eu|www\.canada\.ca)$/);
      expect(source.version).toBeTruthy();
    }
  });

  it('retains existing task ids while correcting trial-stage quality and site descriptions', () => {
    expect(euCta.taskBlueprint.id).toBe('eu_cta_tasks');
    expect(canadaCta.taskBlueprint.id).toBe('ca_cta_tasks');
    const euTasks = euCta.taskBlueprint.milestones.flatMap(m => m.tasks);
    const caTasks = canadaCta.taskBlueprint.milestones.flatMap(m => m.tasks);
    expect(euTasks.map(task => task.id)).toEqual(['t_protocol', 't_impd', 't_ib', 't_ctis_form', 't_msc', 't_informed_consent', 't_ethics_prep', 't_qc', 't_ctis_submit']);
    expect(caTasks.map(task => task.id)).toEqual(['t_protocol', 't_ib', 't_cta_quality', 't_cta_form', 't_reb', 't_qidp', 't_qc', 't_compliance', 't_submit']);
    expect(caTasks.find(task => task.id === 't_cta_quality')?.description).toMatch(/Module 2.*Module 3/i);
    expect(caTasks.find(task => task.id === 't_qidp')?.description).toMatch(/retain|site records/i);
    expect(caTasks.find(task => task.id === 't_reb')?.description).toMatch(/before.*start/i);
    expect([...euTasks, ...caTasks].some(task => task.description.includes('E6(R2)'))).toBe(false);
  });
});
