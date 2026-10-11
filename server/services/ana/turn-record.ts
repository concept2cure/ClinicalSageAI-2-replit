/**
 * AnA's turn record — one immutable, reportable record of every turn.
 *
 * ── What it answers ──────────────────────────────────────────────────────────
 * The four questions an inspector asks of an AI-assisted regulatory record,
 * each from what the server actually did, never from a reconstruction:
 *
 *   what the person asked     their text as typed, and the text sent as the
 *                             question (after the @app / slash rewrite and any
 *                             injection encapsulation)
 *   what the model was given  every message of the first model call — system
 *                             prompt, context block, history, attachment
 *                             notice, each document block by the hash of its
 *                             bytes — plus the files and memory the turn read
 *                             (the `context_used` event, with each upload's
 *                             recorded SHA-256)
 *   what AnA did              every plan she declared, every tool call with its
 *                             inputs and its full result, the web steps, the
 *                             model that served each round, the person's
 *                             pause / steer / stop, her reasoning
 *   what she answered         the answer as streamed and as stored, and every
 *                             draft she produced
 *   what was checked          the engine's check of that answer against what
 *                             she consulted, and her own evidence labels, as
 *                             the person was shown them (`verification`,
 *                             schema /2 from 2026-10-04: a later re-run of a
 *                             changed engine is not the verdict she was given)
 *
 * ── How it is kept ───────────────────────────────────────────────────────────
 * Content-addressed. Every text is stored once, in `ana_record_blobs`, under
 * its SHA-256; the record lists hashes and lengths, not the texts. The record
 * itself is canonical JSON (sorted keys, no whitespace), stored byte for byte
 * in `ana_turn_records.record_text` with its SHA-256; and a chained
 * `audit_logs` row, written in the SAME transaction, carries that hash. So:
 *
 *   tenant hash chain → record hash → record → text hashes → texts
 *
 * Change any byte anywhere and verification says where. Both tables refuse
 * UPDATE, DELETE and TRUNCATE in the engine (migrations/20260926_*). A record
 * is never edited: a correction is a new record.
 *
 * Content addressing is also what keeps a long conversation affordable: the
 * history re-sent on turn 40 is 39 hashes, not 39 copies.
 *
 * ── What it refuses ──────────────────────────────────────────────────────────
 * Nothing is summarised, truncated or inferred. A step with no recorded result
 * says so; an upload whose bytes the turn never read is recorded as read by
 * name only; a turn that failed is recorded as failed, with what it did before
 * failing. A record that could not be written is reported to the person as
 * not recorded — never as recorded.
 *
 * @compliance 21 CFR Part 11 §11.10(b), (c), (e); EU Annex 11 §9; ALCOA+.
 * @module server/services/ana/turn-record
 */

import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json.js';

import { writeChainedAuditRow } from '../auditService.js';
import { qualifyServedModels, type QualifiedServedModel } from '../ai-governance/approved-models.js';
import { servedModelsOf } from './turn-record-models.js';
import type { TurnPlanStep } from './turn-plan.js';
import type { ContextUsedEvent } from './turn-context-used.js';
import type { TurnVerification } from './turn-verification.js';
import { endReasonOf, stepRecordLink, type SealedTimelineEvent, type StepRecordLink, type StepRecordTimes, type TimelineEvent } from '@shared/ana/turn-timeline';

/**
 * /2 (2026-10-04) adds `verification`. A /1 record has no such section.
 * /3 (2026-10-05, AnA reasoning round 9) adds `routing`, and on each model
 * call its gateway `requestId` and what it was `sent`.
 * /4 (2026-10-08, ANA-SUMMARY S4) adds `timeline` — the events the Summary is
 * built from, exactly as the client was sent them, each note's text by
 * reference — and `stoppedReason`; and on each step its tool-use id, its
 * timeline handle, when its handler was dispatched and ended, whether it was
 * held back, its status sentence and whether a model was used in it.
 * Verification has no schema gate: /1–/3 records verify as they always did,
 * and only the Summary branches on the version.
 */
