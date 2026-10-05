/**
 * ICH Q2(R2): analytical procedure validation, judged at the program's stage.
 *
 * ── The two defects this replaces (discovery map 2026-10-04,
 *    cmc-engines-phase-agnostic-stale-ich) ────────────────────────────────────
 * 1. The rule cited ICH Q2(R1). Q2(R2) and Q14 replaced it at Step 4 on
 *    2023-11-01, and FDA issued both as final guidance in March 2024. A
 *    compliance report citing the superseded revision is a finding against
 *    the report.
 * 2. It failed every method without "validated" status, at any stage. A
 *    first-in-human IND whose methods are shown suitable but not yet fully
 *    validated is compliant: FDA does not expect validation data for an
 *    original phase 1 IND, and the EU asks at phase 1 that methods be
 *    confirmed suitable with their validation parameters tabulated. The rule
 *    put a FAIL on exactly that dossier.
 *
 * The expectation now comes from the program's stage (ProgramStage: what it
 * files and the clinical phase its study designs record), and every citation
 * is the CMC regulatory record's own (services/cmc/knowledge), so the report
 * cites what the record says is current. A program whose stage is not
 * recorded is told so in the finding, never silently judged at the wrong
 * stage.
 *
 * @module server/services/cmc/ich-compliance-q2
 */
import { citeSource, getCmcSource } from './knowledge';
import {
  blockedInputs,
  notEvaluatedFinding,
  type CheckStatus,
  type IchCheckFinding,
  type ProgramStage,
  type ProjectInputs,
} from './ich-compliance-rules';

/** A record source as a citation; its id when the record does not hold it (the currency test then fails). */
export function cite(...ids: string[]): string {
  return ids.map((id) => {
    const s = getCmcSource(id);
    return s ? citeSource(s) : id;
  }).join('; ');
}

const VALIDATED = new Set(['validated', 'verified', 'transferred']);
/** Statuses that show a procedure is suitable for its use without full validation. */
const SUITABLE = new Set(['qualified', 'suitable', 'suitability confirmed', 'phase-appropriate', 'phase appropriate', 'fit for purpose']);

interface Expectation {
  /** What a method must show at this stage. */
  level: 'suitability' | 'validation';
  /** What falling short of it is. */
  shortfall: Extract<CheckStatus, 'warning' | 'fail'>;
  why: string;
  citation: string;
}

/** What the program's stage expects of its analytical procedures. */
export function q2Expectation(stage: ProgramStage | null | undefined): Expectation {
  if (!stage) {
    return {
      level: 'validation',
      shortfall: 'fail',
      why: 'The program records no application type, so the marketing-application standard is applied.',
      citation: cite('ich-q2-r2'),
    };
  }
  if (stage.application === 'marketing') {
    return {
      level: 'validation',
      shortfall: 'fail',
      why: 'A marketing application validates the procedures used for release and stability testing.',
      citation: cite('ich-q2-r2', 'ich-q14'),
    };
  }
  if (stage.phase === 1) {
    return {
      level: 'suitability',
      shortfall: 'warning',
      why:
        'At phase 1 a procedure must be shown suitable for its use. Validation data are not expected for an ' +
        'original first-in-human IND (FDA); the EU asks that suitability be confirmed and the validation ' +
        'parameters and acceptance limits be tabulated.',
      citation: cite('fda-fih-ph1-cmc-small-molecule-2026', 'ema-qwp-545525-2017-rev2'),
    };
  }
  if (stage.phase === 2 || stage.phase === 3) {
    return {
      level: 'validation',
      shortfall: 'warning',
      why:
        `At phase ${stage.phase} a summary of validation results is expected, built up to full Q2(R2) validation ` +
        'before the marketing application.',
      citation: cite('ema-qwp-545525-2017-rev2', 'ich-q2-r2'),
    };
  }
  return {
    level: 'validation',
    shortfall: 'warning',
    why:
      'The program records no clinical phase, so the phase-appropriate expectation cannot be applied: phase 1 ' +
      'needs suitable procedures, phase 3 and the marketing application need Q2(R2) validation. Record the phase ' +
      'in the program’s study design.',
    citation: cite('fda-fih-ph1-cmc-small-molecule-2026', 'ema-qwp-545525-2017-rev2', 'ich-q2-r2'),
  };
}

type Method = ProjectInputs['methods'][number];
const statusOf = (m: Method) => String(m.validationStatus ?? '').trim().toLowerCase();

/** The characteristics Q2(R2) asks of a quantitative procedure that its record carries no data for. */
function missingCharacteristics(m: Method): string[] {
  const purpose = String(m.purpose ?? '').toLowerCase();
  const quantitative = purpose.includes('assay') || purpose.includes('quant') || purpose.includes('impur');
  const missing: string[] = [];
  if (m.specificityData == null) missing.push('specificity');
  if (m.linearityData == null && quantitative) missing.push('linearity / range');
  if (m.accuracyData == null && (purpose.includes('assay') || purpose.includes('impur'))) missing.push('accuracy');
  if (m.precisionData == null) missing.push('precision');
  return missing;
}

