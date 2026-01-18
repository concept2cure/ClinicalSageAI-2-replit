import type { Request, Response } from 'express';
import { logCerv2AuditEvent } from '../../cer2v/audit';
import { db } from '../../db';
import { cerv2Standards } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

const getTenantKey = (req: Request, programId?: string) => {
  const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
  return `org-${organizationId}-program-${programId || 'default'}`;
};

export default async function handler(req: Request, res: Response) {
  try {
    const standardId = req.params?.id;
    const { programId, name, requirement, status, owner } = req.body || {};
    if (!standardId) {
      return res.status(400).json({ success: false, error: 'standard id is required' });
    }
    if (!db || !programId) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);

    await db
      .update(cerv2Standards)
      .set({
        ...(name ? { name } : {}),
        ...(requirement ? { requirement } : {}),
        ...(status ? { status } : {}),
        ...(owner ? { owner } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cerv2Standards.organizationId, organizationId),
          eq(cerv2Standards.programId, programId),
          eq(cerv2Standards.standardId, standardId)
        )
      );

    await logCerv2AuditEvent(db, req, {
      programId,
      action: 'standard_updated',
      entityType: 'standard',
      entityId: standardId,
      diffSummary: `Updated standard ${standardId}`,
      metadata: { status, owner },
    });

    const [updated] = await db
      .select()
      .from(cerv2Standards)
      .where(
        and(
          eq(cerv2Standards.organizationId, organizationId),
          eq(cerv2Standards.programId, programId),
          eq(cerv2Standards.standardId, standardId)
        )
      )
      .limit(1);

    return res.json({ success: true, standard: updated || null });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to update standard',
    });
  }
}
