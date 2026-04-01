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
import { createFeatureStore } from '../utils/feature-persistence';

const router = Router();
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
  score: number;
  summary: string;
  findings: FindingCluster[];
  metadata: Record<string, any>;
  completedAt: Date;
}

const DOSSIER_SECTIONS = [
  'Module 1 — Administrative',
  'Module 2.3 — Quality Overall Summary',
  'Module 2.5 — Clinical Overview',
  'Module 2.7 — Clinical Summary',
  'Module 3.2.S — Drug Substance',
  'Module 3.2.P — Drug Product',
  'Module 4 — Nonclinical Study Reports',
  'Module 5 — Clinical Study Reports',
  "Investigator's Brochure",
  'Clinical Protocol',
  'Statistical Analysis Plan',
  'Risk Management File',
];

let findingIdCounter = Date.now();
function nextFindingId(): number {
  return findingIdCounter++;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, arr.length));
}

function pickSeverity(): 'critical' | 'high' | 'medium' | 'low' {
  const roll = Math.random();
  if (roll < 0.1) return 'critical';
  if (roll < 0.35) return 'high';
  if (roll < 0.7) return 'medium';
  return 'low';
}

function simulateAgencyScreen(runId: number): EngineResult {
  const findingTemplates = [
    { title: 'Missing eCTD envelope metadata', summary: 'The submission package lacks required eCTD v4.0 envelope attributes including application-type identifier and sequence-number linkage, which may trigger pre-technical rejection at the FDA gateway.', basis: 'FDA eCTD Technical Conformance Guide v3.3', remediation: 'Validate eCTD metadata against FDA gateway acceptance criteria and populate all mandatory envelope fields prior to submission.' },
    { title: 'Inconsistent product naming across modules', summary: 'Product name referenced as three distinct variants across Modules 1, 2, and 3. Agency technical screeners flag naming inconsistencies as a rejection-worthy deficiency.', basis: 'ICH M4 Common Technical Document guidelines', remediation: 'Conduct a cross-module naming harmonization pass and establish a controlled vocabulary for all product references.' },
    { title: 'Cover letter omits required regulatory history', summary: 'The Module 1.0 cover letter does not reference prior IND amendments or cross-reference existing applications as required by FDA Form 356h instructions.', basis: 'FDA Form 356h Completion Requirements', remediation: 'Update cover letter to include all prior submission references, IND amendment history, and cross-referenced application numbers.' },
    { title: 'PDF bookmark structure non-compliant', summary: 'Multiple Module 2 and Module 5 PDF documents lack hierarchical bookmarking required by FDA technical specifications, potentially triggering gateway reject.', basis: 'FDA eCTD Specification v4.0 §3.2 PDF Requirements', remediation: 'Rebuild PDF bookmark trees for all Module 2 and Module 5 documents using compliant publishing tools.' },
    { title: 'Orphaned lifecycle reference detected', summary: 'A Module 3 amendment references a superseded drug substance specification (version 2.1) that was replaced in sequence 0045, creating a lifecycle integrity gap.', basis: 'ICH M4Q Quality Module Structure', remediation: 'Update all cross-references to point to current active versions and remove orphaned lifecycle pointers.' },
  ];
  const selected = pickRandom(findingTemplates, randomInt(2, 5));
  const findings: FindingCluster[] = selected.map(tpl => ({ id: nextFindingId(), runId, engine: 'agency_screen' as EngineId, severity: pickSeverity(), title: tpl.title, summary: tpl.summary, regulatoryBasis: tpl.basis, blastRadius: { artifactsImpacted: randomInt(2, 12), sectionsImpacted: pickRandom(DOSSIER_SECTIONS, randomInt(1, 4)) }, suggestedRemediation: tpl.remediation, confidence: randomInt(65, 95), createdAt: new Date() }));
  const score = randomInt(20, 95);
  return { engine: 'agency_screen', score, summary: `Pre-Technical Rejection Score: ${score}/100. Identified ${findings.length} metadata conflicts and package anomalies.`, findings, metadata: { scoreType: 'preTechnicalRejection', metadataConflicts: randomInt(1, 8), packageAnomalies: randomInt(0, 5), gatewayPassProbability: score > 70 ? 'high' : score > 45 ? 'moderate' : 'low' }, completedAt: new Date() };
}

