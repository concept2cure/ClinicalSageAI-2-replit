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

import { getPool } from '../db';
import { resolveGovernedContext } from './concept2cure/governedDocumentContractService.js';

const pool = {
  connect: (...args: Parameters<ReturnType<typeof getPool>['connect']>) => getPool().connect(...args),
};

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

  const client = (await pool.connect(undefined as any)) as any;
  let isNew = false;
  let resultArtifactId: number;
  let versionId: number | undefined;

  try {
    await client.query('BEGIN');

    if (artifactId) {
      // ── UPDATE EXISTING ARTIFACT ──────────────────────────────────────────
      // Save current version to artifact_versions before overwriting
      const currentArtifact = await client.query(
        `SELECT content, version, title, status FROM concept2cure_artifacts
         WHERE artifact_id = $1 AND project_id = $2 AND organization_id = $3`,
        [artifactId, projectId, organizationId]
      );

      if (currentArtifact.rows.length > 0) {
        const cur = currentArtifact.rows[0];
        const vResult = await client.query(
          `INSERT INTO concept2cure_artifact_versions
             (artifact_id, version, content, title, status, created_by, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            artifactId,
            cur.version || 1,
            cur.content,
            cur.title,
            cur.status,
            userId || null,
            JSON.stringify({ source: 'version_before_update', previousSource: source }),
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
            userId: userId || 0,
            userEmail: `user-${userId || 0}@system.local`,
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
          `INSERT INTO concept2cure_artifacts
             (project_id, organization_id, title, content, status, ctd_section,
              version, created_by, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8)
           RETURNING artifact_id`,
          [
            projectId,
            organizationId,
            title,
            content,
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
    const result = await (getPool() as any).query(
      `SELECT ctd_section FROM concept2cure_artifacts
       WHERE artifact_id = $1 AND project_id = $2 AND organization_id = $3`,
      [artifactId, projectId, organizationId]
    );
    return result.rows[0]?.ctd_section || null;
  } catch {
    return null;
  }
}
