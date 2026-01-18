import type { Request, Response } from 'express';
import { createEmptyWorkbenchData } from '../../cer2v/workbench-store';
import { runRegulatoryChecks } from '../../cer2v/regulatory-checks';
import { db } from '../../db';
import { buildWorkbenchDataFromDb } from '../../cer2v/workbench-db';

const getTenantKey = (req: Request, programId?: string) => {
  const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
  return `org-${organizationId}-program-${programId || 'default'}`;
};

export default async function handler(req: Request, res: Response) {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }
    const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
    const programId = String(req.body?.programId || 'default');
    const data = await buildWorkbenchDataFromDb(
      db,
      organizationId,
      programId,
      createEmptyWorkbenchData()
    );
    const checks = runRegulatoryChecks(data);
    const blocking = checks.filter(item => item.status === 'fail' && item.severity === 'high').length;
    return res.json({ success: true, checks, blocking });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to run preflight checks',
    });
  }
}
