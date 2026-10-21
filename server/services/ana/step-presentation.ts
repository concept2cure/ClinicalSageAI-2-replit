/**
 * How one step of AnA's work is presented: its label in the right tense, its
 * source, a preview of what it was asked, the facts its details state, and the
 * sentence that says how a step that did not succeed ended (ANA-SUMMARY S3,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §2.3, §2.6).
 *
 * ── One table ────────────────────────────────────────────────────────────────
 * There were two label tables, 88 entries on the server and 19 on the client,
 * and 519 of the 608 in-scope tools were in neither: they reached the screen
 * as their own name, humanised ("Validate ectd package"), in the present tense
 * whether they were running or long finished. Every tool's presentation now
 * lives in its register entry (`present`, tool-authorization.register.json),
 * built from the closed verb and source tables in shared/ana/step-verbs.ts. A
 * tool with no entry reads "Running a step" / "Ran a step", never its name;
 * for in-scope tools ci:step-presentation makes that fallback unreachable.
 *
 * ── What reaches a row ───────────────────────────────────────────────────────
 * Only what this module builds. Never the raw input, never the raw result,
 * never a tool name or an id:
 *   - the preview is one allow-listed input field (STEP_PREVIEW_FIELDS), 80
 *     characters at most, dropped when it looks like a uuid or a long hex
 *     string;
 *   - facts are allow-listed numeric fields of the result, the Vault's own
 *     document title, the connected systems searched and not, the duration
 *     the server measured, and whether a model wrote part of the result.
 *     `summarizeToolResult` is not used: it keeps ids on purpose and passes
 *     error text through.
 *
 * ── Tense ────────────────────────────────────────────────────────────────────
 * A finished step reads in the done form only when it succeeded. A step that
 * failed, was held back, or refused (`ok: false`, refusalOf) keeps the doing
 * form beside its status sentence: "Validated the eCTD package" over a validation that
 * never completed would be a claim the record does not support.
 *
 * Pure except `resolveStepDocumentTitles`, which runs the one title query.
 *
 * @module server/services/ana/step-presentation
 */

import {
  MODEL_FACT,
  UNKNOWN_STEP,
  formatStepDuration,
  stepLabel,
  type StepFact,
  type StepPresentationEntry,
  type StepPreviewField,
  type StepSource,
  type StepTense,
} from '@shared/ana/step-verbs';
import type { StepStatus } from '@shared/ana/turn-timeline';
import { stepPresentationOf } from './tool-authorization.js';
import { agentEndedByHoldExpiry, agentResultSummary } from './sub-agent-result.js';
import { refusalOf } from './tool-trace.js';
import type { ToolContext } from './AnaToolExecutor.js';
import { requireProgramScopeStillCurrent } from '../c2c/current-program-access.js';

// How a step ended is the timeline's StepStatus ('incomplete': a sub-agent that stopped before
// finishing its brief). This module declared an identical copy until 2026-10-15.

export interface StepOutcome {
  status: StepStatus;
  /** A person's no, no answer, or an action only a person may take. */
  heldBack?: boolean;
  /** The handler's result string, read for allow-listed fields only. */
  result?: string | null;
  /** Handler dispatch to result, measured by the server. */
  latencyMs?: number;
  /** The step's generation capture saw a model generation; null when unknown. */
  usedModel?: boolean | null;
}

export interface PresentedStep {
  source: StepSource;
  /** Doing form while running; done form once it succeeded. */
  label: string;
  /** The doing form, for the status sentence. */
  doing: string;
  preview: string | null;
  facts: StepFact[];
}

/** Vault document id → its title, for the round's steps (resolveStepDocumentTitles). */
export type StepDocumentTitles = ReadonlyMap<string, string>;

const PREVIEW_MAX = 80;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const LONG_HEX = /\b[0-9a-f]{16,}\b/i;
/** The fields whose preview is what was searched for. */
const SEARCHED_FOR: ReadonlySet<StepPreviewField> = new Set(['query', 'queries[0]', 'term', 'topic']);
/** Fields whose preview is named as its own fact. */
const NAMED_FIELD_FACT: Partial<Record<StepPreviewField, StepFact['name']>> = {
  section: 'Section',
  sequence: 'Sequence',
  folder: 'Folder',
};