export const TURN_RECORD_SCHEMA = 'ana-turn-record/4';
export const TURN_RECORD_AUDIT_ACTION = 'ana.turn.recorded';
export const TURN_RECORD_RESOURCE = 'ana_turn_record';

export type TurnOutcome = 'answered' | 'stopped' | 'failed';

/** A text, by its SHA-256 and length. The text itself is a blob. */
export interface TextRef {
  sha256: string;
  chars: number;
}

export interface ModelInputBlock {
  type: string;
  /** For a document block: the SHA-256 and size of the decoded bytes. */
  sha256?: string;
  bytes?: number;
  mediaType?: string;
  title?: string;
  text?: TextRef;
}

export interface ModelInputMessage {
  role: string;
  text: TextRef;
  blocks?: ModelInputBlock[];
}

export interface RecordedFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  /** What the turn gave the model: the bytes, or the name and id only. */
  read: 'content' | 'name_only';
  /** The SHA-256 recorded when the file was uploaded; null when none was. */
  uploadSha256: string | null;
}

/** A step as the record keeps it; from /4 with its link to the timeline (StepRecordLink). */
export interface RecordedStep extends StepRecordLink {
  round: number;
  tool: string;
  label: string;
  status: string;
  latencyMs: number | null;
  input: TextRef;
  /** The tool's full result. Null when the step produced none (it was stopped before it ran). */
  result: TextRef | null;
  /**
   * What the model was actually given for this step, when that differs from
   * the result: the round's results are budgeted (truncated) before the model
   * reads them, and a directive the drive budget stopped is rewritten. Absent
   * when the model read the result as it was.
   */
  sentToModel?: TextRef;
  error: string | null;
  /** 'server' for a model-provider tool (web search / fetch) run inside the model call. */
  runBy: 'platform' | 'server';
}

/** What /4 adds to a step, as the stream knows it when the step ends. */
export type RecordedStepTimes = StepRecordTimes;

export interface RecordedDraft {
  title: string;
  documentType: string | null;
  authoringDocId: string | null;
  programId: string | null;
  content: TextRef;
}

export interface TurnRecordBody {
  schema: string;
  turn: {
    organizationId: number;
    threadId: string | null;
    runId: string | null;
    actorUserId: number | null;
    projectId: string | null;
    surface: string | null;
    userMessageId: number | null;
    assistantMessageId: number | null;
    startedAt: string;
    endedAt: string;
    outcome: TurnOutcome;
  };
  request: { typed: TextRef; sentAsQuestion: TextRef | null };
  /** The messages of the first model call, in order. */
  modelInput: ModelInputMessage[];
  /**
   * What each later model call added to the conversation before it was made:
   * the model's own previous turn, the tool results as it read them, any
   * adaptation note and any steer the person sent. modelInput followed by
   * these, in order, is every model call's full input.
   */
  roundInputs: Array<{ call: number; round: number; messages: ModelInputMessage[] }>;
  context: {
    files: RecordedFile[];
    unresolvedUploads: number;
    memory: ContextUsedEvent['memory'];
    memoryStatus: ContextUsedEvent['memoryStatus'] | null;
  };
  model: {
    provider: string | null;
    model: string | null;
    effort: string | null;
    /**
     * Every model call of the turn, numbered in order, with the provider and
     * model that served it. `round` is the agentic-loop round the stream
     * labels the call with: the first call and the call that reads round 1's
     * results both belong to round 1, so the call number is what orders them.
     * A model the gateway did not report is recorded as null, not omitted.
     */
    calls: Array<{
      call: number;
      round: number;
      provider: string | null;
      model: string | null;
      /** The gateway request the call was, which joins it to the ledger row (D6). Null when not reported. */
      requestId: string | null;
      /** What the call asked for. Null where the door does not say. */
      sent: CallSent | null;
    }>;
  };
  /**
   * How the kernel routed the turn, and why: the risk tier that decides the
   * model, the thinking and the effort (rounds 4 and 7). Null where the door
   * does not hand its routing over, as the loop doors (turn-record-loop.ts)
   * do not.
   */
  routing: { riskTier: string; taskType: string; rationale: string } | null;
  plan: Array<{ round: number; at: string; steps: TurnPlanStep[] }>;
  steps: RecordedStep[];
  /** Pause, steer and stop, as the run row holds them. Null when they could not be read — never an empty list standing in for "none". */
  controls: unknown[] | null;
  reasoning: TextRef | null;
  answer: { streamed: TextRef | null; stored: TextRef | null };
  outputs: {
    drafts: RecordedDraft[];
    executedActions: unknown[];
    executedCommands: unknown[];
  };
  /**
   * The check of the stored answer and AnA's labels, exactly as the person
   * was shown them (services/ana/turn-verification.ts). Null when no check
   * ran: the turn failed first, or its door does not check.
   */
  verification: TurnVerification | null;
  warnings: string[];
  /**
   * From /4: the Summary's events, in the order the client was sent them
   * (shared/ana/turn-timeline.ts), a note's text by reference. Absent before /4.
   */
  timeline?: SealedTimelineEvent[];
  /** From /4: why the run stopped, `client_disconnected` included; null when it was not stopped. */
  stoppedReason?: string | null;
}

