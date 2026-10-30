import { describe, expect, it } from 'vitest';
import { flattenModule1 } from '../../../../shared/regulatory/regional-module1';
import { ctdRecordSubtree } from '../../market-specs/ctd-component-outlines';
import { getRegistryDocumentTemplate } from '../../market-specs/document-template-library';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate } from '../builtin-authoring-templates';

describe('exact registry module workspaces reuse the canonical source', () => {
  it.each(['US_CTD_M1_REGIONAL', 'ICH_CTD_M2', 'ICH_CTD_M3', 'ICH_CTD_M4', 'ICH_CTD_M5'])('loads %s without borrowing an IND template identity', async id => {
    const template = await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId(`registry:${id}`));
    expect(template).toBeDefined();
    expect(template).toMatchObject({ entryId: `registry:${id}`, aiDraftable: false, kind: 'preparation', authoringMode: 'manual',
      filingContext: { registryId: id, region: id.startsWith('US_') ? 'US' : 'GLOBAL' } });
    expect(template!.sections.every(row => row.content === '')).toBe(true);
    const expected = id === 'US_CTD_M1_REGIONAL'
      ? flattenModule1('US').map(row => row.number)
      : ctdRecordSubtree(id.slice(-1)).map(row => row.code);
    expect(template!.sections.map(row => row.code)).toEqual(expected);
  });

  it('withholds a GLOBAL Module1 because there is no harmonized regional tree', async () => {
    expect(await getRegistryDocumentTemplate('ICH_CTD_M1')).toBeUndefined();
    expect(await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId('registry:ICH_CTD_M1'))).toBeUndefined();
  });
});