/**
 * One line of human words, or null. A value that looks like an id is dropped
 * whole, never shortened into a fragment of one; a double quote becomes a
 * single one so the client's split on a quoted object stays true.
 */
export function cleanStepText(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  // eslint-disable-next-line no-control-regex
  const text = String(value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/"/g, "'");
  if (!text || UUID.test(text) || LONG_HEX.test(text)) return null;
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1).trimEnd()}…` : text;
}

function fieldValue(input: Record<string, unknown>, field: StepPreviewField): unknown {
  if (field !== 'queries[0]') return input[field];
  const first = Array.isArray(input.queries) ? input.queries[0] : undefined;
  return first && typeof first === 'object' ? (first as { query?: unknown }).query : first;
}

/** The step's Vault document id, when its entry names the document. */
export function stepDocumentId(entry: StepPresentationEntry, input: Record<string, unknown>): string | null {
  if (!entry.preview?.includes('@documentTitle')) return null;
  const id = input.document_id;
  return typeof id === 'string' && UUID.test(id) ? id : null;
}

function asInput(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function parseResult(result: string | null | undefined): Record<string, unknown> | null {
  if (!result) return null;
  try {
    const parsed: unknown = JSON.parse(result);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Succeeded, and did not answer that it did not do the thing: the one
 * judgment of a refusal (tool-trace.ts refusalOf), so a check whose `ok` is
 * its finding reads "Checked", and a refusal never reads done.
 */
function finishedDone(outcome: StepOutcome | undefined): boolean {
  if (!outcome || outcome.status !== 'success' || outcome.heldBack) return false;
  return !(outcome.result && refusalOf(outcome.result));
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * "Found" from the first allow-listed count the result carries; none when it
 * carries none. A listing's page is not its answer: where a result carries
 * both its `documents` page and the scope's `total`, the total is the count
 * (list_project_documents caps the page at 100).
 */
function foundFact(r: Record<string, unknown>): StepFact | null {
  if (typeof r.totalMatches === 'number') return { name: 'Found', value: plural(r.totalMatches, 'match', 'matches') };
  if (typeof r.resultCount === 'number') return { name: 'Found', value: plural(r.resultCount, 'result', 'results') };
  if (Array.isArray(r.results)) return { name: 'Found', value: plural(r.results.length, 'result', 'results') };
  if (Array.isArray(r.documents)) {
    const n = typeof r.total === 'number' && r.total >= r.documents.length ? r.total : r.documents.length;
    return { name: 'Found', value: plural(n, 'document', 'documents') };
  }
  // The Vault search returns its matched documents as `hits`.
  if (Array.isArray(r.hits)) return { name: 'Found', value: plural(r.hits.length, 'document', 'documents') };
  return null;
}

function readSpanFact(r: Record<string, unknown>): StepFact | null {
  const w = r.window as { start?: unknown; end?: unknown } | undefined;
  if (!w || typeof w.start !== 'number' || typeof w.end !== 'number' || w.end < w.start) return null;
  const of = typeof r.totalChars === 'number' ? ` of ${r.totalChars.toLocaleString('en-US')}` : '';
  return { name: 'Characters read', value: `${(w.end - w.start).toLocaleString('en-US')}${of}` };
}

/** Names a person reads for the connected systems; anything else is "another system". */
const SYSTEM_NAMES: Readonly<Record<string, string>> = {
  google_drive: 'Google Drive',
  box: 'Box',
  onedrive: 'OneDrive',
  sharepoint: 'SharePoint',
  veeva_vault: 'Veeva Vault',
  pubmed: 'PubMed',
  fda_drugs: 'Drugs@FDA',
  clinical_trials_gov: 'ClinicalTrials.gov',
  ema: 'EMA',
  eudamed: 'EUDAMED',
  ctis: 'EU CTIS',
  grants_gov: 'Grants.gov',
};
const systemName = (id: unknown) => (typeof id === 'string' && SYSTEM_NAMES[id]) || 'another system';

/**
 * Why a system was not searched, in words for the person. The search's own
 * reasons name tools and say "credentials"; a connector's error is its own
 * text. Neither is shown: each maps to one of these, and anything unrecognised
 * reads as the search having failed.
 */
function whyNotSearched(reason: unknown): string {
  const r = typeof reason === 'string' ? reason : '';
  if (r.startsWith('not connected')) return 'not connected for your organisation';
  if (r.startsWith('credentials invalid')) return 'its connection needs attention';
  if (r.startsWith("not one of the organisation's document repositories")) return 'not one of your document repositories';
  if (r === 'unknown connector') return 'not a system this search knows';
  if (r.startsWith('no search is connected')) return 'no search is available for it';
  return 'the search did not complete';
}

function connectedFacts(r: Record<string, unknown>): StepFact[] {
  const facts: StepFact[] = [];
  const searched = Array.isArray(r.searched) ? r.searched : [];
  const skipped = Array.isArray(r.skipped) ? (r.skipped as Array<{ connector?: unknown; reason?: unknown }>) : [];
  if (searched.length > 0) facts.push({ name: 'Systems searched', value: searched.map(systemName).join(', ') });
  if (skipped.length > 0) {
    facts.push({
      name: 'Systems not searched',
      value: skipped.map(s => `${systemName(s?.connector)} (${whyNotSearched(s?.reason)})`).join('; '),
    });
  }
  return facts;
}

/** The connected search reads as the one system it searched, or as several. */
const CONNECTED_TOOL = 'search_connected_repositories';
const REPOSITORY_SOURCES: ReadonlySet<string> = new Set(['google_drive', 'box', 'onedrive', 'sharepoint', 'veeva_vault']);
function connectedSource(input: Record<string, unknown>, parsed: Record<string, unknown> | null): StepSource {
  const list = parsed && Array.isArray(parsed.searched) ? parsed.searched : Array.isArray(input.connectors) ? input.connectors : [];
  const ids = [...new Set(list.map(v => String(v).toLowerCase().replace(/[\s-]+/g, '_')))];
  return ids.length === 1 && REPOSITORY_SOURCES.has(ids[0]) ? (ids[0] as StepSource) : 'connected';
}

interface Previewed {
  preview: string | null;
  field: StepPreviewField | null;
}

function previewOf(entry: StepPresentationEntry, input: Record<string, unknown>): Previewed {
  for (const field of entry.preview ?? []) {
    if (field === '@documentTitle') continue;
    const text = cleanStepText(fieldValue(input, field));
    if (text) return { preview: text, field };
  }
  return { preview: null, field: null };
}

function resultFacts(tool: string, entry: StepPresentationEntry, r: Record<string, unknown>): StepFact[] {
  const facts: StepFact[] = [];
  if (entry.preview?.includes('@documentTitle')) {
    const title = cleanStepText(r.documentTitle);
    if (title) facts.push({ name: 'Document', value: title });
  }
  const found = foundFact(r);
  if (found) facts.push(found);
  if (typeof r.pageCount === 'number') facts.push({ name: 'Pages', value: r.pageCount.toLocaleString('en-US') });
  const span = readSpanFact(r);
  if (span) facts.push(span);
  if (tool === CONNECTED_TOOL) facts.push(...connectedFacts(r));
  return facts;
}

function inputFacts(previewed: Previewed, title: string | null): StepFact[] {
  const facts: StepFact[] = [];
  if (title) facts.push({ name: 'Document', value: title });
  if (previewed.preview && previewed.field) {
    if (SEARCHED_FOR.has(previewed.field)) facts.push({ name: 'Searched for', value: previewed.preview });
    const named = NAMED_FIELD_FACT[previewed.field];
    if (named) facts.push({ name: named, value: previewed.preview });
  }
  return facts;
}

/** One fact per name, first kept: the resolved title and the result's title are the same fact. */
function uniqueFacts(facts: StepFact[]): StepFact[] {
  const seen = new Set<string>();
  return facts.filter(f => (seen.has(f.name) ? false : (seen.add(f.name), true)));
}

/**
 * The one function that builds a step's source, label, preview and facts.
 * Called for the announced step (no outcome) and the finished one.
 */
export function presentStep(
  tool: string,
  rawInput: unknown,
  titles?: StepDocumentTitles | null,
  outcome?: StepOutcome,
): PresentedStep {
  const entry = stepPresentationOf(tool) ?? UNKNOWN_STEP;
  const input = asInput(rawInput);
  const parsed = parseResult(outcome?.result);
  const docId = stepDocumentId(entry, input);
  const title = docId ? cleanStepText(titles?.get(docId)) : null;
  const object = title ? `"${title}"` : entry.object;
  const tense: StepTense = finishedDone(outcome) ? 'done' : 'doing';
  const previewed = previewOf(entry, input);
  const facts = inputFacts(previewed, title);
  if (parsed && outcome) facts.push(...resultFacts(tool, entry, parsed));
  if (outcome && typeof outcome.latencyMs === 'number' && outcome.latencyMs >= 0) {
    facts.push({ name: 'Took', value: formatStepDuration(outcome.latencyMs) });
  }
  if (outcome?.usedModel === true) facts.push(MODEL_FACT);
  return {
    source: tool === CONNECTED_TOOL ? connectedSource(input, parsed) : entry.source,
    label: stepLabel(entry.verb, object, tense),
    doing: stepLabel(entry.verb, object, 'doing'),
    preview: previewed.preview,
    facts: uniqueFacts(facts),
  };
}

interface StepCall {
  name: string;
  input?: unknown;
}

/** What an announced step's `tool_use` frame says about it. */
export function announcedStepFields(call: StepCall, titles: StepDocumentTitles | null) {
  const p = presentStep(call.name, call.input ?? {}, titles);
  return { label: p.label, source: p.source, preview: p.preview, facts: p.facts };
}

/**
 * A finished step: what its `tool_result` frame says, the sentence for a step
 * that did not succeed, and the presentation the trace keeps so a reopened
 * turn reads the same. `why` is the run's reason for a held step (declined,
 * no answer, or the person's own act).
 */
export function finishedStep(
  call: StepCall,
  titles: StepDocumentTitles | null,
  outcome: StepOutcome & { why?: string },
) {
  const p = presentStep(call.name, call.input ?? {}, titles, outcome);
  // An agent says in its own words why it stopped: the sentence the live frame
  // carries and the one a reopened turn reads come from the same result, so the
  // two can never describe the step differently.
  const why = agentWhy(outcome) ?? outcome.why;
  const message = stepMessage(outcome.status, outcome.heldBack === true, why, p.doing);
  const usedModel = outcome.usedModel ?? null;
  const shown = { source: p.source, preview: p.preview, facts: p.facts, usedModel, ...(message ? { message } : {}) };
  return { label: p.label, doing: p.doing, message, frame: { label: p.label, ...shown }, trace: shown };
}

/**
 * Why an agent step ended, from the agent's own result: the summary for a
 * budget stop, and the pause ceiling where that, not a person, ended it.
 * Null for every other step and status.
 */
function agentWhy(outcome: StepOutcome & { why?: string }): string | undefined {
  if (!outcome.result) return undefined;
  if (outcome.status === 'incomplete') return agentResultSummary(outcome.result);
  if (outcome.status === 'cancelled' && agentEndedByHoldExpiry(outcome.result)) {
    return 'the run stayed paused past its limit';
  }
  return undefined;
}

/**
 * The one place a step's status sentence is written (§2.6). `doing` is the
 * step's doing-form label; the sentence reads correctly after the fact, so the
 * live transcript and a reopened record say the same thing. Null for a step
 * that succeeded: it needs no sentence.
 *
 * `why` is the run's reason for a held step, and for an agent that stopped at
 * a budget it is that agent's one-line summary (finishedStep reads it from the
 * result). An incomplete step is NOT reported as a failure: what it found
 * stands, and the next round is not told to work around it.
 */
export function stepMessage(
  status: StepStatus,
  heldBack: boolean,
  why: string | undefined,
  doing: string,
): string | null {
  const step = doing.charAt(0).toLowerCase() + doing.slice(1);
  const Step = doing.charAt(0).toUpperCase() + doing.slice(1);
  if (heldBack) {
    if (why === 'declined') return `You declined ${step}, so it did not run.`;
    return `${Step} did not run: it needs a person's authorisation${why ? ` (${why})` : ''}.`;
  }
  if (status === 'error') return `AnA couldn't finish ${step} and continued without it.`;
  if (status === 'not_found') return `${Step} isn't available here, so AnA continued without it.`;
  // A cancelled step is the person's Stop unless the caller says what else
  // ended it: a pause nobody answered is not something they did.
  if (status === 'cancelled') return why ? `${Step} was ended because ${why}.` : `You stopped ${step} before it finished.`;
  if (status === 'not_run') return `${Step} did not run because the turn stopped first.`;
  if (status === 'incomplete') return `The agent's result is incomplete: ${why ?? step}.`;
  return null;
}

