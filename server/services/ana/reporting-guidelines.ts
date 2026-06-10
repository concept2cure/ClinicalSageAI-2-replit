/**
 * Reporting-guideline advisor for AnA (EQUATOR network).
 *
 * Selects the right reporting guideline for a study type and surfaces its
 * essential checklist items — CONSORT (RCTs), SPIRIT (trial protocols), STROBE
 * (observational), PRISMA (systematic reviews/meta-analyses), STARD (diagnostic
 * accuracy), CARE (case reports), ARRIVE (animal studies), and RECORD/STROBE for
 * routinely-collected data. Lets AnA pick and QC against the appropriate
 * guideline so manuscripts/protocols are submission-ready.
 *
 * Deterministic, dependency-free, data-driven. The checklist excerpts are the
 * high-yield items, not the full instrument — confirm against the current
 * published checklist on the EQUATOR network.
 *
 * @module server/services/ana/reporting-guidelines
 */

export interface ReportingGuideline {
  id: string;
  label: string;
  scope: string;
  studyTypes: string[]; // lowercase cues for selection
  essentialItems: string[];
  commonPitfalls: string[];
  aliases?: string[];
}

const GUIDELINES: ReportingGuideline[] = [
  {
    id: 'consort',
    label: 'CONSORT 2010',
    scope: 'Reporting of randomized controlled trials (parallel-group).',
    studyTypes: ['rct', 'randomized controlled trial', 'randomised', 'parallel-group', 'clinical trial report'],
    essentialItems: [
      'Title/abstract identify the study as randomized.',
      'Pre-specified primary and secondary outcomes (with any changes after trial start).',
      'Sample-size determination.',
      'Randomization: sequence generation, allocation concealment, implementation.',
      'Blinding (who was blinded and how).',
      'Participant flow diagram (enrolment → allocation → follow-up → analysis).',
      'Numbers analyzed per group (ITT/per-protocol) with effect size + precision (e.g., 95% CI).',
      'Harms; trial registration number; protocol availability; funding.',
    ],
    commonPitfalls: ['Selective outcome reporting', 'No flow diagram', 'Effect size without CI'],
    aliases: ['consort', 'rct reporting'],
  },
  {
    id: 'spirit',
    label: 'SPIRIT 2013',
    scope: 'Content of clinical trial protocols.',
    studyTypes: ['protocol', 'trial protocol', 'study protocol'],
    essentialItems: [
      'Background/rationale and specific objectives.',
      'Trial design (type, allocation ratio, framework: superiority/NI/equivalence).',
      'Eligibility criteria; interventions with adherence/modification rules.',
      'Outcomes with the specific measurement variable, metric, and timepoint.',
      'Sample size and recruitment.',
      'Randomization & blinding; data collection/management plan.',
      'Statistical methods (incl. handling of missing data); monitoring/DMC; harms.',
      'Ethics, consent, confidentiality, declaration of interests, dissemination.',
    ],
    commonPitfalls: ['Outcomes underspecified (no metric/timepoint)', 'No analysis-population definition', 'Missing data plan absent'],
    aliases: ['spirit', 'protocol reporting'],
  },
  {
    id: 'strobe',
    label: 'STROBE',
    scope: 'Reporting of observational studies (cohort, case-control, cross-sectional).',
    studyTypes: ['observational', 'cohort', 'case-control', 'cross-sectional', 'epidemiolog'],
    essentialItems: [
      'State the design early; setting, locations, and relevant dates.',
      'Eligibility criteria and sources/methods of selection (and matching for case-control).',
      'Clearly define all outcomes, exposures, predictors, confounders.',
      'Efforts to address bias; how confounding was controlled (e.g., adjustment, stratification).',
      'Statistical methods; handling of missing data; sensitivity analyses.',
      'Report numbers at each stage; unadjusted AND confounder-adjusted estimates with CIs.',
      'Limitations (sources of bias/imprecision) and generalizability.',
    ],
    commonPitfalls: ['Confounders not pre-specified/addressed', 'Only adjusted (or only unadjusted) estimates', 'Causal language from associational data'],
    aliases: ['strobe', 'observational reporting'],
  },
  {
    id: 'prisma',
    label: 'PRISMA 2020',
    scope: 'Reporting of systematic reviews and meta-analyses.',
    studyTypes: ['systematic review', 'meta-analysis', 'meta analysis', 'evidence synthesis'],
    essentialItems: [
      'Protocol registration (e.g., PROSPERO); eligibility criteria.',
      'Full search strategy for at least one database; information sources & dates.',
      'Selection and data-collection process (independent reviewers).',
      'Risk-of-bias assessment of included studies.',
      'Synthesis methods (and meta-analysis model/heterogeneity if applicable).',
      'PRISMA flow diagram (records identified → screened → included).',
      'Certainty of evidence (e.g., GRADE); reporting-bias assessment.',
    ],
    commonPitfalls: ['Search not reproducible', 'No risk-of-bias assessment', 'No flow diagram / certainty rating'],
    aliases: ['prisma', 'systematic review reporting'],
  },
  {
    id: 'stard',
    label: 'STARD 2015',
    scope: 'Reporting of diagnostic accuracy studies.',
    studyTypes: ['diagnostic accuracy', 'diagnostic test', 'index test', 'sensitivity specificity'],
    essentialItems: [
      'Define the index test, the reference standard, and the target condition.',
      'Participant sampling (consecutive/random?) and flow.',
      'Cross-tabulation of index-test vs reference-standard results.',
      'Estimates of accuracy (sensitivity, specificity, predictive values) with CIs.',
      'How indeterminate/missing results were handled; blinding of readers.',
    ],
    commonPitfalls: ['Reference standard not applied to all', 'No 2×2 table', 'Spectrum/verification bias unaddressed'],
    aliases: ['stard', 'diagnostic accuracy reporting'],
  },
  {
    id: 'arrive',
    label: 'ARRIVE 2.0',
    scope: 'Reporting of in vivo animal research.',
    studyTypes: ['animal study', 'in vivo', 'preclinical animal', 'nonclinical animal'],
    essentialItems: [
      'Study design (groups, experimental unit); sample size with justification.',
      'Inclusion/exclusion criteria; randomization and blinding.',
      'Outcome measures; statistical methods.',
      'Species/strain, sex, age/weight; housing and husbandry; ethical statement (3Rs).',
    ],
    commonPitfalls: ['No randomization/blinding reported', 'Experimental unit ambiguous', 'No sample-size justification'],
    aliases: ['arrive', 'animal research reporting'],
  },
  {
    id: 'care',
    label: 'CARE',
    scope: 'Reporting of clinical case reports.',
    studyTypes: ['case report', 'case study'],
    essentialItems: [
      'De-identified patient information and a timeline of the episode.',
      'Diagnostic assessment, intervention, and outcomes (incl. adverse/unanticipated events).',
      'Patient perspective and informed consent.',
    ],
    commonPitfalls: ['Identifiable patient data', 'No timeline', 'Consent not documented'],
    aliases: ['care', 'case report reporting'],
  },
];

