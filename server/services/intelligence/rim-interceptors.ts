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
import {
  recordPattern,
  type RimSignalType,
} from './rim-pattern-store.js';
import { severityScore } from './signal-capture.js';

/**
 * Memoized dynamic import (dynamic to keep the drizzle graph out of this
 * module's load path; memoized so concurrent fire-and-forget callers share ONE
 * in-flight import instead of racing the module registry).
 */
let capabilityRegistryModule: Promise<typeof import('../ana-capability-registry.js')> | null = null;
const getCapabilityRegistry = () =>
  (capabilityRegistryModule ??= import('../ana-capability-registry.js'));

// ═══════════════════════════════════════════════════════════════════════════════
// 0. LEARNED-PATTERN INTERCEPTOR (Lane E — RIM learning loop)
// ═══════════════════════════════════════════════════════════════════════════════

export interface LearnedPatternInterceptInput {
  organizationId: number;
  domain: string;
  signalType: RimSignalType;
  observation: string;
  /** Optional seed confidence (0–100) for a brand-new pattern. */
  confidence?: number;
  /** Optional ISO 8601 observation timestamp (deterministic; defaults to now). */
  observedAt?: string;
}

/**
 * Persist a LEARNED RIM pattern into the durable, tenant-scoped pattern store.
 *
 * This is the write half of the RIM learning loop's first increment: the existing
 * interceptors emit volatile signals; this records the durable, aggregated pattern
 * that the deterministic read path (`recall_rim_patterns`) later surfaces.
 *
 * Additive and non-breaking — it does NOT modify the existing interceptors and is
 * fire-and-forget: invalid provenance is logged and dropped, never thrown into the
 * primary pipeline. The store call itself is pure/deterministic (no LLM, no network).
 */
