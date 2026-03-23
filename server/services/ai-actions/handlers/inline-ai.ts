/**
 * Inline AI Action Handlers — Phase 2 + Intelligence Engine Integration
 *
 * Handles summarize, explain, rewrite, extract, compare actions
 * triggered from structured UI surfaces (tables, forms, file views).
 *
 * Intelligence Engine integration:
 * - Deterministic analysis runs BEFORE LLM calls
 * - LLM receives structured signals, not raw freeform text
 * - Output evaluation gate checks quality before returning
 */

import type {
  AIActionHandler,
  AIActionRequest,
  AIActionResponse,
  AIActionExecutionContext,
  AIActionError,
  AIActionHandlerError,
} from '../../../../shared/types/ai-actions';
import {
  runIntelligencePipeline,
  buildConstrainedPrompt,
  evaluateOutput,
  emitRIMSignals,
} from '../../intelligence-engine/index';

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
  summarize_selection: `You are a regulatory intelligence assistant with access to deterministic intelligence signals. Summarize the provided content using the structured analysis results. Your summary MUST include:
1. Defensibility score and risk level
2. Key claim/evidence alignment findings
3. Critical risk classifications
4. Prioritized actionable points
Be precise, evidence-grounded, and structured.`,

  explain_selection: `You are a regulatory intelligence assistant. Explain the provided content in clear terms for a life-sciences professional. Cover what it means, why it matters, and any regulatory context. If it references specific guidelines (ICH, FDA, EMA), explain the relevance.`,

  rewrite_selection: `You are a regulatory medical writer with access to deterministic intelligence signals. Rewrite the provided content using the structured analysis results provided. You MUST:
1. Moderate any claims flagged as overstated (reduce claim language to match evidence level)
2. Add evidence reference placeholders where claims are flagged as unsupported
3. Resolve any flagged inconsistencies
4. Maintain technical accuracy and regulatory precision
Return only the rewritten text.`,

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

      // ─── Intelligence Engine: Deterministic Analysis First ─────────────
      // For content-analysis actions, run the intelligence pipeline BEFORE LLM.
      // LLM receives structured signals, not raw freeform text.
      const intelligenceActions: InlineActionType[] = [
        'summarize_selection',
        'explain_selection',
        'rewrite_selection',
        'compare_selection',
        'refine_with_validation_findings',
      ];

      let intelligenceAnalysis: ReturnType<typeof runIntelligencePipeline> | null = null;
      if (intelligenceActions.includes(actionType) && content.length > 50) {
        try {
          intelligenceAnalysis = runIntelligencePipeline(content);
        } catch {
          // Graceful degradation: continue without intelligence signals
        }
      }

      // Build prompt based on action type — with structured signals when available
      let userPrompt: string;
      let systemPrompt = SYSTEM_PROMPTS[actionType];

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
        case 'rewrite_selection': {
          if (intelligenceAnalysis) {
            // Feed structured signals to LLM, not raw text
            const constrainedPrompt = buildConstrainedPrompt(intelligenceAnalysis, 'rewrite_section');
            systemPrompt = constrainedPrompt;
            userPrompt = `ORIGINAL CONTENT TO REWRITE:\n\n${content}`;
          } else {
            userPrompt = content;
          }
          break;
        }
        case 'summarize_selection': {
          if (intelligenceAnalysis) {
            const constrainedPrompt = buildConstrainedPrompt(intelligenceAnalysis, 'generate_memo');
            systemPrompt = constrainedPrompt;
            userPrompt = `CONTENT TO SUMMARIZE:\n\n${content}`;
          } else {
            userPrompt = content;
          }
          break;
        }
        case 'explain_selection': {
          if (intelligenceAnalysis) {
            const constrainedPrompt = buildConstrainedPrompt(intelligenceAnalysis, 'explain_risk');
            systemPrompt = constrainedPrompt;
            userPrompt = `CONTENT TO EXPLAIN:\n\n${content}`;
          } else {
            userPrompt = content;
          }
          break;
        }
        default:
          userPrompt = content;
      }

      // Call AI gateway with constrained prompts
      try {
        const { callAIGateway } = await import('../../ai-gateway/gateway.js');

        const aiResult = await callAIGateway({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          model: 'claude',
          maxTokens: actionType === 'summarize_selection' ? 1000 : 2000,
          temperature: actionType === 'rewrite_selection' ? 0.3 : 0.5,
          organizationId: ctx.user.organizationId,
          userId: ctx.user.userId,
          taskType: 'document_analysis',
        });

        let resultContent = aiResult?.content || aiResult?.text || '';

        // ─── Evaluation Gate: Check output quality before returning ─────
        if (intelligenceActions.includes(actionType) && resultContent.length > 0) {
          const evaluation = evaluateOutput(resultContent);
          if (!evaluation.passed && intelligenceAnalysis) {
            // REJECT and REGENERATE with tighter constraints
            try {
              const retryPrompt = `${systemPrompt}\n\nIMPORTANT: Your previous response was rejected for: ${evaluation.rejectionReasons.join('; ')}. You MUST include: a clear verdict/recommendation, prioritized findings, specific evidence references, and actionable guidance.`;
              const retryResult = await callAIGateway({
                messages: [
                  { role: 'system', content: retryPrompt },
                  { role: 'user', content: userPrompt },
                ],
                model: 'claude',
                maxTokens: 2000,
                temperature: 0.2,
                organizationId: ctx.user.organizationId,
                userId: ctx.user.userId,
                taskType: 'document_analysis',
              });
              resultContent = retryResult?.content || retryResult?.text || resultContent;
            } catch {
              // Use original if retry fails
            }
          }
        }

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

        // Include intelligence signals in result for downstream consumers
        if (intelligenceAnalysis) {
          parsedResult.intelligenceSignals = {
            defensibilityScore: intelligenceAnalysis.defensibility.score,
            riskLevel: intelligenceAnalysis.defensibility.riskLevel,
            claimEvidenceRisk: intelligenceAnalysis.claimEvidence.overallRisk,
            overstatedClaims: intelligenceAnalysis.claimEvidence.overstatedCount,
            unsupportedClaims: intelligenceAnalysis.claimEvidence.unsupportedCount,
            consistencyScore: intelligenceAnalysis.consistency.consistencyScore,
            riskClassifications: intelligenceAnalysis.riskClassifications.overallRisk,
            reviewerQuestionCount: intelligenceAnalysis.reviewerQuestions.length,
            evaluationPassed: intelligenceAnalysis.evaluation.passed,
          };

          // Emit RIM signals for pattern accumulation
          parsedResult.rimSignals = emitRIMSignals(intelligenceAnalysis);
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
