import crypto from 'node:crypto';
import { registerArtifactWithGovernance } from '../compute/artifactWriteback';
import auditService from '../auditService';

export type ExportSourceType =
  | 'export_pdf'
  | 'export_docx'
  | 'export_zip'
  | 'export_estar_zip'
  // The official FDA eSTAR interactive PDF (the artifact CDRH ingests), as
  // opposed to `export_estar_zip` which is a draft ZIP of section PDFs. Only
  // ever emitted when a real filled official eSTAR PDF was produced.
  | 'export_estar_pdf';

export interface GovernedExportInput {
  organizationId: number;
  projectId: number;
  userId: number;
  title: string;
  contentForArtifact: string;
  sourceType: ExportSourceType;
  ctdSection?: string;
  suggestedPlacement?: string;
  backendRoute: string;
  binaryOutput: Buffer;
  mimeType: string;
  filename: string;
  metadata?: Record<string, unknown>;
}

const DEFAULT_MAX_GOVERNED_EXPORT_BYTES = 25 * 1024 * 1024; // 25 MiB

function getMaxGovernedExportBytes(): number {
  const raw = process.env.GOVERNED_EXPORT_MAX_BYTES;
  if (!raw) return DEFAULT_MAX_GOVERNED_EXPORT_BYTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_GOVERNED_EXPORT_BYTES;
  return Math.floor(parsed);
}

export interface GovernedExportConsequence {
  governed: boolean;
  source_type: ExportSourceType;
  artifact_id: string;
  artifact_version: number;
  artifact_status: string;
  placement_state: 'placed' | 'unplaced';
  suggested_placement: string | null;
  provenance_ref: string;
  audit_ref: string;
  // SHA-256 over the exact bytes returned in `downloadable_output_ref.data`
  // (the delivered PDF/DOCX/ZIP). This — NOT the source-content hash the
  // artifact record stores in `content_hash` — is what a recipient checks the
  // delivered file against, mirroring the `sha256` returned by the sibling
  // respondAuditedUnplaced delivery path.
  delivered_artifact_sha256: string;
  downloadable_output_ref: {
    encoding: 'base64';
    mime_type: string;
    filename: string;
    data: string;
  };
}

function assertValidGovernedExportInput(input: GovernedExportInput): void {
  if (!Number.isFinite(input.organizationId) || input.organizationId <= 0) {
    throw new Error('INVALID_GOVERNED_EXPORT_INPUT: organizationId must be a positive number');
  }
  if (!Number.isFinite(input.projectId) || input.projectId <= 0) {
    throw new Error('INVALID_GOVERNED_EXPORT_INPUT: projectId must be a positive number');
  }
  if (!Number.isFinite(input.userId) || input.userId <= 0) {
    throw new Error('INVALID_GOVERNED_EXPORT_INPUT: userId must be a positive number');
  }
  if (!input.title?.trim()) {
    throw new Error('INVALID_GOVERNED_EXPORT_INPUT: title is required');
  }
  if (!input.backendRoute?.trim()) {
    throw new Error('INVALID_GOVERNED_EXPORT_INPUT: backendRoute is required');
  }
  if (!input.mimeType?.trim()) {
    throw new Error('INVALID_GOVERNED_EXPORT_INPUT: mimeType is required');
  }
  if (!input.filename?.trim()) {
    throw new Error('INVALID_GOVERNED_EXPORT_INPUT: filename is required');
  }
  if (!Buffer.isBuffer(input.binaryOutput) || input.binaryOutput.length === 0) {
    throw new Error('INVALID_GOVERNED_EXPORT_INPUT: binaryOutput must be a non-empty Buffer');
  }
  const maxBytes = getMaxGovernedExportBytes();
  if (input.binaryOutput.length > maxBytes) {
    throw new Error(
      `INVALID_GOVERNED_EXPORT_INPUT: binaryOutput exceeds max size (${maxBytes} bytes)`
    );
  }
}

