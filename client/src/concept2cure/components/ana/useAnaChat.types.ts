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
import type { BriefingBookPremortemResult } from './BriefingBookPanel';
import type { AuthoringContextPack } from '../../../../../shared/types/authoring-context';
import type { DetectedDocumentTemplatePayload } from '../../../../../shared/types/ana-document-detection';

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
   * Present only when `actionType === 'surface_action'`: the surface-action
   * registry id (e.g. "vault.search") produced server-side by `act_on_screen`
   * against the governed surface-action contract, plus the screen it operates.
   * The rail renders these as a button too — performed client-side through
   * the ONE surface-action bus when the person activates it.
   */
  actionId?: string;
  surfaceId?: string;
}
/** A tool invocation surfaced for transparency/auditability during a turn. */
export interface AnaToolCall {
  name: string;
  label: string;
  status: 'running' | 'success' | 'error';
  /**
   * Agentic-loop round this call ran in (1-based). Lets the transcript group
   * tool steps by investigation round instead of one flat list, so a deep
   * multi-round investigation reads as the progression it actually was.
   */
  round?: number;
  /** The input args AnA passed to the tool — for the audit/inspect disclosure. */
  input?: unknown;
  /** The tool's returned result, capped client-side — for the audit disclosure. */
  result?: string;
  /**
   * The server's own human-readable note for a step that did not succeed, e.g.
   * "AnA couldn't finish searching the literature. She'll continue with what
   * she has." Written server-side (stream.ts) precisely so the UI never has to
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
  role: 'user' | 'assistant';
  text: string;
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
   * Evidence grounding summary from the server's validateEvidence pipeline.
   * Surfaced as a small chip on the reply: a shield-check icon + "N sources"
   * when grounded, or an alert icon + "N weak" when claims are unsupported.
   */
  evidence?: {
    validated: boolean;
    sourceCount: number;
    groundedClaims: number;
    weakClaims: number;
    missingSupport: number;
    /** One-line reviewer risk summary from the server verdict. */
    riskSummary?: string;
    /** The specific claims the verdict flagged, so the chip can drill down. */
    flaggedClaims?: { kind: 'ungrounded' | 'overclaim' | 'contradiction'; text: string }[];
  };
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
  };
  /**
   * Tools AnA invoked this turn, shown as calm status rows for transparency
   * and audit (e.g. "Computing sample size — biostatistics engine"). Lets the
   * user see that a deterministic engine ran rather than a free-text guess.
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
   * advanced picker. Sent as `model_override` when set; the server validates it
   * against the tenant's enabled models and drops it silently when invalid.
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
  onDriveEvent?: (event: DriveSseEvent) => void;
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
    }
  | { type: 'drive_navigation'; round?: number; directive: unknown }
  | { type: 'drive_action'; round?: number; directive: unknown };

/** Control status of an in-flight AnA run (null when no run is active). */
export type RunControlStatus = 'running' | 'paused' | 'cancelled' | null;
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
    sendOpts?: { toolsOverride?: string[] },
  ) => Promise<void>;
  /** Abort the current stream (and cancel the run server-side). */
  stop: () => void;
  /** Control status of the in-flight run (drives the pause/resume UI). */
  runStatus: RunControlStatus;
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
}
