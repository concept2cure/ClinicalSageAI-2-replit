import type { Request, Response } from 'express';
import { listSectionLinks } from '../../cer2v/section-links';
import { db } from '../../db';
import { cerv2SectionLinks } from '@shared/schema';
import { eq } from 'drizzle-orm';

const getOrgId = (req: Request) =>
  Number(req.user?.organizationId || req.tenantContext?.organizationId || 1);

export default async function handler(req: Request, res: Response) {
  try {
    const programId = String(req.query?.programId || 'default');
    const sectionId = String(req.params?.id || '');
    if (!sectionId) {
      return res.status(400).json({ success: false, error: 'section id required' });
    }
    const organizationId = getOrgId(req);
    let links = [] as any[];

    if (db) {
      links = await db
        .select()
        .from(cerv2SectionLinks)
        .where(eq(cerv2SectionLinks.organizationId, organizationId))
        .where(eq(cerv2SectionLinks.programId, programId))
        .where(eq(cerv2SectionLinks.sectionId, sectionId));
    } else {
      links = listSectionLinks(organizationId, programId, sectionId);
    }
    return res.json({ success: true, links });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load section links',
    });
  }
}
