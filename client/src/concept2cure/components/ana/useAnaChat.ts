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
 *   done         — captures latencyMs + provider (fallback detection), and why
 *                  the loop stopped (stoppedReason) with its rounds
 *   post_done    — cleaned response + executedActions chips
 *   warning      — degraded-mode signal appended to the message's warnings
 *   grounding_strip — evidence verdict stored for the grounding chip on the reply
 *   tool_use / tool_result — tool-call transparency rows
 *   artifact_draft — an editor-openable draft produced by a generating tool
 *   run_started  — the run id the controls address (pause / steer / stop)
 *   paused / resumed / cancelled — the run's control state; `paused` says why
 *                  (reason 'manual': AnA holding before `next` under Manual)
 *   hold_expired — a Manual hold nobody answered ended the turn
 *   interjected  — a steer reached a round (`replaced`: the held step it replaced)
 *   error        — surface via console + last-message flag
 *
 * @module client/src/concept2cure/components/ana/useAnaChat
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { getAuthHeaders } from '../../../utils/authToken';
import { errorCodeOf, serverMessage } from '@/lib/queryClient';
import {
  extractPendingSignoffs,
  pendingSignoffFromApproval,
  type PendingSignoff,
} from './useGovernedAction';
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
  DriveTurnControls,
  AnaSendOptions,
  AnaProgressPhase,
  AnaPlanStep,
  AnaPlanChange,
  AnaContextUsed,
  AnaTurnRecordStatus,
  AnaRunHold,
} from './useAnaChat.types';

import {
  advanceProgress,
  applyPlanEvent,
  closeProgress,
  readContextUsed,
  readPlanSteps,
  readTurnEnding,
  readTurnRecord,
  settleRunningCalls,
  CLIENT_PHASE_LABELS,
} from './anaProgress';
import { getAnaLockedScreens } from './anaLockedScreens';
import { isAnaRunPolicy, stepLabels } from '@shared/ana/run-policy';
import { clientContinuationContext } from '@shared/ana/continuation-context';
import type { AnaRunPolicy } from '@shared/ana/run-control-limits';
import { readGroundingStrip, readStoredVerification } from './anaAnswerCheck';

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
  DriveTurnControls,
  AnaSendOptions,
  AnaRunHold,
} from './useAnaChat.types';


/**
 * Abort the stream if no bytes arrive for this long. Guards against a stalled
 * gateway leaving the composer locked in a "Planning response…" state forever.
 * The timer resets on every chunk, so a long but live generation is fine.
 */
const STREAM_IDLE_TIMEOUT_MS = 90_000;

/** A control request must not leave Stop (and a queued replacement demo) waiting forever. */
const CONTROL_REQUEST_TIMEOUT_MS = 5_000;

/** Saved history must release the composer even when headers or the body stall. */
const THREAD_LOAD_TIMEOUT_MS = 15_000;

/** Race both fetch and JSON against one deadline; cancellation settles the wait too. */
function historyDeadline(loading: AbortController) {
  let timedOut = false;
  let rejectAborted!: () => void;
  const promise = new Promise<never>((_resolve, reject) => {
    rejectAborted = () => {
      const failure = new Error('History read aborted');
      failure.name = 'AbortError';
      reject(failure);
    };
    loading.signal.addEventListener('abort', rejectAborted, { once: true });
  });
  const timer = setTimeout(() => {
    timedOut = true;
    loading.abort();
  }, THREAD_LOAD_TIMEOUT_MS);
  return {
    promise,
    failureMessage: () => timedOut
      ? 'Loading this conversation timed out. Retry, or start a new conversation. Your question has not been sent.'
      : "This conversation couldn't load. Retry, or start a new conversation. Your question has not been sent.",
    dispose: () => {
      clearTimeout(timer);
      loading.signal.removeEventListener('abort', rejectAborted);
    },
  };
}

function fetchHistoryHeaders(threadId: string, signal: AbortSignal) {
  return fetch(`/api/chat/threads/${encodeURIComponent(threadId)}/messages?limit=100`, {
    method: 'GET',
    headers: getAuthHeaders(),
    credentials: 'include',
    signal,
  });
}

/** When to ask the server, by run id, for the record of a turn that ended here first. */
const RECORD_CONFIRM_WAITS_MS = [1_500, 4_000];



/** Client-side cap on the tool result kept for the inspect disclosure (state size). */
const TOOL_RESULT_VIEW_CAP = 4000;

/** Step labels from a frame: the non-empty strings, in order (shared/ana/run-policy.ts). */
const frameLabels = stepLabels;

/**
 * Why a `paused` frame says the run is held (row 74): AnA's own Manual hold,
 * with the steps she is waiting to run, or — absent a reason — a person's pause.
 */
function readRunHold(event: { reason?: unknown; next?: unknown }): AnaRunHold {
  return event.reason === 'manual'
    ? { reason: 'manual', next: frameLabels(event.next) }
    : { reason: 'person', next: [] };
}

/**
 * What POST /api/ana-ri/stream/:runId/control accepts. The first four are a
 * person's controls; `screen_report` is the app's observation, which the
 * server queues for her next round without recording it as anyone's decision.
 */
