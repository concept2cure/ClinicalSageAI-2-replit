/**
 * @fileoverview AnA 1.0 RI Guidance-to-Action Executor
 * @module server/services/ana-guidance-executor
 * @version 1.0.0
 *
 * @description
 * Converts AnA's high-confidence guidance into real governed actions.
 * This is the execution bridge between AnA's intelligence layer and
 * the platform's artifact/workflow/audit infrastructure.
 *
 * Execution flow:
 *   AnA response → detect action signals → confidence gate → execute → return artifact/thread IDs
 *
 * Confidence gating:
 *   strong    → auto-execute allowed
 *   moderate  → auto-execute OR one-step confirm
 *   provisional → prepare action payload only (no execution)
 *   uncertain → recommendation only (NO execution)
 *
 * @compliance FDA 21 CFR Part 11 — all executions logged to audit trail
 */

import { db } from '../db.js';
import { concept2cureArtifacts, concept2cureArtifactVersions } from '../../shared/schema.js';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type AnaActionType =
  | 'rewrite'
  | 'memo'
  | 'strategy_note'
  | 'reviewer_brief'
  | 'risk_log'
  | 'review_thread';

export type AnaConfidenceLevel = 'strong' | 'moderate' | 'provisional' | 'uncertain';

export interface AnaActionPayload {
  type: AnaActionType;
  projectId: number;
  organizationId: number;
  userId: number;
  userName: string;
  /** Existing artifact to update (for rewrites) */
  artifactId?: string;
  /** CTD section code if applicable */
  sectionCode?: string;
  /** The generated content */
  content: string;
  /** Title for the artifact */
  title: string;
  /** Execution metadata */
  metadata: {
    runId: string;
    source: 'ana_guidance';
    confidence: AnaConfidenceLevel;
    threadId?: string;
    conversationId?: string;
    decisionContext?: string;
    guidanceSummary?: string;
  };
}