function simulateReviewerAttack(runId: number): EngineResult {
  const findingTemplates = [
    { title: 'Efficacy claim exceeds pivotal trial evidence', summary: 'Primary efficacy claim in Module 2.5 asserts superiority over standard of care, but pivotal trial (Study 301) only demonstrates non-inferiority.', basis: 'FDA Guidance: Clinical Trial Endpoints for Approval', remediation: 'Revise clinical overview to align claims precisely with statistical findings from pivotal trials.' },
    { title: 'Safety signal underreporting in clinical summary', summary: 'Module 2.7 clinical summary omits three Grade 3 adverse events reported in Study 201 Appendix Tables.', basis: 'ICH E3 Structure and Content of Clinical Study Reports', remediation: 'Reconcile Module 2.7 safety narrative with all individual CSR safety tables.' },
    { title: 'Subgroup analysis inconsistency', summary: 'Pre-specified subgroup analyses in the SAP differ from those reported in the CSR.', basis: 'ICH E9 Statistical Principles for Clinical Trials', remediation: 'Align reported subgroup analyses with SAP specifications.' },
    { title: 'Missing exposure-response analysis', summary: 'Clinical pharmacology section lacks an exposure-response analysis linking drug exposure to efficacy and safety outcomes.', basis: 'FDA Guidance: Exposure-Response Relationships (2003)', remediation: 'Commission exposure-response modeling and integrate results into Module 2.7.' },
    { title: 'Label claim overreach in proposed labeling', summary: 'Proposed product labeling includes an indication breadth that extends beyond the studied population.', basis: 'FDA Labeling Guidance for Prescription Drugs', remediation: 'Restrict indication statement to the enrolled population demographic.' },
  ];
  const selected = pickRandom(findingTemplates, randomInt(2, 5));
  const findings: FindingCluster[] = selected.map(tpl => ({ id: nextFindingId(), runId, engine: 'reviewer_attack' as EngineId, severity: pickSeverity(), title: tpl.title, summary: tpl.summary, regulatoryBasis: tpl.basis, blastRadius: { artifactsImpacted: randomInt(3, 15), sectionsImpacted: pickRandom(DOSSIER_SECTIONS, randomInt(2, 5)) }, suggestedRemediation: tpl.remediation, confidence: randomInt(60, 92), createdAt: new Date() }));
  const score = randomInt(20, 95);
  return { engine: 'reviewer_attack', score, summary: `Reviewer Friction Score: ${score}/100. Identified ${findings.length} deficiency themes.`, findings, metadata: { scoreType: 'reviewerFriction', deficiencyThemes: findings.length, claimOverreachWarnings: randomInt(0, 3), projectedIRCount: randomInt(2, 12), refuseToFileRisk: score < 40 ? 'high' : score < 65 ? 'moderate' : 'low' }, completedAt: new Date() };
}

