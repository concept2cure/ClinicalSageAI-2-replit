/**
 * How the answer check reads one source (answer-grounding.ts), round 2
 * (2026-10-04, after two refute-reviews of a3775bcef).
 *
 * A source is read three ways, each for its own kind of claim:
 *
 *   own        everything the source says, for an identifier, a regulation or
 *              a quote the model did NOT ask it for. A JSON result is read as
 *              "key: value" lines, so a value keeps its field's name beside it
 *              ("pmid: 31234567", "enrollment: 305").
 *   records    only what the source returns as records, for a claim the model
 *              DID ask it for: the search tools echo the request on a hit, a
 *              zero-hit and an outage alike, generate_citation formats any
 *              section it is given, and search_document returns the model's
 *              own text. So:
 *                - the top-level fields are the envelope and are not read,
 *                  unless the result declares it verified what it returns;
 *                - a field that holds the request (`query`, `input`, a URL…)
 *                  or a not-found list is not read, at any depth;
 *                - a record that says it was not found is not read;
 *                - a string that is part of what the model sent is an echo:
 *                  not read, except a single identifier inside a record that
 *                  also returns something of its own (a registry record
 *                  about the id the model searched for confirms it);
 *                - a record with nothing of its own (only echoes, numbers)
 *                  is not read.
 *   numbers    every number with what stands around it, for a figure
 *              (answer-check-figures.ts). A number is marked an echo, AnA's
 *              own input and not a result, when it stands inside a string the
 *              model sent, or alone in a field (240, "47%", "240 mg") with a
 *              value the model sent: as sent, or as its percentage or
 *              proportion where either side names a rate (0.47 sent, "47%"
 *              returned). A number inside a passage the source wrote (an
 *              abstract) is the source's own, even when the model searched
 *              for it.
 *
 * URLs are dropped from every reading: a fetched URL is the model's choice,
 * and a percent-encoded query leaks its digits. ISO dates and timestamps are
 * dropped from the numbers. Walks stop at a fixed depth, so no result shape can
 * overflow the stack.
 *
 * @module server/services/ana/answer-check-sources
 */

/** How deep a JSON result is walked. Deeper values are not read. */
const MAX_DEPTH = 64;

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
/** URLs removed. */
export function withoutUrls(text: string): string {
  return text.replace(URL_RE, ' ');
}

/** Unicode minus signs and dashes as ASCII, so "−1.2" and "0.50–0.77" compare. */
export function asciiDashes(text: string): string {
  return text.replace(/[‐-―−﹘﹣－]/g, '-');
}

const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g;

/** Keys whose subtree holds the request, a link or what was not found: never a record. */
const ECHO_KEYS = new Set([
  'input', 'inputs', 'query', 'queries', 'request', 'params', 'parameters', 'arguments', 'args',
  'search', 'searchterm', 'searchterms', 'term', 'terms', 'q', 'url', 'urls', 'link', 'links', 'href',
  'notfound', 'missing', 'unmatched', 'failed', 'errors', 'error',
]);
const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
const isEchoKey = (k: string | null) => k !== null && ECHO_KEYS.has(normKey(k));

/** "sampleSize" → "sample size", "change_kg" → "change kg". */
export function keyWords(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .toLowerCase()
    .trim();
}

const NEGATIVE_STATUS = new Set([
  'notfound', 'notverified', 'unverified', 'unverifiable', 'nomatch', 'lookupfailed', 'failed', 'error',
  'notincorpus', 'missing', 'none', 'invalid', 'unknown',
]);

/** A record that says it was not found, or not verified. */
function saysNotFound(rec: Record<string, unknown>): boolean {
  for (const k of ['status', 'verification', 'result', 'outcome', 'match', 'state']) {
    const v = rec[k];
    if (typeof v === 'string' && NEGATIVE_STATUS.has(normKey(v))) return true;
  }
  return rec.found === false || rec.verified === false || rec.exists === false;
}

/** A result that declares it checked what it returns against a source (generate_citation). */
function declaresVerified(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const r = parsed as Record<string, unknown>;
  return r.verified === true || r.verification === 'verified' || r.verification === 'identified';
}

