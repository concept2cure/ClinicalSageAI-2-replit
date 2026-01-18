import type { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../../db';
import { cerv2Evidence } from '@shared/schema';
import { logCerv2AuditEvent } from '../../cer2v/audit';
import { buildWorkbenchDataFromDb } from '../../cer2v/workbench-db';

export default async function handler(req: Request, res: Response) {
  try {
    const { programId, evidenceType, owner } = req.body || {};
    if (!programId) {
      return res.status(400).json({ success: false, error: 'programId is required' });
    }
    const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
    if (!files.length) {
      return res.status(400).json({ success: false, error: 'file is required' });
    }

    const organizationId = Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);
    const uploadsRoot = path.join(process.cwd(), 'uploads', 'cer2v', String(organizationId), String(programId));
    await fs.mkdir(uploadsRoot, { recursive: true });

    if (!db) {
      return res.status(503).json({ success: false, error: 'Database unavailable' });
    }

    for (const file of files) {
      const fileBuffer = file.buffer;
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      const evidenceId = `ev-${hash.slice(0, 12)}`;
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `${evidenceId}-${safeName}`;
      const filePath = path.join(uploadsRoot, fileName);
      await fs.writeFile(filePath, fileBuffer);

      await db
        .insert(cerv2Evidence)
        .values({
          organizationId,
          programId,
          evidenceId,
          name: file.originalname,
          evidenceType: evidenceType || 'clinical',
          status: 'inbox',
          hash,
          owner: owner || null,
          filePath,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        })
        .onConflictDoNothing();

      await logCerv2AuditEvent(db, req, {
        programId,
        action: 'evidence_uploaded',
        entityType: 'evidence',
        entityId: evidenceId,
        diffSummary: `Uploaded evidence ${file.originalname}`,
        metadata: { hash },
      });
    }

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
      error: error?.message || 'Failed to upload evidence',
    });
  }
}
