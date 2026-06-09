import type { Request, Response } from 'express';
import express from 'express';
import type { Pool } from 'pg';
import { authenticateToken } from '../middleware/auth.js';

export interface DocumentBootstrapContext {
  app: express.Express;
  pool: Pool;
  isStaticDataEnabled: (flag: string) => boolean;
  mountStaticBusinessDataGuard: (path: string, routeName: string, requiredFlag: string) => void;
  DEMO_ROUTES_ENABLED: boolean;
  EXPERIMENTAL_ROUTES_ENABLED: boolean;
}

export async function registerDocumentRoutes({
  app,
  pool,
  isStaticDataEnabled,
  mountStaticBusinessDataGuard,
  DEMO_ROUTES_ENABLED,
  EXPERIMENTAL_ROUTES_ENABLED,
}: DocumentBootstrapContext) {
  // ── GCC Platform (eCTD, Vault, Signing, Site Intel, Labeling) ──
  try {
    const gccModule = await import('../api/gcc/index.js');
    app.use('/api/gcc', gccModule.default);
    console.log('✅ GCC Platform API routes mounted (eCTD, Vault, Signing, Site Intel, Labeling)');
  } catch (error) {
    console.error('❌ Failed to mount GCC Platform routes:', error);
  }

  // ── Document Authoring (21 CFR Part 11 compliant) ──
  //
  // SECURITY: Document authoring routes are tenant-scoped and many
  // expose document IDs in the URL. The router's internal
  // checkDocumentPermission already filters by JWT org, but
  // authenticateToken at the mount is the backstop so reachability
  // never precedes authentication.
  try {
    const documentAuthoringModule = await import('../routes/documentAuthoring.routes.js');
    app.use('/api/document-authoring', authenticateToken, documentAuthoringModule.default);
    console.log('✅ Document Authoring API routes mounted (21 CFR Part 11 compliant, auth-gated)');
  } catch (error) {
    console.error('❌ Failed to mount Document Authoring routes:', error);
  }

  // ── eCTD Routes (parallelized) ──
  //
  // SECURITY: eCTD payloads ARE regulatory submissions — IP, study data,
  // CMC. Pre-fix every endpoint in this family (coauthor, documents,
  // compile, export, submission-agent) was reachable unauthenticated.
  // Mounted with authenticateToken so the JWT is required before any
  // handler runs; per-handler tenant scoping is a separate audit.
  {
    const ectdConfig = [
      { path: '/api/coauthor', mod: '../routes/coauthor', name: 'eCTD Co-Author' },
      { path: '/api/ectd-documents', mod: '../routes/ectd-documents', name: 'eCTD Documents' },
      { path: '/api/ectd-compile', mod: '../routes/ectd-compile', name: 'eCTD Compile' },
      { path: '/api/ectd/export', mod: '../routes/ectd-export', name: 'eCTD Export' },
      {
        path: '/api/ectd-submissions',
        mod: '../routes/ectd-submission-agent.routes',
        name: 'eCTD Submission Agent',
      },
    ] as const;
    const ectdResults = await Promise.allSettled(ectdConfig.map(c => import(c.mod)));
    ectdResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        app.use(ectdConfig[i].path, authenticateToken, r.value.default);
        console.log(`✅ ${ectdConfig[i].name} routes mounted (auth-gated)`);
      } else {
        console.error(`❌ Failed to mount ${ectdConfig[i].name} routes:`, r.reason);
      }
    });
  }

  // ── Biotech Document Artifacts (eCTD, PV, Clinical Ops document generation) ──
  try {
    const biotechArtifactsModule = await import('../routes/biotech-artifacts');
    app.use('/api/biotech-artifacts', biotechArtifactsModule.default);
    console.log('✅ Biotech Artifact Generator routes mounted (10 document types)');
  } catch (error) {
    console.error('❌ Failed to mount Biotech Artifact routes:', error);
  }

  // ── Submission-Package Orchestrator (M2/M3 composition, CSR tabulation, hardened validation) ──
  try {
    const orchestratorModule = await import('../routes/submission-orchestrator');
    app.use('/api/submission-orchestrator', orchestratorModule.default);
    console.log('✅ Submission-Package Orchestrator routes mounted (M2/M3/CSR/hardened-validation)');
  } catch (error) {
    console.error('❌ Failed to mount Submission-Package Orchestrator routes:', error);
  }

  // ── HAQ Response Manager (FDA IR, EMA D120, PMDA, HC question tracking) ──
  try {
    const haqModule = await import('../routes/haq-manager');
    if (isStaticDataEnabled('ENABLE_HAQ_MANAGER_STATIC_DATA')) {
      app.use('/api/haq-manager', haqModule.default);
      console.log('✅ HAQ Response Manager routes mounted (question tracking, AI drafting, review workflow)');
    } else {
      mountStaticBusinessDataGuard('/api/haq-manager', 'HAQ Response Manager routes', 'ENABLE_HAQ_MANAGER_STATIC_DATA');
    }
  } catch (error) {
    console.error('❌ Failed to mount HAQ Manager routes:', error);
  }

  // ── IND AutoDraft (AI-powered IND section generation) ──
  try {
    const indAutodraftModule = await import('../routes/ind-autodraft');
    app.use('/api/ind-autodraft', indAutodraftModule.default);
    console.log('✅ IND AutoDraft Engine routes mounted (16 IND sections, sentence-level traceability)');
  } catch (error) {
    console.error('❌ Failed to mount IND AutoDraft routes:', error);
  }

  // ── IND PDF generation (Puppeteer + PDFKit fallback) ──
  try {
    const indPdfModule = await import('../routes/ind-pdf');
    app.use('/api/ind-pdf', indPdfModule.default);
    console.log('✅ IND PDF generation routes mounted (Puppeteer-powered)');
  } catch (error) {
    console.error('❌ Failed to mount IND PDF routes:', error);
  }

  // ── IND Sections API (live CTD section map) ──
  try {
    const indSectionsModule = await import('../routes/ind-sections');
    app.use('/api/ind-sections', indSectionsModule.default);
    console.log('✅ IND Sections API routes loaded');
  } catch (error) {
    console.error('❌ Failed to mount IND Sections routes:', error);
  }

  // ── Project Sections (tracking, assignments, comments, audit trail) ──
  try {
    const projectSectionsModule = await import('../routes/project-sections');
    app.use('/api/project-sections', projectSectionsModule.default);
    console.log('✅ Project Sections API routes loaded');
  } catch (error) {
    console.error('❌ Failed to mount Project Sections routes:', error);
  }

  // ── Document Data Center (vault + 3-axis tagging for 510(k)) ──
  try {
    const documentDataCenterModule = await import('../routes/document-data-center.js');
    app.use('/api/device-data-center', documentDataCenterModule.default);
    console.log('✅ Document Data Center API routes mounted (AI-powered 3-axis tagging)');
  } catch (error) {
    console.error('❌ Failed to mount Document Data Center routes:', error);
  }

  // ── Evidence, Content, Cognitive, BFF proxy (parallelized) ──
  {
    const evidenceConfig = [
      { path: '/api/evidence', mod: '../routes/evidence.js', name: 'Evidence' },
      // /api/evidence/ask is owned by registerInlinePlatformFacadesRoutes
      // (see docs/audits/ROUTE_OWNERSHIP.md). It was relocated out of this
      // slot when the handler was rebuilt against the canonical retrieval +
      // AI-gateway layer for Doc System Convergence Phase 4.
      { path: '/api/evidence-search', mod: '../routes/evidence-search.js', name: 'Evidence Search' },
      { path: '/api/content-plan', mod: '../routes/content-plan.js', name: 'Content Plan' },
      { path: '/api/smart-blocks', mod: '../routes/smart-blocks.js', name: 'Smart Blocks' },
      { path: '/api/cognitive', mod: '../routes/cognitive-ecosystem.js', name: 'Cognitive Ecosystem' },
      {
        path: '/api/evidence-management',
        mod: '../routes/evidence-management.routes.js',
        name: 'Evidence Management',
      },
      {
        path: '/api/evidence-fabric',
        mod: '../routes/evidence-fabric.js',
        name: 'Evidence Fabric BFF',
      },
      { path: '/api/docx-factory', mod: '../routes/docx-factory.js', name: 'DOCX Factory BFF' },
      { path: '/api/knowledge-base', mod: '../routes/knowledge-base.js', name: 'Knowledge Base BFF' },
      {
        path: '/api/predicate-intelligence',
        mod: '../routes/predicate-intelligence.js',
        name: 'Predicate Intelligence BFF',
      },
      {
        path: '/api/regulatory-graph',
        mod: '../routes/regulatory-graph.js',
        name: 'Regulatory Graph',
      },
      {
        path: '/api/standards',
        mod: '../routes/standards.js',
        name: 'Standards Catalog',
      },
      {
        path: '/api/pccp',
        mod: '../routes/pccp.js',
        name: 'AI/ML PCCP',
      },
      {
        path: '/api/gspr',
        mod: '../routes/gspr-postmarket.js',
        name: 'GSPR Catalog + Mappings',
      },
      {
        path: '/api/post-market',
        mod: '../routes/post-market.js',
        name: 'Post-Market Documents',
      },
      {
        path: '/api/evidence-sufficiency',
        mod: '../routes/evidence-sufficiency.js',
        name: 'Evidence Sufficiency',
      },
      {
        path: '/api/q-sub',
        mod: '../routes/q-sub.js',
        name: 'Q-Submissions (Pre-Sub / SIR / SRD)',
      },
      {
        path: '/api/capa-mdr',
        mod: '../routes/capa-mdr.js',
        name: 'CAPA + complaint + MDR / vigilance triage',
      },
      {
        path: '/api/design-risk',
        mod: '../routes/design-risk.js',
        name: 'Design controls (DHF) + Risk Management File (ISO 14971)',
      },
      {
        path: '/api/qms',
        mod: '../routes/qms.js',
        name: 'Quality Management System (document control, training, suppliers, audits)',
      },
      {
        path: '/api/ivd-lifecycle',
        mod: '../routes/ivd-lifecycle.js',
        name: 'IVD lifecycle calculators (analytical, software, change, registration)',
      },
      {
        path: '/api/_ops/predicate-intelligence',
        mod: '../routes/_ops-predicate-shadow.js',
        name: 'Predicate Intelligence — ops probes',
      },
      {
        path: '/api/tenant-export',
        mod: '../routes/tenant-export.js',
        name: 'Tenant data export + attestation',
      },
      {
        path: '/api/ana-tool-policy',
        mod: '../routes/ana-tool-policy.js',
        name: 'AnA tool policy (per-tenant allow/deny)',
      },
      {
        path: '/api/ana',
        mod: '../routes/ana-mdx-context.js',
        name: 'AnA MDX context snapshot (UI consumption)',
      },
      {
        path: '/api/510k/projects',
        mod: '../routes/k510-document-preview.js',
        name: '510(k) live document preview (assembled view + Markdown)',
      },
    ] as const;
    const evidenceResults = await Promise.allSettled(evidenceConfig.map(c => import(c.mod)));
    evidenceResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        app.use(evidenceConfig[i].path, r.value.default);
        console.log(`✅ ${evidenceConfig[i].name} routes mounted successfully`);
      } else {
        console.error(`❌ Failed to mount ${evidenceConfig[i].name} routes:`, r.reason);
      }
    });
  }

  // ── SE Matrix + Defense Packet ──
  try {
    const [seMatrixModule, defensePacketModule] = await Promise.all([
      import('../routes/se-matrix.js'),
      import('../routes/defense-packet.js'),
    ]);
    const programsGateway = express.Router();
    programsGateway.use(seMatrixModule.default);
    programsGateway.use(defensePacketModule.default);
    app.use('/api/programs', programsGateway);
    console.log('✅ Programs gateway routes mounted (SE Matrix + Defense Packet)');
  } catch (error) {
    console.error('❌ Failed to mount programs gateway routes:', error);
  }

  // ── Demo Seed routes ──
  if (DEMO_ROUTES_ENABLED) {
    try {
      const seedDemoModule = await import('../routes/seed-demo.js');
      app.use('/api/demo', seedDemoModule.default);
      console.log('✅ Demo seeding API routes mounted successfully');
    } catch (error) {
      console.error('❌ Failed to mount Demo seed routes:', error);
    }
  }

  // ── Collaboration Center (510(k) activity tracking) ──
  if (EXPERIMENTAL_ROUTES_ENABLED) {
    try {
      const collaborationModule = await import('../routes/collaboration');
      app.use('/api/collaboration', collaborationModule.default);
      console.log('✅ Collaboration Center API routes mounted (510(k) team activity tracking)');
    } catch (error) {
      console.error('❌ Failed to mount Collaboration Center routes:', error);
    }
  }

  // ── CERV2 Sections + Versions ──
  try {
    const cerv2SectionsModule = await import('../routes/cerv2-sections');
    app.use('/api/cerv2-sections', cerv2SectionsModule.default);
    console.log('✅ CERV2 Sections API routes mounted (510(k) section tree navigation)');
  } catch (error) {
    console.error('❌ Failed to mount CERV2 Sections routes:', error);
  }

  try {
    const cerv2VersionsModule = await import('../routes/cerv2-versions');
    app.use('/api/cerv2-versions', cerv2VersionsModule.default);
    console.log('✅ CERV2 Versions API routes mounted (version history & sessions)');
  } catch (error) {
    console.error('❌ Failed to mount CERV2 Versions routes:', error);
  }

  // ── Biostatistics Platform (7 capabilities) ──
  try {
    const biostatModule = await import('../routes/biostatPlatform');
    app.use('/api/biostat', biostatModule.default);
    console.log('✅ Biostatistics Platform routes mounted (7 capabilities)');
  } catch (error) {
    console.error('❌ Failed to mount Biostatistics Platform routes:', error);
  }

  // ── AnA Biostats Operating Function ──
  try {
    const anaBiostatsModule = await import('../routes/ana-biostats');
    app.use('/api/ana-biostats', anaBiostatsModule.default);
    console.log('✅ AnA Biostats Operating Function routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount AnA Biostats routes:', error);
  }

  // ── Trial Corpus (ingest → extract → benchmark) ──
  try {
    const corpusModule = await import('../routes/corpus-routes');
    app.use('/api/corpus', corpusModule.default);
    console.log('✅ Trial Corpus routes mounted (benchmark, extract, ingest)');
  } catch (error) {
    console.error('❌ Failed to mount Trial Corpus routes:', error);
  }

  // ── Content Atoms ──
  try {
    const atomsModule = await import('../routes/atoms.js');
    app.use('/api/atoms', atomsModule.default);
    console.log('✅ Content Atoms API routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount Atoms routes:', error);
  }

  // ── Workflow API ──
  try {
    const workflowModule = await import('../routes/workflow');
    app.use('/api/workflow', workflowModule.default);
    console.log('✅ Workflow API routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount Workflow routes:', error);
  }

  // ── Platform Control Plane ──

  // API Key Management
  try {
    const apiKeysModule = await import('../routes/api-keys.js');
    app.use('/api/api-keys', apiKeysModule.default);
    console.log('✅ API Key Management routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount API Key routes:', error);
  }

  // Public API v1 (external programmatic access)
  try {
    const publicApiModule = await import('../routes/public-api.js');
    app.use('/api/v1', publicApiModule.default);
    console.log('✅ Public API v1 routes mounted (CSR, Regulatory, Endpoints, Precedent, Trial Design)');
  } catch (error) {
    console.error('❌ Failed to mount Public API routes:', error);
  }

  // CTD Onboarding Pipeline
  try {
    const ctdOnboardingModule = await import('../routes/ctd-onboarding.js');
    app.use('/api/ctd', ctdOnboardingModule.default);
    console.log('✅ CTD Onboarding Pipeline routes mounted (projects, upload, validation, gaps)');
  } catch (error) {
    console.error('❌ Failed to mount CTD Onboarding routes:', error);
  }

  // Biologics Intelligence
  try {
    const biologicsModule = await import('../routes/biologics-routes.js');
    app.use('/api/biologics', biologicsModule.default);
    console.log('✅ Biologics Intelligence & Combination Product routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount Biologics routes:', error);
  }

  // ── Cortex Prime AI Brain ──
  try {
    const cortexQueryModule = await import('../routes/cortexQueryRoutes.js');
    if (cortexQueryModule.initializeCortexAPI) {
      cortexQueryModule.initializeCortexAPI(pool);
    }

    const cortexUnifiedModule = await import('../routes/cortex-unified');
    app.use('/api/cortex', cortexUnifiedModule.default);
    console.log('✅ Cortex Unified API gateway mounted at /api/cortex');
  } catch (error) {
    console.error('❌ Failed to mount Cortex Unified routes:', error);
  }

  try {
    const cortexManagementModule = await import('../routes/cortexManagementRoutes.js');
    const createCortexManagementRoutes = cortexManagementModule.createCortexManagementRoutes;
    if (createCortexManagementRoutes && pool) {
      app.use('/api/cortex/management', createCortexManagementRoutes(pool));
      console.log('✅ Cortex Management API routes mounted (graph ops, quality, versioning)');
    }
  } catch (error) {
    console.error('❌ Failed to mount Cortex Management routes:', error);
  }

  // ── Folder management ──
  try {
    const folderManagementRouter = await import('../routes/folder-management.js');
    app.use('/api', folderManagementRouter.default);
    console.log('✅ Folder management routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount folder management routes:', error);
  }

  console.log('✅ Document + Knowledge route family registered');
}
