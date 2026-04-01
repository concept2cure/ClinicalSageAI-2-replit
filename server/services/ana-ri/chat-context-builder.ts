/**
 * AnA RI — Shared Chat Context Builder
 *
 * Eliminates duplication between /chat and /stream endpoints.
 * Both endpoints call buildChatContext() to get the fully assembled
 * system prompt, messages array, and orchestration metadata.
 *
 * Extracted per QA finding H-3.
 *
 * @module server/services/ana-ri/chat-context-builder
 */

import type { Request } from 'express';
import type { GatewayMessage } from '../ai-gateway/types.js';
import { pool } from '../../db.js';
import {
  orchestrate,
  prefetchProjectIntelligence,
  type OrchestratorInput,
  type IntentLens,
  type UserRole,
} from './index.js';
import type { SubmissionType } from './deficiency-taxonomy.js';
import { inferRole } from './role-adapter.js';
import { buildMemoryContextForChat } from '../memory-context-assembler.js';
import { getIntelligencePrefix, buildSectionSpecificPrompt } from '../lumen-context-builder.js';
import { enrichContextForChat } from './context-enrichment.js';
import { getThreadMessages } from '../chat-thread-helpers.js';
import { getFeedbackSummary } from '../intelligence/learning-loop-service.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_LENSES: IntentLens[] = ['auto', 'audit', 'improve', 'risk', 'strategy', 'compare'];
const VALID_ROLES: UserRole[] = ['ceo', 'ra_lead', 'medical_writer', 'clinical_lead', 'cmc_lead', 'investor', 'general'];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatContext {
  messages: GatewayMessage[];
  effectiveMessage: string;
  orchestration: ReturnType<typeof orchestrate>;
  orgId: number | null;
  userId: number | string;
  effectiveRole: UserRole;
  enrichmentSources: string[];
  threadId: string | undefined;
}

// ─── Authoring context builder ───────────────────────────────────────────────

export function buildAuthoringContextBlock(authoring_context: any): string {
  if (!authoring_context || typeof authoring_context !== 'object') return '';

  const ac = authoring_context;
  const parts: string[] = ['<authoring_context>'];
  if (ac.workflowStage) parts.push(`  <workflow_stage>${ac.workflowStage}</workflow_stage>`);
  if (ac.sectionCode) parts.push(`  <section_code>${ac.sectionCode}</section_code>`);
  if (ac.sectionTitle) parts.push(`  <section_title>${ac.sectionTitle}</section_title>`);
  if (ac.moduleCode) parts.push(`  <module_code>${ac.moduleCode}</module_code>`);
  if (ac.artifactId) parts.push(`  <artifact_id>${ac.artifactId}</artifact_id>`);
  if (ac.artifactVersionId) parts.push(`  <artifact_version_id>${ac.artifactVersionId}</artifact_version_id>`);
  if (ac.artifactStatus) parts.push(`  <artifact_status>${ac.artifactStatus}</artifact_status>`);
  if (ac.submissionType) parts.push(`  <submission_type>${ac.submissionType}</submission_type>`);
  if (ac.readiness) {
    parts.push(`  <readiness score="${ac.readiness.score ?? 'unknown'}" blocked="${ac.readiness.blocked ?? false}">`);
    if (ac.readiness.blockers?.length) {
      for (const b of ac.readiness.blockers) {
        parts.push(`    <blocker severity="${b.severity}" code="${b.code}">${b.message}</blocker>`);
      }
    }
    parts.push('  </readiness>');
  }
  if (ac.contradictions?.length) {
    parts.push('  <contradictions>');
    for (const c of ac.contradictions) {
      parts.push(`    <contradiction id="${c.id}" type="${c.type}" severity="${c.severity}">${c.explanation}</contradiction>`);
    }
    parts.push('  </contradictions>');
  }
  parts.push('</authoring_context>');
  return parts.join('\n');
}

// ─── Main builder ────────────────────────────────────────────────────────────

/**
 * Build the complete chat context from a request.
 * Used by both /chat and /stream endpoints.
 */
