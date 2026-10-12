/**
 * Segmentation (design §4): a source becomes headings, table blocks and prose
 * paragraphs; a paragraph becomes sentences, a sentence clauses. Offsets are
 * always into the original text, so every claim cites its exact place. Spans
 * that can never hold a value (section and table numbers, study codes, dates,
 * doses, durations, ages, thresholds, CI levels) are masked first (§3, C23).
 */
import { WORD_FIGURE } from './number';

export interface Span {
  start: number;
  end: number;
}

export interface Line extends Span {
  text: string;
  /** Leading spaces before the first cell (an indented row is a sub-row of the one above). */
  indent?: number;
  /** Cells already located (a table flattened onto one line, r1): used as they are. */
  cells?: Line[];
}

export type BlockKind = 'heading' | 'table' | 'prose';

export interface HeadingBlock extends Span {
  kind: 'heading';
  /** Section number ("12.3.1.2"), or '' for an unnumbered title line. */
  code: string;
  /** Depth of the section number; unnumbered titles are leaves under the current heading. */
  depth: number;
  title: string;
  titleStart: number;
}

export interface TableBlock extends Span {
  kind: 'table';
  title?: Line;
  lines: Line[];
}

export interface ProseBlock extends Span {
  kind: 'prose';
  text: string;
}

export type Block = HeadingBlock | TableBlock | ProseBlock;

export interface Sentence extends Span {
  text: string;
}

const isBlank = (s: string) => /^\s*$/.test(s);

/** Cells of a table row: split at '|' or at runs of two or more spaces. */
export function cellsOf(line: Line): Array<Line> {
  if (line.cells) return line.cells;
  const out: Line[] = [];
  const lead = line.text.includes('|') ? 0 : line.text.length - line.text.trimStart().length;
  const t = line.text.slice(lead).replace(/\s+$/, '');
  const base = line.start + lead;
  const sep = t.includes('|') ? /\|/g : /\s{2,}|\t/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (a: number, b: number) => {
    const raw = t.slice(a, b);
    const lead = raw.length - raw.trimStart().length;
    const s = raw.trim();
    out.push({ start: base + a + lead, end: base + a + lead + s.length, text: s });
  };
  sep.lastIndex = 0;
  while ((m = sep.exec(t)) !== null) {
    push(last, m.index);
    last = m.index + m[0].length;
  }
  push(last, t.length);
  // A markdown row's outer pipes ("| Any SAE | 14 (4.6) |") bound the row; they open and close no cell (r1).
  if (t.includes('|')) {
    if (/^\s*\|/.test(t) && out.length && out[0].text === '') out.shift();
    if (/\|\s*$/.test(t) && out.length && out[out.length - 1].text === '') out.pop();
  }
  return out;
}

/** A markdown header separator row: "|---|---|---|", "--- | ---". */
export const isRuleRow = (t: string): boolean => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(t);

const SECTION_LINE = /^(\s*)(\d{1,2}(?:\.\d{1,2}){1,6}|\d{1,2}(?=\s+[A-Z][A-Z ]{3,}$))(\s+)(.*)$/;
const TABLE_TITLE = /^\s*(?:\d+(?:\.\d+)*\s+)?(?:[A-Z]{2,4}\s+)?Table\s+[\w.-]+/;

/**
 * A header row whose column padding a text extractor collapsed to single spaces: "Drug X (N=304) Placebo (N=303)".
 * Two or more arm headers, each with its own N, and nothing else on the line (r2 pv-table-row-label-n-pct-unaligned).
 */
export const FLAT_ARM_HEADER = /^\s*(?:[A-Za-z][\w .+/-]*?\(\s*N\s*=\s*[\d, ]+\s*\)\s*){2,}$/;

/** A line that reads as a table row: cells split by '|' or 2+ spaces, with at least two cells. */
function isTableish(line: Line): boolean {
  const t = line.text;
  if (t.includes('|')) return cellsOf(line).length >= 2 || isRuleRow(t);
  if (FLAT_ARM_HEADER.test(t)) return true;
  // Cells split by two or more spaces, or by a tab (a table copied from Word or Excel, r1 pv-tab-separated-table).
  return /\S(?:\s{2,}|\t)\S/.test(t) || (/\t/.test(t) && /\S/.test(t));
}