/**
 * Whether a step's handler ran a model, from its generation capture: true when
 * the capture noted a generation, false when it noted none, null when the
 * handler ran elsewhere (a person settled it in the governed-action route) and
 * so is unknown. A step whose handler never ran used no model.
 */
export function stepUsedModel(
  capture: { calls: number } | null,
  ranElsewhere: boolean,
): boolean | null {
  if (capture) return capture.calls > 0;
  return ranElsewhere ? null : false;
}

type TitleScopeContext = Pick<ToolContext, 'organizationId' | 'userId' | 'projectId' | 'projectRef' | 'sqlClient'>;
type TitleReadScope = Exclude<Awaited<ReturnType<typeof import('./catalog-scope.js').catalogScope>>, { error: string }>;

interface TitleRow { id: string; document_title: string | null; organization_id: number; program_id: string; }
interface TitleDeps {
  query?: (sql: string, params: unknown[]) => Promise<{ rows: TitleRow[] }>;
  scope?: (ctx: TitleScopeContext, orgId: number) => Promise<TitleReadScope | { error: string }>;
  /** Explicit test seam for authority revalidation; never supplied by a model. */
  revalidate?: (scope: import('./source-read-scope.js').AdmittedAnaSourceReadScope) => Promise<void>;
  recheck?: typeof requireProgramScopeStillCurrent;
}

