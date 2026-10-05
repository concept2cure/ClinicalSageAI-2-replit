/**
 * Figures in AnA's answer, and where a source holds one (answer-grounding.ts),
 * round 2 (2026-10-04, after two refute-reviews of a3775bcef).
 *
 * Round 1 found a figure when its number occurred anywhere in a source. Five
 * real abstracts hold 144 distinct numbers, so a fabricated "ORR N%" was
 * "found" for 57 of 99 values of N, through dates, page numbers, p-values and
 * a percent-encoded URL. A figure is now found only where its number stands
 * with its own measure:
 *
 *   a percentage   followed by % or "percent", or as its proportion (47% as
 *                  0.47) under a rate's name (rate, proportion, response,
 *                  power, incidence…)
 *   a p-value      after p (p<, P=, "p-value of", a field named p)
 *   a ratio        after its own name: hazard ratio or HR, odds ratio or OR,
 *                  risk/rate ratio, relative risk, RR or IRR (the abbreviations
 *                  only in capitals: "Phase 2 or 3" is not an odds ratio)
 *   an interval    both bounds, near each other, beside CI or confidence
 *   n = …          beside n, enrolment, sample, patients
 *   a count        beside what it counts: patients (or subjects,
 *                  participants, enrolment…), sites, deaths, events, cases,
 *                  batches or lots
 *   a dose         followed by the same unit, or in a field named with it
 *   a duration     followed by the same unit, or in a field named with it
 *
 * The answer's figures are read in more of the forms a clinical writer uses
 * (47 percent, hazard ratio, 0.31, p-value = 0.0003, 212 pts, 31.2 mo, 48 h,
 * 100 μg, 95% CI [0.41, 0.77], HR (95% CI) 0.62 (0.50–0.77), 38–56%), with
 * signs kept and proportions compared without float noise. Every pattern has
 * bounded white space, so a long run of spaces costs linear time.
 *
 * @module server/services/ana/answer-check-figures
 */

import { asciiDashes, canonNumber, type NumberSeen } from './answer-check-sources';

export type FigureKind = 'percent' | 'p' | 'hr' | 'or' | 'rr' | 'ci' | 'n' | 'count' | 'dose' | 'duration';

/** A figure in the answer: what it is, the numbers it states, as written. */
export interface Figure {
  kind: FigureKind;
  values: string[];
  /** A count's noun group, a dose's or a duration's unit. */
  unit?: string;
  text: string;
  index: number;
}

// A number: a sign only where no digit precedes it (so 38-56 is a range).
const N = String.raw`(?<![\w.])-?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)`;
const S = String.raw`[ \t]{0,3}`; // bounded white space
const DASH = String.raw`(?:-|to|,)`;

const COUNT_UNITS: Array<[RegExp, string]> = [
  [/^(?:patients|pts|subjects|participants|women|men|children|adults|individuals|volunteers|people)$/i, 'people'],
  [/^(?:sites|centers|centres)$/i, 'sites'],
  [/^deaths$/i, 'deaths'],
  [/^events$/i, 'events'],
  [/^cases$/i, 'cases'],
  [/^(?:batches|lots)$/i, 'batches'],
];

const DOSE_UNITS: Array<[RegExp, string]> = [
  [/^mg\/kg$/i, 'mg/kg'],
  [/^mg\/m(?:2|²)$/i, 'mg/m2'],
  [/^(?:mcg|[µμu]g)\/kg$/i, 'ug/kg'],
  [/^mg$/i, 'mg'],
  [/^(?:mcg|[µμu]g)$/i, 'ug'],
  [/^ng$/i, 'ng'],
  [/^kg$/i, 'kg'],
  [/^g$/i, 'g'],
  [/^ml$/i, 'ml'],
  [/^iu$/i, 'iu'],
  [/^units?$/i, 'units'],
  [/^gy$/i, 'gy'],
];
const DOSE_UNIT_RE = String.raw`mg\/kg|mg\/m2|mg\/m²|mcg\/kg|[µμu]g\/kg|mg|mcg|[µμ]g|ug|ng|kg|g|mL|ml|IU|units?|Gy`;

const DURATION_UNITS: Array<[RegExp, string]> = [
  [/^(?:hours?|hrs?|h)$/i, 'h'],
  [/^(?:days?|d)$/i, 'd'],
  [/^(?:weeks?|wks?|wk)$/i, 'wk'],
  [/^(?:months?|mos?)$/i, 'mo'],
  [/^(?:years?|yrs?|yr)$/i, 'yr'],
];
const DURATION_UNIT_RE = String.raw`hours?|hrs?|h|days?|d|weeks?|wks?|wk|months?|mos?|years?|yrs?|yr`;

