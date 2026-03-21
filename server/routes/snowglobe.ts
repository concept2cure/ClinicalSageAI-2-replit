/**
 * @fileoverview AnA Snow Globe API — Prediction & Intelligence Service
 * @module server/routes/snowglobe
 * @version 1.0.0
 *
 * @description
 * Cross-platform prediction and stress-testing engine for the Concept2Cure
 * regulatory platform. Runs six simulation engines against program data to
 * surface regulatory risk, reviewer friction, audit exposure, route viability,
 * evidence sufficiency, and collaboration fragility.
 *
 * @compliance
 * - FDA 21 CFR Part 11: Provenance logging on all mutations
 * - Multi-tenant: Organization-scoped queries
 */

import { Router, Request, Response } from 'express';

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

// ═══════════════════════════════════════════════════════════════════════════════
// IN-MEMORY STORE
// ═══════════════════════════════════════════════════════════════════════════════

const store = {
  scenarios: new Map<number, any>(),
  runs: new Map<number, any>(),
  results: new Map<number, any>(),
  findings: new Map<number, any>(),
  scores: new Map<number, any>(),
  remediationPlans: new Map<number, any>(),
  provenance: [] as any[],
  nextId: 1,
};

function nextId(): number {
  return store.nextId++;
}

function logProvenance(
  orgId: number,
  programId: number | null,
  entityType: string,
  entityId: number,
  action: string,
  actorId: number,
  details?: any,
) {
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
// SEED DATA — Rich demo data for testers
// ═══════════════════════════════════════════════════════════════════════════════
let seedScheduled = false;

function scheduleSeedAfterEnginesLoaded() {
  if (seedScheduled) return;
  seedScheduled = true;
  // Defer seeding until after engine simulation functions are defined below
  setTimeout(() => seedSnowGlobeDemo(), 0);
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
  blastRadius: {
    artifactsImpacted: number;
    sectionsImpacted: string[];
  };
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
  'Investigator\'s Brochure',
  'Clinical Protocol',
  'Statistical Analysis Plan',
  'Risk Management File',
];

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

// ── Agency Screen Engine ────────────────────────────────────────────────────

function simulateAgencyScreen(runId: number): EngineResult {
  const findingTemplates = [
    {
      title: 'Missing eCTD envelope metadata',
      summary: 'The submission package lacks required eCTD v4.0 envelope attributes including application-type identifier and sequence-number linkage, which may trigger pre-technical rejection at the FDA gateway.',
      basis: 'FDA eCTD Technical Conformance Guide v3.3',
      remediation: 'Validate eCTD metadata against FDA gateway acceptance criteria and populate all mandatory envelope fields prior to submission.',
    },
    {
      title: 'Inconsistent product naming across modules',
      summary: 'Product name referenced as three distinct variants across Modules 1, 2, and 3. Agency technical screeners flag naming inconsistencies as a rejection-worthy deficiency.',
      basis: 'ICH M4 Common Technical Document guidelines',
      remediation: 'Conduct a cross-module naming harmonization pass and establish a controlled vocabulary for all product references.',
    },
    {
      title: 'Cover letter omits required regulatory history',
      summary: 'The Module 1.0 cover letter does not reference prior IND amendments or cross-reference existing applications as required by FDA Form 356h instructions.',
      basis: 'FDA Form 356h Completion Requirements',
      remediation: 'Update cover letter to include all prior submission references, IND amendment history, and cross-referenced application numbers.',
    },
    {
      title: 'PDF bookmark structure non-compliant',
      summary: 'Multiple Module 2 and Module 5 PDF documents lack hierarchical bookmarking required by FDA technical specifications, potentially triggering gateway reject.',
      basis: 'FDA eCTD Specification v4.0 §3.2 PDF Requirements',
      remediation: 'Rebuild PDF bookmark trees for all Module 2 and Module 5 documents using compliant publishing tools.',
    },
    {
      title: 'Orphaned lifecycle reference detected',
      summary: 'A Module 3 amendment references a superseded drug substance specification (version 2.1) that was replaced in sequence 0045, creating a lifecycle integrity gap.',
      basis: 'ICH M4Q Quality Module Structure',
      remediation: 'Update all cross-references to point to current active versions and remove orphaned lifecycle pointers.',
    },
  ];

  const numFindings = randomInt(2, 5);
  const selected = pickRandom(findingTemplates, numFindings);
  const findings: FindingCluster[] = selected.map((tpl) => ({
    id: nextId(),
    runId,
    engine: 'agency_screen' as EngineId,
    severity: pickSeverity(),
    title: tpl.title,
    summary: tpl.summary,
    regulatoryBasis: tpl.basis,
    blastRadius: {
      artifactsImpacted: randomInt(2, 12),
      sectionsImpacted: pickRandom(DOSSIER_SECTIONS, randomInt(1, 4)),
    },
    suggestedRemediation: tpl.remediation,
    confidence: randomInt(65, 95),
    createdAt: new Date(),
  }));

  const score = randomInt(20, 95);
  return {
    engine: 'agency_screen',
    score,
    summary: `Pre-Technical Rejection Score: ${score}/100. Identified ${findings.length} metadata conflicts and package anomalies across the submission dossier that may trigger gateway-level rejection before technical review commences.`,
    findings,
    metadata: {
      scoreType: 'preTechnicalRejection',
      metadataConflicts: randomInt(1, 8),
      packageAnomalies: randomInt(0, 5),
      gatewayPassProbability: score > 70 ? 'high' : score > 45 ? 'moderate' : 'low',
    },
    completedAt: new Date(),
  };
}

// ── Reviewer Attack Engine ──────────────────────────────────────────────────

function simulateReviewerAttack(runId: number): EngineResult {
  const findingTemplates = [
    {
      title: 'Efficacy claim exceeds pivotal trial evidence',
      summary: 'Primary efficacy claim in Module 2.5 asserts superiority over standard of care, but pivotal trial (Study 301) only demonstrates non-inferiority. Reviewer will likely issue an Information Request demanding supporting evidence.',
      basis: 'FDA Guidance: Clinical Trial Endpoints for Approval',
      remediation: 'Revise clinical overview to align claims precisely with statistical findings from pivotal trials, downgrading superiority language to non-inferiority where applicable.',
    },
    {
      title: 'Safety signal underreporting in clinical summary',
      summary: 'Module 2.7 clinical summary omits three Grade 3 adverse events reported in Study 201 Appendix Tables. Reviewers cross-referencing Module 5 CSRs will identify this discrepancy.',
      basis: 'ICH E3 Structure and Content of Clinical Study Reports',
      remediation: 'Reconcile Module 2.7 safety narrative with all individual CSR safety tables and include complete adverse event accounting.',
    },
    {
      title: 'Subgroup analysis inconsistency',
      summary: 'Pre-specified subgroup analyses in the SAP differ from those reported in the CSR. The elderly subgroup (>65 years) shows a non-significant trend toward harm that is not discussed in the benefit-risk assessment.',
      basis: 'ICH E9 Statistical Principles for Clinical Trials',
      remediation: 'Align reported subgroup analyses with SAP specifications and provide transparent benefit-risk discussion for all pre-specified subgroups.',
    },
    {
      title: 'Missing exposure-response analysis',
      summary: 'Clinical pharmacology section lacks an exposure-response analysis linking drug exposure to efficacy and safety outcomes. FDA Division of Clinical Pharmacology reviewers consistently request this analysis.',
      basis: 'FDA Guidance: Exposure-Response Relationships (2003)',
      remediation: 'Commission exposure-response modeling and integrate results into Module 2.7 and the relevant Module 5 clinical pharmacology report.',
    },
    {
      title: 'Label claim overreach in proposed labeling',
      summary: 'Proposed product labeling includes an indication breadth that extends beyond the studied population. Trial enrolled adults 18-75 but labeling claims efficacy for "adult patients" without upper age qualification.',
      basis: 'FDA Labeling Guidance for Prescription Drugs',
      remediation: 'Restrict indication statement to the enrolled population demographic and add appropriate limitations of use where data gaps exist.',
    },
  ];

  const numFindings = randomInt(2, 5);
  const selected = pickRandom(findingTemplates, numFindings);
  const findings: FindingCluster[] = selected.map((tpl) => ({
    id: nextId(),
    runId,
    engine: 'reviewer_attack' as EngineId,
    severity: pickSeverity(),
    title: tpl.title,
    summary: tpl.summary,
    regulatoryBasis: tpl.basis,
    blastRadius: {
      artifactsImpacted: randomInt(3, 15),
      sectionsImpacted: pickRandom(DOSSIER_SECTIONS, randomInt(2, 5)),
    },
    suggestedRemediation: tpl.remediation,
    confidence: randomInt(60, 92),
    createdAt: new Date(),
  }));

  const score = randomInt(20, 95);
  return {
    engine: 'reviewer_attack',
    score,
    summary: `Reviewer Friction Score: ${score}/100. Simulated adversarial medical/statistical reviewer critique identified ${findings.length} deficiency themes and claim overreach warnings likely to generate Information Requests or Refuse-to-File actions.`,
    findings,
    metadata: {
      scoreType: 'reviewerFriction',
      deficiencyThemes: findings.length,
      claimOverreachWarnings: randomInt(0, 3),
      projectedIRCount: randomInt(2, 12),
      refuseToFileRisk: score < 40 ? 'high' : score < 65 ? 'moderate' : 'low',
    },
    completedAt: new Date(),
  };
}

// ── Audit & Inspection Engine ───────────────────────────────────────────────

function simulateAuditInspection(runId: number): EngineResult {
  const findingTemplates = [
    {
      title: 'Approval chain gap in CMC documentation',
      summary: 'Module 3 drug substance specification document shows version 3.2 was promoted from draft to approved without documented QA review step, violating the organization\'s SOP for document governance.',
      basis: '21 CFR Part 211 — Current Good Manufacturing Practice',
      remediation: 'Implement retrospective QA review and document the approval chain gap in a deviation report with corrective action.',
    },
    {
      title: 'Traceability break between protocol amendments and CSR',
      summary: 'Protocol Amendment 4 (Study 301) modified the primary endpoint definition, but the CSR statistical analysis section references the original endpoint without noting the amendment history.',
      basis: 'ICH E6(R2) Good Clinical Practice §6.15',
      remediation: 'Add protocol amendment traceability matrix to CSR and ensure all endpoint references cite the controlling amendment version.',
    },
    {
      title: 'Incomplete audit trail for data transformations',
      summary: 'SDTM-to-ADaM data transformation logic lacks version-controlled derivation documentation. GCP inspectors will flag this as an audit trail gap per 21 CFR Part 11 requirements.',
      basis: '21 CFR Part 11 — Electronic Records',
      remediation: 'Document all data transformation derivations with version-controlled specifications and validated execution logs.',
    },
    {
      title: 'Site monitoring visit report gaps',
      summary: 'Three clinical sites show gaps of 90+ days between monitoring visits during the enrollment period, exceeding the risk-based monitoring plan thresholds defined in the TMF.',
      basis: 'ICH E6(R2) Good Clinical Practice §5.18',
      remediation: 'Generate retrospective monitoring rationale documents explaining visit gaps and update the risk-based monitoring plan to prevent future gaps.',
    },
    {
      title: 'Missing electronic signature justification',
      summary: 'Fourteen Module 5 documents bear electronic signatures without the required Part 11 compliance statement linking the signature to the signing individual\'s intent and authority.',
      basis: '21 CFR Part 11.50 — Signature Manifestations',
      remediation: 'Attach Part 11 compliance declarations to all electronically signed documents and validate the e-signature system against current requirements.',
    },
  ];

  const numFindings = randomInt(2, 5);
  const selected = pickRandom(findingTemplates, numFindings);
  const findings: FindingCluster[] = selected.map((tpl) => ({
    id: nextId(),
    runId,
    engine: 'audit_inspection' as EngineId,
    severity: pickSeverity(),
    title: tpl.title,
    summary: tpl.summary,
    regulatoryBasis: tpl.basis,
    blastRadius: {
      artifactsImpacted: randomInt(2, 10),
      sectionsImpacted: pickRandom(DOSSIER_SECTIONS, randomInt(1, 4)),
    },
    suggestedRemediation: tpl.remediation,
    confidence: randomInt(55, 90),
    createdAt: new Date(),
  }));

  const score = randomInt(20, 95);
  return {
    engine: 'audit_inspection',
    score,
    summary: `Audit Exposure Score: ${score}/100. Detected ${findings.length} approval chain gaps and traceability weaknesses that would surface during a pre-approval inspection or GCP audit.`,
    findings,
    metadata: {
      scoreType: 'auditExposure',
      approvalChainGaps: randomInt(1, 6),
      traceabilityWeaknesses: randomInt(0, 4),
      inspectionReadiness: score > 70 ? 'ready' : score > 45 ? 'conditional' : 'not_ready',
    },
    completedAt: new Date(),
  };
}

// ── Route & Timing Engine ───────────────────────────────────────────────────

function simulateRouteTiming(runId: number): EngineResult {
  const findingTemplates = [
    {
      title: 'Accelerated pathway eligibility uncertain',
      summary: 'Current evidence package may not meet the threshold for Accelerated Approval under Subpart H. The surrogate endpoint has not been formally qualified by FDA, introducing pathway risk.',
      basis: 'FDA Accelerated Approval Program (21 CFR 314.510)',
      remediation: 'Engage in a Pre-Submission meeting to discuss surrogate endpoint acceptability and prepare contingency for standard approval timeline.',
    },
    {
      title: 'Rolling submission timeline at risk',
      summary: 'CMC module completion lags clinical modules by approximately 14 weeks, jeopardizing the planned rolling NDA submission cadence and potentially delaying PDUFA date assignment.',
      basis: 'FDA Manual of Policies and Procedures (MAPP) 6020.3',
      remediation: 'Accelerate CMC module development and consider parallel workstreams for drug product stability and manufacturing validation.',
    },
    {
      title: 'Advisory Committee meeting probability elevated',
      summary: 'Given the novel mechanism of action and the divided clinical community opinion on the therapeutic approach, there is a >60% probability of an FDA Advisory Committee convening, adding 3-4 months to review timeline.',
      basis: 'FDA Guidance on Advisory Committee Procedures',
      remediation: 'Prepare Advisory Committee briefing materials in parallel with submission and develop a key opinion leader engagement strategy.',
    },
    {
      title: 'Pediatric study plan deadline approaching',
      summary: 'Initial Pediatric Study Plan (iPSP) must be submitted within 60 days of end-of-Phase-2 meeting. Current timeline shows only 30 days allocated for iPSP development, creating compliance risk.',
      basis: 'Pediatric Research Equity Act (PREA)',
      remediation: 'Begin iPSP development immediately with pediatric clinical pharmacology input and request timeline extension if needed.',
    },
  ];

  const numFindings = randomInt(2, 4);
  const selected = pickRandom(findingTemplates, numFindings);
  const findings: FindingCluster[] = selected.map((tpl) => ({
    id: nextId(),
    runId,
    engine: 'route_timing' as EngineId,
    severity: pickSeverity(),
    title: tpl.title,
    summary: tpl.summary,
    regulatoryBasis: tpl.basis,
    blastRadius: {
      artifactsImpacted: randomInt(4, 20),
      sectionsImpacted: pickRandom(DOSSIER_SECTIONS, randomInt(2, 6)),
    },
    suggestedRemediation: tpl.remediation,
    confidence: randomInt(50, 88),
    createdAt: new Date(),
  }));

  const score = randomInt(20, 95);
  return {
    engine: 'route_timing',
    score,
    summary: `Route Viability Score: ${score}/100. Timeline confidence analysis identified ${findings.length} delay risks with estimated ${randomInt(2, 18)}-week cumulative schedule impact.`,
    findings,
    metadata: {
      scoreType: 'routeViability',
      timelineConfidence: score > 70 ? 'high' : score > 45 ? 'moderate' : 'low',
      delayProbability: Math.max(5, 100 - score) + '%',
      estimatedDelayWeeks: randomInt(2, 18),
      pathwayViability: score > 60 ? 'viable' : 'at_risk',
    },
    completedAt: new Date(),
  };
}

// ── Evidence Sufficiency Engine ─────────────────────────────────────────────

function simulateEvidenceSufficiency(runId: number): EngineResult {
  const findingTemplates = [
    {
      title: 'Primary endpoint evidence density below threshold',
      summary: 'The pivotal trial primary endpoint is supported by a single adequate and well-controlled study. FDA precedent for this therapeutic area typically requires two confirmatory studies or a single study with compelling p-value (<0.001).',
      basis: 'FDA Guidance: Providing Clinical Evidence of Effectiveness',
      remediation: 'Strengthen the single-study submission with robust sensitivity analyses, consistent subgroup effects, and supportive evidence from secondary endpoints.',
    },
    {
      title: 'Long-term safety data gap',
      summary: 'For a chronic-use indication, the safety database includes only 6-month exposure data for 85% of subjects. FDA expects 12-month safety data for drugs intended for chronic use per ICH E1 thresholds.',
      basis: 'ICH E1 Population Exposure Guideline',
      remediation: 'Extend the open-label safety study to achieve ICH E1 exposure thresholds or provide a risk management plan addressing the data gap.',
    },
    {
      title: 'Comparator arm evidence weakness',
      summary: 'Active comparator used in Study 302 is not the current standard of care in the target market. Reviewers may question the clinical relevance of comparative efficacy claims.',
      basis: 'ICH E10 Choice of Control Group',
      remediation: 'Provide indirect comparison analyses against the current standard of care and contextualize comparator selection in the clinical overview.',
    },
    {
      title: 'Missing patient-reported outcome validation',
      summary: 'The key secondary endpoint uses a patient-reported outcome instrument that has not been formally validated in the target disease population per FDA PRO guidance requirements.',
      basis: 'FDA Guidance: Patient-Reported Outcome Measures (2009)',
      remediation: 'Submit PRO instrument validation data as a standalone report in Module 5 and reference the psychometric validation study in Module 2.7.',
    },
    {
      title: 'Nonclinical-to-clinical translation gap',
      summary: 'Nonclinical efficacy models show dose-dependent toxicity at exposures only 3x above the proposed clinical dose, leaving a narrow therapeutic margin that is insufficiently characterized.',
      basis: 'ICH M3(R2) Nonclinical Safety Studies',
      remediation: 'Conduct additional PK/PD modeling to establish therapeutic margin confidence and update the nonclinical overview accordingly.',
    },
  ];

  const numFindings = randomInt(2, 5);
  const selected = pickRandom(findingTemplates, numFindings);
  const findings: FindingCluster[] = selected.map((tpl) => ({
    id: nextId(),
    runId,
    engine: 'evidence_sufficiency' as EngineId,
    severity: pickSeverity(),
    title: tpl.title,
    summary: tpl.summary,
    regulatoryBasis: tpl.basis,
    blastRadius: {
      artifactsImpacted: randomInt(3, 14),
      sectionsImpacted: pickRandom(DOSSIER_SECTIONS, randomInt(2, 5)),
    },
    suggestedRemediation: tpl.remediation,
    confidence: randomInt(58, 93),
    createdAt: new Date(),
  }));

  const score = randomInt(20, 95);
  return {
    engine: 'evidence_sufficiency',
    score,
    summary: `Claim Defensibility Score: ${score}/100. Evidence gap analysis revealed ${findings.length} areas where evidentiary support density is below regulatory expectations for the claimed indications.`,
    findings,
    metadata: {
      scoreType: 'claimDefensibility',
      evidenceGaps: findings.length,
      supportDensityWarnings: randomInt(1, 5),
      overallEvidenceGrade: score > 75 ? 'strong' : score > 50 ? 'moderate' : 'weak',
    },
    completedAt: new Date(),
  };
}

// ── Collaboration Fragility Engine ──────────────────────────────────────────

function simulateCollaborationFragility(runId: number): EngineResult {
  const findingTemplates = [
    {
      title: 'Single-point-of-failure in CMC authoring',
      summary: 'Module 3 content ownership is concentrated in a single subject matter expert with no documented backup. If this individual becomes unavailable, CMC module progress stalls entirely.',
      basis: 'ICH Q10 Pharmaceutical Quality System — Knowledge Management',
      remediation: 'Cross-train a secondary CMC author and establish a knowledge transfer protocol for all critical-path document ownership roles.',
    },
    {
      title: 'Approval chain bottleneck at medical review',
      summary: 'The medical reviewer approval queue shows an average 21-day turnaround for Module 2 clinical documents, with three documents currently in queue. This bottleneck is the primary critical-path constraint.',
      basis: 'Organizational SOP — Document Review and Approval',
      remediation: 'Add a parallel medical reviewer to the approval chain and implement an escalation protocol for documents exceeding SLA targets.',
    },
    {
      title: 'Cross-functional handoff fragility between biostatistics and clinical',
      summary: 'Analysis dataset handoffs between biostatistics and clinical writing teams lack a structured data package specification, resulting in an average 2.5 revision cycles per CSR.',
      basis: 'ICH E9(R1) Estimands Framework — Implementation',
      remediation: 'Define a standardized data handoff package template including ADaM specifications, table shells, and analysis results datasets.',
    },
    {
      title: 'Vendor dependency risk in regulatory publishing',
      summary: 'Regulatory publishing is outsourced to a single CRO partner with a 45-day lead time for eCTD compilation. Any scope changes or corrections require re-entering the publishing queue.',
      basis: 'ICH M8 eCTD Implementation Guide',
      remediation: 'Establish a secondary publishing vendor relationship and negotiate expedited turnaround SLAs for the primary vendor.',
    },
    {
      title: 'Stakeholder alignment gap on benefit-risk narrative',
      summary: 'Clinical, regulatory affairs, and commercial teams hold divergent views on the benefit-risk positioning. No documented alignment session has occurred, creating risk of inconsistent messaging across submission documents.',
      basis: 'ICH M4E(R2) — Common Technical Document for Efficacy',
      remediation: 'Convene a cross-functional benefit-risk alignment workshop and document the consensus position in a controlled internal briefing document.',
    },
  ];

  const numFindings = randomInt(2, 5);
  const selected = pickRandom(findingTemplates, numFindings);
  const findings: FindingCluster[] = selected.map((tpl) => ({
    id: nextId(),
    runId,
    engine: 'collaboration_fragility' as EngineId,
    severity: pickSeverity(),
    title: tpl.title,
    summary: tpl.summary,
    regulatoryBasis: tpl.basis,
    blastRadius: {
      artifactsImpacted: randomInt(2, 12),
      sectionsImpacted: pickRandom(DOSSIER_SECTIONS, randomInt(1, 4)),
    },
    suggestedRemediation: tpl.remediation,
    confidence: randomInt(55, 88),
    createdAt: new Date(),
  }));

  const score = randomInt(20, 95);
  return {
    engine: 'collaboration_fragility',
    score,
    summary: `Bottleneck Risk Score: ${score}/100. Collaboration analysis identified ${findings.length} fragility points including approval chain bottlenecks and handoff risks that threaten submission timeline integrity.`,
    findings,
    metadata: {
      scoreType: 'approvalChainFragility',
      bottleneckRisk: score < 40 ? 'critical' : score < 65 ? 'elevated' : 'manageable',
      approvalChainFragility: randomInt(1, 5),
      handoffFragility: randomInt(1, 4),
      singlePointsOfFailure: randomInt(0, 3),
    },
    completedAt: new Date(),
  };
}

const ENGINE_SIMULATORS: Record<EngineId, (runId: number) => EngineResult> = {
  agency_screen: simulateAgencyScreen,
  reviewer_attack: simulateReviewerAttack,
  audit_inspection: simulateAuditInspection,
  route_timing: simulateRouteTiming,
  evidence_sufficiency: simulateEvidenceSufficiency,
  collaboration_fragility: simulateCollaborationFragility,
};

// ── Run Execution ───────────────────────────────────────────────────────────

function executeRun(
  runId: number,
  programId: number,
  engines: EngineId[],
  orgId: number,
  userId: number,
  scenarioId?: number,
): void {
  const run = store.runs.get(runId);
  if (!run) return;

  run.status = 'running';
  run.startedAt = new Date();

  const engineResults: EngineResult[] = [];
  const allFindings: FindingCluster[] = [];

  for (const engineId of engines) {
    const simulator = ENGINE_SIMULATORS[engineId];
    if (!simulator) continue;

    const result = simulator(runId);
    engineResults.push(result);

    for (const finding of result.findings) {
      store.findings.set(finding.id, { ...finding, programId, organizationId: orgId });
      allFindings.push(finding);
    }
  }

  // Store results
  const resultId = nextId();
  const resultRecord = {
    id: resultId,
    runId,
    programId,
    organizationId: orgId,
    scenarioId: scenarioId || null,
    engineResults,
    totalFindings: allFindings.length,
    criticalFindings: allFindings.filter((f) => f.severity === 'critical').length,
    highFindings: allFindings.filter((f) => f.severity === 'high').length,
    createdAt: new Date(),
  };
  store.results.set(resultId, resultRecord);

  // Compute and store scores
  const scoreMap: Record<string, number> = {};
  for (const er of engineResults) {
    const scoreType = er.metadata.scoreType as string;
    if (scoreType) scoreMap[scoreType] = er.score;
  }

  // Derive composite scores
  if (scoreMap.preTechnicalRejection !== undefined) {
    scoreMap.submissionSurvival = Math.min(
      100,
      Math.round(
        (scoreMap.preTechnicalRejection * 0.3 +
          (scoreMap.reviewerFriction || 70) * 0.3 +
          (scoreMap.claimDefensibility || 70) * 0.4),
      ),
    );
  }
  if (scoreMap.auditExposure !== undefined) {
    scoreMap.traceabilityIntegrity = Math.min(
      100,
      Math.round(scoreMap.auditExposure * 0.6 + (scoreMap.approvalChainFragility || 70) * 0.4),
    );
  }

  const scoreId = nextId();
  const scoreRecord = {
    id: scoreId,
    runId,
    programId,
    organizationId: orgId,
    scores: scoreMap,
    computedAt: new Date(),
  };
  store.scores.set(scoreId, scoreRecord);

  // Generate remediation plan
  const sortedFindings = [...allFindings].sort((a, b) => {
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const diff = severityOrder[a.severity] - severityOrder[b.severity];
    if (diff !== 0) return diff;
    return b.confidence - a.confidence;
  });

  const remediationId = nextId();
  const remediationPlan = {
    id: remediationId,
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
    generatedAt: new Date(),
  };
  store.remediationPlans.set(remediationId, remediationPlan);

  // Finalize run
  run.status = 'completed';
  run.completedAt = new Date();
  run.resultId = resultId;
  run.scoreId = scoreId;
  run.remediationPlanId = remediationId;
  run.totalFindings = allFindings.length;
  run.criticalFindings = resultRecord.criticalFindings;
  store.runs.set(runId, run);

  logProvenance(orgId, programId, 'prediction-run', runId, 'completed', userId, {
    description: `Prediction run completed with ${engines.length} engines, ${allFindings.length} findings`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED DATA IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

function seedSnowGlobeDemo() {
  if (store.scenarios.size > 0) return;

  const DEMO_PROGRAM_ID = 1; // Matches mission-control seed program
  const orgId = 1;

  // Create baseline scenario
  const scenarioId = nextId();
  store.scenarios.set(scenarioId, {
    id: scenarioId, organizationId: orgId, programId: DEMO_PROGRAM_ID,
    name: 'Baseline — Current State', description: 'Baseline scenario reflecting current program state',
    isBaseline: true, isArchived: false, createdById: 1,
    createdAt: new Date(Date.now() - 7 * 86400000), updatedAt: new Date(),
  });

  // Create alternate scenario
  const altScenarioId = nextId();
  store.scenarios.set(altScenarioId, {
    id: altScenarioId, organizationId: orgId, programId: DEMO_PROGRAM_ID,
    name: 'Alternate — Accelerated Filing', description: 'What-if scenario with rolling submission strategy',
    isBaseline: false, isArchived: false, createdById: 1,
    createdAt: new Date(Date.now() - 2 * 86400000), updatedAt: new Date(),
  });

  // Simulate a full stress test run
  const runId = nextId();
  store.runs.set(runId, {
    id: runId, organizationId: orgId, programId: DEMO_PROGRAM_ID,
    scenarioId, runType: 'full_stress_test', status: 'completed',
    triggeredById: 1, enginesRun: ALL_ENGINES,
    startedAt: new Date(Date.now() - 86400000),
    completedAt: new Date(Date.now() - 86400000 + 45000),
    durationMs: 45000,
  });

  // Generate findings from all engines
  const allResults: EngineResult[] = [
    simulateAgencyScreen(runId),
    simulateReviewerAttack(runId),
    simulateAuditInspection(runId),
    simulateRouteTiming(runId),
    simulateEvidenceSufficiency(runId),
    simulateCollaborationFragility(runId),
  ];

  // Store results
  const resultId = nextId();
  store.results.set(resultId, {
    id: resultId, runId, results: allResults,
    createdAt: new Date(Date.now() - 86400000),
  });

  // Store findings with program/org scope (matching how routes store them)
  allResults.forEach(r => {
    r.findings.forEach(f => {
      store.findings.set(f.id, { ...f, programId: DEMO_PROGRAM_ID, organizationId: orgId });
    });
  });

  // Compute and store composite scores
  const scoreMap: Record<string, number> = {};
  allResults.forEach(r => {
    const meta = r.metadata as any;
    if (meta?.scoreType) {
      scoreMap[meta.scoreType] = r.score;
    }
  });
  // Fill composites
  if (!scoreMap.submissionSurvival) scoreMap.submissionSurvival = 100 - (scoreMap.preTechnicalRejection || 50);
  if (!scoreMap.traceabilityIntegrity) scoreMap.traceabilityIntegrity = 100 - (scoreMap.auditExposure || 50);

  const compositeId = nextId();
  store.scores.set(compositeId, {
    id: compositeId, organizationId: orgId, programId: DEMO_PROGRAM_ID,
    runId, scores: scoreMap, computedAt: new Date(Date.now() - 86400000),
  });

  // Generate remediation plan (single object with actions array, matching route format)
  const sortedFindings = Array.from(store.findings.values())
    .sort((a, b) => {
      const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (sev[a.severity] || 3) - (sev[b.severity] || 3);
    })
    .slice(0, 10);

  const remPlanId = nextId();
  store.remediationPlans.set(remPlanId, {
    id: remPlanId, programId: DEMO_PROGRAM_ID, organizationId: orgId,
    actions: sortedFindings.map((f, idx) => ({
      priority: idx + 1, findingId: f.id, engine: f.engine, severity: f.severity,
      title: f.title, action: f.suggestedRemediation,
      estimatedEffort: f.severity === 'critical' ? 'high' : f.severity === 'high' ? 'medium' : 'low',
      status: 'pending', blastRadius: f.blastRadius,
    })),
    generatedAt: new Date(Date.now() - 86400000),
  });
}

// Execute seed (engine functions are already defined above)
scheduleSeedAfterEnginesLoaded();

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/scenarios', (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const programId = req.query.programId ? parseInt(req.query.programId as string) : undefined;

  let scenarios = Array.from(store.scenarios.values())
    .filter((s) => s.organizationId === orgId);

  if (programId) {
    scenarios = scenarios.filter((s) => s.programId === programId);
  }

  scenarios.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  res.json({ data: scenarios });
});

router.post('/scenarios', (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  const id = nextId();

  const scenario = {
    id,
    organizationId: orgId,
    createdById: userId,
    programId: req.body.programId,
    name: req.body.name || `Scenario ${id}`,
    description: req.body.description || '',
    assumptions: req.body.assumptions || {},
    isBaseline: req.body.isBaseline || false,
    status: 'active',
    tags: req.body.tags || [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  store.scenarios.set(id, scenario);
  logProvenance(orgId, scenario.programId, 'scenario', id, 'created', userId);
  res.status(201).json({ data: scenario });
});

router.get('/scenarios/:id', (req: Request, res: Response) => {
  const scenario = store.scenarios.get(parseInt(req.params.id));
  if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

  // Enrich with associated runs
  const runs = Array.from(store.runs.values())
    .filter((r) => r.scenarioId === scenario.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ data: { ...scenario, runs } });
});

router.patch('/scenarios/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const scenario = store.scenarios.get(id);
  if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

  const prev = { ...scenario };
  const allowedFields = ['name', 'description', 'assumptions', 'isBaseline', 'status', 'tags'];
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      scenario[field] = req.body[field];
    }
  }
  scenario.updatedAt = new Date();

  store.scenarios.set(id, scenario);
  logProvenance(getOrgId(req), scenario.programId, 'scenario', id, 'updated', getUserId(req), {
    prev,
    next: scenario,
  });
  res.json({ data: scenario });
});

