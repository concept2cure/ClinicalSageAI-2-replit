/**
 * @fileoverview AnA 1.0 RI Guidance-to-Action Executor
 * @module server/services/ana-guidance-executor
 * @version 2.0.0
 *
 * Converts AnA's high-confidence guidance into real governed actions.
 * Creates real artifacts in concept2cureArtifacts with version tracking,
 * content hashing, and audit trail — or review threads with comments.
 *
 * Confidence gating:
 *   strong      → auto-execute
 *   moderate    → auto-execute (user can undo via lifecycle)
 *   provisional → prepare payload only (no DB mutation)
 *   uncertain   → recommendation only (no execution, no payload)
 *
 * @compliance FDA 21 CFR Part 11 — all executions audit-trailed
 */

import { db } from '../db.js';
import {
  concept2cureArtifacts,
  concept2cureArtifactVersions,
  concept2cureReviewThreads,
  concept2cureThreadComments,
} from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
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
  /** Existing artifact integer ID (for review_thread linking) */
  existingArtifactId?: number;
  /** CTD section code if applicable */
  sectionCode?: string;
  /** The generated content */
  content: string;
  /** Title for the artifact */
  title: string;
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
  /** Whether DB mutation occurred */
  executed: boolean;
  actionType: AnaActionType;
  confidence: AnaConfidenceLevel;
  /** External artifact_id string (e.g. ana_memo_a1b2c3d4) */
  artifactId: string | null;
  /** Integer PK of the created artifact (for FK linking) */
  artifactPk: number | null;
  /** Thread external ID */
  threadId: string | null;
  /** The payload that was/would be executed */
  payload: AnaActionPayload;
  error: string | null;
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

export interface DetectedActionSignal {
  type: AnaActionType;
  confidence: AnaConfidenceLevel;
  title: string;
  content: string;
  sectionCode?: string;
  decisionContext?: string;
  guidanceSummary?: string;
}

const VALID_ACTION_TYPES: Set<string> = new Set([
  'rewrite', 'memo', 'strategy_note', 'reviewer_brief', 'risk_log', 'review_thread',
]);
const VALID_CONFIDENCE: Set<string> = new Set(['strong', 'moderate', 'provisional', 'uncertain']);

// ── Safety limits — prevent runaway artifact creation ──────────────────────
const MAX_ACTIONS_PER_RESPONSE = 5;
const MAX_CONTENT_LENGTH = 100_000; // ~100KB per artifact
const MAX_TITLE_LENGTH = 500;

/**
 * Detect structured action signals in AnA's response text.
 * Primary: looks for ```ana-action JSON blocks.
 * Fallback: looks for <!--ana-action JSON --> HTML comments (LLMs sometimes emit these).
 */
export function detectActionSignals(responseText: string): DetectedActionSignal[] {
  const signals: DetectedActionSignal[] = [];

  // Primary pattern: fenced code block
  const fencedPattern = /```ana-action\s*\n([\s\S]*?)\n```/g;
  // Fallback: HTML comment pattern (LLMs sometimes wrap in comments)
  const commentPattern = /<!--\s*ana-action\s*\n([\s\S]*?)\n\s*-->/g;

  for (const pattern of [fencedPattern, commentPattern]) {
    if (signals.length >= MAX_ACTIONS_PER_RESPONSE) break;
    let match;
    while ((match = pattern.exec(responseText)) !== null) {
      try {
        const raw = match[1].trim();
        const parsed = JSON.parse(raw);

        // Validate required fields and types
        if (
          typeof parsed.type === 'string' &&
          typeof parsed.confidence === 'string' &&
          typeof parsed.title === 'string' &&
          typeof parsed.content === 'string' &&
          VALID_ACTION_TYPES.has(parsed.type) &&
          VALID_CONFIDENCE.has(parsed.confidence) &&
          parsed.title.length > 0 &&
          parsed.content.length > 0
        ) {
          // Enforce safety limits
          const sanitizedTitle = parsed.title.slice(0, MAX_TITLE_LENGTH).replace(/[\x00-\x1f]/g, '');
          const truncatedContent = parsed.content.length > MAX_CONTENT_LENGTH
            ? parsed.content.slice(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated — exceeded maximum length]'
            : parsed.content;

          signals.push({
            type: parsed.type as AnaActionType,
            confidence: parsed.confidence as AnaConfidenceLevel,
            title: sanitizedTitle,
            content: truncatedContent,
            sectionCode: typeof parsed.sectionCode === 'string' ? parsed.sectionCode.slice(0, 50) : undefined,
            decisionContext: typeof parsed.decisionContext === 'string' ? parsed.decisionContext.slice(0, 200) : undefined,
            guidanceSummary: typeof parsed.guidanceSummary === 'string' ? parsed.guidanceSummary.slice(0, 500) : undefined,
          });

          // Stop processing if we hit the max
          if (signals.length >= MAX_ACTIONS_PER_RESPONSE) {
            console.warn(`[AnA Executor] Hit max actions limit (${MAX_ACTIONS_PER_RESPONSE}), ignoring remaining signals`);
            break;
          }
        } else {
          console.warn('[AnA Executor] Action signal missing required fields or invalid type/confidence');
        }
      } catch {
        console.warn('[AnA Executor] Malformed JSON in action signal block, skipping');
      }
    }
  }

  return signals;
}

