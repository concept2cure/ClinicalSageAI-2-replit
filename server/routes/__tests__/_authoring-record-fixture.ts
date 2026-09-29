/**
 * Shared by the authoring-record route tests that have to prove WHERE a write
 * went, not only that it happened: authoring-record-export.pglite.test.ts and
 * authoring-draft-accept-record.pglite.test.ts.
 *
 * ── Why the pool is wrapped ──────────────────────────────────────────────────
 * PGlite is ONE session. A statement a handler sends on the pool while its
 * transaction client is open runs INSIDE that transaction here, whereas on a
 * real pg Pool it would run on another connection and commit on its own. So a
 * write that escaped the transaction would still roll back in this harness and
 * an atomicity claim would pass for the wrong reason. `tappedPool` records
 * which executor each statement went through and whether a transaction was
 * open, and injects the faults; `responseMarker` puts the moment the response
 * leaves on the same trace.
 *
 * ── The offline verifier ─────────────────────────────────────────────────────
 * `verifyOffline` is the export package as an inspector holds it: the
 * downloaded JSON, nothing else. Each check is one of the package's
 * howToVerify steps, implemented with node:crypto and stableStringify only —
 * no server module.
 */
import { createHash } from 'node:crypto';
import type express from 'express';

import type { JourneyDb } from '../../../tests/golden-journeys/harness';
import { stableStringify } from '../../../shared/canonical-json';

export const T = 180_000;
export const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');

// ── The executor trace ───────────────────────────────────────────────────────
export type Via = 'pool' | 'client' | 'response';
export interface Stmt { via: Via; sql: string; params: unknown[]; inTx: boolean }
export interface Trace { stmts: Stmt[]; txOpen: boolean; failOn: RegExp | null; faultHits: number }

export const newTrace = (): Trace => ({ stmts: [], txOpen: false, failOn: null, faultHits: 0 });
export const head = (sql: string) => sql.trim().toUpperCase();
export const WRITE =
  /^\s*(?:INSERT INTO|UPDATE|DELETE FROM)\s+(authoring_sections|doc_revisions|authoring_audit_trail|audit_logs|authoring_ai_draft_candidates|authoring_comments|authoring_tracked_change_decisions|document_span_lineage)\b/i;

/** The statements since `mark`. */
export const since = (trace: Trace, mark: number) => trace.stmts.slice(mark);

/** The governed writes since `mark`: table, executor, inside a transaction. */
export const writesSince = (trace: Trace, mark: number) =>
  since(trace, mark)
    .filter((s) => s.via !== 'response' && WRITE.test(s.sql))
    .map((s) => [WRITE.exec(s.sql)![1].toLowerCase(), s.via, s.inTx] as const);

/** A pool over the journey database that records every statement on `trace` and throws where `trace.failOn` matches. */
export function tappedPool(jdb: JourneyDb, trace: Trace) {
  const tap = (via: Exclude<Via, 'response'>) => async (textOrConfig: unknown, params?: unknown[]) => {
    const sql = typeof textOrConfig === 'string' ? textOrConfig : String((textOrConfig as { text?: unknown })?.text ?? '');
    trace.stmts.push({ via, sql, params: params ?? [], inTx: trace.txOpen });
    if (via === 'client') {
      if (head(sql) === 'BEGIN') trace.txOpen = true;
      if (head(sql) === 'COMMIT' || head(sql) === 'ROLLBACK') trace.txOpen = false;
    }
    if (trace.failOn && trace.failOn.test(sql)) {
      trace.faultHits += 1;
      throw new Error(`injected: ${sql.trim().split('\n')[0]} failed`);
    }
    return jdb.pool.query(textOrConfig as string, params);
  };
  return { query: tap('pool'), connect: async () => ({ query: tap('client'), release: () => {} }) };
}

/** Middleware: the moment the response leaves, on the same trace as the statements. */
export function responseMarker(trace: Trace): express.RequestHandler {
  return (req, res, next) => {
    const end = res.end.bind(res) as (...a: unknown[]) => express.Response;
    (res as unknown as { end: (...a: unknown[]) => express.Response }).end = (...args: unknown[]) => {
      trace.stmts.push({ via: 'response', sql: `${req.method} ${req.originalUrl} -> ${res.statusCode}`, params: [], inTx: trace.txOpen });
      return end(...args);
    };
    next();
  };
}

// ── Reading back ─────────────────────────────────────────────────────────────
export async function rowsOf<R>(jdb: JourneyDb, sql: string, params: unknown[] = []): Promise<R[]> {
  return (await jdb.pglite.query<R>(sql, params)).rows;
}
export async function countOf(jdb: JourneyDb, sql: string, params: unknown[] = []): Promise<number> {
  const [r] = await rowsOf<{ n: number }>(jdb, sql, params);
  return Number(r.n);
}

// ── The offline verifier ─────────────────────────────────────────────────────
export interface PkgEvent {
  id: string; operation_type: string; before_content: string | null; after_content: string | null;
  change_reason: string | null; metadata: unknown;
}
export interface PkgChainEntry { payloadHash: string | null; sha256Chain: string | null; chainSeq: string | null; details: Record<string, unknown> }
export interface Pkg {
  format: string;
  document: Record<string, unknown>;
  events: PkgEvent[];
  chain: Record<string, PkgChainEntry>;
  verdicts: Record<string, { chained: boolean; intact: boolean | null; mismatches: string[]; chainPayloadIntact: boolean | null }>;
  summary: { events: number; intact: number; broken: number; notChained: number };
  tenantChain: { ok: boolean | null; rowsChecked?: number; reason?: string };
  howToVerify: string[];
  exportedBy: { userId: string | null };
}

export function verifyOffline(pkg: Pkg): Array<{ id: string; chained: boolean; failures: string[] }> {
  const hashOrNull = (v: string | null) => (v ? sha256(v) : null);
  return pkg.events.map((e) => {
    // Step 1: chain[event.id], whose details.trailId is event.id.
    const entry = pkg.chain[e.id];
    if (!entry) return { id: e.id, chained: false, failures: [] };
    const d = entry.details;
    const failures: string[] = [];
    if (d.trailId !== e.id) failures.push('trailId');
    // Step 2: SHA-256 of before/after content (null when empty).
    if (hashOrNull(e.before_content) !== (d.contentHashBefore ?? null)) failures.push('before_content');
    if (hashOrNull(e.after_content) !== (d.contentHashAfter ?? null)) failures.push('after_content');
    // Step 3: SHA-256 of the canonical JSON of the metadata.
    if (sha256(stableStringify(e.metadata)) !== d.metadataSha256) failures.push('metadata');
    // Step 4: reason and operation.
    if ((e.change_reason ?? null) !== (d.changeReason ?? null)) failures.push('change_reason');
    if (e.operation_type !== d.operationType) failures.push('operation_type');
    // Step 5: SHA-256 of JSON.stringify(details) is the chain link's payload hash.
    if (sha256(JSON.stringify(d)) !== entry.payloadHash) failures.push('payload_hash');
    return { id: e.id, chained: true, failures };
  });
}
