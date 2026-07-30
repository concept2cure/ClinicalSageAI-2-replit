/**
 * industryContext — client-side types + pure display selectors for the
 * effective industry context resolved by the server (CONTEXT-03).
 *
 * The shape mirrors server/services/industry-context/resolver.ts
 * `EffectiveIndustryContext`. It is duplicated here (types only) because
 * the resolver module imports the server db client and cannot be pulled
 * into the browser bundle.
 *
 * Everything in this file is pure — no hooks, no fetch — so the label
 * mapping and row-building logic is unit-testable without React.
 */

export type IndustryVertical = 'mdx' | 'biopharma';

export type ApprovalRigor =
  | 'single_reviewer'
  | 'regulated_dual_review'
  | 'qa_lock'
  | 'signoff_required';

export type ContextSource = 'project' | 'organization' | 'license_default';

export interface EffectiveIndustryContext {
  vertical: IndustryVertical;
  specialization: string | null;
  productType: string | null;
  lifecycleStage: string | null;
  pathways: string[];
  markets: string[];
  filingTypes: string[];
  licensedModules: string[];
  terminology: Record<string, string>;
  approvalRigor: ApprovalRigor;
  /** Which layer supplied the effective vertical/specialization. */
  source: ContextSource;
}

const VERTICAL_LABELS: Record<IndustryVertical, string> = {
  mdx: 'Medical device & diagnostics',
  biopharma: 'Biopharma',
};

const SPECIALIZATION_LABELS: Record<string, string> = {
  medical_device: 'Medical device',
  ivd_diagnostics: 'IVD diagnostics',
  both: 'Device + IVD',
  samd: 'SaMD',
  companion_diagnostic: 'Companion diagnostic',
  combination_product: 'Combination product',
};

const RIGOR_LABELS: Record<ApprovalRigor, string> = {
  single_reviewer: 'Single reviewer',
  regulated_dual_review: 'Regulated dual review',
  qa_lock: 'QA lock',
  signoff_required: 'Sign-off required',
};

const SOURCE_LABELS: Record<ContextSource, string> = {
  project: 'Project profile',
  organization: 'Organization profile',
  license_default: 'License default',
};

/**
 * Human form of a snake_case token: underscores → spaces, first letter
 * capitalized, everything else untouched (so acronyms and mixed tokens
 * like "510k" or "EU_MDR" don't get mangled beyond the underscore swap).
 */
export function humanizeToken(token: string): string {
  const spaced = token.replace(/_/g, ' ').trim();
  if (spaced.length === 0) return spaced;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Label for a specialization value; unknown values humanize rather than vanish. */
export function specializationLabel(value: string | null): string | null {
  if (value === null || value === '') return null;
  return SPECIALIZATION_LABELS[value] ?? humanizeToken(value);
}

export function sourceLabel(source: ContextSource): string {
  return SOURCE_LABELS[source];
}

export interface ContextSummaryRow {
  label: string;
  value: string;
}

/**
 * The compact key/value rows the "Program context" card renders, in
 * display order. A missing specialization renders an explicit "Not set"
 * rather than being dropped — the absence is itself information (the
 * tenant hasn't tailored this program yet).
 */
export function contextSummaryRows(ctx: EffectiveIndustryContext): ContextSummaryRow[] {
  return [
    { label: 'Vertical', value: VERTICAL_LABELS[ctx.vertical] ?? humanizeToken(ctx.vertical) },
    { label: 'Specialization', value: specializationLabel(ctx.specialization) ?? 'Not set' },
    {
      label: 'Approval rigor',
      value: RIGOR_LABELS[ctx.approvalRigor] ?? humanizeToken(ctx.approvalRigor),
    },
    { label: 'Source', value: SOURCE_LABELS[ctx.source] ?? humanizeToken(ctx.source) },
  ];
}
