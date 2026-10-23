import { describe, expect, it } from 'vitest';
import { resolveToRegistryEntry, resolveToDeficiencyType } from '../../../../shared/regulatory/submission-type-bridge';
import { GLOBAL_REGISTRY, isDeviceRegistryEntry } from '../../../../shared/regulatory/global-document-registry';
import { getRegistryDocumentTemplate, getDocumentTemplate } from '../../market-specs/document-template-library';
import { buildDocumentPreparation } from '../../market-specs/document-preparation';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate, getBuiltinAuthoringTemplates } from '../builtin-authoring-templates';

const targets = GLOBAL_REGISTRY.filter(entry => entry.active && ['medical_devices', 'diagnostics_ivd'].includes(entry.segment ?? '')
  && ['US', 'CA', 'EU', 'JP', 'GLOBAL'].includes(entry.region));

describe('existing device and diagnostics outlines reach the one editor', () => {
  it('lists every recorded target with exact filing identity and an editable empty outline', async () => {
    const all = await getBuiltinAuthoringTemplates();
    expect(targets.length).toBeGreaterThan(60);
    for (const entry of targets) {
      const actual = all.find(template => template.entryId === `registry:${entry.id}`);
      expect(actual, entry.id).toBeDefined();
      expect(actual!.filingContext).toEqual({ registryId: entry.id, region: entry.region, agency: entry.agency });
      expect(actual!.sections.length).toBeGreaterThan(0);
      expect(actual!.sections.every(section => section.content === '')).toBe(true);
      expect(actual!.module).toBeNull();
      expect(actual!.limitations.join(' ')).toMatch(/not.*filing|not.*readiness/i);
    }
  });

  it.each(['US_510K', 'EU_IVDR', 'CA_MDL', 'CA_IVD_LICENCE', 'JP_SHONIN', 'JP_IVD_APPROVAL', 'JP_CDX'])('resolves the %s source UUID with all source sections', async id => {
    const template = await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(`registry:${id}`));
    const source = await getRegistryDocumentTemplate(id);
    expect(template).toBeDefined();
    expect(template!.sections.map(section => [section.code, section.title])).toEqual(source!.sections.map(section => [section.number, section.heading]));
    expect(template!.originalFormat).toBeTruthy();
    expect(template!.kind).toBe('preparation');
    expect(template!.aiDraftable).toBe(false);
  });

  it.each([
    ['k510_summary', 'US', 'FDA'],
    ['gspr_checklist', 'EU', 'Notified_Body'],
    ['ivdr_gspr_checklist', 'EU', 'Notified_Body'],
    ['performance_evaluation_report', 'EU', 'Notified_Body'],
  ])('reaches %s with its own regional body', async (id, region, agency) => {
    const template = await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(`component:${id}`));
    expect(template).toBeDefined();
    expect(template!.filingContext).toEqual({ registryId: null, region, agency });
    expect(template!.sections.map(section => section.title)).toEqual(getDocumentTemplate(id)!.sections.map(section => section.heading));
  });

  it.each(['US_PMA', 'US_DE_NOVO', 'US_HDE', 'CA_MDL', 'JP_SHONIN'])('does not require a 510(k) equivalence conclusion for %s', async id => {
    const outline = await getRegistryDocumentTemplate(id);
    expect(outline!.sections.some(section => /substantial equivalence/i.test(section.heading))).toBe(false);
  });

  it.each(['CA_IVD_LICENCE', 'JP_SHONIN', 'JP_NINTEI', 'JP_IVD_APPROVAL', 'JP_CDX', 'EU_IVDR'])('does not present EU MDR requirements as %s requirements', async id => {
    const outline = await getRegistryDocumentTemplate(id);
    expect(outline!.sections.map(section => section.purpose).join(' ')).not.toMatch(/\bMDR Annex/);
  });
});


describe('IVDR aliases retain diagnostic document scope', () => {
  it.each(['IVDR_TD', 'EU_IVDR_TECHDOC', 'EU_IVDR'])('resolves alias %s without a CER or FDA PMA deficiency substitution', alias => {
    expect(resolveToRegistryEntry(alias)?.id).toBe('EU_IVDR');
    expect(resolveToDeficiencyType(alias)).toBe('general');
  });
});


