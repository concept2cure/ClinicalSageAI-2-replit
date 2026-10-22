/** Strict formatting reanchoring. Parsing primitives are supplied by the one
 * canonical machine-attribution reader; this module never maintains a second
 * HTML scanner or a separate acceptance comparison. */
import { looksLikeHtml } from '@shared/authoring/plain-text-html';
import { opensInSourceMode } from '@shared/authoring/source-mode';
import { decodeHtmlEntities } from '../../export/decode-html-entities';
import { hashSpanText, SpanLineageError } from './span-lineage.service';

type Extent = [number, number];
interface Tag { start: number; end: number; name: string; closing: boolean; attributes: string }
export interface FormattingReaders {
  scanMarkup(content: string): { tags: Tag[]; differsAt: number };
  regionFrom(scan: { tags: Tag[]; differsAt: number }): number;
  silentAs(tag: Tag): '' | ' ' | null;
  attributesOf(tag: Tag): Array<[string, string]>;
  prints(tag: Tag): boolean;
  notComparedRanges(content: string): Extent[];
  voidElements: ReadonlySet<string>;
  blockElements: ReadonlySet<string>;
  minClauseChars: number;
}

export type FormattingSafety = { safe: true } | { safe: false; reason:
  'source-mode' | 'reader-disagreement' | 'unsupported-markup' | 'printing-annotation' };

export function formattingSafety(previousContent: string, content: string, readers: FormattingReaders): FormattingSafety {
  for (const value of [previousContent, content]) {
    if (opensInSourceMode(value)) return { safe: false, reason: 'source-mode' };
    const scan = looksLikeHtml(value) ? readers.scanMarkup(value) : { tags: [], differsAt: -1 };
    if (readers.regionFrom(scan) !== -1) return { safe: false, reason: 'reader-disagreement' };
    if (scan.tags.some(tag => !tag.closing && tag.name !== 'img' && readers.prints(tag))) {
      return { safe: false, reason: 'printing-annotation' };
    }
    if (!formattingProjection(value, readers)) return { safe: false, reason: 'unsupported-markup' };
  }
  return { safe: true };
}

interface FormattingComponent {
  start: number;
  end: number;
  name: string;
}

interface FormattingTable {
  start: number;
  end: number;
  rows: Array<Array<FormattingComponent & { colSpan: number; rowSpan: number }>>;
}

interface FormattingProjection {
  excluded: Extent[];
  text: string;
  starts: number[];
  ends: number[];
  tags: Tag[];
  tables: FormattingTable[];
  blocks: FormattingComponent[];
}

interface FormattingStructureState {
  stack: Array<{ tag: Tag; component?: FormattingComponent }>;
  tables: FormattingTable[];
  blocks: FormattingComponent[];
  table?: FormattingTable;
  row?: FormattingTable['rows'][number];
  contentLength: number;
}

export interface FormattingCarryRange {
  priorIndex: number;
  charStart: number;
  charEnd: number;
  spanText: string;
}

type TextRange = { charStart: number; charEnd: number; text: string };

/** Subtract credited intervals without assigning unchanged words twice. Offsets
 * always remain positions in the stored string, including its markup. */
export function subtractAttributedRanges(
  candidates: ReadonlyArray<TextRange>,
  attributed: ReadonlyArray<{ charStart: number; charEnd: number }>,
  content: string,
): TextRange[] {
  const occupied: Extent[] = [];
  for (const span of [...attributed].sort((a, b) => a.charStart - b.charStart)) {
    const last = occupied.at(-1);
    if (last && span.charStart <= last[1]) last[1] = Math.max(last[1], span.charEnd);
    else occupied.push([span.charStart, span.charEnd]);
  }
  const result: TextRange[] = [];
  const add = (start: number, end: number) => {
    const raw = content.slice(start, end);
    const text = raw.trim();
    if (text) {
      const charStart = start + raw.length - raw.trimStart().length;
      result.push({ charStart, charEnd: charStart + text.length, text });
    }
  };
  for (const candidate of candidates) {
    let cursor = candidate.charStart;
    let lo = 0;
    let hi = occupied.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (occupied[mid][1] <= cursor) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < occupied.length && occupied[i][0] < candidate.charEnd; i++) {
      if (occupied[i][0] > cursor) add(cursor, Math.min(occupied[i][0], candidate.charEnd));
      cursor = Math.max(cursor, occupied[i][1]);
    }
    if (cursor < candidate.charEnd) add(cursor, candidate.charEnd);
  }
  return result;
}

