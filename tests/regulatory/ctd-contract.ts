/**
 * The shared CTD test contract — one copy of the rules every CTD registry test
 * holds a tree to (D2, 2026-10-05, step g-ctd-contract-and-consistency; verified
 * finding 33 step 1; docs/design/ANA_REGULATORY_RECORD.md §9 "Tests and gates",
 * §10, R5).
 *
 * ── Why this is a module and not a test ──────────────────────────────────────
 * Until 2026-10-05 the FDA Module 1 placement rules lived inside
 * fda-module1-numbering.test.ts and the Module 2–5 title checks inside
 * ana-ctd-section-truth.test.ts. A registry neither file enumerated could only
 * be held by copying the rules, and the next registry was found by the next
 * audit. The rules now live here, once; every consistency test imports them:
 *   - tests/regulatory/fda-module1-numbering.test.ts (the FDA Module 1 trees);
 *   - tests/regulatory/ana-ctd-section-truth.test.ts (AnA's prompt copies);
 *   - tests/regulatory/ctd-registry-consistency.test.ts (the contract's pins,
 *     the record's self-checks, the copies that agree today, the mutation);
 *   - tests/regulatory/ctd-registry/<registry>.consistency.test.ts (one per
 *     registry, written failing first by the step that fixes that registry).
 *
 * ── What it holds ────────────────────────────────────────────────────────────
 * Module 1 (FDA): `violationsFor`. Structure (a code is a published FDA
 * heading, an ancestor or a descendant of one), placement (a title naming a
 * well-known document sits under the heading FDA assigns it) and identity (a
 * node AT a heading whose meaning FDA fixes says what it is). Derived from the
 * FDA context-of-use list the eCTD packager also uses (cv-v4-data.ts), so this
 * contract and the packager cannot disagree. Amended 2026-10-05:
 *   - a node naming two or more Module 1 documents may sit at the heading that
 *     holds them all (1.4 "References — letters of authorization / right of
 *     reference"); a node naming ONE document still files at its own heading
 *     ("Investigator's Brochure" at 1.14 stays wrong — the IND workflow defect
 *     of 2026-10-04);
 *   - identity rules for 1.3.2 field copy certification, 1.3.5 patent and
 *     exclusivity and 1.12.14 environmental analysis (the NDA/BLA/ANDA packs
 *     had filed field copy at 1.3.5 and the environmental analysis at 1.19);
 *   - a title with no words beyond its code claims no meaning, so identity
 *     rules skip it (required-set checks pass the code as the title);
 *   - "letters of authorization" (plural) is matched as a letter of
 *     authorization;
 *   - an entry with no code is skipped (it always was; now pinned).
 *
 * Modules 2–5 (ICH): `m2to5Violations` / `checkM2to5`. A code must be a heading
 * of the one ICH M2–M5 record — `CTD_AUTHORING_GUIDANCE` ∪ `ich-m4-headings.ts`,
 * read through `ichHeadingTitle` — and its title must not contradict the
 * record's title. A contradiction is a term from one of `CONTRADICTING_TERMS`
 * that the record's title does not carry, where the record's title carries
 * another term of the same group and the copy carries none of the record's.
 * Extra words are never violations. Module 3 depth the record does not yet
 * model (2.3.S.x, 3.2.S.x.y …; the CMC lane appends it to ich-m4-headings) is
 * reported `unchecked`, never passed and never failed.
 *
 * `registryViolations` applies both to one registered copy (`CtdRegistry`).
 * Module 1 of an EU or JP registry is not held here: there is no FDA meaning to
 * hold it to, and the regional Module 1 record has its own gate.
 */
import { CV_CONTEXT_OF_USE } from '../../server/services/ectd/controlled-vocab/cv-v4-data';
import { ichHeadingTitle } from '../../server/services/ind/ctd/ich-m4-headings';
import { normalizeCtdCode } from '../../shared/regulatory/section-code';

/** One code/title pair as a registry states it. A missing code is skipped by every check. */
export interface TreeNode {
  code?: string | null;
  title: string;
  parentKey?: string | null;
  mandatory?: boolean;
}

// ── Module 1 (FDA) ───────────────────────────────────────────────────────────

/** The FDA-published US regional Module 1 headings, as plain section codes. */
export const FDA_M1_CODES: string[] = CV_CONTEXT_OF_USE.codes
  .map((c) => c.code)
  .filter((c) => c.startsWith('us_1'))
  .map((c) => c.replace(/^us_/, ''));

