import type { Request } from 'express';
import { cerv2AuditEvents } from '@shared/schema';

export type AuditPayload = {
  programId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  diffSummary?: string;
  metadata?: any;
};

export const logCerv2AuditEvent = async (
  db: any,
  req: Request,
  payload: AuditPayload
) => {
  if (!db) return;
  const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
  const actorId = Number(req.user?.id || req.userId || 0) || null;
  await db.insert(cerv2AuditEvents).values({
    organizationId,
    programId: payload.programId,
    actorId,
    action: payload.action,
    entityType: payload.entityType || null,
    entityId: payload.entityId || null,
    diffSummary: payload.diffSummary || null,
    metadata: payload.metadata || null,
  });
};
