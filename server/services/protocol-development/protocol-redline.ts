/**
 * Protocol redline — a section-level tracked-changes comparison between two
 * recorded versions of one protocol DOCUMENT.
 *
 * Industry need. An EU CTR 536/2014 substantial-modification dossier (Annex
 * II) carries an extract of the modified documents showing the previous and
 * new wording in track changes. A 21 CFR 312.30 protocol amendment must
 * describe the change, and a redline is the usual way to support and check
 * that description; IRB and ethics-committee amendments, and the ICH E6(R3)
 * record of what the protocol said before and after, rely on one too. Every
 * protocol authoring tool produces one. This
 * repository snapshots versions (`protocol_versions.snapshot`, written by
 * `snapshotVersionTx` as `{ version, sections: [{ section_key, title, content,
 * status, order_index }] }`) and compares study DESIGNS
 * (`protocol-amendments/design-delta.ts`); this module compares the DOCUMENT.
 *
 * What it reports, per section, matched by `section_key` (one `change` each,
 * by precedence modified > retitled > reordered > unchanged):
 *   - added      only in the later version; every line inserted;
 *   - removed    only in the earlier version; every line deleted;
 *   - modified   content differs; a line diff (Myers, via the `diff`
 *                dependency's `diffArrays`) whose ops reproduce both texts;
 *   - retitled   same content, different title (`titleBefore` carries the old);
 *   - reordered  same content and title, different relative position;
 *   - unchanged  none of the above. A status change alone (draft → complete)
 *                is reported through `statusBefore`/`statusAfter` and does
 *                NOT make a section modified.
 * `titleBefore` and `moved` are reported whatever the precedence chose, so a
 * section that was both edited and moved is `modified` with `moved: true`.
 *
 * Honesty contract (CLAUDE.md — fail closed, never fabricate):
 *   - Lines: `null` content is read as '' (so null → '' is unchanged); '' is
 *     zero lines; any other text is split on '\n', so a trailing newline is a
 *     final empty line and '\r' stays part of its line. Each diff op is a run
 *     of consecutive lines joined by '\n': equal + delete ops joined by '\n'
 *     rebuild the earlier text exactly, equal + insert the later.
 *   - The changed region is what remains once the lines both texts share at
 *     their start and end are set aside. When it has no line in common between
 *     the versions (always so for an added or removed section), deleting all of
 *     it and inserting all of its replacement IS the minimal diff: found
 *     exactly, in linear time, at any size. Otherwise a Myers pass finds it,
 *     bounded by an edit count.
 *   - Above {@link REDLINE_LINE_CAP} lines on either side no diff is produced
 *     and the section says so in `note`; nothing is ever truncated. Line counts
 *     are given there only when one of the two exact methods above finds them
 *     (Myers within {@link REDLINE_CAPPED_EDIT_BUDGET} edits), and the note
 *     names the method actually used; else they are omitted.
 *   - A section at or under the cap whose changed region shares a line and
 *     whose minimal diff needs more than {@link REDLINE_EDIT_BUDGET} line edits
 *     gets no diff and no counts, and a note saying so — never an approximate
 *     diff presented as the real one.
 *   - When any section's counts are unknown, `summary.linesInserted` and
 *     `summary.linesDeleted` are null (never a partial sum presented as a
 *     total) and `summary.sectionsWithoutCounts` names the sections.
 *   - Relative order is read from `order_index`, ties broken by the snapshot's
 *     row order (which `snapshotVersionTx` does not fix). Every section in both
 *     versions that shares its `order_index` with another such section, in
 *     either version, says so in `note` whether or not it moved, and
 *     `summary.positionsFromRowOrder` names them: while that list is non-empty
 *     any `moved` verdict may reflect row order rather than an edit.
 *   - A snapshot that cannot be compared (not an object, no version label, no
 *     sections list; a row that is not an object or lacks a key, title, status
 *     or finite numeric order_index; content that is neither text nor null; a
 *     key that appears twice) throws {@link ProtocolRedlineError}
 *     (`code: 'INVALID_STATE'`) listing every defect; the engine does not pick
 *     one of two same-keyed sections.
 *
 * Output order: the later version's document order; each removed section is
 * placed immediately after the nearest section that precedes it in the earlier
 * version and survives into the later one (at the start when none does);
 * removed sections sharing that anchor keep their earlier-version order.
 *
 * Pure: no model call, no RNG, no DB. (jsdiff reads `Date.now()` for its
 * optional timeout; none is passed, so the output never depends on the clock.)
 *
 * @module server/services/protocol-development/protocol-redline
 */

