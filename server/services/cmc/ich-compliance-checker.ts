/**
 * Deterministic ICH compliance checker for a CMC project.
 *
 * Runs rule-based checks against the project's actual stored data
 * (quality_specifications, analytical_methods, stability_studies,
 * drug_substances, manufacturing_processes, cmc_source_objects) and
 * reports per-guideline pass / warning / fail status with the underlying
 * evidence. No LLM, no prompts — every finding is traceable back to a
 * SQL row.
 *
 * Covers the guidelines most commonly cited by FDA reviewers at
 * IND / NDA / BLA refuse-to-file:
 *   Q1A(R2) — Stability of new drug substances and products
 *   Q2(R1)  — Validation of analytical procedures
 *   Q3A(R2) / Q3B(R2) — Impurity thresholds
 *   Q3D(R2) — Elemental impurities
 *   Q6A / Q6B — Specifications
 *   Q8(R2)  — Pharmaceutical development (QbD)
 *   Q9      — Quality risk management
 *   Q10     — Pharmaceutical quality system
 *
 * @module server/services/cmc/ich-compliance-checker
 */

import { getPool } from '../../db';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('cmc-ich-compliance');

export type IchGuideline =
  | 'Q1A(R2)'
  | 'Q2(R1)'
  | 'Q3A(R2)'
  | 'Q3B(R2)'
  | 'Q3D(R2)'
  | 'Q6A'
  | 'Q6B'
  | 'Q8(R2)'
  | 'Q9'
  | 'Q10';

export type CheckStatus = 'pass' | 'warning' | 'fail' | 'not_applicable';

export interface IchCheckFinding {
  guideline: IchGuideline;
  ruleId: string;
  status: CheckStatus;
  message: string;
  evidence: string[];
  /** Citation / section of the underlying guideline. */
  citation: string;
}

export interface IchComplianceReport {
  projectId: string;
  organizationId: number;
  overallStatus: 'compliant' | 'warnings' | 'non_compliant';
  guidelineStatus: Record<IchGuideline, CheckStatus>;
  findings: IchCheckFinding[];
  counts: { pass: number; warning: number; fail: number; not_applicable: number };
  evaluatedAt: string;
}

