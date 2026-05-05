/**
 * Regulatory Programs API — list/get over the regulatory_programs table.
 *
 * Mounted at:  /api/regulatory-programs
 *
 * Different concept from /api/project-hierarchy/programs (which lists
 * depth=0 rows of the projects table). regulatory_programs carries the
 * MDX-relevant taxonomy: programType (510K / PMA / CER / DE_NOVO / IND /
 * NDA / BLA), regulatoryPath, deviceClass, primaryAgency, productName,
 * status, phase, progressPercent, targetSubmissionDate, leadUserId,
 * teamMembers, metadata. The MDX Overview surface needs this data, not
 * generic project rows.
 *
 * Endpoints:
 *   GET /                 — list rows, optionally filtered by ?programType / ?pathway
 *   GET /:id              — get one row
 *
 * The list endpoint joins users for the lead name (single round-trip,
 * single query) so kit-shape adapters don't have to N+1 the user table.
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { users } from '../../shared/schema';

const router = Router();

function getOrgId(req: Request): number | null {
  const v =
    (req as any).organizationId ??
    (req as any).tenantContext?.organizationId ??
    (req as any).user?.organizationId ??
    (req as any).tenantId;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface ProgramRowWithLead {
  id: string;
  name: string;
  code: string;
  description: string | null;
  programType: string;
  productType: string;
  deviceClass: string | null;
  regulatoryPath: string | null;
  primaryAgency: string;
  productName: string;
  status: string;
  phase: string | null;
  priority: string | null;
  targetSubmissionDate: string | null;
  progressPercent: number | null;
  completedMilestones: number | null;
  totalMilestones: number | null;
  leadUserId: number | null;
  leadUserName: string | null;
  teamMembers: Array<{ name?: string; userId?: number; role?: string }> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

    const programType = typeof req.query.programType === 'string' ? req.query.programType : null;

    const conditions = [eq(regulatoryPrograms.organizationId, orgId)];
    if (programType) conditions.push(eq(regulatoryPrograms.programType, programType));

    const rows = await db
      .select()
      .from(regulatoryPrograms)
      .where(and(...conditions))
      .orderBy(desc(regulatoryPrograms.updatedAt));

    /* Resolve lead names in a single batch */
    const leadIds = Array.from(
      new Set(
        rows.map((r) => r.leadUserId).filter((v): v is number => typeof v === 'number'),
      ),
    );
    const leadRows = leadIds.length
      ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, leadIds))
      : [];
    const leadById = new Map(leadRows.map((r) => [r.id, r.name]));

    const data: ProgramRowWithLead[] = rows.map((r) => ({
      id:                   r.id,
      name:                 r.name,
      code:                 r.code,
      description:          r.description ?? null,
      programType:          r.programType,
      productType:          r.productType,
      deviceClass:          r.deviceClass ?? null,
      regulatoryPath:       r.regulatoryPath ?? null,
      primaryAgency:        r.primaryAgency,
      productName:          r.productName,
      status:               r.status,
      phase:                r.phase ?? null,
      priority:             r.priority ?? null,
      targetSubmissionDate: r.targetSubmissionDate ? r.targetSubmissionDate.toISOString() : null,
      progressPercent:      r.progressPercent ?? 0,
      completedMilestones:  r.completedMilestones ?? 0,
      totalMilestones:      r.totalMilestones ?? 0,
      leadUserId:           r.leadUserId ?? null,
      leadUserName:         r.leadUserId != null ? (leadById.get(r.leadUserId) ?? null) : null,
      teamMembers:          (r.teamMembers as ProgramRowWithLead['teamMembers']) ?? null,
      metadata:             (r.metadata as Record<string, unknown> | null) ?? null,
      createdAt:            r.createdAt.toISOString(),
      updatedAt:            r.updatedAt.toISOString(),
    }));

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

    const id = String(req.params.id);
    const [row] = await db
      .select()
      .from(regulatoryPrograms)
      .where(and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, orgId)))
      .limit(1);
    if (!row) return res.status(404).json({ error: 'Program not found' });

    let leadUserName: string | null = null;
    if (row.leadUserId != null) {
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.leadUserId));
      if (u) leadUserName = u.name;
    }

    const data: ProgramRowWithLead = {
      id:                   row.id,
      name:                 row.name,
      code:                 row.code,
      description:          row.description ?? null,
      programType:          row.programType,
      productType:          row.productType,
      deviceClass:          row.deviceClass ?? null,
      regulatoryPath:       row.regulatoryPath ?? null,
      primaryAgency:        row.primaryAgency,
      productName:          row.productName,
      status:               row.status,
      phase:                row.phase ?? null,
      priority:             row.priority ?? null,
      targetSubmissionDate: row.targetSubmissionDate ? row.targetSubmissionDate.toISOString() : null,
      progressPercent:      row.progressPercent ?? 0,
      completedMilestones:  row.completedMilestones ?? 0,
      totalMilestones:      row.totalMilestones ?? 0,
      leadUserId:           row.leadUserId ?? null,
      leadUserName,
      teamMembers:          (row.teamMembers as ProgramRowWithLead['teamMembers']) ?? null,
      metadata:             (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt:            row.createdAt.toISOString(),
      updatedAt:            row.updatedAt.toISOString(),
    };

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Operation failed' });
  }
});

export default router;
