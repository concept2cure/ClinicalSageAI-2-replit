/**
 * The closed vocabulary a step of AnA's work is presented in: its verbs, in
 * both tenses; the sources a step can act on; the input fields a step may
 * preview; and the facts its details may state (ANA-SUMMARY S3,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §2.3).
 *
 * ── Why closed ───────────────────────────────────────────────────────────────
 * Every tool's `present` entry in tool-authorization.register.json names a verb
 * key and a source key from these tables, never free text. So a live row reads
 * "Searching the Vault" and the finished one "Searched the Vault" from one
 * entry, and no label can drift into a raw tool name: a tool with no entry
 * reads "Ran a step". `scripts/ci/check-step-presentation.mjs` reads this file
 * and refuses an entry whose verb or source is not here.
 *
 * Shared because both halves use it: the server builds every label from it
 * (server/services/ana/step-presentation.ts), and the client falls back to
 * the same unknown-step words when a frame or an older record carries none.
 *
 * Pure data, no I/O.
 *
 * @module shared/ana/step-verbs
 */

/** Each verb in the tense a live row reads in, and the tense a finished row reads in. */
export const STEP_VERBS = {
  add: { doing: 'Adding', done: 'Added' },
  analyze: { doing: 'Analyzing', done: 'Analyzed' },
  apply: { doing: 'Applying', done: 'Applied' },
  assemble: { doing: 'Assembling', done: 'Assembled' },
  assess: { doing: 'Assessing', done: 'Assessed' },
  build: { doing: 'Building', done: 'Built' },
  check: { doing: 'Checking', done: 'Checked' },
  classify: { doing: 'Classifying', done: 'Classified' },
  code: { doing: 'Coding', done: 'Coded' },
  compare: { doing: 'Comparing', done: 'Compared' },
  compute: { doing: 'Computing', done: 'Computed' },
  convert: { doing: 'Converting', done: 'Converted' },
  create: { doing: 'Creating', done: 'Created' },
  critique: { doing: 'Critiquing', done: 'Critiqued' },
  derive: { doing: 'Deriving', done: 'Derived' },
  design: { doing: 'Designing', done: 'Designed' },
  determine: { doing: 'Determining', done: 'Determined' },
  draft: { doing: 'Drafting', done: 'Drafted' },
  edit: { doing: 'Editing', done: 'Edited' },
  estimate: { doing: 'Estimating', done: 'Estimated' },
  explain: { doing: 'Explaining', done: 'Explained' },
  extract: { doing: 'Extracting', done: 'Extracted' },
  file: { doing: 'Filing', done: 'Filed' },
  finalize: { doing: 'Finalizing', done: 'Finalized' },
  forecast: { doing: 'Forecasting', done: 'Forecast' },
  format: { doing: 'Formatting', done: 'Formatted' },
  generate: { doing: 'Generating', done: 'Generated' },
  link: { doing: 'Linking', done: 'Linked' },
  list: { doing: 'Listing', done: 'Listed' },
  look_up: { doing: 'Looking up', done: 'Looked up' },
  open: { doing: 'Opening', done: 'Opened' },
  package: { doing: 'Packaging', done: 'Packaged' },
  place: { doing: 'Placing', done: 'Placed' },
  plan: { doing: 'Planning', done: 'Planned' },
  read: { doing: 'Reading', done: 'Read' },
  recall: { doing: 'Recalling', done: 'Recalled' },
  record: { doing: 'Recording', done: 'Recorded' },
  render: { doing: 'Rendering', done: 'Rendered' },
  resolve: { doing: 'Resolving', done: 'Resolved' },
  review: { doing: 'Reviewing', done: 'Reviewed' },
  run: { doing: 'Running', done: 'Ran' },
  save: { doing: 'Saving', done: 'Saved' },
  scan: { doing: 'Scanning', done: 'Scanned' },
  score: { doing: 'Scoring', done: 'Scored' },
  screen: { doing: 'Screening', done: 'Screened' },
  search: { doing: 'Searching', done: 'Searched' },
  select: { doing: 'Selecting', done: 'Selected' },
  send: { doing: 'Sending', done: 'Sent' },
  simulate: { doing: 'Simulating', done: 'Simulated' },
  start: { doing: 'Starting', done: 'Started' },
  summarize: { doing: 'Summarizing', done: 'Summarized' },
  trace: { doing: 'Tracing', done: 'Traced' },
  update: { doing: 'Updating', done: 'Updated' },
  validate: { doing: 'Validating', done: 'Validated' },
} as const;