import { diffArrays } from 'diff';

export const PROTOCOL_REDLINE_BASIS =
  'EU CTR 536/2014 (Annex II) — substantial modification; 21 CFR 312.30 — protocol amendments; ICH E6(R3) — protocol amendment documentation';

/** Above this many lines on either side, a section's line diff is not produced (see `note`). */
export const REDLINE_LINE_CAP = 5000;

/**
 * The most line edits (inserted + deleted) the Myers pass may spend on one
 * section at or under the cap. It bounds only that pass: a changed region
 * with no line in common is diffed exactly in linear time whatever its size.
 * Myers' cost grows with the square of the edit count and the diff runs on
 * the request thread; at this bound the worst case measured about 0.8 s for
 * one section (Node 22, a rewrite sharing only blank lines). The bound is an
 * edit count, not a timer, so the result is deterministic.
 */
export const REDLINE_EDIT_BUDGET = 2000;

/** The Myers edit bound for the exact-count attempt on a section above the cap. */
export const REDLINE_CAPPED_EDIT_BUDGET = 200;

// ─── Contract ────────────────────────────────────────────────────────────────

/** One row of `protocol_versions.snapshot.sections`, as `snapshotVersionTx` writes it. */
export interface ProtocolSnapshotSection {
  section_key: string;
  title: string;
  content: string | null;
  status: string;
  order_index: number;
}

/** The parsed `protocol_versions.snapshot` (or the live working copy in the same shape). */
export interface ProtocolSnapshot {
  version: string;
  sections: ProtocolSnapshotSection[];
}

export type RedlineChange = 'unchanged' | 'modified' | 'added' | 'removed' | 'reordered' | 'retitled';

