/**
 * The design-statistics calculators, as data.
 *
 * ── Why a registry and not fourteen forms ────────────────────────────────────
 * `server/routes/biostat-design-stats.ts` mounts fifteen deterministic
 * statistical engines under `/api/biostat`, and until now the workbench reached
 * exactly one of them (assurance). The other fourteen were running, tested and
 * unreachable from the product.
 *
 * Hand-writing fourteen more bespoke forms would have been ~1,500 lines of
 * near-duplicate JSX, and adding the sixteenth engine would cost another
 * hundred. Instead each calculator is declared here — endpoint, fields, and how
 * to shape the request — and one generic renderer in `BiostatWorkbench.tsx`
 * draws them all. Adding a calculator is a data change.
 *
 * ── The field names are not invented ─────────────────────────────────────────
 * Every `key` below matches what the route handler actually reads from
 * `req.body`, taken from the handler source rather than from its docstring.
 * Dotted keys (`prior.alpha`, `treatment.times`) build nested objects, which is
 * how those handlers expect them. A field the server ignores is worse than a
 * missing one: it silently implies the number had an effect.
 *
 * ── What is deliberately NOT here ────────────────────────────────────────────
 * `/region-rules/*` is a design-rule catalogue rather than a calculator (it
 * takes a structured design object and returns rule verdicts), so it does not
 * fit the numeric-form shape and is left to its own surface. Nothing else under
 * `/api/biostat` is omitted.
 */

export type FieldKind =
  | 'number'
  | 'int'
  | 'select'
  | 'numlist'
  | 'text'
  /** One record per line; the calculator's `parseRows` turns them into objects. */
  | 'rows';

export interface CalculatorField {
  /** Request body key. Dotted paths build nested objects: `prior.alpha`. */
  key: string;
  label: string;
  kind: FieldKind;
  /** Omitted from the request when left blank. Required fields block submission. */
  optional?: boolean;
  placeholder?: string;
  /** Shown under the input — units, ranges, and what the number means. */
  hint?: string;
  options?: Array<{ value: string; label: string }>;
  /** Only render this field when another field currently holds one of these values. */
  showWhen?: { key: string; equals: string[] };
}

export interface Calculator {
  id: string;
  title: string;
  /** One line on what question this answers for a study team. */
  subtitle: string;
  /** Path under /api/biostat. */
  path: string;
  method?: 'POST' | 'GET';
  /** Longer framing shown above the form: what it computes and what it assumes. */
  about: string;
  fields: CalculatorField[];
  /**
   * Extra body keys that are constant for this calculator (e.g. a mode
   * discriminator the server switches on).
   */
  fixedBody?: Record<string, unknown>;
  /** Turn a `rows` field's parsed number lists into the shape the server wants. */
  parseRows?: Record<string, (rows: number[][]) => unknown>;
}

const SPENDING = [
  { value: 'obrien-fleming', label: "O'Brien–Fleming" },
  { value: 'pocock', label: 'Pocock' },
  { value: 'linear', label: 'Linear (Pocock-like)' },
];

const PROCEDURES = [
  { value: 'bonferroni', label: 'Bonferroni' },
  { value: 'holm', label: 'Holm (step-down)' },
  { value: 'hochberg', label: 'Hochberg (step-up)' },
  { value: 'fixed-sequence', label: 'Fixed sequence' },
  { value: 'weighted-bonferroni', label: 'Weighted Bonferroni' },
];

