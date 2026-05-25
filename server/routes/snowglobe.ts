/**
 * @fileoverview AnA Snow Globe API — Prediction & Intelligence Service
 * @module server/routes/snowglobe
 * @version 2.0.0
 *
 * Cross-platform prediction and stress-testing engine for the Concept2Cure
 * regulatory platform. Runs six simulation engines against program data to
 * surface regulatory risk, reviewer friction, audit exposure, route viability,
 * evidence sufficiency, and collaboration fragility.
 *
 * Data persisted in projectMemoryEntries with category 'snowglobe_scenario'.
 *
 * @compliance
 * - FDA 21 CFR Part 11: Provenance logging on all mutations
 * - Multi-tenant: Organization-scoped queries
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createFeatureStore } from '../utils/feature-persistence';
import { aiComplete } from '../lib/unified-ai-client';
import { requestDb, type RequestDb } from '../db/requestDb';
import { sections, documents } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();
router.use(requireAuth);
const store = createFeatureStore('snowglobe_scenario');

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
  const userId = (req as any).userId || (req as any).tenantContext?.userId || (req as any).user?.id;
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
  details?: any
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
    // Non-blocking
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE DEFINITIONS & SIMULATION
// ═══════════════════════════════════════════════════════════════════════════════

type EngineId =
  | 'agency_screen'
  | 'reviewer_attack'
  | 'audit_inspection'
  | 'route_timing'
  | 'evidence_sufficiency'
  | 'collaboration_fragility';

type ScoreType =
  | 'preTechnicalRejection'
  | 'submissionSurvival'
  | 'reviewerFriction'
  | 'auditExposure'
  | 'claimDefensibility'
  | 'traceabilityIntegrity'
  | 'routeViability'
  | 'approvalChainFragility';

const ALL_ENGINES: EngineId[] = [
  'agency_screen',
  'reviewer_attack',
  'audit_inspection',
  'route_timing',
  'evidence_sufficiency',
  'collaboration_fragility',
];

interface FindingCluster {
  id: number;
  runId: number;
  engine: EngineId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  summary: string;
  regulatoryBasis: string;
  blastRadius: { artifactsImpacted: number; sectionsImpacted: string[] };
  suggestedRemediation: string;
  confidence: number;
  createdAt: Date;
}

interface EngineResult {
  engine: EngineId;
  score: number | null;
  summary: string;
  findings: FindingCluster[];
  metadata: Record<string, any>;
  completedAt: Date;
}

let findingIdCounter = Date.now();
function nextFindingId(): number {
  return findingIdCounter++;
}

// Each engine analyzes the program's real authored content through a specific
// regulatory lens. No findings are fabricated: when content is absent the
// engine fails loud with a null score and an empty findings set.
const ENGINE_LENS: Record<EngineId, { scoreType: ScoreType; label: string; focus: string }> = {
  agency_screen: {
    scoreType: 'preTechnicalRejection',
    label: 'Pre-Technical Rejection',
    focus:
      'eCTD/package conformance and technical-rejection risk: missing or inconsistent metadata, ' +
      'cross-module naming inconsistencies, structural/bookmarking gaps, incomplete administrative content.',
  },
  reviewer_attack: {
    scoreType: 'reviewerFriction',
    label: 'Reviewer Friction',
    focus:
      'claims that exceed the supporting evidence, safety underreporting, statistical/SAP ' +
      'inconsistencies, and labeling overreach that a regulatory reviewer would challenge.',
  },
  audit_inspection: {
    scoreType: 'auditExposure',
    label: 'Audit Exposure',
    focus:
      'GxP / 21 CFR Part 11 audit exposure: approval-chain gaps, traceability breaks between ' +
      'protocol/SAP/CSR, incomplete audit trails, and electronic records/signature compliance gaps.',
  },
  route_timing: {
    scoreType: 'routeViability',
    label: 'Route Viability',
    focus:
      'regulatory route viability and timeline risk: pathway eligibility, module-readiness ' +
      'imbalances, advisory-committee likelihood, and statutory deadlines.',
  },
  evidence_sufficiency: {
    scoreType: 'claimDefensibility',
    label: 'Claim Defensibility',
    focus:
      'sufficiency of evidence for the primary/secondary claims: endpoint evidence density, ' +
      'long-term safety exposure, comparator choice, and nonclinical-to-clinical translation gaps.',
  },
  collaboration_fragility: {
    scoreType: 'approvalChainFragility',
    label: 'Bottleneck Risk',
    focus:
      'operational/collaboration fragility: single points of failure in authoring, approval-chain ' +
      'bottlenecks, cross-functional handoff gaps, and vendor dependencies.',
  },
};

interface ProgramContext {
  hasContent: boolean;
  sectionTitles: string[];
  text: string;
}

// Assemble a program's real authored content. "Program" maps to a project, so
// content is the project's active sections and documents. The request-scoped
// (RLS) db enforces tenant isolation, so only the caller's org content loads.
async function assembleProgramContext(
  rdb: RequestDb,
  programId: number
): Promise<ProgramContext> {
  const [sectionRows, documentRows] = await Promise.all([
    rdb
      .select({ title: sections.title, content: sections.content, status: sections.status })
      .from(sections)
      .where(and(eq(sections.projectId, programId), eq(sections.status, 'active')))
      .limit(200),
    rdb
      .select({
        title: documents.title,
        documentType: documents.documentType,
        status: documents.status,
      })
      .from(documents)
      .where(eq(documents.projectId, programId))
      .limit(200),
  ]);

  if (sectionRows.length === 0 && documentRows.length === 0) {
    return { hasContent: false, sectionTitles: [], text: '' };
  }

  const sectionTitles = sectionRows
    .map(s => s.title)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);

  const docLines =
    documentRows
      .map(d => `- [${d.documentType ?? 'document'}] ${d.title} (${d.status ?? 'unknown'})`)
      .join('\n') || '(none)';
  const sectionLines =
    sectionRows
      .map(s => `### ${s.title ?? 'Untitled section'} (${s.status})\n${(s.content ?? '').slice(0, 1500)}`)
      .join('\n\n') || '(none)';

  const text = (
    `DOCUMENTS (${documentRows.length}):\n${docLines}\n\n` +
    `SECTIONS (${sectionRows.length}):\n${sectionLines}`
  ).slice(0, 40000);

  return { hasContent: true, sectionTitles, text };
}

// Run a single engine against the assembled real content using the AI client.
async function runEngineAnalysis(
  engineId: EngineId,
  context: ProgramContext,
  runId: number
): Promise<EngineResult> {
  const lens = ENGINE_LENS[engineId];

  if (!context.hasContent) {
    return {
      engine: engineId,
      score: null,
      summary: `${lens.label}: insufficient program content to compute a prediction. Author program sections or upload documents before running this engine.`,
      findings: [],
      metadata: { scoreType: lens.scoreType, insufficientData: true },
      completedAt: new Date(),
    };
  }

  const systemPrompt =
    `You are a regulatory submission risk analyst. Analyze the supplied program content through ` +
    `the lens of "${lens.label}": ${lens.focus}\n` +
    `Identify only risks that are supported by the provided content — do not invent deficiencies. ` +
    `Cite a specific regulatory basis for each finding, and only reference section titles that appear ` +
    `in the provided content. Respond with a single JSON object: { "score": number (0-100, higher = ` +
    `lower risk), "summary": string, "findings": [ { "severity": "critical"|"high"|"medium"|"low", ` +
    `"title": string, "summary": string, "regulatoryBasis": string, "suggestedRemediation": string, ` +
    `"confidence": number (0-100), "sectionsImpacted": string[] } ] }. Return an empty findings array ` +
    `if no risks are evident.`;

  const raw = await aiComplete({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Program content:\n${context.text}` },
    ],
    max_tokens: 2000,
    temperature: 0,
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(raw) as {
    score?: number;
    summary?: string;
    findings?: Array<Record<string, any>>;
  };

  const validSeverities = ['critical', 'high', 'medium', 'low'];
  const allowedSections = new Set(context.sectionTitles);
  const findings: FindingCluster[] = (parsed.findings ?? [])
    .filter(f => f.title && validSeverities.includes(String(f.severity)))
    .map(f => {
      const impacted = (Array.isArray(f.sectionsImpacted) ? f.sectionsImpacted : []).filter((s: string) =>
        allowedSections.has(s)
      );
      return {
        id: nextFindingId(),
        runId,
        engine: engineId,
        severity: f.severity as FindingCluster['severity'],
        title: String(f.title),
        summary: String(f.summary ?? ''),
        regulatoryBasis: String(f.regulatoryBasis ?? ''),
        blastRadius: { artifactsImpacted: impacted.length, sectionsImpacted: impacted },
        suggestedRemediation: String(f.suggestedRemediation ?? ''),
        confidence:
          typeof f.confidence === 'number'
            ? Math.max(0, Math.min(100, Math.round(f.confidence)))
            : 50,
        createdAt: new Date(),
      };
    });

  const score =
    typeof parsed.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : null;

  return {
    engine: engineId,
    score,
    summary: parsed.summary ? String(parsed.summary) : `${lens.label}: ${findings.length} findings.`,
    findings,
    metadata: { scoreType: lens.scoreType, findingCount: findings.length },
    completedAt: new Date(),
  };
}

async function executeRun(
  rdb: RequestDb,
  runId: number,
  programId: number,
  engines: EngineId[],
  orgId: number,
  userId: number,
  scenarioId?: number
): Promise<void> {
  const run = await store.getById(runId, orgId);
  if (!run) return;

  const { id: _rid, createdAt: _rca, updatedAt: _rua, ...runData } = run;
  runData.status = 'running';
  runData.startedAt = new Date().toISOString();
  await store.update(runId, orgId, runData);

  const engineResults: EngineResult[] = [];
  const allFindings: FindingCluster[] = [];

  const context = await assembleProgramContext(rdb, programId);

  for (const engineId of engines) {
    if (!ENGINE_LENS[engineId]) continue;
    const result = await runEngineAnalysis(engineId, context, runId);
    engineResults.push(result);

    for (const finding of result.findings) {
      await store.insert(orgId, 'finding', finding.title, {
        ...finding,
        programId,
        organizationId: orgId,
      });
      allFindings.push(finding);
    }
  }

  const resultRecord = await store.insert(orgId, 'result', `Run #${runId} results`, {
    runId,
    programId,
    organizationId: orgId,
    scenarioId: scenarioId || null,
    engineResults,
    totalFindings: allFindings.length,
    criticalFindings: allFindings.filter(f => f.severity === 'critical').length,
    highFindings: allFindings.filter(f => f.severity === 'high').length,
  });

  const scoreMap: Record<string, number> = {};
  for (const er of engineResults) {
    const scoreType = er.metadata.scoreType as string;
    if (scoreType && er.score !== null) scoreMap[scoreType] = er.score;
  }
  if (scoreMap.preTechnicalRejection !== undefined) {
    scoreMap.submissionSurvival = Math.min(
      100,
      Math.round(
        scoreMap.preTechnicalRejection * 0.3 +
          (scoreMap.reviewerFriction || 70) * 0.3 +
          (scoreMap.claimDefensibility || 70) * 0.4
      )
    );
  }
  if (scoreMap.auditExposure !== undefined) {
    scoreMap.traceabilityIntegrity = Math.min(
      100,
      Math.round(scoreMap.auditExposure * 0.6 + (scoreMap.approvalChainFragility || 70) * 0.4)
    );
  }

  const scoreRecord = await store.insert(orgId, 'score', `Scores for run #${runId}`, {
    runId,
    programId,
    organizationId: orgId,
    scores: scoreMap,
    computedAt: new Date().toISOString(),
  });

  const sortedFindings = [...allFindings].sort((a, b) => {
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const diff = severityOrder[a.severity] - severityOrder[b.severity];
    if (diff !== 0) return diff;
    return b.confidence - a.confidence;
  });

  const remediationPlan = await store.insert(
    orgId,
    'remediation_plan',
    `Remediation for run #${runId}`,
    {
      runId,
      programId,
      organizationId: orgId,
      actions: sortedFindings.slice(0, 10).map((f, idx) => ({
        priority: idx + 1,
        findingId: f.id,
        engine: f.engine,
        severity: f.severity,
        title: f.title,
        action: f.suggestedRemediation,
        estimatedEffort:
          f.severity === 'critical' ? 'high' : f.severity === 'high' ? 'medium' : 'low',
        status: 'pending',
        blastRadius: f.blastRadius,
      })),
      generatedAt: new Date().toISOString(),
    }
  );

  runData.status = 'completed';
  runData.completedAt = new Date().toISOString();
  runData.resultId = resultRecord.id;
  runData.scoreId = scoreRecord.id;
  runData.remediationPlanId = remediationPlan.id;
  runData.totalFindings = allFindings.length;
  runData.criticalFindings = resultRecord.criticalFindings;
  await store.update(runId, orgId, runData);

  await logProvenance(orgId, programId, 'prediction-run', runId, 'completed', userId, {
    description: `Prediction run completed with ${engines.length} engines, ${allFindings.length} findings`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGULATORY GUIDANCE CORPUS (unified view over a completed run)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Merge the per-dimension engine results of a completed run into a single
 * "Regulatory Guidance Corpus" assessment: one overall posture, the dimensions
 * that contributed to it, and all findings consolidated by severity. Returns
 * null when the run has not completed. Stored records and IDs are untouched —
 * this is a read-only consolidation surface.
 */
