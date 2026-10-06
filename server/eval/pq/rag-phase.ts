/** Controlled PQ: canonical RAG retrieval/prompt, exact candidate and independent judge. */
import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { GatewayRequest, GatewayResponse } from '../../services/ai-gateway/types.js';
import type { RagRetrievalParams } from '../../services/ragRouter.js';
import { buildRagGenerationRequest, buildRagSourceText, RAG_EMPTY_CONTEXT_REFUSAL, type RagGenerationSource } from '../../services/rag-generation-request.js';
import { getTenantScope, runWithPreAuthScope } from '../../db/tenantStore.js';
import { isTenantUuid } from '../../db/currentTenant.js';
import { buildQueryParams, buildJudgeRequest } from '../rag/run-eval.js';
import { hitAtK, isGroundedRefusal, isNegativeControl, judgeFaithfulness, type GoldItem } from '../rag/rag-metrics.js';
import { resolveExpectedSources, requireEvaluationScope, withEvaluationTenantScope, type EvaluationScope, type GuidanceManifest, type GuidanceEntry, type ResolvedDocument } from '../rag/qualification-corpus.js';
import { servedModelMatches, sameServingIdentity, type PqModelPin, type PqRagRecord, type PqRagResult } from './pq-verdict.js';
import { isCompletedProviderText } from './output-integrity.js';

type EvaluationRequest = Omit<GatewayRequest, 'provider' | 'model' | 'strategy'>;
type RetrievalDocument = RagGenerationSource & { id: string; documentId?: string };
export interface RagPhaseDependencies {
  evaluateModel: (modelId: string, request: EvaluationRequest) => Promise<GatewayResponse>;
  verifyScope: (scope: EvaluationScope) => Promise<void>;
  readDocument: (scope: EvaluationScope, entry: GuidanceEntry) => Promise<ResolvedDocument>;
  retrieve: (request: RagRetrievalParams) => Promise<{ documents: RetrievalDocument[] }>;
}
export interface RagPhaseOptions {
  items: GoldItem[];
  manifest: GuidanceManifest;
  scope: EvaluationScope;
  generator: PqModelPin;
  judge: PqModelPin;
  goldBankSha256: string;
  corpusManifestSha256: string;
  k?: number;
}
const hash = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

/** Bootstrap only the public organization key; no guessed integer or privileged role. */
export async function resolveEvaluationOrganizationId(pool: Pick<pg.Pool, 'connect'>, organizationUuid: string): Promise<number> {
  if (!isTenantUuid(organizationUuid)) throw new Error('A usable evaluation organization UUID is required');
  const current = getTenantScope();
  if (current?.tenantId !== undefined && current.tenantId !== '0' && current.orgUuid && current.orgUuid.toLowerCase() !== organizationUuid.toLowerCase()) {
    throw new Error('Evaluation UUID conflicts with active tenant');
  }
  const lookup = async () => {
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT id, uuid::text AS uuid FROM organizations WHERE uuid = $1::uuid', [organizationUuid]);
      const row = result.rows[0];
      const id = Number(row?.id);
      if (result.rows.length !== 1 || !Number.isSafeInteger(id) || id <= 0 || row.uuid.toLowerCase() !== organizationUuid.toLowerCase()) throw new Error('Evaluation organization could not be uniquely bound');
      if (current?.tenantId && current.tenantId !== '0' && current.tenantId !== String(id)) throw new Error('Evaluation integer conflicts with active tenant');
      return id;
    } finally { client.release(); }
  };
  return current && current.tenantId !== '0' ? lookup() : runWithPreAuthScope('pq-evaluation-tenant-bootstrap', lookup);
}

function emptyItem(item: GoldItem): PqRagResult {
  return {
    itemId: item.id, negativeControl: isNegativeControl(item), generatorCalled: false,
    servedModel: null, servedProvider: null, servedModelVerified: false,
    judgeServedModel: null, judgeServedProvider: null, judgeVerified: false,
    hit: null, faithfulness: null, negativeControlPassed: null,
    expectedSourceKeys: item.expectedSourceKeys ?? [], expectedSourceIds: [], retrievedDocumentIds: [],
    sourceText: '', answer: null, generationRequestSha256: null, generationResponseSha256: null,
    judgeRequestSha256: null, judgeResponseSha256: null,
    review: { status: 'pending', reviewer: null, rationale: null },
  };
}

