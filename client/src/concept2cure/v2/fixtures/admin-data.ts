/**
 * Admin surface fixture data -- ported verbatim from concept2cure-v2:
 *   app/admin-data.jsx  -> AUDIT_LOG, AUDIT_KINDS, APPS_CATALOG, APP_LICENSE,
 *                          APP_TIER_RANK, PLATFORM_SERVICES, ARTIFACTS,
 *                          ARTIFACT_FMT, AC_GRANTS
 *   app/admin-console.jsx -> AC_GRANTS
 *
 * GENERATED from the kit data file -- edit the kit first, then re-port.
 */

/* ---- Interfaces ---- */

export interface AuditEntry {
  id: string;
  when: string;
  actor: string;
  event: string;
  target: string;
  kind: string;
  sig: boolean;
  hash: string;
  prevHash: string;
  ip: string;
  reason: string | null;
  meaning: string | null;
}

export interface AuditKind {
  id: string;
  label: string;
}

export interface AppsCatalogApp {
  id: string;
  tier: string;
  on: boolean;
  desc: string;
}

export interface AppsCatalogGroup {
  group: string;
  note: string;
  apps: AppsCatalogApp[];
}

export interface AppLicense {
  tier: string;
  industryMode: string;
  renewsAt: string;
  usage: {
    projects: { current: number; limit: number };
    users: { current: number; limit: number };
  };
}

export interface PlatformService {
  name: string;
  icon: string;
  desc: string;
}

export interface ArtifactEntry {
  id: string;
  name: string;
  kind: string;
  fmt: string;
  size: string;
  model: string;
  when: string;
  ver: string;
  sig: boolean;
  prog: string;
}

export interface ArtifactFormat {
  label: string;
  tone: string;
  action: string;
}

export interface AcGrant {
  id: number;
  name: string;
  email: string;
  role: string;
  granted_by: string;
  granted_at: string;
  _new?: boolean;
}

/* ---- Audit trail -- immutable hash-chained ledger (21 CFR Part 11 ss11.10(e)) ---- */