/**
 * What one model call asked for: its API effort, its thinking config, the
 * tools it offered (by name — never their schemas) and its tool choice.
 */
export interface CallSent {
  effort: string | null;
  thinking: { enabled: boolean; budgetTokens: number | null } | null;
  tools: string[];
  toolChoice: string | null;
}

/** A call's sent facts, read from the request the stream built. */
export function callSent(req: {
  apiEffort?: string | null;
  thinking?: { enabled?: boolean; budgetTokens?: number } | null;
  tools?: ReadonlyArray<{ name?: string }>;
  toolChoice?: string | null;
}): CallSent {
  const thinking = req.thinking ? { enabled: req.thinking.enabled === true, budgetTokens: req.thinking.budgetTokens ?? null } : null;
  const tools = (req.tools ?? []).map((t) => t.name).filter((n): n is string => typeof n === 'string');
  return { effort: req.apiEffort ?? null, thinking, tools, toolChoice: req.toolChoice ?? null };
}

export function sha256Hex(text: string | Buffer): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Canonical JSON: the repo's one serializer for hashing (shared/canonical-json,
 * held to one copy by ci:canonicalizers). A record's hash is computed over the
 * exact text stored, and verification re-hashes that stored text — it never
 * re-serializes — so which serializer wrote a record never changes whether it
 * verifies. This module briefly carried its own copy; every field a turn
 * record holds is plain JSON, where the two agree byte for byte.
 */
export const canonicalJson = (value: unknown): string => stableStringify(value);

/** The structural slice of a gateway message this module reads. */
interface GatewayMessageLike {
  role: string;
  content: unknown;
  contentBlocks?: Array<Record<string, any>>;
}

const textOf = (content: unknown): string =>
  typeof content === 'string' ? content : canonicalJson(content ?? '');

/**
 * Accumulates one turn as the stream runs, then seals it. Pure: no I/O. The
 * stream calls it at the points where the facts become known; nothing here
 * guesses a fact the stream did not report.
 */
export class TurnRecorder {
  readonly startedAt = new Date().toISOString();
  private readonly blobs = new Map<string, string>();
  private turn: Partial<TurnRecordBody['turn']> = {};
  private request: TurnRecordBody['request'] | null = null;
  private modelInput: ModelInputMessage[] = [];
  private readonly roundInputs: TurnRecordBody['roundInputs'] = [];
  private context: TurnRecordBody['context'] = { files: [], unresolvedUploads: 0, memory: [], memoryStatus: null };
  private readonly model: TurnRecordBody['model'] = { provider: null, model: null, effort: null, calls: [] };
  private readonly plan: TurnRecordBody['plan'] = [];
  private readonly steps: RecordedStep[] = [];
  private readonly stepByToolUseId = new Map<string, number>();
  private controls: unknown[] | null = [];
  private reasoning: TextRef | null = null;
  private answer: TurnRecordBody['answer'] = { streamed: null, stored: null };
  private outputs: TurnRecordBody['outputs'] = { drafts: [], executedActions: [], executedCommands: [] };
  private verification: TurnVerification | null = null;
  private routing: TurnRecordBody['routing'] = null;
  private readonly warnings: string[] = [];
  private readonly timeline: SealedTimelineEvent[] = [];
  private streamedSoFar = '';

