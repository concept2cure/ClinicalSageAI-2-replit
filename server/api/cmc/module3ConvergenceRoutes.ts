/**
 * Module 3 Convergence API Routes
 *
 * Phase 2 + 6 — Module 3 Workflow Convergence
 *
 * Endpoints:
 *  POST /classify-artifact/:projectId — Map an uploaded artifact to a CMC source object
 *  POST /build-section/:projectId/:sectionKey — Compile + bridge a specific section
 *  GET  /source-lineage/:projectId/:sectionKey — Get lineage for a section
 */

import express from 'express';
import { z } from 'zod';
import { getPool } from '../../db';
import {
  classifyAndMapArtifactToSource,
  bridgeCompileToArtifact,
} from '../../services/module3-convergence-service';
import { composeModule3FromCanonicalSources, CmcSourceType } from '../../services/module3Composer';
import { createSourceHash } from '../../services/cmc-module3-compiler';
import { resolveCmcArtifactProject } from '../../services/cmc/resolve-cmc-artifact-project';

const router = express.Router();

function getOrgId(req: express.Request): number {
  const orgId = parseInt(
    String((req as any).tenantId || (req as any).tenantContext?.organizationId || 0),
    10
  );
  if (!orgId || Number.isNaN(orgId)) throw new Error('Organization context required');
  return orgId;
}

// ── POST /classify-artifact/:projectId ────────────────────────────────────────
// Takes an existing uploaded artifact and maps it into a CMC source object.
// This is the "source normalization" step in the Module 3 workflow.

const classifySchema = z.object({
  artifactId: z.string().min(1),
  submissionTrack: z.enum(['IND', 'NDA', 'BLA', '510K', 'PMA', 'SOP', 'CER', 'general']).optional().default('IND'),
  dossierModule: z.string().nullable().optional(),
  ctdSection: z.string().nullable().optional(),
  sourceType: z.enum([
    'drug_substance', 'drug_product', 'specification', 'method', 'stability',
    'batch', 'change_control', 'comparability', 'manufacturing_process',
    'characterization', 'reference_standard', 'container_closure', 'excipient',
  ]),
  tags: z.array(z.string()).optional().default([]),
});