export const AUDIT_LOG: AuditEntry[] = [
  { id: 'AUD-8860', when: '2026-06-17 15:44', actor: 'J. Chen', event: 'New project created from NDA template', target: 'NDA 212345', kind: 'admin', sig: false, hash: 'a3f7c0…e8d1', prevHash: '91b2d4…f0a3', ip: '10.0.4.21', reason: null, meaning: null },
  { id: 'AUD-8859', when: '2026-06-17 15:02', actor: 'AnA (Maximum)', event: 'Generated ss2.5.5 Overview of safety -- 2,140 words, 4 citations', target: 'NDA 212345', kind: 'authoring', sig: false, hash: '91b2d4…f0a3', prevHash: 'c4e8a1…7b92', ip: 'gateway', reason: null, meaning: null },
  { id: 'AUD-8858', when: '2026-06-17 14:22', actor: 'S. Marchetti', event: 'Applied AI rewrite to ss11 substantial equivalence (tracked)', target: 'OR-902', kind: 'authoring', sig: true, hash: 'c4e8a1…7b92', prevHash: '7d1f3e…a4c0', ip: '10.0.4.18', reason: 'Incorporated reviewer comment RC-441', meaning: 'AUTHORSHIP' },
  { id: 'AUD-8857', when: '2026-06-17 13:50', actor: 'System', event: 'eValidator run -- 0 blockers, 2 warnings', target: 'OR-902', kind: 'validation', sig: false, hash: '7d1f3e…a4c0', prevHash: 'e2b9c5…1d38', ip: 'ci-runner', reason: null, meaning: null },
  { id: 'AUD-8856', when: '2026-06-17 12:18', actor: 'R. Nair', event: 'Locked ADaM datasets for BX204-201 (7 domains, 84 datasets)', target: 'BX-204', kind: 'vault', sig: true, hash: 'e2b9c5…1d38', prevHash: '5a0c7f…e6b4', ip: '10.0.4.15', reason: 'Final analysis-ready per SAP v2.1', meaning: 'VERIFICATION' },
  { id: 'AUD-8855', when: '2026-06-17 11:04', actor: 'J. Chen', event: 'E-signature applied -- Cover letter frozen for dispatch', target: 'OR-902', kind: 'esign', sig: true, hash: '5a0c7f…e6b4', prevHash: 'b8d4a2…c901', ip: '10.0.4.21', reason: 'Final review complete, ready for ESG', meaning: 'APPROVAL' },
  { id: 'AUD-8854', when: '2026-06-17 10:41', actor: 'P. Shah', event: 'Preflight Pass 5 -- ss11 SE: all 5 checks PASS', target: 'OR-902', kind: 'validation', sig: false, hash: 'b8d4a2…c901', prevHash: '1e7b3c…d482', ip: '10.0.4.19', reason: null, meaning: null },
  { id: 'AUD-8853', when: '2026-06-17 10:12', actor: 'M. Webb', event: 'Uploaded comparability protocol v3 (GMP-compliant)', target: 'BX-204', kind: 'vault', sig: false, hash: '1e7b3c…d482', prevHash: 'f3a0d7…5e19', ip: '10.0.4.22', reason: null, meaning: null },
  { id: 'AUD-8852', when: '2026-06-17 09:31', actor: 'P. Shah', event: 'Quality attestation signed -- Module 3 specifications frozen', target: 'BX-204', kind: 'esign', sig: true, hash: 'f3a0d7…5e19', prevHash: '6c2e1a…b7f5', ip: '10.0.4.19', reason: 'ICH Q6A criteria met; lot release complete', meaning: 'APPROVAL' },
  { id: 'AUD-8851', when: '2026-06-17 08:55', actor: 'A. Mueller', event: 'Comment resolved -- RC-438 incorporated into ss2.7.4', target: 'NDA 212345', kind: 'review', sig: false, hash: '6c2e1a…b7f5', prevHash: 'd9f4b0…3a87', ip: '10.0.4.17', reason: null, meaning: null },
  { id: 'AUD-8850', when: '2026-06-16 18:30', actor: 'AnA (Balanced)', event: 'Contradiction detected -- CON-0042: draft ORR 31% vs locked 28.5%', target: 'NDA 212345', kind: 'validation', sig: false, hash: 'd9f4b0…3a87', prevHash: '4b8e2d…c156', ip: 'gateway', reason: null, meaning: null },
  { id: 'AUD-8849', when: '2026-06-16 17:12', actor: 'L. Tran', event: 'Uploaded Labeling v2.4 (SPL format, 14 sections)', target: 'OR-902', kind: 'vault', sig: false, hash: '4b8e2d…c156', prevHash: 'a1c3f8…0d72', ip: '10.0.4.20', reason: null, meaning: null },
  { id: 'AUD-8848', when: '2026-06-16 16:45', actor: 'J. Chen', event: 'Task T-204-22 completed -- ss2.5.4 reconciled to locked CSR-201', target: 'NDA 212345', kind: 'authoring', sig: false, hash: 'a1c3f8…0d72', prevHash: '8e5d19…f4b3', ip: '10.0.4.21', reason: null, meaning: null },
  { id: 'AUD-8847', when: '2026-06-16 16:02', actor: 'System', event: 'Shadow review complete -- RtF risk 12% (low), CRL risk 8%', target: 'NDA 212345', kind: 'validation', sig: false, hash: '8e5d19…f4b3', prevHash: '2f7a4c…e018', ip: 'ci-runner', reason: null, meaning: null },
  { id: 'AUD-8846', when: '2026-06-16 15:55', actor: 'AnA (Maximum)', event: 'Drafted ss2.7.3 Summary of clinical efficacy -- 3,800 words', target: 'NDA 212345', kind: 'authoring', sig: false, hash: '2f7a4c…e018', prevHash: 'c0b8d3…a295', ip: 'gateway', reason: null, meaning: null },
  { id: 'AUD-8845', when: '2026-06-16 15:40', actor: 'A. Mueller', event: 'Rejected ss2.5 with reason: bridging claim unsupported', target: 'NDA 212345', kind: 'review', sig: false, hash: 'c0b8d3…a295', prevHash: '7e1f9b…d463', ip: '10.0.4.17', reason: 'Population-PK bridging analysis still in progress -- claim must use conditional language', meaning: null },
  { id: 'AUD-8844', when: '2026-06-16 14:20', actor: 'D. Kapoor', event: 'ANDA Form 356h submitted to FDA ESG gateway', target: 'Generic Metformin', kind: 'submission', sig: true, hash: '7e1f9b…d463', prevHash: '3a5c82…f710', ip: '10.0.4.23', reason: 'All dissolution data confirmed BE', meaning: 'AUTHORIZATION' },
  { id: 'AUD-8843', when: '2026-06-16 12:30', actor: 'System', event: 'eCTD sequence 0004 assembled -- 142 leaves, 3 regional', target: 'NDA 212345', kind: 'submission', sig: false, hash: '3a5c82…f710', prevHash: 'e4d0a1…8b29', ip: 'ci-runner', reason: null, meaning: null },
  { id: 'AUD-8842', when: '2026-06-16 11:15', actor: 'K. Lindstroem', event: 'IVDR GSPR checklist -- 18/23 requirements addressed', target: 'QuantiDx', kind: 'validation', sig: false, hash: 'e4d0a1…8b29', prevHash: '0c9f7e…a534', ip: '10.0.4.24', reason: null, meaning: null },
  { id: 'AUD-8841', when: '2026-06-16 10:08', actor: 'System', event: 'Submission sealed -- AIC #001, SHA-256 manifest signed', target: 'IND 776', kind: 'submission', sig: true, hash: '0c9f7e…a534', prevHash: 'genesis', ip: 'ci-runner', reason: 'Initial IND submission package', meaning: 'AUTHORIZATION' },
];