  /** Keep a text as a blob and return its reference. */
  ref(text: string): TextRef {
    const sha256 = sha256Hex(text);
    this.blobs.set(sha256, text);
    return { sha256, chars: text.length };
  }

  setTurn(t: {
    organizationId: number;
    threadId?: string | null;
    runId?: string | null;
    actorUserId?: number | null;
    projectId?: string | null;
    surface?: string | null;
  }): void {
    this.turn = { ...this.turn, ...t };
  }

  /** The conversation the turn was saved into, once the server has resolved it. */
  setThread(threadId: string | null): void {
    this.turn.threadId = threadId;
  }

  setMessageIds(ids: { user?: number | null; assistant?: number | null }): void {
    if (ids.user !== undefined) this.turn.userMessageId = ids.user;
    if (ids.assistant !== undefined) this.turn.assistantMessageId = ids.assistant;
  }

  setRequest(typed: string, sentAsQuestion?: string | null): void {
    this.request = {
      typed: this.ref(typed),
      sentAsQuestion: typeof sentAsQuestion === 'string' ? this.ref(sentAsQuestion) : null,
    };
  }

  /** The model's input at the first call. Document bytes are hashed, never stored here. */
  setModelInput(messages: GatewayMessageLike[]): void {
    this.modelInput = messages.map((m) => this.messageOf(m));
  }

  /** The messages added to the conversation for a later round's model call. */
  addRoundInput(round: number, added: GatewayMessageLike[]): void {
    // Staged before the call is made: it is the input of the next call.
    this.roundInputs.push({ call: this.model.calls.length + 1, round, messages: added.map((m) => this.messageOf(m)) });
  }

  private messageOf(m: GatewayMessageLike): ModelInputMessage {
    const out: ModelInputMessage = { role: m.role, text: this.ref(textOf(m.content)) };
    if (Array.isArray(m.contentBlocks) && m.contentBlocks.length > 0) {
      out.blocks = m.contentBlocks.map((b) => this.blockOf(b));
    }
    return out;
  }

  private blockOf(b: Record<string, any>): ModelInputBlock {
    if (b?.type === 'document') return this.documentBlockOf(b);
    if (b?.type === 'text' && typeof b.text === 'string') return { type: 'text', text: this.ref(b.text) };
    return { type: String(b?.type ?? 'unknown'), text: this.ref(canonicalJson(b)) };
  }

  /** A document's bytes are hashed from the decoded base64, never stored in the record. */
  private documentBlockOf(b: Record<string, any>): ModelInputBlock {
    const source = b.source ?? {};
    if (source.type === 'base64' && typeof source.data === 'string') {
      const bytes = Buffer.from(source.data, 'base64');
      return { type: 'document', sha256: sha256Hex(bytes), bytes: bytes.length, mediaType: source.media_type, title: b.title };
    }
    return { type: 'document', mediaType: source.media_type, title: b.title, text: this.ref(canonicalJson(source)) };
  }

  /** The files and memory the turn read, with each upload's recorded checksum. */
  setContext(event: ContextUsedEvent, uploadSha256: Map<string, string | null>): void {
    this.context = {
      files: event.uploads.map((u) => ({
        fileId: u.fileId,
        fileName: u.fileName,
        mimeType: u.mimeType,
        read: u.read,
        uploadSha256: uploadSha256.get(u.fileId) ?? null,
      })),
      unresolvedUploads: event.unresolvedUploads,
      memory: event.memory,
      memoryStatus: event.memoryStatus,
    };
  }

