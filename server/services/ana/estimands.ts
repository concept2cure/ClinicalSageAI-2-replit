/**
 * Estimand / study-design advisor for AnA (ICH E9(R1)).
 *
 * Encodes the ICH E9(R1) estimand framework — the five attributes (treatment,
 * population, variable/endpoint, intercurrent-event handling strategies,
 * population-level summary) and the five intercurrent-event strategies
 * (treatment-policy, hypothetical, composite, while-on-treatment, principal-
 * stratum) — so AnA can construct and QC a well-specified estimand and align the
 * estimator/sensitivity analyses. Pairs with the statistical-results narrator.
 *
 * Deterministic, dependency-free, data-driven. Advisory — agree the estimand
 * with the agency at protocol/SAP stage.
 *
 * @module server/services/ana/estimands
 */

export interface EstimandAttribute {
  id: string;
  label: string;
  question: string;
  examples: string[];
}

export interface IntercurrentStrategy {
  id: string;
  label: string;
  describe: string;
  useWhen: string;
  caution: string;
  aliases?: string[];
}

const ATTRIBUTES: EstimandAttribute[] = [
  { id: 'treatment', label: 'Treatment', question: 'Which treatment conditions are being compared?', examples: ['Drug X 50 mg vs placebo, each + standard of care'] },
  { id: 'population', label: 'Population', question: 'Which patients does the estimand target?', examples: ['Adults with moderate-to-severe disease meeting entry criteria'] },
  { id: 'variable', label: 'Variable (endpoint)', question: 'What endpoint/variable is measured on each patient?', examples: ['Change from baseline in symptom score at Week 24'] },
  { id: 'intercurrent_events', label: 'Intercurrent-event handling', question: 'How are post-randomization events (discontinuation, rescue, death) handled?', examples: ['Treatment-policy for rescue medication; composite for treatment discontinuation'] },
  { id: 'summary', label: 'Population-level summary', question: 'What summary measure expresses the treatment effect?', examples: ['Difference in mean change; hazard ratio; odds ratio'] },
];

const STRATEGIES: IntercurrentStrategy[] = [
  {
    id: 'treatment_policy',
    label: 'Treatment-policy strategy',
    describe: 'Use the value of the variable regardless of the intercurrent event — the event is part of the treatment condition.',
    useWhen: 'Effectiveness question reflecting real-world use (e.g., rescue medication permitted).',
    caution: 'Requires data collection to continue after the event; cannot apply to death for non-survival endpoints.',
    aliases: ['treatment policy', 'itt-like', 'as-randomized'],
  },
  {
    id: 'hypothetical',
    label: 'Hypothetical strategy',
    describe: 'Envisage a scenario in which the intercurrent event would not occur (e.g., effect if rescue were unavailable).',
    useWhen: 'Estimating the effect under conditions different from those observed.',
    caution: 'Relies on untestable assumptions; pre-specify the analysis and sensitivity analyses.',
    aliases: ['hypothetical', 'counterfactual'],
  },
  {
    id: 'composite',
    label: 'Composite-variable strategy',
    describe: 'Incorporate the intercurrent event into the endpoint definition (e.g., discontinuation = non-responder).',
    useWhen: 'The event is itself a meaningful (unfavorable) outcome.',
    caution: 'Choice of how the event maps onto the endpoint must be clinically justified.',
    aliases: ['composite', 'non-responder imputation'],
  },
  {
    id: 'while_on_treatment',
    label: 'While-on-treatment strategy',
    describe: 'Use the response up to the time of the intercurrent event only.',
    useWhen: 'The value before the event is the question of interest (e.g., symptom control while treated).',
    caution: 'Differing exposure durations across patients complicate interpretation.',
    aliases: ['while on treatment', 'on-treatment'],
  },
  {
    id: 'principal_stratum',
    label: 'Principal-stratum strategy',
    describe: 'Target the effect within the subpopulation defined by potential occurrence of the event (e.g., those who would adhere).',
    useWhen: 'Interest is in a stratum defined by post-randomization behavior.',
    caution: 'The stratum is latent/not directly observed; strong assumptions and sensitivity analyses needed.',
    aliases: ['principal stratum', 'principal stratification'],
  },
];

function bullets(title: string, items: string[]): string {
  return items.length ? `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '';
}

function findStrategy(key?: string): IntercurrentStrategy | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    STRATEGIES.find(s => s.id === k) ||
    STRATEGIES.find(s => s.aliases?.some(a => a.toLowerCase() === k)) ||
    STRATEGIES.find(s => s.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(s.id))
  );
}

export interface EstimandQuery {
  strategy?: string; // focus on one intercurrent-event strategy
  /** Optional structured estimand to QC against the five attributes. */
  draft?: {
    treatment?: string;
    population?: string;
    variable?: string;
    intercurrentEvents?: string;
    summary?: string;
  };
}

export interface EstimandResult {
  resolved: { strategy: string | null };
  strategy: IntercurrentStrategy | null;
  missingAttributes: string[];
  brief: string;
}

export function listEstimandFramework() {
  return {
    attributes: ATTRIBUTES.map(a => ({ id: a.id, label: a.label })),
    strategies: STRATEGIES.map(s => ({ id: s.id, label: s.label })),
  };
}

export function adviseEstimand(q: EstimandQuery): EstimandResult {
  const strategy = findStrategy(q.strategy) ?? null;
  const parts: string[] = [];
  const missing: string[] = [];

  if (q.draft) {
    parts.push('# Estimand QC (ICH E9(R1))');
    const d = q.draft;
    const map: [string, string | undefined][] = [
      ['Treatment', d.treatment],
      ['Population', d.population],
      ['Variable (endpoint)', d.variable],
      ['Intercurrent-event handling', d.intercurrentEvents],
      ['Population-level summary', d.summary],
    ];
    for (const [label, val] of map) {
      if (val && val.trim()) parts.push(`- **${label}.** ${val}`);
      else missing.push(label);
    }
    if (missing.length) parts.push(bullets('Missing attributes (a complete estimand needs all five)', missing));
    else parts.push('\n_All five estimand attributes are specified._');
  }

  if (strategy) {
    parts.push(`\n## Intercurrent-event strategy: ${strategy.label}`);
    parts.push(`**What it does.** ${strategy.describe}`);
    parts.push(`**Use when.** ${strategy.useWhen}`);
    parts.push(`**Caution.** ${strategy.caution}`);
  } else if (!q.draft) {
    parts.push('# Estimand framework (ICH E9(R1))');
    parts.push(bullets('The five estimand attributes', ATTRIBUTES.map(a => `${a.label}: ${a.question}`)));
    parts.push('\n## Intercurrent-event strategies');
    for (const s of STRATEGIES) parts.push(`- **${s.label}** — ${s.describe}`);
  }

  parts.push(
    '\n## Note\nThe estimand must be defined BEFORE choosing the estimator; pre-specify the main estimator ' +
      'and aligned sensitivity analyses in the protocol/SAP and agree with the agency. Narrate results with ' +
      'narrate_statistical_result.'
  );

  return {
    resolved: { strategy: strategy?.id ?? null },
    strategy,
    missingAttributes: missing,
    brief: parts.filter(Boolean).join('\n'),
  };
}
