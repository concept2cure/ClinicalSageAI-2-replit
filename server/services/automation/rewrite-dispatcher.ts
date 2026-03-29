/**
 * Automation Rewrite Dispatcher
 *
 * Watches for upstream data/document changes and dispatches AI-powered
 * section rewrites to affected downstream artifacts. This closes the
 * "auto-rewrite on data change" gap vs. Artos.
 *
 * Architecture:
 *  1. Upstream change event arrives (data update, source doc edit, assumption change)
 *  2. Reactive dependency service identifies affected artifacts + sections
 *  3. RIM change impact enriches with risk context
 *  4. Dispatcher queues AI rewrite actions for each affected section
 *  5. Webhook notifications sent to configured channels (Slack/Teams)
 *
 * @module server/services/automation/rewrite-dispatcher
 */

import { createScopedLogger } from '../../utils/logger.js';
import { enrichChangeImpact } from '../intelligence/rim-change-impact.js';
import type { RIMChangeEnrichment } from '../intelligence/rim-change-impact.js';

const log = createScopedLogger('rewrite-dispatcher');

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChangeSource =
  | 'source_document_updated'
  | 'tabular_data_changed'
  | 'assumption_updated'
  | 'regulatory_guidance_updated'
  | 'upstream_section_rewritten'
  | 'external_data_refreshed';

export type RewriteStrategy = 'full_rewrite' | 'targeted_update' | 'summary_refresh' | 'table_regeneration';

export type RewriteStatus = 'pending' | 'queued' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export interface ChangeEvent {
  readonly organizationId: number;
  readonly projectId: number;
  readonly source: ChangeSource;
  readonly sourceObjectType: string;
  readonly sourceObjectId: string;
  readonly sourceObjectLabel?: string;
  readonly changedFields?: string[];
  readonly changedBy: number;
  readonly timestamp: string;
}

export interface AffectedSection {
  readonly artifactId: number;
  readonly artifactTitle: string;
  readonly sectionCode: string;
  readonly sectionLabel: string;
  readonly impactLevel: 'critical' | 'high' | 'medium' | 'low';
  readonly strategy: RewriteStrategy;
  readonly reason: string;
}

export interface RewriteJob {
  readonly id: string;
  readonly changeEvent: ChangeEvent;
  readonly section: AffectedSection;
  readonly rimEnrichment: RIMChangeEnrichment | null;
  readonly status: RewriteStatus;
  readonly priority: number;
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly error?: string;
}

export interface DispatchResult {
  readonly changeEventId: string;
  readonly sectionsAnalyzed: number;
  readonly jobsDispatched: number;
  readonly jobsSkipped: number;
  readonly jobs: readonly RewriteJob[];
  readonly dispatchedAt: string;
}

// ─── Configuration ──────────────────────────────────────────────────────────

export interface AutomationConfig {
  /** Whether auto-rewrite is enabled (master switch) */
  enabled: boolean;
  /** Minimum impact level to trigger auto-rewrite (default: 'medium') */
  minImpactLevel: 'critical' | 'high' | 'medium' | 'low';
  /** Maximum concurrent rewrite jobs per project */
  maxConcurrentPerProject: number;
  /** Whether to require human approval before applying rewrites */
  requireApproval: boolean;
  /** Sections to exclude from auto-rewrite */
  excludedSections: string[];
  /** Cooldown between rewrites for the same section (ms) */
  sectionCooldownMs: number;
}

const DEFAULT_CONFIG: AutomationConfig = {
  enabled: true,
  minImpactLevel: 'medium',
  maxConcurrentPerProject: 5,
  requireApproval: true,
  excludedSections: [],
  sectionCooldownMs: 5 * 60 * 1000, // 5 minutes
};

// ─── Impact level ordering ──────────────────────────────────────────────────

const IMPACT_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function meetsImpactThreshold(level: string, minimum: string): boolean {
  return (IMPACT_ORDER[level] ?? 0) >= (IMPACT_ORDER[minimum] ?? 0);
}

