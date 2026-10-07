import type { DocumentDispositionChoice, DocumentDispositionLinkedIds, DocumentDispositionPreview, DocumentDispositionRequest, DocumentDispositionTarget } from '../../../shared/document-data-disposition';

export interface DispositionQueryable { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>; }
export interface DispositionDatabase extends DispositionQueryable { connect(): Promise<DispositionQueryable & { release(): void }>; }
export interface DispositionScope { organizationId: number; programId: string; actorId: number; orgRole?: string | null; }
export interface DispositionPreviewInput extends DispositionScope { targetType: DocumentDispositionRequest['targetType']; targetId: string; replacementId?: string; }
export interface DispositionApplyInput extends DispositionPreviewInput { choice: DocumentDispositionChoice; reason: string; previewToken: string; }
export interface DispositionAuditEntry { organizationId: number; userId: number; action: string; resourceType: string; resourceId: string; reason: string; details: Record<string, unknown>; }
export interface DispositionServiceDependencies {
  db: DispositionDatabase;
  audit(q: DispositionQueryable, entry: DispositionAuditEntry): Promise<{ id: string; sha256Chain: string }>;
  enabled(): boolean;
  tokenSecret: string;
  clock?: () => Date;
}
export interface Snapshot {
  target: DocumentDispositionTarget;
  linkedIds: DocumentDispositionLinkedIds;
  counts: DocumentDispositionPreview['counts'];
  retention: DocumentDispositionPreview['retention'];
  approvals: DocumentDispositionPreview['approvals'];
  blockers: string[];
  dataWithdrawalBlockers?: string[];
  replacement: DocumentDispositionTarget | null;
  currentDisposition: DocumentDispositionPreview['currentDisposition'];
  fingerprints: Record<string, string>;
  sequence: number;
}
export class DispositionError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'DispositionError'; }
}
export const DISPOSITION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DISPOSITION_HASH = /^[0-9a-f]{64}$/;