export function normalize(code: string | null | undefined): string {
  return String(code ?? '').trim().replace(/^m/i, '');
}

export function isModule1(code: string | null | undefined): boolean {
  const c = normalize(code);
  return c === '1' || c.startsWith('1.');
}

/** A published heading, an ancestor of one, or a descendant of one. */
export function isFdaModule1Placement(code: string): boolean {
  const c = normalize(code);
  if (c === '1') return true;
  if (FDA_M1_CODES.includes(c)) return true;
  if (FDA_M1_CODES.some((k) => k.startsWith(`${c}.`))) return true; // ancestor
  if (FDA_M1_CODES.some((k) => c.startsWith(`${k}.`))) return true; // descendant
  return false;
}

/**
 * Where FDA files well-known Module 1 content. Each rule: a title pattern and
 * the heading prefix the content must sit under (or `null` when the content is
 * not a Module 1 heading at all in eCTD).
 */
export interface PlacementRule {
  label: string;
  title: RegExp;
  /** The heading(s) the content must sit at or under; `null` = not a Module 1 heading in FDA eCTD. */
  under: string | string[] | null;
  /**
   * Also accept an ANCESTOR of an `under` heading. For content that a coarser
   * tree legitimately files at the parent: a Module 1 readiness aid that lists
   * 'container/carton labels' at m1.14 is right, while the same title at
   * 1.14.4 (investigational labeling) or 1.14.5 (foreign labeling) is wrong.
   */
  ancestorOk?: boolean;
}

