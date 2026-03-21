/**
 * Inline AI Action Handlers — Phase 2
 *
 * Handles summarize, explain, rewrite, extract, compare actions
 * triggered from structured UI surfaces (tables, forms, file views).
 */

import type {
  AIActionHandler,
  AIActionRequest,
  AIActionResponse,
  AIActionExecutionContext,
  AIActionError,
  AIActionHandlerError,
} from '../../../../shared/types/ai-actions';

// ---------------------------------------------------------------------------
// Inline action types (all Phase 2)
// ---------------------------------------------------------------------------

const INLINE_ACTIONS = [
  'summarize_selection',
  'explain_selection',
  'rewrite_selection',
  'extract_structured_data',
  'compare_selection',
  'refine_with_validation_findings',
  'create_followup_task',
  'attach_selection_as_source',
] as const;

type InlineActionType = (typeof INLINE_ACTIONS)[number];

// ---------------------------------------------------------------------------
// System prompts per action type
// ---------------------------------------------------------------------------

const SYSTEM_PROMPTS: Record<InlineActionType, string> = {
  summarize_selection: `You are a regulatory intelligence assistant. Summarize the provided content concisely for a life-sciences professional. Focus on key findings, regulatory implications, and actionable points. Be precise and structured.`,

  explain_selection: `You are a regulatory intelligence assistant. Explain the provided content in clear terms for a life-sciences professional. Cover what it means, why it matters, and any regulatory context. If it references specific guidelines (ICH, FDA, EMA), explain the relevance.`,

  rewrite_selection: `You are a regulatory medical writer. Rewrite the provided content to improve clarity, precision, and regulatory compliance. Maintain the original meaning and technical accuracy. Use appropriate regulatory terminology. Return only the rewritten text.`,

  extract_structured_data: `You are a data extraction assistant for regulatory documents. Extract structured data from the provided content. Return a JSON object with clearly labeled fields. Focus on: dates, identifiers, study parameters, endpoints, populations, dosages, adverse events, and regulatory references.`,

  compare_selection: `You are a regulatory comparison analyst. Compare the provided items and highlight: key differences, similarities, regulatory implications of differences, and recommendations. Present findings in a structured format.`,

  refine_with_validation_findings: `You are a regulatory document refinement assistant. Given the original content and validation findings, produce an improved version that addresses each finding. Preserve the original structure and intent while fixing the identified issues. Explain each change briefly.`,

  create_followup_task: `You are a project management assistant for regulatory workflows. Based on the provided content, generate a clear follow-up task with: title, description, suggested priority (critical/high/medium/low), suggested assignee role, and estimated effort. Return as structured JSON.`,

  attach_selection_as_source: `You are a regulatory evidence assistant. Analyze the provided content and generate metadata suitable for attaching it as a source reference: suggested title, content type, relevant regulatory categories, key topics, and a one-line summary.`,
};

// ---------------------------------------------------------------------------
// Handler implementation
// ---------------------------------------------------------------------------

