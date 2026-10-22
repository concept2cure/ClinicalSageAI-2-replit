/**
 * Value items (design §6.2): one figure as written — "14 (4.6%)", "26/1,012
 * (2.6%)", "4.6%", "59 patients (37.8%)", a bare count — and the arm its own
 * phrase binds it to ("of ravoxitide-treated patients", "(placebo)", "Drug X
 * 14 (4.6%)", "on dapralutide", "in the placebo group"). An arm is bound only
 * inside the item's clause (C11); an item without one is left unbound for the
 * clause's arm list (respectively, "(A vs B)") to bind, or for nothing.
 */
import { doseKey, type DocInfo } from './doc';
import { DIGITS, NUMBER_WORDS, PCT_MARK, readNumber, type WrittenNumber } from './number';
import { inMask, type Span } from './segment';
import type { ArmRef } from './types';
import { CONTROL_WORDS, NOT_AN_ARM, SUBGROUP_ROWS } from './vocabulary';

export interface Item extends Span {
  count?: WrittenNumber;
  percent?: WrittenNumber;
  denominator?: WrittenNumber;
  arm?: ArmRef;
  /** The arm phrase is there but names no identifiable arm (OLE "at any time", "any dose"). */
  armUnidentified?: string;
  /** "of those …": the arm of the item before. */
  armFromPrevious?: boolean;
  subgroups?: string[];
  /** "612 in Study TNV-301": the item's own study scope. */
  scopeStudy?: string;
  /** One end of a range ("4.6% to 6.4%"): a range is not a value, and neither end is the figure (C9). */
  range?: true;
}

const DOSE = String.raw`\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|ug|g|mL|mg\/kg)(?:\/day)?`;
const ARMWORD = String.raw`(?:Drug\s+[A-Z]\b|[A-Za-z][a-z]{3,}(?:-[a-z]+)?(?![\w-])|[A-Z]{4,}(?![\w-]))`;
/**
 * The arm's head word before "-treated" ("placebo-treated", "Drug X-treated"). ARM's head admits a hyphenated
 * suffix and then refuses a following hyphen, so `${ARM}-treated` can never match; this one has no suffix.
 */
export const ARM_HEAD = String.raw`(?:Drug\s+[A-Z]|[A-Za-z][a-z]{3,})`;
/** One arm phrase as written: a head word, an optional dose and regimen, an optional background therapy. */
export const ARM = String.raw`${ARMWORD}(?:\s+${DOSE})?(?:\s+(?:once\s+weekly|once\s+daily|Q\dW|every\s+\d+\s+weeks))?(?:\s*\+\s*[Mm]etformin)?`;

const ENGLISH = new Set(
  (
    'these those them they their that this with from were was have been into onto upon over under than then when where which while ' +
    'about above after again against along also among around because before being below between both cases dose doses during each ' +
    'either else ever every first further half here into last least less like many more most much must near next none only ' +
    'other others over overall own part parts same several should since some such than that their there these thing though three former latter ' +
    'through total towards under until upon very what whatever when whether which while whom whose within without would years ' +
    'months weeks days patients subjects participants people adults children group groups arm arms study studies trial trials ' +
    'events event reactions reaction rates rate risk ratio respectively compared versus placebo-treated treatment treatments ' +
    'safety efficacy analysis population set sets visit visits baseline percent cent result results reported occurred discontinued ' +
    'serious adverse severe mild moderate grade level total pooled combined dose-groups continuing continued switched received ' +
    'receiving treated exposed died deaths death subject patient participant nausea vomiting headache diarrhea diarrhoea ' +
    'constipation insomnia fatigue pneumonia sepsis pneumonitis dyspepsia infection infections ' +
    // Comparatives and judgements next to a figure ("1.3% higher with Drug X", "similar between groups") (r1 nsf-19).
    'higher lower greater less fewer more similar comparable reduced increased decreased numerically between follows ' +
    // Verbs after a figure ("4.6% experienced an SAE") are never arm names (r1 pv-of-the-patients-receiving).
    'experienced experiencing developed reported reporting achieved reached showed met died occurring required ' +
    'underwent completed withdrew remained ' +
    // Linking verbs in non-native phrasing ("the incidence of SAEs resulted 4.6%", "amounted 4.6%"): never an arm.
    'resulted resulting amounted totalled totaled equalled equaled stood reaching comprised consisted numbered'
  ).split(/\s+/),
);

