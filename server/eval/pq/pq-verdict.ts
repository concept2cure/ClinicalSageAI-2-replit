/**
 * Performance-qualification verdicts, and the check that a registry entry's
 * claimed PQ is backed by a real record.
 *
 * Pure: no gateway, no filesystem except through the reader it is handed. Every
 * route to PASS is therefore testable without a model, which is the point — a
 * PQ verdict that has only ever been seen to come out one way has not been
 * tested (server/eval/pq/__tests__/pq-verdict.test.ts).
 *
 * The rules, in the order they are applied:
 *   1. Nothing executed                               → NOT_EXECUTED
 *   2. A required component could not be executed,
 *      or is executable but was not run, scored
 *      nothing, has no step here that measures it,
 *      carries a malformed or inconsistent record,
 *      or has criteria this verdict cannot apply      → INCOMPLETE
 *   3. Fewer tasks than the protocol's sample floor   → INCOMPLETE
 *   4. Any task whose served model is not the pinned
 *      version, or could not be verified              → INCOMPLETE
 *   5. Any criterion missed                           → FAIL
 *   6. The protocol is not approved                   → INCOMPLETE ("criteria met, but not approved criteria")
 *   7. Otherwise                                      → PASS
 *
 * FAIL is decided before the approval check on purpose: a model that misses a
 * draft criterion has failed something real, and hiding that behind "the
 * criteria are not approved yet" would report a known shortfall as pending.
 */

export type PqVerdict = 'PASS' | 'FAIL' | 'INCOMPLETE' | 'NOT_EXECUTED';

export interface PqComponentProtocol {
  required: boolean;
  executable: boolean;
  notExecutableReason?: string;
  criteria: Record<string, number>;
  criteriaSource: string;
}

export interface PqProtocol {
  protocolId: string;
  version: string;
  status: 'draft' | 'approved';
  approvedBy: string | null;
  approvedOn: string | null;
  components: Record<string, PqComponentProtocol>;
}

/** One generation task as it actually ran. */
export interface PqGenerationResult {
  taskId: string;
  docType: string;
  /** What the provider reported serving (GatewayResponse.resolvedModel). */
  servedModel: string | null;
  /** True only when servedModel is present and is the pinned version. */
  servedModelVerified: boolean;
  sectionCoverage: number | null;
  forbiddenHits: number | null;
  /** Set when the task could not produce a scorable output. */
  error?: string;
}

/** One extraction task as it actually ran. Same attribution rules as generation. */
export interface PqExtractionResult {
  taskId: string;
  docType: string;
  servedModel: string | null;
  servedModelVerified: boolean;
  /** null when the task produced nothing scorable (no reply, or unparseable). */
  f1: number | null;
  precision: number | null;
  recall: number | null;
  error?: string;
}

/**
 * One rag gold item as it actually ran. Same attribution rules as generation:
 * the item counts toward the pinned model's scores only when the model that
 * answered is verifiably the pinned version.
 */
export interface PqRagResult {
  /** The gold item's id. Distinct within a record: the sample floor counts items, not rows. */
  itemId: string;
  /**
   * True when the gold item is a designed negative control — a question the
   * corpus does not answer, which names no expected source BY DESIGN. Declared
   * by the runner from the gold set, never inferred from missing scores: a
   * positive item with no hit is a gold item nobody keyed, or whose
   * document_code + version key did not resolve, and reading it as a control
   * would drop it from the run without a word.
   */
  negativeControl: boolean;
  /** What the provider reported serving for the answer's generation call. */
  servedModel: string | null;
  servedModelVerified: boolean;
  /**
   * 1 when an expected source document was retrieved within k, 0 when none
   * was. null only on a negative control; on a positive item it is INCOMPLETE.
   */
  hit: number | null;
  /**
   * The judge's 0–1 faithfulness score; null when nothing was judged. A
   * positive item with no score and no error is INCOMPLETE: an answer the
   * runner did not judge (a grounded refusal included) must be recorded as an
   * error saying why, or the run could drop its hardest items by not judging
   * them.
   */
  faithfulness: number | null;
  /** Set when the item could not produce a scorable output. */
  error?: string;
}

