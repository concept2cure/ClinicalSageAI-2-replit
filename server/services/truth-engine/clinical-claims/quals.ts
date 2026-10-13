/**
 * The qualifier classifier (design §5): every phrase in a span that can carry
 * a frame slot — study or pool, population, period, timepoint, subgroup, part,
 * analysis role, cut-off, model, estimand, imputation, assessor, endpoint —
 * and the trigger words (§5.2) left unclassified. A claim whose clause holds an
 * unclassified trigger is incomplete (`unrecognised_qualifier`), never overall.
 */
import { aliasesOf, type DocInfo } from './doc';
import type { Span } from './segment';
import type { Analysis, PopulationSet, StudyRef } from './types';
import {
  ALL_RANDOMIZED_DEF,
  ASCERTAINMENT_ROWS,
  ASSESSOR_ROWS,
  CAUSALITY_ROWS,
  ENDPOINT_ROLE_ROWS,
  ENDPOINT_ROWS,
  ESTIMAND_ROWS,
  IMPUTATION_ROWS,
  isStudyCode,
  METHOD_ROWS,
  MODEL_ROWS,
  PART_ROW,
  PERIOD_ROWS,
  PLACE_TRIGGER,
  STAGE_ROW,
  POOL_MARKER,
  POPULATION_ROWS,
  ROLE_ROWS,
  SUBGROUP_ROWS,
  TIMEPOINT_ROWS,
  TRIGGER,
  WHOLE_POPULATION,
  type EndpointKind,
} from './vocabulary';

export interface StudyMention extends Span {
  aliases: string[];
}
export interface PoolMention extends Span {
  members: string[][] | null;
  cutoff?: string;
  /** The restriction the pool's own name states ("placebo-controlled", "all-exposure+16w"). */
  scope?: string;
  /** The pool covers figures up to this offset (its sentence), unless a study mention overrides. */
}
export interface EndpointMention extends Span {
  id: string;
  kind: EndpointKind;
  unit?: string;
  pct: boolean;
}