/** Whether a word in an arm slot can name an arm. */
export function drugLike(phrase: string): boolean {
  const head = phrase.trim().split(/\s+/)[0] ?? '';
  if (/^Drug$/i.test(head)) return /^Drug\s+[A-Z]\b/.test(phrase.trim());
  const w = head.toLowerCase();
  if (CONTROL_WORDS.test(w) || w === 'placebo') return true;
  if (NOT_AN_ARM.has(w) || ENGLISH.has(w)) return false;
  if (/^[A-Z]{4,}$/.test(head)) return !/^(?:ITT|FAS|BICR|PFS|ORR|MACE|EAIR|TEAE|SAEs?|NRI|MMRM|ANCOVA|LS|CMH|DOR|HBA|NCT)/.test(head);
  return head.length >= 5;
}

/** An arm phrase → reference (dose normalised; background therapy dropped). */
export function armOf(phrase: string): ArmRef | null {
  let p = phrase.trim().replace(/\s+/g, ' ').replace(/-treated$/i, '');
  p = p.replace(/\s*\+\s*metformin$/i, '').replace(/\s+(?:once\s+weekly|once\s+daily|Q\dW|every\s+\d+\s+weeks)$/i, '');
  if (!drugLike(p)) return null;
  const m = new RegExp(String.raw`^(Drug\s+[A-Z]|[A-Za-z][\w-]*)(?:\s+(${DOSE}))?$`).exec(p);
  if (!m) return null;
  const drug = m[1].toLowerCase().replace(/\s+/g, ' ');
  if (drug === 'matching placebo') return { kind: 'arm', drug: 'placebo', label: p };
  return m[2] ? { kind: 'arm', drug, dose: doseKey(m[2]), label: p } : { kind: 'arm', drug, label: p };
}

const CNT = String.raw`(?:\d{1,3}(?:[\u00a0\u202f\u2009 ,.]\d{3})+(?![\d.,]?\d)|\d+|${NUMBER_WORDS})`;
const SIGNED_NUM = String.raw`(?:[-−–]\s?)?${DIGITS}`;
const PCT = String.raw`(?:(?:<|≤|>|≥)\s*)?${SIGNED_NUM}${PCT_MARK}`;
const PCT_OR_NUM = String.raw`(?:(?:<|≤|>|≥)\s*)?${SIGNED_NUM}(?:${PCT_MARK})?`;
const NOUN = String.raw`(?:patients|subjects|participants|patient|subject|participant)`;

interface Shape {
  re: RegExp;
  read: (m: RegExpExecArray) => Pick<Item, 'count' | 'percent' | 'denominator' | 'arm' | 'subgroups'> | null;
}

