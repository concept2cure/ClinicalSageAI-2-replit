/**
 * cro.ts
 *
 * CRO (Contract Research Organization) routes — real, tenant-scoped CRUD over
 * the cro_* tables (cro_clients, cro_studies, cro_regulatory_submissions,
 * cro_milestones, cro_team_assignments). The dashboard aggregates those same
 * tables. Previously every endpoint here returned hardcoded mock data
 * (fabricated clients, studies, revenue, compliance scores) and the
 * create/update handlers echoed the body without persisting anything.
 *
 * Routes:
 *   GET    /api/cro/dashboard         — aggregated summary from real tables
 *   GET    /api/cro/clients           — list clients
 *   POST   /api/cro/clients           — create client
 *   PUT    /api/cro/clients/:id       — update client
 *   DELETE /api/cro/clients/:id       — delete client
 *   GET    /api/cro/studies           — list studies
 *   POST   /api/cro/studies           — create study
 *   PUT    /api/cro/studies/:id       — update study
 *   GET    /api/cro/submissions       — list submissions
 *   POST   /api/cro/submissions       — create submission
 *   PUT    /api/cro/submissions/:id   — update submission
 *   GET    /api/cro/milestones        — list milestones
 *   POST   /api/cro/milestones        — create milestone
 *   PUT    /api/cro/milestones/:id    — update milestone
 */

import { Router, type Request, type Response } from 'express';
import { eq, and } from 'drizzle-orm';

import { db } from '../db';
import {
  croClients,
  croStudies,
  croRegulatorySubmissions,
  croMilestones,
  croTeamAssignments,
} from '@shared/schema';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('cro');

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function getOrgId(req: Request): number | null {
  const raw =
    (req as any).tenantContext?.organizationId ??
    (req as any).tenantId ??
    (req as any).organizationId ??
    (req as any).user?.organizationId;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return Number.isInteger(n) && n > 0 ? n : null;
}

const DATE_KEYS = new Set([
  'contractStartDate',
  'contractEndDate',
  'firstPatientIn',
  'lastPatientOut',
  'studyCompletionDate',
  'submissionDate',
  'expectedApprovalDate',
  'actualApprovalDate',
  'plannedStartDate',
  'actualStartDate',
  'plannedEndDate',
  'actualEndDate',
  'startDate',
  'endDate',
]);

const DECIMAL_KEYS = new Set([
  'contractValue',
  'studyBudget',
  'budget',
  'actualCost',
  'billableRate',
]);

/**
 * Normalises a request body for insert/update: coerces ISO date strings to
 * Date, decimal numbers to strings (Drizzle numeric columns), and strips
 * fields the client must not control.
 */
function normalizeBody(body: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...body };
  for (const k of Object.keys(out)) {
    if (DATE_KEYS.has(k) && typeof out[k] === 'string' && out[k]) {
      const d = new Date(out[k]);
      if (!Number.isNaN(d.getTime())) out[k] = d;
    } else if (DECIMAL_KEYS.has(k) && typeof out[k] === 'number') {
      out[k] = String(out[k]);
    }
  }
  delete out.id;
  delete out.organizationId;
  delete out.createdAt;
  delete out.updatedAt;
  return out;
}

function requireOrg(req: Request, res: Response): number | null {
  const orgId = getOrgId(req);
  if (!orgId) {
    res.status(403).json({ error: 'Organization context required' });
    return null;
  }
  return orgId;
}

