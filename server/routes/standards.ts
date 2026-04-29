/**
 * Standards Catalog & Applicability Routes
 *
 * Operates against the canonical `device_test_standards` table (which was
 * extended with governance fields: domain, applies_to, fda_recognized,
 * eu_harmonized, jurisdictions, status, summary).
 *
 *   GET  /api/standards                                            list/filter catalog
 *   GET  /api/standards/:standardId                                fetch one
 *   GET  /api/standards/programs/:programId/applicability
 *   GET  /api/standards/programs/:programId/recommendations
 *   GET  /api/standards/programs/:programId/gap-report
 *   GET  /api/standards/applicability/:applicabilityId/freshness
 */

import { Router, Request, Response, NextFunction } from 'express';
import { and, eq, ilike, or } from 'drizzle-orm';

import { db } from '../db';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { deviceTestStandards } from '../../shared/schema';
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

async function requireProgramAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const programId = req.params.programId;
  if (!programId) {
    res.status(422).json({ error: 'programId is required' });
    return;
  }
  const orgId = getOrgId(req);
  if (orgId === null) {
    res.status(403).json({ error: 'Organization context required' });
    return;
  }
  const [row] = await db
    .select({ id: regulatoryPrograms.id })
    .from(regulatoryPrograms)
    .where(and(eq(regulatoryPrograms.id, programId), eq(regulatoryPrograms.organizationId, orgId)))
    .limit(1);
  if (!row) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
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
    const { sdo, body, family, domain, status, search } = req.query as Record<
      string,
      string | undefined
    >;
    const conditions: any[] = [];
    // The legacy column is `standard_body` (string like 'ISO','IEC','AAMI','CLSI').
    // Either ?sdo=ISO or ?body=ISO works.
    if (sdo) conditions.push(eq(deviceTestStandards.standardBody, sdo));
    if (body) conditions.push(eq(deviceTestStandards.standardBody, body));
    if (family) conditions.push(eq(deviceTestStandards.family, family));
    if (domain) conditions.push(eq(deviceTestStandards.domain, domain));
    if (status) conditions.push(eq(deviceTestStandards.status, status));
    if (search) {
      const like = `%${search}%`;
      conditions.push(
        or(
          ilike(deviceTestStandards.standardCode, like),
          ilike(deviceTestStandards.standardName, like),
          ilike(deviceTestStandards.summary, like),
          ilike(deviceTestStandards.description, like)
        )
      );
    }
    let q = db.select().from(deviceTestStandards).$dynamic();
    if (conditions.length === 1) q = q.where(conditions[0]);
    else if (conditions.length > 1) q = q.where(and(...conditions));
    const rows = await q.orderBy(deviceTestStandards.standardCode).limit(500);
    res.json({ standards: rows, count: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: 'List failed', detail: err?.message });
  }
});

router.get('/:standardId', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.standardId, 10);
    if (!Number.isFinite(id)) return res.status(422).json({ error: 'standardId must be an integer' });
    const [row] = await db
      .select()
      .from(deviceTestStandards)
      .where(eq(deviceTestStandards.id, id))
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
