/**
 * Background post-processing for the AnA RI streaming turn.
 *
 * Extracted from stream.ts. Runs after the client already has `done`: the
 * guidance + command executors, assistant-message persistence (with tool-trace
 * metadata), the answer-validation checks (evidence discipline, structure,
 * evidence verdict, and the self-verification grounding round), RIM interception,
 * working-memory write-back, and finally the `post_done` / `grounding_strip`
 * SSE events. Fire-and-forget: callers invoke it with `void` — it owns its own
 * error handling and always closes the stream.
 *
 * What a person is told was checked about the answer is the engine's check
 * (services/ana/turn-verification.ts, 2026-10-04): the strip, `post_done`,
 * the stored message and the sealed turn record all carry the same one.
 */

import type { Response } from 'express';
import type { GatewayMessage } from '../../services/ai-gateway/types.js';
import type { UserRole } from '../../services/ana-ri/persona.js';
import { buildAssistantMetadata, withTurnEnding, type ToolTraceEntry } from '../../services/ana/tool-trace.js';
import type { AnaRunPolicy, HumanControlEvent, PolicyHold, TurnStoppedReason } from '../../services/ana/run-status.js';
import {
  checkEvidenceDiscipline,
  validateResponseStructure,
} from '../../services/ana-ri/enforcement.js';
import { buildTrustSummary } from '../../services/ana-ri/response-contract.js';
import { buildQueueMeta } from '../../services/ana-ri/response-contract.js';
import { saveChatMessage as saveMessage } from '../../services/chat-thread-helpers.js';
import { persistProvenance } from '../../services/evidence/persist-provenance.js';
import type { ProvenanceRecord } from '../../services/evidence/provenance.js';
import { summarizeAndStoreWorkingMemoryForThread } from '../../services/working-memory.js';
import { getCachedSignalReliability } from '../../services/intelligence/learning-loop-service.js';
import { groundingResultOf, type EvidenceEntry } from '../../services/ana/answer-grounding.js';
import { verifyTurnAnswer } from '../../services/ana/turn-verification.js';
import { computeRimClaimMetrics } from '../../services/ana/rim-claim-metrics.js';
import { interceptChatResponse } from '../../services/intelligence/rim-interceptors.js';
import { blocksOnlyAnswer, settleActionBlocks } from '../../services/ana-guidance-executor.js';
import type { CommandContext } from '../../services/ana-ri/command-executor.js';
import { isPositiveIntegerId } from './shared.js';
import { upsertDocumentArtifactVersion } from '../../services/ana/artifactVersionStore.js';
import {
  toNavigationActions,
  toSurfaceActionChips,
  toDemoStartChips,
  type DemoStartDirective,
} from '../../services/ana-ri/navigation-actions.js';
import type { NavigationDirective } from '../../../shared/navigation/index.js';
import type { SurfaceActionDirective } from '../../../shared/navigation/surface-actions.js';
import type { TurnPlanStep } from '../../services/ana/turn-plan.js';
import type { TurnOutcome, TurnRecorder, TurnRecordStatus } from '../../services/ana/turn-record.js';

/**
 * The integer project the turn's project names, resolved ONCE per use (PF-10
 * S6a): an integer as itself, a program UUID through its anchor row, anything
 * else as none. Every step below used to coerce on its own, and
 * Number.parseInt('7abb1c22-…', 10) is 7, a valid, wrong project.
 */
async function turnProjectId(
  streamProjectId: string | number | null | undefined,
  orgId: unknown,
  context: string,
): Promise<number | null> {
  const org = Number(orgId);
  if (streamProjectId === null || streamProjectId === undefined || streamProjectId === '') return null;
  if (!Number.isSafeInteger(org) || org <= 0) return null;
  const { integerProjectForRef } = await import('../../services/c2c/project-ref.js');
  return integerProjectForRef(async () => (await import('../../db.js')).db, { ref: streamProjectId, orgId: org, context });
}

