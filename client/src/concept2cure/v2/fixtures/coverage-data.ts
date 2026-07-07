/** C2C codebase coverage -- the 33 canonical UI surfaces and 5 cross-cutting concerns. */

export type ReadinessLevel = 'routes-ready' | 'contract-ready' | 'planned' | 'kit-only';
export type SurfaceTier = 'global' | 'project' | 'specialist' | 'admin';

export interface C2CRegistryEntry {
  id: string;
  label: string;
  tier: SurfaceTier;
  group: string;
  api: string[];
  ana: string[];
  contract: string | null;
  catalog: string | null;
  readiness: ReadinessLevel;
  note: string;
}

export interface C2CCrosscuttingEntry {
  id: string;
  label: string;
  api: string[];
  note: string;
}

export const C2C_REGISTRY: C2CRegistryEntry[] = [
  { id: 'projects', label: 'Projects', tier: 'global', group: 'workspace', api: ['/api/projects', '/api/programs'], ana: ['plan_submission'], contract: null, catalog: null, readiness: 'routes-ready', note: 'Entry to everything. Portfolio of programs across every workstream.' },
  { id: 'apps', label: 'Apps catalog', tier: 'global', group: 'workspace', api: ['/api/module-subscriptions'], ana: [], contract: null, catalog: null, readiness: 'planned', note: 'Module catalog + entitlement-gated launch. Locked modules show upgrade CTA, not a dead button.' },
  { id: 'artifacts-center', label: 'Artifacts Center', tier: 'global', group: 'evidence', api: ['/api/biotech-artifacts', '/api/atoms', '/api/corpus'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'Cross-project artifact library, version chain, provenance, signature status.' },
  { id: 'project-home', label: 'Project home', tier: 'project', group: 'workspace', api: ['/api/projects', '/api/programs', '/api/rim'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'Readiness ring, tasks, milestones, RIM recs, change impact, governance, recent activity.' },
  { id: 'document-authoring', label: 'Document editor & authoring', tier: 'project', group: 'authoring', api: ['/api/document-authoring', '/api/authoring', '/api/authoring-actions', '/api/coauthor', '/api/workflow', '/api/esignature'], ana: ['get_csr_template', 'get_nonclinical_template', 'draft_clinical_overview_m2_5'], contract: '@shared/types/document-contract', catalog: null, readiness: 'routes-ready', note: 'Editor + Yjs co-author + track-changes + comments + versions + approval + e-sign — all have working backends.' },
  { id: 'regulatory-workspace', label: 'Regulatory workspace', tier: 'project', group: 'authoring', api: ['/api/document-authoring', '/api/project-sections', '/api/ind-sections'], ana: [], contract: '@shared/types/authoring-context', catalog: null, readiness: 'routes-ready', note: 'Generic 3-pane shell (tree · canvas · intelligence). Substrate for documents/editor.' },
  { id: 'vault', label: 'Vault (DMS)', tier: 'project', group: 'evidence', api: ['/api/corpus', '/api/device-data-center', '/api/evidence'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'Drag-drop upload, chunking/embedding progress, semantic search, version history, evidence linking.' },
  { id: 'review', label: 'Review & approval', tier: 'project', group: 'review', api: ['/api/workflow', '/api/part11'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'Review queue, threaded comments (open/resolved/outdated), reject-with-reason, e-sign manifestation (§11.50).' },
  { id: 'submission-center', label: 'Submission Center', tier: 'project', group: 'submission', api: ['/api/submissions', '/api/submission-center', '/api/region-profiles'], ana: ['plan_submission', 'validate_submission'], contract: '@shared/types/submission-ui', catalog: 'SUBMISSION_WORKSPACES', readiness: 'contract-ready', note: 'Framework-agnostic workspace map + error catalog in shared. Package preview, eValidator, ESG send vs eSTAR export.' },
  { id: 'ectd-coauthor', label: 'eCTD co-author', tier: 'project', group: 'submission', api: ['/api/ectd', '/api/content-assembly'], ana: [], contract: '@shared/types/submission-api', catalog: null, readiness: 'routes-ready', note: 'eCTD tree + section authoring. Back-half pipeline (format→assemble→validate→transmit) is production-grade.' },
  { id: 'device-510k', label: '510(k) workbench', tier: 'project', group: 'device', api: ['/api/510k-workflow', '/api/cerv2', '/api/cerv2-sections', '/api/fda-forms'], ana: [], contract: '@shared/types/predicate-intelligence', catalog: null, readiness: 'routes-ready', note: 'eSTAR section tree · content editor · predicate/SE intelligence panel.' },
  { id: 'device-cer', label: 'CER generator (EU MDR)', tier: 'project', group: 'device', api: ['/api/cer', '/api/cerv2'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'Annex XIV structure, FAERS, literature, GSPR checklist, export.' },
  { id: 'cmc', label: 'CMC / Module 3', tier: 'project', group: 'quality-cmc', api: ['/api/cmc', '/api/cmc/module3-os', '/api/cmc/specifications', '/api/cmc/stability'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'Module 3 operating system: blueprint, specifications, stability, batch records, convergence.' },
  { id: 'ind-checklist', label: 'IND lifecycle', tier: 'project', group: 'submission', api: ['/api/ind-lifecycle', '/api/ind-forms', '/api/ind-autodraft', '/api/ind-master-data'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'IND checklist, forms (1571/1572/3674), autodraft, master data, amendments, annual & safety reports.' },
  { id: 'pdev', label: 'Product development (PDEV → IND)', tier: 'project', group: 'submission', api: ['/api/pdev'], ana: [], contract: null, catalog: null, readiness: 'kit-only', note: 'Activity → AI draft → evidence → confirm flow prototyped in ui_kits/pdev.' },
  { id: 'biopharma', label: 'Biopharma (BLA / CTD)', tier: 'project', group: 'submission', api: ['/api/biopharma', '/api/biopharma/bla', '/api/biopharma/ctd', '/api/biopharma/submissions'], ana: [], contract: null, catalog: null, readiness: 'kit-only', note: 'BLA workbench + CTD assembly. ui_kits/biopharma prototyped through Phase 10.' },
  { id: 'template-library', label: 'Template library', tier: 'project', group: 'authoring', api: ['/api/templates', '/api/c2c/templates'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'Full REST (list/extract-preview/extract+save/create-from-spec/update/render docx|pdf), org-scoped, audited. Strongest backend.' },
  { id: 'tasks', label: 'Tasks & collaboration', tier: 'project', group: 'collaboration', api: ['/api/tasks', '/api/regulatory/tasks', '/api/collaboration'], ana: [], contract: '@shared/types/communication-center', catalog: null, readiness: 'routes-ready', note: 'Channels, messages, activity feed, presence, mentions, task board, due dates.' },
  { id: 'dossier-map', label: 'Dossier map', tier: 'project', group: 'submission', api: ['/api/rim', '/api/global-ri'], ana: ['global_ri_dossier'], contract: null, catalog: null, readiness: 'routes-ready', note: 'CTD/eCTD module map with completeness + readiness overlay.' },
  { id: 'csr-workflow', label: 'CSR workflow', tier: 'project', group: 'clinical', api: ['/api/csr', '/api/csr-builder'], ana: ['get_csr_template'], contract: null, catalog: null, readiness: 'routes-ready', note: 'ICH E3 CSR builder + intelligence library.' },
  { id: 'global-ri', label: 'Global regulatory intelligence', tier: 'specialist', group: 'intelligence', api: ['/api/global-ri'], ana: ['global_ri_'], contract: '@shared/types/global-ri-api', catalog: 'GET /api/global-ri/catalog', readiness: 'contract-ready', note: 'Gold-standard: ~41 deterministic capabilities, 9 groups, one-call catalog drives nav + dynamic forms.' },
  { id: 'precedent-intelligence', label: 'Precedent intelligence', tier: 'specialist', group: 'intelligence', api: ['/api/precedent-engine', '/api/saved-precedent-queries'], ana: [], contract: '@shared/types/predicate-intelligence', catalog: null, readiness: 'routes-ready', note: 'Past approvals search + decision rationale. Slots into 510(k) §12 substantial equivalence.' },
  { id: 'biostatistics', label: 'Biostatistics', tier: 'specialist', group: 'clinical', api: ['/api/biostat', '/api/ana-biostats'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'SAP authoring, power analysis, TLF shells, adaptive trial plans, IDMC.' },
  { id: 'report-engine', label: 'Report engine', tier: 'specialist', group: 'evidence', api: ['/api/haq-manager', '/api/intelligence'], ana: [], contract: '@shared/types/intelligence', catalog: null, readiness: 'routes-ready', note: 'Immutable report records, cryptographic seal, provenance atoms.' },
  { id: 'safety-narrative', label: 'Safety narrative / PV', tier: 'specialist', group: 'safety-pv', api: ['/api/pharmacovigilance'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'SAE narrative generation, ICSR, signal handling.' },
  { id: 'device-diagnostics', label: 'Device & diagnostics workbench', tier: 'specialist', group: 'device', api: ['/api/mdx', '/api/manufacturing', '/api/ivdr'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'Classification, performance testing, risk analysis, IVDR, CLIA, CDx, LDT.' },
  { id: 'labeling', label: 'Labeling', tier: 'specialist', group: 'device', api: ['/api/mdx'], ana: [], contract: null, catalog: null, readiness: 'kit-only', note: 'Labeling/IFU authoring + compliance.' },
  { id: 'risk', label: 'Risk management', tier: 'specialist', group: 'device', api: ['/api/mdx', '/api/design-risk'], ana: [], contract: null, catalog: null, readiness: 'kit-only', note: 'ISO 14971 risk file, hazard analysis.' },
  { id: 'deep-research', label: 'Deep research', tier: 'specialist', group: 'intelligence', api: ['/api/deep-research'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'Long-running multi-source research (Maximum engine). Shares the AnA rail in deep-research mode.' },
  { id: 'setup', label: 'Admin / setup', tier: 'admin', group: 'admin', api: ['/api/setup', '/api/admin', '/api/users', '/api/enterprise/rbac', '/api/api-keys'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'Org profile, users/roles, MFA policy, SSO/SCIM, module subscriptions, feature flags, API keys.' },
  { id: 'audit-trail', label: 'Audit trail', tier: 'admin', group: 'admin', api: ['/api/admin/audit', '/api/part11'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'Log entries, filters, signed PDF export. Immutable-history visual.' },
  { id: 'billing', label: 'Billing', tier: 'admin', group: 'admin', api: ['/api/billing'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'Usage, invoices, budgets, alerts.' },
  { id: 'ana-memory', label: 'AnA memory', tier: 'admin', group: 'intelligence', api: ['/api/ana', '/api/mdx'], ana: [], contract: null, catalog: null, readiness: 'routes-ready', note: 'Browse/search knowledge atoms, pin/unpin, confidence scores.' },
];

export const C2C_CROSSCUTTING: C2CCrosscuttingEntry[] = [
  { id: 'auth-session', label: 'Auth & session', api: ['/api/auth', '/api/users', '/api/auth/sso', '/api/auth/enterprise'], note: 'JWT (sliding 7-day refresh), MFA (TOTP), SSO/SCIM. Token + org id via authToken.ts.' },
  { id: 'tenant-org', label: 'Tenant / organization', api: ['/api/setup', '/api/enterprise'], note: 'Org context via x-organization-id header + TenantContext. Multi-org picker.' },
  { id: 'feature-flags', label: 'Feature flags / entitlements', api: ['/api/module-subscriptions'], note: 'Per-tenant module gating. Locked modules → upgrade CTA, never a dead button.' },
  { id: 'ana-rail', label: 'AnA assistant rail', api: ['/api/ana-ri', '/api/ana', '/api/chat'], note: 'Persistent right rail on EVERY surface. Modes standard/deep-research/quick-ask. SSE via /api/ana-ri/stream.' },
  { id: 'esign-modal', label: 'E-signature modal', api: ['/api/esignature'], note: 'Cross-cutting governed-action affordance (password re-verify + TOTP). §11.50 manifestation.' },
];
