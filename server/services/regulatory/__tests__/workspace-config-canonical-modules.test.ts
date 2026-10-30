import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({ license: vi.fn() }));
vi.mock('../../license-manager', () => ({ getLicenseInfo: H.license }));
import { enrichWorkspaceConfig } from '../workspace-config-enrichment';
import { appModuleId, type WorkspaceAppId } from '../../../../shared/regulatory/app-registry';

const cases = [
  ['cmc', 'cmc', 'cmc-wizard', 'US_IND', 'biotech'],
  ['study_protocol_design', 'protocol-dev', 'protocol-designer', 'US_IND', 'biotech'],
  ['clinical_csr', 'document-authoring', 'csr-author', 'US_NDA', 'biotech'],
  ['cer', 'device-cer', 'cer-generator', 'EU_CER', 'medtech'],
  ['submission_center', 'submission-center', 'ectd-coauthor', 'US_IND', 'biotech'],
  ['substantial_equiv', 'device-510k', '510k-submission', 'US_510K', 'medtech'],
] as const;

beforeEach(() => { H.license.mockReset(); });

async function config(need: string, clientType: string, enabledModules: string[]) {
  H.license.mockResolvedValue({ tier: 'standard', enabledModules });
  return enrichWorkspaceConfig({ need, clientType, organizationId: 17 });
}

describe('workspace feature placement follows canonical module identities', () => {
  it.each(cases)('%s names its current canonical module', (app, current) => {
    expect(appModuleId(app as WorkspaceAppId)).toBe(current);
  });

  it.each(cases)('%s is available with its canonical module alone', async (app, current, _old, need, client) => {
    const result = await config(need, client, [current]);
    expect(result.apps.map(row => row.id)).toContain(app);
    expect(result.clientType?.accessibleApps).toContain(app);
    expect(result.clientType?.lockedApps?.some(row => row.id === app)).toBe(false);
  });

  it.each(cases)('%s preserves an existing legacy grant projection', async (app, _current, old, need, client) => {
    const result = await config(need, client, [old]);
    expect(result.clientType?.accessibleApps).toContain(app);
    expect(result.clientType?.entitlement?.enabledModules).toEqual([old]);
  });

  it.each(cases)('%s stays locked without its canonical or legacy grant', async (app, current, _old, need, client) => {
    const result = await config(need, client, ['vault']);
    expect(result.clientType?.accessibleApps).not.toContain(app);
    expect(result.clientType?.lockedApps).toContainEqual({ id: app, requiredModule: current });
  });

  it('an unavailable license does not manufacture an access projection', async () => {
    H.license.mockRejectedValue(new Error('unavailable'));
    const result = await enrichWorkspaceConfig({ need: 'US_510K', clientType: 'medtech', organizationId: 17 });
    expect(result.clientType?.accessibleApps).toBeUndefined();
    expect(result.clientType?.lockedApps).toBeUndefined();
  });
});