router.post('/scenarios/:id/clone', (req: Request, res: Response) => {
  const sourceId = parseInt(req.params.id);
  const source = store.scenarios.get(sourceId);
  if (!source) return res.status(404).json({ error: 'Scenario not found' });

  const orgId = getOrgId(req);
  const userId = getUserId(req);
  const id = nextId();

  const cloned = {
    ...JSON.parse(JSON.stringify(source)),
    id,
    name: req.body.name || `${source.name} (Copy)`,
    description: req.body.description || source.description,
    isBaseline: false,
    clonedFromId: sourceId,
    createdById: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  store.scenarios.set(id, cloned);
  logProvenance(orgId, cloned.programId, 'scenario', id, 'cloned', userId, {
    description: `Cloned from scenario #${sourceId}`,
  });
  res.status(201).json({ data: cloned });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PREDICTION RUNS
// ═══════════════════════════════════════════════════════════════════════════════

function createAndExecuteRun(
  req: Request,
  res: Response,
  engines: EngineId[],
  runType: string,
): void {
  const programId = parseInt(req.params.programId);
  const orgId = getOrgId(req);
  const userId = getUserId(req);
  const scenarioId = req.body.scenarioId ? parseInt(req.body.scenarioId) : undefined;
  const id = nextId();

  const run = {
    id,
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
    createdAt: new Date(),
  };

  store.runs.set(id, run);
  logProvenance(orgId, programId, 'prediction-run', id, 'created', userId, {
    description: `${runType} run initiated with engines: ${engines.join(', ')}`,
  });

  // Simulate immediately (synchronous for in-memory store)
  executeRun(id, programId, engines, orgId, userId, scenarioId);

  res.status(201).json({ data: store.runs.get(id) });
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

router.get('/runs/:runId', (req: Request, res: Response) => {
  const run = store.runs.get(parseInt(req.params.runId));
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json({ data: run });
});

router.get('/runs/:runId/results', (req: Request, res: Response) => {
  const runId = parseInt(req.params.runId);
  const run = store.runs.get(runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const result = Array.from(store.results.values()).find((r) => r.runId === runId);
  if (!result) {
    return res.json({ data: { run, results: null, message: 'Run has not completed yet' } });
  }

  const findings = Array.from(store.findings.values()).filter((f) => f.runId === runId);
  const scoreRecord = Array.from(store.scores.values()).find((s) => s.runId === runId);
  const remediation = Array.from(store.remediationPlans.values()).find((r) => r.runId === runId);

  res.json({
    data: {
      run,
      results: result,
      findings,
      scores: scoreRecord?.scores || {},
      remediationPlan: remediation || null,
    },
  });
});

router.get('/runs/:runId/delta-vs-baseline', (req: Request, res: Response) => {
  const runId = parseInt(req.params.runId);
  const run = store.runs.get(runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  // Find the baseline scenario for this program
  const baselineScenario = Array.from(store.scenarios.values()).find(
    (s) => s.programId === run.programId && s.isBaseline,
  );

  if (!baselineScenario) {
    return res.json({
      data: {
        run,
        delta: null,
        message: 'No baseline scenario found for this program. Mark a scenario as baseline first.',
      },
    });
  }

  // Find the most recent completed run for the baseline scenario
  const baselineRun = Array.from(store.runs.values())
    .filter((r) => r.scenarioId === baselineScenario.id && r.status === 'completed')
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0];

  if (!baselineRun) {
    return res.json({
      data: {
        run,
        delta: null,
        message: 'Baseline scenario has no completed runs.',
      },
    });
  }

  const currentScores = Array.from(store.scores.values()).find((s) => s.runId === runId);
  const baselineScores = Array.from(store.scores.values()).find((s) => s.runId === baselineRun.id);

  const scoreDelta: Record<string, { current: number; baseline: number; delta: number; direction: string }> = {};
  if (currentScores && baselineScores) {
    for (const key of Object.keys(currentScores.scores)) {
      const current = currentScores.scores[key] || 0;
      const baseline = baselineScores.scores[key] || 0;
      const delta = current - baseline;
      scoreDelta[key] = {
        current,
        baseline,
        delta,
        direction: delta > 0 ? 'improved' : delta < 0 ? 'degraded' : 'unchanged',
      };
    }
  }

  const currentFindings = Array.from(store.findings.values()).filter((f) => f.runId === runId);
  const baselineFindings = Array.from(store.findings.values()).filter(
    (f) => f.runId === baselineRun.id,
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
        currentCritical: currentFindings.filter((f) => f.severity === 'critical').length,
        baselineCritical: baselineFindings.filter((f) => f.severity === 'critical').length,
      },
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCORE APIs
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/scores', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const orgId = getOrgId(req);

  // Find the most recent score record for this program
  const latestScore = Array.from(store.scores.values())
    .filter((s) => s.programId === programId && s.organizationId === orgId)
    .sort((a, b) => new Date(b.computedAt).getTime() - new Date(a.computedAt).getTime())[0];

  if (!latestScore) {
    // Return default scores
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
});

router.get('/artifacts/:artifactId/scores', (req: Request, res: Response) => {
  const artifactId = parseInt(req.params.artifactId);

  // Find findings that impact this artifact (by blast radius mention)
  const relevantFindings = Array.from(store.findings.values()).filter((f) => {
    return f.blastRadius && f.blastRadius.artifactsImpacted > 0;
  });

  // Compute artifact-level risk score based on finding severity and frequency
  let riskScore = 0;
  let findingCount = 0;
  const severityWeights: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 3 };

  // Simulate artifact-specific scoring by using artifactId as a seed
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
      engineBreakdown: {
        agency_screen: randomInt(30, 95),
        reviewer_attack: randomInt(30, 95),
        audit_inspection: randomInt(30, 95),
      },
    },
  });
});

router.get('/dossier-nodes/:nodeId/scores', (req: Request, res: Response) => {
  const nodeId = parseInt(req.params.nodeId);

  // Simulate dossier-node-level scoring
  const sectionScore = 40 + ((nodeId * 17) % 55); // Deterministic but varied
  const completeness = 30 + ((nodeId * 23) % 65);
  const consistency = 35 + ((nodeId * 31) % 60);

  res.json({
    data: {
      nodeId,
      scores: {
        overall: sectionScore,
        completeness,
        consistency,
        evidenceDensity: 25 + ((nodeId * 13) % 70),
        reviewerRisk: Math.max(5, 100 - sectionScore),
      },
      lastAssessedAt: new Date(),
      assessmentSource: 'snowglobe-prediction',
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REMEDIATION
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/programs/:programId/remediation-plan', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const orgId = getOrgId(req);

  // Find the most recent remediation plan for this program
  const latestPlan = Array.from(store.remediationPlans.values())
    .filter((r) => r.programId === programId && r.organizationId === orgId)
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())[0];

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
});

router.get('/programs/:programId/top-findings', (req: Request, res: Response) => {
  const programId = parseInt(req.params.programId);
  const orgId = getOrgId(req);
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

  // Get all findings for this program, sorted by severity then confidence
  const findings = Array.from(store.findings.values())
    .filter((f) => f.programId === programId && f.organizationId === orgId)
    .sort((a, b) => {
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const diff = severityOrder[a.severity] - severityOrder[b.severity];
      if (diff !== 0) return diff;
      return b.confidence - a.confidence;
    })
    .slice(0, limit);

  // Group by engine for chamber-level view
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
        critical: findings.filter((f) => f.severity === 'critical').length,
        high: findings.filter((f) => f.severity === 'high').length,
        medium: findings.filter((f) => f.severity === 'medium').length,
        low: findings.filter((f) => f.severity === 'low').length,
      },
    },
  });
});

