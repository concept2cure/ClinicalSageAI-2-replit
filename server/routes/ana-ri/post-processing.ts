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
import type { ToolTraceEntry } from '../../services/ana/tool-trace.js';
import {
  checkEvidenceDiscipline,
  validateResponseStructure,
} from '../../services/ana-ri/enforcement.js';
import { validateEvidence } from '../../services/ana-ri/evidence-validation.js';
import { buildQueueMeta } from '../../services/ana-ri/response-contract.js';
import { saveChatMessage as saveMessage } from '../../services/chat-thread-helpers.js';
import { summarizeAndStoreWorkingMemoryForThread } from '../../services/working-memory.js';
import { getCachedSignalReliability } from '../../services/intelligence/learning-loop-service.js';
import { verifyAnswerGrounding } from '../../services/ana/answer-grounding.js';
import { interceptChatResponse } from '../../services/intelligence/rim-interceptors.js';
import { processResponseActions } from '../../services/ana-guidance-executor.js';
import type { CommandContext } from '../../services/ana-ri/command-executor.js';

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
  /** Raw tool output this turn — evidence corpus for the grounding round. */
  toolEvidenceCorpus: string[];
  /** Gateway message history built for the turn (for working-memory write-back). */
  messages: GatewayMessage[];
  model: string | undefined;
  provider: string | undefined;
  enrichment: { sources: unknown[]; enrichmentMeta?: unknown };
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
    toolEvidenceCorpus,
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
    if (fullContent && streamProjectId && orgId) {
      try {
        const guidance = await processResponseActions(fullContent, {
          projectId:
            typeof streamProjectId === 'string'
              ? Number.parseInt(streamProjectId, 10)
              : streamProjectId,
          organizationId: Number(orgId),
          userId: typeof userId === 'number' ? userId : 0,
          userName: 'AnA',
          threadId: threadId || undefined,
        });
        executedActions = guidance.actions;
        contentForCommandProcessing = guidance.cleanedText || fullContent;
      } catch (e: any) {
        console.warn('[AnA RI Stream] Guidance executor failed:', e?.message);
      }
    }

    // Command executor — execute operational commands (create project, artifact, task, etc.)
    if (contentForCommandProcessing && orgId) {
      try {
        const cmdCtx: CommandContext = {
          userId: typeof userId === 'number' ? userId : 0,
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

    // Run persistence concurrent with the synchronous evidence / structure
    // checks. saveMessage is a DB roundtrip (tens to hundreds of ms); the
    // checks are CPU-only and finish instantly. Awaiting them together
    // collapses the tail to max(db, cpu) instead of db + cpu.
    const persistPromise: Promise<void> =
      orgId && threadId && fullContent
        ? saveMessage(
            threadId, 'assistant', finalAssistantContent, undefined, undefined,
            toolTrace.length > 0 ? { toolTrace } : undefined,
          )
            .then(() => undefined)
            .catch((e: any) => {
              console.error('[AnA RI Stream] Assistant persist failed:', e?.message);
              persistenceFailed = true;
            })
        : Promise.resolve();

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
    // Self-verification round: check the answer's specific claims (trial ids,
    // quoted source text) against the tool evidence actually gathered. No-op
    // when no tools ran.
    const streamGrounding =
      finalAssistantContent && toolEvidenceCorpus.length > 0
        ? verifyAnswerGrounding(finalAssistantContent, toolEvidenceCorpus.join('\n'))
        : null;

    // RIM interception — fire sync, non-blocking, on the cleaned content.
    // Claim metrics are grounded in the structure + evidence checks above so
    // RIM receives an actual turn-quality signal instead of a flat 0.5.
    if (finalAssistantContent && streamProjectId && orgId) {
      const ratedClaimCount = Math.max(
        streamEvidenceCheck?.totalLabels || 0,
        streamStructureCheck && streamStructureCheck.score > 0 ? 1 : 0,
      );
      const qualityRate =
        streamStructureCheck && streamStructureCheck.maxScore > 0
          ? streamStructureCheck.score / streamStructureCheck.maxScore
          : 0.5;
      interceptChatResponse({
        organizationId: Number(orgId),
        projectId: Number(streamProjectId),
        userId: typeof userId === 'number' ? userId : undefined,
        sectionCode,
        assistantMessage: finalAssistantContent,
        claimCount: ratedClaimCount,
        supportedClaimRate: qualityRate,
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

    // Send grounding strip (evidence verdict summary for client UI)
    if (streamEvidenceVerdict) {
      res.write(
        `data: ${JSON.stringify({
          type: 'grounding_strip',
          evidence: streamEvidenceVerdict,
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