export async function createGovernedExportConsequence(
  input: GovernedExportInput
): Promise<GovernedExportConsequence> {
  assertValidGovernedExportInput(input);

  // Hash the actually-delivered bytes (the binary PDF/DOCX/ZIP handed back to
  // the user), NOT the JSON source content. registerArtifactWithGovernance
  // hashes input.content into the artifact record's content_hash for source
  // provenance; that hash does not cover the delivered file, so on its own a
  // recipient cannot verify the download against the governed record. Compute
  // the delivered-artifact hash here — consistent with respondAuditedUnplaced,
  // which does sha256(buffer) over the real delivered bytes — and persist it
  // alongside the source provenance (in the artifact/provenance/audit metadata)
  // as well as returning it to the caller.
  const deliveredArtifactSha256 = crypto
    .createHash('sha256')
    .update(input.binaryOutput)
    .digest('hex');

  const consequence = await registerArtifactWithGovernance({
    organizationId: input.organizationId,
    projectId: input.projectId,
    userId: input.userId,
    title: input.title,
    content: input.contentForArtifact,
    ctdSection: input.ctdSection,
    sourceJobId: `${input.sourceType}_${Date.now()}`,
    surfaceKey: input.sourceType,
    actorName: 'Export Governance Plane',
    backendRoute: input.backendRoute,
    backendService: 'export-governance',
    sourceDescription: `Governed export via ${input.sourceType}`,
    auditAction: 'EXPORT_GENERATED',
    metadata: {
      source: input.sourceType,
      ...input.metadata,
      // Computed hash is authoritative — keep it last so caller metadata cannot
      // shadow the delivered-artifact integrity hash.
      deliveredArtifactSha256,
    },
    auditMetadata: {
      sourceType: input.sourceType,
      filename: input.filename,
      mimeType: input.mimeType,
      ...input.metadata,
      deliveredArtifactSha256,
    },
  });

  return {
    governed: true,
    source_type: input.sourceType,
    artifact_id: consequence.artifactId,
    artifact_version: consequence.version,
    artifact_status: consequence.artifactStatus,
    placement_state: consequence.placementState,
    suggested_placement: input.suggestedPlacement ?? null,
    provenance_ref: consequence.provenanceEventId,
    audit_ref: consequence.auditId,
    delivered_artifact_sha256: deliveredArtifactSha256,
    downloadable_output_ref: {
      encoding: 'base64',
      mime_type: input.mimeType,
      filename: input.filename,
      data: input.binaryOutput.toString('base64'),
    },
  };
}

// ── Audited-unplaced delivery ────────────────────────────────────────────────
//
// A program-spine (uuid) program with no PM-spine `projects` anchor has nowhere
// in the artifact registry to place an export (concept2cure_artifacts.project_id
// FK → projects.id). The honest degradation is to deliver the file and
// audit-log the export with the SHA-256 of the delivered bytes, saying plainly
// that registry placement is pending rather than pretending it happened.
//
// This contract used to be copied inline in cerv2-export-routes.ts
// (respondAuditedUnplaced) and twice in 510k-estar-routes.ts (/build and
// /official). One implementation lives here now and every route delivers
// through it; a route must never grow its own copy.

export interface AuditedUnplacedExportInput {
  organizationId: number;
  userId: number;
  sourceType: ExportSourceType;
  backendRoute: string;
  /** Audit resource anchor (e.g. 'cerv2_export', 'estar_content_package', 'device_technical_file'). */
  resourceType: string;
  /** The program uuid when one is known, else the caller's best identifier. */
  resourceId: string;
  /** Echoed in the body as `program_id` (null when the export is not program-scoped). */
  programUuid: string | null;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  metadata?: Record<string, unknown>;
}

export interface AuditedUnplacedExport {
  governed: false;
  audited: true;
  source_type: ExportSourceType;
  artifact_id: null;
  artifact_registry: string;
  program_id: string | null;
  /** SHA-256 over the exact delivered bytes (same meaning as delivered_artifact_sha256). */
  sha256: string;
  downloadable_output_ref: {
    encoding: 'base64';
    mime_type: string;
    filename: string;
    data: string;
  };
}

export const UNPLACED_ARTIFACT_REGISTRY_NOTE =
  'unplaced — artifact registry requires a PM-spine project row; ' +
  'export is audit-logged with its SHA-256 (pending document-identity contract)';

/**
 * Deliver an export that the artifact registry cannot place: write the
 * EXPORT_GENERATED audit row (with the delivered-bytes SHA-256 and the
 * `unplaced_pending_document_identity_contract` marker) and return the
 * response body the caller sends verbatim. The audit write is awaited and its
 * failure propagates — an export must never be delivered un-audited.
 */
export async function createAuditedUnplacedExport(
  input: AuditedUnplacedExportInput,
): Promise<AuditedUnplacedExport> {
  if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
    throw new Error('INVALID_GOVERNED_EXPORT_INPUT: buffer must be a non-empty Buffer');
  }
  const sha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');
  await auditService.logAction({
    organizationId: input.organizationId,
    userId: input.userId,
    action: 'EXPORT_GENERATED',
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    details: {
      backendRoute: input.backendRoute,
      sourceType: input.sourceType,
      filename: input.filename,
      sha256,
      artifactRegistry: 'unplaced_pending_document_identity_contract',
      ...(input.metadata ?? {}),
    },
  });

  return {
    governed: false,
    audited: true,
    source_type: input.sourceType,
    artifact_id: null,
    artifact_registry: UNPLACED_ARTIFACT_REGISTRY_NOTE,
    program_id: input.programUuid,
    sha256,
    downloadable_output_ref: {
      encoding: 'base64',
      mime_type: input.mimeType,
      filename: input.filename,
      data: input.buffer.toString('base64'),
    },
  };
}
