import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import type { Pool } from 'pg';

export interface RegulatoryBootstrapContext {
  app: express.Express;
  pool: Pool;
}

export async function registerRegulatoryRoutes({ app, pool }: RegulatoryBootstrapContext) {
  // ── FDA/CERV2/Device regulatory routes (parallelized) ──
  {
    const regulatoryRouteResults = await Promise.allSettled([
      import('../routes/fda510k-unified.js'),
      import('../routes/fda510k-routes.js'),
      import('../routes/510k-estar-routes'),
      import('../routes/cerv2-export-routes'),
      import('../routes/cerv2-ai-routes'),
      import('../routes/documentOrchestrationRoutes.js'),
      import('../routes/esgSubmissionRoutes.js'),
      import('../routes/medical-device-routes.js'),
    ]);

    const routeMap = [
      { path: '/api/fda510k-unified', label: 'FDA 510(k) Unified' },
      { path: '/api/fda510k', label: 'FDA 510(k) Legacy' },
      { path: '/api/510k/estar', label: 'FDA 510(k) eSTAR' },
      { path: '/api/cerv2/export', label: 'CERV2 Export' },
      { path: '/api/cerv2/ai', label: 'CERV2 AI' },
      { path: null, label: 'Doc Orchestration' },
      { path: null, label: 'ESG Submission' },
      { path: '/api/medical-devices', label: 'Medical Device' },
    ];

    regulatoryRouteResults.forEach((result, i) => {
      const { path: mountPath, label } = routeMap[i];
      if (result.status === 'fulfilled') {
        const router = result.value.default;
        if (mountPath) {
          app.use(mountPath, router);
        } else {
          app.use(router);
        }
        console.log(`✅ ${label} routes mounted`);
      } else {
        console.error(`❌ Failed to mount ${label} routes:`, result.reason);
      }
    });
  }

  // ── IVDR (In Vitro Diagnostic Regulation EU 2017/746) ──
  try {
    const ivdrModule = await import('../routes/ivdr-routes');
    const createIVDRRoutes = ivdrModule.default;

    const requireIVDRAccess = async (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).userId;
      if (!userId) {
        return res.status(401).json({
          error: 'Authentication required to access IVDR module',
          code: 'AUTH_REQUIRED',
        });
      }

      if (process.env.ENABLE_IVDR_MODULE === 'false') {
        return res.status(403).json({
          error: 'IVDR module is not enabled for this environment',
          code: 'IVDR_MODULE_DISABLED',
        });
      }

      const tenantId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
      if (!tenantId) {
        return res.status(403).json({
          error: 'Organization context required to access IVDR module',
          code: 'IVDR_NO_TENANT',
        });
      }

      try {
        const entitlement = (await Promise.race([
          pool.query(
            `SELECT 1 FROM module_subscriptions ms
             JOIN available_modules am ON ms.module_id = am.id
             WHERE ms.organization_id = $1
               AND am.module_key = 'ivdr_module'
               AND ms.status = 'active'
             LIMIT 1`,
            [tenantId]
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('IVDR_ENTITLEMENT_TIMEOUT')), 3000)
          ),
        ])) as any;
        if (entitlement.rows.length === 0) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[IVDR] No active subscription found — allowing dev mode access');
          } else {
            return res.status(403).json({
              error: 'Organization does not have an active IVDR module subscription',
              code: 'IVDR_NOT_LICENSED',
            });
          }
        }
      } catch (err: any) {
        if (err?.message === 'IVDR_ENTITLEMENT_TIMEOUT') {
          console.warn('[IVDR] Entitlement check timed out — allowing dev mode access');
        } else if (err?.code === '42P01') {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[IVDR] module_subscriptions table not found — allowing dev mode access');
          } else {
            return res.status(503).json({
              error: 'IVDR module licensing tables not yet provisioned',
              code: 'IVDR_NOT_PROVISIONED',
            });
          }
        } else {
          console.error('[IVDR] Entitlement check error:', err?.message);
          if (process.env.NODE_ENV !== 'development') {
            throw err;
          }
        }
      }

      const userPermissions: string[] =
        (req as any).user?.permissions || (req as any).tenant?.permissions || [];

      const rolePermMap: Record<string, string[]> = {
        superadmin: ['ivdr:read', 'ivdr:write', 'ivdr:classify', 'ivdr:approve', 'ivdr:export'],
        admin: ['ivdr:read', 'ivdr:write', 'ivdr:classify', 'ivdr:approve', 'ivdr:export'],
        regulatory_lead: ['ivdr:read', 'ivdr:write', 'ivdr:classify', 'ivdr:approve', 'ivdr:export'],
        regulatory: ['ivdr:read', 'ivdr:write', 'ivdr:classify'],
        quality_assurance: ['ivdr:read', 'ivdr:write'],
        viewer: ['ivdr:read'],
        user: ['ivdr:read'],
      };

      const userRole = (req as any).userRole || (req as any).tenantContext?.role || '';
      const effectivePerms: Set<string> = new Set([
        ...userPermissions,
        ...(rolePermMap[userRole] || []),
      ]);

      const hasWildcard = effectivePerms.has('*');
      const isReadOnly = req.method === 'GET' || req.method === 'HEAD';
      const requiredPerm = isReadOnly ? 'ivdr:read' : 'ivdr:write';

      if (!hasWildcard && !effectivePerms.has(requiredPerm)) {
        return res.status(403).json({
          error: `Insufficient permissions: ${requiredPerm} required`,
          code: 'IVDR_PERMISSION_DENIED',
          required: requiredPerm,
        });
      }

      (req as any).ivdrPermissions = effectivePerms;
      next();
    };

    const ivdrGateway = express.Router();
    ivdrGateway.use(createIVDRRoutes(pool));

    try {
      const binderModule = await import('../routes/ivdr-binder-routes');
      const createBinderRoutes = binderModule.default;
      ivdrGateway.use(createBinderRoutes(pool));
      console.log('✅ IVDR Evidence Binder + Pack Builder routes mounted');
    } catch (binderErr) {
      console.error('❌ Failed to mount IVDR Binder routes:', binderErr);
    }

    app.use('/api/ivdr', requireIVDRAccess, ivdrGateway);
    console.log('✅ IVDR API gateway mounted (EU 2017/746 | auth → flag → entitlement → RBAC)');

    try {
      const workerModule = await import('../workers/ivdr-pack-worker');
      workerModule.startPackBuildWorker(pool, 2000);
      console.log('✅ IVDR Pack Build Worker started (2s interval)');
    } catch (workerErr) {
      console.error('❌ Failed to start IVDR Pack Worker:', workerErr);
    }
  } catch (error) {
    console.error('❌ Failed to mount IVDR routes:', error);
  }

  // ── Manufacturing Module (ISA-95/FHIR, EBR, Quality, AI review) ──
  try {
    const mfgModule = await import('../routes/manufacturing-routes');
    const createManufacturingRoutes = mfgModule.default;
    app.use('/api/manufacturing', createManufacturingRoutes(pool));
    console.log('✅ Manufacturing API routes mounted (ISA-95/FHIR, Plug & Produce, EBR, AI review)');
  } catch (error) {
    console.error('❌ Failed to mount Manufacturing routes:', error);
  }

  // ── Pharmacovigilance Module (ICH E2A/E2B/E2C/E2D/E2E/E2F) ──
  try {
    const pvModule = await import('../routes/pharmacovigilance-routes');
    const createPharmacovigilanceRoutes = pvModule.default;
    app.use('/api/pharmacovigilance', createPharmacovigilanceRoutes());
    console.log('✅ Pharmacovigilance API routes mounted (ICH E2A-E2F, GVP Module V/IX)');
  } catch (error) {
    console.error('❌ Failed to mount Pharmacovigilance routes:', error);
  }

  // ── Clinical Operations (study/site/enrollment/monitoring) ──
  try {
    const clinOpsModule = await import('../routes/clinical-operations-routes');
    const createClinicalOperationsRoutes = clinOpsModule.default;
    app.use('/api/clinical-operations', createClinicalOperationsRoutes(pool));
    console.log(
      '✅ Clinical Operations API routes mounted (studies, sites, enrollment, monitoring, deviations)'
    );
  } catch (error) {
    console.error('❌ Failed to mount Clinical Operations routes:', error);
  }

  // ── CER (Clinical Evaluation Report) ──
  try {
    const cerModule = await import('../routes/cer-routes.js');
    app.use('/api/cer', cerModule.default);
    console.log('✅ CER (Clinical Evaluation Report) API routes mounted (MDR/IVDR compliant)');
  } catch (error) {
    console.error('❌ Failed to mount CER routes:', error);
  }

  // ── PDF task + compression ──
  try {
    const pdfTasksModule = await import('../routes/pdf-task-routes');
    app.use('/api/pdf-tasks', pdfTasksModule.default);
    console.log('✅ PDF task + compression routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount PDF task routes:', error);
  }

  // ── GRDHE (Global Regulatory Data Harmonization Engine) ──
  try {
    const grdheModule = await import('../routes/grdheRoutes.js');
    app.use('/api/grdhe', grdheModule.default);
    console.log('✅ GRDHE routes mounted (21 CFR Part 11, EU MDR 2017/745)');
  } catch (error) {
    console.error('❌ Failed to mount GRDHE routes:', error);
  }

  // ── CERV2 Unified Document Routes ──
  try {
    const cerv2DocumentModule = await import('../routes/cerv2-document-routes');
    app.use('/api/cerv2', cerv2DocumentModule.default);
    console.log('✅ CERV2 unified document routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount CERV2 document routes:', error);
  }

  console.log('✅ Regulatory route family registered');
}
