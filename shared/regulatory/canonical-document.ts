/**
 * Canonical regulated-document model — the ONE document identity hierarchy.
 *
 * The platform grew three parallel "document" writers with incompatible
 * identities and assumptions:
 *   - AnA drafts        → concept2cure_artifacts        (UUID identity)
 *   - Module integration → unified_documents            (integer identity)
 *   - Authoring          → coauthor_documents + its own sections, comments,
 *                          signatures, reviews, suggestions, compliance scores,
 *                          change requests
 * The integer-vs-UUID split is why direct ingestion into unified_documents had
 * to be stopped: two writers could not agree on what a document's id even was.
 *
 * This module fixes that at the identity layer by defining a single hierarchy
 * every subsystem projects onto:
 *
 *   Canonical Document                (stable UUID identity, one per logical doc)
 *   └── Canonical Version             (immutable snapshot; monotonic; SHA-256)
 *       ├── Authoring sections        (coauthor_documents / authoring sections)
 *       ├── Artifact representation   (concept2cure_artifacts)
 *       ├── Module / dossier placement(submission_leaves + CTD coordinate)
 *       ├── Review workflow           (reviews / comments / suggestions)
 *       ├── Signature / approval      (21 CFR Part 11 e-signature)
 *       ├── Export representation     (eCTD leaf / rendered PDF)
 *       └── Audit events              (regulatory_audit_logs)
 *
 * The canonical id is ALWAYS a UUID. Every legacy row is reachable through a
 * typed `DocumentSourceRef` that records the source system and the row's native
 * id AS A STRING, so an integer writer and a UUID writer can both be bridged
 * without either changing. This is a pure contract (no DB): the server projects
 * the existing tables onto it; it introduces no new storage table by itself.
 *
 * @module shared/regulatory/canonical-document
 */

import type {
  DocumentStage,
  DossierPlacement,
  ApprovalSignature,
  DocumentAuditEvent,
} from './document-lifecycle';

// ─── Identity ─────────────────────────────────────────────────────────────────

/** Canonical, stable document identity. Always a UUID. */
export type CanonicalDocumentId = string & { readonly __brand: 'CanonicalDocumentId' };
/** Canonical version identity. Always a UUID. */
export type CanonicalVersionId = string & { readonly __brand: 'CanonicalVersionId' };

/** The legacy/source systems a canonical document can be projected from. */
export type DocumentSourceSystem =
  | 'concept2cure_artifacts'   // AnA drafts (UUID)
  | 'unified_documents'        // module integration (integer)
  | 'coauthor_documents'       // authoring inline content (integer)
  | 'ctd_onboarding_documents' // uploaded binaries (integer)
  | 'vault_documents';         // external S3 vault (UUID, program-scoped)

/** Whether a source system keys rows by integer or UUID (the reconciliation crux). */
export const SOURCE_ID_KIND: Record<DocumentSourceSystem, 'integer' | 'uuid'> = {
  concept2cure_artifacts: 'uuid',
  unified_documents: 'integer',
  coauthor_documents: 'integer',
  ctd_onboarding_documents: 'integer',
  vault_documents: 'uuid',
};

/**
 * How a source store is NAMED to a reader.
 *
 * A leaf in a sequence points at its source row polymorphically, as
 * (documentTable, documentId). Both halves are internal: `coauthor_documents`
 * is a relation name and `#501` is a primary key, and the Submission Center
 * was rendering the pair verbatim into the leaf table — "coauthor_documents
 * #501" — on a screen whose reader is a regulatory director. That is the
 * information-disclosure class the house forbids in client copy
 * (BIOPHARMA_WORK_ORDER guardrail 3; scripts/ci/check-internals-in-copy.mjs),
 * and it is also simply unreadable: the relation tells the reader nothing
 * about which document they are looking at.
 *
 * This is the one place that answers "what do we CALL that store". Both the
 * leaf table and the placement dialog read it, so the vocabulary cannot drift
 * between the screen that places a document and the screen that lists it.
 *
 * The id is deliberately KEPT. It is how a reader raises the row with support
 * and how an auditor ties a leaf to its source — what changes is that it is
 * now qualified by a name that means something ("Authored document #501"),
 * not by a relation.
 */
export const DOCUMENT_STORE_LABEL: Readonly<Record<string, string>> = Object.freeze({
  coauthor_documents: 'Authored document',
  unified_documents: 'Module document',
  ctd_onboarding_documents: 'Uploaded file',
  vault_documents: 'Vault document',
  concept2cure_artifacts: 'AnA draft',
  authoring_sections: 'Authored section',
  authoring_documents: 'Authored document',
  q_sub_section_bodies: 'Q-Sub section',
  labeling_pi_sections: 'Labeling section',
  protocol_sections: 'Protocol section',
  protocol_documents: 'Protocol',
  biosketch_sections: 'Biosketch section',
});

