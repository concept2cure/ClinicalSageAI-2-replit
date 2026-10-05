/**
 * In-text references — find every "Section 9.7.1", "§12.2.2", "Table 14.3.1.2",
 * "Figure 14.2.1", "Listing 16.2.7", "Appendix 16.1.9" and "Module 2.7.4" in a
 * passage, and say whether each one resolves.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Until 2026-10-05 grounding-core counted any "Table|Figure|Appendix <digit>"
 * or "Section|§ <digit>" token as a citation and never resolved it. The
 * precision gate's critical grounding dimension was therefore satisfied by a
 * reference that does not exist: 'TEAEs occurred in 45% (54/120) of patients
 * (Table 14.9.99).' raised no grounding finding in a CSR, although ICH E3 §14
 * holds only 14.1, 14.2 and 14.3 (g-in-text-reference-resolution). An invented
 * table grounded an invented number.
 *
 * ── The three outcomes ───────────────────────────────────────────────────────
 *   resolved                   the target exists in the tree or captions it was
 *                              checked against;
 *   unresolved                 the tree or captions it must be in do not hold it;
 *   not-resolvable-from-input  nothing this module can see decides it — a
 *                              reference into another document, a statute, or
 *                              sponsor numbering with no captions supplied. An
 *                              honest notice, never a finding of absence.
 *
 * ── What resolves against what ───────────────────────────────────────────────
 *   • A qualified reference is never judged against this document's tree:
 *     "21 CFR § 312.32", "protocol Section 9.12", "Section 4 of the SAP",
 *     "CSR ABC-001 Section 12.2", "ICH E9 Section 5", "Section 505(b)(2)".
 *     The document word may carry an id, version, amendment or edition, or up
 *     to three modifiers, on either side: "Protocol ABC-001, Section 9.12",
 *     "SAP (version 3.0), Section 9.12", "IB Edition 5, Section 9.12",
 *     "Section 9.12 of the Study 201 protocol", "Section 9.12 of the final
 *     SAP", "Study 201 CSR Table 14.4.1", "the CSR for Study 201, Section 9.12".
 *     Protocol and SAP numbering is the sponsor's, and a CSR cites it often
 *     (fix round 2: each of these was a false critical finding).
 *   • A coordinated reference of the same kind shares its neighbour's document
 *     ("Section 9.12 of the protocol and Section 9.13"; "Sections 9.12 and
 *     9.13 of the SAP"; "Section 9.12, 9.13 of the SAP").
 *   • A protocol, SAP, IB or other CSR named earlier in the same sentence,
 *     not next to the reference ("In the protocol, the primary analysis
 *     (Section 9.12) …"), makes the attribution ambiguous: a notice, never a
 *     finding. "per-protocol population" and "protocol deviations" use the
 *     word without naming the document and do not count.
 *   • In a CSR, "the CSR" / "this CSR" / "the clinical study report" with no
 *     study id or modifier is this document, not another one.
 *   • Captions or headings the caller passes resolve a matching reference.
 *     Only `knownCaptions` is a complete list whose absence decides anything;
 *     `knownHeadings` (a document's section titles) resolves a match and is
 *     otherwise silent — one title "Table 1 Demographics" is not a caption list.
 *   • In a CSR, Section/§ numbers in E3's §1–§16, Table/Figure 14.x, and
 *     Listing/Appendix 16.x walk the canonical E3 tree
 *     (server/services/ind/ctd/csr-e3-guidance.ts): resolved when E3 has the
 *     number, or when its nearest E3 ancestor is a heading E3 does not
 *     subdivide (14.3.1.2 under 14.3.1 is sponsor numbering). A Section number
 *     missing from a subdivided heading is unresolved (9.12 — §9 ends at 9.8).
 *     A Table/Figure/Listing/Appendix number is unresolved only when its
 *     nearest E3 ancestor is §14 or §16 itself (14.9.99, 16.7); beyond the
 *     children of a sub-heading (14.3.5.1, 16.2.9, 16.1.13) it is sponsor TFL
 *     numbering — E3 is a guideline, not a template (E3 Q&A (R1)) — which the
 *     text cannot confirm: a notice, never a finding.
 *     Known limitation: a sponsor TFL section directly under §14 beyond 14.3
 *     (14.4 PK tables is common practice) cannot be told apart from an invented
 *     14.9.99 by structure, so it is unresolved unless the report's TFL
 *     captions are passed as `knownCaptions` (or a matching heading as
 *     `knownHeadings`); the finding's reason says so. AnA's critique tools do
 *     not forward captions yet (needs_elsewhere of this step).
 *   • "Module x.y" walks the CTD authoring registry behind
 *     getCtdAuthoringGuidance (server/services/ind/ctd/index.ts) — exact or a
 *     parent of registered codes; never its descendant fallback, which would
 *     resolve a parent request to any child. A code below a registry leaf
 *     (2.7.4.99, 3.2.P.2.1) is not checked — M4 subdivides some leaves and
 *     leaves others to the sponsor — so it is a notice, not 'resolved'.
 *     A gap is unresolved only under a heading whose registered children are
 *     all of ICH M4's (CTD_M4_CHILD_COUNT); elsewhere the registry is known to
 *     be short — 2.5 stops at 2.5.6 though M4E has 2.5.7 Literature
 *     References; 2.1, 3.1, 3.3 and 4.1 are not registered — and the gap is not
 *     resolvable. Module 1 is regional and never checked.
 *   • Sponsor numbering ("Table 3", "Table 11-1") resolves only against passed
 *     captions; unresolved only when `knownCaptions` of that kind were passed
 *     and none matches.
 *
 * Pure and deterministic: no DB, no I/O, no model.
 *
 * @module server/services/ana/in-text-references
 */