export function unavailableRagRecord(items: GoldItem[], reason: string, pins?: { generator: PqModelPin; judge: PqModelPin }): PqRagRecord {
  return { ran: false, notRunReason: reason, itemsScored: 0, plannedItemIds: items.map(i => i.id),
    attribution: pins, items: items.map(i => ({ ...emptyItem(i), error: reason })) };
}

function matches(response: GatewayResponse, pin: PqModelPin): boolean {
  return isCompletedProviderText(response) && response.provider === pin.provider && servedModelMatches(response.resolvedModel, pin.pinnedVersion);
}

/** Capture only documented response fields; never export arbitrary provider errors/metadata. */
function captureResponse(response: GatewayResponse) {
  return { content: response.content, model: response.model, resolvedModel: response.resolvedModel,
    provider: response.provider, cached: response.cached, deterministic: response.deterministic,
    finishReason: response.finishReason, requestId: response.requestId, usage: response.usage,
    latencyMs: response.latencyMs, effectiveSeed: response.effectiveSeed };
}

async function assessItem(item: GoldItem, opts: RagPhaseOptions, deps: RagPhaseDependencies): Promise<PqRagResult> {
  const out = emptyItem(item);
  let stage = 'SOURCE_BINDING';
  try {
    const resolution = await resolveExpectedSources(item, opts.manifest, opts.scope, deps.readDocument);
    if (resolution.errors.length) { out.error = `SOURCE_BINDING: ${resolution.errors.join('; ')}`; return out; }
    out.expectedSourceIds = resolution.sourceIds;
    stage = 'RETRIEVAL';
    const context = await deps.retrieve(buildQueryParams(item.question, { ...opts.scope, model: null, k: opts.k ?? 5 }));
    if (context.documents.some(d => typeof d.documentId !== 'string' || !d.documentId.trim())) {
      out.error = 'RETRIEVAL_DOCUMENT_ID_MISSING: Vault sources require actual document identities, not chunk IDs';
      return out;
    }
    out.retrievedDocumentIds = context.documents.map(d => d.documentId!);
    out.sourceText = buildRagSourceText(context.documents);
    if (!out.negativeControl) out.hit = hitAtK(out.retrievedDocumentIds, resolution.sourceIds, opts.k ?? 5);
    if (!context.documents.length) {
      out.answer = RAG_EMPTY_CONTEXT_REFUSAL;
      if (out.negativeControl) out.negativeControlPassed = true;
      else out.error = 'EMPTY_CONTEXT: positive item was not generated or judged';
      return out;
    }
    const request: EvaluationRequest = { ...buildRagGenerationRequest(item.question, out.sourceText), organizationId: opts.scope.organizationId, callerModule: 'pq-rag-generator' };
    out.generationRequest = request; out.generationRequestSha256 = hash(request);
    stage = 'GENERATOR'; out.generatorCalled = true;
    const generated = await deps.evaluateModel(opts.generator.modelId, request);
    out.servedModel = generated.resolvedModel ?? null; out.servedProvider = generated.provider;
    out.answer = generated.content; out.generationResponse = captureResponse(generated); out.generationResponseSha256 = hash(out.generationResponse);
    out.servedModelVerified = matches(generated, opts.generator);
    if (!out.servedModelVerified) { out.error = 'GENERATOR_ATTRIBUTION: response was empty, partial, cached, deterministic or not the pinned model/provider'; return out; }
    if (out.negativeControl) {
      // A refusal substring does not prove the remaining answer contains no
      // unsupported claims. Generated controls require an approved review
      // contract; only the canonical no-generation empty-context refusal is
      // automatically assessed here.
      out.error = 'NEGATIVE_CONTROL_REVIEW_REQUIRED: generated answer requires qualified refusal/unsupported-claim review';
      return out;
    }
    if (isGroundedRefusal(generated.content)) { out.error = 'POSITIVE_REFUSAL: positive item produced no judgeable grounded answer'; return out; }
    stage = 'JUDGE';
    out.faithfulness = await judgeFaithfulness(async prompt => {
      // The legacy router maps its 'reasoning' category to gateway 'general'.
      // Keep that mapping when calling the pinned evaluation model directly.
      const judgeRequest: EvaluationRequest = { ...buildJudgeRequest(prompt, { judgeModel: null, organizationId: opts.scope.organizationId }), taskType: 'general', organizationId: opts.scope.organizationId, callerModule: 'pq-rag-judge' };
      out.judgeRequest = judgeRequest; out.judgeRequestSha256 = hash(judgeRequest);
      const judged = await deps.evaluateModel(opts.judge.modelId, judgeRequest);
      out.judgeServedModel = judged.resolvedModel ?? null; out.judgeServedProvider = judged.provider;
      out.judgeResponse = captureResponse(judged); out.judgeResponseSha256 = hash(out.judgeResponse);
      out.judgeVerified = matches(judged, opts.judge) && !sameServingIdentity(out.servedModel, judged.resolvedModel);
      if (!out.judgeVerified) throw new Error('JUDGE_ATTRIBUTION');
      return judged.content;
    }, item.question, generated.content, context.documents.map(d => d.compressedContent || d.expandedContent || d.content), { strict: true });
  } catch {
    // Provider/DB messages can contain URLs, credentials or response bodies.
    out.error = `${stage}_FAILED: qualification step did not complete; inspect controlled operator diagnostics`;
    out.faithfulness = null;
  }
  return out;
}

