/**
 * The embedding lane, as the AnA readiness suites meet it.
 *
 * Readiness embeds one short text through the configured lane at each corpus
 * width before it says ready (DP-71; ADR-0014 §1.5, amended 2026-10-01), so
 * every readiness case meets an embedding server and, on the self-hosted lane,
 * the corpus check. Shared by ana-readiness.test.ts and
 * ana-readiness-embedding-probe.test.ts. Each suite installs the mocks with
 *
 *   vi.mock('openai', async () => (await import('./support/embedding-lane')).openaiModule);
 *   vi.mock('../../services/embedding-corpus-policy.js', async (importOriginal) => ({
 *     ...(await importOriginal<typeof import('../../services/embedding-corpus-policy')>()),
 *     findVectorsFromAnotherModel: (await import('./support/embedding-lane')).corpus.check,
 *   }));
 *
 * and calls resetEmbeddingLaneFixtures() before each case.
 */
import { afterEach, beforeEach, vi } from 'vitest';

type EmbedParams = { input: string | string[]; model: string; dimensions?: number };

/**
 * The server behind the lane. It answers as Text Embeddings Inference and
 * OpenAI do: in the width asked for, under the model asked for. A case that
 * needs it down or wrong says so.
 */
export const embeddingServer = (() => {
  const answer = async (params: EmbedParams) => {
    const n = Array.isArray(params.input) ? params.input.length : 1;
    const width = params.dimensions ?? 1024;
    return {
      data: Array.from({ length: n }, (_, index) => ({
        index,
        embedding: Array.from({ length: width }, (_, i) => ((i % 13) + 1) / 100),
      })),
      model: params.model,
      usage: { prompt_tokens: 4 * n },
    };
  };
  return { answer, create: vi.fn(answer) };
})();

/** The `openai` module, with the server above behind its embeddings client. */
export const openaiModule = {
  default: class OpenAIStub {
    embeddings = { create: embeddingServer.create };
  },
};

/**
 * The corpus check readiness acts on. Its own behaviour, as the runtime role
 * against PostgreSQL, is pinned by
 * server/services/__tests__/embedding-corpus-policy.dbtest.ts.
 */
export const corpus = {
  check: vi.fn(),
  clean: {
    model: 'BAAI/bge-m3',
    nativeDimensions: 1024,
    examined: ['vault.document_chunks', 'knowledge_entries'],
    absent: [] as string[],
    findings: [] as Array<{ corpus: string; table: string; rows: number; scopes: string[] }>,
  },
};

/** A server that answers, a clean corpus, and a fresh gateway behind the probe. */
export async function resetEmbeddingLaneFixtures(): Promise<void> {
  embeddingServer.create.mockReset();
  embeddingServer.create.mockImplementation(embeddingServer.answer);
  corpus.check.mockReset();
  corpus.check.mockResolvedValue(corpus.clean);
  const { resetGateway } = await import('../../../services/ai-gateway/gateway');
  resetGateway();
}

/** Text Embeddings Inference serving bge-m3: more than 1024 values is a 422, and it never pads. */
export function teiServingBgeM3(): void {
  embeddingServer.create.mockImplementation(async (params: EmbedParams) => {
    if ((params.dimensions ?? 1024) > 1024) {
      throw Object.assign(new Error('`dimensions` should be smaller than the maximum embedding dimension.'), { status: 422 });
    }
    return embeddingServer.answer({ ...params, model: 'BAAI/bge-m3' });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// The deployment's environment, built from the real gateway and the real seam
// (R4 and DP-71, P1-54).

export const LANE_ENV_KEYS = [
  'NODE_ENV',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'KIMI_API_KEY',
  'MOONSHOT_API_KEY',
  'AI_BEDROCK_ENABLED',
  'AI_VERTEX_ENABLED',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
  'AI_LOCAL_ENABLED',
  'AI_GATEWAY_DETERMINISTIC',
  'DETERMINISTIC_MODE',
  'EMBEDDING_PROVIDER',
  'EMBEDDING_LOCAL_BASE_URL',
  'EMBEDDING_LOCAL_MODEL',
  'EMBEDDING_LOCAL_NATIVE_DIMENSIONS',
  'LOCAL_AI_BASE_URL',
  'AI_PROVIDER_PLACEMENT_APPROVALS',
  'AI_SENSITIVE_DATA_POLICY_MODE',
] as const;

/** The self-hosted lane as terraform/stack wires it (modules/embedding-service). */
export const LANE = {
  EMBEDDING_PROVIDER: 'local',
  EMBEDDING_LOCAL_BASE_URL: 'http://embeddings.c2c-production.internal:8080/v1',
};

async function resetEmbeddingLane(): Promise<void> {
  const { resetEmbeddingProvider } = await import('../../../services/ai-gateway/embeddings/embedding-provider');
  resetEmbeddingProvider();
}

/** Each case starts from none of the variables the gateway and the embedding seam read. */
export function isolateLaneEnvironment(): void {
  const saved: Record<string, string | undefined> = {};
  beforeEach(async () => {
    for (const k of LANE_ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    await resetEmbeddingLane();
  });
  afterEach(async () => {
    for (const k of LANE_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    await resetEmbeddingLane();
  });
}

/** The gateway as a deployment in `nodeEnv` builds it from these variables. */
export async function laneGateway(nodeEnv: string, env: Partial<Record<(typeof LANE_ENV_KEYS)[number], string>>) {
  Object.assign(process.env, { NODE_ENV: nodeEnv }, env);
  const { AIGateway } = await vi.importActual<typeof import('../../../services/ai-gateway/gateway')>(
    '../../../services/ai-gateway/gateway'
  );
  return new AIGateway({ auditEnabled: false });
}
