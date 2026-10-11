/**
 * The shape of an AnA chat turn.
 *
 * Split out of `useAnaChat.ts`, which had reached 1,498 of the 1,500-line
 * budget the repo-health ratchet enforces and had twice been kept under it by
 * shortening comments — a sign the file needed a seam, not smaller prose.
 *
 * TYPES ONLY, deliberately. Type declarations are erased at compile time, so
 * moving them cannot change a single byte of behaviour: the typechecker either
 * accepts the move or names exactly what broke. The runtime half — the hook,
 * its mappers, the tool-label table — stays where it is, because moving code
 * that executes is a different change with a different risk and deserves its
 * own.
 *
 * Nothing needs to import from here. `useAnaChat.ts` re-exports every name
 * below, so all sixteen existing importers keep the paths they already use;
 * this file is where the declarations LIVE, not a new address for them.
 */

import type { PendingSignoff } from './useGovernedAction';
import type { AnaGroundingEvidence } from './anaAnswerCheck';
import type { BriefingBookPremortemResult } from './BriefingBookPanel';
import type { AuthoringContextPack } from '../../../../../shared/types/authoring-context';
import type { DetectedDocumentTemplatePayload } from '../../../../../shared/types/ana-document-detection';
import type { AnaRunPolicy } from '@shared/ana/run-control-limits';
import type { StepFact, StepSource } from '@shared/ana/step-verbs';
import type { PlanChange, PlanStep } from '@shared/ana/plan-diff';
import type { TimelineEvent } from '@shared/ana/turn-timeline';

/** Shape of an action chip produced by the server's guidance/command executors. */
export interface AnaChatAction {
  label: string;
  actionType?: string;
  artifactId?: string;
  sectionCode?: string;
  executed?: boolean;
  error?: string;
  /**
   * Present only when `actionType === 'navigate'`: the registry id of the
   * screen AnA resolved, produced server-side by `navigate_to` against the
   * governed navigation contract. The rail renders these as a button the
   * person activates — AnA offers a destination, it does not take you there.
   */
  targetId?: string;
  /** The directive's path, for any consumer routing by path instead of id. */
  path?: string;
  /** Params the target requires (e.g. an intelligence sub-tab). */
  params?: Record<string, string>;
  /**
   * The program a project-scoped navigation opens first — resolved server-side
   * from the tenant's own programs, so the chip lands on that program's
   * screen instead of an empty "open a program" state.
   */
  program?: { id: string; name?: string; code?: string };
  /**
   * Present only when `actionType === 'surface_action'`: the surface-action
   * registry id (e.g. "vault.search") produced server-side by `act_on_screen`
   * against the governed surface-action contract, plus the screen it operates.
   * The rail renders these as a button too — performed client-side through
   * the ONE surface-action bus when the person activates it.
   */
  actionId?: string;
  surfaceId?: string;
  /**
   * Present only when `actionType === 'start_demo'`: the demonstration script
   * id (shared/navigation/demo-scripts) that `start_product_demo` fetched on a
   * turn WITHOUT Live Drive. The rail renders it as a "Start demonstration"
   * chip that calls the same `startDemo` the Control menu calls — one
   * mechanism, one consent (the toggle turns on visibly), one take-over.
   */
  demoId?: string;
  /** The script's title, for the demo ask the shell composes. */
  demoTitle?: string;
}
/** A tool invocation surfaced for transparency/auditability during a turn. */
export interface AnaToolCall {
  name: string;
  label: string;
  /** Unconfirmed means the turn closed without a result for this call, not a failure verdict. */
  status: 'running' | 'success' | 'error' | 'unconfirmed';
  /**
   * The server's id for this call (the model's tool_use id). A step runs its
   * calls concurrently, and several can be the SAME tool, so the name alone
   * cannot say which call a result belongs to. Absent only from an older server
   * or a persisted record written before the field existed.
   */
  toolUseId?: string;
  /**
   * Agentic-loop round this call ran in (1-based). Lets the transcript group
   * tool steps by investigation round instead of one flat list, so a deep
   * multi-round investigation reads as the progression it actually was.
   */
  round?: number;
  /**
   * The input args AnA passed to the tool. Kept for the client's own parsers;
   * never rendered (ANA-SUMMARY S3): a step's details are its `facts`.
   */
  input?: unknown;
  /**
   * The tool's returned result, capped client-side. Kept for the client's own
   * parsers (a drafted document's id, a verification); never rendered.
   */
  result?: string;
  /** Where the step worked, from the server's closed source list (shared/ana/step-verbs.ts). */
  source?: StepSource;
  /** One allow-listed input field, as the server cleaned it: "shelf life". */
  preview?: string | null;
  /** What the step's details state, built by the server from allow-listed fields only. */
  facts?: StepFact[];
  /**
   * The step's generation capture saw a model generation (true), saw none
   * (false), or could not see (null). The engine glyph needs false.
   */
  usedModel?: boolean | null;
  /**
   * The server's own human-readable note for a step that did not succeed, e.g.
   * "AnA couldn't finish searching the literature and continued without it."
   * Written server-side (step-presentation.ts stepMessage) so the UI never has to
   * render a raw tool payload at a user: `result` is the uncapped truth for the
   * audit disclosure, this is the sentence.
   */
  message?: string;
  /** Client clock (ms) when the `tool_use` event arrived. */
  startedAt?: number;
  /** Client clock (ms) when the `tool_result` event arrived. */
  endedAt?: number;
  /**
   * How long the step took, measured SERVER-side around the handler and
   * carried on `tool_result` — the same number the tool-telemetry row gets.
   * Preferred over the client clocks, which include transport.
   */
  latencyMs?: number;
}
/**
 * One phase a turn passed through, in order. Derived from the events the
 * stream really emitted (see anaProgress.ts) — never a template: a turn that
 * ran no tools has no "running steps" phase, and a phase exists only once its
 * event has arrived. `active` is the one in flight; `stopped` means the turn
 * was cut short in it (stop, cancel, failure, timeout).
 */
