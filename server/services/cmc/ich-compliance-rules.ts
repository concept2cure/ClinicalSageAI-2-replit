/**
 * Pure rule logic for the ICH compliance checker. Lives outside the
 * DB-bound entry point so per-rule unit tests can run without a database.
 *
 * Every rule function takes a `ProjectInputs` fixture and returns
 * `IchCheckFinding[]` with the guideline citation, rule ID, status, and
 * evidence array.
 *
 * Covers: Q1A(R2), Q2(R1), Q3A(R2)/Q3B(R2), Q3D(R2), Q6A/Q6B, Q8(R2),
 * Q9, Q10.
 *
 * @module server/services/cmc/ich-compliance-rules
 */

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

/**
 * Outcome of a single rule.
 *
 * `not_evaluated` is distinct from every other value on purpose. It means the
 * rule could not run because an input it depends on could not be read. It is
 * NOT `pass` (we did not verify compliance), NOT `fail` (we did not observe a
 * deficiency), and NOT `not_applicable` (the guideline does apply — we simply
 * could not check it). A regulated compliance report that renders "could not
 * check" as any of the other three is making a claim it cannot support.
 */
export type CheckStatus = 'pass' | 'warning' | 'fail' | 'not_applicable' | 'not_evaluated';

export interface IchCheckFinding {
  guideline: IchGuideline;
  ruleId: string;
  status: CheckStatus;
  message: string;
  evidence: string[];
  /** Citation / section of the underlying guideline. */
  citation: string;
}

/** The named inputs a rule may depend on. */
export type ProjectInputKey =
  | 'specs' | 'methods' | 'stability' | 'drugSubs'
  | 'processes' | 'sourceObjects' | 'sections';

export interface ProjectInputs {
  specs: Array<Record<string, unknown>>;
  methods: Array<Record<string, unknown>>;
  stability: Array<Record<string, unknown>>;
  drugSubs: Array<Record<string, unknown>>;
  processes: Array<Record<string, unknown>>;
  sourceObjects: Array<Record<string, unknown>>;
  sections: Array<Record<string, unknown>>;
  /**
   * Inputs that could NOT be read, mapped to the reason.
   *
   * An input named here has an empty array above, but that empty array means
   * "unknown", not "none". Rules MUST consult this before asserting absence:
   * "no stability studies recorded" and "the stability read failed" are
   * different facts and only one of them is evidence.
   *
   * Omitted / empty means every input was read successfully.
   */
  unavailable?: Partial<Record<ProjectInputKey, string>>;
}

// ─── Not-evaluated helpers ───────────────────────────────────────────────────

/** Collect the reasons any of `keys` could not be read. */
export function blockedInputs(
  inp: ProjectInputs,
  keys: ProjectInputKey[],
): Array<{ key: ProjectInputKey; reason: string }> {
  const blocked: Array<{ key: ProjectInputKey; reason: string }> = [];
  for (const key of keys) {
    const reason = inp.unavailable?.[key];
    if (reason) blocked.push({ key, reason });
  }
  return blocked;
}

/**
 * Build the finding emitted when a rule cannot run. The message leads with
 * "Cannot evaluate" and states the reason, so it can never be skimmed as a
 * clean result.
 */
export function notEvaluatedFinding(
  guideline: IchGuideline,
  ruleId: string,
  blocked: Array<{ key: ProjectInputKey; reason: string }>,
  citation: string,
): IchCheckFinding {
  const detail = blocked.map(b => `${b.key} (${b.reason})`).join('; ');
  return {
    guideline,
    ruleId,
    status: 'not_evaluated',
    message:
      `Cannot evaluate ${guideline}: required input could not be read — ${detail}. `
      + 'This is not a pass and not a finding of non-compliance; the check did not run.',
    evidence: blocked.map(b => `input "${b.key}" unavailable: ${b.reason}`),
    citation,
  };
}

// ─── Q1A(R2) — Stability ─────────────────────────────────────────────────────

