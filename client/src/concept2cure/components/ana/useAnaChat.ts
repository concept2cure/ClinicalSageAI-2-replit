/**
 * useAnaChat — streaming-chat controller for the Claude Design AnA RI shell.
 *
 * Wires the composer + chat view to POST /api/ana-ri/stream with the SSE
 * contract defined in server/routes/ana-ri/stream.ts.
 *
 * Events handled:
 *   status       — progress phases during orchestration / context assembly
 *   thread_id    — captured for continuity across turns
 *   orchestration — metadata (noop at this layer)
 *   text         — token chunk appended to the streaming message
 *   done         — captures latencyMs + provider (fallback detection)
 *   post_done    — cleaned response + executedActions chips
 *   warning      — degraded-mode signal appended to the message's warnings
 *   grounding_strip — evidence verdict stored for the grounding chip on the reply
 *   tool_use / tool_result — tool-call transparency rows
 *   artifact_draft — an editor-openable draft produced by a generating tool
 *   error        — surface via console + last-message flag
 *
 * @module client/src/concept2cure/components/ana/useAnaChat
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { getAuthHeaders } from '../../../utils/authToken';
import { extractPendingSignoffs, type PendingSignoff } from './useGovernedAction';
import type { BriefingBookPremortemResult } from './BriefingBookPanel';
import i18n from '@/i18n';
import type { AuthoringContextPack } from '../../../../../shared/types/authoring-context';
import type { DetectedDocumentTemplatePayload } from '../../../../../shared/types/ana-document-detection';

/**
 * Abort the stream if no bytes arrive for this long. Guards against a stalled
 * gateway leaving the composer locked in a "Planning response…" state forever.
 * The timer resets on every chunk, so a long but live generation is fine.
 */
const STREAM_IDLE_TIMEOUT_MS = 90_000;

/** Shape of an action chip produced by the server's guidance/command executors. */
export interface AnaChatAction {
  label: string;
  actionType?: string;
  artifactId?: string;
  sectionCode?: string;
  executed?: boolean;
  error?: string;
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
}

/** Client-side cap on the tool result kept for the inspect disclosure (state size). */
const TOOL_RESULT_VIEW_CAP = 4000;

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

/**
 * Map a parsed `assemble_crl_premortem_artifact` tool result into the client
 * artifact shape. Returns null for an error envelope, a non-object, or a missing
 * artifact. Exported for unit testing the parse in isolation from the stream.
 */
export function mapCrlPremortemArtifact(
  parsed: Record<string, unknown> | null | undefined,
): import('./CrlPremortemPanel').CrlPremortemArtifact | null {
  if (!parsed || typeof parsed !== 'object' || parsed.error) return null;
  const a = parsed.artifact;
  if (!a || typeof a !== 'object') return null;
  return a as import('./CrlPremortemPanel').CrlPremortemArtifact;
}

/**
 * Map a parsed `assemble_briefing_book` tool result into the client
 * BriefingBookPremortemResult shape (E8). Returns null for an error envelope,
 * a non-object, or a result with no premortem. Exported for unit testing.
 *
 * Honest by construction: `anticipated` is forced true and the sealable/
 * assessment flags are passed through verbatim — sample/not_assessed data is
 * never re-flagged as sealable.
 */
export function mapBriefingPremortem(
  parsed: Record<string, unknown> | null | undefined,
): BriefingBookPremortemResult | null {
  if (!parsed || typeof parsed !== 'object' || parsed.error) return null;
  const pm = parsed.premortem as Record<string, unknown> | undefined;
  if (!pm || typeof pm !== 'object') return null;
  const perQuestion = Array.isArray(pm.perQuestion)
    ? (pm.perQuestion as BriefingBookPremortemResult['perQuestion'])
    : [];
  const unmapped = Array.isArray(pm.unmappedChallenges)
    ? (pm.unmappedChallenges as BriefingBookPremortemResult['unmappedChallenges'])
    : [];
  return {
    anticipated: true,
    perQuestion,
    unmappedChallenges: unmapped,
    overallRisk: (pm.overallRisk as BriefingBookPremortemResult['overallRisk']) ?? 'insufficient_data',
    precedentCount: typeof pm.precedentCount === 'number' ? pm.precedentCount : 0,
    dataSource: pm.dataSource === 'live' ? 'live' : 'fixture',
    // Sample/not_assessed is never sealable: only a true server flag passes.
    sealable: pm.sealable === true,
    assessment: pm.assessment === 'assessed' ? 'assessed' : 'not_assessed',
    summary: typeof pm.summary === 'string' ? pm.summary : undefined,
  };
}

