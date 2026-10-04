/**
 * Answer grounding — the self-verification round of AnA's chat loop.
 *
 * The existing enforcement checks (checkEvidenceDiscipline, validateResponseStructure,
 * validateEvidence) audit the answer's *language*: whether claims carry evidence
 * labels and avoid overclaim phrasing. None of them compare the answer against the
 * tool output AnA actually gathered this turn.
 *
 * This module closes that gap deterministically — no extra model call. It pulls the
 * verifiable, specific claims out of the answer — registry/literature/submission
 * identifiers (trial ids: NCT/ISRCTN/EudraCT; literature: PMID/DOI; FDA submissions:
 * 510(k)/PMA/De Novo/NDA/BLA/ANDA), the regulations it cites (CFR sections, ICH codes) and
 * quoted source text — and checks each one against the
 * evidence corpus (the concatenated tool results). A claim that does not appear in
 * the evidence is flagged as unsupported — a direct fabrication signal.
 *
 * ── Figures, and what counts as a source (2026-10-04) ────────────────────────
 * The founder asked for AnA's reasoning layer to be enhanced. A read-only map of
 * the live turn found that this check, the one deterministic answer-vs-evidence
 * comparison AnA has, could not see a figure: an invented efficacy rate,
 * p-value, dose, shelf life or enrolment passed every check on every path. It
 * also said nothing when no tool ran, and it credited what was not evidence:
 * a failed or stopped step's error text, the model-authored content a governed
 * write stores, and figures the model itself passed into an engine and the
 * engine echoed back. Rule 2 says numbers come from engines and the model
 * narrates, so the check now reads figures too (checkAnswer):
 *
 *   - a figure (a percentage, a p-value, a hazard, odds or risk ratio, a
 *     confidence interval, an n, a count of patients, a dose, a duration) is
 *     found when its number appears, as a whole number, in a source of this
 *     turn: a percentage also as its proportion (47% as 0.47). Only figures
 *     are checked, not every number: a section number or a year is not one;
 *   - a source is a tool result that succeeded and is not a governed write,
 *     a hosted web step, the person's own message, or the project data and
 *     enrichment AnA was given. A figure is not credited by a tool result that
 *     only echoes a number the model passed in as input: the model chose it;
 *   - with no source at all, the checkable claims are reported as not checked
 *     (basis 'no_sources'), never as grounded.
 *
 *   - what a model wrote is not a source for itself. The gateway notes every
 *     generation made inside a tool call (ai-gateway/generation-capture.ts),
 *     so a tool whose result carries an inner model's words (batch drafting,
 *     a drafting council, a plan narration) credits no figure, identifier,
 *     regulation or quote that model wrote. A step whose generations are not
 *     known (it ran in the governed-action route) is not a source at all;
 *   - an identifier is matched whole: "PMID 3456789" is not found inside
 *     "PMID 23456789", nor "NDA 21436" inside "NDA214360";
 *   - an identifier, regulation or quote the model asked a tool for is found
 *     only where the result returns it in a record, never in the echo of the
 *     request: the search tools echo the query on a hit, a zero-hit and an
 *     outage alike, and generate_citation formats whatever section it is
 *     given and marks it not_verified (returnedRecords);
 *   - a verdict the answer states (ready to file, compliant, approvable, and
 *     the §14 prohibitions) is named, never counted as found: verdicts come
 *     from engines, and the person sees which ones ran.
 *
 * "Found" means the number is in this turn's sources, not that the sentence
 * around it is right. The check is advisory: surfaced to the person and sealed
 * in the turn record, not used to block or rewrite the answer. A record names
 * the engine that checked it (ANSWER_CHECK_VERSION), so a later re-run of a
 * changed engine is never taken for the verdict the person was shown.
 */

import {
  detectUnsupportedClaims,
  detectVerdictClaims,
} from '../clinical-regulatory-evidence/governance';
import { isGovernedContentWriteTool } from './governed-write-tools';

/** The engine that produced a check, recorded with it. Bump on any change to what it finds. */
export const ANSWER_CHECK_VERSION = 'answer-check/1';

