import type { Request, Response } from 'express';
import { db } from '../../db';
import { regulatoryClaims } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logCerv2AuditEvent } from '../../cer2v/audit';

const getTenantKey = (req: Request, programId?: string) => {
  const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
  return `org-${organizationId}-program-${programId || 'default'}`;
};

const parseClaimId = (claimId: string) => {
  if (!claimId) return null;
  if (claimId.startsWith('claim-')) {
    const numeric = Number(claimId.replace('claim-', ''));
    return Number.isFinite(numeric) ? numeric : null;
  }
  const numeric = Number(claimId);
  return Number.isFinite(numeric) ? numeric : null;
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
    const claimId = req.params?.id;
    const { programId, text, type, risk, status, strength } = req.body || {};

    if (!claimId) {
      return res.status(400).json({ success: false, error: 'claim id is required' });
    }

    if (!db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const numericId = parseClaimId(claimId);
    if (numericId) {
      await db
        .update(regulatoryClaims)
        .set({
          ...(text ? { proposedClaim: text } : {}),
          ...(type ? { claimType: type } : {}),
          ...(risk ? { riskLevel: risk } : {}),
          ...(status ? { status } : {}),
          ...(typeof strength === 'number'
            ? {
                strengthScore: Math.max(0, Math.min(1, strength / 100)),
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(regulatoryClaims.claimId, numericId));

      if (programId) {
        await logCerv2AuditEvent(db, req, {
          programId,
          action: 'claim_updated',
          entityType: 'claim',
          entityId: claimId,
          diffSummary: `Updated claim ${claimId}`,
          metadata: { status, risk, strength },
        });
      }
    }

    if (programId) {
      const rows = await db
        .select()
        .from(regulatoryClaims)
        .where(eq(regulatoryClaims.submissionId, programId))
        .limit(50);
      const claims = rows.map(mapClaimRow);
      return res.json({ success: true, claims });
    }

    return res.json({ success: true, claims: [] });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to update claim',
    });
  }
}
