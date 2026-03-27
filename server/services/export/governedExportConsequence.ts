import { registerArtifactWithGovernance } from '../compute/artifactWriteback';

export type ExportSourceType = 'export_pdf' | 'export_docx' | 'export_estar_zip';

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
  downloadable_output_ref: {
    encoding: 'base64';
    mime_type: string;
    filename: string;
    data: string;
  };
}

export async function createGovernedExportConsequence(
  input: GovernedExportInput
): Promise<GovernedExportConsequence> {
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
    },
    auditMetadata: {
      sourceType: input.sourceType,
      filename: input.filename,
      mimeType: input.mimeType,
      ...input.metadata,
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
    downloadable_output_ref: {
      encoding: 'base64',
      mime_type: input.mimeType,
      filename: input.filename,
      data: input.binaryOutput.toString('base64'),
    },
  };
}