export const PLACEMENT_RULES: readonly PlacementRule[] = [
  { label: 'cover letter', title: /\bcover letter/i, under: '1.2' },
  { label: 'FDA transmittal form', title: /\b(1571|1572|356h|3674|3397|2253)\b/i, under: '1.1' },
  { label: 'financial certification / disclosure (3454/3455)', title: /\b(3454|3455)\b|financial (certification|disclosure)/i, under: '1.3.4' },
  { label: 'field copy certification', title: /field copy/i, under: '1.3.2' },
  { label: 'debarment certification', title: /debarment/i, under: '1.3.3' },
  { label: 'patent information / certification', title: /\bpatent/i, under: '1.3.5' },
  { label: 'letter of authorization', title: /letters? of authori[sz]ation/i, under: '1.4.1' },
  { label: 'right of reference', title: /right of reference/i, under: '1.4.2' },
  { label: 'meeting materials', title: /\bmeeting\b|briefing (book|document|package)/i, under: '1.6' },
  { label: 'pediatric plan / PREA', title: /pediatric|paediatric|PREA/i, under: '1.9' },
  { label: 'environmental assessment / categorical exclusion', title: /environmental/i, under: '1.12.14' },
  { label: 'annual report / DSUR', title: /annual report|DSUR|development safety update/i, under: '1.13' },
  { label: "investigator's brochure", title: /investigator'?s?\s+brochure/i, under: '1.14.4.1' },
  { label: 'labeling', title: /labell?ing|package insert|prescribing information|medication guide|carton|container label/i, under: '1.14' },
  // Carton/container labels and the labeling text (SPL) are draft (1.14.1.x)
  // or final (1.14.2.x) labeling — never investigational (1.14.4) or foreign
  // (1.14.5) labeling, and not the listed-drug comparison (1.14.3).
  { label: 'carton and container labels', title: /carton|container label/i, under: ['1.14.1', '1.14.2'], ancestorOk: true },
  { label: 'structured product labeling (SPL)', title: /[Ss]tructured [Pp]roduct [Ll]abell?ing|\bSPL\b/, under: ['1.14.1', '1.14.2'], ancestorOk: true },
  { label: 'promotional material', title: /promotional/i, under: '1.15' },
  { label: 'REMS / risk management', title: /\bREMS\b|risk management/i, under: '1.16' },
  { label: 'general investigational plan', title: /general investigational plan/i, under: '1.20' },
  // Not Module 1 headings in FDA eCTD: the XML backbone is the table of
  // contents, and previous human experience is clinical content (M2.5 / M5).
  { label: 'table of contents (the backbone is the TOC)', title: /table of contents/i, under: null },
  { label: 'previous human experience (Module 2.5 / 5.3.5)', title: /previous human experience/i, under: null },
];

/**
 * Headings whose meaning FDA fixes, checked code → title (the PLACEMENT_RULES
 * run title → code). A node AT the heading must say what the heading is. The
 * meanings are the FDA context-of-use descriptions (cv-v4-data.ts).
 */
export const HEADING_IDENTITY_RULES: ReadonlyArray<{ code: string; meaning: string; title: RegExp }> = [
  { code: '1.3.2', meaning: 'field copy certification', title: /field copy/i },
  { code: '1.3.5', meaning: 'patent and exclusivity', title: /\bpatent|exclusivity/i },
  { code: '1.12.14', meaning: 'environmental analysis', title: /environmental|categorical exclusion/i },
  { code: '1.19', meaning: 'Pre-EUA and EUA', title: /\bEUA\b|emergency use/i },
  { code: '1.14.5', meaning: 'Foreign labeling', title: /foreign/i },
];

export function sitsUnder(code: string, heading: string, ancestorOk: boolean): boolean {
  if (code === heading || code.startsWith(`${heading}.`)) return true;
  return ancestorOk && (code === '1' || heading.startsWith(`${code}.`));
}

function headingsOf(rule: PlacementRule): string[] {
  return rule.under === null ? [] : Array.isArray(rule.under) ? rule.under : [rule.under];
}

/** The title says something beyond the code(s) it carries. */
function titleHasWords(title: string): boolean {
  return /[A-Za-z]{2,}/.test(String(title ?? '').replace(/\bm?\d+(?:\.[0-9A-Za-z]+)*\b/g, ''));
}

/** FDA Module 1 contract violations for a tree; [] when every Module 1 node files where FDA files. */
export function violationsFor(nodes: readonly TreeNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    const code = normalize(n.code);
    if (!isModule1(code)) continue;
    if (!isFdaModule1Placement(code)) {
      out.push(`${n.code} "${n.title}" is not an FDA Module 1 heading (nor an ancestor/descendant of one)`);
    }
    const matched = PLACEMENT_RULES.filter((rule) => rule.title.test(n.title));
    // A node naming documents FDA files under different headings is a
    // container for them; it may sit at an ancestor of each one's heading.
    const naming = new Set(matched.filter((r) => r.under !== null).map((r) => headingsOf(r).join('|')));
    const container = naming.size > 1;
    for (const rule of matched) {
      if (rule.under === null) {
        out.push(`${n.code} "${n.title}" — ${rule.label} is not filed as a Module 1 section in FDA eCTD`);
        continue;
      }
      const headings = headingsOf(rule);
      if (!headings.some((h) => sitsUnder(code, h, rule.ancestorOk === true || container))) {
        out.push(`${n.code} "${n.title}" — ${rule.label} files under ${headings.join(' or ')}`);
      }
    }
    if (!titleHasWords(n.title)) continue;
    for (const id of HEADING_IDENTITY_RULES) {
      if (code === id.code && !id.title.test(n.title)) {
        out.push(`${n.code} "${n.title}" — FDA ${id.code} is ${id.meaning}`);
      }
    }
  }
  return out;
}

// ── Modules 2–5 (ICH) ────────────────────────────────────────────────────────

/** The record's title for a code, or null when the record has no such heading. */
export type TitleOf = (code: string) => string | null;

/**
 * Groups of terms that tell sibling CTD headings apart. Within a group, a copy
 * that carries one term where the record carries a different one names a
 * different heading. The first group is what a clinical summary / report
 * heading is about (2.7.3 efficacy, 2.7.4 safety, 2.7.5 literature, 2.7.6
 * synopses, 2.7.1 biopharmaceutics, 5.3.4 pharmacodynamics); the rest are the
 * pairs named in finding 33.
 */
export const CONTRADICTING_TERMS: ReadonlyArray<readonly RegExp[]> = [
  [/\befficac/i, /\bsafety\b/i, /\bpharmacodynamic/i, /\bliterature\b/i, /\bsynops[ie]s\b/i, /\bbiopharmaceutic/i],
  [/\bpharmacolog/i, /\bpharmacokinetic/i, /\btoxicolog/i],
  [/\bwritten\b/i, /\btabulat/i],
  [/\boverview\b/i, /\bsummar(?:y|ies)\b/i],
  [/\bsubstance\b/i, /\bproduct\b/i],
];

