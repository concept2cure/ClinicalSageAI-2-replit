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
 */

import type { Response } from 'express';
import type { GatewayMessage } from '../../services/ai-gateway/types.js';
import type { UserRole } from '../../services/ana-ri/persona.js';
import { buildAssistantMetadata, type ToolTraceEntry } from '../../services/ana/tool-trace.js';
import type { HumanControlEvent } from '../../services/ana/run-control-registry.js';
import {
  checkEvidenceDiscipline,
  validateResponseStructure,
} from '../../services/ana-ri/enforcement.js';
import { validateEvidence } from '../../services/ana-ri/evidence-validation.js';
import { detectUnsupportedClaims } from '../../services/clinical-regulatory-evidence/governance.js';
import { buildTrustSummary } from '../../services/ana-ri/response-contract.js';
import { buildQueueMeta } from '../../services/ana-ri/response-contract.js';
import { saveChatMessage as saveMessage } from '../../services/chat-thread-helpers.js';
import { persistProvenance } from '../../services/evidence/persist-provenance.js';
import type { ProvenanceRecord } from '../../services/evidence/provenance.js';
import { summarizeAndStoreWorkingMemoryForThread } from '../../services/working-memory.js';
import { getCachedSignalReliability } from '../../services/intelligence/learning-loop-service.js';
import { verifyAnswerGrounding } from '../../services/ana/answer-grounding.js';
import { computeRimClaimMetrics } from '../../services/ana/rim-claim-metrics.js';
import { interceptChatResponse } from '../../services/intelligence/rim-interceptors.js';
import { processResponseActions } from '../../services/ana-guidance-executor.js';
import type { CommandContext } from '../../services/ana-ri/command-executor.js';
import { isPositiveIntegerId } from './shared.js';
import { upsertDocumentArtifactVersion } from '../../services/ana/artifactVersionStore.js';
import { toNavigationActions } from '../../services/ana-ri/navigation-actions.js';
import type { NavigationDirective } from '../../../shared/navigation/index.js';

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
  /** Raw tool output this turn — evidence corpus for the grounding round. */
  toolEvidenceCorpus: string[];
  /** Provenance envelopes from evidence tools this turn — persisted to the lineage trail. */
  collectedProvenance: ProvenanceRecord[];
  /**
   * Validated navigation targets `navigate_to` resolved this turn. Surfaced on
   * `post_done` as `actionType: 'navigate'` chips — offered to the user, never
   * performed by the server. See services/ana-ri/navigation-actions.ts.
   */
  collectedNavigation?: NavigationDirective[];
  /** Document drafts emitted this turn — persisted to the governed artifact version history. */
  collectedDrafts: { title: string; content: string; documentType?: string; reasonForChange?: string }[];
  /** Gateway message history built for the turn (for working-memory write-back). */
  messages: GatewayMessage[];
  model: string | undefined;
  provider: string | undefined;
  enrichment: { sources: unknown[]; enrichmentMeta?: unknown };
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
async function persistCollectedDrafts(args: {
  res: Response;
  orgId: string | number | null | undefined;
  streamProjectId: string | number | null | undefined;
  userId: number | undefined;
  threadId: string | undefined;
  collectedDrafts: { title: string; content: string; documentType?: string; reasonForChange?: string }[];
}): Promise<void> {
  const { res, orgId, streamProjectId, userId, threadId, collectedDrafts } = args;
  const projectId =
    streamProjectId != null && streamProjectId !== ''
      ? typeof streamProjectId === 'string'
        ? Number.parseInt(streamProjectId, 10)
        : streamProjectId
      : NaN;
  if (!orgId || !threadId || !Number.isFinite(projectId) || collectedDrafts.length === 0) {
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
    toolEvidenceCorpus,
    collectedProvenance,
    collectedNavigation,
    collectedDrafts,
    messages,
    model,
    provider,
    enrichment,
  } = ctx;
  let persistenceFailed = ctx.persistenceFailed;
  let cleanedFullContent = '';

  try {
    let executedActions: any[] = [];
    let contentForCommandProcessing = fullContent;
    let executedCommands: any[] = [];

    // Guidance executor — auto-create artifacts if response contains action signals
    if (fullContent && streamProjectId && orgId && isPositiveIntegerId(userId)) {
      try {
        const guidance = await processResponseActions(fullContent, {
          projectId:
            typeof streamProjectId === 'string'
              ? Number.parseInt(streamProjectId, 10)
              : streamProjectId,
          organizationId: Number(orgId),
          userId,
          userName: 'AnA',
          threadId: threadId || undefined,
        });
        executedActions = guidance.actions;
        contentForCommandProcessing = guidance.cleanedText || fullContent;
      } catch (e: any) {
        console.warn('[AnA RI Stream] Guidance executor failed:', e?.message);
      }
    }

    // Navigation — the screens AnA resolved this turn become chips the user can
    // activate. Appended after the guidance executor so an artifact the turn
    // actually created still leads. Nothing here moves the client on its own:
    // the server offers a destination, the person takes it.
    if (collectedNavigation && collectedNavigation.length > 0) {
      executedActions = [...executedActions, ...toNavigationActions(collectedNavigation)];
    }

    // Command executor — execute operational commands (create project, artifact, task, etc.)
    if (contentForCommandProcessing && orgId && isPositiveIntegerId(userId)) {
      try {
        const cmdCtx: CommandContext = {
          userId,
          organizationId: Number(orgId),
          activeProjectId: streamProjectId
            ? typeof streamProjectId === 'string'
              ? Number.parseInt(streamProjectId, 10)
              : streamProjectId
            : undefined,
          userName,
          userRole: effectiveRole,
        };
        const { processCommandsInResponse } =
          await import('../../services/ana-ri/command-executor.js');
        const cmdResult = await processCommandsInResponse(contentForCommandProcessing, cmdCtx);
        executedCommands = cmdResult.executedCommands;
        cleanedFullContent = cmdResult.cleanedText ? cmdResult.cleanedText : contentForCommandProcessing;
        if (executedCommands.length > 0) {
          console.log(`[AnA RI Stream] Executed ${executedCommands.length} command(s)`);
        }
      } catch (e: any) {
        console.warn('[AnA RI Stream] Command executor failed:', e?.message);
      }
    }

    const finalAssistantContent =
      cleanedFullContent && cleanedFullContent.trim().length > 0
        ? cleanedFullContent
        : executedActions.length > 0 || executedCommands.length > 0
          ? 'Action executed successfully.'
          : contentForCommandProcessing || fullContent;

    // Self-verification round (computed before persistence so its verdict can
    // be stored on the assistant message): check the answer's specific claims
    // (trial ids, quoted source text) against the tool evidence actually
    // gathered. No-op when no tools ran. It is a fast CPU pass, so running it
    // ahead of the DB roundtrip does not move the latency tail.
    const streamGrounding =
      finalAssistantContent && toolEvidenceCorpus.length > 0
        ? verifyAnswerGrounding(finalAssistantContent, toolEvidenceCorpus.join('\n'))
        : null;

    // Run persistence concurrent with the synchronous evidence / structure
    // checks. saveMessage is a DB roundtrip (tens to hundreds of ms); the
    // checks are CPU-only and finish instantly. Awaiting them together
    // collapses the tail to max(db, cpu) instead of db + cpu. The assistant
    // message carries a hidden metadata record (tool-trace + grounding verdict)
    // so the turn's investigation and self-check survive across turns.
    const persistPromise: Promise<void> =
      orgId && threadId && fullContent
        ? saveMessage(
            threadId, 'assistant', finalAssistantContent, undefined, undefined,
            buildAssistantMetadata(toolTrace, streamGrounding, reasoning, humanControls) as Record<string, unknown> | undefined,
          )
            .then(() => undefined)
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
        projectId: streamProjectId ? Number(streamProjectId) || undefined : undefined,
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
    const streamEvidenceVerdict = finalAssistantContent
      ? validateEvidence(finalAssistantContent, 'ana-ri')
      : null;

    // §14 unsupported-claim linter (clinical-regulatory-evidence governance):
    // a distinct, phrase-shaped prohibition set — "N% approval probability",
    // "FDA usually accepts", "will be approved", "guaranteed approval",
    // "three PPQ batches resolve" — complementary to the evidence-discipline and
    // grounding checks above. Detection-only here: the turn's tokens have already
    // streamed to the client, and these phrase patterns can legitimately appear
    // outside a regulatory-prediction context (e.g. "the change will be approved"
    // in QMS), so it is surfaced on post_done for the client/monitoring to flag,
    // never a hard block that could suppress a valid reply.
    const streamUnsupportedClaims = finalAssistantContent
      ? detectUnsupportedClaims(finalAssistantContent)
      : [];
    if (streamUnsupportedClaims.length > 0) {
      console.warn(
        `[AnA RI Stream] ${streamUnsupportedClaims.length} unsupported claim(s) detected in reply:`,
        streamUnsupportedClaims.map((v) => v.match).join(' | '),
      );
    }

    // RIM interception — fire sync, non-blocking, on the cleaned content.
    // Claim metrics blend the structure + evidence checks with the direct
    // grounding measurement (when claims were checkable) so RIM receives an
    // actual turn-quality signal instead of a flat 0.5.
    if (finalAssistantContent && streamProjectId && orgId) {
      const { claimCount, supportedClaimRate } = computeRimClaimMetrics({
        structure: streamStructureCheck,
        evidence: streamEvidenceCheck,
        grounding: streamGrounding,
      });
      interceptChatResponse({
        organizationId: Number(orgId),
        projectId: Number(streamProjectId),
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

    // Send grounding strip (evidence verdict summary for client UI), with a
    // human-readable one-line trust summary so the user can gauge reliability.
    if (streamEvidenceVerdict) {
      res.write(
        `data: ${JSON.stringify({
          type: 'grounding_strip',
          evidence: streamEvidenceVerdict,
          trust_summary: buildTrustSummary(streamEvidenceVerdict),
        })}\n\n`
      );
    }

    // Cached reliability lookup (5-min TTL) — included in post_done so
    // client UI can render AnA's self-assessed accuracy on this project
    // once the Phase 2 chat shell ships. Failure is silently null.
    const streamReliability =
      streamProjectId && orgId
        ? await getCachedSignalReliability(Number(streamProjectId), Number(orgId)).catch(
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
          streamUnsupportedClaims.length > 0
            ? streamUnsupportedClaims.map((v) => ({ match: v.match, reason: v.reason }))
            : undefined,
        reliability: streamReliability || undefined,
        queueMeta: streamQueueMeta,
      })}\n\n`
    );

    res.end();
  } catch (postErr: any) {
    // If the background flow itself blows up, fall back to a post_done
    // carrying the raw content so the client turn still closes cleanly.
    console.error('[AnA RI Stream] Post-processing failed:', postErr?.message);
    try {
      res.write(
        `data: ${JSON.stringify({
          type: 'post_done',
          cleanedResponse: fullContent || undefined,
          executedActions: undefined,
          executedCommands: undefined,
        })}\n\n`
      );
      res.end();
    } catch {
      /* connection already gone */
    }
  }
}
