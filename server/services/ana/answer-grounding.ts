/**
 * Answer grounding — the deterministic check of an AnA answer against what she
 * consulted this turn.
 *
 * The other checks (checkEvidenceDiscipline, validateResponseStructure,
 * validateEvidence) read the answer's language: labels and phrasing. This
 * module compares the answer's specific, checkable claims with the turn's
 * sources, with no model call:
 *
 *   identifiers  trial (NCT, ISRCTN, EudraCT), literature (PMID, DOI) and FDA
 *                submission numbers (510(k), PMA, De Novo, NDA, BLA, ANDA)
 *   regulations  CFR sections and ICH codes
 *   quotes       quoted source text
 *   figures      percentages, p-values, ratios, intervals, n, counts, doses,
 *                durations (answer-check-figures.ts)
 *
 * and names the verdicts the answer states (ready to file, compliant,
 * approvable, the §14 prohibitions): Rule 2 says verdicts come from engines.
 *
 * ── What each claim can be (round 2, 2026-10-04) ─────────────────────────────
 * Two refute-reviews of round 1 (a3775bcef) showed it reassured falsely: a
 * fabricated figure was "found" through any matching number, the person's own
 * question confirmed what it asked about, and a tool's echo of the model's
 * request confirmed the request. Every claim now ends in one of five places:
 *
 *   found       in a source of this turn: a tool result (not failed, not a
 *               governed write, not written by a model inside the call), a web
 *               step, or project data the platform read. A figure only where
 *               its number stands with its own measure; an identifier,
 *               regulation or quote the model asked a tool for only where the
 *               result returns it in a record (answer-check-sources.ts).
 *   fromInput   a figure that is only AnA's own input to a tool (an assumed
 *               power or hazard ratio), echoed back, restated in another form
 *               (0.47 sent, "47%" returned) or not: hers, not a result.
 *   fromPerson  only in the person's own message. Never a source: a question
 *               ("was it 45% or 60%?") is not evidence for its answer.
 *   unchecked   nothing was consulted, or a source AnA read is one this check
 *               cannot read (a PDF's bytes), so it may hold the claim.
 *   notFound    compared with every source, and in none.
 *
 * "Found" is not "verified": the value is in this turn's sources, not the
 * sentence around it proven right. A percentage is found where a source
 * states that percentage, whatever it measures there. The check is advisory:
 * shown to the person and sealed in the turn record, never used to block or
 * rewrite the answer. A record names the engine that checked it
 * (ANSWER_CHECK_VERSION), so a later run of a changed engine is never taken
 * for what the person was shown.
 */

import {
  detectUnsupportedClaims,
  detectVerdictClaims,
  isAssertedVerdict,
} from '../clinical-regulatory-evidence/governance';
import { figureHeld, figuresIn, indexNumbers, type Figure, type NumberIndex } from './answer-check-figures';
import {
  NO_INPUT,
  numbersInSource,
  numbersInText,
  ownText,
  parseJson,
  readInput,
  recordsText,
  withoutUrls,
  asciiDashes,
  type InputRead,
} from './answer-check-sources';
import { isGovernedContentWriteTool } from './governed-write-tools';

/** The engine that produced a check, recorded with it. Bump on any change to what it finds. */
export const ANSWER_CHECK_VERSION = 'answer-check/2';

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

/* ── Sources ───────────────────────────────────────────────────────────────── */

/** One thing AnA had this turn, as the check reads it. */
export interface EvidenceEntry {
  /** Where it came from: `tool:<name>`, `web`, `person`, `context`, or an attachment. */
  source: string;
  content: string;
  /** What a model wrote while this entry was produced. Nothing in it is credited by this entry. */
  generated?: string[];
  /** The call's input as JSON: what the model asked for. */
  asked?: string;
  /** AnA was given it but the check cannot read it (a PDF's bytes). Named, never counted as read. */
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
    ...(generated.texts.length > 0 ? { generated: [...generated.texts] } : {}),
    asked: JSON.stringify(input ?? {}),
  };
}

/** A verdict the answer states. */
export interface StatedVerdict {
  text: string;
  reason: string;
}

/** A figure that is AnA's own input to a tool, and which tool. */
export interface InputClaim extends UnsupportedClaim {
  source: string;
}

