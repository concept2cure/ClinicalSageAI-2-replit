/**
 * Where a model may not be called: the refusal scope a sub-agent's tools run
 * in (row 74).
 *
 * A child agent's tools are meant to be model-free. Its only model calls are
 * its own loop's, on a governed, pinned model, under its own run id. A read
 * tool with a model call hidden inside it — a reranker, a query rewriter, an
 * "explain" step — would spend tokens nobody budgeted, on a model nobody
 * chose, outside the child's lineage. A list of "model-free" tools is only a
 * claim about them; this makes it true at run time for every generation that
 * goes through the gateway — and only for those (see "What it does not
 * cover" below).
 *
 * The executor runs each child tool dispatch inside {@link
 * runRefusingModelCalls}, and `gateway.route()` asks {@link modelCallRefusal}
 * right after its pre-call abort check and refuses before anything is spent:
 * no placement lookup, no classification, no policy pass or rate bucket, no
 * dispatch, and so no ledger row. The error is `SubAgentToolModelCallError`
 * (gateway.ts, a GatewayPolicyError, so terminal: never retried, never walked
 * down the fallback ladder, never counted against a provider).
 *
 * AsyncLocalStorage, so the scope follows every async continuation the tool
 * starts — a timer, a promise chain — and ends with it. A caller that catches
 * the refusal and keeps a fallback (a reranker keeping the embedding order)
 * completes as it already does on a gateway failure. Scoped and unscoped work
 * in flight at the same time do not see each other's scope
 * (model-call-scope.test.ts).
 *
 * ── The capture hazard ───────────────────────────────────────────────────────
 * The same property cuts the other way, as it does for the tenant scope
 * (ana/run-control.ts, the poller "pinned to that first tenant forever"):
 * anything long-lived that is FIRST started inside a scope keeps it — a lazily
 * armed interval, a memoized init promise, a shared in-flight dedupe, a
 * listener run from a scoped emit. Every model call it makes afterwards is
 * refused, for every caller, including ones that are not sub-agents (a
 * refusal: fail closed, but wrong). The reverse loses the scope: work handed
 * to a pool or batcher whose callback runs in another context is not refused.
 * Nothing that can be reached from a sub-agent's tools does either today;
 * the test pins both behaviours so the hazard is visible. A tool offered to a
 * sub-agent that starts such a resource must start it outside the scope
 * (AsyncLocalStorage.exit, or AsyncResource.bind at creation).
 *
 * ── What it does not cover ───────────────────────────────────────────────────
 * `route()`, which every generation entry point (complete, chat,
 * structuredOutput) goes through, and since S5c the three egresses beside it
 * that {@link refuseModelCallHere} guards (the LiteLLM router branch, the
 * cross-encoder reranker, the RAG response cache). Embeddings are not generation and stay
 * allowed: retrieval needs them. Model egress that does not go through
 * `route()` — the files listed in scripts/ci/gateway-bypass-baseline.json,
 * among them rag-reranker.ts's cross-encoder calls, ai/LiteLLMAdapter.ts (the
 * LiteLLM branch of aiProviderRouter) and the anthropic-client.ts /
 * openai-client.ts factories — is NOT refused here. ci:gateway-bypass stops
 * that list growing; keeping a sub-agent's tools off it is the sub-agent
 * runner's allowlist to prove (row 74).
 *
 * Inert until something opens a scope; nothing did before sub-agents.
 *
 * @module server/services/ai-gateway/model-call-scope
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { getTenantScope } from '../../db/tenantStore.js';
import { looksLikeProgramUuid, parseIntegerProjectId } from '../../lib/project-id.js';
import type { DataSensitivityTier } from './types.js';

/** Whose tool is running, for the refusal's message and log line. */
export interface ModelCallRefusalScope {
  /** The sub-agent's own run id. */
  runId: string;
  /** The run that started the sub-agent. */
  parentRunId: string;
  /** The tool being dispatched. */
  tool: string;
}

const refusals = new AsyncLocalStorage<ModelCallRefusalScope>();

/** Run `fn` where any gateway.route() call it makes, directly or later, is refused. */
export function runRefusingModelCalls<T>(scope: ModelCallRefusalScope, fn: () => T): T {
  return refusals.run(scope, fn);
}