/**
 * A table flattened onto one line (r1 pv-table-flattened-to-one-line): "Table 14.3.1.2 … Safety Population Drug X
 * (N=304) Placebo (N=303) n (%) n (%) Any SAE 14 (4.6) 11 (3.6)". Read only when the line parses strictly as a title,
 * two or more arm headers with their N, optional unit declarations, then rows of exactly one value per arm; the cells
 * keep their offsets in the text. Anything else is not a table, and its figures are reported unread.
 */
function flatTable(line: Line): TableBlock | null {
  const t = line.text;
  const ARMH = /(?:Drug\s+[A-Z]|[A-Z][a-z]{3,}(?:\s+\d+(?:\.\d+)?\s?mg)?)\s*\(\s*N\s*=\s*[\d,]+\s*\)/g;
  const heads: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = ARMH.exec(t)) !== null) heads.push(m);
  if (heads.length < 2) return null;
  for (let k = 1; k < heads.length; k++) if (!/^\s*$/.test(t.slice(heads[k - 1].index + heads[k - 1][0].length, heads[k].index))) return null;
  const K = heads.length;
  const at = (i: number, len: number): Line => ({ start: line.start + i, end: line.start + i + len, text: t.slice(i, i + len) });
  const title = at(0, heads[0].index).text.trimEnd();
  if (!TABLE_TITLE.test(title)) return null;
  let pos = heads[K - 1].index + heads[K - 1][0].length;
  const units = new RegExp(String.raw`^((?:\s+(?:n\s*\(%\)|%\s*\(n\)|n\/N\s*\(%\)|%|n)){${K}})`, 'i').exec(t.slice(pos));
  const unitCells: Line[] = [];
  if (units) {
    const U = /n\s*\(%\)|%\s*\(n\)|n\/N\s*\(%\)|%|n/gi;
    let u: RegExpExecArray | null;
    while ((u = U.exec(units[1])) !== null) unitCells.push(at(pos + u.index, u[0].length));
    pos += units[1].length;
  }
  const VAL = String.raw`[-−–]?\d+(?:[.,]\d+)?\s*\(\s*[-−–]?\d+(?:[.,]\d+)?\s*%?\s*\)`;
  const ROW = new RegExp(String.raw`\s+([A-Za-z][A-Za-z ,'/-]*?)((?:\s+${VAL}){${K}})(?=\s+[A-Za-z]|\s*$)`, 'y');
  const rows: Line[] = [];
  ROW.lastIndex = pos;
  while (pos < t.length && (m = ROW.exec(t)) !== null) {
    const labelAt = m.index + m[0].indexOf(m[1]);
    const cells: Line[] = [at(labelAt, m[1].trimEnd().length)];
    const valuesAt = m.index + m[0].length - m[2].length;
    const V = new RegExp(VAL, 'g');
    let v: RegExpExecArray | null;
    while ((v = V.exec(m[2])) !== null) cells.push(at(valuesAt + v.index, v[0].length));
    rows.push({ ...at(labelAt, m.index + m[0].length - labelAt), cells });
    pos = m.index + m[0].length;
  }
  if (rows.length === 0 || t.slice(pos).trim() !== '') return null;
  const header: Line = { ...at(heads[0].index, pos - heads[0].index), cells: [at(heads[0].index, 0), ...heads.map((h) => at(h.index, h[0].length))] };
  header.cells![0] = { ...header.cells![0], text: '' };
  const lines: Line[] = [header];
  if (unitCells.length) lines.push({ ...at(unitCells[0].start - line.start, unitCells[unitCells.length - 1].end - unitCells[0].start), cells: [{ ...at(unitCells[0].start - line.start, 0), text: '' }, ...unitCells] });
  lines.push(...rows);
  return { kind: 'table', start: line.start, end: line.end, title: at(0, title.length), lines };
}

/** Short title-case lines without a sentence: "Gastrointestinal Adverse Reactions", "Elderly", "HbA1c (%)". */
function isTitleLine(t: string, figure = false): boolean {
  const s = t.trim();
  if (figure && !/^\s*\S[^:]*\(\s*%\s*\)\s*$/.test(s)) return false;
  if (!s || s.length > 110) return false;
  if (/[.;]\s*\S/.test(s.replace(/\b(?:vs|e\.g|i\.e|No)\./g, ''))) return false; // more than one sentence
  if (/\b(?:was|were|is|are|occurred|reported|had|received)\b/i.test(s)) return false;
  if (/^-{3,}|-{3,}$/.test(s)) return true;
  const words = s.replace(/[.:]$/, '').split(/\s+/);
  if (words.length > 14) return false;
  // Ends in a period only as a title ("Study ABC-301 Synopsis.", "Study KTX-201 Clinical Study Report.").
  if (/\.$/.test(s) && !/\b(?:Synopsis|Report|Study\s+[A-Z]{1,5}-\d+)\.$/.test(s)) return false;
  return !/\d+(?:[.,]\d+)?\s*%/.test(s) || /\(\s*%\s*\)/.test(s);
}

