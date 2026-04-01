import { describe, expect, it } from 'vitest';
import { isOssFeatureEnabledViaEnv } from '../../config/ossStackFeatureFlags';

describe('Session B OSS feature flags', () => {
  it('supports Tika env gating', () => {
    const enabled = isOssFeatureEnabledViaEnv('oss.ingestion.tika_enabled', {
      OSS_INGESTION_TIKA_ENABLED: 'true',
    } as NodeJS.ProcessEnv);
    expect(enabled).toBe(true);
  });

  it('supports GROBID and OpenSearch env gating', () => {
    const grobid = isOssFeatureEnabledViaEnv('oss.ingestion.grobid_enabled', {
      OSS_INGESTION_GROBID_ENABLED: 'true',
    } as NodeJS.ProcessEnv);
    const os = isOssFeatureEnabledViaEnv('oss.retrieval.opensearch_enabled', {
      OSS_RETRIEVAL_OPENSEARCH_ENABLED: 'true',
    } as NodeJS.ProcessEnv);

    expect(grobid).toBe(true);
    expect(os).toBe(true);
  });
});