export interface Quals {
  studies: StudyMention[];
  pools: PoolMention[];
  population?: { set: PopulationSet; allRandomized?: true } & Span;
  populations: Array<{ set: PopulationSet; allRandomized?: true } & Span>;
  period?: string;
  periods: string[];
  timepoints: string[];
  subgroups: string[];
  whole: boolean;
  part?: string;
  analysis: Analysis;
  ascertainment?: 'adjudicated' | 'investigator';
  causality?: 'all' | 'related';
  endpoints: EndpointMention[];
  endpointRole?: string;
  consumed: Span[];
  unrecognised: string[];
  /** Where each unclassified trigger word sits (source offsets). */
  unrecognisedSpans: Array<Span & { word: string }>;
}

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/** "data cut-off 14 March 2026", "(data cutoff 02 May 2026)", "cut-off 30 April 2026" → "2026-03-14". */
export function cutoffOf(text: string): string | undefined {
  const m = /\b(?:data\s+)?cut-?off(?:\s+(?:date|of))?\s*(?:for\s+this\s+ISS\s*)?\(?\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i.exec(text) ?? /\bAs\s+of\s+the\s+data\s+cut-off[^(]*\(\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i.exec(text) ?? /\bupdated\s+data\s+cut-off\s+of\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i.exec(text);
  if (!m) return undefined;
  const mm = MONTHS[m[2].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[1].padStart(2, '0')}` : undefined;
}

/** Study codes in a span (registry numbers and sponsor codes), with alias sets. */
export function studiesIn(text: string, base: number, doc: DocInfo): StudyMention[] {
  const out: StudyMention[] = [];
  const re = /\b(?:NCT\d{8}|[A-Z]{1,5}-(?:\d{2,4}|LTE|OLE|EXT))(?![\w-])|\b(?:Trial|Study)\s+\d{1,2}\b(?![.\d])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = m[0].replace(/\s+/g, ' ');
    if (/^(?:Trial|Study)\s/.test(id)) {
      if (!doc.aliasOf.has(id)) continue; // a bare designation is not an identifier (C1, lu-17)
    } else if (!isStudyCode(id)) continue;
    out.push({ start: base + m.index, end: base + m.index + m[0].length, aliases: aliasesOf(id, doc) });
  }
  return out;
}

/**
 * The restriction a pool's own name states: "Placebo-Controlled Pool", "All-Exposure Pool", "Long-Term Pool",
 * "16-Week Active-Controlled Pool". Two pools of the same member studies and different named scopes are different
 * analysis sets over different exposure, so their figures are never compared (C16, r2 scope-01..03).
 */
export function poolScopeOf(name: string): string | undefined {
  const parts: string[] = [];
  if (/\ball[\s-]exposure\b/i.test(name)) parts.push('all-exposure');
  if (/\blong[\s-]term\b/i.test(name)) parts.push('long-term');
  if (/\bshort[\s-]term\b/i.test(name)) parts.push('short-term');
  if (/\bplacebo-controlled\b/i.test(name)) parts.push('placebo-controlled');
  if (/\bactive-controlled\b/i.test(name)) parts.push('active-controlled');
  if (/\buncontrolled\b/i.test(name)) parts.push('uncontrolled');
  else if (/\bcontrolled\b/i.test(name) && !/(?:placebo|active)-controlled/i.test(name)) parts.push('controlled');
  if (/\bdouble-blind\b/i.test(name)) parts.push('double-blind');
  if (/\bopen-label\b/i.test(name)) parts.push('open-label');
  // A week count in the name is the trials' own length ("a pool of two 26-week, placebo-controlled trials"), not a
  // restriction of the pool, so it is not part of the scope (lu-05, pvs-19).
  return parts.length ? [...new Set(parts)].sort().join('+') : undefined;
}

/** The pool a span names: its marker and, when listed, its member studies (C16). */
function poolsIn(text: string, base: number, doc: DocInfo, refs: Span[] = []): PoolMention[] {
  const out: PoolMention[] = [];
  POOL_MARKER.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = POOL_MARKER.exec(text)) !== null) {
    const at = m.index;
    // "Integrated Summary of …" naming the document, with one study in the clause, is not a pool (pvs-34, euc-05).
    if (/Integrated\s+Summary|^IS[SE]$/.test(m[0])) {
      const clause = text.slice(Math.max(0, text.lastIndexOf('.', at) + 1), (text.indexOf('.', at + m[0].length) + 1 || text.length));
      const codes = studiesIn(clause, 0, doc);
      if (/As\s+presented\s+in|of\s+this\s+IS[SE]|Section/.test(clause) || (new Set(codes.map((c) => c.aliases.join('|'))).size === 1 && !/pooled|Pool\b/i.test(clause))) {
        refs.push({ start: base + at, end: base + at + m[0].length });
        continue;
      }
    }
    // "the integrated analysis of Parts A and B of Study X" combines parts of one study: a part scope, not a pool (pvs-33).
    if (/^(?:integrated|pooled)/i.test(m[0]) && /^(?:\s+analysis)?\s+of\s+(?:the\s+)?Parts?\s+[A-Z0-9]/.test(text.slice(at + m[0].length))) {
      refs.push({ start: base + at, end: base + at + m[0].length });
      continue;
    }
    // Members: study codes listed after the marker, up to the end of the sentence or a closing bracket run.
    const tail = text.slice(at, Math.min(text.length, at + 260));
    // The member list may follow a colon ("ISS Pool 1: Studies ABC-301 and ABC-302"); any other ": Capitalised" ends it.
    const stop = /[.;](?:\s|$)(?![^(]*\))|:\s+(?!Stud(?:y|ies)\b)(?=[A-Z][a-z])/.exec(tail.slice(m[0].length));
    const window = stop ? tail.slice(0, m[0].length + stop.index) : tail;
    const lead = text.slice(Math.max(0, at - 160), at);
    const leadList = /\(\s*((?:Studies\s+)?(?:[A-Z]{1,5}-\d{2,4}(?:\s*\[NCT\d{8}\])?(?:\s*(?:,|and|\+|\/)\s*)?){2,})\s*\)?\s*$/.exec(lead);
    const codes = studiesIn(window, base + at, doc);
    let members: string[][] | null = null;
    if (codes.length >= 2) {
      const sets = new Map<string, string[]>();
      for (const c of codes) sets.set(c.aliases.join('|'), c.aliases);
      members = [...sets.values()].sort((a, b) => a[0].localeCompare(b[0]));
    } else if (leadList) {
      const cs = studiesIn(leadList[1], 0, doc);
      if (cs.length >= 2) members = cs.map((c) => c.aliases);
    }
    const cutoff = cutoffOf(window) ?? cutoffOf(lead);
    out.push({ start: base + at, end: base + at + m[0].length, members, cutoff, ...(poolScopeOf(`${lead.slice(-60)}${m[0]}`) ? { scope: poolScopeOf(`${lead.slice(-60)}${m[0]}`) } : {}) });
  }
  return out;
}

const rowsAll = <T extends { re: RegExp }>(rows: T[], text: string) => {
  const hits: Array<{ row: T; m: RegExpExecArray }> = [];
  for (const row of rows) {
    row.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = row.re.exec(text)) !== null) {
      if (m[0].length === 0) {
        row.re.lastIndex++;
        continue;
      }
      hits.push({ row, m });
    }
  }
  return hits;
};

const overlaps = (a: Span, spans: readonly Span[]) => spans.some((s) => s.start < a.end && a.start < s.end);

/** Period key from a period phrase match. */
function periodKey(key: string, m: RegExpExecArray): string {
  const n = m.slice(1).find((g) => g !== undefined);
  switch (key) {
    case 'through':
      return `through:w${n}`;
    case 'treatment-emergent':
      return `treatment-emergent:${n}d`;
    case 'interval-first':
      return `interval:0-${n}m`;
    case 'interval':
      return `interval:${m[1]}-${m[2]}m`;
    case 'interval-after':
      return `interval:>${n}m`;
    case 'whole':
      return 'overall';
    case 'after-week':
      return `after:w${n}`;
    case 'before-week':
      return `before:w${n}`;
    case 'year':
      return `year:${(m[1] ?? '').toLowerCase()}`;
    case 'phase':
      return `phase:${(m[1] ?? '').toLowerCase()}`;
    // "the first 12 weeks of the placebo-controlled period": a sub-window, never the period that contains it.
    case 'sub-window':
      return `first-${m[1]}w@${(m[2] ?? '').toLowerCase()}`;
    // "52-week double-blind period", "Placebo-controlled period (52 weeks)": the stated length belongs to the key.
    case 'double-blind':
    case 'placebo-controlled':
      return n ? `${key}:${n}w` : key;
    case 'amendment':
      return m[3] ? 'amendment:original' : `amendment:${/after/i.test(m[1] ?? '') ? 'after' : 'before'}${m[2] ? `:${m[2]}` : ''}`;
    default:
      return key;
  }
}

/** Neutral phrases that hold a trigger word but carry no scope. */
const NEUTRAL = [
  /\b(?:randomi[sz]ed|double-blind|placebo-controlled|parallel-group|multicent(?:re|er)|open-label|active-controlled|single-blind)(?:,?\s+(?:randomi[sz]ed|double-blind|placebo-controlled|parallel-group|multicent(?:re|er)|active-controlled))*\s+(?:\d+-week,?\s+)?(?:study|studies|trial|trials)\b/gi,
  /\b\d+-week,?\s+(?:randomi[sz]ed,?\s+)?(?:double-blind,?\s+)?(?:placebo-controlled\s+)?(?:study|trial|trials|treatment\s+period)\b/gi,
  /\bchange\s+from\s+baseline\b|\bfrom\s+baseline\b|\bbaseline\s+(?:value|HbA1c|means?|characteristics|disease\s+severity|culture)\b|\bat\s+baseline\b|\bwith\s+measurable\s+disease\b|\bpost-baseline\b|\bWorse?n(?:ed|ing)\s+from\s+Baseline\b/gi,
  /\bstratified\s+by\s+(?:study|region|baseline[\w\s]*?)(?=[,)])|\bstratification\s+factors\b/gi,
  /\bmoderate\s+or\s+severe\s+exacerbation\b|\bMost\s+reports\s+of\b/gi,
  /\bpatients\s+with\s+(?:type\s+2\s+diabetes(?:\s+mellitus)?|previously\s+treated|measurable\s+disease|a\s+baseline\s+value|an?\s+event|treatment\s+failure|erosive)/gi,
  /\b(?:adults?|patients)\s+with\s+type\s+2\s+diabetes(?:\s+mellitus)?(?:\s+(?:inadequately\s+controlled\s+on\s+metformin|and\s+established\s+cardiovascular\s+disease))?\b/gi,
  /\bthe\s+(?:pre-specified|prespecified)\s+non-inferiority\s+margin\b|\bnon-inferiority\s+(?:analysis|margin|criterion)\b|\bhierarchical\s+testing\s+procedure\b|\bthe\s+alpha\s+(?:allocated|split)\b[^.;]*/gi,
  /\bPatients\s+at\s+risk\b|\bTotal\s+exposure\b|\bpatient-years\b|\bsubject-years\b/gi,
  /\b(?:the\s+)?(?:study|trial)\s+population\b|\bthe\s+clinical\s+programme\b/gi,
  /\bpatients\s+with\s+event\b/gi,
  // The measure phrase of an incidence: "the percentage of patients with SAEs", "patients with at least one TEAE" names
  // the event counted, never a subgroup (r1 pv-percentage-of-patients-with, pv-similar-between-groups-paren).
  /\b(?:(?:percentage|proportion|number|incidence)\s+of\s+)?(?:patients|subjects|participants)\s+with\s+(?:(?:an?|any|at\s+least\s+one|one\s+or\s+more)\s+)?(?:serious\s+|treatment-emergent\s+)?(?:S?AEs?|TEAEs?|adverse\s+(?:events?|reactions?)|serious\s+adverse)\b/gi,
  // A table broken down by a subgroup factor: its rows state each subgroup ("Serious Adverse Events by Age Subgroup").
  /\bby\s+(?:Age|Sex|Gender|Region|Race|Ethnicity|Baseline\s+[A-Za-z0-9]+)\s+(?:Sub-?groups?|Categor(?:y|ies))\b|\bby\s+Sub-?groups?\b/gi,
  // Trial-conduct descriptors (§5.1 NEUTRAL): "at 94 sites in 11 countries".
  /\bat\s+\d+\s+(?:investigational\s+)?sites(?:\s+in\s+\d+\s+countries)?\b|\bin\s+\d+\s+countries\b/gi,
];

/** Eligibility wording that describes the trial's whole population (taken before subgroup rows). */
const ELIGIBILITY =
  /\b(?:adults?|(?:adult\s+|pediatric\s+)?patients|subjects)\s+(?:\d+\s+to\s+\d+\s+years\s+of\s+age\s+)?with\s+type\s+2\s+diabetes(?:\s+mellitus)?\s+(?:inadequately\s+controlled\s+on\s+[a-z]+|and\s+established\s+cardiovascular\s+disease)\b|\bStudy\s+of\s+[A-Z][a-z]+\s+in\s+Adults\s+with\s+Type\s+2\s+Diabetes\b/gi;

export function qualsOf(text: string, base: number, doc: DocInfo): Quals {
  const q: Quals = {
    studies: [],
    pools: [],
    populations: [],
    periods: [],
    timepoints: [],
    subgroups: [],
    whole: false,
    analysis: {},
    endpoints: [],
    consumed: [],
    unrecognised: [],
    unrecognisedSpans: [],
  };
  const take = (start: number, end: number) => q.consumed.push({ start: base + start, end: base + end });

  const refs: Span[] = [];
  q.pools = poolsIn(text, base, doc, refs);
  q.consumed.push(...refs);
  for (const p of q.pools) q.consumed.push(p);
  const pooledMembers = new Set(q.pools.flatMap((p) => (p.members ?? []).flat()));
  for (const s of studiesIn(text, base, doc)) {
    q.consumed.push(s);
    // A code listed as a pool member is not the figure's study.
    if (!s.aliases.some((a) => pooledMembers.has(a))) q.studies.push(s);
  }
  // Pool member lists and their brackets.
  for (const m of text.matchAll(/\((?:Studies\s+|Pool\s+\w+:\s+)?[A-Z]{1,5}-[\w]+(?:\s*\[NCT\d{8}\])?(?:\s*(?:,|and|\+|;)\s*[A-Z]{1,5}-[\w]+(?:\s*\[NCT\d{8}\])?)+[^)]*\)/g)) take(m.index!, m.index! + m[0].length);

  // "intent-to-treat population (all randomized patients)": the parenthetical defines the set, it is not a second one.
  const defSpans: Span[] = [];
  // "modified intent-to-treat (mITT) population": the "intent-to-treat" inside the longer phrase is the same words,
  // not a second population (r2 scope-15).
  const popHits = rowsAll(POPULATION_ROWS, text);
  for (const { row, m } of popHits.filter(
    (h) => !popHits.some((o) => o !== h && o.m.index <= h.m.index && h.m.index + h.m[0].length <= o.m.index + o.m[0].length && o.m[0].length > h.m[0].length),
  )) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 80);
    const all = ALL_RANDOMIZED_DEF;
    all.lastIndex = 0;
    // The definition may be introduced in words — "the Full Analysis Set, defined as all randomised patients" — which
    // is how a CSR states a population the first time (r2 scope-16).
    const defM =
      /^\s*\(?\s*(?:\(?[A-Z]+\)?\s*)?[,(;]?\s*(?:defined\s+as\s+|that\s+is,?\s+|i\.e\.,?\s+|comprising\s+|consisting\s+of\s+|which\s+(?:includes?|included|comprised)\s+)?all\s+randomi[sz]ed(?:\s+(?:patients|subjects|participants))?(?=\s*[),;:.]|\s+N\s*=)/i.exec(
        after,
      );
    const def = !!defM && row.key !== 'randomized';
    if (def) defSpans.push({ start: base + m.index + m[0].length, end: base + m.index + m[0].length + defM![0].length });
    const p = { set: row.key, start: base + m.index, end: base + m.index + m[0].length, ...(def || doc.allRandomized.has(row.key) || row.key === 'randomized' ? { allRandomized: true as const } : {}) };
    q.populations.push(p);
    take(m.index, m.index + m[0].length);
  }
  // "(all randomised patients, …)" after a population name.
  for (const m of text.matchAll(/\ball\s+randomi[sz]ed(?:\s+(?:patients|subjects|participants))?\b/gi)) take(m.index!, m.index! + m[0].length);
  // "received at least one dose", "treated" population phrases.
  for (const m of text.matchAll(/\b(?:received|receiving|receive)\s+(?:at\s+least\s+one|any)\s+dose(?:\s+of\s+(?:study\s+drug|[a-z]+))?\b|\bexposed\s+to\b/gi)) take(m.index!, m.index! + m[0].length);
  q.populations = q.populations.filter((p) => !(p.set === 'randomized' && defSpans.some((d) => d.start <= p.start && p.end <= d.end)));
  q.populations.sort((a, b) => a.start - b.start);
  if (q.populations.length > 0) {
    const sets = new Set(q.populations.map((p) => p.set));
    // Two different populations in one span: the span does not settle it ("ITT / Safety Population" headings keep both).
    q.population = sets.size === 1 ? q.populations[0] : q.populations[q.populations.length - 1];
    if (sets.size > 1) q.population = undefined;
    if (q.populations.some((p) => p.allRandomized) && q.population) q.population = { ...q.population, allRandomized: true };
  }

  const periodSpans: Span[] = [];
  // A period hit inside a longer one is part of it: "the placebo-controlled period" inside "the first 12 weeks of
  // the placebo-controlled period" is the same words, not a second window (r2 scope-05).
  const periodHits = rowsAll(PERIOD_ROWS, text);
  for (const { row, m } of periodHits.filter(
    (h) => !periodHits.some((o) => o !== h && o.m.index <= h.m.index && h.m.index + h.m[0].length <= o.m.index + o.m[0].length && o.m[0].length > h.m[0].length),
  )) {
    q.periods.push(periodKey(row.key, m));
    take(m.index, m.index + m[0].length);
    periodSpans.push({ start: m.index, end: m.index + m[0].length });
  }
  // "(26-week double-blind period plus 26-week extension)" describing a window: one window.
  const distinct = [...new Set(q.periods)];
  if (distinct.length === 1) q.period = distinct[0];
  else if (distinct.length > 1) {
    const through = distinct.find((p) => p.startsWith('through:') || p.startsWith('interval:') || p === 'entire');
    const described = /\(\s*\d+-week\s+double-blind\s+period\s+plus\s+\d+-week\s+extension\s*\)/i.exec(text);
    if (through && described) {
      q.period = through;
      take(described.index, described.index + described[0].length);
    }
    else q.period = `conflict:${distinct.join('|')}`;
  }

  for (const { row, m } of rowsAll(TIMEPOINT_ROWS, text)) {
    // "through Week 52" is a period, not a timepoint.
    if (overlaps({ start: m.index, end: m.index + m[0].length }, periodSpans)) continue;
    const n = m[1];
    const key = row.key === 'toc' ? 'toc' : row.key === 'week-post' ? `week-${n}-post` : `${row.key}-${n}`;
    if (!q.timepoints.includes(key)) q.timepoints.push(key);
    take(m.index, m.index + m[0].length);
  }
  if (q.timepoints.includes('toc')) q.timepoints = ['toc'];
  const post = q.timepoints.find((t) => t.endsWith('-post'));
  if (post) q.timepoints = [post];

  // A trial's eligibility description names its whole population, not a subgroup:
  // "621 adult patients with type 2 diabetes mellitus inadequately controlled on metformin were randomized",
  // "enrolled adults with type 2 diabetes and established cardiovascular disease". A bare
  // "In patients with type 2 diabetes," (fs-37) stays a subgroup.
  for (const m of text.matchAll(ELIGIBILITY)) take(m.index!, m.index! + m[0].length);
  const subgroupSpans: Span[] = [];
  for (const row of SUBGROUP_ROWS) {
    row.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = row.re.exec(text)) !== null) {
      const span = { start: base + m.index, end: base + m.index + m[0].length };
      if (overlaps(span, q.consumed)) continue;
      const key = row.key(m);
      if (!q.subgroups.includes(key)) q.subgroups.push(key);
      q.consumed.push(span);
      subgroupSpans.push(span);
    }
  }
  // "the Japanese subpopulation", "the elderly subgroup": the generic noun names the subgroup just classified.
  for (const m of text.matchAll(/\s+(?:sub-?populations?|subgroups?|cohorts?)\b/gi)) {
    const at = base + m.index!;
    if (subgroupSpans.some((sp) => sp.end === at)) take(m.index!, m.index! + m[0].length);
  }
  // "elderly patients (≥75 years)": the definition replaces the bare word.
  if (q.subgroups.includes('elderly') && q.subgroups.some((s) => s.startsWith('age>='))) q.subgroups = q.subgroups.filter((s) => s !== 'elderly');
  WHOLE_POPULATION.lastIndex = 0;
  q.whole = WHOLE_POPULATION.test(text);
  for (const m of text.matchAll(WHOLE_POPULATION)) take(m.index!, m.index! + m[0].length);

  PART_ROW.lastIndex = 0;
  const part = PART_ROW.exec(text);
  if (part) {
    q.part = part[2] ? [part[1], part[2]].sort().join('+') : part[1];
    take(part.index, part.index + part[0].length);
  }
  // "in Stage 1", "in the second stage" of a two-stage design: a part of the study (r1 sp-35, sp-36).
  STAGE_ROW.lastIndex = 0;
  const stage = STAGE_ROW.exec(text);
  if (stage && !q.part) {
    const ord: Record<string, string> = { first: '1', second: '2', third: '3' };
    q.part = `stage${stage[1] ?? ord[(stage[2] ?? '').toLowerCase()] ?? stage[2]}`;
    take(stage.index, stage.index + stage[0].length);
  }

  // Neutral phrases carry no scope: a role or method word inside one ("using the alpha allocated to the primary
  // comparison after the interim analysis") is not the figure's analysis (euc-33).
  const neutralSpans: Span[] = [];
  for (const re of NEUTRAL) {
    re.lastIndex = 0;
    let nm: RegExpExecArray | null;
    while ((nm = re.exec(text)) !== null) neutralSpans.push({ start: nm.index, end: nm.index + nm[0].length });
  }
  const first = <K extends string>(rows: Array<{ re: RegExp; key: K }>): K | undefined => {
    // A hit inside a longer hit is part of it ("secondary endpoint" inside "key secondary endpoint").
    const all = rowsAll(rows, text).filter((h) => !neutralSpans.some((n) => n.start <= h.m.index && h.m.index + h.m[0].length <= n.end));
    const hits = all.filter((h) => !all.some((o) => o !== h && o.m.index <= h.m.index && h.m.index + h.m[0].length <= o.m.index + o.m[0].length && o.m[0].length > h.m[0].length));
    for (const h of hits) take(h.m.index, h.m.index + h.m[0].length);
    const keys = [...new Set(hits.map((h) => h.row.key))];
    return keys.length === 1 ? keys[0] : keys.length > 1 ? hits.sort((a, b) => b.m.index - a.m.index)[0].row.key : undefined;
  };
  const role = first(ROLE_ROWS);
  if (role) q.analysis.role = role as Analysis['role'];
  // "the second interim analysis": the ordinal is part of the analysis, so two interims of one group-sequential
  // design are never compared with each other (r2 scope-12).
  const ORD: Record<string, string> = { first: '1', second: '2', third: '3', fourth: '4', fifth: '5' };
  const occ = /\b(first|second|third|fourth|fifth)\s+interim(?:\s+OS)?\s+analysis\b/i.exec(text);
  if (occ) q.analysis.occasion = ORD[occ[1].toLowerCase()];
  const cutoff = cutoffOf(text);
  if (cutoff) q.analysis.cutoff = cutoff;
  for (const m of text.matchAll(/\b(?:data\s+)?cut-?off(?:\s+date)?(?:\s+(?:of|for\s+this\s+ISS))?\s*\(?\s*\d{1,2}\s+[A-Za-z]+\s+\d{4}\)?|\b(?:updated\s+)?data\s+cut-?off(?:\s+of)?\b/gi)) take(m.index!, m.index! + m[0].length);
  const model = first(MODEL_ROWS);
  if (model) q.analysis.model = model;
  const estimand = first(ESTIMAND_ROWS);
  if (estimand) q.analysis.estimand = estimand;
  const imputation = first(IMPUTATION_ROWS);
  if (imputation) q.analysis.imputation = imputation;
  const method = first(METHOD_ROWS);
  if (method) q.analysis.method = method;
  const assessor = first(ASSESSOR_ROWS);
  if (assessor) q.analysis.assessor = assessor;
  q.ascertainment = first(ASCERTAINMENT_ROWS);
  q.causality = first(CAUSALITY_ROWS);

  for (const row of ENDPOINT_ROWS) {
    row.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = row.re.exec(text)) !== null) {
      const span = { start: base + m.index, end: base + m.index + m[0].length };
      if (q.endpoints.some((e) => e.start < span.end && span.start < e.end)) continue;
      const around = text.slice(Math.max(0, m.index - 40), Math.min(text.length, m.index + m[0].length + 30));
      const pct = /\bpercent(?:age)?\s+change\b|\bmean\s+percent\b|\bLS\s+mean\s+percent\b/i.test(around);
      q.endpoints.push({ ...span, id: row.id, kind: row.kind, unit: row.unit, pct });
      q.consumed.push(span);
    }
  }
  q.endpoints.sort((a, b) => a.start - b.start);
  q.endpointRole = first(ENDPOINT_ROLE_ROWS);

  for (const re of NEUTRAL) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) take(m.index, m.index + m[0].length);
  }

  // Trigger words left unclassified.
  for (const re of [TRIGGER, PLACE_TRIGGER]) {
    re.lastIndex = 0;
    let t: RegExpExecArray | null;
    while ((t = re.exec(text)) !== null) {
      const span = { start: base + t.index, end: base + t.index + t[0].length };
      if (!overlaps(span, q.consumed)) {
        q.unrecognised.push(t[0]);
        q.unrecognisedSpans.push({ ...span, word: t[0] });
      }
    }
  }
  return q;
}

/** The study a set of qualifiers names, when exactly one (alias sets merged) and no pool. */
export function oneStudy(q: Quals): StudyRef | undefined {
  const sets = new Map<string, string[]>();
  for (const s of q.studies) sets.set(s.aliases.join('|'), s.aliases);
  if (sets.size === 1) return { kind: 'study', aliases: [...sets.values()][0] };
  return undefined;
}

export function onePool(q: Quals): Extract<StudyRef, { kind: 'pool' }> | undefined {
  if (q.pools.length === 0) return undefined;
  const withMembers = q.pools.find((p) => p.members);
  const p = withMembers ?? q.pools[0];
  const cutoff = q.pools.map((x) => x.cutoff).find(Boolean) ?? q.analysis.cutoff;
  // "All-Exposure Pool" is one pool named twice (the marker matches the name and the word "Pool"): its scope is
  // whatever the mentions state, and two different scopes in one span leave the pool's own scope unsettled.
  const scopes = [...new Set(q.pools.map((x) => x.scope).filter(Boolean))] as string[];
  return { kind: 'pool', members: p.members, ...(cutoff ? { cutoff } : {}), ...(scopes.length === 1 ? { scope: scopes[0] } : {}) };
}
