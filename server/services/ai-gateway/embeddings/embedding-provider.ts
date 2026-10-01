/**
 * Embedding provider abstraction.
 *
 * All retrieval in the platform depends on embeddings, and today those are
 * produced exclusively by the OpenAI embeddings API (see
 * enhancedEmbeddingService.ts). That single dependency is the hardest blocker
 * for an air-gapped / on-prem deployment: you cannot run RAG offline if the
 * embedder is a third-party API call.
 *
 * This module introduces a provider seam so the embedder can be swapped for a
 * self-hostable, OpenAI-compatible endpoint (a vLLM / Text-Embeddings-Inference
 * / LiteLLM server serving an open-weight embedding model) without touching the
 * corpus policy or the pgvector dimensions. Both providers speak the OpenAI
 * `embeddings.create` shape, and the dimension contract (1536d / 3072d) holds
 * on both: OpenAI is asked for the corpus dimension, and the self-hosted
 * model's own vectors are zero-padded to it (below).
 *
 * Deepen path: route enhancedEmbeddingService.embed() through
 * getEmbeddingProvider() so the existing corpus-policy-governed runtime gains
 * the local lane for free. Until then this is the canonical seam new code
 * should target.
 *
 * ── Placement (P0-11, SECURITY_AUDIT_2026-09-24 DP-07) ──────────────────────
 * This is the one egress in the gateway tree that does not pass through
 * `AIGateway.route()`, and it used to reach the provider with no
 * classification, placement decision or audit row. `embed()` now asks
 * `AIGateway.authorizeEmbedding` — the org's placement policy, content
 * classification and the last-mile sensitive-dispatch gate, with intended use
 * `embedding` — BEFORE the SDK client is constructed. A refusal is a terminal
 * `GatewayPolicyError`; the client is never built and nothing is sent. The
 * organisation comes from the request, else from the running tenant scope.
 * Once the provider answers, the call is recorded on the ledger
 * (`AIGateway.recordEmbeddingCall`): a served row, or a failure row.
 *
 * ── Provider election (ADR-0014 §1.4, P1-45) ─────────────────────────────────
 * The default lane is OpenAI. In production `authorizeEmbedding` applies the
 * provider election through the same predicate as chat: an organization whose
 * placement policy does not name `openai` — including one with no policy, and
 * platform work with no organization — gets a terminal GatewayPolicyError
 * (DENY_TENANT_POLICY) before the client exists. There is no fallback to
 * another lane: an embedder is fixed per corpus by EMBEDDING_PROVIDER, and the
 * self-hosted lane (EMBEDDING_PROVIDER=local) is the one that serves a tenant
 * that has not elected OpenAI.
 *
 * ── The self-hosted lane's width (ADR-0014 §1.5, amended 2026-10-01) ────────
 * The lane serves BAAI/bge-m3, which emits 1024 values; the corpora are 1536
 * and 3072 wide. Text Embeddings Inference refuses a request for more values
 * than the model emits (422) and never pads, so the lane, asked for the corpus
 * width, refused every embedding (P1-54 round 1). The lane now asks for the
 * model's own width (EMBEDDING_LOCAL_NATIVE_DIMENSIONS, default the corpus
 * policy's 1024) and zero-pads each vector to the width the caller asked for;
 * cosine and L2 between padded vectors are those of the model's. It refuses,
 * before sending anything, a model wider than the corpus (no truncation), and
 * refuses a vector that is not the model's width (another model behind the
 * address) rather than pad it into the corpus. The OpenAI lane is unchanged.
 * `probeEmbeddingLane` is the readiness probe's use of the same path.
 *
 * @module server/services/ai-gateway/embeddings/embedding-provider
 */

import OpenAI from 'openai';
import { getTenantScope, runWithSystemTenantScope } from '../../../db/tenantStore.js';
import { createScopedLogger } from '../../../utils/logger.js';
import { listCorpora, SELF_HOSTED_EMBEDDING_MODEL } from '../../embedding-corpus-policy.js';

const log = createScopedLogger('embedding-provider');

export type EmbeddingProviderKind = 'openai' | 'local';

