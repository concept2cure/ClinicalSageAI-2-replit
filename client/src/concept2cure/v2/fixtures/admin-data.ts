/**
 * Admin surface DISPLAY CONFIG and types.
 *
 * What remains here is configuration, not data about anything real:
 *   AUDIT_KINDS       the filter taxonomy the server's deriveKind() mirrors
 *   PLATFORM_SERVICES the static platform-capability catalog
 *   ARTIFACT_FMT      the format -> label display map
 * plus the interfaces AdminSurfaces imports as types.
 *
 * The fixture DATA constants are gone: AUDIT_LOG, APPS_CATALOG, APP_LICENSE,
 * APP_TIER_RANK, ARTIFACTS and AC_GRANTS. AdminSurfaces had already stopped
 * reading them — it renders real persisted data, an honest empty state, or an
 * honest error state — so they sat here unreferenced.
 *
 * AUDIT_LOG is worth naming specifically. It was twenty fabricated 21 CFR
 * Part 11 audit entries: invented actors, a plausible record/previous hash
 * chain terminating at 'genesis', e-signature meanings (APPROVAL,
 * AUTHORIZATION, VERIFICATION, AUTHORSHIP), internal IP addresses, and events
 * like "Submission sealed -- AIC #001, SHA-256 manifest signed". Nothing
 * rendered it, but a fabricated signed-and-chained audit trail is the single
 * most dangerous thing that could sit in a regulated codebase waiting for
 * someone to wire it up "temporarily". It is deleted rather than left dormant.
 *
 * Do NOT re-port the data constants from the kit. The real sources are the
 * audit-trail ledger routes and the module/licence catalog in the database.
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

export const ARTIFACT_FMT: Record<string, ArtifactFormat> = {
  docx: { label: 'DOCX', tone: 'ai', action: 'Open to edit' },
  pdf: { label: 'PDF', tone: 'err', action: 'Download' },
  xlsx: { label: 'XLSX', tone: 'ok', action: 'Download' },
  pptx: { label: 'PPTX', tone: 'warn', action: 'Download' },
};
