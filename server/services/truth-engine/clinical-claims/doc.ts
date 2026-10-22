/**
 * Document-level analysis of one source: its non-figure masks, decimal
 * convention, study aliases (C1), arm roster (C11), source-level definitions
 * (an ITT population defined as all randomized, "differences are least squares
 * means", the assessor of declared endpoints) and its single study, if any.
 */
import { blankMasks, masksOf, type Mask } from './segment';
import { detectConvention, NUMBER_WORDS, type NumberConvention } from './number';
import { CONTROL_WORDS, DESIGNATION, isStudyCode, NOT_AN_ARM, POOL_MARKER, STUDY_CODE, ENDPOINT_ROWS } from './vocabulary';
import type { ArmRef, ClaimSource, DocRole, PopulationSet, StudyRef } from './types';

export interface RosterArm {
  /** Normalised head: 'drug x', 'placebo', 'orbaglutide'. */
  drug: string;
  doses: Set<string>;
  control: boolean;
}

export interface DocInfo {
  id: string;
  role: DocRole;
  text: string;
  masks: Mask[];
  convention: NumberConvention;
  /** Alias sets: each identifier → its merged set (record + juxtaposition in this source). */
  aliasOf: Map<string, string[]>;
  roster: Map<string, RosterArm>;
  /** Regex source matching one arm phrase of this source (case-insensitive). */
  armSrc: string;
  /** Populations this source defines as all randomized. */
  allRandomized: Set<PopulationSet>;
  /** "Changes and differences from placebo are least squares means." */
  lsMeans: boolean;
  /**
   * The interval convention the source states once for itself ("Unless otherwise stated, all confidence intervals
   * are two-sided 95% intervals"), the way nearly every CSR states its CI level: a bare "(0.61, 0.85)" in such a
   * source is that interval, fully identified (r2 num-09, C15).
   */
  ciDefault?: { level: string; sided?: 'one' | 'two'; kind: 'confidence' | 'credible' };
  /** Endpoint id → assessor, from "… as assessed by BICR" declarations. */
  endpointAssessor: Map<string, 'bicr' | 'investigator'>;
  /** The one study the whole source names, when it names exactly one and no pool. */
  docStudy?: StudyRef;
  /** A trial-duration adjective of the source's single trial ("a 26-week, placebo-controlled trial"). */
  softPeriod?: string;
  /**
   * The source describes a single-arm study: at most one non-control drug, and no placebo, comparator or control
   * group anywhere. A figure stated alone in its clause with no arm phrase is then the study total (lu-12).
   */
  singleArm: boolean;
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ');

function mergeAliases(sets: string[][]): Map<string, string[]> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    if (p !== x) {
      p = find(p);
      parent.set(x, p);
    }
    return p;
  };
  for (const set of sets) {
    for (const id of set) if (!parent.has(id)) parent.set(id, id);
    for (let k = 1; k < set.length; k++) parent.set(find(set[k]), find(set[0]));
  }
  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const r = find(id);
    groups.set(r, [...(groups.get(r) ?? []), id]);
  }
  const out = new Map<string, string[]>();
  for (const g of groups.values()) {
    const sorted = [...new Set(g)].sort();
    for (const id of sorted) out.set(id, sorted);
  }
  return out;
}