interface ProjectInputs {
  specs: Array<Record<string, unknown>>;
  methods: Array<Record<string, unknown>>;
  stability: Array<Record<string, unknown>>;
  drugSubs: Array<Record<string, unknown>>;
  processes: Array<Record<string, unknown>>;
  sourceObjects: Array<Record<string, unknown>>;
  sections: Array<Record<string, unknown>>;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function runIchComplianceCheck(
  orgId: number,
  projectId: string,
): Promise<IchComplianceReport> {
  const inputs = await gatherInputs(orgId, projectId);

  const findings: IchCheckFinding[] = [
    ...checkQ1A(inputs),
    ...checkQ2(inputs),
    ...checkQ3AandQ3B(inputs),
    ...checkQ3D(inputs),
    ...checkQ6AandQ6B(inputs),
    ...checkQ8(inputs),
    ...checkQ9(inputs),
    ...checkQ10(inputs),
  ];

  const counts = { pass: 0, warning: 0, fail: 0, not_applicable: 0 };
  for (const f of findings) counts[f.status]++;

  const guidelineStatus: Record<IchGuideline, CheckStatus> = {
    'Q1A(R2)': 'not_applicable',
    'Q2(R1)':  'not_applicable',
    'Q3A(R2)': 'not_applicable',
    'Q3B(R2)': 'not_applicable',
    'Q3D(R2)': 'not_applicable',
    'Q6A':     'not_applicable',
    'Q6B':     'not_applicable',
    'Q8(R2)':  'not_applicable',
    'Q9':      'not_applicable',
    'Q10':     'not_applicable',
  };
  // Aggregate: worst-status per guideline wins.
  const severityRank: Record<CheckStatus, number> = {
    fail: 3, warning: 2, pass: 1, not_applicable: 0,
  };
  for (const f of findings) {
    if (severityRank[f.status] > severityRank[guidelineStatus[f.guideline]]) {
      guidelineStatus[f.guideline] = f.status;
    }
  }

  let overallStatus: 'compliant' | 'warnings' | 'non_compliant' = 'compliant';
  if (counts.fail > 0) overallStatus = 'non_compliant';
  else if (counts.warning > 0) overallStatus = 'warnings';

  log.info('ICH compliance check complete', {
    projectId,
    overallStatus,
    findingCount: findings.length,
    counts,
  });

  return {
    projectId,
    organizationId: orgId,
    overallStatus,
    guidelineStatus,
    findings,
    counts,
    evaluatedAt: new Date().toISOString(),
  };
}

// ─── Input gatherers ─────────────────────────────────────────────────────────

async function gatherInputs(orgId: number, projectId: string): Promise<ProjectInputs> {
  const pool = getPool();
  const projectIdParam = String(projectId);

  const safe = async (sql: string, params: unknown[]) => {
    try {
      const { rows } = await pool.query(sql, params);
      return rows;
    } catch (err) {
      log.warn('Input query failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  };

  const [specs, methods, stability, drugSubs, processes, sourceObjects, sections] =
    await Promise.all([
      safe(`SELECT material_type AS "materialType", material_name AS "materialName",
                   test_parameters AS "testParameters",
                   acceptance_criteria AS "acceptanceCriteria",
                   justification
            FROM quality_specifications WHERE project_id = $1::text::uuid`,
        [projectIdParam]),
      safe(`SELECT method_name AS "methodName", method_type AS "methodType",
                   purpose, validation_status AS "validationStatus",
                   specificity_data AS "specificityData",
                   linearity_data AS "linearityData",
                   accuracy_data AS "accuracyData",
                   precision_data AS "precisionData",
                   robustness_data AS "robustnessData"
            FROM analytical_methods WHERE project_id = $1::text::uuid`,
        [projectIdParam]),
      safe(`SELECT study_name AS "studyName", study_type AS "studyType",
                   storage_condition AS "storageCondition", duration, status, results
            FROM stability_studies WHERE project_id = $1::text::uuid`,
        [projectIdParam]),
      safe(`SELECT substance_name AS "substanceName", impurities,
                   characterization_data AS "characterizationData"
            FROM drug_substances WHERE project_id = $1::text::uuid`,
        [projectIdParam]),
      safe(`SELECT process_name AS "processName", process_type AS "processType",
                   process_steps AS "processSteps",
                   critical_process_parameters AS "criticalProcessParameters",
                   process_controls AS "processControls",
                   validation_status AS "validationStatus"
            FROM manufacturing_processes WHERE project_id = $1::text::uuid`,
        [projectIdParam]),
      safe(`SELECT source_type AS "sourceType",
                   source_payload AS "sourcePayload",
                   source_key AS "sourceKey"
            FROM cmc_source_objects
            WHERE organization_id = $1 AND project_id::text = $2`,
        [orgId, projectIdParam]),
      safe(`SELECT section_key AS "sectionKey",
                   approval_state AS "approvalState",
                   stale,
                   narrative_text AS "narrativeText"
            FROM cmc_module3_sections
            WHERE organization_id = $1 AND project_id::text = $2`,
        [orgId, projectIdParam]),
    ]);

  return { specs, methods, stability, drugSubs, processes, sourceObjects, sections };
}

// ─── Rule checks ─────────────────────────────────────────────────────────────

function checkQ1A(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

  if (inp.stability.length === 0) {
    findings.push({
      guideline: 'Q1A(R2)',
      ruleId: 'Q1A_NO_STABILITY',
      status: 'fail',
      message: 'No stability studies recorded for the project.',
      evidence: ['stability_studies row count: 0'],
      citation: 'ICH Q1A(R2) §1 — Stability data required for registration applications.',
    });
    return findings;
  }

  const longTerm = inp.stability.filter(s =>
    String(s.studyType ?? '').toLowerCase().includes('long')
    || String(s.storageCondition ?? '').includes('25')
    || String(s.storageCondition ?? '').includes('30'),
  );
  const accelerated = inp.stability.filter(s =>
    String(s.studyType ?? '').toLowerCase().includes('accel')
    || String(s.storageCondition ?? '').includes('40'),
  );

  if (longTerm.length === 0) {
    findings.push({
      guideline: 'Q1A(R2)',
      ruleId: 'Q1A_NO_LONG_TERM',
      status: 'fail',
      message: 'No long-term stability study at 25°C/60% RH or 30°C/65% RH recorded.',
      evidence: [`stability_studies long-term count: 0`],
      citation: 'ICH Q1A(R2) §2.1.7.1 — Long-term storage condition required.',
    });
  } else if (longTerm.length < 3) {
    findings.push({
      guideline: 'Q1A(R2)',
      ruleId: 'Q1A_BATCH_COUNT',
      status: 'warning',
      message: `Only ${longTerm.length} long-term batch(es) recorded; ICH Q1A(R2) recommends three primary batches.`,
      evidence: longTerm.map(s => `Study: ${s.studyName} (${s.storageCondition})`),
      citation: 'ICH Q1A(R2) §2.1.3 — Selection of batches.',
    });
  }

  if (accelerated.length === 0) {
    findings.push({
      guideline: 'Q1A(R2)',
      ruleId: 'Q1A_NO_ACCELERATED',
      status: 'warning',
      message: 'No accelerated stability study at 40°C/75% RH recorded.',
      evidence: ['stability_studies accelerated count: 0'],
      citation: 'ICH Q1A(R2) §2.1.7.1 — Accelerated condition required for shelf-life extrapolation.',
    });
  }

  // Failed studies are a critical signal.
  const failed = inp.stability.filter(s => String(s.status ?? '').toLowerCase() === 'failed');
  if (failed.length > 0) {
    findings.push({
      guideline: 'Q1A(R2)',
      ruleId: 'Q1A_FAILED_STUDY',
      status: 'fail',
      message: `${failed.length} stability study/studies have failed status — shelf-life claims are not supported.`,
      evidence: failed.map(s => `Study: ${s.studyName}`),
      citation: 'ICH Q1A(R2) §2.1.7.3 — OOS during stability requires investigation and resolution.',
    });
  }

  if (findings.length === 0) {
    findings.push({
      guideline: 'Q1A(R2)',
      ruleId: 'Q1A_OK',
      status: 'pass',
      message: 'Stability program structure satisfies ICH Q1A(R2) coverage rules.',
      evidence: [`long-term: ${longTerm.length}`, `accelerated: ${accelerated.length}`],
      citation: 'ICH Q1A(R2) §2.1.',
    });
  }

  return findings;
}

function checkQ2(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

  if (inp.methods.length === 0) {
    findings.push({
      guideline: 'Q2(R1)',
      ruleId: 'Q2_NO_METHODS',
      status: 'fail',
      message: 'No analytical methods recorded for the project.',
      evidence: ['analytical_methods row count: 0'],
      citation: 'ICH Q2(R1) §1 — Validation of analytical procedures.',
    });
    return findings;
  }

  const unvalidated = inp.methods.filter(m => {
    const s = String(m.validationStatus ?? '').toLowerCase();
    return s !== 'validated' && s !== 'verified' && s !== 'transferred';
  });
  if (unvalidated.length > 0) {
    findings.push({
      guideline: 'Q2(R1)',
      ruleId: 'Q2_UNVALIDATED_METHODS',
      status: 'fail',
      message: `${unvalidated.length} method(s) lack validated / verified status.`,
      evidence: unvalidated.slice(0, 5).map(m => `${m.methodName}: ${m.validationStatus ?? 'unknown'}`),
      citation: 'ICH Q2(R1) §1 — Methods used for release and stability must be validated.',
    });
  }

  // Per-method completeness of Q2 validation characteristics.
  for (const m of inp.methods) {
    const purpose = String(m.purpose ?? '').toLowerCase();
    if (purpose.includes('identity')) continue; // Identity methods only need specificity.

    const missing: string[] = [];
    if (m.specificityData == null) missing.push('specificity');
    if (m.linearityData == null && (purpose.includes('assay') || purpose.includes('quant'))) missing.push('linearity');
    if (m.accuracyData == null && (purpose.includes('assay') || purpose.includes('impur'))) missing.push('accuracy');
    if (m.precisionData == null) missing.push('precision');
    if (missing.length > 0) {
      findings.push({
        guideline: 'Q2(R1)',
        ruleId: 'Q2_INCOMPLETE_VALIDATION',
        status: 'warning',
        message: `Method "${m.methodName}" is missing validation evidence: ${missing.join(', ')}.`,
        evidence: [`Method type: ${m.methodType}`, `Purpose: ${m.purpose}`],
        citation: `ICH Q2(R1) Table — Required validation characteristics for "${m.purpose}".`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      guideline: 'Q2(R1)',
      ruleId: 'Q2_OK',
      status: 'pass',
      message: `${inp.methods.length} analytical method(s) validated with complete Q2(R1) evidence.`,
      evidence: [`method_count: ${inp.methods.length}`],
      citation: 'ICH Q2(R1) §1.',
    });
  }

  return findings;
}

function checkQ3AandQ3B(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

  const totalImpurities = inp.drugSubs.reduce((sum, ds) => {
    const imp = ds.impurities;
    if (Array.isArray(imp)) return sum + imp.length;
    if (typeof imp === 'object' && imp !== null) return sum + Object.keys(imp as object).length;
    return sum;
  }, 0);

  if (inp.drugSubs.length === 0) {
    findings.push({
      guideline: 'Q3A(R2)',
      ruleId: 'Q3A_NO_DRUG_SUBSTANCE',
      status: 'warning',
      message: 'No drug substance records — Q3A impurity assessment cannot be evaluated.',
      evidence: ['drug_substances row count: 0'],
      citation: 'ICH Q3A(R2) §1 — Impurities in new drug substances.',
    });
    return findings;
  }

  if (totalImpurities === 0) {
    findings.push({
      guideline: 'Q3A(R2)',
      ruleId: 'Q3A_NO_IMPURITY_PROFILE',
      status: 'fail',
      message: 'Drug substance records have no impurity profile data.',
      evidence: inp.drugSubs.map(ds => `Substance: ${ds.substanceName}`),
      citation: 'ICH Q3A(R2) §2 — Identification and qualification thresholds.',
    });
  }

  // Q3B: drug product degradation products controlled in specs.
  const dpSpecsWithDegradants = inp.specs.filter(s => {
    if (String(s.materialType ?? '').toLowerCase() !== 'drug product'
        && String(s.materialType ?? '').toLowerCase() !== 'drug_product') return false;
    const params = s.testParameters;
    const paramText = JSON.stringify(params ?? '').toLowerCase();
    return paramText.includes('degradant') || paramText.includes('related substance') || paramText.includes('impur');
  });
  if (dpSpecsWithDegradants.length === 0 && inp.specs.length > 0) {
    findings.push({
      guideline: 'Q3B(R2)',
      ruleId: 'Q3B_NO_DEGRADANTS_SPEC',
      status: 'warning',
      message: 'No drug product specification controls degradation products / related substances.',
      evidence: ['drug_product specs lacking related-substance test'],
      citation: 'ICH Q3B(R2) §2 — Degradation products in drug products.',
    });
  }

  if (findings.length === 0) {
    findings.push({
      guideline: 'Q3A(R2)',
      ruleId: 'Q3AB_OK',
      status: 'pass',
      message: `Impurity profile present (${totalImpurities} impurities) and DP degradation products controlled.`,
      evidence: [`impurities: ${totalImpurities}`],
      citation: 'ICH Q3A(R2) / Q3B(R2).',
    });
  }

  return findings;
}

function checkQ3D(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

  const elementalSpec = inp.specs.find(s => {
    const txt = JSON.stringify(s.testParameters ?? '').toLowerCase();
    return txt.includes('elemental') || txt.includes('heavy metal');
  });
  const elementalSource = inp.sourceObjects.find(o => {
    const k = String(o.sourceKey ?? '').toLowerCase();
    const t = String(o.sourceType ?? '').toLowerCase();
    return k.includes('elemental') || k.includes('q3d') || t.includes('elemental');
  });

  if (!elementalSpec && !elementalSource) {
    findings.push({
      guideline: 'Q3D(R2)',
      ruleId: 'Q3D_NO_ASSESSMENT',
      status: 'fail',
      message: 'No elemental-impurities assessment (ICH Q3D / USP <232>/<233>) found in specifications or source objects.',
      evidence: ['No spec test parameter matches "elemental"', 'No source object keyed to Q3D'],
      citation: 'ICH Q3D(R2) §3 — Risk assessment for Class 1, 2A, 2B, 3 elemental impurities.',
    });
  } else {
    findings.push({
      guideline: 'Q3D(R2)',
      ruleId: 'Q3D_OK',
      status: 'pass',
      message: 'Elemental impurities assessment present.',
      evidence: [
        elementalSpec ? `Spec: ${elementalSpec.materialName}` : '',
        elementalSource ? `Source: ${elementalSource.sourceKey}` : '',
      ].filter(Boolean),
      citation: 'ICH Q3D(R2) §3.',
    });
  }

  return findings;
}

function checkQ6AandQ6B(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

  if (inp.specs.length === 0) {
    findings.push({
      guideline: 'Q6A',
      ruleId: 'Q6A_NO_SPECS',
      status: 'fail',
      message: 'No quality specifications recorded.',
      evidence: ['quality_specifications row count: 0'],
      citation: 'ICH Q6A §1 — Specifications: Test procedures and acceptance criteria.',
    });
    return findings;
  }

  // Justification present for every spec.
  const unjustified = inp.specs.filter(s => {
    const j = s.justification;
    return j == null || (typeof j === 'string' && j.trim().length < 20);
  });
  if (unjustified.length > 0) {
    findings.push({
      guideline: 'Q6A',
      ruleId: 'Q6A_UNJUSTIFIED',
      status: 'warning',
      message: `${unjustified.length} specification(s) lack a written justification for acceptance criteria.`,
      evidence: unjustified.slice(0, 5).map(s => `${s.materialType}: ${s.materialName}`),
      citation: 'ICH Q6A §3.3 — Justification of specifications.',
    });
  }

  // Q6B for biologics — look for indications in drugSubs characterization.
  const hasBiologicChar = inp.drugSubs.some(ds => {
    const c = ds.characterizationData;
    if (typeof c !== 'object' || c === null) return false;
    const keys = Object.keys(c as object).map(k => k.toLowerCase());
    return keys.some(k => k.includes('peptide') || k.includes('glycan') || k.includes('hos') || k.includes('higher order'));
  });
  if (hasBiologicChar) {
    findings.push({
      guideline: 'Q6B',
      ruleId: 'Q6B_BIOLOGIC_PRESENT',
      status: 'pass',
      message: 'Biotechnological characterization data present (per ICH Q6B applicability).',
      evidence: ['characterization_data keys include biologic attributes'],
      citation: 'ICH Q6B §1 — Specifications for biotechnological/biological products.',
    });
  }

  if (findings.filter(f => f.guideline === 'Q6A').length === 0) {
    findings.push({
      guideline: 'Q6A',
      ruleId: 'Q6A_OK',
      status: 'pass',
      message: `${inp.specs.length} specification(s) recorded with justification.`,
      evidence: [`spec_count: ${inp.specs.length}`],
      citation: 'ICH Q6A.',
    });
  }

  return findings;
}

function checkQ8(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

  // QbD evidence: CPPs present in manufacturing_processes OR a Q8/QbD source object.
  const hasCpps = inp.processes.some(p => {
    const cpp = p.criticalProcessParameters;
    if (Array.isArray(cpp) && cpp.length > 0) return true;
    if (typeof cpp === 'object' && cpp !== null && Object.keys(cpp as object).length > 0) return true;
    return false;
  });

  const hasQbdSource = inp.sourceObjects.some(o => {
    const k = String(o.sourceKey ?? '').toLowerCase();
    const t = String(o.sourceType ?? '').toLowerCase();
    return k.includes('qbd') || k.includes('design_space') || t.includes('control_strategy');
  });

  if (!hasCpps && !hasQbdSource) {
    findings.push({
      guideline: 'Q8(R2)',
      ruleId: 'Q8_NO_QBD_EVIDENCE',
      status: 'warning',
      message: 'No critical process parameters or QbD source objects found. Pharmaceutical development (Q8) evidence is incomplete.',
      evidence: ['manufacturing_processes.criticalProcessParameters empty', 'No qbd/design_space/control_strategy source object'],
      citation: 'ICH Q8(R2) §2.3 — Critical quality attributes and process parameters.',
    });
  } else {
    findings.push({
      guideline: 'Q8(R2)',
      ruleId: 'Q8_OK',
      status: 'pass',
      message: 'Pharmaceutical development (QbD) evidence present via CPPs or design-space source objects.',
      evidence: [
        hasCpps ? 'manufacturing_processes.criticalProcessParameters populated' : '',
        hasQbdSource ? 'QbD source object present' : '',
      ].filter(Boolean),
      citation: 'ICH Q8(R2).',
    });
  }

  return findings;
}

function checkQ9(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

  // Risk assessment evidence: a source object marked risk_assessment, OR a Module 3
  // section with narrative referencing risk.
  const hasRiskSource = inp.sourceObjects.some(o => {
    const k = String(o.sourceKey ?? '').toLowerCase();
    const t = String(o.sourceType ?? '').toLowerCase();
    return k.includes('risk') || t.includes('risk');
  });
  const hasRiskNarrative = inp.sections.some(s => {
    const n = String(s.narrativeText ?? '').toLowerCase();
    return n.includes('risk assessment') || n.includes('fmea') || n.includes('hazop');
  });

  if (!hasRiskSource && !hasRiskNarrative) {
    findings.push({
      guideline: 'Q9',
      ruleId: 'Q9_NO_RISK_ASSESSMENT',
      status: 'warning',
      message: 'No quality risk management evidence (FMEA, HAZOP, or risk_assessment source object).',
      evidence: ['No source object keyed to risk', 'No Module 3 section narrative referencing risk assessment'],
      citation: 'ICH Q9 §4 — Quality risk management process.',
    });
  } else {
    findings.push({
      guideline: 'Q9',
      ruleId: 'Q9_OK',
      status: 'pass',
      message: 'Quality risk management evidence present.',
      evidence: [
        hasRiskSource ? 'risk source object present' : '',
        hasRiskNarrative ? 'Module 3 section narrative references risk assessment' : '',
      ].filter(Boolean),
      citation: 'ICH Q9.',
    });
  }

  return findings;
}

function checkQ10(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

  // Q10 lifecycle evidence: change_control source objects, process validation status,
  // and at least one approved Module 3 section.
  const changeControls = inp.sourceObjects.filter(o => {
    const t = String(o.sourceType ?? '').toLowerCase();
    return t === 'change_control';
  });
  const validatedProcesses = inp.processes.filter(p => {
    const v = String(p.validationStatus ?? '').toLowerCase();
    return v === 'validated' || v === 'completed';
  });
  const approvedSections = inp.sections.filter(s => s.approvalState === 'approved');

  const signals: string[] = [];
  if (changeControls.length > 0) signals.push(`${changeControls.length} change control(s)`);
  if (validatedProcesses.length > 0) signals.push(`${validatedProcesses.length} validated process(es)`);
  if (approvedSections.length > 0) signals.push(`${approvedSections.length} approved Module 3 section(s)`);

  if (signals.length < 2) {
    findings.push({
      guideline: 'Q10',
      ruleId: 'Q10_LIFECYCLE_THIN',
      status: 'warning',
      message: `Pharmaceutical quality system lifecycle evidence is thin (${signals.length}/3 signals present).`,
      evidence: signals.length > 0 ? signals : ['No change controls, validated processes, or approved Module 3 sections.'],
      citation: 'ICH Q10 §3 — Pharmaceutical quality system: management responsibility, lifecycle elements, continual improvement.',
    });
  } else {
    findings.push({
      guideline: 'Q10',
      ruleId: 'Q10_OK',
      status: 'pass',
      message: 'Pharmaceutical quality system lifecycle evidence present.',
      evidence: signals,
      citation: 'ICH Q10.',
    });
  }

  return findings;
}
