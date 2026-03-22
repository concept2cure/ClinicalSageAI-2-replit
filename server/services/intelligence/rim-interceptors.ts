/**
 * RIM Interceptors — Automatic Signal Capture at Key Pipeline Points
 *
 * These interceptors wire RIM into the actual AnA flow so signals
 * are captured automatically during normal operation, not just
 * when someone explicitly calls runRIMAssessment().
 *
 * Intercept points:
 *   1. Chat response — scan AnA output for regulatory patterns
 *   2. Compliance scan — capture structured compliance findings
 *   3. Artifact creation/update — capture artifact change signals
 *   4. Claim verification — capture claim quality signals
 *
 * All interceptors are fire-and-forget (non-blocking). They MUST NOT
 * slow down the primary pipeline. Failures are logged, never thrown.
 *
 * @module server/services/intelligence/rim-interceptors
 */

import {
  captureSignal,
  capturePatternSignals,
  type SignalProvenance,
  type IntelligenceSignal,
} from './signal-capture.js';

import { patternRegistry } from './pattern-registry.js';
import { JUDGMENT_FRAMEWORK_VERSION } from './judgment-framework.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PROVENANCE FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

function makeProvenance(runType: SignalProvenance['runType']): SignalProvenance {
  return {
    judgmentFrameworkVersion: JUDGMENT_FRAMEWORK_VERSION,
    patternRegistryVersion: patternRegistry.version,
    runId: `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    runType,
  };
}

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
 * Call after STEP 9 (claims verification) in chat.ts.
 * Non-blocking — wrap in try/catch, never await in the response path.
 */
export function interceptChatResponse(input: ChatInterceptInput): void {
  try {
    const provenance = makeProvenance('pattern_scan');
    const {
      organizationId, projectId, userId, sectionCode,
      assistantMessage, claimCount, supportedClaimRate,
      model, provider,
    } = input;

    // Pattern scan on the generated text
    const matches = patternRegistry.scanText(
      assistantMessage,
      sectionCode ?? 'chat_response',
    );

    if (matches.length > 0) {
      capturePatternSignals(
        organizationId, projectId, matches, provenance,
        sectionCode, userId,
      );
    }

    // Capture claim quality as a signal
    if (claimCount > 0) {
      const qualityScore = Math.round(supportedClaimRate * 100);
      captureSignal({
        type: 'judgment',
        provenance,
        organizationId,
        projectId,
        userId,
        sectionCode,
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
          claimCount,
          supportedClaimRate,
          patternMatchCount: matches.length,
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
 *
 * Call after compliance scan returns results in concept2cure.ts.
 * Non-blocking.
 */
export function interceptComplianceScan(input: ComplianceScanInterceptInput): void {
  try {
    const provenance = makeProvenance('manual_capture');
    const {
      organizationId, projectId, userId, sectionCode,
      issues, scannedLength,
    } = input;

    if (issues.length === 0) return;

    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;

    // Capture overall compliance scan result
    const score = Math.max(0, 100 - (errorCount * 20) - (warningCount * 8));
    captureSignal({
      type: 'compliance_scan',
      provenance,
      organizationId,
      projectId,
      userId,
      sectionCode,
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
        errorCount,
        warningCount,
        infoCount: issues.filter(i => i.type === 'info').length,
        totalIssues: issues.length,
        scannedLength,
        topRules: issues.slice(0, 5).map(i => i.rule),
      },
    });

    // Capture individual critical compliance errors as separate signals
    for (const issue of issues.filter(i => i.type === 'error')) {
      captureSignal({
        type: 'compliance_scan',
        provenance,
        organizationId,
        projectId,
        userId,
        sectionCode,
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
  source: 'lumen_cortex' | 'manual' | 'import' | 'template';
  content?: string; // optional — for pattern scanning on creates
}

/**
 * Intercept artifact creation/updates to:
 *   - capture artifact change signals
 *   - scan new content for regulatory patterns
 *
 * Call after artifact creation/update in concept2cure.ts.
 * Non-blocking.
 */
export function interceptArtifactChange(input: ArtifactChangeInterceptInput): void {
  try {
    const provenance = makeProvenance('manual_capture');
    const {
      organizationId, projectId, userId,
      artifactId, artifactVersionId, sectionCode,
      changeType, title, contentLength, source, content,
    } = input;

    // Capture the artifact change as a signal
    captureSignal({
      type: 'artifact_change',
      provenance,
      organizationId,
      projectId,
      userId,
      artifactId,
      artifactVersionId,
      sectionCode,
      riskLevel: changeType === 'delete' ? 'medium' : 'none',
      reviewerSensitivity: 'unlikely_question',
      defensibilityVerdict: 'pass',
      score: 80,
      confidence: 95,
      action: `Artifact ${changeType}: ${title}`,
      patternIds: [],
      metadata: {
        source: 'artifact_change_interceptor',
        changeType,
        title,
        contentLength,
        artifactSource: source,
      },
    });

    // Pattern scan on new content (creates/updates with content)
    if (content && content.length > 50 && (changeType === 'create' || changeType === 'update')) {
      const matches = patternRegistry.scanText(
        content,
        sectionCode ?? `artifact:${artifactId}`,
      );

      if (matches.length > 0) {
        capturePatternSignals(
          organizationId, projectId, matches, provenance,
          sectionCode, userId, artifactId, artifactVersionId,
        );
      }
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
  editDelta?: number; // approximate character change count
}

/**
 * Capture user feedback on AnA output.
 *
 * This is the feedback loop data:
 *   - accepted = AnA output was good, user kept it
 *   - rejected = AnA output was bad, user discarded it
 *   - edited = AnA output was partially useful, user modified it
 *   - regenerated = AnA output was unsatisfactory, user asked for new output
 *
 * Non-blocking.
 */
export function interceptFeedback(input: FeedbackInterceptInput): void {
  try {
    const provenance = makeProvenance('manual_capture');
    const {
      organizationId, projectId, userId,
      artifactId, artifactVersionId, sectionCode,
      feedbackType, editDelta,
    } = input;

    // Map feedback to quality signal
    const scoreMap = { accepted: 90, edited: 60, rejected: 20, regenerated: 10 };
    const riskMap = {
      accepted: 'none' as const,
      edited: 'low' as const,
      rejected: 'medium' as const,
      regenerated: 'high' as const,
    };

    captureSignal({
      type: 'feedback',
      provenance,
      organizationId,
      projectId,
      userId,
      artifactId,
      artifactVersionId,
      sectionCode,
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