  setModel(m: { provider?: string | null; model?: string | null; effort?: string | null }): void {
    if (m.provider !== undefined) this.model.provider = m.provider ?? null;
    if (m.model !== undefined) this.model.model = m.model ?? null;
    if (m.effort !== undefined) this.model.effort = m.effort ?? null;
  }

  /** A model call returned; recorded in call order, with what it was sent when the door says. */
  addServed(
    round: number,
    served: { provider?: string | null; model?: string | null; requestId?: string | null },
    sent?: CallSent,
  ): void {
    this.model.calls.push({
      call: this.model.calls.length + 1,
      round,
      provider: served.provider ?? null,
      model: served.model ?? null,
      requestId: served.requestId ?? null,
      sent: sent ?? null,
    });
  }

  /** How the kernel routed the turn (planKernelExecution's plan). */
  setRouting(plan: { riskTier: string; taskType: string; decisionRationale: string }): void {
    this.routing = { riskTier: plan.riskTier, taskType: plan.taskType, rationale: plan.decisionRationale };
  }

  addPlan(round: number, steps: TurnPlanStep[]): void {
    this.plan.push({ round, at: new Date().toISOString(), steps: steps.map((s) => ({ ...s })) });
  }

  addStep(s: {
    toolUseId?: string;
    round: number;
    tool: string;
    label: string;
    status: string;
    latencyMs?: number | null;
    input: unknown;
    result: string | null;
    error?: string | null;
    runBy?: 'platform' | 'server';
  } & StepRecordTimes): void {
    this.steps.push({
      round: s.round,
      tool: s.tool,
      label: s.label,
      status: s.status,
      latencyMs: typeof s.latencyMs === 'number' ? s.latencyMs : null,
      input: this.ref(canonicalJson(s.input ?? {})),
      result: typeof s.result === 'string' ? this.ref(s.result) : null,
      error: s.error ?? null,
      runBy: s.runBy ?? 'platform',
      // From /4: the step's link to its timeline events, only the fields the stream reported.
      ...stepRecordLink(s),
    });
    if (s.toolUseId) this.stepByToolUseId.set(s.toolUseId, this.steps.length - 1);
  }

  /**
   * One timeline event, as the client was sent it. A note's text is kept as a
   * blob and referenced, so it shares the blob of the round's prose. Accepted
   * until the record seals, whatever the run's status: the steps a cancel
   * stopped are written after the cancel, and they are rows the person reads.
   * The end event's stop reason is the record's `stoppedReason`.
   */
  addEvent(e: TimelineEvent): void { this.timeline.push(e.kind === 'note' ? { ...e, text: this.ref(e.text) } : { ...e }); }

  /** The round's results as the model received them; recorded where they differ from the result. */
  setSentToModel(entries: Array<{ tool_use_id: string; content: string }>): void {
    for (const e of entries) {
      const i = this.stepByToolUseId.get(e.tool_use_id);
      if (i === undefined) continue;
      const step = this.steps[i];
      if (step.result && sha256Hex(e.content) === step.result.sha256) continue;
      step.sentToModel = this.ref(e.content);
    }
  }

  /** Undefined or null means the controls could not be read: recorded as unknown, with a warning. */
  setControls(controls: unknown[] | null | undefined): void {
    if (Array.isArray(controls)) {
      this.controls = controls;
      return;
    }
    this.controls = null;
    this.warn('The controls taken during this turn (pause, steer, stop) could not be read for the record.');
  }

  setReasoning(text: string | null | undefined): void {
    this.reasoning = text ? this.ref(text) : null;
  }

  /**
   * The answer as it streams. Kept as it arrives so a turn that fails half way
   * is recorded with the part the person actually saw; setAnswer replaces it
   * with the exact final text when the turn completes.
   */
  appendStreamed(chunk: string): void {
    this.streamedSoFar += chunk;
  }