/**
 * The reader-facing name of a source store, with the id appended when there is
 * one: `documentSourceLabel('coauthor_documents', 501)` → 'Authored document #501'.
 *
 * An UNRECOGNISED store falls back to 'Filed document' rather than to the raw
 * relation name. Falling back to the name would mean every store added after
 * this map was written leaks by default — the failure mode has to be the safe
 * one, not the informative one, because nobody re-reads a fallback branch when
 * they add a table.
 */
export function documentSourceLabel(table: string | null | undefined, id?: string | number | null): string {
  const name = (table && DOCUMENT_STORE_LABEL[table]) || 'Filed document';
  return id == null || id === '' ? name : `${name} #${id}`;
}

/**
 * A typed reference from the canonical document to a row in a source system.
 * `nativeId` is ALWAYS the string form of the row's real id — this is what lets
 * an integer writer and a UUID writer coexist under one canonical identity.
 */
export interface DocumentSourceRef {
  system: DocumentSourceSystem;
  nativeId: string;
  idKind: 'integer' | 'uuid';
  /** Which facet this source row provides (a source can back multiple facets). */
  role: DocumentFacetKind;
}

export type DocumentFacetKind =
  | 'authoring'
  | 'artifact'
  | 'placement'
  | 'review'
  | 'approval'
  | 'export'
  | 'audit';

/** Build a source ref, normalising the native id to a string and stamping id-kind. */
export function makeSourceRef(system: DocumentSourceSystem, nativeId: string | number, role: DocumentFacetKind): DocumentSourceRef {
  return { system, nativeId: String(nativeId), idKind: SOURCE_ID_KIND[system], role };
}

// ─── Facets (children of a Canonical Version) ─────────────────────────────────

/** Authoring sections facet — the drafted structure/content. */
export interface AuthoringFacet {
  source: DocumentSourceRef;
  /** Section codes present (aligns with the project-bootstrap section blueprint). */
  sectionCodes: string[];
  /** True when every required section has content. */
  complete: boolean;
}

/** Artifact representation facet — the AnA/editor artifact form. */
export interface ArtifactFacet {
  source: DocumentSourceRef; // concept2cure_artifacts
  artifactType: string;
  /** SHA-256 of the artifact content at this version. */
  contentHash: string;
}

/** Review workflow facet — comments, suggestions, compliance score. */
export interface ReviewFacet {
  reviewState: 'not_started' | 'in_review' | 'changes_requested' | 'reviewed';
  reviewers: string[];
  openComments: number;
  complianceScore?: number;
}

/** Export representation facet — the rendered/eCTD-placed leaf. */
export interface ExportFacet {
  format: 'pdf' | 'pdf_a' | 'docx' | 'xml';
  /** eCTD leaf id once packaged. */
  leafId?: string;
  /** MD5 (eCTD index requirement) AND SHA-256 (governance) of the exported bytes. */
  md5?: string;
  sha256?: string;
}

/**
 * A Canonical Version: an immutable-once-approved snapshot with all seven facets.
 * Each facet is optional because a version accretes facets as it moves through
 * the lifecycle (authoring → review → approval → placement → export).
 */
export interface CanonicalVersion {
  id: CanonicalVersionId;
  documentId: CanonicalDocumentId;
  /** Monotonic version number; a new approved edition increments and supersedes. */
  version: number;
  stage: DocumentStage;
  /** SHA-256 over the canonical content of this version (integrity spine). */
  contentHash: string;
  /** True once approved; approved content never mutates in place. */
  immutable: boolean;
  createdAt: string;

  // Facets
  authoring?: AuthoringFacet;
  artifact?: ArtifactFacet;
  placement?: DossierPlacement;
  review?: ReviewFacet;
  approval?: ApprovalSignature;
  export?: ExportFacet;
  audit: DocumentAuditEvent[];
}

/** A Canonical Document: stable identity + the chain of versions. */
export interface CanonicalDocument {
  id: CanonicalDocumentId;
  title: string;
  /** Registry document/application type or blueprint id, e.g. 'ICH_CSR', 'US_IND'. */
  documentType: string;
  organizationId: number;
  projectId?: string;
  /** The current (latest) version. */
  currentVersionId: CanonicalVersionId;
  /** All source-system rows this canonical document reconciles. */
  sourceRefs: DocumentSourceRef[];
  createdAt: string;
  updatedAt: string;
}