/**
 * Module 3 depth the record does not model yet. ich-m4-headings.ts holds the
 * Module 3 skeleton; the CMC lane appends 2.3.S.x, 3.2.S.x.y, 3.2.A.x … there.
 */
const CMC_DEPTH = /^(?:2\.3|3\.2)\.[SPAR]\./;

/** The canonical M2–M5 code of an entry, or null when it has none or is outside Modules 2–5. */
export function m2to5Code(code: string | null | undefined): string | null {
  const c = normalizeCtdCode(code);
  return c !== null && /^[2-5](?:\.|$)/.test(c) ? c : null;
}

/** "Quality Overall Summary (QOS)" → "Quality Overall Summary". */
export function coreTitle(title: string): string {
  return title.replace(/\s*\(.*?\)\s*/g, ' ').split(' — ')[0].trim();
}

/**
 * Does `title` carry the record's title for `code` (parenthetical qualifiers
 * dropped)? null when `code` is not a Modules 2–5 heading of the record.
 */
export function carriesCanonicalTitle(code: string | null | undefined, title: string, titleOf: TitleOf = ichHeadingTitle): boolean | null {
  const c = m2to5Code(code);
  const canon = c === null ? null : titleOf(c);
  return canon === null ? null : title.includes(coreTitle(canon));
}

function contradiction(title: string, canon: string): string | null {
  for (const group of CONTRADICTING_TERMS) {
    const inCanon = group.filter((t) => t.test(canon));
    const inCopy = group.filter((t) => t.test(title));
    if (inCanon.length > 0 && inCopy.length > 0 && !inCanon.some((t) => inCopy.includes(t))) {
      return inCopy.map((t) => title.match(t)![0]).join('/');
    }
  }
  return null;
}

export interface M2to5Result {
  violations: string[];
  /** Entries at Module 3 depth the record does not model yet — neither passed nor failed. */
  unchecked: TreeNode[];
}

/** Hold every Modules 2–5 entry to the record. Module 1, code-less and non-code entries are ignored. */
export function checkM2to5(nodes: readonly TreeNode[], opts: { titleOf?: TitleOf } = {}): M2to5Result {
  const titleOf = opts.titleOf ?? ichHeadingTitle;
  const violations: string[] = [];
  const unchecked: TreeNode[] = [];
  for (const n of nodes) {
    const c = m2to5Code(n.code);
    if (c === null) continue;
    const canon = titleOf(c);
    if (canon === null) {
      if (CMC_DEPTH.test(c)) unchecked.push(n);
      else violations.push(`${n.code} "${n.title}" is not an ICH M4 heading (neither CTD_AUTHORING_GUIDANCE nor ich-m4-headings has ${c})`);
      continue;
    }
    const term = contradiction(n.title, canon);
    if (term !== null) violations.push(`${n.code} "${n.title}" contradicts the record: ${c} is "${canon}" ("${term}")`);
  }
  return { violations, unchecked };
}

/** `checkM2to5(...).violations`. */
export function m2to5Violations(nodes: readonly TreeNode[], opts: { titleOf?: TitleOf } = {}): string[] {
  return checkM2to5(nodes, opts).violations;
}

/** The record with one heading retitled — for proving a check is live (mutation). */
export function retitled(code: string, title: string): TitleOf {
  const target = normalizeCtdCode(code);
  return (c) => (normalizeCtdCode(c) === target ? title : ichHeadingTitle(c));
}

// ── Registered copies ────────────────────────────────────────────────────────

/** One registry that states CTD code/title pairs, as a consistency test declares it. */
export interface CtdRegistry {
  name: string;
  /** Repo-relative path of the source file that holds the copy (read by the inventory ratchet). */
  ownerPath: string;
  /** Whose Module 1 the registry states. Only 'US' Module 1 is held here (FDA). */
  region: 'US' | 'EU' | 'JP' | 'multi';
  /** Set when another test already holds this registry's Module 1 to the FDA contract. */
  module1HeldBy?: string;
  read(): TreeNode[];
}

/** Every contract violation of one registered copy: FDA Module 1 (US, unless held elsewhere) and Modules 2–5. */
export function registryViolations(registry: CtdRegistry, opts: { titleOf?: TitleOf } = {}): string[] {
  const nodes = registry.read();
  const out: string[] = [];
  if (registry.region === 'US' && !registry.module1HeldBy) out.push(...violationsFor(nodes));
  out.push(...m2to5Violations(nodes, opts));
  return out;
}
