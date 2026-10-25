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
import { ICH_M4_HEADINGS, ichHeadingTitle } from '../../server/services/ind/ctd/ich-m4-headings';
import { NONCLINICAL_SUMMARY_SECTION_BLUEPRINT } from '../../server/services/regulatory/registry/blueprints/nonclinicalSummaryBlueprint';
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
      const m = /^From the ([\d.]+) brief: (.*?)\.(?: Conditional: .*)?$/.exec(s.purpose);
      // The whole element, or the clause of it that opens with this heading's number (3a review).
      if (m) expect(CTD_AUTHORING_GUIDANCE[m[1]]?.keyContentElements.some((k) => k.includes(m[2])), s.number).toBe(true);
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

/*
 * The 3a review (2026-10-25), each finding confirmed by a skeptic before it was fixed.
 */
describe('3a review: a flag, a purpose or a basis says only what the record says', () => {
  it('a heading the record makes conditional is not served as required', async () => {
    const co = await served('ICH_CLIN_OVERVIEW');
    const cs = await served('ICH_CLIN_SUMMARY');
    // M4E(R2): the appendix holds detailed benefit-risk methods "when used"; post-marketing data exist only for a marketed product.
    expect(co.find((s) => s.number === '2.5.6.5')?.required).toBe(false);
    expect(cs.find((s) => s.number === '2.7.4.6')?.required).toBe(false);
    for (const c of ['2.5.6.1', '2.5.6.2', '2.5.6.3', '2.5.6.4']) expect(co.find((s) => s.number === c)?.required, c).toBe(true);
  });

  it('a line from a brief is attached only to the heading it is about, never to a sibling or a parent', async () => {
    const cs = await served('ICH_CLIN_SUMMARY');
    const co = await served('ICH_CLIN_OVERVIEW');
    const p = (nodes: TemplateSection[], c: string) => nodes.find((s) => s.number === c)?.purpose ?? '';
    // "…overdose, withdrawal, abuse potential" is 2.7.4.5's list, not 2.7.4.5.5 Overdose's.
    expect(p(cs, '2.7.4.5.5')).not.toMatch(/organ impairment|pregnancy/);
    // "Deaths, other serious adverse events, and … discontinuation" names three headings.
    expect(p(cs, '2.7.4.2.1.2')).not.toMatch(/discontinuation/);
    expect(p(cs, '2.7.4.2.1.3')).not.toMatch(/discontinuation/);
    // "Adverse events of special interest" narrows 2.7.4.2's subject; it is not 2.7.4.2's line.
    expect(p(cs, '2.7.4.2')).not.toMatch(/special interest/);
    // 2.5.6.1.1 carries its own clause, not its sibling's.
    expect(p(co, '2.5.6.1.1')).toMatch(/2\.5\.6\.1\.1 Disease or Condition/);
    expect(p(co, '2.5.6.1.1')).not.toMatch(/Current Therapies/);
    expect(p(co, '2.5.6.1')).not.toMatch(/2\.5\.6\.1\.2/);
  });

  it.each(COMPONENTS)('%s: a heading the record holds no brief for never claims a brief states its content', async (id) => {
    for (const s of await served(id)) expect(s.purpose, s.number).not.toMatch(/brief states its content/);
  });

  it('the outline basis counts what was matched, and does not claim it for every heading', async () => {
    const t = await getRegistryDocumentTemplate('ICH_CLIN_SUMMARY');
    const note = t?.basis?.note ?? '';
    expect(note).toMatch(/^Headings as the record holds them; each heading's own basis says how it was established\. \d+ of 49 were matched against a search extract; the rest are recall\./);
    expect(note).not.toMatch(/^Headings and numbers as .* record them, matched against search extracts/);
  });

  it('the record says which headings a search extract showed, and which are numbered by pattern', () => {
    // docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-ich-m4-headings-facts.md
    const matched = ['2.1', '2.6.4.2', '2.6.6.2', '2.6.6.10', '3.1', '3.2', '3.3', '4.1', '4.2', '4.2.3.4.1', '4.2.3.5.4', '4.2.3.7.1'];
    for (const h of ICH_M4_HEADINGS) {
      const note = h.basis.note ?? '';
      if (matched.includes(h.code)) expect(note, h.code).toMatch(/matched against a search extract/);
      else expect(note, h.code).not.toMatch(/wording matched against a search extract/);
    }
  });

  it('the 2.6 Tables and Figures leaves carry the type the record gives the same heading', () => {
    const rows = NONCLINICAL_SUMMARY_SECTION_BLUEPRINT.sections;
    const typed = rows.find((s) => s.code === '2.6.2.7')!.contentType;
    for (const c of ['2.6.4.10', '2.6.6.10']) expect(rows.find((s) => s.code === c)?.contentType, c).toBe(typed);
  });
});
