/**
 * Admin surface CONFIGURATION and response types. No fixture data.
 *
 * What is left, and why each earns its place:
 *   AUDIT_KINDS       the audit-kind filter taxonomy the server's deriveKind() mirrors
 *   PLATFORM_SERVICES the static platform-capability catalog
 *   ARTIFACT_FMT      a format → label display map
 *   the interfaces    the shape the real endpoints return, imported as types
 *
 * ── What was removed, and why ─────────────────────────────────────────────────
 * Six data constants: AUDIT_LOG, APPS_CATALOG, APP_LICENSE, APP_TIER_RANK,
 * ARTIFACTS and AC_GRANTS. None was imported anywhere. Every reference to them
 * outside this file was a COMMENT, and two of those comments said the surface
 * renders "no APPS_CATALOG / APP_LICENSE fallback" — the code had already moved
 * on and the constants stayed behind.
 *
 * AUDIT_LOG is the one that mattered. It held twenty fabricated 21 CFR Part 11
 * §11.10(e) audit records: a hash chain terminating at 'genesis', e-signature
 * meanings (APPROVAL, AUTHORSHIP, VERIFICATION, AUTHORIZATION), named actors,
 * source IPs and signing reasons. Fabricated compliance evidence is the worst
 * thing in a regulated product to leave lying in the tree, because the day
 * something imports it, what renders is an inspection artifact that never
 * happened.
 *
 * The real ledger already exists and is mounted: GET /api/audit-trail
 * (server/routes/audit-trail-ledger.routes.ts, registered at
 * register-regulatory-routes.ts:266) serves the org-scoped `audit_events` table
 * whose SHA-256 chain is populated by the trg_audit_events_hash_chain trigger.
 * Its own header sets the standard this constant violated: "hash = the REAL
 * stored record_hash (full SHA-256 hex, never truncated or fabricated)".
 * AUDIT_LOG's hashes were fabricated AND truncated — 'a3f7c0…e8d1'.
 *
 * AdminSurfaces.tsx already said all of this: "The fixture DATA constants
 * (audit log, apps catalog, app license, artifacts and access grants) were
 * removed — every surface below now renders real persisted data, an honest
 * empty state, or an honest error state." True of the surface, not of this
 * file. Now true of both.
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

export const ARTIFACT_FMT: Record<string, ArtifactFormat> = {
  docx: { label: 'DOCX', tone: 'ai', action: 'Open to edit' },
  pdf: { label: 'PDF', tone: 'err', action: 'Download' },
  xlsx: { label: 'XLSX', tone: 'ok', action: 'Download' },
  pptx: { label: 'PPTX', tone: 'warn', action: 'Download' },
};

/* ---- Admin console -- access grants ---- */
