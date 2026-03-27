import { describe, expect, it } from 'vitest';
import { resolveParserFeatureFlags } from '../../services/ingestion/parserFeatureFlags';

describe('resolveParserFeatureFlags', () => {
  it('maps env values to parser feature flags', () => {
    const flags = resolveParserFeatureFlags({
      OSS_INGESTION_DOCLING_PRIMARY: 'true',
      OSS_INGESTION_UNSTRUCTURED_FALLBACK: 'false',
    } as NodeJS.ProcessEnv);

    expect(flags.doclingEnabled).toBe(true);
    expect(flags.unstructuredFallbackEnabled).toBe(false);
  });
});