import {
  e3Children,
  e3ParentNumber,
  getE3Section,
  listCtdGuidanceCodes,
} from '../ind/ctd/index.js';
import { getDocumentTypeStandard } from './medical-writing';

export type ReferenceKind = 'Section' | 'Table' | 'Figure' | 'Listing' | 'Appendix' | 'Module';

export type ReferenceStatus = 'resolved' | 'unresolved' | 'not-resolvable-from-input';

export interface InTextReference {
  kind: ReferenceKind;
  /** The cited number as written ("14.3.1.2", "11-1", "3.2.S.4.1"). */
  number: string;
  /** "Table 14.3.1.2"; § is labelled Section. */
  label: string;
  /** The text matched. */
  raw: string;
  /** Offset of `raw` in the passage. */
  index: number;
  /** The words that place the target in another document or instrument, or null. */
  qualifier: string | null;
  /**
   * True when `qualifier` is a document named earlier in the sentence rather
   * than next to the reference: the reference may point there, so it is never
   * judged against this document's tree.
   */
  qualifierInferred: boolean;
}

export interface ClassifiedReference extends InTextReference {
  status: ReferenceStatus;
  /** Why, in words a writer can act on. */
  reason: string;
}

export interface ReferenceContext {
  /** The document the passage belongs to (medical-writing.ts DOCUMENT_TYPES id or alias). */
  documentType?: string;
  /**
   * The document's captions, as a complete list: "Table 7: AEs by SOC". A
   * Table/Figure/Listing/Appendix reference of a kind present here that matches
   * none of them is unresolved.
   */
  knownCaptions?: readonly string[];
  /**
   * Headings or titles that resolve a reference they match ("9.12 Additional
   * analyses") but are not a complete caption list: absence from them decides
   * nothing.
   */
  knownHeadings?: readonly string[];
}

const KEYWORD: Record<string, ReferenceKind> = {
  section: 'Section',
  table: 'Table',
  figure: 'Figure',
  listing: 'Listing',
  appendix: 'Appendix',
  module: 'Module',
};