export const AUDIT_KINDS: AuditKind[] = [
  { id: 'all', label: 'All' },
  { id: 'esign', label: 'E-sign' },
  { id: 'authoring', label: 'Authoring' },
  { id: 'review', label: 'Review' },
  { id: 'submission', label: 'Submission' },
  { id: 'vault', label: 'Vault' },
  { id: 'validation', label: 'Validation' },
  { id: 'admin', label: 'Admin' },
];

/* ---- Apps catalog ---- */

export const APPS_CATALOG: AppsCatalogGroup[] = [
  { group: 'Core workspace', note: 'The shared spine for every client type', apps: [
    { id: 'projects', tier: 'Core', on: true, desc: 'Portfolio of programs across every workstream -- the project-management home.' },
    { id: 'vault', tier: 'Core', on: true, desc: 'Document management: upload, chunk/embed, semantic search, version history, evidence linking.' },
    { id: 'submission-center', tier: 'Core', on: true, desc: 'Sequence ledger, CTD leaves, shadow review, deterministic dispatch gate, gateway transmit + ACK.' },
    { id: 'tasks', tier: 'Core', on: true, desc: 'Org-wide unified tasks board, critical-path DAG, dependency graph, analytics.' },
    { id: 'report-engine', tier: 'Core', on: true, desc: 'Reporting & analytics -- immutable sealed reports, provenance atoms, portfolio metrics.' },
    { id: 'artifacts-center', tier: 'Core', on: true, desc: 'Cross-project library of every artifact AnA drafted -- download PDFs, open DOCX to edit.' },
  ] },
  { group: 'Authoring', note: 'Create and co-author the governed record', apps: [
    { id: 'document-authoring', tier: 'Included', on: true, desc: 'Word-class editor + co-author, track-changes, comments, versions, approval, e-sign.' },
    { id: 'dossier', tier: 'Included', on: true, desc: 'Document-first workspace: eCTD tree, in-process documents, live document, data room.' },
    { id: 'cmc', tier: 'Included', on: true, desc: 'CTD Module 3 operating system: specifications, stability, impurity control, convergence.' },
    { id: 'csr-workflow', tier: 'Included', on: true, desc: 'ICH E3 CSR builder + intelligence library, cross-study compare, benefit-risk.' },
    { id: 'labeling-pi', tier: 'Included', on: true, desc: 'USPI (PLLR), EU SmPC (QRD), SPL -- the label as the document + agency negotiation.' },
    { id: 'protocol-dev', tier: 'Included', on: true, desc: 'Protocol authoring hub: section tree, SoA grid, 5x5 risk register, amendments.' },
    { id: 'template-library', tier: 'Included', on: true, desc: 'Governed templates -- list, extract, create-from-spec, render DOCX/PDF.' },
  ] },
  { group: 'Submissions & filing', note: 'Plan, assemble and transmit', apps: [
    { id: 'pyramid', tier: 'Included', on: true, desc: 'Deterministic submission work breakdown -- phases, tasks, risk, critical path, doc coverage.' },
    { id: 'nda-cockpit', tier: 'Included', on: true, desc: 'NDA/BLA filing cockpit: CTD M1-5 readiness, PDUFA clock, Refuse-to-File shadow review.' },
    { id: 'ind-checklist', tier: 'Included', on: true, desc: 'IND lifecycle: checklist, forms (1571/1572/3674), autodraft, amendments, annual/safety reports.' },
    { id: 'ectd-coauthor', tier: 'Included', on: true, desc: 'eCTD tree + section authoring; format->assemble->validate->transmit pipeline.' },
    { id: 'haq-manager', tier: 'Included', on: true, desc: 'Agency IR / Day-120 LoQ / CRL decomposed into source-traced responses with precedent.' },
    { id: 'filings-catalog', tier: 'Included', on: true, desc: 'Canonical taxonomy of 113 filing types; each routes into its execution workflow.' },
    { id: 'dossier-map', tier: 'Included', on: true, desc: 'CTD/eCTD module map with completeness + readiness overlay.' },
  ] },
  { group: 'Device & IVD', note: 'Medtech pathways', apps: [
    { id: 'device-workstream', tier: 'Included', on: true, desc: 'The MDX workstream -- classification + 510(k)/PMA/CER/De Novo pathway tabs, predicate intelligence.' },
    { id: 'device-510k', tier: 'Included', on: true, desc: 'eSTAR section tree, content editor, predicate/SE intelligence.' },
    { id: 'device-cer', tier: 'Included', on: true, desc: 'EU MDR CER generator -- Annex XIV, FAERS, literature, GSPR checklist, export.' },
    { id: 'risk', tier: 'Add-on', on: false, desc: 'ISO 14971 risk file, hazard analysis, 5x5 acceptability matrix, FMEA.' },
    { id: 'labeling', tier: 'Add-on', on: false, desc: 'Labeling / IFU authoring + compliance.' },
  ] },
  { group: 'Science & analysis', note: 'Evidence-grade intelligence', apps: [
    { id: 'biostatistics', tier: 'Included', on: true, desc: 'SAP authoring, power analysis, TLF shells, adaptive designs, E9(R1) estimands.' },
    { id: 'rbm', tier: 'Add-on', on: true, desc: 'ICH E6(R3) risk-based monitoring -- RACT, KRIs, QTLs, central monitoring, site oversight.' },
    { id: 'safety-narrative', tier: 'Included', on: true, desc: 'SAE narrative generation, ICSR, signal handling.' },
    { id: 'intelligence-catalog', tier: 'Included', on: true, desc: '142 deterministic registry tools across 24 domains, with the determinism-pedigree system.' },
    { id: 'precedent-intelligence', tier: 'Included', on: true, desc: 'Past-approvals search + decision rationale; slots into 510(k) ss12 substantial equivalence.' },
    { id: 'deep-research', tier: 'Add-on', on: true, desc: 'Long-running multi-connector research with grounded synthesis.' },
    { id: 'global-ri', tier: 'Included', on: true, desc: '~41 deterministic global-RI capabilities across 9 groups.' },
  ] },
  { group: 'Lifecycle & access', note: 'Post-approval and commercial', apps: [
    { id: 'registrations', tier: 'Included', on: true, desc: 'Global registration lifecycle: authorization status, review clocks, renewals/variations.' },
    { id: 'market-access', tier: 'Add-on', on: false, desc: 'Payer coverage, value-dossier composer, coding strategy, access sequencing.' },
    { id: 'change-assessment', tier: 'Included', on: true, desc: 'Change-impact engine -- 510(k) change vs MDR significant-change determinations.' },
    { id: 'reg-change', tier: 'Included', on: true, desc: 'Portfolio horizon scan of FDA/ISO/EU changes, each resolved to an action document.' },
    { id: 'agency-meetings', tier: 'Included', on: true, desc: 'Pre-IND/Type A-D/EOP2, device Q-Sub, EMA SA -- briefing books, minutes, commitments.' },
    { id: 'research-admin', tier: 'Add-on', on: false, desc: 'IRB/IACUC/IBC governance, coverage analysis, grant finder, CITI training matrix.' },
  ] },
  { group: 'Governance', note: 'Review, orchestrate, audit', apps: [
    { id: 'review', tier: 'Core', on: true, desc: 'Review queue, threaded comments, reject-with-reason, e-sign manifestation (ss11.50).' },
    { id: 'orchestration', tier: 'Included', on: true, desc: 'Workflow engine -- steps, blockers, approval checkpoints, readiness gate before filing.' },
    { id: 'audit-trail', tier: 'Core', on: true, desc: 'Immutable log entries, filters, signed PDF export.' },
  ] },
];