/** Supported, balanced markup only. HTML error recovery, source mode and
 * preformatted whitespace deliberately have no formatting equivalence here. */
function formattingStructure(content: string, tags: Tag[], readers: FormattingReaders): Pick<FormattingProjection, 'tables' | 'blocks'> | null {
  const state: FormattingStructureState = { stack: [], tables: [], blocks: [], contentLength: content.length };
  for (const tag of tags) {
    if (tag.name === 'pre' || (readers.silentAs(tag) === null && !readers.prints(tag))) return null;
    if (tag.closing) {
      if (!closeFormattingTag(state, tag)) return null;
      continue;
    }
    if (!validFormattingParent(state, tag, readers)) return null;
    if (readers.voidElements.has(tag.name)) continue;
    if (content.slice(tag.start, tag.end).endsWith('/>') || !openFormattingTag(state, tag, readers)) return null;
  }
  return state.stack.length === 0 ? { tables: state.tables, blocks: state.blocks } : null;
}

function closeFormattingTag(state: FormattingStructureState, tag: Tag): boolean {
  const opened = state.stack.pop();
  if (!opened || opened.tag.name !== tag.name) return false;
  if (opened.component) opened.component.end = tag.end;
  if (tag.name === 'tr') state.row = undefined;
  if (tag.name === 'table') { state.table!.end = tag.end; state.table = undefined; }
  return true;
}

function validFormattingParent(state: FormattingStructureState, tag: Tag, readers: FormattingReaders): boolean {
  const parent = state.stack.at(-1)?.tag.name;
  if (parent === 'p' && readers.blockElements.has(tag.name) && !readers.voidElements.has(tag.name)) return false;
  const parents: Record<string, readonly string[]> = {
    tr: ['table', 'thead', 'tbody', 'tfoot'], td: ['tr'], th: ['tr'],
    thead: ['table'], tbody: ['table'], tfoot: ['table'], colgroup: ['table'], col: ['colgroup'],
  };
  if (parents[tag.name] && !parents[tag.name].includes(parent ?? '')) return false;
  if (parent === 'table' && !['tr', 'thead', 'tbody', 'tfoot', 'colgroup'].includes(tag.name)) return false;
  if (parent === 'tr' && !['td', 'th'].includes(tag.name)) return false;
  return true;
}

function openFormattingTag(state: FormattingStructureState, tag: Tag, readers: FormattingReaders): boolean {
  let component: FormattingComponent | undefined;
  if (tag.name === 'table') {
    if (state.table) return false;
    state.table = { start: tag.start, end: state.contentLength, rows: [] };
    state.tables.push(state.table);
  } else if (tag.name === 'tr') {
    if (!state.table || state.row) return false;
    state.row = [];
    state.table.rows.push(state.row);
  } else if (tag.name === 'td' || tag.name === 'th') {
    if (!state.row) return false;
    const attributes = new Map(readers.attributesOf(tag));
    const cell = { start: tag.start, end: state.contentLength, name: tag.name,
      colSpan: Number(attributes.get('colspan') ?? 1), rowSpan: Number(attributes.get('rowspan') ?? 1) };
    state.row.push(cell);
    component = cell;
  } else if (!state.table && /^(?:p|h[1-6]|li|dt|dd)$/.test(tag.name)) {
    component = { start: tag.start, end: state.contentLength, name: tag.name };
    state.blocks.push(component);
  }
  state.stack.push({ tag, component });
  return true;
}

