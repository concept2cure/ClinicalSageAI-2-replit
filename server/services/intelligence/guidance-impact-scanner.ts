/**
 * Guidance Change Impact Scanner (Feature 2.6).
 *
 * Detects when a regulatory guidance document's version changes (FDA,
 * EMA, ICH, HC) and flags every in-progress artifact whose CTD section
 * is mapped to that guidance. The mapping comes from two existing
 * registries already in the codebase — no new "guidance map" config:
 *
 *   1. server/services/ana/gap-classifier.ts → GAP_RULES
 *      Each rule has a free-form `guidance` string like
 *      'ICH M4Q(R1)' or 'ICH E3 §9.2' or
 *      'ICH M4Q(R1), 21 CFR 312.23(a)(7)'. Rules whose guidance string
 *      contains the changed family (e.g. 'ICH E6') match.
 *
 *   2. server/services/ind/ind-section-registry.ts → IND_SECTIONS
 *      Same shape — each section has a `guidance` string. Same matching.
 *
 * What "the family changed" means:
 *   - Input: a guidance code like 'ICH E6(R3)'.
 *   - Family: strip the version suffix (R\d+|v\d+|\d{4}-Q\d+) →
 *     'ICH E6'. CFR codes have no version suffix, family = code as-is.
 *   - Match: registry guidance.includes(family).
 *   - Severity: max severity across matching gap rules. When only IND
 *     sections match, default to 'major' for required sections,
 *     'minor' for optional.
 *
 * Idempotent: a re-scan against the same (artifact, guidance,
 * new_version) won't duplicate open / acknowledged alerts thanks to
 * the unique partial index. Resolved alerts CAN be re-raised when the
 * version moves again.
 *
 * @module server/services/intelligence/guidance-impact-scanner
 */
import { getPool } from '../../db/runtime.js';
import { GAP_RULES, type GapSeverity } from '../ana/gap-classifier.js';
import { IND_SECTIONS } from '../ind/ind-section-registry.js';

export type GuidanceAuthority =
  | 'ICH'
  | 'FDA'
  | 'EMA'
  | 'PMDA'
  | 'HC'
  | 'MHRA'
  | 'ICH-MULTIREGIONAL';

