/**
 * Refine With Validation Handler
 *
 * Closes the validation → AI refinement loop:
 * 1. Takes original content + structured validation findings
 * 2. Asks AI to revise content addressing the findings
 * 3. Returns revised content with provenance linkage
 *
 * Phase 1: Single-pass refinement using AI gateway.
 * Phase 2: Multi-pass refinement, diff preview, interactive acceptance.
 */

import { eq, and } from 'drizzle-orm';
import { concept2cureArtifacts } from '../../../../shared/schema';
import { unifiedDocuments } from '../../../../shared/schema/unified_workflow';
import { registerActionHandler } from '../action-registry';
import type {
  AIActionHandler,
  AIActionRequest,
  AIActionResponse,
  AIActionExecutionContext,
  AIActionError,
  ValidationFinding,
} from '../../../../shared/types/ai-actions';
import { AIActionHandlerError } from '../../../../shared/types/ai-actions';

const handler: AIActionHandler = {
  actionType: 'refine_with_validation',

  validate(request: AIActionRequest): AIActionError[] {
    const errors: AIActionError[] = [];
    const payload = request.payload || {};

    if (!request.targetId && !payload.content) {
      errors.push({
        code: 'MISSING_CONTENT',
        message: 'Either targetId (to fetch content) or payload.content (inline) is required',
      });
    }

    if (!payload.findings || !Array.isArray(payload.findings) || payload.findings.length === 0) {
      errors.push({
        code: 'MISSING_FINDINGS',
        message: 'payload.findings is required — array of ValidationFinding objects',
      });
    }

    return errors;
  },

  async execute(
    request: AIActionRequest,
    ctx: AIActionExecutionContext
  ): Promise<AIActionResponse> {
    const db = ctx.db as any;
    const payload = request.payload || {};
    const findings = payload.findings as ValidationFinding[];

    // 1. Get original content
    let originalContent: string;
    let title: string;

    if (payload.content && typeof payload.content === 'string') {
      originalContent = payload.content;
      title = (payload.title as string) || 'Inline content';
    } else {
      const fetched = await fetchContent(db, request.targetType, request.targetId!, ctx.user.organizationId);
      originalContent = fetched.content;
      title = fetched.title;
    }

    if (!originalContent || originalContent.trim().length === 0) {
      throw new AIActionHandlerError('EMPTY_CONTENT', 'Cannot refine empty content', 400);
    }

    // 2. Build refinement prompt from findings
    const refinementPrompt = buildRefinementPrompt(
      originalContent,
      findings,
      (payload.preserveStructure as boolean) ?? true,
      request.context?.submissionType as string | undefined
    );

    // 3. Call AI gateway for refinement
    let refinedContent: string;
    try {
      const { ai } = await import('../../../lib/unified-ai-client');
      const systemPrompt = buildRefinementSystemPrompt(request.context?.submissionType as string | undefined);
      refinedContent = await ai.complete(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: refinementPrompt },
        ],
        {
          maxTokens: 4096,
          temperature: 0.3, // Low temperature for faithful revision
          taskType: 'document_drafting',
          callerModule: 'ai-actions/refine-with-validation',
          organizationId: ctx.user.organizationId,
          userId: ctx.user.userId,
        }
      );
    } catch (err) {
      console.error('[AI Actions] AI refinement call failed:', err);
      throw new AIActionHandlerError(
        'AI_REFINEMENT_FAILED',
        'Failed to generate refined content via AI gateway',
        502
      );
    }

    if (!refinedContent || refinedContent.trim().length === 0) {
      throw new AIActionHandlerError(
        'EMPTY_REFINEMENT',
        'AI returned empty refined content',
        502
      );
    }

    // 4. If target exists, save the refined content back
    const updatedObjects = [];
    if (request.targetId && request.targetType === 'artifact') {
      try {
        await db
          .update(concept2cureArtifacts)
          .set({
            content: refinedContent,
            version: (await getArtifactVersion(db, request.targetId, ctx.user.organizationId)) + 1,
            metadata: {
              lastRefinedAt: new Date().toISOString(),
              lastRefinedBy: ctx.user.userId,
              refinementActionId: ctx.actionId,
              findingsAddressed: findings.length,
            },
            updatedAt: new Date(),
          })
          .where(
            typeof request.targetId === 'number' || /^\d+$/.test(String(request.targetId))
              ? eq(concept2cureArtifacts.id, Number(request.targetId))
              : eq(concept2cureArtifacts.artifactId, String(request.targetId))
          );

        updatedObjects.push({
          type: 'artifact',
          id: request.targetId,
          title,
          status: 'refined',
        });
      } catch (err) {
        console.warn('[AI Actions] Failed to persist refined content:', err);
        // Non-fatal — still return the refined content
      }
    }

    // 5. Summarize what was addressed
    const addressedFindings = findings.map((f, i) => ({
      index: i,
      severity: f.severity,
      issueType: f.issueType,
      message: f.message,
    }));

    return {
      success: true,
      actionType: 'refine_with_validation',
      status: 'completed',
      result: {
        refinedContent,
        originalLength: originalContent.length,
        refinedLength: refinedContent.length,
        findingsAddressed: addressedFindings,
        findingsCount: findings.length,
      },
      createdObjects: [],
      updatedObjects,
      warnings: refinedContent.length < originalContent.length * 0.5
        ? ['Refined content is significantly shorter than original — review carefully']
        : [],
      errors: [],
      provenance: {
        actionId: ctx.actionId,
        timestamp: new Date().toISOString(),
        userId: ctx.user.userId,
        organizationId: ctx.user.organizationId,
        projectId: request.projectId,
        sourceSurface: request.sourceSurface,
      },
      nextSuggestedActions: [
        {
          actionType: 'run_validation',
          label: 'Re-validate',
          description: 'Run validation again to confirm findings are addressed',
          payload: {
            targetId: request.targetId,
            targetType: request.targetType,
            content: refinedContent,
          },
        },
        {
          actionType: 'promote_artifact',
          label: 'Promote to document',
          description: 'If satisfied, promote the refined artifact to a governed document',
          payload: { targetId: request.targetId },
        },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Prompt Building
// ---------------------------------------------------------------------------

function buildRefinementSystemPrompt(submissionType?: string): string {
  return `You are a regulatory document specialist. Your task is to revise document content to address specific validation findings while preserving the original intent, structure, and factual accuracy.

Rules:
- Address each finding precisely
- Do not add speculative or unsupported claims
- Preserve all existing citations and references
- Maintain the document's regulatory tone and formatting
- If a finding cannot be fully addressed, add a [REVIEW NEEDED] marker
${submissionType ? `- This is a ${submissionType} submission document — follow applicable regulatory guidelines` : ''}

Return only the revised content, no explanations or meta-commentary.`;
}

function buildRefinementPrompt(
  content: string,
  findings: ValidationFinding[],
  preserveStructure: boolean,
  submissionType?: string
): string {
  const findingsList = findings
    .map((f, i) => {
      let entry = `${i + 1}. [${f.severity.toUpperCase()}] ${f.issueType}: ${f.message}`;
      if (f.recommendation) {
        entry += `\n   Recommendation: ${f.recommendation}`;
      }
      if (f.affectedSection) {
        entry += `\n   Affected section: ${f.affectedSection}`;
      }
      return entry;
    })
    .join('\n');

  return `Revise the following document content to address these validation findings:

FINDINGS TO ADDRESS:
${findingsList}

${preserveStructure ? 'IMPORTANT: Preserve the original document structure, headings, and formatting.\n' : ''}
ORIGINAL CONTENT:
---
${content}
---

Provide the complete revised content with all findings addressed.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchContent(
  db: any,
  targetType: string,
  targetId: string | number,
  organizationId: number
): Promise<{ content: string; title: string }> {
  if (targetType === 'artifact') {
    const [artifact] = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          typeof targetId === 'number' || /^\d+$/.test(String(targetId))
            ? eq(concept2cureArtifacts.id, Number(targetId))
            : eq(concept2cureArtifacts.artifactId, String(targetId)),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!artifact) {
      throw new AIActionHandlerError('ARTIFACT_NOT_FOUND', `Artifact ${targetId} not found`, 404);
    }
    return { content: artifact.content || '', title: artifact.title };
  }

  if (targetType === 'document') {
    const [doc] = await db
      .select()
      .from(unifiedDocuments)
      .where(
        and(
          eq(unifiedDocuments.id, Number(targetId)),
          eq(unifiedDocuments.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!doc) {
      throw new AIActionHandlerError('DOCUMENT_NOT_FOUND', `Document ${targetId} not found`, 404);
    }
    return { content: (doc.metadata as any)?.content || '', title: doc.title };
  }

  throw new AIActionHandlerError('INVALID_TARGET_TYPE', `Unsupported: ${targetType}`, 400);
}

async function getArtifactVersion(
  db: any,
  targetId: string | number,
  organizationId: number
): Promise<number> {
  try {
    const [artifact] = await db
      .select({ version: concept2cureArtifacts.version })
      .from(concept2cureArtifacts)
      .where(
        typeof targetId === 'number' || /^\d+$/.test(String(targetId))
          ? eq(concept2cureArtifacts.id, Number(targetId))
          : eq(concept2cureArtifacts.artifactId, String(targetId))
      )
      .limit(1);
    return artifact?.version || 1;
  } catch {
    return 1;
  }
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

registerActionHandler(handler);