/** Each comparison character retains the exact raw interval which produced
 * it. No case folding, scientific normalization or generic tag stripping. */
function formattingProjection(content: string, readers: FormattingReaders): FormattingProjection | null {
  if (unsupportedFormattingContent(content)) return null;
  const html = looksLikeHtml(content);
  const scan = html ? readers.scanMarkup(content) : { tags: [], differsAt: -1 };
  if (readers.regionFrom(scan) !== -1) return null;
  const structure = formattingStructure(content, scan.tags, readers);
  if (!structure) return null;
  const result: FormattingProjection = { text: '', starts: [], ends: [], tags: scan.tags, excluded: [], ...structure };
  const barriers = html ? readers.notComparedRanges(content) : [];
  const emit = (character: string, start: number, end: number) => {
    const value = /\s/.test(character) ? ' ' : character;
    if (value === ' ' && result.text.endsWith(' ')) { result.ends[result.ends.length - 1] = end; return; }
    result.text += value;
    result.starts.push(start);
    result.ends.push(end);
  };
  let tagIndex = 0;
  let barrierIndex = 0;
  for (let at = 0; at < content.length;) {
    const barrier = barriers[barrierIndex];
    if (barrier && at >= barrier[0]) {
      const images = barrierImages(scan.tags, tagIndex, barrier);
      if (images) result.excluded.push(...images);
      else emit('\u0000', barrier[0], barrier[1]);
      at = barrier[1];
      barrierIndex++;
      while (scan.tags[tagIndex]?.start < at) tagIndex++;
      continue;
    }
    const tag = scan.tags[tagIndex];
    if (tag?.start === at) {
      if (readers.silentAs(tag) === ' ') emit(' ', tag.start, tag.end);
      at = tag.end;
      tagIndex++;
    } else {
      at = emitFormattingBody(content, at, html, emit);
    }
  }
  return result;
}

function unsupportedFormattingContent(content: string): boolean {
  return content.includes('\u0000') || opensInSourceMode(content);
}

function emitFormattingBody(content: string, at: number, html: boolean, emit: (character: string, start: number, end: number) => void): number {
  const entity = html ? formattingEntity(content, at) : null;
  if (entity) {
    for (let i = 0; i < entity.text.length; i++) emit(entity.text[i], at, entity.end);
    return entity.end;
  }
  emit(content[at], at, at + 1);
  return at + 1;
}

function barrierImages(tags: Tag[], from: number, barrier: Extent): Extent[] | null {
  const images: Extent[] = [];
  let cursor = barrier[0];
  for (let i = from; tags[i]?.start < barrier[1]; i++) {
    const tag = tags[i];
    if (tag.name !== 'img' || tag.start !== cursor) return null;
    images.push([tag.start, tag.end]);
    cursor = tag.end;
  }
  return cursor === barrier[1] ? images : null;
}

/** Decode exactly once after scanning markup, using the export's canonical
 * reducer. Uppercase/unknown names and HTML control remappings have no proven
 * shared reading and deliberately retain their literal comparison form. */
function formattingEntity(content: string, at: number): { text: string; end: number } | null {
  if (content[at] !== '&') return null;
  const match = /^&(?:[a-z]{1,12}|#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6});/.exec(content.slice(at, at + 16));
  if (!match) return null;
  const value = match[0];
  if (value[1] === '#') {
    const number = Number.parseInt(value.slice(value[2].toLowerCase() === 'x' ? 3 : 2, -1), value[2].toLowerCase() === 'x' ? 16 : 10);
    if (number < 32 || (number >= 127 && number <= 159)) return null;
  }
  const text = decodeHtmlEntities(value);
  return text === value ? null : { text, end: at + value.length };
}

function formattingSlice(projection: FormattingProjection, start: number, end: number): string {
  let lo = 0;
  let hi = projection.ends.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (projection.ends[mid] <= start) lo = mid + 1;
    else hi = mid;
  }
  let to = lo;
  while (to < projection.starts.length && projection.starts[to] < end) to++;
  return projection.text.slice(lo, to).trim();
}

