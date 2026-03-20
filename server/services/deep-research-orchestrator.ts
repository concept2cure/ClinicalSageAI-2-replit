/**
 * @fileoverview AnA Research Orchestrator
 * @module server/services/deep-research-orchestrator
 *
 * Coordinates multi-source research jobs. Fans out queries to connectors,
 * aggregates results, uses LLM to synthesize findings, and populates
 * platform modules. Tracks job state in deepResearchJobs table.
 */

import { pool } from '../db.js';
import { searchConnectors } from './connectors/connector-registry.js';
import { recordUsage, checkQuota } from './usage-metering.js';
import type { ConnectorQuery, ConnectorResult } from './connectors/connector-interface.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DeepResearchRequest {
  organizationId: number;
  userId: number;
  projectId?: number;
  query: {
    indication: string;
    phase?: string;
    therapeuticArea?: string;
    sponsor?: string;
    intervention?: string;
    comparators?: string[];
    keywords?: string[];
    targetAgencies?: string[]; // FDA, EMA, PMDA, NMPA
  };
  connectorIds: string[];
  depth?: 'standard' | 'comprehensive'; // comprehensive costs more credits
}

export interface DeepResearchJob {
  id: number;
  uuid: string;
  organizationId: number;
  projectId: number | null;
  userId: number;
  status: 'queued' | 'running' | 'synthesizing' | 'complete' | 'failed';
  query: DeepResearchRequest['query'];
  progress: number;
  results: AggregatedResults | null;
  synthesis: string | null;
  creditsUsed: number;
  connectorLogs: Record<string, { status: string; resultCount: number; durationMs: number }>;
  createdAt: Date;
  completedAt: Date | null;
}

export interface AggregatedResults {
  totalResults: number;
  byConnector: Record<string, ConnectorResult[]>;
  topResults: ConnectorResult[];
  csrMatches: ConnectorResult[];
  regulatoryIntelligence: ConnectorResult[];
  literatureResults: ConnectorResult[];
}

// Active job progress callbacks (for SSE streaming)
const jobCallbacks = new Map<number, (progress: number, status: string, data?: any) => void>();

// ═══════════════════════════════════════════════════════════════════════════════
// JOB LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Launch a new deep research job.
 */
export async function launchResearchJob(request: DeepResearchRequest): Promise<DeepResearchJob> {
  // Check quota
  const quota = await checkQuota(request.organizationId, 'deep_research');
  if (!quota.allowed) {
    throw new Error(
      quota.upgradeRequired
        ? `AnA Research requires ${quota.upgradeRequired} tier or higher`
        : `AnA Research quota exceeded (${quota.remaining} remaining)`
    );
  }

  const creditsNeeded = request.depth === 'comprehensive' ? 3 : 1;

  // Create job record
  const result = await pool.query(
    `INSERT INTO deep_research_jobs
     (organization_id, project_id, user_id, status, query, progress, credits_used, connector_logs, created_at)
     VALUES ($1, $2, $3, 'queued', $4, 0, $5, '{}', NOW())
     RETURNING id, uuid, created_at`,
    [request.organizationId, request.projectId || null, request.userId,
     JSON.stringify(request.query), creditsNeeded]
  );

  const jobId = result.rows[0].id;

  // Record usage
  await recordUsage(request.organizationId, request.userId, 'deep_research', creditsNeeded, {
    jobId,
    connectors: request.connectorIds,
    depth: request.depth || 'standard',
  });

  // Start async execution (non-blocking)
  executeResearchJob(jobId, request).catch(err => {
    console.error(`[DeepResearch] Job ${jobId} failed:`, err);
    pool.query(
      `UPDATE deep_research_jobs SET status = 'failed', completed_at = NOW() WHERE id = $1`,
      [jobId]
    ).catch(() => {});
  });

  return getJobStatus(jobId);
}

/**
 * Execute the research job (runs async).
 */
async function executeResearchJob(jobId: number, request: DeepResearchRequest): Promise<void> {
  // Update status to running
  await updateJobProgress(jobId, 5, 'running');

  const connectorQuery: ConnectorQuery = {
    indication: request.query.indication,
    phase: request.query.phase,
    intervention: request.query.intervention,
    sponsor: request.query.sponsor,
    therapeuticArea: request.query.therapeuticArea,
    keywords: request.query.keywords,
    limit: request.depth === 'comprehensive' ? 50 : 20,
  };

  // Fan out to connectors
  await updateJobProgress(jobId, 15, 'running');
  const connectorResults = await searchConnectors(
    request.organizationId,
    request.connectorIds,
    connectorQuery
  );

  // Log per-connector results
  const connectorLogs: Record<string, any> = {};
  const byConnector: Record<string, ConnectorResult[]> = {};

  for (const cr of connectorResults) {
    connectorLogs[cr.connectorId] = {
      status: cr.error ? 'error' : 'success',
      resultCount: cr.results.length,
      error: cr.error,
    };
    byConnector[cr.connectorId] = cr.results;
  }

  await pool.query(
    `UPDATE deep_research_jobs SET connector_logs = $1 WHERE id = $2`,
    [JSON.stringify(connectorLogs), jobId]
  );

  await updateJobProgress(jobId, 60, 'running');

  // Aggregate and rank results
  const allResults = connectorResults.flatMap(cr => cr.results);
  const topResults = allResults
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 30);

  // Categorize
  const csrMatches = allResults.filter(r =>
    r.sourceConnector === 'clinical_trials_gov' || r.metadata?.nctId
  );
  const regulatoryIntelligence = allResults.filter(r =>
    ['fda_drugs', 'ema_epar', 'pmda_reviews', 'nmpa_cde'].includes(r.sourceConnector)
  );
  const literatureResults = allResults.filter(r =>
    r.sourceConnector === 'pubmed'
  );

  const aggregated: AggregatedResults = {
    totalResults: allResults.length,
    byConnector,
    topResults,
    csrMatches,
    regulatoryIntelligence,
    literatureResults,
  };

  await updateJobProgress(jobId, 75, 'synthesizing');

  // Generate LLM synthesis
  const synthesis = await generateSynthesis(request.query, aggregated);

  await updateJobProgress(jobId, 95, 'synthesizing');

  // Save final results
  await pool.query(
    `UPDATE deep_research_jobs SET
     status = 'complete', progress = 100, results = $1, synthesis = $2, completed_at = NOW()
     WHERE id = $3`,
    [JSON.stringify(aggregated), synthesis, jobId]
  );

  // Notify SSE listeners
  const cb = jobCallbacks.get(jobId);
  if (cb) {
    cb(100, 'complete', { resultsCount: allResults.length });
    jobCallbacks.delete(jobId);
  }
}