export function checkQ1A(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

  // The stability read may have failed outright. An empty `stability` array in
  // that case means "unknown", so none of the absence-based rules below are
  // sound. Report that we could not evaluate rather than inventing a row count.
  const blocked = blockedInputs(inp, ['stability']);
  if (blocked.length > 0) {
    return [notEvaluatedFinding(
      'Q1A(R2)',
      'Q1A_NOT_EVALUATED',
      blocked,
      'ICH Q1A(R2) §1 — Stability data required for registration applications.',
    )];
  }

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

// ─── Q2(R1) — Analytical method validation ───────────────────────────────────

export function checkQ2(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

  const blocked = blockedInputs(inp, ['methods']);
  if (blocked.length > 0) {
    return [notEvaluatedFinding(
      'Q2(R1)',
      'Q2_NOT_EVALUATED',
      blocked,
      'ICH Q2(R1) §1 — Validation of analytical procedures.',
    )];
  }

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

  for (const m of inp.methods) {
    const purpose = String(m.purpose ?? '').toLowerCase();
    if (purpose.includes('identity')) continue;

    const missing: string[] = [];
    if (m.specificityData == null) missing.push('specificity');
    if (m.linearityData == null && (purpose.includes('assay') || purpose.includes('quant') || purpose.includes('impur'))) missing.push('linearity');
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

// ─── Q3A(R2) / Q3B(R2) — Impurities ──────────────────────────────────────────

export function checkQ3AandQ3B(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

  const blockedDrugSubs = blockedInputs(inp, ['drugSubs']);
  if (blockedDrugSubs.length > 0) {
    return [notEvaluatedFinding(
      'Q3A(R2)',
      'Q3A_NOT_EVALUATED',
      blockedDrugSubs,
      'ICH Q3A(R2) §1 — Impurities in new drug substances.',
    )];
  }

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

  // The Q3B sub-check reasons over specifications. If the spec read failed we
  // cannot conclude anything about degradant control either way.
  const blockedSpecs = blockedInputs(inp, ['specs']);
  if (blockedSpecs.length > 0) {
    findings.push(notEvaluatedFinding(
      'Q3B(R2)',
      'Q3B_NOT_EVALUATED',
      blockedSpecs,
      'ICH Q3B(R2) §2 — Degradation products in drug products.',
    ));
  } else {
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

// ─── Q3D(R2) — Elemental impurities ──────────────────────────────────────────

export function checkQ3D(inp: ProjectInputs): IchCheckFinding[] {
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

  // Q3D concludes from ABSENCE across two inputs. Finding evidence is sound
  // even if the other input failed, but concluding "no assessment exists"
  // requires that both reads actually happened.
  const blockedQ3D = blockedInputs(inp, ['specs', 'sourceObjects']);
  if (!elementalSpec && !elementalSource && blockedQ3D.length > 0) {
    return [notEvaluatedFinding(
      'Q3D(R2)',
      'Q3D_NOT_EVALUATED',
      blockedQ3D,
      'ICH Q3D(R2) §3 — Risk assessment for Class 1, 2A, 2B, 3 elemental impurities.',
    )];
  }

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

// ─── Q6A / Q6B — Specifications ──────────────────────────────────────────────

export function checkQ6AandQ6B(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

  const blocked = blockedInputs(inp, ['specs']);
  if (blocked.length > 0) {
    return [notEvaluatedFinding(
      'Q6A',
      'Q6A_NOT_EVALUATED',
      blocked,
      'ICH Q6A §1 — Specifications: Test procedures and acceptance criteria.',
    )];
  }

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

// ─── Q8(R2) — Pharmaceutical development ─────────────────────────────────────

export function checkQ8(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

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

  // Positive evidence is sound regardless of a partial outage; concluding its
  // absence is not.
  const blockedQ8 = blockedInputs(inp, ['processes', 'sourceObjects']);
  if (!hasCpps && !hasQbdSource && blockedQ8.length > 0) {
    return [notEvaluatedFinding(
      'Q8(R2)',
      'Q8_NOT_EVALUATED',
      blockedQ8,
      'ICH Q8(R2) §2.3 — Critical quality attributes and process parameters.',
    )];
  }

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

// ─── Q9 — Quality risk management ────────────────────────────────────────────

export function checkQ9(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

  const hasRiskSource = inp.sourceObjects.some(o => {
    const k = String(o.sourceKey ?? '').toLowerCase();
    const t = String(o.sourceType ?? '').toLowerCase();
    return k.includes('risk') || t.includes('risk');
  });
  const hasRiskNarrative = inp.sections.some(s => {
    const n = String(s.narrativeText ?? '').toLowerCase();
    return n.includes('risk assessment') || n.includes('fmea') || n.includes('hazop');
  });

  const blockedQ9 = blockedInputs(inp, ['sourceObjects', 'sections']);
  if (!hasRiskSource && !hasRiskNarrative && blockedQ9.length > 0) {
    return [notEvaluatedFinding(
      'Q9',
      'Q9_NOT_EVALUATED',
      blockedQ9,
      'ICH Q9 §4 — Quality risk management process.',
    )];
  }

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

// ─── Q10 — Pharmaceutical quality system lifecycle ───────────────────────────

export function checkQ10(inp: ProjectInputs): IchCheckFinding[] {
  const findings: IchCheckFinding[] = [];

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

  // "Thin lifecycle evidence" is a count of signals across three inputs. If any
  // of them could not be read the count is not a measurement.
  const blockedQ10 = blockedInputs(inp, ['sourceObjects', 'processes', 'sections']);
  if (signals.length < 2 && blockedQ10.length > 0) {
    return [notEvaluatedFinding(
      'Q10',
      'Q10_NOT_EVALUATED',
      blockedQ10,
      'ICH Q10 §3 — Pharmaceutical quality system: management responsibility, lifecycle elements, continual improvement.',
    )];
  }

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
