/**
 * A CTD Module 2 component is served to the depth the ICH M2–M5 record holds,
 * and from that record only (D2 increment 3, 2026-10-20).
 *
 * Before: the Clinical Summary was six hand-kept headings (no 2.7.4.2 Adverse
 * Events), the Clinical Overview stopped at 2.5.6, the Nonclinical Overview's
 * six headings were a copy, and the 2.6 outline read the guidance half of the
 * record only (no 2.6.4.x, no 2.6.6.x). Every one of those headings was in the
 * record. The Authoring picker, get_document_template, AnA drafting and a class
 * pack read the outline getRegistryDocumentTemplate serves, so this pins that
 * outline.
 */
import { describe, expect, it } from 'vitest';
import { getDocumentTemplate, getRegistryDocumentTemplate, type TemplateSection } from '../../server/services/market-specs/document-template-library';
import { ctdRecordSubtree } from '../../server/services/market-specs/ctd-component-outlines';
import { ichHeadingTitle } from '../../server/services/ind/ctd/ich-m4-headings';
import { CTD_AUTHORING_GUIDANCE } from '../../server/services/ind/ctd/authoring-guidance';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate } from '../../server/services/authoring/builtin-authoring-templates';
import { resolveDraftingRequirements } from '../../server/services/ana/AnaDocumentDraftingService';

const every = (s: TemplateSection[]): TemplateSection[] => s.flatMap((x) => [x, ...every(x.subsections ?? [])]);
const served = async (registryId: string) => {
  const t = await getRegistryDocumentTemplate(registryId);
  if (!t) throw new Error(`${registryId} has no outline`);
  return every([...(t.frontMatter ?? []), ...t.sections]);
};

const COMPONENTS = [
  ['ICH_NONCLIN_OVERVIEW', '2.4'],
  ['ICH_CLIN_OVERVIEW', '2.5'],
  ['ICH_NONCLIN_SUMMARY', '2.6'],
  ['ICH_CLIN_SUMMARY', '2.7'],
] as const;

describe('a Module 2 component is the record’s subtree, to its depth', () => {
  it.each(COMPONENTS)('%s serves every heading the record holds below %s, in CTD order', async (id, root) => {
    expect((await served(id)).map((s) => s.number)).toEqual(ctdRecordSubtree(root).map((h) => h.code));
  });

  it.each(COMPONENTS)('%s: every heading is the record’s wording for its number (no second heading tree)', async (id) => {
    const wrong = (await served(id)).filter((s) => ichHeadingTitle(s.number) !== s.heading).map((s) => `${s.number} ${s.heading}`);
    expect(wrong).toEqual([]);
  });

  it('the headings the hand copies did not have are there, nested under their parents', async () => {
    const co = await getRegistryDocumentTemplate('ICH_CLIN_OVERVIEW');
    const br = co?.sections.find((s) => s.number === '2.5.6');
    expect(br?.subsections?.map((s) => s.number)).toEqual(['2.5.6.1', '2.5.6.2', '2.5.6.3', '2.5.6.4', '2.5.6.5']);
    expect(br?.subsections?.[0].subsections?.map((s) => `${s.number} ${s.heading}`)).toEqual(['2.5.6.1.1 Disease or Condition', '2.5.6.1.2 Current Therapies']);
    const cs = (await served('ICH_CLIN_SUMMARY')).map((s) => s.number);
    for (const c of ['2.7.4.2', '2.7.4.2.1.2', '2.7.4.5.4', '2.7.3.3.3']) expect(cs).toContain(c);
    const ns = (await served('ICH_NONCLIN_SUMMARY')).map((s) => s.number);
    for (const c of ['2.6.4.5', '2.6.4.10', '2.6.6.3', '2.6.6.10']) expect(ns).toContain(c);
  });

  it('the component template id serves the same tree as the registry id', async () => {
    for (const [id, component] of [['ICH_CLIN_OVERVIEW', 'clinical_overview'], ['ICH_CLIN_SUMMARY', 'clinical_summary'], ['ICH_NONCLIN_OVERVIEW', 'nonclinical_overview']]) {
      expect(every(getDocumentTemplate(component)!.sections).map((s) => s.number)).toEqual((await served(id)).map((s) => s.number));
    }
  });

  it('the outline names the record it is read from and does not claim a checked text', async () => {
    const t = await getRegistryDocumentTemplate('ICH_CLIN_SUMMARY');
    expect(t?.outlineSource).toEqual({ kind: 'document-outline', registryId: 'ICH_CLIN_SUMMARY', record: 'CTD_AUTHORING_GUIDANCE+ICH_M4_HEADINGS:2.7' });
    expect(t?.basis?.confidence).toBe('recall');
  });
});