/** The refusal scope in force here, or null where a model may be called. */
export function modelCallRefusal(): ModelCallRefusalScope | null {
  return refusals.getStore() ?? null;
}

/**
 * Throw the gateway's own refusal (SubAgentToolModelCallError) when a model
 * may not be called here; return when it may. For the model egresses that do
 * not go through route() (row 74, S5c): the legacy router's LiteLLM branch,
 * the cross-encoder reranker, and the RAG pipeline's response cache, whose hit
 * is model output too. The class is loaded only when refusing, because the
 * gateway imports this module.
 */
export async function refuseModelCallHere(where: string): Promise<void> {
  const refusal = modelCallRefusal();
  if (!refusal) return;
  const { SubAgentToolModelCallError } = await import('./gateway.js');
  throw new SubAgentToolModelCallError({ ...refusal, tool: `${refusal.tool} (${where})` });
}

/** Private per-run source authority. Neither its identity nor a serialized
 * receipt/token is accepted back from model output or request metadata. */
export interface SourceRunIdentity { organizationId?: string | number | null; userId?: string | number | null; projectId?: string | number | null; programId?: string | null }
interface PinnedSourceIdentity { organizationId: number; userId: number; projectId: number | null; programId: string | null }
declare const sourceAuthorityBrand: unique symbol;
export interface RunSourceAuthority { readonly [sourceAuthorityBrand]: true }
interface SourceGrant extends PinnedSourceIdentity { key: string; tier: DataSensitivityTier; origin?: Pick<SourceRunIdentity, 'projectId' | 'programId'>; recheck(): Promise<void> }
interface RunSources { identity: PinnedSourceIdentity | null; tiers: Set<DataSensitivityTier>; grants: Map<string, Readonly<SourceGrant>>; revision: number }
const sourceAuthorities = new WeakMap<RunSourceAuthority, RunSources>();
const sourceRuns = new AsyncLocalStorage<RunSourceAuthority>();
const positiveSourceId = (v: unknown): number | null => {
  const n = typeof v === 'string' && /^[1-9]\d*$/.test(v) ? Number(v) : v;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
};
export class SourceRunAuthorityError extends Error {
  readonly code = 'SOURCE_RUN_AUTHORITY_UNAVAILABLE';
  constructor() { super('Current run identity, source version, classification or permission could not be verified. No model payload was released.'); this.name = 'SourceRunAuthorityError'; }
}
function refuseSourceRun(): never { throw new SourceRunAuthorityError(); }
function projectIdentity(raw: SourceRunIdentity): Pick<PinnedSourceIdentity, 'projectId' | 'programId'> | null {
  const programFromProject = looksLikeProgramUuid(raw.projectId) ? String(raw.projectId).trim().toLowerCase() : null;
  const projectId = raw.projectId == null || programFromProject ? null : parseIntegerProjectId(raw.projectId);
  const programId = raw.programId == null ? programFromProject : looksLikeProgramUuid(raw.programId) ? raw.programId.trim().toLowerCase() : null;
  if ((raw.projectId != null && !programFromProject && !projectId) || (raw.programId != null && !programId) ||
    (programFromProject && programFromProject !== programId)) return null;
  return { projectId, programId };
}
function sourceIdentity(raw: SourceRunIdentity): PinnedSourceIdentity | null {
  const organizationId = positiveSourceId(raw.organizationId), userId = positiveSourceId(raw.userId), project = projectIdentity(raw);
  return organizationId && userId && project ? Object.freeze({ organizationId, userId, ...project }) : null;
}
function compatibleProject(a: PinnedSourceIdentity, b: Pick<PinnedSourceIdentity, 'projectId' | 'programId'>): boolean {
  if (a.projectId !== null && b.projectId !== null && a.projectId !== b.projectId) return false;
  if (a.programId !== null && b.programId !== null && a.programId !== b.programId) return false;
  if (a.projectId === null && a.programId === null) return b.projectId === null && b.programId === null;
  return a.projectId !== null && a.projectId === b.projectId || a.programId !== null && a.programId === b.programId;
}
function authorityState(authority: RunSourceAuthority): RunSources {
  return sourceAuthorities.get(authority) ?? refuseSourceRun();
}
/** Unassessed conversation/history is deliberately T3. Missing identity is a
 * held scope: it cannot acquire source grants or pass an SDK checkpoint. */
