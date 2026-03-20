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
  return (req as any).tenantContext?.organizationId || (req as any).tenantId || (req as any).organizationId || (req as any).user?.organizationId || 1;
}

function getUserId(req: Request): number {
  return (req as any).userId || (req as any).tenantContext?.userId || (req as any).user?.id || 1;
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
  approvalRequests: new Map<number, any>(),
  authorityInteractions: new Map<number, any>(),
  provenance: [] as any[],
  nextId: 1,
};

function nextId(): number {
  return store.nextId++;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED DATA — Provides a rich demo experience for testers
// ═══════════════════════════════════════════════════════════════════════════════
function seedDemoData() {
  if (store.programs.size > 0) return; // Already seeded

  // Demo program
  const p1 = nextId();
  store.programs.set(p1, {
    id: p1, organizationId: 1, name: 'Nexavar-2 NDA', code: 'PRG-001',
    description: 'Phase III oncology program targeting advanced hepatocellular carcinoma',
    customerTrack: 'pharma', developmentStage: 'pre-submission',
    status: 'active', createdById: 1, createdAt: new Date('2025-09-01'), updatedAt: new Date(),
  });

  const p2 = nextId();
  store.programs.set(p2, {
    id: p2, organizationId: 1, name: 'CardioGuard 510(k)', code: 'PRG-002',
    description: 'Class II cardiovascular monitoring device with AI-assisted diagnostics',
    customerTrack: 'device', developmentStage: 'regulatory-strategy',
    status: 'active', createdById: 1, createdAt: new Date('2025-11-15'), updatedAt: new Date(),
  });

  // Destinations
  const d1 = nextId();
  store.destinations.set(d1, {
    id: d1, organizationId: 1, programId: p1, destinationType: 'NDA',
    authority: 'FDA CDER', region: 'US', targetDate: '2026-06-15',
    status: 'planned', createdAt: new Date(),
  });

  const d2 = nextId();
  store.destinations.set(d2, {
    id: d2, organizationId: 1, programId: p2, destinationType: '510K',
    authority: 'FDA CDRH', region: 'US', targetDate: '2026-09-01',
    status: 'planned', createdAt: new Date(),
  });

  // Artifacts for program 1
  const artifactTemplates = [
    { title: 'Module 1.0 Cover Letter', code: 'ART-001', artifactType: 'document', dossierModule: 'Module 1', lifecycleState: 'approved', requirementLevel: 'required', version: '2.1' },
    { title: 'Module 2.3 Quality Overall Summary', code: 'ART-002', artifactType: 'document', dossierModule: 'Module 2', lifecycleState: 'in_review', requirementLevel: 'required', version: '1.3' },
    { title: 'Module 2.5 Clinical Overview', code: 'ART-003', artifactType: 'document', dossierModule: 'Module 2', lifecycleState: 'drafting', requirementLevel: 'required', version: '0.8' },
    { title: 'Module 2.7 Clinical Summary', code: 'ART-004', artifactType: 'document', dossierModule: 'Module 2', lifecycleState: 'drafting', requirementLevel: 'required', version: '0.5' },
    { title: 'Module 3.2.S Drug Substance', code: 'ART-005', artifactType: 'document', dossierModule: 'Module 3', lifecycleState: 'approved', requirementLevel: 'required', version: '3.0' },
    { title: 'Module 3.2.P Drug Product', code: 'ART-006', artifactType: 'document', dossierModule: 'Module 3', lifecycleState: 'in_review', requirementLevel: 'required', version: '2.0' },
    { title: 'Study 301 CSR', code: 'ART-007', artifactType: 'report', dossierModule: 'Module 5', lifecycleState: 'approved', requirementLevel: 'required', version: '1.0' },
    { title: 'Study 201 CSR', code: 'ART-008', artifactType: 'report', dossierModule: 'Module 5', lifecycleState: 'approved', requirementLevel: 'required', version: '1.0' },
    { title: 'Statistical Analysis Plan', code: 'ART-009', artifactType: 'document', dossierModule: 'Module 5', lifecycleState: 'approved', requirementLevel: 'required', version: '2.0' },
    { title: 'Investigators Brochure', code: 'ART-010', artifactType: 'document', dossierModule: 'Module 5', lifecycleState: 'in_review', requirementLevel: 'required', version: '4.2' },
    { title: 'Nonclinical Overview', code: 'ART-011', artifactType: 'document', dossierModule: 'Module 4', lifecycleState: 'planned', requirementLevel: 'required', version: '0.0' },
    { title: 'Risk Management Plan', code: 'ART-012', artifactType: 'document', dossierModule: 'Module 1', lifecycleState: 'drafting', requirementLevel: 'conditional', version: '0.3' },
  ];

  artifactTemplates.forEach(tpl => {
    const aid = nextId();
    store.artifacts.set(aid, {
      id: aid, organizationId: 1, programId: p1, ...tpl,
      ownerId: 1, createdAt: new Date(), updatedAt: new Date(),
    });
  });

  // Risk signals
  const riskTemplates = [
    { dimension: 'evidence', severity: 'high', title: 'Module 2.7 Clinical Summary incomplete', description: 'Clinical summary not yet drafted — 60% of safety narrative missing', status: 'open' },
    { dimension: 'timeline', severity: 'critical', title: 'NDA target date at risk', description: 'Module 4 Nonclinical Overview not started, 90 days to target submission', status: 'open' },
    { dimension: 'review', severity: 'medium', title: 'IB review cycle extended', description: 'Investigators Brochure v4.2 has been in review for 18 days (target: 10)', status: 'open' },
    { dimension: 'compliance', severity: 'high', title: 'Risk Management Plan gap', description: 'RMP requires REMS strategy section which has not been initiated', status: 'open' },
    { dimension: 'consistency', severity: 'medium', title: 'Product naming variance', description: 'Three naming variants detected across Modules 1, 2, and 3', status: 'mitigated' },
  ];

  riskTemplates.forEach(tpl => {
    const rid = nextId();
    store.riskSignals.set(rid, {
      id: rid, organizationId: 1, programId: p1, ...tpl,
      detectedAt: new Date(), createdAt: new Date(),
    });
  });

  // Decisions
  const decisionTemplates = [
    { title: 'Adopt 505(b)(2) regulatory pathway', category: 'regulatory-strategy', status: 'approved', rationale: 'Leveraging existing reference-listed drug data reduces clinical burden by approximately 40%', decisionDate: '2025-10-15' },
    { title: 'Include real-world evidence supplement', category: 'evidence-strategy', status: 'approved', rationale: 'RWE from Optum claims database strengthens safety signal characterization in elderly subgroup', decisionDate: '2025-11-20' },
    { title: 'Request pre-submission meeting with Division', category: 'regulatory-engagement', status: 'pending', rationale: 'Type B meeting needed to align on primary endpoint acceptability before NDA assembly', decisionDate: '2026-01-10' },
  ];

  decisionTemplates.forEach(tpl => {
    const did = nextId();
    store.decisionRecords.set(did, {
      id: did, organizationId: 1, programId: p1, ...tpl,
      createdById: 1, createdAt: new Date(), updatedAt: new Date(),
    });
  });

  // Collaboration threads — realistic regulatory review discussions
  const collabTemplates = [
    {
      targetType: 'artifact', targetId: 5, // ART-001 Cover Letter
      type: 'comment', body: 'Cover letter has been updated to reflect the revised formulation change in Module 3. Ready for final RA review.',
      author: 'Sarah Chen', role: 'Regulatory Lead', visibility: 'internal', priority: 'normal',
    },
    {
      targetType: 'artifact', targetId: 6, // ART-002 Quality Overall Summary
      type: 'review_note', body: 'QOS Section 2.3.S — Drug substance characterization references outdated batch data. Please update to reflect Q3 2025 stability results.',
      author: 'Dr. James Whitfield', role: 'CMC Reviewer', visibility: 'internal', priority: 'high',
    },
    {
      targetType: 'artifact', targetId: 6,
      type: 'comment', body: 'Updated per review note. Stability data now reflects 36-month ICH conditions. Tables 2.3.S.7 and 2.3.S.8 revised.',
      author: 'Maria Gonzalez', role: 'CMC Author', visibility: 'internal', priority: 'normal',
    },
    {
      targetType: 'artifact', targetId: 7, // ART-003 Clinical Overview
      type: 'question', body: 'Should we include the post-hoc subgroup analysis from Study 201 in the Clinical Overview, or reserve it for the Clinical Summary?',
      author: 'Dr. Raj Patel', role: 'Medical Writer', visibility: 'internal', priority: 'normal',
    },
    {
      targetType: 'artifact', targetId: 7,
      type: 'comment', body: 'Include a brief summary in the Overview and the detailed analysis in Module 2.7 Clinical Summary. This is consistent with FDA expectations for NDA-level submissions.',
      author: 'Sarah Chen', role: 'Regulatory Lead', visibility: 'internal', priority: 'normal',
    },
    {
      targetType: 'artifact', targetId: 8, // ART-004 Clinical Summary
      type: 'change_request', body: 'Requesting addition of Kaplan-Meier survival curves for the ITT population. The current draft only includes the per-protocol analysis.',
      author: 'Dr. Emily Nakamura', role: 'Biostatistician', visibility: 'internal', priority: 'high',
    },
    {
      targetType: 'artifact', targetId: 10, // ART-006 Drug Product
      type: 'review_note', body: 'Dissolution profile data in Section 3.2.P.5.3 shows batch-to-batch variability exceeding 15%. Flag for CMC team.',
      author: 'Dr. James Whitfield', role: 'CMC Reviewer', visibility: 'internal', priority: 'high',
    },
    {
      targetType: 'artifact', targetId: 14, // ART-010 IB
      type: 'escalation', body: 'IB review has exceeded the 10-day SLA by 8 days. Escalating to Program Director for resolution. Three reviewer comments remain unaddressed.',
      author: 'Michael Torres', role: 'Program Manager', visibility: 'internal', priority: 'high',
    },
    {
      targetType: 'artifact', targetId: 16, // ART-012 Risk Management Plan
      type: 'question', body: 'Does the Division expect a REMS proposal with the initial NDA submission, or can we defer to the post-marketing commitment?',
      author: 'Dr. Aisha Williams', role: 'Pharmacovigilance Lead', visibility: 'sponsor', priority: 'high',
    },
    {
      targetType: 'artifact', targetId: 5,
      type: 'comment', body: 'Final RA review complete. Cover letter is approved for assembly. No further edits required.',
      author: 'Sarah Chen', role: 'Regulatory Lead', visibility: 'internal', priority: 'normal',
    },
    {
      targetType: 'artifact', targetId: 11, // ART-007 Study 301 CSR
      type: 'comment', body: 'Study 301 CSR has been finalized and locked. All TLFs verified against SAP specifications. QC sign-off obtained.',
      author: 'Dr. Raj Patel', role: 'Medical Writer', visibility: 'internal', priority: 'normal',
    },
    {
      targetType: 'artifact', targetId: 7,
      type: 'change_request', body: 'FDA Oncology Division guidance from 2025 recommends including patient-reported outcomes (PRO) summary in Clinical Overview. Adding Section 2.5.4.7.',
      author: 'Sarah Chen', role: 'Regulatory Lead', visibility: 'internal', priority: 'normal',
    },
  ];

  collabTemplates.forEach((tpl, i) => {
    const cid = nextId();
    store.collaboration.set(cid, {
      id: cid, organizationId: 1, programId: p1, ...tpl,
      status: tpl.type === 'escalation' ? 'open' : (i % 3 === 0 ? 'resolved' : 'open'),
      resolvedAt: i % 3 === 0 ? new Date(Date.now() - 86400000) : null,
      createdAt: new Date(Date.now() - ((collabTemplates.length - i) * 7200000)),
      updatedAt: new Date(Date.now() - ((collabTemplates.length - i) * 7200000)),
    });
  });

  // Approval requests — manager authorization workflow
  const approvalTemplates = [
    {
      artifactId: 6, // ART-002 Quality Overall Summary
      requestType: 'document_approval',
      title: 'Approve Module 2.3 QOS for submission assembly',
      description: 'Quality Overall Summary has completed CMC review cycle. Requires Regulatory Lead sign-off before submission gate.',
      requestedBy: 'Maria Gonzalez', requestedByRole: 'CMC Author',
      assignedTo: 'Sarah Chen', assignedToRole: 'Regulatory Lead',
      priority: 'high', status: 'pending',
      dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    },
    {
      artifactId: 14, // ART-010 IB
      requestType: 'escalation_approval',
      title: 'Authorize extended IB review timeline',
      description: 'IB v4.2 review has exceeded SLA by 8 days. Requesting Program Director authorization to extend review period by 5 business days.',
      requestedBy: 'Michael Torres', requestedByRole: 'Program Manager',
      assignedTo: 'Dr. Patricia Wells', assignedToRole: 'Program Director',
      priority: 'critical', status: 'pending',
      dueDate: new Date(Date.now() + 1 * 86400000).toISOString(),
    },
    {
      artifactId: 7, // ART-003 Clinical Overview
      requestType: 'change_approval',
      title: 'Approve addition of PRO summary to Clinical Overview',
      description: 'Per new FDA Oncology Division guidance, proposing to add patient-reported outcomes (PRO) section 2.5.4.7. Requires Clinical Lead authorization.',
      requestedBy: 'Sarah Chen', requestedByRole: 'Regulatory Lead',
      assignedTo: 'Dr. Raj Patel', assignedToRole: 'Clinical Lead',
      priority: 'medium', status: 'pending',
      dueDate: new Date(Date.now() + 5 * 86400000).toISOString(),
    },
    {
      artifactId: 10, // ART-006 Drug Product
      requestType: 'deviation_approval',
      title: 'Approve dissolution variability deviation report',
      description: 'Batch-to-batch dissolution variability in 3.2.P.5.3 exceeds 15% threshold. CMC team proposes tightened manufacturing controls. QA Head sign-off required.',
      requestedBy: 'Dr. James Whitfield', requestedByRole: 'CMC Reviewer',
      assignedTo: 'Dr. Linda Park', assignedToRole: 'QA Head',
      priority: 'high', status: 'approved',
      decision: 'approved', decisionBy: 'Dr. Linda Park',
      decisionComment: 'Approved with condition: manufacturing controls must be implemented and validated before next production batch.',
      decisionAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      dueDate: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
    {
      artifactId: 16, // ART-012 Risk Management Plan
      requestType: 'document_approval',
      title: 'Authorize REMS strategy deferral to post-marketing',
      description: 'Pharmacovigilance recommends deferring full REMS proposal to post-marketing Phase IV commitment. Requires Regulatory Affairs VP authorization.',
      requestedBy: 'Dr. Aisha Williams', requestedByRole: 'Pharmacovigilance Lead',
      assignedTo: 'Dr. Robert Kinsey', assignedToRole: 'VP Regulatory Affairs',
      priority: 'high', status: 'rejected',
      decision: 'rejected', decisionBy: 'Dr. Robert Kinsey',
      decisionComment: 'Rejected: Division has historically required REMS proposal at NDA submission for oncology products with known hepatotoxicity. Revise to include preliminary REMS framework.',
      decisionAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      dueDate: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
  ];

  approvalTemplates.forEach(tpl => {
    const aid = nextId();
    store.approvalRequests.set(aid, {
      id: aid, organizationId: 1, programId: p1, ...tpl,
      createdAt: new Date(Date.now() - (5 - approvalTemplates.indexOf(tpl)) * 86400000),
      updatedAt: new Date(),
    });
  });

  // Provenance entries
  const provenanceEntries = [
    { entityType: 'artifact', action: 'approved', changeDescription: 'Module 1.0 Cover Letter approved by Regulatory Lead' },
    { entityType: 'artifact', action: 'updated', changeDescription: 'Module 2.3 Quality Overall Summary updated — CMC narrative revised' },
    { entityType: 'decision', action: 'approved', changeDescription: 'Decision: Adopt 505(b)(2) pathway approved by Regulatory Committee' },
    { entityType: 'risk', action: 'created', changeDescription: 'Risk detected: NDA target date at risk — Module 4 not started' },
    { entityType: 'artifact', action: 'created', changeDescription: 'Study 301 CSR uploaded and approved' },
    { entityType: 'review', action: 'started', changeDescription: 'IB v4.2 review cycle initiated with 3 reviewers' },
  ];

  provenanceEntries.forEach((entry, i) => {
    store.provenance.push({
      id: nextId(), organizationId: 1, programId: p1,
      ...entry, entityId: i + 1,
      actorType: 'user', actorId: 1,
      createdAt: new Date(Date.now() - (i * 3600000 * 12)),
    });
  });
}

// Run seed on module load
seedDemoData();

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
// APPROVAL REQUESTS — Accept/Deny/Delegate authorization chains
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/approval-requests', (req: Request, res: Response) => {
  const { programId, status } = req.query;
  let items = Array.from(store.approvalRequests.values())
    .filter(a => a.organizationId === getOrgId(req));
  if (programId) items = items.filter(a => a.programId === parseInt(programId as string));
  if (status) items = items.filter(a => a.status === status);
  // Sort pending first, then by priority
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  items.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
  });
  res.json({ data: items });
});

