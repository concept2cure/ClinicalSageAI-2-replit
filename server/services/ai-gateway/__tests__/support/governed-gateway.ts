/**
 * A real AIGateway for the ADR-0014 §3/§4/§5 cases, with only the network call
 * replaced. Selection, the policy pass, tenant binding and the ledger are the
 * gateway's own; `executeProvider` is stubbed so a case can see which registry
 * row was actually dispatched, and in what order.
 *
 * One copy, imported by gateway-model-governance.test.ts,
 * pq-production-gate.test.ts and tenant-capacity.test.ts.
 */
import { vi } from 'vitest';
import { AIGateway } from '../../gateway';
import type { ApprovedModel } from '../../../ai-governance/approved-models';
import type { GatewayRequest, ModelConfig, ProviderName } from '../../types';

export const ALL_PROVIDERS: ProviderName[] = ['anthropic', 'openai', 'moonshot', 'bedrock', 'vertex', 'azure', 'local'];

export interface GovernedGatewayOptions {
  providers?: ProviderName[];
  perOrgPerMinute?: number;
  /**
   * `'env'`: deterministic mode is left to the environment, as buildConfig
   * reads it (AI_GATEWAY_DETERMINISTIC / DETERMINISTIC_MODE). Default: off.
   */
  deterministic?: 'env';
}

export function governedGateway(opts: GovernedGatewayOptions = {}): AIGateway {
  const perMinute = opts.perOrgPerMinute ?? 10_000;
  return new AIGateway({
    ...(opts.deterministic === 'env' ? {} : { deterministicMode: false }),
    auditEnabled: true,
    providers: (opts.providers ?? ALL_PROVIDERS).map((name) => ({
      name,
      enabled: true,
      apiKey: 'not-used',
      defaultModel: 'not-used',
      models: [],
    })),
    policy: {
      maxTokensPerRequest: 16000,
      maxRequestsPerMinutePerOrg: perMinute,
      maxRequestsPerMinutePerUser: 10_000,
      blockedPatterns: [],
      contentFilters: false,
      piiDetection: false,
    },
  } as never);
}

type Dispatch = (model: ModelConfig, ...rest: unknown[]) => Promise<unknown>;

/**
 * Replace the network call. A model id in `fail` answers 400 (not retried, so
 * the fallback ladder is walked at once). Returns the ids dispatched, in order.
 */
export function stubDispatch(gateway: AIGateway, fail: string[] = []): string[] {
  const invoked: string[] = [];
  const target = gateway as unknown as { executeProvider: Dispatch };
  vi.spyOn(target, 'executeProvider').mockImplementation(async (model: ModelConfig) => {
    invoked.push(model.id);
    if (fail.includes(model.id)) {
      throw Object.assign(new Error(`simulated failure on ${model.id}`), { status: 400 });
    }
    return {
      content: 'ok',
      provider: model.provider,
      model: model.model,
      requestId: 'fake',
      latencyMs: 1,
      cached: false,
      deterministic: false,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
    };
  });
  return invoked;
}

/** The rows the gateway handed its ledger writer. */
export function ledgerRows(gateway: AIGateway): Array<Record<string, any>> {
  return (gateway as unknown as { auditLogger: { getRecentEntries(): Array<Record<string, any>> } }).auditLogger.getRecentEntries();
}

/** The live registry the gateway selects from (mutable: a case adds a synthetic row to it). */
export function registryOf(gateway: AIGateway): ModelConfig[] {
  return (gateway as unknown as { models: ModelConfig[] }).models;
}

/** A registry row copied from a real one, under a new id and wire model: a model with no approved entry. */
export function ungovernedCopyOf(gateway: AIGateway, id: string, overrides: Partial<ModelConfig>): ModelConfig {
  const source = registryOf(gateway).find((m) => m.id === id);
  if (!source) throw new Error(`the registry has no '${id}'`);
  return { ...source, ...overrides };
}

/**
 * The approved-models list this gateway judges against. The seam is a private
 * field, set only here: no configuration, environment variable or request
 * field reaches it.
 */
export function judgeAgainst(gateway: AIGateway, entries: readonly ApprovedModel[]): void {
  (gateway as unknown as { approvedModels: readonly ApprovedModel[] }).approvedModels = entries;
}

export const DRAFT: GatewayRequest['messages'] = [{ role: 'user', content: 'Draft section 3.2.S.2.2.' }];

export function request(extra: Partial<GatewayRequest> & Pick<GatewayRequest, 'taskType'>): GatewayRequest {
  return { messages: DRAFT, ...extra };
}
