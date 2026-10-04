/**
 * The ICH E3 clinical study report, heading by heading — the platform's one
 * model of what a CSR contains.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The CSR is the document the locked database is written into, and the one
 * every Module 2 clinical summary is written from. Until 2026-10-04 the
 * platform held five partial copies of its outline and none of what belongs
 * under each heading: csr-builder's ICH_E3_STRUCTURE (two levels, its own
 * wording), the CSR scaffold behind get_csr_template (no §11.4.2.x, §12.2.x,
 * §12.3.x, §12.4.x, §14.x, §16.1.x or §16.2.x, and §14 labelled "in-text
 * tables" when E3 §14 is the tables NOT in the text), the CSR template injected
 * into AnA's prompt (§1–§13 only, demographics under §10), the medical-writing
 * base (thirteen paraphrased headings and "follow ICH E3 numbering exactly",
 * which E3 Q&A (R1) contradicts), and the stream's 5.3.5 playbook.
 *
 * This is E3's own tree, to the depth E3 numbers it, with what belongs under
 * each heading, where it usually comes from, how it is presented, what
 * reviewers find wrong, and how strongly each statement is evidenced. The
 * copies above now derive from it, and tests/regulatory/csr-e3-overlay.test.ts
 * holds them to it.
 *
 * Reference structure, like the rest of server/services/ind/ctd: it says what
 * a complete CSR contains and where each part goes, never what a study found.
 */

import type { E3Basis, E3Section } from './types.js';
import { E3_PLAN_SECTIONS, E3_REPORT_NOTES } from './csr-e3-sections-plan.js';
import { E3_RESULTS_SECTIONS } from './csr-e3-sections-results.js';
import { E3_APPENDIX_SECTIONS } from './csr-e3-sections-appendices.js';
import { CDISC_CONVENTION, e3SectionBasis } from './csr-e3-basis.js';
import { clip } from './section-brief.js';

export { E3_REPORT_NOTES };

/** Every E3 heading, in report order. */
export const ICH_E3_GUIDANCE: readonly E3Section[] = Object.freeze([
  ...E3_PLAN_SECTIONS,
  ...E3_RESULTS_SECTIONS,
  ...E3_APPENDIX_SECTIONS,
]);

const BY_NUMBER: ReadonlyMap<string, E3Section> = new Map(ICH_E3_GUIDANCE.map((s) => [s.number, s]));

/** "§12.2", "E3 12.2", " 12.2 " → "12.2"; null when it is not an E3 number. */
export function normalizeE3Number(value: string | null | undefined): string | null {
  const m = /^(?:ich\s*)?(?:e3\s*)?§?\s*(\d{1,2}(?:\.\d{1,2}){0,3})\s*$/i.exec(String(value ?? '').trim());
  return m ? m[1] : null;
}

export function getE3Section(number: string | null | undefined): E3Section | undefined {
  const n = normalizeE3Number(number);
  return n ? BY_NUMBER.get(n) : undefined;
}

/** The parent heading's number, or null for a top-level section. */
export function e3ParentNumber(number: string): string | null {
  const i = number.lastIndexOf('.');
  return i === -1 ? null : number.slice(0, i);
}

/** The headings directly under `number`, in report order. */
export function e3Children(number: string): E3Section[] {
  return ICH_E3_GUIDANCE.filter((s) => e3ParentNumber(s.number) === number);
}

/** §1–§16. */
export function e3TopLevel(): E3Section[] {
  return ICH_E3_GUIDANCE.filter((s) => e3ParentNumber(s.number) === null);
}

/**
 * Every basis a section rests on: its own E3 citation first, then any checked
 * source, then — when it names data sources — the note that those are
 * practice, not requirement.
 */
export function e3BasisFor(section: E3Section): E3Basis[] {
  const out = [e3SectionBasis(section.number), ...(section.basis ?? [])];
  if (section.sources?.length && !out.some((b) => b.confidence === 'platform-convention')) {
    out.push(CDISC_CONVENTION);
  }
  return out;
}

function basisLine(b: E3Basis): string {
  const how = b.confidence === 'regulator-text'
    ? `checked against the regulator's text ${b.checked ?? ''}`.trim()
    : b.confidence === 'recall'
      ? 'ICH E3 (1995) as recalled; verbatim check owed'
      : 'platform practice, not a requirement';
  return `- ${b.ref} — ${how}${b.url ? ` (${b.url})` : ''}`;
}

function bullets(label: string, items: string[] | undefined): string | null {
  return items?.length ? `### ${label}\n${items.map((i) => `- ${i}`).join('\n')}` : null;
}

const APPLIES: Record<E3Section['applies'], string> = {
  always: 'Expected in every CSR.',
  'when-applicable': 'Expected when the study produced its subject.',
  'authority-dependent': 'Expected where the reviewing authority requires it.',
};

/**
 * A brief of one heading for a model prompt or a tool result: what it is,
 * what it carries, where that comes from, what goes wrong, the headings under
 * it, and its basis. With no number, the outline of §1–§16 and the notes that
 * govern the whole report. Null for a number E3 does not have.
 */
export function renderE3Brief(number?: string | null, maxChars = 4000): string | null {
  if (number === undefined || number === null || String(number).trim() === '') {
    const lines = [
      '## ICH E3 clinical study report — outline',
      ...e3TopLevel().map((s) => `- ${s.number}. ${s.title}`),
      '',
      ...E3_REPORT_NOTES.map((n) => `${n.text} (${n.basis.ref})`),
    ];
    return clip(lines.join('\n'), maxChars);
  }
  const s = getE3Section(number);
  if (!s) return null;
  const children = e3Children(s.number);
  const blocks = [
    `## ICH E3 §${s.number} ${s.title}`,
    APPLIES[s.applies],
    s.purpose ?? null,
    bullets('It carries', s.contains),
    s.sources?.length ? `### Usually from (platform practice; the SAP and define.xml decide)\n${s.sources.map((i) => `- ${i}`).join('\n')}` : null,
    bullets('Presented as', s.presentation),
    bullets('Common deficiencies', s.pitfalls),
    children.length ? `### Headings under it\n${children.map((c) => `- ${c.number} ${c.title}`).join('\n')}` : null,
    s.see?.length ? `### Read with\n${s.see.join(', ')}` : null,
    `### Basis\n${e3BasisFor(s).map(basisLine).join('\n')}`,
  ].filter((b): b is string => Boolean(b));
  return clip(blocks.join('\n\n'), maxChars);
}

/** "[E3_12_2_4]" — the scaffold's placeholder for one heading. */
export function e3PlaceholderToken(number: string): string {
  return `[E3_${number.replace(/\./g, '_')}]`;
}

/**
 * The blank CSR body: every E3 heading in order, top-level headings in capitals
 * ("12. SAFETY EVALUATION"), and a placeholder under each heading that carries
 * content of its own. The CSR scaffold behind get_csr_template is this text.
 */
export function renderE3Scaffold(): string {
  const lines: string[] = [];
  for (const s of ICH_E3_GUIDANCE) {
    const depth = s.number.split('.').length;
    const hasChildren = e3Children(s.number).length > 0;
    const token = !hasChildren || s.contains?.length ? e3PlaceholderToken(s.number) : null;
    if (depth === 1) {
      lines.push('', `${s.number}. ${s.title.toUpperCase()}`);
      if (token) lines.push(token);
    } else {
      lines.push(`${'  '.repeat(depth - 2)}${s.number} ${s.title}${token ? `: ${token}` : ''}`);
    }
  }
  return lines.join('\n').trim();
}
