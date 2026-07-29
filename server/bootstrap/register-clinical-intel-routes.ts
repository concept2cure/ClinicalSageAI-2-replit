import express from 'express';
import type { Pool } from 'pg';
import { authenticateToken } from '../middleware/auth.js';

export interface ClinicalIntelBootstrapContext {
  app: express.Express;
  pool: Pool;
}

export async function registerClinicalIntelRoutes({
  app,
  pool,
}: ClinicalIntelBootstrapContext) {
  // ── IND Family (parallelized) ──
  //
  // SECURITY: All IND routes are tenant-scoped and must be
  // authenticated. Pre-fix, this entire family was reachable from the
  // public internet without a JWT — the routers themselves had no auth
  // middleware. Mounting `authenticateToken` at the path here is the
  // backstop: even if an individual router file forgets to add its own
  // auth (and most do), the bootstrap forces it. Tenant isolation
  // inside each handler is a separate concern audited per-file.
  {
    const indConfig = [
      { path: '/api/ind', mod: '../routes/ind', name: 'IND' },
      { path: '/api/ind-wizard', mod: '../routes/ind-unified', name: 'IND Unified (Wizard)' },
      { path: '/api/ind-templates', mod: '../routes/ind-templates', name: 'IND Templates' },
      {
        path: '/api/ind-submissions',
        mod: '../routes/ind-submissions.routes',
        name: 'IND Submissions',
      },
      { path: '/api/ind-database', mod: '../routes/ind-database.routes', name: 'IND Database' },
      {
        path: '/api/ind-automation',
        mod: '../routes/ind_automation_routes',
        name: 'IND Automation',
      },
    ] as const;
    const indResults = await Promise.allSettled(indConfig.map(c => import(c.mod)));
    indResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        app.use(indConfig[i].path, authenticateToken, r.value.default);
        console.log(`✅ ${indConfig[i].name} routes mounted (auth-gated)`);
      } else {
        console.error(`❌ Failed to mount ${indConfig[i].name} routes:`, r.reason);
      }
    });
  }

  // ── Documents Gateway (unified + intelligence) ──
  // sourceLinks was removed with the `source_citations` table it fronted: the
  // table never had DDL anywhere in the repo (every call 42P01'd), and its id
  // space was incoherent — the AI-edit writer inserted concept2cure_artifacts
  // ids where this route's reads expected documents ids. Recorded section→source
  // lineage lives in authoring_citations (cite-source API + Source Tracer).
  try {
    const [documentsUnified, documentIntelligenceRoutes] = await Promise.all([
      import('../routes/documents-unified'),
      import('../routes/document-intelligence-routes'),
    ]);

    const documentsGateway = express.Router();
    documentsGateway.use(documentsUnified.default);
    documentsGateway.use(documentIntelligenceRoutes.default);

    app.use('/api/documents', documentsGateway);
    console.log('✅ Documents gateway mounted at /api/documents (unified + intelligence)');
  } catch (error) {
    console.error('Failed to mount consolidated documents gateway routes:', error);
  }

  // ── RTM Export ──
  //
  // SECURITY: RTM export exposes the full requirements trace matrix for
  // a program — competitive intelligence for a regulated-pharma client.
  // Pre-fix this was mounted at /api with NO auth, meaning every
  // /api/programs/:programId/rtm* endpoint (read + snapshot CSV) was
  // reachable from the public internet. Auth-gated now.
  try {
    const rtmExportRoutes = await import('../routes/rtm-export');
    app.use('/api', authenticateToken, rtmExportRoutes.default);
    console.log('✅ RTM Export routes mounted at /api/programs/:programId/rtm (auth-gated)');
  } catch (error) {
    console.error('Failed to mount RTM export routes:', error);
  }

  // ── Intelligence, CSR, Protocol, QC, Regulatory, Module Integration (parallelized) ──
  {
    const intelConfig = [
      { path: '/api/intelligence', mod: '../routes/intelligence', name: 'Intelligence + RIM' },
      { path: '/api/protocol', mod: '../routes/protocol_routes', name: 'Protocol', named: true },
      { path: '/api/qc', mod: '../routes/qc.routes', name: 'QC' },
      {
        path: '/api/module-integration',
        mod: '../routes/moduleIntegrationRoutes',
        name: 'Module Integration',
      },
      { path: '/api/regulatory', mod: '../routes/regulatoryRoutes', name: 'Regulatory' },
      {
        path: '/api/document-understanding',
        mod: '../routes/document-understanding',
        name: 'Document Understanding',
      },
    ] as const;
    const intelResults = await Promise.allSettled(intelConfig.map(c => import(c.mod)));
    intelResults.forEach((r, i) => {
      const cfg = intelConfig[i];
      if (r.status === 'fulfilled') {
        // protocol_routes exports { protocolRoutes } as named export
        const router =
          'named' in cfg && cfg.named
            ? (r.value as any).protocolRoutes
            : r.value.default;
        app.use(cfg.path, router);
        console.log(`✅ ${cfg.name} routes mounted at ${cfg.path}`);
      } else {
        console.error(`❌ Failed to mount ${cfg.name} routes:`, r.reason);
      }
    });
  }

  // ── Citation Verification ──
  //
  // Real PubMed + CrossRef citation existence checks (replaces the prior
  // client-side service that asserted existence with Math.random()).
  // Auth-gated; the data is public bibliographic metadata but the surface
  // is client-facing.
  try {
    const citationRoutes = await import('../routes/citations');
    app.use('/api/citations', authenticateToken, citationRoutes.default);
    console.log('✅ Citation Verification routes mounted at /api/citations (auth-gated)');
  } catch (error) {
    console.error('Failed to mount citation verification routes:', error);
  }

  // ── CSR Builder (dual-mount for backward compat) ──
  try {
    const csrBuilderRoutes = await import('../routes/csr-builder-routes');
    app.use('/api/csr-builder', csrBuilderRoutes.default);
    app.use('/api/csr', csrBuilderRoutes.default);
    console.log('✅ CSR Builder routes mounted at /api/csr-builder and /api/csr');
  } catch (error) {
    console.error('Failed to mount CSR builder routes:', error);
  }

  // ── Leaves (Enhanced Document Editor) ──
  try {
    const leavesRoutes = await import('../routes/leaves.js');
    app.use('/api/leaves', leavesRoutes.default);
    console.log('✅ Leaves routes mounted successfully');
  } catch (error) {
    console.error('Failed to mount leaves routes:', error);
  }

  // ── Docs routes ──
  try {
    const docsRoutes = await import('../routes/docs');
    app.use('/api/docs', docsRoutes.default);
    console.log('✅ Docs routes mounted successfully');
  } catch (error) {
    console.error('Failed to mount docs routes:', error);
  }

  // ── Source tracer (recorded source lineage per authored section, Part 11) ──
  try {
    const sourceTracerModule = await import('../routes/source-tracer-routes');
    app.use('/api/source-tracer', authenticateToken, sourceTracerModule.default());
    console.log('✅ Source tracer routes mounted (GET /api/source-tracer/sections)');
  } catch (error) {
    console.error('Failed to mount source tracer routes:', error);
  }

  // ── Insights canvas (report-os portfolio overview read-model) ──
  try {
    const insightsCanvasModule = await import('../routes/insights-canvas-routes');
    app.use('/api/insights-canvas', authenticateToken, insightsCanvasModule.default());
    console.log('✅ Insights canvas routes mounted (GET /api/insights-canvas/overview)');
  } catch (error) {
    console.error('Failed to mount insights canvas routes:', error);
  }

  // ── Project vault (document vault read-model) ──
  try {
    const projectVaultModule = await import('../routes/c2c/project-vault');
    app.use('/api/c2c/project-vault', authenticateToken, projectVaultModule.default());
    console.log('✅ Project vault routes mounted (GET /api/c2c/project-vault/:id)');
  } catch (error) {
    console.error('Failed to mount project vault routes:', error);
  }

  // ── RBM board (risk-based monitoring program read-model) ──
  try {
    const rbmBoardModule = await import('../routes/mdx-rbm-board');
    app.use('/api/mdx-rbm', authenticateToken, rbmBoardModule.default());
    console.log('✅ RBM board route mounted (GET /api/mdx-rbm/rbm-board/:programId)');
  } catch (error) {
    console.error('Failed to mount RBM board routes:', error);
  }

  // ── Governed-intelligence inconsistency (cross-document contradiction scan) ──
  try {
    const inconsistencyModule = await import('../routes/governed-intelligence-inconsistency-routes');
    app.use('/api/governed-intelligence-inconsistency', authenticateToken, inconsistencyModule.default());
    console.log('✅ Governed-intelligence inconsistency route mounted (GET /api/governed-intelligence-inconsistency/projects/:projectId/inconsistency)');
  } catch (error) {
    console.error('Failed to mount governed-intelligence inconsistency routes:', error);
  }

  // ── Deep research board (evidence workspace read-model) ──
  try {
    const deepResearchModule = await import('../routes/deep-research-board.routes');
    app.use('/api/deep-research/board', authenticateToken, deepResearchModule.default());
    console.log('✅ Deep research board route mounted (GET /api/deep-research/board)');
  } catch (error) {
    console.error('Failed to mount deep research board routes:', error);
  }

  // ── Precedent engine board (precedent-intelligence read-model) ──
  try {
    const precedentBoardModule = await import('../routes/precedent-engine-board');
    app.use('/api/precedent-engine-board', authenticateToken, precedentBoardModule.default());
    console.log('✅ Precedent engine board route mounted (GET /api/precedent-engine-board)');
  } catch (error) {
    console.error('Failed to mount precedent engine board routes:', error);
  }

  // ── Conversation thread (AnA thread transcript read-model) ──
  try {
    const conversationThreadModule = await import('../routes/conversation-thread-routes');
    app.use('/api/conversation-thread', authenticateToken, conversationThreadModule.default());
    console.log('✅ Conversation thread route mounted (GET /api/conversation-thread/:threadId)');
  } catch (error) {
    console.error('Failed to mount conversation thread routes:', error);
  }

  // ── Clinical-Regulatory Intelligence Graph (shared evidence spine) ──
  await mountClinicalRegulatoryEvidence(app);

  console.log('✅ Clinical + Intelligence route family registered');
}

/**
 * Mount the Clinical-Regulatory Intelligence Graph routes.
 *
 * Behind ENABLE_CLINICAL_REGULATORY_GRAPH. Flag off ⇒ not mounted at all, so
 * the surfaces 404 rather than rendering a corpus-empty state for a feature that
 * is simply switched off. No half-state.
 *
 * Extracted rather than inlined above so the flag branch doesn't add complexity
 * to the already-long registrar.
 */
async function mountClinicalRegulatoryEvidence(app: express.Express): Promise<void> {
  try {
    const evidenceModule = await import('../routes/clinical-regulatory-evidence-routes');
    if (!evidenceModule.isGraphEnabled()) {
      console.log('⏭️  Clinical-regulatory evidence routes skipped (ENABLE_CLINICAL_REGULATORY_GRAPH off)');
      return;
    }
    app.use('/api/clinical-regulatory-evidence', authenticateToken, evidenceModule.default());
    console.log('✅ Clinical-regulatory evidence routes mounted (/api/clinical-regulatory-evidence)');
  } catch (error) {
    console.error('Failed to mount clinical-regulatory evidence routes:', error);
  }
}
