import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../../shared/canonical-json';
import { getApplicationType, isSharedPlanningRegistryEntry } from '../../../../shared/regulatory/global-document-registry';
import type { RegulatoryApplicationType } from '../../../../shared/regulatory/document-taxonomy';
import { getSectionBlueprintForEntry } from '../../../../shared/regulatory/project-bootstrap';
import { getRegistryDocumentTemplate, registryDocumentTemplateCoverage } from '../../market-specs/document-template-library';
import {
  builtinAuthoringTemplateId, builtinTemplateSnapshot, getBuiltinAuthoringTemplate, getBuiltinAuthoringTemplates,
  type BuiltinAuthoringTemplate,
} from '../builtin-authoring-templates';

const IDS = ['RI_STRATEGY', 'RI_GAP_ANALYSIS', 'RI_COMPETITIVE', 'RI_HA_MEETING'] as const;
let all: BuiltinAuthoringTemplate[];
beforeAll(async () => { all = await getBuiltinAuthoringTemplates(); });

describe('existing internal planning outlines reach the same builtin catalog', () => {
  it('preserves all 392 prior builtin objects and their recorded snapshots', () => {
    const prior = all.filter(template => !IDS.some(id => template.entryId === `registry:${id}`));
    expect(prior).toHaveLength(392);
    // Captured from the unchanged projection in the retained meaningful RED.
    // Re-recorded 2026-10-25 (D2 increment 3, the 3a review): ten snapshots changed and no
    // other, each a reader of the one ICH M2–M5 record whose purposes and flags were
    // corrected — registry:ICH_{CLIN,NONCLIN}_{OVERVIEW,SUMMARY}; component:clinical_overview,
    // clinical_summary, nonclinical_overview; and the IND lane's 2.4:work:5/6 rows in module:M2,
    // section:m2.4 and phase6.nonclinical_overview:deliverable:0, which read 2.4.5/2.4.6's purpose.
    // Per-template diff against c47af6fbb: docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/increment-3/builtin-snapshot-delta.txt.
    expect(createHash('sha256').update(stableStringify(
      prior.map(template => ({ id: template.id, snapshot: builtinTemplateSnapshot(template) })),
    )).digest('hex')).toBe('568121095f4b8b2e792000f46e5830eaa89d6dc7e4f0b0707e57f3986b304311');
  });

  it.each(IDS)('reaches %s with its exact source, no filing placement and no authored facts', async id => {
    const entry = getApplicationType(id)!;
    const blueprint = getSectionBlueprintForEntry(entry);
    const outline = await getRegistryDocumentTemplate(id);
    const template = all.find(row => row.entryId === `registry:${id}`);
    expect(template, `${id} must be selectable in the existing editor`).toBeDefined();
    expect(template).toMatchObject({ id: builtinAuthoringTemplateId(`registry:${id}`), module: null,
      kind: 'preparation', aiDraftable: false, authoringMode: 'manual', originalFormat: 'none', families: [],
      filingContext: { registryId: id, region: 'GLOBAL', agency: 'ICH' } });
    expect(template!.sections.map(section => [section.code, section.title])).toEqual(blueprint.sections.map(section => [section.code, section.title]));
    expect(template!.sections).toHaveLength(5);
    expect(template!.description).toMatch(/Internal planning.*laboratory.*research/);
    expect(template!.sections.every(section => section.content === '')).toBe(true);
    expect(template!.sections.map(section => section.guidance.guidance_text).join(' ')).toContain(outline!.sections[0].purpose);
    expect(template!.sections.every(section => section.guidance.source_reference === `project-blueprint:${id}:${blueprint.id}`)).toBe(true);
    expect(template!.limitations.join(' ')).toMatch(/internal.*work|work.*internal/i);
    expect(template!.limitations.join(' ')).toMatch(/ICH.*registry.*not|registry.*ICH.*not/i);
    expect(template!.limitations.join(' ')).toMatch(/not.*submission|not.*filing authority/i);
    expect(await getBuiltinAuthoringTemplate(template!.id.toUpperCase())).toEqual(template);
  });

  it('includes the same exact internal outlines in existing AnA coverage discovery', async () => {
    const coverage = await registryDocumentTemplateCoverage();
    for (const id of IDS) {
      const row = coverage.find(entry => entry.registryId === id);
      expect(row, id).toBeDefined();
      expect(row).toMatchObject({ outlineAvailable: true,
        outlineSource: { kind: 'project-blueprint', registryId: id, blueprintId: `${id.toLowerCase()}_sections` } });
    }
  });
});

describe('shared planning admission does not widen other cross-cutting records', () => {
  it.each(IDS)('admits the existing active %s entry', id => {
    expect(isSharedPlanningRegistryEntry(getApplicationType(id)!)).toBe(true);
  });

  it.each([
    ['inactive', { active: false }], ['different region', { region: 'US' }],
    ['different segment', { segment: 'pharma_biotech' }], ['different category', { category: 'qms' }],
    ['submission format', { submissionFormat: 'eCTD' }], ['dossier format', { dossierStandard: 'eCTD' }],
    ['unknown identifier', { id: 'RI_UNRECOGNIZED' }],
  ] as Array<[string, Partial<RegulatoryApplicationType>]>)('refuses a planning-shaped record with %s', (_name, change) => {
    expect(isSharedPlanningRegistryEntry({ ...getApplicationType('RI_STRATEGY')!, ...change })).toBe(false);
  });

  it.each(['QMS_GMP_INSPECTION', 'QMS_GCP_COMPLIANCE', 'QMS_GLP_COMPLIANCE', 'ICH_CTD_M1', 'ICH_ICSR'])('does not admit %s through the planning selector', id => {
    expect(isSharedPlanningRegistryEntry(getApplicationType(id)!)).toBe(false);
  });
});
