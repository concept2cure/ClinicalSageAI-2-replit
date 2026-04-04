import express from 'express';
import { z } from 'zod';
import { getPool } from '../../db';
import {
  markStaleSections,
  canFinalizeExport,
  summarizeSectionDiff,
  createSourceHash,
} from '../../services/cmc-module3-compiler';
import { composeModule3FromCanonicalSources, impactedSectionsForSourceType } from '../../services/module3Composer';
import { detectContradictions, deriveImpactTasks } from '../../services/cmc-impact-contradiction-engine';
import { evaluateAndInterceptGovernedDocument } from '../../src/control-plane/governed-document-evaluator';

const router = express.Router();

const upsertSourceObjectSchema = z.object({
  sourceType: z.enum([
    'drug_substance',
    'drug_product',
    'specification',
    'method',
    'stability',
    'batch',
    'change_control',
    'comparability',
  ]),
  sourceKey: z.string().min(1),
  sourcePayload: z.record(z.any()),
  version: z.number().int().positive().optional(),
});

const resolveContradictionSchema = z.object({
  resolutionNote: z.string().min(3),
});

function getOrgId(req: express.Request): number {
  const orgId = parseInt(
    String(
      (req as any).tenantId ||
        (req as any).tenantContext?.organizationId ||
        req.headers['x-organization-id'] ||
        0
    ),
    10
  );
  if (!orgId || Number.isNaN(orgId)) throw new Error('Organization context required');
  return orgId;
}

router.post('/source-objects/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId } = req.params;
    const data = upsertSourceObjectSchema.parse(req.body);
    const pool = getPool();
    const sourceHash = createSourceHash(data.sourcePayload as Record<string, any>);
    const version = data.version || 1;

    const inserted = await pool.query(
      `INSERT INTO cmc_source_objects (organization_id, project_id, source_type, source_key, source_payload, source_hash, version)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
       ON CONFLICT (project_id, source_type, source_key, version)
       DO UPDATE SET source_payload = excluded.source_payload, source_hash = excluded.source_hash, updated_at = NOW()
       RETURNING id, source_type as "sourceType", source_key as "sourceKey", source_hash as "sourceHash", version`,
      [orgId, projectId, data.sourceType, data.sourceKey, JSON.stringify(data.sourcePayload), sourceHash, version]
    );

    await pool.query(
      `INSERT INTO cmc_provenance_events (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
       VALUES ($1,$2,'source_object',$3,'upserted',$4::jsonb,$5)`,
      [
        orgId,
        projectId,
        inserted.rows[0].id,
        JSON.stringify({ sourceType: data.sourceType, sourceKey: data.sourceKey, version }),
        (req as any).user?.id || 'system',
      ]
    );

    return res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid source object payload', details: error.errors });
    }
    if (String(error?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return res.status(500).json({ success: false, error: (error instanceof Error ? error.message : String(error)) || 'Failed to upsert source object' });
  }
});

