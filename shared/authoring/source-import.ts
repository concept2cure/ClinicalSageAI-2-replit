/** The existing editor's exact, server-verified source working copy contract. */
export type BinaryImportSource =
  | { kind: 'vault'; documentId: string }
  | { kind: 'data-room'; sourceId: number };

export type WorkflowImportSource =
  | { kind: 'protocol'; documentId: number }
  | { kind: 'csr'; jobId: number; sectionNumbers?: string[] }
  | { kind: 'ivd-assessment'; documentId: string }
  | { kind: 'ivd-document'; documentId: string };

export type AuthoringImportSource = BinaryImportSource | WorkflowImportSource;

export interface BinaryImportOrigin {
  kind: BinaryImportSource['kind'];
  id: string;
  programId: string;
  title: string;
  fileName: string;
  mimeType: string;
  sha256: string;
  documentType: string | null;
  sectionCode: string | null;
  conversion: 'docx-structure' | 'extracted-text';
}

export interface WorkflowSectionOrigin {
  code: string;
  sourceRowId: string;
  contentSha256: string;
  originalAuthorship: 'machine' | 'template' | 'unknown';
  model: string | null;
  modelEvidence: 'unrecorded' | 'recorded-name-only';
}

export interface WorkflowImportOrigin {
  kind: WorkflowImportSource['kind'];
  id: string;
  programId: string;
  title: string;
  documentType: null;
  sectionCode: null;
  fingerprint: string;
  selection: WorkflowImportSource;
  gaps: string[];
  version: string | null;
  conversion: 'protocol-structure' | 'ich-e3-sections' | 'ivd-assessment-snapshot' | 'ivd-document-snapshot';
  sourceScope: { level: 'organization' | 'program' | 'project'; programId: string | null; projectId: number | null };
  association: { mode: 'recorded' | 'explicit'; reason: string | null };
  sectionOrigins: WorkflowSectionOrigin[];
}

export type AuthoringImportOrigin = BinaryImportOrigin | WorkflowImportOrigin;

export interface WorkflowImportAssociation {
  mode: 'recorded' | 'explicit';
  required: boolean;
  reasonRequired: boolean;
  sourceProgramId: string | null;
  sourceProjectId: number | null;
  targetProgramId: string;
}

export interface AuthoringSourceImportPreviewData {
  preview: true;
  origin: WorkflowImportOrigin;
  fingerprint: string;
  sections: Array<{ code: string; title: string; contentSha256: string }>;
  gaps: string[];
  warnings: string[];
  target: { programId: string; projectId: number };
  association: WorkflowImportAssociation;
}

export function isWorkflowSourceKind(kind: unknown): kind is WorkflowImportSource['kind'] {
  return kind === 'protocol' || kind === 'csr' || kind === 'ivd-assessment' || kind === 'ivd-document';
}
export const WORKFLOW_SOURCE_LABELS: Readonly<Record<WorkflowImportSource['kind'], string>> = {
  protocol: 'protocol', csr: 'CSR', 'ivd-assessment': 'IVD assessment', 'ivd-document': 'IVD generated document',
};

export function isWorkflowImportOrigin(origin: AuthoringImportOrigin): origin is WorkflowImportOrigin {
  return isWorkflowSourceKind(origin.kind);
}

export interface AuthoringSourceImportData {
  doc: Record<string, unknown> & { id: string; title: string };
  sections: Record<string, unknown>[];
  origin: AuthoringImportOrigin;
  warnings: string[];
  reused: boolean;
}
