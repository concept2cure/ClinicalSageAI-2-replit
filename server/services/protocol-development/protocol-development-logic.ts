/**
 * Protocol Development deterministic logic (Capability C2C-17)
 *
 * Pure, DB-free, LLM-free: the section templates that seed a new protocol document
 * (by kind), the completeness/readiness scoring used to gate finalize, and the
 * version-string bump. Section sets are grounded in ICH M11 / ICH E6(R2) (clinical
 * protocol contents), PHS Policy / AWA 9 CFR 2.31 (IACUC 3Rs), and 45 CFR 46.111
 * (IRB approval criteria) so the authored document maps to what reviewers expect.
 *
 * @module server/services/protocol-development/protocol-development-logic
 */

export type ProtocolKind = 'iacuc' | 'irb' | 'clinical' | 'ibc';
export type SectionStatus = 'not_started' | 'draft' | 'complete';

export interface SectionTemplate { sectionKey: string; title: string; required: boolean; basis: string }

const ICH_M11 = 'ICH M11 / ICH E6(R2) — clinical protocol contents';
const IACUC_BASIS = 'PHS Policy IV.C.1 / AWA 9 CFR 2.31(e) — IACUC protocol contents (3Rs)';
const IRB_BASIS = '45 CFR 46.111 — IRB approval criteria';
const IBC_BASIS = 'NIH Guidelines for Research Involving Recombinant or Synthetic Nucleic Acids';

/** Canonical section templates per protocol kind. The ordering is the authoring order. */
export const SECTION_TEMPLATES: Record<ProtocolKind, SectionTemplate[]> = {
  clinical: [
    { sectionKey: 'synopsis', title: 'Protocol Synopsis', required: true, basis: ICH_M11 },
    { sectionKey: 'background', title: 'Background & Rationale', required: true, basis: ICH_M11 },
    { sectionKey: 'objectives', title: 'Objectives & Endpoints', required: true, basis: ICH_M11 },
    { sectionKey: 'design', title: 'Study Design', required: true, basis: ICH_M11 },
    { sectionKey: 'population', title: 'Study Population & Eligibility', required: true, basis: ICH_M11 },
    { sectionKey: 'intervention', title: 'Treatments / Interventions', required: true, basis: ICH_M11 },
    { sectionKey: 'assessments', title: 'Schedule of Assessments', required: true, basis: ICH_M11 },
    { sectionKey: 'safety', title: 'Safety Reporting & Pharmacovigilance', required: true, basis: ICH_M11 },
    { sectionKey: 'statistics', title: 'Statistical Considerations', required: true, basis: ICH_M11 },
    { sectionKey: 'ethics', title: 'Ethics, Consent & Regulatory', required: true, basis: IRB_BASIS },
    { sectionKey: 'data_management', title: 'Data Management & Quality', required: false, basis: ICH_M11 },
    { sectionKey: 'references', title: 'References', required: false, basis: ICH_M11 },
  ],
  irb: [
    { sectionKey: 'summary', title: 'Research Summary', required: true, basis: IRB_BASIS },
    { sectionKey: 'objectives', title: 'Objectives', required: true, basis: IRB_BASIS },
    { sectionKey: 'procedures', title: 'Study Procedures', required: true, basis: IRB_BASIS },
    { sectionKey: 'population', title: 'Subject Population & Eligibility', required: true, basis: IRB_BASIS },
    { sectionKey: 'recruitment', title: 'Recruitment & Consent Process', required: true, basis: IRB_BASIS },
    { sectionKey: 'risks_benefits', title: 'Risks & Benefits', required: true, basis: IRB_BASIS },
    { sectionKey: 'privacy', title: 'Privacy & Confidentiality', required: true, basis: IRB_BASIS },
    { sectionKey: 'vulnerable', title: 'Vulnerable Populations & Safeguards', required: false, basis: '45 CFR 46 Subparts B/C/D' },
    { sectionKey: 'data_safety', title: 'Data & Safety Monitoring', required: false, basis: IRB_BASIS },
  ],
  iacuc: [
    { sectionKey: 'summary', title: 'Lay Summary & Significance', required: true, basis: IACUC_BASIS },
    { sectionKey: 'objectives', title: 'Aims & Objectives', required: true, basis: IACUC_BASIS },
    { sectionKey: 'replacement', title: '3Rs — Replacement', required: true, basis: IACUC_BASIS },
    { sectionKey: 'reduction', title: '3Rs — Reduction (animal numbers & justification)', required: true, basis: IACUC_BASIS },
    { sectionKey: 'refinement', title: '3Rs — Refinement (analgesia/anesthesia)', required: true, basis: IACUC_BASIS },
    { sectionKey: 'procedures', title: 'Experimental Procedures', required: true, basis: IACUC_BASIS },
    { sectionKey: 'pain_category', title: 'Pain/Distress Category & Justification', required: true, basis: IACUC_BASIS },
    { sectionKey: 'euthanasia', title: 'Euthanasia & Endpoints', required: true, basis: 'AVMA Guidelines for the Euthanasia of Animals' },
    { sectionKey: 'housing', title: 'Housing & Husbandry', required: false, basis: IACUC_BASIS },
  ],
  ibc: [
    { sectionKey: 'summary', title: 'Project Summary', required: true, basis: IBC_BASIS },
    { sectionKey: 'agents', title: 'Biological Agents / Recombinant Material', required: true, basis: IBC_BASIS },
    { sectionKey: 'risk_assessment', title: 'Risk Group & Containment', required: true, basis: IBC_BASIS },
    { sectionKey: 'procedures', title: 'Procedures & Practices', required: true, basis: IBC_BASIS },
    { sectionKey: 'ppe', title: 'PPE & Engineering Controls', required: true, basis: IBC_BASIS },
    { sectionKey: 'waste', title: 'Decontamination & Waste', required: false, basis: IBC_BASIS },
  ],
};

