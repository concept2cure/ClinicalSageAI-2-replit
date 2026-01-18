import type { Request, Response } from 'express';
import { db } from '../../db';
import { cerv2Evidence } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { buildWorkbenchDataFromDb } from '../../cer2v/workbench-db';
import { logCerv2AuditEvent } from '../../cer2v/audit';

const getOrgId = (req: Request) =>
  Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);

export default async function handler(req: Request, res: Response) {
  try {
    const evidenceId = req.params?.id;
    const { programId, name, evidenceType, status, owner, hash, tags } = req.body || {};
    if (!evidenceId || !programId) {
      return res.status(400).json({ success: false, error: 'evidence id and programId are required' });
    }

    if (!db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const organizationId = getOrgId(req);
    await db
      .update(cerv2Evidence)
      .set({
        ...(name ? { name } : {}),
        ...(evidenceType ? { evidenceType } : {}),
        ...(status ? { status } : {}),
        ...(owner ? { owner } : {}),
        ...(hash ? { hash } : {}),
        ...(Array.isArray(tags) ? { tags } : {}),
        ...(status === 'archived' ? { archivedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cerv2Evidence.organizationId, organizationId),
          eq(cerv2Evidence.programId, programId),
          eq(cerv2Evidence.evidenceId, evidenceId)
        )
      );

    await logCerv2AuditEvent(db, req, {
      programId,
      action: 'evidence_updated',
      entityType: 'evidence',
      entityId: evidenceId,
      diffSummary: `Updated evidence ${evidenceId}`,
      metadata: { status, evidenceType, owner },
    });

    const data = await buildWorkbenchDataFromDb(db, organizationId, programId, {
      evidence: [],
      claims: [],
      standards: [],
      outcomes: [],
    });
    return res.json({ success: true, ...data });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to update evidence',
    });
  }
}