export interface UnsupportedClaim {
  kind:
    // Trial registries
    | 'nct'
    | 'isrctn'
    | 'eudract'
    // Literature identifiers
    | 'pmid'
    | 'doi'
    // FDA submission numbers
    | 'fda_510k'
    | 'fda_pma'
    | 'fda_denovo'
    | 'fda_nda'
    | 'fda_bla'
    | 'fda_anda'
    // Regulations: a CFR section, an ICH guideline code
    | 'cfr'
    | 'ich'
    // Quoted source text
    | 'quote'
    // A figure: a percentage, p-value, ratio, interval, n, count, dose or duration
    | 'figure';
  text: string;
}

export interface GroundingResult {
  /** Number of verifiable claims extracted and checked. */
  checked: number;
  /** How many were found in the evidence corpus. */
  grounded: number;
  /** Claims not found in the evidence. */
  unsupported: UnsupportedClaim[];
  /** grounded / checked; 1 when nothing was checkable. */
  ratio: number;
}

/** Normalize for tolerant substring matching: lowercase, punctuation → space. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

type IdKind = Exclude<UnsupportedClaim['kind'], 'quote' | 'figure'>;

// Whole-token identifiers. Each of these is a specific, registry-issued
// identifier that cannot be legitimately recalled — it must come from the tool
// evidence — so one that does not appear verbatim is a direct fabrication
// signal. The token itself is distinctive enough to match and check as-is:
//   - trial registries: US (NCT), UK/international (ISRCTN), EU (EudraCT)
//   - literature: DOI
//   - FDA submissions: 510(k) K######, PMA P######, De Novo DEN######
//     (an invented predicate-device number is the classic medtech fabrication)
//
// The FDA single-/three-letter tokens carry a `(?<![./])` guard so they are not
// re-extracted from inside a DOI suffix or a dotted path (e.g. "10.1016/P123456"
// must count as one DOI, not also a bogus PMA number) — `/` and `.` are word
// boundaries, so `\b` alone would let those embedded matches through.
const TOKEN_ID_PATTERNS: ReadonlyArray<{ kind: IdKind; re: RegExp }> = [
  { kind: 'nct', re: /NCT\d{8}/gi },
  { kind: 'isrctn', re: /ISRCTN\d{8}/gi },
  { kind: 'eudract', re: /(?<![./])\b\d{4}-\d{6}-\d{2}\b/g },
  { kind: 'doi', re: /\b10\.\d{4,9}\/[^\s"”'<>)\]]+/gi },
  { kind: 'fda_510k', re: /(?<![./])\bK\d{6}\b/g },
  { kind: 'fda_pma', re: /(?<![./])\bP\d{6}\b/g },
  { kind: 'fda_denovo', re: /(?<![./])\bDEN\d{6}\b/gi },
];

// Labeled-number identifiers. The bare number is not distinctive on its own, so
// it is extracted only when it carries its label, then the number is checked
// against the evidence (the tool returns the number in its result payload). The
// full "LABEL number" is reported, but only the number is matched, so spacing
// variants ("NDA 021436" vs "NDA021436" vs bare "021436") still ground.
//   - literature: PMID
//   - FDA drug submissions: NDA, BLA, ANDA (the biopharma analogues of 510(k))
const LABELED_ID_PATTERNS: ReadonlyArray<{ kind: IdKind; re: RegExp }> = [
  { kind: 'pmid', re: /\bPMID:?\s*(\d{7,8})\b/gi },
  { kind: 'fda_nda', re: /\bNDA\s*:?\s*(\d{4,6})\b/gi },
  { kind: 'fda_bla', re: /\bBLA\s*:?\s*(\d{4,6})\b/gi },
  { kind: 'fda_anda', re: /\bANDA\s*:?\s*(\d{4,6})\b/gi },
];

// Regulations (D4, 2026-10-01). Unlike the identifiers above, a CFR section or
// an ICH code can be recalled correctly — so a miss means "not supported by
// this turn's evidence", not fabricated. It is still the claim most worth
// checking: "21 CFR 820.30(g)" (superseded by the QMSR) or an ICH revision
// cited from memory read as grounded as anything else after tools ran.
//   - CFR: "<title> CFR <section>" in any common spelling ("21 C.F.R. §
//     312.23", "21 CFR Part 11"); both sides are put in one spelling first.
//   - ICH: a code after "ICH", or any code written with its revision
//     ("E9(R1)"); a bare "E2" is too common a token to read as a guideline.
const CFR_PREFIX_RE = /\b(\d{1,2})\s*C\.?\s*F\.?\s*R\.?\s*(?:§+\s*|Part\s+|Section\s+)?/gi;
const CFR_CITATION_RE =
  /\b(\d{1,2})\s*C\.?\s*F\.?\s*R\.?\s*(?:§+\s*|Part\s+|Section\s+)?(\d{1,4}(?:\.\d+[a-z]?)?(?:\([a-z0-9]{1,4}\))*)/gi;
const ICH_CITATION_RE =
  /\bICH\s+([QSEM]\d{1,2}[A-Z]?(?:\s?\(R\d{1,2}\))?)|(?<![A-Za-z0-9])([QSEM]\d{1,2}[A-Z]?\(R\d{1,2}\))/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Is `needle` in `haystack`, not continued as a longer number ("11" is not "110" or "11.5")? */
