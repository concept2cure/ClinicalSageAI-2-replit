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
import { STATED_REASON_INPUT } from './stated-reason-input';

// ─────────────────────────────────────────────────────────────────────────────
// Document View Tools — read/view access across every document store the
// platform holds: vault artifacts (concept2cure_artifacts + versions),
// governed C2C documents (c2c_documents + sections), and the eTMF index.
// All read-only, all tenant-scoped via ToolContext.organizationId. These
// complement the existing write tools (classify_tmf_artifact, section
// drafting) and the upload-file readers (search_large_document).
// ─────────────────────────────────────────────────────────────────────────────

export const LIST_VAULT_DOCUMENTS: AnaTool = {
  name: 'list_vault_documents',
  description:
    "List the organization's Artifacts Center documents (concept2cure_artifacts) — governed program artifacts with title, type, CTD section, status, version, and last update. This is not the files uploaded to the Vault: those are a different store, read with list_project_documents when that tool is offered. An empty result here says nothing about the Vault. Filter by a title query, lifecycle status, or CTD section prefix. Use this to see which artifacts exist before reading one with read_vault_document. Tenant-scoped, read-only.",
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
    "Read an Artifacts Center document's metadata AND content by its id (numeric id or 'artifact_…' external id). Returns title, type, category, CTD section, status, version, content hash, timestamps, and the document text (truncated to max_chars with the full length reported — raise max_chars or read again for more). This reads governed artifacts, not the files uploaded to the Vault (those carry UUID ids and are read with read_project_document when offered). Use list_vault_documents first to find the id. Tenant-scoped, read-only.",
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
    "View a study's Trial Master File, read from the filings stored for the study. A trial master file belongs to a protocol-design study of a project and exists with it. With study_id: the study, its readiness as the platform assessed it (ready, not ready, or not determined, with the basis and the counts it rests on; no percentage is computed), each DIA TMF Reference Model zone with its required, present and missing records and the ones filed without a document that could be verified, and every live filing with the Vault document it is filed against. Without study_id: the studies of the projects the person can open, each with its project; a project with no study has no trial master file. A study that is not in a project the person can open is answered as not found. Report the readiness and counts as returned; do not derive a percentage. Read-only.",
  input_schema: {
    type: 'object',
    properties: {
      study_id: {
        type: 'string',
        description: "The study's own id (the studyId this tool lists when called with no study_id). Omit to list the studies of the projects the person can open.",
      },
      scope: {
        type: 'string',
        enum: ['essential', 'all'],
        description: "Which records readiness is assessed against: 'essential' (the default) for the essential records, 'all' for every record of the reference model.",
      },
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
    "The single-body form of draft_authoring_document: save a NEW draft AnA wrote as an authoring document in the open project (the editor's store, status draft), one section holding the whole content (plain text is stored as escaped paragraphs; ctd_section, if given, is the section code). It goes through the same path as draft_authoring_document: AnA's machine-draft lineage and provenance, a genesis revision, and a Part 11 CREATE audit row whose reason for change is the stated reason. It is NOT filed in the Vault (filed_in_vault: false): filing is a separate step a person takes from the editor. Never tell the person it is in the Vault. Prefer draft_authoring_document for anything with sections. GOVERNED: requires a reason and an open project (refuses otherwise); tenant-scoped. Returns { ok, saved, documentStatus: 'draft', authoringDocId, programId, title, sectionCount: 1, filed_in_vault: false, message }; the authoringDocId opens the draft as a canvas and in the editor.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Document title.' },
      content: { type: 'string', description: 'Full document text/content.' },
      category: { type: 'string', description: "Category, e.g. 'document', 'report', 'correspondence'. Default 'document'." },
      ctd_section: { type: 'string', description: "Optional CTD section, e.g. '2.7.3'." },
      reason: STATED_REASON_INPUT,
    },
    required: ['title', 'content', 'reason'],
  },
};

