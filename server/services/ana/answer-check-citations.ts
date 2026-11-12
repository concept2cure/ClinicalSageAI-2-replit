/**
 * The citations AnA's answer check reads beyond the US forms — split out of
 * answer-grounding.ts, which reads CFR sections and ICH codes itself.
 *
 *   eu_law       an EU regulation or directive, by number ("Regulation (EU) No
 *                536/2014", "Directive 2001/83/EC") or, for the two device
 *                regulations, by name with a provision ("MDR Article 61",
 *                "Annex XIV of the IVDR")
 *   standard     ISO, IEC, ISO/IEC and EN standards, with part and edition
 *                ("ISO 14971:2019", "IEC 60601-1-2", "EN ISO 13485:2016")
 *   eu_guidance  MDCG and MEDDEV documents, with revision ("MDCG 2020-6",
 *                "MEDDEV 2.7/1 rev. 4")
 *   ema_ref      EMA / CHMP document reference numbers
 *                ("EMA/CHMP/ICH/135/1995", "CPMP/ICH/135/95")
 *
 * Before this (2026-11-12, finding GRD-CITES) an answer whose specific claims
 * were in these forms had, for the check, no claims at all: the strip said "No
 * specific claims to check" under every device, diagnostics and EU answer.
 *
 * ── The rules, which are answer-grounding.ts's own ───────────────────────────
 * - A regulation, standard or guideline can be recalled correctly, so a miss
 *   means "not in this turn's sources", never "fabricated".
 * - "Found" means a source of this turn holds the citation, not that the
 *   sentence around it is right.
 * - Finer is not coarser. A source that holds Article 61(4) does not hold
 *   61(1); one that holds ISO 14971 undated does not state the 2019 edition;
 *   IEC 60601-1 is not 60601-1-2; MEDDEV 2.7/1 rev 3 is not rev 4. The other
 *   way round holds: cited whole, any paragraph, part or edition of it is it.
 * - A bare number credits nothing: an enrolment of 14971 is not ISO 14971.
 * - What the model asked a tool for is found only in what the tool returns as
 *   a record, and "asked for" is read loosely on purpose: the provision or the
 *   number, in whichever fields the call split it across. AnA's own
 *   generate_citation formats "Regulation (EU) 2017/745 …, Article 61" from an
 *   identifier of "Article 61" and says it verified nothing; the act in its
 *   reply is the formatter's, not a source's.
 *
 * ── What is deliberately not read ────────────────────────────────────────────
 * - An article or annex with no act beside it. After "Under the MDR, …" a later
 *   "Article 62" is probably the MDR's; a guessed act would be reported as a
 *   claim the answer never made in those words.
 * - "MDR" or "IVDR" alone. In a US device file an MDR is a Medical Device
 *   Report, so the name is read as the regulation only beside a provision.
 * - Author-year references ("Smith 2021"). Any capitalised word before a year
 *   has that shape ("June 2021"); it needs its own design, not a pattern here.
 */

import { asciiDashes } from './answer-check-sources';

export type CitationKind = 'eu_law' | 'standard' | 'eu_guidance' | 'ema_ref';

