/**
 * A CTD section as AnA is told it while she drafts it: one line naming it, and
 * the full brief of what it must contain.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Two prompt blocks tell AnA which section is open: the orchestrator's section
 * line (ana-ri/orchestrator.ts, every turn with a section code) and the
 * stream's section playbook (lumen-context/sections.ts). Each kept its own
 * hand-written table, and both had drifted from ICH M4 and FDA's Module 1.
 * 2.7.3 was briefed as "Summary of Clinical Pharmacodynamics", 2.7.4 as
 * efficacy and 2.7.5 as safety (M4E: efficacy, safety, literature
 * references); 1.14 as the environmental assessment (FDA: labeling, with the
 * environmental analysis at 1.12.14); 1.2 as a table of contents and 1.3.3 as
 * the investigator's brochure (cover letter; debarment certification, with the
 * IB at 1.14.4.1); 5.3.5.1 as a clinical protocol. A writer in 2.7.3 was told
 * she was writing about pharmacodynamics.
 *
 * Both blocks now render from the canonical overlay, CTD_AUTHORING_GUIDANCE,
 * which the authoring-depth and citation-accuracy suites already hold
 * (tests/regulatory/). tests/regulatory/ana-ctd-section-truth.test.ts holds
 * the two renderings to it for every registered code.
 *
 * ── Resolution ───────────────────────────────────────────────────────────────
 * Narrower than getCtdAuthoringGuidance, on purpose:
 *   - an exact entry                → that entry;
 *   - a code deeper than any entry  → its nearest registered ancestor, and the
 *                                     text says which section is open;
 *   - a parent of registered entries→ the sections it contains, never the
 *                                     first child's guidance (that fallback
 *                                     briefs "2.7" as 2.7.1);
 *   - anything else                 → null. No brief is better than a guessed
 *                                     one, and the caller then says nothing.
 *
 * Advisory reference structure, like the overlay it reads: it says what a
 * complete section contains and where things go, never what a study found.
 */

import { normalizeCtdCode, compareSectionCode } from '../../../../shared/regulatory/section-code';
import { basisLabel, type RegulatoryBasis } from '../../../../shared/regulatory/regulatory-basis';
import { CTD_AUTHORING_GUIDANCE } from './authoring-guidance.js';
import { LIFECYCLE_DOCUMENT_TYPES } from './lifecycle-document-types.js';
import type { CtdSection, DocumentOutline, Necessity, OutlineNode } from './types.js';

export type SectionBriefKind = 'exact' | 'ancestor' | 'parent';

export interface SectionBriefSource {
  kind: SectionBriefKind;
  /** The code asked for, normalised ("m2.7.3" → "2.7.3"). */
  requested: string;
  /** The entry the brief is written from (exact and ancestor). */
  entry?: CtdSection;
  /** The registered sections under the requested code (parent). */
  children?: CtdSection[];
}

/** Default size of the full brief, in characters — one prompt block, not a chapter. */
export const SECTION_BRIEF_MAX_CHARS = 3500;

const LIST_CAPS = { mustContain: 10, expectedData: 8, pitfalls: 6, children: 12 } as const;

export function resolveSectionBriefSource(code: string | null | undefined): SectionBriefSource | null {
  const requested = normalizeCtdCode(code);
  if (!requested) return null;

  const exact = CTD_AUTHORING_GUIDANCE[requested];
  if (exact) return { kind: 'exact', requested, entry: exact };

  const codes = Object.keys(CTD_AUTHORING_GUIDANCE);
  const ancestor = codes
    .filter((c) => requested.startsWith(`${c}.`))
    .sort((a, b) => b.length - a.length)[0];
  if (ancestor) return { kind: 'ancestor', requested, entry: CTD_AUTHORING_GUIDANCE[ancestor] };

  const children = codes
    .filter((c) => c.startsWith(`${requested}.`))
    .sort(compareSectionCode)
    .map((c) => CTD_AUTHORING_GUIDANCE[c]);
  if (children.length > 0) return { kind: 'parent', requested, children };

  return null;
}

/** The text up to and including its first sentence end, or all of it. */
function firstSentence(text: string): string {
  const m = /^(.+?[.!?])(\s|$)/s.exec(text.trim());
  return (m ? m[1] : text).trim();
}