/** All planned IDs survive failure. Tenant/programme binding precedes even negative retrieval. */
export async function runRagPhase(opts: RagPhaseOptions, deps: RagPhaseDependencies): Promise<PqRagRecord> {
  const pins = { generator: opts.generator, judge: opts.judge };
  if (!opts.items.length || opts.items.some(i => !i.id) || new Set(opts.items.map(i => i.id)).size !== opts.items.length) throw new Error('RAG gold must contain distinct nonempty item IDs');
  requireEvaluationScope(opts.scope);
  if (opts.generator.modelId === opts.judge.modelId || sameServingIdentity(opts.generator.pinnedVersion, opts.judge.pinnedVersion)) return unavailableRagRecord(opts.items, 'INDEPENDENT_JUDGE_REQUIRED', pins);
  try {
    return await withEvaluationTenantScope(opts.scope, async () => {
      await deps.verifyScope(opts.scope);
      const items: PqRagResult[] = [];
      for (const item of opts.items) items.push(await assessItem(item, opts, deps));
      return { ran: true, itemsScored: items.filter(i => !i.error && (i.hit !== null || i.faithfulness !== null)).length,
        items, plannedItemIds: opts.items.map(i => i.id), attribution: pins, scope: opts.scope, scopeVerified: true,
        goldBankSha256: opts.goldBankSha256, corpusManifestSha256: opts.corpusManifestSha256 };
    });
  } catch {
    return unavailableRagRecord(opts.items, 'TENANT_PROGRAMME_VERIFICATION_FAILED: no retrieval or model call authorized', pins);
  }
}

export async function defaultRagDependencies(evaluateModel: RagPhaseDependencies['evaluateModel']): Promise<RagPhaseDependencies & { resolveOrganizationId: (uuid: string) => Promise<number> }> {
  const [{ getPool }, corpus, { ragRouter }, { DbOrgPlacementResolver }, { setOrgPlacementResolver }] = await Promise.all([
    import('../../db/runtime.js'), import('../rag/qualification-corpus.js'), import('../../services/ragRouter.js'),
    import('../../services/ai-gateway/providers/org-placement-db.js'), import('../../services/ai-gateway/providers/org-placement.js'),
  ]);
  // CLI imports do not execute server startup, which installs the real policy resolver.
  setOrgPlacementResolver(new DbOrgPlacementResolver());
  return { evaluateModel, verifyScope: scope => corpus.verifyEvaluationScope(getPool(), scope),
    readDocument: (scope, entry) => corpus.readEvaluationDocument(getPool(), scope, entry),
    retrieve: request => ragRouter.retrieve(request),
    resolveOrganizationId: uuid => resolveEvaluationOrganizationId(getPool(), uuid) };
}
