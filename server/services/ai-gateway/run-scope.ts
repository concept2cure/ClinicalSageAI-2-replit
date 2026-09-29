/**
 * The AnA run a model call belongs to, carried the way the tenant scope is
 * (server/db/tenantStore.ts): through async context, not through every caller.
 *
 * The stream names its own dispatches' run explicitly (GatewayRequest.runId).
 * A tool handler it runs makes gateway calls of its own (batch drafting,
 * analysis), and those carried no run: the ledger wrote run_id NULL, so a run's
 * calls could not be listed from it (D6, 2026-09-26 review). The stream opens
 * this scope around each tool handler; the ledger reads it only when a request
 * names no run itself, and outside any run it invents none.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RunScope {
  runId: string;
  parentRunId?: string;
}

const runStorage = new AsyncLocalStorage<RunScope>();

/** Run `fn` as part of `scope`'s run. An empty run id opens no scope. */
export function runWithRunScope<T>(scope: RunScope, fn: () => T): T {
  return scope.runId ? runStorage.run(scope, fn) : fn();
}

/** The run the current async context belongs to, if any. */
export function currentRunScope(): RunScope | undefined {
  return runStorage.getStore();
}
