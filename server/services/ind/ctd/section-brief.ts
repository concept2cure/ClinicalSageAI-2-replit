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
import { CTD_AUTHORING_GUIDANCE } from './authoring-guidance.js';
import type { CtdSection } from './types.js';

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
function clip(text: string, max: number): string {
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
