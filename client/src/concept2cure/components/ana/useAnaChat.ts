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

/* The types now live in ./useAnaChat.types (see that file for why). They are
   re-exported here so every existing importer keeps its current path — the
   split is an internal seam, not a migration anyone else has to follow. */
export type {
  AnaChatAction,
  AnaToolCall,
  VerificationResult,
  CrlPremortemArtifact,
  ConsistencyVerdict,
  ConsistencyDivergenceSeverity,
  ConsistencyDivergence,
  ConsistencyResult,
  MessageAttachment,
  AnaChatMessage,
  UseAnaChatOptions,
  RunControlStatus,
  UseAnaChatReturn,
  DriveSseEvent,
  AnaProgressPhase,
} from './useAnaChat.types';

import { advanceProgress, closeProgress, settleRunningCalls, CLIENT_PHASE_LABELS } from './anaProgress';

import type {
  AnaChatAction,
  AnaToolCall,
  VerificationResult,
  ConsistencyVerdict,
  ConsistencyDivergenceSeverity,
  ConsistencyDivergence,
  ConsistencyResult,
  MessageAttachment,
  AnaChatMessage,
  UseAnaChatOptions,
  RunControlStatus,
  UseAnaChatReturn,
  DriveSseEvent,
} from './useAnaChat.types';


/**
 * Abort the stream if no bytes arrive for this long. Guards against a stalled
 * gateway leaving the composer locked in a "Planning response…" state forever.
 * The timer resets on every chunk, so a long but live generation is fine.
 */
const STREAM_IDLE_TIMEOUT_MS = 90_000;



/** Client-side cap on the tool result kept for the inspect disclosure (state size). */
const TOOL_RESULT_VIEW_CAP = 4000;



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