/** JSON, or undefined when the text is not JSON. */
export function parseJson(text: string): unknown {
  const t = text.trim();
  if (!t || (t[0] !== '{' && t[0] !== '[')) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

/* ── What the model sent ─────────────────────────────────────────────────── */

/** A call's input, as the readings compare with it. */
export interface InputRead {
  /** Every string the model sent (four characters or more). */
  strings: string[];
  /** Every number it sent, by the normalised name of the field it sent it in. */
  numbersByKey: Map<string, Set<string>>;
  /** Every number it sent, in any field. */
  numbers: Set<string>;
  /** Each number it sent as a percentage or a proportion (0.47 ↔ 47), for a rate restated in the other form. */
  rateForms: Set<string>;
  /** The input as "key: value" lines: where a figure the model chose can be found. */
  text: string;
}

export const NO_INPUT: InputRead = { strings: [], numbersByKey: new Map(), numbers: new Set(), rateForms: new Set(), text: '' };

/** A number in its one compared form: no separators, no float noise. */
export function canonNumber(raw: string | number): string | null {
  const n = typeof raw === 'number' ? raw : Number(asciiDashes(String(raw)).replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) return null;
  return String(Number(n.toPrecision(12)));
}

export function readInput(asked: string | undefined): InputRead {
  if (!asked) return NO_INPUT;
  const parsed = parseJson(asked);
  if (parsed === undefined) {
    return { strings: asked.length >= 4 ? [asked] : [], numbersByKey: new Map(), numbers: new Set(), rateForms: new Set(), text: asked };
  }
  const strings: string[] = [];
  const numbersByKey = new Map<string, Set<string>>();
  const lines: string[] = [];
  const note = (key: string, n: string | null) => {
    if (n === null) return;
    const k = normKey(key);
    if (!numbersByKey.has(k)) numbersByKey.set(k, new Set());
    numbersByKey.get(k)!.add(n);
  };
  const walk = (v: unknown, key: string, depth: number): void => {
    if (depth > MAX_DEPTH || v === null || v === undefined) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, key, depth + 1);
    } else if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, k, depth + 1);
    } else if (typeof v === 'number') {
      note(key, canonNumber(v));
      lines.push(`${keyWords(key)}: ${v}`);
    } else if (typeof v === 'string') {
      if (v.trim().length >= 4) strings.push(v);
      if (/^\s*-?[\d.,]+\s*$/.test(v)) note(key, canonNumber(v));
      lines.push(`${keyWords(key)}: ${v}`);
    }
  };
  walk(parsed, '', 0);
  const numbers = new Set([...numbersByKey.values()].flatMap((set) => [...set]));
  const rateForms = new Set(
    [...numbers].flatMap((n) => [canonNumber(Number(n) * 100), canonNumber(Number(n) / 100)]).filter((n): n is string => n !== null),
  );
  return { strings, numbersByKey, numbers, rateForms, text: asciiDashes(withoutUrls(lines.join('\n'))) };
}

/** A string that is part of what the model sent. */
export function isEchoOf(input: InputRead, value: string): boolean {
  const v = value.trim();
  return v.length >= 3 && input.strings.some((s) => s.includes(v));
}

/** One identifier, with at most a short label: "NCT04123456", "PMID 31234567", "PMID: 31234567". */
const isSingleToken = (v: string) => /^(?:[A-Za-z]{2,8}[:#]?[ \t]{0,2})?\S{2,40}$/.test(v.trim());

/* ── The readings ──────────────────────────────────────────────────────── */

/** Everything a source says, as "key: value" lines for JSON; without URLs. */
export function ownText(content: string, parsed: unknown): string {
  if (parsed === undefined) return asciiDashes(withoutUrls(content));
  const lines: string[] = [];
  const walk = (v: unknown, key: string, depth: number): void => {
    if (depth > MAX_DEPTH || v === null || v === undefined) return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, key, depth + 1);
    } else if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (!['url', 'urls', 'link', 'links', 'href'].includes(normKey(k))) walk(x, k, depth + 1);
      }
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      lines.push(`${keyWords(key)}: ${v}`);
    }
  };
  walk(parsed, '', 0);
  return asciiDashes(withoutUrls(lines.join('\n')));
}

/** Where the record reading writes, and what it compares with. */
interface RecordsContext {
  input: InputRead;
  out: string[];
}

