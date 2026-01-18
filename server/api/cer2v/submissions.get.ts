import type { Request, Response } from 'express';
import { listExportRecords } from '../../cer2v/submissions-store';

const getOrgId = (req: Request) =>
  Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);

export default async function handler(req: Request, res: Response) {
  try {
    const programId = String(req.query?.programId || 'default');
    const records = listExportRecords(getOrgId(req), programId);
    return res.json({ success: true, records });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load submissions history',
    });
  }
}