/**
 * Generate LLM synthesis of research results.
 */
async function generateSynthesis(
  query: DeepResearchRequest['query'],
  results: AggregatedResults
): Promise<string> {
  // Build a structured summary without calling external LLM (can be enhanced with OpenAI)
  const lines: string[] = [];
  lines.push(`## AnA Research Report: ${query.indication}`);
  lines.push('');
  lines.push(`**Query:** ${query.indication}${query.phase ? ` | Phase ${query.phase}` : ''}${query.therapeuticArea ? ` | ${query.therapeuticArea}` : ''}`);
  lines.push(`**Total sources analyzed:** ${results.totalResults}`);
  lines.push('');

  if (results.csrMatches.length > 0) {
    lines.push(`### Clinical Trials (${results.csrMatches.length} found)`);
    results.csrMatches.slice(0, 5).forEach(r => {
      lines.push(`- **${r.title}** — ${r.summary}`);
    });
    lines.push('');
  }

  if (results.regulatoryIntelligence.length > 0) {
    lines.push(`### Regulatory Intelligence (${results.regulatoryIntelligence.length} found)`);
    results.regulatoryIntelligence.slice(0, 5).forEach(r => {
      lines.push(`- **${r.title}** — ${r.summary}`);
    });
    lines.push('');
  }

  if (results.literatureResults.length > 0) {
    lines.push(`### Literature (${results.literatureResults.length} found)`);
    results.literatureResults.slice(0, 5).forEach(r => {
      lines.push(`- **${r.title}** — ${r.summary}`);
    });
    lines.push('');
  }

  lines.push('### Key Findings');
  lines.push(`- ${results.csrMatches.length} active/completed clinical trials identified`);
  lines.push(`- ${results.regulatoryIntelligence.length} regulatory approval records found`);
  lines.push(`- ${results.literatureResults.length} relevant publications indexed`);

  if (query.targetAgencies?.length) {
    lines.push(`- Target regulatory agencies: ${query.targetAgencies.join(', ')}`);
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// JOB QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

export async function getJobStatus(jobId: number): Promise<DeepResearchJob> {
  const result = await pool.query(
    `SELECT id, uuid, organization_id, project_id, user_id, status, query, progress,
            results, synthesis, credits_used, connector_logs, created_at, completed_at
     FROM deep_research_jobs WHERE id = $1`,
    [jobId]
  );

  if (result.rows.length === 0) throw new Error(`Job ${jobId} not found`);
  const row = result.rows[0];

  return {
    id: row.id,
    uuid: row.uuid,
    organizationId: row.organization_id,
    projectId: row.project_id,
    userId: row.user_id,
    status: row.status,
    query: row.query,
    progress: row.progress,
    results: row.results,
    synthesis: row.synthesis,
    creditsUsed: row.credits_used,
    connectorLogs: row.connector_logs || {},
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export async function listJobs(
  organizationId: number,
  limit = 20
): Promise<DeepResearchJob[]> {
  const result = await pool.query(
    `SELECT id, uuid, organization_id, project_id, user_id, status, query, progress,
            credits_used, connector_logs, created_at, completed_at
     FROM deep_research_jobs
     WHERE organization_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [organizationId, limit]
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    uuid: row.uuid,
    organizationId: row.organization_id,
    projectId: row.project_id,
    userId: row.user_id,
    status: row.status,
    query: row.query,
    progress: row.progress,
    results: null, // Don't load full results in list view
    synthesis: null,
    creditsUsed: row.credits_used,
    connectorLogs: row.connector_logs || {},
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }));
}

export async function cancelJob(jobId: number): Promise<void> {
  await pool.query(
    `UPDATE deep_research_jobs SET status = 'failed', completed_at = NOW() WHERE id = $1 AND status IN ('queued', 'running')`,
    [jobId]
  );
  jobCallbacks.delete(jobId);
}

/**
 * Register a progress callback for SSE streaming.
 */
export function onJobProgress(jobId: number, callback: (progress: number, status: string, data?: any) => void): void {
  jobCallbacks.set(jobId, callback);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function updateJobProgress(jobId: number, progress: number, status: string): Promise<void> {
  await pool.query(
    `UPDATE deep_research_jobs SET progress = $1, status = $2 WHERE id = $3`,
    [progress, status, jobId]
  );

  const cb = jobCallbacks.get(jobId);
  if (cb) cb(progress, status);
}

export default {
  launchResearchJob,
  getJobStatus,
  listJobs,
  cancelJob,
  onJobProgress,
};
