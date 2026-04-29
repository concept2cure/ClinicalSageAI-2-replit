/**
 * Standards Catalog & Applicability Routes
 *
 *   GET   /api/standards                              list/filter the catalog
 *   GET   /api/standards/:standardId                  fetch one
 *   GET   /api/standards/programs/:programId/applicability
 *   GET   /api/standards/programs/:programId/recommendations  (?profile= overrides)
 *   GET   /api/standards/programs/:programId/gap-report
 *   GET   /api/standards/applicability/:applicabilityId/freshness
 */

import { Router, Request, Response, NextFunction } from 'express';
import { and, eq, ilike, or } from 'drizzle-orm';

import { db } from '../db';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { regulatoryStandards } from '../../shared/schema/regulatory-graph';
import { authenticateToken } from '../middleware/auth';
import {
  applicabilityGapReport,
  buildProgramProfile,
  checkConformanceFreshness,
  listProgramApplicability,
  recommendApplicability,
  type ProgramProfile,
} from '../services/regulatory-graph/standards-applicability.service';

const router = Router();

router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

async function requireProgramAccess(req: Request, res: Response, next: NextFunction) {
  const programId = req.params.programId;
  if (!programId) return res.status(422).json({ error: 'programId is required' });
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const [row] = await db
    .select({ id: regulatoryPrograms.id })
    .from(regulatoryPrograms)
    .where(and(eq(regulatoryPrograms.id, programId), eq(regulatoryPrograms.organizationId, orgId)))
    .limit(1);
  if (!row) return res.status(403).json({ error: 'Access denied' });
  next();
}

function parseProfileOverrides(req: Request): Partial<ProgramProfile> {
  const o: Partial<ProgramProfile> = {};
  const q = req.query as Record<string, string | undefined>;
  if (q.isSoftware !== undefined) o.isSoftware = q.isSoftware === 'true';
  if (q.isAiMl !== undefined) o.isAiMl = q.isAiMl === 'true';
  if (q.isSterile !== undefined) o.isSterile = q.isSterile === 'true';
  if (q.hasPatientContact !== undefined) o.hasPatientContact = q.hasPatientContact === 'true';
  if (q.isElectrical !== undefined) o.isElectrical = q.isElectrical === 'true';
  if (q.isIvd !== undefined) o.isIvd = q.isIvd === 'true';
  return o;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const { sdo, domain, status, search } = req.query as Record<string, string | undefined>;
    const conditions: any[] = [];
    if (sdo) conditions.push(eq(regulatoryStandards.sdo, sdo));
    if (domain) conditions.push(eq(regulatoryStandards.domain, domain));
    if (status) conditions.push(eq(regulatoryStandards.status, status));
    if (search) {
      const like = `%${search}%`;
      conditions.push(
        or(
          ilike(regulatoryStandards.code, like),
          ilike(regulatoryStandards.title, like),
          ilike(regulatoryStandards.summary, like)
        )
      );
    }
    let q = db.select().from(regulatoryStandards).$dynamic();
    if (conditions.length === 1) q = q.where(conditions[0]);
    else if (conditions.length > 1) q = q.where(and(...conditions));
    const rows = await q.orderBy(regulatoryStandards.code).limit(500);
    res.json({ standards: rows, count: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: 'List failed', detail: err?.message });
  }
});

router.get('/:standardId', async (req: Request, res: Response) => {
  try {
    const [row] = await db
      .select()
      .from(regulatoryStandards)
      .where(eq(regulatoryStandards.id, req.params.standardId))
      .limit(1);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: 'Fetch failed', detail: err?.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-program
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/programs/:programId/applicability',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const rows = await listProgramApplicability(req.params.programId);
      res.json({ programId: req.params.programId, applicability: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: 'Applicability fetch failed', detail: err?.message });
    }
  }
);

router.get(
  '/programs/:programId/recommendations',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const profile = await buildProgramProfile(
        req.params.programId,
        parseProfileOverrides(req)
      );
      if (!profile) return res.status(404).json({ error: 'Program not found' });
      const recs = await recommendApplicability(profile);
      res.json({
        programId: req.params.programId,
        profile,
        recommendations: recs,
        applicableCount: recs.filter(r => r.applicability === 'applies').length,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Recommendation failed', detail: err?.message });
    }
  }
);

router.get(
  '/programs/:programId/gap-report',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const profile = await buildProgramProfile(
        req.params.programId,
        parseProfileOverrides(req)
      );
      if (!profile) return res.status(404).json({ error: 'Program not found' });
      const report = await applicabilityGapReport(req.params.programId, profile);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: 'Gap report failed', detail: err?.message });
    }
  }
);

router.get(
  '/applicability/:applicabilityId/freshness',
  async (req: Request, res: Response) => {
    try {
      const result = await checkConformanceFreshness(req.params.applicabilityId);
      if (!result) return res.status(404).json({ error: 'Applicability row not found' });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Freshness check failed', detail: err?.message });
    }
  }
);

export default router;
