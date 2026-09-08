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
import {
  CMC_SOURCE_TYPES,
  composeModule3FromCanonicalSources,
  MODULE3_SECTION_RULES,
  renderComposedSectionMarkdown,
  tablesToMarkdown,
  CmcSourceType,
  type CanonicalSource,
} from './module3Composer';
import { appendixSectionsRequiringSourceType, composeAppendices, emittableAppendices } from './module3-extensions';
import { enforceAuthorLineage } from './clinical-regulatory-evidence/lineage-gate';
import { governedActor } from './part11/governed-actor';
import {
  resolveCmcArtifactProject,
  type ArtifactProjectResolution,
  type ArtifactSpineState,
} from './cmc/resolve-cmc-artifact-project';

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
  /** Uploaded source documents classified as feeding this section (governed artifact registry). */
  uploadedSourceCount: number;
  sourceTypes: string[];
  completeness: number;
  missingInputs: string[];
  hasContradictions: boolean;
  contradictionCount: number;
  isStale: boolean;
  staleReason: string | null;
  approvalState: string;
  /** The compiled row carries narrative text. */
  hasNarrative: boolean;
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
  /* The appendices compose, stale and approve like any other section; a
     label table without them hid a stale 3.2.A.* from every reader of this map. */
  '3.2.A.1': 'Facilities and Equipment',
  '3.2.A.2': 'Adventitious Agents Safety Evaluation',
  '3.2.A.3': 'Excipients',
};

// ── Public API ─────────────────────────────────────────────────

/**
 * Returns a map of sectionKey → human-readable label for all 15 Module 3 subsections.
 */
export function getSectionLabels(): Record<string, string> {
  return { ...SECTION_LABELS };
}

export interface Module3BuildStatusResult {
  sections: Module3SectionBuildStatus[];
  /**
   * Whether the governed artifact registry was addressable for this project.
   * 'linked' — artifact facts below are real reads. 'unanchored' /
   * 'unaddressable' — every artifactId/artifactStatus is null BECAUSE the
   * registry could not be queried, not because it is empty; `detail` says why.
   */
  artifactRegistry: { state: ArtifactSpineState; detail?: string };
}

/**
 * Returns the per-subsection build state for every subsection defined in
 * MODULE3_SECTION_RULES, plus the artifact-registry addressability verdict.
 *
 * Queries cmc_source_objects, cmc_module3_sections, cmc_contradictions
 * (TEXT project id — the CMC space), and concept2cure_artifacts (integer
 * projects.id — reached through resolveCmcArtifactProject, never with the
 * raw TEXT id: a uuid literal against the integer column aborts the whole
 * statement).
 */