const unitOf = (table: Array<[RegExp, string]>, raw: string): string | undefined =>
  table.find(([re]) => re.test(raw.trim()))?.[1];

/** A figure a pattern builds: its span inside the match (the whole match by default). */
type Built = Omit<Figure, 'index' | 'text'> & { offset?: number; length?: number };
interface Pattern {
  re: RegExp;
  build: (m: RegExpExecArray) => Built[];
}

const v = (raw: string | undefined) => (raw === undefined ? null : canonNumber(raw));
const all = (...raws: Array<string | undefined>) => {
  const out = raws.map(v);
  return out.every((x): x is string => x !== null) ? out : null;
};
const one = (kind: FigureKind, _m: RegExpExecArray, raws: Array<string | undefined>, unit?: string): Built[] => {
  const values = all(...raws);
  return values ? [{ kind, values, unit }] : [];
};

const PATTERNS: Pattern[] = [
  // HR (95% CI) 0.62 (0.50–0.77): a ratio and its interval, two figures.
  {
    re: new RegExp(String.raw`\b(HR|OR|RR|IRR)${S}\(${S}(?:95|90|99)${S}%${S}CI${S}\)${S}[:=]?${S}(${N})${S}\(${S}(${N})${S}${DASH}${S}(${N})${S}\)`, 'g'),
    build: (m) => {
      const kind: FigureKind = m[1] === 'HR' ? 'hr' : m[1] === 'OR' ? 'or' : 'rr';
      const ratio = all(m[2]);
      const ci = all(m[3], m[4]);
      if (!ratio || !ci) return [];
      const open = m[0].lastIndexOf('(');
      return [
        { kind, values: ratio, length: open },
        { kind: 'ci', values: ci, offset: open },
      ];
    },
  },
  // 95% CI 0.48–0.81, 95% CI, 0.50 to 0.77, 95% CI [0.41, 0.77], 95% CI: (0.41–0.77).
  // A closing bracket is the interval's only when it opened one.
  {
    re: new RegExp(
      String.raw`\b(?:95|90|99)${S}%${S}(?:CI|confidence interval)${S}[:,]?${S}(?:\[${S}(${N})${S}${DASH}${S}(${N})${S}\]|\(${S}(${N})${S}${DASH}${S}(${N})${S}\)|(${N})${S}${DASH}${S}(${N}))`,
      'gi',
    ),
    build: (m) => one('ci', m, m[1] !== undefined ? [m[1], m[2]] : m[3] !== undefined ? [m[3], m[4]] : [m[5], m[6]]),
  },
  // hazard ratio for death, 0.49; odds ratio of 1.8
  {
    re: new RegExp(String.raw`\b(hazard ratio|odds ratio|risk ratio|rate ratio|relative risk)\b(?:[ \t]{1,2}[a-z][a-z ]{0,28}?)?${S}[,:=]?${S}(?:of|was|is|=)?${S}(${N})`, 'gi'),
    build: (m) => one(/hazard/i.test(m[1]) ? 'hr' : /odds/i.test(m[1]) ? 'or' : 'rr', m, [m[2]]),
  },
  // HR 0.62, HR=0.62, HR, 0.62, HR was 0.62, HR for death was 0.49: capitals only.
  {
    re: new RegExp(
      String.raw`\b(HR|OR|RR|IRR)\b(?:[ \t]{1,2}for[ \t]{1,2}[A-Za-z][A-Za-z ]{0,24}?)?${S}(?:[,:=]|was|of|is)?${S}(${N})`,
      'g',
    ),
    build: (m) => one(m[1] === 'HR' ? 'hr' : m[1] === 'OR' ? 'or' : 'rr', m, [m[2]]),
  },
  // p < 0.001, P=0.005, p-value = 0.0003, P value of 0.0003, p was 0.05
  {
    re: new RegExp(String.raw`\b[pP](?:${S}-?${S}value)?${S}(?:<=|>=|<|>|=|≤|≥|of|was|is)${S}(${N})`, 'g'),
    build: (m) => one('p', m, [m[1]]),
  },
  // 38–56%
  {
    re: new RegExp(String.raw`(${N})${S}${DASH}${S}(${N})${S}(?:%|percent\b|per[ \t]?cent\b)`, 'gi'),
    build: (m) => one('percent', m, [m[1], m[2]]),
  },
  // 47%, 47 percent — not a confidence level
  {
    re: new RegExp(String.raw`(${N})${S}(?:%|percent\b|per[ \t]?cent\b)(?!${S}(?:CI|confidence))`, 'gi'),
    build: (m) => one('percent', m, [m[1]]),
  },
  // n = 212
  {
    re: new RegExp(String.raw`\b[nN]${S}=${S}(${N})`, 'g'),
    build: (m) => one('n', m, [m[1]]),
  },
  // 212 patients, 212 randomized patients, 26 sites
  {
    re: new RegExp(
      String.raw`(?<![\w.])(\d{1,3}(?:,\d{3})+|\d{2,})[ \t]{1,2}(?:(?:randomi[sz]ed|enrolled|evaluable|treated|eligible|adult|pediatric|paediatric)[ \t]{1,2})?(patients|pts|subjects|participants|women|men|children|adults|individuals|volunteers|people|sites|centers|centres|deaths|events|cases|batches|lots)\b`,
      'gi',
    ),
    build: (m) => one('count', m, [m[1]], unitOf(COUNT_UNITS, m[2])),
  },
  // 240 mg, 10 mg/kg, 100 μg, 60 Gy, -1.2 kg
  {
    re: new RegExp(String.raw`(${N})${S}(${DOSE_UNIT_RE})(?![\w/])`, 'g'),
    build: (m) => one('dose', m, [m[1]], unitOf(DOSE_UNITS, m[2])),
  },
  // 9.1 months, 31.2 mo, 48 h, 24-month
  {
    re: new RegExp(String.raw`(${N})${S}-?${S}(${DURATION_UNIT_RE})\b`, 'gi'),
    build: (m) => one('duration', m, [m[1]], unitOf(DURATION_UNITS, m[2])),
  },
];

