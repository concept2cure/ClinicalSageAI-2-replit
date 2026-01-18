import type { Request, Response } from 'express';
import { db } from '../../db';
import { regulatoryClaims } from '@shared/schema';
import { createEmptyWorkbenchData } from '../../cer2v/workbench-store';
import { eq } from 'drizzle-orm';
import { buildWorkbenchDataFromDb } from '../../cer2v/workbench-db';

const getTenantKey = (req: Request) => {
  const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
  const programId = String(req.query?.programId || 'default');
  return `org-${organizationId}-program-${programId}`;
};

export default async function handler(req: Request, res: Response) {
  try {
    const key = getTenantKey(req);
    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Database unavailable',
      });
    }

    const programId = String(req.query?.programId || 'default');
    const fallback = createEmptyWorkbenchData();
    const data = await buildWorkbenchDataFromDb(
      db,
      Number(req.user?.organizationId || req.tenantContext?.organizationId || 1),
      programId,
      fallback
    );

    return res.json({ success: true, ...data });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load workbench data',
    });
  }
}
