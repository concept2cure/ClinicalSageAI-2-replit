/**
 * AnA RI — Context Enrichment Layer
 *
 * Detects when the user's message warrants data from intelligence
 * services and injects relevant data into the system prompt so AnA
 * can reference it naturally in conversation.
 *
 * Also detects slash commands (/risk, /readiness, /precedent, etc.)
 * and triggers focused enrichment.
 *
 * Design principle: chat-first. No new UI. AnA just "knows."
 *
 * @module server/services/ana-ri/context-enrichment
 */

import { pool } from '../../db.js';
import { computeReadinessScore, type ReadinessContext } from '../intelligence/readiness-scoring-engine.js';
import { generateRecommendations, type RecommendationContext } from '../intelligence/recommendation-engine.js';
import { generateNextActions } from '../intelligence/next-best-action-engine.js';
import { getProjectSignals } from '../intelligence/rim.js';
import { querySignals, getRecurringPatterns, type IntelligenceSignal } from '../intelligence/signal-capture.js';
import { patternRegistry } from '../intelligence/pattern-registry.js';
import { getProjectIntelligence } from '../intelligence/project-intelligence-service.js';
import { analyzeCrossModuleRelationships } from '../intelligence/cross-module-intelligence.js';
import { buildEvidenceChain, computeConfidence, analyzeFactors, type EvidenceSource } from '../intelligence/evidence-confidence-model.js';
import { getDeficienciesBySubmissionType, getCriticalDeficiencies, type SubmissionType } from './deficiency-taxonomy.js';
import { resolveToDeficiencyType, getSubmissionTypeContext } from '../../../shared/regulatory/submission-type-bridge.js';
import { buildIndustryWisdomBlock, inferSegmentFromSubmissionType, inferSegmentFromMessage } from './industry-wisdom-pack.js';
import { buildTourGuideBlock } from './use-case-playbooks.js';
import { getClientJourney, buildClientJourneyPromptBlock } from '../ana/client-journey.js';
import { getAgentActivity, buildAgentActivityPromptBlock } from '../ana/agent-activity.js';
import { buildChallengeBlock, detectChallengeableClaims } from './challenge-library.js';
import { buildFirstSessionTour } from './onboarding-tour.js';
import { buildDecisionFrameworkBlock, detectRelevantFrameworks } from './decision-frameworks.js';
import { buildAgencyTacticsBlock, detectRelevantTactics } from './agency-tactics.js';
import { buildIchGuidelineBlock } from './ich-guideline-corpus.js';
import { buildPathwaysBlock } from './regulatory-pathways-corpus.js';
import { buildCompetitiveBlock, detectRelevantPlays } from './competitive-strategy.js';
import { buildAlignmentBlock, detectRelevantAlignment } from './stakeholder-alignment.js';
import { buildAttunementBlock, detectClientState } from './client-attunement.js';
import { buildClaimGroundingBlock, detectClaimCategories } from './claim-grounding.js';
import { buildCapabilityCatalogue } from './capability-registry.js';
import { buildScopeGuardBlock, detectScopeCategories } from './scope-guard.js';
import { buildRoleLensBlock, hasRoleLens } from './role-lens.js';
import { composeContext, priorityForSource, type CandidateBlock, type ComposeTraceEntry } from './context-composer.js';
import type { UserRole } from './persona.js';
import { buildWorkflowContext } from './workflow-orchestration.js';
import { detectDocumentType, buildDocumentGenerationContext } from './document-routing.js';
import { getFeedbackSummary } from '../intelligence/learning-loop-service.js';
import type { CanonicalGovernedState } from '../../../shared/types/governed-document-fabric.js';
import { createScopedLogger } from '../../utils/logger.js';
import {
  detectSlashCommand,
  detectAppMention,
  matchesTriggers,
  ROLE_FRAMEABLE_SOURCES,
  APP_ENRICHMENT_MAP,
  FORESIGHT_TRIGGERS,
  PRECEDENT_TRIGGERS,
  CRL_RTF_TRIGGERS,
  READINESS_TRIGGERS,
  RECOMMENDATION_TRIGGERS,
  CLAIMS_TRIGGERS,
  SIMULATION_TRIGGERS,
  BIOSTAT_TRIGGERS,
  SAFETY_TRIGGERS,
  CMC_TRIGGERS,
  CSR_TRIGGERS,
  HAQ_TRIGGERS,
  DEVICE_TRIGGERS,
  ECTD_TRIGGERS,
  CMS_TRIGGERS,
  DIAGNOSTICS_TRIGGERS,
  WISDOM_TRIGGERS,
  WAYFINDING_TRIGGERS,
} from './message-intent.js';

const logger = createScopedLogger('enrichment');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EnrichmentResult {
  block: string;
  sources: string[];
  /** Rewritten message if a slash command was detected (strips the command prefix) */
  rewrittenMessage?: string;
  /** Metadata about the enrichment process for transparency */
  enrichmentMeta?: {
    /** Total enrichment sources attempted */
    sourcesAttempted: number;
    /** Sources that returned data */
    sourcesSucceeded: string[];
    /** Sources that failed or had no data */
    sourcesFailed: string[];
    /** Whether this was a slash-command-triggered, app-mention-triggered, or natural-language-triggered enrichment */
    triggerType: 'slash_command' | 'app_mention' | 'natural_language' | 'proactive' | 'none';
    /** The detected slash command, if any */
    detectedCommand?: string;
    /** The detected @app mention, if any */
    detectedAppMention?: string;
    /** Whether project context was available */
    hasProjectContext: boolean;
    /** Composer decision trace when relevance-ranking was applied (opt-in). */
    composeTrace?: ComposeTraceEntry[];
    /** Approximate tokens used by the composed enrichment, when composed. */
    composeTokensUsed?: number;
  };
}

export interface AnaGovernedContextEnvelope {
  artifactSummary: string;
  decisionSummary: string;
  readinessSummary: string;
  topBlockers: string[];
  topWarnings: string[];
  nextRecommendedAction: string;
  exportPublishReadinessSummary: string;
  unresolvedGovernedDecisionSummary: string;
  topRimSignals: string[];
  freshnessTimestamp: string;
}

function buildAnaGovernedContextEnvelope(state: CanonicalGovernedState): AnaGovernedContextEnvelope {
  return {
    artifactSummary: `artifact=${state.artifactBinding.artifactId || 'pending'} section=${state.artifactBinding.sectionCode || 'unassigned'}`,
    decisionSummary: `outcome=${state.decision.outcome} reference=${state.decisionReference.decisionId}`,
    readinessSummary: `${state.readinessState.level} (${state.readinessState.score})`,
    topBlockers: state.blockers.slice(0, 3).map(b => b.message),
    topWarnings: state.warnings.slice(0, 3).map(w => w.message),
    nextRecommendedAction: state.nextRecommendedAction,
    exportPublishReadinessSummary: `export=${state.exportDecision.outcome}, publish=${state.publishDecision.outcome}`,
    unresolvedGovernedDecisionSummary: `${state.decisionLifecycle.unresolvedCount} unresolved, ${state.decisionLifecycle.escalatedCount} escalated`,
    topRimSignals: state.rimContextHints?.blockerCategories?.slice(0, 3) || [],
    freshnessTimestamp: state.stateFreshness.generatedAt,
  };
}

// ─── Message-intent detection (extracted to ./message-intent.ts) ─────────────
//
// Slash-command detection, @app mention detection, and the topic trigger
// tables live in ./message-intent.ts. The public names are re-exported here
// so this module's import surface is unchanged for its existing consumers.
export {
  SUPPORTED_SLASH_COMMANDS,
  detectSlashCommand,
  detectAppMention,
  KNOWN_APPS,
} from './message-intent.js';

/**
 * Build a constructive-challenge block. If the message contains a recognized
 * challengeable assertion, prime AnA to push back on it specifically; if the
 * user explicitly asked to be challenged but no specific claim is detected,
 * fall back to a general red-team instruction so /challenge always does work.
 */
/** Build a competitive-strategy block, inferring the segment from type or message. */
function buildCompetitiveForMessage(message: string, submissionType?: string, forceGeneric = false): string {
  const segment = inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(message);
  return buildCompetitiveBlock({ message, segment, forceGeneric });
}

function buildChallengeOrRedteam(message: string, submissionType?: string): string {
  const segment = inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(message);
  const block = buildChallengeBlock({ message, segment });
  if (block) return block;
  return (
    '\n\n## Constructive challenge — red-team the plan\n' +
    'The user explicitly asked you to challenge their thinking. Apply your Constructive Dissent doctrine as a red-team: ' +
    'find the load-bearing assumption in their current plan, name the single biggest risk it carries, ground the objection in ' +
    'precedent or guidance, and offer the stronger alternative. Acknowledge what is right first, state the disagreement once, ' +
    'and end with a concrete better path. If the plan is genuinely sound, say so and name the one thing you would still watch.'
  );
}

// ─── Enrichment functions ────────────────────────────────────────────────────