/**
 * Map a parsed `verify_docx_against_source` tool result into the client
 * VerificationResult shape. Returns null for an error envelope or non-object.
 * Exported for unit testing the parse in isolation from the SSE stream.
 */
export function mapVerificationResult(
  parsed: Record<string, unknown> | null | undefined,
): VerificationResult | null {
  if (!parsed || typeof parsed !== 'object' || parsed.error) return null;
  const div = parsed.divergence;
  return {
    ok: Boolean(parsed.ok),
    missingRequiredStrings: Array.isArray(parsed.missingRequiredStrings)
      ? (parsed.missingRequiredStrings as unknown[]).filter((s): s is string => typeof s === 'string')
      : [],
    requiredStringsChecked:
      typeof parsed.requiredStringsChecked === 'number' ? parsed.requiredStringsChecked : undefined,
    divergence:
      div && typeof div === 'object' ? (div as VerificationResult['divergence']) : undefined,
    message: typeof parsed.message === 'string' ? parsed.message : undefined,
  };
}

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

/**
 * Map a parsed `check_dossier_consistency` tool result into the client
 * ConsistencyResult shape. Returns null for an error envelope or non-object.
 * Mirrors mapVerificationResult; exported for unit testing in isolation.
 */
export function mapConsistencyResult(
  parsed: Record<string, unknown> | null | undefined,
): ConsistencyResult | null {
  if (!parsed || typeof parsed !== 'object' || parsed.error) return null;

  const allowedVerdicts: ConsistencyVerdict[] = ['clean', 'minor_issues', 'needs_review', 'blocker'];
  const verdict = allowedVerdicts.includes(parsed.verdict as ConsistencyVerdict)
    ? (parsed.verdict as ConsistencyVerdict)
    : 'clean';

  const sev = parsed.bySeverity;
  const bySeverity =
    sev && typeof sev === 'object'
      ? {
          critical: Number((sev as Record<string, unknown>).critical) || 0,
          high: Number((sev as Record<string, unknown>).high) || 0,
          medium: Number((sev as Record<string, unknown>).medium) || 0,
          low: Number((sev as Record<string, unknown>).low) || 0,
        }
      : { critical: 0, high: 0, medium: 0, low: 0 };

  const allowedSeverities: ConsistencyDivergenceSeverity[] = ['critical', 'high', 'medium', 'low'];
  const divergences: ConsistencyDivergence[] = Array.isArray(parsed.divergences)
    ? (parsed.divergences as unknown[])
        .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
        .map(d => ({
          kind: typeof d.kind === 'string' ? d.kind : 'numeric_divergence',
          severity: allowedSeverities.includes(d.severity as ConsistencyDivergenceSeverity)
            ? (d.severity as ConsistencyDivergenceSeverity)
            : 'medium',
          description: typeof d.description === 'string' ? d.description : '',
          draftValue: typeof d.draftValue === 'string' ? d.draftValue : '',
          existingValue: typeof d.existingValue === 'string' ? d.existingValue : undefined,
          existingArtifact: typeof d.existingArtifact === 'string' ? d.existingArtifact : undefined,
          existingCtdSection:
            typeof d.existingCtdSection === 'string' ? d.existingCtdSection : null,
        }))
    : [];

  return {
    verdict,
    artifactsCompared: Number(parsed.artifactsCompared) || 0,
    draftFactsExtracted: Number(parsed.draftFactsExtracted) || 0,
    divergenceCount:
      typeof parsed.divergenceCount === 'number' ? parsed.divergenceCount : divergences.length,
    bySeverity,
    divergences,
    recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : undefined,
    // The server may flag sample-derived drafts; honesty contract forbids
    // treating such a verdict as sealable/exportable.
    isSample: parsed.isSample === true || parsed.is_sample === true,
  };
}