/** Numbers: 14.3.1.2, 11-1, 3.2.S.4.1 (single-letter CTD parts). */
const NUMBER = String.raw`\d+(?:\.(?:\d+|[A-Za-z](?![A-Za-z])))*(?:-\d+(?:\.\d+)*)?`;
const REFERENCE_RE = new RegExp(
  String.raw`(?:\b(Section|Table|Figure|Listing|Appendix|Module)s?\b|(§§?))\s*(${NUMBER})`,
  'gi',
);
const CAPTION_RE = new RegExp(
  String.raw`^\s*(?:(Section|Table|Figure|Listing|Appendix|Module)\b\s*|(§§?)\s*)?(${NUMBER})(?=[\s.:–—)]|$)`,
  'i',
);

/** Named documents and instruments a reference can point into (case-sensitive acronyms). */
const DOC_ACRONYM = String.raw`(?:SAP|IB|USPI|SmPC|DSUR|PBRER|PSUR|RMP|ISS|ISE|IND|NDA|BLA|MAA|CFR|U\.S\.C\.|USC|ICH\s*[EMQS]\s?\d+[A-Z]?(?:\s*\(R\d\))?|(?:FD&C|PHS|[A-Z][\w&]*)\s+Act)`;
/** The same, as words (case-insensitive). */
const DOC_WORD = String.raw`(?:protocol|statistical analysis plan|investigator['’]?s brochure|clinical study report|CSR|guidance|guideline|label(?:ing|ling)?|directive|regulation|annex)`;
const ACRONYM_RE = new RegExp(String.raw`\b${DOC_ACRONYM}(?![\w&])`, 'g');
const WORD_RE = new RegExp(String.raw`\b${DOC_WORD}\b`, 'gi');

/**
 * Documents a CSR sentence cites by section number. A mention of one earlier in
 * the sentence makes an unqualified reference ambiguous ("In the protocol, the
 * primary analysis (Section 9.12) …"). "per-protocol population", "protocol
 * deviations" and "protocol-specified" use the word without naming the document.
 */