export interface AnaProgressPhase {
  /** Server phase id (`orchestrating`, `running_tools`, …) or a client one (`composing`). */
  phase: string;
  /** The sentence shown for it — the server's own message when it sent one. */
  label: string;
  status: 'active' | 'done' | 'stopped';
  startedAt: number;
  endedAt?: number;
}
/**
 * One step of the plan AnA declared for a turn through `update_plan`
 * (server/services/ana/turn-plan.ts). The ONLY source of a "Step 2 of 5"
 * count: a turn that declared no plan has none, and a step is `completed`
 * only because she marked it so — nothing on the client infers it.
 */
export type AnaPlanStep = PlanStep;
/**
 * One change to the declared plan, in the order it arrived. The panel reads
 * the plan itself; the transcript reads these to say "Planned 5 steps" or
 * "Added step …" at the point in the work where it happened. The diff is the
 * server's too (shared/ana/plan-diff.ts): the Summary's task rows come from it.
 */
export type AnaPlanChange = PlanChange;
/**
 * What the turn actually read before answering — the server's
 * `context_used` event (server/services/ana/turn-context-used.ts). Only
 * uploads that resolved are listed, each saying whether its content or only
 * its name reached the model; a memory read that failed is `unavailable`,
 * never an empty list that reads as "nothing matched".
 */
/**
 * A model that wrote the turn, as its record names it, with what RULE 2 says of
 * it (server: approved-models.ts qualifyServedModels). `qualified` decides
 * whether its text may go into a document (anaInsertGate.ts); the other two
 * say why not, which decides the remedy.
 */
export interface AnaServedModel {
  provider: string | null;
  model: string | null;
  qualified: boolean;
  /** Its registry entry's approval for high-risk work; null when the registry has no entry for it. */
  approvedForHighRisk: boolean | null;
  /** Its performance qualification; null when the registry has no entry for it. */
  pq: 'pending' | 'passed' | 'failed' | null;
}

/**
 * Whether the server filed this turn's retained record (21 CFR Part 11): the
 * record's id and SHA-256 when it did, the reason when it did not. Absent when
 * the server said nothing — an older server, or a turn that never closed —
 * which is shown as nothing, never as recorded. A filed record also names the
 * models that wrote the turn (`servedBy`, round 11); absent when the server
 * did not say, which no reader may take as approved.
 */
export type AnaTurnRecordStatus =
  | { status: 'recorded'; id: string; sha256: string; servedBy?: AnaServedModel[] }
  | { status: 'not_recorded'; reason: string }
  /**
   * Client-side only: the turn ended here — timed out, stopped, or the
   * connection closed — before the server said whether it filed the record.
   * The server may well have; this view cannot say so.
   */
  | { status: 'unconfirmed' };

/**
 * Why a turn's work stopped, as the server's `done` frame (and, for a reopened
 * thread, the assistant message's metadata) reports it — the loop's own reason
 * (server/services/ana/run-status.ts `TurnStoppedReason`):
 *
 *   no_more_tools     she said she was done — the ordinary case
 *   max_rounds        the round limit forced the answer
 *   duplicate_thrash  she was repeating the same step, and was stopped
 *   cancelled         the run was stopped between rounds
 *
 * The run policy's (row 74; named in S1, produced since S4):
 *   budget_exhausted  Auto reached its time limit
 *   approval_timeout  nobody answered an approval; that change was not made
 *   hold_expired      Manual waited for the person, who did not come back
 *   hold_unavailable  Manual could not hold this turn, so she stopped
 *
 * And since ANA-SUMMARY S4:
 *   client_disconnected  the page lost its connection (a phone locked, a tab
 *                        closed), so the run was stopped
 *
 * And the run row's own reasons (AnA detach §2.10; the client reads them from
 * DT2, the server writes the first four from DT3), which a follower reads off
 * the run when the turn ended without a record:
 *   unattended_limit  nobody was watching for 15 minutes
 *   session_ended     the session that started the turn ended
 *   server_shutdown   the server restarted for an update
 *   orphaned          the server handling the turn stopped responding
 *   error             the turn ended with an error
 *   admin_cancelled   an administrator stopped it (the admin-cancel variant
 *                     of `cancelled`; see anaWorkModel STOP_LINES)
 *
 * Distinct from `stopped` (the person's Stop, seen by this client) and
 * `interrupted` (the stream failed): a round-limit stop is neither, and must
 * not borrow their flags.
 */
