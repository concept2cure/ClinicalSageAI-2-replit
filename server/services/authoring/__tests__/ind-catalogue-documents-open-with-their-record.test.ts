/**
 * F1 (2026-11-14), S12 biotech sweep item 15: an IND catalogue document opens with the parts its record already has.
 *
 * Two defects in the IND catalogue (New document → Start from, "IND" group):
 *
 * 1. The Pre-IND briefing document (phase 2, "Prepare briefing package") opened as ONE empty section titled with its
 *    own name, because its pyramid task binds no CTD section. The platform already records that document's parts:
 *    `us_lifecycle_pre_ind_meeting`, "Pre-IND Meeting Briefing Document (Type B)", eight parts from the meeting request
 *    and agenda to the numbered questions with the sponsor's positions. It now opens with them, as the SAP row
 *    beside it opens with the SAP's.
 *
 * 2. A subtask bound to one CTD section was judged on every section of its parent task. "Manufacture" (3.2.S.2) was
 *    a preparation worksheet AnA would not draft, because the drug substance task also holds 3.2.S.4.4 batch
 *    analyses, a data table. The section row for the same 3.2.S.2, with the same seven parts, was draftable. A
 *    subtask is now judged on its own section, and named with its code as the section row is, so the two parts
 *    ICH titles "Manufacture" (3.2.S.2 and 3.2.P.3) read apart.
 */
import { describe, expect, it } from 'vitest';
import { getIndAuthoringTemplates } from '../ind-authoring-templates';
import { getDocumentTemplate } from '../../market-specs/document-template-library';

const all = () => getIndAuthoringTemplates();
const byEntry = (entryId: string) => all().find((t) => t.entryId === entryId)!;

describe('an IND catalogue document opens with the parts its record already has', () => {
  it('the Pre-IND briefing document opens with the Pre-IND meeting record\'s eight parts', () => {
    const t = byEntry('phase2.briefing_package:deliverable:0');
    const record = getDocumentTemplate('us_lifecycle_pre_ind_meeting')!;
    expect(t.sections.map((s) => s.title)).toEqual(record.sections.map((s) => s.heading));
    expect(t.sections.map((s) => s.code)).toEqual(record.sections.map((s) => `work:pre_ind_meeting:${s.number}`));
    expect(t.sections.map((s) => s.title)).toContain('Numbered Questions for FDA with Sponsor Positions');
    expect(t.sections.some((s) => s.code === 'preparation')).toBe(false);
    // Each part keeps the record's mode: the attendee list is prepared by hand, the rest is narrative.
    expect(t.sections.filter((s) => s.guidance.drafting_mode === 'manual').map((s) => s.title)).toEqual(['Sponsor Attendee List']);
    expect([t.name, t.aiDraftable, t.kind]).toEqual(['Pre-IND briefing document', true, 'narrative']);
    // No part claims a CTD placement.
    for (const s of t.sections) expect(s.guidance.guidance_text).toContain('no CTD placement is established');
  });

  it('the SAP row keeps its parts exactly (control)', () => {
    const t = byEntry('phase5.design:deliverable:1');
    const sap = getDocumentTemplate('statistical_analysis_plan')!;
    expect(t.sections.map((s) => s.code)).toEqual(sap.sections.flatMap(function codes(s): string[] {
      return [`work:sap:${s.number}`, ...(s.subsections ?? []).flatMap(codes)];
    }));
  });

  it.each([
    ['phase3.drug_substance:subtask:manufacture', 'section:m3.2.S.2', '3.2.S.2 · Manufacture'],
    ['phase3.drug_product:subtask:pd_manufacture', 'section:m3.2.P.3', '3.2.P.3 · Manufacture'],
  ])('%s is judged on its own section and named with its code', (subtask, section, name) => {
    const sub = byEntry(subtask);
    const sec = byEntry(section);
    expect(sub.name).toBe(name);
    expect(sub.name).toBe(sec.name);
    expect([sub.aiDraftable, sub.kind]).toEqual([sec.aiDraftable, sec.kind]);
    expect(sub.sections.map((s) => [s.code, s.guidance.drafting_mode ?? null])).toEqual(sec.sections.map((s) => [s.code, s.guidance.drafting_mode ?? null]));
  });

  it('no two IND catalogue documents share a name with different parts', () => {
    const byName = new Map<string, string[]>();
    for (const t of all()) byName.set(t.name, [...(byName.get(t.name) ?? []), JSON.stringify(t.sections.map((s) => s.code))]);
    for (const [name, outlines] of byName) expect([name, new Set(outlines).size]).toEqual([name, 1]);
  });

  it('a data table and a signed form stay worksheets (controls)', () => {
    expect(byEntry('phase3.manufacturing:deliverable:1').aiDraftable).toBe(false); // batch analysis certificates
    expect(byEntry('phase8.signatures:deliverable:0').aiDraftable).toBe(false);    // signed Form 1571
  });
});