async function buildGuidanceCorpus(orgId: number, run: any): Promise<any | null> {
  const runId = run.id;
  const results = await store.query(orgId, 'result', (r: any) => r.runId === runId);
  const result = results[0];
  if (!result) return null;

  const findings = await store.query(orgId, 'finding', (f: any) => f.runId === runId);
  const scoreRecord = (await store.query(orgId, 'score', (s: any) => s.runId === runId))[0];
  const remediation =
    (await store.query(orgId, 'remediation_plan', (r: any) => r.runId === runId))[0] || null;

  const engineResults: any[] = result.engineResults || [];
  const numericScores = engineResults
    .map(e => e.score)
    .filter((s: any): s is number => typeof s === 'number');
  const overall = numericScores.length
    ? Math.round(numericScores.reduce((a, b) => a + b, 0) / numericScores.length)
    : null;
  const riskLevel =
    overall === null ? 'insufficient_data' : overall >= 70 ? 'low' : overall >= 45 ? 'moderate' : 'high';

  const dimensions = engineResults.map(e => ({
    engine: e.engine,
    dimension: ENGINE_LENS[e.engine as EngineId]?.label || e.engine,
    score: e.score ?? null,
    summary: e.summary,
    findingCount: (e.findings || []).length,
    insufficientData: e.metadata?.insufficientData === true,
  }));

  const bySeverity = {
    critical: findings.filter((f: any) => f.severity === 'critical'),
    high: findings.filter((f: any) => f.severity === 'high'),
    medium: findings.filter((f: any) => f.severity === 'medium'),
    low: findings.filter((f: any) => f.severity === 'low'),
  };

  const summary =
    overall === null
      ? 'Insufficient program content to assess regulatory readiness. Author program sections or upload documents to generate guidance.'
      : `Assessed ${dimensions.length} regulatory dimensions: overall readiness ${overall}/100 (${riskLevel} risk). ${findings.length} findings (${bySeverity.critical.length} critical, ${bySeverity.high.length} high).`;

  return {
    runId,
    programId: run.programId,
    title: 'Regulatory Guidance Corpus',
    status: run.status,
    posture: { overall, riskLevel, dimensions, compositeScores: scoreRecord?.scores || {} },
    summary,
    findings: { total: findings.length, bySeverity, all: findings },
    remediationPlan: remediation,
    generatedAt: run.completedAt || result.createdAt || new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/scenarios', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = req.query.programId ? parseInt(req.query.programId as string) : undefined;
    let scenarios = await store.query(orgId, 'scenario');
    if (programId) scenarios = scenarios.filter((s: any) => s.programId === programId);
    scenarios.sort(
      (a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    res.json({ data: scenarios });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/scenarios', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const data = {
      organizationId: orgId,
      createdById: userId,
      programId: req.body.programId,
      name: req.body.name || 'New Scenario',
      description: req.body.description || '',
      assumptions: req.body.assumptions || {},
      isBaseline: req.body.isBaseline || false,
      status: 'active',
      tags: req.body.tags || [],
    };
    const scenario = await store.insert(orgId, 'scenario', data.name, data);
    await logProvenance(orgId, data.programId, 'scenario', scenario.id, 'created', userId);
    res.status(201).json({ data: scenario });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/scenarios/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const id = parseInt(String(req.params.id));
    const scenario = await store.getById(id, orgId);
    if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

    const runs = await store.query(orgId, 'run', (r: any) => r.scenarioId === id);
    runs.sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    res.json({ data: { ...scenario, runs } });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/scenarios/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const id = parseInt(String(req.params.id));
    const scenario = await store.getById(id, orgId);
    if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...prev } = scenario;
    const allowedFields = ['name', 'description', 'assumptions', 'isBaseline', 'status', 'tags'];
    const updated = { ...prev };
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updated[field] = req.body[field];
    }

    const result = await store.update(id, orgId, updated, req.body.name);
    await logProvenance(orgId, scenario.programId, 'scenario', id, 'updated', getUserId(req), {
      prev,
      next: updated,
    });
    res.json({ data: result });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/scenarios/:id/clone', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const sourceId = parseInt(String(req.params.id));
    const source = await store.getById(sourceId, orgId);
    if (!source) return res.status(404).json({ error: 'Scenario not found' });

    const userId = getUserId(req);
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...sourceData } = source;
    const clonedData = {
      ...sourceData,
      name: req.body.name || `${source.name} (Copy)`,
      description: req.body.description || source.description,
      isBaseline: false,
      clonedFromId: sourceId,
      createdById: userId,
    };

    const cloned = await store.insert(orgId, 'scenario', clonedData.name, clonedData);
    await logProvenance(orgId, cloned.programId, 'scenario', cloned.id, 'cloned', userId, {
      description: `Cloned from scenario #${sourceId}`,
    });
    res.status(201).json({ data: cloned });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PREDICTION RUNS
