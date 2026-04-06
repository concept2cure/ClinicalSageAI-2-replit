/**
 * Module 3 Convergence Service
 *
 * Bridges uploaded project artifacts and the CMC source-object system.
 *
 * Responsibilities:
 *  1. Map uploaded artifacts → cmc_source_objects (with lineage)
 *  2. Track per-section build state across source objects, compile state,
 *     governed artifacts, contradictions, and staleness
 *  3. Bridge compile output → governed artifacts (concept2cure_artifacts)
 */
import { randomUUID } from 'crypto';
import { getPool } from '../db';
import { createSourceHash } from './cmc-module3-compiler';
import { composeModule3FromCanonicalSources, MODULE3_SECTION_RULES, tablesToMarkdown, CmcSourceType } from './module3Composer';

// ── Types ──────────────────────────────────────────────────────

export type Module3BuildState =
  | 'no_sources'
  | 'sources_uploaded'
  | 'extraction_pending'
  | 'extraction_complete'
  | 'compiled'
  | 'draft_artifact_created'
  | 'stale'
  | 'contradiction_flagged'
  | 'review'
  | 'approved'
  | 'locked';

export interface Module3SectionBuildStatus {
  sectionKey: string;
  sectionLabel: string;
  buildState: Module3BuildState;
  sourceObjectCount: number;
  sourceTypes: string[];
  completeness: number;
  missingInputs: string[];
  hasContradictions: boolean;
  contradictionCount: number;
  isStale: boolean;
  staleReason: string | null;
  approvalState: string;
  artifactId: string | null;
  artifactStatus: string | null;
  lastCompiled: string | null;
  lastUpdated: string | null;
}

export interface DossierUploadClassification {
  submissionTrack: 'IND' | 'NDA' | 'BLA' | '510K' | 'PMA' | 'SOP' | 'CER' | 'general';
  dossierModule: string | null;
  ctdSection: string | null;
  sourceType: CmcSourceType | null;
  useAsModule3Source: boolean;
  tags: string[];
}

// ── Section Label Map ──────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  '3.1': 'Quality — Table of Contents',
  '3.2.S.1': 'General Information',
  '3.2.S.2': 'Manufacture (Drug Substance)',
  '3.2.S.3': 'Characterisation',
  '3.2.S.4': 'Control of Drug Substance',
  '3.2.S.5': 'Reference Standards (Drug Substance)',
  '3.2.S.6': 'Container Closure System (Drug Substance)',
  '3.2.S.7': 'Stability (Drug Substance)',
  '3.2.P.1': 'Description & Composition',
  '3.2.P.2': 'Pharmaceutical Development',
  '3.2.P.3': 'Manufacture (Drug Product)',
  '3.2.P.4': 'Control of Excipients',
  '3.2.P.5': 'Control of Drug Product',
  '3.2.P.6': 'Reference Standards (Drug Product)',
  '3.2.P.7': 'Container Closure System (Drug Product)',
  '3.2.P.8': 'Stability (Drug Product)',
  '3.3': 'Literature References',
};

// ── Public API ─────────────────────────────────────────────────

/**
 * Returns a map of sectionKey → human-readable label for all 15 Module 3 subsections.
 */
export function getSectionLabels(): Record<string, string> {
  return { ...SECTION_LABELS };
}

/**
 * Returns Module3SectionBuildStatus[] for every subsection defined in MODULE3_SECTION_RULES.
 *
 * Queries cmc_source_objects, cmc_module3_sections, cmc_contradictions, and
 * concept2cure_artifacts to build a unified build-state view.
 */
