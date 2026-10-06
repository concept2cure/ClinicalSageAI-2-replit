/** Canonical, typed project file-removal contract. File retention is a separate governed process. */
export type DocumentDispositionTargetType = 'captured_source' | 'vault_document';
export type DocumentDispositionChoice = 'keep_data' | 'remove_data' | 'supersede';
export const DOCUMENT_DISPOSITION_REASON_MIN = 10;
export const DOCUMENT_DISPOSITION_REASON_MAX = 4000;
export interface DocumentDispositionTarget {
  type: DocumentDispositionTargetType;
  id: string;
  title: string;
  sha256: string;
}
export interface DocumentDispositionLinkedIds {
  capturedSourceIds: number[];
  vaultDocumentIds: string[];
  artifactIds: string[];
  uploadIds: string[];
}
export interface DocumentDispositionPreview {
  target: DocumentDispositionTarget;
  linkedIds: DocumentDispositionLinkedIds;
  counts: {
    extractedTexts: number;
    chunks: number;
    atoms: number;
    catalogValues: number;
    citations: number;
    downstreamReferences: number;
  };
  retention: { legalHolds: number; retentionUntil: string | null; physicalErasure: false };
  approvals: { active: number };
  blockers: string[];
  replacement: DocumentDispositionTarget | null;
  allowedChoices: DocumentDispositionChoice[];
  previewToken: string;
  expiresAt: string;
  currentDisposition: null | { id: string; choice: DocumentDispositionChoice; createdAt: string; replacementId: string | null };
}
export interface DocumentDispositionRequest {
  targetType: DocumentDispositionTargetType;
  targetId: string;
  choice: DocumentDispositionChoice;
  reason: string;
  previewToken: string;
  replacementId?: string;
}
export interface DocumentDispositionRecord {
  id: string;
  choice: DocumentDispositionChoice;
  target: DocumentDispositionTarget;
  linkedIds: DocumentDispositionLinkedIds;
  replacementId: string | null;
  previousDispositionId: string | null;
  createdAt: string;
  auditReceipt: { id: string; sha256Chain: string };
}