export interface StreamPostProcessingContext {
  res: Response;
  /** Raw model output for the turn (pre-cleaning). */
  fullContent: string;
  /** Whether the user-message persist earlier in the turn already failed. */
  persistenceFailed: boolean;
  streamProjectId: string | number | null | undefined;
  orgId: string | number | null | undefined;
  userId: number | undefined;
  threadId: string | undefined;
  /** req.user?.name, for command attribution. */
  userName: string | undefined;
  effectiveRole: UserRole;
  sectionCode: string | undefined;
  /** Tools run this turn, persisted on the assistant message metadata. */
  toolTrace: ToolTraceEntry[];
  /**
   * AnA's accumulated extended-thinking / reasoning for the turn. Persisted on
   * the assistant message metadata so the thought process survives reload and
   * is auditable (otherwise it is live-only, streamed but never stored).
   */
  reasoning?: string;
  /** Human control actions (pause/resume/interject/cancel) taken this turn. */
  humanControls?: HumanControlEvent[];
  /** The plan AnA last declared this turn, validated; persisted with the message. */
  plan?: TurnPlanStep[];
  /**
   * Why the turn's agentic loop stopped, and how many tool rounds it ran —
   * persisted with the message so a turn the round cap cut short is not read
   * back, by the person or by the next turn, as a finished one.
   */
  stoppedReason?: TurnStoppedReason;
  rounds?: number;
  /**
   * The run policy the turn ran under, the steps a stop left unrun, and AnA's
   * own Manual holds (row 74) — persisted with the message beside the stop, so
   * the dossier can tell her holds from a person's controls.
   */
  runPolicy?: AnaRunPolicy | null;
  pendingSteps?: string[];
  policyHolds?: PolicyHold[];
  /**
   * What AnA had this turn, as the answer check reads it: each successful
   * tool result not written by a model, each web step, the person's message
   * and the project context she was given (answer-grounding.ts).
   */
  toolEvidenceCorpus: EvidenceEntry[];
  /** Provenance envelopes from evidence tools this turn — persisted to the lineage trail. */
  collectedProvenance: ProvenanceRecord[];
  /**
   * Validated navigation targets `navigate_to` resolved this turn. Surfaced on
   * `post_done` as `actionType: 'navigate'` chips — offered to the user, never
   * performed by the server. See services/ana-ri/navigation-actions.ts.
   */
  collectedNavigation?: NavigationDirective[];
  /**
   * Validated surface actions `act_on_screen` resolved this turn. Surfaced on
   * `post_done` as `actionType: 'surface_action'` chips — offered to the user,
   * performed client-side through the one surface-action bus when activated.
   */
  collectedSurfaceActions?: SurfaceActionDirective[];
  /**
   * Demonstrations `start_product_demo` fetched WITHOUT Live Drive this turn.
   * Surfaced on `post_done` as `actionType: 'start_demo'` chips — the client
   * runs the rail's own one-click start when the person activates one.
   */
  collectedDemoStarts?: DemoStartDirective[];
  /** Document drafts emitted this turn — persisted to the governed artifact version history. */
  collectedDrafts: CollectedDraft[];
  /** Gateway message history built for the turn (for working-memory write-back). */
  messages: GatewayMessage[];
  model: string | undefined;
  provider: string | undefined;
  /** The model call whose answer carried the turn's command blocks, for their audit rows. */
  servingModel?: { provider?: string | null; model?: string | null; requestId?: string | null } | null;
  enrichment: { sources: unknown[]; enrichmentMeta?: unknown };
  /**
   * The turn's retained record (services/ana/turn-record.ts), completed here
   * with what only post-processing knows — the answer as stored, its message
   * id, the controls, the drafts and actions — then written before `post_done`
   * so the client is told whether the turn was recorded.
   */
  turnRecorder?: TurnRecorder | null;
  /** The person pressed Stop: the record's outcome is `stopped`, not `answered`. */
  stopped?: boolean;
  /** Seals and writes the record; never rejects. */
  fileTurnRecord?: (outcome: TurnOutcome) => Promise<TurnRecordStatus>;
}

