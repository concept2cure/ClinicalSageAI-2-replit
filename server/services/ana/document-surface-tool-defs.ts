/**
 * Document-surface tool definitions — read/view access across every document
 * store the platform holds (vault artifacts, governed C2C documents, the eTMF
 * index), governed write operations, cross-store search, and the org
 * capability read.
 *
 * Extracted verbatim from AnaToolDefinitions.ts (mega-file decomposition,
 * tranche 3). These are pure `AnaTool` definition objects; their handlers live
 * in AnaToolExecutor.ts. Imported back into AnaToolDefinitions.ts so
 * `ALL_ANA_TOOLS_RAW` references them unchanged.
 */

import type { AnaTool } from '../ai-gateway/types';

// ─────────────────────────────────────────────────────────────────────────────
// Document View Tools — read/view access across every document store the
// platform holds: vault artifacts (concept2cure_artifacts + versions),
// governed C2C documents (c2c_documents + sections), and the eTMF index.
// All read-only, all tenant-scoped via ToolContext.organizationId. These
// complement the existing write tools (create_tmf, classify_tmf_artifact,
// section drafting) and the upload-file readers (search_large_document).
// ─────────────────────────────────────────────────────────────────────────────

export const LIST_VAULT_DOCUMENTS: AnaTool = {
  name: 'list_vault_documents',
  description:
    "List documents in the organization's vault (concept2cure_artifacts) — every program artifact with title, type, CTD section, status, version, and last update. Filter by a title query, lifecycle status, or CTD section prefix. Use this to see what documents exist before reading one with read_vault_document. Tenant-scoped, read-only.",
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Case-insensitive title substring filter.' },
      status: {
        type: 'string',
        enum: ['draft', 'review', 'approved', 'locked'],
        description: 'Filter by lifecycle status.',
      },
      ctd_prefix: { type: 'string', description: "CTD section prefix filter, e.g. '2.7' or '3'." },
      limit: { type: 'number', description: 'Max rows returned. Default 25, max 100.' },
    },
    required: [],
  },
};

export const READ_VAULT_DOCUMENT: AnaTool = {
  name: 'read_vault_document',
  description:
    "Read a vault document's metadata AND content by its id (numeric id or 'artifact_…' external id). Returns title, type, category, CTD section, status, version, content hash, timestamps, and the document text (truncated to max_chars with the full length reported — raise max_chars or read again for more). Use list_vault_documents first to find the id. Tenant-scoped, read-only.",
  input_schema: {
    type: 'object',
    properties: {
      artifact_id: { type: 'string', description: "Numeric id or 'artifact_…' external id." },
      max_chars: { type: 'number', description: 'Max content characters returned. Default 6000, max 30000.' },
    },
    required: ['artifact_id'],
  },
};

export const GET_DOCUMENT_VERSIONS: AnaTool = {
  name: 'get_document_versions',
  description:
    "Version history for a vault document: every version with its number, change summary, content hash, author id, and timestamp, newest first. Use to see how a document evolved or to cite a specific sealed version. Tenant-scoped, read-only.",
  input_schema: {
    type: 'object',
    properties: {
      artifact_id: { type: 'string', description: "Numeric id or 'artifact_…' external id." },
    },
    required: ['artifact_id'],
  },
};

export const LIST_GOVERNED_DOCUMENTS: AnaTool = {
  name: 'list_governed_documents',
  description:
    "List the organization's governed submission documents (c2c_documents) — INDs, NDAs, BLAs, 510(k)s, CERs and the rest — with doc type, agency, lifecycle status (draft/review/approved/locked/submitted/archived), and readiness percent. Filter by doc type, agency, or status. Use read_governed_document to open one. Tenant-scoped, read-only.",
  input_schema: {
    type: 'object',
    properties: {
      doc_type: { type: 'string', description: "Filter by document type, e.g. 'ind', 'nda', '510k', 'cer'." },
      agency: { type: 'string', description: "Filter by agency, e.g. 'fda', 'ema'." },
      status: { type: 'string', description: 'Filter by lifecycle status.' },
      limit: { type: 'number', description: 'Max rows returned. Default 25, max 100.' },
    },
    required: [],
  },
};