export type AnaStoppedReason =
  | 'no_more_tools'
  | 'max_rounds'
  | 'duplicate_thrash'
  | 'cancelled'
  | 'budget_exhausted'
  | 'approval_timeout'
  | 'hold_expired'
  | 'hold_unavailable'
  /** The answer she was writing was cut off: the model's length limit, or a
   *  stream that stalled mid-answer. */
  | 'answer_cut_off'
  | 'client_disconnected'
  | 'unattended_limit'
  | 'session_ended'
  | 'server_shutdown'
  | 'orphaned'
  | 'error'
  | 'admin_cancelled';

/**
 * A turn this view follows by polling GET /runs/:runId/events instead of by
 * its own stream (AnA detach DT2, docs/design/ANA_DETACH_2026-10-08.md §4):
 * opened on another device, or rejoined after a reload. Every field is the
 * last poll's, and every time is the server's (ms), read against the poll's
 * own `serverNow` through `skewMs`.
 */
export interface AnaFollow {
  runId: string;
  /** 'all' for the person who asked; 'cancel' for an organisation admin (§2.5). */
  scope: 'all' | 'cancel';
  /** The run row's status. */
  status: string;
  /** When the run started (server ms). */
  startedAt: number | null;
  /** The server's clock minus this client's, at the last poll. */
  skewMs: number;
  /** The owner's last heartbeat (server ms). */
  lastBeatAt: number | null;
  /** The highest seq the owner emitted; above the rows read, a gap (§3.6). */
  highWater: number;
  /** The mirror reached its cap (§3.5). */
  truncated?: boolean;
  /** The owner finished trying to record the turn (`released_at`). */
  released?: boolean;
  /** Waiting on an approval this reader cannot give (an admin's view). */
  approvalWaiting?: boolean;
  /** This reader's own network is failing; the last known state stays (§5.1). */
  unreachable?: boolean;
  /** The server refused this reader the live progress (403), in its words. */
  forbidden?: string;
}

export interface AnaContextUsed {
  uploads: Array<{ fileId: string; fileName: string; mimeType: string; read: 'content' | 'name_only' }>;
  unresolvedUploads: number;
  memory: Array<{ layer: string; title: string; documentName?: string }>;
  memoryStatus: 'read' | 'none' | 'unavailable';
}
/**
 * Result of `verify_docx_against_source` — the audited "verify it against your
 * text" step. Surfaced as the Document Studio verification trust-panel: a
 * pass/fail with the exact caption/boilerplate strings that were missing and
 * the line-level divergence vs. the supplied source.
 */
export interface VerificationResult {
  ok: boolean;
  /** Required caption / boilerplate strings absent from the rebuilt document. */
  missingRequiredStrings: string[];
  /** How many required strings were checked in total. */
  requiredStringsChecked?: number;
  /** Line-level divergence vs. the source text, when a source was supplied. */
  divergence?: { additions: number; deletions: number; summary?: unknown };
  /** Factual one-line summary from the tool. */
  message?: string;
}
/**
 * E14 — the board-ready CRL/RTF pre-mortem decision artifact, surfaced from the
 * `assemble_crl_premortem_artifact` tool result so the Document Studio can show
 * the approval-probability estimate, ranked precedent-cited risks, and the
 * prioritized fix-list. Honest by construction: a `not_assessed`/`sample`
 * artifact is non-exportable; the artifact is always unsealed until E1 lands.
 */
export type { CrlPremortemArtifact } from './CrlPremortemPanel';
/** The four verdict tiers `check_dossier_consistency` can return. */
export type ConsistencyVerdict = 'clean' | 'minor_issues' | 'needs_review' | 'blocker';
/** Per-divergence severity from the cross-artifact consistency engine. */
export type ConsistencyDivergenceSeverity = 'critical' | 'high' | 'medium' | 'low';
/**
 * One divergence the dossier-consistency sweep found: a labelled quantity (N,
 * p-value, dose, NOAEL, shelf-life …) or a cross-reference that conflicts with
 * another artifact in the same project. Carries both conflicting values and a
 * pointer back to the source artifact so the bullet can be deep-linked.
 */
export interface ConsistencyDivergence {
  /** Why it diverged: numeric, endpoint/population drift, or a broken reference. */
  kind: string;
  severity: ConsistencyDivergenceSeverity;
  /** Factual one-line statement of the conflict. */
  description: string;
  /** The value stated in the draft being checked. */
  draftValue: string;
  /** The conflicting value found in the existing dossier (absent for orphan refs). */
  existingValue?: string;
  /** Title of the source artifact the conflicting value came from. */
  existingArtifact?: string;
  /** CTD section of the source artifact, when known (e.g. "2.5", "5.3.5.1"). */
  existingCtdSection?: string | null;
}
/**
 * Result of `check_dossier_consistency` — the per-version Dossier Consistency
 * Sweep. A SECOND Document Studio verification surface, parallel to
 * VerificationResult: where verification proves the draft matches *its own*
 * source, this proves the draft does not contradict the *rest of the dossier*.
 * Surfaced as the ConsistencyPanel trust-strip.
 */