/**
 * Physical lines, with two splits a rendered document needs: a table title that
 * starts mid-line ("… as assessed by BICR. Table 6 Efficacy Results …") and a
 * section number that starts mid-line ("… dapralutide 1.5 mg. 12.7 Extension Period: …").
 */
export function linesOf(text: string): Line[] {
  const out: Line[] = [];
  let pos = 0;
  for (const raw of text.split('\n')) {
    const start = pos;
    pos += raw.length + 1;
    // [cutStart, cutEnd): the text between two virtual lines (an elision is dropped, a period kept).
    const cuts: Array<[number, number]> = [];
    const res: Array<[RegExp, boolean]> = [
      [/\.\s+(?=Table\s+\d[\w.-]*\s+[A-Z])/g, true],
      [/\.\s+(?=\d{1,2}(?:\.\d{1,2}){1,4}\s+[A-Z][A-Za-z ]{2,40}:)/g, true],
      [/\s+(?:\.\.\.|…)(?:\s+|$)/g, false],
    ];
    for (const [re, keepStop] of res) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw)) !== null) cuts.push(keepStop ? [m.index + 1, m.index + m[0].length] : [m.index, m.index + m[0].length]);
    }
    cuts.sort((a, b) => a[0] - b[0]);
    let last = 0;
    for (const [cs, ce] of [...cuts, [raw.length, raw.length] as [number, number]]) {
      if (cs < last) continue;
      const seg = raw.slice(last, cs);
      if (seg.trim()) out.push({ start: start + last, end: start + cs, text: seg });
      last = ce;
    }
    if (raw.trim() === '') out.push({ start, end: start + raw.length, text: raw });
  }
  return out;
}

/**
 * Blocks of a source. Table blocks run from a "Table …" title (or a header-like
 * line followed by rows) through rows, section rows and footnotes; prose lines
 * are paragraphs; a numbered line is a heading whose rest, when it holds a
 * sentence with figures, is a paragraph under it.
 */
