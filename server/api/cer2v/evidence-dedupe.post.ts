import type { Request, Response } from 'express';
import { db } from '../../db';
import { cerv2Evidence } from '@shared/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { buildWorkbenchDataFromDb } from '../../cer2v/workbench-db';
import { logCerv2AuditEvent } from '../../cer2v/audit';

const getOrgId = (req: Request) =>
  Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);

export default async function handler(req: Request, res: Response) {
  try {
    const { programId } = req.body || {};
    if (!programId) {
      return res.status(400).json({ success: false, error: 'programId is required' });
    }

    if (!db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    const organizationId = getOrgId(req);
    const rows = await db
      .select()
      .from(cerv2Evidence)
      .where(and(eq(cerv2Evidence.organizationId, organizationId), eq(cerv2Evidence.programId, programId)));

    const grouped = rows.reduce((acc: any, row: any) => {
      if (!row.hash) return acc;
      acc[row.hash] = acc[row.hash] || [];
      acc[row.hash].push(row);
      return acc;
    }, {});

    const archiveIds: string[] = [];
    Object.values(grouped).forEach((list: any) => {
      if (list.length <= 1) return;
      const sorted = list.sort((a: any, b: any) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      );
      sorted.slice(1).forEach((row: any) => archiveIds.push(row.evidenceId));
    });

    if (archiveIds.length) {
      await db
        .update(cerv2Evidence)
        .set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(cerv2Evidence.organizationId, organizationId), eq(cerv2Evidence.programId, programId)))
        .where(inArray(cerv2Evidence.evidenceId, archiveIds));

      await logCerv2AuditEvent(db, req, {
        programId,
        action: 'evidence_dedupe',
        entityType: 'evidence',
        entityId: archiveIds.join(','),
        diffSummary: `Archived ${archiveIds.length} duplicate evidence items`,
      });
    }

    const data = await buildWorkbenchDataFromDb(db, organizationId, programId, {
      evidence: [],
      claims: [],
      standards: [],
      outcomes: [],
    });
    return res.json({ success: true, ...data, archived: archiveIds.length });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to dedupe evidence',
    });
  }
}