export interface ConsistencyResult {
  verdict: ConsistencyVerdict;
  /** How many other artifacts in the project the draft was compared against. */
  artifactsCompared: number;
  /** How many labelled facts were extracted from the draft for comparison. */
  draftFactsExtracted: number;
  /** Total divergences found (may exceed the surfaced `divergences` list). */
  divergenceCount: number;
  /** Per-severity counts, for the verdict sub-line. */
  bySeverity: { critical: number; high: number; medium: number; low: number };
  /** The surfaced divergences (server caps at 20), each deep-linkable. */
  divergences: ConsistencyDivergence[];
  /** Factual reviewer recommendation line from the tool. */
  recommendation?: string;
  /**
   * Honesty guard: true when the checked draft was sample / not-assessed
   * content. A sample-derived verdict is never sealable/exportable, so the
   * panel renders it as advisory-only and suppresses the resolve affordance.
   */
  isSample?: boolean;
}
/** A file attached to a sent message — the minimal shape the thread renders. */
export interface MessageAttachment {
  id: string;
  name: string;
  /** Server file id once uploaded (present for ready attachments). */
  fileId?: string;
  /** How the server read the file (utf8 / pdf-text / pdf-ocr / image-ocr / docx). */
  extractionMethod?: string | null;
  /** Word count extracted into project memory. */
  extractionWords?: number;
}
export interface AnaChatMessage {
  id: string;
  /**
   * The stored message's own id (chat_messages.id), for a message read back
   * from the server: the key its turn's record names it by
   * (`assistant_message_id`). Absent for a turn sent in this view.
   */
  serverId?: number;
  role: 'user' | 'assistant';
  text: string;
  /**
   * The Summary's events for this turn, as the server sent them live
   * (`timeline` frames; shared/ana/turn-timeline.ts). The same events the
   * record seals, so a reload reads them back from the record, not from here.
   */
  timeline?: TimelineEvent[];
  /**
   * True while this view is still asking the server, by run id, whether the
   * turn's record was filed (the confirm waits): the Summary then reads
   * "Recording…", never "Not recorded".
   */
  recordConfirming?: boolean;
  /** Set while this view follows the turn by polling rather than by its own stream (DT2). */
  follow?: AnaFollow;
  /**
   * The person pressed Stop and the server has not confirmed it (§5.2): the
   * cancel failed and is being retried. The turn stays as it is meanwhile;
   * Stopped is shown only once the server says so.
   */
  stopUnconfirmed?: boolean;
  /** Files attached to this (user) turn, shown as chips above the bubble. */
  attachments?: MessageAttachment[];
  /** True while tokens are still arriving for this message. */
  streaming?: boolean;
  /**
   * Progress phase label shown while streaming before the first token arrives
   * (e.g. "Planning response…", "Loading project memory…", "Generating…").
   * Cleared once the first text chunk lands.
   */
  statusPhase?: string;
  /** Action chips produced by the server's guidance / command executors. */
  executedActions?: AnaChatAction[];
  /** Governed actions blocked pending a Part 11 sign-off (reason + e-signature). */
  pendingSignoffs?: PendingSignoff[];
  /** Round-trip latency from the server's `done` event. */
  latencyMs?: number;
  /** True if the response came from a fallback provider (non-Anthropic). */
  fallback?: boolean;
  /** Effort the server actually used this turn (fast / balanced / thorough). */
  effortUsed?: string;
  /** True if the user explicitly stopped the stream. */
  stopped?: boolean;
  /**
   * True when the turn ended before the server finished it — the stream went
   * silent or the connection failed. Distinct from `stopped` (the person's own
   * stop), and recorded even when no phase had arrived yet, so a turn that
   * never got going cannot read as finished.
   */
  interrupted?: boolean;
  /** True only when an interrupted stream delivered response text, before any failure copy. */
  interruptedWithPartialResponse?: boolean;
  /**
   * The code the server refused this turn with, when it sent one (for example
   * `THREAD_PROJECT_MISMATCH`: the conversation belongs to another project).
   * A host reads it to offer the way out the refusal names; the text says why.
   */
  refusalCode?: string;
  /**
   * Intent lens AnA detected for this turn (audit / risk / strategy /
   * improve / compare / auto). Rendered as a small meta chip.
   */
  detectedLens?: string;
  /**
   * Specific regulatory document type detected from the user's message
   * (e.g. "Clinical Overview", "CMC Drug Substance", "510(k) SE Statement").
   * Shown as a "Drafting: X" chip while the response streams.
   */
  detectedDocumentType?: string;
  /**
   * The full detected-document-template payload — display name, authority,
   * submission family, confidence, and the ICH/FDA section structure. This is
   * the data source for the document-context banner and the section-outline
   * surface (WO-2 / WO-3). `detectedDocumentType` above remains the chip label.
   */
  detectedDocumentTemplate?: DetectedDocumentTemplatePayload;
  /**
   * Document-action suggestions from the orchestrator. Tapping one sends
   * a follow-up message that triggers the action's generator.
   */
  suggestedActions?: string[];
  /**
   * Extended-thinking tokens streamed separately from the answer. Shown
   * in a collapsible "Reasoning" section for high-risk turns.
   */
  thinking?: string;
  /**
   * Steering interjections the human accepted mid-run for this turn (from
   * `interjected` events). CAPTURED, NOT RENDERED — no surface reads it. (This
   * claimed "Shown as small 'you steered AnA' notes"; see ledger L88.)
   */
  interjections?: string[];
  /**
   * What was checked about the answer: the engine's check of its specific
   * claims against this turn's sources, and AnA's own evidence labels
   * (anaAnswerCheck.ts). Rendered under the reply by AnaGrounding.
   */
  evidence?: AnaGroundingEvidence;
  /**
   * Context layers ANA drew on this turn (from the server's enrichment step,
   * e.g. 'governance', 'precedent', 'safety'). Surfaced in the evidence panel
   * so the user can see what grounded the answer. These are context sources,
   * not document citations.
   */
  groundingSources?: string[];
  /** Degraded-mode signals from server `warning` events (thread persistence etc.). */
  warnings?: string[];
  /** Timestamp (ms) when this turn was kicked off. Used for relative time chips. */
  sentAt?: number;
  /**
   * Client clock (ms) when the turn finished — the answer AND the server's
   * background finishing work (`post_done`), or the moment it was stopped or
   * failed. Absent while the turn is in flight. `latencyMs` above is the
   * server's own answer-time; this is the wall-clock end for the elapsed line.
   */
  completedAt?: number;
  /**
   * The ordered phases this turn passed through — the numbered progress list
   * in the work panel. See {@link AnaProgressPhase} for the honesty contract.
   */
  progress?: AnaProgressPhase[];
  /** The plan AnA declared this turn, as last updated. Absent when she declared none. */
  plan?: AnaPlanStep[];
  /** Every change to `plan`, in arrival order. */
  planChanges?: AnaPlanChange[];
  /** What the turn read before answering (uploads, memory). Absent until the event arrives. */
  contextUsed?: AnaContextUsed;
  /** Whether this turn's retained record was filed. See {@link AnaTurnRecordStatus}. */
  turnRecord?: AnaTurnRecordStatus;
  /**
   * Why the turn's work stopped, when the server said. A turn the round limit
   * or the repeat guard cut short must never read as finished; see
   * {@link AnaStoppedReason}.
   */
  stoppedReason?: AnaStoppedReason;
  /** Tool rounds the turn ran, as the server counted them. */
  rounds?: number;
  /** The run policy the turn ran under (row 74). Absent for a turn that sent none. */
  runPolicy?: AnaRunPolicy;
  /** The steps she had chosen that a Manual stop left unrun, by label. */
  pendingSteps?: string[];
  /**
   * The steps a steer REPLACED during a Manual hold ("Do this instead"): they
   * never ran. From `interjected.replaced`; captured with the steer.
   */
  replacedSteps?: string[];
  /**
   * Draft produced by a document-generating tool this turn. The rail reads
   * `title` only; nothing routes `content` anywhere, so this is NOT
   * editor-openable despite what it used to claim. See ledger L88.
   */
  generatedDraft?: {
    title: string;
    content: string;
    documentType?: string;
    /**
     * Set once the server persists this draft to the governed artifact version
     * history (server emits `artifact_version_saved`). Their presence lets the
     * UI fetch the durable cross-session version lineage instead of relying on
     * the per-session in-memory grouping.
     */
    artifactId?: string;
    version?: number;
    /**
     * Set when the draft was persisted as an AUTHORING DOCUMENT (the
     * `draft_authoring_document` tool; docs/design/ANA_DOCUMENT_CANVAS.md).
     * The thread then renders the document canvas for it — `DocumentCanvas`
     * over `authoring_documents` — instead of a side-panel artifact card, and
     * "Open full editor" expands into the one editor on that id. `programId`
     * is the regulatory_programs UUID the tool filed it under.
     */
    authoringDocId?: string;
    programId?: string;
  };
  /**
   * Tools AnA invoked this turn, shown as calm status rows for transparency
   * and audit (e.g. "Computed the sample size", with the engine glyph when the
   * step's capture saw no model). Lets the user see that a deterministic engine
   * ran rather than a free-text guess.
   */
  toolCalls?: AnaToolCall[];
  /**
   * Result of the `verify_docx_against_source` step this turn, if it ran.
   * Powers the Document Studio "verified against your source" trust-panel.
   */
  verification?: VerificationResult;
  /**
   * E14 — board-ready CRL/RTF pre-mortem decision artifact produced by
   * `assemble_crl_premortem_artifact` this turn, if it ran. Powers the Document
   * Studio pre-mortem panel (approval-probability estimate + cited risks + fix-
   * list). Always unsealed until E1's Sign-and-seal lands.
   */
  crlPremortem?: import('./CrlPremortemPanel').CrlPremortemArtifact;
  /**
   * Result of the `check_dossier_consistency` sweep this turn, if it ran.
   * Powers the Document Studio "consistent with your dossier" trust-panel —
   * the SECOND verification surface, rendered alongside `verification`.
   */
  consistency?: ConsistencyResult;
  /**
   * Result of the `assemble_briefing_book` step this turn, if it ran (E8).
   * Powers the Document Studio "anticipated FDA pushback" pre-mortem panel.
   */
  briefingPremortem?: BriefingBookPremortemResult;
  /**
   * Intelligence questioning flow — structured question from the engine.
   * Rendered as an interactive form widget in the message row.
   */
  intelligenceQuestion?: import('../../../../../shared/types/intelligence-questions.js').IntelligenceQuestionEvent;
  /** Flow state to send back with the next answer. */
  intelligenceFlowState?: import('../../../../../shared/types/intelligence-questions.js').FlowState;
  /** The durable interview session (cmc_interview_sessions) behind the question, when one was persisted. Sent back as session_id with each answer. */
  intelligenceSessionId?: string | null;
  /** Intelligence flow completion — summary + suggested actions. */
  intelligenceFlowComplete?: import('../../../../../shared/types/intelligence-questions.js').IntelligenceFlowCompleteEvent;
  /**
   * War Game report — FDA auditor simulation results. Rendered as a rich
   * advisory report component inline in the message thread.
   */
  warGameReport?: {
    id: string;
    category: string;
    sourceFlowId: string;
    timestamp: string;
    overallScore: number;
    overallAssessment: 'audit_ready' | 'needs_work' | 'significant_gaps' | 'not_ready';
    findings: Array<{
      id: string;
      dimension: string;
      severity: 'info' | 'warning' | 'critical';
      title: string;
      question: string;
      observation: string;
      requirement: string;
      reference: string;
      recommendation: string;
      relatedFields: string[];
    }>;
    dimensionScores: Record<string, { score: number; findingCount: number }>;
    executiveSummary: string;
    topPriorities: string[];
    regulatoryRiskLevel: 'low' | 'moderate' | 'high' | 'critical';
  };
  /**
   * Reporting Canvas — a governed report render or a best-practices suggestion
   * set produced by the reporting tools (generate_report / suggest_reports).
   * Rendered inline as the AnA Reporting Canvas. Every value is governed; AnA
   * narrates it.
   */
  reportCanvas?:
    | { kind: 'report'; report: unknown; source?: string }
    | {
        kind: 'suggestions';
        segments: string[];
        tier: string;
        suggestions: Array<{
          typeId: string;
          label: string;
          family: string;
          entitled: boolean;
          requiredTier: string;
          alreadyUsed: boolean;
          reasons: string[];
        }>;
        preset: { title: string; scopeType: string; panels: Array<{ reportTypeId: string; scopeType: string; label?: string | null }> } | null;
        source?: string;
      };
}
export interface UseAnaChatOptions {
  /** Project id for server-side context assembly (intelligence prefix etc.). */
  projectId?: string | number | null;
  /** Screen name passed into the route-context block. */
  screenName?: string | null;
  /** Project name (for context.project). */
  projectName?: string | null;
  /** User role (for role inference / context). */
  userRole?: string | null;
  /** Submission type (IND, NDA, 510K...). */
  submissionType?: string | null;
  /** Optional thread id to resume. */
  initialThreadId?: string | null;
  /**
   * Authoring context pack — section/artifact/dossier identity. When present,
   * the hook unpacks this into `project_context`, `document_context`, and
   * `authoring_context` on the request body so the server-side orchestrator
   * grounds AnA on the right project, document, and section instead of
   * guessing from the message text. Mirrors the AnaPersistentPanel contract.
   */
  authoringContext?: AuthoringContextPack | null;
  /**
   * Extra per-surface context object forwarded under `module_context` for
   * surface-specific server-side handling (e.g. eCTD coauthor pane state).
   */
  moduleContext?: Record<string, unknown> | null;
  /**
   * Tool names the user has pinned for the turn. Sent as `selected_tools`; the
   * server treats them as additive focus (pinned on top of the context set),
   * so a narrow pin can't break ANA. Empty/undefined = auto (server chooses).
   */
  selectedTools?: string[];
  /**
   * Data Room sources the user has pinned as context for the turn, as
   * `cre_evidence_sources` ids. Sent as `source_ids`; the server resolves each
   * back to the upload its bytes live in and grounds the turn through the same
   * tenant-scoped path an attachment uses.
   *
   * This is the explicit half of context selection: an attachment is a file the
   * user just added, a pinned source is one they deliberately chose from the
   * project's data room.
   */
  selectedSourceIds?: Array<number | string> | null;
  /**
   * Response effort the user picked in the Composer (Fast/Balanced/Thorough).
   * Sent as `effort_level` when set; the server maps it to a routing strategy
   * (governance-pinned policy still wins). Omitted → server default 'balanced'.
   */
  effortLevel?: 'fast' | 'balanced' | 'thorough' | null;
  /**
   * Explicit model override (gateway registry id) the user pinned in the
   * advanced picker. Sent as `model_override` when set; the server pins it only
   * when it is enabled for the tenant, is its approved-models entry and, on
   * high-risk work, is approved for high risk. Otherwise it answers with the
   * default model and says so in a `warning` frame (code MODEL_OVERRIDE_REFUSED).
   */
  modelOverride?: string | null;
  /**
   * AnA Live Drive: while true, every turn is sent with `live_drive: true`, so
   * validated navigate_to / act_on_screen directives stream back as
   * `drive_navigation` / `drive_action` events for immediate application
   * instead of waiting as chips. The server gates this per turn on the
   * `ana_live_drive` entitlement and answers honestly with a `drive_state`
   * event either way.
   */
  liveDrive?: boolean;
  /**
   * What AnA does between steps (row 74): 'manual' — she takes one step, then
   * waits for the person before each further one; 'auto' — she keeps going
   * within Auto's ceilings. Sent as `run_policy`; omitted when unset, so a
   * host that passes nothing keeps today's effort-bounded turn.
   */
  runPolicy?: AnaRunPolicy | null;
  /**
   * Drive mode for opted-in turns: 'demo' marks an explicitly started
   * demonstration (larger applied budgets + the demo prompt block server-side,
   * same entitlement). Omitted/anything else → the server's default 'assist'.
   */
  driveMode?: 'assist' | 'demo';
  /**
   * Receives Live Drive events (`drive_state` / `drive_navigation`) as they
   * stream. The hook stays dumb here on purpose — validation against the
   * shared navigation registry and the apply/take-over state machine live in
   * v2/liveDrive.ts, next to the shell that owns navigation.
   */
  onDriveEvent?: (event: DriveSseEvent, controls?: DriveTurnControls) => void;
  /**
   * Fired when the server persists a draft this turn produced
   * (`artifact_version_saved`, with the governed artifact's external id).
   * The shell's follow-the-work behavior hangs off this so a driven turn's
   * document appears in front of the subscriber — from ANY chat instance
   * (rail or an owned surface's dock), not just the shell's own.
   */
  onArtifactSaved?: (artifactId: string) => void;
}
/**
 * Live Drive SSE events, forwarded verbatim to `onDriveEvent` as they stream.
 * `drive_state` arrives once per opted-in turn (an honest enable — carrying
 * the turn's mode — or an honest lock carrying the real required tier);
 * `drive_navigation` / `drive_action` arrive per directive the server emitted
 * for immediate application. Each `directive` is typed unknown on purpose:
 * the shell re-validates navigations against the shared navigation registry
 * (v2/liveDrive.ts) and actions against the shared surface-action registry
 * (v2/surfaceActions.ts) before anything moves or is performed.
 */
