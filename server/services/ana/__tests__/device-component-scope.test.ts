import { describe, expect, it } from 'vitest';
import { documentTemplateTool } from '../document-template-tool';
import { builtinAuthoringTemplateId } from '../../authoring/builtin-authoring-templates';
import { buildDocumentPreparation } from '../../market-specs/document-preparation';

const namedOrUuid = ['named', 'uuid'] as const;
const identity = (component: string, mode: typeof namedOrUuid[number]) => mode === 'named'
  ? component : builtinAuthoringTemplateId(`component:${component}`);
const call = async (input: Record<string, unknown>) => JSON.parse(await documentTemplateTool(input));
const incompatible = [
  ['gspr_checklist', 'EU_IVDR'], ['ivdr_gspr_checklist', 'EU_MDR_TECHDOC'],
  ['performance_evaluation_report', 'EU_MDR_TECHDOC'], ['k510_summary', 'US_PMA'],
  ['k510_summary', 'US_DE_NOVO'], ['gspr_checklist', 'EU_IVDR_CLASS_CD'],
] as const;
const compatible = [
  ['gspr_checklist', 'EU_MDR_TECHDOC'], ['gspr_checklist', 'EU_MDR_CLASS_IIA'],
  ['ivdr_gspr_checklist', 'EU_IVDR'], ['ivdr_gspr_checklist', 'EU_IVDR_CLASS_B'],
  ['performance_evaluation_report', 'EU_PER'], ['performance_evaluation_report', 'EU_IVDR'],
  ['k510_summary', 'US_510K'], ['k510_summary', 'US_510K_IVD'],
  ['k510_summary', 'US_510K_MOD'], ['k510_summary', 'US_CDX_510K'],
] as const;

describe.each(namedOrUuid)('%s device component preparation keeps the exact filing scope', mode => {
  it.each(incompatible)('refuses incompatible prepared %s with %s', async (component, registry_id) => {
    const result = await call({ template_id: identity(component, mode), registry_id, prepare: true });
    expect(result.error).toMatch(/component.*filing|filing.*component/i);
    expect(result.ok).toBeUndefined();
    expect(result.preparation).toBeUndefined();
    expect(result.template).toBeUndefined();
  });
  it.each(incompatible)('keeps explicit outline-only reference %s with %s available without a preparation plan', async (component, registry_id) => {
    const result = await call({ template_id: identity(component, mode), registry_id, prepare: false });
    expect(result.ok).toBe(true);
    expect(result.preparation).toBeUndefined();
    if (mode === 'uuid') expect(result.items.some((item: { kind: string }) => item.kind === 'preparation')).toBe(false);
  });
  it.each(compatible)('prepares compatible %s with %s using current canonical identity', async (component, registry_id) => {
    const result = await call({ template_id: identity(component, mode), registry_id, prepare: true });
    expect(result.ok, result.error).toBe(true);
    if (mode === 'named') expect(result.preparation.registryId).toBe(registry_id);
    else expect(result.items.some((item: { kind: string }) => item.kind === 'preparation')).toBe(true);
  });
  it.each(['gspr_checklist', 'ivdr_gspr_checklist', 'performance_evaluation_report', 'k510_summary'])('preserves standalone %s preparation when no filing was supplied', async component => {
    const result = await call({ template_id: identity(component, mode), prepare: true });
    expect(result.ok, result.error).toBe(true);
  });
});

it('a registry-only exact component mapping is not mistaken for an incompatible mixed build', () => {
  const plan = buildDocumentPreparation({ registryId: 'EU_PER' });
  expect(plan.registryId).toBe('EU_PER');
  expect(plan.readiness).toBe('not_assessed');
  expect(plan.evidenceReviewed).toBe(false);
});
