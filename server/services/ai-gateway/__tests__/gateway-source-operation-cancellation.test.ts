/** Real source issuer, gateway routing and semaphore; synthetic catalog/network I/O only. */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIGateway, GatewayAbortedError, resetGateway } from '../gateway';
import type { GatewayRequest, GatewayResponse, ModelConfig } from '../types';
import type { Semaphore } from '../concurrency';

const seam = vi.hoisted(() => ({ scope: vi.fn(), load: vi.fn(), actor: vi.fn(), program: vi.fn() }));
vi.mock('../../ana/catalog-scope', async () => ({ catalogScope: seam.scope,
  sourceReadInput: (await import('../../ana/__tests__/support/source-read-tool-fixture.js')).syntheticInput }));
vi.mock('../../vault/document-catalog.service', () => ({ loadDocumentForActor: seam.load, revalidateActorSourceScope: seam.actor }));
vi.mock('../../c2c/current-program-access', () => ({ requireProgramScopeStillCurrent: seam.program }));

import {
  assertDraftSourceContextCurrent, loadDraftProjectSources,
  type DraftSourceContextIdentity,
} from '../../ana/draft-project-sources';

// Erased only at this test boundary: the old two-argument export compiles and
// demonstrably ignores the intended optional per-call signal on the baseline.
const assertCurrent = assertDraftSourceContextCurrent as unknown as (
  context: unknown, identity: DraftSourceContextIdentity, signal?: unknown,
) => Promise<void>;

interface GatewayProbe {
  outboundLimiter: Semaphore;
  dispatchProvider(model: ModelConfig, request: GatewayRequest, id: string, start: number): Promise<GatewayResponse>;
  recordFailure(provider: string, error: unknown): void;
  getFallbackModels(...args: unknown[]): ModelConfig[];
}

const SOURCE = '10000000-0000-4000-8000-000000000001';
const OTHER_SOURCE = '10000000-0000-4000-8000-000000000002';
const PROGRAM = '20000000-0000-4000-8000-000000000001';
const TEXT = 'Synthetic study observation: 12 of 30 participants; investigator review required.';
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const executor = { query: vi.fn() };
const identity = { organizationId: 7, userId: 3, projectId: PROGRAM };
const actorContext = { organizationId: 7, userId: 3, projectRef: PROGRAM, sqlClient: executor };

function document(id: string) {
  return { id, organizationId: 7, programId: PROGRAM, contentHash: 'a'.repeat(64),
    documentTitle: 'Synthetic CSR', fileName: 'csr.pdf', extractedText: TEXT, extractedTextSha256: sha(TEXT),
    isCurrent: true, originalFileAvailable: true, disposition: null,
    sourceAccess: { currentUseEligible: true },
    catalog: { contentHash: 'a'.repeat(64), status: 'extracted', extractionMethod: 'pdf-text', extractionConfidence: null } };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function liveGateway() {
  const gateway = new AIGateway({
    deterministicMode: false, auditEnabled: false,
    providers: [
      { name: 'anthropic', enabled: true, apiKey: 'not-used', defaultModel: 'claude-opus-5', models: [] },
      { name: 'openai', enabled: true, apiKey: 'not-used', defaultModel: 'gpt-4o', models: [] },
    ],
    policy: { maxTokensPerRequest: 128_000, maxRequestsPerMinutePerOrg: 10_000,
      maxRequestsPerMinutePerUser: 10_000, blockedPatterns: [], contentFilters: false, piiDetection: false },
  });
  const probe = gateway as unknown as GatewayProbe;
  const dispatch = vi.spyOn(probe, 'dispatchProvider').mockImplementation(async (model, _request, id) => ({
    content: 'Synthetic network response.', provider: model.provider, model: model.model,
    requestId: id, latencyMs: 1, cached: false, deterministic: false,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
  }));
  return { gateway, probe, dispatch };
}

function request(callerModule: string, extra: Partial<GatewayRequest> = {}): GatewayRequest {
  return { taskType: 'chat', messages: [{ role: 'user', content: 'Describe the document review workflow.' }], callerModule, ...extra };
}

function currentOperations() {
  return { reads: seam.load.mock.calls.map(([input]) => input.documentId),
    actor: seam.actor.mock.calls.length, program: seam.program.mock.calls.length };
}

async function selected() {
  const context = await loadDraftProjectSources([SOURCE, OTHER_SOURCE], actorContext, 'Synthetic study observation');
  expect(context.sources.map(source => source.documentId)).toEqual([SOURCE, OTHER_SOURCE]);
  // Exclude admission reads: the observed boundary below is actual beforeDispatch.
  seam.load.mockClear();
  seam.actor.mockClear();
  seam.program.mockClear();
  return context;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('AI_GATEWAY_MAX_CONCURRENCY', '1');
  seam.scope.mockResolvedValue({ programId: PROGRAM, executor,
    admittedScope: { organizationId: 7, userId: 3, programId: PROGRAM, role: 'viewer', accessibleProgramIds: [PROGRAM] },
    accessibleScope: { actor: { userId: 3, role: 'viewer' }, programIds: [PROGRAM] } });
  seam.load.mockImplementation(async ({ documentId }: { documentId: string }) => document(documentId));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetGateway();
});