export type DriveSseEvent =
  | {
      type: 'drive_state';
      enabled: boolean;
      mode?: 'assist' | 'demo';
      reason?: string;
      requiredTier?: string | null;
      /**
       * Set when the server switched an already-driving turn into a
       * demonstration mid-turn (start_product_demo). It is a MODE change for
       * the drive that is already running, never a fresh enable: it must not
       * re-arm a drive the person took over or switched off.
       */
      promoted?: boolean;
    }
  /* `moveId` names the move when it is reported back (DriveTurnControls
     moveLanded / reportScreen); the server waits on it before her next round. */
  | { type: 'drive_navigation'; round?: number; directive: unknown; moveId?: string }
  | { type: 'drive_action'; round?: number; directive: unknown; moveId?: string }
  /**
   * Client-side, never on the wire: the chat instance whose turn received an
   * enabled `drive_state` reports that the turn has ended (answered, failed or
   * stopped). The shell released the drive only when ITS OWN chat stopped
   * streaming, so a drive started from any other chat left "AnA is driving"
   * on screen, with dead controls, for good.
   */
  | { type: 'drive_turn_end' }
  /**
   * Client-side, never on the wire: the person ended a driving turn early —
   * its chat's Stop, or a new or other conversation replacing it — so the
   * screen must stop moving NOW. Sent before the server's cancel is awaited,
   * while the stream is still delivering moves the server had already written;
   * `drive_turn_end` still follows once the stream closes. Only the drive
   * strip's Stop used to halt the drive: every other Stop reaches only its own
   * chat, which the shell cannot see, so the stopped turn's moves went on
   * playing.
   */
  | { type: 'drive_stopped' };