router.get('/sections/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId } = req.params;
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT section_key as "sectionKey", section_path as "sectionPath", stale, stale_reason as "staleReason",
              approval_state as "approvalState", updated_at as "updatedAt"
       FROM cmc_module3_sections
       WHERE organization_id = $1 AND project_id = $2
       ORDER BY section_key`,
      [orgId, projectId]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    if (String(error?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return res.status(500).json({ success: false, error: (error instanceof Error ? error.message : String(error)) || 'Failed to fetch section map' });
  }
});

router.post('/compile/:projectId', async (req, res) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const orgId = getOrgId(req);
    const { projectId } = req.params;
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, source_type as "sourceType", source_payload as "sourcePayload", source_hash as "sourceHash"
       FROM cmc_source_objects
       WHERE organization_id = $1 AND project_id = $2
       ORDER BY updated_at DESC`,
      [orgId, projectId]
    );

    const compiled = composeModule3FromCanonicalSources(rows as any);
    for (const section of compiled) {
      const upsert = await client.query(
        `INSERT INTO cmc_module3_sections (organization_id, project_id, section_key, section_path, deterministic_json, narrative_text, compiled_hash, stale, stale_reason, approval_state)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,'draft')
         ON CONFLICT (project_id, section_key)
         DO UPDATE SET deterministic_json = excluded.deterministic_json,
                       compiled_hash = excluded.compiled_hash,
                       stale = excluded.stale,
                       stale_reason = excluded.stale_reason,
                       narrative_text = excluded.narrative_text,
                       updated_at = now()
         RETURNING id`,
        [
          orgId,
          projectId,
          section.sectionKey,
          section.sectionPath,
          JSON.stringify({
            ...section.structuredPayload,
            completeness: section.completeness,
            missingInputs: section.missingInputs,
          }),
          section.narrativeDraft,
          createSourceHash(section.structuredPayload),
          false,
          null,
        ]
      );
      const sectionId = upsert.rows[0]?.id;
      if (!sectionId) continue;

      await client.query(`DELETE FROM cmc_section_lineage WHERE section_id = $1`, [sectionId]);
      for (const lin of section.lineage) {
        await client.query(
          `INSERT INTO cmc_section_lineage (organization_id, section_id, source_object_id, source_hash_at_compile)
           VALUES ($1, $2, $3, $4)`,
          [orgId, sectionId, lin.sourceObjectId, lin.sourceHashAtCompile]
        );
      }
      await client.query(
        `INSERT INTO cmc_provenance_events (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
         VALUES ($1,$2,'section',$3,'compiled',$4::jsonb,$5)`,
        [
          orgId,
          projectId,
          sectionId,
          JSON.stringify({
            sectionKey: section.sectionKey,
            completeness: section.completeness,
            missingInputs: section.missingInputs,
            narrativeMechanism: 'deterministic_with_ai_optional',
          }),
          (req as any).user?.id || 'system',
        ]
      );
    }
    await client.query('COMMIT');

    res.json({ success: true, compiledCount: compiled.length, sections: compiled });
  } catch (error) {
    await client.query('ROLLBACK');
    if (String(error?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    res.status(500).json({ success: false, error: (error instanceof Error ? error.message : String(error)) || 'Compilation failed' });
  } finally {
    client.release();
  }
});

router.post('/source-changed/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId } = req.params;
    const { changedSourceType, reason } = req.body;
    const pool = getPool();
    const sectionsRes = await pool.query(
      `SELECT section_key as "sectionKey", section_path as "sectionPath", deterministic_json as "deterministicJson", compiled_hash as "compiledHash"
       FROM cmc_module3_sections WHERE organization_id=$1 AND project_id=$2`,
      [orgId, projectId]
    );
    const staleSections = impactedSectionsForSourceType(changedSourceType);
    const stale = markStaleSections(
      sectionsRes.rows.map((r: any) => ({ ...r, lineage: [], stale: false, staleReason: null })),
      changedSourceType,
      reason || 'Source changed'
    );
    for (const s of stale.filter((x) => x.stale && staleSections.includes(x.sectionKey))) {
      await pool.query(
        `UPDATE cmc_module3_sections SET stale = true, stale_reason = $1, updated_at = now() WHERE organization_id=$2 AND project_id=$3 AND section_key=$4`,
        [s.staleReason, orgId, projectId, s.sectionKey]
      );
    }
    res.json({ success: true, staleSections: stale.filter((s) => s.stale).map((s) => s.sectionKey) });
  } catch (error) {
    if (String(error?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    res.status(500).json({ success: false, error: (error instanceof Error ? error.message : String(error)) || 'Stale update failed' });
  }
});

