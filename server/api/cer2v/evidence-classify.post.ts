import type { Request, Response } from 'express';
import { db } from '../../db';
import { cerv2Evidence } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { buildWorkbenchDataFromDb } from '../../cer2v/workbench-db';

const getTenantKey = (req: Request, programId?: string) => {
  const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
  return `org-${organizationId}-program-${programId || 'default'}`;
};

export default async function handler(req: Request, res: Response) {
  try {
    const { evidenceId, type, programId } = req.body || {};
    if (!evidenceId) {
      return res.status(400).json({ success: false, error: 'evidenceId is required' });
    }
    if (!db || !programId) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
    await db
      .update(cerv2Evidence)
      .set({
        status: 'classified',
        evidenceType: type || 'clinical',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cerv2Evidence.organizationId, organizationId),
          eq(cerv2Evidence.programId, programId),
          eq(cerv2Evidence.evidenceId, evidenceId)
        )
      );

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
      error: error?.message || 'Failed to classify evidence',
    });
  }
}