/** Item shapes, longest first; each anchored at the scan position (sticky). */
function shapes(doc: DocInfo, opts: ItemOptions): Shape[] {
  const conv = doc.convention;
  const rd = (s: string | undefined, countSlot = false) => (s ? readNumber(s, { convention: conv, countSlot }) ?? undefined : undefined);
  const pct = (s: string | undefined) => {
    const w = rd(s);
    if (!w) return undefined;
    return w.pct ? w : opts.percentColumn ? { ...w, pct: 'column' as const } : w;
  };
  // nosemgrep: detect-non-literal-regexp -- every caller passes a String.raw literal composed of module constants (CNT, ARM_HEAD, PCT, NOUN, DOSE); a readability wrapper, never given data
  const S = (src: string) => new RegExp(src, 'y');
  return [
    {
      // "55 of 305 dapralutide-treated subjects (18.0%)"
      re: S(String.raw`(${CNT})\s+of\s+(?:the\s+)?(${CNT})\s+(${ARM_HEAD})-treated\s+${NOUN}\s*\(\s*(${PCT})\s*\)`),
      read: (m) => ({ count: rd(m[1], true), denominator: rd(m[2], true), percent: pct(m[4]), arm: armOf(m[3]) ?? undefined }),
    },
    {
      // "100 (33%) of the 305 dapralutide-treated patients"
      re: S(String.raw`(${CNT})\s*\(\s*(${PCT})\s*\)\s+of\s+the\s+(${CNT})\s+(${ARM_HEAD})-treated\s+${NOUN}`),
      read: (m) => ({ count: rd(m[1], true), percent: pct(m[2]), denominator: rd(m[3], true), arm: armOf(m[4]) ?? undefined }),
    },
    {
      // "14 of 304 (4.6%) Drug X patients": n of N (%) in words, the arm after it (r1 pv-n-of-N-inline).
      re: S(String.raw`(${CNT})\s+of\s+(${CNT})\s*\(\s*(${PCT})\s*\)`),
      read: (m) => ({ count: rd(m[1], true), denominator: rd(m[2], true), percent: pct(m[3]) }),
    },
    {
      // "19 of 298 Drug X patients (6.4%)", "19/298 Drug X patients (6.4%)": the arm stands between the denominator
      // and the percentage, so the denominator is never the count (r2 pv-n-of-N-patients-trailing-percent).
      re: S(String.raw`(${CNT})(?:\s+of\s+|\s*\/\s*)(${CNT})\s+(${ARM_HEAD}(?:\s+${DOSE})?)(?:-treated)?\s+${NOUN}\s*\(\s*(${PCT})\s*\)`),
      read: (m) => {
        const arm = armOf(m[3]);
        return arm ? { count: rd(m[1], true), denominator: rd(m[2], true), percent: pct(m[4]), arm } : null;
      },
    },
    {
      // "6.4% (19 patients) of the Drug X group": the percentage first, the count in the aside (r2 pv-percent-then-count-prose).
      re: S(String.raw`(${PCT})\s*\(\s*(${CNT})\s+${NOUN}\s*\)`),
      read: (m) => ({ percent: pct(m[1]), count: rd(m[2], true) }),
    },
    {
      // "fourteen Drug X patients (4.6%)": a count, its arm, then the percentage (r1 pv-counts-in-words).
      re: S(String.raw`(${CNT})\s+(${ARM_HEAD}(?:\s+${DOSE})?)(?:-treated)?\s+${NOUN}\s*\(\s*(${PCT})\s*\)`),
      read: (m) => {
        const arm = armOf(m[2]);
        return arm ? { count: rd(m[1], true), percent: pct(m[3]), arm } : null;
      },
    },
    {
      // "26/1,012 (2.6%)", "6/94 (6.4)", "52/128"
      re: S(String.raw`(${CNT})\s*\/\s*(${CNT})(?:\s*\(\s*(${PCT_OR_NUM})\s*\))?`),
      read: (m) => ({ count: rd(m[1], true), denominator: rd(m[2], true), percent: pct(m[3]) }),
    },
    {
      // "59 patients (37.8%)", "9 subjects (3.0%)"
      re: S(String.raw`(${CNT})\s+${NOUN}\s*\(\s*(${PCT})\s*\)`),
      read: (m) => ({ count: rd(m[1], true), percent: pct(m[2]) }),
    },
    {
      // "14 (4.6%)", "55 [18.0%]", "14 (4,6 %)"; a "%" column: "14 (4.6)"
      re: S(String.raw`(${CNT})\s*[[(]\s*(${opts.percentColumn ? PCT_OR_NUM : PCT})\s*[\])]`),
      read: (m) => ({ count: rd(m[1], true), percent: pct(m[2]) }),
    },
    {
      // "8 patients, 5.1%" and "5, 3.2%" inside a sub-rate parenthesis
      re: S(String.raw`(${CNT})(?:\s+${NOUN})?,\s*(${PCT})`),
      read: (m) => (opts.inParens ? { count: rd(m[1], true), percent: pct(m[2]) } : null),
    },
    {
      // "4.6%", "4.6 per cent", "4,6 %", "<1%"
      re: S(String.raw`(${PCT})`),
      read: (m) => ({ percent: pct(m[1]) }),
    },
    {
      // a value in a "%" column, or a count
      re: S(String.raw`(${opts.percentColumn ? SIGNED_NUM : CNT})(?![\d%]|[.,]\d|\s?per\s?cent\b)`),
      read: (m) => (opts.percentColumn ? { percent: pct(m[1]) } : { count: rd(m[1], true) }),
    },
  ];
}

export interface ItemOptions {
  /** Values without a "%" are percentages (a "%" column, a "(%)" label). */
  percentColumn?: boolean;
  /** Inside a sub-rate parenthesis: "8 patients, 5.1%" is one item. */
  inParens?: boolean;
  /** Bare counts are items (deaths, disposition); otherwise only percentages and n (%) forms. */
  counts?: boolean;
}

/** A spelled-out count right before an arm of the source ("two Drug X, one placebo", "fourteen Drug X patients") (r1). */
function wordBeforeArm(rest: string, doc: DocInfo): boolean {
  const m = new RegExp(String.raw`^${NUMBER_WORDS}\s+(?=\S)`, 'i').exec(rest);
  if (!m) return false;
  // nosemgrep: detect-non-literal-regexp -- `doc.armSrc` is armSource()'s output, whose roster keys go through rosterKeyPattern (doc.ts) and so are metacharacter-escaped; pinned by __tests__/roster-key-pattern.test.ts
  return new RegExp(String.raw`^(?:${doc.armSrc})(?![\w-])`, 'i').test(rest.slice(m[0].length));
}

/** A spelled-out count, only where it counts patients or deaths ("Three deaths", "two in the … group"). */
const WORD_COUNT = new RegExp(String.raw`^${NUMBER_WORDS}(?=\s+(?:${NOUN}|deaths?|died|in\s+the|on\s|\(|patients))`, 'i');