router.post('/contradictions/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId } = req.params;
    const pool = getPool();
    const [specs, methods, stability, batch, comparability] = await Promise.all([
      pool.query(
        `SELECT material_name as "materialName", acceptance_criteria as "acceptanceCriteria" FROM quality_specifications WHERE project_id = $1`,
        [projectId]
      ),
      pool.query(`SELECT method_name as "methodName", purpose FROM analytical_methods WHERE project_id = $1`, [projectId]),
      pool.query(`SELECT study_name as "studyName", status FROM stability_studies WHERE project_id = $1`, [projectId]),
      pool.query(`SELECT batch_number as "batchNumber", disposition FROM cmc_batch_records WHERE project_id = $1`, [projectId]),
      pool.query(
        `SELECT assessment_name as "assessmentName", regulatory_risk_level as "regulatoryRiskLevel" FROM cmc_comparability_assessments WHERE project_id = $1`,
        [projectId]
      ),
    ]);

    const contradictions = detectContradictions({
      specifications: specs.rows,
      methods: methods.rows,
      stability: stability.rows,
      batch: batch.rows,
      comparability: comparability.rows,
    });

    // Wrap DELETE + INSERT in a transaction to prevent partial state
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM cmc_contradictions WHERE organization_id = $1 AND project_id = $2`, [
        orgId,
        projectId,
      ]);
      for (const c of contradictions) {
        await client.query(
          `INSERT INTO cmc_contradictions (organization_id, project_id, severity, contradiction_type, details, impacted_sections, required_reviewers)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
          [
            orgId,
            projectId,
            c.severity,
            c.contradictionType,
            c.details,
            JSON.stringify(c.impactedSections),
            JSON.stringify(c.requiredReviewers),
          ]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ success: true, contradictions, impactTasks: deriveImpactTasks(contradictions) });
  } catch (error) {
    if (String(error?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    res.status(500).json({ success: false, error: (error instanceof Error ? error.message : String(error)) || 'Contradiction detection failed' });
  }
});