/**
 * The rag component as the runner recorded it.
 *
 * `ran: false` is a record saying the component was not run — with the
 * runner's reason — rather than silence. An absent field and `ran: false`
 * mean the same thing to the verdict; the explicit form exists so the record
 * itself says it. Anything but the boolean `true` is not a run.
 */
export interface PqRagRecord {
  ran: boolean;
  notRunReason?: string;
  /**
   * Items with at least one score (hit or faithfulness) and no error. The
   * verdict recomputes this from `items` and treats a disagreement as an
   * inconsistent record, never as evidence.
   */
  itemsScored: number;
  items: PqRagResult[];
}

export interface PqVerdictResult {
  verdict: PqVerdict;
  reasons: string[];
}

/**
 * Whether the model that answered is the model being qualified.
 *
 * Providers report dated snapshots (`gpt-4o-2024-08-06` for `gpt-4o`), so the
 * pinned version is matched as a prefix on a `-` boundary — never as a bare
 * substring, which would let `gpt-4o-mini` pass for `gpt-4o`.
 */
export function servedModelMatches(served: string | null | undefined, pinnedVersion: string): boolean {
  if (!served) return false;
  if (served === pinnedVersion) return true;
  if (!served.startsWith(`${pinnedVersion}-`)) return false;
  // Only a date-shaped suffix counts as the same model: `-2024-08-06`, `-20250514`.
  return /^-(\d{8}|\d{4}-\d{2}-\d{2})$/.test(served.slice(pinnedVersion.length));
}

/** Required components the protocol declares but that cannot run yet. */
function unexecutableComponents(protocol: PqProtocol): string[] {
  return Object.entries(protocol.components)
    .filter(([, c]) => c.required && !c.executable)
    .map(([name, c]) => `required component "${name}" cannot be executed yet: ${c.notExecutableReason ?? 'no reason recorded'}`);
}

/**
 * Components `computeVerdict` has a step for. A required, executable component
 * outside this set is INCOMPLETE: the verdict used to measure only the
 * components it knew by name, so any other executable component — rag, until
 * this change — dropped out of the verdict by omission and a PQ could PASS
 * without it (D4 evidence docs/evidence/D4/2026-09-28-pq-rag-unblock-misdescribed/, E6).
 */
const MEASURED_COMPONENTS = new Set(['generation', 'extraction', 'rag']);

function unmeasuredComponents(protocol: PqProtocol): string[] {
  return Object.entries(protocol.components)
    .filter(([name, c]) => c.required && c.executable && !MEASURED_COMPONENTS.has(name))
    .map(([name]) => `required component "${name}" is executable, but this verdict has no step that measures it`);
}

/** Tasks that produced nothing, or were answered by a model that is not the one under qualification. */
function taskShortfalls(generation: PqGenerationResult[], scored: PqGenerationResult[]): string[] {
  const out: string[] = [];
  const errored = generation.filter((g) => g.error);
  if (errored.length) {
    out.push(`${errored.length} generation task(s) produced no output: ${errored.map((g) => g.taskId).join(', ')}`);
  }
  const unverified = scored.filter((g) => !g.servedModelVerified);
  if (unverified.length) {
    out.push(
      `${unverified.length} task(s) were answered by a model that is not the pinned version, or did not say: ` +
        unverified.map((g) => `${g.taskId}=${g.servedModel ?? 'unreported'}`).join(', '),
    );
  }
  return out;
}

/** Document types with fewer scored tasks than the protocol's sample floor. */
function sampleShortfall(floor: number | undefined, scored: PqGenerationResult[]): string[] {
  if (typeof floor !== 'number') return [];
  const byDoc = new Map<string, number>();
  for (const g of scored) byDoc.set(g.docType, (byDoc.get(g.docType) ?? 0) + 1);
  const short = [...byDoc].filter(([, n]) => n < floor);
  return short.length
    ? [`sample below the protocol floor of ${floor} per document type: ${short.map(([d, n]) => `${d}=${n}`).join(', ')}`]
    : [];
}