export const READ_GOVERNED_DOCUMENT: AnaTool = {
  name: 'read_governed_document',
  description:
    "Read a governed submission document. Without section_key: returns the document's outline — every section with its key, label, status (todo/drafted/review/approved/locked), and whether it is mandatory. With section_key: returns that section's current content and version. Use list_governed_documents first to find the document id. Tenant-scoped, read-only.",
  input_schema: {
    type: 'object',
    properties: {
      document_id: { type: 'string', description: "The document id (e.g. 'doc_…')." },
      section_key: { type: 'string', description: 'Optional section key — omit to get the outline.' },
      max_chars: { type: 'number', description: 'Max section-content characters returned. Default 6000, max 30000.' },
    },
    required: ['document_id'],
  },
};

export const GET_TMF_VIEW: AnaTool = {
  name: 'get_tmf_view',
  description:
    "View a Trial Master File's index and completeness: every artifact grouped by DIA TMF Reference Model zone with its status (expected/received/in_review/final/missing/not_applicable), plus the completeness gap-check (percent, per-zone gaps, inspection-readiness verdict). Omit tmf_file_id to list the organization's TMF files instead. Read-only counterpart of create_tmf / classify_tmf_artifact. Tenant-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      tmf_file_id: { type: 'number', description: 'The TMF file id. Omit to list all TMF files.' },
    },
    required: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Document Operations Tools — governed writes + cross-store search + plan
// introspection. Writes require a reason-for-change (min 8 chars) and are
// audited; reads are tenant-scoped. Together with the View Tools these give
// AnA the full document lifecycle: find → read → draft/save → version →
// file to TMF → track completeness — plus plan/credit answers for clients.
// ─────────────────────────────────────────────────────────────────────────────

export const SAVE_DOCUMENT_TO_VAULT: AnaTool = {
  name: 'save_document_to_vault',
  description:
    "Save a NEW document into the organization's vault: creates the artifact (status draft, version 1) with a SHA-256 content hash and an immutable version-1 snapshot. Use when AnA has drafted content the client wants filed. GOVERNED: requires a reason, is audited, and is tenant-scoped. Returns the new document's ids.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Document title.' },
      content: { type: 'string', description: 'Full document text/content.' },
      category: { type: 'string', description: "Category, e.g. 'document', 'report', 'correspondence'. Default 'document'." },
      ctd_section: { type: 'string', description: "Optional CTD section, e.g. '2.7.3'." },
      reason: { type: 'string', description: 'Reason-for-change (min 8 chars) — recorded in the audit trail.' },
    },
    required: ['title', 'content', 'reason'],
  },
};

export const UPDATE_VAULT_DOCUMENT: AnaTool = {
  name: 'update_vault_document',
  description:
    "Save a NEW VERSION of an existing vault document: bumps the version, replaces the working content, recomputes the SHA-256 hash, and writes an immutable version snapshot with the reason as the change description. Refuses locked documents (finalized content is immutable). GOVERNED: reason required, audited, tenant-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      artifact_id: { type: 'string', description: "Numeric id or 'artifact_…' external id." },
      content: { type: 'string', description: 'The full replacement content.' },
      reason: { type: 'string', description: 'Reason-for-change (min 8 chars) — becomes the version change description.' },
    },
    required: ['artifact_id', 'content', 'reason'],
  },
};

export const COMPARE_VAULT_VERSIONS: AnaTool = {
  name: 'compare_vault_versions',
  description:
    "Compare two SEALED versions of a vault document by version number: returns each version's metadata (hash, author, timestamp, change description) plus a line-level change summary. Use get_document_versions first to see which versions exist; for a full section-level redline, feed the two contents to compare_document_versions. Tenant-scoped, read-only.",
  input_schema: {
    type: 'object',
    properties: {
      artifact_id: { type: 'string', description: "Numeric id or 'artifact_…' external id." },
      version_a: { type: 'number', description: 'Older version number.' },
      version_b: { type: 'number', description: 'Newer version number.' },
    },
    required: ['artifact_id', 'version_a', 'version_b'],
  },
};

