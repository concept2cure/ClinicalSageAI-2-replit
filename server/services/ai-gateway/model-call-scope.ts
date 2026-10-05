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
