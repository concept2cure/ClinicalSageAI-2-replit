/**
 * The workspace config publishes a region's gateway package-size limit only where
 * one is on file.
 *
 * Until 2026-10-15 enrichWorkspaceConfig set region.gatewaySizeLimitBytes from
 * getGatewaySizeLimit, which answered for every canonical region: FDA's 4 GB for
 * Canada and an unpublished 1 GB for CN, KR, UK, AU, CH, BR, IN and SG, each
 * presented as that region's gateway limit. Its try/catch "for regions without a
 * published limit" never caught anything: the accessor did not throw.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../license-manager', () => ({ getLicenseInfo: vi.fn(async () => null) }));

import { enrichWorkspaceConfig } from '../workspace-config-enrichment';
import { getGatewaySizeLimitOnFile } from '../../ectd/ectd-regional-rules';

describe('enrichWorkspaceConfig — gateway size limit', () => {
  it.each(['CA', 'CN', 'KR', 'UK', 'AU', 'CH', 'BR', 'IN', 'SG'])(
    '%s: no limit is on file, so none is published',
    async (region) => {
      const config = await enrichWorkspaceConfig({ need: 'NDA', region });
      expect(config.region?.code).toBe(region);
      expect(config.region?.gatewaySizeLimitBytes).toBeUndefined();
    },
  );

  it.each(['US', 'EU', 'JP'] as const)('%s: the limit on file is published', async (region) => {
    const config = await enrichWorkspaceConfig({ need: 'NDA', region });
    expect(config.region?.gatewaySizeLimitBytes).toBe(getGatewaySizeLimitOnFile(region)!.bytes);
  });
});
