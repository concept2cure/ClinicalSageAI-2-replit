/**
 * The table model (design §6.3). A table is a title, header line(s), rows and
 * footnotes. Header cells name arms (with their N), units ("n (%)", "%"),
 * studies, or measures ("LS mean difference … (95% CI)", "EAIR per 100 PY",
 * "HR", "95% CI", "p"). Value cells align to the header: by position in a
 * pipe table, from the right in a space-aligned one; a single value in a table
 * of two arms is a spanning row (an effect of the contrast). Row labels name
 * the measure (event category, preferred term, disposition, effect, median,
 * responders, change, p-value, CI); a row without values is a section row that
 * sets the endpoint or parent category of the rows below it. Footnotes bind by
 * marker. Lines that are prose or "label: value" are read by the prose forms
 * under the table's context.
 */
import { readClause } from './clause';
import { emptyCtx, populationOf, withQuals, type Ctx, type Draft } from './context';
import { aliasesOf, armRef, isControlArm, type DocInfo } from './doc';
import { estimateAt, pBasisOf, type EstimateGroup } from './ci';
import type { Env, ParaState } from './env';
import { resolveType, scaleOf, unitOf } from './forms-efficacy';
import { itemValue } from './forms-safety';
import { armOf, itemsIn } from './items';
import { readNumber, type WrittenNumber } from './number';
import { qualsOf, studiesIn, type Quals } from './quals';
import { cellsOf, clausesOf, isRuleRow, sentencesOf, type Line, type Span, type TableBlock } from './segment';
import type { ArmRef, CI, ClaimValue, Contrast, PopulationSet, StudyRef } from './types';
import { EFFECT_ROWS, eairEventOf, EVENT_ROWS, groupingKey, PERIOD_ROWS, SUBGROUP_ROWS, termKey, type EffectType, type EventCategory } from './vocabulary';

interface Column {
  text: string;
  arm?: ArmRef;
  n?: { w: WrittenNumber; span: Span };
  study?: StudyRef;
  pct?: boolean;
  /** An "n (%)" column: a bare number in it is the count n, a bracketed one its percentage. */
  nPct?: boolean;
  /** A "% (n)" column: the percentage first, its count in brackets (r1 pv-table-pct-n-column-order). */
  pctN?: boolean;
  /** A measure column: 'estimate', 'ci', 'p', 'phase', 'n', 'eair', 'at_risk', 'grade:any', 'grade:3-4', 'effect'. */
  measure?: string;
  effect?: { type: EffectType; ls: boolean; contrast?: Contrast; ci?: CI };
  /** Qualifiers a measure column's header states for its own cells ("…, FAS (95% CI)", "at Week 26"). */
  quals?: Quals;
}

interface Row {
  line: Line;
  label: string;
  labelSpan: Span;
  cells: Line[];
  /** Value cells with their column index (-1: spanning). */
  values: Array<{ cell: Line; col: number }>;
  indent: number;
  markers: string[];
}