/** Criteria missed, measured only over tasks the pinned model verifiably answered. */
function criteriaMissed(criteria: Record<string, number>, counted: PqGenerationResult[]): string[] {
  const out: string[] = [];
  const minCov = criteria.minSectionCoverage;
  if (typeof minCov === 'number' && counted.length) {
    const meanCov = counted.reduce((a, g) => a + (g.sectionCoverage as number), 0) / counted.length;
    if (meanCov < minCov) out.push(`mean section coverage ${meanCov.toFixed(3)} is below ${minCov}`);
  }
  const maxForbidden = criteria.maxForbiddenHits;
  if (typeof maxForbidden === 'number') {
    const hits = counted.reduce((a, g) => a + (g.forbiddenHits as number), 0);
    if (hits > maxForbidden) out.push(`${hits} forbidden / overclaim phrase(s); the protocol allows ${maxForbidden}`);
  }
  return out;
}

/**
 * The extraction component's shortfalls and missed criteria.
 *
 * Mirrors generation deliberately: a task that produced nothing is a shortfall,
 * a task answered by another model is a shortfall, and the criterion is
 * measured only over tasks the pinned model verifiably answered — otherwise a
 * fallback model's score would count toward qualifying the pinned one.
 *
 * A component that is required and executable but ran no task is INCOMPLETE,
 * not PASS. Before this, extraction was `executable: false` and so was reported
 * by unexecutableComponents; once it can run, "it did not run" has to be said
 * some other way or a PQ would pass having skipped a required component.
 */
function extractionFindings(
  protocol: PqProtocol,
  extraction: PqExtractionResult[],
): { incomplete: string[]; missed: string[] } {
  const ext = protocol.components.extraction;
  if (!ext?.required || !ext.executable) return { incomplete: [], missed: [] };

  const scored = extraction.filter((e) => !e.error && e.f1 !== null);
  if (scored.length === 0) {
    const errs = extraction.filter((e) => e.error).map((e) => `${e.taskId}: ${e.error}`);
    return {
      incomplete: [
        'required component "extraction" is executable but produced no scorable output',
        ...errs.slice(0, 5),
      ],
      missed: [],
    };
  }

  const incomplete: string[] = [];
  const errored = extraction.filter((e) => e.error);
  if (errored.length) {
    incomplete.push(`${errored.length} extraction task(s) produced no output: ${errored.map((e) => e.taskId).join(', ')}`);
  }
  const unverified = scored.filter((e) => !e.servedModelVerified);
  if (unverified.length) {
    incomplete.push(
      `${unverified.length} extraction task(s) were answered by a model that is not the pinned version, or did not say: ` +
        unverified.map((e) => `${e.taskId}=${e.servedModel ?? 'unreported'}`).join(', '),
    );
  }

  const missed: string[] = [];
  const counted = scored.filter((e) => e.servedModelVerified);
  const minF1 = ext.criteria.minF1;
  if (typeof minF1 === 'number' && counted.length) {
    const meanF1 = counted.reduce((a, e) => a + (e.f1 as number), 0) / counted.length;
    if (meanF1 < minF1) missed.push(`mean extraction F1 ${meanF1.toFixed(3)} is below ${minF1}`);
  }
  return { incomplete, missed };
}

/** A 0–1 score: finite, and in range. NaN never compares below a minimum, so it must never reach a mean. */
const isUnitScore = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** A value as a reason shows it: strings quoted, so "0.6" reads differently from 0.6. */
const shown = (v: unknown): string => (typeof v === 'string' ? JSON.stringify(v) : String(v));

/** A sample floor: a whole number of items, at least one. */
const isFloor = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1;

const hasError = (i: PqRagResult): boolean => typeof i.error === 'string' && i.error.length > 0;

/** Whether an item carries any score at all. A declared control with nothing to judge carries none. */
function ragItemScored(i: PqRagResult): boolean {
  return !hasError(i) && (i.hit !== null || i.faithfulness !== null);
}

/** The rag criteria this verdict applies. A key outside this list is not assessed, so it is INCOMPLETE. */
const RAG_CRITERIA = ['minHitRate', 'minFaithfulness', 'minScoredItems'] as const;

