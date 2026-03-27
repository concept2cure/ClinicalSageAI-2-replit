import { isOssFeatureEnabledViaEnv } from '../../config/ossStackFeatureFlags';

export interface ParserFeatureFlags {
  doclingEnabled: boolean;
  unstructuredFallbackEnabled: boolean;
}

export function resolveParserFeatureFlags(env: NodeJS.ProcessEnv = process.env): ParserFeatureFlags {
  return {
    doclingEnabled: isOssFeatureEnabledViaEnv('oss.ingestion.docling_primary', env),
    unstructuredFallbackEnabled: isOssFeatureEnabledViaEnv(
      'oss.ingestion.unstructured_fallback',
      env
    ),
  };
}