function titleActorReady(ctx: TitleScopeContext): ctx is TitleScopeContext & { organizationId: number; userId: number } {
  return Number.isSafeInteger(ctx.organizationId) && Number(ctx.organizationId) > 0 &&
    Number.isSafeInteger(ctx.userId) && Number(ctx.userId) > 0;
}
function titleScopeMatches(scope: import('./source-read-scope.js').AdmittedAnaSourceReadScope, ctx: TitleScopeContext): boolean {
  return Boolean(scope && scope.organizationId === ctx.organizationId && scope.userId === ctx.userId);
}
function titleReadScopeReady(scope: TitleReadScope, ctx: TitleScopeContext): boolean {
  return Boolean(titleScopeMatches(scope.admittedScope, ctx) && scope.executor && scope.accessibleScope &&
    scope.programId === scope.admittedScope.programId &&
    scope.accessibleScope.actor.userId === scope.admittedScope.userId &&
    scope.accessibleScope.actor.role === scope.admittedScope.role &&
    scope.admittedScope.accessibleProgramIds.every(id => scope.accessibleScope.programIds.includes(id)));
}
function titleRowAllowed(row: TitleRow, orgId: number, programs: readonly string[], ids: readonly string[]): boolean {
  return row.organization_id === orgId && programs.includes(row.program_id) && ids.includes(row.id);
}

