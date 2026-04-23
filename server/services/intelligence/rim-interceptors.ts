/**
 * RIM Interceptors — Automatic Signal Capture at Key Pipeline Points
 *
 * All interceptors use the centralized `rim-integration.ts` helper for:
 *   - provenance construction (buildProvenance)
 *   - pattern scanning (integratePatternScan)
 *   - signal capture (integrateSignal)
 *
 * No inline provenance construction. No direct captureSignal calls.
 *
 * All interceptors are fire-and-forget (non-blocking). They MUST NOT
 * slow down the primary pipeline. Failures are logged, never thrown.
 *
 * @module server/services/intelligence/rim-interceptors
 */

import {
  integratePatternScan,
  integrateSignal,
  type RIMIntegrationContext,
} from './rim-integration.js';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CHAT RESPONSE INTERCEPTOR
// ═══════════════════════════════════════════════════════════════════════════════

export interface ChatInterceptInput {
  organizationId: number;
  projectId: number;
  userId?: number;
  sectionCode?: string;
  assistantMessage: string;
  claimCount: number;
  supportedClaimRate: number;
  model: string;
  provider: string;
}

/**
 * Intercept AnA chat responses to:
 *   - scan for regulatory pattern matches in the generated text
 *   - capture claim quality as a signal
 *
 * Non-blocking. Malformed payloads are logged and dropped — RIM will never
 * throw into the chat critical path, but it also refuses to record phantom
 * signals with missing provenance (no org, no project, empty message).
 */