export function blocksOf(text: string, masks: readonly Mask[] = []): Block[] {
  const lines = linesOf(text);
  /** Whether [start, end) holds a digit outside every mask: a figure. */
  const hasFigure = (start: number, end: number) => {
    for (let k = start; k < end; k++) if (/\d/.test(text[k]) && !inMask(masks, k, k + 1)) return true;
    return WORD_FIGURE.test(text.slice(start, end));
  };
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line.text)) {
      i++;
      continue;
    }
    // A table flattened onto its title line.
    if (TABLE_TITLE.test(line.text) && (i + 1 >= lines.length || isBlank(lines[i + 1].text))) {
      const flat = flatTable(line);
      if (flat) {
        blocks.push(flat);
        i++;
        continue;
      }
    }
    // Table: an explicit title, or a tableish line followed by another tableish line.
    const titled = TABLE_TITLE.test(line.text) && !/\b(?:was|were)\b/.test(line.text.slice(0, 200)) && i + 1 < lines.length;
    const tableStart = titled ? i + 1 : i;
    const labelValue = (l: Line | undefined) => !!l && /^[^.:]{2,80}:\s*[<>≤≥]?\s*[-−–]?\d/.test(l.text.trim()) && !/\b(?:was|were)\b/.test(l.text);
    let startsRows = false;
    for (let k = tableStart, seen = 0; k < lines.length && seen < 3; k++) {
      if (isBlank(lines[k].text)) continue;
      seen++;
      if (isTableish(lines[k]) || (titled && labelValue(lines[k]))) {
        startsRows = true;
        break;
      }
      if (/\b(?:was|were|is|are)\b/.test(lines[k].text)) break;
    }
    if ((titled && startsRows) || (!titled && isTableish(line) && i + 1 < lines.length && isTableish(lines[i + 1]))) {
      const tb: TableBlock = { kind: 'table', start: line.start, end: line.end, lines: [] };
      let j = i;
      if (titled) {
        tb.title = line;
        j = i + 1;
      }
      let blankRun = 0;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (isBlank(l.text)) {
          blankRun++;
          if (blankRun > 1) break;
          continue;
        }
        // A prose sentence after the rows ends the table, unless it is a footnote or note.
        const proseLike =
          !isTableish(l) &&
          !labelValue(l) &&
          /\b(?:was|were|is|are|occurred|reported|had)\b/.test(l.text) &&
          !/^\s*(?:\^?[a-z]\s|\^[a-z]|Percentages|The\s+intent-to-treat|Changes\s+and|P\s*=|NR\s*=|\(columns?:|Columns:|Of\s+all|Analysis:)/.test(l.text);
        if (proseLike && tb.lines.length > 0) break;
        if (SECTION_LINE.test(l.text) && !isTableish(l) && tb.lines.length > 0) break;
        if (blankRun === 1 && tb.lines.length > 0 && !isTableish(l) && !labelValue(l) && !/^\s*(?:\^?[a-z]\s|\^[a-z])/.test(l.text)) {
          break;
        }
        blankRun = 0;
        tb.lines.push(l);
        tb.end = l.end;
      }
      blocks.push(tb);
      i = j;
      continue;
    }
    const sec = SECTION_LINE.exec(line.text);
    if (sec) {
      const code = sec[2];
      const restStart = line.start + sec[1].length + sec[2].length + sec[3].length;
      const rest = sec[4];
      const depth = code.split('.').length;
      // The title is the rest when it holds no figure, else its first sentence when that holds none.
      const stop = /\.\s+(?=[A-Z(])/.exec(rest);
      const first = stop ? rest.slice(0, stop.index + 1) : rest;
      // A title whose only figures are population sizes in parentheses ("… Pool (DPL-301, DPL-302; Safety Population
      // N=1,219)", "…, Full Analysis Set (all randomised; placebo N=304, dapralutide N=303), treatment-policy estimand").
      const sizes = [...rest.matchAll(/\s*\([^()]*\bN\s*=\s*\d[^()]*\)/g)];
      let gapAt = 0;
      let figureOutside = false;
      for (const sz of [...sizes, null]) {
        const end = sz ? sz.index! : rest.length;
        if (hasFigure(restStart + gapAt, restStart + end)) figureOutside = true;
        if (sz) gapAt = sz.index! + sz[0].length;
      }
      const sizedTitle = sizes.length > 0 && !figureOutside && isTitleLine(rest.replace(/\s*\([^()]*\bN\s*=\s*\d[^()]*\)/g, ''));
      // "12.7 Extension Period: cumulatively through Week 52, nausea …": a short title, a colon, then its prose.
      const titled = /^([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,4}):\s+(?=\S)/.exec(rest);
      if (titled && hasFigure(restStart, restStart + rest.length) && !hasFigure(restStart, restStart + titled[1].length)) {
        blocks.push({ kind: 'heading', start: line.start, end: restStart + titled[1].length, code, depth, title: titled[1], titleStart: restStart });
        const ps = restStart + titled[0].length;
        blocks.push({ kind: 'prose', start: ps, end: line.end, text: text.slice(ps, line.end) });
        i++;
        continue;
      }
      if (!stop && (!hasFigure(restStart, restStart + rest.length) || isTitleLine(rest, hasFigure(restStart, restStart + rest.length)) || sizedTitle)) {
        blocks.push({ kind: 'heading', start: line.start, end: line.end, code, depth, title: rest, titleStart: restStart });
      } else if (stop && !hasFigure(restStart, restStart + first.length) && first.length < 160) {
        blocks.push({ kind: 'heading', start: line.start, end: restStart + first.length, code, depth, title: first, titleStart: restStart });
        const ps = restStart + stop.index + stop[0].length;
        blocks.push({ kind: 'prose', start: ps, end: line.end, text: text.slice(ps, line.end) });
      } else {
        blocks.push({ kind: 'heading', start: line.start, end: restStart, code, depth, title: '', titleStart: restStart });
        blocks.push({ kind: 'prose', start: restStart, end: line.end, text: rest });
      }
      i++;
      continue;
    }
    if (isTitleLine(line.text, hasFigure(line.start, line.end))) {
      const lead = line.text.length - line.text.trimStart().length;
      blocks.push({ kind: 'heading', start: line.start, end: line.end, code: '', depth: 99, title: line.text.trim(), titleStart: line.start + lead });
      i++;
      continue;
    }
    // A prose line continues on the next physical line when the sentence is wrapped (PDF or Word extraction: the line
    // ends mid-sentence and the next starts in lower case or with a figure), or when it ends with a colon and bullet
    // lines follow ("SAEs were reported as follows:" / "- Drug X: 4.4%"). One paragraph, offsets into the original text
    // (r1 pv-sentence-split-by-line-break, pv-bulleted-list).
    let j = i + 1;
    let end = line.end;
    let bullets = /:\s*$/.test(line.text);
    while (j < lines.length && !isBlank(lines[j].text)) {
      const prev = text.slice(line.start, end);
      const next = lines[j].text;
      // A list row with no bullet character at all — "Drug X – 19 (6.4%)", "Placebo: 10 (3.3%)" — after a line that
      // ends with a colon is a row of that list, like a bulleted one (r2 pv-arm-list-one-per-line-en-dash).
      const plainRow = /^\s*[A-Za-z][\w +.-]{0,40}?\s*(?:[–—-]|:)\s*[<>≤≥]?\s*\d/.test(next) && !/\b(?:was|were|is|are)\b/.test(next);
      const bullet = (/^\s*(?:[-–•*]|\d+[.)])\s+\S/.test(next) || plainRow) && bullets;
      const wrapped = !/[.!?:;]\s*$/.test(prev) && /^\s*[a-z0-9(]/.test(next) && !isTableish(lines[j]) && !SECTION_LINE.test(next);
      if (!bullet && !wrapped) break;
      if (bullet) bullets = true;
      end = lines[j].end;
      j++;
    }
    blocks.push({ kind: 'prose', start: line.start, end, text: text.slice(line.start, end) });
    i = j;
  }
  return blocks;
}