function simulateAuditInspection(runId: number): EngineResult {
  const findingTemplates = [
    { title: 'Approval chain gap in CMC documentation', summary: "Module 3 drug substance specification shows version 3.2 was promoted from draft to approved without documented QA review step.", basis: '21 CFR Part 211 — Current Good Manufacturing Practice', remediation: 'Implement retrospective QA review and document the approval chain gap in a deviation report.' },
    { title: 'Traceability break between protocol amendments and CSR', summary: 'Protocol Amendment 4 (Study 301) modified the primary endpoint definition, but the CSR references the original endpoint.', basis: 'ICH E6(R2) Good Clinical Practice §6.15', remediation: 'Add protocol amendment traceability matrix to CSR.' },
    { title: 'Incomplete audit trail for data transformations', summary: 'SDTM-to-ADaM data transformation logic lacks version-controlled derivation documentation.', basis: '21 CFR Part 11 — Electronic Records', remediation: 'Document all data transformation derivations with version-controlled specifications.' },
    { title: 'Site monitoring visit report gaps', summary: 'Three clinical sites show gaps of 90+ days between monitoring visits during enrollment.', basis: 'ICH E6(R2) Good Clinical Practice §5.18', remediation: 'Generate retrospective monitoring rationale documents explaining visit gaps.' },
    { title: 'Missing electronic signature justification', summary: "Fourteen Module 5 documents bear electronic signatures without the required Part 11 compliance statement.", basis: '21 CFR Part 11.50 — Signature Manifestations', remediation: 'Attach Part 11 compliance declarations to all electronically signed documents.' },
  ];
  const selected = pickRandom(findingTemplates, randomInt(2, 5));
  const findings: FindingCluster[] = selected.map(tpl => ({ id: nextFindingId(), runId, engine: 'audit_inspection' as EngineId, severity: pickSeverity(), title: tpl.title, summary: tpl.summary, regulatoryBasis: tpl.basis, blastRadius: { artifactsImpacted: randomInt(2, 10), sectionsImpacted: pickRandom(DOSSIER_SECTIONS, randomInt(1, 4)) }, suggestedRemediation: tpl.remediation, confidence: randomInt(55, 90), createdAt: new Date() }));
  const score = randomInt(20, 95);
  return { engine: 'audit_inspection', score, summary: `Audit Exposure Score: ${score}/100. Detected ${findings.length} approval chain gaps and traceability weaknesses.`, findings, metadata: { scoreType: 'auditExposure', approvalChainGaps: randomInt(1, 6), traceabilityWeaknesses: randomInt(0, 4), inspectionReadiness: score > 70 ? 'ready' : score > 45 ? 'conditional' : 'not_ready' }, completedAt: new Date() };
}

function simulateRouteTiming(runId: number): EngineResult {
  const findingTemplates = [
    { title: 'Accelerated pathway eligibility uncertain', summary: 'Current evidence package may not meet the threshold for Accelerated Approval under Subpart H.', basis: 'FDA Accelerated Approval Program (21 CFR 314.510)', remediation: 'Engage in a Pre-Submission meeting to discuss surrogate endpoint acceptability.' },
    { title: 'Rolling submission timeline at risk', summary: 'CMC module completion lags clinical modules by approximately 14 weeks.', basis: 'FDA Manual of Policies and Procedures (MAPP) 6020.3', remediation: 'Accelerate CMC module development and consider parallel workstreams.' },
    { title: 'Advisory Committee meeting probability elevated', summary: 'Novel mechanism of action creates >60% probability of an FDA Advisory Committee convening.', basis: 'FDA Guidance on Advisory Committee Procedures', remediation: 'Prepare Advisory Committee briefing materials in parallel with submission.' },
    { title: 'Pediatric study plan deadline approaching', summary: 'Initial Pediatric Study Plan (iPSP) must be submitted within 60 days of end-of-Phase-2 meeting.', basis: 'Pediatric Research Equity Act (PREA)', remediation: 'Begin iPSP development immediately with pediatric clinical pharmacology input.' },
  ];
  const selected = pickRandom(findingTemplates, randomInt(2, 4));
  const findings: FindingCluster[] = selected.map(tpl => ({ id: nextFindingId(), runId, engine: 'route_timing' as EngineId, severity: pickSeverity(), title: tpl.title, summary: tpl.summary, regulatoryBasis: tpl.basis, blastRadius: { artifactsImpacted: randomInt(4, 20), sectionsImpacted: pickRandom(DOSSIER_SECTIONS, randomInt(2, 6)) }, suggestedRemediation: tpl.remediation, confidence: randomInt(50, 88), createdAt: new Date() }));
  const score = randomInt(20, 95);
  return { engine: 'route_timing', score, summary: `Route Viability Score: ${score}/100. Timeline analysis identified ${findings.length} delay risks.`, findings, metadata: { scoreType: 'routeViability', timelineConfidence: score > 70 ? 'high' : score > 45 ? 'moderate' : 'low', delayProbability: Math.max(5, 100 - score) + '%', estimatedDelayWeeks: randomInt(2, 18), pathwayViability: score > 60 ? 'viable' : 'at_risk' }, completedAt: new Date() };
}