/** What the check found, and what it is based on. */
export interface AnswerCheck {
  /** The engine that checked (ANSWER_CHECK_VERSION). */
  engine: string;
  /**
   * 'sources': AnA consulted something this turn (a tool, the web, project
   * data, a document), and every claim was compared with it.
   * 'no_sources': she consulted nothing; nothing could be found or not found.
   */
  basis: 'sources' | 'no_sources';
  /** Checkable claims in the answer: every claim in every list below. */
  claims: number;
  /** Claims compared with a source: found + notFound. */
  checked: number;
  found: number;
  /** Compared with this turn's sources and in none. */
  notFound: UnsupportedClaim[];
  /** Not checkable: nothing consulted, or maybe in a source the check cannot read. */
  unchecked: UnsupportedClaim[];
  /** Only in the person's own message: theirs, not a source's. */
  fromPerson: UnsupportedClaim[];
  /** Figures that are only AnA's own input to a tool: hers, not a result. */
  fromInput: InputClaim[];
  /** The distinct sources the claims were compared with. */
  sources: string[];
  /** Sources AnA was given that the check could not read. */
  unreadable: string[];
  /** Verdicts the answer states: named, never found. */
  verdicts: StatedVerdict[];
}

/** One source, read every way the claims need it. */
interface ReadSource {
  name: string;
  /** Everything it says ("key: value" lines for JSON), without URLs. */
  own: TextForms;
  /** What it returns as records: where a claim the model asked for can be found. Null for a source nobody asked. */
  records: TextForms | null;
  /** What the model sent it, when it is a tool result. */
  input: InputRead;
  inputText: TextForms | null;
  /** What a model wrote inside the call: credits nothing. */
  written: TextForms | null;
  /** Its numbers that are its own, by value: where a figure can be found. */
  results: NumberIndex;
  /** Its numbers that are AnA's own input, echoed or as sent, by value. */
  inputs: NumberIndex;
  /** Numbers a model wrote inside the call, by value. */
  writtenNumbers: NumberIndex;
}

/** A text in the forms the comparisons read. */
interface TextForms {
  upper: string;
  cfr: string;
  normed: string;
}

function forms(text: string): TextForms {
  const t = asciiDashes(withoutUrls(text));
  return {
    upper: t.toUpperCase(),
    cfr: t.replace(CFR_PREFIX_RE, (_m, title: string) => `${title} CFR `).toUpperCase(),
    normed: norm(t),
  };
}

function readSource(e: EvidenceEntry): ReadSource {
  const parsed = parseJson(e.content);
  const input = typeof e.asked === 'string' ? readInput(e.asked) : NO_INPUT;
  const written = e.generated && e.generated.length > 0 ? e.generated.join('\n') : null;
  const numbers = numbersInSource(e.content, parsed, input);
  return {
    name: e.source,
    own: forms(ownText(e.content, parsed)),
    records: typeof e.asked === 'string' ? forms(recordsText(parsed, input)) : null,
    input,
    inputText: typeof e.asked === 'string' ? forms(input.text) : null,
    written: written ? forms(written) : null,
    results: indexNumbers(numbers.filter((o) => !o.echo)),
    inputs: indexNumbers([
      ...numbers.filter((o) => o.echo),
      ...(typeof e.asked === 'string' ? numbersInText(input.text, '', 'input', true) : []),
    ]),
    writtenNumbers: indexNumbers(written ? numbersInText(written, '', 'written', false) : []),
  };
}

/** Where a claim ended. */
type Outcome = 'found' | 'fromInput' | 'fromPerson' | 'unchecked' | 'notFound';

/**
 * Check the specific, checkable claims in `answer` against this turn's
 * sources, and name the verdicts it states.
 */