  /** The text streamed so far — what a failed turn is recorded with. */
  get streamedText(): string {
    return this.streamedSoFar;
  }

  setAnswer(a: { streamed?: string | null; stored?: string | null }): void {
    if (a.streamed !== undefined) this.answer.streamed = a.streamed ? this.ref(a.streamed) : null;
    if (a.stored !== undefined) this.answer.stored = a.stored ? this.ref(a.stored) : null;
  }

  setOutputs(o: {
    drafts?: Array<{
      title: string;
      content: string;
      documentType?: string;
      authoringDocId?: string;
      programId?: string;
    }>;
    executedActions?: unknown[];
    executedCommands?: unknown[];
  }): void {
    this.outputs = {
      drafts: (o.drafts ?? []).map((d) => ({
        title: d.title,
        documentType: d.documentType ?? null,
        authoringDocId: d.authoringDocId ?? null,
        programId: d.programId ?? null,
        content: this.ref(d.content ?? ''),
      })),
      executedActions: o.executedActions ?? [],
      executedCommands: o.executedCommands ?? [],
    };
  }

  /** What was checked about the stored answer, as the person was shown it. */
  setVerification(v: TurnVerification | null): void {
    this.verification = v;
  }

  warn(text: string): void {
    this.warnings.push(text);
  }

  /** The record as it stands, closed with its outcome. */
  seal(outcome: TurnOutcome, endedAt = new Date().toISOString()): SealedTurnRecord {
    if (typeof this.turn.organizationId !== 'number') {
      throw new Error('TurnRecorder.seal: organizationId is required');
    }
    if (!this.request) throw new Error('TurnRecorder.seal: the request was never recorded');
    const body: TurnRecordBody = {
      schema: TURN_RECORD_SCHEMA,
      turn: {
        organizationId: this.turn.organizationId,
        threadId: this.turn.threadId ?? null,
        runId: this.turn.runId ?? null,
        actorUserId: this.turn.actorUserId ?? null,
        projectId: this.turn.projectId ?? null,
        surface: this.turn.surface ?? null,
        userMessageId: this.turn.userMessageId ?? null,
        assistantMessageId: this.turn.assistantMessageId ?? null,
        startedAt: this.startedAt,
        endedAt,
        outcome,
      },
      request: this.request,
      modelInput: this.modelInput,
      roundInputs: this.roundInputs,
      context: this.context,
      model: this.model,
      plan: this.plan,
      steps: this.steps,
      controls: this.controls,
      reasoning: this.reasoning,
      answer: this.answer,
      outputs: this.outputs,
      verification: this.verification,
      routing: this.routing,
      warnings: this.warnings,
      timeline: this.timeline, stoppedReason: endReasonOf(this.timeline),
    };
    const text = canonicalJson(body);
    return { body, text, sha256: sha256Hex(text), blobs: new Map(this.blobs) };
  }
}

export interface SealedTurnRecord {
  body: TurnRecordBody;
  /** The canonical JSON text — exactly what is stored and hashed. */
  text: string;
  sha256: string;
  /** Every referenced text, by its SHA-256. */
  blobs: Map<string, string>;
}

export interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}
interface ConnectablePool {
  connect: () => Promise<Queryable & { release: (err?: Error) => void }>;
}

/**
 * Write a sealed record: its texts, the record, and the chained audit row, in
 * ONE transaction. Either all of it commits or none of it does — a record the
 * chain does not carry, or a chain entry for a record that is not there, would
 * each be a claim nothing supports. Throws on failure; the caller reports the
 * turn as not recorded.
 */