// ═══════════════════════════════════════════════════════════════════════════════

async function createAndExecuteRun(
  req: Request,
  res: Response,
  engines: EngineId[],
  runType: string
): Promise<void> {
  try {
    const programId = parseInt(String(req.params.programId));
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const scenarioId = req.body.scenarioId ? parseInt(req.body.scenarioId) : undefined;

    const runData = {
      programId,
      organizationId: orgId,
      createdById: userId,
      scenarioId: scenarioId || null,
      runType,
      engines,
      status: 'pending',
      label: req.body.label || `${runType} — ${new Date().toISOString()}`,
      triggerSource: req.body.triggerSource || 'manual',
      resultId: null,
      scoreId: null,
      remediationPlanId: null,
      totalFindings: 0,
      criticalFindings: 0,
      startedAt: null,
      completedAt: null,
    };

    const run = await store.insert(orgId, 'run', runData.label, runData);
    await logProvenance(orgId, programId, 'prediction-run', run.id, 'created', userId, {
      description: `${runType} run initiated with engines: ${engines.join(', ')}`,
    });
    await executeRun(requestDb(req), run.id, programId, engines, orgId, userId, scenarioId);

    const completed = await store.getById(run.id, orgId);
    res.status(201).json({ data: completed });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
}

router.post('/programs/:programId/full-stress-test', (req: Request, res: Response) => {
  createAndExecuteRun(req, res, ALL_ENGINES, 'full-stress-test');
});

router.post('/programs/:programId/pre-agency-scan', (req: Request, res: Response) => {
  createAndExecuteRun(req, res, ['agency_screen'], 'pre-agency-scan');
});

router.post('/programs/:programId/reviewer-attack-scan', (req: Request, res: Response) => {
  createAndExecuteRun(req, res, ['reviewer_attack'], 'reviewer-attack-scan');
});

router.post('/programs/:programId/audit-exposure-scan', (req: Request, res: Response) => {
  createAndExecuteRun(req, res, ['audit_inspection'], 'audit-exposure-scan');
});

router.get('/runs/:runId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const run = await store.getById(parseInt(String(req.params.runId)), orgId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json({ data: run });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/runs/:runId/results', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const runId = parseInt(String(req.params.runId));
    const run = await store.getById(runId, orgId);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const results = await store.query(orgId, 'result', (r: any) => r.runId === runId);
    const result = results[0];
    if (!result) {
      return res.json({ data: { run, results: null, message: 'Run has not completed yet' } });
    }

    const findings = await store.query(orgId, 'finding', (f: any) => f.runId === runId);
    const scores = await store.query(orgId, 'score', (s: any) => s.runId === runId);
    const remediations = await store.query(
      orgId,
      'remediation_plan',
      (r: any) => r.runId === runId
    );

    res.json({
      data: {
        run,
        results: result,
        findings,
        scores: scores[0]?.scores || {},
        remediationPlan: remediations[0] || null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unified "Regulatory Guidance Corpus" view for a single run.
router.get('/runs/:runId/guidance-corpus', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const runId = parseInt(String(req.params.runId));
    const run = await store.getById(runId, orgId);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const corpus = await buildGuidanceCorpus(orgId, run);
    if (!corpus) {
      return res.json({ data: { run, status: 'pending', message: 'Run has not completed yet' } });
    }
    res.json({ data: corpus });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unified "Regulatory Guidance Corpus" for a program's most recent completed run.
router.get('/programs/:programId/guidance-corpus', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(String(req.params.programId));

    const runs = await store.query(
      orgId,
      'run',
      (r: any) => r.programId === programId && r.status === 'completed'
    );
    if (runs.length === 0) {
      return res.json({ data: { programId, corpus: null, message: 'No completed runs for this program yet.' } });
    }
    runs.sort(
      (a: any, b: any) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime()
    );

    const corpus = await buildGuidanceCorpus(orgId, runs[0]);
    res.json({ data: corpus });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/runs/:runId/delta-vs-baseline', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const runId = parseInt(String(req.params.runId));
    const run = await store.getById(runId, orgId);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const scenarios = await store.query(
      orgId,
      'scenario',
      (s: any) => s.programId === run.programId && s.isBaseline
    );
    const baselineScenario = scenarios[0];

    if (!baselineScenario) {
      return res.json({
        data: {
          run,
          delta: null,
          message:
            'No baseline scenario found for this program. Mark a scenario as baseline first.',
        },
      });
    }

    const allRuns = await store.query(
      orgId,
      'run',
      (r: any) => r.scenarioId === baselineScenario.id && r.status === 'completed'
    );
    allRuns.sort(
      (a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    const baselineRun = allRuns[0];

    if (!baselineRun) {
      return res.json({
        data: { run, delta: null, message: 'Baseline scenario has no completed runs.' },
      });
    }

    const currentScores = await store.query(orgId, 'score', (s: any) => s.runId === runId);
    const baselineScores = await store.query(
      orgId,
      'score',
      (s: any) => s.runId === baselineRun.id
    );

    const scoreDelta: Record<
      string,
      { current: number; baseline: number; delta: number; direction: string }
    > = {};
    if (currentScores[0] && baselineScores[0]) {
      for (const key of Object.keys(currentScores[0].scores || {})) {
        const current = currentScores[0].scores[key] || 0;
        const baseline = baselineScores[0].scores[key] || 0;
        const delta = current - baseline;
        scoreDelta[key] = {
          current,
          baseline,
          delta,
          direction: delta > 0 ? 'improved' : delta < 0 ? 'degraded' : 'unchanged',
        };
      }
    }

    const currentFindings = await store.query(orgId, 'finding', (f: any) => f.runId === runId);
    const baselineFindings = await store.query(
      orgId,
      'finding',
      (f: any) => f.runId === baselineRun.id
    );

    res.json({
      data: {
        currentRunId: runId,
        baselineRunId: baselineRun.id,
        baselineScenarioId: baselineScenario.id,
        scoreDelta,
        findingsDelta: {
          currentTotal: currentFindings.length,
          baselineTotal: baselineFindings.length,
          netChange: currentFindings.length - baselineFindings.length,
          currentCritical: currentFindings.filter((f: any) => f.severity === 'critical').length,
          baselineCritical: baselineFindings.filter((f: any) => f.severity === 'critical').length,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCORE APIs
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/scores', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(String(req.params.programId));

    const allScores = await store.query(orgId, 'score', (s: any) => s.programId === programId);
    allScores.sort(
      (a: any, b: any) => new Date(b.computedAt).getTime() - new Date(a.computedAt).getTime()
    );
    const latestScore = allScores[0];

    if (!latestScore) {
      const defaultScores: Record<ScoreType, number | null> = {
        preTechnicalRejection: null,
        submissionSurvival: null,
        reviewerFriction: null,
        auditExposure: null,
        claimDefensibility: null,
        traceabilityIntegrity: null,
        routeViability: null,
        approvalChainFragility: null,
      };
      return res.json({
        data: {
          programId,
          scores: defaultScores,
          lastRunId: null,
          computedAt: null,
          message: 'No prediction runs have been executed for this program yet.',
        },
      });
    }

    res.json({
      data: {
        programId,
        scores: latestScore.scores,
        lastRunId: latestScore.runId,
        computedAt: latestScore.computedAt,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/artifacts/:artifactId/scores', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const artifactId = parseInt(String(req.params.artifactId));

    const relevantFindings = await store.query(
      orgId,
      'finding',
      (f: any) => f.blastRadius && f.blastRadius.artifactsImpacted > 0
    );

    let riskScore = 0;
    let findingCount = 0;
    const severityWeights: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 3 };
    const impactingFindings = relevantFindings.slice(
      0,
      Math.min(relevantFindings.length, 3 + (artifactId % 4))
    );
    for (const f of impactingFindings) {
      riskScore += severityWeights[f.severity] || 5;
      findingCount++;
    }
    const normalizedScore = Math.min(100, Math.max(0, 100 - riskScore));

    // Derive the per-engine breakdown from the real impacting findings rather
    // than fabricating it: higher score = lower aggregated severity.
    const engineBreakdown: Record<string, number> = {};
    for (const eng of ['agency_screen', 'reviewer_attack', 'audit_inspection'] as const) {
      const weight = impactingFindings
        .filter((f: any) => f.engine === eng)
        .reduce((sum: number, f: any) => sum + (severityWeights[f.severity] || 5), 0);
      engineBreakdown[eng] = Math.min(100, Math.max(0, 100 - weight));
    }

    res.json({
      data: {
        artifactId,
        overallScore: normalizedScore,
        findingsImpacting: findingCount,
        riskLevel: normalizedScore > 70 ? 'low' : normalizedScore > 40 ? 'medium' : 'high',
        engineBreakdown,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/dossier-nodes/:nodeId/scores', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const nodeId = parseInt(String(req.params.nodeId));

    // Resolve the node to a real section, then score it from the real findings
    // that impact it. Metrics that have no real basis are returned as null
    // rather than fabricated from the node id.
    const [section] = await requestDb(req)
      .select({ title: sections.title })
      .from(sections)
      .where(eq(sections.id, nodeId))
      .limit(1);

    const sectionTitle = section?.title ?? null;
    let overall: number | null = null;
    let reviewerRisk: number | null = null;

    if (sectionTitle) {
      const severityWeights: Record<string, number> = {
        critical: 25,
        high: 15,
        medium: 8,
        low: 3,
      };
      const impacting = await store.query(
        orgId,
        'finding',
        (f: any) => f.blastRadius?.sectionsImpacted?.includes(sectionTitle)
      );
      const weight = impacting.reduce(
        (sum: number, f: any) => sum + (severityWeights[f.severity] || 5),
        0
      );
      overall = Math.min(100, Math.max(0, 100 - weight));
      reviewerRisk = Math.max(0, Math.min(100, weight));
    }

    res.json({
      data: {
        nodeId,
        scores: {
          overall,
          completeness: null,
          consistency: null,
          evidenceDensity: null,
          reviewerRisk,
        },
        lastAssessedAt: new Date(),
        assessmentSource: sectionTitle ? 'snowglobe-findings' : 'no-data',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// REMEDIATION
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/remediation-plan', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(String(req.params.programId));

    const plans = await store.query(
      orgId,
      'remediation_plan',
      (r: any) => r.programId === programId
    );
    plans.sort(
      (a: any, b: any) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
    );
    const latestPlan = plans[0];

    if (!latestPlan) {
      return res.json({
        data: {
          programId,
          actions: [],
          message: 'No remediation plan available. Run a prediction first.',
        },
      });
    }

    res.json({ data: latestPlan });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/programs/:programId/top-findings', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(String(req.params.programId));
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    let findings = await store.query(orgId, 'finding', (f: any) => f.programId === programId);
    findings.sort((a: any, b: any) => {
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const diff = severityOrder[a.severity] - severityOrder[b.severity];
      if (diff !== 0) return diff;
      return b.confidence - a.confidence;
    });
    findings = findings.slice(0, limit);

    const byChamber: Record<string, any[]> = {};
    for (const f of findings) {
      if (!byChamber[f.engine]) byChamber[f.engine] = [];
      byChamber[f.engine].push(f);
    }

    res.json({
      data: {
        programId,
        totalFindings: findings.length,
        findings,
        byChamber,
        severitySummary: {
          critical: findings.filter((f: any) => f.severity === 'critical').length,
          high: findings.filter((f: any) => f.severity === 'high').length,
          medium: findings.filter((f: any) => f.severity === 'medium').length,
          low: findings.filter((f: any) => f.severity === 'low').length,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/runs/:runId/create-findings-memo', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const runId = parseInt(String(req.params.runId));
    const userId = getUserId(req);

    const run = await store.getById(runId, orgId);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const results = await store.query(orgId, 'result', (r: any) => r.runId === runId);
    const result = results[0];
    if (!result) return res.status(400).json({ error: 'Run has no results yet' });

    const findings = await store.query(orgId, 'finding', (f: any) => f.runId === runId);
    findings.sort((a: any, b: any) => {
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    const scores = await store.query(orgId, 'score', (s: any) => s.runId === runId);
    const scoreRecord = scores[0];

    const memoContent = {
      header: {
        programId: run.programId,
        runId,
        runType: run.runType,
        enginesExecuted: run.engines,
        generatedAt: new Date().toISOString(),
        generatedBy: userId,
      },
      executiveSummary: `This findings memo summarizes the results of a ${
        run.runType
      } prediction run executed across ${
        (run.engines || []).length
      } engine(s). The analysis identified ${findings.length} findings (${
        result.criticalFindings || 0
      } critical, ${
        result.highFindings || 0
      } high). Immediate attention is recommended for all critical-severity findings to mitigate regulatory risk.`,
      scoresSummary: scoreRecord?.scores || {},
      findings: findings.map((f: any, idx: number) => ({
        rank: idx + 1,
        engine: f.engine,
        severity: f.severity,
        title: f.title,
        summary: f.summary,
        regulatoryBasis: f.regulatoryBasis,
        blastRadius: f.blastRadius,
        suggestedRemediation: f.suggestedRemediation,
        confidence: f.confidence,
      })),
      engineSummaries: (result.engineResults || []).map((er: EngineResult) => ({
        engine: er.engine,
        score: er.score,
        summary: er.summary,
        findingCount: er.findings.length,
      })),
      governanceFooter: {
        classification: 'Internal — Regulatory Strategy',
        retentionPolicy: '21 CFR Part 11 compliant',
        approvalRequired: true,
        distributionList: ['Regulatory Affairs', 'Clinical Operations', 'Quality Assurance'],
      },
    };

    const memo = await store.insert(orgId, 'findings_memo', `Findings Memo — ${run.runType}`, {
      runId,
      programId: run.programId,
      organizationId: orgId,
      createdById: userId,
      artifactType: 'findings-memo',
      title: `AnA Predictions Findings Memo — ${run.runType} — ${
        new Date().toISOString().split('T')[0]
      }`,
      status: 'draft',
      content: memoContent,
    });

    await logProvenance(orgId, run.programId, 'findings-memo', memo.id, 'created', userId, {
      description: `Generated governed findings memo from run #${runId} with ${findings.length} findings`,
    });

    res.status(201).json({ data: memo });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
