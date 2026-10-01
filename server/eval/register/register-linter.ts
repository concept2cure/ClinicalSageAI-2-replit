/**
 * Register linter — deterministic scoring of an AnA response against the chat
 * register defined in server/services/ana-ri/response-register.ts.
 *
 * Pure, dependency-free, so it is unit-testable without a database, network or
 * model, and so the eval harness can score real transcripts the moment a
 * provider exists. Mirrors the shape of server/eval/doc-quality: metric
 * functions here, a runner (run-eval.ts) that feeds them captured turns.
 *
 * What it measures, per response text:
 *   headers, bullets, bold, tables, paragraph count and length, exclamation
 *   marks, emoji, and the rituals the register forbids — greeting after the
 *   first turn, re-introduction, praise opener, restated question, labelled
 *   "next step", capability menu, empty closer, filler transitions.
 *
 * Exclamation marks and emoji (2026-10-01, the founder's direction that AnA be
 * warm and sometimes playful): they are no longer banned outright, because
 * ANA_PERSONALITY_CORE now lets an earned moment show. What the core still
 * forbids is measured instead: more than one, stacked ("!!", "?!"), on a
 * greeting, praise or closer ritual, on a sentence that carries substance (a
 * figure, a citation, a regulation), any at all in a serious room, and an emoji
 * the person did not introduce. A serious room is derived fail-closed from the
 * reply and the user's message (SERIOUS_TERMS) unless the transcript labels it.
 * In an artifact, any exclamation mark or emoji fails.
 *
 * What it does NOT do: judge whether the answer is correct, grounded or
 * well-cited. That is the RAG / doc-quality harness. This one answers one
 * question only — does the turn read like a colleague or like a memo?
 *
 * Every rule is a heuristic over markdown text. It will under-count a memo
 * shape expressed without markdown and over-count a legitimately enumerable
 * answer the user did not literally ask for; the options exist so a caller
 * with the turn's context (first turn, user asked for a list) can say so.
 */

export type Register = 'chat' | 'artifact';

export type RegisterRule =
  | 'headers'
  | 'bullets'
  | 'bold'
  | 'tables'
  | 'paragraphs'
  | 'paragraph-length'
  | 'greeting-ritual'
  | 'reintroduction'
  | 'praise-opener'
  | 'restates-question'
  | 'next-step-ritual'
  | 'capability-menu'
  | 'empty-closer'
  | 'filler'
  | 'exclamation'
  | 'emoji';

export type ArtifactRule = 'chat-interjection' | 'first-person' | 'empty-closer' | 'exclamation' | 'emoji';

/**
 * Where lightness may live. 'serious' is the core's "Serious where it counts":
 * bad news, safety, a person under strain, governed acts. In it, warmth stays
 * and play goes — no exclamation mark, no emoji.
 */
export type Room = 'open' | 'serious';

export interface RegisterLintOptions {
  /** First turn of a session: a greeting is a human reply, not a ritual. */
  firstTurn?: boolean;
  /** The user asked for a list, table or checklist: enumeration is allowed. */
  userAskedForList?: boolean;
  /** Paragraph ceiling for a normal question. Register says one to four. */
  maxParagraphs?: number;
  /** Words in the longest paragraph before it stops being "short". */
  maxParagraphWords?: number;
  /**
   * The room this turn is in, as a labeller knows it (stress the words do not
   * show, such as a 1:40 a.m. deadline). Unlabelled, it is derived fail-closed
   * from the reply and `userText`: any SERIOUS_TERMS match makes it serious.
   */
  room?: Room;
  /** The user's message this reply answers, for deriving the room. */
  userText?: string;
  /** The person has used emoji in this conversation: AnA may mirror one. */
  userUsedEmoji?: boolean;
}

