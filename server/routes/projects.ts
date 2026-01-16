import { Router } from 'express';
import { db } from '../../lib/database.js';

const router = Router();

router.get('/projects/:id', async (req, res) => {
  const tenantHeader = req.headers['x-organization-id'] || req.headers['x-tenant-id'];
  const tenantId = tenantHeader ? Number(tenantHeader) : null;
  const projectId = Number(req.params.id);

  if (!tenantId) {
    return res.status(400).json({ error: 'Missing tenant context' });
  }
  if (!projectId || Number.isNaN(projectId)) {
    return res.status(400).json({ error: 'Invalid project id' });
  }

  try {
    const result = await db.query(
      `
      SELECT
        id,
        organization_id,
        client_workspace_id,
        name,
        code,
        description,
        status,
        priority,
        type,
        start_date,
        target_end_date,
        actual_end_date,
        progress,
        budget,
        budget_currency,
        budget_status,
        created_by_id,
        owner_id,
        sponsors,
        tags,
        critical_to_quality_factors,
        risk_level,
        risk_assessment,
        quality_targets,
        module_references,
        settings,
        metadata,
        created_at,
        updated_at
      FROM projects
      WHERE id = $1 AND organization_id = $2
      LIMIT 1
      `,
      [projectId, tenantId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const row = result.rows[0];
    const project = {
      id: row.id,
      organizationId: row.organization_id,
      clientWorkspaceId: row.client_workspace_id,
      name: row.name,
      code: row.code,
      description: row.description,
      status: row.status,
      priority: row.priority,
      type: row.type,
      startDate: row.start_date,
      targetEndDate: row.target_end_date,
      actualEndDate: row.actual_end_date,
      progress: row.progress,
      budget: row.budget,
      budgetCurrency: row.budget_currency,
      budgetStatus: row.budget_status,
      createdById: row.created_by_id,
      ownerId: row.owner_id,
      sponsors: row.sponsors,
      tags: row.tags,
      criticalToQualityFactors: row.critical_to_quality_factors,
      riskLevel: row.risk_level,
      riskAssessment: row.risk_assessment,
      qualityTargets: row.quality_targets,
      moduleReferences: row.module_references,
      settings: row.settings,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return res.json({
      project,
      sections: [],
      validationResults: [],
      documents: [],
      timeline: [],
      team: [],
      drugInfo: null,
    });
  } catch (error) {
    console.error('[Projects] Failed to fetch project:', error);
    return res.status(500).json({ error: 'Failed to fetch project' });
  }
});

export default router;
