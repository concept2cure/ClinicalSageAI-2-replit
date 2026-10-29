/**
 * The CSR writing standard medical_writing_guidance returns for a clinical
 * study report (CSR slice 4, 2026-10-29, docs/design/CSR_END_TO_END_2026-10-29.md):
 * the report-wide rules, the standard sentences and the terminology from
 * ind/ctd/csr-e3-writing.ts, and one heading's own rules from the E3 overlay.
 * It restates nothing: every rule is read from those two records.
 *
 * @module server/services/ana/medical-writing-csr
 */

import { e3AnnexesFor, getE3Section, normalizeE3Number } from '../ind/ctd/csr-e3-guidance.js';
import {
  CSR_SENTENCE_PATTERNS,
  CSR_TERMINOLOGY,
  CSR_WRITING_RULES,
  type CsrSentencePattern,
  type CsrTerminologyStandard,
  type CsrWritingRule,
} from '../ind/ctd/csr-e3-writing.js';

function bullets(title: string, items: string[]): string {
  if (!items.length) return '';
  return `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}`;
}

/** The CSR writing standard (CSR slice 4, 2026-10-29): read from the E3 overlay, never restated here. */
export interface CsrWritingGuidance {
  rules: readonly CsrWritingRule[];
  sentencePatterns: readonly CsrSentencePattern[];
  terminology: readonly CsrTerminologyStandard[];
  /** The requested heading's own rules, or null when none was asked for or E3 has no such heading. */
  section: { number: string; title: string; writing: string[]; annexes: string[] } | null;
  /** Said when the requested heading does not exist; never another heading's rules. */
  sectionNotFound?: string;
}

/** The CSR writing standard, with one heading's rules when `section` names an E3 heading. */
export function csrWritingGuidance(section: string | undefined): CsrWritingGuidance {
  const base = { rules: CSR_WRITING_RULES, sentencePatterns: CSR_SENTENCE_PATTERNS, terminology: CSR_TERMINOLOGY };
  if (!section?.trim()) return { ...base, section: null };
  const heading = getE3Section(section);
  if (!heading) {
    const n = normalizeE3Number(section) ?? section.trim();
    return { ...base, section: null, sectionNotFound: `ICH E3 has no heading "${n}"; no section rules are given for it.` };
  }
  return {
    ...base,
    section: {
      number: heading.number,
      title: heading.title,
      writing: heading.writing ?? [],
      annexes: e3AnnexesFor(heading.number).map((a) => `ICH E3 Annex ${a.id}, ${a.title}`),
    },
  };
}

/** The CSR block of the brief; empty for any other document. */
export function csrWritingBrief(w: CsrWritingGuidance | undefined, ta: { csrVocabulary?: string[] } | null): string {
  if (!w) return '';
  const parts = [
    '\n## CSR writing standard (tense, voice, hedging, causality)',
    ...w.rules.map((r) => `- **${r.topic}.** ${r.rule}`),
    bullets('Standard sentences (slots only; every slot is filled from the engine tables, never estimated)', w.sentencePatterns.map((p) => `${p.id} (${p.use}): ${p.pattern}`)),
    bullets('Terminology a CSR must use correctly', w.terminology.map((t) => `${t.name}: ${t.rule}`)),
    bullets('Therapeutic-area efficacy and safety vocabulary', ta?.csrVocabulary ?? []),
  ];
  if (w.section) {
    parts.push(bullets(`ICH E3 §${w.section.number} ${w.section.title} — how to write it`, [...w.section.writing, ...w.section.annexes.map((a) => `Display model: ${a}`)]));
  } else if (w.sectionNotFound) {
    parts.push(`\n_${w.sectionNotFound}_`);
  }
  return parts.filter(Boolean).join('\n');
}
