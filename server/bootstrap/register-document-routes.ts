/**
 * eCTD, evidence, device-lifecycle and IVD routes.
 *
 * The 33 routers previously loaded through `config.map(c => import(c.mod))` were
 * all absent from dist/index.js — esbuild cannot resolve a variable specifier —
 * so the eCTD compiler, the whole evidence layer, the QMS/CAPA/design-risk stack
 * and every IVD route 404d in production while the boot log said each had
 * mounted successfully. Static now; the reasoning is in ./mount-routes.ts.
 */

import express from 'express';
import type { Pool } from 'pg';
import { authenticateToken } from '../middleware/auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { mountAll } from './mount-routes.js';

import coauthor from '../routes/coauthor.js';
import ectdDocuments from '../routes/ectd-documents.js';
import ectdCompile from '../routes/ectd-compile.js';
import ectdExport from '../routes/ectd-export.js';
import csrJobs from '../routes/csr-jobs.js';
import charters from '../routes/charters.js';
import ectdSubmissionAgent from '../routes/ectd-submission-agent.routes.js';
import evidence from '../routes/evidence.js';
import evidenceSearch from '../routes/evidence-search.js';
import contentPlan from '../routes/content-plan.js';
import smartBlocks from '../routes/smart-blocks.js';
import evidenceManagement from '../routes/evidence-management.routes.js';
import evidenceFabric from '../routes/evidence-fabric.js';
import docxFactory from '../routes/docx-factory.js';
import knowledgeBase from '../routes/knowledge-base.js';
import predicateIntelligence from '../routes/predicate-intelligence.js';
import regulatoryGraph from '../routes/regulatory-graph.js';
import changePropagation from '../routes/change-propagation.js';
import standards from '../routes/standards.js';
import pccp from '../routes/pccp.js';
import gsprPostmarket from '../routes/gspr-postmarket.js';
import postMarket from '../routes/post-market.js';
import evidenceSufficiency from '../routes/evidence-sufficiency.js';
import qSub from '../routes/q-sub.js';
import capaMdr from '../routes/capa-mdr.js';
import designRisk from '../routes/design-risk.js';
import qms from '../routes/qms.js';
import ivdLifecycle from '../routes/ivd-lifecycle.js';
import ivdKnowledge from '../routes/ivd-knowledge.js';
import ivdAssessments from '../routes/ivd-assessments.js';
import opsPredicateShadow from '../routes/_ops-predicate-shadow.js';
import tenantExport from '../routes/tenant-export.js';
import anaToolPolicy from '../routes/ana-tool-policy.js';
import anaMdxContext from '../routes/ana-mdx-context.js';
import k510DocumentPreview from '../routes/k510-document-preview.js';

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

  // ── REMOVED: /api/document-authoring and /api/document-authoring/workspace ──
  //
  // Both routers were mounted, auth-gated, and unreachable: zero client
  // callers in the repository, and documentAuthoring.routes.ts's own header
  // named its consumer as client/src/concept2cure/hooks/useDocumentActions.ts
  // — a file that does not exist. The document-editing client runs entirely on
  // the canonical /api/authoring router (authoring_documents /
  // authoring_sections / doc_revisions, hash-chained + audited); these two
  // wrote to the PARALLEL documents/documentVersions store, so every request
  // they could have served was a write into a copy nothing reads. Deleted
  // with their mounts and their handler tests per the zero-duplication rule
  // (CLAUDE.md): a parallel path is migrated onto the canonical one and
  // deleted in the same change — the migration happened long ago, the
  // deletion is this.

  // ── eCTD Routes (parallelized) ──
  //
  // SECURITY: eCTD payloads ARE regulatory submissions — IP, study data,
  // CMC. Pre-fix every endpoint in this family (coauthor, documents,
  // compile, export, submission-agent) was reachable unauthenticated.
  // Mounted with authenticateToken so the JWT is required before any
  // handler runs; per-handler tenant scoping is a separate audit.
  {
    mountAll(
      app,
      [
        { path: '/api/coauthor', router: coauthor, name: 'eCTD Co-Author (auth-gated)' },
        { path: '/api/ectd-documents', router: ectdDocuments, name: 'eCTD Documents (auth-gated)' },
        { path: '/api/ectd-compile', router: ectdCompile, name: 'eCTD Compile (auth-gated)' },
        { path: '/api/ectd/export', router: ectdExport, name: 'eCTD Export (auth-gated)' },
        { path: '/api/csr/jobs', router: csrJobs, name: 'CSR Jobs (auth-gated)' },
        { path: '/api/charters', router: charters, name: 'Project Charters (auth-gated)' },
        {
          path: '/api/ectd-submissions',
          router: ectdSubmissionAgent,
          name: 'eCTD Submission Agent (auth-gated)',
        },
      ],
      authenticateToken,
    );

    // Second mount from the ectd-export module: the leaf-level preflight
    // validator lives in the same file but needs the URL prefix `/api/ectd`
    // (not `/api/ectd/export`) so the public path resolves to
    // `/api/ectd/validate/preflight`. Pulled as a named export so the two
    // routers can stay co-located while exposing distinct mount points.
    try {
      const ectdExportModule = await import('../routes/ectd-export');
      const preflightRouter = (ectdExportModule as any).preflightRouter;
      if (preflightRouter) {
        app.use('/api/ectd', authenticateToken, preflightRouter);
        console.log('✅ eCTD Leaf Preflight route mounted (auth-gated): /api/ectd/validate/preflight');
      }
    } catch (error) {
      console.error('❌ Failed to mount eCTD Leaf Preflight route:', error);
    }

    // eCTD v4.0 (HL7 RPS) + controlled-vocabulary + qualification read/validate
    // API. Mounted at /api/ectd so paths resolve to /api/ectd/controlled-vocab,
    // /api/ectd/v4/validate, /api/ectd/v4/forward-compat, and
    // /api/ectd/qualification/spec-versions. Auth-gated; per-handler tenant gate.
    try {
      const ectdV4Module = await import('../routes/ectd-v4');
      app.use('/api/ectd', authenticateToken, ectdV4Module.createEctdV4Router());
      console.log('✅ eCTD v4.0 + controlled-vocabulary API mounted (auth-gated): /api/ectd/v4/*, /api/ectd/controlled-vocab');
    } catch (error) {
      console.error('❌ Failed to mount eCTD v4.0 + controlled-vocabulary routes:', error);
    }
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
  //
  // SECURITY: every handler calls requireTenant(req, res) which reads
  // (req as any).user / (req as any).tenantContext — those are populated
  // EXCLUSIVELY by authenticateToken (server/auth.ts populates req.user +
  // req.tenantContext). Without this mount-level middleware, requireTenant
  // would always see undefined and 401 every request, making the route
  // functionally dead. Mirrors the auth-gating pattern used by
  // /api/document-authoring (line 41) and the eCTD family above.
  try {
    const orchestratorModule = await import('../routes/submission-orchestrator');
    app.use('/api/submission-orchestrator', authenticateToken, orchestratorModule.default);
    console.log('✅ Submission-Package Orchestrator routes mounted (M2/M3/CSR/hardened-validation, auth-gated)');
  } catch (error) {
    console.error('❌ Failed to mount Submission-Package Orchestrator routes:', error);
  }

  // ── Submission Release Signing (Path-to-GA §C.11 — e-sig gate) ──
  //
  // SECURITY: same auth contract as the orchestrator routes — requireTenant
  // inside the handler reads JWT-bound req.user; this mount-level
  // authenticateToken backstops reachability. The signing route receives a
  // password in the body and re-verifies it via bcrypt before persisting
  // any electronic_signatures row.
  try {
    const signReleaseModule = await import('../routes/submission-sign-release');
    app.use('/api/submissions', authenticateToken, signReleaseModule.default);
    console.log('✅ Submission Release Signing route mounted (Path-to-GA §C.11, auth-gated)');
  } catch (error) {
    console.error('❌ Failed to mount Submission Release Signing routes:', error);
  }

  // ── HAQ Response Manager (FDA IR, EMA D120, PMDA, HC question tracking) ──
  //
  // Mounted unconditionally: every endpoint reads/writes org-scoped persisted
  // data through the projectMemoryEntries feature store (createFeatureStore
  // 'haq_question') — there is no static/mock business data here. The former
  // ENABLE_HAQ_MANAGER_STATIC_DATA guard was mis-applied (it 503'd a governed
  // persisted feature); per docs/ga-static-data-route-hardening.md the flag is
  // removed once a route is backed by a governed persisted data source, which
  // this is. Auth + tenant-scope live inside the router.
  try {
    const haqModule = await import('../routes/haq-manager');
    app.use('/api/haq-manager', haqModule.default);
    console.log('✅ HAQ Response Manager routes mounted (question tracking, AI drafting, review workflow)');
  } catch (error) {
    console.error('❌ Failed to mount HAQ Manager routes:', error);
  }

  // The zero-caller IND helper routes formerly mounted here (/api/ind-autodraft,
  // /api/ind-pdf, /api/ind-sections) were deleted in the biotech-lifecycle
  // consolidation — no client or server code called any of the three prefixes.
  // IND autodraft lives on under /api/knowledge-base/ind-autodraft/*; the CTD
  // section map is served by services/regulatory (registry adapters).

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

  // ── Evidence, Content, device lifecycle, IVD, BFF proxies ──
  mountAll(app, [
    { path: '/api/evidence', router: evidence, name: 'Evidence' },
    // /api/evidence/ask is owned by registerInlinePlatformFacadesRoutes
    // (see docs/audits/ROUTE_OWNERSHIP.md). It was relocated out of this
    // slot when the handler was rebuilt against the canonical retrieval +
    // AI-gateway layer for Doc System Convergence Phase 4.
    { path: '/api/evidence-search', router: evidenceSearch, name: 'Evidence Search' },
    { path: '/api/content-plan', router: contentPlan, name: 'Content Plan' },
    { path: '/api/smart-blocks', router: smartBlocks, name: 'Smart Blocks' },
    // Retired (#844, Phase 0.2): cognitive-ecosystem was a placeholder — every
    // endpoint returned hardcoded mock data and its services were never
    // implemented (no client/server dependents). Unregistered to shrink the AI
    // route surface; the real AI spine is `/api/ana-ri`. See docs/AI_CONSOLIDATION_PLAN.md.
    { path: '/api/evidence-management', router: evidenceManagement, name: 'Evidence Management' },
    { path: '/api/evidence-fabric', router: evidenceFabric, name: 'Evidence Fabric BFF' },
    { path: '/api/docx-factory', router: docxFactory, name: 'DOCX Factory BFF' },
    { path: '/api/knowledge-base', router: knowledgeBase, name: 'Knowledge Base BFF' },
    { path: '/api/predicate-intelligence', router: predicateIntelligence, name: 'Predicate Intelligence BFF' },
    { path: '/api/regulatory-graph', router: regulatoryGraph, name: 'Regulatory Graph' },
    { path: '/api/change-propagation', router: changePropagation, name: 'Change Propagation (governed fact change)' },
    { path: '/api/standards', router: standards, name: 'Standards Catalog' },
    { path: '/api/pccp', router: pccp, name: 'AI/ML PCCP' },
    { path: '/api/gspr', router: gsprPostmarket, name: 'GSPR Catalog + Mappings' },
    { path: '/api/post-market', router: postMarket, name: 'Post-Market Documents' },
    { path: '/api/evidence-sufficiency', router: evidenceSufficiency, name: 'Evidence Sufficiency' },
    { path: '/api/q-sub', router: qSub, name: 'Q-Submissions (Pre-Sub / SIR / SRD)' },
    { path: '/api/capa-mdr', router: capaMdr, name: 'CAPA + complaint + MDR / vigilance triage' },
    { path: '/api/design-risk', router: designRisk, name: 'Design controls (DHF) + Risk Management File (ISO 14971)' },
    { path: '/api/qms', router: qms, name: 'Quality Management System (document control, training, suppliers, audits)' },
    { path: '/api/ivd-lifecycle', router: ivdLifecycle, name: 'IVD lifecycle calculators (analytical, software, change, registration)' },
    { path: '/api/ivd-knowledge', router: ivdKnowledge, name: 'IVD knowledge base (scientific / legal / regulatory intelligence corpus)' },
    { path: '/api/ivd-assessments', router: ivdAssessments, name: 'IVD assessment persistence (saved calculator results + generated documents)' },
    { path: '/api/_ops/predicate-intelligence', router: opsPredicateShadow, name: 'Predicate Intelligence — ops probes' },
    { path: '/api/tenant-export', router: tenantExport, name: 'Tenant data export + attestation' },
    { path: '/api/ana-tool-policy', router: anaToolPolicy, name: 'AnA tool policy (per-tenant allow/deny)' },
    { path: '/api/ana', router: anaMdxContext, name: 'AnA MDX context snapshot (UI consumption)' },
    { path: '/api/510k/projects', router: k510DocumentPreview, name: '510(k) live document preview (assembled view + Markdown)' },
  ]);

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

  // Collaboration Center: removed. `GET /api/collaboration/team` and
  // `/activities` selected `.from(users).limit(N)` with NO organization filter,
  // returning every user in the database — name, email, title, department,
  // last-login — across every tenant. Nothing called either: the one UI that
  // names them (v2/surfaces/CollabLauncher.tsx) is deliberately fixture-backed,
  // because live rows are keyed by numeric user id while its pickers key on
  // short-ids. A cross-tenant read with no caller is deleted, not scoped.


  // ── CERV2 Sections + Versions ──
  try {
    const cerv2SectionsModule = await import('../routes/cerv2-sections');
    // requireTenantContext establishes the AsyncLocalStorage tenant scope for
    // the request (and req.dbClient). Without it, the router's queries run on
    // the global pool with no active scope and fail closed under RLS_ENFORCE=on
    // (the fail-closed guard in poolInstrumentation) — a 500 on every call. The
    // router keeps its per-route authMiddleware; this runs first and wraps the
    // downstream handlers in the tenant scope.
    app.use('/api/cerv2-sections', requireTenantContext, cerv2SectionsModule.default);
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

  // ── AnA Biostats — Governed Statistical Documents (list read-model for ui-v2) ──
  try {
    const anaBiostatsGovDocsModule = await import('../routes/ana-biostats-governed-documents');
    app.use('/api/ana-biostats/governed-documents', authenticateToken, anaBiostatsGovDocsModule.default());
    console.log('✅ AnA Biostats Governed Documents route mounted (/api/ana-biostats/governed-documents)');
  } catch (error) {
    console.error('❌ Failed to mount AnA Biostats Governed Documents routes:', error);
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

  // Content Atoms: removed. The router aliased `leaves` — the eCTD leaf table
  // read by submission-orchestrator — and exposed full CRUD including DELETE
  // over it. It was tenant-scoped, so not a disclosure, but it was an unused
  // write surface onto submission content. No caller anywhere.


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