/** Study identifiers juxtaposed in one source: "X (NCT…)", "X [NCT…]", "Trial 1, NCT…", "Trial 1 (NCT…)". */
function juxtaposed(text: string): string[][] {
  const out: string[][] = [];
  const ID = String.raw`(?:NCT\d{8}|[A-Z]{1,5}-(?:\d{2,4}|LTE|OLE|EXT))`;
  const DES = String.raw`(?:Trial|Study)\s+\d{1,2}`;
  const pairs = [
    new RegExp(String.raw`\b(${ID}|${DES})\s*[([]\s*(${ID})\s*[\])]`, 'g'),
    new RegExp(String.raw`\b(${DES}|${ID}),\s*(NCT\d{8})\b`, 'g'),
    new RegExp(String.raw`\b(${ID})\s*,\s*(NCT\d{8})\b`, 'g'),
  ];
  for (const re of pairs) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const a = norm(m[1]);
      const b = norm(m[2]);
      // Two registry numbers side by side name two studies, never one ("(NCT05551234, NCT05551247)").
      if (/^NCT\d{8}$/.test(a) && /^NCT\d{8}$/.test(b)) continue;
      if (a !== b && (isStudyCode(a) || /^(?:Trial|Study)\s/.test(a))) out.push([a, b]);
    }
  }
  // "Trials 1 and 2 (NCT05551234, NCT05551247)": designations bound by order.
  const multi = /\bTrials\s+(\d)\s+and\s+(\d)\s*\(\s*(NCT\d{8})\s*,\s*(NCT\d{8})\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = multi.exec(text)) !== null) {
    out.push([`Trial ${m[1]}`, m[3]], [`Trial ${m[2]}`, m[4]]);
  }
  // "Trial 1 (NCT05551234) Placebo" in a header binds; "Trial 1 Dapralutide" then refers to it.
  return out;
}

const DOSE = String.raw`\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|ug|g|mL|mg\/kg)(?:\/day)?`;

/**
 * A roster key as a regex fragment: metacharacters escaped, runs of whitespace
 * made flexible.
 *
 * ── Why this is one function and not three inline expressions (2026-10-13) ───
 * It was three, and they disagreed. `armSource` below escaped the
 * metacharacters; `armRef`'s pattern and the dose loop in `rosterOf` applied
 * only the `\s+` normalisation and interpolated the key raw. All three consume
 * THE SAME roster, whose keys come from `rosterOf(text)` — document text.
 *
 * Nothing was exploitable, and the reason is worth writing down because it is
 * not local to any of the three call sites: the capture class
 * `W = (Drug\s+[A-Z]|[A-Za-z][a-z]{4,}|[A-Z]{5,})` admits letters and one
 * space, so a key cannot contain `(`, `[`, `*` or `\` today. That is an
 * invariant enforced ~90 lines away from two of the three consumers, and those
 * two consumers disagreed about whether to rely on it — which is exactly the
 * state in which widening `W` (to admit a hyphen, a digit, a parenthesised
 * synonym) turns a vocabulary change into a `SyntaxError` on a legitimate
 * document, or a catastrophic pattern on a hostile one.
 *
 * Semgrep flagged all three (rule `detect-non-literal-regexp`). Routing them
 * through one escaping helper is the honest answer; suppressing two of them
 * would have pinned the asymmetry in place. The two call sites still pass a
 * VALUE rather than a literal, so the rule still fires there and each carries
 * its own suppression naming this helper — escaping makes the argument correct,
 * not literal, and the rule is about the latter.
 */
export const rosterKeyPattern = (k: string): string =>
  k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');