/**
 * The run that is driving, handed to the shell with every drive event so the
 * overlay's Stop and steer reach the chat that is actually driving — which is
 * not always the shell's own — and so an on-screen outcome AnA needs to know
 * about (an action that could not be performed) can be told to her mid-turn.
 */
export interface DriveTurnControls {
  stop: () => void;
  /** A steer the PERSON typed. Recorded as a human control event. */
  interject: (message: string) => Promise<boolean>;
  /**
   * What the app observed on screen (a move that could not be made), told to
   * AnA mid-turn. Not a human control: it is queued as an app observation, not
   * shown as "You steered AnA", and not written as a human control event.
   * Bound to the run of the turn that emitted the drive event — a report about
   * an earlier turn's move is dropped (resolves false), never delivered to a
   * newer run. `moveId`, when given, is the move it is about: it settles that
   * move for the server, which holds her next round until each move is settled.
   */
  reportScreen: (message: string, moveId?: string) => Promise<boolean>;
  /**
   * The move the server sent as `moveId` landed on the screen. Settles it
   * without a word for the model. Same run binding as reportScreen.
   */
  moveLanded: (moveId: string) => Promise<boolean>;
}

/**
 * Per-call overrides for `send`. Each one wins over the hook's options for
 * THIS turn only, so a caller that changes a setting and sends in the same
 * tick is never sent with the previous render's value.
 */