function topology(table: FormattingTable): string {
  return table.rows.map(row => row.map(cell => `${cell.name}:${cell.colSpan}:${cell.rowSpan}`).join(',')).join(';');
}

/** Same structural path and unchanged header association. A value moved from
 * another cell is a changed association, even when the words survive. */
function compatibleTable(old: FormattingTable, next: FormattingTable | undefined, before: FormattingProjection, after: FormattingProjection): boolean {
  if (!next || topology(old) !== topology(next)) return false;
  const previous = old.rows.flat().map(cell => formattingSlice(before, cell.start, cell.end));
  const current = next.rows.flat().map(cell => formattingSlice(after, cell.start, cell.end));
  return old.rows.flat().every((cell, index) => {
    if (cell.name === 'th' && previous[index] !== current[index]) return false;
    return previous[index] === current[index] || !previous.some((text, elsewhere) => elsewhere !== index && text === current[index]);
  });
}

function matchingTablePaths(before: FormattingProjection, after: FormattingProjection, old: Extent, next: Extent): boolean {
  const touched = (projection: FormattingProjection, range: Extent) => projection.tables
    .map((table, index) => ({ table, index }))
    .filter(({ table }) => table.start < range[1] && table.end > range[0]);
  const oldTables = touched(before, old);
  const newTables = touched(after, next);
  if (oldTables.length !== newTables.length) return false;
  return oldTables.every(({ table, index }, position) => {
    const candidate = newTables[position];
    if (candidate.index !== index || !compatibleTable(table, candidate.table, before, after)) return false;
    const cells = (value: FormattingTable, range: Extent) => value.rows.flat()
      .map((cell, cellIndex) => cell.start < range[1] && cell.end > range[0] ? cellIndex : -1).filter(i => i !== -1).join(',');
    if (cells(table, old) !== cells(candidate.table, next)) return false;
    return table.rows.flat().every((cell, cellIndex) => {
      if (cell.start >= old[1] || cell.end <= old[0]) return true;
      const current = candidate.table.rows.flat()[cellIndex];
      return formattingSlice(before, cell.start, cell.end) === formattingSlice(after, current.start, current.end);
    });
  });
}

function extendSilentRange(projection: FormattingProjection, content: string, range: Extent, bounds: Extent, readers: FormattingReaders): Extent {
  const startTags = new Map(projection.tags.map(tag => [tag.start, tag]));
  const endTags = new Map(projection.tags.map(tag => [tag.end, tag]));
  let [start, end] = range;
  for (;;) {
    let at = start;
    while (at > bounds[0] && /\s/.test(content[at - 1])) at--;
    const tag = endTags.get(at);
    if (!tag || tag.start < bounds[0] || readers.silentAs(tag) === null) break;
    start = tag.start;
  }
  for (;;) {
    let at = end;
    while (at < bounds[1] && /\s/.test(content[at])) at++;
    const tag = startTags.get(at);
    if (!tag || tag.end > bounds[1] || readers.silentAs(tag) === null) break;
    end = tag.end;
  }
  return [start, end];
}

interface FormattingMatchState {
  readers: FormattingReaders;
  before: FormattingProjection;
  after: FormattingProjection;
  content: string;
  occupied: Extent[];
}

function mappedFormattingRange(state: FormattingMatchState, old: Extent, bounds: Extent | undefined): Extent | null {
  const needle = formattingSlice(state.before, old[0], old[1]);
  if (!needle || needle.includes('\u0000') || (!bounds && needle.length < state.readers.minClauseChars)) return null;
  const choices: Extent[] = [];
  for (let at = state.after.text.indexOf(needle); at !== -1; at = state.after.text.indexOf(needle, at + needle.length)) {
    const range: Extent = [state.after.starts[at], state.after.ends[at + needle.length - 1]];
    if (!validFormattingOccurrence(state.after.text, needle, at, range, bounds)) continue;
    if (!matchingTablePaths(state.before, state.after, old, range)) continue;
    const extended = extendSilentRange(state.after, state.content, range, bounds ?? [0, state.content.length], state.readers);
    if (state.occupied.some(([start, end]) => start < extended[1] && end > extended[0])) continue;
    choices.push(extended);
  }
  if (choices.length === 0) return null;
  const best = choices.reduce((a, b) => Math.abs(b[0] - old[0]) < Math.abs(a[0] - old[0]) ? b : a);
  state.occupied.push(best);
  return best;
}