export function checkAnswer(answer: string, entries: EvidenceEntry[]): AnswerCheck {
  const present = entries.filter((e) => e && typeof e.source === 'string');
  const unreadable = [...new Set(present.filter((e) => e.unreadable).map((e) => e.source))];
  const readable = present.filter((e) => !e.unreadable && typeof e.content === 'string' && e.content.trim());
  const sources = readable.filter((e) => e.source !== 'person').map(readSource);
  const person = readable.filter((e) => e.source === 'person').map(readSource);
  const check: AnswerCheck = {
    engine: ANSWER_CHECK_VERSION,
    basis: sources.length > 0 || unreadable.length > 0 ? 'sources' : 'no_sources',
    claims: 0,
    checked: 0,
    found: 0,
    notFound: [],
    unchecked: [],
    fromPerson: [],
    fromInput: [],
    sources: [...new Set(sources.map((s) => s.name))],
    unreadable,
    verdicts: [],
  };
  if (!answer) return check;

  /** Settle a claim that no source holds. */
  const unsettled = (inPerson: boolean): Outcome => {
    if (inPerson) return 'fromPerson';
    return check.basis === 'no_sources' || unreadable.length > 0 ? 'unchecked' : 'notFound';
  };
  const record = (claim: UnsupportedClaim, outcome: Outcome, inputSource?: string): void => {
    check.claims++;
    if (outcome === 'found') {
      check.checked++;
      check.found++;
    } else if (outcome === 'notFound') {
      check.checked++;
      check.notFound.push(claim);
    } else if (outcome === 'fromInput') {
      check.fromInput.push({ ...claim, source: inputSource ?? '' });
    } else if (outcome === 'fromPerson') {
      check.fromPerson.push(claim);
    } else {
      check.unchecked.push(claim);
    }
  };

  checkTextClaims(answer, sources, person, (claim, found, inPerson) => record(claim, found ? 'found' : unsettled(inPerson)));
  for (const fig of figuresIn(answer)) {
    const claim: UnsupportedClaim = { kind: 'figure', text: fig.text };
    if (sources.some((s) => figureHeld(fig, s.results) && !figureHeld(fig, s.writtenNumbers))) {
      record(claim, 'found');
      continue;
    }
    const asInput = sources.find((s) => figureHeld(fig, s.inputs));
    if (asInput) {
      record(claim, 'fromInput', asInput.name);
      continue;
    }
    record(claim, unsettled(person.some((p) => figureHeld(fig, p.results))));
  }
  check.verdicts = statedVerdicts(answer);
  return check;
}

