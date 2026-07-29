/**
 * Cross-artifact consistency scanner.
 *
 * Walks the project's citation graph for contradicts edges (every
 * sentence in artifact A whose citation source from artifact B carries
 * relationship='contradicts') and persists each as a row in
 * cross_artifact_consistency_alerts.
 *
 * Severity inference: for the source sentence's CTD section, find the
 * highest-priority gap-classifier rule. If no rule matches, default to
 * 'major' (a contradiction always matters; the question is just how
 * much).
 *
 * Idempotency: the unique partial index on (org, project, artifactA,
 * artifactB, sentenceContentHash) WHERE status IN ('open','acknowledged')
 * makes re-scans safe. Resolved alerts can be re-raised when the
 * contradiction reappears in a later scan.
 *
 * @module server/services/intelligence/cross-artifact-consistency-scanner
 */
import { getPool } from '../../db/runtime.js';
import {
  GAP_RULES,
  type GapSeverity,
  type GapRule,
} from '../ana/gap-classifier.js';
import type { SentenceCitation } from '../ana/citation-engine.js';

export type ConsistencyAlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface ConsistencyAlertRecord {
  id: string;
  organizationId: number;
  projectId: number;
  artifactAId: string;
  artifactAPk: number;
  artifactACtdSection: string | null;
  sentenceContentHash: string;
  sentenceText: string;
  artifactBId: string;
  artifactBPk: number;
  artifactBCtdSection: string | null;
  contradictingPassage: string | null;
  severity: GapSeverity;
  severityRuleId: string | null;
  status: ConsistencyAlertStatus;
  acknowledgedAt: string | null;
  acknowledgedBy: number | null;
  resolvedAt: string | null;
  resolvedBy: number | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ScanProjectConsistencyResult {
  projectId: number;
  organizationId: number;
  asOf: string;
  contradictionsFound: number;
  alertsCreated: number;
  alertsSkippedDuplicate: number;
  artifactsAffected: number;
}

// ─── Pure helpers ────────────────────────────────────────────────────

const SEVERITY_RANK: Record<GapSeverity, number> = {
  critical: 0,
  major: 1,
  minor: 2,
  info: 3,
};

/**
 * Pick the rule whose section matches `ctdSection` (exact or longest
 * prefix) with the highest severity. Returns null when no rule applies.
 *
 * Mirrors the matching strategy in classifyGap() but ignores the claim-
 * text patterns — for severity attribution we want every rule applicable
 * to the section, not just the ones whose patterns matched the original
 * sentence content.
 */
export function inferContradictionSeverity(
  ctdSection: string | null
): { severity: GapSeverity; ruleId: string | null } {
  if (!ctdSection) return { severity: 'major', ruleId: null };
  const normalized = ctdSection.trim();
  const candidates: Array<{ rule: GapRule; specificity: number }> = [];
  for (const rule of GAP_RULES) {
    let specificity = -1;
    if (rule.prefix) {
      if (
        normalized === rule.sectionCode ||
        normalized.startsWith(rule.sectionCode + '.')
      ) {
        specificity = rule.sectionCode.length;
      }
    } else if (rule.sectionCode === normalized) {
      specificity = 1000;
    }
    if (specificity >= 0) candidates.push({ rule, specificity });
  }
  if (candidates.length === 0) return { severity: 'major', ruleId: null };
  candidates.sort((a, b) => {
    const sevDelta =
      SEVERITY_RANK[a.rule.severity] - SEVERITY_RANK[b.rule.severity];
    if (sevDelta !== 0) return sevDelta;
    return b.specificity - a.specificity;
  });
  const winner = candidates[0];
  return { severity: winner.rule.severity, ruleId: winner.rule.id };
}

interface ContradictionEdge {
  artifactAId: string;
  artifactAPk: number;
  artifactACtdSection: string | null;
  sentence: SentenceCitation;
  artifactBId: string;
  artifactBPk: number;
  artifactBCtdSection: string | null;
  contradictingPassage: string | null;
}

/**
 * Pure: walk a list of artifact citation bundles and return every
 * contradicts edge. Self-edges and edges pointing at artifacts NOT in
 * the project's set are skipped.
 */
export function collectContradictionEdges(
  bundles: Array<{
    artifactId: string;
    artifactPk: number;
    ctdSection: string | null;
    citations: SentenceCitation[];
  }>
): ContradictionEdge[] {
  const inProject = new Map<
    string,
    { artifactPk: number; ctdSection: string | null }
  >();
  for (const b of bundles) {
    inProject.set(b.artifactId, {
      artifactPk: b.artifactPk,
      ctdSection: b.ctdSection,
    });
  }

  const edges: ContradictionEdge[] = [];
  for (const b of bundles) {
    for (const sentence of b.citations) {
      for (const src of sentence.sources) {
        if (src.relationship !== 'contradicts') continue;
        if (!src.artifactId) continue;
        if (src.artifactId === b.artifactId) continue;
        const targetMeta = inProject.get(src.artifactId);
        if (!targetMeta) continue; // out of project
        edges.push({
          artifactAId: b.artifactId,
          artifactAPk: b.artifactPk,
          artifactACtdSection: b.ctdSection,
          sentence,
          artifactBId: src.artifactId,
          artifactBPk: targetMeta.artifactPk,
          artifactBCtdSection: targetMeta.ctdSection,
          contradictingPassage: src.passageSnippet ?? null,
        });
      }
    }
  }
  return edges;
}

// ─── Live entries ────────────────────────────────────────────────────

/**
 * Scan a project for cross-artifact contradictions. Pulls every
 * artifact's citations JSONB, walks the contradicts edges, and inserts
 * one alert per (artifactA, artifactB, sentenceContentHash) triple via
 * ON CONFLICT DO NOTHING. Tenant-scoped.
 */
export async function scanProjectConsistency(
  projectId: number,
  organizationId: number
): Promise<ScanProjectConsistencyResult> {
  const startedAt = Date.now();
  const result: ScanProjectConsistencyResult = {
    projectId,
    organizationId,
    asOf: new Date(startedAt).toISOString(),
    contradictionsFound: 0,
    alertsCreated: 0,
    alertsSkippedDuplicate: 0,
    artifactsAffected: 0,
  };

  let bundles: Array<{
    artifactId: string;
    artifactPk: number;
    ctdSection: string | null;
    citations: SentenceCitation[];
  }> = [];
  try {
    const { rows } = await getPool().query(
      `SELECT id AS artifact_pk, artifact_id, ctd_section, citations
         FROM concept2cure_artifacts
        WHERE project_id = $1
          AND organization_id = $2`,
      [projectId, organizationId]
    );
    bundles = rows.map((r: any) => ({
      artifactId: r.artifact_id,
      artifactPk: r.artifact_pk,
      ctdSection: r.ctd_section,
      citations: Array.isArray(r.citations) ? (r.citations as SentenceCitation[]) : [],
    }));
  } catch (err: any) {
    if (err?.code === '42P01') return result;
    throw err;
  }

  const edges = collectContradictionEdges(bundles);
  result.contradictionsFound = edges.length;
  if (edges.length === 0) return result;

  const affectedArtifacts = new Set<string>();
  for (const edge of edges) {
    affectedArtifacts.add(edge.artifactAId);
    const { severity, ruleId } = inferContradictionSeverity(
      edge.artifactACtdSection
    );
    try {
      const insertResult = await getPool().query(
        `INSERT INTO cross_artifact_consistency_alerts (
           organization_id, project_id,
           artifact_a_id, artifact_a_pk, artifact_a_ctd_section,
           sentence_content_hash, sentence_text,
           artifact_b_id, artifact_b_pk, artifact_b_ctd_section,
           contradicting_passage,
           severity, severity_rule_id,
           metadata
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
         )
         ON CONFLICT (organization_id, project_id, artifact_a_id, artifact_b_id, sentence_content_hash)
           WHERE status IN ('open','acknowledged')
         DO NOTHING
         RETURNING id`,
        [
          organizationId,
          projectId,
          edge.artifactAId,
          edge.artifactAPk,
          edge.artifactACtdSection,
          edge.sentence.contentHash,
          edge.sentence.text,
          edge.artifactBId,
          edge.artifactBPk,
          edge.artifactBCtdSection,
          edge.contradictingPassage,
          severity,
          ruleId,
          JSON.stringify({
            scannedAt: new Date().toISOString(),
            sentenceIndex: edge.sentence.sentenceIndex,
            paragraphIndex: edge.sentence.paragraphIndex,
            sentenceStatus: edge.sentence.status,
          }),
        ]
      );
      if (insertResult.rows.length > 0) {
        result.alertsCreated += 1;
      } else {
        result.alertsSkippedDuplicate += 1;
      }
    } catch (err: any) {
      if (err?.code !== '42P01') {
        console.warn(
          '[consistency-scanner] insert failed:',
          err?.message || err
        );
      }
    }
  }
  result.artifactsAffected = affectedArtifacts.size;
  return result;
}

// ─── Alert lifecycle ─────────────────────────────────────────────────

export interface ListConsistencyAlertsOptions {
  organizationId: number;
  projectId?: number;
  artifactId?: string;
  status?: ConsistencyAlertStatus | ConsistencyAlertStatus[];
  severity?: GapSeverity;
  limit?: number;
  offset?: number;
}

export async function listConsistencyAlerts(
  options: ListConsistencyAlertsOptions
): Promise<{ rows: ConsistencyAlertRecord[]; total: number }> {
  const filters: string[] = ['organization_id = $1'];
  const params: any[] = [options.organizationId];
  if (typeof options.projectId === 'number') {
    params.push(options.projectId);
    filters.push(`project_id = $${params.length}`);
  }
  if (options.artifactId) {
    params.push(options.artifactId);
    filters.push(
      `(artifact_a_id = $${params.length} OR artifact_b_id = $${params.length})`
    );
  }
  if (options.severity) {
    params.push(options.severity);
    filters.push(`severity = $${params.length}`);
  }
  if (options.status) {
    const statuses = Array.isArray(options.status)
      ? options.status
      : [options.status];
    params.push(statuses);
    filters.push(`status = ANY($${params.length}::text[])`);
  } else {
    params.push(['open', 'acknowledged']);
    filters.push(`status = ANY($${params.length}::text[])`);
  }
  const where = `WHERE ${filters.join(' AND ')}`;
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const offset = Math.max(0, options.offset ?? 0);

  try {
    const [rowsResult, countResult] = await Promise.all([
      getPool().query(
        `SELECT * FROM cross_artifact_consistency_alerts ${where}
          ORDER BY
            CASE severity
              WHEN 'critical' THEN 0
              WHEN 'major' THEN 1
              WHEN 'minor' THEN 2
              WHEN 'info' THEN 3
            END,
            created_at DESC
          LIMIT ${limit} OFFSET ${offset}`,
        params
      ),
      getPool().query(
        `SELECT COUNT(*)::int AS c FROM cross_artifact_consistency_alerts ${where}`,
        params
      ),
    ]);
    return {
      rows: rowsResult.rows.map((r: any) => ({
        id: r.id,
        organizationId: r.organization_id,
        projectId: r.project_id,
        artifactAId: r.artifact_a_id,
        artifactAPk: r.artifact_a_pk,
        artifactACtdSection: r.artifact_a_ctd_section,
        sentenceContentHash: r.sentence_content_hash,
        sentenceText: r.sentence_text,
        artifactBId: r.artifact_b_id,
        artifactBPk: r.artifact_b_pk,
        artifactBCtdSection: r.artifact_b_ctd_section,
        contradictingPassage: r.contradicting_passage,
        severity: r.severity,
        severityRuleId: r.severity_rule_id,
        status: r.status,
        acknowledgedAt: r.acknowledged_at
          ? new Date(r.acknowledged_at).toISOString()
          : null,
        acknowledgedBy: r.acknowledged_by,
        resolvedAt: r.resolved_at
          ? new Date(r.resolved_at).toISOString()
          : null,
        resolvedBy: r.resolved_by,
        metadata: r.metadata,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      })),
      total: countResult.rows[0]?.c ?? 0,
    };
  } catch (err: any) {
    if (err?.code === '42P01') return { rows: [], total: 0 };
    throw err;
  }
}

async function transitionAlert(
  alertId: string,
  organizationId: number,
  toStatus: 'acknowledged' | 'resolved',
  userId: number | null
): Promise<{ ok: boolean; row: any | null }> {
  const setClauses: string[] = ['status = $3', 'updated_at = NOW()'];
  if (toStatus === 'acknowledged') {
    setClauses.push('acknowledged_at = NOW()');
    setClauses.push(`acknowledged_by = $4`);
  } else {
    setClauses.push('resolved_at = NOW()');
    setClauses.push(`resolved_by = $4`);
  }
  try {
    const result = await getPool().query(
      `UPDATE cross_artifact_consistency_alerts
          SET ${setClauses.join(', ')}
        WHERE id = $1
          AND organization_id = $2
        RETURNING *`,
      [alertId, organizationId, toStatus, userId]
    );
    if (result.rows.length === 0) return { ok: false, row: null };
    return { ok: true, row: result.rows[0] };
  } catch (err: any) {
    if (err?.code === '42P01') return { ok: false, row: null };
    throw err;
  }
}

export async function acknowledgeConsistencyAlert(
  alertId: string,
  organizationId: number,
  userId: number | null
): Promise<{ ok: boolean; row: any | null }> {
  return transitionAlert(alertId, organizationId, 'acknowledged', userId);
}

export async function resolveConsistencyAlert(
  alertId: string,
  organizationId: number,
  userId: number | null
): Promise<{ ok: boolean; row: any | null }> {
  return transitionAlert(alertId, organizationId, 'resolved', userId);
}

// ─── Org-scoped summary ──────────────────────────────────────────────

export interface ConsistencyAlertsSummary {
  organizationId: number;
  asOf: string;
  bySeverity: Record<GapSeverity, number>;
  byStatus: Record<ConsistencyAlertStatus, number>;
  totalOpen: number;
  openCritical: number;
  topProjects: Array<{ projectId: number; openCount: number }>;
  topArtifacts: Array<{ artifactId: string; openCount: number }>;
}

const TOP_LIST_CAP = 10;

export async function getConsistencyAlertsSummary(
  organizationId: number
): Promise<ConsistencyAlertsSummary> {
  const empty: ConsistencyAlertsSummary = {
    organizationId,
    asOf: new Date().toISOString(),
    bySeverity: { critical: 0, major: 0, minor: 0, info: 0 },
    byStatus: { open: 0, acknowledged: 0, resolved: 0 },
    totalOpen: 0,
    openCritical: 0,
    topProjects: [],
    topArtifacts: [],
  };

  try {
    const [sevRes, statRes, critRes, topProjectsRes, topArtifactsRes] =
      await Promise.all([
        getPool().query(
          `SELECT severity, COUNT(*)::int AS c
             FROM cross_artifact_consistency_alerts
            WHERE organization_id = $1
            GROUP BY severity`,
          [organizationId]
        ),
        getPool().query(
          `SELECT status, COUNT(*)::int AS c
             FROM cross_artifact_consistency_alerts
            WHERE organization_id = $1
            GROUP BY status`,
          [organizationId]
        ),
        getPool().query(
          `SELECT COUNT(*)::int AS c
             FROM cross_artifact_consistency_alerts
            WHERE organization_id = $1
              AND status IN ('open','acknowledged')
              AND severity = 'critical'`,
          [organizationId]
        ),
        getPool().query(
          `SELECT project_id, COUNT(*)::int AS open_count
             FROM cross_artifact_consistency_alerts
            WHERE organization_id = $1
              AND status IN ('open','acknowledged')
            GROUP BY project_id
            ORDER BY open_count DESC
            LIMIT $2`,
          [organizationId, TOP_LIST_CAP]
        ),
        getPool().query(
          `SELECT artifact_a_id AS artifact_id, COUNT(*)::int AS open_count
             FROM cross_artifact_consistency_alerts
            WHERE organization_id = $1
              AND status IN ('open','acknowledged')
            GROUP BY artifact_a_id
            ORDER BY open_count DESC
            LIMIT $2`,
          [organizationId, TOP_LIST_CAP]
        ),
      ]);
    const out = { ...empty };
    for (const r of sevRes.rows as Array<{ severity: GapSeverity; c: number }>) {
      out.bySeverity[r.severity] = Number(r.c) || 0;
    }
    for (const r of statRes.rows as Array<{
      status: ConsistencyAlertStatus;
      c: number;
    }>) {
      out.byStatus[r.status] = Number(r.c) || 0;
    }
    out.openCritical = Number(critRes.rows[0]?.c) || 0;
    out.totalOpen = out.byStatus.open + out.byStatus.acknowledged;
    out.topProjects = topProjectsRes.rows.map((r: any) => ({
      projectId: r.project_id,
      openCount: Number(r.open_count) || 0,
    }));
    out.topArtifacts = topArtifactsRes.rows.map((r: any) => ({
      artifactId: r.artifact_id,
      openCount: Number(r.open_count) || 0,
    }));
    return out;
  } catch (err: any) {
    if (err?.code === '42P01') return empty;
    throw err;
  }
}
