import type { Request, Response } from 'express';
import { createEmptyWorkbenchData } from '../../cer2v/workbench-store';
import { computeReadiness } from '../../cer2v/readiness';
import { db } from '../../db';
import { buildWorkbenchDataFromDb } from '../../cer2v/workbench-db';

const getTenantKey = (req: Request) => {
  const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
  const programId = String(req.query?.programId || 'default');
  return `org-${organizationId}-program-${programId}`;
};

export default async function handler(req: Request, res: Response) {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
    const programId = String(req.query?.programId || 'default');
    const data = await buildWorkbenchDataFromDb(
      db,
      organizationId,
      programId,
      createEmptyWorkbenchData()
    );
    const readiness = computeReadiness(data);
    return res.json({ success: true, ...readiness });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to calculate readiness',
    });
  }
}
