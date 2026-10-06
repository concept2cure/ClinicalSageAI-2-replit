import { describe, expect, it, vi } from 'vitest';
import type { GatewayResponse } from '../../../services/ai-gateway/types.js';
import { getTenantScope, runWithTenantScope } from '../../../db/tenantStore.js';
import { buildRagGenerationRequest, RAG_EMPTY_CONTEXT_REFUSAL } from '../../../services/rag-generation-request.js';
import { runRagPhase, resolveEvaluationOrganizationId, type RagPhaseOptions, type RagPhaseDependencies } from '../rag-phase.js';
import { sameServingIdentity } from '../pq-verdict.js';

const scope = { organizationId: 7, organizationUuid: '11111111-1111-4111-8111-111111111111', programId: '22222222-2222-4222-8222-222222222222' };
const positive = { id: 'q1', question: 'Which submission?', expectedSourceKeys: ['FDA@v1'], evidence: { document_code: 'FDA', section: 'Scope', quote: 'Reviewed official evidence.' }, expectedAnswerContains: ['Reviewed'], tags: [] };
const negative = { id: 'n1', question: 'What information is outside these sources?', expectedSourceKeys: [], tags: ['negative-control'] };
const options = (): RagPhaseOptions => ({ scope, generator: { modelId: 'candidate', pinnedVersion: 'candidate-pin', provider: 'anthropic' },
  judge: { modelId: 'judge', pinnedVersion: 'judge-pin', provider: 'openai' }, items: [positive, negative],
  goldBankSha256: 'a'.repeat(64), corpusManifestSha256: 'b'.repeat(64),
  manifest: { version: '1', publishers: { FDA: { termsVerified: true, terms: 'Reviewed', termsUrl: 'https://www.fda.gov/' } },
    entries: [{ document_code: 'FDA', version: 'v1', versionScheme: 'revision', role: 'answer-source', verified: true,
      versionVerified: true, sourceUrl: 'https://www.fda.gov/', date: '2026-10-06', sha256: 'c'.repeat(64), redistribution: { termsOf: 'FDA' } }] } });
const reply = (model: string, content: string): GatewayResponse => ({ content, resolvedModel: `${model}-pin`,
  provider: model === 'candidate' ? 'anthropic' : 'openai', cached: false, deterministic: false, finishReason: 'stop' } as GatewayResponse);
function dependencies() {
  const deps: RagPhaseDependencies = {
    verifyScope: vi.fn(async s => { expect(getTenantScope()?.tenantId).toBe(String(s.organizationId)); }),
    readDocument: vi.fn(async () => ({ documentId: 'doc1', contentHash: 'c'.repeat(64), embedded: true })),
    retrieve: vi.fn(async request => ({ documents: request.query === positive.question ? [{ id: 'chunk1', documentId: 'doc1', title: 'Official guidance', content: 'Reviewed official evidence.' }] : [] })),
    evaluateModel: vi.fn(async (model, request) => { expect(request.organizationId).toBe(7); expect(getTenantScope()?.orgUuid).toBe(scope.organizationUuid); return reply(model, model === 'candidate' ? 'Reviewed evidence [Source 1]' : '1'); }),
  };
  return deps;
}