// ─── Strategy selection ─────────────────────────────────────────────────────

function selectStrategy(source: ChangeSource, _sectionCode: string): RewriteStrategy {
  switch (source) {
    case 'tabular_data_changed':
      return 'table_regeneration';
    case 'upstream_section_rewritten':
      return 'targeted_update';
    case 'source_document_updated':
    case 'regulatory_guidance_updated':
      return 'full_rewrite';
    case 'assumption_updated':
    case 'external_data_refreshed':
      return 'summary_refresh';
    default:
      return 'targeted_update';
  }
}

// ─── Cooldown tracking (in-memory, bounded) ─────────────────────────────────

const recentRewrites = new Map<string, number>();
const MAX_COOLDOWN_ENTRIES = 10_000;

function cooldownKey(projectId: number, artifactId: number, sectionCode: string): string {
  return `${projectId}:${artifactId}:${sectionCode}`;
}

function isOnCooldown(key: string, cooldownMs: number): boolean {
  const lastRun = recentRewrites.get(key);
  if (!lastRun) return false;
  return Date.now() - lastRun < cooldownMs;
}

function recordRewrite(key: string): void {
  if (recentRewrites.size > MAX_COOLDOWN_ENTRIES) {
    // Evict oldest entries
    const entries = [...recentRewrites.entries()].sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < entries.length / 2; i++) {
      recentRewrites.delete(entries[i][0]);
    }
  }
  recentRewrites.set(key, Date.now());
}

// ─── Main Dispatcher ────────────────────────────────────────────────────────

let jobCounter = 0;

function generateJobId(): string {
  return `rw-${Date.now()}-${++jobCounter}`;
}

/**
 * Analyze a change event and dispatch rewrite jobs for affected sections.
 *
 * This is the main entry point. Call it when upstream data changes are detected.
 */
export async function dispatchRewrites(
  event: ChangeEvent,
  affectedSections: AffectedSection[],
  config: Partial<AutomationConfig> = {},
): Promise<DispatchResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const changeEventId = `ce-${Date.now()}-${event.sourceObjectId}`;

  if (!cfg.enabled) {
    log.info(`Auto-rewrite disabled — skipping ${affectedSections.length} sections`);
    return {
      changeEventId,
      sectionsAnalyzed: affectedSections.length,
      jobsDispatched: 0,
      jobsSkipped: affectedSections.length,
      jobs: [],
      dispatchedAt: new Date().toISOString(),
    };
  }

  const jobs: RewriteJob[] = [];
  let dispatched = 0;
  let skipped = 0;

  for (const section of affectedSections) {
    // Check impact threshold
    if (!meetsImpactThreshold(section.impactLevel, cfg.minImpactLevel)) {
      skipped++;
      continue;
    }

    // Check excluded sections
    if (cfg.excludedSections.includes(section.sectionCode)) {
      skipped++;
      continue;
    }

    // Check cooldown
    const key = cooldownKey(event.projectId, section.artifactId, section.sectionCode);
    if (isOnCooldown(key, cfg.sectionCooldownMs)) {
      log.info(`Section ${section.sectionCode} on cooldown — skipping`);
      skipped++;
      continue;
    }

    // Enrich with RIM intelligence
    let rimEnrichment: RIMChangeEnrichment | null = null;
    try {
      rimEnrichment = enrichChangeImpact(
        event.organizationId,
        event.projectId,
        section.sectionCode,
      );
    } catch (err) {
      log.warn(`RIM enrichment failed for ${section.sectionCode} — proceeding without`);
    }

    // Build the rewrite job
    const priority = IMPACT_ORDER[section.impactLevel] ?? 1;
    const job: RewriteJob = {
      id: generateJobId(),
      changeEvent: event,
      section,
      rimEnrichment,
      status: cfg.requireApproval ? 'pending' : 'queued',
      priority,
      createdAt: new Date().toISOString(),
    };

    jobs.push(job);
    recordRewrite(key);
    dispatched++;

    log.info(
      `Dispatched rewrite job ${job.id}: ${section.sectionCode} (${section.strategy}, priority=${priority})`,
    );
  }

  // Sort by priority (highest first)
  jobs.sort((a, b) => b.priority - a.priority);

  const result: DispatchResult = {
    changeEventId,
    sectionsAnalyzed: affectedSections.length,
    jobsDispatched: dispatched,
    jobsSkipped: skipped,
    jobs,
    dispatchedAt: new Date().toISOString(),
  };

  log.info(
    `Dispatch complete: ${dispatched} jobs queued, ${skipped} skipped out of ${affectedSections.length} sections`,
  );

  return result;
}