function containsCitation(haystack: string, needle: string): boolean {
  return new RegExp(`${escapeRegExp(needle)}(?![0-9]|\\.[0-9])`).test(haystack);
}

// Trailing sentence punctuation captured alongside a token (notably on a DOI at
// the end of a sentence) — trimmed before the verbatim check so "…/jama.2020.1."
// grounds against the same DOI in the evidence.
const TRAILING_PUNCT_RE = /[.,;:]+$/;

// Double-quoted spans (straight or smart quotes), 20–200 chars of inner text.
const QUOTE_RE = /["“]([^"”\n]{20,200})["”]/g;

/* ── Figures ─────────────────────────────────────────────────────────────── */

/** A number in the one form both sides are compared in: no thousands
 *  separators, no trailing zeros ("1,066" → "1066", "0.050" → "0.05"). */
function canonNumber(raw: string): string | null {
  const n = Number(raw.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? String(n) : null;
}

// What a figure is. Each pattern captures the number(s) that must be found;
// the whole match is what is reported. A percentage written as a confidence
// level ("95% CI") is not a figure of the result, so it is skipped there.
const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+`;
const FIGURE_PATTERNS: ReadonlyArray<{ re: RegExp; percent?: boolean }> = [
  // A confidence interval: both bounds must be found.
  { re: new RegExp(String.raw`\b(?:95|90|99)\s?%\s*(?:CI|confidence interval)[:,]?\s*\(?\s*(-?(?:${NUM}))\s*(?:-|–|—|to|,)\s*(-?(?:${NUM}))`, 'gi') },
  // A hazard, odds or risk ratio.
  { re: new RegExp(String.raw`\b(?:HR|OR|RR|IRR|hazard ratio|odds ratio|risk ratio|relative risk)\s*(?:of|was|=|:)?\s*(${NUM})`, 'gi') },
  // A p-value.
  { re: new RegExp(String.raw`\bp\s*(?:<=|>=|<|>|=|≤|≥)\s*(${NUM})`, 'gi') },
  // A percentage, not a confidence level.
  { re: new RegExp(String.raw`(?<![\w.])(${NUM})\s?%(?!\s*(?:CI|confidence))`, 'gi'), percent: true },
  // n = …
  { re: new RegExp(String.raw`\b[nN]\s*=\s*(${NUM})`, 'g') },
  // A count of people, events, sites or batches.
  { re: new RegExp(String.raw`(?<![\w.])(\d{1,3}(?:,\d{3})+|\d{2,})\s+(?:patients|subjects|participants|cases|deaths|events|sites|batches|lots)\b`, 'gi') },
  // A dose or an amount with its unit.
  { re: new RegExp(String.raw`(?<![\w.])(${NUM})\s?(?:mg\/kg|mg\/m2|mg\/m²|µg\/kg|mcg\/kg|mg|mcg|µg|ug|ng|g|kg|mL|ml|IU|units)\b`, 'g') },
  // A duration.
  { re: new RegExp(String.raw`(?<![\w.])(${NUM})[\s-]?(?:hours?|days?|weeks?|months?|years?)\b`, 'gi') },
];

interface FigureClaim {
  text: string;
  values: string[];
  percent: boolean;
}

function figuresIn(answer: string): FigureClaim[] {
  const out: FigureClaim[] = [];
  const seen = new Set<string>();
  // A span already read as a figure is not read again by a later pattern (the
  // "95%" of a confidence interval, the "0.62" of a hazard ratio).
  const taken: Array<[number, number]> = [];
  const overlaps = (a: number, b: number) => taken.some(([x, y]) => a < y && b > x);
  for (const { re, percent } of FIGURE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(answer)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const values = m.slice(1).filter((v): v is string => typeof v === 'string').map(canonNumber);
      if (values.some((v) => v === null)) continue;
      taken.push([start, end]);
      const text = m[0].replace(/\s+/g, ' ').trim();
      const key = `${text.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text, values: values as string[], percent: Boolean(percent) });
    }
  }
  return out;
}