/** One citation the answer makes, and how a text holds it. */
export interface CitationClaim {
  kind: CitationKind;
  /** What it is deduplicated by: the citation itself, however it was written. */
  key: string;
  /** As the answer wrote it. */
  text: string;
  /** Whether a text holds it. The text is upper-cased, with ASCII dashes (answer-grounding.ts `forms().upper`). */
  heldBy: (upper: string) => boolean;
  /**
   * Whether a tool call's input asks for it: the provision or the number alone
   * is enough. Looser than `heldBy`, because a call names the act in one field
   * ("eu_mdr") and the article in another, or sends a standard's number bare.
   */
  askedBy: (upper: string) => boolean;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A number as a call's input carries it: whole, with no designation asked of it. `pattern` is already a pattern. */
const numberToken = (pattern: string, escape = true): RegExp =>
  // nosemgrep: detect-non-literal-regexp -- callers pass digits and separators captured by this file's own patterns, escaped here or piecewise by them
  new RegExp(`(?<![0-9])${escape ? escapeRegExp(pattern) : pattern}(?![0-9])`);
const tidy = (s: string): string => s.replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim();

/* ── EU regulations and directives ─────────────────────────────────────────── */

/** The two device regulations go by a short name as often as by their number. */
const EU_ACT_BY_NAME: Record<string, string> = { MDR: '2017/745', IVDR: '2017/746' };

const YEAR_NUMBER = String.raw`(?:(?:19|20)\d{2}\/\d{1,4}|\d{1,4}\/(?:19|20)\d{2})`;
const ACT_PATTERNS: readonly RegExp[] = [
  // Regulation (EU) 2017/745 · Regulation (EC) No 726/2004
  /\b(?:Regulation|Directive)\s*\((?:EU|EC|EEC|Euratom)\)\s*(?:No\.?\s*)?(\d{1,4}\/\d{1,4})(?![\d/])/gi,
  // Directive 2001/83/EC · Directive 93/42/EEC
  /\b(?:Regulation|Directive)\s+(?:No\.?\s*)?(\d{2,4}\/\d{1,4})\/(?:EU|EC|EEC)\b/gi,
  // (EU) 2017/745 · EU 2017/745: the act by its number alone. "EC" without its
  // brackets is not read: it is also an ethics committee beside a date.
  new RegExp(String.raw`(?:\((?:EU|EC|EEC)\)|\bEU)\s*(?:N[oO]\.?\s*)?(${YEAR_NUMBER})(?![\d/])`, 'g'),
];
const ACT_NAME_RE = /\b(MDR|IVDR)\b/g;
/**
 * The act's official title, which is part of its name where it is written out:
 * "Regulation (EU) 2017/745 of the European Parliament and of the Council on
 * medical devices, Article 61" is how AnA's own citation tool formats one.
 */
const OFFICIAL_TITLE_RE = /^\s+of the European Parliament and of the Council(?:\s+of\s+\d{1,2}\s+[A-Za-z]+\s+\d{4})?(?:\s+on\s+[^.,;()\n]{3,90})?/i;

interface ActMention {
  start: number;
  end: number;
  /** The act's number: what makes two mentions the same act. */
  id: string;
  text: string;
  /** Cited by its number, not only by a short name. */
  numbered: boolean;
}

type ProvisionPart = 'ARTICLE' | 'ANNEX';

interface Provision {
  start: number;
  end: number;
  part: ProvisionPart;
  /** "61(1)" or "XIV", upper-cased. */
  value: string;
  /** As written. */
  raw: string;
  /** The head and the items listed after it ("Articles 61 and 62") are one group. */
  group: number;
  /** One of several under a plural head. */
  listed: boolean;
}

const ARTICLE_VALUE = String.raw`\d{1,3}[a-zA-Z]?(?:\((?:\d{1,2}|[a-zA-Z])\))*`;
/** I to XXXIX, as a numeral: "CIVIL" and "MIX" are words. */
const ROMAN = String.raw`(?:X{1,3}(?:IX|IV|V?I{0,3})|IX|IV|V?I{1,3}|V)`;
// Up to three characters between the word and its number, so a record's field
// reads too ("article: 61").
const ARTICLE_HEAD_RE = new RegExp(
  String.raw`\b(Articles?|ARTICLES?|articles?|Arts?\.|ARTS?\.)[^0-9A-Za-z]{0,3}(${ARTICLE_VALUE})(?![\dA-Za-z])`,
  'g',
);
const ANNEX_HEAD_RE = new RegExp(String.raw`\b(Annex(?:es)?|ANNEX(?:ES)?)[^0-9A-Za-z]{0,3}(${ROMAN})(?![A-Za-z0-9])`, 'g');
const listNext = (value: string): RegExp =>
  new RegExp(String.raw`^(?:\s*,\s*(?:and\s+|AND\s+)?|\s+(?:and|AND|&)\s+)(${value})(?![\dA-Za-z/:.%-])`);

const SUBDIVISION = String.raw`(?:\s*,?\s*(?:Part|PART|Chapter|CHAPTER|Section|SECTION)\s+[A-Z0-9.]{1,6})*`;
/** "Article 61 of the MDR", "Annex XIV Part A of Regulation (EU) 2017/745", "Article 61 MDR". */
const ACT_FOLLOWS_RE = new RegExp(String.raw`^${SUBDIVISION}\s*,?\s*(?:(?:of|OF|in|IN|to|TO|under|UNDER)\s+)?(?:(?:the|THE)\s+)?$`);
/** "MDR Article 61", "Regulation (EU) 2017/745, Article 61", "the MDR (Article 61)". */
const ACT_PRECEDES_RE = /^[\s,;:]{0,3}\(?\s?$/;
/** "… Article 61 and Annex XIV": the next provision is of the same act. */
const SAME_ACT_NEXT_RE = new RegExp(String.raw`^${SUBDIVISION}\s*(?:,|;|,?\s*(?:and|AND|or|OR)|&)\s*$`);

function actMentions(text: string): ActMention[] {
  const found: ActMention[] = [];
  for (const re of ACT_PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const end = m.index + m[0].length;
      const title = OFFICIAL_TITLE_RE.exec(text.slice(end, end + 200));
      found.push({ start: m.index, end: end + (title ? title[0].length : 0), id: m[1], text: tidy(m[0]), numbered: true });
    }
  }
  ACT_NAME_RE.lastIndex = 0;
  for (let m = ACT_NAME_RE.exec(text); m !== null; m = ACT_NAME_RE.exec(text)) {
    found.push({ start: m.index, end: m.index + m[0].length, id: EU_ACT_BY_NAME[m[1]], text: m[1], numbered: false });
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  // One act per place. A mention inside another is the same words read twice,
  // and "Regulation (EU) 2017/745 (MDR)" names one act, not two.
  const acts: ActMention[] = [];
  for (const a of found) {
    const last = acts[acts.length - 1];
    if (last && a.start < last.end) continue;
    if (last && a.id === last.id && /^[\s,(]{0,3}$/.test(text.slice(last.end, a.start))) {
      last.end = a.end + (text[a.end] === ')' ? 1 : 0);
      last.numbered = last.numbered || a.numbered;
      continue;
    }
    acts.push({ ...a });
  }
  return acts;
}

function provisions(text: string): Provision[] {
  const out: Provision[] = [];
  let group = 0;
  const read = (head: RegExp, part: ProvisionPart, value: string): void => {
    head.lastIndex = 0;
    for (let m = head.exec(text); m !== null; m = head.exec(text)) {
      group += 1;
      const plural = /s\.?$/i.test(m[1]);
      out.push({ start: m.index, end: m.index + m[0].length, part, value: m[2].toUpperCase(), raw: m[2], group, listed: plural });
      let rest = m.index + m[0].length;
      const next = listNext(value);
      for (let n = plural ? next.exec(text.slice(rest, rest + 24)) : null; n !== null; n = next.exec(text.slice(rest, rest + 24))) {
        out.push({ start: rest, end: rest + n[0].length, part, value: n[1].toUpperCase(), raw: n[1], group, listed: true });
        rest += n[0].length;
      }
      head.lastIndex = Math.max(head.lastIndex, rest);
    }
  };
  read(ARTICLE_HEAD_RE, 'ARTICLE', ARTICLE_VALUE);
  read(ANNEX_HEAD_RE, 'ANNEX', ROMAN);
  return out.sort((a, b) => a.start - b.start);
}

/** The first act that starts at or after `position`; acts are in order and do not overlap. */
function actIndexFrom(acts: ActMention[], position: number): number {
  let low = 0;
  let high = acts.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (acts[mid].start < position) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** The act just before a position and the act at or after it: only these two can be the one meant. */
function actsAround(acts: ActMention[], from: number, to: number): { before: ActMention | undefined; after: ActMention | undefined } {
  return { before: acts[actIndexFrom(acts, from) - 1], after: acts[actIndexFrom(acts, to)] };
}

/**
 * The act the words give a provision: the one that follows it ("Article 61 of
 * the MDR"), else the one right before it ("MDR Article 61"). Each test reads
 * only the few characters between the two; a long source has hundreds of each.
 */
function actByWords(text: string, acts: ActMention[], first: Provision, last: Provision): ActMention | null {
  const { before, after } = actsAround(acts, first.start, last.end);
  if (after && after.start - last.end <= 48 && ACT_FOLLOWS_RE.test(text.slice(last.end, after.start))) return after;
  if (before && first.start - before.end <= 6 && ACT_PRECEDES_RE.test(text.slice(before.end, first.start))) return before;
  return null;
}

/** The act of the provision this one is listed after ("… Article 61 and Annex XIV"). */
function actByList(text: string, previous: { act: ActMention; end: number } | null, first: Provision): ActMention | null {
  if (!previous) return null;
  const since = first.start - previous.end;
  return since >= 0 && since <= 40 && SAME_ACT_NEXT_RE.test(text.slice(previous.end, first.start)) ? previous.act : null;
}

/** The act within `reach` characters, the nearer of the one before and the one after: how a record's separate fields are read. */
function actByNearness(acts: ActMention[], first: Provision, last: Provision, reach: number): ActMention | null {
  if (reach <= 0) return null;
  const { before, after } = actsAround(acts, first.start, last.end);
  const gapBefore = before ? first.start - before.end : Infinity;
  const gapAfter = after ? after.start - last.end : Infinity;
  if (Math.min(gapBefore, gapAfter) > reach) return null;
  return (gapBefore <= gapAfter ? before : after) ?? null;
}

interface Bound {
  provision: Provision;
  act: ActMention;
  /** Bound by the words next to it, not by a list before it or by nearness. */
  direct: boolean;
}

/**
 * Which act each provision is a provision of.
 *
 * By the words first (actByWords), then by the list it stands in (actByList).
 * An answer is read no other way (`reach` 0), so it is never given a citation
 * it did not write. A source is also read by nearness, because a tool's record
 * keeps the act and the article in separate fields.
 */
function bindProvisions(text: string, acts: ActMention[], provs: Provision[], reach: number): Bound[] {
  const groups = new Map<number, Provision[]>();
  for (const p of provs) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
  const bound: Bound[] = [];
  let previous: { act: ActMention; end: number } | null = null;
  for (const members of groups.values()) {
    const first = members[0];
    const last = members[members.length - 1];
    const worded = actByWords(text, acts, first, last);
    const act: ActMention | null = worded ?? actByList(text, previous, first) ?? actByNearness(acts, first, last, reach);
    previous = act ? { act, end: last.end } : null;
    if (!act) continue;
    const direct = worded !== null && members.length === 1;
    for (const provision of members) bound.push({ provision, act, direct });
  }
  return bound;
}

interface EuReading {
  acts: ActMention[];
  bound: Bound[];
}

const SOURCE_REACH = 200;

/**
 * Reads a source's acts and provisions once, however many of the answer's EU
 * claims are compared with it. The readings live with one answer's claims and
 * go with them: nothing of a source is kept after its check.
 */
function sourceReader(): (upper: string) => EuReading {
  const readings = new Map<string, EuReading>();
  return (upper) => {
    const kept = readings.get(upper);
    if (kept) return kept;
    const acts = actMentions(upper);
    const reading = { acts, bound: bindProvisions(upper, acts, provisions(upper), SOURCE_REACH) };
    readings.set(upper, reading);
    return reading;
  };
}

/** The provision as cited, or a finer one inside it: 61(1)(a) is within 61(1), 61(4) is not. */
const withinProvision = (held: string, cited: string): boolean => held === cited || held.startsWith(`${cited}(`);

function euLawClaims(answer: string): CitationClaim[] {
  const acts = actMentions(answer);
  const bound = bindProvisions(answer, acts, provisions(answer), 0);
  const readSource = sourceReader();
  const claims: CitationClaim[] = bound.map(({ provision: p, act, direct }) => {
    const word = p.part === 'ARTICLE' ? 'Article' : 'Annex';
    return {
      kind: 'eu_law',
      key: `${act.id}|${p.part} ${p.value}`,
      text: direct ? tidy(answer.slice(Math.min(act.start, p.start), Math.max(act.end, p.end))) : `${act.text} ${word} ${p.raw}`,
      heldBy: (upper) =>
        readSource(upper).bound.some((b) => b.act.id === act.id && b.provision.part === p.part && withinProvision(b.provision.value, p.value)),
      // The provision, whichever act the call meant and wherever it said so.
      askedBy: (upper) => provisions(upper).some((q) => q.part === p.part && withinProvision(q.value, p.value)),
    };
  });
  // An act cited by its number with no provision is itself the claim.
  const located = new Set(bound.map((b) => b.act));
  for (const act of acts) {
    if (!act.numbered || located.has(act)) continue;
    claims.push({
      kind: 'eu_law',
      key: act.id,
      text: act.text,
      heldBy: (upper) => readSource(upper).acts.some((a) => a.numbered && a.id === act.id),
      askedBy: (upper) => numberToken(act.id).test(upper),
    });
  }
  return claims;
}

/* ── Standards ─────────────────────────────────────────────────────────────── */

const STANDARD_RE =
  /\b((?:EN\s+)?(?:ISO\/IEC(?:\/IEEE)?|ISO|IEC|EN)(?:[/\s](?:TR|TS|PAS))?)\s+(\d{3,5})((?:-\d{1,3}){0,3})(?:\s?:\s?((?:19|20)\d{2}))?(?![\d-])/g;
/** A designation a source can carry before the number. The number alone is anyone's number. */
const STANDARD_LABEL = String.raw`(?<![A-Z])(?:ISO|IEC|IEEE|EN|TR|TS|PAS)[^0-9A-Z]{0,4}`;

function standardClaims(answer: string): CitationClaim[] {
  const claims: CitationClaim[] = [];
  STANDARD_RE.lastIndex = 0;
  for (let m = STANDARD_RE.exec(answer); m !== null; m = STANDARD_RE.exec(answer)) {
    const [, body, number, parts, edition] = m;
    // "EN" alone is also a word; it names a standard only with a part, an edition or five digits.
    if (body === 'EN' && !parts && !edition && number.length < 5) continue;
    const designation = `${number}${parts}`;
    // Cited with an edition: that edition. With a part: that part. Whole: any part or edition of it.
    const tail = edition ? String.raw`\s?:\s?${edition}(?![0-9])` : parts ? '(?![0-9]|-[0-9])' : '(?![0-9])';
    // nosemgrep: detect-non-literal-regexp -- designation is digits and hyphens from STANDARD_RE, escaped; edition is four digits
    const held = new RegExp(`${STANDARD_LABEL}${escapeRegExp(designation)}${tail}`);
    const asked = numberToken(designation);
    claims.push({
      kind: 'standard',
      key: edition ? `${designation}:${edition}` : designation,
      text: tidy(m[0]),
      heldBy: (upper) => held.test(upper),
      askedBy: (upper) => asked.test(upper),
    });
  }
  return claims;
}

/* ── EU guidance documents ─────────────────────────────────────────────────── */

const REVISION = String.raw`(?:\s*,?\s*[Rr][Ee][Vv](?:ision|ISION)?\.?\s*(\d{1,2}))?`;
const MDCG_RE = new RegExp(String.raw`\bMDCG\s+(\d{4}-\d{1,2})(?![\d-])${REVISION}`, 'g');
const MEDDEV_RE = new RegExp(String.raw`\bMEDDEV\s+(\d\.\d{1,2}(?:[/.]\d{1,2})?)(?![\d/])${REVISION}`, 'g');

/** The revision, where the answer states one: rev 3 is not rev 4. */
const heldRevision = (revision: string | undefined): string =>
  revision ? String.raw`[^0-9A-Z]{0,4}REV(?:ISION)?[^0-9A-Z]{0,2}${revision}(?![0-9])` : '';

function guidanceClaims(answer: string): CitationClaim[] {
  const claims: CitationClaim[] = [];
  const read = (re: RegExp, series: string, numberPattern: (n: string) => string): void => {
    re.lastIndex = 0;
    for (let m = re.exec(answer); m !== null; m = re.exec(answer)) {
      const [, number, revision] = m;
      // nosemgrep: detect-non-literal-regexp -- number is digits and separators from the series pattern, escaped piecewise; revision is digits
      const held = new RegExp(String.raw`(?<![A-Z])${series}[^0-9A-Z]{0,3}${numberPattern(number)}(?![0-9])${heldRevision(revision)}`);
      const key = `${series} ${number.replace(/\//g, '.')}${revision ? ` REV ${revision}` : ''}`;
      const asked = numberToken(numberPattern(number), false);
      claims.push({ kind: 'eu_guidance', key, text: tidy(m[0]), heldBy: (upper) => held.test(upper), askedBy: (upper) => asked.test(upper) });
    }
  };
  read(MDCG_RE, 'MDCG', escapeRegExp);
  // "2.7/1" and "2.7.1" are one document, written both ways.
  read(MEDDEV_RE, 'MEDDEV', (n) => n.split(/[/.]/).map(escapeRegExp).join('[/.]'));
  return claims;
}

/* ── EMA document references ───────────────────────────────────────────────── */

const EMA_BODY = String.raw`(?:EMA|EMEA|CHMP|CPMP|CVMP|COMP|PDCO|CAT|HMPC|PRAC)(?:\/[A-Z]{2,8}){0,4}`;
const EMA_REF_RE = new RegExp(String.raw`\b${EMA_BODY}\/(\d{2,7})\/((?:19|20)\d{2}|\d{2})\b(?!\/)`, 'g');

function emaClaims(answer: string): CitationClaim[] {
  const claims: CitationClaim[] = [];
  EMA_REF_RE.lastIndex = 0;
  for (let m = EMA_REF_RE.exec(answer); m !== null; m = EMA_REF_RE.exec(answer)) {
    const [, number, written] = m;
    // A reference of the 1990s carries a two-digit year, and the same document
    // was re-issued under a new prefix with four: CPMP/ICH/135/95 is
    // EMA/CHMP/ICH/135/1995. The number and the year are the document.
    const year = written.length === 4 ? written : `${Number(written) >= 60 ? '19' : '20'}${written}`;
    // nosemgrep: detect-non-literal-regexp -- number and year are digits captured by EMA_REF_RE
    const held = new RegExp(String.raw`(?<![A-Z0-9])${EMA_BODY}\/${number}\/(?:${year}|${year.slice(2)})(?![0-9])`);
    const asked = numberToken(String.raw`${number}\/(?:${year}|${year.slice(2)})`, false);
    claims.push({ kind: 'ema_ref', key: `${number}/${year}`, text: tidy(m[0]), heldBy: (upper) => held.test(upper), askedBy: (upper) => asked.test(upper) });
  }
  return claims;
}

/** Every EU-law, standard, EU-guidance and EMA citation the answer makes, in that order. */
export function citationClaims(answer: string): CitationClaim[] {
  const text = asciiDashes(answer);
  return [...euLawClaims(text), ...standardClaims(text), ...guidanceClaims(text), ...emaClaims(text)];
}
