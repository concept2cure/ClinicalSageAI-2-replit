import type { Request, Response } from 'express';
import { cerv2Outcomes } from '@shared/schema';
import crypto from 'node:crypto';
import { db } from '../../db';

const getTenantKey = (req: Request, programId?: string) => {
  const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
  return `org-${organizationId}-program-${programId || 'default'}`;
};

export default async function handler(req: Request, res: Response) {
  try {
    const { programId, name, timepoint, comparator, confidence, status } = req.body || {};
    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    if (!db || !programId) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
    const outcomeId = `out-${crypto.randomUUID()}`;

    await db
      .insert(cerv2Outcomes)
      .values({
        organizationId,
        programId,
        outcomeId,
        name,
        timepoint: timepoint || null,
        comparator: comparator || null,
        confidence: confidence || 'low',
        status: status || 'missing',
      })
      .onConflictDoNothing();

    return res.json({
      success: true,
      outcome: {
        id: outcomeId,
        name,
        timepoint: timepoint || 'TBD',
        comparator: comparator || 'TBD',
        confidence: confidence || 'low',
        status: status || 'missing',
        linkedEvidence: 0,
        evidenceIds: [],
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to create outcome',
    });
  }
}