export interface RegisterMetrics {
  headers: number;
  /** Total list items, across all bullet and numbered lists. */
  listItems: number;
  /** Number of distinct lists (runs of consecutive list lines). */
  lists: number;
  /** Size of the smallest list, or 0 when there is none. */
  smallestList: number;
  bold: number;
  tables: number;
  paragraphs: number;
  longestParagraphWords: number;
  words: number;
  exclamations: number;
  /** "!!", "?!" or "!?" anywhere. */
  stackedExclamation: boolean;
  /** An exclamation mark in a greeting, praise or empty-closer sentence. */
  exclamationOnRitual: boolean;
  /** An exclamation mark in a sentence carrying a figure or a citation. */
  exclamationOnSubstance: boolean;
  emoji: number;
  /** An emoji in a sentence carrying a figure or a citation. */
  emojiOnSubstance: boolean;
  greetingOpener: boolean;
  reintroduction: boolean;
  praiseOpener: boolean;
  restatesQuestion: boolean;
  nextStepRitual: boolean;
  capabilityMenu: boolean;
  emptyCloser: boolean;
  fillerTransitions: number;
}

export interface RegisterViolation {
  rule: RegisterRule;
  detail: string;
}

export interface RegisterLintResult {
  metrics: RegisterMetrics;
  violations: RegisterViolation[];
  /** 1.0 = fully in register; each violation deducts its weight; floor 0. */
  score: number;
  pass: boolean;
}

export interface ArtifactLintResult {
  violations: Array<{ rule: ArtifactRule; detail: string }>;
  pass: boolean;
}

export interface RegisterLintSummary {
  count: number;
  passed: number;
  passRate: number;
  meanScore: number;
  violationsByRule: Record<string, number>;
  /**
   * Share of chat turns carrying any exclamation mark, and any emoji. "Most
   * replies have none" is the instruction a literal model is most likely to
   * turn into "one per reply"; these are what show it.
   */
  exclamationTurnRate: number;
  emojiTurnRate: number;
}

const WEIGHTS: Record<RegisterRule, number> = {
  headers: 0.25,
  bullets: 0.15,
  bold: 0.1,
  tables: 0.15,
  paragraphs: 0.1,
  'paragraph-length': 0.1,
  'greeting-ritual': 0.15,
  reintroduction: 0.15,
  'praise-opener': 0.15,
  'restates-question': 0.1,
  'next-step-ritual': 0.15,
  'capability-menu': 0.15,
  'empty-closer': 0.15,
  filler: 0.05,
  exclamation: 0.1,
  emoji: 0.1,
};

const DEFAULTS: Required<Omit<RegisterLintOptions, 'room' | 'userText' | 'userUsedEmoji'>> = {
  firstTurn: false,
  userAskedForList: false,
  maxParagraphs: 4,
  maxParagraphWords: 120,
};

type ResolvedOptions = typeof DEFAULTS & { room: Room; userUsedEmoji: boolean };

const HEADER_LINE = /^\s{0,3}#{1,6}\s+\S/;
/** A line that is nothing but a bold phrase — a header in disguise. */
const BOLD_ONLY_LINE = /^\s*\*\*[^*\n]{1,80}\*\*:?\s*$/;
const LIST_LINE = /^\s*(?:[-*+]|\d{1,3}[.)])\s+\S/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const BOLD_SPAN = /\*\*[^*\n]+?\*\*|__[^_\n]+?__/g;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu;
const EMOJI_ONE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

/**
 * Words that put a turn in the serious room. Deliberately broad: a false
 * "serious" costs a playful touch, a false "open" lets one land on bad news.
 */
export const SERIOUS_TERMS =
  /\b(adverse events?|AEs?|SAEs?|SUSARs?|safety (signal|report|finding)s?|Hy'?s law|deaths?|died|fatal|hospitali[sz]ed|patient harm|clinical hold|complete response|CRL|refuse[- ]to[- ]file|RTF|deficienc(y|ies)|AI letter|additional information letter|warning letter|483|inspection finding|recall|failed (endpoint|study|trial)|e-?signature|sign(ed|ing)? off|Part 11|audit trail|reason for change|deviation|OOS|out of specification|CAPA|rejected)\b/i;

/** The room a turn is in: the labeller's, or serious when either side names serious territory. */
export function deriveRoom(text: string, options: Pick<RegisterLintOptions, 'room' | 'userText'> = {}): Room {
  if (options.room) return options.room;
  return SERIOUS_TERMS.test(text) || (options.userText ? SERIOUS_TERMS.test(options.userText) : false) ? 'serious' : 'open';
}

/** A sentence that carries substance: a figure or a citation. */
const SUBSTANCE = /\d|\[(?:SRC|Source)[^\]]*\]|\b(?:ICH|CFR|USC|ISO|IEC|MDR|IVDR)\b|\bp\s*[=<>]/i;