/** At most `max` characters, cut at a sentence end when one is in reach. */
export function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const window = t.slice(0, max);
  const lastStop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('; '));
  return `${(lastStop > max * 0.5 ? window.slice(0, lastStop + 1) : window).trim()} …`;
}

function listing(children: CtdSection[]): string {
  const shown = children.slice(0, LIST_CAPS.children).map((c) => `${c.code} ${c.title}`);
  const more = children.length - shown.length;
  return shown.join('; ') + (more > 0 ? `; and ${more} more` : '');
}

/**
 * One line naming the open section, for the orchestrator's section block:
 * "2.7.3 Summary of Clinical Efficacy. Section 2.7.3 summarises …".
 * Null for a code nothing registers.
 */
export function sectionIdentityLine(code: string | null | undefined): string | null {
  const src = resolveSectionBriefSource(code);
  if (!src) return null;
  if (src.kind === 'parent') {
    return clip(`${src.requested} contains: ${listing(src.children!)}.`, 700);
  }
  const g = src.entry!;
  const where = src.kind === 'ancestor' ? ` (the open sub-section is ${src.requested})` : '';
  return clip(`${g.code} ${g.title}${where}. ${firstSentence(g.guidance)}`, 500);
}

/**
 * The full brief for the stream's section playbook. The first line is always
 * "## Drafting: Module <code> — <title>" for an exact or ancestor entry, so the
 * playbook names the section exactly as the overlay does.
 */
export function renderSectionBrief(
  code: string | null | undefined,
  maxChars: number = SECTION_BRIEF_MAX_CHARS,
): string | null {
  const src = resolveSectionBriefSource(code);
  if (!src) return null;

  if (src.kind === 'parent') {
    return clip(
      [
        `## Drafting: Module ${src.requested} — the sections it contains`,
        'Each section has its own requirements; ask for the one being written.',
        ...src.children!.slice(0, LIST_CAPS.children).map((c) => `- ${c.code} ${c.title}`),
      ].join('\n'),
      maxChars,
    );
  }

  const g = src.entry!;
  const blocks: string[] = [`## Drafting: Module ${g.code} — ${g.title}`];
  if (src.kind === 'ancestor') {
    blocks.push(`You are in ${src.requested}, within ${g.code}; these are ${g.code}'s requirements.`);
  }
  if (g.requiredFor.length > 0) blocks.push(`Required for: ${g.requiredFor.join(', ')}.`);
  blocks.push(clip(g.guidance, 700));

  // Optional blocks in order of value; each is added only while it fits.
  const optional: string[] = [
    `### How it is written\n${clip(g.authoringGuidance, 900)}`,
    `### It must contain\n${g.keyContentElements.slice(0, LIST_CAPS.mustContain).map((e) => `- ${e}`).join('\n')}`,
  ];
  if (g.expectedData?.length) {
    optional.push(`### Tables and data a reviewer expects\n${g.expectedData.slice(0, LIST_CAPS.expectedData).map((e) => `- ${e}`).join('\n')}`);
  }
  if (g.commonPitfalls?.length) {
    optional.push(`### Common deficiencies\n${g.commonPitfalls.slice(0, LIST_CAPS.pitfalls).map((e) => `- ${e}`).join('\n')}`);
  }
  if (g.dependencies?.length) {
    optional.push(`### Read with\n${g.dependencies.join(', ')}`);
  }

  let text = blocks.join('\n');
  for (const block of optional) {
    if (text.length + block.length + 2 > maxChars) break;
    text += `\n\n${block}`;
  }
  return text;
}

/**
 * A lifecycle document type (an NDA, an ISS, a DSUR, a pre-NDA briefing
 * package) as a brief: what it is, its regulatory basis, its components, and
 * the CTD sections it draws on. Null for an id the library does not register.
 */