describe('a section’s purpose is the record’s own words, attributed', () => {
  it.each(COMPONENTS)('%s: no purpose is empty, and an attributed line is in the brief it names', async (id) => {
    for (const s of await served(id)) {
      expect(s.purpose.trim(), s.number).not.toBe('');
      const m = /^From the ([\d.]+) brief: (.*)\.$/.exec(s.purpose);
      if (m) expect(CTD_AUTHORING_GUIDANCE[m[1]]?.keyContentElements, s.number).toContain(m[2]);
    }
  });

  it('a benefit-risk subdivision carries what the 2.5.6 brief says of it', async () => {
    const s = (await served('ICH_CLIN_OVERVIEW')).find((x) => x.number === '2.5.6.4');
    expect(s?.purpose).toMatch(/^From the 2\.5\.6 brief: 2\.5\.6\.4 Benefit-Risk Assessment — the applicant's conclusion/);
  });
});

describe('the Authoring picker carries the whole component', () => {
  it.each(COMPONENTS)('%s: the picker document holds every node of the served outline', async (id) => {
    const picker = await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(`registry:${id}`));
    expect(picker?.sections.map((s) => s.code)).toEqual((await served(id)).map((s) => s.number));
  });
});

/*
 * AnA drafts every section the outline serves from the record (2026-10-20).
 * Before: asked by heading alone, a structural heading ("Benefit-Risk
 * Assessment", "Pharmacology", "Absorption") got no requirements at all or was
 * told it was outside the outline, and "2.7.4.2.1.2 Deaths" — the record's own
 * number and title — was flagged a title mismatch, because both checks read
 * the guidance half of the record only.
 */
describe('AnA drafts every section of a component outline from the record', () => {
  it.each(COMPONENTS)('%s: every section resolves, asked by code + title, by title or by code', async (id) => {
    const nodes = await served(id);
    const held = (h: string) => nodes.filter((s) => s.heading === h).map((s) => s.number);
    const wrong: string[] = [];
    for (const s of nodes) {
      for (const asked of [`${s.number} ${s.heading}`, s.heading, s.number]) {
        const r = resolveDraftingRequirements(id, asked);
        const twice = asked === s.heading && held(s.heading).length > 1;
        const ok = twice
          ? r.requirementsSource === 'record:candidates' && held(s.heading).every((c) => r.requirements?.includes(c))
          : !!r.requirements && /^(blueprint\+)?record:ctd-section:/.test(r.requirementsSource) && !/title-mismatch/.test(r.requirementsSource);
        if (!ok) wrong.push(`${asked} → ${r.requirementsSource}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('a title the outline holds more than once is listed, never resolved to the first', () => {
    const r = resolveDraftingRequirements('ICH_CLIN_SUMMARY', 'Appendix');
    expect(r.requirementsSource).toBe('record:candidates');
    for (const c of ['2.7.1.4 Appendix', '2.7.2.5 Appendix', '2.7.3.6 Appendix', '2.7.4.7 Appendix']) expect(r.requirements).toContain(c);
  });

  it('a code asked with another title still carries the mismatch note', () => {
    const r = resolveDraftingRequirements('ICH_CLIN_SUMMARY', '2.7.4.2.1.2 Efficacy Endpoints');
    expect(r.requirementsSource).toMatch(/\+title-mismatch$/);
    expect(r.requirements).toContain('the record titles 2.7.4.2.1.2 "Deaths"');
  });
});