async function titleQuery(ids: readonly string[], orgId: number, scope: TitleReadScope) {
  const { vaultDataEligibleSql } = await import('../document-data-disposition/eligibility.js');
  const programClause = scope.programId ? ' AND d.program_id = $4::uuid' : '';
  const sql =
    `SELECT d.id::text AS id, d.document_title, d.organization_id, d.program_id::text AS program_id FROM vault.documents d
      WHERE d.id = ANY($1::uuid[]) AND d.organization_id=$2 AND d.program_id = ANY($3::uuid[])
        AND d.deleted_at IS NULL AND ${vaultDataEligibleSql('d')}${programClause}
        AND EXISTS (SELECT 1 FROM regulatory_programs rp WHERE rp.id = d.program_id AND rp.organization_id = $2 AND rp.deleted_at IS NULL)`;
  const params = [ids, orgId, [...scope.admittedScope.accessibleProgramIds], ...(scope.programId ? [scope.programId] : [])];
  return { sql, params };
}

async function currentTitleRows(ids: readonly string[], orgId: number, scope: TitleReadScope, deps: TitleDeps): Promise<TitleRow[]> {
  // Keep both admissions on the request executor. The canonical source scope
  // can be stricter after counting all anchors; the upstream grant cannot widen it.
  const { revalidateAnaSourceReadScope } = await import('./source-read-scope.js');
  const revalidate: NonNullable<TitleDeps['revalidate']> = deps.revalidate ??
    (pinned => revalidateAnaSourceReadScope(scope.executor, pinned).then(() => undefined));
  if (deps.query && (!deps.revalidate || !deps.recheck)) return [];
  await revalidate(scope.admittedScope);
  const { sql, params } = await titleQuery(ids, orgId, scope);
  const { rows } = await (deps.query ?? ((text, values) => scope.executor.query(text, values)))(sql, params);
  await (deps.recheck ?? requireProgramScopeStillCurrent)(scope.executor, {
    organizationId: orgId, userId: scope.accessibleScope.actor.userId, programId: scope.programId,
  }, scope.accessibleScope);
  await revalidate(scope.admittedScope);
  return rows as TitleRow[];
}

