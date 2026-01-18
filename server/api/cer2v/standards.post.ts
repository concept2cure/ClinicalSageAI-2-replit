import type { Request, Response } from 'express';
import { logCerv2AuditEvent } from '../../cer2v/audit';
import { db } from '../../db';
import { cerv2Standards } from '@shared/schema';
import crypto from 'node:crypto';

const getTenantKey = (req: Request, programId?: string) => {
  const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
  return `org-${organizationId}-program-${programId || 'default'}`;
};

export default async function handler(req: Request, res: Response) {
  try {
    const { programId, name, requirement, status, owner } = req.body || {};
    if (!name || !requirement) {
      return res.status(400).json({ success: false, error: 'name and requirement are required' });
    }
    if (!db || !programId) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
    const standardId = `std-${crypto.randomUUID()}`;

    await db
      .insert(cerv2Standards)
      .values({
        organizationId,
        programId,
        standardId,
        name,
        requirement,
        status: status || 'missing',
        owner: owner || null,
      })
      .onConflictDoNothing();

    await logCerv2AuditEvent(db, req, {
      programId,
      action: 'standard_created',
      entityType: 'standard',
      entityId: standardId,
      diffSummary: `Created standard: ${name}`,
    });

    return res.json({
      success: true,
      standard: {
        id: standardId,
        name,
        requirement,
        status: status || 'missing',
        owner: owner || 'Reg Affairs',
        linkedEvidence: 0,
        evidenceIds: [],
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to create standard',
    });
  }
}
