/**
 * A CTD Module 2 component's outline, read from the platform's one ICH M2–M5
 * record (docs/design/ANA_REGULATORY_RECORD.md "One ICH M2–M5 record"):
 * `CTD_AUTHORING_GUIDANCE` holds the codes a sponsor writes, with their briefs,
 * and `ICH_M4_HEADINGS` the structural headings around them. Two halves, one
 * tree; this module only reads it.
 *
 * Why (D2 increment 3, 2026-10-20). The template library kept the Nonclinical
 * Overview, the Clinical Overview and the Clinical Summary as hand copies of
 * their first level, and the 2.6 outline (nonclinicalSummaryBlueprint.ts) read
 * the guidance half only. So a Clinical Summary was six headings with no
 * 2.7.4.2 Adverse Events to write to, a Clinical Overview stopped at 2.5.6, and
 * the 2.6 written summaries had no 2.6.4.x or 2.6.6.x — while the record held
 * all of them. The Authoring picker, `get_document_template` and AnA drafting
 * read the one outline `getRegistryDocumentTemplate` serves, so they now read
 * the record; a class pack minted from one of these outlines will too.
 *
 * Not here, on purpose: the Quality Overall Summary (2.3) and Module 3. Their
 * deeper headings belong to the CMC lane (ich-m4-headings.ts header), and the
 * record does not hold them yet.
 *
 * Pure and deterministic: no database, no network, no model.
 *
 * @module server/services/market-specs/ctd-component-outlines
 */

import type { DocumentTemplateStructure, TemplateSection } from './document-template-library';
import type { CtdSection, RegulatoryBasis } from '../ind/ctd/types';
import { CTD_AUTHORING_GUIDANCE } from '../ind/ctd/authoring-guidance';
import { ICH_M4_HEADINGS } from '../ind/ctd/ich-m4-headings';
import { basisLabel } from '../../../shared/regulatory/regulatory-basis';
import { compareSectionCode } from '../../../shared/regulatory/section-code';

/** One heading of the record below a component's root: its brief when the guidance half holds it, its basis when the structural half does. */
export interface CtdRecordHeading {
  code: string;
  title: string;
  brief?: CtdSection;
  basis?: RegulatoryBasis;
  /** When the heading applies, where the record makes it conditional (IchM4Heading.condition). */
  condition?: string;
}

const BRIEFED: ReadonlyMap<string, CtdSection> = new Map(Object.values(CTD_AUTHORING_GUIDANCE).map((s) => [s.code, s] as const));
const STRUCTURAL = new Map(ICH_M4_HEADINGS.map((h) => [h.code, h] as const));
const parentOf = (code: string) => code.slice(0, code.lastIndexOf('.'));

/** Source-supported CMC prose only; mixed/original tables and unknown parts stay source preparation. */
export function ctdRecordDraftingMode(code: string): 'narrative' | 'manual' {
  const source = BRIEFED.get(code);
  return source?.module === 3 && source.contentType === 'narrative' ? 'narrative' : 'manual';
}

/** Every heading the record holds below `root` (exclusive), in CTD order. Throws on a root the record does not hold. */
export function ctdRecordSubtree(root: string): CtdRecordHeading[] {
  if (!BRIEFED.has(root) && !STRUCTURAL.has(root)) throw new Error(`The ICH M2–M5 record holds no heading ${root}.`);
  return [...new Set([...BRIEFED.keys(), ...STRUCTURAL.keys()])]
    .filter((c) => c.startsWith(`${root}.`))
    .sort(compareSectionCode)
    .map((code) => {
      const brief = BRIEFED.get(code);
      if (brief) return { code, title: brief.title, brief };
      const row = STRUCTURAL.get(code)!;
      return { code, title: row.title, basis: row.basis, ...(row.condition ? { condition: row.condition } : {}) };
    });
}