describe('native gateway cancellation between current-source operations', () => {
  it.each(['default', 'custom'])('stops after a held first current read (%s abort reason) and releases the real permit', async reason => {
    const context = await selected();
    const { gateway, probe, dispatch } = liveGateway();
    const controller = new AbortController();
    const entered = deferred();
    const held = deferred();
    const limiter = vi.spyOn(probe.outboundLimiter, 'run');
    const failures = vi.spyOn(probe, 'recordFailure');
    const fallbacks = vi.spyOn(probe, 'getFallbackModels');
    seam.load.mockImplementationOnce(async ({ documentId }: { documentId: string }) => {
      entered.resolve();
      await held.promise;
      return document(documentId);
    });
    const guard = vi.fn(() => assertCurrent(context, identity, controller.signal));
    const cancelled = gateway.route(request('test:source-current-stop', {
      beforeDispatch: guard, signal: controller.signal,
    })).catch(error => error);
    await entered.promise;
    const survivor = gateway.route(request('test:after-source-current-stop'));
    try {
      await vi.waitFor(() => expect(limiter).toHaveBeenCalledTimes(2));
      expect(dispatch).not.toHaveBeenCalled();
      if (reason === 'custom') controller.abort(new Error('private cancellation detail'));
      else controller.abort();
    } finally {
      held.resolve();
    }
    const [error, result] = await Promise.all([cancelled, survivor]);
    expect(error).toBeInstanceOf(GatewayAbortedError);
    expect(error).toMatchObject({ phase: 'pre_call' });
    expect(String(error)).not.toContain('private cancellation detail');
    expect(result.content).toBe('Synthetic network response.');
    expect(guard).toHaveBeenCalledTimes(1);
    expect(limiter).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls.map(([, input]) => input.callerModule)).toEqual(['test:after-source-current-stop']);
    expect(failures).not.toHaveBeenCalled();
    expect(fallbacks).not.toHaveBeenCalled();
    // Baseline defect: the existing callback continues into OTHER_SOURCE and both scope reads.
    expect(currentOperations()).toEqual({ reads: [SOURCE], actor: 0, program: 0 });
  });

  it('keeps the genuine two-source authority and outbound path working without Stop', async () => {
    const context = await selected();
    const { gateway, dispatch } = liveGateway();
    const controller = new AbortController();
    const guard = vi.fn(() => assertCurrent(context, identity, controller.signal));
    const result = await gateway.route(request('test:source-current-control', { beforeDispatch: guard, signal: controller.signal }));
    expect(result.content).toBe('Synthetic network response.');
    expect(guard).toHaveBeenCalledTimes(1);
    expect(currentOperations()).toEqual({ reads: [SOURCE, OTHER_SOURCE], actor: 1, program: 1 });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('ignores a forged per-checkpoint signal while retaining all current-authority checks', async () => {
    const context = await selected();
    const { gateway, dispatch } = liveGateway();
    const forged = { aborted: true, throwIfAborted: vi.fn(() => { throw new Error('forged stop'); }) };
    const result = await gateway.route(request('test:source-current-forged-signal', {
      beforeDispatch: () => assertCurrent(context, identity, forged),
    }));
    expect(result.content).toBe('Synthetic network response.');
    expect(forged.throwIfAborted).not.toHaveBeenCalled();
    expect(currentOperations()).toEqual({ reads: [SOURCE, OTHER_SOURCE], actor: 1, program: 1 });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