const POST_ARM: Array<{ re: RegExp; kind: 'arm' | 'ole-continued' | 'ole-switched' | 'unidentified' | 'combined' | 'those' | 'active' }> = [
  // "of the active treatment group", "of the experimental arm", "of the verum group": the source's one active arm,
  // when it names exactly one; with none or several, the arm stays unidentified (r2 pv-arm-active-treatment-group).
  { re: new RegExp(String.raw`\s+(?:of|in|among)\s+(?:the\s+)?(?:${NOUN}\s+in\s+the\s+)?(active(?:\s+treatment)?|experimental|verum|test)\s+(?:group|arm)`, 'y'), kind: 'active' },
  { re: new RegExp(String.raw`\s+(?:of|in)\s+(?:${NOUN}|those)\s+who\s+continued\s+(${ARM})`, 'y'), kind: 'ole-continued' },
  { re: new RegExp(String.raw`\s+of\s+${NOUN}\s+continuing\s+(${ARM})`, 'y'), kind: 'ole-continued' },
  { re: new RegExp(String.raw`\s+(?:of|in)\s+(?:${NOUN}|those)\s+who\s+switched\s+from\s+(${ARM})(?:\s+to\s+${ARM})?`, 'y'), kind: 'ole-switched' },
  { re: new RegExp(String.raw`\s+of\s+${NOUN}\s+switched\s+from\s+(${ARM})(?:\s+to\s+${ARM})?`, 'y'), kind: 'ole-switched' },
  { re: new RegExp(String.raw`\s+of\s+${NOUN}\s+who\s+received\s+(${ARM})\s+at\s+any\s+time`, 'y'), kind: 'unidentified' },
  { re: new RegExp(String.raw`\s+of\s+${NOUN}\s+receiving\s+(${ARM}\s*\(\s*\d+\s*mg\s+and\s+\d+\s*mg\s+combined\s*\))`, 'y'), kind: 'combined' },
  { re: new RegExp(String.raw`\s+(?:of|for|in)\s+the\s+(pooled\s+${ARMWORD}\s+dose\s+groups)`, 'y'), kind: 'combined' },
  // "in the all lorinastat doses combined group": the pooled-dose row of a dose-ranging programme (r2 scope-19).
  { re: new RegExp(String.raw`\s+(?:of\s+(?:the\s+)?(?:${NOUN})\s+)?in\s+the\s+all\s+(${ARMWORD})\s+doses\s+combined(?:\s+(?:group|arm))?`, 'y'), kind: 'combined' },
  // "in Arm A (ravoxetine)", "in Group 2 (placebo)": the arm named by a letter with its drug in apposition, the way
  // oncology and multi-arm CSRs label arms (r2 scope-17).
  { re: new RegExp(String.raw`\s+(?:of\s+(?:the\s+)?(?:${NOUN})\s+)?in\s+(?:Arm|Group|Cohort|Treatment\s+[Gg]roup)\s+[A-Z0-9]\s*\(\s*(${ARM})\s*\)`, 'y'), kind: 'arm' },
  { re: new RegExp(String.raw`\s+(?:of|among)\s+(?:the\s+)?(?:${NOUN})\s+(?:receiving|treated\s+with|on|who\s+received|given)\s+(${ARM})(?:\s+(?:group|arm))?(?!\s+and\s+(?:the\s+)?${ARMWORD})`, 'y'), kind: 'arm' },
  { re: new RegExp(String.raw`\s+of\s+(?:the\s+)?(?:${NOUN})\s+in\s+the\s+(${ARM})\s+(?:group|arm)\b`, 'y'), kind: 'arm' },
  { re: new RegExp(String.raw`\s+of\s+(?:those|them)\s+(?:receiving|given|treated\s+with)\s+(${ARM})`, 'y'), kind: 'arm' },
  // "of those assigned to Drug X", "of those randomised to placebo": the arm each patient was allocated to (r2
  // pv-arm-those-assigned-to). This is a subject incidence, not a share of events.
  { re: new RegExp(String.raw`\s+of\s+(?:those|them|${NOUN})\s+(?:assigned|randomi[sz]ed|allocated)\s+to\s+(${ARM})`, 'y'), kind: 'arm' },
  { re: new RegExp(String.raw`\s+of\s+those\s+(?=(?:aged|younger|older|\d))`, 'y'), kind: 'those' },
  { re: new RegExp(String.raw`\s+(?:${NOUN})\s+(?:receiving|on|treated\s+with)\s+(${ARM})(?:\s+(?:group|arm))?(?!\s+and\s+(?:the\s+)?${ARMWORD})`, 'y'), kind: 'arm' },
  { re: new RegExp(String.raw`\s+(?:${NOUN})\s+in\s+the\s+(${ARM})\s+(?:group|arm)\b`, 'y'), kind: 'arm' },
  { re: new RegExp(String.raw`\s+(?:${NOUN})\s+treated\s+with\s+(${ARM})`, 'y'), kind: 'arm' },
  { re: new RegExp(String.raw`\s+of\s+(${ARM})(?:-treated)?(?:\s+(?:${NOUN}))?(?![\w-])`, 'y'), kind: 'arm' },
  { re: new RegExp(String.raw`\s+(?:in|of)\s+the\s+(${ARM})\s+(?:group|arm)`, 'y'), kind: 'arm' },
  // "… for Drug X and placebo" opens an arm list for the values before it, never one value's own arm (r1).
  { re: new RegExp(String.raw`\s+(?:receiving|with|on|for)\s+(${ARM})(?:\s+(?:group|arm))?(?![\w-])(?!\s+and\s+(?:the\s+)?[A-Za-z])`, 'y'), kind: 'arm' },
  { re: new RegExp(String.raw`\s*\(\s*(${ARM})\s*\)`, 'y'), kind: 'arm' },
  { re: new RegExp(String.raw`\s+(${ARM})(?:-treated)?(?:\s+(?:${NOUN}))?(?![\w-])`, 'y'), kind: 'arm' },
];