/** One record's fields while it is read. */
interface RecordFields {
  kept: string[];
  confirmed: string[];
  /** It returns something of its own, not only echoes and bare numbers. */
  ownContent: boolean;
}

const isPlainObject = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x);

function readField(ctx: RecordsContext, acc: RecordFields, key: string, value: string | number): void {
  const line = `${keyWords(key)}: ${value}`;
  if (typeof value === 'number') {
    acc.kept.push(line);
    return;
  }
  if (isEchoOf(ctx.input, value)) {
    if (isSingleToken(value)) acc.confirmed.push(line);
    return;
  }
  acc.kept.push(line);
  // Something of its own: a text, or a value like "47%", not a bare number (a
  // line number, an offset or a score is what a tool that only processed the
  // model's text returns beside it).
  if (!/^\s*-?[\d.,]+\s*$/.test(value) && (value.match(/[A-Za-z0-9]/g) ?? []).length >= 2) acc.ownContent = true;
}

function collectList(ctx: RecordsContext, acc: RecordFields, key: string, list: unknown[], depth: number): void {
  for (const x of list) {
    if (isPlainObject(x)) takeRecord(ctx, x, depth + 1);
    else if (typeof x === 'string' || typeof x === 'number') readField(ctx, acc, key, x);
  }
}

function collectFields(ctx: RecordsContext, acc: RecordFields, o: Record<string, unknown>, depth: number): void {
  if (depth > MAX_DEPTH) return;
  for (const [k, v] of Object.entries(o)) {
    if (isEchoKey(k) || v === null || v === undefined) continue;
    if (Array.isArray(v)) collectList(ctx, acc, k, v, depth);
    else if (typeof v === 'object') collectFields(ctx, acc, v as Record<string, unknown>, depth + 1);
    else if (typeof v === 'string' || typeof v === 'number') readField(ctx, acc, k, v);
  }
}

/** One record's fields, as lines, if it returns something of its own. */
function takeRecord(ctx: RecordsContext, rec: Record<string, unknown>, depth: number): void {
  if (depth > MAX_DEPTH || saysNotFound(rec)) return;
  const acc: RecordFields = { kept: [], confirmed: [], ownContent: false };
  collectFields(ctx, acc, rec, depth);
  if (acc.ownContent) ctx.out.push(...acc.kept, ...acc.confirmed);
}

/** A list in the envelope: its records, and its bare values that are not echoes. */
function walkList(ctx: RecordsContext, list: unknown[], key: string | null, depth: number): void {
  for (const x of list) {
    if (isPlainObject(x)) takeRecord(ctx, x, depth + 1);
    else if (Array.isArray(x)) walkList(ctx, x, null, depth + 1);
    else if ((typeof x === 'string' && !isEchoOf(ctx.input, x)) || typeof x === 'number') ctx.out.push(`${keyWords(key ?? '')}: ${x}`);
  }
}

function walkEnvelope(ctx: RecordsContext, v: unknown, key: string | null, depth: number, top: boolean): void {
  if (depth > MAX_DEPTH || v === null || v === undefined || isEchoKey(key)) return;
  if (Array.isArray(v)) {
    walkList(ctx, v, key, depth);
  } else if (isPlainObject(v)) {
    if (!top || declaresVerified(v)) {
      takeRecord(ctx, v, depth);
      return;
    }
    // The envelope: its own fields are not read; what it holds is.
    for (const [k, x] of Object.entries(v)) {
      if (x && typeof x === 'object') walkEnvelope(ctx, x, k, depth + 1, false);
    }
  }
}

/** What a result returns as records, for a claim the model asked it for (see the module docstring). */
export function recordsText(parsed: unknown, input: InputRead): string {
  if (parsed === undefined) return '';
  const ctx: RecordsContext = { input, out: [] };
  walkEnvelope(ctx, parsed, null, 0, true);
  return asciiDashes(withoutUrls(ctx.out.join('\n')));
}

/* ── Numbers ───────────────────────────────────────────────────────────── */