export async function buildChatContext(req: Request): Promise<ChatContext> {
  const {
    message,
    thread_id,
    intent_lens,
    user_role,
    project_context,
    document_context,
    submission_type,
    conversation_history,
    authoring_context,
  } = req.body;

  // Validate inputs
  const validatedLens: IntentLens | undefined =
    intent_lens && VALID_LENSES.includes(intent_lens) ? (intent_lens as IntentLens) : undefined;
  const validatedRole: UserRole | undefined =
    user_role && VALID_ROLES.includes(user_role) ? (user_role as UserRole) : undefined;

  // Resolve org/user context
  const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
  const userId = (req as any).userId || (req as any).user?.id || 'anonymous';
  const numericOrgId = orgId ? Number(orgId) : null;
  const projectId =
    req.body.project_id || req.body.context?.projectId || req.body.project_context?.projectId;

  // Infer role
  const effectiveRole: UserRole = validatedRole || inferRole({
    screenName: req.body.context?.screenName,
    title: req.body.context?.userTitle,
    department: req.body.context?.department,
  });

  // Build authoring context
  const authoringContextBlock = buildAuthoringContextBlock(authoring_context);

  // Pre-fetch user feedback patterns from learning loop (non-blocking)
  let feedbackContext: OrchestratorInput['_feedbackContext'] = null;
  if (projectId && numericOrgId) {
    try {
      const summary = await getFeedbackSummary(Number(projectId), numericOrgId);
      if (summary.totalFeedback > 0 && summary.topDismissedTypes.length > 0) {
        feedbackContext = {
          totalFeedback: summary.totalFeedback,
          acceptanceRate: summary.acceptanceRate,
          topDismissedTypes: summary.topDismissedTypes,
        };
      }
    } catch (e: unknown) {
      // Non-blocking — feedback context is optional enrichment
    }
  }

  // Pre-fetch project intelligence profile for conversation continuity (non-blocking)
  const intelligenceProfile = await prefetchProjectIntelligence(
    projectId ? Number(projectId) : null,
    numericOrgId,
  );

  // Orchestrate
  const orchestratorInput: OrchestratorInput = {
    message,
    intentLens: validatedLens,
    userRole: effectiveRole,
    projectContext: project_context,
    documentContext: document_context,
    submissionType: submission_type as SubmissionType | undefined,
    conversationHistory: conversation_history,
    _feedbackContext: feedbackContext,
    _projectIntelligenceProfile: intelligenceProfile,
  };
  const orchestration = orchestrate(orchestratorInput);

  // Inject authoring context
  if (authoringContextBlock) {
    orchestration.systemPrompt += `\n\n## Current Authoring Context\n\nYou have access to the user's current authoring context. Use this to provide section-specific, artifact-aware responses.\n\n${authoringContextBlock}`;
  }

  // Inject section-specific ICH M4 guidance
  const sectionCode = authoring_context?.sectionCode || req.body.context?.sectionCode;
  if (sectionCode) {
    const sectionGuide = buildSectionSpecificPrompt(sectionCode);
    if (sectionGuide) {
      orchestration.systemPrompt += `\n\n${sectionGuide}`;
    }
  }

  // Intelligence prefix + memory + enrichment (parallel)
  const [intelligencePrefix, memoryResult, enrichment] = await Promise.all([
    getIntelligencePrefix(numericOrgId ?? undefined, projectId).catch(() => ''),
    buildMemoryContextForChat({
      threadId: thread_id || undefined,
      organizationId: numericOrgId ?? undefined,
      projectId: projectId || undefined,
      query: message,
      limitPerLayer: 4,
      maxChars: 3500,
    }).catch(() => ({ memoryBlock: '', atoms: [], diagnostics: null })),
    enrichContextForChat({
      message,
      projectId,
      organizationId: numericOrgId ?? undefined,
      submissionType: orchestration.detectedSubmissionType || undefined,
    }).catch(() => ({ block: '', sources: [] as string[] })),
  ]);

  const effectiveMessage = enrichment.rewrittenMessage || message;
  const fullSystemPrompt = intelligencePrefix + orchestration.systemPrompt + memoryResult.memoryBlock + enrichment.block;

  // Build messages array
  const messages: GatewayMessage[] = [{ role: 'system', content: fullSystemPrompt }];

  // Load thread history (prefer server, fall back to client)
  let historyLoaded = false;
  if (thread_id) {
    try {
      const serverHistory = await getThreadMessages(thread_id);
      if (serverHistory.length > 0) {
        for (const msg of serverHistory.slice(-20)) {
          messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
        }
        historyLoaded = true;
      }
    } catch { /* Fall through to client history */ }
  }
  if (!historyLoaded && conversation_history && Array.isArray(conversation_history)) {
    for (const msg of conversation_history.slice(-20)) {
      messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }
  }

  // Inject file context
  const fileIds = req.body.file_ids;
  if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
    try {
      const fileResult = await pool.query(
        `SELECT id, original_name, mime_type FROM file_uploads WHERE id = ANY($1)`,
        [fileIds]
      );
      if (fileResult.rows.length > 0) {
        const fileContext = fileResult.rows.map((f: any) =>
          `- ${f.original_name} (${f.mime_type}) [ID: ${f.id}]`
        ).join('\n');
        messages.push({
          role: 'user' as const,
          content: `[The user has attached the following files:\n${fileContext}\nReference these files when relevant.]`,
        });
      }
    } catch { /* Non-blocking */ }
  }

  // Add the actual user message
  messages.push({ role: 'user', content: effectiveMessage });

  return {
    messages,
    effectiveMessage,
    orchestration,
    orgId: numericOrgId,
    userId,
    effectiveRole,
    enrichmentSources: enrichment.sources,
    threadId: thread_id,
  };
}