const SUBGROUP_POST = new RegExp(
  String.raw`\s*(?:(?:aged\s+)?(\d+)\s+years\s+of\s+age\s+and\s+older|aged\s*(?:≥|>=)\s*(\d+)\s*years|younger\s+than\s+(\d+)\s+years|aged\s*<\s*(\d+)\s*years)`,
  'y',
);

/** The arm phrase immediately before a value ("Drug X 14 (4.6%)", "placebo: 1 death", "for the pooled X dose groups was"). */
function preArm(text: string, at: number, valueEnd: number): { arm: ArmRef; start: number } | null {
  const before = text.slice(Math.max(0, at - 90), at);
  // "with Drug X (3.3% vs 4.6%)": a "V vs V" pair in a bracket is bound by the sentence's arm list, never by the arm
  // word before the bracket (r1 pv-control-named-first-comparative, nsf-18).
  const vsPair = /^\s*(?:vs\.?|versus)\b/.test(text.slice(valueEnd));
  const m =
    new RegExp(String.raw`(?:^|[\s(;,:])((?:the\s+)?pooled\s+${ARMWORD}\s+dose\s+groups)\s+(?:was|were)\s+$`).exec(before) ??
    new RegExp(String.raw`(?:^|[\s(;,:])(${ARM})\s*:?\s+$`).exec(before) ??
    // "Drug X – 19 (6.4%)" on its own line: an un-bulleted list with a dash between the arm and its value. The dash
    // must follow the arm directly, so "4.6% – 3.3%" (a range) and a bullet are not arm labels (r2 pv-arm-list-one-per-line-en-dash).
    new RegExp(String.raw`(?:^|[\n\r]\s*|[\s(;,:])(${ARM})\s+[–—-]\s+$`).exec(before) ??
    (vsPair ? null : new RegExp(String.raw`(?:^|[\s(;,:])(${ARM})\s*\(\s*$`).exec(before)) ??
    // "Incidence of SAEs: Drug X, 4.6%; placebo, 3.3%": an arm label set off by a comma after a list delimiter (r1).
    new RegExp(String.raw`(?:^|[;:(]\s*)(${ARM}),\s+$`).exec(before) ??
    // "Of the patients receiving Drug X, 4.6% experienced an SAE": the fronted subject is the value's arm (r1).
    new RegExp(String.raw`(?:^|[\s(;,:])(?:Of|Among|In)\s+(?:the\s+)?(?:patients|subjects|participants)\s+(?:receiving|treated\s+with|given|on)\s+(${ARM}),\s+$`, 'i').exec(before);
  if (!m) return null;
  const phrase = m[1];
  if (/pooled/i.test(phrase)) {
    const drug = /pooled\s+(\S+)/i.exec(phrase)?.[1]?.toLowerCase() ?? '';
    return { arm: { kind: 'combined', drug, doses: 'all', label: phrase }, start: at - before.length + m.index + m[0].indexOf(phrase) };
  }
  const arm = armOf(phrase);
  if (!arm) return null;
  return { arm, start: at - before.length + m.index + m[0].indexOf(phrase) };
}

/**
 * Items of a span, left to right. `base` is the span's offset in the source;
 * masked positions (section numbers, doses, thresholds …) never start an item.
 */