export async function getModule3BuildStatus(
  orgId: number,
  projectId: string,
): Promise<Module3BuildStatusResult> {
  const pool = getPool();

  const spine = await resolveCmcArtifactProject(orgId, projectId);

  // Parallel fetch of all five data sources
  const noArtifacts = Promise.resolve({ rows: [] as any[] });
  const [sourceRes, sectionRes, contradictionRes, artifactRes, uploadedRes] = await Promise.all([
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
              (narrative_text IS NOT NULL AND narrative_text <> '') AS "hasNarrative",
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
    spine.state === 'linked'
      ? pool.query(
          `SELECT artifact_id AS "artifactId", ctd_section AS "ctdSection",
                  status, updated_at AS "updatedAt"
           FROM concept2cure_artifacts
           WHERE organization_id = $1 AND project_id = $2
             AND ctd_section IS NOT NULL
             AND (ctd_section LIKE '3.2.%' OR ctd_section IN ('3.1', '3.3'))`,
          [orgId, spine.artifactProjectId],
        )
      : noArtifacts,
    // Uploaded source documents classified as feeding Module 3 — the build
    // board's "N uploaded" beside a section with no composed source yet.
    spine.state === 'linked'
      ? pool.query(
          `SELECT id, artifact_id as "artifactId", ctd_section as "ctdSection",
                  metadata, title
           FROM concept2cure_artifacts
           WHERE organization_id = $1 AND project_id = $2
                 AND category = 'source'
                 AND (metadata->>'dossierClassification' IS NOT NULL)
                 AND (metadata->'dossierClassification'->>'feedsModule3')::text = 'true'`,
          [orgId, spine.artifactProjectId],
        )
      : noArtifacts,
  ]);

  const uploadedCounts = new Map<string, number>();
  for (const row of uploadedRes.rows) {
    const cls = row.metadata?.dossierClassification;
    const section = cls?.ctdSection || row.ctdSection;
    if (section) uploadedCounts.set(section, (uploadedCounts.get(section) || 0) + 1);
  }

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

  /* ── Completeness is the composer's, and only the composer's ──
     This used to score each section by KEY PRESENCE over every source of a
     matching type (`Object.keys(sourcePayload)`), so a key holding '' or null
     counted as present and a retired source still fed the count — while the
     compile path stored composeModule3FromCanonicalSources's figures in
     cmc_module3_sections.deterministic_json and the final-export gate refused
     on those. Three readers, two definitions, and this one was the greenest.

     The rows are handed to the composer exactly as the compile route hands
     them (every row for the project, no version dedup — `loadCmcSourcesForProject`
     keeps only the latest version per key, which is NOT what compile composes,
     so adopting it here would reopen the disagreement from the other side).
     What comes back is the one answer: `completeness` / `missingInputs` as the
     composer scored them (`isPresent` excludes null and ''), and `lineage` —
     one entry per source that actually composed, which already excludes
     retirement — is the count. A compiled row's stored figure is deliberately
     NOT preferred: it is the composer's answer at compile time, and `stale`
     exists because source edits after that make it wrong. */
  const rowById = new Map<string, any>();
  const canonicalSources: CanonicalSource[] = sourceRes.rows.map((row) => {
    const id = String(row.id);
    rowById.set(id, row);
    return {
      id,
      sourceType: row.sourceType as CmcSourceType,
      sourcePayload: (row.sourcePayload ?? {}) as Record<string, any>,
      sourceHash: row.sourceHash ?? undefined,
      organizationId: orgId,
      projectId,
    };
  });
  /* The appendices compose and go stale like any other section (an approved
     3.2.A.* is marked stale when its sources change), so they are reported
     here too — a board that walked only the seventeen core keys reported zero
     stale sections while the export gate refused on a stale appendix. */
  const composedAll = composeModule3FromCanonicalSources(canonicalSources).concat(
    emittableAppendices(composeAppendices(canonicalSources)),
  );
  const composedBySection = new Map(composedAll.map((c) => [c.sectionKey, c] as const));
  const appendixRules = composedAll
    .filter((c) => c.sectionKey.startsWith('3.2.A'))
    .map((c) => ({
      sectionKey: c.sectionKey,
      requiredSourceTypes: CMC_SOURCE_TYPES.filter((st) => appendixSectionsRequiringSourceType(st).includes(c.sectionKey)),
    }));

  // Group source objects by type — for the section's lastUpdated only. A
  // retired source no longer composes, but retiring it IS an edit to the
  // section's inputs, so it still moves the timestamp.
  const sourcesByType = new Map<string, any[]>();
  for (const row of sourceRes.rows) {
    const list = sourcesByType.get(row.sourceType) || [];
    list.push(row);
    sourcesByType.set(row.sourceType, list);
  }

  // Build per-section status
  const results: Module3SectionBuildStatus[] = [...MODULE3_SECTION_RULES, ...appendixRules].map((rule) => {
    const sectionKey = rule.sectionKey;
    const sectionLabel = SECTION_LABELS[sectionKey] || sectionKey;

    const composed = composedBySection.get(sectionKey);
    if (!composed) {
      // The composer emits one section per rule; a missing one is a broken
      // invariant, not a section with nothing in it. Never score it 0 and move on.
      throw new Error(`[module3-convergence] composer emitted no section for ${sectionKey}`);
    }
    const composingRows = composed.lineage.map((l) => rowById.get(l.sourceObjectId)).filter(Boolean);
    const sourceObjectCount = composed.lineage.length;
    const sourceTypes = [...new Set(composingRows.map((s) => s.sourceType as string))];
    const { completeness, missingInputs } = composed;

    // Every source of a matching type, retired or not — timestamps only.
    const matchedSources = rule.requiredSourceTypes.flatMap(
      (st) => sourcesByType.get(st) || [],
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

    const uploadedSourceCount = uploadedCounts.get(sectionKey) || 0;
    const hasNarrative = compiled?.hasNarrative === true;

    // Determine build state — the ONE derivation, shared with the build-state route.
    const buildState = deriveBuildState({
      sourceObjectCount,
      uploadedSourceCount,
      compiled: !!compiled,
      isStale,
      hasContradictions,
      approvalState,
      artifactStatus,
    });

    return {
      sectionKey,
      sectionLabel,
      buildState,
      sourceObjectCount,
      uploadedSourceCount,
      sourceTypes,
      completeness,
      missingInputs,
      hasContradictions,
      contradictionCount,
      isStale,
      staleReason,
      approvalState,
      hasNarrative,
      artifactId,
      artifactStatus,
      lastCompiled,
      lastUpdated,
    };
  });

  return {
    sections: results,
    artifactRegistry:
      spine.state === 'linked' ? { state: 'linked' } : { state: spine.state, detail: spine.detail },
  };
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

  // The artifact lives on the integer spine; the CMC source object keeps the
  // caller's TEXT project id so it joins the rest of the Module 3 OS layer.
  const spine = await resolveCmcArtifactProject(orgId, projectId);
  if (spine.state !== 'linked') {
    throw new Error(`Artifact registry is not addressable for project ${projectId}: ${spine.detail}`);
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
      [orgId, spine.artifactProjectId, artifactId],
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
       ON CONFLICT (organization_id, project_id, source_type, source_key, version)
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

export type BridgeToArtifactResult =
  | { bridged: true; artifactId: string; isNew: boolean }
  | {
      /**
       * The registry was not addressable for this project — a real state
       * (unanchored program, unaddressable id), reported to the caller so a
       * compile can say exactly which sections have no governed artifact and
       * why. Never thrown: silence here is how every wizard-created program
       * lost its artifacts without anyone seeing it.
       */
      bridged: false;
      reason: Exclude<ArtifactProjectResolution['state'], 'linked'>;
      detail: string;
    };

/**
 * After a section is compiled, creates or updates a governed artifact in
 * concept2cure_artifacts with the narrative text, correct ctdSection placement,
 * and compile provenance metadata.
 *
 * The registry keys projects by integer id; the CMC project id is TEXT and is
 * translated through resolveCmcArtifactProject. Provenance stays keyed by the
 * CMC TEXT id — it belongs to the Module 3 OS layer.
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
  opts: {
    /**
     * The acting user's id for concept2cure_artifacts.created_by_id — an
     * INTEGER FK → users.id. The previous literal 'system' could never insert
     * (invalid input syntax for type integer), so every bridge on a fresh
     * database failed and the caller's catch logged it away. NULL is the
     * honest value for a system-initiated bridge with no identified actor.
     */
    createdById?: number | null;
  } = {},
): Promise<BridgeToArtifactResult> {
  const spine = await resolveCmcArtifactProject(orgId, projectId);
  if (spine.state !== 'linked') {
    return { bridged: false, reason: spine.state, detail: spine.detail };
  }
  const artifactProjectId = spine.artifactProjectId;

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sectionLabel = SECTION_LABELS[sectionKey] || sectionKey;

    /* The ONE renderer, which this function's own contract names: the governed
       artifact and the leaf placement file the same section, and a second copy
       of these two lines is how they came to differ — placement trimmed the
       narrative and this did not, so the same compile produced two different
       sha256s for the same section. */
    const fullContent = renderComposedSectionMarkdown(
      sectionLabel,
      compiledSection.narrativeDraft,
      compiledSection.tables,
    );

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
      [orgId, artifactProjectId, sectionKey],
    );

    let artifactId: string;
    let isNew: boolean;
    let artifactPk: number;

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
      artifactPk = Number(row.id);
    } else {
      // Create new governed artifact
      artifactId = `m3-${sectionKey}-${randomUUID().slice(0, 8)}`;
      isNew = true;

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO concept2cure_artifacts
           (organization_id, project_id, artifact_id, type, category, title,
            content, content_hash, version, ctd_section, status, metadata, created_by_id)
         VALUES ($1, $2, $3, 'markdown', 'document', $4,
                 $5, $6, 1, $7, 'draft', $8::jsonb, $9)
         RETURNING id`,
        [
          orgId,
          artifactProjectId,
          artifactId,
          `Module 3 — ${sectionLabel}`,
          fullContent,
          contentHash,
          sectionKey,
          JSON.stringify(metadata),
          opts.createdById ?? null,
        ],
      );
      artifactPk = Number(inserted.rows[0].id);
    }

    /* Lineage in the same transaction as the composed text (ledger L160).
       A composed Module 3 section is prose assembled from recorded facts by a
       deterministic composer; the actor is the identified user when the
       bridge ran for one, otherwise the NAMED machine actor — never a
       placeholder. The per-source `cmc_section_lineage` rows above say which
       records the section was built from; these spans say who stands behind
       the sentences. */
    const actor = governedActor(opts.createdById ?? null, 'module3-convergence');
    await enforceAuthorLineage(
      client,
      orgId,
      { documentTable: 'concept2cure_artifacts', documentId: String(artifactPk) },
      fullContent,
      actor.userId > 0 ? String(actor.userId) : String(actor.userEmail),
    );

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

    return { bridged: true, artifactId, isNew };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Internal helpers ───────────────────────────────────────────

/**
 * The ONE build-state derivation, for this status and the build-state route.
 *
 * Priority-ordered. An approved section that went stale is 'stale', not
 * 'approved': the export gate refuses it, and a board that called it approved
 * was greener than the gate. The route used to carry its own copy with this
 * order while this function put approval above staleness and contradictions
 * above staleness — so AnA and the board disagreed on the same row.
 */
export function deriveBuildState(ctx: {
  sourceObjectCount: number;
  uploadedSourceCount?: number;
  compiled: boolean;
  isStale: boolean;
  hasContradictions: boolean;
  approvalState: string | null;
  artifactStatus: string | null;
}): Module3BuildState {
  if (ctx.artifactStatus === 'locked' || ctx.approvalState === 'locked') return 'locked';
  if (ctx.approvalState === 'approved' && !ctx.isStale) return 'approved';
  if (ctx.artifactStatus === 'review' || ctx.approvalState === 'review') return 'review';
  if (ctx.isStale) return 'stale';
  if (ctx.hasContradictions) return 'contradiction_flagged';
  if (ctx.artifactStatus === 'draft' && ctx.compiled) return 'draft_artifact_created';
  if (ctx.compiled) return 'compiled';
  if (ctx.sourceObjectCount > 0) return 'extraction_complete';
  if ((ctx.uploadedSourceCount ?? 0) > 0) return 'sources_uploaded';
  return 'no_sources';
}