/**
 * Build affected sections list from reactive dependency propagation results.
 * Bridges the reactive-dependency-service output into rewrite dispatcher input.
 */
export function buildAffectedSections(
  propagationActions: Array<{ objectType: string; objectId: string; action: string; autoTriggered: boolean }>,
  changeSource: ChangeSource,
  artifactLookup: Map<string, { title: string; sectionCode: string; sectionLabel: string }>,
): AffectedSection[] {
  const sections: AffectedSection[] = [];

  for (const action of propagationActions) {
    if (action.objectType !== 'artifact') continue;

    const meta = artifactLookup.get(action.objectId);
    if (!meta) continue;

    const impactLevel = action.action.includes('stale') ? 'high'
      : action.action.includes('requires_review') ? 'medium'
      : action.action.includes('requires_reapproval') ? 'critical'
      : 'low';

    sections.push({
      artifactId: Number(action.objectId),
      artifactTitle: meta.title,
      sectionCode: meta.sectionCode,
      sectionLabel: meta.sectionLabel,
      impactLevel,
      strategy: selectStrategy(changeSource, meta.sectionCode),
      reason: `Upstream change triggered ${action.action} via dependency propagation`,
    });
  }

  return sections;
}

/**
 * Build the AI action prompt for a rewrite job.
 * Returns the prompt text to send to /ai/edit-section.
 */
export function buildRewritePrompt(job: RewriteJob): string {
  const { section, changeEvent, rimEnrichment } = job;

  const contextLines: string[] = [
    `Rewrite strategy: ${section.strategy}`,
    `Trigger: ${changeEvent.source} on ${changeEvent.sourceObjectType} "${changeEvent.sourceObjectLabel || changeEvent.sourceObjectId}"`,
    `Reason: ${section.reason}`,
  ];

  if (rimEnrichment && rimEnrichment.insights.length > 0) {
    contextLines.push('');
    contextLines.push('RIM Intelligence:');
    for (const insight of rimEnrichment.insights) {
      contextLines.push(`  - [${insight.severity}] ${insight.title}: ${insight.detail}`);
    }
    if (rimEnrichment.sectionTrend) {
      contextLines.push(`  Section trend: ${rimEnrichment.sectionTrend} (confidence: ${rimEnrichment.sectionTrendConfidence})`);
    }
  }

  const strategyInstructions: Record<RewriteStrategy, string> = {
    full_rewrite: 'Perform a complete rewrite of this section incorporating the latest source data. Maintain regulatory tone and citation standards.',
    targeted_update: 'Update only the portions of this section affected by the upstream change. Preserve unchanged content exactly.',
    summary_refresh: 'Refresh summary statements and conclusions to reflect updated upstream data. Preserve detailed analysis unchanged.',
    table_regeneration: 'Regenerate data tables and their accompanying narrative to reflect the updated tabular data. Ensure all statistics are recalculated.',
  };

  return [
    `AUTO-REWRITE: ${section.sectionLabel} (${section.sectionCode})`,
    '',
    strategyInstructions[section.strategy],
    '',
    ...contextLines,
  ].join('\n');
}
