/**
 * Onboarding / migration importer — Phase 8.
 *
 * New paying clients arrive with a folder of legacy submissions (510(k),
 * PMA, IDE archives). The importer ingests them, runs AnA-driven
 * extraction, maps legacy filenames to canonical kit sections, and
 * validates the imported artifacts against current standards.
 *
 * Wire shape: GET /api/mdx/onboarding/:tenantId, POST /api/mdx/onboarding/upload
 */

export const ONB_STEPS = [
  { id: 'connect',  label: 'Connect',           desc: 'Org account · SSO provider · primary admin' },
  { id: 'ingest',   label: 'Ingest archive',    desc: 'Drag-drop legacy folders or connect cloud storage' },
  { id: 'extract',  label: 'AnA extraction',    desc: 'Pull artifacts, sections, metadata, hashes' },
  { id: 'map',      label: 'Section mapping',   desc: 'Legacy filenames → canonical kit sections' },
  { id: 'validate', label: 'Validate',          desc: 'Run current-standard checks; flag gaps' },
  { id: 'seed',     label: 'Seed memory',       desc: 'Extract memory atoms from style guides + past reviews' },
  { id: 'go-live',  label: 'Go live',           desc: 'Migrate users · activate notifications · audit on' },
];

export const ONB_KPIS = [
  { label: 'Migration progress',   metric: '4/7',   meta: 'Step: section mapping · AnA running',         tone: 'warn' },
  { label: 'Artifacts ingested',   metric: '184',   meta: '142 mapped · 31 in review · 11 unmappable',   tone: 'ok'   },
  { label: 'Memory atoms found',   metric: '67',    meta: 'Extracted from 3 style guides + 12 RTA letters' },
  { label: 'Migration started',    metric: '11d',   unit: 'ago', meta: 'Target go-live: end of next week' },
];

export const ONB_ARTIFACTS = [
  { id: 'i-001', legacy: 'CV-117_510k_Final_v23.pdf',         mapped: 'doc-k510-cv117-final',     section: '510(k) eSTAR archive',           confidence: 0.96, state: 'mapped',     issues: 0 },
  { id: 'i-002', legacy: 'CV-117_clearance_FDA_Feb2026.pdf', mapped: 'doc-corresp-cv117-clear',  section: 'Agency correspondence',          confidence: 0.99, state: 'mapped',     issues: 0 },
  { id: 'i-003', legacy: 'BX204_RMP_v1.docx',                 mapped: 'doc-rmp-bx204',            section: 'Risk Management Plan',           confidence: 0.87, state: 'review',     issues: 1 },
  { id: 'i-004', legacy: 'OR801_biocompat_2025.pdf',          mapped: 'doc-biocompat-or801',      section: 'Biocompatibility report',        confidence: 0.91, state: 'mapped',     issues: 0 },
  { id: 'i-005', legacy: 'BX204_design_review_minutes_Q2.docx',mapped: null,                       section: '(no match)',                     confidence: 0.42, state: 'unmappable', issues: 1 },
  { id: 'i-006', legacy: 'NM512_RTA_2025-09-12.pdf',          mapped: 'doc-rta-nm512',            section: 'FDA correspondence — RTA',       confidence: 0.98, state: 'mapped',     issues: 0 },
  { id: 'i-007', legacy: 'CGM_style_guide_v3.pdf',            mapped: 'memory-ingest-2018',       section: 'Memory · style guide ingestion', confidence: 0.94, state: 'mapped',     issues: 0 },
];

export const ONB_VALIDATIONS = [
  { id: 'v-001', artifact: 'i-001', rule: 'Sections present per 21 CFR 807',         severity: 'ok',   note: '20 of 20 sections present and current' },
  { id: 'v-002', artifact: 'i-003', rule: 'ISO 14971:2019 alignment',                 severity: 'warn', note: 'Riskmanagement plan references ISO 14971:2007 — needs 2019 update' },
  { id: 'v-003', artifact: 'i-005', rule: 'Unable to map to canonical section',       severity: 'err',  note: 'Filename pattern matches nothing in the corpus — manual review' },
  { id: 'v-004', artifact: 'i-004', rule: 'Biocompatibility per ISO 10993 latest',    severity: 'ok',   note: 'Aligned with ISO 10993-1:2018 amendments' },
];

