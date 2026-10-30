/** The existing editor's exact, server-verified source working copy contract. */
import type { CsrNarrativeReference } from '../csr-narrative-reference';
export type BinaryImportSource =
  | { kind: 'vault'; documentId: string }
  | { kind: 'data-room'; sourceId: number };

export type WorkflowImportSource =
  | { kind: 'protocol'; documentId: number }
  | { kind: 'csr'; jobId: number; sectionNumbers?: string[] }
  | { kind: 'study-design-crf'; studyId: string }
  | { kind: 'agency-response'; eventId: string; questionId: number }
  | { kind: 'ivd-assessment'; documentId: string }
  | { kind: 'ivd-document'; documentId: string };

export type AuthoringImportSource = BinaryImportSource | WorkflowImportSource;

export const AGENCY_CONTEXT_SECTION_CODE = 'agency.context';
export const AGENCY_RESPONSE_SECTION_CODE = 'agency.response';

/** Exact PRM study identities are bounded strings, rather than UUIDs. */
export function studyDesignImportId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!id || id.length > 100 || Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
  return id;
}

/** Exact source identity; event IDs are recorded text rather than necessarily UUIDs. */
export function agencyResponseImportId(eventId: unknown, questionId: unknown): string | null {
  if (typeof eventId !== 'string' || !eventId || eventId.trim() !== eventId || eventId.length > 200
    || Array.from(eventId).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    || !Number.isSafeInteger(questionId) || Number(questionId) <= 0 || Number(questionId) > 2_147_483_647) return null;
  return `${eventId}:${questionId}`;
}

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
  /** CSR slice 5 (2026-10-30): a CSR section's claim receipts, bound to the stored copy's
   * hash and the retained run's evidence digest. Parsed, fail-closed, by
   * server/services/csr/csr-claim-receipts.ts; absent when the section has none. */
  csrEvidence?: Readonly<Record<string, unknown>>;
  /** 2026-10-30: §14.3.3 imported by reference to the build's narrative store, not as
   * inline text (shared/csr-narrative-reference.ts). The section holds the opening only. */
  narrativeReference?: CsrNarrativeReference;
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
  conversion: 'protocol-structure' | 'ich-e3-sections' | 'ivd-assessment-snapshot' | 'ivd-document-snapshot' | 'study-design-crf-projection' | 'agency-response-snapshot';
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
  return kind === 'protocol' || kind === 'csr' || kind === 'ivd-assessment' || kind === 'ivd-document' || kind === 'study-design-crf' || kind === 'agency-response';
}
export const WORKFLOW_SOURCE_LABELS: Readonly<Record<WorkflowImportSource['kind'], string>> = {
  protocol: 'protocol', csr: 'CSR', 'ivd-assessment': 'IVD assessment', 'ivd-document': 'IVD generated document', 'study-design-crf': 'blank CRF shell',
  'agency-response': 'agency response',
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