const ABBREV = /\b(?:vs|e\.g|i\.e|ca|No|approx|Fig|al|Ref|incl|Inc|Ltd|Dr|St|resp)\.$/i;

/** Sentences of a paragraph: split at ". ", "? ", "! " and " ... ", never inside brackets or a decimal. */
export function sentencesOf(text: string, base: number): Sentence[] {
  const out: Sentence[] = [];
  let depth = 0;
  let start = 0;
  const push = (end: number) => {
    const seg = text.slice(start, end);
    const lead = seg.length - seg.trimStart().length;
    const s = seg.trim();
    if (s) out.push({ start: base + start + lead, end: base + start + lead + s.length, text: s });
  };
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    if (depth > 0) continue;
    if (text.startsWith(' ... ', k) || text.startsWith(' … ', k)) {
      push(k);
      start = k + (text[k + 1] === '…' ? 3 : 5);
      k = start - 1;
      continue;
    }
    if ((ch === '.' || ch === '?' || ch === '!') && /\s/.test(text[k + 1] ?? ' ')) {
      const before = text.slice(Math.max(0, k - 8), k + 1);
      if (ch === '.' && ABBREV.test(before)) continue;
      // "1. Drug X: 19 (6.4%)": the period after a numbered list's ordinal is part of the list marker, not a
      // sentence end (r2 pv-arm-list-numbered-ordinals-as-figures).
      if (ch === '.' && /(?:^|[\n\r])[ \t]*\d{1,2}$/.test(text.slice(0, k + 1).replace(/\.$/, ''))) continue;
      // A section number after the stop starts a new sentence; a lower-case word continues an abbreviation.
      if (ch === '.' && /^\s+[a-z]/.test(text.slice(k + 1)) && /\b[A-Z][a-z]{0,3}\.$/.test(before)) continue;
      push(k + 1);
      start = k + 1;
    }
  }
  push(text.length);
  return out;
}

/**
 * Clauses of a sentence: split at ';' outside brackets, and at ", and" /
 * ", while" / ", whereas" when the text after it holds its own figure and
 * predicate (fs-21 "…, and 90% of them resolved", fs-27 "…, and the risk of a
 * first disease flare … was reduced (HR 0.75 …)").
 */
export function clausesOf(s: Sentence): Sentence[] {
  const out: Sentence[] = [];
  let depth = 0;
  let start = 0;
  const t = s.text;
  const coordinated = (k: number) => {
    const m = /^,\s+(?:and|while|whereas)\s+/.exec(t.slice(k));
    if (!m) return 0;
    const rest = t.slice(k + m[0].length);
    const next = rest.search(/[;]|,\s+(?:and|while|whereas)\s+/);
    const part = next >= 0 ? rest.slice(0, next) : rest;
    return /\d/.test(part) && /\b(?:was|were|is|are|occurred|reported|resolved|recovered|reduced|increased|achieved|had|gave|died)\b/.test(part) ? m[0].length : 0;
  };
  const push = (end: number) => {
    const seg = t.slice(start, end);
    const lead = seg.length - seg.trimStart().length;
    const x = seg.trim();
    if (x) out.push({ start: s.start + start + lead, end: s.start + start + lead + x.length, text: x });
  };
  for (let k = 0; k < t.length; k++) {
    const ch = t[k];
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    else if (ch === ';' && depth === 0) {
      push(k);
      start = k + 1;
    } else if (ch === ',' && depth === 0) {
      const len = coordinated(k);
      if (len > 0) {
        push(k);
        start = k + 1;
      }
    }
  }
  push(t.length);
  return out;
}

