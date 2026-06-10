/**
 * Clinical Outcome Assessment (COA) selection advisor for AnA.
 *
 * Encodes the FDA COA framework (PRO/ClinRO/ObsRO/PerfO), the FDA PRO Guidance
 * (2009) and the Roadmap to Patient-Focused Outcome Measurement: how to pick the
 * right COA type for a concept of interest, what evidence supports a fit-for-
 * purpose instrument, how to position an endpoint in the hierarchy, and the
 * common pitfalls (content validity, fit-for-purpose, label-claim support).
 *
 * Deterministic, dependency-free, data-driven. Advisory — endpoint/label-claim
 * strategy must be agreed with the agency.
 *
 * @module server/services/ana/coa-selection
 */

export type CoaType = 'pro' | 'clinro' | 'obsro' | 'perfo';

export interface CoaTypeRecord {
  id: CoaType;
  label: string;
  reporter: string;
  useWhen: string;
  examples: string[];
  cautions: string[];
  aliases?: string[];
}

const COA_TYPES: CoaTypeRecord[] = [
  {
    id: 'pro',
    label: 'Patient-Reported Outcome (PRO)',
    reporter: 'The patient, directly, with no interpretation by anyone else.',
    useWhen: 'The concept is best known to the patient — symptoms, function, or health-related quality of life (e.g., pain, fatigue, dyspnea).',
    examples: ['Pain intensity (NRS)', 'Symptom severity diaries', 'Health-related quality of life (e.g., disease-specific PRO)'],
    cautions: ['Avoid for concepts a patient cannot reliably self-assess', 'Recall period must match the concept', 'Beware unblinded/open-label bias on subjective PROs'],
    aliases: ['patient-reported', 'patient reported outcome'],
  },
  {
    id: 'clinro',
    label: 'Clinician-Reported Outcome (ClinRO)',
    reporter: 'A trained healthcare professional, applying clinical judgement.',
    useWhen: 'The concept requires clinical expertise to observe/rate (e.g., tumor response per RECIST read, clinical severity scales).',
    examples: ['Clinical global impression of severity', 'Rated disease-activity scales', 'Investigator-assessed response'],
    cautions: ['Requires rater training and inter-rater reliability', 'Subjective ClinROs are vulnerable to unblinding', 'Not a substitute for the patient’s perspective on how they feel/function'],
    aliases: ['clinician-reported', 'clinician reported outcome'],
  },
  {
    id: 'obsro',
    label: 'Observer-Reported Outcome (ObsRO)',
    reporter: 'A non-clinician observer (e.g., parent/caregiver) reporting observable events only.',
    useWhen: 'The patient cannot self-report (young children, cognitive impairment) and the concept is directly observable (e.g., vomiting frequency, scratching).',
    examples: ['Caregiver-observed crying/irritability', 'Parent-reported observable symptoms in young children'],
    cautions: ['Limit to observable behaviors — observers cannot report internal states (e.g., pain intensity)', 'Define the observer and observation conditions'],
    aliases: ['observer-reported', 'caregiver-reported', 'caregiver reported outcome'],
  },
  {
    id: 'perfo',
    label: 'Performance Outcome (PerfO)',
    reporter: 'The patient performing a defined, standardized task, scored objectively.',
    useWhen: 'The concept is functional capacity measurable via a standardized task (e.g., 6-minute walk distance, cognitive testing).',
    examples: ['6-minute walk test', 'Timed Up-and-Go', 'Standardized cognitive/memory tests'],
    cautions: ['Standardize administration and environment', 'Effort/motivation can confound', 'Define clinically meaningful change'],
    aliases: ['performance outcome', 'performance-based'],
  },
];

/** Fit-for-purpose / validation evidence expected for a COA (FDA Roadmap). */
const FIT_FOR_PURPOSE: string[] = [
  'Document the concept of interest and context of use (population, indication, endpoint position).',
  'Content validity: evidence (qualitative patient input) that the instrument measures the concept that matters to patients.',
  'Reliability (test-retest, internal consistency) and construct validity.',
  'Ability to detect change (responsiveness) over the relevant time frame.',
  'Pre-specify a meaningful within-patient change threshold (anchor-based preferred).',
  'Define the recall period, administration mode, and scoring/handling of missing data.',
];