export interface AnaActionResult {
  success: boolean;
  executed: boolean;
  actionType: AnaActionType;
  confidence: AnaConfidenceLevel;
  /** Created artifact ID (null if not executed) */
  artifactId: string | null;
  /** Created artifact version ID */
  versionId: string | null;
  /** Created thread ID (for review_thread actions) */
  threadId: string | null;
  /** The payload that was/would be executed */
  payload: AnaActionPayload;
  /** Error message if execution failed */
  error: string | null;
  /** Provenance for audit trail */
  provenance: {
    runId: string;
    executedAt: string;
    executedBy: number;
    source: 'ana_guidance';
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Structured action block format that AnA can embed in responses.
 * Format: ```ana-action\n{JSON}\n```
 */
export interface DetectedActionSignal {
  type: AnaActionType;
  confidence: AnaConfidenceLevel;
  title: string;
  content: string;
  sectionCode?: string;
  decisionContext?: string;
  guidanceSummary?: string;
}

/**
 * Detect structured action signals in AnA's response text.
 * Looks for ```ana-action JSON blocks embedded in the response.
 */
export function detectActionSignals(responseText: string): DetectedActionSignal[] {
  const signals: DetectedActionSignal[] = [];
  const pattern = /```ana-action\s*\n([\s\S]*?)\n```/g;
  let match;

  while ((match = pattern.exec(responseText)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.type && parsed.confidence && parsed.title && parsed.content) {
        signals.push({
          type: parsed.type,
          confidence: parsed.confidence,
          title: parsed.title,
          content: parsed.content,
          sectionCode: parsed.sectionCode,
          decisionContext: parsed.decisionContext,
          guidanceSummary: parsed.guidanceSummary,
        });
      }
    } catch {
      // Malformed JSON — skip this block
      console.warn('[AnA Executor] Malformed action signal block, skipping');
    }
  }

  return signals;
}

/**
 * Strip action signal blocks from the response text so they don't
 * render as visible code blocks in the chat UI.
 */
export function stripActionSignals(responseText: string): string {
  return responseText.replace(/```ana-action\s*\n[\s\S]*?\n```/g, '').trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIDENCE GATING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determines whether an action should be auto-executed based on confidence.
 *
 * strong    → auto-execute
 * moderate  → auto-execute (user can undo via artifact lifecycle)
 * provisional → prepare only (return payload, do not execute)
 * uncertain → no execution, recommendation only
 */
export function shouldAutoExecute(confidence: AnaConfidenceLevel): boolean {
  return confidence === 'strong' || confidence === 'moderate';
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTOR — ARTIFACT CREATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a governed artifact creation action.
 * Creates a real artifact in concept2cureArtifacts with version tracking,
 * content hashing, and audit trail.
 */
async function executeArtifactCreation(payload: AnaActionPayload): Promise<AnaActionResult> {
  const runId = payload.metadata.runId;
  const artifactId = `ana_${payload.type}_${uuidv4().slice(0, 8)}`;
  const versionId = uuidv4();
  const contentHash = createHash('sha256').update(payload.content, 'utf8').digest('hex');

  const artifactTypeMap: Record<AnaActionType, string> = {
    rewrite: 'markdown',
    memo: 'markdown',
    strategy_note: 'markdown',
    reviewer_brief: 'markdown',
    risk_log: 'markdown',
    review_thread: 'markdown', // thread creation handled separately
  };

  const categoryMap: Record<AnaActionType, string> = {
    rewrite: 'document',
    memo: 'document',
    strategy_note: 'document',
    reviewer_brief: 'document',
    risk_log: 'document',
    review_thread: 'document',
  };

  try {
    // 1. Create the artifact
    const [artifact] = await db.insert(concept2cureArtifacts).values({
      artifactId,
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      title: payload.title,
      content: payload.content,
      type: artifactTypeMap[payload.type],
      category: categoryMap[payload.type],
      status: 'draft',
      createdBy: payload.userId,
      ctdSection: payload.sectionCode || null,
      metadata: {
        anaGenerated: true,
        anaActionType: payload.type,
        confidence: payload.metadata.confidence,
        runId,
        source: 'ana_guidance',
        decisionContext: payload.metadata.decisionContext,
        guidanceSummary: payload.metadata.guidanceSummary,
        threadId: payload.metadata.threadId,
        conversationId: payload.metadata.conversationId,
      },
    }).returning();

    // 2. Create version snapshot
    await db.insert(concept2cureArtifactVersions).values({
      versionId,
      artifactId,
      organizationId: payload.organizationId,
      version: 1,
      content: payload.content,
      contentHash,
      createdBy: payload.userId,
      changeDescription: `AnA 1.0 RI auto-generated ${payload.type.replace(/_/g, ' ')} (confidence: ${payload.metadata.confidence})`,
    });

    console.log(
      `[AnA Executor] Created ${payload.type} artifact: ${artifactId} (project=${payload.projectId}, confidence=${payload.metadata.confidence})`
    );

    return {
      success: true,
      executed: true,
      actionType: payload.type,
      confidence: payload.metadata.confidence,
      artifactId,
      versionId,
      threadId: null,
      payload,
      error: null,
      provenance: {
        runId,
        executedAt: new Date().toISOString(),
        executedBy: payload.userId,
        source: 'ana_guidance',
      },
    };
  } catch (err: any) {
    console.error(`[AnA Executor] Artifact creation failed for ${payload.type}:`, err?.message);

    return {
      success: false,
      executed: false,
      actionType: payload.type,
      confidence: payload.metadata.confidence,
      artifactId: null,
      versionId: null,
      threadId: null,
      payload,
      error: err?.message || 'Artifact creation failed',
      provenance: {
        runId,
        executedAt: new Date().toISOString(),
        executedBy: payload.userId,
        source: 'ana_guidance',
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTOR — REVIEW THREAD CREATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a review thread creation action.
 * Creates a real review thread with an initial comment in the
 * concept2cureReviewThreads / concept2cureThreadComments tables.
 */
async function executeReviewThreadCreation(payload: AnaActionPayload): Promise<AnaActionResult> {
  const runId = payload.metadata.runId;
  const threadId = uuidv4();
  const commentId = uuidv4();

  try {
    // Insert review thread
    await db.execute({
      sql: `INSERT INTO concept2cure_review_threads
            (thread_id, organization_id, artifact_id, created_by_id, title, status, priority, created_at)
            VALUES ($1, $2, $3, $4, $5, 'open', 'high', NOW())`,
      args: [
        threadId,
        payload.organizationId,
        payload.artifactId || null,
        payload.userId,
        payload.title,
      ],
    });

    // Insert initial comment
    await db.execute({
      sql: `INSERT INTO concept2cure_thread_comments
            (comment_id, thread_id, author_id, author_name, body, kind, created_at)
            VALUES ($1, $2, $3, $4, $5, 'comment', NOW())`,
      args: [
        commentId,
        threadId,
        payload.userId,
        payload.userName,
        payload.content,
      ],
    });

    console.log(
      `[AnA Executor] Created review thread: ${threadId} (project=${payload.projectId}, confidence=${payload.metadata.confidence})`
    );

    return {
      success: true,
      executed: true,
      actionType: 'review_thread',
      confidence: payload.metadata.confidence,
      artifactId: null,
      versionId: null,
      threadId,
      payload,
      error: null,
      provenance: {
        runId,
        executedAt: new Date().toISOString(),
        executedBy: payload.userId,
        source: 'ana_guidance',
      },
    };
  } catch (err: any) {
    console.error(`[AnA Executor] Review thread creation failed:`, err?.message);

    return {
      success: false,
      executed: false,
      actionType: 'review_thread',
      confidence: payload.metadata.confidence,
      artifactId: null,
      versionId: null,
      threadId: null,
      payload,
      error: err?.message || 'Review thread creation failed',
      provenance: {
        runId,
        executedAt: new Date().toISOString(),
        executedBy: payload.userId,
        source: 'ana_guidance',
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute an AnA guidance action with confidence gating.
 *
 * This is the main entry point. It:
 * 1. Validates the payload
 * 2. Checks confidence gating
 * 3. Routes to the appropriate executor
 * 4. Returns a governed result with IDs and provenance
 *
 * If confidence is provisional or uncertain, returns a prepared payload
 * without executing.
 */
export async function executeGuidanceAction(payload: AnaActionPayload): Promise<AnaActionResult> {
  // Validate required fields
  if (!payload.type || !payload.projectId || !payload.organizationId || !payload.userId) {
    return {
      success: false,
      executed: false,
      actionType: payload.type,
      confidence: payload.metadata.confidence,
      artifactId: null,
      versionId: null,
      threadId: null,
      payload,
      error: 'Missing required fields: type, projectId, organizationId, userId',
      provenance: {
        runId: payload.metadata.runId,
        executedAt: new Date().toISOString(),
        executedBy: payload.userId || 0,
        source: 'ana_guidance',
      },
    };
  }

  // Confidence gating
  if (!shouldAutoExecute(payload.metadata.confidence)) {
    console.log(
      `[AnA Executor] Confidence=${payload.metadata.confidence} — prepared payload only (no execution) for ${payload.type}`
    );
    return {
      success: true,
      executed: false,
      actionType: payload.type,
      confidence: payload.metadata.confidence,
      artifactId: null,
      versionId: null,
      threadId: null,
      payload,
      error: null,
      provenance: {
        runId: payload.metadata.runId,
        executedAt: new Date().toISOString(),
        executedBy: payload.userId,
        source: 'ana_guidance',
      },
    };
  }

  // Route to appropriate executor
  if (payload.type === 'review_thread') {
    return executeReviewThreadCreation(payload);
  }

  // All other types create artifacts
  return executeArtifactCreation(payload);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT PIPELINE INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Process AnA's response text for action signals and execute them.
 * This is called from the chat response pipeline after AnA generates a response.
 *
 * Returns:
 * - The cleaned response text (action blocks stripped)
 * - Array of action results (executed or prepared)
 */
export async function processResponseActions(
  responseText: string,
  context: {
    projectId: number;
    organizationId: number;
    userId: number;
    userName: string;
    threadId?: string;
    conversationId?: string;
  }
): Promise<{
  cleanedText: string;
  actions: AnaActionResult[];
}> {
  const signals = detectActionSignals(responseText);

  if (signals.length === 0) {
    return { cleanedText: responseText, actions: [] };
  }

  const cleanedText = stripActionSignals(responseText);
  const actions: AnaActionResult[] = [];

  for (const signal of signals) {
    const payload: AnaActionPayload = {
      type: signal.type,
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      userName: context.userName,
      content: signal.content,
      title: signal.title,
      sectionCode: signal.sectionCode,
      metadata: {
        runId: uuidv4(),
        source: 'ana_guidance',
        confidence: signal.confidence,
        threadId: context.threadId,
        conversationId: context.conversationId,
        decisionContext: signal.decisionContext,
        guidanceSummary: signal.guidanceSummary,
      },
    };

    const result = await executeGuidanceAction(payload);
    actions.push(result);
  }

  console.log(
    `[AnA Executor] Processed ${signals.length} action signals: ${actions.filter(a => a.executed).length} executed, ${actions.filter(a => !a.executed).length} prepared`
  );

  return { cleanedText, actions };
}