// ─── Invariants ───────────────────────────────────────────────────────────────

export type DocumentModelViolation =
  | 'NON_UUID_CANONICAL_ID'
  | 'APPROVED_NOT_IMMUTABLE'
  | 'APPROVED_WITHOUT_SIGNATURE'
  | 'PLACED_WITHOUT_PLACEMENT'
  | 'EXPORTED_WITHOUT_HASHES'
  | 'VERSION_DOCUMENT_MISMATCH'
  | 'DUPLICATE_SOURCE_ROLE';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCanonicalId(id: string): boolean {
  return UUID_RE.test(id);
}

/**
 * Validate the canonical invariants for a document + one of its versions.
 * Fail-closed: returns every violation found (empty array = valid).
 */
export function validateCanonicalVersion(doc: CanonicalDocument, version: CanonicalVersion): DocumentModelViolation[] {
  const v: DocumentModelViolation[] = [];

  if (!isCanonicalId(doc.id)) v.push('NON_UUID_CANONICAL_ID');
  if (version.documentId !== doc.id) v.push('VERSION_DOCUMENT_MISMATCH');

  if (version.stage === 'approved' || version.stage === 'placed' || version.stage === 'packaged' || version.stage === 'submitted') {
    if (!version.immutable) v.push('APPROVED_NOT_IMMUTABLE');
    if (!version.approval) v.push('APPROVED_WITHOUT_SIGNATURE');
  }

  if (version.stage === 'placed' || version.stage === 'packaged' || version.stage === 'submitted') {
    if (!version.placement) v.push('PLACED_WITHOUT_PLACEMENT');
  }

  if (version.stage === 'packaged' || version.stage === 'submitted') {
    if (!version.export?.md5 || !version.export?.sha256) v.push('EXPORTED_WITHOUT_HASHES');
  }

  // Each facet must have exactly ONE source system. Two systems both claiming the
  // same facet (e.g. concept2cure_artifacts AND unified_documents both providing
  // 'artifact') is exactly the duplicated-document problem this model prevents.
  const seenRoles = new Set<DocumentFacetKind>();
  for (const ref of doc.sourceRefs) {
    if (seenRoles.has(ref.role)) v.push('DUPLICATE_SOURCE_ROLE');
    seenRoles.add(ref.role);
  }

  return v;
}

// ─── Facet → subsystem convergence map ────────────────────────────────────────

/**
 * The single, reviewable statement of which existing, blessed subsystem backs
 * each facet. New code binds HERE instead of minting a new store. These
 * authorities follow RECONCILE.md §6 (2026-07-29), which rules `submissions` /
 * `submission_leaves` the canonical submission core, `unified_documents` the
 * governed-workflow extend target, and `audit_logs` (via auditService) the one
 * tamper-evident audit trail. It supersedes the older
 * docs/architecture/CANONICAL_AUTHORITIES_AND_BOUNDARIES.md (2026-04-04), which
 * had named concept2cure_artifacts the identity authority; here artifacts are the
 * pre-promotion DRAFT facet only.
 *
 * The four load-bearing join points a spine orchestrator wires (all already exist
 * as concrete functions — do not reimplement):
 *   1. approval  → ModuleIntegrationService.registerDocument (atomic unified_doc +
 *                  version + module_doc + audit) and a Part 11 electronic_signatures row.
 *   2. placement → submission-service.upsertLeaf writes a submission_leaf on approval,
 *                  so an authored doc becomes a placed leaf (today this is not automatic).
 *   3. one placement notion → reconcile module_documents and artifacts.ctdSection onto
 *                  submission_leaves' polymorphic (documentTable, documentId) ref.
 *   4. audit     → auditService.logAction is the single authority (sha256-chained + HMAC).
 */
export const FACET_SOURCE: Record<DocumentFacetKind, string> = {
  authoring: 'coauthor_documents (canonical eCTD authoring doc) + authoring sections',
  artifact: 'concept2cure_artifacts (AI draft/scratch, pre-promotion)',
  placement: 'submission_leaves (polymorphic documentTable/documentId; canonical per RECONCILE.md)',
  review: 'workflow_* review (comments / suggestions / compliance score)',
  approval: 'unified_documents workflow + electronic_signatures (server/services/part11)',
  export: 'server/services/ectd assemble/package-from-core (eCTD leaf; md5 + sha256)',
  audit: 'audit_logs via server/services/auditService.logAction (sha256-chained, HMAC-sealed)',
};
