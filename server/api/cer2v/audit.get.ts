import type { Request, Response } from 'express';
import { db } from '../../db';
import { cerv2AuditEvents } from '@shared/schema';
import { desc, eq } from 'drizzle-orm';

const getOrgId = (req: Request) =>
  Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);

export default async function handler(req: Request, res: Response) {
  try {
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database unavailable' });
    }
    const programId = String(req.query?.programId || 'default');
    const rows = await db
      .select()
      .from(cerv2AuditEvents)
      .where(eq(cerv2AuditEvents.organizationId, getOrgId(req)))
      .where(eq(cerv2AuditEvents.programId, programId))
      .orderBy(desc(cerv2AuditEvents.createdAt))
      .limit(100);

    return res.json({ success: true, events: rows });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load audit events',
    });
  }
}
