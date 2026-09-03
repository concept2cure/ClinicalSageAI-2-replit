/**
 * Artifact → CTD Section Auto-Tagging Service
 *
 * When AnA RI generates or updates a document, this service
 * automatically tags it with the correct CTD section code so that
 * the INDWorkspace live status tiles reflect real document progress.
 *
 * Also handles:
 * - Creating concept2cure_artifacts entries for AI-drafted content
 * - Updating project_sections status when artifacts are created/updated
 * - Version tracking for regulatory audit trails
 *
 * @module server/services/artifact-tagger
 * @compliance FDA 21 CFR Part 11 — immutable audit trail
 */

import { governedActor } from './part11/governed-actor';
import { createHash, randomUUID } from 'node:crypto';

import { getPool } from '../db/runtime.js';
import { recordArtifactProvenance } from './provenance/artifact-provenance';
import { resolveGovernedContext } from './concept2cure/governedDocumentContractService.js';

export interface TagArtifactParams {
  projectId: number;
  organizationId: number;
  userId?: number;
  sectionCode: string;
  title: string;
  content: string;
  /** 'draft' | 'in_progress' | 'review' | 'approved' | 'published' | 'locked' */
  status?: string;
  /** Optional existing artifact ID to update instead of create */
  artifactId?: number;
  /** Source of the content: 'ana_cortex' | 'manual' | 'import' | 'template' */
  source?: string;
  /** Additional metadata to store */
  metadata?: Record<string, any>;
}

export interface TagArtifactResult {
  artifactId: number;
  versionId?: number;
  sectionCode: string;
  isNew: boolean;
  sectionStatusUpdated: boolean;
}

/**
 * Tag an artifact with a CTD section code. Creates a new artifact record
 * or updates an existing one, then synchronizes the project_sections status.
 */