const ENDPOINT_HIERARCHY: string[] = [
  'Primary endpoint: confirmatory, multiplicity-controlled, drives the label claim.',
  'Key secondary endpoints: in the testing hierarchy, can support additional claims.',
  'Other secondary/exploratory: supportive/hypothesis-generating — not for confirmatory claims.',
  'A PRO label claim requires the instrument to be fit-for-purpose AND the endpoint adequately positioned and controlled.',
];

function bullets(title: string, items: string[]): string {
  return items.length ? `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}` : '';
}

function findCoa(key?: string): CoaTypeRecord | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    COA_TYPES.find(c => c.id === k) ||
    COA_TYPES.find(c => c.aliases?.some(a => a.toLowerCase() === k)) ||
    COA_TYPES.find(c => c.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(c.id))
  );
}

/**
 * Heuristic suggestion of a COA type from a free-text concept + reporter hints.
 * Returns the best-fit type id with a short rationale (advisory).
 */
function suggestType(concept?: string, reporter?: string): { id: CoaType; rationale: string } | null {
  const c = (concept ?? '').toLowerCase();
  const r = (reporter ?? '').toLowerCase();
  if (r.includes('clinician') || r.includes('investigator') || r.includes('physician')) {
    return { id: 'clinro', rationale: 'Reporter is a clinician applying clinical judgement.' };
  }
  if (r.includes('caregiver') || r.includes('parent') || r.includes('observer')) {
    return { id: 'obsro', rationale: 'A non-clinician observer reports observable events (patient cannot self-report).' };
  }
  if (/\b(walk|gait|performance|task|cognit|distance|timed)\b/.test(c)) {
    return { id: 'perfo', rationale: 'Concept is functional capacity measured by a standardized task.' };
  }
  if (/\b(pain|fatigue|symptom|quality of life|dyspnea|nausea|itch|mood|feel|function)\b/.test(c)) {
    return { id: 'pro', rationale: 'Concept is best known to the patient and self-reportable.' };
  }
  return null;
}

export interface CoaQuery {
  coaType?: string; // direct lookup
  concept?: string; // concept of interest (free text) for suggestion
  reporter?: string; // reporter hint
}

export interface CoaResult {
  resolved: { coaType: CoaType | null };
  coaType: CoaTypeRecord | null;
  suggestion: { id: CoaType; label: string; rationale: string } | null;
  brief: string;
}

export function listCoaTypes() {
  return COA_TYPES.map(c => ({ id: c.id, label: c.label, reporter: c.reporter }));
}

export function adviseCoaSelection(q: CoaQuery): CoaResult {
  const direct = findCoa(q.coaType) ?? null;
  const suggested = !direct ? suggestType(q.concept, q.reporter) : null;
  const focus = direct ?? (suggested ? COA_TYPES.find(c => c.id === suggested.id) ?? null : null);

  const parts: string[] = [];
  if (focus) {
    parts.push(`# COA selection: ${focus.label}`);
    if (suggested) parts.push(`\n_Suggested from the concept of interest — ${suggested.rationale}_`);
    parts.push(`\n**Reporter.** ${focus.reporter}`);
    parts.push(`**Use when.** ${focus.useWhen}`);
    parts.push(bullets('Examples', focus.examples));
    parts.push(bullets('Cautions', focus.cautions));
  } else {
    parts.push('# Clinical Outcome Assessment (COA) types');
    for (const c of COA_TYPES) parts.push(`\n## ${c.label}\n**Reporter.** ${c.reporter}\n**Use when.** ${c.useWhen}`);
  }

  parts.push(bullets('Fit-for-purpose evidence (FDA COA Roadmap)', FIT_FOR_PURPOSE));
  parts.push(bullets('Endpoint positioning', ENDPOINT_HIERARCHY));
  parts.push(
    '\n## Note\nAdvisory only — agree the COA strategy and any label claim with FDA (e.g., via the COA ' +
      'qualification program or a Type C meeting). Pair with narrate_statistical_result for results and ' +
      'screen_promotional_language for any claim language.'
  );

  return {
    resolved: { coaType: focus?.id ?? null },
    coaType: focus,
    suggestion: suggested ? { id: suggested.id, label: COA_TYPES.find(c => c.id === suggested.id)!.label, rationale: suggested.rationale } : null,
    brief: parts.filter(Boolean).join('\n'),
  };
}