export function createInlineAIHandler(actionType: InlineActionType): AIActionHandler {
  return {
    actionType,

    validate(request: AIActionRequest): AIActionError[] {
      const errors: AIActionError[] = [];
      const content = request.payload?.content || request.payload?.selection;

      if (!content && actionType !== 'create_followup_task') {
        errors.push({
          code: 'MISSING_CONTENT',
          message: 'No content or selection provided for inline AI action',
          field: 'payload.content',
        });
      }

      if (actionType === 'compare_selection') {
        const items = request.payload?.items;
        if (!items || !Array.isArray(items) || items.length < 2) {
          errors.push({
            code: 'INSUFFICIENT_ITEMS',
            message: 'Compare requires at least 2 items',
            field: 'payload.items',
          });
        }
      }

      if (actionType === 'refine_with_validation_findings') {
        const findings = request.payload?.findings;
        if (!findings || !Array.isArray(findings) || findings.length === 0) {
          errors.push({
            code: 'MISSING_FINDINGS',
            message: 'Validation findings required for refinement',
            field: 'payload.findings',
          });
        }
      }

      return errors;
    },

    async execute(
      request: AIActionRequest,
      ctx: AIActionExecutionContext
    ): Promise<AIActionResponse> {
      const startTime = Date.now();
      const content = (request.payload?.content || request.payload?.selection || '') as string;
      const title = (request.payload?.title || '') as string;

      // Build prompt based on action type
      let userPrompt: string;

      switch (actionType) {
        case 'compare_selection': {
          const items = request.payload?.items as string[];
          userPrompt = `Compare the following ${items.length} items:\n\n${items.map((item, i) => `--- Item ${i + 1} ---\n${item}`).join('\n\n')}`;
          break;
        }
        case 'refine_with_validation_findings': {
          const findings = request.payload?.findings as Array<{ message: string; recommendation: string; severity: string }>;
          userPrompt = `Original content:\n${content}\n\nValidation findings to address:\n${findings.map((f, i) => `${i + 1}. [${f.severity}] ${f.message}\n   Recommendation: ${f.recommendation}`).join('\n')}`;
          break;
        }
        case 'create_followup_task':
          userPrompt = `Based on this context, create a follow-up task:\n\nTitle/Subject: ${title}\nContent: ${content}\nProject context: ${request.context?.documentType || 'regulatory document'}`;
          break;
        default:
          userPrompt = content;
      }

      // Call AI gateway
      try {
        const { callAIGateway } = await import('../../ai-gateway/gateway.js');

        const aiResult = await callAIGateway({
          messages: [
            { role: 'system', content: SYSTEM_PROMPTS[actionType] },
            { role: 'user', content: userPrompt },
          ],
          model: 'claude',
          maxTokens: actionType === 'summarize_selection' ? 500 : 2000,
          temperature: actionType === 'rewrite_selection' ? 0.3 : 0.5,
          organizationId: ctx.user.organizationId,
          userId: ctx.user.userId,
          taskType: 'document_analysis',
        });

        const resultContent = aiResult?.content || aiResult?.text || '';

        // Parse structured output for extract/task actions
        let parsedResult: Record<string, unknown> = { content: resultContent };
        if (actionType === 'extract_structured_data' || actionType === 'create_followup_task' || actionType === 'attach_selection_as_source') {
          try {
            const jsonMatch = resultContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsedResult = { ...JSON.parse(jsonMatch[0]), rawContent: resultContent };
            }
          } catch {
            // Keep raw content if JSON parsing fails
          }
        }

        return {
          success: true,
          actionType,
          status: 'completed',
          result: {
            ...parsedResult,
            executionTimeMs: Date.now() - startTime,
            inputLength: content.length,
          },
          createdObjects: [],
          updatedObjects: [],
          warnings: [],
          errors: [],
          provenance: {
            actionId: ctx.actionId,
            timestamp: new Date().toISOString(),
            userId: ctx.user.userId,
            organizationId: ctx.user.organizationId,
            projectId: request.projectId,
            sourceSurface: request.sourceSurface,
          },
          nextSuggestedActions: getNextSuggestions(actionType),
        };
      } catch (error: any) {
        return {
          success: false,
          actionType,
          status: 'failed',
          result: null,
          createdObjects: [],
          updatedObjects: [],
          warnings: [],
          errors: [{ code: 'AI_GATEWAY_ERROR', message: error.message || 'AI processing failed' }],
          provenance: {
            actionId: ctx.actionId,
            timestamp: new Date().toISOString(),
            userId: ctx.user.userId,
            organizationId: ctx.user.organizationId,
            projectId: request.projectId,
            sourceSurface: request.sourceSurface,
          },
          nextSuggestedActions: [],
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Suggested follow-up actions per type
// ---------------------------------------------------------------------------

function getNextSuggestions(actionType: InlineActionType) {
  switch (actionType) {
    case 'summarize_selection':
      return [
        { actionType: 'explain_selection' as const, label: 'Explain in detail', description: 'Get a deeper explanation' },
        { actionType: 'create_followup_task' as const, label: 'Create task', description: 'Create a follow-up task from this' },
      ];
    case 'explain_selection':
      return [
        { actionType: 'rewrite_selection' as const, label: 'Rewrite', description: 'Improve the content' },
        { actionType: 'extract_structured_data' as const, label: 'Extract data', description: 'Extract structured data' },
      ];
    case 'rewrite_selection':
      return [
        { actionType: 'run_validation' as const, label: 'Validate', description: 'Run compliance validation' },
      ];
    case 'run_validation':
      return [
        { actionType: 'refine_with_validation_findings' as const, label: 'Refine', description: 'Fix validation issues' },
      ];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Export all inline handlers for registry
// ---------------------------------------------------------------------------

export const inlineAIHandlers: AIActionHandler[] = INLINE_ACTIONS.map(createInlineAIHandler);
