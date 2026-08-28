import type { Express } from 'express';
import type { Pool } from 'pg';
import { authenticateToken } from '../middleware/auth.js';
import { mountAll } from './mount-routes.js';

import auditServices from '../routes/audit-services.js';
import integrationTest from '../routes/integration-test.js';
import diagnosticsPerformance from '../routes/diagnostics-performance.js';
import deviceClassification from '../routes/device-classification.js';
import substantialEquivalence from '../routes/substantial-equivalence.js';
import cybersecurity524b from '../routes/cybersecurity-524b.js';
import humanFactors from '../routes/human-factors.js';
import postmarketSurveillance from '../routes/postmarket-surveillance.js';
import udiIvdr from '../routes/udi-ivdr.js';
import marketAccess from '../routes/market-access.js';
import companionDiagnostics from '../routes/companion-diagnostics.js';
import splFhir from '../routes/spl-fhir.js';
import submissionReadiness from '../routes/submission-readiness.js';
import realtimeCollab from '../routes/realtime-collab.js';
import graphrag from '../routes/graphrag.js';
import anaCortexFt from '../routes/ana-cortex-ft.js';
import globalCompliance from '../routes/global-compliance.js';
import agentSwarm from '../routes/agent-swarm.js';
import realWorldEvidence from '../routes/real-world-evidence.js';
import regulatoryDigitalTwin from '../routes/regulatory-digital-twin.js';
import submissionTwin from '../routes/submission-twin.js';
import cro from '../routes/cro.js';
import taskManagement from '../routes/taskManagement.routes.js';
import unifiedTasks from '../routes/unifiedTasks.routes.js';
import approvalWorkflow from '../routes/approval-workflow.js';
import clientBranding from '../routes/client-branding.js';
import inlineAnnotations from '../routes/inline-annotations.js';
import decisionLineage from '../routes/decision-lineage.js';
import dataLineage from '../routes/data-lineage.js';
import workspaceSummary from '../routes/workspace-summary.js';
import chatActions from '../routes/chat-actions.js';
import conversationOs from '../routes/conversation-os.js';

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
  /**
   * Test/QA-only routes allowed to mount. Optional; when omitted the loop
   * fails closed (integration-test is not mounted).
   */
  testRoutesEnabled?: boolean;
}

