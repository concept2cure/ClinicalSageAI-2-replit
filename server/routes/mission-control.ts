/**
 * @fileoverview Mission Control API — Program OS
 * @module server/routes/mission-control
 * @version 2.0.0
 *
 * Full CRUD + intelligence endpoints for the Concept2Cure PM engine.
 * Programs → Destinations → Route Plans → Artifacts → Evidence →
 * Dependencies → Decisions → Reviews → Risks → Collaboration
 *
 * Data persisted in projectMemoryEntries with category 'mission_control'.
 *
 * @compliance
 * - FDA 21 CFR Part 11: Provenance logging on all mutations
 * - Multi-tenant: Organization-scoped queries
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createFeatureStore } from '../utils/feature-persistence';

const router = Router();
const store = createFeatureStore('mission_control');

function getOrgId(req: Request): number {
  const orgId =
    (req as any).tenantContext?.organizationId ||
    (req as any).tenantId ||
    (req as any).organizationId ||
    (req as any).user?.organizationId;
  if (!orgId) throw new Error('Organization context required');
  return orgId;
}

function getUserId(req: Request): number {
  const userId =
    (req as any).userId ||
    (req as any).tenantContext?.userId ||
    (req as any).user?.id;
  if (!userId) throw new Error('User context required');
  return userId;
}

async function logProvenance(
  orgId: number,
  programId: number | null,
  entityType: string,
  entityId: number,
  action: string,
  actorId: number,
  details?: any,
) {
  try {
    await store.insert(orgId, 'provenance', `${action} ${entityType} #${entityId}`, {
      organizationId: orgId,
      programId,
      entityType,
      entityId,
      action,
      actorType: 'user',
      actorId,
      changeDescription: details?.description || `${action} ${entityType} #${entityId}`,
      previousState: details?.prev,
      newState: details?.next,
    });
  } catch {
    // Non-blocking provenance logging
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRAMS
// ═══════════════════════════════════════════════════════════════════════════════

const programSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  description: z.string().optional(),
  customerTrack: z.enum(['biotech', 'pharma', 'cro', 'device', 'diagnostics']),
  productCategory: z.string().optional(),
  modality: z.string().optional(),
  indication: z.string().optional(),
  therapeuticArea: z.string().optional(),
  developmentStage: z.string().optional(),
  riskPosture: z.string().optional(),
  noveltyLevel: z.string().optional(),
  markets: z.array(z.string()).optional(),
  primaryMarket: z.string().optional(),
  sponsorName: z.string().optional(),
  operatingModel: z.string().optional(),
  targetSubmissionDate: z.string().optional(),
});

router.get('/programs', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programs = await store.query(orgId, 'program');
    programs.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    res.json({ data: programs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/programs/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const program = await store.getById(parseInt(req.params.id), orgId);
    if (!program) return res.status(404).json({ error: 'Program not found' });
    res.json({ data: program });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/programs', async (req: Request, res: Response) => {
  try {
    const parsed = programSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const data = {
      organizationId: orgId,
      createdById: userId,
      ownerId: userId,
      ...parsed.data,
      status: 'planning',
      targetSubmissionDate: parsed.data.targetSubmissionDate
        ? new Date(parsed.data.targetSubmissionDate).toISOString()
        : null,
    };

    const program = await store.insert(orgId, 'program', parsed.data.name, data);
    await logProvenance(orgId, program.id, 'program', program.id, 'created', userId);
    res.status(201).json({ data: program });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/programs/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const id = parseInt(req.params.id);
    const existing = await store.getById(id, orgId);
    if (!existing) return res.status(404).json({ error: 'Program not found' });

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...prev } = existing;
    const updated = { ...prev, ...req.body };
    const result = await store.update(id, orgId, updated, req.body.name);
    await logProvenance(orgId, id, 'program', id, 'updated', getUserId(req), { prev, next: updated });
    res.json({ data: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DESTINATIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/destinations', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const dests = await store.query(orgId, 'destination', (d: any) => d.programId === programId);
    res.json({ data: dests });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/programs/:programId/destinations', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const data = {
      programId,
      organizationId: orgId,
      ...req.body,
      status: req.body.status || 'planned',
      readinessArtifact: 0,
      readinessEvidence: 0,
      readinessReview: 0,
      readinessApproval: 0,
      readinessConsistency: 0,
      readinessRouteFit: 0,
      readinessAuthority: 0,
      readinessCompliance: 0,
      readinessTimeline: 0,
    };

    const dest = await store.insert(orgId, 'destination', req.body.destinationType || 'Destination', data);
    await logProvenance(orgId, programId, 'destination', dest.id, 'created', getUserId(req));
    res.status(201).json({ data: dest });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE PLANS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/destinations/:destId/routes', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const destId = parseInt(req.params.destId);
    const routes = await store.query(orgId, 'route_plan', (r: any) => r.destinationId === destId);
    res.json({ data: routes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/destinations/:destId/routes', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const destId = parseInt(req.params.destId);
    const dests = await store.query(orgId, 'destination', (d: any) => d.id === destId);
    const dest = dests[0];

    const data = {
      destinationId: destId,
      programId: dest?.programId || 0,
      organizationId: orgId,
      ...req.body,
      status: req.body.status || 'draft',
    };

    const route = await store.insert(orgId, 'route_plan', req.body.name || 'Route Plan', data);
    await logProvenance(orgId, dest?.programId, 'route-plan', route.id, 'created', getUserId(req));
    res.status(201).json({ data: route });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ARTIFACTS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/artifacts', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const { type, lifecycle, dossierModule } = req.query;

    let arts = await store.query(orgId, 'artifact', (a: any) => a.programId === programId);
    if (type) arts = arts.filter((a: any) => a.artifactType === type);
    if (lifecycle) arts = arts.filter((a: any) => a.lifecycleState === lifecycle);
    if (dossierModule) arts = arts.filter((a: any) => a.dossierModule === dossierModule);
    res.json({ data: arts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/artifacts/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const id = parseInt(req.params.id);
    const art = await store.getById(id, orgId);
    if (!art) return res.status(404).json({ error: 'Artifact not found' });

    const evidenceLinks = await store.query(orgId, 'artifact_evidence', (ae: any) => ae.artifactId === id);
    const reviews = await store.query(orgId, 'review', (r: any) => r.artifactId === id);
    const deps = await store.query(
      orgId,
      'dependency',
      (d: any) =>
        (d.sourceType === 'artifact' && d.sourceId === id) ||
        (d.targetType === 'artifact' && d.targetId === id),
    );
    const comments = await store.query(
      orgId,
      'collaboration',
      (c: any) => c.targetType === 'artifact' && c.targetId === id,
    );

    res.json({ data: { ...art, evidenceLinks, reviews, dependencies: deps, comments } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/programs/:programId/artifacts', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const data = {
      programId,
      organizationId: orgId,
      ...req.body,
      lifecycleState: req.body.lifecycleState || 'planned',
      version: req.body.version || '0.1',
      evidenceScore: null,
      reviewScore: null,
      consistencyScore: null,
      completenessScore: null,
      approvalState: 'none',
      exportReady: false,
    };

    const artifact = await store.insert(orgId, 'artifact', req.body.title || 'Artifact', data);
    await logProvenance(orgId, programId, 'artifact', artifact.id, 'created', getUserId(req));
    res.status(201).json({ data: artifact });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/artifacts/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const id = parseInt(req.params.id);
    const existing = await store.getById(id, orgId);
    if (!existing) return res.status(404).json({ error: 'Artifact not found' });

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...prev } = existing;
    const updated = { ...prev, ...req.body };
    const result = await store.update(id, orgId, updated, req.body.title);
    await logProvenance(orgId, existing.programId, 'artifact', id, 'updated', getUserId(req), {
      prev,
      next: updated,
    });

    const deps = await store.query(
      orgId,
      'dependency',
      (d: any) => d.sourceType === 'artifact' && d.sourceId === id,
    );
    for (const dep of deps) {
      const { id: depId, createdAt: _dca, updatedAt: _dua, ...depData } = dep;
      await store.update(depId, orgId, { ...depData, isStale: true, staleSince: new Date().toISOString() });
    }

    res.json({ data: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/artifacts/:id/transition', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const id = parseInt(req.params.id);
    const art = await store.getById(id, orgId);
    if (!art) return res.status(404).json({ error: 'Artifact not found' });

    const { newState, note } = req.body;
    const validTransitions: Record<string, string[]> = {
      planned: ['drafting'],
      drafting: ['in-review', 'planned'],
      'in-review': ['approved', 'drafting', 'revision-needed'],
      'revision-needed': ['drafting'],
      approved: ['locked', 'in-review'],
      locked: ['exported', 'approved'],
      exported: ['superseded'],
      superseded: [],
      retired: [],
    };

    const allowed = validTransitions[art.lifecycleState] || [];
    if (!allowed.includes(newState)) {
      return res
        .status(400)
        .json({ error: `Cannot transition from ${art.lifecycleState} to ${newState}` });
    }

    const prev = art.lifecycleState;
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = art;
    const updated: any = { ...data, lifecycleState: newState };

    if (newState === 'locked') {
      updated.lockedAt = new Date().toISOString();
      updated.lockedById = getUserId(req);
    }
    if (newState === 'approved') {
      updated.approvalState = 'approved';
      updated.approvedById = getUserId(req);
      updated.approvedAt = new Date().toISOString();
    }

    const result = await store.update(id, orgId, updated);
    await logProvenance(orgId, art.programId, 'artifact', id, 'state-changed', getUserId(req), {
      description: `${prev} → ${newState}${note ? ': ' + note : ''}`,
      prev: { lifecycleState: prev },
      next: { lifecycleState: newState },
    });

    res.json({ data: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/evidence', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const evidence = await store.query(orgId, 'evidence', (e: any) => e.programId === programId);
    res.json({ data: evidence });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/programs/:programId/evidence', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const data = {
      programId,
      organizationId: orgId,
      ...req.body,
      status: 'active',
    };

    const evidence = await store.insert(orgId, 'evidence', req.body.title || 'Evidence', data);
    await logProvenance(orgId, programId, 'evidence', evidence.id, 'created', getUserId(req));
    res.status(201).json({ data: evidence });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/artifacts/:artifactId/evidence', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const artifactId = parseInt(req.params.artifactId);
    const data = {
      artifactId,
      evidenceNodeId: req.body.evidenceNodeId,
      linkType: req.body.linkType || 'supports',
      claimText: req.body.claimText,
      relevanceScore: req.body.relevanceScore,
    };

    const link = await store.insert(orgId, 'artifact_evidence', 'Evidence Link', data);
    res.status(201).json({ data: link });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/dependencies', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const deps = await store.query(orgId, 'dependency', (d: any) => d.programId === programId);
    res.json({ data: deps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/programs/:programId/dependencies', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const data = {
      programId,
      organizationId: orgId,
      ...req.body,
      isStale: false,
    };

    const dep = await store.insert(orgId, 'dependency', 'Dependency', data);
    res.status(201).json({ data: dep });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/programs/:programId/dependencies/stale', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const stale = await store.query(
      orgId,
      'dependency',
      (d: any) => d.programId === programId && d.isStale,
    );
    res.json({ data: stale });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DECISIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/decisions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const decisions = await store.query(orgId, 'decision', (d: any) => d.programId === programId);
    res.json({ data: decisions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/programs/:programId/decisions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const userId = getUserId(req);
    const data = {
      programId,
      organizationId: orgId,
      decisionOwnerId: userId,
      ...req.body,
      status: 'proposed',
    };

    const decision = await store.insert(orgId, 'decision', req.body.title || 'Decision', data);
    await logProvenance(orgId, programId, 'decision', decision.id, 'created', userId);
    res.status(201).json({ data: decision });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEW CYCLES
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/artifacts/:artifactId/reviews', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const artifactId = parseInt(req.params.artifactId);
    const reviews = await store.query(orgId, 'review', (r: any) => r.artifactId === artifactId);
    res.json({ data: reviews });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/artifacts/:artifactId/reviews', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const artifactId = parseInt(req.params.artifactId);
    const art = await store.getById(artifactId, orgId);

    const data = {
      artifactId,
      programId: art?.programId || 0,
      organizationId: orgId,
      cycleNumber: req.body.cycleNumber || 1,
      status: 'open',
      requestedById: getUserId(req),
      reviewerIds: req.body.reviewerIds || [],
      approverIds: req.body.approverIds || [],
      reviewType: req.body.reviewType || 'standard',
      visibility: req.body.visibility || 'internal',
      dueDate: req.body.dueDate || null,
      requestedAt: new Date().toISOString(),
    };

    const review = await store.insert(orgId, 'review', `Review cycle for artifact #${artifactId}`, data);

    if (art && art.lifecycleState === 'drafting') {
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...artData } = art;
      await store.update(artifactId, orgId, { ...artData, lifecycleState: 'in-review' });
    }

    await logProvenance(orgId, art?.programId, 'review-cycle', review.id, 'created', getUserId(req));
    res.status(201).json({ data: review });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/reviews/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const id = parseInt(req.params.id);
    const review = await store.getById(id, orgId);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...prev } = review;
    const updated: any = { ...prev, ...req.body };

    if (req.body.status === 'approved') {
      updated.completedAt = new Date().toISOString();
      updated.outcome = 'approved';
      const art = await store.getById(review.artifactId, orgId);
      if (art) {
        const { id: _aid, createdAt: _aca, updatedAt: _aua, ...artData } = art;
        await store.update(review.artifactId, orgId, {
          ...artData,
          approvalState: 'approved',
          lifecycleState: 'approved',
          approvedById: getUserId(req),
          approvedAt: new Date().toISOString(),
        });
      }
    }

    const result = await store.update(id, orgId, updated);
    await logProvenance(orgId, review.programId, 'review-cycle', id, 'updated', getUserId(req), {
      prev,
      next: updated,
    });
    res.json({ data: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RISK SIGNALS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/risks', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const { status, severity } = req.query;
    let risks = await store.query(orgId, 'risk', (r: any) => r.programId === programId);
    if (status) risks = risks.filter((r: any) => r.status === status);
    if (severity) risks = risks.filter((r: any) => r.severity === severity);
    res.json({ data: risks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/programs/:programId/risks', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const data = {
      programId,
      organizationId: orgId,
      ...req.body,
      status: 'open',
      detectedById: getUserId(req),
    };

    const risk = await store.insert(orgId, 'risk', req.body.title || 'Risk Signal', data);
    await logProvenance(orgId, programId, 'risk-signal', risk.id, 'created', getUserId(req));
    res.status(201).json({ data: risk });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// COLLABORATION
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/collaboration', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const { targetType, targetId, programId } = req.query;

    let items = await store.query(orgId, 'collaboration');
    if (programId) items = items.filter((c: any) => c.programId === parseInt(programId as string));
    if (targetType && targetId) {
      items = items.filter(
        (c: any) => c.targetType === targetType && c.targetId === parseInt(targetId as string),
      );
    }
    res.json({ data: items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/collaboration', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const data: any = {
      organizationId: orgId,
      authorId: getUserId(req),
      ...req.body,
      status: 'open',
    };

    if (data.parentId) {
      const parents = await store.query(orgId, 'collaboration', (c: any) => c.id === data.parentId);
      const parent = parents[0];
      data.threadRootId = parent?.threadRootId || parent?.id || data.parentId;
    }

    const item = await store.insert(orgId, 'collaboration', req.body.body?.slice(0, 80) || 'Comment', data);
    res.status(201).json({ data: item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/collaboration/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const id = parseInt(req.params.id);
    const existing = await store.getById(id, orgId);
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = existing;
    const updated: any = { ...data, ...req.body };
    if (req.body.status === 'resolved') {
      updated.resolvedById = getUserId(req);
      updated.resolvedAt = new Date().toISOString();
    }

    const result = await store.update(id, orgId, updated);
    res.json({ data: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVAL REQUESTS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/approval-requests', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const { programId, status } = req.query;

    let items = await store.query(orgId, 'approval');
    if (programId) items = items.filter((a: any) => a.programId === parseInt(programId as string));
    if (status) items = items.filter((a: any) => a.status === status);

    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    items.sort((a: any, b: any) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
    });

    res.json({ data: items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/approval-requests', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const data = {
      organizationId: orgId,
      requestedById: userId,
      ...req.body,
      status: 'pending',
    };

    const item = await store.insert(orgId, 'approval', req.body.title || 'Approval Request', data);
    await logProvenance(orgId, item.programId, 'approval', item.id, 'requested', userId);
    res.status(201).json({ data: item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/approval-requests/:id/decide', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const id = parseInt(req.params.id);
    const item = await store.getById(id, orgId);
    if (!item) return res.status(404).json({ error: 'Approval request not found' });
    if (item.status !== 'pending') {
      return res.status(400).json({ error: `Request already ${item.status}` });
    }

    const { decision, comment } = req.body;
    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be "approved" or "rejected"' });
    }

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = item;
    const updated = {
      ...data,
      status: decision,
      decision,
      decisionBy: req.body.decisionBy || `User ${getUserId(req)}`,
      decisionComment: comment || '',
      decisionAt: new Date().toISOString(),
    };

    const result = await store.update(id, orgId, updated);
    await logProvenance(orgId, item.programId, 'approval', id, decision, getUserId(req), { comment });

    await store.insert(orgId, 'collaboration', `[${decision.toUpperCase()}] ${item.title}`, {
      organizationId: orgId,
      programId: item.programId,
      targetType: 'artifact',
      targetId: item.artifactId,
      type: decision === 'approved' ? 'comment' : 'change_request',
      body: `[${decision.toUpperCase()}] ${item.title}\n\n${comment || 'No comment provided.'}`,
      author: updated.decisionBy,
      role: item.assignedToRole,
      visibility: 'internal',
      priority: decision === 'rejected' ? 'high' : 'normal',
      status: 'open',
    });

    res.json({ data: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/approval-requests/:id/delegate', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const id = parseInt(req.params.id);
    const item = await store.getById(id, orgId);
    if (!item) return res.status(404).json({ error: 'Approval request not found' });
    if (item.status !== 'pending') {
      return res.status(400).json({ error: `Request already ${item.status}` });
    }

    const { delegateTo, delegateToRole, reason } = req.body;
    if (!delegateTo) return res.status(400).json({ error: 'delegateTo is required' });

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = item;
    const previousAssignee = data.assignedTo;
    const updated = {
      ...data,
      assignedTo: delegateTo,
      assignedToRole: delegateToRole || data.assignedToRole,
      delegatedFrom: previousAssignee,
      delegationReason: reason,
    };

    const result = await store.update(id, orgId, updated);
    await logProvenance(orgId, item.programId, 'approval', id, 'delegated', getUserId(req), {
      from: previousAssignee,
      to: delegateTo,
      reason,
    });

    res.json({ data: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHORITY INTERACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/authority-interactions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const interactions = await store.query(
      orgId,
      'authority_interaction',
      (i: any) => i.programId === programId,
    );
    res.json({ data: interactions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/programs/:programId/authority-interactions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const data = {
      programId,
      organizationId: orgId,
      ...req.body,
      status: 'planned',
    };

    const interaction = await store.insert(
      orgId,
      'authority_interaction',
      req.body.title || 'Authority Interaction',
      data,
    );
    await logProvenance(orgId, programId, 'authority-interaction', interaction.id, 'created', getUserId(req));
    res.status(201).json({ data: interaction });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROVENANCE
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/provenance', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const { entityType, entityId, limit } = req.query;

    let logs = await store.query(orgId, 'provenance', (p: any) => p.programId === programId);
    if (entityType) logs = logs.filter((p: any) => p.entityType === entityType);
    if (entityId) logs = logs.filter((p: any) => p.entityId === parseInt(entityId as string));
    logs.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (limit) logs = logs.slice(0, parseInt(limit as string));
    res.json({ data: logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// READINESS — Multi-axis readiness computation
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/readiness', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);

    const arts = await store.query(orgId, 'artifact', (a: any) => a.programId === programId);
    const evidence = await store.query(orgId, 'evidence', (e: any) => e.programId === programId);
    const reviews = await store.query(orgId, 'review', (r: any) => r.programId === programId);
    const risks = await store.query(orgId, 'risk', (r: any) => r.programId === programId);
    const deps = await store.query(orgId, 'dependency', (d: any) => d.programId === programId);
    const decisions = await store.query(orgId, 'decision', (d: any) => d.programId === programId);
    const provenance = await store.query(orgId, 'provenance', (p: any) => p.programId === programId);

    const totalArts = arts.length || 1;
    const completedArts = arts.filter((a: any) =>
      ['approved', 'locked', 'exported'].includes(a.lifecycleState),
    ).length;
    const draftingArts = arts.filter((a: any) => a.lifecycleState === 'drafting').length;
    const reviewArts = arts.filter((a: any) => a.lifecycleState === 'in-review').length;
    const approvedArts = arts.filter((a: any) =>
      ['approved', 'locked'].includes(a.lifecycleState),
    ).length;

    const totalEvidence = evidence.length || 1;
    const strongEvidence = evidence.filter((e: any) => e.strengthLevel === 'strong').length;
    const moderateEvidence = evidence.filter((e: any) => e.strengthLevel === 'moderate').length;

    const totalReviews = reviews.length || 1;
    const completedReviews = reviews.filter((r: any) => r.status === 'approved').length;

    const openRisks = risks.filter(
      (r: any) => r.status === 'open' || r.status === 'acknowledged',
    ).length;
    const criticalRisks = risks.filter(
      (r: any) => r.severity === 'critical' && r.status !== 'resolved',
    ).length;

    const staleDeps = deps.filter((d: any) => d.isStale).length;

    const readiness = {
      artifactCompleteness: Math.round(
        ((completedArts + draftingArts * 0.5 + reviewArts * 0.7) / totalArts) * 100,
      ),
      evidenceAdequacy: Math.round(
        ((strongEvidence * 1.0 + moderateEvidence * 0.6) / totalEvidence) * 100,
      ),
      reviewMaturity: Math.round((completedReviews / totalReviews) * 100),
      approvalMaturity: Math.round((approvedArts / totalArts) * 100),
      consistencyIntegrity: Math.max(0, 100 - staleDeps * 15),
      routeFit: 70,
      authorityConfidence: Math.max(0, 100 - criticalRisks * 25 - openRisks * 5),
      complianceIntegrity: provenance.length > 0 ? 85 : 50,
      timelineConfidence: Math.max(0, 100 - openRisks * 8),
    };

    const weights = [0.15, 0.15, 0.12, 0.12, 0.1, 0.1, 0.1, 0.08, 0.08];
    const values = Object.values(readiness);
    const overallConfidence = Math.round(
      values.reduce((sum, v, i) => sum + v * weights[i], 0),
    );

    const blockers = [];
    if (readiness.evidenceAdequacy < 50)
      blockers.push({
        type: 'evidence-gap',
        message: `Evidence adequacy at ${readiness.evidenceAdequacy}% — weak evidence chains detected`,
        severity: 'high',
      });
    if (readiness.approvalMaturity < 30)
      blockers.push({
        type: 'approval-gap',
        message: `Only ${approvedArts}/${totalArts} artifacts approved`,
        severity: 'medium',
      });
    if (staleDeps > 0)
      blockers.push({
        type: 'stale-dependencies',
        message: `${staleDeps} stale dependencies — upstream changes not reflected`,
        severity: 'high',
      });
    if (criticalRisks > 0)
      blockers.push({
        type: 'critical-risks',
        message: `${criticalRisks} critical risk(s) unresolved`,
        severity: 'critical',
      });

    const nextActions = [];
    const plannedArts = arts.filter((a: any) => a.lifecycleState === 'planned');
    if (plannedArts.length > 0)
      nextActions.push({
        action: 'Start drafting',
        target: plannedArts[0].title,
        priority: 'high',
        reason: `${plannedArts.length} artifacts still in planned state`,
      });
    const pendingReviews = reviews.filter(
      (r: any) => r.status === 'open' || r.status === 'in-review',
    );
    if (pendingReviews.length > 0)
      nextActions.push({
        action: 'Complete review',
        target: `${pendingReviews.length} reviews pending`,
        priority: 'medium',
        reason: 'Reviews blocking approval maturity',
      });
    if (evidence.length === 0)
      nextActions.push({
        action: 'Add evidence',
        target: 'Program evidence map is empty',
        priority: 'critical',
        reason: 'No evidence nodes linked to artifacts',
      });

    res.json({
      data: {
        readiness,
        overallConfidence,
        summary: {
          totalArtifacts: arts.length,
          completedArtifacts: completedArts,
          totalEvidence: evidence.length,
          strongEvidence,
          totalReviews: reviews.length,
          completedReviews,
          openRisks,
          criticalRisks,
          staleDependencies: staleDeps,
          decisions: decisions.length,
        },
        blockers,
        nextActions,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-SCAFFOLD
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/programs/:programId/scaffold', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
    const program = await store.getById(programId, orgId);
    if (!program) return res.status(404).json({ error: 'Program not found' });

    const { destinationType } = req.body;
    const userId = getUserId(req);
    const created: any[] = [];

    const templates: Record<
      string,
      Array<{ title: string; code: string; type: string; module: string; section?: string; level: string }>
    > = {
      IND: [
        { title: 'Module 1 — Administrative & Prescribing Info', code: '1', type: 'module', module: 'module-1', level: 'required' },
        { title: 'Module 2.1 — Table of Contents', code: '2.1', type: 'section', module: 'module-2', section: '2.1', level: 'required' },
        { title: 'Module 2.2 — Introduction', code: '2.2', type: 'section', module: 'module-2', section: '2.2', level: 'required' },
        { title: 'Module 2.3 — Quality Overall Summary', code: '2.3', type: 'section', module: 'module-2', section: '2.3', level: 'required' },
        { title: 'Module 2.4 — Nonclinical Overview', code: '2.4', type: 'section', module: 'module-2', section: '2.4', level: 'required' },
        { title: 'Module 2.5 — Clinical Overview', code: '2.5', type: 'section', module: 'module-2', section: '2.5', level: 'required' },
        { title: 'Module 2.6 — Nonclinical Summaries', code: '2.6', type: 'section', module: 'module-2', section: '2.6', level: 'required' },
        { title: 'Module 2.7 — Clinical Summary', code: '2.7', type: 'section', module: 'module-2', section: '2.7', level: 'required' },
        { title: 'Module 3.2.S — Drug Substance', code: '3.2.S', type: 'section', module: 'module-3', section: '3.2.S', level: 'required' },
        { title: 'Module 3.2.P — Drug Product', code: '3.2.P', type: 'section', module: 'module-3', section: '3.2.P', level: 'required' },
        { title: 'Module 4 — Nonclinical Study Reports', code: '4', type: 'module', module: 'module-4', level: 'required' },
        { title: 'Module 5 — Clinical Study Reports', code: '5', type: 'module', module: 'module-5', level: 'required' },
        { title: "Investigator's Brochure", code: 'IB', type: 'report', module: 'module-5', level: 'required' },
        { title: 'Clinical Protocol', code: 'PROT', type: 'protocol', module: 'module-5', level: 'required' },
      ],
      '510K': [
        { title: 'Cover Letter', code: 'CL', type: 'section', module: 'technical-file', level: 'required' },
        { title: 'Indications for Use Statement', code: 'IFU', type: 'section', module: 'technical-file', level: 'required' },
        { title: 'Substantial Equivalence Discussion', code: 'SE', type: 'section', module: 'technical-file', level: 'required' },
        { title: 'Device Description', code: 'DD', type: 'section', module: 'technical-file', level: 'required' },
        { title: 'Predicate Comparison', code: 'PC', type: 'section', module: 'technical-file', level: 'required' },
        { title: 'Performance Testing — Bench', code: 'PT-B', type: 'report', module: 'technical-file', level: 'required' },
        { title: 'Performance Testing — Clinical', code: 'PT-C', type: 'report', module: 'technical-file', level: 'conditional' },
        { title: 'Biocompatibility', code: 'BIO', type: 'report', module: 'technical-file', level: 'conditional' },
        { title: 'Software Documentation', code: 'SW', type: 'report', module: 'technical-file', level: 'conditional' },
        { title: 'Sterility / Shelf Life', code: 'SL', type: 'report', module: 'technical-file', level: 'conditional' },
        { title: 'Labeling', code: 'LBL', type: 'labeling', module: 'technical-file', level: 'required' },
        { title: 'Risk Analysis (ISO 14971)', code: 'RA', type: 'risk-file', module: 'technical-file', level: 'required' },
      ],
      NDA: [
        { title: 'Module 1 — Administrative', code: '1', type: 'module', module: 'module-1', level: 'required' },
        { title: 'Module 2.3 — Quality Overall Summary', code: '2.3', type: 'section', module: 'module-2', section: '2.3', level: 'required' },
        { title: 'Module 2.5 — Clinical Overview', code: '2.5', type: 'section', module: 'module-2', section: '2.5', level: 'required' },
        { title: 'Module 2.7 — Clinical Summary', code: '2.7', type: 'section', module: 'module-2', section: '2.7', level: 'required' },
        { title: 'Module 3 — Quality (CMC)', code: '3', type: 'module', module: 'module-3', level: 'required' },
        { title: 'Module 4 — Nonclinical', code: '4', type: 'module', module: 'module-4', level: 'required' },
        { title: 'Module 5 — Clinical', code: '5', type: 'module', module: 'module-5', level: 'required' },
        { title: 'Labeling', code: 'LBL', type: 'labeling', module: 'module-1', level: 'required' },
      ],
    };

    const artifactTemplates = templates[destinationType] || templates['IND'];

    for (const tpl of artifactTemplates) {
      const artifact = await store.insert(orgId, 'artifact', tpl.title, {
        programId,
        organizationId: orgId,
        title: tpl.title,
        artifactType: tpl.type,
        code: tpl.code,
        dossierModule: tpl.module,
        dossierSection: tpl.section || tpl.code,
        requirementLevel: tpl.level,
        lifecycleState: 'planned',
        version: '0.1',
        approvalState: 'none',
        exportReady: false,
      });
      created.push(artifact);
    }

    await logProvenance(orgId, programId, 'program', programId, 'scaffolded', userId, {
      description: `Auto-scaffolded ${created.length} artifacts for ${destinationType}`,
    });

    res.status(201).json({
      data: { artifactsCreated: created.length, artifacts: created, destinationType },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
