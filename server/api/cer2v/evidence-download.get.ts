import type { Request, Response } from 'express';
import fs from 'fs';
import { db } from '../../db';
import { cerv2Evidence } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

const getOrgId = (req: Request) =>
  Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);

export default async function handler(req: Request, res: Response) {
  try {
    const evidenceId = String(req.params?.id || '');
    const programId = String(req.query?.programId || 'default');
    if (!evidenceId) {
      return res.status(400).json({ success: false, error: 'evidence id is required' });
    }
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database unavailable' });
    }

    const rows = await db
      .select()
      .from(cerv2Evidence)
      .where(
        and(
          eq(cerv2Evidence.organizationId, getOrgId(req)),
          eq(cerv2Evidence.programId, programId),
          eq(cerv2Evidence.evidenceId, evidenceId)
        )
      )
      .limit(1);

    const row = rows[0];
    if (!row?.filePath || !fs.existsSync(row.filePath)) {
      return res.status(404).json({ success: false, error: 'Evidence file not found' });
    }

    res.setHeader('Content-Type', row.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${row.name}"`);
    fs.createReadStream(row.filePath).pipe(res);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to download evidence',
    });
  }
}