export async function getModule3BuildStatus(
  orgId: number,
  projectId: string,
): Promise<Module3SectionBuildStatus[]> {
  const pool = getPool();

  // Parallel fetch of all four data sources
  const [sourceRes, sectionRes, contradictionRes, artifactRes] = await Promise.all([
    pool.query(
      `SELECT id, source_type AS "sourceType", source_key AS "sourceKey",
              source_payload AS "sourcePayload", source_hash AS "sourceHash",
              updated_at AS "updatedAt"
       FROM cmc_source_objects
       WHERE organization_id = $1 AND project_id = $2`,
      [orgId, projectId],
    ),
    pool.query(
      `SELECT section_key AS "sectionKey", stale, stale_reason AS "staleReason",
              approval_state AS "approvalState", compiled_hash AS "compiledHash",
              deterministic_json AS "deterministicJson",
              updated_at AS "updatedAt"
       FROM cmc_module3_sections
       WHERE organization_id = $1 AND project_id = $2`,
      [orgId, projectId],
    ),
    pool.query(
      `SELECT id, impacted_sections AS "impactedSections", status, severity
       FROM cmc_contradictions
       WHERE organization_id = $1 AND project_id = $2`,
      [orgId, projectId],
    ),
    pool.query(
      `SELECT artifact_id AS "artifactId", ctd_section AS "ctdSection",
              status, updated_at AS "updatedAt"
       FROM concept2cure_artifacts
       WHERE organization_id = $1 AND project_id = $2
         AND ctd_section IS NOT NULL
         AND (ctd_section LIKE '3.2.%' OR ctd_section IN ('3.1', '3.3'))`,
      [orgId, projectId],
    ),
  ]);

  // Index helpers
  const sectionMap = new Map<string, any>();
  for (const row of sectionRes.rows) {
    sectionMap.set(row.sectionKey, row);
  }

  const artifactMap = new Map<string, any>();
  for (const row of artifactRes.rows) {
    if (row.ctdSection) {
      artifactMap.set(row.ctdSection, row);
    }
  }

  // Count open contradictions per section
  const contradictionCounts = new Map<string, number>();
  for (const row of contradictionRes.rows) {
    if (row.status === 'resolved') continue;
    const sections: string[] = Array.isArray(row.impactedSections)
      ? row.impactedSections
      : [];
    for (const sk of sections) {
      contradictionCounts.set(sk, (contradictionCounts.get(sk) || 0) + 1);
    }
  }

  // Group source objects by type for quick lookup
  const sourcesByType = new Map<string, any[]>();
  for (const row of sourceRes.rows) {
    const list = sourcesByType.get(row.sourceType) || [];
    list.push(row);
    sourcesByType.set(row.sourceType, list);
  }

  // Build per-section status
  const results: Module3SectionBuildStatus[] = MODULE3_SECTION_RULES.map((rule) => {
    const sectionKey = rule.sectionKey;
    const sectionLabel = SECTION_LABELS[sectionKey] || sectionKey;

    // Matched source objects for this section
    const matchedSources = rule.requiredSourceTypes.flatMap(
      (st) => sourcesByType.get(st) || [],
    );
    const sourceObjectCount = matchedSources.length;
    const sourceTypes = [...new Set(matchedSources.map((s) => s.sourceType as string))];

    // Completeness via field availability
    const availableFields = new Set(
      matchedSources.flatMap((s) => Object.keys(s.sourcePayload || {})),
    );
    const missingInputs = rule.requiredFields.filter((f) => !availableFields.has(f));
    const completeness =
      rule.requiredFields.length === 0
        ? 100
        : Math.round(
            ((rule.requiredFields.length - missingInputs.length) / rule.requiredFields.length) * 100,
          );

    // Compiled section record
    const compiled = sectionMap.get(sectionKey);
    const isStale = compiled?.stale === true;
    const staleReason: string | null = compiled?.staleReason ?? null;
    const approvalState: string = compiled?.approvalState ?? 'none';
    const lastCompiled: string | null = compiled?.updatedAt
      ? new Date(compiled.updatedAt).toISOString()
      : null;

    // Governed artifact
    const artifact = artifactMap.get(sectionKey);
    const artifactId: string | null = artifact?.artifactId ?? null;
    const artifactStatus: string | null = artifact?.status ?? null;

    // Contradictions
    const contradictionCount = contradictionCounts.get(sectionKey) || 0;
    const hasContradictions = contradictionCount > 0;

    // Last updated = most recent of any source, section compile, or artifact
    const timestamps: Date[] = [];
    for (const s of matchedSources) {
      if (s.updatedAt) timestamps.push(new Date(s.updatedAt));
    }
    if (compiled?.updatedAt) timestamps.push(new Date(compiled.updatedAt));
    if (artifact?.updatedAt) timestamps.push(new Date(artifact.updatedAt));
    const lastUpdated =
      timestamps.length > 0
        ? new Date(Math.max(...timestamps.map((d) => d.getTime()))).toISOString()
        : null;

    // Determine build state
    const buildState = deriveBuildState({
      sourceObjectCount,
      compiled: !!compiled,
      hasArtifact: !!artifactId,
      isStale,
      hasContradictions,
      approvalState,
    });

    return {
      sectionKey,
      sectionLabel,
      buildState,
      sourceObjectCount,
      sourceTypes,
      completeness,
      missingInputs,
      hasContradictions,
      contradictionCount,
      isStale,
      staleReason,
      approvalState,
      artifactId,
      artifactStatus,
      lastCompiled,
      lastUpdated,
    };
  });

  return results;
}