/** A number in a source, with what stands around it. */
export interface NumberSeen {
  value: string;
  /** Up to 40 characters before it, in its own string. */
  before: string;
  /** Up to 16 characters after it. */
  after: string;
  /** The words of the field it stands in (JSON), or ''. */
  key: string;
  /** Which string or object it stands in, and where, for a pair (a CI). */
  group: string;
  pos: number;
  /** A JSON number field (pos counts fields), not a number inside a text (pos counts characters). */
  field: boolean;
  /** AnA's own input, echoed. */
  echo: boolean;
}

const NUMBER_RE = /(?<![\w.])-?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(?!\d)/g;

/** Every number in a text, with its neighbourhood. Dates and URLs are not numbers here. */
export function numbersInText(text: string, key: string, group: string, echo: boolean): NumberSeen[] {
  const t = asciiDashes(withoutUrls(text)).replace(ISO_DATE_RE, (m) => ' '.repeat(m.length));
  const out: NumberSeen[] = [];
  NUMBER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NUMBER_RE.exec(t)) !== null) {
    const value = canonNumber(m[0]);
    if (value === null) continue;
    out.push({
      value,
      before: t.slice(Math.max(0, m.index - 40), m.index),
      after: t.slice(m.index + m[0].length, m.index + m[0].length + 16),
      key,
      group,
      pos: m.index,
      field: false,
      echo,
    });
  }
  return out;
}

/** A field whose name says it holds a rate ("assumed rate", "rate pct", "power"). */
const RATE_KEY = /\b(?:rates?|pct|percent(?:age)?|proportions?|fractions?|power|probabilit(?:y|ies)|incidence|prevalence|responses?)\b/;

/** One number alone, with at most a short word or sign either side: "47%", "240 mg", "~0.47". */
const VALUE_LIKE = /^\s*(?:[A-Za-z~≈<>≤≥=:]{1,12}\s{0,2})?-?(?:\d[\d,]*(?:\.\d+)?|\.\d+)\s{0,2}(?:%|[A-Za-zµμ°/²]{1,12})?\s*$/;

/** A number alone in a field that equals one the model sent, as sent or, for a rate, in its other form. */
function sentValue(input: InputRead, value: string, rate: boolean): boolean {
  return input.numbers.has(value) || (rate && input.rateForms.has(value));
}

/** Every number a source holds, echoes marked. */
export function numbersInSource(content: string, parsed: unknown, input: InputRead): NumberSeen[] {
  if (parsed === undefined) return numbersInText(content, '', 'text', false);
  const out: NumberSeen[] = [];
  const walk = (v: unknown, key: string, group: string, pos: number, depth: number): void => {
    if (depth > MAX_DEPTH || v === null || v === undefined) return;
    if (['url', 'urls', 'link', 'links', 'href'].includes(normKey(key))) return;
    if (Array.isArray(v)) {
      // Numbers in one list are one group (a CI as [0.5, 0.77]); each record in
      // a list is its own, so bounds are never paired across two records.
      v.forEach((x, i) => walk(x, x !== null && typeof x === 'object' ? `${key}[${i}]` : key, `${group}/${key}`, i, depth + 1));
    } else if (typeof v === 'object') {
      Object.entries(v as Record<string, unknown>).forEach(([k, x], i) => walk(x, k, `${group}/${key}`, i, depth + 1));
    } else if (typeof v === 'number') {
      // A bare number equal to one the model sent is its echo, whatever the
      // field is called: an engine that renames proposed_dose_mg to dose_mg
      // still returns the model's own number (round 2).
      const value = canonNumber(v);
      if (value === null) return;
      const words = keyWords(key);
      out.push({ value, before: '', after: '', key: words, group, pos, field: true, echo: sentValue(input, value, RATE_KEY.test(words)) });
    } else if (typeof v === 'string') {
      // A number inside a text the model did not send (an abstract, a passage)
      // is the source's own, even when the model searched for it.
      const echoString = isEchoOf(input, v);
      const words = keyWords(key);
      const alone = VALUE_LIKE.test(v);
      const rate = v.includes('%') || RATE_KEY.test(words);
      for (const n of numbersInText(v, words, `${group}/${key}#${pos}`, echoString)) {
        out.push(alone && !n.echo ? { ...n, echo: sentValue(input, n.value, rate) } : n);
      }
    }
  };
  walk(parsed, '', '', 0, 0);
  return out;
}
