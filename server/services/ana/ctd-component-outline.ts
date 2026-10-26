/**
 * The CTD Module 2 component outline an AnA composer gives when it has no
 * records to compose from: the outline the template library serves, read from
 * the ICH M2–M5 record, with each briefed heading's full key content and word
 * range, and the template's own limits and basis.
 *
 * - 2.5 Clinical Overview (`draft_clinical_overview_m2_5` with no completed CSR;
 *   D2 cleanup C4a, 2026-10-26): it was six hand-written sections inside the
 *   handler; it carries its 2.7 cross-references (`CITES`).
 * - 2.4 Nonclinical Overview and 2.6 Nonclinical Written and Tabulated
 *   Summaries (`draft_nonclinical_overview_m2_4` / `_summaries_m2_6`, Rule 2
 *   audit S2): until nonclinical studies are recorded against a project they
 *   answer with this outline instead of composing from studies the model wrote.
 *
 * Pure and deterministic apart from reading the served template: no database,
 * no network, no model.
 *
 * @module server/services/ana/ctd-component-outline
 */

import { CTD_AUTHORING_GUIDANCE } from '../ind/ctd/authoring-guidance';
import {
  getDocumentTemplate,
  getRegistryDocumentTemplate,
  type DocumentTemplateStructure,
  type TemplateSection,
} from '../market-specs/document-template-library';

export interface CtdComponentSection {
  number: string;
  title: string;
  guidance: string;
  /** The brief's word range, where the record states one. */
  target_words?: readonly [number, number];
  required: boolean;
  /** The Module 2.7 summary this section cites (2.5 only). */
  cite_from_module?: string;
  subsections?: CtdComponentSection[];
}

/**
 * The 2.7 summary each overview section draws on: the overview is the critical
 * analysis of what 2.7.1–2.7.4 summarize. A platform rule the record states no
 * field for; each target is a heading the record holds.
 */
const CITES: Readonly<Record<string, string>> = { '2.5.2': '2.7.1', '2.5.3': '2.7.2', '2.5.4': '2.7.3', '2.5.5': '2.7.4' };

function toSection(s: TemplateSection, cites: Readonly<Record<string, string>>): CtdComponentSection {
  const brief = CTD_AUTHORING_GUIDANCE[s.number];
  return {
    number: s.number,
    title: s.heading,
    guidance: brief ? `${brief.keyContentElements.join('; ')}.` : s.purpose,
    ...(brief?.wordCountRange ? { target_words: brief.wordCountRange } : {}),
    required: s.required,
    ...(cites[s.number] ? { cite_from_module: cites[s.number] } : {}),
    ...(s.subsections?.length ? { subsections: s.subsections.map((c) => toSection(c, cites)) } : {}),
  };
}

/** A served template's sections, limits and basis. */
export function ctdComponentOutline(template: DocumentTemplateStructure, cites: Readonly<Record<string, string>> = {}): {
  sections: CtdComponentSection[];
  outline_limitations: string[];
  basis: string;
} {
  return {
    sections: template.sections.map((s) => toSection(s, cites)),
    outline_limitations: [...(template.outlineLimitations ?? [])],
    basis: template.basis?.note ?? template.regulatoryBasis ?? '',
  };
}

function servedClinicalOverview(): DocumentTemplateStructure {
  const template = getDocumentTemplate('clinical_overview');
  if (!template) throw new Error('The template library serves no clinical_overview outline.');
  return template;
}

export function clinicalOverviewOutline(): CtdComponentSection[] {
  return ctdComponentOutline(servedClinicalOverview(), CITES).sections;
}

/**
 * The served outline's own limits and basis, which travel with its sections:
 * the briefs describe a marketing-application Clinical Overview, and content
 * scales to the development phase (D2 cleanup C4c: the outline mode served the
 * briefs without them).
 */
export function clinicalOverviewLimits(): { outline_limitations: string[]; basis: string } {
  const { outline_limitations, basis } = ctdComponentOutline(servedClinicalOverview());
  return { outline_limitations, basis };
}

/** The 2.4 or 2.6 outline the template library serves. */
export async function nonclinicalOutline(module: '2.4' | '2.6'): Promise<ReturnType<typeof ctdComponentOutline>> {
  const template = module === '2.4' ? getDocumentTemplate('nonclinical_overview') : await getRegistryDocumentTemplate('ICH_NONCLIN_SUMMARY');
  if (!template) throw new Error(`The template library serves no Module ${module} outline.`);
  return ctdComponentOutline(template);
}