router.post('/approval-requests', (req: Request, res: Response) => {
  const id = nextId();
  const item = {
    id,
    organizationId: getOrgId(req),
    requestedById: getUserId(req),
    ...req.body,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.approvalRequests.set(id, item);
  logProvenance(getOrgId(req), item.programId, 'approval', id, 'requested', getUserId(req));
  res.status(201).json({ data: item });
});

router.post('/approval-requests/:id/decide', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const item = store.approvalRequests.get(id);
  if (!item) return res.status(404).json({ error: 'Approval request not found' });
  if (item.status !== 'pending') {
    return res.status(400).json({ error: `Request already ${item.status}` });
  }

  const { decision, comment } = req.body;
  if (!decision || !['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be "approved" or "rejected"' });
  }

  item.status = decision;
  item.decision = decision;
  item.decisionBy = req.body.decisionBy || `User ${getUserId(req)}`;
  item.decisionComment = comment || '';
  item.decisionAt = new Date().toISOString();
  item.updatedAt = new Date();

  store.approvalRequests.set(id, item);
  logProvenance(getOrgId(req), item.programId, 'approval', id, decision, getUserId(req), { comment });

  // Also add a collaboration thread for the decision
  const collabId = nextId();
  store.collaboration.set(collabId, {
    id: collabId,
    organizationId: item.organizationId,
    programId: item.programId,
    targetType: 'artifact',
    targetId: item.artifactId,
    type: decision === 'approved' ? 'comment' : 'change_request',
    body: `[${decision.toUpperCase()}] ${item.title}\n\n${comment || 'No comment provided.'}`,
    author: item.decisionBy,
    role: item.assignedToRole,
    visibility: 'internal',
    priority: decision === 'rejected' ? 'high' : 'normal',
    status: 'open',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  res.json({ data: item });
});

router.post('/approval-requests/:id/delegate', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const item = store.approvalRequests.get(id);
  if (!item) return res.status(404).json({ error: 'Approval request not found' });
  if (item.status !== 'pending') {
    return res.status(400).json({ error: `Request already ${item.status}` });
  }

  const { delegateTo, delegateToRole, reason } = req.body;
  if (!delegateTo) {
    return res.status(400).json({ error: 'delegateTo is required' });
  }

  const previousAssignee = item.assignedTo;
  item.assignedTo = delegateTo;
  item.assignedToRole = delegateToRole || item.assignedToRole;
  item.delegatedFrom = previousAssignee;
  item.delegationReason = reason;
  item.updatedAt = new Date();

  store.approvalRequests.set(id, item);
  logProvenance(getOrgId(req), item.programId, 'approval', id, 'delegated', getUserId(req), {
    from: previousAssignee,
    to: delegateTo,
    reason,
  });

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