/**
 * Strip action signal blocks from the response text so they don't
 * render as visible code blocks in the chat UI.
 */
export function stripActionSignals(responseText: string): string {
  return responseText
    .replace(/```ana-action\s*\n[\s\S]*?\n```/g, '')
    .replace(/<!--\s*ana-action\s*\n[\s\S]*?\n\s*-->/g, '')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIDENCE GATING
// ═══════════════════════════════════════════════════════════════════════════════

export function shouldAutoExecute(confidence: AnaConfidenceLevel): boolean {
  return confidence === 'strong' || confidence === 'moderate';
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function makeProvenance(payload: AnaActionPayload) {
  return {
    runId: payload.metadata.runId,
    executedAt: new Date().toISOString(),
    executedBy: payload.userId,
    source: 'ana_guidance' as const,
  };
}

function failResult(payload: AnaActionPayload, error: string): AnaActionResult {
  return {
    success: false,
    executed: false,
    actionType: payload.type,
    confidence: payload.metadata.confidence,
    artifactId: null,
    artifactPk: null,
    threadId: null,
    payload,
    error,
    provenance: makeProvenance(payload),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTOR — ARTIFACT CREATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a real artifact in concept2cureArtifacts with:
 * - Unique external artifactId
 * - Content hash (SHA-256) for integrity
 * - Version 1 snapshot in concept2cureArtifactVersions
 * - Metadata linking back to AnA guidance run
 * - Draft status (lifecycle starting point)
 */
async function executeArtifactCreation(payload: AnaActionPayload): Promise<AnaActionResult> {
  // Pre-flight validation
  if (!payload.content || payload.content.trim().length === 0) {
    return failResult(payload, 'Artifact content is empty');
  }
  if (!payload.title || payload.title.trim().length === 0) {
    return failResult(payload, 'Artifact title is empty');
  }

  const externalId = `ana_${payload.type}_${uuidv4().slice(0, 8)}`;
  const contentHash = createHash('sha256').update(payload.content, 'utf8').digest('hex');

  try {
    // 1. Insert artifact — returns the auto-generated integer PK
    const [artifact] = await db.insert(concept2cureArtifacts).values({
      artifactId: externalId,
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      title: payload.title,
      content: payload.content,
      contentHash,
      type: 'markdown',
      category: 'document',
      status: 'draft',
      version: 1,
      createdById: payload.userId,
      ctdSection: payload.sectionCode || null,
      metadata: {
        anaGenerated: true,
        anaActionType: payload.type,
        confidence: payload.metadata.confidence,
        runId: payload.metadata.runId,
        source: 'ana_guidance',
        decisionContext: payload.metadata.decisionContext,
        guidanceSummary: payload.metadata.guidanceSummary,
        threadId: payload.metadata.threadId,
        conversationId: payload.metadata.conversationId,
      },
    }).returning();

    const artifactPk = artifact.id; // integer PK from serial

    // 2. Insert version snapshot — artifactId here is the integer FK
    await db.insert(concept2cureArtifactVersions).values({
      artifactId: artifactPk,
      organizationId: payload.organizationId,
      version: 1,
      content: payload.content,
      contentHash,
      createdById: payload.userId,
      changeDescription: `AnA 1.0 RI auto-generated ${payload.type.replace(/_/g, ' ')} (confidence: ${payload.metadata.confidence})`,
    });

    console.log(
      `[AnA Executor] Created ${payload.type}: id=${artifactPk}, externalId=${externalId}, project=${payload.projectId}`
    );

    return {
      success: true,
      executed: true,
      actionType: payload.type,
      confidence: payload.metadata.confidence,
      artifactId: externalId,
      artifactPk,
      threadId: null,
      payload,
      error: null,
      provenance: makeProvenance(payload),
    };
  } catch (err: any) {
    console.error(`[AnA Executor] Artifact creation failed:`, err?.message);
    return failResult(payload, err?.message || 'Artifact creation failed');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTOR — REVIEW THREAD CREATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a review thread with an initial comment. Review threads REQUIRE
 * an artifact FK (integer), so this first creates a memo artifact, then
 * attaches the thread to it. Uses Drizzle ORM — no raw SQL.
 */
async function executeReviewThreadCreation(payload: AnaActionPayload): Promise<AnaActionResult> {
  const threadExtId = uuidv4();
  const commentExtId = uuidv4();

  try {
    // Review threads require an artifact. If none provided, create a memo artifact first.
    let artifactPk = payload.existingArtifactId || null;
    let createdArtifactId: string | null = null;

    if (!artifactPk) {
      const memoPayload: AnaActionPayload = {
        ...payload,
        type: 'memo',
        title: `[Review Context] ${payload.title}`,
      };
      const memoResult = await executeArtifactCreation(memoPayload);
      if (!memoResult.success || !memoResult.artifactPk) {
        return failResult(payload, `Could not create backing artifact for review thread: ${memoResult.error}`);
      }
      artifactPk = memoResult.artifactPk;
      createdArtifactId = memoResult.artifactId;
    }

    // Insert review thread via Drizzle ORM
    const [thread] = await db.insert(concept2cureReviewThreads).values({
      threadId: threadExtId,
      orgId: payload.organizationId,
      projectId: payload.projectId,
      artifactId: artifactPk,
      createdById: payload.userId,
      createdByName: payload.userName,
      title: payload.title,
      status: 'open',
      priority: 'high',
    }).returning();

    const threadPk = thread.id; // integer PK

    // Insert initial comment via Drizzle ORM
    await db.insert(concept2cureThreadComments).values({
      commentId: commentExtId,
      orgId: payload.organizationId,
      threadId: threadPk,
      artifactId: artifactPk,
      authorId: payload.userId,
      authorName: payload.userName,
      body: payload.content,
      kind: 'comment',
    });

    console.log(
      `[AnA Executor] Created review thread: threadId=${threadExtId}, artifactPk=${artifactPk}, project=${payload.projectId}`
    );

    return {
      success: true,
      executed: true,
      actionType: 'review_thread',
      confidence: payload.metadata.confidence,
      artifactId: createdArtifactId,
      artifactPk,
      threadId: threadExtId,
      payload,
      error: null,
      provenance: makeProvenance(payload),
    };
  } catch (err: any) {
    console.error(`[AnA Executor] Review thread creation failed:`, err?.message);
    return failResult(payload, err?.message || 'Review thread creation failed');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute an AnA guidance action with confidence gating.
 * Routes to artifact creation or review thread creation.
 * Returns prepared-only payload for provisional/uncertain confidence.
 */
export async function executeGuidanceAction(payload: AnaActionPayload): Promise<AnaActionResult> {
  if (!payload.type || !payload.projectId || !payload.organizationId || !payload.userId) {
    return failResult(payload, 'Missing required fields: type, projectId, organizationId, userId');
  }

  if (!VALID_ACTION_TYPES.has(payload.type)) {
    return failResult(payload, `Unknown action type: ${payload.type}`);
  }

  // Confidence gating — provisional and uncertain do NOT execute
  if (!shouldAutoExecute(payload.metadata.confidence)) {
    console.log(
      `[AnA Executor] confidence=${payload.metadata.confidence} — no execution for ${payload.type}`
    );
    return {
      success: true,
      executed: false,
      actionType: payload.type,
      confidence: payload.metadata.confidence,
      artifactId: null,
      artifactPk: null,
      threadId: null,
      payload,
      error: null,
      provenance: makeProvenance(payload),
    };
  }

  // Route to executor
  if (payload.type === 'review_thread') {
    return executeReviewThreadCreation(payload);
  }

  return executeArtifactCreation(payload);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT PIPELINE INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Process AnA's response for action signals and execute them.
 * Called from the chat pipeline after AI generation.
 *
 * Returns cleaned text (action blocks stripped) and action results.
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

  const executed = actions.filter(a => a.executed).length;
  const prepared = actions.filter(a => !a.executed && !a.error).length;
  const failed = actions.filter(a => a.error).length;
  console.log(
    `[AnA Executor] ${signals.length} signals → ${executed} executed, ${prepared} prepared, ${failed} failed`
  );

  return { cleanedText, actions };
}