export function interceptChatResponse(input: ChatInterceptInput): void {
  try {
    const {
      organizationId, projectId, userId, sectionCode,
      assistantMessage, claimCount, supportedClaimRate,
      model, provider,
    } = input;

    if (!Number.isFinite(organizationId) || organizationId <= 0 ||
        !Number.isFinite(projectId) || projectId <= 0) {
      console.warn('[RIM] chat interceptor skipped — invalid provenance', {
        organizationId, projectId, hasMessage: Boolean(assistantMessage),
      });
      return;
    }
    if (typeof assistantMessage !== 'string' || assistantMessage.trim().length === 0) {
      console.warn('[RIM] chat interceptor skipped — empty assistant message', {
        organizationId, projectId,
      });
      return;
    }
    const safeRate = Number.isFinite(supportedClaimRate)
      ? Math.max(0, Math.min(1, supportedClaimRate))
      : 0.5;
    const safeClaimCount = Number.isFinite(claimCount) && claimCount >= 0 ? claimCount : 0;

    const ctx: RIMIntegrationContext = {
      organizationId, projectId, userId, sectionCode,
      runType: 'chat_intercept',
    };

    // Pattern scan on the generated text
    integratePatternScan(ctx, assistantMessage, sectionCode ?? 'chat_response');

    // Capture claim quality as a signal
    if (safeClaimCount > 0) {
      const qualityScore = Math.round(safeRate * 100);
      integrateSignal(ctx, {
        type: 'judgment',
        riskLevel: qualityScore >= 70 ? 'none' : qualityScore >= 40 ? 'medium' : 'high',
        reviewerSensitivity: qualityScore >= 70 ? 'unlikely_question' : 'possible_question',
        defensibilityVerdict: qualityScore >= 70 ? 'pass' : qualityScore >= 40 ? 'needs_attention' : 'at_risk',
        score: qualityScore,
        confidence: 60,
        action: qualityScore < 50
          ? 'Strengthen evidence grounding — many claims lack citations'
          : 'Evidence grounding adequate',
        patternIds: [],
        metadata: {
          source: 'chat_interceptor',
          claimCount: safeClaimCount,
          supportedClaimRate: safeRate,
          model,
          provider,
        },
      });
    }
  } catch (err) {
    console.warn('[RIM] Chat interceptor failed (non-blocking):', err instanceof Error ? err.message : err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. COMPLIANCE SCAN INTERCEPTOR
// ═══════════════════════════════════════════════════════════════════════════════

export interface ComplianceScanInterceptInput {
  organizationId: number;
  projectId: number;
  userId?: number;
  sectionCode?: string;
  documentType?: string;
  submissionType?: string;
  issues: Array<{
    type: 'error' | 'warning' | 'info';
    rule: string;
    message: string;
    suggestion?: string;
  }>;
  scannedLength: number;
}

/**
 * Intercept compliance scan results to capture structured compliance signals.
 */
export function interceptComplianceScan(input: ComplianceScanInterceptInput): void {
  try {
    const {
      organizationId, projectId, userId, sectionCode,
      issues, scannedLength,
    } = input;

    if (issues.length === 0) return;

    const ctx: RIMIntegrationContext = {
      organizationId, projectId, userId, sectionCode,
      runType: 'compliance_intercept',
    };

    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;

    // Capture overall compliance scan result
    const score = Math.max(0, 100 - (errorCount * 20) - (warningCount * 8));
    integrateSignal(ctx, {
      type: 'compliance_scan',
      riskLevel: errorCount > 0 ? 'high' : warningCount > 2 ? 'medium' : 'low',
      reviewerSensitivity: errorCount > 0 ? 'likely_question' : 'possible_question',
      defensibilityVerdict: score >= 70 ? 'acceptable' : score >= 40 ? 'needs_attention' : 'at_risk',
      score,
      confidence: 70,
      action: errorCount > 0
        ? `Address ${errorCount} compliance error(s): ${issues.filter(i => i.type === 'error').map(i => i.rule).join(', ')}`
        : `Review ${warningCount} compliance warning(s)`,
      patternIds: [],
      metadata: {
        source: 'compliance_scan_interceptor',
        errorCount, warningCount,
        infoCount: issues.filter(i => i.type === 'info').length,
        totalIssues: issues.length,
        scannedLength,
        topRules: issues.slice(0, 5).map(i => i.rule),
      },
    });

    // Capture individual critical compliance errors
    for (const issue of issues.filter(i => i.type === 'error')) {
      integrateSignal(ctx, {
        type: 'compliance_scan',
        riskLevel: 'critical',
        reviewerSensitivity: 'likely_question',
        defensibilityVerdict: 'at_risk',
        score: 20,
        confidence: 80,
        action: issue.suggestion ?? `Fix compliance violation: ${issue.message}`,
        patternIds: [],
        metadata: {
          source: 'compliance_scan_interceptor',
          rule: issue.rule,
          message: issue.message,
          issueType: issue.type,
        },
      });
    }
  } catch (err) {
    console.warn('[RIM] Compliance scan interceptor failed (non-blocking):', err instanceof Error ? err.message : err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ARTIFACT CHANGE INTERCEPTOR
// ═══════════════════════════════════════════════════════════════════════════════

export interface ArtifactChangeInterceptInput {
  organizationId: number;
  projectId: number;
  userId?: number;
  artifactId: string;
  artifactVersionId?: string;
  sectionCode?: string;
  changeType: 'create' | 'update' | 'delete';
  title: string;
  contentLength: number;
  source: 'ana_cortex' | 'manual' | 'import' | 'template';
  content?: string;
}

/**
 * Intercept artifact creation/updates to capture change signals
 * and scan new content for regulatory patterns.
 */
export function interceptArtifactChange(input: ArtifactChangeInterceptInput): void {
  try {
    const {
      organizationId, projectId, userId,
      artifactId, artifactVersionId, sectionCode,
      changeType, title, contentLength, source, content,
    } = input;

    const ctx: RIMIntegrationContext = {
      organizationId, projectId, userId,
      artifactId, artifactVersionId, sectionCode,
      runType: 'artifact_intercept',
    };

    // Capture the artifact change
    integrateSignal(ctx, {
      type: 'artifact_change',
      riskLevel: changeType === 'delete' ? 'medium' : 'none',
      reviewerSensitivity: 'unlikely_question',
      defensibilityVerdict: 'pass',
      score: 80,
      confidence: 95,
      action: `Artifact ${changeType}: ${title}`,
      patternIds: [],
      metadata: {
        source: 'artifact_change_interceptor',
        changeType, title, contentLength,
        artifactSource: source,
      },
    });

    // Pattern scan on new content
    if (content && content.length > 50 && (changeType === 'create' || changeType === 'update')) {
      integratePatternScan(ctx, content, sectionCode ?? `artifact:${artifactId}`);
    }
  } catch (err) {
    console.warn('[RIM] Artifact change interceptor failed (non-blocking):', err instanceof Error ? err.message : err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. FEEDBACK INTERCEPTOR
// ═══════════════════════════════════════════════════════════════════════════════

export interface FeedbackInterceptInput {
  organizationId: number;
  projectId: number;
  userId: number;
  artifactId?: string;
  artifactVersionId?: string;
  sectionCode?: string;
  feedbackType: 'accepted' | 'rejected' | 'edited' | 'regenerated';
  editDelta?: number;
}

/**
 * Capture user feedback on AnA output (accept/reject/edit/regenerate).
 */
export function interceptFeedback(input: FeedbackInterceptInput): void {
  try {
    const {
      organizationId, projectId, userId,
      artifactId, artifactVersionId, sectionCode,
      feedbackType, editDelta,
    } = input;

    const ctx: RIMIntegrationContext = {
      organizationId, projectId, userId,
      artifactId, artifactVersionId, sectionCode,
      runType: 'feedback_intercept',
    };

    const scoreMap = { accepted: 90, edited: 60, rejected: 20, regenerated: 10 };
    const riskMap = {
      accepted: 'none' as const,
      edited: 'low' as const,
      rejected: 'medium' as const,
      regenerated: 'high' as const,
    };

    integrateSignal(ctx, {
      type: 'feedback',
      riskLevel: riskMap[feedbackType],
      reviewerSensitivity: 'unlikely_question',
      defensibilityVerdict: feedbackType === 'accepted' ? 'pass'
        : feedbackType === 'edited' ? 'acceptable'
        : 'needs_attention',
      score: scoreMap[feedbackType],
      confidence: 90,
      action: feedbackType === 'accepted'
        ? 'Output accepted — intelligence validated'
        : feedbackType === 'edited'
        ? `Output edited (${editDelta ?? 'unknown'} chars changed) — partial alignment`
        : `Output ${feedbackType} — intelligence gap detected`,
      patternIds: [],
      metadata: {
        source: 'feedback_interceptor',
        feedbackType,
        editDelta,
      },
    });
  } catch (err) {
    console.warn('[RIM] Feedback interceptor failed (non-blocking):', err instanceof Error ? err.message : err);
  }
}