export const CALCULATORS: Calculator[] = [
  {
    id: 'assurance',
    title: 'Assurance (Bayesian power)',
    subtitle: 'Unconditional probability of success for two-sample means',
    path: '/assurance',
    about:
      'Averages frequentist power over a normal prior on the treatment effect, so the answer is the probability the trial succeeds rather than the probability it succeeds IF the assumed effect is exactly right. Assurance is always at or below power at the prior mean — power is concave around the design point, so spreading prior mass costs more on the low side than it gains on the high side.',
    fields: [
      { key: 'priorMean', label: 'Prior mean effect (δ)', kind: 'number', placeholder: '0.4', hint: 'Standardized effect size the prior is centred on.' },
      { key: 'priorSd', label: 'Prior SD', kind: 'number', placeholder: '0.15', hint: 'Uncertainty about δ. Larger ⇒ lower assurance.' },
      { key: 'nPerArm', label: 'n per arm', kind: 'int', placeholder: '120' },
      { key: 'alpha', label: 'Alpha', kind: 'number', optional: true, placeholder: '0.025', hint: 'Default 0.025.' },
    ],
  },
  {
    id: 'group-sequential',
    title: 'Group-sequential operating characteristics',
    subtitle: 'Exact OC by numerical integration — no Monte Carlo',
    path: '/adaptive/oc-exact',
    about:
      'Solves the efficacy boundaries from the alpha-spending function and computes the exact operating characteristics by recursive numerical integration over the information grid. Type I error lands on the target alpha to numerical precision; the OC table gives rejection probability and expected information at each drift.',
    fields: [
      { key: 'informationFractions', label: 'Information fractions', kind: 'numlist', placeholder: '0.5, 1', hint: 'Strictly increasing, last must be 1. e.g. "0.33, 0.67, 1" for two interims.' },
      { key: 'spendingFunction', label: 'Spending function', kind: 'select', options: SPENDING, hint: "O'Brien–Fleming spends little early; Pocock spends evenly." },
      { key: 'alpha', label: 'Alpha (one-sided)', kind: 'number', optional: true, placeholder: '0.025', hint: 'Default 0.025.' },
      { key: 'driftGrid', label: 'Drift grid', kind: 'numlist', optional: true, placeholder: '0, 1, 2, 3, 4', hint: 'Standardized drift values to evaluate. Default 0–4.' },
    ],
  },
  {
    id: 'multiplicity',
    title: 'Multiplicity adjustment',
    subtitle: 'Family-wise error control across multiple endpoints',
    path: '/multiplicity/test',
    about:
      'Applies the chosen procedure to a family of p-values and reports which hypotheses are rejected at the family-wise level. Holm is step-down and Hochberg is step-up — Hochberg is more powerful but requires positive dependence, so the choice is a protocol commitment, not a post-hoc one.',
    fields: [
      { key: 'pValues', label: 'p-values', kind: 'numlist', placeholder: '0.001, 0.013, 0.04', hint: 'One per hypothesis, in the order they appear in the testing strategy.' },
      { key: 'alpha', label: 'Family-wise alpha', kind: 'number', placeholder: '0.05' },
      { key: 'procedure', label: 'Procedure', kind: 'select', options: PROCEDURES },
      { key: 'weights', label: 'Weights', kind: 'numlist', optional: true, placeholder: '0.5, 0.3, 0.2', hint: 'Weighted Bonferroni only. Must sum to 1 and match the p-value count.' },
    ],
  },
  {
    id: 'mmrm',
    title: 'MMRM sample size',
    subtitle: 'Repeated measures with dropout',
    path: '/mmrm/sample-size',
    about:
      'Sizes a mixed model for repeated measures under the chosen within-subject covariance. With one visit and ρ = 0 it collapses exactly to the classic two-sample formula, which is the check that the covariance machinery is inert when there is nothing to borrow. Retention below 1 lets MMRM use partial data from subjects who drop out.',
    fields: [
      { key: 'visits', label: 'Post-baseline visits', kind: 'int', placeholder: '4' },
      {
        key: 'covariance', label: 'Covariance structure', kind: 'select',
        options: [
          { value: 'compound_symmetry', label: 'Compound symmetry' },
          { value: 'ar1', label: 'AR(1)' },
        ],
        hint: 'CS assumes equal correlation between all visits; AR(1) decays with separation.',
      },
      { key: 'rho', label: 'Correlation (ρ)', kind: 'number', placeholder: '0.5', hint: 'Within-subject correlation, in [0, 1).' },
      { key: 'sigma', label: 'SD (σ)', kind: 'number', placeholder: '1' },
      { key: 'delta', label: 'Treatment difference (δ)', kind: 'number', placeholder: '0.5' },
      { key: 'alpha', label: 'Alpha (two-sided)', kind: 'number', optional: true, placeholder: '0.05' },
      { key: 'power', label: 'Target power', kind: 'number', optional: true, placeholder: '0.9' },
      { key: 'retention', label: 'Retention by visit', kind: 'numlist', optional: true, placeholder: '1, 0.95, 0.9, 0.85', hint: 'Proportion still on study at each visit. One entry per visit.' },
      { key: 'targetVisit', label: 'Target visit', kind: 'int', optional: true, placeholder: '4', hint: 'The visit the treatment comparison is made at. Defaults to the last.' },
    ],
  },
  {
    id: 'event-projection',
    title: 'Event projection',
    subtitle: 'When will an event-driven trial reach its analyses?',
    path: '/adaptive/event-projection',
    about:
      'Projects accrued events over calendar time under uniform accrual and exponential time-to-event, and inverts it to the calendar date at which the target event count is reached. This sets the interim and final analysis dates — get it wrong and the DSMB meets before the events exist.',
    fields: [
      { key: 'accrualRate', label: 'Accrual rate', kind: 'number', placeholder: '10', hint: 'Subjects per unit time.' },
      { key: 'accrualPeriod', label: 'Accrual period', kind: 'number', placeholder: '10', hint: 'Same time unit. Rate × period = total N.' },
      { key: 'medianControl', label: 'Control median', kind: 'number', placeholder: '10', hint: 'Median time-to-event in the control arm.' },
      { key: 'hazardRatio', label: 'Hazard ratio', kind: 'number', placeholder: '0.7' },
      { key: 'targetEvents', label: 'Target events', kind: 'int', placeholder: '250' },
      { key: 'dropoutHazard', label: 'Dropout hazard', kind: 'number', optional: true, placeholder: '0.05', hint: 'Competing loss-to-follow-up rate. Strictly reduces events at every horizon.' },
      { key: 'atTime', label: 'Also evaluate at time', kind: 'number', optional: true, placeholder: '24', hint: 'Returns the expected events accrued by this calendar time.' },
    ],
  },
  {
    id: 'rmst',
    title: 'Restricted mean survival time',
    subtitle: 'A survival contrast that does not assume proportional hazards',
    path: '/survival/rmst',
    about:
      'Area under the Kaplan–Meier curve up to the restriction time τ, and the between-arm difference with its confidence interval. RMST is interpretable as months of life gained and stays valid when hazards cross — which is exactly where a hazard ratio stops meaning anything.',
    fields: [
      { key: 'tau', label: 'Restriction time (τ)', kind: 'number', placeholder: '24', hint: 'Must not exceed the follow-up of either arm, or the tail is extrapolated.' },
      { key: 'treatment.times', label: 'Treatment — times', kind: 'numlist', placeholder: '4, 9, 12, 18, 24' },
      { key: 'treatment.events', label: 'Treatment — event flags', kind: 'numlist', placeholder: '1, 1, 0, 1, 0', hint: '1 = event, 0 = censored. Same length and order as the times.' },
      { key: 'control.times', label: 'Control — times', kind: 'numlist', optional: true, placeholder: '3, 6, 8, 15, 20' },
      { key: 'control.events', label: 'Control — event flags', kind: 'numlist', optional: true, placeholder: '1, 1, 1, 0, 1', hint: 'Supply a control arm to get the difference and its CI; omit for a single-arm RMST.' },
      { key: 'confLevel', label: 'Confidence level', kind: 'number', optional: true, placeholder: '0.95' },
    ],
  },
  {
    id: 'boin',
    title: 'BOIN dose finding',
    subtitle: 'Escalation boundaries and the MTD decision table',
    path: '/dose-finding/boin',
    about:
      'Bayesian optimal interval design (Liu & Yuan). Returns the escalate/stay/de-escalate boundaries λE and λD for the target DLT rate, and the full decision table over the planned cohort sizes — the table that goes in the protocol so the escalation rule is fixed before the first patient.',
    fields: [
      { key: 'target', label: 'Target DLT rate', kind: 'number', placeholder: '0.3', hint: 'Typically 0.25–0.33.' },
      { key: 'cohortSizes', label: 'Cumulative cohort sizes', kind: 'numlist', optional: true, placeholder: '3, 6, 9, 12', hint: 'Produces the decision table at each of these enrolled counts.' },
      { key: 'phi1', label: 'φ₁ (under-dosing)', kind: 'number', optional: true, placeholder: '0.18', hint: 'Default 0.6 × target.' },
      { key: 'phi2', label: 'φ₂ (over-dosing)', kind: 'number', optional: true, placeholder: '0.42', hint: 'Default 1.4 × target.' },
    ],
  },
  {
    id: 'boin-decision',
    title: 'BOIN — decision at a dose',
    subtitle: 'Escalate, stay or de-escalate given what has been observed',
    path: '/dose-finding/boin',
    fixedBody: { mode: 'decision' },
    about:
      'The in-trial call: given the number of patients treated at the current dose and how many had a DLT, returns the BOIN decision and whether the dose should be eliminated for toxicity.',
    fields: [
      { key: 'target', label: 'Target DLT rate', kind: 'number', placeholder: '0.3' },
      { key: 'nPatients', label: 'Patients at this dose', kind: 'int', placeholder: '6' },
      { key: 'nDlt', label: 'DLTs observed', kind: 'int', placeholder: '1' },
      { key: 'phi1', label: 'φ₁', kind: 'number', optional: true, placeholder: '0.18' },
      { key: 'phi2', label: 'φ₂', kind: 'number', optional: true, placeholder: '0.42' },
    ],
  },
  {
    id: 'diagnostic-sizing',
    title: 'Diagnostic study sizing — single measure',
    subtitle: 'Exact sample size for a sensitivity or specificity claim',
    path: '/diagnostic/sizing',
    about:
      'Exact (Clopper–Pearson) sizing for a single proportion against a performance goal. Exact rather than normal-approximation because IVD studies run at proportions near 1, where the normal approximation understates the required n.',
    fields: [
      { key: 'goal', label: 'Performance goal', kind: 'number', placeholder: '0.9', hint: 'The lower bound the confidence interval must clear.' },
      { key: 'expected', label: 'Expected performance', kind: 'number', placeholder: '0.95', hint: 'The value you actually expect to observe. Must exceed the goal.' },
      { key: 'alpha', label: 'Alpha', kind: 'number', optional: true, placeholder: '0.05' },
      { key: 'power', label: 'Power', kind: 'number', optional: true, placeholder: '0.8' },
    ],
  },
  {
    id: 'diagnostic-coprimary',
    title: 'Diagnostic study sizing — co-primary',
    subtitle: 'Sensitivity AND specificity must both succeed',
    path: '/diagnostic/sizing',
    fixedBody: { mode: 'co-primary' },
    about:
      'Sizes for co-primary sensitivity and specificity endpoints. Both must succeed, so the joint power is below either marginal power and the study needs more subjects than sizing on the harder endpoint alone. Prevalence sets how the enrolled sample splits between diseased and non-diseased.',
    fields: [
      { key: 'sensitivityGoal', label: 'Sensitivity goal', kind: 'number', placeholder: '0.85' },
      { key: 'sensitivityExpected', label: 'Sensitivity expected', kind: 'number', placeholder: '0.92' },
      { key: 'specificityGoal', label: 'Specificity goal', kind: 'number', placeholder: '0.9' },
      { key: 'specificityExpected', label: 'Specificity expected', kind: 'number', placeholder: '0.96' },
      { key: 'prevalence', label: 'Prevalence', kind: 'number', placeholder: '0.2', hint: 'Fraction of the enrolled sample expected to be disease-positive.' },
      { key: 'jointPowerTarget', label: 'Joint power target', kind: 'number', optional: true, placeholder: '0.8', hint: 'Probability BOTH endpoints succeed.' },
      { key: 'alpha', label: 'Alpha', kind: 'number', optional: true, placeholder: '0.05' },
    ],
  },
  {
    id: 'mrmc',
    title: 'MRMC reader study',
    subtitle: 'Power and reader count for a two-modality reading study',
    path: '/diagnostic/mrmc',
    about:
      'Obuchowski–Rockette power for a fully-crossed reader study. Note what the variance expression implies: it asymptotes to 2(Cov2 − Cov3), so reader covariance puts a floor under it that no number of readers can beat. If the target power is unreachable the result says so rather than returning the search bound.',
    fields: [
      { key: 'aucDifference', label: 'AUC difference (Δ)', kind: 'number', placeholder: '0.05' },
      { key: 'varTR', label: 'σ²  treatment×reader', kind: 'number', placeholder: '0.001' },
      { key: 'varError', label: 'σ²  error', kind: 'number', placeholder: '0.002' },
      { key: 'cov1', label: 'Cov1', kind: 'number', placeholder: '0.001', hint: 'Same reader, different modality. Must satisfy σ²_ε ≥ Cov1 ≥ Cov2 ≥ Cov3 ≥ 0.' },
      { key: 'cov2', label: 'Cov2', kind: 'number', placeholder: '0.0008', hint: 'Different reader, same modality.' },
      { key: 'cov3', label: 'Cov3', kind: 'number', placeholder: '0.0006', hint: 'Different reader, different modality.' },
      { key: 'nReaders', label: 'Readers (for power)', kind: 'int', optional: true, placeholder: '10', hint: 'Supply this for the power at a given reader count…' },
      { key: 'targetPower', label: 'Target power (to solve J)', kind: 'number', optional: true, placeholder: '0.8', hint: '…or this to solve for the readers needed.' },
      { key: 'maxReaders', label: 'Search up to', kind: 'int', optional: true, placeholder: '100' },
      { key: 'alpha', label: 'Alpha', kind: 'number', optional: true, placeholder: '0.05' },
    ],
  },
  {
    id: 'bayesian-device',
    title: 'Bayesian device study sizing',
    subtitle: 'Single-arm device trial against a performance goal',
    path: '/diagnostic/bayesian-device',
    about:
      'Beta-binomial single-arm sizing. The prior may be stated directly or derived from prior-generation data through a power prior with discount a0 — the mechanism FDA expects when historical device data is leveraged, because a0 makes the amount borrowed explicit rather than implicit.',
    fields: [
      {
        key: 'mode', label: 'Mode', kind: 'select',
        options: [
          { value: 'sizing', label: 'Sample size for target power' },
          { value: 'oc', label: 'Operating characteristic at a given n' },
          { value: 'predictive', label: 'Predictive probability of success at interim' },
        ],
      },
      { key: 'goal', label: 'Performance goal', kind: 'number', placeholder: '0.85' },
      { key: 'successThreshold', label: 'Success threshold', kind: 'number', placeholder: '0.95', hint: 'Posterior probability the goal must exceed to declare success.' },
      { key: 'expected', label: 'Expected rate', kind: 'number', optional: true, placeholder: '0.92', showWhen: { key: 'mode', equals: ['sizing'] } },
      { key: 'targetPower', label: 'Target power', kind: 'number', optional: true, placeholder: '0.8', showWhen: { key: 'mode', equals: ['sizing'] } },
      { key: 'n', label: 'Sample size', kind: 'int', optional: true, placeholder: '150', showWhen: { key: 'mode', equals: ['oc'] } },
      { key: 'trueRate', label: 'True rate', kind: 'number', optional: true, placeholder: '0.9', showWhen: { key: 'mode', equals: ['oc'] } },
      { key: 'xInterim', label: 'Successes at interim', kind: 'int', optional: true, placeholder: '70', showWhen: { key: 'mode', equals: ['predictive'] } },
      { key: 'nInterim', label: 'n at interim', kind: 'int', optional: true, placeholder: '80', showWhen: { key: 'mode', equals: ['predictive'] } },
      { key: 'nFinal', label: 'Final n', kind: 'int', optional: true, placeholder: '150', showWhen: { key: 'mode', equals: ['predictive'] } },
      { key: 'prior.alpha', label: 'Prior α', kind: 'number', optional: true, placeholder: '1', hint: 'Beta prior. Leave both blank for the uniform prior.' },
      { key: 'prior.beta', label: 'Prior β', kind: 'number', optional: true, placeholder: '1' },
      { key: 'history.successes', label: 'Historical successes', kind: 'int', optional: true, placeholder: '85', hint: 'Supply history instead of a prior to derive it through a power prior.' },
      { key: 'history.failures', label: 'Historical failures', kind: 'int', optional: true, placeholder: '15' },
      { key: 'history.a0', label: 'Power-prior discount a₀', kind: 'number', optional: true, placeholder: '0.5', hint: '1 = full borrowing, 0 = none.' },
    ],
  },
  {
    id: 'external-control',
    title: 'External control sensitivity',
    subtitle: 'How much bias would overturn the conclusion?',
    path: '/external-control/sensitivity',
    about:
      'Borrows from a historical control through a power prior, estimates the treatment effect against the borrowed control, and sweeps a hypothetical bias on the historical mean until the conclusion flips. The tipping point is the smallest bias that overturns the result — the number a reviewer weighs against how much unmeasured confounding is plausible.',
    fields: [
      { key: 'endpoint', label: 'Endpoint name', kind: 'text', optional: true, placeholder: 'ORR', hint: 'Used in the generated memo.' },
      { key: 'meanT', label: 'Treatment mean', kind: 'number', placeholder: '11' },
      { key: 'seT', label: 'Treatment SE', kind: 'number', placeholder: '1' },
      { key: 'meanC', label: 'Concurrent control mean', kind: 'number', placeholder: '10' },
      { key: 'seC', label: 'Concurrent control SE', kind: 'number', placeholder: '1' },
      { key: 'nC', label: 'Concurrent control n', kind: 'int', placeholder: '100' },
      { key: 'meanH', label: 'Historical control mean', kind: 'number', placeholder: '9.5' },
      { key: 'seH', label: 'Historical control SE', kind: 'number', placeholder: '1' },
      { key: 'nH', label: 'Historical control n', kind: 'int', placeholder: '200' },
      { key: 'a0', label: 'Power-prior discount a₀', kind: 'number', optional: true, placeholder: '0.5', hint: '1 = full pooling, 0 = no borrowing.' },
      { key: 'alpha', label: 'Alpha', kind: 'number', optional: true, placeholder: '0.05' },
    ],
  },
  {
    id: 'enrollment',
    title: 'Enrollment forecast',
    subtitle: 'When does the last patient enroll?',
    path: '/enrollment/forecast',
    about:
      'Simulates site-level recruitment as a Gamma-Poisson process and forecasts the calendar time to reach the target N, with percentiles rather than a single date. Seeded, so the same inputs give the same forecast — an operational forecast that moved every time it was refreshed would be unusable in a planning meeting.',
    fields: [
      {
        key: 'sites', label: 'Sites', kind: 'rows',
        placeholder: '0.8, 0.3, 0\n1.2, 0.4, 2\n0.5, 0.2, 4',
        hint: 'One site per line: mean rate, rate CV, activation time. Rate CV 0 means a deterministic site rate; activation time is when that site opens.',
      },
      { key: 'targetN', label: 'Target N', kind: 'int', optional: true, placeholder: '300', hint: 'Forecasts the time to reach this enrollment.' },
      { key: 'time', label: 'Enrollment by time', kind: 'number', optional: true, placeholder: '18', hint: 'Forecasts how many are enrolled by this calendar time.' },
      { key: 'seed', label: 'Seed', kind: 'int', optional: true, placeholder: '42', hint: 'Fixes the simulation so the forecast is reproducible.' },
      { key: 'nSim', label: 'Simulations', kind: 'int', optional: true, placeholder: '2000' },
    ],
    parseRows: {
      sites: rows =>
        rows.map(([meanRate, rateCv, activationTime]) => ({
          meanRate,
          ...(Number.isFinite(rateCv) ? { rateCv } : {}),
          ...(Number.isFinite(activationTime) ? { activationTime } : {}),
        })),
    },
  },
  {
    id: 'win-ratio',
    title: 'Win ratio',
    subtitle: 'Hierarchical composite endpoint',
    path: '/win-ratio',
    about:
      'Compares every treatment subject against every control subject on the endpoint hierarchy, stopping at the first level that discriminates. Wins, losses and ties are always reported alongside the ratio, so "every pair a win" (ratio undefined) stays distinguishable from "every pair a tie" (no information) — both of which have no finite ratio.',
    fields: [
      {
        key: 'treatment', label: 'Treatment subjects', kind: 'rows',
        placeholder: '12, 4\n8, 2\n15, 6',
        hint: 'One subject per line; one value per hierarchy level, in order.',
      },
      {
        key: 'control', label: 'Control subjects', kind: 'rows',
        placeholder: '6, 1\n9, 3\n5, 2',
        hint: 'Same level order as the treatment arm.',
      },
      {
        key: 'hierarchy', label: 'Level directions', kind: 'rows',
        placeholder: '1\n1',
        hint: 'One line per level, in priority order: 1 = higher is better, 0 = lower is better.',
      },
      { key: 'confLevel', label: 'Confidence level', kind: 'number', optional: true, placeholder: '0.95' },
    ],
    parseRows: {
      treatment: rows => rows.map(values => ({ levels: values.map(value => ({ value })) })),
      control: rows => rows.map(values => ({ levels: values.map(value => ({ value })) })),
      hierarchy: rows =>
        rows.map(([dir]) => ({
          type: 'continuous',
          direction: dir === 0 ? 'lower-better' : 'higher-better',
        })),
    },
  },
];

