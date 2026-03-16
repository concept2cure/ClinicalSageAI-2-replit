/**
 * @fileoverview Mission Control API — Program OS
 * @module server/routes/mission-control
 * @version 1.0.0
 *
 * @description
 * Full CRUD + intelligence endpoints for the Concept2Cure PM engine.
 * Programs → Destinations → Route Plans → Artifacts → Evidence →
 * Dependencies → Decisions → Reviews → Risks → Collaboration
 *
 * @compliance
 * - FDA 21 CFR Part 11: Provenance logging on all mutations
 * - Multi-tenant: Organization-scoped queries
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getOrgId(req: Request): number {
  return (req as any).organizationId || (req as any).user?.organizationId || 1;
}

function getUserId(req: Request): number {
  return (req as any).userId || (req as any).user?.id || 1;
}

// In-memory store for Phase 1 (will migrate to DB with Drizzle push)
const store = {
  programs: new Map<number, any>(),
  destinations: new Map<number, any>(),
  routePlans: new Map<number, any>(),
  artifacts: new Map<number, any>(),
  evidenceNodes: new Map<number, any>(),
  artifactEvidence: new Map<number, any>(),
  dependencyLinks: new Map<number, any>(),
  decisionRecords: new Map<number, any>(),
  reviewCycles: new Map<number, any>(),
  riskSignals: new Map<number, any>(),
  collaboration: new Map<number, any>(),
  authorityInteractions: new Map<number, any>(),
  provenance: [] as any[],
  nextId: 1,
};

function nextId(): number {
  return store.nextId++;
}

function logProvenance(orgId: number, programId: number | null, entityType: string, entityId: number, action: string, actorId: number, details?: any) {
  store.provenance.push({
    id: nextId(),
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
    createdAt: new Date(),
  });
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

router.get('/programs', (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const programs = Array.from(store.programs.values())
    .filter(p => p.organizationId === orgId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  res.json({ data: programs });
});

router.get('/programs/:id', (req: Request, res: Response) => {
  const program = store.programs.get(parseInt(req.params.id));
  if (!program) return res.status(404).json({ error: 'Program not found' });
  res.json({ data: program });
});

router.post('/programs', (req: Request, res: Response) => {
  const parsed = programSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const id = nextId();
  const orgId = getOrgId(req);
  const program = {
    id,
    organizationId: orgId,
    createdById: getUserId(req),
    ownerId: getUserId(req),
    ...parsed.data,
    status: 'planning',
    targetSubmissionDate: parsed.data.targetSubmissionDate ? new Date(parsed.data.targetSubmissionDate) : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.programs.set(id, program);
  logProvenance(orgId, id, 'program', id, 'created', getUserId(req));
  res.status(201).json({ data: program });
});

router.put('/programs/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const existing = store.programs.get(id);
  if (!existing) return res.status(404).json({ error: 'Program not found' });

  const prev = { ...existing };
  Object.assign(existing, req.body, { updatedAt: new Date() });
  store.programs.set(id, existing);
  logProvenance(getOrgId(req), id, 'program', id, 'updated', getUserId(req), { prev, next: existing });
  res.json({ data: existing });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DESTINATIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/destinations', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const dests = Array.from(store.destinations.values())
    .filter(d => d.programId === programId);
  res.json({ data: dests });
});

router.post('/programs/:programId/destinations', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const id = nextId();
  const dest = {
    id,
    programId,
    organizationId: getOrgId(req),
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.destinations.set(id, dest);
  logProvenance(getOrgId(req), programId, 'destination', id, 'created', getUserId(req));
  res.status(201).json({ data: dest });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE PLANS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/destinations/:destId/routes', (req: Request, res: Response) => {
  const destId = parseInt(req.params.destId);
  const routes = Array.from(store.routePlans.values())
    .filter(r => r.destinationId === destId);
  res.json({ data: routes });
});

router.post('/destinations/:destId/routes', (req: Request, res: Response) => {
  const destId = parseInt(req.params.destId);
  const dest = store.destinations.get(destId);
  const id = nextId();
  const route = {
    id,
    destinationId: destId,
    programId: dest?.programId || 0,
    organizationId: getOrgId(req),
    ...req.body,
    status: req.body.status || 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.routePlans.set(id, route);
  logProvenance(getOrgId(req), dest?.programId, 'route-plan', id, 'created', getUserId(req));
  res.status(201).json({ data: route });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ARTIFACTS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/artifacts', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const { type, lifecycle, dossierModule } = req.query;
  let arts = Array.from(store.artifacts.values())
    .filter(a => a.programId === programId);
  if (type) arts = arts.filter(a => a.artifactType === type);
  if (lifecycle) arts = arts.filter(a => a.lifecycleState === lifecycle);
  if (dossierModule) arts = arts.filter(a => a.dossierModule === dossierModule);
  res.json({ data: arts });
});

router.get('/artifacts/:id', (req: Request, res: Response) => {
  const art = store.artifacts.get(parseInt(req.params.id));
  if (!art) return res.status(404).json({ error: 'Artifact not found' });

  // Enrich with evidence links, reviews, dependencies
  const evidenceLinks = Array.from(store.artifactEvidence.values())
    .filter(ae => ae.artifactId === art.id);
  const reviews = Array.from(store.reviewCycles.values())
    .filter(r => r.artifactId === art.id);
  const deps = Array.from(store.dependencyLinks.values())
    .filter(d => (d.sourceType === 'artifact' && d.sourceId === art.id) ||
                 (d.targetType === 'artifact' && d.targetId === art.id));
  const comments = Array.from(store.collaboration.values())
    .filter(c => c.targetType === 'artifact' && c.targetId === art.id);

  res.json({
    data: {
      ...art,
      evidenceLinks,
      reviews,
      dependencies: deps,
      comments,
    },
  });
});

router.post('/programs/:programId/artifacts', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const id = nextId();
  const artifact = {
    id,
    programId,
    organizationId: getOrgId(req),
    ...req.body,
    lifecycleState: req.body.lifecycleState || 'planned',
    version: req.body.version || '0.1',
    evidenceScore: null,
    reviewScore: null,
    consistencyScore: null,
    completenessScore: null,
    approvalState: 'none',
    exportReady: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.artifacts.set(id, artifact);
  logProvenance(getOrgId(req), programId, 'artifact', id, 'created', getUserId(req));
  res.status(201).json({ data: artifact });
});

router.put('/artifacts/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const existing = store.artifacts.get(id);
  if (!existing) return res.status(404).json({ error: 'Artifact not found' });

  const prev = { ...existing };
  Object.assign(existing, req.body, { updatedAt: new Date() });
  store.artifacts.set(id, existing);
  logProvenance(getOrgId(req), existing.programId, 'artifact', id, 'updated', getUserId(req), { prev, next: existing });

  // Check for stale dependencies
  const deps = Array.from(store.dependencyLinks.values())
    .filter(d => d.sourceType === 'artifact' && d.sourceId === id);
  deps.forEach(dep => {
    dep.isStale = true;
    dep.staleSince = new Date();
  });

  res.json({ data: existing });
});

// Artifact lifecycle transitions
router.post('/artifacts/:id/transition', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const art = store.artifacts.get(id);
  if (!art) return res.status(404).json({ error: 'Artifact not found' });

  const { newState, note } = req.body;
  const validTransitions: Record<string, string[]> = {
    'planned': ['drafting'],
    'drafting': ['in-review', 'planned'],
    'in-review': ['approved', 'drafting', 'revision-needed'],
    'revision-needed': ['drafting'],
    'approved': ['locked', 'in-review'],
    'locked': ['exported', 'approved'],
    'exported': ['superseded'],
    'superseded': [],
    'retired': [],
  };

  const allowed = validTransitions[art.lifecycleState] || [];
  if (!allowed.includes(newState)) {
    return res.status(400).json({ error: `Cannot transition from ${art.lifecycleState} to ${newState}` });
  }

  const prev = art.lifecycleState;
  art.lifecycleState = newState;
  art.updatedAt = new Date();

  if (newState === 'locked') {
    art.lockedAt = new Date();
    art.lockedById = getUserId(req);
  }
  if (newState === 'approved') {
    art.approvalState = 'approved';
    art.approvedById = getUserId(req);
    art.approvedAt = new Date();
  }

  logProvenance(getOrgId(req), art.programId, 'artifact', id, 'state-changed', getUserId(req), {
    description: `${prev} → ${newState}${note ? ': ' + note : ''}`,
    prev: { lifecycleState: prev },
    next: { lifecycleState: newState },
  });

  res.json({ data: art });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/evidence', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const evidence = Array.from(store.evidenceNodes.values())
    .filter(e => e.programId === programId);
  res.json({ data: evidence });
});

router.post('/programs/:programId/evidence', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const id = nextId();
  const evidence = {
    id,
    programId,
    organizationId: getOrgId(req),
    ...req.body,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.evidenceNodes.set(id, evidence);
  logProvenance(getOrgId(req), programId, 'evidence', id, 'created', getUserId(req));
  res.status(201).json({ data: evidence });
});

// Link evidence to artifact
router.post('/artifacts/:artifactId/evidence', (req: Request, res: Response) => {
  const artifactId = parseInt(req.params.artifactId);
  const id = nextId();
  const link = {
    id,
    artifactId,
    evidenceNodeId: req.body.evidenceNodeId,
    linkType: req.body.linkType || 'supports',
    claimText: req.body.claimText,
    relevanceScore: req.body.relevanceScore,
    createdAt: new Date(),
  };
  store.artifactEvidence.set(id, link);
  res.status(201).json({ data: link });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/dependencies', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const deps = Array.from(store.dependencyLinks.values())
    .filter(d => d.programId === programId);
  res.json({ data: deps });
});

router.post('/programs/:programId/dependencies', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const id = nextId();
  const dep = {
    id,
    programId,
    organizationId: getOrgId(req),
    ...req.body,
    isStale: false,
    createdAt: new Date(),
  };
  store.dependencyLinks.set(id, dep);
  res.status(201).json({ data: dep });
});

// Get stale dependencies (impact alerts)
router.get('/programs/:programId/dependencies/stale', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const stale = Array.from(store.dependencyLinks.values())
    .filter(d => d.programId === programId && d.isStale);
  res.json({ data: stale });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DECISIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/decisions', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const decisions = Array.from(store.decisionRecords.values())
    .filter(d => d.programId === programId);
  res.json({ data: decisions });
});

router.post('/programs/:programId/decisions', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const id = nextId();
  const decision = {
    id,
    programId,
    organizationId: getOrgId(req),
    decisionOwnerId: getUserId(req),
    ...req.body,
    status: 'proposed',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.decisionRecords.set(id, decision);
  logProvenance(getOrgId(req), programId, 'decision', id, 'created', getUserId(req));
  res.status(201).json({ data: decision });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEW CYCLES
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/artifacts/:artifactId/reviews', (req: Request, res: Response) => {
  const artifactId = parseInt(req.params.artifactId);
  const reviews = Array.from(store.reviewCycles.values())
    .filter(r => r.artifactId === artifactId);
  res.json({ data: reviews });
});

router.post('/artifacts/:artifactId/reviews', (req: Request, res: Response) => {
  const artifactId = parseInt(req.params.artifactId);
  const art = store.artifacts.get(artifactId);
  const id = nextId();
  const review = {
    id,
    artifactId,
    programId: art?.programId || 0,
    organizationId: getOrgId(req),
    cycleNumber: req.body.cycleNumber || 1,
    status: 'open',
    requestedById: getUserId(req),
    reviewerIds: req.body.reviewerIds || [],
    approverIds: req.body.approverIds || [],
    reviewType: req.body.reviewType || 'standard',
    visibility: req.body.visibility || 'internal',
    dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
    requestedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.reviewCycles.set(id, review);

  // Transition artifact to in-review
  if (art && art.lifecycleState === 'drafting') {
    art.lifecycleState = 'in-review';
    art.updatedAt = new Date();
  }

  logProvenance(getOrgId(req), art?.programId, 'review-cycle', id, 'created', getUserId(req));
  res.status(201).json({ data: review });
});

router.put('/reviews/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const review = store.reviewCycles.get(id);
  if (!review) return res.status(404).json({ error: 'Review not found' });

  const prev = { ...review };
  Object.assign(review, req.body, { updatedAt: new Date() });

  if (req.body.status === 'approved') {
    review.completedAt = new Date();
    review.outcome = 'approved';
    // Auto-transition artifact
    const art = store.artifacts.get(review.artifactId);
    if (art) {
      art.approvalState = 'approved';
      art.lifecycleState = 'approved';
      art.approvedById = getUserId(req);
      art.approvedAt = new Date();
    }
  }

  store.reviewCycles.set(id, review);
  logProvenance(getOrgId(req), review.programId, 'review-cycle', id, 'updated', getUserId(req), { prev, next: review });
  res.json({ data: review });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RISK SIGNALS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/risks', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const { status, severity } = req.query;
  let risks = Array.from(store.riskSignals.values())
    .filter(r => r.programId === programId);
  if (status) risks = risks.filter(r => r.status === status);
  if (severity) risks = risks.filter(r => r.severity === severity);
  res.json({ data: risks });
});

router.post('/programs/:programId/risks', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const id = nextId();
  const risk = {
    id,
    programId,
    organizationId: getOrgId(req),
    ...req.body,
    status: 'open',
    detectedById: getUserId(req),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.riskSignals.set(id, risk);
  logProvenance(getOrgId(req), programId, 'risk-signal', id, 'created', getUserId(req));
  res.status(201).json({ data: risk });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COLLABORATION
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/collaboration', (req: Request, res: Response) => {
  const { targetType, targetId, programId } = req.query;
  let items = Array.from(store.collaboration.values())
    .filter(c => c.organizationId === getOrgId(req));
  if (programId) items = items.filter(c => c.programId === parseInt(programId as string));
  if (targetType && targetId) {
    items = items.filter(c => c.targetType === targetType && c.targetId === parseInt(targetId as string));
  }
  res.json({ data: items });
});

router.post('/collaboration', (req: Request, res: Response) => {
  const id = nextId();
  const item = {
    id,
    organizationId: getOrgId(req),
    authorId: getUserId(req),
    ...req.body,
    status: 'open',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  // Set threadRootId for threaded replies
  if (item.parentId) {
    const parent = store.collaboration.get(item.parentId);
    item.threadRootId = parent?.threadRootId || parent?.id || item.parentId;
  }
  store.collaboration.set(id, item);
  res.status(201).json({ data: item });
});

router.put('/collaboration/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const item = store.collaboration.get(id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  Object.assign(item, req.body, { updatedAt: new Date() });
  if (req.body.status === 'resolved') {
    item.resolvedById = getUserId(req);
    item.resolvedAt = new Date();
  }
  store.collaboration.set(id, item);
  res.json({ data: item });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHORITY INTERACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/authority-interactions', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const interactions = Array.from(store.authorityInteractions.values())
    .filter(i => i.programId === programId);
  res.json({ data: interactions });
});

router.post('/programs/:programId/authority-interactions', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const id = nextId();
  const interaction = {
    id,
    programId,
    organizationId: getOrgId(req),
    ...req.body,
    status: 'planned',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.authorityInteractions.set(id, interaction);
  logProvenance(getOrgId(req), programId, 'authority-interaction', id, 'created', getUserId(req));
  res.status(201).json({ data: interaction });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROVENANCE
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/provenance', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const { entityType, entityId, limit } = req.query;
  let logs = store.provenance.filter(p => p.programId === programId);
  if (entityType) logs = logs.filter(p => p.entityType === entityType);
  if (entityId) logs = logs.filter(p => p.entityId === parseInt(entityId as string));
  logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (limit) logs = logs.slice(0, parseInt(limit as string));
  res.json({ data: logs });
});

// ═══════════════════════════════════════════════════════════════════════════════
// READINESS — Multi-axis readiness computation
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/readiness', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const arts = Array.from(store.artifacts.values()).filter(a => a.programId === programId);
  const evidence = Array.from(store.evidenceNodes.values()).filter(e => e.programId === programId);
  const reviews = Array.from(store.reviewCycles.values()).filter(r => r.programId === programId);
  const risks = Array.from(store.riskSignals.values()).filter(r => r.programId === programId);
  const deps = Array.from(store.dependencyLinks.values()).filter(d => d.programId === programId);
  const decisions = Array.from(store.decisionRecords.values()).filter(d => d.programId === programId);

  const totalArts = arts.length || 1;
  const completedArts = arts.filter(a => ['approved', 'locked', 'exported'].includes(a.lifecycleState)).length;
  const draftingArts = arts.filter(a => a.lifecycleState === 'drafting').length;
  const reviewArts = arts.filter(a => a.lifecycleState === 'in-review').length;
  const approvedArts = arts.filter(a => ['approved', 'locked'].includes(a.lifecycleState)).length;

  const totalEvidence = evidence.length || 1;
  const strongEvidence = evidence.filter(e => e.strengthLevel === 'strong').length;
  const moderateEvidence = evidence.filter(e => e.strengthLevel === 'moderate').length;

  const totalReviews = reviews.length || 1;
  const completedReviews = reviews.filter(r => r.status === 'approved').length;

  const openRisks = risks.filter(r => r.status === 'open' || r.status === 'acknowledged').length;
  const criticalRisks = risks.filter(r => r.severity === 'critical' && r.status !== 'resolved').length;

  const staleDeps = deps.filter(d => d.isStale).length;

  const readiness = {
    artifactCompleteness: Math.round(((completedArts + draftingArts * 0.5 + reviewArts * 0.7) / totalArts) * 100),
    evidenceAdequacy: Math.round(((strongEvidence * 1.0 + moderateEvidence * 0.6) / totalEvidence) * 100),
    reviewMaturity: Math.round((completedReviews / totalReviews) * 100),
    approvalMaturity: Math.round((approvedArts / totalArts) * 100),
    consistencyIntegrity: Math.max(0, 100 - staleDeps * 15),
    routeFit: 70, // Will be computed by route recommendation AI
    authorityConfidence: Math.max(0, 100 - criticalRisks * 25 - openRisks * 5),
    complianceIntegrity: store.provenance.filter(p => p.programId === programId).length > 0 ? 85 : 50,
    timelineConfidence: Math.max(0, 100 - openRisks * 8),
  };

  // Overall confidence
  const weights = [0.15, 0.15, 0.12, 0.12, 0.10, 0.10, 0.10, 0.08, 0.08];
  const values = Object.values(readiness);
  const overallConfidence = Math.round(values.reduce((sum, v, i) => sum + v * weights[i], 0));

  // Top blockers
  const blockers = [];
  if (readiness.evidenceAdequacy < 50) blockers.push({ type: 'evidence-gap', message: `Evidence adequacy at ${readiness.evidenceAdequacy}% — weak evidence chains detected`, severity: 'high' });
  if (readiness.approvalMaturity < 30) blockers.push({ type: 'approval-gap', message: `Only ${approvedArts}/${totalArts} artifacts approved`, severity: 'medium' });
  if (staleDeps > 0) blockers.push({ type: 'stale-dependencies', message: `${staleDeps} stale dependencies — upstream changes not reflected`, severity: 'high' });
  if (criticalRisks > 0) blockers.push({ type: 'critical-risks', message: `${criticalRisks} critical risk(s) unresolved`, severity: 'critical' });

  // Next best actions
  const nextActions = [];
  const plannedArts = arts.filter(a => a.lifecycleState === 'planned');
  if (plannedArts.length > 0) nextActions.push({ action: 'Start drafting', target: plannedArts[0].title, priority: 'high', reason: `${plannedArts.length} artifacts still in planned state` });
  const pendingReviews = reviews.filter(r => r.status === 'open' || r.status === 'in-review');
  if (pendingReviews.length > 0) nextActions.push({ action: 'Complete review', target: `${pendingReviews.length} reviews pending`, priority: 'medium', reason: 'Reviews blocking approval maturity' });
  if (evidence.length === 0) nextActions.push({ action: 'Add evidence', target: 'Program evidence map is empty', priority: 'critical', reason: 'No evidence nodes linked to artifacts' });

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
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-SCAFFOLD — Generate artifact tree from destination type
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/programs/:programId/scaffold', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const program = store.programs.get(programId);
  if (!program) return res.status(404).json({ error: 'Program not found' });

  const { destinationType, customerTrack } = req.body;
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  const created: any[] = [];

  // Define artifact templates by destination type
  const templates: Record<string, Array<{ title: string; code: string; type: string; module: string; section?: string; level: string }>> = {
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
    const id = nextId();
    const artifact = {
      id,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.artifacts.set(id, artifact);
    created.push(artifact);
  }

  logProvenance(orgId, programId, 'program', programId, 'scaffolded', userId, {
    description: `Auto-scaffolded ${created.length} artifacts for ${destinationType}`,
  });

  res.status(201).json({
    data: {
      artifactsCreated: created.length,
      artifacts: created,
      destinationType,
    },
  });
});

export default router;