/** The figures an answer states, in the order it states them. */
export function figuresIn(answer: string): Figure[] {
  const text = asciiDashes(answer);
  const out: Figure[] = [];
  const taken: Array<[number, number]> = [];
  const overlaps = (a: number, b: number) => taken.some(([x, y]) => a < y && b > x);
  for (const { re, build } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const figures = build(m);
      if (figures.length === 0) continue;
      taken.push([start, end]);
      for (const f of figures) {
        const at = start + (f.offset ?? 0);
        const to = f.length !== undefined ? start + f.length : end;
        // The text as the answer wrote it: the normalisation keeps every length.
        out.push({ kind: f.kind, values: f.values, unit: f.unit, text: answer.slice(at, to).replace(/\s+/g, ' ').trim(), index: at });
      }
    }
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.index - b.index)
    .filter((f) => {
      const k = `${f.kind}:${f.values.join(',')}:${f.unit ?? ''}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/* ── Where a source holds a figure ───────────────────────────────────────── */

const RATE_WORDS = /\b(?:rates?|proportions?|percent(?:age)?|pct|orr|responses?|responders?|incidence|prevalence|frequenc(?:y|ies)|fractions?|shares?|power|coverage|probabilit(?:y|ies)|survival|alive|risk)\b/i;
/** A ratio's name before its number in a text (abbreviations in capitals), or as its field's name. */
const RATIO_TEXT: Record<'hr' | 'or' | 'rr', RegExp> = {
  hr: /hazard ratio|\bHR\b/i,
  or: /odds ratio|\bOR\b/,
  rr: /relative risk|risk ratio|rate ratio|\bRR\b|\bIRR\b/,
};
const RATIO_KEY: Record<'hr' | 'or' | 'rr', RegExp> = {
  hr: /hazard|^hr$|\bhr\b/,
  or: /odds|^or$/,
  rr: /relative risk|risk ratio|rate ratio|^rr$|^irr$/,
};
const P_BEFORE = /\b[pP](?:\s{0,2}-?\s{0,2}val(?:ue)?)?\s{0,3}(?:<=|>=|<|>|=|≤|≥|of|was|is|:|,)?\s{0,3}$/;
const P_KEY = /^(?:p|p ?value|pval)$|\bp ?value\b/;
const CI_WORDS = /\bci(?:\d{2})?\b|\b\d{2}ci\b|confidence|interval|lower|upper/i;
const N_WORDS = /(?:\bn\b|\bN\b|enrol|sample|patients?|subjects?|participants?|randomi[sz]|population|cohort|size)/i;
const COUNT_WORDS: Record<string, RegExp> = {
  people: /patient|\bpts\b|subject|participant|enrol|randomi[sz]|individual|people|women|\bmen\b|children|adults|volunteer|\bn\b|sample|population|cohort|evaluable/i,
  sites: /\bsites?\b|cent(?:er|re)s?|locations?|institutions?|hospitals?|clinics?/i,
  deaths: /death|died|mortality|fatal/i,
  events: /events?/i,
  cases: /cases?/i,
  batches: /batch|\blots?\b/i,
};

/** The unit a number in a source is followed by, in the same vocabulary as the answer's. */
const unitAfter = (table: Array<[RegExp, string]>, unitRe: string, after: string): string | undefined => {
  const m = new RegExp(String.raw`^[ \t]?-?[ \t]?(${unitRe})(?![\w/])`, 'i').exec(after);
  return m ? unitOf(table, m[1]) : undefined;
};

/** A field name holding a unit ("dose mg", "median pfs months"). */
const keyHasUnit = (table: Array<[RegExp, string]>, key: string, unit: string): boolean =>
  key.split(/\s+/).some((word) => unitOf(table, word) === unit);

const proportionOf = (percent: string): string | null => canonNumber(Number(percent) / 100);

/** Whether one number of a figure is held, with its measure, in one place. One test per kind. */
const HOLDS: Record<Exclude<FigureKind, 'ci'>, (fig: Figure, value: string, o: NumberSeen) => boolean> = {
  percent: (_f, value, o) =>
    (o.value === value && (/^[ \t]?(?:%|percent\b|per[ \t]?cent\b)/i.test(o.after) || /\b(?:pct|percent(?:age)?)\b/.test(o.key))) ||
    (o.value === proportionOf(value) && RATE_WORDS.test(`${o.before} ${o.key}`)),
  p: (_f, value, o) => o.value === value && (P_BEFORE.test(o.before) || P_KEY.test(o.key)),
  hr: (_f, value, o) => o.value === value && (RATIO_TEXT.hr.test(o.before) || RATIO_KEY.hr.test(o.key)),
  or: (_f, value, o) => o.value === value && (RATIO_TEXT.or.test(o.before) || RATIO_KEY.or.test(o.key)),
  rr: (_f, value, o) => o.value === value && (RATIO_TEXT.rr.test(o.before) || RATIO_KEY.rr.test(o.key)),
  n: (_f, value, o) => o.value === value && N_WORDS.test(`${o.before.slice(-24)} ${o.key}`),
  count: (fig, value, o) =>
    o.value === value && (COUNT_WORDS[fig.unit ?? 'people'] ?? COUNT_WORDS.people).test(`${o.before.slice(-30)} ${o.key} ${o.after}`),
  dose: (fig, value, o) =>
    o.value === value && (unitAfter(DOSE_UNITS, DOSE_UNIT_RE, o.after) === fig.unit || keyHasUnit(DOSE_UNITS, o.key, fig.unit ?? '')),
  duration: (fig, value, o) =>
    o.value === value &&
    (unitAfter(DURATION_UNITS, DURATION_UNIT_RE, o.after) === fig.unit || keyHasUnit(DURATION_UNITS, o.key, fig.unit ?? '')),
};

/** Both bounds of an interval in one source: near each other, one of them beside CI. */
function holdsInterval(fig: Figure, index: NumberIndex): boolean {
  const [lo, hi] = fig.values;
  for (const a of index.get(lo) ?? NONE) {
    for (const b of index.get(hi) ?? NONE) {
      if (b === a || b.group !== a.group) continue;
      const gap = b.pos - a.pos;
      const close = a.field && b.field ? Math.abs(gap) <= 3 : gap > 0 && gap <= 30;
      if (close && (CI_WORDS.test(`${a.before} ${a.key}`) || CI_WORDS.test(`${b.before} ${b.key}`))) return true;
    }
  }
  return false;
}

/**
 * Numbers by value. A figure looks only at the numbers equal to its own (or,
 * for a percentage, to its proportion), so its cost does not grow with every
 * number every source holds: the reviewers' p6 turn (400 claims against 25
 * sources of 60k characters) took 5.6 s scanning them all.
 */
export type NumberIndex = ReadonlyMap<string, readonly NumberSeen[]>;

export function indexNumbers(seen: readonly NumberSeen[]): NumberIndex {
  const index = new Map<string, NumberSeen[]>();
  for (const o of seen) {
    const at = index.get(o.value);
    if (at) at.push(o);
    else index.set(o.value, [o]);
  }
  return index;
}

const NONE: readonly NumberSeen[] = [];

/** The numbers that could hold one value of a figure. */
function candidates(fig: Figure, value: string, index: NumberIndex): readonly NumberSeen[] {
  const same = index.get(value) ?? NONE;
  if (fig.kind !== 'percent') return same;
  const proportion = proportionOf(value);
  const asProportion = proportion === null || proportion === value ? NONE : index.get(proportion) ?? NONE;
  return asProportion.length === 0 ? same : [...same, ...asProportion];
}

/** Every number of the figure, held with its measure, among the indexed numbers. */
export function figureHeld(fig: Figure, index: NumberIndex): boolean {
  if (index.size === 0) return false;
  if (fig.kind === 'ci') return holdsInterval(fig, index);
  const held = HOLDS[fig.kind];
  return fig.values.every((value) => candidates(fig, value, index).some((o) => held(fig, value, o)));
}