/**
 * Why the protocol's rag criteria cannot be applied as written. Each of these
 * used to be skipped in silence — a missing or string minimum was not checked,
 * and an unknown key (a misspelt floor) was not read — so rag PASSed on any
 * scored item. A criterion that cannot be applied is INCOMPLETE, never met.
 *
 * `minScoredItems` is the sample floor: the fewest distinct items the pinned
 * model verifiably answered on which EACH criterion must be measured. Generation
 * has one (minTasksPerDocType); without one here, one scored item out of a
 * 30-50 item gold set would qualify the component.
 */
function ragCriteriaProblems(criteria: Record<string, unknown> | undefined): string[] {
  const c: Record<string, unknown> = criteria && typeof criteria === 'object' ? criteria : {};
  const out: string[] = [];
  for (const key of Object.keys(c)) {
    if (!(RAG_CRITERIA as readonly string[]).includes(key)) {
      out.push(`rag criterion "${key}" is not one this verdict measures (${RAG_CRITERIA.join(', ')}), so it was not assessed`);
    }
  }
  for (const key of ['minHitRate', 'minFaithfulness'] as const) {
    if (!isUnitScore(c[key])) {
      out.push(`rag criterion ${key} is ${key in c ? shown(c[key]) : 'missing'}, not a number between 0 and 1`);
    }
  }
  const floor = c.minScoredItems;
  if (floor === undefined) {
    out.push('the protocol sets no rag sample floor (criteria.minScoredItems), so no number of scored items could qualify the component');
  } else if (!isFloor(floor)) {
    out.push(`rag criterion minScoredItems is ${shown(floor)}, not a positive whole number`);
  }
  return out;
}

type RawRagItem = Partial<Record<keyof PqRagResult, unknown>>;

/** An item's fields that must be booleans, a model id or a message, and are not. */
function ragItemTypeProblems(i: RawRagItem, name: string): string[] {
  const out: string[] = [];
  if (typeof i.negativeControl !== 'boolean') {
    out.push(`rag item ${name} does not say whether it is a negative control (negativeControl is ${shown(i.negativeControl)})`);
  }
  if (typeof i.servedModelVerified !== 'boolean') {
    out.push(`rag item ${name}: servedModelVerified is ${shown(i.servedModelVerified)}, not true or false`);
  }
  if (i.servedModel !== null && typeof i.servedModel !== 'string') {
    out.push(`rag item ${name}: servedModel is ${shown(i.servedModel)}, not a model id or null`);
  }
  if (i.error !== undefined && !(typeof i.error === 'string' && i.error.length > 0)) {
    out.push(`rag item ${name}: error is ${shown(i.error)}, not a message`);
  }
  return out;
}

/** An item's scores that are not 0–1 numbers, and a control that carries a hit. */
function ragItemScoreProblems(i: RawRagItem, name: string): string[] {
  const out: string[] = [];
  for (const k of ['hit', 'faithfulness'] as const) {
    if (i[k] !== null && !isUnitScore(i[k])) out.push(`rag item ${name}: ${k} is ${shown(i[k])}, not a number between 0 and 1`);
  }
  if (i.negativeControl === true && i.hit !== null && i.hit !== undefined) {
    out.push(`the "rag" record is inconsistent: ${name} is a negative control but carries a hit (${shown(i.hit)}); a control names no expected source`);
  }
  return out;
}

/**
 * Why a rag record cannot be read as evidence at all. Checked before anything
 * is counted: a record whose fields are not what they claim to be (a NaN score,
 * a "false" string where a boolean belongs, the same item twice) is not a
 * measurement, and every such value used to count — NaN and 5 as scores, the
 * string "false" as verified.
 */