function validFormattingOccurrence(text: string, needle: string, at: number, range: Extent, bounds: Extent | undefined): boolean {
  if (bounds && (range[0] < bounds[0] || range[1] > bounds[1])) return false;
  const word = /[\p{L}\p{N}_]/u;
  if (word.test(needle[0]) && word.test(text[at - 1] ?? '')) return false;
  return !word.test(needle.at(-1)!) || !word.test(text[at + needle.length] ?? '');
}

function formattingComponents(state: FormattingMatchState, old: Extent): Array<{ old: Extent; bounds: Extent }> {
  const components: Array<{ old: Extent; bounds: Extent }> = [];
  const add = (previous: FormattingComponent, next: FormattingComponent | undefined) => {
    if (next && previous.start < old[1] && previous.end > old[0]) {
      components.push({ old: [Math.max(old[0], previous.start), Math.min(old[1], previous.end)], bounds: [next.start, next.end] });
    }
  };
  state.before.blocks.forEach((block, index) => {
    const next = state.after.blocks[index];
    if (next?.name === block.name) add(block, next);
  });
  state.before.tables.forEach((table, index) => {
    const next = state.after.tables[index];
    if (!compatibleTable(table, next, state.before, state.after)) return;
    table.rows.flat().forEach((cell, cellIndex) => {
      const current = next!.rows.flat()[cellIndex];
      if (formattingSlice(state.before, cell.start, cell.end) === formattingSlice(state.after, current.start, current.end)) add(cell, current);
    });
  });
  return components;
}

/** Pure canonical reanchoring for machine and source readers. The previous
 * bytes are trusted only after their exact stored span hashes verify. */
export function mappedFormattingCarryForwardRanges(
  previousContent: string,
  content: string,
  previousSpans: ReadonlyArray<{ charStart: number; charEnd: number; spanTextSha256: string }>,
  readers: FormattingReaders,
): FormattingCarryRange[] {
  for (const span of previousSpans) {
    if (!Number.isInteger(span.charStart) || !Number.isInteger(span.charEnd) || span.charStart < 0 ||
        span.charEnd <= span.charStart || span.charEnd > previousContent.length ||
        hashSpanText(previousContent.slice(span.charStart, span.charEnd)) !== span.spanTextSha256) {
      throw new SpanLineageError('Previous content does not verify the recorded lineage span.');
    }
  }
  const before = formattingProjection(previousContent, readers);
  const after = formattingProjection(content, readers);
  if (!before || !after) return [];
  const state = { before, after, content, readers, occupied: [] as Extent[] };
  const result: FormattingCarryRange[] = [];
  previousSpans.forEach((span, priorIndex) => {
    const old: Extent = [span.charStart, span.charEnd];
    const whole = mappedFormattingRange(state, old, undefined);
    const ranges = whole ? [whole] : formattingComponents(state, old)
      .map(component => mappedFormattingRange(state, component.old, component.bounds)).filter((range): range is Extent => range !== null);
    for (const [start, end] of ranges) {
      const imageRanges = after.excluded.map(([charStart, charEnd]) => ({ charStart, charEnd }));
      const pieces = subtractAttributedRanges([{ charStart: start, charEnd: end, text: content.slice(start, end) }], imageRanges, content);
      for (const piece of pieces) result.push({ priorIndex, charStart: piece.charStart, charEnd: piece.charEnd, spanText: piece.text });
    }
  });
  return result;
}