export async function registerAdvancedPlatformRoutes({
  app,
  pool,
  isStaticDataEnabled,
  mountStaticBusinessDataGuard,
  testRoutesEnabled,
}: AdvancedPlatformBootstrapContext) {
  // ── Innovation + Notifications ──
  try {
    /* NOT MOUNTED — deliberately, and the router file is kept.
       All 61 routes dereference eight service handles that
       `initializeInnovationRoutes(pool)` assigns, and that function has ZERO
       callers repo-wide including tests. So every endpoint threw a TypeError
       and answered 500, while `grep -rn "innovation" client/src` returns
       nothing: no product path has ever called them.
       Mounting 61 authenticated, HTTP-reachable endpoints that cannot execute
       is attack surface backed by nothing, and it makes the platform advertise
       a capability it does not have. Calling the initializer to turn the 500s
       into 200s would be worse — it would make an unused feature LOOK live to
       anyone reading migration state.
       Whether Innovation ships is a roadmap decision, so the code stays. When
       it does, mount it here WITH the initializer and a client. */
    void 0;
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

  // ── External Intelligence (AnA's nightly agency + study-methods scan) ──
  // Digest + findings from the scheduled sweep over FDA/EMA/MHRA/TGA feeds
  // and academic/industry knowledge sources (SCDM, PubMed, medRxiv).
  try {
    const externalIntelligenceRoutes = await import('../routes/external-intelligence-routes');
    app.use('/api/external-intelligence', authenticateToken, externalIntelligenceRoutes.default);
    console.log('✅ External Intelligence routes mounted at /api/external-intelligence');
  } catch (error) {
    console.error('Failed to mount External Intelligence routes:', error);
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

  // ── Audit, Testing, Device/IVD lifecycle ──
  //
  // /api/integrations and /api/connectors used to be listed here, pointing at
  // '../routes/enterprise-integrations.ts' and '../routes/connector-library.ts'.
  // Neither file exists anywhere in the repository and no client calls either
  // path. Under the old dynamic-import form that was invisible: the import
  // rejected, `Promise.allSettled` logged it, and the boot continued. A static
  // import of a missing module is a BUILD error, so they are removed rather than
  // left to fail — and their removal is the first time the absence has been
  // stated anywhere.
  mountAll(
    app,
    [
      { path: '/api/audit-services', router: auditServices, name: 'Audit Services (figures, export, traceability, keywords)' },
      { path: '/api/diagnostics-performance', router: diagnosticsPerformance, name: 'Diagnostics Performance (CLSI analytical + clinical)' },
      { path: '/api/device-classification', router: deviceClassification, name: 'Device Classification (IMDRF SaMD + IEC 62304)' },
      { path: '/api/substantial-equivalence', router: substantialEquivalence, name: 'Substantial Equivalence (FDA 510(k) SE flowchart)' },
      { path: '/api/cybersecurity-524b', router: cybersecurity524b, name: 'Premarket Cybersecurity (FDA §524B SBOM + readiness)' },
      { path: '/api/human-factors', router: humanFactors, name: 'Human Factors (IEC 62366-1)' },
      { path: '/api/postmarket-surveillance', router: postmarketSurveillance, name: 'Post-market Surveillance (openFDA MAUDE + recalls)' },
      { path: '/api/udi-ivdr', router: udiIvdr, name: 'UDI/GUDID + EU IVDR Performance Evaluation' },
      { path: '/api/market-access', router: marketAccess, name: 'Market Access (CPT/HCPCS coding + coverage dossier)' },
      { path: '/api/companion-diagnostics', router: companionDiagnostics, name: 'Companion Diagnostics (drug↔Dx co-development)' },
      { path: '/api/spl-fhir', router: splFhir, name: 'Interoperability (LOINC + SPL + FHIR)' },
      { path: '/api/submission-readiness', router: submissionReadiness, name: 'Submission Readiness (capstone scorecard)' },
    ],
    authenticateToken,
  );

  // The test/QA-only integration-test harness stays fenced out of production
  // (#848). Kept as its own conditional mount rather than an entry with a skip
  // branch inside the loop: a fence you have to read the loop body to see is a
  // fence that gets refactored away.
  if (testRoutesEnabled) {
    mountAll(app, [
      { path: '/api/integration-test', router: integrationTest, name: 'Integration Test (dev/QA)' },
    ], authenticateToken);
  } else {
    console.info('⛔ /api/integration-test not mounted (test routes fenced in this environment)');
  }

  // ── Advanced AI & Compliance ──
  mountAll(
    app,
    [
      { path: '/api/realtime-collab', router: realtimeCollab, name: 'Real-time Collaboration' },
      { path: '/api/graphrag', router: graphrag, name: 'GraphRAG' },
      { path: '/api/ana-cortex-ft', router: anaCortexFt, name: 'AnA Intelligence Fine-Tuning' },
      { path: '/api/compliance', router: globalCompliance, name: 'Global Regulatory Compliance' },
      { path: '/api/agent-swarm', router: agentSwarm, name: 'Agent Swarm' },
      { path: '/api/real-world-evidence', router: realWorldEvidence, name: 'Real-World Evidence' },
      { path: '/api/regulatory-digital-twin', router: regulatoryDigitalTwin, name: 'Regulatory Digital Twin' },
      { path: '/api/submission-twin', router: submissionTwin, name: 'Submission Twin' },
      { path: '/api/cro', router: cro, name: 'CRO Management' },
    ],
    authenticateToken,
  );

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

  // ── Task Management + Approvals ──
  mountAll(
    app,
    [
      { path: '/api/task-management', router: taskManagement, name: 'Task Management' },
      { path: '/api/unified-tasks', router: unifiedTasks, name: 'Unified Tasks' },
      { path: '/api/approval-workflows', router: approvalWorkflow, name: 'Approval Workflows' },
    ],
    authenticateToken,
  );

  // ── Branding, Annotations, Lineage ──
  mountAll(
    app,
    [
      { path: '/api/client-branding', router: clientBranding, name: 'Client Branding' },
      { path: '/api/inline-annotations', router: inlineAnnotations, name: 'Inline Annotations' },
      { path: '/api/decision-lineage', router: decisionLineage, name: 'Decision Lineage' },
      { path: '/api/data-lineage', router: dataLineage, name: 'Data Lineage' },
    ],
    authenticateToken,
  );

  // ── Workspace + Chat + Conversation OS ──
  mountAll(
    app,
    [
      { path: '/api', router: workspaceSummary, name: 'Workspace Summary' },
      { path: '/api', router: chatActions, name: 'Chat Actions' },
      { path: '/api/conversation-os', router: conversationOs, name: 'Conversation OS' },
    ],
    authenticateToken,
  );

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