export interface AnaSendOptions {
  toolsOverride?: string[];
  liveDrive?: boolean;
  driveMode?: 'assist' | 'demo';
  runPolicy?: AnaRunPolicy | null;
  /**
   * The document the person has open, for THIS turn only. For a host whose
   * chat was created without one: the conversation thread runs on the shell's
   * chat, and the document open beside it is known only to the thread
   * (2026-10-01). Wins over `UseAnaChatOptions.authoringContext`; a turn
   * without it sends the host's, never an earlier turn's.
   */
  authoringContext?: AuthoringContextPack | null;
  /**
   * The screen a question was asked from, for THIS turn only: its published
   * surface context and its id (docs/design/ONE_ANA_ONE_CANVAS.md, slice 8).
   * Every ask now lands in the one conversation, whose own screen context is
   * the conversation's, so the origin screen's travels with the turn it asked.
   * Each wins over the hook's `moduleContext` / `screenName`.
   */
  moduleContext?: Record<string, unknown> | null;
  screenName?: string | null;
}

/** Control status of an in-flight AnA run (null when no run is active). */
export type RunControlStatus = 'running' | 'paused' | 'cancelled' | null;

/**
 * Why the in-flight run is held, and what it is waiting to do (row 74).
 *   manual   AnA stopped herself before `next` (Manual): Run this step,
 *            Do this instead, or Stop
 *   person   the person paused it
 *   expired  a Manual hold nobody answered ended the turn; `next` did not run
 */