router.post('/classify-artifact/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId } = req.params;
    const data = classifySchema.parse(req.body);

    const result = await classifyAndMapArtifactToSource(orgId, projectId, data.artifactId, {
      submissionTrack: data.submissionTrack as any,
      dossierModule: data.dossierModule || null,
      ctdSection: data.ctdSection || null,
      sourceType: data.sourceType as CmcSourceType,
      useAsModule3Source: true,
      tags: data.tags,
    });

    return res.json({
      success: true,
      data: {
        sourceObjectId: result.sourceObjectId,
        sectionKey: result.sectionKey,
        artifactId: data.artifactId,
        sourceType: data.sourceType,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid classification payload', details: error.errors });
    }
    if (String((error as Error)?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return res.status(500).json({
      success: false,
      error: ((error instanceof Error ? error.message : String(error)) || 'Classification failed'),
    });
  }
});

// ── POST /build-section/:projectId/:sectionKey ───────────────────────────────
// Compile a specific subsection and auto-bridge the result to a governed artifact.
// This is the "build one section" action from the editor or AnA.

router.post('/build-section/:projectId/:sectionKey', async (req, res) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const orgId = getOrgId(req);
    const { projectId, sectionKey } = req.params;

    await client.query('BEGIN');

    // 1. Fetch source objects
    const { rows: sourceObjects } = await client.query(
      `SELECT id, source_type as "sourceType", source_payload as "sourcePayload", source_hash as "sourceHash"
       FROM cmc_source_objects
       WHERE organization_id = $1 AND project_id = $2
       ORDER BY updated_at DESC`,
      [orgId, projectId]
    );

    // 2. Compose all sections but filter to the requested one
    const allComposed = composeModule3FromCanonicalSources(sourceObjects as any);
    const section = allComposed.find((s) => s.sectionKey === sectionKey);

    if (!section) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: `Section ${sectionKey} not found in composition rules` });
    }

    // 3. Upsert compiled section
    const upsert = await client.query(
      `INSERT INTO cmc_module3_sections (organization_id, project_id, section_key, section_path, deterministic_json, narrative_text, compiled_hash, stale, stale_reason, approval_state)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,'draft')
       ON CONFLICT (organization_id, project_id, section_key)
       DO UPDATE SET deterministic_json = excluded.deterministic_json,
                     compiled_hash = excluded.compiled_hash,
                     stale = excluded.stale,
                     stale_reason = excluded.stale_reason,
                     narrative_text = excluded.narrative_text,
                     updated_at = now()
       RETURNING id`,
      [
        orgId, projectId, section.sectionKey, section.sectionPath,
        JSON.stringify({
          ...section.structuredPayload,
          completeness: section.completeness,
          missingInputs: section.missingInputs,
        }),
        section.narrativeDraft,
        createSourceHash(section.structuredPayload),
        false, null,
      ]
    );
    const sectionId = upsert.rows[0]?.id;

    if (sectionId) {
      // 4. Refresh lineage
      // Scoped by org as well as section id. `sectionId` comes from the upsert's
      // RETURNING, so before the arbiter carried organization_id this deleted the
      // VICTIM's provenance rows — the traceability tying each Module 3 section
      // back to the source objects it was compiled from.
      await client.query(
        `DELETE FROM cmc_section_lineage WHERE section_id = $1 AND organization_id = $2`,
        [sectionId, orgId]
      );
      for (const lin of section.lineage) {
        await client.query(
          `INSERT INTO cmc_section_lineage (organization_id, section_id, source_object_id, source_hash_at_compile)
           VALUES ($1, $2, $3, $4)`,
          [orgId, sectionId, lin.sourceObjectId, lin.sourceHashAtCompile]
        );
      }

      // 5. Provenance
      await client.query(
        `INSERT INTO cmc_provenance_events (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
         VALUES ($1,$2,'section',$3,'compiled',$4::jsonb,$5)`,
        [
          orgId, projectId, sectionId,
          JSON.stringify({
            sectionKey: section.sectionKey,
            completeness: section.completeness,
            missingInputs: section.missingInputs,
            trigger: 'build-section-api',
          }),
          (req as any).user?.id || 'system',
        ]
      );
    }

    await client.query('COMMIT');

    // 6. Auto-bridge to governed artifact. A bridge that could not run is
    // reported, not swallowed — the old catch-and-warn hid the spine break.
    let bridgedArtifact: { artifactId: string; isNew: boolean } | null = null;
    let bridgeSkip: { reason: string; detail: string } | null = null;
    try {
      const bridged = await bridgeCompileToArtifact(orgId, projectId, section.sectionKey, {
        narrativeDraft: section.narrativeDraft,
        tables: section.tables,
        completeness: section.completeness,
        missingInputs: section.missingInputs,
        lineage: section.lineage,
      }, { createdById: Number((req as any).user?.id) || null });
      if (bridged.bridged) {
        bridgedArtifact = { artifactId: bridged.artifactId, isNew: bridged.isNew };
      } else {
        bridgeSkip = { reason: bridged.reason, detail: bridged.detail };
      }
    } catch (bridgeErr) {
      bridgeSkip = {
        reason: 'error',
        detail: bridgeErr instanceof Error ? bridgeErr.message : String(bridgeErr),
      };
    }

    return res.json({
      success: true,
      data: {
        sectionKey: section.sectionKey,
        completeness: section.completeness,
        missingInputs: section.missingInputs,
        narrativePreview: section.narrativeDraft.substring(0, 500),
        sourceCount: section.lineage.length,
        bridgedArtifact,
        bridgeSkip,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (String((error as Error)?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return res.status(500).json({
      success: false,
      error: ((error instanceof Error ? error.message : String(error)) || 'Section build failed'),
    });
  } finally {
    client.release();
  }
});

// ── GET /source-lineage/:projectId/:sectionKey ───────────────────────────────
// Returns the full lineage chain for a section: source objects → section → artifact.

router.get('/source-lineage/:projectId/:sectionKey', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId, sectionKey } = req.params;
    const pool = getPool();

    // Get section
    const sectionRes = await pool.query(
      `SELECT id, deterministic_json as "deterministicJson", narrative_text as "narrativeText",
              approval_state as "approvalState", stale, updated_at as "updatedAt"
       FROM cmc_module3_sections
       WHERE organization_id = $1 AND project_id = $2 AND section_key = $3`,
      [orgId, projectId, sectionKey]
    );

    // Get lineage (source objects linked to this section)
    const lineageRes = sectionRes.rows[0]
      ? await pool.query(
          `SELECT sl.source_hash_at_compile as "sourceHashAtCompile",
                  so.id as "sourceObjectId", so.source_type as "sourceType",
                  so.source_key as "sourceKey", so.source_hash as "currentSourceHash",
                  so.updated_at as "sourceUpdatedAt"
           FROM cmc_section_lineage sl
           JOIN cmc_source_objects so ON so.id = sl.source_object_id
           WHERE sl.section_id = $1`,
          [sectionRes.rows[0].id]
        )
      : { rows: [] };

    // Get governed artifact — via the integer artifact spine; the raw TEXT
    // project id aborts this query for uuid programs (22P02).
    const spine = await resolveCmcArtifactProject(orgId, projectId);
    const artifactRes =
      spine.state === 'linked'
        ? await pool.query(
            `SELECT id, artifact_id as "artifactId", title, status, version,
                    metadata, updated_at as "updatedAt"
             FROM concept2cure_artifacts
             WHERE organization_id = $1 AND project_id = $2 AND ctd_section = $3
             ORDER BY version DESC LIMIT 1`,
            [orgId, spine.artifactProjectId, sectionKey]
          )
        : { rows: [] as any[] };

    // Check for hash drift (source changed since compile)
    const driftingSources = lineageRes.rows.filter(
      (l: any) => l.sourceHashAtCompile !== l.currentSourceHash
    );

    return res.json({
      success: true,
      data: {
        sectionKey,
        compiled: sectionRes.rows[0] || null,
        sourceObjects: lineageRes.rows,
        governedArtifact: artifactRes.rows[0] || null,
        // Distinguishes "no artifact" from "registry not addressable".
        artifactRegistry:
          spine.state === 'linked' ? { state: 'linked' } : { state: spine.state, detail: spine.detail },
        driftingSources: driftingSources.map((d: any) => ({
          sourceObjectId: d.sourceObjectId,
          sourceType: d.sourceType,
          sourceKey: d.sourceKey,
        })),
        hasDrift: driftingSources.length > 0,
      },
    });
  } catch (error) {
    if (String((error as Error)?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return res.status(500).json({
      success: false,
      error: ((error instanceof Error ? error.message : String(error)) || 'Lineage fetch failed'),
    });
  }
});

export default router;