export const APP_LICENSE: AppLicense = {
  tier: 'professional',
  industryMode: 'biotech',
  renewsAt: '2027-01-14',
  usage: {
    projects: { current: 14, limit: 25 },
    users: { current: 38, limit: 50 },
  },
};

export const APP_TIER_RANK: Record<string, number> = {
  free: 0,
  standard: 1,
  professional: 2,
  enterprise: 3,
};

export const PLATFORM_SERVICES: PlatformService[] = [
  { name: 'RIM -- Regulatory Intelligence Model', icon: 'database', desc: 'The non-LLM judgment layer that accumulates regulatory precedent over time and powers every app\'s recommendations.' },
  { name: 'Evidence retrieval (RAG)', icon: 'search', desc: 'Grounds answers and drafts in the corpus and returns cited source chunks. Runs inside authoring, evidence and chat.' },
  { name: 'AnA gateway & model routing', icon: 'workflow', desc: 'Risk-tiered routing of every AI call to the right model, with human-review gates on high-impact actions.' },
  { name: 'Precedent engine', icon: 'scale', desc: 'Deterministic search over past approvals and decisions; surfaced in Precedent, 510(k) SE and drafting.' },
  { name: 'Deterministic tool registry', icon: 'shieldCheck', desc: '142 pure-function regulatory tools (TTC, estimand, causality...) that AnA calls for submission-defensible output.' },
  { name: 'Deep-research orchestrator', icon: 'telescope', desc: 'Multi-connector fan-out and grounded synthesis that drives the Deep research app.' },
  { name: 'Template & rendering', icon: 'template', desc: 'Generates DOCX and PDF from governed templates -- produces the files in Artifacts Center and the editor.' },
  { name: 'E-signature (21 CFR Part 11)', icon: 'lock', desc: 'Reason-for-change + identity re-assertion on governed actions across every app.' },
  { name: 'Audit hash-chain', icon: 'scroll', desc: 'Tamper-evident ss11.10(e) ledger written by every governed mutation.' },
  { name: 'Connectors', icon: 'network', desc: 'ClinicalTrials.gov, FAERS/MAUDE, EUDAMED, EHR/FHIR, DMS -- feed evidence and deep research.' },
];

