import crypto from 'node:crypto';
import { registerArtifactWithGovernance } from '../compute/artifactWriteback';

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