/**
 * Persist the turn's document drafts to the governed artifact version history,
 * emitting an `artifact_version_saved` SSE event per newly-saved version.
 *
 * Skipped silently when org/project/thread context is missing — project_id is
 * NOT NULL, so a null projectId means no row, no error, which is intended. Every
 * upsert is wrapped so a DB failure never propagates (and so never blocks the
 * caller's `post_done`).
 */
/* Exported for its own test. The three ways a draft can fail to reach the
   version history — no project context, an unchanged content hash, and a
   database failure — are indistinguishable to the client, so what this function
   does and does NOT announce is the whole contract. */
export interface CollectedDraft {
  title: string;
  content: string;
  documentType?: string;
  reasonForChange?: string;
  /**
   * Set when the draft is ALREADY an authoring document (the
   * draft_authoring_document tool wrote authoring_documents/authoring_sections
   * with provenance in the same transaction). The authoring store is the one
   * document store for the launch catalog (docs/design/ANA_DOCUMENT_CANVAS.md),
   * so such a draft is never written into concept2cure_artifacts as well —
   * report canvases and the legacy generate_document path are unchanged.
   */
  authoringDocId?: string;
  programId?: string;
}

export async function persistCollectedDrafts(args: {
  res: Response;
  orgId: string | number | null | undefined;
  streamProjectId: string | number | null | undefined;
  userId: number | undefined;
  threadId: string | undefined;
  collectedDrafts: CollectedDraft[];
}): Promise<void> {
  const { res, orgId, streamProjectId, userId, threadId } = args;
  /* A draft that already IS an authoring document needs no artifact version
     and must not draw the "could not be saved" caveat either: it was saved,
     durably, by the tool that produced it. Filtered before any project logic. */
  const collectedDrafts = args.collectedDrafts.filter((d) => !d.authoringDocId);
  if (!orgId || !threadId || collectedDrafts.length === 0) {
    return;
  }
  /* The ADR-0011 coercion hazard, live on this exact line until now:
     `Number.parseInt('7abb1c22-…', 10) === 7`, so a draft produced in a
     UUID-keyed program conversation was FILED UNDER integer project 7 — a
     valid, wrong row — whenever the program UUID began with digits, and
     silently dropped whenever it did not. Fail-closed parse instead; a
     genuine program UUID resolves through the projects.regulatory_program_id
     anchor so drafts from the live UUID spine are captured too. */
  /* The one resolution of the turn's project (services/c2c/project-ref.ts): an
     integer as itself, a program through its anchor row, the lowest id, the
     one intake links, so a draft versions under the same project every export
     reads. Not strict: a failed read leaves the draft unfiled, and the caveat
     below says so. */
  const projectId = await turnProjectId(streamProjectId, orgId, 'ana-ri.persistCollectedDrafts');
  if (projectId == null) {
    /* No project to file under. The rail says "Drafted <title>" — saying
       nothing here leaves the user believing a version was durably recorded.
       Same honesty contract as the write-failure warning below: name exactly
       what is false (the SAVE), never discard the on-screen draft. */
    try {
      if (!res.writableEnded) {
        for (const draft of collectedDrafts) {
          if (!draft.content) continue;
          res.write(
            `data: ${JSON.stringify({
              type: 'warning',
              message: `${draft.title} was drafted but could not be saved to the version history — no project is linked to this conversation.`,
            })}\n\n`,
          );
        }
      }
    } catch {
      /* The client is gone; nothing further to tell. */
    }
    return;
  }
  for (const draft of collectedDrafts) {
    if (!draft.content) continue;
    try {
      const saved = await upsertDocumentArtifactVersion({
        organizationId: Number(orgId),
        projectId,
        userId: typeof userId === 'number' ? userId : null,
        anaThreadId: threadId,
        title: draft.title,
        content: draft.content,
        documentType: draft.documentType,
        reasonForChange: draft.reasonForChange,
      });
      if (saved.created) {
        res.write(
          `data: ${JSON.stringify({
            type: 'artifact_version_saved',
            artifactId: saved.artifactId,
            version: saved.version,
            contentHash: saved.contentHash,
            title: draft.title,
          })}\n\n`
        );
      }
    } catch (e: any) {
      console.warn('[AnA RI Stream] Draft version persistence failed:', e?.message);
      /* Tell the person, not just the log.
       *
       * AnA announces the deliverable — the rail renders "Drafted <title>" —
       * and until now a failure to write its governed artifact version was a
       * server-side console line and nothing else. Someone could close the
       * session believing a draft was durably recorded when no version row
       * exists. In a Part 11 context that is the product overstating what it
       * did, which is the one thing it must not do.
       *
       * A `warning` rather than an `error`: the draft itself is real and still
       * on screen, and discarding it would lose work. What is false is the
       * impression that it was SAVED, so the caveat names exactly that and
       * nothing more. No error detail — `e.message` is an internal database
       * string and customer copy is not where it belongs.
       *
       * Never throws: this sits on the path to `post_done`, and a caveat that
       * prevented the turn from closing would be a worse defect than the one
       * it reports. */
      try {
        if (!res.writableEnded) {
          res.write(
            `data: ${JSON.stringify({
              type: 'warning',
              message: `${draft.title} was drafted but could not be saved to the version history.`,
            })}\n\n`
          );
        }
      } catch {
        /* The client is gone. The draft failing to save is already logged. */
      }
    }
  }
}