/** The section templates for a kind (empty array for an unknown kind). Pure. */
export function templateFor(kind: ProtocolKind): SectionTemplate[] {
  return SECTION_TEMPLATES[kind] ?? [];
}

// ─── Completeness scoring ────────────────────────────────────────────────────

export interface SectionView { sectionKey: string; title: string; required: boolean; status: SectionStatus }

export interface CompletenessInput {
  sections: SectionView[];
  objectiveCount: number;
  /** Inclusion + exclusion criteria counts (human/clinical protocols). */
  inclusionCount: number;
  exclusionCount: number;
  scheduleVisitCount: number;
  kind: ProtocolKind;
}

export interface CompletenessFinding { severity: 'critical' | 'warning' | 'info'; message: string }

export interface CompletenessResult {
  /** Percent of REQUIRED sections marked complete (0–100). */
  requiredCompletionPct: number;
  requiredTotal: number;
  requiredComplete: number;
  findings: CompletenessFinding[];
  readyToFinalize: boolean;
}

/**
 * Score a protocol's development completeness. `readyToFinalize` requires every
 * required section complete plus at least one objective; clinical/IRB protocols
 * additionally need eligibility criteria, and clinical protocols a schedule of
 * assessments. Pure — the deterministic gate the service enforces on finalize.
 */
export function evaluateCompleteness(input: CompletenessInput): CompletenessResult {
  const required = input.sections.filter((s) => s.required);
  const requiredComplete = required.filter((s) => s.status === 'complete').length;
  const requiredTotal = required.length;
  const requiredCompletionPct = requiredTotal === 0 ? 100 : Math.round((requiredComplete / requiredTotal) * 100);

  const findings: CompletenessFinding[] = [];
  for (const s of required.filter((x) => x.status !== 'complete')) {
    findings.push({ severity: 'critical', message: `Required section "${s.title}" is ${s.status.replace('_', ' ')}.` });
  }
  if (input.objectiveCount === 0) findings.push({ severity: 'critical', message: 'No objectives/endpoints defined.' });

  if (input.kind === 'clinical' || input.kind === 'irb') {
    if (input.inclusionCount === 0) findings.push({ severity: 'critical', message: 'No inclusion criteria defined.' });
    if (input.exclusionCount === 0) findings.push({ severity: 'warning', message: 'No exclusion criteria defined.' });
  }
  if (input.kind === 'clinical' && input.scheduleVisitCount === 0) {
    findings.push({ severity: 'critical', message: 'Schedule of assessments has no visits.' });
  }

  const readyToFinalize = !findings.some((f) => f.severity === 'critical');
  return { requiredCompletionPct, requiredTotal, requiredComplete, findings, readyToFinalize };
}

// ─── Version bump ────────────────────────────────────────────────────────────

/**
 * Bump a protocol version string. `major` advances X (X.Y → (X+1).0) for finalized
 * releases; otherwise the minor Y bumps (X.Y → X.(Y+1)). Non-numeric input falls
 * back to '1.0'. Pure.
 */
export function nextVersion(current: string, major = false): string {
  const m = /^(\d+)\.(\d+)/.exec(current ?? '');
  if (!m) return major ? '1.0' : '0.2';
  const x = Number(m[1]);
  const y = Number(m[2]);
  return major ? `${x + 1}.0` : `${x}.${y + 1}`;
}