export interface EmbeddingRequest {
  input: string | string[];
  /** Model id; defaults to the provider's configured default. */
  model?: string;
  /** Target dimension (passed through where the server supports it). */
  dimensions?: number;
  /**
   * The organisation whose content this is. It drives the placement decision
   * (the org's residency / zero-retention policy and the sensitive-dispatch
   * approvals). When absent, the running request's tenant scope supplies it.
   */
  organizationId?: string | number;
}

export interface EmbeddingProviderResult {
  embeddings: number[][];
  model: string;
  provider: EmbeddingProviderKind;
  /** Total input tokens, when the server reports them. */
  inputTokens: number;
}

export interface EmbeddingProvider {
  readonly kind: EmbeddingProviderKind;
  readonly defaultModel: string;
  /** Substrate this embedder runs on — mirrors the chat placement taxonomy. */
  readonly selfHosted: boolean;
  /**
   * Self-hosted lane only: how many values the model emits. Each vector is
   * zero-padded from this to the width the caller asks for.
   */
  readonly nativeDimensions?: number;
  embed(req: EmbeddingRequest): Promise<EmbeddingProviderResult>;
}

/**
 * The configured embedding lane cannot be honoured as configured. Thrown
 * instead of falling back to another lane: a fallback would send content
 * declared for one substrate to a different one, silently.
 */
export class EmbeddingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingConfigurationError';
  }
}

/**
 * The organisation of the running request, when the caller passed none. The
 * estate-wide system scope (`runWithSystemTenantScope`, tenantId '0') is not
 * an organisation and is not offered as one.
 */
function scopedOrganizationId(): string | undefined {
  const tenantId = getTenantScope()?.tenantId;
  return tenantId && tenantId !== '0' ? tenantId : undefined;
}

/**
 * The self-hosted lane's widths for one request: the model's own, and the
 * corpus's (the width asked for, else the model's). Undefined on the OpenAI
 * lane, which is asked for the requested width as it always was. Refuses a
 * model wider than the corpus: a truncated vector is not the model's.
 */
function selfHostedWidths(native: number | undefined, requested: number | undefined): { native: number; target: number } | undefined {
  if (native === undefined) return undefined;
  const target = requested ?? native;
  if (native > target) {
    throw new EmbeddingConfigurationError(
      `The self-hosted embedding model emits ${native} values and the corpus holds ${target}. ` +
        'Refusing rather than truncating: a truncated vector is not the model\'s.',
    );
  }
  return { native, target };
}

/** The error for an answer holding a vector that is not `native` wide, if it does. */
function wrongWidthError(vectors: number[][], native: number): EmbeddingConfigurationError | undefined {
  const wrong = vectors.find(v => !Array.isArray(v) || v.length !== native);
  if (wrong === undefined) return undefined;
  return new EmbeddingConfigurationError(
    `The self-hosted embedding server answered with ${Array.isArray(wrong) ? wrong.length : 'no'} values ` +
      `where its model emits ${native}: it is not serving the configured model.`,
  );
}

/** The SDK's answer: the vectors in input order, the model that answered, the tokens it counted. */
function readAnswer(res: any, asked: string): { vectors: number[][]; model: string; inputTokens: number } {
  return {
    vectors: (res?.data || [])
      .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
      .map((d: any) => d.embedding as number[]),
    model: res?.model || asked,
    inputTokens: res?.usage?.prompt_tokens || res?.usage?.total_tokens || 0,
  };
}

/** Each vector zero-padded to `width`: cosine and L2 between them are unchanged. */
function zeroPad(vectors: number[][], width: number): number[][] {
  return vectors.map(v => (v.length < width ? v.concat(new Array<number>(width - v.length).fill(0)) : v));
}

