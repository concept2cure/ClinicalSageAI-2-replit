import { describe, expect, it } from 'vitest';
import { getApplicationType } from '../../../../../shared/regulatory/global-document-registry';
import { basisProblems } from '../../../../../shared/regulatory/regulatory-basis';
import { CTD_AUTHORING_GUIDANCE } from '../../../ind/ctd/authoring-guidance';
import { LIFECYCLE_DOCUMENT_TYPES } from '../../../ind/ctd/lifecycle-document-types';
import * as japan from '../blueprints/japanCtnBlueprint';
import * as amendment from '../blueprints/usIndAmendmentBlueprint';
import * as nonclinical from '../blueprints/nonclinicalSummaryBlueprint';

describe('Japan clinical trial notification — its own notification record', () => {
  it('does not send a trial notification through a full marketing CTD', () => {
    expect(japan.sectionBlueprint.id).toBe(getApplicationType('JP_CTN')!.defaultSectionBlueprint);
    expect(japan.sectionBlueprint.name).not.toMatch(/CTD|Module 1/i);
    expect(japan.sectionBlueprint.sections.every(s => s.code.startsWith('ctn.'))).toBe(true);
    expect(japan.sectionBlueprint.sections.some(s => s.module > 1)).toBe(false);
  });
  it('separates notification fields from conditional attachments and lifecycle details', () => {
    const rows = japan.sectionBlueprint.sections;
    for (const code of ['ctn.notification', 'ctn.parties', 'ctn.products', 'ctn.trial', 'ctn.sites', 'ctn.accountability', 'ctn.supporting', 'ctn.quality', 'ctn.change', 'ctn.submission']) {
      expect(rows.find(s => s.code === code), code).toBeDefined();
    }
    for (const code of ['ctn.supporting', 'ctn.quality', 'ctn.change']) expect(rows.find(s => s.code === code)?.required).toBe(false);
    expect(rows.find(s => s.code === 'ctn.supporting')?.guidance).toMatch(/notification type|applicab/i);
    expect(rows.find(s => s.code === 'ctn.accountability')?.guidance).toMatch(/planned.*actual/i);
    expect(rows.find(s => s.code === 'ctn.submission')?.guidance).toContain('XML');
  });
  it('preserves task identity without blanket 30-day, bridging or Japanese-language claims', () => {
    expect(japan.taskBlueprint.id).toBe('jp_ctn_tasks');
    expect(japan.taskBlueprint.milestones.flatMap(m => m.tasks.map(t => t.id))).toEqual([
      't_pmda_consult', 't_bridging', 't_protocol', 't_ib', 't_quality', 't_ctn_form', 't_caretaker', 't_irb', 't_submit',
    ]);
    const taskText = JSON.stringify(japan.taskBlueprint);
    expect(taskText).not.toContain('30-day review before trial start');
    expect(taskText).not.toContain('Module 3 quality package');
    expect(taskText).not.toContain('per ICH E6(R2)');
  });
});

describe('US IND amendments — subtype determines the evidence', () => {
  it('has an exact amendment record rather than a default CTD fallback', () => {
    const outline = amendment.sectionBlueprint;
    expect(outline.id).toBe(getApplicationType('US_IND_AMENDMENT')!.defaultSectionBlueprint);
    expect(outline.sections.every(s => s.code.startsWith('amendment.'))).toBe(true);
    expect(outline.sections.some(s => s.code === 'amendment.new_investigator')).toBe(true);
    expect(outline.sections.some(s => s.code === 'amendment.fda_questions')).toBe(true);
  });
  it('reuses lifecycle component titles and treats evidence branches as conditional', () => {
    const outline = amendment.sectionBlueprint;
    const protocol = LIFECYCLE_DOCUMENT_TYPES.find(d => d.id === 'ind_protocol_amendment')!;
    const info = LIFECYCLE_DOCUMENT_TYPES.find(d => d.id === 'ind_information_amendment')!;
    const componentTitle = (id: string, code: string) => LIFECYCLE_DOCUMENT_TYPES.find(d => d.id === id)!.components.find(c => c.code === code)!.title;
    expect(outline.sections.find(s => s.code === 'amendment.protocol')?.title).toBe(componentTitle(protocol.id, 'PROTOCOL-OR-CHANGE'));
    expect(outline.sections.find(s => s.code === 'amendment.information')?.title).toBe(componentTitle(info.id, 'INFO-SUMMARY'));
    expect(outline.sections.find(s => s.code === 'amendment.cmc_update')?.title).toBe(componentTitle('ind_cmc_amendment', 'MODULE3-UPDATE'));
    for (const code of ['amendment.protocol', 'amendment.new_investigator', 'amendment.protocol_support', 'amendment.information', 'amendment.technical_data', 'amendment.cmc_summary', 'amendment.cmc_update', 'amendment.fda_questions']) {
      expect(outline.sections.find(s => s.code === code)?.required, code).toBe(false);
    }
    expect(outline.sections.find(s => s.code === 'amendment.information')?.guidance).toContain('312.31');
    expect(outline.sections.find(s => s.code === 'amendment.new_investigator')?.guidance).toContain('312.30(c)');
  });
});

describe('Nonclinical summaries — only the canonical CTD 2.6 subtree', () => {
  it('projects canonical summaries without adding all Module 2 or a second heading tree', () => {
    const outline = nonclinical.sectionBlueprint;
    const canonical = Object.values(CTD_AUTHORING_GUIDANCE).filter(s => s.code.startsWith('2.6.'));
    expect(outline.id).toBe(getApplicationType('ICH_NONCLIN_SUMMARY')!.defaultSectionBlueprint);
    expect(outline.sections.map(s => [s.code, s.title, s.contentType])).toEqual(canonical.map(s => [s.code, s.title, s.contentType]));
    expect(outline.sections.map(s => s.code)).toEqual(['2.6.1', '2.6.2', '2.6.3', '2.6.4', '2.6.5', '2.6.6', '2.6.7']);
    expect(outline.sections.every(s => s.module === 2)).toBe(true);
  });
});

describe('Repaired blueprint provenance and applicability', () => {
  it.each([['JP_CTN', japan, 'platform-convention'], ['US_IND_AMENDMENT', amendment, 'platform-convention'], ['ICH_NONCLIN_SUMMARY', nonclinical, 'regulator-text']] as const)('%s distinguishes checked source facts from scaffold obligations', (_id, record, confidence) => {
    expect(basisProblems(record.outlineBasis)).toEqual([]);
    expect(record.outlineBasis.confidence).toBe(confidence);
    expect(record.outlineLimitations.join(' ')).toMatch(/[Rr]equired flags.*platform/);
    expect(record.outlineLimitations.join(' ')).toMatch(/readiness|validation/i);
    expect(new Set(record.sectionBlueprint.sections.map(s => s.code)).size).toBe(record.sectionBlueprint.sections.length);
  });
});