export const DRAFT_AUTHORING_DOCUMENT: AnaTool = {
  name: 'draft_authoring_document',
  description:
    "Turn a document AnA has drafted into a REAL authoring document in the open project: the editor's own store (authoring_documents / authoring_sections), status draft, one section per { code, title, content }, with sanitized HTML, machine provenance, genesis revisions and CREATE audit. With derivativeId, use title exactly 'Reviewed derivative draft' and omit sections and all caller prose. The parent AnA drafts ONLY from the tenant's current human-attested candidate; independently checked immutable generation provenance must match before saving. Its reinjected content stays in the project editor; the tool returns a public pointer summary. Derivative drafting cannot run in worker tools. Optional module/documentType are save metadata, never model context; qualifiedModelPin is an exact governed model choice. Requires an open project. The saved authoringDocId opens the real document; independent review, approval and filing remain separate.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: "Document title; derivative mode requires exactly 'Reviewed derivative draft'." },
      derivativeId: { type: 'string', format: 'uuid', description: 'Use only a current human-attested derivative reference. Omit sections and all caller prose in this mode.' },
      qualifiedModelPin: { type: 'object', description: 'Optional exact governed model/evidence pin for derivative drafting.', properties: {
        id: { type: 'string' }, provider: { type: 'string' }, pinnedVersion: { type: 'string' }, intendedUse: { type: 'string', const: 'document_drafting' },
        pqReference: { type: 'string' }, pqSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      }, required: ['id', 'provider', 'pinnedVersion', 'intendedUse', 'pqReference', 'pqSha256'], additionalProperties: false },
      module: { type: 'string', description: "CTD module, e.g. 'M2', 'M3'. Default 'M2'." },
      documentType: { type: 'string', description: "Document type / product code, e.g. 'clinical_overview'." },
      sections: {
        type: 'array',
        description: 'The sections in reading order. content is HTML (p, h1-h6, ul/ol/li, table, strong/em); scripts and unknown markup are stripped.',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string', description: "Section code, e.g. '2.5.1'." },
            title: { type: 'string', description: 'Section title.' },
            content: { type: 'string', description: 'Section body as HTML.' },
            sourceReferences: {
              type: 'array', minItems: 1, maxItems: 8,
              description: 'Carry complete V2 batch draft source receipts into the saved document: documentId, contentHash, version:2, extractedTextSha256, spanSha256 and span {start,end,totalChars}. Spans use absolute UTF-16 offsets anywhere in the extraction. The backend enforces nonempty windows of at most 12,000 units, a 48,000-unit aggregate budget, and rechecks current project authority, original bytes and exact extracted text before creation. These are declared source references, not scientific qualification or proof that the model used them.',
              items: {
                type: 'object',
                properties: {
                  documentId: { type: 'string', format: 'uuid' },
                  contentHash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                  version: { type: 'integer', const: 2 },
                  extractedTextSha256: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                  spanSha256: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                  span: {
                    type: 'object',
                    properties: {
                      start: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
                      end: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
                      totalChars: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
                    },
                    required: ['start', 'end', 'totalChars'],
                  },
                },
                required: ['documentId', 'contentHash', 'version', 'extractedTextSha256', 'spanSha256', 'span'],
              },
            },
          },
          required: ['code', 'title', 'content'],
        },
      },
    },
    required: ['title'],
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
      reason: STATED_REASON_INPUT,
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

export const SEARCH_ALL_DOCUMENTS: AnaTool = {
  name: 'search_all_documents',
  description:
    "One search across the document stores of the projects the person can open: vault artifacts and governed submission documents, matched by title, and records filed in a study's Trial Master File, matched by the record's reference-model name or code or by the title of the document it is filed against. Returned as typed hits with ids ready for the read tools: read_vault_document, read_governed_document, and for a TMF hit get_tmf_view with the hit's study_id. A store that could not be searched is named in unavailable_stores; its missing results are not evidence that nothing exists. Read-only.",
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
    "The organization's credit ledger: balance in cents, auto-reload settings and the most recent ledger entries. Credits are NOT metered: nothing the platform does spends the balance (metered: false), so never present it as usage or as what the client has left. Use only when a client asks about the credit ledger itself. Tenant-scoped, read-only.",
  input_schema: { type: 'object', properties: {}, required: [] },
};

export const GET_ORG_CAPABILITIES: AnaTool = {
  name: 'get_org_capabilities',
  description:
    "The organization's effective capabilities: plan tier, which features the tier unlocks (with any pilot-flag grants), and enabled module subscriptions. Use when a client asks what their plan includes or why a feature is locked — answer honestly with the upgrade path (feature minTier) rather than guessing. Tenant-scoped, read-only.",
  input_schema: { type: 'object', properties: {}, required: [] },
};
