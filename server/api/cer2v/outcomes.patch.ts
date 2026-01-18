import type { Request, Response } from 'express';
import { cerv2Outcomes } from '@shared/schema';
import { db } from '../../db';
import { and, eq } from 'drizzle-orm';

const getTenantKey = (req: Request, programId?: string) => {
  const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
  return `org-${organizationId}-program-${programId || 'default'}`;
};

export default async function handler(req: Request, res: Response) {
  try {
    const outcomeId = req.params?.id;
    const { programId, name, timepoint, comparator, confidence, status } = req.body || {};
    if (!outcomeId) {
      return res.status(400).json({ success: false, error: 'outcome id is required' });
    }
    if (!db || !programId) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);

    await db
      .update(cerv2Outcomes)
      .set({
        ...(name ? { name } : {}),
        ...(timepoint ? { timepoint } : {}),
        ...(comparator ? { comparator } : {}),
        ...(confidence ? { confidence } : {}),
        ...(status ? { status } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cerv2Outcomes.organizationId, organizationId),
          eq(cerv2Outcomes.programId, programId),
          eq(cerv2Outcomes.outcomeId, outcomeId)
        )
      );

    const [updated] = await db
      .select()
      .from(cerv2Outcomes)
      .where(
        and(
          eq(cerv2Outcomes.organizationId, organizationId),
          eq(cerv2Outcomes.programId, programId),
          eq(cerv2Outcomes.outcomeId, outcomeId)
        )
      )
      .limit(1);

    return res.json({ success: true, outcome: updated || null });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to update outcome',
    });
  }
}