/** Shared OpenAI-compatible embedding implementation (frontier or self-hosted). */
class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly kind: EmbeddingProviderKind;
  readonly defaultModel: string;
  readonly selfHosted: boolean;
  readonly nativeDimensions?: number;
  private opts: { apiKey: string; baseURL?: string };
  private client: OpenAI | null = null;

  constructor(opts: {
    kind: EmbeddingProviderKind;
    defaultModel: string;
    selfHosted: boolean;
    nativeDimensions?: number;
    apiKey: string;
    baseURL?: string;
  }) {
    this.kind = opts.kind;
    this.defaultModel = opts.defaultModel;
    this.selfHosted = opts.selfHosted;
    this.nativeDimensions = opts.nativeDimensions;
    this.opts = { apiKey: opts.apiKey, baseURL: opts.baseURL };
  }

  // Lazily construct the client so resolving a provider never throws when a key
  // is absent (keyless boot / tests); the auth error surfaces at call time.
  // Lazy construction is also what lets the placement gate in embed() refuse a
  // call before any client exists.
  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.opts.apiKey || 'not-configured',
        ...(this.opts.baseURL ? { baseURL: this.opts.baseURL.replace(/\/$/, '') } : {}),
      });
    }
    return this.client;
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingProviderResult> {
    // The self-hosted lane's widths, decided before anything else: a model
    // wider than the corpus is refused here, before the placement decision and
    // before anything is sent.
    const widths = selfHostedWidths(this.nativeDimensions, req.dimensions);

    // Placement decision first — before the client is constructed, so a
    // refusal leaves no client and sends nothing. The gateway is imported here
    // rather than at module top: it is a heavy module and this seam is loaded
    // by the corpus runtime early in boot. A refusal throws GatewayPolicyError.
    const texts = Array.isArray(req.input) ? req.input : [req.input];
    const { getGateway } = await import('../gateway.js');
    const gateway = getGateway();
    const authorization = await gateway.authorizeEmbedding({
      organizationId: req.organizationId ?? scopedOrganizationId(),
      provider: this.kind,
      texts,
    });

    // For a self-hosted endpoint the caller's model id (an OpenAI model name,
    // chosen per corpus) is meaningless — the local server serves its own
    // configured model, and is asked for that model's own width (padded below).
    // Frontier/OpenAI keeps the caller's model and the requested dimension.
    const model = this.selfHosted ? this.defaultModel : (req.model || this.defaultModel);
    const params: any = { model, input: req.input };
    // `dimensions` is supported by OpenAI's v3 models and many local servers;
    // omit it when not requested so servers that reject the field still work.
    const asked = widths ? widths.native : req.dimensions;
    if (asked) params.dimensions = asked;

    // The call is recorded on the ledger either way (gateway.recordEmbeddingCall):
    // a served row, or a failure row before the error goes back to the caller.
    let res: any;
    try {
      res = await this.getClient().embeddings.create(params);
    } catch (error: any) {
      await gateway.recordEmbeddingCall(authorization, { provider: this.kind, model, error: error?.message ?? String(error) });
      throw error;
    }
    const answer = readAnswer(res, model);

    // A vector that is not the model's width came from something other than the
    // model this lane is configured for: not padded into the corpus, a failure
    // on the ledger.
    const wrongWidth = widths && wrongWidthError(answer.vectors, widths.native);
    if (wrongWidth) {
      await gateway.recordEmbeddingCall(authorization, { provider: this.kind, model: answer.model, error: wrongWidth.message });
      throw wrongWidth;
    }

    const result: EmbeddingProviderResult = {
      embeddings: widths ? zeroPad(answer.vectors, widths.target) : answer.vectors,
      model: answer.model,
      provider: this.kind,
      inputTokens: answer.inputTokens,
    };
    await gateway.recordEmbeddingCall(authorization, { provider: this.kind, model: result.model, inputTokens: result.inputTokens });
    return result;
  }
}

let cached: EmbeddingProvider | null = null;

/** EMBEDDING_LOCAL_NATIVE_DIMENSIONS: a positive whole number, default the corpus policy's. */
function localNativeDimensions(): number {
  const raw = process.env.EMBEDDING_LOCAL_NATIVE_DIMENSIONS?.trim();
  if (!raw) return SELF_HOSTED_EMBEDDING_MODEL.nativeDimensions;
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new EmbeddingConfigurationError(
      `EMBEDDING_LOCAL_NATIVE_DIMENSIONS must be the number of values the self-hosted model emits ` +
        `(a positive whole number, ${SELF_HOSTED_EMBEDDING_MODEL.nativeDimensions} for ${SELF_HOSTED_EMBEDDING_MODEL.model}); got "${raw}".`,
    );
  }
  return Number(raw);
}