type RunControlAction = 'pause' | 'resume' | 'interject' | 'cancel' | 'screen_report' | 'move_landed';



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
  // An unknown or missing verdict is no result, never "clean" (row 74,
  // ADR-0015 §7): coercing it read as a finding of consistency.
  if (!allowedVerdicts.includes(parsed.verdict as ConsistencyVerdict)) return null;
  const verdict = parsed.verdict as ConsistencyVerdict;

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
      // The persisted result summary rides along as the call's `result`: it
      // is the server's capped copy of what the tool returned, and it is how
      // a reopened thread still knows which authoring document a
      // draft_authoring_document step produced (ConversationThread reads the
      // ids out of it). Absent when the trace carried none.
      const result = typeof t.resultSummary === 'string' && t.resultSummary ? t.resultSummary : undefined;
      calls.push({ name, label, status: 'success', ...(result ? { result } : {}) });
    } else if (t.status === 'not_found') {
      calls.push({
        name,
        label,
        status: 'error',
        message: `This step (${humanStep}) isn't available here. AnA will work around it.`,
      });
    } else if (t.status === 'incomplete') {
      // A sub-agent that stopped at its budget (row 74, S5): the same sentence
      // the live tool_result carried, not "AnA couldn't finish".
      const summary = typeof t.resultSummary === 'string' && t.resultSummary ? t.resultSummary : humanStep;
      calls.push({ name, label, status: 'error', message: `The agent's result is incomplete: ${summary}.` });
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

/**
 * What the person is told when the stream route refuses a turn outright. Each
 * refusal says what actually happened: a rate limit or a usage cap was read as
 * "AnA is unreachable — the network or the AI gateway did not respond", which
 * sent people to check a connection that was fine.
 */
function streamFailure(event: { error?: unknown; code?: unknown; status?: unknown }) {
  const failure = new Error(serverMessage(event) ?? 'Stream error') as Error & { code?: string; status?: number };
  failure.code = errorCodeOf(event);
  if (typeof event.status === 'number') failure.status = event.status;
  return failure;
}

export function streamRefusalText(err: unknown): string {
  const failure = err as { code?: string; status?: number } | undefined;
  if (failure?.code === 'THREAD_FORBIDDEN') {
    return 'That conversation belongs to another user. Select your own conversation or start a new one. Your request was not sent to the AI provider.';
  }
  if (failure?.status === 401) {
    return 'Your sign-in could not be verified. Sign in again to ask AnA. Prior turns are preserved.';
  }
  if (failure?.status === 403) {
    return 'AnA cannot accept this request with your current access. Sign in again or ask an administrator to review your access. Prior turns are preserved.';
  }
  if (failure?.code === 'GATEWAY_UNAVAILABLE') {
    return 'No AI provider is configured for this deployment, so AnA cannot answer. This is a server setting, not your connection. Prior turns are preserved.';
  }
  if (failure?.code === 'WEEKLY_LIMIT_EXCEEDED') {
    return 'This organization has reached its weekly limit for AnA requests, so this one was not sent. An administrator can review the limit. Prior turns are preserved.';
  }
  if (failure?.status === 429) {
    return 'Too many AnA requests in the last minute, so this one was not taken. Wait a moment and ask again. Prior turns are preserved.';
  }
  return "AnA couldn't complete this request. Try again, or ask an administrator for help if it keeps happening. Prior turns are preserved.";
}

/** Recovery beside a partial draft must not describe an already-started reply as unsent. */
function partialReplyRecoveryText(err: unknown): string {
  const failure = err as { code?: string; status?: number } | undefined;
  if (failure?.code === 'THREAD_FORBIDDEN') {
    return 'Select your own conversation or start a new one before asking again.';
  }
  if (failure?.status === 401) return 'Sign in again before asking AnA to continue.';
  if (failure?.status === 403) return 'Ask an administrator to review your access before asking AnA to continue.';
  if (failure?.code === 'GATEWAY_UNAVAILABLE') {
    return 'An administrator needs to configure an AI provider before AnA can continue.';
  }
  if (failure?.code === 'WEEKLY_LIMIT_EXCEEDED') {
    return 'An administrator can review the weekly limit before you ask AnA to continue.';
  }
  if (failure?.status === 429) return 'Wait a moment before asking AnA to continue.';
  return 'Review the partial text before asking AnA to try again.';
}

export function useAnaChat(options: UseAnaChatOptions): UseAnaChatReturn {
  const [messages, setMessages] = useState<AnaChatMessage[]>([]);
  /* The transcript `send` forwards as `conversation_history`, read at call
     time. Read from `send`'s closure it was the transcript of the render
     `send` was made in, so a caller that clears the conversation and asks in
     the same tick — the conversation screen starting a new conversation with
     the question it was handed — sent the conversation it had just cleared as
     the new one's history. The server reads that history whenever the thread
     is new, so AnA answered a fresh conversation inside the last one. `reset`
     and `loadThread` write it as they replace the transcript. */
  const messagesRef = useRef<AnaChatMessage[]>(messages);
  // Date.now alone collides when consecutive turns start within one clock tick.
  const turnSequenceRef = useRef(0);
  messagesRef.current = messages;
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [threadLoadError, setThreadLoadError] = useState<UseAnaChatReturn['threadLoadError']>(null);
  const threadLoadRef = useRef<AbortController | null>(null);
  const threadLoadErrorRef = useRef<UseAnaChatReturn['threadLoadError']>(null);
  const threadIdRef = useRef<string | null>(options.initialThreadId || null);
  const abortRef = useRef<AbortController | null>(null);
  /* The latest options, read by `send` at call time. `send` is memoized and
     its dependency list had drifted from what its body reads — `driveMode` and
     `selectedSourceIds` were missing — so a demonstration started while Live
     Drive was already on was sent as an ordinary turn (3 moves, then silence).
     Reading through a ref makes that class of drift impossible. */
  const optionsRef = useRef(options);
  optionsRef.current = options;
  /* True once the in-flight turn has MOVED the screen (a `drive_navigation`
     or `drive_action` reached the shell). Such a turn is not aborted when the
     hosting panel unmounts — its move is what unmounts it.

     Not set by an enabled `drive_state`. It used to be, and an enabled drive
     is only permission to move: a turn that had it and never used it was
     exempt from the unmount abort all the same, so the person left the panel
     and the answer kept generating headless, for nobody. Whether the turn was
     drive-enabled at all is a separate, per-turn fact (see `send`), and it is
     that fact which releases the shell's drive when the turn ends. */
  const drivingRef = useRef(false);
  /* Set while the in-flight turn is drive-enabled: tells the shell the person
     has ended that turn early (`drive_stopped`). Called, then cleared, by every
     path here that ends a turn before it finishes — see haltTurnDrive. */
  const haltDriveRef = useRef<(() => void) | null>(null);
  /* Halt the in-flight turn's drive on the shell, once, before anything is
     awaited. Stop cancels the run on the server FIRST and drops the stream
     only when that answers, and until then the stream goes on delivering moves
     the server had already written — which the shell applies while its drive
     is live. Only the drive strip's Stop halted the drive itself; the rail's,
     the conversation screen's and the docks' reach nothing but this hook, so
     the screen went on moving through the stopped turn's moves, queued and
     still arriving. A new or other conversation replacing a driving turn
     abandons it the same way. */
  const haltTurnDrive = useCallback(() => {
    const halt = haltDriveRef.current;
    haltDriveRef.current = null;
    if (!halt) return;
    try {
      halt();
    } catch {
      /* listener error — the turn is still ended below */
    }
  }, []);
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
  // Why the run is held, when it is (row 74): the strip's Manual copy reads it.
  const [runHold, setRunHold] = useState<AnaRunHold | null>(null);
  // The policy the turn in flight was SENT with (what the strip's steer help
  // reads) — not the preference now, which applies to the next message.
  const [turnRunPolicy, setTurnRunPolicy] = useState<AnaRunPolicy | null>(null);

  /**
   * Send a mid-run control action for a run. `pause` holds AnA at the next
   * agentic-round boundary; `interject` splices a person's steering message
   * into the next round; `resume` continues; `cancel` stops the run
   * server-side; `screen_report` tells her what the app observed on screen (a
   * move that did not land) — an observation, not a human control. Returns
   * false, without a request, when there is no run to address, and false when
   * the request fails.
   *
   * The run is an argument, not read here, because not every caller means
   * the run in flight NOW: a drive turn's controls are bound to the run that
   * turn started (see `send`). `control` below is the in-flight case.
   */
  const controlRun = useCallback(
    async (
      runId: string | null,
      action: RunControlAction,
      message?: string,
      moveId?: string,
    ): Promise<boolean> => {
      if (!runId) return false;
      const controlAbort = new AbortController();
      const timeout = setTimeout(() => controlAbort.abort(), CONTROL_REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(
          `/api/ana-ri/stream/${encodeURIComponent(runId)}/control`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            credentials: 'include',
            signal: controlAbort.signal,
            body: JSON.stringify({
              action,
              ...(message !== undefined ? { message } : {}),
              ...(moveId !== undefined ? { moveId } : {}),
            }),
          },
        );
        if (!res.ok) return false;
        // A control response can arrive after its turn ended and another
        // began. It still succeeded for the old run, but cannot change the
        // replacement turn's pause/cancel state.
        if (runIdRef.current !== runId) return true;
        // Optimistic local status; the server also echoes control SSE events.
        if (action === 'pause') setRunStatus('paused');
        else if (action === 'resume') setRunStatus('running');
        else if (action === 'cancel') setRunStatus('cancelled');
        // Run this step and Stop both answer a hold; the server's frame follows.
        if (action === 'resume' || action === 'cancel') setRunHold(null);
        return true;
      } catch {
        return false;
      } finally {
        clearTimeout(timeout);
      }
    },
    [],
  );
  /** A control action for the run in flight now. */
  const control = useCallback(
    (action: RunControlAction, message?: string) => controlRun(runIdRef.current, action, message),
    [controlRun],
  );

  const pause = useCallback(() => control('pause'), [control]);
  const resume = useCallback(() => control('resume'), [control]);
  // Steers the server accepted but has not yet spliced into a round. A steer
  // lands at the NEXT round boundary, which can be many seconds away; until
  // the `interjected` event confirms it, this is the only evidence it exists.
  const [pendingSteers, setPendingSteers] = useState<string[]>([]);
  /* A person's steer into a run — the one path for it, whether typed into the
     composer (`interject`) or into the drive strip (a drive turn's controls).
     Accepted, it waits in `pendingSteers` until the server's `interjected`
     echo confirms it spliced. The echo is matched by POSITION, so a steer the
     server accepted without being queued here would consume the confirmation
     meant for another, still-waiting one.

     Queued only if its run is still in flight when the acceptance arrives. A
     run whose last round ended while the request was out never splices it,
     and the turn's end has already cleared the queue: added after that, it
     sat as "waiting to reach AnA" with no run to reach, and the next turn's
     first echo consumed it instead of the steer that echo confirmed. It is
     still reported accepted — the server did accept it — and is lost with the
     run, like any steer the run never reached. */
  const steerRun = useCallback(
    async (runId: string | null, message: string) => {
      const ok = await controlRun(runId, 'interject', message);
      if (ok && runId !== null && runIdRef.current === runId) {
        setPendingSteers(prev => [...prev, message]);
      }
      return ok;
    },
    [controlRun],
  );
  const interject = useCallback(
    (message: string) => steerRun(runIdRef.current, message),
    [steerRun],
  );

  /**
   * A turn that ended here before the server said whether it filed the
   * record — Stop, a timeout, a dropped connection — is shown "not confirmed".
   * The server usually did file it (a stopped turn is recorded as stopped), and
   * the record carries the run id, so ask for it: once shortly after, once
   * more a little later. Only a turn still unconfirmed is updated; anything
   * the server cannot confirm stays unconfirmed, never recorded by default.
   */
  const confirmTurnRecordByRun = useCallback((runId: string, messageId: string) => {
    void (async () => {
      for (const waitMs of RECORD_CONFIRM_WAITS_MS) {
        await new Promise((r) => setTimeout(r, waitMs));
        try {
          const res = await fetch(`/api/ana-ri/turn-records?run_id=${encodeURIComponent(runId)}&limit=1`, {
            headers: getAuthHeaders(),
            credentials: 'include',
          });
          if (!res.ok) return;
          const body = await res.json().catch(() => null);
          const rec = body?.data?.records?.[0];
          const turnRecord = rec ? readTurnRecord({ status: 'recorded', id: rec.id, sha256: rec.recordSha256 }) : undefined;
          if (turnRecord) {
            setMessages((prev) =>
              prev.map((m) => (m.id === messageId && m.turnRecord?.status === 'unconfirmed' ? { ...m, turnRecord } : m)),
            );
            return;
          }
        } catch {
          return;
        }
      }
    })();
  }, []);

  const stop = useCallback(async () => {
    // Cancel server-side too (the fetch abort alone leaves the server
    // generating and running the tool loop to completion — the pre-existing
    // "Stop doesn't stop AnA" gap).
    //
    // AWAITED, deliberately. Fired-and-forgotten, the abort below dropped the
    // socket first, the server recorded the turn as `client_disconnected`, and
    // the cancel then arrived at a run already terminal and was refused. A
    // person pressing Stop was written into the decision lineage as a network
    // event — inverting the one distinction the audit is there to draw. The
    // cancel aborts the run server-side; wait for its acknowledgement,
    // bounded by the control request timeout so a network stall cannot lock
    // Stop or a demonstration queued behind it indefinitely.
    // The screen is another matter, so the drive is halted before the wait.
    const stoppedController = abortRef.current;
    const stoppedRunId = runIdRef.current;
    haltTurnDrive();
    if (stoppedRunId) {
      try {
        await controlRun(stoppedRunId, 'cancel');
      } catch {
        // A failed cancel must not leave the client streaming; abort anyway.
      }
    }
    // The stopped turn may have finished naturally while its cancellation
    // was in flight. A newly started demo owns a different controller.
    if (abortRef.current === stoppedController) stoppedController?.abort();
  }, [controlRun, haltTurnDrive]);
  const stopRef = useRef(stop);
  stopRef.current = stop;

  // Abort any in-flight stream when the hosting panel unmounts — otherwise the
  // fetch keeps the connection (and the server-side generation) alive until
  // completion or the idle timeout.
  //
  // Except a turn that has moved the screen (see drivingRef). AnA moving the
  // person to another screen is what unmounts a panel that owns its
  // conversation, and aborting there killed every driven turn at its first
  // move: the screen changed once, the answer stopped mid-sentence and the
  // server closed the run as `client_disconnected`. A driving turn runs to its
  // end — its moves keep reaching the shell through `onDriveEvent` — and Take
  // over / Stop still end it on request. A turn that was allowed to drive but
  // has not moved is aborted like any other: the person left, not AnA.
  useEffect(() => {
    return () => {
      const loading = threadLoadRef.current;
      threadLoadRef.current = null;
      loading?.abort();
      if (drivingRef.current) return;
      abortRef.current?.abort();
    };
  }, []);

  const reset = useCallback(() => {
    haltTurnDrive();
    abortRef.current?.abort();
    const loading = threadLoadRef.current;
    threadLoadRef.current = null;
    loading?.abort();
    threadLoadErrorRef.current = null;
    setThreadLoadError(null);
    setIsLoadingThread(false);
    threadIdRef.current = null;
    messagesRef.current = [];
    setMessages([]);
    isStreamingRef.current = false;
    setIsStreaming(false);
  }, [haltTurnDrive]);

  const loadThread = useCallback(async (threadId: string) => {
    if (!threadId) return;
    haltTurnDrive();
    abortRef.current?.abort();
    isStreamingRef.current = false;
    setIsStreaming(false);
    threadLoadRef.current?.abort();
    const loading = new AbortController();
    threadLoadRef.current = loading;
    threadLoadErrorRef.current = null;
    setThreadLoadError(null);
    // The selected conversation has not loaded yet. Keeping the last one's
    // transcript/id here let a failed switch silently send into that thread.
    threadIdRef.current = null;
    messagesRef.current = [];
    setMessages([]);
    setIsLoadingThread(true);
    const deadline = historyDeadline(loading);
    try {
      const res = await Promise.race([deadline.promise, fetchHistoryHeaders(threadId, loading.signal)]);
      if (threadLoadRef.current !== loading) return;
      if (!res.ok) {
        // Resolving here made the caller's error branch unreachable, so a 401
        // or a 500 on a real conversation rendered as the "Talk to AnA" empty
        // state: the user was told their conversation was empty when the read
        // had failed. An error is never an empty result.
        console.warn('[useAnaChat] loadThread non-ok:', res.status);
        throw new Error(`loadThread ${res.status}`);
      }
      const body = (await Promise.race([deadline.promise, res.json()])) as {
        messages?: Array<{
          role?: string;
          content?: string;
          metadata?: {
            reasoning?: string;
            toolTrace?: Array<{ tool?: string; label?: string; status?: string; resultSummary?: string }>;
            humanControls?: Array<{ action?: string; message?: string }>;
            plan?: unknown;
            stoppedReason?: unknown;
            rounds?: unknown;
            verification?: unknown;
          } | null;
        }>;
      };
      if (threadLoadRef.current !== loading) return;
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
          // Her last declared plan, as the server validated it. Only the final
          // list is persisted, not when each step changed, so no plan changes
          // are invented for it.
          const plan = m.role === 'assistant' ? readPlanSteps(m.metadata?.plan) : null;
          // Why the turn stopped, when it was not because she was done — so a
          // turn the round limit cut short does not reopen as a finished one.
          const ending = m.role === 'assistant' ? readTurnEnding(m.metadata) : {};
          // What was checked about the answer, as the person was shown it.
          // A message stored before checks were kept has none, and shows none.
          const evidence = m.role === 'assistant' ? readStoredVerification(m.metadata) : undefined;
          return {
            id: `t-${threadId}-${idx}`,
            role: m.role as 'user' | 'assistant',
            text: m.content as string,
            ...(plan ? { plan } : {}),
            ...ending,
            ...(reasoning ? { thinking: reasoning } : {}),
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
            ...(interjections.length > 0 ? { interjections } : {}),
            ...(evidence ? { evidence } : {}),
          };
        });
      threadIdRef.current = threadId;
      messagesRef.current = hydrated;
      setMessages(hydrated);
    } catch (err: any) {
      // Aborting alone cannot cancel an already-resolved response/body. Only
      // the current selection may replace history, fail, or finish loading.
      if (threadLoadRef.current !== loading) return;
      threadLoadErrorRef.current = {
        threadId,
        message: deadline.failureMessage(),
      };
      setThreadLoadError(threadLoadErrorRef.current);
      console.warn('[useAnaChat] loadThread failed:', err?.message);
      throw err;
    } finally {
      deadline.dispose();
      if (threadLoadRef.current === loading) {
        threadLoadRef.current = null;
        setIsLoadingThread(false);
      }
    }
  }, [haltTurnDrive]);

  const send = useCallback(
    async (
      rawText: string,
      attachments?: MessageAttachment[],
      sendOpts?: AnaSendOptions,
    ) => {
      // Read at call time, never from the memoized closure (see optionsRef).
      const options = optionsRef.current;
      const text = rawText.trim();
      if (!text || isStreamingRef.current || threadLoadRef.current || threadLoadErrorRef.current) return;
      drivingRef.current = false;
      /* The run THIS turn started, from its own `run_started`. The drive
         controls below are bound to it, never to `runIdRef.current`: the shell
         holds a turn's controls past the turn (its move queue drains after the
         stream ends), and a report about a move that turn made, read through
         the live ref, was delivered to whichever run was in flight by then —
         telling a newer turn that a move it never made had failed. */
      let turnRunId: string | null = null;
      /* Whether this turn received an enabled `drive_state`. It is what
         releases the shell's drive when the turn ends — moved or not — and it
         is deliberately not `drivingRef`, which only a move sets. */
      let turnDriveEnabled = false;
      /* This turn's run, while it is still the run in flight; otherwise null,
         which `controlRun` answers with false and no request. */
      const ownRun = (): string | null =>
        turnRunId !== null && runIdRef.current === turnRunId ? turnRunId : null;
      // Handed to the shell with every drive event (see DriveTurnControls).
      const driveControls: DriveTurnControls = {
        stop: () => {
          void stopRef.current?.();
        },
        interject: (message: string) => steerRun(ownRun(), message),
        /* The app's report, on its own channel. It used to ride `interject`,
           so a move that failed was recorded as the person's steer and shown
           back to them as "You steered AnA". Not a steer, so not queued as a
           pending one either. */
        reportScreen: (message: string, moveId?: string) =>
          controlRun(ownRun(), 'screen_report', message, moveId),
        /* The server holds her next round until the screen settles each move
           it sent (drive_acks below); a landing settles one without a word
           for the model. */
        moveLanded: (moveId: string) => controlRun(ownRun(), 'move_landed', undefined, moveId),
      };
      /* Armed in `haltDriveRef` once this turn is drive-enabled (see
         haltTurnDrive), and disarmed when the turn ends. */
      const haltThisTurn = () => options.onDriveEvent?.({ type: 'drive_stopped' }, driveControls);

      const sentAt = Date.now();
      const messageKey = `${sentAt}-${++turnSequenceRef.current}`;
      const userMsg: AnaChatMessage = {
        id: `u-${messageKey}`,
        role: 'user',
        text,
        sentAt,
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
      };
      const assistantId = `a-${messageKey}`;

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
      setRunHold(null);
      const sentPolicy = sendOpts?.runPolicy ?? options.runPolicy;
      setTurnRunPolicy(isAnaRunPolicy(sentPolicy) ? sentPolicy : null);

      const abortCtl = new AbortController();
      abortRef.current = abortCtl;

      // Idle-timeout guard: abort if the stream goes silent for too long.
      // `didTimeout` lets the AbortError handler distinguish a timeout from a
      // user-initiated stop so the message reads correctly.
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let didTimeout = false;
      // Set when the server's closing event said whether the turn was recorded;
      // only a turn it did not speak for is looked up afterwards.
      let serverStatedRecord = false;
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
      const ac = sendOpts?.authoringContext ?? options.authoringContext ?? null;
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
        continuation_context: clientContinuationContext(text, messagesRef.current),
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
        conversation_history: messagesRef.current.slice(-10).map(m => ({
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
        // What AnA does between steps (row 74). Omitted when unset, so a host
        // that chooses nothing keeps today's turn; a send's own choice wins.
        run_policy: (sendOpts?.runPolicy ?? options.runPolicy) ?? undefined,
        // Live Drive opt-in — sent only while the toggle is on, so the common
        // case stays byte-identical and the server does zero extra work.
        // Screens closed to this person (launch scope, plan, grants) — AnA's
        // self-drive tools refuse them instead of moving onto a locked panel.
        locked_screens: (() => {
          const locked = getAnaLockedScreens();
          return locked.length > 0 ? locked : undefined;
        })(),
        live_drive: (sendOpts?.liveDrive ?? options.liveDrive) === true ? true : undefined,
        /* This chat's drive events reach the shell, which reports every move
           back — landed, refused or dropped — so the server may wait for the
           screen before AnA's next round. A host without the shell's handler
           reports nothing, and must not be waited on. */
        drive_acks:
          (sendOpts?.liveDrive ?? options.liveDrive) === true && options.onDriveEvent ? true : undefined,
        // Demonstration mode rides only on opted-in turns (the server ignores
        // it otherwise), so a stale mode can never outlive the toggle.
        drive_mode:
          (sendOpts?.liveDrive ?? options.liveDrive) === true &&
          (sendOpts?.driveMode ?? options.driveMode) === 'demo'
            ? 'demo'
            : undefined,
      });

      let streamedText = '';

      try {
        // Include the wait for response headers: starting this only after
        // fetch resolved left a stalled initial request in Planning forever.
        armIdleTimer();
        const res = await fetch('/api/ana-ri/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          credentials: 'include',
          body,
          signal: abortCtl.signal,
        });
        abortCtl.signal.throwIfAborted();

        if (!res.ok || !res.body) {
          /* Carry the server's own reason. A 503 GATEWAY_UNAVAILABLE means the
             deployment has no AI provider configured — nothing about the
             network or the user's connection — and the message below must
             say that, not "unreachable". */
          let code: string | undefined;
          try {
            // Nested ({ error: { code } }) from the route; top-level ({ code })
            // from the platform's usage limiter.
            const j = (await res.clone().json()) as { error?: { code?: string } | string; code?: string };
            code = (typeof j?.error === 'object' ? j.error?.code : undefined) ?? j?.code;
          } catch {
            /* not JSON: keep the status-only error */
          }
          const e = new Error(`Stream request failed: ${res.status}`) as Error & { code?: string; status?: number };
          e.code = code;
          e.status = res.status;
          throw e;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        armIdleTimer();
        // Every server path closes a turn with post_done or error. A stream
        // that ends without either did not finish, whatever it rendered.
        let turnClosed = false;
        while (!turnClosed) {
          const { done, value } = await reader.read();
          // A queued read may settle after reset, switch, or Stop. It must not
          // restore the old thread/run or forward moves into the next turn.
          abortCtl.signal.throwIfAborted();
          if (done) break;
          // Live activity — reset the idle watchdog.
          armIdleTimer();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            // A drive callback can reset the conversation synchronously;
            // ignore the remaining events in that same network chunk too.
            abortCtl.signal.throwIfAborted();
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
              // Capture the run id so the user can pause/interject/cancel it,
              // and bind this turn's drive controls to it (see turnRunId).
              runIdRef.current = typeof event.runId === 'string' ? event.runId : null;
              turnRunId = runIdRef.current;
              setRunStatus('running');
            } else if (event.type === 'approval_required') {
              // AnA has HELD the turn at an action only a person may take.
              // Attaching it to the streaming message reuses the sign-off
              // surface the end-of-turn path already renders, so there is one
              // dialog rather than two to keep in step — the difference is only
              // that this one arrives while she is still waiting for the answer.
              const live = pendingSignoffFromApproval(event);
              if (live) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, pendingSignoffs: [...(m.pendingSignoffs ?? []), live] }
                      : m
                  )
                );
              }
            } else if (event.type === 'approval_decided') {
              // Decided — by this person, by someone else on another instance,
              // or by the window closing. Either way the prompt is stale, and
              // leaving it up would invite a second signature for an action
              // that already has its answer.
              const decidedId = typeof event.toolUseId === 'string' ? event.toolUseId : null;
              if (decidedId) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? {
                          ...m,
                          pendingSignoffs: (m.pendingSignoffs ?? []).filter(
                            p => p.toolUseId !== decidedId
                          ),
                        }
                      : m
                  )
                );
              }
            } else if (event.type === 'paused') {
              setRunStatus('paused');
              setRunHold(readRunHold(event));
            } else if (event.type === 'resumed') {
              setRunStatus('running');
              setRunHold(null);
            } else if (event.type === 'cancelled') {
              setRunStatus('cancelled');
              setRunHold(null);
            } else if (event.type === 'hold_expired') {
              // A Manual hold nobody answered ENDED the turn (the server wrote
              // it finished): no run left to control, and these did not run.
              setRunStatus(null);
              setRunHold({ reason: 'expired', next: frameLabels(event.next) });
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
                // Under Manual a steer may REPLACE the held step: it never ran.
                const replaced = frameLabels(event.replaced);
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? {
                          ...m,
                          interjections: [...(m.interjections ?? []), msg],
                          ...(replaced.length > 0 ? { replacedSteps: [...(m.replacedSteps ?? []), ...replaced] } : {}),
                        }
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
              // Why the loop stopped and how many rounds it ran — only values
              // the server produces; see readTurnEnding. A turn the round limit
              // cut short is not a finished one, and every surface says so.
              const ending = readTurnEnding(event);
              // A turn the loop or the policy stopped has no run left to
              // control or hold: the strip must not offer to resume it.
              if (ending.stoppedReason && ending.stoppedReason !== 'no_more_tools') {
                setRunStatus(null);
                // An expired hold is KEPT until the stream closes: done lands
                // at once after hold_expired and post-processing runs on, and
                // a cleared hold read as "Working" for all of it.
                if (ending.stoppedReason !== 'hold_expired') setRunHold(null);
              }
              // The answer has landed; the server's background finishing work
              // (evidence check, actions, persistence) runs until `post_done`.
              const at = Date.now();
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? {
                        ...m,
                        ...ending,
                        progress: advanceProgress(m.progress, 'finalizing', CLIENT_PHASE_LABELS.finalizing, at),
                      }
                    : m
                )
              );
            } else if (event.type === 'post_done') {
              turnClosed = true;
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
              const turnRecord = readTurnRecord(event.turnRecord);
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
                    turnRecord: turnRecord ?? m.turnRecord,
                  };
                })
              );
              // post_done seals the turn; trailing frames cannot reopen it.
              break;
            } else if (event.type === 'grounding_strip') {
              // What was checked about the answer: the engine's check and
              // AnA's labels, read by the one reader the reload uses too.
              const evidence = readGroundingStrip(event);
              setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, evidence } : m)));
            } else if (
              event.type === 'drive_state' ||
              event.type === 'drive_navigation' ||
              event.type === 'drive_action'
            ) {
              // Live Drive events — forwarded verbatim; the shell validates and
              // applies (v2/liveDrive.ts + v2/surfaceActions.ts). A listener
              // throw must not kill the stream: the turn's answer matters more
              // than the drive.
              if (event.type === 'drive_state') {
                // Once enabled, the turn owes the shell a `drive_turn_end`. A
                // later `drive_state` (a mid-turn promotion to demo mode) never
                // takes that back. Armed for an early stop on the first enable
                // only: a promotion arriving after Stop must not re-arm it.
                if (event.enabled === true && !turnDriveEnabled) {
                  turnDriveEnabled = true;
                  if (abortRef.current === abortCtl) haltDriveRef.current = haltThisTurn;
                }
              } else {
                // A move. Marked BEFORE the shell sees it: applying it is what
                // unmounts a panel that owns this chat, and the unmount must
                // already find the turn driving or it aborts it.
                drivingRef.current = true;
              }
              try {
                options.onDriveEvent?.(event as DriveSseEvent, driveControls);
              } catch {
                /* listener error — drive skips, stream continues */
              }
            } else if (event.type === 'warning') {
              const msg: string = event.message || '';
              // Manual that could not hold is said by the turn's stopped note
              // (with what to do); repeated here it would be said twice.
              if (msg && event.code !== 'MANUAL_UNAVAILABLE') {
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
                              ...(typeof event.toolUseId === 'string' && event.toolUseId
                                ? { toolUseId: event.toolUseId }
                                : {}),
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
              // Resolve the running call this result belongs to — by toolUseId,
              // else the first running call of that name in the result's own
              // step (see the pairing block below; last-in matching was a
              // defect). Prefer the server's authoritative status; fall back to
              // parsing the result for an error envelope when status wasn't sent.
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
                    /* Pair the result with the call that produced it.

                       This used to take the MOST RECENT running call of the same
                       name. The server runs a step's calls concurrently and emits
                       their results in the ORIGINAL call order, so first-reported
                       results were matched last-in — two same-named calls in one
                       step were swapped every time, not by a race. Each query was
                       shown against the other's results, on the very rows kept so
                       a reviewer can see what each step returned.

                       By id when the server sends one. Without it (an older server
                       mid-deploy) the FIRST running call of the name is the right
                       one, precisely because emission follows call order. */
                    const resultId = typeof event.toolUseId === 'string' && event.toolUseId ? event.toolUseId : null;
                    const byId = resultId
                      ? m.toolCalls.findIndex(t => t.toolUseId === resultId && t.status === 'running')
                      : -1;
                    /* The fallback is confined to the result's own step. Running
                       calls are settled only when a turn ends badly, never between
                       steps, so a call a step left running is still "running" in
                       the next one — and first-in matching by name alone would hand
                       it the next step's result. */
                    const resultRound = typeof event.round === 'number' && event.round > 0 ? event.round : undefined;
                    const realIdx =
                      byId !== -1
                        ? byId
                        : m.toolCalls.findIndex(
                            t =>
                              t.name === name &&
                              t.status === 'running' &&
                              /* A row that carries its own id is paired by that id
                                 and nothing else. Once the server has said which
                                 call a result belongs to, guessing by name could
                                 pin it on a sibling — so the name fallback only
                                 ever considers rows announced WITHOUT an id. */
                              !t.toolUseId &&
                              (resultRound === undefined || t.round === undefined || t.round === resultRound)
                          );
                    if (realIdx !== -1) {
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
              // A draft persisted as an authoring document carries its id and
              // program (docs/design/ANA_DOCUMENT_CANVAS.md); the thread reads
              // the document itself from the authoring store, so such a draft
              // is recorded even when the event carries no inline content.
              const authoringDocId: string | undefined =
                typeof event.authoringDocId === 'string' && event.authoringDocId.trim()
                  ? event.authoringDocId.trim()
                  : undefined;
              const programId: string | undefined =
                typeof event.programId === 'string' && event.programId.trim()
                  ? event.programId.trim()
                  : undefined;
              if (content || authoringDocId) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? {
                          ...m,
                          generatedDraft: {
                            title,
                            content,
                            documentType,
                            ...(authoringDocId ? { authoringDocId } : {}),
                            ...(programId ? { programId } : {}),
                          },
                        }
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
              /* The durable interview session id, when the server persisted
                 one. An answer that carries it back as session_id is recorded
                 server-side; flow_state alone is the stateless fallback. */
              const sessionId = typeof event.sessionId === 'string' ? event.sessionId : null;
              if (question && flowState) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, intelligenceQuestion: question, intelligenceFlowState: flowState, intelligenceSessionId: sessionId }
                      : m
                  )
                );
              }
            } else if (event.type === 'intelligence_flow_complete') {
              const completion = event.completion;
              const flowState = event.flowState;
              const sessionId = typeof event.sessionId === 'string' ? event.sessionId : null;
              if (completion) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, intelligenceFlowComplete: completion, intelligenceFlowState: flowState, intelligenceSessionId: sessionId, intelligenceQuestion: undefined }
                      : m
                  )
                );
              }
            } else if (event.type === 'plan' || event.type === 'context_used') {
              // Her declared plan, and what the turn read before answering. Both
              // parsed and applied by pure helpers in anaProgress.ts.
              const at = Date.now();
              const used = event.type === 'context_used' ? readContextUsed(event) : null;
              setMessages(prev =>
                prev.map(m => {
                  if (m.id !== assistantId) return m;
                  if (event.type === 'plan') return applyPlanEvent(m, event, at);
                  return used ? { ...m, contextUsed: used } : m;
                })
              );
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
              // A failed turn is still recorded; say so before the error
              // closes it, so the record line is not lost with the turn.
              const turnRecord = readTurnRecord(event.turnRecord);
              if (turnRecord) {
                serverStatedRecord = true;
                setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, turnRecord } : m)));
              }
              throw streamFailure(event);
            }
          }
        }
        if (!turnClosed) throw new Error('The stream ended before the turn finished');
        // Completion is authoritative even if the transport lingers. Cleanup
        // must not hold the composer open or turn a finished reply into an error.
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      } catch (err: any) {
        // The run this turn was served under, while it is still known: the
        // record of an interrupted turn is looked up by it.
        const interruptedRunId = turnRunId;
        if (interruptedRunId && !serverStatedRecord) confirmTurnRecordByRun(interruptedRunId, assistantId);
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
                interrupted: true,
                interruptedWithPartialResponse: streamedText.trim().length > 0,
                progress: closeProgress(m.progress, 'stopped', Date.now()),
                toolCalls: settleRunningCalls(m.toolCalls, 'Not finished — AnA stopped responding.', Date.now()),
                warnings: [...(m.warnings || []), 'Response timed out'],
                turnRecord: m.turnRecord ?? { status: 'unconfirmed' },
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
                    turnRecord: m.turnRecord ?? { status: 'unconfirmed' },
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
                text: m.text.length > 0 ? m.text : streamRefusalText(err),
                streaming: false,
                statusPhase: undefined,
                completedAt: Date.now(),
                interrupted: true,
                interruptedWithPartialResponse: streamedText.trim().length > 0,
                warnings: streamedText.trim().length > 0
                  ? [...new Set([...(m.warnings || []), partialReplyRecoveryText(err)])]
                  : m.warnings,
                progress: closeProgress(m.progress, 'stopped', Date.now()),
                toolCalls: settleRunningCalls(m.toolCalls, 'Not finished — the turn was interrupted.', Date.now()),
                turnRecord: m.turnRecord ?? { status: 'unconfirmed' },
              };
            })
          );
        }
      } finally {
        clearIdleTimer();
        // Over, so there is nothing left to stop early. By identity: a newer
        // turn may already have armed its own.
        if (haltDriveRef.current === haltThisTurn) haltDriveRef.current = null;
        // A turn the server enabled a drive for tells the shell it is over,
        // whichever way it ended and whether or not it ever moved — the shell
        // engaged its drive on the `drive_state`, and it cannot see another
        // chat instance's streaming state to know when to let go.
        if (abortRef.current === abortCtl) {
          drivingRef.current = false;
          if (turnDriveEnabled) {
            try {
              options.onDriveEvent?.({ type: 'drive_turn_end' }, driveControls);
            } catch {
              /* listener error — the drive is released on the next turn anyway */
            }
          }
        }
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
          setRunHold(null);
          setTurnRunPolicy(null);
          // A steer the run never reached is not pending anymore; it was lost
          // with the run, and the transcript's interjections say which landed.
          setPendingSteers([]);
        }
      }
    },
    [
      isStreaming,
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
      options.runPolicy,
      options.liveDrive,
      options.onDriveEvent,
      options.onArtifactSaved,
      controlRun,
      steerRun,
      confirmTurnRecordByRun,
    ]
  );

  return {
    messages,
    isStreaming,
    send,
    stop,
    runStatus,
    runHold,
    turnRunPolicy,
    pause,
    resume,
    interject,
    pendingSteers,
    reset,
    loadThread,
    threadId: threadIdRef.current,
    isLoadingThread,
    threadLoadError,
  };
}