function toolLabel(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  const spaced = name.replace(/_/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : 'Running a tool';
}





/**
 * Persisted tool-trace entries → the transcript's step rows. Exported for its
 * test. A `not_found` step (no handler here) is a step that did not complete,
 * with the same sentence the live stream uses for it, so the record reads the
 * same whether it was watched live or reopened later.
 */
export function hydrateToolTrace(
  trace: Array<{ tool?: string; label?: string; status?: string; resultSummary?: string }> | undefined,
): AnaToolCall[] {
  if (!Array.isArray(trace)) return [];
  const calls: AnaToolCall[] = [];
  for (const t of trace) {
    const name = typeof t?.tool === 'string' ? t.tool : '';
    if (!name) continue;
    const label = typeof t.label === 'string' && t.label ? t.label : toolLabel(name);
    const humanStep = label.charAt(0).toLowerCase() + label.slice(1);
    if (t.status === 'success') {
      calls.push({ name, label, status: 'success' });
    } else if (t.status === 'not_found') {
      calls.push({
        name,
        label,
        status: 'error',
        message: `This step (${humanStep}) isn't available here. AnA will work around it.`,
      });
    } else {
      calls.push({
        name,
        label,
        status: 'error',
        message: `AnA couldn't finish ${humanStep}. She'll continue with what she has.`,
      });
    }
  }
  return calls;
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
  // Opaque id for the in-flight run (from the `run_started` SSE event), used to
  // pause / interject / cancel it server-side via the control endpoint.
  const runIdRef = useRef<string | null>(null);
  // Control status of the in-flight run, driving the composer's pause/resume UI.
  const [runStatus, setRunStatus] = useState<RunControlStatus>(null);

  /**
   * Send a mid-run control action for the active run. `pause` holds AnA at the
   * next agentic-round boundary; `interject` splices a steering message into the
   * next round; `resume` continues; `cancel` stops the run server-side. Returns
   * false when there is no active run or the request fails.
   */
  const control = useCallback(
    async (
      action: 'pause' | 'resume' | 'interject' | 'cancel',
      message?: string,
    ): Promise<boolean> => {
      const runId = runIdRef.current;
      if (!runId) return false;
      try {
        const res = await fetch(
          `/api/ana-ri/stream/${encodeURIComponent(runId)}/control`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            credentials: 'include',
            body: JSON.stringify(message !== undefined ? { action, message } : { action }),
          },
        );
        if (!res.ok) return false;
        // Optimistic local status; the server also echoes control SSE events.
        if (action === 'pause') setRunStatus('paused');
        else if (action === 'resume') setRunStatus('running');
        else if (action === 'cancel') setRunStatus('cancelled');
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const pause = useCallback(() => control('pause'), [control]);
  const resume = useCallback(() => control('resume'), [control]);
  // Steers the server accepted but has not yet spliced into a round. A steer
  // lands at the NEXT round boundary, which can be many seconds away; until
  // the `interjected` event confirms it, this is the only evidence it exists.
  const [pendingSteers, setPendingSteers] = useState<string[]>([]);
  const interject = useCallback(
    async (message: string) => {
      const ok = await control('interject', message);
      if (ok) setPendingSteers(prev => [...prev, message]);
      return ok;
    },
    [control],
  );

  const stop = useCallback(() => {
    // Cancel server-side too (the fetch abort alone leaves the server
    // generating and running the tool loop to completion — the pre-existing
    // "Stop doesn't stop AnA" gap).
    if (runIdRef.current) void control('cancel');
    abortRef.current?.abort();
  }, [control]);

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
        // Resolving here made the caller's error branch unreachable, so a 401
        // or a 500 on a real conversation rendered as the "Talk to AnA" empty
        // state: the user was told their conversation was empty when the read
        // had failed. An error is never an empty result.
        console.warn('[useAnaChat] loadThread non-ok:', res.status);
        throw new Error(`loadThread ${res.status}`);
      }
      const body = (await res.json()) as {
        messages?: Array<{
          role?: string;
          content?: string;
          metadata?: {
            reasoning?: string;
            toolTrace?: Array<{ tool?: string; label?: string; status?: string; resultSummary?: string }>;
            humanControls?: Array<{ action?: string; message?: string }>;
          } | null;
        }>;
      };
      const rows = Array.isArray(body.messages) ? body.messages : [];
      const hydrated: AnaChatMessage[] = rows
        .filter(
          m =>
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string' &&
            m.content.length > 0
        )
        .map((m, idx) => {
          // Rehydrate AnA's persisted reasoning (thought process) so the
          // "Reasoning" collapsible on the assistant turn survives reload,
          // matching what streamed live during the original turn.
          const reasoning =
            m.role === 'assistant' && typeof m.metadata?.reasoning === 'string'
              ? m.metadata.reasoning
              : undefined;
          // The persisted tool trace (server/services/ana/tool-trace.ts) is
          // the turn's real step record: which tools ran, under which label,
          // and whether each succeeded. Rehydrating it is what lets a reopened
          // conversation show the work AnA did, rather than an answer with no
          // visible steps behind it. Durations are not persisted, so none are
          // claimed. The recorded steers come back the same way.
          const toolCalls = m.role === 'assistant' ? hydrateToolTrace(m.metadata?.toolTrace) : [];
          const interjections =
            m.role === 'assistant'
              ? (m.metadata?.humanControls ?? [])
                  .filter(c => c?.action === 'interject' && typeof c.message === 'string' && c.message)
                  .map(c => c.message as string)
              : [];
          return {
            id: `t-${threadId}-${idx}`,
            role: m.role as 'user' | 'assistant',
            text: m.content as string,
            ...(reasoning ? { thinking: reasoning } : {}),
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
            ...(interjections.length > 0 ? { interjections } : {}),
          };
        });
      threadIdRef.current = threadId;
      setMessages(hydrated);
    } catch (err: any) {
      console.warn('[useAnaChat] loadThread failed:', err?.message);
      throw err;
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
      // Fresh run: clear any prior run's control id/status until `run_started`.
      runIdRef.current = null;
      setRunStatus(null);

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

      /* Sources the user pinned in the Data Room, for THIS turn.
         `options.selectedSourceIds` is the direct way to supply them. The shell
         does not thread that prop, though: ProjectHome's Data Room hands its
         selection over through `window.C2C_SOURCE_PINS`, the same convention it
         already uses for `window.C2C_PROJECT` / `C2C_CONVO`, and it sets that
         global synchronously immediately before calling onAsk — so a value
         captured at render time would be a turn behind.

         Reading the global here is what actually closes the chain. Before this,
         "Draft with N pinned sources" set the global, nothing ever read it, and
         the turn reached the model with no sources attached at all — a button
         that named the user's chosen documents and then quietly dropped them.
         The server side was already complete: it resolves `source_ids` through
         `resolveSourceUploadIds` onto the same tenant-scoped path an attachment
         uses, and warns when a chosen source has no readable upload.

         Consumed once, then cleared: the pin is documented as context for "the
         next AnA turn", and a global left set would silently ground every later,
         unrelated question on the same documents. */
      const pinnedFromShell: Array<number | string> = (() => {
        try {
          const g = (window as unknown as { C2C_SOURCE_PINS?: unknown }).C2C_SOURCE_PINS;
          return Array.isArray(g) ? (g as Array<number | string>).filter((v) => v != null && v !== '') : [];
        } catch {
          return [];
        }
      })();
      const turnSourceIds: Array<number | string> =
        options.selectedSourceIds && options.selectedSourceIds.length > 0
          ? options.selectedSourceIds
          : pinnedFromShell;
      if (pinnedFromShell.length > 0) {
        try { delete (window as unknown as { C2C_SOURCE_PINS?: unknown }).C2C_SOURCE_PINS; } catch { /* noop */ }
      }

      const body = JSON.stringify({
        message: text,
        thread_id: threadIdRef.current || undefined,
        file_ids: attachedFileIds.length > 0 ? attachedFileIds : undefined,
        // Data Room sources pinned as context for this turn. Omitted when the
        // user has pinned nothing, so the server keeps its own context
        // assembly rather than being handed an empty selection to honour.
        source_ids: turnSourceIds.length > 0 ? turnSourceIds : undefined,
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
        // Live Drive opt-in — sent only while the toggle is on, so the common
        // case stays byte-identical and the server does zero extra work.
        live_drive: options.liveDrive === true ? true : undefined,
        // Demonstration mode rides only on opted-in turns (the server ignores
        // it otherwise), so a stale mode can never outlive the toggle.
        drive_mode:
          options.liveDrive === true && options.driveMode === 'demo' ? 'demo' : undefined,
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
                const phaseId: string = typeof event.phase === 'string' && event.phase ? event.phase : phase;
                const at = Date.now();
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? {
                          ...m,
                          // The label only stands in for the body before the
                          // first token; the progress record keeps every phase.
                          ...(m.text === '' ? { statusPhase: phase } : {}),
                          progress: advanceProgress(m.progress, phaseId, phase, at),
                        }
                      : m
                  )
                );
              }
            } else if (event.type === 'text') {
              const chunk: string = event.content || '';
              if (!chunk) continue;
              streamedText += chunk;
              const next = streamedText;
              const at = Date.now();
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? {
                        ...m,
                        text: next,
                        statusPhase: undefined,
                        progress: advanceProgress(m.progress, 'composing', CLIENT_PHASE_LABELS.composing, at),
                      }
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
              const at = Date.now();
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? {
                        ...m,
                        thinking: thinkingNow,
                        statusPhase: undefined,
                        progress: advanceProgress(m.progress, 'reasoning', CLIENT_PHASE_LABELS.reasoning, at),
                      }
                    : m
                )
              );
            } else if (event.type === 'run_started') {
              // Capture the run id so the user can pause/interject/cancel it.
              runIdRef.current = typeof event.runId === 'string' ? event.runId : null;
              setRunStatus('running');
            } else if (event.type === 'paused') {
              setRunStatus('paused');
            } else if (event.type === 'resumed') {
              setRunStatus('running');
            } else if (event.type === 'cancelled') {
              setRunStatus('cancelled');
            } else if (event.type === 'interjected') {
              // Surface the accepted steer as a small note on the assistant turn.
              const msg: string = typeof event.message === 'string' ? event.message : '';
              if (msg) {
                // Confirmed spliced into a round: it is no longer waiting. The
                // oldest pending steer is the one consumed — the server drains
                // its queue in order and echoes each as it goes — and it is
                // matched by position, not text, because the echo is trimmed
                // and capped server-side and a long steer would never match.
                setPendingSteers(prev => (prev.length > 0 ? prev.slice(1) : prev));
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, interjections: [...(m.interjections ?? []), msg] }
                      : m
                  )
                );
              }
            } else if (event.type === 'done') {
              capturedLatencyMs = typeof event.latencyMs === 'number' ? event.latencyMs : undefined;
              capturedProvider = typeof event.provider === 'string' ? event.provider : undefined;
              // The effort the server actually used this turn (may differ from
              // the request when a governance policyHint pinned the strategy).
              capturedEffortUsed =
                typeof event.effortUsed === 'string' ? event.effortUsed : undefined;
              // The answer has landed; the server's background finishing work
              // (evidence check, actions, persistence) runs until `post_done`.
              const at = Date.now();
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? {
                        ...m,
                        progress: advanceProgress(m.progress, 'finalizing', CLIENT_PHASE_LABELS.finalizing, at),
                      }
                    : m
                )
              );
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
                    completedAt: Date.now(),
                    progress: closeProgress(m.progress, 'done', Date.now()),
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
            } else if (
              event.type === 'drive_state' ||
              event.type === 'drive_navigation' ||
              event.type === 'drive_action'
            ) {
              // Live Drive events — forwarded verbatim; the shell validates and
              // applies (v2/liveDrive.ts + v2/surfaceActions.ts). A listener
              // throw must not kill the stream: the turn's answer matters more
              // than the drive.
              try {
                options.onDriveEvent?.(event as DriveSseEvent);
              } catch {
                /* listener error — drive skips, stream continues */
              }
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
                          // Deliberately does NOT clear statusPhase — see
                          // __tests__/useAnaChat-round-status.test.ts. Text and
                          // thinking still clear it.
                          ...m,
                          toolCalls: [
                            ...(m.toolCalls || []),
                            {
                              name,
                              label,
                              status: 'running' as const,
                              startedAt: Date.now(),
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
                      const humanNote =
                        typeof event.message === 'string' && event.message.trim()
                          ? event.message.trim()
                          : undefined;
                      calls[realIdx] = {
                        ...calls[realIdx],
                        status: failed ? 'error' : 'success',
                        endedAt: Date.now(),
                        ...(typeof event.latencyMs === 'number' && event.latencyMs >= 0
                          ? { latencyMs: event.latencyMs }
                          : {}),
                        ...(cappedResult !== undefined ? { result: cappedResult } : {}),
                        ...(humanNote !== undefined ? { message: humanNote } : {}),
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
                // Follow-the-work hook: a listener throw must not kill the
                // stream (same rule as onDriveEvent above).
                try {
                  options.onArtifactSaved?.(artifactId);
                } catch {
                  /* listener error — the save is still recorded above */
                }
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
                completedAt: Date.now(),
                progress: closeProgress(m.progress, 'stopped', Date.now()),
                toolCalls: settleRunningCalls(m.toolCalls, 'Not finished — AnA stopped responding.', Date.now()),
                warnings: [...(m.warnings || []), 'Response timed out'],
              };
            })
          );
        } else if (err?.name === 'AbortError') {
          // User stopped — mark stopped and seal whatever tokens rendered.
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? {
                    ...m,
                    streaming: false,
                    statusPhase: undefined,
                    stopped: true,
                    completedAt: Date.now(),
                    progress: closeProgress(m.progress, 'stopped', Date.now()),
                    toolCalls: settleRunningCalls(m.toolCalls, 'Not finished — the run was stopped.', Date.now()),
                  }
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
                completedAt: Date.now(),
                progress: closeProgress(m.progress, 'stopped', Date.now()),
                toolCalls: settleRunningCalls(m.toolCalls, 'Not finished — the connection was lost.', Date.now()),
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
          // The run is over; clear control id/status so the composer hides the
          // pause/resume affordances (a stale run id can never be controlled).
          runIdRef.current = null;
          setRunStatus(null);
          // A steer the run never reached is not pending anymore; it was lost
          // with the run, and the transcript's interjections say which landed.
          setPendingSteers([]);
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
      options.liveDrive,
      options.onDriveEvent,
      options.onArtifactSaved,
    ]
  );

  return {
    messages,
    isStreaming,
    send,
    stop,
    runStatus,
    pause,
    resume,
    interject,
    pendingSteers,
    reset,
    loadThread,
    threadId: threadIdRef.current,
    isLoadingThread,
  };
}