const SECTIONED_DOC_RE =
  /(?<!per[\s-])\b(?:[Pp]rotocol(?![\s-]+(?:deviations?|violations?|population|set|defined|specified|required|visits?|procedures?|schedule|therapy|treatment)\b)(?!-)|[Ss]tatistical [Aa]nalysis [Pp]lan|SAP|IB|[Ii]nvestigator['’]?s [Bb]rochure|CSR|[Cc]linical [Ss]tudy [Rr]eport)\b/g;

/** "abc" → "[aA][bB][cC]": word lists that must not make the acronyms case-insensitive. */
const ci = (words: string) => `(?:${words.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`)})`;
/** An identifier: carries a digit ("201", "ABC-001", "v2.0", "2.0"); never a percentage. */
const ID = String.raw`(?:[A-Za-z][A-Za-z-]*)?\d(?:[\w\-/]|\.(?=\w))*(?![\w%])`;
/** An identifier that starts with a letter ("ABC-001", "v2"): a bare count is not one. */
const LETTER_ID = String.raw`[A-Za-z][A-Za-z-]*\d(?:[\w\-/]|\.(?=\w))*(?![\w%])`;
/**
 * Words that name which document of a kind ("the Study 201 CSR", "the Phase 2
 * protocol", "the final SAP"). Up to three may sit before the document word.
 */
const MODIFIER = String.raw`(?:${ci('study|trial|phase|final|clinical|original|amended|current|approved|latest|initial|global|master|core|pivotal|parent|updated|revised|interim|draft|signed|integrated|corresponding|relevant|applicable')}|${ID}|(?:I{1,3}|IV|V|VI{1,3})[ab]?)`;
const PRE_MODIFIERS = new RegExp(String.raw`(?:^|[\s(])((?:${MODIFIER}\s+){1,3})$`);
/**
 * What may follow a document word before the reference and still say which
 * document it is: "ABC-001", "Amendment 2", "v2.0", "version 2.0", "(version
 * 3.0)", "Edition 5", "Part 312", "for Study 201".
 */
const KEYWORD_ITEM = String.raw`(?:${ci('amendment|edition|ed\\.|version|ver\\.|no\\.|part')}\s*${ID}|${ci('for')}\s+(?:${ci('study|trial')}\s+)?${ID})`;
const SUFFIX_ITEM = String.raw`(?:${KEYWORD_ITEM}|${ID})`;
const PRE_FILLER = new RegExp(String.raw`^(?:['’]s)?(?:[\s,:()]*${SUFFIX_ITEM})*[\s,:()]*(?:${ci('see')}\s+)?$`);
const POST_SUFFIX = new RegExp(String.raw`^(?:\s*,?\s*\(?${SUFFIX_ITEM}\)?)*`);
/** After a document named mid-sentence, a bare number is the sentence's data, not an id. */
const INFERRED_SUFFIX = new RegExp(String.raw`^(?:\s*,?\s*\(?(?:${KEYWORD_ITEM}|${LETTER_ID})\)?)*`);
// "Section 9.12, 9.13 of the SAP": the listed numbers share the document.
const POST_LEAD = new RegExp(String.raw`^(?:\s*(?:,|and|or|to|[–—-])\s*\d+(?:\.\d+)*)*\s*,?\s*(?:${ci('of|in|from')})\s+(?:${ci('the|that')}\s+)?((?:${MODIFIER}\s+){0,3})$`);
const POST_SELF = /^\s*(?:of|in)\s+(?:this|the present)\s+(?:report|CSR|document|clinical study report)\b/i;
/** "Section 505(b)(2)": statutory subsection numbering, not a document heading. */
const STATUTE_TAIL = /^\([a-z0-9]{1,4}\)/i;
/** A sentence or clause ends here: ". " before a capital, ";" or a line break. */
const CLAUSE_END = /[.!?](?=\s+["“([]?[A-Z])|[;\n]/g;

interface Mention {
  start: number;
  end: number;
}

function mentionsIn(text: string, ...res: RegExp[]): Mention[] {
  const out: Mention[] = [];
  for (const re of res) {
    for (const m of text.matchAll(re)) out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

function tidy(q: string): string {
  let t = q.replace(/^[\s,:(]+|[\s,:(]+$/g, '').replace(/\s*\(\s*/g, ' (').replace(/\s+/g, ' ').trim();
  // "(per the protocol) Section 9.12": drop a closing parenthesis the qualifier never opened.
  while (t.endsWith(')') && (t.match(/\(/g)?.length ?? 0) < (t.match(/\)/g)?.length ?? 0)) t = t.slice(0, -1).trim();
  return t;
}

/** "Study 201 " before a document word: part of which document it is. */
function preModifiers(before: string): string {
  return PRE_MODIFIERS.exec(before)?.[1] ?? '';
}

interface Qualifier {
  text: string;
  /** True when the document was named earlier in the sentence, not next to the reference. */
  inferred: boolean;
}

function qualifierOf(text: string, start: number, end: number): Qualifier | null {
  // ── Before: "Protocol ABC-001, Section 9.12", "Study 201 CSR Table 14.4.1".
  const from = Math.max(0, start - 160);
  let before = text.slice(from, start);
  let clauseStart = 0;
  for (const m of before.matchAll(CLAUSE_END)) clauseStart = (m.index ?? 0) + m[0].length;
  before = before.slice(clauseStart);
  const adjacent = mentionsIn(before, ACRONYM_RE, WORD_RE)
    .filter((m) => PRE_FILLER.test(before.slice(m.end)))
    .sort((a, b) => a.start - b.start)[0];
  if (adjacent) {
    const mods = preModifiers(before.slice(0, adjacent.start));
    const span = before.slice(adjacent.start).replace(/[\s,:(]*(?:see\s+)?$/i, '');
    return { text: tidy(mods + span), inferred: false };
  }

  // ── After: "Section 9.12 of the Study 201 protocol", "… of the CSR for Study 201".
  const after = text.slice(end, end + 100);
  if (POST_SELF.test(after)) return null;
  const post = mentionsIn(after, ACRONYM_RE, WORD_RE)
    .sort((a, b) => a.start - b.start)
    .find((m) => POST_LEAD.test(after.slice(0, m.start)));
  if (post) {
    const mods = POST_LEAD.exec(after.slice(0, post.start))?.[1] ?? '';
    const suffix = POST_SUFFIX.exec(after.slice(post.end))?.[0] ?? '';
    return { text: tidy(mods + after.slice(post.start, post.end) + suffix), inferred: false };
  }
  if (STATUTE_TAIL.test(after)) return { text: 'statutory subsection', inferred: false };

  // ── Same sentence, not adjacent: "In the protocol, the primary analysis (Section 9.12) …".
  const named = mentionsIn(before, SECTIONED_DOC_RE).sort((a, b) => b.start - a.start)[0];
  if (named) {
    const mods = preModifiers(before.slice(0, named.start));
    const suffix = INFERRED_SUFFIX.exec(before.slice(named.end))?.[0] ?? '';
    return { text: tidy(mods + before.slice(named.start, named.end) + suffix), inferred: true };
  }
  return null;
}

/** "and", "or", "to", ",", "–" between two references of one kind. */
const COORDINATOR = /^(?:\s*,\s*(?:and|or)\s+|\s+(?:and|or|and\/or|to|through)\s+|\s*,\s*|\s*[–—-]\s*)$/i;
/** The gap after a reference qualified from behind ("of the protocol"), up to the coordinator. */
const POST_QUALIFIED_GAP = /^\s*,?\s*(?:of|in|from)\s+[^.;()]{1,60}?(?:\s*,\s*(?:and|or)\s+|\s+(?:and|or|and\/or|to|through)\s+|\s*,\s*)$/i;

function toReference(m: RegExpMatchArray, source: string): InTextReference {
  const kind: ReferenceKind = m[1] ? KEYWORD[m[1].toLowerCase()] : 'Section';
  // Letter parts (3.2.S.4) belong to CTD codes only; "Table 3.A total" is Table 3.
  const number = kind === 'Module' ? m[3] : (/^\d+(?:\.\d+)*(?:-\d+(?:\.\d+)*)?/.exec(m[3])?.[0] ?? m[3]);
  const index = m.index ?? 0;
  const raw = m[0].slice(0, m[0].length - m[3].length) + number;
  const q = qualifierOf(source, index, index + raw.length);
  return {
    kind,
    number,
    label: `${kind} ${number}`,
    raw,
    index,
    qualifier: q?.text ?? null,
    qualifierInferred: q?.inferred ?? false,
  };
}

const explicit = (r: InTextReference) => r.qualifier !== null && !r.qualifierInferred;
const gapBetween = (source: string, a: InTextReference, b: InTextReference) =>
  source.slice(a.index + a.raw.length, b.index);

/**
 * "Section 9.12 of the protocol and Section 9.13": the second shares the first's
 * document; "Section 9.12 and Section 9.13 of the SAP": the first shares the second's.
 */
function shareCoordinatedQualifiers(refs: InTextReference[], source: string): InTextReference[] {
  const out = [...refs];
  for (let i = 1; i < out.length; i++) {
    const [a, b] = [out[i - 1], out[i]];
    if (a.kind !== b.kind || !a.qualifier || explicit(b)) continue;
    const gap = gapBetween(source, a, b);
    if (COORDINATOR.test(gap) || POST_QUALIFIED_GAP.test(gap)) {
      out[i] = { ...b, qualifier: a.qualifier, qualifierInferred: a.qualifierInferred };
    }
  }
  for (let i = out.length - 2; i >= 0; i--) {
    const [a, b] = [out[i], out[i + 1]];
    if (a.kind !== b.kind || explicit(a) || !b.qualifier) continue;
    if (COORDINATOR.test(gapBetween(source, a, b))) {
      out[i] = { ...a, qualifier: b.qualifier, qualifierInferred: b.qualifierInferred };
    }
  }
  return out;
}

/** Every in-text reference in `text`, in order. */
export function extractInTextReferences(text: string): InTextReference[] {
  const source = String(text ?? '');
  return shareCoordinatedQualifiers(
    [...source.matchAll(REFERENCE_RE)].map((m) => toReference(m, source)),
    source,
  );
}

interface CaptionLabel {
  kind: ReferenceKind;
  number: string;
}

function captionLabels(captions: readonly string[] | undefined): CaptionLabel[] {
  const out: CaptionLabel[] = [];
  for (const c of captions ?? []) {
    const m = CAPTION_RE.exec(String(c ?? ''));
    if (!m) continue;
    out.push({ kind: m[1] ? KEYWORD[m[1].toLowerCase()] : 'Section', number: m[3] });
  }
  return out;
}

const sameNumber = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// ── Tree walk shared by E3 and CTD ───────────────────────────────────────────

interface Tree {
  has(code: string): boolean;
  parent(code: string): string | null;
  children(code: string): string[];
}

type Walk =
  | { status: 'resolved'; below?: string }
  | { status: 'unresolved'; nearest: string | null; siblings: string[] };

function walk(tree: Tree, code: string): Walk {
  if (tree.has(code)) return { status: 'resolved' };
  let p = tree.parent(code);
  while (p !== null && !tree.has(p)) p = tree.parent(p);
  if (p === null) return { status: 'unresolved', nearest: null, siblings: [] };
  const kids = tree.children(p);
  // Below a heading the tree does not subdivide: the sponsor's own numbering.
  if (kids.length === 0) return { status: 'resolved', below: p };
  return { status: 'unresolved', nearest: p, siblings: kids };
}

const E3_TREE: Tree = {
  has: (n) => getE3Section(n) !== undefined,
  parent: (n) => e3ParentNumber(n),
  children: (n) => e3Children(n).map((s) => s.number),
};

function ctdSegments(code: string): string[] {
  return code.split('.').map((s) => (/^[a-z]$/i.test(s) ? s.toUpperCase() : s));
}

/**
 * How many headings ICH M4 (M4Q, M4S, M4E) puts directly under each CTD heading
 * the authoring registry subdivides. A gap under a heading is a finding only
 * when the registry holds all of them; otherwise the registry, not the
 * reference, may be what is short. Basis: recall of ICH M4 / M4Q(R1) / M4S(R2)
 * / M4E(R2) — g-in-text-reference-resolution-facts.md row 5. When the registry
 * gains 2.5.7, 2.5 becomes complete with no change here.
 */
const CTD_M4_CHILD_COUNT: Readonly<Record<string, number>> = {
  '2': 7, // 2.1 TOC … 2.7 Clinical Summary
  '2.3': 4, // 2.3.S, 2.3.P, 2.3.A, 2.3.R
  '2.5': 7, // 2.5.1 … 2.5.7 Literature References
  '2.6': 7,
  '2.7': 6,
  '3': 3, // 3.1 TOC, 3.2 Body of Data, 3.3 Literature References
  '3.2': 4, // S, P, A, R
  '3.2.S': 7,
  '3.2.S.2': 6,
  '3.2.S.3': 2,
  '3.2.S.4': 5,
  '3.2.P': 8,
  '3.2.P.3': 5,
  '3.2.P.5': 6,
  '4': 3, // 4.1 TOC, 4.2 Study Reports, 4.3 Literature References
  '4.2': 3,
  '4.2.1': 4,
  '4.2.2': 7,
  '4.2.3': 7,
  '5': 4, // 5.1 TOC … 5.4 Literature References
  '5.3': 7,
  '5.3.5': 4,
};

let ctdNodes: Set<string> | null = null;
function ctdTree(): Tree {
  if (!ctdNodes) {
    ctdNodes = new Set<string>();
    for (const code of listCtdGuidanceCodes()) {
      const segs = ctdSegments(code);
      for (let i = 1; i <= segs.length; i++) ctdNodes.add(segs.slice(0, i).join('.'));
    }
  }
  const nodes = ctdNodes;
  const parent = (c: string) => {
    const i = c.lastIndexOf('.');
    return i === -1 ? null : c.slice(0, i);
  };
  return {
    has: (c) => nodes.has(c),
    parent,
    children: (c) => [...nodes].filter((n) => parent(n) === c),
  };
}

// ── Classification ───────────────────────────────────────────────────────────

function isCsr(documentType: string | undefined): boolean {
  if (!documentType?.trim()) return false;
  return getDocumentTypeStandard(documentType)?.id === 'csr';
}

/**
 * Inside a CSR, "the CSR" / "this CSR" with no study id or modifier names this
 * document. "Study 201 CSR", "the Phase 2 CSR", "the CSR for Study 201" and
 * "CSR ABC-001" carry one and are another document.
 */
function isSelfInCsr(qualifier: string | null): boolean {
  return (
    qualifier !== null && /^(?:(?:the|this|the present)\s+)?(?:CSR|clinical study report)(?:['’]s)?$/i.test(qualifier.trim())
  );
}

const result = (ref: InTextReference, status: ReferenceStatus, reason: string): ClassifiedReference => ({
  ...ref,
  status,
  reason,
});

function classifyModule(ref: InTextReference): ClassifiedReference {
  const code = ctdSegments(ref.number.replace(/-.*/, '')).join('.');
  if (ref.number.includes('-')) {
    return result(ref, 'not-resolvable-from-input', `"${ref.number}" is not a CTD section code.`);
  }
  if (code.split('.')[0] === '1') {
    return result(ref, 'not-resolvable-from-input', 'Module 1 is regional; its headings depend on the region and are not checked here.');
  }
  const w = walk(ctdTree(), code);
  if (w.status === 'resolved') {
    // Below a registry leaf nothing was checked: M4 subdivides some leaves
    // (2.7.4 runs 2.7.4.1–2.7.4.7) and leaves others to the sponsor (per-study
    // entries under 5.3.5.x). 'resolved' would claim a target nobody looked at.
    return w.below
      ? result(
          ref,
          'not-resolvable-from-input',
          `The CTD authoring registry does not subdivide CTD ${w.below}, so whether ${code} exists below it is not checked here.`,
        )
      : result(ref, 'resolved', `CTD ${code} is a CTD heading.`);
  }
  if (w.nearest === null) {
    return result(ref, 'unresolved', `The CTD has Modules 1–5; there is no Module ${code.split('.')[0]}.`);
  }
  const m4 = CTD_M4_CHILD_COUNT[w.nearest];
  if (m4 === undefined || w.siblings.length < m4) {
    return result(
      ref,
      'not-resolvable-from-input',
      `The CTD authoring registry holds ${w.siblings.length}${m4 === undefined ? '' : ` of ICH M4's ${m4}`} headings under CTD ${w.nearest} (${w.siblings.join(', ')}), so ${code} cannot be checked here.`,
    );
  }
  return result(
    ref,
    'unresolved',
    `CTD ${w.nearest} has no ${code}: its headings are ${w.siblings.join(', ')}.`,
  );
}

function classifyE3(ref: InTextReference, number: string): ClassifiedReference {
  const w = walk(E3_TREE, number);
  if (w.status === 'resolved') {
    if (w.below) return result(ref, 'resolved', `Below ICH E3 §${w.below}, which E3 does not subdivide (sponsor numbering).`);
    return result(ref, 'resolved', `ICH E3 §${number} ${getE3Section(number)?.title ?? ''}`.trim() + '.');
  }
  if (w.nearest === null) return result(ref, 'unresolved', `ICH E3 has no §${number}.`);
  // Tables, figures, listings and appendices below an E3 sub-heading (14.3,
  // 16.1, 16.2) are the sponsor's TFL numbering — vital signs at 14.3.5, extra
  // listings at 16.2.9. Only a number E3's §14/§16 cannot hold is a finding.
  if (ref.kind !== 'Section' && w.nearest.includes('.')) {
    return result(
      ref,
      'not-resolvable-from-input',
      `ICH E3 §${w.nearest} lists ${w.siblings.join(', ')}; ${number} is sponsor numbering beyond them (E3 is a guideline, not a template), which this text cannot confirm.`,
    );
  }
  // A table directly under §14 beyond 14.3 (14.4 PK tables, 14.9) may be the
  // sponsor's own TFL section. Only the document's TFL captions can say so:
  // passed as knownCaptions they resolve it before this tree is consulted.
  const clear =
    ref.kind === 'Section' ? '' : ` If ${number} is in this report's TFL list, pass its captions as knownCaptions to check against them.`;
  return result(ref, 'unresolved', `ICH E3 §${w.nearest} has no ${number}: its headings are ${w.siblings.join(', ')}.${clear}`);
}

/** In a CSR, the E3 tree decides §1–§16 sections, Table/Figure 14.x and Listing/Appendix 16.x. */
function e3Route(ref: InTextReference, ctx: ReferenceContext): ClassifiedReference | null {
  if (!isCsr(ctx.documentType) || !/^\d+(?:\.\d+)*$/.test(ref.number)) return null;
  const top = Number(ref.number.split('.')[0]);
  const routed =
    (ref.kind === 'Section' && top >= 1 && top <= 16) ||
    ((ref.kind === 'Table' || ref.kind === 'Figure') && top === 14) ||
    ((ref.kind === 'Listing' || ref.kind === 'Appendix') && top === 16);
  return routed ? classifyE3(ref, ref.number) : null;
}

/** Sponsor numbering, or any number no tree decides: only the document's own captions can. */
function captionRoute(ref: InTextReference, captions: CaptionLabel[]): ClassifiedReference {
  const sameKind = ref.kind === 'Section' ? [] : captions.filter((c) => c.kind === ref.kind);
  if (sameKind.length > 0) {
    return result(
      ref,
      'unresolved',
      `None of this document's ${sameKind.length} ${ref.kind.toLowerCase()} caption(s) is ${ref.label} (${sameKind.map((c) => c.number).join(', ')}).`,
    );
  }
  return result(
    ref,
    'not-resolvable-from-input',
    ref.kind === 'Section'
      ? 'No heading of this document or of its standard decides this section number.'
      : `Sponsor numbering: no ${ref.kind.toLowerCase()} captions were supplied to check it against.`,
  );
}

/** Classify one extracted reference against what the caller can see. */
export function classifyInTextReference(input: InTextReference, ctx: ReferenceContext = {}): ClassifiedReference {
  if (input.kind === 'Module') return classifyModule(input);
  const ref = isCsr(ctx.documentType) && isSelfInCsr(input.qualifier) ? { ...input, qualifier: null } : input;
  if (ref.qualifier) {
    return result(
      ref,
      'not-resolvable-from-input',
      ref.qualifier === 'statutory subsection'
        ? 'Statutory subsection numbering, not a heading of this document.'
        : ref.qualifierInferred
          ? `The sentence names ${ref.qualifier} before it, so it may point there rather than into this document; it is not checked against this document's headings.`
          : `It points into ${ref.qualifier}, which is not part of this text.`,
    );
  }
  const captions = captionLabels(ctx.knownCaptions);
  const headings = captionLabels(ctx.knownHeadings);
  if ([...captions, ...headings].some((c) => c.kind === ref.kind && sameNumber(c.number, ref.number))) {
    return result(ref, 'resolved', 'It matches a caption or heading of this document.');
  }
  return e3Route(ref, ctx) ?? captionRoute(ref, captions);
}

/** Extract and classify every in-text reference in `text`. */
export function classifyInTextReferences(text: string, ctx: ReferenceContext = {}): ClassifiedReference[] {
  return extractInTextReferences(text).map((r) => classifyInTextReference(r, ctx));
}
