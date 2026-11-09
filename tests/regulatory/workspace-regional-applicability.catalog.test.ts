/** Native Vitest integration against the real filing, region and requirement
 * registries. Only the external license read is mocked. Pending native run. */
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../server/services/license-manager', () => ({ getLicenseInfo: vi.fn(async () => null) }));
import { enrichWorkspaceConfig } from '../../server/services/regulatory/workspace-config-enrichment';
import { resolveWorkspaceConfig } from '../../shared/regulatory/workspace-config';
import { REGIONAL_MODULE1_REQUIREMENTS } from '../../server/services/global-ri/regional-module1-requirements';
import { m1BackbonePath } from '../../shared/regulatory/region-identity';

const packageFields = ['m1BackbonePath', 'requiredModule1Components', 'gatewaySizeLimitBytes', 'translationMandate'] as const;
describe('workspace regional enrichment follows selected document and filing applicability', () => {
  it.each(['US_510K', 'US_DE_NOVO', 'US_PMA', 'EU_CTA', 'SOP', 'WORK_INSTRUCTION', 'CSR'])(
    '%s does not inherit an electronic medicines-marketing package', async need => {
      const base = resolveWorkspaceConfig(need);
      expect(base.known).toBe(true);
      const result = await enrichWorkspaceConfig({ need, region: 'CA', clientType: 'cro', organizationId: 7 });
      expect(result.resolved).toEqual(base.resolved);
      expect(result.editor).toEqual(base.editor);
      expect(result.region?.code).toBe('CA');
      expect(result.clientType?.industry).toBe('cro');
      for (const field of packageFields) expect(result.region?.[field], field).toBeUndefined();
    },
  );
  it('IND preserves its own artifacts and eCTD location without Form 356h marketing requirements', async () => {
    const result = await enrichWorkspaceConfig({ need: 'US_IND', region: 'US' });
    expect(result.editor.requiredArtifacts).toContain('form_1571');
    expect(result.region?.requiredModule1Components).toBeUndefined();
    expect(result.region?.m1BackbonePath).toBe(m1BackbonePath('US'));
  });
  it.each(['US_NDA', 'US_BLA'])(
    '%s retains the existing initial-marketing checklist without changing the registry', async need => {
      const result = await enrichWorkspaceConfig({ need, region: 'US' });
      expect(result.region?.requiredModule1Components)
        .toEqual(REGIONAL_MODULE1_REQUIREMENTS.FDA.map(item => item.code));
      expect(result.region?.m1BackbonePath).toBe(m1BackbonePath('US'));
    },
  );
  it('the EU marketing application retains its existing checklist', async () => {
    const result = await enrichWorkspaceConfig({ need: 'EU_MAA' });
    expect(result.region?.requiredModule1Components)
      .toEqual(REGIONAL_MODULE1_REQUIREMENTS.EMA.map(item => item.code));
  });
  it('a supplement does not inherit an initial-marketing checklist', async () => {
    const result = await enrichWorkspaceConfig({ need: 'US_NDA_SUPP', region: 'US' });
    expect(result.known).toBe(true);
    expect(result.region?.requiredModule1Components).toBeUndefined();
    expect(result.region?.m1BackbonePath).toBe(m1BackbonePath('US'));
  });
  it('unknown documents retain a region context but do not imply a filing channel', async () => {
    const result = await enrichWorkspaceConfig({ need: 'UNKNOWN_SYNTHETIC_DOCUMENT', region: 'JP' });
    expect(result.known).toBe(false);
    expect(result.gateway).toBeNull();
    expect(result.region?.language).toBe('ja');
    for (const field of packageFields) expect(result.region?.[field]).toBeUndefined();
  });
});