/**
 * Human-readable labels for AnA's tools, so the chat shows "Computing sample
 * size (biostatistics engine)" instead of a raw tool name. Anything not listed
 * falls back to a humanized form of the tool name.
 */
const TOOL_LABELS: Record<string, string> = {
  compute_sample_size: 'Computing sample size — biostatistics engine',
  compare_statistical_scenarios: 'Comparing study scenarios — biostatistics engine',
  assess_statistical_defensibility: 'Assessing statistical defensibility',
  analyze_missing_data_impact: 'Analyzing missing-data impact',
  generate_statistical_document: 'Drafting statistical document',
  search_clinical_evidence: 'Searching clinical evidence',
  search_literature: 'Searching the literature',
  lookup_fda_guidance: 'Looking up FDA guidance',
  lookup_ich_guideline: 'Looking up ICH guidance',
  check_regulatory_compliance: 'Checking regulatory compliance',
  mine_precedents: 'Mining regulatory precedents',
  lookup_regulatory_precedents: 'Looking up regulatory precedents',
  check_numerical_integrity: 'Checking numerical integrity',
  check_dossier_consistency: 'Checking dossier consistency',
  author_docx_native: 'Authoring the document',
  build_from_template: 'Building from your template',
  surgical_docx_xml_edit: 'Applying edits to the document',
  validate_docx: 'Validating document integrity',
  verify_docx_against_source: 'Verifying against your source',
};

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

function toolLabel(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  const spaced = name.replace(/_/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : 'Running a tool';
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
   * Editor-openable draft produced by a document-generating tool this turn
   * (e.g. generate_statistical_document). The UI offers an "Open in editor"
   * affordance that routes this content to the governed document editor.
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
    sendOpts?: { toolsOverride?: string[] },
  ) => Promise<void>;
  /** Abort the current stream. */
  stop: () => void;
  /** Reset the conversation (new thread). */
  reset: () => void;
  /** Hydrate the panel with an existing thread's messages. */
  loadThread: (threadId: string) => Promise<void>;
  /** Current thread id (from server once the first message is persisted). */
  threadId: string | null;
  /** True while loadThread is fetching messages. */
  isLoadingThread: boolean;
}

