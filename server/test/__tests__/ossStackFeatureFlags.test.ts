import { describe, expect, it } from 'vitest';
import {
  OSS_STACK_FEATURE_FLAGS,
  getOssFeatureFlagBootstrapMap,
  isOssFeatureEnabledViaEnv,
} from '../../config/ossStackFeatureFlags';

describe('ossStackFeatureFlags', () => {
  it('uses unique feature flag keys and env vars', () => {
    const keys = OSS_STACK_FEATURE_FLAGS.map(flag => flag.key);
    const envVars = OSS_STACK_FEATURE_FLAGS.map(flag => flag.envVar);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(envVars).size).toBe(envVars.length);
  });

  it('defaults all OSS flags to disabled in bootstrap map', () => {
    const bootstrap = getOssFeatureFlagBootstrapMap();
    for (const flag of OSS_STACK_FEATURE_FLAGS) {
      expect(bootstrap[flag.key]).toBe(false);
    }
  });

  it('reads env overrides using explicit env var mapping', () => {
    const env = {
      OSS_RETRIEVAL_QDRANT_ENABLED: 'true',
      OSS_RETRIEVAL_BYALDI_PILOT: 'false',
    } as NodeJS.ProcessEnv;

    expect(isOssFeatureEnabledViaEnv('oss.retrieval.qdrant_enabled', env)).toBe(true);
    expect(isOssFeatureEnabledViaEnv('oss.retrieval.byaldi_pilot', env)).toBe(false);
    expect(isOssFeatureEnabledViaEnv('oss.compute.e2b_pilot', env)).toBe(false);
  });
});
