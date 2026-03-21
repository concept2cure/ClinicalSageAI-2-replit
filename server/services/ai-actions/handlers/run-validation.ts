/**
 * Run Validation Handler
 *
 * Executes validation against an artifact or document and returns structured findings.
 * Integrates with existing RealTimeValidationService.
 *
 * Phase 1: Structured validation with findings mapped to ValidationFinding contract.
 * Phase 2: Multi-validator orchestration, cross-document validation, eCTD package validation.
 */

import { registerActionHandler } from '../action-registry';
import { fetchContentForProcessing } from '../shared-utils';
import type {
  AIActionHandler,
  AIActionRequest,
  AIActionResponse,
  AIActionExecutionContext,
  AIActionError,
  ValidationFinding,
  ValidationReport,
} from '../../../../shared/types/ai-actions';
import { AIActionHandlerError } from '../../../../shared/types/ai-actions';

const handler: AIActionHandler = {
  actionType: 'run_validation',

  validate(request: AIActionRequest): AIActionError[] {
    const errors: AIActionError[] = [];
    const hasInlineContent = request.payload?.content && typeof request.payload.content === 'string';
    if (!request.targetId && !hasInlineContent) {
      errors.push({
        code: 'MISSING_TARGET',
        message: 'targetId is required (or provide payload.content for inline validation)',
      });
    }
    if (!hasInlineContent && (!request.targetType || !['artifact', 'document'].includes(request.targetType))) {
      errors.push({
        code: 'INVALID_TARGET_TYPE',
        message: 'targetType must be "artifact" or "document" (unless using inline content)',
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

    // 1. Fetch content to validate
    const { content, title, documentType } = await fetchContentForProcessing(
      db,
      request.targetType,
      request.targetId,
      ctx.user.organizationId,
      payload
    );

    if (!content || content.trim().length === 0) {
      throw new AIActionHandlerError(
        'EMPTY_CONTENT',
        'Cannot validate empty content',
        400
      );
    }

    // 2. Run validation using the real-time validation service
    let validationResult;
    try {
      // Dynamically import to avoid circular deps and handle service availability
      const { realTimeValidationService } = await import('../../realTimeValidationService');
      validationResult = await realTimeValidationService.validateContent(
        ctx.actionId,       // sessionId
        content,
        documentType || 'regulatory_submission',
        true,               // immediateMode — skip debounce
        ctx.user.organizationId,
        typeof request.targetId === 'number' ? request.targetId : undefined,
        (payload.agency as string) || undefined
      );
    } catch (err) {
      // If validation service is unavailable, run basic structural validation
      console.warn('[AI Actions] RealTimeValidationService unavailable, falling back to basic validation:', err);
      validationResult = runBasicValidation(content, documentType || 'regulatory_submission');
    }

    // 3. Map to standard ValidationFinding format
    const findings: ValidationFinding[] = mapToFindings(validationResult);
    const report: ValidationReport = {
      isValid: validationResult.isValid,
      complianceScore: validationResult.complianceScore,
      findings,
      documentType: documentType || 'regulatory_submission',
      validatedAt: new Date().toISOString(),
    };

    // 4. Determine suggested next actions based on findings
    const criticalCount = findings.filter((f) => f.severity === 'critical').length;
    const majorCount = findings.filter((f) => f.severity === 'major').length;

    const nextActions = [];
    if (criticalCount > 0 || majorCount > 0) {
      nextActions.push({
        actionType: 'refine_with_validation' as const,
        label: 'Refine with AI',
        description: `Address ${criticalCount + majorCount} critical/major findings using AI refinement`,
        payload: {
          targetId: request.targetId,
          targetType: request.targetType,
          findings: findings.filter(
            (f) => f.severity === 'critical' || f.severity === 'major'
          ),
        },
      });
    }
    if (validationResult.isValid) {
      nextActions.push({
        actionType: 'promote_artifact' as const,
        label: 'Promote to document',
        description: 'Validation passed — promote this artifact to a governed document',
        payload: { targetId: request.targetId },
      });
    }

    return {
      success: true,
      actionType: 'run_validation',
      status: 'completed',
      result: report as unknown as Record<string, unknown>,
      createdObjects: [],
      updatedObjects: [
        {
          type: request.targetType,
          id: request.targetId!,
          title,
          status: validationResult.isValid ? 'validated' : 'needs_review',
        },
      ],
      warnings: validationResult.isValid
        ? []
        : [`${findings.length} validation finding(s) detected`],
      errors: [],
      provenance: {
        actionId: ctx.actionId,
        timestamp: new Date().toISOString(),
        userId: ctx.user.userId,
        organizationId: ctx.user.organizationId,
        projectId: request.projectId,
        sourceSurface: request.sourceSurface,
      },
      nextSuggestedActions: nextActions,
    };
  },
};

// ---------------------------------------------------------------------------
// Validation Result Mapping
// ---------------------------------------------------------------------------

function mapToFindings(validationResult: any): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  // Map issues from RealTimeValidationService format
  if (validationResult.issues) {
    for (const issue of validationResult.issues) {
      findings.push({
        severity: mapSeverity(issue.severity || issue.type),
        issueType: mapIssueType(issue.category || issue.type),
        message: issue.message,
        affectedSection: issue.section || undefined,
        position: issue.position || undefined,
        recommendation: issue.fix || issue.suggestion || `Review and address: ${issue.message}`,
        confidence: issue.confidence || 0.8,
      });
    }
  }

  // Map suggestions as minor/info findings
  if (validationResult.suggestions) {
    for (const suggestion of validationResult.suggestions) {
      findings.push({
        severity: 'minor',
        issueType: mapIssueType(suggestion.type),
        message: suggestion.text,
        recommendation: suggestion.replacement || suggestion.reasoning || suggestion.text,
        confidence: suggestion.confidence || 0.7,
      });
    }
  }

  return findings;
}

function mapSeverity(input: string): ValidationFinding['severity'] {
  const map: Record<string, ValidationFinding['severity']> = {
    critical: 'critical',
    error: 'critical',
    major: 'major',
    warning: 'major',
    minor: 'minor',
    info: 'info',
  };
  return map[input?.toLowerCase()] || 'minor';
}

function mapIssueType(input: string): ValidationFinding['issueType'] {
  const map: Record<string, ValidationFinding['issueType']> = {
    content: 'content',
    terminology: 'terminology',
    compliance: 'compliance',
    citation: 'citation',
    completeness: 'completeness',
    formatting: 'formatting',
    grammar: 'content',
    regulatory: 'compliance',
    clarity: 'content',
    consistency: 'content',
  };
  return map[input?.toLowerCase()] || 'content';
}

// ---------------------------------------------------------------------------
// Basic Fallback Validation
// ---------------------------------------------------------------------------

function runBasicValidation(content: string, documentType: string): any {
  const issues: any[] = [];
  const wordCount = content.split(/\s+/).length;

  // Minimum content length
  if (wordCount < 50) {
    issues.push({
      type: 'warning',
      message: `Content is very short (${wordCount} words). Regulatory documents typically require more detail.`,
      severity: 'major',
      category: 'completeness',
    });
  }

  // Check for placeholder text
  const placeholderPatterns = [
    /\[INSERT\]/gi,
    /\[TODO\]/gi,
    /\[TBD\]/gi,
    /lorem ipsum/gi,
    /PLACEHOLDER/gi,
  ];
  for (const pattern of placeholderPatterns) {
    if (pattern.test(content)) {
      issues.push({
        type: 'error',
        message: `Placeholder text detected: ${pattern.source}`,
        severity: 'critical',
        category: 'content',
      });
    }
  }

  // Check for missing sections (basic)
  if (documentType === 'regulatory_submission' || documentType === 'clinical_protocol') {
    if (!/\b(introduction|background|objective|purpose)\b/i.test(content)) {
      issues.push({
        type: 'warning',
        message: 'No introduction/background section detected',
        severity: 'minor',
        category: 'completeness',
      });
    }
  }

  return {
    isValid: issues.filter((i) => i.severity === 'critical').length === 0,
    complianceScore: Math.max(0, 100 - issues.length * 15),
    issues,
    suggestions: [],
  };
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

registerActionHandler(handler);