function ragRecordProblems(items: unknown): string[] {
  if (!Array.isArray(items)) return ['the "rag" record is malformed: items is not a list'];
  const out: string[] = [];
  const seen = new Set<string>();
  const repeated = new Set<string>();
  items.forEach((raw: unknown, n: number) => {
    const i: RawRagItem = raw && typeof raw === 'object' ? raw : {};
    const id = typeof i.itemId === 'string' && i.itemId ? i.itemId : null;
    if (!id) out.push(`rag item #${n + 1} has no itemId`);
    else if (seen.has(id)) repeated.add(id);
    else seen.add(id);
    out.push(...ragItemTypeProblems(i, id ?? `#${n + 1}`), ...ragItemScoreProblems(i, id ?? `#${n + 1}`));
  });
  if (repeated.size) {
    out.push(
      `the "rag" record is inconsistent: item(s) ${[...repeated].join(', ')} appear more than once, ` +
        'and a repeated item is not a distinct measurement',
    );
  }
  return out;
}

/**
 * A rag criterion measured only over the items the pinned model verifiably
 * answered AND that carry this metric. A mean over no item is not a
 * measurement: before this, `mean([])` was 0 in run-eval and would have been
 * read as a FAIL, and a verdict that skipped the criterion instead would have
 * read it as a PASS. Either way nothing was measured, so it is INCOMPLETE — and
 * so is a mean over fewer items than the protocol's sample floor.
 *
 * `min` and `floor` arrive already checked by ragCriteriaProblems; an unusable
 * one is reported there, so this measures nothing rather than guess.
 */
function ragCriterion(
  label: string,
  min: unknown,
  floor: number | undefined,
  counted: PqRagResult[],
  metric: (i: PqRagResult) => number | null,
): { incomplete: string[]; missed: string[] } {
  if (!isUnitScore(min)) return { incomplete: [], missed: [] };
  const values = counted.map(metric).filter((v): v is number => v !== null);
  if (values.length === 0) {
    return {
      incomplete: [`${label} was measured on 0 items the pinned model verifiably answered, so the criterion ${min} was not assessed`],
      missed: [],
    };
  }
  const incomplete =
    floor !== undefined && values.length < floor
      ? [`${label} was measured on ${values.length} item(s) the pinned model verifiably answered; the protocol's sample floor is ${floor}`]
      : [];
  const m = values.reduce((a, v) => a + v, 0) / values.length;
  return { incomplete, missed: m < min ? [`${label} ${m.toFixed(3)} is below ${min}`] : [] };
}

/**
 * Whether a rag record can be measured at all. Returns the reasons it cannot —
 * not run, malformed, nothing scored, an itemsScored the items contradict — or
 * null when it can. Any of these makes the component INCOMPLETE on its own.
 */
function ragRecordRefusal(rag: PqRagRecord | undefined): string[] | null {
  if (rag && typeof rag.ran !== 'boolean') return [`the "rag" record is malformed: ran is ${shown(rag.ran)}, not true or false`];
  if (!rag || rag.ran !== true) {
    const why = rag?.notRunReason ? `: ${rag.notRunReason}` : ' (the record carries no rag results)';
    return [`required component "rag" is executable but was not run${why}`];
  }
  const recordProblems = ragRecordProblems(rag.items);
  if (recordProblems.length) return recordProblems;
  const scored = rag.items.filter(ragItemScored);
  if (scored.length === 0) {
    const errs = rag.items.filter(hasError).map((i) => `${i.itemId}: ${i.error}`);
    return ['required component "rag" is executable but scored no item', ...errs.slice(0, 5)];
  }
  if (rag.itemsScored !== scored.length) {
    return [`the "rag" record is inconsistent: it says itemsScored ${shown(rag.itemsScored)}, but ${scored.length} item(s) carry a score`];
  }
  return null;
}

/** Items that produced nothing, positive items missing a score, and items another model answered. */
function ragItemShortfalls(items: PqRagResult[]): string[] {
  const out: string[] = [];
  const ids = (xs: PqRagResult[]) => xs.map((i) => i.itemId).join(', ');
  const errored = items.filter(hasError);
  if (errored.length) out.push(`${errored.length} rag item(s) produced no output: ${ids(errored)}`);
  const answered = items.filter((i) => !hasError(i));
  const unkeyed = answered.filter((i) => !i.negativeControl && i.hit === null);
  if (unkeyed.length) {
    out.push(`rag item(s) ${ids(unkeyed)} are not negative controls but name no resolved expected source, so hit rate cannot be scored on them`);
  }
  const unjudged = answered.filter((i) => !i.negativeControl && i.faithfulness === null);
  if (unjudged.length) out.push(`positive rag item(s) ${ids(unjudged)} were not judged for faithfulness and carry no error`);
  const unverified = answered.filter((i) => !i.servedModelVerified);
  if (unverified.length) {
    out.push(
      `${unverified.length} rag item(s) were answered by a model that is not the pinned version, or did not say: ` +
        unverified.map((i) => `${i.itemId}=${i.servedModel ?? 'unreported'}`).join(', '),
    );
  }
  return out;
}