/**
 * Resolve the configured embedding provider.
 *
 *   EMBEDDING_PROVIDER=openai (default) → OpenAI embeddings API.
 *   EMBEDDING_PROVIDER=local            → self-hosted OpenAI-compatible endpoint
 *                                         (EMBEDDING_LOCAL_BASE_URL, e.g. a TEI
 *                                         or vLLM server), enabling offline RAG.
 *
 * The lane writes the corpus dimension (see embedding-corpus-policy.ts): OpenAI
 * is asked for it, and the self-hosted model's vectors are zero-padded to it.
 * Switching the embedder does not migrate existing vectors: a corpus written by
 * another model is re-embedded before it is served (findVectorsFromAnotherModel).
 *
 * `local` with no base URL is a configuration error, not a fallback: until
 * P0-11 it logged a warning and returned the OpenAI provider, so a deployment
 * that declared the self-hosted lane sent its content to the shared frontier
 * API. Fail closed and name the variable.
 */
export function resolveEmbeddingProvider(): EmbeddingProvider {
  const kind = (process.env.EMBEDDING_PROVIDER || 'openai').toLowerCase();

  if (kind === 'local' || kind === 'openai_compatible' || kind === 'self_hosted') {
    const baseURL = process.env.EMBEDDING_LOCAL_BASE_URL || process.env.LOCAL_AI_BASE_URL;
    if (!baseURL) {
      throw new EmbeddingConfigurationError(
        `EMBEDDING_PROVIDER=${kind} requires EMBEDDING_LOCAL_BASE_URL (or LOCAL_AI_BASE_URL) to name ` +
          'the self-hosted embedding endpoint. Refusing to fall back to OpenAI: content declared for ' +
          'the self-hosted lane must not be sent to a shared frontier API.',
      );
    }
    return new OpenAICompatibleEmbeddingProvider({
      kind: 'local',
      selfHosted: true,
      // The corpus policy's model unless configured otherwise. Until P1-54
      // round 2 this defaulted to bge-large-en-v1.5, which the deployed server
      // does not serve, and the ledger named it on every row.
      defaultModel: process.env.EMBEDDING_LOCAL_MODEL || SELF_HOSTED_EMBEDDING_MODEL.model,
      nativeDimensions: localNativeDimensions(),
      apiKey: process.env.EMBEDDING_LOCAL_API_KEY || 'not-required',
      baseURL,
    });
  }

  return new OpenAICompatibleEmbeddingProvider({
    kind: 'openai',
    selfHosted: false,
    defaultModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    apiKey: process.env.OPENAI_API_KEY || '',
  });
}

/** Memoized accessor (kind is process-stable). */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (!cached) cached = resolveEmbeddingProvider();
  return cached;
}

/** Reset the memoized provider (tests / env changes). */
export function resetEmbeddingProvider(): void {
  cached = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The readiness probe (DP-71; ADR-0014 §1.5, amended: "Readiness tells the truth").

/** Platform text, not tenant content: nothing in it is sensitive. */
const PROBE_TEXT = 'Readiness probe: one short text through the embedding lane.';

/**
 * How long the probe waits for one answer. The OpenAI SDK's own timeout is ten
 * minutes with two retries, and the boot invariants await the probe before the
 * process listens: a lane whose address drops packets would hold boot that long.
 */
export const EMBEDDING_PROBE_TIMEOUT_MS = 10_000;

class EmbeddingProbeTimeout extends Error {
  constructor() {
    super(`did not answer within ${EMBEDDING_PROBE_TIMEOUT_MS / 1000} s`);
    this.name = 'EmbeddingProbeTimeout';
  }
}

/** `call`, or EmbeddingProbeTimeout once the bound passes. The call itself runs on (its ledger row still lands). */
async function withinProbeBound<T>(call: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bound = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new EmbeddingProbeTimeout()), EMBEDDING_PROBE_TIMEOUT_MS);
    (timer as { unref?: () => void }).unref?.();
  });
  call.catch(() => {}); // a call that loses the race must not become an unhandled rejection
  try {
    return await Promise.race([call, bound]);
  } finally {
    clearTimeout(timer);
  }
}