function num(value: unknown): number {
  const n = typeof value === 'string' ? parseFloat(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

router.get('/dashboard', async (req: Request, res: Response) => {
  const orgId = requireOrg(req, res);
  if (orgId == null) return;
  try {
    const [clients, studies, submissions, milestones, assignments] = await Promise.all([
      db.select().from(croClients).where(eq(croClients.organizationId, orgId)),
      db.select().from(croStudies).where(eq(croStudies.organizationId, orgId)),
      db
        .select()
        .from(croRegulatorySubmissions)
        .where(eq(croRegulatorySubmissions.organizationId, orgId)),
      db.select().from(croMilestones).where(eq(croMilestones.organizationId, orgId)),
      db.select().from(croTeamAssignments).where(eq(croTeamAssignments.organizationId, orgId)),
    ]);

    const activeStudyStatuses = new Set(['startup', 'recruiting', 'active']);
    const pendingSubmissionStatuses = new Set(['draft', 'submitted', 'under_review']);

    // Average study duration (weeks) over studies with both endpoints recorded.
    const durations: number[] = [];
    for (const s of studies) {
      if (s.firstPatientIn && s.studyCompletionDate) {
        const weeks =
          (new Date(s.studyCompletionDate).getTime() - new Date(s.firstPatientIn).getTime()) /
          (1000 * 60 * 60 * 24 * 7);
        if (weeks > 0) durations.push(Math.round(weeks));
      }
    }

    const dashboardData = {
      totalClients: clients.length,
      activeStudies: studies.filter(s => activeStudyStatuses.has(s.studyStatus)).length,
      pendingSubmissions: submissions.filter(s =>
        pendingSubmissionStatuses.has(s.submissionStatus)
      ).length,
      completedMilestones: milestones.filter(m => m.status === 'completed').length,
      totalRevenue: clients
        .filter(c => c.contractStatus === 'active')
        .reduce((sum, c) => sum + num(c.contractValue), 0),
      averageStudyDuration: avg(durations),
      // Real compliance = mean of recorded submission compliance scores.
      complianceScore: avg(
        submissions
          .map(s => s.complianceScore)
          .filter((v): v is number => typeof v === 'number')
      ),
      // Real team utilization = mean of active assignment utilization.
      teamUtilization: avg(
        assignments
          .filter(a => a.status === 'active')
          .map(a => a.utilizationPercentage)
          .filter((v): v is number => typeof v === 'number')
      ),
    };
    res.json(dashboardData);
  } catch (error) {
    logger.error('Failed to fetch CRO dashboard', {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Clients ────────────────────────────────────────────────────────────────────

router.get('/clients', async (req: Request, res: Response) => {
  const orgId = requireOrg(req, res);
  if (orgId == null) return;
  try {
    const rows = await db
      .select()
      .from(croClients)
      .where(eq(croClients.organizationId, orgId));
    res.json(rows);
  } catch (error) {
    logger.error('Failed to fetch CRO clients', {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/clients', async (req: Request, res: Response) => {
  const orgId = requireOrg(req, res);
  if (orgId == null) return;
  try {
    const payload = normalizeBody(req.body);
    if (!payload.name || !payload.companyType) {
      return res.status(400).json({ error: 'name and companyType are required' });
    }
    const [row] = await db
      .insert(croClients)
      .values({ ...payload, organizationId: orgId } as any)
      .returning();
    res.status(201).json(row);
  } catch (error) {
    logger.error('Failed to create CRO client', {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/clients/:id', async (req: Request, res: Response) => {
  const orgId = requireOrg(req, res);
  if (orgId == null) return;
  try {
    const id = parseInt(req.params.id, 10);
    const [row] = await db
      .update(croClients)
      .set({ ...normalizeBody(req.body), updatedAt: new Date() } as any)
      .where(and(eq(croClients.id, id), eq(croClients.organizationId, orgId)))
      .returning();
    if (!row) return res.status(404).json({ error: 'Client not found' });
    res.json(row);
  } catch (error) {
    logger.error('Failed to update CRO client', {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/clients/:id', async (req: Request, res: Response) => {
  const orgId = requireOrg(req, res);
  if (orgId == null) return;
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await db
      .delete(croClients)
      .where(and(eq(croClients.id, id), eq(croClients.organizationId, orgId)))
      .returning();
    if (deleted.length === 0) return res.status(404).json({ error: 'Client not found' });
    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete CRO client', {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Studies ────────────────────────────────────────────────────────────────────

router.get('/studies', async (req: Request, res: Response) => {
  const orgId = requireOrg(req, res);
  if (orgId == null) return;
  try {
    const rows = await db
      .select()
      .from(croStudies)
      .where(eq(croStudies.organizationId, orgId));
    res.json(rows);
  } catch (error) {
    logger.error('Failed to fetch CRO studies', {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/studies', async (req: Request, res: Response) => {
  const orgId = requireOrg(req, res);
  if (orgId == null) return;
  try {
    const payload = normalizeBody(req.body);
    if (!payload.clientId || !payload.studyNumber || !payload.studyTitle) {
      return res
        .status(400)
        .json({ error: 'clientId, studyNumber and studyTitle are required' });
    }
    const [row] = await db
      .insert(croStudies)
      .values({ ...payload, organizationId: orgId } as any)
      .returning();
    res.status(201).json(row);
  } catch (error) {
    logger.error('Failed to create CRO study', {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/studies/:id', async (req: Request, res: Response) => {
  const orgId = requireOrg(req, res);
  if (orgId == null) return;
  try {
    const id = parseInt(req.params.id, 10);
    const [row] = await db
      .update(croStudies)
      .set({ ...normalizeBody(req.body), updatedAt: new Date() } as any)
      .where(and(eq(croStudies.id, id), eq(croStudies.organizationId, orgId)))
      .returning();
    if (!row) return res.status(404).json({ error: 'Study not found' });
    res.json(row);
  } catch (error) {
    logger.error('Failed to update CRO study', {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Submissions ────────────────────────────────────────────────────────────────

router.get('/submissions', async (req: Request, res: Response) => {
  const orgId = requireOrg(req, res);
  if (orgId == null) return;
  try {
    const rows = await db
      .select()
      .from(croRegulatorySubmissions)
      .where(eq(croRegulatorySubmissions.organizationId, orgId));
    res.json(rows);
  } catch (error) {
    logger.error('Failed to fetch CRO submissions', {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/submissions', async (req: Request, res: Response) => {
  const orgId = requireOrg(req, res);
  if (orgId == null) return;
  try {
    const payload = normalizeBody(req.body);
    if (!payload.clientId || !payload.submissionType || !payload.regulatoryRegion) {
      return res
        .status(400)
        .json({ error: 'clientId, submissionType and regulatoryRegion are required' });
    }
    const [row] = await db
      .insert(croRegulatorySubmissions)
      .values({ ...payload, organizationId: orgId } as any)
      .returning();
    res.status(201).json(row);
  } catch (error) {
    logger.error('Failed to create CRO submission', {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/submissions/:id', async (req: Request, res: Response) => {
  const orgId = requireOrg(req, res);
  if (orgId == null) return;
  try {
    const id = parseInt(req.params.id, 10);
    const [row] = await db
      .update(croRegulatorySubmissions)
      .set({ ...normalizeBody(req.body), updatedAt: new Date() } as any)
      .where(
        and(
          eq(croRegulatorySubmissions.id, id),
          eq(croRegulatorySubmissions.organizationId, orgId)
        )
      )
      .returning();
    if (!row) return res.status(404).json({ error: 'Submission not found' });
    res.json(row);
  } catch (error) {
    logger.error('Failed to update CRO submission', {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Milestones ─────────────────────────────────────────────────────────────────

router.get('/milestones', async (req: Request, res: Response) => {
  const orgId = requireOrg(req, res);
  if (orgId == null) return;
  try {
    const rows = await db
      .select()
      .from(croMilestones)
      .where(eq(croMilestones.organizationId, orgId));
    res.json(rows);
  } catch (error) {
    logger.error('Failed to fetch CRO milestones', {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/milestones', async (req: Request, res: Response) => {
  const orgId = requireOrg(req, res);
  if (orgId == null) return;
  try {
    const payload = normalizeBody(req.body);
    if (!payload.clientId || !payload.title || !payload.category) {
      return res.status(400).json({ error: 'clientId, title and category are required' });
    }
    const [row] = await db
      .insert(croMilestones)
      .values({ ...payload, organizationId: orgId } as any)
      .returning();
    res.status(201).json(row);
  } catch (error) {
    logger.error('Failed to create CRO milestone', {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/milestones/:id', async (req: Request, res: Response) => {
  const orgId = requireOrg(req, res);
  if (orgId == null) return;
  try {
    const id = parseInt(req.params.id, 10);
    const [row] = await db
      .update(croMilestones)
      .set({ ...normalizeBody(req.body), updatedAt: new Date() } as any)
      .where(and(eq(croMilestones.id, id), eq(croMilestones.organizationId, orgId)))
      .returning();
    if (!row) return res.status(404).json({ error: 'Milestone not found' });
    res.json(row);
  } catch (error) {
    logger.error('Failed to update CRO milestone', {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