describe('controlled RAG PQ phase', () => {
  it('runs canonical production prompt and strict independent judge within verified organization/programme', async () => {
    const deps = dependencies(); const result = await runRagPhase(options(), deps);
    expect(result).toMatchObject({ ran: true, scopeVerified: true, itemsScored: 1, plannedItemIds: ['q1', 'n1'] });
    expect(result.items[0]).toMatchObject({ hit: 1, faithfulness: 1, servedModelVerified: true, judgeVerified: true, expectedSourceIds: ['doc1'] });
    expect(result.items[0].generationRequest).toMatchObject(buildRagGenerationRequest(positive.question, '[Source 1: Official guidance]\nReviewed official evidence.'));
    expect(result.items[0].judgeRequest).toMatchObject({ taskType: 'general', organizationId: 7, callerModule: 'pq-rag-judge', maxTokens: 16, temperature: 0 });
    expect(result.items[0].judgeRequest).not.toHaveProperty('model');
    expect(result.items[0].generationRequestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.items[0].judgeResponseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.items[0].review).toEqual({ status: 'pending', reviewer: null, rationale: null });
    expect(deps.evaluateModel).toHaveBeenCalledTimes(2);
    expect(deps.retrieve).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7, organizationUuid: scope.organizationUuid, corpus: 'vault', strategy: 'basic', useReranking: false, useMmr: false, filters: { programId: scope.programId } }));
  });
  it('empty negative context uses actual production fixed refusal with no serving attribution or metric floor contribution', async () => {
    const result = await runRagPhase(options(), dependencies());
    expect(result.items[1]).toMatchObject({ answer: RAG_EMPTY_CONTEXT_REFUSAL, negativeControlPassed: true, generatorCalled: false,
      servedModel: null, servedProvider: null, servedModelVerified: false, judgeVerified: false, hit: null, faithfulness: null });
  });
  it('verifies scope before any source, retrieval or provider call, including a negative-only bank', async () => {
    const deps = dependencies(); deps.verifyScope = vi.fn(async () => { throw new Error('mismatch secret'); });
    const opts = options(); opts.items = [negative]; const result = await runRagPhase(opts, deps);
    expect(result.ran).toBe(false); expect(result.items).toHaveLength(1); expect(deps.retrieve).not.toHaveBeenCalled();
    expect(deps.readDocument).not.toHaveBeenCalled(); expect(deps.evaluateModel).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('an active conflicting tenant is refused before the authority verifier runs', async () => {
    const deps = dependencies();
    const result = await runWithTenantScope({ tenantId: '8', orgUuid: '33333333-3333-4333-8333-333333333333', source: 'cli', role: null }, () => runRagPhase(options(), deps));
    expect(result.ran).toBe(false); expect(deps.verifyScope).not.toHaveBeenCalled(); expect(deps.retrieve).not.toHaveBeenCalled();
  });
  it('unreviewed keys retain all planned items and never execute a positive retrieval', async () => {
    const deps = dependencies(); const opts = options(); opts.manifest.entries[0].verified = false;
    const result = await runRagPhase(opts, deps); expect(result.items).toHaveLength(2); expect(result.items[0].error).toMatch(/SOURCE_BINDING/);
    expect(deps.retrieve).toHaveBeenCalledTimes(1); expect(deps.evaluateModel).not.toHaveBeenCalled();
  });
  it('hash mismatch and unresolved official text cannot count as a source hit', async () => {
    const deps = dependencies(); deps.readDocument = vi.fn(async () => ({ documentId: 'doc1', contentHash: 'wrong', embedded: true }));
    const result = await runRagPhase(options(), deps); expect(result.items[0].hit).toBeNull(); expect(result.items[0].error).toMatch(/SHA-256/);
  });
  it.each([positive, negative])('a retrieved chunk without document identity cannot score or invoke a model: $id', async item => {
    const deps = dependencies(); const opts = options(); opts.items = [item];
    deps.retrieve = vi.fn(async () => ({ documents: [{ id: 'doc1', title: 'Chunk with no document ID', content: 'Reviewed evidence.' }] }));
    const result = await runRagPhase(opts, deps); expect(result.items[0].error).toMatch(/DOCUMENT_ID_MISSING/);
    expect(result.items[0].hit).toBeNull(); expect(deps.evaluateModel).not.toHaveBeenCalled();
  });
  it('positive empty retrieval records hit zero and a missing-assessment error, never fake faithfulness zero', async () => {
    const deps = dependencies(); deps.retrieve = vi.fn(async () => ({ documents: [] }));
    const result = await runRagPhase(options(), deps); expect(result.items[0]).toMatchObject({ hit: 0, faithfulness: null, generatorCalled: false });
    expect(result.items[0].error).toMatch(/EMPTY_CONTEXT/);
  });
});