export async function tagArtifact(params: TagArtifactParams): Promise<TagArtifactResult> {
  const {
    projectId,
    organizationId,
    userId,
    sectionCode,
    title,
    content,
    status = 'draft',
    artifactId,
    source = 'ana_cortex',
    metadata = {},
  } = params;

  const client = await getPool().connect();
  let isNew = false;
  let resultArtifactId: number;
  let versionId: number | undefined;

  try {
    await client.query('BEGIN');

    if (artifactId) {
      // ── UPDATE EXISTING ARTIFACT ──────────────────────────────────────────
      //
      // KNOWN, NOT FIXED HERE — this branch matches nothing today. `artifactId`
      // is typed `number` (the integer PK), but every statement in it filters
      // `WHERE artifact_id = $1`, which is the TEXT external id ('artifact_xxx').
      // node-pg sends the number as text, so the comparison is legal and simply
      // never matches: the SELECT returns no rows, the version snapshot below is
      // skipped, the UPDATE touches nothing, and the function reports success.
      // A silent no-op, which is worse than the error it looks like it should be.
      //
      // The same confusion runs through the return value: the create path sets
      // resultArtifactId from `existing.rows[0].artifact_id` (text) in one branch
      // and from `RETURNING id` (integer) in another, while TagArtifactResult
      // declares it `number`. Untangling which id this service speaks is a
      // contract change across its callers, not a column fix, so it is recorded
      // rather than guessed at. The CREATE path below is repaired and does work.
      //
      // Save current version to artifact_versions before overwriting
      // `id` is selected as well as the content: the version row's artifact_id
      // is an INTEGER FK to concept2cure_artifacts.id, not the external text
      // `artifact_id`. Passing the external id here was a 22P02 on top of
      // everything else below.
      const currentArtifact = await client.query(
        `SELECT id, content, version, title, status FROM concept2cure_artifacts
         WHERE artifact_id = $1 AND project_id = $2 AND organization_id = $3`,
        [artifactId, projectId, organizationId]
      );

      if (currentArtifact.rows.length > 0) {
        const cur = currentArtifact.rows[0];
        // This snapshot INSERT could never have run. It named title, status,
        // created_by and metadata — none of which the versions table has (its
        // columns are content_hash, change_description, created_by_id) — omitted
        // organization_id and content_hash, both NOT NULL, and passed the
        // external text id into an integer FK. Three independent failures in one
        // statement, so every governed AnA artifact UPDATE lost its
        // before-image. Found by ci:insert-columns-declared.
        //
        // title and status are deliberately NOT carried over: they live on the
        // artifact, and the version row records the CONTENT at a point in time.
        // What was previously crammed into `metadata` is the change description,
        // which the table does have a column for.
        const previousContent = String(cur.content ?? '');
        const vResult = await client.query(
          `INSERT INTO concept2cure_artifact_versions
             (artifact_id, organization_id, version, content, content_hash,
              change_description, created_by_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            cur.id,
            organizationId,
            cur.version || 1,
            previousContent,
            createHash('sha256').update(previousContent).digest('hex'),
            `Snapshot taken before update (previous source: ${source})`,
            userId || null,
          ]
        );
        versionId = vResult.rows[0]?.id;
      }

      // Update the artifact
      await client.query(
        `UPDATE concept2cure_artifacts
         SET content = $4, status = $5, ctd_section = $6, title = $7,
             version = COALESCE(version, 1) + 1,
             metadata = metadata || $8::jsonb,
             updated_at = NOW()
         WHERE artifact_id = $1 AND project_id = $2 AND organization_id = $3`,
        [
          artifactId,
          projectId,
          organizationId,
          content,
          status,
          sectionCode,
          title,
          JSON.stringify({
            ...metadata,
            source,
            lastTaggedAt: new Date().toISOString(),
            taggedBy: userId || 'system',
          }),
        ]
      );

      resultArtifactId = artifactId;
      isNew = false;
    } else {
      // ── CREATE NEW ARTIFACT ───────────────────────────────────────────────
      // Check if artifact already exists for this section in this project
      const existing = await client.query(
        `SELECT artifact_id FROM concept2cure_artifacts
         WHERE project_id = $1 AND organization_id = $2 AND ctd_section = $3
         LIMIT 1`,
        [projectId, organizationId, sectionCode]
      );

      if (existing.rows.length > 0) {
        // Section already has an artifact — update it instead
        const existingId = existing.rows[0].artifact_id;
        await client.query(
          `UPDATE concept2cure_artifacts
           SET content = $4, status = $5, title = $6,
               version = COALESCE(version, 1) + 1,
               metadata = metadata || $7::jsonb,
               updated_at = NOW()
           WHERE artifact_id = $1 AND project_id = $2 AND organization_id = $3`,
          [
            existingId,
            projectId,
            organizationId,
            content,
            status,
            title,
            JSON.stringify({
              ...metadata,
              source,
              lastTaggedAt: new Date().toISOString(),
              taggedBy: userId || 'system',
            }),
          ]
        );
        resultArtifactId = existingId;
        isNew = false;
      } else {
        // Insert new artifact
        const governedResolution = resolveGovernedContext({
          req: {
            body: {
              projectId,
              metadata: {
                sourceRefs: [`section:${sectionCode}`],
              },
            },
            ...governedActor(userId, 'artifact-tagger'),
            userRole: 'regulatory',
          } as any,
          projectId,
          artifactId: null,
          documentType: 'regulatory_document',
          generationMode: source === 'import' ? 'imported' : 'ai_assisted',
          lifecycleStatus: status === 'review' ? 'in_review' : (status as any),
          originSurface: 'api_route',
          clientTrack: 'biotech',
          submissionProgram: 'ectd',
          persona: 'regulatory',
          regulatorScope: 'fda',
          evidenceMode: source === 'import' ? 'mixed' : 'csr',
          documentClass: sectionCode?.startsWith('3.') ? 'module3_output' : 'section_draft',
          readinessGate: status === 'approved' || status === 'locked' ? 'submission_candidate' : 'internal_review',
          approvalPathType: status === 'locked' ? 'qa_lock' : 'regulated_dual_review',
          recommendationSource: 'report_engine',
          workspaceTarget: 'project',
          regulatorIntent: 'submission_authoring',
          placementContainerId: String(projectId),
          title,
          content,
          ctdSection: sectionCode,
          sourceRefs: [`section:${sectionCode}`],
          provider: 'artifact_tagger',
          model: source,
          exportAllowed: false,
          eventType: isNew ? 'artifact.created' : 'artifact.updated',
        });
        if (!governedResolution.validation.valid) {
          throw new Error(
            `governed artifact tagging failed: ${governedResolution.validation.errors.join('; ')}`
          );
        }

        const insertResult = await client.query(
          // As broken as the version snapshot above, and for overlapping
          // reasons: it named `created_by` (the column is created_by_id) and
          // omitted artifact_id, type and category — all three NOT NULL with no
          // default — so it violated the constraints even before the unknown
          // column was reached. `RETURNING artifact_id` was returning a value
          // the statement never supplied. Every governed AnA artifact CREATE
          // failed. Found by ci:insert-columns-declared.
          //
          // type/category use the same vocabulary as the other governed writers
          // (compute/artifactWriteback.ts, compute/exportGovernance.ts).
          `INSERT INTO concept2cure_artifacts
             (artifact_id, project_id, organization_id, type, category, title,
              content, content_hash, status, ctd_section, version,
              created_by_id, metadata)
           VALUES ($1, $2, $3, 'regulatory_document', 'document', $4, $5, $6,
                   $7, $8, 1, $9, $10)
           RETURNING id, artifact_id`,
          [
            `artifact_${randomUUID()}`,
            projectId,
            organizationId,
            title,
            content,
            createHash('sha256').update(String(content ?? '')).digest('hex'),
            status,
            sectionCode,
            userId || null,
            JSON.stringify({
              ...metadata,
              source,
              createdAt: new Date().toISOString(),
              taggedBy: userId || 'system',
              harness: {
                clientTrack: governedResolution.contract.clientTrack,
                submissionProgram: governedResolution.contract.submissionProgram,
                persona: governedResolution.contract.persona,
                regulatorScope: governedResolution.contract.regulatorScope,
                documentClass: governedResolution.contract.documentClass,
                readinessGate: governedResolution.contract.readinessGate,
                workspaceTarget: governedResolution.contract.workspaceTarget,
                originSurface: governedResolution.contract.originSurface,
                recommendationSource: governedResolution.contract.recommendationSource,
                regulatorIntent: governedResolution.contract.regulatorIntent,
                gateChecks: governedResolution.contract.exportEligibility.gateChecks,
                blockingReasons: governedResolution.contract.exportEligibility.blockingReasons,
                readinessOutcome: governedResolution.contract.exportEligibility.readinessOutcome,
              },
            }),
          ]
        );
        resultArtifactId = insertResult.rows[0].artifact_id;
        isNew = true;
        // Uniform provenance: a governed tagged artifact is a 'generation'
        // event, in the same transaction as the artifact insert.
        await recordArtifactProvenance(client, {
          artifactId: insertResult.rows[0].id,
          organizationId,
          eventType: 'generation',
          eventAction: 'tag',
          actorId: userId ?? null,
          details: { source, sectionCode, clientTrack: governedResolution.contract.clientTrack },
          backendService: 'artifact-tagger',
        });
      }
    }

    // ── SYNC project_sections STATUS ──────────────────────────────────────
    let sectionStatusUpdated = false;
    try {
      const sectionRow = await client.query(
        `SELECT status FROM project_sections
         WHERE project_id = $1 AND organization_id = $2 AND section_code = $3`,
        [projectId, organizationId, sectionCode]
      );

      if (sectionRow.rows.length > 0) {
        const currentSectionStatus = sectionRow.rows[0].status;
        // Auto-advance to 'drafting' if currently 'not_started' or 'data_gathering'
        if (
          (currentSectionStatus === 'not_started' || currentSectionStatus === 'data_gathering') &&
          content.length > 100
        ) {
          await client.query(
            `UPDATE project_sections
             SET status = 'drafting', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
             WHERE project_id = $1 AND organization_id = $2 AND section_code = $3`,
            [projectId, organizationId, sectionCode]
          );

          // Log the auto-transition
          await client.query(
            `INSERT INTO section_status_log
               (organization_id, project_id, section_code, old_status, new_status, changed_by, change_reason, metadata)
             VALUES ($1, $2, $3, $4, 'drafting', $5, 'Auto-advanced: AI draft content created', $6)`,
            [
              organizationId,
              projectId,
              sectionCode,
              currentSectionStatus,
              userId || null,
              JSON.stringify({
                source: 'artifact_tagger',
                artifactId: resultArtifactId,
                autoTransition: true,
              }),
            ]
          );

          sectionStatusUpdated = true;
        }
      }
    } catch (sectionErr) {
      // Non-fatal: project_sections table may not exist yet or section not initialized
      console.warn('[ArtifactTagger] Section sync skipped:', sectionErr);
    }

    await client.query('COMMIT');

    return {
      artifactId: resultArtifactId,
      versionId,
      sectionCode,
      isNew,
      sectionStatusUpdated,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Batch-tag multiple artifacts at once (e.g., when importing a full section set).
 */
export async function batchTagArtifacts(items: TagArtifactParams[]): Promise<TagArtifactResult[]> {
  const results: TagArtifactResult[] = [];
  for (const item of items) {
    try {
      const result = await tagArtifact(item);
      results.push(result);
    } catch (err: any) {
      console.error(`[ArtifactTagger] Failed to tag ${item.sectionCode}:`, err.message);
      results.push({
        artifactId: -1,
        sectionCode: item.sectionCode,
        isNew: false,
        sectionStatusUpdated: false,
      });
    }
  }
  return results;
}

/**
 * Get the CTD section code for an artifact by its ID.
 */
export async function getArtifactSectionCode(
  artifactId: number,
  projectId: number,
  organizationId: number
): Promise<string | null> {
  try {
    const result = await getPool().query(
      `SELECT ctd_section FROM concept2cure_artifacts
       WHERE artifact_id = $1 AND project_id = $2 AND organization_id = $3`,
      [artifactId, projectId, organizationId]
    );
    return result.rows[0]?.ctd_section || null;
  } catch {
    return null;
  }
}
