import type { Request, Response } from 'express';
import { db } from '../../db';
import { regulatoryClaims } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logCerv2AuditEvent } from '../../cer2v/audit';

const getTenantKey = (req: Request, programId?: string) => {
  const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
  return `org-${organizationId}-program-${programId || 'default'}`;
};

const mapClaimRow = (claim: any, index = 0) => ({
  id: `claim-${claim.claimId || index}`,
  text: claim.proposedClaim,
  type: claim.claimType || 'regulatory',
  risk: claim.riskLevel || 'medium',
  status: claim.status || 'pending',
  strength: claim.strengthScore ? Math.round(claim.strengthScore * 100) : 0,
  linkedEvidence: Array.isArray(claim.evidenceAvailable) ? claim.evidenceAvailable.length : 0,
  evidenceIds: Array.isArray(claim.evidenceAvailable) ? claim.evidenceAvailable : [],
});

export default async function handler(req: Request, res: Response) {
  try {
    const { programId, text, type, risk, status } = req.body || {};
    if (!text) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    if (!db || !programId) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    await db.insert(regulatoryClaims).values({
      submissionId: programId,
      proposedClaim: text,
      claimType: type || 'regulatory',
      riskLevel: risk || 'medium',
      status: status || 'pending',
      evidenceAvailable: [],
    });

    await logCerv2AuditEvent(db, req, {
      programId,
      action: 'claim_created',
      entityType: 'claim',
      entityId: text,
      diffSummary: `Created claim: ${text}`,
    });

    const rows = await db
      .select()
      .from(regulatoryClaims)
      .where(eq(regulatoryClaims.submissionId, programId))
      .limit(50);

    const claims = rows.map(mapClaimRow);
    return res.json({ success: true, claims });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to create claim',
    });
  }
}