/** A run of consecutive lines with one op; `text` is those lines joined by '\n'. */
export interface RedlineOp {
  op: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface RedlineCounts {
  inserted: number;
  deleted: number;
}

export interface RedlineSection {
  sectionKey: string;
  /** The later version's title (the earlier version's for a removed section). */
  title: string;
  /** Present only when the title changed. */
  titleBefore?: string;
  change: RedlineChange;
  /** Present when the section is in both versions: its relative position changed. */
  moved?: boolean;
  statusBefore?: string;
  statusAfter?: string;
  /** Present for modified/added/removed sections that were diffed. */
  diff?: RedlineOp[];
  /** Lines inserted and deleted; absent when they could not be computed exactly. */
  counts?: RedlineCounts;
  /** Why a diff or counts are absent, how capped counts were found, and whether the section's position rests on row order. */
  note?: string;
}

export interface RedlineSummary {
  modified: number;
  added: number;
  removed: number;
  reordered: number;
  retitled: number;
  unchanged: number;
  /** Sections in both versions whose relative position changed, whatever their `change`. */
  moved: number;
  /** Sections in both versions whose status differs. */
  statusChanged: number;
  /** Total inserted lines; null when any section's counts are unknown. */
  linesInserted: number | null;
  /** Total deleted lines; null when any section's counts are unknown. */
  linesDeleted: number | null;
  /** Keys of the sections whose line counts could not be computed exactly. */
  sectionsWithoutCounts: string[];
  /**
   * Keys of the sections in both versions that share an `order_index` with
   * another such section in either version, in output order. Row order alone
   * placed them relative to each other, so while this is non-empty any section's
   * `moved` (and so `reordered`) may reflect row order rather than an edit.
   */
  positionsFromRowOrder: string[];
}

export interface ProtocolRedline {
  from: string;
  to: string;
  sections: RedlineSection[];
  summary: RedlineSummary;
  basis: string;
}

/** A snapshot the redline cannot compare. `code` maps to HTTP 409 like ProtocolDevError. */
export class ProtocolRedlineError extends Error {
  readonly code = 'INVALID_STATE' as const;
  readonly problems: string[];
  constructor(problems: string[]) {
    const shown = problems.slice(0, 10).join('; ');
    const more = problems.length > 10 ? `; and ${problems.length - 10} more` : '';
    super(`The versions cannot be compared, so no redline was produced: ${shown}${more}.`);
    this.name = 'ProtocolRedlineError';
    this.problems = problems;
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────

function rowProblems(row: unknown, i: number, label: string): string[] {
  if (!row || typeof row !== 'object') return [`${label} section row ${i + 1} is not an object`];
  const r = row as Record<string, unknown>;
  const key = typeof r.section_key === 'string' && r.section_key ? r.section_key : null;
  const where = `${label} section ${key ? `"${key}"` : `row ${i + 1}`}`;
  const out: string[] = [];
  if (!key) out.push(`${where} has no section_key`);
  if (typeof r.title !== 'string') out.push(`${where} has no title`);
  if (r.content !== null && typeof r.content !== 'string') out.push(`${where} has content that is neither text nor null`);
  if (typeof r.status !== 'string') out.push(`${where} has no status`);
  if (typeof r.order_index !== 'number' || !Number.isFinite(r.order_index)) out.push(`${where} has no numeric order_index`);
  return out;
}

function snapshotProblems(snap: unknown, side: string): string[] {
  const s = snap as { version?: unknown; sections?: unknown } | null;
  if (!s || typeof s !== 'object') return [`the ${side} version is not a snapshot`];
  const label = typeof s.version === 'string' ? `version ${s.version}` : `the ${side} version`;
  if (typeof s.version !== 'string') return [`${label} has no version label`];
  if (!Array.isArray(s.sections)) return [`${label} has no sections list`];
  const out = s.sections.flatMap((row, i) => rowProblems(row, i, label));
  const seen = new Map<string, number>();
  for (const row of s.sections as Array<{ section_key?: unknown }>) {
    if (typeof row?.section_key === 'string') seen.set(row.section_key, (seen.get(row.section_key) ?? 0) + 1);
  }
  for (const [key, n] of seen) {
    if (n > 1) out.push(`${label} records section_key "${key}" ${n} times, so its sections cannot be matched`);
  }
  return out;
}

// ─── Lines and the line diff ─────────────────────────────────────────────────

/** The line rule: null and '' are zero lines; any other text is split on '\n'. */
export function splitContentLines(content: string | null): string[] {
  const text = content ?? '';
  return text === '' ? [] : text.split('\n');
}

interface Run {
  op: RedlineOp['op'];
  lines: string[];
}

function pushRun(runs: Run[], op: Run['op'], lines: string[]): void {
  if (lines.length === 0) return;
  const last = runs[runs.length - 1];
  if (last && last.op === op) last.lines.push(...lines);
  else runs.push({ op, lines: [...lines] });
}

function sharesALine(a: string[], b: string[]): boolean {
  const seen = new Set(a);
  return b.some((line) => seen.has(line));
}

/**
 * A minimal line diff and the exact method that found it: `block` when the
 * changed region has no line in common (delete all of it, insert all of its
 * replacement), `myers` when a Myers pass found it within the edit budget.
 */
interface LineDiff {
  runs: Run[];
  method: 'block' | 'myers';
}

/** The changed middle as runs: a block when that is provably minimal, else Myers within `budget`. */
function middleRuns(a: string[], b: string[], budget: number): LineDiff | null {
  const runs: Run[] = [];
  // With no line in common the longest common subsequence is empty, so
  // delete-all then insert-all IS the minimal diff — exact, and linear.
  if (a.length === 0 || b.length === 0 || !sharesALine(a, b)) {
    pushRun(runs, 'delete', a);
    pushRun(runs, 'insert', b);
    return { runs, method: 'block' };
  }
  const changes = diffArrays(a, b, { maxEditLength: budget });
  if (!changes) return null;
  for (const c of changes) pushRun(runs, c.added ? 'insert' : c.removed ? 'delete' : 'equal', c.value);
  return { runs, method: 'myers' };
}

/** A minimal line diff of `a` → `b`, or null when the Myers pass would need more than `budget` edits. */
function lineRuns(a: string[], b: string[], budget: number): LineDiff | null {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const middle = middleRuns(a.slice(head, a.length - tail), b.slice(head, b.length - tail), budget);
  if (!middle) return null;
  const runs: Run[] = [];
  pushRun(runs, 'equal', a.slice(0, head));
  for (const r of middle.runs) pushRun(runs, r.op, r.lines);
  pushRun(runs, 'equal', a.slice(a.length - tail));
  return { runs, method: middle.method };
}

function countRuns(runs: Run[]): RedlineCounts {
  let inserted = 0;
  let deleted = 0;
  for (const r of runs) {
    if (r.op === 'insert') inserted += r.lines.length;
    else if (r.op === 'delete') deleted += r.lines.length;
  }
  return { inserted, deleted };
}

type DiffKind = 'modified' | 'added' | 'removed';

/** Each capped-section sentence by change kind: [extent, how the exact counts were found, what to read]. */
const CAP_WORDING: Record<DiffKind, (before: number, after: number) => [string, string, string]> = {
  added: (_b, after) => [
    `This section is absent from the earlier version and has ${after} line(s) in the later`,
    'Its inserted line count is exact: every line of a section absent from the earlier version is inserted.',
    'Read its text in the later version.',
  ],
  removed: (before) => [
    `This section has ${before} line(s) in the earlier version and is absent from the later`,
    'Its deleted line count is exact: every line of a section absent from the later version is deleted.',
    'Read its text in the earlier version.',
  ],
  modified: (before, after) => [
    `This section has ${before} line(s) in the earlier version and ${after} in the later`,
    'The inserted and deleted line counts are exact: once the lines the two texts share at their start and end are set aside, ' +
      'the rest have no line in common, so every one of those lines was deleted or inserted.',
    'Compare the two texts in full.',
  ],
};

function capNote(kind: DiffKind, before: number, after: number, found: LineDiff | null): string {
  const [extent, blockCounts, read] = CAP_WORDING[kind](before, after);
  const counts = !found
    ? 'Exact line counts could not be computed cheaply and are omitted rather than estimated.'
    : found.method === 'block'
      ? blockCounts
      : `The inserted and deleted line counts are exact: a minimal line diff was found within ${REDLINE_CAPPED_EDIT_BUDGET} edits.`;
  return (
    `${extent}; above the ${REDLINE_LINE_CAP}-line cap no line diff is produced, so no tracked changes are shown for it ` +
    `and nothing was truncated. ${counts} ${read}`
  );
}

const BUDGET_NOTE =
  `The two texts differ by more than ${REDLINE_EDIT_BUDGET} line edits, the most this redline computes for one section, ` +
  'so no line diff and no line counts are given rather than an approximate one. Compare the two texts in full.';

type DiffPart = Pick<RedlineSection, 'diff' | 'counts' | 'note'>;

/** The diff, counts and note for one section's earlier → later lines. */
function diffPart(kind: DiffKind, before: string[], after: string[]): DiffPart {
  const capped = before.length > REDLINE_LINE_CAP || after.length > REDLINE_LINE_CAP;
  const found = lineRuns(before, after, capped ? REDLINE_CAPPED_EDIT_BUDGET : REDLINE_EDIT_BUDGET);
  if (capped) return { ...(found ? { counts: countRuns(found.runs) } : {}), note: capNote(kind, before.length, after.length, found) };
  if (!found) return { note: BUDGET_NOTE };
  return { diff: found.runs.map((r) => ({ op: r.op, text: r.lines.join('\n') })), counts: countRuns(found.runs) };
}

// ─── Document order and moves ────────────────────────────────────────────────

/** Document order: `order_index` ascending, ties by the snapshot's row order. */
function documentOrder(rows: ProtocolSnapshotSection[]): ProtocolSnapshotSection[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((x, y) => x.row.order_index - y.row.order_index || x.i - y.i)
    .map((x) => x.row);
}

/**
 * Keys of the sections in both versions that moved: those outside a longest
 * common subsequence of the two relative orders — the fewest sections whose
 * moving explains the new order. Where several such sets exist (two sections
 * swapped), the one jsdiff's Myers pass keeps is reported, deterministically.
 */
function movedKeys(beforeOrder: string[], afterOrder: string[]): Set<string> {
  const inAfter = new Set(afterOrder);
  const inBefore = new Set(beforeOrder);
  const changes = diffArrays(beforeOrder.filter((k) => inAfter.has(k)), afterOrder.filter((k) => inBefore.has(k)));
  return new Set(changes.filter((c) => c.added).flatMap((c) => c.value));
}

/**
 * The other sections in both versions that share `key`'s order_index in `rows`.
 * Only these matter: `moved` compares the two versions' orders of the shared
 * sections, and a tie with a section one version lacks never enters it.
 */
function tiedWith(rows: ProtocolSnapshotSection[], key: string, shared: Set<string>): string[] {
  const own = rows.find((r) => r.section_key === key);
  if (!own) return [];
  return rows.filter((r) => r.section_key !== key && shared.has(r.section_key) && r.order_index === own.order_index).map((r) => r.section_key);
}

/** For a section in both versions: why its `moved` verdict may rest on row order, or undefined when it does not. */
function tieNote(key: string, before: ProtocolSnapshot, after: ProtocolSnapshot, shared: Set<string>, moved: boolean): string | undefined {
  const parts: string[] = [];
  for (const snap of [before, after]) {
    const ties = tiedWith(snap.sections, key, shared);
    if (ties.length > 0) parts.push(`in version ${snap.version} it shares its order_index with ${ties.map((k) => `"${k}"`).join(', ')}`);
  }
  if (parts.length === 0) return undefined;
  return (
    `${moved ? 'Moved' : 'Not moved'}, but ${parts.join(' and ')}; the relative order of sections with the same order_index ` +
    'is only the recorded row order, so whether this section moved may reflect row order rather than an edit.'
  );
}

// ─── Per-section comparison ──────────────────────────────────────────────────

function joinNotes(...notes: Array<string | undefined>): string | undefined {
  const present = notes.filter((n): n is string => Boolean(n));
  return present.length > 0 ? present.join(' ') : undefined;
}

function withNote(section: RedlineSection, note: string | undefined): RedlineSection {
  return note ? { ...section, note } : section;
}

function compareShared(b: ProtocolSnapshotSection, a: ProtocolSnapshotSection, moved: boolean, tie: string | undefined): RedlineSection {
  const retitled = b.title !== a.title;
  const base: RedlineSection = {
    sectionKey: a.section_key,
    title: a.title,
    ...(retitled ? { titleBefore: b.title } : {}),
    change: 'unchanged',
    moved,
    statusBefore: b.status,
    statusAfter: a.status,
  };
  if ((b.content ?? '') !== (a.content ?? '')) {
    const part = diffPart('modified', splitContentLines(b.content), splitContentLines(a.content));
    const { note, ...rest } = part;
    return withNote({ ...base, change: 'modified', ...rest }, joinNotes(note, tie));
  }
  const change: RedlineChange = retitled ? 'retitled' : moved ? 'reordered' : 'unchanged';
  return withNote({ ...base, change, counts: { inserted: 0, deleted: 0 } }, tie);
}

function compareOneSided(row: ProtocolSnapshotSection, change: 'added' | 'removed'): RedlineSection {
  const lines = splitContentLines(row.content);
  const part = change === 'added' ? diffPart('added', [], lines) : diffPart('removed', lines, []);
  const status = change === 'added' ? { statusAfter: row.status } : { statusBefore: row.status };
  const { note, ...rest } = part;
  return withNote({ sectionKey: row.section_key, title: row.title, change, ...status, ...rest }, note);
}

// ─── Assembly ────────────────────────────────────────────────────────────────

/** The later version's order, each removed section after its nearest surviving predecessor. */
function outputOrder(beforeOrdered: ProtocolSnapshotSection[], afterOrdered: ProtocolSnapshotSection[]): Array<{ key: string; removed: boolean }> {
  const afterKeys = new Set(afterOrdered.map((r) => r.section_key));
  const anchored = new Map<string | null, string[]>();
  let anchor: string | null = null;
  for (const row of beforeOrdered) {
    if (afterKeys.has(row.section_key)) {
      anchor = row.section_key;
      continue;
    }
    anchored.set(anchor, [...(anchored.get(anchor) ?? []), row.section_key]);
  }
  const out = (anchored.get(null) ?? []).map((key) => ({ key, removed: true }));
  for (const row of afterOrdered) {
    out.push({ key: row.section_key, removed: false });
    for (const key of anchored.get(row.section_key) ?? []) out.push({ key, removed: true });
  }
  return out;
}

function summarise(sections: RedlineSection[], positionsFromRowOrder: string[]): RedlineSummary {
  const count = (c: RedlineChange) => sections.filter((s) => s.change === c).length;
  const withoutCounts = sections.filter((s) => !s.counts).map((s) => s.sectionKey);
  const total = (field: keyof RedlineCounts) =>
    withoutCounts.length > 0 ? null : sections.reduce((n, s) => n + (s.counts ? s.counts[field] : 0), 0);
  return {
    modified: count('modified'),
    added: count('added'),
    removed: count('removed'),
    reordered: count('reordered'),
    retitled: count('retitled'),
    unchanged: count('unchanged'),
    moved: sections.filter((s) => s.moved === true).length,
    statusChanged: sections.filter((s) => s.statusBefore !== undefined && s.statusAfter !== undefined && s.statusBefore !== s.statusAfter).length,
    linesInserted: total('inserted'),
    linesDeleted: total('deleted'),
    sectionsWithoutCounts: withoutCounts,
    positionsFromRowOrder,
  };
}

/**
 * Section-level redline of `before` → `after`. Pure and deterministic: the
 * same two snapshots always give the same redline, and neither is mutated.
 * Throws {@link ProtocolRedlineError} when either snapshot cannot be compared.
 */
export function redlineVersions(before: ProtocolSnapshot, after: ProtocolSnapshot): ProtocolRedline {
  const problems = [...snapshotProblems(before, 'earlier'), ...snapshotProblems(after, 'later')];
  if (problems.length > 0) throw new ProtocolRedlineError(problems);

  const beforeOrdered = documentOrder(before.sections);
  const afterOrdered = documentOrder(after.sections);
  const beforeByKey = new Map(beforeOrdered.map((r) => [r.section_key, r]));
  const afterByKey = new Map(afterOrdered.map((r) => [r.section_key, r]));
  const shared = new Set([...beforeByKey.keys()].filter((k) => afterByKey.has(k)));
  const moved = movedKeys(beforeOrdered.map((r) => r.section_key), afterOrdered.map((r) => r.section_key));
  const fromRowOrder: string[] = [];

  const sections = outputOrder(beforeOrdered, afterOrdered).map(({ key, removed }): RedlineSection => {
    const b = beforeByKey.get(key);
    const a = afterByKey.get(key);
    if (removed || !a) return compareOneSided(b as ProtocolSnapshotSection, 'removed');
    if (!b) return compareOneSided(a, 'added');
    const isMoved = moved.has(key);
    const tie = tieNote(key, before, after, shared, isMoved);
    if (tie) fromRowOrder.push(key);
    return compareShared(b, a, isMoved, tie);
  });

  return { from: before.version, to: after.version, sections, summary: summarise(sections, fromRowOrder), basis: PROTOCOL_REDLINE_BASIS };
}
