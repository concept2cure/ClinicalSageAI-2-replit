/**
 * Value-normalization / alias bridge — flow vocabulary → canonical domain constants.
 *
 * ## Why this module exists
 *
 * The AnA intelligence question flows (server/services/ana/intelligence-questions/flows/*)
 * grew independently and use divergent option-value vocabularies for the same domain
 * concepts. For example, one flow offers a route option `iv` while another offers
 * `intravenous`; one phase flow uses `phase_1b_2a` while the canonical set uses
 * `phase_1_2`; device/regulatory flows reuse `phase` fields to carry non-clinical
 * STAGES such as `nda_bla` or `device_design`.
 *
 * Those raw flow values CANNOT be renamed in place: flow branch predicates
 * (`FieldPredicate.value`, `BranchRule.when`) and every persisted answer key off the
 * exact string. Changing a flow option value would silently break branching logic and
 * invalidate historical answers.
 *
 * Instead, this module maps flow values → canonical domain constants so that cross-flow
 * intelligence (endpoint suggestion, enrollment validation, ICH guideline lookup, etc.)
 * can key off a single canonical vocabulary regardless of which flow produced the answer.
 *
 * Each normalizer:
 *   - accepts a raw flow value,
 *   - returns the canonical union value (identity for values already canonical, or the
 *     mapped canonical value for known aliases),
 *   - returns `null` for values that are intentionally NOT part of that domain
 *     (documented in {@link INTENTIONALLY_UNMAPPED}).
 *
 * The companion completeness test (tests/constants-domain/aliases.test.ts) walks the live
 * flow registry and asserts that EVERY option value for the relevant fields either maps to
 * a real canonical member or is declared in {@link INTENTIONALLY_UNMAPPED}. That makes this
 * alias map provably complete and self-maintaining: a newly-introduced unmapped flow value
 * fails the test.
 *
 * This module is additive and side-effect free. It does not import or modify any flow file.
 *
 * @module shared/constants/domain/aliases
 */

import type { TherapeuticArea } from './therapeutic-areas.js';
import type { ClinicalPhase } from './clinical-phases.js';
import type { RouteOfAdministration } from './routes-of-administration.js';
import type { DosageForm } from './dosage-forms.js';

/* ─── Therapeutic area ─────────────────────────────────────────────────── */

/**
 * Flow therapeutic-area value → canonical {@link TherapeuticArea}.
 * Includes identity entries for values that are already canonical.
 */
const THERAPEUTIC_AREA_ALIASES: Record<string, TherapeuticArea> = {
  // aliases (divergent spellings / groupings)
  cardiovascular: 'cardiology',
  cardiology: 'cardiology',
  cns: 'neurology',
  endocrine: 'endocrinology',
  // identity — already canonical
  oncology: 'oncology',
  hematology: 'hematology',
  immunology: 'immunology',
  infectious_disease: 'infectious_disease',
  neurology: 'neurology',
  ophthalmology: 'ophthalmology',
  rare_disease: 'rare_disease',
  dermatology: 'dermatology',
  metabolic: 'metabolic',
  gastroenterology: 'gastroenterology',
  endocrinology: 'endocrinology',
  respiratory: 'respiratory',
  psychiatry: 'psychiatry',
  vaccines: 'vaccines',
  gene_cell_therapy: 'gene_cell_therapy',
  other: 'other',
};

/**
 * Normalize a flow therapeutic-area value to the canonical {@link TherapeuticArea}.
 * Returns `null` for values that are not therapeutic areas (see {@link INTENTIONALLY_UNMAPPED}).
 */
export function normalizeTherapeuticArea(raw: string): TherapeuticArea | null {
  // unmapped: medical_device is a device project selector, not a therapeutic area.
  return THERAPEUTIC_AREA_ALIASES[raw] ?? null;
}

/* ─── Clinical phase ───────────────────────────────────────────────────── */

/**
 * Flow phase/study_phase/development_phase value → canonical {@link ClinicalPhase}.
 * Includes identity entries for values that are already canonical.
 */
const CLINICAL_PHASE_ALIASES: Record<string, ClinicalPhase> = {
  // aliases (divergent phase groupings)
  phase_1b_2a: 'phase_1_2',
  phase_2b_3: 'phase_2_3',
  phase_3b_4: 'phase_3b',
  discovery: 'preclinical',
  ind_enabling: 'preclinical',
  // identity — already canonical
  preclinical: 'preclinical',
  phase_1: 'phase_1',
  phase_1_2: 'phase_1_2',
  phase_2: 'phase_2',
  phase_2_3: 'phase_2_3',
  phase_3: 'phase_3',
  phase_3b: 'phase_3b',
  phase_4: 'phase_4',
};

/**
 * Normalize a flow phase value to the canonical {@link ClinicalPhase}.
 * Returns `null` for regulatory/device STAGES that are not clinical phases
 * (see {@link INTENTIONALLY_UNMAPPED}).
 */