export const SEED_TMF: AnaTool = {
  name: 'seed_tmf',
  description:
    "Populate a Trial Master File with the expected-document skeleton from the TMF Reference Model catalog (ICH E6(R2) §8 essential documents). Idempotent — artifacts already present are skipped, so it can fill gaps in an in-progress TMF. Scope 'essential' seeds only essential documents; 'all' (default) seeds the full catalog. GOVERNED: reason required, audited, tenant-scoped. Use get_tmf_view afterwards to see the seeded index.",
  input_schema: {
    type: 'object',
    properties: {
      tmf_file_id: { type: 'number', description: 'The TMF file id (from create_tmf or get_tmf_view).' },
      scope: { type: 'string', enum: ['essential', 'all'], description: "Seed scope. Default 'all'." },
      reason: { type: 'string', description: 'Reason-for-change (min 8 chars).' },
    },
    required: ['tmf_file_id', 'reason'],
  },
};

export const UPDATE_TMF_ARTIFACT_STATUS: AnaTool = {
  name: 'update_tmf_artifact_status',
  description:
    "Move a TMF artifact through its lifecycle: expected → received → in_review → final (or missing / not_applicable). Use after documents arrive or pass QC so the completeness gap-check reflects reality. GOVERNED: reason required, audited, tenant-scoped.",
  input_schema: {
    type: 'object',
    properties: {
      tmf_artifact_id: { type: 'number', description: 'The TMF artifact id (from get_tmf_view / classify_tmf_artifact).' },
      status: {
        type: 'string',
        enum: ['expected', 'received', 'in_review', 'final', 'missing', 'not_applicable'],
        description: 'The new lifecycle status.',
      },
      document_date: { type: 'string', description: 'Optional document date (YYYY-MM-DD).' },
      reason: { type: 'string', description: 'Reason-for-change (min 8 chars).' },
    },
    required: ['tmf_artifact_id', 'status', 'reason'],
  },
};

export const SEARCH_ALL_DOCUMENTS: AnaTool = {
  name: 'search_all_documents',
  description:
    "One search across every document store: vault artifacts, governed submission documents, and TMF artifacts — matched by title/name, returned as typed hits with ids ready for the read tools (read_vault_document, read_governed_document, get_tmf_view). Tenant-scoped, read-only.",
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Case-insensitive substring to match against titles/names.' },
      limit: { type: 'number', description: 'Max hits per store. Default 15, max 50.' },
    },
    required: ['query'],
  },
};

export const GET_PLAN_USAGE: AnaTool = {
  name: 'get_plan_usage',
  description:
    "The organization's plan usage limits, Anthropic-style: the current 5-hour session window (% used, resets at) and the weekly 'All models' + premium-model buckets, plus a per-model weekly drill-down. Use when a client asks how much usage they have left, when limits reset, or which models are consuming budget. Tenant-scoped, read-only.",
  input_schema: { type: 'object', properties: {}, required: [] },
};

export const GET_BILLING_CREDITS: AnaTool = {
  name: 'get_billing_credits',
  description:
    "The organization's usage-credit balance: current balance in cents, auto-reload settings ('top off to $X when balance is $Y'), and the most recent ledger entries. Use when a client asks about their credit balance or recent credit activity. Tenant-scoped, read-only.",
  input_schema: { type: 'object', properties: {}, required: [] },
};

export const GET_ORG_CAPABILITIES: AnaTool = {
  name: 'get_org_capabilities',
  description:
    "The organization's effective capabilities: plan tier, which features the tier unlocks (with any pilot-flag grants), and enabled module subscriptions. Use when a client asks what their plan includes or why a feature is locked — answer honestly with the upgrade path (feature minTier) rather than guessing. Tenant-scoped, read-only.",
  input_schema: { type: 'object', properties: {}, required: [] },
};
