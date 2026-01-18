import type { Request, Response } from 'express';
import { addSectionLink } from '../../cer2v/section-links';
import { db } from '../../db';
import { logCerv2AuditEvent } from '../../cer2v/audit';
import { cerv2SectionLinks } from '@shared/schema';
import { eq } from 'drizzle-orm';

const getOrgId = (req: Request) =>
  Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);

export default async function handler(req: Request, res: Response) {
  try {
    const { programId, sectionId, entityType, entityId } = req.body || {};
    if (!programId || !sectionId || !entityType || !entityId) {
      return res.status(400).json({
        success: false,
        error: 'programId, sectionId, entityType, and entityId are required',
      });
    }
    const organizationId = getOrgId(req);
    let links = [] as any[];

    if (db) {
      await db
        .insert(cerv2SectionLinks)
        .values({
          organizationId,
          programId,
          sectionId,
          entityType,
          entityId,
        })
        .onConflictDoNothing();
      links = await db
        .select()
        .from(cerv2SectionLinks)
        .where(
          eq(cerv2SectionLinks.organizationId, organizationId)
        )
        .where(eq(cerv2SectionLinks.programId, programId))
        .where(eq(cerv2SectionLinks.sectionId, sectionId));
    } else {
      links = addSectionLink(organizationId, programId, sectionId, entityType, entityId);
    }
    await logCerv2AuditEvent(db, req, {
      programId,
      action: 'section_link_created',
      entityType: 'section',
      entityId: sectionId,
      diffSummary: `Linked ${entityType} ${entityId} to section ${sectionId}`,
      metadata: { entityType, entityId },
    });
    return res.json({ success: true, links });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to link section',
    });
  }
}
