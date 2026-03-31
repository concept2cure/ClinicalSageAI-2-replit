export interface OssStackFeatureFlagDefinition {
  key: string;
  description: string;
  defaultEnabled: boolean;
  envVar: string;
}

/**
 * Canonical OSS stack feature-flag registry.
 *
 * Notes:
 * - Defaults are intentionally conservative (off) to protect governed flows.
 * - DB/tenant-level toggle checks remain authoritative when available.
 * - Env vars provide emergency bootstrap toggles for non-tenant contexts.
 */
export const OSS_STACK_FEATURE_FLAGS: readonly OssStackFeatureFlagDefinition[] = [
  {
    key: 'oss.ingestion.docling_primary',
    description: 'Enable Docling-backed parsing path as primary parser.',
    defaultEnabled: false,
    envVar: 'OSS_INGESTION_DOCLING_PRIMARY',
  },
  {
    key: 'oss.ingestion.unstructured_fallback',
    description: 'Enable Unstructured parser as fallback path.',
    defaultEnabled: false,
    envVar: 'OSS_INGESTION_UNSTRUCTURED_FALLBACK',
  },

  {
    key: 'oss.ingestion.tika_enabled',
    description: 'Enable Apache Tika normalization for broad document ingestion.',
    defaultEnabled: false,
    envVar: 'OSS_INGESTION_TIKA_ENABLED',
  },
  {
    key: 'oss.ingestion.grobid_enabled',
    description: 'Enable GROBID parsing path for scholarly scientific PDFs.',
    defaultEnabled: false,
    envVar: 'OSS_INGESTION_GROBID_ENABLED',
  },
  {
    key: 'oss.retrieval.opensearch_enabled',
    description: 'Enable OpenSearch hybrid retrieval adapter.',
    defaultEnabled: false,
    envVar: 'OSS_RETRIEVAL_OPENSEARCH_ENABLED',
  },
  {
    key: 'oss.retrieval.qdrant_enabled',
    description: 'Enable Qdrant-backed retrieval adapter.',
    defaultEnabled: false,
    envVar: 'OSS_RETRIEVAL_QDRANT_ENABLED',
  },
  {
    key: 'oss.retrieval.byaldi_pilot',
    description: 'Enable Byaldi multimodal retrieval pilot path.',
    defaultEnabled: false,
    envVar: 'OSS_RETRIEVAL_BYALDI_PILOT',
  },
  {
    key: 'oss.policy.opa_decisions',
    description: 'Enable OPA-backed policy decision adapter.',
    defaultEnabled: false,
    envVar: 'OSS_POLICY_OPA_DECISIONS',
  },
  {
    key: 'oss.obs.langfuse_enabled',
    description: 'Enable Langfuse tracing/evals integration path.',
    defaultEnabled: false,
    envVar: 'OSS_OBS_LANGFUSE_ENABLED',
  },
  {
    key: 'oss.workflow.temporal_enabled',
    description: 'Enable Temporal-backed workflow execution path.',
    defaultEnabled: false,
    envVar: 'OSS_WORKFLOW_TEMPORAL_ENABLED',
  },
  {
    key: 'oss.compute.e2b_pilot',
    description: 'Enable E2B sandbox compute pilot path.',
    defaultEnabled: false,
    envVar: 'OSS_COMPUTE_E2B_PILOT',
  },
] as const;

export function getOssFeatureFlagBootstrapMap(): Record<string, boolean> {
  return OSS_STACK_FEATURE_FLAGS.reduce<Record<string, boolean>>((acc, flag) => {
    acc[flag.key] = flag.defaultEnabled;
    return acc;
  }, {});
}

export function isOssFeatureEnabledViaEnv(flagKey: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = OSS_STACK_FEATURE_FLAGS.find(entry => entry.key === flagKey);
  if (!flag) return false;

  const raw = env[flag.envVar];
  if (raw == null) return flag.defaultEnabled;
  return raw.toLowerCase() === 'true';
}