export type StepVerb = keyof typeof STEP_VERBS;
export type StepTense = 'doing' | 'done';

/**
 * Where a step works, with the name a person sees for it. `connected` is one
 * search across several connected systems; a search of one system takes that
 * system's own key. `engine` is a claim that the tool computes its result
 * deterministically: made per tool in the register, checked by the CI gate,
 * and overridden at run time when the step's generation capture saw a model.
 */
export const STEP_SOURCES = {
  vault: 'Vault',
  data_room: 'Data Room',
  authoring: 'Authoring',
  submissions: 'Submission Center',
  qms: 'Quality',
  reports: 'Reports',
  project: 'Project',
  agency: 'Agency databases',
  literature: 'Literature',
  knowledge: 'Regulatory knowledge',
  connected: 'Connected systems',
  google_drive: 'Google Drive',
  box: 'Box',
  onedrive: 'OneDrive',
  sharepoint: 'SharePoint',
  veeva_vault: 'Veeva Vault',
  mailbox: 'Mailbox',
  web: 'Web',
  screen: 'Screen',
  plan: 'Plan',
  engine: 'Engine',
} as const;

export type StepSource = keyof typeof STEP_SOURCES;

/**
 * The input fields a step may preview. Human words only: an id field can never
 * reach a row because no id field is on this list. `queries[0]` is the first
 * of a multi-search. `@documentTitle` is not an input field: it asks for the
 * Vault title the stream resolved for the step's document id, within the open
 * project, and names the document in the label.
 */
export const STEP_PREVIEW_FIELDS = [
  'query',
  'queries[0]',
  'title',
  'section',
  'sequence',
  'folder',
  'topic',
  'term',
  'objective',
  '@documentTitle',
] as const;

export type StepPreviewField = (typeof STEP_PREVIEW_FIELDS)[number];

/** What a step's details may state. Values come from allow-listed fields only. */
export const STEP_FACT_NAMES = [
  'Searched for',
  'Document',
  'Section',
  'Sequence',
  'Folder',
  'Found',
  'Pages',
  'Characters read',
  'Systems searched',
  'Systems not searched',
  'Took',
  'Model',
] as const;

export type StepFactName = (typeof STEP_FACT_NAMES)[number];

export interface StepFact {
  name: StepFactName;
  value: string;
}

/** A tool's presentation entry, as the register's `present` block holds it. */
export interface StepPresentationEntry {
  verb: StepVerb;
  /** What the verb acts on, as a person reads it: "the Vault", "the eCTD package". */
  object: string;
  source: StepSource;
  /** Input fields to preview, first present one wins; `@documentTitle` names the object instead. */
  preview?: StepPreviewField[];
}

/** A step no entry describes. Never its tool name. */
export const UNKNOWN_STEP: StepPresentationEntry = { verb: 'run', object: 'a step', source: 'project' };

/** "Searching the Vault" / "Searched the Vault". */
export function stepLabel(verb: StepVerb, object: string, tense: StepTense): string {
  return `${STEP_VERBS[verb][tense]} ${object}`;
}

/** The label of a step nothing describes, in the tense asked for. */
export function unknownStepLabel(tense: StepTense): string {
  return stepLabel(UNKNOWN_STEP.verb, UNKNOWN_STEP.object, tense);
}

/** The fact that says a model wrote part of a step's result (generation-capture.ts). */
export const MODEL_FACT: StepFact = { name: 'Model', value: 'a model wrote part of this result' };

/**
 * How long one step took: "340 ms" under a second, "2.4s" above it. One
 * format for the server's "Took" fact and the client's own measured duration,
 * so a live row and a reopened one say it the same way.
 */
export function formatStepDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}