/** Every number in a text, canonical. */
function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  const re = /(?<![\w.])-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?!\w)|(?<![\w.])\.\d+(?!\w)/g;
  for (const m of text.match(re) ?? []) {
    const c = canonNumber(m);
    if (c !== null) out.add(c);
  }
  return out;
}

/** Every number in a tool's input, canonical: what the model put in. */
function inputNumbers(input: unknown, out: Set<string> = new Set(), depth = 0): Set<string> {
  if (depth > 6 || input == null) return out;
  if (typeof input === 'number') {
    if (Number.isFinite(input)) out.add(String(input));
  } else if (typeof input === 'string') {
    for (const n of numbersIn(input)) out.add(n);
  } else if (Array.isArray(input)) {
    for (const v of input) inputNumbers(v, out, depth + 1);
  } else if (typeof input === 'object') {
    for (const v of Object.values(input as Record<string, unknown>)) inputNumbers(v, out, depth + 1);
  }
  return out;
}

/* ── Sources ───────────────────────────────────────────────────────────────── */

/** One thing AnA had this turn, as the check reads it. */
export interface EvidenceEntry {
  /** Where it came from: `tool:<name>`, `web`, `person`, `context`, or an attachment. */
  source: string;
  content: string;
  /** Numbers the model itself passed to the tool that produced this entry.
   *  A figure is not credited by an entry that only echoes one of them. */
  inputNumbers?: string[];
  /** What a model wrote while this entry was produced. Nothing in it is
   *  credited by this entry. */
  generated?: string[];
  /** The call's input as text: what the model asked for. */
  asked?: string;
  /** The values the result returns inside a record, without any echo of the
   *  request: where an identifier or a quote the model asked for can be found. */
  returned?: string;
  /** AnA was given it but the check cannot read it (a PDF's bytes). Named,
   *  never counted as read. */
  unreadable?: boolean;
}

/** What the gateway noted of a tool call's own generations (generation-capture.ts). */
export interface GenerationsNoted {
  calls: number;
  texts: string[];
  overflow: boolean;
}

/** How one tool call ended, as the stream saw it. */
export interface ToolOutcome {
  status: string;
  input: unknown;
  /** The result as the model read it. */
  content: string;
  /** Its generations; null when they are not known (it ran elsewhere). */
  generated: GenerationsNoted | null;
}

/**
 * A tool result as a source, or null when it is not one: a step that failed
 * or was stopped (its text is an error), a governed write (its output is the
 * model-authored content it stored), or a step whose own generations are not
 * known or were too many to keep (what the model wrote cannot be told apart).
 */
export function toolEvidence(tool: string, outcome: ToolOutcome): EvidenceEntry | null {
  const { status, input, content, generated } = outcome;
  if (status !== 'success' || !content) return null;
  if (isGovernedContentWriteTool(tool)) return null;
  if (!generated || generated.overflow) return null;
  return {
    source: `tool:${tool}`,
    content,
    inputNumbers: [...inputNumbers(input)],
    ...(generated.texts.length > 0 ? { generated: [...generated.texts] } : {}),
    asked: JSON.stringify(input ?? {}),
    returned: returnedRecords(content),
  };
}