/* ---- Artifacts Center ---- */

export const ARTIFACTS: ArtifactEntry[] = [
  { id: 'A-2841', name: 'ss11 SE discussion -- OR-801', kind: 'Section', fmt: 'docx', size: '182 KB', model: 'Maximum', when: '30 min ago', ver: 'v0.4', sig: false, prog: 'OR-902' },
  { id: 'A-2838', name: 'SAP -- BX-204 superiority design', kind: 'SAP', fmt: 'docx', size: '344 KB', model: 'Maximum', when: '2 h ago', ver: 'v3.0', sig: false, prog: 'BX-204' },
  { id: 'A-2836', name: 'ss2.5.4 preflight QC report', kind: 'QC report', fmt: 'pdf', size: '96 KB', model: 'Balanced', when: '3 h ago', ver: 'v1.0', sig: false, prog: 'BX-204' },
  { id: 'A-2835', name: 'FDA 2023 bridging precedent memo', kind: 'Memo', fmt: 'docx', size: '71 KB', model: 'Balanced', when: '5 h ago', ver: 'v1.1', sig: true, prog: 'NDA 212345' },
  { id: 'A-2833', name: 'CDISC conformance findings -- BX204-301', kind: 'Data', fmt: 'xlsx', size: '218 KB', model: 'Balanced', when: '6 h ago', ver: 'v2.1', sig: false, prog: 'BX-204' },
  { id: 'A-2829', name: 'CER Article 61 draft -- IV-415', kind: 'CER', fmt: 'docx', size: '512 KB', model: 'Maximum', when: 'yesterday', ver: 'v0.7', sig: false, prog: 'IV-415' },
  { id: 'A-2820', name: '510(k) cover letter -- OR-902', kind: 'Letter', fmt: 'docx', size: '44 KB', model: 'Balanced', when: '2 d ago', ver: 'v1.2', sig: true, prog: 'OR-902' },
  { id: 'A-2814', name: 'Predicate comparison deck', kind: 'Deck', fmt: 'pptx', size: '1.4 MB', model: 'Maximum', when: '3 d ago', ver: 'v2.0', sig: false, prog: 'BX-204' },
];

export const ARTIFACT_FMT: Record<string, ArtifactFormat> = {
  docx: { label: 'DOCX', tone: 'ai', action: 'Open to edit' },
  pdf: { label: 'PDF', tone: 'err', action: 'Download' },
  xlsx: { label: 'XLSX', tone: 'ok', action: 'Download' },
  pptx: { label: 'PPTX', tone: 'warn', action: 'Download' },
};

/* ---- Admin console -- access grants ---- */

export const AC_GRANTS: AcGrant[] = [
  { id: 1, name: 'Jordan Chen', email: 'jordan@brightbio.com', role: 'owner', granted_by: 'system', granted_at: '2026-01-04' },
  { id: 2, name: 'Priya Shah', email: 'priya@brightbio.com', role: 'business_admin', granted_by: 'jordan@brightbio.com', granted_at: '2026-02-11' },
  { id: 3, name: 'Marcus Webb', email: 'marcus@brightbio.com', role: 'platform_admin', granted_by: 'jordan@brightbio.com', granted_at: '2026-03-02' },
  { id: 4, name: 'Dana Okafor', email: 'dana@vendor.io', role: 'support', granted_by: 'priya@brightbio.com', granted_at: '2026-04-19' },
];