describe('Japanese Class I notification is distinct from approval and certification', () => {
  it('reaches Todokede with source-limited notification groups and no approval claim', async () => {
    const template = await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId('registry:JP_TODOKEDE'));
    expect(template).toBeDefined();
    expect(template!.filingContext).toEqual({ registryId: 'JP_TODOKEDE', region: 'JP', agency: 'PMDA' });
    expect(template!.name).toMatch(/notification/i);
    expect(template!.sections.map(s => s.title).join(' ')).not.toMatch(/Approval Route|Substantial Equivalence/);
    expect(template!.kind).toBe('preparation');
  });
});


describe('device narrative eligibility reaches the existing drafting controls', () => {
  it.each([['component:k510_summary', 'narrative'], ['component:performance_evaluation_report', 'narrative'], ['registry:EU_PER', 'none']])('preserves explicit narrative eligibility for %s', async (entryId, originalFormat) => {
    const template = await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(entryId));
    expect(template).toMatchObject({ kind: 'narrative', aiDraftable: true, authoringMode: 'ai_draft', originalFormat });
  });
  it.each(['component:gspr_checklist', 'component:ivdr_gspr_checklist', 'registry:JP_SHONIN', 'registry:US_PMA'])('keeps original-artifact preparation manual for %s', async entryId => {
    expect(await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(entryId))).toMatchObject({ kind: 'preparation', aiDraftable: false, authoringMode: 'manual' });
  });
});


describe('a legacy CDx identifier is not a classification verdict', () => {
  it('keeps the existing template ID without claiming every companion diagnostic is Class D', async () => {
    const template = await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId('registry:EU_CDX_IVDR_D'));
    expect(template!.name).not.toMatch(/Class D/);
    expect(template!.filingContext?.registryId).toBe('EU_CDX_IVDR_D');
  });
});


describe('device quality records reach the same editor as limited preparation', () => {
  it.each(['QMS_QUALITY_MANUAL', 'QMS_DESIGN_CONTROLS', 'QMS_DMR', 'QMS_DHR', 'QMS_MDSAP', 'QMS_QSR_820', 'QMS_ISO_13485'])('loads exact %s without replacing original quality records', async id => {
    const template = await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(`registry:${id}`));
    expect(template).toBeDefined();
    expect(template).toMatchObject({ kind: 'preparation', aiDraftable: false, authoringMode: 'manual', module: null });
    expect(template!.sections.every(section => section.content === '')).toBe(true);
    expect(template!.sections.map(section => section.guidance.guidance_text).join(' ')).not.toMatch(/820\.(?:30|40|70|100)\b/);
    expect(template!.limitations.join(' ')).toMatch(/independent audit|executed production record/);
    const plan = buildDocumentPreparation({ registryId: id });
    expect(plan.registryId).toBe(id);
    expect(plan.applicabilityQuestions.join(' ')).toMatch(/device/i);
    expect(plan.regionalRoute?.channel).toMatch(/internal.*quality/i);
    expect(plan.regionalRoute?.scope).toMatch(/not an agency filing route/i);
  });
  it.each([['QMS_DMR', /specifications/i], ['QMS_DHR', /batch|unit/i], ['QMS_MDSAP', /auditing organization/i]])('retains %s-specific preparation context', async (id, context) => {
    const source = await getRegistryDocumentTemplate(id);
    expect(source!.sections.map(section => section.heading).join(' ')).toMatch(context);
  });
});


describe('shared device registry scope stays explicit', () => {
  it('does not classify general cross-cutting or mixed product rows as device-only', () => {
    const source = GLOBAL_REGISTRY.find(entry => entry.id === 'QMS_QUALITY_MANUAL')!;
    expect(isDeviceRegistryEntry(source)).toBe(true);
    expect(isDeviceRegistryEntry({ ...source, productClass: [] })).toBe(false);
    expect(isDeviceRegistryEntry({ ...source, productClass: ['medical_device', 'small_molecule'] })).toBe(false);
    expect(isDeviceRegistryEntry(GLOBAL_REGISTRY.find(entry => entry.id === 'US_NDA')!)).toBe(false);
  });
});