export interface AnaRunHold {
  reason: 'manual' | 'person' | 'expired';
  next: string[];
}
export interface UseAnaChatReturn {
  messages: AnaChatMessage[];
  isStreaming: boolean;
  /**
   * Send a user message (with optional attachments) and stream the reply.
   * `sendOpts.toolsOverride` pins tools for THIS turn — callers that update
   * the pinned-tools state and send in the same tick would otherwise send
   * with the pre-update tool set (the state update only lands next render).
   */
  send: (
    text: string,
    attachments?: MessageAttachment[],
    sendOpts?: AnaSendOptions,
  ) => Promise<void>;
  /**
   * Stop the run in flight. `'stop'` (the default) is the person's Stop: it
   * cancels the run on the server and, for a run that has a durable id, shows
   * Stopped only once the server confirms it — a failed cancel is retried and
   * the turn goes on meanwhile (§5.2). `'leave'` is this view going away: it
   * never cancels and never shows Stopped.
   */
  stop: (abortIntent?: 'stop' | 'leave') => void | Promise<void>;
  /**
   * Who this view is to the turn it follows: 'all' when it is the person who
   * asked (every control, and the composer steers), 'cancel' when it is an
   * organisation admin watching (no steer; Stop only once DT3 accepts an
   * admin's cancel). Null while no turn is followed.
   */
  followScope?: 'all' | 'cancel' | null;
  /** Control status of the in-flight run (drives the pause/resume UI). */
  runStatus: RunControlStatus;
  /**
   * Why the run is held, when it is (the strip's Manual copy reads it). The
   * hook always sets it; optional so a host's stand-in chat (a test double,
   * an embed) that predates it still types — absent reads as not held.
   */
  runHold?: AnaRunHold | null;
  /**
   * The run policy the turn in flight was sent with (null when none, or when
   * nothing is in flight) — not the preference now, which applies to the next
   * message. Optional for the same stand-ins as `runHold`.
   */
  turnRunPolicy?: AnaRunPolicy | null;
  /** Pause AnA at the next agentic-round boundary. */
  pause: () => Promise<boolean>;
  /** Resume a paused run. */
  resume: () => Promise<boolean>;
  /** Interject a steering message into the running investigation. */
  interject: (message: string) => Promise<boolean>;
  /**
   * Steers the server has ACCEPTED (2xx on the control endpoint) but not yet
   * spliced into a round — it consumes them only at the next round boundary
   * and confirms each with an `interjected` event, which removes it here. What
   * is waiting in the queue, so the person can see a steer is pending rather
   * than wonder whether it was taken. Cleared when the run ends.
   */
  pendingSteers: string[];
  /** Reset the conversation (new thread). */
  reset: () => void;
  /** Hydrate the panel with an existing thread's messages. */
  loadThread: (threadId: string) => Promise<void>;
  /** Current thread id (from server once the first message is persisted). */
  threadId: string | null;
  /** True while loadThread is fetching messages. */
  isLoadingThread: boolean;
  /** A failed history load blocks sending until retry or reset. */
  threadLoadError?: { threadId: string; message: string } | null;
}
