/**
 * The live mirror of a turn's timeline: public.ana_run_events (AnA detach,
 * slice DT1; docs/design/ANA_DETACH_2026-10-08.md §3).
 *
 * ── One producer, a third sink ───────────────────────────────────────────────
 * `TurnTimeline.emitTimeline` stays the one producer. It appends each event to
 * the recorder, writes it as a `timeline` frame, and enqueues it here. This
 * module only carries what it is handed to the table: it computes nothing, and
 * the rows are the events the record will seal (§3.4).
 *
 * ── The queue ────────────────────────────────────────────────────────────────
 * Per run, ordered, flushed every RUN_EVENTS_FLUSH_MS or once RUN_EVENTS_BATCH
 * events wait, with one batch in flight. A failed batch is retried after 250 ms
 * and after 1 s, then dropped and logged at error level; the run is not failed
 * for it. The gap is visible by `seq` and by `ana_runs.timeline_seq`, and the
 * record still carries every event.
 *
 * ── Owner only, and in the run's own tenant scope ────────────────────────────
 * The INSERT names `owner_instance` in SQL, so another process can never write
 * this run's rows. Every flush opens the run's tenant scope itself: a timer
 * callback runs in the context that CREATED the timer, which may be another
 * tenant's request, and under RLS_ENFORCE=on that context would write zero
 * rows and report nothing (§1 row 13, DT1 test 8).
 *
 * ── Flush, then seal, then release ───────────────────────────────────────────
 * The guard trigger refuses an insert once the run has a sealed record, so the
 * owner AWAITS `close()` before it writes the record (`sealAfterMirror`). A
 * close that could not write everything stamps `timeline_seq` past the last
 * row, which marks the gap, and the record is sealed anyway: a record is never
 * withheld for a mirror. After the record, the rows go through the release
 * door, and `released_at` is written whatever came of the record.
 *
 * ── The cap ──────────────────────────────────────────────────────────────────
 * Seq 1–1,999 are mirrored; seq 2,000 is the truncation marker; nothing after
 * it. The CHECK on the table makes 2,000 a database fact (§3.5).
 *
 * @module server/services/ana/run-events
 */

import { runWithTenantScope } from '../../db/tenantStore.js';
import { createScopedLogger } from '../../utils/logger';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { stableStringify } from '../../../shared/canonical-json';
import { readWorkerSnapshot, type WorkerSnapshot } from '@shared/ana/turn-timeline';
import { writeChainedAuditRow } from '../auditService';
import { hashPayload } from '../audit/chain';
import { verifySequencedRow } from '../audit/chain-row';
import { admitRunCoordination, readCoordinationKey, requireRunOwnerContext, runOwnerInstance } from './run-control';
import { sealTenantPayload, type TenantEnvelopeContext } from '../security/field-encryption';
import type { DataSensitivityTier } from '../ai-gateway/types';
import {
  MIRROR_EVENT_CAP,
  MIRROR_TRUNCATED_SEQ,
  type MirroredTimelineEvent,
  type TimelineEvent,
} from '@shared/ana/turn-timeline';

const log = createScopedLogger('ana-run-events');

