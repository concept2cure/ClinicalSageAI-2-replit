/**
 * Shared by clientNamesSlice1.test.tsx and clientNamesSlice1Features.test.tsx: section 9's
 * "Not in client copy" words and the slice 1 labels (.design/client-journey/INFORMATION_ARCHITECTURE.md).
 */

/* ── Section 9's words ────────────────────────────────────────────────────── */

/** Apostrophes, entities and spacing do not make two names different. */
export const norm = (s: string) => s.replace(/[’‘]/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/**
 * "Not in client copy: app, apps, workflow (for a feature), suite, cockpit, workbench, engine, hub,
 * twin, intelligence (as a product name), module (except a CTD module and CMC / Module 3), program
 * (use project), plan (for the subscription)." In a label, a door or a Coming later line
 * "intelligence" only ever names a feature, so it is refused in any form here.
 */
const WORDS: ReadonlyArray<[string, RegExp]> = [
  ['app', /\bapps?\b/i],
  ['workflow', /\bworkflows?\b/i],
  ['suite', /\bsuites?\b/i],
  ['cockpit', /\bcockpits?\b/i],
  ['workbench', /\bworkbench(?:es)?\b/i],
  ['engine', /\bengines?\b/i],
  ['hub', /\bhubs?\b/i],
  ['twin', /\btwins?\b/i],
  ['intelligence', /\bintelligence\b/i],
];
/** A CTD module, CMC / Module 3, and a modular PMA's modules are allowed. */
const MODULE_ALLOWED = /CMC \/ Module 3|\bModules? \d|\b(?:e?CTD|PMA) modules?\b/gi;
/** As clientCopyNoProgram.test.ts: a regulatory or industry name that contains the word stays. */
const PROGRAM_ALLOWED = /Q-Sub(?:mission)? Program|expedited programs?|pediatric (?:study )?programs?|stability programs?|Qualification Program|Program management/gi;
/** "Plan" the step stays, and so does a document that is a plan (a monitoring plan, a plan of work). */
const PLAN_ALLOWED: readonly RegExp[] = [
  /\bPlan\b(?!\s*(?:&|and)\s)/g,
  /\b(?:management|monitoring|analysis|surveillance|development|validation|testing|test|study|communication|mitigation|control|PMS|PMCF|PMPF|investigational|pediatric|risk|transition|action|usability|clinical|statistical|recruitment|safety|sampling|training|audit|remediation|response|evaluation)\s+plans?\b/gi,
  /\bplans? of\b/gi,
];

export function notInClientCopy(text: string): string[] {
  const t = norm(text);
  const found = WORDS.filter(([, re]) => re.test(t)).map(([word]) => word);
  if (/\bmodules?\b/i.test(t.replace(MODULE_ALLOWED, ''))) found.push('module');
  if (/\bprogram(?:me)?s?\b/i.test(t.replace(PROGRAM_ALLOWED, ''))) found.push('program');
  if (/\bplans?\b/i.test(PLAN_ALLOWED.reduce((s, re) => s.replace(re, ''), t))) found.push('plan (the subscription)');
  return found;
}

export function offending(entries: ReadonlyArray<readonly [string, string | null | undefined]>): string[] {
  return entries.flatMap(([where, text]) => {
    if (!text) return [];
    const words = notInClientCopy(text);
    return words.length ? [`${where}: "${norm(text)}" (${words.join(', ')})`] : [];
  });
}

/**
 * Section 9's client label for each slice 1 row it renames, exactly. Each is also checked against
 * the IA row it comes from (below), so this table cannot drift from the document.
 */
export const SLICE1_LABELS: Readonly<Record<string, string>> = {
  apps: 'Subscription & features',
  licensing: 'Compare subscriptions',
  'master-licensing': 'Platform licensing',
  tasks: 'Tasks',
  'communication-center': 'Communication',
  vault: 'Vault',
  quality: 'Quality',
  'document-authoring': 'The editor',
  review: 'The review board',
  'protocol-dev': 'The protocol workspace',
  'ind-checklist': 'IND forms',
  'dispatch-readiness': 'Readiness',
  'submission-center': 'Submission Center',
  'device-cer': 'Clinical evaluation (CER)',
  'device-510k': '510(k) and eSTAR',
  'device-pma': 'PMA',
  'device-diagnostics': 'IVDR evidence',
  'device-engineering': 'Engineering evidence',
  'device-postmarket': 'Post-market surveillance and CAPA',
};