/** The nearest heading at or above `code` that the guidance half briefs, or undefined. */
function briefedAncestor(code: string): CtdSection | undefined {
  for (let c = code; c.includes('.'); c = parentOf(c)) {
    const s = BRIEFED.get(c);
    if (s) return s;
  }
  return undefined;
}

/**
 * What a heading is for. A briefed heading: its own key content. A structural
 * one: what its nearest briefed ancestor says of it — the clause that opens with
 * its number ("2.5.6.1.1 Disease or Condition (…)" in the 2.5.6 brief), or the
 * one element that opens with its title and names no other heading of the
 * outline ("Integrated pharmacology summary…" for 2.4.2). Anything else says
 * the record holds no brief for it. A line is the record's words, attributed,
 * or says it has none; it is never attached to a sibling's or a parent's
 * content (3a review, 2026-10-25: "Deaths" carried the discontinuations line,
 * "Overdose" the whole special-situations list).
 */
function purposeOf(h: CtdRecordHeading, others: readonly string[]): string {
  if (h.brief) return `${h.brief.keyContentElements.slice(0, 3).join('; ')}.`;
  const ancestor = briefedAncestor(parentOf(h.code));
  const own = ancestor ? ownElement(h, ancestor, others) : undefined;
  const line = own
    ? `From the ${ancestor!.code} brief: ${own}.`
    : ancestor
      ? `An ICH M4 heading within ${ancestor.code} ${ancestor.title}; the record holds no brief of its own for it. Draft it to the ${ancestor.code} brief.`
      : `The ICH M4 heading ${h.code} ${h.title}; the record holds no brief for it.`;
  return h.condition ? `${line} Conditional: ${h.condition}.` : line;
}