/** The §14 prohibitions and the verdict shapes the answer asserts, in order, one per span. */
function statedVerdicts(answer: string): StatedVerdict[] {
  const all = [...detectUnsupportedClaims(answer), ...detectVerdictClaims(answer)]
    .filter((v) => isAssertedVerdict(answer, v.index, v.match))
    .sort((a, b) => a.index - b.index);
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

/* ── Identifiers, regulations and quotes ───────────────────────────────────── */

/** Normalize for tolerant substring matching: lowercase, punctuation → space. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

type IdKind = Exclude<UnsupportedClaim['kind'], 'quote' | 'figure'>;

// Whole-token identifiers, each a registry-issued id that cannot be recalled
// correctly from memory, so one no source holds is a fabrication signal. The
// FDA single- and three-letter tokens carry `(?<![./])` so they are not read
// from inside a DOI suffix or a dotted path ("10.1016/P123456" is one DOI). A
// trial id is read with every digit it has: "NCT025786801" is a malformed id
// no registry issued, reported as itself, never as the trial inside it.
const TOKEN_ID_PATTERNS: ReadonlyArray<{ kind: IdKind; re: RegExp }> = [
  { kind: 'nct', re: /\bNCT\d{8,}/gi },
  { kind: 'isrctn', re: /\bISRCTN\d{8,}/gi },
  { kind: 'eudract', re: /(?<![./])\b\d{4}-\d{6}-\d{2}\b/g },
  { kind: 'doi', re: /\b10\.\d{4,9}\/[^\s"”'<>)\]]+/gi },
  { kind: 'fda_510k', re: /(?<![./])\bK\d{6}\b/g },
  { kind: 'fda_pma', re: /(?<![./])\bP\d{6}\b/g },
  { kind: 'fda_denovo', re: /(?<![./])\bDEN\d{6}\b/gi },
];

// Labelled numbers: the bare number is not distinctive, so it is read only with
// its label, and matched only where a source holds it with a label too
// ("PMID: 31234567", "pmid: 31234567", "NDA214360"): an enrolment of 1274 is
// not BLA 1274 (round 2, F7).
const LABELED_ID_PATTERNS: ReadonlyArray<{ kind: IdKind; re: RegExp; label: string }> = [
  { kind: 'pmid', re: /\bPMID:?\s*(\d{7,8})\b/gi, label: 'PMID|PUBMED' },
  { kind: 'fda_nda', re: /\bNDA\s*:?\s*(\d{4,6})\b/gi, label: 'NDA|APPLICATION' },
  { kind: 'fda_bla', re: /\bBLA\s*:?\s*(\d{4,6})\b/gi, label: 'BLA|APPLICATION' },
  { kind: 'fda_anda', re: /\bANDA\s*:?\s*(\d{4,6})\b/gi, label: 'ANDA|APPLICATION' },
];

// Regulations. A CFR section or an ICH code can be recalled correctly, so a
// miss means "not supported by this turn's sources", not fabricated.
const CFR_PREFIX_RE = /\b(\d{1,2})\s*C\.?\s*F\.?\s*R\.?\s*(?:§+\s*|Parts?\s+|Sections?\s+)?/gi;
const CFR_SECTION = String.raw`\d{1,4}(?:\.\d+[a-z]?)?(?:\([a-z0-9]{1,4}\))*`;
const CFR_CITATION_RE = new RegExp(
  String.raw`\b(\d{1,2})\s*C\.?\s*F\.?\s*R\.?\s*(?:(§§|Parts|Sections)\s*|§\s*|Part\s+|Section\s+)?(${CFR_SECTION})`,
  'gi',
);
/** The next part or section in a list after a CFR citation: "21 CFR Parts 50 and 56", "§§ 312.32, 312.33". */
const CFR_LIST_NEXT_RE = new RegExp(
  String.raw`^(?:[ \t]{0,2},[ \t]{0,2}(?:and[ \t]{1,2}|or[ \t]{1,2})?|[ \t]{1,2}(?:and|or|&)[ \t]{1,2})(${CFR_SECTION})(?!\d|\.\d)(?![ \t]{0,2}(?:C\.?[ \t]?F\.?[ \t]?R|U\.?[ \t]?S\.?[ \t]?C))`,
  'i',
);
/**
 * A list item cites the same title only where the citation says it lists
 * (Parts, Sections, §§) or the item is a section of the same part (312.32 and
 * 312.33): "21 CFR 312.32 and 15 days" lists nothing.
 */
const listsAfter = (plural: boolean, first: string, item: string): boolean =>
  plural || (first.includes('.') && item.startsWith(first.slice(0, first.indexOf('.') + 1)));
const ICH_CITATION_RE =
  /\bICH\s+([QSEM]\d{1,2}[A-Z]?(?:\s?\(R\d{1,2}\))?)|(?<![A-Za-z0-9])([QSEM]\d{1,2}[A-Z]?\(R\d{1,2}\))/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `needle` in `haystack`, not continued as a longer number ("11" is not "110" or "11.5"). */
function containsCitation(haystack: string, needle: string): boolean {
  return new RegExp(`(?<![0-9])${escapeRegExp(needle)}(?![0-9]|\\.[0-9])`).test(haystack);
}

/** An ICH code as a token: "E3" is not in "PHASE3", "E9(R1)" is "E9 (R1)" too. */
function containsIchCode(haystack: string, code: string): boolean {
  const m = /^([QSEM]\d{1,2}[A-Z]?)(\(R\d{1,2}\))?$/.exec(code);
  if (!m) return false;
  const rev = m[2] ? `\\s?${escapeRegExp(m[2])}` : '(?!\\s?\\(R)';
  return new RegExp(`(?<![A-Z0-9])${m[1]}${rev}(?![0-9A-Z])`).test(haystack);
}

/** `needle` in `haystack` as a whole token: not inside a longer identifier. */
function containsToken(haystack: string, needle: string): boolean {
  return new RegExp(`(?<![A-Z0-9])${escapeRegExp(needle)}(?![A-Z0-9])`).test(haystack);
}

/** A labelled number held with a label ("PMID 31234567", "pmid: 31234567", "NDA214360"). */
function containsLabelled(haystack: string, label: string, number: string): boolean {
  return new RegExp(`(?:${label})[^0-9A-Z]{0,12}${escapeRegExp(number)}(?![0-9])`).test(haystack);
}

const TRAILING_PUNCT_RE = /[.,;:]+$/;
const QUOTE_RE = /["“]([^"”\n]{20,200})["”]/g;

/**
 * Found in a source, and not in what a model wrote for it. A claim the model
 * asked the source for is found only in what it returns as records; anything
 * else wherever it holds it.
 */
function creditedBy(
  sources: ReadSource[],
  found: (t: TextForms) => boolean,
  askedFor: (t: TextForms) => boolean = found,
): boolean {
  return sources.some((s) => {
    const surface = s.inputText && askedFor(s.inputText) ? s.records : s.own;
    return Boolean(surface && found(surface)) && !(s.written && found(s.written));
  });
}

/** Settle one claim: its kind, a key it is deduplicated by, its text, how a source holds it, and how a call asks for it. */
type Settle = (
  kind: UnsupportedClaim['kind'],
  key: string,
  text: string,
  found: (t: TextForms) => boolean,
  askedFor?: (t: TextForms) => boolean,
) => void;

/** CFR citations, and the parts or sections listed after one ("21 CFR Parts 50 and 56"). */
function settleCfrCitations(answer: string, settle: Settle): void {
  const settleCfr = (title: string, part: string, text: string) => {
    const needle = `${title} CFR ${part}`.toUpperCase();
    const section = part.toUpperCase();
    // Asked for when the call named the section, in whatever fields it split it across.
    settle('cfr', needle, text, (t) => containsCitation(t.cfr, needle), (t) => containsCitation(t.upper, section));
  };
  CFR_CITATION_RE.lastIndex = 0;
  let cm: RegExpExecArray | null;
  while ((cm = CFR_CITATION_RE.exec(answer)) !== null) {
    const [, title, plural, first] = cm;
    settleCfr(title, first, cm[0].replace(TRAILING_PUNCT_RE, '').trim());
    // The parts listed after it share its title: "21 CFR Parts 50 and 56" cites 21 CFR 56 too.
    let rest = cm.index + cm[0].length;
    let next: RegExpExecArray | null;
    while ((next = CFR_LIST_NEXT_RE.exec(answer.slice(rest, rest + 40))) !== null && listsAfter(Boolean(plural), first, next[1])) {
      settleCfr(title, next[1], `${title} CFR ${next[1]}`);
      rest += next[0].length;
    }
    CFR_CITATION_RE.lastIndex = Math.max(CFR_CITATION_RE.lastIndex, rest);
  }
}

/** Identifiers, regulations and quotes: found, and if not, whether the person's own message holds it. */
function checkTextClaims(
  answer: string,
  sources: ReadSource[],
  person: ReadSource[],
  record: (c: UnsupportedClaim, found: boolean, inPerson: boolean) => void,
): void {
  const seen = new Set<string>();
  const settle: Settle = (kind, key, text, found, askedFor) => {
    if (seen.has(`${kind}:${key}`)) return;
    seen.add(`${kind}:${key}`);
    const credited = creditedBy(sources, found, askedFor);
    record({ kind, text }, credited, !credited && person.some((p) => found(p.own)));
  };

  for (const { kind, re } of TOKEN_ID_PATTERNS) {
    re.lastIndex = 0;
    for (const raw of answer.match(re) || []) {
      const text = raw.replace(TRAILING_PUNCT_RE, '').trim();
      const needle = text.toUpperCase();
      if (needle) settle(kind, needle, text, (t) => containsToken(t.upper, needle));
    }
  }
  for (const { kind, re, label } of LABELED_ID_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(answer)) !== null) {
      const number = m[1];
      settle(kind, number, m[0].replace(TRAILING_PUNCT_RE, '').trim(), (t) => containsLabelled(t.upper, label, number), (t) =>
        new RegExp(`(?<![0-9])${number}(?![0-9])`).test(t.upper),
      );
    }
  }
  settleCfrCitations(answer, settle);
  ICH_CITATION_RE.lastIndex = 0;
  let im: RegExpExecArray | null;
  while ((im = ICH_CITATION_RE.exec(answer)) !== null) {
    const code = (im[1] ?? im[2]).replace(/\s+/g, '').toUpperCase();
    settle('ich', code, im[0].replace(TRAILING_PUNCT_RE, '').trim(), (t) => containsIchCode(t.upper, code));
  }
  QUOTE_RE.lastIndex = 0;
  let qm: RegExpExecArray | null;
  while ((qm = QUOTE_RE.exec(answer)) !== null) {
    const raw = qm[1].trim();
    const q = norm(raw);
    if (q.length < 12 || !q.includes(' ')) continue; // too short, or one token
    settle('quote', q, raw.length > 80 ? raw.slice(0, 79) + '…' : raw, (t) => t.normed.includes(q));
  }
}

export type { Figure };