router.post('/runs/:runId/create-findings-memo', (req: Request, res: Response) => {
  const runId = parseInt(req.params.runId);
  const orgId = getOrgId(req);
  const userId = getUserId(req);

  const run = store.runs.get(runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const result = Array.from(store.results.values()).find((r) => r.runId === runId);
  if (!result) return res.status(400).json({ error: 'Run has no results yet' });

  const findings = Array.from(store.findings.values())
    .filter((f) => f.runId === runId)
    .sort((a, b) => {
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

  const scoreRecord = Array.from(store.scores.values()).find((s) => s.runId === runId);

  // Generate the governed findings memo artifact
  const memoId = nextId();
  const memo = {
    id: memoId,
    runId,
    programId: run.programId,
    organizationId: orgId,
    createdById: userId,
    artifactType: 'findings-memo',
    title: `AnA Predictions Findings Memo — ${run.runType} — ${new Date().toISOString().split('T')[0]}`,
    status: 'draft',
    content: {
      header: {
        programId: run.programId,
        runId,
        runType: run.runType,
        enginesExecuted: run.engines,
        generatedAt: new Date().toISOString(),
        generatedBy: userId,
      },
      executiveSummary: `This findings memo summarizes the results of a ${run.runType} prediction run executed across ${run.engines.length} engine(s). The analysis identified ${findings.length} findings (${result.criticalFindings} critical, ${result.highFindings} high). Immediate attention is recommended for all critical-severity findings to mitigate regulatory risk.`,
      scoresSummary: scoreRecord?.scores || {},
      findings: findings.map((f, idx) => ({
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
      engineSummaries: result.engineResults.map((er: EngineResult) => ({
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
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Store as a findings artifact
  store.results.set(memoId, memo);

  logProvenance(orgId, run.programId, 'findings-memo', memoId, 'created', userId, {
    description: `Generated governed findings memo from run #${runId} with ${findings.length} findings`,
  });

  res.status(201).json({ data: memo });
});

export default router;
