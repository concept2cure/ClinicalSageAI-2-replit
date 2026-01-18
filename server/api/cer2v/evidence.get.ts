import type { Request, Response } from 'express';
import { db } from '../../db';
import { cerv2Evidence, cerv2EvidenceLinks } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

const getOrgId = (req: Request) =>
  Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);

export default async function handler(req: Request, res: Response) {
  try {
    const programId = String(req.query?.programId || 'default');
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const organizationId = getOrgId(req);
    const evidenceRows = await db
      .select()
      .from(cerv2Evidence)
      .where(and(eq(cerv2Evidence.organizationId, organizationId), eq(cerv2Evidence.programId, programId)));

    const links = await db
      .select()
      .from(cerv2EvidenceLinks)
      .where(and(eq(cerv2EvidenceLinks.organizationId, organizationId), eq(cerv2EvidenceLinks.programId, programId)));

    const linkedEvidenceIds = new Set(links.map(link => String(link.evidenceId)));

    const evidence = evidenceRows.map(row => ({
      id: String(row.evidenceId),
      name: row.name,
      type: row.evidenceType,
      status: row.status,
      hash: row.hash || '',
      linkedClaims: 0,
      linkedStandards: 0,
      linkedOutcomes: 0,
      uploadedAt: row.uploadedAt ? new Date(row.uploadedAt).toISOString().split('T')[0] : '',
      owner: row.owner || 'Reg Affairs',
      isLinked: linkedEvidenceIds.has(String(row.evidenceId)),
    }));

    return res.json({ success: true, evidence });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load evidence',
    });
  }
}