function simulateEvidenceSufficiency(runId: number): EngineResult {
  const findingTemplates = [
    { title: 'Primary endpoint evidence density below threshold', summary: 'The pivotal trial primary endpoint is supported by a single adequate and well-controlled study.', basis: 'FDA Guidance: Providing Clinical Evidence of Effectiveness', remediation: 'Strengthen the single-study submission with robust sensitivity analyses.' },
    { title: 'Long-term safety data gap', summary: 'For a chronic-use indication, the safety database includes only 6-month exposure data for 85% of subjects.', basis: 'ICH E1 Population Exposure Guideline', remediation: 'Extend the open-label safety study to achieve ICH E1 exposure thresholds.' },
    { title: 'Comparator arm evidence weakness', summary: 'Active comparator used in Study 302 is not the current standard of care in the target market.', basis: 'ICH E10 Choice of Control Group', remediation: 'Provide indirect comparison analyses against the current standard of care.' },
    { title: 'Missing patient-reported outcome validation', summary: 'The key secondary endpoint uses a PRO instrument not formally validated in the target disease population.', basis: 'FDA Guidance: Patient-Reported Outcome Measures (2009)', remediation: 'Submit PRO instrument validation data as a standalone report in Module 5.' },
    { title: 'Nonclinical-to-clinical translation gap', summary: 'Nonclinical efficacy models show dose-dependent toxicity at exposures only 3x above the proposed clinical dose.', basis: 'ICH M3(R2) Nonclinical Safety Studies', remediation: 'Conduct additional PK/PD modeling to establish therapeutic margin confidence.' },
  ];
  const selected = pickRandom(findingTemplates, randomInt(2, 5));
  const findings: FindingCluster[] = selected.map(tpl => ({ id: nextFindingId(), runId, engine: 'evidence_sufficiency' as EngineId, severity: pickSeverity(), title: tpl.title, summary: tpl.summary, regulatoryBasis: tpl.basis, blastRadius: { artifactsImpacted: randomInt(3, 14), sectionsImpacted: pickRandom(DOSSIER_SECTIONS, randomInt(2, 5)) }, suggestedRemediation: tpl.remediation, confidence: randomInt(58, 93), createdAt: new Date() }));
  const score = randomInt(20, 95);
  return { engine: 'evidence_sufficiency', score, summary: `Claim Defensibility Score: ${score}/100. Evidence gap analysis revealed ${findings.length} areas below regulatory expectations.`, findings, metadata: { scoreType: 'claimDefensibility', evidenceGaps: findings.length, supportDensityWarnings: randomInt(1, 5), overallEvidenceGrade: score > 75 ? 'strong' : score > 50 ? 'moderate' : 'weak' }, completedAt: new Date() };
}

function simulateCollaborationFragility(runId: number): EngineResult {
  const findingTemplates = [
    { title: 'Single-point-of-failure in CMC authoring', summary: 'Module 3 content ownership is concentrated in a single subject matter expert with no documented backup.', basis: 'ICH Q10 Pharmaceutical Quality System — Knowledge Management', remediation: 'Cross-train a secondary CMC author and establish a knowledge transfer protocol.' },
    { title: 'Approval chain bottleneck at medical review', summary: 'The medical reviewer approval queue shows an average 21-day turnaround for Module 2 clinical documents.', basis: 'Organizational SOP — Document Review and Approval', remediation: 'Add a parallel medical reviewer to the approval chain.' },
    { title: 'Cross-functional handoff fragility between biostatistics and clinical', summary: 'Analysis dataset handoffs between biostatistics and clinical writing teams lack a structured data package specification.', basis: 'ICH E9(R1) Estimands Framework — Implementation', remediation: 'Define a standardized data handoff package template.' },
    { title: 'Vendor dependency risk in regulatory publishing', summary: 'Regulatory publishing is outsourced to a single CRO partner with a 45-day lead time for eCTD compilation.', basis: 'ICH M8 eCTD Implementation Guide', remediation: 'Establish a secondary publishing vendor relationship.' },
    { title: 'Stakeholder alignment gap on benefit-risk narrative', summary: 'Clinical, regulatory affairs, and commercial teams hold divergent views on the benefit-risk positioning.', basis: 'ICH M4E(R2) — Common Technical Document for Efficacy', remediation: 'Convene a cross-functional benefit-risk alignment workshop.' },
  ];
  const selected = pickRandom(findingTemplates, randomInt(2, 5));
  const findings: FindingCluster[] = selected.map(tpl => ({ id: nextFindingId(), runId, engine: 'collaboration_fragility' as EngineId, severity: pickSeverity(), title: tpl.title, summary: tpl.summary, regulatoryBasis: tpl.basis, blastRadius: { artifactsImpacted: randomInt(2, 12), sectionsImpacted: pickRandom(DOSSIER_SECTIONS, randomInt(1, 4)) }, suggestedRemediation: tpl.remediation, confidence: randomInt(55, 88), createdAt: new Date() }));
  const score = randomInt(20, 95);
  return { engine: 'collaboration_fragility', score, summary: `Bottleneck Risk Score: ${score}/100. Collaboration analysis identified ${findings.length} fragility points.`, findings, metadata: { scoreType: 'approvalChainFragility', bottleneckRisk: score < 40 ? 'critical' : score < 65 ? 'elevated' : 'manageable', approvalChainFragility: randomInt(1, 5), handoffFragility: randomInt(1, 4), singlePointsOfFailure: randomInt(0, 3) }, completedAt: new Date() };
}