/** Regulatory coordination is an awaited ledger, never the lossy mirror below. */
export interface CoordinationPool {
  query(sql: string, args?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  connect(): Promise<{ query(sql: string, args?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; release(error?: Error): void }>;
}
export interface CoordinationScope { runId: string; organizationId: number; userId: number; projectId?: number; programId?: string; ownerInstance?: string; allowTerminal?: boolean }
export interface CoordinationSource { recheck(): Promise<void>; tiers: readonly DataSensitivityTier[] }
export interface CoordinationModel { provider: string | null; model: string | null; requestId?: string | null; approvedModelId?: string | null; pqStatus?: string | null; approvedForHighRisk?: boolean }
export interface CoordinationReceipt { eventId: string; eventHash: string; sequence: number; at: string }
export interface CoordinationProjection { receipt: CoordinationReceipt; snapshot: WorkerSnapshot }
export interface WorkerCoordinationHandle { readonly worker: string }
export interface CoordinationBasis { kind: 'run' | 'source' | 'finding' | 'rule' | 'report' | 'event'; ref: string; sha256?: string }
export interface CoordinationAction { intentId: string; basis?: CoordinationBasis[]; model?: CoordinationModel | null }
export interface CoordinationMonitor { basis: CoordinationBasis; assertCurrent(executor: Pick<CoordinationPool, 'query'>): Promise<void> }
export interface CoordinationHostOptions { source?: CoordinationSource; monitor?: CoordinationMonitor; basis?: CoordinationBasis[];
  beforeAssessment?: CoordinationMonitor['assertCurrent']; onProjection?: (projection: CoordinationProjection) => void;
  onPrivateRequired?:()=>void;onPrivateActivated?:(receipt:import('./run-control').RunOwnerPrivacyReceipt)=>Promise<void>|void }
export interface RunCoordinationHost {
  assign(input: CoordinationAction & { worker?: string; role: 'research' | 'verify'; task: string | null; parentStep: string; source?: CoordinationSource }): Promise<CoordinationProjection & { handle: WorkerCoordinationHandle }>;
  progress(handle: WorkerCoordinationHandle, phase: WorkerSnapshot['phase'], input: CoordinationAction & { completed: number | null; total: number | null; outcome?: WorkerSnapshot['outcome']; basisKind?: WorkerSnapshot['basis'] }): Promise<CoordinationProjection>;
  report(handle: WorkerCoordinationHandle, input: CoordinationAction & { reportSha256: string; source?: CoordinationSource; outcome?: WorkerSnapshot['outcome']; completed?: number | null; total?: number | null; basisKind?: WorkerSnapshot['basis'] }): Promise<CoordinationProjection>;
  message(handle: WorkerCoordinationHandle | null, input: CoordinationAction & { recipient: string; text?: string; messageKind?: 'review' | 'help' | 'source' | 'report' }): Promise<CoordinationProjection>;
  revise(handle: WorkerCoordinationHandle, input: CoordinationAction & { reportSha256: string; source?: CoordinationSource }): Promise<CoordinationProjection>;
  assess(input: CoordinationAction & { worker: string; reportEventId: string; reportSha256: string; decision: 'accepted_as_proposal' | 'rework' | 'rejected'; reason: string }): Promise<CoordinationProjection>;
  snapshot(handle?: WorkerCoordinationHandle): Promise<{ workers: WorkerSnapshot[]; messages: Array<{ sender: string; recipient: string; kind: string; receipt: CoordinationReceipt; text?: string; held?: true }> }>;
  modelContexts(handle?:WorkerCoordinationHandle):Promise<import('../ai-gateway/model-call-scope').OwnerPrivateModelContextCapsule[]>;
  refuse(handle:WorkerCoordinationHandle|null,input:CoordinationAction&{toolName:string;argsSha256:string;code:string}):Promise<CoordinationReceipt>;
}
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const eventSchema = z.object({ schema: z.literal('ana-coordination/1'), eventId: z.string().uuid(), eventHash: digest,
  runId: z.string().min(1), organizationId: z.number().int().positive(), ownerId: z.number().int().positive(), projectId: z.number().int().positive().nullable(),
  sequence: z.number().int().positive(), previous: digest.nullable(), at: z.string().datetime(), intentId: z.string().min(1).max(200), intentHash: digest,
  operation: z.enum(['assigned','progress','report','message','revision','disposition','refused']), worker: z.string().max(20), snapshot: z.unknown(),
  basis: z.array(z.object({ kind: z.enum(['run','source','finding','rule','report','event']), ref: z.string().min(1).max(200), sha256: digest.optional() }).strict()).min(1).max(32),
  model: z.object({ provider: z.string().nullable(), model: z.string().nullable(), requestId: z.string().nullable().optional(), approvedModelId: z.string().nullable().optional(), pqStatus: z.string().nullable().optional(), approvedForHighRisk: z.boolean().optional() }).strict().nullable(),
  reportSha256: digest.optional(), sender: z.string().max(20).optional(), recipient: z.string().max(20).optional(), messageKind: z.enum(['review','help','source','report']).optional(),
  reasonSha256: digest.optional(), refusal: z.string().max(100).optional(), payload: z.unknown().optional(),
}).strict();
export type CoordinationEvent = z.infer<typeof eventSchema>;
export type CoordinationDraft = Pick<CoordinationEvent, 'operation' | 'worker' | 'snapshot' | 'basis' | 'model'> & Partial<Pick<CoordinationEvent, 'reportSha256' | 'sender' | 'recipient' | 'messageKind' | 'reasonSha256'>>;
const issuedProjections = new WeakMap<object, CoordinationProjection>();
export class CoordinationRefused extends Error { constructor(readonly code = 'RUN_COORDINATION_UNAVAILABLE') { super(code); this.name = 'CoordinationRefused'; } }
const committedCoordinationRefusals=new WeakMap<object,CoordinationReceipt>();
export function coordinationRefusalReceipt(error:unknown):CoordinationReceipt|undefined{return error&&typeof error==='object'?committedCoordinationRefusals.get(error):undefined;}
export function coordinationRefused(code?: string): never { throw new CoordinationRefused(code); }
export const coordinationSha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
export function coordinationParentAlias(runId: string): string { return `p${coordinationSha256(runId).slice(0, 16)}`; }
export function assertCoordinationProjection(value: unknown): CoordinationProjection {
  if (!value || typeof value !== 'object') return coordinationRefused();
  return issuedProjections.get(value) ?? coordinationRefused();
}
export function coordinationSnapshot(event: Pick<CoordinationEvent, 'snapshot' | 'eventId' | 'eventHash'>): WorkerSnapshot {
  const snapshot = readWorkerSnapshot({ ...(event.snapshot as object), receipt: { eventId: event.eventId, eventHash: event.eventHash } });
  if (!snapshot) return coordinationRefused();
  return snapshot;
}
export function assignmentProjection(projection: CoordinationProjection, handle: WorkerCoordinationHandle) {
  const issued = assertCoordinationProjection(projection), result = Object.freeze({ ...issued, handle });
  issuedProjections.set(result, issued);
  return result;
}
function projectionOf(event: CoordinationEvent): CoordinationProjection {
  const receipt = Object.freeze({ eventId: event.eventId, eventHash: event.eventHash, sequence: event.sequence, at: event.at });
  if(event.refusal){const refused=new CoordinationRefused(event.refusal);committedCoordinationRefusals.set(refused,receipt);throw refused;}
  const snapshot = Object.freeze({ ...coordinationSnapshot(event), receipt });
  const projection = Object.freeze({ receipt, snapshot });
  issuedProjections.set(projection, projection);
  return projection;
}
export async function readCoordinationEvents(q: Pick<CoordinationPool, 'query'>,
  scope: CoordinationScope): Promise<CoordinationEvent[]> {
  try {
    const rows = await q.query(`SELECT * FROM audit_logs WHERE tenant_id=$1 AND action=$2 AND record_id=$3 ORDER BY chain_seq LIMIT 257`,
      [scope.organizationId, 'ana.coordination.recorded', scope.runId]);
    if (rows.rows.length > 256) return coordinationRefused('COORDINATION_LIMIT');
    const events: CoordinationEvent[] = [];
    for (const row of rows.rows) {
      const event = eventSchema.parse(row.new_values), { eventHash, ...body } = event;
      if (event.runId !== scope.runId || event.organizationId !== scope.organizationId || event.sequence !== events.length + 1 ||
          event.previous !== (events.at(-1)?.eventHash ?? null) || coordinationSha256(stableStringify(body)) !== eventHash || hashPayload(row.new_values) !== row.payload_hash) return coordinationRefused();
      const link = await verifySequencedRow(q, { action: String(row.action), actor_id: Number(row.actor_id), target: String(row.target),
        payload_hash: String(row.payload_hash), occurred_at: row.occurred_at as string | Date, tenant_id: scope.organizationId,
        sha256_chain: row.sha256_chain as string, hmac_seal: row.hmac_seal as string | null, chain_seq: row.chain_seq as string | number });
      if (link.link !== 'linked' || !['valid', 'no-key'].includes(link.seal)) return coordinationRefused();
      if (event.operation !== 'refused') coordinationSnapshot(event);
      events.push(event);
    }
    return events;
  } catch { return coordinationRefused(); }
}
export async function readRunCoordination(pool: Pick<CoordinationPool, 'query'>, scope: CoordinationScope) {
  const admitted = await admitRunCoordination(pool, scope);
  const events = await readCoordinationEvents(pool, scope), workers = new Map<string, WorkerSnapshot>();
  for (const event of events) {
    if (event.projectId !== admitted.projectId || event.ownerId !== admitted.ownerId) return coordinationRefused();
    if (event.operation === 'refused') continue;
    const worker = coordinationSnapshot(event), before = workers.get(worker.worker);
    if (worker.parent !== coordinationParentAlias(scope.runId) || worker.revision !== (before?.revision ?? 0) + 1) return coordinationRefused();
    workers.set(worker.worker, worker);
  }
  return { workers: [...workers.values()], receipts: events.map(({eventId,eventHash,sequence,at}) => ({eventId,eventHash,sequence,at})) };
}
export async function openRunCoordination(input: CoordinationScope & CoordinationHostOptions & { pool: CoordinationPool }): Promise<RunCoordinationHost> {
  const scope = { ...input, ownerInstance: input.ownerInstance ?? runOwnerInstance() };
  await admitRunCoordination(input.pool, scope, true);
  const { createRunCoordinationHost } = await import('./turn-plan');
  return createRunCoordinationHost(input.pool, scope, { onProjection: input.onProjection, source: input.source, monitor: input.monitor,
    basis: input.basis, beforeAssessment: input.beforeAssessment,onPrivateRequired:input.onPrivateRequired,onPrivateActivated:input.onPrivateActivated });
}
/** The run lock is also the idempotency fence after an uncertain COMMIT. */
export async function appendRunCoordination(pool: CoordinationPool, scope: CoordinationScope,
  intent: { intentId: string; intentHash: string; text?: string; source?: CoordinationSource; beforeAppend?: CoordinationMonitor['assertCurrent'] },
  make: (events: CoordinationEvent[]) => CoordinationDraft): Promise<CoordinationProjection> {
  intent = { ...intent, intentId: `i${coordinationSha256(intent.intentId)}` };
  const client = await pool.connect(); let committing = false; let uncertain = false; let discard = false; let confirmed: CoordinationEvent | undefined;
  try {
    await client.query('BEGIN');
    const admitted = await admitRunCoordination(client, scope, true), events = await readCoordinationEvents(client, scope);
    if (coordinationIntentChanged(events,intent)) {
      intent = { ...intent, intentId: `conflict:${coordinationSha256(`${intent.intentId}:${intent.intentHash}`)}`, text: undefined, source: undefined };
      make = () => coordinationRefused('COORDINATION_INTENT_CHANGED');
    }
    const prior = events.find(event => event.intentId === intent.intentId);
    if (prior) {
      await intent.beforeAppend?.(client); await intent.source?.recheck();
      if (prior.intentHash !== intent.intentHash) return coordinationRefused('COORDINATION_INTENT_CHANGED');
      await client.query('ROLLBACK'); return projectionOf(prior);
    }
    if (events.length >= 256) return coordinationRefused('COORDINATION_LIMIT');
    const eventId = randomUUID(), { draft, payload } = await prepareCoordinationDraft(client, { scope, projectId: admitted.projectId, eventId, intent, events, make });
    const event = coordinationEvent({scope,admitted,events,intent,eventId,draft,payload});
    await admitRunCoordination(client, scope, true);
    await writeChainedAuditRow(client, { tenantId: scope.organizationId, userId: scope.userId, action: 'ana.coordination.recorded',
      resourceType: 'ana_run_coordination', resourceId: scope.runId, details: event });
    committing = true; await client.query('COMMIT');
    confirmed = event;
  } catch (error) {
    if (!committing) { await client.query('ROLLBACK').catch(() => { discard = true; }); throw error; }
    uncertain = true;
  } finally { client.release(uncertain || discard ? new Error('Coordination transaction unconfirmed') : undefined); }
  if (confirmed) return projectionOf(confirmed);
  return recoverCoordinationEvent(pool, scope, intent);
}
function coordinationIntentChanged(events: CoordinationEvent[],intent:{intentId:string;intentHash:string}): boolean {
  const original = events.find(event => event.intentId === intent.intentId);
  return original !== undefined && original.intentHash !== intent.intentHash;
}
function coordinationEvent(input:{scope:CoordinationScope;admitted:{ownerId:number;projectId:number|null};events:CoordinationEvent[];
  intent:{intentId:string;intentHash:string};eventId:string;draft:CoordinationDraft;payload:unknown}): CoordinationEvent {
  const {scope,admitted,events,intent,eventId,draft,payload}=input;
  const body = { schema:'ana-coordination/1' as const,eventId,runId:scope.runId,organizationId:scope.organizationId,
    ownerId:admitted.ownerId,projectId:admitted.projectId,sequence:events.length+1,previous:events.at(-1)?.eventHash??null,
    at:new Date().toISOString(),intentId:intent.intentId,intentHash:intent.intentHash,...draft,
    ...(draft.operation==='refused'?{refusal:draft.basis[0].ref}:{}),...(payload===undefined?{}:{payload}) };
  const event=eventSchema.parse({...body,eventHash:coordinationSha256(stableStringify(body))});
  if(event.operation!=='refused')coordinationSnapshot(event);
  return event;
}
async function recoverCoordinationEvent(pool: CoordinationPool, scope: CoordinationScope,
  intent: { intentId: string; intentHash: string; source?: CoordinationSource; beforeAppend?: CoordinationMonitor['assertCurrent'] }) {
  const recovery = await pool.connect();
  let recovered: CoordinationEvent | undefined; let recoveryDiscard = false;
  try {
    await recovery.query('BEGIN'); await admitRunCoordination(recovery, scope, true);
    recovered = (await readCoordinationEvents(recovery, scope)).find(item => item.intentId === intent.intentId && item.intentHash === intent.intentHash);
    await intent.beforeAppend?.(recovery); await intent.source?.recheck();
    await recovery.query('ROLLBACK');
  } catch { recovered = undefined; await recovery.query('ROLLBACK').catch(() => { recoveryDiscard = true; }); }
  finally { recovery.release(recoveryDiscard ? new Error('Coordination recovery transaction unconfirmed') : undefined); }
  if (recovered) return projectionOf(recovered);
  return coordinationRefused('COORDINATION_COMMIT_UNCONFIRMED');
}
async function prepareCoordinationDraft(q: Pick<CoordinationPool, 'query'>, options: { scope: CoordinationScope; projectId: number | null;
  eventId: string; intent: { text?: string; source?: CoordinationSource; beforeAppend?: CoordinationMonitor['assertCurrent'] }; events: CoordinationEvent[]; make: (events: CoordinationEvent[]) => CoordinationDraft }) {
  const { scope, projectId, eventId, intent, events, make } = options;
  await q.query('SAVEPOINT coordination_attempt');
  try {
    const draft = make(events);
    await intent.beforeAppend?.(q);
    if(draft.operation!=='refused')coordinationSnapshot({ snapshot: draft.snapshot, eventId, eventHash: '0'.repeat(64) });
    if (intent.source) await intent.source.recheck();
    let payload: unknown;
    if (intent.text !== undefined) {
      if (projectId === null) return coordinationRefused('COORDINATION_PROJECT_REQUIRED');
      if (!intent.source) return coordinationRefused('COORDINATION_SOURCE_HELD');
      payload = await sealCoordinationText(q, { organizationId: scope.organizationId, projectId, ownerUserId: scope.userId }, eventId, intent.text);
      await intent.source.recheck();
    }
    return { draft, payload };
  } catch (error) {
    await q.query('ROLLBACK TO SAVEPOINT coordination_attempt');
    const draft: CoordinationDraft = { operation: 'refused', worker: 'anna', snapshot: null,
      basis: [{ kind: 'rule', ref: error instanceof CoordinationRefused ? error.code : error instanceof Error && error.message === 'COORDINATION_TENANT_KEY_REQUIRED' ? error.message : 'COORDINATION_CONTENT_HELD' }], model: null };
    return { draft, payload: undefined };
  }
}
async function sealCoordinationText(q: Pick<CoordinationPool, 'query'>, scope: { organizationId: number; projectId: number; ownerUserId: number }, eventId: string, text: string) {
  await requireRunOwnerContext(q, { organizationId: scope.organizationId, userId: scope.ownerUserId });
  const key = await readCoordinationKey(q, scope.organizationId);
  const context: TenantEnvelopeContext = { purpose: 'run_coordination', ...scope, derivativeId: eventId,
    sourceHash: coordinationSha256(text), policyVersion: key.version, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
  const ciphertext = await sealTenantPayload(text, context, key.keyArn), blobSha256 = coordinationSha256(ciphertext);
  await q.query(`INSERT INTO ana_record_blobs(organization_id,sha256,text,chars) VALUES($1,$2,$3,$4)
    ON CONFLICT(organization_id,sha256) DO NOTHING`, [scope.organizationId, blobSha256, ciphertext, ciphertext.length]);
  return { blobSha256, sha256: context.sourceHash, chars: text.length, keyArn: key.keyArn, context };
}

/** Flush interval for a run's queue. */
export const RUN_EVENTS_FLUSH_MS = 250;
/** Queue length that flushes without waiting for the interval. */
export const RUN_EVENTS_BATCH = 20;
/** The waits before each retry of a failed batch; after the last, it is dropped. */
export const RUN_EVENTS_RETRY_MS: readonly number[] = [250, 1_000];
/**
 * D-4: mirror rows of a run that ended with no record are expired after this
 * many days. Recommended; the period is the founder's call. The expiry door
 * refuses anything younger than its own copy of this number.
 */
export const RUN_EVENTS_RETENTION_DAYS = 90;

/** The one method this module uses. A pg Pool satisfies it. */
export interface RunEventsQuery {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

/** What `close()` found. */
export interface MirrorCloseResult {
  /** The highest seq the owner emitted for this run (uncapped). */
  emitted: number;
  /** Rows this mirror wrote, as the database counted them. */
  written: number;
  /** Events dropped after their retries ran out. */
  dropped: number;
}

export interface RunEventsMirror {
  readonly runId: string;
  /** Queue one event the producer emitted. Never throws, never waits. */
  enqueue(event: TimelineEvent): void;
  /** Flush everything queued and stamp the high-water mark. Idempotent. */
  close(): Promise<MirrorCloseResult>;
  /** After the record write: the release door when it was recorded, then `released_at`. Idempotent. */
  release(recorded: boolean): Promise<void>;
}

export interface OpenRunEventsMirrorInput {
  pool: RunEventsQuery;
  runId: string;
  organizationId: number;
  /** ana_runs.owner_instance of the process writing; the INSERT is guarded on it. */
  ownerInstance: string;
  /** Told the high-water mark after each enqueue (the heartbeat carries it). */
  onSeq?: (seq: number) => void;
  /** Test seam: the waits, so a test can run them without a real clock. */
  timing?: { flushMs?: number; retryMs?: readonly number[] };
}

/** The run's own tenant scope, opened per call, never inherited (§3.4). */
function inRunScope<T>(organizationId: number, caller: string, fn: () => Promise<T>): Promise<T> {
  return runWithTenantScope({ tenantId: String(organizationId), role: null, source: 'job', caller }, fn);
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });

const INSERT_EVENTS = `INSERT INTO ana_run_events (organization_id, run_id, seq, at, event)
SELECT r.organization_id, r.id, v.seq, v.at, v.event
  FROM ana_runs r, unnest($2::int[], $3::timestamptz[], $4::jsonb[]) AS v(seq, at, event)
 WHERE r.id = $1 AND r.organization_id = $5 AND r.owner_instance = $6
ON CONFLICT (run_id, seq) DO NOTHING`;

export function openRunEventsMirror(input: OpenRunEventsMirrorInput): RunEventsMirror {
  return new RunEventsQueue(input);
}

/** One run's ordered queue: one batch in flight, retried, then dropped (module docstring). */
class RunEventsQueue implements RunEventsMirror {
  readonly runId: string;
  private readonly queue: MirroredTimelineEvent[] = [];
  private readonly flushMs: number;
  private readonly retryMs: readonly number[];
  private emitted = 0;
  private written = 0;
  private dropped = 0;
  private truncated = false;
  private closed = false;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private closing: Promise<MirrorCloseResult> | null = null;
  private releasing: Promise<void> | null = null;

  constructor(private readonly input: OpenRunEventsMirrorInput) {
    this.runId = input.runId;
    this.flushMs = input.timing?.flushMs ?? RUN_EVENTS_FLUSH_MS;
    this.retryMs = input.timing?.retryMs ?? RUN_EVENTS_RETRY_MS;
  }

  enqueue(event: TimelineEvent): void {
    if (this.closed) return;
    this.emitted = Math.max(this.emitted, event.seq);
    try {
      this.input.onSeq?.(this.emitted);
    } catch {
      /* the heartbeat's copy of the mark is advisory */
    }
    if (event.seq > MIRROR_EVENT_CAP) {
      if (this.truncated) return;
      this.truncated = true;
      this.queue.push({ kind: 'truncated', seq: MIRROR_TRUNCATED_SEQ, at: event.at, round: event.round });
    } else {
      this.queue.push(event);
    }
    this.schedule(this.queue.length >= RUN_EVENTS_BATCH ? 0 : this.flushMs);
  }

  close(): Promise<MirrorCloseResult> {
    this.closed = true;
    this.closing ??= this.drainAndStamp();
    return this.closing;
  }

  release(recorded: boolean): Promise<void> {
    this.releasing ??= this.releaseOnce(recorded);
    return this.releasing;
  }

  private async drainAndStamp(): Promise<MirrorCloseResult> {
    this.clearTimer();
    // The batch in flight, then whatever is still queued.
    while (this.inFlight || this.queue.length > 0) await this.flush();
    // The high-water mark, exact at the end. Past the last row when a batch
    // was dropped, which is the gap a reader sees (§3.6).
    const { runId, organizationId, pool } = this.input;
    await inRunScope(organizationId, 'ana-run-events:close', () =>
      pool.query(
        `UPDATE ana_runs SET timeline_seq = GREATEST(timeline_seq, $3)
          WHERE id = $1 AND organization_id = $2`,
        [runId, organizationId, this.emitted],
      ),
    ).catch((err: any) => log.error(`[ana-run-events] could not stamp timeline_seq for ${runId}: ${err?.message}`));
    return { emitted: this.emitted, written: this.written, dropped: this.dropped };
  }

  private async releaseOnce(recorded: boolean): Promise<void> {
    const { runId, organizationId, pool } = this.input;
    if (recorded) await releaseSealedRunEvents(pool, organizationId, runId);
    await inRunScope(organizationId, 'ana-run-events:released', () =>
      pool.query(
        `UPDATE ana_runs SET released_at = now(), updated_at = now()
          WHERE id = $1 AND organization_id = $2 AND released_at IS NULL`,
        [runId, organizationId],
      ),
    ).catch((err: any) => log.error(`[ana-run-events] could not write released_at for ${runId}: ${err?.message}`));
  }

  /** Write what is queued now, one batch in flight; resolves when it is written or dropped. */
  private flush(): Promise<void> {
    this.clearTimer();
    if (this.inFlight) return this.inFlight;
    if (this.queue.length === 0) return Promise.resolve();
    const batch = this.queue.splice(0, this.queue.length);
    this.inFlight = this.writeBatch(batch).finally(() => {
      this.inFlight = null;
      // Events that arrived while the batch was in flight go next.
      if (this.queue.length > 0 && !this.closed) this.schedule(this.queue.length >= RUN_EVENTS_BATCH ? 0 : this.flushMs);
    });
    return this.inFlight;
  }

  private schedule(ms: number): void {
    if (this.timer || this.inFlight) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
    this.timer.unref?.();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async writeBatch(batch: MirroredTimelineEvent[]): Promise<void> {
    const { runId, organizationId, ownerInstance, pool } = this.input;
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await inRunScope(organizationId, 'ana-run-events:flush', () =>
          pool.query(INSERT_EVENTS, [
            runId,
            batch.map((e) => e.seq),
            batch.map((e) => e.at),
            batch.map((e) => JSON.stringify(e)),
            organizationId,
            ownerInstance,
          ]),
        );
        this.written += r.rowCount ?? 0;
        return;
      } catch (err: any) {
        if (attempt >= this.retryMs.length) {
          this.dropped += batch.length;
          log.error(
            `[ana-run-events] dropped seq ${batch[0].seq}–${batch[batch.length - 1].seq} of ${runId} after ${attempt + 1} attempts: ${err?.message}. ` +
              'The record keeps every event; the gap shows by seq and timeline_seq.',
          );
          return;
        }
        await sleep(this.retryMs[attempt]);
      }
    }
  }
}

/**
 * Flush, then seal, then release (§3.4): the order the guard trigger requires.
 * `write` is the record write; whatever it answers, the mirror is released.
 * With no mirror (a turn with no durable run), it is the write alone.
 */
export async function sealAfterMirror<T extends { status: string }>(
  mirror: RunEventsMirror | null | undefined,
  write: () => Promise<T>,
): Promise<T> {
  if (mirror) {
    // close() logs its own failures and resolves; a record is never withheld for a mirror.
    await mirror.close().catch(() => undefined);
  }
  const status = await write();
  if (mirror) await mirror.release(status.status === 'recorded').catch(() => undefined);
  return status;
}

/** A refusal the door raises on purpose, as opposed to a failure. */
const isLegalHold = (err: any) => String(err?.message ?? '').startsWith('RUN_EVENTS_LEGAL_HOLD');

/**
 * Door 1: delete a sealed run's rows, in the run's own scope. Null when the
 * door refused or failed (logged); the rows are then kept for the reaper's
 * pass, or, under a legal hold, for as long as the hold stands.
 */
export async function releaseSealedRunEvents(
  pool: RunEventsQuery,
  organizationId: number,
  runId: string,
): Promise<number | null> {
  try {
    const { rows } = await inRunScope(organizationId, 'ana-run-events:release', () =>
      pool.query('SELECT public.release_sealed_run_events($1, $2) AS n', [organizationId, runId]),
    );
    return Number(rows[0]?.n ?? 0);
  } catch (err: any) {
    if (isLegalHold(err)) {
      log.warn(`[ana-run-events] ${runId} kept: organization ${organizationId} is under a legal hold.`);
    } else {
      log.error(`[ana-run-events] release of ${runId} failed: ${err?.message}`);
    }
    return null;
  }
}

/** Door 2: expire one organisation's rows of runs that ended with no record (D-4). */
export async function expireOrphanedRunEvents(
  pool: RunEventsQuery,
  organizationId: number,
  retentionDays = RUN_EVENTS_RETENTION_DAYS,
): Promise<number | null> {
  try {
    const { rows } = await inRunScope(organizationId, 'ana-run-events:expire', () =>
      pool.query(
        'SELECT public.expire_orphaned_run_events($1, now() - make_interval(days => $2)) AS n',
        [organizationId, retentionDays],
      ),
    );
    return Number(rows[0]?.n ?? 0);
  } catch (err: any) {
    if (isLegalHold(err)) return null;
    log.error(`[ana-run-events] expiry for organization ${organizationId} failed: ${err?.message}`);
    return null;
  }
}