const CODE_AT = /(^|[\s;(—–-])(\d+(?:\.\d+)+) /g;

/** The clause of `element` that opens with `code`, up to the next code it names; undefined when it does not name the code. */
function clauseFor(element: string, code: string): string | undefined {
  const marks = [...element.matchAll(CODE_AT)].map((m) => ({ code: m[2], at: (m.index ?? 0) + m[1].length }));
  const i = marks.findIndex((m) => m.code === code);
  if (i < 0) return undefined;
  const end = marks[i + 1]?.at ?? element.length;
  return element.slice(marks[i].at, end).replace(/[\s;,—–-]+$/, '');
}

/** The one element of the ancestor's key content that is about this heading, or undefined. */
function ownElement(h: CtdRecordHeading, ancestor: CtdSection, others: readonly string[]): string | undefined {
  for (const k of ancestor.keyContentElements) {
    const clause = clauseFor(k, h.code);
    if (clause) return clause;
  }
  const title = h.title.toLowerCase();
  const opens = ancestor.keyContentElements.filter((k) => {
    const text = k.toLowerCase().replace(/^integrated\s+/, '');
    // "Adverse events of special interest" is about a narrower subject than 2.7.4.2 Adverse Events.
    const narrows = /^ of /.test(text.slice(title.length));
    // A title inside this one ("adverse events" in "analysis of adverse events") is not another heading's content.
    return text.startsWith(title) && !narrows && !others.some((o) => !title.includes(o) && text.includes(o));
  });
  return opens.length === 1 ? opens[0] : undefined;
}

/**
 * Required: a brief whose `requiredFor` names any submission is required, one
 * that names none (the 2.6.2.x pharmacology leaves) is conditional. A heading
 * the record holds a condition for (2.5.6.5, 2.7.4.6) is conditional. Any other
 * structural heading carries its nearest briefed ancestor's flag: a platform
 * rule, since the record states no flag for it.
 */
function requiredOf(h: CtdRecordHeading): boolean {
  if (h.condition) return false;
  const s = briefedAncestor(h.code);
  return s ? s.requiredFor.length > 0 : true;
}

/** The headings below `root`, nested by code, in CTD order. */
export function ctdComponentSections(root: string): TemplateSection[] {
  const headings = ctdRecordSubtree(root);
  const titles = [...new Set([BRIEFED.get(root)?.title ?? STRUCTURAL.get(root)?.title ?? '', ...headings.map((h) => h.title)].map((t) => t.toLowerCase()).filter(Boolean))];
  const nodes = new Map<string, TemplateSection>();
  const top: TemplateSection[] = [];
  for (const h of headings) {
    const others = titles.filter((t) => t !== h.title.toLowerCase());
    const section: TemplateSection = { number: h.code, heading: h.title, purpose: purposeOf(h, others), required: requiredOf(h),
      ...(root === '3' || root.startsWith('3.') ? { drafting_mode: ctdRecordDraftingMode(h.code) } : {}) };
    nodes.set(h.code, section);
    const parent = nodes.get(parentOf(h.code));
    if (parent) (parent.subsections ??= []).push(section);
    else top.push(section);
  }
  return top;
}

/** A Module 2 component's template: its root's headings to the record's depth, with the basis and limits stated. */
/**
 * An unnumbered heading the guideline gives a component (the QOS's Introduction),
 * as front matter: its purpose is the root brief's element that opens with
 * `opensWith`, attributed, and it is required as its root is. The number is the
 * platform's code for it, never an ICH M4 code.
 */
export function ctdFrontMatter(root: string, number: string, heading: string, opensWith: string): TemplateSection {
  const brief = BRIEFED.get(root);
  if (!brief) throw new Error(`The ICH M2–M5 record holds no brief for ${root}.`);
  const own = brief.keyContentElements.find((k) => k.startsWith(opensWith));
  return {
    number,
    heading,
    purpose: own ? `From the ${root} brief: ${own}.` : `An unnumbered heading of ${root} ${brief.title}; the record holds no brief of its own for it. Draft it to the ${root} brief.`,
    required: brief.requiredFor.length > 0,
  };
}

export function ctdComponentTemplate(input: {
  id: string; registryId: string; root: string; title: string; guideline: string;
  /** Unnumbered headings before the numbered ones (ctdFrontMatter). */
  frontMatter?: TemplateSection[];
  /** Limits of this component beyond the record's, said to the author. */
  limitations?: string[];
}): DocumentTemplateStructure {
  // The note counts what the rows say, never one provenance for the whole outline
  // (3a review, 2026-10-25: it claimed an extract for 36 of 49 Clinical Summary headings that had none).
  const rows = ctdRecordSubtree(input.root);
  const matched = rows.filter((r) => /search extract/i.test(r.basis?.note ?? '')).length;
  const basis: RegulatoryBasis = {
    ref: `${input.guideline}, ${input.root}: headings from the platform's ICH M2–M5 record`,
    confidence: 'recall',
    note: `Headings as the record holds them; each heading's own basis says how it was established. ${matched} of ${rows.length} were matched against a search extract; the rest are recall. Not re-read against the guideline text for this outline.`,
  };
  return {
    id: input.id,
    title: input.title,
    families: ['ectd'],
    ctdSection: input.root,
    regulatoryBasis: basisLabel(basis),
    basis,
    outlineSource: { kind: 'document-outline', registryId: input.registryId, record: `CTD_AUTHORING_GUIDANCE+ICH_M4_HEADINGS:${input.root}` },
    outlineLimitations: [
      'A heading the record briefs is required when its brief names a submission (IND, NDA or BLA); any other heading takes its nearest brief’s flag, a platform rule the record does not state; a heading the guideline makes conditional is not required. Scale content to the development phase: an early IND does not need a complete marketing dossier.',
      'ICH M4 sets how the section is organised, not which studies or data a product must have. Confirm applicability and the receiving agency’s regional requirements.',
      ...(input.limitations ?? []),
    ],
    ...(input.frontMatter?.length ? { frontMatter: input.frontMatter } : {}),
    sections: ctdComponentSections(input.root),
  };
}