/** Candidate arm names: words in arm-shaped contexts. */
function rosterOf(text: string): Map<string, RosterArm> {
  const roster = new Map<string, RosterArm>();
  const W = String.raw`(Drug\s+[A-Z]|[A-Za-z][a-z]{4,}|[A-Z]{5,})`;
  const contexts = [
    new RegExp(String.raw`\b${W}-treated\b`, 'g'),
    new RegExp(String.raw`\b(?:[Rr]eceiving|[Rr]eceived|[Tt]reated\s+with|[Rr]andomi[sz]ed\s+to|[Aa]ssigned\s+to|[Ee]xposed\s+to|continued|continuing|switched\s+from|to\s+receive|[Ee]xposure\s+to)\s+(?:the\s+)?${W}\b`, 'g'),
    new RegExp(String.raw`\b(?:the\s+)?${W}(?:\s+${DOSE})?\s+(?:group|arm|dose\s+groups?)\b`, 'g'),
    new RegExp(String.raw`\(\s*${W}(?:\s+${DOSE})?\s*(?:vs\.?|versus|minus|-|−|–|\/)\s*${W}`, 'g'),
    new RegExp(String.raw`\b${W}(?:\s+${DOSE})?\s+(?:vs\.?|versus|compared\s+with|than|minus)\s+${W}\b`, 'g'),
    new RegExp(String.raw`\b${W}(?:\s+${DOSE})?(?:\s+(?:Q\dW|once\s+(?:weekly|daily)|every\s+\d+\s+weeks))?(?:\s*\+\s*Metformin)?\s*\(?\s*N\s*=`, 'g'),
    new RegExp(String.raw`\b${W}(?:\s+${DOSE})?:?\s+\d+(?:[.,]\d+)?\s*(?:\(|\[|%|vs)`, 'g'),
    new RegExp(String.raw`(?:%|\)|months|kg)\s+(?:with|on|for)\s+${W}\b`, 'g'),
    new RegExp(String.raw`\d\s*%?\s*\(\s*${W}(?:\s+${DOSE})?\s*\)`, 'g'),
    new RegExp(String.raw`\b(?:occurred|died|deaths?)\s+(?:with|on)\s+${W}\b`, 'g'),
    new RegExp(String.raw`\b(?:of|in)\s+${W}(?:\s+${DOSE})?\s+(?:and|vs)\s+\d`, 'g'),
    new RegExp(String.raw`\b\d+(?:\s*\(\s*\d+(?:[.,]\d+)?\s*%?\s*\))?\s+(?:to\s+)?${W}\b(?=(?:\s+${DOSE})?\s*(?:,|;|and\b|\)|vs|patients|subjects))`, 'g'),
    new RegExp(String.raw`\b(?:Pooled|All)\s+${W}\b`, 'g'),
    new RegExp(String.raw`[(;,]\s*${W}(?:\s+${DOSE})?:?\s+\d`, 'g'),
    new RegExp(String.raw`\b(?:to|or)\s+${W}(?:\s+${DOSE})?\s*\(\s*n\s*=`, 'gi'),
    new RegExp(String.raw`:\s*${W}(?:\s+${DOSE})?\s+(?:or|and)\s+${W}\b`, 'g'),
    new RegExp(String.raw`\bof\s+${W}(?:\s+${DOSE})?\s+(?:subjects|patients|participants)\b`, 'g'),
    new RegExp(String.raw`\b${W}(?:\s+${DOSE})?\s*,\s*n\s*=`, 'g'),
    new RegExp(String.raw`\b\d+\s+(?:to|on)\s+${W}\b`, 'g'),
    new RegExp(String.raw`\b${W}(?:\s+${DOSE})?(?:\s+once\s+(?:weekly|daily))?\s+(?:and|or)\s+(?:matching\s+)?(placebo)\b`, 'gi'),
    new RegExp(String.raw`\bwith\s+${W}\s+(?:than|compared|versus|vs)\b`, 'g'),
    new RegExp(String.raw`\b(?:than|compared\s+with|versus|vs\.?|relative\s+to)\s+(?:with\s+)?${W}\b`, 'g'),
    new RegExp(String.raw`\btreatment\s+with\s+${W}\b`, 'g'),
    new RegExp(String.raw`\b${W}\s+(?:reduced|demonstrated|was\s+superior|significantly\s+prolonged)\b`, 'g'),
    new RegExp(String.raw`\bfor\s+${W}(?:\s+${DOSE})?\s*\(`, 'g'),
    new RegExp(String.raw`\b${W}(?:\s+${DOSE})?:\s+\d`, 'g'),
    new RegExp(String.raw`\b(?:of|in)\s+(?:the\s+)?${W}(?:\s+${DOSE})?\s+(?:and|or)\s+${W}(?:\s+${DOSE})?\s+(?:groups|arms|subjects|patients)\b`, 'g'),
    // A per-arm split in words: "(two Drug X, one placebo)", "fourteen Drug X patients (4.6%)" (r1 sp-49, sp-59).
    new RegExp(String.raw`[(,;:]\s*${NUMBER_WORDS}\s+${W}(?=\s*(?:,|;|\)|and\b|patients|subjects|participants))`, 'g'),
    new RegExp(String.raw`(?:^|[\s(,;:])${NUMBER_WORDS}\s+${W}(?=\s+(?:patients|subjects|participants)\s*\()`, 'g'),
  ];
  const ENDPOINTISH = /^(?:nausea|vomiting|headache|diarrh\w*|constipation|insomnia|fatigue|pneumonia|sepsis|remission|response|survival|events?|deaths?|subjects|patients|population|safety|efficacy|month|months|weeks?|years?|baseline|change|percent|reduction|those|these|hypoglyc\w*|serious|adverse|discontinuation|interruption|pancreatitis|infection|infections|exposure|duration|median|ratio|difference|estimate|grade|level|total|overall|analysis|cohort|pooled|trough|placebo-treated|treatment-emergent|evaluable|study)$/i;
  for (const re of contexts) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      for (const g of m.slice(1)) {
        if (!g) continue;
        const word = norm(g);
        const key = word.toLowerCase();
        if (NOT_AN_ARM.has(key) || ENDPOINTISH.test(word)) continue;
        // nosemgrep: detect-non-literal-regexp -- `r.re` is a module-constant RegExp in vocabulary.ts; this anchors its own source. `word` is the data, and it is the input, not the pattern
        if (ENDPOINT_ROWS.some((r) => new RegExp(`^(?:${r.re.source})$`, 'i').test(word))) continue;
        if (/^(?:Trial|Study|Studies|Table|Phase|Pool|Part|Week|Month|Level|Grade)$/i.test(word)) continue;
        if (/^[A-Z]{5,}$/.test(word) && /^(?:FEV|HBA|MADRS|RECIST|CTCAE|SMPC|USPI|BICR|NCT|PFS)/.test(word)) continue;
        if (!roster.has(key)) roster.set(key, { drug: key, doses: new Set(), control: CONTROL_WORDS.test(key) });
      }
    }
  }
  // Doses written with each arm.
  for (const arm of roster.values()) {
    // nosemgrep: detect-non-literal-regexp -- the key goes through rosterKeyPattern above, so it is metacharacter-escaped; pinned by __tests__/roster-key-pattern.test.ts
    const re = new RegExp(String.raw`\b${rosterKeyPattern(arm.drug)}\s+(${DOSE})`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) arm.doses.add(doseKey(m[1]));
  }
  return roster;
}