export function interceptLearnedPattern(input: LearnedPatternInterceptInput): void {
  try {
    const { organizationId, domain, signalType, observation, confidence, observedAt } = input;

    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      console.warn('[RIM] learned-pattern interceptor skipped — invalid organization', {
        organizationId, domain, signalType,
      });
      return;
    }
    if (typeof observation !== 'string' || observation.trim().length === 0) {
      console.warn('[RIM] learned-pattern interceptor skipped — empty observation', {
        organizationId, domain, signalType,
      });
      return;
    }

    // recordPattern is async (it hydrates persisted state before upserting) and
    // never rejects — fire-and-forget keeps this off the primary pipeline.
    void recordPattern({ orgId: organizationId, domain, signalType, observation, confidence, observedAt });
  } catch (err) {
    console.warn('[RIM] Learned-pattern interceptor failed (non-blocking):', err instanceof Error ? err.message : err);
  }
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
    // 2026-10-15: a non-finite rate used to become 0.5 and was filed as a
    // measured claim-support score of 50. No rate, no claim-quality signal.
    const rateMeasured = Number.isFinite(supportedClaimRate);
    const safeRate = Math.max(0, Math.min(1, supportedClaimRate));
    const safeClaimCount = Number.isFinite(claimCount) && claimCount >= 0 ? claimCount : 0;

    const ctx: RIMIntegrationContext = {
      organizationId, projectId, userId, sectionCode,
      runType: 'chat_intercept',
    };

    // Pattern scan on the generated text
    integratePatternScan(ctx, assistantMessage, sectionCode ?? 'chat_response');

    // Capture claim quality as a signal
    if (safeClaimCount > 0 && rateMeasured) {
      const qualityScore = Math.round(safeRate * 100);
      integrateSignal(ctx, {
        type: 'judgment',
        riskLevel: qualityScore >= 70 ? 'none' : qualityScore >= 40 ? 'medium' : 'high',
        reviewerSensitivity: qualityScore >= 70 ? 'unlikely_question' : 'possible_question',
        defensibilityVerdict: qualityScore >= 70 ? 'pass' : qualityScore >= 40 ? 'needs_attention' : 'at_risk',
        score: qualityScore,
        confidence: null, // was 60, a constant
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
      confidence: null, // was 70, a constant
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
    const learnedDomain =
      (input.submissionType ?? input.documentType ?? 'compliance').trim() || 'compliance';
    for (const issue of issues.filter(i => i.type === 'error')) {
      integrateSignal(ctx, {
        type: 'compliance_scan',
        riskLevel: 'critical',
        reviewerSensitivity: 'likely_question',
        defensibilityVerdict: 'at_risk',
        // Severity convention, not a score of this issue; confidence was a constant 80.
        score: severityScore('critical'),
        confidence: null,
        action: issue.suggestion ?? `Fix compliance violation: ${issue.message}`,
        patternIds: [],
        metadata: {
          source: 'compliance_scan_interceptor',
          rule: issue.rule,
          message: issue.message,
          issueType: issue.type,
        },
      });

      // The durable half of the learning loop: the signal above is volatile
      // (in-memory, lost on restart); this records the aggregated, tenant-scoped
      // pattern that recall_rim_patterns later surfaces. The observation is
      // keyed on the RULE, not the message — messages embed document-specific
      // fragments, and an identity that varies per document never aggregates,
      // which is a pattern store full of single-occurrence noise.
      interceptLearnedPattern({
        organizationId,
        domain: learnedDomain,
        signalType: 'deficiency',
        observation: `Compliance rule ${issue.rule} violated`,
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
  source: 'ana_cortex' | 'manual' | 'import' | 'template' | 'lumen_cortex';
  content?: string;
}

/**
 * Intercept artifact creation/updates and scan new content for regulatory
 * patterns.
 *
 * 2026-10-15: every create/update/delete used to be filed as a signal with
 * verdict 'pass', score 80 and confidence 95. An edit is an event; nothing
 * assessed it, and those figures fed the signal averages AnA was told to cite.
 * Only the pattern scan of the new content produces signals now.
 */
export function interceptArtifactChange(input: ArtifactChangeInterceptInput): void {
  try {
    const {
      organizationId, projectId, userId,
      artifactId, artifactVersionId, sectionCode,
      changeType, content,
    } = input;

    const ctx: RIMIntegrationContext = {
      organizationId, projectId, userId,
      artifactId, artifactVersionId, sectionCode,
      runType: 'artifact_intercept',
    };

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
 *
 * 2026-10-15: the action used to be filed as a scored signal too — accept 90,
 * edit 60, reject 20, regenerate 10, confidence 90, "Output accepted —
 * intelligence validated". A user's action is not a score of anything; it is
 * recorded as the action, in the outcome log and (rejections) the pattern store.
 */
export function interceptFeedback(input: FeedbackInterceptInput): void {
  try {
    const {
      organizationId, projectId, userId,
      artifactId, sectionCode,
      feedbackType, editDelta,
    } = input;

    // Durable learning: a rejection or regeneration is the user telling AnA
    // her output missed — the strongest ground-truth signal this layer gets.
    // Aggregated per section (not per artifact — per-artifact identity never
    // repeats, so it could never strengthen into a pattern) so repeated
    // rejections in the same section become a rising-confidence pattern the
    // read path can warn her with before she drafts there again.
    if (feedbackType === 'rejected' || feedbackType === 'regenerated') {
      interceptLearnedPattern({
        organizationId,
        domain: 'authoring_feedback',
        signalType: 'rejection',
        observation: `AnA output ${feedbackType} in section ${sectionCode ?? 'unspecified'}`,
      });
    }

    // Outcome log: the same verdict, recorded where session bootstrap reads
    // "AnA's past lessons" and the capability registry keeps aggregate
    // counters. This was the table read by bootstrap and written by NOTHING —
    // logOutcome() had zero callers. Everything recorded is factual: the
    // outcome mapping restates the user's own action, and a lesson is written
    // only for a rejection/regeneration, stating what happened and where —
    // never an invented diagnosis of why. capabilityKey is deliberately the
    // generic 'authoring-output': feedback does not know which capability
    // produced the artifact, and guessing one would corrupt that capability's
    // success counters.
    void (async () => {
      try {
        const { logOutcome } = await getCapabilityRegistry();
        await logOutcome({
          organizationId,
          projectId,
          userId,
          capabilityKey: 'authoring-output',
          actionType: 'user_feedback',
          outcome:
            feedbackType === 'accepted'
              ? 'success'
              : feedbackType === 'edited'
                ? 'partial'
                : 'failure',
          userFeedback: feedbackType,
          editDelta: typeof editDelta === 'number' ? String(editDelta) : undefined,
          sectionCode,
          lessonsLearned:
            feedbackType === 'rejected' || feedbackType === 'regenerated'
              ? `Output was ${feedbackType} by the user in section ${sectionCode ?? 'unspecified'} — the draft did not meet their needs.`
              : undefined,
        });
      } catch (outcomeErr) {
        console.warn(
          '[RIM] Feedback → outcome log failed (non-blocking):',
          outcomeErr instanceof Error ? outcomeErr.message : outcomeErr,
        );
      }
    })();

    // Close the learning loop: tag the N most recent signals for this artifact
    // with a validation verdict so future RIM runs can weight signals by their
    // historical accuracy instead of treating all signals as equally reliable.
    if (artifactId) {
      void (async () => {
        try {
          const { linkFeedbackToRecentSignals } = await import('./learning-loop-service.js');
          await linkFeedbackToRecentSignals({
            organizationId, projectId, artifactId,
            feedbackType, userId,
          });
        } catch (linkErr) {
          console.warn(
            '[RIM] Feedback → signal link failed (non-blocking):',
            linkErr instanceof Error ? linkErr.message : linkErr,
          );
        }
      })();
    }
  } catch (err) {
    console.warn('[RIM] Feedback interceptor failed (non-blocking):', err instanceof Error ? err.message : err);
  }
}