export function renderLifecycleBrief(id: string | null | undefined, maxChars: number = SECTION_BRIEF_MAX_CHARS): string | null {
  const dt = LIFECYCLE_DOCUMENT_TYPES.find((d) => d.id === String(id ?? '').trim().toLowerCase());
  if (!dt) return null;
  const blocks: string[] = [`## ${dt.label}`, clip(dt.description, 700)];
  if (dt.timing) blocks.push(`Timing: ${dt.timing}`);
  blocks.push(`### Regulatory basis\n${dt.regulatoryBasis.map((b) => `- ${b}`).join('\n')}`);
  blocks.push(
    `### Components\n${dt.components
      .map((c) => `- ${c.code} ${c.title}${c.required ? '' : ' (when applicable)'} — ${clip(firstSentence(c.guidance), 180)}`)
      .join('\n')}`,
  );
  if (dt.ctdSectionCodes?.length) blocks.push(`### CTD sections it draws on\n${dt.ctdSectionCodes.join(', ')}`);
  return clip(blocks.join('\n\n'), maxChars);
}

/** The lifecycle document types the library registers, by id. */
export function listLifecycleIds(): string[] {
  return LIFECYCLE_DOCUMENT_TYPES.map((d) => d.id);
}

// ── Document outlines (R13) ──────────────────────────────────────────────────
//
// The one renderer for every DocumentOutline (the E3 CSR, the protocol, the
// periodic safety reports, the JP CTN, the EU CTA Annex I). An outline is
// added as data; nothing about it needs a renderer of its own. Every basis is
// rendered by basisLabel, so recall and platform convention are never shown as
// checked regulator text, and a heading-only node renders no content at all.

/** What a heading-only node says in place of content. */
export const OUTLINE_CONTENT_NOT_ENCODED = 'Content not encoded — do not supply from memory.';

export interface OutlineBriefOptions {
  /** Character cap. Optional blocks are dropped to fit; the basis is kept. */
  maxChars?: number;
  /** 'brief': identity, applicability, first purpose sentence and basis only. */
  mode?: 'full' | 'brief';
}

const OUTLINE_LIST_CAPS = { contains: 12, sources: 8, presentation: 8, pitfalls: 6, children: 16 } as const;

/** "§12.2", "section 12.2", " 12.2 " → "12.2"; null when it is not a dotted number. */
function normalizeOutlineNumber(value: string): string | null {
  const m = /^(?:section\s+|sec\.?\s*)?§?\s*(\d{1,3}(?:\.\d{1,3})*)\.?$/i.exec(value.trim());
  return m ? m[1] : null;
}

function nodeParentNumber(number: string): string | null {
  const i = number.lastIndexOf('.');
  return i === -1 ? null : number.slice(0, i);
}

function nodeHeading(n: OutlineNode): string {
  const title = n.titleLocal ? `${n.title} (${n.titleLocal})` : n.title;
  return n.number ? `${n.number} ${title}` : title;
}

function findOutlineNode(outline: DocumentOutline, section: string): OutlineNode | null {
  const number = normalizeOutlineNumber(section);
  if (number) {
    const byNumber = outline.nodes.find((n) => n.number === number);
    if (byNumber) return byNumber;
  }
  const title = section.trim().toLowerCase();
  const byTitle = outline.nodes.filter(
    (n) => n.title.toLowerCase() === title || (n.titleLocal !== undefined && n.titleLocal.trim().toLowerCase() === title),
  );
  // Two headings with one title is ambiguous: no guessed brief.
  return byTitle.length === 1 ? byTitle[0] : null;
}

function appliesLine(outline: DocumentOutline, n: OutlineNode): string {
  const by: Record<Necessity, string> = {
    always: `Expected in every ${outline.title}.`,
    conditional: n.condition
      ? `Expected when ${n.condition} holds; undetermined until that fact is known — never read as not required.`
      : 'Expected under a condition this outline does not name; undetermined — never read as not required.',
    'when-applicable': 'Expected when the document has its subject.',
    'authority-dependent': 'Expected where the reviewing authority requires it.',
  };
  return by[n.applies];
}

function basisBlock(bases: readonly RegulatoryBasis[]): string {
  return `### Basis\n${bases.map((b) => `- ${basisLabel(b)}`).join('\n')}`;
}

function bulletBlock(label: string, items: string[] | undefined, cap: number): string | null {
  if (!items?.length) return null;
  const shown = items.slice(0, cap).map((i) => `- ${i}`);
  const more = items.length - shown.length;
  return `### ${label}\n${shown.join('\n')}${more > 0 ? `\n- and ${more} more` : ''}`;
}

