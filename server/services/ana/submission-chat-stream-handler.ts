/**
 * Streaming submission-chat handler.
 *
 * SSE-friendly variant of handleSubmissionChat. Same retrieval / project-
 * scoping / verification / proposal-persistence pipeline as the one-shot
 * version, but the LLM call streams tagged-output sections that get routed
 * to the right SSE channel as bytes arrive:
 *
 *   %%ANSWER%%   → emitted as { type: 'delta', channel: 'answer', content }
 *   %%REWRITE%%  → emitted as { type: 'delta', channel: 'rewrite', content }
 *   %%STRUCTURE%%→ buffered, parsed once, surfaced as 'citations' / 'rewrite' / 'proposal' events
 *   %%END%%      → triggers post-processing
 *
 * The non-streaming handler stays the canonical API for callers that want
 * the full structured payload in one response. This handler is for clients
 * that want progressive rendering (chat UI, long rewrites).
 *
 * @module server/services/ana/submission-chat-stream-handler
 */
import { getPool } from '../../db/runtime.js';
import { ensureGateway } from '../../routes/chat/shared.js';
import { ragRouter } from '../ragRouter.js';
import { buildMemoryContextForChat } from '../memory-context-assembler.js';
import { saveChatMessage } from '../chat-thread-helpers.js';
import {
  classifyIntent,
  detectTargetAgency,
  detectSectionReference,
  buildRetrievalQuery,
  buildStreamingSystemPrompt,
  parseStreamingStructure,
  verifyRewriteClaims,
  loadArtifact,
  loadProjectArtifacts,
  loadConversationHistory,
  loadPriorCitations,
  enrichChunksWithArtifactMetadata,
  type SubmissionChatRequest,
  type SubmissionChatIntent,
  type SubmissionChatCitation,
  type SubmissionChatRewrite,
  type CitationRelationship,
  type ConversationTurn,
} from './submission-chat-handler.js';
import {
  TaggedStreamParser,
  type StreamDelta,
} from './submission-chat-stream-parser.js';
import {
  persistRewriteProposal,
  getActiveProposalForThreadArtifact,
} from './submission-chat-proposal-store.js';
import {
  emit as emitMetric,
  countCitationMix,
} from './submission-chat-metrics.js';

const RETRIEVAL_TOP_K = parseInt(
  process.env.ANA_SUBMISSION_CHAT_TOP_K ?? '12',
  10
);
const RETRIEVAL_THRESHOLD = parseFloat(
  process.env.ANA_SUBMISSION_CHAT_THRESHOLD ?? '0.6'
);
const GENERATION_MAX_TOKENS = parseInt(
  process.env.ANA_SUBMISSION_CHAT_MAX_TOKENS ?? '2048',
  10
);
const HISTORY_TURN_LIMIT = parseInt(
  process.env.ANA_SUBMISSION_CHAT_HISTORY_TURNS ?? '8',
  10
);

export type StreamEvent =
  | {
      type: 'metadata';
      threadId: string;
      artifactId: string;
      projectId: number;
      intent: SubmissionChatIntent;
      retrieval: {
        artifactsInScope: number;
        chunksRetrieved: number;
        retrievalQuery: string;
      };
      conversation: {
        historyMessages: number;
        priorCitations: number;
      };
    }
  | {
      type: 'delta';
      channel: 'answer' | 'rewrite';
      content: string;
    }
  | {
      type: 'citations';
      citations: SubmissionChatCitation[];
    }
  | {
      type: 'rewrite';
      rewrite: SubmissionChatRewrite;
    }
  | {
      type: 'proposal';
      proposalId: string | null;
      contentHash: string | null;
      expiresAt: string | null;
    }
  | {
      type: 'confirm_apply';
      artifactId: string;
      proposalId: string | null;
      proposalExpiresAt: string | null;
      hint: 'use_proposal_id' | 'use_prior_rewrite_payload';
      requiredFields: Array<
        'proposalId' | 'proposedContent' | 'reasonForChange' | 'signature'
      >;
      signatureRequired: boolean;
      message: string;
    }
  | {
      type: 'done';
      threadId: string;
      artifactId: string;
      projectId: number;
      model: string;
      provider: string;
      latencyMs: number;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    }
  | {
      type: 'error';
      code: string;
      message: string;
    };