export interface EmbeddingLaneProbe {
  ok: boolean;
  lane: EmbeddingProviderKind;
  /** The model that answered, as it named itself. */
  model?: string;
  /** The corpus widths the probe embedded at. */
  widths: number[];
  /** Safe to show on /readyz: no address, no upstream message. */
  detail: string;
}

/**
 * Why a probe call failed, in words /readyz may show (it is public): ours, a
 * status code, or "could not be reached". The upstream message, which can carry
 * an internal address, goes to the server log only.
 */
function probeFailure(err: unknown): string {
  const e = err as { name?: unknown; status?: unknown; message?: unknown } | null;
  const name = typeof e?.name === 'string' ? e.name : '';
  if (name === 'EmbeddingConfigurationError' || name === 'GatewayPolicyError') return String(e?.message);
  if (name === 'EmbeddingProbeTimeout') return `the embedding server ${String(e?.message)}`;
  if (typeof e?.status === 'number') return `the embedding server answered HTTP ${e.status}`;
  return `the embedding server could not be reached${name ? ` (${name})` : ''}`;
}

/**
 * Embed one short text through `provider` at every width a registered corpus
 * holds, through the same path search uses (placement decision, ledger row),
 * as platform work bound to no organization. For the self-hosted lane, also
 * require the server to name the model the corpus policy says every corpus
 * holds: zero-padding keeps one vector space per column only while one model
 * writes it. Never throws; the verdict is in `ok` and `detail`.
 */
export async function probeEmbeddingLane(provider: EmbeddingProvider): Promise<EmbeddingLaneProbe> {
  const lane = provider.kind;
  const asks = new Map<number, string>();
  for (const corpus of listCorpora()) if (!asks.has(corpus.dimensions)) asks.set(corpus.dimensions, corpus.model);
  const widths = [...asks.keys()].sort((a, b) => a - b);

  let model: string | undefined;
  for (const width of widths) {
    let result: EmbeddingProviderResult;
    try {
      result = await withinProbeBound(
        runWithSystemTenantScope('embedding-provider:readiness-probe', () =>
          provider.embed({ input: PROBE_TEXT, model: asks.get(width), dimensions: width }),
        ),
      );
    } catch (err) {
      log.warn('embedding lane readiness probe failed', {
        lane,
        width,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
      return { ok: false, lane, widths, detail: `The embedding lane (${lane}) did not embed at ${width}: ${probeFailure(err)}.` };
    }
    model = result.model;
    const vector = result.embeddings[0];
    const fail = (why: string): EmbeddingLaneProbe => ({ ok: false, lane, model, widths, detail: `The embedding lane (${lane}) ${why}.` });
    if (result.embeddings.length !== 1 || !Array.isArray(vector)) return fail(`answered one text with ${result.embeddings.length} vectors`);
    if (vector.length !== width) return fail(`answered with ${vector.length} values where the corpus holds ${width}`);
    if (!vector.every(Number.isFinite)) return fail('answered with values that are not numbers');
    if (!vector.some(v => v !== 0)) return fail('answered with a zero vector, which is no embedding');
    if (lane === 'local' && result.model !== SELF_HOSTED_EMBEDDING_MODEL.model) {
      return fail(
        `serves ${result.model}, but the corpus policy says every corpus holds ${SELF_HOSTED_EMBEDDING_MODEL.model} ` +
          '(server/services/embedding-corpus-policy.ts); one column must hold one model',
      );
    }
  }

  const how =
    lane === 'local'
      ? `${model} (${provider.nativeDimensions} values, zero-padded) at ${widths.join(' and ')}`
      : `${widths.map(w => `${asks.get(w)} at ${w}`).join(' and ')}`;
  return { ok: true, lane, model, widths, detail: `embedded one text through ${lane}: ${how}` };
}