router.get('/contradictions/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId } = req.params;
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, severity, contradiction_type as "contradictionType", details,
              impacted_sections as "impactedSections", required_reviewers as "requiredReviewers",
              status, updated_at as "updatedAt"
       FROM cmc_contradictions
       WHERE organization_id = $1 AND project_id = $2
       ORDER BY updated_at DESC`,
      [orgId, projectId]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    if (String(error?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return res.status(500).json({ success: false, error: (error instanceof Error ? error.message : String(error)) || 'Failed to fetch contradictions' });
  }
});

router.patch('/contradictions/:id/resolve', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { id } = req.params;
    const parsed = resolveContradictionSchema.parse(req.body || {});
    const pool = getPool();
    const updated = await pool.query(
      `UPDATE cmc_contradictions
       SET status = 'resolved',
           updated_at = NOW()
       WHERE organization_id = $1 AND id = $2
       RETURNING id, project_id as "projectId"`,
      [orgId, id]
    );
    const row = updated.rows[0];
    if (!row) return res.status(404).json({ success: false, error: 'Contradiction not found' });

    await pool.query(
      `INSERT INTO cmc_provenance_events (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
       VALUES ($1,$2,'contradiction',$3,'resolved',$4::jsonb,$5)`,
      [
        orgId,
        row.projectId,
        id,
        JSON.stringify({ resolutionNote: parsed.resolutionNote }),
        (req as any).user?.id || 'system',
      ]
    );
    return res.json({ success: true, data: { id, status: 'resolved' } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid resolution payload', details: error.errors });
    }
    if (String(error?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return res.status(500).json({ success: false, error: (error instanceof Error ? error.message : String(error)) || 'Failed to resolve contradiction' });
  }
});

router.get('/readiness/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId } = req.params;
    const pool = getPool();
    const [sections, contradictions] = await Promise.all([
      pool.query(
        `SELECT approval_state, stale
         FROM cmc_module3_sections
         WHERE organization_id = $1 AND project_id = $2`,
        [orgId, projectId]
      ),
      pool.query(
        `SELECT severity, status
         FROM cmc_contradictions
         WHERE organization_id = $1 AND project_id = $2`,
        [orgId, projectId]
      ),
    ]);

    const totalSections = sections.rows.length;
    const approvedSections = sections.rows.filter((r: any) => r.approval_state === 'approved').length;
    const staleSections = sections.rows.filter((r: any) => Boolean(r.stale)).length;
    const openCriticalContradictions = contradictions.rows.filter(
      (r: any) => r.severity === 'critical' && r.status !== 'resolved'
    ).length;

    const exportReady = totalSections > 0 && approvedSections === totalSections && staleSections === 0 && openCriticalContradictions === 0;

    // Governed Document Decision Fabric evaluation
    let governedFabric: Record<string, any> | null = null;
    try {
      const unresolvedContradictions = contradictions.rows.filter(
        (r: any) => r.status !== 'resolved'
      ).length;
      const fabricResult = evaluateAndInterceptGovernedDocument({
        context: {
          organizationId: orgId,
          projectId: Number(projectId),
          actorId: (req as any).user?.id || 'system',
          intendedAction: 'export',
          documentType: 'cmc_module3',
          ctdSection: '3',
        },
        documentState: {
          hasContent: totalSections > 0,
          hasEvidence: totalSections > 0,
          hasBeenReviewed: approvedSections > 0,
          hasApproval: exportReady,
          hasPlacement: true,
          placementValid: true,
          hasProvenance: true,
          unresolvedContradictionCount: unresolvedContradictions,
          criticalContradictionCount: openCriticalContradictions,
          isStale: staleSections > 0,
          completenessScore: totalSections > 0 ? approvedSections / totalSections : 0,
        },
      });
      governedFabric = {
        decision: fabricResult.evaluation.decision,
        readiness: fabricResult.evaluation.readiness,
        decisionReference: fabricResult.decisionReference,
      };
    } catch (fabricErr) {
      // Non-blocking — fabric failure does not break readiness endpoint
      governedFabric = { error: 'Fabric evaluation failed', degraded: true };
    }

    // Check for unresolved governed decisions affecting readiness
    let governedDecisionReadiness;
    try {
      const { hasUnresolvedGovernedDecisions } = await import('../../services/governed-decision-repository.js');
      governedDecisionReadiness = await hasUnresolvedGovernedDecisions(Number(req.params.projectId), orgId);
    } catch {
      governedDecisionReadiness = { hasUnresolved: false, unresolvedCount: 0, escalatedCount: 0, states: {} };
    }

    return res.json({
      success: true,
      data: {
        totalSections,
        approvedSections,
        staleSections,
        openCriticalContradictions,
        exportReady,
        governedFabric,
        governedDecisionReadiness,
      },
    });
  } catch (error) {
    if (String(error?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return res.status(500).json({ success: false, error: (error instanceof Error ? error.message : String(error)) || 'Failed to compute readiness' });
  }
});

router.get('/provenance/:projectId/:sectionKey', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId, sectionKey } = req.params;
    const pool = getPool();
    const sectionRes = await pool.query(
      `SELECT id
       FROM cmc_module3_sections
       WHERE organization_id = $1 AND project_id = $2 AND section_key = $3`,
      [orgId, projectId, sectionKey]
    );
    const section = sectionRes.rows[0];
    if (!section) return res.status(404).json({ success: false, error: 'Section not found' });

    const { rows } = await pool.query(
      `SELECT event_type as "eventType", event_payload as "eventPayload", created_by as "createdBy", created_at as "createdAt"
       FROM cmc_provenance_events
       WHERE organization_id = $1 AND project_id = $2 AND artifact_type = 'section' AND artifact_id = $3
       ORDER BY created_at DESC`,
      [orgId, projectId, section.id]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    if (String(error?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return res.status(500).json({ success: false, error: (error instanceof Error ? error.message : String(error)) || 'Failed to fetch provenance' });
  }
});

router.post('/sections/:projectId/:sectionKey/approve', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId, sectionKey } = req.params;
    const pool = getPool();

    const blocking = await pool.query(
      `SELECT id FROM cmc_contradictions
       WHERE organization_id = $1 AND project_id = $2 AND status <> 'resolved' AND severity = 'critical'
       LIMIT 1`,
      [orgId, projectId]
    );
    if (blocking.rows.length > 0) {
      return res
        .status(409)
        .json({ success: false, error: 'Critical contradictions must be resolved before approval.' });
    }

    // Governed Document Decision Fabric — evaluate before approval
    let governedFabric: Record<string, any> | null = null;
    try {
      const unresolvedContradictions = blocking.rows.length; // already queried above
      const fabricResult = evaluateAndInterceptGovernedDocument({
        context: {
          organizationId: orgId,
          projectId: Number(projectId),
          actorId: (req as any).user?.id || 'system',
          intendedAction: 'approve',
          documentType: 'cmc_module3',
          ctdSection: sectionKey,
        },
        documentState: {
          hasContent: true,
          hasEvidence: true,
          hasBeenReviewed: true,
          hasApproval: false, // not yet approved — that is what we are doing
          hasPlacement: true,
          placementValid: true,
          hasProvenance: true,
          unresolvedContradictionCount: unresolvedContradictions,
          criticalContradictionCount: unresolvedContradictions,
          isStale: false,
        },
      });
      governedFabric = {
        decision: fabricResult.evaluation.decision,
        readiness: fabricResult.evaluation.readiness,
        decisionReference: fabricResult.decisionReference,
      };
    } catch (fabricErr) {
      // Non-blocking for approval — log but proceed
      governedFabric = { error: 'Fabric evaluation failed', degraded: true };
    }

    const sectionRes = await pool.query(
      `SELECT id, deterministic_json, approval_state
       FROM cmc_module3_sections
       WHERE organization_id = $1 AND project_id = $2 AND section_key = $3`,
      [orgId, projectId, sectionKey]
    );
    const section = sectionRes.rows[0];
    if (!section) return res.status(404).json({ success: false, error: 'Section not found' });

    const verRes = await pool.query(
      `SELECT COALESCE(MAX(version_number), 0) as max_version
       FROM cmc_module3_section_versions
       WHERE section_id = $1`,
      [section.id]
    );
    const versionNumber = Number(verRes.rows[0]?.max_version || 0) + 1;
    const insertedVersion = await pool.query(
      `INSERT INTO cmc_module3_section_versions (organization_id, section_id, project_id, version_number, snapshot_json, diff_summary, state, created_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,'approved',$7)
       RETURNING id`,
      [
        orgId,
        section.id,
        projectId,
        versionNumber,
        JSON.stringify(section.deterministic_json),
        JSON.stringify({ approvedFromState: section.approval_state }),
        (req as any).user?.id || 'system',
      ]
    );
    await pool.query(
      `UPDATE cmc_module3_sections
       SET approval_state = 'approved', approved_version_id = $1, stale = false, stale_reason = null, updated_at = NOW()
       WHERE id = $2`,
      [insertedVersion.rows[0].id, section.id]
    );
    await pool.query(
      `INSERT INTO cmc_provenance_events (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
       VALUES ($1,$2,'section',$3,'approved',$4::jsonb,$5)`,
      [
        orgId,
        projectId,
        section.id,
        JSON.stringify({ sectionKey, versionNumber }),
        (req as any).user?.id || 'system',
      ]
    );
    res.json({
      success: true,
      sectionKey,
      versionNumber,
      approvedVersionId: insertedVersion.rows[0].id,
      governedFabric,
    });
  } catch (error) {
    if (String(error?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    res.status(500).json({ success: false, error: (error instanceof Error ? error.message : String(error)) || 'Approval failed' });
  }
});

router.post('/sections/:projectId/:sectionKey/refresh', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId, sectionKey } = req.params;
    const pool = getPool();
    const sectionRes = await pool.query(
      `SELECT id, deterministic_json, approval_state FROM cmc_module3_sections
       WHERE organization_id = $1 AND project_id = $2 AND section_key = $3`,
      [orgId, projectId, sectionKey]
    );
    const section = sectionRes.rows[0];
    if (!section) return res.status(404).json({ success: false, error: 'Section not found' });

    const payload = req.body?.deterministicJson || section.deterministic_json;
    const diffSummary = summarizeSectionDiff(section.deterministic_json, payload);
    await pool.query(
      `UPDATE cmc_module3_sections
       SET deterministic_json = $1::jsonb, approval_state = 'draft', stale = false, stale_reason = null, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(payload), section.id]
    );
    await pool.query(
      `INSERT INTO cmc_provenance_events (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
       VALUES ($1,$2,'section',$3,'refreshed',$4::jsonb,$5)`,
      [
        orgId,
        projectId,
        section.id,
        JSON.stringify({ sectionKey, diffSummary, priorApprovalState: section.approval_state }),
        (req as any).user?.id || 'system',
      ]
    );
    res.json({ success: true, sectionKey, state: 'draft', diffSummary });
  } catch (error) {
    if (String(error?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    res.status(500).json({ success: false, error: (error instanceof Error ? error.message : String(error)) || 'Refresh failed' });
  }
});