function shortfallFindings(inp: ProjectInputs, exp: Expectation, basis: string[]): IchCheckFinding[] {
  const recorded = inp.methods.filter((m) => statusOf(m) !== '');
  const suitableOnly = recorded.filter((m) => SUITABLE.has(statusOf(m)));
  const neither = recorded.filter((m) => !VALIDATED.has(statusOf(m)) && !SUITABLE.has(statusOf(m)));
  const out: IchCheckFinding[] = [];
  if (exp.level === 'validation' && suitableOnly.length > 0) {
    out.push({
      guideline: 'Q2(R2)',
      ruleId: 'Q2_SUITABLE_NOT_VALIDATED',
      status: exp.shortfall,
      message: `${suitableOnly.length} method(s) are shown suitable but not validated. ${exp.why}`,
      evidence: [...suitableOnly.slice(0, 5).map((m) => `${m.methodName}: ${m.validationStatus}`), ...basis],
      citation: exp.citation,
    });
  }
  if (neither.length > 0) {
    out.push({
      guideline: 'Q2(R2)',
      ruleId: 'Q2_UNVALIDATED_METHODS',
      status: exp.shortfall,
      message:
        `${neither.length} method(s) are neither validated nor shown suitable. ${exp.why}`,
      evidence: [...neither.slice(0, 5).map((m) => `${m.methodName}: ${m.validationStatus ?? 'unknown'}`), ...basis],
      citation: exp.citation,
    });
  }
  return out;
}

export function checkQ2(inp: ProjectInputs): IchCheckFinding[] {
  const blocked = blockedInputs(inp, ['methods', 'stage']);
  if (blocked.length > 0) {
    return [notEvaluatedFinding('Q2(R2)', 'Q2_NOT_EVALUATED', blocked, cite('ich-q2-r2'))];
  }
  const exp = q2Expectation(inp.stage);
  const basis = inp.stage ? [`stage: ${inp.stage.basis}`] : ['stage: no application type recorded'];

  if (inp.methods.length === 0) {
    return [{
      guideline: 'Q2(R2)',
      ruleId: 'Q2_NO_METHODS',
      status: 'fail',
      message: 'No analytical methods recorded for the project.',
      evidence: ['analytical_methods row count: 0', ...basis],
      citation: inp.stage?.application === 'clinical_trial' ? cite('fda-21cfr-312-23', 'ema-qwp-545525-2017-rev2') : cite('ich-q2-r2'),
    }];
  }

  const findings = shortfallFindings(inp, exp, basis);

  /* A method whose validation status was never RECORDED has not been shown to
     fail validation. Reporting it as unvalidated is a finding against the
     project for a fact nobody entered — the same class of defect as rendering
     a failed read as an empty result. */
  const withoutStatus = inp.methods.filter((m) => statusOf(m) === '');
  if (withoutStatus.length > 0) {
    findings.push({
      guideline: 'Q2(R2)',
      ruleId: 'Q2_VALIDATION_STATUS_NOT_RECORDED',
      status: 'not_evaluated',
      message: `${withoutStatus.length} method(s) record no validation status, so their validation could not be evaluated.`,
      evidence: withoutStatus.slice(0, 5).map((m) => `${m.methodName}: no validation status recorded`),
      citation: exp.citation,
    });
  }

  // The characteristics a validation must cover; not asked of a phase 1
  // procedure, which is shown suitable rather than validated.
  if (exp.level === 'validation') {
    for (const m of inp.methods) {
      if (String(m.purpose ?? '').toLowerCase().includes('identity')) continue;
      const missing = missingCharacteristics(m);
      if (missing.length === 0) continue;
      findings.push({
        guideline: 'Q2(R2)',
        ruleId: 'Q2_INCOMPLETE_VALIDATION',
        status: 'warning',
        message: `Method "${m.methodName}" is missing validation evidence: ${missing.join(', ')}.`,
        evidence: [`Method type: ${m.methodType}`, `Purpose: ${m.purpose}`],
        citation: cite('ich-q2-r2'),
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      guideline: 'Q2(R2)',
      ruleId: 'Q2_OK',
      status: 'pass',
      message:
        exp.level === 'suitability'
          ? `${inp.methods.length} analytical method(s) validated or shown suitable, as phase 1 expects.`
          : `${inp.methods.length} analytical method(s) validated with complete Q2(R2) evidence.`,
      evidence: [`method_count: ${inp.methods.length}`, ...basis],
      citation: exp.citation,
    });
  }
  return findings;
}
