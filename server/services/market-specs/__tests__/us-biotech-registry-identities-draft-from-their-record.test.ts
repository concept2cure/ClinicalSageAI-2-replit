/**
 * F1 (2026-11-12): a US biotech filing identity drafts from its own lifecycle record.
 *
 * The defect. Fourteen US filing identities (US_TYPE_D_MEETING, US_INTERACT, the three expanded-access types,
 * US_EUA_THERAPEUTIC, the five BLA reports, US_BPDR, US_CBER_MASTER_FILE and US_CBER_LOT_RELEASE) listed a
 * "preparation worksheet" row in New document → Start from. AnA refused to draft a document created from it
 * (TEMPLATE_NOT_DRAFTABLE). The same record's parts were also listed as a draftable component (`us_lifecycle_*`).
 * A project of that filing type starts from the registry row, because the start matches on the filing's registry id,
 * so it opened the refused copy.
 *
 * The cause. A registry row is draftable only when component metadata resolves for it, and the lookup was the
 * hand-written ICH map (`componentTemplateIdForRegistry`), which names none of these.
 *
 * The rule now. A registry identity whose outline is exactly one lifecycle record's parts shares that record's
 * draftability, and each part keeps the record's own mode: a form, dataset or table is prepared by hand from the
 * original (RULE 2), and the rest is source-supported narrative. The lookup is `draftingComponentIdForRegistry`,
 * narrower than `componentTemplateIdForRegistry` on purpose: inquiry, AnA's section requirements and the package
 * inventory key on the older one and do not change.
 */
import { describe, expect, it } from 'vitest';
import { US_BIOTECH_LIFECYCLE_RECORD_BY_REGISTRY_ID } from '../../ind/ctd/lifecycle-document-types';
import {
  componentTemplateIdForRegistry, draftingComponentIdForRegistry, getDocumentTemplate, getRegistryDocumentTemplate,
} from '../document-template-library';
import { getBuiltinAuthoringTemplates } from '../../authoring/builtin-authoring-templates';

/** The identities whose registry outline is exactly their one record's parts. */
const DRAFT_FROM_RECORD = [
  'US_TYPE_D_MEETING', 'US_INTERACT',
  'US_EXPANDED_ACCESS_INDIVIDUAL', 'US_EXPANDED_ACCESS_INTERMEDIATE', 'US_EXPANDED_ACCESS_TREATMENT',
  'US_EUA_THERAPEUTIC',
  'US_BLA_ANNUAL', 'US_BLA_PEDIATRIC_ANNUAL', 'US_BLA_PMR_ANNUAL', 'US_BLA_DISTRIBUTION', 'US_BLA_PAE_REPORT',
  'US_BPDR', 'US_CBER_MASTER_FILE', 'US_CBER_LOT_RELEASE',
] as const;
/** A BLA change also lists the CTD sections it updates, which its record's component does not: decided separately. */
const WITH_CTD_SECTIONS = ['US_BLA_SUPP', 'US_BLA_CBE30', 'US_BLA_CBE0'] as const;

const componentIdOf = (registryId: string) => `us_lifecycle_${US_BIOTECH_LIFECYCLE_RECORD_BY_REGISTRY_ID[registryId]}`;
const parts = (outline: { sections: Array<{ number: string; heading: string }> } | undefined) =>
  (outline?.sections ?? []).map((section) => [section.number, section.heading]);