export function createRunSourceAuthority(raw: SourceRunIdentity): RunSourceAuthority {
  const identity = sourceIdentity(raw), inherited = sourceRuns.getStore();
  if (inherited) {
    const prior = authorityState(inherited).identity;
    if (!prior || !identity || prior.organizationId !== identity.organizationId || prior.userId !== identity.userId || !compatibleProject(prior, identity)) refuseSourceRun();
    return inherited;
  }
  const authority = Object.freeze({}) as RunSourceAuthority;
  sourceAuthorities.set(authority, { identity, tiers: new Set([3]), grants: new Map(), revision: 0 });
  return authority;
}
export function runWithSourceAuthority<T>(authority: RunSourceAuthority, fn: () => T): T {
  authorityState(authority);
  return sourceRuns.run(authority, fn);
}
function admittedGrantIdentity(state: RunSources, grant: SourceGrant) {
  const actor = state.identity, source = sourceIdentity(grant);
  const origin = grant.origin ? projectIdentity(grant.origin) : source;
  if (!actor || !source || actor.organizationId !== source.organizationId || actor.userId !== source.userId ||
    !origin || ((actor.projectId !== null || actor.programId !== null) && !compatibleProject(actor, origin))) refuseSourceRun();
  return { actor, source };
}
/** Called only by actual backend read issuers after actor/project admission.
 * The callback, classification and source key never come from a tool result. */
export function recordCurrentRunSource(grant: SourceGrant): boolean {
  const authority = sourceRuns.getStore();
  if (!authority) return false;
  const state = authorityState(authority), { actor, source } = admittedGrantIdentity(state, grant);
  checkRequestIdentity(actor, { organizationId: source.organizationId, userId: source.userId });
  if (typeof grant.key !== 'string' || !grant.key || grant.key.length > 500 || typeof grant.recheck !== 'function' || state.grants.size >= 256) refuseSourceRun();
  const tier = Number.isInteger(grant.tier) && grant.tier >= 0 && grant.tier <= 3 ? grant.tier : 3;
  state.tiers.add(tier);
  if (!state.grants.has(grant.key)) { state.grants.set(grant.key, Object.freeze({ ...source, key: grant.key, tier, recheck: grant.recheck })); state.revision++; }
  return true;
}
function checkRequestIdentity(actor: PinnedSourceIdentity, raw: SourceRunIdentity): void {
  if (raw.organizationId !== undefined && positiveSourceId(raw.organizationId) !== actor.organizationId) refuseSourceRun();
  if (raw.userId !== undefined && positiveSourceId(raw.userId) !== actor.userId) refuseSourceRun();
  if (raw.projectId != null || raw.programId != null) { const project = projectIdentity(raw); if (!project || !compatibleProject(actor, project)) refuseSourceRun(); }
  const ambient = getTenantScope();
  if (ambient && ambient.tenantId !== String(actor.organizationId)) refuseSourceRun();
}
/** Root gateway composes this with its existing captured beforeDispatch hook.
 * Closure authority survives request copies; payload metadata cannot disable it. */
export function captureCurrentRunSourceGate(raw: SourceRunIdentity): { tiers: readonly DataSensitivityTier[]; identity: PinnedSourceIdentity | null; recheck(): Promise<void> } | undefined {
  const authority = sourceRuns.getStore(); if (!authority) return undefined;
  const requestIdentity = Object.freeze({ organizationId: raw.organizationId, userId: raw.userId, projectId: raw.projectId, programId: raw.programId });
  const state = authorityState(authority), actor = state.identity;
  if (actor) checkRequestIdentity(actor, requestIdentity);
  return Object.freeze({ tiers: Object.freeze([...state.tiers]), identity: actor, recheck: async () => {
    if (!actor) refuseSourceRun(); checkRequestIdentity(actor, requestIdentity);
    const revision = state.revision, grants = [...state.grants.values()];
    for (const grant of grants) await grant.recheck();
    if (state.revision !== revision) refuseSourceRun();
  } });
}