/** "20 mg/day" ≡ "20 mg": the daily regimen is the dose (lu-29). */
export function doseKey(d: string): string {
  return d.toLowerCase().replace(/\s+/g, '').replace(',', '.').replace(/\/day$/, '');
}

function armSource(roster: Map<string, RosterArm>): string {
  const heads = [...roster.keys()]
    .sort((a, b) => b.length - a.length)
    .map(rosterKeyPattern);
  const words = heads.length ? heads.join('|') : 'placebo';
  return String.raw`(?:${words})(?:\s+${DOSE})?(?:\s+(?:once\s+weekly|once\s+daily|Q\dW|every\s+\d+\s+weeks))?(?:\s*\+\s*metformin)?`;
}

/** An arm phrase as written → its reference. */
export function armRef(phrase: string, doc: DocInfo): ArmRef | null {
  const p = norm(phrase).replace(/\s*\(\s*N\s*=\s*[\d,. ]+\)\s*$/i, '').replace(/\s+N\s*=\s*[\d,. ]+\s*%?$/i, '');
  if (/^(?:all|any|both|each|the\s+two)\b/i.test(p) && !/^All\s+\w/.test(p)) return null;
  const combined =
    /^(?:the\s+)?pooled\s+(\S+)\s+dose\s+groups$/i.exec(p) ??
    /^(\S+)\s+total$/i.exec(p) ??
    /^All\s+(\S+)$/i.exec(p);
  if (combined) {
    const drug = combined[1].toLowerCase();
    if (doc.roster.has(drug)) return { kind: 'combined', drug, doses: 'all', label: p };
  }
  const listed = /^(\S+(?:\s+[A-Z])?)\s*\((\d+\s*mg)\s+and\s+(\d+\s*mg)\s+combined\)$/i.exec(p);
  if (listed) {
    return { kind: 'combined', drug: listed[1].toLowerCase(), doses: [doseKey(listed[2]), doseKey(listed[3])].sort().join('+'), label: p };
  }
  // nosemgrep: detect-non-literal-regexp -- the keys go through rosterKeyPattern, so they are metacharacter-escaped; this line LACKED that escape until 2026-10-13 and the rule was right to flag it
  const m = new RegExp(String.raw`^(?:the\s+)?(${[...doc.roster.keys()].sort((a, b) => b.length - a.length).map(rosterKeyPattern).join('|') || 'placebo'})(?:\s+(${DOSE}))?`, 'i').exec(p);
  if (!m) return null;
  const drug = m[1].toLowerCase().replace(/\s+/g, ' ');
  return m[2] ? { kind: 'arm', drug, dose: doseKey(m[2]), label: p } : { kind: 'arm', drug, label: p };
}