/**
 * Takes an existing governed artifact and creates/updates a corresponding
 * CMC source object from its content. Records provenance lineage.
 */
export async function classifyAndMapArtifactToSource(
  orgId: number,
  projectId: string,
  artifactId: string,
  classification: DossierUploadClassification,
): Promise<{ sourceObjectId: number; sectionKey: string | null }> {
  if (!classification.useAsModule3Source || !classification.sourceType) {
    throw new Error('Classification does not designate this artifact as a Module 3 source');
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Fetch the artifact content
    const artRes = await client.query(
      `SELECT id, artifact_id AS "artifactId", title, content, metadata
       FROM concept2cure_artifacts
       WHERE organization_id = $1 AND project_id = $2 AND artifact_id = $3
       LIMIT 1`,
      [orgId, projectId, artifactId],
    );

    if (artRes.rows.length === 0) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    const artifact = artRes.rows[0];

    // 2. Build source payload from artifact content + classification tags
    const sourcePayload: Record<string, any> = {
      extractedFrom: 'artifact',
      artifactId: artifact.artifactId,
      title: artifact.title,
      content: artifact.content,
      tags: classification.tags,
      ctdSection: classification.ctdSection,
      submissionTrack: classification.submissionTrack,
    };

    const sourceHash = createSourceHash(sourcePayload);
    const sourceKey = `artifact:${artifact.artifactId}`;

    // 3. Upsert into cmc_source_objects
    const inserted = await client.query(
      `INSERT INTO cmc_source_objects
         (organization_id, project_id, source_type, source_key, source_payload, source_hash, version)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 1)
       ON CONFLICT (project_id, source_type, source_key, version)
       DO UPDATE SET source_payload = excluded.source_payload,
                     source_hash   = excluded.source_hash,
                     updated_at    = NOW()
       RETURNING id`,
      [orgId, projectId, classification.sourceType, sourceKey, JSON.stringify(sourcePayload), sourceHash],
    );

    const sourceObjectId = inserted.rows[0].id;

    // 4. Record provenance event
    await client.query(
      `INSERT INTO cmc_provenance_events
         (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
       VALUES ($1, $2, 'source_object', $3, 'mapped_from_artifact', $4::jsonb, 'system')`,
      [
        orgId,
        projectId,
        sourceObjectId,
        JSON.stringify({
          originArtifactId: artifact.artifactId,
          sourceType: classification.sourceType,
          sourceKey,
          ctdSection: classification.ctdSection,
          submissionTrack: classification.submissionTrack,
          tags: classification.tags,
        }),
      ],
    );

    await client.query('COMMIT');

    return {
      sourceObjectId,
      sectionKey: classification.ctdSection,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * After a section is compiled, creates or updates a governed artifact in
 * concept2cure_artifacts with the narrative text, correct ctdSection placement,
 * and compile provenance metadata.
 */
export async function bridgeCompileToArtifact(
  orgId: number,
  projectId: string,
  sectionKey: string,
  compiledSection: {
    narrativeDraft: string;
    tables?: Array<{ title: string; headers: string[]; rows: string[][] }>;
    completeness: number;
    missingInputs: string[];
    lineage: Array<{ sourceObjectId: string; sourceHashAtCompile: string }>;
  },
): Promise<{ artifactId: string; isNew: boolean }> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sectionLabel = SECTION_LABELS[sectionKey] || sectionKey;

    // Build full document content: narrative prose + rendered tables
    const tablesMarkdown = compiledSection.tables && compiledSection.tables.length > 0
      ? '\n\n' + tablesToMarkdown(compiledSection.tables)
      : '';
    const fullContent = `## ${sectionLabel}\n\n${compiledSection.narrativeDraft}${tablesMarkdown}`;

    const contentHash = createSourceHash({ narrative: fullContent, sectionKey });
    const sourceObjectIds = compiledSection.lineage.map((l) => l.sourceObjectId);
    const compiledAt = new Date().toISOString();

    const metadata = {
      compiledFrom: 'module3-os',
      sectionKey,
      sourceObjectIds,
      compiledAt,
      completeness: compiledSection.completeness,
      missingInputs: compiledSection.missingInputs,
    };

    // Check if a governed artifact already exists for this section
    const existing = await client.query(
      `SELECT id, artifact_id AS "artifactId", version
       FROM concept2cure_artifacts
       WHERE organization_id = $1 AND project_id = $2 AND ctd_section = $3
       ORDER BY version DESC
       LIMIT 1`,
      [orgId, projectId, sectionKey],
    );

    let artifactId: string;
    let isNew: boolean;

    if (existing.rows.length > 0) {
      // Update existing artifact
      const row = existing.rows[0];
      artifactId = row.artifactId;
      isNew = false;

      await client.query(
        `UPDATE concept2cure_artifacts
         SET content      = $1,
             content_hash = $2,
             version      = version + 1,
             metadata     = $3::jsonb,
             status       = 'draft',
             updated_at   = NOW()
         WHERE organization_id = $4 AND id = $5`,
        [fullContent, contentHash, JSON.stringify(metadata), orgId, row.id],
      );
    } else {
      // Create new governed artifact
      artifactId = `m3-${sectionKey}-${randomUUID().slice(0, 8)}`;
      isNew = true;

      await client.query(
        `INSERT INTO concept2cure_artifacts
           (organization_id, project_id, artifact_id, type, category, title,
            content, content_hash, version, ctd_section, status, metadata, created_by_id)
         VALUES ($1, $2, $3, 'markdown', 'document', $4,
                 $5, $6, 1, $7, 'draft', $8::jsonb, 'system')`,
        [
          orgId,
          projectId,
          artifactId,
          `Module 3 — ${sectionLabel}`,
          fullContent,
          contentHash,
          sectionKey,
          JSON.stringify(metadata),
        ],
      );
    }

    // Record provenance event
    await client.query(
      `INSERT INTO cmc_provenance_events
         (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
       VALUES ($1, $2, 'governed_artifact', $3, 'bridged_from_compile', $4::jsonb, 'system')`,
      [
        orgId,
        projectId,
        artifactId,
        JSON.stringify({
          sectionKey,
          sourceObjectIds,
          compiledAt,
          isNew,
          contentHash,
        }),
      ],
    );

    await client.query('COMMIT');

    return { artifactId, isNew };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Internal helpers ───────────────────────────────────────────

function deriveBuildState(ctx: {
  sourceObjectCount: number;
  compiled: boolean;
  hasArtifact: boolean;
  isStale: boolean;
  hasContradictions: boolean;
  approvalState: string;
}): Module3BuildState {
  if (ctx.approvalState === 'locked') return 'locked';
  if (ctx.approvalState === 'approved') return 'approved';
  if (ctx.approvalState === 'review') return 'review';
  if (ctx.hasContradictions) return 'contradiction_flagged';
  if (ctx.isStale) return 'stale';
  if (ctx.hasArtifact) return 'draft_artifact_created';
  if (ctx.compiled) return 'compiled';
  if (ctx.sourceObjectCount > 0) return 'sources_uploaded';
  return 'no_sources';
}