/** A result that says it checked what it returns against a source (generate_citation). */
function declaresVerified(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const r = parsed as Record<string, unknown>;
  return r.verified === true || r.verification === 'verified' || r.verification === 'identified';
}

/**
 * The values a result returns inside a record: every value in an array or
 * nested in an object, except a `query` field. A top-level field is the
 * envelope (the echoed request, a note, a manual-search suggestion), unless
 * the result declares it verified what it returns. A result that is not JSON
 * cannot tell an echo from data, so it returns none. The search tools echo
 * the request in a hit, a zero-hit and an outage alike, and generate_citation
 * formats whatever section it is given and marks it not_verified; only a
 * record a tool returns says the source holds it.
 */
function returnedRecords(content: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return '';
  }
  const topLevelIsRecord = declaresVerified(parsed);
  const out: string[] = [];
  const walk = (v: unknown, depth: number, inArray: boolean): void => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1, true);
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (k.toLowerCase() !== 'query') walk(x, depth + 1, false);
      }
    } else if ((typeof v === 'string' || typeof v === 'number') && (inArray || depth >= 2 || topLevelIsRecord)) {
      out.push(String(v));
    }
  };
  walk(parsed, 0, false);
  return out.join('\n');
}

/** A verdict the answer states. */
export interface StatedVerdict {
  text: string;
  reason: string;
}

/** What the check found, and what it is based on. */
export interface AnswerCheck {
  /** The engine that checked (ANSWER_CHECK_VERSION). */
  engine: string;
  /**
   * 'sources': AnA consulted something this turn (a tool, the web, the
   * project data she was given), and every claim was compared with it.
   * 'no_sources': she consulted nothing. Only the person's own message could
   * be compared, and a claim not in it is unchecked, not "not found".
   */
  basis: 'sources' | 'no_sources';
  /** Checkable claims in the answer: found + notFound + unchecked. */
  claims: number;
  /** Claims compared with a source: found + notFound. */
  checked: number;
  found: number;
  /** Claims compared with this turn's sources and not found in any. */
  notFound: UnsupportedClaim[];
  /** Claims nothing could be compared with (basis 'no_sources'). */
  unchecked: UnsupportedClaim[];
  /** The distinct sources the claims were compared with. */
  sources: string[];
  /** Sources AnA was given that the check could not read. */
  unreadable: string[];
  /** Verdicts the answer states: named, never found. */
  verdicts: StatedVerdict[];
}

/** One source, in every form the comparisons read. */
interface ReadSource {
  upper: string;
  cfr: string;
  compact: string;
  normed: string;
  numbers: Set<string>;
}

function readSource(text: string): ReadSource {
  const upper = text.toUpperCase();
  return {
    upper,
    cfr: text.replace(CFR_PREFIX_RE, (_m, title: string) => `${title} CFR `).toUpperCase(),
    compact: upper.replace(/\s+/g, ''),
    normed: norm(text),
    numbers: numbersIn(text),
  };
}

/** A source with what its own model wrote, which it cannot credit, and what was asked of it. */
interface Credit {
  own: ReadSource;
  written: ReadSource | null;
  echoed: Set<string>;
  /** The call's input, when the source is a tool result. */
  asked: ReadSource | null;
  /** What the result returns inside a record (returnedRecords). */
  returned: ReadSource | null;
}

/**
 * Found in a source, and not in what a model wrote for that source. What the
 * model asked the source for is found only where the result returns it in a
 * record, never in the echo of the request (returnedRecords); anything else is
 * found wherever the source holds it.
 */
function creditedUnlessEchoed(
  sources: Credit[],
  found: (r: ReadSource) => boolean,
  askedFor: (r: ReadSource) => boolean = found,
): boolean {
  return sources.some((c) => {
    const surface = c.asked && askedFor(c.asked) ? c.returned : c.own;
    return Boolean(surface && found(surface)) && !(c.written && found(c.written));
  });
}