// Reads project memory and returns the formatted block, `''` for a GENUINE
// empty (no rows, or a legitimately-unprovisioned table), or `null` for a READ
// FAILURE. The null is the honest signal a caller needs to tell "nothing
// recorded" from "the read did not complete" — the difference between an
// honest empty state and a manufactured absence asserted into the model's
// prompt. `enrichWithProjectMemory` below collapses null → '' for the many
// callers that only concatenate the block (a failed read simply omits it);
// `enrichWithDomainMemory` keeps the distinction because it would otherwise
// print "No {domain} data found" on a failed read.
async function readProjectMemory(
  projectId: string | number,
  categories: string[],
  label: string,
  description: string,
  limit = 5,
  orgId?: number,
): Promise<string | null> {
  try {
    const catPlaceholders = categories.map((_, i) => `$${i + 3}`).join(', ');
    const limitParam = `$${categories.length + 3}`;
    // Tenant guard: when the caller has org context we enforce it; a NULL $2
    // (legacy paths without org context) preserves prior behavior exactly.
    const result = await pool.query(
      `SELECT content, title, confidence, importance, category
       FROM project_memory_entries
       WHERE project_id = $1 AND ($2::int IS NULL OR organization_id = $2)
         AND category IN (${catPlaceholders})
       ORDER BY importance DESC, created_at DESC
       LIMIT ${limitParam}`,
      [projectId, orgId ?? null, ...categories, limit]
    );

    if (result.rows.length === 0) return '';

    const items = result.rows.map((r: { confidence?: number; title?: string; content?: string }) => {
      const conf = r.confidence ? ` [${Math.round(r.confidence * 100)}% confidence]` : '';
      const title = r.title ? `**${r.title}**` : '';
      return `- ${title}${conf}: ${(r.content || '').slice(0, 400)}`;
    }).join('\n');

    return `\n\n## ${label}\n${description}\n${items}`;
  } catch (e: unknown) {
    // A legitimately-unprovisioned table is a genuine "nothing recorded yet" —
    // return '' so it reads as empty. Any OTHER error is a real read failure
    // (timeout, dropped connection, SQL error): return null so a failed read is
    // never laundered into a confident absence.
    const code = (e as { code?: string })?.code;
    if (code === '42P01') return '';
    logger.warn("Query failed", { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

// Back-compat wrapper: a failed read is omitted (''), which is exactly the
// fail-soft behavior every concatenating caller already relied on. Only
// enrichWithDomainMemory reads readProjectMemory directly, because it is the
// one caller that would otherwise assert a false absence on a failed read.
async function enrichWithProjectMemory(
  projectId: string | number,
  categories: string[],
  label: string,
  description: string,
  limit = 5,
  orgId?: number,
): Promise<string> {
  return (await readProjectMemory(projectId, categories, label, description, limit, orgId)) ?? '';
}

async function enrichWithForesight(projectId: string | number, orgId?: number): Promise<string> {
  let liveBlock = '';

  // Live path: pull real-time RIM signals sorted by score
  if (orgId) {
    try {
      const signals = querySignals({
        organizationId: orgId,
        projectId: Number(projectId),
        limit: 8,
      });
      if (signals.length > 0) {
        const lines = signals.map((s: IntelligenceSignal) =>
          `- **[${s.riskLevel.toUpperCase()}]** ${s.type} — score ${s.score}/100, confidence ${s.confidence}%${s.action ? `: ${s.action.slice(0, 200)}` : ''}`
        ).join('\n');
        liveBlock = `\n\n## LIVE RISK INTELLIGENCE\n${lines}`;
      }
    } catch (e: unknown) {
      // Fallback: live signals unavailable — memory-only path below
      logger.warn('Live foresight signals failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Historical path: always append memory-backed risk context
  const memoryBlock = await enrichWithProjectMemory(
    projectId,
    ['risk_assessment', 'intelligence_signal_summary', 'submission_readiness'],
    liveBlock ? 'HISTORICAL RISK CONTEXT' : 'Foresight Intelligence (Risk & Predictions)',
    liveBlock
      ? 'Persisted risk signals and predictions for longer-term trend reference.'
      : 'The following risk signals and predictions exist for this project. Cite confidence levels when discussing risk.',
    5,
    orgId
  );

  return liveBlock + memoryBlock;
}

async function enrichWithPrecedents(projectId: string | number, orgId?: number): Promise<string> {
  // Structured precedent enrichment with category labels per type
  const categories = ['precedent_analysis', 'competitive_intelligence', 'predicate_device'] as const;
  const categoryLabels: Record<string, string> = {
    precedent_analysis: 'Regulatory Precedent Analysis',
    competitive_intelligence: 'Competitive Intelligence',
    predicate_device: 'Predicate Device Comparators',
  };

  try {
    const catPlaceholders = categories.map((_, i) => `$${i + 3}`).join(', ');
    const result = await pool.query(
      `SELECT content, title, confidence, importance, category
       FROM project_memory_entries
       WHERE project_id = $1 AND ($2::int IS NULL OR organization_id = $2)
         AND category IN (${catPlaceholders})
       ORDER BY importance DESC, created_at DESC
       LIMIT $${categories.length + 3}`,
      [projectId, orgId ?? null, ...categories, 12]
    );

    if (result.rows.length === 0) return '';

    // Group by category for structured output
    const grouped: Record<string, string[]> = {};
    for (const r of result.rows) {
      const cat = r.category as string;
      const label = categoryLabels[cat] || cat;
      if (!grouped[label]) grouped[label] = [];
      const conf = r.confidence ? ` [${Math.round(r.confidence * 100)}% confidence]` : '';
      const title = r.title ? `**${r.title}**` : '';
      grouped[label].push(`- ${title}${conf}: ${(r.content || '').slice(0, 400)}`);
    }

    const sections = Object.entries(grouped)
      .map(([label, items]) => `### ${label}\n${items.slice(0, 4).join('\n')}`)
      .join('\n\n');

    return `\n\n## PROJECT PRECEDENT INTELLIGENCE\nIdentified precedents and comparators. Reference these for similar products/devices.\n\n${sections}`;
  } catch (e: unknown) {
    logger.warn('Precedent query failed', { error: e instanceof Error ? e.message : String(e) });
    return '';
  }
}

async function enrichWithCRLRTF(projectId: string | number, orgId?: number): Promise<string> {
  let liveBlock = '';

  // Live path: pull active patterns from the RIM pattern registry
  if (orgId) {
    try {
      const recurring = getRecurringPatterns(orgId, Number(projectId));
      if (recurring.length > 0) {
        // Resolve pattern details from registry for top matches
        const allPatterns = patternRegistry.getPatterns();
        const lines = recurring.slice(0, 8).map(r => {
          const pat = allPatterns.find(p => p.id === r.patternId);
          if (!pat) return `- **${r.patternId}** — ${r.occurrences} occurrences`;
          return `- **[${pat.severity.toUpperCase()}]** ${pat.name} (${pat.agency}) — ${r.occurrences} hits${pat.remediation ? ` | Fix: ${pat.remediation.slice(0, 150)}` : ''}`;
        }).join('\n');
        liveBlock = `\n\n## ACTIVE REGULATORY PATTERNS\n${lines}`;
      }
    } catch (e: unknown) {
      // Fallback: live patterns unavailable — memory-only path below
      logger.warn('Live CRLRTF patterns failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Historical path: persisted deficiency patterns from memory
  const memoryBlock = await enrichWithProjectMemory(
    projectId,
    ['rim_pattern_registry', 'deficiency_pattern', 'reviewer_trigger'],
    liveBlock ? 'HISTORICAL DEFICIENCY PATTERNS' : 'Deficiency & Rejection Intelligence',
    liveBlock
      ? 'Persisted deficiency and rejection patterns for trend context.'
      : 'Known deficiency patterns and rejection risk signals. Use when discussing CRL/RTF risk.',
    5,
    orgId
  );

  return liveBlock + memoryBlock;
}

/**
 * Proactive client-journey block for the greeting path: where this tenant sits
 * on the license → full-submission path, and the single next move. Fail-soft —
 * returns '' on any error (or without an org), so a greeting is never blocked.
 */
async function enrichWithClientJourney(orgId?: number, submissionType?: string): Promise<string> {
  if (!orgId) return '';
  try {
    const segment = inferSegmentFromSubmissionType(submissionType);
    const journey = await getClientJourney(pool, orgId, { segment });
    return buildClientJourneyPromptBlock(journey);
  } catch {
    return '';
  }
}

/**
 * Proactive background-work block for the greeting path: surfaces the tenant's
 * active / recently-finished deep investigations so a returning user hears about
 * them. Fail-soft, and '' when there is nothing to report.
 */
async function enrichWithAgentActivity(orgId?: number): Promise<string> {
  if (!orgId) return '';
  try {
    return buildAgentActivityPromptBlock(await getAgentActivity(orgId));
  } catch {
    return '';
  }
}

async function enrichWithReadiness(projectId: string | number, orgId?: number): Promise<string> {
  // Try live readiness scoring engine first
  if (orgId) {
    try {
      const ctx: ReadinessContext = { organizationId: orgId, projectId: Number(projectId) };
      const score = await computeReadinessScore(ctx);
      const gapLines = score.gaps.slice(0, 8).map(g =>
        `- **[${g.severity.toUpperCase()}]** ${g.module}: ${g.description} _(${g.remediation})_`
      ).join('\n');
      const dimLines = Object.entries(score.dimensions || {}).map(([k, v]: [string, unknown]) =>
        `| ${k} | ${typeof v === 'number' ? v : (v && typeof v === 'object' && 'score' in v ? (v as Record<string, unknown>).score : '—')}/100 |`
      ).join('\n');

      return `\n\n## Live Readiness Assessment\n**Overall Score: ${score.overallScore}/100** | Trend: ${score.trend?.direction || 'unknown'}\n\n**Predictions:** Approval probability ~${score.predictions?.approvalProbability ?? '—'}% | Est. ${score.predictions?.estimatedDeficiencies ?? '—'} deficiencies | ~${score.predictions?.estimatedReviewDays ?? '—'} review days\n\n| Dimension | Score |\n|---|---|\n${dimLines}\n\n**Top Gaps (${score.gaps.length} total):**\n${gapLines || '- None identified'}\n\nPresent these scores directly. Be specific about gaps and remediation steps.`;
    } catch (e: unknown) {
      logger.warn('Live readiness failed, falling back to memory', { error: e instanceof Error ? e.message : 'unknown error' });
    }
  }
  // Fallback to stored memory
  return enrichWithProjectMemory(
    projectId,
    ['submission_readiness', 'readiness_score', 'completeness_assessment'],
    'Readiness Assessment',
    'Current readiness data for this project. Give concrete scores and gap details.',
    5,
    orgId
  );
}

async function enrichWithRecommendations(projectId: string | number, orgId?: number): Promise<string> {
  // Query feedback summary to avoid repeating dismissed recommendations
  let feedbackNote = '';
  if (orgId) {
    try {
      const feedback = await getFeedbackSummary(Number(projectId), orgId);
      const repeatedDismissals = feedback.topDismissedTypes.filter(d => d.count > 2);
      if (repeatedDismissals.length > 0) {
        const dismissalLines = repeatedDismissals.slice(0, 3).map(
          d => `- ${d.type}: dismissed ${d.count} times`
        ).join('\n');
        feedbackNote = `\n\nNote: The user has previously dismissed the following recommendation types. Consider alternative approaches or provide stronger justification.\n${dismissalLines}`;
      }
    } catch (e: unknown) {
      // Non-blocking — feedback query is optional enrichment
    }
  }

  // Try live recommendation engine first
  if (orgId) {
    try {
      const ctx: RecommendationContext & ReadinessContext = {
        organizationId: orgId,
        projectId: Number(projectId),
        triggeredBy: 'ana-chat',
      };
      const actionSet = await generateNextActions(ctx, 8);
      const actionLines = actionSet.actions.slice(0, 8).map((a, i) =>
        `${i + 1}. **${a.title}** [${a.urgency}/${a.impactEstimate}] — ${a.description}${a.effortEstimate ? ` (${a.effortEstimate})` : ''}`
      ).join('\n');

      return `\n\n## Next Best Actions (Live)\n**${actionSet.actions.length} actions** prioritized by urgency and impact.\n\n${actionLines || 'No actions generated.'}${feedbackNote}\n\nPresent these as a prioritized to-do list. Be directive — tell the user what to do first and why.`;
    } catch (e: unknown) {
      console.warn('[enrichment] Live recommendations failed, falling back to memory:', e instanceof Error ? e.message : 'unknown error');
    }
  }
  // Fallback to stored memory
  const memoryResult = await enrichWithProjectMemory(
    projectId,
    ['recommendation_feedback', 'next_best_action', 'workflow_optimization'],
    'Recommendations & Next Actions',
    'Active recommendations and prioritized next steps. Present as an actionable list.',
    6,
    orgId
  );
  return memoryResult + feedbackNote;
}

async function enrichWithClaims(projectId: string | number, orgId?: number): Promise<string> {
  // Try to build evidence chains from stored memory
  try {
    const result = await pool.query(
      `SELECT content, title, confidence, category
       FROM project_memory_entries
       WHERE project_id = $1 AND ($2::int IS NULL OR organization_id = $2)
         AND category IN ('evidence_assessment', 'claim_evidence_map', 'evidence_gap')
       ORDER BY importance DESC, created_at DESC
       LIMIT $3`,
      [projectId, orgId ?? null, 8]
    );

    if (result.rows.length > 0) {
      // Build evidence sources from memory entries
      const sources: EvidenceSource[] = result.rows.map((r: { category?: string; title?: string; confidence?: number; content?: string }) => ({
        sourceType: r.category === 'evidence_gap' ? 'ai_analysis' as const : 'document_state' as const,
        sourceId: `mem-${r.title || 'unknown'}`,
        sourceTitle: r.title || 'Evidence entry',
        relevance: r.confidence || 0.5,
        extractedValue: r.content?.slice(0, 200),
      }));

      const chain = buildEvidenceChain(sources, 'ai_inferred');
      const confidence = computeConfidence(sources);
      const factors = analyzeFactors(sources);

      const entryLines = result.rows.map((r: { title?: string; category?: string; confidence?: number; content?: string }) =>
        `- **${r.title || r.category}** [${r.confidence ? Math.round(r.confidence * 100) + '%' : '—'}]: ${r.content?.slice(0, 300)}`
      ).join('\n');

      return `\n\n## Evidence & Claims Analysis\n**Evidence Chain Strength:** ${chain.chainStrength} | **Confidence:** ${confidence}/100\n**Factors:** ${Object.entries(factors).map(([k, v]) => `${k}: ${v}`).join(', ')}\n\n**Evidence Entries:**\n${entryLines}\n\nAnalyze the strength of evidence chains. Flag any claims with weak or missing evidence support.`;
    }
  } catch (e: unknown) { logger.warn("Query failed", { error: e instanceof Error ? e.message : String(e) });
    // Fall through
  }
  return enrichWithProjectMemory(
    projectId,
    ['evidence_assessment', 'claim_evidence_map', 'evidence_gap'],
    'Claims & Evidence Intelligence',
    'Evidence chain data and claim-to-evidence mapping. Flag any unsupported claims.',
    5,
    orgId
  );
}

async function enrichWithCrossModule(projectId: string | number, orgId?: number): Promise<string> {
  if (!orgId) return '';
  try {
    const report = await analyzeCrossModuleRelationships({ organizationId: orgId, projectId: Number(projectId) });
    if (!report || report.insights.length === 0) return '';

    const insightLines = report.insights.slice(0, 8).map((i: { severity?: string; type?: string; description?: string; message?: string; affectedModules?: string[] }) =>
      `- **[${i.severity || i.type || 'info'}]** ${i.description || i.message || String(i)}${i.affectedModules ? ` (${i.affectedModules.join(', ')})` : ''}`
    ).join('\n');

    return `\n\n## Cross-Module Consistency Report (Live)\n**${report.insights.length} insights** across ${report.documentsCovered || '—'} documents.\n\n${insightLines}\n\nHighlight stale references, status gaps, and orphaned documents. Be specific about which modules are affected.`;
  } catch (e: unknown) {
    console.warn('[enrichment] Cross-module analysis failed:', e instanceof Error ? e.message : 'unknown error');
    return '';
  }
}

async function enrichWithSignals(projectId: string | number, orgId?: number): Promise<string> {
  // Try live RIM signals first
  if (orgId) {
    try {
      const summary = getProjectSignals(orgId, Number(projectId));
      if (summary && summary.totalSignals > 0) {
        const byRisk = Object.entries(summary.byRiskLevel)
          .filter(([, count]) => Number(count) > 0)
          .map(([risk, count]) => `- **${risk}**: ${count}`)
          .join('\n');
        return `\n\n## RIM Intelligence Signals (Live)\n**${summary.totalSignals} signals** accumulated for this project.\n\nTrend: **${summary.overallTrend}** (${summary.trendConfidence}, n=${summary.trendSampleSize})\nAverage score: **${summary.averageScore}**\nTop patterns: ${summary.topPatternIds.slice(0, 6).join(', ') || 'none'}\n\n### By risk\n${byRisk || '- none'}\n\nSummarize patterns, highlight recurring risks, and note trend directions.`;
      }
    } catch (e: unknown) { logger.warn("Query failed", { error: e instanceof Error ? e.message : String(e) });
      // Fall through to memory
    }
  }
  return enrichWithProjectMemory(
    projectId,
    ['intelligence_signal_summary', 'rim_pattern_registry', 'risk_signal'],
    'RIM Signal History',
    'Accumulated regulatory intelligence signals for this project.',
    8,
    orgId
  );
}

async function enrichWithDeficiencies(submissionType?: string): Promise<string> {
  try {
    // Resolve ANY submission type (legacy, registry ID, international) to a
    // deficiency-taxonomy-compatible type via the canonical bridge.
    const type = resolveToDeficiencyType(submissionType || 'IND');
    const deficiencies = getDeficienciesBySubmissionType(type);
    const critical = getCriticalDeficiencies(type);

    if (deficiencies.length === 0) return '';

    // When the original type differs from the resolved one (e.g. EU_MAA → nda),
    // include the registry context for specificity.
    const regCtx = submissionType ? getSubmissionTypeContext(submissionType) : null;
    const label = regCtx ? `${regCtx.displayName} (${regCtx.agency})` : type.toUpperCase();

    const criticalLines = critical.slice(0, 5).map(d =>
      `- **[CRITICAL]** ${d.title}: ${d.description} _(${d.category})_`
    ).join('\n');

    const otherLines = deficiencies
      .filter(d => !critical.includes(d))
      .slice(0, 5)
      .map(d => `- **[${d.severity?.toUpperCase() || 'MEDIUM'}]** ${d.title}: ${d.description}`)
      .join('\n');

    return `\n\n## Deficiency Taxonomy for ${label}\n**${critical.length} critical** out of ${deficiencies.length} known deficiency patterns.\n\n**Critical Deficiencies:**\n${criticalLines}\n\n**Other Patterns:**\n${otherLines}\n\nUse these to preempt reviewer deficiency findings. Be specific about which patterns apply to the user's current work.`;
  } catch (e: unknown) { logger.warn("Query failed", { error: e instanceof Error ? e.message : String(e) });
    return '';
  }
}

async function enrichWithKnowledgeSearch(query: string, projectId: string | number, orgId?: number): Promise<string> {
  try {
    // Search project memory entries semantically
    const result = await pool.query(
      `SELECT title, content, category, confidence, importance
       FROM project_memory_entries
       WHERE project_id = $1 AND ($2::int IS NULL OR organization_id = $2)
       ORDER BY importance DESC, created_at DESC
       LIMIT $3`,
      [projectId, orgId ?? null, 10]
    );

    if (result.rows.length === 0) return '';

    const entries = result.rows.map((r: { title?: string; category?: string; confidence?: number; content?: string }) =>
      `- **${r.title || r.category}** [${r.category}] ${r.confidence ? `(${Math.round(r.confidence * 100)}%)` : ''}: ${r.content?.slice(0, 300)}`
    ).join('\n');

    return `\n\n## Knowledge Base Search Results\n**${result.rows.length} entries** found in project knowledge.\n\n${entries}\n\nReference these knowledge atoms when answering. Cite the category and confidence level.`;
  } catch (e: unknown) { logger.warn("Query failed", { error: e instanceof Error ? e.message : String(e) });
    return '';
  }
}

async function enrichWithDecisions(
  projectId: string | number,
  organizationId?: number,
): Promise<string> {
  try {
    const { decisionLifecycleService } = await import('../decision-lifecycle-service.js');
    const decisionCtx = decisionLifecycleService.getDecisionContext(String(projectId), {
      limit: 12,
      organizationId,
    });
    const decisionAwareStatus = decisionLifecycleService.computeDecisionAwareStatus(
      String(projectId),
      { organizationId },
    );

    if (decisionCtx.length === 0) {
      return '\n\n## Decision Audit Trail\nNo formal decisions recorded for this project yet.';
    }

    const lines = decisionCtx.slice(0, 10).map(({ decision, receipt }) => {
      const authority = decision.authority?.level ? ` | authority: ${decision.authority.level}` : '';
      const receiptState = receipt
        ? ` | receipt: ${receipt.execution?.executed ? 'executed' : 'pending'}${(receipt.pendingApprovals?.length || 0) > 0 ? `, ${receipt.pendingApprovals.length} pending approval(s)` : ''}`
        : '';
      return `- **[${decision.status.toUpperCase()}]** ${decision.kind}: ${decision.summary}${authority}${receiptState}`;
    });

    return `\n\n## Decision Audit Trail\n${decisionAwareStatus.summary}\n\n${lines.join('\n')}\n\nUse this decision trail for explanation grounding and to avoid contradicting prior approvals.`;
  } catch (e: unknown) {
    console.warn('[enrichment] Decision trail enrichment failed:', e instanceof Error ? e.message : String(e));
    return '';
  }
}

async function enrichWithDomainMemory(projectId: string | number, domain: string, categories: string[], label: string): Promise<string> {
  const memBlock = await readProjectMemory(projectId, categories, label,
    `Project-specific ${domain} data. Reference directly in your response.`, 5);
  // A READ FAILURE (null) omits the block entirely — the model is told nothing
  // rather than a false "No {domain} data found," which on a safety / CMC / CSR
  // surface is a manufactured all-clear injected straight into the prompt. Only
  // a genuine empty ('') earns the affirmative "nothing recorded yet" sentence.
  if (memBlock === null) return '';
  return memBlock || `\n\n## ${label}\nNo ${domain} data found for this project yet. Ask the user what ${domain} work they need and gather parameters conversationally.`;
}

async function enrichWithSafety(projectId: string | number): Promise<string> {
  return enrichWithDomainMemory(projectId, 'safety',
    ['safety_narrative', 'adverse_event_summary', 'benefit_risk', 'safety_signal'],
    'Safety Intelligence');
}

/**
 * The Module 3 final-export gate, stated as its verdict rather than its inputs.
 *
 * The gate fails closed on three things: a section not approved, an approved
 * section that went stale afterwards, and an open critical contradiction. Giving
 * the model only the raw counts ("3 of 10 approved") invites it to guess whether
 * that is enough to file — and the answer is deterministic and knowable here, so
 * a guess is strictly worse than the fact.
 *
 * Exported for tests: this is the judgment in the CMC enrichment, and it must
 * not claim a pass it has not established or name a blocker that is not real.
 */
export function summarizeModule3Gate(input: {
  totalSections: number;
  approvedSections: number;
  staleApprovedSections: number;
  openContradictionsBySeverity: Array<{ severity: string; count: number }>;
  openCriticalContradictions: number;
}): string {
  const { totalSections, approvedSections, staleApprovedSections, openCriticalContradictions } = input;
  if (totalSections <= 0) return '';

  const blockers: string[] = [];
  if (approvedSections < totalSections) {
    blockers.push(`${totalSections - approvedSections} section(s) not approved`);
  }
  if (staleApprovedSections > 0) {
    blockers.push(`${staleApprovedSections} approved section(s) went stale after approval`);
  }
  if (openCriticalContradictions > 0) {
    blockers.push(`${openCriticalContradictions} open critical contradiction(s)`);
  }

  const open = input.openContradictionsBySeverity.filter(c => c.count > 0);
  let out = `\nApproval: ${approvedSections} of ${totalSections} §3.2 sections approved.`;
  if (open.length > 0) {
    out += `\nOpen contradictions: ${open.map(c => `${c.severity} (${c.count})`).join(', ')}.`;
  }
  out += blockers.length
    ? `\nFinal export is BLOCKED by: ${blockers.join('; ')}. These are the gate's own conditions — do not suggest exporting until they clear.`
    : '\nFinal export would pass the gate on the current data.';
  return out;
}

async function enrichWithCMC(
  projectId: string | number,
  organizationId?: number
): Promise<string> {
  const memBlock = await enrichWithDomainMemory(projectId, 'CMC',
    ['cmc_assessment', 'manufacturing_change', 'comparability', 'analytical_method'],
    'CMC Intelligence');

  // Also pull Module 3 build-state summary so AnA knows which sections are stale/ready
  let buildBlock = '';
  try {
    const { getPool } = await import('../../db');
    const pool = getPool();
    const { rows: staleSections } = await pool.query(
      `SELECT section_key, stale_reason FROM cmc_module3_sections
       WHERE project_id = $1::text::uuid AND stale = true
       ORDER BY section_key LIMIT 10`,
      [String(projectId)],
    );
    const { rows: sourceCount } = await pool.query(
      `SELECT source_type, COUNT(*) as cnt FROM cmc_source_objects
       WHERE project_id = $1::text::uuid
       GROUP BY source_type ORDER BY cnt DESC`,
      [String(projectId)],
    );
    if (staleSections.length > 0 || sourceCount.length > 0) {
      buildBlock = '\n\n## Module 3 Build State';
      if (sourceCount.length > 0) {
        buildBlock += `\nCanonical sources: ${sourceCount.map((r: any) => `${r.source_type} (${r.cnt})`).join(', ')}`;
      }
      if (staleSections.length > 0) {
        buildBlock += `\nStale sections needing rebuild: ${staleSections.map((r: any) => `${r.section_key} — ${r.stale_reason || 'source data updated'}`).join('; ')}`;
      }
      if (staleSections.length === 0 && sourceCount.length > 0) {
        buildBlock += '\nAll compiled sections are up to date.';
      }
    }

    /* ── What is actually BLOCKING the submission ──
       Staleness alone does not answer the question a CMC lead asks first
       ("what is stopping me filing?"). The final-export gate fails closed on
       three things: a section not approved, an approved section that went stale
       afterwards, and an open critical contradiction. Only the second was
       visible here, so AnA could describe the build and not what it was waiting
       on — and would fall back to generic advice on the one question the
       canonical data can answer exactly.

       Org scope is applied when the caller has it, matching the module3-os
       routes. When it is absent the query still runs project-scoped rather than
       being dropped: the pre-existing behaviour, not a widening. */
    const orgScoped = typeof organizationId === 'number' && organizationId > 0;
    const scope = orgScoped ? ' AND organization_id = $2' : '';
    const params = orgScoped ? [String(projectId), organizationId] : [String(projectId)];

    const { rows: sections } = await pool.query(
      `SELECT approval_state, stale FROM cmc_module3_sections
       WHERE project_id = $1::text::uuid${scope}`,
      params,
    );
    if (sections.length > 0) {
      const approved = sections.filter((r: any) => r.approval_state === 'approved').length;
      const staleApproved = sections.filter(
        (r: any) => r.approval_state === 'approved' && r.stale === true
      ).length;
      const { rows: contradictions } = await pool.query(
        `SELECT severity, COUNT(*)::int AS cnt FROM cmc_contradictions
         WHERE project_id = $1::text::uuid${scope} AND status <> 'resolved'
         GROUP BY severity`,
        params,
      );
      const openCritical =
        contradictions.find((r: any) => r.severity === 'critical')?.cnt ?? 0;

      buildBlock += summarizeModule3Gate({
        totalSections: sections.length,
        approvedSections: approved,
        staleApprovedSections: staleApproved,
        openContradictionsBySeverity: contradictions.map((r: any) => ({
          severity: String(r.severity),
          count: Number(r.cnt) || 0,
        })),
        openCriticalContradictions: Number(openCritical) || 0,
      });
    }
  } catch {
    // Non-blocking — if build-state query fails, proceed with CMC memory only
  }

  return memBlock + buildBlock;
}

async function enrichWithCSR(projectId: string | number): Promise<string> {
  return enrichWithDomainMemory(projectId, 'CSR',
    ['csr_section', 'clinical_study', 'efficacy_result', 'safety_result'],
    'Clinical Study Report Intelligence');
}

async function enrichWithDevice(projectId: string | number): Promise<string> {
  return enrichWithDomainMemory(projectId, 'medical device',
    ['predicate_device', 'device_classification', 'substantial_equivalence', 'clinical_evaluation'],
    'Medical Device Intelligence');
}

async function enrichWithECTD(projectId: string | number): Promise<string> {
  return enrichWithDomainMemory(projectId, 'eCTD',
    ['ectd_structure', 'module_status', 'submission_package', 'granule_tracking'],
    'eCTD Structure Intelligence');
}

async function enrichWithCMS(projectId: string | number): Promise<string> {
  return enrichWithDomainMemory(
    projectId,
    'CMS coverage and reimbursement',
    [
      'cms_strategy',
      'payer_evidence',
      'reimbursement_strategy',
      'coding_coverage',
      'health_economics',
    ],
    'CMS & Reimbursement Intelligence',
  );
}

async function enrichWithDiagnostics(projectId: string | number): Promise<string> {
  return enrichWithDomainMemory(
    projectId,
    'diagnostics and IVD',
    [
      'diagnostic_validation',
      'ivd_performance',
      'analytical_validation',
      'clinical_performance',
      'companion_diagnostic',
    ],
    'Diagnostics & IVD Intelligence',
  );
}

async function enrichWithBiostatContext(projectId: string | number, submissionType?: string, organizationId?: number): Promise<string> {
  // Inject biostatistics knowledge + project-specific signals
  const parts: string[] = [];
  // A REAL read failure (not a missing table) must not be laundered into "No
  // biostatistics signals found" — on a statistical-defensibility surface that
  // is a manufactured all-clear in the model's prompt. Track it and omit the
  // affirmative-absence sentence when the reads did not complete.
  let readFailed = false;
  const isMissingTable = (e: unknown) => (e as { code?: string })?.code === '42P01';

  // Get project biostat signals
  try {
    const result = await pool.query(
      `SELECT signal_type, severity, description, status
       FROM biostat_signals
       WHERE project_id = $1 AND organization_id = $2 AND status != 'resolved'
       ORDER BY severity DESC, created_at DESC
       LIMIT $3`,
      [projectId, organizationId ?? null, 8]
    );
    if (result.rows.length > 0) {
      const signalLines = result.rows.map((r: { severity?: string; signal_type?: string; description?: string }) =>
        `- **[${r.severity?.toUpperCase() || 'INFO'}]** ${r.signal_type}: ${r.description?.slice(0, 300) || 'No description'}`
      ).join('\n');
      parts.push(`**Active Biostat Signals (${result.rows.length}):**\n${signalLines}`);
    }
  } catch (e) { if (!isMissingTable(e)) readFailed = true; /* else: table not provisioned — a genuine empty */ }

  // Get existing assumptions
  try {
    const assumptions = await pool.query(
      `SELECT finding_type, parameter_name, status, description
       FROM biostat_assumption_findings
       WHERE project_id = $1 AND organization_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [projectId, organizationId ?? null, 5]
    );
    if (assumptions.rows.length > 0) {
      const assLines = assumptions.rows.map((r: { parameter_name?: string; finding_type?: string; description?: string; status?: string }) =>
        `- ${r.parameter_name || r.finding_type}: ${r.description?.slice(0, 200) || ''} (${r.status})`
      ).join('\n');
      parts.push(`**Statistical Assumptions:**\n${assLines}`);
    }
  } catch (e) { if (!isMissingTable(e)) readFailed = true; /* else: table not provisioned — a genuine empty */ }

  if (parts.length === 0) {
    // A failed read omits the block — assert nothing rather than a false empty.
    if (readFailed) return '';
    return `\n\n## Biostatistics Context\nNo biostatistics signals or assumptions found for this project yet. You can compute sample size, generate SAP sections, run defensibility assessments, or design dose escalation protocols. Ask the user what statistical work they need.`;
  }

  return `\n\n## Biostatistics Context\n${parts.join('\n\n')}\n\nUse these signals and assumptions when discussing statistical design. Flag unresolved signals.`;
}

// ─── Project intelligence summary (first-message context) ────────────────────

async function enrichWithProjectSummary(projectId: string | number, orgId?: number): Promise<string> {
  if (!orgId) return '';
  try {
    const intel = await getProjectIntelligence(Number(projectId), orgId);
    if (!intel) return '';

    const parts: string[] = ['## Project Intelligence Profile'];
    if (intel.regulatoryStrategy) parts.push(`**Strategy:** ${intel.regulatoryStrategy}`);
    if (intel.targetIndication) parts.push(`**Indication:** ${intel.targetIndication}`);
    if (intel.targetPopulation) parts.push(`**Population:** ${intel.targetPopulation}`);

    if (intel.riskFactors.length > 0) {
      parts.push(`\n**Known Risks (${intel.riskFactors.length}):**`);
      for (const r of intel.riskFactors.slice(0, 5)) {
        parts.push(`- [${(r as any).severity || 'medium'}] ${(r as any).description || (r as any).factor || String(r)}`);
      }
    }

    if (intel.openQuestions.length > 0) {
      parts.push(`\n**Open Questions (${intel.openQuestions.length}):**`);
      for (const q of intel.openQuestions.slice(0, 3)) {
        parts.push(`- ${(q as any).question || String(q)}`);
      }
    }

    if (intel.keyDecisions.length > 0) {
      parts.push(`\n**Key Decisions (${intel.keyDecisions.length}):**`);
      for (const d of intel.keyDecisions.slice(0, 3)) {
        parts.push(`- ${(d as any).decision || String(d)} (${(d as any).status || 'pending'})`);
      }
    }

    if (intel.learnedInsights.length > 0) {
      parts.push(`\n**Learned Insights (${intel.learnedInsights.length}):**`);
      for (const i of intel.learnedInsights.slice(0, 3)) {
        parts.push(`- ${(i as any).insight || String(i)}`);
      }
    }

    parts.push(`\n**Documents:** ${intel.documentStats.totalIngested} ingested | ${intel.memoryEntryCount} memory atoms`);

    return '\n\n' + parts.join('\n') + '\n\nUse this context to personalize your responses. Reference known risks, open questions, and decisions.';
  } catch (e: unknown) { logger.warn("Query failed", { error: e instanceof Error ? e.message : String(e) });
    return '';
  }
}

// ─── Main enrichment function ────────────────────────────────────────────────

export async function enrichContextForChat(params: {
  message: string;
  projectId?: string | number;
  organizationId?: number;
  submissionType?: string;
  canonicalGovernedState?: CanonicalGovernedState;
  /** Optional user role; when present, a role lens frames the pack guidance. */
  userRole?: UserRole;
  /**
   * Optional token budget. When set, the composer relevance-ranks and
   * de-duplicates the enrichment blocks under this budget instead of plain
   * concatenation. Omit (or 0) to preserve the legacy join-all behavior.
   */
  composeTokenBudget?: number;
  /**
   * Optional learned per-source priority multipliers (from adaptive-priority).
   * Only consulted when composeTokenBudget engages the composer.
   */
  priorityMultipliers?: Record<string, number>;
}): Promise<EnrichmentResult> {
  const { message, projectId, organizationId, submissionType, canonicalGovernedState, userRole, composeTokenBudget, priorityMultipliers } = params;
  const blocks: string[] = [];
  const sources: string[] = [];
  const sourcesFailed: string[] = [];
  let sourcesAttempted = 0;
  let triggerType: 'slash_command' | 'app_mention' | 'natural_language' | 'proactive' | 'none' = 'none';
  let detectedCommand: string | undefined;
  let detectedAppMentionId: string | undefined;
  let rewrittenMessage: string | undefined;

  if (!projectId) {
    // No project loaded yet — but industry wisdom and wayfinding need no project
    // data, and a project-less chat is usually a new or exploring user: exactly
    // who benefits most from orientation. Run a message-only pass for those.
    const projectlessBlocks: string[] = [];
    const projectlessSources: string[] = [];
    const slashNoProj = detectSlashCommand(message);
    const wisdomFamily = ['wisdom', 'guide', 'playbook', 'orient', 'tour'];
    const challengeFamily = ['challenge', 'redteam', 'devil'];

    if (slashNoProj && wisdomFamily.includes(slashNoProj.command)) {
      const block = slashNoProj.command === 'wisdom'
        ? buildIndustryWisdomBlock({ submissionType, message })
        : buildTourGuideBlock({ submissionType, message });
      if (block) { projectlessBlocks.push(block); projectlessSources.push(slashNoProj.command); }
    } else if (slashNoProj && challengeFamily.includes(slashNoProj.command)) {
      const block = buildChallengeOrRedteam(slashNoProj.args || message, submissionType);
      if (block) { projectlessBlocks.push(block); projectlessSources.push(slashNoProj.command); }
    } else if (!slashNoProj) {
      if (matchesTriggers(message, WISDOM_TRIGGERS)) {
        const block = buildIndustryWisdomBlock({ submissionType, message });
        if (block) { projectlessBlocks.push(block); projectlessSources.push('industry-wisdom'); }
      }
      const isGreetingNoProj = /^(hi|hello|hey|good\s*(morning|afternoon|evening)|help|where (?:do|should) i start|i.?m new|guide me)/i.test(message.trim());
      if (isGreetingNoProj) {
        // True first contact: lead with a tailored welcome, not a feature list.
        const block = buildFirstSessionTour({ submissionType, message });
        if (block) { projectlessBlocks.push(block); projectlessSources.push('first-session-tour'); }
      } else if (matchesTriggers(message, WAYFINDING_TRIGGERS)) {
        const block = buildTourGuideBlock({ submissionType, message });
        if (block) { projectlessBlocks.push(block); projectlessSources.push('tour-guide'); }
      }
      const challengeSegmentNoProj =
        inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(message);
      if (detectChallengeableClaims(message, challengeSegmentNoProj).length > 0) {
        const block = buildChallengeBlock({ message, segment: challengeSegmentNoProj });
        if (block) { projectlessBlocks.push(block); projectlessSources.push('constructive-challenge'); }
      }
      if (detectRelevantFrameworks(message, challengeSegmentNoProj).length > 0) {
        const block = buildDecisionFrameworkBlock({ message, segment: challengeSegmentNoProj });
        if (block) { projectlessBlocks.push(block); projectlessSources.push('decision-framework'); }
      }
      if (detectRelevantTactics(message, { segment: challengeSegmentNoProj }).length > 0) {
        const block = buildAgencyTacticsBlock({ message, segment: challengeSegmentNoProj });
        if (block) { projectlessBlocks.push(block); projectlessSources.push('agency-tactics'); }
      }
      if (detectRelevantPlays(message, { segment: challengeSegmentNoProj }).length > 0) {
        const block = buildCompetitiveBlock({ message, segment: challengeSegmentNoProj });
        if (block) { projectlessBlocks.push(block); projectlessSources.push('competitive-strategy'); }
      }
      if (detectClientState(message)) {
        const block = buildAttunementBlock(message);
        if (block) { projectlessBlocks.push(block); projectlessSources.push('client-attunement'); }
      }
      if (detectRelevantAlignment(message, { segment: challengeSegmentNoProj }).length > 0) {
        const block = buildAlignmentBlock({ message, segment: challengeSegmentNoProj });
        if (block) { projectlessBlocks.push(block); projectlessSources.push('stakeholder-alignment'); }
      }
      if (detectClaimCategories(message).length > 0) {
        const block = buildClaimGroundingBlock(message);
        if (block) { projectlessBlocks.push(block); projectlessSources.push('claim-grounding'); }
      }
      if (detectScopeCategories(message).length > 0) {
        const block = buildScopeGuardBlock(message);
        if (block) { projectlessBlocks.push(block); projectlessSources.push('scope-guard'); }
      }
    } else if (slashNoProj && ['decide', 'tradeoff', 'framework'].includes(slashNoProj.command)) {
      const block = buildDecisionFrameworkBlock({
        message: slashNoProj.args || message,
        segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slashNoProj.args || message),
        forceGeneric: true,
      });
      if (block) { projectlessBlocks.push(block); projectlessSources.push(slashNoProj.command); }
    } else if (slashNoProj && ['meeting', 'agency', 'tactics'].includes(slashNoProj.command)) {
      const block = buildAgencyTacticsBlock({
        message: slashNoProj.args || message,
        segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slashNoProj.args || message),
        kind: slashNoProj.command === 'meeting' ? 'meeting_prep' : undefined,
        forceGeneric: true,
      });
      if (block) { projectlessBlocks.push(block); projectlessSources.push(slashNoProj.command); }
    } else if (slashNoProj && ['position', 'landscape', 'compete'].includes(slashNoProj.command)) {
      const block = buildCompetitiveForMessage(slashNoProj.args || message, submissionType, true);
      if (block) { projectlessBlocks.push(block); projectlessSources.push(slashNoProj.command); }
    } else if (slashNoProj && slashNoProj.command === 'align') {
      const block = buildAlignmentBlock({
        message: slashNoProj.args || message,
        segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slashNoProj.args || message),
        forceGeneric: true,
      });
      if (block) { projectlessBlocks.push(block); projectlessSources.push(slashNoProj.command); }
    } else if (slashNoProj && ['capabilities', 'whatcanyoudo'].includes(slashNoProj.command)) {
      const block = buildCapabilityCatalogue();
      if (block) { projectlessBlocks.push(block); projectlessSources.push(slashNoProj.command); }
    }

    if (hasRoleLens(userRole) && projectlessSources.some(s => ROLE_FRAMEABLE_SOURCES.has(s))) {
      const lensBlock = buildRoleLensBlock(userRole as UserRole);
      if (lensBlock) { projectlessBlocks.push(lensBlock); projectlessSources.push('role-lens'); }
    }

    const wisdomOrChallengeFamily = [...wisdomFamily, ...challengeFamily, 'decide', 'tradeoff', 'framework', 'meeting', 'agency', 'tactics', 'position', 'landscape', 'compete', 'align', 'capabilities', 'whatcanyoudo'];
    return {
      block: projectlessBlocks.join('\n'),
      sources: projectlessSources,
      enrichmentMeta: {
        sourcesAttempted: projectlessSources.length,
        sourcesSucceeded: [...projectlessSources],
        sourcesFailed: [],
        triggerType: projectlessSources.length > 0 ? (slashNoProj ? 'slash_command' : 'natural_language') : 'none',
        detectedCommand: slashNoProj && wisdomOrChallengeFamily.includes(slashNoProj.command) ? slashNoProj.command : undefined,
        hasProjectContext: false,
      },
    };
  }

  // ── Always inject project intelligence summary when available ──
  if (canonicalGovernedState) {
    const envelope = buildAnaGovernedContextEnvelope(canonicalGovernedState);
    blocks.push(
      `\n\n## Governed Execution Envelope\nDecision: ${envelope.decisionSummary}\nReadiness: ${envelope.readinessSummary}\nArtifact: ${envelope.artifactSummary}\nTop blockers: ${envelope.topBlockers.join('; ') || 'none'}\nTop warnings: ${envelope.topWarnings.join('; ') || 'none'}\nNext action: ${envelope.nextRecommendedAction}\nGates: ${envelope.exportPublishReadinessSummary}\nUnresolved decisions: ${envelope.unresolvedGovernedDecisionSummary}\nRIM signals: ${envelope.topRimSignals.join(', ') || 'none'}\nFreshness: ${envelope.freshnessTimestamp}`
    );
    sources.push('governed-envelope');
  }

  // ── Always inject project intelligence summary when available ──
  const projectSummary = await enrichWithProjectSummary(projectId, organizationId).catch(() => '');
  if (projectSummary) {
    blocks.push(projectSummary);
    sources.push('project-profile');
  }

  // ── Always inject workflow status when submission type is known ──
  if (submissionType) {
    const workflowCtx = await buildWorkflowContext(projectId, submissionType, organizationId).catch(() => '');
    if (workflowCtx) {
      blocks.push(workflowCtx);
      sources.push('workflow');
    }
  }

  // ── Check for slash commands first ──
  const slash = detectSlashCommand(message);
  if (slash) {
    const enrichMap: Record<string, () => Promise<string>> = {
      risk: () => Promise.all([enrichWithForesight(projectId, organizationId), enrichWithCRLRTF(projectId, organizationId)]).then(r => r.join('')),
      readiness: () => enrichWithReadiness(projectId, organizationId),
      precedent: () => enrichWithPrecedents(projectId, organizationId),
      draft: () =>
        Promise.resolve(detectDocumentType(slash.args || message))
          .then(doc => (doc ? buildDocumentGenerationContext(doc) : '\n\n## Draft Request Context\nNo specific document type detected. Ask which CTD section or artifact to draft, then produce submission-ready content.')),
      preflight: () =>
        Promise.all([
          enrichWithReadiness(projectId, organizationId),
          submissionType ? buildWorkflowContext(projectId, submissionType, organizationId) : Promise.resolve(''),
          enrichWithClaims(projectId, organizationId),
          enrichWithCRLRTF(projectId, organizationId),
        ]).then(r => r.join('')),
      claims: () => enrichWithClaims(projectId, organizationId),
      recommend: () => enrichWithRecommendations(projectId, organizationId),
      next: () => enrichWithRecommendations(projectId, organizationId),
      signals: () => enrichWithSignals(projectId, organizationId),
      export: () =>
        Promise.resolve(
          '\n\n## Conversation Export Intent\nUser requested conversation export. Provide a concise markdown-ready output and include any critical action receipts from this turn.'
        ),
      simulate: () => enrichWithCRLRTF(projectId, organizationId),
      assess: () => Promise.all([
        enrichWithReadiness(projectId, organizationId),
        enrichWithRecommendations(projectId, organizationId),
        enrichWithSignals(projectId, organizationId),
        enrichWithForesight(projectId, organizationId),
      ]).then(r => r.join('')),
      twin: () => Promise.all([
        enrichWithClaims(projectId, organizationId),
        enrichWithCRLRTF(projectId, organizationId),
        enrichWithReadiness(projectId, organizationId),
      ]).then(r => r.join('')),
      consistency: () => enrichWithCrossModule(projectId, organizationId),
      deficiencies: () => enrichWithDeficiencies(submissionType),
      knowledge: () => enrichWithKnowledgeSearch(slash.args || message, projectId, organizationId),
      decisions: () => enrichWithDecisions(projectId, organizationId),
      sap: () => enrichWithBiostatContext(projectId, submissionType, organizationId),
      power: () => enrichWithBiostatContext(projectId, submissionType, organizationId),
      dose: () => enrichWithBiostatContext(projectId, submissionType, organizationId),
      defensibility: () => enrichWithBiostatContext(projectId, submissionType, organizationId),
      design: () => enrichWithBiostatContext(projectId, submissionType, organizationId),
      safety: () => enrichWithSafety(projectId),
      cmc: () => enrichWithCMC(projectId, organizationId),
      csr: () => enrichWithCSR(projectId),
      device: () => enrichWithDevice(projectId),
      diagnostics: () => enrichWithDiagnostics(projectId),
      cms: () => enrichWithCMS(projectId),
      ectd: () => enrichWithECTD(projectId),
      audit: () => Promise.all([enrichWithReadiness(projectId, organizationId), enrichWithClaims(projectId, organizationId)]).then(r => r.join('')),
      amend: () => enrichWithProjectMemory(projectId, ['document_version', 'change_impact', 'amendment_tracking'], 'Amendment Context', 'Relevant version history and change impact data.', 5, organizationId),
      review: () => Promise.all([enrichWithClaims(projectId, organizationId), enrichWithCRLRTF(projectId, organizationId)]).then(r => r.join('')),
      memo: () => enrichWithForesight(projectId, organizationId),
      brief: () => enrichWithCRLRTF(projectId, organizationId),
      strategy: () => Promise.all([enrichWithPrecedents(projectId, organizationId), enrichWithForesight(projectId, organizationId)]).then(r => r.join('')),
      freeze: () => enrichWithECTD(projectId),
      sign: () => enrichWithECTD(projectId),
      scan: () => Promise.all([enrichWithClaims(projectId, organizationId), enrichWithCRLRTF(projectId, organizationId)]).then(r => r.join('')),
      checklist: () => enrichWithReadiness(projectId, organizationId),
      submit: () => Promise.all([enrichWithReadiness(projectId, organizationId), enrichWithECTD(projectId)]).then(r => r.join('')),
      narrative: () => enrichWithSafety(projectId),
      report: () => Promise.all([enrichWithReadiness(projectId, organizationId), enrichWithClaims(projectId, organizationId)]).then(r => r.join('')),
      iss: () => enrichWithSafety(projectId),
      ise: () => enrichWithClaims(projectId, organizationId),
      ib: () => Promise.all([enrichWithSafety(projectId), enrichWithClaims(projectId, organizationId)]).then(r => r.join('')),
      smpc: () => enrichWithSafety(projectId),
      rmp: () => enrichWithSafety(projectId),
      uspi: () => enrichWithSafety(projectId),
      haq: () => Promise.all([enrichWithCRLRTF(projectId, organizationId), enrichWithPrecedents(projectId, organizationId), enrichWithClaims(projectId, organizationId)]).then(r => r.join('')),
      ask: () => enrichWithKnowledgeSearch(slash.args || message, projectId, organizationId),
      wisdom: () => Promise.resolve(buildIndustryWisdomBlock({ submissionType, message: slash.args || message })),
      guide: () => Promise.resolve(buildTourGuideBlock({ submissionType, message: slash.args || message })),
      playbook: () => Promise.resolve(buildTourGuideBlock({ submissionType, message: slash.args || message })),
      orient: () => Promise.resolve(buildTourGuideBlock({ submissionType, message: slash.args || message })),
      tour: () => Promise.resolve(buildTourGuideBlock({ submissionType, message: slash.args || message })),
      challenge: () => Promise.resolve(buildChallengeOrRedteam(slash.args || message, submissionType)),
      redteam: () => Promise.resolve(buildChallengeOrRedteam(slash.args || message, submissionType)),
      devil: () => Promise.resolve(buildChallengeOrRedteam(slash.args || message, submissionType)),
      decide: () => Promise.resolve(buildDecisionFrameworkBlock({ message: slash.args || message, segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slash.args || message), forceGeneric: true })),
      tradeoff: () => Promise.resolve(buildDecisionFrameworkBlock({ message: slash.args || message, segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slash.args || message), forceGeneric: true })),
      framework: () => Promise.resolve(buildDecisionFrameworkBlock({ message: slash.args || message, segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slash.args || message), forceGeneric: true })),
      meeting: () => Promise.resolve(buildAgencyTacticsBlock({ message: slash.args || message, segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slash.args || message), kind: 'meeting_prep', forceGeneric: true })),
      agency: () => Promise.resolve(buildAgencyTacticsBlock({ message: slash.args || message, segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slash.args || message), forceGeneric: true })),
      tactics: () => Promise.resolve(buildAgencyTacticsBlock({ message: slash.args || message, segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slash.args || message), forceGeneric: true })),
      position: () => Promise.resolve(buildCompetitiveForMessage(slash.args || message, submissionType, true)),
      landscape: () => Promise.resolve(buildCompetitiveForMessage(slash.args || message, submissionType, true)),
      compete: () => Promise.resolve(buildCompetitiveForMessage(slash.args || message, submissionType, true)),
      align: () => Promise.resolve(buildAlignmentBlock({ message: slash.args || message, segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slash.args || message), forceGeneric: true })),
      ich: () => Promise.resolve(buildIchGuidelineBlock({ message: slash.args || message, segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slash.args || message) ?? undefined })),
      guideline: () => Promise.resolve(buildIchGuidelineBlock({ message: slash.args || message, segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slash.args || message) ?? undefined })),
      guidelines: () => Promise.resolve(buildIchGuidelineBlock({ message: slash.args || message, segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slash.args || message) ?? undefined })),
      pathway: () => Promise.resolve(buildPathwaysBlock({ message: slash.args || message, segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slash.args || message) ?? undefined })),
      pathways: () => Promise.resolve(buildPathwaysBlock({ message: slash.args || message, segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slash.args || message) ?? undefined })),
      expedited: () => Promise.resolve(buildPathwaysBlock({ message: slash.args || message, segment: inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(slash.args || message) ?? undefined })),
      capabilities: () => Promise.resolve(buildCapabilityCatalogue()),
      whatcanyoudo: () => Promise.resolve(buildCapabilityCatalogue()),
      workflow: () => submissionType ? buildWorkflowContext(projectId, submissionType, organizationId) : Promise.resolve(''),
      status: () => Promise.all([
        enrichWithReadiness(projectId, organizationId),
        submissionType ? buildWorkflowContext(projectId, submissionType, organizationId) : Promise.resolve(''),
        enrichWithRecommendations(projectId, organizationId),
      ]).then(r => r.join('')),
      help: () => Promise.all([
        enrichWithReadiness(projectId, organizationId),
        enrichWithRecommendations(projectId, organizationId),
        enrichWithCMS(projectId),
        enrichWithDiagnostics(projectId),
      ]).then(r => r.join('')),
    };

    triggerType = 'slash_command';
    detectedCommand = slash.command;
    const enrichFn = enrichMap[slash.command];
    sourcesAttempted++;
    if (enrichFn) {
      const block = await enrichFn().catch(() => '');
      if (block) {
        blocks.push(block);
        sources.push(slash.command);
      } else {
        sourcesFailed.push(slash.command);
      }
    } else {
      // Command detected but no enrichment handler is wired for it yet.
      sourcesFailed.push(`slash_unhandled:${slash.command}`);
    }

    // Rewrite the message to be natural for the LLM
    const commandDescriptions: Record<string, string> = {
      risk: 'Analyze the risk profile and submission risk for this project.',
      readiness: 'Assess how ready this project is for submission.',
      precedent: 'Find and analyze relevant regulatory precedents for this project.',
      draft: slash.args || 'Draft the current section.',
      preflight: 'Run a preflight check on the current section/module.',
      claims: 'Analyze the evidence chain and identify unsupported claims.',
      recommend: 'What are the top priority actions I should take next?',
      next: 'What should I work on next? Prioritize by impact.',
      simulate: 'Simulate likely reviewer challenges and questions.',
      signals: 'Show me all accumulated regulatory intelligence signals.',
      assess: 'Run a comprehensive assessment of this project: readiness score, top recommendations, risk signals, and predictions. Give me the full picture.',
      twin: 'Run a submission twin analysis: evaluate claims vs evidence integrity, identify unsupported claims, simulate reviewer challenges, and assess submission fragility.',
      consistency: 'Analyze cross-module consistency: find stale references, status gaps, orphaned documents, and module dependency issues across the entire dossier.',
      deficiencies: `Show the known deficiency taxonomy for ${submissionType || 'this submission type'}. List critical deficiency patterns and common reviewer triggers.`,
      knowledge: slash.args ? `Search the project knowledge base for: ${slash.args}` : 'Show all knowledge atoms stored for this project.',
      decisions: 'Show the decision audit trail for this project. List recent decisions, current status, pending approvals, and execution receipts.',
      sap: slash.args ? `Generate a Statistical Analysis Plan for: ${slash.args}. Gather the study parameters, then call the generate_statistical_document tool with documentType "sap_section_draft" — its sample-size and power figures come from the validated deterministic engine. Never hand-calculate.` : 'Generate a Statistical Analysis Plan. Gather study parameters: indication, phase, primary endpoint, effect size, alpha/power, allocation, dropout, multiplicity, estimand and missing-data strategy. Then call the generate_statistical_document tool with documentType "sap_section_draft" to produce the SAP section grounded in the deterministic engine (use documentType "sample_size_rationale" for a standalone N justification). Never estimate sample size or power yourself.',
      power: slash.args ? `Calculate sample size and power for: ${slash.args}. Use the compute_sample_size tool — never hand-calculate the result.` : 'Calculate sample size and statistical power. Gather the parameters (study type, objective, endpoint type, effect size or control/treatment rates, alpha, target power, allocation ratio, dropout rate), then call the compute_sample_size tool — the platform\'s validated deterministic engine. Do NOT estimate or hand-calculate sample size or power; a fabricated number in a submission is a critical defect. Report the engine\'s numbers verbatim.',
      dose: slash.args ? `Design a dose escalation study for: ${slash.args}` : 'Design a dose escalation protocol. Ask for: starting dose, dose levels, target DLT rate, escalation method (3+3, BOIN, CRM, or Modified Fibonacci). If the design needs a sample-size or power figure, call the compute_sample_size tool rather than estimating.',
      defensibility: 'Run a statistical defensibility assessment. Gather the study design parameters, then call the assess_statistical_defensibility tool — it returns the deterministic engine\'s multi-dimension judgment (overall verdict and risk, per-dimension scores for evidence sufficiency, defensibility, reviewer sensitivity, claim risk, consistency, submission risk and endpoint-method fit, plus a fragility assessment and escalation reasons). Report its verdict and scores verbatim rather than estimating.',
      design: slash.args ? `Design a clinical trial for: ${slash.args}` : 'Help design the optimal clinical trial. Ask about: indication, phase, primary endpoint, comparator, and whether they need adaptive, basket, umbrella, or platform design features. For the sample-size and power figures, call the compute_sample_size tool — do not estimate them.',
      safety: slash.args ? `Generate safety narrative for: ${slash.args}` : 'Help with safety narrative work. Ask what format they need: CSR safety section, Investigator\'s Brochure, CER, briefing book, or DSUR. Gather adverse event context.',
      cmc: slash.args
        ? `Evaluate CMC for: ${slash.args}`
        : 'Run the cmc_status command for the active project, then summarise the resulting CMC source-object inventory, section approval state, stale sections, open contradictions, and the export-ready verdict. After the summary, suggest the highest-leverage next action (e.g. /m3 refresh, /m3 contradictions, classify an unmapped source).',
      csr: slash.args ? `Analyze CSR for: ${slash.args}` : 'Help with Clinical Study Report work. Ask which section (efficacy, safety, disposition, demographics) or whether they need ICH E3 validation.',
      device: slash.args ? `Analyze device submission for: ${slash.args}` : 'Help with medical device submission. Ask about: submission type (510(k), PMA, De Novo, EU MDR), predicate device, and classification.',
      diagnostics: slash.args ? `Analyze diagnostics/IVD strategy for: ${slash.args}` : 'Help with diagnostics and IVD strategy. Ask about intended use, analytical validation, clinical performance, cutoff strategy, and companion diagnostic requirements.',
      cms: slash.args ? `Analyze CMS/reimbursement strategy for: ${slash.args}` : 'Help with CMS and payer strategy. Ask about coding pathway, coverage evidence, payment assumptions, and value dossier requirements.',
      ectd: 'Show the eCTD module structure and help place artifacts in the correct CTD location. Reference Module 1-5 structure.',
      audit: slash.args ? `Audit this document/section: ${slash.args}. Read as a hostile reviewer. Check completeness, consistency, defensibility, and compliance. Produce findings with severity and concrete fixes.` : 'Audit the current section or document. Check completeness, consistency, defensibility, and ICH compliance. Produce specific findings with severity ratings.',
      amend: slash.args ? `Amend/revise: ${slash.args}. Identify affected sections, rewrite only what changed, track changes with regulatory impact.` : 'Help amend the current document. Identify what changed, which sections are affected, rewrite with change tracking.',
      review: 'Conduct a regulatory review of the current section. Think like an FDA/EMA reviewer. Flag weaknesses, unsupported claims, and likely deficiency triggers.',
      memo: slash.args ? `Generate a risk memo for: ${slash.args}` : 'Generate a Regulatory Risk Assessment Memo with go/conditional-go/no-go recommendation.',
      brief: slash.args ? `Generate a reviewer brief for: ${slash.args}` : 'Generate a Reviewer Question Anticipation Brief with prepared answers for likely reviewer questions.',
      strategy: slash.args ? `Generate a strategy note for: ${slash.args}` : 'Generate a Regulatory Strategy Note with pathway analysis, argument hierarchy, and timeline.',
      freeze: 'Freeze the current document. Create an immutable snapshot with SHA256 hash. No further edits possible without creating a new version.',
      sign: 'Request electronic signature on the current document. Requires user PIN confirmation. Roles: AUTHOR, REVIEWER, or APPROVER.',
      scan: slash.args ? `Scan for deficiencies in: ${slash.args}` : 'Scan the current section/document for regulatory deficiencies. Check completeness, missing keywords, placeholder text, and compliance gaps.',
      checklist: 'Generate a regulatory compliance checklist for the current document. Auto-populate based on section content and citation tokens.',
      submit: 'Submit the current document to the regulatory workflow. Check readiness first, then update status to SUBMITTED.',
      narrative: slash.args ? `Generate a safety narrative for: ${slash.args}` : 'Generate a safety narrative. Ask what format: aggregate TEAE, SAE case narrative, benefit-risk, DSUR, or cross-study safety.',
      report: slash.args ? `Generate a regulatory report on: ${slash.args}` : 'Generate a full regulatory report. Ask for domain: submission readiness, clinical study, CMC, pharmacovigilance, compliance, strategic intelligence.',
      iss: 'Generate an Integrated Summary of Safety (ISS) — pooled safety analysis across all studies for this product.',
      ise: 'Generate an Integrated Summary of Efficacy (ISE) — pooled efficacy analysis across pivotal studies.',
      ib: 'Generate or update the Investigator\'s Brochure (IB) with all available nonclinical and clinical data.',
      smpc: 'Generate a Summary of Product Characteristics (SmPC) per EMA QRD template.',
      rmp: 'Generate or update the Risk Management Plan (RMP) per EMA GVP Module V.',
      uspi: 'Generate US Prescribing Information (USPI) per FDA Physician Labeling Rule.',
      workflow: 'Show the full submission workflow status. List all phases, steps completed vs remaining, critical blockers, and the next step the user should take. Be directive.',
      status: 'Give a quick project status briefing: readiness score, workflow progress, top 3 blockers, and the single most important next action. Keep it concise — 5-7 lines max.',
      help: 'The user is asking what you can do. Look at their project state and suggest 3-4 specific things you can do RIGHT NOW. Show, don\'t tell. Demonstrate by referencing their actual readiness score, gaps, and recommendations.',
      haq: slash.args
        ? `Draft a health authority question response for: ${slash.args}. Include cited evidence, known/unknown boundaries, and next required action.`
        : 'Draft a health authority question response. Ask for agency, exact question text, impacted section, and supporting evidence, then provide a defensible response structure.',
      ask: slash.args
        ? `Search the project data room and knowledge memory for: ${slash.args}. Return relevant findings with confidence and source category.`
        : 'Search the project data room and knowledge memory for the most relevant recent items. Summarize with confidence and source category.',
      wisdom: slash.args
        ? `Apply the experiential industry wisdom that bears on: ${slash.args}. For each relevant heuristic, connect the pattern to the user's situation, name the consequence before they hit it, and recommend the veteran move. Reason with the wisdom — do not just list it.`
        : 'Surface the experiential industry wisdom that bears on the user\'s current segment and stage. Apply the relevant heuristics to their situation rather than reciting them.',
      guide: slash.args
        ? `Act as a tour guide for: ${slash.args}. Orient the user — where they are, what matters now, and the two or three moves people in their situation usually make next. Close with one concrete offer.`
        : 'Act as a tour guide. Orient the user: where they are in their program, what matters most right now, and the few moves people in their situation usually make next. If the segment is unclear, ask one question to place them. Close with a single concrete offer.',
      playbook: slash.args
        ? `Walk the user through the relevant use-case playbook for: ${slash.args}. Name the first moves and the pitfall to watch.`
        : 'Walk the user through the use-case playbook that fits their situation. Name the first moves and the pitfall to watch, then offer the first step.',
      orient: 'Orient the user: name where they are, what matters now, and the common next moves for their segment and stage. Keep it short and specific.',
      tour: 'Give the user a guided tour of what matters for their segment and stage — the canonical journeys, the first moves, and the pitfalls. Do not dump the whole map; lead with what bears on them now.',
      challenge: slash.args
        ? `Red-team this plan: ${slash.args}. Find the load-bearing assumption, name the biggest risk it carries, ground the objection, and offer the stronger path. Acknowledge what is right first; state the disagreement once.`
        : 'Red-team the user\'s current plan. Find the load-bearing assumption, name the single biggest risk, ground it in precedent or guidance, and offer the stronger alternative. Acknowledge what is right first, push back once, and end with a concrete better path.',
      redteam: 'Red-team the user\'s current plan. Find the load-bearing assumption, name the single biggest risk, ground it, and offer the stronger alternative — acknowledging what is right first.',
      devil: 'Play devil\'s advocate on the user\'s current plan. Surface the strongest objection a skeptical reviewer would raise, ground it, and offer the better path.',
      decide: slash.args
        ? `Help the user decide: ${slash.args}. Name the real trade-off, lay out what tilts it each way for their program, and give the deciding question. Recommend where you have a basis, but leave the call to them.`
        : 'Help the user reason through the strategic trade-off they are weighing. Name the real tension, lay out the factors that tilt it each way, and give the single question that resolves it. The call is theirs — surface the trade-off honestly rather than forcing one answer.',
      tradeoff: 'Frame the trade-off the user is weighing: the real tension, what tilts it each way for their program, and the deciding question. Do not pretend a hard trade-off has one obvious answer.',
      framework: 'Apply the relevant decision framework to the user\'s choice: name the trade-off, the tilt factors, and the deciding question. Recommend where you have a basis; leave the judgment call to them.',
      meeting: slash.args
        ? `Help the user prepare the agency meeting: ${slash.args}. Bring proposals and ask for agreement, rank the load-bearing questions, and treat the briefing package as the meeting.`
        : 'Help the user prepare an agency meeting. Frame questions as proposals seeking agreement, rank the three to five that matter, choose the right meeting type, and treat the briefing package as where the review team forms its view.',
      agency: 'Help the user run their agency interaction well — meeting preparation or response strategy. Apply the concrete tactics: proposals over open questions, answer exactly what is asked in the agency order, concede what cannot be defended, and anchor everything to the official minutes or letter.',
      tactics: 'Give the user the agency-interaction tactics that bear on their situation — the move, why it works, and the failure mode it avoids.',
      position: slash.args
        ? `Help the user position against the field: ${slash.args}. Read the relevant precedent and competitor labels, then position on the axis the agency rewards.`
        : 'Help the user position against the competitive landscape. Read precedent for where it actually transfers, position against the approved label rather than marketing, and differentiate on the axis the agency rewards.',
      landscape: 'Read the competitive and precedent landscape for the user: which approvals transfer, what the labels actually claim, and where the failures mark the bar.',
      compete: 'Help the user compete: position against the competitor\'s approved label, differentiate on the axis the agency rewards, and treat a path that unwound for a rival as a raised bar, not an opening.',
      align: slash.args
        ? `Help the user align stakeholders on: ${slash.args}. Name the tension, tie it to the regulatory consequence that makes it matter, and give a concrete way to align the parties. The internal call is theirs.`
        : 'Help the user navigate an internal or partner tension. Name the friction, tie it to the regulatory consequence that makes it matter, and give a concrete way to align the parties around what moves the program. Make the trade-off visible; the internal decision is theirs.',
      capabilities: 'The user is asking what you can do. Use the grounded capability inventory in context. Do not recite it as a menu — name the two or three capabilities that fit their actual situation and offer to apply one now.',
      whatcanyoudo: 'The user is asking what you can do. Use the grounded capability inventory in context. Do not recite it as a menu — name the two or three capabilities that fit their actual situation and offer to apply one now.',
      ich: slash.args
        ? `Identify and explain the ICH guideline(s) relevant to: ${slash.args}. Cite the exact code and title from the reference block, say what it governs and why it matters here, and remind the user to confirm the current revision on ich.org.`
        : 'Orient the user to the relevant ICH guidelines using the reference block. Cite exact codes and titles; do not invent revisions.',
      guideline: 'Identify and explain the relevant ICH guideline using the reference block. Cite the exact code and title; confirm the current revision on ich.org.',
      guidelines: 'Identify and explain the relevant ICH guidelines using the reference block. Cite exact codes and titles; confirm the current revisions on ich.org.',
      pathway: slash.args
        ? `Identify the expedited / early-access pathways relevant to: ${slash.args}. Use the pathways reference block — name the agency, the program, who qualifies and what it gives the program; remind the user to confirm eligibility against current agency guidance.`
        : 'Orient the user to the relevant expedited / access pathways using the reference block. Name real programs per agency; do not invent designations.',
      pathways: 'Identify the relevant expedited / early-access pathways per agency using the reference block. Name real programs and their eligibility; confirm against current agency guidance.',
      expedited: 'Identify the relevant expedited development/review and early-access pathways per agency using the reference block. Name real programs and eligibility; confirm against current agency guidance.',
      export: 'Export this conversation.',
    };

    rewrittenMessage =
      commandDescriptions[slash.command] ||
      (slash.args ? `${slash.command.slice(1)} ${slash.args}` : message);
  }

  // ── @app mention detection (runs if no slash command) ──
  const appMention = !slash ? detectAppMention(message) : null;
  if (appMention) {
    triggerType = 'app_mention';
    detectedCommand = `@${appMention.appId}`;
    detectedAppMentionId = appMention.appId;

    // Resolve enrichment sources for this app
    const appEnrichFnMap: Record<string, () => Promise<string>> = {
      'foresight': () => enrichWithForesight(projectId, organizationId),
      'precedent': () => enrichWithPrecedents(projectId, organizationId),
      'device': () => enrichWithDevice(projectId),
      'readiness': () => enrichWithReadiness(projectId, organizationId),
      'safety': () => enrichWithSafety(projectId),
      'claims': () => enrichWithClaims(projectId, organizationId),
      'biostatistics': () => enrichWithBiostatContext(projectId, submissionType, organizationId),
      'ectd': () => enrichWithECTD(projectId),
    };

    const enrichSources = APP_ENRICHMENT_MAP[appMention.appId] || [];
    await Promise.allSettled(
      enrichSources.map(async sourceName => {
        sourcesAttempted++;
        const fn = appEnrichFnMap[sourceName];
        if (!fn) { sourcesFailed.push(`app-${sourceName}`); return; }
        try {
          const block = await fn();
          if (block) {
            blocks.push(block);
            sources.push(`app:${appMention.appId}/${sourceName}`);
          } else {
            sourcesFailed.push(`app:${appMention.appId}/${sourceName}`);
          }
        } catch {
          sourcesFailed.push(`app:${appMention.appId}/${sourceName}`);
        }
      })
    );

    // Inject app-specific system context header
    blocks.push(
      `\n\n## @${appMention.appId} App Context\nThe user invoked the **${appMention.appId}** specialist app. ` +
      `Focus your response on ${appMention.appId} domain expertise. ` +
      `User request: ${appMention.remainingText || '(no specific request — ask what they need)'}`
    );
    sources.push(`app:${appMention.appId}`);

    // Rewrite message to strip the @mention prefix
    rewrittenMessage = appMention.remainingText || message;
  }

  // ── Natural language trigger detection (runs if no slash command and no app mention) ──
  if (!slash && !appMention) {
    const triggers: Array<{ test: RegExp[]; fn: () => Promise<string>; name: string }> = [
      { test: FORESIGHT_TRIGGERS, fn: () => enrichWithForesight(projectId, organizationId), name: 'foresight' },
      { test: PRECEDENT_TRIGGERS, fn: () => enrichWithPrecedents(projectId, organizationId), name: 'precedent' },
      { test: CRL_RTF_TRIGGERS, fn: () => enrichWithCRLRTF(projectId, organizationId), name: 'deficiency' },
      { test: READINESS_TRIGGERS, fn: () => enrichWithReadiness(projectId, organizationId), name: 'readiness' },
      { test: RECOMMENDATION_TRIGGERS, fn: () => enrichWithRecommendations(projectId, organizationId), name: 'recommendations' },
      { test: CLAIMS_TRIGGERS, fn: () => enrichWithClaims(projectId, organizationId), name: 'claims' },
      { test: SIMULATION_TRIGGERS, fn: () => enrichWithCRLRTF(projectId, organizationId), name: 'simulation' },
      { test: BIOSTAT_TRIGGERS, fn: () => enrichWithBiostatContext(projectId, submissionType, organizationId), name: 'biostatistics' },
      { test: SAFETY_TRIGGERS, fn: () => enrichWithSafety(projectId), name: 'safety' },
      { test: CMC_TRIGGERS, fn: () => enrichWithCMC(projectId, organizationId), name: 'cmc' },
      { test: CSR_TRIGGERS, fn: () => enrichWithCSR(projectId), name: 'csr' },
      { test: DEVICE_TRIGGERS, fn: () => enrichWithDevice(projectId), name: 'device' },
      { test: DIAGNOSTICS_TRIGGERS, fn: () => enrichWithDiagnostics(projectId), name: 'diagnostics' },
      { test: CMS_TRIGGERS, fn: () => enrichWithCMS(projectId), name: 'cms' },
      { test: ECTD_TRIGGERS, fn: () => enrichWithECTD(projectId), name: 'ectd' },
      { test: HAQ_TRIGGERS, fn: () => Promise.all([enrichWithCRLRTF(projectId, organizationId), enrichWithPrecedents(projectId, organizationId)]).then(r => r.join('')), name: 'haq' },
      { test: WISDOM_TRIGGERS, fn: () => Promise.resolve(buildIndustryWisdomBlock({ submissionType, message })), name: 'industry-wisdom' },
      { test: WAYFINDING_TRIGGERS, fn: () => Promise.resolve(buildTourGuideBlock({ submissionType, message })), name: 'tour-guide' },
    ];

    const matchedFns = triggers.filter(t => matchesTriggers(message, t.test));

    if (matchedFns.length > 0) {
      triggerType = 'natural_language';
      await Promise.allSettled(
        matchedFns.map(async t => {
          sourcesAttempted++;
          try {
            const block = await t.fn();
            if (block) {
              blocks.push(block);
              sources.push(t.name);
            } else {
              sourcesFailed.push(t.name);
            }
          } catch { /* non-blocking enrichment — failure tracked in sourcesFailed */
            sourcesFailed.push(t.name);
          }
        })
      );
    }

    // ── Proactive constructive challenge — runs independent of other triggers ──
    // If the user asserts a plan experience says is risky, prime AnA to push
    // back politely rather than affirming it. This is the operational arm of
    // the persona's Constructive Dissent doctrine.
    const challengeSegment =
      inferSegmentFromSubmissionType(submissionType) ?? inferSegmentFromMessage(message);
    if (detectChallengeableClaims(message, challengeSegment).length > 0) {
      sourcesAttempted++;
      const challengeBlock = buildChallengeBlock({ message, segment: challengeSegment });
      if (challengeBlock) {
        blocks.push(challengeBlock);
        sources.push('constructive-challenge');
        if (triggerType === 'none') triggerType = 'natural_language';
      }
    }

    // ── Proactive decision framework — when the user is weighing a real choice ──
    if (detectRelevantFrameworks(message, challengeSegment).length > 0) {
      sourcesAttempted++;
      const frameworkBlock = buildDecisionFrameworkBlock({ message, segment: challengeSegment });
      if (frameworkBlock) {
        blocks.push(frameworkBlock);
        sources.push('decision-framework');
        if (triggerType === 'none') triggerType = 'natural_language';
      }
    }

    if (detectRelevantTactics(message, { segment: challengeSegment }).length > 0) {
      sourcesAttempted++;
      const tacticsBlock = buildAgencyTacticsBlock({ message, segment: challengeSegment });
      if (tacticsBlock) {
        blocks.push(tacticsBlock);
        sources.push('agency-tactics');
        if (triggerType === 'none') triggerType = 'natural_language';
      }
    }

    // ── Proactive competitive strategy — reading precedent or positioning ──
    if (detectRelevantPlays(message, { segment: challengeSegment }).length > 0) {
      sourcesAttempted++;
      const compBlock = buildCompetitiveBlock({ message, segment: challengeSegment });
      if (compBlock) {
        blocks.push(compBlock);
        sources.push('competitive-strategy');
        if (triggerType === 'none') triggerType = 'natural_language';
      }
    }

    // ── Proactive stakeholder alignment — internal / partner tensions ──
    if (detectRelevantAlignment(message, { segment: challengeSegment }).length > 0) {
      sourcesAttempted++;
      const alignBlock = buildAlignmentBlock({ message, segment: challengeSegment });
      if (alignBlock) {
        blocks.push(alignBlock);
        sources.push('stakeholder-alignment');
        if (triggerType === 'none') triggerType = 'natural_language';
      }
    }

    // ── Client attunement — read the human state and steady the delivery ──
    if (detectClientState(message)) {
      sourcesAttempted++;
      const attuneBlock = buildAttunementBlock(message);
      if (attuneBlock) {
        blocks.push(attuneBlock);
        sources.push('client-attunement');
        if (triggerType === 'none') triggerType = 'natural_language';
      }
    }

    // ── Claim-grounding guard — verify high-stakes factual claims before they ship ──
    if (detectClaimCategories(message).length > 0) {
      sourcesAttempted++;
      const groundingBlock = buildClaimGroundingBlock(message);
      if (groundingBlock) {
        blocks.push(groundingBlock);
        sources.push('claim-grounding');
        if (triggerType === 'none') triggerType = 'natural_language';
      }
    }

    // ── Scope-and-escalation guard — know the limits, hand off the rest ──
    if (detectScopeCategories(message).length > 0) {
      sourcesAttempted++;
      const scopeBlock = buildScopeGuardBlock(message);
      if (scopeBlock) {
        blocks.push(scopeBlock);
        sources.push('scope-guard');
        if (triggerType === 'none') triggerType = 'natural_language';
      }
    }

    // ── Proactive enrichment for greetings/help — inject status so AnA can lead ──
    const isGreeting = /^(hi|hello|hey|good\s*(morning|afternoon|evening)|what.?s up|how are you|help|what can you do)/i.test(message.trim());
    if (isGreeting && sources.length === 0) {
      triggerType = 'proactive';
      sourcesAttempted += 4;
      // Inject readiness + top recommendation + the license→submission journey +
      // any background AI work, so AnA opens a returning client's greeting with
      // where their program stands, the next move, and any investigation that
      // finished while they were away — not a bare hello.
      const [readinessBlock, recsBlock, journeyBlock, activityBlock] = await Promise.allSettled([
        enrichWithReadiness(projectId, organizationId),
        enrichWithRecommendations(projectId, organizationId),
        enrichWithClientJourney(organizationId, submissionType),
        enrichWithAgentActivity(organizationId),
      ]);
      if (journeyBlock.status === 'fulfilled' && journeyBlock.value) {
        blocks.push(journeyBlock.value);
        sources.push('proactive-client-journey');
      } else {
        sourcesFailed.push('proactive-client-journey');
      }
      if (activityBlock.status === 'fulfilled' && activityBlock.value) {
        blocks.push(activityBlock.value);
        sources.push('proactive-agent-activity');
      } else {
        sourcesFailed.push('proactive-agent-activity');
      }
      if (readinessBlock.status === 'fulfilled' && readinessBlock.value) {
        blocks.push(readinessBlock.value);
        sources.push('proactive-readiness');
      } else {
        sourcesFailed.push('proactive-readiness');
      }
      if (recsBlock.status === 'fulfilled' && recsBlock.value) {
        blocks.push(recsBlock.value);
        sources.push('proactive-recommendations');
      } else {
        sourcesFailed.push('proactive-recommendations');
      }

      // On a greeting, also hand AnA a tour-guide orientation so she can lead
      // with "where you are / what matters now / next moves" rather than a bare
      // status dump. Pure builder — no DB dependency.
      const tourBlock = buildTourGuideBlock({ submissionType, message });
      if (tourBlock) {
        blocks.push(tourBlock);
        sources.push('proactive-tour-guide');
      }
    }
  }

  // ── Document type detection — auto-detect what document the user wants ──
  const detectedDoc = detectDocumentType(message);
  if (detectedDoc && !slash) {
    // Only inject document generation context if the user seems to be requesting a draft
    const isDraftRequest = /\b(?:draft|write|generate|create|produce|build|prepare|compose)\b/i.test(message);
    if (isDraftRequest) {
      blocks.push(buildDocumentGenerationContext(detectedDoc));
      sources.push(`doc-${detectedDoc.type}`);
    }
  }

  // ── Role lens — frame the pack guidance for the audience, once, at the end ──
  if (hasRoleLens(userRole) && sources.some(s => ROLE_FRAMEABLE_SOURCES.has(s))) {
    const lensBlock = buildRoleLensBlock(userRole as UserRole);
    if (lensBlock) { blocks.push(lensBlock); sources.push('role-lens'); }
  }

  // ── Optional composer pass — relevance-rank + de-dup under a token budget ──
  // Engaged only when a budget is requested AND blocks/sources are 1:1 aligned
  // (some sources push metadata without a block; in that case we cannot safely
  // map blocks to priorities, so we fall back to the legacy join). Pure
  // re-ordering and budgeting — never changes truth.
  let composedBlock = blocks.join('\n');
  let composeTrace: ComposeTraceEntry[] | undefined;
  let composeTokensUsed: number | undefined;
  if (composeTokenBudget && composeTokenBudget > 0 && blocks.length === sources.length && blocks.length > 1) {
    const candidates: CandidateBlock[] = blocks.map((text, i) => ({
      source: sources[i],
      text,
      priority: priorityForSource(sources[i]),
      // Governed envelope and a crisis read must never be dropped.
      pinned: sources[i] === 'governed-envelope' || sources[i] === 'client-attunement',
    }));
    const composed = composeContext(message, candidates, { tokenBudget: composeTokenBudget, priorityMultipliers });
    composedBlock = composed.text;
    composeTrace = composed.trace;
    composeTokensUsed = composed.tokensUsed;
  }

  return {
    block: composedBlock,
    sources,
    rewrittenMessage,
    enrichmentMeta: {
      sourcesAttempted,
      sourcesSucceeded: [...sources],
      sourcesFailed,
      triggerType,
      detectedCommand,
      detectedAppMention: detectedAppMentionId,
      hasProjectContext: true,
      composeTrace,
      composeTokensUsed,
    },
  };
}