/**
 * A sentence's chain of comma-set scope phrases before its main clause: "In the full analysis set (…), under the
 * treatment-policy estimand (…), the LS mean change …" → "In the full analysis set (…), under the treatment-policy
 * estimand (…),". Each link opens with a preposition and holds no figure of its own outside brackets.
 */
export function openerChainOf(s: Sentence): Sentence | null {
  const link = /^\s*(?:In|Among|For|During|Through|Over|At|By|After|Within|From|Up\s+to|Until|On|With|Of|Under|Using)\b[^,;:()]*(?:\([^)]*\)[^,;:()]*)*,/i;
  let end = 0;
  for (;;) {
    const m = link.exec(s.text.slice(end));
    if (!m || /\d+(?:[.,]\d+)?\s?%/.test(m[0].replace(/\([^)]*\)/g, ''))) break;
    end += m[0].length;
  }
  return end > 0 ? { start: s.start, end: s.start + end, text: s.text.slice(0, end) } : null;
}

/** A sentence's opening scope phrase ("In Study RA-301 (FAS),", "Safety (Safety Population):"), which applies to all its clauses. */
export function openerOf(s: Sentence): Sentence | null {
  const m = /^(?:(?:In|Among|For|During|Through|Over|At|By|After|Within|From|Up\s+to|Until|On|With|Of)\b[^,;:]*(?:\([^)]*\)[^,;:]*)*,|[^,;:]{2,80}:)/.exec(s.text);
  if (!m || /\d+(?:[.,]\d+)?\s?%/.test(m[0])) return null;
  return { start: s.start, end: s.start + m[0].length, text: m[0] };
}

// ── Non-figure masks (C23) ──────────────────────────────────────────────────

export type MaskKind =
  | 'section'
  | 'table_ref'
  | 'study'
  | 'date'
  | 'dose'
  | 'duration'
  | 'timepoint'
  | 'age'
  | 'threshold'
  | 'ci_level'
  | 'ratio'
  | 'version'
  | 'phone'
  | 'unit'
  | 'endpoint_code'
  | 'grade'
  | 'design';

export interface Mask extends Span {
  kind: MaskKind;
}