export function itemsIn(text: string, base: number, doc: DocInfo, opts: ItemOptions = {}): Item[] {
  const out: Item[] = [];
  const sh = shapes(doc, opts);
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    const signed = /[-−–<≤>≥]/.test(ch) && /[\d\s]/.test(text[k + 1] ?? '');
    if (!/\d/.test(ch) && !signed && !/[A-Za-z]/.test(ch)) continue;
    if (k > 0 && /[\w.,·]/.test(text[k - 1]) && !/[\s([]/.test(text[k - 1])) continue;
    if (/[A-Za-z]/.test(ch) && !(opts.counts && (WORD_COUNT.test(text.slice(k)) || wordBeforeArm(text.slice(k), doc)))) continue;
    // "1. Drug X: 19 (6.4%)": the number that opens a numbered list line is a list marker, not a figure (r2
    // pv-arm-list-numbered-ordinals-as-figures).
    if (/^\d{1,2}[.)]\s+[A-Za-z]/.test(text.slice(k)) && /(?:^|[\n\r])[ \t]*$/.test(text.slice(0, k))) continue;
    if (inMask(doc.masks, base + k, base + k + 1)) continue;
    for (const s of sh) {
      s.re.lastIndex = k;
      const m = s.re.exec(text);
      if (!m) continue;
      if (inMask(doc.masks, base + k, base + k + m[0].length) && !/\d+\s*\(/.test(m[0])) continue;
      const read = s.read(m);
      if (!read || (!read.count && !read.percent && !read.denominator)) continue;
      if (read.count && !read.percent && !read.denominator && !opts.counts) continue;
      const item: Item = { start: base + k, end: base + k + m[0].length, ...read };
      if (!item.arm) delete item.arm;
      let end = k + m[0].length;
      // "4.4% (vs 3.3% with placebo) of Drug X patients": the comparator aside is skipped to reach this value's own arm
      // phrase; the aside's own value is read next (r1 pv-parenthetical-comparator).
      const aside = /^\s*\((?:vs\.?|versus|compared\s+with)\s+[^()]*\)/i.exec(text.slice(end));
      // "19 (6.4%)† of Drug X patients": a footnote marker attached to the value is a typesetting mark; the arm
      // phrase after it is still the value's own (r2 pv-footnote-markers-on-values).
      const marker = /^(?:[†‡*§¶#]+|\^[a-z])(?=\s|$)/.exec(text.slice(end));
      const armFrom = aside ? end + aside[0].length : marker ? end + marker[0].length : end;
      // Arm phrase after the value.
      if (!item.arm) {
        for (const p of POST_ARM) {
          p.re.lastIndex = armFrom;
          const a = p.re.exec(text);
          if (!a) continue;
          // "Drug X – 19 (6.4%)\nPlacebo – 10 (3.3%)": an arm phrase is on the value's own line; a match that
          // crosses a line break is the next row's label (r2 pv-arm-list-one-per-line-en-dash).
          if (/[\n\r]/.test(a[0])) continue;
          if (p.kind === 'those') {
            item.armFromPrevious = true;
            end = end + a[0].length;
            break;
          }
          const phrase = a[1];
          if (p.kind === 'ole-continued' || p.kind === 'ole-switched') {
            const arm = armOf(phrase);
            if (!arm || arm.kind !== 'arm') continue;
            const key = p.kind === 'ole-continued' ? `continued:${arm.drug}` : `switched-from:${arm.drug}`;
            item.arm = { kind: 'ole', key, label: a[0].trim() };
          } else if (p.kind === 'active') {
            const active = [...doc.roster.values()].filter((r) => !r.control && r.drug !== 'placebo');
            if (active.length === 1) item.arm = { kind: 'arm', drug: active[0].drug, label: a[0].trim().replace(/^\s*(?:of|in|among)\s+/i, '') };
            else item.armUnidentified = a[0].trim();
          } else if (p.kind === 'unidentified') {
            item.armUnidentified = a[0].trim();
          } else if (p.kind === 'combined') {
            const drug = /(?:pooled\s+)?([A-Za-z][\w-]*)/i.exec(phrase.replace(/^pooled\s+/i, ''))?.[1]?.toLowerCase() ?? '';
            const doses = /(\d+\s*mg)\s+and\s+(\d+\s*mg)/i.exec(phrase);
            item.arm = { kind: 'combined', drug, doses: doses ? [doseKey(doses[1]), doseKey(doses[2])].sort().join('+') : 'all', label: phrase };
          } else {
            const arm = armOf(phrase);
            if (!arm) continue;
            item.arm = arm;
          }
          if (!aside) end = end + a[0].length + (marker ? marker[0].length : 0);
          break;
        }
      }
      if (!item.arm && !item.armUnidentified) {
        const pre = preArm(text, k, k + m[0].length);
        if (pre) {
          item.arm = pre.arm;
          item.start = base + pre.start;
        }
      }
      SUBGROUP_POST.lastIndex = end;
      const sg = SUBGROUP_POST.exec(text);
      if (sg) {
        const n = sg[1] ?? sg[2];
        item.subgroups = n ? [`age>=${n}`] : [`age<${sg[3] ?? sg[4]}`];
        end += sg[0].length;
      }
      // A trailing parenthetical sub-rate — "4.6% of patients in the lorinastat group (5.9% in Japanese patients)" —
      // is the same measure and arm restricted to the subgroup it names. The subgroup is that figure's, never the
      // one it follows: an overall rate read as a subgroup rate is this engine's founding failure (r2 scope-07..10).
      const sub = parenSubRate(text, k, end);
      if (sub) {
        item.subgroups = sub.subgroups;
        item.armFromPrevious = true;
        end = sub.end;
      }
      item.end = base + end;
      out.push(item);
      k = end - 1;
      break;
    }
  }
  // "4.6% to 6.4%", "4.6%-6.4%": a range across the pooled studies, not a value. Both ends are marked, so neither is
  // read as the figure — least of all the upper one (r2 num-02, C9). "and" is not a range: it is an arm list.
  for (let i = 0; i + 1 < out.length; i++) {
    const gap = text.slice(out[i].end - base, out[i + 1].start - base);
    const after = text.slice(out[i + 1].start - base);
    // A range is written inside one line: a line break makes the next value another row of a list, and its leading
    // "- " a bullet, never a range dash (r1 pv-bulleted-list).
    if (/[\n\r]/.test(gap)) continue;
    const dash = gap === '' && /^[-−–]/.test(after);
    if (!dash && !/^ ?(?:to|through) ?$|^ ?[–—-] ?$/i.test(gap)) continue;
    const kind = (x: Item) => (x.percent ? 'percent' : x.count && !x.denominator ? 'count' : '');
    if (!kind(out[i]) || kind(out[i]) !== kind(out[i + 1])) continue;
    out[i].range = true;
    out[i + 1].range = true;
  }
  return out;
}

/** The subgroup keys a phrase names, sorted; empty when it names none. */
export function subgroupsIn(phrase: string): string[] {
  const out: string[] = [];
  for (const row of SUBGROUP_ROWS) {
    row.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = row.re.exec(phrase)) !== null) {
      out.push(row.key(m));
      if (m[0].length === 0) row.re.lastIndex++;
    }
  }
  return [...new Set(out)].sort();
}

/** A value's own parenthetical sub-rate scope: "(5.9% in Japanese patients)" → the subgroup and the end of the bracket. */
export const SUB_RATE_PAREN = /^\s*(?:%\s*)?(?:in|among|for)\s+([^()]{2,70})\)/i;
function parenSubRate(text: string, start: number, end: number): { subgroups: string[]; end: number } | null {
  if (!/\(\s*$/.test(text.slice(Math.max(0, start - 3), start))) return null;
  const m = SUB_RATE_PAREN.exec(text.slice(end));
  if (!m) return null;
  // A parenthetical naming a study is a per-study split, not a subgroup restriction (pvs-31).
  if (/\b(?:[A-Z]{1,5}-\d{2,4}|NCT\d{8})\b/.test(m[1])) return null;
  const subgroups = subgroupsIn(m[1]);
  return subgroups.length ? { subgroups, end: end + m[0].length } : null;
}

/** "in no placebo-treated patients": an explicit zero count (lu-22). */
export function explicitZeros(text: string, base: number): Item[] {
  const out: Item[] = [];
  for (const m of text.matchAll(new RegExp(String.raw`\bin\s+no\s+(${ARM_HEAD})-treated\s+${NOUN}`, 'g'))) {
    const arm = armOf(m[1]);
    if (!arm) continue;
    out.push({ start: base + m.index!, end: base + m.index! + m[0].length, count: { raw: 'no', digits: '0', sign: 1, dp: 0, kind: 'exact', exactZero: true }, arm });
  }
  return out;
}

/** An ordered arm list the clause states: "(A vs B)", "in the A and B groups, respectively", "with A … compared with B". */
export function armListIn(text: string): { arms: ArmRef[]; span: Span; respectively: boolean } | null {
  const lists: Array<[RegExp, boolean]> = [
    [new RegExp(String.raw`\(\s*(${ARM})\s+(?:vs\.?|versus)\s+(${ARM})\s*\)`, 'g'), false],
    // A comparative whose values follow in "(V vs V)": the values follow the arms in the order the sentence names them,
    // control first or not ("lower with placebo than with Drug X (3.3% vs 4.6%)", "Drug X reduced … compared with
    // placebo (9.2% vs 12.3%)") (r1 pv-control-named-first-comparative, nsf-18, nsf-20, nsf-21).
    [new RegExp(String.raw`\bwith\s+(${ARM})\s+than\s+(?:with\s+)?(${ARM})\s*\((?=[^()]*\d[^()]*\b(?:vs\.?|versus)\b)`, 'g'), false],
    // The same comparative with the arms written as groups, and a predicate between them and the values: "was lower
    // in the placebo group than in the Drug X group (3.3% vs 6.4%)", "fewer patients in the placebo group than in
    // the Drug X group reported a serious adverse event (3.3% vs 6.4%)" (r2 pv-lower-in-placebo-than-in-drug-x).
    [
      new RegExp(
        String.raw`\bin\s+(?:the\s+)?(${ARM})\s+(?:group|arm)\s+than\s+in\s+(?:the\s+)?(${ARM})\s+(?:group|arm)\b[^.;()]{0,80}?\s*\((?=[^()]*\d[^()]*\b(?:vs\.?|versus)\b)`,
        'g',
      ),
      false,
    ],
    [new RegExp(String.raw`\b(${ARM})\s+(?:reduced|increased|lowered|decreased|improved)\b[^.;()]{0,120}?\b(?:compared\s+with|versus|vs\.?|relative\s+to)\s+(${ARM})\s*\((?=[^()]*\d[^()]*\b(?:vs\.?|versus)\b)`, 'g'), false],
    // Parallel lists without "respectively": "SAE rates were 4.6% and 3.3% for Drug X and placebo" — the values, then
    // an arm list of the same length closing the clause (r1 pv-paired-list-without-respectively).
    [new RegExp(String.raw`\d\s?%\s+and\s+[-−–]?\d+(?:[.,]\d+)?\s?%\s+(?:for|in|with)\s+(?:the\s+)?(${ARM})\s+and\s+(${ARM})(?:\s+(?:groups|arms|patients|subjects))?\s*(?=[.;]|$)`, 'g'), true],
    [new RegExp(String.raw`(?:in\s+the|of|for)\s+(${ARM})\s+and\s+(${ARM})\s+(?:groups|arms|${NOUN}|subjects)?,?\s*respectively`, 'g'), true],
    [new RegExp(String.raw`(?:of|for|in)\s+(${ARM})\s+and\s+(${ARM}),\s*respectively`, 'g'), true],
    // The arms named BEFORE their values: "placebo and Drug X patients reported serious adverse events in 3.3% and
    // 6.4%, respectively" (r2 pv-respectively-arms-named-first).
    [new RegExp(String.raw`\b(${ARM})\s+and\s+(${ARM})\s+(?:${NOUN})\s+(?:reported|experienced|had|showed)\b`, 'g'), true],
    // "patients received either Drug X or placebo": the order the arms are named in, for "the former and the latter"
    // and for a later "V and V, respectively" (r2 pv-former-and-latter).
    [new RegExp(String.raw`\b(?:received|were\s+randomi[sz]ed\s+to|were\s+assigned\s+to|to\s+receive)\s+(?:either\s+)?(${ARM})\s+or\s+(${ARM})\b`, 'g'), false],
    [new RegExp(String.raw`${NOUN}\s+in\s+the\s+(${ARM})\s+and\s+(${ARM})\s+groups,?\s*respectively`, 'g'), true],
  ];
  for (const [re, respectively] of lists) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (!m) continue;
    const a = armOf(m[1]);
    const b = armOf(m[2]);
    if (a && b) return { arms: [a, b], span: { start: m.index, end: m.index + m[0].length }, respectively };
  }
  return null;
}

export const sameArm = (a: ArmRef | undefined, b: ArmRef | undefined): boolean => {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'arm' && b.kind === 'arm') return a.drug === b.drug && (a.dose ?? '') === (b.dose ?? '');
  if (a.kind === 'combined' && b.kind === 'combined') return a.drug === b.drug && a.doses === b.doses;
  if (a.kind === 'ole' && b.kind === 'ole') return a.key === b.key;
  if (a.kind === 'role' && b.kind === 'role') return a.role === b.role;
  return a.kind === 'total' && b.kind === 'total';
};

export const armLabel = (a: ArmRef | undefined): string => {
  if (!a) return '';
  switch (a.kind) {
    case 'arm':
      return `${a.drug}${a.dose ? ` ${a.dose}` : ''}`;
    case 'combined':
      return `${a.drug} (${a.doses === 'all' ? 'all doses' : a.doses} combined)`;
    case 'ole':
      return a.key.replace('continued:', 'continued ').replace('switched-from:', 'switched from ');
    case 'role':
      return a.role;
    default:
      return 'total';
  }
};