export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface GuidanceVersionUpsertInput {
  guidanceCode: string;
  authority: GuidanceAuthority;
  newVersion: string;
  sourceUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface GuidanceVersionUpsertResult {
  guidanceCode: string;
  authority: GuidanceAuthority;
  prevVersion: string | null;
  newVersion: string;
  changed: boolean;
  registryRowId: string;
}

export interface AffectedSection {
  ctdSection: string;
  source: 'gap_rule' | 'ind_section';
  ruleId?: string;
  /** When source='ind_section' — whether the section is required. */
  required?: boolean;
}

export interface GuidanceImpact {
  artifactId: string;
  artifactPk: number;
  projectId: number;
  organizationId: number;
  ctdSection: string | null;
  title: string;
  severity: GapSeverity;
  affectedSections: AffectedSection[];
}

export interface ScanGuidanceInput {
  guidanceCode: string;
  prevVersion: string | null;
  newVersion: string;
  authority: GuidanceAuthority;
  /** Restrict scan to one org. When omitted, scans every org. */
  organizationId?: number;
}

export interface ScanGuidanceResult {
  guidanceCode: string;
  newVersion: string;
  ctdSectionsMatched: string[];
  artifactsAffected: number;
  alertsCreated: number;
  alertsSkippedDuplicate: number;
}

// ─── Pure helpers (testable without a database) ──────────────────────

const VERSION_SUFFIX_RE = /\s*\(R\d+\)\s*$|\s*v\d+(?:\.\d+)*\s*$/i;

/**
 * Strip a version suffix from a guidance code so 'ICH E6(R3)' →
 * 'ICH E6'. CFR / un-versioned codes are returned as-is.
 */
export function extractGuidanceFamily(code: string): string {
  if (!code) return '';
  return code.replace(VERSION_SUFFIX_RE, '').trim();
}

/**
 * Walk gap-classifier rules + IND sections, return the CTD sections
 * whose `guidance` string contains the family of `guidanceCode`. Each
 * matching section carries a source tag and (when applicable) the
 * matching rule severity for downstream severity inference.
 */
export interface SectionMatch {
  ctdSection: string;
  source: 'gap_rule' | 'ind_section';
  ruleId?: string;
  severity?: GapSeverity;
  required?: boolean;
}

export function findSectionMatchesForGuidance(
  guidanceCode: string
): SectionMatch[] {
  const family = extractGuidanceFamily(guidanceCode).toLowerCase();
  if (!family) return [];
  const matches: SectionMatch[] = [];

  for (const rule of GAP_RULES) {
    if (rule.guidance.toLowerCase().includes(family)) {
      matches.push({
        ctdSection: rule.sectionCode,
        source: 'gap_rule',
        ruleId: rule.id,
        severity: rule.severity,
      });
    }
  }
  for (const section of IND_SECTIONS) {
    if (
      typeof section.guidance === 'string' &&
      section.guidance.toLowerCase().includes(family)
    ) {
      matches.push({
        ctdSection: section.code,
        source: 'ind_section',
        required: section.required,
      });
    }
  }
  return matches;
}

const SEVERITY_RANK: Record<GapSeverity, number> = {
  critical: 0,
  major: 1,
  minor: 2,
  info: 3,
};

/**
 * Compute the alert severity for an artifact given the matching
 * section rows. Highest gap-rule severity wins. When only IND-section
 * rows match, default to 'major' for required sections, 'minor'
 * otherwise.
 */
export function inferAlertSeverity(matches: SectionMatch[]): GapSeverity {
  let bestRank = SEVERITY_RANK.info + 1;
  let best: GapSeverity = 'info';
  let hasGapRule = false;
  for (const m of matches) {
    if (m.source === 'gap_rule' && m.severity) {
      hasGapRule = true;
      const r = SEVERITY_RANK[m.severity];
      if (r < bestRank) {
        bestRank = r;
        best = m.severity;
      }
    }
  }
  if (hasGapRule) return best;
  // No gap rule matched — fall back to IND-section heuristic.
  const anyRequired = matches.some(
    m => m.source === 'ind_section' && m.required === true
  );
  return anyRequired ? 'major' : 'minor';
}

// ─── Live entries ────────────────────────────────────────────────────

/**
 * Upsert a guidance version. If the row exists with a different
 * current_version, returns { changed: true } and the previous version.
 * Otherwise updates timestamps and returns { changed: false }.
 */
export async function upsertGuidanceVersion(
  input: GuidanceVersionUpsertInput
): Promise<GuidanceVersionUpsertResult> {
  const code = input.guidanceCode.trim();
  if (!code) {
    const err = new Error('guidanceCode is required');
    (err as any).code = 'INVALID_REQUEST';
    throw err;
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id, current_version
         FROM guidance_reference_index
        WHERE guidance_code = $1
        FOR UPDATE`,
      [code]
    );
    let registryRowId: string;
    let prevVersion: string | null = null;
    let changed = false;
    if (existing.rows.length === 0) {
      const inserted = await client.query(
        `INSERT INTO guidance_reference_index
           (guidance_code, authority, current_version, current_version_at,
            source_url, metadata)
         VALUES ($1, $2, $3, NOW(), $4, $5)
         RETURNING id`,
        [
          code,
          input.authority,
          input.newVersion,
          input.sourceUrl ?? null,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ]
      );
      registryRowId = inserted.rows[0].id;
      prevVersion = null;
      // First time we see a guidance — treat as a change so initial
      // alerts can fire on the first scan.
      changed = true;
    } else {
      const row = existing.rows[0];
      registryRowId = row.id;
      prevVersion = row.current_version;
      changed = prevVersion !== input.newVersion;
      await client.query(
        `UPDATE guidance_reference_index
            SET current_version    = $2,
                current_version_at = CASE WHEN current_version <> $2 THEN NOW() ELSE current_version_at END,
                authority          = $3,
                source_url         = COALESCE($4, source_url),
                metadata           = COALESCE($5::jsonb, metadata),
                updated_at         = NOW()
          WHERE id = $1`,
        [
          registryRowId,
          input.newVersion,
          input.authority,
          input.sourceUrl ?? null,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ]
      );
    }
    await client.query('COMMIT');
    return {
      guidanceCode: code,
      authority: input.authority,
      prevVersion,
      newVersion: input.newVersion,
      changed,
      registryRowId,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * For one (guidance, prevVersion → newVersion) change, find every
 * artifact whose CTD section maps to the guidance and persist a row in
 * guidance_alerts. Idempotent (unique partial index on
 * (org, artifact, code, new_version) WHERE status IN ('open','acknowledged')).
 */
export async function scanArtifactsForGuidanceChange(
  input: ScanGuidanceInput
): Promise<ScanGuidanceResult> {
  const matches = findSectionMatchesForGuidance(input.guidanceCode);
  const result: ScanGuidanceResult = {
    guidanceCode: input.guidanceCode,
    newVersion: input.newVersion,
    ctdSectionsMatched: Array.from(new Set(matches.map(m => m.ctdSection))).sort(),
    artifactsAffected: 0,
    alertsCreated: 0,
    alertsSkippedDuplicate: 0,
  };
  if (matches.length === 0) return result;

  // Group matches by ctdSection so each artifact in an affected section
  // gets a single alert row with the per-section breakdown.
  const matchesBySection = new Map<string, SectionMatch[]>();
  for (const m of matches) {
    let bucket = matchesBySection.get(m.ctdSection);
    if (!bucket) {
      bucket = [];
      matchesBySection.set(m.ctdSection, bucket);
    }
    bucket.push(m);
  }

  // Pull every artifact in the affected sections, scoped by org if given.
  const sectionList = Array.from(matchesBySection.keys());
  const orgFilter =
    typeof input.organizationId === 'number'
      ? 'AND organization_id = $2'
      : '';
  const sql = `
    SELECT id AS artifact_pk, artifact_id, organization_id, project_id,
           ctd_section, title
      FROM concept2cure_artifacts
     WHERE ctd_section = ANY($1::text[])
       ${orgFilter}
  `;
  const params: any[] =
    typeof input.organizationId === 'number'
      ? [sectionList, input.organizationId]
      : [sectionList];
  let rows: any[] = [];
  try {
    const queryResult = await getPool().query(sql, params);
    rows = queryResult.rows;
  } catch (err: any) {
    if (err?.code !== '42P01') throw err;
  }

  for (const row of rows) {
    const sectionMatches = matchesBySection.get(row.ctd_section) ?? [];
    if (sectionMatches.length === 0) continue;
    const severity = inferAlertSeverity(sectionMatches);
    const affectedSections: AffectedSection[] = sectionMatches.map(m => ({
      ctdSection: m.ctdSection,
      source: m.source,
      ruleId: m.ruleId,
      required: m.required,
    }));

    try {
      const insertResult = await getPool().query(
        `INSERT INTO guidance_alerts (
           organization_id, project_id, artifact_id, artifact_pk,
           guidance_code, guidance_authority,
           prev_version, new_version,
           severity, affected_sections, metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (organization_id, artifact_id, guidance_code, new_version)
           WHERE status IN ('open', 'acknowledged')
         DO NOTHING
         RETURNING id`,
        [
          row.organization_id,
          row.project_id,
          row.artifact_id,
          row.artifact_pk,
          input.guidanceCode,
          input.authority,
          input.prevVersion,
          input.newVersion,
          severity,
          JSON.stringify(affectedSections),
          JSON.stringify({
            scannedAt: new Date().toISOString(),
            sectionMatchSources: Array.from(
              new Set(sectionMatches.map(m => m.source))
            ),
          }),
        ]
      );
      if (insertResult.rows.length > 0) {
        result.alertsCreated += 1;
      } else {
        result.alertsSkippedDuplicate += 1;
      }
      result.artifactsAffected += 1;
    } catch (err: any) {
      // Tolerant of missing tables in dev / test envs.
      if (err?.code !== '42P01') {
        console.warn(
          '[guidance-impact-scanner] alert insert failed:',
          err?.message || err
        );
      }
    }
  }
  return result;
}

/**
 * Combined: upsert a version + scan in one call. The common path for
 * a guidance feed webhook ingest.
 */
export async function ingestGuidanceUpdate(
  input: GuidanceVersionUpsertInput & { organizationId?: number }
): Promise<{
  upsert: GuidanceVersionUpsertResult;
  scan: ScanGuidanceResult | null;
}> {
  const upsert = await upsertGuidanceVersion(input);
  if (!upsert.changed) {
    return { upsert, scan: null };
  }
  const scan = await scanArtifactsForGuidanceChange({
    guidanceCode: upsert.guidanceCode,
    prevVersion: upsert.prevVersion,
    newVersion: upsert.newVersion,
    authority: input.authority,
    organizationId: input.organizationId,
  });
  return { upsert, scan };
}

// ─── Alert lifecycle ─────────────────────────────────────────────────

export interface ListGuidanceAlertsOptions {
  organizationId: number;
  projectId?: number;
  artifactId?: string;
  status?: AlertStatus | AlertStatus[];
  severity?: GapSeverity;
  limit?: number;
  offset?: number;
}

export async function listGuidanceAlerts(
  options: ListGuidanceAlertsOptions
): Promise<{
  rows: any[];
  total: number;
}> {
  const filters: string[] = ['organization_id = $1'];
  const params: any[] = [options.organizationId];
  if (typeof options.projectId === 'number') {
    params.push(options.projectId);
    filters.push(`project_id = $${params.length}`);
  }
  if (options.artifactId) {
    params.push(options.artifactId);
    filters.push(`artifact_id = $${params.length}`);
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
    // Default: only open + acknowledged.
    params.push(['open', 'acknowledged']);
    filters.push(`status = ANY($${params.length}::text[])`);
  }
  const where = `WHERE ${filters.join(' AND ')}`;
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const offset = Math.max(0, options.offset ?? 0);

  try {
    const [rowsResult, countResult] = await Promise.all([
      getPool().query(
        `SELECT * FROM guidance_alerts ${where}
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
        `SELECT COUNT(*)::int AS c FROM guidance_alerts ${where}`,
        params
      ),
    ]);
    return {
      rows: rowsResult.rows,
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
      `UPDATE guidance_alerts
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

export async function acknowledgeGuidanceAlert(
  alertId: string,
  organizationId: number,
  userId: number | null
): Promise<{ ok: boolean; row: any | null }> {
  return transitionAlert(alertId, organizationId, 'acknowledged', userId);
}

export async function resolveGuidanceAlert(
  alertId: string,
  organizationId: number,
  userId: number | null
): Promise<{ ok: boolean; row: any | null }> {
  return transitionAlert(alertId, organizationId, 'resolved', userId);
}
