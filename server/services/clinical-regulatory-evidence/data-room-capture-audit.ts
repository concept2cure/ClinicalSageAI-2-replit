/**
 * The data room's capture record in the audit chain (VR-16b, rows D2 and D5;
 * plan critique 14).
 *
 * A file captured into a project's data room was recorded in
 * `cre_evidence_sources`, but nothing said who captured it, and neither the
 * capture nor a re-capture's retirement of its predecessor reached the
 * per-tenant audit chain. "Who put this file in the room, and when was it
 * replaced" had no answer an inspector could verify.
 *
 * Both rows are written by the source writers (evidence-spine.service.ts), on
 * the same client and in the same transaction as the INSERT or the
 * retirement, so a capture without its row, or a row without its capture,
 * cannot commit. Only `client_document` sources are data-room captures; an
 * ingested CRL or a CSR projection is a system record and writes neither.
 */
import { writeChainedAuditRow } from '../auditService';

type Queryable = { query: (text: string, params?: unknown[]) => Promise<unknown> };

/**
 * Who captured a file: the writer's explicit `createdBy`, else the session user
 * the capture routes record in provenance (`uploadedByUserId` for a chat
 * capture, `adoptedByUserId` for an adopt). Both are written by the route
 * from the authenticated session, never from the request body. Null when no
 * person is known: recorded as such, never guessed.
 */
export function captureActor(createdBy: unknown, provenance: Record<string, unknown> | null | undefined): number | null {
  const raw = createdBy ?? provenance?.uploadedByUserId ?? provenance?.adoptedByUserId;
  const n = Number(raw);
  return raw != null && Number.isSafeInteger(n) && n > 0 ? n : null;
}

export interface CapturedSource {
  id: number;
  title: string | null;
  checksum: string | null;
  clientProgramId: string | null;
  clientWorkspaceId: number | null;
}

/** data_room.capture: one row per captured file, naming who, which bytes and which project. */
export async function recordCapture(
  q: Queryable,
  organizationId: number,
  source: CapturedSource,
  by: { actorId: number | null; provenance: Record<string, unknown> | null | undefined; supersedes: number | null },
): Promise<void> {
  const { actorId, provenance, supersedes } = by;
  await writeChainedAuditRow(q, {
    tenantId: organizationId,
    userId: actorId ?? undefined,
    action: 'data_room.capture',
    resourceType: 'cre_evidence_source',
    resourceId: String(source.id),
    details: {
      title: source.title,
      checksum: source.checksum,
      clientProgramId: source.clientProgramId,
      clientWorkspaceId: source.clientWorkspaceId,
      origin: typeof provenance?.origin === 'string' ? provenance.origin : null,
      fileUploadId: typeof provenance?.fileUploadId === 'string' ? provenance.fileUploadId : null,
      supersedes,
      capturedBy: actorId,
    },
  });
}

/** data_room.supersede: the retired capture, naming the capture that replaced it. */
export async function recordSupersession(
  q: Queryable,
  organizationId: number,
  retiredId: number,
  successor: CapturedSource,
  actorId: number | null,
): Promise<void> {
  await writeChainedAuditRow(q, {
    tenantId: organizationId,
    userId: actorId ?? undefined,
    action: 'data_room.supersede',
    resourceType: 'cre_evidence_source',
    resourceId: String(retiredId),
    details: { supersededBy: successor.id, successorChecksum: successor.checksum, clientProgramId: successor.clientProgramId },
  });
}