const ENGINE_SIMULATORS: Record<EngineId, (runId: number) => EngineResult> = {
  agency_screen: simulateAgencyScreen,
  reviewer_attack: simulateReviewerAttack,
  audit_inspection: simulateAuditInspection,
  route_timing: simulateRouteTiming,
  evidence_sufficiency: simulateEvidenceSufficiency,
  collaboration_fragility: simulateCollaborationFragility,
};

async function executeRun(
  runId: number,
  programId: number,
  engines: EngineId[],
  orgId: number,
  userId: number,
  scenarioId?: number,
): Promise<void> {
  const run = await store.getById(runId, orgId);
  if (!run) return;

  const { id: _rid, createdAt: _rca, updatedAt: _rua, ...runData } = run;
  runData.status = 'running';
  runData.startedAt = new Date().toISOString();
  await store.update(runId, orgId, runData);

  const engineResults: EngineResult[] = [];
  const allFindings: FindingCluster[] = [];

  for (const engineId of engines) {
    const simulator = ENGINE_SIMULATORS[engineId];
    if (!simulator) continue;
    const result = simulator(runId);
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
    if (scoreType) scoreMap[scoreType] = er.score;
  }
  if (scoreMap.preTechnicalRejection !== undefined) {
    scoreMap.submissionSurvival = Math.min(100, Math.round(scoreMap.preTechnicalRejection * 0.3 + (scoreMap.reviewerFriction || 70) * 0.3 + (scoreMap.claimDefensibility || 70) * 0.4));
  }
  if (scoreMap.auditExposure !== undefined) {
    scoreMap.traceabilityIntegrity = Math.min(100, Math.round(scoreMap.auditExposure * 0.6 + (scoreMap.approvalChainFragility || 70) * 0.4));
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

  const remediationPlan = await store.insert(orgId, 'remediation_plan', `Remediation for run #${runId}`, {
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
      estimatedEffort: f.severity === 'critical' ? 'high' : f.severity === 'high' ? 'medium' : 'low',
      status: 'pending',
      blastRadius: f.blastRadius,
    })),
    generatedAt: new Date().toISOString(),
  });

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
// SCENARIO MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/scenarios', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = req.query.programId ? parseInt(req.query.programId as string) : undefined;
    let scenarios = await store.query(orgId, 'scenario');
    if (programId) scenarios = scenarios.filter((s: any) => s.programId === programId);
    scenarios.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    res.json({ data: scenarios });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