/**
 * Words this engine's forms read, for joining a word hyphenated across a line break. A compound broken at its own
 * hyphen ("placebo-\ncontrolled") joins to nothing in this list and is left exactly as written.
 */
const JOINED_WORDS = new Set(
  (
    'adverse serious severe randomised randomized randomisation randomization hazard ratio patients subjects participants ' +
    'placebo discontinued discontinuation discontinuations withdrawal withdrawals incidence population populations treatment ' +
    'treatments confidence interval intervals progression survival difference differences exposure mortality analysis analyses ' +
    'emergent reported treated events event reactions reaction percentage proportion baseline secondary primary efficacy safety ' +
    'infection infections interquartile cumulative exposure-adjusted median geometric evaluable interruption reduction'
  ).split(' '),
);

/**
 * End-of-line hyphenation, which survives PDF and Word extraction constantly: "serious ad-\nverse events", "the
 * hazard ra-\ntio was 0.76", "patients were ran-\ndomised". The halves are joined only when the joined word is one
 * the forms read, and the replacement is the same length as the text it replaces, so every offset into the source is
 * unchanged and every quote still cites the source faithfully (r2 pv-hyphenation-across-line-break-*).
 */
export function dehyphenate(text: string): string {
  return text.replace(/([A-Za-z]{2,})-[ \t]*\r?\n[ \t]*([A-Za-z]{2,})/g, (whole, a: string, b: string) => {
    const joined = `${a}${b}`;
    return JOINED_WORDS.has(joined.toLowerCase()) ? `${joined}${' '.repeat(whole.length - joined.length)}` : whole;
  });
}

