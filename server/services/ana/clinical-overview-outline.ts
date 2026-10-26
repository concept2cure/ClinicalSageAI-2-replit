/**
 * The Clinical Overview (CTD 2.5) outline `draft_clinical_overview_m2_5` gives
 * when no completed CSR exists to compose from.
 *
 * One record (D2 cleanup C4a, 2026-10-26). This outline was six hand-written
 * sections inside the tool handler: no 2.5.7 Literature References, no
 * 2.5.6.1–2.5.6.5 benefit-risk subdivisions, and guidance and page counts of
 * its own beside the record's briefs. It is now the Clinical Overview the
 * template library serves (`clinical_overview`, read from the ICH M2–M5
 * record), with each briefed heading's full key content and word range.
 *
 * Pure and deterministic: no database, no network, no model.
 *
 * @module server/services/ana/clinical-overview-outline
 */

import { CTD_AUTHORING_GUIDANCE } from '../ind/ctd/authoring-guidance';
import { getDocumentTemplate, type TemplateSection } from '../market-specs/document-template-library';

export interface ClinicalOverviewSection {
  number: string;
  title: string;
  guidance: string;
  /** The brief's word range, where the record states one. */
  target_words?: readonly [number, number];
  required: boolean;
  /** The Module 2.7 summary this section cites. */
  cite_from_module?: string;
  subsections?: ClinicalOverviewSection[];
}

/**
 * The 2.7 summary each overview section draws on: the overview is the critical
 * analysis of what 2.7.1–2.7.4 summarize. A platform rule the record states no
 * field for; each target is a heading the record holds.
 */
const CITES: Readonly<Record<string, string>> = { '2.5.2': '2.7.1', '2.5.3': '2.7.2', '2.5.4': '2.7.3', '2.5.5': '2.7.4' };

function toSection(s: TemplateSection): ClinicalOverviewSection {
  const brief = CTD_AUTHORING_GUIDANCE[s.number];
  return {
    number: s.number,
    title: s.heading,
    guidance: brief ? `${brief.keyContentElements.join('; ')}.` : s.purpose,
    ...(brief?.wordCountRange ? { target_words: brief.wordCountRange } : {}),
    required: s.required,
    ...(CITES[s.number] ? { cite_from_module: CITES[s.number] } : {}),
    ...(s.subsections?.length ? { subsections: s.subsections.map(toSection) } : {}),
  };
}

export function clinicalOverviewOutline(): ClinicalOverviewSection[] {
  const template = getDocumentTemplate('clinical_overview');
  if (!template) throw new Error('The template library serves no clinical_overview outline.');
  return template.sections.map(toSection);
}