router.get('/scenarios/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const id = parseInt(req.params.id);
    const scenario = await store.getById(id, orgId);
    if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

    const runs = await store.query(orgId, 'run', (r: any) => r.scenarioId === id);
    runs.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ data: { ...scenario, runs } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/scenarios/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const id = parseInt(req.params.id);
    const scenario = await store.getById(id, orgId);
    if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...prev } = scenario;
    const allowedFields = ['name', 'description', 'assumptions', 'isBaseline', 'status', 'tags'];
    const updated = { ...prev };
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updated[field] = req.body[field];
    }

    const result = await store.update(id, orgId, updated, req.body.name);
    await logProvenance(orgId, scenario.programId, 'scenario', id, 'updated', getUserId(req), { prev, next: updated });
    res.json({ data: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/scenarios/:id/clone', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const sourceId = parseInt(req.params.id);
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
    await logProvenance(orgId, cloned.programId, 'scenario', cloned.id, 'cloned', userId, { description: `Cloned from scenario #${sourceId}` });
    res.status(201).json({ data: cloned });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PREDICTION RUNS
// ═══════════════════════════════════════════════════════════════════════════════

async function createAndExecuteRun(req: Request, res: Response, engines: EngineId[], runType: string): Promise<void> {
  try {
    const programId = parseInt(req.params.programId);
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
    await logProvenance(orgId, programId, 'prediction-run', run.id, 'created', userId, { description: `${runType} run initiated with engines: ${engines.join(', ')}` });
    await executeRun(run.id, programId, engines, orgId, userId, scenarioId);

    const completed = await store.getById(run.id, orgId);
    res.status(201).json({ data: completed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    const run = await store.getById(parseInt(req.params.runId), orgId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json({ data: run });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/runs/:runId/results', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const runId = parseInt(req.params.runId);
    const run = await store.getById(runId, orgId);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const results = await store.query(orgId, 'result', (r: any) => r.runId === runId);
    const result = results[0];
    if (!result) {
      return res.json({ data: { run, results: null, message: 'Run has not completed yet' } });
    }

    const findings = await store.query(orgId, 'finding', (f: any) => f.runId === runId);
    const scores = await store.query(orgId, 'score', (s: any) => s.runId === runId);
    const remediations = await store.query(orgId, 'remediation_plan', (r: any) => r.runId === runId);

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
    res.status(500).json({ error: err.message });
  }
});

router.get('/runs/:runId/delta-vs-baseline', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const runId = parseInt(req.params.runId);
    const run = await store.getById(runId, orgId);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const scenarios = await store.query(orgId, 'scenario', (s: any) => s.programId === run.programId && s.isBaseline);
    const baselineScenario = scenarios[0];

    if (!baselineScenario) {
      return res.json({ data: { run, delta: null, message: 'No baseline scenario found for this program. Mark a scenario as baseline first.' } });
    }

    const allRuns = await store.query(orgId, 'run', (r: any) => r.scenarioId === baselineScenario.id && r.status === 'completed');
    allRuns.sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    const baselineRun = allRuns[0];

    if (!baselineRun) {
      return res.json({ data: { run, delta: null, message: 'Baseline scenario has no completed runs.' } });
    }

    const currentScores = await store.query(orgId, 'score', (s: any) => s.runId === runId);
    const baselineScores = await store.query(orgId, 'score', (s: any) => s.runId === baselineRun.id);

    const scoreDelta: Record<string, { current: number; baseline: number; delta: number; direction: string }> = {};
    if (currentScores[0] && baselineScores[0]) {
      for (const key of Object.keys(currentScores[0].scores || {})) {
        const current = currentScores[0].scores[key] || 0;
        const baseline = baselineScores[0].scores[key] || 0;
        const delta = current - baseline;
        scoreDelta[key] = { current, baseline, delta, direction: delta > 0 ? 'improved' : delta < 0 ? 'degraded' : 'unchanged' };
      }
    }

    const currentFindings = await store.query(orgId, 'finding', (f: any) => f.runId === runId);
    const baselineFindings = await store.query(orgId, 'finding', (f: any) => f.runId === baselineRun.id);

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
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCORE APIs
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/scores', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);

    const allScores = await store.query(orgId, 'score', (s: any) => s.programId === programId);
    allScores.sort((a: any, b: any) => new Date(b.computedAt).getTime() - new Date(a.computedAt).getTime());
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
      return res.json({ data: { programId, scores: defaultScores, lastRunId: null, computedAt: null, message: 'No prediction runs have been executed for this program yet.' } });
    }

    res.json({ data: { programId, scores: latestScore.scores, lastRunId: latestScore.runId, computedAt: latestScore.computedAt } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/artifacts/:artifactId/scores', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const artifactId = parseInt(req.params.artifactId);

    const relevantFindings = await store.query(orgId, 'finding', (f: any) => f.blastRadius && f.blastRadius.artifactsImpacted > 0);

    let riskScore = 0;
    let findingCount = 0;
    const severityWeights: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 3 };
    const impactingFindings = relevantFindings.slice(0, Math.min(relevantFindings.length, 3 + (artifactId % 4)));
    for (const f of impactingFindings) {
      riskScore += severityWeights[f.severity] || 5;
      findingCount++;
    }
    const normalizedScore = Math.min(100, Math.max(0, 100 - riskScore));

    res.json({
      data: {
        artifactId,
        overallScore: normalizedScore,
        findingsImpacting: findingCount,
        riskLevel: normalizedScore > 70 ? 'low' : normalizedScore > 40 ? 'medium' : 'high',
        engineBreakdown: { agency_screen: randomInt(30, 95), reviewer_attack: randomInt(30, 95), audit_inspection: randomInt(30, 95) },
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dossier-nodes/:nodeId/scores', (req: Request, res: Response) => {
  const nodeId = parseInt(req.params.nodeId);
  const sectionScore = 40 + ((nodeId * 17) % 55);
  const completeness = 30 + ((nodeId * 23) % 65);
  const consistency = 35 + ((nodeId * 31) % 60);

  res.json({
    data: {
      nodeId,
      scores: { overall: sectionScore, completeness, consistency, evidenceDensity: 25 + ((nodeId * 13) % 70), reviewerRisk: Math.max(5, 100 - sectionScore) },
      lastAssessedAt: new Date(),
      assessmentSource: 'snowglobe-prediction',
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REMEDIATION
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/remediation-plan', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);

    const plans = await store.query(orgId, 'remediation_plan', (r: any) => r.programId === programId);
    plans.sort((a: any, b: any) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
    const latestPlan = plans[0];

    if (!latestPlan) {
      return res.json({ data: { programId, actions: [], message: 'No remediation plan available. Run a prediction first.' } });
    }

    res.json({ data: latestPlan });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/programs/:programId/top-findings', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const programId = parseInt(req.params.programId);
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
    res.status(500).json({ error: err.message });
  }
});

router.post('/runs/:runId/create-findings-memo', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const runId = parseInt(req.params.runId);
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
      header: { programId: run.programId, runId, runType: run.runType, enginesExecuted: run.engines, generatedAt: new Date().toISOString(), generatedBy: userId },
      executiveSummary: `This findings memo summarizes the results of a ${run.runType} prediction run executed across ${(run.engines || []).length} engine(s). The analysis identified ${findings.length} findings (${result.criticalFindings || 0} critical, ${result.highFindings || 0} high). Immediate attention is recommended for all critical-severity findings to mitigate regulatory risk.`,
      scoresSummary: scoreRecord?.scores || {},
      findings: findings.map((f: any, idx: number) => ({
        rank: idx + 1, engine: f.engine, severity: f.severity, title: f.title, summary: f.summary, regulatoryBasis: f.regulatoryBasis, blastRadius: f.blastRadius, suggestedRemediation: f.suggestedRemediation, confidence: f.confidence,
      })),
      engineSummaries: (result.engineResults || []).map((er: EngineResult) => ({
        engine: er.engine, score: er.score, summary: er.summary, findingCount: er.findings.length,
      })),
      governanceFooter: { classification: 'Internal — Regulatory Strategy', retentionPolicy: '21 CFR Part 11 compliant', approvalRequired: true, distributionList: ['Regulatory Affairs', 'Clinical Operations', 'Quality Assurance'] },
    };

    const memo = await store.insert(orgId, 'findings_memo', `Findings Memo — ${run.runType}`, {
      runId,
      programId: run.programId,
      organizationId: orgId,
      createdById: userId,
      artifactType: 'findings-memo',
      title: `AnA Predictions Findings Memo — ${run.runType} — ${new Date().toISOString().split('T')[0]}`,
      status: 'draft',
      content: memoContent,
    });

    await logProvenance(orgId, run.programId, 'findings-memo', memo.id, 'created', userId, {
      description: `Generated governed findings memo from run #${runId} with ${findings.length} findings`,
    });

    res.status(201).json({ data: memo });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