export async function writeTurnRecord(
  pool: ConnectablePool,
  sealed: SealedTurnRecord,
  audit: { ipAddress?: string; userAgent?: string } = {},
): Promise<{ id: string; sha256: string }> {
  const { body } = sealed;
  const orgId = body.turn.organizationId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [sha256, text] of sealed.blobs) {
      await client.query(
        `INSERT INTO ana_record_blobs (organization_id, sha256, text, chars)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, sha256) DO NOTHING`,
        [orgId, sha256, text, text.length],
      );
    }
    const inserted = await client.query(
      `INSERT INTO ana_turn_records
         (organization_id, thread_id, run_id, user_message_id, assistant_message_id,
          actor_user_id, outcome, started_at, ended_at, schema_version,
          record_text, record_sha256)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        orgId,
        body.turn.threadId,
        body.turn.runId,
        body.turn.userMessageId,
        body.turn.assistantMessageId,
        body.turn.actorUserId,
        body.turn.outcome,
        body.turn.startedAt,
        body.turn.endedAt,
        body.schema,
        sealed.text,
        sealed.sha256,
      ],
    );
    const id = String(inserted.rows[0].id);
    await writeChainedAuditRow(client, {
      tenantId: orgId,
      userId: body.turn.actorUserId ?? undefined,
      action: TURN_RECORD_AUDIT_ACTION,
      resourceType: TURN_RECORD_RESOURCE,
      resourceId: id,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      details: {
        recordSha256: sealed.sha256,
        schema: body.schema,
        outcome: body.turn.outcome,
        threadId: body.turn.threadId,
        runId: body.turn.runId,
        model: body.model.model,
        startedAt: body.turn.startedAt,
        endedAt: body.turn.endedAt,
        texts: sealed.blobs.size,
      },
    });
    await client.query('COMMIT');
    return { id, sha256: sealed.sha256 };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * What the client is told about a turn's record: recorded, with its hash, or
 * not, and why. A filed record also names every model that wrote the turn,
 * with RULE 2's verdict, so the client can apply the governed-write rule to
 * inserting the answer into a document (round 11).
 */
export type TurnRecordStatus =
  | { status: 'recorded'; id: string; sha256: string; servedBy?: QualifiedServedModel[] }
  | { status: 'not_recorded'; reason: string };

/**
 * Open a recorder for a turn, or null when the turn has no tenant — a record
 * belongs to an organization, and a turn without one cannot be filed.
 */
export function openTurnRecorder(t: {
  orgId: unknown;
  userId: unknown;
  runId?: string | null;
  typed: string;
  projectId?: unknown;
  surface?: unknown;
}): TurnRecorder | null {
  const organizationId = Number(t.orgId);
  if (t.orgId == null || !Number.isInteger(organizationId) || organizationId <= 0) return null;
  const actor = Number(t.userId);
  const recorder = new TurnRecorder();
  recorder.setTurn({
    organizationId,
    runId: t.runId || null,
    actorUserId: Number.isInteger(actor) && actor > 0 ? actor : null,
    projectId: t.projectId != null && String(t.projectId) ? String(t.projectId) : null,
    surface: typeof t.surface === 'string' && t.surface ? t.surface : null,
  });
  recorder.setRequest(t.typed);
  return recorder;
}

/**
 * Seal and write, never throwing into the stream: a failure to record is
 * returned as `not_recorded` with its reason, for the caller to say so. The
 * turn has already happened; what must not happen is a turn that looks
 * recorded and is not.
 */
export async function writeTurnRecordSafely(
  pool: ConnectablePool,
  recorder: TurnRecorder | null,
  outcome: TurnOutcome,
  audit: { ipAddress?: string; userAgent?: string } = {},
): Promise<TurnRecordStatus> {
  if (!recorder) return { status: 'not_recorded', reason: 'This turn had no organization to file it under.' };
  try {
    const sealed = recorder.seal(outcome);
    const { id, sha256 } = await writeTurnRecord(pool, sealed, audit);
    return { status: 'recorded', id, sha256, servedBy: qualifyServedModels(servedModelsOf(sealed.body.model)) };
  } catch (err) {
    console.error('[turn-record] could not write the turn record:', err instanceof Error ? err.message : err);
    return { status: 'not_recorded', reason: 'The record of this turn could not be written.' };
  }
}