export function normalizeClinicalPhase(raw: string): ClinicalPhase | null {
  // unmapped: nda_bla / post_approval / device_* are regulatory or device lifecycle
  // stages carried by reused "phase" fields — not clinical development phases.
  return CLINICAL_PHASE_ALIASES[raw] ?? null;
}

/* ─── Route of administration ──────────────────────────────────────────── */

/**
 * Flow route_of_administration value → canonical {@link RouteOfAdministration}.
 * Includes identity entries for values that are already canonical.
 */
const ROUTE_OF_ADMINISTRATION_ALIASES: Record<string, RouteOfAdministration> = {
  // aliases (abbreviations / spelling variants)
  iv: 'intravenous',
  sc: 'subcutaneous',
  im: 'intramuscular',
  inhalation: 'inhaled',
  // identity — already canonical
  oral: 'oral',
  intravenous: 'intravenous',
  subcutaneous: 'subcutaneous',
  intramuscular: 'intramuscular',
  topical: 'topical',
  inhaled: 'inhaled',
  intrathecal: 'intrathecal',
  intravitreal: 'intravitreal',
  ophthalmic: 'ophthalmic',
  intradermal: 'intradermal',
  other: 'other',
};

/**
 * Normalize a flow route value to the canonical {@link RouteOfAdministration}.
 * Returns `null` for values that are not routes (see {@link INTENTIONALLY_UNMAPPED}).
 */
export function normalizeRouteOfAdministration(raw: string): RouteOfAdministration | null {
  // unmapped: implant is a dosage form (misused as a route in project_setup);
  // na_device means not-applicable / device.
  return ROUTE_OF_ADMINISTRATION_ALIASES[raw] ?? null;
}

/* ─── Dosage form ──────────────────────────────────────────────────────── */

/**
 * Flow dosage_form value → canonical {@link DosageForm}.
 * Includes identity entries for values that are already canonical.
 */
const DOSAGE_FORM_ALIASES: Record<string, DosageForm> = {
  // aliases (divergent naming / granularity)
  tablet: 'tablet_ir',
  oral_solution: 'solution_oral',
  powder: 'powder_reconstitution',
  cream_ointment: 'cream',
  patch: 'transdermal_patch',
  transdermal: 'transdermal_patch',
  injection: 'solution_injection',
  injection_iv: 'solution_injection',
  injection_im: 'solution_injection',
  injection_sc: 'solution_injection',
  injectable_solution: 'solution_injection',
  infusion: 'solution_injection',
  inhaler: 'metered_dose_inhaler',
  inhaled: 'metered_dose_inhaler',
  inhalation: 'metered_dose_inhaler',
  suppository: 'suppository',
  // identity — already canonical
  tablet_mr: 'tablet_mr',
  capsule: 'capsule',
  solution_oral: 'solution_oral',
  suspension_oral: 'suspension_oral',
  lyophilized: 'lyophilized',
  prefilled_syringe: 'prefilled_syringe',
  autoinjector: 'autoinjector',
  cream: 'cream',
  implant: 'implant',
  other: 'other',
};

/**
 * Normalize a flow dosage-form value to the canonical {@link DosageForm}.
 * Returns `null` for ambiguous or not-a-finished-form values
 * (see {@link INTENTIONALLY_UNMAPPED}).
 */
export function normalizeDosageForm(raw: string): DosageForm | null {
  // unmapped: solution / suspension are ambiguous (oral vs injectable); ophthalmic and
  // topical are routes rather than forms; bulk_api is a drug substance, not a finished form.
  return DOSAGE_FORM_ALIASES[raw] ?? null;
}

/* ─── Intentionally-unmapped registry ──────────────────────────────────── */

/**
 * Flow values that a normalizer deliberately maps to `null`, with the reason.
 *
 * The completeness test treats membership here as an explicit, reviewed decision:
 * any collected flow value that returns `null` MUST appear in the matching group,
 * otherwise the test fails. This prevents a new unmapped flow value from silently
 * disappearing into `null`.
 */
export const INTENTIONALLY_UNMAPPED = {
  therapeuticArea: { medical_device: 'device project, not a therapeutic area' },
  clinicalPhase: {
    nda_bla: 'regulatory stage',
    // Live registry spelling used by project_setup.development_phase and csr_report.
    nda_bla_filing: 'regulatory stage',
    post_approval: 'lifecycle stage',
    device_design: 'device stage',
    device_post_market: 'device stage',
    device_submission: 'device stage',
  },
  routeOfAdministration: {
    implant: 'dosage form, not a route',
    na_device: 'not applicable / device',
  },
  dosageForm: {
    solution: 'ambiguous oral vs injectable',
    suspension: 'ambiguous',
    ophthalmic: 'route not a form',
    topical: 'route / too generic',
    bulk_api: 'drug substance not a finished form',
  },
} as const;