const MASKS: Array<[MaskKind, RegExp]> = [
  // A section number never carries a "%": "3.6% of patients …" at the start of a wrapped line is a figure (r1).
  ['section', /^\s*\d{1,2}(?:\.\d{1,2})+\b(?!\s?%)/gm],
  ['section', /(?<=\.\s)\d{1,2}(?:\.\d{1,2}){1,4}(?=\s+[A-Z])/g],
  ['section', /^\s*\d{1,2}(?=\s+[A-Z][A-Z ]{3,}$)/gm],
  ['section', /^\s*\d{1,2}(?=\s*$|\s+(?:\.\.\.|…))/gm],
  ['section', /\(\s*\d{1,2}(?:\.\d{1,2})+\s*\)/g],
  ['section', /\bSections?\s+\d+(?:\.\d+)*/gi],
  ['section', /\b\d{1,2}(?:\.\d{1,2}){2,}\b/g],
  ['section', /(?<=\/\s?)\d{1,2}(?:\.\d{1,2})+/g],
  ['section', /\bSAP\s+Section\s+[\d.]+/gi],
  ['table_ref', /\b(?:Tables?|Figures?|Listings?)\s+\d[\w]*(?:[.-]\d+[\w]*)*/gi],
  ['study', /\bNCT\d{8}\b/g],
  ['study', /\b[A-Z]{1,5}-(?:\d{2,4}|LTE|OLE|EXT)\b/g],
  ['study', /\b(?:Trials?|Studies|Study)\s+\d{1,2}(?:\s*(?:,|and)\s*\d{1,2})*\b(?![.\d])/g],
  ['study', /\bStudies\s+\d{3}(?:\s*,\s*\d{3})*(?:,?\s*(?:and\s+)?\d{3})?/g],
  ['study', /\ball\s+\d+\s+studies\b/gi],
  ['study', /\bPool\s+[A-Z]?\d\b/g],
  ['study', /\bin\s+\d+\s+clinical\s+studies\b/gi],
  ['study', /\bPhase\s+\d(?:\/\d)?\b/gi],
  ['study', /\bPart\s+[A-D]\b/g],
  ['date', /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi],
  ['date', /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi],
  ['date', /\b\d{1,2}[-/](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-/]\d{2,4}\b/gi],
  ['dose', /\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|ug|g|mL|IU|units)(?:\/(?:kg|day|m2|week))?(?:\s+(?:once|twice)\s+(?:daily|weekly)|\s+Q[1-4]W|\s+every\s+\d+\s+weeks)?\b/gi],
  ['dose', /\(?\s*(?:<=|>=|≥|≤)?\s*\d+\s*mg\/day\s*\)?/gi],
  ['duration', /\b\d+-(?:week|month|day|year|hour)\b/gi],
  ['duration', /\(\s*\d+\s+weeks\s*\)/gi],
  ['duration', /\b(?:for\s+)?(?:at\s+least|>=|≥|more\s+than)\s+\d+\s+(?:weeks|months|days)\b/gi],
  ['duration', /\b\d+\s+(?:months|weeks)\s+or\s+longer\b/gi],
  ['duration', /\b(?:up\s+to|within|after)\s+\d+\s+(?:weeks|days|months)\b/gi],
  ['duration', /\bmore\s+than\s+\d+\s+days\b/gi],
  ['duration', /\b\d+\s+days\s+(?:of|after)\s+(?:the\s+)?last\s+dose\b/gi],
  ['duration', /\(\s*(?:Weeks?\s+)?\d+\s*[-–]\s*\d+\s*\)/gi],
  // One space between the unit and its number: a table column gap ("0–6 months      1,512") is not "Month 1" (pvs-36).
  ['timepoint', /\b(?:Weeks?|Months?|Day|Days|Years?)[ \u00a0]\d+(?:[–-]\d+|\s+[–-]\s+\d+(?![.,]\d))?\b/gi],
  ['timepoint', />?\s*\d+\s*[–-]\s*\d+\s+months\b/gi],
  ['timepoint', /^\s*>\s*\d+\s+months\b/gim],
  ['timepoint', /\b0\s*[–-]\s*6\s+months\b/gi],
  ['timepoint', /\bfirst\s+\d+\s+months\b/gi],
  ['age', /\b\d+\s+years?\s+(?:of\s+age|old)\b/gi],
  ['age', /\b\d+\s+to\s+\d+\s+years\b/gi],
  ['age', /(?:aged|age)\s*(?:≥|>=|<|≤|<=)?\s*\d+/gi],
  ['age', /(?:≥|>=|<|≤|<=)\s*\d+\s*(?:years|yrs)\b/gi],
  ['age', /\b(?:younger|older)\s+than\s+\d+(?:\s+years)?/gi],
  ['age', /\b\d+\s+years\s+(?:or|and)\s+older\b/gi],
  ['age', /^\s*(?:<|≥|>=)\s*\d+\s+years\b/gim],
  ['threshold', /(?:<=|>=|[<>≤≥])\s*\d+(?:[.,]\d+)?\s?%\s*(?=\s*(?:of\s+(?:Patients|Subjects)\b|in\s+(?:any|either)\b|\)|\s*and\s+More|$|\s+(?:weight|body)))/g],
  // A selection criterion in a title ("Reported in >=5% of Patients"); after "was/were" it is a figure ("was reported in <1%").
  ['threshold', /(?<!\b(?:was|were)\s+)\b(?:Reported|Occurring|reported|occurring)\s+in\s+(?:<=|>=|[<>≤≥])\s*\d+\s?%/g],
  ['threshold', /\((?:incidence\s+)?(?:<=|>=|[<>≤≥])\s*\d+\s?%\)/g],
  ['threshold', /\bin\s+(?:<=|>=|[<>≤≥])\s*\d+\s?%\s+of\s+patients\s+included\b/g],
  ['threshold', /(?:HbA1c|A1C)\s*(?:<|<=|≤)\s*\d+(?:\.\d+)?\s?%/gi],
  ['threshold', /(?:<=|>=|[<>≤≥])\s*\d+(?:[.,]\d+)?\s?%\s+(?:weight|body\s+weight)/gi],
  ['threshold', /(?:<=|>=|[<>≤≥])\s*\d+\s*(?:mg\/dL|mmol\/L)/gi],
  ['threshold', /\b\d+\s+times\s+the\s+upper\s+limit\s+of\s+normal\b|\b\d+\s*x\s*ULN\b|>\s*\d+xULN/gi],
  ['threshold', /\bmargin\s+(?:of\s+)?[-−–]?\d+(?:[.,]\d+)?\s?%/gi],
  ['threshold', /\(margin\s+[-−–]?\d+(?:[.,]\d+)?\s?%\)/gi],
  ['threshold', /\b[-−–]?\d+(?:[.,]\d+)?\s?%\s+margin\b/gi],
  ['threshold', /\b(?:≥|>=|<|≤)\s*1\s*\/\s*\d[\d ]*/g],
  ['threshold', /\b\d+\s+in\s+\d+\s+people\b/gi],
  ['threshold', /\bHbA1c\s*\(\s*(?:<=|>=|≤|≥|<|>)\s*\d+(?:\.\d+)?\s*%\s*vs\s*(?:<=|>=|≤|≥|<|>)\s*\d+(?:\.\d+)?\s*%\s*\)/gi],
  ['threshold', /\balpha\s+of\s+0[.,]\d+/gi],
  ['ci_level', /\b(?:two-sided\s+|one-sided\s+)?\d+(?:[.,]\d+)?\s?%\s?(?=(?:CI|CrI|confidence\s+interval|credible\s+interval)\b)/gi],
  ['ratio', /\b\d:\d\b/g],
  ['version', /\bv\d+(?:\.\d+)?\b/gi],
  ['phone', /\b1-800-[\w-]+\b/g],
  ['unit', /\bkg\/m2\b/gi],
  ['unit', /\bper\s+100\s+(?:patient|subject|person)-years\b/gi],
  ['unit', /\bper\s+100\s+PY\b/gi],
  // "6.4/100 PY": the rate's unit, never a count over a denominator of 100 (r1 nsf-22).
  ['unit', /\/\s?100\s+(?:PY|patient-years|subject-years|person-years)\b/gi],
  ['endpoint_code', /\b(?:FEV1|HbA1c|A1C|ACQ-\d|EASI[\s-]?\d+|PASI[\s-]?\d+|ACR\s?\d+|SVR\d+|AUC\s?0-(?:\d+h?|t|inf|last|tau)|AUC0-3h|AUC0-inf|PD-L1|24-hour|MedDRA\s+v?[\d.]+|CTCAE\s+v?[\d.]+|PGI-S|Q2W|IgG\d|T2D|ECOG\s+PS)\b/gi],
  // "sPGA 0/1", "IGA 0/1": the response category, never a count over a denominator (r1 nsf-15).
  ['endpoint_code', /\b(?:sPGA|v?IGA)\s*(?:score\s+of\s+)?0\s*\/\s*1\b/gi],
  // "Protocol Amendment 3", "site 104", "Stage 1": designations, never figures (r1).
  ['design', /\b[Aa]mendment\s+\d+\b|\bsite\s+\d+\b|\bStage\s+\d\b/g],
  ['grade', /\bGrades?\s*(?:≥|>=)?\s*\d(?:\s*(?:or|-|–|to|and)\s*\d)?\b/gi],
  ['grade', /\bLevel\s+\d\b/gi],
  ['design', /\bat\s+\d+\s+sites\b|\bin\s+\d+\s+countries\b|\b\d+\s+sites\b/gi],
  ['design', /\(\s*range:\s*[\d.]+\s+to\s+[\d.]+\s*\)/gi],
  ['design', /\b\d+%\s+of\s+events\b/gi],
  ['design', /\b\d+\s+events\b(?=\s*\))/gi],
  ['design', /\bnumber\s+needed\s+to\s+treat\s+of\s+\d+/gi],
  ['design', /\(SD\)/gi],
];

/** Every non-figure span of a text, sorted. */
export function masksOf(text: string): Mask[] {
  const out: Mask[] = [];
  for (const [kind, re] of MASKS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      out.push({ kind, start: m.index, end: m.index + m[0].length });
    }
  }
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}

export function inMask(masks: readonly Mask[], start: number, end: number): Mask | undefined {
  for (const m of masks) {
    if (m.start > start) break;
    if (m.start <= start && m.end >= end) return m;
  }
  return undefined;
}

/** The text with masked spans blanked (same length), for convention detection and figure sweeps. */
export function blankMasks(text: string, masks: readonly Mask[]): string {
  const chars = text.split('');
  for (const m of masks) for (let k = m.start; k < m.end; k++) if (chars[k] !== '\n') chars[k] = ' ';
  return chars.join('');
}
