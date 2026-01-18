import type { Request, Response } from 'express';
import { db } from '../../db';
import { cerv2Evidence } from '@shared/schema';
import { logCerv2AuditEvent } from '../../cer2v/audit';
import { buildWorkbenchDataFromDb } from '../../cer2v/workbench-db';
import { and, eq } from 'drizzle-orm';

const getTenantKey = (req: Request, programId?: string) => {
  const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
  return `org-${organizationId}-program-${programId || 'default'}`;
};

export default async function handler(req: Request, res: Response) {
  try {
    const { programId, evidenceId, name, evidenceType, status, hash, owner } = req.body || {};
    if (!programId || !evidenceId || !name || !evidenceType) {
      return res.status(400).json({
        success: false,
        error: 'programId, evidenceId, name, and evidenceType are required',
      });
    }

    if (!db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
    await db
      .insert(cerv2Evidence)
      .values({
        organizationId,
        programId,
        evidenceId,
        name,
        evidenceType,
        status: status || 'inbox',
        hash: hash || null,
        owner: owner || null,
      })
      .onConflictDoNothing();

    await logCerv2AuditEvent(db, req, {
      programId,
      action: 'evidence_created',
      entityType: 'evidence',
      entityId: evidenceId,
      diffSummary: `Created evidence ${name}`,
    });

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
      error: error?.message || 'Failed to create evidence',
    });
  }
}