export function useAnaChat(options: UseAnaChatOptions): UseAnaChatReturn {
  const [messages, setMessages] = useState<AnaChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const threadIdRef = useRef<string | null>(options.initialThreadId || null);
  const abortRef = useRef<AbortController | null>(null);
  // Live mirror of isStreaming for send()'s re-entrancy guard. The state value
  // is a render-time snapshot: a caller that aborts (reset/stop) and re-sends
  // in the same tick would be wrongly no-opped by the stale closure — the
  // "retry wipes the conversation and sends nothing" bug.
  const isStreamingRef = useRef(false);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Abort any in-flight stream when the hosting panel unmounts — otherwise the
  // fetch keeps the connection (and the server-side generation) alive until
  // completion or the idle timeout.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    threadIdRef.current = null;
    setMessages([]);
    isStreamingRef.current = false;
    setIsStreaming(false);
  }, []);

  const loadThread = useCallback(async (threadId: string) => {
    if (!threadId) return;
    abortRef.current?.abort();
    isStreamingRef.current = false;
    setIsStreaming(false);
    setIsLoadingThread(true);
    try {
      const res = await fetch(
        `/api/chat/threads/${encodeURIComponent(threadId)}/messages?limit=100`,
        {
          method: 'GET',
          headers: getAuthHeaders(),
          credentials: 'include',
        }
      );
      if (!res.ok) {
        console.warn('[useAnaChat] loadThread non-ok:', res.status);
        return;
      }
      const body = (await res.json()) as {
        messages?: Array<{ role?: string; content?: string }>;
      };
      const rows = Array.isArray(body.messages) ? body.messages : [];
      const hydrated: AnaChatMessage[] = rows
        .filter(
          m =>
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string' &&
            m.content.length > 0
        )
        .map((m, idx) => ({
          id: `t-${threadId}-${idx}`,
          role: m.role as 'user' | 'assistant',
          text: m.content as string,
        }));
      threadIdRef.current = threadId;
      setMessages(hydrated);
    } catch (err: any) {
      console.warn('[useAnaChat] loadThread failed:', err?.message);
    } finally {
      setIsLoadingThread(false);
    }
  }, []);

  const send = useCallback(
    async (
      rawText: string,
      attachments?: MessageAttachment[],
      sendOpts?: { toolsOverride?: string[] },
    ) => {
      const text = rawText.trim();
      if (!text || isStreamingRef.current) return;

      const sentAt = Date.now();
      const userMsg: AnaChatMessage = {
        id: `u-${sentAt}`,
        role: 'user',
        text,
        sentAt,
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
      };
      const assistantId = `a-${sentAt}`;

      // Insert placeholder immediately so the user sees a progress indicator
      // before the first token arrives (status phases fill in the label).
      setMessages(prev => [
        ...prev,
        userMsg,
        {
          id: assistantId,
          role: 'assistant',
          text: '',
          streaming: true,
          statusPhase: 'Planning response…',
          sentAt,
        },
      ]);
      isStreamingRef.current = true;
      setIsStreaming(true);

      const abortCtl = new AbortController();
      abortRef.current = abortCtl;

      // Idle-timeout guard: abort if the stream goes silent for too long.
      // `didTimeout` lets the AbortError handler distinguish a timeout from a
      // user-initiated stop so the message reads correctly.
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let didTimeout = false;
      const clearIdleTimer = () => {
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
      };
      const armIdleTimer = () => {
        clearIdleTimer();
        idleTimer = setTimeout(() => {
          didTimeout = true;
          abortCtl.abort();
        }, STREAM_IDLE_TIMEOUT_MS);
      };

      // Capture done-event fields before post_done arrives
      let capturedLatencyMs: number | undefined;
      let capturedProvider: string | undefined;
      let capturedEffortUsed: string | undefined;
      let streamedThinking = '';

      // Unpack the AuthoringContextPack into the three typed slots the server
      // orchestrator reads (`project_context`, `document_context`,
      // `authoring_context`). Without this, the server has the orchestrator
      // wired to consume rich context but the client never sends any —
      // so AnA falls back to detecting project / submission type from the
      // user's message text alone.
      const ac = options.authoringContext ?? null;
      const submissionTypeForContext = ac?.submissionType ?? options.submissionType ?? undefined;
      const projectContext =
        ac || options.projectName || submissionTypeForContext
          ? {
              productName: options.projectName ?? undefined,
              submissionType: submissionTypeForContext,
              targetAgency: ac?.regulatorBody ?? undefined,
            }
          : undefined;
      const documentContext = ac
        ? {
            section: ac.sectionCode,
            module: ac.moduleCode,
          }
        : undefined;
      const authoringContextOut = ac
        ? {
            projectId: String(ac.projectId),
            workflowStage: ac.workflowStage,
            artifactId: ac.artifactId,
            artifactVersionId: ac.artifactVersionId,
            artifactStatus: ac.artifactStatus,
            sectionCode: ac.sectionCode,
            moduleCode: ac.moduleCode,
            sectionTitle: ac.sectionTitle,
            regulatorBody: ac.regulatorBody,
            domainTrack: ac.domainTrack,
            submissionType: ac.submissionType,
          }
        : undefined;

      // Server file ids for this turn's attachments. Without these the stream
      // route has no way to know which upload the user attached: the chips
      // rendered in the thread are client-only state, so a user could attach a
      // file, watch it appear in chat, send, and have AnA never receive it.
      // Only `ready` attachments carry a fileId; any still uploading are
      // omitted rather than sent as undefined.
      const attachedFileIds = (attachments ?? [])
        .map(a => a.fileId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

      const body = JSON.stringify({
        message: text,
        thread_id: threadIdRef.current || undefined,
        file_ids: attachedFileIds.length > 0 ? attachedFileIds : undefined,
        // Data Room sources pinned as context for this turn. Omitted when the
        // user has pinned nothing, so the server keeps its own context
        // assembly rather than being handed an empty selection to honour.
        source_ids:
          options.selectedSourceIds && options.selectedSourceIds.length > 0
            ? options.selectedSourceIds
            : undefined,
        project_id: options.projectId || ac?.projectId || undefined,
        submission_type: submissionTypeForContext,
        user_role: options.userRole || undefined,
        // Current UI language so AnA speaks/writes/translates to match the client.
        language: (i18n.language || 'en').split('-')[0],
        project_context: projectContext,
        document_context: documentContext,
        authoring_context: authoringContextOut,
        module_context: options.moduleContext ?? undefined,
        context: {
          screen: options.screenName,
          project: options.projectName,
          projectId: options.projectId,
          productType: submissionTypeForContext,
          userRole: options.userRole,
          screenName: options.screenName,
          // Surface artifact + section identity in the legacy context block too,
          // so any handler that still reads `body.context.*` keeps working.
          activeProject: options.projectName ?? undefined,
          artifactId: ac?.artifactId,
          artifactTitle: ac?.sectionTitle,
          sectionCode: ac?.sectionCode,
          module: ac?.moduleCode,
          artifactStatus: ac?.artifactStatus,
        },
        conversation_history: messages.slice(-10).map(m => ({
          role: m.role,
          content: m.text,
        })),
        // Pinned tools (additive focus). Omitted when empty so the server
        // stays in auto/intent-based selection. A per-call override wins so
        // "pin these tools and send now" applies to this very turn.
        selected_tools: (() => {
          const tools = sendOpts?.toolsOverride ?? options.selectedTools;
          return tools && tools.length > 0 ? tools : undefined;
        })(),
        // Model/effort picker. Both omitted when unset so the server keeps its
        // default routing (effort='balanced', no model pin).
        effort_level: options.effortLevel ?? undefined,
        model_override: options.modelOverride ?? undefined,
      });

      let streamedText = '';

      try {
        const res = await fetch('/api/ana-ri/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          credentials: 'include',
          body,
          signal: abortCtl.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Stream request failed: ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        armIdleTimer();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Live activity — reset the idle watchdog.
          armIdleTimer();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;

            let event: any;
            try {
              event = JSON.parse(payload);
            } catch {
              continue;
            }

            if (event.type === 'thread_id' && event.thread_id) {
              threadIdRef.current = event.thread_id;
            } else if (event.type === 'orchestration') {
              // Capture detected intent lens, document template, and suggested follow-up actions
              // so the UI can show "Audit"/"Risk" chips, "Drafting: X" chips, and next-action pills.
              const o = event.orchestration || {};
              const lens: string | undefined = o?.detectedIntent?.lens;
              const actions: string[] | undefined = Array.isArray(o?.suggestedActions)
                ? o.suggestedActions.filter((s: any) => typeof s === 'string')
                : undefined;
              const docTemplate: DetectedDocumentTemplatePayload | null =
                o?.detectedDocumentTemplate ?? null;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? {
                        ...m,
                        detectedLens: lens && lens !== 'auto' ? lens : m.detectedLens,
                        suggestedActions: actions && actions.length > 0 ? actions : m.suggestedActions,
                        detectedDocumentType: docTemplate?.chipLabel ?? m.detectedDocumentType,
                        detectedDocumentTemplate: docTemplate ?? m.detectedDocumentTemplate,
                      }
                    : m
                )
              );
            } else if (event.type === 'status') {
              // Update the progress label on the placeholder while no tokens
              // have arrived yet (statusPhase is cleared on first text chunk).
              const phase: string = event.message || event.phase || '';
              if (phase) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId && m.text === ''
                      ? { ...m, statusPhase: phase }
                      : m
                  )
                );
              }
            } else if (event.type === 'text') {
              const chunk: string = event.content || '';
              if (!chunk) continue;
              streamedText += chunk;
              const next = streamedText;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, text: next, statusPhase: undefined }
                    : m
                )
              );
            } else if (event.type === 'thinking') {
              // Extended-thinking delta — accumulate separately from answer
              // text. Also clear the statusPhase since AnA has begun working.
              const chunk: string = event.content || '';
              if (!chunk) continue;
              streamedThinking += chunk;
              const thinkingNow = streamedThinking;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, thinking: thinkingNow, statusPhase: undefined }
                    : m
                )
              );
            } else if (event.type === 'done') {
              capturedLatencyMs = typeof event.latencyMs === 'number' ? event.latencyMs : undefined;
              capturedProvider = typeof event.provider === 'string' ? event.provider : undefined;
              // The effort the server actually used this turn (may differ from
              // the request when a governance policyHint pinned the strategy).
              capturedEffortUsed =
                typeof event.effortUsed === 'string' ? event.effortUsed : undefined;
            } else if (event.type === 'post_done') {
              const cleaned: string | undefined = event.cleanedResponse;
              const actions: AnaChatAction[] | undefined = Array.isArray(event.executedActions)
                ? (event.executedActions as AnaChatAction[])
                : undefined;
              // Governed actions the server blocked pending a Part 11 sign-off.
              const pendingSignoffs = extractPendingSignoffs(event.executedCommands);
              // Context layers ANA drew on (names only), shown in the evidence panel.
              const groundingSources: string[] | undefined = Array.isArray(event.enrichmentSources)
                ? event.enrichmentSources.filter((s: unknown): s is string => typeof s === 'string')
                : undefined;
              setMessages(prev =>
                prev.map(m => {
                  if (m.id !== assistantId) return m;
                  return {
                    ...m,
                    text:
                      typeof cleaned === 'string' && cleaned.trim().length > 0
                        ? cleaned
                        : m.text,
                    streaming: false,
                    statusPhase: undefined,
                    executedActions: actions,
                    pendingSignoffs: pendingSignoffs.length > 0 ? pendingSignoffs : undefined,
                    groundingSources:
                      groundingSources && groundingSources.length > 0
                        ? groundingSources
                        : m.groundingSources,
                    latencyMs: capturedLatencyMs,
                    fallback:
                      capturedProvider !== undefined
                        ? capturedProvider !== 'anthropic'
                        : undefined,
                    effortUsed: capturedEffortUsed ?? m.effortUsed,
                  };
                })
              );
            } else if (event.type === 'grounding_strip') {
              // Evidence verdict — store as a compact summary for chip rendering.
              const ev = event.evidence || {};
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? {
                        ...m,
                        evidence: {
                          validated: Boolean(ev.validated),
                          sourceCount: typeof ev.source_count === 'number' ? ev.source_count : 0,
                          groundedClaims:
                            typeof ev.grounded_claim_count === 'number' ? ev.grounded_claim_count : 0,
                          weakClaims:
                            typeof ev.weak_or_ungrounded_claim_count === 'number'
                              ? ev.weak_or_ungrounded_claim_count
                              : 0,
                          missingSupport:
                            typeof ev.missing_support_count === 'number' ? ev.missing_support_count : 0,
                          riskSummary:
                            typeof ev.reviewer_risk_summary === 'string'
                              ? ev.reviewer_risk_summary
                              : undefined,
                          flaggedClaims: Array.isArray(ev.flagged_claims)
                            ? ev.flagged_claims
                                .filter(
                                  (c: unknown): c is { kind: string; text: string } =>
                                    !!c &&
                                    typeof (c as { text?: unknown }).text === 'string' &&
                                    typeof (c as { kind?: unknown }).kind === 'string'
                                )
                                .map((c: { kind: string; text: string }) => ({
                                  kind: c.kind as 'ungrounded' | 'overclaim' | 'contradiction',
                                  text: c.text,
                                }))
                            : undefined,
                        },
                      }
                    : m
                )
              );
            } else if (event.type === 'warning') {
              const msg: string = event.message || '';
              if (msg) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, warnings: [...(m.warnings || []), msg] }
                      : m
                  )
                );
              }
            } else if (event.type === 'tool_use') {
              // AnA invoked a tool — show a calm "running" status row. Prefer the
              // server-provided label (single source of truth, and input-aware —
              // e.g. "Searching the document for \"X\""); fall back to the local
              // map only when the server didn't send one.
              const name: string = event.name || '';
              if (name) {
                const label: string =
                  typeof event.label === 'string' && event.label ? event.label : toolLabel(name);
                const round: number | undefined =
                  typeof event.round === 'number' && event.round > 0 ? event.round : undefined;
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? {
                          ...m,
                          statusPhase: undefined,
                          toolCalls: [
                            ...(m.toolCalls || []),
                            {
                              name,
                              label,
                              status: 'running' as const,
                              ...(round ? { round } : {}),
                              ...(event.input !== undefined ? { input: event.input } : {}),
                            },
                          ],
                        }
                      : m
                  )
                );
              }
            } else if (event.type === 'tool_result') {
              // Resolve the most recent running call for this tool name. Prefer
              // the server's authoritative status; fall back to parsing the
              // result for an error envelope when status wasn't sent.
              const name: string = event.name || '';
              let failed = false;
              let parsedResult: Record<string, unknown> | null = null;
              if (typeof event.result === 'string') {
                try {
                  parsedResult = JSON.parse(event.result);
                } catch {
                  /* non-JSON result */
                }
              }
              if (typeof event.status === 'string') {
                failed = event.status !== 'success';
              } else if (parsedResult) {
                failed = Boolean(parsedResult.error);
              }
              // Capture the verification result so the Document Studio trust-panel
              // can show "verified against your source" (caption strings + diff).
              const verification: VerificationResult | null =
                name === 'verify_docx_against_source' ? mapVerificationResult(parsedResult) : null;
              // E14 — capture the CRL/RTF pre-mortem decision artifact so the
              // Document Studio can render the board-ready pre-mortem panel.
              const crlPremortem =
                name === 'assemble_crl_premortem_artifact' ? mapCrlPremortemArtifact(parsedResult) : null;
              // Capture the dossier-consistency sweep so the Document Studio
              // ConsistencyPanel (the second verification surface) can show the
              // verdict + per-divergence conflicts. This is the natural surface
              // to render after an author_docx_native / surgical_docx_xml_edit
              // returns a Module 2/5 draft and the server runs the sweep.
              // BUILD-1 INTEGRATION: once Build 1 (concept2cure_artifact_versions)
              // is merged, the persisted version row for this draft should carry
              // this verdict. The server executor would attach it to the version
              // when sealing; here on the client we only render the live result.
              const consistency: ConsistencyResult | null =
                name === 'check_dossier_consistency' ? mapConsistencyResult(parsedResult) : null;
              // E8: capture the briefing-book pre-mortem so the Document Studio
              // can show the "anticipated FDA pushback" panel alongside the book.
              const briefingPremortem: BriefingBookPremortemResult | null =
                name === 'assemble_briefing_book' ? mapBriefingPremortem(parsedResult) : null;
              setMessages(prev =>
                prev.map(m => {
                  if (m.id !== assistantId) return m;
                  let next = m;
                  if (m.toolCalls) {
                    const idx = [...m.toolCalls].reverse().findIndex(t => t.name === name && t.status === 'running');
                    if (idx !== -1) {
                      const realIdx = m.toolCalls.length - 1 - idx;
                      const calls = m.toolCalls.slice();
                      // Keep a capped copy of the result for the audit disclosure
                      // so a reviewer can see exactly what this step returned,
                      // without bloating message state with a huge payload.
                      const rawResult = typeof event.result === 'string' ? event.result : undefined;
                      const cappedResult = rawResult
                        ? rawResult.length > TOOL_RESULT_VIEW_CAP
                          ? `${rawResult.slice(0, TOOL_RESULT_VIEW_CAP)}\n… (truncated)`
                          : rawResult
                        : undefined;
                      calls[realIdx] = {
                        ...calls[realIdx],
                        status: failed ? 'error' : 'success',
                        ...(cappedResult !== undefined ? { result: cappedResult } : {}),
                      };
                      next = { ...next, toolCalls: calls };
                    }
                  }
                  if (verification) next = { ...next, verification };
                  if (crlPremortem) next = { ...next, crlPremortem };
                  if (consistency) next = { ...next, consistency };
                  if (briefingPremortem) next = { ...next, briefingPremortem };
                  return next;
                })
              );
            } else if (event.type === 'artifact_draft') {
              // A document-generating tool produced an editor-openable draft.
              const title: string = event.title || 'Generated document';
              const content: string = event.content || '';
              const documentType: string | undefined = event.documentType;
              if (content) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, generatedDraft: { title, content, documentType } }
                      : m
                  )
                );
              }
            } else if (event.type === 'artifact_version_saved') {
              // Server persisted this draft to the governed artifact version
              // history. Attach the durable artifactId/version to the matching
              // draft so the UI can fetch its cross-session lineage.
              const artifactId: string | undefined =
                typeof event.artifactId === 'string' ? event.artifactId : undefined;
              const version: number | undefined =
                typeof event.version === 'number' ? event.version : undefined;
              const savedTitle: string | undefined =
                typeof event.title === 'string' ? event.title : undefined;
              if (artifactId) {
                setMessages(prev =>
                  prev.map(m => {
                    if (m.id !== assistantId || !m.generatedDraft) return m;
                    if (savedTitle && m.generatedDraft.title !== savedTitle) return m;
                    return {
                      ...m,
                      generatedDraft: { ...m.generatedDraft, artifactId, version },
                    };
                  })
                );
              }
            } else if (event.type === 'intelligence_question') {
              const question = event.question;
              const flowState = event.flowState;
              if (question && flowState) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, intelligenceQuestion: question, intelligenceFlowState: flowState }
                      : m
                  )
                );
              }
            } else if (event.type === 'intelligence_flow_complete') {
              const completion = event.completion;
              const flowState = event.flowState;
              if (completion) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, intelligenceFlowComplete: completion, intelligenceFlowState: flowState, intelligenceQuestion: undefined }
                      : m
                  )
                );
              }
            } else if (event.type === 'war_game_report') {
              const report = event.report;
              if (report) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, warGameReport: report }
                      : m
                  )
                );
              }
            } else if (event.type === 'report_canvas') {
              const canvas = event.canvas;
              if (canvas && (canvas.kind === 'report' || canvas.kind === 'suggestions')) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, reportCanvas: { ...canvas, source: event.source } }
                      : m
                  )
                );
              }
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Stream error');
            }
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' && didTimeout) {
          // Idle timeout — the stream went silent. Seal any partial tokens and
          // tell the user, rather than leaving a half-rendered reply.
          setMessages(prev =>
            prev.map(m => {
              if (m.id !== assistantId) return m;
              return {
                ...m,
                text:
                  m.text.length > 0
                    ? m.text
                    // Drop apologetic voice + generic "please try again" per
                    // the microcopy rule; state what happened, the user
                    // already sees the composer to retry.
                    : 'AnA stopped responding before finishing this turn. The prior turns are preserved.',
                streaming: false,
                statusPhase: undefined,
                warnings: [...(m.warnings || []), 'Response timed out'],
              };
            })
          );
        } else if (err?.name === 'AbortError') {
          // User stopped — mark stopped and seal whatever tokens rendered.
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? { ...m, streaming: false, statusPhase: undefined, stopped: true }
                : m
            )
          );
        } else {
          console.warn('[useAnaChat] stream failed:', err?.message);
          setMessages(prev =>
            prev.map(m => {
              if (m.id !== assistantId) return m;
              return {
                ...m,
                text:
                  m.text.length > 0
                    ? m.text
                    : 'AnA is unreachable — the network or the AI gateway did not respond. Prior turns are preserved.',
                streaming: false,
                statusPhase: undefined,
              };
            })
          );
        }
      } finally {
        clearIdleTimer();
        // Only clean up if this stream still owns the shared refs: an aborted
        // stream's finally runs asynchronously, and by then a replacement
        // send() may already be live — clobbering its controller/flags would
        // orphan the new stream.
        if (abortRef.current === abortCtl) {
          abortRef.current = null;
          isStreamingRef.current = false;
          setIsStreaming(false);
        }
      }
    },
    [
      isStreaming,
      messages,
      options.projectId,
      options.screenName,
      options.projectName,
      options.userRole,
      options.submissionType,
      options.authoringContext,
      options.moduleContext,
      options.selectedTools,
      options.effortLevel,
      options.modelOverride,
    ]
  );

  return {
    messages,
    isStreaming,
    send,
    stop,
    reset,
    loadThread,
    threadId: threadIdRef.current,
    isLoadingThread,
  };
}