/** Sentences, broken after terminal punctuation and after an emoji. */
function sentences(text: string): string[] {
  return text
    .replace(/`[^`\n]*`/g, ' ')
    .split(/(?<=[.!?\u2026])\s+|(?<=[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}])\s+|\n+/u)
    .map(x => x.trim())
    .filter(Boolean);
}

const GREETING_OPENER =
  /^\s*(hi|hello|hey|good (morning|afternoon|evening)|morning|afternoon|evening|welcome( back)?|great to (see|hear from) you)\b/i;
const REINTRODUCTION = /\b(i'?m|i am|this is) ana\b/i;
const PRAISE_OPENER =
  /^\s*(great|good|excellent|fantastic|wonderful|that'?s (a )?(great|good|really interesting|excellent))\s+(question|point|ask)\b/i;
const RESTATES_QUESTION =
  /^\s*(you('?re| are) asking|you asked|you want to know|your question (is|about|concerns)|to answer your question|so you'?re wondering)\b/i;
const NEXT_STEP_LABEL =
  /^\s*(\*\*)?\s*(next steps?|recommended next (step|action|move)|suggested next steps?|what'?s next|action items?|my recommendation for next steps?)\s*(\*\*)?\s*[:—–-]/im;
const CAPABILITY_MENU =
  /(here are (a few|some|\d+|two|three|four|five) things i can (do|help)|i can help (you )?with\s*:|things i can help (you )?with|here'?s what i can do|would you like me to\s*:\s*\n\s*(?:[-*]|\d+[.)]))/i;
const EMPTY_CLOSER =
  /(let me know if (you|there'?s)\b[^.\n]*|feel free to (ask|reach out)|(i )?hope (this|that) helps|happy to help( further| more)?|don'?t hesitate to|anything else i can (help|do))/i;
const FILLER =
  /\b(it'?s (worth|important) (noting|to note|to consider|to mention|mentioning)|it is (worth|important) (noting|to note|to consider|to mention|mentioning)|as (mentioned|noted|discussed) (above|earlier|previously)|there are several (considerations|factors) to)\b/gi;
const CHAT_INTERJECTION =
  /(here'?s (a|an|the|your) (strong|solid|draft|first|revised|quick)\b|i'?ve (drafted|put together|prepared|written)|let me know if|hope this helps|great question|happy to (help|adjust|revise))/i;

/**
 * Remove the blocks the platform parses (ana-grounding, ana-action) and any
 * other fenced code, so a machine-read block never counts as chat structure.
 */
export function stripPlatformBlocks(text: string): string {
  return text.replace(/```[\w-]*\n[\s\S]*?```/g, '').replace(/```[\w-]*[\s\S]*$/g, '');
}