/**
 * The Vault titles of the round's documents, resolved before the steps are
 * announced so a read names its document from the start. One query, scoped the
 * way the handler scopes its read: the current actor's accessible programmes,
 * constrained to the open project when one is open. A document of another project, another
 * organisation, a deleted one or one whose data was removed gets no title, and
 * a scope that refuses (a project with no program) gets none at all.
 */
export async function resolveStepDocumentTitles(
  calls: ReadonlyArray<{ name: string; input: unknown }>,
  ctx: TitleScopeContext,
  deps: TitleDeps = {},
): Promise<StepDocumentTitles> {
  const ids = [
    ...new Set(
      calls
        .map(c => {
          const entry = stepPresentationOf(c.name);
          return entry ? stepDocumentId(entry, asInput(c.input)) : null;
        })
        .filter((id): id is string => id !== null),
    ),
  ];
  if (ids.length === 0 || !titleActorReady(ctx)) return new Map();
  const orgId = ctx.organizationId;
  try {
    const scope = await (deps.scope ?? defaultScope)(ctx, orgId);
    if ('error' in scope) return new Map();
    if (!titleReadScopeReady(scope, ctx)) return new Map();
    const rows = await currentTitleRows(ids, orgId, scope, deps);
    const titles = new Map<string, string>();
    for (const row of rows) {
      if (!titleRowAllowed(row, orgId, scope.admittedScope.accessibleProgramIds, ids)) return new Map();
      const title = cleanStepText(row.document_title);
      if (title && typeof row.id === 'string') titles.set(row.id, title);
    }
    return titles;
  } catch {
    // A title is presentation: without it the step reads "Reading a Vault document".
    return new Map();
  }
}

async function defaultScope(ctx: TitleScopeContext, orgId: number) {
  const { catalogScope } = await import('./catalog-scope.js');
  return catalogScope(ctx, orgId, null, 'read');
}