/** Required head, optional middle blocks while they fit, then the basis. */
function assemble(head: string[], optional: Array<string | null>, tail: string, maxChars: number): string {
  let text = head.join('\n');
  for (const block of optional) {
    if (!block) continue;
    if (text.length + block.length + tail.length + 4 > maxChars) break;
    text += `\n\n${block}`;
  }
  const out = `${text}\n\n${tail}`;
  return out.length <= maxChars ? out : clip(out, maxChars);
}

/** The top-level headings in order, with the governing basis. */
function renderOutlineTop(outline: DocumentOutline, brief: boolean, maxChars: number): string {
  const top = outline.nodes.filter((n) => !n.number || nodeParentNumber(n.number) === null);
  const listing = top
    .slice(0, brief ? OUTLINE_LIST_CAPS.children : top.length)
    .map((n) => `- ${nodeHeading(n)}${n.headingOnly ? ` — ${OUTLINE_CONTENT_NOT_ENCODED.toLowerCase()}` : ''}`);
  return assemble([`## ${outline.title} — outline`], [listing.join('\n')], basisBlock(outline.governing), maxChars);
}

/** The headings directly under a numbered node; null when it has none. */
function childrenBlock(outline: DocumentOutline, node: OutlineNode): string | null {
  if (!node.number) return null;
  const children = outline.nodes.filter((n) => n.number !== undefined && nodeParentNumber(n.number) === node.number);
  if (children.length === 0) return null;
  const shown = children.slice(0, OUTLINE_LIST_CAPS.children).map((c) => `- ${nodeHeading(c)}`);
  const more = children.length - shown.length;
  return `### Headings under it\n${shown.join('\n')}${more > 0 ? `\n- and ${more} more` : ''}`;
}

/** A node's content blocks, in order of value. Never called for a heading-only node. */
function nodeContentBlocks(node: OutlineNode): Array<string | null> {
  return [
    node.purpose ? clip(node.purpose, 900) : null,
    bulletBlock('It carries', node.contains, OUTLINE_LIST_CAPS.contains),
    bulletBlock('Usually from (platform practice unless a basis below says otherwise)', node.sources, OUTLINE_LIST_CAPS.sources),
    bulletBlock('Presented as', node.presentation, OUTLINE_LIST_CAPS.presentation),
    bulletBlock('Common deficiencies', node.pitfalls, OUTLINE_LIST_CAPS.pitfalls),
  ];
}

/**
 * A document outline as a brief, for a model prompt or a tool result.
 *
 * - No section: the top-level headings in order (a heading-only one says its
 *   content is not encoded) and the outline's governing basis.
 * - A section (its number, "§12.2", or its exact title): that heading's
 *   applicability, what it carries, where it comes from, how it is presented,
 *   what goes wrong, the headings under it, and its basis — the governing basis
 *   followed by the node's own. A heading-only node renders the statement that
 *   its content is not encoded and none of its content fields.
 * - A section the outline does not have: null. No brief is better than a
 *   guessed one.
 *
 * Throws when the outline has no governing basis: an unsourced outline is a
 * data defect, never rendered as if it were sourced.
 */
export function renderOutlineBrief(
  outline: DocumentOutline,
  section?: string | null,
  opts: OutlineBriefOptions = {},
): string | null {
  if (!outline.governing?.length) {
    throw new Error(`Outline "${outline.id}" has no governing basis; it cannot be rendered.`);
  }
  const maxChars = opts.maxChars ?? SECTION_BRIEF_MAX_CHARS;
  const brief = opts.mode === 'brief';
  if (section === undefined || section === null || section.trim() === '') return renderOutlineTop(outline, brief, maxChars);

  const node = findOutlineNode(outline, section);
  if (!node) return null;

  const head = [`## ${outline.title} — ${nodeHeading(node)}`, appliesLine(outline, node)];
  const tail = basisBlock([...outline.governing, ...(node.basis ?? [])]);
  const children = childrenBlock(outline, node);

  if (node.headingOnly) return assemble([...head, OUTLINE_CONTENT_NOT_ENCODED], [children], tail, maxChars);
  if (brief) return assemble(head, [node.purpose ? firstSentence(node.purpose) : null], tail, maxChars);
  const see = node.see?.length ? `### Read with\n${node.see.join(', ')}` : null;
  return assemble(head, [...nodeContentBlocks(node), children, see], tail, maxChars);
}