const VALUE_CELL = /^(?:[<>≤≥]\s*)?[-−–]?\s?\d|^NR$|^\(\s*[-−–]?\d/;
const isValue = (t: string) => VALUE_CELL.test(t.trim()) && !/^\(?\s*N\s*=|^n\s*\(%\)|^\d+(?:[.,]\d+)?\s?%\s*(?:CI|CrI|confidence)/i.test(t.trim());

function ciDeclOf(s: string): CI | undefined {
  const m = /\(?\s*(?:(two|one)-sided\s+)?(\d+(?:[.,]\d+)?)\s?%\s?(CI|confidence\s+interval|CrI|credible\s+interval)/i.exec(s);
  if (!m) return undefined;
  return { level: m[2].replace(',', '.'), sided: m[1] === 'one' ? 'one' : 'two', sidedStated: !!m[1], kind: /credible|CrI/i.test(m[3]) ? 'credible' : 'confidence' };
}

function effectIn(s: string): { type: EffectType; ls: boolean } | undefined {
  for (const row of EFFECT_ROWS) {
    row.re.lastIndex = 0;
    if (row.re.test(s)) return { type: row.key, ls: row.key === 'ls_mean_difference' };
  }
  return undefined;
}

/** A header cell → its column. */
function columnOf(cell: Line, doc: DocInfo): Column {
  const t = cell.text.replace(/\^[a-z]/g, '').trim();
  const col: Column = { text: t };
  const nm = /\(?\s*N\s*=\s*([\d][\d,. ]*\d|\d)\s*\)?/i.exec(t);
  if (nm) {
    const w = readNumber(nm[1], { convention: doc.convention, countSlot: true });
    const at = cell.start + cell.text.indexOf(nm[1]);
    if (w) col.n = { w, span: { start: at, end: at + nm[1].length } };
  }
  if (/(?:^|\s)%$|\bn\s*\(%\)|n\/N\s*\(%\)|\(%\)$/i.test(t)) col.pct = true;
  if (/\bn\s*\(%\)|n\/N\s*\(%\)/i.test(t)) col.nPct = true;
  if (/(?:^|\s)%\s*\(\s*n\s*\)/i.test(t)) col.pctN = true;
  const studies = studiesIn(t, cell.start, doc);
  if (studies.length >= 1) col.study = { kind: 'study', aliases: studies[0].aliases };
  let armText = t
    .replace(/\(?\s*N\s*=\s*[\d,. ]+\)?/gi, '')
    .replace(/\bn\/N\s*\(%\)|\bn\s*\(%\)|\s*%$/gi, '')
    .replace(/\b(?:Trial|Study)\s+\d+\b\s*(?:\(\s*NCT\d{8}\s*\))?/g, '')
    .replace(/\bNCT\d{8}\b/g, '')
    .trim();
  armText = armText.replace(/\s*\+\s*Metformin$/i, '').trim();
  if (/^Total$/i.test(armText)) col.arm = { kind: 'total' };
  // "All Grades" is a grade column, not a combined arm like "All Pradoxetine" (lu-24). A USPI Table 1
  // writes "All Grades" where a CTCAE-based CSR table writes "Any Grade"; they are one measure, and
  // reading them as two left no oncology label AE table comparable with its CSR (r2 lbl-11).
  else if (/^(?:All|Any)\s+Grades?$/i.test(armText)) col.measure = 'grade:any';
  else if (/^All\s+([A-Za-z][\w-]+)$/i.test(armText) || /^([A-Za-z][\w-]+)\s+total$/i.test(armText)) {
    const drug = (/^All\s+([A-Za-z][\w-]+)$/i.exec(armText) ?? /^([A-Za-z][\w-]+)\s+total$/i.exec(armText))![1].toLowerCase();
    col.arm = { kind: 'combined', drug, doses: 'all', label: armText };
  } else if (/^(?:Estimate|Point\s+estimate)$/i.test(armText)) col.measure = 'estimate';
  else if (/^\d+(?:[.,]\d+)?\s?%\s*CI$/i.test(armText)) col.measure = 'ci';
  else if (/^(?:p|p-value)$/i.test(armText)) col.measure = 'p';
  else if (/^Phase$/i.test(armText)) col.measure = 'phase';
  else if (/^Randomi[sz]ed\s*\(N\)$/i.test(armText)) col.measure = 'n:randomized';
  else if (/^Patients\s+at\s+risk$/i.test(armText)) col.measure = 'at_risk';
  else if (/EAIR|per\s+100\s+PY/i.test(armText)) col.measure = 'eair';
  else if (/^Grades?\s+3\s*(?:or|to|through|[-–—/])\s*4$/i.test(armText)) col.measure = 'grade:grade3-4';
  else if (/^Grades?\s*(?:>=|≥)\s*3$/i.test(armText)) col.measure = 'grade:grade3+';
  else if (/^(?:HR|Hazard\s+ratio)$/i.test(armText)) {
    col.measure = 'effect';
    col.effect = { type: 'hazard_ratio', ls: false };
  } else {
    const eff = effectIn(armText);
    if (eff) {
      col.measure = 'effect';
      const contrast = /\b([A-Z][\w ]*?)\s+(?:-|−|minus|vs\.?|versus)\s+(placebo|[a-z]+)\b/i.exec(armText);
      const vs = /\b(?:vs\.?|versus)\s+(placebo|[A-Za-z]+)\b/i.exec(armText);
      col.effect = { ...eff, ci: ciDeclOf(armText) };
      col.quals = qualsOf(armText, 0, { ...doc, text: armText });
      const test = contrast ? armOf(contrast[1]) : null;
      const ctl = contrast ? armOf(contrast[2]) : null;
      if (test && ctl) col.effect.contrast = { test, control: ctl, stated: true };
      else if (vs) {
        const control = armOf(vs[1]);
        if (control) col.effect.contrast = { control, stated: false };
      }
    } else if (armText) {
      const a = armOf(armText) ?? armRef(armText, doc);
      if (a) col.arm = a;
    }
  }
  return col;
}

/** Whether x, as written, is n as a percentage of N: |x·N − 100·n| ≤ ½·10^−dp·N, in exact integers. */
function isPercentOf(n: WrittenNumber, N: WrittenNumber, x: WrittenNumber): boolean {
  if (n.dp !== 0 || N.dp !== 0 || x.kind !== 'exact' || !/^\d+$/.test(N.digits) || N.digits === '0') return false;
  const [xi, xf = ''] = x.digits.split('.');
  const X = BigInt(`${xi}${xf}`);
  const scale = 10n ** BigInt(x.dp);
  const bigN = BigInt(N.digits);
  const diff = X * bigN - 100n * BigInt(n.digits) * scale;
  return 2n * (diff < 0n ? -diff : diff) <= bigN;
}

const isHeaderRow = (cells: Line[]) => cells.length >= 1 && cells.every((c) => !isValue(c.text) || /^\(?\s*N\s*=/i.test(c.text.trim()));
/**
 * A header continuation row that states only units — "%", "n (%)", "n/N (%)", "% (n)", "n" — as a
 * label table rendered from PDF does when the unit sits under the header rather than inside it
 * (r2 lbl-03). It carries no letter and no bracket, so it is not a header row by the letter test,
 * and read as data every value below it is framed against the wrong unit.
 */
const isUnitsRow = (cells: Line[]) =>
  cells.some((c) => c.text.trim()) &&
  cells.every((c) => !c.text.trim() || /^(?:%|n|n\s*\(\s*%\s*\)|n\/N\s*\(\s*%\s*\)|%\s*\(\s*n\s*\))$/i.test(c.text.trim()));

/** Footnotes: "^a text", "a Text", "^a … ^b …" on one line. */
function footnotesOf(lines: Line[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of lines) {
    const t = l.text.trim();
    if (/^\^[a-z]\s/.test(t)) {
      for (const part of t.split(/(?=\^[a-z]\s)/)) {
        const m = /^\^([a-z])\s+(.*)$/.exec(part.trim());
        if (m) out.set(m[1], m[2].trim());
      }
    } else {
      const m = /^([a-z])\s+([A-Z].*)$/.exec(t);
      if (m) out.set(m[1], m[2].trim());
    }
  }
  return out;
}

const isFootnoteLine = (t: string) => /^\s*\^[a-z]\s/.test(t) || /^\s*[a-z]\s+[A-Z]/.test(t);

/** The label's footnote markers: "^a", a letter glued after ")" ("(95% CI)a"), or after a known word ("p-valueb"). */
function markersOf(label: string, notes: Map<string, string>): { clean: string; markers: string[] } {
  const markers: string[] = [];
  let clean = label.replace(/\^([a-z])/g, (_, x: string) => {
    markers.push(x);
    return '';
  });
  const glued = /\)([a-z])$/.exec(clean) ?? /\b(p-value|survival|ratio)([a-z])$/i.exec(clean);
  if (glued && notes.has(glued[glued.length - 1])) {
    markers.push(glued[glued.length - 1]);
    clean = clean.slice(0, -1);
  }
  return { clean: clean.trim(), markers };
}

function applyNotes(ctx: Ctx, markers: string[], notes: Map<string, string>, doc: DocInfo): Ctx {
  let out = ctx;
  for (const k of markers) {
    const note = notes.get(k);
    if (!note) continue;
    const q = qualsOf(note, 0, { ...doc, text: note });
    out = withQuals(out, { ...q, studies: [], pools: [] }, 'footnote', doc);
  }
  return out;
}

const RESPONDER_LABEL = /^(?:Responders|Remission|Clinical\s+remission|Percentage\b|Proportion\b|Overall\s+Response\s+Rate|Objective\s+response\s+rate|Complete\s+response|Partial\s+response|ORR\b)/i;
/**
 * The responder-row stub a USPI section 14 table writes instead of "Percentage of patients …":
 * "Patients achieving HbA1c <7%, %" (r2 lbl-12). "achieving"/"reaching"/"attaining", and "with a
 * response/remission", are responder language; "Patients with <event>" is not, and stays an
 * incidence row (r1 nsf-24).
 */
const RESPONDER_ACHIEVED = /^(?:Patients|Subjects|Participants)\s+(?:achieving|reaching|attaining|who\s+(?:achieved|reached|attained)|with\s+(?:a\s+)?(?:response|remission))\b/i;

export function tableDrafts(tb: TableBlock, outer: Ctx, doc: DocInfo, consumed: Span[]): Draft[] {
  const drafts: Draft[] = [];
  let tctx: Ctx = { ...outer, analysis: { ...outer.analysis }, unrecognised: [...outer.unrecognised] };
  const titleText = tb.title?.text ?? '';
  const notes = footnotesOf(tb.lines.filter((l) => isFootnoteLine(l.text)));
  if (tb.title) {
    const { clean, markers } = markersOf(titleText, notes);
    const q = qualsOf(clean, tb.title.start, doc);
    tctx = withQuals(tctx, q, 'table-title', doc, { inheritPool: true });
    tctx.unrecognised.push(...q.unrecognised);
    tctx = applyNotes(tctx, markers, notes, doc);
    tctx.title = titleText.trim();
    tctx.section = `${outer.section}|${titleText.trim()}`;
  }
  // A general note restricts every figure in the table, wherever in it the note sits: "Note: Japanese subset only."
  // makes the table's rates subgroup rates, never the study's overall ones. A footnote is where a CSR most often
  // carries such a restriction (r2 scope-13, C17).
  for (const l of tb.lines) {
    const gm = /^\s*Notes?\s*:\s*(\S.*)$/i.exec(l.text.trim());
    if (!gm) continue;
    const q = qualsOf(gm[1], l.start + l.text.indexOf(gm[1]), doc);
    tctx = withQuals(tctx, { ...q, studies: [], pools: [] }, 'footnote', doc, { inheritPool: true });
    tctx.unrecognised.push(...q.unrecognised);
  }
  if (/\bAdverse\s+Reactions?\b/i.test(titleText)) tctx.basis = 'adverse_reaction';
  const byTerm = /\bby\s+Preferred\s+Term\b|\bAdverse\s+Reactions?\s+(?:Reported|Occurring)|\bCommon\s+(?:TEAEs|adverse\s+events)\b|\bTEAEs\s+by\s+Preferred\s+Term|Treatment-Emergent\s+Adverse\s+Events\s+Reported\s+in|TEAEs\s+Reported\s+in/i.test(titleText);
  const labTable = /Laboratory\s+(?:Abnormalit|Shift)/i.test(titleText);
  const titleArm = /\bWho\s+Received\s+([A-Z][a-z]+)\b/.exec(titleText);
  const env: Env = { doc, sentence: { start: tb.start, end: tb.end, text: doc.text.slice(tb.start, tb.end) }, consumed, state: {} as ParaState, respectively: false, sentenceDrafts: [] };
  const rd = (s: string, countSlot = false) => readNumber(s.trim(), { convention: doc.convention, countSlot }) ?? undefined;

  // Lines: rows (2+ cells), single-cell section rows, footnotes, notes, label-value lines, column declarations.
  const rows: Row[] = [];
  const proseLines: Line[] = [];
  let columns: Column[] = [];
  let headerCells: Line[][] = [];
  let labelHeader = '';
  let seenData = false;
  let pipe = false;
  /** The number of arm columns a single-space-separated header row named, for reading its rows (r2 phrasing). */
  let flatArms = 0;
  for (const l of tb.lines) {
    const t = l.text.trim();
    if (!t || isRuleRow(t) || (!l.cells && isFootnoteLine(l.text))) continue;
    const decl = /^\(?\s*columns?:\s*(.*?)\)?\s*$/i.exec(t);
    if (decl) {
      const at = l.start + l.text.indexOf(decl[1]);
      const cells = cellsOf({ start: at, end: at + decl[1].length, text: decl[1].includes('|') ? decl[1] : decl[1].replace(/\s*\|\s*/g, '  ') });
      columns = cells.map((c) => columnOf(c, doc));
      headerCells = [cells];
      continue;
    }
    let cells = cellsOf(l);
    if (l.text.includes('|')) pipe = true;
    // A table whose column padding a text extractor collapsed to single spaces: "Drug X (N=304) Placebo (N=303)" and
    // "Patients with at least one SAE, n (%) 19 (6.4) 10 (3.3)". Read only on the strict shape — arm headers each
    // with their N, then rows ending in exactly that many value cells — so nothing else is split (r2
    // pv-table-row-label-n-pct-unaligned, pv-table-row-label-colon).
    if (cells.length < 2 && !l.text.includes('|')) {
      const t0 = l.text.replace(/\s+$/, '');
      const lead0 = t0.length - t0.trimStart().length;
      const ARMH = /[A-Za-z][\w .+/-]*?\(\s*N\s*=\s*[\d, ]+\s*\)/g;
      const heads = [...t0.matchAll(ARMH)];
      const covered = heads.reduce((n, h) => n + h[0].length, 0);
      if (heads.length >= 2 && covered >= t0.trim().length - heads.length) {
        flatArms = heads.length;
        cells = [{ start: l.start + lead0, end: l.start + lead0, text: '' }, ...heads.map((h) => ({ start: l.start + h.index!, end: l.start + h.index! + h[0].length, text: h[0].trim() }))];
      } else if (flatArms > 0) {
        const VAL = String.raw`[-−–]?\d[\d.,]*\s*%?(?:\s*\(\s*[-−–]?\d[\d.,]*\s*%?\s*\))?`;
        const row = new RegExp(String.raw`^(.*?[A-Za-z)\]:])((?:\s+${VAL}){${flatArms}})\s*$`).exec(t0);
        if (row && /[A-Za-z]/.test(row[1])) {
          const valuesAt = row[0].length - row[2].length;
          const vs = [...row[2].matchAll(new RegExp(VAL, 'g'))].filter((v) => v[0].trim());
          if (vs.length === flatArms) {
            cells = [
              { start: l.start + lead0, end: l.start + row[1].length, text: row[1].trim() },
              ...vs.map((v) => ({ start: l.start + valuesAt + v.index!, end: l.start + valuesAt + v.index! + v[0].length, text: v[0].trim() })),
            ];
          }
        }
      }
    }
    // "Median PFS, months (95% CI) 7.4 (6.6, 8.3)": a trailing value glued to the label.
    const first = cells[0];
    if (first && !isValue(first.text) && cells.length >= 2 && !l.text.includes('|')) {
      const glued = /^(.*?[A-Za-z)\]])\s+((?:[<>≤≥]\s*)?[-−–]?\d[\d.,]*(?:\s?%)?(?:\s*\([^)]*\))?)$/.exec(first.text);
      if (glued && !/\bN\s*=$|\bPhase$|\bPool$|\bWeek$|\bRegion:?$/.test(glued[1]) && !/^\d+\s/.test(first.text)) {
        const vAt = first.start + first.text.lastIndexOf(glued[2]);
        cells = [{ start: first.start, end: first.start + glued[1].length, text: glued[1] }, { start: vAt, end: vAt + glued[2].length, text: glued[2] }, ...cells.slice(1)];
      }
    }
    // "Stratified log-rank p <0.0001" on one cell: a p-value row of the effect above, not prose.
    const pRow = /^((?:(?:two-sided\s+|one-sided\s+)?(?:stratified\s+|unstratified\s+)?log-rank\s+)?p(?:-value)?)\s*[=:]?\s*((?:[<>≤≥]\s*)?\d?[.,]\d+)$/i.exec(t);
    if (cells.length < 2 && !l.text.includes('|') && pRow) {
      const lead = l.text.length - l.text.trimStart().length;
      const vAt = l.start + lead + t.lastIndexOf(pRow[2]);
      cells = [{ start: l.start + lead, end: l.start + lead + pRow[1].length, text: pRow[1] }, { start: vAt, end: vAt + pRow[2].length, text: pRow[2] }];
    }
    if (cells.length < 2 && !(l.text.includes('|'))) {
      // One cell: a section row ("Overall Survival", "HbA1c (%)") or a prose / label-value line.
      if (/:\s*[<>≤≥]?\s*[-−–]?\d/.test(t) || /\b(?:was|were|is|are|occurred|reported)\b/.test(t) || /\d/.test(t.replace(/\(\s*%\s*\)/, '').replace(/\b(?:FEV1|HbA1c|AUC0-3h|ACQ-\d|v\d\.\d|\d+-week)\b/gi, ''))) {
        if (/\d/.test(t) || /\b(?:was|were)\b/.test(t)) proseLines.push(l);
        else rows.push({ line: l, label: t, labelSpan: l, cells, values: [], indent: l.text.length - l.text.trimStart().length, markers: [] });
      } else rows.push({ line: l, label: t, labelSpan: l, cells, values: [], indent: l.text.length - l.text.trimStart().length, markers: [] });
      continue;
    }
    if (!seenData && isHeaderRow(cells) && (cells.some((c) => /[A-Za-z(]/.test(c.text)) || isUnitsRow(cells))) {
      headerCells.push(cells);
      continue;
    }
    seenData = true;
    rows.push({ line: l, label: '', labelSpan: l, cells, values: [], indent: l.text.length - l.text.trimStart().length, markers: [] });
  }

  // Columns from the header rows: the widest row names the columns; narrower unit/N rows align from the right.
  if (columns.length === 0 && headerCells.length > 0) {
    const maxData = Math.max(0, ...rows.filter((r) => r.cells.length >= 2).map((r) => r.cells.length));
    const main = headerCells.reduce((a, b) => (b.filter((c) => c.text).length > a.filter((c) => c.text).length ? b : a));
    let mainCells = [...main];
    if (pipe && mainCells.length === maxData) {
      labelHeader = mainCells[0].text;
      mainCells = mainCells.slice(1);
    } else if (!pipe && mainCells.length === maxData && !columnOf(mainCells[0], doc).arm) {
      labelHeader = mainCells[0].text;
      mainCells = mainCells.slice(1);
    }
    columns = mainCells.map((c) => columnOf(c, doc));
    for (const hc of headerCells) {
      if (hc === main) continue;
      const cs = hc.filter((c) => c.text);
      cs.forEach((c, k) => {
        const col = columns[columns.length - cs.length + k];
        if (!col) return;
        const extra = columnOf(c, doc);
        if (extra.n && !col.n) col.n = extra.n;
        if (extra.pct) col.pct = true;
        if (extra.nPct) col.nPct = true;
        if (extra.pctN) col.pctN = true;
      });
    }
  }
  if (labelHeader) {
    const q = qualsOf(labelHeader, 0, { ...doc, text: labelHeader });
    tctx = withQuals(tctx, { ...q, studies: [], pools: [] }, 'table-title', doc);
  }
  const byTermTable = byTerm || /^(?:Preferred\s+term|Adverse\s+Reaction)$/i.test(labelHeader);
  const isLab = labTable || /^Laboratory\s+Abnormality$/i.test(labelHeader);
  const armCols = columns.map((c, i) => ({ c, i })).filter((x) => x.c.arm);
  const tablePct = columns.some((c) => c.pct) || /\bn\s*\(%\)/i.test(tb.lines.map((l) => l.text).join('\n'));
  /**
   * The title states the unit of the value cells: "Adverse Reactions (%) Reported in >=5% of
   * Patients", "(percent of patients)" (r2 lbl-01, lbl-02). A USPI section 6 table routinely puts
   * the unit there and nowhere else; read as counts, a label's whole percents agree or conflict
   * with the CSR's patient counts by coincidence. "n (%)" in the title is a count with its
   * percentage, not a bare-percent declaration, so it is excluded.
   */
  const titlePctUnit =
    (/\(\s*%\s*\)/.test(titleText) && !/\bn\s*\/?\s*N?\s*\(\s*%\s*\)/i.test(titleText)) ||
    /\(\s*(?:percent|percentage)\s+of\s+(?:patients|subjects|participants)\s*\)/i.test(titleText);

  // Header Ns: the size of each arm in the table's population.
  const titlePop = tctx.population?.set;
  const safetyTable = /adverse|TEAE|SAE|serious|death|reaction|laborator|exposure/i.test(titleText);
  for (const { c } of armCols) {
    if (!c.n || !c.arm) continue;
    const set: PopulationSet | undefined = titlePop ?? (safetyTable ? 'treated' : undefined);
    const pop = set && doc.allRandomized.has(set) ? 'randomized' : set;
    const d: Draft = mk('T-headerN', 'n', { pop: pop ?? 'unstated' }, { count: c.n.w }, c.n.span, tctx, { arm: c.arm });
    if (set) d.own.population = populationOf(set, doc);
    else d.issues.push({ reason: 'population_unidentified', slot: 'population', detail: 'A header N in a table whose title names no population.' });
    if (c.study) d.own.study = c.study;
    push(d);
  }

  function mk(form: string, family: Draft['family'], key: Record<string, string>, value: ClaimValue, span: Span, ctx: Ctx, extra: Partial<Draft> = {}): Draft {
    return { form, family, key, value, span: { start: span.start, end: span.end }, quote: { start: span.start, end: span.end }, ctx, own: {}, issues: [], slotFrom: {}, ...extra };
  }
  function push(d: Draft) {
    if (consumed.some((c) => c.start < d.span.end && d.span.start < c.end)) return;
    consumed.push({ start: d.span.start, end: d.span.end });
    drafts.push(d);
  }

  // Rows.
  let section: Ctx = tctx;
  let parentCategory: { category: EventCategory; indent: number } | undefined;
  let discParent: { indent: number } | undefined;
  let lastEffects: Draft[] = [];
  let lastRowDrafts: Draft[] = [];
  let pendingLabel = '';
  let groupEndpointCtx: Ctx | undefined;
  for (const row of rows) {
    const cells = row.cells;
    // Split label cells from value cells.
    let vStart = cells.findIndex((c, k) => k > 0 && (isValue(c.text) || (pipe && c.text === '')));
    if (vStart < 0) vStart = cells.length;
    if (pipe) vStart = Math.min(vStart, 1);
    const labelCells = cells.slice(0, Math.max(1, vStart));
    const valueCells = cells.slice(Math.max(1, vStart));
    const rawLabel = labelCells.map((c) => c.text).join(' ').trim();
    const { clean, markers } = markersOf(rawLabel, notes);
    let label = clean;
    if (pendingLabel && /^\(/.test(label)) label = `${pendingLabel} ${label}`;
    pendingLabel = '';
    const hasValues = valueCells.some((c) => c.text.trim() !== '');
    if (!hasValues) {
      // A section row: endpoint, term group or lab group for the rows below.
      if (/^(?:LS\s+mean\s+difference|Difference|Treatment\s+difference)/i.test(label)) {
        pendingLabel = label;
        continue;
      }
      const q = qualsOf(label, row.labelSpan.start, doc);
      section = applyNotes(withQuals(tctx, { ...q, studies: [], pools: [] }, 'row', doc), markers, notes, doc);
      groupEndpointCtx = undefined;
      parentCategory = undefined;
      continue;
    }
    // A multi-cell label whose first cell names an endpoint groups the rows under it (em-15 "HbA1c (%)  Change from baseline …").
    let rctx = section;
    if (labelCells.length >= 2) {
      const gq = qualsOf(labelCells[0].text, labelCells[0].start, doc);
      if (gq.endpoints.length) {
        groupEndpointCtx = withQuals(section, { ...gq, studies: [], pools: [] }, 'row', doc);
      }
    } else if (row.indent === 0 && !/^\s/.test(row.line.text)) groupEndpointCtx = groupEndpointCtx && row.indent > 0 ? groupEndpointCtx : undefined;
    if (groupEndpointCtx) rctx = groupEndpointCtx;
    const lq = qualsOf(label, row.labelSpan.start, doc);
    rctx = applyNotes(withQuals(rctx, { ...lq, studies: [], pools: [] }, 'row', doc), markers, notes, doc);
    rctx.unrecognised = [...rctx.unrecognised];
    // Row study ("TNV-301", "X-201") and row pool ("Phase 3 Pool").
    let rowStudy: StudyRef | undefined;
    const sm = /^([A-Z]{1,5}-\d{2,4})$/.exec(label);
    if (sm) rowStudy = { kind: 'study', aliases: aliasesOf(sm[1], doc) };
    if (/\bPool\b/i.test(label) && rows.some((r) => /^[A-Z]{1,5}-\d{2,4}$/.test(r.cells[0]?.text ?? ''))) {
      const members = rows.map((r) => /^([A-Z]{1,5}-\d{2,4})$/.exec(r.cells[0]?.text ?? '')?.[1]).filter((x): x is string => !!x).map((x) => aliasesOf(x, doc));
      rowStudy = { kind: 'pool', members };
    }
    // Row subgroup and interval.
    let rowSubgroups: string[] | undefined;
    for (const sg of SUBGROUP_ROWS) {
      sg.re.lastIndex = 0;
      const m = sg.re.exec(label);
      if (m) rowSubgroups = [sg.key(m)];
    }
    let rowPeriod: string | undefined;
    if (/^Interval$/i.test(labelHeader)) {
      if (/^Overall$/i.test(label)) rowPeriod = 'overall';
      for (const pr of PERIOD_ROWS) {
        pr.re.lastIndex = 0;
        const m = pr.re.exec(label);
        if (m) {
          const n = m.slice(1).find((g) => g !== undefined);
          rowPeriod = pr.key === 'interval-first' ? `interval:0-${n}m` : pr.key === 'interval' ? `interval:${m[1]}-${m[2]}m` : pr.key === 'interval-after' ? `interval:>${n}m` : pr.key;
          break;
        }
      }
    }
    if (/^Overall$/i.test(label) && !rowPeriod) rowSubgroups = [];
    const own = (d: Draft) => {
      if (rowStudy) d.own.study = rowStudy;
      if (rowSubgroups) d.own.subgroups = rowSubgroups;
      if (rowPeriod) d.own.period = rowPeriod;
      if (titleArm && !d.arm && d.family !== 'effect') d.arm = armOf(titleArm[1]) ?? undefined;
      return d;
    };
    // Value cells aligned to columns.
    const aligned: Array<{ cell: Line; col: Column | undefined; idx: number }> = [];
    if (pipe) valueCells.forEach((c, k) => c.text.trim() && aligned.push({ cell: c, col: columns[k], idx: k }));
    else {
      const vs = valueCells.filter((c) => c.text.trim());
      const nonArmMeasures = columns.some((c) => c.measure);
      if (vs.length === 1 && armCols.length >= 2 && !nonArmMeasures) aligned.push({ cell: vs[0], col: undefined, idx: -1 });
      else vs.forEach((c, k) => aligned.push({ cell: c, col: columns[columns.length - vs.length + k], idx: columns.length - vs.length + k }));
    }
    const made: Draft[] = [];

    // "95% CI" row: the interval of the row above.
    if (/^\d+(?:[.,]\d+)?\s?%\s*CI$/i.test(label)) {
      const ci = ciDeclOf(label);
      aligned.forEach(({ cell }, k) => {
        const target = lastRowDrafts.length === aligned.length ? lastRowDrafts[k] : lastRowDrafts.length === 1 ? lastRowDrafts[0] : undefined;
        const iv = /^\(?\s*([-−–]?\s?\d+(?:[.,]\d+)?|NR)\s*(?:,|;|to|–|-(?=\s?\d))\s*([-−–]?\s?\d+(?:[.,]\d+)?|NR)\s*\)?$/.exec(cell.text.trim());
        if (!target || !iv) return;
        target.value.lower = rd(iv[1]);
        target.value.upper = rd(iv[2]);
        if (ci) target.own.ci = ci;
        consumed.push({ start: cell.start, end: cell.end });
      });
      continue;
    }
    // p-value row: the p of the last effect.
    if (/^(?:p-value|p\b|nominal\s+p|(?:stratified\s+)?log-rank\s+p|stratified\s+log-rank\s+p)/i.test(label) || /\blog-rank\s+p$/i.test(label)) {
      const host = lastEffects[lastEffects.length - 1];
      const cell = aligned[aligned.length - 1]?.cell;
      if (host && cell) {
        const pv = rd(cell.text.replace(/^p\s*[=]?\s*/i, ''));
        if (pv) {
          host.value.p = pv;
          const basis = pBasisOf(label);
          if (basis) host.value.pBasis = basis;
          consumed.push({ start: cell.start, end: cell.end });
        }
      }
      continue;
    }
    // A study row's "Randomized (N)" cell: that study's randomized total (fs-24); a "Phase" cell is not a figure.
    for (const a of aligned) {
      if (a.col?.measure === 'phase') consumed.push({ start: a.cell.start, end: a.cell.end });
      if (a.col?.measure !== 'n:randomized' || !rowStudy) continue;
      const count = rd(a.cell.text, true);
      if (!count || !/^\d[\d,. ]*$/.test(a.cell.text.trim())) continue;
      const d = mk('T-disp-col', 'n', { pop: 'randomized' }, { count }, { start: a.cell.start, end: a.cell.end }, rctx, { arm: { kind: 'total' } });
      d.own.population = populationOf('randomized', doc);
      own(d);
      push(d);
    }
    // Effect rows (spanning or in an effect column).
    const effRow = effectIn(label) ?? (/^(?:Stratified\s+)?HR\b/i.test(label) ? { type: 'hazard_ratio' as EffectType, ls: false } : undefined);
    const effCols = aligned.filter((a) => a.col?.measure === 'effect' || a.col?.measure === 'estimate' || (a.idx === -1 && effRow) || (pipe && effRow));
    if (effRow || effCols.length > 0) {
      const ciCol = aligned.find((a) => a.col?.measure === 'ci');
      const pCol = aligned.find((a) => a.col?.measure === 'p');
      for (const a of effRow ? aligned.filter((x) => x.col?.measure !== 'ci' && x.col?.measure !== 'p' && x.col?.measure !== 'phase' && !x.col?.measure?.startsWith('n:')) : effCols) {
        const eff = effRow ?? a.col?.effect ?? (/\bHR\b|hazard/i.test(a.col?.text ?? '') ? { type: 'hazard_ratio' as EffectType, ls: false } : effectIn(label));
        if (!eff) continue;
        // The column header's own qualifiers frame its cells ("LS mean difference … at Week 26, FAS (95% CI)").
        let cctx = rctx;
        if (a.col?.quals) {
          cctx = withQuals(rctx, { ...a.col.quals, studies: [], pools: [] }, 'column', doc);
          cctx.unrecognised.push(...a.col.quals.unrecognised);
        }
        const ciDecl = ciDeclOf(label) ?? a.col?.effect?.ci ?? (ciCol ? ciDeclOf(columns[ciCol.idx]?.text ?? '') : undefined) ?? ciDeclOf(titleText);
        const g = estimateAt(a.cell.text, 0, doc, ciDecl ? { level: ciDecl.level, sided: ciDecl.sidedStated ? ciDecl.sided : undefined, kind: ciDecl.kind } : undefined);
        if (!g) continue;
        const value: ClaimValue = { estimate: g.estimate };
        if (g.lower) value.lower = g.lower;
        if (g.upper) value.upper = g.upper;
        if (g.p) value.p = g.p;
        if (g.p && g.pBasis) value.pBasis = g.pBasis;
        let ci = g.ci;
        if (ciCol) {
          const iv = /^\(?\s*([-−–]?\s?\d+(?:[.,]\d+)?)\s*(?:,|;|to|–)\s*([-−–]?\s?\d+(?:[.,]\d+)?)\s*\)?$/.exec(ciCol.cell.text.trim());
          if (iv) {
            value.lower = rd(iv[1]);
            value.upper = rd(iv[2]);
            ci = ciDeclOf(columns[ciCol.idx].text) ?? ci;
            consumed.push({ start: ciCol.cell.start, end: ciCol.cell.end });
          }
        }
        if (pCol) {
          const pv = rd(pCol.cell.text);
          if (pv) value.p = pv;
          const basis = pv ? pBasisOf(columns[pCol.idx]?.text ?? '') : undefined;
          if (basis) value.pBasis = basis;
          consumed.push({ start: pCol.cell.start, end: pCol.cell.end });
        }
        // A cell footnote holding the p-value ("-0.6 (-0.8, -0.5)^d", "^d p<0.001").
        const cellMark = /\^([a-z])\s*$/.exec(a.cell.text);
        if (cellMark) {
          const note = notes.get(cellMark[1]) ?? '';
          const pm = /^\s*p\s*([<=≤])\s*(\d?[.,]\d+)\s*$/i.exec(note);
          if (pm) {
            value.p = rd(`${pm[1] === '=' ? '' : pm[1]}${pm[2]}`);
            // The footnote's figure is this p-value: never swept as unread.
            const noteLine = tb.lines.find((l) => new RegExp(String.raw`^\s*\^?${cellMark[1]}\s`).test(l.text) && isFootnoteLine(l.text));
            if (noteLine) consumed.push({ start: noteLine.start, end: noteLine.end });
          }
        }
        const span = { start: a.cell.start, end: a.cell.end };
        const ep = cctx.endpoint;
        const region = `${label} ${a.col?.text ?? ''} ${titleText}`;
        const lsNote = markers.some((k) => /\bleast[\s-]squares?\s+means?\b|\bLS\s+means?\b/i.test(notes.get(k) ?? ''));
        const type = resolveType(eff.type, eff.ls || (lsNote && eff.type === 'difference'), ep, env, region);
        const d = mk('T-effect', 'effect', { effect: type ?? 'unidentified', ...(ep?.kind ? { kind: ep.kind } : {}) }, value, span, cctx);
        if (!type) d.issues.push({ reason: 'effect_type_unidentified', slot: 'measure', detail: `"${label}" on an endpoint of unknown kind.` });
        d.own.endpoint = { ...(ep?.id ? { id: ep.id + (ep.pct ? '|pct' : '') } : {}), ...(cctx.endpointRole ? { role: cctx.endpointRole } : {}) };
        if (type) d.own.scale = scaleOf(type, { pctMarked: g.pctMarked || /,\s*%|%\s*$/.test(label), lower: g.lower, percentagePoints: g.percentagePoints }, ep);
        if (type && /difference/.test(type) && d.own.scale === 'units') d.own.unit = unitOf(g as EstimateGroup, `${label} ${labelCells[0]?.text ?? ''} ${section.title ?? ''}`, ep);
        if (ci) d.own.ci = ci;
        else if (value.lower && !ci) d.value.intervalUnread = 'ci_level_unstated';
        const model = /\bunstratified\b/i.test(label) ? 'unstratified' : /\bstratified\b/i.test(label) ? 'stratified' : cctx.analysis.model;
        d.own.analysis = { ...(model ? { model } : {}) };
        if (/\bCMH\b|Cochran/i.test(label) && type === 'adjusted_risk_difference') d.own.analysis.model = 'cmh';
        // Contrast: the column's stated contrast, the label's, the column arm vs the control of its study, or the two arm columns.
        const lc = /\b(?:vs\.?|versus|from)\s+(placebo|[a-z]+)\b/i.exec(label);
        const named = /^(.+?)\s+vs\.?\s+(.+)$/i.exec(label);
        if (a.col?.effect?.contrast) d.contrast = a.col.effect.contrast;
        else if (named && armOf(named[1]) && armOf(named[2])) d.contrast = { test: armOf(named[1])!, control: armOf(named[2])!, stated: true };
        else if (a.col?.arm) {
          const control = armCols.find((x) => x.c.arm && isControlArm(x.c.arm, doc) && (!a.col!.study || (x.c.study && x.c.study.kind === 'study' && a.col!.study.kind === 'study' && x.c.study.aliases.some((y) => (a.col!.study as { aliases: string[] }).aliases.includes(y)))));
          d.contrast = { test: a.col.arm, ...(control?.c.arm ? { control: control.c.arm } : {}), stated: false };
          if (a.col.study) d.own.study = a.col.study;
        } else if (armCols.length === 2) {
          const ctl = armCols.find((x) => isControlArm(x.c.arm, doc));
          const test = armCols.find((x) => x !== ctl);
          if (ctl && test) d.contrast = { test: test.c.arm!, control: ctl.c.arm!, stated: false };
        }
        if (lc && !d.contrast?.control) {
          const control = armOf(lc[1]);
          if (control) d.contrast = { ...(d.contrast ?? { stated: false }), control };
        }
        own(d);
        if (named && !/vs/i.test(rawLabel.replace(named[0], ''))) d.own.subgroups = d.own.subgroups ?? [];
        made.push(d);
      }
      for (const d of made) push(d);
      lastEffects = made.length ? made : lastEffects;
      lastRowDrafts = made;
      continue;
    }
    // Per-arm rows: the measure by label.
    const perArm = (family: Draft['family'], key: Record<string, string>, read: (cell: Line, col: Column | undefined) => ClaimValue | null, form: string) => {
      for (const a of aligned) {
        if (a.col?.measure && !a.col.measure.startsWith('grade')) continue;
        const arm = a.col?.arm ?? (armCols.length === 0 ? ({ kind: 'total' } as ArmRef) : undefined);
        const v = read(a.cell, a.col);
        if (!v) continue;
        const k = a.col?.measure?.startsWith('grade:') ? { ...key, grade: a.col.measure.slice(6) } : key;
        const d = mk(form, family, k, v, { start: a.cell.start, end: a.cell.end }, rctx, arm ? { arm } : {});
        if (a.col?.study) d.own.study = a.col.study;
        own(d);
        made.push(d);
      }
    };
    const countPct = (pctDefault: boolean) => (cell: Line, col: Column | undefined): ClaimValue | null => {
      // A "% (n)" column: "4.9 (14)" is 4.9% of 14 patients, never a count of 4.9 (r1 pv-table-pct-n-column-order).
      if (col?.pctN) {
        const m = /^\s*(\d+(?:[.,]\d+)?)\s*\(\s*(\d+)\s*\)\s*$/.exec(cell.text);
        const x = m ? rd(m[1]) : undefined;
        const n = m ? rd(m[2], true) : undefined;
        return x && n ? { count: n, percent: { ...x, pct: 'column' } } : null;
      }
      // In an "n (%)" column a bare number is the count; only "%" columns make bare numbers percentages.
      const pct = (pctDefault || !!col?.pct) && !col?.nPct;
      const its = itemsIn(cell.text, cell.start, doc, { counts: true, percentColumn: pct });
      const it = its[0];
      if (!it) return null;
      if (!it.percent && it.count && /\(\s*\d/.test(cell.text)) {
        const m = /^(\d+)\s*\(\s*(\d+(?:[.,]\d+)?)\s*\)/.exec(cell.text.trim());
        const n = m ? rd(m[1], true) : undefined;
        const x = m ? rd(m[2]) : undefined;
        // "n (x)" is count and percentage when the table declares "n (%)", or when x is n of the column's N at x's
        // written precision ("13 (6.3)" under "Placebo (N=208)": 13/208 = 6.25%). The check identifies the figure;
        // it never derives one.
        if (n && x && (tablePct || (col?.n && isPercentOf(n, col.n.w, x)))) return { count: n, percent: { ...x, pct: 'column' } };
      }
      return itemValue(it);
    };
    const estimate = (cell: Line, col: Column | undefined): ClaimValue | null => {
      const ciDecl = ciDeclOf(label) ?? ciDeclOf(col?.text ?? '');
      const g = estimateAt(cell.text.replace(/\s*\(\s*SE\s*\)/i, ''), 0, doc, ciDecl ? { level: ciDecl.level, kind: ciDecl.kind } : undefined);
      if (!g) return null;
      const v: ClaimValue = { estimate: g.estimate };
      if (/\(SE\)/i.test(label)) return v;
      if (g.lower) v.lower = g.lower;
      if (g.upper) v.upper = g.upper;
      return v;
    };
    // An "EAIR per 100 PY" column: each row's rate (an interval row is its period), the event from the title (pvs-36).
    // A "Patients at risk" cell beside it is the interval's denominator and stays unread.
    const eairCells = aligned.filter((a) => a.col?.measure === 'eair');
    if (eairCells.length > 0) {
      for (const a of eairCells) {
        const v = estimate(a.cell, a.col);
        const arm = a.col?.arm ?? (armCols.length === 0 ? ({ kind: 'total' } as ArmRef) : undefined);
        if (!v || !arm) continue;
        made.push(own(mk('T-eair-col', 'eair', { ...eairEventOf(titleText), rate: 'eair' }, v, { start: a.cell.start, end: a.cell.end }, rctx, { arm })));
      }
      for (const d of made) push(d);
      lastRowDrafts = made;
      continue;
    }
    const ep = rctx.endpoint;
    if (/^(?:Events?|Patients\s+with\s+event|Patients\s+at\s+risk)\b/i.test(label)) {
      lastRowDrafts = [];
      continue;
    }
    // A disposition row names its population before the unit declaration a flattened table leaves in the label:
    // "Patients randomised, n", "Subjects treated, n (%)", "Patients randomised:" (r2 pv-disposition-table-row-n-column).
    const dispLabel = label
      .replace(/\s*[,;:]?\s*n\s*(?:\(\s*%\s*\))?\s*$/i, '')
      .replace(/[:,]\s*$/, '')
      .replace(/^(?:the\s+)?(?:total\s+)?(?:number\s+of\s+)?(?:patients|subjects|participants)\s+/i, '')
      .trim();
    if (/^(?:Number\s+of\s+)?deaths?\b/i.test(label)) perArm('deaths', {}, countPct(false), 'T-deaths');
    else if (/^randomi[sz]ed$/i.test(dispLabel)) perArm('n', { pop: 'randomized' }, countPct(false), 'T-disp');
    else if (/^treated\b/i.test(dispLabel) || /^Safety\s+(?:Set|Population)$/i.test(label)) perArm('n', { pop: 'treated' }, countPct(false), 'T-disp');
    else if (/^(?:Intent-to-Treat|ITT|Full\s+Analysis\s+Set|FAS)\b.*\(N\)$/i.test(label) || (/^N$/.test(label) && rctx.population)) {
      const set = /Intent|ITT/i.test(label) ? 'itt' : /Full|FAS/i.test(label) ? 'fas' : rctx.population!.set;
      const pop = doc.allRandomized.has(set) ? 'randomized' : set;
      perArm('n', { pop }, countPct(false), 'T-disp');
      for (const d of made) d.own.population = populationOf(set, doc);
      // A table whose title names no population declares it in this row: it is the population of the rows below (lu-18).
      if (!tctx.population) {
        tctx = { ...tctx, population: populationOf(set, doc), populationFrom: 'row' };
        section = { ...section, population: populationOf(set, doc), populationFrom: 'row' };
      }
    } else if (/^Completed\s+(?:the\s+)?study$/i.test(label)) perArm('completed_study', {}, countPct(true), 'T-comp');
    else if (/^Discontinued\s+(?:the\s+)?study$/i.test(label)) {
      discParent = { indent: row.indent };
      perArm('discontinued_study', { reason: 'any' }, countPct(true), 'T-disc');
    } else if (discParent && row.indent > discParent.indent) {
      const reason = /^adverse\s+events?$/i.test(label) ? 'adverse_event' : /^withdrawal\s+by\s+subject$/i.test(label) ? 'withdrawal_by_subject' : label.toLowerCase().replace(/\s+/g, '_');
      perArm('discontinued_study', { reason }, countPct(true), 'T-disc');
    } else if (/^Median\b/i.test(label)) {
      const id = /PFS|progression/i.test(label) ? 'pfs' : /DOR|duration\s+of\s+response/i.test(label) ? 'dor' : /\bOS\b|overall\s+survival/i.test(label) ? 'os' : ep?.id;
      if (id) perArm('median', { endpoint: id }, estimate, 'T-median');
      for (const d of made) {
        const ci = ciDeclOf(label);
        if (ci && d.value.lower) d.own.ci = ci;
      }
    } else if (/EAIR|per\s+100\s+PY/i.test(label)) {
      perArm('eair', { ...eairEventOf(titleText), rate: 'eair' }, estimate, 'T-eair');
      for (const d of made) {
        const ci = ciDeclOf(label);
        if (ci && d.value.lower) d.own.ci = ci;
      }
    } else if (/^Total\s+exposure\b/i.test(label)) perArm('exposure', { kind: 'patient_years' }, estimate, 'T-exposure');
    else if (RESPONDER_LABEL.test(label) || RESPONDER_ACHIEVED.test(label)) {
      const rq = qualsOf(label, 0, { ...doc, text: label });
      const id = /complete\s+response/i.test(label) ? 'cr' : /partial\s+response/i.test(label) ? 'pr' : rq.endpoints[0]?.id ?? ep?.id ?? (/^(?:Responders|Remission)/i.test(label) ? tctx.endpoint?.id : undefined);
      if (id) {
        perArm('responder', { endpoint: id }, (cell, col) => {
          if (/^Percentage|^Proportion/i.test(label) || col?.pct) {
            const w = rd(cell.text.replace(/%\s*$/, '') + '%');
            return w ? { percent: { ...w, pct: /%/.test(cell.text) ? 'sign' : 'column' } } : null;
          }
          const ci = ciDeclOf(label);
          if (ci) {
            const g = estimateAt(cell.text, 0, doc, { level: ci.level, kind: ci.kind });
            if (g) return { percent: g.estimate, ...(g.lower ? { lower: g.lower } : {}), ...(g.upper ? { upper: g.upper } : {}) };
          }
          return countPct(true)(cell, col);
        }, 'T-responder');
        for (const d of made) {
          const ci = ciDeclOf(label);
          if (ci && d.value.lower) d.own.ci = { ...ci, ...(notes.get(markers[0] ?? '')?.match(/Clopper/i) ? { method: 'clopper-pearson' } : {}) };
        }
      }
    } else if (/\bbaseline\s*\(mean\)|^Baseline\b/i.test(label)) {
      if (ep?.id) perArm('baseline_mean', { endpoint: ep.id }, estimate, 'T-baseline');
    } else if (/\bchange\b|^LS\s+mean(?:\s+\(SE\))?$/i.test(label) && !/difference/i.test(label)) {
      const id = lq.endpoints[0]?.id ?? ep?.id;
      const pct = /percent\s+change/i.test(label) || ep?.pct;
      if (id) {
        // The statistic, as the prose forms key it: LS mean (label, a footnote, or the source's declaration), mean, or unstated.
        const ls = /\bLS\b|least\s+squares/i.test(`${label} ${markers.map((k) => notes.get(k) ?? '').join(' ')}`) || doc.lsMeans;
        perArm('arm_change', { endpoint: id + (pct ? '|pct' : ''), stat: ls ? 'ls' : /\bmean\b/i.test(label) ? 'mean' : 'unstated' }, estimate, 'T-change');
      }
    } else if (isLab) {
      perArm('lab', { lab: termKey(label) }, countPct(true), 'T-lab');
    } else {
      // Event category, or a preferred term (under a category row, or in a by-term table). "Patients with SAE, n (%)"
      // names the category after its measure phrase and unit (r1 nsf-24).
      const core = label.replace(/^(?:number\s+of\s+)?(?:patients|subjects|participants)\s+with\s+(?:(?:an?|any|at\s+least\s+one)\s+)?/i, '').replace(/,?\s*n\s*\(%\)\s*$/i, '');
      let category: EventCategory | undefined;
      for (const er of EVENT_ROWS) {
        er.re.lastIndex = 0;
        const m = er.re.exec(core);
        if (m && m.index <= 12) {
          category = er.key;
          break;
        }
      }
      if (/^(?:Patients\s+with\s+)?any\s+serious\s+TEAE$/i.test(label)) category = 'serious';
      if (/^(?:TEAE|SAE|AE)s?\s+leading\s+to\s+death$/i.test(label)) category = 'fatal';
      if (category) {
        parentCategory = { category, indent: row.indent };
        perArm('incidence', { category }, countPct(titlePctUnit), 'T-incidence');
      } else if (rowStudy && /Disposition|Randomi[sz]ed/i.test(titleText)) {
        perArm('n', { pop: 'randomized' }, countPct(false), 'T-disp-study');
        for (const d of made) d.own.population = populationOf('randomized', doc);
      } else if ((rowSubgroups || /Subgroup/i.test(titleText)) && /Serious\s+Adverse\s+Events|SAEs?/i.test(titleText)) {
        perArm('incidence', { category: 'serious' }, (cell) => {
          const its = itemsIn(cell.text, cell.start, doc, { counts: true, percentColumn: true });
          return its[0] ? itemValue(its[0]) : null;
        }, 'T-incidence-sub');
      } else if ((parentCategory && row.indent > parentCategory.indent) || byTermTable) {
        const cat = parentCategory && row.indent > parentCategory.indent ? parentCategory.category : 'any';
        const term = termKey(label);
        if (term && !/\d/.test(term)) perArm('incidence', { category: cat, term, termKind: 'pt' }, countPct(titlePctUnit), 'T-term');
        for (const d of made) {
          const lm = markers.find((x) => notes.has(x) && /\binclude/i.test(notes.get(x)!));
          if (!lm) continue;
          // A footnoted grouped term: its identity is its member list (C18); unread members leave it unframed.
          d.key.termKind = 'grouped';
          const list = /\binclude[sd]?\s+(.*)$/i.exec(notes.get(lm)!)?.[1] ?? '';
          const grouping = groupingKey(label, list);
          if (grouping) d.key.grouping = grouping;
          else d.issues.push({ reason: 'measure_differs', slot: 'measure', detail: `"${label}" is a grouped term whose members cannot be read (${notes.get(lm)}) (C18).` });
        }
      }
    }
    for (const d of made) {
      if ((d.family === 'incidence' || d.family === 'lab') && !d.own.basis) d.own.basis = rctx.basis ?? (doc.role === 'uspi' || doc.role === 'smpc' ? 'adverse_reaction' : 'adverse_event');
      push(d);
    }
    lastRowDrafts = made;
  }

  // Prose lines and label-value lines inside the table, read under the table's context.
  for (const l of proseLines) {
    const state: ParaState = {};
    for (const s of sentencesOf(l.text, l.start)) {
      const senv: Env = { doc, sentence: s, consumed, state, respectively: /\brespectively\b/i.test(s.text), sentenceDrafts: [] };
      const sarms = armCols.map((x) => x.c.arm!).filter((a) => a.kind === 'arm');
      if (sarms.length >= 2) senv.sentenceArms = sarms;
      for (const c of clausesOf(s)) {
        const q = qualsOf(c.text, c.start, doc);
        const ctx = withQuals(tctx, q, 'clause', doc);
        ctx.unrecognised.push(...q.unrecognised);
        if (sarms.length >= 2) ctx.armOrder = sarms;
        const made = readClause(c, ctx, senv);
        drafts.push(...made);
        senv.sentenceDrafts.push(...made);
      }
    }
  }
  void emptyCtx;
  return drafts;
}