function countWords(s: string): number {
  const m = s.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** Runs of consecutive list lines. Returns the item count of each run. */
function listRuns(lines: string[]): number[] {
  const runs: number[] = [];
  let run = 0;
  for (const line of lines) {
    if (LIST_LINE.test(line)) {
      run += 1;
    } else if (run > 0 && line.trim() !== '' && /^\s{2,}\S/.test(line)) {
      // continuation line of a list item — same run
    } else {
      if (run > 0) runs.push(run);
      run = 0;
    }
  }
  if (run > 0) runs.push(run);
  return runs;
}

export function measureRegister(text: string): RegisterMetrics {
  const stripped = stripPlatformBlocks(text);
  const lines = stripped.split('\n');
  const nonEmpty = lines.filter(l => l.trim() !== '');

  const headerLines = lines.filter(l => HEADER_LINE.test(l) || BOLD_ONLY_LINE.test(l));
  const runs = listRuns(lines);
  const listItems = runs.reduce((a, b) => a + b, 0);
  const tables = lines.filter(l => TABLE_SEPARATOR.test(l)).length;

  // Bold spans, minus those that ARE a pseudo-header line (already counted).
  const boldOnlyLines = lines.filter(l => BOLD_ONLY_LINE.test(l)).length;
  const bold = Math.max(0, (stripped.match(BOLD_SPAN) || []).length - boldOnlyLines);

  const paragraphs = stripped
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  const longestParagraphWords = paragraphs.reduce((m, p) => Math.max(m, countWords(p)), 0);

  const first = nonEmpty[0] ?? '';
  const firstParagraph = paragraphs[0] ?? '';
  const last = nonEmpty.length ? nonEmpty[nonEmpty.length - 1] : '';
  const tail = paragraphs.length ? paragraphs[paragraphs.length - 1] : '';

  return {
    headers: headerLines.length,
    listItems,
    lists: runs.length,
    smallestList: runs.length ? Math.min(...runs) : 0,
    bold,
    tables,
    paragraphs: paragraphs.length,
    longestParagraphWords,
    words: countWords(stripped),
    ...expressiveMetrics(stripped),
    greetingOpener: GREETING_OPENER.test(first),
    reintroduction: REINTRODUCTION.test(stripped),
    praiseOpener: PRAISE_OPENER.test(first) || /\bgreat question\b/i.test(firstParagraph),
    restatesQuestion: RESTATES_QUESTION.test(first),
    nextStepRitual: NEXT_STEP_LABEL.test(stripped),
    capabilityMenu: CAPABILITY_MENU.test(stripped),
    emptyCloser: EMPTY_CLOSER.test(last) || EMPTY_CLOSER.test(tail),
    fillerTransitions: (stripped.match(FILLER) || []).length,
  };
}

/** Exclamation and emoji measures, inline code excluded (`!=` is not a feeling). */
function expressiveMetrics(stripped: string) {
  const prose = stripped.replace(/`[^`\n]*`/g, ' ');
  const parts = sentences(prose);
  const ritual = (x: string) => GREETING_OPENER.test(x) || PRAISE_OPENER.test(x) || /\bgreat question\b/i.test(x) || EMPTY_CLOSER.test(x);
  return {
    exclamations: (prose.match(/!/g) || []).length,
    stackedExclamation: /!!|\?!|!\?/.test(prose),
    exclamationOnRitual: parts.some(x => x.includes('!') && ritual(x)),
    exclamationOnSubstance: parts.some(x => x.includes('!') && SUBSTANCE.test(x)),
    emoji: (prose.match(EMOJI) || []).length,
    emojiOnSubstance: parts.some(x => EMOJI_ONE.test(x) && SUBSTANCE.test(x)),
  };
}

type RuleCheck = (m: RegisterMetrics, opts: ResolvedOptions) => RegisterViolation | null;

/** Why an exclamation mark is out of place here, or null when it was earned. */
function exclamationProblem(m: RegisterMetrics, o: ResolvedOptions): string | null {
  if (m.exclamations === 0) return null;
  if (o.room === 'serious') return `${m.exclamations} exclamation mark(s) in a serious room`;
  if (m.exclamations > 1) return `${m.exclamations} exclamation marks; one is plenty`;
  if (m.stackedExclamation) return 'stacked exclamation';
  if (m.exclamationOnRitual) return 'exclamation on a greeting, praise or closer';
  if (m.exclamationOnSubstance) return 'exclamation on a sentence carrying a figure or citation';
  return null;
}

/** Why an emoji is out of place here, or null when it mirrors the person in a light moment. */
function emojiProblem(m: RegisterMetrics, o: ResolvedOptions): string | null {
  if (m.emoji === 0) return null;
  if (o.room === 'serious') return `${m.emoji} emoji in a serious room`;
  if (!o.userUsedEmoji) return `${m.emoji} emoji the person did not introduce`;
  if (m.emoji > 1) return `${m.emoji} emoji; at most one`;
  if (m.emojiOnSubstance) return 'emoji on a sentence carrying a figure or citation';
  return null;
}

/** One check per rule; each returns the violation it found or null. */
const RULE_CHECKS: RuleCheck[] = [
  m => (m.headers > 0 ? { rule: 'headers', detail: `${m.headers} header line(s); chat has none` } : null),
  (m, o) => {
    if (m.listItems === 0 || o.userAskedForList) return null;
    if (m.smallestList < 3) {
      return {
        rule: 'bullets',
        detail: `a list with ${m.smallestList} item(s); enumerate only three or more parallel items`,
      };
    }
    return m.listItems > 8 ? { rule: 'bullets', detail: `${m.listItems} list items; that is a memo, not an answer` } : null;
  },
  m => (m.bold > 1 ? { rule: 'bold', detail: `${m.bold} bold spans; at most one` } : null),
  (m, o) =>
    m.tables > 0 && !o.userAskedForList
      ? { rule: 'tables', detail: `${m.tables} table(s) in chat without being asked` }
      : null,
  (m, o) =>
    m.paragraphs > o.maxParagraphs
      ? { rule: 'paragraphs', detail: `${m.paragraphs} paragraphs; register says one to ${o.maxParagraphs}` }
      : null,
  (m, o) =>
    m.longestParagraphWords > o.maxParagraphWords
      ? {
          rule: 'paragraph-length',
          detail: `longest paragraph is ${m.longestParagraphWords} words (limit ${o.maxParagraphWords})`,
        }
      : null,
  (m, o) =>
    m.greetingOpener && !o.firstTurn
      ? { rule: 'greeting-ritual', detail: 'opens with a greeting after the first turn' }
      : null,
  (m, o) =>
    m.reintroduction && !o.firstTurn
      ? { rule: 'reintroduction', detail: 're-introduces herself after the first turn' }
      : null,
  m => (m.praiseOpener ? { rule: 'praise-opener', detail: 'opens by praising the question' } : null),
  m =>
    m.restatesQuestion ? { rule: 'restates-question', detail: 'restates the question before answering' } : null,
  m => (m.nextStepRitual ? { rule: 'next-step-ritual', detail: 'labelled "next step" block appended' } : null),
  m => (m.capabilityMenu ? { rule: 'capability-menu', detail: 'offers a menu of things she can do' } : null),
  m => (m.emptyCloser ? { rule: 'empty-closer', detail: 'ends with an empty closer' } : null),
  m =>
    m.fillerTransitions > 0 ? { rule: 'filler', detail: `${m.fillerTransitions} filler transition(s)` } : null,
  (m, o) => {
    const why = exclamationProblem(m, o);
    return why ? { rule: 'exclamation', detail: why } : null;
  },
  (m, o) => {
    const why = emojiProblem(m, o);
    return why ? { rule: 'emoji', detail: why } : null;
  },
];

/**
 * Score a response against the chat register. `pass` means no violations;
 * `score` is a graded distance from the register for trend reporting.
 */
export function lintChatRegister(text: string, options: RegisterLintOptions = {}): RegisterLintResult {
  const opts: ResolvedOptions = {
    ...DEFAULTS,
    ...options,
    room: deriveRoom(stripPlatformBlocks(text), options),
    userUsedEmoji: options.userUsedEmoji ?? false,
  };
  const m = measureRegister(text);
  const v: RegisterViolation[] = [];
  for (const check of RULE_CHECKS) {
    const hit = check(m, opts);
    if (hit) v.push(hit);
  }
  const deduction = v.reduce((sum, x) => sum + WEIGHTS[x.rule], 0);
  const score = Math.round(Math.max(0, 1 - deduction) * 100) / 100;
  return { metrics: m, violations: v, score, pass: v.length === 0 };
}

/**
 * Heuristic register classification of a response, so a harness can route
 * artifact turns to the artifact linter instead of failing them as chat.
 *
 * A deliverable carries two or more numbered section labels (2.5.1, 3.2.S.4)
 * or opens with a header and carries at least two. A chat answer that grew
 * headers in the middle — "Hi Priya! … ## Overview … ## Key Points" — is the
 * memo-shape failure this linter exists to catch, so it stays classified as
 * chat and fails there; two headers alone never launder it into an artifact.
 * A transcript may also state the register explicitly (run-eval.ts honours it).
 */
export function classifyRegister(text: string): Register {
  const stripped = stripPlatformBlocks(text);
  const lines = stripped.split('\n');
  const nonEmpty = lines.filter(l => l.trim() !== '');
  const headers = lines.filter(l => HEADER_LINE.test(l)).length;
  const numbered = lines.filter(l => /^\s*(#{1,6}\s+)?\d+(\.\d+|\.[A-Z])+\s+\S/.test(l)).length;
  const opensWithHeader = nonEmpty.length > 0 && HEADER_LINE.test(nonEmpty[0]);
  return numbered >= 2 || (opensWithHeader && headers >= 2) ? 'artifact' : 'chat';
}

/**
 * Score a deliverable against the artifact register: no chat-voice
 * interjections, no empty closer, submission voice (first person is a flag,
 * not a fail on its own, because a template may require it).
 */
export function lintArtifactRegister(text: string): ArtifactLintResult {
  const stripped = stripPlatformBlocks(text);
  const violations: ArtifactLintResult['violations'] = [];
  const interjection = stripped.match(CHAT_INTERJECTION);
  if (interjection) {
    violations.push({ rule: 'chat-interjection', detail: `chat voice inside the artifact: "${interjection[0]}"` });
  }
  const paragraphs = stripped.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const tail = paragraphs.length ? paragraphs[paragraphs.length - 1] : '';
  if (EMPTY_CLOSER.test(tail)) violations.push({ rule: 'empty-closer', detail: 'artifact ends with an empty closer' });
  // A record outlives the conversation: no exclamation mark and no emoji in it at all.
  const prose = stripped.replace(/`[^`\n]*`/g, ' ');
  const bangs = (prose.match(/!/g) || []).length;
  if (bangs > 0) violations.push({ rule: 'exclamation', detail: `${bangs} exclamation mark(s) in an artifact` });
  const emoji = (prose.match(EMOJI) || []).length;
  if (emoji > 0) violations.push({ rule: 'emoji', detail: `${emoji} emoji in an artifact` });
  const firstPerson = (stripped.match(/\b(I|I'm|I've|we|we're|we've)\b/g) || []).length;
  if (firstPerson > 2) {
    violations.push({ rule: 'first-person', detail: `${firstPerson} first-person pronouns in submission-register text` });
  }
  return { violations, pass: violations.length === 0 };
}

export function summarizeRegisterLint(results: RegisterLintResult[]): RegisterLintSummary {
  const count = results.length;
  const passed = results.filter(r => r.pass).length;
  const violationsByRule: Record<string, number> = {};
  for (const r of results) {
    for (const v of r.violations) violationsByRule[v.rule] = (violationsByRule[v.rule] ?? 0) + 1;
  }
  const meanScore = count ? Math.round((results.reduce((s, r) => s + r.score, 0) / count) * 100) / 100 : 0;
  const rate = (n: number) => (count ? Math.round((n / count) * 100) / 100 : 0);
  return {
    count,
    passed,
    passRate: count ? passed / count : 0,
    meanScore,
    violationsByRule,
    exclamationTurnRate: rate(results.filter(r => r.metrics.exclamations > 0).length),
    emojiTurnRate: rate(results.filter(r => r.metrics.emoji > 0).length),
  };
}

/**
 * Repetition is what turns charm into a tic. A playful sentence — one carrying
 * an exclamation mark or an emoji — that recurs, normalised, across replies of
 * one conversation (or across conversations) is reported with the phrase. A
 * corpus finding, not a per-turn deduction: one reply cannot know it repeats.
 */
export function findCatchphrases(
  turns: ReadonlyArray<{ text: string; conversationId?: string }>,
  minRepeats = 2,
): Array<{ phrase: string; count: number }> {
  const seen = new Map<string, { phrase: string; count: number }>();
  for (const t of turns) {
    const flourishes = new Set(
      sentences(stripPlatformBlocks(t.text))
        .filter(x => x.includes('!') || EMOJI_ONE.test(x))
        .map(x => x.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(x => x.split(' ').length >= 2),
    );
    for (const f of flourishes) {
      const key = `${t.conversationId ?? ''}\u0000${f}`;
      const e = seen.get(key) ?? { phrase: f, count: 0 };
      e.count += 1;
      seen.set(key, e);
    }
  }
  return [...seen.values()].filter(e => e.count >= minRepeats).sort((a, b) => b.count - a.count);
}