describe('a US biotech filing identity drafts from its own lifecycle record', () => {
  it('names exactly the identities that read one record: the fourteen, and the three BLA changes', () => {
    expect(Object.keys(US_BIOTECH_LIFECYCLE_RECORD_BY_REGISTRY_ID).sort()).toEqual([...DRAFT_FROM_RECORD, ...WITH_CTD_SECTIONS].sort());
  });

  it.each(DRAFT_FROM_RECORD)('%s shares the draftability of the component read from the same record', async (registryId) => {
    const registry = await getRegistryDocumentTemplate(registryId);
    const component = getDocumentTemplate(componentIdOf(registryId));
    expect(parts(registry)).toEqual(parts(component));
    // Each part keeps the record's own mode: an original is prepared by hand, the rest is narrative.
    expect(registry!.sections.map((section) => section.drafting_mode)).toEqual(component!.sections.map((section) => section.drafting_mode));
    expect(registry!.sections.every((section) => section.drafting_mode === 'manual' || section.drafting_mode === 'narrative')).toBe(true);
    expect(registry!.sections.some((section) => section.drafting_mode === 'narrative')).toBe(true);
    // A narrative part carries the record's drafting limit, and an original its retain-the-original limit.
    for (const section of registry!.sections) {
      expect(section.purpose).toContain(section.drafting_mode === 'manual'
        ? 'AnA does not generate or replace the original' : 'Do not compute or reconstruct statistical outputs');
    }
    expect(typeof draftingComponentIdForRegistry).toBe('function');
    expect(draftingComponentIdForRegistry(registryId)).toBe(componentIdOf(registryId));
  });

  it('New document lists each as a draftable document, never a "preparation worksheet"', async () => {
    const all = await getBuiltinAuthoringTemplates();
    for (const registryId of DRAFT_FROM_RECORD) {
      const row = all.find((template) => template.entryId === `registry:${registryId}`)!;
      expect([registryId, row.aiDraftable, row.kind, row.authoringMode]).toEqual([registryId, true, 'narrative', 'ai_draft']);
      expect(row.name).not.toContain('preparation worksheet');
      expect(row.filingContext).toMatchObject({ registryId, region: 'US', agency: 'FDA' });
      // The draft route refuses a part whose saved guidance says manual (authoring-draft-template.ts).
      const component = getDocumentTemplate(componentIdOf(registryId))!;
      expect(row.sections.map((section) => section.guidance.drafting_mode)).toEqual(component.sections.map((section) => section.drafting_mode));
    }
  });

  it('an attendee list, a form and a dataset stay manual on the registry row', async () => {
    const manual = async (registryId: string) => (await getRegistryDocumentTemplate(registryId))!.sections
      .filter((section) => section.drafting_mode === 'manual').map((section) => section.number);
    expect(await manual('US_TYPE_D_MEETING')).toEqual(['MTG-ATTEND']);
    expect(await manual('US_EXPANDED_ACCESS_INTERMEDIATE')).toEqual(['EAM-1571', 'EAM-1572', 'EAM-IRB-CONSENT']);
    expect(await manual('US_BLA_DISTRIBUTION')).toEqual(['bla_dist.lots']);
    expect(await manual('US_BPDR')).toEqual(['bpdr.3486', 'bpdr.lots']);
  });

  it.each(WITH_CTD_SECTIONS)('%s keeps its worksheet until its updated CTD sections are decided', async (registryId) => {
    const row = (await getBuiltinAuthoringTemplates()).find((template) => template.entryId === `registry:${registryId}`)!;
    expect([row.aiDraftable, row.kind]).toEqual([false, 'preparation']);
    expect(typeof draftingComponentIdForRegistry).toBe('function');
    expect(draftingComponentIdForRegistry(registryId)).toBeUndefined();
  });

  it('does not widen the lookup inquiry, AnA\'s section requirements and the package inventory key on', () => {
    for (const registryId of [...DRAFT_FROM_RECORD, ...WITH_CTD_SECTIONS]) expect(componentTemplateIdForRegistry(registryId)).toBeUndefined();
    expect(typeof draftingComponentIdForRegistry).toBe('function');
    // The ICH identities resolve as before, through either lookup.
    expect(draftingComponentIdForRegistry('ICH_PROTOCOL')).toBe('protocol');
    expect(draftingComponentIdForRegistry('ICH_DSUR')).toBe(componentTemplateIdForRegistry('ICH_DSUR'));
    // A PMR's outline is its study protocol's, a different filing identity: not decided here.
    expect(draftingComponentIdForRegistry('US_PMR')).toBeUndefined();
    expect(draftingComponentIdForRegistry('US_NDA')).toBeUndefined();
    expect(draftingComponentIdForRegistry('NOT_A_REGISTRY_ID')).toBeUndefined();
  });
});