/**
 * Run the deferred post-processing flow and close the stream. Never rejects:
 * on any internal failure it falls back to a `post_done` carrying the raw
 * content so the client turn still closes cleanly.
 */
export async function runStreamPostProcessing(ctx: StreamPostProcessingContext): Promise<void> {
  const {
    res,
    fullContent,
    streamProjectId,
    orgId,
    userId,
    threadId,
    userName,
    effectiveRole,
    sectionCode,
    toolTrace,
    reasoning,
    humanControls,
    plan,
    stoppedReason,
    rounds,
    runPolicy,
    pendingSteps,
    policyHolds,
    toolEvidenceCorpus,
    collectedProvenance,
    collectedNavigation,
    collectedSurfaceActions,
    collectedDemoStarts,
    collectedDrafts,
    messages,
    model,
    provider,
    servingModel,
    enrichment,
    turnRecorder,
    stopped,
    fileTurnRecord,
  } = ctx;
  let persistenceFailed = ctx.persistenceFailed;
  const turnOutcome: TurnOutcome = stopped ? 'stopped' : 'answered';
  // Set once the record is filed, so a failure after that point cannot file
  // the same turn a second time.
  let turnRecord: TurnRecordStatus | undefined;
  let cleanedFullContent = '';

  try {
    let executedActions: any[] = [];
    let contentForCommandProcessing = fullContent;
    let executedCommands: any[] = [];
    // The turn's project, resolved once for every step below (PF-10 S6a).
    const projectId = await turnProjectId(streamProjectId, orgId, 'ana-ri.post-processing');

    // AnA's ```ana-action blocks: each one she is confident in becomes a
    // create_artifact PROPOSAL through the command partition, never a write
    // (P0-12 residual, 2026-10-01; until then this created the artifact, and a
    // review thread in the person's name, unasked). The proposals join
    // executedCommands, which is what the client's sign-off prompt reads. The
    // answer says what became of each block (settleActionBlocks, shared with
    // POST /api/chat): proposed and not yet saved, or not saved and why.
    if (fullContent && orgId && isPositiveIntegerId(userId)) {
      try {
        const settled = await settleActionBlocks(fullContent, {
          // The turn's project, resolved once (PF-10 S6a).
          projectId,
          organizationId: Number(orgId),
          userId,
          userName,
          userRole: effectiveRole,
          threadId: threadId || undefined,
          servingModel: servingModel ?? null,
        });
        executedCommands = [...settled.proposals];
        contentForCommandProcessing = settled.answer;
      } catch (e: any) {
        console.warn('[AnA RI Stream] Action-block proposals failed:', e?.message);
      }
    }

    // Navigation — the screens AnA resolved this turn become chips the user can
    // activate. Appended after the guidance executor so an artifact the turn
    // actually created still leads. Nothing here moves the client on its own:
    // the server offers a destination, the person takes it.
    if (collectedNavigation && collectedNavigation.length > 0) {
      executedActions = [...executedActions, ...toNavigationActions(collectedNavigation)];
    }

    // Surface actions — the on-screen operations AnA resolved this turn become
    // chips too, under the identical offered-not-performed contract. (Under
    // Live Drive the stream already applied them; the chip remains the
    // transcript record and the re-run affordance.)
    if (collectedSurfaceActions && collectedSurfaceActions.length > 0) {
      executedActions = [...executedActions, ...toSurfaceActionChips(collectedSurfaceActions)];
    }

    // Demonstration starts — a script fetched without Live Drive becomes the
    // "Start demonstration" chip; the same offered-not-performed contract.
    if (collectedDemoStarts && collectedDemoStarts.length > 0) {
      executedActions = [...executedActions, ...toDemoStartChips(collectedDemoStarts)];
    }

    // Command executor — execute operational commands (create project, artifact, task, etc.)
    if (contentForCommandProcessing && orgId && isPositiveIntegerId(userId)) {
      try {
        const cmdCtx: CommandContext = {
          userId,
          organizationId: Number(orgId),
          activeProjectId: projectId ?? undefined,
          userName,
          userRole: effectiveRole,
          servingModel: servingModel ?? null,
        };
        const { processCommandsInResponse } =
          await import('../../services/ana-ri/command-executor.js');
        const cmdResult = await processCommandsInResponse(contentForCommandProcessing, cmdCtx);
        executedCommands = [...executedCommands, ...cmdResult.executedCommands];
        cleanedFullContent = cmdResult.cleanedText ? cmdResult.cleanedText : contentForCommandProcessing;
        if (cmdResult.executedCommands.length > 0) {
          console.info(`[AnA RI Stream] Dispatched ${cmdResult.executedCommands.length} command(s)`);
        }
      } catch (e: any) {
        console.warn('[AnA RI Stream] Command executor failed:', e?.message);
      }
    }

    const finalAssistantContent =
      cleanedFullContent && cleanedFullContent.trim().length > 0
        ? cleanedFullContent
        : executedActions.length > 0 || executedCommands.length > 0
          ? blocksOnlyAnswer(executedCommands)
          : contentForCommandProcessing || fullContent;

    // What was checked about the answer (computed before persistence so it is
    // stored on the assistant message): the engine's check of its identifiers,
    // regulations, quotes and figures against what AnA had this turn, the
    // verdicts it states, and her own evidence labels. One CPU pass, so running
    // it ahead of the DB roundtrip does not move the latency tail. The older
    // grounding summary (RIM metrics, the timeline) is the check, when AnA
    // consulted something.
    const verification = finalAssistantContent ? verifyTurnAnswer(finalAssistantContent, toolEvidenceCorpus) : null;
    const streamGrounding =
      verification && verification.check.basis === 'sources' ? groundingResultOf(verification.check) : null;
    const assistantMetadata = withTurnEnding(
      buildAssistantMetadata(toolTrace, streamGrounding, reasoning, humanControls, plan),
      { stoppedReason, rounds, runPolicy, pendingSteps, policyHolds },
    ) as Record<string, unknown> | undefined;

    // Run persistence concurrent with the synchronous evidence / structure
    // checks. saveMessage is a DB roundtrip (tens to hundreds of ms); the
    // checks are CPU-only and finish instantly. Awaiting them together
    // collapses the tail to max(db, cpu) instead of db + cpu. The assistant
    // message carries a hidden metadata record (tool-trace + grounding verdict)
    // so the turn's investigation and self-check survive across turns.
    let assistantMessageId: number | null = null;
    const persistPromise: Promise<void> =
      orgId && threadId && fullContent
        ? saveMessage(
            threadId, 'assistant', finalAssistantContent, undefined, undefined,
            verification ? { ...(assistantMetadata ?? {}), verification } : assistantMetadata,
          )
            .then((id) => {
              assistantMessageId = id;
            })
            .catch((e: any) => {
              console.error('[AnA RI Stream] Assistant persist failed:', e?.message);
              persistenceFailed = true;
            })
        : Promise.resolve();

    // Durable provenance: persist this turn's evidence citations to the lineage
    // trail (data_lineage_records), targeting the answer. Fire-and-forget — the
    // bridge never throws, and an audit-write hiccup must never affect the turn.
    if (orgId && threadId && collectedProvenance && collectedProvenance.length > 0) {
      void persistProvenance(collectedProvenance, {
        organizationId: Number(orgId),
        projectId: projectId ?? undefined,
        targetObjectType: 'answer',
        targetObjectId: threadId,
        targetField: new Date().toISOString(),
        targetTitle: 'AnA answer',
        createdById: typeof userId === 'number' ? userId : undefined,
        aiModelUsed: model,
      });
    }

    // Evidence discipline + structure checks are synchronous — run inline.
    const streamEvidenceCheck = finalAssistantContent
      ? checkEvidenceDiscipline(finalAssistantContent)
      : null;
    const streamStructureCheck = finalAssistantContent
      ? validateResponseStructure(finalAssistantContent)
      : null;
    const streamEvidenceVerdict = verification?.labels ?? null;

    // The verdicts the answer states — the §14 prohibitions ("will be
    // approved", "85% approval probability") and the verdict shapes ("ready
    // to file", "fully compliant") — are in the check, and so on the strip
    // the person reads. Named, never blocked: the tokens have already
    // streamed, and a phrase can be legitimate in context ("the change will
    // be approved" in QMS). Before 2026-10-04 they reached only a log line and
    // a `post_done` field no client read.
    const statedVerdicts = verification?.check.verdicts ?? [];

    // RIM interception — fire sync, non-blocking, on the cleaned content.
    // Claim metrics blend the structure + evidence checks with the direct
    // grounding measurement (when claims were checkable) so RIM receives an
    // actual turn-quality signal instead of a flat 0.5.
    if (finalAssistantContent && projectId !== null && orgId) {
      const { claimCount, supportedClaimRate } = computeRimClaimMetrics({
        structure: streamStructureCheck,
        evidence: streamEvidenceCheck,
        grounding: streamGrounding,
      });
      interceptChatResponse({
        organizationId: Number(orgId),
        projectId,
        userId: typeof userId === 'number' ? userId : undefined,
        sectionCode,
        assistantMessage: finalAssistantContent,
        claimCount,
        supportedClaimRate,
        model: model || 'unknown',
        provider: provider || 'unknown',
      });
    }

    // Working-memory write-back — threshold-gated, non-blocking.
    // Reuses the gateway message history already built for the turn and
    // appends the cleaned assistant reply so the summarizer sees the full
    // exchange, not just the prefix.
    if (threadId && orgId && finalAssistantContent) {
      const writebackMessages = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }))
        .concat({ role: 'assistant', content: finalAssistantContent });
      void summarizeAndStoreWorkingMemoryForThread({
        threadId,
        organizationId: Number(orgId),
        messages: writebackMessages,
        // Recorded so the nightly consolidation job can promote this thread's
        // memory into project_memory_entries; null when the stream had no
        // project scope.
        projectId,
      });
    }

    // Wait for persistence to settle before emitting warning/post_done so
    // `persistenceFailed` reflects the actual DB outcome.
    await persistPromise;

    // Durable Document Studio version history: persist each draft emitted this
    // turn to the governed artifact tables so its version lineage survives the
    // session. Delegated to a helper so a DB hiccup NEVER blocks post_done and so
    // the per-draft loop doesn't inflate this function's complexity.
    await persistCollectedDrafts({
      res,
      orgId,
      streamProjectId,
      userId,
      threadId,
      collectedDrafts,
    });

    // The turn's record, completed and written before post_done so the client
    // can say whether it was recorded. The answer is recorded as the person
    // was given it (streamed) and as the conversation stored it.
    if (fileTurnRecord) {
      turnRecorder?.setAnswer({ stored: finalAssistantContent || null });
      turnRecorder?.setMessageIds({ assistant: assistantMessageId });
      turnRecorder?.setControls(humanControls);
      turnRecorder?.setOutputs({ drafts: collectedDrafts, executedActions, executedCommands });
      turnRecorder?.setVerification(verification);
      if (persistenceFailed) turnRecorder?.warn('The conversation could not save this turn; the record holds it.');
      turnRecord = await fileTurnRecord(turnOutcome);
    }

    // Warn client if thread persistence failed
    if (persistenceFailed) {
      res.write(
        `data: ${JSON.stringify({ type: 'warning', message: 'Thread persistence failed' })}\n\n`
      );
    }

    // Build queue metadata
    const streamQueueMeta = buildQueueMeta({
      threadId,
      persistenceFailed,
    });

    // The strip the person reads: the engine's check, AnA's own labels beside
    // it, and one line saying both.
    if (verification) {
      res.write(
        `data: ${JSON.stringify({
          type: 'grounding_strip',
          evidence: verification.labels,
          check: verification.check,
          trust_summary: buildTrustSummary(verification.labels, verification.check),
        })}\n\n`
      );
    }

    // Cached reliability lookup (5-min TTL) — included in post_done so
    // client UI can render AnA's self-assessed accuracy on this project
    // once the Phase 2 chat shell ships. Failure is silently null.
    const streamReliability =
      projectId !== null && orgId
        ? await getCachedSignalReliability(projectId, Number(orgId)).catch(
            () => null,
          )
        : null;

    // Send post_done event — deferred metadata from background post-processing
    res.write(
      `data: ${JSON.stringify({
        type: 'post_done',
        cleanedResponse: finalAssistantContent || undefined,
        executedActions: executedActions.length > 0 ? executedActions : undefined,
        executedCommands: executedCommands.length > 0 ? executedCommands : undefined,
        enrichmentSources: enrichment.sources.length > 0 ? enrichment.sources : undefined,
        enrichmentMeta: (enrichment as any).enrichmentMeta || undefined,
        evidence: streamEvidenceVerdict || undefined,
        check: verification?.check,
        evidenceDiscipline: streamEvidenceCheck
          ? {
              compliant: streamEvidenceCheck.compliant,
              labels: streamEvidenceCheck.totalLabels,
              hasOverclaims: streamEvidenceCheck.hasOverclaims,
            }
          : undefined,
        structure: streamStructureCheck
          ? {
              valid: streamStructureCheck.valid,
              score: streamStructureCheck.score,
              maxScore: streamStructureCheck.maxScore,
            }
          : undefined,
        grounding:
          streamGrounding && streamGrounding.checked > 0
            ? {
                checked: streamGrounding.checked,
                grounded: streamGrounding.grounded,
                unsupported: streamGrounding.unsupported,
              }
            : undefined,
        unsupportedClaims:
          statedVerdicts.length > 0 ? statedVerdicts.map((v) => ({ match: v.text, reason: v.reason })) : undefined,
        reliability: streamReliability || undefined,
        queueMeta: streamQueueMeta,
        turnRecord,
      })}\n\n`
    );

    res.end();
  } catch (postErr: any) {
    // If the background flow itself blows up, fall back to a post_done
    // carrying the raw content so the client turn still closes cleanly.
    console.error('[AnA RI Stream] Post-processing failed:', postErr?.message);
    // The turn still happened. It is recorded with what is known; the stored
    // answer stays whatever was set before the failure, and the record says
    // post-processing did not finish.
    if (fileTurnRecord && !turnRecord) {
      turnRecorder?.warn(`Post-processing did not finish: ${String(postErr?.message ?? postErr).slice(0, 500)}`);
      turnRecord = await fileTurnRecord(turnOutcome);
    }
    try {
      res.write(
        `data: ${JSON.stringify({
          type: 'post_done',
          cleanedResponse: fullContent || undefined,
          executedActions: undefined,
          executedCommands: undefined,
          turnRecord,
        })}\n\n`
      );
      res.end();
    } catch {
      /* connection already gone */
    }
  }
}