export function analyseDocument(source: ClaimSource, record: ReadonlyArray<readonly string[]> = []): DocInfo {
  const text = dehyphenate(source.text);
  const masks = masksOf(text);
  const convention = detectConvention(blankMasks(text, masks));
  const aliasOf = mergeAliases([...record.map((r) => [...r]), ...juxtaposed(text)]);
  const roster = rosterOf(text);
  const doc: DocInfo = {
    id: source.id,
    role: source.role,
    text,
    masks,
    convention,
    aliasOf,
    roster,
    armSrc: armSource(roster),
    allRandomized: new Set(),
    lsMeans: /\b(?:changes\s+and\s+)?differences\s+from\s+placebo\s+are\s+least\s+squares\s+means\b/i.test(text),
    endpointAssessor: new Map(),
    singleArm:
      [...roster.values()].filter((a) => !a.control).length <= 1 &&
      ![...roster.values()].some((a) => a.control) &&
      !/\b(?:placebo|comparator|vehicle|standard\s+of\s+care|control\s+(?:arm|group)|versus|vs\.?)\b/i.test(text),
  };
  // "Unless otherwise stated, all confidence intervals are two-sided 95% intervals"; "All CIs are 95% two-sided."
  const conv =
    /\ball\s+(?:confidence\s+intervals|credible\s+intervals|CIs|CrIs)\s+(?:are|were)\s+(?:presented\s+as\s+)?(?:(two|one)-sided\s+)?(\d+(?:[.,]\d+)?)\s?%(?:\s+(?:(two|one)-sided))?/i.exec(text);
  if (conv) {
    const sided = (conv[1] ?? conv[3])?.toLowerCase() as 'one' | 'two' | undefined;
    doc.ciDefault = { level: conv[2].replace(',', '.'), ...(sided ? { sided } : {}), kind: /credible|CrI/i.test(conv[0]) ? 'credible' : 'confidence' };
  }
  // "The intent-to-treat population includes all randomized patients."
  const def = /\b(intent(?:ion)?[\s-]to[\s-]treat|ITT|full\s+analysis\s+set|FAS)(?:\s*\([A-Z]+\))?\s+population\s+(?:includes|included|comprised|comprises|consisted\s+of|is)\s+all\s+randomi[sz]ed\b/gi;
  let m: RegExpExecArray | null;
  while ((m = def.exec(text)) !== null) doc.allRandomized.add(/full|FAS/i.test(m[1]) ? 'fas' : 'itt');
  // "… outcome measures were ORR and DOR as assessed by BICR …": the assessor of each named endpoint.
  const decl = /\b(?:major|primary|key)?\s*(?:efficacy\s+)?outcome\s+measures?\s+(?:was|were)\s+([^.]{0,200}?)\s+as\s+assessed\s+by\s+(blinded\s+independent\s+central\s+review|BICR|the\s+investigator|investigator)/gi;
  while ((m = decl.exec(text)) !== null) {
    const who = /investigator/i.test(m[2]) ? 'investigator' : 'bicr';
    for (const row of ENDPOINT_ROWS) {
      row.re.lastIndex = 0;
      if (row.re.test(m[1])) doc.endpointAssessor.set(row.id, who);
    }
  }
  // The single study of the source.
  const ids = new Set<string>();
  STUDY_CODE.lastIndex = 0;
  while ((m = STUDY_CODE.exec(text)) !== null) if (isStudyCode(m[0])) ids.add(m[0]);
  DESIGNATION.lastIndex = 0;
  while ((m = DESIGNATION.exec(text)) !== null) {
    if (m[1] === 'Trial' || m[1] === 'Study') {
      const d = `${m[1]} ${m[2]}`;
      if (aliasOf.has(d)) ids.add(d);
    }
  }
  const sets = new Map<string, string[]>();
  for (const id of ids) {
    const set = aliasOf.get(id) ?? [id];
    sets.set(set.join('|'), set);
  }
  POOL_MARKER.lastIndex = 0;
  const pooled = POOL_MARKER.test(text.replace(/Integrated\s+Summary\s+of\s+(?:Safety|Efficacy)[^.\n]*?\(Study\s+[A-Z]{1,5}-\d+[^)]*\)/g, ''));
  if (sets.size === 1 && !pooled) doc.docStudy = { kind: 'study', aliases: [...sets.values()][0] };
  // A single trial-duration adjective: "a 26-week, placebo-controlled trial".
  const soft = [...text.matchAll(/\b(?:a|two|three)\s+(\d+)-week,?\s+(?:randomi[sz]ed,?\s+)?(?:double-blind,?\s+)?placebo-controlled\s+trials?\b/gi)].map((x) => x[1]);
  if (soft.length > 0 && new Set(soft).size === 1) doc.softPeriod = `through:w${soft[0]}`;
  return doc;
}

/** The alias set of a written identifier. */
export function aliasesOf(id: string, doc: DocInfo): string[] {
  const k = norm(id);
  return doc.aliasOf.get(k) ?? [k];
}

export const isControlArm = (a: ArmRef | undefined, doc: DocInfo): boolean =>
  !!a && a.kind === 'arm' && (CONTROL_WORDS.test(a.drug) || doc.roster.get(a.drug)?.control === true);