/**
 * The rag component's shortfalls and missed criteria — the step E6 found
 * missing. It mirrors extractionFindings, with differences that come from how
 * rag is scored:
 *
 *   - A rag component that is required and executable but NOT RUN is
 *     INCOMPLETE. run-pq has no rag phase yet, so today that is every record;
 *     without this step, flipping `components.rag.executable` to true would have
 *     let an approved protocol PASS with rag never executed.
 *   - Each criterion must itself have been measured, on at least the protocol's
 *     sample floor of items. An item carries a hit only when it names an
 *     expected source, and a faithfulness score only when something was
 *     retrieved and judged, so a run can score items while measuring one
 *     criterion on none of them (the gold set's empty expectedSourceIds, E4;
 *     empty retrieval, E5), or on one.
 *   - Negative controls are declared on the item, never inferred. A positive
 *     item with no hit, or with no faithfulness and no error, is named.
 *   - The record and the criteria are checked before anything is counted.
 *
 * When rag is not required, or not executable, this returns nothing — the
 * verdict is exactly what it was, and unexecutableComponents still names rag.
 */
function ragFindings(protocol: PqProtocol, rag: PqRagRecord | undefined): { incomplete: string[]; missed: string[] } {
  const c = protocol.components.rag;
  if (!c?.required || !c.executable) return { incomplete: [], missed: [] };

  const criteriaProblems = ragCriteriaProblems(c.criteria);
  const refusal = ragRecordRefusal(rag);
  if (refusal || !rag) return { incomplete: [...(refusal ?? []), ...criteriaProblems], missed: [] };

  const floor = isFloor(c.criteria.minScoredItems) ? c.criteria.minScoredItems : undefined;
  const counted = rag.items.filter((i) => !hasError(i) && i.servedModelVerified);
  const hit = ragCriterion('rag hit rate', c.criteria.minHitRate, floor, counted.filter((i) => !i.negativeControl), (i) => i.hit);
  // Faithfulness counts every judged item, controls included, as run-eval scores it.
  const faith = ragCriterion('rag faithfulness', c.criteria.minFaithfulness, floor, counted, (i) => i.faithfulness);
  return {
    incomplete: [...ragItemShortfalls(rag.items), ...criteriaProblems, ...hit.incomplete, ...faith.incomplete],
    missed: [...hit.missed, ...faith.missed],
  };
}

function isApproved(protocol: PqProtocol): boolean {
  return protocol.status === 'approved' && Boolean(protocol.approvedBy) && Boolean(protocol.approvedOn);
}

