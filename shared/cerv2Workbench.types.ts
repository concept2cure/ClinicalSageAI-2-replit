/**
 * Shared type definitions for CERv2 Workbench
 * 
 * These types define the contract between frontend and backend.
 * Use these types in both client and server code to prevent drift.
 */

export interface EvidenceItem {
  id: string;
  filename: string;
  sha256: string;
  sizeBytes: number;
  kind: string; // "Clinical Study", "Literature", "Test Report", etc.
  tags: string[];
  createdAt: string; // ISO timestamp
  uploadedBy?: string;
  metadata?: Record<string, any>;
}

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  createdAt: string; // ISO timestamp
  actor?: string;
  payload: Record<string, any>;
  entityType?: string; // "CLAIM", "STANDARD", "OUTCOME", etc.
  entityId?: string;
  organizationId: string;
  programId: string;
}

export type AuditEventType =
  | 'EVIDENCE_UPLOADED'
  | 'EVIDENCE_UPDATED'
  | 'EVIDENCE_DELETED'
  | 'EVIDENCE_DOWNLOADED'
  | 'EVIDENCE_LINKED'
  | 'EVIDENCE_LINKED_BULK'
  | 'EVIDENCE_UNLINKED'
  | 'EVIDENCE_UNLINKED_BULK'
  | 'CLAIM_CREATED'
  | 'CLAIM_UPDATED'
  | 'CLAIM_DELETED'
  | 'STANDARD_CREATED'
  | 'STANDARD_UPDATED'
  | 'STANDARD_DELETED'
  | 'OUTCOME_CREATED'
  | 'OUTCOME_UPDATED'
  | 'OUTCOME_DELETED'
  | 'STATUS_UPDATED'
  | 'EXPORT_GENERATED'
  | 'EXPORT_DOWNLOADED'
  | 'IMPACT_REVIEW_REQUIRED';

export interface ExportRecord {
  id: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  evidenceSetFingerprint: string;
  coverageSnapshot?: {
    claimsCoverage: number;
    standardsCoverage: number;
    outcomesCoverage: number;
  };
  createdAt: string; // ISO timestamp
  type: 'claims-matrix' | 'standards-coverage' | 'outcomes-substantiation' | 'defense-pack';
  downloadUrl?: string;
}

export interface Paginated<T> {
  items: T[];
  nextCursor?: string | null;
  total?: number;
}

export interface ClaimItem {
  id: string;
  claimText: string;
  claimCategory: string;
  status: 'draft' | 'in-review' | 'complete' | 'needs-evidence';
  evidenceCount: number;
  coverage: number;
  createdAt: string;
}

export interface StandardItem {
  id: string;
  standardName: string;
  requirementText: string;
  status: 'draft' | 'in-review' | 'complete' | 'needs-evidence';
  evidenceCount: number;
  coverage: number;
  createdAt: string;
}

export interface OutcomeItem {
  id: string;
  outcomeName: string;
  outcomeDescription: string;
  status: 'draft' | 'in-review' | 'complete' | 'needs-evidence';
  evidenceCount: number;
  coverage: number;
  createdAt: string;
}

export interface BulkLinkRequest {
  evidenceIds: string[];
  entityType: 'CLAIM' | 'STANDARD' | 'OUTCOME';
  entityId: string;
}

export interface BulkUnlinkRequest {
  evidenceIds: string[];
  entityType?: 'CLAIM' | 'STANDARD' | 'OUTCOME';
  entityId?: string;
}

export interface StatusUpdateRequest {
  status: 'draft' | 'in-review' | 'complete' | 'needs-evidence';
  notes?: string;
}

export interface ExportPreflightResult {
  canExport: boolean;
  blockers: string[];
  warnings: string[];
  coverage: {
    claimsCoverage: number;
    standardsCoverage: number;
    outcomesCoverage: number;
  };
}

export interface ApiError {
  error: string;
  status: number;
  data?: any;
}