export type StreamEventHandler = (event: StreamEvent) => void;

export async function handleSubmissionChatStream(
  input: SubmissionChatRequest,
  onEvent: StreamEventHandler
): Promise<void> {
  const startedAt = Date.now();

  if (!input.artifactId) {
    onEvent({ type: 'error', code: 'INVALID_REQUEST', message: 'artifactId is required' });
    return;
  }
  if (!input.question || !input.question.trim()) {
    onEvent({ type: 'error', code: 'INVALID_REQUEST', message: 'question is required' });
    return;
  }

  let artifact;
  try {
    artifact = await loadArtifact(input.artifactId, input.organizationId);
  } catch (err: any) {
    onEvent({
      type: 'error',
      code: err?.code || 'ARTIFACT_LOAD_FAILED',
      message: err?.message || 'Failed to load artifact',
    });
    return;
  }
  const projectArtifacts = await loadProjectArtifacts(
    artifact.project_id,
    artifact.organization_id
  );

  // Conversation history + prior-turn citations.
  const [history, priorCitations] = await Promise.all([
    loadConversationHistory(input.threadId, HISTORY_TURN_LIMIT),
    loadPriorCitations(input.threadId, projectArtifacts),
  ]);

  const intent = classifyIntent(input.question);
  const targetAgency = detectTargetAgency(input.question);
  const sectionReference = detectSectionReference(
    input.question,
    artifact.ctd_section
  );

  // confirm_apply short-circuits the LLM — same as the non-streaming path.
  // Emit the directive + done event and return.
  if (intent === 'confirm_apply') {
    const requiresSignature =
      !!(artifact as any).metadata &&
      (artifact as any).metadata.requiresSignature === true;
    const activeProposal = await getActiveProposalForThreadArtifact(
      input.threadId,
      artifact.artifact_id,
      artifact.organization_id
    );
    const hasProposal = !!activeProposal;
    const directive = !hasProposal
      ? 'I do not have a pending rewrite for this artifact in this thread. Generate or refine a rewrite first, then say "apply that".'
      : requiresSignature
        ? 'Ready to apply. To proceed I need a reason for the change and an electronic signature attesting to it.'
        : 'Ready to apply. To proceed I need a reason for the change. An electronic signature is optional but recorded if provided.';

    onEvent({
      type: 'metadata',
      threadId: input.threadId,
      artifactId: artifact.artifact_id,
      projectId: artifact.project_id,
      intent: 'confirm_apply',
      retrieval: {
        artifactsInScope: projectArtifacts.length,
        chunksRetrieved: 0,
        retrievalQuery: input.question,
      },
      conversation: {
        historyMessages: history.length,
        priorCitations: priorCitations.length,
      },
    });
    onEvent({ type: 'delta', channel: 'answer', content: directive });
    onEvent({
      type: 'confirm_apply',
      artifactId: artifact.artifact_id,
      proposalId: activeProposal?.id ?? null,
      proposalExpiresAt: activeProposal?.expiresAt
        ? new Date(activeProposal.expiresAt).toISOString()
        : null,
      hint: hasProposal ? 'use_proposal_id' : 'use_prior_rewrite_payload',
      requiredFields: hasProposal
        ? requiresSignature
          ? ['proposalId', 'reasonForChange', 'signature']
          : ['proposalId', 'reasonForChange']
        : requiresSignature
          ? ['proposedContent', 'reasonForChange', 'signature']
          : ['proposedContent', 'reasonForChange'],
      signatureRequired: requiresSignature,
      message: directive,
    });
    try {
      await saveChatMessage(
        input.threadId,
        'user',
        input.question,
        'submission-chat:confirm-stream'
      );
      await saveChatMessage(
        input.threadId,
        'assistant',
        directive,
        'submission-chat:confirm-stream'
      );
    } catch (e: any) {
      if (e?.code !== '42P01') {
        console.warn(
          '[AnA submission-chat-stream] confirm-apply persist failed:',
          e?.message
        );
      }
    }
    onEvent({
      type: 'done',
      threadId: input.threadId,
      artifactId: artifact.artifact_id,
      projectId: artifact.project_id,
      model: 'submission-chat:confirm',
      provider: 'system',
      latencyMs: Date.now() - startedAt,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    return;
  }

  // Memory + retrieval (same as the non-streaming path).
  const memoryResult = await buildMemoryContextForChat({
    threadId: input.threadId,
    organizationId: artifact.organization_id,
    projectId: artifact.project_id,
    query: input.question,
    limitPerLayer: 4,
    maxChars: 3000,
  });

  const retrievalQuery = buildRetrievalQuery(input.question, history);
  const orgUuid = input.organizationUuid || undefined;
  const validOrgUuid =
    orgUuid && /^[0-9a-f-]{36}$/i.test(orgUuid) ? orgUuid : undefined;

  let rawHits: Array<{ id: string; title: string; content: string; score: number }> = [];
  if (validOrgUuid) {
    const artifactScope = {
      projectId: artifact.project_id,
      organizationUuid: validOrgUuid,
    };
    const primary = ragRouter
      .retrieve({
        query: retrievalQuery,
        intent: 'project_scoped',
        limit: RETRIEVAL_TOP_K,
        threshold: RETRIEVAL_THRESHOLD,
        useReranking: true,
        useMmr: true,
        mmrLambda: 0.7,
        organizationUuid: validOrgUuid,
        artifactScope,
      })
      .catch((err: any) => {
        console.warn(
          '[AnA submission-chat-stream] advanced retrieval failed:',
          err?.message
        );
        return null;
      });

    const useArtifactScan =
      intent === 'rewrite' &&
      typeof artifact.content === 'string' &&
      artifact.content.trim().length > 0;
    const artifactScan = useArtifactScan
      ? ragRouter
          .retrieve({
            query: (artifact.content as string).slice(0, 2000),
            intent: 'project_scoped',
            strategy: 'basic',
            limit: Math.max(4, Math.floor(RETRIEVAL_TOP_K / 2)),
            threshold: RETRIEVAL_THRESHOLD,
            useReranking: true,
            useMmr: false,
            organizationUuid: validOrgUuid,
            artifactScope,
          })
          .catch(() => null)
      : Promise.resolve(null);

    const [primaryCtx, scanCtx] = await Promise.all([primary, artifactScan]);

    const byId = new Map<
      string,
      { id: string; title: string; content: string; score: number }
    >();
    const ingest = (
      docs?: Array<{
        id: string;
        chunkId?: string;
        title: string;
        content: string;
        finalScore: number;
      }>
    ) => {
      if (!docs) return;
      for (const d of docs) {
        const id = d.chunkId || d.id;
        const incoming = {
          id,
          title: d.title,
          content: d.content,
          score: d.finalScore,
        };
        const existing = byId.get(id);
        if (!existing || incoming.score > existing.score)
          byId.set(id, incoming);
      }
    };
    ingest(primaryCtx?.documents);
    if (scanCtx) ingest(scanCtx.documents);

    rawHits = Array.from(byId.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, RETRIEVAL_TOP_K);
  }

  const chunks = await enrichChunksWithArtifactMetadata(rawHits, projectArtifacts);

  // Emit metadata up front so the client can render context before the
  // first token arrives.
  onEvent({
    type: 'metadata',
    threadId: input.threadId,
    artifactId: artifact.artifact_id,
    projectId: artifact.project_id,
    intent,
    retrieval: {
      artifactsInScope: projectArtifacts.length,
      chunksRetrieved: chunks.length,
      retrievalQuery,
    },
    conversation: {
      historyMessages: history.length,
      priorCitations: priorCitations.length,
    },
  });

  const gw = ensureGateway();
  if (!gw || gw.getEnabledProviders().length === 0) {
    onEvent({
      type: 'error',
      code: 'AI_PROVIDER_UNAVAILABLE',
      message: 'No AI providers available. Configure ANTHROPIC_API_KEY.',
    });
    return;
  }

  const systemPrompt =
    buildStreamingSystemPrompt(artifact, projectArtifacts, chunks, {
      intent,
      targetAgency,
      sectionReference,
      history,
      priorCitations,
    }) + (memoryResult.memoryBlock ? `\n${memoryResult.memoryBlock}` : '');

  const conversationTurns = history.map((turn: ConversationTurn) => ({
    role: turn.role,
    content:
      turn.content.length > 1500
        ? `${turn.content.slice(0, 1500)}…`
        : turn.content,
  }));

  // Drive the gateway in streaming mode. Each chunk goes through the parser
  // which routes content to answer/rewrite/structure buffers and emits
  // delta events on the wire.
  const parser = new TaggedStreamParser();

  let gwResponse;
  try {
    gwResponse = await gw.route({
      taskType: 'regulatory_review',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationTurns,
        { role: 'user', content: input.question },
      ],
      maxTokens: GENERATION_MAX_TOKENS,
      temperature: 0.2,
      stream: true,
      onStream: (chunk: string, meta?: { type?: string }) => {
        // Skip thinking deltas — we only stream user-visible text.
        if (meta?.type && meta.type !== 'text') return;
        const deltas = parser.push(chunk);
        for (const d of deltas) {
          onEvent({ type: 'delta', channel: d.channel, content: d.content });
        }
      },
      callerModule: 'ana-submission-chat-stream',
      organizationId: artifact.organization_id,
      userId: input.userId ?? undefined,
    });
  } catch (err: any) {
    onEvent({
      type: 'error',
      code: 'AI_PROVIDER_UNAVAILABLE',
      message: err?.message || 'AI Gateway call failed',
    });
    return;
  }

  // Flush any tail bytes and read the accumulated section bodies.
  const finished = parser.finish();
  for (const d of finished.tailDeltas) {
    onEvent({ type: 'delta', channel: d.channel, content: d.content });
  }

  const answerText = finished.answer.trim();
  const rewriteText = finished.rewrite.trim();
  const structure = parseStreamingStructure(
    finished.structure,
    answerText,
    rewriteText
  );

  const resolvedIntent: SubmissionChatIntent = structure.intent ?? intent;

  // Build citations[] from structure refs ∪ in-prose [SRC-n] mentions.
  const relationshipByRef = new Map<number, CitationRelationship>();
  for (const c of structure.citations) {
    if (c.ref >= 1 && c.ref <= chunks.length) {
      relationshipByRef.set(c.ref, c.relationship);
    }
  }
  const proseRefs = new Set<number>();
  const refPattern = /\[SRC-(\d+)\]/g;
  let m: RegExpExecArray | null;
  const fullProse = `${answerText}\n${rewriteText}`;
  while ((m = refPattern.exec(fullProse)) !== null) {
    const idx = parseInt(m[1], 10);
    if (idx >= 1 && idx <= chunks.length) proseRefs.add(idx);
  }
  for (const ref of proseRefs) {
    if (!relationshipByRef.has(ref)) relationshipByRef.set(ref, 'supports');
  }
  const citations: SubmissionChatCitation[] = Array.from(
    relationshipByRef.entries()
  )
    .sort((a, b) => a[0] - b[0])
    .map(([ref, relationship]) => {
      const c = chunks[ref - 1];
      const snippet =
        c.content.length > 320 ? `${c.content.slice(0, 320)}…` : c.content;
      return {
        artifactId: c.artifactId,
        sectionCode: c.sectionCode,
        pageRef: c.pageRef,
        passageSnippet: snippet,
        relationship,
        title: c.title,
        score: c.score,
      };
    });

  onEvent({ type: 'citations', citations });

  // Rewrite payload: built when the model emitted a %%REWRITE%% block. We
  // pull metadata from the structure JSON, fall back to the detected
  // section/agency hints, and run the same claim verifier the non-streaming
  // path does.
  let rewrite: SubmissionChatRewrite | null = null;
  if (resolvedIntent === 'rewrite' && rewriteText) {
    rewrite = {
      sectionCode: structure.rewriteMetadata?.sectionCode ?? sectionReference,
      targetAgency: structure.rewriteMetadata?.targetAgency ?? targetAgency,
      proposedContent: rewriteText,
      rationale: structure.rewriteMetadata?.rationale ?? '',
    };
    if (chunks.length > 0) {
      const { perParagraph, statusCounts } = verifyRewriteClaims(
        rewriteText,
        chunks
      );
      rewrite.claimVerification = perParagraph;
      rewrite.claimStatusCounts = statusCounts;
    }

    // Persist the proposal and bind the id back so the client can apply via
    // proposalId rather than re-sending content.
    try {
      const handle = await persistRewriteProposal({
        threadId: input.threadId,
        artifactId: artifact.artifact_id,
        artifactPk: artifact.id,
        organizationId: artifact.organization_id,
        projectId: artifact.project_id,
        sectionCode: rewrite.sectionCode,
        targetAgency: rewrite.targetAgency,
        rationale: rewrite.rationale ?? null,
        proposedContent: rewrite.proposedContent,
        claimVerification: rewrite.claimVerification ?? null,
        claimStatusCounts: rewrite.claimStatusCounts ?? null,
        createdBy: input.userId ?? null,
      });
      if (handle) {
        rewrite.proposalId = handle.id;
        rewrite.proposalContentHash = handle.contentHash;
        rewrite.proposalExpiresAt = handle.expiresAt.toISOString();
        onEvent({
          type: 'proposal',
          proposalId: handle.id,
          contentHash: handle.contentHash,
          expiresAt: handle.expiresAt.toISOString(),
        });
      } else {
        onEvent({ type: 'proposal', proposalId: null, contentHash: null, expiresAt: null });
      }
    } catch (err: any) {
      console.warn(
        '[AnA submission-chat-stream] proposal persist failed:',
        err?.message
      );
      onEvent({ type: 'proposal', proposalId: null, contentHash: null, expiresAt: null });
    }

    onEvent({ type: 'rewrite', rewrite });
  }

  // Save the turn into chat_messages + ai_messages so subsequent
  // submission-chat turns see this exchange in their history.
  const modelName = `${gwResponse.provider}/${gwResponse.model}`;
  try {
    await saveChatMessage(input.threadId, 'user', input.question, modelName);
    const persistedAssistant = rewriteText
      ? `${answerText}\n\n${rewriteText}`
      : answerText;
    await saveChatMessage(
      input.threadId,
      'assistant',
      persistedAssistant,
      modelName,
      gwResponse.usage.totalTokens
    );
  } catch (e: any) {
    if (e?.code !== '42P01') {
      console.warn(
        '[AnA submission-chat-stream] chat_messages persist failed:',
        e?.message
      );
    }
  }

  try {
    await getPool().query(
      `INSERT INTO ai_threads (id, organization_id, project_id, created_by)
       VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [
        input.threadId,
        artifact.organization_id,
        artifact.project_id,
        input.userId ?? null,
      ]
    );
    await getPool().query(
      `INSERT INTO ai_messages (thread_id, role, content) VALUES ($1, 'user', $2)`,
      [input.threadId, input.question]
    );
    const assistantContent = rewriteText
      ? `${answerText}\n\n${rewriteText}`
      : answerText;
    await getPool().query(
      `INSERT INTO ai_messages (thread_id, role, content) VALUES ($1, 'assistant', $2)`,
      [input.threadId, assistantContent]
    );
  } catch (e: any) {
    if (e?.code !== '42P01') {
      console.warn(
        '[AnA submission-chat-stream] ai_messages persist failed:',
        e?.message
      );
    }
  }

  emitMetric({
    name: 'submission_chat.turn',
    threadId: input.threadId,
    artifactId: artifact.artifact_id,
    projectId: artifact.project_id,
    organizationId: artifact.organization_id,
    intent: resolvedIntent,
    retrievalStrategy: rawHits.length === 0 ? 'failed' : 'advanced',
    artifactsInScope: projectArtifacts.length,
    chunksRetrieved: chunks.length,
    historyMessages: history.length,
    priorCitations: priorCitations.length,
    citationCount: citations.length,
    citationMix: countCitationMix(citations),
    rewriteEmitted: !!rewrite,
    proposalId: rewrite?.proposalId ?? null,
    claimStatusCounts: rewrite?.claimStatusCounts ?? null,
    streaming: true,
    model: modelName,
    provider: gwResponse.provider,
    latencyMs: Date.now() - startedAt,
    promptTokens: gwResponse.usage.inputTokens,
    completionTokens: gwResponse.usage.outputTokens,
  });

  onEvent({
    type: 'done',
    threadId: input.threadId,
    artifactId: artifact.artifact_id,
    projectId: artifact.project_id,
    model: modelName,
    provider: gwResponse.provider,
    latencyMs: Date.now() - startedAt,
    usage: {
      promptTokens: gwResponse.usage.inputTokens,
      completionTokens: gwResponse.usage.outputTokens,
      totalTokens: gwResponse.usage.totalTokens,
    },
  });
}