/**
 * Check the specific, checkable claims in `answer` against this turn's
 * sources: identifiers, regulations, quotes and figures; and name the
 * verdicts it states.
 */
export function checkAnswer(answer: string, entries: EvidenceEntry[]): AnswerCheck {
  const present = entries.filter((e) => e && typeof e.source === 'string');
  const unreadable = present.filter((e) => e.unreadable).map((e) => e.source);
  const usable = present.filter((e) => !e.unreadable && typeof e.content === 'string' && e.content.trim());
  const check: AnswerCheck = {
    engine: ANSWER_CHECK_VERSION,
    basis: usable.some((e) => e.source !== 'person') || unreadable.length > 0 ? 'sources' : 'no_sources',
    claims: 0,
    checked: 0,
    found: 0,
    notFound: [],
    unchecked: [],
    sources: [...new Set(usable.map((e) => e.source))],
    unreadable: [...new Set(unreadable)],
    verdicts: [],
  };
  if (!answer) return check;
  const record = (claim: UnsupportedClaim, found: boolean) => {
    check.claims++;
    if (found) {
      check.checked++;
      check.found++;
    } else if (check.basis === 'no_sources') {
      check.unchecked.push(claim);
    } else {
      check.checked++;
      check.notFound.push(claim);
    }
  };
  const credits: Credit[] = usable.map((e) => ({
    own: readSource(e.content),
    written: e.generated && e.generated.length > 0 ? readSource(e.generated.join('\n')) : null,
    echoed: new Set(e.inputNumbers ?? []),
    asked: typeof e.asked === 'string' ? readSource(e.asked) : null,
    returned: typeof e.asked === 'string' ? readSource(e.returned ?? '') : null,
  }));
  checkTextClaims(answer, credits, record);
  for (const fig of figuresIn(answer)) {
    const has = (r: ReadSource, echoed: Set<string>) =>
      fig.values.every((v) => {
        const forms = fig.percent ? [v, String(Number(v) / 100)] : [v];
        return forms.some((f) => r.numbers.has(f) && !echoed.has(f));
      });
    const found = credits.some((c) => has(c.own, c.echoed) && !(c.written && has(c.written, new Set())));
    record({ kind: 'figure', text: fig.text }, found);
  }
  check.verdicts = statedVerdicts(answer);
  return check;
}

/** The §14 prohibitions and the verdict shapes, in order, one per span. */
function statedVerdicts(answer: string): StatedVerdict[] {
  const all = [...detectUnsupportedClaims(answer), ...detectVerdictClaims(answer)].sort((a, b) => a.index - b.index);
  const out: StatedVerdict[] = [];
  let end = -1;
  for (const v of all) {
    if (v.index < end) continue;
    end = v.index + v.match.length;
    out.push({ text: v.match.replace(/\s+/g, ' ').trim(), reason: v.reason });
  }
  return out;
}

/**
 * Verify that the specific, checkable claims in `answer` appear in `evidence`
 * (one text holding the turn's sources). The string form of checkAnswer, kept
 * for the offline eval; a no-op result when either side is empty.
 */
export function verifyAnswerGrounding(answer: string, evidence: string): GroundingResult {
  if (!answer || !evidence || !evidence.trim()) return { checked: 0, grounded: 0, unsupported: [], ratio: 1 };
  return groundingResultOf(checkAnswer(answer, [{ source: 'evidence', content: evidence }]));
}

/** A check in the older summary shape (the RIM claim metrics and the trace timeline read it). */
export function groundingResultOf(check: AnswerCheck): GroundingResult {
  return {
    checked: check.checked,
    grounded: check.found,
    unsupported: check.notFound,
    ratio: check.checked === 0 ? 1 : check.found / check.checked,
  };
}

/** `needle` in `haystack` as a whole token: not inside a longer identifier. */
function containsToken(haystack: string, needle: string): boolean {
  return new RegExp(`(?<![A-Z0-9])${escapeRegExp(needle)}(?![A-Z0-9])`).test(haystack);
}

