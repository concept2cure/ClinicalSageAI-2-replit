/**
 * The CSR text the narrative job lands (CSR slice 7, 2026-10-29): §14.3.3, one
 * narrative per subject in treatment-group and subject order, each headed with
 * the subject and its qualifying events; and the §12.3.2 cross-reference with
 * the engine's selection counts. Every count is the selection's own; nothing
 * here is computed from text.
 */
import type { NarrativeCategory } from './narrative-subject-selection.js';

export interface SectionNarrative { subjectId: string; armName: string; categories: NarrativeCategory[]; events: string[]; text: string }
export interface NarrativeSectionInput {
  protocolNumber: string;
  counts: Record<NarrativeCategory, number>;
  aesiDeclared: boolean;
  narratives: SectionNarrative[];
}

const CATEGORY_LABEL: Record<NarrativeCategory, string> = {
  death: 'death', serious: 'serious adverse event', discontinuation: 'discontinuation of study treatment for an adverse event',
  aesi: 'adverse event of special interest',
};

/** What the section's opening needs: the counts and the number of narratives, never their text. */
export type NarrativeSectionHead = Omit<NarrativeSectionInput, 'narratives'> & { subjects: number };

function selectionBasis(input: NarrativeSectionHead): string {
  if (!input.subjects) {
    return `No subject in study ${input.protocolNumber} died, had a serious adverse event, or discontinued study treatment because of an adverse event`
      + `${input.aesiDeclared ? ', and none had an adverse event of special interest as the protocol defines it' : ''}, according to the ADSL and ADAE datasets. No narratives are required.`;
  }
  const aesi = input.aesiDeclared
    ? `, and ${input.counts.aesi} with an adverse event of special interest as the protocol defines it`
    : '; the protocol defines no adverse events of special interest';
  return `Narratives are provided for every subject in study ${input.protocolNumber} who died (${input.counts.death}), `
    + `had any other serious adverse event (${input.counts.serious}), or discontinued study treatment because of an adverse event `
    + `(${input.counts.discontinuation})${aesi}. A subject in more than one category is counted in each and has one narrative. `
    + `Subjects were selected from the ADSL and ADAE datasets, and every date, study day, event and outcome in the narratives is taken from those records.`;
}

/** The opening of §14.3.3: the selection basis, from the counts alone. */
export function narrativesSectionHead(head: NarrativeSectionHead): string {
  // The heading is the catalog's (workflow-source-import titles each section); the content starts with the basis.
  return selectionBasis(head);
}

/** One subject's block of §14.3.3, appended after the opening in subject order. */
export function narrativeSectionBlock(n: SectionNarrative): string {
  return `\n\nSubject ${n.subjectId} (${n.armName}): ${n.events.join('; ')} — ${n.categories.map(c => CATEGORY_LABEL[c]).join(', ')}\n\n${n.text}`;
}

const headOf = (input: NarrativeSectionInput): NarrativeSectionHead =>
  ({ protocolNumber: input.protocolNumber, counts: input.counts, aesiDeclared: input.aesiDeclared, subjects: input.narratives.length });

/**
 * §14.3.3 Narratives of Deaths, Other Serious and Certain Other Significant
 * Adverse Events: the opening followed by every block. The narrative job
 * streams the same opening and blocks into the section store a page at a
 * time (csr-narrative-job.ts), so the text it lands is this text.
 */
export function narrativesSection(input: NarrativeSectionInput): string {
  return narrativesSectionHead(headOf(input)) + input.narratives.map(narrativeSectionBlock).join('');
}

/** §12.3.2 cross-reference to the narratives in §14.3.3. */
export function narrativesCrossReference(input: Omit<NarrativeSectionInput, 'narratives'> & { narratives: Array<Pick<SectionNarrative, 'subjectId'>> }): string {
  const head = { protocolNumber: input.protocolNumber, counts: input.counts, aesiDeclared: input.aesiDeclared, subjects: input.narratives.length };
  const ids = input.narratives.map(n => n.subjectId).join(', ');
  if (!input.narratives.length) return selectionBasis(head);
  return [
    `${selectionBasis(head)} The ${input.narratives.length} narratives are presented in Section 14.3.3, in treatment-group and subject order.`,
    '', `Subjects with a narrative: ${ids}.`,
  ].join('\n');
}