export function computeVerdict(
  protocol: PqProtocol,
  generation: PqGenerationResult[],
  extraction: PqExtractionResult[] = [],
  rag?: PqRagRecord,
): PqVerdictResult {
  const gen = protocol.components.generation;
  if (!gen) return { verdict: 'INCOMPLETE', reasons: ['protocol declares no generation component'] };

  const scored = generation.filter((g) => !g.error && g.sectionCoverage !== null && g.forbiddenHits !== null);
  if (scored.length === 0) {
    const errs = generation.filter((g) => g.error).map((g) => `${g.taskId}: ${g.error}`);
    return { verdict: 'NOT_EXECUTED', reasons: ['no generation task produced a scorable output', ...errs.slice(0, 5)] };
  }

  const ext = extractionFindings(protocol, extraction);
  const ragF = ragFindings(protocol, rag);
  const incomplete = [
    ...unexecutableComponents(protocol),
    ...unmeasuredComponents(protocol),
    ...taskShortfalls(generation, scored),
    ...sampleShortfall(gen.criteria.minTasksPerDocType, scored),
    ...ext.incomplete,
    ...ragF.incomplete,
  ];
  const missed = [
    ...criteriaMissed(gen.criteria, scored.filter((g) => g.servedModelVerified)),
    ...ext.missed,
    ...ragF.missed,
  ];

  // FAIL outranks INCOMPLETE: a model that missed a criterion has failed
  // something real, and reporting it as merely incomplete would hide that.
  if (missed.length) return { verdict: 'FAIL', reasons: [...missed, ...incomplete] };
  if (incomplete.length) return { verdict: 'INCOMPLETE', reasons: incomplete };
  if (!isApproved(protocol)) {
    return {
      verdict: 'INCOMPLETE',
      reasons: [
        `the criteria were met, but ${protocol.protocolId} is ${protocol.status}: a PQ against acceptance ` +
          'criteria nobody has approved is not a PQ',
      ],
    };
  }
  return { verdict: 'PASS', reasons: ['every required component executed and met approved criteria'] };
}

/** The record the runner writes, and the registry's `pq.reference` points at. */
export interface PqRecord {
  kind: 'pq-record';
  protocolId: string;
  protocolVersion: string;
  protocolStatus: 'draft' | 'approved';
  protocolSha256: string;
  modelId: string;
  pinnedVersion: string;
  provider: string;
  goldBankVersion: string;
  goldBankSha256: string;
  gitSha: string | null;
  startedAt: string;
  finishedAt: string;
  generation: PqGenerationResult[];
  /** Absent on records written before the extraction component could execute. */
  extraction?: PqExtractionResult[];
  /**
   * Absent on records written before the verdict had a rag step. run-pq has no
   * rag phase yet and records `{ ran: false, … }`, so an executable rag
   * component reads as INCOMPLETE rather than dropping out of the verdict.
   */
  rag?: PqRagRecord;
  verdict: PqVerdict;
  reasons: string[];
}

export interface RegistryPqClaim {
  id: string;
  pinnedVersion: string;
  pq: { status: 'pending' | 'passed' | 'failed'; reference: string | null };
}

/**
 * Check a registry entry's PQ claim against the record it cites.
 *
 * `passed` must cite a record that exists, is a PQ record, is for this exact
 * id AND pinned version, ran against an approved protocol, and says PASS.
 * A version bump after the PQ therefore invalidates the claim on its own —
 * which is what "re-validation is owed" in the registry has always meant, and
 * until now nothing checked.
 */
export function verifyPqClaim(entry: RegistryPqClaim, readRecord: (ref: string) => unknown): string[] {
  const problems: string[] = [];
  const { status, reference } = entry.pq;
  if (status === 'pending') {
    if (reference !== null) problems.push(`${entry.id}: pending PQ cites a record (${reference}) — record the outcome or drop the reference`);
    return problems;
  }
  if (!reference) return [`${entry.id}: pq.status is "${status}" with no record to point at`];

  let rec: Partial<PqRecord> | null;
  try {
    rec = readRecord(reference) as Partial<PqRecord> | null;
  } catch (err) {
    return [`${entry.id}: cannot read PQ record ${reference}: ${(err as Error).message}`];
  }
  if (!rec || rec.kind !== 'pq-record') return [`${entry.id}: ${reference} is not a PQ record`];
  if (rec.modelId !== entry.id) problems.push(`${entry.id}: record is for "${rec.modelId}"`);
  if (rec.pinnedVersion !== entry.pinnedVersion) {
    problems.push(`${entry.id}: record qualified ${rec.pinnedVersion}; the registry now pins ${entry.pinnedVersion} — re-qualification is owed`);
  }
  if (status === 'passed') {
    if (rec.verdict !== 'PASS') problems.push(`${entry.id}: claims passed; the record says ${rec.verdict}`);
    if (rec.protocolStatus !== 'approved') problems.push(`${entry.id}: record ran against a ${rec.protocolStatus} protocol`);
  }
  if (status === 'failed' && rec.verdict === 'PASS') problems.push(`${entry.id}: claims failed; the record says PASS`);
  return problems;
}