/** Set a possibly-dotted path on an object, creating intermediate objects. */
export function setPath(target: Record<string, any>, path: string, value: unknown): void {
  const parts = path.split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

/** Parse a comma/space separated list of numbers. Returns null if any entry is not finite. */
export function parseNumberList(raw: string): number[] | null {
  const parts = raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const nums = parts.map(Number);
  return nums.every(Number.isFinite) ? nums : null;
}

/** Parse a multi-line `rows` value into one number list per non-empty line. */
export function parseRowLines(raw: string): number[][] | null {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const rows = lines.map(parseNumberList);
  return rows.every((r): r is number[] => r !== null) ? rows : null;
}

export interface BuildResult {
  body: Record<string, unknown>;
  /** Human-readable reasons the form is not ready to submit. */
  errors: string[];
}

/**
 * Turn the raw string form state into the request body, or report why it cannot
 * be built. Blank optional fields are OMITTED rather than sent as 0 or null —
 * the handlers branch on `typeof x === 'number'`, so sending a placeholder would
 * silently opt into a different code path.
 */
export function buildRequestBody(
  calc: Calculator,
  values: Record<string, string>
): BuildResult {
  const body: Record<string, unknown> = { ...(calc.fixedBody ?? {}) };
  const errors: string[] = [];

  for (const field of calc.fields) {
    if (!isFieldVisible(field, values)) continue;
    const raw = (values[field.key] ?? '').trim();

    if (!raw) {
      if (!field.optional) errors.push(`${field.label} is required.`);
      continue;
    }

    switch (field.kind) {
      case 'text':
        setPath(body, field.key, raw);
        break;
      case 'select':
        setPath(body, field.key, raw);
        break;
      case 'number':
      case 'int': {
        const n = Number(raw);
        if (!Number.isFinite(n)) { errors.push(`${field.label} must be a number.`); break; }
        if (field.kind === 'int' && !Number.isInteger(n)) { errors.push(`${field.label} must be a whole number.`); break; }
        setPath(body, field.key, n);
        break;
      }
      case 'numlist': {
        const list = parseNumberList(raw);
        if (!list) { errors.push(`${field.label} must be a list of numbers.`); break; }
        setPath(body, field.key, list);
        break;
      }
      case 'rows': {
        const rows = parseRowLines(raw);
        if (!rows) { errors.push(`${field.label}: every line must be a list of numbers.`); break; }
        const shape = calc.parseRows?.[field.key];
        setPath(body, field.key, shape ? shape(rows) : rows);
        break;
      }
    }
  }

  return { body, errors };
}

/** A field with `showWhen` is only part of the form while its condition holds. */
export function isFieldVisible(field: CalculatorField, values: Record<string, string>): boolean {
  if (!field.showWhen) return true;
  return field.showWhen.equals.includes(values[field.showWhen.key] ?? '');
}

/** Initial form state: selects start on their first option, everything else blank. */
export function initialValues(calc: Calculator): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of calc.fields) {
    values[field.key] = field.kind === 'select' ? (field.options?.[0]?.value ?? '') : '';
  }
  return values;
}