describe('controlled RAG PQ attribution and control outcomes', () => {
  it.each(['wrong-version', 'wrong-provider', 'cached', 'deterministic', 'aborted', 'max_tokens', 'unknown', 'tool_calls', 'pause_turn', 'missing-finish'])('refuses unusable generator response: %s', async defect => {
    const deps = dependencies(); deps.evaluateModel = vi.fn(async () => {
      const r = reply('candidate', 'Reviewed [Source 1]');
      if (defect === 'wrong-version') r.resolvedModel = 'wrong';
      if (defect === 'wrong-provider') r.provider = 'openai';
      if (defect === 'cached' || defect === 'deterministic') r[defect] = true;
      if (['aborted', 'max_tokens', 'unknown', 'tool_calls', 'pause_turn'].includes(defect)) r.finishReason = defect;
      if (defect === 'missing-finish') delete r.finishReason;
      return r;
    });
    const result = await runRagPhase(options(), deps); expect(result.items[0].faithfulness).toBeNull(); expect(result.items[0].error).toMatch(/GENERATOR_ATTRIBUTION/);
    expect(deps.evaluateModel).toHaveBeenCalledTimes(1);
  });
  it.each(['wrong-version', 'wrong-provider', 'self-judge', 'malformed-score', 'placement-error'])('refuses unusable independent judge: %s', async defect => {
    const deps = dependencies(); deps.evaluateModel = vi.fn(async (model, request) => {
      expect(request.organizationId).toBe(7);
      if (model === 'candidate') return reply(model, 'Reviewed [Source 1]');
      if (defect === 'placement-error') throw new Error('https://secret?key=hidden');
      const r = reply(model, defect === 'malformed-score' ? 'The score is 1' : '1');
      if (defect === 'wrong-version') r.resolvedModel = 'wrong';
      if (defect === 'wrong-provider') r.provider = 'anthropic';
      if (defect === 'self-judge') r.resolvedModel = 'candidate-pin';
      return r;
    });
    const result = await runRagPhase(options(), deps); expect(result.items[0]).toMatchObject({ servedModel: 'candidate-pin', servedProvider: 'anthropic', faithfulness: null });
    expect(result.items[0].error).toMatch(/JUDGE_FAILED/); expect(JSON.stringify(result)).not.toContain('hidden');
  });
  it('provider failure preserves every item and sanitizes operator errors', async () => {
    const deps = dependencies(); deps.evaluateModel = vi.fn(async () => { throw new Error('SECRET_TOKEN'); });
    const result = await runRagPhase(options(), deps); expect(result.items.map(i => i.itemId)).toEqual(['q1', 'n1']);
    expect(JSON.stringify(result)).not.toContain('SECRET_TOKEN');
  });
  it('retrieved negative controls execute the candidate, explicitly assess refusal and never invoke judge', async () => {
    const deps = dependencies(); const opts = options(); opts.items = [negative];
    deps.retrieve = vi.fn(async () => ({ documents: [{ id: 'chunk1', documentId: 'doc1', title: 'Unrelated source', content: 'Other topic.' }] }));
    const result = await runRagPhase(opts, deps); expect(result.items[0].negativeControlPassed).toBeNull(); expect(result.itemsScored).toBe(0);
    expect(result.items[0].error).toMatch(/NEGATIVE_CONTROL_REVIEW_REQUIRED/);
    expect(deps.evaluateModel).toHaveBeenCalledTimes(1);
  });
  it('a refusal marker followed by a fabricated fact never passes a negative control', async () => {
    const deps = dependencies(); const opts = options(); opts.items = [negative];
    deps.retrieve = vi.fn(async () => ({ documents: [{ id: 'chunk1', documentId: 'doc1', title: 'Unrelated', content: 'Other topic.' }] }));
    deps.evaluateModel = vi.fn(async () => reply('candidate', "I don't have enough information. However, enrollment was 850."));
    const result = await runRagPhase(opts, deps); expect(result.items[0].negativeControlPassed).toBeNull();
    expect(result.items[0].error).toMatch(/REVIEW_REQUIRED/);
  });
  it('cloud aliases cannot allow the same underlying pinned model to self-grade', async () => {
    expect(sameServingIdentity('anthropic.claude-opus-4:0', 'claude-opus-4')).toBe(true);
    const opts = options(); opts.judge.pinnedVersion = 'anthropic.candidate-pin:0'; const deps = dependencies();
    expect((await runRagPhase(opts, deps)).ran).toBe(false); expect(deps.verifyScope).not.toHaveBeenCalled();
  });
});

describe('trusted UUID to integer bootstrap', () => {
  it('reads the real key in role-less pre-auth scope and releases the connection', async () => {
    const release = vi.fn(); const query = vi.fn(async () => { expect(getTenantScope()).toMatchObject({ tenantId: '0', role: null }); return { rows: [{ id: 7, uuid: scope.organizationUuid }] }; });
    const pool = { connect: vi.fn(async () => ({ query, release })) };
    expect(await resolveEvaluationOrganizationId(pool as never, scope.organizationUuid)).toBe(7); expect(release).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE uuid = $1::uuid'), [scope.organizationUuid]);
  });
  it('missing or conflicting database mapping is refused rather than guessing', async () => {
    const pool = { connect: vi.fn(async () => ({ query: vi.fn(async () => ({ rows: [] })), release: vi.fn() })) };
    await expect(resolveEvaluationOrganizationId(pool as never, scope.organizationUuid)).rejects.toThrow(/bound/);
  });
});