/** A labelled number in `haystack`, not part of a longer number ("NDA214360" holds 214360). */
function containsWholeNumber(haystack: string, needle: string): boolean {
  return new RegExp(`(?<!\\d)${escapeRegExp(needle)}(?!\\d)`).test(haystack);
}

/** Identifiers, regulations and quotes, against each source. */
function checkTextClaims(answer: string, sources: Credit[], record: (c: UnsupportedClaim, found: boolean) => void): void {
  // Registry / literature / submission identifiers — a classic fabrication.
  // Each must appear whole in a source. De-duped across kinds so the same id
  // is only counted once. The reported text keeps its original form; the
  // match is case-insensitive (compared uppercased on both sides).
  // `display` is what gets reported; `checkValue` is what must appear in a
  // source. They differ for labeled ids, where the label anchors extraction
  // from the answer but only the number is matched.
  const seenIds = new Set<string>();
  const checkId = (kind: IdKind, display: string, checkValue: string, labelled: boolean): void => {
    const text = display.replace(TRAILING_PUNCT_RE, '').trim();
    const needle = checkValue.replace(TRAILING_PUNCT_RE, '').trim().toUpperCase();
    if (!text || !needle) return;
    const key = `${kind}:${needle}`;
    if (seenIds.has(key)) return;
    seenIds.add(key);
    const within = labelled ? containsWholeNumber : containsToken;
    record({ kind, text }, creditedUnlessEchoed(sources, (r) => within(r.upper, needle)));
  };
  for (const { kind, re } of TOKEN_ID_PATTERNS) {
    re.lastIndex = 0;
    for (const raw of answer.match(re) || []) checkId(kind, raw, raw, false);
  }
  for (const { kind, re } of LABELED_ID_PATTERNS) {
    re.lastIndex = 0;
    let lm: RegExpExecArray | null;
    while ((lm = re.exec(answer)) !== null) checkId(kind, lm[0], lm[1], true);
  }

  // Regulations — checked in one spelling on both sides (see CFR_CITATION_RE).
  const checkRegulation = (
    kind: 'cfr' | 'ich',
    display: string,
    key: string,
    found: (r: ReadSource) => boolean,
    askedFor: (r: ReadSource) => boolean,
  ): void => {
    if (seenIds.has(`${kind}:${key}`)) return;
    seenIds.add(`${kind}:${key}`);
    record({ kind, text: display.replace(TRAILING_PUNCT_RE, '').trim() }, creditedUnlessEchoed(sources, found, askedFor));
  };
  CFR_CITATION_RE.lastIndex = 0;
  let cm: RegExpExecArray | null;
  while ((cm = CFR_CITATION_RE.exec(answer)) !== null) {
    const needle = `${cm[1]} CFR ${cm[2]}`.toUpperCase();
    // Asked for when the call named the section, in whatever fields it split it across.
    const section = cm[2].toUpperCase();
    checkRegulation('cfr', cm[0], needle, (r) => containsCitation(r.cfr, needle), (r) => containsCitation(r.upper, section));
  }
  ICH_CITATION_RE.lastIndex = 0;
  let im: RegExpExecArray | null;
  while ((im = ICH_CITATION_RE.exec(answer)) !== null) {
    const code = (im[1] ?? im[2]).replace(/\s+/g, '').toUpperCase();
    const found = (r: ReadSource) => containsCitation(r.compact, code);
    checkRegulation('ich', im[0], code, found, found);
  }

  // Quoted source text — if AnA quotes the document, the quote should be in a
  // source. Skip short or label-like quotes to avoid false positives.
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  QUOTE_RE.lastIndex = 0;
  while ((m = QUOTE_RE.exec(answer)) !== null) {
    const raw = m[1].trim();
    const q = norm(raw);
    if (q.length < 12 || !q.includes(' ')) continue; // too short / single token
    if (seen.has(q)) continue;
    seen.add(q);
    record(
      { kind: 'quote', text: raw.length > 80 ? raw.slice(0, 79) + '…' : raw },
      creditedUnlessEchoed(sources, (r) => r.normed.includes(q)),
    );
  }
}