function bullets(title: string, items: string[]): string {
  return items.length ? `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '';
}

function findGuideline(key?: string): ReportingGuideline | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    GUIDELINES.find(g => g.id === k) ||
    GUIDELINES.find(g => g.aliases?.some(a => a.toLowerCase() === k)) ||
    GUIDELINES.find(g => g.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(g.id))
  );
}

/** Select the best-fit guideline from a free-text study-type description. */
function selectByStudyType(description: string): { id: string; label: string; score: number }[] {
  const lc = description.toLowerCase();
  return GUIDELINES
    .map(g => ({ id: g.id, label: g.label, score: g.studyTypes.filter(c => lc.includes(c)).length }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

export interface ReportingQuery {
  guideline?: string;
  studyType?: string;
}

export interface ReportingResult {
  resolved: { guideline: string | null };
  guideline: ReportingGuideline | null;
  selection: { id: string; label: string; score: number }[];
  brief: string;
}

export function listReportingGuidelines() {
  return GUIDELINES.map(g => ({ id: g.id, label: g.label, scope: g.scope }));
}

export function adviseReportingGuideline(q: ReportingQuery): ReportingResult {
  let guideline = findGuideline(q.guideline) ?? null;
  let selection: { id: string; label: string; score: number }[] = [];
  if (!guideline && q.studyType) {
    selection = selectByStudyType(q.studyType);
    if (selection.length) guideline = GUIDELINES.find(g => g.id === selection[0].id) ?? null;
  }

  const parts: string[] = [];
  if (guideline) {
    parts.push(`# Reporting guideline: ${guideline.label}`);
    if (selection.length) parts.push(`\n_Selected from the study type (matched ${selection[0].score} cue${selection[0].score === 1 ? '' : 's'})._`);
    parts.push(`\n**Scope.** ${guideline.scope}`);
    parts.push(bullets('Essential checklist items', guideline.essentialItems));
    parts.push(bullets('Common pitfalls', guideline.commonPitfalls));
    if (selection.length > 1) parts.push(bullets('Other candidate guidelines', selection.slice(1).map(s => s.label)));
  } else {
    parts.push('# Reporting guidelines (EQUATOR network)');
    for (const g of GUIDELINES) parts.push(`\n## ${g.label}\n${g.scope}`);
  }

  parts.push(
    '\n## Note\nChecklist excerpts are high-yield items, not the full instrument — confirm against the ' +
      'current published checklist on the EQUATOR network. Pair with the medical-writing tools and ' +
      'narrate_statistical_result.'
  );

  return { resolved: { guideline: guideline?.id ?? null }, guideline, selection, brief: parts.filter(Boolean).join('\n') };
}
