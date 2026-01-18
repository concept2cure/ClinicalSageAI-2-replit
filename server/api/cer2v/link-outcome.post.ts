import type { Request, Response } from 'express';
import { db } from '../../db';
import { cerv2EvidenceLinks } from '@shared/schema';
import { buildWorkbenchDataFromDb } from '../../cer2v/workbench-db';

const getTenantKey = (req: Request, programId?: string) => {
  const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
  return `org-${organizationId}-program-${programId || 'default'}`;
};

export default async function handler(req: Request, res: Response) {
  try {
    const outcomeId = req.params?.id;
    const { evidenceId, programId } = req.body || {};
    if (!outcomeId || !evidenceId) {
      return res.status(400).json({ success: false, error: 'outcome id and evidenceId are required' });
    }
    if (!db || !programId) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
    await db
      .insert(cerv2EvidenceLinks)
      .values({
        organizationId,
        programId,
        evidenceId,
        entityType: 'outcome',
        entityId: outcomeId,
      })
      .onConflictDoNothing();

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
      error: error?.message || 'Failed to link evidence to outcome',
    });
  }
}
