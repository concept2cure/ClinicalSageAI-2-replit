import type { Express } from 'express';
import type { Pool } from 'pg';
import { authenticateToken } from '../middleware/auth.js';

// SECURITY: nearly every router mounted here is tenant-scoped — task
// management, approvals, branding, lineage, workspace projects. The
// few exceptions (integration-test, notifications-as-function-app) are
// either dev-only or perform their own auth via app.METHOD handlers,
// where authenticateToken would not be the right gate. Bulk-apply
// authenticateToken to every config-driven mount below.

export interface AdvancedPlatformBootstrapContext {
  app: Express;
  pool: Pool;
  isStaticDataEnabled: (flag: string) => boolean;
  mountStaticBusinessDataGuard: (path: string, routeName: string, requiredFlag: string) => void;
}

export async function registerAdvancedPlatformRoutes({
  app,
  pool,
  isStaticDataEnabled,
  mountStaticBusinessDataGuard,
}: AdvancedPlatformBootstrapContext) {
  // ── Innovation + Notifications ──
  try {
    const innovationRoutes = await import('../routes/innovation-routes');
    app.use('/api/innovation', authenticateToken, innovationRoutes.default);
    console.log('✅ Innovation routes mounted at /api/innovation');
  } catch (error) {
    console.error('Failed to mount innovation routes:', error);
  }

  // ── Regulatory Intelligence (AnA 1.0 RI) ──
  // Predictive CRL/RTF layer: closes the submission-outcome feedback loop,
  // exposes cross-tenant DP-anonymized priors, and surfaces a blended
  // readiness score that compounds as more outcomes flow through the platform.
  try {
    const regulatoryIntelligenceRoutes = await import('../routes/regulatory-intelligence');
    app.use('/api/regulatory-intelligence', authenticateToken, regulatoryIntelligenceRoutes.default);
    console.log('✅ Regulatory Intelligence routes mounted at /api/regulatory-intelligence');
  } catch (error) {
    console.error('Failed to mount Regulatory Intelligence routes:', error);
  }

  try {
    const notificationRoutes = await import('../routes/notification_routes');
    // notification_routes exports a function(app) that registers routes directly
    if (
      typeof notificationRoutes.default === 'function' &&
      notificationRoutes.default.length >= 1
    ) {
      notificationRoutes.default(app);
    } else {
      app.use('/api/notifications', authenticateToken, notificationRoutes.default);
    }
    console.log('✅ Notification routes mounted at /api/notifications');
  } catch (error) {
    console.error('Failed to mount notification routes:', error);
  }

  // ── Audit, Testing, Integrations (parallelized) ──
  {
    const auditIntegConfig = [
      {
        path: '/api/audit-services',
        mod: '../routes/audit-services.js',
        name: 'Audit Services (figures, export, traceability, keywords)',
      },
      {
        path: '/api/integration-test',
        mod: '../routes/integration-test',
        name: 'Integration Test (dev/QA)',
      },
      {
        path: '/api/integrations',
        mod: '../routes/enterprise-integrations.ts',
        name: 'Enterprise Integrations (Medidata, Veeva, Adobe)',
      },
      {
        path: '/api/connectors',
        mod: '../routes/connector-library.ts',
        name: 'Connector Library (catalog, toggle, guides)',
      },
      {
        path: '/api/diagnostics-performance',
        mod: '../routes/diagnostics-performance.ts',
        name: 'Diagnostics Performance (CLSI analytical + clinical)',
      },
      {
        path: '/api/device-classification',
        mod: '../routes/device-classification.ts',
        name: 'Device Classification (IMDRF SaMD + IEC 62304)',
      },
      {
        path: '/api/substantial-equivalence',
        mod: '../routes/substantial-equivalence.ts',
        name: 'Substantial Equivalence (FDA 510(k) SE flowchart)',
      },
      {
        path: '/api/cybersecurity-524b',
        mod: '../routes/cybersecurity-524b.ts',
        name: 'Premarket Cybersecurity (FDA §524B SBOM + readiness)',
      },
      {
        path: '/api/human-factors',
        mod: '../routes/human-factors.ts',
        name: 'Human Factors (IEC 62366-1)',
      },
      {
        path: '/api/postmarket-surveillance',
        mod: '../routes/postmarket-surveillance.ts',
        name: 'Post-market Surveillance (openFDA MAUDE + recalls)',
      },
    ] as const;
    const auditIntegResults = await Promise.allSettled(auditIntegConfig.map(c => import(c.mod)));
    auditIntegResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        app.use(auditIntegConfig[i].path, authenticateToken, r.value.default);
        console.log(`✅ ${auditIntegConfig[i].name} routes mounted`);
      } else {
        console.error(`❌ Failed to mount ${auditIntegConfig[i].name} routes:`, r.reason);
      }
    });
  }

  // ── Advanced AI & Compliance (parallelized) ──
  {
    const advancedConfig = [
      { path: '/api/realtime-collab', mod: '../routes/realtime-collab', name: 'Real-time Collaboration' },
      { path: '/api/graphrag', mod: '../routes/graphrag', name: 'GraphRAG' },
      { path: '/api/ana-cortex-ft', mod: '../routes/ana-cortex-ft', name: 'AnA Intelligence Fine-Tuning' },
      { path: '/api/compliance', mod: '../routes/global-compliance.js', name: 'Global Regulatory Compliance' },
      { path: '/api/agent-swarm', mod: '../routes/agent-swarm', name: 'Agent Swarm' },
      { path: '/api/real-world-evidence', mod: '../routes/real-world-evidence', name: 'Real-World Evidence' },
      { path: '/api/regulatory-digital-twin', mod: '../routes/regulatory-digital-twin', name: 'Regulatory Digital Twin' },
      { path: '/api/submission-twin', mod: '../routes/submission-twin', name: 'Submission Twin' },
      { path: '/api/cro', mod: '../routes/cro', name: 'CRO Management' },
    ] as const;
    const advancedResults = await Promise.allSettled(advancedConfig.map(c => import(c.mod)));
    advancedResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        app.use(advancedConfig[i].path, authenticateToken, r.value.default);
        console.log(`✅ ${advancedConfig[i].name} routes mounted`);
      } else {
        console.error(`❌ Failed to mount ${advancedConfig[i].name} routes:`, r.reason);
      }
    });
  }

  // ── 21 CFR Part 11 Compliance (needs pool for audit persistence) ──
  try {
    const part11Routes = await import('../routes/part11-compliance');
    if (part11Routes.setAuditPool) part11Routes.setAuditPool(pool);
    app.use('/api/part11', authenticateToken, part11Routes.default);
    console.log('✅ 21 CFR Part 11 Compliance routes mounted at /api/part11');
  } catch (error) {
    console.error('❌ Failed to mount Part 11 compliance routes:', error);
  }

  // ── Mission Control + Snow Globe ──
  try {
    const missionControlRoutes = await import('../routes/mission-control');
    if (isStaticDataEnabled('ENABLE_MISSION_CONTROL_STATIC_DATA')) {
      app.use('/api/mission-control', authenticateToken, missionControlRoutes.default);
      console.log('✅ Mission Control routes mounted at /api/mission-control');
    } else {
      mountStaticBusinessDataGuard(
        '/api/mission-control',
        'Mission Control routes',
        'ENABLE_MISSION_CONTROL_STATIC_DATA'
      );
    }

    const snowglobeRoutes = await import('../routes/snowglobe');
    app.use('/api/snowglobe', authenticateToken, snowglobeRoutes.default);
    console.log('✅ Snow Globe routes mounted at /api/snowglobe');
  } catch (error) {
    console.error('❌ Failed to mount Mission Control routes:', error);
  }

  // ── Task Management + Approvals (parallelized) ──
  {
    const taskConfig = [
      {
        path: '/api/task-management',
        mod: '../routes/taskManagement.routes',
        name: 'Task Management',
      },
      {
        path: '/api/unified-tasks',
        mod: '../routes/unifiedTasks.routes',
        name: 'Unified Tasks',
      },
      {
        path: '/api/approval-workflows',
        mod: '../routes/approval-workflow',
        name: 'Approval Workflows',
      },
    ] as const;
    const taskResults = await Promise.allSettled(taskConfig.map(c => import(c.mod)));
    taskResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        app.use(taskConfig[i].path, authenticateToken, r.value.default);
        console.log(`✅ ${taskConfig[i].name} routes mounted`);
      } else {
        console.error(`❌ Failed to mount ${taskConfig[i].name} routes:`, r.reason);
      }
    });
  }

  // ── Branding, Annotations, Lineage (parallelized) ──
  {
    const workflowConfig = [
      { path: '/api/client-branding', mod: '../routes/client-branding', name: 'Client Branding' },
      {
        path: '/api/inline-annotations',
        mod: '../routes/inline-annotations',
        name: 'Inline Annotations',
      },
      {
        path: '/api/decision-lineage',
        mod: '../routes/decision-lineage',
        name: 'Decision Lineage',
      },
      { path: '/api/data-lineage', mod: '../routes/data-lineage', name: 'Data Lineage' },
    ] as const;
    const workflowResults = await Promise.allSettled(workflowConfig.map(c => import(c.mod)));
    workflowResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        app.use(workflowConfig[i].path, authenticateToken, r.value.default);
        console.log(`✅ ${workflowConfig[i].name} routes mounted`);
      } else {
        console.error(`❌ Failed to mount ${workflowConfig[i].name} routes:`, r.reason);
      }
    });
  }

  // ── Workspace + Chat + Conversation OS (parallelized) ──
  {
    const wsConfig = [
      { path: '/api', mod: '../routes/workspace-summary', name: 'Workspace Summary' },
      { path: '/api', mod: '../routes/chat-actions', name: 'Chat Actions' },
      {
        path: '/api/conversation-os',
        mod: '../routes/conversation-os',
        name: 'Conversation OS',
      },
    ] as const;
    const wsResults = await Promise.allSettled(wsConfig.map(c => import(c.mod)));
    wsResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        app.use(wsConfig[i].path, authenticateToken, r.value.default);
        console.log(`✅ ${wsConfig[i].name} routes mounted`);
      } else {
        console.error(`❌ Failed to mount ${wsConfig[i].name} routes:`, r.reason);
      }
    });
  }

  // ── Workspace Projects (inline handlers — use pool directly) ──
  // authenticateToken runs first to populate req.user; the handler's
  // own org-context check then enforces tenant presence.
  app.post('/api/workspace/projects', authenticateToken, async (req: any, res: any) => {
    const rawOrgId =
      req.tenantContext?.organizationId ||
      req.organizationId ||
      req.user?.organizationId ||
      req.user?.tenantId;
    if (!rawOrgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const orgId: number = parseInt(String(rawOrgId), 10);
    if (!orgId) {
      return res.status(401).json({ error: 'Invalid organization ID' });
    }
    const {
      name,
      type = 'ind',
      description,
      clientId,
      deviceName,
      drugName,
      indication,
      sponsor,
      phase,
      deviceType,
      regulatoryContext,
      product,
      region,
      goal,
    } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ ok: false, error: 'name is required' });
    try {
      const t = (type || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      let row: any;
      if (t === 'ind' || t === 'bla' || t === 'nda' || t === 'pharma') {
        const r = await pool.query(
          `INSERT INTO ind_projects (name, project_id, organization_id, client_workspace_id, drug_name, indication, sponsor, phase, status, stage, progress, project_data, step_data, sections, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active','planning',0,'{}','{}','[]',NOW(),NOW()) RETURNING id, name`,
          [
            name.trim(),
            `ind-${Date.now()}`,
            orgId,
            clientId ? parseInt(clientId, 10) : null,
            drugName || product || name.trim(),
            indication || goal || name.trim(),
            sponsor || 'TBD',
            phase || 'Phase 1',
          ]
        );
        row = { id: String(r.rows[0].id), name: r.rows[0].name, type: 'ind' };
      } else if (t === '510k' || t === 'pma' || t === 'denovo') {
        const r = await pool.query(
          `INSERT INTO fda_510k_projects (organization_id, device_name, device_classification, current_stage, current_stage_progress, overall_progress, created_at, updated_at) VALUES ($1,$2,$3,'planning',0,0,NOW(),NOW()) RETURNING id, device_name AS name`,
          [orgId, (deviceName || name).trim(), null]
        );
        row = { id: String(r.rows[0].id), name: r.rows[0].name, type: '510k' };
      } else {
        const r = await pool.query(
          `INSERT INTO cer_projects (name, organization_id, client_workspace_id, device_name, device_type, regulatory_context, description, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',NOW(),NOW()) RETURNING id, name`,
          [
            name.trim(),
            orgId,
            clientId ? parseInt(clientId, 10) : null,
            deviceName || name.trim(),
            deviceType || null,
            regulatoryContext || (t === 'ivdr' ? 'IVDR' : 'MDR'),
            description || null,
          ]
        );
        row = { id: String(r.rows[0].id), name: r.rows[0].name, type: 'cer' };
      }
      return res.status(201).json({ ok: true, project: { ...row, orgId: String(orgId) } });
    } catch (err: any) {
      console.error('[workspace/projects POST]', err?.message);
      return res
        .status(500)
        .json({ ok: false, error: 'Project creation failed', detail: err?.message });
    }
  });

  app.get('/api/workspace/projects', authenticateToken, async (req: any, res: any) => {
    const rawOrgId =
      req.tenantContext?.organizationId ||
      req.organizationId ||
      req.user?.organizationId ||
      req.user?.tenantId;
    if (!rawOrgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const orgId: number = parseInt(String(rawOrgId), 10);
    if (!orgId) {
      return res.status(401).json({ error: 'Invalid organization ID' });
    }
    try {
      const r = await pool.query(
        `SELECT * FROM (SELECT id::text, name, 'ind' AS type, status, updated_at FROM ind_projects WHERE organization_id = $1 UNION ALL SELECT id::text, COALESCE(device_name,'Unnamed') AS name, '510k' AS type, NULL AS status, updated_at FROM fda_510k_projects WHERE organization_id = $1 UNION ALL SELECT id::text, name, 'cer' AS type, status, updated_at FROM cer_projects WHERE organization_id = $1) p ORDER BY updated_at DESC NULLS LAST`,
        [orgId]
      );
      return res.json({ ok: true, projects: r.rows });
    } catch (err: any) {
      return res
        .status(500)
        .json({ ok: false, error: 'Failed to load projects', detail: err?.message });
    }
  });
  console.log('✅ Workspace projects routes registered (GET|POST /api/workspace/projects)');

  console.log('✅ Advanced Platform route family registered');
}