router.post('/guard/final-export/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId } = req.params;
    const pool = getPool();
    const [sectionsRes, contradictionsRes] = await Promise.all([
      pool.query(
        `SELECT approval_state FROM cmc_module3_sections WHERE organization_id = $1 AND project_id = $2`,
        [orgId, projectId]
      ),
      pool.query(
        `SELECT severity, status FROM cmc_contradictions WHERE organization_id = $1 AND project_id = $2`,
        [orgId, projectId]
      ),
    ]);

    const sections = sectionsRes.rows;
    const allApproved = sections.length > 0 && sections.every((s: any) => s.approval_state === 'approved');
    const allowed = canFinalizeExport({
      approvalState: allApproved ? 'approved' : 'draft',
      contradictions: contradictionsRes.rows || [],
    });

    // Governed Document Decision Fabric evaluation
    const approvedCount = sections.filter((s: any) => s.approval_state === 'approved').length;
    const openCritical = (contradictionsRes.rows || []).filter((c: any) => c.severity === 'critical' && c.status !== 'resolved').length;
    const unresolvedCount = (contradictionsRes.rows || []).filter((c: any) => c.status !== 'resolved').length;

    let governedFabric: Record<string, any> | null = null;
    let fabricBlocks = false;
    try {
      const fabricResult = evaluateAndInterceptGovernedDocument({
        context: {
          organizationId: orgId,
          projectId: Number(projectId),
          actorId: (req as any).user?.id || 'system',
          intendedAction: 'export',
          documentType: 'cmc_module3',
          ctdSection: '3',
        },
        documentState: {
          hasContent: sections.length > 0,
          hasEvidence: sections.length > 0,
          hasBeenReviewed: approvedCount > 0,
          hasApproval: allApproved,
          hasPlacement: true,
          placementValid: true,
          hasProvenance: true,
          unresolvedContradictionCount: unresolvedCount,
          criticalContradictionCount: openCritical,
          isStale: false,
          completenessScore: sections.length > 0 ? approvedCount / sections.length : 0,
        },
        exportState: {
          humanReviewApproved: allApproved,
          aiGenerated: false,
          provenanceComplete: true,
        },
      });
      fabricBlocks = fabricResult.evaluation.decision.outcome === 'block';
      governedFabric = {
        decision: fabricResult.evaluation.decision,
        exportGate: fabricResult.evaluation.exportGate,
        decisionReference: fabricResult.decisionReference,
      };
    } catch (fabricErr) {
      // Fail-closed: if fabric errors, treat as blocking
      fabricBlocks = true;
      governedFabric = { error: 'Fabric evaluation failed', degraded: true, blocked: true };
    }

    // Check for unresolved governed decisions affecting export
    let governedDecisionReadiness;
    try {
      const { hasUnresolvedGovernedDecisions } = await import('../../services/governed-decision-repository.js');
      governedDecisionReadiness = await hasUnresolvedGovernedDecisions(Number(projectId), orgId);
    } catch {
      governedDecisionReadiness = { hasUnresolved: false, unresolvedCount: 0, escalatedCount: 0, states: {} };
    }

    // Block export if governed decisions are unresolved
    const governedDecisionsBlock = governedDecisionReadiness?.hasUnresolved === true;

    // Fail-closed convergence: block if EITHER the existing check OR the fabric blocks OR governed decisions are unresolved
    if (!allowed || fabricBlocks || governedDecisionsBlock) {
      const errorMsg = governedDecisionsBlock && allowed && !fabricBlocks
        ? `Unresolved governed decisions block final export (${governedDecisionReadiness.unresolvedCount} unresolved, ${governedDecisionReadiness.escalatedCount} escalated)`
        : fabricBlocks && allowed
          ? 'Governed document fabric blocked final export'
          : 'Critical contradictions or missing approvals block final export';
      return res.status(409).json({
        success: false,
        error: errorMsg,
        data: {
          totalSections: sections.length,
          approvedSections: approvedCount,
          openCriticalContradictions: openCritical,
          governedFabric,
          governedDecisionReadiness,
        },
      });
    }

    return res.json({ success: true, message: 'Final export gate passed', governedFabric, governedDecisionReadiness });
  } catch (error) {
    if (String(error?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    return res.status(500).json({ success: false, error: (error instanceof Error ? error.message : String(error)) || 'Failed final export guard check' });
  }
});

export default router;
